export function generateId(prefix = 'obj') {
  return prefix + '_' + Math.random().toString(16).slice(2, 10);
}

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateUserId() {
  return 'user_' + Math.random().toString(16).slice(2, 10);
}

export function generateColor(existingColors = []) {
  const palette = ['#60a5fa','#7bd1fa','#19aee8','#a78bfa','#f472b6','#fb923c','#facc15','#4ade80','#2dd4bf','#e879f9','#f87171','#818cf8'];
  const available = palette.filter(c => !existingColors.includes(c));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  return palette[Math.floor(Math.random() * palette.length)];
}

export function sanitizeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const escapeHTML = sanitizeHTML;

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function throttle(fn, delay) {
  let lastCall = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return fn.apply(this, args);
    }
  };
}

export function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function screenToWorld(screenX, screenY, camera) {
  return {
    x: (screenX - camera.x) / camera.zoom,
    y: (screenY - camera.y) / camera.zoom
  };
}

export function worldToScreen(worldX, worldY, camera) {
  return {
    x: worldX * camera.zoom + camera.x,
    y: worldY * camera.zoom + camera.y
  };
}

export function distance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return Promise.resolve();
    } catch (err) {
      document.body.removeChild(textArea);
      return Promise.reject(err);
    }
  }
}
