/**
 * Color models of the `image` trace (plan E11.3), following plotly.js `image/constants.js` and
 * `image/calc.js` (`makeScaler`): what each `colormodel` reads from a pixel, the ranges `zmin` /
 * `zmax` default to, how components are rescaled from `[zmin, zmax]` to the model's range, and the
 * conversion of a scaled pixel to 8-bit RGBA for the texture. Pure.
 */

/** Plotly's image color models. @experimental */
export type Colormodel = 'rgb' | 'rgba' | 'rgba256' | 'hsl' | 'hsla';

/** One color model. */
export interface ColormodelSpec {
  /** Components read from each pixel. */
  readonly channels: 3 | 4;
  /** The CSS model of scaled colors (`rgba256` is shown as `rgba`). */
  readonly css: 'rgb' | 'rgba' | 'hsl' | 'hsla';
  /** Range of each scaled component (CSS: 0–255, alpha 0–1, hue 0–360, percentages 0–100). */
  readonly min: readonly number[];
  readonly max: readonly number[];
  /** Default `zmin` / `zmax` (the model's range unless given). */
  readonly zmin: readonly number[];
  readonly zmax: readonly number[];
  /** Units shown after each scaled component in hover labels. */
  readonly suffix: readonly string[];
}

const RGB = [0, 0, 0];
const RGB_MAX = [255, 255, 255];

/** Plotly's `constants.colormodel`. */
export const COLORMODELS: Readonly<Record<Colormodel, ColormodelSpec>> = {
  rgb: {
    channels: 3,
    css: 'rgb',
    min: RGB,
    max: RGB_MAX,
    zmin: RGB,
    zmax: RGB_MAX,
    suffix: ['', '', ''],
  },
  rgba: {
    channels: 4,
    css: 'rgba',
    min: [0, 0, 0, 0],
    max: [255, 255, 255, 1],
    zmin: [0, 0, 0, 0],
    zmax: [255, 255, 255, 1],
    suffix: ['', '', '', ''],
  },
  rgba256: {
    channels: 4,
    css: 'rgba',
    min: [0, 0, 0, 0],
    max: [255, 255, 255, 1],
    zmin: [0, 0, 0, 0],
    zmax: [255, 255, 255, 255],
    suffix: ['', '', '', ''],
  },
  hsl: {
    channels: 3,
    css: 'hsl',
    min: [0, 0, 0],
    max: [360, 100, 100],
    zmin: [0, 0, 0],
    zmax: [360, 100, 100],
    suffix: ['°', '%', '%'],
  },
  hsla: {
    channels: 4,
    css: 'hsla',
    min: [0, 0, 0, 0],
    max: [360, 100, 100, 1],
    zmin: [0, 0, 0, 0],
    zmax: [360, 100, 100, 1],
    suffix: ['°', '%', '%', ''],
  },
};

/** Whether `v` names a color model. */
export function isColormodel(v: unknown): v is Colormodel {
  return typeof v === 'string' && Object.hasOwn(COLORMODELS, v);
}

/** Plotly's `isNumeric` for pixel components: finite numbers and numeric strings. */
function componentValue(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * A pixel scaler (Plotly `makeScaler`): each component is mapped linearly from `[zmin, zmax]` to
 * the model's range and clamped (just clamped when the ranges are equal). Returns false for a
 * pixel with a missing or non-numeric component (drawn transparent, no hover).
 */
export function makeScaler(
  model: Colormodel,
  zmin: readonly number[],
  zmax: readonly number[],
): (pixel: ArrayLike<unknown>, out?: number[]) => number[] | false {
  const spec = COLORMODELS[model];
  const n = spec.channels;
  const zero: number[] = [];
  const ratio: number[] = [];
  for (let k = 0; k < n; k++) {
    const lo = spec.min[k]!;
    const hi = spec.max[k]!;
    const zlo = zmin[k] ?? spec.zmin[k]!;
    const zhi = zmax[k] ?? spec.zmax[k]!;
    const same = lo === zlo && hi === zhi;
    zero.push(same ? 0 : zlo);
    ratio.push(same ? 1 : (hi - lo) / (zhi - zlo));
  }
  return (pixel, out = new Array<number>(n)) => {
    for (let k = 0; k < n; k++) {
      const c = componentValue(pixel[k]);
      if (Number.isNaN(c)) return false;
      const v = (c - zero[k]!) * ratio[k]!;
      out[k] = Math.min(spec.max[k]!, Math.max(spec.min[k]!, v));
    }
    return out;
  };
}

/** HSL (hue in degrees, saturation and lightness in %) → RGB 0–255 (CSS Color 4). */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const a = sat * Math.min(light, 1 - light);
    return 255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

/**
 * A scaled color (the scaler's output) as 8-bit straight RGBA, into `out` at `offset`: how the
 * browser draws the CSS color Plotly builds from it (`rgb(…)`, `hsla(…)`; channels rounded).
 */
export function scaledToRgba8(
  model: Colormodel,
  c: readonly number[],
  out: Uint8Array | Uint8ClampedArray,
  offset: number,
): void {
  const spec = COLORMODELS[model];
  let r = c[0]!;
  let g = c[1]!;
  let b = c[2]!;
  if (spec.css === 'hsl' || spec.css === 'hsla') [r, g, b] = hslToRgb(r, g, b);
  out[offset] = Math.round(r);
  out[offset + 1] = Math.round(g);
  out[offset + 2] = Math.round(b);
  out[offset + 3] = spec.channels === 4 ? Math.round(c[3]! * 255) : 255;
}

/** Hover text of a scaled color (Plotly): `[r, g, b]` / `[h°, s%, l%, a]`, and each component. */
export function colorLabels(
  model: Colormodel,
  c: readonly number[],
): { color: string; parts: string[] } {
  const spec = COLORMODELS[model];
  const parts = Array.from({ length: spec.channels }, (_, k) => `${c[k]}${spec.suffix[k]}`);
  return { color: `[${parts.join(', ')}]`, parts };
}
