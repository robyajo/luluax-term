import { app, BrowserWindow, dialog, ipcMain, type MessageBoxReturnValue } from 'electron';
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater';
import * as path from 'path';

// IPC Handlers for app version & auto-updater
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('check-for-update', () => autoUpdater.checkForUpdates());
ipcMain.handle('download-update', () => autoUpdater.downloadUpdate());
ipcMain.handle('quit-and-install', () => autoUpdater.quitAndInstall(false, true));

// Start the local backend server in-process
import './server.js';

const PORT = 3980;

// Konfigurasi Logging bawaan
autoUpdater.logger = console;

// Nonaktifkan unduhan otomatis agar menunggu konfirmasi tombol dari pengguna
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'LuluaX-Term',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#101216',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const loadApp = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
    }
  };

  // Tunggu sebentar hingga port server lokal siap bind socket
  setTimeout(loadApp, 500);

  // Jika koneksi awal gagal (misal server butuh waktu inisialisasi), auto-retry
  mainWindow.webContents.on('did-fail-load', (_event, errorCode) => {
    if (errorCode !== -3) {
      setTimeout(loadApp, 800);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdates().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[AutoUpdater] Pengecekan otomatis saat startup gagal:', message);
      });
    }
  });
}

function setupAutoUpdater(): void {
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Sedang memeriksa rilis terbaru di GitHub Releases...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('checking-for-update');
    }
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log(`[AutoUpdater] Versi baru ditemukan: v${info.version} (Rilis: ${info.releaseDate})`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : (Array.isArray(info.releaseNotes)
              ? info.releaseNotes.map((n) => typeof n === 'string' ? n : (n.note || '')).join('\n')
              : 'Pembaruan stabilitas, fitur baru, dan peningkatan performa.')
      });
    }
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    console.log(`[AutoUpdater] Aplikasi sudah merupakan versi terbaru (v${info.version}).`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available', {
        version: info.version
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj: ProgressInfo) => {
    const percent = Math.round(progressObj.percent);
    const speedKB = Math.round(progressObj.bytesPerSecond / 1024);
    console.log(`[AutoUpdater] Mengunduh: ${percent}% (${speedKB} KB/s)`);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', {
        percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    }
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log(`[AutoUpdater] Unduhan selesai untuk versi v${info.version}!`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        releaseNotes: typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : (Array.isArray(info.releaseNotes)
              ? info.releaseNotes.map((n) => typeof n === 'string' ? n : (n.note || '')).join('\n')
              : 'Pembaruan stabilitas, fitur baru, dan peningkatan performa.')
      });
    }
  });

  autoUpdater.on('error', (err: Error) => {
    console.error('[AutoUpdater] Terjadi kesalahan pada proses auto-updater:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', err.message);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
