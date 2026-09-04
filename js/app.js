/* ==========================================================================
   EduPortal LMS v2.0 — app.js  (INTI SPA + JEMBATAN API)
   --------------------------------------------------------------------------
   Arsitektur GAS-PRO-API: berkas ini dilayani sebagai JavaScript statis dari
   GitHub Pages dan berbicara dengan Google Apps Script lewat fetch() JSON.
   Tidak ada google.script.run, tidak ada HtmlService, tidak ada iframe.

   Prinsip gas-instant-ux (tetap dipertahankan, bahkan makin penting):
     1. SPA         → navigateTo() hanya menukar konten, 0ms, tanpa reload
     2. Optimistic  → UI diperbarui lebih dulu + localStorage, sync di belakang
     3. Cache       → window.DB menampung seluruh master data hasil 1x fetch
     4. Batch       → satu permintaan HTTP untuk banyak operasi
        Pada arsitektur REST, setiap panggilan melintasi jaringan sungguhan.
        Menggabungkan permintaan karenanya menghemat lebih banyak daripada
        sebelumnya — getInitialAppData() sendiri menggantikan ±10 round-trip.

   Yang HILANG karena tidak lagi terkurung iframe (dan itu kabar baik):
     ✅ window.open dan tautan keluar kini aman dipakai
     ✅ mikrofon, kamera, dan geolokasi berfungsi normal
     ✅ URL tidak pernah berubah karena routing tetap 100% di klien

   Urutan pemuatan: config.js → app.js → pages.js
   ========================================================================== */

/* ---------------------------------------------------------------- 1. STATE */
const AppState = {
  sessionToken: null,
  user: null,          // { id, nama, email, peran, fotoURL }
  currentPage: null,
  history: [],
  booted: false,
  pageCtx: {},         // konteks halaman aktif (kelas terpilih, tab, dsb.)
  charts: {},          // instance Chart.js aktif
  pending: 0
};

/** Cache data aplikasi di sisi klien — sumber render semua halaman. */
window.DB = {
  institusi: {}, fitur: {},
  periode: [], bantuan: [], jenisTagihan: [],
  jurusan: [], kurikulum: [], mapel: [], kelas: [], program: [], jadwal: [],
  dosen: [], siswa: [], pengguna: [], enrollment: [],
  materi: [], tugas: [], pengumpulan: [], absensi: [],
  statusNilai: [], statusSiswa: [], komponen: [],
  transkrip: [], remedial: [], pengulangan: [], spp: [],
  logNotif: [], statistik: {}, profil: {}, programSaya: [],
  pengumpulanSaya: [], absensiSaya: [], enrollmentSaya: [], mapelIds: []
};

const LS = {
  get(k, d) { try { const v = localStorage.getItem('lms_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lms_' + k, JSON.stringify(v)); } catch (e) {} },
  del(k)    { try { localStorage.removeItem('lms_' + k); } catch (e) {} }
};

/* --------------------------------------------------------------- 2. IKON  */
/* Set ikon garis 1.5px (gaya Lucide) — disisipkan inline, tanpa CDN ikon. */
const ICONS = {
  'layout-dashboard':'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  'book-open':'<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  'graduation-cap':'<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
  'calendar':'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  'calendar-check':'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/>',
  'clipboard-list':'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  'clipboard-check':'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  'star':'<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  'mail':'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  'settings':'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  'users':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  'user':'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'user-check':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 11 2 2 4-4"/>',
  'building':'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>',
  'library':'<path d="m16 6 4 14M12 6v14M8 8v12M4 4v16"/>',
  'file-text':'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5M16 13H8M16 17H8M10 9H8"/>',
  'folder':'<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  'upload':'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  'upload-cloud':'<path d="M4 14.9A5 5 0 0 1 6.5 5.5a7 7 0 0 1 13.2 2.3A4.5 4.5 0 0 1 18.5 17H17"/><path d="m9 15 3-3 3 3M12 12v9"/>',
  'download':'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  'search':'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'bell':'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  'moon':'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  'sun':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  'menu':'<path d="M4 6h16M4 12h16M4 18h16"/>',
  'x':'<path d="M18 6 6 18M6 6l12 12"/>',
  'check':'<path d="M20 6 9 17l-5-5"/>',
  'check-circle':'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'alert-circle':'<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  'alert-triangle':'<path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  'info':'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  'plus':'<path d="M12 5v14M5 12h14"/>',
  'edit':'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  'trash':'<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  'eye':'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'log-in':'<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>',
  'log-out':'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  'lock':'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'unlock':'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  'help-circle':'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  'repeat':'<path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  'mic':'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  'square':'<rect x="4" y="4" width="16" height="16" rx="2"/>',
  'pause':'<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  'flag':'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  'play':'<path d="m6 3 14 9-14 9z"/>',
  'send':'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  'link':'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  'video':'<path d="m22 8-6 4 6 4z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  'image':'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  'map-pin':'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  'qr-code':'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z"/>',
  'wallet':'<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  'bar-chart':'<path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="8"/><rect x="13" y="6" width="3" height="12"/><rect x="18" y="13" width="3" height="5"/>',
  'pie-chart':'<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10Z"/>',
  'trending-up':'<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  'corner-up-left':'<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  'refresh':'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  'filter':'<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  'clock':'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  'megaphone':'<path d="m3 11 15-7v16l-15-7z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  'award':'<circle cx="12" cy="8" r="6"/><path d="m8.2 13.4-1.6 7L12 17.5l5.4 2.9-1.6-7"/>',
  'list-checks':'<path d="M3 5h2l1.5 1.5L9 4M3 12h2l1.5 1.5L9 11M3 19h2l1.5 1.5L9 18M13 6h8M13 13h8M13 20h8"/>',
  'shield':'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  'presentation':'<path d="M2 3h20M3 3v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V3"/><path d="m8 21 4-6 4 6M12 3v3"/>',
  'file-check':'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5m-8 8 2 2 4-4"/>',
  'inbox':'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  'grid':'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  'microscope':'<path d="M6 18h8M3 22h18M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2ZM12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>',
  'sparkles':'m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'
};

function svgIcon(name, size) {
  const path = ICONS[name] || ICONS['info'];
  const s = size || 20;
  return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
         'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
}

/** Ganti semua placeholder <i data-icon="..."> menjadi SVG inline. */
function renderIcons(root) {
  (root || document).querySelectorAll('i[data-icon]').forEach(function (el) {
    const wrap = document.createElement('span');
    wrap.innerHTML = svgIcon(el.dataset.icon, el.dataset.size ? Number(el.dataset.size) : undefined);
    const svg = wrap.firstChild;
    if (el.className) svg.setAttribute('class', el.className);
    el.replaceWith(svg);
  });
}

/* ------------------------------------------------------- 3. UTIL UMUM ---- */
const $  = function (sel, root) { return (root || document).querySelector(sel); };
const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const BULAN_PANJANG = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

function fmtTgl(v, withTime) {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const s = d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
  if (!withTime) return s;
  return s + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function fmtTglPanjang(v) {
  const d = v ? new Date(v) : new Date();
  return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN_PANJANG[d.getMonth()] + ' ' + d.getFullYear();
}
function fmtRp(n) { return 'Rp' + (Number(n) || 0).toLocaleString('id-ID'); }
function inisial(nama) {
  return String(nama || '?').trim().split(/\s+/).slice(0, 2)
    .map(function (w) { return w.charAt(0); }).join('').toUpperCase();
}
function debounce(fn, ms) {
  let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms || 300); };
}
function uid() { return 'x' + Math.random().toString(36).slice(2, 10); }

/** Lookup cepat dari array by ID. */
function byId(arr, id) { return (arr || []).filter(function (x) { return x.ID === id; })[0] || {}; }
function namaMapel(id) { const m = byId(DB.mapel, id); return m.Nama ? m.Nama : '-'; }
function kodeMapel(id) { const m = byId(DB.mapel, id); return m.Kode ? m.Kode : '-'; }
function namaKelas(id) { const k = byId(DB.kelas, id); return k.Nama ? k.Nama : '-'; }
function namaDosen(id) { const d = byId(DB.dosen, id); return d.Nama ? d.Nama : '-'; }
function namaSiswa(id) { const s = byId(DB.siswa, id); return s.Nama ? s.Nama : '-'; }
function namaJurusan(id) { const j = byId(DB.jurusan, id); return j.Nama ? j.Nama : '-'; }

/* --------------------------------------------- 4. JEMBATAN KE BACKEND ---- */
/* ==========================================================================
   INI SATU-SATUNYA BAGIAN YANG BERUBAH DARI VERSI 1.1.
   --------------------------------------------------------------------------
   Versi 1.1 memanggil backend lewat google.script.run, yang hanya tersedia
   di dalam halaman yang disajikan HtmlService. Karena frontend kini berdiri
   sendiri di GitHub Pages, jembatannya diganti fetch() HTTP biasa.

   KONTRAK api() SENGAJA DIPERTAHANKAN PERSIS SAMA:
       api('apiSave', token, 'Kelas', data)  →  Promise<{success,data,message}>
   Sehingga ~36 pemanggilan di seluruh aplikasi tidak perlu diubah sebaris pun.

   TIGA HAL YANG WAJIB DIPATUHI SAAT MEMANGGIL APPS SCRIPT DARI LUAR:

   1. Content-Type HARUS 'text/plain;charset=utf-8'.
      Memakai 'application/json' membuat peramban mengirim permintaan
      preflight OPTIONS lebih dulu. Apps Script tidak melayani OPTIONS,
      sehingga permintaan gagal dengan galat CORS yang membingungkan —
      padahal kodenya benar. Ini penyebab kegagalan nomor satu pada
      arsitektur ini.

   2. JANGAN pakai mode:'no-cors'.
      Itu memang menghilangkan pesan galat, tetapi juga membuat respons
      menjadi "opaque" — body-nya tidak bisa dibaca sama sekali. Galatnya
      hilang, datanya ikut hilang.

   3. Biarkan fetch mengikuti redirect.
      URL /exec membalas 302 ke script.googleusercontent.com. Perilaku
      bawaan fetch (redirect:'follow') sudah benar; jangan diubah.
   ========================================================================== */

/**
 * Memanggil satu aksi di backend Apps Script.
 *
 * @param  {string} fn    Nama aksi (harus terdaftar di ACTION_WHITELIST backend)
 * @param  {...*}   args  Argumen. Bila aksi butuh sesi, argumen PERTAMA adalah
 *                        token — dipisahkan otomatis agar tidak ikut ke URL.
 * @return {Promise<{success:boolean, data:*, message:string}>}
 */
function api(fn) {
  const semua = Array.prototype.slice.call(arguments, 1);

  /* doLogin(email, sandi) tidak membawa token; sisanya (token, ...args). */
  const tanpaToken = (fn === 'doLogin');
  const token = tanpaToken ? '' : (semua[0] || '');
  const args  = tanpaToken ? semua : semua.slice(1);

  startLoading();

  return kirimPermintaan({ action: fn, token: token, args: args })
    .then(function (res) {
      stopLoading();

      /* Sesi habis → kembali ke layar login, bukan toast merah. */
      if (res && res.data && res.data.sessionExpired) {
        sesiBerakhir();
        throw new Error('Sesi berakhir');
      }
      return res;
    })
    .catch(function (err) {
      stopLoading();
      throw err;
    });
}

/**
 * Fire & forget — dipakai untuk sinkronisasi latar belakang (optimistic UI).
 * Kegagalan sengaja tidak mengganggu pengguna, hanya dicatat di console.
 */
function apiSilent(fn) {
  const semua = Array.prototype.slice.call(arguments, 1);
  const tanpaToken = (fn === 'doLogin');
  const token = tanpaToken ? '' : (semua[0] || '');
  const args  = tanpaToken ? semua : semua.slice(1);

  kirimPermintaan({ action: fn, token: token, args: args }, { diam: true })
    .catch(function (e) { console.warn('Sync gagal (' + fn + '):', e && e.message); });
}

/**
 * Lapisan transport: satu permintaan POST ke Apps Script, lengkap dengan
 * batas waktu tunggu dan percobaan ulang untuk kegagalan jaringan.
 *
 * ATURAN PENTING TENTANG PERCOBAAN ULANG
 * Permintaan HANYA diulang bila gagal SEBELUM respons diterima (jaringan
 * putus / timeout). Respons yang sudah sampai — sukses maupun gagal — tidak
 * pernah diulang. Mengulang operasi tulis yang sebenarnya sudah berhasil
 * akan membuat data ganda: absensi dobel, nilai tertimpa, tagihan terbit dua
 * kali. Lebih baik menampilkan galat daripada merusak data.
 */
function kirimPermintaan(payload, opsi) {
  const o = opsi || {};
  const maxPercobaan = o.diam ? 1 : (APP_CONFIG.maxRetry + 1);

  function sekali(percobaanKe) {
    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const jamPasir = setTimeout(function () { if (ctl) ctl.abort(); }, APP_CONFIG.timeoutMs);

    return fetch(GAS_URL, {
      method: 'POST',
      /* WAJIB text/plain — lihat catatan nomor 1 di atas. */
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: ctl ? ctl.signal : undefined
    })
      .then(function (resp) {
        clearTimeout(jamPasir);
        if (!resp.ok) {
          /* Galat HTTP = respons SUDAH diterima → tidak diulang. */
          throw new GagalPermanen(pesanGalatHttp(resp.status));
        }
        return resp.text();
      })
      .then(function (teks) {
        /* Apps Script membalas halaman HTML bila skrip belum di-deploy atau
           izinnya salah. Diterjemahkan menjadi pesan yang bisa ditindaklanjuti. */
        let hasil;
        try {
          hasil = JSON.parse(teks);
        } catch (e) {
          throw new GagalPermanen(diagnosaBalasanBukanJson(teks));
        }
        if (!hasil || typeof hasil !== 'object') {
          throw new GagalPermanen('Backend membalas dalam bentuk yang tidak dikenali.');
        }
        return hasil;
      })
      .catch(function (err) {
        clearTimeout(jamPasir);

        /* Galat permanen — jangan diulang. */
        if (err instanceof GagalPermanen) throw new Error(err.message);

        /* Sisanya adalah kegagalan jaringan / timeout → boleh diulang. */
        const habis = (percobaanKe >= maxPercobaan);
        if (habis) {
          const abort = err && err.name === 'AbortError';
          throw new Error(abort
            ? 'Server tidak membalas dalam ' + Math.round(APP_CONFIG.timeoutMs / 1000) +
              ' detik. Periksa koneksi internet Anda lalu coba lagi.'
            : 'Tidak dapat menghubungi server. Periksa koneksi internet Anda, ' +
              'lalu pastikan alamat API di js/config.js sudah benar dan aplikasi Apps Script sudah di-deploy.');
        }
        return tunggu(APP_CONFIG.retryDelayMs * percobaanKe)
          .then(function () { return sekali(percobaanKe + 1); });
      });
  }

  return sekali(1);
}

/** Penanda galat yang TIDAK boleh diulang otomatis. */
function GagalPermanen(pesan) { this.message = pesan; }
GagalPermanen.prototype = Object.create(Error.prototype);

function tunggu(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function pesanGalatHttp(status) {
  if (status === 401 || status === 403) {
    return 'Akses ke API ditolak (HTTP ' + status + '). Pada Apps Script, buka ' +
           'Deploy → Manage deployments → Edit, dan pastikan "Who has access" bernilai ' +
           '"Anyone" — bukan "Anyone with Google account".';
  }
  if (status === 404) {
    return 'Alamat API tidak ditemukan (HTTP 404). Periksa GAS_URL di js/config.js ' +
           'dan pastikan berakhiran /exec.';
  }
  if (status >= 500) {
    return 'Server Apps Script mengalami kesalahan (HTTP ' + status + '). ' +
           'Coba lagi beberapa saat lagi; bila berulang, periksa Execution log di Apps Script.';
  }
  return 'Server membalas dengan kode ' + status + '.';
}

/**
 * Menerjemahkan balasan HTML dari Apps Script menjadi sebab yang konkret.
 * Tanpa ini, pengguna hanya melihat "Unexpected token < in JSON" yang tidak
 * memberi petunjuk apa pun tentang apa yang harus diperbaiki.
 */
function diagnosaBalasanBukanJson(teks) {
  const t = String(teks || '');

  if (/Google Drive|Sign in|accounts\.google\.com|masuk dengan akun/i.test(t)) {
    return 'Backend meminta login Google. Buka Deploy → Manage deployments → Edit, ' +
           'lalu setel "Who has access" menjadi "Anyone" dan deploy ulang.';
  }
  if (/Script function not found|is not defined/i.test(t)) {
    return 'Fungsi backend tidak ditemukan. Pastikan Kode.gs DAN Modul.gs sudah ditempel ' +
           'lengkap di proyek Apps Script, lalu deploy versi baru.';
  }
  if (/exceeded|quota|limit/i.test(t)) {
    return 'Kuota Apps Script terlampaui untuk hari ini. Coba lagi besok atau gunakan akun Workspace.';
  }
  if (/^\s*</.test(t)) {
    return 'Backend membalas halaman HTML, bukan data JSON. Penyebab tersering: ' +
           'GAS_URL salah, aplikasi belum di-deploy sebagai Web App, atau perubahan kode ' +
           'belum dideploy sebagai versi baru.';
  }
  return 'Balasan server tidak dapat dibaca.';
}

/* --------------------------------------------------------------------------
   PEMERIKSAAN KESEHATAN API
   Frontend dan backend kini terpisah, sehingga "backend tidak terjangkau"
   menjadi kelas kegagalan baru yang tidak pernah ada di versi iframe.
   Diperiksa lebih awal agar pengguna tidak menyangka kata sandinya salah.
   -------------------------------------------------------------------------- */
function cekKoneksiAPI() {
  setStatusAPI('cek', 'Memeriksa koneksi…');

  if (window.MASALAH_KONFIG && window.MASALAH_KONFIG.length) {
    setStatusAPI('gagal', 'Konfigurasi belum lengkap');
    tampilkanGalatKoneksi(window.MASALAH_KONFIG, true);
    return Promise.resolve(false);
  }

  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const jamPasir = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);

  return fetch(GAS_URL + '?action=ping', {
    method: 'GET',
    redirect: 'follow',
    signal: ctl ? ctl.signal : undefined
  })
    .then(function (r) {
      clearTimeout(jamPasir);
      if (!r.ok) throw new Error(pesanGalatHttp(r.status));
      return r.text();
    })
    .catch(function (err) {
      clearTimeout(jamPasir);
      /* Kegagalan jaringan diterjemahkan di sini, sebelum sampai ke pengguna.
         Tanpa ini yang tampil hanyalah "Failed to fetch" milik peramban —
         pesan yang tidak memberi petunjuk apa pun tentang apa yang salah. */
      if (err instanceof TypeError || err.name === 'AbortError' || /Failed to fetch|NetworkError|Load failed/i.test(err.message)) {
        throw new Error(
          'Alamat API tidak dapat dihubungi: ' + GAS_URL + '. Periksa satu per satu: ' +
          '(1) komputer Anda terhubung internet; ' +
          '(2) GAS_URL di js/config.js sudah benar dan berakhiran /exec; ' +
          '(3) aplikasi Apps Script sudah di-deploy sebagai Web App dengan akses "Anyone"; ' +
          '(4) setelah perubahan kode terakhir, Anda sudah membuat deployment versi baru.');
      }
      throw err;
    })
    .then(function (teks) {
      let hasil;
      try { hasil = JSON.parse(teks); }
      catch (e) { throw new Error(diagnosaBalasanBukanJson(teks)); }

      if (!hasil.success) throw new Error(hasil.message || 'API membalas dengan kegagalan.');

      if (hasil.data && hasil.data.siap === false) {
        setStatusAPI('gagal', 'Backend belum di-setup');
        tampilkanGalatKoneksi([
          'Backend sudah terhubung, tetapi <b>setupAppEnvironment()</b> belum pernah dijalankan.',
          'Buka proyek Apps Script → pilih fungsi <code>setupAppEnvironment</code> → tekan ▶ Run → izinkan akses.'
        ]);
        return false;
      }

      setStatusAPI('ok', 'Terhubung ke backend v' + ((hasil.data && hasil.data.versi) || '?'));
      sembunyikanGalatKoneksi();
      return true;
    })
    .catch(function (err) {
      setStatusAPI('gagal', 'Backend tidak terjangkau');
      tampilkanGalatKoneksi([err.message]);
      return false;
    });
}

function setStatusAPI(kelas, teks) {
  const el = $('#apiStatus');
  const tx = $('#apiStatusText');
  if (el) el.className = 'api-status ' + kelas;
  if (tx) tx.textContent = teks;
}

function tampilkanGalatKoneksi(daftar, konfig) {
  const el = $('#koneksiGalat');
  if (!el) return;
  el.innerHTML =
    '<strong>' + (konfig ? 'Aplikasi belum dikonfigurasi' : 'Tidak dapat terhubung ke backend') + '</strong>' +
    '<ol>' + daftar.map(function (d) { return '<li>' + d + '</li>'; }).join('') + '</ol>' +
    (konfig ? '<p style="margin:8px 0 0">Buka berkas <code>js/config.js</code> dan isi <code>GAS_URL</code> ' +
              'dengan alamat Web App Apps Script Anda yang berakhiran <code>/exec</code>.</p>' : '');
  el.hidden = false;
}

function sembunyikanGalatKoneksi() {
  const el = $('#koneksiGalat');
  if (el) el.hidden = true;
}

function startLoading() { AppState.pending++; $('#loadingBar').hidden = false; }
function stopLoading() {
  AppState.pending = Math.max(0, AppState.pending - 1);
  if (!AppState.pending) $('#loadingBar').hidden = true;
}

function sesiBerakhir() {
  AppState.sessionToken = null; AppState.user = null;
  LS.del('token');
  tampilkanLogin();
  showToast('Sesi Anda berakhir. Silakan masuk kembali.', 'warning');
}

/* ------------------------------------------------------- 5. TOAST/MODAL -- */
function showToast(pesan, tipe, judul) {
  const t = tipe || 'info';
  const ikon = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info' }[t] || 'info';
  const el = document.createElement('div');
  el.className = 'toast ' + t;
  el.innerHTML = svgIcon(ikon, 18) +
    '<div>' + (judul ? '<strong>' + esc(judul) + '</strong><br>' : '') + esc(pesan) + '</div>' +
    '<button class="toast-x" aria-label="Tutup">' + svgIcon('x', 15) + '</button>';
  el.querySelector('.toast-x').onclick = function () { tutupToast(el); };
  $('#toastRoot').appendChild(el);
  setTimeout(function () { tutupToast(el); }, t === 'error' ? 6500 : 4200);
}
function tutupToast(el) {
  if (!el || !el.parentNode) return;
  el.classList.add('out');
  setTimeout(function () { if (el.parentNode) el.remove(); }, 200);
}

/**
 * Modal universal.
 * @param {Object} o {title, body, foot, size:'', onOpen}
 */
function openModal(o) {
  $('#modalTitle').textContent = o.title || '';
  $('#modalBody').innerHTML = o.body || '';
  $('#modalFoot').innerHTML = o.foot || '';
  $('#modalBox').className = 'modal' + (o.size ? ' ' + o.size : '');
  $('#modalRoot').hidden = false;
  renderIcons($('#modalRoot'));
  pasangFormatHP($('#modalRoot'));
  document.body.style.overflow = 'hidden';
  if (o.onOpen) setTimeout(function () { o.onOpen(); }, 20);
  const first = $('#modalBody input, #modalBody select, #modalBody textarea');
  if (first) setTimeout(function () { first.focus(); }, 60);
}
function closeModal() {
  $('#modalRoot').hidden = true;
  $('#modalBody').innerHTML = '';
  document.body.style.overflow = '';
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !$('#modalRoot').hidden) closeModal();
});

/** Konfirmasi berbasis modal (bukan confirm() bawaan agar aman di iframe). */
function konfirmasi(pesan, onYes, opsi) {
  const o = opsi || {};
  openModal({
    title: o.judul || 'Konfirmasi',
    size: 'slim',
    body: '<p style="margin:0">' + esc(pesan) + '</p>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
          '<button class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" id="btnKonfirmasiYa">' +
          esc(o.labelYa || 'Ya, Lanjutkan') + '</button>',
    onOpen: function () {
      $('#btnKonfirmasiYa').onclick = function () { closeModal(); onYes(); };
    }
  });
}

/** Pratinjau berkas dalam modal (TIDAK membuka tab baru — aman di iframe). */
function previewFile(url, judul, downloadUrl) {
  openModal({
    title: judul || 'Pratinjau Berkas',
    size: 'wide',
    body: '<iframe class="preview-frame" src="' + esc(url) + '" title="Pratinjau"></iframe>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>' +
          (downloadUrl ? '<a class="btn btn-primary" href="' + esc(downloadUrl) + '" target="_blank" rel="noopener">' +
           svgIcon('download', 18) + ' Unduh</a>' : '')
  });
}

/* ---------------------------------------------------------- 6. TEMA ------ */
function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  const btn = $('#themeBtn');
  if (btn) btn.innerHTML = svgIcon(mode === 'dark' ? 'sun' : 'moon', 20);
  LS.set('theme', mode);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
  Object.keys(AppState.charts).forEach(function (k) { try { AppState.charts[k].update(); } catch (e) {} });
}

/* ------------------------------------------------------- 7. AUTENTIKASI - */
function isiDemo(email, sandi) {
  $('#loginEmail').value = email;
  $('#loginPassword').value = sandi;
  $('#authAlert').hidden = true;
}
function togglePassword() {
  const i = $('#loginPassword');
  i.type = i.type === 'password' ? 'text' : 'password';
}
function lupaSandi() {
  showToast('Hubungi Super Admin institusi Anda untuk mereset kata sandi.', 'info', 'Lupa Kata Sandi');
}
function authError(msg, judul) {
  $('#authAlertTitle').textContent = judul || 'Autentikasi Gagal';
  $('#authAlertMsg').textContent = msg;
  $('#authAlert').hidden = false;
  $('#loginEmail').classList.add('invalid');
  $('#loginPassword').classList.add('invalid');
}

function handleLogin(e) {
  e.preventDefault();
  const email = $('#loginEmail').value.trim();
  const sandi = $('#loginPassword').value;
  $('#authAlert').hidden = true;
  $('#loginEmail').classList.remove('invalid');
  $('#loginPassword').classList.remove('invalid');

  if (!email || !sandi) { authError('Email dan kata sandi wajib diisi.', 'Data Belum Lengkap'); return; }

  const btn = $('#loginBtn');
  const isi = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = svgIcon('refresh', 18) + '<span>Memverifikasi…</span>';

  api('doLogin', email, sandi).then(function (res) {
    btn.disabled = false; btn.innerHTML = isi;
    if (!res.success) { authError(res.message); return; }

    AppState.sessionToken = res.data.token;
    AppState.user = res.data.user;
    LS.set('token', res.data.token);
    if ($('#rememberEmail').checked) LS.set('email', email); else LS.del('email');

    $('#loginPassword').value = '';
    muatAplikasi(res.data.landingPage);
    showToast(res.message, 'success');
  }).catch(function (err) {
    btn.disabled = false; btn.innerHTML = isi;
    authError(err.message);
  });
}

function handleLogout() {
  konfirmasi('Anda akan keluar dari portal. Lanjutkan?', function () {
    const t = AppState.sessionToken;
    AppState.sessionToken = null; AppState.user = null; AppState.history = [];
    LS.del('token');
    apiSilent('doLogout', t);
    tampilkanLogin();
    showToast('Anda telah keluar.', 'success');
  }, { labelYa: 'Ya, Keluar' });
}

function tampilkanLogin() {
  $('#appShell').hidden = true;
  $('#authScreen').hidden = false;
  $('#bootOverlay').hidden = true;
  const savedEmail = LS.get('email', '');
  if (savedEmail) { $('#loginEmail').value = savedEmail; $('#rememberEmail').checked = true; }
  renderIcons($('#authScreen'));
}

/* -------------------------------------------------- 8. MUAT APLIKASI ----- */
function muatAplikasi(landingPage) {
  $('#bootOverlay').hidden = false;
  api('getInitialAppData', AppState.sessionToken).then(function (res) {
    if (!res.success) {
      $('#bootOverlay').hidden = true;
      if (res.data && res.data.sessionExpired) { tampilkanLogin(); return; }
      showToast(res.message, 'error');
      tampilkanLogin();
      return;
    }
    const d = res.data;
    AppState.user = d.user;
    Object.keys(d).forEach(function (k) { if (k in DB || true) DB[k] = d[k]; });
    DB.institusi = d.institusi || {};
    DB.fitur = d.fitur || {};

    /* Identitas institusi di sidebar */
    if (DB.institusi.NamaInstitusi) {
      $('#brandName').textContent = DB.institusi.NamaInstitusi.length > 18
        ? DB.institusi.NamaInstitusi.substring(0, 17) + '…' : DB.institusi.NamaInstitusi;
      $('#brandSub').textContent = 'LMS Hub';
    }
    if (DB.institusi.LogoURL) {
      $('#brandMark').innerHTML = '<img src="' + esc(DB.institusi.LogoURL) + '" alt="Logo institusi">';
    }
    perbaruiAvatarTopbar();

    renderNavigation(AppState.user.peran);
    $('#authScreen').hidden = true;
    $('#appShell').hidden = false;
    $('#bootOverlay').hidden = true;
    AppState.booted = true;

    /* Halaman pendaratan berasal dari server. Bila nilainya tidak dikenali
       frontend — misalnya backend dan frontend berbeda versi, atau id halaman
       berubah — jangan tinggalkan pengguna di layar kosong; jatuhkan ke
       beranda perannya. */
    const beranda = halamanUtama(AppState.user.peran);
    const tujuan = (landingPage && PAGES[landingPage]) ? landingPage : beranda;
    if (landingPage && !PAGES[landingPage]) {
      console.warn('[EduPortal] Halaman pendaratan "' + landingPage +
                   '" tidak dikenali frontend; dialihkan ke "' + beranda + '".');
    }
    navigateTo(tujuan, { noHistory: true });
  }).catch(function (err) {
    $('#bootOverlay').hidden = true;

    /* "Sesi berakhir" sudah ditangani sesiBerakhir() — jangan tumpuk pesan. */
    if (String(err.message).indexOf('Sesi berakhir') !== -1) return;

    tampilkanLogin();

    /* Bedakan backend tak terjangkau dari galat aplikasi biasa. Yang pertama
       butuh penjelasan langkah perbaikan, yang kedua cukup toast. */
    if (/menghubungi server|tidak membalas|HTTP|JSON|di-deploy|API/i.test(err.message)) {
      setStatusAPI('gagal', 'Backend tidak terjangkau');
      tampilkanGalatKoneksi([err.message]);
    } else {
      showToast(err.message, 'error');
    }
  });
}

function halamanUtama(peran) {
  return { 'Super Admin': 'admin-dashboard', 'Tim Akademik': 'akademik-dashboard',
           'Dosen': 'dosen-dashboard', 'Siswa': 'siswa-dashboard' }[peran] || 'siswa-dashboard';
}

/** Muat ulang data aplikasi tanpa keluar dari halaman aktif. */
function refreshData(diamDiam) {
  return api('getInitialAppData', AppState.sessionToken).then(function (res) {
    if (res.success) {
      Object.keys(res.data).forEach(function (k) { DB[k] = res.data[k]; });
      DB.institusi = res.data.institusi || {};
      DB.fitur = res.data.fitur || {};
      if (!diamDiam) navigateTo(AppState.currentPage, { noHistory: true });
    }
    return res;
  });
}

/* ------------------------------------------------------- 9. NAVIGASI ----- */
const MENU = {
  'Super Admin': [
    { grup: 'Utama' },
    { id: 'admin-dashboard', ikon: 'layout-dashboard', label: 'Dashboard' },
    { id: 'admin-master',    ikon: 'library',          label: 'Data Master' },
    { id: 'admin-pengguna',  ikon: 'users',            label: 'Pengguna' },
    { id: 'admin-siswa',     ikon: 'graduation-cap',   label: 'Siswa/Mahasiswa' },
    { id: 'admin-jadwal',    ikon: 'calendar',         label: 'Jadwal' },
    { grup: 'Akademik' },
    { id: 'laporan',         ikon: 'bar-chart',        label: 'Laporan' },
    { id: 'admin-spp',       ikon: 'wallet',           label: 'Manajemen Tagihan', fitur: 'spp' },
    { id: 'admin-notifikasi',ikon: 'megaphone',        label: 'Notifikasi' },
    { grup: 'Sistem' },
    { id: 'pengaturan',      ikon: 'settings',         label: 'Pengaturan' }
  ],
  'Tim Akademik': [
    { grup: 'Utama' },
    { id: 'akademik-dashboard', ikon: 'layout-dashboard', label: 'Dashboard' },
    { id: 'akademik-validasi',  ikon: 'clipboard-check',  label: 'Validasi Nilai', badge: 'pendingValidasi' },
    { id: 'akademik-riwayat',   ikon: 'clock',            label: 'Riwayat Validasi' },
    { grup: 'Akademik' },
    { id: 'akademik-remedial',  ikon: 'refresh',          label: 'Remedial & Ulang' },
    { id: 'laporan',            ikon: 'bar-chart',        label: 'Laporan Akademik' },
    { id: 'profil',             ikon: 'user',             label: 'Profil Saya' }
  ],
  'Dosen': [
    { grup: 'Mengajar' },
    { id: 'dosen-dashboard', ikon: 'layout-dashboard', label: 'Dashboard' },
    { id: 'dosen-kelas',     ikon: 'book-open',        label: 'Kelas Saya' },
    { id: 'dosen-materi',    ikon: 'folder',           label: 'Materi' },
    { id: 'dosen-tugas',     ikon: 'clipboard-list',   label: 'Tugas & Quiz' },
    { id: 'rekaman',         ikon: 'mic',              label: 'Rekam Pertemuan' },
    { grup: 'Penilaian' },
    { id: 'dosen-absensi',   ikon: 'calendar-check',   label: 'Absensi' },
    { id: 'dosen-nilai',     ikon: 'star',             label: 'Input Nilai' },
    { id: 'laporan',         ikon: 'bar-chart',        label: 'Laporan Kelas' },
    { id: 'profil',          ikon: 'user',             label: 'Profil Saya' }
  ],
  'Siswa': [
    { grup: 'Belajar' },
    { id: 'siswa-dashboard', ikon: 'layout-dashboard', label: 'Dashboard' },
    { id: 'siswa-kursus',    ikon: 'book-open',        label: 'Portal Belajar' },
    { id: 'siswa-tugas',     ikon: 'clipboard-list',   label: 'Tugas & Quiz', badge: 'tugasBelum' },
    { id: 'jadwal',          ikon: 'calendar',         label: 'Jadwal Saya' },
    { grup: 'Akademik' },
    { id: 'siswa-absensi',   ikon: 'calendar-check',   label: 'Absensi Saya' },
    { id: 'siswa-nilai',     ikon: 'award',            label: 'Nilai & Transkrip' },
    { id: 'rekaman',         ikon: 'mic',              label: 'Rekam Pertemuan', ketuaOnly: true },
    { id: 'siswa-spp',       ikon: 'wallet',           label: 'Status Tagihan', fitur: 'spp' },
    { id: 'profil',          ikon: 'user',             label: 'Profil Saya' }
  ]
};

function renderNavigation(peran) {
  const items = MENU[peran] || [];
  const nav = $('#sidebarNav');
  const isKetua = String((DB.profil || {}).IsKetuaKelas).toUpperCase() === 'TRUE';

  nav.innerHTML = items.filter(function (m) {
    if (m.fitur && !DB.fitur[m.fitur]) return false;
    if (m.ketuaOnly && !isKetua) return false;
    return true;
  }).map(function (m) {
    if (m.grup) return '<div class="nav-group-label">' + esc(m.grup) + '</div>';
    let badge = '';
    if (m.badge === 'pendingValidasi' && DB.statistik && DB.statistik.pendingValidasi) {
      badge = '<span class="nav-badge">' + DB.statistik.pendingValidasi + '</span>';
    }
    if (m.badge === 'tugasBelum' && DB.statistik && DB.statistik.tugasBelumDikumpulkan) {
      badge = '<span class="nav-badge">' + DB.statistik.tugasBelumDikumpulkan + '</span>';
    }
    return '<a class="nav-link" href="javascript:void(0)" data-page="' + m.id + '" ' +
           'onclick="navigateTo(\'' + m.id + '\')">' + svgIcon(m.ikon, 20) +
           '<span>' + esc(m.label) + '</span>' + badge + '</a>';
  }).join('');

  /* Tombol "Ganti Portal" hanya relevan bila pengguna punya >1 peran; di sini
     dipakai sebagai pintasan kembali ke halaman utama peran. */
  $('#btnQuickUpload').hidden = (peran === 'Tim Akademik');
}

/**
 * ROUTER SPA — satu-satunya cara berpindah halaman.
 * 0ms: hanya menukar innerHTML, tidak ada panggilan server untuk navigasi.
 */
function navigateTo(pageId, opsi) {
  const o = opsi || {};
  if (!pageId) return;
  if (AppState.currentPage && !o.noHistory && AppState.currentPage !== pageId) {
    AppState.history.push(AppState.currentPage);
  }

  const render = PAGES[pageId];
  if (!render) { showToast('Halaman "' + pageId + '" belum tersedia.', 'warning'); return; }

  /* Bersihkan chart lama agar tidak bocor memori */
  Object.keys(AppState.charts).forEach(function (k) {
    try { AppState.charts[k].destroy(); } catch (e) {}
    delete AppState.charts[k];
  });
  hentikanRekamanJikaAda(pageId);

  AppState.currentPage = pageId;
  AppState.pageCtx = o.ctx || {};

  const container = $('#app-container');
  let hasil;
  try { hasil = render(o.ctx || {}); }
  catch (err) {
    console.error(err);
    hasil = '<div class="empty"><div class="empty-ico">' + svgIcon('alert-triangle', 28) + '</div>' +
            '<h3>Gagal menampilkan halaman</h3><p>' + esc(err.message) + '</p></div>';
  }
  container.innerHTML = typeof hasil === 'string' ? hasil : '';
  renderIcons(container);

  $$('#sidebarNav .nav-link').forEach(function (a) {
    a.classList.toggle('active', a.dataset.page === pageId);
  });
  const label = (MENU[AppState.user.peran] || []).filter(function (m) { return m.id === pageId; })[0];
  $('#topbarTitle').textContent = label ? label.label : (JUDUL_HALAMAN[pageId] || 'EduPortal');

  if (typeof PAGE_INIT[pageId] === 'function') {
    setTimeout(function () { try { PAGE_INIT[pageId](o.ctx || {}); } catch (e) { console.error(e); } }, 10);
  }

  $('#mainContent').scrollTop = 0;
  window.scrollTo(0, 0);
  toggleSidebar(false);
}

function goBack() {
  const prev = AppState.history.pop();
  if (prev) navigateTo(prev, { noHistory: true });
  else navigateTo(halamanUtama(AppState.user.peran), { noHistory: true });
}

function toggleSidebar(buka) {
  const sb = $('#sidebar'), bd = $('#navBackdrop');
  if (!sb) return;
  const target = buka === undefined ? !sb.classList.contains('open') : buka;
  sb.classList.toggle('open', target);
  bd.hidden = !target;
}

function openSwitchPortal() {
  navigateTo(halamanUtama(AppState.user.peran));
  showToast('Anda masuk sebagai ' + AppState.user.peran + '.', 'info');
}

/* -------------------------------------------- 10. PENCARIAN GLOBAL ------- */
const handleGlobalSearch = debounce(function (q) {
  const box = $('#searchResults');
  const kata = String(q || '').trim().toLowerCase();
  if (kata.length < 2) { box.hidden = true; box.innerHTML = ''; return; }

  /* PRINSIP 2: cari dari cache klien — 0ms, tanpa panggilan server */
  const hasil = [];
  const push = function (label, sub, page, ctx) { if (hasil.length < 12) hasil.push({ label, sub, page, ctx }); };

  (DB.mapel || []).forEach(function (m) {
    if ((m.Nama + ' ' + m.Kode).toLowerCase().indexOf(kata) !== -1)
      push(m.Nama, 'Mata pelajaran · ' + m.Kode, AppState.user.peran === 'Siswa' ? 'siswa-kursus' : 'dosen-kelas');
  });
  (DB.materi || []).forEach(function (m) {
    if (String(m.Judul).toLowerCase().indexOf(kata) !== -1)
      push(m.Judul, 'Materi · ' + namaMapel(m.MapelID), AppState.user.peran === 'Siswa' ? 'siswa-kursus' : 'dosen-materi');
  });
  (DB.tugas || []).forEach(function (t) {
    if (String(t.Judul).toLowerCase().indexOf(kata) !== -1)
      push(t.Judul, 'Tugas · ' + namaMapel(t.MapelID), AppState.user.peran === 'Siswa' ? 'siswa-tugas' : 'dosen-tugas');
  });
  (DB.siswa || []).forEach(function (s) {
    if ((s.Nama + ' ' + s.NIM).toLowerCase().indexOf(kata) !== -1)
      push(s.Nama, 'Siswa · ' + s.NIM, 'admin-siswa');
  });

  box.innerHTML = hasil.length
    ? hasil.map(function (h, i) {
        return '<button class="sr-item" data-i="' + i + '">' + esc(h.label) +
               '<small>' + esc(h.sub) + '</small></button>';
      }).join('')
    : '<div class="sr-empty">Tidak ada hasil untuk “' + esc(q) + '”.</div>';
  box.hidden = false;

  $$('.sr-item', box).forEach(function (b) {
    b.onclick = function () {
      const h = hasil[Number(b.dataset.i)];
      box.hidden = true; $('#globalSearch').value = '';
      navigateTo(h.page, { ctx: h.ctx });
    };
  });
}, 250);

document.addEventListener('click', function (e) {
  const box = $('#searchResults');
  if (box && !box.hidden && !e.target.closest('.topbar-search')) box.hidden = true;
});

/* --------------------------------------------- 11. BERKAS & UNDUHAN ------ */
/** Membaca <input type=file> menjadi objek base64 siap kirim ke backend. */
function bacaBerkas(input) {
  return new Promise(function (resolve, reject) {
    const f = input && input.files && input.files[0];
    if (!f) { resolve(null); return; }
    if (f.size > 2 * 1024 * 1024) {
      reject(new Error('Ukuran berkas ' + (f.size / 1048576).toFixed(2) + 'MB melebihi batas 2MB.'));
      return;
    }
    const r = new FileReader();
    r.onload = function () {
      resolve({ name: f.name, mimeType: f.type || 'application/octet-stream',
                size: f.size, data: r.result.split(',')[1] });
    };
    r.onerror = function () { reject(new Error('Gagal membaca berkas.')); };
    r.readAsDataURL(f);
  });
}

/** Unduh hasil base64 dari server tanpa membuka tab baru. */
function unduhBase64(base64, mimeType, fileName) {
  try {
    const bin = atob(base64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const blob = new Blob([buf], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    showToast('Berkas “' + fileName + '” diunduh.', 'success');
  } catch (e) {
    showToast('Gagal mengunduh: ' + e.message, 'error');
  }
}

/** Menyiapkan area drag & drop + tombol pilih berkas. */
function pasangDropzone(zoneId, inputId, pillId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;
  const tampil = function () {
    const pill = document.getElementById(pillId);
    if (!pill) return;
    const f = input.files[0];
    pill.innerHTML = f
      ? svgIcon('file-text', 16) + '<span>' + esc(f.name) + ' · ' + (f.size / 1024).toFixed(0) + ' KB</span>' +
        '<button type="button" onclick="hapusBerkas(\'' + inputId + '\',\'' + pillId + '\')" aria-label="Hapus berkas">' + svgIcon('x', 14) + '</button>'
      : '';
    pill.hidden = !f;
  };
  zone.onclick = function () { input.click(); };
  zone.ondragover = function (e) { e.preventDefault(); zone.classList.add('drag'); };
  zone.ondragleave = function () { zone.classList.remove('drag'); };
  zone.ondrop = function (e) {
    e.preventDefault(); zone.classList.remove('drag');
    if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; tampil(); }
  };
  input.onchange = tampil;
}
function hapusBerkas(inputId, pillId) {
  const i = document.getElementById(inputId);
  if (i) i.value = '';
  const p = document.getElementById(pillId);
  if (p) { p.innerHTML = ''; p.hidden = true; }
}

/* ------------------------------------------------------- 12. TABEL ------- */
/**
 * Renderer tabel generik dengan pencarian & paginasi lokal (0ms).
 * @param {Object} o {id, kolom:[{key,label,render,cls}], data, perPage, kosong, aksi}
 */
const TABLE_STATE = {};
function tabelGenerik(o) {
  TABLE_STATE[o.id] = { data: o.data || [], filtered: o.data || [], page: 1,
                        perPage: o.perPage || 10, kolom: o.kolom, kosong: o.kosong, cari: '' };
  return '<div class="table-wrap"><table class="tbl" id="' + o.id + '"><thead><tr>' +
         o.kolom.map(function (k) { return '<th class="' + (k.cls || '') + '">' + esc(k.label) + '</th>'; }).join('') +
         '</tr></thead><tbody id="' + o.id + '-body"></tbody></table></div>' +
         '<div class="table-foot" id="' + o.id + '-foot"></div>';
}

function gambarTabel(id) {
  const st = TABLE_STATE[id];
  if (!st) return;
  const body = document.getElementById(id + '-body');
  const foot = document.getElementById(id + '-foot');
  if (!body) return;

  const total = st.filtered.length;
  const maxPage = Math.max(1, Math.ceil(total / st.perPage));
  st.page = Math.min(st.page, maxPage);
  const mulai = (st.page - 1) * st.perPage;
  const rows = st.filtered.slice(mulai, mulai + st.perPage);

  body.innerHTML = rows.length
    ? rows.map(function (r, i) {
        return '<tr class="' + (r.__rowCls || '') + '">' + st.kolom.map(function (k) {
          const isi = k.render ? k.render(r, mulai + i) : esc(r[k.key]);
          return '<td class="' + (k.cls || '') + '">' + isi + '</td>';
        }).join('') + '</tr>';
      }).join('')
    : '<tr><td colspan="' + st.kolom.length + '"><div class="empty" style="padding:40px 16px">' +
      '<div class="empty-ico">' + svgIcon('inbox', 28) + '</div><h3>Belum ada data</h3><p>' +
      esc(st.kosong || 'Data akan muncul di sini setelah tersedia.') + '</p></div></td></tr>';

  if (foot) {
    let pager = '';
    if (maxPage > 1) {
      const btn = function (l, p, aktif, disabled) {
        return '<button ' + (aktif ? 'class="active" ' : '') + (disabled ? 'disabled ' : '') +
               'onclick="pindahHalamanTabel(\'' + id + '\',' + p + ')">' + l + '</button>';
      };
      pager = '<div class="pager">' + btn('‹', st.page - 1, false, st.page === 1);
      const dari = Math.max(1, st.page - 2), sampai = Math.min(maxPage, dari + 4);
      for (let p = dari; p <= sampai; p++) pager += btn(p, p, p === st.page, false);
      pager += btn('›', st.page + 1, false, st.page === maxPage) + '</div>';
    }
    foot.innerHTML = '<span>Menampilkan ' + (total ? mulai + 1 : 0) + '–' +
      Math.min(mulai + st.perPage, total) + ' dari ' + total + ' entri</span>' + pager;
  }
  renderIcons(body);
}

function pindahHalamanTabel(id, p) {
  const st = TABLE_STATE[id]; if (!st) return;
  st.page = p; gambarTabel(id);
}

function cariTabel(id, q) {
  const st = TABLE_STATE[id]; if (!st) return;
  const kata = String(q || '').trim().toLowerCase();
  st.cari = kata;
  st.filtered = !kata ? st.data : st.data.filter(function (r) {
    return Object.keys(r).some(function (k) {
      return String(r[k]).toLowerCase().indexOf(kata) !== -1;
    });
  });
  st.page = 1;
  gambarTabel(id);
}
const cariTabelDebounced = debounce(cariTabel, 220);

function setDataTabel(id, data) {
  const st = TABLE_STATE[id]; if (!st) return;
  st.data = data; st.page = 1;
  cariTabel(id, st.cari);
}

/* -------------------------------------------------------- 13. CHART ------ */
function warnaTema() {
  const cs = getComputedStyle(document.documentElement);
  return {
    primary: cs.getPropertyValue('--primary').trim() || '#022448',
    accent:  cs.getPropertyValue('--accent').trim()  || '#feae2c',
    ink:     cs.getPropertyValue('--on-surface-variant').trim() || '#43474e',
    grid:    cs.getPropertyValue('--border-soft').trim() || '#edf2f7',
    sukses:  cs.getPropertyValue('--success').trim() || '#0f7b45',
    error:   cs.getPropertyValue('--error').trim() || '#ba1a1a',
    info:    cs.getPropertyValue('--info').trim() || '#2d486d'
  };
}

function buatChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el || typeof Chart === 'undefined') return null;
  if (AppState.charts[canvasId]) { try { AppState.charts[canvasId].destroy(); } catch (e) {} }
  const w = warnaTema();
  const base = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: w.ink, font: { family: 'Inter', size: 12 }, usePointStyle: true, boxWidth: 8 } },
      tooltip: { backgroundColor: '#213145', padding: 10, cornerRadius: 8, titleFont: { family: 'Plus Jakarta Sans' }, bodyFont: { family: 'Inter' } }
    },
    scales: config.type === 'doughnut' || config.type === 'pie' ? {} : {
      x: { grid: { display: false }, ticks: { color: w.ink, font: { family: 'Inter', size: 11 } } },
      y: { grid: { color: w.grid }, border: { display: false }, ticks: { color: w.ink, font: { family: 'Inter', size: 11 } }, beginAtZero: true }
    }
  };
  config.options = Object.assign(base, config.options || {});
  AppState.charts[canvasId] = new Chart(el, config);
  return AppState.charts[canvasId];
}

/* ------------------------------------------ 14. KOMPONEN HTML PEMBANTU --- */
function kpiCard(o) {
  return '<article class="kpi" style="--kpi-tint:' + (o.tint || 'var(--sc)') + ';--kpi-ink:' + (o.ink || 'var(--primary)') + '">' +
    '<div class="kpi-top"><div class="kpi-ico">' + svgIcon(o.ikon, 22) + '</div>' +
    (o.tag ? '<span class="kpi-tag" style="background:' + (o.tagBg || 'var(--warning-soft)') + ';color:' + (o.tagInk || 'var(--warning)') + '">' + esc(o.tag) + '</span>' : '') +
    '</div><p class="kpi-label">' + esc(o.label) + '</p>' +
    '<div class="kpi-value">' + o.nilai + (o.satuan ? ' <small>' + esc(o.satuan) + '</small>' : '') + '</div></article>';
}

function badgeStatus(status) {
  const map = {
    'Draft':      ['badge-neutral', 'Draf'],
    'Submitted':  ['badge-warn',    'Menunggu Validasi'],
    'Validated':  ['badge-success', 'Tervalidasi'],
    'Returned':   ['badge-error',   'Perlu Revisi'],
    'Hadir':      ['badge-success', 'Hadir'],
    'Sakit':      ['badge-warn',    'Sakit'],
    'Izin':       ['badge-info',    'Izin'],
    'Alpa':       ['badge-error',   'Alpa'],
    'Aktif':      ['badge-success', 'Aktif'],
    'Nonaktif':   ['badge-neutral', 'Nonaktif'],
    'Lunas':      ['badge-success', 'Lunas'],
    'Belum Bayar':['badge-error',   'Belum Bayar'],
    'Diusulkan':  ['badge-warn',    'Diusulkan'],
    'Selesai':    ['badge-success', 'Selesai']
  };
  const m = map[status] || ['badge-neutral', status || '-'];
  return '<span class="badge ' + m[0] + '">' + esc(m[1]) + '</span>';
}

function kosongState(ikon, judul, pesan, tombol) {
  return '<div class="empty"><div class="empty-ico">' + svgIcon(ikon, 28) + '</div>' +
         '<h3>' + esc(judul) + '</h3><p>' + esc(pesan) + '</p>' + (tombol || '') + '</div>';
}

function headerHalaman(judul, sub, aksi) {
  return '<header class="page-head"><div><h2>' + esc(judul) + '</h2>' +
         (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
         (aksi ? '<div class="head-actions">' + aksi + '</div>' : '') + '</header>';
}

function opsiSelect(list, valueKey, labelKey, terpilih, placeholder) {
  return (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') +
    (list || []).map(function (x) {
      const v = typeof x === 'string' ? x : x[valueKey];
      const l = typeof x === 'string' ? x : (typeof labelKey === 'function' ? labelKey(x) : x[labelKey]);
      return '<option value="' + esc(v) + '"' + (String(v) === String(terpilih) ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
}

/** Ambil nilai form sebagai objek {name: value}. */
function nilaiForm(formId) {
  const f = document.getElementById(formId);
  const out = {};
  if (!f) return out;
  $$('[name]', f).forEach(function (el) {
    if (el.type === 'checkbox') out[el.name] = el.checked ? 'TRUE' : 'FALSE';
    else out[el.name] = el.value;
  });
  return out;
}

/** Validasi HTML5 + penanda visual. */
function validForm(formId) {
  const f = document.getElementById(formId);
  if (!f) return true;
  let ok = true;
  $$('[required]', f).forEach(function (el) {
    const kosong = !String(el.value || '').trim();
    el.classList.toggle('invalid', kosong);
    if (kosong) ok = false;
  });
  if (!ok) showToast('Lengkapi seluruh kolom yang wajib diisi.', 'warning');
  return ok;
}

/* ------------------------------------------------- 15. AKSI CEPAT -------- */
function quickUpload() {
  const p = AppState.user.peran;
  if (p === 'Dosen' || p === 'Super Admin') formMateri();
  else if (p === 'Siswa') navigateTo('siswa-tugas');
  else showToast('Tidak ada aksi unggah untuk peran Anda.', 'info');
}

function openNotifikasi() {
  const items = daftarNotifikasi();
  openModal({
    title: 'Notifikasi',
    body: items.length
      ? '<div class="stack">' + items.map(function (n) {
          return '<div class="list-item" style="padding:12px 0;border-bottom:1px solid var(--border-soft)">' +
                 '<div class="li-ico" style="background:' + n.tint + '">' + svgIcon(n.ikon, 20) + '</div>' +
                 '<div class="li-main"><strong>' + esc(n.judul) + '</strong><small>' + esc(n.sub) + '</small></div></div>';
        }).join('') + '</div>'
      : kosongState('bell', 'Tidak ada notifikasi', 'Semua sudah terkendali. Notifikasi baru akan muncul di sini.'),
    foot: '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>'
  });
  $('#notifDot').hidden = true;
  LS.set('notifRead', Date.now());
}

/** Notifikasi dibangun dari data cache klien — tidak perlu panggilan server. */
function daftarNotifikasi() {
  const out = [];
  const p = AppState.user.peran;
  const st = DB.statistik || {};

  if (p === 'Tim Akademik' && st.pendingValidasi) {
    out.push({ judul: st.pendingValidasi + ' nilai menunggu validasi',
               sub: 'Buka menu Validasi Nilai untuk memprosesnya.', ikon: 'clipboard-check', tint: 'var(--warning-soft)' });
  }
  if (p === 'Dosen' && st.belumDinilai) {
    out.push({ judul: st.belumDinilai + ' pengumpulan belum dinilai',
               sub: 'Periksa rekap pengumpulan tugas.', ikon: 'file-check', tint: 'var(--info-soft)' });
  }
  if (p === 'Siswa') {
    (DB.tugas || []).forEach(function (t) {
      const sisa = (new Date(t.Deadline) - new Date()) / 86400000;
      const sudah = (DB.pengumpulanSaya || []).some(function (x) { return x.TugasID === t.ID; });
      if (!sudah && sisa > 0 && sisa <= 3) {
        out.push({ judul: 'Tenggat: ' + t.Judul, sub: namaMapel(t.MapelID) + ' · ' + fmtTgl(t.Deadline, true),
                   ikon: 'clock', tint: 'var(--warning-soft)' });
      }
      if (!sudah && sisa <= 0) {
        out.push({ judul: 'Terlambat: ' + t.Judul, sub: 'Tenggat telah lewat ' + fmtTgl(t.Deadline),
                   ikon: 'alert-triangle', tint: 'var(--error-soft)' });
      }
    });
    (DB.statusNilai || []).filter(function (s) { return s.Status === 'Validated'; }).slice(-3).forEach(function (s) {
      out.push({ judul: 'Nilai tersedia: ' + namaMapel(s.MapelID), sub: 'Sudah divalidasi Tim Akademik.',
                 ikon: 'award', tint: 'var(--success-soft)' });
    });
  }
  if (p === 'Super Admin') {
    (DB.logNotif || []).slice(-6).reverse().forEach(function (l) {
      out.push({ judul: l.Subjek, sub: l.Channel + ' → ' + l.Penerima + ' · ' + l.Status,
                 ikon: l.Channel === 'WA' ? 'send' : 'mail', tint: 'var(--sc)' });
    });
  }
  return out;
}

function tandaiNotifikasiBaru() {
  $('#notifDot').hidden = daftarNotifikasi().length === 0;
}

/* ==========================================================================
   16b. AVATAR, PERIODE, NOMOR WA  (Upgrade 1, 6, 7, 12)
   ========================================================================== */

/** Avatar dengan foto bila tersedia; jatuh ke inisial nama bila belum ada. */
function avatarHtml(nama, fotoURL, ukuran, kelasTambahan) {
  const gaya = ukuran ? ' style="width:' + ukuran + 'px;height:' + ukuran + 'px;font-size:' +
                        Math.max(10, Math.round(ukuran / 2.6)) + 'px"' : '';
  const cls = 'avatar' + (kelasTambahan ? ' ' + kelasTambahan : '');
  if (fotoURL) {
    return '<span class="' + cls + ' has-photo"' + gaya + '>' +
           '<img src="' + esc(fotoURL) + '" alt="Foto ' + esc(nama || '') + '" loading="lazy" ' +
           'onerror="this.parentNode.classList.remove(\'has-photo\');this.parentNode.textContent=\'' +
           esc(inisial(nama)) + '\'"></span>';
  }
  return '<span class="' + cls + '"' + gaya + '>' + esc(inisial(nama)) + '</span>';
}

/** Menyegarkan avatar pada topbar setelah foto profil diganti. */
function perbaruiAvatarTopbar() {
  const el = $('#topbarAvatar');
  if (!el || !AppState.user) return;
  const foto = AppState.user.fotoURL || (DB.profil || {}).FotoURL || '';
  if (foto) {
    el.classList.add('has-photo');
    el.innerHTML = '<img src="' + esc(foto) + '" alt="Foto profil" ' +
      'onerror="this.parentNode.classList.remove(\'has-photo\');this.parentNode.textContent=\'' +
      esc(inisial(AppState.user.nama)) + '\'">';
  } else {
    el.classList.remove('has-photo');
    el.textContent = inisial(AppState.user.nama);
  }
}

/** Avatar seorang siswa/dosen berdasarkan ID pada koleksi terkait. */
function avatarSiswa(siswaId, ukuran) {
  const s = byId(DB.siswa, siswaId);
  return avatarHtml(s.Nama, s.FotoURL, ukuran);
}
function avatarDosen(dosenId, ukuran) {
  const d = byId(DB.dosen, dosenId);
  return avatarHtml(d.Nama, d.FotoURL, ukuran);
}

/** Periode akademik yang sedang aktif (satu-satunya). */
function periodeAktif() {
  return (DB.periode || []).filter(function (p) {
    return String(p.Status).toLowerCase() === 'aktif'; })[0] || {};
}

/** Daftar tahun ajaran unik dari master Periode — sumber semua dropdown. */
function daftarTahunAjaran() {
  const out = [];
  (DB.periode || []).forEach(function (p) {
    if (p.TahunAjaran && out.indexOf(p.TahunAjaran) === -1) out.push(p.TahunAjaran);
  });
  return out.sort().reverse();
}

function daftarTahun() {
  const out = [];
  (DB.periode || []).forEach(function (p) {
    if (p.Tahun && out.indexOf(String(p.Tahun)) === -1) out.push(String(p.Tahun));
  });
  return out.sort().reverse();
}

/** <select> tahun ajaran siap pakai. Nilai bawaan = periode aktif. */
function selectTahunAjaran(nama, terpilih, atribut) {
  const list = daftarTahunAjaran();
  const nilai = terpilih || periodeAktif().TahunAjaran || list[0] || '';
  return '<select class="select" name="' + nama + '" id="f_' + nama + '"' + (atribut || '') + '>' +
    (list.length ? opsiSelect(list, null, null, nilai)
                 : '<option value="">— Belum ada periode —</option>') + '</select>';
}

function selectTahun(nama, terpilih, atribut) {
  const list = daftarTahun();
  return '<select class="select" name="' + nama + '" id="f_' + nama + '"' + (atribut || '') + '>' +
    '<option value="">— Pilih —</option>' + opsiSelect(list, null, null, terpilih) + '</select>';
}

/** Normalisasi nomor WA di sisi klien: selalu tampil berawalan 0. */
function rapikanHP(no) {
  if (!no) return '';
  let n = String(no).replace(/[^0-9]/g, '');
  if (!n) return '';
  if (n.indexOf('62') === 0 && n.length > 10) n = '0' + n.substring(2);
  else if (n.charAt(0) !== '0') n = '0' + n;
  return n;
}

/** Pasang perapian otomatis pada setiap input nomor WhatsApp di dalam form. */
function pasangFormatHP(root) {
  $$('input[name="NoHP"], input[name="NoHPWali"], input[name="Telepon"]', root || document)
    .forEach(function (el) {
      el.setAttribute('inputmode', 'numeric');
      el.addEventListener('blur', function () { el.value = rapikanHP(el.value); });
    });
}

/* ==========================================================================
   16c. MESIN IMPOR EXCEL / CSV  (Upgrade 4, 5, 9)
   ========================================================================== */

/** Definisi kolom templat — harus sama persis dengan SPEK_IMPOR di Modul.gs. */
const SPEK_IMPOR_KLIEN = {
  siswa: { label: 'Siswa / Mahasiswa',
    kolom: ['NIM','Nama','Email','NoHP','KodeKelas','KodeJurusan','Angkatan','JenisKelamin',
            'TanggalLahir','Alamat','NamaWali','NoHPWali','IsKetuaKelas','Status'],
    wajib: ['NIM','Nama'],
    contoh: ['2026010002','Budi Santoso','budi@kampus.ac.id','081234567890','TI-2026-A','TI',
             '2026','Laki-laki','2007-05-14','Jl. Merdeka 10','Santoso','081234567891','FALSE','Aktif'],
    catatan: 'KodeKelas & KodeJurusan diisi KODE-nya, bukan nama panjang. Akun portal siswa dibuat otomatis.' },
  dosen: { label: 'Dosen / Guru',
    kolom: ['NIDN','Nama','Gelar','Email','NoHP','KodeJurusan','Alamat','Status'],
    wajib: ['Nama','Email'],
    contoh: ['0011223355','Siti Rahmawati','S.Pd., M.Pd.','siti@kampus.ac.id','081298765432','TI',
             'Jl. Cempaka 5','Aktif'],
    catatan: 'Email wajib diisi karena dipakai sebagai nama pengguna akun portal yang dibuat otomatis.' },
  mapel: { label: 'Mata Pelajaran / Kuliah',
    kolom: ['Kode','Nama','SKS','KodeKurikulum','KodeJurusan','Jenjang','Kategori','Deskripsi','Status'],
    wajib: ['Kode','Nama','SKS'],
    contoh: ['FIS-201','Fisika Dasar II','3','KUR-2026','TI','S1','Wajib','Mekanika lanjutan','Aktif'],
    catatan: 'Kode yang sudah ada akan diperbarui, bukan diduplikasi.' },
  kelas: { label: 'Kelas',
    kolom: ['Kode','Nama','KodeJurusan','Angkatan','NIDNWaliKelas','Ruangan','Kapasitas','Status'],
    wajib: ['Kode','Nama'],
    contoh: ['TI-2026-B','TI Angkatan 2026 Kelas B','TI','2026','0011223344','Ruang 303','40','Aktif'],
    catatan: 'NIDNWaliKelas diisi NIDN dosen yang sudah terdaftar.' },
  jadwal: { label: 'Jadwal Pembelajaran',
    kolom: ['Hari','JamMulai','JamSelesai','KodeMapel','KodeKelas','NIDNDosen','Ruangan','Semester','TahunAjaran'],
    wajib: ['Hari','JamMulai','JamSelesai','KodeMapel','KodeKelas','NIDNDosen'],
    contoh: ['Selasa','08:00','09:40','FIS-201','TI-2026-B','0011223344','Lab 2','1','2026/2027'],
    catatan: 'Format jam 24 urutan HH:MM. Konflik jadwal tetap ditandai merah setelah impor.' },
  jurusan: { label: 'Jurusan / Program Studi',
    kolom: ['Kode','Nama','Jenjang','Keterangan','Status'],
    wajib: ['Kode','Nama'],
    contoh: ['SI','Sistem Informasi','S1','Program studi baru','Aktif'],
    catatan: 'Isi jurusan lebih dulu sebelum mengimpor kelas, mata pelajaran, dan siswa.' }
};

const IMPOR = { jenis: null, baris: [], nama: '' };

/** Membuka wizard impor untuk satu jenis data. */
function bukaImpor(jenis) {
  const spek = SPEK_IMPOR_KLIEN[jenis];
  if (!spek) { showToast('Jenis impor tidak dikenal.', 'error'); return; }
  IMPOR.jenis = jenis; IMPOR.baris = []; IMPOR.nama = '';

  openModal({
    title: 'Impor ' + spek.label + ' dari Excel', size: 'wide',
    body:
      '<ol class="impor-langkah">' +
        '<li><b>Unduh templat</b> lalu isi datanya di Excel/Spreadsheet.</li>' +
        '<li><b>Unggah kembali</b> berkasnya (.xlsx, .xls, atau .csv).</li>' +
        '<li><b>Periksa pratinjau</b>, perbaiki bila ada tanda merah, lalu simpan.</li>' +
      '</ol>' +
      '<div class="alert alert-info"><i data-icon="info"></i><div><strong>Ketentuan kolom</strong>' +
      '<p>Kolom wajib: <b>' + spek.wajib.join(', ') + '</b>. ' + esc(spek.catatan) + '</p></div></div>' +
      '<div class="row" style="margin-bottom:14px">' +
        '<button class="btn btn-outline" onclick="unduhTemplatImpor(\'' + jenis + '\')">' +
        svgIcon('download', 18) + ' Unduh Templat</button>' +
        '<span class="muted text-sm">' + spek.kolom.length + ' kolom · maksimal 1.000 baris per unggahan</span>' +
      '</div>' +
      '<div class="dropzone" id="dzImpor"><div class="dz-ico">' + svgIcon('upload-cloud', 28) + '</div>' +
      '<div class="dz-title">Seret berkas Excel ke sini</div>' +
      '<p class="dz-sub">Mendukung .xlsx, .xls, dan .csv</p>' +
      '<span class="btn btn-outline btn-sm">Pilih Berkas</span></div>' +
      '<input type="file" id="fileImpor" accept=".xlsx,.xls,.csv" hidden>' +
      '<div id="imporPratinjau" class="mt4"></div>',
    foot: '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
      '<button class="btn btn-primary" id="btnSimpanImpor" disabled>' +
      svgIcon('check', 18) + ' Simpan ke Database</button>',
    onOpen: function () {
      const zone = $('#dzImpor'), input = $('#fileImpor');
      zone.onclick = function () { input.click(); };
      zone.ondragover = function (e) { e.preventDefault(); zone.classList.add('drag'); };
      zone.ondragleave = function () { zone.classList.remove('drag'); };
      zone.ondrop = function (e) {
        e.preventDefault(); zone.classList.remove('drag');
        if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; bacaBerkasImpor(); }
      };
      input.onchange = bacaBerkasImpor;
      $('#btnSimpanImpor').onclick = kirimImpor;
    }
  });
}

/** Membuat & mengunduh templat Excel berisi header + satu baris contoh. */
function unduhTemplatImpor(jenis) {
  const spek = SPEK_IMPOR_KLIEN[jenis];
  if (typeof XLSX === 'undefined') {
    /* Fallback CSV bila pustaka Excel gagal dimuat */
    const csv = spek.kolom.join(',') + '\n' + spek.contoh.map(function (c) { return '"' + c + '"'; }).join(',');
    unduhBase64(btoa(unescape(encodeURIComponent(csv))), 'text/csv', 'Templat_' + jenis + '.csv');
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet([spek.kolom, spek.contoh]);
  ws['!cols'] = spek.kolom.map(function (k) { return { wch: Math.max(12, k.length + 4) }; });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Templat');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  unduhBase64(wbout, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Templat_Impor_' + jenis + '.xlsx');
}

/** Membaca berkas Excel/CSV di peramban lalu menampilkan pratinjau. */
function bacaBerkasImpor() {
  const f = $('#fileImpor').files[0];
  if (!f) return;
  if (typeof XLSX === 'undefined') {
    showToast('Pustaka pembaca Excel belum termuat. Periksa koneksi internet lalu coba lagi.', 'error');
    return;
  }
  IMPOR.nama = f.name;
  const box = $('#imporPratinjau');
  box.innerHTML = '<div class="sk-line skeleton"></div><div class="sk-line skeleton"></div>';

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: false, raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      IMPOR.baris = rows.filter(function (r) {
        return Object.keys(r).some(function (k) { return String(r[k]).trim() !== ''; });
      });
      tampilkanPratinjauImpor();
    } catch (err) {
      box.innerHTML = '<div class="alert alert-error">' + svgIcon('alert-circle', 20) +
        '<div><strong>Berkas tidak dapat dibaca</strong><p>' + esc(err.message) + '</p></div></div>';
    }
  };
  reader.onerror = function () { showToast('Gagal membaca berkas.', 'error'); };
  reader.readAsArrayBuffer(f);
}

function tampilkanPratinjauImpor() {
  const spek = SPEK_IMPOR_KLIEN[IMPOR.jenis];
  const box = $('#imporPratinjau');
  const rows = IMPOR.baris;

  if (!rows.length) {
    box.innerHTML = '<div class="alert alert-warn">' + svgIcon('alert-triangle', 20) +
      '<div><strong>Berkas kosong</strong><p>Tidak ada baris data yang terbaca.</p></div></div>';
    $('#btnSimpanImpor').disabled = true;
    return;
  }

  /* Validasi ringan di klien: kolom hilang & kolom wajib kosong */
  const kolomAda = Object.keys(rows[0]);
  const kolomHilang = spek.wajib.filter(function (k) { return kolomAda.indexOf(k) === -1; });
  const masalah = {};
  rows.forEach(function (r, i) {
    const p = [];
    spek.wajib.forEach(function (w) {
      if (String(r[w] === undefined ? '' : r[w]).trim() === '') p.push(w + ' kosong');
    });
    if (p.length) masalah[i] = p.join(', ');
  });
  const jmlMasalah = Object.keys(masalah).length;
  const tampil = rows.slice(0, 8);

  box.innerHTML =
    (kolomHilang.length
      ? '<div class="alert alert-error">' + svgIcon('alert-circle', 20) +
        '<div><strong>Kolom wajib tidak ditemukan</strong><p>' + esc(kolomHilang.join(', ')) +
        '. Gunakan templat yang disediakan agar nama kolomnya persis.</p></div></div>'
      : jmlMasalah
      ? '<div class="alert alert-warn">' + svgIcon('alert-triangle', 20) +
        '<div><strong>' + jmlMasalah + ' baris bermasalah</strong>' +
        '<p>Baris tersebut akan dilewati; sisanya tetap disimpan.</p></div></div>'
      : '<div class="alert alert-success">' + svgIcon('check-circle', 20) +
        '<div><strong>Berkas siap diimpor</strong><p>' + rows.length +
        ' baris terbaca dari ' + esc(IMPOR.nama) + '.</p></div></div>') +
    '<div class="table-wrap"><table class="tbl impor-tbl"><thead><tr><th>#</th>' +
    spek.kolom.map(function (k) {
      return '<th>' + esc(k) + (spek.wajib.indexOf(k) !== -1 ? ' <span class="req">*</span>' : '') + '</th>';
    }).join('') + '</tr></thead><tbody>' +
    tampil.map(function (r, i) {
      return '<tr class="' + (masalah[i] ? 'row-danger' : '') + '"><td>' + (i + 2) + '</td>' +
        spek.kolom.map(function (k) {
          const v = r[k] === undefined ? '' : r[k];
          return '<td>' + (String(v).trim() === '' ? '<span class="muted">—</span>' : esc(v)) + '</td>';
        }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>' +
    (rows.length > tampil.length
      ? '<p class="help">Menampilkan 8 baris pertama dari ' + rows.length + ' baris.</p>' : '');

  renderIcons(box);
  $('#btnSimpanImpor').disabled = kolomHilang.length > 0;
}

function kirimImpor() {
  const btn = $('#btnSimpanImpor');
  btn.disabled = true; btn.innerHTML = svgIcon('refresh', 18) + ' Menyimpan…';
  api('apiImportData', AppState.sessionToken, IMPOR.jenis, IMPOR.baris).then(function (res) {
    btn.disabled = false; btn.innerHTML = svgIcon('check', 18) + ' Simpan ke Database';
    if (!res.success) {
      showToast(res.message, 'error');
      if (res.data && res.data.galat && res.data.galat.length) tampilkanGalatImpor(res.data.galat);
      return;
    }
    closeModal();
    showToast(res.message, 'success');
    if (res.data.galat && res.data.galat.length) setTimeout(function () { tampilkanGalatImpor(res.data.galat); }, 400);
    refreshData();
  }).catch(function (e) {
    btn.disabled = false; btn.innerHTML = svgIcon('check', 18) + ' Simpan ke Database';
    showToast(e.message, 'error');
  });
}

function tampilkanGalatImpor(galat) {
  openModal({
    title: 'Baris yang Dilewati (' + galat.length + ')', size: 'wide',
    body: '<p class="help">Perbaiki baris berikut pada berkas Excel Anda lalu unggah ulang. ' +
      'Baris lain sudah tersimpan dan tidak akan terduplikasi.</p>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>Baris</th><th>Data</th><th>Masalah</th></tr></thead><tbody>' +
      galat.map(function (g) {
        return '<tr><td class="num">' + esc(g.baris) + '</td><td>' + esc(g.isi || '-') + '</td>' +
               '<td style="color:var(--error)">' + esc(g.pesan) + '</td></tr>';
      }).join('') + '</tbody></table></div>',
    foot: '<button class="btn btn-primary" onclick="closeModal()">Mengerti</button>'
  });
}

/* ==========================================================================
   16d. IZIN MIKROFON & KAMERA — v2.0 NATIVE
   --------------------------------------------------------------------------
   APA YANG BERUBAH, DAN MENGAPA INI PENTING

   Versi 1.1 harus menempuh jalan memutar yang rumit: HtmlService selalu
   menyajikan aplikasi di dalam iframe bersarang milik Google (sandboxFrame →
   userHtmlFrame) pada origin *.googleusercontent.com, dan Google TIDAK
   menyertakan direktif `microphone` maupun `camera` pada atribut `allow`
   iframe tersebut. Akibatnya getUserMedia() SELALU ditolak — tidak peduli
   berapa kali pengguna menekan "Izinkan". Jalan keluarnya waktu itu adalah
   membuka jendela Perekam Eksternal yang di-host terpisah, lalu memulangkan
   transkripnya lewat postMessage.

   Pada v2.0 frontend berdiri di origin-nya sendiri (GitHub Pages), sehingga
   TIDAK ADA iframe induk yang membatasi. Mikrofon dan kamera berperilaku
   persis seperti di situs web biasa. Karena itu:

     • Perekam Eksternal, postMessage, dan pengawasan popup DIHAPUS.
     • Panduan "ini bukan salah setelan peramban Anda" DIHAPUS — pada v2.0
       setelan peramban memang relevan lagi, jadi panduannya kini benar.
     • Pemindai QR kamera untuk absensi barcode DIAKTIFKAN.

   Satu-satunya syarat yang tersisa: halaman WAJIB dilayani lewat HTTPS.
   GitHub Pages sudah HTTPS secara bawaan, begitu pula localhost saat
   pengembangan. Keduanya dianggap "secure context" oleh peramban.
   ========================================================================== */

/**
 * Apakah halaman berjalan di konteks aman (HTTPS / localhost)?
 * Mikrofon, kamera, dan geolokasi hanya bekerja pada konteks aman.
 */
function konteksAman() {
  if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
  return location.protocol === 'https:' ||
         location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

function deteksiPeramban() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Peramban';
}

/**
 * Meminta akses mikrofon.
 * Mengembalikan Promise<{ok:true, stream}> atau {ok:false, sebab:'…'}.
 * Tidak menampilkan modal apa pun — pemanggil yang memutuskan langkah lanjutan.
 */
function cobaAksesMikrofon() {
  if (!konteksAman()) {
    return Promise.resolve({ ok: false, sebab: 'tidak-aman' });
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return Promise.resolve({ ok: false, sebab: 'tidak-didukung' });
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  })
    .then(function (stream) { return { ok: true, stream: stream }; })
    .catch(function (err) {
      const nama = (err && err.name) || '';
      if (nama === 'NotAllowedError' || nama === 'SecurityError') {
        return { ok: false, sebab: 'ditolak', detail: err.message };
      }
      if (nama === 'NotFoundError' || nama === 'DevicesNotFoundError') return { ok: false, sebab: 'tidak-ada' };
      if (nama === 'NotReadableError' || nama === 'TrackStartError') return { ok: false, sebab: 'dipakai-aplikasi-lain' };
      if (nama === 'OverconstrainedError') return { ok: false, sebab: 'tidak-cocok' };
      return { ok: false, sebab: 'lain', detail: (err && err.message) || '' };
    });
}

/** Meminta akses kamera belakang untuk pemindaian QR absensi. */
function cobaAksesKamera() {
  if (!konteksAman()) return Promise.resolve({ ok: false, sebab: 'tidak-aman' });
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return Promise.resolve({ ok: false, sebab: 'tidak-didukung' });
  }
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(function (stream) {
      /* Stream ini hanya untuk memicu dialog izin; html5-qrcode membuka
         streamnya sendiri. Ditutup agar kamera tidak menyala ganda. */
      stream.getTracks().forEach(function (t) { t.stop(); });
      return { ok: true };
    })
    .catch(function (err) {
      const nama = (err && err.name) || '';
      if (nama === 'NotAllowedError' || nama === 'SecurityError') return { ok: false, sebab: 'ditolak' };
      if (nama === 'NotFoundError') return { ok: false, sebab: 'tidak-ada' };
      if (nama === 'NotReadableError') return { ok: false, sebab: 'dipakai-aplikasi-lain' };
      return { ok: false, sebab: 'lain', detail: (err && err.message) || '' };
    });
}

/** Membaca status izin tanpa memicu permintaan (bila didukung peramban). */
function cekStatusIzin(nama) {
  if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve('unknown');
  return navigator.permissions.query({ name: nama })
    .then(function (p) { return p.state; })
    .catch(function () { return 'unknown'; });
}

/** Alias historis — dipakai PAGE_INIT['rekaman']. */
function cekStatusMikrofon() { return cekStatusIzin('microphone'); }

/**
 * Panduan izin perangkat.
 * Pada v2.0 seluruh langkah di bawah BENAR-BENAR menyelesaikan masalah,
 * karena tidak ada lagi kebijakan iframe yang membatalkannya.
 *
 * @param {string} sebab     Hasil dari cobaAksesMikrofon()/cobaAksesKamera()
 * @param {string} detail    Pesan galat asli (opsional)
 * @param {string} perangkat 'mikrofon' | 'kamera'
 */
function tampilkanPanduanMikrofon(sebab, detail, perangkat) {
  const alat = perangkat || 'mikrofon';
  const Alat = alat.charAt(0).toUpperCase() + alat.slice(1);
  const peramban = deteksiPeramban();
  const androidChrome = /Android/i.test(navigator.userAgent);
  const iOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  /* ---------- Kasus: halaman tidak dilayani lewat HTTPS ---------- */
  if (sebab === 'tidak-aman') {
    openModal({
      title: Alat + ' Memerlukan HTTPS', size: '',
      body:
        '<div class="alert alert-error"><i data-icon="alert-circle"></i><div>' +
        '<strong>Halaman ini tidak dilayani lewat HTTPS</strong>' +
        '<p>Peramban hanya mengizinkan akses ' + alat + ' pada halaman yang aman. ' +
        'Alamat saat ini: <code>' + esc(location.origin) + '</code></p></div></div>' +
        '<ol class="panduan-mic">' +
        '<li>Bila aplikasi di-host di <b>GitHub Pages</b>, buka <b>Settings → Pages</b> ' +
        'lalu centang <b>Enforce HTTPS</b>.</li>' +
        '<li>Bila memakai domain sendiri, pastikan sertifikat SSL-nya aktif.</li>' +
        '<li>Untuk pengembangan lokal, gunakan <code>http://localhost</code> ' +
        '(bukan alamat IP), yang sudah dianggap aman oleh peramban.</li></ol>' +
        '<div class="alert alert-info"><i data-icon="edit"></i><div><strong>Tetap bisa lanjut</strong>' +
        '<p>Tekan <b>Ketik / Tempel Transkrip</b> untuk menuliskan catatan pertemuan secara manual.</p>' +
        '</div></div>',
      foot: '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>' +
            '<button class="btn btn-primary" id="btnKetikManual3">' + svgIcon('edit', 18) + ' Ketik / Tempel Transkrip</button>',
      onOpen: function () {
        $('#btnKetikManual3').onclick = function () { closeModal(); suntingTranskrip(); };
      }
    });
    return;
  }

  /* ---------- Langkah pemulihan izin per peramban ---------- */
  const langkah = {
    'Chrome': ['Klik ikon <b>gembok</b> atau <b>penggeser</b> di sebelah kiri alamat situs.',
               'Pilih <b>Setelan situs</b> (Site settings).',
               'Cari baris <b>' + Alat + '</b>, ubah menjadi <b>Izinkan</b>.',
               'Muat ulang halaman lalu coba kembali.'],
    'Edge':   ['Klik ikon <b>gembok</b> di kiri alamat situs.',
               'Pilih <b>Izin untuk situs ini</b>.',
               'Ubah <b>' + Alat + '</b> menjadi <b>Izinkan</b>.',
               'Muat ulang halaman.'],
    'Firefox':['Klik ikon <b>gembok</b> di kiri alamat situs.',
               'Pada bagian <b>Izin</b>, hapus tanda blokir ' + alat + '.',
               'Muat ulang halaman lalu izinkan saat diminta.'],
    'Safari': ['Buka menu <b>Safari → Pengaturan → Situs Web → ' + Alat + '</b>.',
               'Ubah situs ini menjadi <b>Izinkan</b>.',
               'Muat ulang halaman.'],
    'Opera':  ['Klik ikon <b>gembok</b> di kiri alamat situs.',
               'Buka <b>Setelan situs</b> → <b>' + Alat + '</b> → <b>Izinkan</b>.',
               'Muat ulang halaman.']
  }[peramban] || null;

  const judul = {
    'ditolak':               'Izin ' + alat + ' ditolak',
    'tidak-ada':             Alat + ' tidak terdeteksi',
    'dipakai-aplikasi-lain': Alat + ' sedang dipakai aplikasi lain',
    'tidak-didukung':        'Peramban tidak mendukung akses ' + alat,
    'tidak-cocok':           'Perangkat ' + alat + ' tidak memenuhi syarat',
    'lain':                  Alat + ' tidak dapat diakses'
  }[sebab] || Alat + ' tidak dapat diakses';

  const penjelasan = {
    'ditolak': 'Izin ' + alat + ' pernah ditolak untuk situs ini. Ikuti langkah berikut untuk mengizinkannya kembali — ' +
               'pada versi ini langkah tersebut benar-benar berlaku.',
    'tidak-ada': 'Tidak ada perangkat ' + alat + ' yang terpasang atau aktif. Sambungkan perangkatnya, lalu coba lagi.',
    'dipakai-aplikasi-lain': 'Tutup aplikasi lain yang sedang memakai ' + alat +
                             ' (Zoom, Google Meet, perekam suara), lalu coba lagi.',
    'tidak-didukung': 'Gunakan Google Chrome atau Microsoft Edge versi terbaru.',
    'tidak-cocok': 'Perangkat yang tersedia tidak mendukung konfigurasi yang diminta. Coba perangkat lain.',
    'lain': 'Terjadi kendala saat mengakses ' + alat + (detail ? ': ' + detail : '') + '.'
  }[sebab] || '';

  openModal({
    title: Alat + ' Tidak Dapat Digunakan', size: '',
    body:
      '<div class="alert alert-warn"><i data-icon="alert-triangle"></i><div>' +
      '<strong>' + esc(judul) + '</strong><p>' + penjelasan + '</p></div></div>' +
      (sebab === 'ditolak' && langkah
        ? '<p class="help" style="margin-bottom:10px">Terdeteksi peramban: <b>' + esc(peramban) + '</b>' +
          (androidChrome ? ' (Android)' : iOS ? ' (iOS)' : '') + '</p>' +
          '<ol class="panduan-mic">' + langkah.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ol>' +
          (androidChrome
            ? '<div class="alert alert-info"><i data-icon="info"></i><div><strong>Di ponsel Android</strong>' +
              '<p>Bila cara di atas tidak muncul: buka <b>Setelan → Aplikasi → Chrome → Izin → ' + Alat + ' → Izinkan</b>.</p>' +
              '</div></div>'
            : iOS
            ? '<div class="alert alert-info"><i data-icon="info"></i><div><strong>Di iPhone / iPad</strong>' +
              '<p>Buka <b>Setelan → Safari → ' + Alat + '</b> dan pilih <b>Tanya</b> atau <b>Izinkan</b>. ' +
              'Perlu diketahui, transkripsi otomatis di Safari iOS masih terbatas — Chrome di ' +
              'komputer memberi hasil terbaik.</p></div></div>'
            : '')
        : '') +
      (alat === 'mikrofon'
        ? '<div class="alert alert-info"><i data-icon="edit"></i><div><strong>Tetap bisa lanjut</strong>' +
          '<p>Tekan <b>Ketik / Tempel Transkrip</b> untuk menuliskan catatan pertemuan secara manual, ' +
          'lalu pakai <b>Rapikan &amp; Ringkas</b> seperti biasa. Resume, PDF, dan DOCX tetap berfungsi penuh.</p>' +
          '</div></div>'
        : '<div class="alert alert-info"><i data-icon="edit"></i><div><strong>Tetap bisa lanjut</strong>' +
          '<p>Masukkan kode sesi absensi secara manual pada kolom yang tersedia.</p></div></div>'),
    foot: '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>' +
      (alat === 'mikrofon'
        ? '<button class="btn btn-outline" id="btnKetikManual2">' + svgIcon('edit', 18) + ' Ketik / Tempel Transkrip</button>' +
          '<button class="btn btn-primary" id="btnCobaMic">' + svgIcon('refresh', 18) + ' Coba Lagi</button>'
        : '<button class="btn btn-primary" onclick="closeModal()">Mengerti</button>'),
    onOpen: function () {
      const a = $('#btnKetikManual2'); if (a) a.onclick = function () { closeModal(); suntingTranskrip(); };
      const b = $('#btnCobaMic');      if (b) b.onclick = function () { closeModal(); mulaiRekaman(); };
    }
  });
}

/* --------------------------------------------------- 16. INISIALISASI ---- */
const JUDUL_HALAMAN = {
  'profil': 'Profil Saya', 'pengaturan': 'Pengaturan Sistem', 'jadwal': 'Jadwal',
  'laporan': 'Laporan & Monitoring', 'rekaman': 'Rekam Pertemuan',
  'bantuan': 'Pusat Bantuan', 'resources': 'Sumber Daya',
  'dosen-kelas-detail': 'Detail Kelas', 'siswa-kursus-detail': 'Detail Mata Pelajaran'
};

document.addEventListener('DOMContentLoaded', function () {
  applyTheme(LS.get('theme', 'light'));
  $('#authYear').textContent = new Date().getFullYear();
  document.title = APP_CONFIG.namaApp;
  renderIcons(document);

  /* Akun demo mengisi kredensial bawaan yang diketahui umum. Sembunyikan
     bila instalasi sudah dipakai sungguhan (APP_CONFIG.tampilkanAkunDemo). */
  const demo = $('#authDemo');
  if (demo && !APP_CONFIG.tampilkanAkunDemo) demo.hidden = true;

  /* Konfigurasi belum diisi → tidak ada gunanya mencoba apa pun.
     Langsung tampilkan layar login beserta penjelasan yang benar. */
  if (window.MASALAH_KONFIG && window.MASALAH_KONFIG.length) {
    tampilkanLogin();
    cekKoneksiAPI();
    return;
  }

  const token = LS.get('token', null);

  if (token) {
    /* Ada sesi tersimpan — langsung muat aplikasi. Pemeriksaan koneksi
       dilewati karena muatAplikasi() sendiri sudah menyentuh backend, dan
       kegagalannya ditangani di sana. Menghindari permintaan ganda saat boot. */
    AppState.sessionToken = token;
    muatAplikasi(null);
  } else {
    tampilkanLogin();
    /* Periksa backend lebih dulu supaya pengguna tidak menyangka kata
       sandinya salah padahal sebenarnya API-nya yang belum siap. */
    if (APP_CONFIG.cekKoneksiSaatMuat) cekKoneksiAPI();
    else setStatusAPI('', 'Siap');
  }
});

/* Perbarui indikator notifikasi berkala (murni dari cache klien). */
setInterval(function () { if (AppState.booted) tandaiNotifikasiBaru(); }, 30000);

/* --------------------------------------------------------------------------
   PENJAGA PEKERJAAN BELUM TERSIMPAN
   Pada versi iframe, menutup tab tidak pernah menjadi masalah besar karena
   aplikasi berada di dalam halaman lain. Kini aplikasi memiliki tab-nya
   sendiri, sehingga menutupnya di tengah perekaman atau pengisian nilai
   berpotensi menghilangkan pekerjaan. Peringatan hanya muncul bila memang
   ada yang berisiko hilang.
   -------------------------------------------------------------------------- */
window.addEventListener('beforeunload', function (e) {
  const sedangMerekam = (typeof REC !== 'undefined') && REC && REC.aktif;
  const adaAntrean    = AppState.pending > 0;
  if (!sedangMerekam && !adaAntrean) return;
  e.preventDefault();
  e.returnValue = '';
  return '';
});
