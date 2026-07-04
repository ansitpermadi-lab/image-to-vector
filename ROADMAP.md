# Roadmap — Image to Vector

Web app untuk mengubah gambar raster (PNG/JPG/WebP) menjadi grafik vektor **SVG**, dengan seluruh pemrosesan berjalan **di browser** (WASM). Tidak ada server pemrosesan: gratis di-hosting, cepat, dan gambar pengguna tidak pernah meninggalkan perangkatnya.

> Status: 🚧 Dalam pengembangan — Fase 0 & 1 selesai, Fase 2 sebagian.

---

## 1. Visi & Sasaran

**Visi:** alternatif gratis dan open-source untuk layanan seperti Vectorizer.ai / Vector Magic, sederhana dipakai siapa saja.

**Sasaran produk:**
- Upload gambar → preview hasil vektor → download SVG, dalam < 10 detik untuk gambar umum (≤ 2000×2000 px).
- Hasil bagus untuk logo, ikon, sketsa, dan ilustrasi flat; hasil "cukup baik" untuk foto (mode poster/warna terbatas).
- Privasi: pemrosesan 100% client-side.

**Di luar lingkup (untuk saat ini):**
- Format output selain SVG (PDF/EPS/DXF) — bisa jadi fase lanjutan.
- Akun pengguna, penyimpanan cloud, pembayaran.
- Pemrosesan sisi server / API publik.

---

## 2. Teknologi

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Framework | **Next.js (React + TypeScript)**, static export | Ekosistem matang, deploy gratis (Vercel/Netlify/GitHub Pages) |
| Engine tracing | **VTracer (Rust → WASM)** via paket `@image-tracer/…` atau build sendiri; fallback: **ImageTracer.js** | VTracer kualitas terbaik untuk full-color tracing; ImageTracer.js murni JS sebagai cadangan |
| Pra-pemrosesan | Canvas API + Web Worker | Resize, kuantisasi warna, penghapusan background sederhana tanpa membekukan UI |
| Styling | Tailwind CSS | Cepat, konsisten |
| Testing | Vitest (unit) + Playwright (E2E) | Standar ekosistem |
| CI/CD | GitHub Actions → deploy otomatis | Lint, test, build di setiap PR |

**Keputusan arsitektur kunci:**
1. **Semua komputasi di Web Worker** — thread UI tetap responsif saat tracing gambar besar.
2. **Engine di balik satu interface** (`trace(image, options): SvgResult`) — agar VTracer/ImageTracer bisa saling menggantikan tanpa mengubah UI.
3. **Static export** — tidak ada backend sama sekali.

---

## 3. Fase Pembangunan

### Fase 0 — Fondasi Proyek (± 1 sesi kerja) ✅
Tujuan: repositori siap dikembangkan.
- [x] Inisialisasi Next.js + TypeScript + Tailwind, konfigurasi static export.
- [x] ESLint + Vitest terpasang dan jalan.
- [x] GitHub Actions: lint + test + build pada setiap push/PR.
- [x] README dasar (deskripsi, cara menjalankan lokal).

**Selesai jika:** `npm run dev` menampilkan halaman kosong ber-layout, CI hijau.

### Fase 1 — Bukti Konsep Tracing (± 1–2 sesi) ✅
Tujuan: membuktikan pipeline gambar → SVG jalan di browser.
- [x] Integrasi engine tracing (dimulai dengan ImageTracer.js sesuai rencana mitigasi; VTracer WASM menyusul di Fase 3).
- [x] Interface `trace()` terpisah dari UI + berjalan di Web Worker.
- [x] Halaman uji: pilih file → tampilkan SVG (terverifikasi E2E di Chromium headless).

**Selesai jika:** logo PNG contoh berhasil dikonversi menjadi SVG yang terlihat benar.

### Fase 2 — MVP yang Bisa Dipakai (± 2–3 sesi) 🚧
Tujuan: alur lengkap yang nyaman untuk pengguna awam.
- [x] Upload via drag-and-drop, file picker, dan paste dari clipboard.
- [x] Preview berdampingan **sebelum/sesudah** dengan zoom & pan (modal compare + slider pembatas).
- [x] Panel pengaturan dasar: jumlah warna, detail/smoothing, mode (warna / hitam-putih).
- [x] Re-trace otomatis (debounced) saat pengaturan berubah.
- [x] Download SVG + salin kode SVG ke clipboard.
- [x] Penanganan error: format tak didukung, gambar terlalu besar (auto-resize dengan pemberitahuan).
- [ ] Deploy publik pertama.

**Selesai jika:** orang lain bisa membuka URL, mengonversi logonya sendiri, dan mengunduh SVG tanpa penjelasan apa pun.

### Fase 3 — Kualitas Hasil & Fitur Lanjutan (± 2–3 sesi)
Tujuan: dari "jalan" menjadi "bagus".
- [x] Preset sekali-klik: **Logo**, **Sketsa/Line-art**, **Ilustrasi**, **Foto (poster)**.
- [x] Pra-pemrosesan: opsi hapus background warna solid dengan toleransi. *(kuantisasi & denoise via setting smoothing/warna)*
- [ ] Optimasi output SVG (SVGO): ukuran file kecil, path digabung per warna. *(path transparan sudah dibuang otomatis)*
- [x] Batch: beberapa gambar sekaligus → download ZIP. *(dimajukan atas permintaan — selesai lebih awal)*
- [x] Ekspor tambahan: PNG hasil render ulang pada resolusi berapa pun (1×–8×).
- [x] Perbandingan ukuran file & jumlah path di UI.

### Fase 4 — Poles & Rilis 1.0 (± 1–2 sesi)
- [ ] Responsif penuh (mobile), dark mode, aksesibilitas dasar (keyboard, kontras).
- [ ] Galeri contoh + gambar demo sekali-klik.
- [ ] E2E test Playwright untuk alur utama.
- [ ] Dokumentasi: README lengkap, screenshot, GIF demo.
- [ ] Tag rilis `v1.0.0`.

### Ide Setelah 1.0 (backlog, tidak dijanjikan)
- PWA / mode offline penuh.
- Ekspor PDF/EPS.
- Editor hasil sederhana (hapus path, ganti warna per layer).
- CLI yang memakai core engine yang sama.

---

## 4. Struktur Proyek (rencana)

```
image-to-vector/
├── src/
│   ├── app/                 # halaman Next.js
│   ├── components/          # UI: dropzone, preview, panel setting
│   ├── core/                # logika murni, bebas UI
│   │   ├── tracer/          # interface trace() + adapter VTracer/ImageTracer
│   │   ├── preprocess/      # resize, kuantisasi, background removal
│   │   └── export/          # SVGO, ZIP, konversi
│   └── workers/             # Web Worker pembungkus core
├── public/samples/          # gambar demo
├── tests/
└── .github/workflows/
```

Aturan penting: **`core/` tidak boleh mengimpor apa pun dari React/DOM** — supaya mudah diuji dan kelak bisa dipakai CLI.

---

## 5. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Integrasi VTracer WASM rumit (build Rust, ukuran bundle) | Fase 1 molor | Mulai dengan ImageTracer.js (murni JS) di balik interface yang sama; tukar engine belakangan |
| Gambar besar membuat browser lambat/crash | UX buruk | Auto-resize ke batas aman (mis. 2048px) + proses di Worker + indikator progres |
| Hasil foto kompleks mengecewakan | Ekspektasi pengguna | Komunikasikan di UI bahwa tool optimal untuk logo/ilustrasi; sediakan preset "Foto (poster)" |
| SVG hasil terlalu besar (ribuan path) | File tak praktis | SVGO + pengaturan simplifikasi path + tampilkan jumlah path di UI |

---

## 6. Ukuran Keberhasilan

- Logo 1000×1000 px → SVG dalam < 5 detik di laptop biasa.
- SVG hasil untuk logo umum < 100 KB setelah optimasi.
- Alur upload→download selesai tanpa membaca dokumentasi.
- Lighthouse performance & accessibility ≥ 90.

---

## 7. Cara Kerja Kita

- Satu fase = satu (atau beberapa) PR dengan checklist di atas sebagai acuan.
- Checklist di dokumen ini dicentang seiring progres; perubahan lingkup dicatat di sini juga.
- **Langkah berikutnya:** eksekusi **Fase 0** setelah roadmap ini disetujui.
