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

    this.init();
  }

  async init() {
    this.bindEvents();
    await this.detectSystem();
    await this.loadSettings();
    await this.loadHosts();
    await this.loadSnippets();

    // Auto-resize terminals when window size changes
    window.addEventListener('resize', () => {
      this.fitActiveTerminal();
    });
  }

  async detectSystem() {
    try {
      const res = await fetch('/api/system');
      const data = await res.json();
      if (data.success) {
        const isMac = data.platform === 'darwin';
        const isArm = data.arch === 'arm64';
        const statusTitle = document.getElementById('sys-status-title');
        const statusSub = document.getElementById('sys-status-sub');
        const badge = document.getElementById('app-platform-badge');

        if (isMac) {
          statusTitle.textContent = isArm ? 'Apple Silicon PTY' : 'macOS PTY';
          statusSub.textContent = isArm ? 'ARM64 (M-Series)' : 'x86_64 (Intel)';
          badge.textContent = `macOS ${isArm ? 'Apple Silicon' : 'Intel'}`;
        } else if (data.platform === 'win32') {
          statusTitle.textContent = 'ConPTY Ready';
          statusSub.textContent = `Windows ${data.arch}`;
          badge.textContent = `Windows ${data.arch}`;
        } else {
          statusTitle.textContent = 'PTY Ready';
          statusSub.textContent = data.platformLabel;
          badge.textContent = data.platformLabel;
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

    // SFTP actions
    document.getElementById('btn-sftp-connect').addEventListener('click', () => {
      const hostId = document.getElementById('sftp-host-select').value;
      if (hostId) this.connectSftp(hostId);
    });

    document.getElementById('btn-sftp-up').addEventListener('click', () => {
      if (!this.sftp.currentPath) return;
      const parts = this.sftp.currentPath.replace(/\/+$/, '').split('/');
      parts.pop();
      const parentPath = parts.join('/') || '/';
      this.loadSftpDir(parentPath);
    });

    document.getElementById('btn-sftp-refresh').addEventListener('click', () => {
      if (this.sftp.currentPath) this.loadSftpDir(this.sftp.currentPath);
    });

    document.getElementById('btn-sftp-mkdir').addEventListener('click', () => {
      const name = prompt('Enter new directory name:');
      if (name) this.sftpMkdir(name);
    });

    document.getElementById('sftp-file-input').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.sftpUploadFile(e.target.files[0]);
      }
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
  // Hosts
  // ----------------------------------------------------------------
  async loadHosts() {
    try {
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
    grid.innerHTML = '';

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

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-muted)">
          <p>No hosts found matching your criteria.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(h => {
      const card = document.createElement('div');
      card.className = 'host-card';
      
      const isSSH = h.type === 'ssh';
      const targetText = isSSH ? `${h.username}@${h.hostname}:${h.port || 22}` : `Windows Local Shell (${h.shellType || 'powershell'})`;
      const color = h.color || '#7b61ff';

      card.innerHTML = `
        <div class="host-card-border" style="background-color: ${color}"></div>
        <div class="host-card-header">
          <div class="host-card-title-group">
            <span class="host-label">${this.escapeHtml(h.label)}</span>
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
      grid.appendChild(card);
    });
  }

  openHostModal(hostId = null) {
    const modal = document.getElementById('modal-host');
    const title = document.getElementById('modal-host-title');
    const resultBox = document.getElementById('test-connection-result');
    resultBox.className = 'test-result';
    resultBox.style.display = 'none';

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
        this.toggleAuthType(h.authType || 'password');
        document.querySelector(`input[name="authType"][value="${h.authType || 'password'}"]`).checked = true;
      }
    } else {
      title.textContent = 'Add New Host';
      document.getElementById('form-host').reset();
      document.getElementById('host-id').value = '';
      document.getElementById('host-color').value = '#7b61ff';
      document.getElementById('color-hex-label').textContent = '#7b61ff';
      this.switchHostTypeTab('ssh');
      this.toggleAuthType('password');
    }

    modal.classList.add('active');
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
    resultBox.textContent = 'Testing SSH handshake and credentials...';

    const payload = {
      hostname: document.getElementById('host-hostname').value,
      port: document.getElementById('host-port').value,
      username: document.getElementById('host-username').value,
      authType: document.querySelector('input[name="authType"]:checked').value,
      password: document.getElementById('host-password').value,
      privateKey: document.getElementById('host-key').value,
      passphrase: document.getElementById('host-passphrase').value
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
      color: document.getElementById('host-color').value || '#7b61ff'
    };

    if (type === 'ssh') {
      payload.hostname = document.getElementById('host-hostname').value;
      payload.port = parseInt(document.getElementById('host-port').value, 10) || 22;
      payload.username = document.getElementById('host-username').value;
      payload.authType = document.querySelector('input[name="authType"]:checked').value;
      payload.password = document.getElementById('host-password').value;
      payload.privateKey = document.getElementById('host-key').value;
      payload.passphrase = document.getElementById('host-passphrase').value;
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
      } else {
        alert('Failed to save host: ' + data.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
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

    // User typing input to shell
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
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

  sendToActiveTerminal(cmd) {
    if (!this.activeTabId || !this.sessions.has(this.activeTabId)) {
      alert('Please open or select a terminal tab first.');
      this.switchView('terminals');
      return;
    }
    const sess = this.sessions.get(this.activeTabId);
    if (sess.ws && sess.ws.readyState === WebSocket.OPEN) {
      sess.ws.send(JSON.stringify({ type: 'data', data: cmd + '\n' }));
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
      listBody.appendChild(tr);
    });
  }

  onSftpItemClick(itemPath, isDirectory) {
    if (isDirectory) {
      this.loadSftpDir(itemPath);
    }
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
