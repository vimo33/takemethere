import { SphereWorldOutputRenderer, normalizeSceneCameras } from './scene-engine.js';

const api = window.takeMeThere;
const root = document.querySelector('#output-app');
root.innerHTML = `
  <main class="output-shell">
    <canvas class="output-canvas" id="output-canvas"></canvas>
    <div class="output-labels" id="labels"></div>
    <div id="blackout"></div>
  </main>
`;

const canvas = document.querySelector('#output-canvas');
const labels = document.querySelector('#labels');
const blackout = document.querySelector('#blackout');
let renderer = null;
let lastImageDataUrl = '';
let lastTestKey = '';
let lastLayoutKey = '';

function ensureRenderer() {
  if (!renderer) renderer = new SphereWorldOutputRenderer(canvas, { host: root.querySelector('.output-shell'), maxPixelRatio: 1.5 });
  return renderer;
}

function activeProjectors(session) {
  const cameras = normalizeSceneCameras(session.sceneBuilder?.cameras || session.projectors);
  const mappings = session.outputMappings || { left: 'L', front: 'F', right: 'R', ceiling: 'C' };
  const slots = session.layoutMode === 'ceiling' ? ['left', 'front', 'right', 'ceiling'] : ['left', 'front', 'right'];
  return slots.map((slot) => {
    const camera = cameras.find((item) => item.id === mappings[slot]);
    if (!camera) return null;
    return { ...camera, id: slot, label: slot.toUpperCase() };
  }).filter(Boolean);
}

function renderLabels(projectors) {
  const key = projectors.map((projector) => `${projector.id}:${projector.label}:${projector.live}`).join('|');
  if (key === lastLayoutKey) return;
  lastLayoutKey = key;
  labels.innerHTML = projectors.map((projector, index) => `
    <div class="view-label" style="left:calc(${index} * 100% / ${projectors.length} + 18px)">${projector.label}</div>
  `).join('');
}

function renderSession(session) {
  const stateKey = session.state?.key || 'IDLE';
  blackout.className = stateKey === 'BLACKOUT' ? 'blackout-overlay' : '';
  const sceneSettings = session.sceneSettings || {};
  const projectors = activeProjectors(session);
  renderLabels(projectors);

  const testKey = sceneSettings.outputTestMode ? `${sceneSettings.testPattern || 'grid'}:${session.layoutMode}` : '';
  if (!testKey && !session.imageDataUrl) return;
  const outputRenderer = ensureRenderer();
  outputRenderer.updateConfig({
    projectors,
    sceneSettings: { ...sceneSettings, overview: false }
  });
  if (testKey && testKey !== lastTestKey) {
    outputRenderer.setTestPattern(sceneSettings.testPattern || 'grid');
    lastTestKey = testKey;
    lastImageDataUrl = '';
    return;
  }

  if (!testKey && (session.imageDataUrl !== lastImageDataUrl || lastTestKey)) {
    lastImageDataUrl = session.imageDataUrl || '';
    lastTestKey = '';
    outputRenderer.setImageDataUrl(session.imageDataUrl, session.recipe?.palette, session.history?.length || 1);
  }
}

window.addEventListener('beforeunload', () => renderer?.dispose());
api.onSessionUpdate(renderSession);
api.getSession().then(renderSession);
