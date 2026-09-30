/**
 * `surface` defaults (plotly.js `surface/defaults.js`): the grid, hover formats, lighting,
 * contours (`project` / `color` / `width` / `usecolormap` only when shown, `highlight*` only when
 * highlighting), the `c` colorscale (off `autocolorscale`, Plotly's `RdBu`, as for heatmaps; the
 * legacy `zauto` / `zmin` / `zmax` without `surfacecolor`),
 * `opacityscale` (named scales expanded to stops) and the wireframe extension.
 */
import {
  isArrayLike,
  isColorscaleName,
  type FullLayout,
  type FullTrace,
  type LayoutDefaultsContext,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { supplyColorbarDefaults, supplyColorscaleDefaults } from '@mk7s/holochart-traces-basic';
import { supplySceneLightingDefaults } from '../scene/lighting-attributes.ts';
import { surfaceColorExtent } from './grid.ts';

/** Plotly's default colorscale of `surface` (its `scales.RdBu` default). */
export const DEFAULT_SURFACE_COLORSCALE = 'RdBu';

/** Plotly's `MIN` of named opacity scales: faded values stay faintly visible. */
const MIN_OPACITY = 0.1;

type Coerce = TraceDefaultsContext['coerce'];

function numeric(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidScale(value: unknown): boolean {
  if (typeof value === 'string') return isColorscaleName(value);
  return Array.isArray(value) && value.length >= 2 && value.every((s) => Array.isArray(s));
}

/** Plotly's `createWave(1, MIN)`: 32 stops, opaque at both ends, faded in the middle. */
function extremes(): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 32; i++) {
    const u = i / 31;
    const v = MIN_OPACITY + (1 - MIN_OPACITY) * (1 - Math.sin(u * Math.PI) ** 2);
    out.push([u, Math.min(1, Math.max(0, v))]);
  }
  return out;
}

/**
 * Plotly's `isValidScaleArray` for opacity scales: at least two `[position, opacity]` pairs, from
 * 0 to 1, positions not decreasing.
 */
export function isValidOpacityscale(value: unknown): value is [number, number][] {
  if (!Array.isArray(value) || value.length < 2) return false;
  let last = 0;
  for (const stop of value) {
    if (!Array.isArray(stop) || stop.length !== 2 || !(Number(stop[0]) >= last)) return false;
    last = Number(stop[0]);
  }
  return Number(value[0][0]) === 0 && Number(value[value.length - 1][0]) === 1;
}

/**
 * The stops of an `opacityscale` input (Plotly's `opacityscaleDefaults`): `'max'` keeps the high
 * values opaque and fades the low ones (to 0.1), `'min'` the reverse, `'extremes'` keeps both ends
 * opaque; a valid stop list is kept (numbers); anything else is `undefined` (no opacity scale).
 */
export function opacityscaleStops(value: unknown): [number, number][] | undefined {
  if (value === 'max') {
    return [
      [0, MIN_OPACITY],
      [1, 1],
    ];
  }
  if (value === 'min') {
    return [
      [0, 1],
      [1, MIN_OPACITY],
    ];
  }
  if (value === 'extremes') return extremes();
  if (!isValidOpacityscale(value)) return undefined;
  return value.map(([p, o]) => [Number(p), Math.min(1, Math.max(0, Number(o) || 0))]);
}

/**
 * Plotly's `colorScaleDefaults` with `cLetter: 'c'` at the trace root and `autoColorDflt: false`:
 * `autocolorscale` stays off unless the colorscale (given or from the template) is invalid.
 */
function supplySurfaceColorscaleDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  coerce: Coerce,
  template: Readonly<Record<string, unknown>> | undefined,
): void {
  if (traceIn['coloraxis'] !== undefined && coerce('coloraxis') !== undefined) return;
  // Plotly's legacy `zauto` / `zmin` / `zmax` stand for the `c` attributes without `surfacecolor`.
  const legacy = (c: string, z: string): unknown =>
    traceIn[c] === undefined && traceIn['surfacecolor'] === undefined ? traceIn[z] : undefined;
  const minIn = traceIn['cmin'] ?? legacy('cmin', 'zmin');
  const maxIn = traceIn['cmax'] ?? legacy('cmax', 'zmax');
  const validMinMax = numeric(minIn) && numeric(maxIn) && minIn < maxIn;
  const autoIn = legacy('cauto', 'zauto');
  if (coerce<boolean>('cauto', typeof autoIn === 'boolean' ? autoIn : !validMinMax)) {
    coerce('cmid');
  } else {
    coerce('cmin', numeric(minIn) ? minIn : undefined);
    coerce('cmax', numeric(maxIn) ? maxIn : undefined);
  }
  let autoDflt = false;
  if (traceIn['colorscale'] !== undefined) autoDflt = !isValidScale(traceIn['colorscale']);
  if (template?.['colorscale'] !== undefined) autoDflt = !isValidScale(template['colorscale']);
  coerce('autocolorscale', autoDflt);
  coerce('colorscale', DEFAULT_SURFACE_COLORSCALE);
  coerce('reversescale');
  if (coerce<boolean>('showscale')) supplyColorbarDefaults(coerce, '');
}

/** Whether `z` is a usable 2D array: rows that are arrays, one of them not empty. */
export function isValidSurfaceZ(z: unknown): z is ArrayLike<ArrayLike<unknown>> {
  if (!isArrayLike(z) || z.length === 0) return false;
  let filled = false;
  for (let j = 0; j < z.length; j++) {
    const row = z[j];
    if (!isArrayLike(row)) return false;
    if (row.length > 0) filled = true;
  }
  return filled;
}

/** Supply `surface` defaults (see the module comment). */
export function supplySurfaceDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const { coerce } = ctx;
  coerce('scene');
  const x = coerce('x');
  const y = coerce('y');
  const z = coerce('z');
  if (
    !isValidSurfaceZ(z) ||
    (isArrayLike(x) && x.length === 0) ||
    (isArrayLike(y) && y.length === 0)
  ) {
    traceOut.visible = false;
    return;
  }
  for (const k of ['text', 'hovertext', 'xhoverformat', 'yhoverformat', 'zhoverformat']) coerce(k);
  supplySceneLightingDefaults(ctx);
  coerce('hidesurface');
  coerce('connectgaps');
  coerce('opacity');
  coerce('surfacecolor');
  for (const axis of ['x', 'y', 'z']) {
    const p = `contours.${axis}`;
    const show = coerce<boolean>(`${p}.show`);
    const highlight = coerce<boolean>(`${p}.highlight`);
    if (show || highlight) for (const wall of ['x', 'y', 'z']) coerce(`${p}.project.${wall}`);
    if (show) {
      coerce(`${p}.color`);
      coerce(`${p}.width`);
      coerce(`${p}.usecolormap`);
    }
    if (highlight) {
      coerce(`${p}.highlightcolor`);
      coerce(`${p}.highlightwidth`);
    }
    coerce(`${p}.start`);
    coerce(`${p}.end`);
    coerce(`${p}.size`);
  }
  if (coerce<boolean>('wireframe.show')) {
    coerce('wireframe.color');
    coerce('wireframe.width');
    coerce('wireframe.step');
  }
  supplySurfaceColorscaleDefaults(traceIn, coerce, ctx.template);
  const scale = opacityscaleStops(traceIn['opacityscale'] ?? ctx.template?.['opacityscale']);
  if (scale) traceOut['opacityscale'] = scale;
  // Surfaces are described by their colorbar: in the legend only on request (Plotly).
  if (traceIn['showlegend'] !== true) traceOut['showlegend'] = false;
  // Grid data (like heatmaps): no 1D per-point arrays.
  traceOut['_length'] = null;
}

/**
 * Layout defaults for the color axes surfaces reference with `coloraxis` (Plotly's
 * `colorAxisDefaults` and the extent `calc` adds): coerce each axis and widen its cross-trace
 * `_min` / `_max` with the values the surfaces are colored by (`surfacecolor`, else `z`).
 * Idempotent, and merges with the extents other trace types gave the axis.
 */
export function supplySurfaceLayoutDefaults(
  layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
  ctx: LayoutDefaultsContext,
): void {
  for (const trace of ctx.fullData) {
    const id = trace['coloraxis'];
    if (trace.visible === false || trace.type !== 'surface' || typeof id !== 'string') continue;
    const input = layoutIn[id];
    supplyColorscaleDefaults(
      input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : undefined,
      ctx.coerce,
      `${id}.`,
      { inTrace: false, showscale: true },
    );
    const out = layoutOut[id] as Record<string, unknown> | undefined;
    const extent = surfaceColorExtent(trace);
    if (out === null || typeof out !== 'object' || !extent) continue;
    const min = out['_min'];
    const max = out['_max'];
    out['_min'] = Math.min(extent[0], typeof min === 'number' ? min : Infinity);
    out['_max'] = Math.max(extent[1], typeof max === 'number' ? max : -Infinity);
  }
}
