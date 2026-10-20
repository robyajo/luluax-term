# LuluaX-Term (Cross-Platform SSH & Terminal Client with Cloud Sync)

Aplikasi terminal dan SSH client modern, cepat, dan ringan yang terinspirasi dari **Termius**, direkayasa balik menggunakan **REA MCP Server** (`rea-agents`), dan dilengkapi sistem **Cloud Sync terintegrasi** yang siap di-hosting di **Vercel** untuk sinkronisasi otomatis antar-perangkat (**Windows & macOS Apple Silicon**).

---

## ⚡ Ringkasan Proyek

| Komponen | Spesifikasi & Teknologi |
| :--- | :--- |
| **Nama Aplikasi** | **LuluaX-Term** (`v1.0.0`) |
| **Sistem Operasi** | **Windows 10/11** (x64/ARM64) & **macOS Apple Silicon** (M1/M2/M3/M4 Series / arm64) |
| **Engine Terminal** | Mesin xterm.js v6.0 dengan FitAddon & WebLinksAddon |
| **Local PTY** | Windows ConPTY (`powershell.exe`, `cmd.exe`, `bash.exe`, `wsl.exe`) & macOS Native PTY (`/bin/zsh`, `/bin/bash`, `fish`) |
| **SSH & SFTP** | Pure JS SSH2 Client & SFTP File Transfer Engine |
| **Cloud Sync Backend** | Serverless API di folder `cloud-api/` (Siap 1-klik deploy ke **Vercel**) |

---

## ☁️ Cloud Sync API (Hosting di Vercel)

Proyek cloud backend berada di subfolder `cloud-api/` dan dibuat khusus untuk arsitektur serverless Vercel:

### 1. Cara Deploy ke Vercel (Gratis)
```bash
# 1. Masuk ke folder cloud-api
cd cloud-api

# 2. Deploy dengan Vercel CLI
npx vercel

# 3. Deploy ke production
npx vercel --prod
```
Atau hubungkan folder `cloud-api` ke repository GitHub Anda, lalu import melalui Dashboard [vercel.com](https://vercel.com). Anda akan mendapatkan URL seperti:
👉 `https://luluax-term-sync.vercel.app`

### 2. Penyimpanan Permanen (Vercel KV / Upstash)
- Di dashboard project Vercel Anda, buka tab **Storage** -> Hubungkan **KV** (gratis).
- Variabel lingkungan `KV_REST_API_URL` dan `KV_REST_API_TOKEN` otomatis terhubung.

### 3. Mengaktifkan Sinkronisasi di LuluaX-Term
1. Buka aplikasi **LuluaX-Term** di komputer mana saja (Windows atau Mac).
2. Buka menu **Settings** -> bagian **Cloud Sync (Vercel Backend)**.
3. Masukkan:
   - **Vercel Cloud API URL**: URL deployment Vercel Anda (misal `https://luluax-term-sync.vercel.app`).
   - **Sync Key / Secret Token**: Kunci rahasia Anda (contoh: `kunci-rahasia-saya-2026`).
4. Klik **Push to Cloud** dari perangkat utama Anda.
5. Pada perangkat lain (misal di MacBook Apple Silicon), masukkan URL dan Sync Key yang sama, lalu klik **Pull from Cloud**. Seluruh daftar host SSH, kredensial, snippet, dan preferensi tema akan langsung tersinkronisasi!

---

## 🍏 Versi macOS Apple Silicon (Chip M1/M2/M3/M4)

LuluaX-Term mendukung penuh arsitektur macOS Apple Silicon (`darwin-arm64`):

### 1. Menjalankan Langsung via Script Launcher
```bash
chmod +x run-macos.sh
./run-macos.sh
```
Script ini akan:
- Mendeteksi arsitektur Apple Silicon (`arm64`).
- Mengaktifkan shell bawaan macOS `/bin/zsh`.
- Membuka jendela aplikasi desktop mandiri (Chrome/Edge/Brave `--app` mode atau Safari).

### 2. Menjalankan lewat npm
```bash
npm run app:mac
# atau
npm start
```

### 3. Build Menjadi Aplikasi Native macOS (.app / .dmg)
Tersedia wrapper Electron dan skrip packaging untuk macOS Apple Silicon:
```bash
npm run build:mac-arm64
```

---

## 🪟 Versi Windows

### Cara Menjalankan:
Cukup klik ganda file **`run.bat`** di Windows Explorer, atau jalankan:
```cmd
run.bat
```
Server backend lokal akan aktif dan membuka antarmuka LuluaX-Term dalam jendela desktop mandiri.

---

## 🔍 Hasil Reverse Engineering Termius (via REA MCP Server)

Dengan bantuan MCP server `rea` (`rea-agents v6.7.0`), dilakukan inspeksi terhadap instalasi Termius lokal di `C:\Users\robyk\AppData\Local\Programs\Termius`:
- **Fuses Target**: `inspect_electron_fuses` menunjukkan `RunAsNode: enabled`, `EmbeddedAsarIntegrityValidation: enabled`.
- **Modul Native Asli**: `@termius/libtermius` (`libssh2.dll`), `@termius/node-pty` (`winpty-agent.exe`), `@termius/keytar`.
- **Implementasi LuluaX-Term**: Memodernisasi komponen tersebut menggunakan implementasi pure JavaScript SSH2, universal ConPTY/Apple Silicon PTY, dan arsitektur REST + WebSocket yang portabel antar-sistem operasi dan siap sinkronisasi cloud Vercel.

---

## 📁 Struktur Direktori

```
E:/PROJECT ROBY/REA/
├── package.json              # Konfigurasi LuluaX-Term (cross-platform)
├── server.js                 # Backend Server: Express, WebSocket, SSH2, ConPTY/macOS PTY, Cloud Proxy
├── run.bat                   # Launcher desktop Windows (satu klik jalan)
├── run-macos.sh              # Launcher desktop macOS Apple Silicon & Intel
├── electron-main.js          # Native Electron wrapper untuk macOS/Windows
├── cloud-api/                # [PROJECT VERCEL] Cloud Sync API Backend
│   ├── package.json
│   ├── vercel.json           # Konfigurasi serverless function Vercel
│   ├── README.md             # Panduan deploy Vercel
│   └── api/
│       └── index.js          # Serverless sync endpoints (push, pull, merge)
├── data/
│   ├── hosts.json            # Database lokal host tersimpan (SSH & Local Shells)
│   ├── snippets.json         # Database perintah snippet
│   └── settings.json         # Preferensi tema, font, dan cloud sync
├── public/
│   ├── index.html            # UI LuluaX-Term modern
│   ├── style.css             # Tema gelap Termius Dark, Dracula, Cyberpunk, One Dark, Nord
│   ├── app.js                # Frontend controller, xterm multi-tab, Cloud Sync UI, SFTP
│   └── vendor/               # xterm.js v6.0, fit addon, web-links addon
└── README.md
```
