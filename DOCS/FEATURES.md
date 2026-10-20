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
- `POST /api/sftp/connect` — Inisialisasi handshake sesi SFTP ke host SSH
- `POST /api/sftp/list` — Eksplorasi direktori remote server
- `POST /api/sftp/transfer-local-to-remote` — Transfer stream file lokal ke remote
- `POST /api/sftp/transfer-remote-to-local` — Transfer stream file remote ke lokal

---

## 2. Port Forwarding / SSH Tunnels

Memungkinkan pengalihan port aman melalui gateway SSH tanpa perlu mengetikkan parameter command-line `ssh -L` atau `ssh -R` yang rumit:

### A. Tipe Tunnel yang Didukung:
1. **Local Forwarding**: Meneruskan port komputer lokal (`localPort`, misal `:8080`) melalui koneksi SSH ke port internal server remote (`remoteHost:remotePort`, misal `127.0.0.1:80` atau database internal `:5432`).
2. **Remote Forwarding**: Meneruskan port remote server ke service yang berjalan di komputer lokal pengembang.
3. **Dynamic SOCKS5 Proxy**: Membuat proxy terenkripsi dinamis di komputer lokal.

### B. Tampilan Antarmuka:
- Kartu visual yang menampilkan rute aliran data: `:localPort ➔ TYPE ➔ remoteHost:remotePort`.
- Sakelar toggle switch (ON/OFF) interaktif dengan indikator status hijau (*Active Pulse*).
- Modal pembuatan tunnel baru dengan pemilihan host SSH gateway.

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

- Multi-Tab simultan: membuka beberapa sesi shell lokal (PowerShell, CMD, WSL, Git Bash) dan sesi remote SSH bersamaan.
- Action Bar: Tombol *New Shell*, *Reconnect*, *Clear Screen*, dan *Close Tab*.
- Quick Command Bar: Menampilkan cuplikan perintah (*snippets*) di bagian bawah terminal untuk dieksekusi ke sesi aktif hanya dalam 1 klik.
