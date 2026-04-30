const STATES = {
  IDLE: {
    key: 'IDLE',
    label: 'Idle',
    projection: 'dim holding atmosphere',
    ledCue: 'portal_breathing',
    audioCue: 'idle_hum',
    timeoutMs: null,
    fallback: null
  },
  LISTENING: {
    key: 'LISTENING',
    label: 'Listening',
    projection: 'subtle listening pulse',
    ledCue: 'voice_reactive_pulse',
    audioCue: 'listening_air',
    timeoutMs: 25000,
    fallback: 'operator_manual_prompt'
  },
  UNDERSTANDING: {
    key: 'UNDERSTANDING',
    label: 'Understanding',
    projection: 'low particle activity',
    ledCue: 'data_forward',
    audioCue: 'processing_tone',
    timeoutMs: 15000,
    fallback: 'default_recipe_template'
  },
  GENERATING: {
    key: 'GENERATING',
    label: 'Generating',
    projection: 'portal charge',
    ledCue: 'generating_wave',
    audioCue: 'generation_swell',
    timeoutMs: 60000,
    fallback: 'curated_fallback_world'
  },
  PORTAL_OPENING: {
    key: 'PORTAL_OPENING',
    label: 'Portal Opening',
    projection: 'first reveal',
    ledCue: 'directional_opening',
    audioCue: 'portal_open',
    timeoutMs: 8000,
    fallback: null
  },
  ARRIVAL: {
    key: 'ARRIVAL',
    label: 'Arrival',
    projection: 'world fade in',
    ledCue: 'palette_spread',
    audioCue: 'arrival_bloom',
    timeoutMs: 8000,
    fallback: null
  },
  WORLD_ACTIVE: {
    key: 'WORLD_ACTIVE',
    label: 'World Active',
    projection: 'procedural world breathing',
    ledCue: 'world_ambient',
    audioCue: 'world_bed',
    timeoutMs: 90000,
    fallback: null
  },
  EXIT: {
    key: 'EXIT',
    label: 'Exit',
    projection: 'fade to portal',
    ledCue: 'exit_path',
    audioCue: 'exit_chime',
    timeoutMs: 12000,
    fallback: null
  },
  RESET: {
    key: 'RESET',
    label: 'Reset',
    projection: 'clear session',
    ledCue: 'reset_clear',
    audioCue: 'fade_out',
    timeoutMs: 3000,
    fallback: null
  },
  ERROR_FALLBACK: {
    key: 'ERROR_FALLBACK',
    label: 'Fallback',
    projection: 'curated fallback world',
    ledCue: 'fallback_safe',
    audioCue: 'fallback_bed',
    timeoutMs: null,
    fallback: 'operator_reset'
  },
  BLACKOUT: {
    key: 'BLACKOUT',
    label: 'Blackout',
    projection: 'black',
    ledCue: 'blackout',
    audioCue: 'mute',
    timeoutMs: null,
    fallback: 'operator_reset'
  }
};

const DEFAULT_STATE = STATES.IDLE;

function getState(key) {
  return STATES[key] || DEFAULT_STATE;
}

module.exports = { STATES, DEFAULT_STATE, getState };
