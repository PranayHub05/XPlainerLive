const fs = require('fs');

// Check all document.getElementById calls in ui.js, app.js, chat.js, tools.js, whiteboard.js, renderer.js, background.js
const html = fs.readFileSync('public/index.html', 'utf8');

const jsFiles = ['app.js', 'ui.js', 'chat.js', 'tools.js', 'whiteboard.js', 'renderer.js', 'background.js', 'room.js'];

let missingIds = [];

for (const file of jsFiles) {
  const content = fs.readFileSync('public/js/' + file, 'utf8');
  const regex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const id = match[1];
    if (!html.includes(`id="${id}"`) && !missingIds.includes(id)) {
      missingIds.push({ file, id });
    }
  }
}

console.log('Missing IDs found across JS files:', missingIds);
