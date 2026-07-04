import ImageTracer, { type ImageTracerOptions } from "imagetracerjs";
import { binarize, grayPalette, toGrayscale } from "@/core/preprocess/tone";
import {
  mergePathsByColor,
  mergeSimilarColors,
  simplifySvgPaths,
} from "@/core/svg-utils";
import {
  DEFAULT_TRACE_OPTIONS,
  type TraceInput,
  type TraceOptions,
  type TraceResult,
} from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Memetakan opsi tingkat-produk (detail 0–1, smoothing 0–1, noise px) ke
 * parameter mentah ImageTracer (threshold kurva, pathomit, blur).
 */
export function toImageTracerOptions(options: TraceOptions): ImageTracerOptions {
  const detail = clamp(options.detail, 0, 1);
  const smoothing = clamp(options.smoothing, 0, 1);
  const simplify = clamp(options.simplify, 0, 1);
  // Threshold rendah = kurva mengikuti piksel lebih ketat (lebih detail).
  // Simplify melonggarkan toleransi fitting — tepi kasar tidak diikuti
  // titik demi titik (pengurang anchor terbesar untuk gambar bertekstur).
  const threshold = (0.5 + (1 - detail) * 1.5) * (1 + simplify * 3);

  const base: ImageTracerOptions = {
    ltres: threshold,
    qtres: threshold,
    pathomit: Math.round(clamp(options.noise, 0, 100)),
    rightangleenhance: options.corners,
    colorquantcycles: 3,
    blurradius: smoothing * 5,
    blurdelta: 20,
    strokewidth: 1,
    linefilter: true,
    roundcoords: 1,
    viewbox: true,
    desc: false,
  };

  if (options.mode === "bw") {
    return {
      ...base,
      // Palet tetap hitam-putih; colorsampling 0 memakai palet apa adanya.
      colorsampling: 0,
      numberofcolors: 2,
      pal: [
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
      ],
    };
  }

  if (options.mode === "grayscale") {
    const levels = clamp(Math.round(options.colorCount), 2, 64);
    return {
      ...base,
      colorsampling: 0,
      numberofcolors: levels,
      pal: grayPalette(levels),
    };
  }

  return {
    ...base,
    colorsampling: 2,
    numberofcolors: clamp(Math.round(options.colorCount), 2, 64),
  };
}

/** Buang path yang sepenuhnya transparan (mis. latar hasil removeBackground). */
export function stripInvisiblePaths(svg: string): string {
  return svg.replace(/<path[^>]*\sopacity="0(\.0+)?"[^>]*\/>\s*/g, "");
}

/** Buang path putih/hampir putih — padanan "Ignore White" di Illustrator. */
export function stripWhitePaths(svg: string, minChannel = 250): string {
  return svg.replace(
    /<path[^>]*\sfill="rgb\((\d+),(\d+),(\d+)\)"[^>]*\/>\s*/g,
    (match, r, g, b) =>
      Number(r) >= minChannel && Number(g) >= minChannel && Number(b) >= minChannel
        ? ""
        : match,
  );
}

export function traceImageData(
  input: TraceInput,
  options: TraceOptions = DEFAULT_TRACE_OPTIONS,
): TraceResult {
  const start = performance.now();

  let prepared = input;
  if (options.mode === "grayscale") prepared = toGrayscale(input);
  else if (options.mode === "bw") prepared = binarize(input, options.threshold);

  let svg = stripInvisiblePaths(
    ImageTracer.imagedataToSVG(
      { width: prepared.width, height: prepared.height, data: prepared.data },
      toImageTracerOptions(options),
    ),
  );
  if (options.ignoreWhite) svg = stripWhitePaths(svg);
  // Lebur warna nyaris kembar supaya tidak jadi layer ganda.
  svg = mergeSimilarColors(svg);
  // Sederhanakan path (RDP) — buang anchor yang cuma mengikuti gerigi piksel.
  svg = simplifySvgPaths(svg, clamp(options.simplify, 0, 1) * 2.5);
  // Rapikan struktur: 1 warna = 1 shape di dalam layer <g> bernama.
  svg = mergePathsByColor(svg);

  return {
    svg,
    width: input.width,
    height: input.height,
    pathCount: (svg.match(/<path/g) ?? []).length,
    durationMs: performance.now() - start,
  };
}
