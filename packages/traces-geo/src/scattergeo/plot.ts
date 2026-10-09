/**
 * `scattergeo` rendering (backlog GEO3, ADR-025), following plotly.js `scattergeo/plot.js` and
 * `scattergeo/style.js` (MIT). Everything is projected to the geometry of the subplot view's base
 * state and drawn in the subplot's own viewport through `GeoSubplot.transform`:
 *
 * - **Markers and text** are scatter's own view, fed a px-space scatter calc (see
 *   `positions.ts`): symbols, sizes, colorscales, selection styles, `texttemplate`, rich text…
 *   exactly as scatter draws them. Points the projection hides are not drawn.
 * - **Lines** are the trace's path streamed through the projection, which draws each segment along
 *   its great circle, cuts it at the antimeridian and at the clip edge and resamples it (see
 *   `lines.ts`); one line primitive.
 * - **The `toself` fill** is the same path as polygons, one fill primitive under the line. As in
 *   Plotly the line of a filled trace is closed.
 *
 * A trace given by `locations` is drawn at the points of the features they name (`calc.ts`), and
 * its lines run along the great circles between them. While the features are loading it draws
 * nothing and holds `chart.ready` (`LoadingHold`); the layout pass that has them draws it.
 *
 * On a 3D globe (`projection.type: 'globe3d'`, backlog GEO8, ADR-028) markers and text are drawn
 * as above, in the subplot's 2D viewport over the globe's: the orthographic view puts each point
 * on the pixel of its place on the sphere and hides the far side. The line and the fill are not
 * projected: the line is arcs lifted above the sphere and the fill a mesh on it, built once in
 * globe coordinates and turned by the globe's matrix (`globe.ts`, lazy code loaded the first
 * time a trace draws a line or a fill on a globe; `chart.ready` waits for it). A relayout of
 * the projection type between a flat one and `'globe3d'` removes the one kind and draws the
 * other.
 *
 * ## Redraw rules
 *
 * The view remembers the view version and the calc its geometry was projected from.
 *
 * - A pan or a zoom keeps the version: every primitive gets the new transform and nothing else.
 * - A rotation, and the rebase after a zoom settles, change the version: the points are projected
 *   again, the path is streamed again, and scatter's view gets the new positions (between
 *   pipeline passes, a trace without text has only its marker positions uploaded).
 * - Interactive previews arrive through the subplot's change notification, with no pipeline run,
 *   and are handled by the same two rules.
 * - A pipeline pass marks every geo trace `plot` after it laid the subplots out, so a view cannot
 *   tell the relayout that ends a pan from an edit of the trace. Such a pass projects nothing (the
 *   positions and the path are cached by calc and version) but lets scatter's view re-read the
 *   trace, which uploads the markers and labels once more.
 */
import { toRGBA, type FullTrace, type RGBAColor } from '@mk7s/holochart-core';
import {
  createLazyFillPrimitive,
  LinePrimitive,
  loadLinesMarkers3D,
  MarkerSet,
  type DataTransform,
  type LazyFillPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import type {
  ComponentPointerEvent,
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { scatter, type ScatterCalc } from '@mk7s/holochart-traces-basic';
import { GLOBE_LIGHTING, lightGlobeMesh } from '../geo/globe-light.ts';
import { globeModule, loadGlobe } from '../geo/globe-loader.ts';
import { addToGlobe } from '../geo/globe-scene.ts';
import { LoadingHold } from '../geo/location-data.ts';
import { GEO_ORDER, geoTraceOrder } from '../geo/order.ts';
import { projectedFillRule, projectLines, projectPolygons } from '../geo/sink.ts';
import type { GeoSubplot } from '../geo/subplot.ts';
import type { ProjectedLines, ProjectedPolygons } from '../geo/types.ts';
import type { ScattergeoCalc } from './calc.ts';
import { geoPath, type GeoPath } from './lines.ts';
import { geoPositions, type GeoPositions } from './positions.ts';

/**
 * Draw order of one trace's parts above the trace's base order in the subplot's `frontplot` slot
 * (`geoTraceOrder`), where each trace has a hundredth of a unit: Plotly's order inside a scatter
 * trace group.
 */
export const SCATTERGEO_LAYER = {
  fill: 0.001,
  line: 0.002,
  markers: 0.003,
  text: 0.004,
} as const;

/**
 * Base draw order of the scattergeo trace at `index`: in the `frontplot` slot of its subplot,
 * above every base layer and every choropleth, in trace order. The slot is the same with and
 * without a choropleth on the subplot.
 */
export function scattergeoOrder(index: number): number {
  return geoTraceOrder(GEO_ORDER.frontplot, index);
}

export function hasFlag(mode: unknown, flag: string): boolean {
  return typeof mode === 'string' && mode.split('+').includes(flag);
}

function opacityOf(trace: FullTrace): number {
  return typeof trace['opacity'] === 'number' ? trace['opacity'] : 1;
}

/** Line style for the line primitive (scatter's `lineStyle`, with Plotly's miter limit of 2). */
function lineStyle(trace: FullTrace) {
  const line = (trace['line'] ?? {}) as { color?: unknown; width?: unknown; dash?: unknown };
  return {
    color:
      (typeof line.color === 'string' ? toRGBA(line.color) : null) ?? ([0, 0, 0, 1] as RGBAColor),
    width: typeof line.width === 'number' ? line.width : 2,
    dash: typeof line.dash === 'string' ? line.dash : 'solid',
    miterLimit: 2,
    opacity: opacityOf(trace),
  };
}

/** Fill color: `fillcolor`, else the line color at half opacity. */
function fillColorOf(trace: FullTrace): RGBAColor {
  const c = trace['fillcolor'];
  const rgba = typeof c === 'string' ? toRGBA(c) : null;
  if (rgba) return rgba;
  const line = (trace['line'] as { color?: unknown } | undefined)?.color;
  const l = typeof line === 'string' ? toRGBA(line) : null;
  return l ? [l[0], l[1], l[2], 0.5] : [0.5, 0.5, 0.5, 0.5];
}

/**
 * The trace as scatter's view reads it: markers and text only, `%{x}` / `%{y}` as lon / lat. A
 * trace given by `locations` has the coordinates it is drawn at as `lon` / `lat`, and its
 * locations as `location`, so that `texttemplate` fills `%{lon}`, `%{lat}` and `%{location}`.
 */
const INNER = new WeakMap<FullTrace, { lon: Float64Array | undefined; trace: FullTrace }>();
function innerTrace(trace: FullTrace, calc: ScattergeoCalc): FullTrace {
  // The coordinates of a located trace are the calc's, and are replaced when it is located.
  const lon = calc.locations ? calc.lon : undefined;
  let hit = INNER.get(trace);
  if (!hit || hit.lon !== lon) {
    const mode = String(trace['mode'] ?? '')
      .split('+')
      .filter((f) => f === 'markers' || f === 'text');
    const at = lon
      ? { x: lon, y: calc.lat, lon, lat: calc.lat, location: trace['locations'] }
      : { x: trace['lon'], y: trace['lat'] };
    hit = {
      lon,
      trace: { ...trace, mode: mode.length > 0 ? mode.join('+') : 'none', fill: 'none', ...at },
    };
    INNER.set(trace, hit);
  }
  return hit.trace;
}

/** The trace's line and fill on a globe (`globe.ts`): lazy code, like the geometry they draw. */
type GlobeChunk = typeof import('./globe.ts');

let globeChunk: GlobeChunk | null = null;
let globeLoading: Promise<void> | undefined;
let globeWarned = false;

/**
 * Load what a line or a fill on a globe is drawn with: the parts' code, the globe's geometry
 * builders and render's 3D lines (the mesh primitive loads itself). `undefined` when it is all
 * there, else a promise that settles, without rejecting, when the loads have. A failed load is
 * reported once, leaves the line and the fill undrawn, and is tried again by the next draw.
 */
function loadGlobeChunk(): Promise<void> | undefined {
  if (globeChunk) return undefined;
  globeLoading ??= Promise.all([import('./globe.ts'), loadGlobe(), loadLinesMarkers3D()]).then(
    ([chunk]) => {
      // Handed over, not imported by the chunk: it shares no module with this code (ADR-026).
      chunk.provideScattergeoGlobeDeps({ globeModule, addToGlobe, GLOBE_LIGHTING, lightGlobeMesh });
      globeChunk = chunk;
      globeLoading = undefined;
    },
    (error: unknown) => {
      globeLoading = undefined;
      if (globeWarned) return;
      globeWarned = true;
      console.warn(
        "[holochart] scattergeo: the code that draws lines and fills on a 3D globe ('globe3d') " +
          'could not be loaded; they are not drawn.',
        error,
      );
    },
  );
  return globeLoading;
}

const FULL: TraceUpdatePlan = { calc: true, plot: true, style: true, transform: true };
/** A view change with no pipeline run: nothing about the trace changed. */
const MOVE: TraceUpdatePlan = { calc: false, plot: false, style: false, transform: true };

class ScattergeoView implements TraceView<ScattergeoCalc> {
  #inner: TraceView<ScatterCalc> | undefined;
  /**
   * Primitives scatter's view added, with the draw order this view gave each (scatter orders its
   * layers after `traceRenderOrder`; they are moved into the subplot's order).
   */
  readonly #innerPrimitives = new Map<Primitive<unknown>, number>();
  #line: LinePrimitive | undefined;
  #fill: LazyFillPrimitive | undefined;
  /** The projected line and fill, kept so that a rotation allocates nothing. */
  #lineOut: ProjectedLines | undefined;
  #fillOut: ProjectedPolygons | undefined;
  #ctx: TracePlotContext<ScattergeoCalc>;
  /** The subplot's viewport, from the last pipeline pass, and its key (`GeoSubplot.viewportKey`). */
  #viewport: Viewport | undefined;
  #subplot: GeoSubplot | undefined;
  #off: (() => void) | undefined;
  /** What the drawn geometry was projected from: the positions (a calc at a view version)… */
  #positions: GeoPositions | undefined;
  /** …and, for the line and the fill, the path. */
  #path: GeoPath | undefined;
  /** Chart readiness waits here while the features of the trace's locations load. */
  readonly #hold = new LoadingHold();
  /** On a globe: the 3D viewport, the line and the fill in it, and the wait for their code. */
  #globeViewport: Viewport | undefined;
  #globe: ReturnType<GlobeChunk['createScattergeoGlobeParts']> | undefined;
  readonly #globeHold = new LoadingHold();
  #waiting: Promise<void> | undefined;
  #disposed = false;

  constructor(ctx: TracePlotContext<ScattergeoCalc>) {
    this.#ctx = ctx;
    this.#draw(ctx, FULL, true);
  }

  update(ctx: TracePlotContext<ScattergeoCalc>, plan: TraceUpdatePlan): void {
    this.#ctx = ctx;
    this.#draw(ctx, plan, true);
  }

  #follow(subplot: GeoSubplot | undefined): void {
    if (subplot === this.#subplot) return;
    this.#off?.();
    this.#subplot = subplot;
    this.#off = subplot?.onChange(() => {
      // A drag or a wheel step changed the view: redraw now, from the last context.
      this.#draw(this.#ctx, MOVE, false);
      this.#ctx.invalidate();
    });
  }

  /**
   * The subplot's 2D viewport, shared with the geo component, which decides its background (none
   * is given here, so it is kept).
   */
  #viewportOf(ctx: TracePlotContext<ScattergeoCalc>, subplot: GeoSubplot): Viewport {
    return subplot.viewport(ctx) ?? ctx.viewport;
  }

  #innerContext(
    ctx: TracePlotContext<ScattergeoCalc>,
    positions: GeoPositions,
    transform: DataTransform,
    viewport: Viewport,
  ): TracePlotContext<ScatterCalc> {
    return {
      trace: innerTrace(ctx.trace, ctx.calc),
      calc: positions.scatter,
      index: ctx.index,
      fullLayout: ctx.fullLayout,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform,
      viewport,
      ...(ctx.plotArea ? { plotArea: ctx.plotArea } : {}),
      primitives: ctx.primitives,
      add: (p, vp) => {
        this.#innerPrimitives.set(p as Primitive<unknown>, NaN);
        return ctx.add(p, vp ?? viewport);
      },
      remove: (p) => {
        this.#innerPrimitives.delete(p as Primitive<unknown>);
        ctx.remove(p);
      },
      invalidate: () => ctx.invalidate(),
      selectedPoints: ctx.selectedPoints ?? null,
    };
  }

  /** The marker set scatter's view drew, when it draws markers. */
  #markers(): MarkerSet | undefined {
    for (const p of this.#innerPrimitives.keys()) if (p instanceof MarkerSet) return p;
    return undefined;
  }

  /**
   * Bring the primitives up to date. `pass` is false for a change notification between pipeline
   * passes: the viewport is then the one of the last pass (asking the runtime for it again would
   * reset what the geo component set on it).
   */
  #draw(ctx: TracePlotContext<ScattergeoCalc>, plan: TraceUpdatePlan, pass: boolean): void {
    const { trace, calc } = ctx;
    const subplot = calc.subplot;
    this.#follow(subplot);
    this.#hold.follow(ctx, calc.locations ? subplot?.loading : undefined);
    const view = subplot?.view;
    const positions = subplot && !calc.unresolved ? geoPositions(calc, subplot) : undefined;
    // No subplot, a projection still loading, or nothing to place: draw nothing.
    if (!subplot || !view || !positions) {
      this.#clear(ctx);
      return;
    }
    if (pass || !this.#viewport) {
      const next = this.#viewportOf(ctx, subplot);
      // Another viewport (the trace moved to another subplot): what is drawn is in the old one.
      if (this.#viewport && next !== this.#viewport) this.#clear(ctx);
      this.#viewport = next;
    }
    const viewport = this.#viewport;
    const transform = subplot.transform;
    const projected = positions !== this.#positions;
    const order = scattergeoOrder(ctx.index);

    // Markers and text: scatter's view.
    const innerCtx = this.#innerContext(ctx, positions, transform, viewport);
    const markers = this.#markers();
    if (!this.#inner) {
      this.#inner = scatter.plot!.create(innerCtx);
    } else if (projected && plan === MOVE && markers && !hasFlag(trace['mode'], 'text')) {
      // A rotation preview moved the markers and changed nothing else about them: upload their
      // positions only. Scatter's view would also resolve and upload every marker's style again
      // (three times the work for 100,000 plain markers, far more with a color per point).
      markers.update({ x: positions.x, y: positions.y });
      this.#inner.update(innerCtx, MOVE);
    } else if (projected || plan.calc || plan.plot) {
      this.#inner.update(innerCtx, { ...FULL, ...(plan.selection ? { selection: true } : {}) });
    } else {
      this.#inner.update(innerCtx, plan);
    }
    for (const [p, given] of this.#innerPrimitives) {
      const r = p.object.renderOrder;
      // Scatter has not set it again since this view moved it.
      if (r === given) continue;
      const moved = order + (r - Math.floor(r)) * 0.01;
      p.object.renderOrder = moved;
      this.#innerPrimitives.set(p, moved);
    }

    const lines = hasFlag(trace['mode'], 'lines');
    const fill = trace['fill'] === 'toself';
    const path = lines || fill ? geoPath(calc, trace['connectgaps'] === true, fill) : undefined;
    const stale = projected || path !== this.#path;
    // On a globe the line and the fill are not projected: they are on the sphere.
    const flat = !subplot.globe;
    if (flat) this.#clearGlobe(ctx);
    // A rotation, a zoom or a pan of the globe is its matrix: nothing of them is touched.
    else if (plan !== MOVE) this.#drawOnGlobe(ctx, subplot, path, lines, fill, order, pass);

    // Line.
    if (flat && lines && path) {
      const created = !this.#line;
      if (!this.#line) {
        this.#line = new LinePrimitive(ctx.primitives);
        ctx.add(this.#line, viewport);
      }
      if (stale || created) {
        const out = subplot.toBase(
          projectLines(view.projection, view.size.height, path.lines, this.#lineOut),
        );
        this.#lineOut = out;
        this.#line.update({
          x: out.x.subarray(0, out.vertexCount),
          y: out.y.subarray(0, out.vertexCount),
          starts: out.starts.subarray(0, out.startCount),
          ...lineStyle(trace),
        });
      } else if (plan.plot || plan.style) {
        this.#line.update(lineStyle(trace));
      }
      this.#line.setTransform(transform);
      this.#line.object.renderOrder = order + SCATTERGEO_LAYER.line;
    } else if (this.#line) {
      ctx.remove(this.#line);
      this.#line = undefined;
    }

    // Fill.
    if (flat && fill && path?.polygons) {
      const style = { color: fillColorOf(trace), opacity: opacityOf(trace) };
      if (stale || !this.#fill) {
        const out = subplot.toBase(
          projectPolygons(view.projection, view.size.height, path.polygons, this.#fillOut),
        );
        this.#fillOut = out;
        const geometry = {
          x: out.x.subarray(0, out.vertexCount),
          y: out.y.subarray(0, out.vertexCount),
          rings: out.rings.subarray(0, out.ringCount),
          polygons: out.polygons.subarray(0, out.polygonCount),
          // Four projections fold rings back on themselves; those fill by the nonzero rule.
          fillRule: projectedFillRule(view.projection),
        };
        if (!this.#fill) {
          this.#fill = createLazyFillPrimitive(ctx.primitives, { ...geometry, ...style });
          ctx.add(this.#fill, viewport);
        } else {
          this.#fill.update({ ...geometry, ...style });
        }
      } else if (plan.plot || plan.style) {
        this.#fill.update(style);
      }
      this.#fill.setTransform(transform);
      this.#fill.object.renderOrder = order + SCATTERGEO_LAYER.fill;
    } else if (this.#fill) {
      ctx.remove(this.#fill);
      this.#fill = undefined;
    }

    this.#positions = positions;
    this.#path = path;
  }

  /**
   * The line and the fill of a trace on a globe (`globe.ts`), once their code has loaded. `pass`
   * as for {@link #draw}.
   */
  #drawOnGlobe(
    ctx: TracePlotContext<ScattergeoCalc>,
    subplot: GeoSubplot,
    path: GeoPath | undefined,
    lines: boolean,
    fill: boolean,
    order: number,
    pass: boolean,
  ): void {
    // Asked for in every pass, and only in a pass: between two (when the globe's code has
    // loaded) it is the one of the last pass, or the runtime would keep it a pass too long.
    if (pass) this.#globeViewport = subplot.globeViewport(ctx);
    const viewport = this.#globeViewport;
    // Nothing of the trace is on the sphere, or the viewport is a hand-built context's stand-in.
    if (!path || viewport?.kind !== '3d') {
      this.#globe?.clear(ctx);
      this.#wait(ctx, undefined);
      return;
    }
    const chunk = globeChunk;
    if (!chunk) {
      this.#wait(ctx, loadGlobeChunk());
      return;
    }
    this.#wait(ctx, undefined);
    this.#globe ??= chunk.createScattergeoGlobeParts();
    this.#globe.draw(ctx, {
      viewport,
      path,
      lines,
      fill,
      lineStyle: lineStyle(ctx.trace),
      fillStyle: { color: fillColorOf(ctx.trace), opacity: opacityOf(ctx.trace) },
      lineOrder: order + SCATTERGEO_LAYER.line,
      fillOrder: order + SCATTERGEO_LAYER.fill,
    });
  }

  /** The subplot is not a globe (any more): nothing of the trace is on a sphere. */
  #clearGlobe(ctx: TracePlotContext<ScattergeoCalc>): void {
    this.#globe?.clear(ctx);
    this.#globe = undefined;
    this.#globeViewport = undefined;
    this.#wait(ctx, undefined);
  }

  /** Hold `chart.ready` until `loading` has settled and the trace is drawn with what arrived. */
  #wait(ctx: TracePlotContext<ScattergeoCalc>, loading: Promise<void> | undefined): void {
    if (!loading) {
      this.#waiting = undefined;
      this.#globeHold.follow(ctx, undefined);
      return;
    }
    // One promise per load: the hold is the same from draw to draw while it is pending.
    if (this.#waiting) return;
    const waiting: Promise<void> = loading.then(() => {
      if (this.#disposed || this.#waiting !== waiting) return;
      this.#waiting = undefined;
      this.#globeHold.follow(this.#ctx, undefined);
      // A failed load leaves the line undrawn; the chart is ready all the same.
      if (!globeChunk) return;
      this.#draw(this.#ctx, FULL, false);
      this.#ctx.invalidate();
    });
    this.#waiting = waiting;
    this.#globeHold.follow(ctx, waiting);
  }

  #clear(ctx: TracePlotContext<ScattergeoCalc>): void {
    this.#clearGlobe(ctx);
    if (this.#inner) {
      this.#inner.dispose?.();
      for (const p of this.#innerPrimitives.keys()) ctx.remove(p);
      this.#innerPrimitives.clear();
      this.#inner = undefined;
    }
    if (this.#line) ctx.remove(this.#line);
    if (this.#fill) ctx.remove(this.#fill);
    this.#line = undefined;
    this.#fill = undefined;
    this.#positions = undefined;
    this.#path = undefined;
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    return this.#inner?.handlePointer?.(event) === true;
  }

  dispose(): void {
    this.#disposed = true;
    this.#off?.();
    this.#off = undefined;
    this.#subplot = undefined;
    this.#inner?.dispose?.();
  }
}

export const scattergeoRenderer: TraceRenderer<ScattergeoCalc> = {
  create: (ctx) => new ScattergeoView(ctx),
};
