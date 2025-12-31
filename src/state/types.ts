// src/state/types.ts — shared TypeScript types for application state
export type FractalType = 'mandelbrot' | 'julia' | 'burning-ship';

export type PrecisionMode = 'float' | 'perturb' | 'bigfloat';
export type AlgorithmMode = 'escape' | 'de';

export interface View {
  cx: number;
  cy: number;
  scale: number; // complex units across viewport width
}

export interface PaletteConfig {
  preset: string;
  length: number;
  cycle: number;
  reverse: boolean;
  interpolation: 'linear' | 'cosine' | 'perceptual';
  seed: number;
}

export interface Adjustments {
  brightness: number; // -1..1
  contrast: number;   // -1..1
  gamma: number;      // 0.1..3
  saturation: number; // 0..2
  hue: number;        // -180..180
  edgeGlow: number;   // 0..1
}

export interface RenderSettings {
  iterations: number;
  detail: 1 | 2 | 4; // SSAA scale
  power: number;     // 2..16
  bailout: number;   // 2..1024
  fractal: FractalType;
  algorithm: AlgorithmMode;
  symmetry2: boolean;
  interiorSolid: boolean;
  precision: PrecisionMode;
  highResProgressive: boolean;
}

export interface AppState {
  view: View;
  juliaC: { x: number, y: number };
  palette: PaletteConfig;
  adjust: Adjustments;
  mapping: { scaleMode: 'linear'|'log'|'sqrt', offset: number, gain: number, histEq: boolean, insideMode: 'solid'|'trap'|'distance' };
  render: RenderSettings;
  ui: { showUI: boolean; exporting: boolean; exportProgress: number; showShortcuts: boolean; };
  cursor: { x: number; y: number; re: number; im: number } | null;
  history: View[];
  redo: View[];
  bookmarks: { id: string; view: View; iter: number; pow: number; thumb?: string; note?: string }[];
}
