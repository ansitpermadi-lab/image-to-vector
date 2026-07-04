import { describe, expect, it } from "vitest";
import { binarize, grayPalette, toGrayscale } from "@/core/preprocess/tone";
import {
  applyRecolors,
  countAnchors,
  extractPalette,
  hexToRgb,
  mergePathsByColor,
  outlineSvg,
  recolorSvg,
  rgbToHex,
} from "@/core/svg-utils";
import { stripWhitePaths, traceImageData } from "@/core/tracer";
import { DEFAULT_TRACE_OPTIONS, type TraceInput } from "@/core/tracer/types";

const SAMPLE_SVG =
  '<svg width="10" height="10" viewBox="0 0 10 10">' +
  '<path fill="rgb(255,0,0)" stroke="rgb(255,0,0)" stroke-width="1" opacity="1" d="M 0 0 L 5 0 L 5 5 Z" />' +
  '<path fill="rgb(255,0,0)" stroke="rgb(255,0,0)" stroke-width="1" opacity="1" d="M 5 5 L 9 9 Q 9 5 5 5 Z" />' +
  '<path fill="rgb(0,0,255)" stroke="rgb(0,0,255)" stroke-width="1" opacity="1" d="M 1 1 L 2 2 Z" />' +
  '<path fill="rgb(255,255,255)" stroke="rgb(255,255,255)" stroke-width="1" opacity="1" d="M 3 3 L 4 4 Z" />' +
  "</svg>";

/** Gradien horizontal gelap → terang. */
function gradientImage(size = 8): TraceInput {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = Math.round((x / (size - 1)) * 255);
      data[i] = v;
      data[i + 1] = Math.round(v * 0.6);
      data[i + 2] = 30;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

describe("tone", () => {
  it("toGrayscale menyamakan ketiga kanal", () => {
    const gray = toGrayscale(gradientImage());
    for (let i = 0; i < gray.data.length; i += 4) {
      expect(gray.data[i]).toBe(gray.data[i + 1]);
      expect(gray.data[i + 1]).toBe(gray.data[i + 2]);
    }
  });

  it("binarize memisahkan gelap/terang sesuai threshold", () => {
    const bw = binarize(gradientImage(), 0.5);
    const values = new Set<number>();
    for (let i = 0; i < bw.data.length; i += 4) values.add(bw.data[i]);
    expect([...values].sort((a, b) => a - b)).toEqual([0, 255]);

    // Threshold rendah → lebih banyak piksel jadi putih.
    const low = binarize(gradientImage(), 0.1);
    const high = binarize(gradientImage(), 0.9);
    const whites = (img: TraceInput) => {
      let n = 0;
      for (let i = 0; i < img.data.length; i += 4) if (img.data[i] === 255) n++;
      return n;
    };
    expect(whites(low)).toBeGreaterThan(whites(high));
  });

  it("grayPalette menghasilkan N tingkat dari hitam ke putih", () => {
    const pal = grayPalette(4);
    expect(pal).toHaveLength(4);
    expect(pal[0]).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    expect(pal[3]).toEqual({ r: 255, g: 255, b: 255, a: 255 });
  });

  it("mode grayscale menghasilkan SVG dengan warna abu saja", () => {
    const result = traceImageData(gradientImage(16), {
      ...DEFAULT_TRACE_OPTIONS,
      mode: "grayscale",
      colorCount: 4,
    });
    for (const match of result.svg.matchAll(/fill="rgb\((\d+),(\d+),(\d+)\)"/g)) {
      expect(match[1]).toBe(match[2]);
      expect(match[2]).toBe(match[3]);
    }
  });
});

describe("svg-utils", () => {
  it("konversi warna dua arah konsisten", () => {
    expect(rgbToHex("rgb(255,0,128)")).toBe("#ff0080");
    expect(hexToRgb("#ff0080")).toBe("rgb(255,0,128)");
  });

  it("extractPalette mengurutkan berdasarkan pemakaian", () => {
    const palette = extractPalette(SAMPLE_SVG);
    expect(palette).toHaveLength(3);
    expect(palette[0]).toMatchObject({ fill: "rgb(255,0,0)", count: 2, hex: "#ff0000" });
  });

  it("recolorSvg mengganti fill dan stroke warna itu saja", () => {
    const out = recolorSvg(SAMPLE_SVG, "rgb(255,0,0)", "#00ff00");
    expect(out).not.toContain("rgb(255,0,0)");
    expect(out).toContain('fill="rgb(0,255,0)"');
    expect(out).toContain('fill="rgb(0,0,255)"'); // warna lain utuh
  });

  it("applyRecolors menerapkan beberapa penggantian", () => {
    const out = applyRecolors(SAMPLE_SVG, {
      "rgb(255,0,0)": "#111111",
      "rgb(0,0,255)": "#222222",
    });
    expect(out).toContain("rgb(17,17,17)");
    expect(out).toContain("rgb(34,34,34)");
  });

  it("outlineSvg menghilangkan fill dan menyeragamkan stroke", () => {
    const out = outlineSvg(SAMPLE_SVG, "#ff00ff");
    expect(out).not.toMatch(/fill="rgb/);
    expect(out).toContain('fill="none"');
    expect(out).toContain('stroke="#ff00ff"');
  });

  it("countAnchors menghitung segmen path", () => {
    // Path 1: M+2L, path 2: M+1L+1Q, path 3: M+1L, path 4: M+1L → 10 huruf perintah
    expect(countAnchors(SAMPLE_SVG)).toBe(10);
  });

  it("mergePathsByColor: 1 warna = 1 shape dalam layer <g> bernama", () => {
    const out = mergePathsByColor(SAMPLE_SVG);
    // 3 warna → 3 layer, masing-masing tepat satu path.
    expect(out.match(/<g /g)).toHaveLength(3);
    expect(out.match(/<path /g)).toHaveLength(3);
    // Kedua subpath merah tergabung dalam satu d.
    const redPath = out.match(/<g id="layer-1"[^>]*>.*?d="([^"]+)"/s)![1];
    expect(redPath).toContain("M 0 0 L 5 0 L 5 5 Z");
    expect(redPath).toContain("M 5 5 L 9 9 Q 9 5 5 5 Z");
    // Layer dinamai hex warnanya; urutan mengikuti kemunculan pertama.
    expect(out).toContain('data-name="#ff0000"');
    expect(out.indexOf("#ff0000")).toBeLessThan(out.indexOf("#0000ff"));
    // Header viewBox tetap utuh.
    expect(out).toContain('viewBox="0 0 10 10"');
  });

  it("mergePathsByColor kompatibel dengan recolor dan outline", () => {
    const merged = mergePathsByColor(SAMPLE_SVG);
    expect(extractPalette(merged)).toHaveLength(3);
    expect(recolorSvg(merged, "rgb(255,0,0)", "#00ff00")).toContain("rgb(0,255,0)");
    expect(outlineSvg(merged)).toContain('fill="none"');
  });

  it("stripWhitePaths membuang path putih saja", () => {
    const out = stripWhitePaths(SAMPLE_SVG);
    expect(out).not.toContain("rgb(255,255,255)");
    expect(out).toContain("rgb(255,0,0)");
    expect(out).toContain("rgb(0,0,255)");
  });
});
