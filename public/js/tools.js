import { getState, setState } from './state.js';
import { generateId } from './utils.js';
import { getObjectAtPoint, getObjectsInRect, selectObjects, deselectAll, getSelectedObjects, moveObject, addObject, updateObject, getObjectBounds, deleteObject } from './whiteboard.js';
import { screenToWorld, setCamera, getCamera, requestRender } from './renderer.js';
import { pushAction } from './history.js';

let previewObject = null;
let activeTool = 'pen';
let containerEl;
let cleanupFn = null;
let drawingStatusListeners = [];
let localCursorListeners = [];

export const TOOLS = {
  select: { cursor: 'default' },
  hand: { cursor: 'grab' },
  pen: { cursor: 'crosshair' },
  eraser: { cursor: 'crosshair' },
  line: { cursor: 'crosshair' },
  arrow: { cursor: 'crosshair' },
  rectangle: { cursor: 'crosshair' },
  ellipse: { cursor: 'crosshair' },
  diamond: { cursor: 'crosshair' },
  text: { cursor: 'text' }
};

let currentStyle = {
  stroke: '#F4FF24',
  fill: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  fontSize: 16
};

export function getCurrentStyle() {
  return currentStyle;
}

export function setCurrentStyle(styles) {
  currentStyle = { ...currentStyle, ...styles };
}

export function getPreviewObject() {
  return previewObject;
}

export function setPreviewObject(obj) {
  previewObject = obj;
  requestRender();
}

export function setActiveTool(toolName) {
  activeTool = toolName;
  setState('ui.currentTool', toolName);
  updateCursor();
}

export function getActiveTool() {
  return activeTool;
}

function updateCursor() {
  if (containerEl && TOOLS[activeTool]) {
    containerEl.style.cursor = TOOLS[activeTool].cursor || 'default';
  }
}

export function initTools(canvas, container) {
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }

  containerEl = container;
  updateCursor();
  
  let isPointerDown = false;
  let startScreenPoint = null;
  let startWorldPoint = null;
  let lastWorldPoint = null;
  let isSpacePan = false;
  let currentStroke = null;
  let selectionRect = null;
  let draggedObjectIds = [];
  let dragInitialState = {};
  
  const onPointerDown = (e) => {
    isPointerDown = true;
    startScreenPoint = { x: e.clientX, y: e.clientY };
    startWorldPoint = screenToWorld(e.clientX, e.clientY);
    lastWorldPoint = startWorldPoint;
    
    if (e.button === 1 || isSpacePan) { // Middle click or space+drag
      containerEl.style.cursor = 'grabbing';
      return;
    }
    
    const state = getState();
    const user = state.localUser || { id: 'local', color: '#1558C9' };
    
    switch (activeTool) {
      case 'select': {
        const hitObj = getObjectAtPoint(startWorldPoint.x, startWorldPoint.y);
        if (hitObj) {
          if (!state.selectedIds.includes(hitObj.id)) {
            if (e.shiftKey) {
              selectObjects([...state.selectedIds, hitObj.id]);
            } else {
              selectObjects([hitObj.id]);
            }
          }
          draggedObjectIds = getState().selectedIds;
          dragInitialState = {};
          for (const id of draggedObjectIds) {
            dragInitialState[id] = { ...getState().board.objects[id] };
          }
        } else {
          deselectAll();
          selectionRect = { x: startWorldPoint.x, y: startWorldPoint.y, width: 0, height: 0 };
        }
        break;
      }
      case 'hand': {
        containerEl.style.cursor = 'grabbing';
        break;
      }
      case 'pen': {
        currentStroke = {
          id: generateId('stroke'),
          type: 'stroke',
          userId: user.id,
          createdAt: Date.now(),
          points: [{ x: startWorldPoint.x, y: startWorldPoint.y }],
          stroke: currentStyle.stroke || user.color || '#F4FF24',
          strokeWidth: currentStyle.strokeWidth || 2,
          opacity: currentStyle.opacity !== undefined ? currentStyle.opacity : 1
        };
        setPreviewObject(currentStroke);
        emitDrawingStart(startWorldPoint.x, startWorldPoint.y);
        break;
      }
      case 'eraser': {
        const hitObj = getObjectAtPoint(startWorldPoint.x, startWorldPoint.y);
        if (hitObj) {
          deleteObject(hitObj.id);
          pushAction({ type: 'delete', objectId: hitObj.id, before: hitObj, userId: user.id });
        }
        break;
      }
      case 'line':
      case 'arrow':
      case 'rectangle':
      case 'ellipse':
      case 'diamond': {
        previewObject = {
          id: generateId(activeTool),
          type: activeTool,
          userId: user.id,
          createdAt: Date.now(),
          stroke: currentStyle.stroke || user.color || '#F4FF24',
          fill: currentStyle.fill || 'transparent',
          strokeWidth: currentStyle.strokeWidth || 2,
          opacity: currentStyle.opacity !== undefined ? currentStyle.opacity : 1
        };
        if (activeTool === 'line' || activeTool === 'arrow') {
          previewObject.x1 = startWorldPoint.x;
          previewObject.y1 = startWorldPoint.y;
          previewObject.x2 = startWorldPoint.x;
          previewObject.y2 = startWorldPoint.y;
        } else {
          previewObject.x = startWorldPoint.x;
          previewObject.y = startWorldPoint.y;
          previewObject.width = 0;
          previewObject.height = 0;
        }
        setPreviewObject(previewObject);
        break;
      }
      case 'text': {
        const hitObj = getObjectAtPoint(startWorldPoint.x, startWorldPoint.y);
        if (hitObj && hitObj.type === 'text') {
           openTextEditor(hitObj);
        } else {
           const newText = {
             id: generateId('text'),
             type: 'text',
             userId: user.id,
             createdAt: Date.now(),
             text: '',
             x: startWorldPoint.x,
             y: startWorldPoint.y,
             fontSize: currentStyle.fontSize || 16,
             fontFamily: 'Inter, sans-serif',
             color: currentStyle.stroke || '#dee2f4',
             opacity: currentStyle.opacity !== undefined ? currentStyle.opacity : 1
           };
           openTextEditor(newText, true);
        }
        break;
      }
    }
  };
  
  const onPointerMove = (e) => {
    const worldPoint = screenToWorld(e.clientX, e.clientY);
    emitLocalCursorMove(worldPoint.x, worldPoint.y);
    
    if (!isPointerDown) {
      return;
    }
    
    if (e.button === 1 || isSpacePan || activeTool === 'hand') {
      const dx = e.clientX - startScreenPoint.x;
      const dy = e.clientY - startScreenPoint.y;
      const camera = getCamera();
      setCamera({ ...camera, x: camera.x + dx, y: camera.y + dy });
      startScreenPoint = { x: e.clientX, y: e.clientY };
      return;
    }
    
    switch (activeTool) {
      case 'select': {
        if (draggedObjectIds.length > 0) {
          const dx = worldPoint.x - lastWorldPoint.x;
          const dy = worldPoint.y - lastWorldPoint.y;
          for (const id of draggedObjectIds) {
            moveObject(id, dx, dy);
          }
        } else if (selectionRect) {
          selectionRect.width = worldPoint.x - startWorldPoint.x;
          selectionRect.height = worldPoint.y - startWorldPoint.y;
          
          const rx = Math.min(startWorldPoint.x, worldPoint.x);
          const ry = Math.min(startWorldPoint.y, worldPoint.y);
          const rw = Math.abs(selectionRect.width);
          const rh = Math.abs(selectionRect.height);
          
          setPreviewObject({
            type: 'rectangle',
            x: rx, y: ry, width: rw, height: rh,
            stroke: '#F4FF24', strokeWidth: 1, fill: 'rgba(244, 255, 36, 0.12)', opacity: 1,
            id: 'selection-rect'
          });
        }
        break;
      }
      case 'pen': {
        if (currentStroke) {
          const dist = Math.hypot(worldPoint.x - lastWorldPoint.x, worldPoint.y - lastWorldPoint.y);
          if (dist >= 1) {
            currentStroke.points.push({ x: worldPoint.x, y: worldPoint.y });
            requestRender();
          }
        }
        break;
      }
      case 'eraser': {
        const hitObj = getObjectAtPoint(worldPoint.x, worldPoint.y);
        if (hitObj) {
          deleteObject(hitObj.id);
          pushAction({ type: 'delete', objectId: hitObj.id, before: hitObj, userId: getState().localUser.id });
        }
        break;
      }
      case 'line':
      case 'arrow': {
        if (previewObject) {
          previewObject.x2 = worldPoint.x;
          previewObject.y2 = worldPoint.y;
          requestRender();
        }
        break;
      }
      case 'rectangle':
      case 'ellipse':
      case 'diamond': {
        if (previewObject) {
          const dx = worldPoint.x - startWorldPoint.x;
          const dy = worldPoint.y - startWorldPoint.y;
          
          if (e.shiftKey) {
            const size = Math.max(Math.abs(dx), Math.abs(dy));
            previewObject.width = size;
            previewObject.height = size;
            previewObject.x = dx < 0 ? startWorldPoint.x - size : startWorldPoint.x;
            previewObject.y = dy < 0 ? startWorldPoint.y - size : startWorldPoint.y;
          } else {
            previewObject.x = Math.min(startWorldPoint.x, worldPoint.x);
            previewObject.y = Math.min(startWorldPoint.y, worldPoint.y);
            previewObject.width = Math.abs(dx);
            previewObject.height = Math.abs(dy);
          }
          requestRender();
        }
        break;
      }
    }
    
    lastWorldPoint = worldPoint;
  };
  
  const onPointerUp = (e) => {
    isPointerDown = false;
    
    if (e.button === 1 || isSpacePan) {
      if (activeTool !== 'hand') updateCursor();
      return;
    }
    
    if (activeTool === 'hand') {
      updateCursor();
      return;
    }
    
    const user = getState().localUser || { id: 'local' };
    
    switch (activeTool) {
      case 'select': {
        if (draggedObjectIds.length > 0) {
          const actions = draggedObjectIds.map(id => ({
            type: 'move',
            objectId: id,
            before: dragInitialState[id],
            after: { ...getState().board.objects[id] },
            userId: user.id
          }));
          if (actions.length === 1) {
            pushAction(actions[0]);
          } else if (actions.length > 1) {
            pushAction({ type: 'batch', actions, userId: user.id });
          }
          draggedObjectIds = [];
          dragInitialState = {};
        } else if (selectionRect) {
          const rx = Math.min(selectionRect.x, selectionRect.x + selectionRect.width);
          const ry = Math.min(selectionRect.y, selectionRect.y + selectionRect.height);
          const rw = Math.abs(selectionRect.width);
          const rh = Math.abs(selectionRect.height);
          
          const inRect = getObjectsInRect(rx, ry, rw, rh);
          selectObjects(inRect.map(o => o.id));
          selectionRect = null;
          setPreviewObject(null);
        }
        break;
      }
      case 'pen': {
        if (currentStroke && currentStroke.points.length >= 1) {
          addObject(currentStroke);
          pushAction({ type: 'create', objectId: currentStroke.id, after: currentStroke, userId: user.id });
        }
        currentStroke = null;
        setPreviewObject(null);
        emitDrawingEnd();
        break;
      }
      case 'line':
      case 'arrow':
      case 'rectangle':
      case 'ellipse':
      case 'diamond': {
        if (previewObject) {
          let isValid = false;
          if (activeTool === 'line' || activeTool === 'arrow') {
            isValid = Math.hypot(previewObject.x2 - previewObject.x1, previewObject.y2 - previewObject.y1) >= 1;
          } else {
            isValid = previewObject.width >= 1 && previewObject.height >= 1;
          }
          
          if (isValid) {
            addObject(previewObject);
            pushAction({ type: 'create', objectId: previewObject.id, after: previewObject, userId: user.id });
            setActiveTool('select');
          }
          setPreviewObject(null);
        }
        break;
      }
    }
  };
  
  const openTextEditor = (textObj, isNew = false) => {
    const camera = getCamera();
    const rect = containerEl.getBoundingClientRect();
    const sx = textObj.x * camera.zoom + camera.x;
    const sy = textObj.y * camera.zoom + camera.y;
    
    const textarea = document.createElement('textarea');
    textarea.value = textObj.text || '';
    textarea.style.position = 'absolute';
    textarea.style.left = `${sx}px`;
    textarea.style.top = `${sy}px`;
    textarea.style.font = `${textObj.fontSize * camera.zoom}px ${textObj.fontFamily}`;
    textarea.style.color = textObj.color;
    textarea.style.background = 'transparent';
    textarea.style.border = '1px dashed #F4FF24';
    textarea.style.outline = 'none';
    textarea.style.padding = '0';
    textarea.style.margin = '0';
    textarea.style.overflow = 'hidden';
    textarea.style.whiteSpace = 'pre';
    textarea.style.minWidth = `${100 * camera.zoom}px`;
    textarea.style.minHeight = `${textObj.fontSize * 1.5 * camera.zoom}px`;
    textarea.style.resize = 'none';
    textarea.style.lineHeight = '1.2';
    textarea.style.zIndex = '1000';
    
    containerEl.appendChild(textarea);
    textarea.focus();
    
    const commitText = () => {
      const val = textarea.value.trim();
      if (val) {
        const after = { ...textObj, text: val };
        if (isNew) {
          addObject(after);
          pushAction({ type: 'create', objectId: after.id, after, userId: textObj.userId });
        } else {
          updateObject(textObj.id, { text: val });
          pushAction({ type: 'update', objectId: textObj.id, before: textObj, after, userId: textObj.userId });
        }
      } else if (!isNew) {
         deleteObject(textObj.id);
         pushAction({ type: 'delete', objectId: textObj.id, before: textObj, userId: textObj.userId });
      }
      textarea.remove();
      setActiveTool('select');
    };
    
    textarea.addEventListener('blur', commitText);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        textarea.remove();
        setActiveTool('select');
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitText();
      }
    });
  };
  
  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    switch (e.key.toLowerCase()) {
      case 'v': setActiveTool('select'); break;
      case 'h': setActiveTool('hand'); break;
      case 'p': setActiveTool('pen'); break;
      case 'e': setActiveTool('eraser'); break;
      case 'l': setActiveTool('line'); break;
      case 'a': setActiveTool('arrow'); break;
      case 'r': setActiveTool('rectangle'); break;
      case 'o': setActiveTool('ellipse'); break;
      case 'd': setActiveTool('diamond'); break;
      case 't': setActiveTool('text'); break;
      case 'g': 
        setState('board.gridEnabled', !getState().board.gridEnabled);
        requestRender();
        break;
      case 'escape':
        deselectAll();
        setPreviewObject(null);
        if (activeTool !== 'pen') setActiveTool('pen');
        break;
      case 'delete':
      case 'backspace': {
        const selected = getSelectedObjects();
        if (selected.length > 0) {
          const user = getState().localUser;
          const actions = selected.map(obj => ({
            type: 'delete', objectId: obj.id, before: obj, userId: user.id
          }));
          selected.forEach(obj => deleteObject(obj.id));
          if (actions.length === 1) pushAction(actions[0]);
          else pushAction({ type: 'batch', actions, userId: user.id });
        }
        break;
      }
      case ' ':
        if (!isSpacePan) {
          isSpacePan = true;
          containerEl.style.cursor = 'grab';
        }
        break;
    }
  };
  
  const onKeyUp = (e) => {
    if (e.key === ' ') {
      isSpacePan = false;
      updateCursor();
    }
  };
  
  const onWheel = (e) => {
    e.preventDefault();
    const camera = getCamera();
    const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
    let newZoom = camera.zoom * zoomAmount;
    newZoom = Math.max(0.1, Math.min(newZoom, 5));
    
    const rect = containerEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const worldPoint = screenToWorld(e.clientX, e.clientY);
    const newCameraX = mouseX - worldPoint.x * newZoom;
    const newCameraY = mouseY - worldPoint.y * newZoom;
    
    setCamera({ x: newCameraX, y: newCameraY, zoom: newZoom });
  };
  
  containerEl.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  containerEl.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  
  cleanupFn = () => {
    containerEl.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    containerEl.removeEventListener('wheel', onWheel);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  };
  
  return cleanupFn;
}

export function onDrawingStatusChange(cb) {
  drawingStatusListeners.push(cb);
  return () => { drawingStatusListeners = drawingStatusListeners.filter(l => l !== cb); };
}

export function onLocalCursorMove(cb) {
  localCursorListeners.push(cb);
  return () => { localCursorListeners = localCursorListeners.filter(l => l !== cb); };
}

function emitDrawingStart(x, y) {
  const user = getState().localUser || { id: 'local' };
  for (const cb of drawingStatusListeners) {
    cb({ type: 'drawingStart', userId: user.id, x, y, nickname: user.nickname, color: user.color });
  }
}

function emitDrawingEnd() {
  const user = getState().localUser || { id: 'local' };
  for (const cb of drawingStatusListeners) {
    cb({ type: 'drawingEnd', userId: user.id });
  }
}

let lastCursorEmit = 0;
function emitLocalCursorMove(x, y) {
  const now = Date.now();
  if (now - lastCursorEmit > 33) {
    for (const cb of localCursorListeners) {
      cb({ x, y });
    }
    lastCursorEmit = now;
  }
}
