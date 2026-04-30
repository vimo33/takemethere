const SOUND_PRESETS = {
  aquatic: { base: 110, mod: 0.06, color: 720 },
  cosmic: { base: 72, mod: 0.025, color: 1120 },
  forest: { base: 165, mod: 0.04, color: 840 },
  glass: { base: 330, mod: 0.03, color: 1800 },
  desert: { base: 96, mod: 0.018, color: 540 },
  cathedral: { base: 88, mod: 0.02, color: 920 },
  dream: { base: 132, mod: 0.028, color: 1240 },
  mechanical: { base: 56, mod: 0.075, color: 680 },
  strange: { base: 145, mod: 0.022, color: 980 }
};

export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.nodes = [];
    this.enabled = false;
  }

  async start(presetName = 'dream') {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
    }

    await this.context.resume();
    this.enabled = true;
    this.setPreset(presetName);
    this.fadeTo(0.22, 1.4);
  }

  setPreset(presetName = 'dream') {
    if (!this.context || !this.master) return;
    this.stopNodes();

    const preset = SOUND_PRESETS[presetName] || SOUND_PRESETS.dream;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = preset.color;
    filter.Q.value = 0.7;
    filter.connect(this.master);

    const primary = this.context.createOscillator();
    primary.type = 'sine';
    primary.frequency.value = preset.base;

    const secondary = this.context.createOscillator();
    secondary.type = 'triangle';
    secondary.frequency.value = preset.base * 1.505;

    const lfo = this.context.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = preset.mod;

    const lfoGain = this.context.createGain();
    lfoGain.gain.value = preset.base * 0.18;
    lfo.connect(lfoGain);
    lfoGain.connect(primary.frequency);

    const primaryGain = this.context.createGain();
    primaryGain.gain.value = 0.18;
    const secondaryGain = this.context.createGain();
    secondaryGain.gain.value = 0.055;

    primary.connect(primaryGain);
    secondary.connect(secondaryGain);
    primaryGain.connect(filter);
    secondaryGain.connect(filter);

    primary.start();
    secondary.start();
    lfo.start();

    this.nodes = [primary, secondary, lfo, primaryGain, secondaryGain, lfoGain, filter];
  }

  fadeTo(value, seconds = 0.8) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(value, now, Math.max(0.05, seconds / 4));
  }

  mute() {
    this.fadeTo(0, 0.35);
  }

  stopNodes() {
    for (const node of this.nodes) {
      if (typeof node.stop === 'function') {
        try {
          node.stop();
        } catch {
          // Oscillator already stopped.
        }
      }
      if (typeof node.disconnect === 'function') {
        try {
          node.disconnect();
        } catch {
          // Node already disconnected.
        }
      }
    }
    this.nodes = [];
  }
}
