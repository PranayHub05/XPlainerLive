import { DataMessageType } from './protocol.js';
import { getState } from './state.js';
import { sendToAllPeers, onDataMessage } from './webrtc.js';
import { worldToScreen, sanitizeHTML } from './utils.js';
import { getCamera } from './renderer.js';
import { onLocalCursorMove } from './tools.js';

let broadcastActive = false;
const cursorTimeouts = new Map();

export function initCursorSync() {
  onDataMessage(DataMessageType.CURSOR_UPDATE, (msg) => {
    updateRemoteCursor(msg);
  });
  
  onLocalCursorMove((pos) => {
    if (!broadcastActive) return;
    
    const state = getState();
    sendToAllPeers(DataMessageType.CURSOR_UPDATE, {
      x: pos.x,
      y: pos.y,
      nickname: state.localUser.nickname,
      color: state.localUser.color,
      tool: state.ui.currentTool
    });
  });
}

export function updateRemoteCursor(data) {
  const { userId, x, y, nickname, color, tool } = data;
  if (!userId) return;
  
  const layer = document.getElementById('cursors-layer');
  if (!layer) return;
  
  let cursor = layer.querySelector(`.remote-cursor[data-user-id="${userId}"]`);
  
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.className = 'remote-cursor';
    cursor.dataset.userId = userId;
    cursor.style.position = 'absolute';
    cursor.style.top = '0';
    cursor.style.left = '0';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '900';
    cursor.style.transition = 'transform 100ms linear';
    cursor.style.transformOrigin = '0 0';
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'cursor-icon');
    svg.style.width = '16px';
    svg.style.height = '16px';
    svg.style.fill = color || '#000';
    svg.style.filter = 'drop-shadow(1px 1px 2px rgba(0,0,0,0.3))';
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 0l16 12-7.5 1.5 4 8.5-3 1.5-4-8.5-5.5 5.5v-20z');
    svg.appendChild(path);
    
    const label = document.createElement('div');
    label.className = 'remote-cursor-label';
    label.style.background = color || '#000';
    label.style.color = 'white';
    label.style.padding = '2px 6px';
    label.style.borderRadius = '4px';
    label.style.fontSize = '12px';
    label.style.marginTop = '4px';
    label.style.whiteSpace = 'nowrap';
    label.textContent = sanitizeHTML(nickname || 'User');
    
    cursor.appendChild(svg);
    cursor.appendChild(label);
    layer.appendChild(cursor);
  }
  
  const camera = getCamera();
  if (camera && x !== undefined && y !== undefined) {
    const screenPos = worldToScreen(x, y, camera);
    cursor.style.transform = `translate(${screenPos.x}px, ${screenPos.y}px)`;
  }
  
  if (cursorTimeouts.has(userId)) {
    clearTimeout(cursorTimeouts.get(userId));
  }
  
  cursorTimeouts.set(userId, setTimeout(() => {
    removeRemoteCursor(userId);
  }, 5000));
}

export function removeRemoteCursor(userId) {
  const layer = document.getElementById('cursors-layer');
  if (layer) {
    const cursor = layer.querySelector(`.remote-cursor[data-user-id="${userId}"]`);
    if (cursor) {
      cursor.remove();
    }
  }
  
  if (cursorTimeouts.has(userId)) {
    clearTimeout(cursorTimeouts.get(userId));
    cursorTimeouts.delete(userId);
  }
}

export function startCursorBroadcast() {
  broadcastActive = true;
}

export function stopCursorBroadcast() {
  broadcastActive = false;
}
