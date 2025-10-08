const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  selectDir: () => ipcRenderer.invoke('select-dir'),
  runTools: (options) => ipcRenderer.send('run-tools', options),
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', (_event, value) => callback(value)),
});