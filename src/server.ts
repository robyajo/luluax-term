import dotenv from 'dotenv';
dotenv.config();

import express, { type Request, type Response } from 'express';
import http from 'http';
import net from 'net';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import { Client as SSHClient, type ClientChannel, type SFTPWrapper } from 'ssh2';
import pty, { type IPty } from 'node-pty';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import crypto from 'crypto';
import type { HostItem, SnippetItem, TunnelItem, SshKeyItem, SettingsData, LocalFileEntry, FolderItem, AccountRegistry } from './types.js';

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

  let appVersion = '1.0.4';
  try {
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.version) appVersion = pkg.version;
    }
  } catch {}

  res.json({
    success: true,
    platform,
    arch,
    platformLabel,
    appVersion,
    hostname: os.hostname(),
    uptime: os.uptime(),
    nodeVersion: process.version
  });
});

// -------------------------------------------------------------
// SSH & Bastion Connection Manager (Termius-Style)
// -------------------------------------------------------------
function buildSshConfig(host: HostItem): Record<string, unknown> {
  const keys = readData<SshKeyItem[]>('keys.json', []);
  const config: Record<string, unknown> = {
    host: host.hostname,
    port: parseInt(String(host.port || 22), 10) || 22,
    username: host.username,
    readyTimeout: 15000,
    keepaliveInterval: 10000
  };

  if (host.authType === 'key') {
    let resolvedKey = host.privateKey || '';
    let resolvedPass = host.passphrase || '';
    if (host.keyId) {
      const keyItem = keys.find(k => k.id === host.keyId);
      if (keyItem && keyItem.privateKey) {
        resolvedKey = keyItem.privateKey;
        if (keyItem.passphrase) resolvedPass = keyItem.passphrase;
      }
    }
    if (resolvedKey) {
      config.privateKey = resolvedKey;
      if (resolvedPass) config.passphrase = resolvedPass;
    } else {
      config.password = host.password || '';
    }
  } else {
    config.password = host.password || '';
  }

  return config;
}

function connectSsh(
  targetHost: HostItem,
  callbacks: {
    onReady: (conn: SSHClient, jumpConn?: SSHClient) => void;
    onError: (err: Error) => void;
  }
): { cancel: () => void } {
  const hosts = readData<HostItem[]>('hosts.json', []);
  const targetConfig = buildSshConfig(targetHost);

  let targetConn: SSHClient | null = null;
  let jumpConn: SSHClient | null = null;
  let isCancelled = false;

  const cancel = () => {
    isCancelled = true;
    if (targetConn) try { targetConn.end(); } catch {}
    if (jumpConn) try { jumpConn.end(); } catch {}
  };

  if (targetHost.proxyJumpHostId) {
    const jumpHost = hosts.find(h => h.id === targetHost.proxyJumpHostId);
    if (!jumpHost || jumpHost.type !== 'ssh') {
      callbacks.onError(new Error(`ProxyJump host "${targetHost.proxyJumpHostId}" not found or invalid`));
      return { cancel };
    }

    const jumpConfig = buildSshConfig(jumpHost);
    jumpConn = new SSHClient();

    jumpConn.on('ready', () => {
      if (isCancelled) return;
      const targetPort = parseInt(String(targetHost.port || 22), 10) || 22;
      jumpConn!.forwardOut('127.0.0.1', 0, targetHost.hostname || '127.0.0.1', targetPort, (err, stream) => {
        if (err) {
          callbacks.onError(new Error(`ProxyJump forwardOut failed: ${err.message}`));
          jumpConn?.end();
          return;
        }
        if (isCancelled) {
          stream.destroy();
          jumpConn?.end();
          return;
        }

        targetConn = new SSHClient();
        targetConn.on('ready', () => {
          if (isCancelled) return;
          callbacks.onReady(targetConn!, jumpConn || undefined);
        });
        targetConn.on('error', (targetErr) => {
          callbacks.onError(targetErr);
          jumpConn?.end();
        });

        const finalConfig: Record<string, unknown> = { ...targetConfig, sock: stream };
        delete finalConfig.host;
        delete finalConfig.port;
        targetConn.connect(finalConfig);
      });
    });

    jumpConn.on('error', (jumpErr) => {
      callbacks.onError(new Error(`ProxyJump connection to "${jumpHost.label}" failed: ${jumpErr.message}`));
    });

    jumpConn.connect(jumpConfig);
  } else {
    targetConn = new SSHClient();
    targetConn.on('ready', () => {
      if (isCancelled) return;
      callbacks.onReady(targetConn!);
    });
    targetConn.on('error', (err) => {
      callbacks.onError(err);
    });
    targetConn.connect(targetConfig);
  }

  return { cancel };
}

function parseSshConfig(content: string): Array<Partial<HostItem> & { identityFilePath?: string; proxyJumpAlias?: string }> {
  const lines = content.split(/\r?\n/);
  const items: Array<Partial<HostItem> & { identityFilePath?: string; proxyJumpAlias?: string }> = [];
  let current: (Partial<HostItem> & { identityFilePath?: string; proxyJumpAlias?: string }) | null = null;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/\s+/);
    const key = parts[0].toLowerCase();
    const val = parts.slice(1).join(' ').replace(/^["']|["']$/g, '');

    if (key === 'host') {
      if (current && current.label && current.label !== '*') {
        items.push(current);
      }
      if (val === '*') {
        current = null;
        continue;
      }
      current = {
        label: val,
        hostname: val,
        type: 'ssh',
        authType: 'password',
        port: 22,
        username: os.userInfo().username
      };
    } else if (current) {
      if (key === 'hostname') {
        current.hostname = val;
      } else if (key === 'user') {
        current.username = val;
      } else if (key === 'port') {
        const p = parseInt(val, 10);
        if (!isNaN(p)) current.port = p;
      } else if (key === 'identityfile') {
        current.identityFilePath = val;
        current.authType = 'key';
      } else if (key === 'proxyjump') {
        current.proxyJumpAlias = val;
      }
    }
  }

  if (current && current.label && current.label !== '*') {
    items.push(current);
  }

  return items;
}

// -------------------------------------------------------------
// Per-Account Registry Manager (registry-<accountId>.json)
// -------------------------------------------------------------
function getRegistryFilePath(accountId: string): string {
  const safeId = accountId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `registry-${safeId}.json`);
}

function loadAccountRegistry(accountId: string): AccountRegistry {
  const regPath = getRegistryFilePath(accountId);
  if (fs.existsSync(regPath)) {
    try {
      return JSON.parse(fs.readFileSync(regPath, 'utf-8')) as AccountRegistry;
    } catch {}
  }
  return {
    accountId,
    version: 1,
    updatedAt: Date.now(),
    folders: readData<FolderItem[]>('folders.json', []),
    hosts: readData<HostItem[]>('hosts.json', []),
    tunnels: readData<TunnelItem[]>('tunnels.json', []),
    keys: readData<SshKeyItem[]>('keys.json', []),
    snippets: readData<SnippetItem[]>('snippets.json', []),
    settings: readData<SettingsData>('settings.json', {})
  };
}

function saveAccountRegistry(registry: AccountRegistry): void {
  const regPath = getRegistryFilePath(registry.accountId);
  try {
    fs.writeFileSync(regPath, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving account registry:', err);
  }
}

function syncActiveRegistry(accountId = 'default-user'): void {
  const registry: AccountRegistry = {
    accountId,
    version: 1,
    updatedAt: Date.now(),
    folders: readData<FolderItem[]>('folders.json', []),
    hosts: readData<HostItem[]>('hosts.json', []),
    tunnels: readData<TunnelItem[]>('tunnels.json', []),
    keys: readData<SshKeyItem[]>('keys.json', []),
    snippets: readData<SnippetItem[]>('snippets.json', []),
    settings: readData<SettingsData>('settings.json', {})
  };
  saveAccountRegistry(registry);
}

// -------------------------------------------------------------
// Folders API (Group & Organize Hosts)
// -------------------------------------------------------------
app.get('/api/folders', (_req: Request, res: Response) => {
  const folders = readData<FolderItem[]>('folders.json', []);
  res.json({ success: true, folders });
});

app.post('/api/folders', (req: Request, res: Response) => {
  const folders = readData<FolderItem[]>('folders.json', []);
  const body = req.body as Partial<FolderItem>;
  const newFolder: FolderItem = {
    id: body.id || `folder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: body.name || 'New Folder',
    color: body.color || '#7b61ff',
    icon: body.icon || '📁',
    parentId: body.parentId || null,
    orderIndex: typeof body.orderIndex === 'number' ? body.orderIndex : folders.length,
    collapsed: Boolean(body.collapsed),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  folders.push(newFolder);
  writeData('folders.json', folders);
  syncActiveRegistry();
  res.json({ success: true, folder: newFolder });
});

app.put('/api/folders/:id', (req: Request, res: Response) => {
  const folderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const folders = readData<FolderItem[]>('folders.json', []);
  const index = folders.findIndex(f => f.id === folderId);
  if (index === -1) return res.status(404).json({ success: false, error: 'Folder not found' });
  folders[index] = { ...folders[index], ...(req.body as Partial<FolderItem>), id: folders[index].id, updatedAt: Date.now() };
  writeData('folders.json', folders);
  syncActiveRegistry();
  res.json({ success: true, folder: folders[index] });
});

app.delete('/api/folders/:id', (req: Request, res: Response) => {
  const folderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  let folders = readData<FolderItem[]>('folders.json', []);
  folders = folders.filter(f => f.id !== folderId);
  writeData('folders.json', folders);

  // Unlink hosts in this folder
  const hosts = readData<HostItem[]>('hosts.json', []);
  let hostsModified = false;
  for (const h of hosts) {
    if (h.folderId === folderId) {
      h.folderId = null;
      hostsModified = true;
    }
  }
  if (hostsModified) writeData('hosts.json', hosts);

  syncActiveRegistry();
  res.json({ success: true });
});

app.get('/api/registry', (req: Request, res: Response) => {
  const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : 'default-user';
  const registry = loadAccountRegistry(accountId);
  res.json({ success: true, registry });
});

app.post('/api/registry/activate', (req: Request, res: Response) => {
  const reqBody: unknown = req.body;
  const accountId = (reqBody && typeof reqBody === 'object' && 'accountId' in reqBody && typeof reqBody.accountId === 'string')
    ? reqBody.accountId
    : 'default-user';
  const registry = loadAccountRegistry(accountId);

  if (Array.isArray(registry.folders)) writeData('folders.json', registry.folders);
  if (Array.isArray(registry.hosts)) writeData('hosts.json', registry.hosts);
  if (Array.isArray(registry.tunnels)) writeData('tunnels.json', registry.tunnels);
  if (Array.isArray(registry.keys)) writeData('keys.json', registry.keys);
  if (Array.isArray(registry.snippets)) writeData('snippets.json', registry.snippets);
  if (registry.settings && typeof registry.settings === 'object') writeData('settings.json', registry.settings);

  res.json({ success: true, message: `Active workspace switched to account ${accountId}`, registry });
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
    keyId: body.keyId || '',
    folderId: body.folderId !== undefined ? body.folderId : null,
    orderIndex: typeof body.orderIndex === 'number' ? body.orderIndex : hosts.length,
    group: body.group || 'Default',
    color: body.color || '#7b61ff',
    shellType: body.shellType || (os.platform() === 'darwin' ? 'zsh' : 'powershell'),
    proxyJumpHostId: body.proxyJumpHostId || '',
    startupScript: body.startupScript || '',
    osType: body.osType || 'ubuntu',
    tags: Array.isArray(body.tags) ? body.tags : [],
    backspace: body.backspace || 'default',
    createdAt: Date.now(),
    lastConnected: null
  };
  hosts.push(newHost);
  writeData('hosts.json', hosts);
  syncActiveRegistry();
  res.json({ success: true, host: newHost });
});

app.put('/api/hosts/:id', (req: Request, res: Response) => {
  const hostId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const hosts = readData<HostItem[]>('hosts.json', []);
  const index = hosts.findIndex(h => h.id === hostId);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Host not found' });
  }
  hosts[index] = { ...hosts[index], ...(req.body as Partial<HostItem>), id: hosts[index].id };
  writeData('hosts.json', hosts);
  syncActiveRegistry();
  res.json({ success: true, host: hosts[index] });
});

app.post('/api/hosts/:id/move', (req: Request, res: Response) => {
  const hostId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const reqBody: unknown = req.body;
  const folderId = (reqBody && typeof reqBody === 'object' && 'folderId' in reqBody) ? (reqBody.folderId as string | null) : null;
  const hosts = readData<HostItem[]>('hosts.json', []);
  const host = hosts.find(h => h.id === hostId);
  if (!host) return res.status(404).json({ success: false, error: 'Host not found' });
  host.folderId = folderId;
  writeData('hosts.json', hosts);
  syncActiveRegistry();
  res.json({ success: true, host });
});

app.delete('/api/hosts/:id', (req: Request, res: Response) => {
  const hostId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  let hosts = readData<HostItem[]>('hosts.json', []);
  hosts = hosts.filter(h => h.id !== hostId);
  writeData('hosts.json', hosts);
  syncActiveRegistry();
  res.json({ success: true });
});
// Import ~/.ssh/config (Termius Parity)
app.post('/api/hosts/import-ssh-config', (req: Request, res: Response) => {
  const reqBody: unknown = req.body;
  const customPath = (reqBody && typeof reqBody === 'object' && 'customPath' in reqBody && typeof reqBody.customPath === 'string') ? reqBody.customPath : undefined;
  const configPath = customPath || path.join(os.homedir(), '.ssh', 'config');
  if (!fs.existsSync(configPath)) {
    return res.status(404).json({ success: false, error: `SSH config not found at ${configPath}` });
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const existingHosts = readData<HostItem[]>('hosts.json', []);
    const existingKeys = readData<SshKeyItem[]>('keys.json', []);
    const parsed = parseSshConfig(content);

    let importedCount = 0;
    let skippedCount = 0;
    const aliasToHostMap = new Map<string, HostItem>();

    for (const item of parsed) {
      if (!item.label) continue;
      const already = existingHosts.find(h => h.label.toLowerCase() === item.label!.toLowerCase());
      if (already) {
        aliasToHostMap.set(item.label.toLowerCase(), already);
        skippedCount++;
        continue;
      }

      let privateKeyContent = '';
      let keyId = '';
      if (item.identityFilePath) {
        let keyPath = item.identityFilePath;
        if (keyPath.startsWith('~/') || keyPath === '~') {
          keyPath = path.join(os.homedir(), keyPath.slice(2));
        }
        if (fs.existsSync(keyPath)) {
          try {
            privateKeyContent = fs.readFileSync(keyPath, 'utf-8');
            const keyLabel = path.basename(keyPath);
            const foundKey = existingKeys.find(k => k.label === keyLabel || k.privateKey === privateKeyContent);
            if (foundKey) {
              keyId = foundKey.id;
            } else {
              const newKey: SshKeyItem = {
                id: `key_${uuidv4().slice(0, 8)}`,
                label: `Imported (${keyLabel})`,
                keyType: privateKeyContent.includes('OPENSSH PRIVATE KEY') ? 'ed25519' : 'rsa',
                publicKey: '',
                privateKey: privateKeyContent,
                createdAt: Date.now()
              };
              existingKeys.push(newKey);
              keyId = newKey.id;
            }
          } catch {}
        }
      }

      const host: HostItem = {
        id: uuidv4(),
        label: item.label,
        type: 'ssh',
        hostname: item.hostname || item.label,
        port: item.port || 22,
        username: item.username || os.userInfo().username,
        authType: (keyId || privateKeyContent) ? 'key' : 'password',
        password: '',
        privateKey: privateKeyContent,
        keyId: keyId || undefined,
        group: 'Imported',
        color: '#34c759',
        shellType: os.platform() === 'darwin' ? 'zsh' : 'powershell',
        createdAt: Date.now(),
        lastConnected: null
      };

      aliasToHostMap.set(item.label.toLowerCase(), host);
      existingHosts.push(host);
      importedCount++;
    }

    // Resolve ProxyJump aliases
    for (const p of parsed) {
      if (p.proxyJumpAlias && p.label) {
        const targetHost = aliasToHostMap.get(p.label.toLowerCase());
        const jumpHost = aliasToHostMap.get(p.proxyJumpAlias.toLowerCase());
        if (targetHost && jumpHost) {
          targetHost.proxyJumpHostId = jumpHost.id;
        }
      }
    }

    writeData('hosts.json', existingHosts);
    writeData('keys.json', existingKeys);

    res.json({
      success: true,
      importedCount,
      skippedCount,
      totalCount: existingHosts.length,
      hosts: existingHosts
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: 'Failed to import SSH config: ' + errorMsg });
  }
});

app.post('/api/hosts/test', (req: Request, res: Response) => {
  const body = req.body as Partial<HostItem>;
  const { hostname, username } = body;
  if (!hostname || !username) {
    return res.status(400).json({ success: false, error: 'Host and username are required' });
  }

  const tempHost: HostItem = {
    id: body.id || 'test_temp',
    label: body.label || 'Test Host',
    type: 'ssh',
    hostname: body.hostname || '',
    port: parseInt(String(body.port || 22), 10) || 22,
    username: body.username || '',
    authType: body.authType || 'password',
    password: body.password || '',
    privateKey: body.privateKey || '',
    passphrase: body.passphrase || '',
    keyId: body.keyId || '',
    proxyJumpHostId: body.proxyJumpHostId || ''
  };

  let finished = false;
  const timer = setTimeout(() => {
    if (!finished) {
      finished = true;
      connHandle.cancel();
      res.json({ success: false, error: 'Connection timed out after 15 seconds' });
    }
  }, 15000);

  const connHandle = connectSsh(tempHost, {
    onReady: (conn, jumpConn) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        try { conn.end(); } catch {}
        try { jumpConn?.end(); } catch {}
        res.json({
          success: true,
          message: 'SSH Authentication Successful!' + (tempHost.proxyJumpHostId ? ' (via ProxyJump Bastion)' : '')
        });
      }
    },
    onError: (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        res.json({ success: false, error: err.message || 'SSH connection failed' });
      }
    }
  });
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
    folders?: FolderItem[];
    hosts?: HostItem[];
    tunnels?: TunnelItem[];
    keys?: SshKeyItem[];
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

  const folders = readData<FolderItem[]>('folders.json', []);
  const hosts = readData<HostItem[]>('hosts.json', []);
  const tunnels = readData<TunnelItem[]>('tunnels.json', []);
  const keys = readData<SshKeyItem[]>('keys.json', []);
  const snippets = readData<SnippetItem[]>('snippets.json', []);
  const settings = readData<SettingsData>('settings.json', {});

  const payload = {
    syncKey,
    device: `${os.hostname()} (${os.platform()} ${os.arch()})`,
    timestamp: Date.now(),
    data: { folders, hosts, tunnels, keys, snippets, settings }
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
      if (Array.isArray(data.data.folders)) writeData('folders.json', data.data.folders);
      if (Array.isArray(data.data.hosts)) writeData('hosts.json', data.data.hosts);
      if (Array.isArray(data.data.tunnels)) writeData('tunnels.json', data.data.tunnels);
      if (Array.isArray(data.data.keys)) writeData('keys.json', data.data.keys);
      if (Array.isArray(data.data.snippets)) writeData('snippets.json', data.data.snippets);
      if (data.data.settings && typeof data.data.settings === 'object') {
        const localSettings = readData<SettingsData>('settings.json', {});
        const mergedSettings = { ...localSettings, ...data.data.settings, lastCloudSync: Date.now() };
        writeData('settings.json', mergedSettings);
      }
      syncActiveRegistry(syncKey);
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
  createReadStream: (filePath: string, options?: unknown) => NodeJS.ReadableStream;
  createWriteStream: (filePath: string, options?: unknown) => NodeJS.WritableStream;
}

interface SftpSession {
  conn: SSHClient;
  jumpConn?: SSHClient;
  sftp: SftpWrapper;
  hostId: string;
  connectedAt: number;
}
const sftpClients = new Map<string, SftpSession>();

app.post('/api/sftp/connect', (req: Request, res: Response) => {
  const reqBody: unknown = req.body;
  const hostId = (reqBody && typeof reqBody === 'object' && 'hostId' in reqBody && typeof reqBody.hostId === 'string') ? reqBody.hostId : undefined;
  const hosts = readData<HostItem[]>('hosts.json', []);
  const host = hosts.find(h => h.id === hostId);
  if (!host || host.type !== 'ssh') {
    return res.status(400).json({ success: false, error: 'Valid SSH host required' });
  }

  const sessionId = uuidv4();
  let responded = false;
  const timer = setTimeout(() => {
    if (!responded) {
      responded = true;
      connHandle.cancel();
      res.status(504).json({ success: false, error: 'SFTP connection timed out after 15s' });
    }
  }, 15000);

  const connHandle = connectSsh(host, {
    onReady: (conn, jumpConn) => {
      conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
        if (responded) {
          try { conn.end(); } catch {}
          try { jumpConn?.end(); } catch {}
          return;
        }
        responded = true;
        clearTimeout(timer);

        if (err) {
          try { conn.end(); } catch {}
          try { jumpConn?.end(); } catch {}
          return res.status(500).json({ success: false, error: 'Failed to initialize SFTP: ' + err.message });
        }

        sftpClients.set(sessionId, {
          conn,
          jumpConn,
          sftp: sftp as unknown as SftpWrapper,
          hostId: host.id,
          connectedAt: Date.now()
        });

        res.json({ success: true, sessionId, initialPath: '/home/' + host.username });
      });
    },
    onError: (err) => {
      if (!responded) {
        responded = true;
        clearTimeout(timer);
        res.status(500).json({ success: false, error: err.message || 'SSH connection failed' });
      }
    }
  });
});

// Read remote file content for in-app code editor (Termius Parity)
app.post('/api/sftp/read-file', (req: Request, res: Response) => {
  const reqBody: unknown = req.body;
  const sessionId = (reqBody && typeof reqBody === 'object' && 'sessionId' in reqBody && typeof reqBody.sessionId === 'string') ? reqBody.sessionId : undefined;
  const filePath = (reqBody && typeof reqBody === 'object' && 'filePath' in reqBody && typeof reqBody.filePath === 'string') ? reqBody.filePath : undefined;

  if (!sessionId || !filePath) return res.status(400).json({ success: false, error: 'Session ID and file path required' });
  const session = sftpClients.get(sessionId);
  if (!session) return res.status(401).json({ success: false, error: 'SFTP session expired or not found' });

  const stream = session.sftp.createReadStream(filePath);
  const chunks: Buffer[] = [];
  let totalLength = 0;
  const MAX_SIZE = 2 * 1024 * 1024; // 2MB max for text editor
  let hasError = false;

  stream.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
    totalLength += chunk.length;
    if (totalLength > MAX_SIZE && !hasError) {
      hasError = true;
      (stream as unknown as { destroy: () => void }).destroy();
      res.status(413).json({ success: false, error: 'File is too large for inline editor (max 2MB)' });
    }
  });

  stream.on('end', () => {
    if (!hasError) {
      const content = Buffer.concat(chunks).toString('utf-8');
      res.json({ success: true, path: filePath, content });
    }
  });

  stream.on('error', (err: Error) => {
    if (!hasError) {
      hasError = true;
      res.status(500).json({ success: false, error: 'Failed to read remote file: ' + err.message });
    }
  });
});

// Write remote file content from in-app code editor (Termius Parity)
app.post('/api/sftp/write-file', (req: Request, res: Response) => {
  const reqBody: unknown = req.body;
  const sessionId = (reqBody && typeof reqBody === 'object' && 'sessionId' in reqBody && typeof reqBody.sessionId === 'string') ? reqBody.sessionId : undefined;
  const filePath = (reqBody && typeof reqBody === 'object' && 'filePath' in reqBody && typeof reqBody.filePath === 'string') ? reqBody.filePath : undefined;
  const content = (reqBody && typeof reqBody === 'object' && 'content' in reqBody && typeof reqBody.content === 'string') ? reqBody.content : undefined;

  if (!sessionId || !filePath || content === undefined) {
    return res.status(400).json({ success: false, error: 'Session ID, file path, and content required' });
  }
  const session = sftpClients.get(sessionId);
  if (!session) return res.status(401).json({ success: false, error: 'SFTP session expired or not found' });

  const stream = session.sftp.createWriteStream(filePath);
  let responded = false;

  stream.on('close', () => {
    if (!responded) {
      responded = true;
      res.json({ success: true, path: filePath });
    }
  });

  stream.on('error', (err: Error) => {
    if (!responded) {
      responded = true;
      res.status(500).json({ success: false, error: 'Failed to save remote file: ' + err.message });
    }
  });

  const buffer = Buffer.from(content, 'utf-8');
  (stream as unknown as NodeJS.WritableStream).end(buffer);
});

// Disconnect SFTP session
app.post('/api/sftp/disconnect', (req: Request, res: Response) => {
  const reqBody: unknown = req.body;
  const sessionId = (reqBody && typeof reqBody === 'object' && 'sessionId' in reqBody && typeof reqBody.sessionId === 'string') ? reqBody.sessionId : undefined;
  if (sessionId && sftpClients.has(sessionId)) {
    const session = sftpClients.get(sessionId)!;
    try { session.conn.end(); } catch {}
    try { session.jumpConn?.end(); } catch {}
    sftpClients.delete(sessionId);
  }
  res.json({ success: true });
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
interface ActiveTunnelRuntime {
  tunnelId: string;
  server?: net.Server;
  sshConn?: SSHClient;
  jumpConn?: SSHClient;
  status: 'active' | 'inactive' | 'error';
  errorMessage?: string;
}

const activeTunnels = new Map<string, ActiveTunnelRuntime>();

function createSocks5Server(sshConn: SSHClient): net.Server {
  return net.createServer((socket) => {
    let state: 'AUTH' | 'REQ' | 'FORWARDING' = 'AUTH';
    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (state === 'AUTH') {
        if (buffer.length < 2) return;
        const version = buffer[0];
        const nmethods = buffer[1];
        if (version !== 0x05) {
          socket.destroy();
          return;
        }
        if (buffer.length < 2 + nmethods) return;
        socket.write(Buffer.from([0x05, 0x00]));
        buffer = buffer.subarray(2 + nmethods);
        state = 'REQ';
      }

      if (state === 'REQ') {
        if (buffer.length < 4) return;
        const ver = buffer[0];
        const cmd = buffer[1];
        const atyp = buffer[3];
        if (ver !== 0x05 || cmd !== 0x01) {
          socket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          socket.destroy();
          return;
        }

        let destHost = '';
        let headerLen = 0;

        if (atyp === 0x01) {
          if (buffer.length < 10) return;
          destHost = `${buffer[4]}.${buffer[5]}.${buffer[6]}.${buffer[7]}`;
          headerLen = 10;
        } else if (atyp === 0x03) {
          const domainLen = buffer[4];
          if (buffer.length < 5 + domainLen + 2) return;
          destHost = buffer.subarray(5, 5 + domainLen).toString('utf-8');
          headerLen = 5 + domainLen + 2;
        } else if (atyp === 0x04) {
          if (buffer.length < 22) return;
          const parts: string[] = [];
          for (let i = 4; i < 20; i += 2) {
            parts.push(buffer.readUInt16BE(i).toString(16));
          }
          destHost = parts.join(':');
          headerLen = 22;
        } else {
          socket.destroy();
          return;
        }

        const destPort = buffer.readUInt16BE(headerLen - 2);
        const remainder = buffer.subarray(headerLen);
        state = 'FORWARDING';
        socket.removeAllListeners('data');

        sshConn.forwardOut('127.0.0.1', socket.remotePort || 0, destHost, destPort, (err, stream) => {
          if (err) {
            try {
              socket.write(Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
              socket.destroy();
            } catch {}
            return;
          }

          socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          if (remainder.length > 0) {
            stream.write(remainder);
          }
          socket.pipe(stream).pipe(socket);

          socket.on('error', () => stream.destroy());
          stream.on('error', () => socket.destroy());
        });
      }
    });

    socket.on('error', () => {});
  });
}

function startTunnel(tunnel: TunnelItem, onDone?: (success: boolean, err?: string) => void): void {
  stopTunnel(tunnel.id);

  const hosts = readData<HostItem[]>('hosts.json', []);
  const host = hosts.find(h => h.id === tunnel.hostId);
  if (!host || host.type !== 'ssh') {
    const err = 'SSH Host for tunnel not found';
    activeTunnels.set(tunnel.id, { tunnelId: tunnel.id, status: 'error', errorMessage: err });
    onDone?.(false, err);
    return;
  }

  activeTunnels.set(tunnel.id, { tunnelId: tunnel.id, status: 'inactive' });

  connectSsh(host, {
    onReady: (sshConn, jumpConn) => {
      if (tunnel.tunnelType === 'local') {
        const tcpServer = net.createServer((socket) => {
          sshConn.forwardOut('127.0.0.1', socket.remotePort || 0, tunnel.remoteHost, tunnel.remotePort, (err, stream) => {
            if (err) {
              socket.destroy();
              return;
            }
            socket.pipe(stream).pipe(socket);
            socket.on('error', () => stream.destroy());
            stream.on('error', () => socket.destroy());
          });
          socket.on('error', () => {});
        });

        tcpServer.listen(tunnel.localPort, '127.0.0.1', () => {
          activeTunnels.set(tunnel.id, {
            tunnelId: tunnel.id,
            server: tcpServer,
            sshConn,
            jumpConn,
            status: 'active'
          });
          onDone?.(true);
        });

        tcpServer.on('error', (err: Error) => {
          activeTunnels.set(tunnel.id, {
            tunnelId: tunnel.id,
            status: 'error',
            errorMessage: `Port ${tunnel.localPort} error: ${err.message}`
          });
          try { sshConn.end(); } catch {}
          try { jumpConn?.end(); } catch {}
          onDone?.(false, err.message);
        });

      } else if (tunnel.tunnelType === 'socks5') {
        const socksServer = createSocks5Server(sshConn);
        socksServer.listen(tunnel.localPort, '127.0.0.1', () => {
          activeTunnels.set(tunnel.id, {
            tunnelId: tunnel.id,
            server: socksServer,
            sshConn,
            jumpConn,
            status: 'active'
          });
          onDone?.(true);
        });

        socksServer.on('error', (err: Error) => {
          activeTunnels.set(tunnel.id, {
            tunnelId: tunnel.id,
            status: 'error',
            errorMessage: `SOCKS5 Port ${tunnel.localPort} error: ${err.message}`
          });
          try { sshConn.end(); } catch {}
          try { jumpConn?.end(); } catch {}
          onDone?.(false, err.message);
        });

      } else if (tunnel.tunnelType === 'remote') {
        sshConn.forwardIn(tunnel.remoteHost || '127.0.0.1', tunnel.remotePort, (err) => {
          if (err) {
            activeTunnels.set(tunnel.id, {
              tunnelId: tunnel.id,
              status: 'error',
              errorMessage: `Remote forward error: ${err.message}`
            });
            try { sshConn.end(); } catch {}
            try { jumpConn?.end(); } catch {}
            onDone?.(false, err.message);
            return;
          }

          sshConn.on('tcp connection', (_info, accept) => {
            const localSocket = net.connect(tunnel.localPort, '127.0.0.1', () => {
              const remoteStream = accept();
              localSocket.pipe(remoteStream).pipe(localSocket);
              localSocket.on('error', () => remoteStream.destroy());
              remoteStream.on('error', () => localSocket.destroy());
            });
            localSocket.on('error', () => {});
          });

          activeTunnels.set(tunnel.id, {
            tunnelId: tunnel.id,
            sshConn,
            jumpConn,
            status: 'active'
          });
          onDone?.(true);
        });
      }
    },
    onError: (err) => {
      activeTunnels.set(tunnel.id, {
        tunnelId: tunnel.id,
        status: 'error',
        errorMessage: err.message
      });
      onDone?.(false, err.message);
    }
  });
}

function stopTunnel(tunnelId: string): void {
  const active = activeTunnels.get(tunnelId);
  if (!active) return;
  if (active.server) {
    try { active.server.close(); } catch {}
  }
  if (active.sshConn) {
    try { active.sshConn.end(); } catch {}
  }
  if (active.jumpConn) {
    try { active.jumpConn.end(); } catch {}
  }
  activeTunnels.delete(tunnelId);
}

app.get('/api/tunnels', (_req: Request, res: Response) => {
  const tunnels = readData<TunnelItem[]>('tunnels.json', []);
  const enriched = tunnels.map(t => {
    const active = activeTunnels.get(t.id);
    return {
      ...t,
      status: active ? active.status : (t.enabled ? 'active' : 'inactive'),
      errorMessage: active?.errorMessage
    };
  });
  res.json({ success: true, tunnels: enriched });
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
    status: 'inactive',
    createdAt: Date.now()
  };
  tunnels.push(newTunnel);
  writeData('tunnels.json', tunnels);

  if (newTunnel.enabled) {
    startTunnel(newTunnel, (ok, err) => {
      newTunnel.status = ok ? 'active' : 'error';
      newTunnel.errorMessage = err;
      writeData('tunnels.json', tunnels);
    });
  }

  res.json({ success: true, tunnel: newTunnel });
});

app.post('/api/tunnels/:id/toggle', (req: Request, res: Response) => {
  const tunnelId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tunnels = readData<TunnelItem[]>('tunnels.json', []);
  const tunnel = tunnels.find(t => t.id === tunnelId);
  if (!tunnel) return res.status(404).json({ success: false, error: 'Tunnel not found' });

  if (tunnel.enabled) {
    stopTunnel(tunnel.id);
    tunnel.enabled = false;
    tunnel.status = 'inactive';
    tunnel.errorMessage = undefined;
    writeData('tunnels.json', tunnels);
    return res.json({ success: true, enabled: false, status: 'inactive' });
  } else {
    tunnel.enabled = true;
    startTunnel(tunnel, (ok, err) => {
      tunnel.status = ok ? 'active' : 'error';
      tunnel.errorMessage = err;
      writeData('tunnels.json', tunnels);
    });
    return res.json({ success: true, enabled: true, status: 'active' });
  }
});

app.delete('/api/tunnels/:id', (req: Request, res: Response) => {
  const tunnelId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  stopTunnel(tunnelId);
  let tunnels = readData<TunnelItem[]>('tunnels.json', []);
  tunnels = tunnels.filter(t => t.id !== tunnelId);
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
  jumpConn?: SSHClient;
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
          ws.send(JSON.stringify({
            type: 'status',
            status: 'connecting',
            message: `Connecting to ${host.username}@${host.hostname}${host.proxyJumpHostId ? ' (via Bastion)' : ''}...`
          }));

          connectSsh(host, {
            onReady: (conn, jumpConn) => {
              conn.shell({ term: 'xterm-256color', cols, rows }, (err: Error | undefined, stream: ClientChannel) => {
                if (err) {
                  ws.send(JSON.stringify({ type: 'error', message: 'Shell init error: ' + err.message }));
                  try { conn.end(); } catch {}
                  try { jumpConn?.end(); } catch {}
                  return;
                }

                terminalSession = { type: 'ssh', conn, jumpConn, stream };

                stream.on('data', (chunk: Buffer) => {
                  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'data', data: chunk.toString('utf-8') }));
                });

                stream.on('close', () => {
                  try { conn.end(); } catch {}
                  try { jumpConn?.end(); } catch {}
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'status', status: 'disconnected', message: 'SSH session closed.' }));
                  }
                });

                ws.send(JSON.stringify({
                  type: 'status',
                  status: 'connected',
                  message: `Connected to ${host.username}@${host.hostname}${host.proxyJumpHostId ? ' (via Bastion)' : ''}`
                }));

                // Auto-run startup script if defined (Termius Parity)
                if (host.startupScript) {
                  setTimeout(() => {
                    try {
                      stream.write(host.startupScript + '\n');
                    } catch {}
                  }, 400);
                }
              });
            },
            onError: (err: Error) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', message: `SSH Error: ${err.message}` }));
                ws.send(JSON.stringify({ type: 'status', status: 'error', message: err.message }));
              }
            }
          });
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
      } else if (terminalSession.type === 'ssh') {
        try { terminalSession.stream?.end(); } catch {}
        try { terminalSession.conn?.end(); } catch {}
        try { terminalSession.jumpConn?.end(); } catch {}
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
// Auto-start enabled tunnels on boot (Termius Parity)
setTimeout(() => {
  try {
    const tunnels = readData<TunnelItem[]>('tunnels.json', []);
    for (const t of tunnels) {
      if (t.enabled) {
        startTunnel(t);
      }
    }
  } catch (err: unknown) {
    console.warn('Auto-start tunnels warning:', err);
  }
}, 2000);
