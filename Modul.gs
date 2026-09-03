/**
 * ============================================================================
 * EduPortal LMS — File: Modul.gs  (BUSINESS LOGIC BACKEND)
 * ----------------------------------------------------------------------------
 * Berisi seluruh logika modul akademik:
 *  9.  Statistik & Dashboard          13. Penilaian & Validasi Berjenjang
 *  10. Berkas (Drive)                 14. Remedial, Pengulangan & Transkrip
 *  11. Materi, Tugas & Pengumpulan    15. Rekam Suara & Resume Pertemuan
 *  12. Absensi (mandiri/manual/geo/   16. SPP, Laporan, Notifikasi, Jadwal
 *      barcode)
 *
 * Semua fungsi publik: try-catch → createResponse(success, data, message).
 * Semua baca/tulis Sheets: batch getValues()/setValues(). Tanpa loop per sel.
 * ----------------------------------------------------------------------------
 * CATATAN ARSITEKTUR v2.0 (GAS-PRO-API)
 * File ini TIDAK BERUBAH sedikit pun saat migrasi ke arsitektur REST API.
 * Alasannya: seluruh fungsi di sini sudah murni logika bisnis — bersignature
 * (token, ...args) dan mengembalikan createResponse() — tanpa satu pun
 * sentuhan HtmlService, template, atau asumsi bahwa pemanggilnya adalah
 * google.script.run. Router REST di Kode.gs memanggilnya apa adanya.
 *
 * Konsekuensi baik dari lepasnya frontend dari iframe Google:
 *   • apiSimpanResumePertemuan() kini menerima transkrip dari perekam NATIVE
 *     di halaman aplikasi, bukan lagi dari jendela Perekam Eksternal.
 *   • apiAbsensiBarcode() kini dapat menerima kode hasil PEMINDAIAN KAMERA,
 *     bukan hanya kode yang diketik manual.
 *   • apiAbsensiGeo() berjalan di atas Geolocation API yang jauh lebih andal.
 * Ketiganya tidak menuntut perubahan kode backend — hanya sumber datanya
 * yang kini lebih baik.
 * ============================================================================
 */

/* ========================================================================== */
/* 9. STATISTIK & DASHBOARD                                                   */
/* ========================================================================== */

function hitungStatistikGlobal() {
  try {
    const siswa    = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER);
    const dosen    = getCachedData('Dosen_Guru', CACHE_TTL.MASTER);
    const kelas    = getCachedData('Kelas', CACHE_TTL.MASTER);
    const jurusan  = getCachedData('Jurusan_Prodi', CACHE_TTL.MASTER);
    const mapel    = getCachedData('Mata_Pelajaran', CACHE_TTL.MASTER);
    const absensi  = getCachedData('Absensi', CACHE_TTL.SHORT);
    const status   = getCachedData('Status_Nilai', CACHE_TTL.SHORT);
    const transkrip= getCachedData('Transkrip', CACHE_TTL.SHORT);
    const remedial = getCachedData('Remedial', CACHE_TTL.SHORT);
    const pengumpulan = getCachedData('Pengumpulan_Tugas', CACHE_TTL.SHORT);

    /* Siswa per jurusan, dipecah menurut jenis kelamin (Upgrade 3) */
    const perJurusan = jurusan.map(function (j) {
      const anggota = siswa.filter(function (s) { return s.JurusanID === j.ID; });
      const laki = anggota.filter(function (s) {
        return /^(l|laki|pria|m|male)/i.test(String(s.JenisKelamin || '')); }).length;
      const perempuan = anggota.filter(function (s) {
        return /^(p|perempuan|wanita|f|female)/i.test(String(s.JenisKelamin || '')); }).length;
      return { label: j.Nama, kode: j.Kode, value: anggota.length,
               laki: laki, perempuan: perempuan,
               belumDiisi: anggota.length - laki - perempuan };
    });

    /* Rekap absensi */
    const rekapAbsensi = { Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0 };
    absensi.forEach(function (a) {
      const st = String(a.Status || '').trim();
      if (rekapAbsensi[st] !== undefined) rekapAbsensi[st]++;
    });
    const totalAbsen = absensi.length || 1;

    /* Distribusi huruf mutu */
    const distribusiNilai = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    transkrip.forEach(function (t) {
      const h = String(t.Huruf || '').charAt(0).toUpperCase();
      if (distribusiNilai[h] !== undefined) distribusiNilai[h]++;
    });

    /* Ketepatan pengumpulan tugas */
    const tepat = pengumpulan.filter(function (p) { return !toBool(p.Keterlambatan); }).length;
    const telat = pengumpulan.length - tepat;

    return {
      totalSiswa: siswa.filter(function (s) { return String(s.Status).toLowerCase() === 'aktif'; }).length,
      totalDosen: dosen.length,
      totalKelas: kelas.length,
      totalJurusan: jurusan.length,
      totalMapel: mapel.length,
      pendingValidasi: status.filter(function (s) { return s.Status === 'Submitted'; }).length,
      tervalidasiBulanIni: status.filter(function (s) {
        if (s.Status !== 'Validated' || !s.ValidatedAt) return false;
        const d = new Date(s.ValidatedAt); const n = new Date();
        return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
      }).length,
      dikembalikan: status.filter(function (s) { return s.Status === 'Returned'; }).length,
      totalRemedial: remedial.length,
      persenKehadiran: Math.round((rekapAbsensi.Hadir / totalAbsen) * 100),
      perJurusan: perJurusan,
      rekapAbsensi: rekapAbsensi,
      distribusiNilai: distribusiNilai,
      pengumpulan: { tepat: tepat, telat: telat }
    };
  } catch (err) {
    Logger.log('hitungStatistikGlobal: ' + err.message);
    return {};
  }
}

function hitungStatistikDosen(dosenId, kelasIds) {
  try {
    const tugas   = getCachedData('Tugas_Quiz', CACHE_TTL.SEMI)
                      .filter(function (t) { return kelasIds.indexOf(t.KelasID) !== -1; });
    const tugasIds= tugas.map(function (t) { return t.ID; });
    const kirim   = getCachedData('Pengumpulan_Tugas', CACHE_TTL.SHORT)
                      .filter(function (p) { return tugasIds.indexOf(p.TugasID) !== -1; });
    const siswa   = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                      .filter(function (s) { return kelasIds.indexOf(s.KelasID) !== -1; });
    const status  = getCachedData('Status_Nilai', CACHE_TTL.SHORT)
                      .filter(function (s) { return kelasIds.indexOf(s.KelasID) !== -1; });
    const absensi = getCachedData('Absensi', CACHE_TTL.SHORT)
                      .filter(function (a) { return kelasIds.indexOf(a.KelasID) !== -1; });

    const rekapAbsensi = { Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0 };
    absensi.forEach(function (a) { if (rekapAbsensi[a.Status] !== undefined) rekapAbsensi[a.Status]++; });

    return {
      totalKelas: kelasIds.length,
      totalSiswa: siswa.length,
      totalTugas: tugas.length,
      pengumpulanMasuk: kirim.length,
      belumDinilai: kirim.filter(function (p) { return p.Nilai === '' || p.Nilai === null; }).length,
      nilaiDraft: status.filter(function (s) { return s.Status === 'Draft' || !s.Status; }).length,
      nilaiDikembalikan: status.filter(function (s) { return s.Status === 'Returned'; }).length,
      rekapAbsensi: rekapAbsensi
    };
  } catch (err) { return {}; }
}

function hitungStatistikSiswa(siswaId, kelasId) {
  try {
    const absensi = getCachedData('Absensi', CACHE_TTL.SHORT)
                      .filter(function (a) { return a.SiswaID === siswaId; });
    const hadir   = absensi.filter(function (a) { return a.Status === 'Hadir'; }).length;
    const tugas   = getCachedData('Tugas_Quiz', CACHE_TTL.SEMI)
                      .filter(function (t) { return t.KelasID === kelasId; });
    const kirim   = getCachedData('Pengumpulan_Tugas', CACHE_TTL.SHORT)
                      .filter(function (p) { return p.SiswaID === siswaId; });
    const kirimIds= kirim.map(function (p) { return p.TugasID; });
    const transkrip = getCachedData('Transkrip', CACHE_TTL.SHORT)
                      .filter(function (t) { return t.SiswaID === siswaId; });

    let totalBobot = 0, totalSks = 0;
    transkrip.forEach(function (t) {
      const sks = Number(t.SKS) || 0;
      totalBobot += (Number(t.Bobot) || 0) * sks;
      totalSks   += sks;
    });

    return {
      persenKehadiran: absensi.length ? Math.round((hadir / absensi.length) * 100) : 0,
      totalAbsensi: absensi.length,
      tugasBelumDikumpulkan: tugas.filter(function (t) { return kirimIds.indexOf(t.ID) === -1; }).length,
      tugasDikumpulkan: kirim.length,
      ipk: totalSks ? (totalBobot / totalSks).toFixed(2) : '0.00',
      totalSks: totalSks
    };
  } catch (err) { return {}; }
}


/* ========================================================================== */
/* 10. BERKAS (GOOGLE DRIVE)                                                  */
/* ========================================================================== */

/**
 * Menyimpan berkas base64 dari client ke sub-folder Drive.
 * @param {Object} file {name, mimeType, data (base64 tanpa prefix), size}
 * @param {string} subFolder nama sub-folder di dalam folder aplikasi
 * @param {string} groupName sub-folder tingkat kedua (opsional, mis. kode mapel)
 */
function simpanBerkas(file, subFolder, groupName) {
  if (!file || !file.data) throw new Error('Berkas tidak ditemukan.');
  const bytes = Utilities.base64Decode(file.data);
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error('Ukuran berkas melebihi batas 2MB (' + (bytes.length / 1048576).toFixed(2) + 'MB).');
  }
  const root   = getRootFolder();
  let folder   = getOrCreateFolder(root, subFolder);
  if (groupName) folder = getOrCreateFolder(folder, String(groupName));

  const blob = Utilities.newBlob(bytes, file.mimeType || 'application/octet-stream', file.name || 'berkas');
  const created = folder.createFile(blob);
  created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    fileId: created.getId(),
    url: 'https://drive.google.com/file/d/' + created.getId() + '/view',
    previewUrl: 'https://drive.google.com/file/d/' + created.getId() + '/preview',
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + created.getId(),
    mimeType: created.getMimeType(),
    size: bytes.length
  };
}

/** Ambil isi berkas Drive sebagai base64 untuk pratinjau/unduh di modal. */
function apiGetFileBase64(token, fileId) {
  try {
    requireSession(token);
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    if (blob.getBytes().length > 8 * 1024 * 1024) {
      return createResponse(false, null, 'Berkas terlalu besar untuk pratinjau langsung. Gunakan tautan Drive.');
    }
    return createResponse(true, {
      name: file.getName(),
      mimeType: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes())
    }, 'OK');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}


/**
 * UPGRADE 1 — Unggah logo institusi.
 * Berkas disimpan di Drive, dibagikan sebagai tautan publik, lalu URL thumbnail
 * disimpan ke Institusi.LogoURL sehingga langsung tampil di sidebar & cetakan.
 */
function apiUploadLogo(token, file) {
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Super Admin') return createResponse(false, null, 'Akses ditolak.');
    if (!file || !file.data) return createResponse(false, null, 'Pilih berkas logo terlebih dahulu.');
    if (String(file.mimeType).indexOf('image/') !== 0) {
      return createResponse(false, null, 'Logo harus berupa gambar (PNG, JPG, atau WEBP).');
    }

    const inst = readSheetObjects('Institusi')[0];
    if (!inst) return createResponse(false, null, 'Data institusi belum tersedia.');

    /* Hapus logo lama agar Drive tidak menumpuk berkas usang */
    if (inst.LogoFileID) {
      try { DriveApp.getFileById(inst.LogoFileID).setTrashed(true); } catch (err) {}
    }

    const simpan = simpanBerkas(file, 'Identitas', 'Logo');
    inst.LogoFileID = simpan.fileId;
    inst.LogoURL = urlThumbnail(simpan.fileId, 240);
    inst.UpdatedAt = new Date();
    upsertRow(getSpreadsheet(), 'Institusi', inst);
    invalidateCache('Institusi');

    return createResponse(true, { logoURL: inst.LogoURL, fileId: simpan.fileId },
      'Logo institusi diperbarui.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/**
 * UPGRADE 12 — Unggah foto profil oleh pemilik akun sendiri.
 * Foto tersimpan sekali lalu disebar ke Pengguna dan profil Dosen/Siswa terkait.
 */
function apiUploadFotoProfil(token, file) {
  try {
    const sess = requireSession(token);
    if (!file || !file.data) return createResponse(false, null, 'Pilih berkas foto terlebih dahulu.');
    if (String(file.mimeType).indexOf('image/') !== 0) {
      return createResponse(false, null, 'Foto profil harus berupa gambar (PNG atau JPG).');
    }

    const ss = getSpreadsheet();
    const users = readSheetObjects('Pengguna');
    const me = users.filter(function (u) { return u.ID === sess.userId; })[0];
    if (!me) return createResponse(false, null, 'Akun tidak ditemukan.');

    if (me.FotoFileID) {
      try { DriveApp.getFileById(me.FotoFileID).setTrashed(true); } catch (err) {}
    }

    const simpan = simpanBerkas(file, 'Foto_Profil', String(me.Email || 'akun'));
    const fotoURL = urlThumbnail(simpan.fileId, 200);

    me.FotoURL = fotoURL;
    me.FotoFileID = simpan.fileId;
    upsertRow(ss, 'Pengguna', me);

    /* Sebarkan ke profil Dosen / Siswa yang terhubung */
    ['Siswa_Mahasiswa', 'Dosen_Guru'].forEach(function (sheetName) {
      const cocok = readSheetObjects(sheetName).filter(function (p) {
        return p.PenggunaID === me.ID ||
               String(p.Email).toLowerCase() === String(me.Email).toLowerCase();
      });
      if (cocok.length) {
        tulisPatch(ss, sheetName, cocok.map(function (p) {
          return { ID: p.ID, FotoURL: fotoURL, FotoFileID: simpan.fileId };
        }));
        invalidateCache(sheetName);
      }
    });

    invalidateCache('Pengguna');

    /* Segarkan sesi agar avatar langsung berganti tanpa login ulang */
    const sesiBaru = validateSession(token);
    if (sesiBaru.valid) { sesiBaru.fotoURL = fotoURL; saveSession(sesiBaru); }

    return createResponse(true, { fotoURL: fotoURL }, 'Foto profil diperbarui.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** URL thumbnail Drive yang ringan untuk ditampilkan sebagai avatar/logo. */
function urlThumbnail(fileId, ukuran) {
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w' + (ukuran || 200);
}


/* ========================================================================== */
/* 11. MATERI, TUGAS & PENGUMPULAN                                            */
/* ========================================================================== */

/**
 * US-08 — Unggah materi (PDF/PPT/Gambar ke Drive, atau embed YouTube).
 * Composite batch: simpan berkas + tulis metadata + kirim notifikasi = 1 call.
 */
function apiSimpanMateri(token, payload, file) {
  try {
    const sess = requireSession(token);
    if (['Dosen', 'Super Admin'].indexOf(sess.peran) === -1) {
      return createResponse(false, null, 'Hanya Dosen/Guru yang dapat mengunggah materi.');
    }
    if (!payload.Judul || !payload.MapelID || !payload.KelasID) {
      return createResponse(false, null, 'Judul, mata pelajaran, dan kelas wajib diisi.');
    }

    const mapel = getCachedData('Mata_Pelajaran', CACHE_TTL.MASTER)
                    .filter(function (m) { return m.ID === payload.MapelID; })[0] || {};

    const record = {
      ID: payload.ID || generateUUID(),
      Judul: payload.Judul,
      Deskripsi: payload.Deskripsi || '',
      Jenis: payload.Jenis || 'Dokumen',
      URL: payload.URL || '',
      FileID: payload.FileID || '',
      MimeType: '',
      MapelID: payload.MapelID,
      KelasID: payload.KelasID,
      Pertemuan: payload.Pertemuan || 1,
      DosenID: payload.DosenID || '',
      TanggalUpload: new Date()
    };

    if (payload.Jenis === 'YouTube') {
      const embed = konversiYouTube(payload.URL);
      if (!embed) return createResponse(false, null, 'Tautan YouTube tidak valid.');
      record.URL = embed;
    } else if (file && file.data) {
      const saved = simpanBerkas(file, 'Materi', mapel.Kode || payload.MapelID);
      record.FileID   = saved.fileId;
      record.URL      = saved.previewUrl;
      record.MimeType = saved.mimeType;
    }

    const ss = getSpreadsheet();
    upsertRow(ss, 'Materi', record);
    invalidateCache('Materi');

    /* Notifikasi ke siswa di kelas tersebut (fire & forget di server) */
    kirimNotifikasiKelas(record.KelasID,
      'Materi Baru: ' + record.Judul,
      'Materi baru "' + record.Judul + '" pada mata kuliah ' + (mapel.Nama || '-') +
      ' telah tersedia di Portal Belajar.');

    return createResponse(true, record, 'Materi berhasil disimpan.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

function konversiYouTube(url) {
  if (!url) return '';
  const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? 'https://www.youtube.com/embed/' + m[1] : '';
}

/** US-10 — Buat/ubah tugas atau quiz + notifikasi ke siswa. */
function apiSimpanTugas(token, payload) {
  try {
    const sess = requireSession(token);
    if (['Dosen', 'Super Admin'].indexOf(sess.peran) === -1) {
      return createResponse(false, null, 'Akses ditolak.');
    }
    const isNew = !payload.ID;
    const record = {
      ID: payload.ID || generateUUID(),
      Judul: payload.Judul,
      Deskripsi: payload.Deskripsi || '',
      MapelID: payload.MapelID,
      KelasID: payload.KelasID,
      JenisPengumpulan: payload.JenisPengumpulan || 'File',
      Deadline: payload.Deadline,
      Bobot: Number(payload.Bobot) || 0,
      Komponen: payload.Komponen || 'Tugas',
      DosenID: payload.DosenID || '',
      Status: payload.Status || 'Aktif',
      CreatedAt: payload.CreatedAt || new Date()
    };
    if (!record.Judul || !record.MapelID || !record.KelasID || !record.Deadline) {
      return createResponse(false, null, 'Judul, mata pelajaran, kelas, dan tenggat wajib diisi.');
    }

    upsertRow(getSpreadsheet(), 'Tugas_Quiz', record);
    invalidateCache('Tugas_Quiz');

    if (isNew) {
      kirimNotifikasiKelas(record.KelasID,
        'Tugas Baru: ' + record.Judul,
        'Tugas "' + record.Judul + '" dibuka. Tenggat: ' + formatTanggalId(record.Deadline) + '.');
    }
    return createResponse(true, record, 'Tugas berhasil disimpan.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** US-11 — Siswa mengumpulkan tugas (file / teks / URL video). */
function apiKumpulkanTugas(token, payload, file) {
  const lock = LockService.getScriptLock();
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Siswa') return createResponse(false, null, 'Hanya siswa/mahasiswa yang dapat mengumpulkan tugas.');

    const siswa = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                    .filter(function (s) { return s.PenggunaID === sess.userId; })[0];
    if (!siswa) return createResponse(false, null, 'Profil siswa tidak ditemukan.');

    const tugas = getCachedData('Tugas_Quiz', CACHE_TTL.SEMI)
                    .filter(function (t) { return t.ID === payload.TugasID; })[0];
    if (!tugas) return createResponse(false, null, 'Tugas tidak ditemukan.');

    const sekarang = new Date();
    const deadline = new Date(tugas.Deadline);
    const terlambat = sekarang > deadline;

    const record = {
      ID: payload.ID || generateUUID(),
      TugasID: payload.TugasID,
      SiswaID: siswa.ID,
      Jenis: payload.Jenis || tugas.JenisPengumpulan,
      KontenTeks: payload.KontenTeks || '',
      KontenURL: payload.KontenURL || '',
      FileID: '',
      Timestamp: sekarang,
      Keterlambatan: terlambat ? 'TRUE' : 'FALSE',
      Nilai: '', Feedback: '', DinilaiOleh: ''
    };

    if (file && file.data) {
      const saved = simpanBerkas(file, 'Tugas_Pengumpulan', payload.TugasID);
      record.FileID = saved.fileId;
      record.KontenURL = saved.previewUrl;
    }
    if (record.Jenis === 'Video URL' && record.KontenURL) {
      record.KontenURL = konversiYouTube(record.KontenURL) || record.KontenURL;
    }

    /* Cegah pengumpulan ganda: perbarui bila sudah ada */
    lock.waitLock(15000);
    const existing = readSheetObjects('Pengumpulan_Tugas').filter(function (p) {
      return p.TugasID === record.TugasID && p.SiswaID === siswa.ID;
    })[0];
    if (existing) record.ID = existing.ID;

    upsertRow(getSpreadsheet(), 'Pengumpulan_Tugas', record);
    invalidateCache('Pengumpulan_Tugas');
    lock.releaseLock();

    return createResponse(true, record,
      terlambat ? 'Tugas dikumpulkan (TERLAMBAT).' : 'Tugas berhasil dikumpulkan tepat waktu.');
  } catch (error) {
    try { lock.releaseLock(); } catch (e) {}
    return createResponse(false, null, error.message);
  }
}

/** Dosen menilai pengumpulan tugas (batch). */
function apiNilaiPengumpulanBatch(token, items) {
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Dosen') return createResponse(false, null, 'Akses ditolak.');
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Pengumpulan_Tugas');
    const headers = SHEET_SCHEMA['Pengumpulan_Tugas'];
    const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).getValues();
    const idCol = headers.indexOf('ID');
    const nilaiCol = headers.indexOf('Nilai');
    const fbCol = headers.indexOf('Feedback');
    const byCol = headers.indexOf('DinilaiOleh');

    const map = {};
    items.forEach(function (i) { map[String(i.ID)] = i; });

    let changed = 0;
    for (let r = 1; r < values.length; r++) {
      const it = map[String(values[r][idCol])];
      if (it) {
        values[r][nilaiCol] = it.Nilai === '' ? '' : Number(it.Nilai);
        values[r][fbCol]    = it.Feedback || '';
        values[r][byCol]    = sess.nama;
        changed++;
      }
    }
    if (changed) sheet.getRange(1, 1, values.length, headers.length).setValues(values); // 1 write
    invalidateCache('Pengumpulan_Tugas');
    return createResponse(true, { updated: changed }, changed + ' penilaian tersimpan.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}


/* ========================================================================== */
/* 12. ABSENSI                                                                */
/* ========================================================================== */

/**
 * US-12 — Absensi mandiri siswa.
 * Sakit/Izin WAJIB melampirkan bukti (divalidasi juga di server).
 */
function apiAbsensiMandiri(token, payload, file) {
  const lock = LockService.getScriptLock();
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Siswa') return createResponse(false, null, 'Akses ditolak.');

    const siswa = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                    .filter(function (s) { return s.PenggunaID === sess.userId; })[0];
    if (!siswa) return createResponse(false, null, 'Profil siswa tidak ditemukan.');

    const status = payload.Status;
    if (['Hadir', 'Sakit', 'Izin'].indexOf(status) === -1) {
      return createResponse(false, null, 'Status absensi tidak valid.');
    }
    if ((status === 'Sakit' || status === 'Izin') && !(file && file.data)) {
      return createResponse(false, null, 'Status ' + status + ' wajib melampirkan bukti (foto/dokumen).');
    }

    lock.waitLock(15000);
    /* Cegah absen ganda untuk sesi yang sama */
    const sudah = readSheetObjects('Absensi').filter(function (a) {
      return a.SiswaID === siswa.ID && a.MapelID === payload.MapelID &&
             String(a.Pertemuan) === String(payload.Pertemuan);
    })[0];
    if (sudah) {
      lock.releaseLock();
      return createResponse(false, null, 'Anda sudah mengisi absensi untuk pertemuan ini (terkunci).');
    }

    let buktiURL = '';
    if (file && file.data) {
      buktiURL = simpanBerkas(file, 'Bukti_Absensi', siswa.NIM).previewUrl;
    }

    const record = {
      ID: generateUUID(),
      Tanggal: payload.Tanggal || new Date(),
      MapelID: payload.MapelID,
      KelasID: siswa.KelasID,
      SiswaID: siswa.ID,
      Pertemuan: payload.Pertemuan || 1,
      Status: status,
      BuktiURL: buktiURL,
      Metode: 'Mandiri',
      Keterangan: payload.Keterangan || '',
      DiisiOleh: sess.nama,
      Timestamp: new Date()
    };
    upsertRow(getSpreadsheet(), 'Absensi', record);
    invalidateCache('Absensi');
    lock.releaseLock();
    return createResponse(true, record, 'Absensi "' + status + '" tersimpan dan terkunci untuk sesi ini.');
  } catch (error) {
    try { lock.releaseLock(); } catch (e) {}
    return createResponse(false, null, error.message);
  }
}

/**
 * US-13 — Absensi manual/koreksi oleh Dosen untuk SATU KELAS sekaligus.
 * Batch: seluruh baris ditulis dengan satu setValues().
 */
function apiAbsensiManualBatch(token, meta, daftar) {
  const lock = LockService.getScriptLock();
  try {
    const sess = requireSession(token);
    if (['Dosen', 'Super Admin'].indexOf(sess.peran) === -1) return createResponse(false, null, 'Akses ditolak.');
    if (!daftar || !daftar.length) return createResponse(false, null, 'Daftar absensi kosong.');

    lock.waitLock(20000);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Absensi');
    const headers = SHEET_SCHEMA['Absensi'];
    const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).getValues();

    const cMapel = headers.indexOf('MapelID');
    const cSiswa = headers.indexOf('SiswaID');
    const cPert  = headers.indexOf('Pertemuan');

    /* Peta absensi eksisting untuk sesi ini */
    const key = function (mapel, siswa, pert) { return mapel + '|' + siswa + '|' + pert; };
    const existing = {};
    for (let r = 1; r < values.length; r++) {
      existing[key(values[r][cMapel], values[r][cSiswa], values[r][cPert])] = r;
    }

    const inserts = [];
    let updated = 0;
    daftar.forEach(function (d) {
      const k = key(meta.MapelID, d.SiswaID, meta.Pertemuan);
      const rec = {
        ID: generateUUID(),
        Tanggal: meta.Tanggal || new Date(),
        MapelID: meta.MapelID,
        KelasID: meta.KelasID,
        SiswaID: d.SiswaID,
        Pertemuan: meta.Pertemuan || 1,
        Status: d.Status,
        BuktiURL: '',
        Metode: 'Manual Dosen',
        Keterangan: d.Keterangan || '',
        DiisiOleh: sess.nama,
        Timestamp: new Date()
      };
      if (existing[k] !== undefined) {
        const r = existing[k];
        rec.ID = values[r][headers.indexOf('ID')];
        rec.BuktiURL = values[r][headers.indexOf('BuktiURL')];
        headers.forEach(function (h, c) { values[r][c] = rec[h]; });
        updated++;
      } else {
        inserts.push(headers.map(function (h) { return rec[h]; }));
      }
    });

    if (updated) sheet.getRange(1, 1, values.length, headers.length).setValues(values); // 1 write
    if (inserts.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, inserts.length, headers.length).setValues(inserts); // 1 write
    }
    invalidateCache('Absensi');
    lock.releaseLock();
    return createResponse(true, { inserted: inserts.length, updated: updated },
      'Absensi tersimpan (' + inserts.length + ' baru, ' + updated + ' dikoreksi).');
  } catch (error) {
    try { lock.releaseLock(); } catch (e) {}
    return createResponse(false, null, error.message);
  }
}

/** US-15 — Absensi berbasis lokasi GPS (opsional). */
function apiAbsensiGeo(token, payload) {
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Siswa') return createResponse(false, null, 'Akses ditolak.');

    const inst = getCachedData('Institusi', CACHE_TTL.MASTER)[0] || {};
    if (!toBool(inst.FiturGeo)) return createResponse(false, null, 'Fitur absensi lokasi tidak aktif.');

    const siswa = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                    .filter(function (s) { return s.PenggunaID === sess.userId; })[0];
    if (!siswa) return createResponse(false, null, 'Profil siswa tidak ditemukan.');

    const jarak = hitungJarakMeter(Number(payload.lat), Number(payload.lng),
                                   Number(inst.GeoLat), Number(inst.GeoLng));
    const radius = Number(inst.GeoRadius) || 150;
    const diterima = jarak <= radius;

    const ss = getSpreadsheet();
    upsertRow(ss, 'Absensi_Geo', {
      ID: generateUUID(), SiswaID: siswa.ID, KelasID: siswa.KelasID, MapelID: payload.MapelID,
      Lat: payload.lat, Lng: payload.lng, Jarak: Math.round(jarak),
      Status: diterima ? 'Diterima' : 'Ditolak', Timestamp: new Date()
    });
    invalidateCache('Absensi_Geo');

    if (!diterima) {
      return createResponse(false, { jarak: Math.round(jarak), radius: radius },
        'Lokasi Anda ' + Math.round(jarak) + ' m dari titik kampus (batas ' + radius + ' m). ' +
        'Absensi ditolak — silakan ajukan Izin/Sakit dengan bukti.');
    }

    const sudah = readSheetObjects('Absensi').filter(function (a) {
      return a.SiswaID === siswa.ID && a.MapelID === payload.MapelID &&
             String(a.Pertemuan) === String(payload.Pertemuan);
    })[0];
    if (sudah) return createResponse(false, null, 'Anda sudah absen untuk pertemuan ini.');

    upsertRow(ss, 'Absensi', {
      ID: generateUUID(), Tanggal: new Date(), MapelID: payload.MapelID, KelasID: siswa.KelasID,
      SiswaID: siswa.ID, Pertemuan: payload.Pertemuan || 1, Status: 'Hadir', BuktiURL: '',
      Metode: 'GPS', Keterangan: 'Jarak ' + Math.round(jarak) + ' m', DiisiOleh: sess.nama,
      Timestamp: new Date()
    });
    invalidateCache('Absensi');
    return createResponse(true, { jarak: Math.round(jarak) },
      'Kehadiran terverifikasi (jarak ' + Math.round(jarak) + ' m).');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Rumus Haversine — jarak dua koordinat dalam meter. */
function hitungJarakMeter(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = function (d) { return d * Math.PI / 180; };
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** US-14 — Dosen membuat kode barcode/QR sesi (berlaku 15 menit). */
function apiBuatSesiBarcode(token, payload) {
  try {
    const sess = requireSession(token);
    if (['Dosen', 'Super Admin'].indexOf(sess.peran) === -1) return createResponse(false, null, 'Akses ditolak.');
    const inst = getCachedData('Institusi', CACHE_TTL.MASTER)[0] || {};
    if (!toBool(inst.FiturBarcode)) return createResponse(false, null, 'Fitur absensi barcode tidak aktif.');

    const kode = 'SESI-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const berlaku = new Date(Date.now() + 15 * 60 * 1000);
    upsertRow(getSpreadsheet(), 'Absensi_Barcode', {
      ID: generateUUID(), SesiKode: kode, KelasID: payload.KelasID, MapelID: payload.MapelID,
      Pertemuan: payload.Pertemuan || 1, SiswaID: '', BerlakuSampai: berlaku, Timestamp: new Date()
    });
    invalidateCache('Absensi_Barcode');
    return createResponse(true, { sesiKode: kode, berlakuSampai: berlaku.toISOString() },
      'Kode sesi dibuat, berlaku 15 menit.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Siswa memindai barcode → tercatat hadir. */
function apiAbsensiBarcode(token, sesiKode) {
  const lock = LockService.getScriptLock();
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Siswa') return createResponse(false, null, 'Akses ditolak.');

    const sesi = readSheetObjects('Absensi_Barcode').filter(function (b) {
      return b.SesiKode === sesiKode && !b.SiswaID;
    })[0];
    if (!sesi) return createResponse(false, null, 'Kode sesi tidak dikenal.');
    if (new Date(sesi.BerlakuSampai) < new Date()) {
      return createResponse(false, null, 'Kode sesi sudah kedaluwarsa.');
    }

    const siswa = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                    .filter(function (s) { return s.PenggunaID === sess.userId; })[0];
    if (!siswa || siswa.KelasID !== sesi.KelasID) {
      return createResponse(false, null, 'Anda tidak terdaftar di kelas sesi ini.');
    }

    lock.waitLock(15000);
    const sudah = readSheetObjects('Absensi').filter(function (a) {
      return a.SiswaID === siswa.ID && a.MapelID === sesi.MapelID &&
             String(a.Pertemuan) === String(sesi.Pertemuan);
    })[0];
    if (sudah) { lock.releaseLock(); return createResponse(false, null, 'Anda sudah absen untuk pertemuan ini.'); }

    const ss = getSpreadsheet();
    upsertRow(ss, 'Absensi_Barcode', {
      ID: generateUUID(), SesiKode: sesiKode, KelasID: sesi.KelasID, MapelID: sesi.MapelID,
      Pertemuan: sesi.Pertemuan, SiswaID: siswa.ID, BerlakuSampai: sesi.BerlakuSampai, Timestamp: new Date()
    });
    upsertRow(ss, 'Absensi', {
      ID: generateUUID(), Tanggal: new Date(), MapelID: sesi.MapelID, KelasID: sesi.KelasID,
      SiswaID: siswa.ID, Pertemuan: sesi.Pertemuan, Status: 'Hadir', BuktiURL: '',
      Metode: 'Barcode', Keterangan: sesiKode, DiisiOleh: sess.nama, Timestamp: new Date()
    });
    invalidateCacheMultiple(['Absensi', 'Absensi_Barcode']);
    lock.releaseLock();
    return createResponse(true, null, 'Kehadiran tercatat melalui barcode.');
  } catch (error) {
    try { lock.releaseLock(); } catch (e) {}
    return createResponse(false, null, error.message);
  }
}


/* ========================================================================== */
/* 13. PENILAIAN & VALIDASI BERJENJANG                                        */
/*     Bobot komponen disusun dosen (Upgrade 15) & validasi dapat dilakukan    */
/*     per siswa, sebagian siswa, atau satu kelas sekaligus (Upgrade 16).      */
/* ========================================================================== */

/** Peta status validasi per siswa untuk satu kelas+mapel+semester. */
function petaStatusSiswa(meta) {
  const peta = {};
  getCachedData('Status_Nilai_Siswa', CACHE_TTL.SHORT).forEach(function (s) {
    if (s.MapelID === meta.MapelID && s.KelasID === meta.KelasID &&
        String(s.Semester) === String(meta.Semester)) peta[s.SiswaID] = s;
  });
  return peta;
}

/** Nilai seorang siswa terkunci bila status per-siswanya sudah Validated. */
function siswaTerkunci(peta, siswaId) {
  const s = peta[siswaId];
  return !!(s && s.Status === 'Validated');
}

/**
 * US-16 — Dosen menyimpan nilai satu kelas (draf).
 * items: [{ SiswaID, nilai: { "<Nama Komponen>": angka, ... } }]
 * Siswa yang nilainya sudah tervalidasi dilewati secara otomatis.
 */
function apiSimpanNilaiBatch(token, meta, items) {
  const lock = LockService.getScriptLock();
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Dosen') return createResponse(false, null, 'Hanya Dosen/Guru yang dapat menginput nilai.');
    if (!items || !items.length) return createResponse(false, null, 'Tidak ada data nilai untuk disimpan.');

    const komponen = ambilKomponen(meta);
    const bobotPer = {};
    komponen.forEach(function (k) { bobotPer[String(k.Nama).toLowerCase()] = Number(k.Bobot) || 0; });

    const peta = petaStatusSiswa(meta);
    const bolehSimpan = items.filter(function (it) { return !siswaTerkunci(peta, it.SiswaID); });
    const dilewati = items.length - bolehSimpan.length;
    if (!bolehSimpan.length) {
      return createResponse(false, null, 'Seluruh nilai pada kelas ini sudah tervalidasi dan terkunci. Minta Tim Akademik membuka kuncinya.');
    }

    lock.waitLock(25000);
    const ss = getSpreadsheet();

    /* --- Semua komponen disimpan pada sheet Nilai_Tugas --- */
    tulisNilaiKomponen(ss, meta, bolehSimpan, bobotPer);

    /* --- Cermin UTS/UAS agar sheet Nilai_UTS_UAS tetap konsisten --- */
    cerminUtsUas(ss, meta, bolehSimpan, bobotPer);

    /* --- Status per siswa menjadi Draft (kecuali yang sudah Submitted) --- */
    upsertStatusSiswa(ss, meta, bolehSimpan.map(function (i) { return i.SiswaID; }), 'Draft', sess, '', true);
    hitungUlangStatusKelas(ss, meta, sess);

    invalidateCacheMultiple(['Nilai_Tugas', 'Nilai_UTS_UAS', 'Status_Nilai', 'Status_Nilai_Siswa']);
    lock.releaseLock();

    return createResponse(true, { disimpan: bolehSimpan.length, dilewati: dilewati },
      'Nilai ' + bolehSimpan.length + ' siswa tersimpan sebagai draf.' +
      (dilewati ? ' ' + dilewati + ' siswa dilewati karena nilainya sudah terkunci.' : ''));
  } catch (error) {
    try { lock.releaseLock(); } catch (e) {}
    return createResponse(false, null, error.message);
  }
}

/** Upsert seluruh komponen nilai ke sheet Nilai_Tugas dalam operasi batch. */
function tulisNilaiKomponen(ss, meta, items, bobotPer) {
  const sheet = ss.getSheetByName('Nilai_Tugas');
  const headers = SHEET_SCHEMA['Nilai_Tugas'];
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).getValues();

  const cMapel = headers.indexOf('MapelID'), cKelas = headers.indexOf('KelasID');
  const cSiswa = headers.indexOf('SiswaID'), cSem = headers.indexOf('Semester');
  const cKomp  = headers.indexOf('Komponen');

  const idx = {};
  for (let r = 1; r < values.length; r++) {
    idx[[values[r][cMapel], values[r][cKelas], values[r][cSiswa], values[r][cSem],
         String(values[r][cKomp]).toLowerCase()].join('|')] = r;
  }

  const sisip = []; let ubah = false;
  items.forEach(function (it) {
    const nilaiMap = it.nilai || {};
    Object.keys(nilaiMap).forEach(function (namaKomponen) {
      const v = nilaiMap[namaKomponen];
      const rec = {
        ID: generateUUID(), MapelID: meta.MapelID, KelasID: meta.KelasID, SiswaID: it.SiswaID,
        Semester: meta.Semester, TahunAjaran: meta.TahunAjaran, Komponen: namaKomponen,
        Nilai: (v === '' || v === null || v === undefined) ? '' : Number(v),
        Bobot: bobotPer[String(namaKomponen).toLowerCase()] || 0, UpdatedAt: new Date()
      };
      const k = [meta.MapelID, meta.KelasID, it.SiswaID, meta.Semester,
                 String(namaKomponen).toLowerCase()].join('|');
      if (idx[k] !== undefined) {
        const r = idx[k];
        rec.ID = values[r][headers.indexOf('ID')];
        headers.forEach(function (h, c) { values[r][c] = rec[h]; });
        ubah = true;
      } else {
        sisip.push(headers.map(function (h) { return rec[h] === undefined ? '' : rec[h]; }));
      }
    });
  });

  if (ubah) sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  if (sisip.length) sheet.getRange(sheet.getLastRow() + 1, 1, sisip.length, headers.length).setValues(sisip);
}

/** Menyalin komponen bernama UTS/UAS ke sheet Nilai_UTS_UAS. */
function cerminUtsUas(ss, meta, items, bobotPer) {
  const sheet = ss.getSheetByName('Nilai_UTS_UAS');
  const headers = SHEET_SCHEMA['Nilai_UTS_UAS'];
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).getValues();
  const cMapel = headers.indexOf('MapelID'), cKelas = headers.indexOf('KelasID');
  const cSiswa = headers.indexOf('SiswaID'), cSem = headers.indexOf('Semester'), cJenis = headers.indexOf('Jenis');

  const idx = {};
  for (let r = 1; r < values.length; r++) {
    idx[[values[r][cMapel], values[r][cKelas], values[r][cSiswa], values[r][cSem],
         String(values[r][cJenis]).toUpperCase()].join('|')] = r;
  }

  const sisip = []; let ubah = false;
  items.forEach(function (it) {
    const nilaiMap = it.nilai || {};
    Object.keys(nilaiMap).forEach(function (nama) {
      const jenis = String(nama).toUpperCase();
      if (jenis !== 'UTS' && jenis !== 'UAS') return;
      const v = nilaiMap[nama];
      const rec = {
        ID: generateUUID(), MapelID: meta.MapelID, KelasID: meta.KelasID, SiswaID: it.SiswaID,
        Semester: meta.Semester, TahunAjaran: meta.TahunAjaran, Jenis: jenis,
        Nilai: (v === '' || v === null || v === undefined) ? '' : Number(v),
        Bobot: bobotPer[String(nama).toLowerCase()] || 0, UpdatedAt: new Date()
      };
      const k = [meta.MapelID, meta.KelasID, it.SiswaID, meta.Semester, jenis].join('|');
      if (idx[k] !== undefined) {
        const r = idx[k];
        rec.ID = values[r][headers.indexOf('ID')];
        headers.forEach(function (h, c) { values[r][c] = rec[h]; });
        ubah = true;
      } else {
        sisip.push(headers.map(function (h) { return rec[h] === undefined ? '' : rec[h]; }));
      }
    });
  });

  if (ubah) sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  if (sisip.length) sheet.getRange(sheet.getLastRow() + 1, 1, sisip.length, headers.length).setValues(sisip);
}

/**
 * Upsert status validasi PER SISWA dalam satu operasi batch.
 * @param {boolean} hanyaJikaBelumSubmit true = jangan turunkan status Submitted menjadi Draft
 */
function upsertStatusSiswa(ss, meta, siswaIds, status, sess, catatan, hanyaJikaBelumSubmit) {
  if (!siswaIds || !siswaIds.length) return 0;
  const sheet = ss.getSheetByName('Status_Nilai_Siswa');
  const headers = SHEET_SCHEMA['Status_Nilai_Siswa'];
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).getValues();

  const cMapel = headers.indexOf('MapelID'), cKelas = headers.indexOf('KelasID');
  const cSem = headers.indexOf('Semester'), cSiswa = headers.indexOf('SiswaID');

  const idx = {};
  for (let r = 1; r < values.length; r++) {
    if (values[r][cMapel] === meta.MapelID && values[r][cKelas] === meta.KelasID &&
        String(values[r][cSem]) === String(meta.Semester)) idx[String(values[r][cSiswa])] = r;
  }

  const sisip = []; let ubah = 0;
  const sekarang = new Date();

  siswaIds.forEach(function (sid) {
    const r = idx[String(sid)];
    const lama = r !== undefined ? objFromRow(headers, values[r]) : {};
    if (hanyaJikaBelumSubmit && (lama.Status === 'Submitted' || lama.Status === 'Validated')) return;

    const rec = {
      ID: lama.ID || generateUUID(),
      MapelID: meta.MapelID, KelasID: meta.KelasID, Semester: meta.Semester,
      TahunAjaran: meta.TahunAjaran || '', SiswaID: sid, Status: status,
      SubmittedBy: lama.SubmittedBy || '', SubmittedAt: lama.SubmittedAt || '',
      ValidatedBy: lama.ValidatedBy || '', ValidatedAt: lama.ValidatedAt || '',
      Catatan: catatan !== undefined && catatan !== '' ? catatan : (lama.Catatan || '')
    };
    if (status === 'Submitted') { rec.SubmittedBy = sess.nama; rec.SubmittedAt = sekarang; rec.ValidatedBy = ''; rec.ValidatedAt = ''; }
    if (status === 'Validated' || status === 'Returned') { rec.ValidatedBy = sess.nama; rec.ValidatedAt = sekarang; }
    if (status === 'Draft' && !hanyaJikaBelumSubmit) { rec.ValidatedBy = ''; rec.ValidatedAt = ''; }

    if (r !== undefined) { headers.forEach(function (h, c) { values[r][c] = rec[h]; }); ubah++; }
    else sisip.push(headers.map(function (h) { return rec[h] === undefined ? '' : rec[h]; }));
  });

  if (ubah) sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  if (sisip.length) sheet.getRange(sheet.getLastRow() + 1, 1, sisip.length, headers.length).setValues(sisip);
  return ubah + sisip.length;
}

/** Status kelas dihitung ulang dari agregat status per siswa. */
function hitungUlangStatusKelas(ss, meta, sess, catatan) {
  invalidateCache('Status_Nilai_Siswa');
  const daftar = readSheetObjects('Status_Nilai_Siswa').filter(function (s) {
    return s.MapelID === meta.MapelID && s.KelasID === meta.KelasID &&
           String(s.Semester) === String(meta.Semester);
  });
  const siswaKelas = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER).filter(function (s) {
    return s.KelasID === meta.KelasID && String(s.Status).toLowerCase() === 'aktif';
  });

  const jml = { Draft: 0, Submitted: 0, Validated: 0, Returned: 0 };
  daftar.forEach(function (s) { if (jml[s.Status] !== undefined) jml[s.Status]++; });

  let statusKelas = 'Draft';
  if (siswaKelas.length && jml.Validated >= siswaKelas.length) statusKelas = 'Validated';
  else if (jml.Returned) statusKelas = 'Returned';
  else if (jml.Submitted) statusKelas = 'Submitted';
  else if (jml.Validated) statusKelas = 'Submitted'; // sebagian tervalidasi

  upsertStatusNilai(ss, meta, statusKelas, sess, catatan);
  invalidateCache('Status_Nilai');
  return { statusKelas: statusKelas, rincian: jml, totalSiswa: siswaKelas.length };
}

function upsertStatusNilai(ss, meta, status, sess, catatan) {
  const sheet = ss.getSheetByName('Status_Nilai');
  const headers = SHEET_SCHEMA['Status_Nilai'];
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).getValues();
  const cMapel = headers.indexOf('MapelID'), cKelas = headers.indexOf('KelasID'), cSem = headers.indexOf('Semester');

  let found = -1;
  for (let r = 1; r < values.length; r++) {
    if (values[r][cMapel] === meta.MapelID && values[r][cKelas] === meta.KelasID &&
        String(values[r][cSem]) === String(meta.Semester)) { found = r; break; }
  }

  const base = found > 0 ? objFromRow(headers, values[found]) : {};
  const rec = {
    ID: base.ID || generateUUID(),
    MapelID: meta.MapelID, KelasID: meta.KelasID, Semester: meta.Semester,
    TahunAjaran: meta.TahunAjaran, Status: status,
    SubmittedBy: base.SubmittedBy || '', SubmittedAt: base.SubmittedAt || '',
    ValidatedBy: base.ValidatedBy || '', ValidatedAt: base.ValidatedAt || '',
    Catatan: catatan !== undefined && catatan !== '' ? catatan : (base.Catatan || '')
  };
  if (status === 'Submitted') { rec.SubmittedBy = sess.nama; rec.SubmittedAt = new Date(); }
  if (status === 'Validated' || status === 'Returned') { rec.ValidatedBy = sess.nama; rec.ValidatedAt = new Date(); }

  const row = headers.map(function (h) { return rec[h] === undefined ? '' : rec[h]; });
  if (found > 0) sheet.getRange(found + 1, 1, 1, headers.length).setValues([row]);
  else sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
  return rec;
}

function objFromRow(headers, row) {
  const o = {};
  headers.forEach(function (h, i) { o[h] = normalizeCell(row[i]); });
  return o;
}

function cekKunciNilai(mapelId, kelasId, semester) {
  const st = getCachedData('Status_Nilai', CACHE_TTL.SHORT).filter(function (s) {
    return s.MapelID === mapelId && s.KelasID === kelasId && String(s.Semester) === String(semester);
  })[0];
  return { terkunci: !!(st && st.Status === 'Validated'), status: st ? st.Status : 'Draft', row: st };
}

/**
 * US-16 — Dosen mengirim nilai untuk divalidasi.
 * @param {Array<string>} siswaIds daftar siswa terpilih; kosong/null = satu kelas
 */
function apiSubmitNilaiValidasi(token, meta, siswaIds) {
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Dosen') return createResponse(false, null, 'Akses ditolak.');

    const semuaSiswa = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
      .filter(function (s) { return s.KelasID === meta.KelasID && String(s.Status).toLowerCase() === 'aktif'; })
      .map(function (s) { return s.ID; });

    let target = (siswaIds && siswaIds.length) ? siswaIds : semuaSiswa;
    const peta = petaStatusSiswa(meta);
    target = target.filter(function (id) { return !siswaTerkunci(peta, id); });
    if (!target.length) return createResponse(false, null, 'Tidak ada nilai yang dapat dikirim — semuanya sudah tervalidasi dan terkunci.');

    const ss = getSpreadsheet();
    upsertStatusSiswa(ss, meta, target, 'Submitted', sess, '');
    const ringkas = hitungUlangStatusKelas(ss, meta, sess, '');
    invalidateCacheMultiple(['Status_Nilai', 'Status_Nilai_Siswa']);

    const mapel = getCachedData('Mata_Pelajaran', CACHE_TTL.MASTER)
                    .filter(function (m) { return m.ID === meta.MapelID; })[0] || {};
    const kelas = getCachedData('Kelas', CACHE_TTL.MASTER)
                    .filter(function (k) { return k.ID === meta.KelasID; })[0] || {};
    kirimNotifikasiPeran('Tim Akademik',
      'Nilai Menunggu Validasi — ' + (mapel.Nama || ''),
      sess.nama + ' mengirimkan nilai ' + target.length + ' siswa pada mata kuliah ' +
      (mapel.Nama || '') + ' kelas ' + (kelas.Nama || '') + ' untuk diverifikasi & divalidasi.');

    return createResponse(true, { dikirim: target.length, ringkas: ringkas },
      'Nilai ' + target.length + ' siswa dikirim ke Tim Akademik untuk divalidasi.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/**
 * US-17 / US-18 — Tim Akademik: verval, kembalikan, atau buka kunci.
 * Dapat dilakukan untuk siswa terpilih maupun satu kelas sekaligus.
 * aksi: 'validate' | 'return' | 'unlock'
 */
function apiVervalNilai(token, meta, aksi, catatan, siswaIds) {
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Tim Akademik') return createResponse(false, null, 'Hanya Tim Akademik yang berwenang.');

    let status, pesan;
    if (aksi === 'validate')    { status = 'Validated'; pesan = 'Nilai tervalidasi dan terkunci.'; }
    else if (aksi === 'return') { status = 'Returned';  pesan = 'Nilai dikembalikan ke Dosen untuk revisi.'; }
    else if (aksi === 'unlock') { status = 'Draft';     pesan = 'Kunci nilai dibuka. Dosen dapat merevisi.'; }
    else return createResponse(false, null, 'Aksi tidak dikenal.');

    const semuaSiswa = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
      .filter(function (s) { return s.KelasID === meta.KelasID && String(s.Status).toLowerCase() === 'aktif'; })
      .map(function (s) { return s.ID; });
    const target = (siswaIds && siswaIds.length) ? siswaIds : semuaSiswa;
    if (!target.length) return createResponse(false, null, 'Tidak ada siswa aktif pada kelas ini.');

    const ss = getSpreadsheet();
    upsertStatusSiswa(ss, meta, target, status, sess, catatan || '');
    const ringkas = hitungUlangStatusKelas(ss, meta, sess, catatan || '');
    invalidateCacheMultiple(['Status_Nilai', 'Status_Nilai_Siswa']);

    const mapel = getCachedData('Mata_Pelajaran', CACHE_TTL.MASTER)
                    .filter(function (m) { return m.ID === meta.MapelID; })[0] || {};

    if (status === 'Validated') {
      const hasil = generateTranskripKelas(meta, target);
      kirimNotifikasiSiswaTertentu(target, 'Nilai Tersedia — ' + (mapel.Nama || ''),
        'Nilai akhir ' + (mapel.Nama || '') + ' telah divalidasi dan dapat dilihat di menu Nilai & Transkrip.');
      return createResponse(true, { transkrip: hasil.length, ringkas: ringkas },
        pesan + ' ' + hasil.length + ' transkrip diperbarui untuk ' + target.length + ' siswa.');
    }
    if (status === 'Returned') {
      kirimNotifikasiPeran('Dosen', 'Nilai Dikembalikan — ' + (mapel.Nama || ''),
        'Nilai ' + (mapel.Nama || '') + ' untuk ' + target.length + ' siswa dikembalikan untuk revisi. Catatan: ' + (catatan || '-'));
    }
    return createResponse(true, { ringkas: ringkas }, pesan + ' (' + target.length + ' siswa)');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Notifikasi ke sekumpulan siswa berdasarkan ID. */
function kirimNotifikasiSiswaTertentu(siswaIds, subjek, pesan) {
  try {
    const daftar = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
      .filter(function (s) { return siswaIds.indexOf(s.ID) !== -1; });
    kirimNotifikasiBatch(daftar, subjek, pesan);
  } catch (err) { Logger.log('kirimNotifikasiSiswaTertentu: ' + err.message); }
}

/** Rekap nilai satu kelas untuk layar input (dosen) dan peninjauan (akademik). */
function apiGetRekapNilai(token, meta) {
  try {
    requireSession(token);
    const komponen = ambilKomponen(meta);
    const siswa = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
      .filter(function (s) { return s.KelasID === meta.KelasID && String(s.Status).toLowerCase() === 'aktif'; });

    const nilaiRow = getCachedData('Nilai_Tugas', CACHE_TTL.SHORT).filter(function (n) {
      return n.MapelID === meta.MapelID && n.KelasID === meta.KelasID &&
             String(n.Semester) === String(meta.Semester);
    });
    const petaNilai = {};
    nilaiRow.forEach(function (n) {
      (petaNilai[n.SiswaID] = petaNilai[n.SiswaID] || {})[String(n.Komponen)] = n.Nilai;
    });

    const petaStatus = petaStatusSiswa(meta);
    const kunci = cekKunciNilai(meta.MapelID, meta.KelasID, meta.Semester);
    const ringkas = { Draft: 0, Submitted: 0, Validated: 0, Returned: 0 };

    const baris = siswa.map(function (s) {
      const nilai = petaNilai[s.ID] || {};
      const akhir = hitungNilaiAkhir(komponen, nilai);
      const st = (petaStatus[s.ID] || {}).Status || 'Draft';
      if (ringkas[st] !== undefined) ringkas[st]++;
      return {
        SiswaID: s.ID, NIM: s.NIM, Nama: s.Nama, FotoURL: s.FotoURL || '',
        nilai: nilai, nilaiAkhir: akhir.nilai, huruf: akhir.huruf,
        status: st, terkunci: st === 'Validated',
        catatan: (petaStatus[s.ID] || {}).Catatan || ''
      };
    });

    const komponenTersimpan = getCachedData('Komponen_Nilai', CACHE_TTL.SHORT).some(function (x) {
      return x.MapelID === meta.MapelID && x.KelasID === meta.KelasID &&
             String(x.Semester) === String(meta.Semester);
    });

    return createResponse(true, {
      komponen: komponen, baris: baris, ringkas: ringkas,
      tersimpanKomponen: komponenTersimpan,
      status: kunci.status, terkunci: kunci.terkunci, meta: kunci.row || null,
      kkm: Number((getCachedData('Institusi', CACHE_TTL.MASTER)[0] || {}).KKM) || 70
    }, 'OK');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/**
 * Perhitungan nilai akhir berbobot dari komponen dinamis.
 * @param {Array} komponen [{Nama, Bobot}]
 * @param {Object} nilaiMap { "<Nama Komponen>": angka }
 */
function hitungNilaiAkhir(komponen, nilaiMap) {
  let jml = 0, bobot = 0;
  (komponen || []).forEach(function (k) {
    const v = (nilaiMap || {})[k.Nama];
    if (v === '' || v === null || v === undefined) return;
    const b = Number(k.Bobot) || 0;
    jml += Number(v) * b; bobot += b;
  });
  const nilai = bobot ? Math.round((jml / bobot) * 100) / 100 : '';
  return { nilai: nilai, huruf: nilai === '' ? '' : hurufMutu(nilai),
           bobot: nilai === '' ? '' : bobotMutu(nilai) };
}

function hurufMutu(n) {
  n = Number(n);
  if (n >= 85) return 'A';
  if (n >= 75) return 'B';
  if (n >= 65) return 'C';
  if (n >= 50) return 'D';
  return 'E';
}

function bobotMutu(n) {
  const map = { A: 4, B: 3, C: 2, D: 1, E: 0 };
  return map[hurufMutu(n)];
}


/* ========================================================================== */
/* 14. REMEDIAL, PENGULANGAN & TRANSKRIP                                      */
/* ========================================================================== */

/** Menghasilkan/menyegarkan baris Transkrip untuk satu kelas + mapel. */
/**
 * Menyusun baris Transkrip untuk siswa yang nilainya baru divalidasi.
 * @param {Array<string>} siswaIds bila diisi, hanya siswa tersebut yang diproses
 */
function generateTranskripKelas(meta, siswaIds) {
  const ss = getSpreadsheet();
  let rekap = rekapNilaiInternal(meta);
  if (siswaIds && siswaIds.length) {
    rekap = rekap.filter(function (b) { return siswaIds.indexOf(b.SiswaID) !== -1; });
  }
  const mapel = getCachedData('Mata_Pelajaran', CACHE_TTL.MASTER)
                  .filter(function (m) { return m.ID === meta.MapelID; })[0] || {};
  const inst  = getCachedData('Institusi', CACHE_TTL.MASTER)[0] || {};
  const kkm   = Number(inst.KKM) || 70;

  const sheet = ss.getSheetByName('Transkrip');
  const headers = SHEET_SCHEMA['Transkrip'];
  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).getValues();
  const cSiswa = headers.indexOf('SiswaID'), cMapel = headers.indexOf('MapelID'), cSem = headers.indexOf('Semester');

  const idx = {};
  for (let r = 1; r < values.length; r++) idx[[values[r][cSiswa], values[r][cMapel], values[r][cSem]].join('|')] = r;

  const inserts = []; let changed = false; const perluRemedial = [];
  rekap.forEach(function (b) {
    if (b.nilaiAkhir === '') return;
    const rec = {
      ID: generateUUID(), SiswaID: b.SiswaID, MapelID: meta.MapelID, Semester: meta.Semester,
      TahunAjaran: meta.TahunAjaran, NilaiAkhir: b.nilaiAkhir, Huruf: b.huruf,
      Bobot: bobotMutu(b.nilaiAkhir), SKS: Number(mapel.SKS) || 0,
      Keterangan: b.nilaiAkhir < kkm ? 'Belum Tuntas' : 'Tuntas', GeneratedAt: new Date()
    };
    const k = [b.SiswaID, meta.MapelID, meta.Semester].join('|');
    if (idx[k] !== undefined) {
      const r = idx[k]; rec.ID = values[r][headers.indexOf('ID')];
      headers.forEach(function (h, c) { values[r][c] = rec[h]; });
      changed = true;
    } else {
      inserts.push(headers.map(function (h) { return rec[h]; }));
    }
    if (b.nilaiAkhir < kkm) perluRemedial.push({ SiswaID: b.SiswaID, Nilai: b.nilaiAkhir });
  });

  if (changed) sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  if (inserts.length) sheet.getRange(sheet.getLastRow() + 1, 1, inserts.length, headers.length).setValues(inserts);

  /* Usulan remedial otomatis untuk yang di bawah KKM */
  if (perluRemedial.length) {
    const remSheet = ss.getSheetByName('Remedial');
    const remHeaders = SHEET_SCHEMA['Remedial'];
    const existing = readSheetObjects('Remedial');
    const baru = perluRemedial.filter(function (p) {
      return !existing.some(function (e) {
        return e.SiswaID === p.SiswaID && e.MapelID === meta.MapelID && String(e.Semester) === String(meta.Semester);
      });
    }).map(function (p) {
      return remHeaders.map(function (h) {
        const rec = {
          ID: generateUUID(), SiswaID: p.SiswaID, MapelID: meta.MapelID, Semester: meta.Semester,
          TahunAjaran: meta.TahunAjaran, NilaiSebelum: p.Nilai, NilaiRemedial: '',
          AmbangBatas: kkm, Status: 'Diusulkan', Catatan: 'Otomatis: nilai di bawah KKM', CreatedAt: new Date()
        };
        return rec[h];
      });
    });
    if (baru.length) remSheet.getRange(remSheet.getLastRow() + 1, 1, baru.length, remHeaders.length).setValues(baru);
  }

  invalidateCacheMultiple(['Transkrip', 'Remedial']);
  return rekap;
}

/** Rekap nilai internal (server-side) memakai komponen bobot dinamis. */
function rekapNilaiInternal(meta) {
  const komponen = ambilKomponen(meta);
  const siswa = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                  .filter(function (s) { return s.KelasID === meta.KelasID; });
  const nt = readSheetObjects('Nilai_Tugas').filter(function (n) {
    return n.MapelID === meta.MapelID && n.KelasID === meta.KelasID &&
           String(n.Semester) === String(meta.Semester);
  });
  const peta = {};
  nt.forEach(function (n) {
    (peta[n.SiswaID] = peta[n.SiswaID] || {})[String(n.Komponen)] = n.Nilai;
  });
  return siswa.map(function (s) {
    const akhir = hitungNilaiAkhir(komponen, peta[s.ID] || {});
    return { SiswaID: s.ID, NIM: s.NIM, Nama: s.Nama,
             nilaiAkhir: akhir.nilai, huruf: akhir.huruf };
  });
}

/** US-20 — Tetapkan/perbarui remedial & pengulangan (batch). */
function apiKelolaRemedial(token, sheetName, items) {
  try {
    const sess = requireSession(token);
    if (['Super Admin', 'Tim Akademik'].indexOf(sess.peran) === -1) return createResponse(false, null, 'Akses ditolak.');
    if (['Remedial', 'Pengulangan_Matkul'].indexOf(sheetName) === -1) return createResponse(false, null, 'Sheet tidak valid.');
    return apiSave(token, sheetName, items);
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** US-19 — Unduh transkrip PDF per semester (atau seluruh semester). */
function apiTranskripPDF(token, siswaId, semester) {
  try {
    const sess = requireSession(token);
    let targetId = siswaId;
    if (sess.peran === 'Siswa') {
      const me = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                   .filter(function (s) { return s.PenggunaID === sess.userId; })[0];
      if (!me) return createResponse(false, null, 'Profil tidak ditemukan.');
      targetId = me.ID; // siswa hanya boleh mengunduh transkrip sendiri
    }

    const siswa = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                    .filter(function (s) { return s.ID === targetId; })[0];
    if (!siswa) return createResponse(false, null, 'Data siswa tidak ditemukan.');

    const inst  = getCachedData('Institusi', CACHE_TTL.MASTER)[0] || {};
    const mapel = getCachedData('Mata_Pelajaran', CACHE_TTL.MASTER);
    const kelas = getCachedData('Kelas', CACHE_TTL.MASTER)
                    .filter(function (k) { return k.ID === siswa.KelasID; })[0] || {};

    let rows = getCachedData('Transkrip', CACHE_TTL.SHORT)
                 .filter(function (t) { return t.SiswaID === targetId; });
    if (semester) rows = rows.filter(function (t) { return String(t.Semester) === String(semester); });
    if (!rows.length) return createResponse(false, null, 'Belum ada nilai tervalidasi untuk ditranskrip.');

    let totalBobot = 0, totalSks = 0;
    const trBody = rows.map(function (t, i) {
      const m = mapel.filter(function (x) { return x.ID === t.MapelID; })[0] || {};
      const sks = Number(t.SKS) || 0;
      totalSks += sks; totalBobot += (Number(t.Bobot) || 0) * sks;
      return '<tr><td>' + (i + 1) + '</td><td>' + (m.Kode || '-') + '</td><td>' + (m.Nama || '-') +
             '</td><td class="c">' + sks + '</td><td class="c">' + t.Semester + '</td><td class="c">' +
             t.NilaiAkhir + '</td><td class="c b">' + t.Huruf + '</td><td class="c">' + t.Bobot + '</td></tr>';
    }).join('');
    const ipk = totalSks ? (totalBobot / totalSks).toFixed(2) : '0.00';

    const html =
      '<html><head><meta charset="utf-8"><style>' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#0b1c30;margin:32px}' +
      'h1{font-size:20px;margin:0 0 2px;color:#022448}h2{font-size:13px;font-weight:normal;margin:0 0 18px;color:#43474e}' +
      '.hdr{border-bottom:3px solid #022448;padding-bottom:12px;margin-bottom:18px}' +
      'table{width:100%;border-collapse:collapse;font-size:12px}' +
      'th{background:#022448;color:#fff;padding:7px;text-align:left}' +
      'td{border-bottom:1px solid #dbe3ee;padding:7px}.c{text-align:center}.b{font-weight:bold}' +
      '.meta td{border:none;padding:2px 0;font-size:12px}' +
      '.sum{margin-top:16px;background:#e5eeff;padding:12px 14px;border-radius:8px;font-size:13px}' +
      '.ft{margin-top:28px;font-size:11px;color:#74777f}' +
      '</style></head><body>' +
      '<div class="hdr"><h1>' + escHtml(inst.NamaInstitusi || 'Institusi') + '</h1>' +
      '<h2>TRANSKRIP NILAI AKADEMIK' + (semester ? ' — SEMESTER ' + semester : '') + '</h2></div>' +
      '<table class="meta">' +
      '<tr><td width="130">Nama</td><td width="10">:</td><td><b>' + escHtml(siswa.Nama) + '</b></td></tr>' +
      '<tr><td>NIM / NIS</td><td>:</td><td>' + escHtml(siswa.NIM) + '</td></tr>' +
      '<tr><td>Kelas</td><td>:</td><td>' + escHtml(kelas.Nama || '-') + '</td></tr>' +
      '<tr><td>Tahun Ajaran</td><td>:</td><td>' + escHtml(inst.TahunAjaran || '-') + '</td></tr>' +
      '</table><br>' +
      '<table><thead><tr><th>No</th><th>Kode</th><th>Mata Kuliah / Pelajaran</th><th>SKS</th>' +
      '<th>Smt</th><th>Nilai</th><th>Huruf</th><th>Bobot</th></tr></thead><tbody>' + trBody + '</tbody></table>' +
      '<div class="sum"><b>Total SKS:</b> ' + totalSks + ' &nbsp;&nbsp;|&nbsp;&nbsp; <b>IPK / Rata-rata Bobot:</b> ' + ipk + '</div>' +
      '<div class="ft">Dicetak otomatis oleh ' + APP_NAME + ' pada ' + formatTanggalId(new Date()) + '. ' +
      'Dokumen ini sah tanpa tanda tangan basah.</div>' +
      '</body></html>';

    const pdf = Utilities.newBlob(html, 'text/html', 'transkrip.html').getAs('application/pdf');
    const nama = 'Transkrip_' + siswa.NIM + (semester ? '_Smt' + semester : '') + '.pdf';

    /* Simpan salinan ke Drive agar bisa dipratinjau di modal */
    const folder = getOrCreateFolder(getRootFolder(), 'Transkrip');
    const file = folder.createFile(pdf.setName(nama));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return createResponse(true, {
      fileName: nama,
      base64: Utilities.base64Encode(pdf.getBytes()),
      mimeType: 'application/pdf',
      previewUrl: 'https://drive.google.com/file/d/' + file.getId() + '/preview',
      ipk: ipk, totalSks: totalSks
    }, 'Transkrip berhasil dibuat.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

function escHtml(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


/* ========================================================================== */
/* 15. REKAM SUARA & RESUME PERTEMUAN (US-11a)                                */
/* ========================================================================== */

/**
 * Menyimpan hasil transkripsi suara, MERAPIKAN & MERINGKASNYA menjadi
 * resume pertemuan terstruktur, membuat Google Doc, lalu mendaftarkannya
 * sebagai Materi bertipe "Resume Pertemuan".
 *
 * Hak akses: Dosen pengampu, atau Siswa yang ditandai sebagai Ketua Kelas.
 */
function apiSimpanResumePertemuan(token, payload) {
  try {
    const sess = requireSession(token);
    const izin = cekIzinRekam(sess);
    if (!izin.boleh) return createResponse(false, null, izin.pesan);

    const transkrip = String(payload.Transkrip || '').trim();
    if (transkrip.length < 20) {
      return createResponse(false, null, 'Transkrip terlalu pendek untuk diringkas (minimal 20 karakter).');
    }

    const mapel = getCachedData('Mata_Pelajaran', CACHE_TTL.MASTER)
                    .filter(function (m) { return m.ID === payload.MapelID; })[0] || {};
    const kelas = getCachedData('Kelas', CACHE_TTL.MASTER)
                    .filter(function (k) { return k.ID === payload.KelasID; })[0] || {};

    /* --- Perapian & perangkuman otomatis --- */
    const resume = rapikanDanRingkas(transkrip, {
      judul: payload.Judul || 'Resume Pertemuan',
      mapel: mapel.Nama || '-',
      kelas: kelas.Nama || '-',
      pertemuan: payload.Pertemuan || 1,
      pengajar: sess.nama,
      durasi: payload.Durasi || ''
    });

    /* --- Buat Google Doc (sumber untuk PDF & DOCX) --- */
    const docInfo = buatDokumenResume(resume, payload, mapel, kelas, sess);

    const materiId = generateUUID();
    const resumeId = generateUUID();
    const ss = getSpreadsheet();

    upsertRow(ss, 'Materi', {
      ID: materiId,
      Judul: resume.judul,
      Deskripsi: resume.ringkasanSingkat,
      Jenis: 'Resume Pertemuan',
      URL: 'https://drive.google.com/file/d/' + docInfo.pdfId + '/preview',
      FileID: docInfo.pdfId,
      MimeType: 'application/pdf',
      MapelID: payload.MapelID,
      KelasID: payload.KelasID,
      Pertemuan: payload.Pertemuan || 1,
      DosenID: payload.DosenID || '',
      TanggalUpload: new Date()
    });

    upsertRow(ss, 'Resume_Pertemuan', {
      ID: resumeId, MateriID: materiId, MapelID: payload.MapelID, KelasID: payload.KelasID,
      Pertemuan: payload.Pertemuan || 1, Judul: resume.judul,
      Transkrip: transkrip.substring(0, 45000), Resume: resume.teks.substring(0, 45000),
      DocID: docInfo.docId, PdfID: docInfo.pdfId, Durasi: payload.Durasi || '',
      CreatedBy: sess.nama, CreatedAt: new Date()
    });

    invalidateCacheMultiple(['Materi', 'Resume_Pertemuan']);

    kirimNotifikasiKelas(payload.KelasID, 'Resume Pertemuan: ' + resume.judul,
      'Resume pertemuan ' + (payload.Pertemuan || 1) + ' mata kuliah ' + (mapel.Nama || '-') +
      ' sudah tersedia di Portal Belajar.');

    return createResponse(true, {
      resumeId: resumeId, materiId: materiId, docId: docInfo.docId, pdfId: docInfo.pdfId,
      judul: resume.judul, resumeTeks: resume.teks,
      previewUrl: 'https://drive.google.com/file/d/' + docInfo.pdfId + '/preview'
    }, 'Resume pertemuan berhasil dibuat dan dipublikasikan.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

function cekIzinRekam(sess) {
  if (sess.peran === 'Dosen' || sess.peran === 'Super Admin') return { boleh: true };
  if (sess.peran === 'Siswa') {
    const me = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                 .filter(function (s) { return s.PenggunaID === sess.userId; })[0];
    if (me && toBool(me.IsKetuaKelas)) return { boleh: true };
    return { boleh: false, pesan: 'Fitur rekam hanya untuk Dosen/Guru atau Ketua Kelas yang ditunjuk.' };
  }
  return { boleh: false, pesan: 'Akses ditolak.' };
}

/**
 * Merapikan transkrip mentah menjadi resume terstruktur:
 * normalisasi spasi → pemenggalan kalimat → pengelompokan paragraf →
 * ekstraksi poin kunci (kalimat berskor tertinggi berbasis frekuensi kata)
 * → istilah penting → butir tindak lanjut.
 */
function rapikanDanRingkas(raw, ctx) {
  /* 1. Normalisasi */
  let teks = raw.replace(/\s+/g, ' ').replace(/\s([,.!?;:])/g, '$1').trim();
  if (!/[.!?]$/.test(teks)) teks += '.';
  teks = teks.replace(/([.!?])\s*([a-z])/g, function (m, p, c) { return p + ' ' + c.toUpperCase(); });
  teks = teks.charAt(0).toUpperCase() + teks.slice(1);

  /* 2. Pemenggalan kalimat */
  const kalimat = teks.match(/[^.!?]+[.!?]+/g) || [teks];
  const bersih = kalimat.map(function (k) { return k.trim(); }).filter(function (k) { return k.length > 12; });

  /* 3. Frekuensi kata (tanpa stopword bahasa Indonesia) */
  const STOP = ('yang dan di ke dari untuk dengan pada adalah itu ini kita kami saya anda akan ada tidak ' +
    'atau juga dalam bisa dapat sudah telah agar karena jika maka sebagai oleh para lebih hanya masih ' +
    'nya kan sih ya nah jadi kalau seperti tentang saat ketika setelah sebelum antara secara sangat').split(' ');
  const freq = {};
  bersih.join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).forEach(function (w) {
    if (w.length < 4 || STOP.indexOf(w) !== -1) return;
    freq[w] = (freq[w] || 0) + 1;
  });

  const kataKunci = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 10);

  /* 4. Skoring kalimat → poin kunci */
  const skor = bersih.map(function (k, i) {
    let s = 0;
    const low = k.toLowerCase();
    kataKunci.forEach(function (w, wi) { if (low.indexOf(w) !== -1) s += (10 - wi); });
    if (i < 2) s += 4;                                   // pembuka biasanya konteks
    if (/(penting|kesimpulan|ingat|catat|tugas|ujian|rumus|definisi|contoh)/.test(low)) s += 8;
    return { i: i, k: k, s: s };
  }).sort(function (a, b) { return b.s - a.s; });

  const jumlahPoin = Math.min(8, Math.max(3, Math.round(bersih.length * 0.25)));
  const poin = skor.slice(0, jumlahPoin).sort(function (a, b) { return a.i - b.i; })
                   .map(function (o) { return o.k; });

  /* 5. Paragraf (gabung tiap 4 kalimat) */
  const paragraf = [];
  for (let i = 0; i < bersih.length; i += 4) paragraf.push(bersih.slice(i, i + 4).join(' '));

  /* 6. Tindak lanjut */
  const tindakLanjut = bersih.filter(function (k) {
    return /(tugas|kumpulkan|deadline|pekan depan|minggu depan|baca|pelajari|latihan|ujian|kuis)/i.test(k);
  }).slice(0, 6);

  const judul = ctx.judul + ' — Pertemuan ' + ctx.pertemuan;
  const ringkasanSingkat = poin.slice(0, 2).join(' ');

  const teksResume =
    'RESUME PERTEMUAN\n' +
    'Mata Kuliah/Pelajaran : ' + ctx.mapel + '\n' +
    'Kelas                 : ' + ctx.kelas + '\n' +
    'Pertemuan ke          : ' + ctx.pertemuan + '\n' +
    'Pengajar/Pencatat     : ' + ctx.pengajar + '\n' +
    (ctx.durasi ? 'Durasi Rekaman        : ' + ctx.durasi + '\n' : '') +
    'Tanggal               : ' + formatTanggalId(new Date()) + '\n\n' +
    'A. POIN-POIN KUNCI\n' + poin.map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n') + '\n\n' +
    'B. URAIAN PEMBAHASAN\n' + paragraf.join('\n\n') + '\n\n' +
    'C. ISTILAH & KATA KUNCI\n' + kataKunci.join(', ') + '\n\n' +
    (tindakLanjut.length ? 'D. TINDAK LANJUT\n' + tindakLanjut.map(function (t, i) { return '• ' + t; }).join('\n') + '\n' : '');

  return {
    judul: judul, teks: teksResume, poin: poin, paragraf: paragraf,
    kataKunci: kataKunci, tindakLanjut: tindakLanjut,
    ringkasanSingkat: ringkasanSingkat.substring(0, 250)
  };
}

/** Membuat Google Doc resume + salinan PDF di Drive. */
function buatDokumenResume(resume, payload, mapel, kelas, sess) {
  const folder = getOrCreateFolder(getRootFolder(), 'Resume_Pertemuan');
  const doc = DocumentApp.create(resume.judul);
  const body = doc.getBody();
  body.clear();

  body.appendParagraph(resume.judul).setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph((mapel.Nama || '-') + ' • ' + (kelas.Nama || '-') + ' • ' + formatTanggalId(new Date()))
      .setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

  body.appendParagraph('A. Poin-Poin Kunci').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  resume.poin.forEach(function (p) {
    body.appendListItem(p).setGlyphType(DocumentApp.GlyphType.NUMBER);
  });

  body.appendParagraph('B. Uraian Pembahasan').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  resume.paragraf.forEach(function (p) { body.appendParagraph(p); });

  body.appendParagraph('C. Istilah & Kata Kunci').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(resume.kataKunci.join(', ')).setItalic(true);

  if (resume.tindakLanjut.length) {
    body.appendParagraph('D. Tindak Lanjut').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    resume.tindakLanjut.forEach(function (t) {
      body.appendListItem(t).setGlyphType(DocumentApp.GlyphType.BULLET);
    });
  }

  body.appendParagraph('\nDibuat otomatis oleh ' + APP_NAME + ' • dicatat oleh ' + sess.nama)
      .setFontSize(9).setForegroundColor('#74777f');
  doc.saveAndClose();

  /* Pindahkan Doc ke folder aplikasi & buat PDF */
  const docFile = DriveApp.getFileById(doc.getId());
  folder.addFile(docFile);
  try { DriveApp.getRootFolder().removeFile(docFile); } catch (e) {}
  docFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const pdfFile = folder.createFile(docFile.getAs('application/pdf').setName(resume.judul + '.pdf'));
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { docId: doc.getId(), pdfId: pdfFile.getId() };
}

/**
 * Unduh resume dalam format PDF atau DOCX.
 * DOCX diambil melalui endpoint export Google Docs dengan token OAuth script.
 */
function apiUnduhResume(token, resumeId, format) {
  try {
    requireSession(token);
    const r = readSheetObjects('Resume_Pertemuan').filter(function (x) { return x.ID === resumeId; })[0];
    if (!r) return createResponse(false, null, 'Resume tidak ditemukan.');

    let blob, mime, ext;
    if (String(format).toLowerCase() === 'docx') {
      const url = 'https://docs.google.com/feeds/download/documents/export/Export?id=' +
                  r.DocID + '&exportFormat=docx';
      const res = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() !== 200) throw new Error('Gagal mengekspor DOCX (kode ' + res.getResponseCode() + ').');
      blob = res.getBlob();
      mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      ext = '.docx';
    } else {
      blob = DriveApp.getFileById(r.PdfID).getBlob();
      mime = 'application/pdf';
      ext = '.pdf';
    }

    return createResponse(true, {
      fileName: String(r.Judul).replace(/[\\/:*?"<>|]/g, '_') + ext,
      mimeType: mime,
      base64: Utilities.base64Encode(blob.getBytes())
    }, 'Berkas siap diunduh.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Ambil detail resume (untuk pratinjau & pengeditan sebelum publikasi ulang). */
function apiGetResume(token, resumeId) {
  try {
    requireSession(token);
    const r = readSheetObjects('Resume_Pertemuan').filter(function (x) { return x.ID === resumeId; })[0];
    if (!r) return createResponse(false, null, 'Resume tidak ditemukan.');
    return createResponse(true, r, 'OK');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Pratinjau ringkasan TANPA menyimpan — dipakai tombol "Rapikan & Ringkas". */
function apiPratinjauRingkasan(token, transkrip, ctx) {
  try {
    const sess = requireSession(token);
    const izin = cekIzinRekam(sess);
    if (!izin.boleh) return createResponse(false, null, izin.pesan);
    const mapel = getCachedData('Mata_Pelajaran', CACHE_TTL.MASTER)
                    .filter(function (m) { return m.ID === (ctx || {}).MapelID; })[0] || {};
    const kelas = getCachedData('Kelas', CACHE_TTL.MASTER)
                    .filter(function (k) { return k.ID === (ctx || {}).KelasID; })[0] || {};
    const resume = rapikanDanRingkas(String(transkrip || ''), {
      judul: (ctx || {}).Judul || 'Resume Pertemuan', mapel: mapel.Nama || '-',
      kelas: kelas.Nama || '-', pertemuan: (ctx || {}).Pertemuan || 1,
      pengajar: sess.nama, durasi: (ctx || {}).Durasi || ''
    });
    return createResponse(true, resume, 'Ringkasan dibuat.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}


/* ========================================================================== */
/* 16. SPP, JADWAL, LAPORAN & NOTIFIKASI                                      */
/* ========================================================================== */

/**
 * US-23/24 + Upgrade 10 — Terbitkan tagihan (SPP maupun jenis lain) secara massal.
 * meta: { JenisID, Periode, Nominal, Catatan, target, targetId, siswaIds }
 * target: 'semua' | 'jurusan' | 'kelas' | 'siswa'
 */
function apiTerbitkanTagihan(token, meta) {
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Super Admin') return createResponse(false, null, 'Akses ditolak.');
    const inst = getCachedData('Institusi', CACHE_TTL.MASTER)[0] || {};
    if (!toBool(inst.FiturSPP)) return createResponse(false, null, 'Fitur manajemen tagihan tidak aktif.');

    const jenis = getCachedData('Jenis_Tagihan', CACHE_TTL.MASTER)
                    .filter(function (j) { return j.ID === meta.JenisID; })[0];
    if (!jenis) return createResponse(false, null, 'Pilih jenis tagihan terlebih dahulu.');
    if (!meta.Periode) return createResponse(false, null, 'Periode tagihan wajib diisi.');
    const nominal = Number(meta.Nominal) || Number(jenis.NominalDefault) || 0;
    if (nominal <= 0) return createResponse(false, null, 'Nominal tagihan harus lebih besar dari 0.');

    /* --- Tentukan penerima sesuai sasaran --- */
    const semua = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                    .filter(function (s) { return String(s.Status).toLowerCase() === 'aktif'; });
    let penerima;
    if (meta.target === 'kelas')        penerima = semua.filter(function (s) { return s.KelasID === meta.targetId; });
    else if (meta.target === 'jurusan') penerima = semua.filter(function (s) { return s.JurusanID === meta.targetId; });
    else if (meta.target === 'siswa')   penerima = semua.filter(function (s) { return (meta.siswaIds || []).indexOf(s.ID) !== -1; });
    else                                penerima = semua;

    if (!penerima.length) return createResponse(false, null, 'Tidak ada mahasiswa aktif pada sasaran tersebut.');

    /* --- Cegah tagihan ganda: jenis + periode yang sama --- */
    const sudahAda = {};
    readSheetObjects('SPP_Tagihan').forEach(function (t) {
      if (t.JenisID === meta.JenisID && String(t.Periode) === String(meta.Periode)) sudahAda[t.SiswaID] = true;
    });
    const baru = penerima.filter(function (s) { return !sudahAda[s.ID]; });
    if (!baru.length) {
      return createResponse(false, null, 'Seluruh mahasiswa pada sasaran ini sudah memiliki tagihan ' +
        jenis.Nama + ' periode ' + meta.Periode + '.');
    }

    const rows = baru.map(function (s) {
      return { ID: generateUUID(), SiswaID: s.ID, JenisID: jenis.ID, JenisNama: jenis.Nama,
               Periode: meta.Periode, Nominal: nominal, StatusBayar: 'Belum Bayar',
               TanggalBayar: '', BuktiURL: '', Catatan: meta.Catatan || '', CreatedAt: new Date() };
    });

    appendRows(getSpreadsheet().getSheetByName('SPP_Tagihan'), 'SPP_Tagihan', rows);
    invalidateCache('SPP_Tagihan');

    kirimNotifikasiBatch(baru, 'Tagihan ' + jenis.Nama + ' — ' + meta.Periode,
      'Tagihan ' + jenis.Nama + ' periode ' + meta.Periode + ' sebesar Rp' +
      nominal.toLocaleString('id-ID') + ' telah diterbitkan. Silakan cek menu Status Tagihan.');

    const lewat = penerima.length - baru.length;
    return createResponse(true, { total: rows.length, dilewati: lewat },
      rows.length + ' tagihan ' + jenis.Nama + ' diterbitkan.' +
      (lewat ? ' ' + lewat + ' mahasiswa dilewati karena sudah memiliki tagihan serupa.' : ''));
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Menghitung jumlah penerima untuk pratinjau sebelum tagihan diterbitkan. */
function apiHitungPenerimaTagihan(token, target, targetId) {
  try {
    requireSession(token);
    const semua = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                    .filter(function (s) { return String(s.Status).toLowerCase() === 'aktif'; });
    let n;
    if (target === 'kelas')        n = semua.filter(function (s) { return s.KelasID === targetId; }).length;
    else if (target === 'jurusan') n = semua.filter(function (s) { return s.JurusanID === targetId; }).length;
    else                           n = semua.length;
    return createResponse(true, { jumlah: n }, 'OK');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Super Admin menandai tagihan lunas + unggah bukti. */
function apiTandaiLunasSPP(token, tagihanId, file, catatan) {
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Super Admin') return createResponse(false, null, 'Akses ditolak.');
    const row = readSheetObjects('SPP_Tagihan').filter(function (t) { return t.ID === tagihanId; })[0];
    if (!row) return createResponse(false, null, 'Tagihan tidak ditemukan.');

    let bukti = row.BuktiURL || '';
    if (file && file.data) bukti = simpanBerkas(file, 'Bukti_SPP', row.Periode).previewUrl;

    row.StatusBayar = 'Lunas';
    row.TanggalBayar = new Date();
    row.BuktiURL = bukti;
    row.Catatan = catatan || row.Catatan;
    upsertRow(getSpreadsheet(), 'SPP_Tagihan', row);
    invalidateCache('SPP_Tagihan');
    return createResponse(true, row, 'Tagihan ditandai LUNAS.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** US-04 — Deteksi konflik jadwal (dosen & ruangan bentrok). */
function apiCekKonflikJadwal(token, kandidat) {
  try {
    requireSession(token);
    const jadwal = getCachedData('Jadwal', CACHE_TTL.MASTER);
    const toMin = function (t) {
      const p = String(t || '0:0').split(':');
      return parseInt(p[0], 10) * 60 + parseInt(p[1] || '0', 10);
    };
    const s1 = toMin(kandidat.JamMulai), e1 = toMin(kandidat.JamSelesai);
    if (e1 <= s1) return createResponse(false, null, 'Jam selesai harus setelah jam mulai.');

    const bentrok = jadwal.filter(function (j) {
      if (kandidat.ID && j.ID === kandidat.ID) return false;
      if (j.Hari !== kandidat.Hari) return false;
      const s2 = toMin(j.JamMulai), e2 = toMin(j.JamSelesai);
      const overlap = s1 < e2 && s2 < e1;
      if (!overlap) return false;
      return j.DosenID === kandidat.DosenID || j.Ruangan === kandidat.Ruangan || j.KelasID === kandidat.KelasID;
    }).map(function (j) {
      const alasan = [];
      if (j.DosenID === kandidat.DosenID) alasan.push('pengampu sama');
      if (j.Ruangan === kandidat.Ruangan) alasan.push('ruangan sama');
      if (j.KelasID === kandidat.KelasID) alasan.push('kelas sama');
      return { jadwal: j, alasan: alasan.join(', ') };
    });

    return createResponse(true, { konflik: bentrok, aman: bentrok.length === 0 },
      bentrok.length ? 'Terdeteksi ' + bentrok.length + ' konflik jadwal.' : 'Tidak ada konflik.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** US-25/26/27 — Data laporan terfilter (server-side agar payload kecil). */
function apiLaporan(token, jenis, filter) {
  try {
    const sess = requireSession(token);
    filter = filter || {};
    const cocok = function (row) {
      if (filter.KelasID && row.KelasID !== filter.KelasID) return false;
      if (filter.MapelID && row.MapelID !== filter.MapelID) return false;
      if (filter.Semester && String(row.Semester) !== String(filter.Semester)) return false;
      if (filter.dari && row.Tanggal && new Date(row.Tanggal) < new Date(filter.dari)) return false;
      if (filter.sampai && row.Tanggal && new Date(row.Tanggal) > new Date(filter.sampai)) return false;
      return true;
    };

    if (jenis === 'absensi') {
      const rows = getCachedData('Absensi', CACHE_TTL.SHORT).filter(cocok);
      const rekap = { Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0 };
      rows.forEach(function (r) { if (rekap[r.Status] !== undefined) rekap[r.Status]++; });
      return createResponse(true, { rows: rows, rekap: rekap }, 'OK');
    }
    if (jenis === 'nilai') {
      const rows = getCachedData('Transkrip', CACHE_TTL.SHORT).filter(cocok);
      const dist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
      rows.forEach(function (r) { const h = String(r.Huruf).charAt(0); if (dist[h] !== undefined) dist[h]++; });
      return createResponse(true, { rows: rows, distribusi: dist }, 'OK');
    }
    if (jenis === 'tugas') {
      const tugas = getCachedData('Tugas_Quiz', CACHE_TTL.SEMI).filter(cocok);
      const ids = tugas.map(function (t) { return t.ID; });
      const kirim = getCachedData('Pengumpulan_Tugas', CACHE_TTL.SHORT)
                      .filter(function (p) { return ids.indexOf(p.TugasID) !== -1; });
      const tepat = kirim.filter(function (p) { return !toBool(p.Keterlambatan); }).length;
      return createResponse(true, {
        rows: tugas, pengumpulan: kirim,
        rekap: { tepat: tepat, telat: kirim.length - tepat, total: kirim.length }
      }, 'OK');
    }
    if (jenis === 'remedial') {
      const rows = getCachedData('Remedial', CACHE_TTL.SHORT).filter(cocok);
      return createResponse(true, { rows: rows }, 'OK');
    }
    if (jenis === 'spp') {
      if (sess.peran !== 'Super Admin') return createResponse(false, null, 'Akses ditolak.');
      const rows = getCachedData('SPP_Tagihan', CACHE_TTL.SHORT);
      const lunas = rows.filter(function (r) { return r.StatusBayar === 'Lunas'; }).length;
      return createResponse(true, { rows: rows, rekap: { lunas: lunas, belum: rows.length - lunas } }, 'OK');
    }
    return createResponse(false, null, 'Jenis laporan tidak dikenal.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Segarkan sebagian data (dipanggil setelah aksi tulis dari client). */
function apiRefresh(token, sheetNames) {
  try {
    requireSession(token);
    const out = {};
    (sheetNames || []).forEach(function (n) {
      if (SHEET_SCHEMA[n]) out[n] = getCachedData(n, CACHE_TTL.SHORT);
    });
    return createResponse(true, out, 'OK');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}


/* ========================================================================== */
/* 17. NOTIFIKASI (EMAIL + WHATSAPP GATEWAY)                                  */
/* ========================================================================== */

/** Kirim ke seluruh siswa dalam satu kelas. */
function kirimNotifikasiKelas(kelasId, subjek, pesan) {
  try {
    const siswa = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                    .filter(function (s) { return s.KelasID === kelasId && String(s.Status).toLowerCase() === 'aktif'; });
    kirimNotifikasiBatch(siswa, subjek, pesan);
  } catch (err) { Logger.log('kirimNotifikasiKelas: ' + err.message); }
}

/** Kirim ke seluruh pengguna dengan peran tertentu. */
function kirimNotifikasiPeran(peran, subjek, pesan) {
  try {
    const users = getCachedData('Pengguna', CACHE_TTL.MASTER)
                    .filter(function (u) { return u.Peran === peran && String(u.Status).toLowerCase() === 'aktif'; });
    kirimNotifikasiBatch(users, subjek, pesan);
  } catch (err) { Logger.log('kirimNotifikasiPeran: ' + err.message); }
}

/**
 * Pengiriman batch Email + WhatsApp.
 * Log ditulis SEKALI dengan setValues() (bukan per penerima).
 */
function kirimNotifikasiBatch(penerima, subjek, pesan) {
  const inst = getCachedData('Institusi', CACHE_TTL.MASTER)[0] || {};
  const pakaiEmail = toBool(inst.NotifEmail);
  const pakaiWA    = toBool(inst.NotifWA) && inst.WAGatewayToken;
  if (!penerima || !penerima.length) return;

  const logs = [];
  const kuotaEmail = MailApp.getRemainingDailyQuota();
  let terkirim = 0;

  penerima.forEach(function (p) {
    /* --- Email --- */
    if (pakaiEmail && p.Email && terkirim < kuotaEmail - 5) {
      try {
        MailApp.sendEmail({
          to: p.Email,
          subject: '[' + (inst.NamaInstitusi || APP_NAME) + '] ' + subjek,
          htmlBody: templateEmail(inst, p.Nama, subjek, pesan)
        });
        terkirim++;
        logs.push({ ID: generateUUID(), Penerima: p.Nama, Kontak: p.Email, Channel: 'Email',
                    Subjek: subjek, Pesan: pesan, Status: 'Terkirim', Timestamp: new Date() });
      } catch (err) {
        logs.push({ ID: generateUUID(), Penerima: p.Nama, Kontak: p.Email, Channel: 'Email',
                    Subjek: subjek, Pesan: pesan, Status: 'Gagal: ' + err.message, Timestamp: new Date() });
      }
    }
    /* --- WhatsApp Gateway (Fonnte / WA Business API) --- */
    if (pakaiWA && p.NoHP) {
      try {
        const res = UrlFetchApp.fetch(inst.WAGatewayURL || 'https://api.fonnte.com/send', {
          method: 'post',
          headers: { Authorization: inst.WAGatewayToken },
          payload: { target: normalisasiNoHP(p.NoHP), message: subjek + '\n\n' + pesan },
          muteHttpExceptions: true
        });
        logs.push({ ID: generateUUID(), Penerima: p.Nama, Kontak: p.NoHP, Channel: 'WA',
                    Subjek: subjek, Pesan: pesan,
                    Status: res.getResponseCode() === 200 ? 'Terkirim' : 'Gagal (' + res.getResponseCode() + ')',
                    Timestamp: new Date() });
      } catch (err) {
        logs.push({ ID: generateUUID(), Penerima: p.Nama, Kontak: p.NoHP, Channel: 'WA',
                    Subjek: subjek, Pesan: pesan, Status: 'Gagal: ' + err.message, Timestamp: new Date() });
      }
    }
  });

  if (logs.length) {
    try {
      appendRows(getSpreadsheet().getSheetByName('Log_Notifikasi'), 'Log_Notifikasi', logs); // 1 write
      invalidateCache('Log_Notifikasi');
    } catch (err) { Logger.log('Log notifikasi gagal: ' + err.message); }
  }
}

function normalisasiNoHP(no) {
  let n = String(no).replace(/[^0-9]/g, '');
  if (n.indexOf('0') === 0) n = '62' + n.substring(1);
  if (n.indexOf('62') !== 0) n = '62' + n;
  return n;
}

function templateEmail(inst, nama, subjek, pesan) {
  return '<div style="font-family:Inter,Arial,sans-serif;background:#f8f9ff;padding:24px">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;' +
    'border:1px solid #dbe3ee">' +
    '<div style="background:#022448;color:#fff;padding:20px 24px">' +
    '<div style="font-size:18px;font-weight:700">' + escHtml(inst.NamaInstitusi || APP_NAME) + '</div>' +
    '<div style="font-size:12px;opacity:.75">' + APP_TAGLINE + '</div></div>' +
    '<div style="padding:24px;color:#0b1c30;font-size:14px;line-height:1.6">' +
    '<p>Halo <b>' + escHtml(nama) + '</b>,</p>' +
    '<p style="font-size:16px;font-weight:600;color:#022448">' + escHtml(subjek) + '</p>' +
    '<p>' + escHtml(pesan) + '</p>' +
    '<p style="margin-top:24px;color:#43474e">Silakan masuk ke portal untuk detail selengkapnya.</p></div>' +
    '<div style="padding:14px 24px;background:#eff4ff;color:#74777f;font-size:11px">' +
    'Pesan otomatis dari ' + APP_NAME + '. Mohon tidak membalas email ini.</div></div></div>';
}

/**
 * Broadcast pengumuman manual oleh Super Admin.
 * tujuan: '__ALL_SISWA__' | '__ALL_DOSEN__' | '__ALL_AKADEMIK__' | <KelasID>
 */
function apiBroadcast(token, tujuan, subjek, pesan) {
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Super Admin') return createResponse(false, null, 'Akses ditolak.');
    if (!subjek || !pesan) return createResponse(false, null, 'Subjek dan isi pesan wajib diisi.');

    let penerima;
    if (tujuan === '__ALL_SISWA__') {
      penerima = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                   .filter(function (s) { return String(s.Status).toLowerCase() === 'aktif'; });
    } else if (tujuan === '__ALL_DOSEN__') {
      penerima = getCachedData('Dosen_Guru', CACHE_TTL.MASTER);
    } else if (tujuan === '__ALL_AKADEMIK__') {
      penerima = getCachedData('Pengguna', CACHE_TTL.MASTER)
                   .filter(function (u) { return u.Peran === 'Tim Akademik'; });
    } else {
      penerima = getCachedData('Siswa_Mahasiswa', CACHE_TTL.MASTER)
                   .filter(function (s) { return s.KelasID === tujuan; });
    }

    if (!penerima.length) return createResponse(false, null, 'Tidak ada penerima pada tujuan tersebut.');
    kirimNotifikasiBatch(penerima, subjek, pesan);
    return createResponse(true, { total: penerima.length },
      'Pengumuman diproses untuk ' + penerima.length + ' penerima. Cek Riwayat Pengiriman untuk statusnya.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Uji kirim notifikasi dari halaman Pengaturan. */
function apiTesNotifikasi(token, tujuanEmail, tujuanWA) {
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Super Admin') return createResponse(false, null, 'Akses ditolak.');
    kirimNotifikasiBatch([{ Nama: sess.nama, Email: tujuanEmail || sess.email, NoHP: tujuanWA || '' }],
      'Tes Notifikasi', 'Ini adalah pesan uji coba dari ' + APP_NAME + '. Jika Anda menerimanya, konfigurasi sudah benar.');
    return createResponse(true, null, 'Pesan uji dikirim. Cek Log Notifikasi untuk statusnya.');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/** Pengingat otomatis H-1 tenggat tugas & absensi (pasang Time-driven Trigger harian). */
function triggerPengingatHarian() {
  try {
    const besok = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tugas = readSheetObjects('Tugas_Quiz').filter(function (t) {
      const d = new Date(t.Deadline);
      return d.toDateString() === besok.toDateString() && String(t.Status).toLowerCase() === 'aktif';
    });
    tugas.forEach(function (t) {
      kirimNotifikasiKelas(t.KelasID, 'Pengingat: Tugas "' + t.Judul + '" jatuh tempo besok',
        'Tenggat pengumpulan: ' + formatTanggalId(t.Deadline) + '. Jangan sampai terlambat.');
    });
    Logger.log('Pengingat harian: ' + tugas.length + ' tugas diproses.');
  } catch (err) { Logger.log('triggerPengingatHarian: ' + err.message); }
}


/* ========================================================================== */
/* 18. UTILITAS BERSAMA                                                       */
/* ========================================================================== */

/** Upsert satu baris berdasarkan ID (baca 1x, tulis 1x). */
function upsertRow(ss, sheetName, record) {
  const sheet = ss.getSheetByName(sheetName);
  const headers = SHEET_SCHEMA[sheetName];
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const values = sheet.getRange(1, 1, lastRow, headers.length).getValues();
  const r = findRowIndexById(values, headers, record.ID);
  const row = headers.map(function (h) {
    return record[h] === undefined || record[h] === null ? '' : record[h];
  });
  if (r > 0) sheet.getRange(r + 1, 1, 1, headers.length).setValues([row]);
  else sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
  return record;
}

const NAMA_BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni',
                       'Juli','Agustus','September','Oktober','November','Desember'];

function formatTanggalId(d) {
  if (!d) return '-';
  const t = (d instanceof Date) ? d : new Date(d);
  if (isNaN(t.getTime())) return String(d);
  const jam = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
  return t.getDate() + ' ' + NAMA_BULAN_ID[t.getMonth()] + ' ' + t.getFullYear() + ', ' + jam;
}

/* ========================================================================== */
/* 19. IMPOR DATA MASSAL DARI EXCEL / CSV (Upgrade 4, 5, 9)                    */
/* ========================================================================== */

/**
 * Spesifikasi impor per jenis data.
 *  kolom  : nama kolom pada templat (baris pertama file Excel)
 *  wajib  : kolom yang tidak boleh kosong
 *  unik   : kolom penentu duplikat (data lama diperbarui, bukan diduplikasi)
 *  ref    : kolom templat yang berisi KODE dan harus diterjemahkan ke ID
 */
const SPEK_IMPOR = {
  siswa: {
    sheet: 'Siswa_Mahasiswa', label: 'Siswa / Mahasiswa', unik: 'NIM',
    kolom: ['NIM','Nama','Email','NoHP','KodeKelas','KodeJurusan','Angkatan','JenisKelamin',
            'TanggalLahir','Alamat','NamaWali','NoHPWali','IsKetuaKelas','Status'],
    wajib: ['NIM','Nama'],
    ref: { KodeKelas: { sheet: 'Kelas', kolom: 'Kode', ke: 'KelasID' },
           KodeJurusan: { sheet: 'Jurusan_Prodi', kolom: 'Kode', ke: 'JurusanID' } },
    contoh: ['2026010002','Budi Santoso','budi@kampus.ac.id','081234567890','TI-2026-A','TI',
             '2026','Laki-laki','2007-05-14','Jl. Merdeka 10','Santoso','081234567891','FALSE','Aktif']
  },
  dosen: {
    sheet: 'Dosen_Guru', label: 'Dosen / Guru', unik: 'NIDN',
    kolom: ['NIDN','Nama','Gelar','Email','NoHP','KodeJurusan','Alamat','Status'],
    wajib: ['Nama','Email'],
    ref: { KodeJurusan: { sheet: 'Jurusan_Prodi', kolom: 'Kode', ke: 'JurusanID' } },
    contoh: ['0011223355','Siti Rahmawati','S.Pd., M.Pd.','siti@kampus.ac.id','081298765432','TI',
             'Jl. Cempaka 5','Aktif']
  },
  mapel: {
    sheet: 'Mata_Pelajaran', label: 'Mata Pelajaran / Kuliah', unik: 'Kode',
    kolom: ['Kode','Nama','SKS','KodeKurikulum','KodeJurusan','Jenjang','Kategori','Deskripsi','Status'],
    wajib: ['Kode','Nama','SKS'],
    ref: { KodeKurikulum: { sheet: 'Kurikulum', kolom: 'Kode', ke: 'KurikulumID' },
           KodeJurusan: { sheet: 'Jurusan_Prodi', kolom: 'Kode', ke: 'JurusanID' } },
    contoh: ['FIS-201','Fisika Dasar II','3','KUR-2026','TI','S1','Wajib','Mekanika lanjutan','Aktif']
  },
  kelas: {
    sheet: 'Kelas', label: 'Kelas', unik: 'Kode',
    kolom: ['Kode','Nama','KodeJurusan','Angkatan','NIDNWaliKelas','Ruangan','Kapasitas','Status'],
    wajib: ['Kode','Nama'],
    ref: { KodeJurusan: { sheet: 'Jurusan_Prodi', kolom: 'Kode', ke: 'JurusanID' },
           NIDNWaliKelas: { sheet: 'Dosen_Guru', kolom: 'NIDN', ke: 'WaliKelasID' } },
    contoh: ['TI-2026-B','TI Angkatan 2026 Kelas B','TI','2026','0011223344','Ruang 303','40','Aktif']
  },
  jadwal: {
    sheet: 'Jadwal', label: 'Jadwal Pembelajaran', unik: null,
    kolom: ['Hari','JamMulai','JamSelesai','KodeMapel','KodeKelas','NIDNDosen','Ruangan','Semester','TahunAjaran'],
    wajib: ['Hari','JamMulai','JamSelesai','KodeMapel','KodeKelas','NIDNDosen'],
    ref: { KodeMapel: { sheet: 'Mata_Pelajaran', kolom: 'Kode', ke: 'MapelID' },
           KodeKelas: { sheet: 'Kelas', kolom: 'Kode', ke: 'KelasID' },
           NIDNDosen: { sheet: 'Dosen_Guru', kolom: 'NIDN', ke: 'DosenID' } },
    contoh: ['Selasa','08:00','09:40','FIS-201','TI-2026-B','0011223344','Lab 2','1','2026/2027']
  },
  jurusan: {
    sheet: 'Jurusan_Prodi', label: 'Jurusan / Program Studi', unik: 'Kode',
    kolom: ['Kode','Nama','Jenjang','Keterangan','Status'],
    wajib: ['Kode','Nama'], ref: {},
    contoh: ['SI','Sistem Informasi','S1','Program studi baru','Aktif']
  }
};

/** Mengembalikan definisi templat impor untuk ditampilkan/diunduh klien. */
function apiSpekImpor(token) {
  try {
    requireSession(token);
    const out = {};
    Object.keys(SPEK_IMPOR).forEach(function (k) {
      out[k] = { label: SPEK_IMPOR[k].label, kolom: SPEK_IMPOR[k].kolom,
                 wajib: SPEK_IMPOR[k].wajib, unik: SPEK_IMPOR[k].unik,
                 contoh: SPEK_IMPOR[k].contoh };
    });
    return createResponse(true, out, 'OK');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/**
 * Memvalidasi & menyimpan hasil impor.
 * Baris yang gagal dilaporkan lengkap dengan nomor barisnya; baris yang benar
 * tetap tersimpan sehingga pengguna tidak perlu mengulang dari nol.
 */
function apiImportData(token, jenis, rows) {
  const lock = LockService.getScriptLock();
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Super Admin') return createResponse(false, null, 'Hanya Super Admin yang dapat mengimpor data.');

    const spek = SPEK_IMPOR[jenis];
    if (!spek) return createResponse(false, null, 'Jenis impor tidak dikenal.');
    if (!rows || !rows.length) return createResponse(false, null, 'Tidak ada baris data untuk diimpor.');
    if (rows.length > 1000) return createResponse(false, null, 'Maksimal 1.000 baris per impor. Bagi berkas menjadi beberapa bagian.');

    /* --- Bangun kamus referensi KODE → ID --- */
    const kamus = {};
    Object.keys(spek.ref).forEach(function (kolomTemplat) {
      const r = spek.ref[kolomTemplat];
      const peta = {};
      getCachedData(r.sheet, CACHE_TTL.MASTER).forEach(function (x) {
        const kunci = String(x[r.kolom] || '').trim().toLowerCase();
        if (kunci) peta[kunci] = x.ID;
      });
      kamus[kolomTemplat] = peta;
    });

    /* --- Data eksisting untuk deteksi duplikat --- */
    const eksisting = {};
    if (spek.unik) {
      readSheetObjects(spek.sheet).forEach(function (x) {
        const k = String(x[spek.unik] || '').trim().toLowerCase();
        if (k) eksisting[k] = x;
      });
    }

    const valid = [], galat = [];
    rows.forEach(function (baris, i) {
      const nomor = i + 2; // baris 1 = header
      const rec = {};
      const pesan = [];

      spek.kolom.forEach(function (k) {
        let v = baris[k];
        if (v === undefined || v === null) v = '';
        v = typeof v === 'string' ? v.trim() : v;

        const ref = spek.ref[k];
        if (ref) {
          if (v === '') { rec[ref.ke] = ''; return; }
          const id = kamus[k][String(v).toLowerCase()];
          if (!id) pesan.push('kode "' + v + '" pada kolom ' + k + ' tidak ditemukan');
          else rec[ref.ke] = id;
          return;
        }
        if (k === 'NoHP' || k === 'NoHPWali') v = normalisasiHPSimpan(v);
        if (k === 'IsKetuaKelas') v = toBool(v) ? 'TRUE' : 'FALSE';
        rec[k] = v;
      });

      spek.wajib.forEach(function (w) {
        if (rec[w] === '' || rec[w] === undefined) pesan.push('kolom wajib ' + w + ' kosong');
      });

      if (!rec.Status) rec.Status = 'Aktif';

      /* Perbarui data lama bila kunci uniknya sudah ada */
      if (spek.unik) {
        const lama = eksisting[String(rec[spek.unik] || '').trim().toLowerCase()];
        if (lama) rec.ID = lama.ID;
      }

      if (pesan.length) galat.push({ baris: nomor, pesan: pesan.join('; '),
                                     isi: rec[spek.unik || 'Nama'] || '' });
      else valid.push(rec);
    });

    if (!valid.length) {
      return createResponse(false, { galat: galat, tersimpan: 0 },
        'Tidak ada baris yang lolos validasi. Perbaiki ' + galat.length + ' kesalahan lalu unggah ulang.');
    }

    lock.waitLock(30000);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(spek.sheet);
    const headers = SHEET_SCHEMA[spek.sheet];
    const nilai = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).getValues();
    const cId = headers.indexOf('ID');
    const petaBaris = {};
    for (let r = 1; r < nilai.length; r++) petaBaris[String(nilai[r][cId])] = r;

    const sisip = [], perbarui = [];
    valid.forEach(function (rec) {
      if (rec.ID && petaBaris[String(rec.ID)] !== undefined) {
        const r = petaBaris[String(rec.ID)];
        headers.forEach(function (h, c) { if (rec[h] !== undefined && rec[h] !== '') nilai[r][c] = rec[h]; });
        perbarui.push({ rowNumber: r + 1, values: nilai[r] });
      } else {
        rec.ID = rec.ID || generateUUID();
        if (headers.indexOf('CreatedAt') !== -1) rec.CreatedAt = new Date();
        sisip.push(headers.map(function (h) { return rec[h] === undefined ? '' : rec[h]; }));
      }
    });

    if (sisip.length) sheet.getRange(sheet.getLastRow() + 1, 1, sisip.length, headers.length).setValues(sisip);
    writeUpdatesGrouped(sheet, perbarui, headers.length);
    terapkanFormatTeks(sheet, spek.sheet);
    invalidateCache(spek.sheet);
    lock.releaseLock();

    /* Buat akun portal otomatis untuk siswa & dosen hasil impor (Upgrade 8) */
    let hook = { pesan: '' };
    if (spek.sheet === 'Siswa_Mahasiswa') hook = sinkronAkunProfil('Siswa', valid);
    if (spek.sheet === 'Dosen_Guru')      hook = sinkronAkunProfil('Dosen', valid);

    return createResponse(true, {
      tersimpan: valid.length, baru: sisip.length, diperbarui: perbarui.length,
      galat: galat, akunDibuat: hook.akunDibuat || 0
    }, valid.length + ' baris diimpor (' + sisip.length + ' baru, ' + perbarui.length + ' diperbarui)' +
       (galat.length ? ', ' + galat.length + ' baris dilewati karena bermasalah' : '') + '. ' + (hook.pesan || ''));
  } catch (error) {
    try { lock.releaseLock(); } catch (e) {}
    return createResponse(false, null, error.message);
  }
}


/* ========================================================================== */
/* 20. KOMPONEN BOBOT NILAI DINAMIS (Upgrade 15)                              */
/* ========================================================================== */

/** Komponen bawaan bila dosen belum pernah mengatur bobot untuk kelas ini. */
function komponenDefault(meta) {
  return [
    { Nama: 'Tugas', Bobot: 30, Urutan: 1 },
    { Nama: 'UTS',   Bobot: 30, Urutan: 2 },
    { Nama: 'UAS',   Bobot: 40, Urutan: 3 }
  ].map(function (k) {
    return Object.assign({ ID: generateUUID(), MapelID: meta.MapelID, KelasID: meta.KelasID,
                           Semester: meta.Semester, TahunAjaran: meta.TahunAjaran }, k);
  });
}

function ambilKomponen(meta) {
  const rows = getCachedData('Komponen_Nilai', CACHE_TTL.SHORT).filter(function (k) {
    return k.MapelID === meta.MapelID && k.KelasID === meta.KelasID &&
           String(k.Semester) === String(meta.Semester);
  }).sort(function (a, b) { return (Number(a.Urutan) || 0) - (Number(b.Urutan) || 0); });
  return rows.length ? rows : komponenDefault(meta);
}

function apiGetKomponenNilai(token, meta) {
  try {
    requireSession(token);
    const k = ambilKomponen(meta);
    return createResponse(true, {
      komponen: k,
      tersimpan: getCachedData('Komponen_Nilai', CACHE_TTL.SHORT).some(function (x) {
        return x.MapelID === meta.MapelID && x.KelasID === meta.KelasID &&
               String(x.Semester) === String(meta.Semester); }),
      total: k.reduce(function (a, b) { return a + (Number(b.Bobot) || 0); }, 0)
    }, 'OK');
  } catch (error) {
    return createResponse(false, null, error.message);
  }
}

/**
 * Menyimpan susunan komponen bobot. Total bobot WAJIB tepat 100%.
 * Komponen lama untuk kelas+mapel+semester yang sama dihapus lalu ditulis ulang.
 */
function apiSimpanKomponenNilai(token, meta, komponen) {
  const lock = LockService.getScriptLock();
  try {
    const sess = requireSession(token);
    if (sess.peran !== 'Dosen') return createResponse(false, null, 'Hanya Dosen/Guru yang dapat mengatur bobot.');
    if (!komponen || komponen.length < 1) return createResponse(false, null, 'Minimal satu komponen penilaian.');
    if (komponen.length > 10) return createResponse(false, null, 'Maksimal 10 komponen penilaian.');

    const nama = {};
    let total = 0;
    for (let i = 0; i < komponen.length; i++) {
      const n = String(komponen[i].Nama || '').trim();
      const b = Number(komponen[i].Bobot);
      if (!n) return createResponse(false, null, 'Nama komponen ke-' + (i + 1) + ' belum diisi.');
      if (nama[n.toLowerCase()]) return createResponse(false, null, 'Nama komponen "' + n + '" terduplikasi.');
      nama[n.toLowerCase()] = true;
      if (isNaN(b) || b <= 0) return createResponse(false, null, 'Bobot komponen "' + n + '" harus lebih besar dari 0.');
      total += b;
    }
    total = Math.round(total * 100) / 100;
    if (total !== 100) {
      return createResponse(false, { total: total },
        'Total bobot saat ini ' + total + '%. Sistem hanya menerima total tepat 100% — ' +
        (total > 100 ? 'kurangi ' + (total - 100) : 'tambahkan ' + (100 - total)) + '%.');
    }

    lock.waitLock(20000);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Komponen_Nilai');
    const headers = SHEET_SCHEMA['Komponen_Nilai'];
    const nilai = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).getValues();
    const cM = headers.indexOf('MapelID'), cK = headers.indexOf('KelasID'), cS = headers.indexOf('Semester');

    /* Hapus susunan lama (dari bawah ke atas agar indeks tidak bergeser) */
    const hapus = [];
    for (let r = 1; r < nilai.length; r++) {
      if (nilai[r][cM] === meta.MapelID && nilai[r][cK] === meta.KelasID &&
          String(nilai[r][cS]) === String(meta.Semester)) hapus.push(r + 1);
    }
    hapus.sort(function (a, b) { return b - a; }).forEach(function (rn) { sheet.deleteRow(rn); });

    const baris = komponen.map(function (k, i) {
      const rec = {
        ID: generateUUID(), MapelID: meta.MapelID, KelasID: meta.KelasID,
        Semester: meta.Semester, TahunAjaran: meta.TahunAjaran || '',
        Nama: String(k.Nama).trim(), Bobot: Number(k.Bobot), Urutan: i + 1, UpdatedAt: new Date()
      };
      return headers.map(function (h) { return rec[h]; });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, baris.length, headers.length).setValues(baris);

    invalidateCache('Komponen_Nilai');
    lock.releaseLock();
    return createResponse(true, { total: total },
      komponen.length + ' komponen tersimpan dengan total bobot 100%.');
  } catch (error) {
    try { lock.releaseLock(); } catch (e) {}
    return createResponse(false, null, error.message);
  }
}


/**
 * Utilitas pemeliharaan: hapus sesi kedaluwarsa dari Script Properties.
 * Pasang Time-driven Trigger harian bila jumlah pengguna besar.
 */
function bersihkanSesiKedaluwarsa() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  let dihapus = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('SESS_') !== 0) return;
    try {
      const s = JSON.parse(all[k]);
      if (!s.expiry || s.expiry < Date.now()) { props.deleteProperty(k); dihapus++; }
    } catch (e) { props.deleteProperty(k); dihapus++; }
  });
  Logger.log(dihapus + ' sesi kedaluwarsa dibersihkan.');
  return dihapus;
}
