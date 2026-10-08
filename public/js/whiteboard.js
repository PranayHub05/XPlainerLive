import { getState, setState, subscribe } from './state.js';
import { requestRender } from './renderer.js';
import { OpType } from './protocol.js';

let boardOpListeners = [];

export function initWhiteboard(canvasContainer) {
  // Setup logic would be called by main app to initialize renderer, tools, history
  return () => {
    boardOpListeners = [];
  };
}

export function getObjects() {
  return getState().board.objects || {};
}

function updateEmptyState() {
  const emptyState = document.getElementById('empty-state');
  if (emptyState) {
    const hasObjects = Object.keys(getState().board?.objects || {}).length > 0;
    emptyState.style.display = hasObjects ? 'none' : 'block';
  }
}

export function addObject(obj, emit = true) {
  const state = getState();
  const newObjects = { ...state.board.objects, [obj.id]: obj };
  setState('board.objects', newObjects);
  
  if (emit) {
    notifyListeners({ opType: OpType.CREATE, type: OpType.CREATE, objectId: obj.id, data: obj, userId: state.localUser.id });
  }
  
  updateEmptyState();
  requestRender();
  return obj;
}

export function updateObject(id, updates, emit = true) {
  const state = getState();
  const obj = state.board.objects[id];
  if (!obj) return null;
  
  const updatedObj = { ...obj, ...updates };
  const newObjects = { ...state.board.objects, [id]: updatedObj };
  setState('board.objects', newObjects);
  
  if (emit) {
    notifyListeners({ opType: OpType.UPDATE, type: OpType.UPDATE, objectId: id, data: updates, userId: state.localUser.id });
  }
  
  requestRender();
  return updatedObj;
}

export function deleteObject(id, emit = true) {
  const state = getState();
  if (!state.board.objects[id]) return;
  
  const newObjects = { ...state.board.objects };
  delete newObjects[id];
  setState('board.objects', newObjects);
  
  // Also remove from selection if selected
  const newSelectedIds = state.selectedIds.filter(selectedId => selectedId !== id);
  if (newSelectedIds.length !== state.selectedIds.length) {
    setState('selectedIds', newSelectedIds);
  }
  
  if (emit) {
    notifyListeners({ opType: OpType.DELETE, type: OpType.DELETE, objectId: id, userId: state.localUser.id });
  }
  
  updateEmptyState();
  requestRender();
}

export function moveObject(id, dx, dy, emit = true) {
  const obj = getState().board.objects[id];
  if (!obj) return null;
  
  let updates = {};
  if (obj.type === 'line' || obj.type === 'arrow') {
    updates = {
      x1: obj.x1 + dx,
      y1: obj.y1 + dy,
      x2: obj.x2 + dx,
      y2: obj.y2 + dy
    };
  } else if (obj.type === 'stroke') {
    updates = {
      points: obj.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
    };
  } else {
    updates = {
      x: obj.x + dx,
      y: obj.y + dy
    };
  }
  
  return updateObject(id, updates, emit);
}

export function clearBoard(emit = true) {
  const state = getState();
  setState('board.objects', {});
  setState('selectedIds', []);
  
  if (emit) {
    notifyListeners({ opType: OpType.CLEAR, type: OpType.CLEAR, userId: state.localUser.id });
  }
  
  updateEmptyState();
  requestRender();
}

export function getObjectBounds(obj) {
  switch (obj.type) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
      return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
    case 'line':
    case 'arrow':
      return { 
        x: Math.min(obj.x1, obj.x2), 
        y: Math.min(obj.y1, obj.y2), 
        width: Math.abs(obj.x2 - obj.x1), 
        height: Math.abs(obj.y2 - obj.y1) 
      };
    case 'stroke': {
      if (!obj.points || obj.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of obj.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    case 'text':
      return { x: obj.x, y: obj.y, width: obj.width || 100, height: obj.fontSize * 1.5 }; // approx
    default:
      return { x: 0, y: 0, width: 0, height: 0 };
  }
}

// Distance from point to line segment
function distToSegmentSquared(p, v, w) {
  function sqr(x) { return x * x }
  function dist2(v, w) { return sqr(v.x - w.x) + sqr(v.y - w.y) }
  const l2 = dist2(v, w);
  if (l2 === 0) return dist2(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

export function getObjectAtPoint(worldX, worldY) {
  const objectsMap = getState().board.objects;
  const objects = Object.values(objectsMap).sort((a, b) => b.createdAt - a.createdAt); // Newer (top) first
  
  const p = { x: worldX, y: worldY };
  
  for (const obj of objects) {
    const strokeWidth = obj.strokeWidth || 2;
    const threshold = Math.max(strokeWidth / 2 + 2, 5);
    
    if (obj.type === 'rectangle' || obj.type === 'ellipse' || obj.type === 'diamond') {
      const bounds = getObjectBounds(obj);
      if (worldX >= bounds.x - threshold && worldX <= bounds.x + bounds.width + threshold &&
          worldY >= bounds.y - threshold && worldY <= bounds.y + bounds.height + threshold) {
          
        if (obj.fill && obj.fill !== 'transparent') {
          return obj; // Hit filled interior
        } else {
          // Hit border
          const hitLeft = Math.abs(worldX - bounds.x) <= threshold;
          const hitRight = Math.abs(worldX - (bounds.x + bounds.width)) <= threshold;
          const hitTop = Math.abs(worldY - bounds.y) <= threshold;
          const hitBottom = Math.abs(worldY - (bounds.y + bounds.height)) <= threshold;
          if (hitLeft || hitRight || hitTop || hitBottom) return obj;
          
          if (obj.type === 'ellipse') {
             // simplified ellipse hit test for hollow
             const cx = bounds.x + bounds.width/2;
             const cy = bounds.y + bounds.height/2;
             const rx = bounds.width/2;
             const ry = bounds.height/2;
             const dx = worldX - cx;
             const dy = worldY - cy;
             const val = (dx*dx)/(rx*rx) + (dy*dy)/(ry*ry);
             // 1 means on the boundary. give a margin.
             if (Math.abs(val - 1) < 0.2) return obj;
          }
        }
      }
    } else if (obj.type === 'line' || obj.type === 'arrow') {
      const distSq = distToSegmentSquared(p, {x: obj.x1, y: obj.y1}, {x: obj.x2, y: obj.y2});
      if (distSq <= threshold * threshold) return obj;
    } else if (obj.type === 'stroke') {
      for (let i = 0; i < obj.points.length - 1; i++) {
        const distSq = distToSegmentSquared(p, obj.points[i], obj.points[i+1]);
        if (distSq <= threshold * threshold) return obj;
      }
    } else if (obj.type === 'text') {
      const bounds = getObjectBounds(obj);
      if (worldX >= bounds.x && worldX <= bounds.x + bounds.width &&
          worldY >= bounds.y && worldY <= bounds.y + bounds.height) {
        return obj;
      }
    }
  }
  
  return null;
}

export function getObjectsInRect(rx, ry, rw, rh) {
  const objectsMap = getState().board.objects;
  const result = [];
  const rect = { minX: rx, minY: ry, maxX: rx + rw, maxY: ry + rh };
  
  for (const obj of Object.values(objectsMap)) {
    const bounds = getObjectBounds(obj);
    if (bounds.x >= rect.minX && bounds.y >= rect.minY &&
        bounds.x + bounds.width <= rect.maxX && bounds.y + bounds.height <= rect.maxY) {
      result.push(obj);
    }
  }
  return result;
}

export function selectObjects(ids) {
  setState('selectedIds', ids);
  requestRender();
}

export function deselectAll() {
  setState('selectedIds', []);
  requestRender();
}

export function getSelectedObjects() {
  const state = getState();
  return state.selectedIds.map(id => state.board.objects[id]).filter(Boolean);
}

export function setObjectsFromSync(objectsMap) {
  setState('board.objects', objectsMap || {});
  updateEmptyState();
  requestRender();
}

export function getBoardData() {
  return getState().board.objects;
}

export function onBoardOperation(callback) {
  boardOpListeners.push(callback);
  return () => {
    boardOpListeners = boardOpListeners.filter(cb => cb !== callback);
  };
}

function notifyListeners(op) {
  for (const listener of boardOpListeners) {
    listener(op);
  }
}
