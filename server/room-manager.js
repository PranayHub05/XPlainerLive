const crypto = require('crypto');

const MessageType = {
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_JOINED: 'room:joined',
  ROOM_ERROR: 'room:error',
  USER_JOINED: 'user:joined',
  USER_LEFT: 'user:left',
  WEBRTC_OFFER: 'webrtc:offer',
  WEBRTC_ANSWER: 'webrtc:answer',
  WEBRTC_ICE: 'webrtc:ice',
  CHAT_MESSAGE: 'chat:message',
  ROOM_HOST: 'room:host',
  BOARD_CLEAR: 'board:clear'
};

const rooms = new Map();
const connections = new Map();

const PALETTE = ['#F4FF24', '#1558C9', '#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#f87171', '#2dd4bf', '#818cf8'];

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateUserId() {
  return 'user_' + crypto.randomBytes(4).toString('hex');
}

function generateColor(existingColors = []) {
  const available = PALETTE.filter(c => !existingColors.includes(c));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

function sendTo(ws, type, payload) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type, ...payload, timestamp: Date.now() }));
  }
}

function broadcast(roomCode, type, payload, excludeWs = null, wss) {
  const room = rooms.get(roomCode);
  if (!room) return;

  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === 1) {
      const connData = connections.get(client);
      if (connData && connData.roomCode === roomCode) {
        sendTo(client, type, payload);
      }
    }
  });
}

function findWsByUserId(roomCode, userId, wss) {
  for (let client of wss.clients) {
    const connData = connections.get(client);
    if (connData && connData.roomCode === roomCode && connData.id === userId) {
      return client;
    }
  }
  return null;
}

function handleMessage(ws, message, wss) {
  const { type, ...payload } = message;

  switch (type) {
    case MessageType.ROOM_CREATE: {
      const nickname = payload.nickname || 'Anonymous';
      const roomCode = generateRoomCode();
      const userId = generateUserId();
      const color = generateColor();

      const users = new Map();
      users.set(ws.connId, { id: userId, nickname, color });

      rooms.set(roomCode, {
        code: roomCode,
        hostId: userId,
        users,
        createdAt: Date.now(),
        emptySince: null
      });

      connections.set(ws, { id: userId, roomCode, nickname, color });

      sendTo(ws, MessageType.ROOM_JOINED, {
        roomCode,
        userId,
        color,
        users: [{ id: userId, userId, nickname, color }],
        hostId: userId
      });
      break;
    }

    case MessageType.ROOM_JOIN: {
      const { roomCode, nickname = 'Anonymous' } = payload;
      const room = rooms.get(roomCode);

      if (!room) {
        return sendTo(ws, MessageType.ROOM_ERROR, { message: 'Room not found' });
      }

      if (room.users.size >= 8) {
        return sendTo(ws, MessageType.ROOM_ERROR, { message: 'Room is full' });
      }

      if (room.emptyTimeout) {
        clearTimeout(room.emptyTimeout);
        room.emptyTimeout = null;
      }

      const existingColors = Array.from(room.users.values()).map(u => u.color);
      const userId = generateUserId();
      const color = generateColor(existingColors);

      room.users.set(ws.connId, { id: userId, nickname, color });
      connections.set(ws, { id: userId, roomCode, nickname, color });

      const usersArray = Array.from(room.users.values()).map(u => ({ id: u.id, userId: u.id, nickname: u.nickname, color: u.color }));

      sendTo(ws, MessageType.ROOM_JOINED, {
        roomCode,
        userId,
        color,
        users: usersArray,
        hostId: room.hostId
      });

      broadcast(roomCode, MessageType.USER_JOINED, { id: userId, userId, nickname, color }, ws, wss);

      if (room.hostId) {
        sendTo(ws, MessageType.ROOM_HOST, { hostId: room.hostId });
      }
      break;
    }

    case MessageType.WEBRTC_OFFER:
    case MessageType.WEBRTC_ANSWER:
    case MessageType.WEBRTC_ICE: {
      const connData = connections.get(ws);
      if (!connData) return;

      const targetId = payload.to || payload.target;
      const targetWs = findWsByUserId(connData.roomCode, targetId, wss);
      if (targetWs) {
        const relayPayload = { ...payload, to: targetId, target: targetId, from: connData.id };
        sendTo(targetWs, type, relayPayload);
      }
      break;
    }

    case MessageType.CHAT_MESSAGE: {
      const connData = connections.get(ws);
      if (!connData) return;

      let text = payload.text || '';
      text = text.substring(0, 1000);
      if (!text.trim()) return;

      text = text.replace(/[&<>"']/g, function(m) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        }[m];
      });

      broadcast(connData.roomCode, MessageType.CHAT_MESSAGE, {
        userId: connData.id,
        nickname: connData.nickname,
        text,
        color: connData.color,
        timestamp: Date.now()
      }, null, wss);
      break;
    }

    case MessageType.BOARD_CLEAR: {
      const connData = connections.get(ws);
      if (!connData) return;

      const room = rooms.get(connData.roomCode);
      if (room && room.hostId === connData.id) {
        broadcast(connData.roomCode, MessageType.BOARD_CLEAR, {}, null, wss);
      }
      break;
    }
  }
}

function handleDisconnect(ws, wss) {
  const connData = connections.get(ws);
  if (!connData) return;

  const room = rooms.get(connData.roomCode);
  if (room) {
    room.users.delete(ws.connId);
    broadcast(connData.roomCode, MessageType.USER_LEFT, { userId: connData.id }, ws, wss);

    if (room.hostId === connData.id) {
      if (room.users.size > 0) {
        const newHost = Array.from(room.users.values())[0];
        room.hostId = newHost.id;
        broadcast(connData.roomCode, MessageType.ROOM_HOST, { hostId: room.hostId }, null, wss);
      } else {
        room.hostId = null;
      }
    }

    if (room.users.size === 0) {
      room.emptyTimeout = setTimeout(() => {
        if (rooms.has(connData.roomCode) && rooms.get(connData.roomCode).users.size === 0) {
          rooms.delete(connData.roomCode);
          console.log(`Deleted empty room ${connData.roomCode}`);
        }
      }, 30000);
    }
  }

  connections.delete(ws);
}

module.exports = {
  handleMessage,
  handleDisconnect,
  generateRoomCode,
  generateColor
};
