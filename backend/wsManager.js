const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

// Stores all connected clients as Map<clientId, ws>
const clients = new Map();

function addClient(ws) {
  const clientId = uuidv4();
  clients.set(clientId, ws);
  console.log(`Client connected [${clientId}] - total: ${clients.size}`);

  ws.on('close', () => removeClient(clientId));
  ws.on('error', (err) => {
    console.error(`WebSocket error [${clientId}]:`, err.message);
    removeClient(clientId);
  });

  // Send welcome message to the new client
  safeSend(ws, {
    type: 'CONNECTED',
    clientId,
    message: 'Connected to Wearable Intelligence Dashboard',
    timestamp: Date.now(),
  });

  return clientId;
}

function removeClient(clientId) {
  clients.delete(clientId);
  console.log(`Client disconnected [${clientId}] - total: ${clients.size}`);
}

function safeSend(ws, data) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  } catch (err) {
    console.error('Send error:', err.message);
  }
}

// Sends a message to every connected client
function broadcast(data) {
  if (clients.size === 0) return;

  const payload = JSON.stringify(data);

  clients.forEach((ws, clientId) => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else {
        removeClient(clientId);
      }
    } catch (err) {
      console.error(`Broadcast error [${clientId}]:`, err.message);
      removeClient(clientId);
    }
  });
}

function getClientCount() {
  return clients.size;
}

module.exports = { addClient, broadcast, getClientCount };
