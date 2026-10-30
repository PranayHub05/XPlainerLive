import { MessageType } from './protocol.js';
import { getState, setState, resetState, subscribe } from './state.js';
import { connectWS, sendWS, getWSUrl, onWSMessage, disconnectWS } from './websocket.js';
import { initWebRTC, closeAllPeers, createPeerConnection } from './webrtc.js';
import { showModal, hideModal, showView, showToast } from './ui.js';
import { setupWorkspace } from './app.js';
import { getTimestamp, getRandomNickname, generateRoomCode, generateUserId, generateColor } from './utils.js';

let unsubs = [];
let pendingFallbackTimer = null;

export function createRoom(directNickname) {
  let nickname = typeof directNickname === 'string' ? directNickname.trim() : '';
  
  if (!nickname) {
    const heroInput = document.getElementById('hero-name-input');
    if (heroInput && heroInput.value.trim()) {
      nickname = heroInput.value.trim();
    }
  }

  if (!nickname) {
    const inlineInput = document.getElementById('landing-creator-nickname');
    if (inlineInput && inlineInput.value.trim()) {
      nickname = inlineInput.value.trim();
    }
  }

  if (!nickname) {
    nickname = localStorage.getItem('xplainer_nickname') || getRandomNickname();
  }

  proceedCreate(nickname);
}

function proceedCreate(nickname) {
  showToast('Starting whiteboard...', 'info', 1800);
  setState('localUser.nickname', nickname);
  localStorage.setItem('xplainer_nickname', nickname);
  
  let hasTransitioned = false;

  const enterWorkspace = (roomCode, userId, color, hostId, users, isOffline = false) => {
    if (hasTransitioned) return;
    hasTransitioned = true;
    
    if (pendingFallbackTimer) {
      clearTimeout(pendingFallbackTimer);
      pendingFallbackTimer = null;
    }

    setState('room.code', roomCode);
    setState('localUser.id', userId);
    setState('localUser.color', color);
    setState('room.hostId', hostId);
    setState('users', users);
    
    initWebRTC();
    setupWorkspace();
    window.history.pushState({}, '', `/?room=${roomCode}`);
    setupRoomListeners();

    if (isOffline) {
      showToast('Whiteboard ready! (Start node server for live peer sync)', 'success', 3500);
    } else {
      showToast(`Room ${roomCode} created!`, 'success', 2500);
    }
  };

  // Attempt live WebSocket connection
  const url = getWSUrl();
  connectWS(url);
  
  const onJoined = (payload) => {
    const normalizedUsers = (payload.users || []).map(u => ({
      id: u.id || u.userId,
      userId: u.id || u.userId,
      nickname: u.nickname,
      color: u.color
    }));
    enterWorkspace(payload.roomCode, payload.userId, payload.color, payload.hostId, normalizedUsers, false);
  };
  
  const unsubJoined = onWSMessage(MessageType.ROOM_JOINED, onJoined);
  unsubs.push(unsubJoined);
  
  const sendCreate = () => {
    sendWS(MessageType.ROOM_CREATE, { nickname });
  };
  
  if (getState().connection?.ws === 'connected') {
    sendCreate();
  } else {
    const unsubConn = subscribe('connection.ws', (val) => {
      if (val === 'connected') {
        sendCreate();
        unsubConn();
      }
    });
    unsubs.push(unsubConn);
  }

  // Resilient fallback: If server doesn't respond in 650ms, open local whiteboard immediately
  pendingFallbackTimer = setTimeout(() => {
    if (!hasTransitioned) {
      console.log('Server not responding immediately, launching offline/local whiteboard.');
      const localCode = generateRoomCode();
      const localId = generateUserId();
      const localColor = '#1558C9';
      const localUser = { id: localId, userId: localId, nickname, color: localColor };
      enterWorkspace(localCode, localId, localColor, localId, [localUser], true);
    }
  }, 650);
}

export function joinRoom(code, nickname) {
  code = (code || '').toUpperCase().trim();
  
  if (!code || code.length !== 6) {
    showToast('Please enter a valid 6-character room code', 'error');
    return;
  }

  if (!nickname) {
    const heroInput = document.getElementById('hero-name-input');
    if (heroInput && heroInput.value.trim()) {
      nickname = heroInput.value.trim();
    }
  }

  if (!nickname) {
    const inlineInput = document.getElementById('landing-join-nickname');
    if (inlineInput && inlineInput.value.trim()) {
      nickname = inlineInput.value.trim();
    }
  }

  if (!nickname) {
    nickname = localStorage.getItem('xplainer_nickname') || getRandomNickname();
  }

  showToast(`Joining room ${code}...`, 'info', 1800);
  setState('localUser.nickname', nickname);
  localStorage.setItem('xplainer_nickname', nickname);
  
  let hasTransitioned = false;

  const enterWorkspace = (roomCode, userId, color, hostId, users, isOffline = false) => {
    if (hasTransitioned) return;
    hasTransitioned = true;

    if (pendingFallbackTimer) {
      clearTimeout(pendingFallbackTimer);
      pendingFallbackTimer = null;
    }

    setState('room.code', roomCode);
    setState('localUser.id', userId);
    setState('localUser.color', color);
    setState('room.hostId', hostId);
    setState('users', users);
    
    initWebRTC();
    setupWorkspace();
    window.history.pushState({}, '', `/?room=${roomCode}`);
    setupRoomListeners();

    if (isOffline) {
      showToast(`Joined whiteboard ${roomCode} (Local mode)`, 'info', 3000);
    } else {
      showToast(`Connected to room ${roomCode}!`, 'success', 2500);
    }
    
    // Connect WebRTC with existing peers
    if (!isOffline && users && users.length > 0) {
      const localId = userId;
      users.forEach(u => {
        const otherId = u.id || u.userId;
        if (otherId !== localId && localId < otherId) {
          createPeerConnection(otherId, true);
        }
      });
    }
  };

  const url = getWSUrl();
  connectWS(url);
  
  const onJoined = (payload) => {
    const normalizedUsers = (payload.users || []).map(u => ({
      id: u.id || u.userId,
      userId: u.id || u.userId,
      nickname: u.nickname,
      color: u.color
    }));
    enterWorkspace(payload.roomCode, payload.userId, payload.color, payload.hostId, normalizedUsers, false);
  };
  
  const onError = (payload) => {
    if (pendingFallbackTimer) {
      clearTimeout(pendingFallbackTimer);
      pendingFallbackTimer = null;
    }
    showToast(payload.message || 'Error joining room', 'error');
    disconnectWS();
  };
  
  unsubs.push(onWSMessage(MessageType.ROOM_JOINED, onJoined));
  unsubs.push(onWSMessage(MessageType.ROOM_ERROR, onError));
  
  const sendJoin = () => {
    sendWS(MessageType.ROOM_JOIN, { roomCode: code, nickname });
  };
  
  if (getState().connection?.ws === 'connected') {
    sendJoin();
  } else {
    const unsubConn = subscribe('connection.ws', (val) => {
      if (val === 'connected') {
        sendJoin();
        unsubConn();
      }
    });
    unsubs.push(unsubConn);
  }

  // Fallback if server is not running: still let user into the board with the given code
  pendingFallbackTimer = setTimeout(() => {
    if (!hasTransitioned) {
      console.log('Server unreachable for room join, entering in local mode.');
      const localId = generateUserId();
      const localColor = '#F4FF24';
      const localUser = { id: localId, userId: localId, nickname, color: localColor };
      enterWorkspace(code, localId, localColor, localId, [localUser], true);
    }
  }, 900);
}

function setupRoomListeners() {
  unsubs.push(onWSMessage(MessageType.USER_JOINED, (payload) => {
    const peerId = payload.id || payload.userId;
    const currentUsers = Array.isArray(getState().users) ? getState().users : [];
    if (!currentUsers.some(u => (u.id || u.userId) === peerId)) {
      const newUser = { id: peerId, userId: peerId, nickname: payload.nickname, color: payload.color };
      setState('users', [...currentUsers, newUser]);
    }
    showToast(`${payload.nickname} joined`, 'info');
  }));

  unsubs.push(onWSMessage(MessageType.USER_LEFT, (payload) => {
    const peerId = payload.userId || payload.id;
    const currentUsers = Array.isArray(getState().users) ? getState().users : [];
    setState('users', currentUsers.filter(u => (u.id || u.userId) !== peerId));
    showToast(`A participant left`, 'info');
  }));

  unsubs.push(onWSMessage(MessageType.ROOM_HOST, (payload) => {
    setState('room.hostId', payload.hostId);
    if (payload.hostId === getState().localUser.id) {
      showToast('You are now the room host', 'success');
    }
  }));
}

export function leaveRoom() {
  if (pendingFallbackTimer) {
    clearTimeout(pendingFallbackTimer);
    pendingFallbackTimer = null;
  }
  closeAllPeers();
  disconnectWS();
  unsubs.forEach(u => u());
  unsubs = [];
  
  resetState();
  showView('landing-view');
  window.history.pushState({}, '', '/');
  import('./background.js').then(bg => bg.startBackground());
  showToast('Left whiteboard', 'info', 1800);
}

export function shareRoom() {
  const url = window.location.href;
  const code = getState().room?.code;
  
  if (navigator.share) {
    navigator.share({
      title: 'XplainerLive Whiteboard',
      text: `Join my whiteboard with code ${code}!`,
      url: url
    }).catch(console.error);
  } else {
    navigator.clipboard.writeText(url)
      .then(() => showToast('Share link copied to clipboard!', 'success'))
      .catch(() => showToast('Failed to copy link', 'error'));
  }
}

export function isHost() {
  const state = getState();
  return state.room?.hostId === state.localUser?.id;
}
