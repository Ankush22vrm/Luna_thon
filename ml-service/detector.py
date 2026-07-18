import os
import numpy as np
from sklearn.ensemble import IsolationForest
from collections import deque

CONTAMINATION  = float(os.getenv("CONTAMINATION", "0.05"))
WARMUP_SAMPLES = int(os.getenv("WARMUP_SAMPLES", "50"))
BUFFER_SIZE    = int(os.getenv("BUFFER_SIZE", "200"))


class AnomalyDetector:
    """
    Streaming Isolation Forest detector.

    Collects readings into a rolling buffer.
    Fits the model after WARMUP_SAMPLES readings.
    Re-trains every 100 new readings after that for online adaptation.

    Features per reading:
      [heartRate, spo2, accel_x, accel_y, accel_z, accelMagnitude]
    """

    def __init__(self):
        self.model = IsolationForest(
            n_estimators=100,
            contamination=CONTAMINATION,
            random_state=42,
            n_jobs=-1,
        )
        self.buffer        = deque(maxlen=BUFFER_SIZE)
        self.fitted        = False
        self.total_seen    = 0
        self.retrain_every = 100

    @staticmethod
    def extract_features(reading: dict) -> list:
        accel = reading.get("accelerometer", {})
        return [
            float(reading.get("heartRate",      75.0)),
            float(reading.get("spo2",           98.0)),
            float(accel.get("x",                0.0)),
            float(accel.get("y",                0.0)),
            float(accel.get("z",                1.0)),
            float(reading.get("accelMagnitude", 1.0)),
        ]

    def predict(self, reading: dict) -> dict:
        features = self.extract_features(reading)
        self.buffer.append(features)
        self.total_seen += 1

        # Not enough data yet - still warming up
        if self.total_seen < WARMUP_SAMPLES:
            return {
                "anomaly":          False,
                "confidence":       0.0,
                "status":           "calibrating",
                "samples_collected": self.total_seen,
                "warmup_needed":    WARMUP_SAMPLES,
            }

        # Fit on first time
        if not self.fitted:
            self._fit()

        # Periodic re-train
        elif (self.total_seen - WARMUP_SAMPLES) % self.retrain_every == 0:
            self._fit()

        X = np.array([features])
        raw_score  = self.model.decision_function(X)[0]
        prediction = self.model.predict(X)[0]
        is_anomaly = (prediction == -1)

        # Normalize to 0-1 where 1 = most anomalous
        confidence = float(np.clip(0.5 - raw_score, 0.0, 1.0))

        return {
            "anomaly":      bool(is_anomaly),
            "confidence":   round(confidence, 4),
            "raw_score":    round(float(raw_score), 6),
            "status":       "active",
            "samples_seen": self.total_seen,
        }

    def _fit(self):
        X = np.array(list(self.buffer))
        self.model.fit(X)
        self.fitted = True
        print(f"[ML] Model trained on {len(X)} samples - total seen: {self.total_seen}")


# Single shared instance for all requests
detector = AnomalyDetector()
