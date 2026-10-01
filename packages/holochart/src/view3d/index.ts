/**
 * The full bundle's 2.5D support (plan E8.9, E9.10): the `layout.view3d` component and the trace
 * modules extended with `depth`, `bevel` and `material` (core `withExtrusion`), with their
 * extruders installed (render's lazily loaded extrusion primitive). Like 3D, 2.5D is not in the
 * `basic` bundle: the trace packages declare no extrusion attributes of their own, and the
 * runtime, the axes component and render keep only generic hooks.
 *
 * Partial bundles opt in the same way:
 *
 * ```ts
 * import { register } from '@mk7s/holochart-runtime';
 * import { bar, setBarExtruder } from '@mk7s/holochart-traces-basic';
 * import { withExtrusion } from '@mk7s/holochart-core';
 * import { extrudeRects } from '@mk7s/holochart-render';
 * import { view3dComponent } from '@mk7s/holochart';
 * setBarExtruder(extrudeRects);
 * register(withExtrusion(bar), view3dComponent);
 * ```
 *
 * ## Giving another trace depth
 *
 * 1. **Attributes.** Outside the `basic` bundle's packages (treemap, icicle), spread core's
 *    `extrusionAttributes` into the schema and call `supplyExtrusionDefaults(ctx)` from
 *    `supplyDefaults`. In `traces-basic` (pie, area), extend the module here instead
 *    (`withExtrusion`, replaced in {@link withView3D}), so `basic` stays small. Funnel, waterfall
 *    and heatmap are extended here too (`EXTRUDED`): the 2D script-tag build has no room for the
 *    attributes' defaults code in each package.
 * 2. **Drawing.** Rect-like traces: after updating their rect primitive, call render's
 *    `extrudeRects(ctx, rects, rectData, [labels, errorBars])` (in `traces-basic`, through an
 *    installed hook like `setBarExtruder`): it loads the 2.5D chunk, hides the flat rects and draws
 *    the prisms. Other shapes: build `sectorOutline` / `polygonOutline` outlines in data space and
 *    draw them with an `ExtrusionPrimitive` (`outlines`; `loadExtrusionModule` + `loadMeshModule`
 *    first), hiding the flat primitive while extruded. Heatmaps and scatter fills call render's
 *    `extrudeHeatmap` / `extrudeFills` (the latter through {@link withExtrudedFill}, which records
 *    what a scatter view adds, so `traces-basic` needs no hook); bar-like traces hand their
 *    connectors to the bar extruder as `ctx.lift`.
 * 3. **Interaction** follows: under `layout.view3d` the pointer is mapped onto the plot plane, or
 *    onto the prism under it (`ExtrusionPrimitive.raycast`), so a trace's flat hover and selection
 *    stay exact. Domain traces (pie, treemap, icicle) draw in the overlay, which the figure shares:
 *    they get a view of their own instead (`tilt`, `perspective`) through
 *    {@link withDomainExtrusion} (`domain.ts`), which records what the trace view adds and hands it
 *    to render's `extrudeDomain` (prisms and projected labels; pointer mapped onto the flat trace).
 */
import { attr, supplyExtrusionDefaults, withExtrusion } from '@mk7s/holochart-core';
import { extrudeFills, extrudeRects, type Primitive } from '@mk7s/holochart-render';
import type {
  Registrable,
  TraceModule,
  TracePlotContext,
  TraceView,
} from '@mk7s/holochart-runtime';
import { bar, pie, scatter, setBarExtruder } from '@mk7s/holochart-traces-basic';
import { funnel, waterfall } from '@mk7s/holochart-traces-finance';
import { icicle, treemap } from '@mk7s/holochart-traces-hier';
import { heatmap } from '@mk7s/holochart-traces-sci';
import { view3dComponent } from './component.ts';
import { extrudedIcicle, extrudedPie, extrudedTreemap } from './domain.ts';

export { view3dAttributes, view3dComponent, view3dEnabled } from './component.ts';
export { extrudedIcicle, extrudedPie, extrudedTreemap } from './domain.ts';

/** `bar` with `depth`, `bevel` and `material` (plan E9.10): the full bundle registers it. */
export const extrudedBar: TraceModule = /* @__PURE__ */ withExtrusion(bar as TraceModule);

/** A `depth` attribute described for one trace type (the description is stripped in builds). */
function depthAttribute(description: string) {
  return attr.any({ dflt: 0, editType: 'plot', description });
}

/**
 * `module` extended with the extrusion attributes, its own `depth` attribute if given; `filled`:
 * they apply to filled traces only (scatter: other traces keep their defaulted attributes).
 */
function extruded(
  module: TraceModule,
  depth?: ReturnType<typeof depthAttribute>,
  filled?: boolean,
): TraceModule {
  const m = withExtrusion(module);
  const { children, ...meta } = m.schema;
  return {
    ...m,
    ...(depth && { schema: attr.object({ ...children, depth }, meta) }),
    ...(filled && {
      supplyDefaults(traceIn, traceOut, ctx) {
        module.supplyDefaults(traceIn, traceOut, ctx);
        const fill = (traceOut as { fill?: unknown }).fill;
        if (traceOut.visible !== false && fill && fill !== 'none') supplyExtrusionDefaults(ctx);
      },
    }),
  };
}

/**
 * `module`'s views, each drawing its fill as a slab when the trace has `depth` (area, plan E8.9):
 * the primitives a view adds are recorded and handed to render's `extrudeFills` after every
 * update, which extrudes the fill and lifts the others (lines, markers, labels, error bars) onto
 * the slab's front.
 */
function withExtrudedFill(module: TraceModule): TraceModule {
  const plot = module.plot!;
  return {
    ...module,
    plot: {
      create(ctx) {
        const added = new Set<Primitive<unknown>>();
        const capture = (c: TracePlotContext): TracePlotContext => ({
          ...c,
          add: (p, viewport) => (added.add(p as Primitive<unknown>), c.add(p, viewport)),
        });
        const view = plot.create(capture(ctx));
        const out: TraceView = {
          update(c, plan) {
            view.update(capture(c), plan);
            extrudeFills(c, out, added);
          },
          handlePointer: (e) => view.handlePointer?.(e),
          dispose: () => view.dispose?.(),
        };
        extrudeFills(ctx, out, added);
        return out;
      },
    },
  };
}

/**
 * `scatter` with `depth`, `bevel` and `material` for its fill (area, plan E8.9): the full bundle
 * registers it.
 */
export const extrudedScatter: TraceModule = /* @__PURE__ */ withExtrudedFill(
  extruded(
    scatter as TraceModule,
    depthAttribute(
      "Fill extrusion (Holochart extension, 2.5D, with `fill`): the thickness in CSS px of the slab the fill becomes, or a percentage of the plot area's width; lines, markers and labels are drawn on its front face. Filled traces share the depth, so stacked areas form layers of one slab. 0 (default) draws the trace flat.",
    ),
    true,
  ),
);

/** Trace modules the full bundle registers extended (plan E8.9, E9.10). */
const EXTRUDED = /* @__PURE__ */ new Map<unknown, TraceModule>([
  [bar, extrudedBar],
  [funnel, extruded(funnel as TraceModule)],
  [waterfall, extruded(waterfall as TraceModule)],
  [
    heatmap,
    extruded(
      heatmap as TraceModule,
      depthAttribute(
        "Cells as columns (Holochart extension, 2.5D): the height in CSS px of a column at `zmax` (or a percentage of the mean cell width, `'300%'`); heights grow linearly from 0 (from `zmin` with negative values), colored like the cells. 0 (default) draws the heatmap flat.",
      ),
    ),
  ],
  [scatter, extrudedScatter],
  // Domain traces, with a view of their own (`domain.ts`).
  [pie, extrudedPie],
  [treemap, extrudedTreemap],
  [icicle, extrudedIcicle],
]);

/**
 * `modules` with the extrudable traces (`bar`, `funnel`, `waterfall`, `heatmap`, `scatter`, `pie`,
 * `treemap`, `icicle`) replaced by their extended modules, and the `layout.view3d` component; installs the bar extruder.
 * The full bundle's built-in list.
 */
export function withView3D(modules: readonly Registrable[]): Registrable[] {
  setBarExtruder(extrudeRects);
  return [...modules.map((m) => EXTRUDED.get(m) ?? m), view3dComponent];
}
