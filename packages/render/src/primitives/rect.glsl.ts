/**
 * Instanced rectangle shaders (plan E2.7). The vertex placement, pixel snapping and SDF shading are
 * mirrored on the CPU in `rect.ts` (`rectScreenGeometry`, `rectCoverage`, `roundedRectSDF`) — keep
 * the two in sync; the unit tests exercise the CPU copy.
 *
 * Approach: the four data-space corners are projected individually, so the quad is exact for any
 * camera. The fragment shader evaluates a rounded-rect SDF in the rect's own (u, v) frame scaled to
 * CSS px. In 2D (and any affine / orthographic view) the projected rect is a parallelogram and the
 * px metric is exact; under perspective the per-vertex px metric is interpolated, which is a close
 * approximation for rects that are not extremely foreshortened.
 */
import { SCREEN_GLSL, TRANSFORM_GLSL } from './common.glsl.ts';

export const RECT_VERTEX_SHADER = /* glsl */ `
${TRANSFORM_GLSL}
${SCREEN_GLSL}

uniform float uSnap;         // 1 = snap edges to device pixels
uniform float uBorderAlign;  // 0 = border inside the rect, 0.5 = centered on the edge

in vec4 iRect;               // x0, y0, x1, y1 (RTC data space)
in float iZ;                 // plane z (RTC data space)
in vec4 iFill;
in vec4 iBorderColor;
in vec2 iStyle;              // border width px, corner radius px

out vec2 vUv;                // (0,0) at (x0,y0), (1,1) at (x1,y1); extends past [0,1] by the AA pad
out vec2 vPxPerUv;           // CSS px per uv unit, measured perpendicular to each pair of edges
flat out vec4 vFill;
flat out vec4 vBorderColor;
flat out vec3 vStyle;        // border width, corner radius, outset (CSS px)

const vec4 CULLED = vec4(2.0, 2.0, 2.0, 1.0);

// Mirrors snapRectSpan() in rect.ts: snap both edges; never collapse a non-empty span.
vec2 snapSpan(float a, float b, float phase) {
  float sa = hcSnap(a, phase);
  float sb = hcSnap(b, phase);
  if (sa == sb && a != b) sb = sa + sign(b - a) / uPixelRatio;
  return vec2(sa, sb);
}

void main() {
  vec4 c00 = hcDataToClip(vec3(iRect.x, iRect.y, iZ));
  vec4 c10 = hcDataToClip(vec3(iRect.z, iRect.y, iZ));
  vec4 c01 = hcDataToClip(vec3(iRect.x, iRect.w, iZ));
  vec4 c11 = hcDataToClip(vec3(iRect.z, iRect.w, iZ));
  if (min(min(c00.w, c10.w), min(c01.w, c11.w)) <= 0.0) {
    gl_Position = CULLED; // (partly) behind the camera
    return;
  }
  vec2 s00 = hcClipToScreen(c00);
  vec2 s10 = hcClipToScreen(c10);
  vec2 s01 = hcClipToScreen(c01);
  vec2 s11 = hcClipToScreen(c11);

  float bw = max(iStyle.x, 0.0);
  if (uSnap > 0.5 && bw > 0.0) bw = max(1.0, floor(bw * uPixelRatio + 0.5)) / uPixelRatio;
  float outset = bw * uBorderAlign;
  if (uSnap > 0.5) {
    // Snap the geometric edges so the *outer* edge (edge ± outset) lands on a pixel boundary.
    // Assumes an axis-aligned projection (2D); in 3D the shift is < 1 device px and harmless.
    float phase = fract(outset * uPixelRatio);
    vec2 sx = snapSpan(s00.x, s11.x, phase);
    vec2 sy = snapSpan(s00.y, s11.y, phase);
    vec2 d0 = vec2(sx.x - s00.x, sy.x - s00.y);
    vec2 d1 = vec2(sx.y - s11.x, sy.y - s11.y);
    s00 += d0;
    s10 += vec2(d1.x, d0.y);
    s01 += vec2(d0.x, d1.y);
    s11 += d1;
  }

  vec2 c = position.xy;
  bool right = c.x > 0.5;
  bool top = c.y > 0.5;
  vec2 s = top ? (right ? s11 : s01) : (right ? s10 : s00);
  vec4 clip = top ? (right ? c11 : c01) : (right ? c10 : c00);
  vec2 eU = top ? s11 - s01 : s10 - s00;
  vec2 eV = right ? s11 - s10 : s01 - s00;
  float lu = length(eU);
  float lv = length(eV);
  if (!(lu > 1e-4 && lv > 1e-4)) {
    gl_Position = CULLED; // empty rect (also catches NaN)
    return;
  }
  // Perpendicular distance between opposite edges: exact for parallelograms (affine views).
  float area = abs(eU.x * eV.y - eU.y * eV.x);
  vPxPerUv = vec2(area / lv, area / lu);

  // Grow the quad so the AA ramp (and a centered border) is never clipped.
  float pad = outset + 2.0 * hcAAWidth();
  vec2 sgn = c * 2.0 - 1.0;
  vec2 screen = s + sgn.x * pad * eU / lu + sgn.y * pad * eV / lv;
  vUv = c + sgn * pad / vec2(lu, lv);

  vFill = iFill;
  vBorderColor = iBorderColor;
  vStyle = vec3(bw, max(iStyle.y, 0.0), outset);
  gl_Position = vec4((screen / uResolution * 2.0 - 1.0) * clip.w, clip.z, clip.w);
}
`;

export const RECT_FRAGMENT_SHADER = /* glsl */ `
${SCREEN_GLSL}

uniform float uOpacity;

in vec2 vUv;
in vec2 vPxPerUv;
flat in vec4 vFill;
flat in vec4 vBorderColor;
flat in vec3 vStyle;

out highp vec4 fragColor;

// Mirrors roundedRectSDF() in rect.ts. Exact Euclidean distance, negative inside.
float roundedRectSDF(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
  vec2 halfSize = 0.5 * vPxPerUv;
  vec2 p = (vUv - 0.5) * vPxPerUv;
  float bw = vStyle.x;
  float o = vStyle.z;
  float r = clamp(vStyle.y, 0.0, min(halfSize.x, halfSize.y));
  float d = roundedRectSDF(p, halfSize + o, r > 0.0 ? r + o : 0.0);

  // One-device-pixel ramp centred on the edge: snapped edges give exact 0/1 pixel coverage.
  float aa = hcAAWidth();
  float outer = clamp(0.5 - d / aa, 0.0, 1.0);
  float inner = bw > 0.0 ? clamp(0.5 - (d + bw) / aa, 0.0, 1.0) : 1.0;

  // Composite fill over border in premultiplied space, output straight alpha.
  float a = mix(vBorderColor.a, vFill.a, inner);
  vec3 pm = mix(vBorderColor.rgb * vBorderColor.a, vFill.rgb * vFill.a, inner);
  float alpha = a * outer * uOpacity;
  if (alpha <= 0.0) discard;
  fragColor = vec4(pm / max(a, 1e-6), alpha);
}
`;
