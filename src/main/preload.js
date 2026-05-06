const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('takeMeThere', {
  getSession: () => ipcRenderer.invoke('session:get'),
  setState: (state) => ipcRenderer.invoke('session:set-state', state),
  generateWorld: (prompt) => ipcRenderer.invoke('session:generate-world', prompt),
  fallbackWorld: (prompt) => ipcRenderer.invoke('session:fallback-world', prompt),
  setLayout: (layout) => ipcRenderer.invoke('session:set-layout', layout),
  setVisualMode: (mode) => ipcRenderer.invoke('session:set-visual-mode', mode),
  setProjectorConfig: (config) => ipcRenderer.invoke('session:set-projector-config', config),
  generateMasks: () => ipcRenderer.invoke('masks:generate'),
  getSetup: () => ipcRenderer.invoke('setup:get'),
  updateSetup: (patch) => ipcRenderer.invoke('setup:update', patch),
  outputHeartbeat: (payload) => ipcRenderer.invoke('output:heartbeat', payload),
  startNdi: () => ipcRenderer.invoke('ndi:start'),
  stopNdi: () => ipcRenderer.invoke('ndi:stop'),
  getNdiStatus: () => ipcRenderer.invoke('ndi:status'),
  setRoom: (patch) => ipcRenderer.invoke('room:set', patch),
  getRoomLayoutTemplate: (layoutType) => ipcRenderer.invoke('room:layout-template', layoutType),
  applyRoomLayoutTemplate: (layoutType) => ipcRenderer.invoke('room:apply-layout-template', layoutType),
  importRoomScan: () => ipcRenderer.invoke('room:import-scan'),
  clearRoomScan: () => ipcRenderer.invoke('room:clear-scan'),
  listRoomPresets: () => ipcRenderer.invoke('room-presets:list'),
  loadRoomPreset: (id) => ipcRenderer.invoke('room-presets:load', id),
  saveRoomPreset: (preset) => ipcRenderer.invoke('room-presets:save', preset),
  getDefaultRoomPreset: () => ipcRenderer.invoke('room-presets:default'),
  madMapperDiscover: (config) => ipcRenderer.invoke('madmapper:discover', config),
  madMapperGetValue: (path, config) => ipcRenderer.invoke('madmapper:get-value', path, config),
  madMapperSend: (path, value, config) => ipcRenderer.invoke('madmapper:send', path, value, config),
  madMapperTrigger: (path, config) => ipcRenderer.invoke('madmapper:trigger', path, config),
  madMapperTriggerCue: (cueKey, config) => ipcRenderer.invoke('madmapper:trigger-cue', cueKey, config),
  showProductionWindows: () => ipcRenderer.invoke('outputs:show-production'),
  hideProductionWindows: () => ipcRenderer.invoke('outputs:hide-production'),
  validateMadMapperOutputs: (config) => ipcRenderer.invoke('outputs:validate-madmapper', config),
  toggleOutputFullscreen: () => ipcRenderer.invoke('window:output-fullscreen'),
  focusOutput: () => ipcRenderer.invoke('window:focus-output'),
  reloadOutput: () => ipcRenderer.invoke('window:reload-output'),
  onSessionUpdate: (callback) => {
    const listener = (_event, session) => callback(session);
    ipcRenderer.on('session:update', listener);
    return () => ipcRenderer.removeListener('session:update', listener);
  }
});
