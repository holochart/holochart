/**
 * Heatmap shaders (see `heatmap.ts` for the design). The fragment shader's cell lookup, smoothing,
 * NaN handling, gaps and color mapping are mirrored on the CPU in `heatmap.ts`
 * (`heatmapAxisEdge`, `heatmapAxisCell`, `heatmapAxisLerp`, `sampleHeatmap`, `heatmapColorT`) —
 * keep the two in sync; the unit tests exercise the CPU copy.
 *
 * Axis space: the fragment shader computes its RTC data coordinate (`data - firstEdge`) from its
 * pixel center and the transform (`hmLocal`; the vertex shader's varying is a fallback), then
 * multiplies it by the axis direction (sign of `lastEdge - firstEdge`), so
 * every lookup runs on ascending "directed" edges `a_k = dir * (edge_k - firstEdge)` in
 * `[0, extent]`, whatever the input edge order.
 */
import { TRANSFORM_GLSL } from './common.glsl.ts';

/** Binary-search step bound for non-uniform edges: supports up to 2^24 cells per axis. */
export const HEATMAP_MAX_SEARCH_STEPS = 24;

export const HEATMAP_VERTEX_SHADER = /* glsl */ `
${TRANSFORM_GLSL}

uniform vec2 uExtent;  // signed (lastEdge - firstEdge) per axis
out vec2 vLocal;       // RTC data coordinate

void main() {
  vLocal = position.xy * uExtent;
  gl_Position = hcDataToClip(vec3(vLocal, 0.0));
}
`;

export const HEATMAP_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uScale;             // shared with the vertex stage (TRANSFORM_GLSL)
uniform vec3 uOffset;
uniform highp sampler2D uZ;      // RG32F, linear texel index k = j * nx + i: (value - zOrigin, valid)
uniform highp sampler2D uEdges;  // R32F: directed x edges [0, nx], then y edges from uYBase
uniform sampler2D uLut;
uniform float uLutSize;
uniform ivec2 uCount;            // nx, ny
uniform vec2 uExtent;            // signed (lastEdge - firstEdge) per axis
uniform vec2 uUniform;           // 1 = equal-width cells on that axis (no texture search)
uniform int uYBase;              // first y edge texel
uniform int uSmoothing;          // 0 = nearest, 1 = 'fast' (index space), 2 = 'best' (data space)
uniform vec2 uGap;               // xgap, ygap in CSS px (smoothing off only)
uniform vec2 uZRange;            // zmin, zmax relative to zOrigin
uniform float uReverse;
uniform float uOpacity;
uniform vec2 uResolution;        // viewport size, CSS px (= 2D world px)
uniform vec4 uViewport;          // GL viewport, device px

in vec2 vLocal;
out highp vec4 fragColor;

// The fragment's RTC data coordinate from its pixel center (2D pixel camera, ADR-008), rather than
// the interpolated varying: the two triangles of the quad interpolate slightly differently, which
// made cell edges and gaps that fall on a pixel boundary jitter along the quad's diagonal.
vec2 hmLocal() {
  vec2 world = (gl_FragCoord.xy - uViewport.xy) * uResolution / uViewport.zw;
  vec2 local = (world - uOffset.xy) / uScale.xy;
  // Fall back to the varying when the pixel mapping is unusable (e.g. a 3D camera).
  return all(greaterThan(abs(uScale.xy), vec2(0.0))) ? local : vLocal;
}

int hmCount(int axis) {
  return axis == 0 ? uCount.x : uCount.y;
}

float hmLength(int axis) {
  return abs(axis == 0 ? uExtent.x : uExtent.y);
}

// Directed edge k of an axis (0 at the first edge, extent at the last).
float hmEdge(int axis, int k) {
  if ((axis == 0 ? uUniform.x : uUniform.y) > 0.5) {
    return hmLength(axis) * float(k) / float(hmCount(axis));
  }
  int idx = axis == 0 ? k : uYBase + k;
  int w = textureSize(uEdges, 0).x;
  return texelFetch(uEdges, ivec2(idx % w, idx / w), 0).r;
}

// Cell containing directed coordinate a in [0, extent]: half-open [a_i, a_i+1), last edge inclusive.
int hmCell(int axis, float a) {
  int n = hmCount(axis);
  if ((axis == 0 ? uUniform.x : uUniform.y) > 0.5) {
    return clamp(int(floor(a * float(n) / hmLength(axis))), 0, n - 1);
  }
  int lo = 0;
  int hi = n;
  for (int s = 0; s < ${HEATMAP_MAX_SEARCH_STEPS}; s++) {
    if (hi - lo <= 1) break;
    int mid = (lo + hi) / 2;
    if (hmEdge(axis, mid) <= a) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Interpolation neighbors along one axis: value = mix(z[i0], z[i1], f).
void hmLerp(int axis, float a, int cell, out int i0, out int i1, out float f) {
  int n = hmCount(axis);
  float e0 = hmEdge(axis, cell);
  float e1 = hmEdge(axis, cell + 1);
  if (uSmoothing == 1) {
    // Index space: continuous index, cell centers at i + 0.5, clamped like clamp-to-edge.
    float s = clamp(float(cell) + (a - e0) / (e1 - e0) - 0.5, 0.0, float(n - 1));
    i0 = min(int(floor(s)), max(n - 2, 0));
    i1 = min(i0 + 1, n - 1);
    f = i1 == i0 ? 0.0 : s - float(i0);
    return;
  }
  // Data space: between cell centers, clamped outside the outermost centers.
  float c = 0.5 * (e0 + e1);
  if (a < c) {
    if (cell == 0) {
      i0 = 0; i1 = 0; f = 0.0;
      return;
    }
    float cp = 0.5 * (hmEdge(axis, cell - 1) + e0);
    i0 = cell - 1; i1 = cell; f = (a - cp) / (c - cp);
    return;
  }
  if (cell == n - 1) {
    i0 = cell; i1 = cell; f = 0.0;
    return;
  }
  float cn = 0.5 * (e1 + hmEdge(axis, cell + 2));
  i0 = cell; i1 = cell + 1; f = (a - c) / (cn - c);
}

vec2 hmZ(int i, int j) {
  int k = j * uCount.x + i;
  int w = textureSize(uZ, 0).x;
  return texelFetch(uZ, ivec2(k % w, k / w), 0).rg;
}

void main() {
  vec2 a = hmLocal() * sign(uExtent);
  vec2 ext = abs(uExtent);
  if (a.x < 0.0 || a.y < 0.0 || a.x > ext.x || a.y > ext.y) discard;
  int i = hmCell(0, a.x);
  int j = hmCell(1, a.y);
  vec2 cell = hmZ(i, j);
  if (cell.y < 0.5) discard;
  float v = cell.x;
  if (uSmoothing == 0) {
    if (uGap.x > 0.0) {
      float px = min(a.x - hmEdge(0, i), hmEdge(0, i + 1) - a.x) * abs(uScale.x);
      if (px < 0.5 * uGap.x) discard;
    }
    if (uGap.y > 0.0) {
      float py = min(a.y - hmEdge(1, j), hmEdge(1, j + 1) - a.y) * abs(uScale.y);
      if (py < 0.5 * uGap.y) discard;
    }
  } else {
    int x0; int x1; float fx;
    int y0; int y1; float fy;
    hmLerp(0, a.x, i, x0, x1, fx);
    hmLerp(1, a.y, j, y0, y1, fy);
    // Bilinear over the finite corners only, weights renormalized.
    vec2 z00 = hmZ(x0, y0);
    vec2 z10 = hmZ(x1, y0);
    vec2 z01 = hmZ(x0, y1);
    vec2 z11 = hmZ(x1, y1);
    float w00 = (1.0 - fx) * (1.0 - fy) * z00.y;
    float w10 = fx * (1.0 - fy) * z10.y;
    float w01 = (1.0 - fx) * fy * z01.y;
    float w11 = fx * fy * z11.y;
    float ws = w00 + w10 + w01 + w11;
    if (ws > 0.0) v = (w00 * z00.x + w10 * z10.x + w01 * z01.x + w11 * z11.x) / ws;
  }
  float span = uZRange.y - uZRange.x;
  float t = span == 0.0 ? 0.5 : clamp((v - uZRange.x) / span, 0.0, 1.0);
  if (uReverse > 0.5) t = 1.0 - t;
  vec4 c = texture(uLut, vec2((t * (uLutSize - 1.0) + 0.5) / uLutSize, 0.5));
  fragColor = vec4(c.rgb, c.a * uOpacity);
}
`;
