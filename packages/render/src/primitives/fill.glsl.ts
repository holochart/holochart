import { TRANSFORM_GLSL } from './common.glsl.ts';

/**
 * Fill vertex shader: RTC positions through the shared data → clip transform, flat per-vertex
 * color (constant within a polygon). `uOpacity` multiplies alpha so opacity changes are
 * uniform-only.
 */
export const FILL_VERTEX_GLSL = /* glsl */ `
${TRANSFORM_GLSL}
in vec4 aColor;
uniform float uOpacity;
out vec4 vColor;

void main() {
  vColor = vec4(aColor.rgb, aColor.a * uOpacity);
  gl_Position = hcDataToClip(position);
}
`;

/** Fill fragment shader: straight-alpha sRGB color, written unconverted (see `types.ts`). */
export const FILL_FRAGMENT_GLSL = /* glsl */ `
in vec4 vColor;
out highp vec4 fragColor;

void main() {
  if (vColor.a <= 0.0) discard;
  fragColor = vColor;
}
`;
