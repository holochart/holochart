/**
 * Polar charts (plan E23.6): `scatterPolar`, `linePolar` and `barPolar`, px's
 * `scatter_polar` / `line_polar` / `bar_polar` — one `scatterpolar` or `barpolar` trace per group
 * on one `polar` subplot, with px's clockwise angular axis starting at the top.
 */
import { prepare, type Args } from '../core/args.ts';
import type { Config, Grouper, Role } from '../core/config.ts';
import { buildFigure } from '../core/engine.ts';
import { groupValue } from '../core/labels.ts';
import { expressFunction } from '../core/render.ts';
import { isMissing, type DataInput } from '../data/table.ts';
import type {
  AnimationOptions,
  ColumnRef,
  CommonOptions,
  ContinuousColorOptions,
  DiscreteColorOptions,
  ExpressFigure,
  HoverOptions,
  LineDashOptions,
  PatternOptions,
  SymbolOptions,
} from '../options.ts';
import { defined, opacityPatch, tailRoles } from './shared.ts';

/** Options every polar function takes. */
export interface PolarOptions
  extends CommonOptions, DiscreteColorOptions, HoverOptions, AnimationOptions {
  /** Column of radii. */
  readonly r?: ColumnRef;
  /** Column of angles (degrees) or angular categories (`'N'`, `'NNE'`, …). */
  readonly theta?: ColumnRef;
  /** Angular axis direction. Default `'clockwise'` (px). */
  readonly direction?: 'clockwise' | 'counterclockwise';
  /** Where the angular axis starts, in degrees counterclockwise from east. Default 90 (the top). */
  readonly startAngle?: number;
  /** Fixed radial range, in data units (a log axis takes data units too, as px). */
  readonly rangeR?: readonly [number, number];
  /** Angular sector drawn, `[start, end]` in degrees (`polar.sector`). */
  readonly rangeTheta?: readonly [number, number];
  /** Log radial axis. */
  readonly logR?: boolean;
}

/** Options of {@link scatterPolar}: px.scatter_polar's arguments in camelCase. */
export interface ScatterPolarOptions extends PolarOptions, ContinuousColorOptions, SymbolOptions {
  /** Column of marker sizes (area-proportional, the largest `sizeMax` px across). */
  readonly size?: ColumnRef;
  /** Diameter of the largest marker with `size`, in px. Default 20. */
  readonly sizeMax?: number;
  /** Column of text drawn at the points. */
  readonly text?: ColumnRef;
  /** Marker opacity, 0–1. */
  readonly opacity?: number;
}

/** Options of {@link linePolar}: px.line_polar's arguments in camelCase. */
export interface LinePolarOptions extends PolarOptions, SymbolOptions, LineDashOptions {
  /** Column splitting lines within a color group. */
  readonly lineGroup?: ColumnRef;
  /** Column of text drawn at the points. */
  readonly text?: ColumnRef;
  /** Show markers at the points. */
  readonly markers?: boolean;
  /** Close each line back to its first point. */
  readonly lineClose?: boolean;
  /** `line.shape`: `'linear'` (default) or `'spline'`. */
  readonly lineShape?: 'linear' | 'spline';
}

/** Options of {@link barPolar}: px.bar_polar's arguments in camelCase. */
export interface BarPolarOptions extends PolarOptions, ContinuousColorOptions, PatternOptions {
  /** Column of bar bases (the radius each bar starts at). */
  readonly base?: ColumnRef;
  /**
   * `'relative'` (px's default) and `'stack'` stack the groups' bars at each angle; `'overlay'`
   * draws them over each other (`layout.polar.barmode`).
   */
  readonly barmode?: 'relative' | 'stack' | 'overlay';
}

function sizeref(values: readonly unknown[], sizeMax: number): number {
  let max = 0;
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v) && v > max) max = v;
  return (2 * max) / sizeMax ** 2;
}

/**
 * The polar subplot's axes (px's `configure_polar_axes`): the direction and start of the angular
 * axis, category orders of `r` / `theta`, the radial axis' log type and range, and the sector.
 */
function configurePolar(args: Args, figure: ExpressFigure, extra: Record<string, unknown>): void {
  const opts = args.options;
  const polar = (figure.layout['polar'] ??= {}) as Record<string, unknown>;
  const angularaxis: Record<string, unknown> = {
    direction: opts['direction'] ?? 'clockwise',
    rotation: opts['startAngle'] ?? 90,
  };
  const radialaxis: Record<string, unknown> = {};
  for (const [key, axis] of [
    ['r', radialaxis],
    ['theta', angularaxis],
  ] as const) {
    const order = categoryArray(args, args.cols[key]);
    if (order) {
      axis['categoryorder'] = 'array';
      axis['categoryarray'] = order;
    }
  }
  const range = opts['rangeR'] as readonly number[] | undefined;
  if (opts['logR']) {
    radialaxis['type'] = 'log';
    if (range) radialaxis['range'] = range.map((v) => Math.log10(v));
  } else if (range) radialaxis['range'] = [...range];
  polar['angularaxis'] = angularaxis;
  polar['radialaxis'] = radialaxis;
  if (opts['rangeTheta'] !== undefined) polar['sector'] = [...(opts['rangeTheta'] as number[])];
  Object.assign(polar, extra);
}

/**
 * px's order of a column given in `categoryOrders`: the listed values, then (when the column also
 * groups the traces) the others in order of first appearance.
 */
function categoryArray(args: Args, column: string | undefined): unknown[] | undefined {
  if (column === undefined) return undefined;
  const listed = (
    args.options['categoryOrders'] as Record<string, readonly unknown[]> | undefined
  )?.[column];
  if (!listed) return undefined;
  const order = listed.map(groupValue);
  const grouping = ['color', 'symbol', 'lineDash', 'pattern', 'lineGroup', 'animationFrame'].some(
    (k) => args.cols[k as keyof Args['cols']] === column,
  );
  if (grouping) {
    const seen = new Set(order.map((v) => JSON.stringify([v])));
    for (const v of args.table.column(column)) {
      const g = groupValue(v);
      const key = JSON.stringify([g]);
      if (isMissing(g) || seen.has(key)) continue;
      seen.add(key);
      order.push(g);
    }
  }
  return order;
}

function buildScatterPolar(
  data: DataInput | null | undefined,
  options: ScatterPolarOptions,
): ExpressFigure {
  const args = prepare('scatterPolar', data, options as Record<string, unknown>);
  const attrs: Role[] = ['r', 'theta', 'size', 'hoverName', 'text', ...tailRoles(args)];
  const groupers: Grouper[] = [
    { variable: 'color', path: 'marker.color' },
    { variable: 'symbol', path: 'marker.symbol' },
    { variable: 'animationFrame' },
  ];
  const config: Config = {
    specs: [
      {
        type: 'scatterpolar',
        attrs,
        patch: {
          mode: args.cols.text !== undefined ? 'markers+text' : 'markers',
          ...opacityPatch(args),
        },
      },
    ],
    groupers,
    continuousColor: 'marker',
    subplotType: 'polar',
    ...(args.cols.size !== undefined
      ? { sizeref: sizeref(args.table.column(args.cols.size), options.sizeMax ?? 20) }
      : {}),
  };
  const figure = buildFigure(args, config);
  configurePolar(args, figure, {});
  return figure;
}

function buildLinePolar(
  data: DataInput | null | undefined,
  options: LinePolarOptions,
): ExpressFigure {
  const args = prepare('linePolar', data, options as Record<string, unknown>);
  const attrs: Role[] = ['r', 'theta', 'hoverName', 'text', ...tailRoles(args, false)];
  const groupers: Grouper[] = [
    { variable: 'color', path: 'line.color' },
    { variable: 'dash', path: 'line.dash' },
    { variable: 'symbol', path: 'marker.symbol' },
    { variable: 'animationFrame' },
    { variable: 'lineGroup' },
  ];
  // px's mode for line functions: lines, markers with text / symbol / markers, and text.
  const modes = ['lines'];
  const text = args.cols.text !== undefined;
  if (text || args.cols.symbol !== undefined || options.markers) modes.push('markers');
  if (text) modes.push('text');
  const patch: Record<string, unknown> = { mode: modes.sort().join('+') };
  if (options.lineShape !== undefined) patch['line'] = { shape: options.lineShape };
  const config: Config = {
    specs: [{ type: 'scatterpolar', attrs, patch }],
    groupers,
    subplotType: 'polar',
    // px's `line_close`: each trace's first row again at the end.
    ...(options.lineClose
      ? {
          transform: (rows: readonly number[]) => ({
            rows: rows.length ? [...rows, rows[0] as number] : [],
          }),
        }
      : {}),
  };
  const figure = buildFigure(args, config);
  configurePolar(args, figure, {});
  return figure;
}

function buildBarPolar(
  data: DataInput | null | undefined,
  options: BarPolarOptions,
): ExpressFigure {
  const args = prepare('barPolar', data, options as Record<string, unknown>);
  const attrs: Role[] = ['base', 'r', 'theta', 'hoverName', ...tailRoles(args)];
  const groupers: Grouper[] = [{ variable: 'color', path: 'marker.color' }];
  if (args.cols.pattern !== undefined)
    groupers.push({ variable: 'pattern', path: 'marker.pattern.shape' });
  groupers.push({ variable: 'animationFrame' });
  const barmode = options.barmode ?? 'relative';
  const config: Config = {
    specs: [{ type: 'barpolar', attrs, patch: {} }],
    groupers,
    continuousColor: 'marker',
    subplotType: 'polar',
    // px writes the cartesian `barmode`; polar bars read `polar.barmode` (below).
    layoutPatch: defined({ barmode }),
  };
  const figure = buildFigure(args, config);
  configurePolar(args, figure, barmode === 'overlay' ? { barmode: 'overlay' } : {});
  return figure;
}

/**
 * A polar scatter plot (`px.scatter_polar`): one `scatterpolar` trace (`mode: 'markers'`) per
 * group of `color` / `symbol` values and per frame, at radius `r` and angle `theta`.
 *
 * @example
 * ```ts
 * const figure = scatterPolar(wind, { r: 'frequency', theta: 'direction', color: 'strength' });
 * ```
 */
export const scatterPolar = expressFunction<ScatterPolarOptions>(buildScatterPolar);

/**
 * A polar line chart (`px.line_polar`): one `scatterpolar` line per group of `color` /
 * `lineDash` / `symbol` / `lineGroup` values, in data order; `lineClose` closes each line.
 */
export const linePolar = expressFunction<LinePolarOptions>(buildLinePolar);

/**
 * A polar bar chart (`px.bar_polar`), such as a wind rose: one `barpolar` trace per `color` /
 * `pattern` group, the groups' bars stacked at each angle.
 *
 * @example
 * ```ts
 * const figure = barPolar(wind, { r: 'frequency', theta: 'direction', color: 'strength' });
 * ```
 */
export const barPolar = expressFunction<BarPolarOptions>(buildBarPolar);
