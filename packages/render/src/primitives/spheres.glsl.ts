/**
 * Instanced sphere impostor shaders (plan E14.2, `spheres.ts`): one camera-facing quad per sphere,
 * ray-cast per fragment in view space, lit, with exact silhouettes, `gl_FragDepth` from the hit
 * point (so spheres intersect each other, lines and meshes correctly) and an analytic anti-aliased
 * edge.
 *
 * The quad lies in the plane through the center perpendicular to the view ray; its half-size
 * `r·D/√(D² − r²)` is where the tangent cone of the sphere (seen from the eye at distance `D`)
 * crosses that plane, so the quad holds the whole perspective silhouette (an ellipse off-axis),
 * plus two px for the anti-aliasing ramp. Orthographic cameras (`projectionMatrix[3][3] = 1`, also
 * in the GPU pick pass, whose camera is a plain `Camera`) use parallel rays.
 *
 * Lighting is Blinn–Phong with one directional light in view space (a camera-attached key light,
 * so every orbit angle is lit the same) plus ambient, applied to the sRGB colors directly like the
 * other chart primitives (no color management), so an unlit sphere center matches its CSS color.
 *
 * Defines: `USE_COLORSCALE` (colors from values through the LUT), `PICKING` (write the pick id of
 * the instance — or of `aSourceIndex` with `SOURCE_INDEX`, when the instances are depth-sorted).
 */
import { PICK_ENCODE_GLSL } from '../picking/pick.glsl.ts';

export const SPHERE_VERTEX = /* glsl */ `
precision highp float;
precision highp int;

in vec3 aPos;     // RTC-encoded center (HIDDEN sentinel for gaps)
in vec2 aStyle;   // diameter (CSS px, or world units with uWorldSize), opacity
#ifdef USE_COLORSCALE
in float aValue;  // relative to the value origin (HIDDEN sentinel for NaN)
uniform sampler2D uColorscale;
uniform vec2 uCRange;
uniform float uReverse;
uniform vec4 uNanColor;
#else
in vec4 aFill;    // normalized u8
#endif
#ifdef SOURCE_INDEX
in int aSourceIndex;
#endif

uniform vec3 uScale;
uniform vec3 uOffset;
uniform vec2 uResolution;
uniform float uWorldSize;

out vec3 vView;          // view-space point on the quad
flat out vec4 vSphere;   // view-space center, radius
flat out float vPxView;  // view units per CSS px at the center's depth
flat out vec4 vColor;
#ifdef PICKING
uniform uint uPickBase;
flat out uint vPickId;
#endif

void hide() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}

void main() {
  float size = aStyle.x;
  if (abs(aPos.x) > 1.0e37 || abs(aPos.y) > 1.0e37 || abs(aPos.z) > 1.0e37 || !(size > 0.0)
      || !(aStyle.y > 0.0)) {
    hide();
    return;
  }
  vec3 c = (modelViewMatrix * vec4(aPos * uScale + uOffset, 1.0)).xyz;
  bool ortho = projectionMatrix[3][3] > 0.5;
  float w = ortho ? 1.0 : -c.z;
  if (w <= 0.0) { hide(); return; }
  float pxView = 2.0 * w / (uResolution.y * projectionMatrix[1][1]);
  float r = 0.5 * size * (uWorldSize > 0.5 ? length(modelViewMatrix[0].xyz) : pxView);

  vec3 right = vec3(1.0, 0.0, 0.0);
  vec3 up = vec3(0.0, 1.0, 0.0);
  float extent = r;
  if (!ortho) {
    float dist = length(c);
    if (dist <= r * 1.001) { hide(); return; } // the eye is inside the sphere
    vec3 d = c / dist;
    right = normalize(abs(d.y) < 0.99 ? vec3(-d.z, 0.0, d.x) : vec3(0.0, d.z, -d.y));
    up = cross(right, d);
    extent = r * dist / sqrt(dist * dist - r * r);
  }
  extent += 2.0 * pxView;
  vec3 corner = c + (position.x * right + position.y * up) * extent;
  gl_Position = projectionMatrix * vec4(corner, 1.0);

  vView = corner;
  vSphere = vec4(c, r);
  vPxView = pxView;
#ifdef USE_COLORSCALE
  if (abs(aValue) > 1.0e37) {
    vColor = uNanColor;
  } else {
    float t = clamp((aValue - uCRange.x) / (uCRange.y - uCRange.x), 0.0, 1.0);
    if (uReverse > 0.5) t = 1.0 - t;
    vColor = texture(uColorscale, vec2((t * 255.0 + 0.5) / 256.0, 0.5));
  }
#else
  vColor = aFill;
#endif
  vColor.a *= clamp(aStyle.y, 0.0, 1.0);
#ifdef PICKING
#ifdef SOURCE_INDEX
  vPickId = uPickBase + uint(aSourceIndex);
#else
  vPickId = uPickBase + uint(gl_InstanceID);
#endif
#endif
}
`;

export const SPHERE_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;

uniform mat4 projectionMatrix;
uniform float uPixelRatio;
uniform vec3 uLightDir;  // view space, towards the light (normalized)
uniform vec4 uLight;     // ambient, diffuse, specular, shininess

in vec3 vView;
flat in vec4 vSphere;
flat in float vPxView;
flat in vec4 vColor;
#ifdef PICKING
flat in uint vPickId;
${PICK_ENCODE_GLSL}
#endif

out vec4 fragColor;

void main() {
  vec3 c = vSphere.xyz;
  float r = vSphere.w;
  bool ortho = projectionMatrix[3][3] > 0.5;
  // Ray relative to the center (small numbers: no cancellation for tiny, distant spheres).
  vec3 rd = ortho ? vec3(0.0, 0.0, -1.0) : normalize(vView);
  vec3 oc = ortho ? vec3(vView.xy - c.xy, 2.0 * r) : -c;
  vec3 q = oc - dot(oc, rd) * rd; // center → closest point of the ray
  float q2 = dot(q, q);
  float qLen = sqrt(q2);
  // Signed distance of the ray to the silhouette, in CSS px at the center's depth.
  float edge = (qLen - r) / vPxView;
  float coverage = clamp(0.5 - edge * uPixelRatio, 0.0, 1.0);
  if (coverage <= 0.0) discard;
  float h = r * r - q2;
  // Front hit; the anti-aliasing fringe outside takes the silhouette point.
  vec3 n = h > 0.0 ? (q - rd * sqrt(h)) / r : q / max(qLen, 1e-30);
  vec4 clip = projectionMatrix * vec4(c + n * r, 1.0);
  gl_FragDepth = clamp(0.5 * clip.z / clip.w + 0.5, 0.0, 1.0);
#ifdef PICKING
  // Pixel centers inside the silhouette pick, like the SDF markers.
  if (coverage < 0.5) discard;
  fragColor = holochartEncodePickId(vPickId);
#else
  float diffuse = max(dot(n, uLightDir), 0.0);
  float specular = pow(max(dot(n, normalize(uLightDir - rd)), 0.0), uLight.w);
  vec3 rgb = vColor.rgb * (uLight.x + uLight.y * diffuse) + uLight.z * specular;
  float alpha = vColor.a * coverage;
  if (alpha < 0.002) discard;
  fragColor = vec4(min(rgb, vec3(1.0)), alpha);
#endif
}
`;
