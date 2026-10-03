/**
 * Keyboard stops of the statistical traces and of grid traces (backlog S2.14), loaded with the
 * chart's first keyboard focus (`TraceModule.a11y`, `a11y-loader.ts`). Every stop is a hover point
 * its trace would show there, so the label and the announcement read what hovering shows.
 *
 * - `histogram`: one stop per bin (its bar's hover point: the bin range and its value), visited
 *   along the position axis like bars.
 * - `box`, `violin`: one stop per box, showing and announcing every statistic of it (max, q3,
 *   median, q1, min, with fences and the mean when drawn), visited along the position axis.
 * - Grids ({@link grid}: `heatmap`, `contour`, `histogram2d`, `histogram2dcontour`): a cell
 *   cursor over the cells in view. ← / → move along the row, ↑ / ↓ along the column, Home / End
 *   to the ends of the row. The cells are built on demand, so a grid of millions costs nothing.
 * - `parcoords`: a line × axis cursor. ← / → move along a line from axis to axis, ↑ / ↓ to the
 *   previous / next line on the same axis; the label sits on the axis at the line's value.
 * - `parcats`: its categories. ← / → move between dimensions, ↑ / ↓ between the categories of
 *   one, Home / End to its first / last category.
 *
 * This file imports types only: each trace's loader hands over the functions its stops need, so
 * the chunk shares no module with the package (an app's bundler adds no shared chunk for it, and
 * a bundle with one of the traces doesn't pull in the others' code).
 */
import type { FullTrace, localeOf } from '@mk7s/holochart-core';
import type {
  accessibleText,
  AxisInfo,
  formatAxisValue,
  formatPlainNumber,
  HoverContext,
  HoverPoint,
  HoverQuery,
  KeyboardPoint,
  KeyboardStops,
  TraceA11yParts,
  TraceModule,
} from '@mk7s/holochart-runtime';
import type { BoxCalc } from './box/calc.ts';
import type { hoverAxes, statPoints } from './box/hover.ts';
import type { HistogramCalc } from './histogram/calc.ts';
import type { histogramHoverPoints } from './histogram/hover.ts';
import type { ParcatsCalc } from './parcats/calc.ts';
import type { parcatsHoverPoints } from './parcats/hover.ts';
import type { layoutFor } from './parcats/layout.ts';
import type { ParcoordsCalc } from './parcoords/calc.ts';
import type { traceRect } from './parcoords/common.ts';
import type { layoutAxes, unitToY } from './parcoords/layout.ts';

/** The announcement of a stop that is one of several alike (a bin). */
export const ITEM_TEMPLATE = '{name}: {text}, {n} of {count}.';
/** The announcement of a box or violin: its position, then its statistics. */
export const BOX_TEMPLATE = '{name}: {position}, {text}, {n} of {count}.';
/** The announcement of a cell of a grid (a heatmap cell; a parcoords line on an axis). */
export const CELL_TEMPLATE = '{name}: {text}, row {row} of {rows}, column {column} of {columns}.';
/** The announcement of a parcats category. */
export const CATEGORY_TEMPLATE = '{name}: {dimension}, {category}, {text}, {n} of {count}.';

/** A hover query at linear `(xl, yl)` of a cartesian trace, or at container `(xl, yl)` of a domain one. */
function queryAt(ctx: HoverContext, xl: number, yl: number, mode: HoverQuery['mode']): HoverQuery {
  const t = ctx.transform;
  const py = (ctx.height ?? 0) - yl;
  return ctx.domain
    ? { px: xl, py, xl, yl: py, cx: xl, cy: yl, mode, distance: 0 }
    : {
        px: xl * t.scaleX + t.offsetX,
        py: yl * t.scaleY + t.offsetY,
        xl,
        yl,
        mode,
        distance: 1e6,
      };
}

/** A cell of a grid `columns` wide with `n` cells: where its arrows lead and how it is announced. */
function cell(k: number, columns: number, n: number): Pick<KeyboardPoint, 'nav' | 'say'> {
  const c = k % columns;
  return {
    nav: [
      c ? k - 1 : k,
      c < columns - 1 ? k + 1 : k,
      k < columns ? k : k - columns,
      k + columns < n ? k + columns : k,
      k - c,
      k - c + columns - 1,
    ],
    say: [
      CELL_TEMPLATE,
      {
        row: `${(k - c) / columns + 1}`,
        rows: `${n / columns}`,
        column: `${c + 1}`,
        columns: `${columns}`,
      },
    ],
  };
}

/** The parts of `histogram`. */
export const histogram = (hover: typeof histogramHoverPoints): TraceA11yParts => ({
  histogram: {
    keyboardPoints: (calc: HistogramCalc, trace: FullTrace, ctx: HoverContext) =>
      Array.from(calc.bars.center, (c, i) =>
        hover(calc, trace, queryAt(ctx, c, c, calc.orientation === 'h' ? 'y' : 'x'), ctx).find(
          (p) => p.pointIndex === i,
        ),
      ).flatMap((p): KeyboardPoint[] => (p ? [{ ...p, say: [ITEM_TEMPLATE] }] : [])),
  },
});

/** The parts of `box` and `violin`. */
export const boxes = (
  axesOf: typeof hoverAxes,
  stats: typeof statPoints,
  axisText: typeof formatAxisValue,
  locale: typeof localeOf,
): TraceA11yParts => {
  const part = {
    keyboardPoints(calc: BoxCalc, trace: FullTrace, ctx: HoverContext): KeyboardPoint[] {
      const violin = trace.type === 'violin';
      // Without box hover (a strip plot: `hoveron: 'points'`) there are no statistics to visit.
      if (!/all|boxes|violins/.test(String(trace['hoveron'] ?? 'all'))) return [];
      const axes = axesOf(calc, ctx);
      const side = trace['side'];
      const options = {
        hasMean: violin
          ? (trace['meanline'] as { visible?: unknown } | undefined)?.visible === true
          : Boolean(trace['boxmean']) || trace['sizemode'] === 'sd',
        side: violin && (side === 'positive' || side === 'negative') ? side : 'both',
        locale: locale(ctx.fullLayout),
      } as const;
      const out: KeyboardPoint[] = [];
      for (let b = 0; b < calc.count; b++) {
        const l = calc.pos[b]! + calc.offsets.bPos;
        // Asked along the position axis: labels read "median: 3", not "(A, median: 3)".
        const query = queryAt(ctx, l, l, calc.orientation === 'h' ? 'y' : 'x');
        const [first, ...more] = stats(calc, trace, b, query, axes, options);
        const position = axisText(axes.pa, calc.pos[b]!);
        // A box at its trace's name (one trace per box) is announced by the name alone.
        if (first)
          out.push({
            ...first,
            more,
            say: position === trace['name'] ? [ITEM_TEMPLATE] : [BOX_TEMPLATE, { position }],
          });
      }
      return out;
    },
  };
  return { box: part, violin: part };
};

/** What a grid trace's calc has (heatmap, contour, histogram2d): its cell centers, linear. */
interface GridCalc {
  readonly x: { readonly centers: ArrayLike<number> };
  readonly y: { readonly centers: ArrayLike<number> };
}

/** Cells in view along `axis`, in screen order (`flip` −1: from the top). */
function inView(centers: ArrayLike<number>, axis: AxisInfo, flip: 1 | -1): number[] {
  const px = Array.from(centers, (l) => axis.scale.l2p(l));
  return px
    .map((_, i) => i)
    .filter((i) => px[i]! >= 0 && px[i]! <= axis.scale.length)
    .sort((a, b) => flip * (px[a]! - px[b]!));
}

/**
 * The parts of the grid traces: a cell cursor over the cells in view, rows from the top, each the
 * hover point the trace's own `hoverPoints` gives at the cell's center.
 */
export const grid = (): TraceA11yParts => {
  const part = {
    keyboardPoints(calc: GridCalc, trace: FullTrace, ctx: HoverContext): KeyboardStops | undefined {
      const hover = (trace._module as TraceModule | undefined)?.hoverPoints;
      const { xaxis, yaxis } = ctx;
      if (!hover || !xaxis || !yaxis) return undefined;
      const cols = inView(calc.x.centers, xaxis, 1);
      const rows = inView(calc.y.centers, yaxis, -1);
      const columns = cols.length;
      const n = columns * rows.length;
      return {
        length: n,
        at(k) {
          if (!(k >= 0 && k < n)) return undefined;
          const c = k % columns;
          const query = queryAt(
            ctx,
            calc.x.centers[cols[c]!]!,
            calc.y.centers[rows[(k - c) / columns]!]!,
            'closest',
          );
          // A gap that is not hovered (`hoverongaps: false`) is still a stop: its position.
          const p: HoverPoint = hover(calc, trace, query, ctx)[0] ?? {
            pointIndex: k,
            distance: 0,
            px: query.px,
            py: query.py,
            x: xaxis.scale.l2d(query.xl),
            y: yaxis.scale.l2d(query.yl),
          };
          return { ...p, ...cell(k, columns, n) };
        },
      };
    },
  };
  return { heatmap: part, contour: part, histogram2d: part, histogram2dcontour: part };
};

/** The parts of `parcoords`. */
export const parcoords = (
  rectOf: typeof traceRect,
  axesOf: typeof layoutAxes,
  toY: typeof unitToY,
  plain: typeof accessibleText,
  number: typeof formatPlainNumber,
): TraceA11yParts => ({
  parcoords: {
    keyboardPoints(calc: ParcoordsCalc, _trace: FullTrace, ctx: HoverContext): KeyboardStops {
      const rect = rectOf({ domain: ctx.domain, viewport: { size: { width: 0, height: 0 } } });
      const axes = axesOf(calc, rect);
      const columns = axes.length;
      const n = columns * calc.length;
      const height = ctx.height ?? 0;
      return {
        length: n,
        at(k) {
          if (!(k >= 0 && k < n)) return undefined;
          const c = k % columns;
          const r = (k - c) / columns;
          const { dim, x } = axes[c]!;
          const v = dim.values[r];
          const u = dim.unit[r]!;
          return {
            pointIndex: r,
            // The same line on another axis is another stop.
            kind: `${c}`,
            distance: 0,
            px: x,
            py: height - toY(rect, Number.isFinite(u) ? u : 0.5),
            hoverText: `${plain(dim.label) || `Dimension ${c + 1}`}: ${typeof v === 'number' ? number(v) : plain(v)}`,
            showName: false,
            fields: { dimension: dim.index, label: dim.label, value: v },
            ...cell(k, columns, n),
          };
        },
      };
    },
  },
});

/** The parts of `parcats`. */
export const parcats = (
  hover: typeof parcatsHoverPoints,
  layoutOf: typeof layoutFor,
  rectOf: typeof traceRect,
  plain: typeof accessibleText,
  /** The width of a dimension's column (`DIM_WIDTH`). */
  width: number,
): TraceA11yParts => ({
  parcats: {
    keyboardPoints(calc: ParcatsCalc, trace: FullTrace, ctx: HoverContext): KeyboardPoint[] {
      if (!ctx.domain) return [];
      const rect = rectOf({ domain: ctx.domain, viewport: { size: { width: 0, height: 0 } } });
      const { dims } = layoutOf(calc, trace, ctx.fullLayout, rect);
      // The first stop of each dimension: stops run dimension by dimension, from the top.
      const start: number[] = [];
      let total = 0;
      for (const dim of dims) {
        start.push(total);
        total += dim.cats.length;
      }
      const out: KeyboardPoint[] = [];
      dims.forEach((dim, d) =>
        dim.cats.forEach((cat, c) => {
          const query = queryAt(ctx, dim.x + width / 2, cat.y + cat.height / 2, 'closest');
          const [first, ...more] = hover(calc, trace, query, ctx);
          const k = start[d]! + c;
          const last = dim.cats.length - 1;
          // Sideways: the category at the same place in the next dimension (its last if shorter).
          const beside = (e: number): number =>
            dims[e] ? start[e]! + Math.min(c, dims[e].cats.length - 1) : k;
          if (first)
            out.push({
              ...first,
              // Categories of different dimensions may share their first row (`pointIndex`).
              kind: `${d}:${c}`,
              more,
              nav: [
                beside(d - 1),
                beside(d + 1),
                c ? k - 1 : k,
                c < last ? k + 1 : k,
                k - c,
                k - c + last,
              ],
              say: [
                CATEGORY_TEMPLATE,
                {
                  dimension: plain(dim.label),
                  category: plain(cat.label),
                  n: `${c + 1}`,
                  count: `${last + 1}`,
                },
              ],
            });
        }),
      );
      // A category without a label (`hoverinfo: 'skip'`): the indices no longer match, so a list.
      return out.length === total ? out : out.map(({ nav: _nav, ...p }) => p);
    },
  },
});
