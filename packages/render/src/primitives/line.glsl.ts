/**
 * Screen-space instanced line shaders (plan E2.5). The join/cap math is mirrored on the CPU in
 * `line-join.ts` (keep the two in sync — the unit tests exercise the CPU copy).
 *
 * `LINE_UNIFORM_COLOR` (a material define, plan E16.9): the line has one color, taken from the
 * `uColor` uniform instead of two per-vertex attributes and two flat varyings, which were a
 * third of the GPU time of a 1M-segment line (docs/perf).
 *
 * Along the segment, its quad ends where the pixels it can draw end (`quadReach` in
 * `line-join.ts`): the fragment shader discards what the neighbour owns at a join, so a quad
 * reaching half the line width and a pixel past every vertex ran it on fragments it then threw
 * away. `computeEnd` returns that reach, and in `former` how far the quad reached before (the
 * join or cap shape and a full ramp). A segment whose ends differ in depth keeps the former
 * quad: the corners carry the depths of A and B, so a shorter quad would tilt its depth, and
 * 2.5D views and 3D scenes test depth. Under the 2D camera every depth is the same.
 *
 * Dashes: one dash and one gap ('dot', 'dash', 'longdash') take the first turn of the pattern
 * loop without the loop, and longer patterns loop over the entries in use. A loop over all 16
 * entries with a `break` made a dashed 1M-segment line cost a quarter more than a solid one
 * (compilers unroll a constant bound and evaluate every turn).
 *
 * The shader text ships in the bundle, comments included: keep those short, and the layout and
 * the reasons here.
 *
 * - **Attributes**: `aPrev`, `aA`, `aB`, `aNext` are the stream vertices (xyz = RTC position, w =
 *   1 valid / 0 sentinel); `aDist` is the dash phase at A (mod period, px) and the screen length
 *   of A→B when the phase was computed. `uJoin`: 0 miter, 1 round, 2 bevel; `uCap`: 0 butt, 1
 *   round, 2 square.
 * - **Varyings** (all flat): `vAB` = a.xy, b.xy in screen px; `vFrame` = dir.xy, len, half width;
 *   `vTangents` = bisector tangent at A (xy) and B (zw), zero for caps; `vEndA` / `vEndB` = outer
 *   normal xy, bevel distance, end mode; `vDash` = phase at A, dash px per screen px, alpha scale
 *   for hairlines.
 *
 * - **Fragment position** comes from `gl_FragCoord` rather than an interpolated varying: both
 *   segments at a join then see bit-identical positions, so the ownership test can never drop a
 *   pixel on both sides (the notches at miter tips seen in spike B).
 * - **Ownership** is an exact partition at joins (a shared edge: no anti-aliasing there). The
 *   boundary is offset by `OWN_EPS` so it never sits exactly on pixel centers: at a symmetric
 *   join the partition is axis-aligned through the vertex, the test is 0 at every pixel of that
 *   column, and the two segments' independently rounded tangents could then both discard it (the
 *   white notches at miter tips in spike B). Rounding error (~1e-6 px) is far below `OWN_EPS`, so
 *   both sides always agree.
 * - **Dash units per screen px** (`vDash.y`) are exact (1.0) right after a phase recompute and
 *   drift slightly while a throttled recompute is pending, which keeps the phase continuous at
 *   the next vertex.
 */
import { SCREEN_GLSL, TRANSFORM_GLSL } from './common.glsl.ts';
import { QUAD_FRINGE, QUAD_SLACK } from './line-join.ts';

/** Maximum dash entries; must match `MAX_DASH_ENTRIES` in `line-dash.ts`. */
const DASH_N = 16;

export const LINE_VERTEX_SHADER = /* glsl */ `
${TRANSFORM_GLSL}
${SCREEN_GLSL}

in vec4 aPrev;
in vec4 aA;
in vec4 aB;
in vec4 aNext;
#ifndef LINE_UNIFORM_COLOR
in vec4 aColorA;
in vec4 aColorB;
#endif
in float aWidth;
in vec2 aDist;

uniform float uJoin;
uniform float uCap;
uniform float uMiterLimit;

flat out vec4 vAB;
flat out vec4 vFrame;
flat out vec4 vTangents;
flat out vec4 vEndA;
flat out vec4 vEndB;
flat out vec3 vDash;
#ifndef LINE_UNIFORM_COLOR
flat out vec4 vColorA;
flat out vec4 vColorB;
#endif

const float END_MITER = 0.0;
const float END_BUTT = 1.0;
const float END_SQUARE = 2.0;
const float END_ROUND = 3.0;
const float END_BEVEL = 4.0;
const float W_EPS = 1e-5;
const float QUAD_FRINGE = ${QUAD_FRINGE.toFixed(4)};
const float QUAD_SLACK = ${QUAD_SLACK.toFixed(4)};

vec2 safeNormalize(vec2 v, vec2 fallback) {
  float l = length(v);
  return l > 1e-6 ? v / l : fallback;
}

// Mirrors computeEnd() and quadReach() in line-join.ts. Returns the quad's reach past the vertex.
float computeEnd(
  vec2 dIn, vec2 dOut, bool isJoin, float hw, float aa,
  out vec2 tangent, out vec4 info, out float former
) {
  float fringe = QUAD_FRINGE * aa;
  former = hw + aa;
  if (!isJoin) {
    tangent = vec2(0.0);
    float mode = uCap < 0.5 ? END_BUTT : (uCap < 1.5 ? END_ROUND : END_SQUARE);
    info = vec4(0.0, 0.0, 0.0, mode);
    return (mode == END_BUTT && (uJoin < 0.5 || uJoin > 1.5) ? 0.0 : hw) + fringe;
  }
  tangent = safeNormalize(dIn + dOut, dOut);
  float c = clamp(dot(dIn, dOut), -1.0, 1.0);
  float cosHalf = sqrt(0.5 * (1.0 + c));
  float mode = uJoin < 0.5 ? END_MITER : (uJoin < 1.5 ? END_ROUND : END_BEVEL);
  if (mode == END_MITER && cosHalf * uMiterLimit < 1.0) mode = END_BEVEL;
  float turn = sign(dIn.x * dOut.y - dIn.y * dOut.x);
  vec2 outer = vec2(turn * tangent.y, -turn * tangent.x);
  info = vec4(outer, hw * cosHalf, mode);
  float tanHalf = sqrt(max(0.0, 1.0 - cosHalf * cosHalf)) / max(cosHalf, 1e-4);
  float ext = mode == END_MITER ? max(hw, hw * tanHalf) : hw;
  former = ext + aa;
  return min(former, (hw + fringe) * tanHalf + QUAD_SLACK * aa);
}

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume: the quad is dropped
}

void main() {
  if (aA.w < 0.5 || aB.w < 0.5 || aWidth <= 0.0) { cull(); return; }

  vec4 cA = hcDataToClip(aA.xyz);
  vec4 cB = hcDataToClip(aB.xyz);
  // Clip the segment against the near plane (perspective cameras) before the w divide.
  if (cA.w < W_EPS && cB.w < W_EPS) { cull(); return; }
  if (cA.w < W_EPS) cA = mix(cA, cB, (W_EPS - cA.w) / (cB.w - cA.w));
  if (cB.w < W_EPS) cB = mix(cB, cA, (W_EPS - cB.w) / (cA.w - cB.w));

  vec2 a = hcClipToScreen(cA);
  vec2 b = hcClipToScreen(cB);
  bool hasPrev = aPrev.w > 0.5;
  bool hasNext = aNext.w > 0.5;
  vec4 cP = hasPrev ? hcDataToClip(aPrev.xyz) : cA;
  vec4 cN = hasNext ? hcDataToClip(aNext.xyz) : cB;
  hasPrev = hasPrev && cP.w >= W_EPS;
  hasNext = hasNext && cN.w >= W_EPS;

  vec2 dir = safeNormalize(b - a, vec2(1.0, 0.0));
  vec2 dIn = hasPrev ? safeNormalize(a - hcClipToScreen(cP), dir) : dir;
  vec2 dOut = hasNext ? safeNormalize(hcClipToScreen(cN) - b, dir) : dir;
  float len = length(b - a);

  // Hairlines: draw at least one device pixel wide and fade by coverage instead.
  float aa = hcAAWidth();
  float hw = 0.5 * aWidth;
  float alphaScale = 1.0;
  if (aWidth < aa) {
    alphaScale = aWidth / aa;
    hw = 0.5 * aa;
  }

  vec2 tA;
  vec2 tB;
  vec4 endA;
  vec4 endB;
  float formerA;
  float formerB;
  float reachA = computeEnd(dIn, dir, hasPrev, hw, aa, tA, endA, formerA);
  float reachB = computeEnd(dir, dOut, hasNext, hw, aa, tB, endB, formerB);
  // A segment that crosses depths keeps the former quad.
  if (cA.z / cA.w != cB.z / cB.w) {
    reachA = formerA;
    reachB = formerB;
  }

  // position.x: 0 = A end, 1 = B end; position.y: -1 / +1 side.
  bool atB = position.x > 0.5;
  float along = atB ? len + reachB : -reachA;
  vec2 normal = vec2(-dir.y, dir.x);
  vec2 screen = a + dir * along + normal * position.y * (hw + QUAD_FRINGE * aa);

  // NDC depth is affine in screen space for a planar quad, so interpolate it linearly.
  float f = len > 0.0 ? clamp(along / len, 0.0, 1.0) : 0.0;
  float z = mix(cA.z / cA.w, cB.z / cB.w, f);
  gl_Position = hcScreenToClip(screen, z);

  vAB = vec4(a, b);
  vFrame = vec4(dir, len, hw);
  vTangents = vec4(tA, tB);
  vEndA = endA;
  vEndB = endB;
  vDash = vec3(aDist.x, len > 1e-6 ? aDist.y / len : 1.0, alphaScale);
#ifndef LINE_UNIFORM_COLOR
  vColorA = aColorA;
  vColorB = aColorB;
#endif
}
`;

export const LINE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
${SCREEN_GLSL}

uniform float uCap;
uniform float uOpacity;
uniform float uDash[${DASH_N}];
uniform float uDashCount;
uniform float uDashPeriod;

flat in vec4 vAB;
flat in vec4 vFrame;
flat in vec4 vTangents;
flat in vec4 vEndA;
flat in vec4 vEndB;
flat in vec3 vDash;
#ifdef LINE_UNIFORM_COLOR
uniform vec4 uColor;
#else
flat in vec4 vColorA;
flat in vec4 vColorB;
#endif

out highp vec4 fragColor;

const float END_BUTT = 1.0;
const float END_SQUARE = 2.0;
const float END_ROUND = 3.0;
const float END_BEVEL = 4.0;
const float OWN_EPS = 1.0 / 512.0; // px; see the ownership partition in main()

float endDistance(vec4 info, vec2 rel, float beyond, float hw) {
  if (info.w == END_BUTT || info.w == END_ROUND) return beyond;
  if (info.w == END_SQUARE) return beyond - hw;
  if (info.w == END_BEVEL) return dot(rel, info.xy) - info.z;
  return -1e20; // miter: bounded by the ownership clip only
}

// The nearest of best and the distances to the "on" interval [a, b] and its two neighbours.
float hcDashInterval(float best, float m, float a, float b) {
  best = min(best, max(a - m, m - b));
  best = min(best, max(a - (m - uDashPeriod), (m - uDashPeriod) - b));
  best = min(best, max(a - (m + uDashPeriod), (m + uDashPeriod) - b));
  return best;
}

// Signed distance to the nearest "on" interval of the repeating dash pattern (mirrors
// dashDistance() in line-dash.ts).
float hcDashDistance(float along) {
  float m = along - floor(along / uDashPeriod) * uDashPeriod;
  if (uDashCount < 2.5) return hcDashInterval(1e20, m, 0.0, 0.0 + uDash[0]);
  float best = 1e20;
  float start = 0.0;
  int count = min(int(uDashCount), ${DASH_N});
  for (int i = 0; i < count; i += 2) {
    float a = start;
    float b = start + uDash[i];
    best = hcDashInterval(best, m, a, b);
    start = b + uDash[i + 1];
  }
  return best;
}

void main() {
  // Screen px, from gl_FragCoord: bit-identical for both segments at a join.
  vec2 vPos = (gl_FragCoord.xy - uViewport.xy) / uViewport.zw * uResolution;
  vec2 a = vAB.xy;
  vec2 b = vAB.zw;
  vec2 dir = vFrame.xy;
  float len = vFrame.z;
  float hw = vFrame.w;
  vec2 rel = vPos - a;
  vec2 relB = vPos - b;

  // Exact ownership partition at joins, offset by OWN_EPS off the pixel centers.
  if (vTangents.xy != vec2(0.0) && dot(rel, vTangents.xy) < OWN_EPS) discard;
  if (vTangents.zw != vec2(0.0) && dot(relB, vTangents.zw) >= OWN_EPS) discard;

  float t = dot(rel, dir);
  float perp = dot(rel, vec2(-dir.y, dir.x));
  float d = abs(perp) - hw;
  d = max(d, endDistance(vEndA, rel, -t, hw));
  d = max(d, endDistance(vEndB, relB, t - len, hw));
  if (vEndA.w == END_ROUND) d = min(d, length(rel) - hw);
  if (vEndB.w == END_ROUND) d = min(d, length(relB) - hw);

  if (uDashCount > 0.5 && uDashPeriod > 0.0) {
    // Joins and caps take the dash state of their vertex (t clamped), so both segments agree.
    float scale = max(vDash.y, 1e-6);
    float along = vDash.x + clamp(t, 0.0, len) * scale;
    float dd = hcDashDistance(along) / scale;
    float dashD = dd;
    if (uCap > 1.5) dashD = dd - hw;
    else if (uCap > 0.5) dashD = length(vec2(max(dd, 0.0), perp)) - hw;
    d = max(d, dashD);
  }

  float coverage = clamp(0.5 - d / hcAAWidth(), 0.0, 1.0) * vDash.z;
#ifdef LINE_UNIFORM_COLOR
  vec4 color = uColor;
#else
  vec4 color = mix(vColorA, vColorB, len > 0.0 ? clamp(t / len, 0.0, 1.0) : 0.0);
#endif
  float alpha = color.a * coverage * uOpacity;
  if (alpha <= 0.0) discard;
  fragColor = vec4(color.rgb, alpha);
}
`;
