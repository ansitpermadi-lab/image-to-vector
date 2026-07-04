import type { TraceInput } from "@/core/tracer/types";

/** Bobot luminansi Rec. 601. */
function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Konversi ke abu-abu (alpha dipertahankan). Mengembalikan salinan baru. */
export function toGrayscale(input: TraceInput): TraceInput {
  const out = new Uint8ClampedArray(input.data);
  for (let i = 0; i < out.length; i += 4) {
    const y = luminance(out[i], out[i + 1], out[i + 2]);
    out[i] = out[i + 1] = out[i + 2] = y;
  }
  return { width: input.width, height: input.height, data: out };
}

/**
 * Binarisasi hitam/putih dengan ambang 0–1 (0.5 = tengah), seperti slider
 * Threshold pada Image Trace Illustrator. Alpha dipertahankan.
 */
export function binarize(input: TraceInput, threshold: number): TraceInput {
  const cut = Math.max(0, Math.min(1, threshold)) * 255;
  const out = new Uint8ClampedArray(input.data);
  for (let i = 0; i < out.length; i += 4) {
    const v = luminance(out[i], out[i + 1], out[i + 2]) < cut ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = v;
  }
  return { width: input.width, height: input.height, data: out };
}

/** Palet N tingkat abu yang tersebar merata (untuk mode grayscale). */
export function grayPalette(levels: number): Array<{ r: number; g: number; b: number; a: number }> {
  const n = Math.max(2, Math.min(64, Math.round(levels)));
  return Array.from({ length: n }, (_, i) => {
    const v = Math.round((i / (n - 1)) * 255);
    return { r: v, g: v, b: v, a: 255 };
  });
}
