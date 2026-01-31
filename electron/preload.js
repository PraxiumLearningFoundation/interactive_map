const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', { filePath, content }),
  readCategories: () => ipcRenderer.invoke('read-categories'),
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  showMessage: (type, title, message) => ipcRenderer.invoke('show-message', { type, title, message }),

  // Listen for events from main process
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (event, data) => callback(data));
  },
  onRequestSave: (callback) => {
    ipcRenderer.on('request-save', (event, data) => callback(data));
  },

  // Check if running in Electron
  isElectron: true
});
