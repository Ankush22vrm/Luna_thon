import { createRoot } from 'react-dom/client';
import './style.css';
import App from './App.jsx';

// StrictMode removed intentionally:
// In development, StrictMode mounts components twice which creates two WebSocket
// connections to the backend. Both receive every ANOMALY_DETECTED broadcast,
// causing each anomaly to appear twice in the queue and history.
createRoot(document.getElementById('root')).render(<App />);
