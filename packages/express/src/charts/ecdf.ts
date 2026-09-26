/**
 * Empirical cumulative distribution plots (plan E10.7), like plotly.py's `px.ecdf`: per group, the
 * values sorted and a step line (`line.shape: 'hv'`) up through the cumulative share of the rows
 * (or of a weight column) at or below each value.
 */
import { parseDate } from '@mk7s/holochart-core';
import { prepare } from '../core/args.ts';
import type { Config, GroupData, Grouper, Role } from '../core/config.ts';
import { buildFigure } from '../core/engine.ts';
import { expressFunction } from '../core/render.ts';
import { isMissing, type DataInput } from '../data/table.ts';
import type {
  AnimationOptions,
  AxisOptions,
  ColumnRef,
  CommonOptions,
  DiscreteColorOptions,
  ExpressFigure,
  FacetOptions,
  HoverOptions,
  LineDashOptions,
  MarginalKind,
  SymbolOptions,
  XYOptions,
} from '../options.ts';
import { marginalSpecs, opacityPatch, tailRoles } from './shared.ts';

/** `ecdfnorm`: the cumulative axis as a share (`'probability'`, default), in `'percent'`, or counts (`null`). */
export type EcdfNorm = 'probability' | 'percent' | null;

/**
 * `ecdfmode`: `'standard'` (default) counts values at or below x; `'reversed'` at or above x;
 * `'complementary'` above x (1 − standard).
 */
export type EcdfMode = 'standard' | 'reversed' | 'complementary';

/** Options of {@link ecdf}: px.ecdf's arguments in camelCase. */
export interface EcdfOptions
  extends
    CommonOptions,
    XYOptions,
    DiscreteColorOptions,
    HoverOptions,
    FacetOptions,
    AnimationOptions,
    AxisOptions,
    SymbolOptions,
    LineDashOptions {
  /** Column of text drawn at the points. */
  readonly text?: ColumnRef;
  /** Show markers at the steps. Default `false`. */
  readonly markers?: boolean;
  /** Draw the step line. Default `true`. */
  readonly lines?: boolean;
  /** Default `'probability'`. */
  readonly ecdfnorm?: EcdfNorm;
  /** Default `'standard'`. */
  readonly ecdfmode?: EcdfMode;
  /** Distribution of the values drawn alongside (above a vertical ECDF, right of a horizontal one). */
  readonly marginal?: MarginalKind;
  /** Marker opacity, 0–1. */
  readonly opacity?: number;
}

/** Sort order of ECDF base values: numbers, then dates, then text. */
function sortValue(v: unknown): number | string {
  if (typeof v === 'number') return v;
  const ms = parseDate(v);
  if (ms !== undefined) return ms;
  return String(v);
}

function compare(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The ECDF of one group, as px computes it: rows sorted by their base value (descending for
 * `'reversed'`), the running sum of the weights (1 per row without a weight column), subtracted
 * from the total for `'complementary'`, and divided by the total for `'probability'` (× 100 for
 * `'percent'`). Rows with a missing base value are skipped; missing weights count as 0.
 *
 * @returns The rows in plotting order (ascending base value) and their cumulative values.
 */
export function ecdfValues(
  base: readonly unknown[],
  weights: readonly unknown[] | undefined,
  norm: EcdfNorm = 'probability',
  mode: EcdfMode = 'standard',
): { order: number[]; values: number[] } {
  const rows: number[] = [];
  for (let i = 0; i < base.length; i++) if (!isMissing(base[i])) rows.push(i);
  const keys = new Map(rows.map((i) => [i, sortValue(base[i])]));
  const ascending = mode !== 'reversed';
  // Stable sort; reversed order keeps ties in data order, as pandas' sort_values does.
  rows.sort((a, b) => {
    const d = compare(keys.get(a) as number | string, keys.get(b) as number | string);
    return ascending ? d : -d;
  });
  const weight = (i: number): number => {
    if (!weights) return 1;
    const w = weights[i];
    return typeof w === 'number' && Number.isFinite(w) ? w : 0;
  };
  let total = 0;
  for (const i of rows) total += weight(i);
  const cumulative = new Map<number, number>();
  let sum = 0;
  for (const i of rows) {
    sum += weight(i);
    let v = mode === 'complementary' ? total - sum : sum;
    if (norm === 'probability') v = total === 0 ? 0 : v / total;
    else if (norm === 'percent') v = total === 0 ? 0 : (100 * v) / total;
    cumulative.set(i, v);
  }
  if (!ascending) rows.reverse();
  return { order: rows, values: rows.map((i) => cumulative.get(i) as number) };
}

function buildEcdf(data: DataInput | null | undefined, options: EcdfOptions): ExpressFigure {
  const args = prepare('ecdf', data, options as Record<string, unknown>);
  const { x, y } = args.cols;
  if (x === undefined && y === undefined) throw new Error('ecdf: give x or y.');
  const orientation = options.orientation ?? (y !== undefined && x === undefined ? 'h' : 'v');
  const baseLetter = orientation === 'v' ? 'x' : 'y';
  const varLetter = orientation === 'v' ? 'y' : 'x';
  const baseColumn = args.cols[baseLetter];
  if (baseColumn === undefined) {
    throw new Error(
      `ecdf: a ${orientation === 'v' ? 'vertical' : 'horizontal'} ECDF needs ${baseLetter}.`,
    );
  }
  const varColumn = args.cols[varLetter];
  const norm = options.ecdfnorm === undefined ? 'probability' : options.ecdfnorm;
  const mode = options.ecdfmode ?? 'standard';
  const varLabel =
    varColumn === undefined ? (norm ?? 'count') : `${norm ?? 'sum'} of ${args.label(varColumn)}`;

  const baseValues = args.table.column(baseColumn);
  const weightValues = varColumn === undefined ? undefined : args.table.column(varColumn);
  const transform = (rows: readonly number[]): GroupData => {
    const { order, values } = ecdfValues(
      rows.map((i) => baseValues[i]),
      weightValues ? rows.map((i) => weightValues[i]) : undefined,
      norm,
      mode,
    );
    return { rows: order.map((k) => rows[k] as number), values: { [varLetter]: values } };
  };

  const modeParts = new Set<string>();
  if (options.lines ?? true) modeParts.add('lines');
  if (options.markers) modeParts.add('markers');
  if (args.cols.text !== undefined) modeParts.add('text');
  if (modeParts.size === 0) modeParts.add('lines');
  const reversed = mode === 'reversed';
  const shape = orientation === 'v' ? (reversed ? 'vh' : 'hv') : reversed ? 'hv' : 'vh';
  const attrs: Role[] = ['x', 'y', 'hoverName', 'text', ...tailRoles(args, false)];
  const groupers: Grouper[] = [
    { variable: 'color', path: 'marker.color' },
    { variable: 'dash', path: 'line.dash' },
    { variable: 'symbol', path: 'marker.symbol' },
    { variable: 'animationFrame' },
    { variable: 'facetRow' },
    { variable: 'facetCol' },
  ];
  const marginalX = orientation === 'v' ? options.marginal : undefined;
  const marginalY = orientation === 'h' ? options.marginal : undefined;
  const config: Config = {
    specs: [
      {
        type: 'scatter',
        attrs,
        patch: {
          mode: [...modeParts].sort().join('+'),
          orientation,
          line: { shape },
          ...opacityPatch(args),
        },
      },
      ...marginalSpecs(marginalX, marginalY),
    ],
    groupers,
    orientation,
    marginalX,
    marginalY,
    transform,
    valueLabels: { [varLetter]: varLabel },
    axisTitles: { [varLetter]: varLabel },
    ecdf: true,
  };
  return buildFigure(args, config);
}

/**
 * An ECDF plot (`px.ecdf`, plan E10.7): per group, a `scatter` step line (`line.shape: 'hv'`)
 * through the sorted values of `x` (or `y` for a horizontal one) and the share of rows at or below
 * each. `y` (`x` when horizontal) optionally weights the rows. `ecdfnorm` and `ecdfmode` as in px;
 * the cumulative axis starts at zero.
 *
 * @example
 * ```ts
 * const figure = ecdf(rows, { x: 'total_bill', color: 'sex' });
 * ```
 */
export const ecdf = expressFunction<EcdfOptions>(buildEcdf);
