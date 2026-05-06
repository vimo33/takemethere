const DEFAULT_PROJECTOR_RESOLUTION = { width: 1920, height: 1080 };

const PROJECTOR_FEEDS = [
  { id: 'left', name: 'TakeMeThere_LEFT', label: 'Left', role: 'projector', view: 'left', surface: 'Quad-1', orientation: 'landscape', resolution: DEFAULT_PROJECTOR_RESOLUTION },
  { id: 'front', name: 'TakeMeThere_FRONT', label: 'Front', role: 'projector', view: 'front', surface: 'Quad-2', orientation: 'landscape', resolution: DEFAULT_PROJECTOR_RESOLUTION },
  { id: 'right', name: 'TakeMeThere_RIGHT', label: 'Right', role: 'projector', view: 'right', surface: 'Quad-3', orientation: 'landscape', resolution: DEFAULT_PROJECTOR_RESOLUTION }
];

const HELPER_FEEDS = [
  { id: 'depth', name: 'TakeMeThere_DEPTH', label: 'Depth', role: 'helper', feed: 'depth' },
  { id: 'foreground', name: 'TakeMeThere_FOREGROUND', label: 'Foreground', role: 'helper', feed: 'foreground' },
  { id: 'atmosphere', name: 'TakeMeThere_ATMOSPHERE', label: 'Atmosphere', role: 'helper', feed: 'atmosphere' }
];

const DEFAULT_SETUP_STATE = {
  transport: 'ndi',
  testPattern: 'world',
  identifyTarget: 'all',
  helperFeedsEnabled: false,
  depthOpacity: 0.42,
  foregroundThreshold: 0.68,
  atmosphereIntensity: 0.55,
  atmosphereSoftness: 0.45,
  madMapper: {
    host: process.env.MADMAPPER_HOST || '127.0.0.1',
    oscPort: Number(process.env.MADMAPPER_OSC_PORT || 8010),
    queryPort: Number(process.env.MADMAPPER_OSCQUERY_PORT || 8010),
    cues: {
      setupGrid: '/timelines/Bank-1/by_cell/col_1/cue_row_1/play',
      identifyLeft: '/timelines/Bank-1/by_cell/col_2/cue_row_1/play',
      identifyFront: '/timelines/Bank-1/by_cell/col_3/cue_row_1/play',
      identifyRight: '/timelines/Bank-1/by_cell/col_4/cue_row_1/play',
      worldIdle: '/timelines/Bank-1/by_cell/col_1/cue_row_2/play',
      portalOpening: '/timelines/Bank-1/by_cell/col_2/cue_row_2/play',
      arrival: '/timelines/Bank-1/by_cell/col_3/cue_row_2/play',
      blackout: '/timelines/Bank-1/by_cell/col_4/cue_row_2/play'
    }
  }
};

function createOutputBusState(room, setup = DEFAULT_SETUP_STATE, previousFeeds = []) {
  const now = Date.now();
  const transport = setup.transport || 'ndi';
  const previousById = new Map((previousFeeds || []).map((feed) => [feed.id, feed]));
  return [...createProjectorFeeds(room), ...HELPER_FEEDS].map((feed) => ({
    ...(previousById.get(feed.id) || {}),
    ...feed,
    expectedSpout: false,
    expectedNdi: feed.role === 'projector' && transport === 'ndi',
    windowAlive: previousById.get(feed.id)?.windowAlive || false,
    renderHeartbeatAt: previousById.get(feed.id)?.renderHeartbeatAt || 0,
    lastFrameAt: previousById.get(feed.id)?.lastFrameAt || 0,
    fps: previousById.get(feed.id)?.fps || 0,
    width: previousById.get(feed.id)?.width || 0,
    height: previousById.get(feed.id)?.height || 0,
    transportStatus: feed.role === 'projector' ? transport : 'monitor',
    madMapperSurface: feed.surface || previousById.get(feed.id)?.madMapperSurface || '',
    updatedAt: now
  }));
}

function createProjectorFeeds(room) {
  const projectors = Array.isArray(room?.projectors) ? room.projectors.filter((projector) => projector.enabled !== false) : [];
  if (!projectors.length) return PROJECTOR_FEEDS.map((feed) => withResolution(feed));
  return projectors.map((projector, index) => projectorToFeed(projector, index));
}

function projectorToFeed(projector = {}, index = 0) {
  const id = String(projector.id || `projector-${index + 1}`);
  const label = projector.label || titleCase(id);
  const name = projector.feedName || `TakeMeThere_${slugFeedName(id)}`;
  const orientation = projector.orientation === 'portrait' ? 'portrait' : 'landscape';
  const resolution = normalizeResolution(projector.resolution, orientation);
  return {
    id,
    name,
    label,
    role: 'projector',
    view: id,
    surface: projector.surface || `Quad-${index + 1}`,
    orientation,
    resolution,
    targetWidth: resolution.width,
    targetHeight: resolution.height
  };
}

function withResolution(feed) {
  const orientation = feed.orientation === 'portrait' ? 'portrait' : 'landscape';
  const resolution = normalizeResolution(feed.resolution, orientation);
  return {
    ...feed,
    orientation,
    resolution,
    targetWidth: resolution.width,
    targetHeight: resolution.height
  };
}

function normalizeResolution(resolution = {}, orientation = 'landscape') {
  const fallback = orientation === 'portrait' ? { width: 1080, height: 1920 } : DEFAULT_PROJECTOR_RESOLUTION;
  let width = number(resolution.width, fallback.width);
  let height = number(resolution.height, fallback.height);
  width = clamp(Math.round(width), 320, 8192);
  height = clamp(Math.round(height), 240, 8192);
  if (orientation === 'portrait' && width > height) [width, height] = [height, width];
  if (orientation === 'landscape' && height > width) [width, height] = [height, width];
  return { width, height };
}

function titleCase(value) {
  return String(value).replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugFeedName(value) {
  return String(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'PROJECTOR';
}

function number(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateFeedHealth(feeds, id, patch) {
  return feeds.map((feed) => feed.id === id ? { ...feed, ...patch, updatedAt: Date.now() } : feed);
}

function getFeedById(id) {
  return [...PROJECTOR_FEEDS, ...HELPER_FEEDS].find((feed) => feed.id === id);
}

module.exports = {
  PROJECTOR_FEEDS,
  HELPER_FEEDS,
  DEFAULT_SETUP_STATE,
  DEFAULT_PROJECTOR_RESOLUTION,
  createOutputBusState,
  createProjectorFeeds,
  normalizeResolution,
  updateFeedHealth,
  getFeedById
};
