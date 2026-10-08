# XPlainerLive — Real-Time Collaborative Explanation Whiteboard

XPlainerLive is a polished, high-performance, real-time collaborative explanation whiteboard designed for students, teachers, developers, interviewers, tutors, presenters, and small teams.

Explain together. Draw together. Understand together.

---

## 1. Features

- **Instant 6-Character Rooms**: Ephemeral sessions using non-ambiguous alphanumeric codes (e.g. `X7K9Q2`). Zero login, zero signup.
- **Multiplayer Vector Whiteboard**: Freehand pen, lines, arrows, rectangles, ellipses, diamonds, text, and eraser.
- **Excalidraw & Figma-Inspired Usability**:
  - World coordinate system with infinite canvas pan and zoom (10% to 500%).
  - Selection bounding boxes with drag, resize handles, and delete.
  - Multi-line in-place text editing.
  - Local dot grid toggle (ON / OFF) that remains stable across pan and zoom.
  - Contextual style toolbar (stroke color, fill color, no-fill toggle, stroke width, opacity, font size, preset palette).
  - Local undo and redo history (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z).
  - Export to PNG, SVG, and JSON.
- **P2P WebRTC DataChannel Synchronization**:
  - Sub-15ms semantic drawing operations (strokes, shapes, text updates).
  - High-frequency live cursors with name tags and user-specific accent colors.
  - "Who Is Drawing?" transient indicator overlays positioned directly over active interactions.
  - Full board state synchronization for late-joining participants.
- **Real-Time Room Chat**:
  - Collapsible floating glassmorphic chat tray.
  - Unread badge counters.
  - Message timestamps and nickname grouping.
  - Full sanitization preventing XSS.
- **Resilient Room Lifecycle & Presence**:
  - Host election and automatic handoff when the host disconnects.
  - Auto-reconnection with exponential backoff on network drop.
  - Clean memory cleanup when all participants leave.

---

## 2. Tech Stack

- **Frontend**: Plain HTML5, Pure CSS3 (Google Stitch navy/dark design system, glassmorphism), Vanilla JavaScript (modular ES modules), HTML5 Canvas API, WebRTC DataChannels, WebSocket. No React, no Tailwind, no bootstrap.
- **Backend**: Node.js HTTP server + `ws` WebSocket signaling server.
- **Deployment**: Static hosting via Vercel (`vercel.json`) with WebSocket backend compatibility.

---

## 3. Installation & Getting Started

### Prerequisites
- Node.js (v18+)
- npm (v9+)

### Installation
```bash
git clone <repo-url>
cd XPlainerLive
npm install
```

### Local Development
```bash
npm run dev
# or: node server/index.js
```

Open `http://localhost:3000` in your browser.

---

## 4. How It Works

### Room Codes
Room codes are 6-character uppercase alphanumeric strings generated using a curated character set:
`ABCDEFGHJKLMNPQRTUVWXYZ2346789`
Ambiguous characters (`O/0`, `I/1`, `S/5`) are eliminated to ensure codes are easy to read and transcribe.

### WebSocket Signaling Architecture
WebSockets are used for low-frequency, reliable room coordination and chat messages:
- `room:create` / `room:join` / `room:joined` / `room:error`
- `user:joined` / `user:left` / `room:host`
- `webrtc:offer` / `webrtc:answer` / `webrtc:ice`
- `chat:message` / `board:clear`

### WebRTC P2P DataChannels
Once signaling connects peers in a room, direct `RTCDataChannel` connections are created in a mesh topology:
- **Ordered DataChannel (`xplainer`)**: Used for semantic board operations (`board:op`), full state requests (`board:sync-request`), and full state payloads (`board:sync`).
- **Realtime Interaction**: Used for high-frequency cursor coordinates (`cursor:update`) and drawing activity indicators (`drawing:status`).
- No full-canvas screenshots or large bitmaps are transmitted; only compact semantic vectors and point deltas are exchanged.

### Board Synchronization Protocol
1. When a new peer establishes an open DataChannel:
   - If the local user is the current room host, the host automatically sends `board:sync` with all current objects.
   - If the local user is not the host, they issue `board:sync-request` to obtain the canonical scene graph.
2. The joining client reconstructs the scene locally in memory and requests a canvas repaint.
3. Subsequent operations (creates, moves, updates, deletes) stream incrementally via `board:op`.

### Host Authority & Automatic Election
- The room creator starts as the initial host.
- When the host leaves or disconnects, the server immediately elects the oldest remaining peer as the new host and broadcasts `room:host`.
- When all participants leave, the room resources and timeouts are cleaned up after a grace period.

---

## 5. Project Structure

```text
XPlainerLive/
├── public/
│   ├── favicon.svg              # App icon
│   ├── index.html               # Main SPA entrypoint
│   ├── css/
│   │   ├── variables.css        # Stitch design tokens (navy/dark, fonts, animations)
│   │   ├── base.css             # Resets, typography, scrollbar normalization
│   │   ├── layout.css           # Landing & workspace layouts, glassmorphism
│   │   ├── components.css       # Buttons, cards, modals, chips, badges, avatars
│   │   ├── whiteboard.css       # Canvas viewport, style panel, empty states
│   │   └── responsive.css       # Desktop, tablet, and mobile breakpoints
│   └── js/
│       ├── app.js               # Application coordinator & workspace setup
│       ├── protocol.js          # Shared protocol constants & message formatting
│       ├── state.js             # Reactive centralized state store
│       ├── utils.js             # Math, transforms, sanitization, room code generators
│       ├── websocket.js         # WebSocket client with exponential backoff reconnect
│       ├── webrtc.js            # WebRTC mesh network & DataChannel manager
│       ├── whiteboard.js        # Scene graph, hit testing, bounding boxes, ops
│       ├── renderer.js          # requestAnimationFrame 60 FPS canvas engine
│       ├── tools.js             # Pointer Events input handling & shortcuts
│       ├── history.js           # Local undo/redo action stack
│       ├── cursor.js            # Live cursor interpolation & broadcast
│       ├── presence.js          # Participant presence & "Who Is Drawing?" overlays
│       ├── chat.js              # Live chat tray & unread message counter
│       ├── export.js            # PNG, SVG, and JSON export utilities
│       └── ui.js                # DOM orchestration, modals, toasts, toolbars
├── server/
│   ├── index.js                 # HTTP static server & WebSocket server
│   └── room-manager.js          # Ephemeral room lifecycle, host election & signaling
├── package.json
├── vercel.json                  # Static hosting deployment configuration
└── README.md
```

---

## 6. How to Test Multiple Clients Locally

1. Start the server:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:3000` in **Browser Tab 1**.
3. Click **Create Instant Room**, enter a nickname (e.g. `Pranay`), and enter the canvas.
4. Copy the 6-character room code from the top bar (e.g. `X7K9Q2`).
5. Open an incognito window or **Browser Tab 2**, navigate to `http://localhost:3000`.
6. Click **Join with Code** (or visit `http://localhost:3000/?room=X7K9Q2`), enter nickname (e.g. `Alex`), and click **Join Room**.
7. Test live collaboration:
   - Draw shapes, freehand pen strokes, or text in Tab 1 -> verify instant rendering in Tab 2.
   - Move mouse in Tab 1 -> observe Alex's live cursor moving in Tab 2.
   - Send chat message in Tab 2 -> instant message notification in Tab 1.
   - While drawing in Tab 1 -> observe the transient `[Pranay - drawing]` indicator overlay in Tab 2.
   - Toggle grid in Tab 1 -> local grid displays without affecting Tab 2 or coordinate transforms.

---

## 7. Vercel & Production Deployment

The frontend is fully configured for static hosting via Vercel (`vercel.json`):
- All SPA routes redirect to `/index.html`.
- CORS headers are configured.

In production, run the WebSocket server on any Node.js host (such as Railway, Render, Fly.io, or AWS ECS). Set `PORT` as needed. The frontend automatically switches to `wss://` on `https://` origins.

---

## 8. Known MVP Limitations

- Optimized for rooms of 2–8 concurrent participants using a full-mesh WebRTC topology. For larger enterprise rooms (50+ participants), an SFU/selective forwarding router architecture would be recommended.
- Ephemeral rooms are preserved in-memory for active sessions; closing all tabs cleans up room data after 30 seconds.
- Session chat is temporary and tied to the active room session.

---

## 9. License

MIT
