const fs = require('fs');

const jsFiles = fs.readdirSync('public/js').filter(f => f.endsWith('.js'));

for (const file of jsFiles) {
  const content = fs.readFileSync('public/js/' + file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('.addEventListener') && !line.includes('?.addEventListener') && !line.includes('window.addEventListener') && !line.includes('document.addEventListener')) {
      console.log(`${file}:${idx + 1} -> ${line.trim()}`);
    }
  });
}
