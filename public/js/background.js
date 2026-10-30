/**
 * Ambient Cyber-Mesh & Depth of Field Visuals
 * Theme: Midnight Black (#030407), Electric Cobalt (#1558C9), Acid Lime (#F4FF24)
 */

let animationId = null;
let canvas, ctx;
let particles = [];
let mouse = { x: -1000, y: -1000, targetX: 0, targetY: 0 };
let isRunning = false;

export function initBackground() {
  canvas = document.getElementById('bg-particle-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d', { alpha: true });
  
  resize();
  window.addEventListener('resize', resize);
  
  window.addEventListener('mousemove', (e) => {
    mouse.targetX = (e.clientX - window.innerWidth / 2) * 0.05;
    mouse.targetY = (e.clientY - window.innerHeight / 2) * 0.05;
  });

  createParticles();
  startBackground();
}

function resize() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function createParticles() {
  particles = [];
  const count = Math.min(Math.floor((window.innerWidth * window.innerHeight) / 16000), 75);
  
  for (let i = 0; i < count; i++) {
    const isLime = Math.random() < 0.22;
    const depth = Math.random(); // 0 (far/blurred) to 1 (close/sharp)
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * (0.3 + depth * 0.5),
      vy: (Math.random() - 0.5) * (0.3 + depth * 0.5),
      radius: (1 + depth * 2.5),
      depth: depth,
      color: isLime ? '#F4FF24' : '#1558C9',
      baseAlpha: isLime ? (0.2 + depth * 0.5) : (0.15 + depth * 0.45)
    });
  }
}

function animate() {
  if (!isRunning || !ctx) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Smooth mouse parallax
  mouse.x += (mouse.targetX - mouse.x) * 0.05;
  mouse.y += (mouse.targetY - mouse.y) * 0.05;
  
  const w = canvas.width;
  const h = canvas.height;
  
  // Draw connecting laser mesh lines for nearby particles
  for (let i = 0; i < particles.length; i++) {
    const p1 = particles[i];
    
    // Update position
    p1.x += p1.vx;
    p1.y += p1.vy;
    
    // Wrap around screen boundaries
    if (p1.x < -20) p1.x = w + 20;
    else if (p1.x > w + 20) p1.x = -20;
    if (p1.y < -20) p1.y = h + 20;
    else if (p1.y > h + 20) p1.y = -20;
    
    // Connect to neighbors
    for (let j = i + 1; j < particles.length; j++) {
      const p2 = particles[j];
      const dx = (p1.x + mouse.x * p1.depth) - (p2.x + mouse.x * p2.depth);
      const dy = (p1.y + mouse.y * p1.depth) - (p2.y + mouse.y * p2.depth);
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const maxDist = 130 + p1.depth * 30;
      if (dist < maxDist) {
        const lineAlpha = (1 - dist / maxDist) * 0.16 * p1.depth;
        ctx.strokeStyle = p1.color === '#F4FF24' || p2.color === '#F4FF24' 
          ? `rgba(244, 255, 36, ${lineAlpha * 0.9})` 
          : `rgba(21, 88, 201, ${lineAlpha})`;
        ctx.lineWidth = 0.8 * p1.depth;
        ctx.beginPath();
        ctx.moveTo(p1.x + mouse.x * p1.depth, p1.y + mouse.y * p1.depth);
        ctx.lineTo(p2.x + mouse.x * p2.depth, p2.y + mouse.y * p2.depth);
        ctx.stroke();
      }
    }
    
    // Render particle
    const drawX = p1.x + mouse.x * p1.depth;
    const drawY = p1.y + mouse.y * p1.depth;
    
    ctx.save();
    // Depth of field simulated blur via arc & shadow
    if (p1.depth < 0.4) {
      // Blurred background dust
      ctx.fillStyle = p1.color;
      ctx.globalAlpha = p1.baseAlpha * 0.5;
      ctx.beginPath();
      ctx.arc(drawX, drawY, p1.radius * 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Crisp foreground node with glow
      ctx.fillStyle = p1.color;
      ctx.globalAlpha = p1.baseAlpha;
      ctx.shadowColor = p1.color;
      ctx.shadowBlur = p1.color === '#F4FF24' ? 12 : 8;
      ctx.beginPath();
      ctx.arc(drawX, drawY, p1.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  
  animationId = requestAnimationFrame(animate);
}

export function startBackground() {
  if (isRunning) return;
  isRunning = true;
  animate();
}

export function stopBackground() {
  isRunning = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}
