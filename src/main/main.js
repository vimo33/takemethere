const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { getState } = require('./state-machine.cjs');
const { createFallbackRecipe } = require('./world-recipe.cjs');

loadLocalEnv();

const { expandPrompt, generateImage, createSvgDataUrl } = require('./ai-service.cjs');

let operatorWindow;
let outputWindow;
let transitionToken = 0;
let transitionTimers = [];

const DEBUG_LOG = path.join(__dirname, '../../electron-debug.log');
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
  const file = path.join(__dirname, '../../session-history.json');
  const history = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(history)) session.history = history.slice(-12).reverse();
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
  });
  outputWindow.on('closed', () => {
    outputWindow = null;
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
    const failed = !report.loaded || !report.liveVisible || !report.sceneVisible || !report.returnedLive || !report.generateProgression || !report.loadedPreviousWorld || !report.fallbackState || !report.surfaceScrollAfter?.canReachBottom || !report.sceneControls?.yawSlider || !report.sceneControls?.addCamera || report.cameraCountAfterAdd < 5 || !report.yawSliderUpdated || !report.yawSliderDomStable;
    setTimeout(() => {
      app.exit(failed ? 1 : 0);
    }, 250);
  } catch (error) {
    debugLog('smoke failed', error);
    setTimeout(() => app.exit(1), 250);
  }
}

function broadcastSession() {
  const payload = serializeSession();
  operatorWindow?.webContents.send('session:update', payload);
  outputWindow?.webContents.send('session:update', payload);
}

function serializeSession() {
  return {
    ...session,
    state: session.state,
    projectors: session.projectors.map((projector) => ({ ...projector })),
    sceneBuilder: {
      ...session.sceneBuilder,
      cameras: session.sceneBuilder.cameras.map((camera) => ({ ...camera })),
      mainView: { ...session.sceneBuilder.mainView, pos: session.sceneBuilder.mainView.pos.slice() }
    },
    outputMappings: { ...session.outputMappings },
    sceneSettings: { ...session.sceneSettings },
    history: session.history.slice(0, 12),
    generatedWorlds: listGeneratedWorlds().slice(0, 24),
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
    const dir = path.join(__dirname, '../../generated-worlds');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const match = String(imageDataUrl || '').match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) throw new Error('Unsupported image data URL');
    const mime = match[1].toLowerCase();
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/svg+xml' ? 'svg' : 'jpg';
    const base64 = match[2];
    const slug = (recipe?.title || 'world').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${ts}-${slug}.${ext}`;
    fs.writeFileSync(path.join(dir, filename), Buffer.from(base64, 'base64'));
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

function listGeneratedWorlds() {
  const dir = path.join(__dirname, '../../generated-worlds');
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => /\.(png|jpe?g|webp|svg)$/i.test(name))
      .map((name) => {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        const slug = name.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, '').replace(/\.[^.]+$/, '');
        const title = slug.split('-').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || name;
        return { name, title, path: full, size: stat.size, mtimeMs: stat.mtimeMs, at: stat.mtime.toISOString(), readable: isReadableGeneratedWorld(name, full) };
      })
      .filter((world) => world.readable)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (error) {
    debugLog('listGeneratedWorlds failed', error);
    return [];
  }
}

function loadGeneratedWorld(filename) {
  const worlds = listGeneratedWorlds();
  const world = worlds.find((item) => item.name === filename);
  if (!world) throw new Error(`Generated world not found: ${filename}`);
  const mime = mimeFromGeneratedWorld(world.name);
  const imageDataUrl = `data:${mime};base64,${fs.readFileSync(world.path).toString('base64')}`;
  session.imageDataUrl = imageDataUrl;
  session.recipe = {
    ...createFallbackRecipe(world.title),
    title: world.title,
    visitor_input: world.title,
    visual_prompt: `Previously generated Take Me There world loaded from ${world.name}.`
  };
  session.transcript = world.title;
  session.provider.prompt = 'loaded-previous';
  session.provider.image = world.name;
  session.error = '';
  session.timings = { promptMs: 0, imageMs: 0 };
  session.costEstimateUsd = 0;
  session.sceneSettings.outputTestMode = false;
  if (session.sceneSettings.worldMode === 'test') session.sceneSettings.worldMode = 'single';
  clearTransitions();
  setState('WORLD_ACTIVE');
  return serializeSession();
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

  const file = path.join(__dirname, '../../session-history.json');
  let history = [];
  try {
    history = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }
  history.push(record);
  const nextHistory = history.slice(-200);
  fs.writeFileSync(file, `${JSON.stringify(nextHistory, null, 2)}\n`);
  session.history = nextHistory.slice(-12).reverse();
}

async function generateWorld(visitorInput) {
  clearTransitions();
  const prompt = visitorInput?.trim() || 'somewhere calm, blue, and endless';
  const token = transitionToken;
  session.transcript = prompt;
  session.error = '';
  session.timings = {};
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
  session.recipe = createFallbackRecipe(prompt);
  session.imageDataUrl = createSvgDataUrl(session.recipe);
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
    broadcastSession();
  }
  return serializeSession();
});

ipcMain.handle('session:apply-preset', (_event, preset) => {
  if (!preset || preset.version !== 1 || !Array.isArray(preset.cameras)) return serializeSession();
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
  if (process.platform !== 'darwin') app.quit();
});
