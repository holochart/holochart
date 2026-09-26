/**
 * 2D densities (plan E23.6): `densityHeatmap` (a `histogram2d` on the shared `coloraxis`) and
 * `densityContour` (`histogram2dcontour` lines, one trace per color group), with marginals.
 */
import { prepare } from '../core/args.ts';
import type { Config, Grouper, Role } from '../core/config.ts';
import { buildFigure, colorscaleAttributes } from '../core/engine.ts';
import { decoratedLabel } from '../core/labels.ts';
import { expressFunction } from '../core/render.ts';
import type { DataInput } from '../data/table.ts';
import type {
  AnimationOptions,
  AxisOptions,
  ColumnRef,
  CommonOptions,
  ContinuousColorOptions,
  DiscreteColorOptions,
  ExpressFigure,
  FacetOptions,
  HoverOptions,
  MarginalOptions,
} from '../options.ts';
import { defined, marginalSpecs } from './shared.ts';

/** Options common to both density functions. */
interface DensityOptions
  extends
    CommonOptions,
    HoverOptions,
    FacetOptions,
    AnimationOptions,
    AxisOptions,
    MarginalOptions {
  /** Column of x values. */
  readonly x?: ColumnRef;
  /** Column of y values. */
  readonly y?: ColumnRef;
  /** Column aggregated per cell by `histfunc` (default: counts of rows). */
  readonly z?: ColumnRef;
  /** Aggregation of `z`: default `'count'`, `'sum'` when `z` is given. */
  readonly histfunc?: 'count' | 'sum' | 'avg' | 'min' | 'max';
  /** `'percent'`, `'probability'`, `'density'`, `'probability density'`. */
  readonly histnorm?: 'percent' | 'probability' | 'density' | 'probability density';
  /** Maximum number of x bins. */
  readonly nbinsx?: number;
  /** Maximum number of y bins. */
  readonly nbinsy?: number;
}

/** Options of {@link densityHeatmap}: px.density_heatmap's arguments in camelCase. */
export interface DensityHeatmapOptions extends DensityOptions, ContinuousColorOptions {}

/** Options of {@link densityContour}: px.density_contour's arguments in camelCase. */
export interface DensityContourOptions extends DensityOptions, DiscreteColorOptions {}

function build(
  kind: 'densityHeatmap' | 'densityContour',
  data: DataInput | null | undefined,
  options: DensityHeatmapOptions & DensityContourOptions,
): ExpressFigure {
  const args = prepare(kind, data, options as Record<string, unknown>);
  const histfunc = options.histfunc ?? (args.cols.z !== undefined ? 'sum' : undefined);
  const attrs: Role[] = ['x', 'y', 'z', 'hoverName', 'hoverData'];
  const heatmap = kind === 'densityHeatmap';
  const groupers: Grouper[] = heatmap ? [] : [{ variable: 'color', path: 'line.color' }];
  groupers.push({ variable: 'animationFrame' }, { variable: 'facetRow' }, { variable: 'facetCol' });
  const patch: Record<string, unknown> = defined({
    histfunc,
    histnorm: options.histnorm,
    nbinsx: options.nbinsx,
    nbinsy: options.nbinsy,
    xbingroup: 'x',
    ybingroup: 'y',
  });
  if (heatmap) patch['coloraxis'] = 'coloraxis';
  else patch['contours'] = { coloring: 'none' };
  const config: Config = {
    specs: [
      { type: heatmap ? 'histogram2d' : 'histogram2dcontour', attrs, patch },
      // Without color groups, marginals take the colorway's first color.
      ...marginalSpecs(
        options.marginalX,
        options.marginalY,
        heatmap || args.cols.color === undefined ? args.colorway[0] : undefined,
      ),
    ],
    groupers,
    aggregation: defined({ histfunc: histfunc ?? 'count', histnorm: options.histnorm }),
    marginalX: options.marginalX,
    marginalY: options.marginalY,
  };
  const figure = buildFigure(args, config);
  if (heatmap) {
    // The colorbar names the aggregate (`count`, `sum of tip`), as px's `coloraxis1`.
    const zLabel = decoratedLabel(args, config, args.cols.z, 'z');
    const coloraxis = { colorbar: { title: { text: zLabel } }, ...colorscaleAttributes(args) };
    figure.layout['coloraxis'] = coloraxis;
  }
  return figure;
}

/**
 * A density heatmap (`px.density_heatmap`): a `histogram2d` per facet / frame counting the rows
 * in each x-y bin (or aggregating `z`), colored on `layout.coloraxis`. Marginals share its axes.
 *
 * @example
 * ```ts
 * const figure = densityHeatmap(rows, { x: 'total_bill', y: 'tip', marginalX: 'histogram' });
 * ```
 */
export const densityHeatmap = expressFunction<DensityHeatmapOptions>((data, options) =>
  build('densityHeatmap', data, options as DensityHeatmapOptions & DensityContourOptions),
);

/**
 * A density contour plot (`px.density_contour`): `histogram2dcontour` contour lines
 * (`contours.coloring: 'none'`), one trace per `color` group in its color.
 */
export const densityContour = expressFunction<DensityContourOptions>((data, options) =>
  build('densityContour', data, options as DensityHeatmapOptions & DensityContourOptions),
);
