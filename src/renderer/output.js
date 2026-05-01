import * as THREE from '../../node_modules/three/build/three.module.js';

const api = window.takeMeThere;
const root = document.querySelector('#output-app');
root.innerHTML = `<main class="output-shell"><div class="output-grid three-wall" id="grid"></div><div id="blackout"></div></main>`;

const grid = document.querySelector('#grid');
const blackout = document.querySelector('#blackout');
let views = [];
let currentImage = '';
let currentPalette = ['#050816', '#0f766e', '#67e8f9', '#f8fafc'];
let currentStateKey = 'IDLE';

const VIEW_CONFIGS = {
  left: { label: 'LEFT', yaw: Math.PI / 2.6, pitch: 0, fov: 78 },
  front: { label: 'FRONT', yaw: 0, pitch: 0, fov: 78 },
  right: { label: 'RIGHT', yaw: -Math.PI / 2.6, pitch: 0, fov: 78 },
  ceiling: { label: 'CEILING', yaw: 0, pitch: Math.PI / 2.8, fov: 82 }
};

class WorldView {
  constructor(cell, name) {
    this.cell = cell;
    this.name = name;
    this.config = VIEW_CONFIGS[name];
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.003);
    this.camera = new THREE.PerspectiveCamera(this.config.fov, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 0.1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.cell.appendChild(this.renderer.domElement);

    const sphereGeometry = new THREE.SphereGeometry(80, 96, 48);
    sphereGeometry.scale(-1, 1, 1);
    this.worldMaterial = new THREE.MeshBasicMaterial({ map: createDefaultTexture(currentPalette), transparent: true, opacity: 0.94 });
    this.world = new THREE.Mesh(sphereGeometry, this.worldMaterial);
    this.scene.add(this.world);

    this.colorWash = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(currentPalette[1]), transparent: true, opacity: 0.055, side: THREE.BackSide, blending: THREE.AdditiveBlending }));
    this.scene.add(this.colorWash);
    this.particles = this.createParticles();
    this.scene.add(this.particles);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.cell);
    this.resize();
  }

  createParticles() {
    const count = 420;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const radius = 12 + Math.random() * 42;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      color.set(currentPalette[i % currentPalette.length]);
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.46, blending: THREE.AdditiveBlending, depthWrite: false }));
  }

  resize() {
    const { width, height } = this.cell.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setTexture(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    this.worldMaterial.map = texture;
    this.worldMaterial.needsUpdate = true;
  }

  setPalette(palette) {
    currentPalette = palette;
    this.colorWash.material.color = new THREE.Color(palette[1]);
  }

  render(elapsed) {
    const stateEnergy = getStateEnergy(currentStateKey);
    // Single shared pan: all views rotate together so content flows right → front → left
    this.world.rotation.y = elapsed * 0.006;
    this.particles.rotation.y = elapsed * (0.012 + stateEnergy * 0.01);
    this.particles.rotation.x = Math.sin(elapsed * 0.04) * 0.07;
    this.particles.material.opacity = 0.22 + stateEnergy * 0.34;
    this.colorWash.material.opacity = 0.025 + stateEnergy * 0.075;
    // Camera stays locked to its wall angle with only a very subtle vertical breathe
    const pitch = this.config.pitch + Math.sin(elapsed * 0.009) * 0.008;
    this.camera.lookAt(new THREE.Vector3(Math.sin(this.config.yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(this.config.yaw) * Math.cos(pitch)));
    this.renderer.render(this.scene, this.camera);
  }

  dispose() { this.resizeObserver.disconnect(); this.renderer.dispose(); this.cell.querySelector('canvas')?.remove(); }
}

function setupViews(layoutMode = 'three-wall') {
  for (const view of views) view.dispose();
  views = [];
  const names = layoutMode === 'ceiling' ? ['left', 'front', 'right', 'ceiling'] : ['left', 'front', 'right'];
  grid.className = `output-grid ${layoutMode}`;
  grid.innerHTML = names.map((name) => `<section class="view-cell" data-view="${name}"><div class="view-label">${VIEW_CONFIGS[name].label}</div></section>`).join('');
  for (const cell of grid.querySelectorAll('.view-cell')) views.push(new WorldView(cell, cell.dataset.view));
  if (currentImage) loadTexture(currentImage, true);
}

function loadTexture(imageDataUrl, force = false) {
  if (!imageDataUrl || (!force && imageDataUrl === currentImage)) return;
  currentImage = imageDataUrl;
  new THREE.TextureLoader().load(
    imageDataUrl,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      for (const view of views) view.setTexture(texture.clone());
    },
    undefined,
    (err) => console.error('[takemethere] texture load failed', err)
  );
}

function createDefaultTexture(palette) {
  const canvas = document.createElement('canvas');
  canvas.width = 1920; canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(960, 440, 20, 960, 540, 980);
  gradient.addColorStop(0, palette[2] || '#67e8f9'); gradient.addColorStop(0.48, palette[1] || '#0f766e'); gradient.addColorStop(1, palette[0] || '#050816');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.26;
  for (let i = 0; i < 90; i += 1) { ctx.fillStyle = palette[i % palette.length] || '#fff'; ctx.beginPath(); ctx.arc((i * 137) % canvas.width, (i * 251) % canvas.height, 2 + (i % 14), 0, Math.PI * 2); ctx.fill(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function getStateEnergy(stateKey) {
  return { IDLE: 0.12, LISTENING: 0.22, UNDERSTANDING: 0.32, GENERATING: 0.52, PORTAL_OPENING: 0.72, ARRIVAL: 0.86, WORLD_ACTIVE: 0.46, EXIT: 0.2, ERROR_FALLBACK: 0.38 }[stateKey] || 0.18;
}

function renderSession(session) {
  currentStateKey = session.state?.key || 'IDLE';
  blackout.className = currentStateKey === 'BLACKOUT' ? 'blackout-overlay' : '';
  const palette = session.recipe?.palette || currentPalette;
  for (const view of views) view.setPalette(palette);
  if (session.layoutMode && !grid.classList.contains(session.layoutMode)) setupViews(session.layoutMode);
  if (session.imageDataUrl) loadTexture(session.imageDataUrl);
}

function animate() { const elapsed = performance.now() / 1000; for (const view of views) view.render(elapsed); requestAnimationFrame(animate); }

setupViews('three-wall');
animate();
api.onSessionUpdate(renderSession);
api.getSession().then(renderSession);
