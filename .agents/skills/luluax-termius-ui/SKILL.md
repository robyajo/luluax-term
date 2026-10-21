---
name: luluax-termius-ui
description: >-
  Panduan lengkap arsitektur dan sistem desain antarmuka (UI) LuluaX-Term yang terinspirasi oleh Termius Desktop SSH client.
  Meliputi token warna midnight navy, DOM hierarchy, bilah header dengan omni-search & dynamic tabs, left navigation sidebar,
  groups/hosts grid dengan SVG distro badges, active glowing outline, right Host Details inspector panel dengan debounced auto-save,
  serta resep perawatan dan penambahan fitur bagi AI agent berikutnya.
metadata:
  version: "1.0.0"
  framework: "Vanilla JS SPA + Electron + Express"
  design_system: "Termius Desktop Dark Aesthetic"
  category: "ui-architecture"
  tags:
    - termius
    - ssh-client
    - ui-design-system
    - xterm
    - electron
    - dark-theme
---

# LuluaX-Term — Termius UI Architecture & Design System Playbook

Skill ini memuat dokumentasi arsitektur, spesifikasi desain, hierarki DOM, token visual CSS, aliran data reaktif, serta aturan baku untuk mempertahankan dan mengembangkan antarmuka **LuluaX-Term** agar selalu konsisten dengan standar estetika premium **Termius Desktop SSH Client**.

---

## 1. Kapan Menggunakan Skill Ini

Gunakan skill ini setiap kali:
1. Melakukan perubahan, penyesuaian gaya (*styling*), atau penambahan elemen pada frontend LuluaX-Term (`public/index.html`, `public/style.css`, `public/app.js`).
2. Menambah tab, menu sidebar, fitur inspector baru, atau opsi pada Host Details panel.
3. Menambah deteksi OS atau ikon distro Linux/Unix/Windows/macOS baru pada grid host.
4. Menghubungkan sesi terminal baru ke top header tabs bar.
5. Memastikan konsistensi palet warna, tipografi, dan micro-interaction agar tidak kembali ke desain generik atau dasar.

---

## 2. Palet Warna & Visual Design Tokens (CSS)

Antarmuka LuluaX-Term menggunakan palet warna bertingkat (*deep layered dark navy*) khas Termius:

| Token / Variabel | Nilai HEX / HSL | Penggunaan |
| :--- | :--- | :--- |
| `--bg-primary` | `#0a0d18` / `#0b0e1a` | Background utama aplikasi & viewport |
| `--bg-secondary` | `#0e1220` | Background sidebar kiri & top header |
| `--termius-card-bg` | `#161c30` | Kartu host dan grup server |
| `--termius-card-border` | `#232c4a` | Garis tepi (*border*) kartu standar |
| `--termius-card-hover` | `#1c243e` | Background kartu saat kursor di atasnya |
| `--accent-primary` | `#2979ff` / `#3b82f6` | Aksen biru Termius, tombol aksi utama (*Connect*) |
| `--accent-glow` | `rgba(41, 121, 255, 0.45)` | Efek bersinar (*glow outline*) pada kartu aktif |
| `--text-primary` | `#ffffff` / `#e2e8f0` | Teks judul utama & label aktif |
| `--text-secondary` | `#8c9cb6` / `#94a3b8` | Teks subtitle (`ssh, username`), ikon non-aktif |
| `--text-muted` | `#586885` | Placeholder input, watermark, info footer |
| `--os-ubuntu` | `#e95420` | Badge warna distribusi Ubuntu |
| `--os-debian` | `#00d2ff` / `#a81d33` | Badge warna distribusi Debian |
| `--os-windows` | `#00a4ef` | Badge warna OS Windows (PowerShell/CMD) |
| `--os-linux` | `#00e676` | Badge warna distro umum / WSL / Git Bash |

---

## 3. Anatomi Komponen & Hierarki Layout

Layout utama mengadopsi struktur 3-kolom responsif:

```
+-----------------------------------------------------------------------------------------+
| [≡] [Vaults ☁ ▾] [📁 SFTP ×] [>_ SUPER APP API ×] [+] | [🔍 Omni-Search Bar   Connect] | [v1.0.3] [🔔] [R+] [— □ ✕] |
+-----------------------------------------------------------------------------------------+
| [Hosts]         |  Toolbar: [+ New host ▾] [>_ Terminal] [Serial]          [⊞ ≡ ☑ 👤]   | HOST DETAILS PANEL      |
| [Keychain]      |-----------------------------------------------------------------------| Scope: [Personal ▾]     |
| [Port Fwd]      |  GROUPS                                                               | Address: [🐧 103.169.32.53]
| [{ } Snippets]  |  [📁 MPP SERVER (3 Hosts)]                                            | General:               |
| [Known Hosts]   |-----------------------------------------------------------------------|  Label: SUPER APP API   |
| [Logs]          |  HOSTS                                                                |  Parent Group: Personal |
|                 |  [🟠 layanan-bapenda] [🟠 SUPERAPP WEB] [🟠 Mituni VPS]               |  Tags: [              ] |
|                 |  [🔵 SUPER APP API*]  [🟠 VPS HOME ROBY] [🟠 roby.dev]                |  Backspace: [Default ▾] |
|                 |  (Active glowing blue outline)                                        | Port: SSH on [ 22 ] port|
|                 |                                                                       | Credentials:            |
|                 |                                                                       |  [2 hosts reuse...]     |
|                 |                                                                       |  👤 kominfo4            |
|                 |                                                                       |  🔒 •••••••••••• 👁     |
| [⚙ Settings]    |                                                                       | [   CONNECT (Blue)    ] |
+-----------------------------------------------------------------------------------------+
```

### A. Top Application Header (`.termius-top-header`)
- **Hamburger Toggle (`#btn-top-menu`)**: Memicu `.collapsed` pada sidebar kiri.
- **Vaults Profile (`#btn-top-vaults`)**: Menampilkan status profil cloud (*Personal*).
- **Header Tabs Bar (`#top-app-tabs`)**:
  - Shortcut tab bawaan `📁 SFTP` (`#tab-sftp-shortcut`).
  - Container dinamis sesi terminal (`#top-dynamic-terminal-tabs`): Tiap sesi SSH/Terminal yang dibuka langsung menciptakan tab dengan ikon prompt, judul host, dan tombol close `×`.
  - Tombol tambah tab cepat `+` (`#btn-top-add-tab`).
- **Omni-Search Bar (`.top-omni-bar-wrap`)**:
  - Input `#top-omni-search` dengan placeholder `"Find a host or ssh user@hostname..."`.
  - Tombol aksi inline `#btn-omni-connect` ("Connect"): Memungkinkan pengguna langsung mengetik `user@host` atau memilih host hasil pencarian lalu tekan Enter/Connect.
- **Header Right**:
  - Status pill versi terpasang (`.badge-installed-version`).
  - Notification bell (`#btn-top-notifications`).
  - User avatar profil (`#top-user-avatar`).
  - Window controls bawaan desktop (`—`, `□`, `✕`).

### B. Left Navigation Sidebar (`.termius-nav-sidebar`)
- Menggunakan lebar proporsional **170px** (atau **52px** saat *collapsed*).
- Ikon navigasi presisi:
  - **Hosts**: Ikon kartu server ganda (`<rect>` ganda + LED dots).
  - **Keychain**: Ikon kunci kriptografi diagonal (`🔑`).
  - **Port Forwarding**: Ikon panah belok dengan node port (`↪`).
  - **Snippets**: Ikon karakter kurung kurawal `{ }` monospaced.
  - **Known Hosts**: Ikon perisai keamanan berputar / target fingerprint.
  - **Logs**: Ikon jam audit runtime (`🕒`).
  - **Settings**: Ikon roda gigi di bagian paling bawah.

### C. Main Hosts Grid (`.hosts-split-view`)
- **Toolbar Atas**: Tombol utama `+ New host ▾` dengan dropdown menu (SSH Host, Telnet, Local Terminal), tombol `>_ Terminal`, `Serial`, serta tombol pengubah grid view di kanan.
- **Grup Server (`.groups-grid`)**: Kartu grup server seperti `MPP SERVER` (`3 Hosts`) dengan efek hover lembut.
- **Grid Host (`.hosts-grid`)**:
  - Kartu host menampilkan SVG badge OS asli:
    - Ubuntu: lingkaran oranye dengan lambang 3 sahabat.
    - Debian: swirl biru/merah khas Debian.
    - Windows: logo 4 kuadran Windows biru.
    - Linux / WSL: prompt shell hijau atau penguin.
  - Judul host (misal: `SUPER APP API`) dan subtitle (`ssh, kominfo4`).
  - **Active State (`.active`)**: Mendapat seleksi border biru menyala (`box-shadow: 0 0 0 2px var(--accent-primary), 0 0 16px var(--accent-glow)`).

### D. Right Inspector Panel (`.host-details-panel`)
- Terbuka otomatis saat kartu host diklik atau dipilih.
- Menyediakan inspeksi dan pengeditan langsung tanpa membuka modal terpisah:
  - **Scope Selector**: Dropdown `Personal ▾`.
  - **Address**: Ikon distro + input IP/Hostname (`103.169.32.53`).
  - **General**: Field label, dropdown parent group, tags, dan selector backspace behavior.
  - **Port**: Inline row `SSH on [ 22 ] port`.
  - **Credentials Box**:
    - Banner integrasi: *"2 hosts reuse credentials. Merge them for easy updates. Create an Identity"*.
    - Field username (`👤 kominfo4`).
    - Field password bertitik dengan toggle mata (`👁`).
    - Tombol identitas lanjutan: `+ SSH ID, Key, Certificate, FIDO2`.
  - **Full-Width Connect Button**: Tombol biru Termius `#2979ff` di dasar panel untuk langsung membuka sesi terminal.

---

## 4. Pola State Management & Two-Way Data Binding

1. **Seleksi Host Aktif (`app.selectHost(hostId)`)**:
   - Menghapus class `.active` dari seluruh kartu di grid.
   - Menambahkan class `.active` ke kartu yang dipilih.
   - Memanggil `app.populateHostDetails(host)` untuk mengisi seluruh field di panel inspector kanan.
   - Menampilkan `#host-details-panel` (`display: flex`).

2. **Debounced Auto-Save (`app.onDetailFieldChange(fieldName, value)`)**:
   - Setiap kali pengguna mengetik di field inspector (Address, Label, Username, Password, Port, Tags):
     - Model host lokal di memori (`host[fieldName] = value`) langsung diperbarui.
     - Kartu yang bersangkutan di DOM grid langsung di-*update* secara *live* (judul, subtitle, atau badge).
     - Timer debounce 400ms memicu `PUT /api/hosts/:id` ke backend secara transparan tanpa perlu tombol "Save" manual.

3. **Deteksi Distro Otomatis (`app.getOsTypeFromHost(host)`)**:
   - Jika `host.osType` terdefinisi, langsung gunakan nilai tersebut.
   - Jika kosong, fungsi melakukan inferensi cerdas berdasarkan label, hostname, atau tipe:
     - Jika memuat `"ubuntu"` -> `ubuntu`
     - Jika memuat `"debian"` -> `debian`
     - Jika memuat `"local"` atau `"powershell"` atau `"cmd"` -> `windows`
     - Jika memuat `"wsl"` atau `"linux"` -> `linux`
     - Default ke `ubuntu` untuk VPS modern.

4. **Dynamic Session Mirroring ke Top Header Tabs**:
   - Saat `app.connectHost(hostId)` dipanggil:
     - Dibuat sesi terminal `xterm.js` di area terminal.
     - Dibuat elemen `.app-tab` di `#top-dynamic-terminal-tabs`.
     - Klik pada tab di top header langsung memicu `app.switchView('terminals')` dan mengaktifkan sesi tersebut.
     - Menutup tab (`app.closeTab(tabId)`) membersihkan elemen terminal di DOM, memutus WebSocket, dan menghapus tab di top bar secara sinkron.

---

## 5. Resep Panduan bagi AI Agent Berikutnya (How-To Recipes)

### Resep 1: Menambah Ikon Distro OS Baru
1. Buka [`public/app.js`](file:///e:/PROJECT%20ROBY/REA/luluax-term/public/app.js).
2. Tambahkan case baru di method `getOsIconSvg(osType)`:
   ```javascript
   if (os === 'centos' || os === 'redhat') {
     return `<svg class="distro-badge" ...></svg>`;
   }
   ```
3. Tambahkan keyword pengecekan di `getOsTypeFromHost(host)`.

### Resep 2: Menambah Item Navigasi Sidebar Baru
1. Buka [`public/index.html`](file:///e:/PROJECT%20ROBY/REA/luluax-term/public/index.html) pada bagian `.termius-nav-menu`.
2. Tambahkan tombol menu dengan atribut `data-view="nama-view"`:
   ```html
   <button class="nav-item" data-view="my-feature">
     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">...</svg>
     <span>My Feature</span>
   </button>
   ```
3. Buat container tampilan di dalam `.termius-main-content`:
   ```html
   <section class="view-panel" id="view-my-feature">...</section>
   ```
4. Tambahkan handler di `app.switchView(viewName)` dalam [`public/app.js`](file:///e:/PROJECT%20ROBY/REA/luluax-term/public/app.js).

### Resep 3: Mempertahankan Desain Responsif & Collapsed Sidebar
- Selalu pastikan lebar sidebar menggunakan transisi halus (`transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1)`).
- Jangan memasukkan teks di luar tag `<span>` di dalam `.nav-item`, karena `.termius-nav-sidebar.collapsed .nav-item span` disetel `display: none` saat sidebar diciutkan.

---

## 6. Aturan Pantangan (Anti-Patterns)
- ❌ **DILARANG** mengembalikan desain ke gaya Bootstrap standar atau warna polos generik (merah/biru/hijau dasar). Selalu gunakan palet warna navy Termius yang telah ditetapkan.
- ❌ **DILARANG** menambahkan modal konfirmasi pop-up yang mengganggu untuk operasi pengeditan host standar; gunakan panel inspector Host Details di sebelah kanan dengan *auto-save*.
- ❌ **DILARANG** menghapus tombol hamburger `≡` di sudut kiri atas atau omni-search bar di bagian tengah header.
- ❌ **DILARANG** memodifikasi port WebSocket backend tanpa memastikan klien `public/app.js` tetap membaca URL host saat ini (`${protocol}//${window.location.host}`).
