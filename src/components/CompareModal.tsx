"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TraceResult } from "@/core/tracer/types";
import {
  applyRecolors,
  countAnchors,
  listLayers,
  outlineSvg,
  rgbToHex,
  setLayerVisibility,
} from "@/core/svg-utils";
import { baseName, downloadBlob } from "@/lib/download";
import { svgToPngBlob } from "@/lib/export-png";

const PNG_SCALES = [1, 2, 4, 8];
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 16;

type ViewMode = "hasil" | "outline" | "outline-sumber";

const VIEW_LABELS: Record<ViewMode, string> = {
  hasil: "Hasil",
  outline: "Outline",
  "outline-sumber": "Outline + sumber",
};

export interface ItemEdits {
  colorEdits: Record<string, string>;
  hiddenLayers: string[];
}

interface CompareModalProps {
  name: string;
  previewUrl: string;
  result: TraceResult;
  edits: ItemEdits;
  onEdits: (edits: ItemEdits) => void;
  onClose: () => void;
}

/**
 * Viewer + panel Layers ala Illustrator: tiap layer warna bisa
 * disembunyikan (eye), diganti warnanya, dan dilihat bobot anchor-nya.
 */
export function CompareModal({
  name,
  previewUrl,
  result,
  edits,
  onEdits,
  onClose,
}: CompareModalProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [split, setSplit] = useState(50);
  const [pngScale, setPngScale] = useState(2);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("hasil");
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null);

  // Layer diambil dari hasil ASLI supaya identitas stabil saat recolor/hide.
  const layers = useMemo(() => listLayers(result.svg), [result.svg]);
  const totalAnchors = useMemo(() => countAnchors(result.svg), [result.svg]);

  const displaySvg = useMemo(
    () =>
      setLayerVisibility(
        applyRecolors(result.svg, edits.colorEdits),
        edits.hiddenLayers,
      ),
    [result.svg, edits],
  );

  const shownSvg = useMemo(
    () => (viewMode === "hasil" ? displaySvg : outlineSvg(displaySvg)),
    [displaySvg, viewMode],
  );

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

  const toggleLayer = (id: string) => {
    const hidden = edits.hiddenLayers.includes(id)
      ? edits.hiddenLayers.filter((h) => h !== id)
      : [...edits.hiddenLayers, id];
    onEdits({ ...edits, hiddenLayers: hidden });
  };

  const soloLayer = (id: string) => {
    const others = layers.map((l) => l.id).filter((l) => l !== id);
    const isSolo =
      edits.hiddenLayers.length === others.length &&
      others.every((o) => edits.hiddenLayers.includes(o));
    onEdits({ ...edits, hiddenLayers: isSolo ? [] : others });
  };

  const setColor = (fill: string, hex: string) => {
    onEdits({ ...edits, colorEdits: { ...edits.colorEdits, [fill]: hex } });
  };

  const resetEdits = () => onEdits({ colorEdits: {}, hiddenLayers: [] });

  const hasEdits =
    Object.keys(edits.colorEdits).length > 0 || edits.hiddenLayers.length > 0;

  const exportPng = async () => {
    setExporting(true);
    try {
      const blob = await svgToPngBlob(displaySvg, result.width, result.height, pngScale);
      downloadBlob(blob, `${baseName(name)}@${pngScale}x.png`);
    } finally {
      setExporting(false);
    }
  };

  const exportSvg = () => {
    downloadBlob(
      new Blob([displaySvg], { type: "image/svg+xml" }),
      `${baseName(name)}.svg`,
    );
  };

  const showSource = viewMode !== "outline";
  const useSplitClip = viewMode === "hasil";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Perbandingan ${name}`}
    >
      <div
        className="flex max-h-full w-full max-w-6xl flex-col gap-3 overflow-y-auto rounded-2xl bg-white p-4 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="truncate font-semibold" title={name}>
            {name}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-gray-400/50 text-xs font-medium">
              {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 ${
                    viewMode === mode ? "bg-blue-600 text-white" : "hover:bg-gray-500/10"
                  }`}
                >
                  {VIEW_LABELS[mode]}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="rounded-lg border border-gray-400/50 px-3 py-1 text-sm hover:bg-gray-500/10"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="min-w-0 flex-1">
            <div
              className="relative h-[46vh] cursor-grab touch-none overflow-hidden rounded-xl border border-gray-400/30 bg-[repeating-conic-gradient(#8882_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] active:cursor-grabbing"
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
                className="absolute left-1/2 top-1/2"
                style={{
                  width: result.width,
                  height: result.height,
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
              >
                {showSource && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt={`Asli: ${name}`}
                    className="absolute inset-0 h-full w-full select-none object-fill"
                    draggable={false}
                  />
                )}
                <div
                  className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
                  style={useSplitClip ? { clipPath: `inset(0 0 0 ${split}%)` } : undefined}
                  dangerouslySetInnerHTML={{ __html: shownSvg }}
                />
                {useSplitClip && (
                  <div
                    className="absolute bottom-0 top-0 w-[2px] bg-blue-500"
                    style={{ left: `${split}%` }}
                  />
                )}
              </div>

              {useSplitClip && (
                <>
                  <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                    Asli
                  </span>
                  <span className="absolute right-3 top-3 rounded-md bg-blue-600/90 px-2 py-0.5 text-xs font-medium text-white">
                    Vektor
                  </span>
                </>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              <div className="flex items-center gap-1.5">
                <button onClick={() => changeZoom(1 / 1.4)} aria-label="Perkecil" className="rounded-md border border-gray-400/50 px-2.5 py-1 hover:bg-gray-500/10">−</button>
                <span className="w-14 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                <button onClick={() => changeZoom(1.4)} aria-label="Perbesar" className="rounded-md border border-gray-400/50 px-2.5 py-1 hover:bg-gray-500/10">+</button>
                <button onClick={resetView} className="ml-1 rounded-md border border-gray-400/50 px-2.5 py-1 hover:bg-gray-500/10">Reset</button>
              </div>
              <label className="flex min-w-40 flex-1 items-center gap-2">
                <span className="shrink-0 text-xs font-medium opacity-70">Asli ⟷ Vektor</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  disabled={!useSplitClip}
                  onChange={(e) => setSplit(Number(e.target.value))}
                  className="w-full disabled:opacity-30"
                  aria-label="Geser pembatas perbandingan"
                />
              </label>
              <span className="text-xs opacity-60 tabular-nums">
                {layers.length} layer · {totalAnchors} anchor ·{" "}
                {(displaySvg.length / 1024).toFixed(1)} KB
              </span>
            </div>
          </div>

          <aside className="w-full shrink-0 rounded-xl border border-gray-400/30 lg:w-72">
            <header className="flex items-center justify-between border-b border-gray-400/20 px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">
                Layers
              </h3>
              {hasEdits && (
                <button
                  onClick={resetEdits}
                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Reset semua
                </button>
              )}
            </header>
            <ul className="max-h-[46vh] overflow-y-auto p-1.5">
              {layers.map((layer) => {
                const hidden = edits.hiddenLayers.includes(layer.id);
                const currentHex =
                  edits.colorEdits[layer.fill] ?? rgbToHex(layer.fill);
                return (
                  <li
                    key={layer.id}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-500/10 ${hidden ? "opacity-45" : ""}`}
                  >
                    <button
                      onClick={() => toggleLayer(layer.id)}
                      aria-label={hidden ? `Tampilkan ${layer.name}` : `Sembunyikan ${layer.name}`}
                      aria-pressed={!hidden}
                      title={hidden ? "Tampilkan layer" : "Sembunyikan layer"}
                      className="w-7 shrink-0 rounded-md border border-gray-400/40 py-0.5 text-center text-xs hover:bg-gray-500/10"
                    >
                      {hidden ? "—" : "👁"}
                    </button>
                    <label
                      className="relative h-7 w-7 shrink-0 cursor-pointer"
                      title="Klik untuk ganti warna"
                    >
                      <span
                        className="block h-full w-full rounded-md border border-gray-400/40"
                        style={{ backgroundColor: currentHex }}
                      />
                      <input
                        type="color"
                        value={currentHex}
                        onChange={(e) => setColor(layer.fill, e.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label={`Ganti warna layer ${layer.name}`}
                      />
                    </label>
                    <button
                      onClick={() => soloLayer(layer.id)}
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                      title="Klik untuk lihat layer ini saja (solo)"
                    >
                      {layer.name}
                    </button>
                    <span className="shrink-0 text-xs opacity-50 tabular-nums">
                      {layer.anchors}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-gray-400/20 px-3 py-2 text-[11px] leading-snug opacity-50">
              👁 sembunyikan/tampilkan · klik nama = solo · angka = jumlah anchor.
              Layer tersembunyi tidak ikut diekspor.
            </p>
          </aside>
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
            Ekspor memakai warna & visibilitas layer saat ini.
          </span>
        </footer>
      </div>
    </div>
  );
}
