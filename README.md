# Fractal Explorer

A small WebGL-based Mandelbrot/Julia explorer built with React + TypeScript and a WebGL2 fragment shader renderer.

✅ Features
- Interactive pan/zoom, box-zoom and keyboard shortcuts
- Multiple palettes with smooth and perceptual interpolation
- Export high-resolution images via tiled rendering
- Configurable render settings (iterations, power, bailout, detail)

## Quick start 🚀
Requirements: Node.js (16+), npm, and a WebGL2-capable browser.

```bash
# from project root
npm install
npm run dev       # start development server (Vite)
npm run build     # build for production
npm run preview   # preview built site
npm test          # run tests (if any)
```

Open http://localhost:5173 in your browser after running `npm run dev`.

## Project structure 🔧
- src/
  - App.tsx — application root
  - main.tsx — mount point
  - components/
    - CanvasView.tsx — canvas, input handling, render loop
    - Sidebar.tsx — UI controls and exports
  - gl/
    - renderer.ts — WebGL renderer, uniform management, tiled export
    - mandelbrot.frag — fragment shader for rendering
  - state/ — Zustand app state and TypeScript types
  - utils/ — palette builder and URL state serialization

## Renderer notes
- The renderer requires WebGL2 and compiles a fullscreen quad vertex shader with `mandelbrot.frag` as the fragment shader.
- Key uniforms set per-frame include `u_center`, `u_scale`, `u_viewSize`, `u_maxIter`, `u_power`, palette uniforms, and color adjustments.
- Export uses `exportTiled` to render large images tile-by-tile and composite into a single canvas.

## Development tips 🛠️
- If TypeScript reports issues, run `npx tsc --noEmit` to inspect diagnostics.
- Shaders live in `src/gl/` and are loaded as raw strings for compilation; modify `mandelbrot.frag` for color/equation changes.

## Contributing
Contributions welcome. Open issues or PRs with improvements or bug fixes. Please add tests and keep changes small and focused.

## License
Add a license file (e.g., `MIT`) if you want to make this project open source.

---