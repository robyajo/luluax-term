import { app, BrowserWindow, dialog, type MessageBoxReturnValue } from 'electron';
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater';
import * as path from 'path';

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

  // Muat URL server lokal aplikasi
  mainWindow.loadURL('http://127.0.0.1:3980');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Konfigurasi Event Listener Auto-Updater (electron-updater)
 */
function setupAutoUpdater(): void {
  // 1. Event: Memulai pemeriksaan pembaruan
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Sedang memeriksa rilis terbaru di GitHub Releases...');
  });

  // 2. Event: Pembaruan tersedia di GitHub
  autoUpdater.on('update-available', async (info: UpdateInfo) => {
    console.log(`[AutoUpdater] Versi baru ditemukan: v${info.version} (Rilis: ${info.releaseDate})`);

    if (!mainWindow || mainWindow.isDestroyed()) return;

    // Tampilkan konfirmasi unduhan kepada pengguna
    const dialogResult: MessageBoxReturnValue = await dialog.showMessageBox(mainWindow, {
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
      autoUpdater.downloadUpdate().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[AutoUpdater] Gagal mengunduh pembaruan:', message);
      });
    }
  });

  // 3. Event: Pembaruan tidak tersedia (aplikasi sudah versi terbaru)
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    console.log(`[AutoUpdater] Aplikasi sudah merupakan versi terbaru (v${info.version}).`);
  });

  // 4. Event: Progres Pengunduhan
  autoUpdater.on('download-progress', (progressObj: ProgressInfo) => {
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
  autoUpdater.on('update-downloaded', async (info: UpdateInfo) => {
    console.log(`[AutoUpdater] Unduhan selesai untuk versi v${info.version}!`);

    if (!mainWindow || mainWindow.isDestroyed()) return;

    // Format catatan rilis (Release Notes / Changelog dari GitHub)
    const releaseNotesText = typeof info.releaseNotes === 'string'
      ? info.releaseNotes
      : (Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n) => typeof n === 'string' ? n : (n.note || '')).join('\n')
          : 'Pembaruan stabilitas, fitur baru, dan peningkatan performa.');

    // Tampilkan notifikasi dialog berisi apa saja yang baru dan tombol restart
    const dialogResult: MessageBoxReturnValue = await dialog.showMessageBox(mainWindow, {
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
      autoUpdater.quitAndInstall(false, true);
    }
  });

  // 6. Event: Penanganan Error
  autoUpdater.on('error', (err: Error) => {
    console.error('[AutoUpdater] Terjadi kesalahan pada proses auto-updater:', err.message);
  });
}

// -------------------------------------------------------------
// Siklus Hidup Aplikasi (App Lifecycle)
// -------------------------------------------------------------
app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();

  // Otomatis periksa rilis baru di GitHub setiap kali aplikasi dibuka (khusus versi terpasang)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[AutoUpdater] Pengecekan otomatis saat startup gagal:', message);
    });
  }
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
