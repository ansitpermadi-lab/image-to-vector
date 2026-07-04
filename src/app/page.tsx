"use client";

import JSZip from "jszip";
import { useCallback, useEffect, useRef, useState } from "react";
import { CompareModal } from "@/components/CompareModal";
import { matchPreset, PRESETS } from "@/core/tracer/presets";
import {
  DEFAULT_TRACE_OPTIONS,
  type TraceInput,
  type TraceOptions,
  type TraceResult,
} from "@/core/tracer/types";
import { baseName, downloadBlob } from "@/lib/download";
import type { TraceResponse } from "@/workers/trace.worker";

/** Sisi terpanjang maksimum; gambar lebih besar di-resize agar browser tetap lancar. */
const MAX_DIMENSION = 2048;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"];

type ItemStatus = "queued" | "tracing" | "done" | "error";

interface BatchItem {
  id: string;
  name: string;
  fileSize: number;
  previewUrl: string;
  input: TraceInput;
  wasResized: boolean;
  status: ItemStatus;
  result: TraceResult | null;
  /** SVG dengan warna yang sudah diganti pengguna (null = pakai hasil asli). */
  editedSvg: string | null;
  error: string | null;
}

let nextItemId = 0;

async function fileToItem(file: File): Promise<BatchItem> {
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

  return {
    id: `item-${nextItemId++}`,
    name: file.name,
    fileSize: file.size,
    previewUrl: URL.createObjectURL(file),
    input: { width, height, data: ctx.getImageData(0, 0, width, height).data },
    wasResized: scale < 1,
    status: "queued",
    result: null,
    editedSvg: null,
    error: null,
  };
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  queued: "antre",
  tracing: "memproses…",
  done: "selesai",
  error: "gagal",
};

function kb(bytes: number): string {
  return (bytes / 1024).toFixed(1) + " KB";
}

export default function Home() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [options, setOptions] = useState<TraceOptions>(DEFAULT_TRACE_OPTIONS);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [viewItemId, setViewItemId] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  /** Naik setiap setting berubah; respons dari generasi lama dibuang. */
  const genRef = useRef(0);
  /** id item yang sedang diproses worker (null = idle). */
  const busyRef = useRef<string | null>(null);

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/trace.worker.ts", import.meta.url),
    );
    worker.onmessage = (event: MessageEvent<TraceResponse>) => {
      const [gen, itemId] = event.data.id.split(":");
      busyRef.current = null;
      const stale = Number(gen) !== genRef.current;
      // setItems selalu dipanggil agar efek antrian jalan lagi (memproses item berikutnya).
      setItems((prev) =>
        prev.map((item) => {
          if (stale || item.id !== itemId) return item;
          return event.data.ok
            ? // Hasil baru membatalkan recolor lama (paletnya bisa berbeda).
              { ...item, status: "done", result: event.data.result, editedSvg: null, error: null }
            : { ...item, status: "error", error: event.data.error, result: null };
        }),
      );
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // Pompa antrian: kirim item "queued" berikutnya saat worker menganggur.
  useEffect(() => {
    if (busyRef.current || !workerRef.current) return;
    const next = items.find((item) => item.status === "queued");
    if (!next) return;
    busyRef.current = next.id;
    workerRef.current.postMessage({
      id: `${genRef.current}:${next.id}`,
      input: next.input,
      options,
    });
    // Penanda status antrian, bukan sinkronisasi turunan — pola pompa antrian yang disengaja.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems((prev) =>
      prev.map((item) =>
        item.id === next.id ? { ...item, status: "tracing" } : item,
      ),
    );
  }, [items, options]);

  // Setting berubah → semua item di-trace ulang (debounced).
  const optionsInitialized = useRef(false);
  useEffect(() => {
    if (!optionsInitialized.current) {
      optionsInitialized.current = true;
      return;
    }
    const timer = setTimeout(() => {
      genRef.current++;
      setItems((prev) => prev.map((item) => ({ ...item, status: "queued" })));
    }, 250);
    return () => clearTimeout(timer);
  }, [options]);

  const addFiles = useCallback(async (files: File[]) => {
    const accepted = files.filter((f) => ACCEPTED_TYPES.includes(f.type));
    const rejected = files.length - accepted.length;
    setError(
      rejected > 0
        ? `${rejected} file dilewati (format tidak didukung). Gunakan PNG, JPG, WebP, GIF, atau BMP.`
        : null,
    );
    for (const file of accepted) {
      try {
        const item = await fileToItem(file);
        setItems((prev) => [...prev, item]);
      } catch (err) {
        setError(`Gagal membaca ${file.name}: ${String(err)}`);
      }
    }
  }, []);

  // Dukung paste gambar dari clipboard.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) void addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const clearAll = () => {
    setItems((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setError(null);
  };

  const itemSvg = (item: BatchItem) => item.editedSvg ?? item.result?.svg ?? "";

  const downloadItem = (item: BatchItem) => {
    if (!item.result) return;
    downloadBlob(
      new Blob([itemSvg(item)], { type: "image/svg+xml" }),
      `${baseName(item.name)}.svg`,
    );
  };

  const downloadZip = async () => {
    const done = items.filter((item) => item.status === "done" && item.result);
    if (!done.length) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      for (const item of done) {
        const base = baseName(item.name);
        let filename = `${base}.svg`;
        for (let n = 2; used.has(filename); n++) filename = `${base}-${n}.svg`;
        used.add(filename);
        zip.file(filename, itemSvg(item));
      }
      downloadBlob(await zip.generateAsync({ type: "blob" }), "vektor.zip");
    } finally {
      setZipping(false);
    }
  };

  const applyPreset = (presetOptions: TraceOptions) => {
    // Toggle hapus-background berdiri sendiri; preset tidak menimpanya.
    setOptions({
      ...presetOptions,
      removeBg: options.removeBg,
      bgTolerance: options.bgTolerance,
    });
  };

  const activePreset = matchPreset(options);
  const doneCount = items.filter((item) => item.status === "done").length;
  const processing = items.some(
    (item) => item.status === "queued" || item.status === "tracing",
  );
  const viewItem = items.find((item) => item.id === viewItemId);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Image to Vector</h1>
        <p className="mt-1 opacity-70">
          Konversi banyak PNG/JPG menjadi SVG sekaligus, langsung di browser —
          gambar tidak pernah diunggah ke server.
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
          void addFiles(Array.from(e.dataTransfer.files));
        }}
        className={`mb-6 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-blue-500 bg-blue-500/10" : "border-gray-400/40"
        }`}
      >
        <p className="mb-3">
          Tarik & letakkan <strong>satu atau banyak gambar</strong> di sini,
          tempel dari clipboard (Ctrl+V), atau
        </p>
        <label className="inline-block cursor-pointer rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
          Pilih file
          <input
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {items.length > 0 && (
        <>
          <section className="mb-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium opacity-70">Preset:</span>
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                onClick={() => applyPreset(preset.options)}
                title={preset.description}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  activePreset === preset.key
                    ? "bg-blue-600 text-white"
                    : "border border-gray-400/50 hover:bg-gray-500/10"
                }`}
              >
                {preset.label}
              </button>
            ))}
            {!activePreset && (
              <span className="rounded-full border border-dashed border-gray-400/50 px-4 py-1.5 text-sm opacity-60">
                Custom
              </span>
            )}
          </section>

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
                <option value="grayscale">Abu-abu (grayscale)</option>
                <option value="bw">Hitam-putih</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                {options.mode === "grayscale" ? "Tingkat abu" : "Jumlah warna"}:{" "}
                {options.mode === "bw" ? 2 : options.colorCount}
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
              <span className="font-medium">
                Threshold B/W: {Math.round(options.threshold * 100)}%
              </span>
              <input
                type="range"
                min={5}
                max={95}
                value={Math.round(options.threshold * 100)}
                disabled={options.mode !== "bw"}
                onChange={(e) =>
                  setOptions({ ...options, threshold: Number(e.target.value) / 100 })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Noise: {options.noise} px</span>
              <input
                type="range"
                min={0}
                max={50}
                value={options.noise}
                onChange={(e) =>
                  setOptions({ ...options, noise: Number(e.target.value) })
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
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Opsi tepi & warna</span>
              <span className="flex flex-col gap-1.5 py-1">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.corners}
                    onChange={(e) =>
                      setOptions({ ...options, corners: e.target.checked })
                    }
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span className="text-xs opacity-70">pertegas sudut 90°</span>
                </span>
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.ignoreWhite}
                    onChange={(e) =>
                      setOptions({ ...options, ignoreWhite: e.target.checked })
                    }
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span className="text-xs opacity-70">abaikan putih (ignore white)</span>
                </span>
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Hapus background</span>
              <span className="flex items-center gap-2 py-1.5">
                <input
                  type="checkbox"
                  checked={options.removeBg}
                  onChange={(e) =>
                    setOptions({ ...options, removeBg: e.target.checked })
                  }
                  className="h-4 w-4 accent-blue-600"
                />
                <span className="text-xs opacity-70">
                  jadikan warna latar transparan
                </span>
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                Toleransi BG: {Math.round(options.bgTolerance * 100)}%
              </span>
              <input
                type="range"
                min={1}
                max={60}
                value={Math.round(options.bgTolerance * 100)}
                disabled={!options.removeBg}
                onChange={(e) =>
                  setOptions({ ...options, bgTolerance: Number(e.target.value) / 100 })
                }
              />
            </label>
          </section>

          <section className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-gray-400/30 p-4">
            <span className="text-sm font-medium">
              {doneCount}/{items.length} selesai
              {processing && " · sedang memproses…"}
            </span>
            <div className="ml-auto flex flex-wrap gap-3">
              <button
                onClick={downloadZip}
                disabled={doneCount === 0 || zipping}
                className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {zipping ? "Membuat ZIP…" : `Download semua (${doneCount}) — ZIP`}
              </button>
              <button
                onClick={clearAll}
                className="rounded-lg border border-gray-400/50 px-5 py-2.5 font-medium hover:bg-gray-500/10"
              >
                Hapus semua
              </button>
            </div>
          </section>

          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-400/30 p-4"
              >
                <header className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium" title={item.name}>
                    {item.name}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      item.status === "done"
                        ? "bg-green-500/15 text-green-700 dark:text-green-400"
                        : item.status === "error"
                          ? "bg-red-500/15 text-red-700 dark:text-red-400"
                          : "bg-gray-500/15 opacity-80"
                    }`}
                  >
                    {STATUS_LABEL[item.status]}
                  </span>
                </header>

                <button
                  onClick={() => item.result && setViewItemId(item.id)}
                  disabled={!item.result}
                  title={item.result ? "Klik untuk membandingkan dengan zoom" : undefined}
                  className={`grid grid-cols-2 gap-2 text-left ${item.result ? "cursor-zoom-in" : "cursor-default"}`}
                >
                  <span className="flex h-36 items-center justify-center overflow-hidden rounded-lg border border-gray-400/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.previewUrl}
                      alt={`Asli: ${item.name}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  </span>
                  <span className="flex h-36 items-center justify-center overflow-hidden rounded-lg border border-gray-400/20 [&_svg]:max-h-full [&_svg]:max-w-full">
                    {item.result ? (
                      <span
                        className="flex h-full w-full items-center justify-center"
                        dangerouslySetInnerHTML={{ __html: itemSvg(item) }}
                      />
                    ) : (
                      <span className="text-xs opacity-50">
                        {item.status === "error" ? "gagal" : "menunggu…"}
                      </span>
                    )}
                  </span>
                </button>

                <p className="text-xs opacity-60 tabular-nums">
                  {item.result
                    ? `${kb(item.fileSize)} → ${kb(item.result.svg.length)} · ${item.result.pathCount} path · ${Math.round(item.result.durationMs)} ms`
                    : item.error ?? `${item.input.width}×${item.input.height}${item.wasResized ? " (diperkecil)" : ""}`}
                </p>

                <div className="mt-auto flex gap-2">
                  <button
                    onClick={() => downloadItem(item)}
                    disabled={!item.result}
                    className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Download SVG
                  </button>
                  <button
                    onClick={() => item.result && setViewItemId(item.id)}
                    disabled={!item.result}
                    className="rounded-lg border border-gray-400/50 px-3 py-1.5 text-sm font-medium hover:bg-gray-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Bandingkan
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="rounded-lg border border-gray-400/50 px-3 py-1.5 text-sm font-medium hover:bg-gray-500/10"
                  >
                    Hapus
                  </button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {viewItem?.result && (
        <CompareModal
          name={viewItem.name}
          previewUrl={viewItem.previewUrl}
          result={viewItem.result}
          editedSvg={viewItem.editedSvg}
          onEdited={(svg) =>
            setItems((prev) =>
              prev.map((item) =>
                item.id === viewItem.id ? { ...item, editedSvg: svg } : item,
              ),
            )
          }
          onClose={() => setViewItemId(null)}
        />
      )}

      <footer className="mt-12 border-t border-gray-400/20 pt-4 text-sm opacity-60">
        Optimal untuk logo, ikon, dan ilustrasi flat. Foto kompleks menghasilkan
        gaya poster dengan warna yang disederhanakan. Gambar besar otomatis
        diperkecil ke {MAX_DIMENSION}px.
      </footer>
    </main>
  );
}
