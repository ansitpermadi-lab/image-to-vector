export type TraceMode = "color" | "bw";

export interface TraceOptions {
  mode: TraceMode;
  /** Jumlah warna pada hasil (2–64). Diabaikan pada mode "bw". */
  colorCount: number;
  /** 0–1; makin tinggi makin banyak detail (dan makin banyak path). */
  detail: number;
  /** 0–1; blur ringan sebelum tracing untuk meredam noise. */
  smoothing: number;
}

export const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  mode: "color",
  colorCount: 16,
  detail: 0.7,
  smoothing: 0,
};

/** Bentuk data piksel yang aman dikirim lintas Web Worker (structured clone). */
export interface TraceInput {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface TraceResult {
  svg: string;
  width: number;
  height: number;
  pathCount: number;
  durationMs: number;
}
