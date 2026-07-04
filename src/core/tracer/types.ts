export type TraceMode = "color" | "grayscale" | "bw";

export interface TraceOptions {
  mode: TraceMode;
  /** Jumlah warna pada hasil (2–64). Untuk grayscale = jumlah tingkat abu. Diabaikan pada "bw". */
  colorCount: number;
  /** 0–1; makin tinggi makin banyak detail (kurva mengikuti piksel lebih ketat). */
  detail: number;
  /** 0–1; blur ringan sebelum tracing untuk meredam noise halus. */
  smoothing: number;
  /** 0–1; ambang terang/gelap untuk mode "bw" (0.5 = tengah). */
  threshold: number;
  /** Area minimum dalam piksel; bercak lebih kecil dari ini diabaikan (Noise di Illustrator). */
  noise: number;
  /** Pertegas sudut 90° (Corners di Illustrator). */
  corners: boolean;
  /** Buang path putih/hampir putih dari hasil (Ignore White di Illustrator). */
  ignoreWhite: boolean;
  /** Jadikan warna latar (dideteksi dari sudut gambar) transparan sebelum tracing. */
  removeBg: boolean;
  /** 0–1; seberapa jauh warna boleh menyimpang dari warna latar dan tetap dihapus. */
  bgTolerance: number;
}

export const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  mode: "color",
  colorCount: 16,
  detail: 0.7,
  smoothing: 0,
  threshold: 0.5,
  noise: 8,
  corners: true,
  ignoreWhite: false,
  // Default menyala: latar (mis. putih) otomatis dibuang; bisa dimatikan di UI.
  removeBg: true,
  bgTolerance: 0.12,
};

/** Bentuk data piksel yang aman dikirim lintas Web Worker (structured clone). */
export interface TraceInput {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface TraceResult {
  svg: string;
  width: number;
  height: number;
  pathCount: number;
  durationMs: number;
}
