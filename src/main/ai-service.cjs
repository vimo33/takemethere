const { createFallbackRecipe, normalizeRecipe } = require('./world-recipe.cjs');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const PROMPT_MODEL = process.env.GEMINI_PROMPT_MODEL || 'gemini-2.5-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'imagen-4.0-generate-001';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';
const GENERATION_TIMEOUT_MS = Number(process.env.GENERATION_TIMEOUT_MS || 60000);

function withTimeout(promise, timeoutMs, label) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found in model response');
  return JSON.parse(raw.slice(start, end + 1));
}

async function geminiGenerateContent(model, contents, generationConfig = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured');

  const response = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini ${model} failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function expandPrompt(visitorInput) {
  if (!process.env.GEMINI_API_KEY) {
    return { recipe: createFallbackRecipe(visitorInput), provider: 'local-fallback', latencyMs: 0 };
  }

  const started = Date.now();
  const instruction = `You are the world-builder for the installation "Take Me There". A visitor has described a world they want to be transported to. Your job is to make that world as literal and vivid as possible.

CRITICAL RULE: Keep every specific creature, place, material, and phenomenon the visitor mentioned. If they said "glowing birds", there must be glowing birds — not abstract light streaks. If they said "underwater", it must look like being underwater. Never replace literal elements with abstract equivalents. Never sanitize away the things that make their world unique.

Safety rules only (no exceptions): no recognizable real people, no copyrighted characters, no sexual content, no gore, no violence, no text or logos.

The visual_prompt MUST be a single dense paragraph of 80-120 words describing a PANORAMIC EYE-LEVEL VIEW — as if a person is standing inside this world looking straight ahead. The horizon must be at eye level. The scene extends left and right as one continuous environment. Structure it as:
- FOREGROUND: textured ground/floor elements close to the viewer (left AND right sides)
- MIDGROUND: the main environment with the visitor's specific creatures/elements visible across the full width
- BACKGROUND: vast horizon, sky, distant structures or terrain
- LIGHTING: exact light sources — from above or from the horizon
- ATMOSPHERE: particles floating in the air throughout the scene

NEVER describe a top-down, aerial, or macro close-up view. This must read as if you are STANDING INSIDE the world, looking at the horizon.

Return JSON with keys: title, visitor_input, visual_prompt, negative_prompt, mood, palette, motion_style, sound_style, lighting_style, safety_level.
sound_style must be one of: aquatic, cosmic, forest, glass, desert, cathedral, dream, mechanical, strange.
palette must contain 4 CSS hex colors that match the literal world described.
Visitor input: "${visitorInput}"`;

  const result = await withTimeout(
    geminiGenerateContent(PROMPT_MODEL, [{ role: 'user', parts: [{ text: instruction }] }], { responseMimeType: 'application/json' }),
    15000,
    'Prompt expansion'
  );

  const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '{}';
  const recipe = normalizeRecipe(extractJson(text), visitorInput);
  return { recipe, provider: PROMPT_MODEL, latencyMs: Date.now() - started };
}

async function generateImagenImage(recipe) {
  const key = process.env.GEMINI_API_KEY;
  const started = Date.now();
  const prompt = `${recipe.visual_prompt}

Mood: ${recipe.mood}. Colors: ${recipe.palette.join(', ')}.

Style: photorealistic cinematic photography. Shot on RED camera with anamorphic lens. Perfect exposure, physically accurate lighting, subsurface scattering on organic surfaces, volumetric god rays, bokeh depth of field. Every texture ultra-sharp and tangible. This image will be projected floor-to-ceiling across three walls surrounding a person — it must be indistinguishable from reality.

Requirements: deep blacks, vivid saturated light sources, visible atmospheric particles (bubbles/spores/mist/embers), strong foreground-midground-background depth layers, no people, no text, no logos.`;

  const response = await fetch(`${GEMINI_BASE}/models/${IMAGE_MODEL}:predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { numberOfImages: 1, aspectRatio: '16:9', personGeneration: 'dont_allow' }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Imagen failed: ${response.status} ${body}`);
  }

  const json = await response.json();
  const prediction = json.predictions?.[0];
  const b64 = prediction?.bytesBase64Encoded;
  const mime = prediction?.mimeType || 'image/png';
  if (!b64) throw new Error(`Imagen did not return image data. Keys: ${JSON.stringify(Object.keys(json))}`);

  return {
    imageDataUrl: `data:${mime};base64,${b64}`,
    provider: IMAGE_MODEL,
    latencyMs: Date.now() - started,
    estimatedCostUsd: 0.04
  };
}

async function generateImage(recipe) {
  const imageProvider = (process.env.IMAGE_PROVIDER || 'gemini').toLowerCase();

  if (imageProvider === 'openai' && process.env.OPENAI_API_KEY) return generateOpenAiImage(recipe);

  if (!process.env.GEMINI_API_KEY) {
    return { imageDataUrl: createSvgDataUrl(recipe), provider: 'local-svg-fallback', latencyMs: 0, estimatedCostUsd: 0 };
  }

  if (IMAGE_MODEL.startsWith('imagen-')) return generateImagenImage(recipe);

  const started = Date.now();
  const prompt = `${recipe.visual_prompt}

Mood: ${recipe.mood}
Dominant colors: ${recipe.palette.join(', ')}

Style: ultra-detailed concept art for a live immersive projection installation. This image will be projected floor-to-ceiling across three walls surrounding a person — it must feel like they have been physically transported to another world.

CRITICAL COMPOSITION RULES — this image will be split across three physical projection walls surrounding a standing person:
- CAMERA: eye-level, standing height, looking straight at the horizon. NOT aerial. NOT top-down. NOT macro close-up.
- HORIZON: clearly visible, at the vertical center of the image, with sky above and ground below
- PANORAMIC: the left edge, center, and right edge must all show different parts of the SAME continuous environment — like a 180° wide-angle photograph taken from one spot
- DEPTH: strong layering — textured ground in the foreground, environment in midground, vast distance in background
- SCALE: towering structures, huge geological forms, or enormous organic growth that make the viewer feel small
- LIGHT: dramatic light sources — sun/moon on the horizon, volumetric rays, glowing elements, deep shadows
- ATMOSPHERE: visible particles throughout — floating spores, mist, embers, bubbles, bioluminescent drift
- DETAIL: every surface rich with texture — no empty voids, no blank sky, no plain flat ground
- No people, no text, no logos
- Photorealistic, cinematic, 16:9`;

  const result = await withTimeout(
    geminiGenerateContent(IMAGE_MODEL, [{ role: 'user', parts: [{ text: prompt }] }], { responseModalities: ['Image'] }),
    GENERATION_TIMEOUT_MS,
    'Image generation'
  );

  const parts = result.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const inline = imagePart?.inlineData || imagePart?.inline_data;
  if (!inline?.data) throw new Error('Image model did not return inline image data');

  return {
    imageDataUrl: `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`,
    provider: IMAGE_MODEL,
    latencyMs: Date.now() - started,
    estimatedCostUsd: 0.1
  };
}

async function generateOpenAiImage(recipe) {
  const started = Date.now();
  const prompt = `${recipe.visual_prompt}\n\nMood: ${recipe.mood}\nPalette: ${recipe.palette.join(', ')}\nCreate a wide immersive environment image for projection mapping. No text, no logos, no people.`;

  const response = await withTimeout(
    fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, size: '1536x1024', quality: 'medium', response_format: 'b64_json' })
    }),
    GENERATION_TIMEOUT_MS,
    'OpenAI image generation'
  );

  if (!response.ok) throw new Error(`OpenAI image generation failed: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const image = json.data?.[0]?.b64_json;
  if (!image) throw new Error('OpenAI image model did not return b64_json image data');

  return { imageDataUrl: `data:image/png;base64,${image}`, provider: OPENAI_IMAGE_MODEL, latencyMs: Date.now() - started, estimatedCostUsd: 0.05 };
}

function createSvgDataUrl(recipe) {
  const palette = recipe.palette || ['#050816', '#0f766e', '#67e8f9', '#f8fafc'];
  const title = escapeXml(recipe.title || 'Fallback World');
  const mood = escapeXml(recipe.mood || 'calm immersive luminous');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><radialGradient id="g" cx="50%" cy="42%" r="75%"><stop offset="0%" stop-color="${palette[2]}" stop-opacity="0.95"/><stop offset="42%" stop-color="${palette[1]}" stop-opacity="0.75"/><stop offset="100%" stop-color="${palette[0]}" stop-opacity="1"/></radialGradient><filter id="blur"><feGaussianBlur stdDeviation="24"/></filter></defs><rect width="1920" height="1080" fill="url(#g)"/><g opacity="0.34" filter="url(#blur)"><circle cx="340" cy="240" r="180" fill="${palette[3]}"/><circle cx="1510" cy="330" r="240" fill="${palette[2]}"/><circle cx="980" cy="780" r="260" fill="${palette[1]}"/></g><g opacity="0.22" stroke="${palette[3]}" stroke-width="2" fill="none">${Array.from({ length: 20 }, (_, i) => `<path d="M ${i * 105 - 80} 1040 C ${460 + i * 12} ${760 - i * 11}, ${920 - i * 9} ${460 + i * 8}, ${2020 - i * 82} 120"/>`).join('')}</g><g opacity="0.28">${Array.from({ length: 90 }, (_, i) => `<circle cx="${(i * 137) % 1920}" cy="${(i * 251) % 1080}" r="${2 + (i % 8)}" fill="${palette[i % palette.length]}"/>`).join('')}</g><text x="80" y="930" fill="${palette[3]}" font-family="Arial, sans-serif" font-size="44" opacity="0.4">${title}</text><text x="80" y="986" fill="${palette[3]}" font-family="Arial, sans-serif" font-size="22" opacity="0.26">${mood}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]);
}

module.exports = { expandPrompt, generateImage, createSvgDataUrl };
