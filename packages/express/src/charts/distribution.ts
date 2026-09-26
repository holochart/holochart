/**
 * Distributions (plan E23.6): `histogram`, `box`, `violin` and `strip`, as px builds them — one
 * trace per group, aligned side by side in `group` mode.
 */
import { prepare } from '../core/args.ts';
import type { Config, Grouper, Role } from '../core/config.ts';
import { buildFigure } from '../core/engine.ts';
import { expressFunction } from '../core/render.ts';
import type { DataInput } from '../data/table.ts';
import type {
  AnimationOptions,
  AxisOptions,
  CommonOptions,
  DiscreteColorOptions,
  ExpressFigure,
  FacetOptions,
  HoverOptions,
  MarginalKind,
  PatternOptions,
  XYOptions,
} from '../options.ts';
import { defined, groupMode, inferOrientation, marginalSpecs, opacityPatch } from './shared.ts';

/** Options of {@link histogram}: px.histogram's arguments in camelCase. */
export interface HistogramOptions
  extends
    CommonOptions,
    XYOptions,
    DiscreteColorOptions,
    PatternOptions,
    HoverOptions,
    FacetOptions,
    AnimationOptions,
    AxisOptions {
  /** Aggregation of the other column (`y` of a vertical histogram): default `'count'`, `'sum'` when both x and y are given. */
  readonly histfunc?: 'count' | 'sum' | 'avg' | 'min' | 'max';
  /** `''` (counts), `'percent'`, `'probability'`, `'density'`, `'probability density'`. */
  readonly histnorm?: 'percent' | 'probability' | 'density' | 'probability density';
  /** `layout.barnorm`: `'fraction'` or `'percent'` of each bin's total. */
  readonly barnorm?: 'fraction' | 'percent';
  /** `layout.barmode`: `'relative'` (default), `'group'`, `'overlay'`, `'stack'`. */
  readonly barmode?: 'relative' | 'group' | 'overlay' | 'stack';
  /** Maximum number of bins (`nbinsx`, or `nbinsy` horizontal). */
  readonly nbins?: number;
  /** Cumulative histogram. */
  readonly cumulative?: boolean;
  /** Distribution of the same values drawn alongside (above a vertical histogram). */
  readonly marginal?: MarginalKind;
  /** Bar opacity, 0–1. */
  readonly opacity?: number;
}

/** Options shared by {@link box}, {@link violin} and {@link strip}. */
interface CategoricalOptions
  extends
    CommonOptions,
    XYOptions,
    DiscreteColorOptions,
    HoverOptions,
    FacetOptions,
    AnimationOptions,
    AxisOptions {}

/** Options of {@link box}: px.box's arguments in camelCase. */
export interface BoxOptions extends CategoricalOptions {
  /** `layout.boxmode`: `'group'` or `'overlay'` (default: `'overlay'` when `color` is the category axis). */
  readonly boxmode?: 'group' | 'overlay';
  /** Which points to draw: `'outliers'` (Plotly's default), `'suspectedoutliers'`, `'all'`, `false`. */
  readonly points?: 'outliers' | 'suspectedoutliers' | 'all' | false;
  /** Notched boxes (confidence interval of the median). */
  readonly notched?: boolean;
}

/** Options of {@link violin}: px.violin's arguments in camelCase. */
export interface ViolinOptions extends CategoricalOptions {
  /** `layout.violinmode`: `'group'` or `'overlay'`. */
  readonly violinmode?: 'group' | 'overlay';
  /** Which points to draw: `'outliers'`, `'suspectedoutliers'`, `'all'`, `false`. */
  readonly points?: 'outliers' | 'suspectedoutliers' | 'all' | false;
  /** Draw a box inside each violin. */
  readonly box?: boolean;
}

/** Options of {@link strip}: px.strip's arguments in camelCase (as traces-stats' `strip()`). */
export interface StripOptions extends CategoricalOptions {
  /** `'group'` (default): color groups side by side at each category; `'overlay'`: on one strip. */
  readonly stripmode?: 'group' | 'overlay';
  /** Spread of the points across the strip, 0–1 (the box `jitter`). Plotly's default: 0.3. */
  readonly jitter?: number;
}

function buildHistogram(
  data: DataInput | null | undefined,
  options: HistogramOptions,
): ExpressFigure {
  const args = prepare('histogram', data, options as Record<string, unknown>);
  const orientation = inferOrientation(args, 'value');
  const both = args.cols.x !== undefined && args.cols.y !== undefined;
  const histfunc = options.histfunc ?? (both ? 'sum' : undefined);
  const attrs: Role[] = ['x', 'y', 'hoverName', 'hoverData'];
  const groupers: Grouper[] = [{ variable: 'color', path: 'marker.color' }];
  if (args.cols.pattern !== undefined)
    groupers.push({ variable: 'pattern', path: 'marker.pattern.shape' });
  groupers.push({ variable: 'animationFrame' }, { variable: 'facetRow' }, { variable: 'facetCol' });
  const marginalX = orientation === 'v' ? options.marginal : undefined;
  const marginalY = orientation === 'h' ? options.marginal : undefined;
  const patch = defined({
    histnorm: options.histnorm,
    histfunc,
    nbinsx: orientation === 'v' ? options.nbins : undefined,
    nbinsy: orientation === 'h' ? options.nbins : undefined,
    bingroup: orientation === 'v' ? 'x' : 'y',
    orientation,
    ...opacityPatch(args),
  });
  if (options.cumulative) patch['cumulative'] = { enabled: true };
  const config: Config = {
    specs: [{ type: 'histogram', attrs, patch }, ...marginalSpecs(marginalX, marginalY)],
    groupers,
    orientation,
    aggregation: defined({
      histfunc: histfunc ?? 'count',
      histnorm: options.histnorm,
      barnorm: options.barnorm,
    }),
    layoutPatch: defined({ barmode: options.barmode ?? 'relative', barnorm: options.barnorm }),
    marginalX,
    marginalY,
  };
  return buildFigure(args, config);
}

function buildCategorical(
  kind: 'box' | 'violin' | 'strip',
  data: DataInput | null | undefined,
  options: BoxOptions & ViolinOptions & StripOptions,
): ExpressFigure {
  const args = prepare(kind, data, options as Record<string, unknown>);
  const orientation = inferOrientation(args, 'category');
  const attrs: Role[] = ['x', 'y', 'hoverName', 'animationGroup', 'customData', 'hoverData'];
  const groupers: Grouper[] = [
    { variable: 'color', path: 'marker.color' },
    { variable: 'animationFrame' },
    { variable: 'facetRow' },
    { variable: 'facetCol' },
  ];
  let type = 'box';
  let patch: Record<string, unknown>;
  let modeKey = 'boxmode';
  let mode: unknown;
  if (kind === 'box') {
    patch = defined({ boxpoints: options.points, notched: options.notched ?? false });
    mode = options.boxmode;
  } else if (kind === 'violin') {
    type = 'violin';
    modeKey = 'violinmode';
    patch = defined({
      points: options.points,
      box: { visible: options.box ?? false },
      scalegroup: 'True',
    });
    mode = options.violinmode;
  } else {
    patch = defined({
      boxpoints: 'all',
      pointpos: 0,
      hoveron: 'points',
      fillcolor: 'rgba(255,255,255,0)',
      line: { color: 'rgba(255,255,255,0)' },
      jitter: options.jitter,
    });
    mode = options.stripmode;
  }
  // px: a lone box sits at the category ' ' (so boxes without x / y line up).
  Object.assign(patch, { x0: ' ', y0: ' ', orientation });
  const config: Config = {
    specs: [{ type, attrs, patch }],
    groupers,
    orientation,
    layoutPatch: { [modeKey]: groupMode(args, orientation, mode) },
  };
  return buildFigure(args, config);
}

/**
 * A histogram (`px.histogram`): one `histogram` trace per group, sharing bins (`bingroup`),
 * stacked by default. With both x and y, y is summed per x bin (`histfunc: 'sum'`). `marginal`
 * draws the same values' distribution above it.
 *
 * @example
 * ```ts
 * const figure = histogram(rows, { x: 'total_bill', color: 'sex', facetCol: 'day', facetColWrap: 2 });
 * ```
 */
export const histogram = expressFunction<HistogramOptions>(buildHistogram);

/** A box plot (`px.box`): one `box` trace per group, side by side in `group` mode. */
export const box = expressFunction<BoxOptions>((data, options) =>
  buildCategorical('box', data, options as BoxOptions & ViolinOptions & StripOptions),
);

/** A violin plot (`px.violin`): one `violin` trace per group, scaled together (`scalegroup`). */
export const violin = expressFunction<ViolinOptions>((data, options) =>
  buildCategorical('violin', data, options as BoxOptions & ViolinOptions & StripOptions),
);

/**
 * A strip plot (`px.strip`): every observation as a jittered point at its category — `box`
 * traces with `boxpoints: 'all'` and an invisible box, one per group. The same figure as
 * traces-stats' `strip()`, with Express's data, facets and animation.
 */
export const strip = expressFunction<StripOptions>((data, options) =>
  buildCategorical('strip', data, options as BoxOptions & ViolinOptions & StripOptions),
);
