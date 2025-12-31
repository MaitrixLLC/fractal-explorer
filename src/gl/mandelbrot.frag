#version 300 es
precision highp float;
// mandelbrot.frag — fragment shader for Mandelbrot/Julia rendering

uniform vec2 u_center;
uniform float u_scale; // complex units across full viewport width
uniform vec2 u_viewSize; // total render size in pixels
uniform vec2 u_tileOffset; // pixel offset for tiled export
uniform int u_maxIter;
uniform float u_power;
uniform float u_bailout;
uniform int u_type; // 0 mandelbrot, 1 julia, 2 burning ship
uniform vec2 u_juliaC;
uniform sampler2D u_palette;
uniform float u_paletteSize; // pixels in palette tex
uniform float u_paletteLength; // cycle length
uniform float u_paletteCycle; // offset
uniform vec4 u_adjust; // brightness, contrast, gamma, saturation
uniform float u_hue; // degrees
uniform float u_edgeGlow; // 0..1
uniform int u_interiorSolid; // 1 solid, 0 gradient
uniform int u_scaleMode; // 0 lin,1 log,2 sqrt
out vec4 fragColor;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 adjust_color(vec3 color) {
  float brightness = u_adjust.x;
  float contrast = u_adjust.y;
  float gamma = max(0.1, u_adjust.z);
  float saturation = u_adjust.w;
  // brightness/contrast
  color = color + brightness;
  color = (color - 0.5) * (contrast + 1.0) + 0.5;
  // gamma
  color = pow(max(color, 0.0), vec3(1.0 / gamma));
  // saturation/hue
  float maxc = max(max(color.r, color.g), color.b);
  float minc = min(min(color.r, color.g), color.b);
  float l = (maxc + minc) * 0.5;
  float s = (maxc - minc) / (1.0 - abs(2.0 * l - 1.0) + 1e-6);
  float h = 0.0;
  if (maxc != minc) {
    if (maxc == color.r) h = (color.g - color.b) / (maxc - minc);
    else if (maxc == color.g) h = 2.0 + (color.b - color.r) / (maxc - minc);
    else h = 4.0 + (color.r - color.g) / (maxc - minc);
    h = fract(h / 6.0);
  }
  h = fract(h + u_hue / 360.0);
  vec3 rgb = hsv2rgb(vec3(h, clamp(s * saturation, 0.0, 1.0), l));
  return clamp(rgb, 0.0, 1.0);
}

vec2 pixelToComplex(vec2 fragPx) {
  vec2 px = fragPx + u_tileOffset;
  float aspect = u_viewSize.x / max(1.0, u_viewSize.y);
  float width = u_scale;
  float height = width / aspect;
  float x = (px.x / u_viewSize.x - 0.5) * width + u_center.x;
  float y = (px.y / u_viewSize.y - 0.5) * height + u_center.y;
  return vec2(x, y);
}

void main() {
  vec2 fragPx = vec2(gl_FragCoord.x, gl_FragCoord.y);
  vec2 c0 = pixelToComplex(fragPx);

  vec2 c = (u_type == 1) ? u_juliaC : c0;
  vec2 z = (u_type == 1) ? c0 : vec2(0.0);
  float power = max(2.0, u_power);
  float bailout = max(2.0, u_bailout);

  int maxIter = u_maxIter;
  float nu = 0.0;
  int i = 0;

  for (i = 0; i < 100000; i++) {
    if (i >= maxIter) break;
    // Burning ship: absolute value
    if (u_type == 2) { z = vec2(abs(z.x), abs(z.y)); }
    // z = z^power + c in complex
    // For general power, use polar form
    float r = length(z);
    float theta = atan(z.y, z.x);
    float rP = pow(r, power);
    float tP = theta * power;
    z = vec2(rP * cos(tP), rP * sin(tP)) + c;
    if (dot(z, z) > bailout * bailout) break;
  }

  float t;
  if (i >= maxIter) {
    if (u_interiorSolid == 1) {
      fragColor = vec4(0.02, 0.01, 0.05, 1.0);
      return;
    } else {
      t = float(i);
    }
  } else {
    float r = length(z);
    // smooth iteration count: n + 1 - log(log|z|)/log(power)
    nu = log(log(max(r, 1e-6))) / log(power);
    t = float(i) + 1.0 - nu;
  }

  // Map t -> palette range
  float tt = t;
  if (u_scaleMode == 1) tt = log(1.0 + tt); // log
  else if (u_scaleMode == 2) tt = sqrt(max(tt, 0.0));
  float idx = (tt / max(1.0, float(u_maxIter))) * u_paletteLength + u_paletteCycle;
  idx = fract(idx);
  // sample 1D palette (assume nx1 texture)
  vec2 uv = vec2(idx, 0.5);
  vec3 color = texture(u_palette, uv).rgb;

  // Edge glow: add glow near escape boundary (nu close to 0)
  float glow = exp(-3.0 * abs(nu));
  color = mix(color, vec3(1.0), glow * u_edgeGlow);

  color = adjust_color(color);
  fragColor = vec4(color, 1.0);
}
