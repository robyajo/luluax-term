import dotenv from 'dotenv';
dotenv.config();

import express, { type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import { Client as SSHClient, type ClientChannel, type SFTPWrapper } from 'ssh2';
import pty, { type IPty } from 'node-pty';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import crypto from 'crypto';
import type { HostItem, SnippetItem, TunnelItem, SshKeyItem, SettingsData, LocalFileEntry } from './types.js';

const PORT: number = parseInt(process.env.PORT || '3980', 10);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function getWritableDataDir(appName: string, defaultDataPath: string): string {
  const isInsideAsar = __dirname.includes('.asar');
  let targetDir: string;
  if (isInsideAsar) {
    if (process.env.APPDATA) {
      targetDir = path.join(process.env.APPDATA, appName);
    } else if (process.platform === 'darwin') {
      targetDir = path.join(os.homedir(), 'Library', 'Application Support', appName);
    } else {
      targetDir = path.join(os.homedir(), `.${appName.toLowerCase()}`);
    }
  } else {
    targetDir = defaultDataPath;
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (fs.existsSync(defaultDataPath)) {
    try {
      const files = fs.readdirSync(defaultDataPath);
      for (const file of files) {
        const dest = path.join(targetDir, file);
        if (!fs.existsSync(dest)) {
          const src = path.join(defaultDataPath, file);
          if (fs.statSync(src).isFile()) {
            fs.copyFileSync(src, dest);
          }
        }
      }
    } catch {
      // ignore seed read warnings
    }
  }
  return targetDir;
}

// In compiled TypeScript (dist-electron/server.js), project root is path.join(__dirname, '..')
const PROJECT_ROOT = __dirname.includes('dist-electron') ? path.join(__dirname, '..') : __dirname;
const DATA_DIR = getWritableDataDir('LuluaX-Term', path.join(PROJECT_ROOT, 'data'));

function readData<T>(file: string, defaultVal: T): T {
  const filePath = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2), 'utf-8');
      return defaultVal;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Error reading ${file}:`, errorMsg);
    return defaultVal;
  }
}

function writeData<T>(file: string, data: T): boolean {
  const filePath = path.join(DATA_DIR, file);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Error writing ${file}:`, errorMsg);
    return false;
  }
}

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(PROJECT_ROOT, 'public')));

// Upload buffer for SFTP
const uploadDir = path.join(os.tmpdir(), 'luluax-term-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// -------------------------------------------------------------
// System Info API
// -------------------------------------------------------------
app.get('/api/system', (_req: Request, res: Response) => {
  const platform = os.platform();
  const arch = os.arch();
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
// Hosts API
// -------------------------------------------------------------
app.get('/api/hosts', (_req: Request, res: Response) => {
  const hosts = readData<HostItem[]>('hosts.json', []);
  res.json({ success: true, hosts });
});

app.post('/api/hosts', (req: Request, res: Response) => {
  const hosts = readData<HostItem[]>('hosts.json', []);
  const body = req.body as Partial<HostItem>;
  const newHost: HostItem = {
    id: body.id || uuidv4(),
    label: body.label || 'New Host',
    type: body.type || 'ssh',
    hostname: body.hostname || '',
    port: parseInt(String(body.port || 22), 10) || 22,
    username: body.username || '',
    authType: body.authType || 'password',
    password: body.password || '',
    privateKey: body.privateKey || '',
    passphrase: body.passphrase || '',
    group: body.group || 'Default',
    color: body.color || '#7b61ff',
    shellType: body.shellType || (os.platform() === 'darwin' ? 'zsh' : 'powershell'),
    createdAt: Date.now(),
    lastConnected: null
  };
  hosts.push(newHost);
  writeData('hosts.json', hosts);
  res.json({ success: true, host: newHost });
});

app.put('/api/hosts/:id', (req: Request, res: Response) => {
  const hosts = readData<HostItem[]>('hosts.json', []);
  const index = hosts.findIndex(h => h.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Host not found' });
  }
  hosts[index] = { ...hosts[index], ...(req.body as Partial<HostItem>), id: hosts[index].id };
  writeData('hosts.json', hosts);
  res.json({ success: true, host: hosts[index] });
});

app.delete('/api/hosts/:id', (req: Request, res: Response) => {
  let hosts = readData<HostItem[]>('hosts.json', []);
  hosts = hosts.filter(h => h.id !== req.params.id);
  writeData('hosts.json', hosts);
  res.json({ success: true });
});

// Test SSH connection
app.post('/api/hosts/test', (req: Request, res: Response) => {
  const body = req.body as Partial<HostItem>;
  const { hostname, port, username, authType, password, privateKey, passphrase } = body;
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

  conn.on('error', (err: Error) => {
    if (!finished) {
      finished = true;
      clearTimeout(timer);
      res.json({ success: false, error: err.message || 'SSH connection failed' });
    }
  });

  try {
    const config: Record<string, unknown> = {
      host: hostname,
      port: parseInt(String(port || 22), 10) || 22,
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
  } catch (err: unknown) {
    if (!finished) {
      finished = true;
      clearTimeout(timer);
      const errorMsg = err instanceof Error ? err.message : String(err);
      res.json({ success: false, error: errorMsg });
    }
  }
});

// -------------------------------------------------------------
// Snippets API
// -------------------------------------------------------------
app.get('/api/snippets', (_req: Request, res: Response) => {
  const snippets = readData<SnippetItem[]>('snippets.json', []);
  res.json({ success: true, snippets });
});

app.post('/api/snippets', (req: Request, res: Response) => {
  const snippets = readData<SnippetItem[]>('snippets.json', []);
  const body = req.body as Partial<SnippetItem>;
  const newSnippet: SnippetItem = {
    id: body.id || uuidv4(),
    title: body.title || 'Untitled Snippet',
    description: body.description || '',
    command: body.command || '',
    category: body.category || 'General',
    tags: Array.isArray(body.tags) ? body.tags : []
  };
  snippets.push(newSnippet);
  writeData('snippets.json', snippets);
  res.json({ success: true, snippet: newSnippet });
});

app.delete('/api/snippets/:id', (req: Request, res: Response) => {
  let snippets = readData<SnippetItem[]>('snippets.json', []);
  snippets = snippets.filter(s => s.id !== req.params.id);
  writeData('snippets.json', snippets);
  res.json({ success: true });
});

// -------------------------------------------------------------
// Settings API
// -------------------------------------------------------------
app.get('/api/settings', (_req: Request, res: Response) => {
  const defaultUrl = process.env.CLOUD_API_URL || 'https://www.luluax-service.duckdns.org';
  const defaultKey = process.env.CLOUD_SYNC_KEY || '';
  const settings = readData<SettingsData>('settings.json', {
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

app.post('/api/settings', (req: Request, res: Response) => {
  const cur = readData<SettingsData>('settings.json', {});
  const updated = { ...cur, ...(req.body as SettingsData) };
  writeData('settings.json', updated);
  res.json({ success: true, settings: updated });
});

// -------------------------------------------------------------
// Cloud Sync Integration APIs
// -------------------------------------------------------------
interface CloudPayload {
  cloudApiUrl?: string;
  syncKey?: string;
}

interface CloudPullResult {
  success?: boolean;
  error?: string;
  data?: {
    hosts?: HostItem[];
    snippets?: SnippetItem[];
    settings?: SettingsData;
  };
}

app.post('/api/cloud/push', async (req: Request, res: Response) => {
  const body: CloudPayload = req.body;
  const cloudApiUrl = body.cloudApiUrl;
  const syncKey = body.syncKey;
  if (!cloudApiUrl || !syncKey) {
    return res.status(400).json({ success: false, error: 'Cloud API URL and Sync Key are required' });
  }

  const hosts = readData<HostItem[]>('hosts.json', []);
  const snippets = readData<SnippetItem[]>('snippets.json', []);
  const settings = readData<SettingsData>('settings.json', {});

  const payload = {
    syncKey,
    device: `${os.hostname()} (${os.platform()} ${os.arch()})`,
    timestamp: Date.now(),
    data: { hosts, snippets, settings }
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

    const data = await response.json() as { success?: boolean; error?: string };
    if (!response.ok || !data.success) {
      return res.status(response.status).json({ success: false, error: data.error || 'Cloud sync failed' });
    }

    settings.lastCloudSync = Date.now();
    writeData('settings.json', settings);

    res.json({ success: true, message: 'Data pushed to cloud successfully!', timestamp: settings.lastCloudSync });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: 'Cloud push network error: ' + errorMsg });
  }
});

app.post('/api/cloud/pull', async (req: Request, res: Response) => {
  const body: CloudPayload = req.body;
  const cloudApiUrl = body.cloudApiUrl;
  const syncKey = body.syncKey;
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

    const data = (await response.json()) as CloudPullResult;
    if (!response.ok || !data.success) {
      return res.status(response.status).json({ success: false, error: data.error || 'Cloud pull failed' });
    }

    if (data.data) {
      if (Array.isArray(data.data.hosts)) writeData('hosts.json', data.data.hosts);
      if (Array.isArray(data.data.snippets)) writeData('snippets.json', data.data.snippets);
      if (data.data.settings && typeof data.data.settings === 'object') {
        const localSettings = readData<SettingsData>('settings.json', {});
        const mergedSettings = { ...localSettings, ...data.data.settings, lastCloudSync: Date.now() };
        writeData('settings.json', mergedSettings);
      }
    }

    res.json({ success: true, message: 'Data pulled from cloud and updated locally!', timestamp: Date.now() });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: 'Cloud pull network error: ' + errorMsg });
  }
});

// -------------------------------------------------------------
// SFTP Client Sessions Store
// -------------------------------------------------------------
interface SftpWrapper {
  readdir: (targetPath: string, callback: (err: Error | null, list: Array<{ filename: string; attrs: { mode: number; size: number; mtime: number } }>) => void) => void;
  mkdir: (dirPath: string, callback: (err: Error | null) => void) => void;
  rmdir: (dirPath: string, callback: (err: Error | null) => void) => void;
  unlink: (filePath: string, callback: (err: Error | null) => void) => void;
  createReadStream: (filePath: string) => NodeJS.ReadableStream;
  createWriteStream: (filePath: string) => NodeJS.WritableStream;
}

interface SftpSession {
  conn: SSHClient;
  sftp: SftpWrapper;
  hostId: string;
  connectedAt: number;
}
const sftpClients = new Map<string, SftpSession>();

app.post('/api/sftp/connect', (req: Request, res: Response) => {
  const { hostId } = req.body as { hostId?: string };
  const hosts = readData<HostItem[]>('hosts.json', []);
  const host = hosts.find(h => h.id === hostId);
  if (!host || host.type !== 'ssh') {
    return res.status(400).json({ success: false, error: 'Valid SSH host required' });
  }

  const sessionId = uuidv4();
  const conn = new SSHClient();

  conn.on('ready', () => {
    conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
      if (err) {
        conn.end();
        return res.status(500).json({ success: false, error: 'Failed to initialize SFTP: ' + err.message });
      }
      sftpClients.set(sessionId, { conn, sftp: sftp as unknown as SftpWrapper, hostId: host.id, connectedAt: Date.now() });
      res.json({ success: true, sessionId, initialPath: '/home/' + host.username });
    });
  });

  conn.on('error', (err: Error) => {
    res.status(500).json({ success: false, error: err.message || 'SSH connection failed' });
  });

  try {
    const config: Record<string, unknown> = {
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
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

app.post('/api/sftp/list', (req: Request, res: Response) => {
  const { sessionId, path: dirPath } = req.body as { sessionId?: string; path?: string };
  if (!sessionId) return res.status(400).json({ success: false, error: 'Session ID required' });
  const session = sftpClients.get(sessionId);
  if (!session) return res.status(401).json({ success: false, error: 'SFTP session expired or not found' });

  const targetPath = dirPath || '.';
  session.sftp.readdir(targetPath, (err: Error | null, list: Array<{ filename: string; attrs: { mode: number; size: number; mtime: number } }>) => {
    if (err) return res.status(500).json({ success: false, error: err.message });

    const items = list.map(item => ({
      name: item.filename,
      size: item.attrs.size,
      modifyTime: item.attrs.mtime * 1000,
      isDirectory: (item.attrs.mode & 0o40000) !== 0,
      permissions: (item.attrs.mode & 0o777).toString(8)
    }));

    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ success: true, path: targetPath, items });
  });
});

app.post('/api/sftp/mkdir', (req: Request, res: Response) => {
  const { sessionId, dirPath } = req.body as { sessionId?: string; dirPath?: string };
  if (!sessionId || !dirPath) return res.status(400).json({ success: false, error: 'Missing parameters' });
  const session = sftpClients.get(sessionId);
  if (!session) return res.status(401).json({ success: false, error: 'SFTP session expired' });

  session.sftp.mkdir(dirPath, (err: Error | null) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/sftp/delete', (req: Request, res: Response) => {
  const { sessionId, path: targetPath, isDirectory } = req.body as { sessionId?: string; path?: string; isDirectory?: boolean };
  if (!sessionId || !targetPath) return res.status(400).json({ success: false, error: 'Missing parameters' });
  const session = sftpClients.get(sessionId);
  if (!session) return res.status(401).json({ success: false, error: 'SFTP session expired' });

  if (isDirectory) {
    session.sftp.rmdir(targetPath, (err: Error | null) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    });
  } else {
    session.sftp.unlink(targetPath, (err: Error | null) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    });
  }
});

// -------------------------------------------------------------
// Dual-Pane SFTP: Local Filesystem Explorer
// -------------------------------------------------------------
app.get('/api/local/drives', (_req: Request, res: Response) => {
  if (os.platform() === 'win32') {
    const candidateDrives = ['C:', 'D:', 'E:', 'F:', 'G:'];
    const existing: string[] = [];
    for (const d of candidateDrives) {
      try {
        if (fs.existsSync(d + '\\')) existing.push(d + '\\');
      } catch {}
    }
    return res.json({ success: true, drives: existing.length > 0 ? existing : ['C:\\'], defaultPath: os.homedir() });
  }
  return res.json({ success: true, drives: ['/'], defaultPath: os.homedir() });
});

app.post('/api/local/list', (req: Request, res: Response) => {
  const targetPath = (req.body as { path?: string }).path || os.homedir();
  try {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    const items: LocalFileEntry[] = [];

    for (const ent of entries) {
      try {
        const fullPath = path.join(targetPath, ent.name);
        const stat = fs.statSync(fullPath);
        items.push({
          name: ent.name,
          isDirectory: ent.isDirectory(),
          size: stat.size,
          modifyTime: stat.mtimeMs,
          fullPath
        });
      } catch {}
    }

    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ success: true, path: targetPath, items });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

app.post('/api/sftp/transfer-local-to-remote', (req: Request, res: Response) => {
  const { sessionId, localFilePath, remoteDirPath } = req.body as { sessionId?: string; localFilePath?: string; remoteDirPath?: string };
  if (!sessionId || !localFilePath || !remoteDirPath) return res.status(400).json({ success: false, error: 'Missing parameters' });
  const session = sftpClients.get(sessionId);
  if (!session) return res.status(401).json({ success: false, error: 'SFTP session expired' });
  if (!fs.existsSync(localFilePath)) return res.status(400).json({ success: false, error: 'Local file does not exist' });

  const fileName = path.basename(localFilePath);
  const destination = path.posix.join(remoteDirPath, fileName);

  const readStream = fs.createReadStream(localFilePath);
  const writeStream = session.sftp.createWriteStream(destination);

  writeStream.on('close', () => res.json({ success: true, path: destination }));
  writeStream.on('error', (err: Error) => res.status(500).json({ success: false, error: err.message }));
  readStream.pipe(writeStream);
});

app.post('/api/sftp/transfer-remote-to-local', (req: Request, res: Response) => {
  const { sessionId, remoteFilePath, localDirPath } = req.body as { sessionId?: string; remoteFilePath?: string; localDirPath?: string };
  if (!sessionId || !remoteFilePath || !localDirPath) return res.status(400).json({ success: false, error: 'Missing parameters' });
  const session = sftpClients.get(sessionId);
  if (!session) return res.status(401).json({ success: false, error: 'SFTP session expired' });

  const fileName = path.basename(remoteFilePath);
  const destination = path.join(localDirPath, fileName);

  const readStream = session.sftp.createReadStream(remoteFilePath);
  const writeStream = fs.createWriteStream(destination);

  writeStream.on('close', () => res.json({ success: true, path: destination }));
  writeStream.on('error', (err: Error) => res.status(500).json({ success: false, error: err.message }));
  readStream.pipe(writeStream);
});

// -------------------------------------------------------------
// Tunnels & Keys APIs
// -------------------------------------------------------------
app.get('/api/tunnels', (_req: Request, res: Response) => {
  const tunnels = readData<TunnelItem[]>('tunnels.json', []);
  res.json({ success: true, tunnels });
});

app.post('/api/tunnels', (req: Request, res: Response) => {
  const tunnels = readData<TunnelItem[]>('tunnels.json', []);
  const body = req.body as Partial<TunnelItem>;
  const newTunnel: TunnelItem = {
    id: body.id || `tun_${Date.now()}`,
    label: body.label || 'New Tunnel',
    hostId: body.hostId || '',
    tunnelType: body.tunnelType || 'local',
    localPort: Number(body.localPort || 8080),
    remoteHost: body.remoteHost || '127.0.0.1',
    remotePort: Number(body.remotePort || 80),
    enabled: Boolean(body.enabled),
    createdAt: Date.now()
  };
  tunnels.push(newTunnel);
  writeData('tunnels.json', tunnels);
  res.json({ success: true, tunnel: newTunnel });
});

app.post('/api/tunnels/:id/toggle', (req: Request, res: Response) => {
  const tunnels = readData<TunnelItem[]>('tunnels.json', []);
  const tunnel = tunnels.find(t => t.id === req.params.id);
  if (!tunnel) return res.status(404).json({ success: false, error: 'Tunnel not found' });
  tunnel.enabled = !tunnel.enabled;
  writeData('tunnels.json', tunnels);
  res.json({ success: true, enabled: tunnel.enabled });
});

app.delete('/api/tunnels/:id', (req: Request, res: Response) => {
  let tunnels = readData<TunnelItem[]>('tunnels.json', []);
  tunnels = tunnels.filter(t => t.id !== req.params.id);
  writeData('tunnels.json', tunnels);
  res.json({ success: true });
});

app.get('/api/keys', (_req: Request, res: Response) => {
  const keys = readData<SshKeyItem[]>('keys.json', []);
  res.json({ success: true, keys });
});

app.post('/api/keys/generate', (req: Request, res: Response) => {
  const { keyType = 'ed25519', label = 'Generated Key' } = req.body as { keyType?: 'ed25519' | 'rsa'; label?: string };
  try {
    let publicKey: string, privateKey: string;
    if (keyType === 'ed25519') {
      const pair = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      publicKey = pair.publicKey;
      privateKey = pair.privateKey;
    } else {
      const pair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      publicKey = pair.publicKey;
      privateKey = pair.privateKey;
    }

    const keys = readData<SshKeyItem[]>('keys.json', []);
    const newKey: SshKeyItem = {
      id: `key_${Date.now()}`,
      label,
      keyType,
      publicKey,
      privateKey,
      createdAt: Date.now()
    };
    keys.push(newKey);
    writeData('keys.json', keys);
    res.json({ success: true, key: newKey });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// -------------------------------------------------------------
// WebSocket Terminal Streaming
// -------------------------------------------------------------
function resolveLocalShell(shellType?: string): string {
  if (os.platform() === 'darwin') {
    if (shellType === 'bash' && fs.existsSync('/bin/bash')) return '/bin/bash';
    if (shellType === 'fish') {
      if (fs.existsSync('/opt/homebrew/bin/fish')) return '/opt/homebrew/bin/fish';
      if (fs.existsSync('/usr/local/bin/fish')) return '/usr/local/bin/fish';
    }
    if (shellType === 'zsh' && fs.existsSync('/bin/zsh')) return '/bin/zsh';
    return process.env.SHELL || '/bin/zsh';
  }

  if (os.platform() === 'win32') {
    if (shellType === 'cmd') return 'cmd.exe';
    if (shellType === 'gitbash') {
      const candidates = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
      return 'bash.exe';
    }
    if (shellType === 'wsl') return 'wsl.exe';
    return 'powershell.exe';
  }

  return process.env.SHELL || '/bin/bash';
}

interface ActiveTerminalSession {
  type: 'local' | 'ssh';
  pty?: IPty;
  conn?: SSHClient;
  stream?: ClientChannel;
}

wss.on('connection', (ws: WebSocket) => {
  let terminalSession: ActiveTerminalSession | null = null;

  ws.on('message', (msg: string) => {
    try {
      const data = JSON.parse(msg) as { type: string; hostId?: string; cols?: number; rows?: number; data?: string };

      if (data.type === 'init') {
        const { hostId, cols = 80, rows = 24 } = data;
        const hosts = readData<HostItem[]>('hosts.json', []);
        const host = hosts.find(h => h.id === hostId);

        if (!host) {
          ws.send(JSON.stringify({ type: 'error', message: `Host "${hostId}" not found` }));
          return;
        }

        host.lastConnected = Date.now();
        writeData('hosts.json', hosts);

        if (host.type === 'local') {
          const shellExe = resolveLocalShell(host.shellType);
          const cwd = process.env.USERPROFILE || process.env.HOME || process.cwd();
          const ptyProcess = pty.spawn(shellExe, [], {
            name: 'xterm-256color',
            cols,
            rows,
            cwd,
            env: process.env as Record<string, string>
          });

          terminalSession = { type: 'local', pty: ptyProcess };

          ptyProcess.onData((chunk: string) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'data', data: chunk }));
          });

          ptyProcess.onExit(({ exitCode }) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'status', status: 'disconnected', message: `Process exited with code ${exitCode}` }));
            }
          });

          ws.send(JSON.stringify({ type: 'status', status: 'connected', message: `Started ${host.label} (${shellExe})` }));

        } else if (host.type === 'ssh') {
          const conn = new SSHClient();
          ws.send(JSON.stringify({ type: 'status', status: 'connecting', message: `Connecting to ${host.username}@${host.hostname}...` }));

          conn.on('ready', () => {
            conn.shell({ term: 'xterm-256color', cols, rows }, (err: Error | undefined, stream: ClientChannel) => {
              if (err) {
                ws.send(JSON.stringify({ type: 'error', message: 'Shell init error: ' + err.message }));
                conn.end();
                return;
              }

              terminalSession = { type: 'ssh', conn, stream };

              stream.on('data', (chunk: Buffer) => {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'data', data: chunk.toString('utf-8') }));
              });

              stream.on('close', () => {
                conn.end();
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'status', status: 'disconnected', message: 'SSH session closed.' }));
                }
              });

              ws.send(JSON.stringify({ type: 'status', status: 'connected', message: `Connected to ${host.username}@${host.hostname}` }));
            });
          });

          conn.on('error', (err: Error) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: `SSH Error: ${err.message}` }));
              ws.send(JSON.stringify({ type: 'status', status: 'error', message: err.message }));
            }
          });

          const sshConfig: Record<string, unknown> = {
            host: host.hostname,
            port: parseInt(String(host.port || 22), 10) || 22,
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

      } else if (data.type === 'data' && data.data) {
        if (terminalSession) {
          if (terminalSession.type === 'local' && terminalSession.pty) {
            terminalSession.pty.write(data.data);
          } else if (terminalSession.type === 'ssh' && terminalSession.stream) {
            terminalSession.stream.write(data.data);
          }
        }
      } else if (data.type === 'resize' && data.cols && data.rows) {
        if (terminalSession) {
          if (terminalSession.type === 'local' && terminalSession.pty) {
            terminalSession.pty.resize(data.cols, data.rows);
          } else if (terminalSession.type === 'ssh' && terminalSession.stream) {
            terminalSession.stream.setWindow(data.rows, data.cols, 0, 0);
          }
        }
      }
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error('WebSocket parse error:', errorMsg);
    }
  });

  ws.on('close', () => {
    if (terminalSession) {
      if (terminalSession.type === 'local' && terminalSession.pty) {
        try { terminalSession.pty.kill(); } catch {}
      } else if (terminalSession.type === 'ssh' && terminalSession.conn) {
        try { terminalSession.conn.end(); } catch {}
      }
      terminalSession = null;
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n======================================================`);
  console.log(`         LuluaX-Term SSH & Terminal Manager           `);
  console.log(`  Local URL: http://127.0.0.1:${PORT}                  `);
  console.log(`======================================================\n`);
});
