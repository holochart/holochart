/** Types of the supply-defaults output (`fullData`, `fullLayout`, `fullConfig`). */
import type { configSchema } from '../config/schema.ts';
import type { Config } from '../generated/config.ts';
import type { BaseLayout, BaseLayoutTitle } from '../generated/layout.ts';
import type { ReducedMotion } from './a11y.ts';
import type { gridSchema } from '../layout/grid.ts';
import type { layoutSchema, xaxisSchema } from '../layout/schema.ts';
import type { Locale } from '../locale/locale.ts';
import type { CoreTraceModule } from '../registry/types.ts';
import type { InferFull } from '../schema/types.ts';
import type { Template } from '../templates/templates.ts';

/**
 * A trace of any type, as a registry that does not know it accepts it: the loose default of
 * {@link FigureInput}. Any object fits, so partial bundles, plugins and data from untyped sources
 * (JSON, Express) work; the full bundle's `Figure` (`@mk7s/holochart`) types every built-in trace
 * instead, and each trace package exports its own trace types (`ScatterTrace`, `TracesBasic`, …).
 */
export type TraceInput = object;

/**
 * A layout as {@link FigureInput} takes it by default: the base layout attributes (axes, margins,
 * …) typed, and any other attribute (those of registered components and traces, such as `legend`
 * or `barmode`) accepted as it is. The full bundle's `Layout` types those too. `title` takes the
 * attributes the title component adds (`subtitle`, `pad`, …).
 */
// Not `Omit<Layout, 'title'>`: `keyof Layout` reduces `'xaxis2'` into `` `xaxis${number}` ``, so
// mapping over it would lose the typed numbered axes.
export type LayoutInput = BaseLayout & {
  readonly title?: BaseLayoutTitle | (BaseLayoutTitle & { readonly [key: string]: unknown });
  readonly [key: string]: unknown;
};

/**
 * An animation frame (`figure.frames[i]`, `addFrames`): trace and layout changes applied as one
 * step, like Plotly's frames.
 *
 * @typeParam D - The trace type (see {@link FigureInput}).
 */
export interface FrameInput<D extends object = TraceInput> {
  /** Name to animate to (numbers are converted to strings). Unnamed frames get `'frame N'`. */
  readonly name?: string | number;
  /** Group name: `animate('group')` plays the frames of a group in order. */
  readonly group?: string | number;
  /**
   * Trace changes, merged into the traces listed in `traces` (default: trace `i` for `data[i]`).
   * A frame's trace may leave out `type`.
   */
  readonly data?: readonly (Partial<D> | null | undefined)[];
  /** Trace indices `data` applies to. */
  readonly traces?: number | readonly number[];
  /** Layout changes (attribute strings such as `'xaxis.range'` work too). */
  readonly layout?: Readonly<Record<string, unknown>>;
  /** Name of a frame this one extends: its `data` and `layout` apply first. */
  readonly baseframe?: string | number;
  readonly [key: string]: unknown;
}

/**
 * A figure as passed by the user (plan ADR-001).
 *
 * Generic so that one shape serves every bundle: the defaults accept any trace and type the base
 * layout (partial bundles, plugins); `FigureInput<ScatterTrace | BarTrace>` types the traces a
 * partial bundle registers; the full bundle's `Figure` is `FigureInput<Data, Layout>`, every
 * built-in trace and layout attribute typed.
 *
 * @typeParam D - The trace type: a union discriminated on `type`, such as `Data`.
 * @typeParam L - The layout type.
 */
export interface FigureInput<D extends object = TraceInput, L extends object = LayoutInput> {
  data?: readonly D[];
  layout?: L;
  config?: Config;
  frames?: readonly FrameInput<D>[];
  /**
   * Named column tables that traces reference with `dataset: 'name'` and `'@column'` strings
   * (plan E1.6), e.g. `{ sales: { date: [...], revenue: Float64Array } }`.
   */
  datasets?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/**
 * A figure of any shape, as the pipeline takes it (`supplyDefaults`, `diffFigures`,
 * `encodeFigure`, …): every part is validated, so nothing is assumed. Every {@link FigureInput} is
 * one.
 */
export interface AnyFigure {
  data?: readonly unknown[];
  layout?: unknown;
  config?: unknown;
  frames?: unknown;
  datasets?: FigureInput['datasets'];
}

/** A trace after defaults. Module-specific attributes are reached through the index signature. */
export interface FullTrace {
  type: string;
  visible: boolean | 'legendonly';
  name?: string;
  uid?: string;
  /** Index of this trace in the input `data` array. */
  _index: number;
  /** The user's input trace object (not copied). */
  _input: Readonly<Record<string, unknown>>;
  /** The trace module, or `undefined` for unregistered types (which are forced invisible). */
  _module: CoreTraceModule | undefined;
  [key: string]: unknown;
}

/** A defaulted (minimal, M0) cartesian axis. */
export type FullAxis = InferFull<typeof xaxisSchema> & {
  /** Subplot id, e.g. `'x2'`. */
  _id: string;
  /** Layout key, e.g. `'xaxis2'`. */
  _name: string;
  /** The chart's locale (plan E17.6; `fullLayout._locale`), which labels use. Set by supply-defaults. */
  _locale?: Locale;
};

/** Subplots discovered during supply-defaults (plan E1.4). */
export interface Subplots {
  /** Cartesian subplot ids (`'xy'`, `'x2y2'`) in order of first use. */
  cartesian: string[];
  /** X axis ids (`'x'`, `'x2'`). */
  xaxis: string[];
  /** Y axis ids (`'y'`, `'y2'`). */
  yaxis: string[];
}

/**
 * `layout.grid` after defaults (plan E4.4, `defaults/grid.ts`). Present only for a grid of more
 * than one cell; `subplots` (grid of independent subplots) or `xaxes`/`yaxes` hold the cell
 * contents that were found.
 */
export type FullGrid = Omit<InferFull<typeof gridSchema>, 'rows' | 'columns'> & {
  rows: number;
  columns: number;
  /** Cell extents per column (`x`) and per row (`y`, in `roworder`), in plot-area fractions. */
  _domains: { x: [number, number][]; y: [number, number][] };
  /** Whether cells hold independent subplots (`subplots`) rather than shared axes. */
  _hasSubplotGrid: boolean;
  /** Column (x axes) or row (y axes) of each axis placed in the grid. */
  _axisMap?: Record<string, number>;
  /** Default `anchor` of each axis placed in the grid (`'free'` for grid-edge sides). */
  _anchors?: Record<string, string>;
};

type BaseFullLayout = Omit<InferFull<typeof layoutSchema>, 'xaxis' | 'yaxis' | 'template' | 'grid'>;

/**
 * The layout after defaults. Axes exist only for discovered subplots; module and component layout
 * attributes are reached through the index signature.
 */
export type FullLayout = BaseFullLayout & {
  /** The resolved template object, or `null`. */
  template: Template | null;
  xaxis?: FullAxis;
  yaxis?: FullAxis;
  /** Only for a grid of more than one cell. */
  grid?: FullGrid;
  _subplots: Subplots;
  /**
   * The chart's resolved locale (plan E17.6): `config.locale` with `separators`. Format numbers and
   * dates and translate UI strings through it (`localeOf`, `localize`). Set by supply-defaults.
   */
  _locale?: Locale;
  /** `config.a11y.reducedMotion` (plan E17.5), read through `reducedMotion()`. Set by supply-defaults. */
  _reducedMotion?: ReducedMotion;
  /**
   * `config.staticPlot`: the chart takes no input (an image export draws one). A trace view that
   * moves things by itself draws their end at once. Set by supply-defaults.
   */
  _staticPlot?: boolean;
  /**
   * `config.worker` (ADR-011), for the traces that can work off the main thread: the default of
   * the `graph` trace's `worker`. Set by supply-defaults.
   */
  _worker?: boolean | 'auto';
  /**
   * Axes linked by `matches` (plan E3.9, `defaults/constraints.ts`): one object per group, axis id
   * → 1, e.g. `[{ x: 1, x2: 1 }]`. Axes of a group share their range. Set by supply-defaults.
   */
  _axisMatchGroups?: Record<string, 1>[];
  /**
   * Axes whose scales are linked by `scaleanchor` or `matches` (plan E3.9): one object per group,
   * axis id → ratio, e.g. `[{ x: 1, y: 2 }]` for `yaxis: { scaleanchor: 'x', scaleratio: 2 }`.
   * px per unit ÷ ratio is the same for every axis of a group once constraints are enforced
   * (`enforceConstraints`). Cross-letter ratios are strings with one `x`/`y` prefix per plot-aspect
   * factor (`'x0.5'`). Groups that are exactly a match group are left out. Set by supply-defaults.
   */
  _axisConstraintGroups?: Record<string, number | string>[];
  [key: string]: unknown;
};

/** The config after defaults. */
export type FullConfig = InferFull<typeof configSchema>;
