# Panduan Development & Build LuluaX-Term

Dokumen ini memuat panduan lengkap alur kerja pengembangan (*development workflow*) dan proses pemaketan installer untuk platform **Windows** dan **macOS (Apple Silicon & Intel)** pada aplikasi **LuluaX-Term**.

---

## 1. Alur Kerja: Review Cepat vs Installer Resmi

| Kebutuhan | Perintah Windows | Perintah macOS | Hasil Output |
| :--- | :--- | :--- | :--- |
| **Review Cepat saat Dev** *(Langsung Buka Tanpa Install)* | **`dev-portable.bat`**<br>`npm run dev:portable` | **`./dev-mac.sh`**<br>`npm run build:mac-app` | Memaketkan versi portable dan **langsung membuka jendela aplikasi** di layar untuk review instan. |
| **Build Installer Resmi** *(Untuk Rilis & Pemasangan Sistem)* | **`build-installer.bat`**<br>`npm run build:installer` | **`./build-mac.sh`**<br>`npm run build:mac-dmg` | Menghasilkan installer setup resmi (**`.exe` dengan Setup Wizard & Desktop Shortcut** di Windows, dan **`.dmg`** di macOS). |

---

## 2. Menjalankan di Windows

### A. Review Cepat saat Development (Portable):
Jalankan file **`dev-portable.bat`** (bisa dobel-klik via File Explorer):
```cmd
cd luluax-term
dev-portable.bat
```
- Otomatis mematikan proses lama jika sedang berjalan.
- Mengompilasi versi portable ke `dist\LuluaX-Term 1.0.0.exe`.
- **Langsung meluncurkan aplikasi di layar** tanpa meminta instalasi.

### B. Membuat Installer Resmi untuk Rilis (NSIS Setup):
Jalankan file **`build-installer.bat`**:
```cmd
cd luluax-term
build-installer.bat
```
- Menghasilkan installer setup resmi:
  👉 **`dist\LuluaX-Term Setup 1.0.0.exe`** (~117 MB).
- Installer ini akan memasang aplikasi ke folder `%LOCALAPPDATA%\Programs\LuluaX-Term`, membuat Desktop shortcut, Start Menu shortcut, dan mendaftarkan uninstaller di Windows Settings.

---

## 3. Menjalankan di macOS (Apple Silicon M1/M2/M3/M4 & Intel)

### A. Mode Development di macOS:
```bash
cd luluax-term
chmod +x dev-mac.sh
./dev-mac.sh
```
- Mendeteksi arsitektur Apple Silicon (`arm64`) vs Intel (`x86_64`).
- Mengaktifkan shell bawaan macOS `/bin/zsh`.
- Membuka jendela desktop aplikasi mandiri.

### B. Build Installer Native macOS (.dmg & .app):
```bash
cd luluax-term
chmod +x build-mac.sh
./build-mac.sh              # Default: Apple Silicon (arm64)
./build-mac.sh --x64        # Opsi untuk Intel x86_64
./build-mac.sh --universal  # Opsi untuk installer Universal
```
- Menghasilkan file installer Apple Disk Image (**`.dmg`**). Pengguna cukup melakukan drag-and-drop ikon aplikasi ke folder `/Applications`.
