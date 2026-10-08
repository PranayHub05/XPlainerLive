import { getState } from './state.js';
import { renderAllObjects } from './renderer.js';
import { getObjectBounds } from './whiteboard.js';

export function exportPNG() {
  const state = getState();
  const objectsMap = state.board.objects;
  const objects = Object.values(objectsMap).sort((a, b) => a.createdAt - b.createdAt);
  
  if (objects.length === 0) return;
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of objects) {
    const bounds = getObjectBounds(obj);
    if (bounds.x < minX) minX = bounds.x;
    if (bounds.y < minY) minY = bounds.y;
    if (bounds.x + bounds.width > maxX) maxX = bounds.x + bounds.width;
    if (bounds.y + bounds.height > maxY) maxY = bounds.y + bounds.height;
  }
  
  const padding = 20;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  
  const width = maxX - minX;
  const height = maxY - minY;
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#090e1a';
  ctx.fillRect(0, 0, width, height);
  
  ctx.save();
  ctx.translate(-minX, -minY);
  renderAllObjects(ctx, objects);
  ctx.restore();
  
  canvas.toBlob((blob) => {
    downloadBlob(blob, `xplainerlive-board-${Date.now()}.png`);
  });
}

export function exportSVG() {
  const state = getState();
  const objects = Object.values(state.board.objects).sort((a, b) => a.createdAt - b.createdAt);
  
  if (objects.length === 0) return;
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of objects) {
    const bounds = getObjectBounds(obj);
    if (bounds.x < minX) minX = bounds.x;
    if (bounds.y < minY) minY = bounds.y;
    if (bounds.x + bounds.width > maxX) maxX = bounds.x + bounds.width;
    if (bounds.y + bounds.height > maxY) maxY = bounds.y + bounds.height;
  }
  
  const padding = 20;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  
  const width = maxX - minX;
  const height = maxY - minY;
  
  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">
<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#090e1a"/>\n`;
  
  for (const obj of objects) {
    const stroke = obj.stroke || '#a4c9ff';
    const fill = obj.fill || 'transparent';
    const strokeWidth = obj.strokeWidth || 2;
    const opacity = obj.opacity ?? 1;
    
    let transform = '';
    if (obj.rotation) {
       const bounds = getObjectBounds(obj);
       const cx = bounds.x + bounds.width/2;
       const cy = bounds.y + bounds.height/2;
       transform = `transform="rotate(${obj.rotation * 180 / Math.PI} ${cx} ${cy})"`;
    }
    
    const styleAttr = `stroke="${stroke}" fill="${fill}" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round" ${transform}`;
    
    switch (obj.type) {
      case 'rectangle':
        svgContent += `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" ${styleAttr}/>\n`;
        break;
      case 'ellipse':
        svgContent += `<ellipse cx="${obj.x + obj.width/2}" cy="${obj.y + obj.height/2}" rx="${obj.width/2}" ry="${obj.height/2}" ${styleAttr}/>\n`;
        break;
      case 'diamond':
        svgContent += `<polygon points="${obj.x + obj.width/2},${obj.y} ${obj.x + obj.width},${obj.y + obj.height/2} ${obj.x + obj.width/2},${obj.y + obj.height} ${obj.x},${obj.y + obj.height/2}" ${styleAttr}/>\n`;
        break;
      case 'line':
        svgContent += `<line x1="${obj.x1}" y1="${obj.y1}" x2="${obj.x2}" y2="${obj.y2}" ${styleAttr}/>\n`;
        break;
      case 'arrow':
        svgContent += `<line x1="${obj.x1}" y1="${obj.y1}" x2="${obj.x2}" y2="${obj.y2}" ${styleAttr}/>\n`;
        const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
        const headLen = Math.max(10, strokeWidth * 3);
        const p1x = obj.x2 - headLen * Math.cos(angle - Math.PI / 6);
        const p1y = obj.y2 - headLen * Math.sin(angle - Math.PI / 6);
        const p2x = obj.x2 - headLen * Math.cos(angle + Math.PI / 6);
        const p2y = obj.y2 - headLen * Math.sin(angle + Math.PI / 6);
        svgContent += `<polygon points="${obj.x2},${obj.y2} ${p1x},${p1y} ${p2x},${p2y}" fill="${stroke}" opacity="${opacity}"/>\n`;
        break;
      case 'stroke':
        if (obj.points && obj.points.length > 0) {
          const pointsStr = obj.points.map(p => `${p.x},${p.y}`).join(' ');
          svgContent += `<polyline points="${pointsStr}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
        }
        break;
      case 'text':
        const fontSize = obj.fontSize || 16;
        const fontFamily = obj.fontFamily || 'Inter, sans-serif';
        const color = obj.color || '#dee2f4';
        const lines = (obj.text || '').split('\n');
        
        svgContent += `<text x="${obj.x}" y="${obj.y + fontSize}" font-size="${fontSize}px" font-family="${fontFamily}" fill="${color}" opacity="${opacity}" ${transform}>\n`;
        for (let i = 0; i < lines.length; i++) {
          svgContent += `<tspan x="${obj.x}" dy="${i === 0 ? 0 : fontSize * 1.2}">${lines[i]}</tspan>\n`;
        }
        svgContent += `</text>\n`;
        break;
    }
  }
  
  svgContent += `</svg>`;
  
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  downloadBlob(blob, `xplainerlive-board-${Date.now()}.svg`);
}

export function exportJSON() {
  const state = getState();
  const data = {
    version: '1.0',
    exportedAt: Date.now(),
    objects: Object.values(state.board.objects)
  };
  
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  downloadBlob(blob, `xplainerlive-board-${Date.now()}.json`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
