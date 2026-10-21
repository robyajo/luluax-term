import { contextBridge, ipcRenderer } from 'electron';

export interface UpdateInfoPayload {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

export interface ProgressInfoPayload {
  percent: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  checkForUpdate: (): Promise<unknown> => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: (): Promise<unknown> => ipcRenderer.invoke('download-update'),
  quitAndInstall: (): Promise<void> => ipcRenderer.invoke('quit-and-install'),
  onCheckingForUpdate: (callback: () => void): void => {
    ipcRenderer.on('checking-for-update', () => callback());
  },
  onUpdateAvailable: (callback: (info: UpdateInfoPayload) => void): void => {
    ipcRenderer.on('update-available', (_event, data: UpdateInfoPayload) => callback(data));
  },
  onUpdateNotAvailable: (callback: (info: unknown) => void): void => {
    ipcRenderer.on('update-not-available', (_event, data: unknown) => callback(data));
  },
  onDownloadProgress: (callback: (progress: ProgressInfoPayload) => void): void => {
    ipcRenderer.on('download-progress', (_event, data: ProgressInfoPayload) => callback(data));
  },
  onUpdateDownloaded: (callback: (info: UpdateInfoPayload) => void): void => {
    ipcRenderer.on('update-downloaded', (_event, data: UpdateInfoPayload) => callback(data));
  },
  onUpdateError: (callback: (errorMsg: string) => void): void => {
    ipcRenderer.on('update-error', (_event, data: string) => callback(data));
  }
});
