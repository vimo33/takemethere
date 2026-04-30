const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { getState } = require('./state-machine.cjs');
const { createFallbackRecipe } = require('./world-recipe.cjs');
const { expandPrompt, generateImage, createSvgDataUrl } = require('./ai-service.cjs');

let operatorWindow;
let outputWindow;

const DEBUG_LOG = path.join(__dirname, '../../electron-debug.log');

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
  transcript: '',
  layoutMode: 'three-wall',
  blackout: false,
  costEstimateUsd: 0,
  timings: {},
  provider: {
    prompt: 'local-fallback',
    image: 'local-svg-fallback'
  },
  error: ''
};

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

  outputWindow.on('ready-to-show', () => {
    outputWindow.show();
  });

  operatorWindow.on('closed', () => {
    operatorWindow = null;
  });
  outputWindow.on('closed', () => {
    outputWindow = null;
  });
}

function broadcastSession() {
  const payload = serializeSession();
  operatorWindow?.webContents.send('session:update', payload);
  outputWindow?.webContents.send('session:update', payload);
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
  session.timings = {};
  session.costEstimateUsd = 0;
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
    writeSessionHistory('world_generated');
    setState('PORTAL_OPENING');
    setTimeout(() => setState('ARRIVAL'), 3500);
    setTimeout(() => setState('WORLD_ACTIVE'), 7000);
  } catch (error) {
    session.error = error.message;
    session.imageDataUrl = createSvgDataUrl(session.recipe);
    session.provider.image = 'local-svg-fallback-after-error';
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
  session.provider.prompt = 'local-fallback';
  session.provider.image = 'local-svg-fallback';
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
