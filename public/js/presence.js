import { DataMessageType } from './protocol.js';
import { getState, setState } from './state.js';
import { onDataMessage } from './webrtc.js';
import { sanitizeHTML, worldToScreen } from './utils.js';
import { getCamera } from './renderer.js';

const drawingTimeouts = new Map();

export function initPresence() {
  onDataMessage(DataMessageType.DRAWING_STATUS, (msg) => {
    updateDrawingStatus(msg.userId, msg.isDrawing, msg.x, msg.y, msg.nickname, msg.color);
  });
}

export function addUser(userData) {
  const users = [...getState().users];
  if (!users.find(u => u.id === userData.id)) {
    users.push(userData);
    setState('users', users);
  }
}

export function removeUser(userId) {
  const users = getState().users.filter(u => u.id !== userId);
  setState('users', users);
  
  // Clean up drawing label
  const label = document.querySelector(`.drawing-label[data-user="${userId}"]`);
  if (label) label.remove();
  
  if (drawingTimeouts.has(userId)) {
    clearTimeout(drawingTimeouts.get(userId));
    drawingTimeouts.delete(userId);
  }
}

export function getUsers() {
  return [getState().localUser, ...getState().users].filter(u => u && u.id);
}

export function getUser(userId) {
  if (getState().localUser?.id === userId) return getState().localUser;
  return getState().users.find(u => u.id === userId);
}

export function updateDrawingStatus(userId, isDrawing, wx, wy, nickname, color) {
  const layer = document.getElementById('cursors-layer');
  if (!layer) return;

  let label = layer.querySelector(`.drawing-label[data-user="${userId}"]`);
  
  if (isDrawing) {
    if (!label) {
      label = document.createElement('div');
      label.className = 'drawing-label';
      label.dataset.user = userId;
      label.style.position = 'absolute';
      label.style.background = color || '#000';
      label.style.color = 'white';
      label.style.padding = '2px 6px';
      label.style.borderRadius = '4px';
      label.style.fontSize = '12px';
      label.style.pointerEvents = 'none';
      label.style.zIndex = '1000';
      label.style.transition = 'transform 0.1s linear';
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '4px';
      
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.style.fontSize = '14px';
      icon.textContent = 'brush';
      
      const name = document.createElement('span');
      name.textContent = sanitizeHTML(nickname || 'Unknown');
      
      label.appendChild(icon);
      label.appendChild(name);
      layer.appendChild(label);
    }
    
    if (wx !== undefined && wy !== undefined) {
      const camera = getCamera();
      const pos = worldToScreen(wx, wy, camera);
      label.style.transform = `translate(${pos.x}px, ${pos.y - 30}px)`;
    }
    
    if (drawingTimeouts.has(userId)) {
      clearTimeout(drawingTimeouts.get(userId));
    }
    
    drawingTimeouts.set(userId, setTimeout(() => {
      const l = layer.querySelector(`.drawing-label[data-user="${userId}"]`);
      if (l) l.remove();
      drawingTimeouts.delete(userId);
    }, 2000));
    
  } else if (label) {
    label.remove();
    if (drawingTimeouts.has(userId)) {
      clearTimeout(drawingTimeouts.get(userId));
      drawingTimeouts.delete(userId);
    }
  }
}
