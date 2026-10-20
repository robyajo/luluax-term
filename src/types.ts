export interface HostItem {
  id: string;
  label: string;
  type: 'ssh' | 'local';
  hostname?: string;
  port?: number;
  username?: string;
  authType?: 'password' | 'key';
  password?: string;
  privateKey?: string;
  passphrase?: string;
  keyId?: string;
  group?: string;
  color?: string;
  shellType?: string;
  createdAt?: number;
  lastConnected?: number | null;
}

export interface SnippetItem {
  id: string;
  title: string;
  description?: string;
  command: string;
  category?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
}

export interface TunnelItem {
  id: string;
  label: string;
  hostId: string;
  tunnelType: 'local' | 'remote' | 'socks5';
  localPort: number;
  remoteHost: string;
  remotePort: number;
  enabled: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface SshKeyItem {
  id: string;
  label: string;
  keyType: 'ed25519' | 'rsa';
  publicKey: string;
  privateKey: string;
  passphrase?: string;
  fingerprint?: string;
  createdAt?: number;
}

export interface SettingsData {
  theme?: string;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  cursorBlink?: boolean;
  cursorStyle?: string;
  scrollback?: number;
  bellSound?: boolean;
  copyOnSelect?: boolean;
  defaultShell?: string;
  cloudApiUrl?: string;
  cloudSyncKey?: string;
  cloudAutoSync?: boolean;
  lastCloudSync?: number | null;
}

export interface LocalFileEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  modifyTime: number;
  fullPath: string;
}
