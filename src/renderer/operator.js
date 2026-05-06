import { AudioEngine } from './audio-engine.js';
import * as THREE from '../../node_modules/three/build/three.module.js';
import { OrbitControls } from '../../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from '../../node_modules/three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from '../../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from '../../node_modules/three/examples/jsm/loaders/OBJLoader.js';

const api = window.takeMeThere;
const audio = new AudioEngine();

const root = document.querySelector('#operator-app');
root.innerHTML = `
  <main class="cockpit-shell">
    <header class="cockpit-topbar">
      <div class="mission-mark"><span>Take Me There</span><strong>Mission Control</strong></div>
      <div class="top-readouts">
        <div class="top-readout"><span>Preset</span><strong id="top-preset">Studio 3 Wall</strong></div>
        <div class="top-readout"><span>Show state</span><strong id="top-state">IDLE</strong></div>
        <div class="top-readout"><span>Transport</span><strong id="top-transport">NDI</strong></div>
        <div class="top-readout"><span>MadMapper</span><strong id="top-madmapper">Offline</strong></div>
        <div class="top-readout"><span>Feeds</span><strong id="top-feeds">0 ready</strong></div>
      </div>
      <button class="danger emergency-button" id="top-blackout">Blackout</button>
    </header>

    <nav class="cockpit-tabs" aria-label="Mission tabs">
      <button class="cockpit-tab is-active" data-tab="operator">Operator</button>
      <button class="cockpit-tab" data-tab="world">World</button>
      <button class="cockpit-tab" data-tab="scene">Scene</button>
      <button class="cockpit-tab" data-tab="outputs">Outputs</button>
    </nav>

    <section class="cockpit-stage">
      <section class="cockpit-panel is-active" data-panel="operator">
        <div class="operator-command-grid">
          <article class="cockpit-card hero-command">
            <div class="brand-row"><div><h1>Operator</h1><h2>Live session controls</h2></div><div class="state-pill" id="state-pill">Idle</div></div>
            <div class="command-buttons">
              <button class="primary" id="start">Start session</button>
              <button id="generate">Generate world</button>
              <button id="arrival">Arrival</button>
              <button class="danger" id="blackout">Blackout</button>
              <button class="ghost" id="end">End session</button>
              <button class="ghost" id="reset">Reset</button>
            </div>
          </article>

          <article class="cockpit-card">
            <div class="scene-card-head"><h3>Session telemetry</h3><div class="scene-readout" id="cue-value">portal_breathing / idle_hum</div></div>
            <div class="status-grid compact-status">
              <div class="metric"><div class="label">Current state</div><div class="value" id="state-value">Idle</div></div>
              <div class="metric"><div class="label">Generated title</div><div class="value" id="title-value">Unknown Dream</div></div>
              <div class="metric"><div class="label">Latency</div><div class="value" id="latency-value">0 ms</div></div>
              <div class="metric"><div class="label">Cost estimate</div><div class="value" id="cost-value">$0.00</div></div>
            </div>
            <div id="error-slot"></div>
          </article>
        </div>

        <div class="operator-lower-grid">
          <article class="cockpit-card setup-card">
            <div class="scene-card-head"><h3>Setup mode</h3><div class="scene-readout" id="setup-status">NDI / world</div></div>
            <div class="setup-controls">
              <label><span>Transport</span><select id="setup-transport"><option value="ndi">NDI</option></select></label>
              <label><span>Test card</span><select id="test-pattern"><option value="world">World output</option><option value="black">Black</option><option value="white">White</option><option value="red">Red</option><option value="green">Green</option><option value="blue">Blue</option><option value="grid">Grid</option><option value="checkerboard">Checkerboard</option><option value="edge-frame">Edge frame</option><option value="crosshair">Center crosshair</option><option value="horizon">Horizon / seams</option><option value="labels">Wall labels</option></select></label>
              <label><span>Identify target</span><select id="identify-target"><option value="all">All feeds</option><option value="left">Left</option><option value="front">Front</option><option value="right">Right</option><option value="depth">Depth</option><option value="foreground">Foreground</option><option value="atmosphere">Atmosphere</option></select></label>
            </div>
            <div class="button-row">
              <button class="ghost" id="identify-left">Flash left</button>
              <button class="ghost" id="identify-front">Flash front</button>
              <button class="ghost" id="identify-right">Flash right</button>
              <button class="ghost" id="identify-all">Flash all</button>
            </div>
            <div class="feed-health-grid" id="feed-health"></div>
          </article>

          <article class="cockpit-card setup-card">
            <div class="scene-card-head"><h3>MadMapper control</h3><div class="scene-readout" id="madmapper-status">Not connected</div></div>
            <div class="madmapper-config">
              <label><span>Host</span><input id="madmapper-host" value="127.0.0.1"></label>
              <label><span>OSC</span><input id="madmapper-osc-port" type="number" min="1" max="65535" value="8010"></label>
              <label><span>Query</span><input id="madmapper-query-port" type="number" min="1" max="65535" value="8010"></label>
            </div>
            <div class="button-row">
              <button class="ghost" id="madmapper-refresh">Refresh controls</button>
              <button class="ghost" id="madmapper-browser">Open OSC browser</button>
              <button class="ghost" id="madmapper-test-on">Test pattern</button>
              <button class="ghost" id="madmapper-test-off">World output</button>
              <button class="danger" id="madmapper-blackout">MadMapper blackout</button>
              <button class="ghost" id="madmapper-full">MadMapper full</button>
            </div>
            <div class="button-row">
              <button class="ghost" id="madmapper-identify-left">Identify left</button>
              <button class="ghost" id="madmapper-identify-front">Identify front</button>
              <button class="ghost" id="madmapper-identify-right">Identify right</button>
              <button class="ghost" id="madmapper-identify-all">All surfaces</button>
            </div>
            <div class="cue-grid" id="cue-grid"></div>
          </article>
        </div>
      </section>

      <section class="cockpit-panel" data-panel="world">
        <div class="world-grid">
          <article class="cockpit-card world-prompt-card">
            <div class="scene-card-head"><h3>World generation</h3><div class="scene-readout" id="transcript-value">No prompt yet.</div></div>
            <textarea class="prompt-box" id="prompt" placeholder="Where do you want to go?">Take me to a forest where the trees are made of glass.</textarea>
            <div class="button-row">
              <button id="listen">Use microphone</button>
              <button class="primary" id="regenerate">Regenerate image</button>
              <button class="ghost" id="fallback">Skip to fallback</button>
            </div>
          </article>

          <article class="cockpit-card">
            <h3>Generation health</h3>
            <div class="status-grid compact-status">
              <div class="metric"><div class="label">Prompt provider</div><div class="value" id="prompt-provider">local</div></div>
              <div class="metric"><div class="label">Image provider</div><div class="value" id="image-provider">local</div></div>
              <div class="metric"><div class="label">Depth provider</div><div class="value" id="depth-provider">none</div></div>
              <div class="metric"><div class="label">Depth status</div><div class="value" id="depth-status">idle</div></div>
            </div>
          </article>

          <article class="cockpit-card setup-card">
            <div class="scene-card-head"><h3>Effect feeds</h3><div class="scene-readout" id="mask-status">SAM 2 masks idle</div></div>
            <div class="helper-controls">
              <label class="toggle-line"><input id="helper-feeds" type="checkbox"><span>Enable effect feeds</span></label>
              <label><span>Depth layer opacity</span><input id="depth-opacity" type="range" min="0" max="1" step="0.01" value="0.42"><strong id="depth-opacity-value">0.42</strong></label>
              <label><span>Foreground threshold</span><input id="foreground-threshold" type="range" min="0" max="1" step="0.01" value="0.68"><strong id="foreground-threshold-value">0.68</strong></label>
              <label><span>Atmosphere intensity</span><input id="atmosphere-intensity" type="range" min="0" max="1" step="0.01" value="0.55"><strong id="atmosphere-intensity-value">0.55</strong></label>
              <label><span>Atmosphere softness</span><input id="atmosphere-softness" type="range" min="0" max="1" step="0.01" value="0.45"><strong id="atmosphere-softness-value">0.45</strong></label>
            </div>
            <div class="helper-preview-grid">
              <figure><canvas id="depth-preview"></canvas><figcaption>Depth</figcaption></figure>
              <figure><canvas id="foreground-preview"></canvas><figcaption>Foreground</figcaption></figure>
              <figure><canvas id="atmosphere-preview"></canvas><figcaption>Atmosphere</figcaption></figure>
            </div>
            <div class="ndi-row"><button class="ghost" id="generate-masks">Generate masks</button></div>
          </article>

          <article class="cockpit-card">
            <h3>World recipe</h3>
            <p id="visual-prompt">No world generated yet.</p>
            <div class="palette" id="palette"></div>
          </article>
        </div>
      </section>

      <section class="cockpit-panel" data-panel="scene">
        <div class="scene-cockpit-grid">
          <aside class="cockpit-card projector-roster-card">
            <div class="scene-card-head"><h3>Virtual cameras</h3><div class="scene-readout" id="scene-readout">FOV 78 / L 69 / F 0 / R -69</div></div>
            <div class="projector-roster" id="projector-roster"></div>
          </aside>

          <article class="cockpit-card scene-card scene-main-card">
            <div class="scene-card-head"><h3>Camera rig editor</h3><div class="scene-readout">World sphere / camera captures / room footprints</div></div>
            <div class="scene-toolbar" aria-label="Scene editor tools">
              <button class="scene-tool is-active" id="scene-tool-move" title="Move selected camera">Move</button>
              <button class="scene-tool" id="scene-tool-rotate" title="Rotate selected camera">Rotate</button>
              <button class="scene-tool is-active" id="scene-view-perspective" title="Perspective orbit view">Orbit</button>
              <button class="scene-tool" id="scene-view-top" title="Top-down layout view">Top</button>
              <button class="scene-tool" id="scene-fit-selected" title="Frame selected camera">Fit</button>
              <button class="scene-tool" id="scene-snap-toggle" title="Toggle movement and rotation snapping">Snap off</button>
            </div>
            <div class="scene-viewer" id="scene-viewer"></div>
          </article>

          <aside class="cockpit-card scene-inspector-card">
            <div class="scene-card-head"><h3 id="projector-selected-name">Camera inspector</h3><div class="scene-readout">Selected NDI view</div></div>
            <div class="setup-controls scene-setup-controls">
              <label><span>Room layout</span><select id="room-template"><option value="three-wall">3 wall</option><option value="four-view-ceiling">4 view ceiling</option><option value="180-degree">180 degree</option><option value="270-degree">270 degree</option></select></label>
              <label><span>Room width m</span><input id="room-width" type="number" min="1" max="30" step="0.1" value="5.4"></label>
              <label><span>Room depth m</span><input id="room-depth" type="number" min="1" max="30" step="0.1" value="4.2"></label>
              <label><span>Room height m</span><input id="room-height" type="number" min="1" max="8" step="0.1" value="2.7"></label>
              <label><span>Visitor X</span><input id="visitor-x" type="number" min="-15" max="15" step="0.05" value="0"></label>
              <label><span>Visitor Y</span><input id="visitor-y" type="number" min="0" max="5" step="0.05" value="0"></label>
              <label><span>Visitor Z</span><input id="visitor-z" type="number" min="-15" max="15" step="0.05" value="0"></label>
              <label><span>Projector</span><select id="room-projector"></select></label>
              <label><span>Orientation</span><select id="projector-orientation"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label>
            </div>
            <div class="scene-controls inspector-controls">
              <label><span>Pos X</span><input id="projector-x" type="range" min="-5" max="5" step="0.05" value="0"><strong id="projector-x-value">0</strong></label>
              <label><span>Pos Y</span><input id="projector-y" type="range" min="0.5" max="5" step="0.05" value="1.8"><strong id="projector-y-value">1.8</strong></label>
              <label><span>Pos Z</span><input id="projector-z" type="range" min="-5" max="5" step="0.05" value="1.7"><strong id="projector-z-value">1.7</strong></label>
              <label><span>Yaw</span><input id="projector-yaw" type="range" min="-180" max="180" step="1" value="0"><strong id="projector-yaw-value">0</strong></label>
              <label><span>Pitch</span><input id="projector-pitch" type="range" min="-60" max="80" step="1" value="0"><strong id="projector-pitch-value">0</strong></label>
              <label><span>Roll</span><input id="projector-roll" type="range" min="-180" max="180" step="1" value="0"><strong id="projector-roll-value">0</strong></label>
              <label><span>FOV</span><input id="projector-fov" type="range" min="35" max="115" step="1" value="78"><strong id="projector-fov-value">78</strong></label>
            </div>
            <div class="inspector-fields">
              <label><span>Width</span><input id="projector-width" type="number" min="320" max="8192" step="1" value="1920"></label>
              <label><span>Height</span><input id="projector-height" type="number" min="240" max="8192" step="1" value="1080"></label>
              <label><span>Feed name</span><input id="projector-feed" value="TakeMeThere_FRONT"></label>
              <label><span>MadMapper surface</span><input id="projector-surface" value="Quad-2"></label>
            </div>
            <div class="hidden-yaw-controls">
              <input id="left-yaw" type="range" min="-170" max="170" step="1" value="69"><strong id="left-yaw-value">69</strong>
              <input id="front-yaw" type="range" min="-120" max="120" step="1" value="0"><strong id="front-yaw-value">0</strong>
              <input id="right-yaw" type="range" min="-170" max="170" step="1" value="-69"><strong id="right-yaw-value">-69</strong>
            </div>
            <div class="button-row">
              <button class="ghost" id="apply-room-template">Apply room layout</button>
              <button class="ghost" id="reset-projectors">Reset projector views</button>
              <button class="ghost" id="add-projector">Add projector</button>
              <button class="ghost" id="remove-projector">Remove selected</button>
              <button class="ghost" id="import-scan">Import scan</button>
              <button class="ghost" id="clear-scan">Clear scan</button>
            </div>
          </aside>
        </div>
      </section>

      <section class="cockpit-panel" data-panel="outputs">
        <div class="outputs-grid">
          <article class="cockpit-card setup-card">
            <div class="scene-card-head"><h3>NDI feeds</h3><div class="scene-readout">Fixed 1920 x 1080 virtual camera sources</div></div>
            <div class="button-row">
              <button class="ghost" id="focus-output">Focus cockpit</button>
              <button class="ghost" id="show-output">Reveal NDI sources</button>
              <button class="ghost" id="hide-output">Tuck NDI sources</button>
              <button class="ghost" id="fullscreen-output">Fullscreen disabled</button>
              <button class="ghost" id="reload-output">Reload NDI sources</button>
              <button class="ghost" id="validate-output">Validate MadMapper</button>
            </div>
            <div class="ndi-row"><div id="ndi-status">NDI helper idle</div><button class="ghost" id="ndi-start">Start NDI</button><button class="ghost" id="ndi-stop">Stop NDI</button></div>
            <pre class="osc-paths" id="output-validation">Validation has not run yet.</pre>
          </article>

          <article class="cockpit-card output-monitor-card">
            <div class="scene-card-head"><h3>Monitor previews</h3><div class="scene-readout">Scaled controller previews only</div></div>
            <div class="output-monitor-grid" id="output-monitor-grid"></div>
          </article>

          <article class="cockpit-card">
            <h3>MadMapper discovery</h3>
            <div class="madmapper-lists">
              <div><h3>Outputs</h3><p id="madmapper-outputs">-</p></div>
              <div><h3>Surfaces</h3><p id="madmapper-surfaces">-</p></div>
              <div><h3>Media</h3><p id="madmapper-media">-</p></div>
            </div>
            <pre class="osc-paths" id="madmapper-useful"></pre>
          </article>

          <article class="cockpit-card">
            <h3>Room presets</h3>
            <div class="preset-row"><input id="preset-name" value="Studio 3 Wall"><button class="ghost" id="save-preset">Save</button></div>
            <div class="preset-row"><select id="preset-list"></select><button class="ghost" id="load-preset">Load</button><button class="ghost" id="default-preset">Default</button></div>
            <label class="layout-select"><h3>Output layout</h3><select id="layout"><option value="three-wall">3 walls: left / front / right</option><option value="ceiling">4 views: left / front / right / ceiling</option></select></label>
            <label class="layout-select"><h3>Visual mode</h3><select id="visual-mode"><option value="auto">Auto: flat then depth</option><option value="flat">Flat baseline</option><option value="depth">Depth compare</option></select></label>
          </article>
        </div>
      </section>
    </section>
  </main>
`;

const els = {
  tabs: Array.from(document.querySelectorAll('[data-tab]')),
  panels: Array.from(document.querySelectorAll('[data-panel]')),
  topPreset: document.querySelector('#top-preset'),
  topState: document.querySelector('#top-state'),
  topTransport: document.querySelector('#top-transport'),
  topMadMapper: document.querySelector('#top-madmapper'),
  topFeeds: document.querySelector('#top-feeds'),
  topBlackout: document.querySelector('#top-blackout'),
  statePill: document.querySelector('#state-pill'),
  prompt: document.querySelector('#prompt'),
  start: document.querySelector('#start'),
  listen: document.querySelector('#listen'),
  generate: document.querySelector('#generate'),
  regenerate: document.querySelector('#regenerate'),
  fallback: document.querySelector('#fallback'),
  arrival: document.querySelector('#arrival'),
  end: document.querySelector('#end'),
  blackout: document.querySelector('#blackout'),
  reset: document.querySelector('#reset'),
  layout: document.querySelector('#layout'),
  visualMode: document.querySelector('#visual-mode'),
  presetName: document.querySelector('#preset-name'),
  presetList: document.querySelector('#preset-list'),
  savePreset: document.querySelector('#save-preset'),
  loadPreset: document.querySelector('#load-preset'),
  defaultPreset: document.querySelector('#default-preset'),
  focusOutput: document.querySelector('#focus-output'),
  fullscreenOutput: document.querySelector('#fullscreen-output'),
  reloadOutput: document.querySelector('#reload-output'),
  stateValue: document.querySelector('#state-value'),
  titleValue: document.querySelector('#title-value'),
  promptProvider: document.querySelector('#prompt-provider'),
  imageProvider: document.querySelector('#image-provider'),
  depthProvider: document.querySelector('#depth-provider'),
  depthStatus: document.querySelector('#depth-status'),
  latencyValue: document.querySelector('#latency-value'),
  costValue: document.querySelector('#cost-value'),
  transcriptValue: document.querySelector('#transcript-value'),
  visualPrompt: document.querySelector('#visual-prompt'),
  palette: document.querySelector('#palette'),
  cueValue: document.querySelector('#cue-value'),
  errorSlot: document.querySelector('#error-slot'),
  setupStatus: document.querySelector('#setup-status'),
  setupTransport: document.querySelector('#setup-transport'),
  testPattern: document.querySelector('#test-pattern'),
  identifyTarget: document.querySelector('#identify-target'),
  identifyLeft: document.querySelector('#identify-left'),
  identifyFront: document.querySelector('#identify-front'),
  identifyRight: document.querySelector('#identify-right'),
  identifyAll: document.querySelector('#identify-all'),
  feedHealth: document.querySelector('#feed-health'),
  helperFeeds: document.querySelector('#helper-feeds'),
  depthOpacity: document.querySelector('#depth-opacity'),
  depthOpacityValue: document.querySelector('#depth-opacity-value'),
  foregroundThreshold: document.querySelector('#foreground-threshold'),
  foregroundThresholdValue: document.querySelector('#foreground-threshold-value'),
  atmosphereIntensity: document.querySelector('#atmosphere-intensity'),
  atmosphereIntensityValue: document.querySelector('#atmosphere-intensity-value'),
  atmosphereSoftness: document.querySelector('#atmosphere-softness'),
  atmosphereSoftnessValue: document.querySelector('#atmosphere-softness-value'),
  depthPreview: document.querySelector('#depth-preview'),
  foregroundPreview: document.querySelector('#foreground-preview'),
  atmospherePreview: document.querySelector('#atmosphere-preview'),
  maskStatus: document.querySelector('#mask-status'),
  generateMasks: document.querySelector('#generate-masks'),
  ndiStatus: document.querySelector('#ndi-status'),
  ndiStart: document.querySelector('#ndi-start'),
  ndiStop: document.querySelector('#ndi-stop'),
  roomTemplate: document.querySelector('#room-template'),
  roomWidth: document.querySelector('#room-width'),
  roomDepth: document.querySelector('#room-depth'),
  roomHeight: document.querySelector('#room-height'),
  visitorX: document.querySelector('#visitor-x'),
  visitorY: document.querySelector('#visitor-y'),
  visitorZ: document.querySelector('#visitor-z'),
  roomProjector: document.querySelector('#room-projector'),
  importScan: document.querySelector('#import-scan'),
  clearScan: document.querySelector('#clear-scan'),
  sceneViewer: document.querySelector('#scene-viewer'),
  sceneToolMove: document.querySelector('#scene-tool-move'),
  sceneToolRotate: document.querySelector('#scene-tool-rotate'),
  sceneViewPerspective: document.querySelector('#scene-view-perspective'),
  sceneViewTop: document.querySelector('#scene-view-top'),
  sceneFitSelected: document.querySelector('#scene-fit-selected'),
  sceneSnapToggle: document.querySelector('#scene-snap-toggle'),
  sceneReadout: document.querySelector('#scene-readout'),
  projectorRoster: document.querySelector('#projector-roster'),
  projectorSelectedName: document.querySelector('#projector-selected-name'),
  projectorX: document.querySelector('#projector-x'),
  projectorY: document.querySelector('#projector-y'),
  projectorZ: document.querySelector('#projector-z'),
  projectorYaw: document.querySelector('#projector-yaw'),
  projectorXValue: document.querySelector('#projector-x-value'),
  projectorYValue: document.querySelector('#projector-y-value'),
  projectorZValue: document.querySelector('#projector-z-value'),
  projectorYawValue: document.querySelector('#projector-yaw-value'),
  leftYaw: document.querySelector('#left-yaw'),
  frontYaw: document.querySelector('#front-yaw'),
  rightYaw: document.querySelector('#right-yaw'),
  projectorPitch: document.querySelector('#projector-pitch'),
  projectorRoll: document.querySelector('#projector-roll'),
  projectorFov: document.querySelector('#projector-fov'),
  leftYawValue: document.querySelector('#left-yaw-value'),
  frontYawValue: document.querySelector('#front-yaw-value'),
  rightYawValue: document.querySelector('#right-yaw-value'),
  projectorPitchValue: document.querySelector('#projector-pitch-value'),
  projectorRollValue: document.querySelector('#projector-roll-value'),
  projectorFovValue: document.querySelector('#projector-fov-value'),
  projectorOrientation: document.querySelector('#projector-orientation'),
  projectorWidth: document.querySelector('#projector-width'),
  projectorHeight: document.querySelector('#projector-height'),
  projectorFeed: document.querySelector('#projector-feed'),
  projectorSurface: document.querySelector('#projector-surface'),
  applyRoomTemplate: document.querySelector('#apply-room-template'),
  resetProjectors: document.querySelector('#reset-projectors'),
  addProjector: document.querySelector('#add-projector'),
  removeProjector: document.querySelector('#remove-projector'),
  madMapperStatus: document.querySelector('#madmapper-status'),
  madMapperHost: document.querySelector('#madmapper-host'),
  madMapperOscPort: document.querySelector('#madmapper-osc-port'),
  madMapperQueryPort: document.querySelector('#madmapper-query-port'),
  madMapperRefresh: document.querySelector('#madmapper-refresh'),
  madMapperBrowser: document.querySelector('#madmapper-browser'),
  madMapperTestOn: document.querySelector('#madmapper-test-on'),
  madMapperTestOff: document.querySelector('#madmapper-test-off'),
  madMapperBlackout: document.querySelector('#madmapper-blackout'),
  madMapperFull: document.querySelector('#madmapper-full'),
  madMapperIdentifyLeft: document.querySelector('#madmapper-identify-left'),
  madMapperIdentifyFront: document.querySelector('#madmapper-identify-front'),
  madMapperIdentifyRight: document.querySelector('#madmapper-identify-right'),
  madMapperIdentifyAll: document.querySelector('#madmapper-identify-all'),
  cueGrid: document.querySelector('#cue-grid'),
  madMapperOutputs: document.querySelector('#madmapper-outputs'),
  madMapperSurfaces: document.querySelector('#madmapper-surfaces'),
  madMapperMedia: document.querySelector('#madmapper-media'),
  madMapperUseful: document.querySelector('#madmapper-useful'),
  showOutput: document.querySelector('#show-output'),
  hideOutput: document.querySelector('#hide-output'),
  validateOutput: document.querySelector('#validate-output'),
  outputValidation: document.querySelector('#output-validation'),
  outputMonitorGrid: document.querySelector('#output-monitor-grid')
};

let sceneViewer;
let lastProjectorConfig = { leftYaw: 69, frontYaw: 0, rightYaw: -69, fov: 78, ceilingPitch: 64, ceilingFov: 82 };
let currentRoom = null;
let selectedProjectorId = 'front';
let projectorUpdateTimer;
let roomUpdateTimer;
let helperPreviewImageSource = '';
let helperPreviewDepthSource = '';
let helperPreviewMaskSource = '';
let helperPreviewImage = null;
let helperPreviewDepth = null;
let helperPreviewMask = null;
let outputMonitorSignature = '';
let lastOutputBus = [];

for (const tab of els.tabs) tab.addEventListener('click', () => activateTab(tab.dataset.tab));
els.topBlackout.addEventListener('click', () => { audio.mute(); api.setState('BLACKOUT'); });
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
for (const input of [els.leftYaw, els.frontYaw, els.rightYaw]) {
  input.addEventListener('input', () => {
    const config = readProjectorControls();
    applyProjectorControls(config);
    clearTimeout(projectorUpdateTimer);
    projectorUpdateTimer = setTimeout(() => api.setProjectorConfig(config), 80);
  });
}
for (const input of [els.roomWidth, els.roomDepth, els.roomHeight]) {
  input.addEventListener('change', () => {
    const dimensions = {
      width: Number(els.roomWidth.value),
      depth: Number(els.roomDepth.value),
      height: Number(els.roomHeight.value)
    };
    currentRoom = { ...currentRoom, dimensions };
    sceneViewer?.setRoom(currentRoom);
    pushRoomPatch({ dimensions });
  });
}
for (const input of [els.visitorX, els.visitorY, els.visitorZ]) {
  input.addEventListener('change', pushVisitorPatch);
}
els.roomProjector.addEventListener('change', () => {
  selectedProjectorId = els.roomProjector.value || 'front';
  renderSelectedProjectorControls();
  renderProjectorRoster(currentRoom, lastOutputBus);
});
els.sceneToolMove.addEventListener('click', () => {
  sceneViewer?.setTransformMode('move');
  setSceneToolButtonState('move');
});
els.sceneToolRotate.addEventListener('click', () => {
  sceneViewer?.setTransformMode('rotate');
  setSceneToolButtonState('rotate');
});
els.sceneViewPerspective.addEventListener('click', () => {
  sceneViewer?.setViewMode('perspective');
  setSceneViewButtonState('perspective');
});
els.sceneViewTop.addEventListener('click', () => {
  sceneViewer?.setViewMode('top');
  setSceneViewButtonState('top');
});
els.sceneFitSelected.addEventListener('click', () => sceneViewer?.fitSelected());
els.sceneSnapToggle.addEventListener('click', () => {
  const enabled = sceneViewer?.toggleSnap() || false;
  els.sceneSnapToggle.textContent = enabled ? 'Snap on' : 'Snap off';
  els.sceneSnapToggle.classList.toggle('is-active', enabled);
});
for (const input of [els.projectorX, els.projectorY, els.projectorZ, els.projectorPitch]) {
  input.addEventListener('input', () => {
    renderSelectedProjectorValues();
    pushSelectedProjectorPatch();
  });
}
for (const input of [els.projectorYaw, els.projectorRoll, els.projectorFov]) {
  input.addEventListener('input', () => {
    renderSelectedProjectorValues();
    pushSelectedProjectorPatch();
  });
}
for (const input of [els.projectorOrientation, els.projectorWidth, els.projectorHeight, els.projectorFeed, els.projectorSurface]) {
  input.addEventListener('change', pushSelectedProjectorPatch);
}
els.projectorRoster.addEventListener('click', (event) => {
  const button = event.target.closest('[data-projector-id]');
  if (!button) return;
  selectedProjectorId = button.dataset.projectorId;
  els.roomProjector.value = selectedProjectorId;
  renderSelectedProjectorControls();
  renderProjectorRoster(currentRoom, lastOutputBus);
});
els.applyRoomTemplate.addEventListener('click', async () => {
  await api.applyRoomLayoutTemplate(els.roomTemplate.value);
});
els.importScan.addEventListener('click', () => api.importRoomScan());
els.clearScan.addEventListener('click', () => api.clearRoomScan());
els.resetProjectors.addEventListener('click', () => {
  const config = { leftYaw: 69, frontYaw: 0, rightYaw: -69, fov: 78, ceilingPitch: 64, ceilingFov: 82 };
  applyProjectorControls(config);
  api.setProjectorConfig(config);
});
els.addProjector.addEventListener('click', addProjector);
els.removeProjector.addEventListener('click', removeSelectedProjector);
els.focusOutput.addEventListener('click', () => api.focusOutput());
els.fullscreenOutput.addEventListener('click', () => api.toggleOutputFullscreen());
els.reloadOutput.addEventListener('click', () => api.reloadOutput());
els.showOutput.addEventListener('click', () => api.showProductionWindows?.());
els.hideOutput.addEventListener('click', () => api.hideProductionWindows?.());
els.validateOutput.addEventListener('click', validateMadMapperOutputs);
els.listen.addEventListener('click', startSpeechRecognition);
els.madMapperRefresh.addEventListener('click', discoverMadMapper);
els.madMapperBrowser.addEventListener('click', () => window.open(getMadMapperQueryUrl(), '_blank'));
for (const input of [els.madMapperHost, els.madMapperOscPort, els.madMapperQueryPort]) input.addEventListener('change', updateSetupFromControls);
els.madMapperTestOn.addEventListener('click', () => sendMadMapperValue('/master/test_pattern', 1));
els.madMapperTestOff.addEventListener('click', () => sendMadMapperValue('/master/test_pattern', 0));
els.madMapperBlackout.addEventListener('click', () => sendMadMapperValue('/master/master_video_level', 0));
els.madMapperFull.addEventListener('click', () => sendMadMapperValue('/master/master_video_level', 1));
els.madMapperIdentifyLeft.addEventListener('click', () => identifyMadMapperSurface(0));
els.madMapperIdentifyFront.addEventListener('click', () => identifyMadMapperSurface(1));
els.madMapperIdentifyRight.addEventListener('click', () => identifyMadMapperSurface(2));
els.madMapperIdentifyAll.addEventListener('click', () => setMadMapperSurfaceOpacities([1, 1, 1]));
els.setupTransport.addEventListener('change', updateSetupFromControls);
els.testPattern.addEventListener('change', updateSetupFromControls);
els.identifyTarget.addEventListener('change', updateSetupFromControls);
els.helperFeeds.addEventListener('change', updateSetupFromControls);
for (const input of [els.depthOpacity, els.foregroundThreshold, els.atmosphereIntensity, els.atmosphereSoftness]) {
  input.addEventListener('input', () => {
    renderSetupSliderValues();
    drawHelperPreviewCanvases();
    updateSetupFromControls();
  });
}
els.identifyLeft.addEventListener('click', () => identifyFeed('left'));
els.identifyFront.addEventListener('click', () => identifyFeed('front'));
els.identifyRight.addEventListener('click', () => identifyFeed('right'));
els.identifyAll.addEventListener('click', () => identifyFeed('all'));
els.ndiStart.addEventListener('click', async () => {
  const status = await api.startNdi();
  renderNdiStatus(status);
});
els.ndiStop.addEventListener('click', async () => {
  const status = await api.stopNdi();
  renderNdiStatus(status);
});
els.generateMasks.addEventListener('click', () => api.generateMasks());
els.savePreset.addEventListener('click', async () => {
  const saved = await api.saveRoomPreset({ name: els.presetName.value || 'Room Preset' });
  els.presetName.value = saved.name;
  await refreshPresetList(saved.id);
});
els.loadPreset.addEventListener('click', async () => {
  if (!els.presetList.value) return;
  await api.loadRoomPreset(els.presetList.value);
  await refreshPresetList(els.presetList.value);
});
els.defaultPreset.addEventListener('click', async () => {
  const preset = await api.getDefaultRoomPreset();
  els.presetName.value = preset.name;
  await api.applyRoomLayoutTemplate('three-wall');
  await api.updateSetup(preset.setup);
});

let madMapperDiscovery = null;
const CUE_BUTTONS = [
  ['setupGrid', 'SETUP_GRID'],
  ['identifyLeft', 'IDENTIFY_LEFT'],
  ['identifyFront', 'IDENTIFY_FRONT'],
  ['identifyRight', 'IDENTIFY_RIGHT'],
  ['worldIdle', 'WORLD_IDLE'],
  ['portalOpening', 'PORTAL_OPENING'],
  ['arrival', 'ARRIVAL'],
  ['blackout', 'BLACKOUT']
];

renderCueButtons();

function setSceneToolButtonState(mode) {
  els.sceneToolMove.classList.toggle('is-active', mode === 'move');
  els.sceneToolRotate.classList.toggle('is-active', mode === 'rotate');
}

function setSceneViewButtonState(mode) {
  els.sceneViewPerspective.classList.toggle('is-active', mode === 'perspective');
  els.sceneViewTop.classList.toggle('is-active', mode === 'top');
}

function activateTab(tabName) {
  for (const tab of els.tabs) tab.classList.toggle('is-active', tab.dataset.tab === tabName);
  for (const panel of els.panels) panel.classList.toggle('is-active', panel.dataset.panel === tabName);
  if (tabName === 'scene') setTimeout(() => sceneViewer?.resize(), 40);
}

function renderSession(session) {
  const state = session.state || {};
  const recipe = session.recipe || {};
  lastOutputBus = session.outputBus || [];
  els.statePill.textContent = state.label || state.key || 'Idle';
  els.topPreset.textContent = session.room?.name || els.presetName.value || 'Studio 3 Wall';
  els.topState.textContent = state.key || 'IDLE';
  els.topTransport.textContent = 'NDI';
  els.topMadMapper.textContent = madMapperDiscovery ? 'Connected' : 'Offline';
  els.stateValue.textContent = `${state.key || 'IDLE'} - ${state.projection || ''}`;
  els.titleValue.textContent = recipe.title || 'Unknown Dream';
  els.promptProvider.textContent = session.provider?.prompt || 'local';
  els.imageProvider.textContent = session.provider?.image || 'local';
  els.depthProvider.textContent = session.provider?.depth || 'none';
  els.depthStatus.textContent = `${session.depthStatus || 'idle'}${session.timings?.depthMs ? ` - ${session.timings.depthMs} ms` : ''}`;
  els.maskStatus.textContent = `SAM 2 masks ${session.maskStatus || 'idle'}${session.maskError ? ` / ${session.maskError}` : ''}`;
  els.transcriptValue.textContent = session.transcript || 'No prompt yet.';
  els.visualPrompt.textContent = recipe.visual_prompt || 'No world generated yet.';
  els.cueValue.textContent = `${state.ledCue || '-'} / ${state.audioCue || '-'}`;
  els.layout.value = session.layoutMode || 'three-wall';
  els.visualMode.value = session.visualMode || 'auto';
  renderSetup(session.setup || {}, session.outputBus || [], session.ndi || {});
  if (session.projectorConfig) applyProjectorControls(session.projectorConfig);
  renderRoom(session.room);
  renderOutputMonitors(session);
  renderHelperPreviews(session);
  sceneViewer?.setTexture(session.imageFileUrl || session.imageDataUrl || '');
  sceneViewer?.setProjectorConfig(session.projectorConfig || lastProjectorConfig);
  sceneViewer?.setLayerControls(session.setup || {});
  sceneViewer?.setRoom(session.room || currentRoom);
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
  if (session.maskError && session.maskStatus === 'failed') errors.push(`Masks: ${session.maskError}`);
  els.errorSlot.innerHTML = errors.map((error) => `<div class="error">${error}</div>`).join('');
  if (['PORTAL_OPENING', 'ARRIVAL', 'WORLD_ACTIVE'].includes(state.key)) audio.start(recipe.sound_style || 'dream');
  if (['EXIT', 'RESET', 'BLACKOUT', 'IDLE'].includes(state.key)) audio.mute();
}

function renderSetup(setup, outputBus, ndi) {
  els.setupTransport.value = 'ndi';
  els.testPattern.value = setup.testPattern || 'world';
  els.identifyTarget.value = setup.identifyTarget || 'all';
  els.helperFeeds.checked = Boolean(setup.helperFeedsEnabled);
  els.depthOpacity.value = String(setup.depthOpacity ?? 0.42);
  els.foregroundThreshold.value = String(setup.foregroundThreshold ?? 0.68);
  els.atmosphereIntensity.value = String(setup.atmosphereIntensity ?? 0.55);
  els.atmosphereSoftness.value = String(setup.atmosphereSoftness ?? 0.45);
  if (setup.madMapper) {
    els.madMapperHost.value = setup.madMapper.host || '127.0.0.1';
    els.madMapperOscPort.value = String(setup.madMapper.oscPort || 8010);
    els.madMapperQueryPort.value = String(setup.madMapper.queryPort || 8010);
  }
  renderSetupSliderValues();
  els.setupStatus.textContent = `NDI / ${setup.testPattern || 'world'}`;
  renderOutputBus(outputBus);
  renderNdiStatus(ndi);
}

function renderRoom(room) {
  if (!room) return;
  currentRoom = room;
  els.roomTemplate.value = room.type || 'three-wall';
  els.roomWidth.value = String(room.dimensions?.width ?? 5.4);
  els.roomDepth.value = String(room.dimensions?.depth ?? 4.2);
  els.roomHeight.value = String(room.dimensions?.height ?? 2.7);
  renderVisitorControls(room.visitor);
  const options = (room.projectors || []).map((projector) => `<option value="${projector.id}">${projector.label || projector.id}</option>`).join('');
  if (els.roomProjector.innerHTML !== options) els.roomProjector.innerHTML = options;
  if (!room.projectors?.some((projector) => projector.id === selectedProjectorId)) selectedProjectorId = room.projectors?.[0]?.id || 'front';
  els.roomProjector.value = selectedProjectorId;
  renderProjectorRoster(room, lastOutputBus);
  renderSelectedProjectorControls();
}

function renderVisitorControls(visitor = {}) {
  els.visitorX.value = String(visitor.x ?? 0);
  els.visitorY.value = String(visitor.y ?? 0);
  els.visitorZ.value = String(visitor.z ?? 0);
}

function pushVisitorPatch() {
  const visitor = {
    x: Number(els.visitorX.value),
    y: Number(els.visitorY.value),
    z: Number(els.visitorZ.value)
  };
  currentRoom = { ...currentRoom, visitor };
  sceneViewer?.setRoom(currentRoom);
  pushRoomPatch({ visitor });
}

function renderProjectorRoster(room, outputBus = []) {
  const feedsById = new Map((outputBus || []).map((feed) => [feed.id, feed]));
  els.projectorRoster.innerHTML = (room?.projectors || []).map((projector) => {
    const feed = feedsById.get(projector.id) || {};
    const status = feedStatus(feed);
    const resolution = projector.resolution ? `${projector.resolution.width} x ${projector.resolution.height}` : '1920 x 1080';
    return `
      <button class="projector-row ${projector.id === selectedProjectorId ? 'is-selected' : ''}" data-projector-id="${escapeAttr(projector.id)}">
        <span><strong>${escapeHtml(projector.label || projector.id)}</strong><em>${escapeHtml(projector.feedName || feed.name || 'No feed')}</em></span>
        <span class="projector-meta">${escapeHtml(projector.orientation || 'landscape')} / ${resolution}</span>
        <span class="status-token ${status.className}">${status.label}</span>
        <span class="projector-meta">${escapeHtml(projector.surface || feed.surface || 'No surface')}</span>
      </button>
    `;
  }).join('');
}

function renderSelectedProjectorControls() {
  const projector = getSelectedProjector();
  if (!projector) return;
  sceneViewer?.setSelectedProjector(projector.id);
  els.projectorSelectedName.textContent = projector.label || projector.id || 'Projector inspector';
  els.projectorX.value = String(projector.x ?? 0);
  els.projectorY.value = String(projector.y ?? 1.8);
  els.projectorZ.value = String(projector.z ?? 1.7);
  els.projectorYaw.value = String(projector.yaw ?? 0);
  els.projectorPitch.value = String(projector.pitch ?? 0);
  els.projectorRoll.value = String(projector.roll ?? 0);
  els.projectorFov.value = String(projector.fov ?? lastProjectorConfig.fov ?? 78);
  els.projectorOrientation.value = projector.orientation === 'portrait' ? 'portrait' : 'landscape';
  els.projectorWidth.value = String(projector.resolution?.width ?? 1920);
  els.projectorHeight.value = String(projector.resolution?.height ?? 1080);
  els.projectorFeed.value = projector.feedName || '';
  els.projectorSurface.value = projector.surface || '';
  renderSelectedProjectorValues();
}

function renderSelectedProjectorValues() {
  els.projectorXValue.textContent = Number(els.projectorX.value).toFixed(2);
  els.projectorYValue.textContent = Number(els.projectorY.value).toFixed(2);
  els.projectorZValue.textContent = Number(els.projectorZ.value).toFixed(2);
  els.projectorYawValue.textContent = String(Math.round(Number(els.projectorYaw.value)));
  els.projectorPitchValue.textContent = String(Math.round(Number(els.projectorPitch.value)));
  els.projectorRollValue.textContent = String(Math.round(Number(els.projectorRoll.value)));
  els.projectorFovValue.textContent = String(Math.round(Number(els.projectorFov.value)));
}

function getSelectedProjector() {
  return (currentRoom?.projectors || []).find((projector) => projector.id === selectedProjectorId);
}

function pushSelectedProjectorPatch() {
  if (!currentRoom) return;
  const projectors = currentRoom.projectors.map((projector) => {
    if (projector.id !== selectedProjectorId) return projector;
    return {
      ...projector,
      x: Number(els.projectorX.value),
      y: Number(els.projectorY.value),
      z: Number(els.projectorZ.value),
      yaw: Number(els.projectorYaw.value),
      pitch: Number(els.projectorPitch.value),
      roll: Number(els.projectorRoll.value),
      fov: Number(els.projectorFov.value),
      orientation: els.projectorOrientation.value,
      resolution: {
        width: Number(els.projectorWidth.value),
        height: Number(els.projectorHeight.value)
      },
      feedName: els.projectorFeed.value.trim(),
      surface: els.projectorSurface.value.trim()
    };
  });
  currentRoom = { ...currentRoom, projectors };
  sceneViewer?.setRoom(currentRoom);
  renderProjectorRoster(currentRoom, lastOutputBus);
  pushRoomPatch({ projectors });
}

function pushRoomPatch(patch) {
  if (patch.visitor) renderVisitorControls(patch.visitor);
  clearTimeout(roomUpdateTimer);
  roomUpdateTimer = setTimeout(() => api.setRoom(patch), 80);
}

function applySceneRoomPatch(patch) {
  if (!currentRoom) {
    pushRoomPatch(patch);
    return;
  }
  currentRoom = { ...currentRoom, ...patch };
  if (patch.projectors) {
    renderProjectorRoster(currentRoom, lastOutputBus);
    renderSelectedProjectorControls();
  }
  if (patch.visitor) renderVisitorControls(patch.visitor);
  pushRoomPatch(patch);
}

function addProjector() {
  if (!currentRoom) return;
  const projectors = currentRoom.projectors || [];
  const nextNumber = projectors.length + 1;
  const id = uniqueProjectorId(`projector-${nextNumber}`, projectors);
  const newProjector = {
    id,
    label: `Projector ${nextNumber}`,
    enabled: true,
    feedName: `TakeMeThere_PROJECTOR_${nextNumber}`,
    surface: `Quad-${nextNumber}`,
    orientation: 'landscape',
    resolution: { width: 1920, height: 1080 },
    x: 0,
    y: 1.7,
    z: 1.8,
    yaw: 0,
    pitch: 0,
    roll: 0,
    fov: 78
  };
  selectedProjectorId = id;
  currentRoom = { ...currentRoom, projectors: [...projectors, newProjector] };
  renderRoom(currentRoom);
  sceneViewer?.setRoom(currentRoom);
  api.setRoom({ projectors: currentRoom.projectors });
}

function removeSelectedProjector() {
  if (!currentRoom || (currentRoom.projectors || []).length <= 1) return;
  const projectors = currentRoom.projectors.filter((projector) => projector.id !== selectedProjectorId);
  selectedProjectorId = projectors[0]?.id || 'front';
  currentRoom = { ...currentRoom, projectors };
  renderRoom(currentRoom);
  sceneViewer?.setRoom(currentRoom);
  api.setRoom({ projectors });
}

function uniqueProjectorId(baseId, projectors) {
  const existing = new Set(projectors.map((projector) => projector.id));
  if (!existing.has(baseId)) return baseId;
  let index = 2;
  while (existing.has(`${baseId}-${index}`)) index += 1;
  return `${baseId}-${index}`;
}

function renderSetupSliderValues() {
  els.depthOpacityValue.textContent = Number(els.depthOpacity.value).toFixed(2);
  els.foregroundThresholdValue.textContent = Number(els.foregroundThreshold.value).toFixed(2);
  els.atmosphereIntensityValue.textContent = Number(els.atmosphereIntensity.value).toFixed(2);
  els.atmosphereSoftnessValue.textContent = Number(els.atmosphereSoftness.value).toFixed(2);
}

function updateSetupFromControls() {
  api.updateSetup({
    transport: 'ndi',
    testPattern: els.testPattern.value,
    identifyTarget: els.identifyTarget.value,
    helperFeedsEnabled: els.helperFeeds.checked,
    depthOpacity: Number(els.depthOpacity.value),
    foregroundThreshold: Number(els.foregroundThreshold.value),
    atmosphereIntensity: Number(els.atmosphereIntensity.value),
    atmosphereSoftness: Number(els.atmosphereSoftness.value),
    madMapper: getMadMapperConfig()
  });
}

function identifyFeed(target) {
  els.identifyTarget.value = target;
  updateSetupFromControls();
  if (target === 'left') identifyMadMapperSurface(0);
  if (target === 'front') identifyMadMapperSurface(1);
  if (target === 'right') identifyMadMapperSurface(2);
  if (target === 'all') setMadMapperSurfaceOpacities([1, 1, 1]);
}

function renderOutputBus(feeds = []) {
  const now = Date.now();
  const visibleFeeds = feeds.filter((feed) => feed.role === 'projector');
  const readyCount = visibleFeeds.filter((feed) => {
    const age = feed.renderHeartbeatAt ? Math.round((now - feed.renderHeartbeatAt) / 1000) : null;
    return feed.windowAlive && age !== null && age < 4;
  }).length;
  els.topFeeds.textContent = `${readyCount} ready / ${visibleFeeds.length} NDI feeds`;
  els.feedHealth.innerHTML = visibleFeeds.map((feed) => {
    const heartbeatAge = feed.renderHeartbeatAt ? Math.round((now - feed.renderHeartbeatAt) / 1000) : null;
    const alive = feed.windowAlive && heartbeatAge !== null && heartbeatAge < 4;
    const productionResolution = feed.targetWidth && feed.targetHeight ? `${feed.targetWidth} x ${feed.targetHeight}` : feed.resolution ? `${feed.resolution.width} x ${feed.resolution.height}` : 'fixed feed';
    const monitorResolution = feed.width && feed.height ? `${feed.width} x ${feed.height}` : 'waiting';
    return `
      <div class="feed-card ${alive ? 'is-alive' : ''}">
        <div class="feed-card-head"><strong>${feed.name}</strong><span>${feed.role}</span></div>
        <div>${alive ? 'NDI source live' : feed.windowAlive ? 'Source ready' : 'Source offline'}</div>
        <div>Production ${productionResolution}</div>
        <div>Render ${monitorResolution} / ${feed.fps || 0} fps</div>
        <div>NDI ${feed.expectedNdi ? 'expected' : 'monitor only'}</div>
        <div>${feed.madMapperSurface || feed.surface || 'helper feed'}</div>
      </div>
    `;
  }).join('');
}

function renderOutputMonitors(session) {
  const roomFeeds = (session.room?.projectors || []).filter((projector) => projector.enabled !== false).map((projector) => ({
    id: projector.id,
    label: projector.label || projector.id,
    role: 'projector',
    src: `./output.html?monitor=1&view=${encodeURIComponent(projector.id)}&feedId=${encodeURIComponent(projector.id)}`,
    resolution: projector.resolution || { width: 1920, height: 1080 },
    surface: projector.surface || ''
  }));
  const monitors = roomFeeds;
  const signature = JSON.stringify(monitors.map((feed) => [feed.id, feed.src, feed.resolution.width, feed.resolution.height]));
  if (signature === outputMonitorSignature) return;
  outputMonitorSignature = signature;
  els.outputMonitorGrid.innerHTML = monitors.map((feed) => `
    <figure class="feed-monitor-card">
      <div class="feed-monitor-frame" style="aspect-ratio:${feed.resolution.width}/${feed.resolution.height}"><iframe title="${escapeAttr(feed.label)} monitor" src="${feed.src}"></iframe></div>
      <figcaption><strong>${escapeHtml(feed.label)}</strong><span>${feed.resolution.width} x ${feed.resolution.height} / ${escapeHtml(feed.surface || feed.role)}</span></figcaption>
    </figure>
  `).join('');
}

function renderNdiStatus(status = {}) {
  const state = status.running ? 'running' : status.enabled ? 'armed' : 'idle';
  const helper = status.helperExists ? 'helper found' : 'helper missing';
  els.ndiStatus.textContent = `NDI ${state} / ${helper}${status.error ? ` / ${status.error}` : ''}`;
}

function renderHelperPreviews(session) {
  const imageSource = session.imageFileUrl || session.imageDataUrl || '';
  const depthSource = session.depthFileUrl || session.depthDataUrl || '';
  const maskSource = session.maskFileUrl || session.maskDataUrl || '';
  if (!maskSource && helperPreviewMaskSource) {
    helperPreviewMaskSource = '';
    helperPreviewMask = null;
  }
  if (imageSource && imageSource !== helperPreviewImageSource) {
    helperPreviewImageSource = imageSource;
    helperPreviewImage = new Image();
    helperPreviewImage.onload = () => drawHelperPreviewCanvases();
    helperPreviewImage.src = imageSource;
  }
  if (depthSource && depthSource !== helperPreviewDepthSource) {
    helperPreviewDepthSource = depthSource;
    helperPreviewDepth = new Image();
    helperPreviewDepth.onload = () => drawHelperPreviewCanvases();
    helperPreviewDepth.src = depthSource;
  }
  if (maskSource && maskSource !== helperPreviewMaskSource) {
    helperPreviewMaskSource = maskSource;
    helperPreviewMask = new Image();
    helperPreviewMask.onload = () => drawHelperPreviewCanvases();
    helperPreviewMask.src = maskSource;
  }
  drawHelperPreviewCanvases();
}

function drawHelperPreviewCanvases() {
  drawPreviewDepth(els.depthPreview);
  drawPreviewForeground(els.foregroundPreview);
  drawPreviewAtmosphere(els.atmospherePreview);
}

function preparePreviewCanvas(canvas) {
  const width = 360;
  const height = 202;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function drawPreviewDepth(canvas) {
  const { ctx, width, height } = preparePreviewCanvas(canvas);
  if (helperPreviewDepth) ctx.drawImage(helperPreviewDepth, 0, 0, width, height);
  else drawPreviewGradient(ctx, width, height);
}

function drawPreviewForeground(canvas) {
  const { ctx, width, height } = preparePreviewCanvas(canvas);
  if (helperPreviewMask) {
    ctx.drawImage(helperPreviewMask, 0, 0, width, height);
    return;
  }
  if (helperPreviewDepth) ctx.drawImage(helperPreviewDepth, 0, 0, width, height);
  else drawPreviewGradient(ctx, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const threshold = Number(els.foregroundThreshold.value) * 255;
  for (let i = 0; i < image.data.length; i += 4) {
    const mask = image.data[i] >= threshold ? 255 : 0;
    image.data[i] = mask;
    image.data[i + 1] = mask;
    image.data[i + 2] = mask;
  }
  ctx.putImageData(image, 0, 0);
}

function drawPreviewAtmosphere(canvas) {
  const { ctx, width, height } = preparePreviewCanvas(canvas);
  if (helperPreviewImage) {
    ctx.globalAlpha = 0.35 + Number(els.atmosphereIntensity.value) * 0.42;
    ctx.drawImage(helperPreviewImage, 0, 0, width, height);
    ctx.globalAlpha = 1;
  } else {
    drawPreviewGradient(ctx, width, height);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 28; i += 1) {
    const x = (i * 79) % width;
    const y = (i * 43) % height;
    const radius = 12 + Number(els.atmosphereSoftness.value) * 44;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawPreviewGradient(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, height, width, 0);
  gradient.addColorStop(0, '#e5e7eb');
  gradient.addColorStop(0.5, '#64748b');
  gradient.addColorStop(1, '#020617');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

async function refreshPresetList(selectedId = '') {
  const presets = await api.listRoomPresets();
  els.presetList.innerHTML = presets.map((preset) => `<option value="${preset.id}">${preset.name} (${preset.transport})</option>`).join('');
  if (selectedId) els.presetList.value = selectedId;
}

function renderCueButtons() {
  els.cueGrid.innerHTML = CUE_BUTTONS.map(([key, label]) => `<button class="ghost" data-cue="${key}">${label}</button>`).join('');
  els.cueGrid.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-cue]');
    if (!button) return;
    try {
      await api.madMapperTriggerCue(button.dataset.cue, getMadMapperConfig());
      els.madMapperStatus.textContent = `Triggered ${button.textContent}`;
    } catch (error) {
      els.madMapperStatus.textContent = 'Cue failed';
      els.madMapperUseful.textContent = error.message || String(error);
    }
  });
}

function getMadMapperConfig() {
  return {
    host: els.madMapperHost.value.trim() || '127.0.0.1',
    oscPort: Number(els.madMapperOscPort.value || 8010),
    queryPort: Number(els.madMapperQueryPort.value || 8010)
  };
}

function getMadMapperQueryUrl(path = '/') {
  const config = getMadMapperConfig();
  return `http://${config.host}:${config.queryPort}${path === '/' ? '/?' : path}`;
}

async function discoverMadMapper() {
  els.madMapperStatus.textContent = 'Connecting...';
  try {
    madMapperDiscovery = await api.madMapperDiscover(getMadMapperConfig());
    renderMadMapperDiscovery(madMapperDiscovery);
  } catch (error) {
    els.madMapperStatus.textContent = 'Offline';
    els.topMadMapper.textContent = 'Offline';
    els.madMapperOutputs.textContent = '-';
    els.madMapperSurfaces.textContent = '-';
    els.madMapperMedia.textContent = '-';
    els.madMapperUseful.textContent = error.message || String(error);
  }
}

function renderMadMapperDiscovery(discovery) {
  els.madMapperStatus.textContent = `Connected ${discovery.host}:${discovery.queryPort}`;
  els.topMadMapper.textContent = 'Connected';
  els.madMapperOutputs.textContent = formatMadMapperList(discovery.outputs);
  els.madMapperSurfaces.textContent = formatMadMapperList(discovery.surfaces);
  els.madMapperMedia.textContent = formatMadMapperList(discovery.media.slice(0, 12));
  els.madMapperUseful.textContent = formatUsefulMadMapperValues(discovery.useful || {});
}

function formatMadMapperList(items = []) {
  return items.length ? items.map((item) => item.name).join(', ') : '-';
}

function formatUsefulMadMapperValues(values) {
  return Object.entries(values)
    .filter(([, info]) => info)
    .map(([path, info]) => `${path}: ${formatOscValue(info.value)}`)
    .join('\n');
}

function formatOscValue(value) {
  if (!Array.isArray(value) || value.length === 0) return 'trigger';
  return value.map((item) => typeof item === 'boolean' ? String(item) : item).join(', ');
}

async function sendMadMapperValue(path, value) {
  try {
    await api.madMapperSend(path, value, getMadMapperConfig());
    els.madMapperStatus.textContent = `Sent ${path}`;
    setTimeout(discoverMadMapper, 120);
  } catch (error) {
    els.madMapperStatus.textContent = 'Send failed';
    els.madMapperUseful.textContent = error.message || String(error);
  }
}

async function identifyMadMapperSurface(index) {
  const surfaces = madMapperDiscovery?.surfaces?.length ? madMapperDiscovery.surfaces : [
    { name: 'Quad-1' },
    { name: 'Quad-2' },
    { name: 'Quad-3' }
  ];
  await setMadMapperSurfaceOpacities(surfaces.map((_, surfaceIndex) => surfaceIndex === index ? 1 : 0.12));
}

async function setMadMapperSurfaceOpacities(opacities) {
  const surfaces = madMapperDiscovery?.surfaces?.length ? madMapperDiscovery.surfaces : [
    { name: 'Quad-1' },
    { name: 'Quad-2' },
    { name: 'Quad-3' }
  ];
  try {
    await Promise.all(surfaces.slice(0, 3).map((surface, index) => {
      const path = surface.path ? `${surface.path}/opacity` : `/surfaces/${surface.name}/opacity`;
      return api.madMapperSend(path, opacities[index] ?? 1, getMadMapperConfig());
    }));
    els.madMapperStatus.textContent = 'Surface opacity sent';
    setTimeout(discoverMadMapper, 120);
  } catch (error) {
    els.madMapperStatus.textContent = 'Surface send failed';
    els.madMapperUseful.textContent = error.message || String(error);
  }
}

async function validateMadMapperOutputs() {
  els.outputValidation.textContent = 'Checking MadMapper media and surfaces...';
  try {
    const result = await api.validateMadMapperOutputs(getMadMapperConfig());
    els.outputValidation.textContent = result.checks.map((check) => {
      return `${check.status}  ${check.name}  media:${check.mediaFound ? 'yes' : 'no'}  surface:${check.surfaceFound ? check.surface : 'missing'}`;
    }).join('\n') || 'No active feeds found.';
    els.madMapperStatus.textContent = result.ok ? 'Validation ready' : 'Validation needs attention';
  } catch (error) {
    els.outputValidation.textContent = error.message || String(error);
    els.madMapperStatus.textContent = 'Validation failed';
  }
}

function readProjectorControls() {
  return {
    leftYaw: Number(els.leftYaw.value),
    frontYaw: Number(els.frontYaw.value),
    rightYaw: Number(els.rightYaw.value),
    fov: Number(lastProjectorConfig.fov || 78),
    ceilingPitch: lastProjectorConfig.ceilingPitch || 64,
    ceilingFov: lastProjectorConfig.ceilingFov || 82
  };
}

function applyProjectorControls(config) {
  lastProjectorConfig = { ...lastProjectorConfig, ...config };
  els.leftYaw.value = String(Math.round(lastProjectorConfig.leftYaw));
  els.frontYaw.value = String(Math.round(lastProjectorConfig.frontYaw));
  els.rightYaw.value = String(Math.round(lastProjectorConfig.rightYaw));
  els.leftYawValue.textContent = String(Math.round(lastProjectorConfig.leftYaw));
  els.frontYawValue.textContent = String(Math.round(lastProjectorConfig.frontYaw));
  els.rightYawValue.textContent = String(Math.round(lastProjectorConfig.rightYaw));
  els.sceneReadout.textContent = `FOV ${Math.round(lastProjectorConfig.fov)} / L ${Math.round(lastProjectorConfig.leftYaw)} / F ${Math.round(lastProjectorConfig.frontYaw)} / R ${Math.round(lastProjectorConfig.rightYaw)}`;
  sceneViewer?.setProjectorConfig(lastProjectorConfig);
}

class SceneViewer {
  constructor(container) {
    this.container = container;
    this.config = { leftYaw: 69, frontYaw: 0, rightYaw: -69, fov: 78 };
    this.room = null;
    this.roomSignature = '';
    this.selectedProjectorId = selectedProjectorId;
    this.scanSource = '';
    this.viewMode = 'perspective';
    this.transformMode = 'move';
    this.snapEnabled = false;
    this.draggingVisitor = false;
    this.projectorObjects = new Map();
    this.projectionDirty = true;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020407, 0.024);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500);
    this.camera.position.set(4.2, 2.8, 5.6);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x020407, 1);
    this.container.appendChild(this.renderer.domElement);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const sphere = new THREE.SphereGeometry(60, 96, 48);
    sphere.scale(-1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({ map: this.createPlannerTexture(), transparent: true, opacity: 0.66, side: THREE.BackSide, depthWrite: false });
    this.world = new THREE.Mesh(sphere, this.material);
    this.world.visible = true;
    this.scene.add(this.world);

    this.depthShell = new THREE.Mesh(
      new THREE.SphereGeometry(61, 96, 48),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.025, wireframe: true, side: THREE.BackSide, depthWrite: false })
    );
    this.atmosphereShell = new THREE.Mesh(
      new THREE.SphereGeometry(62.5, 96, 48),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.018, wireframe: true, side: THREE.BackSide, depthWrite: false })
    );
    this.scene.add(this.depthShell);
    this.scene.add(this.atmosphereShell);

    this.roomGroup = new THREE.Group();
    this.projectorGroup = new THREE.Group();
    this.projectionGroup = new THREE.Group();
    this.seamGroup = new THREE.Group();
    this.scanGroup = new THREE.Group();
    this.scene.add(this.roomGroup);
    this.scene.add(this.seamGroup);
    this.scene.add(this.projectorGroup);
    this.scene.add(this.projectionGroup);
    this.scene.add(this.scanGroup);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(0, 1.25, 0);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.minDistance = 0.8;
    this.orbit.maxDistance = 16;
    this.orbit.update();

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setMode('translate');
    this.transform.setSpace('world');
    this.transform.size = 0.76;
    this.transform.addEventListener('mouseDown', () => { this.orbit.enabled = false; });
    this.transform.addEventListener('mouseUp', () => { this.orbit.enabled = true; this.emitSelectedProjectorEdit(); });
    this.transform.addEventListener('objectChange', () => {
      this.emitSelectedProjectorEdit();
      this.markProjectionDirty();
    });
    this.scene.add(this.transform.getHelper());

    this.bindPointerTools();
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
    gradient.addColorStop(0.46, '#0f766e');
    gradient.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    for (let i = 0; i < 120; i += 1) {
      ctx.fillRect((i * 173) % canvas.width, (i * 97) % canvas.height, 2 + (i % 4), 2 + (i % 4));
    }
    ctx.strokeStyle = 'rgba(34,211,238,.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(248,250,252,.38)';
    ctx.font = '700 34px system-ui, sans-serif';
    ctx.fillText('WORLD SPHERE', 34, canvas.height - 42);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  bindPointerTools() {
    let pointerDown = null;
    this.renderer.domElement.addEventListener('pointerdown', (event) => {
      pointerDown = { x: event.clientX, y: event.clientY };
      this.updatePointer(event);
      const visitorHit = this.raycaster.intersectObjects(this.roomGroup.children, true)
        .find((item) => item.object.userData.visitor || item.object.parent?.userData.visitor);
      if (visitorHit) {
        this.draggingVisitor = true;
        this.orbit.enabled = false;
        this.renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }
    });
    this.renderer.domElement.addEventListener('pointermove', (event) => {
      if (this.draggingVisitor) {
        this.dragVisitor(event);
      }
    });
    this.renderer.domElement.addEventListener('pointerup', (event) => {
      const moved = pointerDown ? Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) : 99;
      if (this.draggingVisitor) {
        this.draggingVisitor = false;
        this.orbit.enabled = true;
        return;
      }
      if (moved < 6 && !this.transform.dragging) {
        this.updatePointer(event);
        const hit = this.raycaster.intersectObjects(this.projectorGroup.children, true)
          .find((item) => this.projectorIdFromObject(item.object));
        if (hit) this.selectProjector(this.projectorIdFromObject(hit.object));
      }
      pointerDown = null;
      this.draggingVisitor = false;
    });
  }

  updatePointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  dragVisitor(event) {
    if (!this.room) return;
    this.updatePointer(event);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, point)) return;
    const width = this.room.dimensions?.width || 5.4;
    const depth = this.room.dimensions?.depth || 4.2;
    const visitor = {
      ...(this.room.visitor || {}),
      x: clamp(point.x, -width / 2, width / 2),
      z: clamp(point.z, -depth / 2, depth / 2)
    };
    this.room = { ...this.room, visitor };
    this.roomSignature = JSON.stringify(this.room);
    if (this.visitorGroup) this.visitorGroup.position.set(visitor.x || 0, visitor.y || 0, visitor.z || 0);
    this.onRoomEdit?.({ visitor });
  }

  setTexture(source) {
    if (!source || source === this.textureSource) return;
    this.textureSource = source;
    new THREE.TextureLoader().load(source, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      this.material.map = texture;
      this.material.opacity = 0.78;
      this.material.needsUpdate = true;
      this.markProjectionDirty();
    }, undefined, (error) => console.error('[takemethere] scene viewer texture failed', error));
  }

  setProjectorConfig(config) {
    this.config = { ...this.config, ...config };
    this.markProjectionDirty();
  }

  setSelectedProjector(projectorId) {
    const changed = this.selectedProjectorId !== projectorId;
    this.selectedProjectorId = projectorId;
    if (changed) this.rebuildRoom();
    else this.attachTransformToSelected();
  }

  selectProjector(projectorId) {
    if (!projectorId) return;
    this.selectedProjectorId = projectorId;
    this.rebuildRoom();
    this.onSelectProjector?.(projectorId);
  }

  setTransformMode(mode) {
    this.transformMode = mode === 'rotate' ? 'rotate' : 'move';
    this.transform.setMode(this.transformMode === 'rotate' ? 'rotate' : 'translate');
    this.attachTransformToSelected();
  }

  toggleSnap() {
    this.snapEnabled = !this.snapEnabled;
    this.transform.setTranslationSnap(this.snapEnabled ? 0.05 : null);
    this.transform.setRotationSnap(this.snapEnabled ? degToRad(5) : null);
    return this.snapEnabled;
  }

  setViewMode(mode) {
    this.viewMode = mode === 'top' ? 'top' : 'perspective';
    const center = this.getRoomCenter();
    this.orbit.target.copy(center);
    if (this.viewMode === 'top') {
      const { width = 5.4, depth = 4.2 } = this.room?.dimensions || {};
      const distance = Math.max(width, depth) * 1.35 + 2.2;
      this.camera.up.set(0, 0, -1);
      this.camera.position.set(center.x, distance, center.z + 0.001);
      this.orbit.enableRotate = false;
    } else {
      this.camera.up.set(0, 1, 0);
      this.camera.position.copy(center).add(new THREE.Vector3(4.2, 2.2, 5.4));
      this.orbit.enableRotate = true;
    }
    this.camera.lookAt(center);
    this.orbit.update();
  }

  fitSelected() {
    const group = this.projectorObjects.get(this.selectedProjectorId);
    const target = group ? group.position.clone() : this.getRoomCenter();
    this.orbit.target.copy(target);
    if (this.viewMode === 'top') {
      this.camera.position.set(target.x, Math.max(5.5, this.camera.position.y), target.z + 0.001);
    } else {
      this.camera.up.set(0, 1, 0);
      this.camera.position.copy(target).add(new THREE.Vector3(1.8, 1.2, 2.2));
      this.orbit.enableRotate = true;
      this.viewMode = 'perspective';
    }
    this.camera.lookAt(target);
    this.orbit.update();
  }

  setLayerControls(setup = {}) {
    if (this.depthShell) this.depthShell.material.opacity = Number(setup.depthOpacity ?? 0.42) * 0.075;
    if (this.atmosphereShell) this.atmosphereShell.material.opacity = Number(setup.atmosphereIntensity ?? 0.55) * 0.04;
  }

  setRoom(room) {
    if (!room) return;
    const signature = JSON.stringify(room);
    if (signature === this.roomSignature) return;
    this.roomSignature = signature;
    this.room = room;
    this.rebuildRoom();
    this.loadScanMesh();
  }

  rebuildRoom() {
    this.roomGroup.clear();
    this.projectorGroup.clear();
    this.projectionGroup.clear();
    this.seamGroup.clear();
    this.projectorObjects.clear();
    if (!this.room) return;
    const { width, depth, height } = this.room.dimensions || { width: 5.4, depth: 4.2, height: 2.7 };

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.userData.floor = true;
    this.roomGroup.add(floor);
    const grid = new THREE.GridHelper(Math.max(width, depth), 12, 0x22d3ee, 0x334155);
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
    this.roomGroup.add(grid);

    this.addWall('front', width, height, 0, height / 2, -depth / 2, 0);
    this.addWall('left', depth, height, -width / 2, height / 2, 0, Math.PI / 2);
    this.addWall('right', depth, height, width / 2, height / 2, 0, -Math.PI / 2);

    this.addVisitor();

    for (const seam of this.room.seamZones || []) this.addSeam(seam, height);
    for (const projector of this.room.projectors || []) this.addProjector(projector);
    for (const camera of this.room.cameras || []) this.addCamera(camera);
    this.attachTransformToSelected();
    this.markProjectionDirty();
  }

  addWall(name, width, height, x, y, z, rotationY) {
    const material = new THREE.MeshBasicMaterial({
      color: name === 'front' ? 0x164e63 : 0x1e293b,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide
    });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    wall.position.set(x, y, z);
    wall.rotation.y = rotationY;
    wall.userData.wall = name;
    this.roomGroup.add(wall);
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(wall.geometry),
      new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.35 })
    );
    outline.position.copy(wall.position);
    outline.rotation.copy(wall.rotation);
    this.roomGroup.add(outline);
  }

  addVisitor() {
    const visitor = this.room.visitor || { x: 0, y: 0, z: 0 };
    const group = new THREE.Group();
    group.userData.visitor = true;
    group.position.set(visitor.x || 0, visitor.y || 0, visitor.z || 0);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc, depthTest: false })
    );
    marker.position.y = 0.12;
    marker.userData.visitor = true;
    group.add(marker);
    group.add(this.createLabel('VISITOR', new THREE.Vector3(0, 0.44, 0), '#f8fafc'));
    this.visitorGroup = group;
    this.roomGroup.add(group);
  }

  addSeam(seam, height) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(seam.width || 0.08, height, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.5 })
    );
    mesh.position.set(seam.x || 0, height / 2, seam.z || 0);
    this.seamGroup.add(mesh);
  }

  addProjector(projector) {
    const group = new THREE.Group();
    group.userData.projectorId = projector.id;
    group.userData.projector = projector;
    group.position.set(projector.x || 0, projector.y || 1.8, projector.z || 1.6);
    setCameraObjectRotation(group, projector);
    const selected = projector.id === this.selectedProjectorId;
    const color = selected ? 0x22d3ee : projector.id === 'left' ? 0x38bdf8 : projector.id === 'right' ? 0xf59e0b : 0xf8fafc;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(selected ? 0.32 : 0.26, selected ? 0.2 : 0.16, selected ? 0.34 : 0.28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: selected ? 1 : 0.78, depthTest: false })
    );
    body.userData.projectorId = projector.id;
    group.add(body);
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.07, 0.08, 24),
      new THREE.MeshBasicMaterial({ color: 0x020617, transparent: true, opacity: 0.95, depthTest: false })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.2;
    lens.userData.projectorId = projector.id;
    group.add(lens);
    group.add(this.createCameraFrame(projector, color));
    group.add(this.createCameraBeam(projector, color));
    group.add(this.createLabel(projector.id.toUpperCase(), new THREE.Vector3(0, 0.32, 0), `#${color.toString(16).padStart(6, '0')}`));
    this.projectorGroup.add(group);
    this.projectorObjects.set(projector.id, group);
  }

  createCameraFrame(projector, color) {
    const aspect = projectorAspect(projector);
    const distance = 0.34;
    const halfHeight = Math.tan(degToRad(projector.fov || 78) / 2) * distance;
    const halfWidth = halfHeight * aspect;
    const points = [
      new THREE.Vector3(-halfWidth, halfHeight, -distance),
      new THREE.Vector3(halfWidth, halfHeight, -distance),
      new THREE.Vector3(halfWidth, -halfHeight, -distance),
      new THREE.Vector3(-halfWidth, -halfHeight, -distance)
    ];
    const frame = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false })
    );
    frame.userData.projectorId = projector.id;
    return frame;
  }

  createCameraBeam(projector, color) {
    const aspect = projectorAspect(projector);
    const distance = 1.35;
    const halfHeight = Math.tan(degToRad(projector.fov || 78) / 2) * distance;
    const halfWidth = halfHeight * aspect;
    const origin = new THREE.Vector3(0, 0, 0);
    const corners = [
      new THREE.Vector3(-halfWidth, halfHeight, -distance),
      new THREE.Vector3(halfWidth, halfHeight, -distance),
      new THREE.Vector3(halfWidth, -halfHeight, -distance),
      new THREE.Vector3(-halfWidth, -halfHeight, -distance)
    ];
    const points = [
      origin, corners[0], origin, corners[1], origin, corners[2], origin, corners[3],
      corners[0], corners[1], corners[1], corners[2], corners[2], corners[3], corners[3], corners[0]
    ];
    const beam = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: projector.id === this.selectedProjectorId ? 0.72 : 0.34, depthTest: false })
    );
    beam.userData.projectorId = projector.id;
    return beam;
  }

  addCamera(camera) {
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.28, 18),
      new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.88 })
    );
    marker.position.set(camera.x || 0, camera.y || 1.6, camera.z || 3);
    marker.rotation.x = Math.PI / 2;
    this.roomGroup.add(marker);
    this.roomGroup.add(this.createLabel(camera.label || 'CAMERA', marker.position.clone().add(new THREE.Vector3(0, 0.24, 0)), '#c4b5fd'));
  }

  createLabel(text, position, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(2,6,23,.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = '700 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.position.copy(position);
    sprite.scale.set(0.72, 0.18, 1);
    return sprite;
  }

  loadScanMesh() {
    const scan = this.room?.scan;
    const source = scan?.visible ? scan.meshFileUrl : '';
    if (source === this.scanSource) return;
    this.scanSource = source;
    this.scanGroup.clear();
    if (!source) return;
    const onLoaded = (object) => {
      const mesh = object.scene || object;
      mesh.traverse?.((child) => {
        if (child.material) {
          child.material.transparent = true;
          child.material.opacity = 0.32;
          child.material.wireframe = true;
        }
      });
      mesh.scale.setScalar(1);
      this.scanGroup.add(mesh);
    };
    if (source.toLowerCase().endsWith('.obj')) {
      new OBJLoader().load(source, onLoaded, undefined, (error) => console.error('[takemethere] OBJ scan load failed', error));
    } else {
      new GLTFLoader().load(source, onLoaded, undefined, (error) => console.error('[takemethere] glTF scan load failed', error));
    }
  }

  attachTransformToSelected() {
    const group = this.projectorObjects.get(this.selectedProjectorId);
    if (!group) {
      this.transform.detach();
      return;
    }
    this.transform.attach(group);
    this.transform.setMode(this.transformMode === 'rotate' ? 'rotate' : 'translate');
    this.transform.setSpace('world');
  }

  emitSelectedProjectorEdit() {
    if (!this.room || !this.transform.object) return;
    const group = this.transform.object;
    const projectorId = group.userData.projectorId;
    if (!projectorId) return;
    const projectors = (this.room.projectors || []).map((projector) => {
      if (projector.id !== projectorId) return projector;
      return projectorFromCameraObject(projector, group);
    });
    this.room = { ...this.room, projectors };
    this.roomSignature = JSON.stringify(this.room);
    group.userData.projector = projectors.find((projector) => projector.id === projectorId);
    this.onRoomEdit?.({ projectors });
  }

  markProjectionDirty() {
    this.projectionDirty = true;
  }

  updateProjectionFootprints() {
    this.projectionDirty = false;
    this.projectionGroup.clear();
    if (!this.room) return;
    for (const projector of this.room.projectors || []) {
      const group = this.projectorObjects.get(projector.id);
      if (!group) continue;
      const selected = projector.id === this.selectedProjectorId;
      const color = selected ? 0x22d3ee : 0x94a3b8;
      const camera = this.cameraFromProjector(projector, group);
      const spherePoints = this.sampleProjectionOnSphere(camera);
      if (spherePoints.length > 2) {
        this.projectionGroup.add(new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(spherePoints),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: selected ? 0.96 : 0.38, depthTest: false })
        ));
      }
      const wallSegments = this.sampleProjectionOnRoom(camera);
      if (wallSegments.length > 1) {
        this.projectionGroup.add(new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(wallSegments),
          new THREE.LineBasicMaterial({ color: selected ? 0x34d399 : 0xf59e0b, transparent: true, opacity: selected ? 0.94 : 0.34, depthTest: false })
        ));
      }
    }
  }

  cameraFromProjector(projector, group) {
    const camera = new THREE.PerspectiveCamera(Number(projector.fov || 78), projectorAspect(projector), 0.05, 100);
    group.updateMatrixWorld(true);
    camera.position.copy(group.getWorldPosition(new THREE.Vector3()));
    camera.quaternion.copy(group.getWorldQuaternion(new THREE.Quaternion()));
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    return camera;
  }

  sampleProjectionOnSphere(camera) {
    const points = [];
    for (const ndc of this.sampleNdcRectangle(24)) {
      const direction = this.ndcToDirection(camera, ndc.x, ndc.y);
      const point = this.intersectSphere(camera.position, direction, 59.6);
      if (point) points.push(point);
    }
    return points;
  }

  sampleProjectionOnRoom(camera) {
    const segments = [];
    const edges = this.sampleNdcEdges(28);
    for (const edge of edges) {
      let previous = null;
      for (const ndc of edge) {
        const direction = this.ndcToDirection(camera, ndc.x, ndc.y);
        const hit = this.intersectRoom(camera.position, direction);
        if (hit && previous && hit.surface === previous.surface) {
          segments.push(previous.point, hit.point);
        }
        previous = hit;
      }
    }
    return segments;
  }

  sampleNdcRectangle(samplesPerEdge) {
    return this.sampleNdcEdges(samplesPerEdge).flat();
  }

  sampleNdcEdges(samplesPerEdge) {
    const edges = [];
    const pushEdge = (from, to) => {
      const edge = [];
      for (let index = 0; index <= samplesPerEdge; index += 1) {
        const t = index / samplesPerEdge;
        edge.push({
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t
        });
      }
      edges.push(edge);
    };
    pushEdge({ x: -1, y: 1 }, { x: 1, y: 1 });
    pushEdge({ x: 1, y: 1 }, { x: 1, y: -1 });
    pushEdge({ x: 1, y: -1 }, { x: -1, y: -1 });
    pushEdge({ x: -1, y: -1 }, { x: -1, y: 1 });
    return edges;
  }

  ndcToDirection(camera, x, y) {
    return new THREE.Vector3(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
  }

  intersectSphere(origin, direction, radius) {
    const b = origin.dot(direction);
    const c = origin.lengthSq() - radius * radius;
    const discriminant = b * b - c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    const t1 = -b - root;
    const t2 = -b + root;
    const t = t1 > 0.01 ? t1 : t2;
    if (t <= 0.01) return null;
    return origin.clone().add(direction.clone().multiplyScalar(t));
  }

  intersectRoom(origin, direction) {
    const dimensions = this.room?.dimensions || { width: 5.4, depth: 4.2, height: 2.7 };
    const halfWidth = dimensions.width / 2;
    const halfDepth = dimensions.depth / 2;
    const candidates = [];
    const addCandidate = (surface, t, point) => {
      if (!Number.isFinite(t) || t <= 0.01) return;
      candidates.push({ surface, t, point });
    };
    if (Math.abs(direction.z) > 0.0001) {
      const frontT = (-halfDepth - origin.z) / direction.z;
      const frontPoint = origin.clone().add(direction.clone().multiplyScalar(frontT));
      if (frontPoint.x >= -halfWidth && frontPoint.x <= halfWidth && frontPoint.y >= 0 && frontPoint.y <= dimensions.height) addCandidate('front', frontT, frontPoint);
      const backT = (halfDepth - origin.z) / direction.z;
      const backPoint = origin.clone().add(direction.clone().multiplyScalar(backT));
      if (backPoint.x >= -halfWidth && backPoint.x <= halfWidth && backPoint.y >= 0 && backPoint.y <= dimensions.height) addCandidate('back', backT, backPoint);
    }
    if (Math.abs(direction.x) > 0.0001) {
      const leftT = (-halfWidth - origin.x) / direction.x;
      const leftPoint = origin.clone().add(direction.clone().multiplyScalar(leftT));
      if (leftPoint.z >= -halfDepth && leftPoint.z <= halfDepth && leftPoint.y >= 0 && leftPoint.y <= dimensions.height) addCandidate('left', leftT, leftPoint);
      const rightT = (halfWidth - origin.x) / direction.x;
      const rightPoint = origin.clone().add(direction.clone().multiplyScalar(rightT));
      if (rightPoint.z >= -halfDepth && rightPoint.z <= halfDepth && rightPoint.y >= 0 && rightPoint.y <= dimensions.height) addCandidate('right', rightT, rightPoint);
    }
    if (Math.abs(direction.y) > 0.0001) {
      const floorT = -origin.y / direction.y;
      const floorPoint = origin.clone().add(direction.clone().multiplyScalar(floorT));
      if (floorPoint.x >= -halfWidth && floorPoint.x <= halfWidth && floorPoint.z >= -halfDepth && floorPoint.z <= halfDepth) addCandidate('floor', floorT, floorPoint);
      const ceilingT = (dimensions.height - origin.y) / direction.y;
      const ceilingPoint = origin.clone().add(direction.clone().multiplyScalar(ceilingT));
      if (ceilingPoint.x >= -halfWidth && ceilingPoint.x <= halfWidth && ceilingPoint.z >= -halfDepth && ceilingPoint.z <= halfDepth) addCandidate('ceiling', ceilingT, ceilingPoint);
    }
    candidates.sort((a, b) => a.t - b.t);
    return candidates[0] || null;
  }

  projectorIdFromObject(object) {
    let current = object;
    while (current) {
      if (current.userData?.projectorId) return current.userData.projectorId;
      current = current.parent;
    }
    return '';
  }

  getRoomCenter() {
    const height = this.room?.dimensions?.height || 2.7;
    return new THREE.Vector3(0, height * 0.48, 0);
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  animate() {
    this.orbit.update();
    if (this.projectionDirty) this.updateProjectionFootprints();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }
}

function feedStatus(feed = {}) {
  const age = feed.renderHeartbeatAt ? (Date.now() - feed.renderHeartbeatAt) / 1000 : Infinity;
  if (feed.windowAlive && age < 4) return { label: 'LIVE', className: 'is-live' };
  if (feed.windowAlive) return { label: 'READY', className: 'is-ready' };
  if (feed.expectedNdi) return { label: 'MISSING', className: 'is-missing' };
  return { label: 'OFFLINE', className: 'is-offline' };
}

function titleCase(value) {
  return String(value || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function degToRad(deg) {
  return deg * Math.PI / 180;
}

function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

function projectorAspect(projector = {}) {
  const resolution = projector.resolution || {};
  const width = Number(resolution.width || (projector.orientation === 'portrait' ? 1080 : 1920));
  const height = Number(resolution.height || (projector.orientation === 'portrait' ? 1920 : 1080));
  return clamp(width / Math.max(1, height), 0.18, 5.5);
}

function setCameraObjectRotation(object, projector = {}) {
  const visibleRoll = Number(projector.roll || 0) + (projector.orientation === 'portrait' ? 90 : 0);
  object.rotation.order = 'YXZ';
  object.rotation.set(
    degToRad(projector.pitch || 0),
    degToRad(-(projector.yaw || 0)),
    degToRad(visibleRoll)
  );
}

function projectorFromCameraObject(projector = {}, object) {
  const euler = new THREE.Euler().setFromQuaternion(object.quaternion, 'YXZ');
  const visibleRoll = radToDeg(euler.z);
  const portraitOffset = projector.orientation === 'portrait' ? 90 : 0;
  return {
    ...projector,
    x: roundTo(object.position.x, 3),
    y: roundTo(object.position.y, 3),
    z: roundTo(object.position.z, 3),
    yaw: roundTo(normalizeAngle(-radToDeg(euler.y)), 2),
    pitch: roundTo(clamp(radToDeg(euler.x), -89, 89), 2),
    roll: roundTo(normalizeAngle(visibleRoll - portraitOffset), 2)
  };
}

function normalizeAngle(deg) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

function roundTo(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

sceneViewer = new SceneViewer(els.sceneViewer);
sceneViewer.onRoomEdit = applySceneRoomPatch;
sceneViewer.onSelectProjector = (projectorId) => {
  selectedProjectorId = projectorId;
  els.roomProjector.value = projectorId;
  renderProjectorRoster(currentRoom, lastOutputBus);
  renderSelectedProjectorControls();
};
api.onSessionUpdate(renderSession);
api.getSession().then(renderSession);
refreshPresetList();
discoverMadMapper();

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
