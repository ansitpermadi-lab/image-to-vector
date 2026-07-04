import { describe, expect, it } from "vitest";
import { binarize, grayPalette, toGrayscale } from "@/core/preprocess/tone";
import {
  applyRecolors,
  countAnchors,
  extractPalette,
  hexToRgb,
  listLayers,
  mergePathsByColor,
  mergeSimilarColors,
  outlineSvg,
  recolorSvg,
  rgbToHex,
  setLayerVisibility,
  simplifyPathD,
  simplifySvgPaths,
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

  it("simplifyPathD: gerigi kecil hilang, bentuk & endpoint dipertahankan", () => {
    // Garis 0→20 dengan zigzag ±0.4px di tiap langkah: RDP eps 1 harus meluruskan.
    const zigzag: string[] = ["M", "0", "0"];
    for (let x = 1; x <= 20; x++) {
      zigzag.push("L", String(x), x % 2 ? "0.4" : "0");
    }
    zigzag.push("Z");
    const out = simplifyPathD(zigzag.join(" "), 1);
    const segments = (out.match(/L/g) ?? []).length;
    expect(segments).toBeLessThanOrEqual(2); // dari 20 segmen jadi garis lurus
    expect(out.startsWith("M 0 0")).toBe(true);
    expect(out).toContain("L 20 0"); // endpoint tetap
    expect(out.endsWith("Z")).toBe(true);
  });

  it("simplifyPathD mempertahankan kurva Q dan sudut nyata", () => {
    const d = "M 0 0 L 10 0 L 10 10 Q 5 15 0 10 Z";
    const out = simplifyPathD(d, 0.8);
    expect(out).toContain("Q 5 15 0 10"); // kurva utuh
    expect(out).toContain("L 10 0");
    expect(out).toContain("L 10 10"); // sudut 90° tidak dibuang
  });

  it("simplifySvgPaths dengan epsilon 0 tidak mengubah apa pun", () => {
    expect(simplifySvgPaths(SAMPLE_SVG, 0)).toBe(SAMPLE_SVG);
  });

  it("mergeSimilarColors melebur warna nyaris kembar ke yang dominan", () => {
    const svg =
      '<svg><path fill="rgb(100,100,100)" stroke="rgb(100,100,100)" opacity="1" d="M 0 0 L 1 1 Z" />' +
      '<path fill="rgb(100,100,100)" stroke="rgb(100,100,100)" opacity="1" d="M 2 2 L 3 3 Z" />' +
      '<path fill="rgb(105,103,101)" stroke="rgb(105,103,101)" opacity="1" d="M 4 4 L 5 5 Z" />' +
      '<path fill="rgb(200,50,50)" stroke="rgb(200,50,50)" opacity="1" d="M 6 6 L 7 7 Z" /></svg>';
    const out = mergeSimilarColors(svg, 20);
    expect(out).not.toContain("rgb(105,103,101)"); // dilebur ke 100,100,100
    expect(out).toContain("rgb(200,50,50)"); // warna beda tetap
    expect(extractPalette(out)).toHaveLength(2);
  });

  it("listLayers + setLayerVisibility bekerja pada hasil merge", () => {
    const merged = mergePathsByColor(SAMPLE_SVG);
    const layers = listLayers(merged);
    expect(layers).toHaveLength(3);
    expect(layers[0]).toMatchObject({ id: "layer-1", name: "#ff0000" });
    expect(layers[0].anchors).toBeGreaterThan(0);

    const hidden = setLayerVisibility(merged, ["layer-2"]);
    expect(hidden).toContain('<g id="layer-2" display="none"');
    expect(hidden).not.toContain('<g id="layer-1" display="none"');
    // Bisa dikembalikan: apply lagi dari sumber asli tanpa id itu.
    expect(setLayerVisibility(merged, [])).toBe(merged);
  });

  it("REGRESI: subpath tertutup (start==end) tidak lenyap saat disederhanakan", () => {
    // imagetracer menutup ring dengan mengulang titik awal sebagai L terakhir.
    const square = "M 6 6 L 18 6 L 18 18 L 6 18 L 6 6 Z";
    const out = simplifyPathD(square, 0.75);
    expect(out).toContain("L 18 6");
    expect(out).toContain("L 18 18");
    expect(out).toContain("L 6 18");
    // keempat sudut bertahan → bukan "M 6 6 L 6 6 Z".
    expect((out.match(/L /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("REGRESI: tukar warna dua layer tidak berantai (single-pass)", () => {
    const doc =
      '<path fill="rgb(255,0,0)" stroke="rgb(255,0,0)" d="M0 0" />' +
      '<path fill="rgb(0,0,255)" stroke="rgb(0,0,255)" d="M1 1" />';
    // layer merah → biru (warna asli layer lain), layer biru → hijau.
    const out = applyRecolors(doc, {
      "rgb(255,0,0)": "#0000ff",
      "rgb(0,0,255)": "#00ff00",
    });
    const fills = [...out.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
    expect(fills).toEqual(["rgb(0,0,255)", "rgb(0,255,0)"]); // bukan dua-duanya hijau
  });

  it("REGRESI: setLayerVisibility idempoten & bisa unhide", () => {
    const svg = '<g id="layer-1" data-name="#000"><path /></g><g id="layer-2" data-name="#fff"><path /></g>';
    const once = setLayerVisibility(svg, ["layer-1"]);
    const twice = setLayerVisibility(once, ["layer-1"]);
    expect(twice).toBe(once); // tidak ada display="none" ganda
    expect((twice.match(/display="none"/g) ?? []).length).toBe(1);
    // hiddenIds jadi sumber kebenaran: kosong = semua tampil lagi.
    expect(setLayerVisibility(once, [])).toBe(svg);
  });

  it("REGRESI: listLayers tetap melihat layer yang disembunyikan", () => {
    const merged = mergePathsByColor(SAMPLE_SVG);
    const hidden = setLayerVisibility(merged, ["layer-1"]);
    expect(listLayers(hidden)).toHaveLength(3); // layer-1 tidak hilang dari daftar
    expect(listLayers(hidden)[0].id).toBe("layer-1");
  });

  it("stripWhitePaths membuang path putih saja", () => {
    const out = stripWhitePaths(SAMPLE_SVG);
    expect(out).not.toContain("rgb(255,255,255)");
    expect(out).toContain("rgb(255,0,0)");
    expect(out).toContain("rgb(0,0,255)");
  });
});
