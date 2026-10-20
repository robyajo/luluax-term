// Electron Desktop Wrapper for LuluaX-Term (macOS Apple Silicon & Windows)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

// Start the backend server in-process
require('./server.js');

let mainWindow = null;

function createWindow() {
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
      contextIsolation: true
    }
  });

  // Wait briefly for server to bind, then load
  setTimeout(() => {
    mainWindow.loadURL('http://127.0.0.1:3980');
  }, 800);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
