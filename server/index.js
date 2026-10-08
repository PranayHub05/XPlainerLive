const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const roomManager = require('./room-manager');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let pathname = '/';
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = parsedUrl.pathname;
  } catch (e) {
    pathname = req.url.split('?')[0];
  }

  let filePath = path.join(__dirname, '../public', pathname === '/' ? 'index.html' : pathname);
  let extname = path.extname(filePath);

  if (!extname) {
    filePath = path.join(__dirname, '../public', 'index.html');
    extname = '.html';
  }

  let contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT' || err.code === 'EINVAL') {
        fs.readFile(path.join(__dirname, '../public', 'index.html'), (err, content) => {
          if (err) {
            res.writeHead(500);
            res.end('Error loading index.html');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content, 'utf-8');
          }
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const wss = new WebSocketServer({ server });

let connectionIdCounter = 1;

wss.on('connection', (ws, req) => {
  ws.connId = connectionIdCounter++;
  console.log(`Connection established: ${ws.connId}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (!data.type) throw new Error('Message type missing');
      roomManager.handleMessage(ws, data, wss);
    } catch (err) {
      console.error(`Error processing message from ${ws.connId}:`, err);
      ws.send(JSON.stringify({ type: 'room:error', message: 'Invalid message format or error processing request' }));
    }
  });

  ws.on('close', () => {
    console.log(`Connection closed: ${ws.connId}`);
    roomManager.handleDisconnect(ws, wss);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  wss.clients.forEach((client) => client.close());
  server.close(() => {
    process.exit(0);
  });
});
