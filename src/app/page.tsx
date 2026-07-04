"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_TRACE_OPTIONS,
  type TraceInput,
  type TraceOptions,
  type TraceResult,
} from "@/core/tracer/types";
import type { TraceRequest, TraceResponse } from "@/workers/trace.worker";

/** Sisi terpanjang maksimum; gambar lebih besar di-resize agar browser tetap lancar. */
const MAX_DIMENSION = 2048;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"];

interface LoadedImage {
  name: string;
  previewUrl: string;
  input: TraceInput;
  wasResized: boolean;
}

async function fileToTraceInput(file: File): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D tidak tersedia di browser ini.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  return {
    name: file.name,
    previewUrl: URL.createObjectURL(file),
    input: { width, height, data: imageData.data },
    wasResized: scale < 1,
  };
}

export default function Home() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [options, setOptions] = useState<TraceOptions>(DEFAULT_TRACE_OPTIONS);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/trace.worker.ts", import.meta.url),
    );
    worker.onmessage = (event: MessageEvent<TraceResponse>) => {
      // Abaikan respons dari permintaan lama yang sudah tersusul.
      if (event.data.id !== requestIdRef.current) return;
      setBusy(false);
      if (event.data.ok) {
        setResult(event.data.result);
        setError(null);
      } else {
        setError(`Gagal melakukan tracing: ${event.data.error}`);
      }
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const requestTrace = useCallback((input: TraceInput, opts: TraceOptions) => {
    const worker = workerRef.current;
    if (!worker) return;
    const id = ++requestIdRef.current;
    setBusy(true);
    const message: TraceRequest = { id, input, options: opts };
    worker.postMessage(message);
  }, []);

  // Re-trace otomatis (debounced) saat pengaturan berubah.
  useEffect(() => {
    if (!image) return;
    const timer = setTimeout(() => requestTrace(image.input, options), 250);
    return () => clearTimeout(timer);
  }, [image, options, requestTrace]);

  const loadFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(
        `Format ${file.type || "tidak dikenal"} belum didukung. Gunakan PNG, JPG, WebP, GIF, atau BMP.`,
      );
      return;
    }
    setError(null);
    setResult(null);
    try {
      const loaded = await fileToTraceInput(file);
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return loaded;
      });
    } catch (err) {
      setError(`Gagal membaca gambar: ${String(err)}`);
    }
  }, []);

  // Dukung paste gambar dari clipboard.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) void loadFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  const downloadSvg = () => {
    if (!result || !image) return;
    const blob = new Blob([result.svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = image.name.replace(/\.[^.]+$/, "") + ".svg";
    link.click();
    URL.revokeObjectURL(url);
  };

  const copySvg = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.svg);
  };

  const svgSizeKb = result ? (result.svg.length / 1024).toFixed(1) : null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Image to Vector</h1>
        <p className="mt-1 opacity-70">
          Konversi PNG/JPG menjadi SVG langsung di browser — gambar tidak pernah
          diunggah ke server.
        </p>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void loadFile(file);
        }}
        className={`mb-6 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-blue-500 bg-blue-500/10" : "border-gray-400/40"
        }`}
      >
        <p className="mb-3">
          Tarik & letakkan gambar di sini, tempel dari clipboard (Ctrl+V), atau
        </p>
        <label className="inline-block cursor-pointer rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
          Pilih file
          <input
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
              e.target.value = "";
            }}
          />
        </label>
        {image?.wasResized && (
          <p className="mt-3 text-sm opacity-60">
            Gambar diperkecil ke maks. {MAX_DIMENSION}px agar proses tetap cepat.
          </p>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {image && (
        <>
          <section className="mb-6 grid gap-4 rounded-xl border border-gray-400/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Mode</span>
              <select
                value={options.mode}
                onChange={(e) =>
                  setOptions({ ...options, mode: e.target.value as TraceOptions["mode"] })
                }
                className="rounded-md border border-gray-400/40 bg-transparent px-2 py-1.5"
              >
                <option value="color">Warna</option>
                <option value="bw">Hitam-putih</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                Jumlah warna: {options.mode === "bw" ? 2 : options.colorCount}
              </span>
              <input
                type="range"
                min={2}
                max={64}
                value={options.colorCount}
                disabled={options.mode === "bw"}
                onChange={(e) =>
                  setOptions({ ...options, colorCount: Number(e.target.value) })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Detail: {Math.round(options.detail * 100)}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(options.detail * 100)}
                onChange={(e) =>
                  setOptions({ ...options, detail: Number(e.target.value) / 100 })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                Smoothing: {Math.round(options.smoothing * 100)}%
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(options.smoothing * 100)}
                onChange={(e) =>
                  setOptions({ ...options, smoothing: Number(e.target.value) / 100 })
                }
              />
            </label>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <figure className="rounded-xl border border-gray-400/30 p-4">
              <figcaption className="mb-2 text-sm font-medium opacity-70">
                Asli — {image.name}
              </figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.previewUrl}
                alt="Gambar asli"
                className="max-h-[480px] w-full object-contain"
              />
            </figure>
            <figure className="rounded-xl border border-gray-400/30 p-4">
              <figcaption className="mb-2 flex items-center justify-between text-sm font-medium opacity-70">
                <span>Hasil SVG {busy && "· memproses…"}</span>
                {result && (
                  <span>
                    {result.pathCount} path · {svgSizeKb} KB ·{" "}
                    {Math.round(result.durationMs)} ms
                  </span>
                )}
              </figcaption>
              {result ? (
                <div
                  className="max-h-[480px] w-full overflow-auto [&>svg]:h-auto [&>svg]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: result.svg }}
                />
              ) : (
                <div className="flex h-64 items-center justify-center opacity-50">
                  {busy ? "Memproses…" : "Menunggu hasil"}
                </div>
              )}
            </figure>
          </section>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={downloadSvg}
              disabled={!result || busy}
              className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download SVG
            </button>
            <button
              onClick={copySvg}
              disabled={!result || busy}
              className="rounded-lg border border-gray-400/50 px-5 py-2.5 font-medium hover:bg-gray-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Salin kode SVG
            </button>
          </div>
        </>
      )}

      <footer className="mt-12 border-t border-gray-400/20 pt-4 text-sm opacity-60">
        Optimal untuk logo, ikon, dan ilustrasi flat. Foto kompleks menghasilkan
        gaya poster dengan warna yang disederhanakan.
      </footer>
    </main>
  );
}
