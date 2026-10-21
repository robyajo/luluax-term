"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    getAppVersion: () => electron_1.ipcRenderer.invoke('get-app-version'),
    checkForUpdate: () => electron_1.ipcRenderer.invoke('check-for-update'),
    downloadUpdate: () => electron_1.ipcRenderer.invoke('download-update'),
    quitAndInstall: () => electron_1.ipcRenderer.invoke('quit-and-install'),
    onCheckingForUpdate: (callback) => {
        electron_1.ipcRenderer.on('checking-for-update', () => callback());
    },
    onUpdateAvailable: (callback) => {
        electron_1.ipcRenderer.on('update-available', (_event, data) => callback(data));
    },
    onUpdateNotAvailable: (callback) => {
        electron_1.ipcRenderer.on('update-not-available', (_event, data) => callback(data));
    },
    onDownloadProgress: (callback) => {
        electron_1.ipcRenderer.on('download-progress', (_event, data) => callback(data));
    },
    onUpdateDownloaded: (callback) => {
        electron_1.ipcRenderer.on('update-downloaded', (_event, data) => callback(data));
    },
    onUpdateError: (callback) => {
        electron_1.ipcRenderer.on('update-error', (_event, data) => callback(data));
    }
});
