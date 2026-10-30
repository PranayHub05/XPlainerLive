import { MessageType } from './protocol.js';
import { getState, setState, resetState, subscribe } from './state.js';
import { connectWS, sendWS, getWSUrl, onWSMessage, disconnectWS } from './websocket.js';
import { initWebRTC, closeAllPeers, createPeerConnection } from './webrtc.js';
import { showModal, hideModal, showView, showToast } from './ui.js';
import { setupWorkspace } from './app.js';
import { getTimestamp } from './utils.js';

let unsubs = [];

export function createRoom(directNickname) {
  let nickname = typeof directNickname === 'string' ? directNickname.trim() : '';
  
  if (!nickname) {
    const inlineInput = document.getElementById('landing-creator-nickname');
    if (inlineInput && inlineInput.value.trim()) {
      nickname = inlineInput.value.trim();
    }
  }

  if (nickname) {
    proceedCreate(nickname);
  } else {
    showModal('nickname-modal');
    const input = document.getElementById('creator-nickname-input');
    if (input) {
      input.value = localStorage.getItem('xplainer_nickname') || '';
      input.focus();
    }
    const submitBtn = document.getElementById('creator-nickname-submit');
    if (submitBtn) {
      submitBtn.onclick = (e) => {
        if (e) e.preventDefault();
        const nick = input ? input.value.trim() : '';
        if (nick) {
          hideModal('nickname-modal');
          proceedCreate(nick);
        }
      };
    }
  }
}

function proceedCreate(nickname) {
  setState('localUser.nickname', nickname);
  localStorage.setItem('xplainer_nickname', nickname);
  
  const url = getWSUrl();
  connectWS(url);
  
  const onJoined = (payload) => {
    setState('room.code', payload.roomCode);
    setState('localUser.id', payload.userId);
    setState('localUser.color', payload.color);
    setState('room.hostId', payload.hostId);
    const normalizedUsers = (payload.users || []).map(u => ({
      id: u.id || u.userId,
      userId: u.id || u.userId,
      nickname: u.nickname,
      color: u.color
    }));
    setState('users', normalizedUsers);
    
    initWebRTC();
    setupWorkspace();
    window.history.pushState({}, '', `/?room=${payload.roomCode}`);
    setupRoomListeners();
  };
  
  const unsub = onWSMessage(MessageType.ROOM_JOINED, onJoined);
  unsubs.push(unsub);
  
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
}

export function joinRoom(code, nickname) {
  code = code.toUpperCase();
  setState('localUser.nickname', nickname);
  localStorage.setItem('xplainer_nickname', nickname);
  
  const url = getWSUrl();
  connectWS(url);
  
  const onJoined = (payload) => {
    setState('room.code', payload.roomCode);
    setState('localUser.id', payload.userId);
    setState('localUser.color', payload.color);
    setState('room.hostId', payload.hostId);
    const normalizedUsers = (payload.users || []).map(u => ({
      id: u.id || u.userId,
      userId: u.id || u.userId,
      nickname: u.nickname,
      color: u.color
    }));
    setState('users', normalizedUsers);
    
    initWebRTC();
    setupWorkspace();
    window.history.pushState({}, '', `/?room=${payload.roomCode}`);
    setupRoomListeners();
    
    if (normalizedUsers.length > 0) {
      const localId = payload.userId;
      normalizedUsers.forEach(u => {
        const otherId = u.id || u.userId;
        if (otherId !== localId && localId < otherId) {
          createPeerConnection(otherId, true);
        }
      });
    }
  };
  
  const onError = (payload) => {
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
    showToast(`User left`, 'info');
  }));

  unsubs.push(onWSMessage(MessageType.ROOM_HOST, (payload) => {
    setState('room.hostId', payload.hostId);
    if (payload.hostId === getState().localUser.id) {
      showToast('You are now the host', 'success');
    }
  }));
}

export function leaveRoom() {
  closeAllPeers();
  disconnectWS();
  unsubs.forEach(u => u());
  unsubs = [];
  
  resetState();
  showView('landing-view');
  window.history.pushState({}, '', '/');
  import('./background.js').then(bg => bg.startBackground());
}

export function shareRoom() {
  const url = window.location.href;
  const code = getState().room?.code;
  
  if (navigator.share) {
    navigator.share({
      title: 'XPlainerLive',
      text: `Join my whiteboard with code ${code}!`,
      url: url
    }).catch(console.error);
  } else {
    navigator.clipboard.writeText(url)
      .then(() => showToast('Link copied to clipboard', 'success'))
      .catch(() => showToast('Failed to copy link', 'error'));
  }
}

export function isHost() {
  const state = getState();
  return state.room?.hostId === state.localUser?.id;
}
