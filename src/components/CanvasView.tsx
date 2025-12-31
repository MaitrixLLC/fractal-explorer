// src/components/CanvasView.tsx — canvas view, pointer/wheel interactions and rendering loop
import React, { useEffect, useRef, useState } from 'react';
import { GLRenderer } from '@/gl/renderer';
import { useFractalState } from '@/state/useFractalState';
import type { AppState } from '@/state/types';

function clamp(v: number, a: number, b: number) { return Math.min(b, Math.max(a, v)); }

// Error Boundary class
class CanvasErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean; message?: string }> {
	constructor(props: React.PropsWithChildren) {
		super(props);
		this.state = { hasError: false };
	}
	static getDerivedStateFromError(err: unknown) {
		return { hasError: true, message: err instanceof Error ? err.message : String(err) };
	}
	componentDidCatch(error: unknown, info: any) {
		console.error('[CanvasErrorBoundary]', error, info);
	}
	render() {
		if (this.state.hasError) {
			return (
				<div role="alert" style={{ padding: 12, color: '#b00020' }}>
					Something went wrong in the canvas{this.state.message ? `: ${this.state.message}` : '.'}
				</div>
			);
		}
		return this.props.children as React.ReactNode;
	}
}

function CanvasViewInner() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GLRenderer | null>(null);
  const rafRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; view: AppState['view'] } | null>(null);
  const boxStart = useRef<{ x: number; y: number } | null>(null);

  const state = useFractalState();
  const setView = useFractalState(s => s.setView);
  const setCursor = useFractalState(s => s.setCursor);
  const setUI = useFractalState(s => s.setUI);

  // NEW: remember the most recent view so we can restore it after UI toggle
  const lastViewRef = useRef<AppState['view']>(useFractalState.getState().view);
  useEffect(() => {
    lastViewRef.current = state.view;
  }, [state.view]);

  // init renderer
  useEffect(() => {
    const canvas = canvasRef.current!;
    rendererRef.current = new GLRenderer({ canvas });
    const onResize = () => {
      if (!canvas) return;
      // CSS size managed by container; actual size in renderer
      requestRender();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // render loop on state changes
  const requestRender = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!rendererRef.current) return;
      if (state.palette) rendererRef.current.setPalette(state.palette);
      rendererRef.current.render(state);
    });
  };

  useEffect(() => {
    requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.view, state.render, state.palette, state.adjust, state.mapping]);

  // interactions
  const posToComplex = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const aspect = rect.width / Math.max(1, rect.height);
    const width = state.view.scale;
    const height = width / aspect;
    const re = (x / rect.width - 0.5) * width + state.view.cx;
    // FIX: invert Y → top of canvas is larger imaginary value
    const im = state.view.cy - (y / rect.height - 0.5) * height;
    return { re, im, x, y };
  };

  const startPreview = () => rendererRef.current?.withPreview(true);
  const endPreview = () => rendererRef.current?.withPreview(false);

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = posToComplex(e.clientX, e.clientY);
    dragStart.current = { x, y, view: state.view };
    setDragging(true);
    if (e.shiftKey) {
      boxStart.current = { x: e.clientX, y: e.clientY };
    } else {
      startPreview();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pt = posToComplex(e.clientX, e.clientY);
    useFractalState.getState().setCursor({ x: pt.x, y: pt.y, re: pt.re, im: pt.im });
    if (!dragging || !dragStart.current) return;
    if (boxStart.current) {
      requestRender();
      return;
    }
    const ds = dragStart.current;
    const rect = canvasRef.current!.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    const width = ds.view.scale;
    const height = width / aspect;
    // FIX: invert vertical direction so dragging up moves the image up
    const dx = (e.clientX - rect.left - ds.x) / rect.width * width;
    const dy = (e.clientY - rect.top - ds.y) / rect.height * height;
    setView({ cx: ds.view.cx - dx, cy: ds.view.cy + dy }, false);
    requestRender();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    if (boxStart.current) {
      const rect = canvas.getBoundingClientRect();

      // Complex-space selection corners
      const p0 = posToComplex(boxStart.current.x, boxStart.current.y); // client coords → complex
      const p1 = posToComplex(e.clientX, e.clientY);

      const widthC0 = Math.abs(p1.re - p0.re);
      const heightC0 = Math.abs(p1.im - p0.im);
      if (widthC0 > 0 && heightC0 > 0) {
        // Center in complex space
        const cRe = (p0.re + p1.re) * 0.5;
        const cIm = (p0.im + p1.im) * 0.5;

        // Lock to canvas aspect by expanding the smaller dimension
        const aspect = rect.width / Math.max(1, rect.height);
        let widthC = widthC0;
        let heightC = heightC0;
        const selAspect = widthC0 / heightC0;
        if (selAspect > aspect) {
          // wider than viewport → expand height
          heightC = widthC / aspect;
        } else {
          // taller than viewport → expand width
          widthC = heightC * aspect;
        }

        // Scale is the complex width across the viewport
        const newScale = widthC;
        setView({ cx: cRe, cy: cIm, scale: newScale });
      }
    }
    boxStart.current = null;
    setDragging(false);
    endPreview();
    requestRender();
  };

  // Shared wheel-zoom logic (no preventDefault here)
  const wheelZoom = (clientX: number, clientY: number, deltaY: number, ctrlKey: boolean) => {
    const s = useFractalState.getState();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const aspect = rect.width / Math.max(1, rect.height);
    const widthOld = s.view.scale;
    const heightOld = widthOld / aspect;

    const factor = ctrlKey ? 1.03 : 1.1;
    const zoomIn = deltaY < 0;
    const z = zoomIn ? (1 / factor) : factor;
    const scale = clamp(widthOld * z, 1e-15, 8.0);

    const widthNew = scale;
    const heightNew = widthNew / aspect;
    const nx = (x / rect.width - 0.5);
    const ny = (y / rect.height - 0.5);
    const re = (x / rect.width - 0.5) * widthOld + s.view.cx;
    // FIX: use inverted Y mapping for im
    const im = s.view.cy - (y / rect.height - 0.5) * heightOld;
    const cx = re - nx * widthNew;
    // FIX: cy = im + ny * heightNew (not im - ny * heightNew)
    const cy = im + ny * heightNew;

    s.setView({ cx, cy, scale }, true);
  };

  // React handler: do not call preventDefault, just reuse logic
  const onWheel = (e: React.WheelEvent) => {
    // no preventDefault here; native listener handles it
    wheelZoom(e.clientX, e.clientY, e.deltaY, e.ctrlKey);
  };

  // Attach a non-passive native wheel listener so preventDefault is allowed
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      wheelZoom(e.clientX, e.clientY, e.deltaY, e.ctrlKey);
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  const onClick = (e: React.MouseEvent) => {
    if (e.altKey) {
      const p = posToComplex(e.clientX, e.clientY);
      setView({ cx: p.re, cy: p.im });
    } else if (state.render.fractal === 'julia' && e.metaKey) {
      const p = posToComplex(e.clientX, e.clientY);
      useFractalState.setState({ juliaC: { x: p.re, y: p.im } });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT','TEXTAREA','SELECT'].includes((document.activeElement?.tagName||''))) return;
      if (e.key === 'h' || e.key === 'H') {
        const store = useFractalState.getState();
        const next = !store.ui.showUI;
        store.setUI({ showUI: next });
        // NEW: restore view on next tick so it never resets due to UI/layout changes
        const v = lastViewRef.current;
        setTimeout(() => store.setView({ cx: v.cx, cy: v.cy, scale: v.scale }, false), 0);
      }
      if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
      if (e.key === 'r' || e.key === 'R') { useFractalState.getState().reset(); }
      if (e.key === '+' || e.key === '=') { useFractalState.getState().setView({ scale: state.view.scale * 0.9 }); }
      if (e.key === '-' || e.key === '_') { useFractalState.getState().setView({ scale: state.view.scale / 0.9 }); }
      const step = state.view.scale * 0.05;
      if (e.key === 'ArrowLeft') useFractalState.getState().setView({ cx: state.view.cx - step }, true);
      if (e.key === 'ArrowRight') useFractalState.getState().setView({ cx: state.view.cx + step }, true);
      if (e.key === 'ArrowUp') useFractalState.getState().setView({ cy: state.view.cy - step }, true);
      if (e.key === 'ArrowDown') useFractalState.getState().setView({ cy: state.view.cy + step }, true);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.shiftKey ? useFractalState.getState().redoPop() : useFractalState.getState().undo(); }
    };
    window.addEventListener('keydown', onKey, { passive: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [state.view.scale]);

  // progressive during drag
  useEffect(() => {
    if (dragging) rendererRef.current?.withPreview(true);
    else rendererRef.current?.withPreview(false);
  }, [dragging]);

  // NEW: restore view immediately after any UI show/hide toggle and redraw
  useEffect(() => {
    const v = lastViewRef.current;
    const store = useFractalState.getState();
    requestAnimationFrame(() => {
      store.setView({ cx: v.cx, cy: v.cy, scale: v.scale }, false);
      // force a redraw at the current size after layout changes
      requestRender();
    });
  }, [state.ui?.showUI]);

  const uiHidden = !state.ui?.showUI;

  return (
    <div
      className="canvas-wrap"
      aria-label="Fractal viewport"
      style={{
        // When UI is hidden, let the canvas take the whole screen
        position: uiHidden ? 'fixed' : 'relative',
        inset: uiHidden ? 0 : undefined,
        zIndex: uiHidden ? 0 : undefined,
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onClick={onClick}
        style={{
          // Ensure canvas fills the wrapper
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
          overscrollBehavior: 'contain',
        }}
      />
      {/* Show a restore button only when UI is hidden, placed top-right */}
      {uiHidden && (
        <button
          onClick={() => {
            const v = lastViewRef.current;
            setUI({ showUI: true });
            // NEW: restore view after the UI becomes visible
            setTimeout(() => useFractalState.getState().setView({ cx: v.cx, cy: v.cy, scale: v.scale }, false), 0);
          }}
          title="Show UI (press H)"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 1000,
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'rgba(0,0,0,0.5)',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          Show UI (H)
        </button>
      )}
      <div className="overlay">
        {boxStart.current && (
          <BoxOverlay start={boxStart.current} />
        )}
        <div className="badge">
          {state.render.fractal} | iter {state.render.iterations} | p={state.render.power} | {state.render.detail}x
        </div>
      </div>
    </div>
  );
}

function BoxOverlay({ start }: { start: { x: number; y: number } }) {
  const [end, setEnd] = useState<{ x: number; y: number }>({ x: start.x, y: start.y });
  useEffect(() => {
    const onMove = (e: PointerEvent) => setEnd({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [start]);
  const rect = (() => {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(start.x - end.x);
    const h = Math.abs(start.y - end.y);
    return { x, y, w, h };
  })();
  const style: React.CSSProperties = {
    position: 'fixed', left: rect.x, top: rect.y, width: rect.w, height: rect.h,
    border: '1px solid rgba(103,179,255,0.9)', background: 'rgba(103,179,255,0.15)', pointerEvents: 'none'
  };
  return <div style={style} />;
}

// New default export: wrap the inner view in the error boundary
export default function CanvasView() {
	return (
		<CanvasErrorBoundary>
			<CanvasViewInner />
		</CanvasErrorBoundary>
	);
} 
