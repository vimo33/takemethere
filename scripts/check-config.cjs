const required = ['package.json', 'src/main/main.js', 'src/renderer/output.js', 'src/renderer/operator.js'];
const fs = require('node:fs');

if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

let failed = false;
for (const file of required) {
  try {
    fs.accessSync(file);
    console.log(`ok ${file}`);
  } catch {
    console.error(`missing ${file}`);
    failed = true;
  }
}

const imageProvider = (process.env.IMAGE_PROVIDER || 'gemini').toLowerCase();
console.log(process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY present' : 'GEMINI_API_KEY not set; prompt expansion will use local fallbacks');
console.log(`IMAGE_PROVIDER ${imageProvider}`);
if (imageProvider === 'openai') {
  console.log(process.env.OPENAI_API_KEY ? `OPENAI_API_KEY present; model ${process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'}` : 'OPENAI_API_KEY not set; image generation will fall back');
  console.log(`OpenAI image size ${process.env.OPENAI_IMAGE_SIZE || '1536x1024'}`);
} else {
  console.log(process.env.GEMINI_API_KEY ? `Gemini image model ${process.env.GEMINI_IMAGE_MODEL || 'imagen-4.0-generate-001'}` : 'GEMINI_API_KEY not set; image generation will fall back');
}
console.log(`WORLD_IMAGE_MODE ${process.env.WORLD_IMAGE_MODE || 'projection'}`);
process.exit(failed ? 1 : 0);
