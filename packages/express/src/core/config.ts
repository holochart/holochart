/**
 * How an Express function describes its figure to the engine (`engine.ts`): trace specs, grouping
 * variables and layout, as plotly.py's `px._core.infer_config` does.
 */

/** A per-group data role of a trace spec, in px's attribute order. */
export type Role =
  | 'base'
  | 'x'
  | 'y'
  | 'z'
  | 'size'
  | 'hoverName'
  | 'text'
  | 'names'
  | 'values'
  | 'animationGroup'
  | 'errorX'
  | 'errorXMinus'
  | 'errorY'
  | 'errorYMinus'
  | 'dimensions'
  | 'customData'
  | 'hoverData'
  | 'color'
  | 'marginalX'
  | 'marginalY';

/** One trace per group: its type, data roles and constant attributes (px's `TraceSpec`). */
export interface TraceSpec {
  readonly type: string;
  readonly attrs: readonly Role[];
  readonly patch: Readonly<Record<string, unknown>>;
  /** Marginal traces go to the subplot above (`'x'`) or right of (`'y'`) the main one. */
  readonly marginal?: 'x' | 'y';
}

/** A grouping variable and, for styles, where its value is written on the trace. */
export type Grouper =
  | { readonly variable: 'color'; readonly path: string }
  | { readonly variable: 'dash'; readonly path: string }
  | { readonly variable: 'symbol'; readonly path: string }
  | { readonly variable: 'pattern'; readonly path: string }
  | { readonly variable: 'animationFrame' | 'facetRow' | 'facetCol' | 'lineGroup' };

/** Histogram aggregation, for axis titles and hover labels (px's `get_decorated_label`). */
export interface Aggregation {
  readonly histfunc?: string;
  readonly histnorm?: string;
  readonly barnorm?: string;
}

/** How one Express function builds its figure. */
export interface Config {
  readonly specs: readonly TraceSpec[];
  readonly groupers: readonly Grouper[];
  /** Layout attributes (unset values are skipped). */
  readonly layoutPatch?: Readonly<Record<string, unknown>>;
  /** Where a numeric `color` goes (`marker` / `line` colorscale on `coloraxis`), if supported. */
  readonly continuousColor?: 'marker' | 'line' | 'pie';
  /**
   * Put a numeric color's colorscale and colorbar on the trace (`line.colorscale`, `showscale`)
   * rather than on `layout.coloraxis`: Holochart's `parcoords` / `parcats` have no `line.coloraxis`.
   */
  readonly inlineColorscale?: boolean;
  /**
   * `'domain'` for pie-like traces, `'splom'` for a scatter matrix (which lays out its own axes);
   * default `'xy'`.
   */
  readonly subplotType?: 'xy' | 'domain' | 'splom';
  /** `'v'` / `'h'` for functions with an orientation (histogram labels depend on it). */
  readonly orientation?: 'v' | 'h';
  /** Histogram / density aggregation. */
  readonly aggregation?: Aggregation;
  /** Marginals (their traces are in `specs`). */
  readonly marginalX?: string;
  readonly marginalY?: string;
  /** Rewrite a group's rows before its traces are built (ECDF). */
  readonly transform?: (rows: readonly number[]) => GroupData;
  /** Hover labels of computed x / y values without a column (an ECDF's `probability`). */
  readonly valueLabels?: { readonly x?: string; readonly y?: string };
  /** Axis titles overriding the column labels. */
  readonly axisTitles?: { readonly x?: string | null; readonly y?: string | null };
  /** `timeline`: date x axes without a title. */
  readonly timeline?: boolean;
  /** ECDF: the value axis starts at zero. */
  readonly ecdf?: boolean;
  /** Marker `sizeref` for `size` (px: `2 * max / sizeMax²`). */
  readonly sizeref?: number;
}

/** Rows of a group and replacement values of some roles (ECDF's cumulative values). */
export interface GroupData {
  readonly rows: readonly number[];
  readonly values?: Partial<Record<'x' | 'y', readonly unknown[]>>;
}
