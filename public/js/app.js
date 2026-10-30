import { getState, setState } from './state.js';
import { initUI, showView, showModal } from './ui.js';
import { joinRoom } from './room.js';
import { initWhiteboard, onBoardOperation, getBoardData, setObjectsFromSync, addObject, updateObject, deleteObject, moveObject, clearBoard } from './whiteboard.js';
import { initTools, onDrawingStatusChange } from './tools.js';
import { initHistory } from './history.js';
import { initRenderer } from './renderer.js';
import { sendToAllPeers, onDataMessage } from './webrtc.js';
import { DataMessageType, MessageType } from './protocol.js';
import { onWSMessage } from './websocket.js';
import { startCursorBroadcast, stopCursorBroadcast, initCursorSync } from './cursor.js';
import { initPresence, updateDrawingStatus } from './presence.js';
import { setChatOpen } from './chat.js';
import { initBackground, stopBackground } from './background.js';

let isInitialized = false;

export function init() {
  if (isInitialized) return;
  isInitialized = true;

  console.log('XPlainerLive initializing...');
  
  // Load preferences
  const savedGrid = localStorage.getItem('xplainer_grid');
  if (savedGrid !== null) {
    setState('board.gridEnabled', savedGrid === 'true');
  }
  
  const savedChat = localStorage.getItem('xplainer_chat_open');
  if (savedChat !== null) {
    setChatOpen(savedChat === 'true');
  }

  initUI();
  initBackground();
  
  // Check URL params
  const urlParams = new URLSearchParams(window.location.search);
  const roomCode = urlParams.get('room');
  
  if (roomCode) {
    showModal('join-modal');
    const inputs = document.querySelectorAll('#join-code-container .join-code-input');
    roomCode.toUpperCase().split('').forEach((char, i) => {
      if (inputs[i]) inputs[i].value = char;
    });
  } else {
    showView('landing-view');
  }
  
  window.onerror = (msg, url, lineNo, columnNo, error) => {
    import('./ui.js').then(module => {
      module.showToast('An error occurred. See console for details.', 'error');
    });
    return false;
  };
  
  window.addEventListener('beforeunload', (e) => {
    if (getState().connection?.ws === 'connected' && getState().room?.code) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  console.log('XPlainerLive ready');
}

export function setupWorkspace() {
  stopBackground();
  showView('workspace-view');
  
  const canvasContainer = document.getElementById('canvas-container');
  const canvas = document.getElementById('whiteboard-canvas');
  
  initWhiteboard(canvasContainer);
  initRenderer(canvas, canvasContainer);
  initTools(canvas, canvasContainer);
  initHistory();
  initCursorSync();
  initPresence();
  
  // Handlers for local actions -> send to peers
  onBoardOperation((op) => {
    sendToAllPeers(DataMessageType.BOARD_OP, op);
  });
  
  onDrawingStatusChange((status) => {
    sendToAllPeers(DataMessageType.DRAWING_STATUS, status);
  });
  
  startCursorBroadcast();
  
  // Handlers for remote actions from peers
  onDataMessage(DataMessageType.BOARD_OP, (msg) => {
    const opType = msg.opType || msg.type;
    const { objectId, data } = msg;
    // Apply remotely, do NOT push to local history stack
    switch (opType) {
      case 'create':
        if (data) addObject(data, false);
        break;
      case 'update':
      case 'style':
        updateObject(objectId, data, false);
        break;
      case 'delete':
        deleteObject(objectId, false);
        break;
      case 'move':
        if (data) moveObject(objectId, data.dx, data.dy, false);
        break;
    }
  });
  
  // Host clears board
  onWSMessage(MessageType.BOARD_CLEAR, () => {
    clearBoard(false);
  });
}

// Auto-run when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
}
