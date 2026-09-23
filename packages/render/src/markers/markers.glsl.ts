/**
 * Instanced SDF marker shaders (GLSL3 via `ShaderMaterial`; three.js provides `position`,
 * `projectionMatrix`, and `modelViewMatrix`). Symbol geometry comes from the shared symbol table
 * texture (see `symbols.ts` for the layout).
 */
import { SYMBOL_COUNT, SYMBOL_TEXTURE_WIDTH } from './symbols.ts';

export const MARKER_VERTEX = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

#define SYMBOL_COUNT ${SYMBOL_COUNT}

in vec3 aPos;      // RTC-encoded position (HIDDEN sentinel for gaps)
in float aSize;    // diameter, CSS px
in vec4 aLine;     // line color (normalized u8)
in vec4 aStyle;    // lineWidth px, symbol code, opacity, angle (deg, clockwise)
#ifdef USE_COLORSCALE
in float aValue;   // value relative to uValueOrigin (HIDDEN sentinel for NaN)
uniform sampler2D uColorscale;
uniform vec2 uCRange;
uniform float uReverse;
uniform vec4 uNanColor;
#else
in vec4 aFill;     // fill color (normalized u8)
#endif

uniform vec3 uScale;
uniform vec3 uOffset;
uniform vec2 uResolution;
uniform sampler2D uSymbols;

out vec2 vLocal;
flat out ivec4 vPoly;   // polyStart, polyCount, segStart, segCount
flat out vec4 vShape;   // radius px, half stroke px, dot radius px, unused
flat out ivec4 vMode;   // areaKind, variant, noDot, noFill
flat out vec4 vFill;
flat out vec4 vLine;

void main() {
  int code = int(aStyle.y + 0.5);
  int base = code - (code / 100) * 100;
  int variant = code / 100;
  if (base < 0 || base >= SYMBOL_COUNT || variant > 3) { base = 0; variant = 0; }
  vec4 info = texelFetch(uSymbols, ivec2(base, 0), 0);
  vec4 meta = texelFetch(uSymbols, ivec2(base, 1), 0);

  float size = aSize;
  bool hidden = abs(aPos.x) > 1.0e37 || abs(aPos.y) > 1.0e37 || abs(aPos.z) > 1.0e37
    || !(size > 0.0) || !(aStyle.z > 0.0);

  bool open = variant == 1 || variant == 3;
  float lw = max(aStyle.x, 0.0);
  if (open) lw = max(lw, 1.0);
  float r = 0.5 * size;

  vec4 fill;
#ifdef USE_COLORSCALE
  if (abs(aValue) > 1.0e37) {
    fill = uNanColor;
  } else {
    float span = uCRange.y - uCRange.x;
    float t = clamp((aValue - uCRange.x) / span, 0.0, 1.0);
    if (uReverse > 0.5) t = 1.0 - t;
    fill = texture(uColorscale, vec2((t * 255.0 + 0.5) / 256.0, 0.5));
  }
#else
  fill = aFill;
#endif

  // Quad half-extent: geometry + half the stroke + 1 px for anti-aliasing.
  float halfExtent = r * meta.y + 0.5 * lw + 1.0;

  if (hidden) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec3 world = aPos * uScale + uOffset;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(world, 1.0);

  vec2 local = position.xy * halfExtent;
  float a = radians(aStyle.w);
  float c = cos(a);
  float s = sin(a);
  // Clockwise on screen (y up), matching Plotly's marker.angle.
  vec2 offsetPx = vec2(c * local.x + s * local.y, -s * local.x + c * local.y);
  clip.xy += offsetPx * 2.0 / uResolution * clip.w;
  gl_Position = clip;

  vLocal = local;
  vPoly = ivec4(info);
  vShape = vec4(r, 0.5 * lw, max(1.0, 0.1 * size), 0.0);
  vMode = ivec4(int(meta.x + 0.5), variant, int(meta.z + 0.5), int(meta.w + 0.5));
  vFill = fill;
  vLine = aLine;
  float opacity = clamp(aStyle.z, 0.0, 1.0);
  vFill.a *= opacity;
  vLine.a *= opacity;
}
`;

export const MARKER_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

#define TEX_WIDTH ${SYMBOL_TEXTURE_WIDTH}

uniform sampler2D uSymbols;

in vec2 vLocal;
flat in ivec4 vPoly;
flat in vec4 vShape;
flat in ivec4 vMode;
flat in vec4 vFill;
flat in vec4 vLine;

out vec4 fragColor;

vec4 symbolData(int i) {
  return texelFetch(uSymbols, ivec2(i % TEX_WIDTH, 2 + i / TEX_WIDTH), 0);
}

// Signed distance to a polygon (even-odd rule), after Inigo Quilez.
float sdPolygon(vec2 p, int start, int n) {
  vec2 vj = symbolData(start + n - 1).xy;
  float d = 1.0e20;
  float s = 1.0;
  for (int i = 0; i < n; i++) {
    vec2 vi = symbolData(start + i).xy;
    vec2 e = vj - vi;
    vec2 w = p - vi;
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 cond = bvec3(p.y >= vi.y, p.y < vj.y, e.x * w.y > e.y * w.x);
    if (all(cond) || all(not(cond))) s = -s;
    vj = vi;
  }
  return s * sqrt(d);
}

float sdSegments(vec2 p, int start, int n) {
  float d = 1.0e20;
  for (int i = 0; i < n; i++) {
    vec4 sg = symbolData(start + i);
    vec2 pa = p - sg.xy;
    vec2 ba = sg.zw - sg.xy;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    d = min(d, length(pa - ba * h));
  }
  return d;
}

// Coverage of the region {d < 0} for a pixel of width aa.
float cov(float d, float aa) {
  return clamp(0.5 - d / aa, 0.0, 1.0);
}

// Coverage of a stroke of half-width hw around the zero set of an unsigned distance.
float strokeCov(float dist, float hw, float aa) {
  if (hw <= 0.0) return 0.0;
  // Thin strokes: draw at least one pixel wide and scale alpha by the true width.
  float drawHw = max(hw, 0.5 * aa);
  return cov(dist - drawHw, aa) * (hw / drawHw);
}

vec4 over(vec4 top, vec4 bottom) {
  return top + bottom * (1.0 - top.a);
}

void main() {
  float r = vShape.x;
  float hw = vShape.y;
  // One device pixel measured in CSS px (rotation invariant), so AA is correct at every DPR.
  float aa = max(length(vec2(dFdx(vLocal.x), dFdy(vLocal.x))), 1.0e-4);

  vec2 p = vLocal / r;
  float dArea = 1.0e20;
  if (vMode.x == 1) dArea = (length(p) - 1.0) * r;
  else if (vMode.x == 2) dArea = sdPolygon(p, vPoly.x, vPoly.y) * r;
  float dLines = vPoly.w > 0 ? sdSegments(p, vPoly.z, vPoly.w) * r : 1.0e20;
  bool hasArea = vMode.x != 0;
  bool open = vMode.y == 1 || vMode.y == 3;
  bool dot = vMode.y >= 2 && vMode.z == 0;

  vec4 fillP = vec4(vFill.rgb * vFill.a, vFill.a);
  vec4 lineP = vec4(vLine.rgb * vLine.a, vLine.a);
  vec4 color = vec4(0.0);

  if (open) {
    float m = strokeCov(dLines, hw, aa);
    if (hasArea) m = max(m, strokeCov(abs(dArea), hw, aa));
    color = fillP * m;
  } else {
    float m = strokeCov(dLines, hw, aa);
    if (hasArea && vMode.w == 0) {
      color = fillP * cov(dArea + hw, aa);
      m = max(m, strokeCov(abs(dArea), hw, aa));
    }
    color = over(lineP * m, color);
  }

  if (dot) {
    float dm = cov(length(vLocal) - vShape.z, aa);
    color = over((vMode.y == 2 ? lineP : fillP) * dm, color);
  }

  if (color.a < 0.002) discard;
  fragColor = vec4(color.rgb / color.a, color.a);
}
`;
