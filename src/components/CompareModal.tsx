"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TraceResult } from "@/core/tracer/types";
import { baseName, downloadBlob } from "@/lib/download";
import { svgToPngBlob } from "@/lib/export-png";

const PNG_SCALES = [1, 2, 4, 8];
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 16;

interface CompareModalProps {
  name: string;
  previewUrl: string;
  result: TraceResult;
  onClose: () => void;
}

/**
 * Viewer perbandingan: gambar asli dan hasil SVG ditumpuk pada posisi yang
 * sama; slider menggeser garis pembatas (kiri = asli, kanan = vektor).
 * Zoom dengan scroll/tombol, pan dengan drag.
 */
export function CompareModal({ name, previewUrl, result, onClose }: CompareModalProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [split, setSplit] = useState(50);
  const [pngScale, setPngScale] = useState(2);
  const [exporting, setExporting] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changeZoom = useCallback((factor: number) => {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
  }, []);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const exportPng = async () => {
    setExporting(true);
    try {
      const blob = await svgToPngBlob(result.svg, result.width, result.height, pngScale);
      downloadBlob(blob, `${baseName(name)}@${pngScale}x.png`);
    } finally {
      setExporting(false);
    }
  };

  const exportSvg = () => {
    downloadBlob(
      new Blob([result.svg], { type: "image/svg+xml" }),
      `${baseName(name)}.svg`,
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Perbandingan ${name}`}
    >
      <div
        className="flex max-h-full w-full max-w-5xl flex-col gap-3 rounded-2xl bg-white p-4 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3">
          <h2 className="truncate font-semibold" title={name}>
            {name}
          </h2>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-lg border border-gray-400/50 px-3 py-1 text-sm hover:bg-gray-500/10"
          >
            ✕ Tutup
          </button>
        </header>

        <div
          className="relative h-[55vh] cursor-grab touch-none overflow-hidden rounded-xl border border-gray-400/30 bg-[repeating-conic-gradient(#8882_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] active:cursor-grabbing"
          onWheel={(e) => changeZoom(e.deltaY < 0 ? 1.2 : 1 / 1.2)}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              panX: pan.x,
              panY: pan.y,
            };
          }}
          onPointerMove={(e) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== e.pointerId) return;
            setPan({
              x: drag.panX + (e.clientX - drag.startX),
              y: drag.panY + (e.clientY - drag.startY),
            });
          }}
          onPointerUp={() => (dragRef.current = null)}
          onPointerCancel={() => (dragRef.current = null)}
        >
          <div
            className="absolute left-1/2 top-1/2 aspect-auto"
            style={{
              width: result.width,
              height: result.height,
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={`Asli: ${name}`}
              className="absolute inset-0 h-full w-full select-none object-fill"
              draggable={false}
            />
            <div
              className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
              style={{ clipPath: `inset(0 0 0 ${split}%)` }}
              dangerouslySetInnerHTML={{ __html: result.svg }}
            />
            <div
              className="absolute bottom-0 top-0 w-[2px] bg-blue-500"
              style={{ left: `${split}%` }}
            />
          </div>

          <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            Asli
          </span>
          <span className="absolute right-3 top-3 rounded-md bg-blue-600/90 px-2 py-0.5 text-xs font-medium text-white">
            Vektor
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
          <div className="flex items-center gap-1.5">
            <button onClick={() => changeZoom(1 / 1.4)} aria-label="Perkecil" className="rounded-md border border-gray-400/50 px-2.5 py-1 hover:bg-gray-500/10">−</button>
            <span className="w-14 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={() => changeZoom(1.4)} aria-label="Perbesar" className="rounded-md border border-gray-400/50 px-2.5 py-1 hover:bg-gray-500/10">+</button>
            <button onClick={resetView} className="ml-1 rounded-md border border-gray-400/50 px-2.5 py-1 hover:bg-gray-500/10">Reset</button>
          </div>

          <label className="flex min-w-48 flex-1 items-center gap-2">
            <span className="shrink-0 text-xs font-medium opacity-70">Asli ⟷ Vektor</span>
            <input
              type="range"
              min={0}
              max={100}
              value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              className="w-full"
              aria-label="Geser pembatas perbandingan"
            />
          </label>

          <span className="text-xs opacity-60 tabular-nums">
            {result.pathCount} path · {(result.svg.length / 1024).toFixed(1)} KB
          </span>
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-gray-400/20 pt-3">
          <button
            onClick={exportSvg}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Download SVG
          </button>
          <div className="flex items-center gap-2">
            <select
              value={pngScale}
              onChange={(e) => setPngScale(Number(e.target.value))}
              className="rounded-md border border-gray-400/40 bg-transparent px-2 py-1.5 text-sm"
              aria-label="Skala PNG"
            >
              {PNG_SCALES.map((s) => (
                <option key={s} value={s}>
                  {s}× ({result.width * s}×{result.height * s}px)
                </option>
              ))}
            </select>
            <button
              onClick={exportPng}
              disabled={exporting}
              className="rounded-lg border border-gray-400/50 px-4 py-2 text-sm font-medium hover:bg-gray-500/10 disabled:opacity-40"
            >
              {exporting ? "Membuat PNG…" : "Download PNG"}
            </button>
          </div>
          <span className="ml-auto text-xs opacity-50">
            PNG dirender ulang dari vektor — tajam di skala berapa pun.
          </span>
        </footer>
      </div>
    </div>
  );
}
