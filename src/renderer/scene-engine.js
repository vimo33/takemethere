import * as THREE from '../../node_modules/three/build/three.module.js';
import { OrbitControls } from '../../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from '../../node_modules/three/examples/jsm/controls/TransformControls.js';

export const PROJECTOR_COLORS = {
  L: 0x5cd3ff,
  F: 0xa87fff,
  R: 0xff6cb1,
  C: 0xffb547
};

export const DEFAULT_PROJECTORS = [
  { id: 'L', label: 'LEFT', yaw: Math.PI / 2.6, pitch: 0, fov: 78, offX: 0, offY: 0, offZ: 0, color: PROJECTOR_COLORS.L, live: true, signal: 'DP-1 / 1920x1080', orientation: 'landscape' },
  { id: 'F', label: 'FRONT', yaw: 0, pitch: 0, fov: 78, offX: 0, offY: 0, offZ: 0, color: PROJECTOR_COLORS.F, live: true, signal: 'HDMI-2 / 3840x2160', orientation: 'landscape' },
  { id: 'R', label: 'RIGHT', yaw: -Math.PI / 2.6, pitch: 0, fov: 78, offX: 0, offY: 0, offZ: 0, color: PROJECTOR_COLORS.R, live: true, signal: 'DP-2 / 1920x1080', orientation: 'landscape' },
  { id: 'C', label: 'CEILING', yaw: 0, pitch: Math.PI / 2.8, fov: 82, offX: 0, offY: 0, offZ: 0, color: PROJECTOR_COLORS.C, live: false, signal: 'HDMI-3 / 1920x1080', orientation: 'landscape' }
];

const LAYER_WORLD = 0;
const LAYER_GIZMO = 1;
const PROJECTION_RADIUS = 500;
const EDGE_SEGMENTS = 24;
const SPHERE_SEGMENTS = [96, 48];

const forward = new THREE.Vector3();
const up = new THREE.Vector3();
const right = new THREE.Vector3();
const dir = new THREE.Vector3();

export function normalizeProjectors(projectors = DEFAULT_PROJECTORS, layoutMode = 'three-wall') {
  const source = Array.isArray(projectors) && projectors.length ? projectors : DEFAULT_PROJECTORS;
  return source
    .filter((projector) => layoutMode === 'ceiling' || projector.id !== 'C')
    .map((projector) => ({
      id: projector.id,
      label: projector.label || projector.id,
      yaw: Number(projector.yaw || 0),
      pitch: Number(projector.pitch || 0),
      fov: Number(projector.fov || 75),
      offX: Number(projector.offX || 0),
      offY: Number(projector.offY || 0),
      offZ: Number(projector.offZ || 0),
      color: Number(projector.color || PROJECTOR_COLORS[projector.id] || 0x5cd3ff),
      live: projector.live !== false,
      signal: projector.signal || 'UNASSIGNED',
      orientation: projector.orientation === 'portrait' ? 'portrait' : 'landscape'
    }));
}

export function normalizeSceneCameras(cameras = DEFAULT_PROJECTORS) {
  const source = Array.isArray(cameras) && cameras.length ? cameras : DEFAULT_PROJECTORS;
  return source.map((camera, index) => ({
    id: String(camera.id || `CAM-${index + 1}`),
    label: camera.label || camera.id || `CAMERA ${index + 1}`,
    yaw: Number(camera.yaw || 0),
    pitch: Number(camera.pitch || 0),
    fov: Number(camera.fov || 60),
    offX: Number(camera.offX || 0),
    offY: Number(camera.offY || 0),
    offZ: Number(camera.offZ || 0),
    color: Number(camera.color || PROJECTOR_COLORS[camera.id] || 0x5cd3ff),
    live: camera.live !== false,
    signal: camera.signal || 'VIRTUAL',
    orientation: camera.orientation === 'portrait' ? 'portrait' : 'landscape',
    outputSlot: camera.outputSlot || ''
  }));
}

export function colorToCss(color, alpha = 1) {
  const c = new THREE.Color(Number(color || 0xffffff));
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`;
}

export function makeProjectionGizmo(color) {
  const totalSegments = 4 + 4 * EDGE_SEGMENTS;
  const positions = new Float32Array(totalSegments * 2 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, totalSegments * 2);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.layers.set(LAYER_GIZMO);
  lines.renderOrder = 999;
  lines.frustumCulled = false;
  return lines;
}

export function updateProjectionGizmo(gizmo, camera, fovDeg, aspect) {
  camera.updateMatrixWorld(true);
  const camPos = camera.position;
  const q = camera.quaternion;
  forward.set(0, 0, -1).applyQuaternion(q);
  up.set(0, 1, 0).applyQuaternion(q);
  right.set(1, 0, 0).applyQuaternion(q);
  const halfH = Math.tan((fovDeg * Math.PI) / 360);
  const halfW = halfH * aspect;
  const positions = gizmo.geometry.attributes.position.array;
  const radiusSq = PROJECTION_RADIUS * PROJECTION_RADIUS;

  function intersect(out, dx, dy, dz) {
    dir.set(dx, dy, dz).normalize();
    const b = camPos.dot(dir);
    const c = camPos.lengthSq() - radiusSq;
    const disc = b * b - c;
    const t = -b + Math.sqrt(Math.max(disc, 0));
    out.copy(camPos).addScaledVector(dir, t);
  }

  function rayDir(sx, sy, out) {
    return out.copy(forward).addScaledVector(right, sx * halfW).addScaledVector(up, sy * halfH);
  }

  let p = 0;
  function pushSeg(ax, ay, az, bx, by, bz) {
    positions[p++] = ax; positions[p++] = ay; positions[p++] = az;
    positions[p++] = bx; positions[p++] = by; positions[p++] = bz;
  }

  const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
    const d = rayDir(sx, sy, new THREE.Vector3());
    const out = new THREE.Vector3();
    intersect(out, d.x, d.y, d.z);
    return out;
  });
  for (const c of corners) pushSeg(camPos.x, camPos.y, camPos.z, c.x, c.y, c.z);

  const edges = [[-1, 1, 1, 1], [1, 1, 1, -1], [1, -1, -1, -1], [-1, -1, -1, 1]];
  const tmp = new THREE.Vector3();
  let prev = new THREE.Vector3();
  let cur = new THREE.Vector3();
  for (const [s0x, s0y, s1x, s1y] of edges) {
    rayDir(s0x, s0y, tmp);
    intersect(prev, tmp.x, tmp.y, tmp.z);
    for (let k = 1; k <= EDGE_SEGMENTS; k += 1) {
      const t = k / EDGE_SEGMENTS;
      rayDir(s0x + (s1x - s0x) * t, s0y + (s1y - s0y) * t, tmp);
      intersect(cur, tmp.x, tmp.y, tmp.z);
      pushSeg(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z);
      const swap = prev;
      prev = cur;
      cur = swap;
    }
  }
  gizmo.geometry.attributes.position.needsUpdate = true;
}

export function createFallbackPanoramaTexture(palette = ['#050816', '#0f766e', '#67e8f9', '#f8fafc'], seed = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, palette[0] || '#050816');
  gradient.addColorStop(0.42, palette[1] || '#0f766e');
  gradient.addColorStop(0.58, palette[2] || '#67e8f9');
  gradient.addColorStop(1, palette[0] || '#050816');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let n = seed * 0x9e3779b1;
  const random = () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 260; i += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const r = 0.6 + random() * 3.6;
    const color = palette[i % palette.length] || '#ffffff';
    ctx.fillStyle = hexToRgba(color, 0.14 + random() * 0.42);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = hexToRgba(palette[3] || '#ffffff', 0.24);
  ctx.lineWidth = 2;
  for (let y = 410; y < 650; y += 34) {
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += 10) {
      const yy = y + Math.sin((x + seed * 41) * 0.012) * 24 + Math.sin(x * 0.031) * 12;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  return textureFromCanvas(canvas);
}

export function createTestPatternTexture(kind = 'grid') {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (kind === 'colorbars') {
    const colors = ['#ffffff', '#ffd84d', '#5cd3ff', '#7eea9c', '#ff6cb1', '#a87fff', '#ff5a4d', '#05070b'];
    colors.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect((canvas.width / colors.length) * i, 0, canvas.width / colors.length, canvas.height);
    });
  } else {
    ctx.strokeStyle = kind === 'crosshatch' ? 'rgba(255,255,255,0.32)' : 'rgba(92,211,255,0.32)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= canvas.width; x += 128) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 128) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    if (kind === 'crosshatch') {
      for (let x = -canvas.height; x < canvas.width; x += 128) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + canvas.height, canvas.height); ctx.stroke();
      }
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '700 44px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 8; i += 1) {
    ctx.fillText(String(i + 1).padStart(2, '0'), 128 + i * 256, canvas.height / 2);
  }
  return textureFromCanvas(canvas);
}

function textureFromCanvas(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function hexToRgba(hex, alpha) {
  const clean = String(hex || '#ffffff').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((x) => x + x).join('') : clean.padEnd(6, 'f');
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

async function textureFromImageDataUrl(imageDataUrl) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageDataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const targetAspect = 2;
  const sourceAspect = image.width / image.height;
  let drawW = canvas.width;
  let drawH = canvas.height;
  if (sourceAspect < targetAspect) drawW = canvas.height * sourceAspect;
  else drawH = canvas.width / sourceAspect;
  const x = (canvas.width - drawW) / 2;
  const y = (canvas.height - drawH) / 2;
  ctx.drawImage(image, x, y, drawW, drawH);
  if (x > 0) {
    ctx.drawImage(image, 0, 0, 1, image.height, 0, y, x + 2, drawH);
    ctx.drawImage(image, image.width - 1, 0, 1, image.height, x + drawW - 2, y, x + 2, drawH);
  }
  return textureFromCanvas(canvas);
}

async function textureFromRawImageDataUrl(imageDataUrl) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageDataUrl;
  });
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function cloneCanvasTexture(baseCanvas, layer) {
  const canvas = document.createElement('canvas');
  canvas.width = baseCanvas.width;
  canvas.height = baseCanvas.height;
  const ctx = canvas.getContext('2d');
  ctx.filter = layer === 'far' ? 'blur(2px) saturate(0.82) brightness(0.72)' : layer === 'mid' ? 'saturate(1.05) brightness(0.9)' : 'contrast(1.18) saturate(1.18) brightness(1.08)';
  ctx.drawImage(baseCanvas, 0, 0);
  ctx.filter = 'none';
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  if (layer === 'far') {
    gradient.addColorStop(0, 'rgba(0,0,0,0.05)');
    gradient.addColorStop(0.52, 'rgba(0,0,0,0.22)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.86)');
  } else if (layer === 'mid') {
    gradient.addColorStop(0, 'rgba(0,0,0,0.72)');
    gradient.addColorStop(0.42, 'rgba(0,0,0,0.08)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.42)');
  } else {
    gradient.addColorStop(0, 'rgba(0,0,0,0.9)');
    gradient.addColorStop(0.56, 'rgba(0,0,0,0.52)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.04)');
  }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  return textureFromCanvas(canvas);
}

async function panoramaCanvasFromImageDataUrl(imageDataUrl, palette, seed) {
  if (!imageDataUrl) {
    const texture = createFallbackPanoramaTexture(palette, seed);
    const canvas = texture.image;
    texture.dispose();
    return canvas;
  }
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageDataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const sourceAspect = image.width / image.height;
  let drawW = canvas.width;
  let drawH = canvas.height;
  if (sourceAspect < 2) drawW = canvas.height * sourceAspect;
  else drawH = canvas.width / sourceAspect;
  const x = (canvas.width - drawW) / 2;
  const y = (canvas.height - drawH) / 2;
  ctx.drawImage(image, x, y, drawW, drawH);
  if (x > 0) {
    ctx.drawImage(image, 0, 0, 1, image.height, 0, y, x + 2, drawH);
    ctx.drawImage(image, image.width - 1, 0, 1, image.height, x + drawW - 2, y, x + 2, drawH);
  }
  return canvas;
}

export class SphereWorldRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.host = options.host || canvas.parentElement;
    this.mode = options.mode || 'main';
    this.showGizmos = options.showGizmos !== false;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxPixelRatio || 2));
    this.renderer.autoClear = true;
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 6000);
    this.camera.rotation.order = 'YXZ';
    if (this.showGizmos) this.camera.layers.enableAll();
    else this.camera.layers.set(LAYER_WORLD);

    this.sphereGeoOuter = new THREE.SphereGeometry(PROJECTION_RADIUS, ...SPHERE_SEGMENTS);
    this.sphereGeoMid = new THREE.SphereGeometry(340, ...SPHERE_SEGMENTS);
    this.sphereGeoInner = new THREE.SphereGeometry(200, ...SPHERE_SEGMENTS);
    this.spheres = [];
    this.projectorObjects = new Map();
    this.texture = null;
    this.projectors = [];
    this.settings = {};
    this.elapsed = 0;
    this.prev = performance.now();
    this.running = true;
    this.selectedId = '';
    this.draggingTransform = false;
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.pointerDownAt = null;
    this.wasOverview = false;
    this.controlsDisposers = [];

    if (options.enableOrbit) {
      this.orbit = new OrbitControls(this.camera, this.canvas);
      this.orbit.enabled = false;
      this.orbit.target.set(0, 0, 0);
      this.orbit.minDistance = 100;
      this.orbit.maxDistance = 4500;
      this.orbit.enableDamping = true;
      this.orbit.dampingFactor = 0.08;
    }

    if (options.enableTransform) {
      this.transform = new TransformControls(this.camera, this.canvas);
      this.transform.setSpace('world');
      this.transform.size = 0.65;
      this.transformHelper = typeof this.transform.getHelper === 'function' ? this.transform.getHelper() : this.transform;
      this.transformHelper.traverse((child) => child.layers.set(LAYER_GIZMO));
      this.scene.add(this.transformHelper);
      this.transform.addEventListener('dragging-changed', (event) => {
        this.draggingTransform = event.value;
        if (this.orbit) this.orbit.enabled = this.settings.overview && !event.value;
      });
      this.transform.addEventListener('change', () => {
        this.transformHelper.traverse((child) => child.layers.set(LAYER_GIZMO));
        const selected = this.projectorObjects.get(this.selectedId);
        if (!selected || !this.onProjectorChange) return;
        const euler = new THREE.Euler().setFromQuaternion(selected.camera.quaternion, 'YXZ');
        this.onProjectorChange(this.selectedId, {
          offX: Math.round(selected.camera.position.x),
          offY: Math.round(selected.camera.position.y),
          offZ: Math.round(selected.camera.position.z),
          yaw: euler.y,
          pitch: THREE.MathUtils.clamp(euler.x, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01)
        });
      });
    }

    if (options.enableSceneBuilderControls) {
      this.onSelectProjector = options.onSelectProjector;
      this.setupSceneBuilderControls();
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.setTexture(createFallbackPanoramaTexture());
    this.resize();
    this.animate = this.animate.bind(this);
    this.raf = requestAnimationFrame(this.animate);
  }

  setTexture(texture) {
    this.setSphereTextures([{ texture, geometry: this.sphereGeoOuter, opacity: 1, order: 0 }]);
  }

  setSphereTextures(layers) {
    for (const sphere of this.spheres) {
      this.scene.remove(sphere);
      sphere.material.map?.dispose();
      sphere.material.dispose();
    }
    this.spheres = [];
    this.texture = layers[0]?.texture || null;
    for (const layer of layers) {
      const material = new THREE.MeshBasicMaterial({
        map: layer.texture,
        side: THREE.BackSide,
        transparent: layer.opacity < 1,
        opacity: layer.opacity,
        depthWrite: layer.opacity >= 1
      });
      const mesh = new THREE.Mesh(layer.geometry, material);
      mesh.renderOrder = layer.order || 0;
      mesh.layers.set(LAYER_WORLD);
      this.scene.add(mesh);
      this.spheres.push(mesh);
    }
  }

  async setImageDataUrl(imageDataUrl, palette, seed = 1) {
    if (!imageDataUrl) {
      this.setTexture(createFallbackPanoramaTexture(palette, seed));
      return;
    }
    try {
      const canvas = await panoramaCanvasFromImageDataUrl(imageDataUrl, palette, seed);
      if (this.settings?.worldMode === 'depth') {
        this.setSphereTextures([
          { texture: cloneCanvasTexture(canvas, 'far'), geometry: this.sphereGeoOuter, opacity: 0.9, order: 0 },
          { texture: cloneCanvasTexture(canvas, 'mid'), geometry: this.sphereGeoMid, opacity: 0.72, order: 1 },
          { texture: cloneCanvasTexture(canvas, 'near'), geometry: this.sphereGeoInner, opacity: 0.62, order: 2 }
        ]);
      } else {
        this.setTexture(textureFromCanvas(canvas));
      }
    } catch (error) {
      console.error('[takemethere] panorama texture failed', error);
      this.setTexture(createFallbackPanoramaTexture(palette, seed));
    }
  }

  setTestPattern(kind) {
    this.setTexture(createTestPatternTexture(kind));
  }

  updateConfig({ projectors, sceneSettings, layoutMode, selectedId, onProjectorChange } = {}) {
    this.projectors = normalizeProjectors(projectors, layoutMode);
    this.settings = { ...this.settings, ...(sceneSettings || {}) };
    if (selectedId !== undefined) this.selectedId = selectedId;
    if (onProjectorChange) this.onProjectorChange = onProjectorChange;
    this.syncProjectors();
  }

  syncProjectors() {
    const ids = new Set(this.projectors.map((p) => p.id));
    for (const [id, object] of this.projectorObjects) {
      if (!ids.has(id)) {
        this.scene.remove(object.camera, object.gizmo, object.body);
        object.gizmo.geometry.dispose();
        object.gizmo.material.dispose();
        object.body.geometry.dispose();
        object.body.material.dispose();
        this.projectorObjects.delete(id);
      }
    }
    for (const projector of this.projectors) {
      if (!this.projectorObjects.has(projector.id)) {
        const camera = new THREE.PerspectiveCamera(projector.fov, 16 / 9, 0.1, 6000);
        camera.rotation.order = 'YXZ';
        camera.layers.set(LAYER_WORLD);
        const gizmo = makeProjectionGizmo(projector.color);
        const body = new THREE.Mesh(
          new THREE.IcosahedronGeometry(8, 1),
          new THREE.MeshBasicMaterial({ color: projector.color })
        );
        body.layers.set(LAYER_GIZMO);
        body.userData.projectorId = projector.id;
        this.scene.add(camera, gizmo, body);
        this.projectorObjects.set(projector.id, { camera, gizmo, body });
      }
    }
    this.attachSelectedTransform();
  }

  attachSelectedTransform() {
    if (!this.transform) return;
    const selected = this.projectorObjects.get(this.selectedId);
    if (selected) this.transform.attach(selected.camera);
    else this.transform.detach();
    this.transformHelper?.traverse((child) => child.layers.set(LAYER_GIZMO));
  }

  selectProjector(id) {
    this.selectedId = id || '';
    this.attachSelectedTransform();
    if (this.onSelectProjector) this.onSelectProjector(this.selectedId);
  }

  setupSceneBuilderControls() {
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(LAYER_GIZMO);
    const ndc = new THREE.Vector2();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const add = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      this.controlsDisposers.push(() => target.removeEventListener(type, listener, options));
    };

    add(this.canvas, 'pointerdown', () => {
      if (this.transform?.axis !== null && this.settings.overview && this.orbit) {
        this.orbit.enabled = false;
        const release = () => {
          window.removeEventListener('pointerup', release, true);
          if (!this.draggingTransform && this.settings.overview) this.orbit.enabled = true;
        };
        window.addEventListener('pointerup', release, true);
      }
    }, true);

    add(this.canvas, 'pointerdown', (event) => {
      this.pointerDownAt = { x: event.clientX, y: event.clientY, button: event.button };
      if (this.transform?.axis !== null) return;
      if (this.settings.overview) return;
      if (event.button !== 0) return;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    });

    add(window, 'mouseup', () => { dragging = false; });
    add(window, 'mousemove', (event) => {
      if (!dragging || this.settings.overview) return;
      this.yaw -= (event.clientX - lastX) * 0.0035;
      this.pitch -= (event.clientY - lastY) * 0.0035;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
      lastX = event.clientX;
      lastY = event.clientY;
    });

    add(this.canvas, 'pointerup', (event) => {
      if (!this.pointerDownAt) return;
      const moved = Math.hypot(event.clientX - this.pointerDownAt.x, event.clientY - this.pointerDownAt.y);
      const wasLeft = this.pointerDownAt.button === 0;
      this.pointerDownAt = null;
      if (!wasLeft || moved > 4) return;
      const rect = this.canvas.getBoundingClientRect();
      ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, this.camera);
      const hits = raycaster.intersectObjects(Array.from(this.projectorObjects.values()).map((object) => object.body), false);
      this.selectProjector(hits.length ? hits[0].object.userData.projectorId : '');
    });

    add(this.canvas, 'wheel', (event) => {
      if (this.settings.overview) return;
      event.preventDefault();
      const next = Number(this.settings.mainFov ?? this.camera.fov) + Math.sign(event.deltaY) * 3;
      this.settings.mainFov = THREE.MathUtils.clamp(next, 10, 130);
    }, { passive: false });

    add(window, 'keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const key = event.key.toLowerCase();
      if ('wasdqe'.includes(key)) this.keys.add(key);
      if (key === 'escape') this.selectProjector('');
      else if (key === 't' && this.selectedId && this.transform) this.transform.setMode('translate');
      else if (key === 'r') {
        if (this.selectedId && this.transform) this.transform.setMode('rotate');
        else this.recenterMainCamera();
      }
    });
    add(window, 'keyup', (event) => this.keys.delete(event.key.toLowerCase()));
  }

  recenterMainCamera() {
    this.yaw = 0;
    this.pitch = 0;
    if (this.settings.overview) {
      this.camera.position.set(0, 200, 1100);
      this.orbit?.target.set(0, 0, 0);
      this.orbit?.update();
    } else {
      this.camera.position.set(0, 0, 0);
    }
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  renderFromProjector(projector) {
    const object = this.projectorObjects.get(projector.id);
    if (!object) return;
    this.camera.position.set(projector.offX || 0, projector.offY || 0, projector.offZ || 0);
    this.camera.rotation.y = projector.yaw || 0;
    this.camera.rotation.x = projector.pitch || 0;
    this.camera.rotation.z = projector.orientation === 'portrait' ? Math.PI / 2 : 0;
    this.camera.fov = projector.fov || 75;
    this.camera.layers.set(LAYER_WORLD);
    this.camera.updateProjectionMatrix();
  }

  updateCamera(projector) {
    const object = this.projectorObjects.get(projector.id);
    if (!object) return;
    if (this.draggingTransform && projector.id === this.selectedId) return;
    object.camera.position.set(projector.offX || 0, projector.offY || 0, projector.offZ || 0);
    object.camera.rotation.y = projector.yaw || 0;
    object.camera.rotation.x = projector.pitch || 0;
    object.camera.rotation.z = projector.orientation === 'portrait' ? Math.PI / 2 : 0;
    object.camera.fov = projector.fov || 75;
    object.camera.aspect = projector.orientation === 'portrait' ? 9 / 16 : 16 / 9;
    object.camera.updateProjectionMatrix();
    object.body.position.copy(object.camera.position);
    object.body.quaternion.copy(object.camera.quaternion);
    object.body.visible = this.showGizmos;
    object.gizmo.visible = this.showGizmos && projector.live !== false;
    object.gizmo.material.opacity = this.settings.overview ? 0.95 : 0.36;
    updateProjectionGizmo(object.gizmo, object.camera, object.camera.fov, object.camera.aspect);
  }

  animate(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.prev) / 1000);
    this.prev = now;
    this.elapsed += dt * Number(this.settings.drift ?? 0.5);
    for (const projector of this.projectors) this.updateCamera(projector);

    const overview = !!this.settings.overview;
    if (overview !== this.wasOverview) {
      this.wasOverview = overview;
      if (overview) {
        this.camera.position.set(0, 200, 1100);
        this.orbit?.target.set(0, 0, 0);
        if (this.orbit) this.orbit.enabled = !this.draggingTransform;
      } else if (this.orbit) {
        this.orbit.enabled = false;
      }
    }
    for (const sphere of this.spheres) sphere.material.side = overview && this.showGizmos ? THREE.DoubleSide : THREE.BackSide;

    if (this.mode === 'projector') {
      const projector = this.projectors[0];
      if (projector && projector.live !== false) this.renderFromProjector(projector);
    } else if (overview && this.showGizmos) {
      this.camera.fov = 58;
      this.camera.layers.enableAll();
      if (this.orbit) {
        this.orbit.enabled = !this.draggingTransform;
        this.orbit.update();
      }
    } else {
      const move = new THREE.Vector3();
      if (this.keys.has('w')) move.z -= 1;
      if (this.keys.has('s')) move.z += 1;
      if (this.keys.has('a')) move.x -= 1;
      if (this.keys.has('d')) move.x += 1;
      if (this.keys.has('q')) move.y -= 1;
      if (this.keys.has('e')) move.y += 1;
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(60 * dt);
        const cosY = Math.cos(this.yaw);
        const sinY = Math.sin(this.yaw);
        this.camera.position.x += move.x * cosY + move.z * sinY;
        this.camera.position.y += move.y;
        this.camera.position.z += -move.x * sinY + move.z * cosY;
        const cage = 150;
        const radius = this.camera.position.length();
        if (radius > cage) this.camera.position.multiplyScalar(cage / radius);
      }
      if (!this.controlsDisposers.length) {
        this.camera.position.set(Math.sin(this.elapsed * 0.4) * 6, Math.sin(this.elapsed * 0.5) * 3, Math.cos(this.elapsed * 0.4) * 6);
        this.yaw = this.elapsed * 0.07;
        this.pitch = Math.sin(this.elapsed * 0.4) * 0.06;
      }
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      this.camera.fov = Number(this.settings.mainFov ?? 75);
      this.camera.layers.set(LAYER_WORLD);
    }
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.animate);
  }

  dispose() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    for (const dispose of this.controlsDisposers) dispose();
    this.controlsDisposers = [];
    if (this.transform) this.transform.dispose();
    if (this.orbit) this.orbit.dispose();
    for (const object of this.projectorObjects.values()) {
      object.gizmo.geometry.dispose();
      object.gizmo.material.dispose();
      object.body.geometry.dispose();
      object.body.material.dispose();
    }
    for (const sphere of this.spheres) {
      sphere.material.map?.dispose();
      sphere.material.dispose();
      sphere.geometry.dispose();
    }
    this.sphereGeoOuter.dispose();
    this.sphereGeoMid.dispose();
    this.sphereGeoInner.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
  }
}

export class SphereWorldSceneBuilder {
  constructor(mainCanvas, monitorRoot, options = {}) {
    this.canvas = mainCanvas;
    this.host = options.host || mainCanvas.parentElement;
    this.monitorRoot = monitorRoot;
    this.onCameraChange = options.onCameraChange;
    this.onSelectCamera = options.onSelectCamera;
    this.onMainViewChange = options.onMainViewChange;
    this.scene = new THREE.Scene();
    this.mainRenderer = new THREE.WebGLRenderer({ canvas: mainCanvas, antialias: true, powerPreference: 'high-performance' });
    this.mainRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.mainRenderer.autoClear = false;
    this.mainCam = new THREE.PerspectiveCamera(75, 1, 0.1, 6000);
    this.mainCam.rotation.order = 'YXZ';
    this.mainCam.layers.enableAll();
    this.axesScene = new THREE.Scene();
    this.axesHelper = new THREE.AxesHelper(50);
    this.axesHelper.material.depthTest = false;
    this.axesScene.add(this.axesHelper);
    this.axesCam = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.sphereGeoOuter = new THREE.SphereGeometry(PROJECTION_RADIUS, ...SPHERE_SEGMENTS);
    this.sphereGeoMid = new THREE.SphereGeometry(340, ...SPHERE_SEGMENTS);
    this.sphereGeoInner = new THREE.SphereGeometry(200, ...SPHERE_SEGMENTS);
    this.bodyGeo = new THREE.IcosahedronGeometry(8, 1);
    this.spheres = [];
    this.monitors = new Map();
    this.cameras = [];
    this.selectedId = '';
    this.depthMode = 'single';
    this.mainView = { yaw: 0, pitch: 0, fov: 75, pos: [0, 0, 0], overview: false };
    this.draggingTransform = false;
    this.keys = new Set();
    this.running = true;
    this.prev = performance.now();
    this.pointerDownAt = null;
    this.wasOverview = false;
    this.controlsDisposers = [];
    this.orbit = new OrbitControls(this.mainCam, this.canvas);
    this.orbit.enabled = false;
    this.orbit.target.set(0, 0, 0);
    this.orbit.minDistance = 100;
    this.orbit.maxDistance = 4500;
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.rotateSpeed = 0.5;
    this.orbit.zoomSpeed = 0.9;
    this.transform = new TransformControls(this.mainCam, this.canvas);
    this.transform.setSpace('world');
    this.transform.size = 0.65;
    this.transformHelper = typeof this.transform.getHelper === 'function' ? this.transform.getHelper() : this.transform;
    this.transformHelper.traverse((child) => child.layers.set(LAYER_GIZMO));
    this.scene.add(this.transformHelper);
    this.transform.addEventListener('dragging-changed', (event) => {
      this.draggingTransform = event.value;
      this.orbit.enabled = !!this.mainView.overview && !event.value;
    });
    this.transform.addEventListener('change', () => {
      this.transformHelper.traverse((child) => child.layers.set(LAYER_GIZMO));
      const monitor = this.monitors.get(this.selectedId);
      if (!monitor || !this.onCameraChange) return;
      const euler = new THREE.Euler().setFromQuaternion(monitor.cam.quaternion, 'YXZ');
      this.onCameraChange(this.selectedId, {
        offX: Math.round(monitor.cam.position.x),
        offY: Math.round(monitor.cam.position.y),
        offZ: Math.round(monitor.cam.position.z),
        yaw: euler.y,
        pitch: THREE.MathUtils.clamp(euler.x, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01)
      });
    });
    this.setupControls();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.setFallbackTexture();
    this.resize();
    this.animate = this.animate.bind(this);
    this.raf = requestAnimationFrame(this.animate);
  }

  setupControls() {
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(LAYER_GIZMO);
    const ndc = new THREE.Vector2();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const add = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      this.controlsDisposers.push(() => target.removeEventListener(type, listener, options));
    };
    add(this.canvas, 'pointerdown', () => {
      if (this.transform.axis !== null && this.mainView.overview && this.orbit.enabled) {
        this.orbit.enabled = false;
        const release = () => {
          window.removeEventListener('pointerup', release, true);
          if (!this.draggingTransform) this.orbit.enabled = true;
        };
        window.addEventListener('pointerup', release, true);
      }
    }, true);
    add(this.canvas, 'pointerdown', (event) => {
      this.pointerDownAt = { x: event.clientX, y: event.clientY, button: event.button };
      if (this.transform.axis !== null || this.mainView.overview || event.button !== 0) return;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    });
    add(window, 'mouseup', () => { dragging = false; });
    add(window, 'mousemove', (event) => {
      if (!dragging || this.mainView.overview) return;
      this.mainView.yaw -= (event.clientX - lastX) * 0.0035;
      this.mainView.pitch -= (event.clientY - lastY) * 0.0035;
      this.mainView.pitch = THREE.MathUtils.clamp(this.mainView.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
      lastX = event.clientX;
      lastY = event.clientY;
      this.emitMainView();
    });
    add(this.canvas, 'pointerup', (event) => {
      if (!this.pointerDownAt) return;
      const moved = Math.hypot(event.clientX - this.pointerDownAt.x, event.clientY - this.pointerDownAt.y);
      const wasLeft = this.pointerDownAt.button === 0;
      this.pointerDownAt = null;
      if (!wasLeft || moved > 4) return;
      const rect = this.canvas.getBoundingClientRect();
      ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, this.mainCam);
      const hits = raycaster.intersectObjects(Array.from(this.monitors.values()).map((monitor) => monitor.body), false);
      this.selectCamera(hits.length ? hits[0].object.userData.cameraId : '');
    });
    add(this.canvas, 'wheel', (event) => {
      if (this.mainView.overview) return;
      event.preventDefault();
      this.mainView.fov = THREE.MathUtils.clamp(Number(this.mainView.fov || 75) + Math.sign(event.deltaY) * 3, 10, 130);
      this.emitMainView();
    }, { passive: false });
    add(window, 'keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const key = event.key.toLowerCase();
      if ('wasdqe'.includes(key)) this.keys.add(key);
      if (key === 'escape') this.selectCamera('');
      else if (key === 't' && this.selectedId) this.transform.setMode('translate');
      else if (key === 'r') {
        if (this.selectedId) this.transform.setMode('rotate');
        else this.recenterMainCamera();
      }
    });
    add(window, 'keyup', (event) => this.keys.delete(event.key.toLowerCase()));
  }

  emitMainView() {
    if (!this.onMainViewChange) return;
    this.onMainViewChange({
      yaw: this.mainView.yaw,
      pitch: this.mainView.pitch,
      fov: this.mainView.fov,
      pos: [this.mainCam.position.x, this.mainCam.position.y, this.mainCam.position.z],
      overview: !!this.mainView.overview
    });
  }

  setFallbackTexture(palette, seed) {
    const texture = createFallbackPanoramaTexture(palette, seed);
    this.setSphereTextures([{ texture, geometry: this.sphereGeoOuter, opacity: 1, order: 0 }]);
  }

  setSphereTextures(layers) {
    for (const sphere of this.spheres) {
      this.scene.remove(sphere);
      sphere.material.map?.dispose();
      sphere.material.dispose();
    }
    this.spheres = [];
    for (const layer of layers) {
      const material = new THREE.MeshBasicMaterial({
        map: layer.texture,
        side: this.mainView.overview ? THREE.DoubleSide : THREE.BackSide,
        transparent: layer.opacity < 1,
        opacity: layer.opacity,
        depthWrite: layer.opacity >= 1
      });
      const mesh = new THREE.Mesh(layer.geometry, material);
      mesh.layers.set(LAYER_WORLD);
      mesh.renderOrder = layer.order || 0;
      this.scene.add(mesh);
      this.spheres.push(mesh);
    }
  }

  async setImageDataUrl(imageDataUrl, palette, seed = 1) {
    try {
      const canvas = await panoramaCanvasFromImageDataUrl(imageDataUrl, palette, seed);
      if (this.depthMode === 'depth') {
        this.setSphereTextures([
          { texture: cloneCanvasTexture(canvas, 'far'), geometry: this.sphereGeoOuter, opacity: 0.9, order: 0 },
          { texture: cloneCanvasTexture(canvas, 'mid'), geometry: this.sphereGeoMid, opacity: 0.72, order: 1 },
          { texture: cloneCanvasTexture(canvas, 'near'), geometry: this.sphereGeoInner, opacity: 0.62, order: 2 }
        ]);
      } else {
        this.setSphereTextures([{ texture: textureFromCanvas(canvas), geometry: this.sphereGeoOuter, opacity: 1, order: 0 }]);
      }
    } catch (error) {
      console.error('[takemethere] scene builder texture failed', error);
      this.setFallbackTexture(palette, seed);
    }
  }

  setTestPattern(kind) {
    this.setSphereTextures([{ texture: createTestPatternTexture(kind), geometry: this.sphereGeoOuter, opacity: 1, order: 0 }]);
  }

  updateConfig({ cameras, sceneBuilder, selectedId, onCameraChange, onSelectCamera, onMainViewChange } = {}) {
    if (onCameraChange) this.onCameraChange = onCameraChange;
    if (onSelectCamera) this.onSelectCamera = onSelectCamera;
    if (onMainViewChange) this.onMainViewChange = onMainViewChange;
    this.cameras = normalizeSceneCameras(cameras || sceneBuilder?.cameras);
    this.selectedId = selectedId || sceneBuilder?.selectedCameraId || this.selectedId || this.cameras[0]?.id || '';
    this.depthMode = sceneBuilder?.depthMode || this.depthMode || 'single';
    this.mainView = { ...this.mainView, ...(sceneBuilder?.mainView || {}) };
    this.syncMonitors();
    this.applyOverviewState();
  }

  syncMonitors() {
    const ids = new Set(this.cameras.map((camera) => camera.id));
    for (const [id, monitor] of this.monitors) {
      if (!ids.has(id)) this.disposeMonitor(id);
    }
    for (const camera of this.cameras) {
      let monitor = this.monitors.get(camera.id);
      if (!monitor) {
        const cam = new THREE.PerspectiveCamera(camera.fov, camera.orientation === 'portrait' ? 9 / 16 : 16 / 9, 0.1, 6000);
        cam.rotation.order = 'YXZ';
        cam.layers.set(LAYER_WORLD);
        const gizmo = makeProjectionGizmo(camera.color);
        const body = new THREE.Mesh(this.bodyGeo, new THREE.MeshBasicMaterial({ color: camera.color }));
        body.layers.set(LAYER_GIZMO);
        body.userData.cameraId = camera.id;
        this.scene.add(cam, gizmo, body);
        monitor = { cam, gizmo, body, canvas: null, ctx: null, target: null, pixels: null, imageData: null };
        this.monitors.set(camera.id, monitor);
      }
      this.bindMonitorCanvas(camera, monitor);
    }
    this.attachTransform();
  }

  bindMonitorCanvas(camera, monitor) {
    const canvas = Array.from(this.monitorRoot?.querySelectorAll('[data-monitor-canvas]') || []).find((item) => item.dataset.monitorCanvas === camera.id);
    if (!canvas) return;
    const size = camera.orientation === 'portrait' ? { w: 169, h: 300 } : { w: 300, h: 169 };
    if (monitor.canvas === canvas && monitor.orientation === camera.orientation) return;
    monitor.canvas = canvas;
    monitor.orientation = camera.orientation;
    canvas.width = size.w;
    canvas.height = size.h;
    monitor.ctx = canvas.getContext('2d');
    monitor.target?.dispose();
    monitor.target = new THREE.WebGLRenderTarget(size.w, size.h, { depthBuffer: true, stencilBuffer: false });
    monitor.pixels = new Uint8Array(size.w * size.h * 4);
    monitor.imageData = monitor.ctx.createImageData(size.w, size.h);
  }

  disposeMonitor(id) {
    const monitor = this.monitors.get(id);
    if (!monitor) return;
    if (this.selectedId === id) this.selectCamera('');
    monitor.target?.dispose();
    this.scene.remove(monitor.cam, monitor.gizmo, monitor.body);
    monitor.gizmo.geometry.dispose();
    monitor.gizmo.material.dispose();
    monitor.body.material.dispose();
    this.monitors.delete(id);
  }

  attachTransform() {
    const monitor = this.monitors.get(this.selectedId);
    if (monitor) this.transform.attach(monitor.cam);
    else this.transform.detach();
    this.transformHelper.traverse((child) => child.layers.set(LAYER_GIZMO));
  }

  selectCamera(id) {
    this.selectedId = id || '';
    this.attachTransform();
    if (this.onSelectCamera) this.onSelectCamera(this.selectedId);
  }

  recenterMainCamera() {
    this.mainView.yaw = 0;
    this.mainView.pitch = 0;
    this.mainCam.position.set(0, 0, 0);
    if (this.mainView.overview) {
      this.mainCam.position.set(0, 200, 1100);
      this.orbit.target.set(0, 0, 0);
      this.orbit.update();
    }
    this.emitMainView();
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.mainRenderer.setSize(width, height, false);
    this.mainCam.aspect = width / height;
    this.mainCam.updateProjectionMatrix();
  }

  applyOverviewState() {
    const overview = !!this.mainView.overview;
    if (overview !== this.wasOverview) {
      this.wasOverview = overview;
      if (overview) {
        this.mainCam.position.set(0, 200, 1100);
        this.orbit.target.set(0, 0, 0);
      } else {
        const pos = Array.isArray(this.mainView.pos) ? this.mainView.pos : [0, 0, 0];
        this.mainCam.position.set(Number(pos[0] || 0), Number(pos[1] || 0), Number(pos[2] || 0));
      }
    }
    this.orbit.enabled = overview && !this.draggingTransform;
    for (const sphere of this.spheres) sphere.material.side = overview ? THREE.DoubleSide : THREE.BackSide;
  }

  updateMonitorCamera(camera, monitor) {
    if (!(this.draggingTransform && camera.id === this.selectedId)) {
      monitor.cam.position.set(camera.offX || 0, camera.offY || 0, camera.offZ || 0);
      monitor.cam.rotation.y = camera.yaw || 0;
      monitor.cam.rotation.x = camera.pitch || 0;
      monitor.cam.rotation.z = camera.orientation === 'portrait' ? Math.PI / 2 : 0;
    }
    monitor.cam.fov = camera.fov || 60;
    monitor.cam.aspect = camera.orientation === 'portrait' ? 9 / 16 : 16 / 9;
    monitor.cam.updateProjectionMatrix();
    monitor.body.position.copy(monitor.cam.position);
    monitor.body.quaternion.copy(monitor.cam.quaternion);
    monitor.body.material.color.set(camera.color);
    monitor.gizmo.material.color.set(camera.color);
    monitor.gizmo.material.opacity = camera.live === false ? 0.28 : this.mainView.overview ? 0.95 : 0.44;
    monitor.body.visible = true;
    monitor.gizmo.visible = true;
    updateProjectionGizmo(monitor.gizmo, monitor.cam, monitor.cam.fov, monitor.cam.aspect);
  }

  updateMainCamera(dt) {
    this.applyOverviewState();
    if (this.mainView.overview) {
      this.mainCam.fov = 58;
      this.mainCam.layers.enableAll();
      this.orbit.update();
      return;
    }
    const move = new THREE.Vector3();
    if (this.keys.has('w')) move.z -= 1;
    if (this.keys.has('s')) move.z += 1;
    if (this.keys.has('a')) move.x -= 1;
    if (this.keys.has('d')) move.x += 1;
    if (this.keys.has('q')) move.y -= 1;
    if (this.keys.has('e')) move.y += 1;
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(60 * dt);
      const cosY = Math.cos(this.mainView.yaw);
      const sinY = Math.sin(this.mainView.yaw);
      this.mainCam.position.x += move.x * cosY + move.z * sinY;
      this.mainCam.position.y += move.y;
      this.mainCam.position.z += -move.x * sinY + move.z * cosY;
      const cage = 150;
      const radius = this.mainCam.position.length();
      if (radius > cage) this.mainCam.position.multiplyScalar(cage / radius);
      this.mainView.pos = [this.mainCam.position.x, this.mainCam.position.y, this.mainCam.position.z];
      this.emitMainView();
    }
    this.mainCam.rotation.y = this.mainView.yaw || 0;
    this.mainCam.rotation.x = this.mainView.pitch || 0;
    this.mainCam.fov = Number(this.mainView.fov || 75);
    this.mainCam.layers.enableAll();
  }

  renderAxesOverlay() {
    const dir = new THREE.Vector3();
    this.mainCam.getWorldDirection(dir);
    this.axesCam.position.copy(dir).multiplyScalar(-120);
    this.axesCam.up.copy(this.mainCam.up);
    this.axesCam.lookAt(0, 0, 0);
    const w = this.mainRenderer.domElement.clientWidth;
    const h = this.mainRenderer.domElement.clientHeight;
    const size = Math.min(96, Math.max(56, Math.floor(Math.min(w, h) * 0.18)));
    this.mainRenderer.setScissorTest(true);
    this.mainRenderer.setViewport(12, 12, size, size);
    this.mainRenderer.setScissor(12, 12, size, size);
    this.mainRenderer.clear(false, true, false);
    this.mainRenderer.render(this.axesScene, this.axesCam);
    this.mainRenderer.setScissorTest(false);
    this.mainRenderer.setViewport(0, 0, w, h);
  }

  animate(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.prev) / 1000);
    this.prev = now;
    for (const camera of this.cameras) {
      const monitor = this.monitors.get(camera.id);
      if (!monitor) continue;
      this.updateMonitorCamera(camera, monitor);
    }
    this.updateMainCamera(dt);
    this.mainCam.updateProjectionMatrix();
    this.mainRenderer.clear();
    this.mainRenderer.render(this.scene, this.mainCam);
    this.renderAxesOverlay();
    for (const camera of this.cameras) {
      const monitor = this.monitors.get(camera.id);
      if (!monitor?.ctx || !monitor.target) continue;
      monitor.cam.layers.set(LAYER_WORLD);
      this.mainRenderer.setRenderTarget(monitor.target);
      this.mainRenderer.clear();
      this.mainRenderer.render(this.scene, monitor.cam);
      this.mainRenderer.readRenderTargetPixels(monitor.target, 0, 0, monitor.target.width, monitor.target.height, monitor.pixels);
      const row = monitor.target.width * 4;
      for (let y = 0; y < monitor.target.height; y += 1) {
        const src = (monitor.target.height - 1 - y) * row;
        const dst = y * row;
        monitor.imageData.data.set(monitor.pixels.subarray(src, src + row), dst);
      }
      monitor.ctx.putImageData(monitor.imageData, 0, 0);
      this.mainRenderer.setRenderTarget(null);
    }
    this.raf = requestAnimationFrame(this.animate);
  }

  dispose() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    for (const dispose of this.controlsDisposers) dispose();
    this.transform.dispose();
    this.orbit.dispose();
    for (const id of Array.from(this.monitors.keys())) this.disposeMonitor(id);
    for (const sphere of this.spheres) {
      this.scene.remove(sphere);
      sphere.material.map?.dispose();
      sphere.material.dispose();
    }
    this.sphereGeoOuter.dispose();
    this.sphereGeoMid.dispose();
    this.sphereGeoInner.dispose();
    this.bodyGeo.dispose();
    this.axesHelper.geometry.dispose();
    this.mainRenderer.renderLists.dispose();
    this.mainRenderer.dispose();
  }
}

function disposeObjectTree(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    }
  });
}

export class MappingRoomRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.host = options.host || canvas.parentElement;
    this.onMappingRoomChange = options.onMappingRoomChange;
    this.onObjectChange = options.onObjectChange;
    this.onSelectObject = options.onSelectObject;
    this.mappingRoom = {};
    this.projectors = [];
    this.roomObjects = new Map();
    this.photoObjects = new Map();
    this.photoTextures = new Map();
    this.projectorObjects = new Map();
    this.pickables = [];
    this.itemById = new Map();
    this.running = true;
    this.draggingTransform = false;
    this.pointerDownAt = null;
    this.controlsDisposers = [];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070b);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxPixelRatio || 2));
    this.renderer.autoClear = true;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 6000);
    this.camera.position.set(0, 260, 620);
    this.camera.layers.enableAll();
    this.scene.add(this.camera);

    this.orbit = new OrbitControls(this.camera, this.canvas);
    this.orbit.target.set(0, 110, -80);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.rotateSpeed = 0.54;
    this.orbit.zoomSpeed = 0.9;
    this.orbit.minDistance = 80;
    this.orbit.maxDistance = 1800;

    this.transform = new TransformControls(this.camera, this.canvas);
    this.transform.setSpace('world');
    this.transform.size = 0.76;
    this.transformHelper = typeof this.transform.getHelper === 'function' ? this.transform.getHelper() : this.transform;
    this.transformHelper.traverse((child) => child.layers.set(LAYER_GIZMO));
    this.scene.add(this.transformHelper);

    this.roomRoot = new THREE.Group();
    this.photoRoot = new THREE.Group();
    this.projectorRoot = new THREE.Group();
    this.scene.add(this.roomRoot, this.photoRoot, this.projectorRoot);

    this.grid = new THREE.GridHelper(640, 32, 0x2a3447, 0x1c2434);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.72;
    this.scene.add(this.grid);
    this.axes = new THREE.AxesHelper(80);
    this.axes.layers.set(LAYER_GIZMO);
    this.scene.add(this.axes);

    this.worldTexture = createFallbackPanoramaTexture();
    this.testTexture = createTestPatternTexture('grid');
    this.bodyGeo = new THREE.IcosahedronGeometry(7, 1);
    this.setupControls();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.animate = this.animate.bind(this);
    this.raf = requestAnimationFrame(this.animate);
  }

  setupControls() {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const add = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      this.controlsDisposers.push(() => target.removeEventListener(type, listener, options));
    };

    this.orbit.addEventListener('change', () => this.emitMainView());
    this.transform.addEventListener('dragging-changed', (event) => {
      this.draggingTransform = event.value;
      this.orbit.enabled = !event.value;
      if (!event.value) this.emitSelectedTransform();
    });
    this.transform.addEventListener('change', () => {
      this.transformHelper.traverse((child) => child.layers.set(LAYER_GIZMO));
      if (this.draggingTransform) this.emitSelectedTransform();
    });

    add(this.canvas, 'pointerdown', (event) => {
      this.pointerDownAt = { x: event.clientX, y: event.clientY, button: event.button };
    });
    add(this.canvas, 'pointerup', (event) => {
      if (!this.pointerDownAt) return;
      const moved = Math.hypot(event.clientX - this.pointerDownAt.x, event.clientY - this.pointerDownAt.y);
      const wasLeft = this.pointerDownAt.button === 0;
      this.pointerDownAt = null;
      if (!wasLeft || moved > 4 || this.transform.axis !== null) return;
      const rect = this.canvas.getBoundingClientRect();
      ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, this.camera);
      const hits = raycaster.intersectObjects(this.pickables, false);
      const id = hits[0]?.object?.userData?.mappingId || '';
      if (id && this.onSelectObject) this.onSelectObject(id);
    });
    add(window, 'keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const key = event.key.toLowerCase();
      if (key === 't') this.transform.setMode('translate');
      else if (key === 'r') this.transform.setMode('rotate');
      else if (key === 's') this.transform.setMode('scale');
    });
  }

  emitMainView() {
    if (!this.onMappingRoomChange) return;
    this.onMappingRoomChange({
      mainView: {
        pos: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
        target: [this.orbit.target.x, this.orbit.target.y, this.orbit.target.z],
        fov: this.camera.fov
      }
    });
  }

  emitSelectedTransform() {
    if (!this.onObjectChange || !this.mappingRoom?.selectedObjectId) return;
    const object = this.roomObjects.get(this.mappingRoom.selectedObjectId);
    const item = this.itemById.get(this.mappingRoom.selectedObjectId);
    if (!object || item?.locked) return;
    this.onObjectChange(this.mappingRoom.selectedObjectId, {
      x: Math.round(object.position.x),
      y: Math.round(object.position.y),
      z: Math.round(object.position.z),
      rotX: object.rotation.x,
      rotY: object.rotation.y,
      rotZ: object.rotation.z
    });
  }

  updateConfig({ mappingRoom, projectors, onMappingRoomChange, onObjectChange, onSelectObject } = {}) {
    if (onMappingRoomChange) this.onMappingRoomChange = onMappingRoomChange;
    if (onObjectChange) this.onObjectChange = onObjectChange;
    if (onSelectObject) this.onSelectObject = onSelectObject;
    this.mappingRoom = mappingRoom || {};
    this.projectors = normalizeSceneCameras(projectors || []);
    const view = this.mappingRoom.mainView || {};
    const pos = Array.isArray(view.pos) ? view.pos : [0, 260, 620];
    const target = Array.isArray(view.target) ? view.target : [0, 110, -80];
    if (!this.draggingTransform) {
      this.camera.position.set(Number(pos[0] || 0), Number(pos[1] || 260), Number(pos[2] || 620));
      this.orbit.target.set(Number(target[0] || 0), Number(target[1] || 110), Number(target[2] || -80));
    }
    this.camera.fov = Number(view.fov || 55);
    this.camera.updateProjectionMatrix();
    if (!this.draggingTransform) {
      this.syncRoomObjects();
      this.syncReferencePhotos();
    }
    this.syncProjectors();
    if (!this.draggingTransform) this.attachTransform();
  }

  materialForItem(item) {
    const opacity = Number(item.opacity ?? 0.82);
    const transparent = opacity < 1 || item.materialMode === 'transparent' || item.materialMode === 'mask';
    if (item.materialMode === 'world') {
      return new THREE.MeshBasicMaterial({ map: this.worldTexture, side: THREE.DoubleSide, transparent, opacity });
    }
    if (item.materialMode === 'test') {
      return new THREE.MeshBasicMaterial({ map: this.testTexture, side: THREE.DoubleSide, transparent, opacity });
    }
    if (item.materialMode === 'mask') {
      return new THREE.MeshBasicMaterial({ color: 0xff5a4d, side: THREE.DoubleSide, transparent: true, opacity: Math.max(0.18, opacity * 0.72) });
    }
    if (item.materialMode === 'transparent') {
      return new THREE.MeshBasicMaterial({ color: item.role === 'surface' ? 0x5cd3ff : 0xa87fff, side: THREE.DoubleSide, transparent: true, opacity: Math.max(0.08, opacity * 0.36), wireframe: true });
    }
    return new THREE.MeshBasicMaterial({ color: Number(item.color || 0xa87fff), side: THREE.DoubleSide, transparent, opacity });
  }

  createObjectForItem(item) {
    const group = new THREE.Group();
    group.userData.mappingId = item.id;
    group.position.set(item.x || 0, item.y || 0, item.z || 0);
    group.rotation.set(item.rotX || 0, item.rotY || 0, item.rotZ || 0, 'YXZ');
    group.visible = item.visible !== false;
    const material = this.materialForItem(item);

    const addMesh = (geometry, position = [0, 0, 0]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.userData.mappingId = item.id;
      mesh.layers.set(LAYER_WORLD);
      group.add(mesh);
      this.pickables.push(mesh);
      return mesh;
    };

    if (item.shape === 'box') {
      addMesh(new THREE.BoxGeometry(item.width || 80, item.height || 100, item.depth || 80));
    } else if (item.shape === 'cylinder') {
      addMesh(new THREE.CylinderGeometry(item.radius || 45, item.radius || 45, item.height || 120, 40, 1, false));
    } else if (item.shape === 'frame') {
      const w = item.width || 110;
      const h = item.height || 210;
      const t = Math.max(4, item.depth || 12);
      const d = Math.max(4, t * 0.8);
      addMesh(new THREE.BoxGeometry(w, t, d), [0, h / 2 - t / 2, 0]);
      addMesh(new THREE.BoxGeometry(w, t, d), [0, -h / 2 + t / 2, 0]);
      addMesh(new THREE.BoxGeometry(t, h, d), [-w / 2 + t / 2, 0, 0]);
      addMesh(new THREE.BoxGeometry(t, h, d), [w / 2 - t / 2, 0, 0]);
    } else {
      addMesh(new THREE.PlaneGeometry(item.width || 100, item.height || 100, 12, 8));
    }

    const edges = new THREE.BoxHelper(group, item.id === this.mappingRoom.selectedObjectId ? 0xffb547 : item.role === 'mask' ? 0xff5a4d : 0x5cd3ff);
    edges.userData.mappingId = item.id;
    edges.layers.set(LAYER_GIZMO);
    group.add(edges);
    return group;
  }

  syncRoomObjects() {
    for (const object of this.roomObjects.values()) {
      this.roomRoot.remove(object);
      disposeObjectTree(object);
    }
    this.roomObjects.clear();
    this.pickables = [];
    this.itemById.clear();
    const items = [
      ...(this.mappingRoom.surfaces || []),
      ...(this.mappingRoom.objects || []),
      ...(this.mappingRoom.masks || [])
    ];
    for (const item of items) {
      this.itemById.set(item.id, item);
      const object = this.createObjectForItem(item);
      this.roomRoot.add(object);
      this.roomObjects.set(item.id, object);
    }
  }

  syncReferencePhotos() {
    for (const object of this.photoObjects.values()) {
      this.photoRoot.remove(object);
      disposeObjectTree(object);
    }
    this.photoObjects.clear();
    for (const photo of this.mappingRoom.referencePhotos || []) {
      if (photo.visible === false || !photo.dataUrl) continue;
      const cached = this.photoTextures.get(photo.id);
      if (!cached && !this.photoTextures.get(`${photo.id}:loading`)) {
        this.photoTextures.set(`${photo.id}:loading`, true);
        textureFromRawImageDataUrl(photo.dataUrl).then((texture) => {
          this.photoTextures.delete(`${photo.id}:loading`);
          this.photoTextures.set(photo.id, texture);
          if (this.running) this.syncReferencePhotos();
        }).catch(() => this.photoTextures.delete(`${photo.id}:loading`));
      }
      const material = new THREE.MeshBasicMaterial({
        map: cached || null,
        color: cached ? 0xffffff : 0x2a3447,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: Number(photo.opacity ?? 0.42)
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(photo.width || 260, photo.height || 146), material);
      mesh.position.set(photo.x || 0, photo.y || 135, photo.z || -205);
      mesh.rotation.set(photo.rotX || 0, photo.rotY || 0, photo.rotZ || 0, 'YXZ');
      this.photoRoot.add(mesh);
      this.photoObjects.set(photo.id, mesh);
    }
  }

  syncProjectors() {
    const visible = this.mappingRoom.showProjectors !== false;
    const ids = new Set(this.projectors.map((projector) => projector.id));
    for (const [id, object] of this.projectorObjects) {
      if (!ids.has(id)) {
        this.projectorRoot.remove(object.camera, object.gizmo, object.body);
        object.gizmo.geometry.dispose();
        object.gizmo.material.dispose();
        object.body.material.dispose();
        this.projectorObjects.delete(id);
      }
    }
    for (const projector of this.projectors) {
      let object = this.projectorObjects.get(projector.id);
      if (!object) {
        const camera = new THREE.PerspectiveCamera(projector.fov, projector.orientation === 'portrait' ? 9 / 16 : 16 / 9, 0.1, 6000);
        camera.rotation.order = 'YXZ';
        const gizmo = makeProjectionGizmo(projector.color);
        const body = new THREE.Mesh(this.bodyGeo, new THREE.MeshBasicMaterial({ color: projector.color, transparent: true, opacity: 0.88 }));
        body.layers.set(LAYER_GIZMO);
        gizmo.layers.set(LAYER_GIZMO);
        this.projectorRoot.add(camera, gizmo, body);
        object = { camera, gizmo, body };
        this.projectorObjects.set(projector.id, object);
      }
      object.camera.position.set(projector.offX || 0, projector.offY || 0, projector.offZ || 0);
      object.camera.rotation.y = projector.yaw || 0;
      object.camera.rotation.x = projector.pitch || 0;
      object.camera.rotation.z = projector.orientation === 'portrait' ? Math.PI / 2 : 0;
      object.camera.fov = projector.fov || 75;
      object.camera.aspect = projector.orientation === 'portrait' ? 9 / 16 : 16 / 9;
      object.camera.updateProjectionMatrix();
      object.body.position.copy(object.camera.position);
      object.body.quaternion.copy(object.camera.quaternion);
      object.body.material.color.set(projector.color);
      object.gizmo.material.color.set(projector.color);
      object.gizmo.material.opacity = visible ? 0.72 : 0;
      object.body.visible = visible;
      object.gizmo.visible = visible;
      updateProjectionGizmo(object.gizmo, object.camera, object.camera.fov, object.camera.aspect);
    }
  }

  attachTransform() {
    const selected = this.roomObjects.get(this.mappingRoom.selectedObjectId);
    if (selected) this.transform.attach(selected);
    else this.transform.detach();
    this.transformHelper.traverse((child) => child.layers.set(LAYER_GIZMO));
  }

  async setImageDataUrl(imageDataUrl, palette, seed = 1) {
    try {
      const canvas = await panoramaCanvasFromImageDataUrl(imageDataUrl, palette, seed);
      const nextTexture = textureFromCanvas(canvas);
      const previous = this.worldTexture;
      this.worldTexture = nextTexture;
      this.syncRoomObjects();
      this.attachTransform();
      previous?.dispose();
    } catch (error) {
      console.error('[takemethere] mapping room texture failed', error);
      const previous = this.worldTexture;
      this.worldTexture = createFallbackPanoramaTexture(palette, seed);
      this.syncRoomObjects();
      this.attachTransform();
      previous?.dispose();
    }
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    if (!this.running) return;
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.animate);
  }

  dispose() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    for (const dispose of this.controlsDisposers) dispose();
    this.transform.dispose();
    this.orbit.dispose();
    for (const object of this.roomObjects.values()) disposeObjectTree(object);
    for (const object of this.photoObjects.values()) disposeObjectTree(object);
    for (const object of this.projectorObjects.values()) {
      object.gizmo.geometry.dispose();
      object.gizmo.material.dispose();
      object.body.material.dispose();
    }
    for (const texture of this.photoTextures.values()) {
      if (texture && typeof texture.dispose === 'function') texture.dispose();
    }
    this.worldTexture?.dispose();
    this.testTexture?.dispose();
    this.bodyGeo.dispose();
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.axes.geometry.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
  }
}

export class SphereWorldOutputRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.host = options.host || canvas.parentElement;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxPixelRatio || 1.5));
    this.renderer.autoClear = false;
    this.sphereGeoOuter = new THREE.SphereGeometry(PROJECTION_RADIUS, ...SPHERE_SEGMENTS);
    this.sphereGeoMid = new THREE.SphereGeometry(340, ...SPHERE_SEGMENTS);
    this.sphereGeoInner = new THREE.SphereGeometry(200, ...SPHERE_SEGMENTS);
    this.spheres = [];
    this.cameras = new Map();
    this.projectors = [];
    this.sceneSettings = {};
    this.running = true;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.setSphereTextures([{ texture: createFallbackPanoramaTexture(), geometry: this.sphereGeoOuter, opacity: 1, order: 0 }]);
    this.resize();
    this.animate = this.animate.bind(this);
    this.raf = requestAnimationFrame(this.animate);
  }

  updateConfig({ projectors, sceneSettings } = {}) {
    this.projectors = normalizeSceneCameras(projectors);
    this.sceneSettings = { ...this.sceneSettings, ...(sceneSettings || {}) };
    for (const projector of this.projectors) {
      if (!this.cameras.has(projector.id)) {
        const camera = new THREE.PerspectiveCamera(projector.fov, projector.orientation === 'portrait' ? 9 / 16 : 16 / 9, 0.1, 6000);
        camera.rotation.order = 'YXZ';
        camera.layers.set(LAYER_WORLD);
        this.cameras.set(projector.id, camera);
      }
    }
    for (const id of Array.from(this.cameras.keys())) {
      if (!this.projectors.some((projector) => projector.id === id)) this.cameras.delete(id);
    }
  }

  setSphereTextures(layers) {
    for (const sphere of this.spheres) {
      this.scene.remove(sphere);
      sphere.material.map?.dispose();
      sphere.material.dispose();
    }
    this.spheres = [];
    for (const layer of layers) {
      const material = new THREE.MeshBasicMaterial({
        map: layer.texture,
        side: THREE.BackSide,
        transparent: layer.opacity < 1,
        opacity: layer.opacity,
        depthWrite: layer.opacity >= 1
      });
      const mesh = new THREE.Mesh(layer.geometry, material);
      mesh.layers.set(LAYER_WORLD);
      mesh.renderOrder = layer.order || 0;
      this.scene.add(mesh);
      this.spheres.push(mesh);
    }
  }

  async setImageDataUrl(imageDataUrl, palette, seed = 1) {
    try {
      const canvas = await panoramaCanvasFromImageDataUrl(imageDataUrl, palette, seed);
      if (this.sceneSettings?.worldMode === 'depth') {
        this.setSphereTextures([
          { texture: cloneCanvasTexture(canvas, 'far'), geometry: this.sphereGeoOuter, opacity: 0.9, order: 0 },
          { texture: cloneCanvasTexture(canvas, 'mid'), geometry: this.sphereGeoMid, opacity: 0.72, order: 1 },
          { texture: cloneCanvasTexture(canvas, 'near'), geometry: this.sphereGeoInner, opacity: 0.62, order: 2 }
        ]);
      } else {
        this.setSphereTextures([{ texture: textureFromCanvas(canvas), geometry: this.sphereGeoOuter, opacity: 1, order: 0 }]);
      }
    } catch (error) {
      console.error('[takemethere] output texture failed', error);
      this.setSphereTextures([{ texture: createFallbackPanoramaTexture(palette, seed), geometry: this.sphereGeoOuter, opacity: 1, order: 0 }]);
    }
  }

  setTestPattern(kind) {
    this.setSphereTextures([{ texture: createTestPatternTexture(kind), geometry: this.sphereGeoOuter, opacity: 1, order: 0 }]);
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(this.width, this.height, false);
  }

  animate() {
    if (!this.running) return;
    this.renderer.setScissorTest(true);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    const count = Math.max(1, this.projectors.length);
    const cellW = Math.floor(this.width / count);
    this.projectors.forEach((projector, index) => {
      const camera = this.cameras.get(projector.id);
      if (!camera || projector.live === false) return;
      camera.position.set(projector.offX || 0, projector.offY || 0, projector.offZ || 0);
      camera.rotation.y = projector.yaw || 0;
      camera.rotation.x = projector.pitch || 0;
      camera.rotation.z = projector.orientation === 'portrait' ? Math.PI / 2 : 0;
      camera.fov = projector.fov || 75;
      camera.aspect = cellW / this.height;
      camera.updateProjectionMatrix();
      const x = index * cellW;
      const w = index === count - 1 ? this.width - x : cellW;
      this.renderer.setViewport(x, 0, w, this.height);
      this.renderer.setScissor(x, 0, w, this.height);
      this.renderer.render(this.scene, camera);
    });
    this.renderer.setScissorTest(false);
    this.raf = requestAnimationFrame(this.animate);
  }

  dispose() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    for (const sphere of this.spheres) {
      this.scene.remove(sphere);
      sphere.material.map?.dispose();
      sphere.material.dispose();
    }
    this.sphereGeoOuter.dispose();
    this.sphereGeoMid.dispose();
    this.sphereGeoInner.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
  }
}
