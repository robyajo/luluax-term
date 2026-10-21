---
name: luluax-suite
description: "Master architecture and development knowledge base for the entire LuluaX Suite: LuluaX-Term (SSH & Terminal client), LuluaX-Request (API client & HTTP Interceptor), and LuluaX Backend (Hono + Drizzle ORM + Neon PostgreSQL on Vercel at https://www.luluax-service.duckdns.org). Gunakan skill ini setiap kali agen AI bekerja pada level root workspace atau melakukan koordinasi antar-aplikasi."
---

# LuluaX Suite — Master Architecture & Agent Guide

Ekosistem LuluaX terdiri dari 3 aplikasi modular:

1. **`luluax-term`** (Port 3980): Terminal & SSH Client (rekonstruksi fitur khas **Termius**).
2. **`luluax-request`** (Port 3990): API Client & HTTP Interceptor (rekonstruksi fitur khas **Requestly**).
3. **`backend`** (Port 4000 / Production Vercel): Cloud Backend modular (**Hono + Drizzle ORM + Neon PostgreSQL**).

---

## 1. Domain Production & Kredensial Database

- **Live Production URL**: `https://www.luluax-service.duckdns.org` (Vercel alias: `https://luluax-backend.vercel.app`).
- **Database**: Neon Serverless PostgreSQL (`db_luluax`, region `ap-southeast-1`).
  - Connection String: `postgresql://neondb_owner:npg_EWw0qGvQH4PN@ep-bold-meadow-ao2moct0-pooler.c-2.ap-southeast-1.aws.neon.tech/db_luluax?sslmode=require`
- **Seeded Akun Pengguna**:
  - Developer: `robyfull.dev@gmail.com` | `Password@123`
  - Admin: `admin@luluax.com` | `Password@123`

---

## 2. Peta Port & Servis Lokal

| Aplikasi | Port Bawaan | Deskripsi | Entrypoint |
|---|---|---|---|
| `luluax-term` | `3980` | Express + WebSocket ConPTY / macOS zsh PTY + Pure SSH2 + Dual SFTP | `server.js` |
| `luluax-request` | `3990` | Express + Universal CORS Proxy + Mock Server + HTTP Rules | `server.js` |
| `backend` | `4000` | Hono Serverless Backend + Drizzle ORM + Neon HTTP | `src/index.ts` |

*(Ketiga aplikasi dapat dijalankan secara bersamaan pada komputer yang sama tanpa konflik port)*.

---

## 3. Matriks Skrip Operasional

| Kebutuhan | `luluax-term/` | `luluax-request/` | `backend/` |
|---|---|---|---|
| **Dev macOS** | `./dev-mac.sh` | `./dev-mac.sh` | `./dev-mac.sh` |
| **Build macOS** | `./build-mac.sh` | `./build-mac.sh` | `./build-mac.sh` |
| **Dev Windows** | `dev-win.bat` | `dev-win.bat` | `dev-win.bat` |
| **Build Windows** | `build-win.bat` | `build-win.bat` | `build-win.bat` |
| **Deploy Vercel** | - | - | `npx vercel --prod` |

---

## 4. Lokasi File Binary Executable Windows (v1.0.3)

- `luluax-term/dist/LuluaX-Term Setup 1.0.3.exe` (NSIS Installer ~117 MB)
- `luluax-term/dist/LuluaX-Term 1.0.3.exe` (Portable Single-file EXE ~117 MB)
- `luluax-request/dist/LuluaX-Request Setup 1.0.3.exe` (NSIS Installer ~112 MB)
- `luluax-request/dist/LuluaX-Request 1.0.3.exe` (Portable Single-file EXE ~111 MB)
---

## 5. Invarian & Aturan Teknis Agen AI

1. **Aturan ENOTDIR**: Jangan pernah menulis data ke `__dirname` di dalam paket Electron ASAR. Gunakan `getWritableDataDir(appName, defaultDataPath)` yang mengarah ke `%APPDATA%` (Windows) atau `~/Library/Application Support` (macOS).
2. **Aturan Line-Endings**: Seluruh file `.sh` wajib disimpan dengan Unix `LF`.
3. **Aturan TypeScript Backend**: Patuhi aturan `ts-no-any` (gunakan domain interfaces / `unknown` / `Context`) dan `ts-no-tiny-functions`.
4. **Aturan CHANGELOG.md**: Setiap kali agen AI melakukan perubahan kode, perbaikan bug, atau penambahan fitur, AI WAJIB memperbarui berkas `CHANGELOG.md` di aplikasi masing-masing (`luluax-term/CHANGELOG.md`, `luluax-request/CHANGELOG.md`, atau `backend/CHANGELOG.md`) menggunakan format standar Keep a Changelog.
5. **Aturan Per-Account Registry**: Setiap entitas baru atau pengaturan baru wajib disimpan terisolasi di `registry-<accountId>.json` lokal dan disinkronkan ke tabel database Neon PostgreSQL backend agar multi-device parity terjamin.
6. **Aturan Wajib Activity-Sync**: Setiap kali menyelesaikan tugas atau perbaikan, agen AI wajib menjalankan sinkronisasi rilis dwibahasa ke API portfolio (`https://ajoroby.is-a.dev/api/activities`).
