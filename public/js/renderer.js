import { getState, setState } from './state.js';
import { getObjects, getSelectedObjects, getObjectBounds } from './whiteboard.js';
import { getPreviewObject } from './tools.js';

let ctx;
let canvasEl;
let containerEl;
let animationFrameId = null;
let isDirty = true;
let resizeObserver = null;

export function initRenderer(canvas, container) {
  canvasEl = canvas;
  containerEl = container;
  if (!canvas || typeof canvas.getContext !== 'function') return () => {};
  ctx = canvas.getContext('2d', { alpha: false });
  
  resize();
  
  resizeObserver = new ResizeObserver(() => {
    resize();
  });
  resizeObserver.observe(container);
  
  renderLoop();
  
  return () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (resizeObserver) resizeObserver.disconnect();
  };
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = containerEl.getBoundingClientRect();
  
  canvasEl.width = rect.width * dpr;
  canvasEl.height = rect.height * dpr;
  canvasEl.style.width = `${rect.width}px`;
  canvasEl.style.height = `${rect.height}px`;
  
  ctx.scale(dpr, dpr);
  requestRender();
}

function renderLoop() {
  if (isDirty) {
    performRender();
    isDirty = false;
  }
  animationFrameId = requestAnimationFrame(renderLoop);
}

export function render() {
  performRender();
  isDirty = false;
}

export function requestRender() {
  isDirty = true;
}

export function getCamera() {
  return getState().camera;
}

export function setCamera(camera) {
  setState('camera', camera);
  requestRender();
}

export function screenToWorld(sx, sy) {
  const camera = getCamera();
  return {
    x: (sx - camera.x) / camera.zoom,
    y: (sy - camera.y) / camera.zoom
  };
}

export function worldToScreen(wx, wy) {
  const camera = getCamera();
  return {
    x: wx * camera.zoom + camera.x,
    y: wy * camera.zoom + camera.y
  };
}

function performRender() {
  const state = getState();
  const camera = state.camera;
  const rect = containerEl.getBoundingClientRect();
  
  // Midnight Black canvas
  ctx.fillStyle = '#030407';
  ctx.fillRect(0, 0, rect.width, rect.height);
  
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.zoom, camera.zoom);
  
  if (state.board.gridEnabled) {
    renderGrid(rect, camera);
  }
  
  const objects = Object.values(getObjects()).sort((a, b) => a.createdAt - b.createdAt);
  renderAllObjects(ctx, objects);
  
  const previewObj = getPreviewObject();
  if (previewObj) {
    ctx.save();
    ctx.globalAlpha = previewObj.opacity !== undefined ? previewObj.opacity * 0.7 : 0.7;
    renderObject(ctx, previewObj);
    ctx.restore();
  }
  
  const selectedObjects = getSelectedObjects();
  if (selectedObjects.length > 0) {
    renderSelectionUI(ctx, selectedObjects, camera);
  }
  
  ctx.restore();
}

function renderGrid(rect, camera) {
  const gridSize = 28;
  const startX = Math.floor(-camera.x / camera.zoom / gridSize) * gridSize;
  const startY = Math.floor(-camera.y / camera.zoom / gridSize) * gridSize;
  const endX = startX + (rect.width / camera.zoom) + gridSize;
  const endY = startY + (rect.height / camera.zoom) + gridSize;
  
  // Electric Cobalt dot grid
  ctx.fillStyle = 'rgba(21, 88, 201, 0.28)';
  for (let x = startX; x < endX; x += gridSize) {
    for (let y = startY; y < endY; y += gridSize) {
      ctx.beginPath();
      ctx.arc(x, y, 1.4 / camera.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function renderAllObjects(context, objects) {
  for (const obj of objects) {
    renderObject(context, obj);
  }
}

function renderObject(context, obj) {
  context.save();
  context.globalAlpha = obj.opacity ?? 1;
  context.strokeStyle = obj.stroke || '#F4FF24';
  context.fillStyle = obj.fill || 'transparent';
  context.lineWidth = obj.strokeWidth || 2;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  
  if (obj.rotation) {
    const bounds = getObjectBounds(obj);
    context.translate(bounds.x + bounds.width/2, bounds.y + bounds.height/2);
    context.rotate(obj.rotation);
    context.translate(-(bounds.x + bounds.width/2), -(bounds.y + bounds.height/2));
  }

  switch (obj.type) {
    case 'rectangle': renderRectangle(context, obj); break;
    case 'ellipse': renderEllipse(context, obj); break;
    case 'diamond': renderDiamond(context, obj); break;
    case 'line': renderLine(context, obj); break;
    case 'arrow': renderArrow(context, obj); break;
    case 'stroke': renderStroke(context, obj); break;
    case 'text': renderText(context, obj); break;
  }
  
  context.restore();
}

export function renderRectangle(context, obj) {
  context.beginPath();
  context.rect(obj.x, obj.y, obj.width, obj.height);
  if (obj.fill && obj.fill !== 'transparent') context.fill();
  if (obj.stroke && obj.stroke !== 'transparent') context.stroke();
}

export function renderEllipse(context, obj) {
  context.beginPath();
  context.ellipse(obj.x + obj.width/2, obj.y + obj.height/2, obj.width/2, obj.height/2, 0, 0, Math.PI * 2);
  if (obj.fill && obj.fill !== 'transparent') context.fill();
  if (obj.stroke && obj.stroke !== 'transparent') context.stroke();
}

export function renderDiamond(context, obj) {
  context.beginPath();
  context.moveTo(obj.x + obj.width/2, obj.y);
  context.lineTo(obj.x + obj.width, obj.y + obj.height/2);
  context.lineTo(obj.x + obj.width/2, obj.y + obj.height);
  context.lineTo(obj.x, obj.y + obj.height/2);
  context.closePath();
  if (obj.fill && obj.fill !== 'transparent') context.fill();
  if (obj.stroke && obj.stroke !== 'transparent') context.stroke();
}

export function renderLine(context, obj) {
  context.beginPath();
  context.moveTo(obj.x1, obj.y1);
  context.lineTo(obj.x2, obj.y2);
  if (obj.stroke && obj.stroke !== 'transparent') context.stroke();
}

export function renderArrow(context, obj) {
  renderLine(context, obj);
  
  const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
  const headLen = Math.max(10, (obj.strokeWidth || 2) * 3);
  
  context.beginPath();
  context.moveTo(obj.x2, obj.y2);
  context.lineTo(obj.x2 - headLen * Math.cos(angle - Math.PI / 6), obj.y2 - headLen * Math.sin(angle - Math.PI / 6));
  context.lineTo(obj.x2 - headLen * Math.cos(angle + Math.PI / 6), obj.y2 - headLen * Math.sin(angle + Math.PI / 6));
  context.closePath();
  
  const originalFill = context.fillStyle;
  context.fillStyle = context.strokeStyle;
  context.fill();
  context.fillStyle = originalFill;
}

export function renderStroke(context, obj) {
  if (!obj.points || obj.points.length === 0) return;
  
  context.beginPath();
  context.moveTo(obj.points[0].x, obj.points[0].y);
  for (let i = 1; i < obj.points.length; i++) {
    context.lineTo(obj.points[i].x, obj.points[i].y);
  }
  if (obj.stroke && obj.stroke !== 'transparent') context.stroke();
}

export function renderText(context, obj) {
  context.font = `${obj.fontSize || 16}px ${obj.fontFamily || 'Inter, sans-serif'}`;
  context.fillStyle = obj.color || '#f1f5fc';
  context.textBaseline = 'top';
  
  const lines = (obj.text || '').split('\n');
  const lineHeight = (obj.fontSize || 16) * 1.25;
  
  for (let i = 0; i < lines.length; i++) {
    context.fillText(lines[i], obj.x, obj.y + i * lineHeight);
  }
}

function renderSelectionUI(context, selectedObjects, camera) {
  if (selectedObjects.length === 0) return;
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const obj of selectedObjects) {
    const bounds = getObjectBounds(obj);
    if (bounds.x < minX) minX = bounds.x;
    if (bounds.y < minY) minY = bounds.y;
    if (bounds.x + bounds.width > maxX) maxX = bounds.x + bounds.width;
    if (bounds.y + bounds.height > maxY) maxY = bounds.y + bounds.height;
  }
  
  const padding = 6 / camera.zoom;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  
  // Selection box with Acid Lime neon dash
  context.strokeStyle = '#F4FF24';
  context.lineWidth = 1.5 / camera.zoom;
  context.setLineDash([5 / camera.zoom, 5 / camera.zoom]);
  context.strokeRect(minX, minY, maxX - minX, maxY - minY);
  context.setLineDash([]);
  
  const handleSize = 8 / camera.zoom;
  const handles = [
    { x: minX, y: minY },
    { x: minX + (maxX - minX)/2, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: minY + (maxY - minY)/2 },
    { x: maxX, y: maxY },
    { x: minX + (maxX - minX)/2, y: maxY },
    { x: minX, y: maxY },
    { x: minX, y: minY + (maxY - minY)/2 }
  ];
  
  context.fillStyle = '#1558C9';
  context.strokeStyle = '#F4FF24';
  context.lineWidth = 1.5 / camera.zoom;
  for (const h of handles) {
    context.fillRect(h.x - handleSize/2, h.y - handleSize/2, handleSize, handleSize);
    context.strokeRect(h.x - handleSize/2, h.y - handleSize/2, handleSize, handleSize);
  }
}
