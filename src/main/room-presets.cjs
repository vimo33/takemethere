const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_SETUP_STATE, PROJECTOR_FEEDS, HELPER_FEEDS, normalizeResolution } = require('./output-bus.cjs');

const PRESET_VERSION = 3;
const PRESET_DIR = path.join(__dirname, '../../room-presets');

function ensurePresetDir() {
  if (!fs.existsSync(PRESET_DIR)) fs.mkdirSync(PRESET_DIR, { recursive: true });
}

function listPresets() {
  ensurePresetDir();
  const files = fs.readdirSync(PRESET_DIR).filter((file) => file.endsWith('.json'));
  return files.map((file) => {
    const preset = readPresetFile(path.join(PRESET_DIR, file));
    return {
      id: path.basename(file, '.json'),
      name: preset.name || path.basename(file, '.json'),
      updatedAt: preset.updatedAt || '',
      layoutMode: preset.layoutMode || 'three-wall',
      transport: 'ndi',
      roomType: preset.room?.type || 'three-wall'
    };
  });
}

function loadPreset(id) {
  ensurePresetDir();
  const presetPath = path.join(PRESET_DIR, `${safeId(id)}.json`);
  if (!fs.existsSync(presetPath)) throw new Error(`Room preset not found: ${id}`);
  return normalizePreset(readPresetFile(presetPath));
}

function savePreset(preset) {
  ensurePresetDir();
  const normalized = normalizePreset({
    ...preset,
    id: preset.id || slugify(preset.name || 'room-preset'),
    updatedAt: new Date().toISOString()
  });
  fs.writeFileSync(path.join(PRESET_DIR, `${safeId(normalized.id)}.json`), `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

function createDefaultPreset() {
  return normalizePreset({
    id: 'studio-3-wall',
    name: 'Studio 3 Wall',
    layoutMode: 'three-wall',
    projectorConfig: { leftYaw: 69, frontYaw: 0, rightYaw: -69, fov: 78, ceilingPitch: 64, ceilingFov: 82 },
    setup: DEFAULT_SETUP_STATE,
    room: createDefaultRoom('three-wall')
  });
}

function createPresetForLayout(layoutType = 'three-wall') {
  const room = createDefaultRoom(layoutType);
  return normalizePreset({
    id: `studio-${layoutType}`,
    name: room.name,
    layoutMode: layoutType === 'ceiling' || layoutType === 'four-view-ceiling' ? 'ceiling' : 'three-wall',
    projectorConfig: projectorConfigFromRoom(room),
    setup: DEFAULT_SETUP_STATE,
    room
  });
}

function normalizePreset(preset = {}) {
  return {
    version: PRESET_VERSION,
    id: safeId(preset.id || slugify(preset.name || 'room-preset')),
    name: preset.name || 'Room Preset',
    updatedAt: preset.updatedAt || new Date().toISOString(),
    layoutMode: preset.layoutMode === 'ceiling' ? 'ceiling' : 'three-wall',
    projectorConfig: {
      leftYaw: Number(preset.projectorConfig?.leftYaw ?? 69),
      frontYaw: Number(preset.projectorConfig?.frontYaw ?? 0),
      rightYaw: Number(preset.projectorConfig?.rightYaw ?? -69),
      fov: Number(preset.projectorConfig?.fov ?? 78),
      ceilingPitch: Number(preset.projectorConfig?.ceilingPitch ?? 64),
      ceilingFov: Number(preset.projectorConfig?.ceilingFov ?? 82)
    },
    setup: {
      ...DEFAULT_SETUP_STATE,
      ...(preset.setup || {}),
      madMapper: {
        ...DEFAULT_SETUP_STATE.madMapper,
        ...(preset.setup?.madMapper || {}),
        cues: {
          ...DEFAULT_SETUP_STATE.madMapper.cues,
          ...(preset.setup?.madMapper?.cues || {})
        }
      }
    },
    outputs: normalizeOutputs(preset.outputs),
    room: normalizeRoom(preset.room || createDefaultRoom(preset.layoutMode || 'three-wall'))
  };
}

function createDefaultRoom(layoutType = 'three-wall') {
  const presets = {
    'three-wall': {
      name: 'Studio 3 Wall',
      dimensions: { width: 5.4, depth: 4.2, height: 2.7 },
      projectors: [
        projector('left', 'Left projector', 'TakeMeThere_LEFT', 'Quad-1', -2.1, 1.55, 1.8, 69, 0, 78),
        projector('front', 'Front projector', 'TakeMeThere_FRONT', 'Quad-2', 0, 1.7, 1.8, 0, 0, 78),
        projector('right', 'Right projector', 'TakeMeThere_RIGHT', 'Quad-3', 2.1, 1.55, 1.8, -69, 0, 78)
      ],
      seamZones: [
        { id: 'left-front', label: 'Left / Front seam', x: -2.7, z: -1.75, width: 0.08 },
        { id: 'front-right', label: 'Front / Right seam', x: 2.7, z: -1.75, width: 0.08 }
      ]
    },
    'four-view-ceiling': {
      name: '4 View Ceiling',
      dimensions: { width: 5.4, depth: 4.2, height: 2.7 },
      projectors: [
        projector('left', 'Left projector', 'TakeMeThere_LEFT', 'Quad-1', -2.1, 1.55, 1.8, 69, 0, 78),
        projector('front', 'Front projector', 'TakeMeThere_FRONT', 'Quad-2', 0, 1.7, 1.8, 0, 0, 78),
        projector('right', 'Right projector', 'TakeMeThere_RIGHT', 'Quad-3', 2.1, 1.55, 1.8, -69, 0, 78),
        projector('ceiling', 'Ceiling camera', 'TakeMeThere_CEILING', 'Quad-4', 0, 0.2, 2.45, 0, 64, 82)
      ],
      seamZones: [
        { id: 'left-front', label: 'Left / Front seam', x: -2.7, z: -1.75, width: 0.08 },
        { id: 'front-right', label: 'Front / Right seam', x: 2.7, z: -1.75, width: 0.08 },
        { id: 'ceiling-front', label: 'Ceiling / Front seam', x: 0, z: -2.1, width: 0.08 }
      ]
    },
    '180-degree': {
      name: '180 Degree Curve',
      dimensions: { width: 6.2, depth: 3.6, height: 2.7 },
      projectors: [
        projector('left', 'Left projector', 'TakeMeThere_LEFT', 'Quad-1', -2.2, 1.45, 1.85, 52, 0, 72),
        projector('front', 'Front projector', 'TakeMeThere_FRONT', 'Quad-2', 0, 1.55, 1.85, 0, 0, 72),
        projector('right', 'Right projector', 'TakeMeThere_RIGHT', 'Quad-3', 2.2, 1.45, 1.85, -52, 0, 72)
      ],
      seamZones: [
        { id: 'left-front', label: 'Left / Front seam', x: -2.1, z: -1.65, width: 0.1 },
        { id: 'front-right', label: 'Front / Right seam', x: 2.1, z: -1.65, width: 0.1 }
      ]
    },
    '270-degree': {
      name: '270 Degree Wrap',
      dimensions: { width: 5.8, depth: 5.2, height: 2.7 },
      projectors: [
        projector('left', 'Left projector', 'TakeMeThere_LEFT', 'Quad-1', -2.3, 1.85, 1.9, 92, 0, 82),
        projector('front', 'Front projector', 'TakeMeThere_FRONT', 'Quad-2', 0, 1.95, 1.9, 0, 0, 82),
        projector('right', 'Right projector', 'TakeMeThere_RIGHT', 'Quad-3', 2.3, 1.85, 1.9, -92, 0, 82)
      ],
      seamZones: [
        { id: 'left-front', label: 'Left / Front seam', x: -2.9, z: -2.3, width: 0.09 },
        { id: 'front-right', label: 'Front / Right seam', x: 2.9, z: -2.3, width: 0.09 }
      ]
    }
  };
  const base = presets[layoutType] || presets['three-wall'];
  return normalizeRoom({
    type: layoutType,
    name: base.name,
    dimensions: base.dimensions,
    visitor: { x: 0, y: 0, z: 0 },
    projectors: base.projectors,
    cameras: [
      { id: 'operator', label: 'Operator camera', x: 0, y: 1.6, z: 3.1, yaw: 180, pitch: -4, fov: 55 }
    ],
    seamZones: base.seamZones,
    scan: { meshPath: '', meshFileUrl: '', visible: false }
  });
}

function normalizeRoom(room = {}) {
  const dimensions = room.dimensions || {};
  return {
    type: room.type || 'three-wall',
    name: room.name || 'Studio 3 Wall',
    dimensions: {
      width: number(dimensions.width, 5.4),
      depth: number(dimensions.depth, 4.2),
      height: number(dimensions.height, 2.7)
    },
    visitor: normalizePoint(room.visitor, { x: 0, y: 0, z: 0 }),
    projectors: Array.isArray(room.projectors) && room.projectors.length ? room.projectors.map(normalizeProjector) : createDefaultRoom('three-wall').projectors,
    cameras: Array.isArray(room.cameras) ? room.cameras.map(normalizeCamera) : [],
    seamZones: Array.isArray(room.seamZones) ? room.seamZones.map(normalizeSeam) : [],
    scan: {
      meshPath: room.scan?.meshPath || '',
      meshFileUrl: room.scan?.meshFileUrl || '',
      visible: Boolean(room.scan?.visible)
    }
  };
}

function normalizeOutputs(outputs) {
  if (Array.isArray(outputs) && outputs.length) return outputs.map((output) => ({
    id: output.id || output.name,
    name: output.name || output.id,
    role: output.role || 'projector',
    feedName: output.feedName || output.name || output.id,
    surface: output.surface || '',
    transport: output.transport || 'ndi',
    orientation: output.orientation || 'landscape',
    resolution: normalizeResolution(output.resolution, output.orientation || 'landscape')
  }));
  return [...PROJECTOR_FEEDS, ...HELPER_FEEDS].map((feed) => ({
    id: feed.id,
    name: feed.name,
    role: feed.role,
    feedName: feed.name,
    surface: feed.surface || '',
    transport: DEFAULT_SETUP_STATE.transport,
    orientation: feed.orientation || 'landscape',
    resolution: normalizeResolution(feed.resolution, feed.orientation || 'landscape')
  }));
}

function projector(id, label, feedName, surface, x, y, z, yaw, pitch, fov) {
  return {
    id,
    label,
    enabled: true,
    feedName,
    surface,
    orientation: 'landscape',
    resolution: normalizeResolution(),
    x,
    y,
    z,
    yaw,
    pitch,
    roll: 0,
    fov
  };
}

function normalizeProjector(projectorConfig = {}) {
  const orientation = projectorConfig.orientation === 'portrait' ? 'portrait' : 'landscape';
  return {
    id: projectorConfig.id || 'projector',
    label: projectorConfig.label || projectorConfig.id || 'Projector',
    enabled: projectorConfig.enabled !== false,
    feedName: projectorConfig.feedName || '',
    surface: projectorConfig.surface || '',
    orientation,
    resolution: normalizeResolution(projectorConfig.resolution, orientation),
    x: number(projectorConfig.x, 0),
    y: number(projectorConfig.y, 1.8),
    z: number(projectorConfig.z, 1.5),
    yaw: number(projectorConfig.yaw, 0),
    pitch: number(projectorConfig.pitch, 0),
    roll: number(projectorConfig.roll, 0),
    fov: number(projectorConfig.fov, 78)
  };
}

function normalizeCamera(camera = {}) {
  return {
    id: camera.id || 'camera',
    label: camera.label || camera.id || 'Camera',
    x: number(camera.x, 0),
    y: number(camera.y, 1.6),
    z: number(camera.z, 3),
    yaw: number(camera.yaw, 180),
    pitch: number(camera.pitch, -4),
    fov: number(camera.fov, 55)
  };
}

function normalizeSeam(seam = {}) {
  return {
    id: seam.id || 'seam',
    label: seam.label || seam.id || 'Seam',
    x: number(seam.x, 0),
    z: number(seam.z, -1.8),
    width: number(seam.width, 0.08)
  };
}

function normalizePoint(point = {}, fallback) {
  return {
    x: number(point.x, fallback.x),
    y: number(point.y, fallback.y),
    z: number(point.z, fallback.z)
  };
}

function projectorConfigFromRoom(room) {
  const byId = Object.fromEntries((room.projectors || []).map((item) => [item.id, item]));
  return {
    leftYaw: number(byId.left?.yaw, 69),
    frontYaw: number(byId.front?.yaw, 0),
    rightYaw: number(byId.right?.yaw, -69),
    fov: number(byId.front?.fov ?? byId.left?.fov, 78),
    ceilingPitch: number(byId.ceiling?.pitch, 64),
    ceilingFov: number(byId.ceiling?.fov, 82)
  };
}

function number(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function readPresetFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'room-preset';
}

function safeId(value) {
  return slugify(value);
}

module.exports = {
  listPresets,
  loadPreset,
  savePreset,
  createDefaultPreset,
  createPresetForLayout,
  createDefaultRoom,
  normalizeRoom,
  projectorConfigFromRoom
};
