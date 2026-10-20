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
    // Muat URL server lokal aplikasi
    mainWindow.loadURL('http://127.0.0.1:3980');
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
/**
 * Konfigurasi Event Listener Auto-Updater (electron-updater)
 */
function setupAutoUpdater() {
    // 1. Event: Memulai pemeriksaan pembaruan
    electron_updater_1.autoUpdater.on('checking-for-update', () => {
        console.log('[AutoUpdater] Sedang memeriksa rilis terbaru di GitHub Releases...');
    });
    // 2. Event: Pembaruan tersedia di GitHub
    electron_updater_1.autoUpdater.on('update-available', async (info) => {
        console.log(`[AutoUpdater] Versi baru ditemukan: v${info.version} (Rilis: ${info.releaseDate})`);
        if (!mainWindow || mainWindow.isDestroyed())
            return;
        // Tampilkan konfirmasi unduhan kepada pengguna
        const dialogResult = await electron_1.dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ['Download Pembaruan Sekarang', 'Nanti Saja'],
            defaultId: 0,
            cancelId: 1,
            title: 'Pembaruan Tersedia',
            message: `Versi baru v${info.version} telah tersedia di GitHub!`,
            detail: `Apakah Anda ingin mengunduh pembaruan ini sekarang?`
        });
        if (dialogResult.response === 0) {
            console.log('[AutoUpdater] Pengguna menyetujui unduhan. Memulai download...');
            electron_updater_1.autoUpdater.downloadUpdate().catch((err) => {
                const message = err instanceof Error ? err.message : String(err);
                console.error('[AutoUpdater] Gagal mengunduh pembaruan:', message);
            });
        }
    });
    // 3. Event: Pembaruan tidak tersedia (aplikasi sudah versi terbaru)
    electron_updater_1.autoUpdater.on('update-not-available', (info) => {
        console.log(`[AutoUpdater] Aplikasi sudah merupakan versi terbaru (v${info.version}).`);
    });
    // 4. Event: Progres Pengunduhan
    electron_updater_1.autoUpdater.on('download-progress', (progressObj) => {
        const percent = Math.round(progressObj.percent);
        const speedKB = Math.round(progressObj.bytesPerSecond / 1024);
        console.log(`[AutoUpdater] Mengunduh: ${percent}% (${speedKB} KB/s)`);
        // Teruskan progres ke renderer window jika diperlukan
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-progress', {
                percent,
                bytesPerSecond: progressObj.bytesPerSecond,
                transferred: progressObj.transferred,
                total: progressObj.total
            });
        }
    });
    // 5. Event: File update selesai diunduh & diverifikasi
    electron_updater_1.autoUpdater.on('update-downloaded', async (info) => {
        console.log(`[AutoUpdater] Unduhan selesai untuk versi v${info.version}!`);
        if (!mainWindow || mainWindow.isDestroyed())
            return;
        // Format catatan rilis (Release Notes / Changelog dari GitHub)
        const releaseNotesText = typeof info.releaseNotes === 'string'
            ? info.releaseNotes
            : (Array.isArray(info.releaseNotes)
                ? info.releaseNotes.map((n) => typeof n === 'string' ? n : (n.note || '')).join('\n')
                : 'Pembaruan stabilitas, fitur baru, dan peningkatan performa.');
        // Tampilkan notifikasi dialog berisi apa saja yang baru dan tombol restart
        const dialogResult = await electron_1.dialog.showMessageBox(mainWindow, {
            type: 'info',
            buttons: ['Restart & Pasang Sekarang', 'Nanti Saja (Saat Keluar)'],
            defaultId: 0,
            cancelId: 1,
            title: 'Pembaruan Siap Dipasang',
            message: `🎉 Pembaruan v${info.version} berhasil diunduh!`,
            detail: `Apa saja yang baru di versi ini:\n\n${releaseNotesText}\n\nKlik "Restart & Pasang Sekarang" untuk menyelesaikan pembaruan.`
        });
        if (dialogResult.response === 0) {
            console.log('[AutoUpdater] Melakukan restart aplikasi dan instalasi pembaruan...');
            // Parameter: isSilent = false, isForceRunAfter = true
            electron_updater_1.autoUpdater.quitAndInstall(false, true);
        }
    });
    // 6. Event: Penanganan Error
    electron_updater_1.autoUpdater.on('error', (err) => {
        console.error('[AutoUpdater] Terjadi kesalahan pada proses auto-updater:', err.message);
    });
}
// -------------------------------------------------------------
// Siklus Hidup Aplikasi (App Lifecycle)
// -------------------------------------------------------------
electron_1.app.whenReady().then(() => {
    createWindow();
    setupAutoUpdater();
    // Otomatis periksa rilis baru di GitHub setiap kali aplikasi dibuka (khusus versi terpasang)
    if (electron_1.app.isPackaged) {
        electron_updater_1.autoUpdater.checkForUpdates().catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            console.warn('[AutoUpdater] Pengecekan otomatis saat startup gagal:', message);
        });
    }
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
