/**
 * ============================================================================
 * EduPortal LMS — Learning Management System berbasis Google Apps Script
 * ----------------------------------------------------------------------------
 * File   : Kode.gs  (CORE BACKEND)
 * Versi  : 1.0
 * Isi    : Konfigurasi, doGet SPA, Auto-Setup, CacheService, Autentikasi,
 *          RBAC, dan Mesin CRUD generik + Batch Processing.
 *
 * Prinsip yang diterapkan (gas-instant-ux):
 *   1. Client-Side SPA  — doGet() dipanggil SEKALI, tidak ada ?page=
 *   2. Optimistic UI    — ditangani di frontend (JavaScript.html)
 *   3. Server Cache     — CacheService untuk semua master data
 *   4. Batch Processing — getValues()/setValues(), tidak ada loop per sel
 * ============================================================================
 */

/* ========================================================================== */
/* 1. KONSTANTA APLIKASI                                                      */
/* ========================================================================== */

const APP_NAME    = 'EduPortal LMS';
const APP_VERSION = '1.0';
const APP_TAGLINE = 'Learning Management System';

/** Kunci penyimpanan ID di Script Properties */
const PROP_SPREADSHEET_ID = 'LMS_SPREADSHEET_ID';
const PROP_ROOT_FOLDER_ID = 'LMS_ROOT_FOLDER_ID';

/** Batas ukuran unggahan berkas (PRD: maks 2MB) */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Masa berlaku sesi login (ms) */
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 jam

/** Batas percobaan login gagal sebelum akun terkunci sementara */
const MAX_LOGIN_ATTEMPT   = 3;
const LOCKOUT_DURATION_S  = 15 * 60; // 15 menit

/** TTL cache per jenis data (detik) */
const CACHE_TTL = {
  MASTER: 3600, // data master: jurusan, kurikulum, mapel, kelas, jadwal
  SEMI:   600,  // data semi-dinamis: materi, tugas, enrollment
  SHORT:  60    // data cepat berubah: absensi, nilai
};

/** Daftar sheet yang di-cache sebagai master data */
const MASTER_SHEETS = [
  'Institusi', 'Periode', 'Jurusan_Prodi', 'Kurikulum', 'Mata_Pelajaran',
  'Kelas', 'Program_Kelas', 'Jadwal', 'Dosen_Guru', 'Siswa_Mahasiswa',
  'Jenis_Tagihan', 'Bantuan'
];

/**
 * Kolom yang WAJIB disimpan sebagai TEKS agar angka 0 di depan tidak hilang
 * (No. WhatsApp 0878…, NIM 002…, NIDN 001…). Format sel diset '@' saat setup.
 */
const KOLOM_TEKS = {
  'Pengguna':        ['NoHP'],
  'Dosen_Guru':      ['NIDN', 'NoHP'],
  'Siswa_Mahasiswa': ['NIM', 'NoHP', 'NoHPWali'],
  'Institusi':       ['Telepon'],
  'Kelas':           ['Kode'],
  'Mata_Pelajaran':  ['Kode'],
  'Jurusan_Prodi':   ['Kode'],
  'Periode':         ['Kode', 'Tahun'],
  'Jenis_Tagihan':   ['Kode']
};

/**
 * SKEMA DATABASE — 24 sheet sesuai PRD Bagian 4.1.
 * Kolom pertama SELALU 'ID' (UUID), bukan nomor baris.
 */
const SHEET_SCHEMA = {
  /* ---------- Master Data ---------- */
  'Institusi': ['ID','NamaInstitusi','Jenjang','LogoURL','LogoFileID','Alamat','Email','Telepon',
                'TahunAjaran','SemesterAktif','FiturSPP','FiturBarcode','FiturGeo',
                'GeoLat','GeoLng','GeoRadius','WAGatewayURL','WAGatewayToken',
                'NotifEmail','NotifWA','KKM','URLPerekam','UpdatedAt'],

  /** Periode akademik — sumber tunggal dropdown Tahun & Tahun Ajaran (US-Upgrade 6 & 11b) */
  'Periode': ['ID','Kode','Tahun','TahunAjaran','Semester','TanggalMulai','TanggalSelesai',
              'Status','Keterangan','CreatedAt'],

  'Pengguna': ['ID','Nama','Email','NoHP','Peran','PasswordHash','Status',
               'FotoURL','FotoFileID','LastLogin','CreatedAt'],

  'Jurusan_Prodi': ['ID','Kode','Nama','Jenjang','Keterangan','Status','CreatedAt'],

  'Kurikulum': ['ID','Kode','Nama','TahunBerlaku','JurusanID','Keterangan','Status','CreatedAt'],

  'Mata_Pelajaran': ['ID','Kode','Nama','SKS','KurikulumID','JurusanID','Jenjang',
                     'Kategori','Deskripsi','Status','CreatedAt'],

  'Kelas': ['ID','Kode','Nama','JurusanID','Angkatan','WaliKelasID','Ruangan',
            'Kapasitas','Status','CreatedAt'],

  'Program_Kelas': ['ID','KelasID','MapelID','DosenID','Semester','TahunAjaran','Status','CreatedAt'],

  'Jadwal': ['ID','Hari','JamMulai','JamSelesai','MapelID','KelasID','Ruangan',
             'DosenID','Semester','TahunAjaran','Status','CreatedAt'],

  /* ---------- Data Akademik ---------- */
  'Dosen_Guru': ['ID','PenggunaID','NIDN','Nama','Email','NoHP','JurusanID',
                 'Gelar','Alamat','FotoURL','FotoFileID','Status','CreatedAt'],

  'Siswa_Mahasiswa': ['ID','PenggunaID','NIM','Nama','Email','NoHP','KelasID',
                      'JurusanID','Angkatan','JenisKelamin','TanggalLahir','Alamat',
                      'NamaWali','NoHPWali','FotoURL','FotoFileID','IsKetuaKelas','Status','CreatedAt'],

  'Enrollment': ['ID','SiswaID','KelasID','MapelID','Semester','TahunAjaran','Status','CreatedAt'],

  /* ---------- Proses Belajar-Mengajar ---------- */
  'Materi': ['ID','Judul','Deskripsi','Jenis','URL','FileID','MimeType','MapelID',
             'KelasID','Pertemuan','DosenID','TanggalUpload'],

  'Tugas_Quiz': ['ID','Judul','Deskripsi','MapelID','KelasID','JenisPengumpulan',
                 'Deadline','Bobot','Komponen','DosenID','Status','CreatedAt'],

  'Pengumpulan_Tugas': ['ID','TugasID','SiswaID','Jenis','KontenTeks','KontenURL',
                        'FileID','Timestamp','Keterlambatan','Nilai','Feedback','DinilaiOleh'],

  'Absensi': ['ID','Tanggal','MapelID','KelasID','SiswaID','Pertemuan','Status',
              'BuktiURL','Metode','Keterangan','DiisiOleh','Timestamp'],

  /* ---------- Penilaian ---------- */
  'Nilai_Tugas': ['ID','MapelID','KelasID','SiswaID','Semester','TahunAjaran',
                  'Komponen','Nilai','Bobot','UpdatedAt'],

  'Nilai_UTS_UAS': ['ID','MapelID','KelasID','SiswaID','Semester','TahunAjaran',
                    'Jenis','Nilai','Bobot','UpdatedAt'],

  'Status_Nilai': ['ID','MapelID','KelasID','Semester','TahunAjaran','Status',
                   'SubmittedBy','SubmittedAt','ValidatedBy','ValidatedAt','Catatan'],

  /** Status validasi PER SISWA — memungkinkan verval sebagian kelas (Upgrade 16) */
  'Status_Nilai_Siswa': ['ID','MapelID','KelasID','Semester','TahunAjaran','SiswaID','Status',
                         'SubmittedBy','SubmittedAt','ValidatedBy','ValidatedAt','Catatan'],

  /** Komponen bobot penilaian yang disusun sendiri oleh dosen (Upgrade 15) */
  'Komponen_Nilai': ['ID','MapelID','KelasID','Semester','TahunAjaran','Nama','Bobot','Urutan','UpdatedAt'],

  'Transkrip': ['ID','SiswaID','MapelID','Semester','TahunAjaran','NilaiAkhir',
                'Huruf','Bobot','SKS','Keterangan','GeneratedAt'],

  'Remedial': ['ID','SiswaID','MapelID','Semester','TahunAjaran','NilaiSebelum',
               'NilaiRemedial','AmbangBatas','Status','Catatan','CreatedAt'],

  'Pengulangan_Matkul': ['ID','SiswaID','MapelID','SemesterAsal','SemesterUlang',
                         'TahunAjaran','Status','Catatan','CreatedAt'],

  /* ---------- Rekam & Resume Pertemuan (US-11a) ---------- */
  'Resume_Pertemuan': ['ID','MateriID','MapelID','KelasID','Pertemuan','Judul',
                       'Transkrip','Resume','DocID','PdfID','Durasi','CreatedBy','CreatedAt'],

  /** Pusat Bantuan yang dapat dikelola Super Admin (Upgrade 11a) */
  'Bantuan': ['ID','Kategori','Pertanyaan','Jawaban','Peran','Urutan','Status','UpdatedAt'],

  /* ---------- Fitur Opsional ---------- */
  /** Master jenis tagihan: SPP, Uang Gedung, Praktikum, Wisuda, dll. (Upgrade 10) */
  'Jenis_Tagihan': ['ID','Kode','Nama','NominalDefault','Periodik','Keterangan','Status','CreatedAt'],

  'SPP_Tagihan': ['ID','SiswaID','JenisID','JenisNama','Periode','Nominal','StatusBayar','TanggalBayar',
                  'BuktiURL','Catatan','CreatedAt'],

  'Absensi_Geo': ['ID','SiswaID','KelasID','MapelID','Lat','Lng','Jarak','Status','Timestamp'],

  'Absensi_Barcode': ['ID','SesiKode','KelasID','MapelID','Pertemuan','SiswaID',
                      'BerlakuSampai','Timestamp'],

  'Log_Notifikasi': ['ID','Penerima','Kontak','Channel','Subjek','Pesan','Status','Timestamp'],

  'AppConfig': ['Key','Value','UpdatedAt']
};

/**
 * MATRIKS HAK AKSES (RBAC) — PRD Bagian 3.2.
 * Nilai: daftar peran yang boleh melakukan aksi pada sheet tersebut.
 * '*' = semua peran terautentikasi (dibatasi lagi oleh filter data per peran).
 */
const RBAC_WRITE = {
  'Institusi':          ['Super Admin'],
  'Periode':            ['Super Admin'],
  'Bantuan':            ['Super Admin'],
  'Jenis_Tagihan':      ['Super Admin'],
  'Pengguna':           ['Super Admin'],
  'Jurusan_Prodi':      ['Super Admin'],
  'Kurikulum':          ['Super Admin'],
  'Mata_Pelajaran':     ['Super Admin'],
  'Kelas':              ['Super Admin'],
  'Program_Kelas':      ['Super Admin'],
  'Jadwal':             ['Super Admin'],
  'Dosen_Guru':         ['Super Admin'],
  'Siswa_Mahasiswa':    ['Super Admin'],
  'Enrollment':         ['Super Admin'],
  'Materi':             ['Dosen', 'Super Admin'],
  'Tugas_Quiz':         ['Dosen', 'Super Admin'],
  'Pengumpulan_Tugas':  ['Siswa', 'Dosen'],
  'Absensi':            ['Siswa', 'Dosen', 'Super Admin'],
  'Nilai_Tugas':        ['Dosen'],
  'Nilai_UTS_UAS':      ['Dosen'],
  'Status_Nilai':       ['Dosen', 'Tim Akademik'],
  'Status_Nilai_Siswa': ['Dosen', 'Tim Akademik'],
  'Komponen_Nilai':     ['Dosen'],
  'Transkrip':          ['Super Admin', 'Tim Akademik'],
  'Remedial':           ['Super Admin', 'Tim Akademik'],
  'Pengulangan_Matkul': ['Super Admin', 'Tim Akademik'],
  'Resume_Pertemuan':   ['Dosen', 'Siswa'],
  'SPP_Tagihan':        ['Super Admin'],
  'Absensi_Geo':        ['Siswa'],
  'Absensi_Barcode':    ['Dosen', 'Siswa'],
  'Log_Notifikasi':     ['Super Admin'],
  'AppConfig':          ['Super Admin']
};

/** Peran yang dikenal sistem */
const ROLES = ['Super Admin', 'Tim Akademik', 'Dosen', 'Siswa'];


/* ========================================================================== */
/* 2. ENTRY POINT — REST API (arsitektur GAS-PRO-API)                         */
/* ========================================================================== */
/**
 * ARSITEKTUR v2.0 — GAS berperan sebagai PURE REST API.
 * ---------------------------------------------------------------------------
 * Frontend TIDAK LAGI disajikan oleh Apps Script. Seluruh HTML/CSS/JS di-host
 * di GitHub Pages dan berkomunikasi dengan backend ini lewat fetch() JSON.
 *
 * Konsekuensi yang disengaja:
 *   • Tidak ada HtmlService, tidak ada include(), tidak ada template scriptlet.
 *   • Tidak ada iframe Google → mikrofon & kamera berfungsi normal di frontend.
 *   • doGet()  hanya melayani endpoint publik tanpa token (ping / info).
 *   • doPost() melayani SELURUH aksi terautentikasi.
 *
 * KONTRAK REQUEST (POST)
 *   Content-Type WAJIB: text/plain;charset=utf-8
 *   (application/json memicu CORS preflight OPTIONS yang tidak dilayani GAS)
 *
 *   Body: { "action": "apiSave", "token": "…", "args": ["Kelas", [ {...} ]] }
 *   Dieksekusi sebagai: apiSave(token, "Kelas", [ {...} ])
 *
 * KONTRAK RESPONS (selalu)
 *   { "success": true|false, "data": …|null, "message": "…" }
 *
 * KEAMANAN
 *   • Hanya action yang terdaftar di ACTION_WHITELIST yang boleh dipanggil.
 *     Nama fungsi sembarang dari klien TIDAK PERNAH dieksekusi.
 *   • Token sesi tidak pernah diterima lewat URL (query string) — hanya body
 *     POST — sehingga tidak bocor ke log server, history, maupun header Referer.
 *   • Setiap fungsi tetap memvalidasi sesinya sendiri via requireSession().
 */

/**
 * Daftar putih aksi yang boleh dipanggil dari frontend.
 * Menambah fitur baru = tambahkan nama fungsinya di sini. Fungsi yang tidak
 * terdaftar tetap ada di backend namun tidak dapat dijangkau dari internet.
 */
const ACTION_WHITELIST = [
  /* --- Autentikasi & sesi (Kode.gs) --- */
  'doLogin',
  'doLogout',
  'getInitialAppData',
  'apiChangePassword',
  'apiResetPassword',

  /* --- Mesin CRUD generik (Kode.gs) --- */
  'apiList',
  'apiSave',
  'apiDelete',

  /* --- Berkas & profil (Modul.gs) --- */
  'apiGetFileBase64',
  'apiUploadLogo',
  'apiUploadFotoProfil',

  /* --- Materi & tugas (Modul.gs) --- */
  'apiSimpanMateri',
  'apiSimpanTugas',
  'apiKumpulkanTugas',
  'apiNilaiPengumpulanBatch',

  /* --- Absensi (Modul.gs) --- */
  'apiAbsensiMandiri',
  'apiAbsensiManualBatch',
  'apiAbsensiGeo',
  'apiBuatSesiBarcode',
  'apiAbsensiBarcode',

  /* --- Penilaian & validasi berjenjang (Modul.gs) --- */
  'apiSimpanNilaiBatch',
  'apiSubmitNilaiValidasi',
  'apiVervalNilai',
  'apiGetRekapNilai',
  'apiGetKomponenNilai',
  'apiSimpanKomponenNilai',
  'apiKelolaRemedial',
  'apiTranskripPDF',

  /* --- Rekam & resume pertemuan (Modul.gs) --- */
  'apiPratinjauRingkasan',
  'apiSimpanResumePertemuan',
  'apiGetResume',
  'apiUnduhResume',

  /* --- Keuangan (Modul.gs) --- */
  'apiTerbitkanTagihan',
  'apiHitungPenerimaTagihan',
  'apiTandaiLunasSPP',

  /* --- Jadwal, laporan, impor, notifikasi (Modul.gs) --- */
  'apiCekKonflikJadwal',
  'apiLaporan',
  'apiRefresh',
  'apiSpekImpor',
  'apiImportData',
  'apiBroadcast',
  'apiTesNotifikasi'
];

/**
 * Aksi yang boleh dipanggil TANPA token sesi.
 * Sengaja hanya login — sisanya wajib terautentikasi.
 */
const ACTION_TANPA_TOKEN = ['doLogin'];


/**
 * ENDPOINT GET — publik, tanpa token.
 * Dipakai frontend untuk memeriksa apakah URL API sudah benar & sudah
 * di-deploy ulang, sebelum pengguna repot mencoba login.
 *
 *   GET  …/exec?action=ping
 *   GET  …/exec              (sama dengan ping)
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'ping';

    if (action === 'ping' || action === 'info') {
      return jsonOut(createResponse(true, {
        app:       APP_NAME,
        versi:     APP_VERSION,
        tagline:   APP_TAGLINE,
        arsitektur: 'GAS REST API + Frontend statis',
        siap:      sudahDisetup(),
        waktu:     new Date().toISOString()
      }, 'API EduPortal aktif.'));
    }

    /* Semua aksi lain wajib lewat POST agar token tidak pernah masuk URL. */
    return jsonOut(createResponse(false, null,
      'Gunakan metode POST untuk aksi "' + action + '". Endpoint GET hanya melayani ping.'));

  } catch (error) {
    return jsonOut(createResponse(false, null, 'Kesalahan server: ' + error.message));
  }
}

/**
 * ENDPOINT POST — seluruh aksi aplikasi.
 * Seluruh galat ditangkap di sini sehingga frontend SELALU menerima JSON
 * yang bisa diurai, tidak pernah halaman HTML error milik Google.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut(createResponse(false, null, 'Permintaan kosong: tidak ada body JSON.'));
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOut(createResponse(false, null, 'Body permintaan bukan JSON yang sah.'));
    }

    const action = String(payload.action || '');
    const token  = payload.token || '';
    const args   = Object.prototype.toString.call(payload.args) === '[object Array]'
                   ? payload.args : [];

    return jsonOut(handleRequest(action, token, args));

  } catch (error) {
    return jsonOut(createResponse(false, null, 'Kesalahan server: ' + error.message));
  }
}

/**
 * Router terpusat: memvalidasi aksi, memanggil fungsinya, lalu menormalkan
 * hasilnya. Ini satu-satunya tempat yang perlu diubah bila kontrak API berubah.
 *
 * @param  {string} action  Nama fungsi backend (wajib ada di ACTION_WHITELIST)
 * @param  {string} token   Token sesi (kosong hanya untuk doLogin)
 * @param  {Array}  args    Argumen SETELAH token
 * @return {Object}         {success, data, message}
 */
function handleRequest(action, token, args) {
  /* 1. Aksi wajib terdaftar — tidak pernah memanggil nama fungsi sembarangan. */
  if (!action) {
    return createResponse(false, null, 'Parameter "action" wajib diisi.');
  }
  if (ACTION_WHITELIST.indexOf(action) === -1) {
    return createResponse(false, null, 'Aksi tidak dikenal: ' + action);
  }

  /* 2. Fungsi harus benar-benar ada di lingkup global (Kode.gs / Modul.gs). */
  const fn = globalThis[action];
  if (typeof fn !== 'function') {
    return createResponse(false, null,
      'Fungsi "' + action + '" tidak ditemukan di backend. Pastikan Modul.gs sudah ditempel lengkap.');
  }

  /* 3. Aksi terautentikasi wajib membawa token. Ditolak lebih awal agar
        frontend langsung tahu harus menampilkan layar login. */
  if (ACTION_TANPA_TOKEN.indexOf(action) === -1 && !token) {
    return createResponse(false, { sessionExpired: true },
      'Sesi tidak ditemukan. Silakan masuk kembali.');
  }

  /* 4. Susun argumen. doLogin(email, password) tidak menerima token,
        seluruh fungsi lain bersignature (token, ...args). */
  const argumen = (ACTION_TANPA_TOKEN.indexOf(action) !== -1)
    ? args.slice()
    : [token].concat(args);

  /* 5. Eksekusi. */
  let hasil;
  try {
    hasil = fn.apply(null, argumen);
  } catch (error) {
    /* requireSession() melempar SESSION_EXPIRED — diterjemahkan jadi sinyal
       terstruktur agar frontend memunculkan layar login, bukan toast merah. */
    if (String(error.message).indexOf('SESSION_EXPIRED') !== -1) {
      return createResponse(false, { sessionExpired: true },
        'Sesi Anda berakhir. Silakan masuk kembali.');
    }
    return createResponse(false, null, error.message || 'Terjadi kesalahan pada server.');
  }

  /* 6. Normalisasi respons. */
  if (hasil === undefined || hasil === null) {
    return createResponse(true, null, 'Selesai.');
  }
  if (typeof hasil !== 'object' || !('success' in hasil)) {
    /* Fungsi lama yang mengembalikan nilai mentah tetap dilayani. */
    return createResponse(true, hasil, 'OK');
  }

  /* Beberapa fungsi menangkap SESSION_EXPIRED di try-catch-nya sendiri dan
     meneruskannya sebagai pesan biasa. Diseragamkan di sini agar SELURUH
     36 aksi berperilaku sama terhadap sesi kedaluwarsa. */
  if (!hasil.success && String(hasil.message || '').indexOf('SESSION_EXPIRED') !== -1) {
    return createResponse(false, { sessionExpired: true },
      'Sesi Anda berakhir. Silakan masuk kembali.');
  }

  return hasil;
}

/** Bungkus objek menjadi respons HTTP JSON. */
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Apakah setupAppEnvironment() sudah pernah dijalankan? Dipakai endpoint ping. */
function sudahDisetup() {
  try {
    return !!PropertiesService.getScriptProperties().getProperty(PROP_SPREADSHEET_ID);
  } catch (err) {
    return false;
  }
}


/* ========================================================================== */
/* 3. AKSES SPREADSHEET & DRIVE                                               */
/* ========================================================================== */

function getSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SPREADSHEET_ID);
  if (!id) throw new Error('Aplikasi belum di-setup. Jalankan fungsi setupAppEnvironment() terlebih dahulu.');
  return SpreadsheetApp.openById(id);
}

function getRootFolder() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_ROOT_FOLDER_ID);
  if (!id) throw new Error('Folder Drive belum di-setup. Jalankan setupAppEnvironment().');
  return DriveApp.getFolderById(id);
}

/** Ambil (atau buat) sub-folder di dalam folder induk. */
function getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** Ambil (atau buat) sheet beserta header-nya. */
function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
         .setFontWeight('bold')
         .setBackground('#022448')
         .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  terapkanFormatTeks(sheet, name);
  return sheet;
}

/**
 * Memaksa kolom sensitif menjadi format TEKS ('@') pada seluruh baris sheet.
 * Tanpa ini Google Sheets mengubah "087818485253" menjadi angka 87818485253.
 */
function terapkanFormatTeks(sheet, sheetName) {
  const kolom = KOLOM_TEKS[sheetName];
  if (!kolom || !kolom.length) return;
  const headers = SHEET_SCHEMA[sheetName];
  const maxRow = Math.max(sheet.getMaxRows(), 1000);
  kolom.forEach(function (k) {
    const idx = headers.indexOf(k);
    if (idx === -1) return;
    try { sheet.getRange(2, idx + 1, maxRow - 1, 1).setNumberFormat('@'); } catch (err) {}
  });
}


/* ========================================================================== */
/* 4. AUTO-SETUP ENVIRONMENT                                                  */
/* ========================================================================== */

/**
 * ⚙️ JALANKAN FUNGSI INI SEKALI SETELAH MENYALIN KODE.
 * Membuat: Folder Drive + sub-folder, Spreadsheet + 24 sheet + header,
 * data contoh, dan akun Super Admin default.
 */
function setupAppEnvironment() {
  const props = PropertiesService.getScriptProperties();

  /* --- 4.1 Folder Drive --- */
  let rootFolder;
  const existingFolderId = props.getProperty(PROP_ROOT_FOLDER_ID);
  if (existingFolderId) {
    try { rootFolder = DriveApp.getFolderById(existingFolderId); } catch (err) { rootFolder = null; }
  }
  if (!rootFolder) {
    rootFolder = DriveApp.createFolder('LMS_EduPortal');
    props.setProperty(PROP_ROOT_FOLDER_ID, rootFolder.getId());
  }
  ['Materi', 'Tugas_Pengumpulan', 'Bukti_Absensi', 'Bukti_SPP', 'Resume_Pertemuan', 'Transkrip']
    .forEach(function (n) { getOrCreateFolder(rootFolder, n); });

  /* --- 4.2 Spreadsheet --- */
  let ss;
  const existingSsId = props.getProperty(PROP_SPREADSHEET_ID);
  if (existingSsId) {
    try { ss = SpreadsheetApp.openById(existingSsId); } catch (err) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('DB_' + APP_NAME);
    props.setProperty(PROP_SPREADSHEET_ID, ss.getId());
    // Pindahkan file DB ke folder aplikasi
    try {
      const file = DriveApp.getFileById(ss.getId());
      rootFolder.addFile(file);
      DriveApp.getRootFolder().removeFile(file);
    } catch (err) { Logger.log('Pindah file DB dilewati: ' + err.message); }
  }

  /* --- 4.3 Buat semua sheet + migrasi kolom baru pada instalasi lama --- */
  Object.keys(SHEET_SCHEMA).forEach(function (name) {
    const sheet = getOrCreateSheet(ss, name, SHEET_SCHEMA[name]);
    migrasiHeader(sheet, name);
  });
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);

  /* --- 4.4 Data awal (hanya jika masih kosong) --- */
  seedInitialData(ss);

  /* --- 4.5 Bersihkan cache & log hasil --- */
  CacheService.getScriptCache().removeAll(Object.keys(SHEET_SCHEMA).map(cacheKeyFor));

  const info =
    '\n============================================================\n' +
    '✅ SETUP ' + APP_NAME + ' BERHASIL\n' +
    '============================================================\n' +
    '📊 Spreadsheet : ' + ss.getUrl() + '\n' +
    '📁 Folder Drive: ' + rootFolder.getUrl() + '\n' +
    '------------------------------------------------------------\n' +
    '🔑 AKUN DEFAULT (WAJIB DIGANTI SETELAH LOGIN PERTAMA):\n' +
    '   Super Admin  : admin@eduportal.id      / admin123\n' +
    '   Tim Akademik : akademik@eduportal.id   / akademik123\n' +
    '   Dosen/Guru   : dosen@eduportal.id      / dosen123\n' +
    '   Siswa/Mhs    : siswa@eduportal.id      / siswa123\n' +
    '============================================================\n';
  Logger.log(info);
  return info;
}

/**
 * MIGRASI AMAN — menyelaraskan header sheet lama dengan skema terbaru.
 * Kolom yang belum ada ditambahkan di posisi yang benar tanpa merusak data
 * yang sudah terisi, sehingga setupAppEnvironment() boleh dijalankan ulang
 * setelah aplikasi di-upgrade.
 */
function migrasiHeader(sheet, sheetName) {
  const target = SHEET_SCHEMA[sheetName];
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const sekarang = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
                        .filter(function (h) { return h !== ''; });
  if (!sekarang.length) {
    sheet.getRange(1, 1, 1, target.length).setValues([target]);
    return 0;
  }
  const kurang = target.filter(function (h) { return sekarang.indexOf(h) === -1; });
  if (!kurang.length) return 0;

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const dataLama = sheet.getRange(1, 1, lastRow, sekarang.length).getValues();
  const petaLama = {};
  sekarang.forEach(function (h, i) { petaLama[h] = i; });

  /* Susun ulang seluruh isi mengikuti urutan kolom skema terbaru */
  const baru = [target];
  for (let r = 1; r < dataLama.length; r++) {
    baru.push(target.map(function (h) {
      return petaLama[h] !== undefined ? dataLama[r][petaLama[h]] : '';
    }));
  }
  sheet.clear();
  sheet.getRange(1, 1, baru.length, target.length).setValues(baru);
  sheet.getRange(1, 1, 1, target.length)
       .setFontWeight('bold').setBackground('#022448').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  terapkanFormatTeks(sheet, sheetName);
  Logger.log('Migrasi ' + sheetName + ': +' + kurang.length + ' kolom (' + kurang.join(', ') + ')');
  return kurang.length;
}

/** Mengisi data contoh agar aplikasi langsung bisa dicoba. */
function seedInitialData(ss) {
  const now = new Date();

  /* Institusi */
  const inst = ss.getSheetByName('Institusi');
  if (inst.getLastRow() < 2) {
    appendRows(inst, 'Institusi', [{
      ID: generateUUID(), NamaInstitusi: 'EduPortal Academy', Jenjang: 'Perguruan Tinggi',
      LogoURL: '', Alamat: 'Jl. Pendidikan No. 1', Email: 'info@eduportal.id', Telepon: '0800-1234',
      TahunAjaran: '2026/2027', SemesterAktif: 'Ganjil',
      FiturSPP: 'TRUE', FiturBarcode: 'TRUE', FiturGeo: 'TRUE',
      GeoLat: '-6.200000', GeoLng: '106.816666', GeoRadius: '150',
      WAGatewayURL: 'https://api.fonnte.com/send', WAGatewayToken: '',
      NotifEmail: 'TRUE', NotifWA: 'FALSE', KKM: '70', URLPerekam: '', UpdatedAt: now
    }]);
  }

  /* Periode akademik (sumber dropdown Tahun & Tahun Ajaran) */
  const periode = ss.getSheetByName('Periode');
  if (periode.getLastRow() < 2) {
    appendRows(periode, 'Periode', [
      { ID: generateUUID(), Kode: '2026-1', Tahun: '2026', TahunAjaran: '2026/2027', Semester: 'Ganjil',
        TanggalMulai: '2026-08-01', TanggalSelesai: '2026-12-31', Status: 'Aktif',
        Keterangan: 'Periode berjalan', CreatedAt: now },
      { ID: generateUUID(), Kode: '2026-2', Tahun: '2027', TahunAjaran: '2026/2027', Semester: 'Genap',
        TanggalMulai: '2027-01-05', TanggalSelesai: '2027-06-30', Status: 'Nonaktif',
        Keterangan: '', CreatedAt: now },
      { ID: generateUUID(), Kode: '2025-2', Tahun: '2025', TahunAjaran: '2025/2026', Semester: 'Genap',
        TanggalMulai: '2026-01-05', TanggalSelesai: '2026-06-30', Status: 'Nonaktif',
        Keterangan: 'Arsip', CreatedAt: now }
    ]);
  }

  /* Master jenis tagihan */
  const jenisTagihan = ss.getSheetByName('Jenis_Tagihan');
  if (jenisTagihan.getLastRow() < 2) {
    appendRows(jenisTagihan, 'Jenis_Tagihan', [
      { ID: generateUUID(), Kode: 'SPP', Nama: 'SPP Bulanan', NominalDefault: 500000, Periodik: 'TRUE',
        Keterangan: 'Iuran rutin bulanan', Status: 'Aktif', CreatedAt: now },
      { ID: generateUUID(), Kode: 'GEDUNG', Nama: 'Uang Gedung', NominalDefault: 2500000, Periodik: 'FALSE',
        Keterangan: 'Dibayar sekali saat masuk', Status: 'Aktif', CreatedAt: now },
      { ID: generateUUID(), Kode: 'PRAK', Nama: 'Biaya Praktikum', NominalDefault: 350000, Periodik: 'FALSE',
        Keterangan: 'Per semester', Status: 'Aktif', CreatedAt: now },
      { ID: generateUUID(), Kode: 'UJIAN', Nama: 'Biaya Ujian', NominalDefault: 200000, Periodik: 'FALSE',
        Keterangan: 'UTS/UAS', Status: 'Aktif', CreatedAt: now },
      { ID: generateUUID(), Kode: 'WISUDA', Nama: 'Biaya Wisuda', NominalDefault: 1500000, Periodik: 'FALSE',
        Keterangan: 'Tingkat akhir', Status: 'Aktif', CreatedAt: now }
    ]);
  }

  /* Isi awal Pusat Bantuan */
  const bantuan = ss.getSheetByName('Bantuan');
  if (bantuan.getLastRow() < 2) {
    appendRows(bantuan, 'Bantuan', seedBantuan(now));
  }

  /* Pengguna default */
  const users = ss.getSheetByName('Pengguna');
  if (users.getLastRow() < 2) {
    const seedUsers = [
      { Nama: 'Administrator',  Email: 'admin@eduportal.id',    Peran: 'Super Admin',   Pass: 'admin123' },
      { Nama: 'Tim Akademik',   Email: 'akademik@eduportal.id', Peran: 'Tim Akademik',  Pass: 'akademik123' },
      { Nama: 'Dr. Ahmad Sanusi',Email: 'dosen@eduportal.id',   Peran: 'Dosen',         Pass: 'dosen123' },
      { Nama: 'Rani Pratiwi',   Email: 'siswa@eduportal.id',    Peran: 'Siswa',         Pass: 'siswa123' }
    ];
    const userRows = seedUsers.map(function (u) {
      return {
        ID: generateUUID(), Nama: u.Nama, Email: u.Email, NoHP: '',
        Peran: u.Peran, PasswordHash: hashPassword(u.Pass), Status: 'Aktif',
        FotoURL: '', LastLogin: '', CreatedAt: now
      };
    });
    appendRows(users, 'Pengguna', userRows);

    /* Profil turunan Dosen & Siswa */
    const jurusanId = generateUUID();
    appendRows(ss.getSheetByName('Jurusan_Prodi'), 'Jurusan_Prodi', [{
      ID: jurusanId, Kode: 'TI', Nama: 'Teknik Informatika', Jenjang: 'S1',
      Keterangan: 'Program studi contoh', Status: 'Aktif', CreatedAt: now
    }]);

    const kurikulumId = generateUUID();
    appendRows(ss.getSheetByName('Kurikulum'), 'Kurikulum', [{
      ID: kurikulumId, Kode: 'KUR-2026', Nama: 'Kurikulum Merdeka 2026',
      TahunBerlaku: '2026', JurusanID: jurusanId, Keterangan: '', Status: 'Aktif', CreatedAt: now
    }]);

    const mapelIds = [generateUUID(), generateUUID(), generateUUID()];
    appendRows(ss.getSheetByName('Mata_Pelajaran'), 'Mata_Pelajaran', [
      { ID: mapelIds[0], Kode: 'MAT-401', Nama: 'Kalkulus Lanjut', SKS: 4, KurikulumID: kurikulumId,
        JurusanID: jurusanId, Jenjang: 'S1', Kategori: 'Wajib', Deskripsi: 'Limit, turunan, integral', Status: 'Aktif', CreatedAt: now },
      { ID: mapelIds[1], Kode: 'CS-201', Nama: 'Struktur Data & Algoritma', SKS: 4, KurikulumID: kurikulumId,
        JurusanID: jurusanId, Jenjang: 'S1', Kategori: 'Wajib', Deskripsi: '', Status: 'Aktif', CreatedAt: now },
      { ID: mapelIds[2], Kode: 'LIT-305', Nama: 'Studi Literatur Kontemporer', SKS: 3, KurikulumID: kurikulumId,
        JurusanID: jurusanId, Jenjang: 'S1', Kategori: 'Pilihan', Deskripsi: '', Status: 'Aktif', CreatedAt: now }
    ]);

    const dosenPenggunaId = userRows[2].ID;
    const dosenId = generateUUID();
    appendRows(ss.getSheetByName('Dosen_Guru'), 'Dosen_Guru', [{
      ID: dosenId, PenggunaID: dosenPenggunaId, NIDN: '0011223344', Nama: 'Dr. Ahmad Sanusi',
      Email: 'dosen@eduportal.id', NoHP: '', JurusanID: jurusanId, Gelar: 'S.Kom., M.Kom., Ph.D',
      Alamat: '', FotoURL: '', Status: 'Aktif', CreatedAt: now
    }]);

    const kelasId = generateUUID();
    appendRows(ss.getSheetByName('Kelas'), 'Kelas', [{
      ID: kelasId, Kode: 'TI-2026-A', Nama: 'TI Angkatan 2026 Kelas A', JurusanID: jurusanId,
      Angkatan: '2026', WaliKelasID: dosenId, Ruangan: 'Ruang 302', Kapasitas: 40,
      Status: 'Aktif', CreatedAt: now
    }]);

    const siswaId = generateUUID();
    appendRows(ss.getSheetByName('Siswa_Mahasiswa'), 'Siswa_Mahasiswa', [{
      ID: siswaId, PenggunaID: userRows[3].ID, NIM: '2026010001', Nama: 'Rani Pratiwi',
      Email: 'siswa@eduportal.id', NoHP: '', KelasID: kelasId, JurusanID: jurusanId,
      Angkatan: '2026', JenisKelamin: 'Perempuan', TanggalLahir: '', Alamat: '',
      NamaWali: '', NoHPWali: '', FotoURL: '', IsKetuaKelas: 'TRUE', Status: 'Aktif', CreatedAt: now
    }]);

    /* Program kelas, jadwal, enrollment contoh */
    const progRows = mapelIds.map(function (mid) {
      return { ID: generateUUID(), KelasID: kelasId, MapelID: mid, DosenID: dosenId,
               Semester: '1', TahunAjaran: '2026/2027', Status: 'Aktif', CreatedAt: now };
    });
    appendRows(ss.getSheetByName('Program_Kelas'), 'Program_Kelas', progRows);

    const hari = ['Senin', 'Rabu', 'Kamis'];
    const jam  = [['08:00','09:30'], ['10:00','11:30'], ['13:00','14:30']];
    const jadwalRows = mapelIds.map(function (mid, i) {
      return { ID: generateUUID(), Hari: hari[i], JamMulai: jam[i][0], JamSelesai: jam[i][1],
               MapelID: mid, KelasID: kelasId, Ruangan: 'Ruang ' + (301 + i), DosenID: dosenId,
               Semester: '1', TahunAjaran: '2026/2027', Status: 'Aktif', CreatedAt: now };
    });
    appendRows(ss.getSheetByName('Jadwal'), 'Jadwal', jadwalRows);

    const enrollRows = mapelIds.map(function (mid) {
      return { ID: generateUUID(), SiswaID: siswaId, KelasID: kelasId, MapelID: mid,
               Semester: '1', TahunAjaran: '2026/2027', Status: 'Aktif', CreatedAt: now };
    });
    appendRows(ss.getSheetByName('Enrollment'), 'Enrollment', enrollRows);
  }
}


/**
 * Isi awal Pusat Bantuan — mencakup seluruh modul aplikasi serta masalah yang
 * paling sering muncul di lapangan. Seluruh entri dapat ditambah/diubah/dihapus
 * Super Admin melalui menu Pusat Bantuan.
 */
function seedBantuan(now) {
  const R = [
    ['Memulai', 'Bagaimana cara masuk ke portal untuk pertama kali?',
     'Gunakan email yang didaftarkan Super Admin sebagai nama pengguna. Kata sandi awal untuk akun Dosen dan Mahasiswa yang dibuat otomatis adalah 123. Segera ganti melalui menu Profil Saya → Keamanan setelah berhasil masuk.', 'Semua'],
    ['Memulai', 'Saya lupa kata sandi, apa yang harus dilakukan?',
     'Hubungi Super Admin institusi Anda. Super Admin dapat mereset kata sandi Anda melalui menu Pengguna → ikon gembok pada baris akun Anda. Sistem tidak mengirim tautan reset otomatis demi keamanan.', 'Semua'],
    ['Memulai', 'Akun saya terkunci setelah salah memasukkan kata sandi.',
     'Demi keamanan, akun terkunci sementara selama 15 menit setelah 3 kali percobaan gagal. Tunggu 15 menit lalu coba lagi, atau minta Super Admin mereset kata sandi Anda.', 'Semua'],
    ['Memulai', 'Kenapa menu yang saya lihat berbeda dengan teman saya?',
     'Menu ditentukan oleh peran akun: Super Admin, Tim Akademik, Dosen/Guru, atau Siswa/Mahasiswa. Beberapa menu juga hanya muncul bila fiturnya diaktifkan Super Admin, misalnya SPP, absensi QR, dan absensi GPS.', 'Semua'],
    ['Memulai', 'Bagaimana mengganti tampilan menjadi mode gelap?',
     'Klik ikon bulan di pojok kanan atas, atau buka Profil Saya → Ganti Mode Terang/Gelap. Pilihan Anda tersimpan di perangkat ini.', 'Semua'],

    ['Data Master', 'Urutan pengisian data master yang benar seperti apa?',
     'Ikuti urutan ini agar tidak ada relasi yang kosong: Periode → Jurusan/Prodi → Kurikulum → Mata Pelajaran → Kelas → Dosen/Guru → Program Kelas → Siswa/Mahasiswa → Jadwal. Program Kelas adalah kuncinya karena menentukan dosen mana mengampu mata pelajaran apa di kelas mana.', 'Super Admin'],
    ['Data Master', 'Kenapa dashboard dosen kosong padahal datanya sudah diisi?',
     'Dosen hanya melihat kelas yang tercatat di Program Kelas atas namanya. Buka Data Master → Program Kelas, lalu pastikan ada baris yang memasangkan Kelas + Mata Pelajaran + Dosen tersebut. Pastikan juga data Dosen sudah terhubung ke akun login pada kolom Akun Login Terkait.', 'Super Admin'],
    ['Data Master', 'Bagaimana mengatur Tahun Ajaran dan Semester aktif?',
     'Buka Data Master → tab Periode. Tambahkan periode lalu ubah statusnya menjadi Aktif. Sistem hanya mengizinkan satu periode aktif; periode lain otomatis dinonaktifkan. Seluruh dropdown Tahun Ajaran di aplikasi mengambil datanya dari sini.', 'Super Admin'],
    ['Data Master', 'Apakah data bisa dihapus permanen?',
     'Ya, tombol hapus menghilangkan baris dari Google Sheets secara permanen. Untuk data yang masih dipakai riwayat akademik, sebaiknya ubah statusnya menjadi Nonaktif alih-alih menghapusnya.', 'Super Admin'],

    ['Impor Excel', 'Bagaimana cara mengimpor data dalam jumlah banyak?',
     'Pada halaman Data Master, Siswa/Mahasiswa, atau Jadwal, klik tombol Impor Excel. Unduh dulu templatnya, isi sesuai kolom yang tersedia, lalu unggah kembali. Sistem menampilkan pratinjau dan daftar kesalahan sebelum data benar-benar disimpan.', 'Super Admin'],
    ['Impor Excel', 'Format file apa saja yang didukung untuk impor?',
     'File Excel (.xlsx, .xls) dan CSV (.csv). Baris pertama wajib berisi nama kolom persis seperti pada templat. Baris kosong diabaikan secara otomatis.', 'Super Admin'],
    ['Impor Excel', 'Kolom relasi seperti Kelas dan Jurusan diisi apa?',
     'Isi dengan KODE-nya, bukan nama panjang. Contoh: kolom KodeKelas diisi TI-2026-A, kolom KodeJurusan diisi TI, kolom KodeMapel diisi MAT-401. Sistem mencocokkannya otomatis. Kode yang tidak ditemukan akan dilaporkan sebagai kesalahan pada pratinjau.', 'Super Admin'],
    ['Impor Excel', 'Apa yang terjadi bila ada data ganda saat impor?',
     'Sistem mencocokkan berdasarkan kode unik (NIM untuk siswa, NIDN untuk dosen, Kode untuk mata pelajaran dan kelas). Data yang sudah ada akan diperbarui, bukan diduplikasi.', 'Super Admin'],
    ['Impor Excel', 'Nomor WA dan NIM saya kehilangan angka 0 di depan.',
     'Kolom-kolom tersebut sudah dipaksa berformat teks oleh sistem, sehingga 087818485253 tersimpan lengkap. Bila Anda mengedit langsung di Google Sheets, pastikan format selnya Teks Biasa (Plain text), bukan Angka.', 'Super Admin'],

    ['Akun & Profil', 'Apakah akun Dosen dan Mahasiswa harus dibuat manual?',
     'Tidak. Begitu data Dosen atau Siswa/Mahasiswa disimpan (manual maupun impor Excel), akun portalnya dibuat otomatis dengan nama pengguna berupa email dan kata sandi awal 123. Bila data dihapus, akunnya ikut terhapus.', 'Super Admin'],
    ['Akun & Profil', 'Bagaimana mengunggah foto profil saya?',
     'Buka Profil Saya → klik area foto atau tombol Ubah Foto → pilih gambar (JPG/PNG, maksimal 2MB). Foto langsung menjadi thumbnail avatar Anda di seluruh aplikasi.', 'Semua'],
    ['Akun & Profil', 'Nomor WhatsApp saya harus diisi di berapa tempat?',
     'Cukup satu kali. Nomor yang diisi pada data Dosen/Siswa otomatis tersalin ke akun penggunanya, begitu pula sebaliknya. Nomor disimpan dalam format lokal berawalan 0.', 'Semua'],
    ['Akun & Profil', 'Bagaimana mengganti logo institusi?',
     'Buka Pengaturan → bagian Identitas Institusi → klik Unggah Logo, pilih gambar PNG/JPG maksimal 2MB. Logo langsung tampil di sidebar dan pada dokumen cetak seperti transkrip.', 'Super Admin'],

    ['Materi & Tugas', 'Format dan ukuran berkas apa yang boleh diunggah?',
     'PDF, DOC/DOCX, PPT/PPTX, JPG, dan PNG dengan ukuran maksimal 2MB per berkas. Untuk video, gunakan tautan YouTube — video akan tersemat langsung di portal siswa tanpa memakan ruang penyimpanan.', 'Semua'],
    ['Materi & Tugas', 'Bagaimana menyematkan video YouTube sebagai materi?',
     'Saat menambah materi, pilih Jenis Materi = YouTube, lalu tempel tautannya (format youtu.be maupun youtube.com/watch keduanya diterima). Sistem mengubahnya otomatis menjadi tautan sematan.', 'Dosen'],
    ['Materi & Tugas', 'Apakah siswa mendapat pemberitahuan saat materi atau tugas baru dibuat?',
     'Ya. Setiap materi dan tugas baru memicu notifikasi Email dan/atau WhatsApp ke seluruh siswa di kelas tersebut, sesuai kanal yang diaktifkan di Pengaturan.', 'Dosen'],
    ['Materi & Tugas', 'Siswa terlambat mengumpulkan tugas, apakah masih bisa?',
     'Bisa. Pengumpulan tetap diterima namun ditandai TERLAMBAT, dan dosen melihat penandanya pada rekap pengumpulan. Dosen berhak menentukan sendiri pengurangan nilainya.', 'Semua'],
    ['Materi & Tugas', 'Bisakah siswa mengganti berkas yang sudah dikumpulkan?',
     'Bisa, selama tugas masih terbuka. Pengumpulan baru menimpa yang lama sehingga tidak ada duplikat. Buka tugas tersebut lalu klik Lihat / Ubah.', 'Siswa'],

    ['Absensi', 'Kenapa tombol kirim absensi tidak aktif?',
     'Status Sakit dan Izin wajib dilampiri bukti berupa foto atau dokumen. Tombol kirim baru aktif setelah berkas dipilih. Status Hadir tidak memerlukan lampiran.', 'Siswa'],
    ['Absensi', 'Saya sudah absen tapi ingin mengubah statusnya.',
     'Absensi terkunci setelah dikirim untuk mencegah kecurangan. Hubungi dosen pengampu — dosen dapat mengoreksi absensi melalui menu Absensi Kelas.', 'Siswa'],
    ['Absensi', 'Absensi GPS saya ditolak padahal saya di kampus.',
     'Sistem membandingkan koordinat Anda dengan titik kampus beserta radius toleransi. Pastikan izin lokasi peramban aktif dan GPS menyala. Bila tetap ditolak, mintalah Super Admin menyesuaikan koordinat atau memperbesar radius di Pengaturan.', 'Siswa'],
    ['Absensi', 'Kode QR absensi tidak bisa dipindai.',
     'Kode sesi hanya berlaku 15 menit sejak dibuat. Minta dosen membuat kode baru. Bila kamera tidak terbuka, masukkan kode sesi secara manual pada kolom yang tersedia.', 'Siswa'],
    ['Absensi', 'Bagaimana dosen mengisi absensi satu kelas sekaligus?',
     'Buka menu Absensi → pilih kelas dan pertemuan → gunakan tombol Tandai Semua Hadir lalu ubah hanya siswa yang tidak hadir → Simpan Absensi. Seluruh baris tersimpan dalam satu operasi.', 'Dosen'],

    ['Penilaian', 'Bagaimana cara mengatur komponen dan bobot nilai?',
     'Pada halaman Input & Submit Nilai, klik Atur Bobot Komponen. Anda bebas menambah atau menghapus komponen (misalnya Kehadiran, Tugas, Kuis, Praktikum, UTS, UAS). Total seluruh bobot wajib tepat 100% — sistem menolak bila lebih atau kurang.', 'Dosen'],
    ['Penilaian', 'Bisakah saya mengirim nilai hanya untuk sebagian siswa?',
     'Bisa. Centang siswa yang ingin dikirim pada grid nilai lalu pilih Submit Terpilih. Kosongkan centang untuk mengirim satu kelas sekaligus. Tim Akademik juga dapat memvalidasi per siswa dengan cara yang sama.', 'Dosen'],
    ['Penilaian', 'Kenapa nilai tidak bisa saya ubah lagi?',
     'Nilai yang sudah divalidasi Tim Akademik terkunci otomatis. Minta Tim Akademik membuka kuncinya melalui menu Riwayat Validasi, lalu kirim ulang setelah direvisi.', 'Dosen'],
    ['Penilaian', 'Kapan nilai muncul di akun siswa?',
     'Setelah dosen menekan Submit untuk Validasi dan Tim Akademik menyelesaikan verval. Saat itu juga transkrip diperbarui dan siswa menerima notifikasi.', 'Semua'],
    ['Penilaian', 'Bagaimana remedial ditentukan?',
     'Saat nilai divalidasi, siswa dengan nilai akhir di bawah KKM otomatis diusulkan masuk daftar remedial. Tim Akademik dapat meninjau, mengubah status, dan mengisi nilai remedialnya di menu Remedial & Ulang.', 'Tim Akademik'],
    ['Penilaian', 'Bagaimana mengunduh transkrip nilai?',
     'Buka menu Nilai & Transkrip, pilih semester bila perlu, lalu klik Unduh Transkrip PDF. Berkas memuat identitas institusi, daftar nilai, total SKS, dan IPK.', 'Siswa'],

    ['Rekam Pertemuan', 'Peramban meminta izin mikrofon, bagaimana mengaktifkannya?',
     'Saat muncul permintaan izin, pilih Izinkan. Bila sudah terlanjur diblokir: di Chrome/Edge klik ikon gembok atau slider di kiri kolom alamat → Setelan situs → Mikrofon → Izinkan → muat ulang halaman. Di Android, buka Setelan → Aplikasi → Chrome → Izin → Mikrofon. Aplikasi menampilkan panduan bergambar ini setiap kali izin ditolak.', 'Semua'],
    ['Rekam Pertemuan', 'Siapa yang boleh merekam pertemuan?',
     'Dosen/Guru pengampu, serta Siswa/Mahasiswa yang ditandai sebagai Ketua Kelas oleh Super Admin pada data siswa.', 'Semua'],
    ['Rekam Pertemuan', 'Transkripsi tidak berjalan di peramban saya.',
     'Transkripsi otomatis memakai Web Speech API yang paling baik didukung Google Chrome dan Microsoft Edge terbaru. Pada peramban lain, Anda tetap dapat mengetik atau menempel transkrip melalui tombol Sunting Transkrip, lalu memakai fitur Rapikan & Ringkas seperti biasa.', 'Semua'],
    ['Rekam Pertemuan', 'Apa yang dihasilkan fitur Rapikan & Ringkas?',
     'Transkrip mentah dirapikan menjadi dokumen terstruktur berisi Poin-Poin Kunci, Uraian Pembahasan, Istilah & Kata Kunci, serta Tindak Lanjut. Hasilnya dapat disimpan sebagai materi resmi kelas dan diunduh dalam format PDF maupun DOCX.', 'Semua'],

    ['Keuangan', 'Apakah tagihan hanya bisa berupa SPP?',
     'Tidak. Super Admin dapat menambah jenis tagihan lain di Data Master → Jenis Tagihan, misalnya Uang Gedung, Praktikum, Ujian, atau Wisuda, lengkap dengan nominal bawaannya.', 'Super Admin'],
    ['Keuangan', 'Bagaimana menerbitkan tagihan untuk banyak mahasiswa sekaligus?',
     'Buka Manajemen SPP → Terbitkan Tagihan → pilih jenis tagihan dan sasaran: seluruh mahasiswa, satu jurusan/prodi, satu kelas, atau mahasiswa tertentu yang dipilih manual. Sistem menampilkan jumlah penerima sebelum tagihan dikirim.', 'Super Admin'],
    ['Keuangan', 'Bagaimana menandai tagihan sudah lunas?',
     'Pada baris tagihan klik Tandai Lunas, unggah bukti transfer bila ada, lalu simpan. Status di akun mahasiswa langsung berubah menjadi Lunas beserta tanggal pembayarannya.', 'Super Admin'],

    ['Notifikasi', 'Kenapa notifikasi email tidak terkirim?',
     'Periksa tiga hal: notifikasi Email aktif di Pengaturan, kuota Gmail harian belum habis (±100 email/hari untuk akun personal, ±1.500 untuk Google Workspace), dan alamat email penerima terisi. Status setiap pengiriman tercatat di menu Notifikasi → Riwayat Pengiriman.', 'Super Admin'],
    ['Notifikasi', 'Bagaimana mengaktifkan notifikasi WhatsApp?',
     'Daftar ke penyedia WA Gateway (misalnya Fonnte), salin token API-nya ke Pengaturan → Notifikasi, aktifkan sakelar Notifikasi WhatsApp, lalu kirim Pesan Uji untuk memastikan konfigurasinya benar.', 'Super Admin'],

    ['Masalah Umum', 'Muncul pesan "Sesi berakhir, silakan masuk kembali".',
     'Sesi login berlaku 6 jam. Masuk kembali dengan akun Anda; pekerjaan yang sudah tersimpan tidak hilang.', 'Semua'],
    ['Masalah Umum', 'Data yang baru saya simpan belum muncul.',
     'Sistem memakai cache untuk mempercepat tampilan. Klik tombol Segarkan pada dashboard, atau muat ulang halaman. Bila tetap tidak muncul, periksa apakah proses simpan menampilkan pesan hijau berhasil.', 'Semua'],
    ['Masalah Umum', 'Halaman terasa lambat saat pertama dibuka.',
     'Pemuatan pertama mengambil seluruh data master sekaligus agar perpindahan menu setelahnya menjadi instan. Super Admin dapat memasang pemicu terjadwal warmupCache agar cache selalu hangat.', 'Semua'],
    ['Masalah Umum', 'Aplikasi tidak tampil sempurna di ponsel.',
     'Gunakan peramban terbaru dan mode potret. Sidebar berubah menjadi menu hamburger di layar kecil; tabel lebar dapat digeser ke samping.', 'Semua']
  ];
  return R.map(function (r, i) {
    return { ID: generateUUID(), Kategori: r[0], Pertanyaan: r[1], Jawaban: r[2],
             Peran: r[3], Urutan: i + 1, Status: 'Aktif', UpdatedAt: now };
  });
}


/* ========================================================================== */
/* 5. HELPER UMUM                                                             */
/* ========================================================================== */

function generateUUID() {
  return Utilities.getUuid();
}

/**
 * Bentuk respons standar untuk SEMUA fungsi publik.
 *
 * PENTING: seluruh payload harus lolos JSON.stringify() sebelum dikirim sebagai
 * respons HTTP. Objek Date, undefined, dan nilai non-primitif akan hilang atau
 * berubah bentuk tanpa peringatan. Karena itu setiap payload diserialisasi dulu
 * di sini lewat serialisasiAman() — Date menjadi ISO string, undefined dibuang.
 */
function createResponse(success, data, message) {
  return {
    success: !!success,
    data: data === undefined ? null : serialisasiAman(data),
    message: message || ''
  };
}

/** Ubah Date → ISO string, buang undefined/fungsi, rekursif untuk objek & array. */
function serialisasiAman(v, kedalaman) {
  const d = kedalaman || 0;
  if (d > 8) return null;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return v;
  if (t === 'function') return null;
  if (Object.prototype.toString.call(v) === '[object Array]') {
    return v.map(function (x) { return serialisasiAman(x, d + 1); });
  }
  if (t === 'object') {
    const out = {};
    Object.keys(v).forEach(function (k) {
      const nilai = serialisasiAman(v[k], d + 1);
      if (nilai !== undefined) out[k] = nilai;
    });
    return out;
  }
  return String(v);
}

/**
 * Normalisasi nomor WhatsApp untuk DISIMPAN: selalu format lokal berawalan 0.
 * "6287818485253" / "+62 878-1848-5253" / 87818485253 → "087818485253"
 */
function normalisasiHPSimpan(no) {
  if (no === undefined || no === null || no === '') return '';
  let n = String(no).replace(/[^0-9]/g, '');
  if (!n) return '';
  if (n.indexOf('62') === 0 && n.length > 10) n = '0' + n.substring(2);
  else if (n.charAt(0) !== '0') n = '0' + n;
  return n;
}

/** Hash password: SHA-256 + salt statis aplikasi. */
function hashPassword(plain) {
  const salted = String(plain) + '::eduportal-lms::v1';
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salted, Utilities.Charset.UTF_8);
  return raw.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function cacheKeyFor(sheetName) {
  return 'lms_cache_' + String(sheetName).toLowerCase();
}

/** Ubah nilai sel menjadi tipe yang aman dikirim ke client (Date → ISO string). */
function normalizeCell(v) {
  if (v instanceof Date) return v.toISOString();
  return v;
}

/**
 * BATCH READ — membaca seluruh sheet dalam SATU panggilan getValues(),
 * lalu memetakannya menjadi array of object. Tidak pernah loop getValue().
 */
function readSheetObjects(sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet "' + sheetName + '" tidak ditemukan.');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  const values  = sheet.getRange(1, 1, lastRow, lastCol).getValues(); // 1 API call
  const headers = values[0];
  const kolomTeks = KOLOM_TEKS[sheetName] || [];
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      let nilai = normalizeCell(values[r][c]);
      /* Pulihkan angka 0 di depan bila sel terlanjur tersimpan sebagai angka */
      if (kolomTeks.indexOf(headers[c]) !== -1 && typeof values[r][c] === 'number') {
        nilai = String(values[r][c]);
        if (headers[c].indexOf('NoHP') === 0 || headers[c] === 'Telepon') nilai = normalisasiHPSimpan(nilai);
      }
      obj[headers[c]] = nilai;
    }
    if (obj.ID !== '' || sheetName === 'AppConfig') out.push(obj);
  }
  return out;
}

/**
 * PRINSIP 3 — Baca data dengan CacheService.
 * Cache hit = milidetik; cache miss = 1x getValues() lalu disimpan.
 */
function getCachedData(sheetName, ttlSeconds) {
  const ttl = ttlSeconds || CACHE_TTL.SEMI;
  const cache = CacheService.getScriptCache();
  const key = cacheKeyFor(sheetName);
  try {
    const hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch (err) { /* cache korup → abaikan, baca ulang */ }

  const records = readSheetObjects(sheetName);
  try {
    const payload = JSON.stringify(records);
    if (payload.length < 95000) cache.put(key, payload, ttl); // batas ~100KB per key
  } catch (err) { Logger.log('Cache put gagal (' + sheetName + '): ' + err.message); }
  return records;
}

function invalidateCache(sheetName) {
  CacheService.getScriptCache().remove(cacheKeyFor(sheetName));
}

function invalidateCacheMultiple(names) {
  CacheService.getScriptCache().removeAll(names.map(cacheKeyFor));
}

/** Pemanasan cache seluruh master data (opsional, dipanggil manual). */
function warmupCache() {
  MASTER_SHEETS.forEach(function (n) {
    try { getCachedData(n, CACHE_TTL.MASTER); } catch (err) { Logger.log(n + ': ' + err.message); }
  });
  return createResponse(true, null, 'Cache master data dihangatkan.');
}

/**
 * BATCH WRITE — menulis N baris sekaligus dengan satu setValues().
 * @param {Sheet} sheet
 * @param {string} sheetName - untuk lookup header dari SHEET_SCHEMA
 * @param {Array<Object>} objects
 */
function appendRows(sheet, sheetName, objects) {
  if (!objects || !objects.length) return 0;
  const headers = SHEET_SCHEMA[sheetName];
  const rows = objects.map(function (o) {
    return headers.map(function (h) { return o[h] === undefined || o[h] === null ? '' : o[h]; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows); // 1 API call
  return rows.length;
}

/** Cari indeks baris (1-based di sheet) berdasarkan nilai kolom ID. */
function findRowIndexById(values, headers, id) {
  const idCol = headers.indexOf('ID');
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idCol]) === String(id)) return r; // index array
  }
  return -1;
}

function toBool(v) {
  return v === true || String(v).toUpperCase() === 'TRUE' || String(v) === '1' || String(v).toLowerCase() === 'ya';
}

function nowIso() { return new Date().toISOString(); }


/* ========================================================================== */
/* 6. AUTENTIKASI & SESI                                                      */
/* ========================================================================== */

/**
 * Login. Token dikembalikan ke client dan disimpan di variabel JavaScript
 * (AppState.sessionToken) — TIDAK PERNAH di URL.
 */
function doLogin(email, password) {
  try {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      return createResponse(false, null, 'Email dan kata sandi wajib diisi.');
    }

    /* Cek lockout */
    const cache = CacheService.getScriptCache();
    const failKey = 'login_fail_' + cleanEmail;
    const failCount = parseInt(cache.get(failKey) || '0', 10);
    if (failCount >= MAX_LOGIN_ATTEMPT) {
      return createResponse(false, { locked: true },
        'Akun terkunci sementara karena ' + MAX_LOGIN_ATTEMPT + ' kali gagal login. Coba lagi dalam 15 menit.');
    }

    const users = readSheetObjects('Pengguna');
    const user = users.filter(function (u) {
      return String(u.Email).trim().toLowerCase() === cleanEmail;
    })[0];

    if (!user || user.PasswordHash !== hashPassword(password)) {
      const nextFail = failCount + 1;
      cache.put(failKey, String(nextFail), LOCKOUT_DURATION_S);
      const sisa = MAX_LOGIN_ATTEMPT - nextFail;
      return createResponse(false, { attemptsLeft: Math.max(0, sisa) },
        sisa > 0
          ? 'Email atau kata sandi salah. Sisa ' + sisa + ' percobaan.'
          : 'Akun terkunci sementara selama 15 menit.');
    }

    if (String(user.Status).toLowerCase() !== 'aktif') {
      return createResponse(false, null, 'Akun Anda nonaktif. Hubungi Super Admin.');
    }

    cache.remove(failKey);

    /* Buat token sesi */
    const token = Utilities.base64EncodeWebSafe(generateUUID() + ':' + Date.now());
    const session = {
      token: token,
      userId: user.ID,
      nama: user.Nama,
      email: user.Email,
      peran: user.Peran,
      fotoURL: user.FotoURL || '',
      expiry: Date.now() + SESSION_TTL_MS
    };
    saveSession(session);
    touchLastLogin(user.ID);

    return createResponse(true, {
      token: token,
      user: { id: user.ID, nama: user.Nama, email: user.Email, peran: user.Peran, fotoURL: user.FotoURL || '' },
      landingPage: getLandingPage(user.Peran)
    }, 'Selamat datang, ' + user.Nama + '!');
  } catch (error) {
    return createResponse(false, null, 'Gagal login: ' + error.message);
  }
}

function getLandingPage(peran) {
  const map = {
    'Super Admin':  'admin-dashboard',
    'Tim Akademik': 'akademik-dashboard',
    'Dosen':        'dosen-dashboard',
    'Siswa':        'siswa-dashboard'
  };
  return map[peran] || 'siswa-dashboard';
}

function saveSession(session) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SESS_' + session.token, JSON.stringify(session));
  CacheService.getScriptCache().put('SESS_' + session.token, JSON.stringify(session), 21600);
}

/** Validasi token sesi. Mengembalikan objek sesi atau {valid:false}. */
function validateSession(token) {
  if (!token) return { valid: false };
  const key = 'SESS_' + token;
  let raw = CacheService.getScriptCache().get(key);
  if (!raw) raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return { valid: false };
  try {
    const s = JSON.parse(raw);
    if (!s.expiry || s.expiry < Date.now()) {
      PropertiesService.getScriptProperties().deleteProperty(key);
      CacheService.getScriptCache().remove(key);
      return { valid: false };
    }
    s.valid = true;
    return s;
  } catch (err) {
    return { valid: false };
  }
}

/** Guard: lempar error jika sesi tidak valid. Dipakai di semua API. */
function requireSession(token) {
  const s = validateSession(token);
  if (!s.valid) throw new Error('SESSION_EXPIRED');
  return s;
}

function doLogout(token) {
  try {
    PropertiesService.getScriptProperties().deleteProperty('SESS_' + token);
    CacheService.getScriptCache().remove('SESS_' + token);
    return createResponse(true, null, 'Anda telah keluar.');
  } catch (error) {
    return createResponse(true, null, 'Sesi dibersihkan.');
  }
}

function touchLastLogin(userId) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Pengguna');
    const headers = SHEET_SCHEMA['Pengguna'];
    const values = sheet.getRange(1, 1, sheet.getLastRow(), headers.length).getValues();
    const r = findRowIndexById(values, headers, userId);
    if (r > 0) {
      sheet.getRange(r + 1, headers.indexOf('LastLogin') + 1).setValue(new Date());
      invalidateCache('Pengguna');
    }
  } catch (err) { Logger.log('touchLastLogin: ' + err.message); }
}

/** Ganti kata sandi sendiri. */
function apiChangePassword(token, passwordLama, passwordBaru) {
  try {
    const sess = requireSession(token);
    if (!passwordBaru || String(passwordBaru).length < 6) {
      return createResponse(false, null, 'Kata sandi baru minimal 6 karakter.');
    }
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Pengguna');
    const headers = SHEET_SCHEMA['Pengguna'];
    const values = sheet.getRange(1, 1, sheet.getLastRow(), headers.length).getValues();
    const r = findRowIndexById(values, headers, sess.userId);
    if (r < 0) return createResponse(false, null, 'Pengguna tidak ditemukan.');

    const hashCol = headers.indexOf('PasswordHash');
    if (values[r][hashCol] !== hashPassword(passwordLama)) {
      return createResponse(false, null, 'Kata sandi lama tidak cocok.');
    }
    sheet.getRange(r + 1, hashCol + 1).setValue(hashPassword(passwordBaru));
    invalidateCache('Pengguna');
    return createResponse(true, null, 'Kata sandi berhasil diperbarui.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Reset kata sandi pengguna lain (khusus Super Admin). */
function apiResetPassword(token, penggunaId, passwordBaru) {
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Super Admin') return createResponse(false, null, 'Akses ditolak.');
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Pengguna');
    const headers = SHEET_SCHEMA['Pengguna'];
    const values = sheet.getRange(1, 1, sheet.getLastRow(), headers.length).getValues();
    const r = findRowIndexById(values, headers, penggunaId);
    if (r < 0) return createResponse(false, null, 'Pengguna tidak ditemukan.');
    sheet.getRange(r + 1, headers.indexOf('PasswordHash') + 1)
         .setValue(hashPassword(passwordBaru || 'lms12345'));
    invalidateCache('Pengguna');
    return createResponse(true, null, 'Kata sandi direset.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}


/* ========================================================================== */
/* 7. MESIN CRUD GENERIK + RBAC                                               */
/* ========================================================================== */

function canWrite(peran, sheetName) {
  const allowed = RBAC_WRITE[sheetName];
  if (!allowed) return false;
  return allowed.indexOf(peran) !== -1;
}

/**
 * READ generik. Semua data yang dibutuhkan client diambil lewat sini,
 * memakai cache server. Filter per peran dilakukan di getInitialAppData().
 */
function apiList(token, sheetName, ttl) {
  try {
    requireSession(token);
    if (!SHEET_SCHEMA[sheetName]) return createResponse(false, null, 'Sheet tidak dikenal.');
    return createResponse(true, getCachedData(sheetName, ttl || CACHE_TTL.SEMI), 'OK');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/**
 * CREATE / UPDATE generik (upsert berdasarkan ID).
 * Menerima SATU objek atau ARRAY objek (batch) — keduanya ditulis
 * dengan setValues(), bukan appendRow() per item.
 */
function apiSave(token, sheetName, payload) {
  const lock = LockService.getScriptLock();
  try {
    const sess = requireSession(token);
    const headers = SHEET_SCHEMA[sheetName];
    if (!headers) return createResponse(false, null, 'Sheet tidak dikenal.');
    if (!canWrite(sess.peran, sheetName)) {
      return createResponse(false, null, 'Akses ditolak: peran ' + sess.peran + ' tidak berhak mengubah ' + sheetName + '.');
    }

    const items = Array.isArray(payload) ? payload : [payload];
    if (!items.length) return createResponse(false, null, 'Tidak ada data untuk disimpan.');

    /* Validasi server-side dasar */
    const invalid = validateRecords(sheetName, items);
    if (invalid) return createResponse(false, null, invalid);

    lock.waitLock(20000);

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    const lastRow = Math.max(sheet.getLastRow(), 1);
    const values = sheet.getRange(1, 1, lastRow, headers.length).getValues(); // 1 read
    const idCol = headers.indexOf('ID');

    /* Peta ID → index baris untuk update cepat */
    const idIndex = {};
    for (let r = 1; r < values.length; r++) idIndex[String(values[r][idCol])] = r;

    const toInsert = [];
    const updates  = [];
    const tersimpan = [];   // record final (untuk hook pasca-simpan)

    items.forEach(function (item) {
      const clean = sanitizeRecord(sheetName, item, sess);
      tersimpan.push(clean);
      if (clean.ID && idIndex[String(clean.ID)] !== undefined) {
        const r = idIndex[String(clean.ID)];
        const merged = headers.map(function (h, c) {
          return clean[h] !== undefined ? clean[h] : values[r][c];
        });
        updates.push({ rowNumber: r + 1, values: merged });
      } else {
        clean.ID = clean.ID || generateUUID();
        if (headers.indexOf('CreatedAt') !== -1 && !clean.CreatedAt) clean.CreatedAt = new Date();
        toInsert.push(headers.map(function (h) {
          return clean[h] === undefined || clean[h] === null ? '' : clean[h];
        }));
      }
    });

    /* Batch tulis: sisipkan sekaligus */
    if (toInsert.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, toInsert.length, headers.length).setValues(toInsert);
    }
    /* Update: kelompokkan baris berurutan agar jumlah setValues minimal */
    writeUpdatesGrouped(sheet, updates, headers.length);

    invalidateCache(sheetName);
    lock.releaseLock();

    /* --- Hook pasca-simpan (dijalankan setelah lock dilepas) --- */
    const info = jalankanHookSimpan(sheetName, tersimpan, sess);

    return createResponse(true, {
      inserted: toInsert.length,
      updated: updates.length,
      ids: tersimpan.map(function (i) { return i.ID; }),
      hook: info
    }, (toInsert.length + updates.length) + ' data tersimpan.' + (info.pesan ? ' ' + info.pesan : ''));
  } catch (error) {
    try { lock.releaseLock(); } catch (e) {}
    return createResponse(false, null, error.message);
  }
}

/**
 * Menulis kumpulan update dengan menggabungkan baris yang berdampingan
 * menjadi satu setValues() — jauh lebih hemat kuota daripada per baris.
 */
function writeUpdatesGrouped(sheet, updates, colCount) {
  if (!updates.length) return;
  updates.sort(function (a, b) { return a.rowNumber - b.rowNumber; });
  let batchStart = 0;
  for (let i = 1; i <= updates.length; i++) {
    const isBreak = (i === updates.length) ||
                    (updates[i].rowNumber !== updates[i - 1].rowNumber + 1);
    if (isBreak) {
      const chunk = updates.slice(batchStart, i);
      sheet.getRange(chunk[0].rowNumber, 1, chunk.length, colCount)
           .setValues(chunk.map(function (u) { return u.values; }));
      batchStart = i;
    }
  }
}

/** DELETE generik (satu atau banyak ID sekaligus). */
function apiDelete(token, sheetName, ids) {
  const lock = LockService.getScriptLock();
  try {
    const sess = requireSession(token);
    const headers = SHEET_SCHEMA[sheetName];
    if (!headers) return createResponse(false, null, 'Sheet tidak dikenal.');
    if (!canWrite(sess.peran, sheetName)) return createResponse(false, null, 'Akses ditolak.');

    const idList = (Array.isArray(ids) ? ids : [ids]).map(String);
    lock.waitLock(20000);

    /* Hapus akun portal terkait LEBIH DULU (butuh data profil sebelum dihapus) */
    const akunTerhapus = hapusAkunTerkait(sheetName, idList);

    const sheet = getSpreadsheet().getSheetByName(sheetName);
    const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).getValues();
    const idCol = headers.indexOf('ID');

    const rowsToDelete = [];
    for (let r = 1; r < values.length; r++) {
      if (idList.indexOf(String(values[r][idCol])) !== -1) rowsToDelete.push(r + 1);
    }
    rowsToDelete.sort(function (a, b) { return b - a; }); // hapus dari bawah ke atas
    rowsToDelete.forEach(function (rn) { sheet.deleteRow(rn); });

    invalidateCache(sheetName);
    lock.releaseLock();
    return createResponse(true, { deleted: rowsToDelete.length, akunTerhapus: akunTerhapus },
      rowsToDelete.length + ' data dihapus.' +
      (akunTerhapus ? ' ' + akunTerhapus + ' akun portal terkait ikut dihapus.' : ''));
  } catch (error) {
    try { lock.releaseLock(); } catch (e) {}
    return createResponse(false, null, error.message);
  }
}

/**
 * Pembersihan & pengamanan data sebelum ditulis.
 * - Menolak kolom yang tidak ada di skema.
 * - Meng-hash password bila field 'Password' dikirim.
 */
function sanitizeRecord(sheetName, item, sess) {
  const headers = SHEET_SCHEMA[sheetName];
  const kolomTeks = KOLOM_TEKS[sheetName] || [];
  const out = {};
  headers.forEach(function (h) {
    if (item[h] === undefined) return;
    let v = item[h];
    /* Normalisasi nomor WhatsApp: selalu berawalan 0 dan disimpan sebagai teks */
    if (h === 'NoHP' || h === 'NoHPWali' || h === 'Telepon') v = normalisasiHPSimpan(v);
    else if (kolomTeks.indexOf(h) !== -1 && v !== '') v = String(v);
    out[h] = v;
  });
  if (sheetName === 'Pengguna') {
    if (item.Password) out.PasswordHash = hashPassword(item.Password);
    if (out.Email) out.Email = String(out.Email).trim().toLowerCase();
    if (out.Peran && ROLES.indexOf(out.Peran) === -1) delete out.Peran;
  }
  if (headers.indexOf('UpdatedAt') !== -1) out.UpdatedAt = new Date();
  return out;
}

/* -------------------------------------------------------------------------- */
/* 7b. HOOK PASCA-SIMPAN: AKUN OTOMATIS, SINKRON No WA, PERIODE AKTIF TUNGGAL  */
/* -------------------------------------------------------------------------- */

/** Kata sandi awal untuk akun yang dibuat otomatis (Upgrade 8). */
const PASSWORD_DEFAULT = '123';

/**
 * Dijalankan setelah apiSave() berhasil menulis.
 * - Siswa_Mahasiswa / Dosen_Guru → buat akun portal bila belum ada, dan
 *   sinkronkan Nama/Email/NoHP/Foto ke akun tersebut.
 * - Pengguna → sinkronkan balik NoHP & Foto ke profil Dosen/Siswa terkait.
 * - Periode → pastikan hanya satu periode berstatus Aktif.
 */
function jalankanHookSimpan(sheetName, records, sess) {
  try {
    if (sheetName === 'Siswa_Mahasiswa') return sinkronAkunProfil('Siswa', records);
    if (sheetName === 'Dosen_Guru')      return sinkronAkunProfil('Dosen', records);
    if (sheetName === 'Pengguna')        return sinkronProfilDariAkun(records);
    if (sheetName === 'Periode')         return terapkanPeriodeAktifTunggal(records);
    if (sheetName === 'Institusi')       return { pesan: '' };
    return { pesan: '' };
  } catch (err) {
    Logger.log('jalankanHookSimpan(' + sheetName + '): ' + err.message);
    return { pesan: '', error: err.message };
  }
}

/**
 * Membuat/menyelaraskan akun portal untuk profil Dosen atau Siswa.
 * Nama pengguna = Email, kata sandi awal = PASSWORD_DEFAULT.
 */
function sinkronAkunProfil(peran, records) {
  const sheetProfil = peran === 'Siswa' ? 'Siswa_Mahasiswa' : 'Dosen_Guru';
  const ss = getSpreadsheet();
  const shUser = ss.getSheetByName('Pengguna');
  const hUser = SHEET_SCHEMA['Pengguna'];
  const nilaiUser = shUser.getRange(1, 1, Math.max(shUser.getLastRow(), 1), hUser.length).getValues();

  const idxEmail = {}, idxId = {};
  for (let r = 1; r < nilaiUser.length; r++) {
    idxEmail[String(nilaiUser[r][hUser.indexOf('Email')]).toLowerCase()] = r;
    idxId[String(nilaiUser[r][hUser.indexOf('ID')])] = r;
  }

  /* Baca ulang profil agar dapat data lengkap (payload klien bisa parsial) */
  const profilSemua = readSheetObjects(sheetProfil);
  const petaProfil = {};
  profilSemua.forEach(function (p) { petaProfil[p.ID] = p; });

  const userBaru = [];
  const userUpdate = [];
  const patchProfil = [];
  let dibuat = 0, disinkron = 0;

  records.forEach(function (rec) {
    const p = petaProfil[rec.ID] || rec;
    const email = String(p.Email || '').trim().toLowerCase();
    if (!email) return; // tanpa email, akun tidak dapat dibuat

    const noHP = normalisasiHPSimpan(p.NoHP);
    let rowUser = p.PenggunaID && idxId[String(p.PenggunaID)] !== undefined
      ? idxId[String(p.PenggunaID)]
      : (idxEmail[email] !== undefined ? idxEmail[email] : -1);

    if (rowUser === -1) {
      /* --- Akun belum ada → buat otomatis --- */
      const idBaru = generateUUID();
      const objBaru = {
        ID: idBaru, Nama: p.Nama, Email: email, NoHP: noHP, Peran: peran,
        PasswordHash: hashPassword(PASSWORD_DEFAULT), Status: p.Status || 'Aktif',
        FotoURL: p.FotoURL || '', FotoFileID: p.FotoFileID || '',
        LastLogin: '', CreatedAt: new Date()
      };
      userBaru.push(hUser.map(function (h) { return objBaru[h] === undefined ? '' : objBaru[h]; }));
      patchProfil.push({ ID: p.ID, PenggunaID: idBaru });
      dibuat++;
    } else {
      /* --- Akun sudah ada → selaraskan data --- */
      const baris = nilaiUser[rowUser];
      baris[hUser.indexOf('Nama')]   = p.Nama || baris[hUser.indexOf('Nama')];
      baris[hUser.indexOf('Email')]  = email;
      if (noHP) baris[hUser.indexOf('NoHP')] = noHP;
      if (p.FotoURL)    baris[hUser.indexOf('FotoURL')] = p.FotoURL;
      if (p.FotoFileID) baris[hUser.indexOf('FotoFileID')] = p.FotoFileID;
      if (p.Status)     baris[hUser.indexOf('Status')] = (String(p.Status).toLowerCase() === 'aktif' ? 'Aktif' : 'Nonaktif');
      userUpdate.push({ rowNumber: rowUser + 1, values: baris });
      if (!p.PenggunaID) patchProfil.push({ ID: p.ID, PenggunaID: baris[hUser.indexOf('ID')] });
      disinkron++;
    }
  });

  if (userBaru.length) {
    shUser.getRange(shUser.getLastRow() + 1, 1, userBaru.length, hUser.length).setValues(userBaru);
  }
  writeUpdatesGrouped(shUser, userUpdate, hUser.length);

  /* Tulis balik PenggunaID ke profil */
  if (patchProfil.length) tulisPatch(ss, sheetProfil, patchProfil);

  invalidateCacheMultiple(['Pengguna', sheetProfil]);
  const pesan = dibuat
    ? dibuat + ' akun portal dibuat otomatis (kata sandi awal: ' + PASSWORD_DEFAULT + ').'
    : (disinkron ? 'Akun portal terkait ikut diperbarui.' : '');
  return { pesan: pesan, akunDibuat: dibuat, akunDisinkron: disinkron };
}

/** Sinkron balik: perubahan pada akun Pengguna ikut memperbarui profil terkait. */
function sinkronProfilDariAkun(records) {
  const ss = getSpreadsheet();
  let total = 0;
  ['Siswa_Mahasiswa', 'Dosen_Guru'].forEach(function (sheetName) {
    const semua = readSheetObjects(sheetName);
    const patch = [];
    records.forEach(function (u) {
      if (!u.ID && !u.Email) return;
      const cocok = semua.filter(function (p) {
        return (u.ID && p.PenggunaID === u.ID) ||
               (u.Email && String(p.Email).toLowerCase() === String(u.Email).toLowerCase());
      });
      cocok.forEach(function (p) {
        const isi = { ID: p.ID };
        if (u.NoHP !== undefined)  isi.NoHP = normalisasiHPSimpan(u.NoHP);
        if (u.Nama !== undefined)  isi.Nama = u.Nama;
        if (u.Email !== undefined) isi.Email = u.Email;
        if (u.FotoURL !== undefined)    isi.FotoURL = u.FotoURL;
        if (u.FotoFileID !== undefined) isi.FotoFileID = u.FotoFileID;
        if (u.ID && !p.PenggunaID) isi.PenggunaID = u.ID;
        if (Object.keys(isi).length > 1) patch.push(isi);
      });
    });
    if (patch.length) { tulisPatch(ss, sheetName, patch); total += patch.length; invalidateCache(sheetName); }
  });
  return { pesan: total ? 'Data profil terkait ikut disinkronkan.' : '' };
}

/** Menerapkan aturan: hanya SATU periode boleh berstatus Aktif (Upgrade 11b). */
function terapkanPeriodeAktifTunggal(records) {
  const aktifBaru = records.filter(function (p) { return String(p.Status).toLowerCase() === 'aktif'; });
  if (!aktifBaru.length) return { pesan: '' };
  const target = aktifBaru[aktifBaru.length - 1];

  const ss = getSpreadsheet();
  const sh = ss.getSheetByName('Periode');
  const h = SHEET_SCHEMA['Periode'];
  const v = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), h.length).getValues();
  const cId = h.indexOf('ID'), cStatus = h.indexOf('Status');
  let ubah = false, dinonaktifkan = 0;
  let periodeAktif = null;

  for (let r = 1; r < v.length; r++) {
    const iniTarget = String(v[r][cId]) === String(target.ID);
    if (iniTarget) {
      v[r][cStatus] = 'Aktif';
      periodeAktif = objFromRowKode(h, v[r]);
      ubah = true;
    } else if (String(v[r][cStatus]).toLowerCase() === 'aktif') {
      v[r][cStatus] = 'Nonaktif';
      ubah = true; dinonaktifkan++;
    }
  }
  if (ubah) sh.getRange(1, 1, v.length, h.length).setValues(v);
  invalidateCache('Periode');

  /* Selaraskan Institusi.TahunAjaran & SemesterAktif dengan periode aktif */
  if (periodeAktif) {
    const shI = ss.getSheetByName('Institusi');
    const hI = SHEET_SCHEMA['Institusi'];
    if (shI.getLastRow() >= 2) {
      const vi = shI.getRange(2, 1, 1, hI.length).getValues();
      vi[0][hI.indexOf('TahunAjaran')]   = periodeAktif.TahunAjaran;
      vi[0][hI.indexOf('SemesterAktif')] = periodeAktif.Semester;
      shI.getRange(2, 1, 1, hI.length).setValues(vi);
      invalidateCache('Institusi');
    }
  }
  return { pesan: dinonaktifkan ? dinonaktifkan + ' periode lain otomatis dinonaktifkan.' : '' };
}

function objFromRowKode(headers, row) {
  const o = {};
  headers.forEach(function (h, i) { o[h] = normalizeCell(row[i]); });
  return o;
}

/**
 * Menulis sebagian kolom pada baris tertentu (berdasarkan ID) dalam satu operasi.
 * @param {Array<Object>} patch daftar {ID, kolom: nilai, ...}
 */
function tulisPatch(ss, sheetName, patch) {
  const sh = ss.getSheetByName(sheetName);
  const h = SHEET_SCHEMA[sheetName];
  const v = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), h.length).getValues();
  const cId = h.indexOf('ID');
  const peta = {};
  for (let r = 1; r < v.length; r++) peta[String(v[r][cId])] = r;

  let ubah = false;
  patch.forEach(function (p) {
    const r = peta[String(p.ID)];
    if (r === undefined) return;
    Object.keys(p).forEach(function (k) {
      const c = h.indexOf(k);
      if (c !== -1 && k !== 'ID') { v[r][c] = p[k]; ubah = true; }
    });
  });
  if (ubah) sh.getRange(1, 1, v.length, h.length).setValues(v);
}

/**
 * Hook pra-hapus: menghapus akun portal milik Dosen/Siswa yang datanya dihapus
 * (Upgrade 8) dan mengembalikan jumlah akun yang ikut terhapus.
 */
function hapusAkunTerkait(sheetName, ids) {
  if (['Siswa_Mahasiswa', 'Dosen_Guru'].indexOf(sheetName) === -1) return 0;
  const profil = readSheetObjects(sheetName).filter(function (p) {
    return ids.indexOf(String(p.ID)) !== -1;
  });
  if (!profil.length) return 0;

  const penggunaId = profil.map(function (p) { return String(p.PenggunaID || ''); }).filter(Boolean);
  const emails = profil.map(function (p) { return String(p.Email || '').toLowerCase(); }).filter(Boolean);
  if (!penggunaId.length && !emails.length) return 0;

  const ss = getSpreadsheet();
  const sh = ss.getSheetByName('Pengguna');
  const h = SHEET_SCHEMA['Pengguna'];
  const v = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), h.length).getValues();
  const cId = h.indexOf('ID'), cEmail = h.indexOf('Email'), cPeran = h.indexOf('Peran');

  const barisHapus = [];
  for (let r = 1; r < v.length; r++) {
    if (String(v[r][cPeran]) === 'Super Admin') continue; // jangan pernah hapus Super Admin
    if (penggunaId.indexOf(String(v[r][cId])) !== -1 ||
        emails.indexOf(String(v[r][cEmail]).toLowerCase()) !== -1) {
      barisHapus.push(r + 1);
    }
  }
  barisHapus.sort(function (a, b) { return b - a; });
  barisHapus.forEach(function (rn) { sh.deleteRow(rn); });
  if (barisHapus.length) invalidateCache('Pengguna');
  return barisHapus.length;
}

/** Validasi wajib-isi per sheet (server-side, melengkapi validasi client). */
function validateRecords(sheetName, items) {
  const REQUIRED = {
    'Pengguna':        ['Nama', 'Email', 'Peran'],
    'Jurusan_Prodi':   ['Kode', 'Nama'],
    'Kurikulum':       ['Kode', 'Nama', 'TahunBerlaku'],
    'Mata_Pelajaran':  ['Kode', 'Nama', 'SKS'],
    'Kelas':           ['Kode', 'Nama'],
    'Jadwal':          ['Hari', 'JamMulai', 'JamSelesai', 'MapelID', 'KelasID', 'DosenID'],
    'Dosen_Guru':      ['Nama'],
    'Siswa_Mahasiswa': ['NIM', 'Nama'],
    'Materi':          ['Judul', 'Jenis', 'MapelID', 'KelasID'],
    'Tugas_Quiz':      ['Judul', 'MapelID', 'KelasID', 'Deadline'],
    'SPP_Tagihan':     ['SiswaID', 'Periode', 'Nominal']
  };
  const req = REQUIRED[sheetName];
  if (!req) return null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.ID) continue; // update parsial diperbolehkan
    for (let j = 0; j < req.length; j++) {
      const f = req[j];
      if (it[f] === undefined || it[f] === '' || it[f] === null) {
        return 'Kolom wajib "' + f + '" belum diisi pada ' + sheetName + '.';
      }
    }
  }
  return null;
}


/* ========================================================================== */
/* 8. BOOTSTRAP DATA APLIKASI (SATU PANGGILAN UNTUK SEMUA)                    */
/* ========================================================================== */

/**
 * PRINSIP 4 — Composite batch: seluruh data awal yang dibutuhkan client
 * diambil dalam SATU permintaan HTTP, bukan 10 panggilan berurutan.
 * Ini makin penting pada arsitektur REST: tiap request melintasi jaringan,
 * sehingga menggabungkannya menghemat ±10 kali round-trip saat boot.
 * Data difilter sesuai peran agar payload kecil & aman.
 */
function getInitialAppData(token) {
  try {
    const sess = requireSession(token);
    const peran = sess.peran;

    const institusi = getCachedData('Institusi', CACHE_TTL.MASTER)[0] || {};
    const base = {
      user: { id: sess.userId, nama: sess.nama, email: sess.email, peran: peran, fotoURL: sess.fotoURL },
      institusi: institusi,
      periode:   getCachedData('Periode',        CACHE_TTL.MASTER),
      bantuan:   getCachedData('Bantuan',        CACHE_TTL.MASTER),
      jurusan:   getCachedData('Jurusan_Prodi',  CACHE_TTL.MASTER),
      kurikulum: getCachedData('Kurikulum',      CACHE_TTL.MASTER),
      mapel:     getCachedData('Mata_Pelajaran', CACHE_TTL.MASTER),
      kelas:     getCachedData('Kelas',          CACHE_TTL.MASTER),
      program:   getCachedData('Program_Kelas',  CACHE_TTL.MASTER),
      jadwal:    getCachedData('Jadwal',         CACHE_TTL.MASTER),
      dosen:     getCachedData('Dosen_Guru',     CACHE_TTL.MASTER),
      fitur: {
        spp:     toBool(institusi.FiturSPP),
        barcode: toBool(institusi.FiturBarcode),
        geo:     toBool(institusi.FiturGeo)
      },
      serverTime: nowIso()
    };

    const siswaAll = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER);

    if (peran === 'Super Admin' || peran === 'Tim Akademik') {
      base.siswa       = siswaAll;
      base.pengguna    = getCachedData('Pengguna', CACHE_TTL.MASTER).map(stripPassword);
      base.statusNilai = getCachedData('Status_Nilai', CACHE_TTL.SHORT);
      base.remedial    = getCachedData('Remedial', CACHE_TTL.SHORT);
      base.pengulangan = getCachedData('Pengulangan_Matkul', CACHE_TTL.SHORT);
      base.statistik   = hitungStatistikGlobal();
      base.statusSiswa = getCachedData('Status_Nilai_Siswa', CACHE_TTL.SHORT);
      if (peran === 'Super Admin') {
        base.enrollment   = getCachedData('Enrollment', CACHE_TTL.MASTER);
        base.spp          = getCachedData('SPP_Tagihan', CACHE_TTL.SHORT);
        base.jenisTagihan = getCachedData('Jenis_Tagihan', CACHE_TTL.MASTER);
        base.logNotif     = getCachedData('Log_Notifikasi', CACHE_TTL.SHORT).slice(-50);
      }
    }

    if (peran === 'Dosen') {
      const profil = getCachedData('Dosen_Guru', CACHE_TTL.MASTER).filter(function (d) {
        return d.PenggunaID === sess.userId;
      })[0] || {};
      base.profil = profil;
      const kelasSaya = base.program.filter(function (p) { return p.DosenID === profil.ID; });
      const kelasIds  = uniq(kelasSaya.map(function (p) { return p.KelasID; }));
      base.programSaya = kelasSaya;
      base.siswa       = siswaAll.filter(function (s) { return kelasIds.indexOf(s.KelasID) !== -1; });
      base.materi      = getCachedData('Materi', CACHE_TTL.SEMI)
                          .filter(function (m) { return m.DosenID === profil.ID || kelasIds.indexOf(m.KelasID) !== -1; });
      base.tugas       = getCachedData('Tugas_Quiz', CACHE_TTL.SEMI)
                          .filter(function (t) { return kelasIds.indexOf(t.KelasID) !== -1; });
      base.statusNilai = getCachedData('Status_Nilai', CACHE_TTL.SHORT)
                          .filter(function (s) { return kelasIds.indexOf(s.KelasID) !== -1; });
      base.pengumpulan = getCachedData('Pengumpulan_Tugas', CACHE_TTL.SHORT);
      base.statusSiswa = getCachedData('Status_Nilai_Siswa', CACHE_TTL.SHORT)
                          .filter(function (s) { return kelasIds.indexOf(s.KelasID) !== -1; });
      base.komponen    = getCachedData('Komponen_Nilai', CACHE_TTL.SHORT)
                          .filter(function (k) { return kelasIds.indexOf(k.KelasID) !== -1; });
      base.statistik   = hitungStatistikDosen(profil.ID, kelasIds);
    }

    if (peran === 'Siswa') {
      const profil = siswaAll.filter(function (s) { return s.PenggunaID === sess.userId; })[0] || {};
      base.profil = profil;
      const enroll = getCachedData('Enrollment', CACHE_TTL.MASTER)
                      .filter(function (e) { return e.SiswaID === profil.ID; });
      const mapelIds = uniq(enroll.map(function (e) { return e.MapelID; }));
      base.enrollmentSaya = enroll;
      base.jadwal  = base.jadwal.filter(function (j) { return j.KelasID === profil.KelasID; });
      base.materi  = getCachedData('Materi', CACHE_TTL.SEMI)
                      .filter(function (m) { return m.KelasID === profil.KelasID; });
      base.tugas   = getCachedData('Tugas_Quiz', CACHE_TTL.SEMI)
                      .filter(function (t) { return t.KelasID === profil.KelasID; });
      base.pengumpulanSaya = getCachedData('Pengumpulan_Tugas', CACHE_TTL.SHORT)
                      .filter(function (p) { return p.SiswaID === profil.ID; });
      base.absensiSaya = getCachedData('Absensi', CACHE_TTL.SHORT)
                      .filter(function (a) { return a.SiswaID === profil.ID; });
      base.transkrip = getCachedData('Transkrip', CACHE_TTL.SHORT)
                      .filter(function (t) { return t.SiswaID === profil.ID; });
      base.remedial  = getCachedData('Remedial', CACHE_TTL.SHORT)
                      .filter(function (r) { return r.SiswaID === profil.ID; });
      base.statusNilai = getCachedData('Status_Nilai', CACHE_TTL.SHORT)
                      .filter(function (s) { return s.KelasID === profil.KelasID; });
      base.statusSiswa = getCachedData('Status_Nilai_Siswa', CACHE_TTL.SHORT)
                      .filter(function (s) { return s.SiswaID === profil.ID; });
      base.spp = base.fitur.spp
                      ? getCachedData('SPP_Tagihan', CACHE_TTL.SHORT).filter(function (s) { return s.SiswaID === profil.ID; })
                      : [];
      base.mapelIds = mapelIds;
      base.statistik = hitungStatistikSiswa(profil.ID, profil.KelasID);
    }

    return createResponse(true, base, 'OK');
  } catch (error) {
    if (error.message === 'SESSION_EXPIRED') return createResponse(false, { sessionExpired: true }, 'Sesi berakhir. Silakan masuk kembali.');
    return createResponse(false, null, 'Gagal memuat data: ' + error.message);
  }
}

function stripPassword(u) {
  const c = {};
  Object.keys(u).forEach(function (k) { if (k !== 'PasswordHash') c[k] = u[k]; });
  return c;
}

function uniq(arr) {
  const seen = {}; const out = [];
  arr.forEach(function (v) { if (v !== '' && !seen[v]) { seen[v] = 1; out.push(v); } });
  return out;
}
