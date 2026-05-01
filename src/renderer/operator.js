import { AudioEngine } from './audio-engine.js';

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
    </section>
    <section class="panel status-panel">
      <div class="status-grid">
        <div class="metric"><div class="label">Current state</div><div class="value" id="state-value">Idle</div></div><div class="metric"><div class="label">Generated title</div><div class="value" id="title-value">Unknown Dream</div></div><div class="metric"><div class="label">Prompt provider</div><div class="value" id="prompt-provider">local</div></div><div class="metric"><div class="label">Image provider</div><div class="value" id="image-provider">local</div></div><div class="metric"><div class="label">Latency</div><div class="value" id="latency-value">0 ms</div></div><div class="metric"><div class="label">Cost estimate</div><div class="value" id="cost-value">$0.00</div></div>
      </div>
      <div id="error-slot"></div>
      <article class="recipe-card"><h3>Last transcript</h3><p id="transcript-value">No prompt yet.</p></article>
      <article class="recipe-card"><h3>World recipe</h3><p id="visual-prompt">No world generated yet.</p><div class="palette" id="palette"></div></article>
      <article class="recipe-card"><h3>Lighting / audio cue</h3><p id="cue-value">portal_breathing / idle_hum</p></article>
    </section>
  </main>
`;

const els = {
  statePill: document.querySelector('#state-pill'), prompt: document.querySelector('#prompt'), start: document.querySelector('#start'), listen: document.querySelector('#listen'), generate: document.querySelector('#generate'), regenerate: document.querySelector('#regenerate'), fallback: document.querySelector('#fallback'), arrival: document.querySelector('#arrival'), end: document.querySelector('#end'), blackout: document.querySelector('#blackout'), reset: document.querySelector('#reset'), layout: document.querySelector('#layout'), focusOutput: document.querySelector('#focus-output'), fullscreenOutput: document.querySelector('#fullscreen-output'), reloadOutput: document.querySelector('#reload-output'), stateValue: document.querySelector('#state-value'), titleValue: document.querySelector('#title-value'), promptProvider: document.querySelector('#prompt-provider'), imageProvider: document.querySelector('#image-provider'), latencyValue: document.querySelector('#latency-value'), costValue: document.querySelector('#cost-value'), transcriptValue: document.querySelector('#transcript-value'), visualPrompt: document.querySelector('#visual-prompt'), palette: document.querySelector('#palette'), cueValue: document.querySelector('#cue-value'), errorSlot: document.querySelector('#error-slot')
};

els.start.addEventListener('click', () => api.setState('LISTENING'));
els.generate.addEventListener('click', () => { audio.start('mechanical'); api.generateWorld(els.prompt.value); });
els.regenerate.addEventListener('click', () => api.generateWorld(els.prompt.value));
els.fallback.addEventListener('click', () => api.fallbackWorld(els.prompt.value));
els.arrival.addEventListener('click', () => api.setState('ARRIVAL'));
els.end.addEventListener('click', () => api.setState('EXIT'));
els.blackout.addEventListener('click', () => { audio.mute(); api.setState('BLACKOUT'); });
els.reset.addEventListener('click', () => { audio.mute(); api.setState('RESET'); });
els.layout.addEventListener('change', () => api.setLayout(els.layout.value));
els.focusOutput.addEventListener('click', () => api.focusOutput());
els.fullscreenOutput.addEventListener('click', () => api.toggleOutputFullscreen());
els.reloadOutput.addEventListener('click', () => api.reloadOutput());
els.listen.addEventListener('click', startSpeechRecognition);

api.onSessionUpdate(renderSession);
api.getSession().then(renderSession);

function renderSession(session) {
  const state = session.state || {};
  const recipe = session.recipe || {};
  els.statePill.textContent = state.label || state.key || 'Idle';
  els.stateValue.textContent = `${state.key || 'IDLE'} - ${state.projection || ''}`;
  els.titleValue.textContent = recipe.title || 'Unknown Dream';
  els.promptProvider.textContent = session.provider?.prompt || 'local';
  els.imageProvider.textContent = session.provider?.image || 'local';
  els.transcriptValue.textContent = session.transcript || 'No prompt yet.';
  els.visualPrompt.textContent = recipe.visual_prompt || 'No world generated yet.';
  els.cueValue.textContent = `${state.ledCue || '-'} / ${state.audioCue || '-'}`;
  els.layout.value = session.layoutMode || 'three-wall';
  const promptMs = session.timings?.promptMs || 0;
  const imageMs = session.timings?.imageMs || 0;
  els.latencyValue.textContent = `${promptMs + imageMs} ms`;
  els.costValue.textContent = `$${Number(session.costEstimateUsd || 0).toFixed(2)}`;
  els.palette.innerHTML = '';
  for (const color of recipe.palette || []) {
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = color;
    swatch.title = color;
    els.palette.appendChild(swatch);
  }
  els.errorSlot.innerHTML = session.error ? `<div class="error">${session.error}</div>` : '';
  if (['PORTAL_OPENING', 'ARRIVAL', 'WORLD_ACTIVE'].includes(state.key)) audio.start(recipe.sound_style || 'dream');
  if (['EXIT', 'RESET', 'BLACKOUT', 'IDLE'].includes(state.key)) audio.mute();
}

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
