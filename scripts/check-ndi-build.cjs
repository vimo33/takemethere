const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const sdkDir = process.env.NDI_SDK_DIR || 'C:\\Program Files\\NDI\\NDI 6 SDK';
const cmake = findCmake();
const missing = [];

if (!cmake) missing.push('CMake is not available on PATH.');
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
  console.error('\nInstall CMake and the NDI 6 SDK, then run:');
  console.error('  $env:NDI_SDK_DIR="C:\\Program Files\\NDI\\NDI 6 SDK"');
  console.error('  npm.cmd run ndi:configure');
  console.error('  npm.cmd run ndi:build\n');
  process.exit(1);
}

console.log(`ok CMake: ${cmake}`);
console.log(`ok NDI_SDK_DIR: ${sdkDir}`);

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
