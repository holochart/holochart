/**
 * Options shared by the Express functions (plan E23.2): the camelCase counterparts of plotly.py
 * `px` arguments. Each function's options interface combines the groups it supports.
 */
import type { Template } from '@mk7s/holochart-core';

/**
 * A column: its name in the data, or the values themselves (an array as long as the data, as px
 * allows). An array gets the option's name as its column name (`x`, `color`, …) in labels and
 * hover text.
 */
export type ColumnRef = string | ArrayLike<unknown>;

/** A figure as Express builds it: plain JSON-like data, ready for `createChart` or `newPlot`. */
export interface ExpressFigure {
  /** Traces (the first frame's, when animated). */
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
  /** One frame per `animationFrame` value, when there are two or more. */
  frames?: { name: string; data: Record<string, unknown>[] }[];
}

/** A continuous colorscale: a named scale (`'Viridis'`), a list of colors, or `[position, color]` pairs. */
export type ContinuousScale = string | readonly string[] | readonly (readonly [number, string])[];

/** Options every Express function takes. */
export interface CommonOptions {
  /**
   * Display names of columns: `{ gdpPercap: 'GDP per capita' }`. Used for axis titles, hover
   * lines, the legend title, facet labels, the colorbar title and the animation slider.
   */
  readonly labels?: Readonly<Record<string, string>>;
  /** Figure title (`layout.title.text`). */
  readonly title?: string;
  /**
   * `layout.template`: a registered name (`'plotly-classic'`) or a template object. Default: unset,
   * so the chart's default template applies (Holochart's `holochart` look); its colorway, symbol
   * and dash cycles and sequential colorscale are what the figure's colors are taken from.
   */
  readonly template?: string | Template;
  /** Figure width in px (`layout.width`). */
  readonly width?: number;
  /** Figure height in px (`layout.height`). */
  readonly height?: number;
  /**
   * Value orders per column: `{ day: ['Thu', 'Fri', 'Sat', 'Sun'] }`. They order the traces and
   * legend (for grouping columns), facets, frames and category axes. Values not listed follow in
   * order of first appearance; listed values without rows still take a color and a facet (as px).
   */
  readonly categoryOrders?: Readonly<Record<string, readonly unknown[]>>;
}

/** Discrete color grouping: one trace (and legend item) per value of `color`. */
export interface DiscreteColorOptions {
  /** Column to color by. */
  readonly color?: ColumnRef;
  /** Colors for the values of `color`, in order. Default: the template's colorway. */
  readonly colorDiscreteSequence?: readonly string[];
  /**
   * Fixed colors per value of `color` (`{ Asia: 'red' }`); other values continue with the sequence.
   * `'identity'`: the values are colors themselves (no legend entries for them).
   */
  readonly colorDiscreteMap?: Readonly<Record<string, string>> | 'identity';
}

/**
 * Continuous color: when `color` is numeric, one colorscale on `layout.coloraxis` with a colorbar
 * instead of one trace per value.
 */
export interface ContinuousColorOptions {
  /** Colorscale of a numeric `color`. Default: the template's sequential colorscale. */
  readonly colorContinuousScale?: ContinuousScale;
  /** `[cmin, cmax]` of the colorscale. */
  readonly rangeColor?: readonly [number, number];
  /** `cmid`: the value at the middle of a diverging colorscale. */
  readonly colorContinuousMidpoint?: number;
}

/** Hover and custom data. */
export interface HoverOptions {
  /** Column shown in bold at the top of the hover label (`hovertext`). */
  readonly hoverName?: ColumnRef;
  /**
   * More columns for the hover label, through `customdata`: a list of columns, or an object that
   * adds columns (`true`), removes lines (`false`, e.g. `{ x: false }`) or formats them
   * (`':.2f'`, `'|%Y'`).
   */
  readonly hoverData?: readonly ColumnRef[] | Readonly<Record<string, boolean | string>>;
  /** Columns put in `customdata` (first, before `hoverData`'s), e.g. for click handlers. */
  readonly customData?: readonly ColumnRef[];
}

/** Faceting (plan E23.3): one subplot per value, in a grid. */
export interface FacetOptions {
  /** Column whose values make the rows of subplots (first value at the top). */
  readonly facetRow?: ColumnRef;
  /** Column whose values make the columns of subplots. */
  readonly facetCol?: ColumnRef;
  /**
   * Wrap `facetCol` after this many columns (row by row from the top). Ignored with `facetRow`
   * or a marginal. Default 0 (no wrapping).
   */
  readonly facetColWrap?: number;
  /** Space between facet rows, as a fraction of the plot height. Default 0.03 (0.07 wrapped). */
  readonly facetRowSpacing?: number;
  /** Space between facet columns, as a fraction of the plot width. Default 0.02. */
  readonly facetColSpacing?: number;
}

/** Animation frames from data (plan E23.4). */
export interface AnimationOptions {
  /**
   * Column of frame values: one frame per value (in `categoryOrders` / first-appearance order),
   * with a Play / Pause update menu and a slider. Axis ranges are fixed across frames.
   */
  readonly animationFrame?: ColumnRef;
  /** Column matching rows across frames (`ids`), so each object moves rather than being replaced. */
  readonly animationGroup?: ColumnRef;
}

/** Cartesian axis options. */
export interface AxisOptions {
  /** Log x axis (`type: 'log'`, on every facet). */
  readonly logX?: boolean;
  /** Log y axis. */
  readonly logY?: boolean;
  /** Fixed x range, in data units (log axes take data units too, as px). */
  readonly rangeX?: readonly [unknown, unknown];
  /** Fixed y range, in data units. */
  readonly rangeY?: readonly [unknown, unknown];
}

/** Marker symbol grouping. */
export interface SymbolOptions {
  /** Column whose values get different marker symbols (one trace per value). */
  readonly symbol?: ColumnRef;
  /** Symbols in order. Default: the template's scatter symbols, else circle, diamond, square, x, cross. */
  readonly symbolSequence?: readonly string[];
  /** Fixed symbols per value; `'identity'`: the values are symbols. */
  readonly symbolMap?: Readonly<Record<string, string>> | 'identity';
}

/** Line dash grouping. */
export interface LineDashOptions {
  /** Column whose values get different line dashes (one trace per value). */
  readonly lineDash?: ColumnRef;
  /** Dashes in order. Default: solid, dot, dash, longdash, dashdot, longdashdot. */
  readonly lineDashSequence?: readonly string[];
  /** Fixed dashes per value; `'identity'`: the values are dashes. */
  readonly lineDashMap?: Readonly<Record<string, string>> | 'identity';
}

/**
 * Pattern grouping: one trace per value with `marker.pattern.shape` set. Holochart draws fill
 * patterns from plan E8.10; until then the traces, legend and names are there, the pattern is not.
 */
export interface PatternOptions {
  /** Column whose values get different fill patterns. */
  readonly pattern?: ColumnRef;
  /** Shapes in order. Default: `''`, `/`, `\`, `x`, `+`, `.`. */
  readonly patternShapeSequence?: readonly string[];
  /** Fixed shapes per value; `'identity'`: the values are shapes. */
  readonly patternShapeMap?: Readonly<Record<string, string>> | 'identity';
}

/** Error bars from columns. */
export interface ErrorBarOptions {
  /** Column of x error sizes (`error_x.array`). */
  readonly errorX?: ColumnRef;
  /** Column of x error sizes below (`error_x.arrayminus`). */
  readonly errorXMinus?: ColumnRef;
  /** Column of y error sizes (`error_y.array`). */
  readonly errorY?: ColumnRef;
  /** Column of y error sizes below (`error_y.arrayminus`). */
  readonly errorYMinus?: ColumnRef;
}

/** Marginal distribution subplots (plan E10.8). */
export type MarginalKind = 'histogram' | 'box' | 'violin' | 'rug';

/** Marginals above (`marginalX`) and right of (`marginalY`) the main plot. */
export interface MarginalOptions {
  /** Distribution of x drawn above the plot, sharing its x axis. */
  readonly marginalX?: MarginalKind;
  /** Distribution of y drawn right of the plot, sharing its y axis. */
  readonly marginalY?: MarginalKind;
}

/** `x` / `y` columns and the orientation. */
export interface XYOptions {
  /** Column of x values. */
  readonly x?: ColumnRef;
  /** Column of y values. */
  readonly y?: ColumnRef;
  /**
   * `'v'` or `'h'`. Default as px: `'h'` when only the value column of a horizontal chart is
   * given or when x is numeric and y is not, else `'v'`.
   */
  readonly orientation?: 'v' | 'h';
}
