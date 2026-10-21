# Changelog — LuluaX-Term

Semua perubahan penting pada proyek **LuluaX-Term** didokumentasikan di berkas ini.
Format ini berbasis pada [Keep a Changelog](https://keepachangelog.com/id/1.1.0/),
dan proyek ini mematuhi [Semantic Versioning](https://semver.org/lang/id/).

## [1.0.4] - 2026-10-22

### Added
- **Termius Desktop UI & Layout Redesign**: Perombakan total antarmuka menyerupai Termius Desktop SSH client dengan tema midnight dark navy (`#0a0d18`, `#0e1220`, `#161c30`).
- **Top Header Bar**: Menu hamburger `≡` untuk toggle sidebar, profil cloud Vaults, tab bar dinamis sesi terminal aktif & shortcut SFTP, dan Omni-Search bar dengan tombol aksi *Connect* instan.
- **Left Navigation Sidebar**: Ikon navigasi presisi (server ganda bertingkat untuk Hosts, kunci diagonal untuk Keychain, rute panah untuk Port Forwarding, kurung kurawal `{ }` untuk Snippets, target fingerprint untuk Known Hosts, jam audit untuk Logs, dan Settings di bagian bawah).
- **Distro OS Vector Badges**: Penampil badge logo distro OS vektor (Ubuntu, Debian, Windows, Linux) pada setiap kartu host di grid.
- **Right Inspector Panel (Host Details)**: Panel inspeksi detail host di sisi kanan dengan *two-way binding* dan *debounced auto-save* (400ms) ke backend tanpa perlu tombol simpan manual.
- **Active Glowing Selection Outline**: Kartu host yang dipilih memiliki highlight border biru bersinar (*glowing blue outline*).

### Security
- **Data Sanitization**: Membersihkan seluruh data host, hostname, dan kredensial privat/rahasia dari template seed bawaan (`data/hosts.json` dan `data/folders.json`) sebelum dipublikasikan, hanya menyisakan cangkang terminal lokal aman (PowerShell, Command Prompt, Git Bash, WSL).

## [1.0.3] - 2026-10-22

### Added
- **Folder Grouping & Interactive Drag-and-Drop**: Pengguna dapat membuat, mengubah nama, memilih ikon/warna folder, dan menyeret (*drag-and-drop*) kartu host langsung ke dalam folder atau mengeluarkannya ke daftar utama (root).
- **Per-Account Scoped Registry (`registry-<accountId>.json`)**: Seluruh data pengguna (folder, host, tunnel, keys, snippets, settings) disimpan dalam snapshot registry per akun yang terisolasi di disk lokal.
- **Multi-Device Cloud Parity**: Sinkronisasi database cloud otomatis (Neon PostgreSQL) memastikan saat pengguna login di perangkat baru, seluruh struktur folder dan tata letak host tampil identik.
- **Top-Right Animated Update Badge**: Lencana pembaruan beranimasi di pojok kanan atas (`🚀 Update Tersedia`, `⬇ Mengunduh`, `🎉 Restart & Pasang`) saat rilis baru tersedia di GitHub Releases.
- **Installed Version Display**: Penampil nomor versi terpasang dinamis di bilah atas (`● v1.0.3`), sidebar header, sidebar footer, dan menu Settings.
- **Real TCP/SOCKS5 Socket Forwarder**: Penerusan port aktif (Local, Remote, Dynamic SOCKS5 RFC 1928) dengan status runtime aktual (`● Listening :port`, `⚠️ Error`) dan fitur auto-boot tunnel.
- **SSH ProxyJump / Bastion Gateway Chaining**: Dukungan koneksi melompat ke server privat melalui bastion host dengan socket tunneling bawaan.
- **In-App Remote Code Editor pada SFTP**: Membuka dan mengedit file remote langsung dari aplikasi dengan shortcut simpan cepat `Ctrl+S` / `Cmd+S`.
- **Multi-Terminal Broadcast Input**: Pengetikan serentak ke seluruh tab terminal aktif.
- **Import ~/.ssh/config 1-Click**: Impor otomatis konfigurasi OpenSSH ke database lokal beserta relasi ProxyJump dan private key.
- **Interactive Snippet Variable Placeholders (`{{variable}}`)**: Dialog modal pengisian parameter template sebelum dieksekusi ke shell.

## [1.0.2] - 2026-10-21

### Added
- Integrasi auto-updater otomatis ke GitHub Releases.
- Pemasangan pembaruan in-place tanpa perlu uninstall manual.

### Fixed
- Penanganan socket binding pada server lokal sebelum jendela Electron dimuat.

## [1.0.0] - 2026-10-20

### Added
- Rilis perdana LuluaX-Term: Terminal multi-tab, SSH Client (`ssh2`), Dual-Pane SFTP Manager, Cryptographic SSH Key Vault, Port Forwarding Manager, dan sinkronisasi cloud dasar.
