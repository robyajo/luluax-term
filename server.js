require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { WebSocketServer } = require('ws');
const { Client: SSHClient } = require('ssh2');
const pty = require('node-pty');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

const PORT = process.env.PORT || 3980;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helpers for JSON files
function readData(file, defaultVal = []) {
  const filePath = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2), 'utf-8');
      return defaultVal;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
    return defaultVal;
  }
}

function writeData(file, data) {
  const filePath = path.join(DATA_DIR, file);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Error writing ${file}:`, err.message);
    return false;
  }
}

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Upload configuration for SFTP
const upload = multer({ dest: path.join(__dirname, 'temp_uploads') });
if (!fs.existsSync(path.join(__dirname, 'temp_uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'temp_uploads'), { recursive: true });
}

// -------------------------------------------------------------
// System Info API (Detects Windows vs macOS Apple Silicon/Intel vs Linux)
// -------------------------------------------------------------
app.get('/api/system', (req, res) => {
  const platform = os.platform(); // 'win32', 'darwin', 'linux'
  const arch = os.arch();         // 'arm64', 'x64'
  let platformLabel = 'Unknown';

  if (platform === 'darwin') {
    platformLabel = arch === 'arm64' ? 'macOS (Apple Silicon arm64)' : 'macOS (Intel x64)';
  } else if (platform === 'win32') {
    platformLabel = arch === 'arm64' ? 'Windows (ARM64)' : 'Windows (x64)';
  } else if (platform === 'linux') {
    platformLabel = `Linux (${arch})`;
  }

  res.json({
    success: true,
    platform,
    arch,
    platformLabel,
    hostname: os.hostname(),
    uptime: os.uptime(),
    nodeVersion: process.version
  });
});

// -------------------------------------------------------------
// REST APIs: Hosts
// -------------------------------------------------------------
app.get('/api/hosts', (req, res) => {
  const hosts = readData('hosts.json', []);
  res.json({ success: true, hosts });
});

app.post('/api/hosts', (req, res) => {
  const hosts = readData('hosts.json', []);
  const newHost = {
    id: req.body.id || uuidv4(),
    label: req.body.label || 'New Host',
    type: req.body.type || 'ssh', // 'ssh' or 'local'
    hostname: req.body.hostname || '',
    port: parseInt(req.body.port, 10) || 22,
    username: req.body.username || '',
    authType: req.body.authType || 'password', // 'password' or 'key'
    password: req.body.password || '',
    privateKey: req.body.privateKey || '',
    passphrase: req.body.passphrase || '',
    group: req.body.group || 'Default',
    color: req.body.color || '#7b61ff',
    shellType: req.body.shellType || (os.platform() === 'darwin' ? 'zsh' : 'powershell'),
    createdAt: Date.now(),
    lastConnected: null
  };
  hosts.push(newHost);
  writeData('hosts.json', hosts);
  res.json({ success: true, host: newHost });
});

app.put('/api/hosts/:id', (req, res) => {
  const hosts = readData('hosts.json', []);
  const index = hosts.findIndex(h => h.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Host not found' });
  }
  hosts[index] = { ...hosts[index], ...req.body, id: hosts[index].id };
  writeData('hosts.json', hosts);
  res.json({ success: true, host: hosts[index] });
});

app.delete('/api/hosts/:id', (req, res) => {
  let hosts = readData('hosts.json', []);
  hosts = hosts.filter(h => h.id !== req.params.id);
  writeData('hosts.json', hosts);
  res.json({ success: true });
});

// Test SSH connection
app.post('/api/hosts/test', (req, res) => {
  const { hostname, port, username, authType, password, privateKey, passphrase } = req.body;
  if (!hostname || !username) {
    return res.status(400).json({ success: false, error: 'Host and username are required' });
  }

  const conn = new SSHClient();
  let finished = false;

  const timer = setTimeout(() => {
    if (!finished) {
      finished = true;
      conn.end();
      res.json({ success: false, error: 'Connection timed out after 10 seconds' });
    }
  }, 10000);

  conn.on('ready', () => {
    if (!finished) {
      finished = true;
      clearTimeout(timer);
      conn.end();
      res.json({ success: true, message: 'SSH Authentication Successful!' });
    }
  });

  conn.on('error', (err) => {
    if (!finished) {
      finished = true;
      clearTimeout(timer);
      res.json({ success: false, error: err.message || 'SSH connection failed' });
    }
  });

  try {
    const config = {
      host: hostname,
      port: parseInt(port, 10) || 22,
      username,
      readyTimeout: 10000,
      keepaliveInterval: 10000
    };

    if (authType === 'key' && privateKey) {
      config.privateKey = privateKey;
      if (passphrase) config.passphrase = passphrase;
    } else {
      config.password = password || '';
    }

    conn.connect(config);
  } catch (err) {
    if (!finished) {
      finished = true;
      clearTimeout(timer);
      res.json({ success: false, error: err.message });
    }
  }
});

// -------------------------------------------------------------
// REST APIs: Snippets
// -------------------------------------------------------------
app.get('/api/snippets', (req, res) => {
  const snippets = readData('snippets.json', []);
  res.json({ success: true, snippets });
});

app.post('/api/snippets', (req, res) => {
  const snippets = readData('snippets.json', []);
  const newSnippet = {
    id: req.body.id || uuidv4(),
    title: req.body.title || 'Untitled Snippet',
    description: req.body.description || '',
    command: req.body.command || '',
    category: req.body.category || 'General',
    tags: req.body.tags || []
  };
  snippets.push(newSnippet);
  writeData('snippets.json', snippets);
  res.json({ success: true, snippet: newSnippet });
});

app.put('/api/snippets/:id', (req, res) => {
  const snippets = readData('snippets.json', []);
  const index = snippets.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Snippet not found' });
  }
  snippets[index] = { ...snippets[index], ...req.body, id: snippets[index].id };
  writeData('snippets.json', snippets);
  res.json({ success: true, snippet: snippets[index] });
});

app.delete('/api/snippets/:id', (req, res) => {
  let snippets = readData('snippets.json', []);
  snippets = snippets.filter(s => s.id !== req.params.id);
  writeData('snippets.json', snippets);
  res.json({ success: true });
});

// -------------------------------------------------------------
// REST APIs: Settings
// -------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  const defaultUrl = process.env.CLOUD_API_URL || 'https://www.luluax-service.duckdns.org';
  const defaultKey = process.env.CLOUD_SYNC_KEY || '';
  const settings = readData('settings.json', {
    theme: 'termius-dark',
    fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
    fontSize: 14,
    cursorBlink: true,
    cursorStyle: 'block',
    cloudApiUrl: defaultUrl,
    cloudSyncKey: defaultKey
  });
  if (!settings.cloudApiUrl) settings.cloudApiUrl = defaultUrl;
  if (!settings.cloudSyncKey && defaultKey) settings.cloudSyncKey = defaultKey;
  res.json({ success: true, settings });
});

app.post('/api/settings', (req, res) => {
  const cur = readData('settings.json', {});
  const updated = { ...cur, ...req.body };
  writeData('settings.json', updated);
  res.json({ success: true, settings: updated });
});

// -------------------------------------------------------------
// Cloud Sync Integration APIs (Connects to Vercel Backend)
// -------------------------------------------------------------
app.post('/api/cloud/push', async (req, res) => {
  const { cloudApiUrl, syncKey } = req.body;
  if (!cloudApiUrl || !syncKey) {
    return res.status(400).json({ success: false, error: 'Cloud API URL and Sync Key are required' });
  }

  const hosts = readData('hosts.json', []);
  const snippets = readData('snippets.json', []);
  const settings = readData('settings.json', {});

  const payload = {
    syncKey,
    device: `${os.hostname()} (${os.platform()} ${os.arch()})`,
    timestamp: Date.now(),
    data: {
      hosts,
      snippets,
      settings
    }
  };

  try {
    const targetUrl = cloudApiUrl.replace(/\/+$/, '') + '/api/sync/push';
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${syncKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      return res.status(response.status).json({ success: false, error: data.error || 'Cloud sync failed' });
    }

    settings.lastCloudSync = Date.now();
    writeData('settings.json', settings);

    res.json({ success: true, message: 'Data pushed to cloud successfully!', timestamp: settings.lastCloudSync });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Cloud push network error: ' + err.message });
  }
});

app.post('/api/cloud/pull', async (req, res) => {
  const { cloudApiUrl, syncKey } = req.body;
  if (!cloudApiUrl || !syncKey) {
    return res.status(400).json({ success: false, error: 'Cloud API URL and Sync Key are required' });
  }

  try {
    const targetUrl = cloudApiUrl.replace(/\/+$/, '') + '/api/sync/pull';
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${syncKey}`
      },
      body: JSON.stringify({ syncKey })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      return res.status(response.status).json({ success: false, error: data.error || 'Cloud pull failed' });
    }

    if (data.data) {
      if (Array.isArray(data.data.hosts)) {
        writeData('hosts.json', data.data.hosts);
      }
      if (Array.isArray(data.data.snippets)) {
        writeData('snippets.json', data.data.snippets);
      }
      if (data.data.settings && typeof data.data.settings === 'object') {
        const localSettings = readData('settings.json', {});
        const mergedSettings = { ...localSettings, ...data.data.settings, lastCloudSync: Date.now() };
        writeData('settings.json', mergedSettings);
      }
    }

    res.json({
      success: true,
      message: 'Data pulled from cloud and updated locally!',
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Cloud pull network error: ' + err.message });
  }
});

// -------------------------------------------------------------
// SFTP Client Sessions Store
// -------------------------------------------------------------
const sftpClients = new Map(); // sessionId -> { conn, sftp, hostId, connectedAt }

app.post('/api/sftp/connect', (req, res) => {
  const { hostId } = req.body;
  const hosts = readData('hosts.json', []);
  const host = hosts.find(h => h.id === hostId);
  if (!host || host.type !== 'ssh') {
    return res.status(400).json({ success: false, error: 'Valid SSH host required' });
  }

  const sessionId = uuidv4();
  const conn = new SSHClient();

  conn.on('ready', () => {
    conn.sftp((err, sftp) => {
      if (err) {
        conn.end();
        return res.status(500).json({ success: false, error: 'Failed to initialize SFTP: ' + err.message });
      }
      sftpClients.set(sessionId, { conn, sftp, hostId, connectedAt: Date.now() });
      res.json({ success: true, sessionId, initialPath: '/home/' + host.username });
    });
  });

  conn.on('error', (err) => {
    res.status(500).json({ success: false, error: err.message || 'SSH connection failed' });
  });

  try {
    const config = {
      host: host.hostname,
      port: host.port || 22,
      username: host.username,
      readyTimeout: 10000,
      keepaliveInterval: 10000
    };
    if (host.authType === 'key' && host.privateKey) {
      config.privateKey = host.privateKey;
      if (host.passphrase) config.passphrase = host.passphrase;
    } else {
      config.password = host.password || '';
    }
    conn.connect(config);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sftp/list', (req, res) => {
  const { sessionId, path: dirPath } = req.body;
  const session = sftpClients.get(sessionId);
  if (!session) {
    return res.status(401).json({ success: false, error: 'SFTP session expired or not found' });
  }

  const targetPath = dirPath || '.';
  session.sftp.readdir(targetPath, (err, list) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }

    const items = list.map(item => {
      const isDir = (item.attrs.mode & 0o40000) !== 0;
      return {
        name: item.filename,
        size: item.attrs.size,
        modifyTime: item.attrs.mtime * 1000,
        isDirectory: isDir,
        permissions: (item.attrs.mode & 0o777).toString(8)
      };
    });

    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ success: true, path: targetPath, items });
  });
});

app.post('/api/sftp/mkdir', (req, res) => {
  const { sessionId, dirPath } = req.body;
  const session = sftpClients.get(sessionId);
  if (!session) return res.status(401).json({ success: false, error: 'SFTP session expired' });

  session.sftp.mkdir(dirPath, (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/sftp/delete', (req, res) => {
  const { sessionId, path: targetPath, isDirectory } = req.body;
  const session = sftpClients.get(sessionId);
  if (!session) return res.status(401).json({ success: false, error: 'SFTP session expired' });

  if (isDirectory) {
    session.sftp.rmdir(targetPath, (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    });
  } else {
    session.sftp.unlink(targetPath, (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    });
  }
});

app.get('/api/sftp/download', (req, res) => {
  const { sessionId, remotePath } = req.query;
  const session = sftpClients.get(sessionId);
  if (!session) return res.status(401).json({ success: false, error: 'SFTP session expired' });

  const fileName = path.basename(remotePath);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', 'application/octet-stream');

  const readStream = session.sftp.createReadStream(remotePath);
  readStream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  readStream.pipe(res);
});

app.post('/api/sftp/upload', upload.single('file'), (req, res) => {
  const { sessionId, remotePath } = req.body;
  const file = req.file;
  if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

  const session = sftpClients.get(sessionId);
  if (!session) {
    fs.unlinkSync(file.path);
    return res.status(401).json({ success: false, error: 'SFTP session expired' });
  }

  const destination = path.posix.join(remotePath, file.originalname);
  const writeStream = session.sftp.createWriteStream(destination);
  const readStream = fs.createReadStream(file.path);

  writeStream.on('close', () => {
    fs.unlinkSync(file.path);
    res.json({ success: true, path: destination });
  });

  writeStream.on('error', (err) => {
    fs.unlinkSync(file.path);
    res.status(500).json({ success: false, error: err.message });
  });

  readStream.pipe(writeStream);
});

app.post('/api/sftp/disconnect', (req, res) => {
  const { sessionId } = req.body;
  const session = sftpClients.get(sessionId);
  if (session) {
    session.conn.end();
    sftpClients.delete(sessionId);
  }
  res.json({ success: true });
});

// -------------------------------------------------------------
// Cross-Platform WebSocket Terminal Streaming (Windows & macOS Apple Silicon)
// -------------------------------------------------------------
function resolveLocalShell(shellType) {
  const isMac = os.platform() === 'darwin';
  const isWin = os.platform() === 'win32';

  if (isMac) {
    // macOS Apple Silicon (arm64) / Intel (x64)
    if (shellType === 'bash') {
      if (fs.existsSync('/bin/bash')) return '/bin/bash';
    }
    if (shellType === 'fish') {
      if (fs.existsSync('/opt/homebrew/bin/fish')) return '/opt/homebrew/bin/fish';
      if (fs.existsSync('/usr/local/bin/fish')) return '/usr/local/bin/fish';
    }
    if (shellType === 'zsh' && fs.existsSync('/bin/zsh')) return '/bin/zsh';
    return process.env.SHELL || '/bin/zsh';
  }

  if (isWin) {
    if (shellType === 'cmd') return 'cmd.exe';
    if (shellType === 'gitbash') {
      const candidates = [
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
      return 'bash.exe';
    }
    if (shellType === 'wsl') return 'wsl.exe';
    return 'powershell.exe';
  }

  // Linux default
  return process.env.SHELL || '/bin/bash';
}

wss.on('connection', (ws) => {
  let terminalSession = null; // { type: 'local' | 'ssh', pty, stream, conn }

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === 'init') {
        const { hostId, cols = 80, rows = 24 } = data;
        const hosts = readData('hosts.json', []);
        const host = hosts.find(h => h.id === hostId);

        if (!host) {
          ws.send(JSON.stringify({
            type: 'error',
            message: `Host with ID "${hostId}" not found`
          }));
          return;
        }

        // Update lastConnected timestamp
        host.lastConnected = Date.now();
        writeData('hosts.json', hosts);

        if (host.type === 'local') {
          // Spawn local PTY (Windows ConPTY / macOS Apple Silicon PTY)
          const shellExe = resolveLocalShell(host.shellType);
          const cwd = process.env.USERPROFILE || process.env.HOME || process.cwd();

          const ptyProcess = pty.spawn(shellExe, [], {
            name: 'xterm-256color',
            cols: cols || 80,
            rows: rows || 24,
            cwd: cwd,
            env: process.env
          });

          terminalSession = {
            type: 'local',
            pty: ptyProcess
          };

          ptyProcess.onData((chunk) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'data', data: chunk }));
            }
          });

          ptyProcess.onExit(({ exitCode, signal }) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'status',
                status: 'disconnected',
                message: `Process exited with code ${exitCode}`
              }));
            }
          });

          ws.send(JSON.stringify({
            type: 'status',
            status: 'connected',
            message: `Started local shell: ${host.label} (${shellExe})`
          }));

        } else if (host.type === 'ssh') {
          // Connect via SSH2
          const conn = new SSHClient();

          ws.send(JSON.stringify({
            type: 'status',
            status: 'connecting',
            message: `Connecting to ${host.username}@${host.hostname}:${host.port || 22}...`
          }));

          conn.on('ready', () => {
            conn.shell({
              term: 'xterm-256color',
              cols: cols || 80,
              rows: rows || 24
            }, (err, stream) => {
              if (err) {
                ws.send(JSON.stringify({ type: 'error', message: 'Shell init error: ' + err.message }));
                conn.end();
                return;
              }

              terminalSession = {
                type: 'ssh',
                conn,
                stream
              };

              stream.on('data', (chunk) => {
                if (ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify({ type: 'data', data: chunk.toString('utf-8') }));
                }
              });

              stream.on('close', () => {
                conn.end();
                if (ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'status',
                    status: 'disconnected',
                    message: 'SSH session closed.'
                  }));
                }
              });

              ws.send(JSON.stringify({
                type: 'status',
                status: 'connected',
                message: `Connected to ${host.username}@${host.hostname}`
              }));
            });
          });

          conn.on('error', (err) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                message: `SSH Connection Error: ${err.message}`
              }));
              ws.send(JSON.stringify({
                type: 'status',
                status: 'error',
                message: err.message
              }));
            }
          });

          conn.on('end', () => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                type: 'status',
                status: 'disconnected',
                message: 'SSH Connection ended.'
              }));
            }
          });

          const sshConfig = {
            host: host.hostname,
            port: parseInt(host.port, 10) || 22,
            username: host.username,
            readyTimeout: 15000,
            keepaliveInterval: 10000
          };

          if (host.authType === 'key' && host.privateKey) {
            sshConfig.privateKey = host.privateKey;
            if (host.passphrase) sshConfig.passphrase = host.passphrase;
          } else {
            sshConfig.password = host.password || '';
          }

          conn.connect(sshConfig);
        }

      } else if (data.type === 'data') {
        if (terminalSession) {
          if (terminalSession.type === 'local' && terminalSession.pty) {
            terminalSession.pty.write(data.data);
          } else if (terminalSession.type === 'ssh' && terminalSession.stream) {
            terminalSession.stream.write(data.data);
          }
        }

      } else if (data.type === 'resize') {
        const { cols, rows } = data;
        if (terminalSession) {
          if (terminalSession.type === 'local' && terminalSession.pty) {
            terminalSession.pty.resize(cols, rows);
          } else if (terminalSession.type === 'ssh' && terminalSession.stream) {
            terminalSession.stream.setWindow(rows, cols, 0, 0);
          }
        }
      }

    } catch (e) {
      console.error('WebSocket message parsing error:', e.message);
    }
  });

  ws.on('close', () => {
    if (terminalSession) {
      if (terminalSession.type === 'local' && terminalSession.pty) {
        try { terminalSession.pty.kill(); } catch (err) {}
      } else if (terminalSession.type === 'ssh' && terminalSession.conn) {
        try { terminalSession.conn.end(); } catch (err) {}
      }
      terminalSession = null;
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const platform = os.platform();
  const arch = os.arch();
  const isMacSilicon = platform === 'darwin' && arch === 'arm64';

  console.log(`\n======================================================`);
  console.log(`         LuluaX-Term SSH & Terminal Manager           `);
  console.log(`  System: ${platform} ${arch} ${isMacSilicon ? '(Apple Silicon M-Series)' : ''}`);
  console.log(`  Local URL: http://127.0.0.1:${PORT}                  `);
  console.log(`======================================================\n`);
});
