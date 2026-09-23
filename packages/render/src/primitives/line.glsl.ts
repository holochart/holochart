/**
 * Screen-space instanced line shaders (plan E2.5). The join/cap math is mirrored on the CPU in
 * `line-join.ts` (keep the two in sync — the unit tests exercise the CPU copy).
 */
import { SCREEN_GLSL, TRANSFORM_GLSL } from './common.glsl.ts';

/** Maximum dash entries; must match `MAX_DASH_ENTRIES` in `line-dash.ts`. */
const DASH_N = 16;

export const LINE_VERTEX_SHADER = /* glsl */ `
${TRANSFORM_GLSL}
${SCREEN_GLSL}

// Stream vertices (prev, A, B, next): xyz = RTC position, w = 1 valid / 0 sentinel.
in vec4 aPrev;
in vec4 aA;
in vec4 aB;
in vec4 aNext;
in vec4 aColorA;
in vec4 aColorB;
in float aWidth;
// x = dash phase at A (mod period, px), y = screen length of A→B when the phase was computed.
in vec2 aDist;

uniform float uJoin;       // 0 miter, 1 round, 2 bevel
uniform float uCap;        // 0 butt, 1 round, 2 square
uniform float uMiterLimit;

flat out vec4 vAB;         // a.xy, b.xy in screen px
flat out vec4 vFrame;      // dir.xy, len, half width
flat out vec4 vTangents;   // bisector tangent at A (xy) and B (zw); zero for caps
flat out vec4 vEndA;       // outer normal xy, bevel distance, end mode
flat out vec4 vEndB;
flat out vec3 vDash;       // phase at A, dash px per screen px, alpha scale for hairlines
flat out vec4 vColorA;
flat out vec4 vColorB;
out vec2 vPos;             // fragment position in screen px

const float END_MITER = 0.0;
const float END_BUTT = 1.0;
const float END_SQUARE = 2.0;
const float END_ROUND = 3.0;
const float END_BEVEL = 4.0;
const float W_EPS = 1e-5;

vec2 safeNormalize(vec2 v, vec2 fallback) {
  float l = length(v);
  return l > 1e-6 ? v / l : fallback;
}

// Mirrors computeEnd() in line-join.ts. Returns the quad extent beyond the vertex.
float computeEnd(vec2 dIn, vec2 dOut, bool isJoin, float hw, out vec2 tangent, out vec4 info) {
  if (!isJoin) {
    tangent = vec2(0.0);
    float mode = uCap < 0.5 ? END_BUTT : (uCap < 1.5 ? END_ROUND : END_SQUARE);
    info = vec4(0.0, 0.0, 0.0, mode);
    return hw;
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
  return mode == END_MITER ? max(hw, hw * tanHalf) : hw;
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
  float extA = computeEnd(dIn, dir, hasPrev, hw, tA, endA);
  float extB = computeEnd(dir, dOut, hasNext, hw, tB, endB);

  // position.x: 0 = A end, 1 = B end; position.y: -1 / +1 side.
  bool atB = position.x > 0.5;
  float along = atB ? len + extB + aa : -(extA + aa);
  vec2 normal = vec2(-dir.y, dir.x);
  vec2 screen = a + dir * along + normal * position.y * (hw + aa);

  // NDC depth is affine in screen space for a planar quad, so interpolate it linearly.
  float f = len > 0.0 ? clamp(along / len, 0.0, 1.0) : 0.0;
  float z = mix(cA.z / cA.w, cB.z / cB.w, f);
  gl_Position = hcScreenToClip(screen, z);

  vAB = vec4(a, b);
  vFrame = vec4(dir, len, hw);
  vTangents = vec4(tA, tB);
  vEndA = endA;
  vEndB = endB;
  // Dash units per screen px: exact (1.0) right after a phase recompute; drifts slightly while a
  // throttled recompute is pending, which keeps the phase continuous at the next vertex.
  vDash = vec3(aDist.x, len > 1e-6 ? aDist.y / len : 1.0, alphaScale);
  vColorA = aColorA;
  vColorB = aColorB;
  vPos = screen;
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
flat in vec4 vColorA;
flat in vec4 vColorB;
in vec2 vPos;

out highp vec4 fragColor;

const float END_BUTT = 1.0;
const float END_SQUARE = 2.0;
const float END_ROUND = 3.0;
const float END_BEVEL = 4.0;

float endDistance(vec4 info, vec2 rel, float beyond, float hw) {
  if (info.w == END_BUTT || info.w == END_ROUND) return beyond;
  if (info.w == END_SQUARE) return beyond - hw;
  if (info.w == END_BEVEL) return dot(rel, info.xy) - info.z;
  return -1e20; // miter: bounded by the ownership clip only
}

// Signed distance to the nearest "on" interval of the repeating dash pattern (mirrors
// dashDistance() in line-dash.ts).
float hcDashDistance(float along) {
  float m = along - floor(along / uDashPeriod) * uDashPeriod;
  float best = 1e20;
  float start = 0.0;
  for (int i = 0; i < ${DASH_N}; i += 2) {
    if (float(i) >= uDashCount) break;
    float a = start;
    float b = start + uDash[i];
    best = min(best, max(a - m, m - b));
    best = min(best, max(a - (m - uDashPeriod), (m - uDashPeriod) - b));
    best = min(best, max(a - (m + uDashPeriod), (m + uDashPeriod) - b));
    start = b + uDash[i + 1];
  }
  return best;
}

void main() {
  vec2 a = vAB.xy;
  vec2 b = vAB.zw;
  vec2 dir = vFrame.xy;
  float len = vFrame.z;
  float hw = vFrame.w;
  vec2 rel = vPos - a;
  vec2 relB = vPos - b;

  // Exact ownership partition at joins (shared edge: no anti-aliasing here).
  if (vTangents.xy != vec2(0.0) && dot(rel, vTangents.xy) < 0.0) discard;
  if (vTangents.zw != vec2(0.0) && dot(relB, vTangents.zw) >= 0.0) discard;

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
  vec4 color = mix(vColorA, vColorB, len > 0.0 ? clamp(t / len, 0.0, 1.0) : 0.0);
  float alpha = color.a * coverage * uOpacity;
  if (alpha <= 0.0) discard;
  fragColor = vec4(color.rgb, alpha);
}
`;
