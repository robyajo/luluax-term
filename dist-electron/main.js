"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
const path = __importStar(require("path"));
// IPC Handlers for app version & auto-updater
electron_1.ipcMain.handle('get-app-version', () => electron_1.app.getVersion());
electron_1.ipcMain.handle('check-for-update', () => electron_updater_1.autoUpdater.checkForUpdates());
electron_1.ipcMain.handle('download-update', () => electron_updater_1.autoUpdater.downloadUpdate());
electron_1.ipcMain.handle('quit-and-install', () => electron_updater_1.autoUpdater.quitAndInstall(false, true));
// Start the local backend server in-process
require("./server.js");
const PORT = 3980;
// Konfigurasi Logging bawaan
electron_updater_1.autoUpdater.logger = console;
// Nonaktifkan unduhan otomatis agar menunggu konfirmasi tombol dari pengguna
electron_updater_1.autoUpdater.autoDownload = false;
electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
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
    const loadApp = () => {
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
        if (electron_1.app.isPackaged) {
            electron_updater_1.autoUpdater.checkForUpdates().catch((err) => {
                const message = err instanceof Error ? err.message : String(err);
                console.warn('[AutoUpdater] Pengecekan otomatis saat startup gagal:', message);
            });
        }
    });
}
function setupAutoUpdater() {
    electron_updater_1.autoUpdater.on('checking-for-update', () => {
        console.log('[AutoUpdater] Sedang memeriksa rilis terbaru di GitHub Releases...');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('checking-for-update');
        }
    });
    electron_updater_1.autoUpdater.on('update-available', (info) => {
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
    electron_updater_1.autoUpdater.on('update-not-available', (info) => {
        console.log(`[AutoUpdater] Aplikasi sudah merupakan versi terbaru (v${info.version}).`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-not-available', {
                version: info.version
            });
        }
    });
    electron_updater_1.autoUpdater.on('download-progress', (progressObj) => {
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
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
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
    electron_updater_1.autoUpdater.on('error', (err) => {
        console.error('[AutoUpdater] Terjadi kesalahan pada proses auto-updater:', err.message);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-error', err.message);
        }
    });
}
electron_1.app.whenReady().then(() => {
    createWindow();
    setupAutoUpdater();
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
