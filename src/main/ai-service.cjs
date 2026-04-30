const { createFallbackRecipe, normalizeRecipe } = require('./world-recipe.cjs');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const PROMPT_MODEL = process.env.GEMINI_PROMPT_MODEL || 'gemini-2.5-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
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
  const instruction = `You are the hidden world dramaturg for the installation "Take Me There".
Transform the visitor input into strict JSON only. Preserve their intent but make it projection-friendly and public-safe.
Rules: immersive spatial environment, no text/logos, no recognizable people, no copyrighted characters, no sexual content, no gore, no violence, calm slow movement, emphasize material, atmosphere, light, and depth.
Return keys exactly: title, visitor_input, visual_prompt, negative_prompt, mood, palette, motion_style, sound_style, lighting_style, safety_level.
sound_style must be one of: aquatic, cosmic, forest, glass, desert, cathedral, dream, mechanical, strange.
palette must contain 4 CSS hex colors.
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

async function generateImage(recipe) {
  const imageProvider = (process.env.IMAGE_PROVIDER || 'gemini').toLowerCase();

  if (imageProvider === 'openai' && process.env.OPENAI_API_KEY) return generateOpenAiImage(recipe);

  if (!process.env.GEMINI_API_KEY) {
    return { imageDataUrl: createSvgDataUrl(recipe), provider: 'local-svg-fallback', latencyMs: 0, estimatedCostUsd: 0 };
  }

  const started = Date.now();
  const prompt = `${recipe.visual_prompt}\n\nMood: ${recipe.mood}\nPalette: ${recipe.palette.join(', ')}\nGenerate a wide 16:9 immersive environment texture suitable for mapping across front, left, and right walls.`;

  const result = await withTimeout(
    geminiGenerateContent(IMAGE_MODEL, [{ role: 'user', parts: [{ text: prompt }] }]),
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
