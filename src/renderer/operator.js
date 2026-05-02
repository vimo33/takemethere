import { AudioEngine } from './audio-engine.js';
import * as THREE from '../../node_modules/three/build/three.module.js';

const api = window.takeMeThere;
const audio = new AudioEngine();

const root = document.querySelector('#operator-app');
root.innerHTML = `
  <main class="operator-shell">
    <section class="panel control-panel">
      <div class="brand-row"><div><h1>Take Me There</h1><h2>Operator dashboard</h2></div><div class="state-pill" id="state-pill">Idle</div></div>
      <textarea class="prompt-box" id="prompt" placeholder="Where do you want to go?">Take me to a forest where the trees are made of glass.</textarea>
      <div class="button-grid">
        <button class="primary" id="start">Start session</button><button id="listen">Use microphone</button><button id="generate">Generate world</button><button id="regenerate">Regenerate image</button><button id="fallback">Skip to fallback</button><button id="arrival">Trigger arrival</button><button id="end">End session</button><button class="danger" id="blackout">Blackout</button>
      </div>
      <div class="button-row"><button class="ghost" id="reset">Reset</button><button class="ghost" id="focus-output">Focus output</button><button class="ghost" id="fullscreen-output">Output fullscreen</button><button class="ghost" id="reload-output">Reload output</button></div>
      <label><h3>Output layout</h3><select id="layout"><option value="three-wall">3 walls: left / front / right</option><option value="ceiling">4 views: left / front / right / ceiling</option></select></label>
      <label><h3>Visual mode</h3><select id="visual-mode"><option value="auto">Auto: flat then depth</option><option value="flat">Flat baseline</option><option value="depth">Depth compare</option></select></label>
    </section>
    <section class="panel status-panel">
      <div class="status-grid">
        <div class="metric"><div class="label">Current state</div><div class="value" id="state-value">Idle</div></div><div class="metric"><div class="label">Generated title</div><div class="value" id="title-value">Unknown Dream</div></div><div class="metric"><div class="label">Prompt provider</div><div class="value" id="prompt-provider">local</div></div><div class="metric"><div class="label">Image provider</div><div class="value" id="image-provider">local</div></div><div class="metric"><div class="label">Depth provider</div><div class="value" id="depth-provider">none</div></div><div class="metric"><div class="label">Depth status</div><div class="value" id="depth-status">idle</div></div><div class="metric"><div class="label">Latency</div><div class="value" id="latency-value">0 ms</div></div><div class="metric"><div class="label">Cost estimate</div><div class="value" id="cost-value">$0.00</div></div>
      </div>
      <div id="error-slot"></div>
      <article class="recipe-card"><h3>Last transcript</h3><p id="transcript-value">No prompt yet.</p></article>
      <article class="recipe-card scene-card">
        <div class="scene-card-head"><h3>Scene viewer</h3><div class="scene-readout" id="scene-readout">FOV 78 / L 69 / F 0 / R -69</div></div>
        <div class="scene-viewer-layout">
          <div class="scene-viewer" id="scene-viewer"></div>
          <div class="scene-controls">
            <label><span>Left yaw</span><input id="left-yaw" type="range" min="-170" max="170" step="1" value="69"><strong id="left-yaw-value">69</strong></label>
            <label><span>Front yaw</span><input id="front-yaw" type="range" min="-120" max="120" step="1" value="0"><strong id="front-yaw-value">0</strong></label>
            <label><span>Right yaw</span><input id="right-yaw" type="range" min="-170" max="170" step="1" value="-69"><strong id="right-yaw-value">-69</strong></label>
            <label><span>Projector FOV</span><input id="projector-fov" type="range" min="35" max="115" step="1" value="78"><strong id="projector-fov-value">78</strong></label>
            <button class="ghost" id="reset-projectors">Reset projector views</button>
          </div>
        </div>
      </article>
      <article class="recipe-card"><h3>World recipe</h3><p id="visual-prompt">No world generated yet.</p><div class="palette" id="palette"></div></article>
      <article class="recipe-card"><h3>Lighting / audio cue</h3><p id="cue-value">portal_breathing / idle_hum</p></article>
    </section>
  </main>
`;

const els = {
  statePill: document.querySelector('#state-pill'), prompt: document.querySelector('#prompt'), start: document.querySelector('#start'), listen: document.querySelector('#listen'), generate: document.querySelector('#generate'), regenerate: document.querySelector('#regenerate'), fallback: document.querySelector('#fallback'), arrival: document.querySelector('#arrival'), end: document.querySelector('#end'), blackout: document.querySelector('#blackout'), reset: document.querySelector('#reset'), layout: document.querySelector('#layout'), visualMode: document.querySelector('#visual-mode'), focusOutput: document.querySelector('#focus-output'), fullscreenOutput: document.querySelector('#fullscreen-output'), reloadOutput: document.querySelector('#reload-output'), stateValue: document.querySelector('#state-value'), titleValue: document.querySelector('#title-value'), promptProvider: document.querySelector('#prompt-provider'), imageProvider: document.querySelector('#image-provider'), depthProvider: document.querySelector('#depth-provider'), depthStatus: document.querySelector('#depth-status'), latencyValue: document.querySelector('#latency-value'), costValue: document.querySelector('#cost-value'), transcriptValue: document.querySelector('#transcript-value'), visualPrompt: document.querySelector('#visual-prompt'), palette: document.querySelector('#palette'), cueValue: document.querySelector('#cue-value'), errorSlot: document.querySelector('#error-slot'), sceneViewer: document.querySelector('#scene-viewer'), sceneReadout: document.querySelector('#scene-readout'), leftYaw: document.querySelector('#left-yaw'), frontYaw: document.querySelector('#front-yaw'), rightYaw: document.querySelector('#right-yaw'), projectorFov: document.querySelector('#projector-fov'), leftYawValue: document.querySelector('#left-yaw-value'), frontYawValue: document.querySelector('#front-yaw-value'), rightYawValue: document.querySelector('#right-yaw-value'), projectorFovValue: document.querySelector('#projector-fov-value'), resetProjectors: document.querySelector('#reset-projectors')
};

let sceneViewer;
let lastProjectorConfig = { leftYaw: 69, frontYaw: 0, rightYaw: -69, fov: 78, ceilingPitch: 64, ceilingFov: 82 };
let projectorUpdateTimer;

els.start.addEventListener('click', () => api.setState('LISTENING'));
els.generate.addEventListener('click', () => { audio.start('mechanical'); api.generateWorld(els.prompt.value); });
els.regenerate.addEventListener('click', () => api.generateWorld(els.prompt.value));
els.fallback.addEventListener('click', () => api.fallbackWorld(els.prompt.value));
els.arrival.addEventListener('click', () => api.setState('ARRIVAL'));
els.end.addEventListener('click', () => api.setState('EXIT'));
els.blackout.addEventListener('click', () => { audio.mute(); api.setState('BLACKOUT'); });
els.reset.addEventListener('click', () => { audio.mute(); api.setState('RESET'); });
els.layout.addEventListener('change', () => api.setLayout(els.layout.value));
els.visualMode.addEventListener('change', () => api.setVisualMode(els.visualMode.value));
for (const input of [els.leftYaw, els.frontYaw, els.rightYaw, els.projectorFov]) {
  input.addEventListener('input', () => {
    const config = readProjectorControls();
    applyProjectorControls(config);
    clearTimeout(projectorUpdateTimer);
    projectorUpdateTimer = setTimeout(() => api.setProjectorConfig(config), 80);
  });
}
els.resetProjectors.addEventListener('click', () => {
  const config = { leftYaw: 69, frontYaw: 0, rightYaw: -69, fov: 78, ceilingPitch: 64, ceilingFov: 82 };
  applyProjectorControls(config);
  api.setProjectorConfig(config);
});
els.focusOutput.addEventListener('click', () => api.focusOutput());
els.fullscreenOutput.addEventListener('click', () => api.toggleOutputFullscreen());
els.reloadOutput.addEventListener('click', () => api.reloadOutput());
els.listen.addEventListener('click', startSpeechRecognition);

function renderSession(session) {
  const state = session.state || {};
  const recipe = session.recipe || {};
  els.statePill.textContent = state.label || state.key || 'Idle';
  els.stateValue.textContent = `${state.key || 'IDLE'} - ${state.projection || ''}`;
  els.titleValue.textContent = recipe.title || 'Unknown Dream';
  els.promptProvider.textContent = session.provider?.prompt || 'local';
  els.imageProvider.textContent = session.provider?.image || 'local';
  els.depthProvider.textContent = session.provider?.depth || 'none';
  els.depthStatus.textContent = `${session.depthStatus || 'idle'}${session.timings?.depthMs ? ` - ${session.timings.depthMs} ms` : ''}`;
  els.transcriptValue.textContent = session.transcript || 'No prompt yet.';
  els.visualPrompt.textContent = recipe.visual_prompt || 'No world generated yet.';
  els.cueValue.textContent = `${state.ledCue || '-'} / ${state.audioCue || '-'}`;
  els.layout.value = session.layoutMode || 'three-wall';
  els.visualMode.value = session.visualMode || 'auto';
  if (session.projectorConfig) applyProjectorControls(session.projectorConfig);
  sceneViewer?.setTexture(session.imageFileUrl || session.imageDataUrl || '');
  sceneViewer?.setProjectorConfig(session.projectorConfig || lastProjectorConfig);
  const promptMs = session.timings?.promptMs || 0;
  const imageMs = session.timings?.imageMs || 0;
  const depthMs = session.timings?.depthMs || 0;
  els.latencyValue.textContent = `${promptMs + imageMs + depthMs} ms`;
  els.costValue.textContent = `$${Number(session.costEstimateUsd || 0).toFixed(2)}`;
  els.palette.innerHTML = '';
  for (const color of recipe.palette || []) {
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = color;
    swatch.title = color;
    els.palette.appendChild(swatch);
  }
  const errors = [];
  if (session.error) errors.push(session.error);
  if (session.depthError) errors.push(`Depth: ${session.depthError}`);
  els.errorSlot.innerHTML = errors.map((error) => `<div class="error">${error}</div>`).join('');
  if (['PORTAL_OPENING', 'ARRIVAL', 'WORLD_ACTIVE'].includes(state.key)) audio.start(recipe.sound_style || 'dream');
  if (['EXIT', 'RESET', 'BLACKOUT', 'IDLE'].includes(state.key)) audio.mute();
}

function readProjectorControls() {
  return {
    leftYaw: Number(els.leftYaw.value),
    frontYaw: Number(els.frontYaw.value),
    rightYaw: Number(els.rightYaw.value),
    fov: Number(els.projectorFov.value),
    ceilingPitch: lastProjectorConfig.ceilingPitch || 64,
    ceilingFov: lastProjectorConfig.ceilingFov || 82
  };
}

function applyProjectorControls(config) {
  lastProjectorConfig = { ...lastProjectorConfig, ...config };
  els.leftYaw.value = String(Math.round(lastProjectorConfig.leftYaw));
  els.frontYaw.value = String(Math.round(lastProjectorConfig.frontYaw));
  els.rightYaw.value = String(Math.round(lastProjectorConfig.rightYaw));
  els.projectorFov.value = String(Math.round(lastProjectorConfig.fov));
  els.leftYawValue.textContent = String(Math.round(lastProjectorConfig.leftYaw));
  els.frontYawValue.textContent = String(Math.round(lastProjectorConfig.frontYaw));
  els.rightYawValue.textContent = String(Math.round(lastProjectorConfig.rightYaw));
  els.projectorFovValue.textContent = String(Math.round(lastProjectorConfig.fov));
  els.sceneReadout.textContent = `FOV ${Math.round(lastProjectorConfig.fov)} / L ${Math.round(lastProjectorConfig.leftYaw)} / F ${Math.round(lastProjectorConfig.frontYaw)} / R ${Math.round(lastProjectorConfig.rightYaw)}`;
  sceneViewer?.setProjectorConfig(lastProjectorConfig);
}

class SceneViewer {
  constructor(container) {
    this.container = container;
    this.config = { leftYaw: 69, frontYaw: 0, rightYaw: -69, fov: 78 };
    this.viewerYaw = 0;
    this.viewerPitch = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);
    this.camera.position.set(0, 0, 0.1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x020617, 1);
    this.container.appendChild(this.renderer.domElement);

    const sphere = new THREE.SphereGeometry(60, 96, 48);
    sphere.scale(-1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({ map: this.createPlannerTexture(), transparent: true, opacity: 0.92 });
    this.world = new THREE.Mesh(sphere, this.material);
    this.scene.add(this.world);

    this.rays = new THREE.Group();
    this.scene.add(this.rays);
    this.createProjectorRays();
    this.bindDrag();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  createPlannerTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#020617');
    gradient.addColorStop(0.48, '#0f766e');
    gradient.addColorStop(1, '#312e81');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    for (let i = 0; i < 120; i += 1) {
      ctx.fillRect((i * 173) % canvas.width, (i * 97) % canvas.height, 2 + (i % 4), 2 + (i % 4));
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  bindDrag() {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    this.container.addEventListener('pointerdown', (event) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      this.container.setPointerCapture(event.pointerId);
    });
    this.container.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      this.viewerYaw -= (event.clientX - lastX) * 0.005;
      this.viewerPitch = clamp(this.viewerPitch - (event.clientY - lastY) * 0.004, -1.1, 1.1);
      lastX = event.clientX;
      lastY = event.clientY;
    });
    this.container.addEventListener('pointerup', () => {
      dragging = false;
    });
  }

  setTexture(source) {
    if (!source || source === this.textureSource) return;
    this.textureSource = source;
    new THREE.TextureLoader().load(source, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      this.material.map = texture;
      this.material.needsUpdate = true;
    }, undefined, (error) => console.error('[takemethere] scene viewer texture failed', error));
  }

  setProjectorConfig(config) {
    this.config = { ...this.config, ...config };
    this.createProjectorRays();
  }

  createProjectorRays() {
    this.rays.clear();
    const specs = [
      ['left', this.config.leftYaw, '#38bdf8'],
      ['front', this.config.frontYaw, '#f8fafc'],
      ['right', this.config.rightYaw, '#f59e0b']
    ];
    for (const [name, yaw, color] of specs) this.addProjectorRay(name, yaw, color);
  }

  addProjectorRay(name, yawDeg, color) {
    const yaw = yawDeg * Math.PI / 180;
    const halfFov = (this.config.fov * Math.PI / 180) / 2;
    const center = directionFromYaw(yaw, 0).multiplyScalar(42);
    const left = directionFromYaw(yaw + halfFov, 0).multiplyScalar(36);
    const right = directionFromYaw(yaw - halfFov, 0).multiplyScalar(36);
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), center,
      new THREE.Vector3(0, 0, 0), left,
      new THREE.Vector3(0, 0, 0), right,
      left, center,
      center, right
    ]);
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.86 }));
    this.rays.add(lines);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 16, 8),
      new THREE.MeshBasicMaterial({ color })
    );
    marker.position.copy(center);
    marker.name = name;
    this.rays.add(marker);
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  animate() {
    const look = new THREE.Vector3(
      Math.sin(this.viewerYaw) * Math.cos(this.viewerPitch),
      Math.sin(this.viewerPitch),
      -Math.cos(this.viewerYaw) * Math.cos(this.viewerPitch)
    );
    this.camera.lookAt(look);
    this.rays.rotation.y = 0;
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }
}

function directionFromYaw(yaw, pitch) {
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

sceneViewer = new SceneViewer(els.sceneViewer);
api.onSessionUpdate(renderSession);
api.getSession().then(renderSession);

function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    els.errorSlot.innerHTML = '<div class="error">Microphone transcription is not available in this runtime. Type the prompt manually.</div>';
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;
  api.setState('LISTENING');
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ').trim();
    if (transcript) els.prompt.value = transcript;
  };
  recognition.onerror = () => { els.errorSlot.innerHTML = '<div class="error">Transcription failed. Type the prompt manually.</div>'; };
  recognition.onend = () => { if (els.prompt.value.trim()) api.generateWorld(els.prompt.value); };
  recognition.start();
}
