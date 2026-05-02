const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

loadProjectEnv(path.join(__dirname, '../../.env'));

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { getState } = require('./state-machine.cjs');
const { createFallbackRecipe } = require('./world-recipe.cjs');
const { expandPrompt, generateImage, createSvgDataUrl } = require('./ai-service.cjs');

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

const session = {
  state: getState('IDLE'),
  recipe: createFallbackRecipe('somewhere calm, blue, and endless'),
  imageDataUrl: null,
  imageFileUrl: '',
  depthDataUrl: null,
  depthFileUrl: '',
  depthStatus: 'idle',
  depthError: '',
  visualMode: 'auto',
  projectorConfig: { ...DEFAULT_PROJECTOR_CONFIG },
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
  const displays = screen.getAllDisplays();
  const external = displays.find((display) => display.bounds.x !== 0 || display.bounds.y !== 0) || displays[0];
  const outputViews = ['left', 'front', 'right'];

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

  outputWindows = outputViews.map((viewName, index) => createOutputWindow(external, viewName, index, outputViews.length));

  operatorWindow.loadFile(path.join(__dirname, '../../index.html'));

  operatorWindow.on('closed', () => {
    operatorWindow = null;
  });
}

function createOutputWindow(display, viewName, index, totalViews) {
  const width = Math.max(640, Math.floor(Math.min(1920, display.workAreaSize?.width || display.bounds.width || 1920) / Math.min(totalViews, 3)));
  const height = Math.max(360, Math.floor(width * 9 / 16));
  const x = display.bounds.x + (index * Math.min(width + 16, Math.floor((display.bounds.width || width) / Math.max(totalViews, 1))));
  const y = display.bounds.y + 40 + (index % 2) * 28;
  const title = `TakeMeThere_${viewName.toUpperCase()}`;
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    title,
    backgroundColor: '#000000',
    fullscreenable: true,
    autoHideMenuBar: true,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, '../../output.html'), { query: { view: viewName } });
  win.on('ready-to-show', () => {
    win.show();
    debugLog(`output ${viewName} ready-to-show`);
  });
  win.webContents.on('did-finish-load', () => debugLog(`output ${viewName} did-finish-load`));
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    debugLog(`output ${viewName} did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    debugLog(`output ${viewName} render-process-gone ${JSON.stringify(details)}`);
  });
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    debugLog(`output ${viewName} console level=${level} ${sourceId}:${line} ${message}`);
  });
  win.on('hide', () => debugLog(`output ${viewName} hidden`));
  win.on('show', () => debugLog(`output ${viewName} shown`));
  win.on('minimize', () => debugLog(`output ${viewName} minimized`));
  win.on('unresponsive', () => debugLog(`output ${viewName} unresponsive`));
  win.on('closed', () => {
    outputWindows = outputWindows.filter((output) => output !== win);
  });
  return win;
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
    state: session.state
  };
}

function setState(key, extras = {}) {
  session.state = getState(key);
  Object.assign(session, extras);
  broadcastSession();
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

ipcMain.handle('session:set-visual-mode', (_event, visualMode) => {
  session.visualMode = ['auto', 'flat', 'depth'].includes(visualMode) ? visualMode : 'auto';
  broadcastSession();
  return serializeSession();
});

ipcMain.handle('session:set-projector-config', (_event, config = {}) => {
  session.projectorConfig = normalizeProjectorConfig(config);
  broadcastSession();
  return serializeSession();
});

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
  const outputs = getOutputWindows();
  const shouldFullscreen = outputs.some((win) => !win.isFullScreen());
  for (const win of outputs) win.setFullScreen(shouldFullscreen);
  return shouldFullscreen;
});

ipcMain.handle('window:focus-output', () => {
  for (const win of getOutputWindows()) win.show();
  getOutputWindows()[0]?.focus();
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
