/**
 * GLSL shared by pick materials (GLSL3 via `ShaderMaterial`; three.js provides `position`,
 * `projectionMatrix`, `modelViewMatrix`, and `instanceMatrix` under `USE_INSTANCING`).
 */

/**
 * `vec4 holochartEncodePickId(uint id)`: the RGBA8 encoding of `id + 1` (0 = background), with
 * the same +0.25 byte bias as `encodePickId` so truncating and rounding float → unorm conversions
 * both return the intended byte.
 */
export const PICK_ENCODE_GLSL = /* glsl */ `
vec4 holochartEncodePickId(uint id) {
  uint v = id + 1u;
  vec4 bytes = vec4(float(v >> 24u), float((v >> 16u) & 255u), float((v >> 8u) & 255u), float(v & 255u));
  return min((bytes + 0.25) / 255.0, vec4(1.0));
}
`;

/**
 * Generic mesh pick vertex shader. Defines select the element id: `PICK_VERTEX`, `PICK_TRIANGLE`,
 * `PICK_INSTANCE`, or none (object-level).
 */
export const MESH_PICK_VERTEX = /* glsl */ `
precision highp float;
precision highp int;

uniform uint uPickBase;
flat out uint vPickId;

void main() {
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
#if defined(PICK_VERTEX)
  vPickId = uPickBase + uint(gl_VertexID);
#elif defined(PICK_TRIANGLE)
  // All three vertices of triangle t (non-indexed: vertex ids 3t..3t+2) agree, so the flat
  // varying is the triangle index whichever vertex is provoking.
  vPickId = uPickBase + uint(gl_VertexID) / 3u;
#elif defined(PICK_INSTANCE)
  vPickId = uPickBase + uint(gl_InstanceID);
#else
  vPickId = uPickBase;
#endif
}
`;

export const MESH_PICK_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;

${PICK_ENCODE_GLSL}

flat in uint vPickId;
out vec4 fragColor;

void main() {
#ifdef PICK_OCCLUDER
  fragColor = vec4(0.0);
#else
  fragColor = holochartEncodePickId(vPickId);
#endif
}
`;
