/**
 * The contracts trace packages and components implement (plan §4.4, E22.1, E22.3; ADR-019).
 *
 * A trace package exports ONE module object that combines core's pure parts (`type`, `schema`,
 * `supplyDefaults`, `meta`) with the render parts declared here (`calc`, `extremes`, `plot`). Core
 * stays renderer-free: it types the render parts as `unknown`, and this package narrows them.
 *
 * ## Pipeline and who is called when
 *
 * ```
 * supplyDefaults (core) → calc → extremes → layout + autorange (runtime) → plot → components → render
 * ```
 *
 * - `calc(trace, ctx)` is pure: data in data space → calcdata, usually linear coordinates via
 *   `ctx.xaxis.scale.d2lArray(...)` (plan §4.3). It runs on first draw and whenever an attribute
 *   with `editType: 'calc'` (or an axis type/category change) invalidates it.
 * - `extremes(calc, trace, ctx)` reports what the trace needs to be visible for autorange, in
 *   linear space with pixel padding (see `linearExtremes`, or core's data-space `findExtremes`).
 * - `plot.create(ctx)` builds GPU objects through `ctx.add(primitive)`; the returned
 *   {@link TraceView} is updated in place with a {@link TraceUpdatePlan} that says what changed, so
 *   a color restyle re-uploads colors only and a zoom only sets a new transform.
 */
import type {
  AxisExtremes,
  AxisType,
  Children,
  ComponentModule as CoreComponentModule,
  FullAxis,
  FullConfig,
  FullLayout,
  FullTrace,
  Scale,
  Stage,
  Template,
  TraceModule as CoreTraceModule,
} from '@mk7s/holochart-core';
import type {
  DataTransform,
  Primitive,
  PrimitiveContext,
  Viewport,
  ViewportRect,
} from '@mk7s/holochart-render';
import type { Chart } from './chart.ts';

// ---- Axes and subplots ------------------------------------------------------------------------

/** A cartesian axis as seen by traces and components. */
export interface AxisInfo {
  /** Axis id: `'x'`, `'y2'`, … */
  readonly id: string;
  /** Layout key: `'xaxis'`, `'yaxis2'`, … */
  readonly name: string;
  readonly letter: 'x' | 'y';
  /** Resolved axis type (`'-'` has been replaced by the detected type). */
  readonly type: AxisType;
  /** The defaulted axis. `range` holds the range in use (linear coordinates) after layout. */
  readonly full: FullAxis;
  /** Data ↔ linear ↔ axis-pixel mapping (range and length are current after layout). */
  readonly scale: Scale;
  /**
   * Container px (top-left origin) of the axis' pixel 0 (`range[0]`) and of its far end: left → right
   * for x axes, bottom → top for y axes (so `start > end` for y).
   */
  readonly start: number;
  readonly end: number;
  /** Linear coordinate → container px along this axis (x: from the left, y: from the top). */
  l2c(l: number): number;
}

/** A cartesian subplot (`'xy'`, `'x2y2'`): one scissored 2D viewport (ADR-004, ADR-008). */
export interface SubplotInfo {
  readonly id: string;
  readonly xaxis: AxisInfo;
  readonly yaxis: AxisInfo;
  /** Plot-area rect in container CSS px (top-left origin). */
  readonly rect: Readonly<ViewportRect>;
  /** The viewport traces of this subplot draw into (world = CSS px, origin bottom-left). */
  readonly viewport: Viewport;
  /** Linear coordinates → viewport world px, for every trace on this subplot. */
  readonly transform: Readonly<DataTransform>;
}

// ---- Trace contract ---------------------------------------------------------------------------

/** Context for `calc` and `extremes`. */
export interface CalcContext {
  readonly fullLayout: FullLayout;
  /** Index of the trace in `data`. */
  readonly index: number;
  /**
   * The trace's axes (cartesian traces only). Only `type` and the data ↔ linear mapping of `scale`
   * are meaningful here; range and length are set later, during layout.
   */
  readonly xaxis: AxisInfo | undefined;
  readonly yaxis: AxisInfo | undefined;
}

/** What a trace contributes to the autorange of each of its axes. */
export interface TraceExtremes {
  readonly x?: AxisExtremes;
  readonly y?: AxisExtremes;
}

/**
 * What changed since the last `update` of a {@link TraceView}. Flags are cumulative downstream:
 * `calc` implies `plot`, and `plot` implies `style`.
 */
export interface TraceUpdatePlan {
  /** `ctx.calc` is new (data, or anything with `editType: 'calc'`): re-upload geometry. */
  readonly calc: boolean;
  /** Attributes with `editType: 'plot'` (or trace order) changed: re-read everything from `ctx.trace`. */
  readonly plot: boolean;
  /** Only styling changed (`editType: 'style'`): update colors/sizes/opacity in place. */
  readonly style: boolean;
  /** `ctx.transform` or the viewport changed (zoom, pan, resize): set the transform (uniforms only). */
  readonly transform: boolean;
  /** `ctx.selectedPoints` changed (E6.3): restyle selected / unselected points. */
  readonly selection?: boolean;
}

/** Everything a trace renderer may use. A fresh context is passed to every call. */
export interface TracePlotContext<Calc = unknown> {
  /** The defaulted trace. */
  readonly trace: FullTrace;
  readonly calc: Calc;
  /** Index of the trace in `data`; also its draw order. */
  readonly index: number;
  readonly fullLayout: FullLayout;
  /** The trace's subplot (cartesian traces only). */
  readonly subplot: SubplotInfo | undefined;
  readonly xaxis: AxisInfo | undefined;
  readonly yaxis: AxisInfo | undefined;
  /** Linear coordinates → viewport world px (identity for non-cartesian traces). */
  readonly transform: Readonly<DataTransform>;
  /** Where the trace draws: its subplot's viewport, or the overlay for non-cartesian traces. */
  readonly viewport: Viewport;
  /** Pass to primitive factories (`createMarkers(ctx.primitives, …)`). */
  readonly primitives: PrimitiveContext;
  /**
   * Add a primitive to the trace's viewport. The runtime tracks it: it is reported by
   * `chart.getTraceObjects(i)` and removed and disposed with the view.
   */
  add<T>(primitive: Primitive<T>): Primitive<T>;
  /** Remove (and dispose) a primitive added with {@link add}. */
  remove<T>(primitive: Primitive<T>): void;
  /** Schedule a frame (ADR-007), e.g. after async resources finish loading. */
  invalidate(): void;
  /**
   * Active selection for this trace (E6.3): indices into its data arrays, or `null` when nothing is
   * selected (draw everything normally). Traces apply `selected` / `unselected` styles from it.
   */
  readonly selectedPoints?: readonly number[] | null;
}

/** A trace's live GPU objects, created by {@link TraceRenderer.create}. */
export interface TraceView<Calc = unknown> {
  /** Bring the objects up to date. Only called when at least one plan flag is set. */
  update(ctx: TracePlotContext<Calc>, plan: TraceUpdatePlan): void;
  /**
   * Free anything not added through `ctx.add` (primitives added there are removed and disposed by
   * the runtime right after this call).
   */
  dispose?(): void;
}

/** The `plot` part of a trace module (plan E22.1). */
export interface TraceRenderer<Calc = unknown> {
  /** Build the trace's objects and draw its current state (including `ctx.transform`). */
  create(ctx: TracePlotContext<Calc>): TraceView<Calc>;
}

/**
 * A trace module: core's schema/defaults contract plus the render parts (plan §4.4, E22.1). All
 * render parts are optional, so a core-only module still validates and defaults.
 *
 * Interaction parts (M1 wave 2): `crossTraceCalc` (stacking/grouping), `hoverPoints`,
 * `selectPoints`, `legendIcon`. Later: `colorbar`.
 */
export interface TraceModule<
  Calc = unknown,
  C extends Children = Children,
> extends CoreTraceModule<C> {
  /** Pure calc: full trace → calcdata. */
  calc?(trace: FullTrace, ctx: CalcContext): Calc;
  /** Autorange contribution, in linear coordinates with px padding. */
  extremes?(calc: Calc, trace: FullTrace, ctx: CalcContext): TraceExtremes;
  /**
   * Cross-trace calc (bar stacking/grouping, stacked areas): called once per subplot and stack
   * group with every visible trace of the group on it, in trace order, after `calc` and before
   * `extremes`. Mutates the calcs in place (e.g. writes stacked bases and group offsets), so it must
   * be idempotent: it reruns on already-processed calcs when another member changes.
   *
   * The group is the trace type, unless the module's `categories` list a shared stack group
   * (currently `'bar-like'`, see the runtime's `STACK_GROUPS`): then all traces whose modules list
   * it stack together — bar, histogram, funnel, waterfall — and the group's first module (in trace
   * order) that has `crossTraceCalc` runs it for all of them.
   */
  crossTraceCalc?(entries: readonly CrossTraceEntry<Calc>[], ctx: CrossTraceContext): void;
  readonly plot?: TraceRenderer<Calc>;
  /** Points near the pointer for hover (E6.1). Empty when nothing is within `query.distance`. */
  hoverPoints?(calc: Calc, trace: FullTrace, query: HoverQuery, ctx: HoverContext): HoverPoint[];
  /** Indices of the points inside a box or lasso selection (E6.3). */
  selectPoints?(calc: Calc, trace: FullTrace, query: SelectionQuery, ctx: HoverContext): number[];
  /**
   * What the legend draws for this trace (E5.2). `ctx` (M1 wave 2, optional for callers) gives
   * `fullLayout`, e.g. to resolve colors linked to a `coloraxis`.
   */
  legendIcon?(trace: FullTrace, ctx?: LegendIconContext): LegendGlyph;
}

// ---- Interaction parts of the trace contract (M1 wave 2) --------------------------------------

/** One trace's calc as seen by {@link TraceModule.crossTraceCalc}. */
export interface CrossTraceEntry<Calc = unknown> {
  readonly trace: FullTrace;
  /** Index of the trace in `data`. */
  readonly index: number;
  readonly calc: Calc;
}

/**
 * Context for {@link TraceModule.crossTraceCalc}. The subplot's rect and axis lengths are current;
 * ranges and transforms are still those of the previous layout pass (autorange needs `extremes`,
 * which run after cross-trace calc), so work in linear units, not px.
 */
export interface CrossTraceContext {
  readonly fullLayout: FullLayout;
  readonly subplot: SubplotInfo;
  readonly xaxis: AxisInfo;
  readonly yaxis: AxisInfo;
}

/** Axes and transform of the trace being queried, for converting between linear and px. */
export interface HoverContext {
  readonly fullLayout: FullLayout;
  readonly xaxis: AxisInfo | undefined;
  readonly yaxis: AxisInfo | undefined;
  /** Linear → viewport px (bottom-left origin), as used for drawing. */
  readonly transform: Readonly<DataTransform>;
}

/**
 * A hover query in one subplot. `x`/`y` modes ask for the points at the pointer's x (or y) — the
 * runtime builds unified labels (`x unified`, `y unified`) from those results.
 */
export interface HoverQuery {
  /** Pointer in viewport px (bottom-left origin, same space as the transform's output). */
  readonly px: number;
  readonly py: number;
  /** Pointer in the trace's linear coordinates. */
  readonly xl: number;
  readonly yl: number;
  readonly mode: 'closest' | 'x' | 'y';
  /** Max distance in px (`layout.hoverdistance`); `Infinity` for no limit. */
  readonly distance: number;
}

/** A point a trace reports under the pointer. */
export interface HoverPoint {
  /** Index into the trace's data arrays (first index for aggregated points). */
  readonly pointIndex: number;
  /** All data indices behind an aggregated point (histogram bins, stacked segments). */
  readonly pointIndices?: readonly number[];
  /** Distance used to rank candidates: px from the pointer (`closest`) or along the axis (`x`/`y`). */
  readonly distance: number;
  /** Label anchor in viewport px (bottom-left origin). */
  readonly px: number;
  readonly py: number;
  /** Values for labels and `hovertemplate`, in data space. */
  readonly x?: unknown;
  readonly y?: unknown;
  readonly text?: string;
  /** Color the label uses for its border/background (usually the point's color). */
  readonly color?: string;
  /** Anything else `hovertemplate` may reference (e.g. `marker.size`, `customdata`). */
  readonly fields?: Readonly<Record<string, unknown>>;
}

/** A box or lasso selection in one subplot, in the trace's linear coordinates. */
export interface SelectionQuery {
  readonly kind: 'rect' | 'lasso';
  /** Bounding box (both kinds). */
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  /** Lasso polygon vertices. */
  readonly polygon?: readonly (readonly [number, number])[];
}

/** Context for {@link TraceModule.legendIcon}. */
export interface LegendIconContext {
  readonly fullLayout: FullLayout;
}

/** What the legend draws for one trace (E5.2). Colors are CSS color strings. */
export interface LegendGlyph {
  readonly kind: 'marker' | 'line' | 'lines+markers' | 'bar' | 'fill';
  readonly marker?: {
    readonly symbol?: string | number;
    readonly size?: number;
    readonly color?: string;
    readonly lineColor?: string;
    readonly lineWidth?: number;
    readonly opacity?: number;
  };
  readonly line?: { readonly color?: string; readonly width?: number; readonly dash?: string };
  readonly fill?: {
    readonly color?: string;
    readonly lineColor?: string;
    readonly lineWidth?: number;
  };
}

// ---- Component contract -----------------------------------------------------------------------

/** Room (CSS px) a component needs on each side of the plot area (legend, colorbar, automargin). */
export interface MarginPush {
  readonly l?: number;
  readonly r?: number;
  readonly t?: number;
  readonly b?: number;
}

/** Context for {@link ComponentModule.pushMargin}. */
export interface ComponentLayoutContext {
  readonly fullLayout: FullLayout;
  readonly fullData: readonly FullTrace[];
  /** Figure size in CSS px. */
  readonly width: number;
  readonly height: number;
  /**
   * Axes with their types and scales. Ranges and lengths are those of the previous layout pass (or
   * defaults on first draw); the iterative automargin solve (E4.2) refines this.
   */
  readonly axes: ReadonlyMap<string, AxisInfo>;
}

/** Context for component drawing: the solved layout and the overlay viewport. */
export interface ComponentDrawContext {
  readonly fullLayout: FullLayout;
  readonly fullData: readonly FullTrace[];
  /** Figure size in CSS px. */
  readonly width: number;
  readonly height: number;
  /** The plot area inside the margins, container px (top-left origin). */
  readonly plotArea: Readonly<ViewportRect>;
  /** Resolved margins, after pushes. */
  readonly margin: {
    readonly l: number;
    readonly r: number;
    readonly t: number;
    readonly b: number;
  };
  readonly axes: ReadonlyMap<string, AxisInfo>;
  readonly subplots: ReadonlyMap<string, SubplotInfo>;
  /** Figure-level 2D viewport covering the whole canvas, drawn last (paper-space components). */
  readonly overlay: Viewport;
  readonly primitives: PrimitiveContext;
  /** Add a primitive to `viewport` (default: the overlay); tracked and disposed with the view. */
  add<T>(primitive: Primitive<T>, viewport?: Viewport): Primitive<T>;
  remove<T>(primitive: Primitive<T>): void;
  invalidate(): void;
  /**
   * The chart (M1 wave 2): for components that act on it — the legend restyles `visible` and
   * emits `legendclick` (`chart.emit`), the modebar calls `chart.setDragmode`, `chart.zoom`,
   * `chart.resetAxes`, … and places its DOM in `chart.element`. Always set by the runtime;
   * optional only so contexts built by hand in tests stay valid.
   */
  readonly chart?: Chart;
  /** The defaulted config (modebar options, `staticPlot`, …). Always set by the runtime. */
  readonly fullConfig?: FullConfig;
}

/**
 * A pointer event offered to component views before the chart's own hover / zoom / selection
 * handling (see {@link ComponentView.handlePointer}). The object is reused between events: read
 * it during the call, don't keep it.
 */
export interface ComponentPointerEvent {
  /**
   * `down` / `move` / `up` (pointer events), `click` (down and up without moving), `dblclick`
   * (second click within `config.doubleClickDelay`), `wheel`, `leave` (pointer left the chart).
   */
  type: 'down' | 'move' | 'up' | 'click' | 'dblclick' | 'wheel' | 'leave';
  /** Position in container CSS px (top-left origin), like `plotArea` and `SubplotInfo.rect`. */
  x: number;
  y: number;
  /** `PointerEvent.button` (0 primary) for `down` / `up` / `click`. */
  button: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** The DOM event (absent for `click` / `dblclick`, which the runtime synthesizes). */
  native: Event | undefined;
  /** Set by a component that handles a `move` to choose the cursor (e.g. `'pointer'`). */
  cursor: string | undefined;
}

/** What changed since a component view's last update. */
export interface ComponentUpdatePlan {
  /** Declared stages of the update (see core `STAGE_ORDER`), layout- and trace-level combined. */
  readonly stages: ReadonlySet<Stage>;
  /** Figure size, margins, domains or axis ranges may have changed. */
  readonly layout: boolean;
}

export interface ComponentView {
  update(ctx: ComponentDrawContext, plan: ComponentUpdatePlan): void;
  dispose?(): void;
  /**
   * Pointer hook (M1 wave 2): the runtime offers every pointer event to component views first —
   * topmost (last drawn) first — and only runs its own hover / zoom / pan / selection when none
   * returns `true`. Return `true` for events over your own hit regions (e.g. legend items): a
   * handled `down` also routes the rest of that gesture (`move`, `up`, `click`) to this view only,
   * and a handled `move` hides hover labels. DOM components (modebar) get their own DOM events and
   * don't need this.
   */
  handlePointer?(event: ComponentPointerEvent): boolean | void;
}

export interface ComponentRenderer {
  create(ctx: ComponentDrawContext): ComponentView;
}

/**
 * A layout component (plan E22.3): core's layout schema/defaults plus optional margin pushes and
 * drawing. Axes (E3.4), legend (E5.2), title (E5.1), … are components; so are third-party
 * watermarks or brushes.
 */
export interface ComponentModule extends CoreComponentModule {
  readonly kind?: 'component';
  /** Draw order among components (lower first; ties keep registration order). Default 0. */
  readonly order?: number;
  pushMargin?(ctx: ComponentLayoutContext): readonly MarginPush[] | MarginPush | undefined;
  readonly draw?: ComponentRenderer;
}

// ---- Templates --------------------------------------------------------------------------------

/** A named template (`layout.template: 'name'`), registrable with `register`. */
export interface TemplateModule {
  readonly kind: 'template';
  readonly name: string;
  readonly template: Template;
  /** Apply this template when `layout.template` is unset. */
  readonly default?: boolean;
}

/** Anything `register(...)` accepts. */
export type Registrable = TraceModule | ComponentModule | TemplateModule;
