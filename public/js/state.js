const initialState = {
  room: { code: null, hostId: null },
  localUser: { id: null, nickname: '', color: '' },
  users: [],
  board: { objects: {}, gridEnabled: true },
  selectedIds: [],
  camera: { x: 0, y: 0, zoom: 1 },
  chat: { messages: [], unreadCount: 0 },
  connection: { ws: 'disconnected', peers: {} },
  ui: { currentView: 'landing', currentTool: 'select', chatOpen: true }
};

let state = JSON.parse(JSON.stringify(initialState));

const listeners = new Map();

function getPathValue(obj, path) {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

function setPathValue(obj, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  const target = parts.reduce((acc, part) => {
    if (acc[part] === undefined) acc[part] = {};
    return acc[part];
  }, obj);
  target[last] = value;
}

export function getState() {
  return state;
}

export function setState(path, value) {
  const oldValue = getPathValue(state, path);
  setPathValue(state, path, value);
  
  const parts = path.split('.');
  let currentPath = '';
  
  for (let i = 0; i < parts.length; i++) {
    currentPath += (i === 0 ? '' : '.') + parts[i];
    notifyListeners(currentPath, getPathValue(state, currentPath), oldValue);
  }
  
  notifyListeners('*', state, state);
}

export function subscribe(path, callback) {
  if (!listeners.has(path)) {
    listeners.set(path, new Set());
  }
  listeners.get(path).add(callback);
  
  return () => {
    const pathListeners = listeners.get(path);
    if (pathListeners) {
      pathListeners.delete(callback);
      if (pathListeners.size === 0) listeners.delete(path);
    }
  };
}

function notifyListeners(path, newValue, oldValue) {
  const pathListeners = listeners.get(path);
  if (pathListeners) {
    pathListeners.forEach(cb => cb(newValue, oldValue));
  }
}

export function resetState() {
  state = JSON.parse(JSON.stringify(initialState));
  notifyListeners('*', state, null);
}

export function updateState(path, updaterFn) {
  const currentValue = getPathValue(state, path);
  const newValue = updaterFn(currentValue);
  setState(path, newValue);
}
