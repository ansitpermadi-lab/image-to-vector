import { traceImageData } from "@/core/tracer";
import type { TraceInput, TraceOptions, TraceResult } from "@/core/tracer";

export interface TraceRequest {
  /** Format "generasi:itemId" — generasi lama dibuang oleh UI saat setting berubah. */
  id: string;
  input: TraceInput;
  options: TraceOptions;
}

export type TraceResponse =
  | { id: string; ok: true; result: TraceResult }
  | { id: string; ok: false; error: string };

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
