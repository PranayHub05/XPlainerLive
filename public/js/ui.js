import { getState, setState, subscribe } from './state.js';
import { createRoom, joinRoom, leaveRoom, shareRoom } from './room.js';
import { sanitizeHTML, copyToClipboard, generateRoomCode, getRandomNickname } from './utils.js';
import { setActiveTool, getActiveTool, setCurrentStyle, getCurrentStyle } from './tools.js';
import { undo, redo } from './history.js';
import { setCamera, getCamera } from './renderer.js';
import { exportPNG, exportJSON } from './export.js';
import { initChat, toggleChat } from './chat.js';
import { clearBoard, updateObject } from './whiteboard.js';

export function initUI() {
  // Setup Random Nicknames
  const defaultNick = localStorage.getItem('xplainer_nickname') || getRandomNickname();
  
  const creatorNickInput = document.getElementById('landing-creator-nickname');
  if (creatorNickInput && !creatorNickInput.value) {
    creatorNickInput.value = defaultNick;
  }

  const joinNickInput = document.getElementById('landing-join-nickname');
  if (joinNickInput && !joinNickInput.value) {
    joinNickInput.value = defaultNick;
  }

  // Randomize buttons
  document.getElementById('btn-randomize-create')?.addEventListener('click', () => {
    if (creatorNickInput) {
      creatorNickInput.value = getRandomNickname();
      creatorNickInput.focus();
    }
  });

  document.getElementById('btn-randomize-join')?.addEventListener('click', () => {
    if (joinNickInput) {
      joinNickInput.value = getRandomNickname();
      joinNickInput.focus();
    }
  });

  // Dedicated Section: Instant Create Room
  const handleInstantCreate = () => {
    const nick = (creatorNickInput ? creatorNickInput.value.trim() : '') || getRandomNickname();
    createRoom(nick);
  };

  document.getElementById('instant-create-submit')?.addEventListener('click', handleInstantCreate);
  document.getElementById('create-room-btn')?.addEventListener('click', () => {
    // If nickname already in inline input, create directly, else scroll to section
    const sec = document.getElementById('create-room-section');
    if (sec) {
      sec.scrollIntoView({ behavior: 'smooth' });
      creatorNickInput?.focus();
    } else {
      createRoom();
    }
  });

  document.getElementById('create-room-hero-btn')?.addEventListener('click', () => {
    const sec = document.getElementById('create-room-section');
    if (sec) {
      sec.scrollIntoView({ behavior: 'smooth' });
      creatorNickInput?.focus();
    } else {
      createRoom();
    }
  });

  // Dedicated Section: Join Room
  const landingCodeContainer = document.getElementById('landing-code-container');
  if (landingCodeContainer) {
    initCodeInputs(landingCodeContainer, () => {
      updateLandingJoinBtnText();
    });
  }

  function getLandingCode() {
    const inputs = document.querySelectorAll('#landing-code-container .landing-code-input');
    return Array.from(inputs).map(i => i.value).join('').toUpperCase();
  }

  function updateLandingJoinBtnText() {
    const code = getLandingCode();
    const btn = document.getElementById('landing-join-submit');
    if (btn) {
      btn.innerHTML = `<span class="material-symbols-outlined">login</span> Join Canvas (${code.padEnd(6, '-')})`;
    }
  }

  document.querySelectorAll('#landing-code-container .landing-code-input').forEach(input => {
    input.addEventListener('input', updateLandingJoinBtnText);
  });

  // Paste into landing code inputs
  document.getElementById('landing-paste-code')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const code = text.trim().substring(0, 6).toUpperCase();
      const inputs = document.querySelectorAll('#landing-code-container .landing-code-input');
      code.split('').forEach((char, i) => {
        if (inputs[i]) inputs[i].value = char;
      });
      updateLandingJoinBtnText();
      if (inputs[code.length - 1]) inputs[code.length - 1].focus();
    } catch (e) {
      showToast('Clipboard access denied or empty', 'error');
    }
  });

  // Shuffle button on landing page
  document.getElementById('landing-shuffle-code')?.addEventListener('click', () => {
    const code = generateRoomCode();
    const inputs = document.querySelectorAll('#landing-code-container .landing-code-input');
    code.split('').forEach((char, i) => {
      if (inputs[i]) inputs[i].value = char;
    });
    updateLandingJoinBtnText();
    if (inputs[5]) inputs[5].focus();
  });

  // Landing Join Submit
  document.getElementById('landing-join-submit')?.addEventListener('click', () => {
    const code = getLandingCode();
    const nickname = (joinNickInput ? joinNickInput.value.trim() : '') || getRandomNickname();
    
    if (code.length === 6) {
      joinRoom(code, nickname);
    } else {
      showToast('Please enter all 6 characters of the room code', 'error');
      const inputs = document.querySelectorAll('#landing-code-container .landing-code-input');
      for (const input of inputs) {
        if (!input.value) {
          input.focus();
          break;
        }
      }
    }
  });

  // Hero Join button: smooth scroll to Join Section
  document.getElementById('landing-join-btn')?.addEventListener('click', () => {
    const sec = document.getElementById('join-room-section');
    if (sec) {
      sec.scrollIntoView({ behavior: 'smooth' });
      const firstInput = document.querySelector('#landing-code-container .landing-code-input');
      firstInput?.focus();
    } else {
      showModal('join-modal');
    }
  });

  // Join Modal (for URL join links)
  const joinCodeContainer = document.getElementById('join-code-container');
  if (joinCodeContainer) {
    initCodeInputs(joinCodeContainer, () => {
      const inputs = document.querySelectorAll('#join-code-container .join-code-input');
      const code = Array.from(inputs).map(i => i.value).join('').toUpperCase();
      const joinSubmit = document.getElementById('join-submit');
      if (joinSubmit) joinSubmit.textContent = `Join Room (${code})`;
    });
  }
  
  document.getElementById('join-submit')?.addEventListener('click', () => {
    const inputs = document.querySelectorAll('#join-code-container .join-code-input');
    const code = Array.from(inputs).map(i => i.value).join('').toUpperCase();
    const nickname = document.getElementById('join-nickname')?.value.trim() || getRandomNickname();
    if (code.length === 6 && nickname) {
      hideModal('join-modal');
      joinRoom(code, nickname);
    } else if (code.length !== 6) {
      showToast('Room code must be 6 characters', 'error');
    }
  });
  
  document.getElementById('join-back')?.addEventListener('click', () => hideModal('join-modal'));
  document.getElementById('join-paste-btn')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const code = text.trim().substring(0, 6).toUpperCase();
      const inputs = document.querySelectorAll('#join-code-container .join-code-input');
      code.split('').forEach((char, i) => {
        if (inputs[i]) inputs[i].value = char;
      });
      const joinSubmit = document.getElementById('join-submit');
      if (joinSubmit) joinSubmit.textContent = `Join Room (${code})`;
    } catch (e) {
      showToast('Failed to read clipboard', 'error');
    }
  });

  // Nickname preview
  document.getElementById('join-nickname')?.addEventListener('input', (e) => {
    const preview = document.getElementById('join-avatar-preview');
    const val = e.target.value.trim();
    if (preview) {
      preview.textContent = val ? val.charAt(0).toUpperCase() : '?';
    }
  });

  // Nickname Modal
  document.getElementById('creator-nickname-submit')?.addEventListener('click', () => {
    const nickname = document.getElementById('creator-nickname-input')?.value.trim();
    if (nickname) {
      hideModal('nickname-modal');
    }
  });
  
  document.getElementById('creator-nickname-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('creator-nickname-submit')?.click();
    }
  });

  // Top Bar Actions in Workspace
  document.getElementById('copy-code-btn')?.addEventListener('click', () => {
    const code = getState().room?.code;
    if (code) {
      copyToClipboard(code);
      showToast('Room code copied to clipboard!', 'success');
    }
  });
  document.getElementById('room-code-display')?.addEventListener('click', () => {
    const code = getState().room?.code;
    if (code) {
      copyToClipboard(code);
      showToast('Room code copied to clipboard!', 'success');
    }
  });
  
  document.getElementById('share-btn')?.addEventListener('click', shareRoom);
  document.getElementById('leave-btn')?.addEventListener('click', leaveRoom);

  // Toolbar Tool Buttons (supports all data-tool attributes)
  const toolBtns = document.querySelectorAll('#toolbar [data-tool]');
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (tool) setActiveTool(tool);
    });
  });

  // Undo / Redo
  document.getElementById('undo-btn')?.addEventListener('click', undo);
  document.getElementById('redo-btn')?.addEventListener('click', redo);
  document.getElementById('bottom-undo')?.addEventListener('click', undo);
  document.getElementById('bottom-redo')?.addEventListener('click', redo);

  // Zoom and Fit
  document.getElementById('zoom-in')?.addEventListener('click', () => handleZoom(1.2));
  document.getElementById('zoom-in-bottom')?.addEventListener('click', () => handleZoom(1.2));
  document.getElementById('zoom-out')?.addEventListener('click', () => handleZoom(0.8));
  document.getElementById('zoom-out-bottom')?.addEventListener('click', () => handleZoom(0.8));
  
  const handleFit = () => {
    const camera = getCamera();
    if (camera) {
      setCamera({ ...camera, x: 0, y: 0, zoom: 1 });
    }
  };
  document.getElementById('fit-btn')?.addEventListener('click', handleFit);
  document.getElementById('fit-btn-bottom')?.addEventListener('click', handleFit);
  
  // Grid toggle
  const toggleGridAction = () => {
    const enabled = !getState().board?.gridEnabled;
    setState('board.gridEnabled', enabled);
    localStorage.setItem('xplainer_grid', enabled);
    
    const btn = document.getElementById('grid-toggle');
    if (btn) btn.classList.toggle('active', enabled);
    
    const label = document.getElementById('grid-label');
    if (label) label.textContent = enabled ? 'ON' : 'OFF';
  };
  document.getElementById('grid-toggle')?.addEventListener('click', toggleGridAction);

  // Clear & Export
  document.getElementById('clear-btn')?.addEventListener('click', () => showModal('clear-modal'));
  document.getElementById('clear-confirm')?.addEventListener('click', () => {
    clearBoard(true);
    hideModal('clear-modal');
  });
  document.getElementById('clear-cancel')?.addEventListener('click', () => hideModal('clear-modal'));
  
  document.getElementById('export-png')?.addEventListener('click', exportPNG);
  document.getElementById('export-json')?.addEventListener('click', exportJSON);

  // Style Panel Setup
  initStylePanel();

  // State Subscriptions
  subscribe('ui.currentTool', updateToolbar);
  subscribe('connection.ws', updateConnectionStatus);
  subscribe('camera.zoom', updateZoomDisplay);
  subscribe('users', updateParticipants);
  subscribe('room.code', (code) => {
    const display = document.getElementById('room-code-display');
    if (display && code) display.textContent = code;
  });
  
  // Setup Chat
  initChat();
  
  // Setup modal close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(modal => {
        hideModal(modal.id);
      });
    }
  });
}

function initStylePanel() {
  const stylePanel = document.getElementById('style-panel');
  const strokeColorInput = document.getElementById('stroke-color');
  const fillColorInput = document.getElementById('fill-color');
  const noFillCheck = document.getElementById('no-fill');
  const strokeWidthInput = document.getElementById('stroke-width');
  const opacityInput = document.getElementById('opacity-slider');
  const fontSizeInput = document.getElementById('font-size');

  const applyStyleUpdate = (updates) => {
    setCurrentStyle(updates);
    const selectedIds = getState().selectedIds || [];
    selectedIds.forEach(id => {
      updateObject(id, updates, true);
    });
  };

  strokeColorInput?.addEventListener('input', (e) => applyStyleUpdate({ stroke: e.target.value }));
  fillColorInput?.addEventListener('input', (e) => {
    if (noFillCheck) noFillCheck.checked = false;
    applyStyleUpdate({ fill: e.target.value });
  });
  noFillCheck?.addEventListener('change', (e) => {
    applyStyleUpdate({ fill: e.target.checked ? 'transparent' : (fillColorInput?.value || '#ffffff') });
  });
  strokeWidthInput?.addEventListener('input', (e) => applyStyleUpdate({ strokeWidth: Number(e.target.value) }));
  opacityInput?.addEventListener('input', (e) => applyStyleUpdate({ opacity: Number(e.target.value) }));
  fontSizeInput?.addEventListener('input', (e) => applyStyleUpdate({ fontSize: Number(e.target.value) }));

  // Color Presets - Midnight Black, Electric Cobalt, Acid Lime and companions
  document.querySelectorAll('.color-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      if (color) {
        if (strokeColorInput) strokeColorInput.value = color;
        applyStyleUpdate({ stroke: color });
        document.querySelectorAll('.color-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });

  // Subscribe to selection to show/hide style panel
  subscribe('selectedIds', (selectedIds) => {
    if (!stylePanel) return;
    if (selectedIds && selectedIds.length > 0) {
      stylePanel.classList.remove('hidden');
      const firstObj = getState().board?.objects?.[selectedIds[0]];
      if (firstObj) {
        if (strokeColorInput && firstObj.stroke) strokeColorInput.value = firstObj.stroke;
        if (fillColorInput && firstObj.fill && firstObj.fill !== 'transparent') {
          fillColorInput.value = firstObj.fill;
          if (noFillCheck) noFillCheck.checked = false;
        } else if (noFillCheck) {
          noFillCheck.checked = true;
        }
        if (strokeWidthInput && firstObj.strokeWidth) strokeWidthInput.value = firstObj.strokeWidth;
        if (opacityInput && firstObj.opacity !== undefined) opacityInput.value = firstObj.opacity;
        if (fontSizeInput && firstObj.fontSize) fontSizeInput.value = firstObj.fontSize;
      }
    } else {
      stylePanel.classList.add('hidden');
    }
  });
}

function handleZoom(factor) {
  const camera = getCamera();
  if (camera) {
    let newZoom = camera.zoom * factor;
    newZoom = Math.max(0.1, Math.min(newZoom, 5));
    setCamera({ ...camera, zoom: newZoom });
  }
}

export function showView(viewName) {
  document.getElementById('landing-view')?.classList.add('hidden');
  document.getElementById('workspace-view')?.classList.add('hidden');
  
  const view = document.getElementById(viewName);
  if (view) {
    view.classList.remove('hidden');
    setState('ui.currentView', viewName);
  }
}

export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
  
  while (container.children.length > 3) {
    container.firstChild.remove();
  }
}

export function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    const firstInput = modal.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }
}

export function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
  }
}

export function updateConnectionStatus(status) {
  const badge = document.getElementById('connection-status');
  const text = document.getElementById('connection-text');
  if (!badge || !text) return;
  
  badge.className = 'badge';
  if (status === 'connected') {
    badge.classList.add('badge-connected');
    text.textContent = 'Live Synced';
  } else if (status === 'reconnecting') {
    badge.classList.add('badge-reconnecting');
    text.textContent = 'Reconnecting...';
  } else {
    badge.classList.add('badge-offline');
    text.textContent = 'Offline';
  }
}

export function updateParticipants(users) {
  const container = document.getElementById('participants-container');
  const chatCount = document.getElementById('chat-online-count');
  if (!container) return;
  
  container.innerHTML = '';
  
  const safeUsers = Array.isArray(users) ? users : [];
  const localUser = getState().localUser;
  const allUsers = (localUser && localUser.id) ? [localUser, ...safeUsers.filter(u => u && u.id !== localUser.id)] : safeUsers;
  
  if (chatCount) chatCount.textContent = `${allUsers.length} live`;
  
  const displayLimit = 4;
  const toDisplay = allUsers.slice(0, displayLimit);
  
  toDisplay.forEach(u => {
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.style.backgroundColor = u.color || '#1558C9';
    avatar.style.borderColor = u.color === '#F4FF24' ? '#030407' : '#F4FF24';
    avatar.style.color = u.color === '#F4FF24' ? '#030407' : '#ffffff';
    avatar.title = u.nickname || 'Anonymous';
    avatar.textContent = u.nickname ? u.nickname.substring(0, 2).toUpperCase() : '??';
    container.appendChild(avatar);
  });
  
  if (allUsers.length > displayLimit) {
    const overflow = document.createElement('div');
    overflow.className = 'avatar avatar-overflow';
    overflow.style.backgroundColor = '#1558C9';
    overflow.textContent = `+${allUsers.length - displayLimit}`;
    container.appendChild(overflow);
  }
}

export function updateZoomDisplay(zoom) {
  const display = document.getElementById('zoom-display');
  if (display) {
    display.textContent = `${Math.round(zoom * 100)}%`;
  }
}

export function updateToolbar(activeTool) {
  document.querySelectorAll('#toolbar [data-tool]').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`#toolbar [data-tool="${activeTool}"]`) || document.getElementById(`tool-${activeTool}`);
  if (activeBtn) activeBtn.classList.add('active');
}

export function initCodeInputs(container, onComplete) {
  const inputs = container.querySelectorAll('input');
  
  inputs.forEach((input, index) => {
    input.maxLength = 1;
    
    input.addEventListener('input', (e) => {
      input.value = input.value.toUpperCase();
      if (input.value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
      
      const allFilled = Array.from(inputs).every(i => i.value.length === 1);
      if (allFilled && typeof onComplete === 'function') onComplete();
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        inputs[index - 1].focus();
        inputs[index - 1].value = '';
      }
    });
    
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').toUpperCase();
      const chars = pasted.replace(/[^A-Z0-9]/g, '').split('');
      
      let curr = index;
      for (const char of chars) {
        if (curr < inputs.length) {
          inputs[curr].value = char;
          curr++;
        }
      }
      
      if (curr < inputs.length) {
        inputs[curr].focus();
      } else {
        inputs[inputs.length - 1].focus();
        if (typeof onComplete === 'function') onComplete();
      }
    });
  });
}
