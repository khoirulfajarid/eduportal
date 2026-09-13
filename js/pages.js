/* ==========================================================================
   EduPortal LMS v2.0 — pages.js
   --------------------------------------------------------------------------
   Seluruh halaman SPA untuk 4 peran. Setiap halaman adalah fungsi murni
   yang mengembalikan HTML string; inisialisasi (chart, tabel, event)
   ditaruh di PAGE_INIT dan dijalankan setelah HTML disuntikkan.

   Dimuat SETELAH app.js, karena mendaftarkan diri ke registry PAGES/PAGE_INIT
   dan memakai helper (api, $, esc, svgIcon, showToast, openModal) dari sana.

   PERUBAHAN DARI v1.1
   Isi berkas ini nyaris seluruhnya identik: tidak ada satu pun pemanggilan
   google.script.run di sini, sehingga migrasi ke REST API tidak menyentuhnya.
   Yang berubah hanya bagian-bagian yang dulu terpaksa dibuat karena aplikasi
   terkurung di dalam iframe Apps Script:

     • Rekam Pertemuan — jendela "Perekam Eksternal", postMessage, dan
       pengawasan popup DIHAPUS; perekaman kini berjalan langsung di halaman.
     • Absensi QR      — pemindai kamera DIAKTIFKAN. Pada v1.1 kode ini selalu
       berakhir di pesan "kamera diblokir", jadi fitur pindainya tidak pernah
       benar-benar dapat dipakai. Kolom kode manual tetap ada sebagai cadangan.
     • Pengaturan      — panel "Perekam Eksternal" diganti panel "Perekam
       Pertemuan" berisi uji mikrofon langsung; tidak ada lagi yang perlu
       di-host terpisah.
   ========================================================================== */

const PAGES = {};
const PAGE_INIT = {};

/* ==========================================================================
   A. MESIN CRUD DATA MASTER (generik, dipakai Super Admin)
   ========================================================================== */
const ENTITAS = {
  periode: {
    sheet: 'Periode', label: 'Periode Akademik', ikon: 'calendar', db: 'periode',
    field: [
      { k: 'Kode', l: 'Kode Periode', wajib: true, bantu: 'Contoh: 2026-1' },
      { k: 'Tahun', l: 'Tahun', tipe: 'number', wajib: true },
      { k: 'TahunAjaran', l: 'Tahun Ajaran', wajib: true, bantu: 'Contoh: 2026/2027' },
      { k: 'Semester', l: 'Semester', tipe: 'select', opsi: ['Ganjil','Genap','Pendek'], wajib: true },
      { k: 'TanggalMulai', l: 'Tanggal Mulai', tipe: 'date' },
      { k: 'TanggalSelesai', l: 'Tanggal Selesai', tipe: 'date' },
      { k: 'Status', l: 'Status', tipe: 'select', opsi: ['Aktif','Nonaktif'],
        bantu: 'Hanya SATU periode boleh aktif. Mengaktifkan periode ini otomatis menonaktifkan yang lain.' },
      { k: 'Keterangan', l: 'Keterangan', tipe: 'textarea', full: true }
    ],
    kolom: [
      { key: 'Kode', label: 'Kode' },
      { key: 'TahunAjaran', label: 'Tahun Ajaran' },
      { key: 'Semester', label: 'Semester' },
      { key: 'TanggalMulai', label: 'Mulai', render: function (r) { return esc(fmtTgl(r.TanggalMulai)); } },
      { key: 'TanggalSelesai', label: 'Selesai', render: function (r) { return esc(fmtTgl(r.TanggalSelesai)); } },
      { key: 'Status', label: 'Status', render: function (r) {
          return String(r.Status).toLowerCase() === 'aktif'
            ? '<span class="badge badge-success">Periode Aktif</span>'
            : '<button class="btn btn-outline btn-sm" onclick="aktifkanPeriode(\'' + r.ID + '\')">Jadikan Aktif</button>'; } }
    ]
  },
  jenisTagihan: {
    sheet: 'Jenis_Tagihan', label: 'Jenis Tagihan', ikon: 'wallet', db: 'jenisTagihan',
    field: [
      { k: 'Kode', l: 'Kode', wajib: true, bantu: 'Contoh: SPP, GEDUNG, PRAK' },
      { k: 'Nama', l: 'Nama Tagihan', wajib: true },
      { k: 'NominalDefault', l: 'Nominal Bawaan (Rp)', tipe: 'number' },
      { k: 'Periodik', l: 'Tagihan berulang setiap periode', tipe: 'checkbox' },
      { k: 'Keterangan', l: 'Keterangan', tipe: 'textarea', full: true },
      { k: 'Status', l: 'Status', tipe: 'select', opsi: ['Aktif','Nonaktif'] }
    ],
    kolom: [
      { key: 'Kode', label: 'Kode' },
      { key: 'Nama', label: 'Nama Tagihan' },
      { key: 'NominalDefault', label: 'Nominal Bawaan', cls: 'num', render: function (r) { return esc(fmtRp(r.NominalDefault)); } },
      { key: 'Periodik', label: 'Berulang', render: function (r) {
          return String(r.Periodik).toUpperCase() === 'TRUE'
            ? '<span class="badge badge-info plain">Periodik</span>' : '<span class="muted">Sekali</span>'; } },
      { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } }
    ]
  },
  bantuan: {
    sheet: 'Bantuan', label: 'Artikel Bantuan', ikon: 'help-circle', db: 'bantuan',
    field: [
      { k: 'Kategori', l: 'Kategori', wajib: true,
        bantu: 'Contoh: Memulai, Data Master, Impor Excel, Absensi, Penilaian, Masalah Umum' },
      { k: 'Peran', l: 'Ditujukan untuk', tipe: 'select',
        opsi: ['Semua','Super Admin','Tim Akademik','Dosen','Siswa'] },
      { k: 'Pertanyaan', l: 'Pertanyaan / Judul', wajib: true, full: true },
      { k: 'Jawaban', l: 'Jawaban', tipe: 'textarea', wajib: true, full: true },
      { k: 'Urutan', l: 'Urutan Tampil', tipe: 'number' },
      { k: 'Status', l: 'Status', tipe: 'select', opsi: ['Aktif','Nonaktif'] }
    ],
    kolom: [
      { key: 'Kategori', label: 'Kategori', render: function (r) {
          return '<span class="badge badge-info plain">' + esc(r.Kategori) + '</span>'; } },
      { key: 'Pertanyaan', label: 'Pertanyaan' },
      { key: 'Peran', label: 'Untuk' },
      { key: 'Urutan', label: 'Urutan', cls: 'num' },
      { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } }
    ]
  },
  jurusan: {
    sheet: 'Jurusan_Prodi', label: 'Jurusan / Program Studi', ikon: 'building', db: 'jurusan',
    field: [
      { k: 'Kode', l: 'Kode', wajib: true },
      { k: 'Nama', l: 'Nama Jurusan/Prodi', wajib: true },
      { k: 'Jenjang', l: 'Jenjang', tipe: 'select', opsi: ['SMP','SMA','SMK','D3','D4','S1','S2','S3'] },
      { k: 'Keterangan', l: 'Keterangan', tipe: 'textarea', full: true },
      { k: 'Status', l: 'Status', tipe: 'select', opsi: ['Aktif','Nonaktif'] }
    ],
    kolom: [
      { key: 'Kode', label: 'Kode' },
      { key: 'Nama', label: 'Nama' },
      { key: 'Jenjang', label: 'Jenjang' },
      { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } }
    ]
  },
  kurikulum: {
    sheet: 'Kurikulum', label: 'Kurikulum', ikon: 'library', db: 'kurikulum',
    field: [
      { k: 'Kode', l: 'Kode Kurikulum', wajib: true },
      { k: 'Nama', l: 'Nama Kurikulum', wajib: true },
      { k: 'TahunBerlaku', l: 'Tahun Berlaku', tipe: 'tahun', wajib: true },
      { k: 'JurusanID', l: 'Jurusan/Prodi', tipe: 'ref', ref: 'jurusan' },
      { k: 'Keterangan', l: 'Keterangan', tipe: 'textarea', full: true },
      { k: 'Status', l: 'Status', tipe: 'select', opsi: ['Aktif','Nonaktif'] }
    ],
    kolom: [
      { key: 'Kode', label: 'Kode' },
      { key: 'Nama', label: 'Nama' },
      { key: 'TahunBerlaku', label: 'Berlaku' },
      { key: 'JurusanID', label: 'Jurusan', render: function (r) { return esc(namaJurusan(r.JurusanID)); } },
      { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } }
    ]
  },
  mapel: {
    sheet: 'Mata_Pelajaran', label: 'Mata Pelajaran / Kuliah', ikon: 'book-open', db: 'mapel',
    field: [
      { k: 'Kode', l: 'Kode', wajib: true },
      { k: 'Nama', l: 'Nama Mata Pelajaran/Kuliah', wajib: true },
      { k: 'SKS', l: 'SKS / Jam', tipe: 'number', wajib: true },
      { k: 'KurikulumID', l: 'Kurikulum', tipe: 'ref', ref: 'kurikulum' },
      { k: 'JurusanID', l: 'Jurusan/Prodi', tipe: 'ref', ref: 'jurusan' },
      { k: 'Jenjang', l: 'Jenjang', tipe: 'select', opsi: ['SMP','SMA','SMK','D3','D4','S1','S2','S3'] },
      { k: 'Kategori', l: 'Kategori', tipe: 'select', opsi: ['Wajib','Pilihan','Peminatan'] },
      { k: 'Deskripsi', l: 'Deskripsi', tipe: 'textarea', full: true },
      { k: 'Status', l: 'Status', tipe: 'select', opsi: ['Aktif','Nonaktif'] }
    ],
    kolom: [
      { key: 'Kode', label: 'Kode' },
      { key: 'Nama', label: 'Nama' },
      { key: 'SKS', label: 'SKS', cls: 'num' },
      { key: 'Kategori', label: 'Kategori' },
      { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } }
    ]
  },
  kelas: {
    sheet: 'Kelas', label: 'Kelas', ikon: 'users', db: 'kelas',
    field: [
      { k: 'Kode', l: 'Kode Kelas', wajib: true },
      { k: 'Nama', l: 'Nama Kelas', wajib: true },
      { k: 'JurusanID', l: 'Jurusan/Prodi', tipe: 'ref', ref: 'jurusan' },
      { k: 'Angkatan', l: 'Angkatan', tipe: 'tahun' },
      { k: 'WaliKelasID', l: 'Wali Kelas', tipe: 'ref', ref: 'dosen' },
      { k: 'Ruangan', l: 'Ruangan' },
      { k: 'Kapasitas', l: 'Kapasitas', tipe: 'number' },
      { k: 'Status', l: 'Status', tipe: 'select', opsi: ['Aktif','Nonaktif'] }
    ],
    kolom: [
      { key: 'Kode', label: 'Kode' },
      { key: 'Nama', label: 'Nama Kelas' },
      { key: 'Angkatan', label: 'Angkatan' },
      { key: 'WaliKelasID', label: 'Wali Kelas', render: function (r) { return esc(namaDosen(r.WaliKelasID)); } },
      { key: '__jml', label: 'Jumlah Siswa', cls: 'num', render: function (r) {
          return (DB.siswa || []).filter(function (s) { return s.KelasID === r.ID; }).length; } },
      { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } }
    ]
  },
  program: {
    sheet: 'Program_Kelas', label: 'Program Kelas (Mapel per Kelas)', ikon: 'grid', db: 'program',
    field: [
      { k: 'KelasID', l: 'Kelas', tipe: 'ref', ref: 'kelas', wajib: true },
      { k: 'MapelID', l: 'Mata Pelajaran', tipe: 'ref', ref: 'mapel', wajib: true },
      { k: 'DosenID', l: 'Pengampu', tipe: 'ref', ref: 'dosen', wajib: true },
      { k: 'Semester', l: 'Semester', tipe: 'select', opsi: ['1','2','3','4','5','6','7','8'] },
      { k: 'TahunAjaran', l: 'Tahun Ajaran', tipe: 'ta' },
      { k: 'Status', l: 'Status', tipe: 'select', opsi: ['Aktif','Nonaktif'] }
    ],
    kolom: [
      { key: 'KelasID', label: 'Kelas', render: function (r) { return esc(namaKelas(r.KelasID)); } },
      { key: 'MapelID', label: 'Mata Pelajaran', render: function (r) { return esc(namaMapel(r.MapelID)); } },
      { key: 'DosenID', label: 'Pengampu', render: function (r) { return esc(namaDosen(r.DosenID)); } },
      { key: 'Semester', label: 'Smt', cls: 'num' },
      { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } }
    ]
  },
  pengguna: {
    sheet: 'Pengguna', label: 'Akun Pengguna', ikon: 'shield', db: 'pengguna',
    field: [
      { k: 'Nama', l: 'Nama Lengkap', wajib: true },
      { k: 'Email', l: 'Email (untuk login)', tipe: 'email', wajib: true },
      { k: 'NoHP', l: 'No. WhatsApp', bantu: 'Format 08xx / 628xx untuk notifikasi WA.' },
      { k: 'Peran', l: 'Peran', tipe: 'select', opsi: ['Super Admin','Tim Akademik','Dosen','Siswa'], wajib: true },
      { k: 'Password', l: 'Kata Sandi', tipe: 'password',
        bantu: 'Kosongkan bila tidak ingin mengubah sandi. Akun Dosen & Mahasiswa yang dibuat otomatis memakai kata sandi awal 123.' },
      { k: 'Status', l: 'Status', tipe: 'select', opsi: ['Aktif','Nonaktif'] }
    ],
    kolom: [
      { key: 'Nama', label: 'Nama', render: function (r) {
          return '<div class="person">' + avatarHtml(r.Nama, r.FotoURL, 32) + '<div><strong>' +
                 esc(r.Nama) + '</strong><br><small class="muted">' + esc(r.Email) + '</small></div></div>'; } },
      { key: 'NoHP', label: 'No. WhatsApp', render: function (r) {
          return r.NoHP ? '<span class="mono">' + esc(r.NoHP) + '</span>' : '<span class="muted">—</span>'; } },
      { key: 'Peran', label: 'Peran', render: function (r) { return '<span class="badge badge-info plain">' + esc(r.Peran) + '</span>'; } },
      { key: 'LastLogin', label: 'Login Terakhir', render: function (r) { return esc(fmtTgl(r.LastLogin, true)); } },
      { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } }
    ]
  },
  siswa: {
    sheet: 'Siswa_Mahasiswa', label: 'Siswa / Mahasiswa', ikon: 'graduation-cap', db: 'siswa',
    field: [
      { k: 'NIM', l: 'NIM / NIS', wajib: true },
      { k: 'Nama', l: 'Nama Lengkap', wajib: true },
      { k: 'Email', l: 'Email' },
      { k: 'NoHP', l: 'No. WhatsApp' },
      { k: 'KelasID', l: 'Kelas', tipe: 'ref', ref: 'kelas' },
      { k: 'JurusanID', l: 'Jurusan/Prodi', tipe: 'ref', ref: 'jurusan' },
      { k: 'Angkatan', l: 'Angkatan', tipe: 'tahun' },
      { k: 'JenisKelamin', l: 'Jenis Kelamin', tipe: 'select', opsi: ['Laki-laki','Perempuan'] },
      { k: 'TanggalLahir', l: 'Tanggal Lahir', tipe: 'date' },
      { k: 'NamaWali', l: 'Nama Orang Tua/Wali' },
      { k: 'NoHPWali', l: 'No. WA Orang Tua/Wali' },
      { k: 'Alamat', l: 'Alamat', tipe: 'textarea', full: true },
      { k: 'IsKetuaKelas', l: 'Tunjuk sebagai Ketua Kelas', tipe: 'checkbox',
        bantu: 'Ketua kelas boleh merekam & membuat resume pertemuan.' },
      { k: 'Status', l: 'Status', tipe: 'select', opsi: ['Aktif','Nonaktif','Cuti','Lulus'] }
    ],
    kolom: [
      { key: 'NIM', label: 'NIM/NIS' },
      { key: 'Nama', label: 'Nama', render: function (r) {
          return '<div class="person">' + avatarHtml(r.Nama, r.FotoURL, 32) + '<div><strong>' +
                 esc(r.Nama) + '</strong>' + (String(r.IsKetuaKelas).toUpperCase() === 'TRUE'
                 ? ' <span class="badge badge-accent plain">Ketua Kelas</span>' : '') +
                 '<br><small class="muted">' + esc(r.Email || '-') + ' · ' + esc(r.NoHP || 'no WA belum diisi') +
                 '</small></div></div>'; } },
      { key: 'KelasID', label: 'Kelas', render: function (r) { return esc(namaKelas(r.KelasID)); } },
      { key: 'Angkatan', label: 'Angkatan', cls: 'num' },
      { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } }
    ]
  },
  dosen: {
    sheet: 'Dosen_Guru', label: 'Dosen / Guru', ikon: 'user-check', db: 'dosen',
    field: [
      { k: 'NIDN', l: 'NIDN / NIP' },
      { k: 'Nama', l: 'Nama Lengkap', wajib: true },
      { k: 'Gelar', l: 'Gelar' },
      { k: 'Email', l: 'Email' },
      { k: 'NoHP', l: 'No. WhatsApp' },
      { k: 'PenggunaID', l: 'Akun Login Terkait', tipe: 'ref', ref: 'penggunaDosen',
        bantu: 'Boleh dikosongkan — akun portal dibuat otomatis dari Email dengan kata sandi awal 123.' },
      { k: 'JurusanID', l: 'Jurusan/Prodi', tipe: 'ref', ref: 'jurusan' },
      { k: 'Alamat', l: 'Alamat', tipe: 'textarea', full: true },
      { k: 'Status', l: 'Status', tipe: 'select', opsi: ['Aktif','Nonaktif'] }
    ],
    kolom: [
      { key: 'NIDN', label: 'NIDN/NIP' },
      { key: 'Nama', label: 'Nama', render: function (r) {
          return '<div class="person">' + avatarHtml(r.Nama, r.FotoURL, 32) + '<div><strong>' +
                 esc(r.Nama) + '</strong><br><small class="muted">' + esc(r.Gelar || '-') + '</small></div></div>'; } },
      { key: 'Email', label: 'Email' },
      { key: 'NoHP', label: 'No. WhatsApp', render: function (r) {
          return r.NoHP ? '<span class="mono">' + esc(r.NoHP) + '</span>' : '<span class="muted">—</span>'; } },
      { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } }
    ]
  }
};

/** Sumber pilihan untuk field bertipe 'ref'. */
function sumberRef(nama) {
  if (nama === 'jurusan')  return { list: DB.jurusan,  label: function (x) { return x.Kode + ' — ' + x.Nama; } };
  if (nama === 'kurikulum')return { list: DB.kurikulum,label: function (x) { return x.Kode + ' — ' + x.Nama; } };
  if (nama === 'mapel')    return { list: DB.mapel,    label: function (x) { return x.Kode + ' — ' + x.Nama; } };
  if (nama === 'kelas')    return { list: DB.kelas,    label: function (x) { return x.Nama; } };
  if (nama === 'dosen')    return { list: DB.dosen,    label: function (x) { return x.Nama; } };
  if (nama === 'siswa')    return { list: DB.siswa,    label: function (x) { return x.NIM + ' — ' + x.Nama; } };
  if (nama === 'penggunaDosen') return {
    list: (DB.pengguna || []).filter(function (u) { return u.Peran === 'Dosen'; }),
    label: function (x) { return x.Nama + ' (' + x.Email + ')'; } };
  return { list: [], label: function (x) { return x.Nama; } };
}

/** Membangun satu field form dari definisi ENTITAS. */
function fieldHtml(f, data) {
  const v = data[f.k] === undefined ? '' : data[f.k];
  const req = f.wajib ? ' required' : '';
  const lbl = '<label class="label" for="f_' + f.k + '">' + esc(f.l) +
              (f.wajib ? ' <span class="req">*</span>' : '') + '</label>';
  let inp;

  if (f.tipe === 'textarea') {
    inp = '<textarea class="textarea" id="f_' + f.k + '" name="' + f.k + '"' + req + '>' + esc(v) + '</textarea>';
  } else if (f.tipe === 'select') {
    inp = '<select class="select" id="f_' + f.k + '" name="' + f.k + '"' + req + '>' +
          opsiSelect(f.opsi, null, null, v, '— Pilih —') + '</select>';
  } else if (f.tipe === 'ref') {
    const s = sumberRef(f.ref);
    inp = '<select class="select" id="f_' + f.k + '" name="' + f.k + '"' + req + '>' +
          opsiSelect(s.list, 'ID', s.label, v, '— Pilih —') + '</select>';
  } else if (f.tipe === 'ta') {
    /* Tahun Ajaran selalu dropdown dari master Periode (Upgrade 6) */
    inp = selectTahunAjaran(f.k, v, req);
  } else if (f.tipe === 'tahun') {
    inp = selectTahun(f.k, v, req);
  } else if (f.tipe === 'checkbox') {
    return '<div class="field' + (f.full ? ' full' : '') + '"><label class="checkbox">' +
           '<input type="checkbox" id="f_' + f.k + '" name="' + f.k + '"' +
           (String(v).toUpperCase() === 'TRUE' ? ' checked' : '') + '><span>' + esc(f.l) + '</span></label>' +
           (f.bantu ? '<p class="help">' + esc(f.bantu) + '</p>' : '') + '</div>';
  } else {
    inp = '<input class="input" type="' + (f.tipe || 'text') + '" id="f_' + f.k + '" name="' + f.k +
          '" value="' + esc(f.tipe === 'password' ? '' : v) + '"' + req + '>';
  }
  return '<div class="field' + (f.full ? ' full' : '') + '">' + lbl + inp +
         (f.bantu ? '<p class="help">' + esc(f.bantu) + '</p>' : '') + '</div>';
}

/** Modal tambah/ubah entitas master. */
function formEntitas(entKey, id) {
  const E = ENTITAS[entKey];
  const data = id ? byId(DB[E.db], id) : {};
  openModal({
    title: (id ? 'Ubah ' : 'Tambah ') + E.label,
    size: E.field.length > 7 ? 'wide' : '',
    body: '<form id="formEntitas" onsubmit="return false"><div class="form-grid">' +
          E.field.map(function (f) { return fieldHtml(f, data); }).join('') + '</div></form>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
          '<button class="btn btn-primary" id="btnSimpanEntitas">' + svgIcon('check', 18) + ' Simpan</button>',
    onOpen: function () {
      $('#btnSimpanEntitas').onclick = function () { simpanEntitas(entKey, id); };
    }
  });
}

function simpanEntitas(entKey, id) {
  if (!validForm('formEntitas')) return;
  const E = ENTITAS[entKey];
  const payload = nilaiForm('formEntitas');
  if (id) payload.ID = id;
  if (entKey === 'pengguna' && !payload.Password) delete payload.Password;

  const btn = $('#btnSimpanEntitas');
  btn.disabled = true; btn.innerHTML = svgIcon('refresh', 18) + ' Menyimpan…';

  api('apiSave', AppState.sessionToken, E.sheet, payload).then(function (res) {
    btn.disabled = false; btn.innerHTML = svgIcon('check', 18) + ' Simpan';
    if (!res.success) { showToast(res.message, 'error'); return; }
    closeModal();
    showToast(res.message, 'success');
    refreshData();
  }).catch(function (e) {
    btn.disabled = false; btn.innerHTML = svgIcon('check', 18) + ' Simpan';
    showToast(e.message, 'error');
  });
}

function hapusEntitas(entKey, id) {
  const E = ENTITAS[entKey];
  const rec = byId(DB[E.db], id);
  const ikutAkun = (entKey === 'siswa' || entKey === 'dosen')
    ? ' Akun portal miliknya juga akan ikut terhapus.' : '';
  konfirmasi('Hapus "' + (rec.Nama || rec.Pertanyaan || rec.Kode || 'data ini') + '"?' + ikutAkun +
    ' Tindakan ini tidak dapat dibatalkan.',
    function () {
      api('apiDelete', AppState.sessionToken, E.sheet, [id]).then(function (res) {
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) refreshData();
      }).catch(function (e) { showToast(e.message, 'error'); });
    }, { danger: true, labelYa: 'Hapus' });
}

/** Mengaktifkan satu periode; periode lain otomatis dinonaktifkan oleh server. */
function aktifkanPeriode(id) {
  const p = byId(DB.periode, id);
  konfirmasi('Jadikan periode ' + (p.TahunAjaran || '') + ' — ' + (p.Semester || '') +
    ' sebagai periode aktif? Periode aktif lainnya otomatis dinonaktifkan.', function () {
    api('apiSave', AppState.sessionToken, 'Periode', { ID: id, Status: 'Aktif' }).then(function (res) {
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) refreshData();
    }).catch(function (e) { showToast(e.message, 'error'); });
  }, { labelYa: 'Ya, Aktifkan' });
}

/** Entitas master yang menyediakan jalur impor Excel (Upgrade 4 & 5). */
const IMPOR_ENTITAS = { jurusan: 'jurusan', mapel: 'mapel', kelas: 'kelas', dosen: 'dosen', siswa: 'siswa' };

function tombolImpor(entKey) {
  const jenis = IMPOR_ENTITAS[entKey];
  if (!jenis) return '';
  return '<button class="btn btn-outline btn-sm" onclick="bukaImpor(\'' + jenis + '\')">' +
         '<i data-icon="upload"></i><span>Impor Excel</span></button>';
}

/** Kolom aksi standar (ubah + hapus) untuk tabel master. */
function kolomAksi(entKey) {
  return { key: '__aksi', label: 'Aksi', cls: 'act', render: function (r) {
    return '<button class="icon-btn" title="Ubah" onclick="formEntitas(\'' + entKey + '\',\'' + r.ID + '\')">' +
           svgIcon('edit', 18) + '</button>' +
           '<button class="icon-btn" title="Hapus" style="color:var(--error)" onclick="hapusEntitas(\'' + entKey + '\',\'' + r.ID + '\')">' +
           svgIcon('trash', 18) + '</button>';
  } };
}

/** Kerangka halaman daftar master: pencarian + tombol tambah + tabel. */
function halamanMaster(entKey, judul, sub) {
  const E = ENTITAS[entKey];
  const tid = 'tbl_' + entKey;
  return headerHalaman(judul || E.label, sub,
    tombolImpor(entKey) +
    '<button class="btn btn-primary" onclick="formEntitas(\'' + entKey + '\')">' +
    '<i data-icon="plus"></i><span>Tambah ' + esc(E.label) + '</span></button>') +
    '<section class="card"><div class="card-head">' +
    '<i data-icon="' + E.ikon + '"></i><h2>Daftar ' + esc(E.label) + '</h2>' +
    '<div class="spacer"></div>' +
    '<div class="input-icon" style="width:min(260px,50vw)"><i data-icon="search"></i>' +
    '<input class="input" type="search" placeholder="Cari…" oninput="cariTabelDebounced(\'' + tid + '\',this.value)"></div>' +
    '</div>' +
    tabelGenerik({ id: tid, data: DB[E.db] || [], kolom: E.kolom.concat([kolomAksi(entKey)]),
                   kosong: 'Belum ada ' + E.label.toLowerCase() + ' yang terdaftar.' }) +
    '</section>';
}

/* ==========================================================================
   B. HALAMAN BERSAMA
   ========================================================================== */

/* ---------- Profil Saya ---------- */
PAGES['profil'] = function () {
  const u = AppState.user;
  const p = DB.profil || {};
  const baris = function (l, v) {
    return '<div style="display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px solid var(--border-soft)">' +
           '<span class="muted">' + esc(l) + '</span><strong>' + esc(v || '-') + '</strong></div>';
  };
  return headerHalaman('Profil Saya', 'Informasi akun dan pengaturan keamanan.') +
    '<div class="grid grid-side">' +
      '<section class="card"><div class="card-head"><i data-icon="user"></i><h2>Data Diri</h2></div>' +
      '<div class="card-body">' +
        '<div class="foto-uploader">' +
          '<div class="foto-thumb" id="fotoThumb">' + avatarHtml(u.nama, u.fotoURL || p.FotoURL, 88) +
          '<button class="foto-edit" onclick="pilihFotoProfil()" aria-label="Ubah foto profil" title="Ubah foto profil">' +
          svgIcon('edit', 15) + '</button></div>' +
          '<div><div style="font-family:var(--font-head);font-size:20px;font-weight:700">' + esc(u.nama) + '</div>' +
          '<span class="badge badge-info plain">' + esc(u.peran) + '</span>' +
          '<p class="help" style="margin:8px 0 0">Klik ikon pensil untuk mengganti foto profil (JPG/PNG, maks 2MB).</p></div>' +
          '<input type="file" id="fileFotoProfil" accept="image/*" hidden onchange="unggahFotoProfil()">' +
        '</div>' +
        baris('Email', u.email) +
        (p.NIM ? baris('NIM / NIS', p.NIM) : '') +
        (p.NIDN ? baris('NIDN / NIP', p.NIDN) : '') +
        (p.KelasID ? baris('Kelas', namaKelas(p.KelasID)) : '') +
        (p.JurusanID ? baris('Jurusan/Prodi', namaJurusan(p.JurusanID)) : '') +
        (p.Angkatan ? baris('Angkatan', p.Angkatan) : '') +
        (p.NoHP ? baris('No. WhatsApp', p.NoHP) : '') +
        (String(p.IsKetuaKelas).toUpperCase() === 'TRUE' ? baris('Peran Kelas', 'Ketua Kelas') : '') +
        baris('Institusi', DB.institusi.NamaInstitusi) +
        baris('Tahun Ajaran', DB.institusi.TahunAjaran + ' — Semester ' + DB.institusi.SemesterAktif) +
      '</div></section>' +
      '<section class="card"><div class="card-head"><i data-icon="lock"></i><h2>Keamanan</h2></div>' +
      '<div class="card-body"><form id="formSandi" onsubmit="return false">' +
        '<div class="field"><label class="label" for="sandiLama">Kata Sandi Lama</label>' +
        '<input class="input" type="password" id="sandiLama" autocomplete="current-password" required></div>' +
        '<div class="field"><label class="label" for="sandiBaru">Kata Sandi Baru</label>' +
        '<input class="input" type="password" id="sandiBaru" autocomplete="new-password" required>' +
        '<p class="help">Minimal 6 karakter. Gunakan kombinasi huruf dan angka.</p></div>' +
        '<div class="field"><label class="label" for="sandiUlang">Ulangi Kata Sandi Baru</label>' +
        '<input class="input" type="password" id="sandiUlang" autocomplete="new-password" required></div>' +
        '<button class="btn btn-primary btn-block" onclick="gantiSandi()">' +
        '<i data-icon="check"></i><span>Perbarui Kata Sandi</span></button>' +
      '</form>' +
      '<hr class="hr">' +
      '<div class="row"><span class="muted text-sm">Tampilan aplikasi</span>' +
      '<button class="btn btn-outline btn-sm row-end" onclick="toggleTheme()">' +
      '<i data-icon="moon"></i><span>Ganti Mode Terang/Gelap</span></button></div>' +
      '</div></section>' +
    '</div>';
};

/* ---------- Unggah foto profil (Upgrade 12) ---------- */
function pilihFotoProfil() { $('#fileFotoProfil').click(); }

function unggahFotoProfil() {
  const input = $('#fileFotoProfil');
  if (!input.files.length) return;
  const thumb = $('#fotoThumb');
  const isiLama = thumb.innerHTML;
  thumb.innerHTML = '<span class="avatar" style="width:88px;height:88px">' + svgIcon('refresh', 22) + '</span>';

  bacaBerkas(input).then(function (file) {
    if (!file) throw new Error('Berkas tidak terbaca.');
    return api('apiUploadFotoProfil', AppState.sessionToken, file);
  }).then(function (res) {
    if (!res.success) { thumb.innerHTML = isiLama; showToast(res.message, 'error'); return; }
    AppState.user.fotoURL = res.data.fotoURL;
    if (DB.profil) DB.profil.FotoURL = res.data.fotoURL;
    thumb.innerHTML = avatarHtml(AppState.user.nama, res.data.fotoURL, 88) +
      '<button class="foto-edit" onclick="pilihFotoProfil()" aria-label="Ubah foto profil">' + svgIcon('edit', 15) + '</button>';
    perbaruiAvatarTopbar();
    showToast(res.message, 'success');
    input.value = '';
    refreshData(true);
  }).catch(function (e) {
    thumb.innerHTML = isiLama;
    showToast(e.message, 'error');
  });
}

function gantiSandi() {
  const lama = $('#sandiLama').value, baru = $('#sandiBaru').value, ulang = $('#sandiUlang').value;
  if (!lama || !baru) { showToast('Lengkapi seluruh kolom.', 'warning'); return; }
  if (baru.length < 6) { showToast('Kata sandi baru minimal 6 karakter.', 'warning'); return; }
  if (baru !== ulang) { showToast('Konfirmasi kata sandi tidak cocok.', 'error'); return; }
  api('apiChangePassword', AppState.sessionToken, lama, baru).then(function (res) {
    showToast(res.message, res.success ? 'success' : 'error');
    if (res.success) { $('#sandiLama').value = ''; $('#sandiBaru').value = ''; $('#sandiUlang').value = ''; }
  }).catch(function (e) { showToast(e.message, 'error'); });
}

/* ---------- Pusat Bantuan (Upgrade 11a — isi lengkap & dapat dikelola) ---------- */
PAGES['bantuan'] = function (ctx) {
  const isAdmin = AppState.user.peran === 'Super Admin';
  const peran = AppState.user.peran;
  const semua = (DB.bantuan || []).filter(function (b) {
    if (isAdmin) return true;                       // pengelola melihat semuanya, termasuk yang nonaktif
    if (String(b.Status).toLowerCase() !== 'aktif') return false;
    return !b.Peran || b.Peran === 'Semua' || b.Peran === peran;
  }).sort(function (a, b) { return (Number(a.Urutan) || 0) - (Number(b.Urutan) || 0); });

  const kategori = [];
  semua.forEach(function (b) { if (kategori.indexOf(b.Kategori) === -1) kategori.push(b.Kategori); });
  const aktif = ctx.kat || 'Semua';

  return headerHalaman('Pusat Bantuan',
    'Panduan penggunaan portal serta penyelesaian masalah yang sering terjadi.',
    '<div class="input-icon" style="width:min(300px,60vw)"><i data-icon="search"></i>' +
    '<input class="input" type="search" id="cariBantuan" placeholder="Cari pertanyaan atau kata kunci…" ' +
    'oninput="cariBantuan(this.value)"></div>' +
    (isAdmin ? '<button class="btn btn-primary" onclick="formEntitas(\'bantuan\')">' +
               '<i data-icon="plus"></i><span>Tambah Artikel</span></button>' : '')) +
    (isAdmin ? '<div class="alert alert-info"><i data-icon="info"></i><div><strong>Mode pengelola</strong>' +
      '<p>Anda dapat menambah, mengubah, dan menghapus artikel bantuan. Artikel berstatus Nonaktif ' +
      'hanya terlihat oleh Super Admin.</p></div></div>' : '') +
    '<div class="chip-row" style="margin-bottom:20px" id="katBantuan">' +
      '<button class="chip' + (aktif === 'Semua' ? ' active' : '') + '" onclick="filterKategoriBantuan(this,\'Semua\')">' +
      'Semua <span class="muted">(' + semua.length + ')</span></button>' +
      kategori.map(function (k) {
        const n = semua.filter(function (b) { return b.Kategori === k; }).length;
        return '<button class="chip" onclick="filterKategoriBantuan(this,\'' +
               esc(k).replace(/'/g, "\\'") + '\')">' + esc(k) + ' <span class="muted">(' + n + ')</span></button>';
      }).join('') +
    '</div>' +
    '<section class="card"><div class="card-body" id="daftarBantuan">' +
    (semua.length ? gambarDaftarBantuan(semua, isAdmin)
      : kosongState('help-circle', 'Belum ada artikel bantuan',
          isAdmin ? 'Klik Tambah Artikel untuk mulai mengisi Pusat Bantuan.'
                  : 'Hubungi Super Admin institusi Anda.')) +
    '</div></section>';
};

function gambarDaftarBantuan(list, isAdmin) {
  const grup = {};
  list.forEach(function (b) { (grup[b.Kategori] = grup[b.Kategori] || []).push(b); });
  return Object.keys(grup).map(function (kat) {
    return '<div class="bantuan-grup" data-kat="' + esc(kat) + '">' +
      '<h3 style="font-size:13px;margin:18px 0 10px;color:var(--on-surface-variant);' +
      'text-transform:uppercase;letter-spacing:.07em">' + esc(kat) + '</h3>' +
      grup[kat].map(function (b) {
        return '<details class="faq-item" data-cari="' +
          esc((b.Pertanyaan + ' ' + b.Jawaban + ' ' + b.Kategori).toLowerCase()) + '">' +
          '<summary>' + svgIcon('help-circle', 18) +
          '<span style="flex:1">' + esc(b.Pertanyaan) + '</span>' +
          (b.Peran && b.Peran !== 'Semua' ? '<span class="badge badge-neutral plain">' + esc(b.Peran) + '</span>' : '') +
          (String(b.Status).toLowerCase() !== 'aktif' ? '<span class="badge badge-error">Nonaktif</span>' : '') +
          (isAdmin ? '<span class="faq-act">' +
            '<button class="icon-btn" title="Ubah" onclick="event.preventDefault();event.stopPropagation();formEntitas(\'bantuan\',\'' + b.ID + '\')">' +
            svgIcon('edit', 16) + '</button>' +
            '<button class="icon-btn" title="Hapus" style="color:var(--error)" onclick="event.preventDefault();event.stopPropagation();hapusEntitas(\'bantuan\',\'' + b.ID + '\')">' +
            svgIcon('trash', 16) + '</button></span>' : '') +
          '</summary>' +
          '<div class="faq-body">' + esc(b.Jawaban).replace(/\n/g, '<br>') + '</div></details>';
      }).join('') + '</div>';
  }).join('');
}

function filterKategoriBantuan(btn, kat) {
  $$('#katBantuan .chip').forEach(function (c) { c.classList.remove('active'); });
  btn.classList.add('active');
  $$('#daftarBantuan .bantuan-grup').forEach(function (g) {
    g.style.display = (kat === 'Semua' || g.dataset.kat === kat) ? '' : 'none';
  });
  const cari = $('#cariBantuan');
  if (cari && cari.value) cariBantuan(cari.value);
}

const cariBantuan = debounce(function (q) {
  const kata = String(q || '').toLowerCase();
  $$('#daftarBantuan .faq-item').forEach(function (d) {
    const cocok = !kata || d.dataset.cari.indexOf(kata) !== -1;
    d.style.display = cocok ? '' : 'none';
    d.open = !!(kata && cocok);
  });
  $$('#daftarBantuan .bantuan-grup').forEach(function (g) {
    const adaTampil = $$('.faq-item', g).some(function (d) { return d.style.display !== 'none'; });
    g.style.display = adaTampil ? '' : 'none';
  });
}, 220);

/* ---------- Sumber Daya ---------- */
PAGES['resources'] = function () {
  const semua = (DB.materi || []).slice().sort(function (a, b) {
    return new Date(b.TanggalUpload) - new Date(a.TanggalUpload);
  });
  return headerHalaman('Sumber Daya', 'Seluruh materi dan resume pertemuan yang tersedia untuk Anda.') +
    '<section class="card">' + (semua.length
      ? semua.map(kartuMateriBaris).join('')
      : kosongState('folder', 'Belum ada sumber daya', 'Materi yang diunggah pengajar akan muncul di sini.')) +
    '</section>';
};

function kartuMateriBaris(m) {
  const ikon = { 'YouTube': 'video', 'Gambar': 'image', 'Resume Pertemuan': 'sparkles' }[m.Jenis] || 'file-text';
  return '<div class="list-item">' +
    '<div class="li-ico">' + svgIcon(ikon, 20) + '</div>' +
    '<div class="li-main"><strong>' + esc(m.Judul) + '</strong>' +
    '<small>' + esc(namaMapel(m.MapelID)) + ' · Pertemuan ' + esc(m.Pertemuan) + ' · ' + esc(fmtTgl(m.TanggalUpload)) + '</small></div>' +
    '<div class="li-side">' +
    (m.Jenis === 'Resume Pertemuan' ? '<span class="badge badge-accent plain">Resume</span>' : '') +
    '<button class="btn btn-outline btn-sm" onclick="bukaMateri(\'' + m.ID + '\')">' +
    svgIcon('eye', 16) + ' Lihat</button></div></div>';
}

function bukaMateri(id) {
  const m = byId(DB.materi, id);
  if (!m.ID) { showToast('Materi tidak ditemukan.', 'error'); return; }
  if (m.Jenis === 'YouTube') {
    openModal({ title: m.Judul, size: 'wide',
      body: '<iframe class="preview-frame" src="' + esc(m.URL) + '" allow="accelerometer;autoplay;encrypted-media;picture-in-picture" allowfullscreen title="Video materi"></iframe>' +
            (m.Deskripsi ? '<p class="muted mt4">' + esc(m.Deskripsi) + '</p>' : ''),
      foot: '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>' });
    return;
  }
  const unduh = m.FileID ? 'https://drive.google.com/uc?export=download&id=' + m.FileID : '';
  previewFile(m.URL, m.Judul, unduh);
}

/* ---------- Jadwal (tabel + kalender) ---------- */
PAGES['jadwal'] = function () {
  return headerHalaman('Jadwal Pembelajaran', 'Tabel dan kalender mingguan kelas Anda.',
    '<div class="seg" id="segJadwal">' +
    '<button class="active" onclick="ubahTampilanJadwal(\'tabel\')">Tabel</button>' +
    '<button onclick="ubahTampilanJadwal(\'kalender\')">Kalender</button></div>') +
    '<div id="jadwalWrap"></div>';
};
PAGE_INIT['jadwal'] = function () { ubahTampilanJadwal('tabel'); };

function ubahTampilanJadwal(mode) {
  $$('#segJadwal button').forEach(function (b, i) {
    b.classList.toggle('active', (mode === 'tabel' && i === 0) || (mode === 'kalender' && i === 1));
  });
  const wrap = $('#jadwalWrap');
  wrap.innerHTML = mode === 'tabel' ? jadwalTabel(DB.jadwal || []) : jadwalKalender(DB.jadwal || []);
  renderIcons(wrap);
}

function jadwalTabel(data) {
  const hari = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const konflik = deteksiKonflikLokal(data);
  return hari.map(function (h) {
    const rows = data.filter(function (j) { return j.Hari === h; })
                     .sort(function (a, b) { return String(a.JamMulai).localeCompare(String(b.JamMulai)); });
    if (!rows.length) return '';
    return '<section class="card" style="margin-bottom:16px"><div class="card-head">' +
      '<h2>' + h + '</h2><span class="badge badge-neutral plain">' + rows.length + ' Kelas</span></div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th>Waktu</th><th>Mata Pelajaran</th><th>Kelas</th><th>Ruangan</th><th>Pengampu</th></tr></thead><tbody>' +
      rows.map(function (j) {
        const bentrok = konflik[j.ID];
        return '<tr class="' + (bentrok ? 'row-danger' : '') + '">' +
          '<td class="nowrap">' + (bentrok ? svgIcon('alert-triangle', 15) + ' ' : '') +
          esc(j.JamMulai) + ' – ' + esc(j.JamSelesai) + '</td>' +
          '<td><strong>' + esc(namaMapel(j.MapelID)) + '</strong><br><small class="muted">' + esc(kodeMapel(j.MapelID)) + '</small></td>' +
          '<td>' + esc(namaKelas(j.KelasID)) + '</td>' +
          '<td>' + esc(j.Ruangan || '-') + '</td>' +
          '<td><div class="person">' + avatarDosen(j.DosenID, 30) +
          '<span>' + esc(namaDosen(j.DosenID)) + '</span></div></td></tr>';
      }).join('') + '</tbody></table></div></section>';
  }).join('') || kosongState('calendar', 'Belum ada jadwal', 'Jadwal pembelajaran belum disusun untuk periode ini.');
}

function jadwalKalender(data) {
  const hari = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const jam = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'];
  const konflik = deteksiKonflikLokal(data);
  const cellFor = function (h, j) {
    const jm = parseInt(j, 10);
    const ev = data.filter(function (x) {
      return x.Hari === h && parseInt(String(x.JamMulai), 10) === jm;
    });
    return ev.map(function (x) {
      return '<div class="ev ' + (konflik[x.ID] ? 'conflict' : '') + '">' +
        '<strong>' + esc(namaMapel(x.MapelID)) + '</strong>' +
        '<small>' + esc(x.Ruangan || '-') + '</small>' +
        '<small>' + esc(namaDosen(x.DosenID)) + '</small></div>';
    }).join('');
  };
  return '<section class="card"><div class="card-body tight"><div class="table-wrap"><table class="cal"><thead><tr>' +
    '<th class="hourcol"></th>' + hari.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
    '</tr></thead><tbody>' +
    jam.map(function (j) {
      return '<tr><td class="hourcol">' + j + '</td>' +
        hari.map(function (h) { return '<td>' + cellFor(h, j) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div></div></section>';
}

/** Deteksi konflik jadwal di sisi klien (instan, tanpa panggilan server). */
function deteksiKonflikLokal(data) {
  const out = {};
  const m = function (t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+(p[1] || 0)); };
  for (let i = 0; i < data.length; i++) {
    for (let k = i + 1; k < data.length; k++) {
      const a = data[i], b = data[k];
      if (a.Hari !== b.Hari) continue;
      if (!(m(a.JamMulai) < m(b.JamSelesai) && m(b.JamMulai) < m(a.JamSelesai))) continue;
      if (a.DosenID === b.DosenID || a.Ruangan === b.Ruangan || a.KelasID === b.KelasID) {
        out[a.ID] = true; out[b.ID] = true;
      }
    }
  }
  return out;
}
/* ==========================================================================
   C. SUPER ADMIN
   ========================================================================== */

PAGES['admin-dashboard'] = function () {
  const s = DB.statistik || {};
  return headerHalaman('Dashboard Admin', 'Ringkasan data master, pengguna, dan status sistem.',
    '<button class="btn btn-outline" onclick="refreshData()"><i data-icon="refresh"></i><span>Segarkan</span></button>' +
    '<button class="btn btn-primary" onclick="unduhRingkasan()"><i data-icon="download"></i><span>Ekspor Ringkasan</span></button>') +
    '<div class="kpi-grid">' +
      kpiCard({ ikon: 'graduation-cap', label: 'Siswa / Mahasiswa', nilai: s.totalSiswa || 0, tint: 'var(--sc-high)' }) +
      kpiCard({ ikon: 'user-check', label: 'Dosen / Guru', nilai: s.totalDosen || 0, tint: 'var(--sc-high)' }) +
      kpiCard({ ikon: 'users', label: 'Kelas Aktif', nilai: s.totalKelas || 0, tint: 'var(--accent-soft)', ink: 'var(--accent-ink)' }) +
      kpiCard({ ikon: 'building', label: 'Jurusan / Prodi', nilai: s.totalJurusan || 0, tint: 'var(--sc-high)' }) +
    '</div>' +
    '<div class="grid grid-side" style="margin-bottom:16px">' +
      '<section class="card"><div class="card-head"><i data-icon="trending-up"></i>' +
      '<h2>Sebaran Siswa per Jurusan</h2><div class="spacer"></div>' +
      '<span class="badge badge-info plain">Laki-laki</span>' +
      '<span class="badge badge-accent plain">Perempuan</span></div>' +
      '<div class="card-body"><div class="chart-box tall"><canvas id="chJurusan"></canvas></div></div></section>' +
      '<section class="card"><div class="card-head"><i data-icon="sparkles"></i><h2>Aksi Cepat</h2></div>' +
      '<div class="card-body stack">' +
        aksiCepat('Tambah Siswa', 'Daftarkan peserta didik baru', 'graduation-cap', "formEntitas('siswa')") +
        aksiCepat('Buat Kelas', 'Susun rombongan belajar baru', 'users', "formEntitas('kelas')") +
        aksiCepat('Atur Jadwal', 'Kelola timetable & ruangan', 'calendar', "navigateTo('admin-jadwal')") +
        aksiCepat('Kirim Pengumuman', 'Broadcast Email / WhatsApp', 'megaphone', "navigateTo('admin-notifikasi')") +
      '</div></section>' +
    '</div>' +
    '<div class="grid grid-side">' +
      '<section class="card"><div class="card-head"><i data-icon="clock"></i><h2>Aktivitas Terbaru</h2></div>' +
      logAktivitas() + '</section>' +
      '<section class="card"><div class="card-head"><i data-icon="shield"></i><h2>Status Sistem</h2></div>' +
      '<div class="card-body">' + statusSistem() + '</div></section>' +
    '</div>' +
    '<div class="insight mt4"><div class="insight-head">' + svgIcon('sparkles', 18) + ' Analisis Otomatis</div>' +
    '<ul>' + wawasanAdmin(s).map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul></div>';
};

PAGE_INIT['admin-dashboard'] = function () {
  const s = DB.statistik || {};
  const w = warnaTema();
  const pj = s.perJurusan || [];
  /* Grafik tren dua warna: Laki-laki vs Perempuan (Upgrade 3) */
  const adaBelumDiisi = pj.some(function (x) { return (x.belumDiisi || 0) > 0; });
  const dataset = [
    { label: 'Laki-laki', data: pj.map(function (x) { return x.laki || 0; }),
      backgroundColor: w.primary, borderColor: w.primary, borderRadius: 6, maxBarThickness: 34 },
    { label: 'Perempuan', data: pj.map(function (x) { return x.perempuan || 0; }),
      backgroundColor: w.accent, borderColor: w.accent, borderRadius: 6, maxBarThickness: 34 }
  ];
  if (adaBelumDiisi) {
    dataset.push({ label: 'Belum diisi', data: pj.map(function (x) { return x.belumDiisi || 0; }),
      backgroundColor: 'rgba(116,119,127,.45)', borderRadius: 6, maxBarThickness: 34 });
  }

  buatChart('chJurusan', {
    type: 'bar',
    data: { labels: pj.map(function (x) { return x.kode || x.label; }), datasets: dataset },
    options: {
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: { callbacks: { footer: function (item) {
          const i = item[0].dataIndex;
          return 'Total: ' + (pj[i].value || 0) + ' siswa';
        } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: w.ink, font: { family: 'Inter', size: 11 } } },
        y: { grid: { color: w.grid }, border: { display: false }, beginAtZero: true,
             ticks: { color: w.ink, font: { family: 'Inter', size: 11 }, precision: 0 } }
      }
    }
  });
};

function aksiCepat(judul, sub, ikon, onclick) {
  return '<button class="list-item" style="width:100%;text-align:left;background:var(--sc-low);border:1px solid var(--border-soft);' +
    'border-radius:var(--r-md);cursor:pointer;padding:14px" onclick="' + onclick + '">' +
    '<span class="li-ico">' + svgIcon(ikon, 20) + '</span>' +
    '<span class="li-main"><strong>' + esc(judul) + '</strong><small>' + esc(sub) + '</small></span>' +
    svgIcon('log-in', 18) + '</button>';
}

function logAktivitas() {
  const items = [];
  (DB.logNotif || []).slice(-4).reverse().forEach(function (l) {
    items.push({ ikon: l.Channel === 'WA' ? 'send' : 'mail',
                 teks: 'Notifikasi <b>' + esc(l.Subjek) + '</b> ke ' + esc(l.Penerima),
                 waktu: fmtTgl(l.Timestamp, true) });
  });
  (DB.statusNilai || []).slice(-3).reverse().forEach(function (s) {
    items.push({ ikon: 'star', teks: 'Nilai <b>' + esc(namaMapel(s.MapelID)) + '</b> berstatus ' + esc(s.Status),
                 waktu: fmtTgl(s.ValidatedAt || s.SubmittedAt, true) });
  });
  if (!items.length) return '<div class="card-body">' + kosongState('inbox', 'Belum ada aktivitas', 'Aktivitas sistem akan tercatat di sini.') + '</div>';
  return items.slice(0, 6).map(function (i) {
    return '<div class="list-item"><div class="li-ico">' + svgIcon(i.ikon, 20) + '</div>' +
      '<div class="li-main"><strong style="font-weight:500">' + i.teks + '</strong><small>' + esc(i.waktu) + '</small></div></div>';
  }).join('');
}

function statusSistem() {
  const f = DB.fitur || {};
  const baris = function (label, aktif, nilai) {
    return '<div class="row" style="padding:11px 0;border-bottom:1px solid var(--border-soft)">' +
      '<span>' + esc(label) + '</span><span class="row-end">' +
      (nilai !== undefined ? '<strong>' + esc(nilai) + '</strong>'
        : '<span class="badge ' + (aktif ? 'badge-success' : 'badge-neutral') + '">' + (aktif ? 'Aktif' : 'Nonaktif') + '</span>') +
      '</span></div>';
  };
  return baris('Manajemen SPP', f.spp) + baris('Absensi Barcode', f.barcode) + baris('Absensi Lokasi (GPS)', f.geo) +
    baris('Notifikasi Email', String(DB.institusi.NotifEmail).toUpperCase() === 'TRUE') +
    baris('Notifikasi WhatsApp', String(DB.institusi.NotifWA).toUpperCase() === 'TRUE') +
    baris('Tahun Ajaran', true, DB.institusi.TahunAjaran + ' / ' + DB.institusi.SemesterAktif) +
    baris('KKM', true, DB.institusi.KKM || 70);
}

function wawasanAdmin(s) {
  const out = [];
  const rasio = s.totalDosen ? (s.totalSiswa / s.totalDosen).toFixed(1) : 0;
  out.push('Rasio pendidik terhadap peserta didik saat ini <b>1 : ' + rasio + '</b>' +
    (rasio > 30 ? ' — pertimbangkan menambah pengampu.' : ' — masih dalam batas ideal.'));
  if (s.pendingValidasi) out.push('<b>' + s.pendingValidasi + '</b> berkas nilai menunggu validasi Tim Akademik.');
  if (s.dikembalikan) out.push('<b>' + s.dikembalikan + '</b> berkas nilai dikembalikan untuk revisi oleh dosen.');
  if (s.persenKehadiran !== undefined) {
    out.push('Tingkat kehadiran keseluruhan <b>' + s.persenKehadiran + '%</b>' +
      (s.persenKehadiran < 80 ? ' — di bawah ambang sehat 80%, perlu tindak lanjut wali kelas.' : ' — tergolong baik.'));
  }
  if (s.totalRemedial) out.push('<b>' + s.totalRemedial + '</b> peserta didik tercatat perlu remedial/pengulangan.');
  if (s.pengumpulan && (s.pengumpulan.tepat + s.pengumpulan.telat)) {
    const t = s.pengumpulan.tepat, l = s.pengumpulan.telat;
    out.push('Ketepatan pengumpulan tugas <b>' + Math.round(t / (t + l) * 100) + '%</b> (' + t + ' tepat waktu, ' + l + ' terlambat).');
  }
  if (out.length === 1) out.push('Data operasional masih sedikit — analisis akan makin akurat seiring bertambahnya aktivitas.');
  return out;
}

function unduhRingkasan() {
  const s = DB.statistik || {};
  const baris = [
    ['Institusi', DB.institusi.NamaInstitusi],
    ['Tahun Ajaran', DB.institusi.TahunAjaran + ' - ' + DB.institusi.SemesterAktif],
    ['Total Siswa', s.totalSiswa], ['Total Dosen', s.totalDosen], ['Total Kelas', s.totalKelas],
    ['Total Mata Pelajaran', s.totalMapel], ['Menunggu Validasi', s.pendingValidasi],
    ['Tervalidasi Bulan Ini', s.tervalidasiBulanIni], ['Persentase Kehadiran', (s.persenKehadiran || 0) + '%']
  ];
  const csv = 'Indikator,Nilai\n' + baris.map(function (b) { return '"' + b[0] + '","' + (b[1] === undefined ? '' : b[1]) + '"'; }).join('\n');
  unduhBase64(btoa(unescape(encodeURIComponent(csv))), 'text/csv', 'Ringkasan_LMS.csv');
}

/* ---------- Data Master (bertab) ---------- */
PAGES['admin-master'] = function (ctx) {
  const aktif = ctx.tab || 'periode';
  const tabs = [['periode','Periode','calendar'], ['jurusan','Jurusan/Prodi','building'],
                ['kurikulum','Kurikulum','library'], ['mapel','Mata Pelajaran','book-open'],
                ['kelas','Kelas','users'], ['program','Program Kelas','grid'],
                ['dosen','Dosen/Guru','user-check']];
  if (DB.fitur.spp) tabs.push(['jenisTagihan','Jenis Tagihan','wallet']);
  const pa = periodeAktif();
  return headerHalaman('Data Master', 'Kelola struktur akademik institusi Anda.') +
    (pa.TahunAjaran
      ? '<div class="alert alert-info"><i data-icon="calendar"></i><div><strong>Periode aktif: ' +
        esc(pa.TahunAjaran) + ' — Semester ' + esc(pa.Semester) + '</strong>' +
        '<p>Seluruh dropdown Tahun &amp; Tahun Ajaran di aplikasi mengambil datanya dari tab Periode.</p></div></div>'
      : '<div class="alert alert-warn"><i data-icon="alert-triangle"></i><div><strong>Belum ada periode aktif</strong>' +
        '<p>Aktifkan satu periode pada tab Periode agar dropdown Tahun Ajaran terisi.</p></div></div>') +
    '<div class="tabs">' + tabs.map(function (t) {
      return '<button class="tab' + (t[0] === aktif ? ' active' : '') + '" ' +
             'onclick="navigateTo(\'admin-master\',{ctx:{tab:\'' + t[0] + '\'},noHistory:true})">' +
             '<i data-icon="' + t[2] + '"></i>' + esc(t[1]) + '</button>';
    }).join('') + '</div>' +
    '<div id="masterBody">' + halamanMasterInline(aktif) + '</div>';
};
PAGE_INIT['admin-master'] = function (ctx) { gambarTabel('tbl_' + (ctx.tab || 'periode')); };

function halamanMasterInline(entKey) {
  const E = ENTITAS[entKey];
  const tid = 'tbl_' + entKey;
  return '<section class="card"><div class="card-head">' +
    '<i data-icon="' + E.ikon + '"></i><h2>' + esc(E.label) + '</h2><div class="spacer"></div>' +
    '<div class="input-icon" style="width:min(240px,45vw)"><i data-icon="search"></i>' +
    '<input class="input" type="search" placeholder="Cari…" oninput="cariTabelDebounced(\'' + tid + '\',this.value)"></div>' +
    tombolImpor(entKey) +
    '<button class="btn btn-primary btn-sm" onclick="formEntitas(\'' + entKey + '\')">' +
    '<i data-icon="plus"></i><span>Tambah</span></button></div>' +
    tabelGenerik({ id: tid, data: DB[E.db] || [], kolom: E.kolom.concat([kolomAksi(entKey)]),
                   kosong: 'Belum ada ' + E.label.toLowerCase() + '.' }) + '</section>';
}

/* ---------- Pengguna ---------- */
PAGES['admin-pengguna'] = function () {
  const E = ENTITAS.pengguna;
  const kol = E.kolom.concat([{ key: '__aksi', label: 'Aksi', cls: 'act', render: function (r) {
    return '<button class="icon-btn" title="Ubah" onclick="formEntitas(\'pengguna\',\'' + r.ID + '\')">' + svgIcon('edit', 18) + '</button>' +
      '<button class="icon-btn" title="Reset kata sandi" onclick="resetSandi(\'' + r.ID + '\')">' + svgIcon('unlock', 18) + '</button>' +
      '<button class="icon-btn" title="Hapus" style="color:var(--error)" onclick="hapusEntitas(\'pengguna\',\'' + r.ID + '\')">' + svgIcon('trash', 18) + '</button>';
  } }]);
  const perPeran = ['Super Admin','Tim Akademik','Dosen','Siswa'].map(function (p) {
    const n = (DB.pengguna || []).filter(function (u) { return u.Peran === p; }).length;
    return '<span class="badge badge-neutral plain">' + esc(p) + ': <b>' + n + '</b></span>';
  }).join(' ');
  return headerHalaman('Kelola Pengguna', 'Akun untuk semua peran beserta status aksesnya.',
    '<button class="btn btn-primary" onclick="formEntitas(\'pengguna\')"><i data-icon="plus"></i><span>Tambah Akun</span></button>') +
    '<div class="row" style="margin-bottom:16px">' + perPeran + '</div>' +
    '<section class="card"><div class="card-head"><i data-icon="shield"></i><h2>Daftar Akun</h2><div class="spacer"></div>' +
    '<div class="input-icon" style="width:min(260px,50vw)"><i data-icon="search"></i>' +
    '<input class="input" type="search" placeholder="Cari nama / email…" oninput="cariTabelDebounced(\'tbl_pengguna\',this.value)"></div></div>' +
    tabelGenerik({ id: 'tbl_pengguna', data: DB.pengguna || [], kolom: kol, kosong: 'Belum ada akun pengguna.' }) +
    '</section>';
};
PAGE_INIT['admin-pengguna'] = function () { gambarTabel('tbl_pengguna'); };

function resetSandi(id) {
  const u = byId(DB.pengguna, id);
  openModal({
    title: 'Reset Kata Sandi', size: 'slim',
    body: '<p>Setel kata sandi baru untuk <b>' + esc(u.Nama) + '</b>.</p>' +
      '<div class="field"><label class="label" for="sandiReset">Kata Sandi Baru</label>' +
      '<input class="input" id="sandiReset" type="text" value="lms12345"></div>' +
      '<p class="help">Sampaikan sandi ini ke pengguna dan minta segera menggantinya.</p>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-primary" id="btnReset">Reset Sekarang</button>',
    onOpen: function () {
      $('#btnReset').onclick = function () {
        api('apiResetPassword', AppState.sessionToken, id, $('#sandiReset').value).then(function (res) {
          closeModal(); showToast(res.message, res.success ? 'success' : 'error');
        }).catch(function (e) { showToast(e.message, 'error'); });
      };
    }
  });
}

/* ---------- Siswa/Mahasiswa ---------- */
PAGES['admin-siswa'] = function () {
  return halamanMaster('siswa', 'Data Siswa / Mahasiswa',
    'Biodata lengkap, kelas aktif, dan penetapan ketua kelas. Akun portal dibuat otomatis dari email — ' +
    'gunakan Impor Excel untuk pendaftaran massal.');
};
PAGE_INIT['admin-siswa'] = function () { gambarTabel('tbl_siswa'); };

/* ---------- Jadwal (Admin) ---------- */
PAGES['admin-jadwal'] = function () {
  const konflik = deteksiKonflikLokal(DB.jadwal || []);
  const jml = Object.keys(konflik).length;
  /* Setiap sel dapat disunting langsung dengan sekali klik (Upgrade 9) */
  const kol = [
    { key: 'Hari', label: 'Hari', render: function (r) { return selEdit(r.ID, 'Hari', r.Hari, 'hari'); } },
    { key: '__jam', label: 'Waktu', render: function (r) {
        return (konflik[r.ID] ? '<span style="color:var(--error)" title="Bentrok">' + svgIcon('alert-triangle', 14) + '</span> ' : '') +
               selEdit(r.ID, 'JamMulai', r.JamMulai, 'time') + ' – ' +
               selEdit(r.ID, 'JamSelesai', r.JamSelesai, 'time'); } },
    { key: 'MapelID', label: 'Mata Pelajaran', render: function (r) {
        return selEdit(r.ID, 'MapelID', r.MapelID, 'mapel'); } },
    { key: 'KelasID', label: 'Kelas', render: function (r) {
        return selEdit(r.ID, 'KelasID', r.KelasID, 'kelas'); } },
    { key: 'Ruangan', label: 'Ruangan', render: function (r) {
        return selEdit(r.ID, 'Ruangan', r.Ruangan, 'text'); } },
    { key: 'DosenID', label: 'Pengampu', render: function (r) {
        return selEdit(r.ID, 'DosenID', r.DosenID, 'dosen'); } },
    { key: 'Semester', label: 'Smt', cls: 'num', render: function (r) {
        return selEdit(r.ID, 'Semester', r.Semester, 'semester'); } },
    { key: '__aksi', label: 'Aksi', cls: 'act', render: function (r) {
        return '<button class="icon-btn" title="Ubah lengkap" onclick="formJadwal(\'' + r.ID + '\')">' + svgIcon('edit', 18) + '</button>' +
               '<button class="icon-btn" title="Hapus" style="color:var(--error)" onclick="hapusJadwal(\'' + r.ID + '\')">' + svgIcon('trash', 18) + '</button>'; } }
  ];
  const data = (DB.jadwal || []).map(function (j) {
    return Object.assign({}, j, { __rowCls: konflik[j.ID] ? 'row-danger' : '' });
  });

  return (jml ? '<div class="alert alert-error"><i data-icon="alert-triangle"></i>' +
      '<div><strong>Konflik jadwal terdeteksi</strong>' +
      '<p>' + jml + ' sesi bentrok (pengampu, ruangan, atau kelas yang sama pada waktu beririsan).</p></div>' +
      '<button class="alert-action" onclick="navigateTo(\'jadwal\')">Lihat Kalender</button></div>' : '') +
    headerHalaman('Manajemen Jadwal',
      'Klik langsung pada sel mana pun di tabel untuk mengubahnya tanpa membuka formulir.',
      '<button class="btn btn-outline" onclick="bukaImpor(\'jadwal\')"><i data-icon="upload"></i><span>Impor Excel</span></button>' +
      '<button class="btn btn-primary" onclick="formJadwal()"><i data-icon="plus"></i><span>Tambah Jadwal</span></button>') +
    '<section class="card"><div class="card-head"><i data-icon="calendar"></i><h2>Seluruh Jadwal</h2><div class="spacer"></div>' +
    '<div class="input-icon" style="width:min(240px,45vw)"><i data-icon="search"></i>' +
    '<input class="input" type="search" placeholder="Cari…" oninput="cariTabelDebounced(\'tbl_jadwal\',this.value)"></div></div>' +
    tabelGenerik({ id: 'tbl_jadwal', data: data, kolom: kol, perPage: 12, kosong: 'Belum ada jadwal tersusun.' }) +
    '</section>';
};
PAGE_INIT['admin-jadwal'] = function () { gambarTabel('tbl_jadwal'); };

/* ==========================================================================
   C2. EDIT LANGSUNG DI SEL TABEL (Upgrade 9)
   ========================================================================== */

/** Sumber pilihan untuk setiap tipe sel yang dapat disunting. */
function opsiSel(tipe) {
  if (tipe === 'hari')     return { list: ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'], teks: null };
  if (tipe === 'semester') return { list: ['1','2','3','4','5','6','7','8'], teks: null };
  if (tipe === 'mapel')    return { list: DB.mapel, kunci: 'ID', teks: function (x) { return x.Kode + ' — ' + x.Nama; } };
  if (tipe === 'kelas')    return { list: DB.kelas, kunci: 'ID', teks: 'Nama' };
  if (tipe === 'dosen')    return { list: DB.dosen, kunci: 'ID', teks: 'Nama' };
  if (tipe === 'ta')       return { list: daftarTahunAjaran(), teks: null };
  return null;
}

/** Teks yang ditampilkan pada sel sesuai tipenya. */
function tampilNilaiSel(tipe, nilai) {
  if (tipe === 'mapel') return namaMapel(nilai);
  if (tipe === 'kelas') return namaKelas(nilai);
  if (tipe === 'dosen') return namaDosen(nilai);
  return nilai === '' || nilai === undefined || nilai === null ? '—' : String(nilai);
}

/** Merender satu sel yang dapat disunting langsung. */
function selEdit(id, field, nilai, tipe) {
  return '<span class="cell-edit" data-id="' + esc(id) + '" data-field="' + esc(field) + '" ' +
         'data-tipe="' + esc(tipe) + '" data-nilai="' + esc(nilai === undefined ? '' : nilai) + '" ' +
         'tabindex="0" role="button" title="Klik untuk mengubah" ' +
         'onclick="mulaiEditSel(this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();mulaiEditSel(this);}">' +
         esc(tampilNilaiSel(tipe, nilai)) + '</span>';
}

let SEL_AKTIF = null;

function mulaiEditSel(el) {
  if (el.classList.contains('editing')) return;
  if (SEL_AKTIF && SEL_AKTIF !== el) batalEditSel(SEL_AKTIF);

  const tipe = el.dataset.tipe;
  const nilai = el.dataset.nilai || '';
  el.dataset.teksLama = el.textContent;
  el.classList.add('editing');
  SEL_AKTIF = el;

  const opsi = opsiSel(tipe);
  if (opsi) {
    el.innerHTML = '<select>' + opsiSelect(opsi.list, opsi.kunci, opsi.teks, nilai, '— Pilih —') + '</select>';
  } else if (tipe === 'time') {
    el.innerHTML = '<input type="time" value="' + esc(nilai) + '">';
  } else if (tipe === 'number') {
    el.innerHTML = '<input type="number" value="' + esc(nilai) + '">';
  } else {
    el.innerHTML = '<input type="text" value="' + esc(nilai) + '">';
  }

  const kontrol = el.firstChild;
  kontrol.focus();
  if (kontrol.select) { try { kontrol.select(); } catch (e) {} }

  kontrol.onblur = function () { simpanEditSel(el); };
  kontrol.onkeydown = function (e) {
    if (e.key === 'Enter') { e.preventDefault(); kontrol.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); batalEditSel(el); }
  };
  if (kontrol.tagName === 'SELECT') kontrol.onchange = function () { kontrol.blur(); };
}

function batalEditSel(el) {
  el.classList.remove('editing');
  el.textContent = el.dataset.teksLama || tampilNilaiSel(el.dataset.tipe, el.dataset.nilai);
  if (SEL_AKTIF === el) SEL_AKTIF = null;
}

function simpanEditSel(el) {
  if (!el.classList.contains('editing')) return;
  const kontrol = el.firstChild;
  if (!kontrol) { batalEditSel(el); return; }
  const baru = String(kontrol.value === undefined ? '' : kontrol.value);
  const lama = el.dataset.nilai || '';
  el.classList.remove('editing');
  if (SEL_AKTIF === el) SEL_AKTIF = null;

  if (baru === lama) { el.textContent = el.dataset.teksLama; return; }

  /* PRINSIP 2 — Optimistic UI: tampilan berubah lebih dulu, server menyusul */
  el.dataset.nilai = baru;
  el.textContent = tampilNilaiSel(el.dataset.tipe, baru);
  el.classList.add('cell-saved');
  setTimeout(function () { el.classList.remove('cell-saved'); }, 900);

  const id = el.dataset.id, field = el.dataset.field;
  const payload = { ID: id };
  payload[field] = baru;

  /* Perbarui cache klien agar deteksi konflik & tampilan lain ikut menyesuaikan */
  const rec = byId(DB.jadwal, id);
  if (rec.ID) rec[field] = baru;

  api('apiSave', AppState.sessionToken, 'Jadwal', payload).then(function (res) {
    if (!res.success) {
      /* Kembalikan nilai lama bila server menolak */
      el.dataset.nilai = lama;
      el.textContent = tampilNilaiSel(el.dataset.tipe, lama);
      if (rec.ID) rec[field] = lama;
      showToast(res.message, 'error');
      return;
    }
    showToast('Perubahan tersimpan.', 'success');
    periksaKonflikSetelahEdit();
  }).catch(function (e) {
    el.dataset.nilai = lama;
    el.textContent = tampilNilaiSel(el.dataset.tipe, lama);
    if (rec.ID) rec[field] = lama;
    showToast(e.message, 'error');
  });
}

/** Menyorot ulang baris bentrok setelah sel jadwal diubah. */
function periksaKonflikSetelahEdit() {
  const konflik = deteksiKonflikLokal(DB.jadwal || []);
  $$('#tbl_jadwal tbody tr').forEach(function (tr) {
    const sel = tr.querySelector('.cell-edit');
    if (!sel) return;
    tr.classList.toggle('row-danger', !!konflik[sel.dataset.id]);
  });
  const jml = Object.keys(konflik).length;
  const banner = $('.alert.alert-error');
  if (banner && banner.querySelector('strong') &&
      banner.querySelector('strong').textContent.indexOf('Konflik') === 0) {
    banner.hidden = jml === 0;
    if (jml) banner.querySelector('p').textContent =
      jml + ' sesi bentrok (pengampu, ruangan, atau kelas yang sama pada waktu beririsan).';
  }
}

function formJadwal(id) {
  const d = id ? byId(DB.jadwal, id) : {};
  openModal({
    title: (id ? 'Ubah' : 'Tambah') + ' Jadwal', size: 'wide',
    body: '<form id="formJadwalEl" onsubmit="return false"><div class="form-grid">' +
      '<div class="field"><label class="label">Hari <span class="req">*</span></label>' +
      '<select class="select" name="Hari" required>' +
      opsiSelect(['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'], null, null, d.Hari, '— Pilih —') + '</select></div>' +
      '<div class="field"><label class="label">Jam Mulai <span class="req">*</span></label>' +
      '<input class="input" type="time" name="JamMulai" value="' + esc(d.JamMulai || '') + '" required></div>' +
      '<div class="field"><label class="label">Jam Selesai <span class="req">*</span></label>' +
      '<input class="input" type="time" name="JamSelesai" value="' + esc(d.JamSelesai || '') + '" required></div>' +
      '<div class="field"><label class="label">Mata Pelajaran <span class="req">*</span></label>' +
      '<select class="select" name="MapelID" required>' +
      opsiSelect(DB.mapel, 'ID', function (x) { return x.Kode + ' — ' + x.Nama; }, d.MapelID, '— Pilih —') + '</select></div>' +
      '<div class="field"><label class="label">Kelas <span class="req">*</span></label>' +
      '<select class="select" name="KelasID" required>' + opsiSelect(DB.kelas, 'ID', 'Nama', d.KelasID, '— Pilih —') + '</select></div>' +
      '<div class="field"><label class="label">Pengampu <span class="req">*</span></label>' +
      '<select class="select" name="DosenID" required>' + opsiSelect(DB.dosen, 'ID', 'Nama', d.DosenID, '— Pilih —') + '</select></div>' +
      '<div class="field"><label class="label">Ruangan</label>' +
      '<input class="input" name="Ruangan" value="' + esc(d.Ruangan || '') + '"></div>' +
      '<div class="field"><label class="label">Semester</label>' +
      '<select class="select" name="Semester">' + opsiSelect(['1','2','3','4','5','6','7','8'], null, null, d.Semester, '— Pilih —') + '</select></div>' +
      '<div class="field"><label class="label">Tahun Ajaran</label>' +
      selectTahunAjaran('TahunAjaran', d.TahunAjaran) + '</div>' +
      '<input type="hidden" name="Status" value="Aktif">' +
      '</div><div id="hasilKonflik"></div></form>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-outline" id="btnCekKonflik">' + svgIcon('alert-triangle', 18) + ' Cek Konflik</button>' +
      '<button class="btn btn-primary" id="btnSimpanJadwal">' + svgIcon('check', 18) + ' Simpan</button>',
    onOpen: function () {
      $('#btnCekKonflik').onclick = function () { cekKonflik(id); };
      $('#btnSimpanJadwal').onclick = function () { simpanJadwal(id); };
    }
  });
}

function cekKonflik(id) {
  const p = nilaiForm('formJadwalEl');
  if (id) p.ID = id;
  api('apiCekKonflikJadwal', AppState.sessionToken, p).then(function (res) {
    const box = $('#hasilKonflik');
    if (!res.success) { box.innerHTML = '<div class="alert alert-error">' + esc(res.message) + '</div>'; renderIcons(box); return; }
    box.innerHTML = res.data.aman
      ? '<div class="alert alert-success"><i data-icon="check-circle"></i><div><strong>Aman</strong><p>Tidak ada bentrok pada slot waktu ini.</p></div></div>'
      : '<div class="alert alert-error"><i data-icon="alert-triangle"></i><div><strong>Konflik ditemukan</strong>' +
        res.data.konflik.map(function (k) {
          return '<p>' + esc(k.jadwal.Hari + ' ' + k.jadwal.JamMulai + '–' + k.jadwal.JamSelesai + ' · ' +
                 namaMapel(k.jadwal.MapelID) + ' (' + k.alasan + ')') + '</p>';
        }).join('') + '</div></div>';
    renderIcons(box);
  }).catch(function (e) { showToast(e.message, 'error'); });
}

function simpanJadwal(id) {
  if (!validForm('formJadwalEl')) return;
  const p = nilaiForm('formJadwalEl');
  if (id) p.ID = id;
  api('apiSave', AppState.sessionToken, 'Jadwal', p).then(function (res) {
    if (!res.success) { showToast(res.message, 'error'); return; }
    closeModal(); showToast(res.message, 'success'); refreshData();
  }).catch(function (e) { showToast(e.message, 'error'); });
}

function hapusJadwal(id) {
  konfirmasi('Hapus jadwal ini?', function () {
    api('apiDelete', AppState.sessionToken, 'Jadwal', [id]).then(function (res) {
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) refreshData();
    });
  }, { danger: true, labelYa: 'Hapus' });
}

/* ---------- Manajemen SPP ---------- */
PAGES['admin-spp'] = function () {
  const data = (DB.spp || []).map(function (t) {
    return Object.assign({}, t, { __nama: namaSiswa(t.SiswaID) });
  });
  const lunas = data.filter(function (t) { return t.StatusBayar === 'Lunas'; });
  const kol = [
    { key: '__nama', label: 'Siswa/Mahasiswa', render: function (r) {
        const s = byId(DB.siswa, r.SiswaID);
        return '<div class="person"><span class="avatar">' + esc(inisial(s.Nama)) + '</span><div><strong>' +
               esc(s.Nama || '-') + '</strong><br><small class="muted">' + esc(s.NIM || '') + '</small></div></div>'; } },
    { key: 'JenisNama', label: 'Jenis Tagihan', render: function (r) {
        return '<span class="badge badge-info plain">' + esc(r.JenisNama || 'SPP') + '</span>'; } },
    { key: 'Periode', label: 'Periode' },
    { key: 'Nominal', label: 'Nominal', cls: 'num', render: function (r) { return esc(fmtRp(r.Nominal)); } },
    { key: 'StatusBayar', label: 'Status', render: function (r) { return badgeStatus(r.StatusBayar); } },
    { key: 'TanggalBayar', label: 'Tgl Bayar', render: function (r) { return esc(fmtTgl(r.TanggalBayar)); } },
    { key: '__aksi', label: 'Aksi', cls: 'act', render: function (r) {
        return (r.StatusBayar === 'Lunas'
          ? (r.BuktiURL ? '<button class="btn btn-outline btn-sm" onclick="previewFile(\'' + esc(r.BuktiURL) + '\',\'Bukti Bayar\')">Bukti</button>' : '<span class="muted text-sm">—</span>')
          : '<button class="btn btn-primary btn-sm" onclick="formLunasSPP(\'' + r.ID + '\')">Tandai Lunas</button>'); } }
  ];
  return headerHalaman('Manajemen Tagihan',
    'Terbitkan SPP maupun tagihan lain, catat pembayaran, dan simpan bukti transfer.',
    '<button class="btn btn-outline" onclick="navigateTo(\'admin-master\',{ctx:{tab:\'jenisTagihan\'}})">' +
    '<i data-icon="wallet"></i><span>Kelola Jenis Tagihan</span></button>' +
    '<button class="btn btn-primary" onclick="formTerbitSPP()"><i data-icon="plus"></i><span>Terbitkan Tagihan</span></button>') +
    '<div class="kpi-grid">' +
      kpiCard({ ikon: 'wallet', label: 'Total Tagihan', nilai: data.length, tint: 'var(--sc-high)' }) +
      kpiCard({ ikon: 'check-circle', label: 'Lunas', nilai: lunas.length, tint: 'var(--success-soft)', ink: 'var(--success)' }) +
      kpiCard({ ikon: 'alert-circle', label: 'Belum Bayar', nilai: data.length - lunas.length, tint: 'var(--error-soft)', ink: 'var(--error)' }) +
      kpiCard({ ikon: 'trending-up', label: 'Nominal Terkumpul', nilai: fmtRp(lunas.reduce(function (a, b) { return a + Number(b.Nominal || 0); }, 0)), tint: 'var(--accent-soft)', ink: 'var(--accent-ink)' }) +
    '</div>' +
    '<section class="card"><div class="card-head"><i data-icon="wallet"></i><h2>Daftar Tagihan</h2><div class="spacer"></div>' +
    '<div class="input-icon" style="width:min(240px,45vw)"><i data-icon="search"></i>' +
    '<input class="input" type="search" placeholder="Cari…" oninput="cariTabelDebounced(\'tbl_spp\',this.value)"></div></div>' +
    tabelGenerik({ id: 'tbl_spp', data: data, kolom: kol, kosong: 'Belum ada tagihan diterbitkan.' }) + '</section>';
};
PAGE_INIT['admin-spp'] = function () { gambarTabel('tbl_spp'); };

/* ---------- Terbitkan tagihan multi-jenis & multi-sasaran (Upgrade 10) ---------- */
function formTerbitSPP() {
  const jenis = (DB.jenisTagihan || []).filter(function (j) {
    return String(j.Status).toLowerCase() === 'aktif'; });
  if (!jenis.length) {
    showToast('Belum ada jenis tagihan. Tambahkan dulu di Data Master → Jenis Tagihan.', 'warning');
    navigateTo('admin-master', { ctx: { tab: 'jenisTagihan' } });
    return;
  }
  const pa = periodeAktif();

  openModal({
    title: 'Terbitkan Tagihan', size: 'wide',
    body: '<form id="formSPP" onsubmit="return false">' +
      '<div class="form-grid">' +
        '<div class="field"><label class="label">Jenis Tagihan <span class="req">*</span></label>' +
        '<select class="select" id="sppJenis" onchange="isiNominalBawaan()" required>' +
        opsiSelect(jenis, 'ID', function (x) { return x.Nama + ' (' + x.Kode + ')'; }, '', '— Pilih —') +
        '</select></div>' +
        '<div class="field"><label class="label">Periode Tagihan <span class="req">*</span></label>' +
        '<input class="input" id="sppPeriode" placeholder="Contoh: September 2026" ' +
        'value="' + esc(pa.TahunAjaran ? BULAN_PANJANG[new Date().getMonth()] + ' ' + new Date().getFullYear() : '') + '" required></div>' +
        '<div class="field"><label class="label">Nominal (Rp) <span class="req">*</span></label>' +
        '<input class="input" type="number" id="sppNominal" min="0" step="1000" required></div>' +
        '<div class="field full"><label class="label">Catatan</label>' +
        '<input class="input" id="sppCatatan" placeholder="Opsional — tampil di akun mahasiswa"></div>' +
      '</div>' +
      '<hr class="hr">' +
      '<label class="label">Sasaran Penerima <span class="req">*</span></label>' +
      '<div class="chip-row" style="margin-bottom:14px" id="sppTargetChip">' +
        '<button type="button" class="chip active" data-target="semua" onclick="pilihTargetTagihan(this)">Semua Mahasiswa</button>' +
        '<button type="button" class="chip" data-target="jurusan" onclick="pilihTargetTagihan(this)">Per Jurusan/Prodi</button>' +
        '<button type="button" class="chip" data-target="kelas" onclick="pilihTargetTagihan(this)">Per Kelas</button>' +
        '<button type="button" class="chip" data-target="siswa" onclick="pilihTargetTagihan(this)">Mahasiswa Tertentu</button>' +
      '</div>' +
      '<div id="sppTargetIsi"></div>' +
      '<div class="alert alert-info" style="margin-top:14px"><i data-icon="users"></i><div>' +
      '<strong id="sppJumlah">Menyasar 0 mahasiswa</strong>' +
      '<p>Mahasiswa yang sudah memiliki tagihan jenis &amp; periode sama otomatis dilewati.</p></div></div>' +
      '</form>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-primary" id="btnTerbitSPP">' + svgIcon('send', 18) + ' Terbitkan &amp; Kirim Notifikasi</button>',
    onOpen: function () {
      pilihTargetTagihan($('#sppTargetChip .chip'));
      $('#btnTerbitSPP').onclick = terbitkanSPP;
    }
  });
}

let TARGET_TAGIHAN = 'semua';

function isiNominalBawaan() {
  const j = byId(DB.jenisTagihan, $('#sppJenis').value);
  if (j.NominalDefault && !Number($('#sppNominal').value)) $('#sppNominal').value = j.NominalDefault;
}

function pilihTargetTagihan(btn) {
  $$('#sppTargetChip .chip').forEach(function (c) { c.classList.remove('active'); });
  btn.classList.add('active');
  TARGET_TAGIHAN = btn.dataset.target;
  const box = $('#sppTargetIsi');

  if (TARGET_TAGIHAN === 'jurusan') {
    box.innerHTML = '<div class="field"><label class="label">Jurusan / Program Studi</label>' +
      '<select class="select" id="sppTargetId" onchange="hitungTargetTagihan()">' +
      opsiSelect(DB.jurusan, 'ID', function (x) { return x.Kode + ' — ' + x.Nama; }, '', '— Pilih —') + '</select></div>';
  } else if (TARGET_TAGIHAN === 'kelas') {
    box.innerHTML = '<div class="field"><label class="label">Kelas</label>' +
      '<select class="select" id="sppTargetId" onchange="hitungTargetTagihan()">' +
      opsiSelect(DB.kelas, 'ID', 'Nama', '', '— Pilih —') + '</select></div>';
  } else if (TARGET_TAGIHAN === 'siswa') {
    const aktif = (DB.siswa || []).filter(function (s) { return String(s.Status).toLowerCase() === 'aktif'; });
    box.innerHTML = '<div class="field"><label class="label">Pilih Mahasiswa</label>' +
      '<div class="input-icon" style="margin-bottom:8px">' + svgIcon('search', 18) +
      '<input class="input" placeholder="Cari nama / NIM…" oninput="filterSiswaTagihan(this.value)"></div>' +
      '<div id="sppDaftarSiswa" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r);padding:8px">' +
      aktif.map(function (s) {
        return '<label class="checkbox" data-cari="' + esc((s.Nama + ' ' + s.NIM).toLowerCase()) + '" style="margin-bottom:6px">' +
          '<input type="checkbox" class="spp-siswa" value="' + s.ID + '" onchange="hitungTargetTagihan()">' +
          '<span>' + esc(s.Nama) + ' <span class="muted">· ' + esc(s.NIM) + ' · ' + esc(namaKelas(s.KelasID)) + '</span></span></label>';
      }).join('') + '</div></div>';
  } else {
    box.innerHTML = '';
  }
  renderIcons(box);
  hitungTargetTagihan();
}

function filterSiswaTagihan(q) {
  const kata = String(q || '').toLowerCase();
  $$('#sppDaftarSiswa label').forEach(function (l) {
    l.style.display = l.dataset.cari.indexOf(kata) !== -1 ? '' : 'none';
  });
}

function hitungTargetTagihan() {
  const el = $('#sppJumlah');
  if (!el) return;
  const aktif = (DB.siswa || []).filter(function (s) { return String(s.Status).toLowerCase() === 'aktif'; });
  let n = 0;
  if (TARGET_TAGIHAN === 'semua') n = aktif.length;
  else if (TARGET_TAGIHAN === 'kelas') {
    const id = ($('#sppTargetId') || {}).value;
    n = id ? aktif.filter(function (s) { return s.KelasID === id; }).length : 0;
  } else if (TARGET_TAGIHAN === 'jurusan') {
    const id = ($('#sppTargetId') || {}).value;
    n = id ? aktif.filter(function (s) { return s.JurusanID === id; }).length : 0;
  } else {
    n = $$('.spp-siswa').filter(function (c) { return c.checked; }).length;
  }
  el.textContent = 'Menyasar ' + n + ' mahasiswa';
}

function terbitkanSPP() {
  const jenisId = $('#sppJenis').value;
  const periode = $('#sppPeriode').value.trim();
  const nominal = $('#sppNominal').value;
  if (!jenisId) { showToast('Pilih jenis tagihan terlebih dahulu.', 'warning'); return; }
  if (!periode) { showToast('Periode tagihan wajib diisi.', 'warning'); return; }
  if (!Number(nominal)) { showToast('Nominal tagihan wajib diisi.', 'warning'); return; }

  const meta = {
    JenisID: jenisId, Periode: periode, Nominal: Number(nominal),
    Catatan: $('#sppCatatan').value, target: TARGET_TAGIHAN,
    targetId: ($('#sppTargetId') || {}).value || '',
    siswaIds: $$('.spp-siswa').filter(function (c) { return c.checked; }).map(function (c) { return c.value; })
  };
  if (TARGET_TAGIHAN !== 'semua' && TARGET_TAGIHAN !== 'siswa' && !meta.targetId) {
    showToast('Pilih sasaran terlebih dahulu.', 'warning'); return;
  }
  if (TARGET_TAGIHAN === 'siswa' && !meta.siswaIds.length) {
    showToast('Centang minimal satu mahasiswa.', 'warning'); return;
  }

  const btn = $('#btnTerbitSPP');
  btn.disabled = true; btn.innerHTML = svgIcon('refresh', 18) + ' Memproses…';
  api('apiTerbitkanTagihan', AppState.sessionToken, meta).then(function (res) {
    btn.disabled = false; btn.innerHTML = svgIcon('send', 18) + ' Terbitkan & Kirim Notifikasi';
    if (!res.success) { showToast(res.message, 'error'); return; }
    closeModal(); showToast(res.message, 'success'); refreshData();
  }).catch(function (e) {
    btn.disabled = false; btn.innerHTML = svgIcon('send', 18) + ' Terbitkan & Kirim Notifikasi';
    showToast(e.message, 'error');
  });
}

function formLunasSPP(id) {
  openModal({
    title: 'Tandai Pembayaran Lunas', size: 'slim',
    body: '<div class="field"><label class="label">Bukti Pembayaran (opsional, maks 2MB)</label>' +
      '<div class="dropzone" id="dzSPP" style="padding:24px"><div class="dz-ico">' + svgIcon('upload-cloud', 28) + '</div>' +
      '<p class="dz-sub mb0">Klik atau seret berkas ke sini</p></div>' +
      '<input type="file" id="fileSPP" accept="image/*,.pdf" hidden>' +
      '<div class="file-pill" id="pillSPP" hidden></div></div>' +
      '<div class="field"><label class="label">Catatan</label><input class="input" id="catatanSPP"></div>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-success" id="btnLunas">' + svgIcon('check', 18) + ' Tandai Lunas</button>',
    onOpen: function () {
      pasangDropzone('dzSPP', 'fileSPP', 'pillSPP');
      $('#btnLunas').onclick = function () {
        bacaBerkas($('#fileSPP')).then(function (f) {
          return api('apiTandaiLunasSPP', AppState.sessionToken, id, f, $('#catatanSPP').value);
        }).then(function (res) {
          if (!res.success) { showToast(res.message, 'error'); return; }
          closeModal(); showToast(res.message, 'success'); refreshData();
        }).catch(function (e) { showToast(e.message, 'error'); });
      };
    }
  });
}

/* ---------- Notifikasi / Broadcast ---------- */
PAGES['admin-notifikasi'] = function () {
  const log = (DB.logNotif || []).slice().reverse();
  return headerHalaman('Notifikasi & Broadcast', 'Kirim pengumuman serta pantau riwayat pengiriman Email dan WhatsApp.',
    '<button class="btn btn-primary" onclick="formBroadcast()"><i data-icon="megaphone"></i><span>Kirim Pengumuman</span></button>') +
    '<div class="grid grid-side">' +
      '<section class="card"><div class="card-head"><i data-icon="inbox"></i><h2>Riwayat Pengiriman</h2></div>' +
      tabelGenerik({ id: 'tbl_notif', data: log, perPage: 12, kosong: 'Belum ada notifikasi terkirim.', kolom: [
        { key: 'Timestamp', label: 'Waktu', render: function (r) { return esc(fmtTgl(r.Timestamp, true)); } },
        { key: 'Channel', label: 'Kanal', render: function (r) {
            return '<span class="badge ' + (r.Channel === 'WA' ? 'badge-success' : 'badge-info') + ' plain">' + esc(r.Channel) + '</span>'; } },
        { key: 'Penerima', label: 'Penerima' },
        { key: 'Subjek', label: 'Subjek' },
        { key: 'Status', label: 'Status', render: function (r) {
            return '<span class="badge ' + (String(r.Status).indexOf('Terkirim') === 0 ? 'badge-success' : 'badge-error') + '">' + esc(r.Status) + '</span>'; } }
      ] }) + '</section>' +
      '<section class="card"><div class="card-head"><i data-icon="settings"></i><h2>Uji Konfigurasi</h2></div>' +
      '<div class="card-body">' +
      '<div class="field"><label class="label">Email tujuan uji</label><input class="input" id="tesEmail" type="email" value="' + esc(AppState.user.email) + '"></div>' +
      '<div class="field"><label class="label">No. WhatsApp tujuan uji</label><input class="input" id="tesWA" placeholder="08xxxxxxxxxx"></div>' +
      '<button class="btn btn-outline btn-block" onclick="tesNotifikasi()"><i data-icon="send"></i><span>Kirim Pesan Uji</span></button>' +
      '<p class="help mt4">Pastikan token WhatsApp Gateway sudah diisi di menu Pengaturan.</p>' +
      '</div></section></div>';
};
PAGE_INIT['admin-notifikasi'] = function () { gambarTabel('tbl_notif'); };

function tesNotifikasi() {
  api('apiTesNotifikasi', AppState.sessionToken, $('#tesEmail').value, $('#tesWA').value)
    .then(function (res) { showToast(res.message, res.success ? 'success' : 'error'); if (res.success) refreshData(); })
    .catch(function (e) { showToast(e.message, 'error'); });
}

function formBroadcast() {
  openModal({
    title: 'Kirim Pengumuman', size: 'wide',
    body: '<form id="formBc" onsubmit="return false">' +
      '<div class="field"><label class="label">Tujuan</label><select class="select" id="bcTujuan">' +
      '<option value="__ALL_SISWA__">Semua Siswa/Mahasiswa</option>' +
      '<option value="__ALL_DOSEN__">Semua Dosen/Guru</option>' +
      '<option value="__ALL_AKADEMIK__">Tim Akademik</option>' +
      opsiSelect(DB.kelas, 'ID', function (x) { return 'Kelas: ' + x.Nama; }) + '</select></div>' +
      '<div class="field"><label class="label">Subjek <span class="req">*</span></label>' +
      '<input class="input" id="bcSubjek" required></div>' +
      '<div class="field"><label class="label">Isi Pesan <span class="req">*</span></label>' +
      '<textarea class="textarea" id="bcPesan" required></textarea></div>' +
      '<div class="alert alert-info"><i data-icon="info"></i><div><strong>Catatan kuota</strong>' +
      '<p>Akun Google personal dibatasi ±100 email/hari. Gunakan Google Workspace Education untuk institusi besar.</p></div></div></form>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-primary" id="btnKirimBc">' + svgIcon('send', 18) + ' Kirim Sekarang</button>',
    onOpen: function () { $('#btnKirimBc').onclick = kirimBroadcast; }
  });
}

function kirimBroadcast() {
  const tujuan = $('#bcTujuan').value, subjek = $('#bcSubjek').value.trim(), pesan = $('#bcPesan').value.trim();
  if (!subjek || !pesan) { showToast('Subjek dan isi pesan wajib diisi.', 'warning'); return; }
  const btn = $('#btnKirimBc'); btn.disabled = true; btn.innerHTML = svgIcon('refresh', 18) + ' Mengirim…';
  api('apiBroadcast', AppState.sessionToken, tujuan, subjek, pesan).then(function (res) {
    btn.disabled = false;
    if (!res.success) { showToast(res.message, 'error'); return; }
    closeModal(); showToast(res.message, 'success'); refreshData();
  }).catch(function (e) { btn.disabled = false; showToast(e.message, 'error'); });
}

/* ---------- Pengaturan Sistem ---------- */
PAGES['pengaturan'] = function () {
  const i = DB.institusi || {};
  const sw = function (name, label, bantu, on) {
    return '<div class="field"><label class="checkbox"><input type="checkbox" name="' + name + '"' + (on ? ' checked' : '') +
           '><span><b>' + esc(label) + '</b></span></label><p class="help">' + esc(bantu) + '</p></div>';
  };
  return headerHalaman('Pengaturan Sistem', 'Identitas institusi, fitur opsional, dan integrasi notifikasi.') +
    '<form id="formSetting" onsubmit="return false"><div class="grid grid-2">' +
      '<section class="card"><div class="card-head"><i data-icon="building"></i><h2>Identitas Institusi</h2></div>' +
      '<div class="card-body"><div class="form-grid">' +
        '<div class="field full"><label class="label">Nama Institusi</label><input class="input" name="NamaInstitusi" value="' + esc(i.NamaInstitusi) + '"></div>' +
        '<div class="field"><label class="label">Jenjang</label><select class="select" name="Jenjang">' +
        opsiSelect(['Sekolah Menengah','Perguruan Tinggi','Lembaga Kursus'], null, null, i.Jenjang, '— Pilih —') + '</select></div>' +
        '<div class="field"><label class="label">Tahun Ajaran</label>' +
        selectTahunAjaran('TahunAjaran', i.TahunAjaran) +
        '<p class="help">Pilihan berasal dari Data Master → Periode.</p></div>' +
        '<div class="field"><label class="label">Semester Aktif</label><select class="select" name="SemesterAktif">' +
        opsiSelect(['Ganjil','Genap','Pendek'], null, null, i.SemesterAktif) + '</select></div>' +
        '<div class="field"><label class="label">KKM / Nilai Ambang</label><input class="input" type="number" name="KKM" value="' + esc(i.KKM || 70) + '"></div>' +
        '<div class="field full"><label class="label">Logo Institusi</label>' +
        '<div class="logo-uploader">' +
          '<div class="logo-thumb" id="logoThumb">' +
          (i.LogoURL ? '<img src="' + esc(i.LogoURL) + '" alt="Logo institusi">' : svgIcon('image', 30)) +
          '</div>' +
          '<div>' +
          '<button class="btn btn-outline" onclick="pilihLogo()"><i data-icon="upload"></i><span>Unggah Logo</span></button>' +
          (i.LogoURL ? ' <button class="btn btn-ghost" onclick="hapusLogo()"><i data-icon="trash"></i><span>Hapus</span></button>' : '') +
          '<p class="help" style="margin:8px 0 0">PNG atau JPG, maksimal 2MB. Logo langsung tampil di sidebar dan dokumen cetak.</p>' +
          '</div>' +
          '<input type="file" id="fileLogo" accept="image/*" hidden onchange="unggahLogo()">' +
          '<input type="hidden" name="LogoURL" id="inpLogoURL" value="' + esc(i.LogoURL) + '">' +
        '</div></div>' +
        '<div class="field"><label class="label">Email Institusi</label><input class="input" name="Email" value="' + esc(i.Email) + '"></div>' +
        '<div class="field"><label class="label">Telepon</label><input class="input" name="Telepon" value="' + esc(i.Telepon) + '"></div>' +
        '<div class="field full"><label class="label">Alamat</label><textarea class="textarea" name="Alamat">' + esc(i.Alamat) + '</textarea></div>' +
      '</div></div></section>' +
      '<div class="stack">' +
      '<section class="card"><div class="card-head"><i data-icon="grid"></i><h2>Fitur Opsional</h2></div><div class="card-body">' +
        sw('FiturSPP', 'Manajemen SPP', 'Menampilkan modul tagihan & pembayaran.', String(i.FiturSPP).toUpperCase() === 'TRUE') +
        sw('FiturBarcode', 'Absensi Barcode/QR', 'Dosen dapat membuat kode sesi; siswa memindai untuk hadir.', String(i.FiturBarcode).toUpperCase() === 'TRUE') +
        sw('FiturGeo', 'Absensi Lokasi (GPS)', 'Verifikasi kehadiran berdasarkan radius koordinat kampus.', String(i.FiturGeo).toUpperCase() === 'TRUE') +
        '<div class="form-grid">' +
        '<div class="field"><label class="label">Latitude</label><input class="input" name="GeoLat" value="' + esc(i.GeoLat) + '"></div>' +
        '<div class="field"><label class="label">Longitude</label><input class="input" name="GeoLng" value="' + esc(i.GeoLng) + '"></div>' +
        '<div class="field"><label class="label">Radius (meter)</label><input class="input" type="number" name="GeoRadius" value="' + esc(i.GeoRadius) + '"></div>' +
        '<div class="field" style="display:flex;align-items:flex-end"><button class="btn btn-outline btn-block" onclick="ambilLokasiSaya()">' +
        '<i data-icon="map-pin"></i><span>Pakai Lokasi Saat Ini</span></button></div></div>' +
      '</div></section>' +
      '<section class="card"><div class="card-head"><i data-icon="megaphone"></i><h2>Notifikasi</h2></div><div class="card-body">' +
        sw('NotifEmail', 'Notifikasi Email', 'Menggunakan kuota Gmail akun pemilik skrip.', String(i.NotifEmail).toUpperCase() === 'TRUE') +
        sw('NotifWA', 'Notifikasi WhatsApp', 'Membutuhkan WA Gateway pihak ketiga (Fonnte / WA Business API).', String(i.NotifWA).toUpperCase() === 'TRUE') +
        '<div class="field"><label class="label">URL WA Gateway</label><input class="input" name="WAGatewayURL" value="' + esc(i.WAGatewayURL) + '"></div>' +
        '<div class="field"><label class="label">Token / API Key</label><input class="input" type="password" name="WAGatewayToken" value="' + esc(i.WAGatewayToken) + '">' +
        '<p class="help">Token disimpan di Google Sheets institusi Anda dan tidak dibagikan ke pihak lain.</p></div>' +
      '</div></section>' +

      /* --- v2.0: perekaman kini berjalan native, tidak perlu hosting terpisah --- */
      '<section class="card"><div class="card-head"><i data-icon="mic"></i><h2>Perekam Pertemuan</h2>' +
      '<div class="spacer"></div><span class="badge badge-success">Bawaan aplikasi</span></div>' +
      '<div class="card-body">' +
        '<div class="alert alert-success"><i data-icon="check-circle"></i><div>' +
        '<strong>Tidak ada yang perlu dipasang</strong>' +
        '<p>Sejak versi 2.0, frontend EduPortal berdiri sebagai situs mandiri dan tidak lagi ' +
        'dijalankan di dalam bingkai Apps Script. Karena itu mikrofon, kamera, dan lokasi ' +
        'berfungsi langsung di dalam aplikasi. <b>Perekam Eksternal beserta kolom tautannya ' +
        'sudah tidak diperlukan dan telah dihapus.</b></p></div></div>' +
        '<div class="alert alert-info"><i data-icon="info"></i><div><strong>Yang perlu diketahui pengguna</strong>' +
        '<p>Saat pertama kali menekan tombol rekam, peramban akan meminta izin mikrofon — ' +
        'cukup tekan <b>Izinkan</b> sekali, dan izin itu diingat untuk seterusnya. ' +
        'Transkripsi otomatis bekerja paling baik di Google Chrome dan Microsoft Edge. ' +
        'Pada peramban lain, rekaman tetap berjalan dan transkrip dapat diketik lewat ' +
        '<b>Ketik / Tempel Transkrip</b>.</p></div></div>' +
        '<div class="field"><label class="label">Bahasa Transkripsi</label>' +
        '<p class="help">Saat ini: <b>' + esc(APP_CONFIG.bahasaRekam) + '</b>. ' +
        'Diubah melalui <code>bahasaRekam</code> pada berkas <code>js/config.js</code> di repositori frontend.</p></div>' +
        '<div class="row">' +
        '<button class="btn btn-outline" onclick="ujiMikrofon()"><i data-icon="mic"></i><span>Uji Mikrofon</span></button>' +
        '<button class="btn btn-ghost" onclick="navigateTo(\'rekaman\')"><i data-icon="play"></i><span>Buka Rekam Pertemuan</span></button>' +
        '</div>' +
      '</div></section></div>' +
    '</div>' +
    '<div class="row mt4"><button class="btn btn-primary btn-lg" onclick="simpanPengaturan()">' +
    '<i data-icon="check"></i><span>Simpan Pengaturan</span></button>' +
    '<button class="btn btn-outline" onclick="refreshData()"><i data-icon="refresh"></i><span>Batalkan Perubahan</span></button></div></form>';
};

/* ---------- Unggah logo institusi (Upgrade 1) ---------- */
function pilihLogo() { $('#fileLogo').click(); }

function unggahLogo() {
  const input = $('#fileLogo');
  if (!input.files.length) return;
  const thumb = $('#logoThumb');
  const isiLama = thumb.innerHTML;
  thumb.innerHTML = svgIcon('refresh', 26);

  bacaBerkas(input).then(function (file) {
    if (!file) throw new Error('Berkas tidak terbaca.');
    return api('apiUploadLogo', AppState.sessionToken, file);
  }).then(function (res) {
    if (!res.success) { thumb.innerHTML = isiLama; showToast(res.message, 'error'); return; }
    thumb.innerHTML = '<img src="' + esc(res.data.logoURL) + '" alt="Logo institusi">';
    $('#inpLogoURL').value = res.data.logoURL;
    DB.institusi.LogoURL = res.data.logoURL;
    $('#brandMark').innerHTML = '<img src="' + esc(res.data.logoURL) + '" alt="Logo institusi">';
    showToast(res.message, 'success');
    input.value = '';
    refreshData(true);
  }).catch(function (e) {
    thumb.innerHTML = isiLama;
    showToast(e.message, 'error');
  });
}

function hapusLogo() {
  konfirmasi('Hapus logo institusi dan kembali ke lambang bawaan?', function () {
    api('apiSave', AppState.sessionToken, 'Institusi',
        { ID: DB.institusi.ID, LogoURL: '', LogoFileID: '' }).then(function (res) {
      showToast(res.success ? 'Logo dihapus.' : res.message, res.success ? 'success' : 'error');
      if (res.success) {
        $('#brandMark').innerHTML = svgIcon('graduation-cap', 20);
        refreshData().then(function () { navigateTo('pengaturan', { noHistory: true }); });
      }
    }).catch(function (e) { showToast(e.message, 'error'); });
  }, { danger: true, labelYa: 'Hapus Logo' });
}

/* ---------- v2.0: uji mikrofon langsung, tanpa hosting terpisah ---------- */
/**
 * Menguji mikrofon di tempat: minta izin, tampilkan level suara sungguhan
 * selama 6 detik, lalu lepaskan perangkat. Ini menggantikan tombol lama
 * "Uji Buka Perekam" yang hanya membuka jendela di hosting lain.
 */
function ujiMikrofon() {
  openModal({
    title: 'Uji Mikrofon', size: 'slim',
    body: '<p class="help">Berbicaralah sebentar — batang di bawah akan bergerak mengikuti suara Anda. ' +
          'Bila diam saja, berarti mikrofon belum menangkap suara.</p>' +
          '<div id="ujiMicStatus" class="izin-bar tanya">' + svgIcon('mic', 18) +
          '<span>Meminta izin mikrofon…</span></div>' +
          '<div class="rec-mic-level" id="ujiMicLevel" style="max-width:none"><span></span></div>' +
          '<p class="help mt4" id="ujiMicSisa"></p>',
    foot: '<button class="btn btn-primary" onclick="hentikanUjiMikrofon(); closeModal();">Selesai</button>',
    onOpen: function () {
      cobaAksesMikrofon().then(function (hasil) {
        const st = $('#ujiMicStatus');
        if (!hasil.ok) {
          if (st) {
            st.className = 'izin-bar tolak';
            st.innerHTML = svgIcon('alert-circle', 18) + '<span>Mikrofon tidak dapat diakses.</span>' +
              '<button class="btn btn-sm btn-outline izin-act" onclick="closeModal(); tampilkanPanduanMikrofon(\'' +
              hasil.sebab + '\', \'\', \'mikrofon\')">Cara memperbaiki</button>';
            renderIcons(st);
          }
          return;
        }
        if (st) {
          st.className = 'izin-bar ok';
          st.innerHTML = svgIcon('check-circle', 18) + '<span>Izin diberikan — mikrofon aktif.</span>';
          renderIcons(st);
        }
        jalankanUjiLevel(hasil.stream);
      });
    }
  });
}

let UJI_MIC = { stream: null, ctx: null, raf: null, timer: null };

function jalankanUjiLevel(stream) {
  UJI_MIC.stream = stream;
  let sisa = 6;
  const bar = $('#ujiMicLevel');
  const sisaEl = $('#ujiMicSisa');

  try {
    UJI_MIC.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = UJI_MIC.ctx.createMediaStreamSource(stream);
    const an = UJI_MIC.ctx.createAnalyser();
    an.fftSize = 64;
    src.connect(an);
    const data = new Uint8Array(an.frequencyBinCount);

    const loop = function () {
      if (!UJI_MIC.ctx) return;
      an.getByteFrequencyData(data);
      let total = 0;
      for (let i = 0; i < data.length; i++) total += data[i];
      const level = Math.min(100, Math.round((total / data.length) / 255 * 260));
      if (bar) {
        bar.querySelector('span').style.width = level + '%';
        bar.className = 'rec-mic-level' + (level < 3 ? ' sepi' : level < 12 ? ' rendah' : '');
      }
      UJI_MIC.raf = requestAnimationFrame(loop);
    };
    loop();
  } catch (e) { /* visualiser bersifat kosmetik */ }

  UJI_MIC.timer = setInterval(function () {
    sisa--;
    if (sisaEl) sisaEl.textContent = sisa > 0 ? 'Uji berhenti otomatis dalam ' + sisa + ' detik.' : 'Uji selesai.';
    if (sisa <= 0) hentikanUjiMikrofon();
  }, 1000);
}

function hentikanUjiMikrofon() {
  if (UJI_MIC.raf) { cancelAnimationFrame(UJI_MIC.raf); UJI_MIC.raf = null; }
  if (UJI_MIC.timer) { clearInterval(UJI_MIC.timer); UJI_MIC.timer = null; }
  if (UJI_MIC.ctx) { try { UJI_MIC.ctx.close(); } catch (e) {} UJI_MIC.ctx = null; }
  /* Melepas perangkat penting: indikator mikrofon di tab harus benar-benar padam. */
  if (UJI_MIC.stream) { UJI_MIC.stream.getTracks().forEach(function (t) { t.stop(); }); UJI_MIC.stream = null; }
  const bar = $('#ujiMicLevel');
  if (bar) bar.querySelector('span').style.width = '0%';
}

function ambilLokasiSaya() {
  if (!navigator.geolocation) { showToast('Peramban tidak mendukung geolokasi.', 'error'); return; }
  navigator.geolocation.getCurrentPosition(function (pos) {
    $('[name="GeoLat"]').value = pos.coords.latitude.toFixed(6);
    $('[name="GeoLng"]').value = pos.coords.longitude.toFixed(6);
    showToast('Koordinat lokasi saat ini diterapkan.', 'success');
  }, function () { showToast('Izin lokasi ditolak atau tidak tersedia.', 'error'); });
}

function simpanPengaturan() {
  const p = nilaiForm('formSetting');
  p.ID = DB.institusi.ID;
  api('apiSave', AppState.sessionToken, 'Institusi', p).then(function (res) {
    showToast(res.message, res.success ? 'success' : 'error');
    if (res.success) refreshData().then(function () { renderNavigation(AppState.user.peran); });
  }).catch(function (e) { showToast(e.message, 'error'); });
}
/* ==========================================================================
   D. TIM AKADEMIK
   ========================================================================== */

/** Baris antrian validasi = gabungan Status_Nilai + info mapel/kelas/dosen. */
function antrianValidasi(filterStatus) {
  return (DB.statusNilai || []).filter(function (s) {
    return filterStatus ? filterStatus.indexOf(s.Status) !== -1 : true;
  }).map(function (s) {
    const prog = (DB.program || []).filter(function (p) {
      return p.MapelID === s.MapelID && p.KelasID === s.KelasID;
    })[0] || {};
    return Object.assign({}, s, {
      __mapel: namaMapel(s.MapelID), __kode: kodeMapel(s.MapelID),
      __kelas: namaKelas(s.KelasID), __dosen: s.SubmittedBy || namaDosen(prog.DosenID)
    });
  }).sort(function (a, b) { return new Date(b.SubmittedAt || 0) - new Date(a.SubmittedAt || 0); });
}

PAGES['akademik-dashboard'] = function () {
  const s = DB.statistik || {};
  const antri = antrianValidasi(['Submitted']).slice(0, 3);
  return headerHalaman('Pusat Validasi Akademik', 'Pantau dan proses validasi nilai untuk periode berjalan.',
    '<button class="btn btn-outline" onclick="navigateTo(\'laporan\')"><i data-icon="filter"></i><span>Laporan</span></button>' +
    '<button class="btn btn-outline" onclick="refreshData()"><i data-icon="calendar"></i><span>Periode: ' +
    esc(DB.institusi.TahunAjaran || '-') + '</span></button>') +
    '<div class="kpi-grid">' +
      kpiCard({ ikon: 'clipboard-list', label: 'Menunggu Validasi', nilai: s.pendingValidasi || 0,
                tint: 'var(--warning-soft)', ink: 'var(--warning)', tag: 'Perlu Tindakan' }) +
      kpiCard({ ikon: 'check-circle', label: 'Tervalidasi Bulan Ini', nilai: s.tervalidasiBulanIni || 0,
                tint: 'var(--success-soft)', ink: 'var(--success)', tag: 'Selesai', tagBg: 'var(--success-soft)', tagInk: 'var(--success)' }) +
      kpiCard({ ikon: 'corner-up-left', label: 'Dikembalikan', nilai: s.dikembalikan || 0,
                tint: 'var(--error-soft)', ink: 'var(--error)' }) +
      kpiCard({ ikon: 'book-open', label: 'Total Kelas Aktif', nilai: s.totalKelas || 0, tint: 'var(--sc-high)' }) +
    '</div>' +
    '<section class="card" style="margin-bottom:16px"><div class="card-head">' +
    '<i data-icon="clipboard-check"></i><h2>Antrian Validasi Nilai</h2><div class="spacer"></div>' +
    '<button class="btn btn-outline btn-sm" onclick="navigateTo(\'akademik-validasi\')">Lihat Semua</button></div>' +
    (antri.length ? tabelAntrian(antri, 'tbl_antri_mini')
      : '<div class="card-body">' + kosongState('check-circle', 'Antrian kosong', 'Semua nilai yang masuk sudah diproses. Kerja bagus!') + '</div>') +
    '</section>' +
    '<div class="grid grid-side">' +
      '<section class="card"><div class="card-head"><i data-icon="pie-chart"></i><h2>Distribusi Huruf Mutu</h2></div>' +
      '<div class="card-body"><div class="chart-box"><canvas id="chMutu"></canvas></div></div></section>' +
      '<section class="card"><div class="card-head"><i data-icon="bar-chart"></i><h2>Rekap Kehadiran</h2></div>' +
      '<div class="card-body"><div class="chart-box"><canvas id="chHadir"></canvas></div></div></section>' +
    '</div>' +
    '<div class="insight mt4"><div class="insight-head">' + svgIcon('sparkles', 18) + ' Analisis Otomatis</div>' +
    '<ul>' + wawasanAkademik(s).map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul></div>';
};

PAGE_INIT['akademik-dashboard'] = function () {
  gambarTabel('tbl_antri_mini');
  const s = DB.statistik || {}, w = warnaTema();
  const d = s.distribusiNilai || { A: 0, B: 0, C: 0, D: 0, E: 0 };
  buatChart('chMutu', {
    type: 'doughnut',
    data: { labels: ['A','B','C','D','E'],
      datasets: [{ data: [d.A, d.B, d.C, d.D, d.E],
        backgroundColor: [w.sukses, w.primary, w.accent, '#e08b2f', w.error], borderWidth: 0 }] },
    options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } }
  });
  const a = s.rekapAbsensi || { Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0 };
  buatChart('chHadir', {
    type: 'bar',
    data: { labels: ['Hadir','Sakit','Izin','Alpa'],
      datasets: [{ label: 'Jumlah', data: [a.Hadir, a.Sakit, a.Izin, a.Alpa],
        backgroundColor: [w.sukses, w.accent, w.info, w.error], borderRadius: 6, maxBarThickness: 54 }] },
    options: { plugins: { legend: { display: false } } }
  });
};

function wawasanAkademik(s) {
  const out = [];
  const d = s.distribusiNilai || {};
  const total = (d.A || 0) + (d.B || 0) + (d.C || 0) + (d.D || 0) + (d.E || 0);
  if (s.pendingValidasi) out.push('Terdapat <b>' + s.pendingValidasi + '</b> berkas nilai menunggu verval — proses agar siswa dapat melihat nilainya.');
  else out.push('Tidak ada berkas nilai yang tertahan di antrian validasi.');
  if (total) {
    const kurang = (d.D || 0) + (d.E || 0);
    out.push('Dari <b>' + total + '</b> entri nilai akhir, <b>' + Math.round(kurang / total * 100) + '%</b> berada pada huruf mutu D/E' +
      (kurang / total > 0.2 ? ' — proporsi cukup tinggi, tinjau kembali kualitas pembelajaran mata kuliah terkait.' : ' — proporsi masih wajar.'));
  }
  if (s.totalRemedial) out.push('<b>' + s.totalRemedial + '</b> peserta didik masuk daftar remedial. Tetapkan jadwal remedial pada menu Remedial & Ulang.');
  if (s.persenKehadiran < 80) out.push('Kehadiran keseluruhan <b>' + s.persenKehadiran + '%</b> berada di bawah ambang 80%.');
  return out;
}

function tabelAntrian(data, id) {
  return tabelGenerik({ id: id, data: data, perPage: id === 'tbl_antri_mini' ? 3 : 10,
    kosong: 'Tidak ada berkas nilai pada status ini.',
    kolom: [
      { key: '__mapel', label: 'Mata Pelajaran', render: function (r) {
          return '<strong>' + esc(r.__mapel) + '</strong>'; } },
      { key: '__kode', label: 'Kode' },
      { key: '__dosen', label: 'Pengampu', render: function (r) {
          return '<div class="person"><span class="avatar">' + esc(inisial(r.__dosen)) + '</span>' + esc(r.__dosen || '-') + '</div>'; } },
      { key: '__kelas', label: 'Kelas' },
      { key: 'SubmittedAt', label: 'Dikirim', render: function (r) { return esc(fmtTgl(r.SubmittedAt)); } },
      { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } },
      { key: '__aksi', label: 'Aksi', cls: 'act', render: function (r) {
          return '<button class="btn ' + (r.Status === 'Submitted' ? 'btn-primary' : 'btn-outline') + ' btn-sm" ' +
                 'onclick="bukaValidasi(\'' + r.MapelID + '\',\'' + r.KelasID + '\',\'' + r.Semester + '\')">Tinjau</button>'; } }
    ] });
}

PAGES['akademik-validasi'] = function () {
  const data = antrianValidasi(['Submitted','Draft','Returned']);
  return headerHalaman('Validasi Nilai', 'Periksa nilai yang dikirim pengajar, lalu verval atau kembalikan untuk revisi.') +
    '<section class="card"><div class="card-head"><i data-icon="clipboard-check"></i><h2>Antrian Berkas Nilai</h2>' +
    '<div class="spacer"></div><div class="input-icon" style="width:min(260px,50vw)"><i data-icon="search"></i>' +
    '<input class="input" type="search" placeholder="Cari mata pelajaran / kelas…" oninput="cariTabelDebounced(\'tbl_antri\',this.value)"></div></div>' +
    tabelAntrian(data, 'tbl_antri') + '</section>';
};
PAGE_INIT['akademik-validasi'] = function () { gambarTabel('tbl_antri'); };

PAGES['akademik-riwayat'] = function () {
  const data = antrianValidasi(['Validated']);
  return headerHalaman('Riwayat Validasi', 'Seluruh berkas nilai yang telah tervalidasi dan terkunci.') +
    '<section class="card"><div class="card-head"><i data-icon="clock"></i><h2>Berkas Tervalidasi</h2>' +
    '<div class="spacer"></div><div class="input-icon" style="width:min(240px,45vw)"><i data-icon="search"></i>' +
    '<input class="input" type="search" placeholder="Cari…" oninput="cariTabelDebounced(\'tbl_riwayat\',this.value)"></div></div>' +
    tabelGenerik({ id: 'tbl_riwayat', data: data, kosong: 'Belum ada berkas yang divalidasi.', kolom: [
      { key: '__mapel', label: 'Mata Pelajaran' },
      { key: '__kelas', label: 'Kelas' },
      { key: 'ValidatedBy', label: 'Divalidasi Oleh' },
      { key: 'ValidatedAt', label: 'Waktu', render: function (r) { return esc(fmtTgl(r.ValidatedAt, true)); } },
      { key: '__aksi', label: 'Aksi', cls: 'act', render: function (r) {
          return '<button class="btn btn-outline btn-sm" onclick="bukaValidasi(\'' + r.MapelID + '\',\'' + r.KelasID + '\',\'' + r.Semester + '\')">' +
                 svgIcon('unlock', 16) + ' Buka Kunci</button>'; } }
    ] }) + '</section>';
};
PAGE_INIT['akademik-riwayat'] = function () { gambarTabel('tbl_riwayat'); };

/** Modal peninjauan nilai untuk Tim Akademik — verval per siswa atau sekelas. */
function bukaValidasi(mapelId, kelasId, semester) {
  const meta = { MapelID: mapelId, KelasID: kelasId, Semester: semester,
                 TahunAjaran: DB.institusi.TahunAjaran };
  AppState.pageCtx.vervalMeta = meta;

  openModal({
    title: 'Tinjau Nilai — ' + namaMapel(mapelId), size: 'wide',
    body: '<div class="sk-line skeleton"></div><div class="sk-line skeleton"></div><div class="sk-line skeleton"></div>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>'
  });

  api('apiGetRekapNilai', AppState.sessionToken, meta).then(function (res) {
    if (!res.success) {
      $('#modalBody').innerHTML = '<div class="alert alert-error">' + esc(res.message) + '</div>';
      return;
    }
    const d = res.data;
    const kkm = d.kkm || 70;
    const r = d.ringkas || {};

    $('#modalBody').innerHTML =
      '<div class="row" style="margin-bottom:14px">' +
      '<span class="badge badge-neutral plain">Kelas: <b>' + esc(namaKelas(kelasId)) + '</b></span>' +
      '<span class="badge badge-neutral plain">Semester: <b>' + esc(semester) + '</b></span>' +
      '<span class="badge badge-neutral plain">KKM: <b>' + kkm + '</b></span>' +
      badgeStatus(d.status) + '</div>' +

      '<div class="pilih-bar">' +
        '<label class="checkbox" style="margin:0"><input type="checkbox" id="vervalSemua" onchange="toggleVervalSemua(this)">' +
        '<span>Pilih semua</span></label>' +
        '<button class="chip" onclick="pilihVervalStatus(\'Submitted\')">Pilih yang menunggu (' + (r.Submitted || 0) + ')</button>' +
        '<button class="chip" onclick="pilihVervalStatus(\'\')">Bersihkan</button>' +
        '<span class="muted text-sm row-end">Terpilih: <span class="jml" id="jmlVerval">0</span> siswa</span>' +
      '</div>' +

      '<div class="table-wrap"><table class="tbl" id="tblVerval"><thead><tr>' +
      '<th class="cek"></th><th>NIM</th><th>Nama</th>' +
      d.komponen.map(function (k) {
        return '<th class="num">' + esc(k.Nama) + '<br><small class="muted">' + esc(k.Bobot) + '%</small></th>';
      }).join('') +
      '<th class="num">Nilai Akhir</th><th>Huruf</th><th>Status</th></tr></thead><tbody>' +
      d.baris.map(function (b) {
        return '<tr data-siswa="' + b.SiswaID + '" data-status="' + esc(b.status) + '" class="' +
          (b.nilaiAkhir !== '' && b.nilaiAkhir < kkm ? 'row-danger' : '') + '">' +
          '<td class="cek"><input type="checkbox" class="pilih-verval" value="' + b.SiswaID +
          '" onchange="perbaruiBarVerval()"></td>' +
          '<td>' + esc(b.NIM) + '</td>' +
          '<td><div class="person">' + avatarHtml(b.Nama, b.FotoURL, 30) + '<span>' + esc(b.Nama) + '</span></div></td>' +
          d.komponen.map(function (k) {
            const v = b.nilai[k.Nama];
            return '<td class="num">' + esc(v === undefined || v === null || v === '' ? '-' : v) + '</td>';
          }).join('') +
          '<td class="num"><b>' + esc(b.nilaiAkhir === '' ? '-' : b.nilaiAkhir) + '</b></td>' +
          '<td>' + (b.huruf ? '<span class="badge badge-neutral plain">' + esc(b.huruf) + '</span>' : '-') + '</td>' +
          '<td>' + badgeStatus(b.status) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +

      '<div class="field mt4"><label class="label" for="catatanVerval">Catatan untuk Pengajar</label>' +
      '<textarea class="textarea" id="catatanVerval" style="min-height:80px" ' +
      'placeholder="Opsional — wajib diisi bila mengembalikan berkas."></textarea></div>' +
      '<p class="help">Biarkan tidak ada yang dicentang untuk memproses <b>seluruh siswa</b> di kelas ini, ' +
      'atau centang beberapa siswa untuk memproses sebagian saja.</p>';

    $('#modalFoot').innerHTML =
      '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>' +
      '<button class="btn btn-danger" onclick="prosesVerval(\'unlock\')">' +
      svgIcon('unlock', 18) + ' Buka Kunci</button>' +
      '<button class="btn btn-outline" onclick="prosesVerval(\'return\')">' +
      svgIcon('corner-up-left', 18) + ' Kembalikan</button>' +
      '<button class="btn btn-success" onclick="prosesVerval(\'validate\')">' +
      svgIcon('check-circle', 18) + ' <span id="labelVerval">Verval Satu Kelas</span></button>';

    renderIcons($('#modalRoot'));
    perbaruiBarVerval();
  }).catch(function (e) {
    $('#modalBody').innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
  });
}

function toggleVervalSemua(el) {
  $$('.pilih-verval').forEach(function (c) { c.checked = el.checked; });
  perbaruiBarVerval();
}

/** Mencentang otomatis siswa dengan status tertentu (mis. yang menunggu validasi). */
function pilihVervalStatus(status) {
  $$('#tblVerval tbody tr').forEach(function (tr) {
    const c = tr.querySelector('.pilih-verval');
    if (c) c.checked = status ? tr.dataset.status === status : false;
  });
  const sm = $('#vervalSemua'); if (sm) sm.checked = false;
  perbaruiBarVerval();
}

function siswaVervalTerpilih() {
  return $$('.pilih-verval').filter(function (c) { return c.checked; })
                            .map(function (c) { return c.value; });
}

function perbaruiBarVerval() {
  const n = siswaVervalTerpilih().length;
  const el = $('#jmlVerval'); if (el) el.textContent = n;
  const lbl = $('#labelVerval');
  if (lbl) lbl.textContent = n ? 'Verval ' + n + ' Siswa Terpilih' : 'Verval Satu Kelas';
}

function prosesVerval(aksi) {
  const meta = AppState.pageCtx.vervalMeta;
  const catatan = ($('#catatanVerval') || {}).value || '';
  const terpilih = siswaVervalTerpilih();

  if (aksi === 'return' && !catatan.trim()) {
    showToast('Isi catatan alasan pengembalian terlebih dahulu.', 'warning');
    const t = $('#catatanVerval'); if (t) t.focus();
    return;
  }

  const teks = { validate: 'memvalidasi & mengunci', return: 'mengembalikan', unlock: 'membuka kunci' }[aksi];
  const sasaran = terpilih.length ? terpilih.length + ' siswa terpilih' : 'SELURUH siswa di kelas ini';

  konfirmasi('Anda akan ' + teks + ' nilai untuk ' + sasaran + '. Lanjutkan?', function () {
    api('apiVervalNilai', AppState.sessionToken, meta, aksi, catatan, terpilih).then(function (res) {
      closeModal();
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) refreshData();
    }).catch(function (e) { showToast(e.message, 'error'); });
  }, { danger: aksi === 'unlock', labelYa: 'Ya, Lanjutkan' });
}

/* ---------- Remedial & Pengulangan ---------- */
PAGES['akademik-remedial'] = function (ctx) {
  const tab = ctx.tab || 'remedial';
  const rem = (DB.remedial || []).map(function (r) {
    return Object.assign({}, r, { __nama: namaSiswa(r.SiswaID), __mapel: namaMapel(r.MapelID) });
  });
  const ulang = (DB.pengulangan || []).map(function (r) {
    return Object.assign({}, r, { __nama: namaSiswa(r.SiswaID), __mapel: namaMapel(r.MapelID) });
  });
  return headerHalaman('Remedial & Pengulangan', 'Tetapkan peserta remedial serta pantau hasilnya.',
    '<button class="btn btn-primary" onclick="formRemedial(\'' + tab + '\')"><i data-icon="plus"></i><span>Tambah Data</span></button>') +
    '<div class="tabs">' +
      '<button class="tab' + (tab === 'remedial' ? ' active' : '') + '" onclick="navigateTo(\'akademik-remedial\',{ctx:{tab:\'remedial\'},noHistory:true})">' +
      '<i data-icon="refresh"></i>Remedial<span class="tab-count">' + rem.length + '</span></button>' +
      '<button class="tab' + (tab === 'ulang' ? ' active' : '') + '" onclick="navigateTo(\'akademik-remedial\',{ctx:{tab:\'ulang\'},noHistory:true})">' +
      '<i data-icon="repeat"></i>Mengulang Mata Kuliah<span class="tab-count">' + ulang.length + '</span></button>' +
    '</div>' +
    '<section class="card">' + (tab === 'remedial'
      ? tabelGenerik({ id: 'tbl_rem', data: rem, kosong: 'Belum ada peserta remedial.', kolom: [
          { key: '__nama', label: 'Siswa/Mahasiswa' },
          { key: '__mapel', label: 'Mata Pelajaran' },
          { key: 'Semester', label: 'Smt', cls: 'num' },
          { key: 'NilaiSebelum', label: 'Nilai Awal', cls: 'num' },
          { key: 'NilaiRemedial', label: 'Nilai Remedial', cls: 'num', render: function (r) {
              return r.NilaiRemedial === '' ? '<span class="muted">belum</span>' : '<b>' + esc(r.NilaiRemedial) + '</b>'; } },
          { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } },
          { key: '__aksi', label: 'Aksi', cls: 'act', render: function (r) {
              return '<button class="btn btn-outline btn-sm" onclick="formRemedial(\'remedial\',\'' + r.ID + '\')">Perbarui</button>'; } }
        ] })
      : tabelGenerik({ id: 'tbl_ulang', data: ulang, kosong: 'Belum ada data pengulangan.', kolom: [
          { key: '__nama', label: 'Siswa/Mahasiswa' },
          { key: '__mapel', label: 'Mata Pelajaran' },
          { key: 'SemesterAsal', label: 'Smt Asal', cls: 'num' },
          { key: 'SemesterUlang', label: 'Smt Ulang', cls: 'num' },
          { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } },
          { key: '__aksi', label: 'Aksi', cls: 'act', render: function (r) {
              return '<button class="btn btn-outline btn-sm" onclick="formRemedial(\'ulang\',\'' + r.ID + '\')">Perbarui</button>'; } }
        ] })) + '</section>';
};
PAGE_INIT['akademik-remedial'] = function (ctx) {
  gambarTabel((ctx.tab || 'remedial') === 'remedial' ? 'tbl_rem' : 'tbl_ulang');
};

function formRemedial(tab, id) {
  const isRem = tab === 'remedial';
  const src = isRem ? DB.remedial : DB.pengulangan;
  const d = id ? byId(src, id) : {};
  openModal({
    title: (id ? 'Perbarui ' : 'Tambah ') + (isRem ? 'Remedial' : 'Pengulangan Mata Kuliah'), size: 'wide',
    body: '<form id="formRem" onsubmit="return false"><div class="form-grid">' +
      '<div class="field"><label class="label">Siswa/Mahasiswa <span class="req">*</span></label>' +
      '<select class="select" name="SiswaID" required>' +
      opsiSelect(DB.siswa, 'ID', function (x) { return x.NIM + ' — ' + x.Nama; }, d.SiswaID, '— Pilih —') + '</select></div>' +
      '<div class="field"><label class="label">Mata Pelajaran <span class="req">*</span></label>' +
      '<select class="select" name="MapelID" required>' +
      opsiSelect(DB.mapel, 'ID', function (x) { return x.Kode + ' — ' + x.Nama; }, d.MapelID, '— Pilih —') + '</select></div>' +
      (isRem
        ? '<div class="field"><label class="label">Semester</label><input class="input" name="Semester" value="' + esc(d.Semester || '') + '"></div>' +
          '<div class="field"><label class="label">Nilai Sebelum</label><input class="input" type="number" name="NilaiSebelum" value="' + esc(d.NilaiSebelum || '') + '"></div>' +
          '<div class="field"><label class="label">Nilai Remedial</label><input class="input" type="number" name="NilaiRemedial" value="' + esc(d.NilaiRemedial || '') + '"></div>' +
          '<div class="field"><label class="label">Ambang Batas (KKM)</label><input class="input" type="number" name="AmbangBatas" value="' + esc(d.AmbangBatas || DB.institusi.KKM || 70) + '"></div>' +
          '<div class="field"><label class="label">Status</label><select class="select" name="Status">' +
          opsiSelect(['Diusulkan','Berjalan','Selesai'], null, null, d.Status) + '</select></div>'
        : '<div class="field"><label class="label">Semester Asal</label><input class="input" name="SemesterAsal" value="' + esc(d.SemesterAsal || '') + '"></div>' +
          '<div class="field"><label class="label">Semester Mengulang</label><input class="input" name="SemesterUlang" value="' + esc(d.SemesterUlang || '') + '"></div>' +
          '<div class="field"><label class="label">Status</label><select class="select" name="Status">' +
          opsiSelect(['Diusulkan','Berjalan','Selesai'], null, null, d.Status) + '</select></div>') +
      '<div class="field full"><label class="label">Catatan</label><textarea class="textarea" name="Catatan">' + esc(d.Catatan || '') + '</textarea></div>' +
      '<input type="hidden" name="TahunAjaran" value="' + esc(DB.institusi.TahunAjaran || '') + '">' +
      '</div></form>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-primary" id="btnSimpanRem">' + svgIcon('check', 18) + ' Simpan</button>',
    onOpen: function () {
      $('#btnSimpanRem').onclick = function () {
        if (!validForm('formRem')) return;
        const p = nilaiForm('formRem');
        if (id) p.ID = id;
        api('apiKelolaRemedial', AppState.sessionToken, isRem ? 'Remedial' : 'Pengulangan_Matkul', [p])
          .then(function (res) {
            if (!res.success) { showToast(res.message, 'error'); return; }
            closeModal(); showToast(res.message, 'success'); refreshData();
          }).catch(function (e) { showToast(e.message, 'error'); });
      };
    }
  });
}

/* ==========================================================================
   E. LAPORAN & MONITORING (dipakai Admin, Tim Akademik, Dosen)
   ========================================================================== */
PAGES['laporan'] = function () {
  const jenis = [['absensi','Kehadiran','calendar-check'], ['nilai','Distribusi Nilai','award'],
                 ['tugas','Pengumpulan Tugas','clipboard-list'], ['remedial','Remedial','refresh']];
  if (AppState.user.peran === 'Super Admin' && DB.fitur.spp) jenis.push(['spp','SPP','wallet']);
  return headerHalaman('Laporan & Monitoring', 'Filter berdasarkan kelas, mata pelajaran, semester, dan rentang tanggal.') +
    '<section class="card" style="margin-bottom:16px"><div class="card-body">' +
    '<div class="form-grid">' +
      '<div class="field"><label class="label">Jenis Laporan</label><select class="select" id="lapJenis" onchange="muatLaporan()">' +
      jenis.map(function (j) { return '<option value="' + j[0] + '">' + esc(j[1]) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label class="label">Kelas</label><select class="select" id="lapKelas" onchange="muatLaporan()">' +
      '<option value="">Semua kelas</option>' + opsiSelect(DB.kelas, 'ID', 'Nama') + '</select></div>' +
      '<div class="field"><label class="label">Mata Pelajaran</label><select class="select" id="lapMapel" onchange="muatLaporan()">' +
      '<option value="">Semua mata pelajaran</option>' + opsiSelect(DB.mapel, 'ID', function (x) { return x.Kode + ' — ' + x.Nama; }) + '</select></div>' +
      '<div class="field"><label class="label">Semester</label><select class="select" id="lapSemester" onchange="muatLaporan()">' +
      '<option value="">Semua</option>' + opsiSelect(['1','2','3','4','5','6','7','8']) + '</select></div>' +
      '<div class="field"><label class="label">Dari Tanggal</label><input class="input" type="date" id="lapDari" onchange="muatLaporan()"></div>' +
      '<div class="field"><label class="label">Sampai Tanggal</label><input class="input" type="date" id="lapSampai" onchange="muatLaporan()"></div>' +
    '</div>' +
    '<div class="row"><button class="btn btn-primary" onclick="muatLaporan()"><i data-icon="filter"></i><span>Terapkan Filter</span></button>' +
    '<button class="btn btn-outline" onclick="eksporLaporan()"><i data-icon="download"></i><span>Ekspor CSV</span></button></div>' +
    '</div></section>' +
    '<div id="lapHasil"><div class="sk-card skeleton"></div></div>';
};
PAGE_INIT['laporan'] = function () { muatLaporan(); };

let LAPORAN_TERAKHIR = { jenis: '', rows: [] };

function muatLaporan() {
  const jenis = $('#lapJenis').value;
  const filter = {
    KelasID: $('#lapKelas').value, MapelID: $('#lapMapel').value,
    Semester: $('#lapSemester').value, dari: $('#lapDari').value, sampai: $('#lapSampai').value
  };
  const box = $('#lapHasil');
  box.innerHTML = '<div class="sk-card skeleton"></div>';
  api('apiLaporan', AppState.sessionToken, jenis, filter).then(function (res) {
    if (!res.success) { box.innerHTML = '<div class="alert alert-error">' + esc(res.message) + '</div>'; return; }
    LAPORAN_TERAKHIR = { jenis: jenis, rows: res.data.rows || [] };
    box.innerHTML = gambarLaporan(jenis, res.data);
    renderIcons(box);
    initChartLaporan(jenis, res.data);
    if (jenis === 'absensi') gambarTabel('tbl_lap_absensi');
    if (jenis === 'nilai') gambarTabel('tbl_lap_nilai');
    if (jenis === 'tugas') gambarTabel('tbl_lap_tugas');
    if (jenis === 'remedial') gambarTabel('tbl_lap_rem');
    if (jenis === 'spp') gambarTabel('tbl_lap_spp');
  }).catch(function (e) { box.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>'; });
}

function gambarLaporan(jenis, d) {
  if (jenis === 'absensi') {
    const r = d.rekap, total = (r.Hadir + r.Sakit + r.Izin + r.Alpa) || 1;
    return '<div class="kpi-grid">' +
      kpiCard({ ikon: 'check-circle', label: 'Hadir', nilai: r.Hadir, satuan: '(' + Math.round(r.Hadir / total * 100) + '%)', tint: 'var(--success-soft)', ink: 'var(--success)' }) +
      kpiCard({ ikon: 'alert-circle', label: 'Sakit', nilai: r.Sakit, tint: 'var(--warning-soft)', ink: 'var(--warning)' }) +
      kpiCard({ ikon: 'info', label: 'Izin', nilai: r.Izin, tint: 'var(--info-soft)', ink: 'var(--info)' }) +
      kpiCard({ ikon: 'alert-triangle', label: 'Alpa', nilai: r.Alpa, tint: 'var(--error-soft)', ink: 'var(--error)' }) +
      '</div>' +
      '<section class="card" style="margin-bottom:16px"><div class="card-head"><i data-icon="bar-chart"></i><h2>Grafik Kehadiran</h2></div>' +
      '<div class="card-body"><div class="chart-box"><canvas id="chLap"></canvas></div></div></section>' +
      '<section class="card">' + tabelGenerik({ id: 'tbl_lap_absensi', data: d.rows, perPage: 12,
        kosong: 'Tidak ada data absensi pada filter ini.', kolom: [
          { key: 'Tanggal', label: 'Tanggal', render: function (x) { return esc(fmtTgl(x.Tanggal)); } },
          { key: 'SiswaID', label: 'Siswa', render: function (x) { return esc(namaSiswa(x.SiswaID)); } },
          { key: 'MapelID', label: 'Mata Pelajaran', render: function (x) { return esc(namaMapel(x.MapelID)); } },
          { key: 'Pertemuan', label: 'Pert.', cls: 'num' },
          { key: 'Status', label: 'Status', render: function (x) { return badgeStatus(x.Status); } },
          { key: 'Metode', label: 'Metode' }
        ] }) + '</section>';
  }
  if (jenis === 'nilai') {
    const t = d.distribusi;
    return '<div class="grid grid-side" style="margin-bottom:16px">' +
      '<section class="card"><div class="card-head"><i data-icon="pie-chart"></i><h2>Distribusi Huruf Mutu</h2></div>' +
      '<div class="card-body"><div class="chart-box"><canvas id="chLap"></canvas></div></div></section>' +
      '<section class="card"><div class="card-head"><i data-icon="info"></i><h2>Ringkasan</h2></div><div class="card-body">' +
      ['A','B','C','D','E'].map(function (h) {
        return '<div class="row" style="padding:9px 0;border-bottom:1px solid var(--border-soft)">' +
               '<span>Huruf ' + h + '</span><b class="row-end">' + (t[h] || 0) + '</b></div>';
      }).join('') + '</div></section></div>' +
      '<section class="card">' + tabelGenerik({ id: 'tbl_lap_nilai', data: d.rows, perPage: 12,
        kosong: 'Belum ada nilai tervalidasi pada filter ini.', kolom: [
          { key: 'SiswaID', label: 'Siswa', render: function (x) { return esc(namaSiswa(x.SiswaID)); } },
          { key: 'MapelID', label: 'Mata Pelajaran', render: function (x) { return esc(namaMapel(x.MapelID)); } },
          { key: 'Semester', label: 'Smt', cls: 'num' },
          { key: 'NilaiAkhir', label: 'Nilai', cls: 'num' },
          { key: 'Huruf', label: 'Huruf', render: function (x) { return '<span class="badge badge-neutral plain">' + esc(x.Huruf) + '</span>'; } },
          { key: 'Keterangan', label: 'Keterangan' }
        ] }) + '</section>';
  }
  if (jenis === 'tugas') {
    const r = d.rekap;
    return '<div class="kpi-grid">' +
      kpiCard({ ikon: 'clipboard-list', label: 'Total Tugas', nilai: d.rows.length, tint: 'var(--sc-high)' }) +
      kpiCard({ ikon: 'check-circle', label: 'Tepat Waktu', nilai: r.tepat, tint: 'var(--success-soft)', ink: 'var(--success)' }) +
      kpiCard({ ikon: 'clock', label: 'Terlambat', nilai: r.telat, tint: 'var(--error-soft)', ink: 'var(--error)' }) +
      kpiCard({ ikon: 'trending-up', label: 'Ketepatan', nilai: r.total ? Math.round(r.tepat / r.total * 100) : 0, satuan: '%', tint: 'var(--accent-soft)', ink: 'var(--accent-ink)' }) +
      '</div>' +
      '<section class="card" style="margin-bottom:16px"><div class="card-head"><i data-icon="pie-chart"></i><h2>Ketepatan Pengumpulan</h2></div>' +
      '<div class="card-body"><div class="chart-box"><canvas id="chLap"></canvas></div></div></section>' +
      '<section class="card">' + tabelGenerik({ id: 'tbl_lap_tugas', data: d.rows, perPage: 10,
        kosong: 'Tidak ada tugas pada filter ini.', kolom: [
          { key: 'Judul', label: 'Judul Tugas' },
          { key: 'MapelID', label: 'Mata Pelajaran', render: function (x) { return esc(namaMapel(x.MapelID)); } },
          { key: 'KelasID', label: 'Kelas', render: function (x) { return esc(namaKelas(x.KelasID)); } },
          { key: 'Deadline', label: 'Tenggat', render: function (x) { return esc(fmtTgl(x.Deadline, true)); } },
          { key: '__masuk', label: 'Terkumpul', cls: 'num', render: function (x) {
              return (d.pengumpulan || []).filter(function (p) { return p.TugasID === x.ID; }).length; } }
        ] }) + '</section>';
  }
  if (jenis === 'remedial') {
    return '<section class="card">' + tabelGenerik({ id: 'tbl_lap_rem', data: d.rows, perPage: 12,
      kosong: 'Tidak ada data remedial.', kolom: [
        { key: 'SiswaID', label: 'Siswa', render: function (x) { return esc(namaSiswa(x.SiswaID)); } },
        { key: 'MapelID', label: 'Mata Pelajaran', render: function (x) { return esc(namaMapel(x.MapelID)); } },
        { key: 'Semester', label: 'Smt', cls: 'num' },
        { key: 'NilaiSebelum', label: 'Nilai Awal', cls: 'num' },
        { key: 'NilaiRemedial', label: 'Nilai Remedial', cls: 'num' },
        { key: 'Status', label: 'Status', render: function (x) { return badgeStatus(x.Status); } }
      ] }) + '</section>';
  }
  if (jenis === 'spp') {
    return '<div class="kpi-grid">' +
      kpiCard({ ikon: 'check-circle', label: 'Lunas', nilai: d.rekap.lunas, tint: 'var(--success-soft)', ink: 'var(--success)' }) +
      kpiCard({ ikon: 'alert-circle', label: 'Belum Bayar', nilai: d.rekap.belum, tint: 'var(--error-soft)', ink: 'var(--error)' }) +
      '</div><section class="card">' + tabelGenerik({ id: 'tbl_lap_spp', data: d.rows, perPage: 12,
        kosong: 'Tidak ada tagihan.', kolom: [
          { key: 'SiswaID', label: 'Siswa', render: function (x) { return esc(namaSiswa(x.SiswaID)); } },
          { key: 'Periode', label: 'Periode' },
          { key: 'Nominal', label: 'Nominal', cls: 'num', render: function (x) { return esc(fmtRp(x.Nominal)); } },
          { key: 'StatusBayar', label: 'Status', render: function (x) { return badgeStatus(x.StatusBayar); } }
        ] }) + '</section>';
  }
  return '';
}

function initChartLaporan(jenis, d) {
  const w = warnaTema();
  if (jenis === 'absensi') {
    const r = d.rekap;
    buatChart('chLap', { type: 'bar',
      data: { labels: ['Hadir','Sakit','Izin','Alpa'], datasets: [{ label: 'Jumlah',
        data: [r.Hadir, r.Sakit, r.Izin, r.Alpa],
        backgroundColor: [w.sukses, w.accent, w.info, w.error], borderRadius: 6, maxBarThickness: 56 }] },
      options: { plugins: { legend: { display: false } } } });
  }
  if (jenis === 'nilai') {
    const t = d.distribusi;
    buatChart('chLap', { type: 'bar',
      data: { labels: ['A','B','C','D','E'], datasets: [{ label: 'Jumlah',
        data: [t.A, t.B, t.C, t.D, t.E],
        backgroundColor: [w.sukses, w.primary, w.accent, '#e08b2f', w.error], borderRadius: 6, maxBarThickness: 56 }] },
      options: { plugins: { legend: { display: false } } } });
  }
  if (jenis === 'tugas') {
    buatChart('chLap', { type: 'doughnut',
      data: { labels: ['Tepat Waktu','Terlambat'],
        datasets: [{ data: [d.rekap.tepat, d.rekap.telat], backgroundColor: [w.sukses, w.error], borderWidth: 0 }] },
      options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
  }
}

function eksporLaporan() {
  const rows = LAPORAN_TERAKHIR.rows;
  if (!rows.length) { showToast('Tidak ada data untuk diekspor.', 'warning'); return; }
  const keys = Object.keys(rows[0]);
  const csv = keys.join(',') + '\n' + rows.map(function (r) {
    return keys.map(function (k) { return '"' + String(r[k] === undefined ? '' : r[k]).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  unduhBase64(btoa(unescape(encodeURIComponent(csv))), 'text/csv',
              'Laporan_' + LAPORAN_TERAKHIR.jenis + '_' + new Date().toISOString().slice(0, 10) + '.csv');
}
/* ==========================================================================
   F. DOSEN / GURU
   ========================================================================== */

/** Daftar kelas yang diampu (dari Program_Kelas milik dosen ini). */
function kelasSaya() {
  return (DB.programSaya || []).map(function (p) {
    const siswa = (DB.siswa || []).filter(function (s) { return s.KelasID === p.KelasID; });
    const materi = (DB.materi || []).filter(function (m) { return m.MapelID === p.MapelID && m.KelasID === p.KelasID; });
    const tugas = (DB.tugas || []).filter(function (t) { return t.MapelID === p.MapelID && t.KelasID === p.KelasID; });
    const st = (DB.statusNilai || []).filter(function (s) {
      return s.MapelID === p.MapelID && s.KelasID === p.KelasID; })[0] || { Status: 'Draft' };
    return { prog: p, mapel: byId(DB.mapel, p.MapelID), kelas: byId(DB.kelas, p.KelasID),
             siswa: siswa, materi: materi, tugas: tugas, status: st.Status };
  });
}

PAGES['dosen-dashboard'] = function () {
  const s = DB.statistik || {};
  const hariIni = HARI[new Date().getDay()];
  const jadwalHariIni = (DB.jadwal || []).filter(function (j) {
    return j.Hari === hariIni && j.DosenID === (DB.profil || {}).ID;
  }).sort(function (a, b) { return String(a.JamMulai).localeCompare(String(b.JamMulai)); });

  const belumDinilai = (DB.pengumpulan || []).filter(function (p) {
    return p.Nilai === '' || p.Nilai === null || p.Nilai === undefined; });

  return headerHalaman('Selamat datang, ' + AppState.user.nama.split(' ')[0],
    'Berikut yang terjadi di kelas Anda hari ini · ' + fmtTglPanjang()) +
    '<div class="kpi-grid">' +
      kpiCard({ ikon: 'book-open', label: 'Kelas Diampu', nilai: (DB.programSaya || []).length, tint: 'var(--sc-high)' }) +
      kpiCard({ ikon: 'inbox', label: 'Pengumpulan Masuk', nilai: s.pengumpulanMasuk || 0, tint: 'var(--sc-high)' }) +
      kpiCard({ ikon: 'calendar', label: 'Kelas Hari Ini', nilai: jadwalHariIni.length, tint: 'var(--sc-high)' }) +
      kpiCard({ ikon: 'file-check', label: 'Belum Dinilai', nilai: s.belumDinilai || 0,
                tint: 'var(--accent-soft)', ink: 'var(--accent-ink)', tag: 'Perlu Tindakan' }) +
    '</div>' +
    '<div class="grid grid-side" style="margin-bottom:16px">' +
      '<section class="card"><div class="card-head"><i data-icon="calendar"></i><h2>Jadwal Mengajar Hari Ini</h2>' +
      '<div class="spacer"></div><button class="btn btn-ghost btn-sm" onclick="navigateTo(\'jadwal\')">Lihat Semua</button></div>' +
      (jadwalHariIni.length
        ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Waktu</th><th>Mata Kuliah</th><th>Ruangan</th><th class="act">Aksi</th></tr></thead><tbody>' +
          jadwalHariIni.map(function (j) {
            const jml = (DB.siswa || []).filter(function (x) { return x.KelasID === j.KelasID; }).length;
            return '<tr><td class="nowrap"><b>' + esc(j.JamMulai) + '</b><br><small class="muted">' + esc(j.JamSelesai) + '</small></td>' +
              '<td><strong>' + esc(namaMapel(j.MapelID)) + '</strong><br><small class="muted">' + esc(kodeMapel(j.MapelID)) + ' · ' + jml + ' siswa</small></td>' +
              '<td>' + esc(j.Ruangan || '-') + '</td>' +
              '<td class="act"><button class="btn btn-primary btn-sm" onclick="navigateTo(\'rekaman\',{ctx:{MapelID:\'' + j.MapelID + '\',KelasID:\'' + j.KelasID + '\'}})">Mulai Kelas</button></td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="card-body">' + kosongState('calendar', 'Tidak ada kelas hari ini', 'Nikmati waktu Anda untuk menyiapkan materi berikutnya.') + '</div>') +
      '</section>' +
      '<section class="card"><div class="card-head"><i data-icon="list-checks"></i><h2>Tindakan Tertunda</h2>' +
      '<div class="spacer"></div><span class="badge badge-error">' + ((s.belumDinilai || 0) + (s.nilaiDikembalikan || 0)) + ' Total</span></div>' +
      '<div class="card-body stack">' +
        aksiCepat('Nilai Pengumpulan Tugas', (s.belumDinilai || 0) + ' pengumpulan menunggu penilaian', 'clipboard-list', "navigateTo('dosen-tugas')") +
        aksiCepat('Input & Submit Nilai', (s.nilaiDikembalikan ? s.nilaiDikembalikan + ' berkas perlu revisi' : 'Rekap komponen nilai kelas'), 'star', "navigateTo('dosen-nilai')") +
        aksiCepat('Isi Absensi Kelas', 'Rekam kehadiran pertemuan hari ini', 'calendar-check', "navigateTo('dosen-absensi')") +
        aksiCepat('Rekam & Buat Resume', 'Transkripsi otomatis jadi materi', 'mic', "navigateTo('rekaman')") +
      '</div></section>' +
    '</div>' +
    '<section class="card"><div class="card-head"><i data-icon="users"></i><h2>Aktivitas Siswa Terbaru</h2></div>' +
    (belumDinilai.length
      ? belumDinilai.slice(-6).reverse().map(function (p) {
          const t = byId(DB.tugas, p.TugasID);
          return '<div class="list-item"><span class="avatar">' + esc(inisial(namaSiswa(p.SiswaID))) + '</span>' +
            '<div class="li-main"><strong style="font-weight:500">' + esc(namaSiswa(p.SiswaID)) +
            ' mengumpulkan <b>' + esc(t.Judul || '-') + '</b></strong>' +
            '<small>' + esc(fmtTgl(p.Timestamp, true)) + (String(p.Keterlambatan).toUpperCase() === 'TRUE' ? ' · <span style="color:var(--error)">Terlambat</span>' : '') + '</small></div>' +
            '<div class="li-side"><button class="btn btn-ghost btn-sm" onclick="bukaRekapTugas(\'' + p.TugasID + '\')">Nilai</button></div></div>';
        }).join('')
      : '<div class="card-body">' + kosongState('check-circle', 'Semua sudah dinilai', 'Tidak ada pengumpulan yang menunggu penilaian.') + '</div>') +
    '</section>';
};

/* ---------- Kelas Saya ---------- */
PAGES['dosen-kelas'] = function () {
  const list = kelasSaya();
  return headerHalaman('Kelas Saya', 'Kelola materi, tugas, absensi, dan nilai untuk setiap kelas yang Anda ampu.') +
    (list.length
      ? '<div class="grid grid-3">' + list.map(function (k) {
          const progres = k.tugas.length ? Math.min(100, Math.round(k.materi.length / (k.materi.length + k.tugas.length) * 100)) : (k.materi.length ? 100 : 0);
          return '<article class="card course-card">' +
            '<div class="course-cover">' + svgIcon('book-open', 42) +
            '<span class="course-credit">' + esc(k.mapel.SKS || 0) + ' SKS</span></div>' +
            '<div class="course-body">' +
            '<div class="course-meta"><span class="badge badge-info plain">' + esc(k.mapel.Kode || '-') + '</span>' +
            '<span class="badge badge-accent plain">' + esc(k.mapel.Kategori || 'Wajib') + '</span>' + badgeStatus(k.status) + '</div>' +
            '<h3 class="course-title">' + esc(k.mapel.Nama || '-') + '</h3>' +
            '<div class="course-teacher">' + svgIcon('users', 15) + esc(k.kelas.Nama || '-') + ' · ' + k.siswa.length + ' siswa</div>' +
            '<div class="progress-head"><span class="muted">Materi ' + k.materi.length + ' · Tugas ' + k.tugas.length + '</span>' +
            '<b>' + progres + '%</b></div><div class="progress"><span style="width:' + progres + '%"></span></div>' +
            '<button class="btn btn-primary btn-block mt4" onclick="navigateTo(\'dosen-kelas-detail\',{ctx:{MapelID:\'' + k.prog.MapelID + '\',KelasID:\'' + k.prog.KelasID + '\',Semester:\'' + (k.prog.Semester || '1') + '\'}})">' +
            'Buka Kelas ' + svgIcon('log-in', 16) + '</button>' +
            '</div></article>';
        }).join('') + '</div>'
      : kosongState('book-open', 'Belum ada kelas', 'Super Admin belum menetapkan kelas yang Anda ampu pada Program Kelas.'));
};

PAGES['dosen-kelas-detail'] = function (ctx) {
  const mapel = byId(DB.mapel, ctx.MapelID), kelas = byId(DB.kelas, ctx.KelasID);
  const tab = ctx.tab || 'materi';
  const materi = (DB.materi || []).filter(function (m) { return m.MapelID === ctx.MapelID && m.KelasID === ctx.KelasID; });
  const tugas  = (DB.tugas  || []).filter(function (t) { return t.MapelID === ctx.MapelID && t.KelasID === ctx.KelasID; });
  const siswa  = (DB.siswa  || []).filter(function (s) { return s.KelasID === ctx.KelasID; });
  const c = JSON.stringify(ctx).replace(/"/g, '&quot;');

  const nav = function (t, label, ikon, n) {
    return '<button class="tab' + (tab === t ? ' active' : '') + '" onclick=\'navigateTo("dosen-kelas-detail",{ctx:Object.assign(' + JSON.stringify(ctx) + ',{tab:"' + t + '"}),noHistory:true})\'>' +
      '<i data-icon="' + ikon + '"></i>' + esc(label) + (n !== undefined ? '<span class="tab-count">' + n + '</span>' : '') + '</button>';
  };

  let isi = '';
  if (tab === 'materi') {
    isi = '<section class="card"><div class="card-head"><i data-icon="folder"></i><h2>Materi Pembelajaran</h2>' +
      '<div class="spacer"></div><button class="btn btn-primary btn-sm" onclick=\'formMateri(null,' + JSON.stringify(ctx) + ')\'>' +
      '<i data-icon="plus"></i><span>Tambah Materi</span></button></div>' +
      (materi.length ? materi.sort(function (a, b) { return (a.Pertemuan || 0) - (b.Pertemuan || 0); }).map(kartuMateriDosen).join('')
        : '<div class="card-body">' + kosongState('folder', 'Belum ada materi', 'Unggah PDF/PPT/gambar (maks 2MB) atau sematkan video YouTube.') + '</div>') +
      '</section>';
  } else if (tab === 'tugas') {
    isi = '<section class="card"><div class="card-head"><i data-icon="clipboard-list"></i><h2>Tugas & Quiz</h2>' +
      '<div class="spacer"></div><button class="btn btn-primary btn-sm" onclick=\'formTugas(null,' + JSON.stringify(ctx) + ')\'>' +
      '<i data-icon="plus"></i><span>Buat Tugas</span></button></div>' +
      (tugas.length ? tugas.map(kartuTugasDosen).join('')
        : '<div class="card-body">' + kosongState('clipboard-list', 'Belum ada tugas', 'Buat tugas atau quiz beserta tenggat dan bobot nilainya.') + '</div>') +
      '</section>';
  } else if (tab === 'siswa') {
    isi = '<section class="card"><div class="card-head"><i data-icon="users"></i><h2>Daftar Peserta</h2></div>' +
      tabelGenerik({ id: 'tbl_peserta', data: siswa, kosong: 'Belum ada siswa terdaftar di kelas ini.', kolom: [
        { key: 'NIM', label: 'NIM/NIS' },
        { key: 'Nama', label: 'Nama', render: function (r) {
            return '<div class="person"><span class="avatar">' + esc(inisial(r.Nama)) + '</span>' + esc(r.Nama) +
                   (String(r.IsKetuaKelas).toUpperCase() === 'TRUE' ? ' <span class="badge badge-accent plain">Ketua</span>' : '') + '</div>'; } },
        { key: '__hadir', label: 'Kehadiran', render: function (r) {
            const a = (DB.absensi || []).filter(function (x) { return x.SiswaID === r.ID && x.MapelID === ctx.MapelID; });
            const h = a.filter(function (x) { return x.Status === 'Hadir'; }).length;
            const p = a.length ? Math.round(h / a.length * 100) : 0;
            return '<div style="min-width:120px"><div class="progress' + (p < 75 ? ' is-low' : '') + '"><span style="width:' + p + '%"></span></div>' +
                   '<small class="muted">' + p + '% (' + h + '/' + a.length + ')</small></div>'; } },
        { key: '__tugas', label: 'Tugas Dikumpulkan', cls: 'num', render: function (r) {
            const ids = tugas.map(function (t) { return t.ID; });
            return (DB.pengumpulan || []).filter(function (p) {
              return p.SiswaID === r.ID && ids.indexOf(p.TugasID) !== -1; }).length + ' / ' + tugas.length; } }
      ] }) + '</section>';
  }

  return '<button class="btn btn-ghost btn-sm" onclick="goBack()" style="margin-bottom:12px">' +
    '<i data-icon="corner-up-left"></i><span>Kembali</span></button>' +
    headerHalaman(mapel.Nama || 'Kelas', (mapel.Kode || '') + ' · ' + (kelas.Nama || '') + ' · ' + siswa.length + ' peserta',
      '<button class="btn btn-outline" onclick=\'navigateTo("rekaman",{ctx:' + JSON.stringify(ctx) + '})\'>' +
      '<i data-icon="mic"></i><span>Rekam Pertemuan</span></button>' +
      '<button class="btn btn-primary" onclick=\'navigateTo("dosen-nilai",{ctx:' + JSON.stringify(ctx) + '})\'>' +
      '<i data-icon="star"></i><span>Input Nilai</span></button>') +
    '<div class="tabs">' + nav('materi', 'Materi', 'folder', materi.length) +
    nav('tugas', 'Tugas & Quiz', 'clipboard-list', tugas.length) +
    nav('siswa', 'Peserta', 'users', siswa.length) + '</div>' + isi;
};
PAGE_INIT['dosen-kelas-detail'] = function (ctx) {
  if ((ctx.tab || 'materi') === 'siswa') gambarTabel('tbl_peserta');
};

function kartuMateriDosen(m) {
  const ikon = { 'YouTube': 'video', 'Gambar': 'image', 'Resume Pertemuan': 'sparkles' }[m.Jenis] || 'file-text';
  return '<div class="list-item"><div class="li-ico">' + svgIcon(ikon, 20) + '</div>' +
    '<div class="li-main"><strong>' + esc(m.Judul) + '</strong>' +
    '<small>Pertemuan ' + esc(m.Pertemuan) + ' · ' + esc(m.Jenis) + ' · ' + esc(fmtTgl(m.TanggalUpload)) + '</small></div>' +
    '<div class="li-side">' +
    '<button class="icon-btn" title="Lihat" onclick="bukaMateri(\'' + m.ID + '\')">' + svgIcon('eye', 18) + '</button>' +
    '<button class="icon-btn" title="Hapus" style="color:var(--error)" onclick="hapusMateri(\'' + m.ID + '\')">' + svgIcon('trash', 18) + '</button>' +
    '</div></div>';
}

function kartuTugasDosen(t) {
  const masuk = (DB.pengumpulan || []).filter(function (p) { return p.TugasID === t.ID; });
  const total = (DB.siswa || []).filter(function (s) { return s.KelasID === t.KelasID; }).length || 1;
  const pct = Math.round(masuk.length / total * 100);
  const lewat = new Date(t.Deadline) < new Date();
  return '<div class="list-item"><div class="li-ico">' + svgIcon('clipboard-list', 20) + '</div>' +
    '<div class="li-main"><strong>' + esc(t.Judul) + '</strong>' +
    '<small>Tenggat ' + esc(fmtTgl(t.Deadline, true)) + ' · Bobot ' + esc(t.Bobot) + '% · ' + esc(t.JenisPengumpulan) + '</small>' +
    '<div class="progress" style="max-width:220px"><span style="width:' + pct + '%"></span></div>' +
    '<small class="muted">' + masuk.length + ' dari ' + total + ' terkumpul</small></div>' +
    '<div class="li-side">' + (lewat ? '<span class="badge badge-neutral">Ditutup</span>' : '<span class="badge badge-success">Terbuka</span>') +
    '<button class="btn btn-outline btn-sm" onclick="bukaRekapTugas(\'' + t.ID + '\')">Rekap & Nilai</button>' +
    '<button class="icon-btn" onclick="formTugas(\'' + t.ID + '\')">' + svgIcon('edit', 18) + '</button></div></div>';
}

/* ---------- Materi (halaman penuh) ---------- */
PAGES['dosen-materi'] = function () {
  const data = (DB.materi || []).slice().sort(function (a, b) { return new Date(b.TanggalUpload) - new Date(a.TanggalUpload); });
  return headerHalaman('Materi Pembelajaran', 'Seluruh materi yang Anda unggah, termasuk resume pertemuan otomatis.',
    '<button class="btn btn-primary" onclick="formMateri()"><i data-icon="upload"></i><span>Tambah Materi</span></button>') +
    '<section class="card"><div class="card-head"><i data-icon="folder"></i><h2>Daftar Materi</h2><div class="spacer"></div>' +
    '<div class="input-icon" style="width:min(240px,45vw)"><i data-icon="search"></i>' +
    '<input class="input" type="search" placeholder="Cari judul…" oninput="filterMateri(this.value)"></div></div>' +
    '<div id="daftarMateri">' + (data.length ? data.map(kartuMateriDosen).join('')
      : '<div class="card-body">' + kosongState('folder', 'Belum ada materi', 'Mulai dengan mengunggah materi pertemuan pertama.') + '</div>') + '</div></section>';
};

const filterMateri = debounce(function (q) {
  const kata = String(q || '').toLowerCase();
  const data = (DB.materi || []).filter(function (m) {
    return (m.Judul + ' ' + namaMapel(m.MapelID)).toLowerCase().indexOf(kata) !== -1;
  });
  const box = $('#daftarMateri');
  box.innerHTML = data.length ? data.map(kartuMateriDosen).join('')
    : '<div class="card-body">' + kosongState('search', 'Tidak ditemukan', 'Coba kata kunci lain.') + '</div>';
  renderIcons(box);
}, 220);

function formMateri(id, ctx) {
  const d = id ? byId(DB.materi, id) : {};
  const c = ctx || {};
  openModal({
    title: id ? 'Ubah Materi' : 'Tambah Materi Pembelajaran', size: 'wide',
    body: '<form id="formMat" onsubmit="return false"><div class="form-grid">' +
      '<div class="field full"><label class="label">Judul Materi <span class="req">*</span></label>' +
      '<input class="input" name="Judul" value="' + esc(d.Judul || '') + '" required></div>' +
      '<div class="field"><label class="label">Mata Pelajaran <span class="req">*</span></label>' +
      '<select class="select" name="MapelID" required>' +
      opsiSelect(mapelDiampu(), 'ID', function (x) { return x.Kode + ' — ' + x.Nama; }, d.MapelID || c.MapelID, '— Pilih —') + '</select></div>' +
      '<div class="field"><label class="label">Kelas <span class="req">*</span></label>' +
      '<select class="select" name="KelasID" required>' +
      opsiSelect(kelasDiampu(), 'ID', 'Nama', d.KelasID || c.KelasID, '— Pilih —') + '</select></div>' +
      '<div class="field"><label class="label">Pertemuan ke-</label>' +
      '<input class="input" type="number" name="Pertemuan" min="1" value="' + esc(d.Pertemuan || 1) + '"></div>' +
      '<div class="field"><label class="label">Jenis Materi <span class="req">*</span></label>' +
      '<select class="select" name="Jenis" id="jenisMateri" onchange="ubahJenisMateri()" required>' +
      opsiSelect(['Dokumen','Presentasi','Gambar','YouTube'], null, null, d.Jenis || 'Dokumen') + '</select></div>' +
      '<div class="field full"><label class="label">Deskripsi</label>' +
      '<textarea class="textarea" name="Deskripsi">' + esc(d.Deskripsi || '') + '</textarea></div>' +
      '</div>' +
      '<div id="areaBerkas">' +
        '<label class="label">Berkas (PDF / PPT / Gambar · maks 2MB)</label>' +
        '<div class="dropzone" id="dzMateri"><div class="dz-ico">' + svgIcon('upload-cloud', 28) + '</div>' +
        '<div class="dz-title">Seret & lepas berkas di sini</div>' +
        '<p class="dz-sub">Format didukung: PDF, DOCX, PPTX, JPG, PNG (maks 2MB)</p>' +
        '<span class="btn btn-outline btn-sm">Pilih Berkas</span></div>' +
        '<input type="file" id="fileMateri" accept=".pdf,.doc,.docx,.ppt,.pptx,image/*" hidden>' +
        '<div class="file-pill" id="pillMateri" hidden></div>' +
      '</div>' +
      '<div id="areaYouTube" hidden><div class="field"><label class="label">Tautan YouTube</label>' +
      '<div class="input-icon">' + svgIcon('link', 18) +
      '<input class="input" name="URL" id="urlYouTube" placeholder="https://youtu.be/…" value="' + esc(d.URL || '') + '"></div>' +
      '<p class="help">Video akan disematkan langsung di portal siswa.</p></div></div>' +
      '</form>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-primary" id="btnSimpanMateri">' + svgIcon('upload', 18) + ' Unggah & Publikasikan</button>',
    onOpen: function () {
      pasangDropzone('dzMateri', 'fileMateri', 'pillMateri');
      ubahJenisMateri();
      $('#btnSimpanMateri').onclick = function () { simpanMateri(id); };
    }
  });
}

function mapelDiampu() {
  if (AppState.user.peran === 'Super Admin') return DB.mapel;
  const ids = (DB.programSaya || []).map(function (p) { return p.MapelID; });
  return (DB.mapel || []).filter(function (m) { return ids.indexOf(m.ID) !== -1; });
}
function kelasDiampu() {
  if (AppState.user.peran === 'Super Admin') return DB.kelas;
  const ids = (DB.programSaya || []).map(function (p) { return p.KelasID; });
  return (DB.kelas || []).filter(function (k) { return ids.indexOf(k.ID) !== -1; });
}

function ubahJenisMateri() {
  const yt = $('#jenisMateri').value === 'YouTube';
  $('#areaYouTube').hidden = !yt;
  $('#areaBerkas').hidden = yt;
}

function simpanMateri(id) {
  if (!validForm('formMat')) return;
  const p = nilaiForm('formMat');
  if (id) p.ID = id;
  p.DosenID = (DB.profil || {}).ID || '';
  const btn = $('#btnSimpanMateri');
  btn.disabled = true; btn.innerHTML = svgIcon('refresh', 18) + ' Mengunggah…';

  const lanjut = p.Jenis === 'YouTube' ? Promise.resolve(null) : bacaBerkas($('#fileMateri'));
  lanjut.then(function (file) {
    if (p.Jenis !== 'YouTube' && !file && !id) throw new Error('Pilih berkas terlebih dahulu.');
    return api('apiSimpanMateri', AppState.sessionToken, p, file);
  }).then(function (res) {
    btn.disabled = false; btn.innerHTML = svgIcon('upload', 18) + ' Unggah & Publikasikan';
    if (!res.success) { showToast(res.message, 'error'); return; }
    closeModal(); showToast(res.message, 'success'); refreshData();
  }).catch(function (e) {
    btn.disabled = false; btn.innerHTML = svgIcon('upload', 18) + ' Unggah & Publikasikan';
    showToast(e.message, 'error');
  });
}

function hapusMateri(id) {
  const m = byId(DB.materi, id);
  konfirmasi('Hapus materi "' + (m.Judul || '') + '"?', function () {
    api('apiDelete', AppState.sessionToken, 'Materi', [id]).then(function (res) {
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) refreshData();
    });
  }, { danger: true, labelYa: 'Hapus' });
}

/* ---------- Tugas & Quiz ---------- */
PAGES['dosen-tugas'] = function () {
  const data = (DB.tugas || []).slice().sort(function (a, b) { return new Date(b.Deadline) - new Date(a.Deadline); });
  return headerHalaman('Tugas & Quiz', 'Buat penugasan, pantau pengumpulan, dan beri nilai.',
    '<button class="btn btn-primary" onclick="formTugas()"><i data-icon="plus"></i><span>Buat Tugas Baru</span></button>') +
    '<section class="card"><div class="card-head"><i data-icon="clipboard-list"></i><h2>Daftar Tugas</h2></div>' +
    (data.length ? data.map(kartuTugasDosen).join('')
      : '<div class="card-body">' + kosongState('clipboard-list', 'Belum ada tugas', 'Buat tugas pertama untuk kelas yang Anda ampu.') + '</div>') +
    '</section>';
};

function formTugas(id, ctx) {
  const d = id ? byId(DB.tugas, id) : {};
  const c = ctx || {};
  const dl = d.Deadline ? new Date(d.Deadline) : null;
  const dlVal = dl && !isNaN(dl.getTime())
    ? dl.getFullYear() + '-' + String(dl.getMonth() + 1).padStart(2, '0') + '-' + String(dl.getDate()).padStart(2, '0') +
      'T' + String(dl.getHours()).padStart(2, '0') + ':' + String(dl.getMinutes()).padStart(2, '0')
    : '';
  openModal({
    title: id ? 'Ubah Tugas' : 'Buat Tugas / Quiz', size: 'wide',
    body: '<form id="formTgs" onsubmit="return false"><div class="form-grid">' +
      '<div class="field full"><label class="label">Judul <span class="req">*</span></label>' +
      '<input class="input" name="Judul" value="' + esc(d.Judul || '') + '" required></div>' +
      '<div class="field full"><label class="label">Deskripsi / Instruksi</label>' +
      '<textarea class="textarea" name="Deskripsi" placeholder="Contoh: Kerjakan latihan 1–15 Bab 3. Tunjukkan seluruh langkah pengerjaan.">' + esc(d.Deskripsi || '') + '</textarea></div>' +
      '<div class="field"><label class="label">Mata Pelajaran <span class="req">*</span></label>' +
      '<select class="select" name="MapelID" required>' +
      opsiSelect(mapelDiampu(), 'ID', function (x) { return x.Kode + ' — ' + x.Nama; }, d.MapelID || c.MapelID, '— Pilih —') + '</select></div>' +
      '<div class="field"><label class="label">Kelas <span class="req">*</span></label>' +
      '<select class="select" name="KelasID" required>' +
      opsiSelect(kelasDiampu(), 'ID', 'Nama', d.KelasID || c.KelasID, '— Pilih —') + '</select></div>' +
      '<div class="field"><label class="label">Tenggat <span class="req">*</span></label>' +
      '<input class="input" type="datetime-local" name="Deadline" value="' + esc(dlVal) + '" required></div>' +
      '<div class="field"><label class="label">Jenis Pengumpulan</label><select class="select" name="JenisPengumpulan">' +
      opsiSelect(['File','Teks','Video URL'], null, null, d.JenisPengumpulan) + '</select></div>' +
      '<div class="field"><label class="label">Bobot Nilai (%)</label>' +
      '<input class="input" type="number" name="Bobot" min="0" max="100" value="' + esc(d.Bobot || 15) + '"></div>' +
      '<div class="field"><label class="label">Komponen Nilai</label><select class="select" name="Komponen">' +
      opsiSelect(['Tugas','Kuis','Praktikum','Proyek'], null, null, d.Komponen) + '</select></div>' +
      '<input type="hidden" name="Status" value="Aktif">' +
      '</div></form>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-primary" id="btnSimpanTugas">' + svgIcon('send', 18) + ' Simpan & Beritahu Siswa</button>',
    onOpen: function () {
      $('#btnSimpanTugas').onclick = function () {
        if (!validForm('formTgs')) return;
        const p = nilaiForm('formTgs');
        if (id) p.ID = id;
        p.DosenID = (DB.profil || {}).ID || '';
        api('apiSimpanTugas', AppState.sessionToken, p).then(function (res) {
          if (!res.success) { showToast(res.message, 'error'); return; }
          closeModal(); showToast(res.message, 'success'); refreshData();
        }).catch(function (e) { showToast(e.message, 'error'); });
      };
    }
  });
}

/** Rekap pengumpulan + form penilaian batch. */
function bukaRekapTugas(tugasId) {
  const t = byId(DB.tugas, tugasId);
  const siswa = (DB.siswa || []).filter(function (s) { return s.KelasID === t.KelasID; });
  const kirim = (DB.pengumpulan || []).filter(function (p) { return p.TugasID === tugasId; });

  const baris = siswa.map(function (s) {
    const p = kirim.filter(function (x) { return x.SiswaID === s.ID; })[0];
    return '<tr><td>' + esc(s.NIM) + '</td>' +
      '<td><div class="person"><span class="avatar">' + esc(inisial(s.Nama)) + '</span>' + esc(s.Nama) + '</div></td>' +
      '<td>' + (p
        ? (String(p.Keterlambatan).toUpperCase() === 'TRUE'
            ? '<span class="badge badge-error">Terlambat</span>' : '<span class="badge badge-success">Tepat Waktu</span>') +
          '<br><small class="muted">' + esc(fmtTgl(p.Timestamp, true)) + '</small>'
        : '<span class="badge badge-neutral">Belum Mengumpulkan</span>') + '</td>' +
      '<td>' + (p ? tombolLihatJawaban(p) : '<span class="muted">—</span>') + '</td>' +
      '<td class="num">' + (p
        ? '<input class="input nilai-input" style="width:88px;text-align:right" type="number" min="0" max="100" ' +
          'data-id="' + p.ID + '" value="' + esc(p.Nilai === '' ? '' : p.Nilai) + '">'
        : '<span class="muted">—</span>') + '</td>' +
      '<td>' + (p ? '<input class="input fb-input" data-id="' + p.ID + '" placeholder="Umpan balik…" value="' + esc(p.Feedback || '') + '">' : '') + '</td></tr>';
  }).join('');

  openModal({
    title: 'Rekap Pengumpulan — ' + (t.Judul || ''), size: 'wide',
    body: '<div class="row" style="margin-bottom:14px">' +
      '<span class="badge badge-neutral plain">Kelas: <b>' + esc(namaKelas(t.KelasID)) + '</b></span>' +
      '<span class="badge badge-neutral plain">Tenggat: <b>' + esc(fmtTgl(t.Deadline, true)) + '</b></span>' +
      '<span class="badge badge-info plain">Terkumpul: <b>' + kirim.length + '/' + siswa.length + '</b></span></div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>NIM</th><th>Nama</th><th>Status</th>' +
      '<th>Jawaban</th><th class="num">Nilai</th><th>Umpan Balik</th></tr></thead><tbody>' + baris + '</tbody></table></div>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>' +
      '<button class="btn btn-primary" onclick="simpanPenilaianTugas()">' + svgIcon('check', 18) + ' Simpan Semua Penilaian</button>'
  });
}

function tombolLihatJawaban(p) {
  if (p.FileID) {
    return '<button class="btn btn-outline btn-sm" onclick="previewFile(\'' + esc(p.KontenURL) + '\',\'Jawaban Tugas\',\'' +
           'https://drive.google.com/uc?export=download&id=' + esc(p.FileID) + '\')">' + svgIcon('eye', 15) + ' Berkas</button>';
  }
  if (p.KontenURL) {
    return '<button class="btn btn-outline btn-sm" onclick="previewFile(\'' + esc(p.KontenURL) + '\',\'Video Jawaban\')">' +
           svgIcon('video', 15) + ' Video</button>';
  }
  if (p.KontenTeks) {
    const teks = String(p.KontenTeks).replace(/'/g, "\\'").replace(/\n/g, ' ');
    return '<button class="btn btn-outline btn-sm" onclick="lihatTeksJawaban(\'' + esc(p.ID) + '\')">' +
           svgIcon('file-text', 15) + ' Teks</button>';
  }
  return '<span class="muted">—</span>';
}

function lihatTeksJawaban(id) {
  const p = (DB.pengumpulan || []).filter(function (x) { return x.ID === id; })[0] || {};
  openModal({ title: 'Jawaban Teks — ' + namaSiswa(p.SiswaID),
    body: '<div style="white-space:pre-wrap;line-height:1.7">' + esc(p.KontenTeks || '') + '</div>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>' });
}

function simpanPenilaianTugas() {
  const items = {};
  $$('.nilai-input').forEach(function (i) { items[i.dataset.id] = { ID: i.dataset.id, Nilai: i.value, Feedback: '' }; });
  $$('.fb-input').forEach(function (i) { if (items[i.dataset.id]) items[i.dataset.id].Feedback = i.value; });
  const arr = Object.keys(items).map(function (k) { return items[k]; });
  if (!arr.length) { showToast('Tidak ada pengumpulan untuk dinilai.', 'warning'); return; }
  api('apiNilaiPengumpulanBatch', AppState.sessionToken, arr).then(function (res) {
    closeModal(); showToast(res.message, res.success ? 'success' : 'error');
    if (res.success) refreshData();
  }).catch(function (e) { showToast(e.message, 'error'); });
}
/* ---------- Absensi (Dosen) ---------- */
PAGES['dosen-absensi'] = function (ctx) {
  const prog = DB.programSaya || [];
  return headerHalaman('Absensi Kelas', 'Isi kehadiran seluruh peserta, atau koreksi absensi mandiri yang terindikasi keliru.',
    (DB.fitur.barcode ? '<button class="btn btn-outline" onclick="buatSesiBarcode()"><i data-icon="qr-code"></i><span>Buat QR Sesi</span></button>' : '')) +
    '<section class="card" style="margin-bottom:16px"><div class="card-body"><div class="form-grid">' +
      '<div class="field"><label class="label">Kelas & Mata Pelajaran</label><select class="select" id="absProg" onchange="muatAbsensiKelas()">' +
      '<option value="">— Pilih —</option>' + prog.map(function (p) {
        return '<option value="' + p.ID + '">' + esc(namaKelas(p.KelasID) + ' · ' + namaMapel(p.MapelID)) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label class="label">Pertemuan ke-</label>' +
      '<input class="input" type="number" id="absPertemuan" min="1" value="1" onchange="muatAbsensiKelas()"></div>' +
      '<div class="field"><label class="label">Tanggal</label>' +
      '<input class="input" type="date" id="absTanggal" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
    '</div></div></section>' +
    '<div id="absBody">' + kosongState('calendar-check', 'Pilih kelas terlebih dahulu', 'Daftar peserta akan muncul setelah kelas dan pertemuan dipilih.') + '</div>';
};

function muatAbsensiKelas() {
  const progId = $('#absProg').value;
  const box = $('#absBody');
  if (!progId) { box.innerHTML = kosongState('calendar-check', 'Pilih kelas terlebih dahulu', 'Daftar peserta akan muncul setelah kelas dipilih.'); renderIcons(box); return; }
  const p = (DB.programSaya || []).filter(function (x) { return x.ID === progId; })[0];
  const pert = $('#absPertemuan').value || 1;
  const siswa = (DB.siswa || []).filter(function (s) { return s.KelasID === p.KelasID; });
  const sudah = (DB.absensi || []).filter(function (a) {
    return a.MapelID === p.MapelID && String(a.Pertemuan) === String(pert); });

  const rows = siswa.map(function (s) {
    const a = sudah.filter(function (x) { return x.SiswaID === s.ID; })[0] || {};
    const opt = function (v) {
      return '<option value="' + v + '"' + (a.Status === v ? ' selected' : '') + '>' + v + '</option>';
    };
    return '<tr><td>' + esc(s.NIM) + '</td>' +
      '<td><div class="person"><span class="avatar">' + esc(inisial(s.Nama)) + '</span>' + esc(s.Nama) + '</div></td>' +
      '<td>' + (a.Metode ? '<span class="badge badge-neutral plain">' + esc(a.Metode) + '</span>' : '<span class="muted text-sm">—</span>') + '</td>' +
      '<td>' + (a.BuktiURL
        ? '<button class="btn btn-outline btn-sm" onclick="previewFile(\'' + esc(a.BuktiURL) + '\',\'Bukti Absensi\')">' + svgIcon('eye', 15) + ' Bukti</button>'
        : '<span class="muted">—</span>') + '</td>' +
      '<td><select class="select abs-status" data-siswa="' + s.ID + '" style="min-width:120px">' +
      opt('Hadir') + opt('Sakit') + opt('Izin') + opt('Alpa') + '</select></td>' +
      '<td><input class="input abs-ket" data-siswa="' + s.ID + '" placeholder="Keterangan…" value="' + esc(a.Keterangan || '') + '"></td></tr>';
  }).join('');

  box.innerHTML = '<section class="card"><div class="card-head"><i data-icon="users"></i>' +
    '<h2>' + esc(namaKelas(p.KelasID)) + ' — Pertemuan ' + esc(pert) + '</h2><div class="spacer"></div>' +
    '<button class="btn btn-outline btn-sm" onclick="setSemuaAbsensi(\'Hadir\')">Tandai Semua Hadir</button></div>' +
    '<div class="table-wrap"><table class="tbl"><thead><tr><th>NIM</th><th>Nama</th><th>Metode</th><th>Bukti</th>' +
    '<th>Status</th><th>Keterangan</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="table-foot"><span>' + siswa.length + ' peserta · ' + sudah.length + ' sudah tercatat</span>' +
    '<button class="btn btn-primary row-end" onclick="simpanAbsensiKelas(\'' + progId + '\')">' +
    svgIcon('check', 18) + ' Simpan Absensi</button></div></section>';
  renderIcons(box);
}

function setSemuaAbsensi(status) {
  $$('.abs-status').forEach(function (s) { s.value = status; });
  showToast('Semua peserta ditandai ' + status + '.', 'success');
}

function simpanAbsensiKelas(progId) {
  const p = (DB.programSaya || []).filter(function (x) { return x.ID === progId; })[0];
  const meta = { MapelID: p.MapelID, KelasID: p.KelasID,
                 Pertemuan: $('#absPertemuan').value || 1, Tanggal: $('#absTanggal').value };
  const daftar = $$('.abs-status').map(function (s) {
    const ket = $$('.abs-ket').filter(function (k) { return k.dataset.siswa === s.dataset.siswa; })[0];
    return { SiswaID: s.dataset.siswa, Status: s.value, Keterangan: ket ? ket.value : '' };
  });
  api('apiAbsensiManualBatch', AppState.sessionToken, meta, daftar).then(function (res) {
    showToast(res.message, res.success ? 'success' : 'error');
    if (res.success) refreshData(true).then(function () { muatAbsensiKelas(); });
  }).catch(function (e) { showToast(e.message, 'error'); });
}

function buatSesiBarcode() {
  const prog = DB.programSaya || [];
  openModal({
    title: 'Buat QR Absensi Sesi', size: 'slim',
    body: '<div class="field"><label class="label">Kelas & Mata Pelajaran</label><select class="select" id="qrProg">' +
      prog.map(function (p) { return '<option value="' + p.ID + '">' + esc(namaKelas(p.KelasID) + ' · ' + namaMapel(p.MapelID)) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label class="label">Pertemuan ke-</label><input class="input" type="number" id="qrPert" min="1" value="1"></div>' +
      '<div id="qrHasil" class="text-center"></div>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>' +
      '<button class="btn btn-primary" id="btnBuatQR">' + svgIcon('qr-code', 18) + ' Buat Kode</button>',
    onOpen: function () {
      $('#btnBuatQR').onclick = function () {
        const p = prog.filter(function (x) { return x.ID === $('#qrProg').value; })[0];
        api('apiBuatSesiBarcode', AppState.sessionToken,
            { KelasID: p.KelasID, MapelID: p.MapelID, Pertemuan: $('#qrPert').value })
          .then(function (res) {
            if (!res.success) { showToast(res.message, 'error'); return; }
            const box = $('#qrHasil');
            box.innerHTML = '<div id="qrCanvas" style="display:inline-block;padding:16px;background:#fff;border-radius:12px"></div>' +
              '<p class="mt4"><b>' + esc(res.data.sesiKode) + '</b></p>' +
              '<p class="help">Berlaku sampai ' + esc(fmtTgl(res.data.berlakuSampai, true)) + '. Minta peserta memindainya.</p>';
            if (typeof QRCode !== 'undefined') {
              new QRCode(document.getElementById('qrCanvas'), { text: res.data.sesiKode, width: 190, height: 190 });
            }
          }).catch(function (e) { showToast(e.message, 'error'); });
      };
    }
  });
}

/* ---------- Input Nilai (Dosen) — bobot dinamis & submit per siswa ---------- */
const GRID_NILAI = { komponen: [], baris: [], meta: null, terkunci: false, status: 'Draft', kkm: 70 };

PAGES['dosen-nilai'] = function (ctx) {
  const prog = DB.programSaya || [];
  const terpilih = ctx.MapelID ? prog.filter(function (p) {
    return p.MapelID === ctx.MapelID && p.KelasID === ctx.KelasID; })[0] : null;
  return headerHalaman('Input & Submit Nilai',
    'Susun sendiri komponen bobot (total wajib 100%), isi nilai, lalu kirim untuk divalidasi — bisa satu kelas atau siswa terpilih.') +
    '<section class="card" style="margin-bottom:16px"><div class="card-body">' +
      '<div class="row">' +
        '<div class="field" style="flex:1;min-width:280px;margin-bottom:0">' +
        '<label class="label" for="nilProg">Kelas &amp; Mata Pelajaran</label>' +
        '<select class="select" id="nilProg" onchange="muatGridNilai()">' +
        '<option value="">— Pilih —</option>' + prog.map(function (p) {
          return '<option value="' + p.ID + '"' + (terpilih && terpilih.ID === p.ID ? ' selected' : '') + '>' +
                 esc(namaKelas(p.KelasID) + ' · ' + namaMapel(p.MapelID)) + '</option>';
        }).join('') + '</select></div>' +
        '<button class="btn btn-outline" id="btnAturBobot" onclick="formBobotKomponen()" disabled>' +
        '<i data-icon="list-checks"></i><span>Atur Bobot Komponen</span></button>' +
      '</div>' +
    '</div></section>' +
    '<div id="nilBody">' +
    kosongState('star', 'Pilih kelas terlebih dahulu',
      'Grid nilai muncul setelah kelas dipilih. Komponen penilaian dapat Anda susun sendiri.') +
    '</div>';
};
PAGE_INIT['dosen-nilai'] = function (ctx) { if (ctx.MapelID) muatGridNilai(); };

function metaNilaiTerpilih() {
  const p = (DB.programSaya || []).filter(function (x) { return x.ID === $('#nilProg').value; })[0];
  if (!p) return null;
  return { MapelID: p.MapelID, KelasID: p.KelasID, Semester: p.Semester || '1',
           TahunAjaran: p.TahunAjaran || DB.institusi.TahunAjaran || '' };
}

function muatGridNilai() {
  const box = $('#nilBody');
  const meta = metaNilaiTerpilih();
  $('#btnAturBobot').disabled = !meta;
  if (!meta) {
    box.innerHTML = kosongState('star', 'Pilih kelas terlebih dahulu', 'Grid nilai muncul setelah kelas dipilih.');
    renderIcons(box); return;
  }
  box.innerHTML = '<div class="sk-card skeleton"></div>';

  api('apiGetRekapNilai', AppState.sessionToken, meta).then(function (res) {
    if (!res.success) { box.innerHTML = '<div class="alert alert-error">' + esc(res.message) + '</div>'; return; }
    GRID_NILAI.komponen = res.data.komponen;
    GRID_NILAI.baris = res.data.baris;
    GRID_NILAI.meta = meta;
    GRID_NILAI.terkunci = res.data.terkunci;
    GRID_NILAI.status = res.data.status;
    GRID_NILAI.kkm = res.data.kkm || 70;
    box.innerHTML = gambarGridNilai(res.data, meta);
    renderIcons(box);
  }).catch(function (e) { box.innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>'; });
}

function gambarGridNilai(d, meta) {
  const komponen = d.komponen;
  const kkm = d.kkm;
  const totalBobot = komponen.reduce(function (a, b) { return a + (Number(b.Bobot) || 0); }, 0);

  const rows = d.baris.map(function (b) {
    const kunci = b.status === 'Validated';
    const dis = kunci ? ' disabled' : '';
    return '<tr data-siswa="' + b.SiswaID + '" class="' +
      (b.nilaiAkhir !== '' && b.nilaiAkhir < kkm ? 'row-danger' : '') + '">' +
      '<td class="cek"><input type="checkbox" class="pilih-siswa" value="' + b.SiswaID + '"' +
      (kunci ? ' disabled title="Sudah tervalidasi"' : '') + ' onchange="perbaruiBarPilih()"></td>' +
      '<td>' + esc(b.NIM) + '</td>' +
      '<td><div class="person">' + avatarHtml(b.Nama, b.FotoURL, 32) + '<span>' + esc(b.Nama) + '</span></div></td>' +
      komponen.map(function (k) {
        const v = b.nilai[k.Nama];
        return '<td class="num"><input class="input inp-nilai" type="number" min="0" max="100" step="0.01" ' +
          'style="width:82px;text-align:right" data-komponen="' + esc(k.Nama) + '" ' +
          'value="' + esc(v === undefined || v === null ? '' : v) + '"' + dis +
          ' oninput="hitungBarisNilai(this)"></td>';
      }).join('') +
      '<td class="num"><b class="out-akhir">' + esc(b.nilaiAkhir === '' ? '-' : b.nilaiAkhir) + '</b></td>' +
      '<td class="out-huruf">' + (b.huruf ? '<span class="badge badge-neutral plain">' + esc(b.huruf) + '</span>' : '-') + '</td>' +
      '<td class="out-status">' + badgeStatus(b.status) + '</td></tr>';
  }).join('');

  const r = d.ringkas || {};
  return (d.status === 'Returned' || r.Returned
      ? '<div class="alert alert-warn"><i data-icon="corner-up-left"></i><div><strong>Ada nilai yang dikembalikan</strong>' +
        '<p>' + esc((d.meta && d.meta.Catatan) || 'Tim Akademik meminta perbaikan nilai.') +
        ' Perbaiki lalu kirim ulang.</p></div></div>' : '') +
    (d.terkunci ? '<div class="alert alert-success"><i data-icon="lock"></i><div><strong>Seluruh nilai kelas ini terkunci</strong>' +
      '<p>Sudah divalidasi Tim Akademik. Ajukan pembukaan kunci bila perlu revisi.</p></div></div>' : '') +

    '<section class="card" style="margin-bottom:16px"><div class="card-body">' +
    '<div class="row"><span class="muted text-sm">Komponen penilaian aktif:</span>' +
    komponen.map(function (k) {
      return '<span class="badge badge-info plain">' + esc(k.Nama) + ' · ' + esc(k.Bobot) + '%</span>';
    }).join('') +
    '<span class="badge ' + (totalBobot === 100 ? 'badge-success' : 'badge-error') + '">Total ' + totalBobot + '%</span>' +
    '<button class="btn btn-outline btn-sm row-end" onclick="formBobotKomponen()">' +
    svgIcon('edit', 16) + ' Ubah Bobot</button></div>' +
    (d.tersimpanKomponen === false
      ? '<p class="help mt4">Komponen di atas masih bawaan sistem. Klik <b>Ubah Bobot</b> untuk menyesuaikannya dengan rencana pembelajaran Anda.</p>'
      : '') +
    '</div></section>' +

    '<div class="pilih-bar" id="barPilih">' +
      '<label class="checkbox" style="margin:0"><input type="checkbox" id="pilihSemua" onchange="togglePilihSemua(this)">' +
      '<span>Pilih semua</span></label>' +
      '<span class="muted text-sm">Terpilih: <span class="jml" id="jmlPilih">0</span> siswa</span>' +
      '<span class="muted text-sm row-end">Draf ' + (r.Draft || 0) + ' · Menunggu ' + (r.Submitted || 0) +
      ' · Tervalidasi ' + (r.Validated || 0) + ' · Dikembalikan ' + (r.Returned || 0) + '</span>' +
    '</div>' +

    '<section class="card"><div class="card-head"><i data-icon="star"></i>' +
    '<h2>' + esc(namaMapel(meta.MapelID)) + ' — ' + esc(namaKelas(meta.KelasID)) + '</h2>' +
    '<div class="spacer"></div>' + badgeStatus(d.status) + '</div>' +
    '<div class="table-wrap"><table class="tbl" id="gridNilai"><thead><tr>' +
    '<th class="cek"></th><th>NIM</th><th>Nama</th>' +
    komponen.map(function (k) {
      return '<th class="num">' + esc(k.Nama) + '<br><small class="muted">' + esc(k.Bobot) + '%</small></th>';
    }).join('') +
    '<th class="num">Nilai Akhir</th><th>Huruf</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="table-foot"><span>KKM: <b>' + kkm + '</b> · ' + d.baris.length + ' siswa aktif</span>' +
    '<div class="row row-end">' +
    '<button class="btn btn-outline" onclick="simpanNilai(false)">' + svgIcon('check', 18) + ' Simpan Draf</button>' +
    '<button class="btn btn-primary" onclick="simpanNilai(true)">' + svgIcon('send', 18) +
    ' <span id="labelSubmit">Submit Satu Kelas</span></button>' +
    '</div></div></section>';
}

function togglePilihSemua(el) {
  $$('.pilih-siswa').forEach(function (c) { if (!c.disabled) c.checked = el.checked; });
  perbaruiBarPilih();
}

function siswaTerpilih() {
  return $$('.pilih-siswa').filter(function (c) { return c.checked && !c.disabled; })
                           .map(function (c) { return c.value; });
}

function perbaruiBarPilih() {
  const n = siswaTerpilih().length;
  const el = $('#jmlPilih'); if (el) el.textContent = n;
  const lbl = $('#labelSubmit');
  if (lbl) lbl.textContent = n ? 'Submit ' + n + ' Siswa Terpilih' : 'Submit Satu Kelas';
}

/** Hitung nilai akhir baris secara instan di klien (0ms, tanpa server). */
function hitungBarisNilai(input) {
  const tr = input.closest('tr');
  const komponen = GRID_NILAI.komponen;
  let jml = 0, bobot = 0;
  $$('.inp-nilai', tr).forEach(function (el) {
    if (el.value === '') return;
    const k = komponen.filter(function (x) { return x.Nama === el.dataset.komponen; })[0];
    const b = k ? (Number(k.Bobot) || 0) : 0;
    jml += Number(el.value) * b; bobot += b;
  });
  const akhir = bobot ? Math.round(jml / bobot * 100) / 100 : '';
  tr.querySelector('.out-akhir').textContent = akhir === '' ? '-' : akhir;
  tr.querySelector('.out-huruf').innerHTML = akhir === ''
    ? '-' : '<span class="badge badge-neutral plain">' + hurufMutuKlien(akhir) + '</span>';
  tr.classList.toggle('row-danger', akhir !== '' && akhir < GRID_NILAI.kkm);
}

function hurufMutuKlien(n) {
  n = Number(n);
  if (n >= 85) return 'A';
  if (n >= 75) return 'B';
  if (n >= 65) return 'C';
  if (n >= 50) return 'D';
  return 'E';
}

function kumpulkanNilaiGrid() {
  return $$('#gridNilai tbody tr').map(function (tr) {
    const nilai = {};
    $$('.inp-nilai', tr).forEach(function (el) { nilai[el.dataset.komponen] = el.value; });
    return { SiswaID: tr.dataset.siswa, nilai: nilai };
  });
}

function simpanNilai(submit) {
  const meta = GRID_NILAI.meta;
  if (!meta) return;
  const terpilih = siswaTerpilih();
  let items = kumpulkanNilaiGrid();
  if (submit && terpilih.length) {
    items = items.filter(function (i) { return terpilih.indexOf(i.SiswaID) !== -1; });
  }

  api('apiSimpanNilaiBatch', AppState.sessionToken, meta, items).then(function (res) {
    if (!res.success) { showToast(res.message, 'error'); return; }
    if (!submit) { showToast(res.message, 'success'); return; }

    const sasaran = terpilih.length
      ? terpilih.length + ' siswa terpilih'
      : 'SELURUH siswa di kelas ini';
    konfirmasi('Kirim nilai ' + sasaran + ' ke Tim Akademik untuk divalidasi? ' +
      'Setelah tervalidasi, nilai tersebut akan terkunci.', function () {
      api('apiSubmitNilaiValidasi', AppState.sessionToken, meta, terpilih).then(function (r2) {
        showToast(r2.message, r2.success ? 'success' : 'error');
        if (r2.success) refreshData(true).then(muatGridNilai);
      }).catch(function (e) { showToast(e.message, 'error'); });
    }, { labelYa: 'Ya, Kirim' });
  }).catch(function (e) { showToast(e.message, 'error'); });
}

/* ---------- Penyusun bobot komponen (Upgrade 15) ---------- */
function formBobotKomponen() {
  const meta = metaNilaiTerpilih();
  if (!meta) { showToast('Pilih kelas terlebih dahulu.', 'warning'); return; }

  openModal({
    title: 'Atur Komponen & Bobot Penilaian', size: '',
    body: '<div class="sk-line skeleton"></div><div class="sk-line skeleton"></div>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>'
  });

  api('apiGetKomponenNilai', AppState.sessionToken, meta).then(function (res) {
    if (!res.success) { $('#modalBody').innerHTML = '<div class="alert alert-error">' + esc(res.message) + '</div>'; return; }
    BOBOT_DRAFT = res.data.komponen.map(function (k) {
      return { Nama: k.Nama, Bobot: Number(k.Bobot) || 0 };
    });
    $('#modalBody').innerHTML =
      '<p class="help">Susun komponen penilaian sesuai rencana pembelajaran Anda — boleh 2, 3, 5, ' +
      'hingga 10 komponen. <b>Total bobot wajib tepat 100%.</b></p>' +
      '<div class="row" style="margin-bottom:10px">' +
      preset('Standar (Tugas 30 · UTS 30 · UAS 40)', [['Tugas',30],['UTS',30],['UAS',40]]) +
      preset('Ringkas (UTS 40 · UAS 60)', [['UTS',40],['UAS',60]]) +
      preset('Lengkap 5 komponen', [['Kehadiran',10],['Tugas',20],['Kuis',10],['UTS',25],['UAS',35]]) +
      '</div>' +
      '<div id="daftarBobot"></div>' +
      '<button class="btn btn-outline btn-sm" id="btnTambahBobot">' +
      svgIcon('plus', 16) + ' Tambah Komponen</button>' +
      '<div class="bobot-total" id="totalBobot"></div>';
    $('#modalFoot').innerHTML =
      '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-primary" id="btnSimpanBobot">' + svgIcon('check', 18) + ' Simpan Bobot</button>';
    $('#btnTambahBobot').onclick = tambahBarisBobot;
    $('#btnSimpanBobot').onclick = function () { simpanBobot(meta); };
    gambarBarisBobot();
    renderIcons($('#modalRoot'));
  }).catch(function (e) {
    $('#modalBody').innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>';
  });
}

let BOBOT_DRAFT = [];

function preset(label, isi) {
  return '<button class="chip" onclick=\'terapkanPreset(' + JSON.stringify(isi) + ')\'>' + esc(label) + '</button>';
}

function terapkanPreset(isi) {
  BOBOT_DRAFT = isi.map(function (x) { return { Nama: x[0], Bobot: x[1] }; });
  gambarBarisBobot();
}

function gambarBarisBobot() {
  const box = $('#daftarBobot');
  box.innerHTML = BOBOT_DRAFT.map(function (k, i) {
    return '<div class="bobot-row">' +
      '<input class="input" value="' + esc(k.Nama) + '" placeholder="Nama komponen" ' +
      'oninput="ubahBobot(' + i + ',\'Nama\',this.value)">' +
      '<div class="input-icon"><input class="input" type="number" min="0" max="100" step="1" ' +
      'style="text-align:right;padding-left:12px" value="' + esc(k.Bobot) + '" ' +
      'oninput="ubahBobot(' + i + ',\'Bobot\',this.value)"></div>' +
      '<button class="icon-btn" style="color:var(--error)" title="Hapus komponen" ' +
      'onclick="hapusBarisBobot(' + i + ')">' + svgIcon('trash', 18) + '</button>' +
      '</div>';
  }).join('');
  hitungTotalBobot();
  renderIcons(box);
}

function ubahBobot(i, field, v) {
  BOBOT_DRAFT[i][field] = field === 'Bobot' ? (v === '' ? '' : Number(v)) : v;
  hitungTotalBobot();
}

function tambahBarisBobot() {
  if (BOBOT_DRAFT.length >= 10) { showToast('Maksimal 10 komponen penilaian.', 'warning'); return; }
  BOBOT_DRAFT.push({ Nama: '', Bobot: 0 });
  gambarBarisBobot();
}

function hapusBarisBobot(i) {
  if (BOBOT_DRAFT.length <= 1) { showToast('Minimal satu komponen penilaian.', 'warning'); return; }
  BOBOT_DRAFT.splice(i, 1);
  gambarBarisBobot();
}

function hitungTotalBobot() {
  const total = BOBOT_DRAFT.reduce(function (a, b) { return a + (Number(b.Bobot) || 0); }, 0);
  const el = $('#totalBobot');
  if (!el) return total;
  const ok = Math.round(total * 100) / 100 === 100;
  el.className = 'bobot-total ' + (ok ? 'ok' : 'salah');
  el.innerHTML = '<span>Total Bobot</span><span>' + total + '%' +
    (ok ? ' ✓ siap disimpan'
        : (total > 100 ? ' — kelebihan ' + (total - 100) + '%' : ' — kurang ' + (100 - total) + '%')) + '</span>';
  const btn = $('#btnSimpanBobot');
  if (btn) btn.disabled = !ok;
  return total;
}

function simpanBobot(meta) {
  const total = hitungTotalBobot();
  if (Math.round(total * 100) / 100 !== 100) {
    showToast('Total bobot harus tepat 100%. Saat ini ' + total + '%.', 'error');
    return;
  }
  const btn = $('#btnSimpanBobot');
  btn.disabled = true; btn.innerHTML = svgIcon('refresh', 18) + ' Menyimpan…';
  api('apiSimpanKomponenNilai', AppState.sessionToken, meta, BOBOT_DRAFT).then(function (res) {
    btn.disabled = false; btn.innerHTML = svgIcon('check', 18) + ' Simpan Bobot';
    if (!res.success) { showToast(res.message, 'error'); return; }
    closeModal();
    showToast(res.message, 'success');
    refreshData(true).then(muatGridNilai);
  }).catch(function (e) {
    btn.disabled = false; btn.innerHTML = svgIcon('check', 18) + ' Simpan Bobot';
    showToast(e.message, 'error');
  });
}

/* ==========================================================================
   G. REKAM PERTEMUAN → TRANSKRIPSI → RESUME (US-11a)
   ========================================================================== */
const REC = {
  recognition: null, aktif: false, jeda: false,
  mulai: 0, timerId: null, detik: 0,
  final: [], interim: '', kata: 0,
  audioCtx: null, analyser: null, stream: null, rafId: null,
  resume: null, ctx: {}
};

PAGES['rekaman'] = function (ctx) {
  const prog = AppState.user.peran === 'Siswa'
    ? (DB.enrollmentSaya || []).map(function (e) { return { MapelID: e.MapelID, KelasID: e.KelasID, ID: e.ID }; })
    : (DB.programSaya || []);
  const dukung = ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);

  return headerHalaman('Rekam & Resume Pertemuan',
    'Rekam suara sesi, transkripsikan otomatis di peramban, lalu rapikan menjadi resume materi resmi.') +
    (!dukung ? '<div class="alert alert-warn"><i data-icon="alert-triangle"></i><div><strong>Transkripsi otomatis tidak didukung</strong>' +
      '<p>Peramban Anda belum mendukung Web Speech API. Gunakan Google Chrome / Microsoft Edge terbaru, ' +
      'atau ketik/tempel transkrip secara manual di kotak transkrip.</p></div></div>' : '') +
    /* v2.0 — perekaman berjalan langsung di halaman ini. Pada v1.1 hal ini
       mustahil karena bingkai Apps Script tidak diberi izin mikrofon. */
    (dukung ? '<div class="rec-native-badge">' + svgIcon('mic', 14) +
      ' Perekam bawaan aktif — mikrofon dipakai langsung dari halaman ini</div>' : '') +
    '<div class="rec-wrap">' +
      /* Panel kiri: konfigurasi sesi */
      '<section class="card"><div class="card-head"><i data-icon="settings"></i><h2>Konfigurasi Sesi</h2></div>' +
      '<div class="card-body">' +
        '<div class="field"><label class="label" for="recProg">Kelas & Mata Pelajaran</label>' +
        '<select class="select" id="recProg">' + prog.map(function (p) {
          return '<option value="' + p.MapelID + '|' + p.KelasID + '"' +
                 (ctx.MapelID === p.MapelID ? ' selected' : '') + '>' +
                 esc(namaMapel(p.MapelID) + ' · ' + namaKelas(p.KelasID)) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label class="label" for="recJudul">Topik / Judul</label>' +
        '<input class="input" id="recJudul" placeholder="Contoh: Keterkaitan Kuantum"></div>' +
        '<div class="field"><label class="label" for="recPert">Pertemuan ke-</label>' +
        '<input class="input" type="number" id="recPert" min="1" value="1"></div>' +
        '<label class="checkbox"><input type="checkbox" id="recAutoResume" checked>' +
        '<span>Buat resume otomatis setelah selesai</span></label>' +
        '<div class="field"><label class="label">Masukan Mikrofon</label>' +
        '<div class="progress" style="height:8px"><span id="micLevel" style="width:0%;background:var(--accent)"></span></div>' +
        '<p class="help" id="micStatus">Belum aktif</p></div>' +
      '</div></section>' +

      /* Panel tengah: kontrol rekaman */
      '<section class="card"><div class="card-body rec-stage">' +
        '<div class="rec-pill" id="recPill" hidden><span class="dot"></span> Sedang Merekam</div>' +
        '<div class="rec-timer" id="recTimer">00:00:00</div>' +
        '<div class="rec-viz" id="recViz">' + Array.from({ length: 13 }).map(function () { return '<i></i>'; }).join('') + '</div>' +
        '<div class="rec-controls">' +
          '<button class="rec-btn" id="btnJeda" onclick="jedaRekaman()" aria-label="Jeda" disabled>' + svgIcon('pause', 22) + '</button>' +
          '<button class="rec-btn main" id="btnRekam" onclick="toggleRekaman()" aria-label="Mulai / hentikan rekaman">' + svgIcon('mic', 26) + '</button>' +
          '<button class="rec-btn" id="btnTandai" onclick="tandaiPoin()" aria-label="Tandai poin penting" disabled>' + svgIcon('flag', 22) + '</button>' +
        '</div>' +
        '<p class="help text-center" id="recHint">Tekan tombol merah untuk mulai merekam dan mentranskripsi.</p>' +
        '<div class="row" style="justify-content:center" id="recAlternatif">' +
          '<button class="btn btn-ghost btn-sm" onclick="suntingTranskrip()">' +
          '<i data-icon="edit"></i><span>Ketik / Tempel Transkrip</span></button>' +
        '</div>' +
      '</div></section>' +

      /* Panel kanan: transkrip langsung */
      '<section class="card"><div class="card-head"><i data-icon="file-text"></i><h2>Transkrip Langsung</h2>' +
      '<div class="spacer"></div><span class="badge badge-neutral plain" id="recKata">0 kata</span></div>' +
      '<div class="transcript" id="recTranskrip">' +
        '<p class="muted text-sm">Hasil transkripsi akan muncul di sini secara langsung selama perekaman berjalan. ' +
        'Anda dapat menyuntingnya sebelum diringkas.</p>' +
      '</div>' +
      '<div class="table-foot"><span class="text-sm muted" id="recStatus">Siap merekam</span>' +
      '<button class="btn btn-ghost btn-sm row-end" onclick="suntingTranskrip()">' +
      svgIcon('edit', 16) + ' Sunting Transkrip</button></div></section>' +
    '</div>' +

    '<div class="row mt4">' +
      '<button class="btn btn-outline" id="btnRingkas" onclick="ringkasTranskrip()" disabled>' +
      '<i data-icon="sparkles"></i><span>Rapikan & Ringkas</span></button>' +
      '<button class="btn btn-primary" id="btnPublikasi" onclick="publikasikanResume()" disabled>' +
      '<i data-icon="send"></i><span>Simpan sebagai Materi Resmi</span></button>' +
    '</div>' +
    '<div id="recHasil" class="mt4"></div>';
};
PAGE_INIT['rekaman'] = function () {
  siapkanRekaman();

  const el   = $('#micStatus');
  const hint = $('#recHint');

  /* v2.0 — status izin dibaca langsung dari peramban dan LANGKAH PERBAIKANNYA
     benar-benar berlaku, karena tidak ada lagi kebijakan iframe Apps Script
     yang membatalkannya. */
  if (!konteksAman()) {
    if (el) {
      el.innerHTML = '<span style="color:var(--error)">Perlu HTTPS</span> — ' +
        '<a href="javascript:void(0)" onclick="tampilkanPanduanMikrofon(\'tidak-aman\')">lihat penjelasan</a>';
    }
    if (hint) hint.textContent = 'Mikrofon memerlukan halaman HTTPS. Gunakan Ketik / Tempel Transkrip untuk sementara.';
    return;
  }

  cekStatusMikrofon().then(function (status) {
    if (!el) return;
    if (status === 'granted') {
      el.innerHTML = '<span style="color:var(--success)">Izin diberikan · siap merekam</span>';
      if (hint) hint.textContent = 'Tekan tombol merah untuk mulai merekam dan mentranskripsi.';
    } else if (status === 'denied') {
      el.innerHTML = '<span style="color:var(--error)">Izin diblokir</span> — ' +
        '<a href="javascript:void(0)" onclick="tampilkanPanduanMikrofon(\'ditolak\')">cara mengaktifkan</a>';
      if (hint) hint.textContent = 'Mikrofon diblokir peramban. Klik “cara mengaktifkan” di panel kiri.';
    } else {
      el.textContent = 'Izin akan diminta saat tombol rekam ditekan';
    }
  });
};

function siapkanRekaman() {
  REC.final = []; REC.interim = ''; REC.detik = 0; REC.kata = 0; REC.aktif = false; REC.resume = null;
  gambarTranskrip();
}

function toggleRekaman() {
  if (REC.aktif) hentikanRekaman(); else mulaiRekaman();
}

/**
 * v2.0 — Perekaman NATIVE.
 *
 * Pada v1.1 fungsi ini harus menebak apakah penolakan mikrofon berasal dari
 * pengguna atau dari Permissions Policy bingkai Apps Script, lalu beralih ke
 * jendela Perekam Eksternal. Semua itu tidak diperlukan lagi: halaman ini
 * berdiri di origin-nya sendiri, sehingga izin mikrofon berperilaku persis
 * seperti situs web biasa — ditolak berarti benar-benar ditolak pengguna,
 * dan panduan setelan peramban benar-benar menyelesaikannya.
 *
 * Stream yang diperoleh dipakai ulang oleh visualiser sehingga izin hanya
 * diminta satu kali.
 */
function mulaiRekaman() {
  const btn = $('#btnRekam');
  if (btn) { btn.disabled = true; btn.innerHTML = svgIcon('refresh', 26); }
  const hint = $('#recHint');
  if (hint) hint.textContent = 'Menyiapkan mikrofon…';

  cobaAksesMikrofon().then(function (hasil) {
    if (btn) { btn.disabled = false; btn.innerHTML = svgIcon('mic', 26); }

    if (hasil.ok) {
      REC.stream = hasil.stream;
      const st = $('#micStatus');
      if (st) st.innerHTML = '<span style="color:var(--success)">Mikrofon aktif</span>';
      mulaiRekamanDenganIzin();
      return;
    }

    const st = $('#micStatus');
    if (st) st.textContent = 'Tidak tersedia';
    if (hint) hint.textContent = 'Mikrofon belum bisa dipakai. Anda tetap dapat mengetik transkrip manual.';
    tampilkanPanduanMikrofon(hasil.sebab, hasil.detail, 'mikrofon');
  });
}

/** Menjalankan perekaman setelah izin mikrofon dipastikan tersedia. */
function mulaiRekamanDenganIzin() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('Peramban ini belum mendukung transkripsi otomatis. Rekaman berjalan — ketik catatan lewat "Sunting Transkrip".', 'warning');
  }

  if (SR) {
    const r = new SR();
    r.lang = APP_CONFIG.bahasaRekam; r.continuous = true; r.interimResults = true;
    r.onresult = function (e) {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const teks = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          REC.final.push({ t: REC.detik, teks: teks.trim() });
        } else interim += teks;
      }
      REC.interim = interim;
      gambarTranskrip();
    };
    r.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        hentikanRekaman();
        tampilkanPanduanMikrofon('ditolak');
      } else if (e.error === 'audio-capture') {
        hentikanRekaman();
        tampilkanPanduanMikrofon('tidak-ada');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('Speech error:', e.error);
      }
    };
    r.onend = function () { if (REC.aktif && !REC.jeda) { try { r.start(); } catch (err) {} } };
    try { r.start(); } catch (err) { console.warn(err); }
    REC.recognition = r;
  }

  REC.aktif = true; REC.jeda = false; REC.mulai = Date.now() - REC.detik * 1000;
  REC.timerId = setInterval(function () {
    REC.detik = Math.floor((Date.now() - REC.mulai) / 1000);
    const j = String(Math.floor(REC.detik / 3600)).padStart(2, '0');
    const m = String(Math.floor(REC.detik % 3600 / 60)).padStart(2, '0');
    const d = String(REC.detik % 60).padStart(2, '0');
    const el = $('#recTimer'); if (el) el.textContent = j + ':' + m + ':' + d;
  }, 500);

  $('#recPill').hidden = false;
  $('#btnRekam').innerHTML = svgIcon('square', 26);
  $('#btnJeda').disabled = false;
  $('#btnTandai').disabled = false;
  $('#recHint').textContent = 'Berbicaralah dengan jelas. Tekan kotak untuk menghentikan rekaman.';
  $('#recStatus').textContent = 'Mentranskripsi…';
  mulaiVisualizer();
}

function jedaRekaman() {
  if (!REC.aktif) return;
  REC.jeda = !REC.jeda;
  if (REC.jeda) {
    try { REC.recognition && REC.recognition.stop(); } catch (e) {}
    clearInterval(REC.timerId);
    $('#btnJeda').innerHTML = svgIcon('play', 22);
    $('#recStatus').textContent = 'Dijeda';
    $('#recPill').hidden = true;
  } else {
    try { REC.recognition && REC.recognition.start(); } catch (e) {}
    REC.mulai = Date.now() - REC.detik * 1000;
    REC.timerId = setInterval(function () {
      REC.detik = Math.floor((Date.now() - REC.mulai) / 1000);
      const j = String(Math.floor(REC.detik / 3600)).padStart(2, '0');
      const m = String(Math.floor(REC.detik % 3600 / 60)).padStart(2, '0');
      const d = String(REC.detik % 60).padStart(2, '0');
      const el = $('#recTimer'); if (el) el.textContent = j + ':' + m + ':' + d;
    }, 500);
    $('#btnJeda').innerHTML = svgIcon('pause', 22);
    $('#recStatus').textContent = 'Mentranskripsi…';
    $('#recPill').hidden = false;
  }
}

function tandaiPoin() {
  REC.final.push({ t: REC.detik, teks: '[POIN PENTING]', tanda: true });
  gambarTranskrip();
  showToast('Poin penting ditandai pada menit ini.', 'success');
}

function hentikanRekaman() {
  REC.aktif = false; REC.jeda = false;
  try { REC.recognition && REC.recognition.stop(); } catch (e) {}
  REC.recognition = null;
  clearInterval(REC.timerId);
  hentikanVisualizer();
  const pill = $('#recPill'); if (pill) pill.hidden = true;
  const btn = $('#btnRekam'); if (btn) btn.innerHTML = svgIcon('mic', 26);
  const bj = $('#btnJeda'); if (bj) { bj.disabled = true; bj.innerHTML = svgIcon('pause', 22); }
  const bt = $('#btnTandai'); if (bt) bt.disabled = true;
  const hint = $('#recHint'); if (hint) hint.textContent = 'Rekaman selesai. Rapikan transkrip lalu simpan sebagai materi.';
  const st = $('#recStatus'); if (st) st.textContent = 'Selesai · ' + REC.kata + ' kata';
  const br = $('#btnRingkas'); if (br) br.disabled = teksTranskrip().length < 20;
  if ($('#recAutoResume') && $('#recAutoResume').checked && teksTranskrip().length >= 20) ringkasTranskrip();
}

/** Dipanggil router saat berpindah halaman agar mikrofon tidak menyala terus. */
function hentikanRekamanJikaAda(pageIdBaru) {
  if (REC.aktif && pageIdBaru !== 'rekaman') {
    REC.aktif = false;
    try { REC.recognition && REC.recognition.stop(); } catch (e) {}
    clearInterval(REC.timerId);
    hentikanVisualizer();
    showToast('Rekaman dihentikan karena Anda berpindah halaman.', 'warning');
  }
}

function teksTranskrip() {
  return REC.final.filter(function (f) { return !f.tanda; })
    .map(function (f) { return f.teks; }).join(' ').trim();
}

function gambarTranskrip() {
  const box = $('#recTranskrip');
  if (!box) return;
  const fmtT = function (s) {
    return String(Math.floor(s / 3600)).padStart(2, '0') + ':' +
           String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  let html = REC.final.map(function (f) {
    return '<div class="tr-line' + (f.tanda ? ' live' : '') + '"><span class="ts">' + fmtT(f.t) + '</span>' +
           (f.tanda ? '<b style="color:var(--accent-ink)">' + esc(f.teks) + '</b>' : esc(f.teks)) + '</div>';
  }).join('');
  if (REC.interim) {
    html += '<div class="tr-line live"><span class="ts">' + fmtT(REC.detik) + '</span>' +
            esc(REC.interim) + '<span class="tr-caret"></span></div>';
  }
  if (!html) html = '<p class="muted text-sm">Hasil transkripsi akan muncul di sini secara langsung selama perekaman berjalan.</p>';
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
  REC.kata = teksTranskrip().split(/\s+/).filter(Boolean).length;
  const k = $('#recKata'); if (k) k.textContent = REC.kata.toLocaleString('id-ID') + ' kata';
  const br = $('#btnRingkas'); if (br) br.disabled = teksTranskrip().length < 20;
}

function suntingTranskrip() {
  openModal({
    title: 'Sunting Transkrip', size: 'wide',
    body: '<p class="help">Perbaiki ejaan atau tambahkan bagian yang terlewat sebelum diringkas.</p>' +
      '<textarea class="textarea" id="editTranskrip" style="min-height:320px">' + esc(teksTranskrip()) + '</textarea>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-primary" id="btnSimpanTr">' + svgIcon('check', 18) + ' Terapkan</button>',
    onOpen: function () {
      $('#btnSimpanTr').onclick = function () {
        REC.final = [{ t: 0, teks: $('#editTranskrip').value.trim() }];
        REC.interim = '';
        closeModal(); gambarTranskrip();
        showToast('Transkrip diperbarui.', 'success');
      };
    }
  });
}

function konteksRekaman() {
  const v = ($('#recProg').value || '|').split('|');
  return {
    MapelID: v[0], KelasID: v[1],
    Judul: $('#recJudul').value.trim() || 'Resume Pertemuan',
    Pertemuan: $('#recPert').value || 1,
    Durasi: $('#recTimer').textContent
  };
}

function ringkasTranskrip() {
  const teks = teksTranskrip();
  if (teks.length < 20) { showToast('Transkrip terlalu pendek untuk diringkas.', 'warning'); return; }
  const btn = $('#btnRingkas');
  btn.disabled = true; btn.innerHTML = svgIcon('refresh', 18) + '<span>Merapikan…</span>';

  api('apiPratinjauRingkasan', AppState.sessionToken, teks, konteksRekaman()).then(function (res) {
    btn.disabled = false; btn.innerHTML = svgIcon('sparkles', 18) + '<span>Rapikan & Ringkas</span>';
    if (!res.success) { showToast(res.message, 'error'); return; }
    REC.resume = res.data;
    $('#btnPublikasi').disabled = false;
    const box = $('#recHasil');
    box.innerHTML = '<section class="card"><div class="card-head"><i data-icon="sparkles"></i>' +
      '<h2>Pratinjau Resume</h2><div class="spacer"></div>' +
      '<span class="badge badge-accent plain">Otomatis</span></div><div class="card-body">' +
      '<h3 style="font-size:19px;margin-bottom:12px">' + esc(res.data.judul) + '</h3>' +
      '<h4 style="font-size:14px;margin:16px 0 8px">A. Poin-Poin Kunci</h4><ol style="padding-left:20px">' +
      res.data.poin.map(function (p) { return '<li style="margin-bottom:6px">' + esc(p) + '</li>'; }).join('') + '</ol>' +
      '<h4 style="font-size:14px;margin:16px 0 8px">B. Uraian Pembahasan</h4>' +
      res.data.paragraf.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      '<h4 style="font-size:14px;margin:16px 0 8px">C. Istilah & Kata Kunci</h4>' +
      '<div class="chip-row">' + res.data.kataKunci.map(function (k) { return '<span class="chip">' + esc(k) + '</span>'; }).join('') + '</div>' +
      (res.data.tindakLanjut.length ? '<h4 style="font-size:14px;margin:16px 0 8px">D. Tindak Lanjut</h4><ul style="padding-left:20px">' +
        res.data.tindakLanjut.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      '</div></section>';
    renderIcons(box);
    showToast('Resume berhasil dirapikan. Periksa lalu simpan sebagai materi.', 'success');
  }).catch(function (e) {
    btn.disabled = false; btn.innerHTML = svgIcon('sparkles', 18) + '<span>Rapikan & Ringkas</span>';
    showToast(e.message, 'error');
  });
}

function publikasikanResume() {
  const teks = teksTranskrip();
  const ctx = konteksRekaman();
  if (!ctx.MapelID) { showToast('Pilih kelas & mata pelajaran terlebih dahulu.', 'warning'); return; }
  const btn = $('#btnPublikasi');
  btn.disabled = true; btn.innerHTML = svgIcon('refresh', 18) + '<span>Menyimpan…</span>';

  api('apiSimpanResumePertemuan', AppState.sessionToken, {
    MapelID: ctx.MapelID, KelasID: ctx.KelasID, Judul: ctx.Judul,
    Pertemuan: ctx.Pertemuan, Durasi: ctx.Durasi, Transkrip: teks,
    DosenID: (DB.profil || {}).ID || ''
  }).then(function (res) {
    btn.disabled = false; btn.innerHTML = svgIcon('send', 18) + '<span>Simpan sebagai Materi Resmi</span>';
    if (!res.success) { showToast(res.message, 'error'); return; }
    showToast(res.message, 'success');
    openModal({
      title: 'Resume Tersimpan', size: 'wide',
      body: '<div class="alert alert-success"><i data-icon="check-circle"></i><div><strong>' + esc(res.data.judul) + '</strong>' +
        '<p>Resume telah dipublikasikan sebagai materi kelas dan dapat diakses seluruh peserta.</p></div></div>' +
        '<iframe class="preview-frame" src="' + esc(res.data.previewUrl) + '" title="Pratinjau resume"></iframe>',
      foot: '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>' +
        '<button class="btn btn-outline" onclick="unduhResume(\'' + res.data.resumeId + '\',\'docx\')">' + svgIcon('download', 18) + ' Unduh DOCX</button>' +
        '<button class="btn btn-primary" onclick="unduhResume(\'' + res.data.resumeId + '\',\'pdf\')">' + svgIcon('download', 18) + ' Unduh PDF</button>'
    });
    siapkanRekaman();
    $('#recHasil').innerHTML = '';
    $('#recTimer').textContent = '00:00:00';
    refreshData(true);
  }).catch(function (e) {
    btn.disabled = false; btn.innerHTML = svgIcon('send', 18) + '<span>Simpan sebagai Materi Resmi</span>';
    showToast(e.message, 'error');
  });
}

function unduhResume(resumeId, format) {
  showToast('Menyiapkan berkas ' + format.toUpperCase() + '…', 'info');
  api('apiUnduhResume', AppState.sessionToken, resumeId, format).then(function (res) {
    if (!res.success) { showToast(res.message, 'error'); return; }
    unduhBase64(res.data.base64, res.data.mimeType, res.data.fileName);
  }).catch(function (e) { showToast(e.message, 'error'); });
}

/* Visualiser level mikrofon */
function mulaiVisualizer() {
  const bars = $$('#recViz i');
  /* Pakai ulang stream yang sudah diizinkan agar tidak meminta izin dua kali */
  const siap = REC.stream
    ? Promise.resolve(REC.stream)
    : (navigator.mediaDevices && navigator.mediaDevices.getUserMedia
        ? navigator.mediaDevices.getUserMedia({ audio: true }) : Promise.reject(new Error('unsupported')));

  siap.then(function (stream) {
    REC.stream = stream;
    REC.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = REC.audioCtx.createMediaStreamSource(stream);
    REC.analyser = REC.audioCtx.createAnalyser();
    REC.analyser.fftSize = 64;
    src.connect(REC.analyser);
    const data = new Uint8Array(REC.analyser.frequencyBinCount);
    const st = $('#micStatus'); if (st) st.textContent = 'Optimal';

    const loop = function () {
      if (!REC.aktif) return;
      REC.analyser.getByteFrequencyData(data);
      let total = 0;
      bars.forEach(function (b, i) {
        const v = data[(i * 2) % data.length] || 0;
        total += v;
        b.style.height = Math.max(8, Math.round(v / 255 * 56)) + 'px';
      });
      const lvl = Math.min(100, Math.round(total / bars.length / 255 * 160));
      const ml = $('#micLevel'); if (ml) ml.style.width = lvl + '%';
      REC.rafId = requestAnimationFrame(loop);
    };
    loop();
  }).catch(function () {
    const st = $('#micStatus'); if (st) st.textContent = 'Izin mikrofon tidak diberikan';
    visualizerPalsu(bars);
  });
}

function visualizerPalsu(bars) {
  const tick = function () {
    if (!REC.aktif) return;
    bars.forEach(function (b) { b.style.height = (10 + Math.random() * 40) + 'px'; });
    REC.rafId = setTimeout(tick, 140);
  };
  tick();
}

function hentikanVisualizer() {
  if (REC.rafId) { cancelAnimationFrame(REC.rafId); clearTimeout(REC.rafId); REC.rafId = null; }
  if (REC.stream) { REC.stream.getTracks().forEach(function (t) { t.stop(); }); REC.stream = null; }
  if (REC.audioCtx) { try { REC.audioCtx.close(); } catch (e) {} REC.audioCtx = null; }
  $$('#recViz i').forEach(function (b) { b.style.height = '12px'; });
  const ml = $('#micLevel'); if (ml) ml.style.width = '0%';
  const st = $('#micStatus'); if (st) st.textContent = 'Belum aktif';
}
/* ==========================================================================
   H. SISWA / MAHASISWA
   ========================================================================== */

function mapelSaya() {
  const ids = (DB.enrollmentSaya || []).map(function (e) { return e.MapelID; });
  return (DB.mapel || []).filter(function (m) { return ids.indexOf(m.ID) !== -1; });
}

function pengumpulanUntuk(tugasId) {
  return (DB.pengumpulanSaya || []).filter(function (p) { return p.TugasID === tugasId; })[0];
}

PAGES['siswa-dashboard'] = function () {
  const s = DB.statistik || {};
  const hariIni = HARI[new Date().getDay()];
  const jadwalHariIni = (DB.jadwal || []).filter(function (j) { return j.Hari === hariIni; })
    .sort(function (a, b) { return String(a.JamMulai).localeCompare(String(b.JamMulai)); });

  const tenggat = (DB.tugas || []).filter(function (t) { return !pengumpulanUntuk(t.ID); })
    .sort(function (a, b) { return new Date(a.Deadline) - new Date(b.Deadline); }).slice(0, 4);

  return headerHalaman('Selamat datang kembali, ' + AppState.user.nama.split(' ')[0],
    'Ini yang terjadi pada studi Anda hari ini · ' + fmtTglPanjang()) +
    '<div class="kpi-grid">' +
      kpiCard({ ikon: 'graduation-cap', label: 'Kelas Hari Ini', nilai: jadwalHariIni.length, tint: 'var(--sc-high)' }) +
      kpiCard({ ikon: 'clipboard-list', label: 'Tugas Tertunda', nilai: s.tugasBelumDikumpulkan || 0,
                tint: 'var(--error-soft)', ink: 'var(--error)' }) +
      kpiCard({ ikon: 'calendar-check', label: 'Tingkat Kehadiran', nilai: s.persenKehadiran || 0, satuan: '%',
                tint: 'var(--accent-soft)', ink: 'var(--accent-ink)' }) +
      kpiCard({ ikon: 'star', label: 'IPK / Rata-rata', nilai: s.ipk || '0.00', tint: 'var(--sc-high)' }) +
    '</div>' +
    '<div class="grid grid-side" style="margin-bottom:16px">' +
      '<section class="card"><div class="card-head"><i data-icon="calendar"></i><h2>Jadwal Hari Ini</h2>' +
      '<div class="spacer"></div><button class="btn btn-ghost btn-sm" onclick="navigateTo(\'jadwal\')">Lihat Penuh →</button></div>' +
      (jadwalHariIni.length
        ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Waktu</th><th>Mata Pelajaran</th><th>Ruangan</th><th>Pengajar</th></tr></thead><tbody>' +
          jadwalHariIni.map(function (j) {
            return '<tr><td class="nowrap">' + esc(j.JamMulai) + ' – ' + esc(j.JamSelesai) + '</td>' +
              '<td><strong>' + esc(namaMapel(j.MapelID)) + '</strong></td>' +
              '<td>' + esc(j.Ruangan || '-') + '</td><td>' + esc(namaDosen(j.DosenID)) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="card-body">' + kosongState('calendar', 'Tidak ada kelas hari ini', 'Gunakan waktu ini untuk mengulang materi.') + '</div>') +
      '</section>' +
      '<section class="card"><div class="card-head"><i data-icon="clock"></i><h2>Tenggat Mendatang</h2></div>' +
      (tenggat.length ? tenggat.map(function (t) {
          const sisa = Math.ceil((new Date(t.Deadline) - new Date()) / 86400000);
          const badge = sisa < 0 ? '<span class="badge badge-error">Terlambat</span>'
            : sisa === 0 ? '<span class="badge badge-warn">Hari Ini</span>'
            : sisa === 1 ? '<span class="badge badge-warn">Besok</span>'
            : '<span class="badge badge-info">' + sisa + ' Hari Lagi</span>';
          return '<div class="list-item"><div class="li-main"><strong>' + esc(t.Judul) + '</strong>' +
            '<small>' + esc(namaMapel(t.MapelID)) + ' · ' + esc(fmtTgl(t.Deadline, true)) + '</small></div>' +
            '<div class="li-side">' + badge + '</div></div>';
        }).join('')
        : '<div class="card-body">' + kosongState('check-circle', 'Semua tugas selesai', 'Tidak ada tenggat yang menunggu. Pertahankan!') + '</div>') +
      '</section>' +
    '</div>' +
    '<section class="card"><div class="card-head"><i data-icon="bell"></i><h2>Pemberitahuan Terbaru</h2></div>' +
    (function () {
      const n = daftarNotifikasi();
      return n.length ? '<div class="grid grid-2" style="padding:16px">' + n.slice(0, 4).map(function (x) {
        return '<div class="list-item" style="border:1px solid var(--border-soft);border-radius:var(--r-md)">' +
          '<div class="li-ico" style="background:' + x.tint + '">' + svgIcon(x.ikon, 20) + '</div>' +
          '<div class="li-main"><strong style="font-weight:500">' + esc(x.judul) + '</strong><small>' + esc(x.sub) + '</small></div></div>';
      }).join('') + '</div>'
      : '<div class="card-body">' + kosongState('bell', 'Belum ada pemberitahuan', 'Informasi kelas akan tampil di sini.') + '</div>';
    })() + '</section>';
};

/* ---------- Portal Belajar ---------- */
PAGES['siswa-kursus'] = function () {
  const list = mapelSaya();
  return headerHalaman('Portal Belajar', 'Kelola program yang Anda ikuti dan pantau kemajuan akademik.',
    '<div class="input-icon" style="width:min(320px,60vw)"><i data-icon="search"></i>' +
    '<input class="input" type="search" placeholder="Cari mata pelajaran atau pengajar…" oninput="filterKursus(this.value)"></div>') +
    '<div class="chip-row" style="margin-bottom:20px">' +
      '<button class="chip active" onclick="filterKursusStatus(this,\'semua\')">Semua</button>' +
      '<button class="chip" onclick="filterKursusStatus(this,\'aktif\')">Sedang Berjalan</button>' +
      '<button class="chip" onclick="filterKursusStatus(this,\'selesai\')">Selesai</button>' +
    '</div>' +
    '<div id="daftarKursus" class="grid grid-3">' + list.map(kartuKursus).join('') + '</div>' +
    (list.length ? '' : kosongState('book-open', 'Belum ada mata pelajaran', 'Anda belum terdaftar pada mata pelajaran apa pun. Hubungi bagian akademik.'));
};

function kartuKursus(m) {
  const materi = (DB.materi || []).filter(function (x) { return x.MapelID === m.ID; });
  const tugas  = (DB.tugas  || []).filter(function (x) { return x.MapelID === m.ID; });
  const selesai = tugas.filter(function (t) { return pengumpulanUntuk(t.ID); }).length;
  const progres = tugas.length ? Math.round(selesai / tugas.length * 100) : (materi.length ? 40 : 0);
  const prog = (DB.program || []).filter(function (p) { return p.MapelID === m.ID; })[0] || {};
  const cls = progres >= 100 ? ' is-done' : (progres < 30 ? ' is-low' : '');
  return '<article class="card course-card" data-cari="' + esc((m.Nama + ' ' + m.Kode + ' ' + namaDosen(prog.DosenID)).toLowerCase()) +
    '" data-progres="' + progres + '">' +
    '<div class="course-cover">' + svgIcon(progres ? 'book-open' : 'microscope', 42) +
    '<span class="course-credit">' + svgIcon('graduation-cap', 13) + ' ' + esc(m.SKS || 0) + ' SKS</span></div>' +
    '<div class="course-body">' +
    '<div class="course-meta"><span class="badge badge-info plain">' + esc(m.Kode) + '</span>' +
    '<span class="badge badge-accent plain">' + esc(m.Kategori || 'Wajib') + '</span></div>' +
    '<h3 class="course-title">' + esc(m.Nama) + '</h3>' +
    '<div class="course-teacher">' + svgIcon('user', 15) + esc(namaDosen(prog.DosenID)) + '</div>' +
    '<div class="progress-head"><span class="muted">Kemajuan</span><b' + (progres < 30 ? ' style="color:var(--accent-ink)"' : '') + '>' + progres + '%</b></div>' +
    '<div class="progress' + cls + '"><span style="width:' + progres + '%"></span></div>' +
    '<button class="btn ' + (progres ? 'btn-outline' : 'btn-primary') + ' btn-block mt4" ' +
    'onclick="navigateTo(\'siswa-kursus-detail\',{ctx:{MapelID:\'' + m.ID + '\'}})">' +
    (progres >= 100 ? 'Tinjau Kembali' : progres ? 'Lanjutkan Belajar' : 'Mulai Belajar') + ' ' + svgIcon('log-in', 16) + '</button>' +
    '</div></article>';
}

const filterKursus = debounce(function (q) {
  const kata = String(q || '').toLowerCase();
  $$('#daftarKursus .course-card').forEach(function (c) {
    c.style.display = c.dataset.cari.indexOf(kata) !== -1 ? '' : 'none';
  });
}, 200);

function filterKursusStatus(btn, mode) {
  $$('.chip-row .chip').forEach(function (c) { c.classList.remove('active'); });
  btn.classList.add('active');
  $$('#daftarKursus .course-card').forEach(function (c) {
    const p = Number(c.dataset.progres);
    c.style.display = (mode === 'semua') || (mode === 'aktif' && p < 100) || (mode === 'selesai' && p >= 100) ? '' : 'none';
  });
}

PAGES['siswa-kursus-detail'] = function (ctx) {
  const m = byId(DB.mapel, ctx.MapelID);
  const prog = (DB.program || []).filter(function (p) { return p.MapelID === m.ID; })[0] || {};
  const materi = (DB.materi || []).filter(function (x) { return x.MapelID === m.ID; })
    .sort(function (a, b) { return (a.Pertemuan || 0) - (b.Pertemuan || 0); });
  const tugas = (DB.tugas || []).filter(function (x) { return x.MapelID === m.ID; });
  const tab = ctx.tab || 'materi';
  const nilai = (DB.transkrip || []).filter(function (t) { return t.MapelID === m.ID; })[0] || {};

  const pertemuan = {};
  materi.forEach(function (x) {
    const p = x.Pertemuan || 1;
    (pertemuan[p] = pertemuan[p] || []).push(x);
  });

  const nav = function (t, label, ikon, n) {
    return '<button class="tab' + (tab === t ? ' active' : '') + '" onclick=\'navigateTo("siswa-kursus-detail",{ctx:{MapelID:"' + m.ID + '",tab:"' + t + '"},noHistory:true})\'>' +
      '<i data-icon="' + ikon + '"></i>' + esc(label) + (n !== undefined ? '<span class="tab-count">' + n + '</span>' : '') + '</button>';
  };

  let isi = '';
  if (tab === 'materi') {
    isi = Object.keys(pertemuan).sort(function (a, b) { return a - b; }).map(function (p) {
      const list = pertemuan[p];
      return '<section class="card" style="margin-bottom:14px"><div class="card-head">' +
        '<span class="badge badge-info plain">Pertemuan ' + esc(p) + '</span>' +
        '<h2 style="font-size:17px">' + esc(list[0].Judul) + '</h2>' +
        '<div class="spacer"></div><span class="text-sm muted">' + list.length + ' berkas</span></div>' +
        list.map(function (x) {
          const ikon = { 'YouTube': 'video', 'Gambar': 'image', 'Resume Pertemuan': 'sparkles' }[x.Jenis] || 'file-text';
          return '<div class="list-item"><div class="li-ico">' + svgIcon(ikon, 20) + '</div>' +
            '<div class="li-main"><strong>' + esc(x.Judul) + '</strong>' +
            '<small>' + esc(x.Jenis) + ' · ' + esc(fmtTgl(x.TanggalUpload)) + '</small></div>' +
            '<div class="li-side">' + (x.Jenis === 'Resume Pertemuan' ? '<span class="badge badge-accent plain">Resume AI</span>' : '') +
            '<button class="btn btn-outline btn-sm" onclick="bukaMateri(\'' + x.ID + '\')">' + svgIcon('eye', 15) + ' Buka</button></div></div>';
        }).join('') + '</section>';
    }).join('') || kosongState('folder', 'Belum ada materi', 'Pengajar belum mengunggah materi untuk mata pelajaran ini.');
  } else if (tab === 'tugas') {
    isi = '<section class="card">' + (tugas.length ? tugas.map(kartuTugasSiswa).join('')
      : '<div class="card-body">' + kosongState('clipboard-list', 'Belum ada tugas', 'Belum ada penugasan untuk mata pelajaran ini.') + '</div>') + '</section>';
  } else {
    isi = '<section class="card"><div class="card-head"><i data-icon="award"></i><h2>Nilai Mata Pelajaran Ini</h2></div>' +
      '<div class="card-body">' + (nilai.NilaiAkhir !== undefined && nilai.NilaiAkhir !== ''
        ? '<div class="kpi-grid">' +
          kpiCard({ ikon: 'star', label: 'Nilai Akhir', nilai: nilai.NilaiAkhir, tint: 'var(--sc-high)' }) +
          kpiCard({ ikon: 'award', label: 'Huruf Mutu', nilai: nilai.Huruf, tint: 'var(--accent-soft)', ink: 'var(--accent-ink)' }) +
          kpiCard({ ikon: 'check-circle', label: 'Keterangan', nilai: '<span style="font-size:22px">' + esc(nilai.Keterangan) + '</span>',
                    tint: nilai.Keterangan === 'Tuntas' ? 'var(--success-soft)' : 'var(--error-soft)',
                    ink: nilai.Keterangan === 'Tuntas' ? 'var(--success)' : 'var(--error)' }) +
          '</div>'
        : kosongState('lock', 'Nilai belum tersedia', 'Nilai akan tampil setelah pengajar mengirim dan Tim Akademik memvalidasinya.')) +
      '</div></section>';
  }

  return '<button class="btn btn-ghost btn-sm" onclick="goBack()" style="margin-bottom:12px">' +
    '<i data-icon="corner-up-left"></i><span>Kembali ke Portal Belajar</span></button>' +
    '<section class="card" style="margin-bottom:20px"><div class="card-body">' +
    '<div class="row"><div style="flex:1;min-width:240px">' +
    '<div class="course-meta" style="margin-bottom:8px"><span class="badge badge-info plain">' + esc(m.Kode) + '</span>' +
    '<span class="badge badge-accent plain">' + esc(m.Kategori || 'Wajib') + '</span></div>' +
    '<h2 style="font-size:28px;font-family:var(--font-head);font-weight:700">' + esc(m.Nama) + '</h2>' +
    '<p class="muted" style="margin-top:6px">' + esc(m.Deskripsi || 'Tidak ada deskripsi.') + '</p>' +
    '<div class="course-teacher mt4">' + svgIcon('user', 15) + esc(namaDosen(prog.DosenID)) + '</div></div>' +
    '<div style="min-width:200px">' +
    '<div class="insight"><div class="insight-head">' + svgIcon('trending-up', 18) + ' Ringkasan</div>' +
    '<div class="row" style="padding:6px 0"><span class="muted text-sm">Materi</span><b class="row-end">' + materi.length + '</b></div>' +
    '<div class="row" style="padding:6px 0"><span class="muted text-sm">Tugas</span><b class="row-end">' + tugas.length + '</b></div>' +
    '<div class="row" style="padding:6px 0"><span class="muted text-sm">Nilai Akhir</span><b class="row-end">' +
    esc(nilai.NilaiAkhir === undefined || nilai.NilaiAkhir === '' ? '—' : nilai.NilaiAkhir) + '</b></div>' +
    '</div></div></div></div></section>' +
    '<div class="tabs">' + nav('materi', 'Materi', 'folder', materi.length) +
    nav('tugas', 'Tugas', 'clipboard-list', tugas.length) + nav('nilai', 'Nilai', 'award') + '</div>' + isi;
};

function kartuTugasSiswa(t) {
  const p = pengumpulanUntuk(t.ID);
  const lewat = new Date(t.Deadline) < new Date();
  const status = p
    ? (String(p.Keterlambatan).toUpperCase() === 'TRUE'
        ? '<span class="badge badge-warn">Dikumpulkan (Terlambat)</span>'
        : '<span class="badge badge-success">Dikumpulkan</span>')
    : (lewat ? '<span class="badge badge-error">Terlewat</span>' : '<span class="badge badge-info">Belum Dikumpulkan</span>');
  const nilai = p && p.Nilai !== '' && p.Nilai !== null && p.Nilai !== undefined
    ? '<span class="badge badge-accent plain">Nilai: ' + esc(p.Nilai) + '</span>' : '';
  return '<div class="list-item"><div class="li-ico">' + svgIcon('clipboard-list', 20) + '</div>' +
    '<div class="li-main"><strong>' + esc(t.Judul) + '</strong>' +
    '<small>' + esc(namaMapel(t.MapelID)) + ' · Tenggat ' + esc(fmtTgl(t.Deadline, true)) + ' · Bobot ' + esc(t.Bobot) + '%</small></div>' +
    '<div class="li-side">' + nilai + status +
    '<button class="btn ' + (p ? 'btn-outline' : 'btn-primary') + ' btn-sm" onclick="formPengumpulan(\'' + t.ID + '\')">' +
    (p ? 'Lihat / Ubah' : 'Kumpulkan') + '</button></div></div>';
}

/* ---------- Tugas & Quiz (Siswa) ---------- */
PAGES['siswa-tugas'] = function (ctx) {
  const semua = (DB.tugas || []).slice().sort(function (a, b) { return new Date(a.Deadline) - new Date(b.Deadline); });
  const belum = semua.filter(function (t) { return !pengumpulanUntuk(t.ID); });
  const sudah = semua.filter(function (t) { return pengumpulanUntuk(t.ID); });
  const tab = ctx.tab || 'belum';
  const list = tab === 'belum' ? belum : (tab === 'sudah' ? sudah : semua);
  const nav = function (t, label, n) {
    return '<button class="tab' + (tab === t ? ' active' : '') + '" onclick=\'navigateTo("siswa-tugas",{ctx:{tab:"' + t + '"},noHistory:true})\'>' +
      esc(label) + '<span class="tab-count">' + n + '</span></button>';
  };
  return headerHalaman('Tugas & Quiz', 'Kumpulkan pekerjaan Anda sebelum tenggat yang ditentukan.') +
    '<div class="tabs">' + nav('belum', 'Belum Dikumpulkan', belum.length) +
    nav('sudah', 'Sudah Dikumpulkan', sudah.length) + nav('semua', 'Semua', semua.length) + '</div>' +
    '<section class="card">' + (list.length ? list.map(kartuTugasSiswa).join('')
      : '<div class="card-body">' + kosongState('check-circle', 'Tidak ada tugas di kategori ini',
          tab === 'belum' ? 'Semua tugas sudah Anda kumpulkan. Kerja bagus!' : 'Belum ada data.') + '</div>') + '</section>';
};

function formPengumpulan(tugasId) {
  const t = byId(DB.tugas, tugasId);
  const p = pengumpulanUntuk(tugasId) || {};
  const lewat = new Date(t.Deadline) < new Date();
  const jenis = t.JenisPengumpulan || 'File';

  openModal({
    title: t.Judul, size: 'wide',
    body: '<div class="card" style="box-shadow:none;background:var(--sc-low);margin-bottom:20px"><div class="card-body">' +
      '<div class="row" style="margin-bottom:10px"><span class="badge badge-info plain">Tugas Wajib</span>' +
      (lewat ? '<span class="badge badge-error">Tenggat Terlewat</span>' : '<span class="badge badge-success">Masih Terbuka</span>') + '</div>' +
      '<p>' + esc(t.Deskripsi || 'Tidak ada instruksi tambahan.') + '</p>' +
      '<div class="row"><span class="badge badge-neutral plain">' + svgIcon('clock', 14) + ' Tenggat: ' + esc(fmtTgl(t.Deadline, true)) + '</span>' +
      '<span class="badge badge-neutral plain">' + svgIcon('star', 14) + ' Bobot: ' + esc(t.Bobot) + '% nilai akhir</span></div>' +
      '</div></div>' +
      (p.ID ? '<div class="alert alert-success"><i data-icon="check-circle"></i><div><strong>Sudah dikumpulkan</strong>' +
        '<p>' + esc(fmtTgl(p.Timestamp, true)) + (String(p.Keterlambatan).toUpperCase() === 'TRUE' ? ' · tercatat TERLAMBAT' : ' · tepat waktu') +
        (p.Nilai !== '' && p.Nilai !== undefined ? ' · Nilai: ' + esc(p.Nilai) : '') + '</p>' +
        (p.Feedback ? '<p><b>Umpan balik:</b> ' + esc(p.Feedback) + '</p>' : '') + '</div></div>' : '') +
      '<h3 style="font-size:17px;margin-bottom:4px">Pengumpulan Anda</h3>' +
      '<p class="help" style="margin-bottom:14px">Jenis pengumpulan: <b>' + esc(jenis) + '</b></p>' +
      (jenis === 'File'
        ? '<div class="dropzone" id="dzTugas"><div class="dz-ico">' + svgIcon('upload-cloud', 28) + '</div>' +
          '<div class="dz-title">Seret & lepas berkas di sini</div>' +
          '<p class="dz-sub">Format didukung: PDF, DOCX, JPG (maks 2MB)</p>' +
          '<span class="btn btn-outline btn-sm">Pilih Berkas</span></div>' +
          '<input type="file" id="fileTugas" accept=".pdf,.doc,.docx,image/*" hidden>' +
          '<div class="file-pill" id="pillTugas" hidden></div>'
        : jenis === 'Teks'
        ? '<div class="field"><label class="label" for="teksTugas">Jawaban Anda</label>' +
          '<textarea class="textarea" id="teksTugas" style="min-height:200px">' + esc(p.KontenTeks || '') + '</textarea></div>'
        : '<div class="field"><label class="label" for="urlTugas">Tautan Video</label>' +
          '<div class="input-icon">' + svgIcon('link', 18) +
          '<input class="input" id="urlTugas" placeholder="https://youtu.be/…" value="' + esc(p.KontenURL || '') + '"></div>' +
          '<p class="help">Tempel tautan YouTube; video akan tersemat otomatis.</p></div>'),
    foot: '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>' +
      '<button class="btn btn-primary" id="btnKirimTugas">' + svgIcon('send', 18) + ' Kirim Pengumpulan</button>',
    onOpen: function () {
      if (jenis === 'File') pasangDropzone('dzTugas', 'fileTugas', 'pillTugas');
      $('#btnKirimTugas').onclick = function () { kirimTugas(tugasId, jenis); };
    }
  });
}

function kirimTugas(tugasId, jenis) {
  const btn = $('#btnKirimTugas');
  btn.disabled = true; btn.innerHTML = svgIcon('refresh', 18) + ' Mengirim…';
  const payload = { TugasID: tugasId, Jenis: jenis };
  let siap = Promise.resolve(null);

  if (jenis === 'File') {
    siap = bacaBerkas($('#fileTugas')).then(function (f) {
      if (!f) throw new Error('Pilih berkas jawaban terlebih dahulu.');
      return f;
    });
  } else if (jenis === 'Teks') {
    const teks = $('#teksTugas').value.trim();
    if (!teks) { btn.disabled = false; btn.innerHTML = svgIcon('send', 18) + ' Kirim Pengumpulan';
      showToast('Isi jawaban terlebih dahulu.', 'warning'); return; }
    payload.KontenTeks = teks;
  } else {
    const url = $('#urlTugas').value.trim();
    if (!url) { btn.disabled = false; btn.innerHTML = svgIcon('send', 18) + ' Kirim Pengumpulan';
      showToast('Tempel tautan video terlebih dahulu.', 'warning'); return; }
    payload.KontenURL = url;
  }

  siap.then(function (file) {
    return api('apiKumpulkanTugas', AppState.sessionToken, payload, file);
  }).then(function (res) {
    btn.disabled = false; btn.innerHTML = svgIcon('send', 18) + ' Kirim Pengumpulan';
    if (!res.success) { showToast(res.message, 'error'); return; }
    closeModal();
    showToast(res.message, String(res.data.Keterlambatan).toUpperCase() === 'TRUE' ? 'warning' : 'success');
    refreshData();
  }).catch(function (e) {
    btn.disabled = false; btn.innerHTML = svgIcon('send', 18) + ' Kirim Pengumpulan';
    showToast(e.message, 'error');
  });
}

/* ---------- Absensi Saya ---------- */
PAGES['siswa-absensi'] = function () {
  const s = DB.statistik || {};
  const riwayat = (DB.absensiSaya || []).slice().sort(function (a, b) { return new Date(b.Tanggal) - new Date(a.Tanggal); });
  const rekap = { Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0 };
  riwayat.forEach(function (a) { if (rekap[a.Status] !== undefined) rekap[a.Status]++; });

  return headerHalaman('Absensi Saya', 'Isi kehadiran untuk sesi berjalan dan lihat riwayat kehadiran Anda.') +
    '<div class="kpi-grid">' +
      kpiCard({ ikon: 'trending-up', label: 'Tingkat Kehadiran', nilai: s.persenKehadiran || 0, satuan: '%',
                tint: 'var(--success-soft)', ink: 'var(--success)' }) +
      kpiCard({ ikon: 'check-circle', label: 'Hadir', nilai: rekap.Hadir, tint: 'var(--sc-high)' }) +
      kpiCard({ ikon: 'alert-circle', label: 'Sakit / Izin', nilai: rekap.Sakit + rekap.Izin, tint: 'var(--warning-soft)', ink: 'var(--warning)' }) +
      kpiCard({ ikon: 'alert-triangle', label: 'Alpa', nilai: rekap.Alpa, tint: 'var(--error-soft)', ink: 'var(--error)' }) +
    '</div>' +
    '<section class="card" style="margin-bottom:16px"><div class="card-head"><i data-icon="calendar-check"></i>' +
    '<h2>Isi Absensi Sesi Ini</h2></div><div class="card-body">' +
      '<div class="form-grid">' +
      '<div class="field"><label class="label" for="mySesiMapel">Mata Pelajaran</label>' +
      '<select class="select" id="mySesiMapel">' + opsiSelect(mapelSaya(), 'ID', function (x) { return x.Kode + ' — ' + x.Nama; }, '', '— Pilih —') + '</select></div>' +
      '<div class="field"><label class="label" for="mySesiPert">Pertemuan ke-</label>' +
      '<input class="input" type="number" id="mySesiPert" min="1" value="1"></div></div>' +
      '<label class="label">Status Kehadiran</label>' +
      '<div class="att-options" id="attOptions">' +
        optAbsensi('Hadir', 'check-circle', 'Langsung terkirim') +
        optAbsensi('Sakit', 'alert-circle', 'Wajib lampirkan bukti') +
        optAbsensi('Izin', 'info', 'Wajib lampirkan bukti') +
      '</div>' +
      '<div id="areaBukti" hidden style="margin-top:16px">' +
        '<label class="label">Bukti Pendukung <span class="req">*</span></label>' +
        '<div class="dropzone" id="dzBukti" style="padding:28px"><div class="dz-ico">' + svgIcon('upload-cloud', 26) + '</div>' +
        '<p class="dz-sub mb0">Unggah surat dokter / surat izin (foto atau PDF, maks 2MB)</p></div>' +
        '<input type="file" id="fileBukti" accept="image/*,.pdf" hidden>' +
        '<div class="file-pill" id="pillBukti" hidden></div>' +
        '<div class="field mt4"><label class="label" for="ketAbsensi">Keterangan</label>' +
        '<input class="input" id="ketAbsensi" placeholder="Contoh: Demam, surat dokter terlampir"></div>' +
      '</div>' +
      '<div class="row mt4">' +
      '<button class="btn btn-primary" id="btnKirimAbsensi" onclick="kirimAbsensiMandiri()" disabled>' +
      '<i data-icon="send"></i><span>Kirim Absensi</span></button>' +
      (DB.fitur.geo ? '<button class="btn btn-outline" onclick="absensiGPS()"><i data-icon="map-pin"></i><span>Absen via Lokasi</span></button>' : '') +
      (DB.fitur.barcode ? '<button class="btn btn-outline" onclick="absensiBarcode()"><i data-icon="qr-code"></i><span>Pindai QR</span></button>' : '') +
      '</div>' +
      '<p class="help mt4">Status Sakit dan Izin memerlukan bukti. Absensi terkunci setelah dikirim untuk sesi tersebut.</p>' +
    '</div></section>' +
    '<section class="card"><div class="card-head"><i data-icon="clock"></i><h2>Riwayat Kehadiran</h2></div>' +
    tabelGenerik({ id: 'tbl_abs_saya', data: riwayat, perPage: 10, kosong: 'Belum ada riwayat absensi.', kolom: [
      { key: 'Tanggal', label: 'Tanggal', render: function (r) { return esc(fmtTgl(r.Tanggal)); } },
      { key: 'MapelID', label: 'Mata Pelajaran', render: function (r) { return esc(namaMapel(r.MapelID)); } },
      { key: 'Pertemuan', label: 'Pert.', cls: 'num' },
      { key: 'Status', label: 'Status', render: function (r) { return badgeStatus(r.Status); } },
      { key: 'Metode', label: 'Metode' },
      { key: 'BuktiURL', label: 'Bukti', render: function (r) {
          return r.BuktiURL ? '<button class="btn btn-outline btn-sm" onclick="previewFile(\'' + esc(r.BuktiURL) + '\',\'Bukti Absensi\')">Lihat</button>' : '<span class="muted">—</span>'; } }
    ] }) + '</section>';
};
PAGE_INIT['siswa-absensi'] = function () {
  gambarTabel('tbl_abs_saya');
  pasangDropzone('dzBukti', 'fileBukti', 'pillBukti');
};

function optAbsensi(status, ikon, sub) {
  return '<button type="button" class="att-opt ' + status.toLowerCase() + '" data-status="' + status + '" onclick="pilihStatusAbsensi(this)">' +
    '<span class="ai">' + svgIcon(ikon, 20) + '</span><strong>' + status + '</strong><small>' + esc(sub) + '</small></button>';
}

function pilihStatusAbsensi(btn) {
  $$('#attOptions .att-opt').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  const status = btn.dataset.status;
  const perluBukti = status !== 'Hadir';
  $('#areaBukti').hidden = !perluBukti;
  cekTombolAbsensi();
  const f = $('#fileBukti');
  if (f) f.onchange = cekTombolAbsensi;
}

function cekTombolAbsensi() {
  const aktif = $('#attOptions .att-opt.active');
  const btn = $('#btnKirimAbsensi');
  if (!aktif) { btn.disabled = true; return; }
  const status = aktif.dataset.status;
  const adaBukti = $('#fileBukti') && $('#fileBukti').files.length > 0;
  btn.disabled = (status !== 'Hadir' && !adaBukti);
}

function kirimAbsensiMandiri() {
  const aktif = $('#attOptions .att-opt.active');
  if (!aktif) { showToast('Pilih status kehadiran.', 'warning'); return; }
  const mapelId = $('#mySesiMapel').value;
  if (!mapelId) { showToast('Pilih mata pelajaran terlebih dahulu.', 'warning'); return; }
  const status = aktif.dataset.status;
  const btn = $('#btnKirimAbsensi');
  btn.disabled = true; btn.innerHTML = svgIcon('refresh', 18) + '<span>Mengirim…</span>';

  bacaBerkas($('#fileBukti')).then(function (file) {
    if (status !== 'Hadir' && !file) throw new Error('Status ' + status + ' wajib melampirkan bukti.');
    return api('apiAbsensiMandiri', AppState.sessionToken, {
      MapelID: mapelId, Pertemuan: $('#mySesiPert').value || 1,
      Status: status, Keterangan: ($('#ketAbsensi') || {}).value || '', Tanggal: new Date().toISOString()
    }, file);
  }).then(function (res) {
    btn.innerHTML = svgIcon('send', 18) + '<span>Kirim Absensi</span>';
    if (!res.success) { btn.disabled = false; showToast(res.message, 'error'); return; }
    showToast(res.message, 'success');
    refreshData();
  }).catch(function (e) {
    btn.disabled = false; btn.innerHTML = svgIcon('send', 18) + '<span>Kirim Absensi</span>';
    showToast(e.message, 'error');
  });
}

function absensiGPS() {
  const mapelId = $('#mySesiMapel').value;
  if (!mapelId) { showToast('Pilih mata pelajaran terlebih dahulu.', 'warning'); return; }
  if (!navigator.geolocation) { showToast('Peramban tidak mendukung geolokasi.', 'error'); return; }
  showToast('Mendeteksi lokasi Anda…', 'info');
  navigator.geolocation.getCurrentPosition(function (pos) {
    api('apiAbsensiGeo', AppState.sessionToken, {
      lat: pos.coords.latitude, lng: pos.coords.longitude,
      MapelID: mapelId, Pertemuan: $('#mySesiPert').value || 1
    }).then(function (res) {
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) refreshData();
    }).catch(function (e) { showToast(e.message, 'error'); });
  }, function () { showToast('Izin lokasi ditolak. Aktifkan izin lokasi pada peramban.', 'error'); },
  { enableHighAccuracy: true, timeout: 10000 });
}

/**
 * v2.0 — PEMINDAI QR SUNGGUHAN.
 *
 * Pada v1.1 fungsi ini selalu berakhir di pesan "Kamera diblokir bingkai
 * Apps Script", sehingga siswa harus mengetik kode sesi secara manual —
 * pemindaian QR-nya tidak pernah benar-benar bisa dipakai. Kini kamera
 * berfungsi normal karena aplikasi tidak lagi berada di dalam iframe Google.
 * Kolom kode manual tetap dipertahankan sebagai jalur cadangan yang setara.
 */
function absensiBarcode() {
  openModal({
    title: 'Pindai QR Absensi', size: 'slim',
    body: '<div class="qr-hasil" id="qrHasil" hidden></div>' +
      '<div class="qr-scanner-wrap" id="qrWrap">' +
        '<div id="qrReader" style="width:100%;height:100%"></div>' +
        '<div class="qr-frame"><i></i></div>' +
        '<div class="qr-scan-line" id="qrLine"></div>' +
      '</div>' +
      '<div id="qrPesan"></div>' +
      '<div class="field mt4"><label class="label" for="kodeManual">Atau masukkan kode sesi</label>' +
      '<input class="input" id="kodeManual" placeholder="SESI-XXXXXXXX" autocomplete="off"></div>',
    foot: '<button class="btn btn-outline" onclick="tutupPemindai()">Batal</button>' +
      '<button class="btn btn-primary" onclick="kirimKodeBarcode()">Kirim Kode</button>',
    onOpen: function () {
      const pesan = $('#qrPesan');
      const wrap  = $('#qrWrap');

      /* Menyembunyikan panggung kamera dan menjelaskan sebabnya, lalu
         memindahkan fokus ke kolom kode agar pengguna tidak buntu. */
      const jatuhKeManual = function (judul, isi, sebab) {
        if (wrap) wrap.hidden = true;
        const line = $('#qrLine'); if (line) line.hidden = true;
        if (pesan) {
          pesan.innerHTML = '<div class="alert alert-warn" style="margin:0">' + svgIcon('alert-triangle', 20) +
            '<div><strong>' + esc(judul) + '</strong><p>' + isi + '</p></div></div>' +
            (sebab ? '<div class="row" style="margin-top:10px"><button class="btn btn-sm btn-outline" ' +
              'onclick="closeModal(); tampilkanPanduanMikrofon(\'' + sebab + '\', \'\', \'kamera\')">' +
              'Cara mengaktifkan kamera</button></div>' : '');
          renderIcons(pesan);
        }
        setTimeout(function () { const k = $('#kodeManual'); if (k) k.focus(); }, 120);
      };

      if (typeof Html5Qrcode === 'undefined') {
        jatuhKeManual('Pemindai kamera tidak termuat',
          'Pustaka pemindai gagal diunduh. Periksa koneksi internet, atau masukkan kode sesi secara manual di bawah.');
        return;
      }

      cobaAksesKamera().then(function (izin) {
        if (!izin.ok) {
          const teks = {
            'ditolak': 'Izin kamera ditolak. Anda dapat mengizinkannya lewat setelan situs, ' +
                       'atau cukup ketik kode sesi yang ditampilkan dosen di kolom bawah.',
            'tidak-ada': 'Tidak ada kamera yang terdeteksi pada perangkat ini. Masukkan kode sesi secara manual.',
            'dipakai-aplikasi-lain': 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut, atau masukkan kode manual.',
            'tidak-aman': 'Kamera memerlukan halaman HTTPS. Masukkan kode sesi secara manual untuk saat ini.',
            'tidak-didukung': 'Peramban ini tidak mendukung akses kamera. Masukkan kode sesi secara manual.'
          }[izin.sebab] || 'Kamera tidak dapat diakses. Masukkan kode sesi secara manual di bawah.';
          jatuhKeManual('Pemindaian tidak tersedia', teks,
                        izin.sebab === 'ditolak' ? 'ditolak' : '');
          return;
        }

        try {
          window.__qr = new Html5Qrcode('qrReader', { verbose: false });
          window.__qr.start(
            { facingMode: 'environment' },
            { fps: 12, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
            function (teks) {
              /* Kunci agar satu pemindaian tidak terkirim berkali-kali. */
              if (window.__qrTerkunci) return;
              window.__qrTerkunci = true;

              const h = $('#qrHasil');
              if (h) { h.hidden = false; h.textContent = teks; h.style.color = 'var(--success)'; }
              const line = $('#qrLine'); if (line) line.hidden = true;

              const k = $('#kodeManual'); if (k) k.value = teks;
              tutupPemindai(true);
              prosesKodeBarcode(teks);
            },
            function () { /* gagal baca per frame — normal, diabaikan */ }
          ).catch(function (err) {
            jatuhKeManual('Kamera tidak dapat dinyalakan',
              'Terjadi kendala saat membuka kamera' +
              (err && err.message ? ' (' + esc(String(err.message)) + ')' : '') +
              '. Masukkan kode sesi secara manual di bawah.', 'lain');
          });
        } catch (e) {
          jatuhKeManual('Kamera tidak dapat diakses',
            'Masukkan kode sesi secara manual di kolom bawah.', 'lain');
        }
      });
    }
  });
}

function tutupPemindai(janganTutupModal) {
  window.__qrTerkunci = false;
  if (window.__qr) {
    /* stop() melepas kamera; tanpa ini lampu kamera tetap menyala setelah modal ditutup. */
    try { window.__qr.stop().then(function () { window.__qr.clear(); window.__qr = null; }); } catch (e) { window.__qr = null; }
  }
  if (!janganTutupModal) closeModal();
}

function kirimKodeBarcode() {
  const kode = $('#kodeManual').value.trim();
  if (!kode) { showToast('Masukkan kode sesi.', 'warning'); return; }
  tutupPemindai(true);
  prosesKodeBarcode(kode);
}

function prosesKodeBarcode(kode) {
  api('apiAbsensiBarcode', AppState.sessionToken, kode).then(function (res) {
    closeModal();
    showToast(res.message, res.success ? 'success' : 'error');
    if (res.success) refreshData();
  }).catch(function (e) { showToast(e.message, 'error'); });
}

/* ---------- Nilai & Transkrip ---------- */
PAGES['siswa-nilai'] = function () {
  const tr = (DB.transkrip || []).slice();
  const s = DB.statistik || {};
  const rem = DB.remedial || [];
  const semesterList = [];
  tr.forEach(function (t) { if (semesterList.indexOf(String(t.Semester)) === -1) semesterList.push(String(t.Semester)); });

  return headerHalaman('Nilai & Transkrip', 'Rekap nilai akhir yang telah divalidasi Tim Akademik.',
    '<select class="select" id="trSemester" style="width:auto" onchange="void 0">' +
    '<option value="">Semua Semester</option>' + opsiSelect(semesterList.sort(), null, null, '') + '</select>' +
    '<button class="btn btn-primary" onclick="unduhTranskrip()"><i data-icon="download"></i><span>Unduh Transkrip PDF</span></button>') +
    '<div class="kpi-grid">' +
      kpiCard({ ikon: 'award', label: 'IPK / Rata-rata Bobot', nilai: s.ipk || '0.00', tint: 'var(--accent-soft)', ink: 'var(--accent-ink)' }) +
      kpiCard({ ikon: 'graduation-cap', label: 'Total SKS Ditempuh', nilai: s.totalSks || 0, tint: 'var(--sc-high)' }) +
      kpiCard({ ikon: 'book-open', label: 'Mata Pelajaran Dinilai', nilai: tr.length, tint: 'var(--sc-high)' }) +
      kpiCard({ ikon: 'refresh', label: 'Remedial', nilai: rem.length, tint: rem.length ? 'var(--warning-soft)' : 'var(--sc-high)',
                ink: rem.length ? 'var(--warning)' : 'var(--primary)' }) +
    '</div>' +
    (rem.length ? '<div class="alert alert-warn"><i data-icon="alert-triangle"></i><div><strong>Anda memiliki ' + rem.length + ' mata pelajaran remedial</strong>' +
      '<p>' + rem.map(function (r) { return esc(namaMapel(r.MapelID)) + ' (nilai ' + esc(r.NilaiSebelum) + ', status ' + esc(r.Status) + ')'; }).join('; ') + '</p></div></div>' : '') +
    '<div class="grid grid-side">' +
      '<section class="card"><div class="card-head"><i data-icon="file-text"></i><h2>Rincian Nilai</h2></div>' +
      tabelGenerik({ id: 'tbl_transkrip', data: tr, perPage: 12, kosong: 'Belum ada nilai tervalidasi.', kolom: [
        { key: 'MapelID', label: 'Mata Pelajaran', render: function (r) {
            return '<strong>' + esc(namaMapel(r.MapelID)) + '</strong><br><small class="muted">' + esc(kodeMapel(r.MapelID)) + '</small>'; } },
        { key: 'SKS', label: 'SKS', cls: 'num' },
        { key: 'Semester', label: 'Smt', cls: 'num' },
        { key: 'NilaiAkhir', label: 'Nilai', cls: 'num' },
        { key: 'Huruf', label: 'Huruf', render: function (r) {
            const w = { A: 'badge-success', B: 'badge-info', C: 'badge-warn', D: 'badge-error', E: 'badge-error' };
            return '<span class="badge ' + (w[r.Huruf] || 'badge-neutral') + ' plain">' + esc(r.Huruf) + '</span>'; } },
        { key: 'Keterangan', label: 'Keterangan', render: function (r) {
            return r.Keterangan === 'Tuntas' ? '<span class="badge badge-success">Tuntas</span>' : '<span class="badge badge-error">Belum Tuntas</span>'; } }
      ] }) + '</section>' +
      '<section class="card"><div class="card-head"><i data-icon="pie-chart"></i><h2>Sebaran Huruf Mutu</h2></div>' +
      '<div class="card-body"><div class="chart-box"><canvas id="chNilaiSaya"></canvas></div>' +
      '<div class="insight mt4"><div class="insight-head">' + svgIcon('sparkles', 18) + ' Catatan</div><ul>' +
      wawasanSiswa(tr, s).map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul></div></div></section>' +
    '</div>';
};
PAGE_INIT['siswa-nilai'] = function () {
  gambarTabel('tbl_transkrip');
  const tr = DB.transkrip || [], w = warnaTema();
  const d = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  tr.forEach(function (t) { if (d[t.Huruf] !== undefined) d[t.Huruf]++; });
  buatChart('chNilaiSaya', {
    type: 'doughnut',
    data: { labels: ['A','B','C','D','E'], datasets: [{ data: [d.A, d.B, d.C, d.D, d.E],
      backgroundColor: [w.sukses, w.primary, w.accent, '#e08b2f', w.error], borderWidth: 0 }] },
    options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } }
  });
};

function wawasanSiswa(tr, s) {
  const out = [];
  if (!tr.length) return ['Nilai akan muncul setelah pengajar mengirim dan Tim Akademik memvalidasinya.'];
  const terbaik = tr.slice().sort(function (a, b) { return b.NilaiAkhir - a.NilaiAkhir; })[0];
  const terendah = tr.slice().sort(function (a, b) { return a.NilaiAkhir - b.NilaiAkhir; })[0];
  out.push('Nilai tertinggi Anda pada <b>' + esc(namaMapel(terbaik.MapelID)) + '</b> (' + esc(terbaik.NilaiAkhir) + ').');
  if (tr.length > 1) out.push('Perlu perhatian: <b>' + esc(namaMapel(terendah.MapelID)) + '</b> (' + esc(terendah.NilaiAkhir) + ').');
  out.push('IPK saat ini <b>' + (s.ipk || '0.00') + '</b> dari ' + (s.totalSks || 0) + ' SKS yang telah ditempuh.');
  if (s.persenKehadiran < 75) out.push('Kehadiran Anda <b>' + s.persenKehadiran + '%</b> — di bawah batas minimum 75% untuk mengikuti ujian.');
  return out;
}

function unduhTranskrip() {
  const smt = ($('#trSemester') || {}).value || '';
  showToast('Menyiapkan transkrip…', 'info');
  api('apiTranskripPDF', AppState.sessionToken, null, smt).then(function (res) {
    if (!res.success) { showToast(res.message, 'error'); return; }
    openModal({
      title: 'Transkrip Nilai', size: 'wide',
      body: '<iframe class="preview-frame" src="' + esc(res.data.previewUrl) + '" title="Pratinjau transkrip"></iframe>',
      foot: '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>' +
        '<button class="btn btn-primary" onclick="unduhBase64(TRANSKRIP_TMP.base64,TRANSKRIP_TMP.mime,TRANSKRIP_TMP.nama)">' +
        svgIcon('download', 18) + ' Unduh PDF</button>'
    });
    window.TRANSKRIP_TMP = { base64: res.data.base64, mime: res.data.mimeType, nama: res.data.fileName };
  }).catch(function (e) { showToast(e.message, 'error'); });
}

/* ---------- Status SPP (Siswa) ---------- */
PAGES['siswa-spp'] = function () {
  const data = (DB.spp || []).slice().sort(function (a, b) { return new Date(b.CreatedAt) - new Date(a.CreatedAt); });
  const belum = data.filter(function (t) { return t.StatusBayar !== 'Lunas'; });
  const totalBelum = belum.reduce(function (a, b) { return a + Number(b.Nominal || 0); }, 0);
  return headerHalaman('Status SPP', 'Riwayat tagihan dan status pembayaran Anda.') +
    '<div class="kpi-grid">' +
      kpiCard({ ikon: 'wallet', label: 'Total Tagihan', nilai: data.length, tint: 'var(--sc-high)' }) +
      kpiCard({ ikon: 'check-circle', label: 'Lunas', nilai: data.length - belum.length, tint: 'var(--success-soft)', ink: 'var(--success)' }) +
      kpiCard({ ikon: 'alert-circle', label: 'Belum Dibayar', nilai: belum.length, tint: 'var(--error-soft)', ink: 'var(--error)' }) +
      kpiCard({ ikon: 'trending-up', label: 'Nominal Tertunggak', nilai: fmtRp(totalBelum), tint: 'var(--accent-soft)', ink: 'var(--accent-ink)' }) +
    '</div>' +
    (belum.length ? '<div class="alert alert-warn"><i data-icon="alert-triangle"></i><div><strong>Terdapat tagihan belum lunas</strong>' +
      '<p>Silakan lakukan pembayaran dan konfirmasi ke bagian keuangan agar status diperbarui.</p></div></div>' : '') +
    '<section class="card"><div class="card-head"><i data-icon="wallet"></i><h2>Riwayat Tagihan</h2></div>' +
    tabelGenerik({ id: 'tbl_spp_saya', data: data, kosong: 'Belum ada tagihan.', kolom: [
      { key: 'JenisNama', label: 'Jenis', render: function (r) {
          return '<span class="badge badge-info plain">' + esc(r.JenisNama || 'SPP') + '</span>'; } },
      { key: 'Periode', label: 'Periode' },
      { key: 'Nominal', label: 'Nominal', cls: 'num', render: function (r) { return esc(fmtRp(r.Nominal)); } },
      { key: 'StatusBayar', label: 'Status', render: function (r) { return badgeStatus(r.StatusBayar); } },
      { key: 'TanggalBayar', label: 'Tanggal Bayar', render: function (r) { return esc(fmtTgl(r.TanggalBayar)); } },
      { key: 'BuktiURL', label: 'Bukti', render: function (r) {
          return r.BuktiURL ? '<button class="btn btn-outline btn-sm" onclick="previewFile(\'' + esc(r.BuktiURL) + '\',\'Bukti Pembayaran\')">Lihat</button>' : '<span class="muted">—</span>'; } }
    ] }) + '</section>';
};
PAGE_INIT['siswa-spp'] = function () { gambarTabel('tbl_spp_saya'); };
