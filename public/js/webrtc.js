import { MessageType, DataMessageType, createMessage, parseMessage } from './protocol.js';
import { getState, setState } from './state.js';
import { onWSMessage, sendWS } from './websocket.js';
import { getBoardData, setObjectsFromSync } from './whiteboard.js';
import { requestRender } from './renderer.js';

const peers = new Map();
const dataListeners = new Map();

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export function initWebRTC() {
  onWSMessage(MessageType.WEBRTC_OFFER, handleOffer);
  onWSMessage(MessageType.WEBRTC_ANSWER, handleAnswer);
  onWSMessage(MessageType.WEBRTC_ICE, handleICE);
  onWSMessage(MessageType.USER_JOINED, handleUserJoined);
  onWSMessage(MessageType.USER_LEFT, handleUserLeft);
}

export function createPeerConnection(targetUserId, isInitiator) {
  const pc = new RTCPeerConnection({ iceServers });
  
  const peerObj = {
    connection: pc,
    dataChannel: null,
    state: 'new'
  };
  peers.set(targetUserId, peerObj);
  
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendWS(MessageType.WEBRTC_ICE, {
        to: targetUserId,
        target: targetUserId,
        candidate: event.candidate
      });
    }
  };

  pc.onconnectionstatechange = () => {
    peerObj.state = pc.connectionState;
    console.log(`Peer ${targetUserId} state: ${pc.connectionState}`);
    
    setState(`connection.peers.${targetUserId}`, pc.connectionState);
  };

  if (isInitiator) {
    const channel = pc.createDataChannel('xplainer', { ordered: true });
    setupDataChannel(channel, peerObj, targetUserId);
    
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        sendWS(MessageType.WEBRTC_OFFER, {
          to: targetUserId,
          target: targetUserId,
          offer: pc.localDescription
        });
      })
      .catch(err => console.error('Error creating offer:', err));
  } else {
    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel, peerObj, targetUserId);
    };
  }

  return peerObj;
}

function setupDataChannel(channel, peerObj, targetUserId) {
  peerObj.dataChannel = channel;
  
  channel.onopen = () => {
    peerObj.state = 'connected';
    setState(`connection.peers.${targetUserId}`, 'connected');
    
    const state = getState();
    const isHost = state.room?.hostId === state.localUser?.id;
    
    if (isHost) {
      const boardData = getBoardData();
      sendToPeer(targetUserId, DataMessageType.BOARD_SYNC, boardData);
    } else if (peers.size === 1) {
      sendToPeer(targetUserId, DataMessageType.BOARD_SYNC_REQUEST, {});
    }
  };

  channel.onmessage = (event) => {
    const msg = parseMessage(event.data);
    if (!msg) return;
    
    const typeListeners = dataListeners.get(msg.type);
    if (typeListeners) {
      typeListeners.forEach(cb => {
        try {
          cb(msg);
        } catch (err) {
          console.error(`Error in DataChannel listener for ${msg.type}:`, err);
        }
      });
    }
  };

  channel.onclose = () => {
    peerObj.state = 'closed';
    setState(`connection.peers.${targetUserId}`, 'closed');
  };

  channel.onerror = (err) => console.error(`DataChannel error with ${targetUserId}:`, err);
}

function handleOffer(payload) {
  const { from, offer } = payload;
  if (!from || !offer) return;
  
  const peerObj = createPeerConnection(from, false);
  peerObj.connection.setRemoteDescription(new RTCSessionDescription(offer))
    .then(() => peerObj.connection.createAnswer())
    .then(answer => peerObj.connection.setLocalDescription(answer))
    .then(() => {
      sendWS(MessageType.WEBRTC_ANSWER, {
        to: from,
        target: from,
        answer: peerObj.connection.localDescription
      });
    })
    .catch(err => console.error('Error handling offer:', err));
}

function handleAnswer(payload) {
  const from = payload.from;
  const answer = payload.answer;
  const peerObj = peers.get(from);
  if (peerObj && peerObj.connection) {
    peerObj.connection.setRemoteDescription(new RTCSessionDescription(answer))
      .catch(err => console.error('Error setting remote description:', err));
  }
}

function handleICE(payload) {
  const from = payload.from;
  const candidate = payload.candidate;
  const peerObj = peers.get(from);
  if (peerObj && peerObj.connection) {
    peerObj.connection.addIceCandidate(new RTCIceCandidate(candidate))
      .catch(err => console.error('Error adding ICE candidate:', err));
  }
}

function handleUserJoined(payload) {
  const state = getState();
  const localUserId = state.localUser?.id;
  const peerId = payload.id || payload.userId;
  
  if (!localUserId || !peerId || peerId === localUserId) return;
  
  if (localUserId < peerId) {
    createPeerConnection(peerId, true);
  }
}

function handleUserLeft(payload) {
  const peerId = payload.userId || payload.id;
  if (peerId) {
    closePeerConnection(peerId);
  }
}

export function sendToAllPeers(type, data) {
  const state = getState();
  const localUserId = state.localUser?.id;
  
  const msg = createMessage(type, {
    ...data,
    userId: localUserId,
    timestamp: Date.now()
  });

  peers.forEach((peerObj) => {
    if (peerObj.dataChannel && peerObj.dataChannel.readyState === 'open') {
      try {
        peerObj.dataChannel.send(msg);
      } catch (err) {
        console.error('Error sending data to peer:', err);
      }
    }
  });
}

export function sendToPeer(userId, type, data) {
  const state = getState();
  const localUserId = state.localUser?.id;
  
  const peerObj = peers.get(userId);
  if (peerObj && peerObj.dataChannel && peerObj.dataChannel.readyState === 'open') {
    const msg = createMessage(type, {
      ...data,
      userId: localUserId,
      timestamp: Date.now()
    });
    try {
      peerObj.dataChannel.send(msg);
      return true;
    } catch (err) {
      console.error('Error sending data to peer:', err);
    }
  }
  return false;
}

export function onDataMessage(type, callback) {
  if (!dataListeners.has(type)) {
    dataListeners.set(type, new Set());
  }
  dataListeners.get(type).add(callback);
  
  return () => offDataMessage(type, callback);
}

export function offDataMessage(type, callback) {
  const typeListeners = dataListeners.get(type);
  if (typeListeners) {
    typeListeners.delete(callback);
    if (typeListeners.size === 0) {
      dataListeners.delete(type);
    }
  }
}

export function closePeerConnection(userId) {
  const peerObj = peers.get(userId);
  if (peerObj) {
    if (peerObj.dataChannel) peerObj.dataChannel.close();
    if (peerObj.connection) peerObj.connection.close();
    peers.delete(userId);
    setState(`connection.peers.${userId}`, 'closed');
  }
}

export function closeAllPeers() {
  peers.forEach((peerObj, userId) => {
    closePeerConnection(userId);
  });
  peers.clear();
}

export function getPeers() {
  return new Map(peers);
}
