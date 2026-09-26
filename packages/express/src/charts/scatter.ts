/**
 * `scatter`, `line` and `area` (plan E23.6): px's scatter-family functions, one `scatter` trace
 * per group.
 */
import { prepare } from '../core/args.ts';
import type { Config, Grouper, Role } from '../core/config.ts';
import { buildFigure } from '../core/engine.ts';
import { expressFunction } from '../core/render.ts';
import type {
  AnimationOptions,
  AxisOptions,
  ColumnRef,
  CommonOptions,
  ContinuousColorOptions,
  DiscreteColorOptions,
  ErrorBarOptions,
  ExpressFigure,
  FacetOptions,
  HoverOptions,
  LineDashOptions,
  MarginalOptions,
  SymbolOptions,
  XYOptions,
} from '../options.ts';
import type { DataInput } from '../data/table.ts';
import { defined, inferOrientation, marginalSpecs, opacityPatch, tailRoles } from './shared.ts';

/** Options of {@link scatter}: px.scatter's arguments in camelCase. */
export interface ScatterOptions
  extends
    CommonOptions,
    XYOptions,
    DiscreteColorOptions,
    ContinuousColorOptions,
    HoverOptions,
    FacetOptions,
    AnimationOptions,
    AxisOptions,
    SymbolOptions,
    ErrorBarOptions,
    MarginalOptions {
  /** Column of marker sizes (area-proportional, the largest `sizeMax` px across). */
  readonly size?: ColumnRef;
  /** Diameter of the largest marker with `size`, in px. Default 20. */
  readonly sizeMax?: number;
  /** Column of text drawn at the points (`mode: 'markers+text'`). */
  readonly text?: ColumnRef;
  /** Marker opacity, 0–1. */
  readonly opacity?: number;
}

/** Options of {@link line}. */
export interface LineOptions
  extends
    CommonOptions,
    XYOptions,
    DiscreteColorOptions,
    HoverOptions,
    FacetOptions,
    AnimationOptions,
    AxisOptions,
    SymbolOptions,
    LineDashOptions,
    ErrorBarOptions {
  /** Column splitting lines within a color group (one line per value, same color and legend item). */
  readonly lineGroup?: ColumnRef;
  /** Column of text drawn at the points. */
  readonly text?: ColumnRef;
  /** Show markers at the points. */
  readonly markers?: boolean;
  /** `line.shape`: `'linear'` (default), `'spline'`, `'hv'`, `'vh'`, `'hvh'`, `'vhv'`. */
  readonly lineShape?: string;
}

/** Options of {@link area}. */
export interface AreaOptions extends Omit<
  LineOptions,
  'lineDash' | 'lineDashSequence' | 'lineDashMap'
> {
  /** Normalize the stacks: `'fraction'` or `'percent'` of each x's total. */
  readonly groupnorm?: 'fraction' | 'percent';
}

function modes(
  args: { cols: Record<string, unknown>; options: Readonly<Record<string, unknown>> },
  base: string[],
): string {
  const set = new Set(base);
  if (args.options['markers']) set.add('markers');
  if (args.cols['text'] !== undefined) set.add('text');
  if (set.size === 0) set.add('lines');
  return [...set].sort().join('+');
}

function sizeref(values: readonly unknown[], sizeMax: number): number {
  let max = 0;
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v) && v > max) max = v;
  return (2 * max) / sizeMax ** 2;
}

function buildScatter(data: DataInput | null | undefined, options: ScatterOptions): ExpressFigure {
  const args = prepare('scatter', data, options as Record<string, unknown>);
  const orientation = inferOrientation(args, 'value');
  const attrs: Role[] = [
    'x',
    'y',
    'size',
    'hoverName',
    'text',
    'errorX',
    'errorXMinus',
    'errorY',
    'errorYMinus',
    ...tailRoles(args),
  ];
  const groupers: Grouper[] = [
    { variable: 'color', path: 'marker.color' },
    { variable: 'symbol', path: 'marker.symbol' },
    { variable: 'animationFrame' },
    { variable: 'facetRow' },
    { variable: 'facetCol' },
  ];
  const config: Config = {
    specs: [
      {
        type: 'scatter',
        attrs,
        patch: { mode: modes(args, ['markers']), orientation, ...opacityPatch(args) },
      },
      ...marginalSpecs(options.marginalX, options.marginalY),
    ],
    groupers,
    continuousColor: 'marker',
    orientation,
    marginalX: options.marginalX,
    marginalY: options.marginalY,
    ...(args.cols.size !== undefined
      ? { sizeref: sizeref(args.table.column(args.cols.size), options.sizeMax ?? 20) }
      : {}),
  };
  return buildFigure(args, config);
}

function buildLine(
  fn: 'line' | 'area',
  data: DataInput | null | undefined,
  options: LineOptions & AreaOptions,
): ExpressFigure {
  const args = prepare(fn, data, options as Record<string, unknown>);
  const orientation = inferOrientation(args, 'value');
  const attrs: Role[] = [
    'x',
    'y',
    'hoverName',
    'text',
    'errorX',
    'errorXMinus',
    'errorY',
    'errorYMinus',
    ...tailRoles(args, false),
  ];
  const groupers: Grouper[] = [{ variable: 'color', path: 'line.color' }];
  if (fn === 'line') groupers.push({ variable: 'dash', path: 'line.dash' });
  groupers.push(
    { variable: 'symbol', path: 'marker.symbol' },
    { variable: 'animationFrame' },
    { variable: 'facetRow' },
    { variable: 'facetCol' },
    { variable: 'lineGroup' },
  );
  const base = ['lines'];
  if (args.cols.symbol !== undefined) base.push('markers');
  const patch: Record<string, unknown> = defined({
    mode: modes(args, base),
    orientation,
    ...(fn === 'area' ? { stackgroup: '1', groupnorm: options.groupnorm } : {}),
  });
  if (options.lineShape !== undefined) patch['line'] = { shape: options.lineShape };
  const config: Config = {
    specs: [{ type: 'scatter', attrs, patch }],
    groupers,
    orientation,
  };
  return buildFigure(args, config);
}

/**
 * A scatter plot (`px.scatter`): one `scatter` trace (`mode: 'markers'`) per group of `color` /
 * `symbol` values, per facet and per frame. A numeric `color` is a colorscale on `coloraxis`
 * instead; `size` scales marker areas; `marginalX` / `marginalY` add distributions above / right.
 *
 * @example
 * ```ts
 * const figure = scatter(rows, { x: 'gdpPercap', y: 'lifeExp', color: 'continent', logX: true });
 * ```
 */
export const scatter = expressFunction<ScatterOptions>(buildScatter);

/**
 * A line chart (`px.line`): one `scatter` trace (`mode: 'lines'`) per group of `color` /
 * `lineDash` / `symbol` / `lineGroup` values, in data order (sort the data by x first).
 */
export const line = expressFunction<LineOptions>((data, options) =>
  buildLine('line', data, options),
);

/**
 * A stacked area chart (`px.area`): one `scatter` trace per group, stacked with `stackgroup: '1'`
 * and filled to the previous one; `groupnorm` stacks to fractions or percents.
 */
export const area = expressFunction<AreaOptions>((data, options) =>
  buildLine('area', data, options as LineOptions & AreaOptions),
);
