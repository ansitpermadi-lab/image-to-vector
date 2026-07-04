import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRACE_OPTIONS,
  toImageTracerOptions,
  traceImageData,
  type TraceInput,
} from "@/core/tracer";

/** Gambar uji: kotak merah di atas latar putih. */
function makeTestImage(size = 16, squareStart = 4, squareEnd = 12): TraceInput {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inSquare =
        x >= squareStart && x < squareEnd && y >= squareStart && y < squareEnd;
      data[i] = inSquare ? 255 : 255;
      data[i + 1] = inSquare ? 0 : 255;
      data[i + 2] = inSquare ? 0 : 255;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

describe("traceImageData", () => {
  it("menghasilkan SVG valid dari gambar sederhana", () => {
    const result = traceImageData(makeTestImage(), {
      ...DEFAULT_TRACE_OPTIONS,
      colorCount: 4,
    });

    expect(result.svg).toContain("<svg");
    expect(result.svg).toContain("<path");
    expect(result.svg).toContain("viewBox");
    expect(result.pathCount).toBeGreaterThan(0);
    expect(result.width).toBe(16);
    expect(result.height).toBe(16);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("mode hitam-putih tetap menghasilkan SVG", () => {
    const result = traceImageData(makeTestImage(), {
      ...DEFAULT_TRACE_OPTIONS,
      mode: "bw",
    });
    expect(result.svg).toContain("<svg");
    expect(result.pathCount).toBeGreaterThan(0);
  });
});

describe("toImageTracerOptions", () => {
  it("detail tinggi memberi threshold lebih rendah (lebih presisi)", () => {
    const detailed = toImageTracerOptions({ ...DEFAULT_TRACE_OPTIONS, detail: 1 });
    const rough = toImageTracerOptions({ ...DEFAULT_TRACE_OPTIONS, detail: 0 });
    expect(detailed.ltres!).toBeLessThan(rough.ltres!);
  });

  it("noise dipetakan langsung ke pathomit", () => {
    expect(
      toImageTracerOptions({ ...DEFAULT_TRACE_OPTIONS, noise: 20 }).pathomit,
    ).toBe(20);
  });

  it("meng-clamp jumlah warna ke rentang 2–64", () => {
    expect(
      toImageTracerOptions({ ...DEFAULT_TRACE_OPTIONS, colorCount: 1000 })
        .numberofcolors,
    ).toBe(64);
    expect(
      toImageTracerOptions({ ...DEFAULT_TRACE_OPTIONS, colorCount: 0 })
        .numberofcolors,
    ).toBe(2);
  });

  it("mode bw memakai palet hitam-putih tetap", () => {
    const options = toImageTracerOptions({ ...DEFAULT_TRACE_OPTIONS, mode: "bw" });
    expect(options.numberofcolors).toBe(2);
    expect(options.pal).toHaveLength(2);
    expect(options.colorsampling).toBe(0);
  });
});
