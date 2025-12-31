// src/components/Sidebar.tsx — UI controls for rendering, palette and exports
import React, { useMemo, useRef, useState } from 'react';
import { useFractalState } from '@/state/useFractalState';
import { listPalettePresets } from '@/utils/palette';
import { GLRenderer } from '@/gl/renderer';

export default function Sidebar({ renderer }: { renderer: React.MutableRefObject<GLRenderer | null> }) {
  const s = useFractalState();
  const setIter = useFractalState(st => st.setIterations);
  const setPower = useFractalState(st => st.setPower);
  const setRender = useFractalState(st => st.setRender);
  const setPalette = useFractalState(st => st.setPalette);
  const setAdjust = useFractalState(st => st.setAdjust);
  const setMapping = useFractalState(st => st.setMapping);
  const setView = useFractalState(st => st.setView);
  const addBookmark = useFractalState(st => st.addBookmark);
  const loadBookmark = useFractalState(st => st.loadBookmark);
  const removeBookmark = useFractalState(st => st.removeBookmark);
  const setUI = useFractalState(st => st.setUI);

  const presets = useMemo(listPalettePresets, []);
  const [exporting, setExporting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const exportImage = async (format: 'png'|'jpeg'|'webp', scale: number) => {
    if (!renderer.current) return;
    setExporting(true);
    setUI({ exporting: true, exportProgress: 0 });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const width = Math.floor(renderer.current!.canvas.clientWidth * scale);
      const height = Math.floor(renderer.current!.canvas.clientHeight * scale);
      const cnv = await renderer.current!.exportTiled(useFractalState.getState(), {
        width, height, tile: 768, signal: ctrl.signal,
        onProgress: (p) => setUI({ exportProgress: p })
      });
      const blob = await new Promise<Blob>(r => cnv.toBlob(b => r(b!), `image/${format}`, format === 'jpeg' ? 0.95 : 0.98));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fractal.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      if ((e as any).message !== 'aborted') console.error(e);
    } finally {
      setExporting(false);
      setUI({ exporting: false, exportProgress: 0 });
      abortRef.current = null;
    }
  };

  return (
    <aside className="sidebar" aria-label="Controls">
      <div className="header">
        <strong>Mandelbrot Explorer</strong>
        <div>
          <button onClick={() => setUI({ showUI: !s.ui.showUI })}>Toggle UI</button>
        </div>
      </div>

      <div className="helper" role="note">
        Shift + drag: Box-zoom. Alt + click: center. Wheel: zoom (Ctrl finer). Arrows: pan. +/-: zoom. R: reset. H: toggle UI. F: fullscreen.
      </div>

      <div className="section">
        <h3>Render settings</h3>
        <div className="row">
          <label htmlFor="iterations">Iterations</label>
          <input id="iterations" type="number" min={50} max={20000} value={s.render.iterations} onChange={e => setIter(parseInt(e.target.value || '0', 10))} />
        </div>
        <input type="range" min={50} max={10000} value={s.render.iterations} onChange={e => setIter(parseInt(e.target.value, 10))} />
        <div className="row">
          <label>Detail (SSAA)</label>
          <select value={s.render.detail} onChange={e => setRender({ detail: parseInt(e.target.value, 10) as any })}>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>
        <div className="row">
          <label>Exponent (power)</label>
          <input type="number" min={2} max={16} step={1} value={s.render.power} onChange={e => setPower(parseFloat(e.target.value))} />
        </div>
        <div className="row">
          <label>Bailout</label>
          <input type="number" min={2} max={1024} value={s.render.bailout} onChange={e => setRender({ bailout: parseFloat(e.target.value) })} />
        </div>
        <div className="row">
          <label>Fractal</label>
          <select value={s.render.fractal} onChange={e => setRender({ fractal: e.target.value as any })}>
            <option value="mandelbrot">Mandelbrot/Multibrot</option>
            <option value="julia">Julia</option>
            <option value="burning-ship">Burning Ship (beta)</option>
          </select>
        </div>
        {s.render.fractal === 'julia' && (
          <div className="row">
            <label>Julia c (click with ⌘/Ctrl)</label>
            <div className="coords">c = {s.juliaC.x.toFixed(6)} {s.juliaC.y >= 0 ? '+' : ''}{s.juliaC.y.toFixed(6)}i</div>
          </div>
        )}
        <div className="row">
          <label>Algorithm</label>
          <select value={s.render.algorithm} onChange={e => setRender({ algorithm: e.target.value as any })}>
            <option value="escape">Escape-time (smooth)</option>
            <option value="de" disabled>Distance Estimation (todo)</option>
          </select>
        </div>
        <div className="row">
          <label><input type="checkbox" checked={s.render.interiorSolid} onChange={e => setRender({ interiorSolid: e.target.checked })} /> Solid interior</label>
          <span />
        </div>
        <div className="row">
          <label><input type="checkbox" checked={s.render.symmetry2} onChange={e => setRender({ symmetry2: e.target.checked })} /> Symmetry aid (p=2)</label>
          <span />
        </div>
        <div className="row">
          <label>Precision</label>
          <select value={s.render.precision} onChange={e => setRender({ precision: e.target.value as any })}>
            <option value="float">Float (auto)</option>
            <option value="perturb" disabled>Perturbation (todo)</option>
            <option value="bigfloat" disabled>BigFloat (todo)</option>
          </select>
        </div>
      </div>

      <div className="section">
        <h3>Color palette</h3>
        <div className="row">
          <label>Preset</label>
          <select value={s.palette.preset} onChange={e => setPalette({ preset: e.target.value })}>
            {presets.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="row">
          <label>Length</label>
          <input type="number" min={2} max={4096} value={s.palette.length} onChange={e => setPalette({ length: parseInt(e.target.value, 10) })} />
        </div>
        <div className="row">
          <label>Cycle</label>
          <input type="range" min={0} max={1} step={0.001} value={s.palette.cycle} onChange={e => setPalette({ cycle: parseFloat(e.target.value) })} />
        </div>
        <div className="row">
          <label>Interpolation</label>
          <select value={s.palette.interpolation} onChange={e => setPalette({ interpolation: e.target.value as any })}>
            <option value="linear">Linear</option>
            <option value="cosine">Cosine</option>
            <option value="perceptual">Perceptual</option>
          </select>
        </div>
        <div className="row">
          <label><input type="checkbox" checked={s.palette.reverse} onChange={e => setPalette({ reverse: e.target.checked })} /> Reverse</label>
          <span />
        </div>
      </div>

      <div className="section">
        <h3>Palette range</h3>
        <div className="row">
          <label>Scale</label>
          <select value={s.mapping.scaleMode} onChange={e => setMapping({ scaleMode: e.target.value as any })}>
            <option value="linear">Linear</option>
            <option value="log">Log</option>
            <option value="sqrt">Sqrt</option>
          </select>
        </div>
        <div className="row">
          <label><input type="checkbox" checked={s.mapping.histEq} onChange={e => setMapping({ histEq: e.target.checked })} /> Histogram equalization (todo)</label>
          <span />
        </div>
        <div className="row">
          <label>Inside color</label>
          <select value={s.mapping.insideMode} onChange={e => setMapping({ insideMode: e.target.value as any })}>
            <option value="solid">Solid</option>
            <option value="trap" disabled>Orbit trap</option>
            <option value="distance" disabled>Distance-based</option>
          </select>
        </div>
      </div>

      <div className="section">
        <h3>Adjust colors</h3>
        <div className="row">
          <label>Brightness</label>
          <input type="range" min={-1} max={1} step={0.01} value={s.adjust.brightness} onChange={e => setAdjust({ brightness: parseFloat(e.target.value) })} />
        </div>
        <div className="row">
          <label>Contrast</label>
          <input type="range" min={-1} max={1} step={0.01} value={s.adjust.contrast} onChange={e => setAdjust({ contrast: parseFloat(e.target.value) })} />
        </div>
        <div className="row">
          <label>Gamma</label>
          <input type="range" min={0.1} max={3} step={0.01} value={s.adjust.gamma} onChange={e => setAdjust({ gamma: parseFloat(e.target.value) })} />
        </div>
        <div className="row">
          <label>Saturation</label>
          <input type="range" min={0} max={2} step={0.01} value={s.adjust.saturation} onChange={e => setAdjust({ saturation: parseFloat(e.target.value) })} />
        </div>
        <div className="row">
          <label>Hue</label>
          <input type="range" min={-180} max={180} step={1} value={s.adjust.hue} onChange={e => setAdjust({ hue: parseFloat(e.target.value) })} />
        </div>
        <div className="row">
          <label>Edge glow</label>
          <input type="range" min={0} max={1} step={0.01} value={s.adjust.edgeGlow} onChange={e => setAdjust({ edgeGlow: parseFloat(e.target.value) })} />
        </div>
      </div>

      <div className="section">
        <h3>Coordinates</h3>
        <div className="coords">center = {s.view.cx.toFixed(8)} {s.view.cy >= 0 ? '+' : ''}{s.view.cy.toFixed(8)}i</div>
        <div className="coords">scale = {s.view.scale.toExponential(4)} (width)</div>
        {s.cursor && (
          <div className="coords">cursor = {s.cursor.re.toFixed(8)} {s.cursor.im >= 0 ? '+' : ''}{s.cursor.im.toFixed(8)}i</div>
        )}
        <div className="row">
          <button onClick={() => setView({ cx: -0.75, cy: 0, scale: 3.0 })}>Reset</button>
          <button onClick={() => useFractalState.getState().undo()}>Undo</button>
          <button onClick={() => useFractalState.getState().redoPop()}>Redo</button>
        </div>
      </div>

      <div className="section">
        <h3>Bookmarks</h3>
        <div className="row">
          <input placeholder="Note…" onKeyDown={e => {
            if (e.key === 'Enter') { addBookmark((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value=''; }
          }} />
          <button onClick={() => addBookmark()}>Save</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {s.bookmarks.map(b => (
            <div key={b.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{b.note || '(no note)'}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>iter {b.iter} p {b.pow}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button onClick={() => loadBookmark(b.id)}>Load</button>
                <button onClick={() => removeBookmark(b.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>Footer actions</h3>
        <div className="footer">
          <button className="primary" onClick={() => exportImage('png', 4)} disabled={exporting}>Export 8k PNG</button>
          <button onClick={() => exportImage('webp', 2)} disabled={exporting}>Export 4k WebP</button>
          <button onClick={() => exportImage('jpeg', 2)} disabled={exporting}>Export 4k JPEG</button>
          <button onClick={() => navigator.clipboard.writeText(location.href)}>Copy permalink</button>
          <button onClick={() => document.documentElement.requestFullscreen()}>Fullscreen</button>
          {exporting && <button onClick={() => abortRef.current?.abort()} className="danger">Cancel</button>}
        </div>
        {s.ui.exporting && <div className="coords">Export: {(s.ui.exportProgress*100).toFixed(0)}%</div>}
      </div>
    </aside>
  );
}
