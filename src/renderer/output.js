import * as THREE from '../../node_modules/three/build/three.module.js';

const api = window.takeMeThere;
const root = document.querySelector('#output-app');
const params = new URLSearchParams(window.location.search);
const requestedView = params.get('view') || '';
const standaloneView = requestedView || '';
const standaloneFeed = ['depth', 'foreground', 'atmosphere'].includes(params.get('feed')) ? params.get('feed') : '';
const isMonitor = params.get('monitor') === '1';
const feedId = params.get('feedId') || standaloneFeed || standaloneView || 'combined';
root.innerHTML = standaloneFeed
  ? `<main class="output-shell helper-output${isMonitor ? ' monitor-output' : ''}"><canvas id="helper-canvas"></canvas><div id="blackout"></div></main>`
  : `<main class="output-shell${isMonitor ? ' monitor-output' : ''}"><div class="output-grid three-wall${standaloneView ? ' single-view' : ''}" id="grid"></div><div id="blackout"></div></main>`;

const grid = document.querySelector('#grid');
const blackout = document.querySelector('#blackout');
const helperCanvas = document.querySelector('#helper-canvas');
const helperContext = helperCanvas?.getContext('2d');
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
let currentRoom = null;
let currentProjectorConfig = { leftYaw: 69, frontYaw: 0, rightYaw: -69, fov: 78, ceilingPitch: 64, ceilingFov: 82 };
let currentSetup = { testPattern: 'world', identifyTarget: 'all', helperFeedsEnabled: false, depthOpacity: 0.42, foregroundThreshold: 0.68, atmosphereIntensity: 0.55, atmosphereSoftness: 0.45 };
let framesSinceHeartbeat = 0;
let lastHeartbeatAt = performance.now();
let helperDepthImage = null;
let helperImage = null;
let helperMaskImage = null;
let currentMaskSource = '';

const VIEW_CONFIGS = {
  left: { label: 'LEFT', yaw: Math.PI / 2.6, pitch: 0, fov: 78 },
  front: { label: 'FRONT', yaw: 0, pitch: 0, fov: 78 },
  right: { label: 'RIGHT', yaw: -Math.PI / 2.6, pitch: 0, fov: 78 },
  ceiling: { label: 'CEILING', yaw: 0, pitch: Math.PI / 2.8, fov: 82 }
};

function configForView(name) {
  const projector = (currentRoom?.projectors || []).find((item) => item.id === name);
  if (projector) {
    return {
      label: String(projector.label || projector.id || name).toUpperCase(),
      x: Number(projector.x || 0),
      y: Number(projector.y || 0),
      z: Number(projector.z || 0),
      yaw: degToRad(projector.yaw || 0),
      pitch: degToRad(projector.pitch || 0),
      roll: degToRad((projector.roll || 0) + (projector.orientation === 'portrait' ? 90 : 0)),
      fov: Number(projector.fov || 78)
    };
  }
  const base = VIEW_CONFIGS[name] || { label: String(name || 'OUTPUT').toUpperCase(), x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 78 };
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
    this.camera.position.set(this.config.x || 0, this.config.y || 0, this.config.z || 0.1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.cell.appendChild(this.renderer.domElement);
    this.testCanvas = document.createElement('canvas');
    this.testCanvas.className = 'test-pattern-canvas';
    this.testContext = this.testCanvas.getContext('2d');
    this.cell.appendChild(this.testCanvas);

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
    this.camera.position.set(this.config.x || 0, this.config.y || 0, this.config.z || 0.1);
    this.camera.fov = this.config.fov;
    this.camera.updateProjectionMatrix();
  }

  render(elapsed) {
    const testPattern = currentSetup.testPattern || 'world';
    if (testPattern !== 'world') {
      this.renderer.domElement.style.display = 'none';
      this.testCanvas.style.display = 'block';
      drawTestPattern(this.testContext, this.testCanvas, testPattern, this.name, elapsed);
      return;
    }
    this.renderer.domElement.style.display = 'block';
    this.testCanvas.style.display = 'none';
    const stateEnergy = getStateEnergy(currentStateKey);
    const warpEnergy = getWarpEnergy(currentStateKey);
    const showWarp = warpEnergy > 0;
    const showDepth = shouldUseDepth();
    this.world.visible = !showWarp;
    this.depthWorld.visible = !showWarp && showDepth && currentSetup.depthOpacity > 0;
    this.warp.lines.visible = showWarp;
    this.warp.glow.visible = showWarp;

    this.world.rotation.y = elapsed * 0.006;
    this.depthWorld.rotation.y = this.world.rotation.y;
    this.depthMaterial.uniforms.time.value = elapsed;
    this.depthMaterial.uniforms.strength.value = 2.5 + stateEnergy * 5.5;
    this.depthMaterial.uniforms.opacity.value = currentSetup.depthOpacity;
    this.particles.rotation.y = elapsed * (0.012 + stateEnergy * 0.01);
    this.particles.rotation.x = Math.sin(elapsed * 0.04) * 0.07;
    this.particles.material.opacity = showWarp ? 0.05 : 0.22 + stateEnergy * 0.34;
    this.colorWash.material.opacity = showWarp ? 0.012 + warpEnergy * 0.05 : 0.025 + stateEnergy * 0.075;
    if (showWarp) this.updateWarp(elapsed, warpEnergy);

    const pitch = this.config.pitch + Math.sin(elapsed * 0.009) * 0.008;
    const direction = new THREE.Vector3(Math.sin(this.config.yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(this.config.yaw) * Math.cos(pitch));
    this.camera.lookAt(this.camera.position.clone().add(direction));
    this.camera.rotateZ(this.config.roll || 0);
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
  if (standaloneFeed) return;
  for (const view of views) view.dispose();
  views = [];
  const roomNames = (currentRoom?.projectors || []).filter((projector) => projector.enabled !== false).map((projector) => projector.id);
  const names = standaloneView ? [standaloneView] : roomNames.length ? roomNames : layoutMode === 'ceiling' ? ['left', 'front', 'right', 'ceiling'] : ['left', 'front', 'right'];
  grid.className = `output-grid ${layoutMode}${standaloneView ? ' single-view' : ''}`;
  grid.innerHTML = names.map((name) => `<section class="view-cell" data-view="${name}"><div class="view-label">${configForView(name).label}</div></section>`).join('');
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
      loadHelperImage(imageSource, 'image');
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
      loadHelperImage(depthSource, 'depth');
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

function loadHelperImage(source, type) {
  if (!standaloneFeed || !source) return;
  const image = new Image();
  image.onload = () => {
    if (type === 'depth') helperDepthImage = image;
    else if (type === 'mask') helperMaskImage = image;
    else helperImage = image;
  };
  image.src = source;
}

function resizePatternCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * window.devicePixelRatio));
  const height = Math.max(1, Math.round(rect.height * window.devicePixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height };
}

function drawTestPattern(ctx, canvas, pattern, viewName, elapsed) {
  const { width, height } = resizePatternCanvas(canvas);
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (pattern === 'black') ctx.fillStyle = '#000000';
  else if (pattern === 'white') ctx.fillStyle = '#ffffff';
  else if (pattern === 'red') ctx.fillStyle = '#ff0000';
  else if (pattern === 'green') ctx.fillStyle = '#00ff00';
  else if (pattern === 'blue') ctx.fillStyle = '#0000ff';
  else ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, width, height);

  if (pattern === 'grid' || pattern === 'horizon' || pattern === 'labels') drawGrid(ctx, width, height);
  if (pattern === 'checkerboard') drawCheckerboard(ctx, width, height);
  if (pattern === 'edge-frame' || pattern === 'horizon' || pattern === 'labels') drawEdgeFrame(ctx, width, height);
  if (pattern === 'crosshair' || pattern === 'horizon' || pattern === 'labels') drawCrosshair(ctx, width, height);
  if (pattern === 'horizon') drawHorizon(ctx, width, height);
  drawIdentifyLabel(ctx, width, height, viewName, elapsed, pattern === 'labels');
  ctx.restore();
}

function drawGrid(ctx, width, height) {
  ctx.strokeStyle = 'rgba(255,255,255,.34)';
  ctx.lineWidth = Math.max(1, width / 960);
  const step = Math.max(48, Math.round(width / 16));
  for (let x = 0; x <= width; x += step) line(ctx, x, 0, x, height);
  for (let y = 0; y <= height; y += step) line(ctx, 0, y, width, y);
}

function drawCheckerboard(ctx, width, height) {
  const size = Math.max(48, Math.round(width / 12));
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      ctx.fillStyle = ((x / size + y / size) % 2) < 1 ? '#ffffff' : '#000000';
      ctx.fillRect(x, y, size, size);
    }
  }
}

function drawEdgeFrame(ctx, width, height) {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(6, width / 160);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = Math.max(2, width / 520);
  ctx.strokeRect(width * 0.04, height * 0.06, width * 0.92, height * 0.88);
}

function drawCrosshair(ctx, width, height) {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(3, width / 420);
  line(ctx, width / 2, height * 0.08, width / 2, height * 0.92);
  line(ctx, width * 0.08, height / 2, width * 0.92, height / 2);
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.13, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHorizon(ctx, width, height) {
  ctx.strokeStyle = '#ffea00';
  ctx.lineWidth = Math.max(4, width / 360);
  line(ctx, 0, height * 0.5, width, height * 0.5);
  ctx.strokeStyle = '#ff3b30';
  line(ctx, width * 0.33, 0, width * 0.33, height);
  line(ctx, width * 0.66, 0, width * 0.66, height);
}

function drawIdentifyLabel(ctx, width, height, viewName, elapsed, forceLabel) {
  const target = currentSetup.identifyTarget || 'all';
  const active = target === 'all' || target === viewName;
  const pulse = active ? 0.45 + Math.sin(elapsed * 5) * 0.25 : 0.08;
  if (active || forceLabel) {
    ctx.fillStyle = `rgba(34,211,238,${pulse})`;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(Math.min(width, height) * 0.1)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(viewName.toUpperCase(), width / 2, height / 2);
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawHelperFeed(elapsed) {
  if (!helperCanvas || !helperContext) return;
  const { width, height } = resizePatternCanvas(helperCanvas);
  const ctx = helperContext;
  ctx.clearRect(0, 0, width, height);
  if (!currentSetup.helperFeedsEnabled) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (standaloneFeed === 'depth') {
    if (helperDepthImage) ctx.drawImage(helperDepthImage, 0, 0, width, height);
    else drawDepthFallback(ctx, width, height);
    drawHelperLabel(ctx, width, height, 'DEPTH');
    return;
  }
  if (standaloneFeed === 'foreground') {
    drawForegroundMask(ctx, width, height);
    drawHelperLabel(ctx, width, height, 'FOREGROUND');
    return;
  }
  drawAtmosphere(ctx, width, height, elapsed);
  drawHelperLabel(ctx, width, height, 'ATMOSPHERE');
}

function drawForegroundMask(ctx, width, height) {
  if (helperMaskImage) {
    ctx.drawImage(helperMaskImage, 0, 0, width, height);
    return;
  }
  if (helperDepthImage) ctx.drawImage(helperDepthImage, 0, 0, width, height);
  else drawDepthFallback(ctx, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const threshold = currentSetup.foregroundThreshold * 255;
  for (let i = 0; i < image.data.length; i += 4) {
    const value = image.data[i];
    const mask = value >= threshold ? 255 : 0;
    image.data[i] = mask;
    image.data[i + 1] = mask;
    image.data[i + 2] = mask;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

function drawAtmosphere(ctx, width, height, elapsed) {
  if (helperImage) {
    ctx.globalAlpha = 0.45 + currentSetup.atmosphereIntensity * 0.4;
    ctx.drawImage(helperImage, 0, 0, width, height);
    ctx.globalAlpha = 1;
  } else {
    drawDepthFallback(ctx, width, height);
  }
  ctx.globalCompositeOperation = 'lighter';
  const count = 80;
  for (let i = 0; i < count; i += 1) {
    const x = ((i * 197 + elapsed * 17) % width);
    const y = ((i * 89 + Math.sin(elapsed + i) * 90) % height + height) % height;
    const radius = (18 + (i % 9) * 9) * (0.5 + currentSetup.atmosphereSoftness);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${0.03 + currentSetup.atmosphereIntensity * 0.08})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawDepthFallback(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, height, width, 0);
  gradient.addColorStop(0, '#f8fafc');
  gradient.addColorStop(0.5, '#808080');
  gradient.addColorStop(1, '#111827');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawHelperLabel(ctx, width, height, label) {
  const target = currentSetup.identifyTarget || 'all';
  if (target !== 'all' && target !== standaloneFeed) return;
  ctx.fillStyle = 'rgba(0,0,0,.38)';
  ctx.fillRect(width * 0.03, height * 0.04, width * 0.34, height * 0.1);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(Math.min(width, height) * 0.045)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, width * 0.055, height * 0.09);
}

function renderSession(session) {
  currentStateKey = session.state?.key || 'IDLE';
  currentVisualMode = session.visualMode || 'auto';
  currentDepthStatus = session.depthStatus || 'idle';
  currentRoom = session.room || currentRoom;
  currentProjectorConfig = { ...currentProjectorConfig, ...(session.projectorConfig || {}) };
  currentSetup = { ...currentSetup, ...(session.setup || {}) };
  blackout.className = currentStateKey === 'BLACKOUT' ? 'blackout-overlay' : '';
  const palette = session.recipe?.palette || currentPalette;
  for (const view of views) {
    view.setPalette(palette);
    view.setProjectorConfig();
  }
  if (!standaloneFeed && session.layoutMode && !grid.classList.contains(session.layoutMode)) setupViews(session.layoutMode);
  if (session.imageFileUrl || session.imageDataUrl) loadTexture(session.imageFileUrl || session.imageDataUrl, session.imageDataUrl || '');
  if (session.depthFileUrl || session.depthDataUrl) loadDepthTexture(session.depthFileUrl || session.depthDataUrl, session.depthDataUrl || '');
  const maskSource = session.maskFileUrl || session.maskDataUrl || '';
  if (!maskSource && currentMaskSource) {
    currentMaskSource = '';
    helperMaskImage = null;
  }
  if (maskSource && maskSource !== currentMaskSource) {
    currentMaskSource = maskSource;
    loadHelperImage(maskSource, 'mask');
  }
}

function animate() {
  const elapsed = performance.now() / 1000;
  if (standaloneFeed) drawHelperFeed(elapsed);
  else for (const view of views) view.render(elapsed);
  framesSinceHeartbeat += 1;
  const now = performance.now();
  if (!isMonitor && now - lastHeartbeatAt > 1000) {
    const target = standaloneFeed ? helperCanvas : grid;
    const rect = target?.getBoundingClientRect() || { width: 0, height: 0 };
    api.outputHeartbeat?.({
      feedId,
      width: rect.width,
      height: rect.height,
      fps: framesSinceHeartbeat
    });
    framesSinceHeartbeat = 0;
    lastHeartbeatAt = now;
  }
  requestAnimationFrame(animate);
}

if (standaloneFeed) {
  window.addEventListener('resize', () => drawHelperFeed(performance.now() / 1000));
} else {
  setupViews('three-wall');
}
animate();
api.onSessionUpdate(renderSession);
api.getSession().then(renderSession);
