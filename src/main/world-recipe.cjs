const BANNED_HINTS = [
  'gore',
  'blood',
  'nude',
  'sex',
  'kill',
  'murder',
  'celebrity',
  'disney',
  'marvel',
  'pokemon',
  'star wars'
];

const SOUND_CATEGORIES = [
  'aquatic',
  'cosmic',
  'forest',
  'glass',
  'desert',
  'cathedral',
  'dream',
  'mechanical',
  'strange'
];

const PALETTES = {
  aquatic: ['#06324a', '#0e7490', '#67e8f9', '#d9f99d'],
  cosmic: ['#080b2f', '#312e81', '#818cf8', '#f8fafc'],
  forest: ['#052e1a', '#166534', '#84cc16', '#fef3c7'],
  glass: ['#0f172a', '#67e8f9', '#e0f2fe', '#c4b5fd'],
  desert: ['#3b2414', '#b45309', '#facc15', '#fef9c3'],
  cathedral: ['#111827', '#7c2d12', '#f59e0b', '#fef3c7'],
  dream: ['#1e1b4b', '#0f766e', '#f0abfc', '#f8fafc'],
  mechanical: ['#020617', '#334155', '#22d3ee', '#f8fafc'],
  strange: ['#09090b', '#365314', '#a3e635', '#e9d5ff']
};

function classifySoundStyle(input) {
  const text = input.toLowerCase();
  if (/(ocean|water|sea|lake|rain|underwater|blue)/.test(text)) return 'aquatic';
  if (/(space|star|cosmic|planet|moon|galaxy)/.test(text)) return 'cosmic';
  if (/(forest|tree|moss|garden|leaf|jungle)/.test(text)) return 'forest';
  if (/(glass|crystal|ice|mirror|transparent)/.test(text)) return 'glass';
  if (/(desert|sand|sun|dune|dry)/.test(text)) return 'desert';
  if (/(cathedral|church|temple|library|hall|palace)/.test(text)) return 'cathedral';
  if (/(machine|robot|metal|factory|engine|portal)/.test(text)) return 'mechanical';
  if (/(weird|strange|surreal|odd|impossible)/.test(text)) return 'strange';
  return 'dream';
}

function titleFromPrompt(input) {
  const cleaned = input
    .replace(/take me to/gi, '')
    .replace(/i want to go to/gi, '')
    .replace(/somewhere/gi, '')
    .replace(/[^\w\s-]/g, '')
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 5);
  if (!words.length) return 'Unknown Dream';
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

function hasUnsafeHint(input) {
  const text = input.toLowerCase();
  return BANNED_HINTS.some((hint) => text.includes(hint));
}

function createFallbackRecipe(visitorInput = 'somewhere calm, blue, and endless') {
  const sound = classifySoundStyle(visitorInput);
  const safetySuffix = hasUnsafeHint(visitorInput)
    ? ' The visitor request was redirected into a public-safe abstract environment without characters, brands, violence, or explicit content.'
    : '';

  const visualPrompt =
    `A seamless immersive panoramic dream environment inspired by: "${visitorInput}". ` +
    'Spatial, atmospheric, architectural, slow, tactile, projection-friendly, high depth, soft haze, ' +
    'subtle material detail, cinematic lighting, no text, no logos, no people, no faces, no copyrighted characters, ' +
    'no gore, no violence, calm movement potential, suitable for a dark room projection installation.' +
    safetySuffix;

  return {
    title: titleFromPrompt(visitorInput),
    visitor_input: visitorInput,
    visual_prompt: visualPrompt,
    negative_prompt: 'text, logos, people, faces, gore, violence, sexual content, copyrighted characters, clutter, low quality, flat composition',
    mood: sound === 'strange' ? 'surreal, quiet, uncanny, public-safe' : 'calm, immersive, luminous',
    palette: PALETTES[sound],
    motion_style: sound === 'aquatic' ? 'gentle water distortion, drifting particles, slow shimmer' : 'slow camera drift, atmospheric fog, floating dust, soft light breathing',
    sound_style: sound,
    lighting_style: `${sound} palette with slow pulses and low brightness`,
    safety_level: 'public_safe'
  };
}

function normalizeRecipe(recipe, visitorInput) {
  const fallback = createFallbackRecipe(visitorInput);
  return {
    ...fallback,
    ...recipe,
    visitor_input: visitorInput || recipe?.visitor_input || fallback.visitor_input,
    palette: Array.isArray(recipe?.palette) && recipe.palette.length >= 3 ? recipe.palette : fallback.palette,
    sound_style: SOUND_CATEGORIES.includes(recipe?.sound_style) ? recipe.sound_style : fallback.sound_style,
    safety_level: 'public_safe'
  };
}

module.exports = { createFallbackRecipe, normalizeRecipe, PALETTES, SOUND_CATEGORIES };
