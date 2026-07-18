const OpenAI = require('openai');

// Uses the openai SDK with Groq's OpenAI-compatible API
// Same streaming interface, just a different baseURL
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// Builds the prompt sent to the LLM for each anomaly
function buildPrompt(reading, confidence, anomalyType) {
  return `You are a clinical health monitoring assistant.

A wearable sensor has detected an anomaly with ${(confidence * 100).toFixed(1)}% confidence.

Sensor readings at time of anomaly:
- Heart Rate: ${reading.heartRate} bpm
- SpO2 (Blood Oxygen): ${reading.spo2}%
- Accelerometer Magnitude: ${reading.accelMagnitude} G
- Anomaly Type: ${anomalyType || 'UNKNOWN'}
- Device: ${reading.deviceId}
- Time: ${new Date(reading.timestamp).toISOString()}

Write 2 short sentences:
1. What this anomaly likely means clinically.
2. What action the user should consider.

Be clear, direct, and non-alarmist.`;
}

// Streams the LLM response token by token into the HTTP response using SSE.
// The caller (route handler) passes in the Express res object.
async function streamInsight(reading, confidence, anomalyType, res) {
  // Set SSE headers before writing any data
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const prompt = buildPrompt(reading, confidence, anomalyType);

  try {
    const stream = await client.chat.completions.create({
      model: MODEL,
      stream: true,
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    });

    // Write each token as an SSE event as it arrives
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    }

    // Signal the client that streaming is done
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('LLM streaming error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
}

module.exports = { streamInsight };
