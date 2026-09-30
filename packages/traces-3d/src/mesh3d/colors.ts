/**
 * Colors of the colorscaled 3D traces with trace-level colorscale attributes (`mesh3d`
 * `intensity`, `cone` norms; plotly.js `colorScaleAttrs('', { cLetter: 'c' })`): per-point CSS
 * colors, the colorscale mapping (own or through a `coloraxis`), the color axes' shared domains
 * and the `colorbar` hook.
 */
import {
  isArrayLike,
  toRGBA,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
} from '@mk7s/holochart-core';
import type { ColorbarSpec } from '@mk7s/holochart-runtime';
import {
  numericExtent,
  resolveColorMapping,
  rgbaToCss,
  supplyColorscaleDefaults,
} from '@mk7s/holochart-traces-basic';

type Container = Record<string, unknown>;

/** gl-mesh3d's color for a missing per-vertex / per-face color. */
const MISSING: readonly number[] = [0.5, 0.5, 0.5, 1];

/** Numbers of a data array (non-numbers → NaN), `n` of them. */
export function numbersOf(v: unknown, n = isArrayLike(v) ? v.length : 0): Float64Array {
  const out = new Float64Array(n);
  const a = isArrayLike(v) ? (v as ArrayLike<unknown>) : [];
  for (let i = 0; i < n; i++) {
    const x = a[i];
    out[i] = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? +x : NaN;
  }
  return out;
}

/** CSS colors → sRGB RGBA floats (4 per entry), `n` entries; missing ones gray. */
export function cssColors(v: unknown, n: number): Float32Array {
  const out = new Float32Array(n * 4);
  const a = isArrayLike(v) ? (v as ArrayLike<unknown>) : [];
  for (let i = 0; i < n; i++) {
    const c = typeof a[i] === 'string' ? toRGBA(a[i] as string) : null;
    out.set(c ?? MISSING, i * 4);
  }
  return out;
}

/**
 * The colorscale mapping of a trace whose colorscale attributes sit at its root, for `values`
 * (e.g. the `intensity` array, or a cone's `[min norm, max norm]`).
 */
export function traceColorMapping(
  trace: FullTrace,
  fullLayout: FullLayout,
  values: ArrayLike<number>,
): ReturnType<typeof resolveColorMapping> {
  return resolveColorMapping({ ...trace, _values: values }, fullLayout, '_values');
}

/**
 * The `colorbar` hook: the trace's own bar (`showscale`) or its color axis' bar, for the values
 * the colorscale maps (`null` when there are none, or no bar is shown).
 */
export function traceColorbar(
  trace: FullTrace,
  fullLayout: FullLayout,
  values: ArrayLike<number> | undefined,
): ColorbarSpec | null {
  if (trace.visible !== true || !values) return null;
  const id = trace['coloraxis'];
  const axis = typeof id === 'string' ? (fullLayout[id] as Container | undefined) : undefined;
  const owner = axis ?? trace;
  if (owner['showscale'] !== true) return null;
  const cb = owner['colorbar'];
  if (cb === null || typeof cb !== 'object') return null;
  const mapping = traceColorMapping(trace, fullLayout, values);
  if (!mapping) return null;
  let stops = mapping.colorscale.map(([p, c]): [number, string] => [p, rgbaToCss(c)]);
  if (mapping.reversescale) stops = stops.map(([p, c]): [number, string] => [1 - p, c]).reverse();
  return {
    colorscale: stops,
    cmin: mapping.cmin,
    cmax: mapping.cmax,
    ...(axis && typeof id === 'string' ? { coloraxis: id } : {}),
    attributes: cb as Container,
  };
}

/**
 * Layout defaults of the color axes these traces reference with their root `coloraxis` (Plotly
 * `colorAxisDefaults` + `calcColorAxis`): coerce each axis and widen its shared data extent
 * (`_min` / `_max`, read by the colorscale mapping) with the values of `valuesOf(trace)`.
 * Idempotent, like traces-basic's marker color axes.
 */
export function supplyTraceColoraxisDefaults(
  layoutIn: Readonly<Container>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
  type: string,
  valuesOf: (trace: FullTrace) => ArrayLike<number> | undefined,
): void {
  for (const trace of ctx.fullData) {
    if (trace.visible === false || trace.type !== type) continue;
    const id = trace['coloraxis'];
    if (typeof id !== 'string') continue;
    const input = layoutIn[id];
    supplyColorscaleDefaults(
      input !== null && typeof input === 'object' ? (input as Container) : undefined,
      ctx.coerce,
      `${id}.`,
      { inTrace: false, showscale: true },
    );
    const out = layoutOut[id] as Container | undefined;
    const values = valuesOf(trace);
    if (!out || typeof out !== 'object' || !values) continue;
    const [lo, hi] = numericExtent(values);
    const min = out['_min'];
    const max = out['_max'];
    out['_min'] = Math.min(lo, typeof min === 'number' ? min : Infinity);
    out['_max'] = Math.max(hi, typeof max === 'number' ? max : -Infinity);
  }
}
