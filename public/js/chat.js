import { MessageType } from './protocol.js';
import { sendWS, onWSMessage } from './websocket.js';
import { getState, setState } from './state.js';
import { sanitizeHTML, getTimestamp } from './utils.js';

let isChatOpen = false;

export function initChat() {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const collapseBtn = document.getElementById('chat-collapse');
  const expandBtn = document.getElementById('chat-expand');
  
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input ? input.value.trim() : '';
    if (text && text.length <= 1000) {
      sendWS(MessageType.CHAT_MESSAGE, { text });
      if (input) input.value = '';
    }
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form?.dispatchEvent(new Event('submit'));
    }
  });

  collapseBtn?.addEventListener('click', () => setChatOpen(false));
  expandBtn?.addEventListener('click', () => setChatOpen(true));

  onWSMessage(MessageType.CHAT_MESSAGE, addChatMessage);
}

export function sendChatMessage(text) {
  if (text && text.trim().length > 0) {
    sendWS(MessageType.CHAT_MESSAGE, { text: text.trim() });
  }
}

export function addChatMessage(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
  
  const safeText = sanitizeHTML(msg.text);
  const safeName = sanitizeHTML(msg.nickname || 'Unknown');
  const timeStr = getTimestamp();
  
  const emptyState = container.querySelector('.chat-empty-state');
  if (emptyState) emptyState.remove();

  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  msgDiv.innerHTML = `
    <div class="chat-message-header">
      <span class="chat-message-sender" style="color: ${msg.color || '#F4FF24'}">${safeName}</span>
      <span class="chat-message-time">${timeStr}</span>
    </div>
    <div class="chat-message-text">${safeText}</div>
  `;
  
  container.appendChild(msgDiv);
  
  if (wasAtBottom) {
    container.scrollTop = container.scrollHeight;
  }
  
  if (!isChatOpen) {
    const unread = (getState().ui?.unreadChat || 0) + 1;
    setState('ui.unreadChat', unread);
    const badge = document.getElementById('chat-badge');
    if (badge) {
      badge.textContent = unread;
      badge.classList.remove('hidden');
    }
  }
}

export function toggleChat() {
  setChatOpen(!isChatOpen);
}

export function setChatOpen(open) {
  isChatOpen = open;
  setState('ui.chatOpen', open);
  
  const panel = document.getElementById('chat-panel');
  const expandBtn = document.getElementById('chat-expand');
  const badge = document.getElementById('chat-badge');
  
  if (open) {
    panel?.classList.remove('hidden');
    expandBtn?.classList.add('hidden');
    setState('ui.unreadChat', 0);
    if (badge) badge.classList.add('hidden');
    
    const container = document.getElementById('chat-messages');
    if (container) container.scrollTop = container.scrollHeight;
  } else {
    panel?.classList.add('hidden');
    expandBtn?.classList.remove('hidden');
  }
}
