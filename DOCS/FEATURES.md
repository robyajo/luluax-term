# Fitur Khas Termius pada LuluaX-Term

Dokumen ini memuat detail spesifikasi dan alur operasional fitur-fitur khas **Termius** yang telah diimplementasikan pada **LuluaX-Term**.

---

## 1. Dual-Pane SFTP Manager

Termius terkenal dengan antarmuka transfer file 2 panel yang memisahkan komputer lokal dan server remote secara berdampingan.

### A. Komponen Antarmuka:
- **Panel Kiri (Komputer Lokal)**:
  - Dropdown pemilihan drive Windows (`C:\`, `E:\`, dll.) atau root `/` di macOS.
  - Penunjuk path folder aktif dengan tombol navigasi folder induk (`▲`) dan muat ulang (`⟳`).
  - Tabel file lokal dengan indikator folder (`📁`), file (`📄`), ukuran byte terformat, dan waktu modifikasi.
- **Panel Kanan (Server SSH Remote)**:
  - Dropdown pemilihan host SSH yang tersimpan dengan tombol `Hubungkan Remote`.
  - Penunjuk path direktori remote (misal `/home/ubuntu`, `/var/www`).
  - Tombol buat folder remote baru (`+📁`).
  - Tabel file remote dengan izin akses (*permissions* octal) dan ukuran file.
- **Tombol Transfer Tengah**:
  - `Upload ->`: Menyalurkan (*stream*) file lokal yang dipilih di panel kiri langsung ke direktori remote aktif di panel kanan.
  - `<- Download`: Menyalurkan (*stream*) file remote yang dipilih di panel kanan langsung ke folder lokal aktif di panel kiri.
  - Indikator status transfer real-time.

### B. Endpoint API Terkait:
- `GET /api/local/drives` — Deteksi daftar drive lokal komputer
- `POST /api/local/list` — Eksplorasi isi direktori lokal
- `POST /api/sftp/connect` — Inisialisasi handshake sesi SFTP ke host SSH (mendukung ProxyJump & Key Vault)
- `POST /api/sftp/list` — Eksplorasi direktori remote server
- `POST /api/sftp/read-file` — Membaca isi file remote untuk editor internal
- `POST /api/sftp/write-file` — Menyimpan hasil edit kembali ke server remote
- `POST /api/sftp/transfer-local-to-remote` — Transfer stream file lokal ke remote
- `POST /api/sftp/transfer-remote-to-local` — Transfer stream file remote ke lokal
- `POST /api/sftp/disconnect` — Menutup sesi SFTP dan membersihkan jump connection

### C. In-App Remote Code/Text Editor:
- Klik nama file teks pada panel remote (atau tombol `Edit File`) untuk membuka modal editor kode internal.
- Dilengkapi shortcut `Ctrl+S` / `Cmd+S` untuk langsung menyimpan perubahan ke server remote secara instan tanpa perlu download dan upload manual.
---

## 2. Port Forwarding / SSH Tunnels

Memungkinkan pengalihan port aman melalui gateway SSH tanpa perlu mengetikkan parameter command-line `ssh -L` atau `ssh -R` yang rumit:

### A. Tipe Tunnel yang Didukung:
1. **Local Forwarding**: Meneruskan port komputer lokal (`localPort`, misal `:8080`) melalui koneksi SSH ke port internal server remote (`remoteHost:remotePort`, misal `127.0.0.1:80` atau database internal `:5432`).
2. **Remote Forwarding**: Meneruskan port remote server ke service yang berjalan di komputer lokal pengembang.
3. **Dynamic SOCKS5 Proxy**: Membuat proxy terenkripsi dinamis di komputer lokal.

### B. Runtime & Arsitektur Jaringan:
- **Real Socket Listener**: Backend menjalankan listener TCP nyata (`net.createServer`) dan SOCKS5 dynamic proxy (RFC 1928) yang tersambung langsung ke stream SSH `forwardOut`.
- **Status Runtime Real-Time**: Antarmuka menampilkan status aktual listener (`● Listening :8080 (Aktif)`, `⚠️ Error: Port in use`, atau `○ Nonaktif`) beserta pesan error diagnostik jika terjadi benturan port.
- **Auto-Boot Tunnels**: Tunnel yang berstatus aktif akan otomatis dijalankan saat aplikasi pertama kali menyala.
---

## 3. Cryptographic SSH Key Vault

Pengelola kunci kriptografi mandiri untuk menghubungkan server SSH tanpa password:

### A. Fitur Utama:
- **Pembuat Kunci Bawaan (1-Click Keygen)**:
  - Menghasilkan pasangan kunci (*keypair*) **Ed25519** (standar kriptografi modern tercepat dan teraman) atau **RSA 2048-bit** langsung dari Node.js `crypto`.
  - Kunci privat dan publik dienkode secara otomatis dalam format standar PEM (`PKCS#8` dan `SPKI`).
- **Tombol Salin Public Key**:
  - Menyalin kunci publik ke clipboard hanya dalam 1 klik untuk mempermudah pemasangan ke file `~/.ssh/authorized_keys` di server remote.
- **Impor Kunci Eksternal**:
  - Dukungan impor file kunci privat yang sudah ada (`.pem`, format OpenSSH).

---

## 4. Terminal Workspace Multi-Tab
- **Multi-Tab Simultan**: Membuka beberapa sesi shell lokal (PowerShell, CMD, WSL, Git Bash) dan sesi remote SSH bersamaan.
- **Multi-Terminal Broadcast Input**: Tombol `Broadcast ON/OFF` pada toolbar terminal. Ketika aktif, setiap karakter yang diketikkan di terminal aktif akan otomatis diduplikasi ke seluruh tab terminal yang sedang terbuka.
- **Session Logging**: Tombol `Save Log` untuk mengekspor seluruh riwayat buffer terminal aktif ke file `.log` lokal berstempel waktu.
- **Interactive Snippet Variable Templates**: Cuplikan perintah yang memuat placeholder template seperti `{{container_id}}` atau `{{branch_name}}` akan memicu modal input interaktif untuk mengisi nilai sebelum dieksekusi ke shell.
- **Startup Script / Automation**: Perintah otomatis yang langsung dieksekusi begitu koneksi SSH selesai diinisialisasi.
- **ProxyJump / Bastion Gateway Chaining**: Menghubungkan terminal dan SFTP ke server internal di belakang bastion host melalui chaining socket SSH bawaan.
- **Import ~/.ssh/config 1-Click**: Mengimpor seluruh host, port, user, private key, dan hierarki ProxyJump dari file konfigurasi OpenSSH lokal.
