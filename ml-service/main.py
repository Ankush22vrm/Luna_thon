import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import uvicorn

from detector import detector

app = FastAPI(
    title="Wearable ML Anomaly Detection Service",
    description="Isolation Forest anomaly detection for wearable sensor data",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AccelerometerData(BaseModel):
    x: float
    y: float
    z: float


class SensorReading(BaseModel):
    id:             str
    timestamp:      int
    deviceId:       str
    heartRate:      float = Field(..., ge=0, le=300)
    spo2:           float = Field(..., ge=50, le=100)
    accelerometer:  AccelerometerData
    accelMagnitude: float
    _anomalyType:   Optional[str] = None


@app.get("/")
def root():
    return {
        "service":       "Wearable ML Service",
        "status":        "running",
        "model":         "IsolationForest",
        "samples_seen":  detector.total_seen,
        "model_fitted":  detector.fitted,
    }


@app.get("/health")
def health():
    return {
        "status":         "ok",
        "model_fitted":   detector.fitted,
        "samples_seen":   detector.total_seen,
        "buffer_size":    len(detector.buffer),
        "in_warmup":      detector.total_seen < int(os.getenv("WARMUP_SAMPLES", "50")),
    }


@app.post("/detect")
def detect(reading: SensorReading):
    """
    Receives one sensor reading from the Node.js backend.
    Returns: { anomaly: bool, confidence: float, status: str, ... }
    """
    try:
        result = detector.predict(reading.model_dump())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats")
def stats():
    return {
        "total_seen":     detector.total_seen,
        "buffer_size":    len(detector.buffer),
        "max_buffer":     detector.buffer.maxlen,
        "model_fitted":   detector.fitted,
        "contamination":  float(os.getenv("CONTAMINATION", "0.05")),
        "warmup_samples": int(os.getenv("WARMUP_SAMPLES", "50")),
    }


if __name__ == "__main__":
    port = int(os.getenv("ML_PORT", "8000"))
    print(f"[ML] Service starting on http://localhost:{port}")
    print(f"[ML] IsolationForest | contamination={os.getenv('CONTAMINATION', '0.05')} | warmup={os.getenv('WARMUP_SAMPLES', '50')} samples")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
