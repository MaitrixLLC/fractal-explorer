// src/App.tsx — application root; composes CanvasView and Sidebar
import React, { useRef } from 'react';
import CanvasView from './components/CanvasView';
import Sidebar from './components/Sidebar';
import { GLRenderer } from './gl/renderer';
import { useFractalState } from './state/useFractalState';

export default function App() {
  const renderer = useRef<GLRenderer | null>(null);
  const showUI = useFractalState(s => s.ui.showUI);

  // renderer is created in CanvasView; pass ref holder to Sidebar for export
  // We keep a global handle by tapping into the canvas renderer after mount
  // but for simplicity, Sidebar will receive null renderer until first render.

  return (
    <div className="app">
      <CanvasView />
      {showUI ? <Sidebar renderer={renderer} /> : null}
    </div>
  );
}
