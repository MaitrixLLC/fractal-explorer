// src/state/useFractalState.ts — global app state (Zustand) and convenience setters
import { create } from 'zustand';
import type { AppState, View } from './types';
import { parseUrlState, pushUrlState, serializeState } from '@/utils/urlState';

const defaults: AppState = {
  view: { cx: -0.75, cy: 0.0, scale: 3.0 },
  juliaC: { x: -0.8, y: 0.156 },
  palette: { preset: 'electric-blue', length: 256, cycle: 0.0, reverse: false, interpolation: 'cosine', seed: 1 },
  adjust: { brightness: 0, contrast: 0, gamma: 1.0, saturation: 1.0, hue: 0, edgeGlow: 0.2 },
  mapping: { scaleMode: 'linear', offset: 0, gain: 1, histEq: false, insideMode: 'solid' },
  render: { iterations: 200, detail: 2, power: 2, bailout: 4, fractal: 'mandelbrot', algorithm: 'escape', symmetry2: true, interiorSolid: true, precision: 'float', highResProgressive: true },
  ui: { showUI: true, exporting: false, exportProgress: 0, showShortcuts: true },
  cursor: null,
  history: [],
  redo: [],
  bookmarks: []
};

function clamp(v: number, a: number, b: number) { return Math.min(b, Math.max(a, v)); }

const fromUrl = parseUrlState(location.search);

export const useFractalState = create<AppState & {
  setView: (v: Partial<View>, pushHistory?: boolean) => void;
  setIterations: (n: number) => void;
  setPower: (p: number) => void;
  setDetail: (d: 1|2|4) => void;
  setPalette: (patch: Partial<AppState['palette']>) => void;
  setAdjust: (patch: Partial<AppState['adjust']>) => void;
  setRender: (patch: Partial<AppState['render']>) => void;
  setMapping: (patch: Partial<AppState['mapping']>) => void;
  setUI: (patch: Partial<AppState['ui']>) => void;
  setCursor: (c: AppState['cursor']) => void;
  reset: () => void;
  undo: () => void;
  redoPop: () => void;
  addBookmark: (note?: string) => void;
  removeBookmark: (id: string) => void;
  loadBookmark: (id: string) => void;
}>((set, get) => {
  const initial: AppState = { ...defaults, ...fromUrl.mergeInto(defaults) };
  // load bookmarks
  try {
    const saved = localStorage.getItem('fx_bookmarks');
    if (saved) initial.bookmarks = JSON.parse(saved);
  } catch {}
  return {
    ...initial,
    setView(v, pushHist = true) {
      const prev = get().view;
      const next = { ...prev, ...v };
      set({ view: next });
      if (pushHist) set(state => ({ history: [...state.history, prev], redo: [] }));
      pushUrlState(serializeState({ ...get() }));
    },
    setIterations(n) { set(state => ({ render: { ...state.render, iterations: Math.floor(clamp(n, 50, 20000)) } })); },
    setPower(p) { set(state => ({ render: { ...state.render, power: clamp(p, 2, 16) } })); },
    setDetail(d) { set(state => ({ render: { ...state.render, detail: d } })); },
    setPalette(patch) { set(state => ({ palette: { ...state.palette, ...patch } })); },
    setAdjust(patch) { set(state => ({ adjust: { ...state.adjust, ...patch } })); },
    setRender(patch) { set(state => ({ render: { ...state.render, ...patch } })); },
    setMapping(patch) { set(state => ({ mapping: { ...state.mapping, ...patch } })); },
    setUI(patch) { set(state => ({ ui: { ...state.ui, ...patch } })); },
    setCursor(c) { set({ cursor: c }); },
    reset() { set({ ...defaults, history: [], redo: [] }); pushUrlState(serializeState({ ...defaults })); },
    undo() {
      const { history, view } = get();
      if (!history.length) return;
      const prev = history[history.length - 1];
      set({ view: prev, history: history.slice(0, -1), redo: [view, ...get().redo] });
      pushUrlState(serializeState({ ...get(), view: prev } as any));
    },
    redoPop() {
      const { redo, view } = get();
      if (!redo.length) return;
      const next = redo[0];
      set({ view: next, redo: redo.slice(1), history: [...get().history, view] });
      pushUrlState(serializeState({ ...get(), view: next } as any));
    },
    addBookmark(note) {
      const st = get();
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
      const bm = { id, view: st.view, iter: st.render.iterations, pow: st.render.power, note };
      const bookmarks = [bm, ...st.bookmarks].slice(0, 64);
      set({ bookmarks });
      try { localStorage.setItem('fx_bookmarks', JSON.stringify(bookmarks)); } catch {}
    },
    removeBookmark(id) {
      const bookmarks = get().bookmarks.filter(b => b.id !== id);
      set({ bookmarks });
      try { localStorage.setItem('fx_bookmarks', JSON.stringify(bookmarks)); } catch {}
    },
    loadBookmark(id) {
      const b = get().bookmarks.find(x => x.id === id);
      if (!b) return;
      get().setView(b.view);
      set(state => ({ render: { ...state.render, iterations: b.iter, power: b.pow } }));
    }
  };
});
