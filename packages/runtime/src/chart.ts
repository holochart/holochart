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
 *   range relayout is `transform` only (uniforms, no uploads);
 * - `extendTraces` / `prependTraces` (E7.2) skip validation and, for modules with `calcAppend`,
 *   convert only the new points; `extremesAppend` updates the autorange incrementally, and the
 *   views get the change as `TraceUpdatePlan.append` so they upload only the new points.
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
  type EncodedFigure,
  applyUirevision,
  axisTypeChangeEdits,
  coerceContainer,
  collectCategoryValues,
  configSchema,
  createBreakMap,
  createScale,
  enforceConstraints,
  createUiState,
  deepMerge,
  diffFigures,
  getIn,
  isPlainObject,
  recordGuiEdit,
  sortCategoriesByValue,
  supplyDefaults,
  toRGBA,
  valueCategoryOrder,
  type AxisExtremes,
  type AxisType,
  type CategorySamples,
  type ConstraintAxisState,
  type ConstraintGroup,
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
  reportedRange,
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
  DomainInfo,
  DomainTraceEntry,
  MarginPush,
  SelectionQuery,
  SubplotInfo,
  TraceExtremes,
  TraceAppend,
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
import type { DomainHover, HoverEntry } from './fx/hover.ts';
import { buildPoint } from './fx/hover.ts';
import { selectionFromQuery, selectionQuery, selectionsOf } from './fx/selections.ts';
import { SubplotMirrors } from './mirror.ts';
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
  domainRect,
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
  assertStreamArgs,
  distributeRestyle,
  flattenPatch,
  inputTraceType,
  needsLayout,
  planLayoutEdit,
  planTraceEdit,
  maxPointsFor,
  spliceArray,
  tracePlan,
  withRangeImplications,
  type AttributeUpdate,
  type MaxPoints,
  type StreamUpdate,
} from './plan.ts';
import { chartToJSON, type ChartToJSONOptions } from './json.ts';
import { describeChart, type ChartDescription } from './a11y/describe.ts';
import { A11yMirror, type A11yChange } from './a11y/mirror.ts';
import type { DownloadImageOptions, ExportSource, ToImageOptions } from './export/types.ts';
import type { Animation } from './anim/animation.ts';
import type { AnimateTarget, AnimationHost, AnimationOptions, Frame } from './anim/types.ts';
import { registry as defaultRegistry, type ChartRegistry } from './registry.ts';
import {
  axisDataOf,
  cellsRescaled,
  entrySubplots,
  extremesOn,
  isMultiSubplot,
  placedViewport,
  placePrimitive,
  traceCells,
} from './multi-subplot.ts';

/** Options for {@link createChart} that are not part of the figure. */
export interface ChartOptions {
  /** Registry to resolve trace types and components from. Default: the shared `registry`. */
  registry?: ChartRegistry;
  /**
   * Low-level render-root options (tests inject a fake renderer and frame scheduler here). A
   * `pixelRatio` here wins over `config.pixelRatio` (image export renders at its `scale`).
   */
  renderRoot?: Pick<
    RenderRootOptions,
    'createRenderer' | 'scheduler' | 'preserveDrawingBuffer' | 'pixelRatio'
  >;
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

/** What a pipeline run does (internal; the animation code plans its runs with it). */
export interface Plan {
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
  /** Streaming edits per trace (current indices), see {@link PendingAppend}. */
  appends: Map<number, PendingAppend>;
  /** Events to emit after the frame. */
  after: (() => void)[];
  /** Layout edits were axis ranges / autorange only (the a11y mirror debounces those). */
  layoutRanges: boolean;
  /**
   * Axis ids whose `range` an edit set (not reset): their scale wins when a `scaleanchor`
   * constraint is enforced, and the other axes of the group adapt (Plotly's
   * `_constraintShrinkable`, E3.9).
   */
  rangesAltered: Set<string>;
  /** Layout edits other than ranges and interaction modes. */
  layoutOther: boolean;
  /** Interaction-mode layout edits (`dragmode`, `hovermode`, …). */
  layoutQuiet: boolean;
  /** `layout.selections` changed (E5.12): select the points inside them again. */
  selections: boolean;
  /** A GUI edit moved or resized an existing selection (`selected` follows the reselection). */
  selectionsEdited: boolean;
  /** Traces whose input `selectedpoints` changed: they keep it over layout selections. */
  inputSelection: Set<number>;
  /**
   * An in-between frame of a transition (E7.3): no validation, no `afterplot`, and the a11y
   * mirror throttles like streaming.
   */
  tween: boolean;
}

/**
 * `extendTraces` / `prependTraces` calls batched on one trace (E7.2). The data arrays are already
 * edited; this says how, so the pipeline can take the streaming path. Anything it cannot describe
 * (mixed extend and prepend, keys trimmed differently, a structural change in the same batch)
 * makes it `valid: false`: the trace is then recalculated in full.
 */
interface PendingAppend {
  at: 'end' | 'start';
  /** Items trimmed from the front (extend) or inserted at the front (prepend), summed over calls. */
  front: number;
  keys: Set<string>;
  /** `_length` of the trace before the batch. */
  previous: number | undefined;
  valid: boolean;
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
  /** The selection comes from `layout.selections` (E5.12): cleared when they go away. */
  layoutSelected?: boolean;
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
  /** Value-based `categoryorder` only: categories in trace order, the tie order of the sort. */
  traceOrder: readonly string[] | undefined;
  /** The defaulted `domain`, before a `constrain: 'domain'` constraint shrank it (E3.9). */
  inputDomain: readonly [number, number] = [0, 1];
  /** The domain in use (the input one, or shrunk by a constraint). */
  domain: readonly [number, number] = [0, 1];
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
    appends: new Map(),
    after: [],
    layoutRanges: false,
    rangesAltered: new Set(),
    layoutOther: false,
    layoutQuiet: false,
    selections: false,
    selectionsEdited: false,
    inputSelection: new Set(),
    tween: false,
  };
}

/** Layout paths that are axis ranges (debounced in the a11y mirror) or change nothing it says. */
const RANGE_PATH = /^[xy]axis\d*\.(?:range(?:\[[01]\])?|autorange)$/;
const QUIET_PATH = /^(?:dragmode|hovermode|selectdirection|clickmode)$/;

const RANGE_SET_PATH = /^([xy])axis(\d*)\.range(?:\[[01]\])?$/;
/** Paths of `layout.selections` (E5.12) and of one selection's geometry. */
const SELECTIONS_PATH = /^selections(?:$|[.[])/;
const SELECTION_EDIT_PATH = /^selections\[\d+\]\./;

/** Record what kind of layout edit `paths` are, for {@link a11yChangeOf}. */
function classifyLayoutPaths(
  plan: Plan,
  paths: readonly string[],
  values?: Readonly<Record<string, unknown>>,
): void {
  for (const path of paths) {
    const set = RANGE_SET_PATH.exec(path);
    if (set && (values === undefined || values[path] !== null)) {
      plan.rangesAltered.add(`${set[1]}${set[2] === '1' ? '' : (set[2] ?? '')}`);
    }
    if (RANGE_PATH.test(path)) plan.layoutRanges = true;
    else if (QUIET_PATH.test(path)) plan.layoutQuiet = true;
    else if (SELECTIONS_PATH.test(path)) {
      // Selections (E5.12) change what is selected, not what the description says.
      plan.selections = true;
      plan.layoutQuiet = true;
    } else plan.layoutOther = true;
  }
}

/**
 * How a pipeline run changed what the accessible description says (E17.1): data, traces or
 * layout rebuild it now, ranges and resizes debounce, streaming throttles, selection and
 * interaction modes don't touch it.
 */
function a11yChangeOf(plan: Plan): A11yChange {
  if (plan.full || plan.remount || plan.structural || plan.validate) return 'content';
  if (plan.tween) return 'stream';
  if (plan.traces.size > 0 || plan.layoutOther) return 'content';
  // Layout stages with no recorded paths (web fonts loaded): re-describe, it's rare.
  if (plan.layout.size > 0 && !plan.layoutRanges && !plan.layoutQuiet) return 'content';
  if (plan.appends.size > 0) return 'stream';
  if (plan.layoutRanges || plan.resize) return 'range';
  return 'none';
}

/** Hosts of offscreen export charts (no a11y mirror): see {@link Chart.toImage}. */
const OFFSCREEN = new WeakSet<HTMLElement>();

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

/**
 * The point-level change of a batched streaming edit, from the trace's point count before and
 * after (`_length`), or `undefined` when the counts don't fit a pure append / prepend.
 */
function traceAppend(pending: PendingAppend, trace: FullTrace): TraceAppend | undefined {
  const length = trace['_length'];
  const previous = pending.previous;
  if (typeof length !== 'number' || previous === undefined) return undefined;
  if (pending.at === 'end') {
    const trimmed = Math.min(previous, pending.front);
    const count = length - (previous - trimmed);
    if (count < 0 || previous - trimmed > length) return undefined;
    return {
      at: 'end',
      start: length - count,
      count,
      trimmed,
      previous,
      length,
      keys: [...pending.keys],
    };
  }
  const count = pending.front;
  const trimmed = previous + count - length;
  if (trimmed < 0 || trimmed > previous || count > length) return undefined;
  return { at: 'start', start: 0, count, trimmed, previous, length, keys: [...pending.keys] };
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
  #domainHover: DomainHover | null = null;
  #componentOrder: ComponentSlot[] = [];
  /** `#subplots` as an array, for per-frame pointer work (no iterator allocations). */
  #subplotList: SubplotSlot[] = [];
  #initialAxes = new Map<string, InitialAxis>();
  /** Axis ids whose range the running update set (see `Plan.rangesAltered`). */
  #altered: ReadonlySet<string> = new Set();
  #scheduled = false;
  #destroyed = false;
  #unsubscribeFonts: (() => void) | undefined;
  #a11y: A11yMirror | undefined;
  /** Frames and transitions (E7.3, E7.4): their code loads on first use. */
  #animation: Promise<Animation> | undefined;
  /** The animation frame shown last (Plotly's `fullLayout._currentFrame`). */
  #currentFrame: string | null = null;
  #onRemap: ((order: readonly (number | undefined)[]) => void) | undefined;
  /** Secondary views of subplots' traces (E5.9 range slider thumbnails), see `mirror.ts`. */
  readonly #mirrors: SubplotMirrors = new SubplotMirrors({
    root: () => this.#requireRoot(),
    subplot: (id) => this.#subplots.get(id),
    fullLayout: () => this.#full?.fullLayout,
    fullData: () => this.#full?.fullData ?? [],
    trace: (i) => {
      const slot = this.#traces[i];
      return slot?.hasCalc ? { module: slot.module, calc: slot.calc } : undefined;
    },
    selection: (i) => this.#selectionOf(i),
    plotArea: () => this.#plotArea,
  });

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

  /** Animation frames as given (after updates). Treat as read-only. */
  get frames(): unknown {
    return this.#figure.frames;
  }

  /** Named datasets as given (after updates). Treat as read-only. */
  get datasets(): FigureInput['datasets'] {
    return this.#figure.datasets;
  }

  /**
   * The current figure (`data`, `layout`, `config`, `frames`, `datasets`) as JSON-safe data
   * (E18.3): typed arrays become Plotly's `{ dtype, bdata, shape }`, per-point style functions are
   * evaluated, other functions dropped with a warning. `JSON.stringify(chart)` calls this too.
   */
  toJSON(options?: ChartToJSONOptions | string): EncodedFigure {
    // JSON.stringify passes the property key as the argument.
    const opts = typeof options === 'object' ? options : {};
    return chartToJSON(this, { registry: this.#registry, ...opts });
  }

  // ---- export (E18.1) --------------------------------------------------------------------------

  /**
   * Render the chart to an image (Plotly's `toImage`): resolves to a data URL (`data:image/png;
   * base64,…`). The figure is laid out again at `width` × `height` (default: the chart's size) and
   * drawn offscreen at `scale` pixels per CSS px — not a screenshot of the canvas, and the live
   * chart is untouched. Includes everything drawn in WebGL (traces, axes, text, legend,
   * annotations, shapes, images) and the current interactive selection; excludes the modebar,
   * hover labels and selection outlines. `transparent: true` drops the background. The export
   * code loads on first use.
   *
   * @example
   * ```ts
   * const png = await chart.toImage({ width: 1200, height: 600, scale: 2 });
   * ```
   */
  toImage(options: ToImageOptions = {}): Promise<string> {
    if (this.#destroyed) return Promise.reject(destroyedError());
    const source = this.#exportSource();
    return import('./export/image.ts').then((m) => m.renderImage(source, options));
  }

  /**
   * {@link toImage} and save the result as `<filename>.<format>` (default `newplot.png`) through a
   * download link (Plotly's `downloadImage`). Resolves to the file name.
   */
  downloadImage(options: DownloadImageOptions = {}): Promise<string> {
    if (this.#destroyed) return Promise.reject(destroyedError());
    const source = this.#exportSource();
    return import('./export/image.ts').then((m) => m.downloadImage(source, options));
  }

  /** The current figure, size and renderer setup, for an offscreen export chart. */
  #exportSource(): ExportSource {
    const figure = this.#figure;
    // The interactive selection (E6.3) lives in the trace slots: hand it over as `selectedpoints`.
    const data = figure.data.map((trace, i) => {
      const selection = this.#traces[i]?.selection;
      if (selection === undefined || !isPlainObject(trace)) return trace;
      return { ...trace, selectedpoints: selection === null ? null : [...selection] };
    });
    return figureExportSource(
      {
        data,
        layout: figure.layout,
        ...(figure.config === undefined ? {} : { config: figure.config }),
        ...(figure.frames === undefined ? {} : { frames: figure.frames }),
        ...(figure.datasets === undefined ? {} : { datasets: figure.datasets }),
      } as FigureInput,
      this.element.ownerDocument,
      { ...this.#options, registry: this.#registry },
      this.#size,
    );
  }

  // ---- accessibility (E17.1) ----------------------------------------------------------------------

  /**
   * What assistive technology is told about the chart (as of the last pipeline run): the
   * accessible name, chart type summary, axes, trace summaries and data tables the hidden DOM
   * mirror shows. `undefined` before the first draw.
   */
  get description(): ChartDescription | undefined {
    return this.#describe();
  }

  #describe(): ChartDescription | undefined {
    const full = this.#full;
    if (!full) return undefined;
    return describeChart({
      fullLayout: full.fullLayout,
      fullData: full.fullData,
      fullConfig: full.fullConfig,
      axes: this.#axes,
      module: (i) => this.#traces[i]?.module,
      calc: (i) => {
        const slot = this.#traces[i];
        return slot?.hasCalc ? { value: slot.calc } : undefined;
      },
    });
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

  /** Clear every selection, `layout.selections` included (emits `deselect` when there was one). */
  clearSelection(): Promise<Chart> {
    const had = this.#clearSelection();
    if (had) this.#events.emit('deselect', undefined);
    return this.#schedule(() => undefined);
  }

  /**
   * Show axis ranges now without committing them (M3 wave 2, E5.9: interactive components such
   * as the range slider preview a drag this way): linear coordinates keyed by axis id
   * (`{ x: [l0, l1] }`). Like a zoom drag, traces only get new transforms, components redraw
   * their ticks, linked axes (`matches`, `scaleanchor`) follow, and `relayouting` is emitted; the
   * input layout is untouched. Finish with {@link commitRanges}, or undo by previewing the ranges
   * shown before.
   */
  previewRanges(ranges: Readonly<Record<string, readonly [number, number]>>): void {
    if (this.#destroyed || !this.#full) return;
    const map = new Map<string, LinearRange>();
    const edits: Record<string, unknown> = {};
    for (const [id, r] of Object.entries(ranges)) {
      const axis = this.#axes.get(id);
      if (!axis || !Number.isFinite(r[0]) || !Number.isFinite(r[1])) continue;
      map.set(id, [r[0], r[1]]);
      edits[`${axis.name}.range[0]`] = axis.scale.l2r(r[0]);
      edits[`${axis.name}.range[1]`] = axis.scale.l2r(r[1]);
    }
    if (map.size === 0) return;
    this.#previewRanges(map);
    this.#events.emit('relayouting', edits);
  }

  /**
   * Set axis ranges as a user interaction (M3 wave 2, E5.9): linear coordinates keyed by axis
   * id, committed with one GUI `relayout` (kept across `uirevision`) whose event carries Plotly's
   * `'xaxis.range[0]'` / `'xaxis.range[1]'` keys, like the end of a zoom drag.
   */
  commitRanges(ranges: Readonly<Record<string, readonly [number, number]>>): Promise<Chart> {
    const map = new Map<string, LinearRange>();
    for (const [id, r] of Object.entries(ranges)) {
      if (this.#axes.has(id) && Number.isFinite(r[0]) && Number.isFinite(r[1])) {
        map.set(id, [r[0], r[1]]);
      }
    }
    return this.#commitRanges(map);
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
      if (options.gui && Object.keys(update).some((k) => SELECTION_EDIT_PATH.test(k))) {
        plan.selectionsEdited = true;
      }
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
    // `layout.transition` animates the change (E7.3, Plotly's `transitionFromReact`).
    if (isPlainObject(figure.layout) && isPlainObject(figure.layout['transition'])) {
      return this.#animate((a) => a.react(figure));
    }
    const apply = this.#reactPlan(figure);
    return apply ? this.#schedule(apply) : Promise.resolve(this);
  }

  /** The update `react(figure)` makes, or `undefined` when nothing changed. */
  #reactPlan(figure: FigureInput): ((plan: Plan) => void) | undefined {
    // Double-click "reset" returns to the ranges of the latest figure the app gave.
    this.#initialAxes.clear();
    const current = this.#figure;
    const next = normalizeFigure(figure);
    const effective = normalizeFigure(applyUirevision(current, next, this.#ui));
    // Like Plotly, frames stay unless the figure brings its own.
    effective.frames ??= current.frames;
    const diff = diffFigures(current, effective, this.#registry.core);
    if (diff.empty && !this.#plan) {
      this.#figure = effective;
      return undefined;
    }
    return (plan) => {
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
      classifyLayoutPaths(plan, layoutPaths, rangeValues(effective.layout, layoutPaths));
      for (const s of planLayoutEdit(layoutPaths, this.#registry.core)) plan.layout.add(s);
      for (const [i, { type, paths }] of byTrace) {
        addStages(plan, i, planTraceEdit(paths, type, i, this.#registry.core, this.#fullFor(plan)));
      }
    };
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

  /**
   * Append points to traces (Plotly `extendTraces`, plan E7.2): `update` gives, per attribute
   * string, one array of new values per listed trace — `extendTraces({ x: [[4, 5]], y: [[1, 2]] },
   * [0])`. `maxPoints` keeps only the last points (a rolling window): a number for everything, an
   * object with one number per trace per key (`{ y: [1000] }`), or `{ maxPoints: 1000 }`.
   *
   * Arrays are not mutated: plain arrays are replaced by new ones, typed arrays by views into a
   * buffer that grows in place (see `spliceArray`). Streaming-aware traces (scatter) convert and
   * upload only the new points and update the autorange incrementally. Resolves after render; a
   * `redraw` event follows (Plotly's `plotly_redraw`).
   *
   * @throws (rejects) With Plotly's messages for malformed arguments, or when a key names a
   * missing or non-array attribute; nothing is changed then.
   */
  extendTraces(update: StreamUpdate, indices: TraceIndices, maxPoints?: MaxPoints): Promise<Chart> {
    return this.#spliceTraces('end', update, indices, maxPoints);
  }

  /** Insert points at the start of traces (Plotly `prependTraces`); see {@link extendTraces}. */
  prependTraces(
    update: StreamUpdate,
    indices: TraceIndices,
    maxPoints?: MaxPoints,
  ): Promise<Chart> {
    return this.#spliceTraces('start', update, indices, maxPoints);
  }

  #spliceTraces(
    at: 'end' | 'start',
    update: StreamUpdate,
    indices: TraceIndices,
    maxPoints: MaxPoints | undefined,
  ): Promise<Chart> {
    return this.#schedule((plan) => {
      const list = assertStreamArgs(update, indices, maxPoints, this.#figure.data.length);
      // Compute every new array first: an error leaves the figure untouched.
      const edits = list.map(() => ({}) as Record<string, unknown>);
      const fronts = list.map(() => new Set<number>());
      for (const [key, inserts] of Object.entries(update)) {
        list.forEach((index, k) => {
          const target = getIn(this.#figure.data[index], key);
          if (!Array.isArray(target) && !ArrayBuffer.isView(target)) {
            throw new Error(`cannot extend missing or non-array attribute: ${key}`);
          }
          const insert = inserts[k] as ArrayLike<unknown>;
          const result = spliceArray(
            target as ArrayLike<unknown>,
            insert,
            maxPointsFor(maxPoints, key, k),
            at,
          );
          (edits[k] as Record<string, unknown>)[key] = result.value;
          // How far retained items move: trimmed from the front, or inserted before them.
          (fronts[k] as Set<number>).add(at === 'end' ? result.removed : insert.length);
        });
      }
      list.forEach((index, k) => {
        const trace = edits[k] as Record<string, unknown>;
        if (Object.keys(trace).length === 0) return;
        this.#figure.data[index] = applyEdits(this.#figure.data[index], trace);
        const front = fronts[k] as Set<number>;
        const keys = Object.keys(trace);
        const record = plan.appends.get(index);
        if (!record) {
          const full = plan.structural || plan.full ? undefined : this.#full?.fullData[index];
          const previous = full?.['_length'];
          plan.appends.set(index, {
            at,
            front: front.size === 1 ? [...front][0]! : 0,
            keys: new Set(keys),
            previous: typeof previous === 'number' ? previous : undefined,
            valid: front.size === 1 && typeof previous === 'number',
          });
        } else {
          record.valid &&= record.at === at && front.size === 1;
          record.front += front.size === 1 ? [...front][0]! : 0;
          for (const key of keys) record.keys.add(key);
        }
      });
      plan.after.push(() =>
        this.#events.emit('redraw', {
          kind: at === 'end' ? 'extend' : 'prepend',
          update,
          traces: list,
          maxPoints,
        }),
      );
    });
  }

  // ---- frames & animation (E7.3, E7.4) ------------------------------------------------------------

  /**
   * Add animation frames (Plotly `addFrames`): a frame whose name is taken replaces that frame;
   * others are inserted at `indices[i]` (default: appended). Unnamed frames are named
   * `'frame <n>'`. See {@link animate}.
   */
  addFrames(
    frames: readonly Frame[] | null | undefined,
    indices?: number | readonly (number | null | undefined)[],
  ): Promise<Chart> {
    return this.#animate((a) => {
      a.addFrames(frames, indices);
      return this;
    });
  }

  /** Remove frames by index (Plotly `deleteFrames`); every frame when `indices` is omitted. */
  deleteFrames(indices?: number | readonly number[] | null): Promise<Chart> {
    return this.#animate((a) => {
      a.deleteFrames(indices);
      return this;
    });
  }

  /**
   * Play frames (Plotly `animate`): every frame, a frame **group** by name, frame names in a list
   * (`['2007']`), or frame objects; each frame transitions in over `transition.duration` and the
   * next starts `frame.duration` later. Resolves once the last frame has played; rejects when a
   * later call (`mode: 'next'` / `'immediate'`) drops it. Emits `animating`, `animatingframe`
   * (sliders follow it), `transitioning` / `transitioned` and `animated`. The animation code loads
   * on first use.
   *
   * @example
   * ```ts
   * await chart.animate(null, { frame: { duration: 500 }, transition: { duration: 300 } });
   * await chart.animate([null], { mode: 'immediate' }); // pause
   * ```
   */
  animate(target?: AnimateTarget, options?: AnimationOptions): Promise<Chart> {
    return this.#animate((a) => a.animate(target, options));
  }

  /** Run `fn` with this chart's animation state, loading the animation code the first time. */
  #animate<T>(fn: (animation: Animation) => T | Promise<T>): Promise<T> {
    if (this.#destroyed) return Promise.reject(destroyedError());
    this.#animation ??= import('./anim/animation.ts').then((m) => {
      const host: AnimationHost = {
        chart: this,
        core: this.#registry.core,
        scheduler: this.#options.renderRoot?.scheduler ?? browserFrameScheduler,
        figure: () => this.#figure,
        full: () => this.#full,
        axes: () => this.#axes,
        run: (mutate) => this.#schedule(mutate),
        patch: (plan, traces, layout) => {
          for (const [i, edits] of traces) this.#editTraceInto(plan, i, edits);
          this.#relayoutInto(plan, layout, null);
        },
        react: (figure) => this.#reactPlan(figure),
        current: (name) => {
          this.#currentFrame = name;
        },
        remapped: (listener) => {
          this.#onRemap = listener;
        },
      };
      return m.createAnimation(host);
    });
    return this.#animation.then(fn);
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

  /** `payload`: the `relayout` event's (default: the edits); `null`: no event. */
  #relayoutInto(plan: Plan, update: AttributeUpdate, payload?: AttributeUpdate | null): void {
    const edits = withMatchedAxes(
      withRangeImplications(
        axisTypeChangeEdits(update, this.#figure.layout, this.#full?.fullLayout),
        this.#figure.layout,
        this.#full?.fullLayout,
      ),
      this.#full?.fullLayout,
    );
    const paths = Object.keys(edits).filter((p) => edits[p] !== undefined);
    if (paths.length === 0) return;
    this.#figure.layout = applyEdits(this.#figure.layout, edits);
    classifyLayoutPaths(plan, paths, edits);
    for (const s of planLayoutEdit(paths, this.#registry.core)) plan.layout.add(s);
    if (payload !== null) plan.after.push(() => this.#events.emit('relayout', payload ?? edits));
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
    const appends = new Map<number, PendingAppend>();
    order.forEach((from, to) => {
      const s = from === undefined ? undefined : plan.traces.get(from);
      if (s) stages.set(to, s);
      const a = from === undefined ? undefined : plan.appends.get(from);
      // Still a data change (full recalc), no longer a streaming one.
      if (a) appends.set(to, { ...a, valid: false });
    });
    plan.traces = stages;
    plan.appends = appends;
    order.forEach((from, to) => {
      if (from !== to) addStages(plan, to, ['plot', 'style']);
    });
    plan.structural = true;
    plan.layout.add('layout');
    this.#onRemap?.(order);
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
      this.#a11y?.invalidate(a11yChangeOf(plan));
    } catch (error) {
      // The description must never break drawing.
      console.warn('holochart: updating the accessible description failed', error);
    }
    try {
      for (const emit of plan.after) emit();
      if (!plan.tween) this.#events.emit('afterplot', undefined);
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
    for (const p of this.#mirrors.primitives()) collect(p);
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
    const offscreen = OFFSCREEN.has(this.element);
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
    // The canvas has no accessible content of its own: the a11y mirror describes it.
    root.canvas.setAttribute('aria-hidden', 'true');
    if (!offscreen) {
      this.#a11y = new A11yMirror(this.element, {
        interactive: config.staticPlot !== true,
        describe: () => this.#describe(),
      });
    }
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
    this.#a11y?.destroy();
    this.#a11y = undefined;
    this.#fx?.destroy();
    this.#fx = undefined;
    this.#layer?.destroy();
    this.#layer = undefined;
    this.#hoverEntries = null;
    this.#domainHover = null;
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
    this.#mirrors.clear();
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
    this.#altered = plan.rangesAltered;
    const validate =
      plan.full ||
      plan.validate ||
      (!plan.tween &&
        (plan.layout.has('calc') || [...plan.traces.values()].some((s) => s.has('calc'))));
    const full = supplyDefaults(this.#figure, registry.core, { validate });
    this.#full = full;
    const { fullData, fullLayout, fullConfig } = full;
    // Kept across runs like Plotly (update menus and sliders follow it, E5.11).
    if (this.#currentFrame !== null) fullLayout['_currentFrame'] = this.#currentFrame;

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
      plan.appends.size > 0 ||
      [...plan.traces.values()].some(needsLayout);

    const rescaled = layoutRan ? this.#syncAxes(fullLayout, fullData) : new Set<string>();
    if (!layoutRan) this.#refreshAxes(fullLayout);

    // Margins, axis spans and subplot viewports first: `crossTraceCalc` gets its subplot.
    if (layoutRan) this.#layoutSubplots(fullLayout, fullData, size);

    // Calc (streaming edits convert only their new points when the module can, E7.2).
    const previousCalcs: unknown[] = [];
    const plans: TraceUpdatePlan[] = fullData.map((trace, i) => {
      const slot = this.#traces[i] as TraceSlot;
      const onRescaled =
        rescaled.has(trace['xaxis'] as string) ||
        rescaled.has(trace['yaxis'] as string) ||
        cellsRescaled(slot.module, trace, rescaled);
      const stages = plan.traces.get(i) ?? EMPTY_STAGES;
      const pending = plan.appends.get(i);
      const tp = tracePlan(stages, plan.layout, {
        forceCalc: (fresh[i] as boolean) || onRescaled || pending !== undefined,
        layoutRan,
      });
      if (trace.visible === false) {
        slot.hasCalc = false;
        slot.calc = undefined;
        slot.extremes = undefined;
        return tp;
      }
      if (tp.calc) {
        const ctx = this.#calcContext(trace, i);
        const streamable =
          pending?.valid === true &&
          slot.hasCalc &&
          !fresh[i] &&
          !onRescaled &&
          !stages.has('calc') &&
          !plan.layout.has('calc');
        const append = streamable ? traceAppend(pending, trace) : undefined;
        const next =
          append && slot.module?.calcAppend
            ? slot.module.calcAppend(slot.calc, trace, ctx, append)
            : undefined;
        if (next !== undefined) {
          previousCalcs[i] = slot.calc;
          slot.calc = next;
          slot.hasCalc = true;
          return { ...tp, append: append as TraceAppend };
        }
        slot.calc = slot.module?.calc ? slot.module.calc(trace, ctx) : undefined;
        slot.hasCalc = true;
      }
      return tp;
    });

    // Cross-trace calc (stacking, grouping) per subplot and trace type, then extremes.
    this.#crossTraceCalc(fullLayout, fullData, plan, plans);

    // Value-based category orders (E3.6) sort by what calc produced; if an order changed, calc
    // again on the new scale, like Plotly's second calc pass. Streaming edits fall back to a full
    // calc then: every retained point moves.
    const resorted = this.#sortCategoriesByValue(fullData, plans, rescaled);
    if (resorted.size > 0) {
      const again = new Set<number>();
      fullData.forEach((trace, i) => {
        if (trace.visible === false) return;
        if (!resorted.has(trace['xaxis'] as string) && !resorted.has(trace['yaxis'] as string)) {
          return;
        }
        const slot = this.#traces[i] as TraceSlot;
        slot.calc = slot.module?.calc
          ? slot.module.calc(trace, this.#calcContext(trace, i))
          : undefined;
        slot.hasCalc = true;
        previousCalcs[i] = undefined;
        const { append: _, ...tp } = plans[i] as TraceUpdatePlan;
        plans[i] = { ...tp, calc: true, plot: true, style: true };
        again.add(i);
      });
      this.#crossTraceCalc(fullLayout, fullData, plan, plans, again);
    }
    fullData.forEach((trace, i) => {
      const slot = this.#traces[i] as TraceSlot;
      const tp = plans[i] as TraceUpdatePlan;
      if (trace.visible !== true) slot.extremes = undefined;
      else if (tp.plot && slot.module?.extremes) {
        const ctx = this.#calcContext(trace, i);
        const previous = slot.extremes;
        const merged =
          tp.append && previous && slot.module.extremesAppend
            ? slot.module.extremesAppend(
                previous,
                slot.calc,
                previousCalcs[i],
                trace,
                ctx,
                tp.append,
              )
            : undefined;
        slot.extremes = merged ?? slot.module.extremes(slot.calc, trace, ctx);
      }
    });

    if (layoutRan) {
      this.#autorange(fullData);
      this.#automargin(fullLayout, fullData, size);
    }
    // Domain traces (pie) resolve what spans traces and needs the final layout (E4.5).
    this.#crossTraceLayout(fullLayout, fullData, plans, layoutRan, size);

    // Backgrounds are cheap to set: do it on every run (`paper_bgcolor` is a style edit).
    root.setBackground(toRGBA(fullLayout.paper_bgcolor) ?? null);
    const plotBg = toRGBA(fullLayout.plot_bgcolor) ?? null;
    for (const sp of this.#subplots.values()) {
      // A subplot on an `overlaying` axis shares its area with the one it overlays: painting its
      // background would hide that subplot's traces (Plotly draws no background there either).
      sp.viewport.background = overlays(sp) ? null : plotBg;
    }

    this.#reselect(plan, fullLayout, fullData);
    this.#syncSelectedpoints(fullData);
    for (const i of plan.selection) {
      const tp = plans[i];
      if (tp) plans[i] = { ...tp, selection: true };
    }
    fullData.forEach((trace, i) => this.#plotTrace(i, trace, plans[i] as TraceUpdatePlan));
    if (this.#mirrors.size > 0) this.#mirrors.sync(plans, plan.structural);

    const stages = new Set(plan.layout);
    for (const s of plan.traces.values()) for (const stage of s) stages.add(stage);
    this.#drawComponents(fullLayout, fullData, { stages, layout: layoutRan });
    root.invalidate();

    if (layoutRan) this.#captureInitialAxes();
    this.#hoverEntries = null;
    this.#domainHover = null;
    this.#fx?.refresh();
  }

  /** A trace's calc for components, or `undefined` when it has none (hidden, not calculated yet). */
  #calcdataOf(index: number): unknown {
    const slot = this.#traces[index];
    return slot?.hasCalc ? slot.calc : undefined;
  }

  #calcContext(trace: FullTrace, index: number): CalcContext {
    return {
      fullLayout: this.#full?.fullLayout as FullLayout,
      index,
      xaxis: this.#axes.get(trace['xaxis'] as string),
      yaxis: this.#axes.get(trace['yaxis'] as string),
      axes: this.#axes,
    };
  }

  /**
   * Sort the category axes with a value-based `categoryorder` (E3.6, Plotly's
   * `sortAxisCategoriesByValue`): collect every visible trace's samples (`categoryValues`) on the
   * axis, aggregate them per category and sort the trace-order list by the aggregate. Axes where
   * nothing on them was recalculated are skipped. Returns the ids of axes whose order (and so
   * scale) changed; their traces must calc again.
   */
  #sortCategoriesByValue(
    fullData: readonly FullTrace[],
    plans: readonly TraceUpdatePlan[],
    rescaled: ReadonlySet<string>,
  ): Set<string> {
    const changed = new Set<string>();
    for (const axis of this.#axes.values()) {
      const current = axis.state.categories;
      const order = axis.full.categoryorder as string | undefined;
      if (axis.type !== 'category' || !current || !axis.traceOrder || !valueCategoryOrder(order)) {
        continue;
      }
      const key = `${axis.letter}axis`;
      const members: number[] = [];
      fullData.forEach((trace, i) => {
        if (trace[key] === axis.id) members.push(i);
      });
      if (!rescaled.has(axis.id) && !members.some((i) => plans[i]?.calc === true)) continue;
      const samples: CategorySamples[] = [];
      for (const i of members) {
        const trace = fullData[i] as FullTrace;
        const slot = this.#traces[i];
        // Like Plotly, only visible traces count (`legendonly` ones don't).
        if (trace.visible !== true || !slot?.hasCalc || !slot.module?.categoryValues) continue;
        const s = slot.module.categoryValues(
          slot.calc,
          trace,
          axis.letter,
          this.#calcContext(trace, i),
        );
        if (s) samples.push(s);
      }
      const values = collectCategoryValues(current, samples);
      const sorted = sortCategoriesByValue(axis.traceOrder, order as string, values);
      const state = syncScale(axis.state, axis.type, sorted);
      if (state !== axis.state) {
        axis.state = state;
        changed.add(axis.id);
      }
    }
    return changed;
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
      const prev = this.#axes.get(id);
      let lists: ReturnType<typeof axisCategoryLists> = {};
      if (isCategorical(type)) {
        const letter = id.charAt(0);
        const columns: unknown[] = [];
        for (const trace of fullData) {
          if (trace.visible !== false && trace[`${letter}axis`] === id) {
            columns.push(trace[letter]);
          } else {
            const data = axisDataOf(trace, id);
            if (data !== undefined) columns.push(data);
          }
        }
        lists = axisCategoryLists(full, type, columns, prev?.state.categories);
      }
      const breaks = createBreakMap(
        (full as { rangebreaks?: readonly Record<string, unknown>[] }).rangebreaks,
        type,
        fixedRangeOf(full, type),
      );
      const state = syncScale(prev?.state, type, lists.categories, lists.multicategories, breaks);
      if (!prev || prev.state !== state) rescaled.add(id);
      const slot = prev ?? new AxisSlot(id, full, state);
      slot.full = full;
      slot.state = state;
      slot.traceOrder = lists.traceOrder;
      const d = full.domain as readonly number[];
      slot.inputDomain = [d[0] ?? 0, d[1] ?? 1];
      slot.domain = slot.inputDomain;
      next.set(id, slot);
    }
    this.#axes = next;
    return rescaled;
  }

  /**
   * Point the axes at the new defaulted layout when the layout stage does not run (edits such as
   * `spikecolor` or `showspikes`, whose edit type is `none` / `modebar`), so interaction and
   * components read current attributes. The range and domain in use are carried over.
   */
  #refreshAxes(fullLayout: FullLayout): void {
    for (const axis of this.#axes.values()) {
      const full = fullLayout[axis.name] as FullAxis | undefined;
      if (!full || full === axis.full) continue;
      const [r0, r1] = axis.scale.range;
      full.range = reportedRange(axis.scale, r0, r1);
      (full as { domain: unknown }).domain = [...axis.domain];
      axis.full = full;
    }
  }

  /**
   * Margins, plot area, axis spans and subplot viewports (E4.1, E4.3). Ranges and transforms come
   * after calc, in {@link #autorange}.
   */
  #layoutSubplots(fullLayout: FullLayout, fullData: readonly FullTrace[], size: Size): void {
    this.#placeSubplots(fullLayout, this.#marginsFor(fullLayout, fullData, size), size);
  }

  /** Every component's autorange contributions (e.g. data-referenced shapes). */
  #componentExtremes(fullData: readonly FullTrace[]): Readonly<Record<string, AxisExtremes>>[] {
    const fullLayout = this.#full?.fullLayout;
    if (!fullLayout) return [];
    const out: Readonly<Record<string, AxisExtremes>>[] = [];
    for (const c of this.#registry.components()) {
      const e = c.extremes?.({ fullLayout, fullData, axes: this.#axes });
      if (e) out.push(e);
    }
    return out;
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
        traceModule: (type: string) => this.#registry.getTrace(type),
        calcdata: (index: number) => this.#calcdataOf(index),
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
      const span = domainSpan(area, axis.letter, axis.domain);
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

  /**
   * Axis ranges from trace and component extremes (E3.2), then every subplot's transform.
   *
   * Linked axes (E3.9): the axes of a `matches` group autorange together over all their extremes
   * and share one range; then `scaleanchor` / `matches` constraints are enforced (core
   * `enforceConstraints`, Plotly's `enforce`): with `constrain: 'range'` ranges widen (or, for axes
   * whose range this update did not set, zoom in) until px per unit agree; with
   * `constrain: 'domain'` the axis' domain shrinks instead, which moves its subplots.
   */
  #autorange(fullData: readonly FullTrace[]): void {
    const fullLayout = this.#full?.fullLayout;
    const fromComponents = this.#componentExtremes(fullData);
    const extremesOf = (axis: AxisSlot): AxisExtremes[] => {
      const extremes: AxisExtremes[] = [];
      fullData.forEach((trace, i) => {
        if (trace.visible !== true) return;
        const e = extremesOn(this.#traces[i]?.extremes, trace, axis);
        if (e) extremes.push(e);
      });
      for (const byAxis of fromComponents) {
        const e = byAxis[axis.id];
        if (e) extremes.push(e);
      }
      return extremes;
    };
    const ranges = new Map<string, [number, number]>();
    const matchGroups = matchGroupsOf(fullLayout);
    const grouped = new Set<string>();
    for (const group of matchGroups) {
      const members = group.map((id) => this.#axes.get(id)).filter((a) => a !== undefined);
      if (members.length === 0) continue;
      const all = members.flatMap(extremesOf);
      const own = members.map((a) => resolveAxisRange(a.full, a.scale, all));
      // One range for the group (Plotly copies the last autoranged one; the union keeps every
      // member's padding). An axis with a fixed range fixes the group (defaults synced them).
      const fixed = members.findIndex((a) => a.full.autorange === false);
      const shared = fixed >= 0 ? (own[fixed] as [number, number]) : coverRange(own);
      for (const a of members) {
        ranges.set(a.id, [shared[0], shared[1]]);
        grouped.add(a.id);
      }
    }
    for (const axis of this.#axes.values()) {
      if (grouped.has(axis.id)) continue;
      ranges.set(axis.id, resolveAxisRange(axis.full, axis.scale, extremesOf(axis)));
    }
    const domainsMoved = this.#constrain(ranges, this.#altered, true);
    for (const axis of this.#axes.values()) {
      const r = ranges.get(axis.id);
      if (!r) continue;
      axis.scale.setRange(r[0], r[1]);
      // Like Plotly, the range in use is readable from fullLayout (linear coordinates; raw values
      // on axes with range breaks).
      axis.full.range = reportedRange(axis.scale, r[0], r[1]);
    }
    if (domainsMoved && fullLayout) {
      // A `constrain: 'domain'` constraint moved axes: re-place them and their subplots.
      this.#placeSubplots(fullLayout, this.#margins, this.#size);
    }
    for (const sp of this.#subplots.values()) {
      sp.transform = dataTransform(sp.xaxis.scale, sp.yaxis.scale);
    }
  }

  /**
   * Enforce `scaleanchor` / `matches` constraints (E3.9) on `ranges` (linear, by axis id; changed
   * in place, including matched axes). `altered`: axes whose range was set by this update — the
   * others in their group may zoom in to match them. With `domains`, `constrain: 'domain'` results
   * are applied to the axes (returns whether any domain changed); otherwise they are ignored
   * (drag previews).
   */
  #constrain(
    ranges: Map<string, [number, number]>,
    altered: ReadonlySet<string>,
    domains: boolean,
  ): boolean {
    const fullLayout = this.#full?.fullLayout;
    const groups = constraintGroupsOf(fullLayout);
    let moved = false;
    if (domains) {
      for (const axis of this.#axes.values()) {
        if (axis.domain !== axis.inputDomain) moved = true;
        axis.domain = axis.inputDomain;
        (axis.full as { domain: unknown }).domain = [...axis.inputDomain];
      }
    }
    if (groups.length === 0) return moved;
    const area = this.#plotArea;
    const states = new Map<string, ConstraintAxisState>();
    for (const group of groups) {
      const ids = Object.keys(group);
      const anyAltered = ids.some((id) => altered.has(id));
      for (const id of ids) {
        const axis = this.#axes.get(id);
        const range = ranges.get(id) ?? axis?.scale.range;
        if (!axis || !range) continue;
        // Layout: from the input domain (constraints may shrink it again); previews: as placed.
        const domain = domains ? axis.inputDomain : axis.domain;
        const span = domainSpan(area, axis.letter, domain);
        states.set(id, {
          range: [range[0], range[1]],
          domain,
          length: Math.abs(span.end - span.start),
          constrain: axis.full.constrain === 'domain' ? 'domain' : 'range',
          constraintoward: String(
            axis.full.constraintoward ?? (axis.letter === 'x' ? 'center' : 'middle'),
          ),
          shrinkable: anyAltered && !altered.has(id),
        });
      }
    }
    const result = enforceConstraints(groups, states, { width: area.width, height: area.height });
    for (const [id, r] of result.ranges) ranges.set(id, [r[0], r[1]]);
    // A constrained axis may belong to a match group: its partners follow.
    for (const group of matchGroupsOf(fullLayout)) {
      const source = group.find((id) => result.ranges.has(id));
      const r = source === undefined ? undefined : ranges.get(source);
      if (r) for (const id of group) ranges.set(id, [r[0], r[1]]);
    }
    if (domains && result.domains.size > 0) {
      for (const [id, d] of result.domains) {
        const axis = this.#axes.get(id);
        if (!axis) continue;
        axis.domain = [d[0], d[1]];
        (axis.full as { domain: unknown }).domain = [d[0], d[1]];
        moved = true;
      }
      // Overlaying axes share the domain of the axis they overlay.
      for (const axis of this.#axes.values()) {
        const o = (axis.full as { overlaying?: unknown }).overlaying;
        const base = typeof o === 'string' ? this.#axes.get(o) : undefined;
        if (base && base !== axis && base.domain !== base.inputDomain) {
          axis.domain = base.domain;
          (axis.full as { domain: unknown }).domain = [...base.domain];
        }
      }
    }
    return moved;
  }

  /**
   * Ranges of an interaction (zoom, pan, wheel, reset) with their linked axes (E3.9): the other
   * axes of a `matches` group get the same range, and `scaleanchor` partners zoom by the same
   * factor so px per unit stay locked.
   */
  #linked(ranges: ReadonlyMap<string, LinearRange>): Map<string, LinearRange> {
    const fullLayout = this.#full?.fullLayout;
    const out = new Map<string, [number, number]>();
    for (const [id, r] of ranges) out.set(id, [r[0], r[1]]);
    if (!fullLayout) return out;
    for (const group of matchGroupsOf(fullLayout)) {
      const source = group.find((id) => ranges.has(id));
      const r = source === undefined ? undefined : ranges.get(source);
      if (r) for (const id of group) if (!out.has(id)) out.set(id, [r[0], r[1]]);
    }
    const altered = new Set(out.keys());
    if (constraintGroupsOf(fullLayout).length > 0) this.#constrain(out, altered, false);
    return out;
  }

  /**
   * Run `crossTraceCalc` once per subplot and stack group (plan §4.4): with every visible trace of
   * the group on the subplot, in trace order, after calc and before extremes. A trace's group is
   * the first of its module's `categories` listed in {@link STACK_GROUPS} (so bar, histogram,
   * funnel and waterfall stack together as `bar-like`), else its trace type; the group's first
   * module with a `crossTraceCalc` runs it. It reruns when any trace of the group (hidden ones
   * included: hiding a bar restacks the others) was recalculated or declared a `crossTraceCalc`
   * stage. The members the module reports as changed (its return value; all of them when it
   * returns nothing) then re-upload: their plans get `calc`, `plot` and `style` and lose `append`
   * (their calc was mutated in place). Unreported members keep their plans as they were, so a
   * streaming append to one trace keeps its fast path when stacking elsewhere on the subplot
   * reruns, and an unaffected trace is not redrawn. With `only`, just the groups with a member in
   * it rerun (the second pass after a category reorder; the members in `only` already have full
   * plans).
   */
  #crossTraceCalc(
    fullLayout: FullLayout,
    fullData: readonly FullTrace[],
    plan: Plan,
    plans: TraceUpdatePlan[],
    only?: ReadonlySet<number>,
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
          dirty: only === undefined && (plan.full || plan.structural),
        };
        groups.set(key, group);
      }
      group.module ??= module.crossTraceCalc ? module : undefined;
      group.members.push(i);
      const stages = plan.traces.get(i);
      if (only) {
        if (only.has(i)) group.dirty = true;
      } else if ((plans[i] as TraceUpdatePlan).calc || stages?.has('crossTraceCalc')) {
        group.dirty = true;
      }
    });
    if (!only && plan.layout.has('crossTraceCalc')) for (const g of groups.values()) g.dirty = true;
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
      const reported = group.module.crossTraceCalc(entries, {
        fullLayout,
        subplot,
        xaxis: subplot.xaxis,
        yaxis: subplot.yaxis,
      });
      const changed = reported ? new Set(reported) : undefined;
      for (const e of entries) {
        if (changed && !changed.has(e.index)) continue;
        // Cross-trace calc rewrote the calc in place: no longer a streaming-only change.
        const { append: _, ...tp } = plans[e.index] as TraceUpdatePlan;
        plans[e.index] = { ...tp, calc: true, plot: true, style: true };
      }
    }
  }

  /**
   * The domain of a trace in the `domain` category (E4.5) on the current plot area, or
   * `undefined` for other traces. Supply-defaults already resolved `domain.row` / `column`.
   */
  #domainOf(trace: FullTrace): DomainInfo | undefined {
    if (trace._module?.categories.includes('domain') !== true) return undefined;
    const d = trace['domain'] as { x?: unknown; y?: unknown } | undefined;
    const pair = (v: unknown): [number, number] =>
      Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number'
        ? [v[0], v[1]]
        : [0, 1];
    const x = pair(d?.x);
    const y = pair(d?.y);
    return { x, y, rect: domainRect(this.#plotArea, x, y) };
  }

  /**
   * Run `crossTraceLayout` once per domain trace type (M2 wave 1; see the contract): with every
   * visible trace of the type that has a calc, after the final layout pass. It reruns when the
   * layout ran or a member was recalculated / re-read, and every member then re-reads its calc.
   */
  #crossTraceLayout(
    fullLayout: FullLayout,
    fullData: readonly FullTrace[],
    plans: TraceUpdatePlan[],
    layoutRan: boolean,
    size: Size,
  ): void {
    const groups = new Map<TraceModule, { entries: DomainTraceEntry[]; dirty: boolean }>();
    fullData.forEach((trace, i) => {
      const slot = this.#traces[i];
      const module = slot?.module;
      if (!module?.crossTraceLayout || trace.visible !== true || !slot?.hasCalc) return;
      const domain = this.#domainOf(trace);
      if (!domain) return;
      let group = groups.get(module);
      if (!group) groups.set(module, (group = { entries: [], dirty: layoutRan }));
      group.entries.push({ trace, index: i, calc: slot.calc, domain });
      if ((plans[i] as TraceUpdatePlan).plot) group.dirty = true;
    });
    for (const [module, group] of groups) {
      if (!group.dirty) continue;
      module.crossTraceLayout?.(group.entries, {
        fullLayout,
        width: size.width,
        height: size.height,
        plotArea: this.#plotArea,
      });
      for (const e of group.entries) {
        const tp = plans[e.index] as TraceUpdatePlan;
        plans[e.index] = { ...tp, plot: true, style: true };
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
      ...(subplot ? {} : optional('domain', this.#domainOf(trace))),
      plotArea: this.#plotArea,
      primitives: root.context,
      ...optional('cells', traceCells(slot.module, trace, this.#subplots)),
      add: (primitive, vp = viewport) => {
        vp.add(primitive);
        slot.primitives.add(primitive as Primitive<unknown>);
        if (vp !== viewport) placePrimitive(primitive as Primitive<unknown>, vp);
        return primitive;
      },
      remove: (primitive) => {
        slot.primitives.delete(primitive as Primitive<unknown>);
        (placedViewport(primitive as Primitive<unknown>) ?? viewport).remove(primitive, {
          dispose: true,
        });
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
      for (const p of slot.primitives) {
        (placedViewport(p) ?? slot.viewport)?.remove(p, { dispose: true });
      }
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
      traceModule: (type: string) => this.#registry.getTrace(type),
      calcdata: (index: number) => this.#calcdataOf(index),
      mirrorSubplot: (id, options) => this.#mirrors.create(slot, id, options),
      autorange: (id) => this.#fullAutorange(id),
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
      domainEntries: () => this.#domainEntries(),
      fullLayout: () => this.#full?.fullLayout,
      traceCount: () => this.#full?.fullData.length ?? 0,
      isFixed: (axis) => this.#isFixed(axis),
      limits: (axis) => this.#limits(axis),
      dispatch: (event, only) => this.#dispatchPointer(event, only),
      drawShape: (gesture) => {
        for (const slot of this.#componentOrder)
          if (slot.view?.drawShape?.(gesture) === true) return;
      },
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
      commitSelection: (sp, query, shift) => this.#commitSelection(sp, query, shift),
      axes: () => this.#axes,
      plotArea: () => this.#plotArea,
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
        const input = this.#figure.data[index];
        // One entry per subplot the trace is on (every cell of a multi-subplot trace).
        for (const subplot of entrySubplots(module, trace, this.#subplots)) {
          const list = map.get(subplot.id) ?? [];
          list.push({
            index,
            module,
            trace,
            input,
            calc: slot.calc,
            subplot,
            rect: subplot.rect,
            ctx: {
              fullLayout: full.fullLayout,
              xaxis: subplot.xaxis,
              yaxis: subplot.yaxis,
              transform: subplot.transform,
            },
            skip: traceAttr(trace, input, 'hoverinfo') === 'skip',
          });
          map.set(subplot.id, list);
        }
      });
      this.#hoverEntries = map;
    }
    return this.#hoverEntries.get(subplotId) ?? EMPTY_ENTRIES;
  }

  /** Hoverable domain traces (pie; E4.5), rebuilt lazily after each pipeline run. */
  #domainEntries(): DomainHover {
    if (!this.#domainHover) {
      const entries: HoverEntry[] = [];
      const full = this.#full;
      const rect: ViewportRect = { x: 0, y: 0, width: this.#size.width, height: this.#size.height };
      full?.fullData.forEach((trace, index) => {
        const slot = this.#traces[index];
        const module = slot?.module;
        if (!slot?.hasCalc || !module?.hoverPoints || trace.visible !== true) return;
        const domain = this.#domainOf(trace);
        if (!domain) return;
        const input = this.#figure.data[index];
        entries.push({
          index,
          module,
          trace,
          input,
          calc: slot.calc,
          subplot: undefined,
          rect,
          ctx: {
            fullLayout: full.fullLayout,
            xaxis: undefined,
            yaxis: undefined,
            transform: IDENTITY_TRANSFORM,
            domain,
          },
          skip: traceAttr(trace, input, 'hoverinfo') === 'skip',
        });
      });
      this.#domainHover = { entries, height: this.#size.height };
    }
    return this.#domainHover;
  }

  #dispatchPointer(event: ComponentPointerEvent, only: unknown): unknown {
    for (const slot of this.#componentOrder) {
      const view = slot.view;
      if (!view?.handlePointer || (only !== undefined && view !== only)) continue;
      if (view.handlePointer(event) === true) return view;
    }
    // Then trace views (e.g. a scrolling table), last trace first: later traces draw on top.
    for (let i = this.#traces.length - 1; i >= 0; i--) {
      const view = this.#traces[i]?.view;
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
  #previewRanges(requested: ReadonlyMap<string, LinearRange>): void {
    const full = this.#full;
    const root = this.#root;
    if (!full || !root) return;
    const ranges = this.#linked(requested);
    for (const [id, [r0, r1]] of ranges) {
      const axis = this.#axes.get(id);
      if (!axis) continue;
      axis.scale.setRange(r0, r1);
      axis.full.range = reportedRange(axis.scale, r0, r1);
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
    // Multi-subplot traces (splom) draw in many subplots: one update with every cell's transform.
    full.fullData.forEach((trace, i) => {
      const slot = this.#traces[i];
      if (!slot?.view || !slot.viewport || !isMultiSubplot(slot.module)) return;
      slot.view.update(this.#plotContext(i, trace, slot, undefined, slot.viewport), TRANSFORM_ONLY);
    });
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
  #commitRanges(requested: ReadonlyMap<string, LinearRange>): Promise<Chart> {
    const ranges = this.#linked(requested);
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

  /**
   * Select the points inside `layout.selections` (E5.12, Plotly's `reselect`): on the first draw,
   * when the selections change, and when a trace on a subplot with selections is recalculated.
   * Every selectable trace on a subplot with selections gets the union of what each selection
   * contains; traces selected by selections that are gone are cleared. Traces whose input
   * `selectedpoints` changed in this update keep it. A GUI edit of a selection (a drag of the
   * selections component) emits `selected` with the new points.
   */
  #reselect(plan: Plan, fullLayout: FullLayout, fullData: readonly FullTrace[]): void {
    const list = selectionsOf(fullLayout);
    const layoutSelected = this.#traces.some((t) => t?.layoutSelected === true);
    if (list.length === 0 && !layoutSelected) return;
    const recalculated =
      plan.layout.has('calc') ||
      plan.appends.size > 0 ||
      [...plan.traces.values()].some((s) => s.has('calc'));
    if (!plan.full && !plan.selections && !plan.structural && !recalculated) return;
    const bySubplot = new Map<string, NonNullable<ReturnType<typeof selectionQuery>>[]>();
    for (const sel of list) {
      const sp = this.#subplots.get(`${String(sel.xref)}${String(sel.yref)}`);
      const query = sp && selectionQuery(sel, sp.xaxis, sp.yaxis);
      if (!sp || !query) continue;
      const queries = bySubplot.get(sp.id) ?? [];
      queries.push(query);
      bySubplot.set(sp.id, queries);
    }
    // Entries are built lazily from the current slots: rebuild them for this run.
    this.#hoverEntries = null;
    const selected = new Map<number, Set<number>>();
    for (const [id, queries] of bySubplot) {
      for (const entry of this.#entries(id)) {
        const select = entry.module.selectPoints;
        if (!select || plan.inputSelection.has(entry.index)) continue;
        const set = selected.get(entry.index) ?? new Set<number>();
        for (const q of queries)
          for (const i of select(entry.calc, entry.trace, q, entry.ctx)) set.add(i);
        selected.set(entry.index, set);
      }
    }
    this.#hoverEntries = null;
    this.#traces.forEach((slot, i) => {
      if (!slot || plan.inputSelection.has(i)) return;
      const set = selected.get(i);
      if (set) {
        slot.selection = [...set].sort((a, b) => a - b);
        slot.layoutSelected = true;
        plan.selection.add(i);
      } else if (slot.layoutSelected) {
        slot.selection = null;
        slot.layoutSelected = false;
        plan.selection.add(i);
      }
    });
    if (plan.selectionsEdited) {
      const selections = this.#figure.layout['selections'];
      plan.after.push(() => {
        const points = [];
        for (const [index, set] of selected) {
          const trace = fullData[index];
          const sp =
            trace && this.#subplots.get(`${String(trace['xaxis'])}${String(trace['yaxis'])}`);
          const entry = sp && this.#entries(sp.id).find((e) => e.index === index);
          if (!entry) continue;
          for (const i of set) {
            points.push(buildPoint(entry, { pointIndex: i, distance: 0, px: 0, py: 0 }, false));
          }
        }
        this.#events.emit('selected', {
          points,
          ...(Array.isArray(selections) ? { selections } : {}),
        });
      });
    }
  }

  /**
   * `fullData[i].selectedpoints` shows the selection in effect (E5.12, Plotly keeps
   * `selectedpoints` in sync): the interactive one or the one `layout.selections` made; the
   * input trace is left as given (`chart.toImage` hands the selection over too).
   */
  #syncSelectedpoints(fullData: readonly FullTrace[]): void {
    fullData.forEach((trace, i) => {
      const selection = this.#traces[i]?.selection;
      if (selection === undefined) return;
      if (selection === null) delete (trace as Record<string, unknown>)['selectedpoints'];
      else (trace as Record<string, unknown>)['selectedpoints'] = [...selection];
    });
  }

  /**
   * A finished box or lasso drag as a layout selection (E5.12): appended to `layout.selections`
   * with shift, replacing them otherwise, through one GUI `relayout`. Returns the new list.
   */
  #commitSelection(
    sp: SubplotInfo,
    query: SelectionQuery,
    shift: boolean,
  ): readonly Record<string, unknown>[] | undefined {
    const sel = selectionFromQuery(query, sp.xaxis, sp.yaxis);
    if (!sel) return undefined;
    const current = this.#figure.layout['selections'];
    const list = shift && Array.isArray(current) ? [...(current as unknown[]), sel] : [sel];
    this.relayout({ selections: list }, { gui: true }).catch(() => undefined);
    return list as Record<string, unknown>[];
  }

  /** Remove `layout.selections` (a GUI relayout); returns whether there were any. */
  #dropLayoutSelections(): boolean {
    const current = this.#figure.layout['selections'];
    if (!Array.isArray(current) || current.length === 0) return false;
    this.relayout({ selections: [] }, { gui: true }).catch(() => undefined);
    return true;
  }

  /**
   * The range axis `id` autoranges to over all its data (E5.9: range slider), whatever its
   * `autorange` / `range` say; linear coordinates.
   */
  #fullAutorange(id: string): readonly [number, number] | undefined {
    const axis = this.#axes.get(id);
    const full = this.#full;
    if (!axis || !full) return undefined;
    const key = `${axis.letter}axis`;
    const extremes: AxisExtremes[] = [];
    full.fullData.forEach((trace, i) => {
      const e = this.#traces[i]?.extremes;
      if (trace.visible !== true || !e) return;
      const byAxis = (e as { byAxis?: Readonly<Record<string, AxisExtremes>> }).byAxis;
      const mine = byAxis ? byAxis[id] : trace[key] === id ? e[axis.letter] : undefined;
      if (mine) extremes.push(mine);
    });
    for (const byAxis of this.#componentExtremes(full.fullData)) {
      const e = byAxis[id];
      if (e) extremes.push(e);
    }
    const auto = { ...axis.full, autorange: true } as FullAxis;
    return resolveAxisRange(auto, axis.scale, extremes);
  }

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
    if (slot) {
      slot.selection = undefined;
      slot.layoutSelected = false;
    }
    plan.selection.add(index);
    plan.inputSelection.add(index);
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
    let had = this.#dropLayoutSelections();
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
      this.#mirrors.disposeOwner(slot);
      slot.primitives.clear();
    }
  }
}

/** `{ [key]: value }`, or `{}` when `value` is undefined (for `exactOptionalPropertyTypes`). */
function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });
}

/**
 * The fixed range of an axis in raw units (ms on date axes), for range breaks: a single span
 * covering all of it is dropped (Plotly). Empty unless `autorange` is off.
 */
function fixedRangeOf(full: FullAxis, type: AxisType): { fixedRange?: [number, number] } {
  if (full.autorange !== false || !Array.isArray(full.range)) return {};
  const plain = createScale({ type });
  const a = plain.r2l(full.range[0]);
  const b = plain.r2l(full.range[1]);
  return Number.isFinite(a) && Number.isFinite(b) ? { fixedRange: [a, b] } : {};
}

/** `matches` groups of a defaulted layout (E3.9), as lists of axis ids. */
function matchGroupsOf(fullLayout: FullLayout | undefined): string[][] {
  const groups = (fullLayout as { _axisMatchGroups?: readonly Readonly<Record<string, unknown>>[] })
    ?._axisMatchGroups;
  return Array.isArray(groups) ? groups.map((g) => Object.keys(g)) : [];
}

/** `scaleanchor` / `matches` constraint groups of a defaulted layout (E3.9). */
function constraintGroupsOf(fullLayout: FullLayout | undefined): readonly ConstraintGroup[] {
  const groups = (fullLayout as { _axisConstraintGroups?: readonly ConstraintGroup[] })
    ?._axisConstraintGroups;
  return Array.isArray(groups) ? groups : [];
}

/** The smallest range covering every range in `list`, in the direction of the first one. */
function coverRange(list: readonly (readonly [number, number])[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [a, b] of list) {
    lo = Math.min(lo, a, b);
    hi = Math.max(hi, a, b);
  }
  const first = list[0];
  if (!first || !Number.isFinite(lo) || !Number.isFinite(hi))
    return first ? [first[0], first[1]] : [0, 1];
  return first[0] > first[1] ? [hi, lo] : [lo, hi];
}

const AXIS_RANGE_EDIT = /^([xy]axis\d*)\.(range(?:\[[01]\])?|autorange)$/;

/**
 * Range and autorange edits applied to every axis of the edited axis' `matches` group (E3.9), so
 * `relayout({ 'xaxis2.range': … })` moves the whole group — defaults would otherwise sync the
 * group to its first axis' range. Edits already given for a member win.
 */
function withMatchedAxes(
  edits: Record<string, unknown>,
  fullLayout: FullLayout | undefined,
): Record<string, unknown> {
  const groups = matchGroupsOf(fullLayout);
  if (groups.length === 0) return edits;
  const out: Record<string, unknown> = { ...edits };
  for (const [path, value] of Object.entries(edits)) {
    const m = AXIS_RANGE_EDIT.exec(path);
    if (!m || value === undefined) continue;
    const id = axisIdOf(m[1] as string);
    const group = groups.find((g) => g.includes(id));
    if (!group) continue;
    for (const other of group) {
      if (other === id) continue;
      const target = `${axisName(other)}.${m[2] as string}`;
      if (!(target in out)) out[target] = Array.isArray(value) ? [...(value as unknown[])] : value;
    }
  }
  return out;
}

/** Axis id of a layout key: `'xaxis'` → `'x'`, `'yaxis2'` → `'y2'`. */
function axisIdOf(name: string): string {
  const n = name.slice(5);
  return `${name.charAt(0)}${n === '1' ? '' : n}`;
}

/** The values of the range paths among `paths` in `layout` (to tell a set range from a reset). */
function rangeValues(
  layout: Readonly<Record<string, unknown>>,
  paths: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of paths) if (RANGE_SET_PATH.test(p)) out[p] = getIn(layout, p) ?? null;
  return out;
}

/** Does this subplot sit on an axis that `overlaying`s another one (a secondary axis)? */
function overlays(sp: SubplotSlot): boolean {
  const over = (axis: AxisSlot): boolean => {
    const o = (axis.full as { overlaying?: unknown }).overlaying;
    return typeof o === 'string' && o !== '' && o !== 'free' && o !== axis.id;
  };
  return over(sp.xaxis) || over(sp.yaxis);
}

/**
 * What the export code needs to draw `figure` offscreen (see `export/image.ts`): an offscreen
 * chart factory with `options`' registry and renderer factory, and the default size — `size`, else
 * the figure's `layout.width` / `height`, else 700 × 450 like a chart in an unsized element.
 * Internal: used by `chart.toImage` and the functional `toImage(figure)`.
 */
export function figureExportSource(
  figure: FigureInput,
  document: Document,
  options: ChartOptions = {},
  size?: Readonly<Size>,
): ExportSource {
  const layout = isPlainObject(figure.layout) ? figure.layout : {};
  const dim = (key: 'width' | 'height'): number => {
    const v = layout[key];
    return typeof v === 'number' && v >= 10 ? v : DEFAULT_SIZE[key];
  };
  const renderRoot = options.renderRoot;
  return {
    figure,
    width: size?.width ?? dim('width'),
    height: size?.height ?? dim('height'),
    document,
    create: (host, input, pixelRatio) => {
      OFFSCREEN.add(host);
      return new Chart(host, input, {
        ...(options.registry ? { registry: options.registry } : {}),
        renderRoot: {
          ...(renderRoot?.createRenderer ? { createRenderer: renderRoot.createRenderer } : {}),
          ...(renderRoot?.scheduler ? { scheduler: renderRoot.scheduler } : {}),
          preserveDrawingBuffer: true,
          pixelRatio,
        },
      });
    },
  };
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
