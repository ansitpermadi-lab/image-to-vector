import ImageTracer, { type ImageTracerOptions } from "imagetracerjs";
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
 * Memetakan opsi tingkat-produk (detail 0–1, smoothing 0–1) ke parameter
 * mentah ImageTracer (threshold, pathomit, blur).
 */
export function toImageTracerOptions(options: TraceOptions): ImageTracerOptions {
  const detail = clamp(options.detail, 0, 1);
  const smoothing = clamp(options.smoothing, 0, 1);
  // Threshold rendah = kurva mengikuti piksel lebih ketat (lebih detail).
  const threshold = 0.5 + (1 - detail) * 1.5;

  const base: ImageTracerOptions = {
    ltres: threshold,
    qtres: threshold,
    pathomit: Math.round(4 + (1 - detail) * 16),
    rightangleenhance: true,
    colorquantcycles: 3,
    blurradius: smoothing * 5,
    blurdelta: 20,
    strokewidth: 1,
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

  return {
    ...base,
    colorsampling: 2,
    numberofcolors: clamp(Math.round(options.colorCount), 2, 64),
  };
}

export function traceImageData(
  input: TraceInput,
  options: TraceOptions = DEFAULT_TRACE_OPTIONS,
): TraceResult {
  const start = performance.now();
  const svg = ImageTracer.imagedataToSVG(
    { width: input.width, height: input.height, data: input.data },
    toImageTracerOptions(options),
  );
  return {
    svg,
    width: input.width,
    height: input.height,
    pathCount: (svg.match(/<path/g) ?? []).length,
    durationMs: performance.now() - start,
  };
}
