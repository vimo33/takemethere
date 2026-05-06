const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const HELPER_CANDIDATES = [
  process.env.NDI_HELPER_PATH,
  path.join(__dirname, '../../native/ndi-helper/bin/takemethere-ndi-helper.exe'),
  path.join(__dirname, '../../native/ndi-helper/bin/Release/takemethere-ndi-helper.exe')
].filter(Boolean);
const DEFAULT_HELPER = HELPER_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || HELPER_CANDIDATES[0];

let helperProcess = null;
let feedIndexByName = new Map();
let backpressured = false;
let helperStatus = {
  enabled: false,
  running: false,
  helperPath: DEFAULT_HELPER,
  startedAt: '',
  error: '',
  feeds: []
};

function getStatus() {
  return {
    ...helperStatus,
    helperExists: fs.existsSync(helperStatus.helperPath),
    pid: helperProcess?.pid || null
  };
}

function start(feeds = [], options = {}) {
  const helperPath = options.helperPath || helperStatus.helperPath || DEFAULT_HELPER;
  helperStatus = {
    ...helperStatus,
    enabled: true,
    helperPath,
    feeds: feeds.map((feed) => ({ id: feed.id, name: feed.name, windowTitle: feed.name })),
    error: ''
  };

  if (!fs.existsSync(helperPath)) {
    helperStatus.running = false;
    helperStatus.error = `Native NDI helper not found at ${helperPath}. Build or install the helper described in docs/NDI_NATIVE_HELPER.md.`;
    return getStatus();
  }

  stop();
  const args = [];
  for (const feed of helperStatus.feeds) args.push('--sender', feed.name);
  const child = spawn(helperPath, args, {
    cwd: path.dirname(helperPath),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  child.__intentionalStop = false;
  helperProcess = child;
  feedIndexByName = new Map(helperStatus.feeds.map((feed, idx) => [feed.name, idx]));
  backpressured = false;
  helperStatus.running = true;
  helperStatus.startedAt = new Date().toISOString();

  child.stdin.on('drain', () => {
    if (helperProcess === child) backpressured = false;
  });
  child.stdin.on('error', () => {
    // Ignore EPIPE etc; the 'exit' handler reports any meaningful failure.
  });
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', (chunk) => {
    if (helperProcess !== child) return;
    helperStatus.error = String(chunk).trim().slice(0, 500);
  });

  child.on('exit', (code, signal) => {
    if (helperProcess !== child) return;
    helperStatus.running = false;
    if (child.__intentionalStop) return;
    if (code === 0 || code === null) return;
    helperStatus.error = `NDI helper exited with code ${code}${signal ? ` (signal ${signal})` : ''}.`;
  });
  child.on('error', (error) => {
    if (helperProcess !== child) return;
    helperStatus.running = false;
    helperStatus.error = error.message;
  });
  return getStatus();
}

function stop() {
  if (helperProcess && !helperProcess.killed) {
    helperProcess.__intentionalStop = true;
    try { helperProcess.stdin?.end(); } catch (_err) { /* ignore */ }
    helperProcess.kill();
  }
  helperProcess = null;
  feedIndexByName = new Map();
  backpressured = false;
  helperStatus.running = false;
  return getStatus();
}

function sendFrame(feedName, buffer, width, height) {
  if (!helperProcess || !helperStatus.running) return false;
  const stdin = helperProcess.stdin;
  if (!stdin || stdin.destroyed || !stdin.writable) return false;
  if (backpressured) return false;
  const idx = feedIndexByName.get(feedName);
  if (idx === undefined) return false;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  const stride = width * 4;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(idx, 0);
  header.writeUInt32LE(width, 4);
  header.writeUInt32LE(height, 8);
  header.writeUInt32LE(stride, 12);
  header.writeUInt32LE(buffer.length, 16);
  const okHeader = stdin.write(header);
  const okPayload = stdin.write(buffer);
  if (!okHeader || !okPayload) backpressured = true;
  return true;
}

module.exports = {
  getStatus,
  start,
  stop,
  sendFrame
};
