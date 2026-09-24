/**
 * `makeSubplots` (plan E4.4): a subplot grid computed up front, like Python's
 * `plotly.subplots.make_subplots`. Pure: it returns layout axes (and title annotations) to spread
 * into a figure's layout, plus a `place` helper that points a trace at a cell.
 *
 * Deviations from Python, until linked axes (`matches`, plan E3.9) exist:
 *
 * - Shared axes are ONE axis rather than several axes linked with `matches`. `sharedX` gives
 *   every `'xy'` cell of a column the same x axis, anchored to the bottom-most cell's y axis (so
 *   tick labels show only at the bottom, and zoom/pan ranges are shared because it is one axis);
 *   `sharedY` does the same per row, anchored to the left-most cell. One axis has one domain, so
 *   cells can only share when they have the same extent along it: a spanning cell in a shared
 *   column (row) keeps its own axis, and sharing x across a row (`sharedX: 'rows'`, or `'all'`
 *   over several columns; likewise for y) throws.
 * - Secondary y axes (`secondaryY`) overlay their cell's y axis, but zoom and pan do not move them
 *   together yet.
 * - Only `'xy'` and `'domain'` cells are supported; other subplot types throw an error naming the
 *   plan story that adds them.
 */

/** Subplot types a {@link SubplotSpec} can name. */
export type SubplotType =
  'xy' | 'domain' | 'scene' | 'polar' | 'ternary' | 'geo' | 'map' | 'mapbox' | 'smith';

/** The subplot types {@link makeSubplots} can build today. */
export type SupportedSubplotType = 'xy' | 'domain';

/** One cell of `specs`: the subplot in that cell (`null` for an empty cell). */
export interface SubplotSpec {
  /** Subplot type (default `'xy'`): cartesian axes, or a `domain` area for pie-like traces. */
  type?: SubplotType;
  /** Number of columns the subplot spans to the right (default 1). */
  colspan?: number;
  /** Number of rows the subplot spans, away from the start cell (default 1). */
  rowspan?: number;
  /** Add a secondary y axis on the right, overlaying the cell's y axis (`'xy'` only). */
  secondaryY?: boolean;
  /** Padding inside the cell, as plot-area fractions (default 0): left, right, top, bottom. */
  l?: number;
  r?: number;
  t?: number;
  b?: number;
}

/**
 * Axis sharing: `true` shares along the natural direction (x per column, y per row); `'columns'`,
 * `'rows'` and `'all'` name the group explicitly. See {@link makeSubplots} for the limits.
 */
export type SharedAxes = boolean | 'columns' | 'rows' | 'all';

/** Options for {@link makeSubplots}. Names follow Python's `make_subplots` in camelCase. */
export interface MakeSubplotsOptions {
  /** Number of rows (default 1). */
  rows?: number;
  /** Number of columns (default 1). */
  cols?: number;
  /** Share x axes (default `false`). */
  sharedX?: SharedAxes;
  /** Share y axes (default `false`). */
  sharedY?: SharedAxes;
  /** Where row 1, column 1 is: `'top-left'` (default) or `'bottom-left'`. */
  startCell?: 'top-left' | 'bottom-left';
  /** Per-cell specs, `rows × cols` (default: an `'xy'` subplot in every cell). */
  specs?: readonly (readonly (SubplotSpec | null | undefined)[])[];
  /** Relative row heights, one per row (default equal); row 1 first. */
  rowHeights?: readonly number[];
  /** Relative column widths, one per column (default equal). */
  columnWidths?: readonly number[];
  /**
   * Titles of the subplots in row-major order (row 1 first), skipping empty and spanned cells;
   * `''` or `null` leaves a subplot untitled.
   */
  subplotTitles?: readonly (string | null | undefined)[];
  /** Space between columns, as a plot-area fraction (default `0.2 / cols`). */
  horizontalSpacing?: number;
  /** Space between rows, as a plot-area fraction (default `0.3 / rows`). */
  verticalSpacing?: number;
}

/** An extent `[start, end]` in plot-area fractions. */
export type Extent = [number, number];

/** A subplot of the grid, as built by {@link makeSubplots}. */
export interface SubplotCell {
  /** 1-based row of the subplot's start cell. */
  row: number;
  /** 1-based column of the subplot's start cell. */
  col: number;
  rowspan: number;
  colspan: number;
  type: SupportedSubplotType;
  /** The subplot's area (padding included), as plot-area fractions. */
  domain: { x: Extent; y: Extent };
  /** X axis id (`'x'`, `'x2'`, …) of an `'xy'` subplot. */
  xaxis?: string;
  /** Y axis id of an `'xy'` subplot. */
  yaxis?: string;
  /** Id of the secondary y axis (`secondaryY: true`). */
  secondaryYaxis?: string;
}

/** Options for {@link MakeSubplotsResult.place}. */
export interface PlaceOptions {
  /** Target the cell's secondary y axis (the cell needs `secondaryY: true`). */
  secondaryY?: boolean;
}

/** What {@link MakeSubplotsResult.place} sets on a trace. */
export interface PlacedTrace {
  xaxis?: string;
  yaxis?: string;
  domain?: { x: Extent; y: Extent; [key: string]: unknown };
}

/** Result of {@link makeSubplots}. */
export interface MakeSubplotsResult {
  /**
   * Layout attributes to spread into the figure layout: `xaxis`, `yaxis2`, … (`domain`, `anchor`,
   * and `overlaying`/`side` for secondary y axes) and `annotations` for the subplot titles.
   */
  layout: Record<string, unknown>;
  /** The subplots by 1-based position: `cells[row - 1][col - 1]` (`null` if empty or spanned). */
  cells: (SubplotCell | null)[][];
  /**
   * A copy of `trace` placed in the subplot at `row`, `col` (1-based): `xaxis`/`yaxis` for an
   * `'xy'` cell, `domain.x`/`domain.y` for a `'domain'` cell. The input is not modified.
   */
  place<T extends object>(
    trace: T,
    row: number,
    col: number,
    options?: PlaceOptions,
  ): T & PlacedTrace;
}

/** Subplot types that exist in Plotly but not yet here, with the plan story that adds them. */
const UNSUPPORTED: Readonly<Record<string, string>> = {
  scene: 'milestone M6 (3D scenes, plan E14.1)',
  polar: 'milestone M4 (polar subplots, plan E11.4)',
  ternary: 'milestone M7 (ternary subplots, plan E11.6)',
  geo: 'milestone M8 (geo subplots, plan E15.1)',
  map: 'milestone M8 (tile maps, plan E15.5)',
  mapbox: 'milestone M8 (tile maps, plan E15.5)',
  smith: 'a later release (Smith charts are not in the plan yet)',
};

const PREFIX = 'makeSubplots';

function fail(message: string): never {
  throw new Error(`${PREFIX}: ${message}`);
}

function positiveInt(name: string, v: unknown, dflt: number): number {
  const n = v ?? dflt;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    fail(`${name} must be a positive integer (got ${String(v)}).`);
  }
  return n;
}

function weights(name: string, v: readonly number[] | undefined, len: number): number[] {
  if (v === undefined) return new Array<number>(len).fill(1);
  if (!Array.isArray(v) || v.length !== len) {
    fail(`${name} must have one entry per ${name === 'rowHeights' ? 'row' : 'column'} (${len}).`);
  }
  for (const w of v) {
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
      fail(`${name} entries must be positive numbers (got ${String(w)}).`);
    }
  }
  return [...v];
}

function spacing(name: string, v: number | undefined, dflt: number, len: number): number {
  const s = v ?? dflt;
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) {
    fail(`${name} must be a number >= 0 (got ${String(v)}).`);
  }
  if (len > 1 && s * (len - 1) >= 1) {
    fail(
      `${name} must be below 1 / (${name === 'horizontalSpacing' ? 'cols' : 'rows'} - 1) = ${1 / (len - 1)} (got ${s}).`,
    );
  }
  return s;
}

/** `[start, end]` of each band: `len` bands with relative `w` sizes and `gap` between them. */
function bands(w: readonly number[], gap: number): Extent[] {
  const total = w.reduce((a, b) => a + b, 0);
  const avail = 1 - gap * (w.length - 1);
  const out: Extent[] = [];
  let start = 0;
  for (const wi of w) {
    const size = (avail * wi) / total;
    out.push([start, start + size]);
    start += size + gap;
  }
  return out;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function padding(spec: SubplotSpec, key: 'l' | 'r' | 't' | 'b', where: string): number {
  const v = spec[key] ?? 0;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    fail(`${where}.${key} must be a finite number (got ${String(v)}).`);
  }
  return v;
}

function sharedMode(
  name: string,
  v: unknown,
  natural: 'columns' | 'rows',
): 'columns' | 'rows' | 'all' | undefined {
  if (v === undefined || v === false) return undefined;
  if (v === true) return natural;
  if (v === 'columns' || v === 'rows' || v === 'all') return v;
  return fail(`${name} must be true, false, 'columns', 'rows' or 'all' (got ${String(v)}).`);
}

function axisId(letter: 'x' | 'y', n: number): string {
  return n === 1 ? letter : `${letter}${n}`;
}

function axisKey(id: string): string {
  return `${id.charAt(0)}axis${id.slice(1)}`;
}

function sameExtent(a: Extent, b: Extent): boolean {
  return Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;
}

interface Group {
  extent: Extent;
  first: SubplotCell;
  /** The cell whose counter axis anchors this axis (bottom-most for x, left-most for y). */
  anchorCell: SubplotCell;
}

/**
 * Build a subplot grid like Python's `make_subplots`: axis domains, anchors and title annotations
 * for `rows × cols` cells, and a `place` helper for traces.
 *
 * Rows and columns are 1-based; row 1 is at the top (`startCell: 'top-left'`, the default) or at
 * the bottom (`'bottom-left'`). Axes are numbered in row-major order from row 1: each `'xy'` cell
 * gets the next `xN`/`yN` pair (a secondary y axis takes the next y id), with x anchored to its y
 * and y to its x. `specs` can span cells (`colspan`, `rowspan`; the covered cells must be `null`),
 * pad them (`l`, `r`, `t`, `b`), leave them empty (`null`) or make them `'domain'` cells.
 *
 * Shared axes are one axis, not Python's `matches`-linked axes (linked axes are plan E3.9):
 * `sharedX: true | 'columns'` gives each column one x axis, drawn under its bottom-most subplot;
 * `sharedY: true | 'rows'` gives each row one y axis, drawn left of its left-most subplot. Only
 * cells of the same extent along the shared axis can share it: a spanning cell in a shared column
 * (row) keeps its own axis, and `sharedX: 'rows'` / `sharedY: 'columns'`, or `'all'` over cells of
 * different extents, throw.
 *
 * @example
 * ```ts
 * const sp = makeSubplots({ rows: 2, cols: 2, sharedX: true, subplotTitles: ['A', 'B', 'C', 'D'] });
 * createChart(el, {
 *   data: [sp.place({ type: 'scatter', y: [1, 3, 2] }, 1, 1), sp.place({ type: 'bar', y: [2, 1] }, 2, 2)],
 *   layout: { ...sp.layout, title: { text: 'Four panels' } },
 * });
 * ```
 * @throws {Error} For invalid options (bad sizes, specs shape, overlapping spans, unknown or not yet
 * supported subplot types, impossible sharing), with a message naming the problem.
 */
export function makeSubplots(options: MakeSubplotsOptions = {}): MakeSubplotsResult {
  const rows = positiveInt('rows', options.rows, 1);
  const cols = positiveInt('cols', options.cols, 1);
  const startCell = options.startCell ?? 'top-left';
  if (startCell !== 'top-left' && startCell !== 'bottom-left') {
    fail(`startCell must be 'top-left' or 'bottom-left' (got ${String(startCell)}).`);
  }
  const hGap = spacing('horizontalSpacing', options.horizontalSpacing, 0.2 / cols, cols);
  const vGap = spacing('verticalSpacing', options.verticalSpacing, 0.3 / rows, rows);
  const colBands = bands(weights('columnWidths', options.columnWidths, cols), hGap);
  // Bands run bottom-up; row 1 is the top band unless the grid starts bottom-left.
  const rowWeights = weights('rowHeights', options.rowHeights, rows);
  const rowBands =
    startCell === 'top-left'
      ? bands([...rowWeights].reverse(), vGap).reverse()
      : bands(rowWeights, vGap);
  const sharedX = sharedMode('sharedX', options.sharedX, 'columns');
  const sharedY = sharedMode('sharedY', options.sharedY, 'rows');

  const specs = options.specs;
  if (specs !== undefined) {
    if (!Array.isArray(specs) || specs.length !== rows) {
      fail(
        `specs must be an array of ${rows} row(s) (got ${Array.isArray(specs) ? specs.length : String(specs)}).`,
      );
    }
    specs.forEach((row, i) => {
      if (!Array.isArray(row) || row.length !== cols) {
        fail(`specs[${i}] must be an array of ${cols} cell spec(s) (row ${i + 1}).`);
      }
    });
  }

  // Cells, row-major from row 1.
  const cells: (SubplotCell | null)[][] = Array.from({ length: rows }, () =>
    new Array<SubplotCell | null>(cols).fill(null),
  );
  /** Which subplot covers each position (spans included), as `row,col` of its start cell. */
  const owner: (string | undefined)[][] = Array.from({ length: rows }, () =>
    new Array<string | undefined>(cols).fill(undefined),
  );
  const secondary = new Set<SubplotCell>();
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const raw = specs ? specs[r - 1]?.[c - 1] : {};
      if (raw === null || raw === undefined) continue;
      const where = `specs[${r - 1}][${c - 1}] (row ${r}, col ${c})`;
      if (typeof raw !== 'object' || Array.isArray(raw))
        fail(`${where} must be an object or null.`);
      const spec = raw;
      const type = spec.type ?? 'xy';
      if (type !== 'xy' && type !== 'domain') {
        const when = UNSUPPORTED[type];
        if (when !== undefined) {
          fail(
            `${where}: '${type}' subplots are not supported until ${when}. Supported types: 'xy', 'domain'.`,
          );
        }
        fail(`${where}: unknown subplot type '${String(type)}'. Supported types: 'xy', 'domain'.`);
      }
      const colspan = positiveInt(`${where}.colspan`, spec.colspan, 1);
      const rowspan = positiveInt(`${where}.rowspan`, spec.rowspan, 1);
      if (c + colspan - 1 > cols) fail(`${where}: colspan ${colspan} runs past column ${cols}.`);
      if (r + rowspan - 1 > rows) fail(`${where}: rowspan ${rowspan} runs past row ${rows}.`);
      if (spec.secondaryY === true && type !== 'xy') {
        fail(`${where}: secondaryY needs an 'xy' subplot (got '${type}').`);
      }
      for (let rr = r; rr < r + rowspan; rr++) {
        for (let cc = c; cc < c + colspan; cc++) {
          const taken = owner[rr - 1]?.[cc - 1];
          if (taken !== undefined) {
            fail(
              `${where} overlaps the subplot at (row, col) = (${taken}): cells covered by a span must be null.`,
            );
          }
          if (specs && (rr !== r || cc !== c) && specs[rr - 1]?.[cc - 1]) {
            fail(
              `${where} spans (row ${rr}, col ${cc}), which has its own spec: cells covered by a span must be null.`,
            );
          }
          (owner[rr - 1] as (string | undefined)[])[cc - 1] = `${r}, ${c}`;
        }
      }
      const x0 = (colBands[c - 1] as Extent)[0] + padding(spec, 'l', where);
      const x1 = (colBands[c + colspan - 2] as Extent)[1] - padding(spec, 'r', where);
      const lastRow = rowBands[r + rowspan - 2] as Extent;
      const firstRow = rowBands[r - 1] as Extent;
      const y0 = Math.min(firstRow[0], lastRow[0]) + padding(spec, 'b', where);
      const y1 = Math.max(firstRow[1], lastRow[1]) - padding(spec, 't', where);
      if (!(x0 < x1) || !(y0 < y1)) fail(`${where}: the padding leaves no room for the subplot.`);
      const cell: SubplotCell = {
        row: r,
        col: c,
        rowspan,
        colspan,
        type,
        domain: { x: [clamp01(x0), clamp01(x1)], y: [clamp01(y0), clamp01(y1)] },
      };
      if (spec.secondaryY === true) secondary.add(cell);
      (cells[r - 1] as (SubplotCell | null)[])[c - 1] = cell;
    }
  }

  const xyCells = cells.flat().filter((c): c is SubplotCell => c !== null && c.type === 'xy');
  const xGroups = shareGroups('x', xyCells, sharedX);
  const yGroups = shareGroups('y', xyCells, sharedY);

  // Number the axes row-major; a shared axis takes its id from the first cell that uses it.
  const layout: Record<string, unknown> = {};
  const axes = new Map<Group, string>();
  let nx = 0;
  let ny = 0;
  const secondaries: [SubplotCell, string][] = [];
  for (const cell of xyCells) {
    const gx = xGroups.get(cell) as Group;
    const gy = yGroups.get(cell) as Group;
    if (!axes.has(gx)) axes.set(gx, axisId('x', ++nx));
    if (!axes.has(gy)) axes.set(gy, axisId('y', ++ny));
    cell.xaxis = axes.get(gx);
    cell.yaxis = axes.get(gy);
    if (secondary.has(cell)) {
      cell.secondaryYaxis = axisId('y', ++ny);
      secondaries.push([cell, cell.secondaryYaxis]);
    }
  }
  // Emit axes in id order (xaxis, xaxis2, …, yaxis, …), like Python's layout.
  const ordered = [...axes].sort(([, a], [, b]) => axisOrder(a) - axisOrder(b));
  for (const [group, id] of ordered) {
    const counter = id.charAt(0) === 'x' ? group.anchorCell.yaxis : group.anchorCell.xaxis;
    layout[axisKey(id)] = { domain: [...group.extent], anchor: counter };
  }
  for (const [cell, id] of secondaries) {
    layout[axisKey(id)] = { anchor: cell.xaxis, overlaying: cell.yaxis, side: 'right' };
  }
  const keys = Object.keys(layout).sort((a, b) => keyOrder(a) - keyOrder(b));
  const sortedLayout: Record<string, unknown> = {};
  for (const k of keys) sortedLayout[k] = layout[k];

  const titles = options.subplotTitles;
  if (titles !== undefined) {
    const subplotsInOrder = cells.flat().filter((c): c is SubplotCell => c !== null);
    if (!Array.isArray(titles)) fail('subplotTitles must be an array of strings.');
    if (titles.length > subplotsInOrder.length) {
      fail(`subplotTitles has ${titles.length} titles for ${subplotsInOrder.length} subplot(s).`);
    }
    const annotations: Record<string, unknown>[] = [];
    titles.forEach((text, i) => {
      if (text === null || text === undefined || text === '') return;
      const cell = subplotsInOrder[i] as SubplotCell;
      annotations.push({
        text: String(text),
        x: (cell.domain.x[0] + cell.domain.x[1]) / 2,
        y: cell.domain.y[1],
        xref: 'paper',
        yref: 'paper',
        xanchor: 'center',
        yanchor: 'bottom',
        showarrow: false,
        font: { size: 16 },
      });
    });
    if (annotations.length > 0) sortedLayout['annotations'] = annotations;
  }

  const place = <T extends object>(
    trace: T,
    row: number,
    col: number,
    opts: PlaceOptions = {},
  ): T & PlacedTrace => {
    if (!Number.isInteger(row) || row < 1 || row > rows) {
      fail(`place: row must be an integer from 1 to ${rows} (got ${String(row)}).`);
    }
    if (!Number.isInteger(col) || col < 1 || col > cols) {
      fail(`place: col must be an integer from 1 to ${cols} (got ${String(col)}).`);
    }
    const cell = cells[row - 1]?.[col - 1];
    if (!cell) {
      const by = owner[row - 1]?.[col - 1];
      fail(
        by === undefined
          ? `place: the cell at row ${row}, col ${col} is empty (its spec is null).`
          : `place: the cell at row ${row}, col ${col} is covered by the span of the subplot at (row, col) = (${by}); place the trace there.`,
      );
    }
    if (cell.type === 'domain') {
      if (opts.secondaryY === true) {
        fail(
          `place: the cell at row ${row}, col ${col} is a 'domain' subplot, which has no secondary y axis.`,
        );
      }
      const prev = (trace as { domain?: unknown }).domain;
      const base =
        prev !== null && typeof prev === 'object' ? (prev as Record<string, unknown>) : {};
      return {
        ...trace,
        domain: { ...base, x: [...cell.domain.x], y: [...cell.domain.y] },
      } as T & PlacedTrace;
    }
    if (opts.secondaryY === true && cell.secondaryYaxis === undefined) {
      fail(
        `place: the subplot at row ${row}, col ${col} has no secondary y axis (set secondaryY: true in its spec).`,
      );
    }
    return {
      ...trace,
      xaxis: cell.xaxis,
      yaxis: opts.secondaryY === true ? cell.secondaryYaxis : cell.yaxis,
    } as T & PlacedTrace;
  };

  return { layout: sortedLayout, cells, place };
}

function axisOrder(id: string): number {
  const n = id.length > 1 ? Number(id.slice(1)) : 1;
  return (id.charAt(0) === 'x' ? 0 : 1e6) + n;
}

function keyOrder(key: string): number {
  return axisOrder(`${key.charAt(0)}${key.slice(5)}`);
}

/**
 * Group the `'xy'` cells that share one `letter` axis. Without sharing every cell is its own
 * group; with it, all cells of a group must have the same extent along the axis.
 */
function shareGroups(
  letter: 'x' | 'y',
  xyCells: readonly SubplotCell[],
  mode: 'columns' | 'rows' | 'all' | undefined,
): Map<SubplotCell, Group> {
  const byCell = new Map<SubplotCell, Group>();
  const byKey = new Map<string, Group>();
  const option = letter === 'x' ? 'sharedX' : 'sharedY';
  for (const cell of xyCells) {
    const extent = cell.domain[letter];
    // Along the natural direction (x per column, y per row) a spanning cell simply gets its own
    // axis: a wide plot above two narrow ones is common, and nothing else could share it anyway.
    const natural = mode === (letter === 'x' ? 'columns' : 'rows');
    const key =
      mode === undefined
        ? `${cell.row},${cell.col}`
        : mode === 'all'
          ? 'all'
          : mode === 'columns'
            ? `c${cell.col}${natural ? `|${extent.join(',')}` : ''}`
            : `r${cell.row}${natural ? `|${extent.join(',')}` : ''}`;
    let group = byKey.get(key);
    if (!group) {
      group = { extent, first: cell, anchorCell: cell };
      byKey.set(key, group);
    } else {
      if (!sameExtent(group.extent, extent)) {
        const a = group.first;
        fail(
          `${option}: the subplots at (row ${a.row}, col ${a.col}) and (row ${cell.row}, col ${cell.col}) have different ${letter} extents, so they cannot share one ${letter} axis. Sharing across different extents needs linked axes (\`matches\`, plan E3.9); share ${letter === 'x' ? "per column (sharedX: true | 'columns')" : "per row (sharedY: true | 'rows')"} between cells of the same ${letter === 'x' ? 'width' : 'height'}.`,
        );
      }
      // x axes sit under the bottom-most subplot of the group; y axes left of the left-most.
      const current = group.anchorCell.domain;
      if (letter === 'x' ? cell.domain.y[0] < current.y[0] : cell.domain.x[0] < current.x[0]) {
        group.anchorCell = cell;
      }
    }
    byCell.set(cell, group);
  }
  return byCell;
}
