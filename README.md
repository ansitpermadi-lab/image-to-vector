# Image to Vector

Konversi gambar raster (PNG/JPG/WebP) menjadi **SVG** langsung di browser.
Seluruh pemrosesan berjalan client-side — gambar tidak pernah diunggah ke
server, sehingga gratis di-hosting dan privasi terjaga.

Hasilnya berupa grafik vektor sungguhan: tajam di segala ukuran dan bisa
diedit di Adobe Illustrator, Figma, atau Inkscape.

> Lihat rencana lengkap di [ROADMAP.md](./ROADMAP.md).

## Fitur saat ini

- Upload via drag-and-drop, file picker, atau paste dari clipboard (Ctrl+V)
- Preview berdampingan gambar asli vs hasil SVG
- Pengaturan: mode warna / hitam-putih, jumlah warna, detail, smoothing
- Re-trace otomatis saat pengaturan berubah
- Download SVG atau salin kodenya ke clipboard
- Tracing berjalan di Web Worker agar UI tetap responsif
- Gambar besar otomatis diperkecil (maks. 2048px) agar proses tetap cepat

## Teknologi

- [Next.js](https://nextjs.org) (App Router, static export) + TypeScript + Tailwind CSS
- Engine tracing: [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs)
  di balik interface `trace()` (`src/core/tracer/`) sehingga engine lain
  (mis. VTracer WASM) bisa dipasang tanpa mengubah UI
- Vitest untuk unit test, GitHub Actions untuk CI

## Menjalankan secara lokal

```bash
npm install
npm run dev      # buka http://localhost:3000
```

Perintah lain:

```bash
npm run lint     # ESLint
npm test         # unit test (Vitest)
npm run build    # build statis ke folder out/
```

## Struktur proyek

```
src/
├── app/          # halaman Next.js (UI)
├── core/tracer/  # logika tracing murni — tanpa React/DOM
├── workers/      # Web Worker pembungkus core
└── types/        # deklarasi tipe pihak ketiga
tests/            # unit test
```

Aturan penting: `src/core/` tidak boleh mengimpor apa pun dari React/DOM,
supaya mudah diuji dan kelak bisa dipakai oleh CLI.
