/**
 * The trace-level `z` colorscale of `histogram2d` and `histogram2dcontour` (plotly.js
 * `colorScaleAttrs('', { cLetter: 'z', autoColorDflt: false })`): `colorscale`, `zauto`, `zmin`,
 * `zmax`, `zmid`, `autocolorscale` (off by default, as for every heatmap-like trace), `reversescale`,
 * `showscale` (on by default) with its `colorbar`, and `coloraxis`.
 *
 * The values these colorscales map are aggregates computed in calc (bin counts, sums, …), which the
 * colorbar hook (it only sees the defaulted trace) and the layout's color axes never see. calc
 * records each trace's value extent in a small registry ({@link recordZExtent}) keyed by the trace's
 * data arrays, so the hook and every trace sharing a `coloraxis` read the same domain.
 */
import {
  attr,
  isArrayLike,
  isColorscaleName,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
} from '@mk7s/holochart-core';
import { densifyColorscale, type Colorscale } from '@mk7s/holochart-render';
import {
  colorbarAttributes,
  colorscaleInterpolation,
  resolveColorscale,
  rgbaToCss,
  supplyColorbarDefaults,
  supplyColorscaleDefaults,
} from '@mk7s/holochart-traces-basic';
import type { ColorbarSpec } from '@mk7s/holochart-runtime';

/** Plotly's default colorscale for heatmap-like traces (`scales.RdBu`, its `defaultScale`). */
export const DEFAULT_Z_COLORSCALE = 'RdBu';

/** Coerce function shape of trace and layout defaults contexts. */
type Coerce = <T = unknown>(path: string, dflt?: unknown) => T;

/**
 * The `z` colorscale attributes. `editType` is `'style'` for traces that map values in the shader
 * (histogram2d) and `'calc'` for contours, whose automatic levels depend on `zmin` / `zmax`.
 */
export function zColorscaleAttributes(editType: 'style' | 'calc') {
  return {
    zauto: attr.boolean({
      dflt: true,
      editType,
      description:
        'Compute the color domain from the aggregated values. Defaults to false when both `zmin` and `zmax` are given.',
    }),
    zmin: attr.number({
      editType,
      description: 'Value mapped to the first colorscale color (with `zmax`; turns `zauto` off).',
    }),
    zmax: attr.number({
      editType,
      description: 'Value mapped to the last colorscale color (with `zmin`; turns `zauto` off).',
    }),
    zmid: attr.number({
      editType,
      description:
        'With `zauto`, widen the automatic domain so it is symmetric around this value (diverging data).',
    }),
    colorscale: attr.colorscale({
      editType,
      description:
        "Colorscale of the aggregated values: a name (`'Viridis'`, `'RdBu'`, …), a list of colors, or `[position, color]` stops from 0 to 1. Default: Plotly's `RdBu`; the default `holochart` template uses its sequential neon plasma.",
    }),
    autocolorscale: attr.boolean({
      dflt: false,
      editType,
      description:
        'Pick the colorscale from the sign of the color domain (`layout.colorscale.sequential`, `sequentialminus` or `diverging`) instead of `colorscale`.',
    }),
    reversescale: attr.boolean({
      dflt: false,
      editType,
      description: 'Reverse the colorscale (the lowest value gets the last color).',
    }),
    showscale: attr.boolean({
      dflt: true,
      editType: 'colorbars',
      description: 'Show a colorbar for the colorscale (drawn by the colorbar component).',
    }),
    colorbar: colorbarAttributes,
    coloraxis: attr.subplotId({
      dflt: 'coloraxis',
      editType,
      description:
        "Share a colorscale and domain with other traces through `layout.coloraxis` (`'coloraxis'`, `'coloraxis2'`, …). Overrides this trace's colorscale attributes.",
    }),
  } as const;
}

function numeric(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidScale(value: unknown): boolean {
  if (typeof value === 'string') return isColorscaleName(value);
  return Array.isArray(value) && value.length >= 2 && value.every((s) => Array.isArray(s));
}

/**
 * Plotly's `colorScaleDefaults` with `cLetter: 'z'` at the trace root. A trace linked to a color
 * axis only keeps `coloraxis`: the axis owns the rest.
 */
export function supplyZColorscaleDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  coerce: Coerce,
  template: Readonly<Record<string, unknown>> | undefined,
  autoColorDflt = false,
): void {
  if (traceIn['coloraxis'] !== undefined && coerce('coloraxis') !== undefined) return;
  const minIn = traceIn['zmin'];
  const maxIn = traceIn['zmax'];
  const validMinMax = numeric(minIn) && numeric(maxIn) && minIn < maxIn;
  const auto = coerce<boolean>('zauto', !validMinMax);
  if (auto) coerce('zmid');
  else {
    coerce('zmin');
    coerce('zmax');
  }
  // Heatmaps don't pick automatic scales unless asked (`autoColorDflt`, true for contours), but a
  // valid colorscale given by the user or the template turns them off, and an invalid one on
  // (Plotly).
  let autoDflt = autoColorDflt;
  if (traceIn['colorscale'] !== undefined) autoDflt = !isValidScale(traceIn['colorscale']);
  if (template?.['colorscale'] !== undefined) autoDflt = !isValidScale(template['colorscale']);
  coerce('autocolorscale', autoDflt);
  coerce('colorscale', DEFAULT_Z_COLORSCALE);
  coerce('reversescale');
  if (coerce<boolean>('showscale')) supplyColorbarDefaults(coerce, '');
}

// ---- Value extents (calc → colorbar / color axes) ------------------------------------------------

let nextArrayId = 1;
const arrayIds = new WeakMap<object, number>();

function arrayId(v: unknown): number {
  if (v === null || typeof v !== 'object') return 0;
  let id = arrayIds.get(v);
  if (id === undefined) {
    id = nextArrayId++;
    arrayIds.set(v, id);
  }
  return id;
}

/**
 * Key of a trace's aggregated values: its index, the identity of its data arrays and the
 * attributes that change what calc aggregates. Stable across supply-defaults passes (data arrays
 * are kept by reference), so the colorbar hook finds what the last calc recorded.
 */
export function zExtentKey(trace: FullTrace): string {
  const marker = trace['marker'] as { color?: unknown } | undefined;
  return [
    trace.type,
    trace._index,
    arrayId(trace['x']),
    arrayId(trace['y']),
    arrayId(trace['z']),
    arrayId(marker?.color),
    trace['histfunc'],
    trace['histnorm'],
  ].join('|');
}

/** Most extents kept (oldest dropped first); a figure records one per trace. */
const MAX_EXTENTS = 512;
const extents = new Map<string, readonly [number, number]>();

/** Record the finite extent of a trace's aggregated values (called by calc). */
export function recordZExtent(trace: FullTrace, extent: readonly [number, number]): void {
  const key = zExtentKey(trace);
  extents.delete(key);
  extents.set(key, extent);
  if (extents.size > MAX_EXTENTS) extents.delete(extents.keys().next().value!);
}

/** The extent calc recorded for `trace`, if it ran. */
export function recordedZExtent(trace: FullTrace): readonly [number, number] | undefined {
  return extents.get(zExtentKey(trace));
}

/** Private layout key: per color axis, the extent keys of the traces of this package on it. */
const AXIS_TRACES_KEY = '_zExtentKeys';

/**
 * Layout defaults for the color axes histogram2d / histogram2dcontour traces reference: coerce each
 * axis (Plotly `colorAxisDefaults`) and remember which traces feed it, so their shared automatic
 * domain can be read once calc has run ({@link zDomain}).
 */
export function supplyZColoraxisDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  const byAxis = new Map<string, string[]>();
  for (const trace of ctx.fullData) {
    if (trace.visible === false) continue;
    if (trace.type !== 'histogram2d' && trace.type !== 'histogram2dcontour') continue;
    const id = trace['coloraxis'];
    if (typeof id !== 'string') continue;
    const keys = byAxis.get(id) ?? [];
    keys.push(zExtentKey(trace));
    byAxis.set(id, keys);
  }
  for (const [id, keys] of byAxis) {
    const input = layoutIn[id];
    // The layout axis may already have been coerced by another module (scatter, bar): coercing
    // again is idempotent.
    supplyColorscaleDefaults(
      input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : undefined,
      ctx.coerce,
      `${id}.`,
      { inTrace: false, showscale: true },
    );
    const out = layoutOut[id];
    if (out !== null && typeof out === 'object') {
      const prev = (out as Record<string, unknown>)[AXIS_TRACES_KEY];
      const all = Array.isArray(prev) ? [...(prev as string[]), ...keys] : keys;
      Object.assign(out, { [AXIS_TRACES_KEY]: all });
    }
  }
}

function axisOf(trace: FullTrace, fullLayout: FullLayout): Record<string, unknown> | undefined {
  const id = trace['coloraxis'];
  if (typeof id !== 'string') return undefined;
  const c = fullLayout[id];
  return c !== null && typeof c === 'object' ? (c as Record<string, unknown>) : undefined;
}

/**
 * The color domain of a trace (Plotly `colorscale/calc.js`): with `zauto` (`cauto` on a color
 * axis) the data extent — across every trace on the axis — widened to be symmetric around
 * `zmid`; else `zmin` / `zmax`. A zero-width domain grows to ±0.5; no data gives [0, 1].
 */
export function zDomain(
  trace: FullTrace,
  fullLayout: FullLayout,
  ownExtent?: readonly [number, number],
): [number, number] {
  const axis = axisOf(trace, fullLayout);
  const [letter, source] = axis ? (['c', axis] as const) : (['z', trace] as const);
  let lo = Infinity;
  let hi = -Infinity;
  const own = ownExtent ?? recordedZExtent(trace);
  if (own) [lo, hi] = [own[0], own[1]];
  const keys = axis?.[AXIS_TRACES_KEY];
  if (Array.isArray(keys)) {
    for (const key of keys as string[]) {
      const e = extents.get(key);
      if (!e) continue;
      lo = Math.min(lo, e[0]);
      hi = Math.max(hi, e[1]);
    }
  }
  const auto = source[`${letter}auto`] !== false;
  const minIn = source[`${letter}min`];
  const maxIn = source[`${letter}max`];
  let min = !auto && numeric(minIn) ? minIn : lo;
  let max = !auto && numeric(maxIn) ? maxIn : hi;
  const mid = source[`${letter}mid`];
  if (auto && numeric(mid) && min <= max) {
    if (max - mid > mid - min) min = mid - (max - mid);
    else if (max - mid < mid - min) max = mid + (mid - min);
  }
  if (!(min <= max)) return [0, 1];
  if (min === max) return [min - 0.5, max + 0.5];
  return [min, max];
}

/** A resolved `z` colorscale, in the render layer's terms. */
export interface ZColorMapping {
  /** Stops with `layout.colorscaleInterpolation` baked in (sRGB interpolation from here on). */
  readonly colorscale: Colorscale;
  readonly zmin: number;
  readonly zmax: number;
  readonly reversescale: boolean;
}

function autoScale(min: number, max: number, fullLayout: FullLayout): Colorscale {
  const which = min * max < 0 ? 'diverging' : min >= 0 ? 'sequential' : 'sequentialminus';
  const layoutScales = fullLayout['colorscale'];
  const value =
    layoutScales !== null && typeof layoutScales === 'object'
      ? (layoutScales as Record<string, unknown>)[which]
      : undefined;
  const fallback = { diverging: 'RdBu', sequential: 'Reds', sequentialminus: 'Blues' }[which];
  return resolveColorscale(value) ?? resolveColorscale(fallback)!;
}

/** The colorscale mapping of a trace (its own, or its color axis'). */
export function zColorMapping(
  trace: FullTrace,
  fullLayout: FullLayout,
  ownExtent?: readonly [number, number],
): ZColorMapping {
  const source = axisOf(trace, fullLayout) ?? trace;
  const [zmin, zmax] = zDomain(trace, fullLayout, ownExtent);
  let scale = resolveColorscale(source['colorscale']);
  if (source['autocolorscale'] === true || !scale) scale = autoScale(zmin, zmax, fullLayout);
  const space = colorscaleInterpolation(fullLayout);
  return {
    colorscale: space === 'rgb' ? scale : densifyColorscale(scale, space),
    zmin,
    zmax,
    reversescale: source['reversescale'] === true,
  };
}

/** CSS stops of a mapping's colorscale, reversed for `reversescale` (for colorbars). */
export function cssStops(mapping: ZColorMapping): [number, string][] {
  const stops = mapping.colorscale.map(([p, c]): [number, string] => [p, rgbaToCss(c)]);
  return mapping.reversescale
    ? stops.map(([p, c]): [number, string] => [1 - p, c]).reverse()
    : stops;
}

/**
 * The `colorbar` hook of heatmap-like traces: the trace's own bar (`showscale`), or its color
 * axis' (`layout.coloraxisN.showscale`). `null` before the first calc (the domain is not known
 * yet) or when no bar is shown.
 */
export function zColorbar(trace: FullTrace, fullLayout: FullLayout): ColorbarSpec | null {
  if (trace.visible !== true) return null;
  const axis = axisOf(trace, fullLayout);
  const owner = axis ?? trace;
  if (owner['showscale'] !== true) return null;
  const cb = owner['colorbar'];
  if (cb === null || typeof cb !== 'object') return null;
  if (!recordedZExtent(trace) && !axis) return null;
  const mapping = zColorMapping(trace, fullLayout);
  const id = trace['coloraxis'];
  return {
    colorscale: cssStops(mapping),
    cmin: mapping.zmin,
    cmax: mapping.zmax,
    ...(axis && typeof id === 'string' ? { coloraxis: id } : {}),
    attributes: cb as Record<string, unknown>,
  };
}

/** Whether a value is a numeric data array (the aggregation data of `histfunc`). */
export function isNumericArray(v: unknown): boolean {
  return isArrayLike(v) && (v as ArrayLike<unknown>).length > 0;
}
