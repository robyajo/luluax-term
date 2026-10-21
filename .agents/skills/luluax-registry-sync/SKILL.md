---
name: luluax-registry-sync
description: "Aturan arsitektur penyimpanan data per akun (registry-<accountId>.json), folder grouping dengan drag-and-drop, dan sinkronisasi multi-device ke cloud backend PostgreSQL. WAJIB dijalankan oleh AI setiap kali menambahkan fitur baru, entitas baru, atau konfigurasi baru di LuluaX Suite agar selalu memiliki skema penyimpanan lokal dan cloud yang tersinkronisasi."
---

# LuluaX Registry & Cloud Sync Architecture

Dokumen ini memuat kontrak teknis wajib bagi seluruh agen AI yang bekerja di ekosistem LuluaX (LuluaX-Term, LuluaX-Request, dan Backend).

---

## 1. Prinsip Utama Penyimpanan Data Pengguna

1. **Per-Account Scoped Registry**:
   - Setiap pengguna memiliki snapshot data terisolasi yang disimpan di berkas:
     `%APPDATA%/LuluaX-Term/registry-<accountId>.json` (Windows)
     `~/Library/Application Support/LuluaX-Term/registry-<accountId>.json` (macOS).
   - Berkas ini memuat seluruh status workspace pengguna: folder, host, port forwarding/tunnel, key vault, cuplikan perintah (snippets), dan pengaturan personal.

2. **Multi-Device Parity (Cloud Synchronization)**:
   - Setiap kali pengguna melakukan perubahan (menambah host, membuat folder, drag-and-drop host ke folder, menyimpan kunci, toggle tunnel), perubahan tersebut disimpan secara lokal dan disinkronkan secara asinkron (debounced) ke backend database PostgreSQL Neon di `https://www.luluax-service.duckdns.org`.
   - Saat pengguna login di perangkat baru (misal laptop lain atau komputer kantor), aplikasi otomatis memanggil `GET /api/terminal/registry` atau `/api/cloud/pull` untuk mengunduh snapshot akun tersebut sehingga tata letak folder dan host tampil 100% identik.

---

## 2. Struktur Skema Account Registry (`registry-<accountId>.json`)

```typescript
export interface AccountRegistry {
  accountId: string;          // ID unik akun pengguna (misal email atau UUID)
  email?: string;             // Alamat email pengguna
  version: number;            // Versi skema registry (dimulai dari 1)
  updatedAt: number;          // Timestamp epoch milidetik perubahan terakhir
  folders: FolderItem[];      // Daftar folder pengelompokan host
  hosts: HostItem[];          // Daftar host SSH dan shell lokal
  tunnels: TunnelItem[];      // Daftar tunnel port forwarding aktif & inaktif
  keys: SshKeyItem[];         // Daftar pasangan kunci SSH Key Vault
  snippets: SnippetItem[];    // Daftar cuplikan perintah & template variabel
  settings: SettingsData;     // Pengaturan tema, font, dan preferensi aplikasi
}
```

---

## 3. Skema Folder & Drag-and-Drop

```typescript
export interface FolderItem {
  id: string;                 // e.g. "folder_1792605000_abc"
  name: string;               // Nama folder (e.g. "Production Cluster")
  color?: string;             // Kode warna hex (e.g. "#7b61ff")
  icon?: string;              // Emoji atau nama ikon (e.g. "📁", "🚀", "💾")
  parentId?: string | null;   // ID folder induk (mendukung nested hierarchy)
  orderIndex?: number;        // Urutan tampilan (0, 1, 2, ...)
  collapsed?: boolean;        // Status lipat/buka folder di UI
  createdAt?: number;
  updatedAt?: number;
}
```

Pada entitas `HostItem`:
- `folderId?: string | null;` — ID folder tempat host berada. Jika `null` atau kosong, host berada di level utama (Root / Unassigned).
- `orderIndex?: number;` — Urutan kartu host di dalam folder.

### Alur Drag-and-Drop:
1. Kartu host memiliki atribut `draggable="true"`. Saat `dragstart`, ID host disimpan di `dataTransfer`.
2. Kotak folder bertindak sebagai area penerima (`dragover`, `dragleave`, `drop`).
3. Saat kartu host dilepaskan di dalam folder, frontend memanggil endpoint `/api/hosts/:id/move` dengan `{ folderId: folder.id }`.
4. Saat dilepaskan di area `root-drop-zone`, host dikeluarkan dari folder (`folderId: null`).
5. Perubahan segera disimpan ke `hosts.json`, diperbarui ke `registry-<accountId>.json`, dan disinkronkan ke cloud backend.

---

## 4. Pemetaan Database Backend (`backend/src/db/schema/terminal.ts`)

| Tabel PostgreSQL | Mewakili Bagian Registry | Kolom Utama |
|---|---|---|
| `term_folders` | `registry.folders` | `id, user_id, name, color, icon, parent_id, order_index, created_at, updated_at` |
| `term_hosts` | `registry.hosts` | `id, user_id, label, type, hostname, port, username, folder_id, proxy_jump_host_id, startup_script, order_index` |
| `term_tunnels` | `registry.tunnels` | `id, user_id, label, host_id, tunnel_type, local_port, remote_host, remote_port, enabled` |
| `term_keys` | `registry.keys` | `id, user_id, label, key_type, public_key, private_key, passphrase, fingerprint` |
| `term_snippets` | `registry.snippets` | `id, user_id, title, command, category, tags` |
| `term_settings` | `registry.settings` | `user_id, settings (JSONB)` |

---

## 5. Prosedur Wajib Agen AI Saat Menambahkan Fitur Baru

Jika di masa mendatang agen AI menambahkan fitur baru (misalnya: *Identity Credentials*, *Script Packages*, *MOSH Settings*, atau *Host Chaining Configurations*):

1. **Perbarui `types.ts`**:
   Tambahkan tipe data baru ke dalam `types.ts` dan masukkan array/propertinya ke interface `AccountRegistry`.
2. **Perbarui `server.ts`**:
   - Perbarui fungsi `loadAccountRegistry()`, `saveAccountRegistry()`, dan `syncActiveRegistry()` untuk menyertakan properti baru.
   - Perbarui endpoint `/api/cloud/push` dan `/api/cloud/pull` untuk menyertakan payload entitas baru.
3. **Perbarui Schema Database Backend**:
   - Tambahkan tabel atau kolom baru di `backend/src/db/schema/terminal.ts`.
   - Tambahkan logika upsert/query di endpoint `/api/terminal/registry` dan `/api/terminal/registry/sync` pada `backend/src/modules/terminal/terminal.routes.ts`.
4. **Perbarui UI & Sinkronisasi Real-Time**:
   - Pastikan setiap aksi simpan/ubah di UI memicu `this.triggerDebouncedSync()`.
5. **Wajib Perbarui `CHANGELOG.md`**:
   - Setiap kali agen AI melakukan perubahan kode, perbaikan bug, penambahan fitur, atau rilis, AI WAJIB memperbarui berkas `CHANGELOG.md` pada aplikasi yang terdampak (`luluax-term/CHANGELOG.md`, `luluax-request/CHANGELOG.md`, atau `backend/CHANGELOG.md`) menggunakan format standar Keep a Changelog.
6. **Verifikasi Kompilasi & Lakukan Activity-Sync**:
   - Jalankan `npm run build` di `luluax-term/` dan `luluax-request/`, serta `npx tsc --noEmit` di `backend/`.
   - Wajib eksekusi `activity-sync` ke API portfolio (`https://ajoroby.is-a.dev/api/activities`).
