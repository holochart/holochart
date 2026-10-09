/**
 * The trace module and component contracts (plan §4.4; full spec in E22.1).
 *
 * Only the pure, core-side fields are typed precisely here. Render-side hooks (`calc`, `plot`,
 * `hoverPoints`, …) are typed `unknown` until their stages land, so core never depends on three.js.
 */
import type { FullLayout, FullTrace } from '../defaults/types.ts';
import type { LocaleModule, LocaleStore } from '../locale/locale.ts';
import type { Children, ObjectNode } from '../schema/types.ts';
import type { Template, TemplateSource } from '../templates/templates.ts';
import type { Issue } from '../validate/issues.ts';

/**
 * Trace categories drive shared behavior: `cartesian` traces get `xaxis`/`yaxis` attributes and
 * take part in axis discovery; `domain` traces get `domain.{x, y, row, column}` and are placed by
 * a fraction of the plot area or a `layout.grid` cell (E4.5); `showLegend` traces count towards
 * the legend default.
 * @experimental
 */
export type TraceCategory =
  | 'cartesian'
  | 'domain'
  | 'showLegend'
  | 'symbols'
  | 'errorBarsOK'
  | 'noOpacity'
  | 'gl3d'
  | 'polar'
  | 'geo'
  | (string & {});

/** Docs metadata for a trace module. @experimental */
export interface TraceModuleMeta {
  /** Markdown description. */
  description: string;
  /** Docs page slug. */
  docsPage?: string;
  /** Equivalent Plotly trace type, when named differently or partially covered. */
  plotlyEquivalent?: string;
}

/** Helpers passed to a trace module's `supplyDefaults`. @experimental */
export interface TraceDefaultsContext {
  /**
   * Coerce the attribute at `path` into the full trace and return its value. Precedence: user
   * input > template > `dflt` argument > schema `dflt`. Invalid values fall through to the next
   * source.
   */
  coerce<T = unknown>(path: string, dflt?: unknown): T;
  /**
   * Coerce every attribute of the container at `path` (e.g. `'marker.line'`). `overrides` replaces
   * schema defaults by relative path (e.g. `{ family: fullLayout.font.family }`).
   */
  coerceContainer(path: string, overrides?: Readonly<Record<string, unknown>>): void;
  /** The template trace for this trace (already cycled), if any. */
  readonly template: Record<string, unknown> | undefined;
  /** The layout as far as it has been defaulted (base layout attributes are ready). */
  readonly fullLayout: FullLayout;
  /** This trace's colorway color (`colorway[index % colorway.length]`). */
  readonly defaultColor: string;
  /** Index of the trace in `data`. */
  readonly index: number;
}

/** Helpers passed to layout-level `supplyLayoutDefaults` hooks. @experimental */
export interface LayoutDefaultsContext {
  /** Coerce a layout attribute (by path) with the same precedence as trace `coerce`. */
  coerce<T = unknown>(path: string, dflt?: unknown): T;
  /** The defaulted traces. */
  readonly fullData: readonly FullTrace[];
  /** The resolved template, if any. */
  readonly template: Template | null;
}

/**
 * What a cartesian trace asks of its axes, beyond holding its data (see
 * {@link CoreTraceModule.axisHints}). Every field is a default: what the figure sets on an axis
 * wins, and so does another trace that shows the axis. A trace in a 3D scene asks the same of its
 * scene's three axes (`hide: true`, and `x` / `y` / `z`; a scene has its own `aspectmode`).
 * @experimental
 */
export interface TraceAxisHints {
  /**
   * The axes carry no readable scale for this trace (positions a layout computed): each defaults
   * to `visible: false`, unless a trace without this hint is on it. `'x'` or `'y'` hides that axis
   * only (the other one is a real scale: a dendrogram's heights, the dates of a timeline).
   */
  readonly hide?: boolean | 'x' | 'y';
  /**
   * One unit is as long on y as on x (shapes keep their proportions): the y axis defaults to
   * `scaleanchor` = the trace's x axis.
   */
  readonly equal?: boolean;
  /**
   * That axis runs the other way (larger values to the left, or at the bottom): it defaults to
   * `autorange: 'reversed'`, unless a trace without this hint is on it or a `range` is given.
   */
  readonly reverse?: 'x' | 'y';
  /**
   * The data the trace puts on its x and y axis when that is not its `x` / `y` attribute
   * (positions inside a container): the axis type is detected from it, and a category axis lists
   * its values. Unset: `x` / `y` are read as for every trace. `z`: the same for the z axis of a 3D
   * scene.
   */
  readonly x?: unknown;
  readonly y?: unknown;
  readonly z?: unknown;
}

/**
 * A trace type (plan §4.4). `schema` is the single source of truth for the trace's own
 * attributes; common attributes (`visible`, `name`, `opacity`, …, and `xaxis`/`yaxis` for
 * cartesian traces) are added by the registry.
 * @experimental
 */
export interface CoreTraceModule<C extends Children = Children> {
  readonly type: string;
  readonly categories: readonly TraceCategory[];
  readonly schema: ObjectNode<C>;
  /**
   * Fill `traceOut` from `traceIn` using `ctx.coerce`. Called after common attributes are
   * coerced, and only for traces with `visible !== false`.
   */
  supplyDefaults(
    traceIn: Readonly<Record<string, unknown>>,
    traceOut: FullTrace,
    ctx: TraceDefaultsContext,
  ): void;
  /** Layout attributes owned by this trace type (e.g. `barmode`), coerced when a trace of this type is present. */
  readonly layoutSchema?: Children;
  /** Extra layout defaults logic, run after `layoutSchema` is coerced. */
  supplyLayoutDefaults?(
    layoutIn: Readonly<Record<string, unknown>>,
    layoutOut: FullLayout,
    ctx: LayoutDefaultsContext,
  ): void;
  readonly meta: TraceModuleMeta;
  /**
   * Axis defaults a cartesian trace asks for (ADR-029), called with the defaulted trace while the
   * axes are defaulted: hidden axes, equal scales, and where its positions are when they are not
   * in `x` / `y`. Return `undefined` (or leave the method out) for a trace that is drawn on its
   * axes like any other. The 3D scenes ask it of their traces too, for their three axes.
   */
  axisHints?(trace: FullTrace): TraceAxisHints | undefined;
  /** Attribute paths that support transitions (E7.3). */
  readonly animatable?: readonly string[];
  // Render-side contract (E2/E22). Typed loosely until those stages exist.
  readonly calc?: unknown;
  readonly crossTraceCalc?: unknown;
  readonly plot?: unknown;
  readonly hoverPoints?: unknown;
  readonly selectPoints?: unknown;
  readonly legendIcon?: unknown;
  readonly colorbar?: unknown;
}

/**
 * A layout component (legend, annotations, shapes, …) contributing layout attributes. Components
 * are always active, unlike trace-module layout attributes.
 * @experimental
 */
export interface CoreComponentModule {
  readonly name: string;
  readonly layoutSchema?: Children;
  supplyLayoutDefaults?(
    layoutIn: Readonly<Record<string, unknown>>,
    layoutOut: FullLayout,
    ctx: LayoutDefaultsContext,
  ): void;
}

/**
 * Holds trace modules, components and named templates for a set of charts. Keeping this an
 * explicit object (rather than module-level state) keeps core pure and lets tests and apps run
 * isolated registries side by side.
 * @experimental
 */
export interface Registry extends TemplateSource {
  /** Register trace modules. Re-registering a type replaces it. Returns the registry. */
  register(...modules: CoreTraceModule[]): Registry;
  /** Register layout components. Re-registering a name replaces it. Returns the registry. */
  registerComponent(...components: CoreComponentModule[]): Registry;
  getModule(type: string): CoreTraceModule | undefined;
  /** Registered trace types in registration order. */
  traceTypes(): string[];
  components(): readonly CoreComponentModule[];
  /** Full schema for a trace type: common attributes merged with the module's schema. */
  getTraceSchema(type: string): ObjectNode | undefined;
  /** Base layout schema merged with every module's and component's layout attributes. */
  getLayoutSchema(): ObjectNode;
  /** Register a named template (referenced as `layout.template: 'name'`). */
  registerTemplate(name: string, template: Template): Registry;
  getTemplate(name: string): Template | undefined;
  templateNames(): string[];
  /** Template applied when `layout.template` is unset (`undefined` to apply none). */
  setDefaultTemplate(name: string | undefined): Registry;
  readonly defaultTemplate: string | undefined;
  /**
   * Register locale modules (plan E17.6), plotly.js's shape (`{ moduleType: 'locale', name, … }`).
   * `config.locale` looks them up by name.
   */
  registerLocale(...modules: LocaleModule[]): Registry;
  /** The registered locales. */
  readonly locales: LocaleStore;
  /** Report an issue through `console.warn`, at most once per path and code. */
  warnOnce(issue: Issue): void;
}
