import * as THREE from '../../node_modules/three/build/three.module.js';

const api = window.takeMeThere;
const root = document.querySelector('#output-app');
const params = new URLSearchParams(window.location.search);
const standaloneView = ['left', 'front', 'right', 'ceiling'].includes(params.get('view')) ? params.get('view') : '';
root.innerHTML = `<main class="output-shell"><div class="output-grid three-wall${standaloneView ? ' single-view' : ''}" id="grid"></div><div id="blackout"></div></main>`;

const grid = document.querySelector('#grid');
const blackout = document.querySelector('#blackout');
let views = [];
let currentImageSource = '';
let currentDepthSource = '';
let currentImageFallback = '';
let currentDepthFallback = '';
let loadedImageSource = '';
let loadedDepthSource = '';
let currentPalette = ['#050816', '#0f766e', '#67e8f9', '#f8fafc'];
let currentStateKey = 'IDLE';
let currentVisualMode = 'auto';
let currentDepthStatus = 'idle';
let currentProjectorConfig = { leftYaw: 69, frontYaw: 0, rightYaw: -69, fov: 78, ceilingPitch: 64, ceilingFov: 82 };

const VIEW_CONFIGS = {
  left: { label: 'LEFT', yaw: Math.PI / 2.6, pitch: 0, fov: 78 },
  front: { label: 'FRONT', yaw: 0, pitch: 0, fov: 78 },
  right: { label: 'RIGHT', yaw: -Math.PI / 2.6, pitch: 0, fov: 78 },
  ceiling: { label: 'CEILING', yaw: 0, pitch: Math.PI / 2.8, fov: 82 }
};

function configForView(name) {
  const base = VIEW_CONFIGS[name];
  if (name === 'left') return { ...base, yaw: degToRad(currentProjectorConfig.leftYaw), fov: currentProjectorConfig.fov };
  if (name === 'front') return { ...base, yaw: degToRad(currentProjectorConfig.frontYaw), fov: currentProjectorConfig.fov };
  if (name === 'right') return { ...base, yaw: degToRad(currentProjectorConfig.rightYaw), fov: currentProjectorConfig.fov };
  if (name === 'ceiling') return { ...base, pitch: degToRad(currentProjectorConfig.ceilingPitch), fov: currentProjectorConfig.ceilingFov };
  return base;
}

function degToRad(deg) {
  return deg * Math.PI / 180;
}

class WorldView {
  constructor(cell, name) {
    this.cell = cell;
    this.name = name;
    this.config = configForView(name);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.003);
    this.camera = new THREE.PerspectiveCamera(this.config.fov, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 0.1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.cell.appendChild(this.renderer.domElement);

    const sphereGeometry = new THREE.SphereGeometry(80, 128, 64);
    sphereGeometry.scale(-1, 1, 1);
    this.worldMaterial = new THREE.MeshBasicMaterial({ map: createDefaultTexture(currentPalette), transparent: true, opacity: 0.94 });
    this.world = new THREE.Mesh(sphereGeometry, this.worldMaterial);
    this.scene.add(this.world);

    this.depthMaterial = createDepthMaterial(createDefaultTexture(currentPalette), createDefaultDepthTexture());
    this.depthWorld = new THREE.Mesh(sphereGeometry.clone(), this.depthMaterial);
    this.depthWorld.visible = false;
    this.scene.add(this.depthWorld);

    this.colorWash = new THREE.Mesh(
      new THREE.SphereGeometry(30, 48, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(currentPalette[1]), transparent: true, opacity: 0.055, side: THREE.BackSide, blending: THREE.AdditiveBlending })
    );
    this.scene.add(this.colorWash);

    this.particles = this.createParticles();
    this.scene.add(this.particles);
    this.warp = this.createWarpField();
    this.scene.add(this.warp.lines);
    this.scene.add(this.warp.glow);

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
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.46, blending: THREE.AdditiveBlending, depthWrite: false }));
  }

  createWarpField() {
    const count = 260;
    const positions = new Float32Array(count * 2 * 3);
    const colors = new Float32Array(count * 2 * 3);
    const seeds = [];
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      color.set(currentPalette[i % currentPalette.length] || '#ffffff');
      colors.set([color.r, color.g, color.b, color.r, color.g, color.b], i * 6);
      seeds.push({
        x: (Math.random() - 0.5) * 42,
        y: (Math.random() - 0.5) * 24,
        z: 12 + Math.random() * 74,
        speed: 4 + Math.random() * 7,
        len: 1.2 + Math.random() * 3.8,
        phase: Math.random() * Math.PI * 2
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    lines.visible = false;

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(24, 48, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(currentPalette[2]), transparent: true, opacity: 0.035, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.visible = false;
    return { lines, glow, seeds, positions };
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
    this.depthMaterial.uniforms.map.value = texture.clone();
  }

  setDepthTexture(texture) {
    this.depthMaterial.uniforms.depthMap.value = texture;
  }

  setPalette(palette) {
    currentPalette = palette;
    this.colorWash.material.color = new THREE.Color(palette[1]);
    this.warp.glow.material.color = new THREE.Color(palette[2] || palette[1]);
  }

  setProjectorConfig() {
    this.config = configForView(this.name);
    this.camera.fov = this.config.fov;
    this.camera.updateProjectionMatrix();
  }

  render(elapsed) {
    const stateEnergy = getStateEnergy(currentStateKey);
    const warpEnergy = getWarpEnergy(currentStateKey);
    const showWarp = warpEnergy > 0;
    const showDepth = shouldUseDepth();
    this.world.visible = !showWarp && !showDepth;
    this.depthWorld.visible = !showWarp && showDepth;
    this.warp.lines.visible = showWarp;
    this.warp.glow.visible = showWarp;

    this.world.rotation.y = elapsed * 0.006;
    this.depthWorld.rotation.y = this.world.rotation.y;
    this.depthMaterial.uniforms.time.value = elapsed;
    this.depthMaterial.uniforms.strength.value = 2.5 + stateEnergy * 5.5;
    this.particles.rotation.y = elapsed * (0.012 + stateEnergy * 0.01);
    this.particles.rotation.x = Math.sin(elapsed * 0.04) * 0.07;
    this.particles.material.opacity = showWarp ? 0.05 : 0.22 + stateEnergy * 0.34;
    this.colorWash.material.opacity = showWarp ? 0.012 + warpEnergy * 0.05 : 0.025 + stateEnergy * 0.075;
    if (showWarp) this.updateWarp(elapsed, warpEnergy);

    const pitch = this.config.pitch + Math.sin(elapsed * 0.009) * 0.008;
    this.camera.lookAt(new THREE.Vector3(Math.sin(this.config.yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(this.config.yaw) * Math.cos(pitch)));
    this.renderer.render(this.scene, this.camera);
  }

  updateWarp(elapsed, energy) {
    const forward = new THREE.Vector3(Math.sin(this.config.yaw), Math.sin(this.config.pitch) * 0.18, -Math.cos(this.config.yaw)).normalize();
    const right = new THREE.Vector3(Math.cos(this.config.yaw), 0, Math.sin(this.config.yaw)).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const range = 84;
    const near = 7;
    const speedScale = 0.45 + energy * 1.4;
    const pull = 1 - energy * 0.38;

    for (let i = 0; i < this.warp.seeds.length; i += 1) {
      const seed = this.warp.seeds[i];
      const z = near + ((seed.z - elapsed * seed.speed * speedScale + range * 100) % range);
      const shimmer = Math.sin(elapsed * 0.8 + seed.phase) * 0.7;
      const x = (seed.x + shimmer) * pull;
      const y = (seed.y + shimmer * 0.35) * pull;
      const len = seed.len * (0.8 + energy * 2.8);
      const p1 = forward.clone().multiplyScalar(z).add(right.clone().multiplyScalar(x)).add(up.clone().multiplyScalar(y));
      const p2 = forward.clone().multiplyScalar(z + len).add(right.clone().multiplyScalar(x * 0.96)).add(up.clone().multiplyScalar(y * 0.96));
      this.warp.positions.set([p1.x, p1.y, p1.z, p2.x, p2.y, p2.z], i * 6);
    }
    this.warp.lines.geometry.attributes.position.needsUpdate = true;
    this.warp.lines.material.opacity = 0.12 + energy * 0.3;
    this.warp.glow.material.opacity = 0.018 + energy * 0.07;
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.cell.querySelector('canvas')?.remove();
  }
}

function setupViews(layoutMode = 'three-wall') {
  for (const view of views) view.dispose();
  views = [];
  const names = standaloneView ? [standaloneView] : layoutMode === 'ceiling' ? ['left', 'front', 'right', 'ceiling'] : ['left', 'front', 'right'];
  grid.className = `output-grid ${layoutMode}${standaloneView ? ' single-view' : ''}`;
  grid.innerHTML = names.map((name) => `<section class="view-cell" data-view="${name}"><div class="view-label">${VIEW_CONFIGS[name].label}</div></section>`).join('');
  for (const cell of grid.querySelectorAll('.view-cell')) views.push(new WorldView(cell, cell.dataset.view));
  if (currentImageSource) loadTexture(currentImageSource, currentImageFallback, true);
  if (currentDepthSource) loadDepthTexture(currentDepthSource, currentDepthFallback, true);
}

function loadTexture(imageSource, fallbackSource = '', force = false) {
  if (!imageSource || (!force && imageSource === currentImageSource)) return;
  currentImageSource = imageSource;
  currentImageFallback = fallbackSource;
  new THREE.TextureLoader().load(
    imageSource,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      for (const view of views) view.setTexture(texture.clone());
      loadedImageSource = imageSource;
      console.info('[takemethere] texture loaded', imageSource);
    },
    undefined,
    (err) => {
      console.error('[takemethere] texture load failed', imageSource, err);
      if (fallbackSource && fallbackSource !== imageSource) loadTexture(fallbackSource, '', true);
    }
  );
}

function loadDepthTexture(depthSource, fallbackSource = '', force = false) {
  if (!depthSource || (!force && depthSource === currentDepthSource)) return;
  currentDepthSource = depthSource;
  currentDepthFallback = fallbackSource;
  new THREE.TextureLoader().load(
    depthSource,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      for (const view of views) view.setDepthTexture(texture.clone());
      loadedDepthSource = depthSource;
      console.info('[takemethere] depth texture loaded', depthSource);
    },
    undefined,
    (err) => {
      console.error('[takemethere] depth texture load failed', depthSource, err);
      if (fallbackSource && fallbackSource !== depthSource) loadDepthTexture(fallbackSource, '', true);
    }
  );
}

function createDefaultTexture(palette) {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(960, 440, 20, 960, 540, 980);
  gradient.addColorStop(0, palette[2] || '#67e8f9');
  gradient.addColorStop(0.48, palette[1] || '#0f766e');
  gradient.addColorStop(1, palette[0] || '#050816');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.26;
  for (let i = 0; i < 90; i += 1) {
    ctx.fillStyle = palette[i % palette.length] || '#fff';
    ctx.beginPath();
    ctx.arc((i * 137) % canvas.width, (i * 251) % canvas.height, 2 + (i % 14), 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDefaultDepthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
  gradient.addColorStop(0, '#f4f4f4');
  gradient.addColorStop(0.52, '#8d8d8d');
  gradient.addColorStop(1, '#202020');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return new THREE.CanvasTexture(canvas);
}

function createDepthMaterial(map, depthMap) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      depthMap: { value: depthMap },
      strength: { value: 4.5 },
      opacity: { value: 0.96 },
      time: { value: 0 }
    },
    transparent: true,
    side: THREE.FrontSide,
    vertexShader: `
      varying vec2 vUv;
      uniform sampler2D depthMap;
      uniform float strength;
      uniform float time;
      void main() {
        vUv = uv;
        float depth = texture2D(depthMap, uv).r;
        float breathe = sin(time * 0.18 + position.y * 0.02) * 0.35;
        vec3 dir = normalize(position);
        vec3 displaced = position + dir * ((depth - 0.48) * strength + breathe);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D map;
      uniform float opacity;
      void main() {
        vec4 color = texture2D(map, vUv);
        gl_FragColor = vec4(color.rgb, color.a * opacity);
      }
    `
  });
}

function getStateEnergy(stateKey) {
  return { IDLE: 0.12, LISTENING: 0.22, UNDERSTANDING: 0.32, GENERATING: 0.52, PORTAL_OPENING: 0.72, ARRIVAL: 0.86, WORLD_ACTIVE: 0.46, EXIT: 0.2, ERROR_FALLBACK: 0.38 }[stateKey] || 0.18;
}

function getWarpEnergy(stateKey) {
  return { LISTENING: 0.22, UNDERSTANDING: 0.42, GENERATING: 0.72 }[stateKey] || 0;
}

function shouldUseDepth() {
  if (currentVisualMode === 'flat') return false;
  return currentDepthStatus === 'ready' && loadedImageSource === currentImageSource && loadedDepthSource === currentDepthSource;
}

function renderSession(session) {
  currentStateKey = session.state?.key || 'IDLE';
  currentVisualMode = session.visualMode || 'auto';
  currentDepthStatus = session.depthStatus || 'idle';
  currentProjectorConfig = { ...currentProjectorConfig, ...(session.projectorConfig || {}) };
  blackout.className = currentStateKey === 'BLACKOUT' ? 'blackout-overlay' : '';
  const palette = session.recipe?.palette || currentPalette;
  for (const view of views) {
    view.setPalette(palette);
    view.setProjectorConfig();
  }
  if (session.layoutMode && !grid.classList.contains(session.layoutMode)) setupViews(session.layoutMode);
  if (session.imageFileUrl || session.imageDataUrl) loadTexture(session.imageFileUrl || session.imageDataUrl, session.imageDataUrl || '');
  if (session.depthFileUrl || session.depthDataUrl) loadDepthTexture(session.depthFileUrl || session.depthDataUrl, session.depthDataUrl || '');
}

function animate() {
  const elapsed = performance.now() / 1000;
  for (const view of views) view.render(elapsed);
  requestAnimationFrame(animate);
}

setupViews('three-wall');
animate();
api.onSessionUpdate(renderSession);
api.getSession().then(renderSession);
