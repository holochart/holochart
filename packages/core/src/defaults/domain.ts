/**
 * Defaults of the `domain` attributes of domain traces (plan E4.5), Plotly's `plots/domain.js`
 * `defaults`: `domain.row` / `domain.column` pick a `layout.grid` cell (only with a grid, and only
 * inside it), whose extent becomes the default `domain.x` / `domain.y`; an empty or reversed
 * extent falls back to that default. Unlike Plotly, a row / column outside the grid is kept (and
 * ignored) rather than deleted: deleting it would default it to 0 on the next pass, so the output
 * would not be a fixed point.
 */
import type { TraceDefaultsContext } from '../registry/types.ts';
import type { FullLayout } from './types.ts';

/** A cell extent `[start, end]` in plot-area fractions. */
export type DomainRange = [number, number];

/** What domain defaults read from `fullLayout.grid` (see `defaults/grid.ts`). */
interface GridCells {
  rows: number;
  columns: number;
  /** Cell extents per column (`x`) and per row (`y`, already in `roworder`). */
  _domains: { x: readonly DomainRange[]; y: readonly DomainRange[] };
}

function gridOf(fullLayout: FullLayout): GridCells | undefined {
  const grid = fullLayout['grid'] as Partial<GridCells> | undefined;
  return grid && grid._domains && typeof grid.rows === 'number' && typeof grid.columns === 'number'
    ? (grid as GridCells)
    : undefined;
}

function valid(v: unknown): v is DomainRange {
  return (
    Array.isArray(v) &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    v[0] < v[1]
  );
}

/**
 * Coerce `domain.{row, column, x, y}` of a domain trace into `traceOut` (supply-defaults does it
 * for every trace in the `domain` category, before the module's own defaults).
 */
export function supplyDomainDefaults(
  traceOut: Record<string, unknown>,
  ctx: Pick<TraceDefaultsContext, 'coerce'>,
  fullLayout: FullLayout,
): void {
  let dfltX: DomainRange = [0, 1];
  let dfltY: DomainRange = [0, 1];
  const grid = gridOf(fullLayout);
  const container = (): Record<string, unknown> => {
    const d = traceOut['domain'];
    if (d !== null && typeof d === 'object') return d as Record<string, unknown>;
    const created: Record<string, unknown> = {};
    traceOut['domain'] = created;
    return created;
  };
  if (grid) {
    const column = ctx.coerce<number | undefined>('domain.column');
    if (column !== undefined) {
      const cell = column < grid.columns ? grid._domains.x[column] : undefined;
      if (cell) dfltX = [cell[0], cell[1]];
    }
    const row = ctx.coerce<number | undefined>('domain.row');
    if (row !== undefined) {
      const cell = row < grid.rows ? grid._domains.y[row] : undefined;
      if (cell) dfltY = [cell[0], cell[1]];
    }
  }
  const x = ctx.coerce<unknown>('domain.x', dfltX);
  const y = ctx.coerce<unknown>('domain.y', dfltY);
  // Don't accept empty or reversed extents (Plotly).
  if (!valid(x)) container()['x'] = [...dfltX];
  if (!valid(y)) container()['y'] = [...dfltY];
}
