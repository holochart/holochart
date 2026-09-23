/**
 * GLSL chunks shared by the primitives. Include them at the top of a vertex (or fragment) shader
 * body; they declare their own uniforms, which must be supplied via `createTransformUniforms()` /
 * `createViewportUniforms()` from `common.ts`.
 */

/**
 * Data → world → clip. Positions are RTC-encoded (`local = data - origin`), and `uOffset` already
 * contains `offset + origin * scale` (computed in float64 on the CPU).
 */
export const TRANSFORM_GLSL = /* glsl */ `
uniform vec3 uScale;
uniform vec3 uOffset;

vec3 hcDataToWorld(vec3 local) {
  return local * uScale + uOffset;
}

vec4 hcWorldToClip(vec3 world) {
  return projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}

vec4 hcDataToClip(vec3 local) {
  return hcWorldToClip(hcDataToWorld(local));
}
`;

/**
 * Screen-space helpers. "Screen" = CSS pixels from the viewport's bottom-left corner. Offsetting in
 * clip space (`hcOffsetClip`) keeps sizes in px for both the 2D pixel ortho camera and 3D
 * perspective cameras.
 */
export const SCREEN_GLSL = /* glsl */ `
uniform vec2 uResolution;
uniform float uPixelRatio;

vec2 hcClipToScreen(vec4 clip) {
  return (clip.xy / clip.w * 0.5 + 0.5) * uResolution;
}

vec4 hcScreenToClip(vec2 screen, float ndcZ) {
  return vec4(screen / uResolution * 2.0 - 1.0, ndcZ, 1.0);
}

vec4 hcOffsetClip(vec4 clip, vec2 offsetPx) {
  clip.xy += offsetPx / uResolution * 2.0 * clip.w;
  return clip;
}

/** Snap CSS px to the device-pixel grid; phase 0 = pixel edges, 0.5 = pixel centers. */
float hcSnap(float px, float phase) {
  return (floor(px * uPixelRatio - phase + 0.5) + phase) / uPixelRatio;
}

/** Width of one device pixel in CSS px: the anti-aliasing ramp used by SDF fragment shaders. */
float hcAAWidth() {
  return 1.0 / uPixelRatio;
}
`;
