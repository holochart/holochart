/**
 * Helpers shared by the Express functions: orientation inference, marginal trace specs and the
 * trace attributes px always writes.
 */
import type { Args } from '../core/args.ts';
import type { Config, GroupData, Role, TraceSpec } from '../core/config.ts';
import { groupValue } from '../core/labels.ts';
import { isMissing } from '../data/table.ts';
import type { MarginalKind } from '../options.ts';

/** Whether `color` is numeric, so it maps to a colorscale (px's `color_is_continuous`). */
export function continuousColor(args: Args): boolean {
  return args.cols.color !== undefined && args.table.type(args.cols.color) === 'numeric';
}

/**
 * px's orientation rule: an explicit `orientation` wins; with only one of x / y, horizontal when
 * that is y for histograms and scatters (`'value'`), or x for bars, boxes and violins
 * (`'category'`); with both, horizontal when x is numeric and y is not; else vertical.
 */
export function inferOrientation(args: Args, family: 'value' | 'category'): 'v' | 'h' {
  const given = args.options['orientation'];
  if (given === 'v' || given === 'h') return given;
  const { x, y } = args.cols;
  if (family === 'value' && y !== undefined && x === undefined) return 'h';
  if (family === 'category' && x !== undefined && y === undefined) return 'h';
  if (x !== undefined && y !== undefined) {
    const xNum = args.table.type(x) === 'numeric';
    const yNum = args.table.type(y) === 'numeric';
    if (xNum && !yNum) return 'h';
  }
  return 'v';
}

/** The data roles every trace takes after its own: ids, custom and hover data, continuous color. */
export function tailRoles(args: Args, withColor = true): Role[] {
  const roles: Role[] = ['animationGroup', 'customData', 'hoverData'];
  if (withColor && continuousColor(args)) roles.push('color');
  return roles;
}

/**
 * Marginal trace specs (px's `make_trace_spec`): a histogram (`opacity: 0.5`, one `bingroup`), a
 * notched box, a violin (`scalegroup`) or a rug (a box of `line-ns-open` / `line-ew-open` points with
 * no box) of x above the plot and of y right of it. `color` colors traces that have no color group.
 */
export function marginalSpecs(
  marginalX: MarginalKind | undefined,
  marginalY: MarginalKind | undefined,
  color?: string,
): TraceSpec[] {
  const out: TraceSpec[] = [];
  for (const [letter, kind] of [
    ['x', marginalX],
    ['y', marginalY],
  ] as const) {
    if (kind === undefined) continue;
    const marginal = letter;
    let spec: TraceSpec;
    switch (kind) {
      case 'histogram':
        spec = {
          type: 'histogram',
          attrs: [letter, letter === 'x' ? 'marginalX' : 'marginalY'],
          patch: { opacity: 0.5, bingroup: letter },
          marginal,
        };
        break;
      case 'violin':
        spec = {
          type: 'violin',
          attrs: [letter, 'hoverName', 'hoverData'],
          patch: { scalegroup: letter },
          marginal,
        };
        break;
      case 'box':
        spec = {
          type: 'box',
          attrs: [letter, 'hoverName', 'hoverData'],
          patch: { notched: true },
          marginal,
        };
        break;
      case 'rug':
        spec = {
          type: 'box',
          attrs: [letter, 'hoverName', 'hoverData'],
          patch: {
            fillcolor: 'rgba(255,255,255,0)',
            line: { color: 'rgba(255,255,255,0)' },
            boxpoints: 'all',
            jitter: 0,
            hoveron: 'points',
            marker: { symbol: letter === 'x' ? 'line-ns-open' : 'line-ew-open' },
          },
          marginal,
        };
        break;
      default:
        throw new Error(
          `Express: marginal must be 'histogram', 'box', 'violin' or 'rug' (got '${String(kind)}').`,
        );
    }
    if (color !== undefined) {
      const patch = { ...spec.patch } as Record<string, unknown>;
      patch['marker'] = { ...(patch['marker'] as object | undefined), color };
      spec = { ...spec, patch };
    }
    out.push(spec);
  }
  return out;
}

/** `marker.opacity` when `opacity` is given. */
export function opacityPatch(args: Args): Record<string, unknown> {
  const opacity = args.options['opacity'];
  return typeof opacity === 'number' ? { marker: { opacity } } : {};
}

/**
 * px's `sizeref` of a `size` column: marker areas proportional to the values, the largest marker
 * `sizeMax` px across.
 */
export function sizeref(values: readonly unknown[], sizeMax: number): number {
  let max = 0;
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v) && v > max) max = v;
  return (2 * max) / sizeMax ** 2;
}

/** Drop `undefined` values (so specs only carry what px would write). */
export function defined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/** px's box / violin / strip mode default: `overlay` when color is the category axis, else `group`. */
export function groupMode(args: Args, orientation: 'v' | 'h', given: unknown): string {
  if (typeof given === 'string') return given;
  const { color, x, y } = args.cols;
  if (color !== undefined) {
    if (y === color && orientation === 'h') return 'overlay';
    if (x === color && orientation === 'v') return 'overlay';
  }
  return 'group';
}

/**
 * `agg` (a Holochart extension, plan E23.5): how `bar`, `line` and `area` aggregate the rows of a
 * group that share a position — `'sum'`, `'avg'`, `'count'`, `'min'`, `'max'`, `'median'`, or a
 * function of the present values.
 */
export type AggFunction =
  'count' | 'sum' | 'avg' | 'min' | 'max' | 'median' | ((values: number[]) => number);

const AGGS = new Set(['count', 'sum', 'avg', 'min', 'max', 'median']);

/** Orientation with `agg`: a lone `x` is the position axis (vertical), a lone `y` horizontal. */
export function aggOrientation(args: Args, fallback: () => 'v' | 'h'): 'v' | 'h' {
  const given = args.options['orientation'];
  if (args.options['agg'] === undefined || given === 'v' || given === 'h') return fallback();
  const { x, y } = args.cols;
  if (x !== undefined && y === undefined) return 'v';
  if (y !== undefined && x === undefined) return 'h';
  return fallback();
}

/** Aggregate the present values of one position (pandas' groupby semantics for empty groups). */
export function aggregate(agg: AggFunction, values: number[], rows: number): number | null {
  let out: number;
  if (typeof agg === 'function') out = agg(values);
  else {
    const n = values.length;
    switch (agg) {
      case 'count':
        out = rows;
        break;
      case 'sum':
        out = values.reduce((s, v) => s + v, 0);
        break;
      case 'avg':
        out = n ? values.reduce((s, v) => s + v, 0) / n : NaN;
        break;
      case 'min':
        out = n ? Math.min(...values) : NaN;
        break;
      case 'max':
        out = n ? Math.max(...values) : NaN;
        break;
      default: {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = n >> 1;
        out =
          n === 0
            ? NaN
            : n % 2
              ? (sorted[mid] as number)
              : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
      }
    }
  }
  return Number.isFinite(out) ? out : null;
}

/**
 * The config of `agg`: within each group (color, facet, frame, …), the rows with the same
 * position (x of a vertical chart, y of a horizontal one) become one point at their first row,
 * whose value is the aggregate of the value column (missing values skipped; `'count'` counts the
 * present values, or the rows without a value column). Positions keep their first appearance's
 * order; missing positions are dropped. The value axis is titled like a histogram's (`sum of tip`,
 * `count`).
 */
export function aggConfig(args: Args, orientation: 'v' | 'h'): Partial<Config> {
  const agg = args.options['agg'] as AggFunction | undefined;
  if (agg === undefined || agg === null) return {};
  if (typeof agg !== 'function' && !AGGS.has(agg)) {
    throw new Error(
      `${args.fn}: agg must be 'count', 'sum', 'avg', 'min', 'max', 'median' or a function (got '${String(agg)}').`,
    );
  }
  const valueLetter = orientation === 'v' ? 'y' : 'x';
  const positionLetter = orientation === 'v' ? 'x' : 'y';
  const position = args.cols[positionLetter];
  const value = args.cols[valueLetter];
  if (position === undefined) {
    throw new Error(`${args.fn}: agg needs '${positionLetter}', the column to aggregate by.`);
  }
  if (value === undefined && agg !== 'count') {
    throw new Error(
      `${args.fn}: agg '${String(typeof agg === 'function' ? 'function' : agg)}' needs '${valueLetter}', the column to aggregate.`,
    );
  }
  const positions = args.table.column(position);
  const values = value === undefined ? undefined : args.table.column(value);
  const name = typeof agg === 'function' ? agg.name || 'agg' : agg;
  const transform = (rows: readonly number[]): GroupData => {
    const buckets = new Map<string, number[]>();
    for (const i of rows) {
      const key = groupValue(positions[i]);
      if (isMissing(key)) continue;
      const k = JSON.stringify([key]);
      let bucket = buckets.get(k);
      if (!bucket) buckets.set(k, (bucket = []));
      bucket.push(i);
    }
    const out: number[] = [];
    const aggregated: (number | null)[] = [];
    for (const bucket of buckets.values()) {
      out.push(bucket[0] as number);
      const present: number[] = [];
      if (values) {
        for (const i of bucket) {
          const v = values[i];
          const n = typeof v === 'bigint' ? Number(v) : v;
          if (typeof n === 'number' && Number.isFinite(n)) present.push(n);
        }
      }
      aggregated.push(aggregate(agg, present, values ? present.length : bucket.length));
    }
    return { rows: out, values: { [valueLetter]: aggregated } };
  };
  return {
    transform,
    aggregation: { histfunc: name },
    ...(value === undefined ? { valueLabels: { [valueLetter]: 'count' } } : {}),
  };
}
