/* ==========================================================================
   EduPortal LMS v2.0 — config.js
   --------------------------------------------------------------------------
   ⚠️  INILAH SATU-SATUNYA BERKAS YANG PERLU ANDA EDIT SAAT INSTALASI.
       Seluruh berkas lain dapat dipakai apa adanya.
   ========================================================================== */

/**
 * ALAMAT BACKEND — URL Web App Google Apps Script Anda.
 *
 * Cara mendapatkannya:
 *   1. Buka proyek Apps Script Anda
 *   2. Deploy → New deployment → Web app
 *        • Execute as    : Me
 *        • Who has access: Anyone           ← WAJIB, bukan "Anyone with Google account"
 *   3. Klik Deploy → salin URL yang berakhiran /exec
 *   4. Tempelkan menggantikan tulisan di bawah ini
 *
 * ⚠️  Harus berakhiran /exec — BUKAN /dev.
 *     URL /dev hanya bisa diakses oleh pemilik skrip dan akan gagal untuk
 *     pengguna lain.
 *
 * ⚠️  Setiap kali Anda mengubah Kode.gs atau Modul.gs, WAJIB deploy ulang
 *     (Deploy → Manage deployments → Edit ✏️ → Version: New version → Deploy).
 *     Menyimpan berkas saja TIDAK memperbarui aplikasi yang sedang berjalan.
 */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyYHOYgicQz4V9NbrlLp3oIWPrg05nO-_LeUF6OI37vxpXz9YEGBOPjUgVzQUoEPuXblw/exec';


/* --------------------------------------------------------------------------
   PENGATURAN LANJUTAN — umumnya tidak perlu diubah
   -------------------------------------------------------------------------- */
const APP_CONFIG = {

  /** Nama aplikasi yang tampil di judul tab peramban. */
  namaApp: 'EduPortal LMS',

  /** Versi frontend — tampil di Pusat Bantuan untuk kebutuhan dukungan teknis. */
  versi: '2.0',

  /**
   * Batas waktu tunggu tiap permintaan ke backend (milidetik).
   * Apps Script punya batas eksekusi 6 menit, namun permintaan normal
   * selesai < 5 detik. 45 detik memberi ruang untuk operasi berat seperti
   * impor Excel massal atau cetak transkrip sekelas.
   */
  timeoutMs: 45000,

  /**
   * Berapa kali permintaan diulang bila GAGAL KARENA JARINGAN.
   * Hanya berlaku untuk kegagalan jaringan/timeout — TIDAK PERNAH untuk
   * respons yang sudah diterima. Ini penting: mengulang operasi tulis yang
   * sebenarnya berhasil dapat membuat data ganda.
   */
  maxRetry: 2,

  /** Jeda sebelum percobaan ulang (milidetik), naik berlipat tiap percobaan. */
  retryDelayMs: 1200,

  /**
   * Bahasa pengenalan suara untuk fitur Rekam Pertemuan.
   * Contoh lain: 'en-US', 'ar-SA', 'jv-ID' (Jawa), 'su-ID' (Sunda).
   */
  bahasaRekam: 'id-ID',

  /**
   * Tampilkan tombol akun demo di layar login?
   * ⚠️  WAJIB diubah menjadi false sebelum aplikasi dipakai sungguhan,
   *     karena tombol ini mengisi kredensial default yang diketahui umum.
   */
  tampilkanAkunDemo: true,

  /**
   * Periksa kesehatan API saat halaman dibuka.
   * Bila backend belum di-deploy atau URL salah, pengguna langsung mendapat
   * penjelasan yang benar — bukan sekadar "login gagal" yang menyesatkan.
   */
  cekKoneksiSaatMuat: true
};


/* --------------------------------------------------------------------------
   PENJAGA KONFIGURASI
   Menahan kesalahan instalasi paling umum sebelum menjadi bug misterius.
   -------------------------------------------------------------------------- */
(function periksaKonfigurasi() {
  /* Dua tingkat keparahan yang sengaja dibedakan:
       masalah    = fatal, aplikasi mustahil bekerja → hentikan & jelaskan
       peringatan = mencurigakan, tetapi mungkin memang disengaja → catat saja
     Membedakan keduanya penting: memblokir setiap URL yang bukan
     script.google.com akan mematikan skenario yang sah, seperti pengujian
     lokal, proxy institusi, atau domain perantara milik sekolah. */
  const masalah = [];
  const peringatan = [];

  const lokal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(GAS_URL || '');

  if (!GAS_URL || GAS_URL === 'GANTI_DENGAN_URL_EXEC_ANDA') {
    masalah.push('GAS_URL belum diisi di js/config.js.');
  } else if (!/^https?:\/\//.test(GAS_URL)) {
    masalah.push('GAS_URL harus berupa alamat lengkap yang diawali https://');
  } else if (lokal) {
    /* Mode pengembangan — tidak ada yang perlu dikeluhkan. */
    console.info('[EduPortal] Mode pengembangan: backend lokal ' + GAS_URL);
  } else {
    if (GAS_URL.indexOf('script.google.com') === -1) {
      peringatan.push('GAS_URL bukan alamat script.google.com. Ini wajar bila Anda memakai proxy ' +
                      'atau domain perantara; abaikan pesan ini bila memang disengaja.');
    }
    if (/\/dev$/.test(GAS_URL)) {
      masalah.push('GAS_URL berakhiran <code>/dev</code>. URL /dev hanya dapat dibuka oleh pemilik ' +
                   'skrip, sehingga pengguna lain akan selalu gagal. Gunakan URL <code>/exec</code>.');
    } else if (!/\/exec$/.test(GAS_URL) && GAS_URL.indexOf('script.google.com') !== -1) {
      masalah.push('GAS_URL harus berakhiran <code>/exec</code>.');
    }
    if (location.protocol === 'https:' && GAS_URL.indexOf('http://') === 0) {
      masalah.push('Halaman ini dilayani lewat HTTPS, tetapi GAS_URL memakai HTTP. ' +
                   'Peramban akan memblokir permintaan campuran seperti ini.');
    }
  }

  window.MASALAH_KONFIG = masalah;
  window.PERINGATAN_KONFIG = peringatan;

  if (masalah.length) {
    console.error('[EduPortal] Konfigurasi bermasalah:\n • ' +
      masalah.map(function (m) { return m.replace(/<\/?code>/g, '`'); }).join('\n • '));
  }
  if (peringatan.length) {
    console.warn('[EduPortal] Perhatian:\n • ' + peringatan.join('\n • '));
  }
})();
