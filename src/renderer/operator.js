import { AudioEngine } from './audio-engine.js';
import { DEFAULT_PROJECTORS, MappingRoomRenderer, SphereWorldRenderer, SphereWorldSceneBuilder, normalizeProjectors, normalizeSceneCameras, colorToCss } from './scene-engine.js';

const api = window.takeMeThere;
const audio = new AudioEngine();
const root = document.querySelector('#operator-app');

const PHASES = [
  ['IDLE', 'Idle', ''],
  ['LISTENING', 'Listening', 'cyan'],
  ['UNDERSTANDING', 'Understanding', 'violet'],
  ['GENERATING', 'Generating', 'amber'],
  ['PORTAL_OPENING', 'Portal Opening', 'magenta'],
  ['ARRIVAL', 'Arrival', 'magenta'],
  ['WORLD_ACTIVE', 'World Active', 'green'],
  ['EXIT', 'Exit', 'violet']
];

let session = null;
let surface = 'live';
let selectedProjectorId = 'F';
let missionStart = null;
let resetArmed = false;
let promptValue = 'Take me to a forest where the trees are made of glass.';
let renderers = [];
let audioTimer = null;
let audioTick = 0;
let fileInput = null;
let mappingPhotoInput = null;
let renderSignature = '';
let generationInFlight = false;
let selectedMappingObjectId = 'wall-front';

root.innerHTML = `
  <div class="shell scanlines">
    <header class="topbar" id="topbar"></header>
    <div id="surface-root"></div>
  </div>
`;

const topbar = document.querySelector('#topbar');
const surfaceRoot = document.querySelector('#surface-root');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function fmtMs(ms) {
  if (ms == null) return '--';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function ledFor(key) {
  return PHASES.find(([phase]) => phase === key)?.[2] || (key === 'BLACKOUT' || key === 'RESET' ? 'red' : key === 'ERROR_FALLBACK' ? 'amber' : 'cyan');
}

function disposeRenderers() {
  for (const renderer of renderers) renderer.dispose();
  renderers = [];
}

function setSurface(nextSurface) {
  if (!nextSurface || nextSurface === surface) return;
  surface = nextSurface;
  api.updateSceneSettings({ surface: nextSurface });
  render(true);
}

function updateMissionClock() {
  const node = document.querySelector('[data-mission-clock]');
  if (node) node.textContent = missionStart ? fmtClock(Date.now() - missionStart) : '--:--:--';
}

function startAudioBars() {
  if (audioTimer) return;
  audioTimer = setInterval(() => {
    audioTick += 1;
    for (const bar of document.querySelectorAll('.audio-bar i')) {
      const index = Number(bar.dataset.index || 0);
      const active = ['LISTENING', 'ARRIVAL', 'WORLD_ACTIVE'].includes(session?.state?.key);
      const base = session?.state?.key === 'LISTENING' ? 0.82 : session?.state?.key === 'ARRIVAL' ? 0.95 : active ? 0.48 : 0.12;
      const v = base * (0.35 + Math.abs(Math.sin(audioTick * 0.38 + index * 0.7)) * 0.65);
      bar.style.height = `${4 + v * 16}px`;
      bar.style.opacity = String(0.45 + v * 0.5);
    }
    updateMissionClock();
  }, 120);
}

function renderTopbar() {
  const state = session?.state || {};
  const settings = session?.sceneSettings || {};
  const ndi = session?.ndi || {};
  const projectors = normalizeProjectors(session?.projectors, session?.layoutMode);
  const liveCount = projectors.filter((projector) => projector.live).length;
  const wallTime = new Date().toLocaleTimeString('en-GB');
  const ndiSignal = ndi.running ? 'green' : ndi.helperExists ? 'amber' : 'red';
  const ndiLabel = ndi.running ? 'NDI LIVE' : ndi.helperExists ? 'NDI READY' : 'NDI MISSING';
  topbar.innerHTML = `
    <div class="brand">
      <div class="brand-mark"></div>
      <div>
        <div class="brand-name">TAKE ME THERE</div>
        <div class="brand-sub">Operator Console · v0.4</div>
      </div>
    </div>
    <div class="topbar-tape">
      <div class="tape-cell signal-${ledFor(state.key)}">
        <span class="label">Phase</span>
        <span class="value"><span class="led ${ledFor(state.key)} ${(state.key === 'GENERATING' || state.key === 'LISTENING') ? 'pulse' : ''}" style="margin-right:6px"></span>${escapeHtml(state.label || 'Idle').toUpperCase()}</span>
      </div>
      <div class="tape-cell"><span class="label">Mission Clock</span><span class="value" data-mission-clock>${missionStart ? fmtClock(Date.now() - missionStart) : '--:--:--'}</span></div>
      <div class="tape-cell"><span class="label">Local Time</span><span class="value">${wallTime}</span></div>
      <div class="tape-cell signal-amber"><span class="label">Gen Spend</span><span class="value">$${Number(session?.costEstimateUsd || 0).toFixed(3)}</span></div>
      <div class="tape-cell"><span class="label">Prompt Provider</span><span class="value">${escapeHtml(session?.provider?.prompt || 'local')}</span></div>
      <div class="tape-cell"><span class="label">Image Provider</span><span class="value">${escapeHtml(session?.provider?.image || 'local')}</span></div>
      <div class="tape-cell signal-green"><span class="label">Output</span><span class="value"><span class="led green" style="margin-right:6px"></span>${liveCount}/${projectors.length} LIVE</span></div>
      <div class="tape-cell signal-${ndiSignal}"><span class="label">Transport</span><span class="value"><span class="led ${ndiSignal}" style="margin-right:6px"></span>${ndiLabel}</span></div>
      <div class="tape-cell signal-violet"><span class="label">Mode</span><span class="value">${escapeHtml(settings.worldMode || 'single').toUpperCase()}</span></div>
    </div>
    <div class="topbar-right">
      <div class="segmented">
        <button class="${surface === 'live' ? 'active' : ''}" data-action="surface" data-surface="live">Live</button>
        <button class="${surface === 'scene' ? 'active' : ''}" data-action="surface" data-surface="scene">Scene Builder</button>
        <button class="${surface === 'mapping-room' ? 'active' : ''}" data-action="surface" data-surface="mapping-room">Mapping Room</button>
      </div>
    </div>
  `;
}

function surfaceMarkup() {
  if (surface === 'scene') return sceneBuilderMarkup();
  if (surface === 'mapping-room') return mappingRoomMarkup();
  return liveConsoleMarkup();
}

function mappingRoomSignature(mappingRoom = {}) {
  const items = [
    ...(mappingRoom.surfaces || []),
    ...(mappingRoom.objects || []),
    ...(mappingRoom.masks || [])
  ];
  const photos = mappingRoom.referencePhotos || [];
  return [
    mappingRoom.selectedObjectId || '',
    mappingRoom.showProjectors === false ? 'hide-projectors' : 'show-projectors',
    items.map((item) => [
      item.id,
      item.label,
      item.shape,
      item.role,
      item.materialMode,
      item.visible === false ? 0 : 1
    ].join(',')).join('|'),
    photos.map((photo) => `${photo.id}:${photo.label}:${photo.visible === false ? 0 : 1}:${photo.opacity}:${photo.dataUrl?.length || 0}`).join('|')
  ].join('::');
}

function getRenderSignature() {
  const settings = session?.sceneSettings || {};
  const stateKey = session?.state?.key || 'IDLE';
  const projectors = normalizeProjectors(session?.projectors, session?.layoutMode);
  const sceneCameras = normalizeSceneCameras(session?.sceneBuilder?.cameras);
  return [
    surface,
    stateKey,
    session?.layoutMode || 'three-wall',
    session?.imageDataUrl ? `${session.imageDataUrl.length}:${session.timings?.imageMs || 0}` : 'no-image',
    session?.history?.length || 0,
    selectedProjectorId,
    settings.worldMode || 'single',
    settings.outputTestMode ? 'test' : 'world',
    settings.testPattern || 'grid',
    (session?.generatedWorlds || []).map((world) => world.name).join('|'),
    session?.config?.hasGemini ? 'gemini' : 'no-gemini',
    session?.config?.hasOpenAI ? 'openai' : 'no-openai',
    session?.ndi?.running ? 'ndi-running' : `ndi-${session?.ndi?.error || 'idle'}`,
    session?.sceneBuilder?.selectedCameraId || '',
    session?.sceneBuilder?.depthMode || 'single',
    mappingRoomSignature(session?.mappingRoom),
    JSON.stringify(session?.outputMappings || {}),
    sceneCameras.map((camera) => `${camera.id}:${camera.label}:${camera.signal}:${camera.live ? 1 : 0}:${camera.outputSlot}:${camera.orientation}:${camera.color}`).join('|'),
    projectors.map((projector) => `${projector.id}:${projector.live ? 1 : 0}:${projector.signal}`).join('|')
  ].join('::');
}

function render(force = false) {
  if (!session) return;
  renderTopbar();
  const nextSignature = getRenderSignature();
  if (!force && nextSignature === renderSignature) {
    updateSceneRenderers();
    updateControlReadouts();
    return;
  }
  renderSignature = nextSignature;
  disposeRenderers();
  surfaceRoot.innerHTML = surfaceMarkup();
  hydrateCanvases();
  startAudioBars();
}

function updateSceneRenderers() {
  for (const renderer of renderers) {
    if (renderer instanceof MappingRoomRenderer) {
      renderer.updateConfig({
        mappingRoom: session.mappingRoom,
        projectors: session.sceneBuilder?.cameras || session.projectors,
        onMappingRoomChange: (patch) => api.updateMappingRoom(patch),
        onObjectChange: (id, patch) => api.updateMappingRoomItem(id, patch),
        onSelectObject: (id) => api.updateMappingRoom({ selectedObjectId: id })
      });
      continue;
    }
    if (renderer instanceof SphereWorldSceneBuilder) {
      renderer.updateConfig({
        cameras: session.sceneBuilder?.cameras,
        sceneBuilder: session.sceneBuilder,
        selectedId: selectedProjectorId,
        onCameraChange: (cameraId, patch) => api.updateSceneCamera(cameraId, patch),
        onSelectCamera: (cameraId) => {
          if (!cameraId) return;
          selectedProjectorId = cameraId;
          api.updateSceneBuilder({ selectedCameraId: cameraId });
        },
        onMainViewChange: (mainView) => api.updateSceneBuilder({ mainView })
      });
      continue;
    }
    const id = renderer.host?.dataset?.previewId;
    const projectors = id
      ? normalizeProjectors(session.projectors, session.layoutMode).filter((projector) => projector.id === id)
      : session.projectors;
    renderer.updateConfig({
      projectors,
      sceneSettings: { ...session.sceneSettings, overview: surface === 'scene' ? !!session.sceneSettings?.overview : false },
      layoutMode: session.layoutMode,
      selectedId: selectedProjectorId,
      onProjectorChange: (projectorId, patch) => api.updateProjector(projectorId, patch)
    });
  }
}

function mappingItems(mappingRoom = session?.mappingRoom || {}) {
  return [
    ...(mappingRoom.surfaces || []),
    ...(mappingRoom.objects || []),
    ...(mappingRoom.masks || [])
  ];
}

function selectedMappingItem() {
  const selectedId = session?.mappingRoom?.selectedObjectId || selectedMappingObjectId;
  return mappingItems().find((item) => item.id === selectedId) || mappingItems()[0] || null;
}

function updateControlReadouts() {
  const projectors = new Map(normalizeProjectors(session.projectors, session.layoutMode).map((projector) => [projector.id, projector]));
  const cameras = new Map(normalizeSceneCameras(session.sceneBuilder?.cameras).map((camera) => [camera.id, camera]));
  const mapping = new Map(mappingItems().map((item) => [item.id, item]));
  for (const input of surfaceRoot.querySelectorAll('[data-slider-kind="projector"]')) {
    const projector = projectors.get(input.dataset.id);
    if (!projector || document.activeElement === input) continue;
    input.value = projector[input.dataset.key];
    updateSliderDisplay(input);
  }
  for (const input of surfaceRoot.querySelectorAll('[data-slider-kind="camera"]')) {
    const camera = cameras.get(input.dataset.id);
    if (!camera || document.activeElement === input) continue;
    input.value = camera[input.dataset.key];
    updateSliderDisplay(input);
  }
  for (const input of surfaceRoot.querySelectorAll('[data-slider-kind="setting"]')) {
    if (document.activeElement === input) continue;
    input.value = session.sceneSettings?.[input.dataset.key] ?? input.value;
    updateSliderDisplay(input);
  }
  for (const input of surfaceRoot.querySelectorAll('[data-slider-kind="mapping"]')) {
    const item = mapping.get(input.dataset.id);
    if (!item || document.activeElement === input) continue;
    input.value = item[input.dataset.key];
    updateSliderDisplay(input);
  }
  for (const toggle of surfaceRoot.querySelectorAll('[data-action="projector-toggle"]')) {
    const projector = projectors.get(toggle.dataset.id);
    if (projector) toggle.classList.toggle('on', projector.live);
  }
  for (const toggle of surfaceRoot.querySelectorAll('[data-action="camera-toggle"]')) {
    const camera = cameras.get(toggle.dataset.id);
    if (camera) toggle.classList.toggle('on', camera.live);
  }
}

function liveConsoleMarkup() {
  const stateKey = session.state?.key || 'IDLE';
  const recipe = session.recipe || {};
  const settings = session.sceneSettings || {};
  const config = session.config || {};
  const pipeline = [
    ['01', 'Transcribe', session.transcript ? 'done' : stateKey === 'LISTENING' ? 'active' : 'idle', 'browser-stt', session.transcript ? 1240 : null],
    ['02', 'Expand Prompt', session.timings?.promptMs ? 'done' : stateKey === 'UNDERSTANDING' ? 'active' : 'idle', session.provider?.prompt || 'local', session.timings?.promptMs],
    ['03', 'Generate Image', session.timings?.imageMs ? 'done' : stateKey === 'GENERATING' ? 'active' : 'idle', session.provider?.image || 'local', session.timings?.imageMs],
    ['04', 'Load to Scene', session.imageDataUrl ? 'done' : 'idle', 'scene-builder', session.imageDataUrl ? 420 : null],
    ['05', 'Open Portal', ['PORTAL_OPENING', 'ARRIVAL', 'WORLD_ACTIVE'].includes(stateKey) ? 'done' : 'idle', 'lighting-bus', ['ARRIVAL', 'WORLD_ACTIVE'].includes(stateKey) ? 4600 : null]
  ];
  const isGenerating = ['UNDERSTANDING', 'GENERATING'].includes(stateKey);
  const isIdle = ['IDLE', 'LISTENING', 'RESET'].includes(stateKey);
  const projectors = normalizeProjectors(session.projectors, session.layoutMode);

  return `
    <div class="main">
      <aside class="left-rail">
        <div class="panel-header"><h3>Sequence</h3><span class="badge">PHASE ${Math.max(1, PHASES.findIndex(([key]) => key === stateKey) + 1)}/8</span></div>
        <div class="phase-rail">
          ${PHASES.map(([key, label], index) => {
            const current = PHASES.findIndex(([phase]) => phase === stateKey);
            const status = current === index ? 'active' : current > index ? 'done' : '';
            return `<div class="phase-step ${status}"><span class="marker">${status === 'active' ? `<span class="led ${ledFor(key)} pulse"></span>` : status === 'done' ? 'OK' : String(index + 1).padStart(2, '0')}</span><span class="name">${label}</span><span class="ts">${status === 'active' ? '...' : ''}</span></div>`;
          }).join('')}
        </div>
        <div class="panel-section scroll" style="flex:1">
          <div class="section-title"><span>Session History</span><span>${(session.history || []).length} ENTR.</span></div>
          ${sessionHistoryMarkup()}
        </div>
      </aside>

      <section class="viewport-cell">
        <canvas class="viewport-canvas" data-scene-main></canvas>
        <div class="crosshair"></div>
        ${['PORTAL_OPENING', 'ARRIVAL'].includes(stateKey) ? '<div class="portal-ring"></div>' : ''}
        <div class="viewport-overlay" style="top:0;left:0"><div class="viewport-corner mono">WORLD <span>${escapeHtml(recipe.title || 'UNKNOWN DREAM').toUpperCase()}</span><div class="dim" style="font-size:9px;margin-top:2px">SEED · 0x${String((session.history?.length || 1) + 4096).toString(16).toUpperCase()}</div></div></div>
        <div class="viewport-overlay" style="top:0;right:0;text-align:right"><div class="viewport-corner mono">FOV <span>${Number(settings.mainFov || 75).toFixed(0)}°</span> · DRIFT <span>${Number(settings.drift || 0.6).toFixed(2)}x</span><div class="dim" style="font-size:9px;margin-top:2px">FOG ${Number(settings.fog || 0).toFixed(2)} · PCL ${Math.round(Number(settings.particles || 0) * 100)}%</div></div></div>
        ${isGenerating ? `<div class="viewport-overlay" style="right:0;bottom:0;text-align:right"><div class="viewport-corner mono"><span class="led amber pulse-fast" style="margin-right:6px"></span><span style="color:var(--signal-amber)">GENERATING</span><div class="dim" style="font-size:9px;margin-top:2px">${escapeHtml(session.provider?.image || 'local')}</div></div></div>` : ''}
        ${isIdle ? promptOverlayMarkup() : ''}
      </section>

      <aside class="right-bay">
        <div class="panel-header">
          <h3>Projection Bay</h3>
          <div class="segmented">
            <button class="${session.layoutMode !== 'ceiling' ? 'active' : ''}" data-action="layout" data-layout="three-wall">3-Wall</button>
            <button class="${session.layoutMode === 'ceiling' ? 'active' : ''}" data-action="layout" data-layout="ceiling">+Ceiling</button>
          </div>
        </div>
        <div class="panel-section scroll" style="flex:1">
          ${(!config.hasGemini && !config.hasOpenAI) ? '<div class="error mono" style="margin-bottom:10px">Cloud image generation is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY in .env.local before starting the app, otherwise local fallback worlds are used.</div>' : ''}
          ${projectors.map((projector) => projectorCardMarkup(projector)).join('')}
          <div class="well" style="margin-top:10px">
            <div class="section-title"><span>Master Output</span><span>LIVE APPLY</span></div>
            ${sliderMarkup('Brightness', 'intensity', settings.intensity ?? 0.85, 0, 1, 0.01, `${Math.round((settings.intensity ?? 0.85) * 100)}%`, 'setting')}
            ${sliderMarkup('Fog', 'fog', settings.fog ?? 0.42, 0, 1, 0.01, Number(settings.fog ?? 0.42).toFixed(2), 'setting')}
            ${sliderMarkup('Particles', 'particles', settings.particles ?? 0.55, 0, 1, 0.01, `${Math.round((settings.particles ?? 0.55) * 100)}%`, 'setting')}
          </div>
          ${generatedWorldsMarkup()}
        </div>
      </aside>

      <section class="bottom-pipeline">
        <div class="panel-header"><h3>Generation Pipeline</h3><span class="badge">${session.error ? `<span style="color:var(--signal-red)">${escapeHtml(session.error)}</span>` : 'NOMINAL'}</span></div>
        <div class="pipeline">
          ${pipeline.map(([idx, name, status, provider, ms]) => `<div class="stage-cell ${status}"><div class="stage-head"><span class="index">${idx}</span><span class="name">${name}</span></div><div class="meta"><span>${escapeHtml(provider)}</span><span>${fmtMs(ms)}</span></div></div>`).join('')}
        </div>
      </section>

      <footer class="transport">
        <div class="transport-zone">
          <button class="btn-latch ${resetArmed ? 'armed' : ''}" data-action="reset"><span class="led red ${resetArmed ? 'pulse' : ''}"></span>${resetArmed ? 'CONFIRM RESET' : 'RESET'}</button>
          <button class="btn-latch ${stateKey === 'BLACKOUT' ? 'armed' : ''}" data-action="blackout"><span class="led red"></span>BLACKOUT</button>
        </div>
        <div class="transport-zone" style="justify-content:center">
          <button class="btn ghost" data-action="overview">⊙ ${settings.overview ? 'Inside' : 'Overview'}</button>
          <button class="btn" data-action="start" ${stateKey !== 'IDLE' && stateKey !== 'RESET' ? 'disabled' : ''}>▶ Start Session</button>
          <button class="btn primary" data-action="generate" ${(isGenerating || generationInFlight) ? 'disabled' : ''}>⚡ Open Portal</button>
          <button class="btn" data-action="arrival">⤴ Trigger Arrival</button>
          <button class="btn" data-action="end">◼ End Session</button>
          <button class="btn ghost" data-action="fallback">⏵ Skip to Fallback</button>
        </div>
        <div class="transport-zone">
          <div><div class="mono dim" style="font-size:9px;text-align:right;letter-spacing:.18em;text-transform:uppercase">Audio Bus</div><div class="audio-bar">${Array.from({ length: 16 }, (_, index) => `<i data-index="${index}"></i>`).join('')}</div></div>
        </div>
      </footer>
      ${stateKey === 'BLACKOUT' ? '<div class="blackout-screen"></div>' : ''}
    </div>
  `;
}

function generatedWorldsMarkup() {
  const worlds = session.generatedWorlds || [];
  return `
    <div class="well previous-worlds">
      <div class="section-title"><span>Previous Generations</span><span>${worlds.length} FILES</span></div>
      <div class="world-list">
        ${worlds.map((world) => `
          <button class="world-row" data-action="load-world" data-file="${escapeHtml(world.name)}">
            <span>
              <strong>${escapeHtml(world.title || 'Generated world')}</strong>
              <span class="mono dim">${escapeHtml(world.name)}</span>
            </span>
            <span class="mono dim">${escapeHtml(world.at ? new Date(world.at).toLocaleDateString() : '')}</span>
          </button>
        `).join('') || '<div class="dim mono">No saved generations yet.</div>'}
      </div>
    </div>
  `;
}

function sessionHistoryMarkup() {
  const history = session.history || [];
  if (!history.length) return '<div class="well dim mono">No prior worlds.</div>';
  return history.map((item) => {
    const loadable = !!item.loadable && item.historyIndex !== undefined && item.historyIndex !== null;
    const tag = loadable ? 'button' : 'div';
    const action = loadable ? `data-action="load-history" data-history-index="${escapeHtml(item.historyIndex)}"` : '';
    const status = loadable ? 'RESTORE' : 'NO IMAGE';
    const statusClass = loadable ? 'restore' : 'missing';
    const when = item.at ? new Date(item.at) : null;
    const clock = Number.isNaN(when?.getTime?.()) ? (item.ts || '') : when.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const provider = item.worldName || item.provider?.image || item.provider?.prompt || 'history';
    return `
      <${tag} class="well history-item ${statusClass}" ${action}>
        <div class="history-line">
          <strong class="mono">${escapeHtml(item.title || 'World')}</strong>
          <span class="mono history-status ${statusClass}">${status}</span>
        </div>
        <div class="history-line" style="margin-top:5px">
          <span class="mono ${item.event?.includes('fallback') ? 'history-warning' : ''}">${escapeHtml(item.event || item.state || 'ARRIVAL_OK')}</span>
          <span class="mono dim">${escapeHtml(clock)}</span>
        </div>
        <div class="history-line" style="margin-top:5px">
          <span class="mono dim history-file">${escapeHtml(provider)}</span>
          <span class="mono dim">${fmtMs(item.timings?.imageMs || item.imageMs)}</span>
          <span class="mono dim">$${Number(item.costEstimateUsd || item.cost || 0).toFixed(2)}</span>
        </div>
      </${tag}>
    `;
  }).join('');
}

function promptOverlayMarkup() {
  const listening = session.state?.key === 'LISTENING';
  return `
    <div class="prompt-overlay">
      <div class="prompt-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="uc muted">Visitor Prompt</span>
          ${listening ? `<span class="mono" style="font-size:10px;color:var(--signal-cyan);letter-spacing:.18em"><span class="led cyan pulse-fast" style="margin-right:8px"></span>LISTENING</span>` : ''}
        </div>
        <textarea class="prompt" id="prompt-input" rows="3" placeholder="Where do you want to go?">${escapeHtml(promptValue)}</textarea>
        <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
          <button class="btn" data-action="listen"><span class="led cyan"></span>${listening ? 'Capture' : 'Open Mic'}</button>
      <button class="btn primary" data-action="generate" ${generationInFlight ? 'disabled' : ''}>⚡ Open Portal</button>
        </div>
        <div style="margin-top:12px;font-size:11px;color:var(--fg-4);display:flex;justify-content:space-between"><span><span class="kbd">⌘</span><span class="kbd">↵</span> generate</span><span class="mono">${promptValue.length} chars</span></div>
      </div>
    </div>
  `;
}

function projectorCardMarkup(projector) {
  return `
    <div class="proj-card ${selectedProjectorId === projector.id ? 'active' : ''}" data-projector-card="${projector.id}">
      <div class="proj-head">
        <span class="led" style="background:${colorToCss(projector.color)};box-shadow:0 0 8px ${colorToCss(projector.color, .7)}"></span>
        <div><strong class="mono">${escapeHtml(projector.label)}</strong><div class="mono dim" style="font-size:9px;margin-top:2px">${escapeHtml(projector.signal)}</div></div>
        <button class="toggle ${projector.live ? 'on' : ''}" data-action="projector-toggle" data-id="${projector.id}" title="Live to projector"></button>
      </div>
      <div class="proj-preview no-webgl"><div class="mono">${escapeHtml(projector.outputSlot || projector.id)} · ${projector.live ? 'LIVE' : 'MUTED'}</div></div>
      <div class="proj-controls">
        ${sliderMarkup('Yaw', 'yaw', projector.yaw, -Math.PI, Math.PI, 0.005, `${(projector.yaw * 180 / Math.PI).toFixed(1)}°`, 'projector', projector.id)}
        ${sliderMarkup('Pitch', 'pitch', projector.pitch, -Math.PI / 2, Math.PI / 2, 0.005, `${(projector.pitch * 180 / Math.PI).toFixed(1)}°`, 'projector', projector.id)}
        ${sliderMarkup('FOV', 'fov', projector.fov, 20, 120, 1, `${Math.round(projector.fov)}°`, 'projector', projector.id)}
      </div>
    </div>
  `;
}

function sceneBuilderMarkup() {
  const settings = session.sceneSettings || {};
  const builder = session.sceneBuilder || {};
  const cameras = normalizeSceneCameras(builder.cameras);
  const mappings = session.outputMappings || {};
  const selected = cameras.find((camera) => camera.id === selectedProjectorId || camera.id === builder.selectedCameraId) || cameras[0];
  selectedProjectorId = selected?.id || 'F';
  const depthMode = builder.depthMode || settings.worldMode || 'single';
  return `
    <div class="main">
      <aside class="left-rail">
        <div class="panel-header"><h3>Virtual Cameras</h3><button class="btn sm primary" data-action="add-camera">+ Add</button></div>
        <div class="scroll" style="flex:1">
          ${cameras.map((camera) => `
            <button class="projector-row ${selectedProjectorId === camera.id ? 'active' : ''}" data-action="select-camera" data-id="${camera.id}">
              <span class="led" style="background:${colorToCss(camera.color)};box-shadow:0 0 8px ${colorToCss(camera.color, .7)}"></span>
              <span><strong>${escapeHtml(camera.label)}</strong><span class="mono dim" style="display:block;font-size:9px;margin-top:2px">${escapeHtml(camera.outputSlot || camera.signal || 'planning camera')}</span></span>
              <span class="led ${camera.live ? 'green' : ''}"></span>
            </button>
          `).join('')}
        </div>
        <div class="panel-section" style="margin-top:auto">
          <div class="section-title"><span>Room Preset</span><span>JSON</span></div>
          <input type="text" id="preset-name" value="take-me-there-room.json" />
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
            <button class="btn sm" data-action="save-preset">⤓ Save</button>
            <button class="btn sm ghost" data-action="load-preset">⤒ Load</button>
          </div>
        </div>
      </aside>

      <section class="viewport-cell">
        <canvas class="viewport-canvas" data-scene-main></canvas>
        <div class="viewport-overlay" style="top:0;left:0"><div class="viewport-corner mono"><span style="color:var(--signal-violet)">SCENE BUILDER · ${builder.mainView?.overview ? 'OVERVIEW' : 'INSIDE'}</span><div class="dim" style="font-size:9px;margin-top:2px">shared sphere-world scene · ${cameras.length} cameras</div></div></div>
        <div class="viewport-overlay" style="top:0;right:0;text-align:right"><div class="viewport-corner mono">WORLD <span>${escapeHtml(depthMode).toUpperCase()}</span><div class="dim" style="font-size:9px;margin-top:2px">R=500 · frustum rectangles on panorama</div></div></div>
        <div class="viewport-overlay" style="bottom:12px;right:12px;pointer-events:auto"><button class="btn sm ${builder.mainView?.overview ? 'primary' : ''}" data-action="overview">⊙ Overview</button> <button class="btn sm" data-action="test-pattern">⊞ ${depthMode === 'test' ? 'World Image' : 'Test Grid'}</button></div>
      </section>

      <aside class="right-bay">
        <div class="panel-header"><h3>Camera Controls</h3><span class="badge">${escapeHtml(selected?.label || '')}</span></div>
        <div class="panel-section scroll" style="flex:1">
          <div class="section-title"><span>Selected Camera</span><span>${escapeHtml(selected?.orientation || 'landscape').toUpperCase()}</span></div>
          <div class="well mono" style="margin-bottom:10px;color:var(--fg-3)">Monitor canvas renders in the bottom bay from the same shared scene.</div>
          ${selected ? cameraControlsMarkup(selected) : ''}
          <div class="panel-section" style="padding-left:0;padding-right:0">
            <div class="section-title"><span>Output Mapping</span><span>Physical Slots</span></div>
            ${['left', 'front', 'right', 'ceiling'].map((slot) => `
              <div class="slider-row output-map-row" style="grid-template-columns:74px 1fr">
                <span class="label">${slot}</span>
                <select data-action="output-map" data-slot="${slot}">
                  <option value="">Unmapped</option>
                  ${cameras.map((camera) => `<option value="${escapeHtml(camera.id)}" ${mappings[slot] === camera.id ? 'selected' : ''}>${escapeHtml(camera.label)}</option>`).join('')}
                </select>
              </div>
            `).join('')}
          </div>
        </div>
      </aside>

      <section class="bottom-pipeline">
        <div class="panel-header"><h3>Monitor Canvas Bay</h3><span class="badge">ONE RENDERER PER CAMERA · WORLD LAYER ONLY</span></div>
        <div class="monitor-bottom" data-monitor-root>
          ${cameras.map((camera) => `
            <button class="monitor-card ${camera.orientation === 'portrait' ? 'portrait' : ''} ${selectedProjectorId === camera.id ? 'active' : ''}" data-action="select-camera" data-id="${camera.id}">
              <span class="monitor-title"><span class="led" style="background:${colorToCss(camera.color)}"></span>${escapeHtml(camera.label)}</span>
              <canvas data-monitor-canvas="${camera.id}"></canvas>
              <span class="monitor-meta mono">${escapeHtml(camera.orientation === 'portrait' ? '9:16' : '16:9')} · ${escapeHtml(camera.outputSlot || 'planning')}</span>
            </button>
          `).join('')}
        </div>
      </section>

      <footer class="transport scene-transport">
        <div class="transport-zone"><button class="btn ghost" data-action="recenter">⊙ Recenter Main</button><button class="btn ghost" data-action="remove-camera" data-id="${escapeHtml(selectedProjectorId)}">Remove Selected</button></div>
        <div class="transport-zone" style="justify-content:center">
          <div class="stage-cell">
            <div class="stage-head"><span class="index">A</span><span class="name">Render Mode</span></div>
            <div class="segmented">
              ${['single', 'depth', 'test'].map((mode) => `<button class="${depthMode === mode ? 'active' : ''}" data-action="world-mode" data-mode="${mode}">${mode}</button>`).join('')}
            </div>
          </div>
          <button class="btn ghost" data-action="test-pattern">⊞ Toggle test pattern</button>
          <button class="btn" data-action="surface" data-surface="live">✓ Save & Return to Live</button>
        </div>
        <div class="transport-zone"><button class="btn primary" data-action="focus-output">Focus Output</button></div>
      </footer>
    </div>
  `;
}

function cameraControlsMarkup(projector) {
  return `
    <div class="panel-section" style="padding-left:0;padding-right:0">
      <div class="section-title"><span>Identity</span></div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px">
        <input type="text" value="${escapeHtml(projector.label)}" data-camera-text="${projector.id}" data-key="label" />
        <button class="btn sm ghost" data-action="camera-orientation" data-id="${projector.id}">${projector.orientation === 'portrait' ? '9:16' : '16:9'}</button>
      </div>
    </div>
    <div class="panel-section" style="padding-left:0;padding-right:0">
      <div class="section-title"><span>Aim</span></div>
      <div class="knobs">
        ${knobMarkup('Yaw', `${(projector.yaw * 180 / Math.PI).toFixed(1)}°`, projector.yaw * 180 / Math.PI)}
        ${knobMarkup('Pitch', `${(projector.pitch * 180 / Math.PI).toFixed(1)}°`, projector.pitch * 180 / Math.PI * 2)}
        ${knobMarkup('FOV', `${Math.round(projector.fov)}°`, (projector.fov - 70) * 5)}
      </div>
      ${sliderMarkup('Yaw', 'yaw', projector.yaw, -Math.PI, Math.PI, 0.005, `${(projector.yaw * 180 / Math.PI).toFixed(1)}°`, 'camera', projector.id)}
      ${sliderMarkup('Pitch', 'pitch', projector.pitch, -Math.PI / 2, Math.PI / 2, 0.005, `${(projector.pitch * 180 / Math.PI).toFixed(1)}°`, 'camera', projector.id)}
      ${sliderMarkup('FOV', 'fov', projector.fov, 20, 130, 1, `${Math.round(projector.fov)}°`, 'camera', projector.id)}
    </div>
    <div class="panel-section" style="padding-left:0;padding-right:0">
      <div class="section-title"><span>Offset</span></div>
      ${sliderMarkup('Delta X', 'offX', projector.offX, -300, 300, 1, `${Math.round(projector.offX)}`, 'camera', projector.id)}
      ${sliderMarkup('Delta Y', 'offY', projector.offY, -300, 300, 1, `${Math.round(projector.offY)}`, 'camera', projector.id)}
      ${sliderMarkup('Delta Z', 'offZ', projector.offZ, -300, 300, 1, `${Math.round(projector.offZ)}`, 'camera', projector.id)}
    </div>
    <div class="panel-section" style="padding-left:0;padding-right:0">
      <div class="section-title"><span>Output</span></div>
      <div class="slider-row" style="grid-template-columns:1fr auto"><span class="label">Live to output</span><button class="toggle ${projector.live ? 'on' : ''}" data-action="camera-toggle" data-id="${projector.id}"></button></div>
      <div style="margin-top:10px"><span class="label uc dim" style="display:block;margin-bottom:6px">Signal</span><input type="text" value="${escapeHtml(projector.signal)}" data-camera-text="${projector.id}" data-key="signal" /></div>
    </div>
  `;
}

function mappingItemRow(item) {
  const selected = (session.mappingRoom?.selectedObjectId || selectedMappingObjectId) === item.id;
  return `
    <button class="projector-row mapping-row ${selected ? 'active' : ''}" data-action="select-mapping" data-id="${escapeHtml(item.id)}">
      <span class="led" style="background:${colorToCss(item.color)};box-shadow:0 0 8px ${colorToCss(item.color, .7)}"></span>
      <span><strong>${escapeHtml(item.label)}</strong><span class="mono dim" style="display:block;font-size:9px;margin-top:2px">${escapeHtml(item.role)} &middot; ${escapeHtml(item.shape)} &middot; ${escapeHtml(item.materialMode)}</span></span>
      <span class="led ${item.visible === false ? '' : 'green'}"></span>
    </button>
  `;
}

function mappingRoomMarkup() {
  const mappingRoom = session.mappingRoom || {};
  const selected = selectedMappingItem();
  const surfaces = mappingRoom.surfaces || [];
  const objects = mappingRoom.objects || [];
  const masks = mappingRoom.masks || [];
  const photos = mappingRoom.referencePhotos || [];
  const worldLabel = session.imageDataUrl ? (session.recipe?.title || 'Generated World') : 'Fallback Texture';
  return `
    <div class="main mapping-room-main">
      <aside class="left-rail">
        <div class="panel-header"><h3>Mapping Room</h3><span class="badge">${escapeHtml(mappingRoom.captureMode || 'manual-photo')}</span></div>
        <div class="panel-section scroll" style="flex:1">
          <div class="section-title"><span>Room Surfaces</span><span>${surfaces.length}</span></div>
          ${surfaces.map(mappingItemRow).join('')}
          <div class="section-title" style="margin-top:14px"><span>Projection Objects</span><span>${objects.length}</span></div>
          ${objects.map(mappingItemRow).join('') || '<div class="well dim mono">No added objects yet.</div>'}
          <div class="section-title" style="margin-top:14px"><span>Masks</span><span>${masks.length}</span></div>
          ${masks.map(mappingItemRow).join('') || '<div class="well dim mono">No masks yet.</div>'}
        </div>
        <div class="panel-section">
          <div class="section-title"><span>Add Geometry</span><span>Planning</span></div>
          <div class="mapping-add-grid">
            <button class="btn sm" data-action="add-mapping-item" data-shape="plane">Plane</button>
            <button class="btn sm" data-action="add-mapping-item" data-shape="box">Box</button>
            <button class="btn sm" data-action="add-mapping-item" data-shape="cylinder">Cylinder</button>
            <button class="btn sm ghost" data-action="add-mapping-item" data-shape="frame">Door Frame</button>
            <button class="btn sm ghost" data-action="add-mapping-item" data-shape="mask">Mask Plane</button>
            <button class="btn sm ghost" data-action="mapping-add-photo">Photo</button>
          </div>
        </div>
      </aside>

      <section class="viewport-cell">
        <canvas class="viewport-canvas" data-mapping-room></canvas>
        <div class="viewport-overlay" style="top:0;left:0"><div class="viewport-corner mono"><span style="color:var(--signal-cyan)">MAPPING ROOM</span><div class="dim" style="font-size:9px;margin-top:2px">separate Three.js canvas &middot; live output unchanged</div></div></div>
        <div class="viewport-overlay" style="top:0;right:0;text-align:right"><div class="viewport-corner mono">TEXTURE <span>${escapeHtml(worldLabel).toUpperCase()}</span><div class="dim" style="font-size:9px;margin-top:2px">${mappingRoom.showProjectors === false ? 'PROJECTOR GUIDES HIDDEN' : 'PROJECTOR GUIDES VISIBLE'}</div></div></div>
        <div class="viewport-overlay" style="bottom:12px;right:12px;pointer-events:auto">
          <button class="btn sm ${mappingRoom.showProjectors === false ? '' : 'primary'}" data-action="mapping-show-projectors">${mappingRoom.showProjectors === false ? 'Show Projectors' : 'Hide Projectors'}</button>
          <button class="btn sm" data-action="mapping-reset-view">Reset View</button>
        </div>
      </section>

      <aside class="right-bay">
        <div class="panel-header"><h3>Surface Controls</h3><span class="badge">${escapeHtml(selected?.label || 'Nothing selected')}</span></div>
        <div class="panel-section scroll" style="flex:1">
          ${selected ? mappingControlsMarkup(selected) : '<div class="well dim mono">Select a wall, object, or mask.</div>'}
        </div>
      </aside>

      <section class="bottom-pipeline">
        <div class="panel-header"><h3>Reference Photos</h3><span class="badge">${photos.length} PLANNING LAYERS</span></div>
        <div class="mapping-photo-strip">
          ${photos.map((photo) => `
            <div class="mapping-photo-card ${photo.visible === false ? 'muted' : ''}">
              <div class="history-line"><strong class="mono">${escapeHtml(photo.label)}</strong><span class="mono dim">${Math.round(Number(photo.opacity ?? 0.42) * 100)}%</span></div>
              <div class="history-line" style="margin-top:8px">
                <button class="btn sm ghost" data-action="mapping-photo-visible" data-id="${escapeHtml(photo.id)}">${photo.visible === false ? 'Show' : 'Hide'}</button>
                <button class="btn sm ghost" data-action="remove-mapping-photo" data-id="${escapeHtml(photo.id)}">Remove</button>
              </div>
            </div>
          `).join('') || '<div class="well dim mono">Add room photos as manual planning references.</div>'}
        </div>
      </section>

      <footer class="transport scene-transport">
        <div class="transport-zone"><button class="btn ghost" data-action="surface" data-surface="scene">Scene Builder</button></div>
        <div class="transport-zone" style="justify-content:center">
          <div class="stage-cell">
            <div class="stage-head"><span class="index">M</span><span class="name">Mapping workspace only</span></div>
          </div>
          <button class="btn ghost" data-action="load-preset">Load Preset</button>
          <button class="btn" data-action="save-preset">Save Preset</button>
          <button class="btn primary" data-action="focus-output">Focus Output</button>
        </div>
        <div class="transport-zone"><span class="mono dim" style="font-size:10px">NDI and MadMapper routing stay unchanged.</span></div>
      </footer>
    </div>
  `;
}

function mappingControlsMarkup(item) {
  const materialOptions = ['world', 'test', 'mask', 'transparent', 'solid'];
  const removable = item.role !== 'surface';
  return `
    <div class="panel-section" style="padding-left:0;padding-right:0">
      <div class="section-title"><span>Identity</span><span>${escapeHtml(item.role).toUpperCase()}</span></div>
      <input type="text" value="${escapeHtml(item.label)}" data-mapping-text="${escapeHtml(item.id)}" data-key="label" />
      <div class="mapping-inline">
        <button class="toggle ${item.visible === false ? '' : 'on'}" data-action="mapping-visible" data-id="${escapeHtml(item.id)}" title="Visible"></button>
        <select data-action="mapping-material" data-id="${escapeHtml(item.id)}">
          ${materialOptions.map((mode) => `<option value="${mode}" ${item.materialMode === mode ? 'selected' : ''}>${mode}</option>`).join('')}
        </select>
        <button class="btn sm ghost" data-action="remove-mapping-item" data-id="${escapeHtml(item.id)}" ${removable ? '' : 'disabled'}>${removable ? 'Remove' : 'Keep'}</button>
      </div>
    </div>
    <div class="panel-section" style="padding-left:0;padding-right:0">
      <div class="section-title"><span>Position</span></div>
      ${sliderMarkup('X', 'x', item.x, -700, 700, 1, `${Math.round(item.x)}`, 'mapping', item.id)}
      ${sliderMarkup('Y', 'y', item.y, -100, 500, 1, `${Math.round(item.y)}`, 'mapping', item.id)}
      ${sliderMarkup('Z', 'z', item.z, -700, 700, 1, `${Math.round(item.z)}`, 'mapping', item.id)}
    </div>
    <div class="panel-section" style="padding-left:0;padding-right:0">
      <div class="section-title"><span>Rotation</span></div>
      ${sliderMarkup('Rot X', 'rotX', item.rotX, -Math.PI, Math.PI, 0.005, `${(item.rotX * 180 / Math.PI).toFixed(1)} deg`, 'mapping', item.id)}
      ${sliderMarkup('Rot Y', 'rotY', item.rotY, -Math.PI, Math.PI, 0.005, `${(item.rotY * 180 / Math.PI).toFixed(1)} deg`, 'mapping', item.id)}
      ${sliderMarkup('Rot Z', 'rotZ', item.rotZ, -Math.PI, Math.PI, 0.005, `${(item.rotZ * 180 / Math.PI).toFixed(1)} deg`, 'mapping', item.id)}
    </div>
    <div class="panel-section" style="padding-left:0;padding-right:0">
      <div class="section-title"><span>Shape</span><span>${escapeHtml(item.shape).toUpperCase()}</span></div>
      ${sliderMarkup('Width', 'width', item.width, 2, 900, 1, `${Math.round(item.width)}`, 'mapping', item.id)}
      ${sliderMarkup('Height', 'height', item.height, 2, 500, 1, `${Math.round(item.height)}`, 'mapping', item.id)}
      ${sliderMarkup('Depth', 'depth', item.depth, 1, 500, 1, `${Math.round(item.depth)}`, 'mapping', item.id)}
      ${item.shape === 'cylinder' ? sliderMarkup('Radius', 'radius', item.radius, 1, 280, 1, `${Math.round(item.radius)}`, 'mapping', item.id) : ''}
      ${sliderMarkup('Opacity', 'opacity', item.opacity, 0, 1, 0.01, `${Math.round(item.opacity * 100)}%`, 'mapping', item.id)}
      ${sliderMarkup('Feather', 'feather', item.feather, 0, 1, 0.01, `${Math.round(item.feather * 100)}%`, 'mapping', item.id)}
    </div>
  `;
}

function knobMarkup(label, value, rot) {
  const pos = Math.max(0, Math.min(270, 135 + rot));
  return `<div class="knob-row"><div class="knob" style="--knob-pos:${pos}deg"></div><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function sliderMarkup(label, key, value, min, max, step, display, kind, id = '') {
  return `<div class="slider-row"><span class="label">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-slider-kind="${kind}" data-key="${key}" data-id="${id}" /><span class="value">${display}</span></div>`;
}

function updateSliderDisplay(input) {
  const valueNode = input.parentElement?.querySelector('.value');
  if (!valueNode) return;
  const key = input.dataset.key;
  const value = Number(input.value);
  if (key === 'yaw' || key === 'pitch') valueNode.textContent = `${(value * 180 / Math.PI).toFixed(1)}°`;
  else if (key === 'rotX' || key === 'rotY' || key === 'rotZ') valueNode.textContent = `${(value * 180 / Math.PI).toFixed(1)} deg`;
  else if (key === 'fov') valueNode.textContent = `${Math.round(value)}°`;
  else if (['intensity', 'particles', 'opacity', 'feather'].includes(key)) valueNode.textContent = `${Math.round(value * 100)}%`;
  else if (key === 'fog' || key === 'drift') valueNode.textContent = value.toFixed(2);
  else valueNode.textContent = `${Math.round(value)}`;
}

function hydrateCanvases() {
  const mappingCanvas = document.querySelector('[data-mapping-room]');
  if (mappingCanvas) {
    const renderer = new MappingRoomRenderer(mappingCanvas, {
      host: mappingCanvas.parentElement,
      onMappingRoomChange: (patch) => api.updateMappingRoom(patch),
      onObjectChange: (id, patch) => api.updateMappingRoomItem(id, patch),
      onSelectObject: (id) => api.updateMappingRoom({ selectedObjectId: id })
    });
    renderer.updateConfig({
      mappingRoom: session.mappingRoom,
      projectors: session.sceneBuilder?.cameras || session.projectors
    });
    renderer.setImageDataUrl(session.imageDataUrl, session.recipe?.palette, session.history?.length || 1);
    renderers.push(renderer);
    return;
  }

  const mainCanvas = document.querySelector('[data-scene-main]');
  if (mainCanvas) {
    if (surface === 'scene') {
      const renderer = new SphereWorldSceneBuilder(mainCanvas, document.querySelector('[data-monitor-root]') || surfaceRoot, {
        host: mainCanvas.parentElement,
        onCameraChange: (id, patch) => api.updateSceneCamera(id, patch),
        onSelectCamera: (id) => {
          if (!id) return;
          selectedProjectorId = id;
          api.updateSceneBuilder({ selectedCameraId: id });
        },
        onMainViewChange: (mainView) => api.updateSceneBuilder({ mainView })
      });
      renderer.updateConfig({
        cameras: session.sceneBuilder?.cameras,
        sceneBuilder: session.sceneBuilder,
        selectedId: selectedProjectorId
      });
      if (session.sceneBuilder?.depthMode === 'test') renderer.setTestPattern(session.sceneSettings?.testPattern || 'grid');
      else renderer.setImageDataUrl(session.imageDataUrl, session.recipe?.palette, session.history?.length || 1);
      renderers.push(renderer);
    } else {
      const renderer = new SphereWorldRenderer(mainCanvas, {
        host: mainCanvas.parentElement,
        mode: 'main',
        showGizmos: false
      });
      renderer.updateConfig({
        projectors: session.projectors,
        sceneSettings: { ...session.sceneSettings, overview: false },
        layoutMode: session.layoutMode,
        selectedId: selectedProjectorId,
        onProjectorChange: (id, patch) => api.updateProjector(id, patch)
      });
      if (session.sceneSettings?.outputTestMode || session.sceneSettings?.worldMode === 'test') renderer.setTestPattern(session.sceneSettings?.testPattern || 'grid');
      else renderer.setImageDataUrl(session.imageDataUrl, session.recipe?.palette, session.history?.length || 1);
      renderers.push(renderer);
    }
  }

  if (surface === 'scene') return;

  // Live Console keeps projector cards lightweight. Scene Builder owns the per-camera monitor WebGL renderers.
}

async function doGenerate() {
  if (generationInFlight) return;
  const prompt = document.querySelector('#prompt-input')?.value || promptValue;
  promptValue = prompt.trim() || promptValue;
  missionStart ||= Date.now();
  audio.start('mechanical');
  generationInFlight = true;
  render(true);
  await api.generateWorld(promptValue);
}

function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Microphone transcription is not available in this runtime. Type the prompt manually.');
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;
  api.setState('LISTENING');
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ').trim();
    if (transcript) {
      promptValue = transcript;
      const input = document.querySelector('#prompt-input');
      if (input) input.value = transcript;
    }
  };
  recognition.onend = () => { if (promptValue.trim()) doGenerate(); };
  recognition.onerror = () => alert('Transcription failed. Type the prompt manually.');
  recognition.start();
}

function savePreset() {
  const preset = {
    version: 2,
    depth: session.sceneBuilder?.depthMode === 'depth',
    depthMode: session.sceneBuilder?.depthMode || 'single',
    overview: !!session.sceneBuilder?.mainView?.overview,
    layoutMode: session.layoutMode,
    sceneSettings: session.sceneSettings,
    main: session.sceneBuilder?.mainView || { fov: session.sceneSettings?.mainFov || 75, yaw: 0, pitch: 0, pos: [0, 0, 0] },
    cameras: session.sceneBuilder?.cameras || session.projectors,
    outputMappings: session.outputMappings || {},
    mappingRoom: session.mappingRoom || {}
  };
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = document.querySelector('#preset-name')?.value || `take-me-there-room-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function loadPreset() {
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const preset = JSON.parse(await file.text());
        await api.applyPreset(preset);
      } catch (error) {
        alert(`Could not load preset: ${error.message}`);
      } finally {
        fileInput.value = '';
      }
    });
  }
  fileInput.click();
}

function addMappingReferencePhoto() {
  if (!mappingPhotoInput) {
    mappingPhotoInput = document.createElement('input');
    mappingPhotoInput.type = 'file';
    mappingPhotoInput.accept = 'image/*';
    mappingPhotoInput.addEventListener('change', () => {
      const file = mappingPhotoInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        api.addMappingRoomReferencePhoto({
          label: file.name,
          dataUrl: String(reader.result || ''),
          opacity: 0.42,
          visible: true
        });
      };
      reader.onerror = () => alert('Could not load the reference photo.');
      reader.readAsDataURL(file);
      mappingPhotoInput.value = '';
    });
  }
  mappingPhotoInput.click();
}

surfaceRoot.addEventListener('input', (event) => {
  const target = event.target;
  if (target.id === 'prompt-input') {
    promptValue = target.value;
    return;
  }
  if (target.dataset.sliderKind === 'setting') {
    updateSliderDisplay(target);
    api.updateSceneSettings({ [target.dataset.key]: Number(target.value) });
  } else if (target.dataset.sliderKind === 'projector') {
    updateSliderDisplay(target);
    api.updateProjector(target.dataset.id, { [target.dataset.key]: Number(target.value) });
  } else if (target.dataset.sliderKind === 'camera') {
    updateSliderDisplay(target);
    api.updateSceneCamera(target.dataset.id, { [target.dataset.key]: Number(target.value) });
  } else if (target.dataset.sliderKind === 'mapping') {
    updateSliderDisplay(target);
    api.updateMappingRoomItem(target.dataset.id, { [target.dataset.key]: Number(target.value) });
  } else if (target.dataset.projectorText) {
    api.updateProjector(target.dataset.projectorText, { [target.dataset.key]: target.value });
  } else if (target.dataset.cameraText) {
    api.updateSceneCamera(target.dataset.cameraText, { [target.dataset.key]: target.value });
  } else if (target.dataset.mappingText) {
    api.updateMappingRoomItem(target.dataset.mappingText, { [target.dataset.key]: target.value });
  } else if (target.dataset.action === 'test-select') {
    api.updateSceneSettings({ testPattern: target.value });
  } else if (target.dataset.action === 'output-map') {
    api.setOutputMapping(target.dataset.slot, target.value);
  }
});

surfaceRoot.addEventListener('change', (event) => {
  const target = event.target;
  if (target.dataset.action === 'output-map') {
    api.setOutputMapping(target.dataset.slot, target.value);
  } else if (target.dataset.action === 'test-select') {
    api.updateSceneSettings({ testPattern: target.value });
  } else if (target.dataset.action === 'mapping-material') {
    api.updateMappingRoomItem(target.dataset.id, { materialMode: target.value });
  }
});

surfaceRoot.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action], [data-projector-card]');
  if (!button) return;
  if (button.disabled || button.getAttribute('aria-disabled') === 'true') return;
  const action = button.dataset.action;
  if (!action && button.dataset.projectorCard) {
    selectedProjectorId = button.dataset.projectorCard;
    api.updateSceneSettings({ selectedProjectorId });
    render(true);
    return;
  }
  if (action === 'surface') setSurface(button.dataset.surface);
  else if (action === 'layout') await api.setLayout(button.dataset.layout);
  else if (action === 'start') { missionStart = Date.now(); await api.setState('LISTENING'); }
  else if (action === 'listen') startSpeechRecognition();
  else if (action === 'generate') doGenerate();
  else if (action === 'arrival') await api.setState('ARRIVAL');
  else if (action === 'end') { await api.setState('EXIT'); setTimeout(() => api.setState('IDLE'), 1800); }
  else if (action === 'fallback') { missionStart ||= Date.now(); await api.fallbackWorld(promptValue); }
  else if (action === 'load-world') { missionStart ||= Date.now(); await api.loadGeneratedWorld(button.dataset.file); }
  else if (action === 'load-history') { missionStart ||= Date.now(); await api.loadSessionHistoryEntry(button.dataset.historyIndex); }
  else if (action === 'blackout') { audio.mute(); await api.setState('BLACKOUT'); }
  else if (action === 'reset') {
    if (!resetArmed) {
      resetArmed = true;
      render(true);
      setTimeout(() => { resetArmed = false; render(true); }, 3000);
    } else {
      resetArmed = false;
      missionStart = null;
      audio.mute();
      await api.setState('RESET');
    }
  } else if (action === 'overview') {
    const overview = surface === 'scene' ? !session.sceneBuilder?.mainView?.overview : !session.sceneSettings?.overview;
    if (surface === 'scene') await api.updateSceneBuilder({ mainView: { ...(session.sceneBuilder?.mainView || {}), overview } });
    else await api.updateSceneSettings({ overview });
  } else if (action === 'projector-toggle') {
    const projector = session.projectors.find((item) => item.id === button.dataset.id);
    if (projector) await api.updateProjector(projector.id, { live: !projector.live });
  } else if (action === 'camera-toggle') {
    const camera = session.sceneBuilder?.cameras?.find((item) => item.id === button.dataset.id);
    if (camera) await api.updateSceneCamera(camera.id, { live: !camera.live });
  } else if (action === 'select-projector') {
    selectedProjectorId = button.dataset.id;
    await api.updateSceneSettings({ selectedProjectorId });
  } else if (action === 'select-camera') {
    selectedProjectorId = button.dataset.id;
    await api.updateSceneBuilder({ selectedCameraId: selectedProjectorId });
  } else if (action === 'select-mapping') {
    selectedMappingObjectId = button.dataset.id;
    await api.updateMappingRoom({ selectedObjectId: selectedMappingObjectId });
  } else if (action === 'add-camera') {
    await api.addSceneCamera();
  } else if (action === 'add-mapping-item') {
    await api.addMappingRoomItem(button.dataset.shape);
  } else if (action === 'remove-mapping-item') {
    await api.removeMappingRoomItem(button.dataset.id);
  } else if (action === 'mapping-visible') {
    const item = mappingItems().find((entry) => entry.id === button.dataset.id);
    if (item) await api.updateMappingRoomItem(item.id, { visible: item.visible === false });
  } else if (action === 'mapping-show-projectors') {
    await api.updateMappingRoom({ showProjectors: session.mappingRoom?.showProjectors === false });
  } else if (action === 'mapping-reset-view') {
    await api.updateMappingRoom({ mainView: { pos: [0, 260, 620], target: [0, 110, -80], fov: 55 } });
  } else if (action === 'mapping-add-photo') {
    addMappingReferencePhoto();
  } else if (action === 'mapping-photo-visible') {
    const photo = session.mappingRoom?.referencePhotos?.find((item) => item.id === button.dataset.id);
    if (photo) await api.updateMappingRoomReferencePhoto(photo.id, { visible: photo.visible === false });
  } else if (action === 'remove-mapping-photo') {
    await api.removeMappingRoomReferencePhoto(button.dataset.id);
  } else if (action === 'remove-camera') {
    await api.removeSceneCamera(button.dataset.id);
  } else if (action === 'camera-orientation') {
    const camera = session.sceneBuilder?.cameras?.find((item) => item.id === button.dataset.id);
    if (camera) await api.updateSceneCamera(camera.id, { orientation: camera.orientation === 'portrait' ? 'landscape' : 'portrait' });
  } else if (action === 'world-mode') {
    if (surface === 'scene') await api.updateSceneBuilder({ depthMode: button.dataset.mode });
    else await api.updateSceneSettings({ worldMode: button.dataset.mode, outputTestMode: button.dataset.mode === 'test' });
  } else if (action === 'test-pattern') {
    if (surface === 'scene') await api.updateSceneBuilder({ depthMode: session.sceneBuilder?.depthMode === 'test' ? 'single' : 'test' });
    else await api.updateSceneSettings({ outputTestMode: !session.sceneSettings?.outputTestMode, worldMode: session.sceneSettings?.outputTestMode ? 'single' : 'test' });
  } else if (action === 'save-preset') savePreset();
  else if (action === 'load-preset') loadPreset();
  else if (action === 'reset-projectors') await api.setProjectors(DEFAULT_PROJECTORS);
  else if (action === 'recenter') {
    if (surface === 'scene') await api.updateSceneBuilder({ mainView: { yaw: 0, pitch: 0, fov: 75, pos: [0, 0, 0], overview: !!session.sceneBuilder?.mainView?.overview } });
    else for (const projector of session.projectors) await api.updateProjector(projector.id, { offX: 0, offY: 0, offZ: 0 });
  } else if (action === 'focus-output') api.focusOutput();
});

topbar.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action="surface"]');
  if (!button) return;
  setSurface(button.dataset.surface);
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    doGenerate();
  }
});

api.onSessionUpdate((nextSession) => {
  const previousState = session?.state?.key;
  session = nextSession;
  surface = nextSession.sceneSettings?.surface || surface;
  selectedProjectorId = surface === 'scene' ? (nextSession.sceneBuilder?.selectedCameraId || selectedProjectorId) : (nextSession.sceneSettings?.selectedProjectorId || selectedProjectorId);
  selectedMappingObjectId = nextSession.mappingRoom?.selectedObjectId || selectedMappingObjectId;
  if (nextSession.transcript) promptValue = nextSession.transcript;
  if (previousState !== nextSession.state?.key) {
    if (['PORTAL_OPENING', 'ARRIVAL', 'WORLD_ACTIVE'].includes(nextSession.state?.key)) audio.start(nextSession.recipe?.sound_style || 'dream');
    if (['EXIT', 'RESET', 'BLACKOUT', 'IDLE'].includes(nextSession.state?.key)) audio.mute();
  }
  if (!['UNDERSTANDING', 'GENERATING'].includes(nextSession.state?.key)) generationInFlight = false;
  render();
});

api.getSession().then((initialSession) => {
  session = initialSession;
  surface = initialSession.sceneSettings?.surface || 'live';
  selectedProjectorId = surface === 'scene' ? (initialSession.sceneBuilder?.selectedCameraId || 'F') : (initialSession.sceneSettings?.selectedProjectorId || 'F');
  selectedMappingObjectId = initialSession.mappingRoom?.selectedObjectId || 'wall-front';
  promptValue = initialSession.transcript || promptValue;
  render();
});
