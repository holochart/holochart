/**
 * Domain traces in 2.5D (plan E8.9, E9.12): `pie`, `treemap` and `icicle` with `depth`, `bevel`,
 * `material` (core's extrusion attributes) and a view of their own — `tilt` and `perspective`.
 *
 * ## Why a view per trace
 *
 * `layout.view3d` tilts cartesian subplots: their plot areas are planes whose axes, grids, zoom and
 * selection go with them. Domain traces have none of that: each sits in its own `domain` of the
 * figure, drawn in the overlay the figure's components share. So each carries its own view, like
 * Plotly-style 3D pies: `tilt` (degrees, ±80, positive looks from above; 0 is the flat view) and
 * `perspective` (0 parallel … 1 strong, default 0.5, as `layout.view3d`), the trace's domain rect
 * being the tilted plane (so tilt 0 draws exactly where the flat trace does). No azimuth: a pie
 * turns with its own `rotation`, and tiles read best square on. A dashboard can mix a flat donut
 * and a tilted pie, and both angles animate as trace attributes (`animate`, `react` with
 * `layout.transition`).
 *
 * ## How
 *
 * The trace's own view draws as usual; this wrapper records the primitives it adds and hands them
 * to render's `extrudeDomain` after every update, which (lazily loaded, `extrusion-domain.ts`)
 * intercepts their updates: slices and tiles become lit prisms seen through the trace's camera,
 * labels, leader lines and the path bar are projected onto their tops. Hover, clicks (drill-down),
 * keyboard focus and label links get the pointer mapped onto the flat trace, and hover labels are
 * placed where the tilted trace draws their anchors.
 *
 * With `depth` 0 and `tilt` 0 (the defaults) nothing changes: nothing loads and the trace draws
 * flat. Like the rest of 2.5D this is a full-bundle feature: `@mk7s/holochart-traces-basic` and
 * `-traces-hier` declare no such attributes.
 */
import { attr, withExtrusion } from '@mk7s/holochart-core';
import { extrudeDomain, extrusionModuleLoaded, type Primitive } from '@mk7s/holochart-render';
import type {
  ComponentPointerEvent,
  TraceModule,
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { pie, type PieCalc } from '@mk7s/holochart-traces-basic';
import { icicle, treemap } from '@mk7s/holochart-traces-hier';

/** The item a slice's `depth` is read at: its first data index. */
type Items = (calc: never) => ArrayLike<number>;

/** A domain trace's own view (see the module comment), with the extrusion attributes. */
const domainViewAttributes = /* @__PURE__ */ (() => ({
  tilt: attr.number({
    min: -80,
    max: 80,
    dflt: 0,
    editType: 'plot',
    animatable: true,
    description:
      'Tilt of the trace in 2.5D (Holochart extension), degrees: positive looks from above, 0 (default) is the flat view. With `depth`, slices and tiles show their sides.',
  }),
  perspective: attr.number({
    min: 0,
    max: 1,
    dflt: 0.5,
    editType: 'plot',
    animatable: true,
    description:
      'Strength of the perspective of a tilted or extruded trace: 0 is a parallel projection, 1 a strong one.',
  }),
}))();

/** The trace's view, its primitives recorded and extruded after every update. */
class DomainView implements TraceView {
  readonly #view: TraceView;
  readonly #added = new Set<Primitive<unknown>>();
  readonly #items: Items | undefined;

  constructor(renderer: TraceRenderer, ctx: TracePlotContext, items: Items | undefined) {
    this.#items = items;
    this.#view = renderer.create(this.#capture(ctx));
    this.#sync(ctx);
  }

  update(ctx: TracePlotContext, plan: TraceUpdatePlan): void {
    this.#view.update(this.#capture(ctx), plan);
    this.#sync(ctx);
  }

  handlePointer(event: ComponentPointerEvent): boolean | void {
    return this.#view.handlePointer?.(extrusionModuleLoaded()?.domainPointer(this, event) ?? event);
  }

  dispose(): void {
    this.#view.dispose?.();
  }

  #capture(ctx: TracePlotContext): TracePlotContext {
    return {
      ...ctx,
      add: (p, viewport) => {
        this.#added.add(p as Primitive<unknown>);
        extrusionModuleLoaded()?.domainCapture(this, p as Primitive<unknown>);
        return ctx.add(p, viewport);
      },
    };
  }

  #sync(ctx: TracePlotContext): void {
    extrudeDomain(ctx, this, this.#added, this.#items?.(ctx.calc as never));
  }
}

/**
 * `module` (a domain trace) with `depth`, `bevel`, `material`, `tilt` and `perspective`, drawn and
 * hovered in 2.5D (see the module comment). `items`: for per-slice `depth` arrays, the item of
 * each slice (pie); tiles bring theirs.
 */
export function withDomainExtrusion(module: TraceModule, items?: Items): TraceModule {
  const m = withExtrusion(module);
  const { children, ...meta } = m.schema;
  const hover = module.hoverPoints!;
  const plot = module.plot!;
  // Keyboard stops (a list of them) with their anchors where the tilted trace draws them.
  type Keys = NonNullable<TraceModule['keyboardPoints']>;
  const tilted =
    (keys: Keys): Keys =>
    (c, t, h) => {
      const stops = keys(c, t, h);
      return (
        (Array.isArray(stops) && extrusionModuleLoaded()?.domainKeyboard(() => stops, c, t, h)) ||
        stops
      );
    };
  const keys = module.keyboardPoints;
  const load = module.a11y;
  const type = module.type;
  return {
    ...m,
    schema: attr.object({ ...children, ...domainViewAttributes }, meta),
    supplyDefaults(traceIn, traceOut, ctx) {
      m.supplyDefaults(traceIn, traceOut, ctx);
      const out = traceOut as { visible?: unknown; depth?: unknown };
      const c = ctx as { coerce(path: string): unknown };
      if (out.visible !== false && (c.coerce('tilt') || out.depth)) c.coerce('perspective');
    },
    plot: { create: (ctx) => new DomainView(plot, ctx, items) },
    hoverPoints: (c, t, q, h) =>
      extrusionModuleLoaded()?.domainHover(hover, c, t, q, h) ?? hover(c, t, q, h),
    ...(keys && { keyboardPoints: tilted(keys) }),
    // Stops that load on first use (treemap, icicle) are tilted when they arrive.
    ...(load && {
      a11y: () =>
        load().then((parts) => {
          const own = parts[type];
          const lazy = own?.keyboardPoints as Keys | undefined;
          return lazy ? { ...parts, [type]: { ...own, keyboardPoints: tilted(lazy) } } : parts;
        }),
    }),
  };
}

/** `pie` with `depth` (per slice too), `bevel`, `material`, `tilt` (plan E9.12). */
export const extrudedPie: TraceModule = /* @__PURE__ */ withDomainExtrusion(
  pie as TraceModule,
  (calc: PieCalc) => calc.slices.map((s) => s.pts[0]!),
);

/** `treemap` with `depth` (per node too: terraces per level), `bevel`, `material`, `tilt`. */
export const extrudedTreemap: TraceModule = /* @__PURE__ */ withDomainExtrusion(
  treemap as TraceModule,
);

/** `icicle` with `depth` (per node too), `bevel`, `material`, `tilt`. */
export const extrudedIcicle: TraceModule = /* @__PURE__ */ withDomainExtrusion(
  icicle as TraceModule,
);
