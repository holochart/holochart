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
  CategorySamples,
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

// ---- Domain placement (E4.5, M2 wave 1) ---------------------------------------------------------

/**
 * Where a trace in the `domain` category (pie, later sunburst, indicator, …) is placed: its
 * `domain.x` / `domain.y` (or the `layout.grid` cell its `domain.row` / `domain.column` picked,
 * resolved during supply-defaults) mapped onto the plot area. Domain traces have no axes: they draw
 * into the overlay viewport, whose world units are container CSS px with a bottom-left origin, so a
 * container point `(x, y)` is at world `(x, viewport.size.height - y)`. Use `fitAspect` /
 * `inscribedCircle` (exported by the runtime) to keep circular traces round inside the rect.
 */
export interface DomainInfo {
  /** `domain.x` in use: fractions of the plot area width, `[start, end]` with `start < end`. */
  readonly x: readonly [number, number];
  /** `domain.y` in use: fractions of the plot area height from the bottom, `start < end`. */
  readonly y: readonly [number, number];
  /** The domain in container CSS px (top-left origin), inside the margins. */
  readonly rect: Readonly<ViewportRect>;
}

/** One domain trace as seen by {@link TraceModule.crossTraceLayout}. */
export interface DomainTraceEntry<Calc = unknown> extends CrossTraceEntry<Calc> {
  readonly domain: DomainInfo;
}

/** Context for {@link TraceModule.crossTraceLayout}: the solved figure layout. */
export interface DomainLayoutContext {
  readonly fullLayout: FullLayout;
  /** Figure size in CSS px. */
  readonly width: number;
  readonly height: number;
  /** The plot area inside the margins, container px (top-left origin). */
  readonly plotArea: Readonly<ViewportRect>;
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
  /**
   * Streaming (E7.2): the trace only gained points at one end (and maybe lost some at the other)
   * through `extendTraces` / `prependTraces`, and `ctx.calc` came from the module's
   * `calcAppend`. `calc` (and so `plot` and `style`) is still set, so a view that ignores this
   * field redraws everything, as before; a view that knows it can upload only the new points.
   */
  readonly append?: TraceAppend;
}

/**
 * A streaming change of one trace (E7.2): `count` points were added at one end by
 * `extendTraces` (`at: 'end'`) or `prependTraces` (`at: 'start'`), and `trimmed` points were
 * removed from the other end by `maxPoints`. Retained points keep their values; their index moves
 * by `count` for prepends and by `-trimmed` for extends. Several calls batched into one update
 * are merged.
 */
export interface TraceAppend {
  readonly at: 'end' | 'start';
  /** Index of the first added point in the new data: `length - count` (end) or 0 (start). */
  readonly start: number;
  /** Points added. */
  readonly count: number;
  /** Points removed from the opposite end. */
  readonly trimmed: number;
  /** Point counts (`trace._length`) before and after: `length = previous - trimmed + count`. */
  readonly previous: number;
  readonly length: number;
  /** Attribute strings that received points (`'x'`, `'y'`, `'marker.color'`, …). */
  readonly keys: readonly string[];
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
  /**
   * The trace's domain (M2 wave 1, E4.5): set for traces in the `domain` category, which draw into
   * the overlay (see {@link DomainInfo}); `undefined` for every other trace.
   */
  readonly domain?: DomainInfo;
  /** The plot area inside the margins, container px (M2 wave 1). Always set by the runtime. */
  readonly plotArea?: Readonly<ViewportRect>;
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
   * Take a pointer event before the chart's own interactions (zoom, pan, select, hover), e.g. a
   * `table` scrolling on wheel or drag. Offered after every component (components draw on top),
   * then to trace views from the last trace to the first. Return `true` to consume it; a view that
   * consumed `down` receives every event until `up`. Positions are container px, so compare them
   * with `ctx.domain` / `ctx.subplot.rect` from the last `update`.
   */
  handlePointer?(event: ComponentPointerEvent): boolean | void;
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
 * `selectPoints`, `legendIcon`; M1 wave 3: `colorbar`; M2 wave 1: `crossTraceLayout` and
 * `legendItems` (domain traces such as pie), and `hoverPoints` for domain traces (see
 * {@link HoverQuery}).
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
   * Streaming calc (E7.2): the trace's calc after `extendTraces` / `prependTraces`, from its
   * previous calc, converting only the added points (the retained points' data is unchanged, see
   * {@link TraceAppend}). Must equal what `calc` returns for the new data. Return `undefined` to
   * fall back to `calc` (e.g. attributes whose values depend on every point). The previous calc
   * must stay readable until `extremesAppend` ran (it reads the removed points).
   */
  calcAppend?(
    previous: Calc,
    trace: FullTrace,
    ctx: CalcContext,
    append: TraceAppend,
  ): Calc | undefined;
  /**
   * Streaming autorange (E7.2): the trace's extremes after `calcAppend`, from its previous
   * extremes, the added points and the removed ones (in `previousCalc`) — typically merged in
   * O(added + removed), recomputed only when a removed point was an extreme. Return `undefined`
   * to fall back to `extremes`.
   */
  extremesAppend?(
    previous: TraceExtremes,
    calc: Calc,
    previousCalc: Calc,
    trace: FullTrace,
    ctx: CalcContext,
    append: TraceAppend,
  ): TraceExtremes | undefined;
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
  /**
   * Cross-trace step for traces in the `domain` category (M2 wave 1, E4.5): called once per trace
   * type with every visible trace of that type that has a calc, in trace order, with their solved
   * domains — after calc and the final layout pass (margins known), before `plot`. Pie uses it for
   * what spans traces and depends on the layout: the label → color map shared by all pies
   * (Plotly's `_piecolormap`) and `scalegroup` radii. Mutates the calcs in place, so it must be
   * idempotent; it reruns after every layout pass or recalc of a member, and the members' views
   * then get `plot: true`.
   */
  crossTraceLayout?(entries: readonly DomainTraceEntry<Calc>[], ctx: DomainLayoutContext): void;
  /**
   * Samples for the value-based `categoryorder`s (E3.6: `total descending`, `median ascending`, …;
   * Plotly's `sortAxisCategoriesByValue`): per point, the category index on `axis` (the linear
   * coordinate calc produced) and the value to aggregate — a bar's own size (after `barnorm`), a
   * scatter point's other coordinate, … in calc space. Called after `crossTraceCalc` for visible
   * traces on a category axis with such an order; if the order changes, the runtime rebuilds the
   * axis' scale and runs `calc` (and `crossTraceCalc`) again, like Plotly's second calc pass.
   * Return `undefined` when the trace has nothing to contribute on this axis (e.g. it is a bar's
   * size axis); traces without this method don't contribute either.
   */
  categoryValues?(
    calc: Calc,
    trace: FullTrace,
    axis: 'x' | 'y',
    ctx: CalcContext,
  ): CategorySamples | undefined;
  readonly plot?: TraceRenderer<Calc>;
  /**
   * Points near the pointer for hover (E6.1). Empty when nothing is within `query.distance`.
   * Domain traces (M2 wave 1) are asked on every hover, wherever the pointer is: they return the
   * point under `query.cx` / `query.cy` (container px) with distance 0, or nothing.
   */
  hoverPoints?(calc: Calc, trace: FullTrace, query: HoverQuery, ctx: HoverContext): HoverPoint[];
  /** Indices of the points inside a box or lasso selection (E6.3). */
  selectPoints?(calc: Calc, trace: FullTrace, query: SelectionQuery, ctx: HoverContext): number[];
  /**
   * What the legend draws for this trace (E5.2). `ctx` (M1 wave 2, optional for callers) gives
   * `fullLayout`, e.g. to resolve colors linked to a `coloraxis`.
   */
  legendIcon?(trace: FullTrace, ctx?: LegendIconContext): LegendGlyph;
  /**
   * The colorbar this trace wants (E5.3), or `null`. Traces sharing a `coloraxis` return the same
   * `coloraxis` id; the colorbar component draws one bar per coloraxis (from `layout.coloraxisN`)
   * and one per trace otherwise (from the trace's own `…colorbar` container).
   */
  colorbar?(trace: FullTrace, ctx: LegendIconContext): ColorbarSpec | null;
  /**
   * One legend item per point instead of one per trace (M2 wave 1, E9.11; Plotly's `pie-like`
   * legends): pie returns one item per label, in calc order. Items with the same `key` across
   * traces of one `legendgroup` show once (the first wins). A click toggles the item's key in
   * `layout.hiddenlabels` and a double-click isolates it (Plotly's `handle_click` for pie-like
   * traces); `hidden` items are drawn faded. Return `undefined` to fall back to one item per
   * trace ({@link legendIcon}).
   */
  legendItems?(
    calc: Calc,
    trace: FullTrace,
    ctx: LegendIconContext,
  ): readonly LegendItem[] | undefined;
  /**
   * What assistive technology is told about this trace (E17.1, M2 wave 2): the runtime renders
   * it into the chart's visually hidden description. Traces without it get a generic line (type,
   * name, point count).
   */
  describe?(ctx: DescribeContext<Calc>): TraceDescription | undefined;
}

/** Context for {@link TraceModule.describe}. */
export interface DescribeContext<Calc = unknown> {
  readonly trace: FullTrace;
  readonly calc: Calc;
  readonly index: number;
  readonly fullLayout: FullLayout;
  /** The trace's axes (cartesian traces), for formatting values the way the axes do. */
  readonly xaxis: AxisInfo | undefined;
  readonly yaxis: AxisInfo | undefined;
  /**
   * Most rows the runtime shows in a trace's hidden table (100): build at most this many and
   * report the full count in `table.total`, so describing a million points stays cheap. Longer
   * `rows` are cut by the runtime.
   */
  readonly maxRows: number;
}

/** A trace's accessible description (E17.1). */
export interface TraceDescription {
  /** One or two plain-text sentences, e.g. "Scatter 'Revenue': 120 points; x 2020–2024; y 3.1–9.8." */
  readonly summary: string;
  /**
   * What kind of chart this trace makes, as a lowercase noun for the chart-level summary
   * ("Line and bar chart with 3 traces"): `'line'`, `'area'`, `'bubble'`, `'horizontal bar'`,
   * `'donut'`, … Default: the trace type.
   */
  readonly kind?: string;
  /**
   * An optional data table rendered as a hidden `<table>` (the `table` trace's cells, or a sample
   * of a trace's points). Cell text is plain text.
   */
  readonly table?: {
    readonly caption?: string;
    readonly columns: readonly string[];
    readonly rows: readonly (readonly string[])[];
    /**
     * Rows the data has when `rows` holds only the first {@link DescribeContext.maxRows}: the
     * table then says "first N of M". Default: `rows.length`.
     */
    readonly total?: number;
  };
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
  /** The trace's domain (M2 wave 1): set for domain traces, like {@link TracePlotContext.domain}. */
  readonly domain?: DomainInfo;
}

/**
 * A hover query in one subplot. `x`/`y` modes ask for the points at the pointer's x (or y) — the
 * runtime builds unified labels (`x unified`, `y unified`) from those results.
 *
 * Domain traces (M2 wave 1) have no subplot: for them the viewport is the overlay, so `px`/`py` are
 * figure px from the bottom-left corner, `xl`/`yl` equal `px`/`py` (identity transform), and
 * `mode` is always `closest` (Plotly shows one pie label whatever `hovermode` says).
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
  /**
   * Pointer in container CSS px, top-left origin (M2 wave 1): the same space as
   * {@link DomainInfo.rect}. Always set by the runtime; optional for hand-built queries.
   */
  readonly cx?: number;
  readonly cy?: number;
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
  /**
   * Formatted values `hovertemplate` uses for a `%{name}` without a format (M2 wave 1, Plotly's
   * `hovertemplateLabels`): pie gives `percent` → `'25%'` and `value` → `'1,234'`.
   */
  readonly labels?: Readonly<Record<string, string>>;
  /**
   * Label text the trace built itself from its `hoverinfo` flags (M2 wave 1), for traces whose
   * hover fields aren't x/y (pie: label, text, value, percent lines, `<br>`-separated). Replaces
   * the x/y text when there is no `hovertemplate`; the trace name still follows the `name` flag.
   */
  readonly hoverText?: string;
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

/** One per-point legend item (M2 wave 1, see {@link TraceModule.legendItems}). */
export interface LegendItem {
  /** Identity of the item: the value toggled in `layout.hiddenlabels` (pie: the label). */
  readonly key: string;
  /** Item text (Plotly pseudo-HTML allowed, like trace names). */
  readonly name: string;
  readonly glyph: LegendGlyph;
  /** The item's points are hidden (drawn faded, like a `legendonly` trace). */
  readonly hidden: boolean;
}

/** A colorbar request from one trace (E5.3). */
export interface ColorbarSpec {
  /** Colorscale stops `[position 0–1, CSS color]`, already reversed if `reversescale`. */
  readonly colorscale: readonly (readonly [number, string])[];
  /** Data range the scale spans (after `cauto` / `cmid`). */
  readonly cmin: number;
  readonly cmax: number;
  /** Shared `coloraxis` id (`'coloraxis'`, `'coloraxis2'`, …) when the trace uses one. */
  readonly coloraxis?: string;
  /**
   * The defaulted colorbar attributes (`marker.colorbar` of the trace, or `layout.coloraxisN.colorbar`):
   * `thickness`, `len`, `x`, `y`, anchors, title, tick attributes, … as declared by the schema.
   */
  readonly attributes: Readonly<Record<string, unknown>>;
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
  /** The registered module of a trace type (e.g. to ask traces for their colorbars). */
  traceModule?(type: string): TraceModule | undefined;
  /**
   * Calcdata of trace `index` (M2 wave 1), e.g. for `legendItems`; `undefined` before its first
   * calc (the first margin pass of a figure runs before calc; automargin passes run after it).
   */
  calcdata?(index: number): unknown;
}

/** Context for {@link ComponentModule.extremes}. */
export interface ComponentExtremesContext {
  readonly fullLayout: FullLayout;
  readonly fullData: readonly FullTrace[];
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
  /**
   * The registered module for a trace type (M1 wave 3), so components can ask traces for their
   * `colorbar` / `legendIcon`. Always set by the runtime; optional for hand-built test contexts.
   */
  traceModule?(type: string): TraceModule | undefined;
  /**
   * Calcdata of trace `index` (M2 wave 1), e.g. for `legendItems`. Always set by the runtime;
   * optional for hand-built test contexts.
   */
  calcdata?(index: number): unknown;
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
  /**
   * Autorange contributions, by axis id (`'x'`, `'y2'`), merged with the traces' extremes: e.g.
   * data-referenced shapes (Plotly's `shapes/calc_autorange.js`). Called on every autorange pass;
   * axes have their types and scales, ranges are not final yet.
   */
  extremes?(ctx: ComponentExtremesContext): Readonly<Record<string, AxisExtremes>> | undefined;
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
