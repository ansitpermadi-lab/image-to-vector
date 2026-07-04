import type { TraceOptions } from "./types";

export type PresetKey = "logo" | "sketsa" | "ilustrasi" | "foto" | "abu";

export interface Preset {
  key: PresetKey;
  label: string;
  description: string;
  options: TraceOptions;
}

const BASE = {
  threshold: 0.5,
  noise: 8,
  corners: true,
  ignoreWhite: false,
  removeBg: true,
  bgTolerance: 0.12,
} as const;

/**
 * Preset sekali-klik per jenis gambar (padanan preset Image Trace Illustrator).
 * Nilainya hasil tuning manual: logo butuh warna sedikit + tepi presisi,
 * foto butuh warna banyak + smoothing agar noise tidak menjadi ribuan path.
 */
export const PRESETS: readonly Preset[] = [
  {
    key: "logo",
    label: "Logo",
    description: "Warna sedikit, tepi tajam — untuk logo dan ikon.",
    options: { ...BASE, mode: "color", colorCount: 8, detail: 0.85, smoothing: 0 },
  },
  {
    key: "sketsa",
    label: "Sketsa",
    description: "Hitam-putih detail tinggi — untuk line-art dan tanda tangan.",
    options: { ...BASE, mode: "bw", colorCount: 2, detail: 0.9, smoothing: 0.1, noise: 4 },
  },
  {
    key: "ilustrasi",
    label: "Ilustrasi",
    description: "Warna sedang, kurva halus — untuk ilustrasi flat.",
    options: { ...BASE, mode: "color", colorCount: 24, detail: 0.7, smoothing: 0.1 },
  },
  {
    key: "abu",
    label: "Abu-abu",
    description: "Tingkat abu merata — seperti Shades of Gray di Illustrator.",
    options: { ...BASE, mode: "grayscale", colorCount: 12, detail: 0.6, smoothing: 0.15 },
  },
  {
    key: "foto",
    label: "Foto (poster)",
    description: "Warna banyak + smoothing — foto menjadi gaya poster.",
    options: { ...BASE, mode: "color", colorCount: 32, detail: 0.45, smoothing: 0.35, noise: 12 },
  },
];

/** Field yang menentukan identitas preset (hapus-background berdiri sendiri). */
const PRESET_FIELDS = [
  "mode",
  "colorCount",
  "detail",
  "smoothing",
  "threshold",
  "noise",
  "corners",
  "ignoreWhite",
] as const;

/** Cari preset yang persis sama dengan opsi saat ini (untuk menandai chip aktif). */
export function matchPreset(options: TraceOptions): PresetKey | null {
  for (const preset of PRESETS) {
    if (PRESET_FIELDS.every((f) => preset.options[f] === options[f])) {
      return preset.key;
    }
  }
  return null;
}
