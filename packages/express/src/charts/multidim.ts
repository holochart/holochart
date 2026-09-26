/**
 * Multidimensional charts (plan E23.6): `scatterMatrix` (`splom`), `parallelCoordinates`
 * (`parcoords`) and `parallelCategories` (`parcats`), with the dimensions taken from the data's
 * columns as px takes them.
 */
import { prepare, type Args } from '../core/args.ts';
import type { Config, Grouper } from '../core/config.ts';
import { buildFigure } from '../core/engine.ts';
import { expressFunction } from '../core/render.ts';
import { isMissing, type DataInput } from '../data/table.ts';
import type {
  ColumnRef,
  CommonOptions,
  ContinuousColorOptions,
  DiscreteColorOptions,
  ExpressFigure,
  HoverOptions,
  SymbolOptions,
} from '../options.ts';
import { continuousColor, opacityPatch, tailRoles } from './shared.ts';

/** Options of {@link scatterMatrix}: px.scatter_matrix's arguments in camelCase. */
export interface ScatterMatrixOptions
  extends CommonOptions, DiscreteColorOptions, ContinuousColorOptions, HoverOptions, SymbolOptions {
  /** Columns to plot against each other. Default: every numeric column not used by another option. */
  readonly dimensions?: readonly ColumnRef[];
  /** Column of marker sizes. */
  readonly size?: ColumnRef;
  /** Diameter of the largest marker with `size`, in px. Default 20. */
  readonly sizeMax?: number;
  /** Marker opacity, 0–1. */
  readonly opacity?: number;
}

/** Options of {@link parallelCoordinates}: px.parallel_coordinates' arguments in camelCase. */
export interface ParallelCoordinatesOptions extends CommonOptions, ContinuousColorOptions {
  /** Axes, in order. Default: every numeric column. */
  readonly dimensions?: readonly ColumnRef[];
  /** Numeric column coloring the lines through a colorscale. */
  readonly color?: ColumnRef;
}

/** Options of {@link parallelCategories}: px.parallel_categories' arguments in camelCase. */
export interface ParallelCategoriesOptions extends CommonOptions, ContinuousColorOptions {
  /** Category axes, in order. Default: every column with at most `dimensionsMaxCardinality` values. */
  readonly dimensions?: readonly ColumnRef[];
  /** Numeric column coloring the ribbons through a colorscale. */
  readonly color?: ColumnRef;
  /** Most distinct values a column may have to be a default dimension. Default 50. */
  readonly dimensionsMaxCardinality?: number;
}

/** Default dimensions: the columns passing `keep`, minus those named by `exclude` options. */
function defaultDimensions(args: Args, keep: (name: string) => boolean, exclude: string[]): Args {
  if (args.lists.dimensions !== undefined) return args;
  const used = new Set(exclude.map((k) => args.cols[k as keyof Args['cols']]).filter(Boolean));
  const dims = args.table.names.filter((n) => !used.has(n) && keep(n));
  return { ...args, lists: { ...args.lists, dimensions: dims } };
}

function distinctCount(values: readonly unknown[], cap: number): number {
  const seen = new Set<unknown>();
  for (const v of values) {
    if (isMissing(v)) continue;
    seen.add(v);
    if (seen.size > cap) break;
  }
  return seen.size;
}

function buildMatrix(
  data: DataInput | null | undefined,
  options: ScatterMatrixOptions,
): ExpressFigure {
  const prepared = prepare('scatterMatrix', data, options as Record<string, unknown>);
  const args = defaultDimensions(prepared, (n) => prepared.table.type(n) === 'numeric', [
    'color',
    'symbol',
    'size',
    'hoverName',
  ]);
  const groupers: Grouper[] = [
    { variable: 'color', path: 'marker.color' },
    { variable: 'symbol', path: 'marker.symbol' },
  ];
  let sizeref: number | undefined;
  if (args.cols.size !== undefined) {
    const max = Math.max(
      0,
      ...args.table.column(args.cols.size).filter((v): v is number => typeof v === 'number'),
    );
    sizeref = (2 * max) / (options.sizeMax ?? 20) ** 2;
  }
  const config: Config = {
    specs: [
      {
        type: 'splom',
        attrs: ['size', 'hoverName', 'dimensions', ...tailRoles(args)],
        patch: { diagonal: { visible: false }, ...opacityPatch(args) },
      },
    ],
    groupers,
    continuousColor: 'marker',
    layoutPatch: { dragmode: 'select' },
    subplotType: 'splom',
    ...(sizeref !== undefined ? { sizeref } : {}),
  };
  return buildFigure(args, config);
}

function buildParallel(
  kind: 'parallelCoordinates' | 'parallelCategories',
  data: DataInput | null | undefined,
  options: ParallelCoordinatesOptions & ParallelCategoriesOptions,
): ExpressFigure {
  const prepared = prepare(kind, data, options as Record<string, unknown>);
  if (prepared.cols.color !== undefined && !continuousColor(prepared)) {
    throw new Error(
      `${kind}: color must be a numeric column (it maps to a colorscale); '${prepared.cols.color}' is not numeric.`,
    );
  }
  const cap = options.dimensionsMaxCardinality ?? 50;
  const args = defaultDimensions(
    prepared,
    kind === 'parallelCoordinates'
      ? (n) => prepared.table.type(n) === 'numeric'
      : (n) => distinctCount(prepared.table.column(n), cap) <= cap,
    [],
  );
  const config: Config = {
    specs: [
      {
        type: kind === 'parallelCoordinates' ? 'parcoords' : 'parcats',
        attrs: ['dimensions', ...(continuousColor(args) ? (['color'] as const) : [])],
        patch: {},
      },
    ],
    groupers: [],
    continuousColor: 'line',
    inlineColorscale: true,
    subplotType: 'domain',
  };
  return buildFigure(args, config);
}

/**
 * A scatter plot matrix (`px.scatter_matrix`): one `splom` trace per `color` / `symbol` group over
 * the `dimensions` (default: every numeric column not used for color, symbol, size or hover name),
 * without the diagonal; box and lasso selections highlight across cells (`dragmode: 'select'`).
 *
 * @example
 * ```ts
 * const figure = scatterMatrix(iris, { dimensions: ['sepalLength', 'sepalWidth', 'petalLength'], color: 'species' });
 * ```
 */
export const scatterMatrix = expressFunction<ScatterMatrixOptions>(buildMatrix);

/**
 * Parallel coordinates (`px.parallel_coordinates`): one `parcoords` trace over the numeric
 * `dimensions`, lines colored by a numeric `color` on `layout.coloraxis`.
 */
export const parallelCoordinates = expressFunction<ParallelCoordinatesOptions>((data, options) =>
  buildParallel(
    'parallelCoordinates',
    data,
    options as ParallelCoordinatesOptions & ParallelCategoriesOptions,
  ),
);

/**
 * Parallel categories (`px.parallel_categories`): one `parcats` trace over the categorical
 * `dimensions` (default: columns with at most 50 distinct values), ribbons colored by a numeric
 * `color` on `layout.coloraxis`.
 */
export const parallelCategories = expressFunction<ParallelCategoriesOptions>((data, options) =>
  buildParallel(
    'parallelCategories',
    data,
    options as ParallelCoordinatesOptions & ParallelCategoriesOptions,
  ),
);
