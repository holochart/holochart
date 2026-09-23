/**
 * Instanced SDF marker shaders (GLSL3 via `ShaderMaterial`; three.js provides `position`,
 * `projectionMatrix`, and `modelViewMatrix`). Symbol geometry comes from the shared symbol table
 * texture (see `symbols.ts` for the layout).
 *
 * With `#define PICKING` the same shaders become the GPU-picking variant (E2.13): the SDF shape
 * code is shared, colors are reduced to presence (any visible fill/line counts as opaque), pixels
 * whose centre is outside the drawn shape are discarded, and the fragment writes the encoded pick
 * id `uPickBase + gl_InstanceID`. Without the define nothing below changes for the visible pass.
 *
 * Specialization defines (see `specialize.ts`): `MARKER_SYMBOL` + `SYM_*` bake one symbol's layout
 * (no symbol-table fetches, constant shape branches), `NO_ROTATION` skips the rotation, `NO_STROKE`
 * skips all stroke math. `MARKER_DISCARD` keeps the fully-transparent `discard` (needed only when
 * the material writes depth). All combinations render the same pixels as the generic program.
 */
import { PICK_ENCODE_GLSL } from '../picking/pick.glsl.ts';
import { MARKER_SYMBOLS, SYMBOL_COUNT, SYMBOL_TEXTURE_WIDTH } from './symbols.ts';

/** Largest symbol extent (radius units), for the pick pass' conservative window reject. */
const MAX_SYMBOL_EXTENT = MARKER_SYMBOLS.reduce((m, s) => Math.max(m, s.extent), 1);

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
uniform float uPixelRatio;
#ifndef MARKER_SYMBOL
uniform sampler2D uSymbols;
#endif

out vec2 vLocal;
#ifndef MARKER_SYMBOL
flat out ivec4 vPoly;   // polyStart, polyCount, segStart, segCount
flat out ivec4 vMode;   // areaKind, variant, noDot, noFill
#endif
flat out vec4 vShape;   // radius px, half stroke px, dot radius px, unused
flat out vec4 vFill;
flat out vec4 vLine;
#ifdef PICKING
#define MAX_SYMBOL_EXTENT ${MAX_SYMBOL_EXTENT.toFixed(6)}
uniform uint uPickBase;
flat out uint vPickId;
#endif

void main() {
#ifdef PICKING
  // Pick pass only: the window is a tiny part of the view, so reject instances whose (rotated)
  // quad cannot reach it before any texture fetch. Conservative: stroke >= 1 px, sqrt(2) for
  // rotation. Behind-camera instances (w <= 0) are clipped away in the visible pass too.
  {
    vec4 c0 = projectionMatrix * modelViewMatrix * vec4(aPos * uScale + uOffset, 1.0);
    float reach = 1.4143 * (0.5 * aSize * MAX_SYMBOL_EXTENT + 0.5 * max(aStyle.x, 1.0) + 1.0);
    vec2 margin = reach * 2.0 / uResolution * c0.w;
    if (c0.w <= 0.0 || abs(c0.x) > c0.w + margin.x || abs(c0.y) > c0.w + margin.y) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
  }
#endif
#ifdef MARKER_SYMBOL
  const int variant = SYM_VARIANT;
  const float extent = SYM_EXTENT;
#else
  int code = int(aStyle.y + 0.5);
  int base = code - (code / 100) * 100;
  int variant = code / 100;
  if (base < 0 || base >= SYMBOL_COUNT || variant > 3) { base = 0; variant = 0; }
  vec4 info = texelFetch(uSymbols, ivec2(base, 0), 0);
  vec4 meta = texelFetch(uSymbols, ivec2(base, 1), 0);
  float extent = meta.y;
#endif

  float size = aSize;
  bool hidden = abs(aPos.x) > 1.0e37 || abs(aPos.y) > 1.0e37 || abs(aPos.z) > 1.0e37
    || !(size > 0.0) || !(aStyle.z > 0.0);

#ifdef NO_STROKE
  const float lw = 0.0; // every item: lineWidth 0 and a closed variant
#else
  bool open = variant == 1 || variant == 3;
  float lw = max(aStyle.x, 0.0);
  if (open) lw = max(lw, 1.0);
#endif
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

  // Quad half-extent: just past where coverage reaches zero. One device pixel is aa CSS px; fills
  // fade out 0.5 aa beyond their edge, strokes are drawn at least 0.5 aa wide (strokeCov) and fade
  // over another 0.5 aa. Extent is the Chebyshev radius of the geometry, so the square quad holds
  // everything within that Euclidean distance. 0.01 px guards rasterization at the boundary.
  float aa = 1.0 / uPixelRatio;
  float strokeReach = lw > 0.0 ? max(0.5 * lw, 0.5 * aa) : 0.0;
  float halfExtent = r * extent + strokeReach + 0.5 * aa + 0.01;

  if (hidden) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec3 world = aPos * uScale + uOffset;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(world, 1.0);

  vec2 local = position.xy * halfExtent;
#ifdef NO_ROTATION
  vec2 offsetPx = local;
#else
  float a = radians(aStyle.w);
  float c = cos(a);
  float s = sin(a);
  // Clockwise on screen (y up), matching Plotly's marker.angle.
  vec2 offsetPx = vec2(c * local.x + s * local.y, -s * local.x + c * local.y);
#endif
  clip.xy += offsetPx * 2.0 / uResolution * clip.w;
  gl_Position = clip;

  vLocal = local;
#ifndef MARKER_SYMBOL
  vPoly = ivec4(info);
  vMode = ivec4(int(meta.x + 0.5), variant, int(meta.z + 0.5), int(meta.w + 0.5));
#endif
  vShape = vec4(r, 0.5 * lw, max(1.0, 0.1 * size), 0.0);
  vFill = fill;
  vLine = aLine;
  float opacity = clamp(aStyle.z, 0.0, 1.0);
  vFill.a *= opacity;
  vLine.a *= opacity;
#ifdef PICKING
  // Silhouette, not appearance: a translucent marker is as pickable as an opaque one.
  vFill.a = vFill.a > 0.0 ? 1.0 : 0.0;
  vLine.a = vLine.a > 0.0 ? 1.0 : 0.0;
  vPickId = uPickBase + uint(gl_InstanceID);
#endif
}
`;

export const MARKER_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

#define TEX_WIDTH ${SYMBOL_TEXTURE_WIDTH}

uniform sampler2D uSymbols;
uniform float uPixelRatio;

in vec2 vLocal;
#ifndef MARKER_SYMBOL
flat in ivec4 vPoly;
flat in ivec4 vMode;
#endif
flat in vec4 vShape;
flat in vec4 vFill;
flat in vec4 vLine;
#ifdef PICKING
flat in uint vPickId;
${PICK_ENCODE_GLSL}
#endif

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
#ifdef MARKER_SYMBOL
  const int areaKind = SYM_AREA;
  const int variant = SYM_VARIANT;
  const int noDot = SYM_NO_DOT;
  const int noFill = SYM_NO_FILL;
  const ivec4 poly = ivec4(SYM_POLY_START, SYM_POLY_COUNT, SYM_SEG_START, SYM_SEG_COUNT);
#else
  int areaKind = vMode.x;
  int variant = vMode.y;
  int noDot = vMode.z;
  int noFill = vMode.w;
  ivec4 poly = vPoly;
#endif
  float r = vShape.x;
#ifdef NO_STROKE
  const float hw = 0.0;
#else
  float hw = vShape.y;
#endif
  // One device pixel in CSS px. The quad is screen-aligned and screen-sized (also in 3D), so this
  // equals the derivative-based width exactly and needs no dFdx/dFdy.
  float aa = 1.0 / uPixelRatio;

  vec2 p = vLocal / r;
  float dArea = 1.0e20;
  if (areaKind == 1) dArea = (length(p) - 1.0) * r;
  else if (areaKind == 2) dArea = sdPolygon(p, poly.x, poly.y) * r;
#ifdef NO_STROKE
  const float dLines = 1.0e20; // only ever used as a stroke distance
#else
  float dLines = poly.w > 0 ? sdSegments(p, poly.z, poly.w) * r : 1.0e20;
#endif
  bool hasArea = areaKind != 0;
  bool open = variant == 1 || variant == 3;
  bool dot = variant >= 2 && noDot == 0;

  vec4 fillP = vec4(vFill.rgb * vFill.a, vFill.a);
  vec4 lineP = vec4(vLine.rgb * vLine.a, vLine.a);
  vec4 color = vec4(0.0);

  if (open) {
    float m = strokeCov(dLines, hw, aa);
    if (hasArea) m = max(m, strokeCov(abs(dArea), hw, aa));
    color = fillP * m;
  } else {
    float m = strokeCov(dLines, hw, aa);
    if (hasArea && noFill == 0) {
      color = fillP * cov(dArea + hw, aa);
      m = max(m, strokeCov(abs(dArea), hw, aa));
    }
    color = over(lineP * m, color);
  }

  if (dot) {
    float dm = cov(length(vLocal) - vShape.z, aa);
    color = over((variant == 2 ? lineP : fillP) * dm, color);
  }

#ifdef PICKING
  // Coverage >= 0.5 <=> the pixel centre is inside the drawn shape.
  if (color.a < 0.5) discard;
  fragColor = holochartEncodePickId(vPickId);
#else
  if (color.a < 0.002) {
#ifdef MARKER_DISCARD
    discard;
#else
    // Transparent black blends to exactly the destination (color and alpha), like a discard, but
    // keeps the fragment shader discard-free, which tile-based GPUs render faster.
    fragColor = vec4(0.0);
    return;
#endif
  }
  fragColor = vec4(color.rgb / color.a, color.a);
#endif
}
`;
