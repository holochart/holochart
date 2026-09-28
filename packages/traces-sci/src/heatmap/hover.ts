/**
 * Heatmap hover (plan E11.1, E6.1; ADR-010: CPU), following plotly.js `heatmap/hover.js`: the
 * cell under the pointer (bisecting the edges, O(log n)), labelled `x: …`, `y: …`, `z: …` with its
 * center (the given `x` / `y`, or the middle of the cell) and value. Gaps get a label with an
 * empty `z` unless `hoverongaps` is off. `text` / `hovertext` / `customdata` are read per cell as
 * 2D arrays (`HoverPoint.cell`) at the cell's `[row, column]` in `z` — which follows the value when
 * a category axis re-orders the grid (plotly.js reads the grid position there) and is not
 * transposed with `transpose` (as in plotly.js); with column data, per point.
 *
 * Heatmaps report the largest hover distance, so markers or lines drawn over them win the
 * `closest` hover (Plotly's `maxHoverDistance`).
 */
import { localeOf, type FullTrace } from '@mk7s/holochart-core';
import { heatmapAxisCell } from '@mk7s/holochart-render';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import {
  axisHoverText,
  cellColor,
  dataValue,
  zColorMapping,
  zText,
  type ZColorMapping,
} from '@mk7s/holochart-traces-stats';
import { heatmapLookupAxes, heatmapSmoothing, sourceCell, type HeatmapCalc } from './calc.ts';

/** The cell index of linear coordinate `l` on a lookup axis, or −1 outside the grid. */
function cellAt(axis: ReturnType<typeof heatmapLookupAxes>[0], l: number): number {
  if (!axis) return -1;
  const a = axis.dir * (l - axis.origin);
  if (!(a >= 0 && a <= axis.extent)) return -1;
  return heatmapAxisCell(axis, a);
}

/** The column and row under linear coordinates `(xl, yl)`, or undefined outside the grid. */
export function heatmapCellAt(
  calc: HeatmapCalc,
  xl: number,
  yl: number,
): { i: number; j: number } | undefined {
  const [xa, ya] = heatmapLookupAxes(calc);
  const i = cellAt(xa, xl);
  const j = cellAt(ya, yl);
  return i < 0 || j < 0 ? undefined : { i, j };
}

function hoverFlags(trace: FullTrace): Set<string> {
  const v = trace['hoverinfo'];
  const s = typeof v === 'string' && v !== '' ? v : 'all';
  if (s === 'all') return new Set(['x', 'y', 'z', 'text', 'name']);
  return new Set(s.split('+'));
}

/** A 2D per-cell attribute at `[row][column]` (undefined unless 2D). */
export function cellValue(v: unknown, j: number, i: number): unknown {
  if (!Array.isArray(v) && !ArrayBuffer.isView(v)) return undefined;
  const row = (v as ArrayLike<unknown>)[j];
  return Array.isArray(row) || ArrayBuffer.isView(row) ? (row as ArrayLike<unknown>)[i] : undefined;
}

/** The text of a cell: `hovertext` or `text` (2D, or per point with column data). */
export function cellText(
  calc: HeatmapCalc,
  trace: FullTrace,
  key: 'text' | 'hovertext',
  i: number,
  j: number,
): unknown {
  const v = trace[key];
  if (calc.pointOf) {
    const p = calc.pointOf[j * calc.nx + i]!;
    return p >= 0 && (Array.isArray(v) || ArrayBuffer.isView(v))
      ? (v as ArrayLike<unknown>)[p]
      : undefined;
  }
  const [r, c] = sourceCell(calc, i, j);
  return cellValue(v, r, c);
}

/** The hover point of cell `(i, j)`. */
export function heatmapCellHoverPoint(
  calc: HeatmapCalc,
  trace: FullTrace,
  i: number,
  j: number,
  distance: number,
  ctx: Pick<HoverContext, 'transform' | 'xaxis' | 'yaxis'>,
  mapping: ZColorMapping,
): HoverPoint {
  const t = ctx.transform;
  const k = j * calc.nx + i;
  const z = calc.z[k]!;
  const xl = calc.x.centers[i]!;
  const yl = calc.y.centers[j]!;
  const xLabel = axisHoverText(ctx.xaxis, xl, trace['xhoverformat']);
  const yLabel = axisHoverText(ctx.yaxis, yl, trace['yhoverformat']);
  const zLabel = zText(z, trace['zhoverformat'], localeOf((ctx.xaxis ?? ctx.yaxis)?.full));
  const flags = hoverFlags(trace);
  const lines: string[] = [];
  if (flags.has('x')) lines.push(`x: ${xLabel}`);
  if (flags.has('y')) lines.push(`y: ${yLabel}`);
  if (flags.has('z')) lines.push(`z: ${zLabel}`);
  const hovertext = cellText(calc, trace, 'hovertext', i, j);
  const text = hovertext ?? cellText(calc, trace, 'text', i, j);
  const textLine = text === undefined || text === null ? '' : String(text);
  if (flags.has('text') && textLine !== '') lines.push(textLine);
  // The label sits at the cell's center, or at its given coordinate when smoothing (Plotly).
  const e = calc.x.edges;
  const f = calc.y.edges;
  const smooth = (calc.smoothing ?? heatmapSmoothing(trace, calc)) !== false;
  const ax = smooth ? xl : (e[i]! + e[i + 1]!) / 2;
  const ay = smooth ? yl : (f[j]! + f[j + 1]!) / 2;
  const color = cellColor(z, mapping);
  // Column data: the point placed in the cell; 2D z (or an empty cell): `[row, column]`.
  const point = calc.pointOf ? calc.pointOf[k]! : -1;
  return {
    pointIndex: point >= 0 ? point : k,
    ...(point >= 0 ? {} : { cell: sourceCell(calc, i, j) }),
    distance,
    px: ax * t.scaleX + t.offsetX,
    py: ay * t.scaleY + t.offsetY,
    x: dataValue(ctx.xaxis, xl),
    y: dataValue(ctx.yaxis, yl),
    ...(textLine !== '' ? { text: textLine } : {}),
    ...(color ? { color } : {}),
    fields: { z: Number.isFinite(z) ? z : undefined },
    labels: { x: xLabel, y: yLabel, z: zLabel },
    hoverText: lines.join('<br>'),
  };
}

/** Hover points of a heatmap: the cell under the pointer, if any. */
export function heatmapHoverPoints(
  calc: HeatmapCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const cell = heatmapCellAt(calc, query.xl, query.yl);
  if (!cell) return [];
  const z = calc.z[cell.j * calc.nx + cell.i]!;
  if (!Number.isFinite(z) && trace['hoverongaps'] === false) return [];
  const distance = Number.isFinite(query.distance) ? query.distance : Number.MAX_VALUE;
  const mapping = zColorMapping(trace, ctx.fullLayout, calc.zExtent);
  return [heatmapCellHoverPoint(calc, trace, cell.i, cell.j, distance, ctx, mapping)];
}
