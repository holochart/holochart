import { TRANSFORM_GLSL } from './common.glsl.ts';

/**
 * Fill vertex shader: RTC positions through the shared data → clip transform, flat per-vertex
 * color (constant within a polygon). `uOpacity` multiplies alpha so opacity changes are
 * uniform-only. `aGrad` carries the gradient coordinate (see `writeFillGradient`), interpolated
 * across each triangle: it is affine in the position, so interpolation is exact.
 */
export const FILL_VERTEX_GLSL = /* glsl */ `
${TRANSFORM_GLSL}
in vec4 aColor;
in vec2 aGrad;
uniform float uOpacity;
out vec4 vColor;
out vec2 vGrad;

void main() {
  vColor = vec4(aColor.rgb, aColor.a * uOpacity);
  vGrad = aGrad;
  gl_Position = hcDataToClip(position);
}
`;

/**
 * Fill fragment shader: straight-alpha sRGB color, written unconverted (see `types.ts`). With a
 * gradient paint (`uGradient` 1: linear, `t = vGrad.x`; 2: radial, `t = 2·|vGrad − ½|` in the
 * bounding box, like SVG's default `radialGradient`), the color comes from the colorscale LUT.
 */
export const FILL_FRAGMENT_GLSL = /* glsl */ `
in vec4 vColor;
in vec2 vGrad;
uniform int uGradient;
uniform sampler2D uLut;
uniform float uLutSize;
uniform float uOpacity;
out highp vec4 fragColor;

void main() {
  vec4 color = vColor;
  if (uGradient > 0) {
    float t = uGradient == 1 ? vGrad.x : 2.0 * length(vGrad - 0.5);
    t = clamp(t, 0.0, 1.0);
    vec4 g = texture(uLut, vec2((t * (uLutSize - 1.0) + 0.5) / uLutSize, 0.5));
    color = vec4(g.rgb, g.a * uOpacity);
  }
  if (color.a <= 0.0) discard;
  fragColor = color;
}
`;
