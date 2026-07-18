import { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// How fast each character appears in ms.
// 18ms = ~55 chars/sec — visible typewriter speed even for fast LLM responses.
const CHAR_DELAY_MS = 18;

async function saveInsightToDB(dbId, insight) {
  if (!dbId || !insight) return;
  try {
    await fetch(`${API_URL}/anomaly/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anomalyId: dbId, llmInsight: insight }),
    });
  } catch (err) {
    console.error('Failed to save LLM insight to DB:', err.message);
  }
}

// anomalyEvent  : full event object
// onComplete(id, text) : called when typewriter finishes rendering the full text
export function useLLMStream(anomalyEvent, onComplete) {
  const [displayedText, setDisplayedText] = useState('');
  const [streaming, setStreaming] = useState(false);

  // Raw tokens from the SSE stream are pushed into this queue as individual characters.
  // A separate timer loop drains the queue one character at a time at CHAR_DELAY_MS.
  const charQueue        = useRef([]);
  const timerRef         = useRef(null);
  const renderedRef      = useRef('');   // text currently shown to user
  const fullInsightRef   = useRef('');   // complete raw text from LLM
  const sseRef           = useRef(null); // EventSource
  const streamActiveRef  = useRef(false);// lock: one stream at a time
  const doneSignalRef    = useRef(false);// SSE said done — wait for queue to drain

  // Drains one character from the queue and schedules itself.
  const drainQueue = useCallback(() => {
    if (charQueue.current.length === 0) {
      timerRef.current = null;
      // If the SSE stream already sent "done", fire onComplete now that rendering caught up
      if (doneSignalRef.current) {
        setStreaming(false);
        streamActiveRef.current = false;
        if (onComplete) onComplete(anomalyEvent?.id, fullInsightRef.current);
        saveInsightToDB(anomalyEvent?.dbId, fullInsightRef.current);
        doneSignalRef.current = false;
      }
      return;
    }

    const char = charQueue.current.shift();
    renderedRef.current += char;
    setDisplayedText(renderedRef.current);

    timerRef.current = setTimeout(drainQueue, CHAR_DELAY_MS);
  }, [onComplete, anomalyEvent?.id, anomalyEvent?.dbId]);

  useEffect(() => {
    if (!anomalyEvent?.id) return;

    // Only one stream at a time
    if (streamActiveRef.current) return;

    // Tear down any previous stream/timer
    if (sseRef.current) sseRef.current.close();
    if (timerRef.current) clearTimeout(timerRef.current);

    // Reset all state for fresh event
    charQueue.current      = [];
    renderedRef.current    = '';
    fullInsightRef.current = '';
    doneSignalRef.current  = false;
    streamActiveRef.current = true;

    setDisplayedText('');
    setStreaming(true);

    const params = encodeURIComponent(
      JSON.stringify({
        reading:     anomalyEvent.reading,
        confidence:  anomalyEvent.confidence,
        anomalyType: anomalyEvent.reading?._anomalyType || 'UNKNOWN',
      })
    );

    const source = new EventSource(`${API_URL}/stream/llm-stream?data=${params}`);
    sseRef.current = source;

    source.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);

        if (parsed.token) {
          // Accumulate the full raw text
          fullInsightRef.current += parsed.token;

          // Push every character of this token into the display queue
          for (const char of parsed.token) {
            charQueue.current.push(char);
          }

          // Start the drain timer if not already running
          if (!timerRef.current) {
            timerRef.current = setTimeout(drainQueue, CHAR_DELAY_MS);
          }
        }

        if (parsed.done) {
          source.close();
          // Mark done — drainQueue will fire onComplete once the queue is empty
          doneSignalRef.current = true;
          // If queue is already empty, drainQueue won't run again, so trigger manually
          if (charQueue.current.length === 0 && !timerRef.current) {
            setStreaming(false);
            streamActiveRef.current = false;
            if (onComplete) onComplete(anomalyEvent.id, fullInsightRef.current);
            saveInsightToDB(anomalyEvent.dbId, fullInsightRef.current);
            doneSignalRef.current = false;
          }
        }

        if (parsed.error) {
          console.error('LLM stream error:', parsed.error);
          setStreaming(false);
          streamActiveRef.current = false;
          source.close();
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    source.onerror = () => {
      console.error('SSE connection dropped');
      setStreaming(false);
      streamActiveRef.current = false;
      source.close();
    };

    return () => {
      source.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [anomalyEvent?.id]);

  return { insight: displayedText, streaming };
}
