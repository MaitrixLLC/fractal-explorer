// src/gl/renderer.ts — WebGL2 renderer for fractal rendering and exports
import fragSource from './mandelbrot.frag?raw';
import { buildPaletteTexture } from '@/utils/palette';
import type { AppState } from '@/state/types';

// Keep these helpers if not already present
function isWebGL2(gl: WebGLRenderingContext | WebGL2RenderingContext): gl is WebGL2RenderingContext {
  return typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
}

function normalizeShaderSource(src: string, gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  // Move any #version line to the very top for WebGL2; strip it for WebGL1
  let s = src.replace(/^\uFEFF/, '');
  const lines = s.split('\n');
  let versionLine = '';
  const rest: string[] = [];
  for (const line of lines) {
    if (!versionLine && /^\s*#\s*version\b/.test(line)) versionLine = line.trim();
    else rest.push(line);
  }
  if (isWebGL2(gl)) {
    if (!/^\s*#\s*version\s+300\s+es\b/.test(versionLine)) versionLine = '#version 300 es';
    return `${versionLine}\n${rest.join('\n')}`;
  } else {
    return rest.join('\n');
  }
}

function createGL(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl2 = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null;
  if (!gl2) throw new Error('WebGL2 is required for these shaders (#version 300 es).');
  return gl2;
}

function createShader(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  const processed = normalizeShaderSource(source, gl);
  gl.shaderSource(shader, processed);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'unknown';
    console.error('[renderer] Shader compilation failed:\n', log, '\n--- Processed source ---\n', processed);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext | WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const program = gl.createProgram()!;
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || 'unknown';
    console.error('[renderer] Program link failed:\n', log);
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error(`Program link error: ${log}`);
  }
  gl.detachShader(program, vs);
  gl.detachShader(program, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

export type GLRendererOpts = {
  canvas: HTMLCanvasElement;
  onError?: (e: any) => void;
};

export class GLRenderer {
  private gl!: WebGL2RenderingContext;
  private program!: WebGLProgram;

  // Public accessor to the underlying canvas
  public get canvas(): HTMLCanvasElement { return this.gl.canvas as HTMLCanvasElement; }

  // Ensure this exists so reads like this.uniforms.u_palette never crash
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private paletteTex?: WebGLTexture;

  // NEW: fields referenced elsewhere
  private vao!: WebGLVertexArrayObject;
  private previewScale = 1.0;
  private paused = false;
  private paletteSize = 256;

  // NEW: cached uniform locations used by render/exportTiled
  private u: Record<string, WebGLUniformLocation | undefined> = {};

  constructor(opts: GLRendererOpts) {
    // 1) Create context
    this.gl = createGL(opts.canvas);
    console.info('[renderer] Using WebGL2');

    // 2) Prepare shader sources
    // const vsSource = this.vertexSrc;
    // const fsSource = this.fragmentSrc;
    // ...existing code to obtain your vertex/fragment shader strings...

    // 3) Create & link the program
    const program = createProgram(this.gl, /* vsSource */ `#version 300 es
  precision highp float;
  layout(location=0) in vec2 a_pos;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }`, /* fsSource */ fragSource);
    if (!this.gl.isProgram(program)) throw new Error('Invalid WebGLProgram after linking.');
    this.program = program;

    // Ensure the program is current BEFORE touching uniforms
    this.gl.useProgram(this.program);

    // Initialize the uniforms map
    this.uniforms = {};

    // NEW: cache frequently used uniform locations once
    this.cacheUniforms();

    // Safe: cache and bind palette uniform if the shader declares it
    const uPal = this.getUniformIfExists('u_palette') || this.getUniformIfExists('uPalette');
    this.uniforms['u_palette'] = uPal; // may be null if not present
    if (uPal) {
      if (!this.paletteTex) this.paletteTex = this.createDefaultPaletteTexture();
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
      gl.uniform1i(uPal, 0);
    } else {
      console.warn('[renderer] u_palette/uPalette uniform not found; skipping palette binding');
    }

    // Optional: set common defaults if those uniforms exist
    this.initDefaults();

    const vao = this.gl.createVertexArray()!;
    this.gl.bindVertexArray(vao);
    const quad = new Float32Array([
      -1, -1,  1, -1, -1, 1,
      -1,  1,  1, -1,  1, 1
    ]);
    const vbo = this.gl.createBuffer()!;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, quad, this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);
    this.vao = vao;

    // Remove the unconditional palette uniform set; guard it instead
    // this.gl.useProgram(this.program);
    // this.gl.uniform1i(this.uniforms['u_palette'], 0);
    if (this.uniforms['u_palette']) {
      this.gl.useProgram(this.program);
      this.gl.uniform1i(this.uniforms['u_palette']!, 0);
    }
  }

  // NEW: cache uniforms used by render/exportTiled (only if present in shader)
  private cacheUniforms() {
    const names = [
      'u_center','u_scale','u_viewSize','u_tileOffset',
      'u_maxIter','u_power','u_bailout','u_type','u_juliaC',
      'u_paletteSize','u_paletteLength','u_paletteCycle',
      'u_adjust','u_hue','u_edgeGlow','u_interiorSolid','u_scaleMode',
      // some shaders use uResolution instead of u_viewSize
      'uResolution'
    ];
    for (const n of names) {
      const loc = this.getUniformIfExists(n);
      if (loc) this.u[n] = loc;
    }
  }

  // Defensive uniform lookup with alias support
  private getUniformIfExists(name: string): WebGLUniformLocation | null {
    const gl = this.gl;
    const program = this.program;
    if (!program || !gl.isProgram(program)) return null;

    let loc = gl.getUniformLocation(program, name);
    if (loc) return loc;

    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const toSnake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    const alt = name.includes('_') ? toCamel(name) : toSnake(name);

    loc = gl.getUniformLocation(program, alt);
    return loc;
  }

  // Optional defaults applied only if the uniforms exist
  private initDefaults() {
    const gl = this.gl;
    gl.useProgram(this.program);

    // If the shader uses u_viewSize, set that; else try uResolution
    if (this.u['u_viewSize']) {
      gl.uniform2f(this.u['u_viewSize']!, gl.drawingBufferWidth, gl.drawingBufferHeight);
    } else if (this.u['uResolution']) {
      gl.uniform2f(this.u['uResolution']!, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }

    if (this.u['u_center']) gl.uniform2f(this.u['u_center']!, -0.5, 0.0);
    if (this.u['u_scale']) gl.uniform1f(this.u['u_scale']!, 3.0);
    if (this.u['u_maxIter']) gl.uniform1i(this.u['u_maxIter']!, 250);
  }

  // Small default gradient palette (256x1)
  private createDefaultPaletteTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);

    const size = 256;
    const data = new Uint8Array(size * 4);
    for (let i = 0; i < size; i++) {
      const t = i / (size - 1);
      const r = Math.min(255, Math.floor(255 * Math.max(0, t - 0.5) * 2));
      const g = Math.min(255, Math.floor(255 * t));
      const b = 255;
      const idx = i * 4;
      data[idx + 0] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  setSize(width: number, height: number) {
    const { gl } = this;
    if (gl.canvas.width !== width || gl.canvas.height !== height) {
      gl.canvas.width = width;
      gl.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  setPalette(cfg: AppState['palette']) {
    const { gl } = this;
    const data = buildPaletteTexture(cfg, this.paletteSize);
    if (!this.paletteTex) this.paletteTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.paletteSize, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  render(state: AppState) {
    if (this.paused) return;
    const { gl } = this;

    // FIX: use the correct program reference
    gl.useProgram(this.program);

    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1)) * state.render.detail * this.previewScale;
    const width = Math.floor((gl.canvas as HTMLCanvasElement).clientWidth * dpr);
    const height = Math.floor((gl.canvas as HTMLCanvasElement).clientHeight * dpr);
    this.setSize(width, height);

    if (!this.paletteTex) this.setPalette(state.palette);

    // Helpers to set uniforms only if they exist
    const set1f = (k: string, v: number) => { const loc = this.u[k]; if (loc) gl.uniform1f(loc, v); };
    const set1i = (k: string, v: number) => { const loc = this.u[k]; if (loc) gl.uniform1i(loc, v); };
    const set2f = (k: string, x: number, y: number) => { const loc = this.u[k]; if (loc) gl.uniform2f(loc, x, y); };
    const set4f = (k: string, a: number, b: number, c: number, d: number) => { const loc = this.u[k]; if (loc) gl.uniform4f(loc, a, b, c, d); };

    set2f('u_center', state.view.cx, state.view.cy);
    set1f('u_scale', state.view.scale);
    set2f('u_viewSize', width, height);
    set2f('u_tileOffset', 0, 0);
    set1i('u_maxIter', state.render.iterations);
    set1f('u_power', state.render.power);
    set1f('u_bailout', state.render.bailout);
    set1i('u_type', state.render.fractal === 'julia' ? 1 : (state.render.fractal === 'burning-ship' ? 2 : 0));
    set2f('u_juliaC', state.juliaC.x, state.juliaC.y);
    set1f('u_paletteSize', this.paletteSize);
    set1f('u_paletteLength', Math.max(1.0, state.palette.length));
    set1f('u_paletteCycle', state.palette.cycle);
    set4f('u_adjust', state.adjust.brightness, state.adjust.contrast, state.adjust.gamma, state.adjust.saturation);
    set1f('u_hue', state.adjust.hue);
    set1f('u_edgeGlow', state.adjust.edgeGlow);
    set1i('u_interiorSolid', state.render.interiorSolid ? 1 : 0);
    set1i('u_scaleMode', state.mapping.scaleMode === 'linear' ? 0 : (state.mapping.scaleMode === 'log' ? 1 : 2));

    // Ensure VAO is bound before drawing
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  withPreview(on: boolean) {
    this.previewScale = on ? 0.5 : 1.0;
  }

  pause(p: boolean) {
    this.paused = p;
  }

  async exportTiled(state: AppState, opts: { width: number; height: number; tile?: number; signal?: AbortSignal; onProgress?: (p: number) => void }): Promise<HTMLCanvasElement> {
    const tile = opts.tile ?? 512;
    const off = document.createElement('canvas');
    off.width = opts.width;
    off.height = opts.height;
    const gl = this.gl;
    const prevCanvas = gl.canvas as HTMLCanvasElement;
    // Temporarily render into current GL and copy to offscreen 2D
    const ctx2d = off.getContext('2d')!;
    const tmp = document.createElement('canvas');
    tmp.width = tile;
    tmp.height = tile;
    const tmp2d = tmp.getContext('2d')!;
    const tilesX = Math.ceil(opts.width / tile);
    const tilesY = Math.ceil(opts.height / tile);
    let done = 0;
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        if (opts.signal?.aborted) throw new Error('aborted');
        const w = Math.min(tile, opts.width - tx * tile);
        const h = Math.min(tile, opts.height - ty * tile);
        // Resize GL canvas to tile
        prevCanvas.width = w;
        prevCanvas.height = h;
        gl.viewport(0, 0, w, h);

        // FIX: use the correct program, and bind VAO before drawing
        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // safe setters
        const set1f = (k: string, v: number) => { const loc = this.u[k]; if (loc) gl.uniform1f(loc, v); };
        const set1i = (k: string, v: number) => { const loc = this.u[k]; if (loc) gl.uniform1i(loc, v); };
        const set2f = (k: string, x: number, y: number) => { const loc = this.u[k]; if (loc) gl.uniform2f(loc, x, y); };
        const set4f = (k: string, a: number, b: number, c: number, d: number) => { const loc = this.u[k]; if (loc) gl.uniform4f(loc, a, b, c, d); };

        set2f('u_center', state.view.cx, state.view.cy);
        set1f('u_scale', state.view.scale);
        // viewSize is total output size so the shader can compute tile coords
        set2f('u_viewSize', opts.width, opts.height);
        set2f('u_tileOffset', tx * tile, ty * tile);
        set1i('u_maxIter', state.render.iterations);
        set1f('u_power', state.render.power);
        set1f('u_bailout', state.render.bailout);
        set1i('u_type', state.render.fractal === 'julia' ? 1 : (state.render.fractal === 'burning-ship' ? 2 : 0));
        set2f('u_juliaC', state.juliaC.x, state.juliaC.y);
        set1f('u_paletteSize', this.paletteSize);
        set1f('u_paletteLength', Math.max(1.0, state.palette.length));
        set1f('u_paletteCycle', state.palette.cycle);
        set4f('u_adjust', state.adjust.brightness, state.adjust.contrast, state.adjust.gamma, state.adjust.saturation);
        set1f('u_hue', state.adjust.hue);
        set1f('u_edgeGlow', state.adjust.edgeGlow);
        set1i('u_interiorSolid', state.render.interiorSolid ? 1 : 0);
        set1i('u_scaleMode', state.mapping.scaleMode === 'linear' ? 0 : (state.mapping.scaleMode === 'log' ? 1 : 2));

        // draw
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        // copy to tmp canvas then to offscreen at correct pos
        tmp.width = w; tmp.height = h;
        tmp2d.drawImage(prevCanvas, 0, 0, w, h, 0, 0, w, h);
        ctx2d.drawImage(tmp, 0, 0, w, h, tx * tile, ty * tile, w, h);
        done++;
        opts.onProgress?.(done / (tilesX * tilesY));
        await new Promise(r => setTimeout(r, 0)); // keep UI responsive
      }
    }
    return off;
  }

  // DEBUG: quick visual to confirm we can draw
  public drawDebugClear() {
    const gl = this.gl;
    // Ensure viewport matches drawing buffer
    gl.viewport(0, 0, (gl as any).drawingBufferWidth ?? (gl as any).canvas.width, (gl as any).drawingBufferHeight ?? (gl as any).canvas.height);
    gl.disable((gl as any).SCISSOR_TEST);
    gl.clearColor(1, 0, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}
