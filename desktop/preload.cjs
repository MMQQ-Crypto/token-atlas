const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tokenAtlas', {
  scan: () => ipcRenderer.invoke('scan'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: settings => ipcRenderer.invoke('settings:update', settings),
  chooseFolder: id => ipcRenderer.invoke('source:folder', id),
  resetFolder: id => ipcRenderer.invoke('source:reset', id),
  exportCSV: filter => ipcRenderer.invoke('export', filter),
  captureStatus:()=>ipcRenderer.invoke('capture:status'),
  startCapture:()=>ipcRenderer.invoke('capture:start'),
  stopCapture:()=>ipcRenderer.invoke('capture:stop'),
  copyPairing:()=>ipcRenderer.invoke('capture:copy'),
  importUsage:()=>ipcRenderer.invoke('capture:import'),
  openExtension:()=>ipcRenderer.invoke('capture:extension'),
  onCapture:fn=>ipcRenderer.on('capture:updated',()=>fn()),
  updateStatus:()=>ipcRenderer.invoke('update:status'),
  checkUpdate:()=>ipcRenderer.invoke('update:check'),
  downloadUpdate:()=>ipcRenderer.invoke('update:download'),
  installUpdate:()=>ipcRenderer.invoke('update:install'),
  onUpdate:fn=>ipcRenderer.on('update:changed',(_event,state)=>fn(state))
});
