export const MessageType = {
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

export const DataMessageType = {
  BOARD_OP: 'board:op',
  BOARD_SYNC_REQUEST: 'board:sync-request',
  BOARD_SYNC: 'board:sync',
  CURSOR_UPDATE: 'cursor:update',
  DRAWING_STATUS: 'drawing:status',
  OBJECT_LOCK: 'object:lock',
  OBJECT_UNLOCK: 'object:unlock'
};

export const OpType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  MOVE: 'move',
  STYLE: 'style',
  CLEAR: 'clear'
};

export function createMessage(type, payload = {}) {
  return JSON.stringify({ ...payload, type, timestamp: Date.now() });
}

export function parseMessage(data) {
  try { return JSON.parse(data); } catch { return null; }
}
