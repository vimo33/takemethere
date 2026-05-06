const dgram = require('node:dgram');

const DEFAULT_HOST = process.env.MADMAPPER_HOST || '127.0.0.1';
const DEFAULT_OSC_PORT = Number(process.env.MADMAPPER_OSC_PORT || 8010);
const DEFAULT_QUERY_PORT = Number(process.env.MADMAPPER_OSCQUERY_PORT || 8010);

const config = {
  host: DEFAULT_HOST,
  oscPort: DEFAULT_OSC_PORT,
  queryPort: DEFAULT_QUERY_PORT
};

async function discover(overrides = {}) {
  updateConfig(overrides);
  const root = await query('/');
  const groups = Object.keys(root.CONTENTS || {});
  const [master, outputs, surfaces, media, timelines] = await Promise.all([
    safeQuery('/master'),
    safeQuery('/outputs'),
    safeQuery('/surfaces'),
    safeQuery('/media'),
    safeQuery('/timelines')
  ]);

  return {
    connected: true,
    host: config.host,
    oscPort: config.oscPort,
    queryPort: config.queryPort,
    queryUrl: getQueryUrl('/'),
    groups,
    master: summarizeChildren(master),
    outputs: summarizeChildren(outputs),
    surfaces: summarizeChildren(surfaces),
    media: summarizeChildren(media),
    timelines: summarizeChildren(timelines),
    useful: await getUsefulValues()
  };
}

async function getValue(path, overrides = {}) {
  updateConfig(overrides);
  const node = await query(path);
  return {
    path,
    type: node.TYPE || '',
    access: node.ACCESS,
    description: node.DESCRIPTION || '',
    value: Array.isArray(node.VALUE) ? node.VALUE : [],
    range: node.RANGE || []
  };
}

async function send(path, value, overrides = {}) {
  updateConfig(overrides);
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const message = encodeOscMessage(path, values);
  await sendUdp(message);
  return { ok: true, path, values, host: config.host, port: config.oscPort };
}

async function trigger(path, overrides = {}) {
  return send(path, [], overrides);
}

function updateConfig(overrides = {}) {
  if (typeof overrides.host === 'string' && overrides.host.trim()) config.host = overrides.host.trim();
  if (Number.isFinite(Number(overrides.oscPort))) config.oscPort = Number(overrides.oscPort);
  if (Number.isFinite(Number(overrides.queryPort))) config.queryPort = Number(overrides.queryPort);
}

async function getUsefulValues() {
  const paths = [
    '/master/test_pattern',
    '/master/master_video_level',
    '/master/freeze_video_output',
    '/outputs/Video-Output-1/enabled',
    '/surfaces/Quad-1/opacity',
    '/surfaces/Quad-2/opacity',
    '/surfaces/Quad-3/opacity',
    '/surfaces/Quad-1/visual/name',
    '/surfaces/Quad-2/visual/name',
    '/surfaces/Quad-3/visual/name'
  ];
  const values = {};
  for (const path of paths) {
    try {
      values[path] = await getValue(path);
    } catch {
      values[path] = null;
    }
  }
  return values;
}

async function safeQuery(path) {
  try {
    return await query(path);
  } catch {
    return null;
  }
}

async function query(path) {
  const response = await fetch(getQueryUrl(path), { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error(`MadMapper OSCQuery ${path} failed: ${response.status}`);
  return response.json();
}

function getQueryUrl(path) {
  const normalizedPath = path === '/' ? '/?' : path;
  return `http://${config.host}:${config.queryPort}${normalizedPath}`;
}

function summarizeChildren(node) {
  if (!node?.CONTENTS) return [];
  return Object.entries(node.CONTENTS).map(([name, child]) => ({
    name,
    path: child.FULL_PATH || `${node.FULL_PATH || ''}/${name}`.replace(/\/+/g, '/'),
    description: child.DESCRIPTION || '',
    type: child.TYPE || '',
    access: child.ACCESS,
    hasChildren: Boolean(child.CONTENTS)
  }));
}

function sendUdp(buffer) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', (error) => {
      socket.close();
      reject(error);
    });
    socket.send(buffer, config.oscPort, config.host, (error) => {
      socket.close();
      if (error) reject(error);
      else resolve();
    });
  });
}

function encodeOscMessage(address, values = []) {
  if (!address?.startsWith('/')) throw new Error(`Invalid OSC address: ${address}`);
  const tags = `,${values.map(getOscType).join('')}`;
  const chunks = [encodeOscString(address), encodeOscString(tags)];
  for (const value of values) chunks.push(encodeOscValue(value));
  return Buffer.concat(chunks);
}

function getOscType(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? 'i' : 'f';
  if (typeof value === 'boolean') return 'i';
  return 's';
}

function encodeOscValue(value) {
  if (typeof value === 'boolean') return encodeInt(value ? 1 : 0);
  if (typeof value === 'number') return Number.isInteger(value) ? encodeInt(value) : encodeFloat(value);
  return encodeOscString(String(value));
}

function encodeInt(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}

function encodeFloat(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatBE(value);
  return buffer;
}

function encodeOscString(value) {
  const raw = Buffer.from(`${value}\0`, 'utf8');
  const padding = (4 - (raw.length % 4)) % 4;
  return padding ? Buffer.concat([raw, Buffer.alloc(padding)]) : raw;
}

module.exports = {
  discover,
  getValue,
  send,
  trigger
};
