import { MessageType, createMessage, parseMessage } from './protocol.js';
import { getState, setState } from './state.js';

let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 15;
let intentionalClose = false;
const listeners = new Map();

export function getWSUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let host = window.location.host;
  if (!host || host === '' || window.location.protocol === 'file:') {
    host = 'localhost:3000';
  }
  return `${protocol}//${host}/ws`;
}

export function connectWS(url) {
  if (!url) url = getWSUrl();
  intentionalClose = false;

  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return ws;
  }
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  setState('connection.ws', 'connecting');

  try {
    ws = new WebSocket(url);
  } catch (error) {
    console.error('Failed to create WebSocket', error);
    setState('connection.ws', 'disconnected');
    return null;
  }

  ws.onopen = () => {
    setState('connection.ws', 'connected');
    reconnectAttempts = 0;
    console.log('WebSocket connected');
    
    // Auto-rejoin if currently inside an active room
    const state = getState();
    if (state.room?.code && state.localUser?.nickname) {
      sendWS(MessageType.ROOM_JOIN, {
        roomCode: state.room.code,
        nickname: state.localUser.nickname
      });
    }
  };

  ws.onclose = (event) => {
    if (!intentionalClose) {
      const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 15000);
      setState('connection.ws', 'reconnecting');
      console.log(`WebSocket disconnected. Reconnecting in ${Math.round(delay)}ms (Attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
      
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
    console.error('WebSocket connection error:', error);
  };

  ws.onmessage = (event) => {
    const raw = typeof event.data === 'string' ? event.data : event.data.toString();
    const msg = parseMessage(raw);
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
  console.warn(`Cannot send WS message (${type}), socket not open (state: ${ws ? ws.readyState : 'null'})`);
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
  setState('connection.ws', 'disconnected');
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
