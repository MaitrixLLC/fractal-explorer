// src/utils/palette.ts — palette presets and palette texture builder
import type { PaletteConfig } from '@/state/types';

// Gradient stops for presets
type Stop = { t: number; rgb: [number, number, number] };

const presets: Record<string, Stop[]> = {
  'electric-blue': [
    { t: 0, rgb: [0, 7, 100] },
    { t: 0.16, rgb: [32, 107, 203] },
    { t: 0.42, rgb: [237, 255, 255] },
    { t: 0.6425, rgb: [255, 170, 0] },
    { t: 0.8575, rgb: [0, 2, 0] },
    { t: 1, rgb: [0, 7, 100] }
  ],
  'classic-blue': [
    { t: 0, rgb: [0, 0, 0] },
    { t: 0.25, rgb: [0, 0, 64] },
    { t: 0.5, rgb: [0, 128, 255] },
    { t: 0.75, rgb: [255, 255, 255] },
    { t: 1, rgb: [0, 0, 0] }
  ],
  'fire': [
    { t: 0, rgb: [0, 0, 0] },
    { t: 0.3, rgb: [180, 20, 0] },
    { t: 0.6, rgb: [255, 220, 0] },
    { t: 1, rgb: [255, 255, 255] }
  ],
  'viridis': [
    { t: 0, rgb: [68, 1, 84] }, { t: 0.25, rgb: [59, 82, 139] },
    { t: 0.5, rgb: [33, 145, 140] }, { t: 0.75, rgb: [94, 201, 97] },
    { t: 1, rgb: [253, 231, 37] }
  ],
  'magma': [
    { t: 0, rgb: [0, 0, 3] }, { t: 0.5, rgb: [251, 53, 108] }, { t: 1, rgb: [252, 253, 191] }
  ],
  'plasma': [
    { t: 0, rgb: [12, 7, 134] }, { t: 0.5, rgb: [225, 77, 104] }, { t: 1, rgb: [240, 249, 33] }
  ],
  'rainbow': [
    { t: 0, rgb: [148, 0, 211] }, { t: 0.2, rgb: [75, 0, 130] }, { t: 0.4, rgb: [0, 0, 255] },
    { t: 0.6, rgb: [0, 255, 0] }, { t: 0.8, rgb: [255, 255, 0] }, { t: 1, rgb: [255, 0, 0] }
  ],
  'grayscale': [
    { t: 0, rgb: [0,0,0] }, { t: 1, rgb: [255,255,255] }
  ]
};

export function listPalettePresets() {
  return Object.keys(presets);
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp01(x: number) { return Math.min(1, Math.max(0, x)); }

function cosineInterpolate(a: number, b: number, t: number) {
  const ct = (1 - Math.cos(Math.PI * t)) / 2;
  return a * (1 - ct) + b * ct;
}

function interpRGB(a: [number,number,number], b: [number,number,number], t: number, mode: 'linear'|'cosine'|'perceptual') {
  const f = mode === 'cosine' ? cosineInterpolate : lerp;
  // naive perceptual: lift to gamma 2.2, interpolate, back
  if (mode === 'perceptual') {
    const ag = a.map(v => Math.pow(v/255, 2.2)) as any as [number,number,number];
    const bg = b.map(v => Math.pow(v/255, 2.2)) as any as [number,number,number];
    const rg = [f(ag[0], bg[0], t), f(ag[1], bg[1], t), f(ag[2], bg[2], t)];
    return rg.map(v => Math.round(clamp01(Math.pow(v, 1/2.2)) * 255)) as [number,number,number];
  }
  return [Math.round(f(a[0], b[0], t)), Math.round(f(a[1], b[1], t)), Math.round(f(a[2], b[2], t))] as [number,number,number];
}

export function buildPaletteTexture(cfg: PaletteConfig, size = 1024): Uint8Array {
  const stops = presets[cfg.preset] || presets['electric-blue'];
  const out = new Uint8Array(size * 4);
  // repeat pattern according to length, reverse, cycle handled in shader by offset
  for (let i = 0; i < size; i++) {
    let t = i / (size - 1);
    if (cfg.reverse) t = 1 - t;
    // find surrounding stops
    const idx = stops.findIndex(s => s.t >= t);
    const i1 = Math.max(1, idx);
    const s0 = stops[i1 - 1];
    const s1 = stops[i1] || stops[stops.length - 1];
    const u = (t - s0.t) / Math.max(1e-6, s1.t - s0.t);
    const rgb = interpRGB(s0.rgb, s1.rgb, clamp01(u), cfg.interpolation);
    const j = i * 4;
    out[j] = rgb[0];
    out[j + 1] = rgb[1];
    out[j + 2] = rgb[2];
    out[j + 3] = 255;
  }
  return out;
}
