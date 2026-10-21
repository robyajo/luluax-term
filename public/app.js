// TermiusLite Single Page Application Client Engine
const THEMES = {
  'termius-dark': {
    background: '#0d0f12',
    foreground: '#e6edf3',
    cursor: '#7b61ff',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(123, 97, 255, 0.3)',
    black: '#16191f',
    red: '#ff5252',
    green: '#00e676',
    yellow: '#ffab00',
    blue: '#448aff',
    magenta: '#7b61ff',
    cyan: '#00d2ff',
    white: '#f0f6fc',
    brightBlack: '#626b79',
    brightRed: '#ff867c',
    brightGreen: '#69f0ae',
    brightYellow: '#ffd740',
    brightBlue: '#82b1ff',
    brightMagenta: '#b388ff',
    brightCyan: '#84ffff',
    brightWhite: '#ffffff'
  },
  'dracula': {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    cursorAccent: '#282a36',
    selectionBackground: 'rgba(68, 71, 90, 0.5)',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff'
  },
  'one-dark': {
    background: '#1e1e1e',
    foreground: '#abb2bf',
    cursor: '#528bff',
    selectionBackground: '#3e4451',
    black: '#282c34',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#5c6370',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#e5c07b',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff'
  },
  'nord': {
    background: '#2e3440',
    foreground: '#d8dee9',
    cursor: '#d8dee9',
    selectionBackground: '#434c5e',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4'
  },
  'cyberpunk': {
    background: '#0d0221',
    foreground: '#00ffcc',
    cursor: '#ff007f',
    selectionBackground: '#ff007f44',
    black: '#0d0221',
    red: '#ff0055',
    green: '#00ffcc',
    yellow: '#ffe600',
    blue: '#00bfff',
    magenta: '#ff007f',
    cyan: '#00f0ff',
    white: '#ffffff',
    brightBlack: '#555555',
    brightRed: '#ff3377',
    brightGreen: '#33ffdd',
    brightYellow: '#ffea33',
    brightBlue: '#33ccff',
    brightMagenta: '#ff3399',
    brightCyan: '#33f3ff',
    brightWhite: '#ffffff'
  },
  'monokai': {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f0',
    selectionBackground: '#49483e',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#f4bf75',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5'
  }
};

class LuluaXTermApp {
  constructor() {
    this.hosts = [];
    this.snippets = [];
    this.settings = {};
    this.activeFilterGroup = 'All';
    this.activeView = 'hosts';
    
    // Terminal sessions
    this.sessions = new Map(); // tabId -> { id, host, xterm, fitAddon, ws, containerEl, tabEl, status }
    this.activeTabId = null;

    // SFTP session
    this.sftp = {
      sessionId: null,
      currentPath: '',
      host: null
    };
    this.tunnels = [];
    this.keys = [];
    this.localDrives = [];
    this.localPath = '';
    this.selectedLocalFile = null;
    this.selectedRemoteFile = null;
    this.broadcastEnabled = false;
    this.currentEditingRemoteFile = null;
    this.pendingSnippetCmd = null;
    this.folders = [];
    this.draggedHostId = null;
    this.syncDebounceTimer = null;
    this.currentUser = null;
    this.authMode = 'login';
    this.serverOnline = false;
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.detectSystem();
    await this.loadSettings();
    await this.checkServerAndAuth();
    await this.loadHosts();
    await this.loadSnippets();
    await this.loadTunnels();
    await this.loadKeys();
    await this.loadLocalDrives();
    this.setupAutoUpdater();
    this.startConnectionHeartbeat();

    // Auto-resize terminals when window size changes
    window.addEventListener('resize', () => {
      this.fitActiveTerminal();
    });
  }

  setupAutoUpdater() {
    if (!window.electronAPI) return;

    if (window.electronAPI.onCheckingForUpdate) {
      window.electronAPI.onCheckingForUpdate(() => {
        const desc = document.getElementById('settings-update-desc');
        if (desc) desc.textContent = 'Sedang memeriksa update di GitHub Releases...';
      });
    }

    window.electronAPI.onUpdateAvailable((info) => {
      const banner = document.getElementById('update-banner');
      const msg = document.getElementById('update-banner-msg');
      if (banner) banner.style.display = 'flex';
      if (msg) msg.innerHTML = `🚀 Pembaruan Tersedia: <strong>v${this.escapeHtml(info.version)}</strong>!`;
      this.pendingUpdateInfo = info;

      // Show top-right update badge
      const topBadge = document.getElementById('btn-top-update-badge');
      const badgeText = document.getElementById('top-update-badge-text');
      if (topBadge) {
        topBadge.style.display = 'inline-flex';
        topBadge.className = 'btn-top-update-badge';
      }
      if (badgeText) {
        badgeText.textContent = `Update v${info.version} Tersedia!`;
      }

      const desc = document.getElementById('settings-update-desc');
      if (desc) desc.textContent = `Versi baru v${info.version} tersedia untuk diunduh.`;
    });

    window.electronAPI.onUpdateNotAvailable(() => {
      const desc = document.getElementById('settings-update-desc');
      if (desc) desc.textContent = 'Aplikasi sudah merupakan versi terbaru.';
      if (this.isManualUpdateCheck) {
        alert('LuluaX-Term Anda sudah menggunakan versi terbaru (v' + (this.installedVersion || '') + ')!');
        this.isManualUpdateCheck = false;
      }
    });

    window.electronAPI.onDownloadProgress((progress) => {
      const bar = document.getElementById('update-progress-bar');
      const fill = document.getElementById('update-progress-fill');
      const msg = document.getElementById('update-banner-msg');
      if (bar) bar.style.display = 'block';
      if (fill) fill.style.width = `${progress.percent}%`;
      if (msg) msg.innerHTML = `Mengunduh: <strong>${progress.percent}%</strong> (${this.formatBytes(progress.bytesPerSecond || 0)}/s)...`;

      const topBadge = document.getElementById('btn-top-update-badge');
      const badgeText = document.getElementById('top-update-badge-text');
      if (topBadge) {
        topBadge.style.display = 'inline-flex';
        topBadge.className = 'btn-top-update-badge downloading';
      }
      if (badgeText) {
        badgeText.textContent = `⬇ Mengunduh ${progress.percent}%...`;
      }
    });

    window.electronAPI.onUpdateDownloaded((info) => {
      const banner = document.getElementById('update-banner');
      if (banner) banner.style.display = 'none';
      document.getElementById('update-downloaded-version').textContent = `v${info.version}`;
      document.getElementById('update-release-notes').textContent = info.releaseNotes || 'Pembaruan stabilitas dan peningkatan performa terbaru.';

      this.pendingUpdateDownloaded = true;
      const topBadge = document.getElementById('btn-top-update-badge');
      const badgeText = document.getElementById('top-update-badge-text');
      if (topBadge) {
        topBadge.style.display = 'inline-flex';
        topBadge.className = 'btn-top-update-badge ready';
      }
      if (badgeText) {
        badgeText.textContent = `🎉 Pasang v${info.version} (Restart)`;
      }

      document.getElementById('modal-update-notes').classList.add('active');
    });

    window.electronAPI.onUpdateError((errMsg) => {
      console.warn('Update check error:', errMsg);
      if (this.isManualUpdateCheck) {
        alert('Pemeriksaan pembaruan: ' + errMsg);
        this.isManualUpdateCheck = false;
      }
    });
  }

  onUpdateBadgeClick() {
    if (this.pendingUpdateDownloaded) {
      document.getElementById('modal-update-notes').classList.add('active');
    } else if (this.pendingUpdateInfo) {
      document.getElementById('update-downloaded-version').textContent = `v${this.pendingUpdateInfo.version}`;
      document.getElementById('update-release-notes').textContent = this.pendingUpdateInfo.releaseNotes || 'Pembaruan stabilitas dan peningkatan performa terbaru.';
      document.getElementById('modal-update-notes').classList.add('active');
      this.triggerDownloadUpdate();
    } else {
      this.manualCheckUpdate();
    }
  }

  async triggerDownloadUpdate() {
    const btn = document.getElementById('btn-download-update');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Memulai Download...';
    }
    const topBadgeText = document.getElementById('top-update-badge-text');
    if (topBadgeText) topBadgeText.textContent = 'Memulai Download...';
    if (window.electronAPI) {
      await window.electronAPI.downloadUpdate();
    }
  }

  triggerRestartInstall() {
    if (window.electronAPI) {
      window.electronAPI.quitAndInstall();
    }
  }

  async manualCheckUpdate() {
    this.isManualUpdateCheck = true;
    const desc = document.getElementById('settings-update-desc');
    if (desc) desc.textContent = 'Sedang memeriksa update di GitHub Releases...';
    if (window.electronAPI) {
      await window.electronAPI.checkForUpdate();
    } else {
      alert('Pemeriksaan update otomatis hanya berjalan pada aplikasi desktop Electron terpasang.');
    }
  }

  async checkServerAndAuth() {
    const serverUrl = this.settings.cloudApiUrl || 'https://www.luluax-service.duckdns.org';
    const statusPill = document.getElementById('auth-server-status');
    const statusLabel = document.getElementById('auth-server-label');

    statusPill.className = 'server-status-pill checking';
    statusLabel.textContent = `Memeriksa server cloud (${serverUrl})...`;

    try {
      const healthRes = await fetch(`${serverUrl}/api/health`, { method: 'GET', signal: AbortSignal.timeout(6000) });
      const healthData = await healthRes.json();
      if (healthData.success) {
        this.serverOnline = true;
        statusPill.className = 'server-status-pill online';
        statusLabel.textContent = `● Terhubung ke Server Cloud (${serverUrl})`;
      } else {
        throw new Error('Server returned unready state');
      }
    } catch (e) {
      this.serverOnline = false;
      statusPill.className = 'server-status-pill offline';
      statusLabel.textContent = `▲ Tidak dapat terhubung ke server cloud. Pastikan internet & server aktif.`;
    }

    // Check stored token
    const savedToken = localStorage.getItem('luluax_auth_token');
    if (savedToken && this.serverOnline) {
      try {
        const meRes = await fetch(`${serverUrl}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${savedToken}` }
        });
        const meData = await meRes.json();
        if (meData.success && meData.user) {
          this.currentUser = meData.user;
          document.getElementById('auth-overlay').style.display = 'none';
          this.renderUserProfile();
          return;
        }
      } catch (e) {
        console.warn('Session verification error:', e);
      }
    }

    // If not authenticated, keep auth overlay visible
    document.getElementById('auth-overlay').style.display = 'flex';
  }

  switchAuthMode(mode) {
    this.authMode = mode;
    document.getElementById('auth-tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('auth-tab-register').classList.toggle('active', mode === 'register');
    document.getElementById('group-auth-name').style.display = mode === 'register' ? 'block' : 'none';
    document.getElementById('btn-auth-submit').textContent = mode === 'login' ? 'Masuk ke LuluaX' : 'Daftar Akun Baru';
    document.getElementById('auth-error-msg').style.display = 'none';
  }

  quickFillSeededUser(type) {
    this.switchAuthMode('login');
    if (type === 'roby') {
      document.getElementById('auth-email').value = 'robyfull.dev@gmail.com';
      document.getElementById('auth-password').value = 'Password@123';
    } else {
      document.getElementById('auth-email').value = 'admin@luluax.com';
      document.getElementById('auth-password').value = 'Password@123';
    }
  }

  async handleAuthSubmit() {
    const serverUrl = this.settings.cloudApiUrl || 'https://www.luluax-service.duckdns.org';
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value.trim();
    const errorBox = document.getElementById('auth-error-msg');
    const submitBtn = document.getElementById('btn-auth-submit');

    errorBox.style.display = 'none';

    if (!this.serverOnline) {
      errorBox.textContent = 'Gagal: Aplikasi harus terhubung ke internet dan server untuk autentikasi.';
      errorBox.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Memproses...';

    try {
      const endpoint = this.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = this.authMode === 'login' ? { email, password } : { email, password, name };

      const res = await fetch(`${serverUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('luluax_auth_token', data.token);
        this.currentUser = data.user;
        document.getElementById('auth-overlay').style.display = 'none';
        this.renderUserProfile();

        // Auto-configure sync key to email/userId
        if (!this.settings.cloudSyncKey) {
          this.settings.cloudSyncKey = data.user.id || data.user.email;
          document.getElementById('setting-cloud-key').value = this.settings.cloudSyncKey;
          this.saveSettings();
        }
      } else {
        errorBox.textContent = data.error || 'Autentikasi gagal. Silakan periksa kembali.';
        errorBox.style.display = 'block';
      }
    } catch (e) {
      errorBox.textContent = 'Kesalahan jaringan: ' + e.message;
      errorBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = this.authMode === 'login' ? 'Masuk ke LuluaX' : 'Daftar Akun Baru';
    }
  }

  renderUserProfile() {
    if (!this.currentUser) return;
    const card = document.getElementById('user-profile-card');
    if (card) card.style.display = 'flex';
    document.getElementById('user-display-name').textContent = this.currentUser.name || this.currentUser.email.split('@')[0];
    document.getElementById('user-display-email').textContent = this.currentUser.email;
    const initials = (this.currentUser.name || this.currentUser.email).substring(0, 1).toUpperCase();
    document.getElementById('user-avatar-initials').textContent = initials;
    const settingsUser = document.getElementById('settings-user-info');
    if (settingsUser) settingsUser.textContent = `${this.currentUser.name || 'User'} (${this.currentUser.email})`;
  }

  async logout() {
    if (!confirm('Apakah Anda yakin ingin keluar / logout?')) return;
    const serverUrl = this.settings.cloudApiUrl || 'https://www.luluax-service.duckdns.org';
    const savedToken = localStorage.getItem('luluax_auth_token');

    // Panggil API logout backend untuk membersihkan sesi di server
    if (savedToken) {
      try {
        await fetch(`${serverUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${savedToken}`
          }
        });
      } catch (e) {
        console.warn('Backend logout warning:', e);
      }
    }

    // Bersihkan sesi lokal
    localStorage.removeItem('luluax_auth_token');
    this.currentUser = null;
    document.getElementById('user-display-name').textContent = 'Belum Masuk';
    document.getElementById('user-display-email').textContent = 'Klik untuk login';
    document.getElementById('user-avatar-initials').textContent = '?';
    const settingsUser = document.getElementById('settings-user-info');
    if (settingsUser) settingsUser.textContent = 'Belum login';

    // Kunci kembali dan tampilkan form login
    document.getElementById('auth-overlay').style.display = 'flex';
    this.switchAuthMode('login');
  }

  startConnectionHeartbeat() {
    setInterval(() => this.checkServerConnectivity(true), 12000);

    window.addEventListener('offline', () => {
      this.serverOnline = false;
      this.showGlobalError(
        'Koneksi Internet Terputus',
        'Komputer Anda kehilangan koneksi internet. Aplikasi memerlukan koneksi aktif ke server backend untuk sinkronisasi data.',
        'OFFLINE'
      );
    });

    window.addEventListener('online', () => {
      this.checkServerConnectivity(false);
    });
  }

  async checkServerConnectivity(isBackground = false) {
    const serverUrl = this.settings.cloudApiUrl || 'https://www.luluax-service.duckdns.org';
    try {
      const res = await fetch(`${serverUrl}/api/health`, { method: 'GET', signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (res.ok && data.success) {
        this.serverOnline = true;
        const errModal = document.getElementById('modal-global-error');
        if (errModal && errModal.classList.contains('active') && this.isConnectionError) {
          errModal.classList.remove('active');
          this.isConnectionError = false;
        }
        return true;
      }
      throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
    } catch (err) {
      this.serverOnline = false;
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (!isBackground) {
        this.isConnectionError = true;
        this.showGlobalError(
          'Koneksi ke Server Backend Terputus',
          `Gagal menghubungi server cloud di ${serverUrl}.\nPastikan backend aktif dan komputer terhubung ke internet.`,
          'ERR_CONNECTION_FAILED',
          `Target URL: ${serverUrl}/api/health\nTimestamp: ${new Date().toISOString()}\nUser Agent: ${navigator.userAgent}\nError Detail: ${errorMsg}`
        );
      }
      return false;
    }
  }

  showGlobalError(title, desc, statusBadge, details) {
    document.getElementById('global-error-title').textContent = title;
    document.getElementById('global-error-desc').textContent = desc;
    document.getElementById('global-error-status-badge').textContent = statusBadge || 'ERROR';

    const fullDetail = details || `Timestamp: ${new Date().toISOString()}\nError: ${desc}\nTarget Server: ${this.settings.cloudApiUrl || 'https://www.luluax-service.duckdns.org'}`;
    document.getElementById('global-error-content').textContent = fullDetail;
    this.lastGlobalErrorText = `[LuluaX-Term Error Report]\nTitle: ${title}\nStatus: ${statusBadge}\nDescription: ${desc}\n\n${fullDetail}`;

    document.getElementById('modal-global-error').classList.add('active');
  }

  copyGlobalError() {
    const textToCopy = this.lastGlobalErrorText || document.getElementById('global-error-content').textContent;
    navigator.clipboard.writeText(textToCopy);
    const btn = document.getElementById('btn-copy-global-error');
    btn.textContent = '✓ Error Berhasil Disalin!';
    setTimeout(() => btn.textContent = '📋 Salin Pesan Error', 2500);
  }

  async retryServerConnection() {
    const btn = document.getElementById('btn-retry-global-error');
    btn.disabled = true;
    btn.textContent = 'Memeriksa...';

    const ok = await this.checkServerConnectivity(false);
    btn.disabled = false;
    btn.textContent = '🔄 Hubungkan Ulang';

    if (ok) {
      document.getElementById('modal-global-error').classList.remove('active');
      this.isConnectionError = false;
      alert('✓ Berhasil terhubung kembali ke server cloud backend!');
    }
  }
  async detectSystem() {
    try {
      const res = await fetch('/api/system');
      const data = await res.json();
      if (data.success) {
        let versionStr = '1.0.2';
        if (window.electronAPI && window.electronAPI.getAppVersion) {
          try {
            versionStr = await window.electronAPI.getAppVersion();
          } catch {}
        } else if (data.appVersion) {
          versionStr = data.appVersion;
        }
        this.installedVersion = versionStr;

        // Update all elements showing installed version
        document.querySelectorAll('.display-installed-version').forEach(el => {
          el.textContent = `v${versionStr}`;
        });

        const isMac = data.platform === 'darwin';
        const isArm = data.arch === 'arm64';
        const statusTitle = document.getElementById('sys-status-title');
        const statusSub = document.getElementById('sys-status-sub');
        const badge = document.getElementById('app-platform-badge');

        if (isMac) {
          statusTitle.textContent = `v${versionStr} • ${isArm ? 'Apple Silicon' : 'Intel'}`;
          statusSub.textContent = isArm ? 'macOS ARM64 (zsh)' : 'macOS x86_64';
          badge.textContent = `v${versionStr} • macOS ${isArm ? 'ARM64' : 'x64'}`;
        } else if (data.platform === 'win32') {
          statusTitle.textContent = `v${versionStr} (Installed)`;
          statusSub.textContent = `Windows ${data.arch} • ConPTY`;
          badge.textContent = `v${versionStr} • Windows ${data.arch}`;
        } else {
          statusTitle.textContent = `v${versionStr} (Installed)`;
          statusSub.textContent = data.platformLabel;
          badge.textContent = `v${versionStr} • ${data.platformLabel}`;
        }
      }
    } catch (e) {
      console.warn('System detection fallback:', e);
    }
  }

  bindEvents() {
    // Nav items
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.switchView(view);
      });
    });

    // Hosts search & buttons
    document.getElementById('host-search').addEventListener('input', (e) => {
      this.renderHosts(e.target.value);
    });

    document.getElementById('btn-add-host').addEventListener('click', () => {
      this.openHostModal();
    });

    document.getElementById('host-color').addEventListener('input', (e) => {
      document.getElementById('color-hex-label').textContent = e.target.value;
    });

    // Host modal tabs (SSH vs Local)
    document.querySelectorAll('.modal-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const type = tab.dataset.hostType;
        this.switchHostTypeTab(type);
      });
    });

    // Test connection
    document.getElementById('btn-test-connection').addEventListener('click', () => {
      this.testConnection();
    });

    // Quick shell button
    document.getElementById('btn-quick-local').addEventListener('click', () => {
      this.launchLocal('powershell');
    });

    document.getElementById('btn-reconnect-tab').addEventListener('click', () => {
      this.reconnectActiveTab();
    });

    document.getElementById('btn-clear-tab').addEventListener('click', () => {
      if (this.activeTabId && this.sessions.has(this.activeTabId)) {
        this.sessions.get(this.activeTabId).xterm.clear();
      }
    });

    // Snippets
    document.getElementById('btn-add-snippet').addEventListener('click', () => {
      this.openSnippetModal();
    });

    // Settings save
    document.getElementById('btn-save-settings').addEventListener('click', () => {
      this.saveSettings();
    });

    // Cloud Sync actions
    document.getElementById('btn-cloud-push').addEventListener('click', () => {
      this.pushToCloud();
    });

    document.getElementById('btn-cloud-pull').addEventListener('click', () => {
      this.pullFromCloud();
    });

    // Dual-Pane SFTP actions
    document.getElementById('btn-sftp-connect').addEventListener('click', () => {
      const hostId = document.getElementById('sftp-host-select').value;
      if (hostId) this.connectSftp(hostId);
    });

    document.getElementById('local-drive-select').addEventListener('change', (e) => {
      this.loadLocalDir(e.target.value);
    });

    document.getElementById('btn-local-up').addEventListener('click', () => {
      this.loadLocalParentDir();
    });

    document.getElementById('btn-local-refresh').addEventListener('click', () => {
      this.loadLocalDir(this.localPath);
    });

    document.getElementById('btn-transfer-upload').addEventListener('click', () => {
      this.transferLocalToRemote();
    });

    document.getElementById('btn-transfer-download').addEventListener('click', () => {
      this.transferRemoteToLocal();
    });

    document.getElementById('btn-remote-up').addEventListener('click', () => {
      if (!this.sftp.currentPath) return;
      const parts = this.sftp.currentPath.replace(/\/+$/, '').split('/');
      parts.pop();
      const parentPath = parts.join('/') || '/';
      this.loadSftpDir(parentPath);
    });

    document.getElementById('btn-remote-refresh').addEventListener('click', () => {
      if (this.sftp.currentPath) this.loadSftpDir(this.sftp.currentPath);
    });

    document.getElementById('btn-remote-mkdir').addEventListener('click', () => {
      const name = prompt('Masukkan nama direktori baru di remote:');
      if (name) this.sftpMkdir(name);
    });

    // Tunnels and Key Vault actions
    document.getElementById('btn-add-tunnel').addEventListener('click', () => {
      this.openTunnelModal();
    });

    document.getElementById('btn-generate-key').addEventListener('click', () => {
      this.generateKey('ed25519');
    });

    document.getElementById('btn-import-key').addEventListener('click', () => {
      this.openKeyModal();
    });
  }

  switchView(viewName) {
    this.activeView = viewName;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === viewName);
    });
    document.querySelectorAll('.view-panel').forEach(el => {
      el.classList.toggle('active', el.id === `view-${viewName}`);
    });

    if (viewName === 'terminals') {
      setTimeout(() => this.fitActiveTerminal(), 50);
    } else if (viewName === 'sftp') {
      this.populateSftpHostSelect();
      this.loadLocalDrives();
    } else if (viewName === 'tunnels') {
      this.renderTunnels();
    } else if (viewName === 'keys') {
      this.renderKeys();
    }
  }
  // ----------------------------------------------------------------
  // Settings
  // ----------------------------------------------------------------
  async loadSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        this.settings = data.settings;
        document.getElementById('setting-theme').value = this.settings.theme || 'termius-dark';
        document.getElementById('setting-font-family').value = this.settings.fontFamily || 'Consolas, monospace';
        document.getElementById('setting-font-size').value = this.settings.fontSize || 14;
        document.getElementById('setting-cursor-style').value = this.settings.cursorStyle || 'block';
        document.getElementById('setting-cursor-blink').checked = this.settings.cursorBlink !== false;

        // Cloud sync inputs
        document.getElementById('setting-cloud-url').value = this.settings.cloudApiUrl || '';
        document.getElementById('setting-cloud-key').value = this.settings.cloudSyncKey || '';
        this.updateCloudStatusBadge();
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  updateCloudStatusBadge() {
    const badge = document.getElementById('cloud-sync-status');
    if (this.settings.cloudApiUrl && this.settings.cloudSyncKey) {
      badge.className = 'cloud-status-badge synced';
      badge.textContent = this.settings.lastCloudSync 
        ? `Synced (${new Date(this.settings.lastCloudSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` 
        : 'Configured';
    } else {
      badge.className = 'cloud-status-badge';
      badge.textContent = 'Not Configured';
    }
  }

  async saveSettings() {
    const newSettings = {
      theme: document.getElementById('setting-theme').value,
      fontFamily: document.getElementById('setting-font-family').value,
      fontSize: parseInt(document.getElementById('setting-font-size').value, 10) || 14,
      cursorStyle: document.getElementById('setting-cursor-style').value,
      cursorBlink: document.getElementById('setting-cursor-blink').checked,
      cloudApiUrl: document.getElementById('setting-cloud-url').value.trim(),
      cloudSyncKey: document.getElementById('setting-cloud-key').value.trim()
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      const data = await res.json();
      if (data.success) {
        this.settings = data.settings;
        this.updateCloudStatusBadge();
        const ind = document.getElementById('save-settings-indicator');
        ind.textContent = 'Saved successfully!';
        setTimeout(() => ind.textContent = '', 2500);

        // Apply theme/font to all open terminals
        const themeColors = THEMES[this.settings.theme] || THEMES['termius-dark'];
        this.sessions.forEach(sess => {
          sess.xterm.options.theme = themeColors;
          sess.xterm.options.fontFamily = this.settings.fontFamily;
          sess.xterm.options.fontSize = this.settings.fontSize;
          sess.xterm.options.cursorStyle = this.settings.cursorStyle;
          sess.xterm.options.cursorBlink = this.settings.cursorBlink;
          sess.fitAddon.fit();
        });
      }
    } catch (err) {
      alert('Error saving settings: ' + err.message);
    }
  }

  async pushToCloud() {
    const cloudUrl = document.getElementById('setting-cloud-url').value.trim();
    const syncKey = document.getElementById('setting-cloud-key').value.trim();
    const msgEl = document.getElementById('cloud-sync-msg');

    if (!cloudUrl || !syncKey) {
      alert('Please fill in both Cloud API URL and Sync Key first.');
      return;
    }

    msgEl.className = 'cloud-sync-message';
    msgEl.textContent = 'Pushing data to Vercel cloud...';

    try {
      const res = await fetch('/api/cloud/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloudApiUrl: cloudUrl, syncKey })
      });
      const data = await res.json();
      if (data.success) {
        msgEl.className = 'cloud-sync-message success';
        msgEl.textContent = '✓ Uploaded to cloud!';
        this.settings.lastCloudSync = data.timestamp;
        this.updateCloudStatusBadge();
        setTimeout(() => msgEl.textContent = '', 3500);
      } else {
        msgEl.className = 'cloud-sync-message error';
        msgEl.textContent = '✗ ' + (data.error || 'Push failed');
      }
    } catch (e) {
      msgEl.className = 'cloud-sync-message error';
      msgEl.textContent = '✗ Network error: ' + e.message;
    }
  }

  async pullFromCloud() {
    const cloudUrl = document.getElementById('setting-cloud-url').value.trim();
    const syncKey = document.getElementById('setting-cloud-key').value.trim();
    const msgEl = document.getElementById('cloud-sync-msg');

    if (!cloudUrl || !syncKey) {
      alert('Please fill in both Cloud API URL and Sync Key first.');
      return;
    }

    if (!confirm('Pulling from cloud will sync your local hosts, snippets, and settings. Continue?')) {
      return;
    }

    msgEl.className = 'cloud-sync-message';
    msgEl.textContent = 'Pulling data from Vercel cloud...';

    try {
      const res = await fetch('/api/cloud/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloudApiUrl: cloudUrl, syncKey })
      });
      const data = await res.json();
      if (data.success) {
        msgEl.className = 'cloud-sync-message success';
        msgEl.textContent = '✓ Cloud data loaded!';
        await this.loadHosts();
        await this.loadSnippets();
        await this.loadSettings();
        setTimeout(() => msgEl.textContent = '', 3500);
      } else {
        msgEl.className = 'cloud-sync-message error';
        msgEl.textContent = '✗ ' + (data.error || 'Pull failed');
      }
    } catch (e) {
      msgEl.className = 'cloud-sync-message error';
      msgEl.textContent = '✗ Network error: ' + e.message;
    }
  }

  // ----------------------------------------------------------------
  async loadFolders() {
    try {
      const res = await fetch('/api/folders');
      const data = await res.json();
      if (data.success) {
        this.folders = data.folders || [];
      }
    } catch (e) {
      console.warn('Folders load error:', e);
    }
  }

  async loadHosts() {
    try {
      await this.loadFolders();
      const res = await fetch('/api/hosts');
      const data = await res.json();
      if (data.success) {
        this.hosts = data.hosts;
        this.renderGroupFilters();
        this.renderHosts();
      }
    } catch (err) {
      console.error('Failed to load hosts:', err);
    }
  }

  renderGroupFilters() {
    const groups = ['All', ...new Set(this.hosts.map(h => h.group || 'Default'))];
    const container = document.getElementById('host-group-filters');
    container.innerHTML = '';

    groups.forEach(g => {
      const chip = document.createElement('button');
      chip.className = `filter-chip ${this.activeFilterGroup === g ? 'active' : ''}`;
      chip.textContent = g;
      chip.addEventListener('click', () => {
        this.activeFilterGroup = g;
        this.renderGroupFilters();
        this.renderHosts(document.getElementById('host-search').value);
      });
      container.appendChild(chip);
    });
  }

  renderHosts(searchTerm = '') {
    const grid = document.getElementById('hosts-grid');
    const foldersShelf = document.getElementById('folders-shelf');
    const rootZone = document.getElementById('root-drop-zone');

    if (grid) grid.innerHTML = '';
    if (foldersShelf) foldersShelf.innerHTML = '';

    // Setup Root Drop Zone
    if (rootZone) {
      rootZone.ondragover = (e) => {
        e.preventDefault();
        rootZone.classList.add('drag-over');
      };
      rootZone.ondragleave = () => {
        rootZone.classList.remove('drag-over');
      };
      rootZone.ondrop = async (e) => {
        e.preventDefault();
        rootZone.classList.remove('drag-over');
        const hostId = e.dataTransfer.getData('text/plain') || this.draggedHostId;
        if (hostId) {
          await this.moveHostToFolder(hostId, null);
        }
      };
    }

    const query = searchTerm.toLowerCase().trim();
    const filtered = this.hosts.filter(h => {
      const matchGroup = this.activeFilterGroup === 'All' || h.group === this.activeFilterGroup;
      const matchSearch = !query || 
        h.label.toLowerCase().includes(query) ||
        (h.hostname && h.hostname.toLowerCase().includes(query)) ||
        (h.group && h.group.toLowerCase().includes(query)) ||
        (h.shellType && h.shellType.toLowerCase().includes(query));
      return matchGroup && matchSearch;
    });

    // 1. Render Folders
    if (foldersShelf && this.folders.length > 0) {
      this.folders.forEach(folder => {
        const folderHosts = filtered.filter(h => h.folderId === folder.id);
        const folderBox = document.createElement('div');
        folderBox.className = `folder-box ${folder.collapsed ? 'collapsed' : ''}`;
        folderBox.id = `folder-box-${folder.id}`;

        folderBox.innerHTML = `
          <div class="folder-header" onclick="app.toggleFolderCollapse('${folder.id}')">
            <div class="folder-title-left">
              <span class="folder-chevron">▼</span>
              <span class="folder-icon">${folder.icon || '📁'}</span>
              <span class="folder-name" style="color: ${folder.color || 'var(--text-primary)'}">${this.escapeHtml(folder.name)}</span>
              <span class="folder-count-badge">${folderHosts.length} hosts</span>
            </div>
            <div class="folder-actions" onclick="event.stopPropagation()">
              <button class="btn-card-icon" title="Edit Folder" onclick="app.openFolderModal('${folder.id}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn-card-icon" title="Hapus Folder" onclick="app.deleteFolder('${folder.id}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="folder-content" id="folder-content-${folder.id}">
          </div>
        `;

        const contentGrid = folderBox.querySelector('.folder-content');
        if (folderHosts.length === 0) {
          contentGrid.innerHTML = `<div class="folder-drop-empty">Drag host ke sini untuk mengelompokkan ke "${this.escapeHtml(folder.name)}"</div>`;
        } else {
          folderHosts.forEach(h => {
            contentGrid.appendChild(this.createHostCard(h));
          });
        }

        // Folder Drag & Drop target
        folderBox.addEventListener('dragover', (e) => {
          e.preventDefault();
          folderBox.classList.add('drag-over');
        });
        folderBox.addEventListener('dragleave', () => {
          folderBox.classList.remove('drag-over');
        });
        folderBox.addEventListener('drop', async (e) => {
          e.preventDefault();
          folderBox.classList.remove('drag-over');
          const hostId = e.dataTransfer.getData('text/plain') || this.draggedHostId;
          if (hostId) {
            await this.moveHostToFolder(hostId, folder.id);
          }
        });

        foldersShelf.appendChild(folderBox);
      });
    }

    // 2. Render Root (Unassigned) Hosts
    const rootHosts = filtered.filter(h => !h.folderId || !this.folders.some(f => f.id === h.folderId));

    if (rootHosts.length === 0 && (!this.folders || this.folders.length === 0)) {
      if (grid) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-muted)">
            <p>Belum ada host. Klik "+ Add Host" untuk menambahkan server baru.</p>
          </div>
        `;
      }
      return;
    }

    if (grid) {
      rootHosts.forEach(h => {
        grid.appendChild(this.createHostCard(h));
      });
    }
  }

  createHostCard(h) {
    const card = document.createElement('div');
    card.className = 'host-card';
    card.setAttribute('draggable', 'true');
    card.dataset.hostId = h.id;

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', h.id);
      this.draggedHostId = h.id;
      card.classList.add('dragging');
      const rootZone = document.getElementById('root-drop-zone');
      if (rootZone && h.folderId) rootZone.style.display = 'flex';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      this.draggedHostId = null;
      const rootZone = document.getElementById('root-drop-zone');
      if (rootZone) rootZone.style.display = 'none';
    });

    const isSSH = h.type === 'ssh';
    const targetText = isSSH ? `${h.username}@${h.hostname}:${h.port || 22}` : `Windows Local Shell (${h.shellType || 'powershell'})`;
    const color = h.color || '#7b61ff';
    const folder = this.folders.find(f => f.id === h.folderId);

    card.innerHTML = `
      <div class="host-card-border" style="background-color: ${color}"></div>
      <div class="host-card-header">
        <div class="host-card-title-group">
          <div style="display:flex; align-items:center; gap:6px">
            ${folder ? `<span style="font-size:12px;" title="Folder: ${this.escapeHtml(folder.name)}">${folder.icon || '📁'}</span>` : ''}
            <span class="host-label">${this.escapeHtml(h.label)}</span>
          </div>
          <span class="host-target">${this.escapeHtml(targetText)}</span>
        </div>
        <span class="host-group-tag">${this.escapeHtml(h.group || 'Default')}</span>
      </div>

      <div class="host-card-actions">
        <button class="host-btn-connect" onclick="app.connectHost('${h.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>Connect</span>
        </button>
        <div class="host-actions-secondary">
          ${isSSH ? `
            <button class="btn-card-icon" title="Open SFTP Files" onclick="app.quickSftp('${h.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          ` : ''}
          <button class="btn-card-icon" title="Edit Host" onclick="app.openHostModal('${h.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-card-icon" title="Delete Host" onclick="app.deleteHost('${h.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
    return card;
  }

  openFolderModal(folderId = null) {
    const title = document.getElementById('modal-folder-title');
    document.getElementById('form-folder').reset();
    if (folderId) {
      const f = this.folders.find(x => x.id === folderId);
      if (!f) return;
      title.textContent = 'Edit Folder';
      document.getElementById('folder-id').value = f.id;
      document.getElementById('folder-name').value = f.name;
      document.getElementById('folder-icon').value = f.icon || '📁';
      document.getElementById('folder-color').value = f.color || '#7b61ff';
      document.getElementById('folder-color-label').textContent = f.color || '#7b61ff';
    } else {
      title.textContent = 'Buat Folder Baru';
      document.getElementById('folder-id').value = '';
      document.getElementById('folder-color').value = '#7b61ff';
      document.getElementById('folder-color-label').textContent = '#7b61ff';
    }
    document.getElementById('modal-folder').classList.add('active');
  }

  async saveFolder() {
    const id = document.getElementById('folder-id').value;
    const payload = {
      name: document.getElementById('folder-name').value,
      icon: document.getElementById('folder-icon').value,
      color: document.getElementById('folder-color').value
    };

    try {
      const url = id ? `/api/folders/${id}` : '/api/folders';
      const method = id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.closeModal('modal-folder');
        await this.loadHosts();
        this.triggerDebouncedSync();
      } else {
        alert('Gagal menyimpan folder: ' + data.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async deleteFolder(folderId) {
    if (!confirm('Hapus folder ini? Host di dalamnya akan dipindahkan ke daftar utama (root).')) return;
    try {
      const res = await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.loadHosts();
        this.triggerDebouncedSync();
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  toggleFolderCollapse(folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (folder) {
      folder.collapsed = !folder.collapsed;
      const el = document.getElementById(`folder-box-${folderId}`);
      if (el) el.classList.toggle('collapsed', folder.collapsed);
      fetch(`/api/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collapsed: folder.collapsed })
      }).catch(() => {});
    }
  }

  async moveHostToFolder(hostId, folderId) {
    try {
      const res = await fetch(`/api/hosts/${hostId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId })
      });
      const data = await res.json();
      if (data.success) {
        const host = this.hosts.find(h => h.id === hostId);
        if (host) host.folderId = folderId;
        this.renderHosts(document.getElementById('host-search')?.value || '');
        this.triggerDebouncedSync();
      }
    } catch (err) {
      console.error('Move host error:', err);
    }
  }

  triggerDebouncedSync() {
    if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
    this.syncDebounceTimer = setTimeout(() => {
      const cloudUrl = this.settings?.cloudApiUrl;
      const syncKey = this.settings?.cloudSyncKey;
      if (cloudUrl && syncKey) {
        this.pushToCloud().catch(() => {});
      }
    }, 1500);
  }

  openHostModal(hostId = null) {
    const modal = document.getElementById('modal-host');
    const title = document.getElementById('modal-host-title');
    const resultBox = document.getElementById('test-connection-result');
    resultBox.className = 'test-result';
    resultBox.style.display = 'none';

    // Populate Folder dropdown
    const folderSelect = document.getElementById('host-folder-id');
    if (folderSelect) {
      folderSelect.innerHTML = '<option value="">-- Tanpa Folder (Root) --</option>';
      (this.folders || []).forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = `${f.icon || '📁'} ${f.name}`;
        folderSelect.appendChild(opt);
      });
    }

    // Populate Key Vault dropdown (Termius Parity)
    const keySelect = document.getElementById('host-key-id');
    if (keySelect) {
      keySelect.innerHTML = '<option value="">-- Custom Key di bawah atau Tidak Ada --</option>';
      (this.keys || []).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k.id;
        opt.textContent = `${k.label} (${k.keyType})`;
        keySelect.appendChild(opt);
      });
    }

    // Populate ProxyJump / Bastion dropdown (Termius Parity)
    const jumpSelect = document.getElementById('host-proxy-jump');
    if (jumpSelect) {
      jumpSelect.innerHTML = '<option value="">Direct Connection (Tanpa Bastion / Jump Host)</option>';
      (this.hosts || []).filter(h => h.type === 'ssh' && (!hostId || h.id !== hostId)).forEach(h => {
        const opt = document.createElement('option');
        opt.value = h.id;
        opt.textContent = `${h.label} (${h.username}@${h.hostname})`;
        jumpSelect.appendChild(opt);
      });
    }

    if (hostId) {
      const h = this.hosts.find(x => x.id === hostId);
      if (!h) return;
      title.textContent = 'Edit Host';
      document.getElementById('host-id').value = h.id;
      document.getElementById('host-label').value = h.label;
      document.getElementById('host-group').value = h.group || 'Default';
      document.getElementById('host-color').value = h.color || '#7b61ff';
      document.getElementById('color-hex-label').textContent = h.color || '#7b61ff';

      if (h.type === 'local') {
        this.switchHostTypeTab('local');
        document.getElementById('host-shell-type').value = h.shellType || 'powershell';
      } else {
        this.switchHostTypeTab('ssh');
        document.getElementById('host-hostname').value = h.hostname || '';
        document.getElementById('host-port').value = h.port || 22;
        document.getElementById('host-username').value = h.username || '';
        document.getElementById('host-password').value = h.password || '';
        document.getElementById('host-key').value = h.privateKey || '';
        document.getElementById('host-passphrase').value = h.passphrase || '';
        if (folderSelect) folderSelect.value = h.folderId || '';
        if (keySelect) keySelect.value = h.keyId || '';
        if (jumpSelect) jumpSelect.value = h.proxyJumpHostId || '';
        this.toggleAuthType(h.authType || 'password');
        document.querySelector(`input[name="authType"][value="${h.authType || 'password'}"]`).checked = true;
      }
    } else {
      title.textContent = 'Add New Host';
      document.getElementById('form-host').reset();
      document.getElementById('host-id').value = '';
      document.getElementById('host-color').value = '#7b61ff';
      document.getElementById('color-hex-label').textContent = '#7b61ff';
      if (folderSelect) folderSelect.value = '';
      if (keySelect) keySelect.value = '';
      if (jumpSelect) jumpSelect.value = '';
      this.switchHostTypeTab('ssh');
      this.toggleAuthType('password');
    }

    modal.classList.add('active');
  }

  onHostKeyVaultChange() {
    const keyId = document.getElementById('host-key-id').value;
    if (keyId && this.keys) {
      const keyItem = this.keys.find(k => k.id === keyId);
      if (keyItem) {
        document.getElementById('host-key').value = keyItem.privateKey || '';
        if (keyItem.passphrase) {
          document.getElementById('host-passphrase').value = keyItem.passphrase;
        }
      }
    }
  }

  switchHostTypeTab(type) {
    document.getElementById('host-type').value = type;
    document.getElementById('tab-btn-ssh').classList.toggle('active', type === 'ssh');
    document.getElementById('tab-btn-local').classList.toggle('active', type === 'local');
    document.getElementById('section-ssh-fields').style.display = type === 'ssh' ? 'block' : 'none';
    document.getElementById('section-local-fields').style.display = type === 'local' ? 'block' : 'none';
    document.getElementById('btn-test-connection').style.display = type === 'ssh' ? 'block' : 'none';
  }

  toggleAuthType(type) {
    document.getElementById('group-password').style.display = type === 'password' ? 'block' : 'none';
    document.getElementById('group-key').style.display = type === 'key' ? 'block' : 'none';
  }

  async testConnection() {
    const resultBox = document.getElementById('test-connection-result');
    resultBox.className = 'test-result';
    resultBox.style.display = 'block';
    resultBox.textContent = 'Testing SSH handshake, Bastion, and credentials...';

    const payload = {
      hostname: document.getElementById('host-hostname').value,
      port: document.getElementById('host-port').value,
      username: document.getElementById('host-username').value,
      authType: document.querySelector('input[name="authType"]:checked').value,
      password: document.getElementById('host-password').value,
      privateKey: document.getElementById('host-key').value,
      passphrase: document.getElementById('host-passphrase').value,
      keyId: document.getElementById('host-key-id')?.value || undefined,
      proxyJumpHostId: document.getElementById('host-proxy-jump')?.value || undefined
    };

    try {
      const res = await fetch('/api/hosts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        resultBox.className = 'test-result success';
        resultBox.textContent = '✓ ' + data.message;
      } else {
        resultBox.className = 'test-result error';
        resultBox.textContent = '✗ ' + (data.error || 'Connection failed');
      }
    } catch (err) {
      resultBox.className = 'test-result error';
      resultBox.textContent = '✗ Network error: ' + err.message;
    }
  }

  async saveHost() {
    const id = document.getElementById('host-id').value;
    const type = document.getElementById('host-type').value;

    const payload = {
      label: document.getElementById('host-label').value,
      type: type,
      group: document.getElementById('host-group').value || 'Default',
      color: document.getElementById('host-color').value || '#7b61ff',
      folderId: document.getElementById('host-folder-id')?.value || null
    };

    if (type === 'ssh') {
      payload.hostname = document.getElementById('host-hostname').value;
      payload.port = parseInt(document.getElementById('host-port').value, 10) || 22;
      payload.username = document.getElementById('host-username').value;
      payload.authType = document.querySelector('input[name="authType"]:checked').value;
      payload.password = document.getElementById('host-password').value;
      payload.privateKey = document.getElementById('host-key').value;
      payload.passphrase = document.getElementById('host-passphrase').value;
      payload.keyId = document.getElementById('host-key-id')?.value || undefined;
      payload.proxyJumpHostId = document.getElementById('host-proxy-jump')?.value || undefined;
      payload.startupScript = document.getElementById('host-startup-script')?.value || undefined;
    } else {
      payload.shellType = document.getElementById('host-shell-type').value;
    }

    try {
      const url = id ? `/api/hosts/${id}` : '/api/hosts';
      const method = id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.closeModal('modal-host');
        await this.loadHosts();
        this.triggerDebouncedSync();
      } else {
        alert('Failed to save host: ' + data.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  showImportSshConfigModal() {
    const resultBox = document.getElementById('ssh-config-import-result');
    if (resultBox) {
      resultBox.style.display = 'none';
      resultBox.className = 'test-result';
    }
    const pathInput = document.getElementById('ssh-config-path-input');
    if (pathInput) pathInput.value = '';
    document.getElementById('modal-ssh-config-import').classList.add('active');
  }

  async executeImportSshConfig() {
    const resultBox = document.getElementById('ssh-config-import-result');
    resultBox.style.display = 'block';
    resultBox.className = 'test-result';
    resultBox.textContent = 'Membaca konfigurasi SSH dan mengimpor host...';

    const customPath = document.getElementById('ssh-config-path-input').value.trim();
    try {
      const res = await fetch('/api/hosts/import-ssh-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customPath: customPath || undefined })
      });
      const data = await res.json();
      if (data.success) {
        resultBox.className = 'test-result success';
        resultBox.textContent = `✓ Berhasil mengimpor ${data.importedCount} host baru (${data.skippedCount} dilewati karena sudah ada). Total host: ${data.totalCount}`;
        await this.loadHosts();
        await this.loadKeys();
        setTimeout(() => {
          this.closeModal('modal-ssh-config-import');
        }, 1600);
      } else {
        resultBox.className = 'test-result error';
        resultBox.textContent = '✗ ' + (data.error || 'Gagal mengimpor file config.');
      }
    } catch (err) {
      resultBox.className = 'test-result error';
      resultBox.textContent = '✗ Network error: ' + err.message;
    }
  }

  async deleteHost(hostId) {
    if (!confirm('Are you sure you want to delete this host?')) return;
    try {
      const res = await fetch(`/api/hosts/${hostId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.loadHosts();
      }
    } catch (err) {
      alert('Error deleting host: ' + err.message);
    }
  }

  // ----------------------------------------------------------------
  // Terminal Engine (xterm.js + WebSockets + Multi-Tab)
  // ----------------------------------------------------------------
  launchLocal(shellType = 'powershell') {
    let host = this.hosts.find(h => h.type === 'local' && h.shellType === shellType);
    if (!host) {
      host = {
        id: 'local-' + shellType,
        label: 'Local ' + shellType.toUpperCase(),
        type: 'local',
        shellType: shellType,
        color: '#00d2ff'
      };
    }
    this.connectHost(host.id, host);
  }

  connectHost(hostId, explicitHost = null) {
    const host = explicitHost || this.hosts.find(h => h.id === hostId);
    if (!host) return;

    this.switchView('terminals');
    document.getElementById('empty-terminal-prompt').style.display = 'none';

    const tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

    // Create tab UI
    const tabEl = document.createElement('div');
    tabEl.className = 'terminal-tab active';
    tabEl.id = `btn-${tabId}`;
    tabEl.innerHTML = `
      <span class="tab-badge-dot" style="background-color: ${host.color || '#7b61ff'}"></span>
      <span class="tab-title">${this.escapeHtml(host.label)}</span>
      <button class="tab-close" title="Close Session">&times;</button>
    `;

    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });

    tabEl.addEventListener('click', () => {
      this.activateTab(tabId);
    });

    document.getElementById('terminal-tabs').appendChild(tabEl);

    // Create terminal container element
    const containerEl = document.createElement('div');
    containerEl.className = 'terminal-pane active';
    containerEl.id = `pane-${tabId}`;
    document.getElementById('terminal-viewport').appendChild(containerEl);

    // Instantiate xterm
    const themeColors = THEMES[this.settings.theme] || THEMES['termius-dark'];
    const term = new Terminal({
      cursorBlink: this.settings.cursorBlink !== false,
      cursorStyle: this.settings.cursorStyle || 'block',
      fontFamily: this.settings.fontFamily || 'Consolas, monospace',
      fontSize: this.settings.fontSize || 14,
      lineHeight: 1.25,
      theme: themeColors,
      allowTransparency: true,
      scrollback: 10000
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    if (window.WebLinksAddon && WebLinksAddon.WebLinksAddon) {
      term.loadAddon(new WebLinksAddon.WebLinksAddon());
    }

    term.open(containerEl);
    fitAddon.fit();

    // Establish WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    const sessionObj = {
      id: tabId,
      host,
      xterm: term,
      fitAddon,
      ws,
      containerEl,
      tabEl,
      status: 'connecting'
    };

    this.sessions.set(tabId, sessionObj);
    this.activateTab(tabId);
    this.updateActiveTabsCount();

    ws.onopen = () => {
      // Send initialization message
      ws.send(JSON.stringify({
        type: 'init',
        hostId: host.id,
        cols: term.cols,
        rows: term.rows
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data') {
          term.write(msg.data);
        } else if (msg.type === 'status') {
          if (msg.status === 'connected') {
            sessionObj.status = 'connected';
            term.writeln(`\r\n\x1b[32m[LuluaX-Term] ${msg.message}\x1b[0m\r\n`);
          } else if (msg.status === 'disconnected') {
            sessionObj.status = 'disconnected';
            term.writeln(`\r\n\x1b[33m[LuluaX-Term] ${msg.message}\x1b[0m\r\n`);
          } else if (msg.status === 'connecting') {
            term.writeln(`\x1b[90m[LuluaX-Term] ${msg.message}\x1b[0m`);
          }
        } else if (msg.type === 'error') {
          term.writeln(`\r\n\x1b[31m[LuluaX-Term Error] ${msg.message}\x1b[0m\r\n`);
        }
      } catch (err) {
        term.write(event.data);
      }
    };

    ws.onclose = () => {
      sessionObj.status = 'disconnected';
      term.writeln('\r\n\x1b[90m[LuluaX-Term] Connection closed.\x1b[0m\r\n');
    };

    // User typing input to shell (with Termius-style Broadcast Input)
    term.onData((data) => {
      if (this.broadcastEnabled) {
        this.sessions.forEach(sess => {
          if (sess.ws && sess.ws.readyState === WebSocket.OPEN) {
            sess.ws.send(JSON.stringify({ type: 'data', data }));
          }
        });
      } else {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }));
        }
      }
    });

    // Terminal resize event
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    setTimeout(() => {
      fitAddon.fit();
      term.focus();
    }, 100);
  }

  activateTab(tabId) {
    if (!this.sessions.has(tabId)) return;
    this.activeTabId = tabId;

    document.querySelectorAll('.terminal-tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.terminal-pane').forEach(el => el.classList.remove('active'));

    const sess = this.sessions.get(tabId);
    sess.tabEl.classList.add('active');
    sess.containerEl.classList.add('active');

    setTimeout(() => {
      sess.fitAddon.fit();
      sess.xterm.focus();
    }, 50);
  }

  closeTab(tabId) {
    const sess = this.sessions.get(tabId);
    if (!sess) return;

    if (sess.ws) sess.ws.close();
    if (sess.xterm) sess.xterm.dispose();
    if (sess.tabEl) sess.tabEl.remove();
    if (sess.containerEl) sess.containerEl.remove();

    this.sessions.delete(tabId);
    this.updateActiveTabsCount();

    if (this.activeTabId === tabId) {
      const remaining = Array.from(this.sessions.keys());
      if (remaining.length > 0) {
        this.activateTab(remaining[remaining.length - 1]);
      } else {
        this.activeTabId = null;
        document.getElementById('empty-terminal-prompt').style.display = 'flex';
      }
    }
  }

  reconnectActiveTab() {
    if (!this.activeTabId || !this.sessions.has(this.activeTabId)) return;
    const sess = this.sessions.get(this.activeTabId);
    const host = sess.host;
    this.closeTab(this.activeTabId);
    this.connectHost(host.id, host);
  }

  fitActiveTerminal() {
    if (this.activeTabId && this.sessions.has(this.activeTabId)) {
      const sess = this.sessions.get(this.activeTabId);
      sess.fitAddon.fit();
    }
  }

  updateActiveTabsCount() {
    const count = this.sessions.size;
    document.getElementById('active-tabs-count').textContent = count;
  }

  toggleBroadcast() {
    this.broadcastEnabled = !this.broadcastEnabled;
    const btn = document.getElementById('btn-broadcast-toggle');
    const badge = document.getElementById('broadcast-badge');
    if (btn) btn.classList.toggle('broadcast-active', this.broadcastEnabled);
    if (badge) {
      badge.textContent = this.broadcastEnabled ? 'Broadcast ON' : 'Broadcast OFF';
    }
  }

  saveSessionLog() {
    if (!this.activeTabId || !this.sessions.has(this.activeTabId)) {
      alert('Pilih tab terminal yang aktif terlebih dahulu.');
      return;
    }
    const sess = this.sessions.get(this.activeTabId);
    const buffer = sess.xterm.buffer.active;
    let text = '';
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) text += line.translateToString(true) + '\n';
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const hostLabel = (sess.host?.label || 'session').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `terminal_${hostLabel}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  sendToActiveTerminal(cmd) {
    if (!this.activeTabId || !this.sessions.has(this.activeTabId)) {
      alert('Please open or select a terminal tab first.');
      this.switchView('terminals');
      return;
    }

    // Check for {{variable}} placeholders (Termius Parity)
    const matches = [...cmd.matchAll(/\{\{([^}]+)\}\}/g)];
    if (matches.length > 0) {
      const uniqueVars = [...new Set(matches.map(m => m[1].trim()))];
      this.openSnippetVariablesModal(cmd, uniqueVars);
      return;
    }

    const sess = this.sessions.get(this.activeTabId);
    if (sess.ws && sess.ws.readyState === WebSocket.OPEN) {
      sess.ws.send(JSON.stringify({ type: 'data', data: cmd + '\n' }));
      this.switchView('terminals');
      sess.xterm.focus();
    }
  }

  openSnippetVariablesModal(cmd, variables) {
    this.pendingSnippetCmd = cmd;
    const container = document.getElementById('snippet-variables-form-container');
    container.innerHTML = '';
    variables.forEach(varName => {
      const row = document.createElement('div');
      row.className = 'snippet-var-row';
      row.innerHTML = `
        <label class="snippet-var-label">${this.escapeHtml(varName)}</label>
        <input type="text" class="form-input snippet-var-input" data-var="${this.escapeHtml(varName)}" placeholder="Nilai untuk {{${this.escapeHtml(varName)}}}">
      `;
      container.appendChild(row);
    });
    document.getElementById('modal-snippet-variables').classList.add('active');
  }

  executeSnippetWithVariables() {
    if (!this.pendingSnippetCmd) return;
    let finalCmd = this.pendingSnippetCmd;
    const inputs = document.querySelectorAll('.snippet-var-input');
    inputs.forEach(input => {
      const varName = input.dataset.var;
      const value = input.value || '';
      const regex = new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, 'g');
      finalCmd = finalCmd.replace(regex, value);
    });

    this.closeModal('modal-snippet-variables');
    this.pendingSnippetCmd = null;

    if (!this.activeTabId || !this.sessions.has(this.activeTabId)) {
      alert('Pilih tab terminal yang aktif terlebih dahulu.');
      return;
    }
    const sess = this.sessions.get(this.activeTabId);
    if (sess.ws && sess.ws.readyState === WebSocket.OPEN) {
      sess.ws.send(JSON.stringify({ type: 'data', data: finalCmd + '\n' }));
      this.switchView('terminals');
      sess.xterm.focus();
    }
  }

  // ----------------------------------------------------------------
  // Snippets
  // ----------------------------------------------------------------
  async loadSnippets() {
    try {
      const res = await fetch('/api/snippets');
      const data = await res.json();
      if (data.success) {
        this.snippets = data.snippets;
        this.renderSnippets();
        this.renderQuickSnippets();
      }
    } catch (err) {
      console.error('Failed to load snippets:', err);
    }
  }

  renderSnippets() {
    const grid = document.getElementById('snippets-grid');
    grid.innerHTML = '';

    this.snippets.forEach(s => {
      const card = document.createElement('div');
      card.className = 'snippet-card';
      card.innerHTML = `
        <div class="snippet-card-header">
          <div>
            <div class="snippet-card-title">${this.escapeHtml(s.title)}</div>
            <div class="snippet-card-desc">${this.escapeHtml(s.description || '')}</div>
          </div>
          <span class="host-group-tag">${this.escapeHtml(s.category || 'General')}</span>
        </div>
        <div class="snippet-code-box">${this.escapeHtml(s.command)}</div>
        <div class="snippet-card-footer">
          <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px" onclick="app.sendToActiveTerminal('${this.escapeJs(s.command)}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Run in Terminal</span>
          </button>
          <div class="snippet-actions">
            <button class="btn-card-icon" title="Copy Command" onclick="navigator.clipboard.writeText('${this.escapeJs(s.command)}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <button class="btn-card-icon" title="Delete Snippet" onclick="app.deleteSnippet('${s.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  renderQuickSnippets() {
    const container = document.getElementById('snippets-quick-chips');
    container.innerHTML = '';

    this.snippets.slice(0, 8).forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'snippet-chip';
      chip.textContent = s.title;
      chip.title = s.command;
      chip.addEventListener('click', () => {
        this.sendToActiveTerminal(s.command);
      });
      container.appendChild(chip);
    });
  }

  openSnippetModal() {
    document.getElementById('form-snippet').reset();
    document.getElementById('snippet-id').value = '';
    document.getElementById('modal-snippet').classList.add('active');
  }

  async saveSnippet() {
    const payload = {
      title: document.getElementById('snippet-title').value,
      category: document.getElementById('snippet-category').value || 'General',
      description: document.getElementById('snippet-desc').value,
      command: document.getElementById('snippet-command').value
    };

    try {
      const res = await fetch('/api/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.closeModal('modal-snippet');
        await this.loadSnippets();
      }
    } catch (err) {
      alert('Error saving snippet: ' + err.message);
    }
  }

  async deleteSnippet(id) {
    if (!confirm('Delete this snippet?')) return;
    try {
      const res = await fetch(`/api/snippets/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.loadSnippets();
      }
    } catch (err) {
      alert('Error deleting snippet: ' + err.message);
    }
  }

  // ----------------------------------------------------------------
  // SFTP File Manager
  // ----------------------------------------------------------------
  populateSftpHostSelect() {
    const select = document.getElementById('sftp-host-select');
    select.innerHTML = '<option value="">Select SSH Host to Connect...</option>';
    this.hosts.filter(h => h.type === 'ssh').forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = `${h.label} (${h.username}@${h.hostname})`;
      select.appendChild(opt);
    });
  }

  quickSftp(hostId) {
    this.switchView('sftp');
    document.getElementById('sftp-host-select').value = hostId;
    this.connectSftp(hostId);
  }

  async connectSftp(hostId) {
    const listBody = document.getElementById('sftp-file-list');
    listBody.innerHTML = `<tr><td colspan="5" class="empty-cell">Connecting SFTP handshake to host...</td></tr>`;

    try {
      const res = await fetch('/api/sftp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId })
      });
      const data = await res.json();
      if (data.success) {
        this.sftp.sessionId = data.sessionId;
        this.sftp.currentPath = data.initialPath || '/';
        this.loadSftpDir(this.sftp.currentPath);
      } else {
        listBody.innerHTML = `<tr><td colspan="5" class="empty-cell" style="color:var(--danger)">SFTP Connection Failed: ${data.error}</td></tr>`;
      }
    } catch (err) {
      listBody.innerHTML = `<tr><td colspan="5" class="empty-cell" style="color:var(--danger)">Network error: ${err.message}</td></tr>`;
    }
  }

  async loadSftpDir(dirPath) {
    const listBody = document.getElementById('sftp-file-list');
    listBody.innerHTML = `<tr><td colspan="5" class="empty-cell">Reading directory contents...</td></tr>`;

    try {
      const res = await fetch('/api/sftp/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sftp.sessionId, path: dirPath })
      });
      const data = await res.json();
      if (data.success) {
        this.sftp.currentPath = data.path;
        document.getElementById('sftp-current-path').value = data.path;
        this.renderSftpFiles(data.items);
      } else {
        listBody.innerHTML = `<tr><td colspan="5" class="empty-cell" style="color:var(--danger)">Error: ${data.error}</td></tr>`;
      }
    } catch (err) {
      listBody.innerHTML = `<tr><td colspan="5" class="empty-cell" style="color:var(--danger)">Error reading directory: ${err.message}</td></tr>`;
    }
  }

  renderSftpFiles(items) {
    const listBody = document.getElementById('sftp-file-list');
    listBody.innerHTML = '';

    if (!items || items.length === 0) {
      listBody.innerHTML = `<tr><td colspan="5" class="empty-cell">Directory is empty.</td></tr>`;
      return;
    }

    items.forEach(item => {
      if (item.name === '.' || item.name === '..') return;

      const tr = document.createElement('tr');
      const itemPath = this.sftp.currentPath.replace(/\/+$/, '') + '/' + item.name;
      const sizeStr = item.isDirectory ? '--' : this.formatBytes(item.size);
      const modStr = item.modifyTime ? new Date(item.modifyTime).toLocaleString() : '--';

      tr.innerHTML = `
        <td>
          <div class="sftp-name-cell" onclick="app.onSftpItemClick('${this.escapeJs(itemPath)}', ${item.isDirectory})">
            ${item.isDirectory ? `
              <svg class="sftp-icon-dir" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            ` : `
              <svg class="sftp-icon-file" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
            `}
            <span>${this.escapeHtml(item.name)}</span>
          </div>
        </td>
        <td style="font-family:var(--font-mono); font-size:12px">${sizeStr}</td>
        <td style="font-family:var(--font-mono); font-size:12px">${item.permissions || '--'}</td>
        <td style="color:var(--text-muted); font-size:12px">${modStr}</td>
        <td>
          <div style="display:flex; gap:6px">
            ${!item.isDirectory ? `
              <a href="/api/sftp/download?sessionId=${this.sftp.sessionId}&remotePath=${encodeURIComponent(itemPath)}" class="btn-card-icon" title="Download">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </a>
            ` : ''}
            <button class="btn-card-icon" title="Delete" onclick="app.sftpDelete('${this.escapeJs(itemPath)}', ${item.isDirectory})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </td>
      `;
      tr.addEventListener('click', () => {
        document.querySelectorAll('#remote-file-list tr').forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
        this.selectedRemoteFile = { name: item.name, fullPath: itemPath, isDirectory: item.isDirectory };
      });
      listBody.appendChild(tr);
    });
  }

  onSftpItemClick(itemPath, isDirectory) {
    if (isDirectory) {
      this.loadSftpDir(itemPath);
    } else {
      this.openSftpEditor(itemPath);
    }
  }

  async openSftpEditor(filePath) {
    if (!this.sftp || !this.sftp.sessionId) {
      alert('Hubungkan sesi SFTP terlebih dahulu.');
      return;
    }
    this.currentEditingRemoteFile = filePath;
    const filename = filePath.split('/').pop() || filePath;
    document.getElementById('sftp-editor-filename').textContent = filename;
    document.getElementById('sftp-editor-filepath').textContent = filePath;
    const statusEl = document.getElementById('sftp-editor-status');
    statusEl.textContent = 'Memuat file...';
    statusEl.style.color = 'var(--text-muted)';
    const textarea = document.getElementById('sftp-editor-content');
    textarea.value = '';
    document.getElementById('modal-sftp-editor').classList.add('active');

    textarea.onkeydown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.saveSftpEditorContent();
      }
    };

    try {
      const res = await fetch('/api/sftp/read-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sftp.sessionId, filePath })
      });
      const data = await res.json();
      if (data.success) {
        textarea.value = data.content;
        statusEl.textContent = 'Siap diedit (Ctrl+S untuk simpan)';
        statusEl.style.color = 'var(--text-secondary)';
      } else {
        statusEl.textContent = 'Gagal memuat: ' + data.error;
        statusEl.style.color = 'var(--danger)';
      }
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.style.color = 'var(--danger)';
    }
  }

  async saveSftpEditorContent() {
    if (!this.sftp || !this.sftp.sessionId || !this.currentEditingRemoteFile) return;
    const content = document.getElementById('sftp-editor-content').value;
    const statusEl = document.getElementById('sftp-editor-status');
    statusEl.textContent = 'Menyimpan ke server...';
    statusEl.style.color = 'var(--warning)';

    try {
      const res = await fetch('/api/sftp/write-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sftp.sessionId,
          filePath: this.currentEditingRemoteFile,
          content
        })
      });
      const data = await res.json();
      if (data.success) {
        statusEl.textContent = '✓ Tersimpan di server (' + new Date().toLocaleTimeString() + ')';
        statusEl.style.color = 'var(--success)';
      } else {
        statusEl.textContent = '✗ Gagal menyimpan: ' + data.error;
        statusEl.style.color = 'var(--danger)';
      }
    } catch (err) {
      statusEl.textContent = '✗ Error: ' + err.message;
      statusEl.style.color = 'var(--danger)';
    }
  }

  closeSftpEditor() {
    this.closeModal('modal-sftp-editor');
    this.currentEditingRemoteFile = null;
  }

  editSelectedRemoteFile() {
    if (!this.selectedRemoteFile || this.selectedRemoteFile.isDirectory) {
      alert('Pilih file remote (bukan folder) dari tabel terlebih dahulu.');
      return;
    }
    this.openSftpEditor(this.selectedRemoteFile.fullPath);
  }

  async sftpMkdir(dirName) {
    const fullPath = this.sftp.currentPath.replace(/\/+$/, '') + '/' + dirName;
    try {
      const res = await fetch('/api/sftp/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sftp.sessionId, dirPath: fullPath })
      });
      const data = await res.json();
      if (data.success) {
        this.loadSftpDir(this.sftp.currentPath);
      } else {
        alert('Failed to create folder: ' + data.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async sftpDelete(itemPath, isDirectory) {
    if (!confirm(`Are you sure you want to delete ${itemPath}?`)) return;
    try {
      const res = await fetch('/api/sftp/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sftp.sessionId, path: itemPath, isDirectory })
      });
      const data = await res.json();
      if (data.success) {
        this.loadSftpDir(this.sftp.currentPath);
      } else {
        alert('Delete failed: ' + data.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async sftpUploadFile(file) {
    if (!this.sftp.sessionId) return;
    const formData = new FormData();
    formData.append('sessionId', this.sftp.sessionId);
    formData.append('remotePath', this.sftp.currentPath);
    formData.append('file', file);

    const listBody = document.getElementById('sftp-file-list');
    const loadingRow = document.createElement('tr');
    loadingRow.innerHTML = `<td colspan="5" class="empty-cell">Uploading ${file.name}...</td>`;
    listBody.prepend(loadingRow);

    try {
      const res = await fetch('/api/sftp/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        this.loadSftpDir(this.sftp.currentPath);
      } else {
        alert('Upload failed: ' + data.error);
        loadingRow.remove();
      }
    } catch (err) {
      alert('Upload error: ' + err.message);
      loadingRow.remove();
    }
  }

// -------------------------------------------------------------
// Termius Dual-Pane SFTP Implementation
// -------------------------------------------------------------
  async loadLocalDrives() {
    try {
      const res = await fetch('/api/local/drives');
      const data = await res.json();
      if (data.success) {
        this.localDrives = data.drives;
        const select = document.getElementById('local-drive-select');
        select.innerHTML = '';
        this.localDrives.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d;
          opt.textContent = d;
          select.appendChild(opt);
        });
        if (!this.localPath) {
          this.localPath = data.defaultPath || data.drives[0];
        }
        await this.loadLocalDir(this.localPath);
      }
    } catch (e) {
      console.warn('Local drives error:', e);
    }
  }

  async loadLocalDir(targetPath) {
    this.localPath = targetPath;
    document.getElementById('local-current-path').value = targetPath;
    const tbody = document.getElementById('local-file-list');
    tbody.innerHTML = `<tr><td colspan="3" class="empty-cell">Membaca folder lokal...</td></tr>`;

    try {
      const res = await fetch('/api/local/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath })
      });
      const data = await res.json();
      if (data.success) {
        this.renderLocalFiles(data.items);
      } else {
        tbody.innerHTML = `<tr><td colspan="3" class="empty-cell" style="color:var(--danger)">Error: ${data.error}</td></tr>`;
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-cell" style="color:var(--danger)">Error: ${err.message}</td></tr>`;
    }
  }

  loadLocalParentDir() {
    if (!this.localPath) return;
    const isWin = this.localPath.includes('\\');
    const sep = isWin ? '\\' : '/';
    const parts = this.localPath.replace(/[\\/]+$/, '').split(sep);
    if (parts.length > 1) {
      parts.pop();
      let parent = parts.join(sep);
      if (isWin && parent.length === 2 && parent.endsWith(':')) parent += '\\';
      this.loadLocalDir(parent || (isWin ? 'C:\\' : '/'));
    }
  }

  renderLocalFiles(items) {
    const tbody = document.getElementById('local-file-list');
    tbody.innerHTML = '';

    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-cell">Folder kosong.</td></tr>`;
      return;
    }

    items.forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="sftp-name-cell" onclick="app.onLocalItemClick('${this.escapeJs(it.fullPath)}', ${it.isDirectory})">
            ${it.isDirectory ? '📁' : '📄'}
            <span style="font-size:12px">${this.escapeHtml(it.name)}</span>
          </div>
        </td>
        <td style="font-family:var(--font-mono); font-size:11.5px">${it.isDirectory ? '--' : this.formatBytes(it.size)}</td>
        <td style="font-size:11px; color:var(--text-muted)">${new Date(it.modifyTime).toLocaleDateString()}</td>
      `;
      tr.addEventListener('click', () => {
        document.querySelectorAll('#local-file-list tr').forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
        this.selectedLocalFile = it;
      });
      tbody.appendChild(tr);
    });
  }

  onLocalItemClick(fullPath, isDirectory) {
    if (isDirectory) {
      this.loadLocalDir(fullPath);
    }
  }

  async transferLocalToRemote() {
    const msgEl = document.getElementById('transfer-status-msg');
    if (!this.sftp.sessionId) {
      alert('Silakan hubungkan ke server SSH remote terlebih dahulu (panel kanan).');
      return;
    }
    if (!this.selectedLocalFile || this.selectedLocalFile.isDirectory) {
      alert('Pilih satu file lokal di panel kiri untuk di-upload.');
      return;
    }

    msgEl.textContent = `Uploading ${this.selectedLocalFile.name}...`;
    try {
      const res = await fetch('/api/sftp/transfer-local-to-remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sftp.sessionId,
          localFilePath: this.selectedLocalFile.fullPath,
          remoteDirPath: this.sftp.currentPath
        })
      });
      const data = await res.json();
      if (data.success) {
        msgEl.textContent = `✓ Selesai upload!`;
        this.loadSftpDir(this.sftp.currentPath);
        setTimeout(() => msgEl.textContent = '', 3000);
      } else {
        msgEl.textContent = `✗ Gagal: ${data.error}`;
      }
    } catch (e) {
      msgEl.textContent = `✗ Error: ${e.message}`;
    }
  }

  async transferRemoteToLocal() {
    const msgEl = document.getElementById('transfer-status-msg');
    if (!this.sftp.sessionId) {
      alert('Silakan hubungkan ke server SSH remote terlebih dahulu.');
      return;
    }
    if (!this.selectedRemoteFile || this.selectedRemoteFile.isDirectory) {
      alert('Pilih satu file remote di panel kanan untuk di-download ke lokal.');
      return;
    }

    msgEl.textContent = `Downloading ${this.selectedRemoteFile.name}...`;
    try {
      const res = await fetch('/api/sftp/transfer-remote-to-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sftp.sessionId,
          remoteFilePath: this.selectedRemoteFile.fullPath,
          localDirPath: this.localPath
        })
      });
      const data = await res.json();
      if (data.success) {
        msgEl.textContent = `✓ Selesai download!`;
        this.loadLocalDir(this.localPath);
        setTimeout(() => msgEl.textContent = '', 3000);
      } else {
        msgEl.textContent = `✗ Gagal: ${data.error}`;
      }
    } catch (e) {
      msgEl.textContent = `✗ Error: ${e.message}`;
    }
  }

// -------------------------------------------------------------
// Termius Port Forwarding / Tunnels Implementation
// -------------------------------------------------------------
  async loadTunnels() {
    try {
      const res = await fetch('/api/tunnels');
      const data = await res.json();
      if (data.success) {
        this.tunnels = data.tunnels;
        this.renderTunnels();
      }
    } catch (e) {
      console.warn('Tunnels load error:', e);
    }
  }

  renderTunnels() {
    const grid = document.getElementById('tunnels-grid');
    grid.innerHTML = '';

    if (this.tunnels.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:48px; color:var(--text-muted)">Belum ada Port Forwarding / Tunnel. Klik "+ New Tunnel" untuk membuat.</div>`;
      return;
    }

    this.tunnels.forEach(t => {
      const card = document.createElement('div');
      card.className = 'tunnel-card';
      const host = this.hosts.find(h => h.id === t.hostId) || { label: 'Unknown Host' };

      let statusColor = 'var(--text-muted)';
      let statusText = '○ Nonaktif';
      if (t.status === 'active') {
        statusColor = 'var(--success)';
        statusText = `● Listening :${t.localPort} (Aktif)`;
      } else if (t.status === 'error') {
        statusColor = 'var(--danger)';
        statusText = `⚠️ Error: ${t.errorMessage || 'Gagal bind port atau gateway'}`;
      } else if (t.enabled) {
        statusColor = 'var(--warning)';
        statusText = '⏳ Memulai listener...';
      }

      card.innerHTML = `
        <div class="tunnel-header">
          <div>
            <div class="tunnel-title">${this.escapeHtml(t.label)}</div>
            <span class="host-group-tag" style="margin-top:4px">${this.escapeHtml(host.label)}</span>
          </div>
          <label class="switch-toggle">
            <input type="checkbox" ${t.enabled ? 'checked' : ''} onchange="app.toggleTunnel('${t.id}')">
            <span class="slider"></span>
          </label>
        </div>
        <div class="tunnel-route-flow">
          <span class="route-port">:${t.localPort}</span>
          <span class="route-arrow">➔ ${t.tunnelType.toUpperCase()} ➔</span>
          <span class="route-target">${this.escapeHtml(t.remoteHost)}:${t.remotePort}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px">
          <span style="font-size:11px; color:${statusColor}">
            ${statusText}
          </span>
          <button class="btn-card-icon" title="Hapus Tunnel" onclick="app.deleteTunnel('${t.id}')">&times;</button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  openTunnelModal() {
    const select = document.getElementById('tunnel-host-id');
    select.innerHTML = '<option value="">Pilih SSH Host Gateway...</option>';
    this.hosts.filter(h => h.type === 'ssh').forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.textContent = `${h.label} (${h.username}@${h.hostname})`;
      select.appendChild(opt);
    });
    document.getElementById('form-tunnel').reset();
    document.getElementById('modal-tunnel').classList.add('active');
  }

  async saveTunnel() {
    const payload = {
      label: document.getElementById('tunnel-label').value.trim(),
      hostId: document.getElementById('tunnel-host-id').value,
      tunnelType: document.getElementById('tunnel-type').value,
      localPort: parseInt(document.getElementById('tunnel-local-port').value, 10),
      remoteHost: document.getElementById('tunnel-remote-host').value.trim(),
      remotePort: parseInt(document.getElementById('tunnel-remote-port').value, 10),
      enabled: true
    };

    try {
      const res = await fetch('/api/tunnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.closeModal('modal-tunnel');
        await this.loadTunnels();
      }
    } catch (e) {
      alert('Error saving tunnel: ' + e.message);
    }
  }

  async toggleTunnel(id) {
    try {
      await fetch(`/api/tunnels/${id}/toggle`, { method: 'POST' });
      await this.loadTunnels();
    } catch (e) {
      console.warn('Toggle tunnel error:', e);
    }
  }

  async deleteTunnel(id) {
    if (!confirm('Hapus tunnel ini?')) return;
    try {
      await fetch(`/api/tunnels/${id}`, { method: 'DELETE' });
      await this.loadTunnels();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

// -------------------------------------------------------------
// Termius SSH Key Vault Implementation
// -------------------------------------------------------------
  async loadKeys() {
    try {
      const res = await fetch('/api/keys');
      const data = await res.json();
      if (data.success) {
        this.keys = data.keys;
        this.renderKeys();
      }
    } catch (e) {
      console.warn('Keys load error:', e);
    }
  }

  renderKeys() {
    const grid = document.getElementById('keys-grid');
    grid.innerHTML = '';

    if (this.keys.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:48px; color:var(--text-muted)">Key Vault kosong. Klik "+ Generate Key" untuk membuat cryptographic keypair Ed25519 baru.</div>`;
      return;
    }

    this.keys.forEach(k => {
      const card = document.createElement('div');
      card.className = 'key-card';
      card.innerHTML = `
        <div class="key-header">
          <div>
            <div class="key-title">${this.escapeHtml(k.label)}</div>
            <span class="host-group-tag" style="margin-top:4px">${k.keyType.toUpperCase()}</span>
          </div>
          <button class="btn-card-icon" title="Hapus Key" onclick="app.deleteKey('${k.id}')">&times;</button>
        </div>
        <div class="key-fingerprint">
          ${this.escapeHtml(k.publicKey.substring(0, 75))}...
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center">
          <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${this.escapeJs(k.publicKey)}'); alert('Public Key disalin ke clipboard! Tempelkan pada ~/.ssh/authorized_keys remote.')">
            📋 Salin Public Key
          </button>
          <span style="font-size:11px; color:var(--text-muted)">${new Date(k.createdAt).toLocaleDateString()}</span>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  async generateKey(keyType = 'ed25519') {
    const label = prompt('Nama Kunci (Key Label):', 'My Ed25519 Key');
    if (!label) return;

    try {
      const res = await fetch('/api/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyType, label })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Kunci ${keyType.toUpperCase()} berhasil dibuat! Public Key siap dipasang di server.`);
        await this.loadKeys();
      }
    } catch (e) {
      alert('Gagal generate key: ' + e.message);
    }
  }

  openKeyModal() {
    document.getElementById('form-key').reset();
    document.getElementById('modal-key').classList.add('active');
  }

  async saveImportedKey() {
    const payload = {
      label: document.getElementById('key-label').value.trim(),
      privateKey: document.getElementById('key-private').value.trim(),
      publicKey: document.getElementById('key-public').value.trim() || 'Imported Private Key',
      keyType: 'rsa'
    };

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.closeModal('modal-key');
        await this.loadKeys();
      }
    } catch (e) {
      alert('Error saving key: ' + e.message);
    }
  }

  async deleteKey(id) {
    if (!confirm('Hapus kunci ini dari Vault?')) return;
    try {
      await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      await this.loadKeys();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  // ----------------------------------------------------------------
  // Utilities
  // ----------------------------------------------------------------
  // Utilities
  // ----------------------------------------------------------------
  closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

// Global instance
const app = new LuluaXTermApp();
