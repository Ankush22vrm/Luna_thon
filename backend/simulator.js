const { v4: uuidv4 } = require('uuid');

// Box-Muller: returns a random number from a normal distribution
function gaussianRandom(mean, std) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Returns a normal (non-anomalous) reading
function generateNormalReading() {
  return {
    heartRate: clamp(gaussianRandom(75, 6), 55, 105),
    spo2: clamp(gaussianRandom(98.2, 0.6), 94, 100),
    accelerometer: {
      x: gaussianRandom(0, 0.3),
      y: gaussianRandom(0, 0.3),
      z: gaussianRandom(1.0, 0.2), // z ~= 1g at rest
    },
  };
}

// Injects one of four anomaly patterns
function generateAnomalyReading() {
  const type = Math.floor(Math.random() * 4);
  const base = generateNormalReading();

  switch (type) {
    case 0:
      return { ...base, heartRate: clamp(gaussianRandom(135, 10), 120, 180), _anomalyType: 'TACHYCARDIA' };
    case 1:
      return { ...base, heartRate: clamp(gaussianRandom(45, 5), 30, 55), _anomalyType: 'BRADYCARDIA' };
    case 2:
      return { ...base, spo2: clamp(gaussianRandom(89, 2), 82, 93), _anomalyType: 'SPO2_DESATURATION' };
    case 3:
      return {
        ...base,
        accelerometer: {
          x: gaussianRandom(0, 2.5),
          y: gaussianRandom(0, 2.5),
          z: gaussianRandom(0, 2.5),
        },
        _anomalyType: 'HIGH_MOTION',
      };
    default:
      return base;
  }
}

function generateReading() {
  const injectRate = parseFloat(process.env.ANOMALY_INJECT_RATE || '0.04');
  const isAnomaly = Math.random() < injectRate;
  const data = isAnomaly ? generateAnomalyReading() : generateNormalReading();

  const mag = Math.sqrt(
    data.accelerometer.x ** 2 +
    data.accelerometer.y ** 2 +
    data.accelerometer.z ** 2
  );

  return {
    id: uuidv4(),
    timestamp: Date.now(),
    deviceId: 'WEAR-001',
    heartRate: parseFloat(data.heartRate.toFixed(1)),
    spo2: parseFloat(data.spo2.toFixed(2)),
    accelerometer: {
      x: parseFloat(data.accelerometer.x.toFixed(4)),
      y: parseFloat(data.accelerometer.y.toFixed(4)),
      z: parseFloat(data.accelerometer.z.toFixed(4)),
    },
    accelMagnitude: parseFloat(mag.toFixed(4)),
    _anomalyType: data._anomalyType || null,
  };
}

module.exports = { generateReading };
