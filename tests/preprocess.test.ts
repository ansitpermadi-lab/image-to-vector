import { describe, expect, it } from "vitest";
import { removeBackground } from "@/core/preprocess/remove-background";
import { traceImageData } from "@/core/tracer";
import { matchPreset, PRESETS } from "@/core/tracer/presets";
import { DEFAULT_TRACE_OPTIONS, type TraceInput } from "@/core/tracer/types";

/** Latar putih dengan kotak merah di tengah. */
function makeImage(size = 8): TraceInput {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inCenter = x >= 3 && x < 5 && y >= 3 && y < 5;
      data[i] = 255;
      data[i + 1] = inCenter ? 0 : 255;
      data[i + 2] = inCenter ? 0 : 255;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

describe("removeBackground", () => {
  it("menjadikan warna latar transparan, objek tetap solid", () => {
    const result = removeBackground(makeImage(), 0.1);
    const alphaAt = (x: number, y: number) => result.data[(y * 8 + x) * 4 + 3];
    expect(alphaAt(0, 0)).toBe(0); // sudut = latar
    expect(alphaAt(7, 7)).toBe(0);
    expect(alphaAt(3, 3)).toBe(255); // kotak merah tetap ada
  });

  it("tidak mengubah input asli", () => {
    const input = makeImage();
    const before = input.data[3];
    removeBackground(input, 0.5);
    expect(input.data[3]).toBe(before);
  });

  it("hasil tracing setelah removeBackground lebih kecil (path latar dibuang)", () => {
    const input = makeImage(16);
    const withBg = traceImageData(input, DEFAULT_TRACE_OPTIONS);
    const withoutBg = traceImageData(
      removeBackground(input, 0.1),
      DEFAULT_TRACE_OPTIONS,
    );
    expect(withoutBg.pathCount).toBeLessThan(withBg.pathCount);
    expect(withoutBg.svg).not.toMatch(/opacity="0(\.0+)?"/);
  });

  it("halo antialiasing di tepi objek ikut terhapus", () => {
    // Latar putih, objek merah, dan cincin 1px warna campuran (halo) di antaranya.
    const size = 12;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const dist = Math.max(Math.abs(x - 6), Math.abs(y - 6));
        if (dist <= 2) {
          data.set([200, 30, 30, 255], i); // objek
        } else if (dist === 3) {
          data.set([235, 200, 200, 255], i); // halo: campuran putih-merah
        } else {
          data.set([255, 255, 255, 255], i); // latar
        }
      }
    }
    const result = removeBackground({ width: size, height: size, data }, 0.12);
    const alphaAt = (x: number, y: number) => result.data[(y * size + x) * 4 + 3];
    expect(alphaAt(0, 0)).toBe(0); // latar hilang
    expect(alphaAt(6, 3)).toBe(0); // halo (dist 3 dari pusat) ikut hilang
    expect(alphaAt(6, 6)).toBe(255); // objek tetap solid
  });

  it("toleransi 0 hanya menghapus warna yang persis sama", () => {
    const input = makeImage();
    // Ubah satu piksel latar jadi hampir-putih.
    input.data[4 * 4] = 250;
    const result = removeBackground(input, 0);
    expect(result.data[4 * 4 + 3]).not.toBe(0); // hampir-putih selamat
    expect(result.data[3]).toBe(0); // putih persis terhapus
  });
});

describe("presets", () => {
  it("semua preset punya nilai dalam rentang valid", () => {
    for (const preset of PRESETS) {
      expect(preset.options.colorCount).toBeGreaterThanOrEqual(2);
      expect(preset.options.colorCount).toBeLessThanOrEqual(64);
      expect(preset.options.detail).toBeGreaterThanOrEqual(0);
      expect(preset.options.detail).toBeLessThanOrEqual(1);
      expect(preset.options.smoothing).toBeGreaterThanOrEqual(0);
      expect(preset.options.smoothing).toBeLessThanOrEqual(1);
    }
  });

  it("matchPreset mengenali preset aktif dan menolak opsi custom", () => {
    expect(matchPreset(PRESETS[0].options)).toBe(PRESETS[0].key);
    expect(matchPreset({ ...DEFAULT_TRACE_OPTIONS, colorCount: 63 })).toBeNull();
  });

  it("matchPreset mengabaikan setting hapus-background", () => {
    expect(
      matchPreset({ ...PRESETS[1].options, removeBg: true, bgTolerance: 0.4 }),
    ).toBe(PRESETS[1].key);
  });
});
