const required = ['package.json', 'src/main/main.js', 'src/renderer/output.js', 'src/renderer/operator.js'];

let failed = false;
for (const file of required) {
  try {
    require('node:fs').accessSync(file);
    console.log(`ok ${file}`);
  } catch {
    console.error(`missing ${file}`);
    failed = true;
  }
}

console.log(process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY present' : 'GEMINI_API_KEY not set; app will use local fallbacks');
process.exit(failed ? 1 : 0);
