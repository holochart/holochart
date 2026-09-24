/**
 * Colorscale interpolation spaces (plan E8.2, `layout.colorscaleInterpolation`).
 *
 * Plotly interpolates colorscales in sRGB (CSS `rgb()` strings), which is the default here too and
 * what the LUT does natively. Perceptual spaces give smoother, more even ramps between distant
 * stops (sRGB midpoints of complementary colors are muddy and dark):
 *
 * - `oklab`: Björn Ottosson's Oklab (2020), perceptually uniform lightness and hue;
 * - `lab`: CIE L*a*b* (D65 white);
 * - `hcl`: CIE LCh(ab), Lab in polar form; hue takes the shorter way around the circle.
 *
 * Alpha is always interpolated linearly. {@link densifyColorscale} bakes a space into extra sRGB
 * stops so every consumer that interpolates stops in sRGB (the GPU LUT, colorbars, legends, hover
 * colors) reproduces the chosen space without knowing about it.
 */
import type { RGBA } from '../types.ts';
import type { Colorscale, ColorscaleStop } from './lut.ts';

/** Color space in which colorscale stops are interpolated. */
export type ColorscaleInterpolation = 'rgb' | 'oklab' | 'lab' | 'hcl';

/** The interpolation spaces, for validation and docs. */
export const COLORSCALE_INTERPOLATIONS: readonly ColorscaleInterpolation[] = [
  'rgb',
  'oklab',
  'lab',
  'hcl',
];

type Vec3 = [number, number, number];

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toGamma(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

// ---- Oklab (https://bottosson.github.io/posts/oklab/) --------------------------------------------

function srgbToOklab(c: RGBA): Vec3 {
  const r = toLinear(c[0]);
  const g = toLinear(c[1]);
  const b = toLinear(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToSrgb([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp01(toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

// ---- CIE Lab / LCh (D65) ---------------------------------------------------------------------------

const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

function labF(t: number): number {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

function labFInv(t: number): number {
  const t3 = t * t * t;
  return t3 > EPS ? t3 : (116 * t - 16) / KAPPA;
}

function srgbToLab(c: RGBA): Vec3 {
  const r = toLinear(c[0]);
  const g = toLinear(c[1]);
  const b = toLinear(c[2]);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / YN;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / ZN;
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToSrgb([L, a, b]: Vec3): Vec3 {
  const fy = (L + 16) / 116;
  const x = labFInv(fy + a / 500) * XN;
  const y = labFInv(fy) * YN;
  const z = labFInv(fy - b / 200) * ZN;
  return [
    clamp01(toGamma(3.2404542 * x - 1.5371385 * y - 0.4985314 * z)),
    clamp01(toGamma(-0.969266 * x + 1.8760108 * y + 0.041556 * z)),
    clamp01(toGamma(0.0556434 * x - 0.2040259 * y + 1.0572252 * z)),
  ];
}

/** Below this chroma a color's hue is meaningless (grays); it takes the other color's hue. */
const ACHROMATIC = 1e-4;

function labToLch([L, a, b]: Vec3): Vec3 {
  const c = Math.hypot(a, b);
  const h = c < ACHROMATIC ? NaN : Math.atan2(b, a);
  return [L, c, h];
}

function lchToLab([L, c, h]: Vec3): Vec3 {
  return Number.isNaN(h) ? [L, 0, 0] : [L, c * Math.cos(h), c * Math.sin(h)];
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Mix two sRGB 0–1 colors at `t` ∈ [0, 1] in `space` (alpha linearly). Endpoints are exact:
 * `t = 0` gives `a` and `t = 1` gives `b` in every space.
 */
export function mixColors(
  a: RGBA,
  b: RGBA,
  t: number,
  space: ColorscaleInterpolation = 'rgb',
  out: [number, number, number, number] = [0, 0, 0, 0],
): [number, number, number, number] {
  out[3] = lerp(a[3], b[3], t);
  if (space === 'rgb' || t <= 0 || t >= 1) {
    const src = space === 'rgb' ? null : t <= 0 ? a : b;
    for (let i = 0; i < 3; i++) out[i] = src ? src[i]! : lerp(a[i]!, b[i]!, t);
    return out;
  }
  let rgb: Vec3;
  if (space === 'oklab') {
    const p = srgbToOklab(a);
    const q = srgbToOklab(b);
    rgb = oklabToSrgb([lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)]);
  } else if (space === 'lab') {
    const p = srgbToLab(a);
    const q = srgbToLab(b);
    rgb = labToSrgb([lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)]);
  } else {
    const p = labToLch(srgbToLab(a));
    const q = labToLch(srgbToLab(b));
    let h1 = p[2];
    let h2 = q[2];
    if (Number.isNaN(h1)) h1 = h2;
    if (Number.isNaN(h2)) h2 = h1;
    let dh = h2 - h1;
    // Shorter arc, like d3's interpolateHcl.
    if (dh > Math.PI) dh -= 2 * Math.PI;
    else if (dh < -Math.PI) dh += 2 * Math.PI;
    rgb = labToSrgb(lchToLab([lerp(p[0], q[0], t), lerp(p[1], q[1], t), h1 + dh * t]));
  }
  out[0] = rgb[0];
  out[1] = rgb[1];
  out[2] = rgb[2];
  return out;
}

/** Whether `value` names an interpolation space. */
export function isColorscaleInterpolation(value: unknown): value is ColorscaleInterpolation {
  return (COLORSCALE_INTERPOLATIONS as readonly unknown[]).includes(value);
}

/**
 * Bake an interpolation space into a colorscale: sub-divide every segment between stops (about
 * `resolution` segments over the whole 0–1 span, at least one per segment) with colors mixed in
 * `space`, so plain sRGB interpolation between the new stops follows the space's curve (within
 * about 1/255 at the default resolution). Hard steps (equal positions) stay hard. `'rgb'` returns
 * the scale unchanged.
 */
export function densifyColorscale(
  scale: Colorscale,
  space: ColorscaleInterpolation,
  resolution = 64,
): Colorscale {
  if (space === 'rgb' || scale.length < 2) return scale;
  const stops = [...scale].sort((p, q) => p[0] - q[0]);
  const out: ColorscaleStop[] = [stops[0]!];
  for (let i = 1; i < stops.length; i++) {
    const lo = stops[i - 1]!;
    const hi = stops[i]!;
    const span = hi[0] - lo[0];
    const n = span > 0 ? Math.max(1, Math.ceil(span * resolution)) : 1;
    for (let k = 1; k < n; k++) {
      const f = k / n;
      out.push([lo[0] + span * f, mixColors(lo[1], hi[1], f, space)]);
    }
    out.push(hi);
  }
  return out;
}
