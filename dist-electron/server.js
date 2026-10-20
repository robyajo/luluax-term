"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const ws_1 = require("ws");
const ssh2_1 = require("ssh2");
const node_pty_1 = __importDefault(require("node-pty"));
const uuid_1 = require("uuid");
const multer_1 = __importDefault(require("multer"));
const crypto_1 = __importDefault(require("crypto"));
const PORT = parseInt(process.env.PORT || '3980', 10);
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
function getWritableDataDir(appName, defaultDataPath) {
    const isInsideAsar = __dirname.includes('.asar');
    let targetDir;
    if (isInsideAsar) {
        if (process.env.APPDATA) {
            targetDir = path_1.default.join(process.env.APPDATA, appName);
        }
        else if (process.platform === 'darwin') {
            targetDir = path_1.default.join(os_1.default.homedir(), 'Library', 'Application Support', appName);
        }
        else {
            targetDir = path_1.default.join(os_1.default.homedir(), `.${appName.toLowerCase()}`);
        }
    }
    else {
        targetDir = defaultDataPath;
    }
    if (!fs_1.default.existsSync(targetDir)) {
        fs_1.default.mkdirSync(targetDir, { recursive: true });
    }
    if (fs_1.default.existsSync(defaultDataPath)) {
        try {
            const files = fs_1.default.readdirSync(defaultDataPath);
            for (const file of files) {
                const dest = path_1.default.join(targetDir, file);
                if (!fs_1.default.existsSync(dest)) {
                    const src = path_1.default.join(defaultDataPath, file);
                    if (fs_1.default.statSync(src).isFile()) {
                        fs_1.default.copyFileSync(src, dest);
                    }
                }
            }
        }
        catch {
            // ignore seed read warnings
        }
    }
    return targetDir;
}
// In compiled TypeScript (dist-electron/server.js), project root is path.join(__dirname, '..')
const PROJECT_ROOT = __dirname.includes('dist-electron') ? path_1.default.join(__dirname, '..') : __dirname;
const DATA_DIR = getWritableDataDir('LuluaX-Term', path_1.default.join(PROJECT_ROOT, 'data'));
function readData(file, defaultVal) {
    const filePath = path_1.default.join(DATA_DIR, file);
    try {
        if (!fs_1.default.existsSync(filePath)) {
            fs_1.default.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2), 'utf-8');
            return defaultVal;
        }
        const content = fs_1.default.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error reading ${file}:`, errorMsg);
        return defaultVal;
    }
}
function writeData(file, data) {
    const filePath = path_1.default.join(DATA_DIR, file);
    try {
        fs_1.default.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error writing ${file}:`, errorMsg);
        return false;
    }
}
app.use(express_1.default.json({ limit: '20mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use(express_1.default.static(path_1.default.join(PROJECT_ROOT, 'public')));
// Upload buffer for SFTP
const uploadDir = path_1.default.join(os_1.default.tmpdir(), 'luluax-term-uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const upload = (0, multer_1.default)({ dest: uploadDir });
// -------------------------------------------------------------
// System Info API
// -------------------------------------------------------------
app.get('/api/system', (_req, res) => {
    const platform = os_1.default.platform();
    const arch = os_1.default.arch();
    let platformLabel = 'Unknown';
    if (platform === 'darwin') {
        platformLabel = arch === 'arm64' ? 'macOS (Apple Silicon arm64)' : 'macOS (Intel x64)';
    }
    else if (platform === 'win32') {
        platformLabel = arch === 'arm64' ? 'Windows (ARM64)' : 'Windows (x64)';
    }
    else if (platform === 'linux') {
        platformLabel = `Linux (${arch})`;
    }
    res.json({
        success: true,
        platform,
        arch,
        platformLabel,
        hostname: os_1.default.hostname(),
        uptime: os_1.default.uptime(),
        nodeVersion: process.version
    });
});
// -------------------------------------------------------------
// Hosts API
// -------------------------------------------------------------
app.get('/api/hosts', (_req, res) => {
    const hosts = readData('hosts.json', []);
    res.json({ success: true, hosts });
});
app.post('/api/hosts', (req, res) => {
    const hosts = readData('hosts.json', []);
    const body = req.body;
    const newHost = {
        id: body.id || (0, uuid_1.v4)(),
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
        shellType: body.shellType || (os_1.default.platform() === 'darwin' ? 'zsh' : 'powershell'),
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
    const body = req.body;
    const { hostname, port, username, authType, password, privateKey, passphrase } = body;
    if (!hostname || !username) {
        return res.status(400).json({ success: false, error: 'Host and username are required' });
    }
    const conn = new ssh2_1.Client();
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
            port: parseInt(String(port || 22), 10) || 22,
            username,
            readyTimeout: 10000,
            keepaliveInterval: 10000
        };
        if (authType === 'key' && privateKey) {
            config.privateKey = privateKey;
            if (passphrase)
                config.passphrase = passphrase;
        }
        else {
            config.password = password || '';
        }
        conn.connect(config);
    }
    catch (err) {
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
app.get('/api/snippets', (_req, res) => {
    const snippets = readData('snippets.json', []);
    res.json({ success: true, snippets });
});
app.post('/api/snippets', (req, res) => {
    const snippets = readData('snippets.json', []);
    const body = req.body;
    const newSnippet = {
        id: body.id || (0, uuid_1.v4)(),
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
app.delete('/api/snippets/:id', (req, res) => {
    let snippets = readData('snippets.json', []);
    snippets = snippets.filter(s => s.id !== req.params.id);
    writeData('snippets.json', snippets);
    res.json({ success: true });
});
// -------------------------------------------------------------
// Settings API
// -------------------------------------------------------------
app.get('/api/settings', (_req, res) => {
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
    if (!settings.cloudApiUrl)
        settings.cloudApiUrl = defaultUrl;
    if (!settings.cloudSyncKey && defaultKey)
        settings.cloudSyncKey = defaultKey;
    res.json({ success: true, settings });
});
app.post('/api/settings', (req, res) => {
    const cur = readData('settings.json', {});
    const updated = { ...cur, ...req.body };
    writeData('settings.json', updated);
    res.json({ success: true, settings: updated });
});
app.post('/api/cloud/push', async (req, res) => {
    const body = req.body;
    const cloudApiUrl = body.cloudApiUrl;
    const syncKey = body.syncKey;
    if (!cloudApiUrl || !syncKey) {
        return res.status(400).json({ success: false, error: 'Cloud API URL and Sync Key are required' });
    }
    const hosts = readData('hosts.json', []);
    const snippets = readData('snippets.json', []);
    const settings = readData('settings.json', {});
    const payload = {
        syncKey,
        device: `${os_1.default.hostname()} (${os_1.default.platform()} ${os_1.default.arch()})`,
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
        const data = await response.json();
        if (!response.ok || !data.success) {
            return res.status(response.status).json({ success: false, error: data.error || 'Cloud sync failed' });
        }
        settings.lastCloudSync = Date.now();
        writeData('settings.json', settings);
        res.json({ success: true, message: 'Data pushed to cloud successfully!', timestamp: settings.lastCloudSync });
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: 'Cloud push network error: ' + errorMsg });
    }
});
app.post('/api/cloud/pull', async (req, res) => {
    const body = req.body;
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
        const data = (await response.json());
        if (!response.ok || !data.success) {
            return res.status(response.status).json({ success: false, error: data.error || 'Cloud pull failed' });
        }
        if (data.data) {
            if (Array.isArray(data.data.hosts))
                writeData('hosts.json', data.data.hosts);
            if (Array.isArray(data.data.snippets))
                writeData('snippets.json', data.data.snippets);
            if (data.data.settings && typeof data.data.settings === 'object') {
                const localSettings = readData('settings.json', {});
                const mergedSettings = { ...localSettings, ...data.data.settings, lastCloudSync: Date.now() };
                writeData('settings.json', mergedSettings);
            }
        }
        res.json({ success: true, message: 'Data pulled from cloud and updated locally!', timestamp: Date.now() });
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: 'Cloud pull network error: ' + errorMsg });
    }
});
const sftpClients = new Map();
app.post('/api/sftp/connect', (req, res) => {
    const { hostId } = req.body;
    const hosts = readData('hosts.json', []);
    const host = hosts.find(h => h.id === hostId);
    if (!host || host.type !== 'ssh') {
        return res.status(400).json({ success: false, error: 'Valid SSH host required' });
    }
    const sessionId = (0, uuid_1.v4)();
    const conn = new ssh2_1.Client();
    conn.on('ready', () => {
        conn.sftp((err, sftp) => {
            if (err) {
                conn.end();
                return res.status(500).json({ success: false, error: 'Failed to initialize SFTP: ' + err.message });
            }
            sftpClients.set(sessionId, { conn, sftp: sftp, hostId: host.id, connectedAt: Date.now() });
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
            if (host.passphrase)
                config.passphrase = host.passphrase;
        }
        else {
            config.password = host.password || '';
        }
        conn.connect(config);
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: errorMsg });
    }
});
app.post('/api/sftp/list', (req, res) => {
    const { sessionId, path: dirPath } = req.body;
    if (!sessionId)
        return res.status(400).json({ success: false, error: 'Session ID required' });
    const session = sftpClients.get(sessionId);
    if (!session)
        return res.status(401).json({ success: false, error: 'SFTP session expired or not found' });
    const targetPath = dirPath || '.';
    session.sftp.readdir(targetPath, (err, list) => {
        if (err)
            return res.status(500).json({ success: false, error: err.message });
        const items = list.map(item => ({
            name: item.filename,
            size: item.attrs.size,
            modifyTime: item.attrs.mtime * 1000,
            isDirectory: (item.attrs.mode & 0o40000) !== 0,
            permissions: (item.attrs.mode & 0o777).toString(8)
        }));
        items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory)
                return -1;
            if (!a.isDirectory && b.isDirectory)
                return 1;
            return a.name.localeCompare(b.name);
        });
        res.json({ success: true, path: targetPath, items });
    });
});
app.post('/api/sftp/mkdir', (req, res) => {
    const { sessionId, dirPath } = req.body;
    if (!sessionId || !dirPath)
        return res.status(400).json({ success: false, error: 'Missing parameters' });
    const session = sftpClients.get(sessionId);
    if (!session)
        return res.status(401).json({ success: false, error: 'SFTP session expired' });
    session.sftp.mkdir(dirPath, (err) => {
        if (err)
            return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
});
app.post('/api/sftp/delete', (req, res) => {
    const { sessionId, path: targetPath, isDirectory } = req.body;
    if (!sessionId || !targetPath)
        return res.status(400).json({ success: false, error: 'Missing parameters' });
    const session = sftpClients.get(sessionId);
    if (!session)
        return res.status(401).json({ success: false, error: 'SFTP session expired' });
    if (isDirectory) {
        session.sftp.rmdir(targetPath, (err) => {
            if (err)
                return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
        });
    }
    else {
        session.sftp.unlink(targetPath, (err) => {
            if (err)
                return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
        });
    }
});
// -------------------------------------------------------------
// Dual-Pane SFTP: Local Filesystem Explorer
// -------------------------------------------------------------
app.get('/api/local/drives', (_req, res) => {
    if (os_1.default.platform() === 'win32') {
        const candidateDrives = ['C:', 'D:', 'E:', 'F:', 'G:'];
        const existing = [];
        for (const d of candidateDrives) {
            try {
                if (fs_1.default.existsSync(d + '\\'))
                    existing.push(d + '\\');
            }
            catch { }
        }
        return res.json({ success: true, drives: existing.length > 0 ? existing : ['C:\\'], defaultPath: os_1.default.homedir() });
    }
    return res.json({ success: true, drives: ['/'], defaultPath: os_1.default.homedir() });
});
app.post('/api/local/list', (req, res) => {
    const targetPath = req.body.path || os_1.default.homedir();
    try {
        const entries = fs_1.default.readdirSync(targetPath, { withFileTypes: true });
        const items = [];
        for (const ent of entries) {
            try {
                const fullPath = path_1.default.join(targetPath, ent.name);
                const stat = fs_1.default.statSync(fullPath);
                items.push({
                    name: ent.name,
                    isDirectory: ent.isDirectory(),
                    size: stat.size,
                    modifyTime: stat.mtimeMs,
                    fullPath
                });
            }
            catch { }
        }
        items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory)
                return -1;
            if (!a.isDirectory && b.isDirectory)
                return 1;
            return a.name.localeCompare(b.name);
        });
        res.json({ success: true, path: targetPath, items });
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: errorMsg });
    }
});
app.post('/api/sftp/transfer-local-to-remote', (req, res) => {
    const { sessionId, localFilePath, remoteDirPath } = req.body;
    if (!sessionId || !localFilePath || !remoteDirPath)
        return res.status(400).json({ success: false, error: 'Missing parameters' });
    const session = sftpClients.get(sessionId);
    if (!session)
        return res.status(401).json({ success: false, error: 'SFTP session expired' });
    if (!fs_1.default.existsSync(localFilePath))
        return res.status(400).json({ success: false, error: 'Local file does not exist' });
    const fileName = path_1.default.basename(localFilePath);
    const destination = path_1.default.posix.join(remoteDirPath, fileName);
    const readStream = fs_1.default.createReadStream(localFilePath);
    const writeStream = session.sftp.createWriteStream(destination);
    writeStream.on('close', () => res.json({ success: true, path: destination }));
    writeStream.on('error', (err) => res.status(500).json({ success: false, error: err.message }));
    readStream.pipe(writeStream);
});
app.post('/api/sftp/transfer-remote-to-local', (req, res) => {
    const { sessionId, remoteFilePath, localDirPath } = req.body;
    if (!sessionId || !remoteFilePath || !localDirPath)
        return res.status(400).json({ success: false, error: 'Missing parameters' });
    const session = sftpClients.get(sessionId);
    if (!session)
        return res.status(401).json({ success: false, error: 'SFTP session expired' });
    const fileName = path_1.default.basename(remoteFilePath);
    const destination = path_1.default.join(localDirPath, fileName);
    const readStream = session.sftp.createReadStream(remoteFilePath);
    const writeStream = fs_1.default.createWriteStream(destination);
    writeStream.on('close', () => res.json({ success: true, path: destination }));
    writeStream.on('error', (err) => res.status(500).json({ success: false, error: err.message }));
    readStream.pipe(writeStream);
});
// -------------------------------------------------------------
// Tunnels & Keys APIs
// -------------------------------------------------------------
app.get('/api/tunnels', (_req, res) => {
    const tunnels = readData('tunnels.json', []);
    res.json({ success: true, tunnels });
});
app.post('/api/tunnels', (req, res) => {
    const tunnels = readData('tunnels.json', []);
    const body = req.body;
    const newTunnel = {
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
app.post('/api/tunnels/:id/toggle', (req, res) => {
    const tunnels = readData('tunnels.json', []);
    const tunnel = tunnels.find(t => t.id === req.params.id);
    if (!tunnel)
        return res.status(404).json({ success: false, error: 'Tunnel not found' });
    tunnel.enabled = !tunnel.enabled;
    writeData('tunnels.json', tunnels);
    res.json({ success: true, enabled: tunnel.enabled });
});
app.delete('/api/tunnels/:id', (req, res) => {
    let tunnels = readData('tunnels.json', []);
    tunnels = tunnels.filter(t => t.id !== req.params.id);
    writeData('tunnels.json', tunnels);
    res.json({ success: true });
});
app.get('/api/keys', (_req, res) => {
    const keys = readData('keys.json', []);
    res.json({ success: true, keys });
});
app.post('/api/keys/generate', (req, res) => {
    const { keyType = 'ed25519', label = 'Generated Key' } = req.body;
    try {
        let publicKey, privateKey;
        if (keyType === 'ed25519') {
            const pair = crypto_1.default.generateKeyPairSync('ed25519', {
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            });
            publicKey = pair.publicKey;
            privateKey = pair.privateKey;
        }
        else {
            const pair = crypto_1.default.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            });
            publicKey = pair.publicKey;
            privateKey = pair.privateKey;
        }
        const keys = readData('keys.json', []);
        const newKey = {
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
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: errorMsg });
    }
});
// -------------------------------------------------------------
// WebSocket Terminal Streaming
// -------------------------------------------------------------
function resolveLocalShell(shellType) {
    if (os_1.default.platform() === 'darwin') {
        if (shellType === 'bash' && fs_1.default.existsSync('/bin/bash'))
            return '/bin/bash';
        if (shellType === 'fish') {
            if (fs_1.default.existsSync('/opt/homebrew/bin/fish'))
                return '/opt/homebrew/bin/fish';
            if (fs_1.default.existsSync('/usr/local/bin/fish'))
                return '/usr/local/bin/fish';
        }
        if (shellType === 'zsh' && fs_1.default.existsSync('/bin/zsh'))
            return '/bin/zsh';
        return process.env.SHELL || '/bin/zsh';
    }
    if (os_1.default.platform() === 'win32') {
        if (shellType === 'cmd')
            return 'cmd.exe';
        if (shellType === 'gitbash') {
            const candidates = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'];
            for (const c of candidates) {
                if (fs_1.default.existsSync(c))
                    return c;
            }
            return 'bash.exe';
        }
        if (shellType === 'wsl')
            return 'wsl.exe';
        return 'powershell.exe';
    }
    return process.env.SHELL || '/bin/bash';
}
wss.on('connection', (ws) => {
    let terminalSession = null;
    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.type === 'init') {
                const { hostId, cols = 80, rows = 24 } = data;
                const hosts = readData('hosts.json', []);
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
                    const ptyProcess = node_pty_1.default.spawn(shellExe, [], {
                        name: 'xterm-256color',
                        cols,
                        rows,
                        cwd,
                        env: process.env
                    });
                    terminalSession = { type: 'local', pty: ptyProcess };
                    ptyProcess.onData((chunk) => {
                        if (ws.readyState === ws_1.WebSocket.OPEN)
                            ws.send(JSON.stringify({ type: 'data', data: chunk }));
                    });
                    ptyProcess.onExit(({ exitCode }) => {
                        if (ws.readyState === ws_1.WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'status', status: 'disconnected', message: `Process exited with code ${exitCode}` }));
                        }
                    });
                    ws.send(JSON.stringify({ type: 'status', status: 'connected', message: `Started ${host.label} (${shellExe})` }));
                }
                else if (host.type === 'ssh') {
                    const conn = new ssh2_1.Client();
                    ws.send(JSON.stringify({ type: 'status', status: 'connecting', message: `Connecting to ${host.username}@${host.hostname}...` }));
                    conn.on('ready', () => {
                        conn.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
                            if (err) {
                                ws.send(JSON.stringify({ type: 'error', message: 'Shell init error: ' + err.message }));
                                conn.end();
                                return;
                            }
                            terminalSession = { type: 'ssh', conn, stream };
                            stream.on('data', (chunk) => {
                                if (ws.readyState === ws_1.WebSocket.OPEN)
                                    ws.send(JSON.stringify({ type: 'data', data: chunk.toString('utf-8') }));
                            });
                            stream.on('close', () => {
                                conn.end();
                                if (ws.readyState === ws_1.WebSocket.OPEN) {
                                    ws.send(JSON.stringify({ type: 'status', status: 'disconnected', message: 'SSH session closed.' }));
                                }
                            });
                            ws.send(JSON.stringify({ type: 'status', status: 'connected', message: `Connected to ${host.username}@${host.hostname}` }));
                        });
                    });
                    conn.on('error', (err) => {
                        if (ws.readyState === ws_1.WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'error', message: `SSH Error: ${err.message}` }));
                            ws.send(JSON.stringify({ type: 'status', status: 'error', message: err.message }));
                        }
                    });
                    const sshConfig = {
                        host: host.hostname,
                        port: parseInt(String(host.port || 22), 10) || 22,
                        username: host.username,
                        readyTimeout: 15000,
                        keepaliveInterval: 10000
                    };
                    if (host.authType === 'key' && host.privateKey) {
                        sshConfig.privateKey = host.privateKey;
                        if (host.passphrase)
                            sshConfig.passphrase = host.passphrase;
                    }
                    else {
                        sshConfig.password = host.password || '';
                    }
                    conn.connect(sshConfig);
                }
            }
            else if (data.type === 'data' && data.data) {
                if (terminalSession) {
                    if (terminalSession.type === 'local' && terminalSession.pty) {
                        terminalSession.pty.write(data.data);
                    }
                    else if (terminalSession.type === 'ssh' && terminalSession.stream) {
                        terminalSession.stream.write(data.data);
                    }
                }
            }
            else if (data.type === 'resize' && data.cols && data.rows) {
                if (terminalSession) {
                    if (terminalSession.type === 'local' && terminalSession.pty) {
                        terminalSession.pty.resize(data.cols, data.rows);
                    }
                    else if (terminalSession.type === 'ssh' && terminalSession.stream) {
                        terminalSession.stream.setWindow(data.rows, data.cols, 0, 0);
                    }
                }
            }
        }
        catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error('WebSocket parse error:', errorMsg);
        }
    });
    ws.on('close', () => {
        if (terminalSession) {
            if (terminalSession.type === 'local' && terminalSession.pty) {
                try {
                    terminalSession.pty.kill();
                }
                catch { }
            }
            else if (terminalSession.type === 'ssh' && terminalSession.conn) {
                try {
                    terminalSession.conn.end();
                }
                catch { }
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
