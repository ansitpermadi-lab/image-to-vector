import { traceImageData } from "@/core/tracer";
import type { TraceInput, TraceOptions, TraceResult } from "@/core/tracer";

export interface TraceRequest {
  id: number;
  input: TraceInput;
  options: TraceOptions;
}

export type TraceResponse =
  | { id: number; ok: true; result: TraceResult }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<TraceRequest>) => {
  const { id, input, options } = event.data;
  let response: TraceResponse;
  try {
    response = { id, ok: true, result: traceImageData(input, options) };
  } catch (error) {
    response = { id, ok: false, error: String(error) };
  }
  self.postMessage(response);
};
