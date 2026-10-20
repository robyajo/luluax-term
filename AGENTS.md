# Panduan & Konvensi AI Agent — LuluaX-Term

> **PERINGATAN WAJIB DIPATUHI (MANDATORY POLICY)**:  
> Seluruh AI Agent yang bekerja pada repositori ini **WAJIB MEMATUHI** seluruh aturan arsitektur, standar teknis, dan prosedur kerja yang tertera pada berkas ini serta direktori [`.agents/skills/`](file:///.agents/skills/). Pelanggaran terhadap invarian teknis (seperti penulisan berkas di dalam bundle ASAR, pemaksaan rebuild modul C++ native, pembocoran istilah teknis internal pada rilis publik, atau pelanggaran port) dapat merusak kestabilan aplikasi.

---

## 1. Kepatuhan Skill Wajib (.agents/skills/)

Aplikasi ini memiliki 2 skill inti yang **wajib dipatuhi**:

1. **`luluax-term`** ([`.agents/skills/luluax-term/SKILL.md`](file:///.agents/skills/luluax-term/SKILL.md)): Panduan master arsitektur Terminal & SSH Client, Mesin PTY (Windows ConPTY & macOS `/bin/zsh`), Dual-Pane SFTP Manager (khas Termius), Port Forwarding/SSH Tunnels, SSH Key Vault (Ed25519 & RSA), dan integrasi Cloud Sync.
2. **`activity-sync`** ([`.agents/skills/activity-sync/SKILL.md`](file:///.agents/skills/activity-sync/SKILL.md)): Standar pencatatan rilis dwibahasa publik dan sinkronisasi kegiatan ke portfolio API.

---

## 2. Aturan Teknis & Invarian Kritis (Wajib Dipatuhi)

Setiap modifikasi kode pada `LuluaX-Term` harus mematuhi invarian berikut:

### A. Lokasi Penyimpanan Data Writable (Mencegah Crash `ENOTDIR` di ASAR)
- Saat aplikasi dibundel sebagai executable desktop Electron (`.exe` di Windows atau `.app` di macOS), `__dirname` berada di dalam file arsip `app.asar` yang bersifat **read-only**.
- **DILARANG KERAS** memanggil operasi tulis file (`fs.writeFileSync`, `fs.mkdirSync`, dll.) langsung ke path berbasis `__dirname` tanpa abstraksi.
- **WAJIB** menggunakan fungsi pembantu `getWritableDataDir('LuluaX-Term', ...)` yang telah disediakan di `server.js`. Fungsi ini mengarahkan penyimpanan data ke direktori pengguna yang aman:
  - **Windows**: `%APPDATA%\LuluaX-Term`
  - **macOS**: `~/Library/Application Support/LuluaX-Term`
  - **Linux / Fallback**: `~/.luluax-term`

### B. Penanganan Buffer Upload Sementara (SFTP & File Transfer)
- **DILARANG** membuat folder buffer sementara di dalam direktori proyek lokal.
- Gunakan direktori temporer sistem operasi:
  ```js
  const uploadDir = path.join(os.tmpdir(), 'luluax-term-uploads');
  ```
  untuk konfigurasi `multer` pada alur transfer berkas SFTP.

### C. Modul Native & Konfigurasi Build (`node-pty`)
- Modul `node-pty` menggunakan prebuilt binaries yang sudah tersedia untuk Windows (`prebuilds/win32-x64/`) dan macOS Apple Silicon (`prebuilds/darwin-arm64/`).
- **DILARANG** menjalankan `@electron/rebuild` secara paksa dari C++ source karena path direktori dengan spasi dapat menggagalkan kompilasi `node-gyp`.
- Konfigurasi `"npmRebuild": false` pada blok `build` di `package.json` **WAJIB DIPERTAHANKAN**. Pastikan `asarUnpack: ["**/node-pty/**"]` selalu aktif agar file biner native dapat diakses oleh OS.

### D. Isolasi Port Jaringan (Port Conflict Prevention)
- Port bawaan aplikasi ini adalah **`3980`** (`PORT=3980`). WebSocket server terintegrasi pada instance HTTP server yang sama.
- **JANGAN PERNAH** mengubah atau menggunakan port **`3990`** (dialokasikan khusus untuk `LuluaX-Request`) atau **`4000`** (dialokasikan untuk backend Hono lokal). Ketiga aplikasi dalam LuluaX Suite harus dapat berjalan bersamaan di satu komputer tanpa benturan port.

### E. Fitur Inti Terminal & Keamanan (Khas Termius)
1. **Mesin Terminal**: Menggunakan `@xterm/xterm` (v6.0) dengan addons `@xterm/addon-fit` dan `@xterm/addon-web-links`.
2. **Dual-Pane SFTP Manager**:
   - Panel Kiri (Lokal): Menjelajahi filesystem pengguna (`GET /api/local/drives`, `POST /api/local/list`).
   - Panel Kanan (Remote SSH): Menjelajahi remote server via SSH2 SFTP (`POST /api/sftp/connect`, `POST /api/sftp/list`).
   - Transfer: Menggunakan stream pipe (`/api/sftp/transfer-local-to-remote` dan `/api/sftp/transfer-remote-to-local`).
3. **Port Forwarding / SSH Tunnels**: Mendukung tipe `local`, `remote`, dan `socks5` proxy dinamis dengan sakelar toggle visual.
4. **SSH Key Vault**: Generator kunci kriptografis instan untuk keypair **Ed25519** dan **RSA 2048/4096-bit** format PEM via `crypto.generateKeyPairSync`, dilengkapi fitur 1-klik salin public key.

### F. Line Endings Skrip Runner
- Seluruh file shell script (`run-macos.sh`, `dev-mac.sh`, `build-mac.sh`) **WAJIB** menggunakan line-ending **`LF`** (bukan `CRLF`).

### G. Integrasi Cloud Sync & Keamanan Kunci
- Sinkronisasi cloud terhubung ke `https://www.luluax-service.duckdns.org` (Hono + Drizzle ORM + Neon PostgreSQL).
- Gunakan endpoint modular backend: `/api/term` untuk host, snippet, pengaturan, kunci, dan tunnel; serta `/api/sync` untuk full snapshot.
- Kredensial dan token sesi disimpan di `localStorage` frontend (`luluax_auth_token`).
- **DILARANG KERAS** melakukan commit file kredensial lokal seperti `.env`, `.env.local`, atau `.ACTIVITY_PROJECT_KEYS` ke repositori Git.

---

## 3. Protokol Activity Sync & Catatan Rilis (Changelog)

Setiap selesai mengerjakan perubahan yang **dirasakan pengguna** (fitur baru, perbaikan bug, perubahan antarmuka, rilis versi, atau perubahan perilaku aplikasi), AI Agent **WAJIB** mencatat rilis dan menyinkronkannya ke portfolio sebelum menyelesaikan tugas.

### A. Alur Kerja Wajib:
1. **Tulis / Perbarui Berkas Rilis Harian**:
   - Lokasi: `releases/YYYY-MM-DD-nama-singkat.json` (maksimal 1 berkas per hari kerja, lakukan konsolidasi jika ada beberapa perubahan di hari yang sama).
   - Format: Wajib dwibahasa (`id` dan `en`), format terstruktur dengan `date`, `type`, `project: {"name": "Luluak Term"}`, `title: {id, en}`, `body: {id, en}`, dan array `items: [{type, id, en}]`.
2. **Aturan Bahasa (Citizen-Facing & Bebas Bocoran Teknis)**:
   - Bahasa wajib bernada pelayanan publik yang ramah, profesional, dan berfokus pada manfaat nyata bagi pengguna.
   - **DILARANG KERAS** menyebutkan nama library, nama paket npm, nama middleware, nama framework internal, nama database, atau nama file kode sumber.
3. **Kirim Kegiatan ke API Portfolio**:
   - Endpoint: `POST https://ajoroby.is-a.dev/api/activities`
   - Header: `Content-Type: application/json`, `X-project: <KEY>` (dibaca dari `.ACTIVITY_PROJECT_KEYS` di `.agents/skills/activity-sync/`).
   - Body: Kirim isi berkas rilis JSON apa adanya.
4. **Verifikasi**:
   - Periksa melalui `GET https://ajoroby.is-a.dev/api/activities?slug=luluak-term&limit=3` untuk memastikan entri tercatat dengan benar dan tidak terjadi duplikasi.
5. **Laporan ke Pengguna**:
   - Laporkan ID kegiatan yang dihasilkan, status verifikasi, dan tautan file rilis yang dibuat.
