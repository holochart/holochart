/**
 * `layout.grid` defaults (plan E4.4; Plotly's `plots/grid.js` and the grid part of
 * `cartesian/position_defaults.js`), in two phases:
 *
 * 1. {@link supplyGridSizing} — before trace defaults, so domain traces can resolve
 *    `domain.row` / `domain.column`: rows, columns, gaps and the cell extents (`_domains`).
 * 2. {@link gridAxisOverrides} — after cartesian subplot discovery, since cells only hold subplots
 *    and axes that exist: the cell contents (`subplots` or `xaxes`/`yaxes`), which column/row each
 *    axis is in (`_axisMap`), its default anchor (`_anchors`), and from those the axis `domain`,
 *    `anchor`, `side` and `position` defaults. They are only defaults: values on the axis win.
 *
 * Deviations from Plotly, both to keep supply-defaults a fixed point or correct:
 *
 * - `pattern` is always coerced (Plotly only coerces it without `subplots`/`xaxes`/`yaxes`), so
 *   the full output fed back in makes the same grid.
 * - A grid-edge axis (`xside: 'bottom'`, …) is placed at the grid edge across it — `position`
 *   comes from `grid.domain.y` for x axes and `grid.domain.x` for y axes. (Plotly reads the axis'
 *   own letter, which only agrees for the default `domain`.)
 */
import type { Subplots } from './types.ts';
import { MAX_GRID_CELLS_PER_SIDE } from '../layout/grid.ts';
import type { AttrSpec, ObjectNode } from '../schema/types.ts';
import { isPlainObject } from '../util/objects.ts';
import { coerceContainer, resolveWithTemplate } from './container.ts';
import type { FullGrid, FullLayout } from './types.ts';

/** A cell extent `[start, end]` in plot-area fractions. */
type Extent = [number, number];

/** The (validated) cell-content arrays of the input, kept between the two phases. */
interface GridContentInput {
  subplots: unknown[] | undefined;
  xaxes: unknown[] | undefined;
  yaxes: unknown[] | undefined;
  /** `pattern: 'independent'` without any of the arrays: cells get `'xy'`, `'x2y2'`, …. */
  defaultIds: boolean;
}

const contentInputs = new WeakMap<FullGrid, GridContentInput>();

/** Keys filled by {@link gridAxisOverrides} from what exists, not coerced from the input. */
const CONTENT_KEYS: ReadonlySet<string> = new Set(['subplots', 'xaxes', 'yaxes']);

function isExtent(v: unknown): v is Extent {
  return (
    Array.isArray(v) &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    v[0] < v[1]
  );
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_GRID_CELLS_PER_SIDE;
}

/**
 * Cell extents along one direction: `len` cells separated by `gap` (a fraction of one cell step),
 * filling `[d0, d1]`; with `reversed`, cell 0 is the last one (top row for `top to bottom`).
 */
export function gridCellExtents(
  domain: readonly [number, number],
  gap: number,
  len: number,
  reversed = false,
): Extent[] {
  const [d0, d1] = domain;
  const out: Extent[] = new Array<Extent>(len);
  // One cell fills the domain whatever the gap (and `len - gap` would be 0 for a gap of 1).
  const step = len === 1 ? d1 - d0 : (d1 - d0) / (len - gap);
  const size = len === 1 ? d1 - d0 : step * (1 - gap);
  for (let i = 0; i < len; i++) {
    // Rounding may push the last cell a hair past `d1` (and past 1, making axis domains invalid).
    const start = Math.min(d0 + step * i, d1);
    out[reversed ? len - 1 - i : i] = [start, Math.min(start + size, d1)];
  }
  return out;
}

/**
 * Grid sizing (phase 1): coerce `layout.grid` (without its cell contents) into
 * `fullLayout.grid` with `_domains` and `_hasSubplotGrid`, or leave `fullLayout.grid` unset when
 * there is no grid of more than one cell. Runs before trace defaults.
 */
export function supplyGridSizing(
  layoutIn: Readonly<Record<string, unknown>>,
  fullLayout: FullLayout,
  templateLayout: Record<string, unknown> | undefined,
  layoutSchema: ObjectNode,
): void {
  delete fullLayout.grid;
  const gridIn = layoutIn['grid'];
  const node = layoutSchema.children['grid'];
  // Plotly only makes a grid the user asked for; a template grid alone does not.
  if (!isPlainObject(gridIn) || node?.kind !== 'object') return;
  const tmpl = isPlainObject(templateLayout?.['grid']) ? templateLayout['grid'] : undefined;
  const resolve = (key: string, dflt?: unknown): unknown => {
    const spec = node.children[key] as AttrSpec;
    return resolveWithTemplate(spec, gridIn[key], tmpl?.[key], dflt ?? spec.dflt);
  };

  // Cell contents name specific subplots and axes, so (as in Plotly) only the user's arrays count,
  // not a template's. The full output holds the contents found, so it is a fixed point either way.
  const userArray = (key: string): unknown[] | undefined =>
    arrayOrUndefined(
      resolveWithTemplate(node.children[key] as AttrSpec, gridIn[key], undefined, undefined),
    );
  const content: GridContentInput = {
    subplots: userArray('subplots'),
    xaxes: userArray('xaxes'),
    yaxes: userArray('yaxes'),
    defaultIds: false,
  };
  const firstRow = content.subplots?.[0];
  let hasSubplotGrid = content.subplots !== undefined && Array.isArray(firstRow);
  const dfltRows = hasSubplotGrid ? content.subplots?.length : content.yaxes?.length;
  const dfltColumns = hasSubplotGrid
    ? (firstRow as unknown[] | undefined)?.length
    : content.xaxes?.length;
  const rows = resolve('rows', dfltRows);
  const columns = resolve('columns', dfltColumns);
  if (!isCount(rows) || !isCount(columns) || !(rows * columns > 1)) return;

  if (!hasSubplotGrid && !content.xaxes && !content.yaxes) {
    content.defaultIds = resolve('pattern') === 'independent';
    hasSubplotGrid = content.defaultIds;
  }

  const grid = coerceContainer(
    node,
    gridIn,
    {},
    {
      template: tmpl,
      skip: CONTENT_KEYS,
      overrides: {
        rows,
        columns,
        xgap: hasSubplotGrid ? 0.2 : 0.1,
        ygap: hasSubplotGrid ? 0.3 : 0.1,
      },
    },
  ) as unknown as FullGrid;
  // Empty or reversed extents would give empty or inside-out cells.
  if (!isExtent(grid.domain.x)) grid.domain.x = [0, 1];
  if (!isExtent(grid.domain.y)) grid.domain.y = [0, 1];

  grid._hasSubplotGrid = hasSubplotGrid;
  grid._domains = {
    x: gridCellExtents(grid.domain.x, grid.xgap as number, columns),
    y: gridCellExtents(grid.domain.y, grid.ygap as number, rows, grid.roworder === 'top to bottom'),
  };
  contentInputs.set(grid, content);
  fullLayout.grid = grid;
}

function arrayOrUndefined(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? v : undefined;
}

/** Split a cartesian subplot id (`'x2y3'`) into its axis ids. */
function splitXY(id: string): [string, string] {
  const at = id.indexOf('y');
  return [id.slice(0, at), id.slice(at)];
}

/** The cells of a grid of independent subplots: one subplot per cell, or `''`. */
function fillSubplotCells(
  grid: FullGrid,
  input: GridContentInput,
  subplots: Subplots,
  axisMap: Map<string, number>,
): string[][] {
  const out: string[][] = [];
  let index = 1;
  for (let i = 0; i < grid.rows; i++) {
    const rowIn = input.subplots?.[i];
    const row: string[] = [];
    out.push(row);
    for (let j = 0; j < grid.columns; j++) {
      const id = input.defaultIds
        ? index === 1
          ? 'xy'
          : `x${index}y${index}`
        : Array.isArray(rowIn)
          ? rowIn[j]
          : undefined;
      index++;
      row.push('');
      if (typeof id !== 'string' || !subplots.cartesian.includes(id)) continue;
      const [x, y] = splitXY(id);
      // An axis spans one column (x) or one row (y): a subplot reusing it elsewhere is dropped.
      const xAt = axisMap.get(x);
      const yAt = axisMap.get(y);
      if ((xAt !== undefined && xAt !== j) || (yAt !== undefined && yAt !== i)) continue;
      row[j] = id;
      axisMap.set(x, j);
      axisMap.set(y, i);
    }
  }
  return out;
}

/** The x axes of the columns (or y axes of the rows) of a coupled grid. */
function fillGridAxes(
  axesIn: unknown[] | undefined,
  allowed: readonly string[],
  len: number,
  axisMap: Map<string, number>,
  letter: 'x' | 'y',
): string[] {
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const id = axesIn ? axesIn[i] : i === 0 ? letter : `${letter}${i + 1}`;
    if (typeof id === 'string' && allowed.includes(id) && !axisMap.has(id)) {
      out.push(id);
      axisMap.set(id, i);
    } else {
      out.push('');
    }
  }
  return out;
}

/** The default anchor of each axis in the grid (Plotly's `contentDefaults`). */
function gridAnchors(
  grid: FullGrid,
  subplots: Subplots,
  axisMap: ReadonlyMap<string, number>,
): Map<string, string> {
  const anchors = new Map<string, string>();
  const reversed = grid.roworder === 'top to bottom';
  const cells = grid.subplots;
  for (const [id, at] of axisMap) {
    const letter = id.charAt(0);
    const side = letter === 'x' ? grid.xside : grid.yside;
    // Grid-edge sides (`bottom`, `left`, …) make free axes: that cell may hold no subplot.
    if (!side.endsWith(' plot')) {
      anchors.set(id, 'free');
      continue;
    }
    if (letter === 'x') {
      // Walk the rows of this column from the requested side (row 0 is on top when reversed).
      const fromFirst = side.startsWith('t') === reversed;
      for (let k = 0; k < grid.rows; k++) {
        const i = fromFirst ? k : grid.rows - 1 - k;
        let y: string | undefined;
        if (cells) {
          const cell = cells[i]?.[at];
          if (cell && splitXY(cell)[0] === id) y = splitXY(cell)[1];
        } else {
          const yId = grid.yaxes?.[i];
          if (yId && subplots.cartesian.includes(id + yId)) y = yId;
        }
        if (y !== undefined) {
          anchors.set(id, y);
          break;
        }
      }
    } else {
      const fromFirst = side.startsWith('l');
      for (let k = 0; k < grid.columns; k++) {
        const j = fromFirst ? k : grid.columns - 1 - k;
        let x: string | undefined;
        if (cells) {
          const cell = cells[at]?.[j];
          if (cell && splitXY(cell)[1] === id) x = splitXY(cell)[0];
        } else {
          const xId = grid.xaxes?.[j];
          if (xId && subplots.cartesian.includes(xId + id)) x = xId;
        }
        if (x !== undefined) {
          anchors.set(id, x);
          break;
        }
      }
    }
  }
  return anchors;
}

/**
 * Grid contents (phase 2): fill `fullLayout.grid.subplots` (grid of independent subplots) or
 * `xaxes`/`yaxes` from the discovered cartesian subplots, record `_axisMap` and `_anchors`, and
 * return the axis defaults the grid implies, keyed by axis id (`'x2'`), as `coerceContainer`
 * overrides: `domain` (the cell extent of the axis' column or row), `anchor`, `side` (the first
 * word of `xside`/`yside`) and `position` (the grid edge, for free axes). Empty without a grid.
 */
export function gridAxisOverrides(
  fullLayout: FullLayout,
  subplots: Subplots,
): Map<string, Record<string, unknown>> {
  const overrides = new Map<string, Record<string, unknown>>();
  const grid = fullLayout.grid;
  const input = grid && contentInputs.get(grid);
  if (!grid || !input) return overrides;

  const axisMap = new Map<string, number>();
  if (grid._hasSubplotGrid) {
    grid.subplots = fillSubplotCells(grid, input, subplots, axisMap);
  } else {
    grid.xaxes = fillGridAxes(input.xaxes, subplots.xaxis, grid.columns, axisMap, 'x');
    grid.yaxes = fillGridAxes(input.yaxes, subplots.yaxis, grid.rows, axisMap, 'y');
  }
  const anchors = gridAnchors(grid, subplots, axisMap);
  grid._axisMap = Object.fromEntries(axisMap);
  grid._anchors = Object.fromEntries(anchors);

  for (const [id, at] of axisMap) {
    const letter = id.charAt(0) === 'x' ? 'x' : 'y';
    const cell = grid._domains[letter][at];
    if (!cell) continue;
    const side = (letter === 'x' ? grid.xside : grid.yside).split(' ')[0] as string;
    const across = letter === 'x' ? grid.domain.y : grid.domain.x;
    const o: Record<string, unknown> = {
      domain: [cell[0], cell[1]],
      side,
      position: across[side === 'top' || side === 'right' ? 1 : 0],
    };
    const anchor = anchors.get(id);
    if (anchor !== undefined) o['anchor'] = anchor;
    overrides.set(id, o);
  }
  return overrides;
}
