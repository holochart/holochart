/**
 * `splom` supply-defaults (plan E10.9), following plotly.js' `splom/defaults.js`:
 *
 * - dimensions are coerced as an item array; one without `values` is hidden;
 * - a trace with no sample, or with the diagonal and both halves hidden, is not drawn;
 * - `xaxes` / `yaxes` default to `x`, `x2`, … / `y`, `y2`, …, one per dimension;
 * - with the diagonal and one half hidden, the first (upper half) or last (lower half) dimension
 *   has no column / row: its cells would all be empty (Plotly's `mustShiftX` / `mustShiftY`);
 * - every drawn cell becomes a cartesian subplot and every dimension axis gets its defaults
 *   (title = label, type, `matches`) through core's splom stash, which also lays the axes out as
 *   a grid (`defaults/splom-axes.ts` in core).
 *
 * Private trace keys: `_length` (sample count), `_diag` (`[xaxis, yaxis]` per dimension, either
 * `undefined` when the dimension has no column / row), `_axesDim` (axis id → dimension index) and
 * `_cells` (the drawn cells as `{ xaxis, yaxis, x, y }` with dimension indices).
 */
import {
  coerceItems,
  getIn,
  isArrayLike,
  stashSplomAxis,
  stashSplomGridSides,
  stashSplomSubplot,
  type FullLayout,
  type FullTrace,
  type ItemsNode,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { supplyColorscaleDefaults } from '@mk7s/holochart-traces-basic';
import { splomAttributes } from './attributes.ts';

/** A drawn cell: its axes and the dimensions along x (column) and y (row). */
export interface SplomCell {
  readonly xaxis: string;
  readonly yaxis: string;
  /** Dimension index along x. */
  readonly x: number;
  /** Dimension index along y. */
  readonly y: number;
}

/** A defaulted dimension. */
export interface FullDimension {
  visible: boolean;
  label?: string;
  values?: ArrayLike<unknown>;
  axis?: { type?: string; matches?: boolean };
  _index: number;
}

/** Plotly's `Color.defaultLine` (marker outlines) and `Color.background` (bubble outlines). */
const DEFAULT_LINE = '#444';
const BACKGROUND = '#fff';

function objectAt(v: unknown, key: string): Readonly<Record<string, unknown>> | undefined {
  const c = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;
  return c !== null && typeof c === 'object' && !Array.isArray(c)
    ? (c as Record<string, unknown>)
    : undefined;
}

function isNumeric(v: unknown): boolean {
  return (
    (typeof v === 'number' && Number.isFinite(v)) ||
    (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))
  );
}

/** Plotly's `hasColorscale(trace, 'marker')` on the user's container. */
function hasColorscale(container: Readonly<Record<string, unknown>> | undefined): boolean {
  if (!container) return false;
  const color = container['color'];
  if (isArrayLike(color)) {
    for (let i = 0; i < color.length; i++) if (isNumeric(color[i])) return true;
  }
  return (
    container['showscale'] === true ||
    (isNumeric(container['cmin']) && isNumeric(container['cmax'])) ||
    container['colorscale'] !== undefined ||
    objectAt(container, 'colorbar') !== undefined
  );
}

function isOpenSymbol(symbol: unknown): boolean {
  if (typeof symbol === 'number') return Math.floor(symbol / 100) % 2 === 1;
  return typeof symbol === 'string' && symbol.includes('-open');
}

/** The dimensions (defaulted) of a full splom trace. */
export function dimensionsOf(trace: FullTrace): readonly FullDimension[] {
  const d = trace['dimensions'];
  return Array.isArray(d) ? (d as FullDimension[]) : [];
}

/** The drawn cells of a full splom trace. */
export function cellsOf(trace: FullTrace): readonly SplomCell[] {
  const c = trace['_cells'];
  return Array.isArray(c) ? (c as SplomCell[]) : [];
}

/** Dimension index of axis `id` in a full splom trace, or `undefined`. */
export function dimensionOfAxis(trace: FullTrace, id: string): number | undefined {
  const map = trace['_axesDim'] as Record<string, number> | undefined;
  return map ? map[id] : undefined;
}

/** Plotly's `handleMarkerDefaults` for splom (no `mode`: markers are always drawn). */
function markerDefaults(traceIn: Readonly<Record<string, unknown>>, ctx: TraceDefaultsContext) {
  const markerIn = objectAt(traceIn, 'marker');
  const bubble = isArrayLike(markerIn?.['size']);
  const symbol = ctx.coerce('marker.symbol');
  ctx.coerce('marker.opacity', bubble ? 0.7 : 1);
  ctx.coerce('marker.size');
  ctx.coerce('marker.angle');
  ctx.coerce('marker.color', ctx.defaultColor);
  if (hasColorscale(markerIn)) {
    supplyColorscaleDefaults(markerIn, ctx.coerce, 'marker.', { inTrace: true, showscale: true });
  }
  ctx.coerce('marker.line.color', bubble ? BACKGROUND : DEFAULT_LINE);
  const lineIn = objectAt(markerIn, 'line');
  if (hasColorscale(lineIn)) {
    supplyColorscaleDefaults(lineIn, ctx.coerce, 'marker.line.', {
      inTrace: true,
      showscale: false,
    });
  }
  ctx.coerce('marker.line.width', isOpenSymbol(symbol) || bubble ? 1 : 0);
  if (bubble) {
    ctx.coerce('marker.sizeref');
    ctx.coerce('marker.sizemin');
    ctx.coerce('marker.sizemode');
  }
  for (const which of ['selected', 'unselected']) {
    for (const key of ['color', 'size', 'opacity']) ctx.coerce(`${which}.marker.${key}`);
  }
}

/** Plotly's `handleAxisDefaults` (splom): axes of each dimension, drawn cells, layout stash. */
function axisDefaults(
  traceOut: FullTrace,
  dimensions: readonly FullDimension[],
  fullLayout: FullLayout,
  ctx: TraceDefaultsContext,
): void {
  const n = dimensions.length;
  const showUpper = traceOut['showupperhalf'] === true;
  const showLower = traceOut['showlowerhalf'] === true;
  const showDiag = (traceOut['diagonal'] as { visible?: unknown }).visible === true;

  const xDflt = Array.from({ length: n }, (_, i) => (i === 0 ? 'x' : `x${i + 1}`));
  const yDflt = Array.from({ length: n }, (_, i) => (i === 0 ? 'y' : `y${i + 1}`));
  const xaxes = ctx.coerce<unknown[]>('xaxes', xDflt);
  const yaxes = ctx.coerce<unknown[]>('yaxes', yDflt);
  const axisAt = (list: unknown[], dflt: string[], i: number): string => {
    const v = list[i];
    return typeof v === 'string' && v !== '' ? v : (dflt[i] as string);
  };

  // With the diagonal and a half hidden, the first / last dimension draws no column or row.
  const mustShiftX = !showDiag && !showLower;
  const mustShiftY = !showDiag && !showUpper;
  const diag: [string | undefined, string | undefined][] = [];
  const axesDim: Record<string, number> = {};
  const xList: { id: string; dim: number }[] = [];
  const yList: { id: string; dim: number }[] = [];

  for (let i = 0; i < n; i++) {
    const dim = dimensions[i] as FullDimension;
    const first = i === 0;
    const last = i === n - 1;
    const xa = (first && mustShiftX) || (last && mustShiftY) ? undefined : axisAt(xaxes, xDflt, i);
    const ya = (first && mustShiftY) || (last && mustShiftX) ? undefined : axisAt(yaxes, yDflt, i);
    diag.push([xa, ya]);
    for (const [id, other, list] of [
      [xa, ya, xList],
      [ya, xa, yList],
    ] as const) {
      if (id === undefined) continue;
      if (list.some((e) => e.id === id)) continue;
      list.push({ id, dim: i });
      axesDim[id] = i;
      const axis = dim.visible ? dim.axis : undefined;
      stashSplomAxis(fullLayout, id, {
        label: typeof dim.label === 'string' ? dim.label : '',
        ...(axis?.type !== undefined ? { type: axis.type } : {}),
        ...(axis?.matches === true && other !== undefined ? { matches: other } : {}),
        ...(dim.visible && dim.values ? { data: dim.values } : {}),
        trace: traceOut,
      });
    }
  }

  // Cells: column `i` (x axis) against row `j` (y axis), row 0 on top.
  const cells: SplomCell[] = [];
  for (let i = 0; i < xList.length; i++) {
    for (let j = 0; j < yList.length; j++) {
      const upper = i > j;
      const lower = i < j;
      const draw =
        (upper && showUpper) ||
        (lower && showLower) ||
        // With a half and the diagonal hidden, the axis lists are shifted by one dimension, so
        // the `i === j` cells are the hidden half's neighbors (Plotly).
        (i === j && (showDiag || !showLower || !showUpper));
      if (!draw) continue;
      const x = xList[i] as { id: string; dim: number };
      const y = yList[j] as { id: string; dim: number };
      stashSplomSubplot(fullLayout, x.id + y.id);
      cells.push({ xaxis: x.id, yaxis: y.id, x: x.dim, y: y.dim });
    }
  }
  // Keep the axes at the grid's bottom / left edges when the lower half, or just the diagonal, is
  // hidden (Plotly's `_splomGridDflt`).
  if (!showLower || (!showDiag && showUpper && showLower)) stashSplomGridSides(fullLayout);

  traceOut['_diag'] = diag;
  traceOut['_axesDim'] = axesDim;
  traceOut['_cells'] = cells;
}

/** The splom module's `supplyDefaults`. */
export function supplySplomDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const node = splomAttributes.children.dimensions as unknown as ItemsNode;
  const dimensions = coerceItems(
    node,
    traceIn['dimensions'],
    getIn(ctx.template, 'dimensions'),
    getIn(ctx.template, 'dimensiondefaults'),
  ) as unknown as FullDimension[];
  let length = Infinity;
  for (const dim of dimensions) {
    const values = dim.values;
    if (!isArrayLike(values) || values.length === 0) {
      dim.visible = false;
      continue;
    }
    if (dim.visible === false) continue;
    length = Math.min(length, values.length);
  }
  traceOut['dimensions'] = dimensions;

  const showDiag = ctx.coerce<boolean>('diagonal.visible');
  const showUpper = ctx.coerce<boolean>('showupperhalf');
  const showLower = ctx.coerce<boolean>('showlowerhalf');
  if (!Number.isFinite(length) || (!showDiag && !showUpper && !showLower)) {
    traceOut.visible = false;
    return;
  }
  traceOut['_length'] = length;

  ctx.coerce('text');
  markerDefaults(traceIn, ctx);
  axisDefaults(traceOut, dimensions, ctx.fullLayout, ctx);
}
