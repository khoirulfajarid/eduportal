# EduPortal LMS — Frontend

Learning Management System berbasis **Google Workspace**, dengan frontend statis
dan Google Apps Script sebagai REST API.

> **Repositori ini berisi frontend saja.** Backend-nya berupa dua berkas
> `.gs` yang ditempel ke proyek Google Apps Script — lihat
> [PANDUAN_INSTALASI_V2.md](./PANDUAN_INSTALASI_V2.md).

---

## Arsitektur

```
Pengguna
   │
   ▼
GitHub Pages  ← repositori ini (HTML/CSS/JS murni, tanpa build step)
   │
   │  fetch()  ·  POST  ·  Content-Type: text/plain;charset=utf-8
   │  { action, token, args:[…] }  →  { success, data, message }
   ▼
Google Apps Script Web App  /exec
   │
   ▼
Google Sheets (32 sheet) · Drive · Gmail
```

Tidak ada iframe, tidak ada `google.script.run`, tidak ada `HtmlService`.

---

## Isi Repositori

| Berkas | Isi |
|---|---|
| `index.html` | Kerangka aplikasi: splash, sidebar, topbar, layar login, modal |
| `css/style.css` | Design system *Academic Prestige* — token warna terang/gelap, komponen, responsif |
| `js/config.js` | **Satu-satunya berkas yang perlu Anda edit.** Berisi `GAS_URL` |
| `js/app.js` | Inti SPA: state, router, jembatan `fetch()` ke API, tabel, chart, ikon, perekam |
| `js/pages.js` | Seluruh halaman untuk 4 peran (Super Admin, Tim Akademik, Dosen, Siswa) |
| `404.html` | Mengembalikan alamat keliru ke aplikasi |
| `.nojekyll` | Mencegah GitHub Pages memproses berkas lewat Jekyll |

Tidak ada `node_modules`, tidak ada langkah build, tidak ada bundler.
Berkas yang Anda lihat persis berkas yang dijalankan peramban.

---

## Pemasangan Singkat

### 1. Pasang backend
Ikuti [PANDUAN_INSTALASI_V2.md](./PANDUAN_INSTALASI_V2.md) bagian A,
lalu salin URL Web App yang berakhiran `/exec`.

### 2. Isi alamat backend
Buka `js/config.js`, ganti satu baris:

```js
const GAS_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```

### 3. Aktifkan GitHub Pages
**Settings → Pages → Source: Deploy from a branch → `main` / `root` → Save.**
Pastikan **Enforce HTTPS** tercentang — mikrofon dan kamera memerlukannya.

Aplikasi terbit di `https://<nama-anda>.github.io/<nama-repo>/`.

### 4. Masuk
| Peran | Email | Kata Sandi |
|---|---|---|
| Super Admin | `admin@eduportal.id` | `admin123` |
| Tim Akademik | `akademik@eduportal.id` | `akademik123` |
| Dosen / Guru | `dosen@eduportal.id` | `dosen123` |
| Siswa / Mahasiswa | `siswa@eduportal.id` | `siswa123` |

> **Sebelum dipakai sungguhan:** ganti keempat kata sandi tersebut, lalu setel
> `tampilkanAkunDemo: false` di `js/config.js`.

---

## Pengembangan Lokal

Buka lewat server, **bukan** dengan klik ganda berkas — protokol `file://`
tidak diizinkan memanggil `fetch()` lintas asal.

```bash
python3 -m http.server 8080
# lalu buka http://localhost:8080
```

`localhost` dianggap konteks aman oleh peramban, sehingga mikrofon dan kamera
tetap berfungsi meski tanpa HTTPS.

---

## Yang Berubah dari Versi 1.1

Versi 1.1 menjalankan seluruh aplikasi di dalam Apps Script, yang berarti
halaman selalu tersaji di dalam iframe bersarang milik Google. Google tidak
memberi izin `microphone` maupun `camera` pada iframe tersebut, sehingga dua
fitur terpaksa dibuat berputar atau tidak berfungsi sama sekali.

| | v1.1 (di dalam GAS) | v2.0 (repositori ini) |
|---|---|---|
| Rekam Pertemuan | Perlu berkas *Perekam Eksternal* di-host terpisah, dibuka sebagai jendela popup, transkrip dipulangkan lewat `postMessage` | Berjalan langsung di halaman |
| Absensi QR | Kamera diblokir → hanya bisa ketik kode manual | Pemindai kamera berfungsi; kode manual tetap ada sebagai cadangan |
| Absensi GPS | Berjalan, tetapi rapuh | Native |
| Waktu muat | Dua kali memuat (bingkai Google → bingkai aplikasi) | Sekali |
| Diagnosis galat | "Respons kosong dari server" | Pesan menyebut penyebab dan langkah perbaikannya |

Logika bisnisnya sendiri **tidak berubah**: skema 32 sheet, alur penilaian
berjenjang, impor Excel, tagihan, dan notifikasi tetap sama persis.

---

## Pemecahan Masalah

Layar login menampilkan indikator koneksi di bagian bawah. Bila merah,
pesannya sudah menyebutkan langkah perbaikan. Ringkasan penyebab tersering:

| Gejala | Penyebab | Perbaikan |
|---|---|---|
| "GAS_URL belum diisi" | `js/config.js` masih bawaan | Isi `GAS_URL` dengan URL `/exec` |
| "Backend meminta login Google" | Deployment tidak publik | Deploy → Manage deployments → Edit → *Who has access*: **Anyone** |
| "Backend membalas halaman HTML" | Belum di-deploy sebagai Web App, atau perubahan belum dideploy | Buat **New version**, lalu Deploy |
| "Backend belum di-setup" | `setupAppEnvironment()` belum dijalankan | Jalankan sekali di editor Apps Script |
| "Fungsi tidak ditemukan" | `Modul.gs` belum ditempel | Tempel `Modul.gs` lengkap, deploy versi baru |
| Perubahan kode tidak terlihat | Deployment masih versi lama | Selalu **New version** setiap kali kode berubah |
| Mikrofon tidak jalan | Halaman belum HTTPS | Settings → Pages → centang **Enforce HTTPS** |

> **Paling sering terjadi:** kode sudah diubah dan disimpan di Apps Script,
> tetapi belum di-deploy sebagai versi baru. Menyimpan berkas tidak
> memperbarui aplikasi yang sedang berjalan.

---

## Keamanan

- Kata sandi disimpan sebagai **SHA-256 + salt**, tidak pernah dikirim balik ke klien.
- Token sesi berlaku 6 jam, disimpan di `localStorage`, dan **tidak pernah masuk URL** —
  seluruh aksi terautentikasi memakai POST.
- Backend hanya mengeksekusi aksi yang terdaftar di `ACTION_WHITELIST`;
  nama fungsi sembarang dari klien tidak akan pernah dijalankan.
- Setiap fungsi backend memvalidasi sesi (`requireSession`) dan hak peran (`RBAC_WRITE`)
  sebelum menulis apa pun.
- `getInitialAppData()` menyaring data per peran: siswa hanya menerima datanya sendiri,
  dosen hanya kelas yang diampunya, dan hash kata sandi selalu dibuang sebelum dikirim.

Perlu diketahui: berkas di repositori ini bersifat publik bila repositorinya publik.
Karena itu `js/config.js` **tidak boleh** memuat kredensial apa pun — isinya hanya
alamat API, yang memang dirancang untuk diakses publik dan dijaga oleh token sesi.

---

## Lisensi & Atribusi

Design system **Academic Prestige** · Plus Jakarta Sans + Inter
Ikon bergaya Lucide, disisipkan inline (tanpa CDN ikon).
