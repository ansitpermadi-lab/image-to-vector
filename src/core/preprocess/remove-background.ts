import type { TraceInput } from "@/core/tracer/types";

/** Jarak warna RGB maksimum (0,0,0) ↔ (255,255,255). */
const MAX_COLOR_DISTANCE = Math.sqrt(3 * 255 * 255);

/**
 * Deteksi warna latar dari rata-rata empat sudut gambar, lalu jadikan setiap
 * piksel yang cukup mirip dengan warna itu transparan. Mengembalikan salinan
 * baru — input tidak diubah.
 */
export function removeBackground(
  input: TraceInput,
  tolerance: number,
): TraceInput {
  const { width, height, data } = input;
  const corners = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + (width - 1)) * 4,
  ];
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (const offset of corners) {
    bgR += data[offset];
    bgG += data[offset + 1];
    bgB += data[offset + 2];
  }
  bgR /= corners.length;
  bgG /= corners.length;
  bgB /= corners.length;

  const threshold = Math.max(0, Math.min(1, tolerance)) * MAX_COLOR_DISTANCE;
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    const dr = out[i] - bgR;
    const dg = out[i + 1] - bgG;
    const db = out[i + 2] - bgB;
    if (Math.sqrt(dr * dr + dg * dg + db * db) <= threshold) {
      out[i + 3] = 0;
    }
  }
  return { width, height, data: out };
}
