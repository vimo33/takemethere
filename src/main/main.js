const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { pathToFileURL, fileURLToPath } = require('node:url');

loadProjectEnv(path.join(__dirname, '../../.env'));

const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const { getState } = require('./state-machine.cjs');
const { createFallbackRecipe } = require('./world-recipe.cjs');
const { expandPrompt, generateImage, createSvgDataUrl } = require('./ai-service.cjs');
const madMapper = require('./madmapper-control.cjs');
const ndiManager = require('./ndi-manager.cjs');
const roomPresets = require('./room-presets.cjs');
const {
  HELPER_FEEDS,
  DEFAULT_SETUP_STATE,
  createOutputBusState,
  createProjectorFeeds,
  updateFeedHealth
} = require('./output-bus.cjs');

function loadProjectEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
  }
}

let operatorWindow;
let outputWindows = [];

const DEBUG_LOG = path.join(__dirname, '../../electron-debug.log');
const DEPTH_TIMEOUT_MS = Number(process.env.DEPTH_TIMEOUT_MS || 45000);
const MASK_TIMEOUT_MS = Number(process.env.MASK_TIMEOUT_MS || 90000);
const DEPTH_GPU = process.env.DEPTH_GPU || '1';
const DEFAULT_PROJECTOR_CONFIG = {
  leftYaw: 69,
  frontYaw: 0,
  rightYaw: -69,
  fov: 78,
  ceilingPitch: 64,
  ceilingFov: 82
};

function debugLog(message, error) {
  const details = error ? `\n${error.stack || error.message || error}` : '';
  fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${message}${details}\n`);
}

process.on('uncaughtException', (error) => debugLog('uncaughtException', error));
process.on('unhandledRejection', (error) => debugLog('unhandledRejection', error));

const defaultRoom = roomPresets.createDefaultRoom('three-wall');

const session = {
  state: getState('IDLE'),
  recipe: createFallbackRecipe('somewhere calm, blue, and endless'),
  imageDataUrl: null,
  imageFileUrl: '',
  depthDataUrl: null,
  depthFileUrl: '',
  depthStatus: 'idle',
  depthError: '',
  maskDataUrl: null,
  maskFileUrl: '',
  maskStatus: 'idle',
  maskError: '',
  visualMode: 'auto',
  projectorConfig: { ...DEFAULT_PROJECTOR_CONFIG },
  setup: { ...DEFAULT_SETUP_STATE },
  outputBus: createOutputBusState(defaultRoom, DEFAULT_SETUP_STATE),
  room: defaultRoom,
  transcript: '',
  layoutMode: 'three-wall',
  blackout: false,
  costEstimateUsd: 0,
  timings: {},
  provider: {
    prompt: 'local-fallback',
    image: 'local-svg-fallback',
    depth: 'none'
  },
  error: ''
};

function createWindows() {
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

  syncProjectorWindows();
  if (session.setup.transport === 'ndi') ndiManager.start(activeTransportFeeds());

  operatorWindow.loadFile(path.join(__dirname, '../../index.html'));
  operatorWindow.webContents.on('did-finish-load', () => debugLog('operator did-finish-load'));
  operatorWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    debugLog(`operator did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  operatorWindow.webContents.on('render-process-gone', (_event, details) => {
    debugLog(`operator render-process-gone ${JSON.stringify(details)}`);
  });
  operatorWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    debugLog(`operator console level=${level} ${sourceId}:${line} ${message}`);
  });

  operatorWindow.on('closed', () => {
    operatorWindow = null;
  });
}

function createOutputWindow(display, feed, index, totalViews) {
  const productionWidth = feed.resolution?.width || feed.targetWidth || 1920;
  const productionHeight = feed.resolution?.height || feed.targetHeight || 1080;
  const width = Math.max(320, Math.round(productionWidth));
  const height = Math.max(240, Math.round(productionHeight));
  const x = -32000 + index * 8;
  const y = -32000 + index * 8;
  const title = feed.name;
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    title,
    backgroundColor: '#000000',
    resizable: false,
    maximizable: false,
    fullscreenable: true,
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

  win.loadFile(path.join(__dirname, '../../output.html'), { query: buildOutputQuery(feed) });
  win.on('ready-to-show', () => {
    if (session.setup.transport === 'ndi') win.showInactive();
    setFeedHealth(feed.id, { windowAlive: true, transportStatus: session.setup.transport });
    debugLog(`ndi source ${feed.id} ready-to-show`);
    if (session.setup.transport === 'ndi' && !win.__ndiSubscribed) {
      try {
        win.webContents.beginFrameSubscription(false, (image) => {
          if (image.isEmpty()) return;
          const size = image.getSize();
          const bitmap = image.getBitmap();
          if (!bitmap || !size.width || !size.height) return;
          ndiManager.sendFrame(feed.name, bitmap, size.width, size.height);
        });
        win.__ndiSubscribed = true;
        win.on('closed', () => {
          try { win.webContents.endFrameSubscription(); } catch (_err) { /* window already gone */ }
        });
      } catch (error) {
        debugLog(`ndi frame subscription failed for ${feed.id}: ${error.message}`);
      }
    }
  });
  win.webContents.on('did-finish-load', () => debugLog(`output ${feed.id} did-finish-load`));
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    debugLog(`output ${feed.id} did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    setFeedHealth(feed.id, { windowAlive: false });
    debugLog(`output ${feed.id} render-process-gone ${JSON.stringify(details)}`);
  });
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    debugLog(`output ${feed.id} console level=${level} ${sourceId}:${line} ${message}`);
  });
  win.on('hide', () => debugLog(`output ${feed.id} hidden`));
  win.on('show', () => debugLog(`output ${feed.id} shown`));
  win.on('minimize', () => debugLog(`output ${feed.id} minimized`));
  win.on('unresponsive', () => debugLog(`output ${feed.id} unresponsive`));
  win.on('closed', () => {
    outputWindows = outputWindows.filter((output) => output !== win);
    setFeedHealth(feed.id, { windowAlive: false });
  });
  return win;
}

function buildOutputQuery(feed) {
  if (feed.role === 'helper') return { feed: feed.feed, feedId: feed.id };
  return { view: feed.view || feed.id, feedId: feed.id };
}

function getProjectorFeeds() {
  return createProjectorFeeds(session.room);
}

function getOutputWindows() {
  return outputWindows.filter((win) => !win.isDestroyed());
}

function broadcastSession() {
  const payload = serializeSession();
  operatorWindow?.webContents.send('session:update', payload);
  for (const win of getOutputWindows()) win.webContents.send('session:update', payload);
}

function serializeSession() {
  return {
    ...session,
    state: session.state,
    ndi: ndiManager.getStatus()
  };
}

function setState(key, extras = {}) {
  session.state = getState(key);
  Object.assign(session, extras);
  broadcastSession();
}

function setFeedHealth(id, patch) {
  session.outputBus = updateFeedHealth(session.outputBus, id, patch);
  broadcastSession();
}

function syncHelperWindows() {
  for (const feed of HELPER_FEEDS) setFeedHealth(feed.id, { windowAlive: false, expectedSpout: false, expectedNdi: false, transportStatus: 'monitor' });
}

function syncOutputBusExpectations() {
  session.outputBus = createOutputBusState(session.room, session.setup, session.outputBus);
}

function syncProjectorWindows() {
  if (!app.isReady()) return;
  const displays = screen.getAllDisplays();
  const display = displays.find((item) => item.bounds.x !== 0 || item.bounds.y !== 0) || displays[0];
  const feeds = getProjectorFeeds();
  const existing = new Map(outputWindows.filter((win) => !win.isDestroyed()).map((win) => [win.getTitle(), win]));
  const nextWindows = [];
  for (const [index, feed] of feeds.entries()) {
    let win = existing.get(feed.name);
    if (win) {
      const [width, height] = win.getContentSize();
      if (width !== feed.resolution.width || height !== feed.resolution.height) {
        win.setContentSize(feed.resolution.width, feed.resolution.height);
      }
      setFeedHealth(feed.id, { windowAlive: true, transportStatus: session.setup.transport });
    } else {
      win = createOutputWindow(display, feed, index, feeds.length);
    }
    nextWindows.push(win);
  }
  const activeTitles = new Set(feeds.map((feed) => feed.name));
  for (const win of outputWindows) {
    if (!win.isDestroyed() && !activeTitles.has(win.getTitle())) win.close();
  }
  outputWindows = nextWindows.filter((win) => !win.isDestroyed());
}

function normalizeSetupState(patch = {}) {
  const current = session.setup || DEFAULT_SETUP_STATE;
  const next = {
    ...current,
    ...patch,
    madMapper: {
      ...DEFAULT_SETUP_STATE.madMapper,
      ...(current.madMapper || {}),
      ...(patch.madMapper || {}),
      cues: {
        ...DEFAULT_SETUP_STATE.madMapper.cues,
        ...(current.madMapper?.cues || {}),
        ...(patch.madMapper?.cues || {})
      }
    }
  };
  next.transport = 'ndi';
  if (!['world', 'black', 'white', 'red', 'green', 'blue', 'grid', 'checkerboard', 'edge-frame', 'crosshair', 'horizon', 'labels'].includes(next.testPattern)) next.testPattern = 'world';
  if (!['all', 'left', 'front', 'right', 'depth', 'foreground', 'atmosphere'].includes(next.identifyTarget)) next.identifyTarget = 'all';
  next.helperFeedsEnabled = Boolean(next.helperFeedsEnabled);
  next.depthOpacity = clamp(Number(next.depthOpacity ?? 0.42), 0, 1);
  next.foregroundThreshold = clamp(Number(next.foregroundThreshold ?? 0.68), 0, 1);
  next.atmosphereIntensity = clamp(Number(next.atmosphereIntensity ?? 0.55), 0, 1);
  next.atmosphereSoftness = clamp(Number(next.atmosphereSoftness ?? 0.45), 0, 1);
  next.madMapper.host = String(next.madMapper.host || '127.0.0.1');
  next.madMapper.oscPort = clamp(Math.round(Number(next.madMapper.oscPort || 8010)), 1, 65535);
  next.madMapper.queryPort = clamp(Math.round(Number(next.madMapper.queryPort || 8010)), 1, 65535);
  return next;
}

function applySetupState(patch = {}) {
  const previousTransport = session.setup.transport;
  const previousHelperFeedsEnabled = Boolean(session.setup.helperFeedsEnabled);
  session.setup = normalizeSetupState(patch);
  syncHelperWindows();
  syncOutputBusExpectations();
  const transportChanged = previousTransport !== session.setup.transport;
  const helperChanged = previousHelperFeedsEnabled !== Boolean(session.setup.helperFeedsEnabled);
  if (transportChanged || helperChanged || !ndiManager.getStatus().running) ndiManager.start(activeTransportFeeds());
  broadcastSession();
  return serializeSession();
}

function activeTransportFeeds() {
  return session.outputBus.filter((feed) => feed.role === 'projector');
}

function applyRoomPreset(preset) {
  session.layoutMode = preset.layoutMode === 'ceiling' ? 'ceiling' : 'three-wall';
  session.room = roomPresets.normalizeRoom(preset.room || roomPresets.createDefaultRoom(session.layoutMode));
  session.projectorConfig = normalizeProjectorConfig(preset.projectorConfig || {});
  syncOutputBusExpectations();
  syncProjectorWindows();
  restartNdiIfRunning();
  applySetupState(preset.setup || {});
  return serializeSession();
}

function applyRoomPatch(patch = {}) {
  session.room = roomPresets.normalizeRoom({
    ...session.room,
    ...patch,
    dimensions: { ...(session.room?.dimensions || {}), ...(patch.dimensions || {}) },
    visitor: { ...(session.room?.visitor || {}), ...(patch.visitor || {}) },
    scan: { ...(session.room?.scan || {}), ...(patch.scan || {}) }
  });
  session.projectorConfig = normalizeProjectorConfig(roomPresets.projectorConfigFromRoom(session.room));
  syncOutputBusExpectations();
  syncProjectorWindows();
  restartNdiIfRunning();
  broadcastSession();
  return serializeSession();
}

function restartNdiIfRunning() {
  if (session.setup.transport !== 'ndi') return;
  if (ndiManager.getStatus().enabled || ndiManager.getStatus().running) ndiManager.start(activeTransportFeeds());
}

function syncRoomFromProjectorConfig() {
  const projectors = (session.room?.projectors || []).map((projector) => {
    if (projector.id === 'left') return { ...projector, yaw: session.projectorConfig.leftYaw, fov: session.projectorConfig.fov };
    if (projector.id === 'front') return { ...projector, yaw: session.projectorConfig.frontYaw, fov: session.projectorConfig.fov };
    if (projector.id === 'right') return { ...projector, yaw: session.projectorConfig.rightYaw, fov: session.projectorConfig.fov };
    if (projector.id === 'ceiling') return { ...projector, pitch: session.projectorConfig.ceilingPitch, fov: session.projectorConfig.ceilingFov };
    return projector;
  });
  session.room = roomPresets.normalizeRoom({ ...session.room, projectors });
}

function imageDataUrlToBuffer(imageDataUrl) {
  const base64 = imageDataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
  return Buffer.from(base64, 'base64');
}

function fileToDataUrl(filePath, mime = 'image/png') {
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function saveGeneratedAssets(imageDataUrl, recipe) {
  try {
    const rootDir = path.join(__dirname, '../../generated-worlds');
    if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });
    const ext = getImageExtension(imageDataUrl);
    const slug = (recipe?.title || 'world').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = path.join(rootDir, `${ts}-${slug}`);
    fs.mkdirSync(dir, { recursive: true });
    const imagePath = path.join(dir, `image.${ext}`);
    fs.writeFileSync(imagePath, imageDataUrlToBuffer(imageDataUrl));
    fs.writeFileSync(path.join(dir, 'metadata.json'), `${JSON.stringify({
      createdAt: new Date().toISOString(),
      title: recipe?.title,
      visualPrompt: recipe?.visual_prompt,
      provider: session.provider,
      timings: session.timings
    }, null, 2)}\n`);
    debugLog(`image saved: ${imagePath}`);
    return {
      dir,
      imagePath,
      imageFileUrl: pathToFileURL(imagePath).href,
      depthPath: path.join(dir, 'depth.png')
    };
  } catch (error) {
    debugLog('saveGeneratedAssets failed', error);
    return null;
  }
}

function getImageExtension(imageDataUrl) {
  if (imageDataUrl.startsWith('data:image/png')) return 'png';
  if (imageDataUrl.startsWith('data:image/jpeg') || imageDataUrl.startsWith('data:image/jpg')) return 'jpg';
  if (imageDataUrl.startsWith('data:image/webp')) return 'webp';
  if (imageDataUrl.startsWith('data:image/svg+xml')) return 'svg';
  return 'img';
}

function canGenerateDepth(imageResult) {
  return imageResult?.imageDataUrl?.startsWith('data:image/png') ||
    imageResult?.imageDataUrl?.startsWith('data:image/jpeg') ||
    imageResult?.imageDataUrl?.startsWith('data:image/jpg') ||
    imageResult?.imageDataUrl?.startsWith('data:image/webp');
}

function buildDepthCommand(inputPath, outputPath) {
  const configured = process.env.DEPTH_HELPER_COMMAND;
  if (configured) {
    return {
      command: configured,
      args: [inputPath, outputPath],
      provider: configured,
      shell: true
    };
  }

  return {
    command: process.env.DEPTH_NODE || 'node',
    args: [path.join(__dirname, '../../scripts/generate-depth.cjs'), inputPath, outputPath],
    provider: 'local-procedural-depth',
    shell: false
  };
}

function generateDepth(assetInfo) {
  if (!assetInfo?.imagePath || !assetInfo?.depthPath) {
    session.depthStatus = 'skipped';
    session.depthError = 'No generated image file was available for depth generation.';
    session.provider.depth = 'skipped';
    broadcastSession();
    return;
  }

  const started = Date.now();
  const depthJob = buildDepthCommand(assetInfo.imagePath, assetInfo.depthPath);
  session.depthStatus = 'generating';
  session.depthError = '';
  session.depthDataUrl = null;
  session.provider.depth = depthJob.provider;
  broadcastSession();

  const child = spawn(depthJob.command, depthJob.args, {
    cwd: path.join(__dirname, '../..'),
    windowsHide: true,
    shell: depthJob.shell,
    env: {
      ...process.env,
      CUDA_VISIBLE_DEVICES: DEPTH_GPU,
      DEPTH_GPU
    }
  });

  let stderr = '';
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    child.kill();
  }, DEPTH_TIMEOUT_MS);

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (error) => {
    clearTimeout(timeout);
    session.depthStatus = 'failed';
    session.depthError = error.message;
    session.timings.depthMs = Date.now() - started;
    debugLog('depth helper failed to start', error);
    broadcastSession();
  });

  child.on('close', (code) => {
    clearTimeout(timeout);
    session.timings.depthMs = Date.now() - started;
    if (didTimeout) {
      session.depthStatus = 'failed';
      session.depthError = `Depth generation timed out after ${DEPTH_TIMEOUT_MS}ms.`;
      debugLog(session.depthError);
      broadcastSession();
      return;
    }

    if (code !== 0 || !fs.existsSync(assetInfo.depthPath)) {
      session.depthStatus = 'failed';
      session.depthError = stderr.trim() || `Depth helper exited with code ${code}.`;
      debugLog('depth helper exited without output', session.depthError);
      broadcastSession();
      return;
    }

    try {
      session.depthDataUrl = fileToDataUrl(assetInfo.depthPath);
      session.depthFileUrl = pathToFileURL(assetInfo.depthPath).href;
      session.depthStatus = 'ready';
      session.depthError = '';
      debugLog(`depth saved: ${assetInfo.depthPath}`);
    } catch (error) {
      session.depthStatus = 'failed';
      session.depthError = error.message;
      debugLog('depth output could not be loaded', error);
    }
    broadcastSession();
  });
}

function generateSamMasks() {
  const imagePath = getCurrentImagePath();
  if (!imagePath) {
    session.maskStatus = 'failed';
    session.maskError = 'No generated image file is available for mask generation.';
    broadcastSession();
    return;
  }

  const command = process.env.SAM2_HELPER_COMMAND;
  if (!command) {
    session.maskStatus = 'skipped';
    session.maskError = 'SAM2_HELPER_COMMAND is not configured. Depth-band foreground remains active.';
    broadcastSession();
    return;
  }

  const outputPath = path.join(path.dirname(imagePath), 'sam2-mask.png');
  session.maskStatus = 'generating';
  session.maskError = '';
  session.maskDataUrl = null;
  session.maskFileUrl = '';
  broadcastSession();

  const child = spawn(command, [imagePath, outputPath], {
    cwd: path.join(__dirname, '../..'),
    windowsHide: true,
    shell: true,
    env: { ...process.env, CUDA_VISIBLE_DEVICES: DEPTH_GPU, DEPTH_GPU }
  });

  let stderr = '';
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    child.kill();
  }, MASK_TIMEOUT_MS);

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (error) => {
    clearTimeout(timeout);
    session.maskStatus = 'failed';
    session.maskError = error.message;
    debugLog('SAM 2 helper failed to start', error);
    broadcastSession();
  });

  child.on('close', (code) => {
    clearTimeout(timeout);
    if (didTimeout) {
      session.maskStatus = 'failed';
      session.maskError = `SAM 2 mask generation timed out after ${MASK_TIMEOUT_MS}ms.`;
      broadcastSession();
      return;
    }
    if (code !== 0 || !fs.existsSync(outputPath)) {
      session.maskStatus = 'failed';
      session.maskError = stderr.trim() || `SAM 2 helper exited with code ${code}.`;
      broadcastSession();
      return;
    }
    try {
      session.maskDataUrl = fileToDataUrl(outputPath);
      session.maskFileUrl = pathToFileURL(outputPath).href;
      session.maskStatus = 'ready';
      session.maskError = '';
    } catch (error) {
      session.maskStatus = 'failed';
      session.maskError = error.message;
    }
    broadcastSession();
  });
}

function getCurrentImagePath() {
  if (!session.imageFileUrl?.startsWith('file:')) return '';
  try {
    return fileURLToPath(session.imageFileUrl);
  } catch {
    return '';
  }
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
    visualMode: session.visualMode,
    projectorConfig: session.projectorConfig,
    depthStatus: session.depthStatus,
    depthError: session.depthError,
    maskStatus: session.maskStatus,
    maskError: session.maskError,
    error: session.error
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
  fs.writeFileSync(file, `${JSON.stringify(history.slice(-200), null, 2)}\n`);
}

async function generateWorld(visitorInput) {
  const prompt = visitorInput?.trim() || 'somewhere calm, blue, and endless';
  session.transcript = prompt;
  session.error = '';
  session.depthDataUrl = null;
  session.depthFileUrl = '';
  session.imageFileUrl = '';
  session.maskDataUrl = null;
  session.maskFileUrl = '';
  session.maskStatus = 'idle';
  session.maskError = '';
  session.depthStatus = 'idle';
  session.depthError = '';
  session.timings = {};
  session.costEstimateUsd = 0;
  session.provider.depth = 'none';
  setState('UNDERSTANDING');

  try {
    const expanded = await expandPrompt(prompt);
    session.recipe = expanded.recipe;
    session.provider.prompt = expanded.provider;
    session.timings.promptMs = expanded.latencyMs;
    broadcastSession();
  } catch (error) {
    session.recipe = createFallbackRecipe(prompt);
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
    const assetInfo = saveGeneratedAssets(image.imageDataUrl, session.recipe);
    session.imageFileUrl = assetInfo?.imageFileUrl || '';
    if (image.provider?.startsWith('local-svg-fallback')) {
      session.error = 'Cloud image generation is not configured on this machine. Set GEMINI_API_KEY or OPENAI_API_KEY in .env or in the environment.';
    }
    writeSessionHistory('world_generated');
    setState('PORTAL_OPENING');
    if (canGenerateDepth(image)) {
      generateDepth(assetInfo);
    } else {
      session.depthStatus = 'skipped';
      session.depthError = 'Depth generation skipped because the current world image is an SVG/local fallback.';
      session.provider.depth = 'skipped';
      broadcastSession();
    }
    setTimeout(() => setState('ARRIVAL'), 3500);
    setTimeout(() => setState('WORLD_ACTIVE'), 7000);
  } catch (error) {
    session.error = error.message;
    session.imageDataUrl = createSvgDataUrl(session.recipe);
    session.imageFileUrl = '';
    session.maskDataUrl = null;
    session.maskFileUrl = '';
    session.maskStatus = 'skipped';
    session.maskError = 'SAM 2 masks skipped because image generation used the SVG fallback.';
    session.provider.image = 'local-svg-fallback-after-error';
    session.depthStatus = 'skipped';
    session.depthError = 'Depth generation skipped because image generation used the SVG fallback.';
    session.provider.depth = 'skipped';
    writeSessionHistory('world_generated_with_fallback');
    setState('ERROR_FALLBACK');
    setTimeout(() => setState('PORTAL_OPENING'), 1200);
    setTimeout(() => setState('ARRIVAL'), 4700);
    setTimeout(() => setState('WORLD_ACTIVE'), 8200);
  }
}

ipcMain.handle('session:get', () => serializeSession());

ipcMain.handle('session:set-state', (_event, key) => {
  if (key === 'RESET') {
    session.transcript = '';
    session.error = '';
    session.costEstimateUsd = 0;
    session.depthDataUrl = null;
    session.depthFileUrl = '';
    session.imageFileUrl = '';
    session.maskDataUrl = null;
    session.maskFileUrl = '';
    session.maskStatus = 'idle';
    session.maskError = '';
    session.depthStatus = 'idle';
    session.depthError = '';
    session.timings = {};
    setState('RESET');
    setTimeout(() => setState('IDLE'), 1000);
    return serializeSession();
  }
  setState(key);
  return serializeSession();
});

ipcMain.handle('session:generate-world', (_event, visitorInput) => {
  generateWorld(visitorInput);
  return serializeSession();
});

ipcMain.handle('session:fallback-world', (_event, visitorInput) => {
  const prompt = visitorInput || session.transcript || 'somewhere calm, blue, and endless';
  session.transcript = prompt;
  session.recipe = createFallbackRecipe(prompt);
  session.imageDataUrl = createSvgDataUrl(session.recipe);
  session.imageFileUrl = '';
  session.provider.prompt = 'local-fallback';
  session.provider.image = 'local-svg-fallback';
  session.provider.depth = 'skipped';
  session.depthDataUrl = null;
  session.depthFileUrl = '';
  session.maskDataUrl = null;
  session.maskFileUrl = '';
  session.maskStatus = 'skipped';
  session.maskError = 'SAM 2 masks skipped for local SVG fallback.';
  session.depthStatus = 'skipped';
  session.depthError = 'Depth generation skipped for local SVG fallback.';
  session.costEstimateUsd = 0;
  writeSessionHistory('fallback_world');
  setState('PORTAL_OPENING');
  setTimeout(() => setState('ARRIVAL'), 2500);
  setTimeout(() => setState('WORLD_ACTIVE'), 5200);
  return serializeSession();
});

ipcMain.handle('session:set-layout', (_event, layoutMode) => {
  session.layoutMode = layoutMode === 'ceiling' ? 'ceiling' : 'three-wall';
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('masks:generate', () => {
  generateSamMasks();
  return serializeSession();
});

ipcMain.handle('session:set-visual-mode', (_event, visualMode) => {
  session.visualMode = ['auto', 'flat', 'depth'].includes(visualMode) ? visualMode : 'auto';
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:set-projector-config', (_event, config = {}) => {
  session.projectorConfig = normalizeProjectorConfig(config);
  syncRoomFromProjectorConfig();
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('room:set', (_event, patch = {}) => applyRoomPatch(patch));
ipcMain.handle('room:layout-template', (_event, layoutType = 'three-wall') => roomPresets.createPresetForLayout(layoutType));
ipcMain.handle('room:apply-layout-template', (_event, layoutType = 'three-wall') => {
  const preset = roomPresets.createPresetForLayout(layoutType);
  applyRoomPreset(preset);
  return serializeSession();
});
ipcMain.handle('room:import-scan', async () => {
  const result = await dialog.showOpenDialog(operatorWindow, {
    title: 'Import room scan mesh',
    properties: ['openFile'],
    filters: [
      { name: 'Room meshes', extensions: ['obj', 'gltf', 'glb'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths?.[0]) return serializeSession();
  const meshPath = result.filePaths[0];
  session.room = roomPresets.normalizeRoom({
    ...session.room,
    scan: {
      meshPath,
      meshFileUrl: pathToFileURL(meshPath).href,
      visible: true
    }
  });
  broadcastSession();
  return serializeSession();
});
ipcMain.handle('room:clear-scan', () => {
  session.room = roomPresets.normalizeRoom({
    ...session.room,
    scan: { meshPath: '', meshFileUrl: '', visible: false }
  });
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('setup:get', () => session.setup);
ipcMain.handle('setup:update', (_event, patch = {}) => applySetupState(patch));

ipcMain.handle('output:heartbeat', (_event, payload = {}) => {
  const feedId = String(payload.feedId || '');
  if (!feedId) return serializeSession();
  setFeedHealth(feedId, {
    windowAlive: true,
    renderHeartbeatAt: Date.now(),
    lastFrameAt: Date.now(),
    width: Math.round(Number(payload.width || 0)),
    height: Math.round(Number(payload.height || 0)),
    fps: Math.round(Number(payload.fps || 0))
  });
  return serializeSession();
});

ipcMain.handle('ndi:start', () => {
  ndiManager.start(activeTransportFeeds());
  broadcastSession();
  return ndiManager.getStatus();
});

ipcMain.handle('ndi:stop', () => {
  ndiManager.stop();
  broadcastSession();
  return ndiManager.getStatus();
});

ipcMain.handle('ndi:status', () => ndiManager.getStatus());

ipcMain.handle('room-presets:list', () => roomPresets.listPresets());
ipcMain.handle('room-presets:default', () => roomPresets.createDefaultPreset());
ipcMain.handle('room-presets:load', (_event, id) => {
  const preset = roomPresets.loadPreset(id);
  applyRoomPreset(preset);
  return preset;
});
ipcMain.handle('room-presets:save', (_event, preset = {}) => {
  const saved = roomPresets.savePreset({
    ...preset,
    layoutMode: session.layoutMode,
    projectorConfig: session.projectorConfig,
    setup: session.setup,
    room: session.room,
    outputs: session.outputBus.map((feed) => ({
      id: feed.id,
      name: feed.name,
      role: feed.role,
      feedName: feed.name,
      surface: feed.madMapperSurface || feed.surface || '',
      transport: session.setup.transport,
      orientation: feed.orientation || 'landscape',
      resolution: feed.resolution || { width: feed.targetWidth || 1920, height: feed.targetHeight || 1080 }
    }))
  });
  return saved;
});

ipcMain.handle('madmapper:discover', (_event, config = {}) => madMapper.discover(config));
ipcMain.handle('madmapper:get-value', (_event, path, config = {}) => madMapper.getValue(path, config));
ipcMain.handle('madmapper:send', (_event, path, value, config = {}) => madMapper.send(path, value, config));
ipcMain.handle('madmapper:trigger', (_event, path, config = {}) => madMapper.trigger(path, config));
ipcMain.handle('madmapper:trigger-cue', (_event, cueKey, config = {}) => {
  const cuePath = session.setup.madMapper?.cues?.[cueKey];
  if (!cuePath) throw new Error(`No MadMapper cue path configured for ${cueKey}.`);
  return madMapper.trigger(cuePath, { ...session.setup.madMapper, ...config });
});

ipcMain.handle('outputs:show-production', () => {
  const display = screen.getPrimaryDisplay();
  for (const [index, win] of getOutputWindows().entries()) {
    win.setPosition(display.bounds.x + 40 + index * 28, display.bounds.y + 40 + index * 28);
    win.showInactive();
  }
  return serializeSession();
});

ipcMain.handle('outputs:hide-production', () => {
  for (const [index, win] of getOutputWindows().entries()) {
    win.setPosition(-32000 + index * 8, -32000 + index * 8);
    win.showInactive();
  }
  return serializeSession();
});

ipcMain.handle('outputs:validate-madmapper', async (_event, config = {}) => {
  const discovery = await madMapper.discover({ ...session.setup.madMapper, ...config });
  return validateMadMapperAssignment(discovery);
});

function validateMadMapperAssignment(discovery = {}) {
  const mediaNames = new Set((discovery.media || []).map((item) => String(item.name || '').toLowerCase()));
  const surfaceNames = new Set((discovery.surfaces || []).map((item) => String(item.name || '').toLowerCase()));
  const checks = activeTransportFeeds().map((feed) => {
    const mediaFound = mediaNames.has(String(feed.name || '').toLowerCase());
    const surfaceFound = !feed.surface || surfaceNames.has(String(feed.surface).toLowerCase());
    return {
      id: feed.id,
      name: feed.name,
      role: feed.role,
      surface: feed.surface || '',
      mediaFound,
      surfaceFound,
      status: mediaFound && surfaceFound ? 'READY' : mediaFound || surfaceFound ? 'DEGRADED' : 'MISSING'
    };
  });
  return {
    ok: checks.every((check) => check.status === 'READY'),
    checkedAt: new Date().toISOString(),
    checks
  };
}

function normalizeProjectorConfig(config) {
  const next = { ...DEFAULT_PROJECTOR_CONFIG, ...session.projectorConfig };
  for (const key of Object.keys(DEFAULT_PROJECTOR_CONFIG)) {
    if (Number.isFinite(Number(config[key]))) next[key] = Number(config[key]);
  }
  next.leftYaw = clamp(next.leftYaw, -170, 170);
  next.frontYaw = clamp(next.frontYaw, -120, 120);
  next.rightYaw = clamp(next.rightYaw, -170, 170);
  next.fov = clamp(next.fov, 35, 115);
  next.ceilingPitch = clamp(next.ceilingPitch, 20, 88);
  next.ceilingFov = clamp(next.ceilingFov, 35, 120);
  return next;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

ipcMain.handle('window:output-fullscreen', () => {
  return false;
});

ipcMain.handle('window:focus-output', () => {
  operatorWindow?.focus();
  return true;
});

ipcMain.handle('window:reload-output', () => {
  for (const win of getOutputWindows()) win.reload();
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
