# 📘 EduPortal LMS v2.0 — Panduan Instalasi

**Arsitektur baru:** Backend REST API di Google Apps Script · Frontend statis di GitHub Pages

Panduan ini melayani dua pembaca:
- **Bagian A–D** untuk instalasi baru dari nol
- **Bagian E** untuk Anda yang sudah menjalankan v1.1 dan ingin pindah tanpa kehilangan data

---

## Daftar Isi

| | Bagian | Perkiraan waktu |
|---|---|---|
| A | Pasang backend di Google Apps Script | 10 menit |
| B | Pasang frontend di GitHub Pages | 10 menit |
| C | Sambungkan keduanya | 2 menit |
| D | Konfigurasi awal sebagai Super Admin | 30 menit |
| E | **Migrasi dari v1.1** (bila sudah punya instalasi lama) | 15 menit |
| F | Pemecahan masalah | — |
| G | Pemeriksaan sebelum go-live | — |

---

## Apa yang Berubah, dan Mengapa

Pada v1.1 seluruh aplikasi dijalankan Apps Script. Praktis, tetapi membawa satu
konsekuensi yang tidak dapat diakali: `HtmlService` **selalu** menyajikan halaman
di dalam iframe bersarang milik Google (`sandboxFrame` → `userHtmlFrame`) pada
origin `*.googleusercontent.com`, dan Google **tidak menyertakan direktif
`microphone` maupun `camera`** pada atribut `allow` iframe tersebut.

Akibatnya `getUserMedia()` selalu ditolak — berapa kali pun pengguna menekan
"Izinkan", dan sekeras apa pun setelan situs diubah. Fitur Rekam Pertemuan
terpaksa memakai jendela perekam yang di-host terpisah, dan pemindai QR absensi
tidak pernah benar-benar dapat dipakai.

v2.0 memindahkan frontend keluar dari Apps Script. Halaman kini berdiri di
origin-nya sendiri, sehingga tidak ada iframe induk yang membatasi:

| | v1.1 | v2.0 |
|---|---|---|
| Frontend | HtmlService (di dalam iframe Google) | GitHub Pages (situs mandiri) |
| Komunikasi | `google.script.run` | `fetch()` HTTP JSON |
| Mikrofon | ❌ Diblokir; perlu Perekam Eksternal | ✅ Berfungsi langsung |
| Kamera / QR | ❌ Diblokir; ketik kode manual | ✅ Pemindai berfungsi |
| Waktu muat | Dua kali memuat | Sekali |
| Berkas yang di-deploy | 6 berkas ke Apps Script | 2 berkas `.gs` + repo frontend |

**Yang tidak berubah:** skema 32 sheet, seluruh alur bisnis, akun, data yang
sudah ada, dan design system. Berkas `Modul.gs` bahkan tidak berubah sebaris pun
dalam hal logikanya.

---

# A. Pasang Backend (Google Apps Script)

### A1. Buat proyek
1. Buka **https://script.google.com** → **Proyek Baru**
2. Ganti nama proyek menjadi `EduPortal LMS API`

### A2. Tempel dua berkas kode
1. Ganti seluruh isi `Code.gs` bawaan dengan isi **`Kode.gs`**, lalu ubah nama berkasnya menjadi **`Kode`**
2. **File → New → Script file** → beri nama **`Modul`** → tempel seluruh isi **`Modul.gs`**

> Hanya dua berkas. Tidak ada berkas HTML sama sekali — itulah inti perubahan
> arsitektur ini. Bila Anda migrasi dari v1.1, hapus berkas `Index`,
> `Stylesheet`, `JavaScript`, dan `Pages` dari proyek (lihat Bagian E).

### A3. Jalankan setup — **hanya sekali**
1. Pada dropdown fungsi, pilih **`setupAppEnvironment`**
2. Klik **▶ Run**
3. Klik **Review permissions** → pilih akun → **Advanced** → **Go to (nama proyek)** → **Allow**
   (izin yang diminta: Drive, Sheets, Gmail, dan permintaan eksternal)
4. Buka **Execution log**. Di sana tercantum URL Spreadsheet, URL Folder Drive, dan akun default

> ⚠️ **Jangan jalankan `setupAppEnvironment()` lebih dari sekali** pada instalasi
> baru — folder dan spreadsheet akan terbuat ganda. (Pengecualian: saat migrasi
> dari v1.1, menjalankannya ulang justru aman dan dianjurkan — lihat Bagian E.)

### A4. Deploy sebagai Web App
**Deploy → New deployment → ⚙ → Web app**

| Kolom | Nilai |
|---|---|
| Description | `EduPortal LMS API v2.0` |
| Execute as | **Me** |
| Who has access | **Anyone** |

> ⚠️ **"Anyone"**, bukan "Anyone with Google account". Pilihan kedua memaksa
> setiap pengguna login Google lebih dulu, yang membuat frontend menerima
> halaman HTML alih-alih JSON.

Klik **Deploy**, lalu **salin URL yang berakhiran `/exec`.**

### A5. Uji backend
Tempel URL `/exec` di peramban, tambahkan `?action=ping`:

```
https://script.google.com/macros/s/AKfycb.../exec?action=ping
```

Balasan yang benar:
```json
{"success":true,"data":{"app":"EduPortal LMS","versi":"1.0","siap":true,...},"message":"API EduPortal aktif."}
```

- `"siap": true` → setup sudah berhasil
- `"siap": false` → `setupAppEnvironment()` belum dijalankan; ulangi A3
- Muncul halaman login Google → *Who has access* belum "Anyone"; ulangi A4

---

# B. Pasang Frontend (GitHub Pages)

### B1. Buat repositori
1. Buka **https://github.com/new**
2. Nama: `eduportal` (bebas)
3. Pilih **Public** — GitHub Pages gratis hanya untuk repositori publik
4. **Create repository**

> **Apakah aman repositorinya publik?** Ya. Berkas frontend tidak memuat
> kredensial apa pun. Yang tersimpan hanyalah alamat API, yang memang dirancang
> untuk dihubungi publik dan dijaga oleh token sesi serta RBAC di backend —
> persis seperti alamat situs bank yang boleh diketahui siapa saja.

### B2. Unggah berkas
**Add file → Upload files**, lalu seret **seluruh isi folder frontend**:

```
index.html
404.html
.nojekyll
css/style.css
js/config.js
js/app.js
js/pages.js
README.md
PANDUAN_INSTALASI_V2.md
```

> Berkas `.nojekyll` penting: tanpanya GitHub memproses situs lewat Jekyll,
> yang mengabaikan folder berawalan garis bawah dan dapat mengacaukan aset.
> Bila berkas tak terlihat saat mengunggah, aktifkan tampilan berkas
> tersembunyi (`Ctrl+H` di Linux/Windows, `Cmd+Shift+.` di macOS).

**Commit changes.**

### B3. Aktifkan Pages
**Settings → Pages**

| Kolom | Nilai |
|---|---|
| Source | Deploy from a branch |
| Branch | `main` · folder `/ (root)` |
| Enforce HTTPS | ✅ **wajib dicentang** |

Klik **Save**, lalu tunggu 1–2 menit. Alamat situs akan muncul di halaman yang sama:

```
https://<nama-anda>.github.io/eduportal/
```

> **HTTPS wajib.** Mikrofon, kamera, dan geolokasi hanya diizinkan peramban pada
> halaman aman. Inilah yang membuat fitur rekam & pindai berfungsi di v2.0.

---

# C. Sambungkan Frontend ke Backend

1. Di repositori GitHub, buka **`js/config.js`** → klik ikon pensil ✏️
2. Cari baris:
   ```js
   const GAS_URL = 'GANTI_DENGAN_URL_EXEC_ANDA';
   ```
3. Ganti dengan URL `/exec` dari langkah A4:
   ```js
   const GAS_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
   ```
4. **Commit changes** → tunggu ±1 menit sampai GitHub Pages menerbitkan ulang

### Uji sambungan
Buka alamat GitHub Pages Anda. Di bagian bawah layar login ada indikator kecil:

| Indikator | Arti |
|---|---|
| 🟢 "Terhubung ke backend v1.0" | Semua benar — silakan masuk |
| 🔴 "Backend tidak terjangkau" | Panel merah di atas form akan menyebutkan langkah perbaikannya |
| 🔴 "Backend belum di-setup" | Jalankan `setupAppEnvironment()` (langkah A3) |

Masuk dengan `admin@eduportal.id` / `admin123`.

---

# D. Konfigurasi Awal (sebagai Super Admin)

Urutan ini penting — langkah berikutnya bergantung pada yang sebelumnya.

1. **Data Master → Periode** — isi tahun ajaran & semester, tandai satu periode **Aktif**.
   Lakukan **paling awal**: seluruh dropdown Tahun & Tahun Ajaran bersumber dari sini,
   dan sistem menolak lebih dari satu periode aktif.
2. **Pengaturan** — nama institusi, jenjang, KKM, lalu **Unggah Logo** (PNG/JPG maks 2MB).
3. Aktifkan fitur opsional: **SPP/Tagihan**, **Absensi Barcode**, **Absensi GPS**
   (untuk GPS, tekan *Pakai Lokasi Saat Ini* sambil berada di lokasi kampus, lalu atur radius).
4. Isi **WA Gateway** (Fonnte / WA Business API) bila ingin notifikasi WhatsApp,
   lalu uji lewat **Notifikasi → Kirim Pesan Uji**.
5. **Data Master** → isi berurutan:
   ```
   Jurusan → Kurikulum → Mata Pelajaran → Kelas → Dosen → Program Kelas
   ```
   **Program Kelas** menentukan siapa mengampu mapel apa di kelas mana — inilah
   kunci agar dashboard dosen terisi. Tiap tab punya tombol **Impor Excel**.
6. **Siswa/Mahasiswa** → isi biodata (manual atau Impor Excel), tetapkan kelas,
   tandai **Ketua Kelas** (berhak merekam & membuat resume pertemuan).
   Akun portal dosen dan mahasiswa **dibuat otomatis**: nama pengguna = email, sandi awal `123`.
7. **Jadwal** → susun manual, **Impor Excel**, atau **klik langsung pada sel** untuk mengubah.
8. **Data Master → Jenis Tagihan** bila fitur tagihan dipakai.

### Urutan impor Excel yang benar
```
Jurusan → Kelas → Dosen → Mata Pelajaran → Siswa → Jadwal
```
Kolom relasi selalu diisi **KODE**, bukan nama panjang
(`KodeKelas` = TI-2026-A, `KodeJurusan` = TI, `NIDNDosen` = 0011223344).
Unduh templat dari setiap wizard impor agar nama kolomnya persis. Baris bermasalah
dilaporkan lengkap dengan nomor barisnya dan dilewati; baris yang benar tetap tersimpan.

### Pemicu otomatis (opsional, disarankan)
Di Apps Script, buka **Triggers (⏰) → Add Trigger**:

| Fungsi | Jenis | Waktu |
|---|---|---|
| `triggerPengingatHarian` | Day timer | 07.00–08.00 (pengingat H-1 tenggat tugas) |
| `bersihkanSesiKedaluwarsa` | Day timer | 01.00–02.00 |
| `warmupCache` | Hour timer | Tiap 6 jam (mempercepat akses pertama) |

---

# E. Migrasi dari v1.1

Data Anda **tidak akan hilang**. Spreadsheet, folder Drive, akun, dan seluruh
riwayat tetap dipakai apa adanya — yang berubah hanya cara frontend berbicara
dengan backend.

### E1. Cadangkan dulu
Buka spreadsheet database Anda → **File → Make a copy**. Beri nama
`Cadangan sebelum v2.0 — <tanggal>`. Lakukan ini walaupun risikonya kecil.

### E2. Perbarui kode backend
Di proyek Apps Script yang **sudah ada** (jangan buat proyek baru — Script
Properties di dalamnya menyimpan ID spreadsheet dan folder Anda):

1. Timpa isi `Kode` dengan **`Kode.gs` v2.0**
2. Timpa isi `Modul` dengan **`Modul.gs` v2.0**
3. **Hapus** empat berkas HTML: `Index`, `Stylesheet`, `JavaScript`, `Pages`
   (klik ⋮ di sebelah nama berkas → Delete)

> Keempat berkas itu kini dilayani GitHub Pages. Membiarkannya tidak
> menyebabkan galat, tetapi menyesatkan orang yang membaca proyek nanti dan
> berisiko tersunting keliru di kemudian hari.

### E3. Jalankan ulang setup
Pilih **`setupAppEnvironment`** → **▶ Run**.

Berbeda dengan instalasi baru, di sini menjalankannya ulang **aman dan
dianjurkan**: fungsi ini mengenali environment yang sudah ada, hanya menambahkan
sheet atau kolom baru lewat migrasi otomatis (`migrasiHeader`), dan **tidak
menghapus data lama**.

### E4. Deploy versi baru
**Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**

Salin URL `/exec`. Bila Anda memakai deployment yang sama, URL-nya tidak berubah.

### E5. Terbitkan frontend
Ikuti **Bagian B dan C**.

### E6. Bereskan sisa v1.1
| Yang perlu dilakukan | Alasan |
|---|---|
| Hapus halaman **Perekam Eksternal** dari Blogger/Netlify/GitHub Pages | Tidak dipakai lagi; perekaman kini native |
| Abaikan kolom `URLPerekam` di sheet `Institusi` | Sengaja **tidak** dihapus agar migrasi tidak merusak data lama. Kolomnya diam saja dan boleh dibiarkan |
| Hapus iframe EduPortal di Blogger | Pengguna kini diarahkan langsung ke alamat GitHub Pages |
| Bagikan alamat baru ke seluruh pengguna | Alamat lama `/exec` sekarang membalas JSON, bukan halaman |

> **Alamat lama tidak lagi menampilkan aplikasi.** Bila dibuka di peramban, URL
> `/exec` kini membalas `{"success":true,...}` — itu memang benar, karena
> perannya sudah berubah menjadi API. Pastikan seluruh pengguna, tautan di grup,
> dan bookmark diperbarui ke alamat GitHub Pages.

### E7. Uji setelah migrasi
Masuk sebagai Super Admin dan periksa:
- [ ] Data lama utuh (siswa, dosen, jadwal, nilai)
- [ ] Logo institusi masih tampil di sidebar
- [ ] **Rekam Pertemuan** → tekan rekam → peramban meminta izin mikrofon → transkrip berjalan
- [ ] **Absensi QR** → kamera menyala dan memindai
- [ ] Unggah materi → berkas masuk ke folder Drive yang sama seperti sebelumnya

---

# F. Pemecahan Masalah

Layar login menampilkan indikator koneksi. Bila merah, panel di atas form sudah
menyebutkan langkah perbaikannya. Berikut penjabarannya.

| Pesan / gejala | Penyebab | Perbaikan |
|---|---|---|
| "GAS_URL belum diisi" | `js/config.js` masih bawaan | Bagian C |
| "GAS_URL berakhiran /dev" | Menyalin URL yang salah | Pakai URL `/exec` dari **Deploy → Manage deployments** |
| "Backend meminta login Google" | *Who has access* bukan "Anyone" | Ulangi A4, deploy versi baru |
| "Backend membalas halaman HTML" | Belum di-deploy sebagai Web App, atau perubahan belum dideploy | Deploy → Manage deployments → Edit → **New version** |
| "Backend belum di-setup" | `setupAppEnvironment()` belum jalan | Langkah A3 |
| "Fungsi ... tidak ditemukan" | `Modul.gs` belum ditempel / tidak lengkap | Tempel ulang, deploy versi baru |
| "Akses ke API ditolak (HTTP 403)" | Deployment tidak publik | Ulangi A4 |
| "Server tidak membalas dalam 45 detik" | Operasi berat atau koneksi lambat | Coba lagi; untuk impor massal, pecah per kelas |
| Perubahan kode tidak terlihat | Deployment masih versi lama | **Selalu buat New version** setiap kali kode berubah |
| Mikrofon tidak jalan | Halaman belum HTTPS | Settings → Pages → centang **Enforce HTTPS** |
| Mikrofon "izin ditolak" | Pengguna pernah menolak | Klik gembok di kolom alamat → Setelan situs → Mikrofon → Izinkan |
| Transkripsi tidak muncul | Peramban tanpa Web Speech API | Pakai Chrome/Edge; atau **Ketik / Tempel Transkrip** |
| Halaman kosong / 404 di GitHub | Berkas tidak di akar repo | `index.html` harus berada di root, bukan di dalam subfolder |
| CSS tidak termuat | Struktur folder berubah | Pertahankan `css/` dan `js/` persis seperti aslinya |

### Kesalahan nomor satu

> Kode sudah diubah dan disimpan di Apps Script, tetapi **belum di-deploy
> sebagai versi baru**. Menyimpan berkas tidak memperbarui aplikasi yang sedang
> berjalan. Setiap kali `Kode.gs` atau `Modul.gs` berubah:
> **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.**

### Membaca galat lebih dalam
Bila pesan di layar belum cukup:
- **Frontend:** tekan `F12` → tab **Console** dan **Network**
- **Backend:** Apps Script → **Executions** (ikon ⏱ di kiri) → lihat baris yang gagal

---

# G. Sebelum Go-Live

Periksa satu per satu:

- [ ] Keempat kata sandi default sudah diganti (Profil Saya → Keamanan)
- [ ] `tampilkanAkunDemo: false` di `js/config.js`, sudah di-commit
- [ ] Satu periode berstatus **Aktif** di Data Master → Periode
- [ ] Identitas institusi dan logo sudah diisi
- [ ] Program Kelas sudah lengkap (dosen ↔ mapel ↔ kelas)
- [ ] Ketiga pemicu otomatis sudah dipasang
- [ ] `?action=ping` membalas `"siap": true`
- [ ] **Enforce HTTPS** aktif di GitHub Pages
- [ ] Sudah diuji dari ponsel, bukan hanya komputer
- [ ] Sudah diuji dengan keempat peran, bukan hanya Super Admin
- [ ] Rekam Pertemuan dan Absensi QR sudah dicoba di perangkat sungguhan
- [ ] Spreadsheet database sudah dicadangkan
- [ ] Alamat GitHub Pages sudah dibagikan ke seluruh pengguna

---

# Batasan yang Perlu Diketahui

Batasan berikut berasal dari kuota Google, bukan dari arsitektur aplikasi.

- **Kuota email:** ±100/hari untuk akun Google personal, ±1.500/hari untuk Workspace.
  Notifikasi berhenti dengan aman saat kuota menipis dan tetap dicatat di Log Notifikasi.
- **Ukuran berkas:** maksimal **2 MB** per berkas. Untuk video, gunakan tautan
  YouTube (otomatis di-embed).
- **Waktu eksekusi:** 6 menit per fungsi. Cetak transkrip massal sebaiknya per kelas.
- **Kapasitas Sheets:** ±500.000 sel. Arsipkan per tahun akademik dengan
  menduplikasi spreadsheet.
- **Transkripsi suara** berjalan di peramban (Web Speech API), jadi tidak memakan
  kuota Google. Dukungan terbaik: Chrome/Edge di komputer dan Android.
- **GitHub Pages:** 1 GB penyimpanan, 100 GB lalu lintas per bulan — jauh di atas
  kebutuhan aplikasi sebesar ini.
