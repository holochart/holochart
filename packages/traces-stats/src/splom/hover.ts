/**
 * `splom` hover and selection (plan E10.9, E6.1, E6.3). The runtime asks once per cell under the
 * pointer (or the selection), with that cell's axes in the context; the cell's dimensions come
 * from the axis ids (`_axesDim`).
 *
 * - **Hover** finds the sample nearest the pointer in the hovered cell, by px distance to the
 *   marker edge (`closest`, as scatter) or along the hover axis (`x` / `y`). The label names both
 *   dimensions (`label: value` for the cell's x and y dimension), then the sample's text; the
 *   trace name goes in the side box. `hovertemplate` gets `%{x}` / `%{y}` (the cell's two
 *   dimension values), `%{text}`, `%{customdata}`, `%{marker.color}` and `%{marker.size}`.
 * - **Selection** returns the samples inside the box or lasso of the cell. The selection is per
 *   trace, so the same samples are highlighted in every cell.
 *
 * Both scan the cell's two columns (O(n) per query, well under a millisecond at 100k samples), so
 * no spatial index is built per cell (a matrix of d dimensions has up to d² cells).
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import { colorscaleT, resolveColorDomain, sampleColorscale } from '@mk7s/holochart-render';
import {
  formatAxisValue,
  selectionContains,
  type HoverContext,
  type HoverPoint,
  type HoverQuery,
  type SelectionQuery,
} from '@mk7s/holochart-runtime';
import { markerStyle, rgbaToCss } from '@mk7s/holochart-traces-basic';
import type { SplomCalc } from './calc.ts';
import { dimensionOfAxis, dimensionsOf } from './defaults.ts';

/** Smallest radius hover ranks with (Plotly's `MINRADIUS`). */
const MIN_RADIUS = 3;

/** The columns of the cell a hover / selection context is on, with their dimension indices. */
function cellColumns(
  calc: SplomCalc,
  trace: FullTrace,
  ctx: Pick<HoverContext, 'xaxis' | 'yaxis'>,
): { xi: number; yi: number; x: Float64Array; y: Float64Array } | undefined {
  if (!ctx.xaxis || !ctx.yaxis) return undefined;
  const xi = dimensionOfAxis(trace, ctx.xaxis.id);
  const yi = dimensionOfAxis(trace, ctx.yaxis.id);
  if (xi === undefined || yi === undefined) return undefined;
  const x = calc.columns[xi];
  const y = calc.columns[yi];
  return x && y ? { xi, yi, x, y } : undefined;
}

function radiusAt(calc: SplomCalc, i: number): number {
  const s = calc.markerSize;
  return (typeof s === 'number' ? s : (s[i] ?? 0)) / 2;
}

/** Plotly's `dxy` for `closest`: distance to the marker edge, ranking points under the pointer. */
function closestDistance(dpx: number, r: number): number {
  const rad = Math.max(MIN_RADIUS, r);
  return Math.max(dpx - rad, 1 - MIN_RADIUS / rad);
}

/** Plotly's `dx` / `dy` for `x` / `y` hovermodes. */
function axisDistance(dRaw: number, r: number): number {
  const rad = Math.max(MIN_RADIUS, r);
  const kink = 1 - 1 / rad;
  return dRaw < rad ? (kink * dRaw) / rad : dRaw - rad + kink;
}

function valueAt(v: unknown, i: number): unknown {
  return isArrayLike(v) && typeof v !== 'string' ? (v as ArrayLike<unknown>)[i] : v;
}

function stringAt(v: unknown, i: number): string | undefined {
  const s = valueAt(v, i);
  return s === undefined || s === null || s === '' ? undefined : String(s);
}

interface ColorLookup {
  (i: number): string | undefined;
}

/** Per-trace hover colors (the marker color of each sample, colorscale-mapped when numeric). */
const colorCache = new WeakMap<FullTrace, ColorLookup>();

function colorLookup(trace: FullTrace, ctx: HoverContext): ColorLookup {
  let lookup = colorCache.get(trace);
  if (lookup) return lookup;
  const style = markerStyle(trace, { fullLayout: ctx.fullLayout });
  const scale = style.colorscale;
  const values = style.colorValues;
  if (scale && values) {
    const [lo, hi] = resolveColorDomain(style.cmin ?? 0, style.cmax ?? 1, style.cmid ?? null);
    const reverse = style.reversescale === true;
    lookup = (i) => {
      const t = colorscaleT(values[i] ?? NaN, lo, hi, reverse);
      return Number.isNaN(t) ? undefined : rgbaToCss(sampleColorscale(scale, t));
    };
  } else {
    const color = (trace['marker'] as { color?: unknown } | undefined)?.color;
    lookup = (i) => stringAt(color, i);
  }
  colorCache.set(trace, lookup);
  return lookup;
}

/** The label name of a dimension: its label, else its axis id. */
function dimensionName(trace: FullTrace, i: number, axisId: string): string {
  const label = dimensionsOf(trace)[i]?.label;
  return typeof label === 'string' && label !== '' ? label : axisId;
}

function hoverFlags(trace: FullTrace): Set<string> {
  const v = trace['hoverinfo'];
  const s = typeof v === 'string' && v !== '' ? v : 'all';
  return s === 'all' ? new Set(['x', 'y', 'z', 'text', 'name']) : new Set(s.split('+'));
}

/** The splom module's `hoverPoints`: the sample nearest the pointer in the hovered cell. */
export function splomHoverPoints(
  calc: SplomCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const cell = cellColumns(calc, trace, ctx);
  if (!cell || calc.length === 0) return [];
  const t = ctx.transform;
  const sx = Math.abs(t.scaleX) || 1;
  const sy = Math.abs(t.scaleY) || 1;
  const { x, y } = cell;
  let best = -1;
  let bestD = Infinity;
  let bestD2 = Infinity;
  for (let i = 0; i < calc.length; i++) {
    const xv = x[i]!;
    const yv = y[i]!;
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
    const dx = Math.abs(xv - query.xl) * sx;
    const dy = Math.abs(yv - query.yl) * sy;
    let d: number;
    let d2: number;
    if (query.mode === 'closest') {
      d2 = Math.hypot(dx, dy);
      d = closestDistance(d2, radiusAt(calc, i));
    } else {
      const along = query.mode === 'x' ? dx : dy;
      d = axisDistance(along, radiusAt(calc, i));
      d2 = query.mode === 'x' ? dy : dx;
    }
    if (d < bestD || (d === bestD && d2 < bestD2)) {
      best = i;
      bestD = d;
      bestD2 = d2;
    }
  }
  if (best < 0 || bestD > query.distance) return [];
  const i = best;
  const dims = dimensionsOf(trace);
  const xValue = valueAt(dims[cell.xi]?.values, i);
  const yValue = valueAt(dims[cell.yi]?.values, i);
  const text = stringAt(trace['hovertext'], i) ?? stringAt(trace['text'], i);
  const flags = hoverFlags(trace);
  const lines: string[] = [];
  if (flags.has('x') && ctx.xaxis) {
    lines.push(
      `${dimensionName(trace, cell.xi, ctx.xaxis.id)}: ${formatAxisValue(ctx.xaxis, x[i]!)}`,
    );
  }
  if (flags.has('y') && ctx.yaxis) {
    lines.push(
      `${dimensionName(trace, cell.yi, ctx.yaxis.id)}: ${formatAxisValue(ctx.yaxis, y[i]!)}`,
    );
  }
  if (flags.has('text') && text !== undefined) lines.push(text);
  const marker = trace['marker'] as Record<string, unknown> | undefined;
  const fields: Record<string, unknown> = {
    'marker.size': valueAt(marker?.['size'], i),
    'marker.color': valueAt(marker?.['color'], i),
    'marker.symbol': valueAt(marker?.['symbol'], i),
  };
  if (trace['customdata'] !== undefined) fields['customdata'] = valueAt(trace['customdata'], i);
  if (trace['ids'] !== undefined) fields['id'] = valueAt(trace['ids'], i);
  const color = colorLookup(trace, ctx)(i);
  return [
    {
      pointIndex: i,
      distance: bestD,
      px: x[i]! * t.scaleX + t.offsetX,
      py: y[i]! * t.scaleY + t.offsetY,
      x: xValue,
      y: yValue,
      ...(text !== undefined ? { text } : {}),
      ...(color !== undefined ? { color } : {}),
      // An empty label (hoverinfo without x, y and text) leaves only the name.
      hoverText: lines.join('<br>'),
      fields,
    },
  ];
}

/** The splom module's `selectPoints`: samples inside the box or lasso of the cell. */
export function splomSelectPoints(
  calc: SplomCalc,
  trace: FullTrace,
  query: SelectionQuery,
  ctx: HoverContext,
): number[] {
  const cell = cellColumns(calc, trace, ctx);
  if (!cell) return [];
  const out: number[] = [];
  const { x, y } = cell;
  for (let i = 0; i < calc.length; i++) {
    const xv = x[i]!;
    const yv = y[i]!;
    if (Number.isFinite(xv) && Number.isFinite(yv) && selectionContains(query, xv, yv)) out.push(i);
  }
  return out;
}
