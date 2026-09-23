/**
 * The chart runtime (plan §4.2, E7.1, E4.1, E4.3; ADR-019): `createChart(el, figure)` and the
 * {@link Chart} object.
 *
 * ## Pipeline
 *
 * ```
 * validate → supplyDefaults → calc (+extremes) → layout (size, margins, domains → viewports,
 * autorange → transforms) → plot (trace views) → components → render
 * ```
 *
 * Every update call edits the figure *input* synchronously, merges the stages its edit types
 * declare (core `planUpdate`) into one pending plan, and returns a promise. The pending plan runs
 * once in a microtask, so several calls in the same tick cost one pipeline run and one frame. Which
 * stages run:
 *
 * - supply-defaults always (cheap, keeps `full*` consistent);
 * - calc only for traces whose calc was invalidated (or all traces on an axis whose type or
 *   categories changed);
 * - layout (margins, domains, autorange, transforms) when any `calc`/`layout`/`ticks`/`plot` stage
 *   was declared or the container resized;
 * - trace views get a {@link TraceUpdatePlan}: a `marker.color` restyle is `style` only, an axis
 *   range relayout is `transform` only (uniforms, no uploads).
 *
 * ## Update promises
 *
 * `ready` and every update promise resolve once the result is fully drawn: the frame is rendered,
 * async text of trace and component primitives (anything with a `ready` promise, e.g. SDF
 * `TextPrimitive`s) has finished typesetting and been re-rendered, and passes that components
 * scheduled meanwhile (automargin after measuring labels) have run as well (up to 8 follow-ups).
 * Without pending text this is the same frame the update drew.
 */
import {
  applyUirevision,
  coerceContainer,
  configSchema,
  createUiState,
  deepMerge,
  diffFigures,
  getIn,
  isPlainObject,
  recordGuiEdit,
  supplyDefaults,
  toRGBA,
  type AxisExtremes,
  type FigureInput,
  type FullAxis,
  type FullConfig,
  type FullLayout,
  type FullTrace,
  type Stage,
  type SupplyDefaultsResult,
  type UiState,
} from '@mk7s/holochart-core';
import {
  browserFrameScheduler,
  createRenderRoot,
  subscribeFontChanges,
  IDENTITY_TRANSFORM,
  type FrameScheduler,
  type DataTransform,
  type Primitive,
  type RenderRoot,
  type RenderRootOptions,
  type Viewport,
  type ViewportRect,
} from '@mk7s/holochart-render';
import type { Object3D, Scene, WebGLRenderer } from 'three';
import {
  axisCategoryLists,
  axisTypeOf,
  dataTransform,
  isCategorical,
  resolveAxisRange,
  syncScale,
  type ScaleState,
} from './axes.ts';
import type {
  AxisInfo,
  CalcContext,
  ComponentDrawContext,
  ComponentModule,
  ComponentPointerEvent,
  ComponentView,
  MarginPush,
  SubplotInfo,
  TraceExtremes,
  TraceModule,
  TracePlotContext,
  TraceUpdatePlan,
  TraceView,
} from './contracts.ts';
import {
  ChartEmitter,
  type ChartEventKey,
  type ChartEventName,
  type ChartEvents,
  type ChartListener,
  type ChartPoint,
} from './events.ts';
import type { LinearRange } from './fx/geometry.ts';
import type { HoverEntry } from './fx/hover.ts';
import { Interaction } from './fx/interaction.ts';
import { HoverLayer } from './fx/labels.ts';
import {
  ensureFx,
  resolveFxSettings,
  traceAttr,
  type Dragmode,
  type FxSettings,
  type Hovermode,
} from './fx/settings.ts';
import {
  axisName,
  domainSpan,
  plotArea,
  resolveFigureSize,
  resolveMargins,
  splitSubplotId,
  type Margins,
  type Size,
} from './layout.ts';
import {
  applyEdits,
  distributeRestyle,
  flattenPatch,
  inputTraceType,
  needsLayout,
  planLayoutEdit,
  planTraceEdit,
  tracePlan,
  withRangeImplications,
  type AttributeUpdate,
} from './plan.ts';
import { registry as defaultRegistry, type ChartRegistry } from './registry.ts';

/** Options for {@link createChart} that are not part of the figure. */
export interface ChartOptions {
  /** Registry to resolve trace types and components from. Default: the shared `registry`. */
  registry?: ChartRegistry;
  /** Low-level render-root options (tests inject a fake renderer and frame scheduler here). */
  renderRoot?: Pick<RenderRootOptions, 'createRenderer' | 'scheduler' | 'preserveDrawingBuffer'>;
}

/** A partial figure for {@link Chart.update}: merged into the current figure. */
export interface FigurePatch {
  /** Per-trace patches, matched to `options.traces` (or to trace `i` for `data[i]`). */
  data?: readonly (Readonly<Record<string, unknown>> | null | undefined)[];
  layout?: Readonly<Record<string, unknown>>;
  /** Changing config re-creates the chart's renderer. */
  config?: Readonly<Record<string, unknown>>;
}

/** Escape hatches into three.js (plan §7.2, E8.13). */
export interface ChartThree {
  readonly renderer: WebGLRenderer;
  /** The render root: render loop, viewports, resources. */
  readonly root: RenderRoot;
  /** The overlay viewport's scene (paper-space, drawn last): add custom objects here. */
  readonly scene: Scene;
  readonly overlay: Viewport;
  /** Every viewport, in draw order. */
  readonly viewports: readonly Viewport[];
  /** The viewport of a cartesian subplot (`'xy'`, `'x2y2'`). */
  subplot(id: string): Viewport | undefined;
}

type TraceIndices = number | readonly number[];

interface Figure {
  data: unknown[];
  layout: Record<string, unknown>;
  config: unknown;
  frames: unknown;
  datasets: FigureInput['datasets'];
}

interface Plan {
  /** Recalc and redraw everything (first draw, renderer re-created). */
  full: boolean;
  /** Re-create the render root (config changed). */
  remount: boolean;
  /** Validate the input (react, new data). */
  validate: boolean;
  /** The container resized. */
  resize: boolean;
  /** Traces were added, removed or reordered since the last run. */
  structural: boolean;
  /** Declared layout-level stages. */
  layout: Set<Stage>;
  /** Declared stages per trace (current indices). */
  traces: Map<number, Set<Stage>>;
  /** Traces whose selection (`selectedpoints`) changed (E6.3). */
  selection: Set<number>;
  /** Events to emit after the frame. */
  after: (() => void)[];
}

interface Waiter {
  resolve(chart: Chart): void;
  reject(error: unknown): void;
  /** Pipeline runs this waiter has already followed (see `#settle`). */
  passes?: number;
}

interface TraceSlot {
  module: TraceModule | undefined;
  calc: unknown;
  hasCalc: boolean;
  extremes: TraceExtremes | undefined;
  view: TraceView | undefined;
  viewport: Viewport | undefined;
  primitives: Set<Primitive<unknown>>;
  /**
   * Interactive selection (E6.3): indices, `null` (cleared), or `undefined` to follow the trace's
   * `selectedpoints` attribute.
   */
  selection: readonly number[] | null | undefined;
}

interface ComponentSlot {
  module: ComponentModule;
  view: ComponentView | undefined;
  primitives: Map<Primitive<unknown>, Viewport>;
}

const EMPTY_STAGES: ReadonlySet<Stage> = new Set();
/** Layout passes at most per pipeline run (automargin, E4.2). */
const AUTOMARGIN_PASSES = 3;
/** Pipeline runs a `ready` / update promise follows while components keep requesting passes. */
const MAX_SETTLE_PASSES = 8;
const EMPTY_ENTRIES: readonly HoverEntry[] = [];
/**
 * Trace categories that share cross-trace calc across trace types (see
 * `TraceModule.crossTraceCalc`): every trace whose module lists one of them stacks / groups with
 * the others on its subplot.
 */
export const STACK_GROUPS: ReadonlySet<string> = new Set(['bar-like']);
/** A zoom or pan preview: new transforms only (plan E6.2). */
const TRANSFORM_ONLY: TraceUpdatePlan = { calc: false, plot: false, style: false, transform: true };
const TICKS_ONLY: ReadonlySet<Stage> = new Set<Stage>(['ticks']);

/** The axis state `config.doubleClick: 'reset'` returns to (captured at the first draw). */
interface InitialAxis {
  autorange: unknown;
  /** The input range (range units), for fixed-range axes. */
  range: unknown;
  /** The linear range shown after the first draw. */
  inUse: readonly [number, number];
}
const DEFAULT_SIZE: Size = { width: 700, height: 450 };

class AxisSlot implements AxisInfo {
  readonly id: string;
  readonly name: string;
  readonly letter: 'x' | 'y';
  full: FullAxis;
  state: ScaleState;
  start = 0;
  end = 0;

  constructor(id: string, full: FullAxis, state: ScaleState) {
    this.id = id;
    this.name = axisName(id);
    this.letter = id.startsWith('y') ? 'y' : 'x';
    this.full = full;
    this.state = state;
  }

  get type() {
    return this.state.type;
  }

  get scale() {
    return this.state.scale;
  }

  l2c(l: number): number {
    const p = this.state.scale.l2p(l);
    return this.letter === 'x' ? this.start + p : this.start - p;
  }
}

class SubplotSlot implements SubplotInfo {
  readonly id: string;
  readonly viewport: Viewport;
  xaxis: AxisSlot;
  yaxis: AxisSlot;
  rect: ViewportRect;
  transform: DataTransform;

  constructor(
    id: string,
    viewport: Viewport,
    xaxis: AxisSlot,
    yaxis: AxisSlot,
    rect: ViewportRect,
  ) {
    this.id = id;
    this.viewport = viewport;
    this.xaxis = xaxis;
    this.yaxis = yaxis;
    this.rect = rect;
    this.transform = dataTransform(xaxis.scale, yaxis.scale);
  }
}

function emptyPlan(): Plan {
  return {
    full: false,
    remount: false,
    validate: false,
    resize: false,
    structural: false,
    layout: new Set(),
    traces: new Map(),
    selection: new Set(),
    after: [],
  };
}

function addStages(plan: Plan, index: number, stages: Iterable<Stage>): void {
  let set = plan.traces.get(index);
  if (!set) plan.traces.set(index, (set = new Set()));
  for (const s of stages) set.add(s);
}

function normalizeFigure(figure: FigureInput | undefined): Figure {
  return {
    data: Array.isArray(figure?.data) ? [...(figure.data as unknown[])] : [],
    layout: isPlainObject(figure?.layout) ? figure.layout : {},
    config: figure?.config,
    frames: figure?.frames,
    datasets: figure?.datasets,
  };
}

function toList(indices: TraceIndices): number[] {
  return typeof indices === 'number' ? [indices] : [...indices];
}

/** Plotly's `moveTraces` order: `order[newIndex] = oldIndex`. */
function moveOrder(length: number, from: readonly number[], to: readonly number[]): number[] {
  const moving = new Set(from);
  const order: number[] = [];
  for (let i = 0; i < length; i++) if (!moving.has(i)) order.push(i);
  const placed = from.map((f, k) => ({ f, t: to[k] as number })).sort((a, b) => a.t - b.t);
  for (const { f, t } of placed) order.splice(t, 0, f);
  return order;
}

const CHARTS = new WeakMap<HTMLElement, Chart>();

/** The live chart in `el`, if any. */
export function getChart(el: HTMLElement): Chart | undefined {
  const chart = CHARTS.get(el);
  return chart && !chart.destroyed ? chart : undefined;
}

/**
 * A chart bound to a DOM element. Create with {@link createChart} (or `newPlot`). All update
 * methods return a promise that resolves with the chart once the result is fully drawn.
 *
 * Interaction (hover, click, zoom / pan, selection; plan E6) is attached unless
 * `config.staticPlot`; see `fx/interaction.ts` for the dispatch order and `ComponentView`'s
 * `handlePointer` for how components take pointer events first.
 */
export class Chart {
  /** The element the chart renders into (it owns one canvas inside it). */
  readonly element: HTMLElement;
  /**
   * Resolves once the first figure is fully drawn — including async text (tick labels, titles,
   * legend) and any follow-up pass components asked for — so it is safe to screenshot or export
   * (see "Update promises" above). Rejects on a strict-mode validation error.
   */
  readonly ready: Promise<Chart>;

  readonly #registry: ChartRegistry;
  readonly #options: ChartOptions;
  readonly #events = new ChartEmitter();
  readonly #ui: UiState = createUiState();
  #figure: Figure;
  #full: SupplyDefaultsResult | undefined;
  #root: RenderRoot | undefined;
  #rootListeners: (() => void)[] = [];
  #observer: ResizeObserver | null = null;
  #observed: Size = { width: -1, height: -1 };
  #size: Size = { width: 0, height: 0 };
  #margins: Margins = { l: 0, r: 0, t: 0, b: 0 };
  #plotArea: ViewportRect = { x: 0, y: 0, width: 0, height: 0 };
  #traces: (TraceSlot | undefined)[] = [];
  #axes = new Map<string, AxisSlot>();
  #subplots = new Map<string, SubplotSlot>();
  #components = new Map<string, ComponentSlot>();
  #plan: Plan | null = null;
  #waiters: Waiter[] = [];
  #layer: HoverLayer | undefined;
  #fx: Interaction | undefined;
  #hoverEntries: Map<string, HoverEntry[]> | null = null;
  #componentOrder: ComponentSlot[] = [];
  /** `#subplots` as an array, for per-frame pointer work (no iterator allocations). */
  #subplotList: SubplotSlot[] = [];
  #initialAxes = new Map<string, InitialAxis>();
  #scheduled = false;
  #destroyed = false;
  #unsubscribeFonts: (() => void) | undefined;

  /** Prefer {@link createChart}. A chart already in `el` is destroyed first. */
  constructor(el: HTMLElement, figure: FigureInput = {}, options: ChartOptions = {}) {
    this.element = el;
    this.#registry = options.registry ?? defaultRegistry;
    // Interaction layout attributes (hoverdistance, clickmode, hoverlabel, …): see fx/settings.ts.
    ensureFx(this.#registry);
    this.#options = options;
    this.#figure = normalizeFigure(figure);
    CHARTS.get(el)?.destroy();
    CHARTS.set(el, this);
    // Mount now so `chart.three` works right away; the first run sizes everything properly.
    const config = coerceContainer(configSchema, figure.config) as FullConfig;
    this.#mount(config, resolveFigureSize(this.#figure.layout, DEFAULT_SIZE, this.#container()));
    this.ready = this.#schedule((plan) => {
      plan.full = true;
      plan.validate = true;
    });
    // Text is measured synchronously (tick labels, legend, automargin) with whatever font the
    // browser has; a web font that finishes loading later changes those metrics. Re-run layout
    // then, or margins and label placement stay computed with the fallback font.
    this.#unsubscribeFonts = subscribeFontChanges(() => this.#fontsChanged());
  }

  #fontsChanged(): void {
    if (this.#destroyed) return;
    this.#schedule((plan) => {
      plan.layout.add('layout');
    }).catch(() => undefined);
  }

  // ---- state ----------------------------------------------------------------------------------

  /** The figure's traces as given (after updates). Treat as read-only. */
  get data(): readonly unknown[] {
    return this.#figure.data;
  }

  get layout(): Readonly<Record<string, unknown>> {
    return this.#figure.layout;
  }

  get config(): unknown {
    return this.#figure.config;
  }

  /** Traces after defaults (as of the last pipeline run). */
  get fullData(): readonly FullTrace[] {
    return this.#full?.fullData ?? [];
  }

  /** Layout after defaults and layout (axis `range`s hold the ranges in use). */
  get fullLayout(): FullLayout | undefined {
    return this.#full?.fullLayout;
  }

  get fullConfig(): FullConfig | undefined {
    return this.#full?.fullConfig;
  }

  /** Calcdata of trace `index`, as produced by its module's `calc`. */
  getCalcdata(index: number): unknown {
    return this.#traces[index]?.calc;
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  /** Figure size in CSS px. */
  get size(): Readonly<Size> {
    return this.#size;
  }

  /** The solved layout: axes and subplots (read-only snapshots of runtime state). */
  get axes(): ReadonlyMap<string, AxisInfo> {
    return this.#axes;
  }

  get subplots(): ReadonlyMap<string, SubplotInfo> {
    return this.#subplots;
  }

  // ---- escape hatches -------------------------------------------------------------------------

  get three(): ChartThree {
    const root = this.#requireRoot();
    const overlay = root.overlay as Viewport;
    return {
      renderer: root.renderer,
      root,
      scene: overlay.scene,
      overlay,
      viewports: root.viewports,
      subplot: (id) => this.#subplots.get(id)?.viewport,
    };
  }

  /** The three.js objects trace `index` currently draws with. */
  getTraceObjects(index: number): Object3D[] {
    const slot = this.#traces[index];
    return slot ? [...slot.primitives].map((p) => p.object) : [];
  }

  // ---- events ---------------------------------------------------------------------------------

  /** Subscribe to an event (Plotly names such as `'plotly_relayout'` work too). */
  on<K extends ChartEventKey>(type: K, listener: ChartListener<K>): () => void {
    return this.#events.on(type, listener);
  }

  once<K extends ChartEventKey>(type: K, listener: ChartListener<K>): () => void {
    return this.#events.once(type, listener);
  }

  /** Unsubscribe `listener`, or every listener of `type` when omitted. */
  off<K extends ChartEventKey>(type: K, listener?: ChartListener<K>): void {
    this.#events.off(type, listener);
  }

  /**
   * Emit an event to this chart's listeners (components use it for `legendclick`, …). Returns
   * `false` when a listener returned `false`, i.e. the default action should be skipped.
   */
  emit<K extends ChartEventName>(type: K, payload: ChartEvents[K]): boolean {
    return this.#events.emit(type, payload);
  }

  // ---- interaction (E6) -------------------------------------------------------------------------

  /** The interaction settings in effect (`hovermode`, `dragmode`, `clickmode`, …). */
  get interaction(): FxSettings {
    return resolveFxSettings(this.#full?.fullLayout, this.#full?.fullConfig, this.#figure.layout);
  }

  /**
   * Show hover labels and emit `hover` programmatically (Plotly `Fx.hover`): points by trace and
   * index, or a position in data units (`{ xval, yval, subplot? }`) resolved with `hovermode`.
   */
  hover(
    target:
      | readonly { readonly curveNumber: number; readonly pointNumber: number }[]
      | { readonly xval?: unknown; readonly yval?: unknown; readonly subplot?: string },
  ): void {
    this.#fx?.hover(target);
  }

  /** Hide hover labels (emits `unhover` when something was hovered). */
  unhover(): void {
    this.#fx?.unhover();
  }

  /** Set `layout.dragmode` as a user interaction (modebar buttons; kept across `uirevision`). */
  setDragmode(mode: Dragmode): Promise<Chart> {
    return this.relayout({ dragmode: mode }, { gui: true });
  }

  /** Set `layout.hovermode` as a user interaction (modebar hover buttons). */
  setHovermode(mode: Hovermode): Promise<Chart> {
    return this.relayout({ hovermode: mode }, { gui: true });
  }

  /**
   * Zoom every (non-fixed) axis of a subplot — all subplots by default — around its center:
   * `factor < 1` zooms in (modebar zoom in: 0.5, zoom out: 2).
   */
  zoom(factor: number, options: { subplot?: string } = {}): Promise<Chart> {
    const ranges = new Map<string, LinearRange>();
    for (const sp of this.#subplots.values()) {
      if (options.subplot !== undefined && sp.id !== options.subplot) continue;
      for (const axis of [sp.xaxis, sp.yaxis]) {
        if (ranges.has(axis.id) || this.#isFixed(axis)) continue;
        const [r0, r1] = axis.scale.range;
        const c = (r0 + r1) / 2;
        ranges.set(axis.id, [c + (r0 - c) * factor, c + (r1 - c) * factor]);
      }
    }
    return this.#commitRanges(ranges);
  }

  /** Autorange every axis (modebar "autoscale"). */
  autoscale(): Promise<Chart> {
    return this.#resetView('autosize');
  }

  /** Return every axis to its initial range (modebar "reset axes"). */
  resetAxes(): Promise<Chart> {
    return this.#resetView('reset');
  }

  /** Clear every selection (emits `deselect` when there was one). */
  clearSelection(): Promise<Chart> {
    const had = this.#clearSelection();
    if (had) this.#events.emit('deselect', undefined);
    return this.#schedule(() => undefined);
  }

  // ---- update API (E7.1) ----------------------------------------------------------------------

  /**
   * Change trace attributes by attribute string (Plotly `restyle`). Array values give one value
   * per listed trace, so wrap data arrays: `restyle({ x: [[1, 2, 3]] }, 0)`. `null` resets an
   * attribute to its default; `undefined` is ignored.
   */
  restyle(
    update: AttributeUpdate,
    traces?: TraceIndices,
    options: { gui?: boolean } = {},
  ): Promise<Chart> {
    return this.#schedule((plan) => {
      if (options.gui) this.#recordTraceGui(update, traces);
      this.#restyleInto(plan, update, traces);
    });
  }

  /**
   * Change layout attributes by attribute string (Plotly `relayout`), e.g. `'xaxis.range[0]'`.
   * `gui: true` marks it as a user interaction (zoom, modebar), which `uirevision` preserves.
   */
  relayout(update: AttributeUpdate, options: { gui?: boolean } = {}): Promise<Chart> {
    return this.#schedule((plan) => {
      if (options.gui) this.#recordLayoutGui(update);
      this.#relayoutInto(plan, update);
    });
  }

  /** `restyle` and `relayout` in one update (Plotly's `update`). */
  updateAttributes(
    traceUpdate: AttributeUpdate,
    layoutUpdate: AttributeUpdate,
    traces?: TraceIndices,
  ): Promise<Chart> {
    return this.#schedule((plan) => {
      this.#restyleInto(plan, traceUpdate, traces);
      this.#relayoutInto(plan, layoutUpdate);
    });
  }

  /**
   * Deep-merge a partial figure (plan §7.2): `chart.update({ data: [{ y }] }, { traces: [2] })`.
   * Nested objects merge; arrays and other values replace; `null` resets to the default.
   */
  update(patch: FigurePatch, options: { traces?: TraceIndices } = {}): Promise<Chart> {
    return this.#schedule((plan) => {
      if (patch.config !== undefined) {
        this.#figure.config = deepMerge(this.#figure.config ?? {}, patch.config);
        plan.full = plan.remount = true;
      }
      if (patch.layout) this.#relayoutInto(plan, flattenPatch(patch.layout));
      if (patch.data) {
        const targets =
          options.traces === undefined
            ? patch.data.map((_, k) => k)
            : this.#indices(options.traces, 'update');
        patch.data.forEach((tracePatch, k) => {
          const index = targets[k];
          if (!tracePatch || index === undefined) return;
          this.#checkIndex(index, 'update');
          this.#editTraceInto(plan, index, flattenPatch(tracePatch));
        });
      }
    });
  }

  /**
   * Replace the figure (Plotly `react`). Only what changed is recomputed (core `diffFigures`):
   * matched traces keep their GPU objects, data arrays compare by reference, and a changed
   * `config` re-creates the renderer.
   */
  react(figure: FigureInput): Promise<Chart> {
    if (this.#destroyed) return Promise.reject(destroyedError());
    // Double-click "reset" returns to the ranges of the latest figure the app gave.
    this.#initialAxes.clear();
    const current = this.#figure;
    const next = normalizeFigure(figure);
    const effective = normalizeFigure(applyUirevision(current, next, this.#ui));
    const diff = diffFigures(current, effective, this.#registry.core);
    if (diff.empty && !this.#plan) {
      this.#figure = effective;
      return Promise.resolve(this);
    }
    return this.#schedule((plan) => {
      this.#figure = effective;
      plan.validate = true;
      if (diff.configChanged) {
        plan.full = plan.remount = true;
        return;
      }
      const t = diff.traces;
      if (t.added.length > 0 || t.removed.length > 0 || t.moved.length > 0) {
        const order: (number | undefined)[] = Array.from({ length: effective.data.length });
        for (const m of t.matched) order[m.to] = m.from;
        this.#remap(plan, order);
      }
      const byTrace = new Map<number, { type: string; paths: string[] }>();
      const layoutPaths: string[] = [];
      for (const change of diff.changes) {
        if (change.target === 'layout') layoutPaths.push(change.path);
        else if (change.traceIndex !== undefined) {
          if (change.path.startsWith('selectedpoints'))
            this.#followInputSelection(plan, change.traceIndex);
          const entry = byTrace.get(change.traceIndex) ?? { type: change.type, paths: [] };
          entry.paths.push(change.path);
          byTrace.set(change.traceIndex, entry);
        }
      }
      for (const s of planLayoutEdit(layoutPaths, this.#registry.core)) plan.layout.add(s);
      for (const [i, { type, paths }] of byTrace) {
        addStages(plan, i, planTraceEdit(paths, type, i, this.#registry.core, this.#fullFor(plan)));
      }
    });
  }

  /** Add traces (at the end, or at `newIndices` in the final order, like Plotly). */
  addTraces(
    traces: Readonly<Record<string, unknown>> | readonly Readonly<Record<string, unknown>>[],
    newIndices?: TraceIndices,
  ): Promise<Chart> {
    return this.#schedule((plan) => {
      const list = Array.isArray(traces) ? traces : [traces];
      const n = this.#figure.data.length;
      const total = n + list.length;
      let order: (number | undefined)[] = Array.from({ length: total }, (_, i) =>
        i < n ? i : undefined,
      );
      const data = [...this.#figure.data, ...list];
      if (newIndices !== undefined) {
        const to = toList(newIndices).map((i) => (i < 0 ? total + i : i));
        if (to.length !== list.length || to.some((i) => i < 0 || i >= total)) {
          throw new RangeError('addTraces: newIndices must give one valid index per new trace');
        }
        const moved = moveOrder(
          total,
          list.map((_, k) => n + k),
          to,
        );
        order = moved.map((i) => order[i]);
        this.#figure.data = moved.map((i) => data[i]);
      } else {
        this.#figure.data = data;
      }
      this.#remap(plan, order);
      plan.validate = true;
    });
  }

  /** Remove traces by index (negative indices count from the end). */
  deleteTraces(indices: TraceIndices): Promise<Chart> {
    return this.#schedule((plan) => {
      const remove = new Set(this.#indices(indices, 'deleteTraces'));
      const order: number[] = [];
      for (let i = 0; i < this.#figure.data.length; i++) if (!remove.has(i)) order.push(i);
      this.#figure.data = order.map((i) => this.#figure.data[i]);
      this.#remap(plan, order);
    });
  }

  /** Reorder traces (Plotly `moveTraces`); without `newIndices` they move to the end. */
  moveTraces(current: TraceIndices, newIndices?: TraceIndices): Promise<Chart> {
    return this.#schedule((plan) => {
      const n = this.#figure.data.length;
      const from = this.#indices(current, 'moveTraces');
      const to =
        newIndices === undefined
          ? from.map((_, k) => n - from.length + k)
          : toList(newIndices).map((i) => (i < 0 ? n + i : i));
      if (to.length !== from.length || to.some((i) => i < 0 || i >= n)) {
        throw new RangeError('moveTraces: newIndices must give one valid index per moved trace');
      }
      const order = moveOrder(n, from, to);
      this.#figure.data = order.map((i) => this.#figure.data[i]);
      this.#remap(plan, order);
    });
  }

  /** Re-measure the container and re-layout (automatic with `config.responsive`). */
  resize(): Promise<Chart> {
    return this.#schedule((plan) => {
      plan.resize = true;
    });
  }

  /** Free every GPU resource, listener and DOM node the chart created. Idempotent. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#unsubscribeFonts?.();
    this.#unsubscribeFonts = undefined;
    this.#unmount();
    this.#events.emit('destroy', undefined);
    this.#events.clear();
    if (CHARTS.get(this.element) === this) CHARTS.delete(this.element);
  }

  // ---- edit helpers -----------------------------------------------------------------------------

  #checkIndex(index: number, what: string): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.#figure.data.length) {
      throw new RangeError(`${what}: trace index ${index} is out of range`);
    }
  }

  /** Normalize trace indices (undefined → all, negative → from the end) and check bounds. */
  #indices(traces: TraceIndices | undefined, what: string): number[] {
    const n = this.#figure.data.length;
    if (traces === undefined) return Array.from({ length: n }, (_, i) => i);
    const out = toList(traces).map((i) => (i < 0 ? n + i : i));
    for (const i of out) this.#checkIndex(i, what);
    return out;
  }

  /** `fullData`/`fullLayout` for resolving `calcIfAutorange`, when indices still line up. */
  #fullFor(plan: Plan) {
    return this.#full && !plan.structural
      ? { fullData: this.#full.fullData, fullLayout: this.#full.fullLayout }
      : undefined;
  }

  #editTraceInto(plan: Plan, index: number, edits: AttributeUpdate): void {
    const paths = Object.keys(edits).filter((p) => edits[p] !== undefined);
    if (paths.length === 0) return;
    const trace = applyEdits(this.#figure.data[index], edits);
    this.#figure.data[index] = trace;
    if (paths.some((p) => p.startsWith('selectedpoints'))) this.#followInputSelection(plan, index);
    const stages = planTraceEdit(
      paths,
      inputTraceType(trace),
      index,
      this.#registry.core,
      this.#fullFor(plan),
    );
    addStages(plan, index, stages);
  }

  #restyleInto(plan: Plan, update: AttributeUpdate, traces: TraceIndices | undefined): void {
    const indices = this.#indices(traces, 'restyle');
    const perTrace = distributeRestyle(update, indices);
    for (const [i, edits] of perTrace) this.#editTraceInto(plan, i, edits);
    if (Object.keys(update).length > 0) {
      plan.after.push(() => this.#events.emit('restyle', { update, traces: indices }));
    }
  }

  #relayoutInto(plan: Plan, update: AttributeUpdate, payload?: AttributeUpdate): void {
    const edits = withRangeImplications(update, this.#figure.layout, this.#full?.fullLayout);
    const paths = Object.keys(edits).filter((p) => edits[p] !== undefined);
    if (paths.length === 0) return;
    this.#figure.layout = applyEdits(this.#figure.layout, edits);
    for (const s of planLayoutEdit(paths, this.#registry.core)) plan.layout.add(s);
    plan.after.push(() => this.#events.emit('relayout', payload ?? edits));
  }

  #recordLayoutGui(update: AttributeUpdate): void {
    const edits = withRangeImplications(update, this.#figure.layout, this.#full?.fullLayout);
    for (const [path, value] of Object.entries(edits)) {
      if (value === undefined) continue;
      recordGuiEdit(this.#ui, { kind: 'layout' }, path, getIn(this.#figure.layout, path), value);
    }
  }

  #recordTraceGui(update: AttributeUpdate, traces: TraceIndices | undefined): void {
    const indices = this.#indices(traces, 'restyle');
    for (const [i, edits] of distributeRestyle(update, indices)) {
      const input = this.#figure.data[i];
      const uid =
        isPlainObject(input) && typeof input['uid'] === 'string' ? input['uid'] : undefined;
      for (const [path, value] of Object.entries(edits)) {
        recordGuiEdit(
          this.#ui,
          { kind: 'trace', index: i, ...(uid ? { uid } : {}) },
          path,
          getIn(input, path),
          value,
        );
      }
    }
  }

  /**
   * Re-index trace slots after traces were added, removed or moved: `order[newIndex] = oldIndex`
   * (`undefined` for new traces). Removed traces free their GPU objects now; moved traces are
   * re-read (draw order) and restyled (colorway colors cycle by index).
   */
  #remap(plan: Plan, order: readonly (number | undefined)[]): void {
    const old = this.#traces;
    const kept = new Set<number>();
    this.#traces = order.map((from) => {
      if (from === undefined) return undefined;
      kept.add(from);
      return old[from];
    });
    old.forEach((slot, i) => {
      if (slot && !kept.has(i)) this.#disposeView(slot);
    });
    const stages = new Map<number, Set<Stage>>();
    order.forEach((from, to) => {
      const s = from === undefined ? undefined : plan.traces.get(from);
      if (s) stages.set(to, s);
    });
    plan.traces = stages;
    order.forEach((from, to) => {
      if (from !== to) addStages(plan, to, ['plot', 'style']);
    });
    plan.structural = true;
    plan.layout.add('layout');
  }

  // ---- scheduling -------------------------------------------------------------------------------

  #schedule(mutate: (plan: Plan) => void): Promise<Chart> {
    if (this.#destroyed) return Promise.reject(destroyedError());
    const plan = (this.#plan ??= emptyPlan());
    try {
      mutate(plan);
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise<Chart>((resolve, reject) => {
      this.#waiters.push({ resolve, reject });
      if (!this.#scheduled) {
        this.#scheduled = true;
        queueMicrotask(() => this.#drain());
      }
    });
  }

  #drain(): void {
    this.#scheduled = false;
    const plan = this.#plan;
    const waiters = this.#waiters;
    this.#plan = null;
    this.#waiters = [];
    if (this.#destroyed || !plan) {
      for (const w of waiters) w.resolve(this);
      return;
    }
    try {
      this.#run(plan);
      this.#root?.flush();
    } catch (error) {
      for (const w of waiters) w.reject(error);
      return;
    }
    try {
      for (const emit of plan.after) emit();
      this.#events.emit('afterplot', undefined);
    } finally {
      this.#settle(waiters);
    }
  }

  /**
   * Resolve update promises once the chart is fully drawn: async text (SDF glyphs, ADR-005) of
   * every trace and component primitive is typeset and its frame rendered, and follow-up passes
   * components scheduled meanwhile (automargin after measuring text) have run too — so `ready`
   * and every update promise are the one "fully drawn" signal for tests and export. Without
   * pending text this resolves synchronously, as before.
   */
  #settle(waiters: Waiter[], seen?: Set<Promise<unknown>>): void {
    if (waiters.length === 0) return;
    // Web fonts still loading: text measured so far may use a fallback font. Wait for them, then
    // for the re-layout that follows (see `#fontsChanged`), so `ready` means "final fonts".
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!this.#destroyed && fonts?.status === 'loading') {
      const resume = (): void => {
        if (this.#destroyed) {
          for (const w of waiters) w.resolve(this);
          return;
        }
        this.#schedule((plan) => {
          plan.layout.add('layout');
        }).catch(() => undefined);
        this.#waiters.push(...waiters);
      };
      fonts.ready.then(resume, resume);
      return;
    }
    // Text `ready` promises stay the same (resolved) until the next typesetting: wait only for
    // ones not waited for yet, so this ends once nothing new started typesetting.
    const text = this.#destroyed ? [] : this.#pendingText().filter((p) => !seen?.has(p));
    if (text.length > 0) {
      const next = new Set(seen);
      for (const p of text) next.add(p);
      const again = (): void => this.#settle(waiters, next);
      Promise.all(text).then(again, again);
      return;
    }
    if (!this.#destroyed) this.#root?.flush();
    // A follow-up run is queued (a component asked for another pass): resolve after it.
    const follow = this.#plan !== null && !this.#destroyed;
    for (const w of waiters) {
      const passes = w.passes ?? 0;
      if (follow && passes < MAX_SETTLE_PASSES) {
        w.passes = passes + 1;
        this.#waiters.push(w);
      } else w.resolve(this);
    }
  }

  /** `ready` promises of primitives still typesetting (text), across traces and components. */
  #pendingText(): Promise<unknown>[] {
    const out: Promise<unknown>[] = [];
    const collect = (p: Primitive<unknown>): void => {
      const ready = (p as { readonly ready?: unknown }).ready;
      if (ready instanceof Promise) out.push(ready);
    };
    for (const slot of this.#traces) if (slot) for (const p of slot.primitives) collect(p);
    for (const slot of this.#components.values())
      for (const p of slot.primitives.keys()) collect(p);
    return out;
  }

  // ---- mount ------------------------------------------------------------------------------------

  #container(): Size {
    return { width: this.element.clientWidth, height: this.element.clientHeight };
  }

  #requireRoot(): RenderRoot {
    if (!this.#root) throw destroyedError();
    return this.#root;
  }

  #mount(config: FullConfig, size: Size): void {
    const pixelRatio = typeof config.pixelRatio === 'number' ? config.pixelRatio : undefined;
    const root = createRenderRoot(this.element, {
      // The chart owns sizing (layout.width/height vs the container), so the root must not resize
      // itself to the container.
      responsive: false,
      width: size.width,
      height: size.height,
      background: null,
      antialias: config.antialias,
      powerPreference: config.powerPreference,
      ...(pixelRatio === undefined ? {} : { pixelRatio }),
      ...this.#options.renderRoot,
    });
    this.#root = root;
    this.#size = { ...size };
    const events = this.#events;
    this.#rootListeners = [
      root.on('beforerender', (info) => events.emit('beforerender', info)),
      root.on('afterrender', (info) => events.emit('afterrender', info)),
      root.on('contextlost', () => events.emit('webglcontextlost', undefined)),
      root.on('contextrestored', () => events.emit('webglcontextrestored', undefined)),
    ];
    if (config.responsive && typeof ResizeObserver !== 'undefined') {
      this.#observed = this.#container();
      this.#observer = new ResizeObserver(this.#onResize);
      this.#observer.observe(this.element);
    }
    if (config.staticPlot !== true) {
      this.#layer = new HoverLayer(this.element);
      this.#fx = new Interaction(this.#interactionHost(root, this.#layer));
    }
  }

  #unmount(): void {
    this.#fx?.destroy();
    this.#fx = undefined;
    this.#layer?.destroy();
    this.#layer = undefined;
    this.#hoverEntries = null;
    for (const slot of this.#traces) if (slot) this.#disposeView(slot);
    this.#traces = [];
    for (const slot of this.#components.values()) this.#disposeComponent(slot);
    this.#components.clear();
    this.#componentOrder = [];
    this.#subplots.clear();
    this.#subplotList = [];
    this.#axes.clear();
    this.#observer?.disconnect();
    this.#observer = null;
    for (const off of this.#rootListeners) off();
    this.#rootListeners = [];
    this.#root?.destroy();
    this.#root = undefined;
  }

  readonly #onResize = (entries: ResizeObserverEntry[]): void => {
    const rect = entries[entries.length - 1]?.contentRect;
    if (!rect || this.#destroyed) return;
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w === this.#observed.width && h === this.#observed.height) return;
    this.#observed = { width: w, height: h };
    const layoutIn = this.#figure.layout;
    // Only dimensions left to the container follow it (autosize semantics).
    if (layoutIn['width'] !== undefined && layoutIn['height'] !== undefined) return;
    this.resize().catch(() => {
      // The error already rejected the promises of the calls batched with this resize.
    });
  };

  // ---- pipeline -----------------------------------------------------------------------------------

  #run(plan: Plan): void {
    const registry = this.#registry;
    const validate =
      plan.full ||
      plan.validate ||
      plan.layout.has('calc') ||
      [...plan.traces.values()].some((s) => s.has('calc'));
    const full = supplyDefaults(this.#figure, registry.core, { validate });
    this.#full = full;
    const { fullData, fullLayout, fullConfig } = full;

    // Measure before (re)mounting: an old canvas must not decide the new size.
    const size = resolveFigureSize(this.#figure.layout, fullLayout, this.#container());
    if (plan.remount || !this.#root) {
      this.#unmount();
      this.#mount(fullConfig, size);
      plan.full = true;
    }
    const root = this.#requireRoot();
    const resized = size.width !== this.#size.width || size.height !== this.#size.height;
    if (resized) {
      root.resize(size.width, size.height);
      this.#size = size;
      if (!plan.full) plan.after.push(() => this.#events.emit('resize', { ...size }));
    }

    // Trace slots: a changed module (type) starts from scratch.
    const fresh: boolean[] = [];
    fullData.forEach((trace, i) => {
      const module = trace._module ? registry.getTrace(trace.type) : undefined;
      let slot = this.#traces[i];
      if (slot && slot.module !== module) {
        this.#disposeView(slot);
        slot = undefined;
      }
      // Hidden traces have no calc; they must not force a layout pass on every update.
      fresh[i] = trace.visible !== false && (plan.full || !slot || !slot.hasCalc);
      this.#traces[i] = slot ?? {
        module,
        calc: undefined,
        hasCalc: false,
        extremes: undefined,
        view: undefined,
        viewport: undefined,
        primitives: new Set(),
        selection: undefined,
      };
    });
    for (const slot of this.#traces.splice(fullData.length)) if (slot) this.#disposeView(slot);

    const layoutRan =
      plan.full ||
      plan.resize ||
      plan.structural ||
      resized ||
      needsLayout(plan.layout) ||
      fresh.some(Boolean) ||
      [...plan.traces.values()].some(needsLayout);

    const rescaled = layoutRan ? this.#syncAxes(fullLayout, fullData) : new Set<string>();

    // Margins, axis spans and subplot viewports first: `crossTraceCalc` gets its subplot.
    if (layoutRan) this.#layoutSubplots(fullLayout, fullData, size);

    // Calc.
    const plans: TraceUpdatePlan[] = fullData.map((trace, i) => {
      const slot = this.#traces[i] as TraceSlot;
      const onRescaled =
        rescaled.has(trace['xaxis'] as string) || rescaled.has(trace['yaxis'] as string);
      const tp = tracePlan(plan.traces.get(i) ?? EMPTY_STAGES, plan.layout, {
        forceCalc: (fresh[i] as boolean) || onRescaled,
        layoutRan,
      });
      if (trace.visible === false) {
        slot.hasCalc = false;
        slot.calc = undefined;
        slot.extremes = undefined;
        return tp;
      }
      if (tp.calc) {
        slot.calc = slot.module?.calc
          ? slot.module.calc(trace, this.#calcContext(trace, i))
          : undefined;
        slot.hasCalc = true;
      }
      return tp;
    });

    // Cross-trace calc (stacking, grouping) per subplot and trace type, then extremes.
    this.#crossTraceCalc(fullLayout, fullData, plan, plans);
    fullData.forEach((trace, i) => {
      const slot = this.#traces[i] as TraceSlot;
      const tp = plans[i] as TraceUpdatePlan;
      if (trace.visible !== true) slot.extremes = undefined;
      else if (tp.plot && slot.module?.extremes) {
        slot.extremes = slot.module.extremes(slot.calc, trace, this.#calcContext(trace, i));
      }
    });

    if (layoutRan) {
      this.#autorange(fullData);
      this.#automargin(fullLayout, fullData, size);
    }

    // Backgrounds are cheap to set: do it on every run (`paper_bgcolor` is a style edit).
    root.setBackground(toRGBA(fullLayout.paper_bgcolor) ?? null);
    const plotBg = toRGBA(fullLayout.plot_bgcolor) ?? null;
    for (const sp of this.#subplots.values()) sp.viewport.background = plotBg;

    for (const i of plan.selection) {
      const tp = plans[i];
      if (tp) plans[i] = { ...tp, selection: true };
    }
    fullData.forEach((trace, i) => this.#plotTrace(i, trace, plans[i] as TraceUpdatePlan));

    const stages = new Set(plan.layout);
    for (const s of plan.traces.values()) for (const stage of s) stages.add(stage);
    this.#drawComponents(fullLayout, fullData, { stages, layout: layoutRan });
    root.invalidate();

    if (layoutRan) this.#captureInitialAxes();
    this.#hoverEntries = null;
    this.#fx?.refresh();
  }

  #calcContext(trace: FullTrace, index: number): CalcContext {
    return {
      fullLayout: this.#full?.fullLayout as FullLayout,
      index,
      xaxis: this.#axes.get(trace['xaxis'] as string),
      yaxis: this.#axes.get(trace['yaxis'] as string),
    };
  }

  /** Axis types, categories and scales. Returns the ids of axes whose scale was replaced. */
  #syncAxes(fullLayout: FullLayout, fullData: readonly FullTrace[]): Set<string> {
    const rescaled = new Set<string>();
    const next = new Map<string, AxisSlot>();
    const ids = [...fullLayout._subplots.xaxis, ...fullLayout._subplots.yaxis];
    for (const id of ids) {
      const full = fullLayout[axisName(id)] as FullAxis | undefined;
      if (!full) continue;
      const type = axisTypeOf(full);
      let lists: ReturnType<typeof axisCategoryLists> = {};
      if (isCategorical(type)) {
        const letter = id.charAt(0);
        const columns: unknown[] = [];
        for (const trace of fullData) {
          if (trace.visible !== false && trace[`${letter}axis`] === id) columns.push(trace[letter]);
        }
        lists = axisCategoryLists(full, type, columns);
      }
      const prev = this.#axes.get(id);
      const state = syncScale(prev?.state, type, lists.categories, lists.multicategories);
      if (!prev || prev.state !== state) rescaled.add(id);
      const slot = prev ?? new AxisSlot(id, full, state);
      slot.full = full;
      slot.state = state;
      next.set(id, slot);
    }
    this.#axes = next;
    return rescaled;
  }

  /**
   * Margins, plot area, axis spans and subplot viewports (E4.1, E4.3). Ranges and transforms come
   * after calc, in {@link #autorange}.
   */
  #layoutSubplots(fullLayout: FullLayout, fullData: readonly FullTrace[], size: Size): void {
    this.#placeSubplots(fullLayout, this.#marginsFor(fullLayout, fullData, size), size);
  }

  /** Margins after every component's `pushMargin`, against the axes as they are now. */
  #marginsFor(fullLayout: FullLayout, fullData: readonly FullTrace[], size: Size): Margins {
    const pushes: MarginPush[] = [];
    for (const c of this.#registry.components()) {
      const p = c.pushMargin?.({
        fullLayout,
        fullData,
        width: size.width,
        height: size.height,
        axes: this.#axes,
      });
      if (Array.isArray(p)) pushes.push(...(p as MarginPush[]));
      else if (p) pushes.push(p as MarginPush);
    }
    return resolveMargins(fullLayout.margin, pushes, size);
  }

  /**
   * Automargin (E4.2): pushes depend on the axes (tick labels of the current range and length),
   * which depend on the margins. After the first autorange, re-measure and re-place until the
   * margins move less than half a pixel, at most {@link AUTOMARGIN_PASSES} passes in all.
   */
  #automargin(fullLayout: FullLayout, fullData: readonly FullTrace[], size: Size): void {
    for (let pass = 1; pass < AUTOMARGIN_PASSES; pass++) {
      const next = this.#marginsFor(fullLayout, fullData, size);
      const m = this.#margins;
      const moved = Math.max(
        Math.abs(next.l - m.l),
        Math.abs(next.r - m.r),
        Math.abs(next.t - m.t),
        Math.abs(next.b - m.b),
      );
      if (moved < 0.5) return;
      this.#placeSubplots(fullLayout, next, size);
      this.#autorange(fullData);
    }
  }

  /** Plot area, axis spans and subplot viewports for given margins. */
  #placeSubplots(fullLayout: FullLayout, margins: Margins, size: Size): void {
    const root = this.#requireRoot();
    this.#margins = margins;
    const area = plotArea(size, this.#margins);
    this.#plotArea = area;

    for (const axis of this.#axes.values()) {
      const span = domainSpan(area, axis.letter, axis.full.domain as [number, number]);
      axis.start = span.start;
      axis.end = span.end;
      axis.scale.setLength(Math.abs(span.end - span.start));
    }

    const next = new Map<string, SubplotSlot>();
    fullLayout._subplots.cartesian.forEach((id, order) => {
      const pair = splitSubplotId(id);
      const xa = pair && this.#axes.get(pair[0]);
      const ya = pair && this.#axes.get(pair[1]);
      if (!xa || !ya) return;
      const rect: ViewportRect = {
        x: xa.start,
        y: ya.end,
        width: xa.end - xa.start,
        height: ya.start - ya.end,
      };
      let slot = this.#subplots.get(id);
      if (slot) {
        slot.viewport.setRect(rect);
        slot.viewport.order = order;
        slot.xaxis = xa;
        slot.yaxis = ya;
        slot.rect = rect;
      } else {
        const viewport = root.addViewport({
          kind: '2d',
          rect,
          clip: true,
          order,
          name: `subplot-${id}`,
        });
        slot = new SubplotSlot(id, viewport, xa, ya, rect);
      }
      next.set(id, slot);
    });
    for (const [id, slot] of this.#subplots) {
      if (next.has(id)) continue;
      for (const t of this.#traces) if (t?.viewport === slot.viewport) this.#disposeView(t);
      for (const c of this.#components.values()) {
        for (const [p, vp] of c.primitives) if (vp === slot.viewport) c.primitives.delete(p);
      }
      root.removeViewport(slot.viewport);
    }
    this.#subplots = next;
    this.#subplotList = [...next.values()];
  }

  /** Axis ranges from trace extremes (E3.2), then every subplot's transform. */
  #autorange(fullData: readonly FullTrace[]): void {
    for (const axis of this.#axes.values()) {
      const extremes: AxisExtremes[] = [];
      const key = `${axis.letter}axis`;
      fullData.forEach((trace, i) => {
        if (trace.visible !== true || trace[key] !== axis.id) return;
        const e = this.#traces[i]?.extremes?.[axis.letter];
        if (e) extremes.push(e);
      });
      const [r0, r1] = resolveAxisRange(axis.full, axis.scale, extremes);
      axis.scale.setRange(r0, r1);
      // Like Plotly, the range in use is readable from fullLayout (linear coordinates).
      axis.full.range = [r0, r1];
    }
    for (const sp of this.#subplots.values()) {
      sp.transform = dataTransform(sp.xaxis.scale, sp.yaxis.scale);
    }
  }

  /**
   * Run `crossTraceCalc` once per subplot and stack group (plan §4.4): with every visible trace of
   * the group on the subplot, in trace order, after calc and before extremes. A trace's group is
   * the first of its module's `categories` listed in {@link STACK_GROUPS} (so bar, histogram,
   * funnel and waterfall stack together as `bar-like`), else its trace type; the group's first
   * module with a `crossTraceCalc` runs it. It reruns when any trace of the group (hidden ones
   * included: hiding a bar restacks the others) was recalculated or declared a `crossTraceCalc`
   * stage; every member then re-uploads (its calc was mutated in place).
   */
  #crossTraceCalc(
    fullLayout: FullLayout,
    fullData: readonly FullTrace[],
    plan: Plan,
    plans: TraceUpdatePlan[],
  ): void {
    const groups = new Map<
      string,
      { module: TraceModule | undefined; subplot: string; members: number[]; dirty: boolean }
    >();
    fullData.forEach((trace, i) => {
      const module = this.#traces[i]?.module;
      if (!module) return;
      const stack = module.categories.find((c) => STACK_GROUPS.has(c));
      if (!stack && !module.crossTraceCalc) return;
      const x = trace['xaxis'];
      const y = trace['yaxis'];
      if (typeof x !== 'string' || typeof y !== 'string') return;
      const key = `${stack ?? `type:${trace.type}`}\u0000${x}${y}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          module: undefined,
          subplot: x + y,
          members: [],
          dirty: plan.full || plan.structural,
        };
        groups.set(key, group);
      }
      group.module ??= module.crossTraceCalc ? module : undefined;
      group.members.push(i);
      const stages = plan.traces.get(i);
      if ((plans[i] as TraceUpdatePlan).calc || stages?.has('crossTraceCalc')) group.dirty = true;
    });
    if (plan.layout.has('crossTraceCalc')) for (const g of groups.values()) g.dirty = true;
    for (const group of groups.values()) {
      if (!group.dirty || !group.module?.crossTraceCalc) continue;
      const subplot = this.#subplots.get(group.subplot);
      if (!subplot) continue;
      const entries = group.members
        .filter((i) => fullData[i]?.visible === true && this.#traces[i]?.hasCalc === true)
        .map((i) => ({
          trace: fullData[i] as FullTrace,
          index: i,
          calc: (this.#traces[i] as TraceSlot).calc,
        }));
      if (entries.length === 0) continue;
      group.module.crossTraceCalc(entries, {
        fullLayout,
        subplot,
        xaxis: subplot.xaxis,
        yaxis: subplot.yaxis,
      });
      for (const e of entries) {
        const tp = plans[e.index] as TraceUpdatePlan;
        plans[e.index] = { ...tp, calc: true, plot: true, style: true };
      }
    }
  }

  #plotTrace(index: number, trace: FullTrace, tp: TraceUpdatePlan): void {
    const slot = this.#traces[index] as TraceSlot;
    const renderer = slot.module?.plot;
    if (!renderer || trace.visible !== true || !slot.hasCalc) {
      this.#disposeView(slot);
      return;
    }
    const x = trace['xaxis'];
    const y = trace['yaxis'];
    const cartesian = typeof x === 'string' && typeof y === 'string';
    const subplot = cartesian ? this.#subplots.get(x + y) : undefined;
    if (cartesian && !subplot) {
      this.#disposeView(slot);
      return;
    }
    const viewport = subplot?.viewport ?? (this.#requireRoot().overlay as Viewport);
    if (slot.view && slot.viewport !== viewport) this.#disposeView(slot);
    const ctx = this.#plotContext(index, trace, slot, subplot, viewport);
    if (!slot.view) {
      slot.viewport = viewport;
      slot.view = renderer.create(ctx);
    } else if (tp.calc || tp.plot || tp.style || tp.transform || tp.selection === true) {
      slot.view.update(ctx, tp);
    }
  }

  #plotContext(
    index: number,
    trace: FullTrace,
    slot: TraceSlot,
    subplot: SubplotSlot | undefined,
    viewport: Viewport,
  ): TracePlotContext {
    const root = this.#requireRoot();
    return {
      trace,
      calc: slot.calc,
      index,
      fullLayout: this.#full?.fullLayout as FullLayout,
      subplot,
      xaxis: subplot?.xaxis,
      yaxis: subplot?.yaxis,
      transform: subplot?.transform ?? IDENTITY_TRANSFORM,
      viewport,
      primitives: root.context,
      add: (primitive) => {
        viewport.add(primitive);
        slot.primitives.add(primitive as Primitive<unknown>);
        return primitive;
      },
      remove: (primitive) => {
        slot.primitives.delete(primitive as Primitive<unknown>);
        viewport.remove(primitive, { dispose: true });
      },
      invalidate: () => root.invalidate(),
      selectedPoints: this.#selectionOf(index),
    };
  }

  #disposeView(slot: TraceSlot): void {
    const view = slot.view;
    slot.view = undefined;
    try {
      view?.dispose?.();
    } finally {
      for (const p of slot.primitives) slot.viewport?.remove(p, { dispose: true });
      slot.primitives.clear();
      slot.viewport = undefined;
    }
  }

  #drawComponents(
    fullLayout: FullLayout,
    fullData: readonly FullTrace[],
    plan: { stages: ReadonlySet<Stage>; layout: boolean },
  ): void {
    const modules = this.#registry.components().filter((c) => c.draw !== undefined);
    for (const [name, slot] of this.#components) {
      if (!modules.includes(slot.module)) {
        this.#disposeComponent(slot);
        this.#components.delete(name);
      }
    }
    for (const module of modules) {
      let slot = this.#components.get(module.name);
      const created = !slot;
      slot ??= { module, view: undefined, primitives: new Map() };
      this.#components.set(module.name, slot);
      const ctx = this.#componentContext(fullLayout, fullData, slot);
      if (created) slot.view = module.draw?.create(ctx);
      else slot.view?.update(ctx, plan);
    }
    // Pointer dispatch order: topmost (last drawn) first.
    this.#componentOrder = [...this.#components.values()].reverse();
  }

  #componentContext(
    fullLayout: FullLayout,
    fullData: readonly FullTrace[],
    slot: ComponentSlot,
  ): ComponentDrawContext {
    const root = this.#requireRoot();
    const overlay = root.overlay as Viewport;
    return {
      fullLayout,
      fullData,
      width: this.#size.width,
      height: this.#size.height,
      plotArea: this.#plotArea,
      margin: this.#margins,
      axes: this.#axes,
      subplots: this.#subplots,
      overlay,
      primitives: root.context,
      add: (primitive, viewport = overlay) => {
        viewport.add(primitive);
        slot.primitives.set(primitive as Primitive<unknown>, viewport);
        return primitive;
      },
      remove: (primitive) => {
        const vp = slot.primitives.get(primitive as Primitive<unknown>);
        slot.primitives.delete(primitive as Primitive<unknown>);
        vp?.remove(primitive, { dispose: true });
      },
      invalidate: () => root.invalidate(),
      chart: this,
      ...(this.#full ? { fullConfig: this.#full.fullConfig } : {}),
    };
  }

  // ---- interaction plumbing (E6) ------------------------------------------------------------------

  #interactionHost(
    root: RenderRoot,
    layer: HoverLayer,
  ): ConstructorParameters<typeof Interaction>[0] {
    const scheduler: FrameScheduler = this.#options.renderRoot?.scheduler ?? browserFrameScheduler;
    return {
      target: root.canvas,
      layer,
      scheduler,
      events: this.#events,
      settings: () => this.interaction,
      size: () => this.#size,
      subplots: () => this.#subplotList,
      entries: (sp) => this.#entries(sp.id),
      fullLayout: () => this.#full?.fullLayout,
      traceCount: () => this.#full?.fullData.length ?? 0,
      isFixed: (axis) => this.#isFixed(axis),
      limits: (axis) => this.#limits(axis),
      dispatch: (event, only) => this.#dispatchPointer(event, only),
      preview: (ranges) => this.#previewRanges(ranges),
      commit: (ranges) => {
        this.#commitRanges(ranges).catch(() => undefined);
      },
      resetView: (action) => {
        this.#resetView(action).catch(() => undefined);
      },
      selection: (index) => this.#selectionOf(index),
      select: (selection) => this.#select(selection),
      clearSelection: () => this.#clearSelection(),
      renderHover: (points: readonly ChartPoint[]) => {
        const fn = isPlainObject(this.#figure.config)
          ? this.#figure.config['renderHover']
          : undefined;
        return typeof fn === 'function'
          ? (fn as (p: readonly ChartPoint[]) => HTMLElement | null | undefined)(points)
          : undefined;
      },
    };
  }

  /** Hoverable / selectable traces per subplot, rebuilt lazily after each pipeline run. */
  #entries(subplotId: string): readonly HoverEntry[] {
    if (!this.#hoverEntries) {
      const map = new Map<string, HoverEntry[]>();
      const full = this.#full;
      full?.fullData.forEach((trace, index) => {
        const slot = this.#traces[index];
        const module = slot?.module;
        if (!slot?.hasCalc || !module || trace.visible !== true) return;
        if (!module.hoverPoints && !module.selectPoints) return;
        const subplot = this.#subplots.get(`${String(trace['xaxis'])}${String(trace['yaxis'])}`);
        if (!subplot) return;
        const input = this.#figure.data[index];
        const list = map.get(subplot.id) ?? [];
        list.push({
          index,
          module,
          trace,
          input,
          calc: slot.calc,
          subplot,
          ctx: {
            fullLayout: full.fullLayout,
            xaxis: subplot.xaxis,
            yaxis: subplot.yaxis,
            transform: subplot.transform,
          },
          skip: traceAttr(trace, input, 'hoverinfo') === 'skip',
        });
        map.set(subplot.id, list);
      });
      this.#hoverEntries = map;
    }
    return this.#hoverEntries.get(subplotId) ?? EMPTY_ENTRIES;
  }

  #dispatchPointer(event: ComponentPointerEvent, only: unknown): unknown {
    for (const slot of this.#componentOrder) {
      const view = slot.view;
      if (!view?.handlePointer || (only !== undefined && view !== only)) continue;
      if (view.handlePointer(event) === true) return view;
    }
    return undefined;
  }

  /** `fixedrange`: no zoom or pan on this axis (drags, wheel, pinch, `chart.zoom`, reset). */
  #isFixed(axis: AxisInfo): boolean {
    return axis.full.fixedrange === true;
  }

  /** `minallowed` / `maxallowed` in linear coordinates. */
  #limits(axis: AxisInfo): readonly [number | undefined, number | undefined] {
    const toL = (v: unknown): number | undefined => {
      if (v === undefined || v === null) return undefined;
      const l = axis.scale.r2l(v);
      return Number.isFinite(l) ? l : undefined;
    };
    return [toL(axis.full.minallowed), toL(axis.full.maxallowed)];
  }

  /**
   * Show new axis ranges now, without a pipeline run (drag / wheel previews, plan E6.2): scales and
   * transforms change, traces get transform-only updates (uniforms), components redraw ticks. The
   * input layout is untouched until {@link #commitRanges}.
   */
  #previewRanges(ranges: ReadonlyMap<string, LinearRange>): void {
    const full = this.#full;
    const root = this.#root;
    if (!full || !root) return;
    for (const [id, [r0, r1]] of ranges) {
      const axis = this.#axes.get(id);
      if (!axis) continue;
      axis.scale.setRange(r0, r1);
      axis.full.range = [r0, r1];
    }
    for (const sp of this.#subplots.values()) {
      if (!ranges.has(sp.xaxis.id) && !ranges.has(sp.yaxis.id)) continue;
      sp.transform = dataTransform(sp.xaxis.scale, sp.yaxis.scale);
      full.fullData.forEach((trace, i) => {
        const slot = this.#traces[i];
        if (!slot?.view || slot.viewport !== sp.viewport) return;
        slot.view.update(this.#plotContext(i, trace, slot, sp, sp.viewport), TRANSFORM_ONLY);
      });
    }
    for (const slot of this.#components.values()) {
      slot.view?.update(this.#componentContext(full.fullLayout, full.fullData, slot), {
        stages: TICKS_ONLY,
        layout: true,
      });
    }
    this.#hoverEntries = null;
    root.invalidate();
  }

  /** Commit ranges as a GUI relayout; the `relayout` event carries Plotly's `range[i]` keys. */
  #commitRanges(ranges: ReadonlyMap<string, LinearRange>): Promise<Chart> {
    const update: Record<string, unknown> = {};
    const payload: Record<string, unknown> = {};
    for (const [id, [r0, r1]] of ranges) {
      const axis = this.#axes.get(id);
      if (!axis) continue;
      const a = axis.scale.l2r(r0);
      const b = axis.scale.l2r(r1);
      update[`${axis.name}.range`] = [a, b];
      payload[`${axis.name}.range[0]`] = a;
      payload[`${axis.name}.range[1]`] = b;
    }
    if (Object.keys(update).length === 0) return this.#schedule(() => undefined);
    return this.#schedule((plan) => {
      this.#recordLayoutGui(update);
      this.#relayoutInto(plan, update, payload);
    });
  }

  /** Remember each axis' first drawn state for double-click reset. */
  #captureInitialAxes(): void {
    for (const axis of this.#axes.values()) {
      if (this.#initialAxes.has(axis.name)) continue;
      this.#initialAxes.set(axis.name, {
        autorange: axis.full.autorange,
        range: getIn(this.#figure.layout, `${axis.name}.range`),
        inUse: [axis.scale.range[0], axis.scale.range[1]],
      });
    }
  }

  /** `config.doubleClick` actions (also the modebar's autoscale / reset axes). */
  #resetView(action: FxSettings['doubleClick']): Promise<Chart> {
    if (action === false) return this.#schedule(() => undefined);
    let mode: 'reset' | 'autosize' = action === 'autosize' ? 'autosize' : 'reset';
    if (action === 'reset+autosize') {
      // Already at the initial view: autosize instead (Plotly semantics).
      let atInitial = true;
      for (const axis of this.#axes.values()) {
        const init = this.#initialAxes.get(axis.name);
        const r = axis.scale.range;
        if (!init) continue;
        const tol = Math.abs(init.inUse[1] - init.inUse[0]) * 1e-6;
        if (Math.abs(r[0] - init.inUse[0]) > tol || Math.abs(r[1] - init.inUse[1]) > tol) {
          atInitial = false;
          break;
        }
      }
      mode = atInitial ? 'autosize' : 'reset';
    }
    const update: Record<string, unknown> = {};
    for (const axis of this.#axes.values()) {
      if (this.#isFixed(axis)) continue;
      const init = this.#initialAxes.get(axis.name);
      if (mode === 'reset' && init && init.autorange === false && Array.isArray(init.range)) {
        update[`${axis.name}.range`] = [...(init.range as unknown[])];
        update[`${axis.name}.autorange`] = false;
      } else {
        update[`${axis.name}.range`] = null;
        update[`${axis.name}.autorange`] =
          mode === 'reset' && init && init.autorange !== false ? init.autorange : true;
      }
    }
    return this.relayout(update, { gui: true });
  }

  // ---- selection (E6.3) ----------------------------------------------------------------------------

  /** A trace's selection: the interactive one, else its `selectedpoints` attribute. */
  #selectionOf(index: number): readonly number[] | null {
    const slot = this.#traces[index];
    if (slot && slot.selection !== undefined) return slot.selection;
    const trace = this.#full?.fullData[index];
    const v = trace ? traceAttr(trace, this.#figure.data[index], 'selectedpoints') : undefined;
    if (Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView))) {
      return Array.from(v as ArrayLike<number>, Number);
    }
    return null;
  }

  /** The input `selectedpoints` changed (restyle / react): it wins over the interactive selection. */
  #followInputSelection(plan: Plan, index: number): void {
    const slot = this.#traces[index];
    if (slot) slot.selection = undefined;
    plan.selection.add(index);
  }

  #select(selection: ReadonlyMap<number, readonly number[]>): void {
    this.#schedule((plan) => {
      for (const [index, list] of selection) {
        const slot = this.#traces[index];
        if (!slot) continue;
        slot.selection = list;
        plan.selection.add(index);
      }
    }).catch(() => undefined);
  }

  /** Clear every selection; returns whether anything was selected. */
  #clearSelection(): boolean {
    let had = false;
    const cleared: number[] = [];
    this.#traces.forEach((slot, i) => {
      if (!slot || this.#selectionOf(i) === null) return;
      had = true;
      slot.selection = null;
      cleared.push(i);
    });
    if (had) {
      this.#schedule((plan) => {
        for (const i of cleared) plan.selection.add(i);
      }).catch(() => undefined);
    }
    return had;
  }

  #disposeComponent(slot: ComponentSlot): void {
    const view = slot.view;
    slot.view = undefined;
    try {
      view?.dispose?.();
    } finally {
      for (const [p, vp] of slot.primitives) vp.remove(p, { dispose: true });
      slot.primitives.clear();
    }
  }
}

function destroyedError(): Error {
  return new Error('holochart: this chart has been destroyed');
}

/**
 * Create a chart in `el` (plan §7.2). A chart already in `el` is destroyed first. The chart draws
 * on the next microtask; `await chart.ready` (or any update call) to know when the frame is on
 * screen.
 *
 * @example
 * ```ts
 * const chart = createChart(el, { data: [{ x: [1, 2, 3], y: [4, 1, 7], mode: 'markers' }] });
 * await chart.restyle({ 'marker.color': 'crimson' });
 * ```
 */
export function createChart(
  el: HTMLElement,
  figure: FigureInput = {},
  options: ChartOptions = {},
): Chart {
  return new Chart(el, figure, options);
}
