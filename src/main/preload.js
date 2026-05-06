const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('takeMeThere', {
  getSession: () => ipcRenderer.invoke('session:get'),
  listGeneratedWorlds: () => ipcRenderer.invoke('session:list-generated-worlds'),
  loadGeneratedWorld: (filename) => ipcRenderer.invoke('session:load-generated-world', filename),
  setState: (state) => ipcRenderer.invoke('session:set-state', state),
  generateWorld: (prompt) => ipcRenderer.invoke('session:generate-world', prompt),
  fallbackWorld: (prompt) => ipcRenderer.invoke('session:fallback-world', prompt),
  setLayout: (layout) => ipcRenderer.invoke('session:set-layout', layout),
  updateProjector: (id, patch) => ipcRenderer.invoke('session:update-projector', id, patch),
  setProjectors: (projectors) => ipcRenderer.invoke('session:set-projectors', projectors),
  addSceneCamera: () => ipcRenderer.invoke('session:add-scene-camera'),
  removeSceneCamera: (id) => ipcRenderer.invoke('session:remove-scene-camera', id),
  updateSceneCamera: (id, patch) => ipcRenderer.invoke('session:update-scene-camera', id, patch),
  updateSceneBuilder: (patch) => ipcRenderer.invoke('session:update-scene-builder', patch),
  setOutputMapping: (slot, cameraId) => ipcRenderer.invoke('session:set-output-mapping', slot, cameraId),
  updateSceneSettings: (patch) => ipcRenderer.invoke('session:update-scene-settings', patch),
  applyPreset: (preset) => ipcRenderer.invoke('session:apply-preset', preset),
  startNdi: () => ipcRenderer.invoke('ndi:start'),
  stopNdi: () => ipcRenderer.invoke('ndi:stop'),
  ndiStatus: () => ipcRenderer.invoke('ndi:status'),
  madMapperDiscover: (config) => ipcRenderer.invoke('madmapper:discover', config),
  madMapperSend: (pathName, value, config) => ipcRenderer.invoke('madmapper:send', pathName, value, config),
  madMapperTrigger: (pathName, config) => ipcRenderer.invoke('madmapper:trigger', pathName, config),
  madMapperGetValue: (pathName, config) => ipcRenderer.invoke('madmapper:get-value', pathName, config),
  validateMadMapperOutputs: (config) => ipcRenderer.invoke('madmapper:validate-outputs', config),
  toggleOutputFullscreen: () => ipcRenderer.invoke('window:output-fullscreen'),
  focusOutput: () => ipcRenderer.invoke('window:focus-output'),
  reloadOutput: () => ipcRenderer.invoke('window:reload-output'),
  onSessionUpdate: (callback) => {
    const listener = (_event, session) => callback(session);
    ipcRenderer.on('session:update', listener);
    return () => ipcRenderer.removeListener('session:update', listener);
  }
});
