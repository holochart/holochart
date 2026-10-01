/**
 * Lazy loading of render's 2.5D code (plan E8.9): the extrusion primitive and the 2.5D view's
 * projector (`layout.view3d`) live in their own chunk (`extrusion-lazy.ts`), fetched with a dynamic
 * `import()` the first time a chart has a 2.5D view or an extruded trace (`depth`; then with the
 * mesh chunk the prisms draw with). Flat charts never load it. The script-tag build inlines
 * it into its 3D add-on, which hands it to this loader (see `scripts/build/iife-split.ts`); without
 * the add-on the load fails once, with one warning, and charts stay flat.
 *
 * Only the loader and the types of the lazy modules are exported statically (package index).
 */
import { Object3D } from 'three';
import type { DataTransform, Primitive } from '../types.ts';
import type { ExtrusionHost, ExtrusionPrimitive, LiftedPrimitive } from './extrusion.ts';
import type { DomainHost, DomainView } from './extrusion-domain.ts';
import { LazyFillPrimitive } from './fill-loader.ts';
import type { HeatmapPrimitive } from './heatmap.ts';
import { loadMeshModule, meshModuleLoaded, type MeshModule } from './mesh-loader.ts';
import type { RectData } from './rect.ts';

/** The lazily loaded 2.5D module (`extrusion-lazy.ts`). */
export type ExtrusionModule = typeof import('./extrusion-lazy.ts');

let loaded: ExtrusionModule | null = null;
let loading: Promise<ExtrusionModule> | null = null;
let warned = false;

/**
 * Load the 2.5D code once: concurrent callers share the request; a failed load warns once and is
 * retried by the next call.
 */
export function loadExtrusionModule(): Promise<ExtrusionModule> {
  loading ??= import('./extrusion-lazy.ts').then(
    (mod) => (loaded = mod),
    (error: unknown) => {
      loading = null;
      if (!warned) {
        warned = true;
        console.warn(
          '[holochart] the 2.5D view and extruded traces could not load, drawing flat (script tags: load holochart-3d.iife.min.js after holochart.iife.min.js):',
          error,
        );
      }
      throw error;
    },
  );
  return loading;
}

/** The 2.5D module if it has loaded, else `null` (synchronous paths). */
export function extrusionModuleLoaded(): ExtrusionModule | null {
  return loaded;
}

const noop = (): void => undefined;

/** The extrusion primitive of each flat rect primitive (or trace view, see {@link extrude}). */
const extruded = new WeakMap<object, ExtrusionPrimitive>();

/**
 * A trace view's hook for extruded rects (plan E8.9, E9.10; bars install it with
 * `setBarExtruder`): call it after every update of `rects` with the data just given to them (and
 * `host.lift`, more primitives to lift: bar-like traces' connectors). Once
 * the 2.5D and mesh chunks have loaded it is `syncExtrudedRects`, which creates, updates or (for a
 * trace without `depth`) removes the extrusion primitive of `rects` — the flat rects are hidden
 * while it draws them — and lifts `lift` (labels, error bars) onto the front faces. Before, a trace
 * with `depth` starts the load and adds a placeholder primitive whose `ready` covers it (so
 * `chart.ready` and image export wait), then draws with the loaded code.
 */
export function extrudeRects(
  host: ExtrusionHost,
  rects: { readonly object: Object3D },
  data: Partial<RectData>,
  lift: readonly LiftedPrimitive[],
): void {
  const all = host.lift ? [...lift, ...host.lift] : lift;
  extrude(host, rects, (mod, mesh, prev) =>
    mod.syncExtrudedRects(prev, host, rects, data, all, mesh),
  );
}

/**
 * A heatmap view's hook for cells as columns (plan E8.9; `syncHeatmapColumns` once loaded, see
 * {@link extrudeRects}): call it after every update of the view's `heatmap` (undefined when it
 * draws none), with `lift` (the cell labels). `view` keys the view's extrusion primitive.
 */
export function extrudeHeatmap(
  host: ExtrusionHost,
  view: object,
  heatmap: HeatmapPrimitive | undefined,
  lift: readonly LiftedPrimitive[],
): void {
  extrude(host, view, (mod, mesh, prev) => mod.syncHeatmapColumns(prev, host, heatmap, lift, mesh));
}

/**
 * A scatter view's hook for filled areas as slabs (plan E8.9; `syncExtrudedFills` once loaded, see
 * {@link extrudeRects}): call it after every update of the view with the primitives it has added
 * (removed ones are skipped): its fill is extruded, the others are drawn on the slab's front. Waits
 * for the fill's own code too. `view` keys the view's extrusion primitive.
 */
export function extrudeFills(
  host: ExtrusionHost & { readonly index?: number },
  view: object,
  added: Iterable<Primitive<unknown>>,
): void {
  let fill: LazyFillPrimitive | undefined;
  for (const p of added) if (p instanceof LazyFillPrimitive && p.object.parent) fill = p;
  extrude(
    host,
    view,
    (mod, mesh, prev) => mod.syncExtrudedFills(prev, host, fill, added, mesh),
    fill && !fill.fill ? fill.ready : undefined,
  );
}

/**
 * Run `sync` (the lazily loaded side of an extruder) with the extrusion primitive of `key`, or,
 * for a trace with `depth` while the 2.5D and mesh code (and `pending`) load, add a placeholder
 * whose `ready` covers the load and then syncs.
 */
function extrude(
  host: ExtrusionHost,
  key: object,
  sync: (
    mod: ExtrusionModule,
    mesh: MeshModule,
    prev: ExtrusionPrimitive | undefined,
  ) => ExtrusionPrimitive | undefined,
  pending?: Promise<unknown>,
): void {
  const mesh = meshModuleLoaded();
  if (loaded && mesh && !pending) {
    const p = sync(loaded, mesh, extruded.get(key));
    if (p) extruded.set(key, p);
    else extruded.delete(key);
    return;
  }
  if (!host.trace['depth']) return;
  const wait: Primitive<never> & { ready: Promise<void> } = {
    object: new Object3D(),
    ready: Promise.all([loadExtrusionModule(), loadMeshModule(), pending])
      .then(() => extrude(host, key, sync), noop)
      .finally(() => host.remove(wait)),
    update: noop,
    setTransform: noop as (t: DataTransform) => void,
    setViewport: noop,
    dispose: noop,
  };
  host.add(wait);
}

/**
 * A domain trace view's hook (pie, treemap, icicle; plan E8.9, E9.12; the full bundle's wrapper
 * calls it): after every update of the trace's own view, with the primitives it has added and,
 * for pies, the item of each slice (`items`, for per-slice `depth`). Once the 2.5D and mesh chunks
 * have loaded it is `syncDomain` (`extrusion-domain.ts`); before, a trace with `depth` or `tilt`
 * starts the load behind a placeholder (see {@link extrudeRects}).
 */
export function extrudeDomain(
  host: DomainHost,
  view: DomainView,
  added: Iterable<Primitive<unknown>>,
  items?: ArrayLike<number>,
): void {
  const t = host.trace;
  const on = { trace: { depth: t['depth'] || t['tilt'] }, add: host.add, remove: host.remove };
  extrude(on as unknown as ExtrusionHost, view, (mod, mesh, prev) =>
    mod.syncDomain(prev, host, view, added, mesh, items),
  );
}
