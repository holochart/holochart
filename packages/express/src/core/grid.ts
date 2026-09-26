/**
 * Subplot grids of Express figures (plan E23.3, E10.8), like plotly.py's `px._core.init_figure`
 * and `configure_cartesian_axes`: facets and marginals are cells of one `makeSubplots` grid built
 * from the bottom-left (so `xaxis` / `yaxis` are the bottom-left cell's), every cell has its own
 * axis pair, and the axes are linked with `matches` as `make_subplots(shared_xaxes='all',
 * shared_yaxes='all')` links them. Facet labels are paper annotations: at the top of each column,
 * rotated at the right of each row, or at the top of each cell when wrapped.
 */
import {
  FACET_LABEL_NAME,
  makeSubplots,
  type SubplotCell,
  type SubplotSpec,
} from '@mk7s/holochart-core';
import type { Args } from './args.ts';
import type { Config } from './config.ts';
import { decoratedLabel } from './labels.ts';

/** What the engine knows about the grid before building it. */
export interface GridPlan {
  readonly nrows: number;
  readonly ncols: number;
  /** `facetColWrap` in effect (0: none). */
  readonly wrap: number;
  /** Number of `facetCol` values (the cells in use when wrapped). */
  readonly facetCount: number;
  readonly colLabels: readonly string[];
  readonly rowLabels: readonly string[];
  readonly marginalX?: string | undefined;
  readonly marginalY?: string | undefined;
  /** Whether a `color` column is given (marginal sizes depend on it, as in px). */
  readonly colorGiven: boolean;
  readonly subplotType: 'xy' | 'domain' | 'splom';
}

/** The grid built from a plan. */
export interface Grid {
  /** Axes and facet-label annotations, to merge into the layout. */
  readonly layout: Record<string, unknown>;
  /** The cell at `row` (from the top) and `col` (1-based), if it exists. */
  cell(row: number, col: number): SubplotCell | undefined;
  /** Point a trace at the cell at `row` (from the top), `col`. */
  place(trace: Record<string, unknown>, row: number, col: number): void;
  readonly nrows: number;
  readonly ncols: number;
}

function axisKey(id: string): string {
  return `${id.charAt(0)}axis${id.slice(1)}`;
}

/**
 * A facet label annotation (plotly.py's `_build_subplot_title_annotations`, without a font, as px
 * leaves it to the template), named {@link FACET_LABEL_NAME} so a top legend makes room for it.
 */
function label(
  text: string,
  domain: { x: readonly number[]; y: readonly number[] },
  edge: 'top' | 'right',
): Record<string, unknown> {
  const [x0, x1] = domain.x as [number, number];
  const [y0, y1] = domain.y as [number, number];
  return edge === 'top'
    ? {
        name: FACET_LABEL_NAME,
        showarrow: false,
        text,
        x: (x0 + x1) / 2,
        xanchor: 'center',
        xref: 'paper',
        y: y1,
        yanchor: 'bottom',
        yref: 'paper',
      }
    : {
        name: FACET_LABEL_NAME,
        showarrow: false,
        text,
        textangle: 90,
        x: x1,
        xanchor: 'left',
        xref: 'paper',
        y: (y0 + y1) / 2,
        yanchor: 'middle',
        yref: 'paper',
      };
}

/**
 * Lay out the grid: sizes and spacing as px (`facetRowSpacing` 0.03, or 0.07 wrapped;
 * `facetColSpacing` 0.02; a marginal takes 26% of the plot with a histogram or `color`, else 16%,
 * 0.01 / 0.005 apart), one axis pair per cell linked with `matches`, tick labels only on the
 * outer axes, and the facet labels.
 */
export function layoutGrid(args: Args, plan: GridPlan): Grid {
  const { nrows, ncols, wrap } = plan;
  const opts = args.options;
  if (plan.subplotType === 'splom') {
    return { layout: {}, cell: () => undefined, place: () => undefined, nrows: 1, ncols: 1 };
  }
  let rowHeights = new Array<number>(nrows).fill(1);
  let columnWidths = new Array<number>(ncols).fill(1);
  let vSpacing: number;
  let hSpacing: number;
  const mainSize = (kind: string) => (kind === 'histogram' || plan.colorGiven ? 0.74 : 0.84);
  if (plan.marginalX) {
    const main = mainSize(plan.marginalX);
    rowHeights = [...new Array<number>(nrows - 1).fill(main), 1 - main];
    vSpacing = 0.01;
  } else {
    vSpacing = (opts['facetRowSpacing'] as number | undefined) || (wrap ? 0.07 : 0.03);
  }
  if (plan.marginalY) {
    const main = mainSize(plan.marginalY);
    columnWidths = [...new Array<number>(ncols - 1).fill(main), 1 - main];
    hSpacing = 0.005;
  } else {
    hSpacing = (opts['facetColSpacing'] as number | undefined) || 0.02;
  }

  // Cells from the top: wrapped facets leave the end of the last row empty; with both marginals,
  // the top-right corner is empty.
  const present = (row: number, col: number): boolean => {
    if (wrap) return (row - 1) * wrap + (col - 1) < plan.facetCount;
    if (plan.marginalX && plan.marginalY && row === 1 && col === ncols) return false;
    return true;
  };
  const type = plan.subplotType === 'domain' ? 'domain' : 'xy';
  const specs: (SubplotSpec | null)[][] = [];
  for (let gr = 1; gr <= nrows; gr++) {
    const row = nrows - gr + 1;
    specs.push(Array.from({ length: ncols }, (_, c) => (present(row, c + 1) ? { type } : null)));
  }
  let sp;
  try {
    sp = makeSubplots({
      rows: nrows,
      cols: ncols,
      startCell: 'bottom-left',
      specs,
      rowHeights,
      columnWidths,
      horizontalSpacing: hSpacing,
      verticalSpacing: vSpacing,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${args.fn}: ${message.replace(/^makeSubplots: /, '')} Lower facetRowSpacing / facetColSpacing or use fewer facets.`,
      { cause: error },
    );
  }
  const cell = (row: number, col: number): SubplotCell | undefined =>
    sp.cells[nrows - row]?.[col - 1] ?? undefined;
  const layout: Record<string, unknown> = { ...sp.layout };
  const axis = (id: string) => layout[axisKey(id)] as Record<string, unknown>;

  if (type === 'xy') {
    // shared_xaxes / shared_yaxes = 'all': every axis matches the first; inner tick labels hidden.
    // Tick labels stay on the lowest cell of each column (the bottom row unless wrapped facets
    // leave it empty) and on the first column.
    let firstX: string | undefined;
    let firstY: string | undefined;
    for (let gr = 1; gr <= nrows; gr++) {
      for (let c = 1; c <= ncols; c++) {
        const k = sp.cells[gr - 1]?.[c - 1];
        if (!k?.xaxis || !k.yaxis) continue;
        const lowest = !sp.cells.slice(0, gr - 1).some((r) => r[c - 1]);
        if (firstX === undefined) firstX = k.xaxis;
        else {
          axis(k.xaxis)['matches'] = firstX;
          if (!lowest) axis(k.xaxis)['showticklabels'] = false;
        }
        if (firstY === undefined) firstY = k.yaxis;
        else {
          axis(k.yaxis)['matches'] = firstY;
          if (c > 1) axis(k.yaxis)['showticklabels'] = false;
        }
      }
    }
  }

  const annotations: Record<string, unknown>[] = [];
  if (wrap) {
    for (let row = 1; row <= nrows; row++) {
      for (let col = 1; col <= ncols; col++) {
        const text = plan.colLabels[(row - 1) * wrap + (col - 1)];
        const k = cell(row, col);
        if (text !== undefined && k) annotations.push(label(text, k.domain, 'top'));
      }
    }
  } else {
    plan.colLabels.forEach((text, c) => {
      const k = cell(1, c + 1);
      if (k) annotations.push(label(text, k.domain, 'top'));
    });
    plan.rowLabels.forEach((text, r) => {
      const k = cell(r + 1, ncols);
      if (k) annotations.push(label(text, k.domain, 'right'));
    });
  }
  if (annotations.length > 0) layout['annotations'] = annotations;

  return {
    layout,
    cell,
    nrows,
    ncols,
    place(trace, row, col) {
      const k = cell(row, col);
      if (!k) return;
      if (k.type === 'domain') {
        const prev = trace['domain'] as Record<string, unknown> | undefined;
        trace['domain'] = { ...prev, x: [...k.domain.x], y: [...k.domain.y] };
      } else {
        trace['xaxis'] = k.xaxis;
        trace['yaxis'] = k.yaxis;
      }
    },
  };
}

/** Axis attributes of `letter` for the outer axes (px's `set_cartesian_axis_opts`). */
function axisOpts(
  args: Args,
  target: Record<string, unknown>,
  letter: 'x' | 'y',
  orders: ReadonlyMap<string, unknown[]>,
): void {
  const opts = args.options;
  const range = opts[letter === 'x' ? 'rangeX' : 'rangeY'] as readonly unknown[] | undefined;
  if (opts[letter === 'x' ? 'logX' : 'logY']) {
    target['type'] = 'log';
    if (range) target['range'] = range.map((r) => Math.log10(Number(r)));
  } else if (range) target['range'] = [...range];
  const column = args.cols[letter];
  const order = column === undefined ? undefined : orders.get(column);
  if (order) {
    target['categoryorder'] = 'array';
    // Category axes run bottom-up: px lists y categories reversed so the first is at the top.
    target['categoryarray'] = letter === 'x' ? [...order] : [...order].reverse();
  }
}

/**
 * Titles, types, ranges and category orders of the axes (px's `configure_cartesian_axes` and
 * `configure_cartesian_marginal_axes`): y titles on the first column, x titles on the lowest cell of
 * each column, log / date types on every axis of the letter, and the marginals' count axes bare.
 */
export function configureAxes(
  args: Args,
  config: Config,
  plan: GridPlan,
  grid: Grid,
  layout: Record<string, unknown>,
  orders: ReadonlyMap<string, unknown[]>,
): void {
  if (plan.subplotType === 'splom') return;
  const { nrows, ncols } = grid;
  const axis = (id: string | undefined) =>
    id === undefined ? undefined : (layout[axisKey(id)] as Record<string, unknown> | undefined);
  const cells: { row: number; col: number; x: string; y: string }[] = [];
  for (let row = 1; row <= nrows; row++) {
    for (let col = 1; col <= ncols; col++) {
      const k = grid.cell(row, col);
      if (k?.xaxis && k.yaxis) cells.push({ row, col, x: k.xaxis, y: k.yaxis });
    }
  }
  const lowestRow = (col: number) =>
    Math.max(...cells.filter((c) => c.col === col).map((c) => c.row));
  const xTitle =
    config.axisTitles?.x !== undefined
      ? config.axisTitles.x
      : decoratedLabel(args, config, args.cols.x, 'x');
  const yTitle =
    config.axisTitles?.y !== undefined
      ? config.axisTitles.y
      : decoratedLabel(args, config, args.cols.y, 'y');
  // The main (non-marginal) cells: marginals are the top row / right column.
  const isMarginalRow = (row: number) => plan.marginalX !== undefined && row === 1;
  const isMarginalCol = (col: number) => plan.marginalY !== undefined && col === ncols;

  for (const c of cells) {
    const ya = axis(c.y) as Record<string, unknown>;
    const xa = axis(c.x) as Record<string, unknown>;
    if (c.col === 1 && !isMarginalRow(c.row)) {
      axisOpts(args, ya, 'y', orders);
      if (yTitle !== null && yTitle !== '' && !isMarginalRow(c.row)) {
        ya['title'] = { text: yTitle };
      }
    }
    if (c.row === lowestRow(c.col) && !isMarginalCol(c.col)) {
      axisOpts(args, xa, 'x', orders);
      if (xTitle !== null && xTitle !== '' && !config.timeline && !isMarginalCol(c.col)) {
        xa['title'] = { text: xTitle };
      }
    }
    if (args.options['logX'] && !isMarginalCol(c.col)) xa['type'] = 'log';
    if (args.options['logY'] && !isMarginalRow(c.row)) ya['type'] = 'log';
    if (config.timeline) xa['type'] = 'date';
    if (config.ecdf) (config.orientation === 'h' ? xa : ya)['rangemode'] = 'tozero';
  }

  const tl = (args.template?.layout ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const bare = { showticklabels: false, showline: false, ticks: '' };
  if (plan.marginalX) {
    // Count axes of the top row: bare, matching each other (not the main y axes).
    const top = cells.filter((c) => c.row === 1);
    const first = top[0]?.y;
    for (const c of top) {
      const ya = axis(c.y) as Record<string, unknown>;
      Object.assign(ya, bare);
      delete ya['range'];
      delete ya['type'];
      if (c.y === first) delete ya['matches'];
      else ya['matches'] = first;
      if (tl['yaxis']?.['showgrid'] === undefined) ya['showgrid'] = plan.marginalX === 'histogram';
      if (tl['xaxis']?.['showgrid'] === undefined)
        (axis(c.x) as Record<string, unknown>)['showgrid'] = true;
    }
  }
  if (plan.marginalY) {
    const right = cells.filter((c) => c.col === ncols);
    const first = right.find((c) => c.row === nrows)?.x ?? right[0]?.x;
    for (const c of right) {
      const xa = axis(c.x) as Record<string, unknown>;
      Object.assign(xa, bare);
      delete xa['range'];
      delete xa['type'];
      delete xa['title'];
      if (c.x === first) delete xa['matches'];
      else xa['matches'] = first;
      if (tl['xaxis']?.['showgrid'] === undefined) xa['showgrid'] = plan.marginalY === 'histogram';
      if (tl['yaxis']?.['showgrid'] === undefined)
        (axis(c.y) as Record<string, unknown>)['showgrid'] = true;
    }
  }
}
