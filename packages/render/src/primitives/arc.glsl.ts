/**
 * Instanced arc / annular-sector shaders (plan E2.8). The SDF is mirrored on the CPU in `arc.ts`
 * (`arcSDF`) and the per-wedge shape parameters (d3-shape pad / corner semantics, bounding box) are
 * computed there too — keep the two in sync; the unit tests exercise the CPU copy.
 *
 * Each wedge is a screen-aligned quad (tight bounding box of the sector, in px) around its
 * projected center, so radii are in CSS px under any camera (in 3D, arcs are billboards).
 */
import { SCREEN_GLSL, TRANSFORM_GLSL } from './common.glsl.ts';

export const ARC_VERTEX_SHADER = /* glsl */ `
${TRANSFORM_GLSL}
${SCREEN_GLSL}

in vec3 iCenter;             // RTC data space
in vec4 iBounds;             // px bbox relative to the center: minX, minY, maxX, maxY
in vec4 iShape;              // r0, r1, mid angle, half angle
in vec3 iCorner;             // pad offset h (< 0: full ring), outer / inner corner radius
in vec4 iFill;
in vec4 iBorderColor;
in float iBorderWidth;

out vec2 vLocal;             // fragment offset from the center, CSS px, y-up
flat out vec4 vShape;
flat out vec3 vCorner;
flat out vec4 vFill;
flat out vec4 vBorderColor;
flat out float vBorderWidth;

void main() {
  vec4 clip = hcDataToClip(iCenter);
  if (!(clip.w > 0.0) || !(iBounds.z > iBounds.x) || !(iBounds.w > iBounds.y)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // behind the camera, empty, or NaN
    return;
  }
  float pad = 2.0 * hcAAWidth();
  vec2 offset = mix(iBounds.xy - pad, iBounds.zw + pad, position.xy);
  vLocal = offset;
  vShape = iShape;
  vCorner = iCorner;
  vFill = iFill;
  vBorderColor = iBorderColor;
  vBorderWidth = max(iBorderWidth, 0.0);
  gl_Position = hcOffsetClip(clip, offset);
}
`;

export const ARC_FRAGMENT_SHADER = /* glsl */ `
${SCREEN_GLSL}

uniform float uOpacity;

in vec2 vLocal;
flat in vec4 vShape;
flat in vec3 vCorner;
flat in vec4 vFill;
flat in vec4 vBorderColor;
flat in float vBorderWidth;

out highp vec4 fragColor;

// Mirrors arcSDF() in arc.ts. Works in the folded wedge frame: bisector on +x, y >= 0, so only
// the end side (ray at angle 'halfAngle') and its two corners need to be considered.
float arcSDF(vec2 local) {
  float r0 = vShape.x;
  float r1 = vShape.y;
  float mid = vShape.z;
  float halfAngle = vShape.w;
  float h = vCorner.x;
  float cm = cos(mid);
  float sm = sin(mid);
  vec2 p = vec2(cm * local.x + sm * local.y, abs(-sm * local.x + cm * local.y));
  float len = length(p);
  // A zero inner radius is no boundary at all (else the pie center would be an AA seam).
  float d = r0 > 0.0 ? max(len - r1, r0 - len) : len - r1;
  if (h < 0.0) return d; // full ring: no sides, no corners

  vec2 dir = vec2(cos(halfAngle), sin(halfAngle));   // end ray
  vec2 n = vec2(dir.y, -dir.x);            // its normal, pointing into the wedge
  float t = dot(p, dir);
  float q = dot(p, n);
  float phi = len > 0.0 ? atan(p.y, p.x) : 0.0;
  // Signed distance to the gap wedge dilated by h (constant-width pad gap).
  float distRay = t > 0.0 ? abs(q) : len;
  float dSide = h - (phi <= halfAngle ? distRay : -distRay);
  d = max(d, dSide);

  // Rounded corners: circle tangent to the side line and the arc (d3.arc cornerRadius).
  float rcO = vCorner.y;
  if (rcO > 0.0) {
    float qk = h + rcO;
    vec2 k = sqrt(max((r1 - rcO) * (r1 - rcO) - qk * qk, 0.0)) * dir + qk * n;
    if (t > dot(k, dir) && phi > atan(k.y, k.x)) d = length(p - k) - rcO;
  }
  float rcI = vCorner.z;
  if (rcI > 0.0) {
    float qk = h + rcI;
    vec2 k = sqrt(max((r0 + rcI) * (r0 + rcI) - qk * qk, 0.0)) * dir + qk * n;
    if (t < dot(k, dir) && phi > atan(k.y, k.x)) d = length(p - k) - rcI;
  }
  return d;
}

void main() {
  float d = arcSDF(vLocal);
  float aa = hcAAWidth();
  float outer = clamp(0.5 - d / aa, 0.0, 1.0);
  float bw = vBorderWidth;
  float inner = bw > 0.0 ? clamp(0.5 - (d + bw) / aa, 0.0, 1.0) : 1.0;
  float a = mix(vBorderColor.a, vFill.a, inner);
  vec3 pm = mix(vBorderColor.rgb * vBorderColor.a, vFill.rgb * vFill.a, inner);
  float alpha = a * outer * uOpacity;
  if (alpha <= 0.0) discard;
  fragColor = vec4(pm / max(a, 1e-6), alpha);
}
`;
