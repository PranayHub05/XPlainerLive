import { MessageType, createMessage, parseMessage } from './protocol.js';
import { setState } from './state.js';

let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
let intentionalClose = false;
const listeners = new Map();

export function getWSUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3000';
  return `${protocol}//${host}/ws`;
}

export function connectWS(url) {
  intentionalClose = false;
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return ws;
  }
  
  try {
    ws = new WebSocket(url);
  } catch (error) {
    console.error('Failed to create WebSocket', error);
    return null;
  }

  ws.onopen = () => {
    setState('connection.ws', 'connected');
    reconnectAttempts = 0;
    console.log('WebSocket connected');
  };

  ws.onclose = () => {
    if (!intentionalClose) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000) + Math.random() * 1000;
      setState('connection.ws', 'reconnecting');
      console.log(`WebSocket closed. Reconnecting in ${Math.round(delay)}ms (Attempt ${reconnectAttempts + 1})`);
      
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectTimer = setTimeout(() => {
          reconnectAttempts++;
          connectWS(url);
        }, delay);
      } else {
        setState('connection.ws', 'disconnected');
        console.error('Max WebSocket reconnect attempts reached');
      }
    } else {
      setState('connection.ws', 'disconnected');
      console.log('WebSocket intentionally closed');
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onmessage = (event) => {
    const msg = parseMessage(event.data);
    if (!msg) return;
    
    const typeListeners = listeners.get(msg.type);
    if (typeListeners) {
      typeListeners.forEach(callback => {
        try {
          callback(msg.payload || msg);
        } catch (err) {
          console.error(`Error in WebSocket listener for ${msg.type}:`, err);
        }
      });
    }
  };

  return ws;
}

export function sendWS(type, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const message = createMessage(type, payload);
    ws.send(message);
    return true;
  }
  console.warn('Cannot send WS message, socket not open');
  return false;
}

export function disconnectWS() {
  intentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

export function onWSMessage(type, callback) {
  if (!listeners.has(type)) {
    listeners.set(type, new Set());
  }
  listeners.get(type).add(callback);
  
  return () => offWSMessage(type, callback);
}

export function offWSMessage(type, callback) {
  const typeListeners = listeners.get(type);
  if (typeListeners) {
    typeListeners.delete(callback);
    if (typeListeners.size === 0) {
      listeners.delete(type);
    }
  }
}

export function getWSState() {
  if (!ws) return 'CLOSED';
  switch (ws.readyState) {
    case WebSocket.CONNECTING: return 'CONNECTING';
    case WebSocket.OPEN: return 'OPEN';
    case WebSocket.CLOSING: return 'CLOSING';
    case WebSocket.CLOSED: return 'CLOSED';
    default: return 'UNKNOWN';
  }
}
