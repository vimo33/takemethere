const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { getState } = require('./state-machine.cjs');
const { createFallbackRecipe } = require('./world-recipe.cjs');

loadLocalEnv();

const { expandPrompt, generateImage, createSvgDataUrl } = require('./ai-service.cjs');
const madMapper = require('./madmapper-control.cjs');
const ndiManager = require('./ndi-manager.cjs');

let operatorWindow;
let outputWindow;
let ndiSourceWindows = [];
let ndiAutoStart = true;
let ndiFeedSignature = '';
let outputRevision = 0;
let transitionToken = 0;
let transitionTimers = [];

const DEBUG_LOG = path.join(__dirname, '../../electron-debug.log');
const APP_ROOT = path.join(__dirname, '../..');
const GENERATED_WORLDS_DIR = path.join(APP_ROOT, 'generated-worlds');
const SESSION_HISTORY_FILE = path.join(APP_ROOT, 'session-history.json');
const DEFAULT_PROJECTORS = [
  { id: 'L', label: 'LEFT', yaw: Math.PI / 2.6, pitch: 0, fov: 78, offX: 0, offY: 0, offZ: 0, color: 0x5cd3ff, live: true, signal: 'DP-1 / 1920x1080', orientation: 'landscape' },
  { id: 'F', label: 'FRONT', yaw: 0, pitch: 0, fov: 78, offX: 0, offY: 0, offZ: 0, color: 0xa87fff, live: true, signal: 'HDMI-2 / 3840x2160', orientation: 'landscape' },
  { id: 'R', label: 'RIGHT', yaw: -Math.PI / 2.6, pitch: 0, fov: 78, offX: 0, offY: 0, offZ: 0, color: 0xff6cb1, live: true, signal: 'DP-2 / 1920x1080', orientation: 'landscape' },
  { id: 'C', label: 'CEILING', yaw: 0, pitch: Math.PI / 2.8, fov: 82, offX: 0, offY: 0, offZ: 0, color: 0xffb547, live: false, signal: 'HDMI-3 / 1920x1080', orientation: 'landscape' }
];
const OUTPUT_SLOTS = [
  { slot: 'left', projectorId: 'L', label: 'LEFT' },
  { slot: 'front', projectorId: 'F', label: 'FRONT' },
  { slot: 'right', projectorId: 'R', label: 'RIGHT' },
  { slot: 'ceiling', projectorId: 'C', label: 'CEILING' }
];
const CAMERA_PALETTE = [0x5cd3ff, 0xa87fff, 0xff6cb1, 0xffb547, 0x7eea9c, 0xff5a4d, 0xd2a8ff, 0x56d4dd];

function debugLog(message, error) {
  const details = error ? `\n${error.stack || error.message || error}` : '';
  fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${message}${details}\n`);
}

function loadLocalEnv() {
  const root = path.join(__dirname, '../..');
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[key] == null) process.env[key] = value;
    }
  }
}

function defaultSceneCameras() {
  return DEFAULT_PROJECTORS.map((projector) => ({
    ...projector,
    outputSlot: projector.id === 'L' ? 'left' : projector.id === 'F' ? 'front' : projector.id === 'R' ? 'right' : 'ceiling'
  }));
}

function defaultOutputMappings() {
  return { left: 'L', front: 'F', right: 'R', ceiling: 'C' };
}

function normalizeSceneCamera(camera, index = 0) {
  const fallback = DEFAULT_PROJECTORS[index] || {
    id: `CAM-${index + 1}`,
    label: `CAMERA ${index + 1}`,
    yaw: index * Math.PI / 3,
    pitch: 0,
    fov: 60,
    offX: 0,
    offY: 0,
    offZ: 0,
    color: CAMERA_PALETTE[index % CAMERA_PALETTE.length],
    signal: 'VIRTUAL',
    orientation: 'landscape',
    live: false
  };
  const id = String(camera?.id || fallback.id || `CAM-${index + 1}`);
  const slot = ['left', 'front', 'right', 'ceiling'].includes(camera?.outputSlot) ? camera.outputSlot : '';
  return {
    id,
    label: String(camera?.label || fallback.label || id),
    yaw: Number(camera?.yaw ?? fallback.yaw ?? 0),
    pitch: Number(camera?.pitch ?? fallback.pitch ?? 0),
    fov: Number(camera?.fov ?? fallback.fov ?? 60),
    offX: Number(camera?.offX ?? fallback.offX ?? 0),
    offY: Number(camera?.offY ?? fallback.offY ?? 0),
    offZ: Number(camera?.offZ ?? fallback.offZ ?? 0),
    color: Number(camera?.color ?? fallback.color ?? CAMERA_PALETTE[index % CAMERA_PALETTE.length]),
    live: camera?.live !== false,
    signal: String(camera?.signal || fallback.signal || 'VIRTUAL'),
    orientation: camera?.orientation === 'portrait' ? 'portrait' : 'landscape',
    outputSlot: slot
  };
}

function normalizeSceneBuilder(builder = {}) {
  const cameras = Array.isArray(builder.cameras) && builder.cameras.length ? builder.cameras : defaultSceneCameras();
  const normalized = cameras.map(normalizeSceneCamera);
  const selectedCameraId = normalized.some((camera) => camera.id === builder.selectedCameraId) ? builder.selectedCameraId : normalized[0]?.id || 'F';
  const depthMode = ['single', 'depth', 'test'].includes(builder.depthMode) ? builder.depthMode : 'single';
  return {
    cameras: normalized,
    selectedCameraId,
    depthMode,
    mainView: {
      yaw: Number(builder.mainView?.yaw || 0),
      pitch: Number(builder.mainView?.pitch || 0),
      fov: Number(builder.mainView?.fov || 75),
      pos: Array.isArray(builder.mainView?.pos) ? builder.mainView.pos.slice(0, 3).map(Number) : [0, 0, 0],
      overview: !!builder.mainView?.overview
    }
  };
}

function defaultMappingSurfaces() {
  return [
    mappingItem('floor', 'Floor Plane', 'surface', 'plane', 0, 0, 0, -Math.PI / 2, 0, 0, 540, 420, 8, 'test', 0.72, true),
    mappingItem('wall-left', 'Left Wall', 'surface', 'plane', -270, 135, 0, 0, Math.PI / 2, 0, 420, 270, 8, 'world', 0.82, true),
    mappingItem('wall-front', 'Front Wall', 'surface', 'plane', 0, 135, -210, 0, 0, 0, 540, 270, 8, 'world', 0.9, true),
    mappingItem('wall-right', 'Right Wall', 'surface', 'plane', 270, 135, 0, 0, -Math.PI / 2, 0, 420, 270, 8, 'world', 0.82, true),
    mappingItem('ceiling', 'Ceiling', 'surface', 'plane', 0, 270, 0, Math.PI / 2, 0, 0, 540, 420, 8, 'transparent', 0.28, false)
  ];
}

function mappingItem(id, label, role, shape, x, y, z, rotX, rotY, rotZ, width, height, depth, materialMode, opacity, visible) {
  return {
    id,
    label,
    role,
    shape,
    x,
    y,
    z,
    rotX,
    rotY,
    rotZ,
    width,
    height,
    depth,
    radius: 45,
    materialMode,
    opacity,
    feather: 0,
    visible,
    color: role === 'mask' ? 0xff5a4d : role === 'surface' ? 0x5cd3ff : 0xa87fff,
    locked: false
  };
}

function createMappingObject(shape = 'box', index = 1) {
  const id = nextMappingRoomObjectId(shape);
  const defaults = {
    plane: mappingItem(id, `Projection Plane ${index}`, 'object', 'plane', 0, 120, -120, 0, 0, 0, 160, 110, 8, 'world', 0.78, true),
    box: mappingItem(id, `Projection Box ${index}`, 'object', 'box', 0, 55, -90, 0, 0, 0, 80, 100, 80, 'world', 0.82, true),
    cylinder: mappingItem(id, `Projection Cylinder ${index}`, 'object', 'cylinder', 120, 60, -80, 0, 0, 0, 90, 120, 90, 'world', 0.78, true),
    frame: mappingItem(id, `Door Frame ${index}`, 'mask', 'frame', 0, 115, -208, 0, 0, 0, 110, 210, 12, 'mask', 0.55, true),
    mask: mappingItem(id, `Mask Plane ${index}`, 'mask', 'plane', 0, 105, -206, 0, 0, 0, 130, 130, 8, 'mask', 0.68, true)
  };
  return defaults[shape] || defaults.box;
}

function normalizeMappingRoomItem(item = {}, index = 0) {
  const fallback = defaultMappingSurfaces()[index] || createMappingObject(item.shape || 'box', index + 1);
  const shape = ['plane', 'box', 'cylinder', 'frame'].includes(item.shape) ? item.shape : fallback.shape;
  const role = ['surface', 'object', 'mask'].includes(item.role) ? item.role : fallback.role;
  const materialMode = ['world', 'test', 'mask', 'transparent', 'solid'].includes(item.materialMode) ? item.materialMode : fallback.materialMode;
  return {
    id: String(item.id || fallback.id || `mapping-${index + 1}`),
    label: String(item.label || fallback.label || `Mapping ${index + 1}`),
    role,
    shape,
    x: number(item.x, fallback.x || 0),
    y: number(item.y, fallback.y || 0),
    z: number(item.z, fallback.z || 0),
    rotX: number(item.rotX, fallback.rotX || 0),
    rotY: number(item.rotY, fallback.rotY || 0),
    rotZ: number(item.rotZ, fallback.rotZ || 0),
    width: clamp(number(item.width, fallback.width || 100), 2, 2000),
    height: clamp(number(item.height, fallback.height || 100), 2, 2000),
    depth: clamp(number(item.depth, fallback.depth || 8), 1, 2000),
    radius: clamp(number(item.radius, fallback.radius || 45), 1, 1000),
    materialMode,
    opacity: clamp(number(item.opacity, fallback.opacity ?? 0.8), 0, 1),
    feather: clamp(number(item.feather, fallback.feather || 0), 0, 1),
    visible: item.visible !== false,
    color: Number(item.color ?? fallback.color ?? 0xa87fff),
    locked: !!item.locked
  };
}

function normalizeReferencePhoto(photo = {}, index = 0) {
  const id = String(photo.id || `photo-${index + 1}`);
  return {
    id,
    label: String(photo.label || `Reference Photo ${index + 1}`),
    dataUrl: String(photo.dataUrl || ''),
    x: number(photo.x, 0),
    y: number(photo.y, 135),
    z: number(photo.z, -205),
    rotX: number(photo.rotX, 0),
    rotY: number(photo.rotY, 0),
    rotZ: number(photo.rotZ, 0),
    width: clamp(number(photo.width, 260), 10, 2000),
    height: clamp(number(photo.height, 146), 10, 2000),
    opacity: clamp(number(photo.opacity, 0.42), 0, 1),
    visible: photo.visible !== false
  };
}

function normalizeMappingRoom(mappingRoom = {}) {
  const surfaces = Array.isArray(mappingRoom.surfaces) && mappingRoom.surfaces.length
    ? mappingRoom.surfaces.map(normalizeMappingRoomItem)
    : defaultMappingSurfaces();
  const objects = Array.isArray(mappingRoom.objects) ? mappingRoom.objects.map((item, index) => normalizeMappingRoomItem(item, index + surfaces.length)) : [];
  const masks = Array.isArray(mappingRoom.masks) ? mappingRoom.masks.map((item, index) => normalizeMappingRoomItem({ ...item, role: 'mask' }, index + surfaces.length + objects.length)) : [];
  const selectedObjectId = [...surfaces, ...objects, ...masks].some((item) => item.id === mappingRoom.selectedObjectId)
    ? mappingRoom.selectedObjectId
    : 'wall-front';
  return {
    enabled: mappingRoom.enabled !== false,
    showProjectors: mappingRoom.showProjectors !== false,
    captureMode: mappingRoom.captureMode || 'manual-photo',
    selectedObjectId,
    mainView: {
      pos: Array.isArray(mappingRoom.mainView?.pos) ? mappingRoom.mainView.pos.slice(0, 3).map(Number) : [0, 260, 620],
      target: Array.isArray(mappingRoom.mainView?.target) ? mappingRoom.mainView.target.slice(0, 3).map(Number) : [0, 110, -80],
      fov: number(mappingRoom.mainView?.fov, 55)
    },
    surfaces,
    objects,
    masks,
    referencePhotos: Array.isArray(mappingRoom.referencePhotos) ? mappingRoom.referencePhotos.map(normalizeReferencePhoto) : []
  };
}

function nextMappingRoomObjectId(shape = 'object') {
  const safe = String(shape || 'object').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'object';
  const ids = new Set([...(session?.mappingRoom?.surfaces || []), ...(session?.mappingRoom?.objects || []), ...(session?.mappingRoom?.masks || [])].map((item) => item.id));
  let index = ids.size + 1;
  while (ids.has(`${safe}-${index}`)) index += 1;
  return `${safe}-${index}`;
}

function updateMappingRoomItem(id, patch) {
  if (!id || !patch || typeof patch !== 'object') return false;
  let found = false;
  for (const key of ['surfaces', 'objects', 'masks']) {
    session.mappingRoom[key] = session.mappingRoom[key].map((item, index) => {
      if (item.id !== id) return item;
      found = true;
      return normalizeMappingRoomItem({ ...item, ...patch }, index);
    });
  }
  if (patch.selected === true && found) session.mappingRoom.selectedObjectId = id;
  session.mappingRoom = normalizeMappingRoom(session.mappingRoom);
  return found;
}

function number(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function syncOutputMappingsFromCameras() {
  const mappings = { ...(session.outputMappings || defaultOutputMappings()) };
  for (const camera of session.sceneBuilder.cameras) {
    if (camera.outputSlot) mappings[camera.outputSlot] = camera.id;
  }
  session.outputMappings = mappings;
}

function syncProjectorsFromSceneBuilder() {
  syncOutputMappingsFromCameras();
  session.projectors = OUTPUT_SLOTS.map((slotInfo, index) => {
    const camera = session.sceneBuilder.cameras.find((item) => item.id === session.outputMappings[slotInfo.slot]);
    const fallback = DEFAULT_PROJECTORS[index];
    return normalizeSceneCamera({
      ...fallback,
      ...(camera || {}),
      id: slotInfo.projectorId,
      label: camera?.label || slotInfo.label,
      outputSlot: slotInfo.slot,
      live: camera ? camera.live !== false : false
    }, index);
  });
}

function slotFeedName(slot) {
  return `TakeMeThere_${String(slot || 'output').toUpperCase()}`;
}

function activeNdiFeeds() {
  const slots = session.layoutMode === 'ceiling'
    ? OUTPUT_SLOTS
    : OUTPUT_SLOTS.filter((slotInfo) => slotInfo.slot !== 'ceiling');
  return slots.map((slotInfo, index) => {
    const cameraId = session.outputMappings?.[slotInfo.slot];
    const camera = session.sceneBuilder?.cameras?.find((item) => item.id === cameraId);
    const orientation = camera?.orientation === 'portrait' ? 'portrait' : 'landscape';
    const resolution = orientation === 'portrait'
      ? { width: 1080, height: 1920 }
      : { width: 1920, height: 1080 };
    return {
      id: slotInfo.slot,
      name: slotFeedName(slotInfo.slot),
      label: camera?.label || slotInfo.label,
      role: 'projector',
      orientation,
      resolution,
      surface: `Quad-${index + 1}`
    };
  });
}

function syncNdiHelper() {
  const feeds = activeNdiFeeds();
  const signature = feeds.map((feed) => `${feed.id}:${feed.name}:${feed.resolution.width}x${feed.resolution.height}`).join('|');
  if (!ndiAutoStart) return;
  const status = ndiManager.getStatus();
  if (signature !== ndiFeedSignature || (!status.running && !status.error)) {
    ndiFeedSignature = signature;
    ndiManager.start(feeds);
  }
}

function nextSceneCameraId() {
  let index = session.sceneBuilder.cameras.length + 1;
  const ids = new Set(session.sceneBuilder.cameras.map((camera) => camera.id));
  while (ids.has(`CAM-${index}`)) index += 1;
  return `CAM-${index}`;
}

process.on('uncaughtException', (error) => debugLog('uncaughtException', error));
process.on('unhandledRejection', (error) => debugLog('unhandledRejection', error));

const session = {
  state: getState('IDLE'),
  recipe: createFallbackRecipe('somewhere calm, blue, and endless'),
  imageDataUrl: null,
  transcript: '',
  layoutMode: 'three-wall',
  projectors: DEFAULT_PROJECTORS,
  sceneSettings: {
    surface: 'live',
    overview: false,
    drift: 0.6,
    mainFov: 75,
    fog: 0.42,
    particles: 0.55,
    intensity: 0.85,
    worldMode: 'single',
    testPattern: 'grid',
    outputTestMode: false,
    selectedProjectorId: 'F'
  },
  sceneBuilder: normalizeSceneBuilder({
    cameras: defaultSceneCameras(),
    selectedCameraId: 'F',
    depthMode: 'single',
    mainView: { yaw: 0, pitch: 0, fov: 75, pos: [0, 0, 0], overview: false }
  }),
  mappingRoom: normalizeMappingRoom(),
  outputMappings: defaultOutputMappings(),
  blackout: false,
  costEstimateUsd: 0,
  timings: {},
  provider: {
    prompt: 'local-fallback',
    image: 'local-svg-fallback'
  },
  history: [],
  generatedWorlds: [],
  error: ''
};

syncProjectorsFromSceneBuilder();

try {
  session.history = listSessionHistory(48);
} catch {
  session.history = [];
}

function createWindows() {
  const displays = screen.getAllDisplays();
  const external = displays.find((display) => display.bounds.x !== 0 || display.bounds.y !== 0) || displays[0];

  operatorWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Take Me There - Operator',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  outputWindow = new BrowserWindow({
    x: external.bounds.x,
    y: external.bounds.y,
    width: Math.min(3840, external.bounds.width || 1920),
    height: Math.min(1080, external.bounds.height || 1080),
    title: 'Take Me There - Projection Output',
    backgroundColor: '#000000',
    fullscreenable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  operatorWindow.loadFile(path.join(__dirname, '../../index.html'));
  outputWindow.loadFile(path.join(__dirname, '../../output.html'));
  syncNdiSourceWindows();
  syncNdiHelper();

  for (const [name, win] of [['operator', operatorWindow], ['output', outputWindow]]) {
    win.webContents.on('console-message', (event) => {
      debugLog(`${name} console[${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    });
    win.webContents.on('did-fail-load', (_event, code, description, url) => {
      debugLog(`${name} did-fail-load ${code} ${description} ${url}`);
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      debugLog(`${name} render-process-gone ${JSON.stringify(details)}`);
    });
  }

  outputWindow.on('ready-to-show', () => {
    outputWindow.show();
  });

  if (process.env.TMT_SMOKE === '1') {
    operatorWindow.webContents.once('did-finish-load', () => {
      setTimeout(runSmokeCheck, 800);
    });
  }

  operatorWindow.on('closed', () => {
    operatorWindow = null;
    for (const win of [...ndiSourceWindows]) {
      if (!win.isDestroyed()) win.close();
    }
  });
  outputWindow.on('closed', () => {
    outputWindow = null;
  });
}

function createNdiSourceWindow(feed, index) {
  const width = feed.resolution?.width || 1920;
  const height = feed.resolution?.height || 1080;
  const win = new BrowserWindow({
    x: -32000 + index * 8,
    y: -32000 + index * 8,
    width,
    height,
    title: feed.name,
    backgroundColor: '#000000',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    useContentSize: true,
    show: false,
    skipTaskbar: true,
    focusable: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.__feedId = feed.id;
  win.__feedName = feed.name;
  win.loadFile(path.join(__dirname, '../../output.html'), {
    query: { slot: feed.id, feedId: feed.id, ndi: '1' }
  });
  win.on('ready-to-show', () => {
    win.showInactive();
    if (!win.__ndiSubscribed) {
      try {
        win.webContents.beginFrameSubscription(false, (image) => {
          if (image.isEmpty()) return;
          const size = image.getSize();
          const bitmap = image.getBitmap();
          if (!bitmap || !size.width || !size.height) return;
          ndiManager.sendFrame(feed.name, bitmap, size.width, size.height);
        });
        win.__ndiSubscribed = true;
      } catch (error) {
        debugLog(`ndi frame subscription failed for ${feed.id}`, error);
      }
    }
  });
  win.webContents.on('did-finish-load', () => debugLog(`ndi source ${feed.name} did-finish-load`));
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    debugLog(`ndi source ${feed.name} did-fail-load ${code} ${description} ${url}`);
  });
  win.webContents.on('console-message', (event) => {
    debugLog(`ndi ${feed.id} console[${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
  });
  win.on('closed', () => {
    try { win.webContents.endFrameSubscription(); } catch (_err) { /* window already closed */ }
    ndiSourceWindows = ndiSourceWindows.filter((sourceWindow) => sourceWindow !== win);
  });
  ndiSourceWindows.push(win);
  return win;
}

function syncNdiSourceWindows() {
  if (!operatorWindow) return;
  const feeds = activeNdiFeeds();
  const ids = new Set(feeds.map((feed) => feed.id));
  for (const win of [...ndiSourceWindows]) {
    if (!ids.has(win.__feedId) || win.isDestroyed()) {
      if (!win.isDestroyed()) win.close();
      ndiSourceWindows = ndiSourceWindows.filter((sourceWindow) => sourceWindow !== win);
    }
  }
  const existing = new Map(ndiSourceWindows.filter((win) => !win.isDestroyed()).map((win) => [win.__feedId, win]));
  feeds.forEach((feed, index) => {
    if (!existing.has(feed.id)) createNdiSourceWindow(feed, index);
  });
}

async function runSmokeCheck() {
  try {
    operatorWindow.setSize(1180, 650);
    const report = await operatorWindow.webContents.executeJavaScript(`
      (async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const result = {};
        result.loaded = !!document.querySelector('.shell');
        result.liveVisible = document.body.textContent.includes('Generation Pipeline');
        const surfaceRoot = document.querySelector('#surface-root');
        result.surfaceScrollBefore = surfaceRoot ? { scrollHeight: surfaceRoot.scrollHeight, clientHeight: surfaceRoot.clientHeight, scrollTop: surfaceRoot.scrollTop, overflowY: getComputedStyle(surfaceRoot).overflowY } : null;
        if (surfaceRoot) surfaceRoot.scrollTop = surfaceRoot.scrollHeight;
        await wait(100);
        result.surfaceScrollAfter = surfaceRoot ? { scrollTop: surfaceRoot.scrollTop, canReachBottom: surfaceRoot.scrollTop > 0 || surfaceRoot.scrollHeight <= surfaceRoot.clientHeight } : null;
        document.querySelector('.topbar-right [data-surface="scene"]')?.click();
        await wait(900);
        result.sceneVisible = document.body.textContent.includes('Camera Controls') && document.body.textContent.includes('SCENE BUILDER');
        const rightScroll = document.querySelector('.right-bay .scroll');
        const leftScroll = document.querySelector('.left-rail .scroll');
        result.rightScroll = rightScroll ? { scrollHeight: rightScroll.scrollHeight, clientHeight: rightScroll.clientHeight, overflowY: getComputedStyle(rightScroll).overflowY } : null;
        result.leftScroll = leftScroll ? { scrollHeight: leftScroll.scrollHeight, clientHeight: leftScroll.clientHeight, overflowY: getComputedStyle(leftScroll).overflowY } : null;
        result.sceneControls = {
          overviewButton: !!document.querySelector('[data-action="overview"]'),
          selectedPreview: !!document.querySelector('[data-monitor-canvas]'),
          yawSlider: !!document.querySelector('[data-slider-kind="camera"][data-key="yaw"]'),
          addCamera: !!document.querySelector('[data-action="add-camera"]')
        };
        document.querySelector('[data-action="add-camera"]')?.click();
        await wait(500);
        result.cameraCountAfterAdd = document.querySelectorAll('.projector-row[data-action="select-camera"]').length;
        const yawSlider = document.querySelector('[data-slider-kind="camera"][data-key="yaw"]');
        if (yawSlider) {
          yawSlider.value = '0.5';
          yawSlider.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(500);
          const nextYawSlider = document.querySelector('[data-slider-kind="camera"][data-key="yaw"]');
          result.yawSliderUpdated = !!nextYawSlider && Math.abs(Number(nextYawSlider.value) - 0.5) < 0.01;
          result.yawSliderDomStable = yawSlider === nextYawSlider;
        }
        document.querySelector('[data-surface="live"]')?.click();
        await wait(600);
        result.returnedLive = document.body.textContent.includes('Generation Pipeline');
        document.querySelector('.topbar-right [data-surface="mapping-room"]')?.click();
        await wait(900);
        result.mappingVisible = document.body.textContent.includes('MAPPING ROOM') && !!document.querySelector('[data-mapping-room]');
        result.mappingControls = {
          addPlane: !!document.querySelector('[data-action="add-mapping-item"][data-shape="plane"]'),
          addFrame: !!document.querySelector('[data-action="add-mapping-item"][data-shape="frame"]'),
          selectedSlider: !!document.querySelector('[data-slider-kind="mapping"][data-key="x"]')
        };
        const mappingRowsBefore = document.querySelectorAll('.mapping-row[data-action="select-mapping"]').length;
        document.querySelector('[data-action="add-mapping-item"][data-shape="box"]')?.click();
        await wait(500);
        result.mappingRowsAfterBox = document.querySelectorAll('.mapping-row[data-action="select-mapping"]').length;
        document.querySelector('[data-action="add-mapping-item"][data-shape="frame"]')?.click();
        await wait(500);
        result.mappingRowsAfterFrame = document.querySelectorAll('.mapping-row[data-action="select-mapping"]').length;
        result.mappingAdded = result.mappingRowsAfterBox > mappingRowsBefore && result.mappingRowsAfterFrame > result.mappingRowsAfterBox && document.body.textContent.includes('Door Frame');
        const mappingSlider = document.querySelector('[data-slider-kind="mapping"][data-key="x"]');
        if (mappingSlider) {
          mappingSlider.value = '42';
          mappingSlider.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(500);
          const nextMappingSlider = document.querySelector('[data-slider-kind="mapping"][data-key="x"]');
          result.mappingSliderUpdated = !!nextMappingSlider && Math.abs(Number(nextMappingSlider.value) - 42) < 0.01;
        }
        document.querySelector('[data-surface="live"]')?.click();
        await wait(600);
        result.returnedLiveAfterMapping = document.body.textContent.includes('Generation Pipeline');
        result.providerWarning = document.body.textContent.includes('Cloud image generation is not configured');
        document.querySelector('[data-action="generate"]')?.click();
        await wait(1200);
        result.generateProgression = (document.body.textContent.includes('PORTAL OPENING') || document.body.textContent.includes('GENERATING') || document.body.textContent.includes('UNDERSTANDING')) && !document.body.textContent.includes('WORLD ACTIVE');
        result.previousWorldRows = document.querySelectorAll('[data-action="load-world"]').length;
        document.querySelector('[data-action="load-world"]')?.click();
        await wait(700);
        result.loadedPreviousWorld = result.previousWorldRows === 0 || document.body.textContent.includes('loaded-previous') || document.body.textContent.includes('WORLD ACTIVE');
        document.querySelector('[data-action="fallback"]')?.click();
        await wait(900);
        result.fallbackState = document.body.textContent.includes('PORTAL') || document.body.textContent.includes('Portal');
        result.webglCanvases = document.querySelectorAll('canvas').length;
        return result;
      })();
    `);
    debugLog(`smoke ${JSON.stringify(report)}`);
    const failed = !report.loaded || !report.liveVisible || !report.sceneVisible || !report.returnedLive || !report.returnedLiveAfterMapping || !report.generateProgression || !report.loadedPreviousWorld || !report.fallbackState || !report.surfaceScrollAfter?.canReachBottom || !report.sceneControls?.yawSlider || !report.sceneControls?.addCamera || report.cameraCountAfterAdd < 5 || !report.yawSliderUpdated || !report.yawSliderDomStable || !report.mappingVisible || !report.mappingControls?.addPlane || !report.mappingControls?.addFrame || !report.mappingControls?.selectedSlider || !report.mappingAdded || !report.mappingSliderUpdated;
    setTimeout(() => {
      app.exit(failed ? 1 : 0);
    }, 250);
  } catch (error) {
    debugLog('smoke failed', error);
    setTimeout(() => app.exit(1), 250);
  }
}

function broadcastSession() {
  syncNdiSourceWindows();
  syncNdiHelper();
  const payload = serializeSession();
  operatorWindow?.webContents.send('session:update', payload);
  outputWindow?.webContents.send('session:update', payload);
  for (const win of ndiSourceWindows) {
    if (!win.isDestroyed()) win.webContents.send('session:update', payload);
  }
}

function serializeSession() {
  const generatedWorlds = listGeneratedWorlds();
  session.history = listSessionHistory(48, generatedWorlds);
  return {
    ...session,
    state: session.state,
    projectors: session.projectors.map((projector) => ({ ...projector })),
    sceneBuilder: {
      ...session.sceneBuilder,
      cameras: session.sceneBuilder.cameras.map((camera) => ({ ...camera })),
      mainView: { ...session.sceneBuilder.mainView, pos: session.sceneBuilder.mainView.pos.slice() }
    },
    mappingRoom: {
      ...session.mappingRoom,
      mainView: {
        ...session.mappingRoom.mainView,
        pos: session.mappingRoom.mainView.pos.slice(),
        target: session.mappingRoom.mainView.target.slice()
      },
      surfaces: session.mappingRoom.surfaces.map((item) => ({ ...item })),
      objects: session.mappingRoom.objects.map((item) => ({ ...item })),
      masks: session.mappingRoom.masks.map((item) => ({ ...item })),
      referencePhotos: session.mappingRoom.referencePhotos.map((photo) => ({ ...photo }))
    },
    outputMappings: { ...session.outputMappings },
    outputRevision,
    sceneSettings: { ...session.sceneSettings },
    ndi: ndiManager.getStatus(),
    history: session.history.slice(0, 48),
    generatedWorlds: generatedWorlds.slice(0, 48),
    config: {
      hasGemini: !!process.env.GEMINI_API_KEY,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      imageProvider: (process.env.IMAGE_PROVIDER || 'gemini').toLowerCase(),
      promptModel: process.env.GEMINI_PROMPT_MODEL || 'gemini-2.5-flash',
      imageModel: process.env.GEMINI_IMAGE_MODEL || 'imagen-4.0-generate-001'
    }
  };
}

function setState(key, extras = {}) {
  session.state = getState(key);
  if (['PORTAL_OPENING', 'ARRIVAL', 'WORLD_ACTIVE', 'ERROR_FALLBACK', 'BLACKOUT', 'RESET'].includes(key)) outputRevision += 1;
  Object.assign(session, extras);
  broadcastSession();
}

function clearTransitions() {
  transitionToken += 1;
  for (const timer of transitionTimers) clearTimeout(timer);
  transitionTimers = [];
}

function scheduleState(key, delayMs, token = transitionToken) {
  const timer = setTimeout(() => {
    if (token === transitionToken) setState(key);
  }, delayMs);
  transitionTimers.push(timer);
}

function saveGeneratedImage(imageDataUrl, recipe) {
  try {
    if (!fs.existsSync(GENERATED_WORLDS_DIR)) fs.mkdirSync(GENERATED_WORLDS_DIR, { recursive: true });
    const match = String(imageDataUrl || '').match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) throw new Error('Unsupported image data URL');
    const mime = match[1].toLowerCase();
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/svg+xml' ? 'svg' : 'jpg';
    const base64 = match[2];
    const slug = (recipe?.title || 'world').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${ts}-${slug}.${ext}`;
    fs.writeFileSync(path.join(GENERATED_WORLDS_DIR, filename), Buffer.from(base64, 'base64'));
    debugLog(`image saved: ${filename}`);
    return filename;
  } catch (error) {
    debugLog('saveGeneratedImage failed', error);
    return '';
  }
}

function isReadableGeneratedWorld(name, full) {
  const ext = path.extname(name).toLowerCase();
  const head = fs.readFileSync(full).subarray(0, 16);
  if (ext === '.png') return head[0] === 0x89 && head.toString('ascii', 1, 4) === 'PNG';
  if (ext === '.jpg' || ext === '.jpeg') return head[0] === 0xff && head[1] === 0xd8;
  if (ext === '.webp') return head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP';
  if (ext === '.svg') {
    const text = fs.readFileSync(full, 'utf8').slice(0, 200).trimStart();
    return text.startsWith('<svg') || text.startsWith('<?xml');
  }
  return false;
}

function mimeFromGeneratedWorld(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  return 'image/png';
}

function worldTitleFromFilename(name) {
  const slug = String(name || '').replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, '').replace(/\.[^.]+$/, '');
  return slug.split('-').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || name;
}

function slugifyHistoryMatch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function generatedWorldTimestamp(name) {
  const match = String(name || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-/);
  if (!match) return NaN;
  return Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);
}

function generatedWorldRecord(name) {
  try {
    const full = path.join(GENERATED_WORLDS_DIR, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      const imageName = ['image.png', 'image.jpg', 'image.jpeg', 'image.webp', 'image.svg']
        .find((candidate) => fs.existsSync(path.join(full, candidate)))
        || fs.readdirSync(full).find((candidate) => /\.(png|jpe?g|webp|svg)$/i.test(candidate) && !/^depth\./i.test(candidate));
      if (!imageName) return null;
      const imagePath = path.join(full, imageName);
      const imageStat = fs.statSync(imagePath);
      if (!isReadableGeneratedWorld(imageName, imagePath)) return null;
      let metadata = {};
      try {
        metadata = JSON.parse(fs.readFileSync(path.join(full, 'metadata.json'), 'utf8'));
      } catch {
        metadata = {};
      }
      return {
        name,
        title: metadata.title || worldTitleFromFilename(name),
        path: imagePath,
        imageName,
        folder: full,
        depthPath: fs.existsSync(path.join(full, 'depth.png')) ? path.join(full, 'depth.png') : '',
        metadataPath: fs.existsSync(path.join(full, 'metadata.json')) ? path.join(full, 'metadata.json') : '',
        size: imageStat.size,
        mtimeMs: imageStat.mtimeMs,
        at: metadata.createdAt || imageStat.mtime.toISOString(),
        fileTimeMs: generatedWorldTimestamp(name),
        provider: metadata.provider || {},
        timings: metadata.timings || {},
        readable: true
      };
    }
    if (!/\.(png|jpe?g|webp|svg)$/i.test(name)) return null;
    if (!isReadableGeneratedWorld(name, full)) return null;
    return {
      name,
      title: worldTitleFromFilename(name),
      path: full,
      imageName: name,
      folder: '',
      depthPath: '',
      metadataPath: '',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      at: stat.mtime.toISOString(),
      fileTimeMs: generatedWorldTimestamp(name),
      provider: {},
      timings: {},
      readable: true
    };
  } catch {
    return null;
  }
}

function listGeneratedWorlds() {
  try {
    if (!fs.existsSync(GENERATED_WORLDS_DIR)) return [];
    return fs.readdirSync(GENERATED_WORLDS_DIR)
      .map(generatedWorldRecord)
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (error) {
    debugLog('listGeneratedWorlds failed', error);
    return [];
  }
}

function readSessionHistory() {
  try {
    const history = JSON.parse(fs.readFileSync(SESSION_HISTORY_FILE, 'utf8'));
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function findWorldForHistoryEntry(entry, worlds = listGeneratedWorlds()) {
  if (!entry || !Array.isArray(worlds) || worlds.length === 0) return null;
  const imageFile = String(entry.imageFile || '').replace(/\\/g, '/');
  if (imageFile) {
    const exact = worlds.find((world) => (
      world.name === imageFile
      || imageFile.endsWith(`/${world.name}`)
      || imageFile.endsWith(`/${world.name}/${world.imageName}`)
    ));
    if (exact) return exact;
  }

  const titleSlug = slugifyHistoryMatch(entry.title || entry.transcript);
  const titleMatches = titleSlug
    ? worlds.filter((world) => world.name.toLowerCase().includes(titleSlug))
    : [];
  const entryTime = Date.parse(entry.at || '');
  if (titleMatches.length && Number.isFinite(entryTime)) {
    const bestTitleMatch = titleMatches
      .map((world) => ({ world, delta: Math.abs((Number.isFinite(world.fileTimeMs) ? world.fileTimeMs : world.mtimeMs) - entryTime) }))
      .sort((a, b) => a.delta - b.delta)[0];
    if (bestTitleMatch && bestTitleMatch.delta <= 90 * 1000) return bestTitleMatch.world;
  }
  if (titleMatches.length === 1 && !Number.isFinite(entryTime)) return titleMatches[0];

  if (!Number.isFinite(entryTime)) return null;
  return worlds
    .map((world) => ({ world, delta: Math.abs((Number.isFinite(world.fileTimeMs) ? world.fileTimeMs : world.mtimeMs) - entryTime) }))
    .filter((item) => item.delta <= 90 * 1000)
    .sort((a, b) => a.delta - b.delta)[0]?.world || null;
}

function decorateSessionHistoryEntry(entry, historyIndex, worlds = listGeneratedWorlds()) {
  const world = findWorldForHistoryEntry(entry, worlds);
  return {
    historyIndex,
    at: entry?.at || '',
    event: entry?.event || '',
    state: entry?.state || '',
    title: entry?.title || entry?.transcript || world?.title || 'World',
    transcript: entry?.transcript || '',
    provider: entry?.provider || {},
    timings: entry?.timings || {},
    imageMs: entry?.imageMs || 0,
    costEstimateUsd: Number(entry?.costEstimateUsd || entry?.cost || 0),
    layoutMode: entry?.layoutMode || '',
    error: entry?.error || '',
    imageFile: entry?.imageFile || '',
    worldName: world?.name || '',
    worldAt: world?.at || '',
    loadable: !!world,
    missingImage: !world
  };
}

function listSessionHistory(limit = 48, worlds = listGeneratedWorlds()) {
  const history = readSessionHistory();
  return history
    .map((entry, index) => decorateSessionHistoryEntry(entry, index, worlds))
    .slice(-limit)
    .reverse();
}

function loadGeneratedWorldRecord(world, source = null) {
  const mime = mimeFromGeneratedWorld(world.imageName || world.name);
  const imageDataUrl = `data:${mime};base64,${fs.readFileSync(world.path).toString('base64')}`;
  const title = source?.title || world.title;
  const transcript = source?.transcript || title;
  session.imageDataUrl = imageDataUrl;
  outputRevision += 1;
  session.imageFile = world.name;
  session.recipe = {
    ...createFallbackRecipe(transcript || title),
    title,
    visitor_input: transcript,
    visual_prompt: source
      ? `Session history world loaded from ${world.name}. Original visitor prompt: ${transcript || title}.`
      : `Previously generated Take Me There world loaded from ${world.name}.`
  };
  session.transcript = transcript;
  session.provider.prompt = source ? 'loaded-session-history' : 'loaded-previous';
  session.provider.image = world.name;
  session.error = '';
  session.timings = source?.timings || { promptMs: 0, imageMs: 0 };
  session.costEstimateUsd = source ? Number(source.costEstimateUsd || 0) : 0;
  session.sceneSettings.outputTestMode = false;
  if (session.sceneSettings.worldMode === 'test') session.sceneSettings.worldMode = 'single';
  clearTransitions();
  setState('WORLD_ACTIVE');
  return serializeSession();
}

function loadGeneratedWorld(filename) {
  const worlds = listGeneratedWorlds();
  const world = worlds.find((item) => item.name === filename);
  if (!world) throw new Error(`Generated world not found: ${filename}`);
  return loadGeneratedWorldRecord(world);
}

function loadSessionHistoryEntry(historyIndex) {
  const index = Number(historyIndex);
  const history = readSessionHistory();
  if (!Number.isInteger(index) || index < 0 || index >= history.length) {
    throw new Error(`Session history entry not found: ${historyIndex}`);
  }
  const worlds = listGeneratedWorlds();
  const entry = history[index];
  const world = findWorldForHistoryEntry(entry, worlds);
  if (!world) {
    throw new Error(`No saved image is available for "${entry?.title || entry?.transcript || 'this history entry'}".`);
  }
  return loadGeneratedWorldRecord(world, decorateSessionHistoryEntry(entry, index, worlds));
}

function writeSessionHistory(eventName) {
  const record = {
    at: new Date().toISOString(),
    event: eventName,
    state: session.state.key,
    title: session.recipe?.title,
    transcript: session.transcript,
    provider: session.provider,
    timings: session.timings,
    costEstimateUsd: session.costEstimateUsd,
    layoutMode: session.layoutMode,
    error: session.error,
    imageFile: session.imageFile || ''
  };

  let history = [];
  try {
    history = JSON.parse(fs.readFileSync(SESSION_HISTORY_FILE, 'utf8'));
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }
  history.push(record);
  const nextHistory = history.slice(-200);
  fs.writeFileSync(SESSION_HISTORY_FILE, `${JSON.stringify(nextHistory, null, 2)}\n`);
  session.history = listSessionHistory(48);
}

async function generateWorld(visitorInput) {
  clearTransitions();
  const prompt = visitorInput?.trim() || 'somewhere calm, blue, and endless';
  const token = transitionToken;
  session.transcript = prompt;
  session.error = '';
  session.timings = {};
  session.imageFile = '';
  session.costEstimateUsd = 0;
  session.sceneSettings.fog = session.recipe?.fog || session.sceneSettings.fog;
  session.sceneSettings.outputTestMode = false;
  if (session.sceneSettings.worldMode === 'test') session.sceneSettings.worldMode = 'single';
  setState('UNDERSTANDING');

  try {
    const expanded = await expandPrompt(prompt);
    session.recipe = expanded.recipe;
    session.sceneSettings.fog = Number(expanded.recipe?.fog || session.sceneSettings.fog);
    session.provider.prompt = expanded.provider;
    session.timings.promptMs = expanded.latencyMs;
    broadcastSession();
  } catch (error) {
    session.recipe = createFallbackRecipe(prompt);
    session.sceneSettings.fog = Number(session.recipe?.fog || session.sceneSettings.fog);
    session.provider.prompt = 'local-fallback-after-error';
    session.error = error.message;
    broadcastSession();
  }

  setState('GENERATING');

  try {
    const image = await generateImage(session.recipe);
    session.imageDataUrl = image.imageDataUrl;
    outputRevision += 1;
    session.provider.image = image.provider;
    session.timings.imageMs = image.latencyMs;
    session.costEstimateUsd += image.estimatedCostUsd || 0;
    session.imageFile = saveGeneratedImage(image.imageDataUrl, session.recipe);
    if (image.provider?.includes('fallback')) session.error = 'Cloud image generation is not configured; using local fallback world. Add GEMINI_API_KEY or OPENAI_API_KEY before starting.';
    writeSessionHistory('world_generated');
    setState('PORTAL_OPENING');
    scheduleState('ARRIVAL', 4500, token);
    scheduleState('WORLD_ACTIVE', 9500, token);
  } catch (error) {
    session.error = error.message;
    session.imageDataUrl = createSvgDataUrl(session.recipe);
    outputRevision += 1;
    session.provider.image = 'local-svg-fallback-after-error';
    session.imageFile = saveGeneratedImage(session.imageDataUrl, session.recipe);
    writeSessionHistory('world_generated_with_fallback');
    setState('ERROR_FALLBACK');
    scheduleState('PORTAL_OPENING', 1200, token);
    scheduleState('ARRIVAL', 5700, token);
    scheduleState('WORLD_ACTIVE', 10700, token);
  }
}

ipcMain.handle('session:get', () => serializeSession());

ipcMain.handle('session:list-generated-worlds', () => listGeneratedWorlds());

ipcMain.handle('session:load-generated-world', (_event, filename) => loadGeneratedWorld(filename));

ipcMain.handle('session:load-history-entry', (_event, historyIndex) => loadSessionHistoryEntry(historyIndex));

ipcMain.handle('session:set-state', (_event, key) => {
  if (key === 'RESET') {
    clearTransitions();
    session.transcript = '';
    session.error = '';
    session.costEstimateUsd = 0;
    session.timings = {};
    setState('RESET');
    scheduleState('IDLE', 1000, transitionToken);
    return serializeSession();
  }
  if (['IDLE', 'EXIT', 'BLACKOUT'].includes(key)) clearTransitions();
  setState(key);
  return serializeSession();
});

ipcMain.handle('session:generate-world', (_event, visitorInput) => {
  generateWorld(visitorInput);
  return serializeSession();
});

ipcMain.handle('session:fallback-world', (_event, visitorInput) => {
  clearTransitions();
  const token = transitionToken;
  const prompt = visitorInput || session.transcript || 'somewhere calm, blue, and endless';
  session.transcript = prompt;
  session.error = '';
  session.timings = { promptMs: 0, imageMs: 0 };
  session.recipe = createFallbackRecipe(prompt);
  session.imageDataUrl = createSvgDataUrl(session.recipe);
  outputRevision += 1;
  session.imageFile = saveGeneratedImage(session.imageDataUrl, session.recipe);
  session.provider.prompt = 'local-fallback';
  session.provider.image = 'local-svg-fallback';
  session.costEstimateUsd = 0;
  session.sceneSettings.outputTestMode = false;
  if (session.sceneSettings.worldMode === 'test') session.sceneSettings.worldMode = 'single';
  writeSessionHistory('fallback_world');
  setState('PORTAL_OPENING');
  scheduleState('ARRIVAL', 3500, token);
  scheduleState('WORLD_ACTIVE', 8000, token);
  return serializeSession();
});

ipcMain.handle('session:set-layout', (_event, layoutMode) => {
  session.layoutMode = layoutMode === 'ceiling' ? 'ceiling' : 'three-wall';
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:update-projector', (_event, id, patch) => {
  if (!id || !patch || typeof patch !== 'object') return serializeSession();
  session.projectors = session.projectors.map((projector) => {
    if (projector.id !== id) return projector;
    const next = { ...projector, ...patch };
    for (const key of ['yaw', 'pitch', 'fov', 'offX', 'offY', 'offZ', 'color']) {
      if (next[key] !== undefined) next[key] = Number(next[key]);
    }
    next.live = next.live !== false;
    next.orientation = next.orientation === 'portrait' ? 'portrait' : 'landscape';
    return next;
  });
  const projector = session.projectors.find((item) => item.id === id);
  const slot = OUTPUT_SLOTS.find((item) => item.projectorId === id)?.slot;
  const cameraId = slot ? session.outputMappings[slot] : '';
  if (projector && cameraId) {
    session.sceneBuilder.cameras = session.sceneBuilder.cameras.map((camera) => {
      if (camera.id !== cameraId) return camera;
      return normalizeSceneCamera({ ...camera, ...patch, outputSlot: slot }, 0);
    });
  }
  syncProjectorsFromSceneBuilder();
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:set-projectors', (_event, projectors) => {
  const source = Array.isArray(projectors) && projectors.length ? projectors : DEFAULT_PROJECTORS;
  if (Array.isArray(source) && source.length) {
    session.projectors = source.map((projector) => ({
      ...projector,
      yaw: Number(projector.yaw || 0),
      pitch: Number(projector.pitch || 0),
      fov: Number(projector.fov || 75),
      offX: Number(projector.offX || 0),
      offY: Number(projector.offY || 0),
      offZ: Number(projector.offZ || 0),
      color: Number(projector.color || 0x5cd3ff),
      live: projector.live !== false,
      orientation: projector.orientation === 'portrait' ? 'portrait' : 'landscape'
    }));
    session.sceneBuilder.cameras = session.projectors.map((projector) => normalizeSceneCamera({
      ...projector,
      outputSlot: projector.id === 'L' ? 'left' : projector.id === 'F' ? 'front' : projector.id === 'R' ? 'right' : projector.id === 'C' ? 'ceiling' : ''
    }));
    session.sceneBuilder.selectedCameraId = session.sceneBuilder.cameras[1]?.id || session.sceneBuilder.cameras[0]?.id || 'F';
    session.outputMappings = defaultOutputMappings();
    syncProjectorsFromSceneBuilder();
    broadcastSession();
  }
  return serializeSession();
});

ipcMain.handle('session:add-scene-camera', () => {
  const id = nextSceneCameraId();
  const index = session.sceneBuilder.cameras.length;
  const camera = normalizeSceneCamera({
    id,
    label: `CAMERA ${index + 1}`,
    yaw: (index * Math.PI / 3) % (Math.PI * 2),
    pitch: 0,
    fov: 60,
    offX: 0,
    offY: 0,
    offZ: 0,
    color: CAMERA_PALETTE[index % CAMERA_PALETTE.length],
    live: false,
    signal: 'VIRTUAL',
    orientation: 'landscape',
    outputSlot: ''
  }, index);
  session.sceneBuilder.cameras.push(camera);
  session.sceneBuilder.selectedCameraId = id;
  syncProjectorsFromSceneBuilder();
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:remove-scene-camera', (_event, id) => {
  if (!id || session.sceneBuilder.cameras.length <= 1) return serializeSession();
  session.sceneBuilder.cameras = session.sceneBuilder.cameras.filter((camera) => camera.id !== id);
  for (const [slot, cameraId] of Object.entries(session.outputMappings)) {
    if (cameraId === id) session.outputMappings[slot] = '';
  }
  if (session.sceneBuilder.selectedCameraId === id) session.sceneBuilder.selectedCameraId = session.sceneBuilder.cameras[0]?.id || '';
  syncProjectorsFromSceneBuilder();
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:update-scene-camera', (_event, id, patch) => {
  if (!id || !patch || typeof patch !== 'object') return serializeSession();
  session.sceneBuilder.cameras = session.sceneBuilder.cameras.map((camera, index) => {
    if (camera.id !== id) return camera;
    return normalizeSceneCamera({ ...camera, ...patch }, index);
  });
  if (patch.outputSlot !== undefined) {
    for (const [slot, cameraId] of Object.entries(session.outputMappings)) {
      if (cameraId === id) session.outputMappings[slot] = '';
    }
    if (['left', 'front', 'right', 'ceiling'].includes(patch.outputSlot)) {
      session.outputMappings[patch.outputSlot] = id;
      session.sceneBuilder.cameras = session.sceneBuilder.cameras.map((camera) => camera.id !== id && camera.outputSlot === patch.outputSlot ? { ...camera, outputSlot: '' } : camera);
    }
  }
  if (patch.selected === true) session.sceneBuilder.selectedCameraId = id;
  syncProjectorsFromSceneBuilder();
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:update-scene-builder', (_event, patch) => {
  if (!patch || typeof patch !== 'object') return serializeSession();
  session.sceneBuilder = normalizeSceneBuilder({
    ...session.sceneBuilder,
    ...patch,
    mainView: { ...session.sceneBuilder.mainView, ...(patch.mainView || {}) }
  });
  session.sceneSettings.overview = !!session.sceneBuilder.mainView.overview;
  session.sceneSettings.worldMode = session.sceneBuilder.depthMode;
  session.sceneSettings.outputTestMode = session.sceneBuilder.depthMode === 'test';
  syncProjectorsFromSceneBuilder();
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:update-mapping-room', (_event, patch) => {
  if (!patch || typeof patch !== 'object') return serializeSession();
  session.mappingRoom = normalizeMappingRoom({
    ...session.mappingRoom,
    ...patch,
    mainView: { ...session.mappingRoom.mainView, ...(patch.mainView || {}) }
  });
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:add-mapping-room-item', (_event, shape) => {
  const item = createMappingObject(shape, session.mappingRoom.objects.length + session.mappingRoom.masks.length + 1);
  if (item.role === 'mask') session.mappingRoom.masks.push(item);
  else session.mappingRoom.objects.push(item);
  session.mappingRoom.selectedObjectId = item.id;
  session.mappingRoom = normalizeMappingRoom(session.mappingRoom);
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:update-mapping-room-item', (_event, id, patch) => {
  if (updateMappingRoomItem(id, patch)) broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:remove-mapping-room-item', (_event, id) => {
  if (!id) return serializeSession();
  const isSurface = session.mappingRoom.surfaces.some((item) => item.id === id);
  if (isSurface) {
    updateMappingRoomItem(id, { visible: false });
  } else {
    session.mappingRoom.objects = session.mappingRoom.objects.filter((item) => item.id !== id);
    session.mappingRoom.masks = session.mappingRoom.masks.filter((item) => item.id !== id);
    if (session.mappingRoom.selectedObjectId === id) session.mappingRoom.selectedObjectId = session.mappingRoom.surfaces[0]?.id || '';
    session.mappingRoom = normalizeMappingRoom(session.mappingRoom);
  }
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:add-mapping-room-reference-photo', (_event, photo) => {
  if (!photo || typeof photo !== 'object') return serializeSession();
  const id = `photo-${Date.now().toString(36)}`;
  session.mappingRoom.referencePhotos.push(normalizeReferencePhoto({ ...photo, id }, session.mappingRoom.referencePhotos.length));
  session.mappingRoom = normalizeMappingRoom(session.mappingRoom);
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:update-mapping-room-reference-photo', (_event, id, patch) => {
  if (!id || !patch || typeof patch !== 'object') return serializeSession();
  session.mappingRoom.referencePhotos = session.mappingRoom.referencePhotos.map((photo, index) => (
    photo.id === id ? normalizeReferencePhoto({ ...photo, ...patch }, index) : photo
  ));
  session.mappingRoom = normalizeMappingRoom(session.mappingRoom);
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:remove-mapping-room-reference-photo', (_event, id) => {
  if (!id) return serializeSession();
  session.mappingRoom.referencePhotos = session.mappingRoom.referencePhotos.filter((photo) => photo.id !== id);
  session.mappingRoom = normalizeMappingRoom(session.mappingRoom);
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:set-output-mapping', (_event, slot, cameraId) => {
  if (!['left', 'front', 'right', 'ceiling'].includes(slot)) return serializeSession();
  const exists = session.sceneBuilder.cameras.some((camera) => camera.id === cameraId);
  session.outputMappings[slot] = exists ? cameraId : '';
  session.sceneBuilder.cameras = session.sceneBuilder.cameras.map((camera) => normalizeSceneCamera({
    ...camera,
    outputSlot: session.outputMappings[slot] === camera.id ? slot : camera.outputSlot === slot ? '' : camera.outputSlot
  }));
  syncProjectorsFromSceneBuilder();
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:update-scene-settings', (_event, patch) => {
  if (patch && typeof patch === 'object') {
    session.sceneSettings = { ...session.sceneSettings, ...patch };
    for (const key of ['drift', 'mainFov', 'fog', 'particles', 'intensity']) {
      if (session.sceneSettings[key] !== undefined) session.sceneSettings[key] = Number(session.sceneSettings[key]);
    }
    if (patch.overview !== undefined) session.sceneBuilder.mainView.overview = !!patch.overview;
    if (patch.worldMode && ['single', 'depth', 'test'].includes(patch.worldMode)) session.sceneBuilder.depthMode = patch.worldMode;
    if (patch.surface && !['live', 'scene', 'mapping-room'].includes(patch.surface)) session.sceneSettings.surface = 'live';
    broadcastSession();
  }
  return serializeSession();
});

ipcMain.handle('session:apply-preset', (_event, preset) => {
  if (!preset || ![1, 2].includes(Number(preset.version)) || !Array.isArray(preset.cameras)) return serializeSession();
  session.sceneBuilder = normalizeSceneBuilder({
    cameras: preset.cameras,
    selectedCameraId: preset.selectedCameraId || preset.cameras[0]?.id,
    depthMode: preset.depth ? 'depth' : preset.depthMode || 'single',
    mainView: {
      ...(preset.main || {}),
      overview: !!preset.overview,
      pos: preset.main?.pos || [0, 0, 0]
    }
  });
  session.mappingRoom = normalizeMappingRoom(preset.mappingRoom || session.mappingRoom);
  session.outputMappings = { ...defaultOutputMappings(), ...(preset.outputMappings || {}) };
  session.layoutMode = preset.layoutMode === 'ceiling' ? 'ceiling' : 'three-wall';
  session.sceneSettings = { ...session.sceneSettings, ...(preset.sceneSettings || {}) };
  session.sceneSettings.overview = !!session.sceneBuilder.mainView.overview;
  session.sceneSettings.worldMode = session.sceneBuilder.depthMode;
  session.sceneSettings.outputTestMode = session.sceneBuilder.depthMode === 'test';
  syncProjectorsFromSceneBuilder();
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('ndi:start', () => {
  ndiAutoStart = true;
  syncNdiSourceWindows();
  ndiManager.start(activeNdiFeeds());
  broadcastSession();
  return ndiManager.getStatus();
});

ipcMain.handle('ndi:stop', () => {
  ndiAutoStart = false;
  ndiManager.stop();
  broadcastSession();
  return ndiManager.getStatus();
});

ipcMain.handle('ndi:status', () => ndiManager.getStatus());

ipcMain.handle('madmapper:discover', async (_event, config = {}) => madMapper.discover(config));
ipcMain.handle('madmapper:send', async (_event, pathName, value, config = {}) => madMapper.send(pathName, value, config));
ipcMain.handle('madmapper:trigger', async (_event, pathName, config = {}) => madMapper.trigger(pathName, config));
ipcMain.handle('madmapper:get-value', async (_event, pathName, config = {}) => madMapper.getValue(pathName, config));
ipcMain.handle('madmapper:validate-outputs', async (_event, config = {}) => {
  const discovery = await madMapper.discover(config);
  const mediaNames = new Set((discovery.media || []).map((item) => String(item.name || '').toLowerCase()));
  const surfaceNames = new Set((discovery.surfaces || []).map((item) => String(item.name || '').toLowerCase()));
  const checks = activeNdiFeeds().map((feed) => {
    const surface = feed.surface || '';
    return {
      name: feed.name,
      mediaFound: mediaNames.has(String(feed.name).toLowerCase()),
      surface,
      surfaceFound: !surface || surfaceNames.has(surface.toLowerCase())
    };
  });
  return {
    ok: checks.every((check) => check.mediaFound && check.surfaceFound),
    checks,
    discovery
  };
});

ipcMain.handle('window:output-fullscreen', () => {
  outputWindow?.setFullScreen(!outputWindow.isFullScreen());
  return outputWindow?.isFullScreen() || false;
});

ipcMain.handle('window:focus-output', () => {
  outputWindow?.focus();
  return true;
});

ipcMain.handle('window:reload-output', () => {
  outputWindow?.reload();
  return true;
});

app.whenReady().then(() => {
  debugLog('app ready');
  try {
    createWindows();
    debugLog('windows created');
  } catch (error) {
    debugLog('createWindows failed', error);
    throw error;
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on('window-all-closed', () => {
  ndiManager.stop();
  for (const win of [...ndiSourceWindows]) {
    if (!win.isDestroyed()) win.close();
  }
  if (process.platform !== 'darwin') app.quit();
});
