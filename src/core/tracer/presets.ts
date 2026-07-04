import type { TraceOptions } from "./types";

export type PresetKey = "logo" | "sketsa" | "ilustrasi" | "foto";

export interface Preset {
  key: PresetKey;
  label: string;
  description: string;
  options: TraceOptions;
}

/**
 * Preset sekali-klik per jenis gambar. Nilainya hasil tuning manual:
 * logo butuh warna sedikit + tepi presisi, foto butuh warna banyak +
 * smoothing agar noise tidak menjadi ribuan path kecil.
 */
export const PRESETS: readonly Preset[] = [
  {
    key: "logo",
    label: "Logo",
    description: "Warna sedikit, tepi tajam — untuk logo dan ikon.",
    options: {
      mode: "color",
      colorCount: 8,
      detail: 0.85,
      smoothing: 0,
      removeBg: false,
      bgTolerance: 0.12,
    },
  },
  {
    key: "sketsa",
    label: "Sketsa",
    description: "Hitam-putih detail tinggi — untuk line-art dan tanda tangan.",
    options: {
      mode: "bw",
      colorCount: 2,
      detail: 0.9,
      smoothing: 0.1,
      removeBg: false,
      bgTolerance: 0.12,
    },
  },
  {
    key: "ilustrasi",
    label: "Ilustrasi",
    description: "Warna sedang, kurva halus — untuk ilustrasi flat.",
    options: {
      mode: "color",
      colorCount: 24,
      detail: 0.7,
      smoothing: 0.1,
      removeBg: false,
      bgTolerance: 0.12,
    },
  },
  {
    key: "foto",
    label: "Foto (poster)",
    description: "Warna banyak + smoothing — foto menjadi gaya poster.",
    options: {
      mode: "color",
      colorCount: 32,
      detail: 0.45,
      smoothing: 0.35,
      removeBg: false,
      bgTolerance: 0.12,
    },
  },
];

/** Cari preset yang persis sama dengan opsi saat ini (untuk menandai chip aktif). */
export function matchPreset(options: TraceOptions): PresetKey | null {
  for (const preset of PRESETS) {
    const p = preset.options;
    if (
      p.mode === options.mode &&
      p.colorCount === options.colorCount &&
      p.detail === options.detail &&
      p.smoothing === options.smoothing
    ) {
      return preset.key;
    }
  }
  return null;
}
