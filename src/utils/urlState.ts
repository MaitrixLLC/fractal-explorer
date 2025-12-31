// src/utils/urlState.ts — serialize/parse application state to/from URL
import type { AppState } from '@/state/types';

export function serializeState(st: AppState) {
  const p = new URLSearchParams();
  p.set('cx', st.view.cx.toString());
  p.set('cy', st.view.cy.toString());
  p.set('scale', st.view.scale.toString());
  p.set('iter', st.render.iterations.toString());
  p.set('pow', st.render.power.toString());
  p.set('bail', st.render.bailout.toString());
  p.set('detail', st.render.detail.toString());
  p.set('type', st.render.fractal);
  p.set('palette', st.palette.preset);
  p.set('cycle', st.palette.cycle.toFixed(3));
  p.set('rev', st.palette.reverse ? '1' : '0');
  p.set('prec', st.render.precision);
  p.set('alg', st.render.algorithm);
  if (st.render.fractal === 'julia') {
    p.set('jx', st.juliaC.x.toString());
    p.set('jy', st.juliaC.y.toString());
  }
  return p.toString();
}

export function pushUrlState(qs: string) {
  const url = `${location.pathname}?${qs}`;
  history.replaceState(null, '', url);
}

export function parseUrlState(qs: string) {
  const p = new URLSearchParams(qs);
  return {
    mergeInto(defaults: AppState) {
      const s = { ...defaults };
      const num = (k: string, fallback: number) => {
        const v = p.get(k); if (v == null) return fallback;
        const n = Number(v); return Number.isFinite(n) ? n : fallback;
      };
      if (p.has('cx')) s.view.cx = num('cx', s.view.cx);
      if (p.has('cy')) s.view.cy = num('cy', s.view.cy);
      if (p.has('scale')) s.view.scale = num('scale', s.view.scale);
      if (p.has('iter')) s.render.iterations = Math.floor(num('iter', s.render.iterations));
      if (p.has('pow')) s.render.power = num('pow', s.render.power);
      if (p.has('bail')) s.render.bailout = num('bail', s.render.bailout);
      if (p.has('detail')) {
        const d = num('detail', s.render.detail) as 1|2|4;
        s.render.detail = (d === 1 || d === 2 || d === 4) ? d : s.render.detail;
      }
      if (p.has('type')) {
        const t = p.get('type')!;
        if (t === 'mandelbrot' || t === 'julia' || t === 'burning-ship') s.render.fractal = t;
      }
      if (p.has('palette')) s.palette.preset = p.get('palette')!;
      if (p.has('cycle')) s.palette.cycle = num('cycle', s.palette.cycle);
      if (p.has('rev')) s.palette.reverse = p.get('rev') === '1';
      if (p.has('prec')) {
        const m = p.get('prec')!;
        if (m === 'float' || m === 'perturb' || m === 'bigfloat') s.render.precision = m;
      }
      if (p.has('alg')) {
        const a = p.get('alg')!;
        if (a === 'escape' || a === 'de') s.render.algorithm = a;
      }
      if (p.has('jx')) s.juliaC.x = num('jx', s.juliaC.x);
      if (p.has('jy')) s.juliaC.y = num('jy', s.juliaC.y);
      return s;
    }
  };
}
