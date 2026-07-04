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
  const distanceToBg = (i: number) => {
    const dr = out[i] - bgR;
    const dg = out[i + 1] - bgG;
    const db = out[i + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };
  for (let i = 0; i < out.length; i += 4) {
    if (distanceToBg(i) <= threshold) out[i + 3] = 0;
  }

  // Bersihkan halo antialiasing: piksel yang masih agak mirip latar DAN
  // bersebelahan dengan area yang sudah transparan ikut dihapus, beberapa
  // iterasi agar cincin tepi 1–3 px hilang tanpa menggerus isi objek.
  const softThreshold = Math.min(MAX_COLOR_DISTANCE, threshold * 3);
  for (let pass = 0; pass < 4; pass++) {
    const marked: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (out[i + 3] === 0 || distanceToBg(i) > softThreshold) continue;
        const nextToTransparent =
          (x > 0 && out[i - 4 + 3] === 0) ||
          (x < width - 1 && out[i + 4 + 3] === 0) ||
          (y > 0 && out[i - width * 4 + 3] === 0) ||
          (y < height - 1 && out[i + width * 4 + 3] === 0);
        if (nextToTransparent) marked.push(i);
      }
    }
    if (marked.length === 0) break;
    for (const i of marked) out[i + 3] = 0;
  }

  // Color-snap: piksel tepi yang tersisa (halo gelap campuran latar+objek)
  // diwarnai ulang mengikuti tetangga yang paling "objek" (paling jauh dari
  // warna latar), supaya kuantisasi meleburkannya ke warna objek — tanpa
  // menggerus siluet ataupun garis tipis.
  for (let pass = 0; pass < 3; pass++) {
    const changes: Array<[number, number]> = []; // [target, sumber]
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (out[i + 3] === 0) continue;
        const neighbors = [
          x > 0 ? i - 4 : -1,
          x < width - 1 ? i + 4 : -1,
          y > 0 ? i - width * 4 : -1,
          y < height - 1 ? i + width * 4 : -1,
        ];
        if (!neighbors.some((n) => n >= 0 && out[n + 3] === 0)) continue;
        const own = distanceToBg(i);
        let best = -1;
        let bestDistance = own * 1.5; // hanya snap ke tetangga yang jelas lebih "objek"
        for (const n of neighbors) {
          if (n < 0 || out[n + 3] === 0) continue;
          const d = distanceToBg(n);
          if (d > bestDistance) {
            bestDistance = d;
            best = n;
          }
        }
        if (best >= 0) changes.push([i, best]);
      }
    }
    if (changes.length === 0) break;
    for (const [target, source] of changes) {
      out[target] = out[source];
      out[target + 1] = out[source + 1];
      out[target + 2] = out[source + 2];
    }
  }

  return { width, height, data: out };
}
