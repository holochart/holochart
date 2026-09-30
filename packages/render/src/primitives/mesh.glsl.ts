/**
 * Shaders of the mesh primitive (plan E2.11): Plotly's lighting model (gl-mesh3d / gl-surface3d:
 * ambient + clamped Lambert diffuse + Cook-Torrance specular with a Beckmann distribution and a
 * fresnel term), in view space, with the colorscale LUT sampled per fragment.
 *
 * Defines (set by `mesh.ts`): `HC_LIGHTS` (number of lights, ≥ 0), `HC_COLOR` (a per-vertex
 * `color` attribute, sRGB RGBA), `HC_INTENSITY` (a per-vertex `intensity` attribute, relative to
 * the intensity origin, looked up in `uLut`), `HC_UNLIT` (the `'flat'` material: colors as given),
 * `HC_CLIP` (discard outside the clip box), `PICKING` (+ `HC_PICK_TRIANGLE`) for the pick pass.
 *
 * Uniforms: `uCRange` = (cmin, cmax) relative to the intensity origin and reversescale; `uK` =
 * (diffuse, specular, roughness, fresnel); `uLightPos[i]` = view-space position (w = 1) or
 * direction (w = 0). `hcBeckmann` / `hcCookTorrance` port glsl-specular-beckmann /
 * glsl-specular-cook-torrance (gl-mesh3d, gl-surface3d). Zero normals (degenerate faces, Plotly's
 * epsilons) stay zero: ambient light only. Lighting is two-sided: the normal is turned toward the
 * camera (gl-mesh3d flips it by `gl_FrontFacing`).
 *
 * Hooks (`MeshShaderHooks`) are spliced in at the `// @mesh-…` lines: declarations, the end of the
 * vertex shader, the fragment color before lighting (`color`, e.g. surface contours or a wireframe
 * overlay) and after it.
 */
import { PICK_ENCODE_GLSL } from '../picking/pick.glsl.ts';

export const MESH_VERTEX_SHADER = /* glsl */ `
precision highp float;
precision highp int;

#ifdef HC_COLOR
in vec4 color;
out vec4 vColor;
#endif
#ifdef HC_INTENSITY
in float intensity;
out float vValue;
#endif
out vec3 vLocal;
out vec3 vViewPos;
out vec3 vNormal;
#ifdef PICKING
uniform uint uPickBase;
flat out uint vPickId;
#endif
// @mesh-vertex-decl

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vLocal = position;
  vViewPos = mv.xyz;
  vNormal = normalMatrix * normal;
#ifdef HC_COLOR
  vColor = color;
#endif
#ifdef HC_INTENSITY
  vValue = intensity;
#endif
  gl_Position = projectionMatrix * mv;
#ifdef PICKING
#ifdef HC_PICK_TRIANGLE
  vPickId = uPickBase + uint(gl_VertexID) / 3u;
#else
  vPickId = uPickBase + uint(gl_VertexID);
#endif
#endif
  // @mesh-vertex
}
`;

export const MESH_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
precision highp int;

uniform vec4 uColor;
uniform float uOpacity;
uniform vec3 uClipMin;
uniform vec3 uClipMax;
uniform sampler2D uLut;
uniform vec3 uCRange;
uniform vec4 uK;
uniform vec3 uAmbient;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform vec3 uHemiUp;
#if HC_LIGHTS > 0
uniform vec4 uLightPos[HC_LIGHTS];
uniform vec3 uLightColor[HC_LIGHTS];
#endif

#ifdef HC_COLOR
in vec4 vColor;
#endif
#ifdef HC_INTENSITY
in float vValue;
#endif
in vec3 vLocal;
in vec3 vViewPos;
in vec3 vNormal;
#ifdef PICKING
${PICK_ENCODE_GLSL}
flat in uint vPickId;
#endif
out highp vec4 fragColor;
// @mesh-fragment-decl

float hcBeckmann(float x, float r) {
  float c2 = max(x, 0.0001);
  c2 *= c2;
  float r2 = r * r;
  return exp((c2 - 1.0) / (c2 * r2)) / (3.141592653589793 * r2 * c2 * c2);
}

float hcCookTorrance(vec3 L, vec3 V, vec3 N, float r, float f) {
  float VdotN = max(dot(V, N), 0.0);
  float LdotN = max(dot(L, N), 0.0);
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.000001);
  float LdotH = max(dot(L, H), 0.000001);
  float G = min(1.0, min(2.0 * NdotH * VdotN / VdotH, 2.0 * NdotH * LdotN / LdotH));
  return G * pow(1.0 - VdotN, f) * hcBeckmann(NdotH, r) / max(3.14159265 * VdotN, 0.000001);
}

void main() {
#ifdef HC_CLIP
  if (any(lessThan(vLocal, uClipMin)) || any(greaterThan(vLocal, uClipMax))) discard;
#endif
#ifdef PICKING
  fragColor = holochartEncodePickId(vPickId);
#else
#ifdef HC_COLOR
  vec4 color = vColor;
#else
  vec4 color = uColor;
#endif
#ifdef HC_INTENSITY
  if (abs(vValue) > 1.0e37) discard;
  float t = clamp((vValue - uCRange.x) / (uCRange.y - uCRange.x), 0.0, 1.0);
  if (uCRange.z > 0.5) t = 1.0 - t;
  vec4 lut = texture(uLut, vec2((t * 255.0 + 0.5) / 256.0, 0.5));
  color = vec4(lut.rgb, lut.a * color.a);
#endif
  color.a *= uOpacity;
  // @mesh-color
#ifndef HC_UNLIT
  vec3 V = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-vViewPos);
  vec3 N = dot(vNormal, vNormal) > 0.0 ? normalize(vNormal) : vec3(0.0);
  N = faceforward(N, -V, N);
  vec3 diffuse = uAmbient + mix(uHemiGround, uHemiSky, 0.5 + 0.5 * dot(N, uHemiUp));
  vec3 specular = vec3(0.0);
#if HC_LIGHTS > 0
  for (int i = 0; i < HC_LIGHTS; i++) {
    vec4 lp = uLightPos[i];
    vec3 L = normalize(lp.w > 0.5 ? lp.xyz - vViewPos : lp.xyz);
    diffuse += uK.x * max(dot(N, L), 0.0) * uLightColor[i];
    specular += uK.y * clamp(hcCookTorrance(L, V, N, uK.z, uK.w), 0.0, 1.0) * uLightColor[i];
  }
#endif
  color.rgb = min(diffuse, vec3(1.0)) * color.rgb + specular;
#endif
  // @mesh-lit
  fragColor = color;
#endif
}
`;
