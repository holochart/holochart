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
 * Later additions (wave 2+): `hoverPoints`, `selectPoints`, `legendIcon`, `colorbar`,
 * `crossTraceCalc`.
 */
export interface TraceModule<
  Calc = unknown,
  C extends Children = Children,
> extends CoreTraceModule<C> {
  /** Pure calc: full trace → calcdata. */
  calc?(trace: FullTrace, ctx: CalcContext): Calc;
  /** Autorange contribution, in linear coordinates with px padding. */
  extremes?(calc: Calc, trace: FullTrace, ctx: CalcContext): TraceExtremes;
  readonly plot?: TraceRenderer<Calc>;
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
