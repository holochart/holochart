/** Types of the supply-defaults output (`fullData`, `fullLayout`, `fullConfig`). */
import type { configSchema } from '../config/schema.ts';
import type { gridSchema } from '../layout/grid.ts';
import type { layoutSchema, xaxisSchema } from '../layout/schema.ts';
import type { TraceModule } from '../registry/types.ts';
import type { InferFull } from '../schema/types.ts';
import type { Template } from '../templates/templates.ts';

/** A figure as passed by the user (plan ADR-001). */
export interface FigureInput {
  data?: readonly unknown[];
  layout?: unknown;
  config?: unknown;
  frames?: unknown;
  /**
   * Named column tables that traces reference with `dataset: 'name'` and `'@column'` strings
   * (plan E1.6), e.g. `{ sales: { date: [...], revenue: Float64Array } }`.
   */
  datasets?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
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
  _module: TraceModule | undefined;
  [key: string]: unknown;
}

/** A defaulted (minimal, M0) cartesian axis. */
export type FullAxis = InferFull<typeof xaxisSchema> & {
  /** Subplot id, e.g. `'x2'`. */
  _id: string;
  /** Layout key, e.g. `'xaxis2'`. */
  _name: string;
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
  [key: string]: unknown;
};

/** The config after defaults. */
export type FullConfig = InferFull<typeof configSchema>;
