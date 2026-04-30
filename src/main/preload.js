const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('takeMeThere', {
  getSession: () => ipcRenderer.invoke('session:get'),
  setState: (state) => ipcRenderer.invoke('session:set-state', state),
  generateWorld: (prompt) => ipcRenderer.invoke('session:generate-world', prompt),
  fallbackWorld: (prompt) => ipcRenderer.invoke('session:fallback-world', prompt),
  setLayout: (layout) => ipcRenderer.invoke('session:set-layout', layout),
  toggleOutputFullscreen: () => ipcRenderer.invoke('window:output-fullscreen'),
  focusOutput: () => ipcRenderer.invoke('window:focus-output'),
  reloadOutput: () => ipcRenderer.invoke('window:reload-output'),
  onSessionUpdate: (callback) => {
    const listener = (_event, session) => callback(session);
    ipcRenderer.on('session:update', listener);
    return () => ipcRenderer.removeListener('session:update', listener);
  }
});
