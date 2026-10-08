import { getState, setState } from './state.js';
import { requestRender } from './renderer.js';
import { addObject, updateObject, deleteObject, clearBoard } from './whiteboard.js';

let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 200;

export function initHistory() {
  undoStack = [];
  redoStack = [];
}

export function pushAction(action) {
  undoStack.push(action);
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  redoStack = []; // Clear redo stack on new action
}

export function undo() {
  if (undoStack.length === 0) return null;
  const action = undoStack.pop();
  
  applyInverse(action);
  
  redoStack.push(action);
  requestRender();
  return action;
}

export function redo() {
  if (redoStack.length === 0) return null;
  const action = redoStack.pop();
  
  applyAction(action);
  
  undoStack.push(action);
  requestRender();
  return action;
}

function applyInverse(action) {
  if (action.type === 'batch') {
    for (let i = action.actions.length - 1; i >= 0; i--) {
      applyInverse(action.actions[i]);
    }
    return;
  }
  
  switch (action.type) {
    case 'create':
      deleteObject(action.objectId, true);
      break;
    case 'delete':
      addObject(action.before, true);
      break;
    case 'update':
    case 'move':
    case 'style':
      updateObject(action.objectId, action.before, true);
      break;
    case 'clear':
      if (Array.isArray(action.before)) {
        action.before.forEach(obj => addObject(obj, true));
      } else if (action.before && typeof action.before === 'object') {
        Object.values(action.before).forEach(obj => addObject(obj, true));
      }
      break;
  }
}

function applyAction(action) {
  if (action.type === 'batch') {
    for (let i = 0; i < action.actions.length; i++) {
      applyAction(action.actions[i]);
    }
    return;
  }
  
  switch (action.type) {
    case 'create':
      addObject(action.after, true);
      break;
    case 'delete':
      deleteObject(action.objectId, true);
      break;
    case 'update':
    case 'move':
    case 'style':
      updateObject(action.objectId, action.after, true);
      break;
    case 'clear':
      clearBoard(true);
      break;
  }
}

export function canUndo() {
  return undoStack.length > 0;
}

export function canRedo() {
  return redoStack.length > 0;
}

export function getHistoryLength() {
  return { undoCount: undoStack.length, redoCount: redoStack.length };
}
