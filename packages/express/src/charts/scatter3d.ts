/**
 * 3D charts (plan E23.6): `scatter3d` and `line3d`, px's `scatter_3d` / `line_3d` — one
 * `scatter3d` trace per group on one `scene` subplot, with axis titles, types, ranges and category
 * orders on the scene's axes (px's `configure_3d_axes`). Like px, no facets or marginals.
 */
import { frameRange } from '../core/animation.ts';
import { prepare, type Args } from '../core/args.ts';
import type { Config, Grouper, Role } from '../core/config.ts';
import { buildFigure } from '../core/engine.ts';
import { groupValue } from '../core/labels.ts';
import { expressFunction } from '../core/render.ts';
import { isMissing, type DataInput } from '../data/table.ts';
import type {
  AnimationFrameOptions,
  ColumnRef,
  CommonOptions,
  ContinuousColorOptions,
  DiscreteColorOptions,
  ExpressFigure,
  HoverOptions,
  LineDashOptions,
  SymbolOptions,
} from '../options.ts';
import { continuousColor, opacityPatch, tailRoles } from './shared.ts';

/** Options every 3D function takes: the columns, error bars and the scene's axes. */
export interface Chart3dOptions
  extends CommonOptions, DiscreteColorOptions, HoverOptions, AnimationFrameOptions, SymbolOptions {
  /** Column of x values. */
  readonly x?: ColumnRef;
  /** Column of y values. */
  readonly y?: ColumnRef;
  /** Column of z values (up, in the default camera). */
  readonly z?: ColumnRef;
  /** Column of text drawn at the points (adds `text` to `mode`). */
  readonly text?: ColumnRef;
  /** Column of x error sizes (`error_x.array`). */
  readonly errorX?: ColumnRef;
  /** Column of x error sizes below (`error_x.arrayminus`). */
  readonly errorXMinus?: ColumnRef;
  /** Column of y error sizes (`error_y.array`). */
  readonly errorY?: ColumnRef;
  /** Column of y error sizes below (`error_y.arrayminus`). */
  readonly errorYMinus?: ColumnRef;
  /** Column of z error sizes (`error_z.array`). */
  readonly errorZ?: ColumnRef;
  /** Column of z error sizes below (`error_z.arrayminus`). */
  readonly errorZMinus?: ColumnRef;
  /** Log x axis (`scene.xaxis.type: 'log'`). */
  readonly logX?: boolean;
  /** Log y axis. */
  readonly logY?: boolean;
  /** Log z axis. */
  readonly logZ?: boolean;
  /** Fixed x range, in data units (log axes take data units too, as px). */
  readonly rangeX?: readonly [unknown, unknown];
  /** Fixed y range, in data units. */
  readonly rangeY?: readonly [unknown, unknown];
  /** Fixed z range, in data units. */
  readonly rangeZ?: readonly [unknown, unknown];
}

/** Options of {@link scatter3d}: px.scatter_3d's arguments in camelCase. */
export interface Scatter3dOptions extends Chart3dOptions, ContinuousColorOptions {
  /** Column of marker sizes (area-proportional, the largest `sizeMax` px across). */
  readonly size?: ColumnRef;
  /** Diameter of the largest marker with `size`, in px. Default 20. */
  readonly sizeMax?: number;
  /** Marker opacity, 0–1. */
  readonly opacity?: number;
}

/** Options of {@link line3d}: px.line_3d's arguments in camelCase. */
export interface Line3dOptions extends Chart3dOptions, LineDashOptions {
  /** Column splitting lines within a color group (one line per value, same color and legend item). */
  readonly lineGroup?: ColumnRef;
  /** Show markers at the points. */
  readonly markers?: boolean;
}

const ERROR_ROLES: readonly Role[] = [
  'errorX',
  'errorXMinus',
  'errorY',
  'errorYMinus',
  'errorZ',
  'errorZMinus',
];

function sizeref(values: readonly unknown[], sizeMax: number): number {
  let max = 0;
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v) && v > max) max = v;
  return (2 * max) / sizeMax ** 2;
}

/** Options naming the columns that group the traces (px's `grouper`), when given. */
const GROUPING = ['symbol', 'lineDash', 'lineGroup', 'animationFrame'] as const;

/**
 * px's order of an axis column (from `get_orderings`): the values listed in `categoryOrders`, then,
 * when the column also groups the traces, its other values in order of first appearance.
 */
function axisOrder(
  args: Args,
  column: string | undefined,
  continuous: boolean,
): unknown[] | undefined {
  if (column === undefined) return undefined;
  const listed = (
    args.options['categoryOrders'] as Record<string, readonly unknown[]> | undefined
  )?.[column];
  const grouping =
    (args.cols.color === column && !continuous) || GROUPING.some((k) => args.cols[k] === column);
  if (!listed && !grouping) return undefined;
  const order = (listed ?? []).map(groupValue);
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

/**
 * The scene's axes (px's `configure_3d_axes`): titles from the column labels, log types, ranges
 * (log axes take data units, written in log units) and category orders. Animated figures without
 * a range get one fixed over every frame's numeric values (a Holochart default, as `rangeX` /
 * `rangeY` on cartesian charts and `rangeR` on polar ones).
 */
function configureScene(args: Args, figure: ExpressFigure, continuous: boolean): void {
  const scene = (figure.layout['scene'] ??= {}) as Record<string, unknown>;
  for (const letter of ['x', 'y', 'z'] as const) {
    const upper = letter.toUpperCase();
    const axis: Record<string, unknown> = {};
    const column = args.cols[letter];
    if (column !== undefined) axis['title'] = { text: args.label(column) };
    const log = Boolean(args.options[`log${upper}`]);
    const range = args.options[`range${upper}`] as readonly unknown[] | undefined;
    if (log) axis['type'] = 'log';
    if (range) axis['range'] = log ? range.map((r) => Math.log10(Number(r))) : [...range];
    else if (figure.frames && column !== undefined && args.table.type(column) === 'numeric') {
      const fixed = frameRange(figure.frames, letter, (t) => t['type'] === 'scatter3d', log, false);
      if (fixed) axis['range'] = fixed;
    }
    const order = axisOrder(args, column, continuous);
    if (order) {
      axis['categoryorder'] = 'array';
      axis['categoryarray'] = order;
    }
    scene[`${letter}axis`] = axis;
  }
}

function buildScatter3d(
  data: DataInput | null | undefined,
  options: Scatter3dOptions,
): ExpressFigure {
  const args = prepare('scatter3d', data, options as Record<string, unknown>);
  const attrs: Role[] = [
    'x',
    'y',
    'z',
    'size',
    'hoverName',
    'text',
    ...ERROR_ROLES,
    ...tailRoles(args),
  ];
  const groupers: Grouper[] = [
    { variable: 'color', path: 'marker.color' },
    { variable: 'symbol', path: 'marker.symbol' },
    { variable: 'animationFrame' },
  ];
  const config: Config = {
    specs: [
      {
        type: 'scatter3d',
        attrs,
        patch: {
          mode: args.cols.text !== undefined ? 'markers+text' : 'markers',
          ...opacityPatch(args),
        },
      },
    ],
    groupers,
    continuousColor: 'marker',
    subplotType: 'scene',
    ...(args.cols.size !== undefined
      ? { sizeref: sizeref(args.table.column(args.cols.size), options.sizeMax ?? 20) }
      : {}),
  };
  const figure = buildFigure(args, config);
  configureScene(args, figure, continuousColor(args));
  return figure;
}

function buildLine3d(data: DataInput | null | undefined, options: Line3dOptions): ExpressFigure {
  const args = prepare('line3d', data, options as Record<string, unknown>);
  const attrs: Role[] = [
    'x',
    'y',
    'z',
    'hoverName',
    'text',
    ...ERROR_ROLES,
    ...tailRoles(args, false),
  ];
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
  const config: Config = {
    specs: [{ type: 'scatter3d', attrs, patch: { mode: modes.sort().join('+') } }],
    groupers,
    subplotType: 'scene',
  };
  const figure = buildFigure(args, config);
  // px.line_3d has no continuous color: a numeric `color` groups the lines too.
  configureScene(args, figure, false);
  return figure;
}

/**
 * A 3D scatter plot (`px.scatter_3d`): one `scatter3d` trace (`mode: 'markers'`) per group of
 * `color` / `symbol` values and per frame, on one `scene`. A numeric `color` is a colorscale on
 * `coloraxis` instead; `size` scales marker areas. Rendering needs the 3D traces registered (the
 * `@mk7s/holochart` bundle, or `register(...traces3d)` from `@mk7s/holochart-traces-3d`).
 *
 * @example
 * ```ts
 * const figure = scatter3d(iris, {
 *   x: 'sepal_length', y: 'sepal_width', z: 'petal_width', color: 'species',
 * });
 * ```
 */
export const scatter3d = expressFunction<Scatter3dOptions>(buildScatter3d);

/**
 * A 3D line chart (`px.line_3d`): one `scatter3d` line per group of `color` / `lineDash` /
 * `symbol` / `lineGroup` values, in data order, on one `scene`; `markers` adds markers at the
 * points.
 *
 * @example
 * ```ts
 * const figure = line3d(flights, { x: 'lon', y: 'lat', z: 'altitude', color: 'flight' });
 * ```
 */
export const line3d = expressFunction<Line3dOptions>(buildLine3d);
