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

/**
 * Terapkan beberapa penggantian warna sekaligus ({ "rgb(..)": "#hex" }).
 * SATU PASS: setiap fill/stroke dievaluasi tepat sekali terhadap mapping,
 * jadi hasil penggantian satu warna tidak bisa ikut tertimpa penggantian
 * warna lain (mis. tukar warna dua layer tetap benar, tidak berantai).
 */
export function applyRecolors(svg: string, mapping: Record<string, string>): string {
  if (Object.keys(mapping).length === 0) return svg;
  const resolved: Record<string, string> = {};
  for (const [from, toHex] of Object.entries(mapping)) resolved[from] = hexToRgb(toHex);
  return svg.replace(
    /(fill|stroke)="(rgb\(\d+,\d+,\d+\))"/g,
    (_, attr, rgb) => `${attr}="${resolved[rgb] ?? rgb}"`,
  );
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

function attrOf(attrs: string, name: string): string {
  return attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
}

/**
 * Rapikan struktur SVG: semua path dengan warna sama digabung menjadi SATU
 * path (multi-subpath) di dalam <g> layer bernama — 1 warna = 1 shape.
 * Region tiap warna saling lepas (hasil segmentasi), jadi penggabungan
 * subpath aman untuk fill-rule nonzero; lubang tetap ikut di d masing-masing.
 */
export function mergePathsByColor(svg: string): string {
  const firstPath = svg.indexOf("<path");
  if (firstPath === -1) return svg;
  const header = svg.slice(0, firstPath).trimEnd();

  interface Layer {
    fill: string;
    opacity: string;
    ds: string[];
  }
  const layers = new Map<string, Layer>();
  const order: string[] = [];
  for (const match of svg.matchAll(/<path([^>]*)\/>/g)) {
    const attrs = match[1];
    const fill = attrOf(attrs, "fill");
    const opacity = attrOf(attrs, "opacity") || "1";
    const d = attrOf(attrs, "d");
    if (!d) continue;
    const key = `${fill}|${opacity}`;
    if (!layers.has(key)) {
      layers.set(key, { fill, opacity, ds: [] });
      order.push(key);
    }
    layers.get(key)!.ds.push(d.trim());
  }
  if (order.length === 0) return svg;

  const body = order
    .map((key, i) => {
      const layer = layers.get(key)!;
      const name = layer.fill.startsWith("rgb")
        ? rgbToHex(layer.fill)
        : layer.fill;
      // Stroke sewarna 1px menutup celah antialiasing antar-region.
      return (
        `<g id="layer-${i + 1}" data-name="${name}">` +
        `<path fill="${layer.fill}" stroke="${layer.fill}" stroke-width="1" ` +
        `opacity="${layer.opacity}" d="${layer.ds.join(" ")}" />` +
        `</g>`
      );
    })
    .join("\n");

  return `${header}\n${body}\n</svg>`;
}

/** Ramer–Douglas–Peucker: buang titik polyline yang menyimpang < epsilon. */
function rdp(points: Array<[number, number]>, epsilon: number): Array<[number, number]> {
  if (points.length < 3) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    // Chord degenerat (titik awal == akhir, umum pada ring tertutup imagetracer):
    // ukur jarak Euclidean ke titik awal, bukan jarak-ke-garis yang selalu 0 —
    // tanpa ini seluruh subpath tertutup kolaps jadi satu titik lalu lenyap.
    const degenerate = len < 1e-9;
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = a + 1; i < b; i++) {
      const dist = degenerate
        ? Math.hypot(points[i][0] - ax, points[i][1] - ay)
        : Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len;
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxDist > epsilon && maxIdx > 0) {
      keep[maxIdx] = true;
      stack.push([a, maxIdx], [maxIdx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round1 = (v: number) => String(Math.round(v * 10) / 10);

/**
 * Sederhanakan satu atribut d (format imagetracer: M/L/Q/Z absolut):
 * deretan segmen L dijalankan lewat RDP; kurva Q dipertahankan.
 * Padanan Object > Path > Simplify di Illustrator.
 */
export function simplifyPathD(d: string, epsilon: number): string {
  const tokens = d.trim().split(/[\s,]+/);
  const out: string[] = [];
  let run: Array<[number, number]> = [];

  const flushRun = () => {
    if (run.length >= 2) {
      const simplified = run.length >= 3 ? rdp(run, epsilon) : run;
      for (let k = 1; k < simplified.length; k++) {
        out.push("L", round1(simplified[k][0]), round1(simplified[k][1]));
      }
    }
    run = [];
  };

  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === "M") {
      flushRun();
      out.push("M", tokens[i + 1], tokens[i + 2]);
      run = [[Number(tokens[i + 1]), Number(tokens[i + 2])]];
      i += 3;
    } else if (cmd === "L") {
      const x = Number(tokens[i + 1]);
      const y = Number(tokens[i + 2]);
      if (run.length === 0) run = [[x, y]];
      else run.push([x, y]);
      i += 3;
    } else if (cmd === "Q") {
      flushRun();
      out.push("Q", tokens[i + 1], tokens[i + 2], tokens[i + 3], tokens[i + 4]);
      run = [[Number(tokens[i + 3]), Number(tokens[i + 4])]];
      i += 5;
    } else if (cmd === "Z" || cmd === "z") {
      flushRun();
      out.push("Z");
      i += 1;
    } else {
      return d; // format tak dikenal — jangan sentuh
    }
  }
  flushRun();
  return out.join(" ");
}

/** Terapkan simplifyPathD ke semua path pada SVG. */
export function simplifySvgPaths(svg: string, epsilonPx: number): string {
  if (epsilonPx <= 0) return svg;
  return svg.replace(/ d="([^"]+)"/g, (_, d) => ` d="${simplifyPathD(d, epsilonPx)}"`);
}

/**
 * Lebur warna palet yang nyaris kembar (jarak RGB ≤ delta) ke warna yang
 * paling banyak dipakai — mencegah layer ganda seperti #e5e8ef vs #e6e9f0.
 */
export function mergeSimilarColors(svg: string, delta = 20): string {
  const palette = extractPalette(svg); // sudah terurut desc berdasarkan pemakaian
  const kept: Array<{ fill: string; rgb: [number, number, number] }> = [];
  const mapping: Record<string, string> = {};
  for (const entry of palette) {
    const m = entry.fill.match(/rgb\((\d+),(\d+),(\d+)\)/);
    if (!m) continue;
    const rgb: [number, number, number] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const near = kept.find(
      (k) =>
        Math.hypot(k.rgb[0] - rgb[0], k.rgb[1] - rgb[1], k.rgb[2] - rgb[2]) <= delta,
    );
    if (near) mapping[entry.fill] = rgbToHex(near.fill);
    else kept.push({ fill: entry.fill, rgb });
  }
  return Object.keys(mapping).length ? applyRecolors(svg, mapping) : svg;
}

export interface LayerInfo {
  id: string;
  name: string;
  fill: string;
  anchors: number;
}

/**
 * Daftar layer <g> hasil mergePathsByColor, urut sesuai dokumen. Regex
 * membolehkan atribut lain (mis. display="none") di antara id dan data-name,
 * jadi layer yang sedang disembunyikan tetap muncul di daftar.
 */
export function listLayers(svg: string): LayerInfo[] {
  return [
    ...svg.matchAll(
      /<g id="(layer-\d+)"[^>]*?data-name="([^"]+)"[^>]*><path[^>]*fill="([^"]+)"[^>]*d="([^"]+)"/g,
    ),
  ].map((m) => ({
    id: m[1],
    name: m[2],
    fill: m[3],
    anchors: (m[4].match(/[LQMC]/gi) ?? []).length,
  }));
}

/**
 * Sembunyikan layer tertentu (display="none") tanpa membuang datanya.
 * Idempoten: id yang sudah tersembunyi tidak ditambahi atribut ganda, dan
 * setiap panggilan lebih dulu membuang semua display="none" lama — jadi
 * daftar hiddenIds adalah sumber kebenaran (bisa dipakai untuk unhide juga).
 */
export function setLayerVisibility(svg: string, hiddenIds: string[]): string {
  const clean = svg.replace(/(<g id="layer-\d+")\s+display="none"/g, "$1");
  const wanted = new Set(hiddenIds);
  return clean.replace(/<g id="(layer-\d+)"/g, (match, id) =>
    wanted.has(id) ? `<g id="${id}" display="none"` : match,
  );
}

/** Perkiraan jumlah titik jangkar: jumlah segmen garis + kurva pada semua path. */
export function countAnchors(svg: string): number {
  let anchors = 0;
  for (const match of svg.matchAll(/\sd="([^"]+)"/g)) {
    anchors += (match[1].match(/[LQMC]/gi) ?? []).length;
  }
  return anchors;
}
