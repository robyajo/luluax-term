# Dokumentasi Resmi LuluaX-Term

Dokumentasi teknis internal aplikasi **LuluaX-Term** (Terminal & SSH Client multi-platform Windows & macOS Apple Silicon).

---

## 📚 Daftar Dokumen

| Dokumen | Isi Pembahasan |
| :--- | :--- |
| **[1. Arsitektur Teknis](ARCHITECTURE.md)** | Arsitektur Electron, Express + WebSocket streaming, Windows ConPTY vs macOS POSIX PTY, alur data, dan pencegahan error `ENOTDIR`. |
| **[2. Fitur-Fitur Khas Termius](FEATURES.md)** | Detail implementasi fitur khas Termius: Dual-Pane SFTP Manager, Port Forwarding / SSH Tunnels visual, Cryptographic SSH Key Vault (Ed25519 & RSA), dan Terminal Multi-Tab. |
| **[3. Panduan Development & Build](DEVELOPMENT-AND-BUILD.md)** | Alur kerja review development portable (`dev-portable.bat`), kompilasi installer resmi (`build-installer.bat` / NSIS / DMG), dan skrip macOS Apple Silicon (`dev-mac.sh` & `build-mac.sh`). |

---

## ⚡ Panduan Cepat

- **Review saat Development (Portable)**: Jalankan `dev-portable.bat` (Windows) atau `./dev-mac.sh` (macOS).
- **Rilis Installer Resmi**: Jalankan `build-installer.bat` (Windows Setup NSIS) atau `./build-mac.sh` (macOS DMG).
- **Konfigurasi Cloud**: Cek file `.env` untuk endpoint backend (`https://www.luluax-service.duckdns.org`).
