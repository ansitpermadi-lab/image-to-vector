/**
 * Utilitas pasca-tracing di atas string SVG hasil imagetracer.
 * Format path imagetracer: <path fill="rgb(r,g,b)" stroke="rgb(r,g,b)" ... />
 */

export interface PaletteEntry {
  /** Warna dalam bentuk "rgb(r,g,b)" persis seperti di SVG. */
  fill: string;
  /** Hex "#rrggbb" untuk input color picker. */
  hex: string;
  /** Berapa path yang memakai warna ini. */
  count: number;
}

const FILL_RE = /fill="(rgb\(\d+,\d+,\d+\))"/g;

export function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return "#000000";
  return (
    "#" +
    [m[1], m[2], m[3]]
      .map((v) => Number(v).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgb(${r},${g},${b})`;
}

/** Daftar warna unik pada SVG, diurutkan dari yang paling banyak dipakai. */
export function extractPalette(svg: string): PaletteEntry[] {
  const counts = new Map<string, number>();
  for (const match of svg.matchAll(FILL_RE)) {
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([fill, count]) => ({ fill, hex: rgbToHex(fill), count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Ganti satu warna palet (fill dan stroke yang sama) dengan warna baru.
 * `from` dalam bentuk "rgb(r,g,b)", `toHex` dalam bentuk "#rrggbb".
 */
export function recolorSvg(svg: string, from: string, toHex: string): string {
  const to = hexToRgb(toHex);
  return svg.split(`"${from}"`).join(`"${to}"`);
}

/** Terapkan beberapa penggantian warna sekaligus ({ "rgb(..)": "#hex" }). */
export function applyRecolors(svg: string, mapping: Record<string, string>): string {
  let out = svg;
  for (const [from, toHex] of Object.entries(mapping)) {
    out = recolorSvg(out, from, toHex);
  }
  return out;
}

/**
 * Versi outline: semua fill dihilangkan, tepi digambar dengan garis tipis —
 * seperti tampilan "Outlines" pada Image Trace Illustrator.
 */
export function outlineSvg(svg: string, strokeColor = "#ff00ff"): string {
  return svg
    .replace(/fill="rgb\(\d+,\d+,\d+\)"/g, 'fill="none"')
    .replace(/stroke="rgb\(\d+,\d+,\d+\)"/g, `stroke="${strokeColor}"`)
    .replace(/stroke-width="[\d.]+"/g, 'stroke-width="1"')
    .replace(/opacity="[\d.]+"/g, 'opacity="1"');
}

/** Perkiraan jumlah titik jangkar: jumlah segmen garis + kurva pada semua path. */
export function countAnchors(svg: string): number {
  let anchors = 0;
  for (const match of svg.matchAll(/\sd="([^"]+)"/g)) {
    anchors += (match[1].match(/[LQMC]/gi) ?? []).length;
  }
  return anchors;
}
