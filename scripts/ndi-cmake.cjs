const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const mode = process.argv[2];
const root = path.join(__dirname, '..');
const cmake = findCmake();
const sdkDir = process.env.NDI_SDK_DIR || 'C:\\Program Files\\NDI\\NDI 6 SDK';

if (!['configure', 'build'].includes(mode)) {
  console.error('Usage: node scripts/ndi-cmake.cjs <configure|build>');
  process.exit(2);
}

const missing = [];
if (!cmake) missing.push('CMake was not found.');
if (!fs.existsSync(sdkDir)) missing.push(`NDI_SDK_DIR does not exist: ${sdkDir}`);
if (fs.existsSync(sdkDir)) {
  const includePath = path.join(sdkDir, 'Include', 'Processing.NDI.Lib.h');
  const libPath = path.join(sdkDir, 'Lib', 'x64', 'Processing.NDI.Lib.x64.lib');
  if (!fs.existsSync(includePath)) missing.push(`NDI header not found: ${includePath}`);
  if (!fs.existsSync(libPath)) missing.push(`NDI import library not found: ${libPath}`);
}

if (missing.length) {
  console.error('\nNDI helper build prerequisites are missing:\n');
  for (const item of missing) console.error(`- ${item}`);
  console.error('\nInstall the NDI 6 SDK, then run:');
  console.error('  $env:NDI_SDK_DIR="C:\\Program Files\\NDI\\NDI 6 SDK"');
  console.error('  npm.cmd run ndi:configure');
  console.error('  npm.cmd run ndi:build\n');
  if (cmake) console.error(`Detected CMake: ${cmake}\n`);
  process.exit(1);
}

const args = mode === 'configure'
  ? ['-S', 'native\\ndi-helper', '-B', 'native\\ndi-helper\\build', '-A', 'x64']
  : ['--build', 'native\\ndi-helper\\build', '--config', 'Release'];

console.log(`Using CMake: ${cmake}`);
console.log(`Using NDI_SDK_DIR: ${sdkDir}`);
const result = spawnSync(cmake, args, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NDI_SDK_DIR: sdkDir }
});
process.exit(result.status || 0);

function findCmake() {
  const fromPath = findCommand('cmake');
  if (fromPath) return fromPath;
  return [
    'C:\\Program Files\\CMake\\bin\\cmake.exe',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe'
  ].find((candidate) => fs.existsSync(candidate)) || '';
}

function findCommand(command) {
  const result = spawnSync('where.exe', [command], { encoding: 'utf8' });
  if (result.status !== 0) return '';
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
}
