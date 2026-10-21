---
name: luluax-term
description: "Arsitektur dan panduan pengembangan aplikasi LuluaX-Term: Terminal & SSH Client multi-platform (Windows x64/ARM64 dan macOS Apple Silicon M-Series). Meliputi xterm.js v6.0, Windows ConPTY, macOS PTY (/bin/zsh), Pure JS SSH2, Dual-Pane SFTP Manager (khas Termius), Port Forwarding/SSH Tunnels, Cryptographic SSH Key Vault (Ed25519 & RSA), dan Cloud Sync ke Hono + Neon PostgreSQL (https://www.luluax-service.duckdns.org). Gunakan skill ini setiap kali mengembangkan, memperbaiki bug, menambah fitur, atau memaketkan aplikasi LuluaX-Term."
---

# LuluaX-Term — Panduan Arsitektur & Pengembangan AI Agent

Skill ini memuat seluruh panduan arsitektur, struktur kode, alur kerja, konvensi, dan aturan teknis untuk mengembangkan aplikasi **LuluaX-Term** di perangkat mana pun.

---

## 1. Arsitektur & Teknologi Utama

- **Jenis Aplikasi**: Desktop Client (berjalan sebagai Electron app mandiri atau Web-App via Express).
- **Frontend**:
  - Mesin Terminal: `@xterm/xterm` (v6.0) dengan addons `@xterm/addon-fit` dan `@xterm/addon-web-links`.
  - UI Engine: Vanilla JavaScript SPA dengan tema Termius Desktop Dark (`public/index.html`, `public/style.css`, `public/app.js`).
  - **Skill Khusus Desain UI**: Lihat [luluax-termius-ui](../luluax-termius-ui/SKILL.md) untuk panduan lengkap desain sistem Termius, hierarki DOM, token warna, distro SVG badges, dan panel inspector dengan debounced auto-save.
- **Backend Lokal (`server.js`)**:
  - Server: Express + WebSocket Server (`ws`) pada port bawaan **3980** (dapat diubah via `PORT` di `.env`).
  - SSH Client: Pure JavaScript `ssh2` Client (mendukung enkripsi modern, private key PEM/OpenSSH, passphrase, keepalive).
  - Local PTY Engine: `node-pty` menggunakan Windows ConPTY di Windows dan native `/bin/zsh` (atau `/bin/bash`) di macOS.
  - Penyimpanan Data: `AppData/Roaming/LuluaX-Term` di Windows atau `~/Library/Application Support/LuluaX-Term` di macOS (menghindari error `ENOTDIR` saat dibundel ASAR).
- **Cloud Backend**:
  - Live Domain: `https://www.luluax-service.duckdns.org` (Hono Serverless + Drizzle ORM + Neon PostgreSQL).

---

## 2. Fitur-Fitur Khas Termius & Cara Kerjanya

### A. Dual-Pane SFTP Manager
- **Panel Kiri (Lokal)**: Menjelajahi filesystem komputer pengguna.
  - Endpoint: `GET /api/local/drives` (mendeteksi drive Windows `C:\`, `E:\` atau root `/` di macOS).
  - Endpoint: `POST /api/local/list` (membaca entri direktori lokal).
- **Panel Kanan (Remote SSH)**: Menjelajahi direktori server jarak jauh via SFTP.
  - Endpoint: `POST /api/sftp/connect`, `POST /api/sftp/list`.
- **Kontrol Transfer Tengah**:
  - `Upload ->`: `POST /api/sftp/transfer-local-to-remote` (stream file lokal ke write-stream remote).
  - `<- Download`: `POST /api/sftp/transfer-remote-to-local` (stream file remote ke write-stream lokal).

### B. Port Forwarding / SSH Tunnels
- Endpoint: `GET /api/tunnels`, `POST /api/tunnels`, `POST /api/tunnels/:id/toggle`, `DELETE /api/tunnels/:id`.
- Tipe tunnel:
  - `local`: Local Port Forwarding (`localPort` -> SSH Gateway -> `remoteHost:remotePort`).
  - `remote`: Remote Port Forwarding (`remotePort` -> SSH Gateway -> Local service).
  - `socks5`: Dynamic SOCKS5 Proxy.
- Tampilan kartu visual dengan sakelar toggle (ON/OFF).

### C. SSH Key Vault
- Endpoint: `GET /api/keys`, `POST /api/keys`, `DELETE /api/keys/:id`.
- Generator Kunci Kriptografi: `POST /api/keys/generate` (menggunakan Node.js `crypto.generateKeyPairSync` untuk menghasilkan keypair **Ed25519** atau **RSA 2048/4096-bit** dalam format PEM).
- Tombol 1-klik *Salin Public Key* untuk mempermudah pemasangan di `~/.ssh/authorized_keys` server.

### D. Autentikasi Pengguna & Guard Screen
- Sebelum aplikasi dapat digunakan, layar terkunci oleh `#auth-overlay` yang mewajibkan login/register ke backend cloud (`https://www.luluax-service.duckdns.org`).
- Akun bawaan (Seeded di Neon Postgres):
  - **Developer**: `robyfull.dev@gmail.com` | `Password@123`
  - **Admin**: `admin@luluax.com` | `Password@123`
- Token disimpan di `localStorage.getItem('luluax_auth_token')`.

---

## 3. Struktur Direktori Proyek

```
luluax-term/
├── .env                       # PORT=3980, CLOUD_API_URL, CLOUD_SYNC_KEY
├── .env.example               # Template environment
├── .gitignore                 # Mengabaikan node_modules, dist, temp_uploads, .env
├── server.js                  # Express backend, WebSocket stream, ConPTY, SFTP, Keys, Tunnels
├── electron-main.js           # Electron wrapper native desktop window
├── package.json               # Dependensi & skrip runner
├── dev-mac.sh                 # [macOS] Development launcher
├── build-mac.sh               # [macOS] Installer builder (.dmg / .app)
├── dev-win.bat                # [Windows] Development launcher
├── build-win.bat              # [Windows] Executable builder (.exe)
├── data/                      # File template/seed awal (hosts, snippets, settings)
├── public/                    # Frontend SPA
│   ├── index.html             # Antarmuka Termius
│   ├── style.css              # Tema gelap, Dual-Pane SFTP, Tunnels, Key Vault
│   ├── app.js                 # Controller logika xterm, SFTP, Tunnels, Keys, Auth
│   └── vendor/                # xterm.js, addon-fit, addon-web-links
└── dist/                      # Folder output build executable (.exe / .dmg)
```

---

## 4. Perintah Operasional

### A. Di macOS (Apple Silicon M1/M2/M3/M4 & Intel):
```bash
# Jalankan mode development
chmod +x dev-mac.sh
./dev-mac.sh
# Atau: npm run dev:mac

# Build installer native (.dmg & .app)
chmod +x build-mac.sh
./build-mac.sh              # Default: arm64
./build-mac.sh --x64        # Untuk Intel
# Atau: npm run build:mac
```

### B. Di Windows:
```cmd
:: Jalankan mode development
dev-win.bat
:: Atau: npm run dev:win

:: Build executable Windows (.exe portable & win-unpacked)
build-win.bat
:: Atau: npm run build:win
```

---

## 5. Aturan Penting Saat Mengedit Kode (Troubleshooting & Invariants)

1. **JANGAN PERNAH MENULIS KE `__dirname` DI DALAM ASAR (Mencegah `ENOTDIR`)**:
   Saat dibundel Electron `.exe`, `__dirname` berada di dalam file arsip `app.asar` yang bersifat *read-only*. Gunakan selalu fungsi `getWritableDataDir('LuluaX-Term', ...)` yang mengarahkan penulisan data ke `%APPDATA%\LuluaX-Term` di Windows atau `~/Library/Application Support/LuluaX-Term` di macOS.
2. **Buffer Upload Sementara**:
   Gunakan `path.join(os.tmpdir(), 'luluax-term-uploads')` untuk folder sementara `multer`, bukan folder lokal proyek.
3. **Modul Native & Rebuild**:
   `node-pty` telah memiliki prebuilt binaries (`prebuilds/win32-x64/`, `prebuilds/darwin-arm64/`). Jangan jalankan `@electron/rebuild` dari C++ source secara paksa karena path dengan spasi dapat menggagalkan `node-gyp`. Konfigurasi `npmRebuild: false` di `electron-builder` harus dipertahankan.
4. **Line Endings Script Unix**:
   Seluruh file `.sh` (`dev-mac.sh`, `build-mac.sh`, `run-macos.sh`) wajib menggunakan line-ending **`LF`** (bukan `CRLF`).
