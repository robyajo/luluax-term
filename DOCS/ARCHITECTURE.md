# Arsitektur Teknis LuluaX-Term

Dokumen ini menjelaskan rancangan arsitektur internal aplikasi **LuluaX-Term**, alur komunikasi data, manajemen proses terminal lokal dan remote SSH, serta penanganan lingkungan runtime Electron ASAR.

---

## 1. Diagram Alur Sistem

```
+-------------------------------------------------------------+
|                      Jendela Aplikasi                       |
|           (Electron BrowserWindow / Chrome App Mode)        |
|                                                             |
|   +-----------------------------------------------------+   |
|   |         Antarmuka SPA (Vanilla JS + xterm v6)       |   |
|   |   • Hosts Grid          • Dual-Pane SFTP Manager    |   |
|   |   • Multi-Tab Terminal  • Visual Port Forwarding    |   |
|   |   • SSH Key Vault       • Command Snippets          |   |
|   +--------------------------┬--------------------------+   |
|                              │                              |
+------------------------------┼------------------------------+
                               │ (WebSocket ws://127.0.0.1:3980
                               │  + REST API http://127.0.0.1:3980)
                               ▼
+-------------------------------------------------------------+
|               Local Companion Server (server.js)            |
|                                                             |
|   +-----------------------+     +-----------------------+   |
|   | Windows ConPTY Engine |     |   Pure JS SSH2 Client |   |
|   | (node-pty / conpty)   |     |    (libssh2 rewrite)  |   |
|   | powershell / cmd/ wsl |     | Remote Shell & SFTP   |   |
|   +-----------------------+     +-----------------------+   |
|               │                             │               |
|               ▼                             ▼               |
|       Local Windows Shell             Remote Linux Server   |
+-------------------------------------------------------------+
```

---

## 2. Alur Streaming Terminal (WebSocket)

1. Frontend memuat mesin `@xterm/xterm` (v6.0) dan addon `@xterm/addon-fit`.
2. Saat tab terminal dibuka, koneksi WebSocket (`ws://127.0.0.1:3980`) dibuat secara instan.
3. Pesan JSON `init` dikirimkan beserta ukuran kolom dan baris (`cols`, `rows`) serta ID host yang dipilih:
   - **Local Shell**: Server lokal memanggil `node-pty.spawn()` dengan ConPTY (Windows) atau POSIX PTY (macOS `/bin/zsh`).
   - **SSH Remote**: Server menginisialisasi `ssh2.Client`, menyelesaikan pertukaran kunci kriptografi, lalu memanggil `conn.shell()` dengan alokasi pseudo-terminal.
4. Input keystroke dikirimkan melalui event `onData` WebSocket, dan output terminal dipancarkan kembali ke xterm secara streaming tanpa buffering polling.
5. Saat ukuran jendela terminal diubah, event resize diteruskan ke server untuk menyesuaikan ukuran PTY (`ptyProcess.resize` atau `stream.setWindow`).

---

## 3. Pencegahan Fatal Error `ENOTDIR` di Paket ASAR

Saat aplikasi dikompilasi ke executable `.exe` Windows atau `.app` macOS, seluruh kode dipaketkan ke dalam arsip virtual `app.asar`.
- `app.asar` adalah file tunggal (*read-only virtual container*).
- Menjalankan `fs.mkdirSync` atau `fs.writeFileSync` ke path `__dirname/data` di dalam ASAR akan melempar error fatal `ENOTDIR: not a directory`.
- **Solusi LuluaX-Term**:
  Menggunakan fungsi `getWritableDataDir('LuluaX-Term', defaultDataPath)`:
  - Mengalihkan penyimpanan data runtime dinamis (`hosts.json`, `snippets.json`, `settings.json`, `tunnels.json`, `keys.json`) ke:
    - **Windows**: `%APPDATA%\LuluaX-Term` (`C:\Users\<user>\AppData\Roaming\LuluaX-Term`)
    - **macOS**: `~/Library/Application Support/LuluaX-Term`
  - Mengalihkan buffer upload sementara `multer` ke `os.tmpdir()` (`AppData\Local\Temp\luluax-term-uploads`).
  - Menyalin file template awal dari paket read-only ke folder AppData pada saat peluncuran pertama kali.

---

## 4. Keamanan Kredensial & Autentikasi

- **Auth Guard Screen**: Saat aplikasi dibuka, `#auth-overlay` memverifikasi token sesi pengguna ke domain backend production (`https://www.luluax-service.duckdns.org/api/auth/me`). Jika tidak ada internet atau token tidak valid, interaksi ke terminal dikunci sampai pengguna berhasil login/register.
- **Kredensial SSH**: Password dan Private Key disimpan secara aman di direktori lokal pengguna atau disinkronkan ke tabel `term_hosts` di cluster Neon PostgreSQL dengan autentikasi Bearer token.
