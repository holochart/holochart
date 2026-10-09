/**
 * The geo component (backlog GEO2): draws every geo subplot's base layers — the ocean, land and
 * lakes as batched fills; subunits, countries, coastlines and rivers, the graticule and the frame
 * as lines, each layer one primitive (see `base-layers.ts` and `order.ts`) — and runs its
 * interactions, following plotly.js `Geo.updateFx` and `zoom.js`:
 *
 * - **Drag** inside the subplot (`dragmode: 'pan'` or `'zoom'`): pans a scoped map, turns a world
 *   map in longitude and moves it up and down, turns a clipped globe in longitude and latitude
 *   (`interact.ts`, by {@link GeoView.mode}). The cursor over the map says so (`move`).
 * - **Press and release** without a move: a click on the points under the pointer
 *   ({@link GeoComponentView.clickThrough}); a tap is that click, after the tap's hover.
 * - **Wheel** zooms about the pointer when `config.scrollZoom` allows `geo` (the default).
 * - **Touch**: one finger drags as above; two fingers pinch-zoom about their middle.
 * - **Box / lasso selection** (`dragmode: 'select' | 'lasso'`): run by the runtime's selection
 *   through {@link GeoComponentView.selectArea}; the map does not move, and the wheel is the
 *   page's (Plotly attaches its geo zoom in pan mode only). The cursor is a crosshair.
 * - **Double-click**: back to the first drawn view (`doubleclick` event).
 *
 * Every step previews through {@link GeoView.set} and {@link GeoSubplot.notify} (the subplot's
 * traces follow without a pipeline run) and emits `relayouting`. When the pointer is released, or
 * the wheel has rested, one GUI relayout commits the view with Plotly's keys
 * (`geo.projection.rotation.lon`, `geo.center.lat`, `geo.projection.scale`, …).
 *
 * A layout pass in the middle of a gesture (new data, a resize, the relayout that commits the wheel
 * zoom before a drag) builds the subplot a new view from the layout, which does not have the
 * gesture yet. The new view then takes up the view the old one had (`carryGeoViewState`), and the
 * gesture is anchored again in it where the pointer last was, so it goes on as if nothing had
 * happened. Only another kind of map (a new projection type) starts from what the layout says.
 *
 * ## When geometry is projected (ADR-025)
 *
 * Each layer remembers the {@link GeoView.version} and the geometry it was projected from. A pan
 * or a zoom leaves both alone, so a redraw only hands the primitives the subplot's transform. A
 * rotation changes the version, and every layer is projected again. While a gesture is under way
 * on a map of `resolution: 50`, what has to be projected is projected from the 110m basemap,
 * which a frame can afford. When the gesture ends the layers go back to 50m one per frame, lines
 * first, then fills. The subplot's traces are told of both (`GeoSubplot.gesture`, `.quick`), so a
 * choropleth swaps its regions the same way and returns to them when the gesture ends. A zoom that has settled also makes the view's state the new base
 * ({@link GeoView.rebase}), because curves resampled at the old scale drift: until its turn comes
 * a layer keeps its geometry and is carried to the new base by the transform it had.
 *
 * The basemap loads lazily. `chart.ready` waits for it through a placeholder primitive; a load
 * that fails is reported once, and the subplot is drawn without the data layers. The code of a
 * projection of `d3-geo-projection` loads lazily too, and `chart.ready` waits for it the same way
 * (`projectionLoad`): the pass that follows the load builds the view, and only then is the basemap
 * asked for. So `ready`, every update promise and `toImage` resolve with the map drawn, also on a
 * page whose first chart is the offscreen one of an export.
 *
 * ## The 3D globe (backlog GEO8, ADR-028)
 *
 * A subplot of `projection.type: 'globe3d'` has the orthographic view, and everything above
 * applies to it but the projecting: its layers are sphere meshes and 3D lines in the globe's own
 * 3D viewport (`globe-layers.ts`), parented under one group whose matrix the subplot sets from
 * the view. So on a globe
 *
 * - a rotation, a pan or a zoom builds nothing and updates no primitive: `#sync` finds every
 *   layer as it left it. There is no 110m swap while a gesture turns a 50m globe and no staged
 *   return after it; a zoom that settles still makes the view's state the new base, for what the
 *   subplot's traces position in px;
 * - a layer's geometry is built when its data is first there: the body and the graticule in the
 *   first pass, the basemap's layers in the task in which the basemap arrives (which is after
 *   the first frame unless it was loaded already), and kept for every later globe of the page.
 *   While the 50m basemap of a `resolution: 50` globe is on its way, the 110m layers are drawn if
 *   that basemap happens to be loaded; `chart.ready` waits for the 50m one all the same;
 * - the frame is the one layer that stays a 2D line in the 2D viewport: the limb of a globe is
 *   a circle on screen whatever the rotation, so it is the unit circle, placed by a transform.
 *
 * The globe draws with three lazy chunks: the package's globe geometry and render's meshes and 3D
 * lines. `chart.ready` waits for them through a placeholder primitive, and nothing of the subplot
 * is drawn until they are there. When one cannot be loaded, a warning says so once and the
 * subplot is drawn as the flat orthographic map it also is, by the 2D path; every later layout
 * pass tries the load again.
 */
import type { FullLayout } from '@mk7s/holochart-core';
import { toRGBA } from '@mk7s/holochart-core';
import {
  createLazyFillPrimitive,
  LinePrimitive,
  type DataTransform,
  type LazyFillPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import type {
  ComponentDrawContext,
  ComponentModule,
  ComponentPointerEvent,
  ComponentView,
  SelectArea,
} from '@mk7s/holochart-runtime';
import type { MultiLineString } from 'geojson';
import { Matrix4, Object3D } from 'three';
import { loadBasemap, peekBasemap, type BasemapOptions } from '../basemap/index.ts';
import {
  baseLayerGeometry,
  baseLayerStyle,
  isDataLayer,
  isFillLayer,
  needsBasemap,
  needsBasemapExtras,
  settleOrder,
  shownBaseLayers,
  SPHERE,
  type BaseLayerName,
} from './base-layers.ts';
import { laidOutGeoSubplots, projectionLoad, type GeoCalc } from './cross-trace.ts';
import { geoSubplotRect } from './domain.ts';
import type { GlobeLayers } from './globe-layers.ts';
import { globeLayersModule, loadGlobeLayers } from './globe-layers-loader.ts';
import { graticuleLines } from './graticule.ts';
import {
  carryGeoViewState,
  clampGeoView,
  geoRelayout,
  geoResetRelayout,
  geoWheelFactor,
  moveGeoGesture,
  saveGeoViewInitial,
  startGeoGesture,
  zoomGeoView,
  type GeoGesture,
  type GeoViewInitial,
} from './interact.ts';
import { geoLayoutOf, geoOf, geoSubplotIds, isGeoTrace } from './layout-defaults.ts';
import { geoHasChoropleth, geoOrder } from './order.ts';
import { LoadingHold } from './location-data.ts';
import { isProjectionReady } from './projections.ts';
import { projectedFillRule, projectLines, projectPolygons, type GeoInput } from './sink.ts';
import { GeoSubplot } from './subplot.ts';
import type {
  BasemapLayers,
  FullGeoLayout,
  GeoResolution,
  ProjectedLines,
  ProjectedPolygons,
} from './types.ts';
import { createGeoView, type GeoView, type GeoViewState } from './view.ts';

/** A wheel zoom counts as one gesture until the wheel rests this long (ms). */
const WHEEL_REST = 200;

/** The resolution a gesture projects from, and the one that is too slow to (ADR-025). */
const QUICK_RESOLUTION: GeoResolution = 110;
const SLOW_RESOLUTION: GeoResolution = 50;

const EMPTY = new Float64Array(0);
const NO_STARTS = new Uint32Array(0);

/** The pieces of the circle a globe's frame is drawn as: half a degree each. */
const CIRCLE_STEPS = 720;
/** Marks a frame layer that holds the unit circle of a globe and not a projection of the sphere. */
const CIRCLE: GeoInput = { type: 'Sphere' };
let circle: { x: Float64Array; y: Float64Array } | undefined;

/**
 * The unit circle, closed: the frame of a globe, whose limb is a circle on screen at every
 * rotation. A transform gives it the globe's radius and centre, so it is never projected.
 */
function unitCircle(): { x: Float64Array; y: Float64Array } {
  if (!circle) {
    const x = new Float64Array(CIRCLE_STEPS + 1);
    const y = new Float64Array(CIRCLE_STEPS + 1);
    for (let i = 0; i <= CIRCLE_STEPS; i++) {
      const angle = ((i % CIRCLE_STEPS) / CIRCLE_STEPS) * 2 * Math.PI;
      x[i] = Math.cos(angle);
      y[i] = Math.sin(angle);
    }
    circle = { x, y };
  }
  return circle;
}

/** Scratch for a globe's matrix. */
const MATRIX = new Matrix4();

/** Whether the failure to load the globe's code has been reported. */
let globeWarned = false;

/** Subplots laid out alone (no visible trace on them), per layout. */
const ALONE = new WeakMap<FullLayout, Map<string, GeoSubplot>>();

/** Basemap requests whose failure has been reported. */
const WARNED = new Set<string>();

/**
 * The laid-out subplot `id` of the current pass: the one the geo traces' `crossTraceLayout` built,
 * else the one on a trace's calc, else one built here for a subplot none of whose traces is drawn
 * (`visible: 'legendonly'`). `previous` is that subplot's view in the last pass, which a subplot
 * built here continues.
 */
export function resolveGeoSubplot(
  ctx: ComponentDrawContext,
  id: string,
  previous?: GeoView,
): GeoSubplot | undefined {
  const laid = laidOutGeoSubplots(ctx.fullLayout)?.get(id);
  if (laid) return laid;
  for (let i = 0; i < ctx.fullData.length; i++) {
    const trace = ctx.fullData[i]!;
    if (trace.visible !== true || !isGeoTrace(trace) || geoOf(trace) !== id) continue;
    const calc = ctx.calcdata?.(i) as GeoCalc | undefined;
    if (calc?.subplot) return calc.subplot;
  }
  let alone = ALONE.get(ctx.fullLayout);
  if (!alone) ALONE.set(ctx.fullLayout, (alone = new Map()));
  let sp = alone.get(id);
  if (!sp) {
    const layout = geoLayoutOf(ctx.fullLayout, id);
    const rect = geoSubplotRect(ctx.fullLayout, id, ctx.plotArea);
    if (!layout || !rect) return undefined;
    const type = layout.projection.type;
    let view: GeoView | undefined;
    if (isProjectionReady(type)) {
      view = createGeoView(
        layout,
        { width: rect.width, height: rect.height },
        previous ? { previous } : {},
      );
    } else {
      // The traces' layout step loads a projection's code; no trace takes part in it here.
      void projectionLoad(type, ctx.chart);
    }
    sp = new GeoSubplot({ id, layout, rect, view });
    alone.set(id, sp);
  }
  return sp;
}

/** `outer(inner(p))` of two transforms in x and y. */
function compose(outer: Readonly<DataTransform>, inner: Readonly<DataTransform>): DataTransform {
  return {
    scaleX: inner.scaleX * outer.scaleX,
    scaleY: inner.scaleY * outer.scaleY,
    offsetX: inner.offsetX * outer.scaleX + outer.offsetX,
    offsetY: inner.offsetY * outer.scaleY + outer.offsetY,
  };
}

/**
 * A primitive that draws nothing and whose `ready` is a load (of a basemap, of the globe's code):
 * chart readiness waits for the `ready` promises of primitives, so `chart.ready` and image export
 * resolve once the map is drawn (the way lazily loaded component views are waited for).
 */
class PendingBasemap implements Primitive<never> {
  readonly object = new Object3D();
  readonly ready: Promise<void>;
  constructor(ready: Promise<void>) {
    this.ready = ready;
    this.object.visible = false;
  }
  update(): void {}
  setTransform(): void {}
  setViewport(): void {}
  dispose(): void {}
}

/** What a layer's primitive was last built from. */
interface LayerState {
  /** The geometry in the primitive, in degrees; its identity tells a 110m layer from a 50m one. */
  source: GeoInput | undefined;
  /** The {@link GeoView.version} the geometry fits. */
  version: number;
  /**
   * Set when the geometry was projected at an older base than `version` names: the transform that
   * takes it to that base. The layer is exact where it is, and waits its turn to be projected at
   * the new scale.
   */
  carry: DataTransform | undefined;
  /** {@link BaseLayerStyle.key} of the style the primitive has. */
  style: string;
}

type Layer = LayerState &
  (
    | { readonly fill: true; readonly primitive: LazyFillPrimitive; out?: ProjectedPolygons }
    | { readonly fill: false; readonly primitive: LinePrimitive; out?: ProjectedLines }
  );

/** What the view keeps of one subplot from pass to pass. */
class SubplotState {
  readonly layers = new Map<BaseLayerName, Layer>();
  /** The graticules, kept while the attributes they are made from stay the same. */
  readonly graticules = new Map<string, { key: string; lines: MultiLineString }>();
  /** The layers of a 3D globe, in {@link globeViewport}; `layers` then has the frame alone. */
  globe: GlobeLayers | undefined;
  viewport: Viewport | undefined;
  /** The 3D viewport of a globe, under {@link viewport}. */
  globeViewport: Viewport | undefined;
  hasChoropleth = false;
  /** The view a double-click returns to, and the scope it was saved for (Plotly saves again). */
  initial: GeoViewInitial | undefined;
  scope: string | undefined;
  /** A drag or a pinch is under way. */
  dragging = false;
  /** A wheel zoom is under way: the timer that ends it when the wheel rests. */
  wheel: ReturnType<typeof setTimeout> | undefined;
  wheelMoved = false;
  /** Layers waiting to be projected at the figure's resolution, one per frame. */
  queue: BaseLayerName[] = [];
  /** Chart readiness waits here while the code of the subplot's projection loads. */
  readonly projecting = new LoadingHold();

  get gesture(): boolean {
    return this.dragging || this.wheel !== undefined;
  }
}

/** A drag or a pinch from where it began. */
interface Drag {
  readonly id: string;
  /** The view the gesture is anchored in; a layout pass replaces it. */
  view: GeoView;
  gesture: GeoGesture;
  /** What a cancelled gesture goes back to. */
  start: GeoViewState;
  moved: boolean;
  zoomed: boolean;
  /**
   * The distance between the two fingers of a pinch when the gesture was anchored, in px; 0 for a
   * drag. The zoom of a pinch is measured from it, so it is taken anew with every anchor.
   */
  span0: number;
  /**
   * Where the pointer (or the middle of a pinch) was at the last step, container px, and how far
   * apart the fingers were: where the gesture is anchored again when its view is replaced.
   */
  x: number;
  y: number;
  span: number;
}

interface BasemapLoad {
  readonly promise: Promise<void>;
  pending: PendingBasemap | undefined;
}

/** The view of the geo component (see the module comment). */
class GeoComponentView implements ComponentView {
  /** A press on the map starts a pan, but a click belongs to the point under it. */
  readonly clickThrough = true;

  #ctx: ComponentDrawContext;
  #subplots = new Map<string, GeoSubplot>();
  readonly #states = new Map<string, SubplotState>();
  /** Basemaps this view loaded, by request: one that came without its extras is only here. */
  readonly #basemaps = new Map<string, BasemapLayers>();
  readonly #loads = new Map<string, BasemapLoad>();
  readonly #failed = new Set<string>();
  #drag: Drag | undefined;
  /** While fingers are followed: stops following them, and takes a finger's lift. */
  #touchEnd: (() => void) | undefined;
  #touchLift: ((event: PointerEvent) => void) | undefined;
  /** Stops the frames of the settle swap. */
  #frames: (() => void) | undefined;
  /** The load of the globe's code while it is under way: `chart.ready` waits for it. */
  #globeLoad: PendingBasemap | undefined;
  /** The globe's code could not be loaded: globes are drawn by the 2D path. */
  #globeFailed = false;
  #disposed = false;

  constructor(ctx: ComponentDrawContext) {
    this.#ctx = ctx;
    this.#draw(ctx);
  }

  update(ctx: ComponentDrawContext): void {
    this.#ctx = ctx;
    this.#draw(ctx);
  }

  // ---- Drawing ------------------------------------------------------------------------------------

  #draw(ctx: ComponentDrawContext): void {
    const next = new Map<string, GeoSubplot>();
    for (const id of geoSubplotIds(ctx.fullLayout)) {
      const sp = resolveGeoSubplot(ctx, id, this.#subplots.get(id)?.view);
      if (sp) next.set(id, sp);
    }
    for (const [id, state] of this.#states) {
      if (next.has(id)) continue;
      this.#drop(state);
      state.projecting.follow(ctx, undefined);
      clearTimeout(state.wheel);
      this.#states.delete(id);
    }
    const before = this.#subplots;
    this.#subplots = next;
    if (this.#drag && !next.has(this.#drag.id)) {
      this.#drag = undefined;
      this.#touchEnd?.();
    }
    for (const [id, sp] of next) {
      let state = this.#states.get(id);
      if (!state) this.#states.set(id, (state = new SubplotState()));
      if (!state.initial || state.scope !== sp.layout.scope) {
        state.initial = saveGeoViewInitial(sp.layout);
        state.scope = sp.layout.scope;
      }
      // For the reset key (`a11y.ts`), which finds the subplot and not this view.
      sp.initial = state.initial;
      // A pass in the middle of a gesture built this subplot: the gesture holds it too.
      sp.gesture = state.gesture;
      // A subplot without a view is waiting for its projection's code: so does `chart.ready`.
      state.projecting.follow(
        ctx,
        sp.view ? undefined : projectionLoad(sp.layout.projection.type, ctx.chart),
      );
      state.hasChoropleth = geoHasChoropleth(ctx.fullData, id);
      this.#carry(state, before.get(id)?.view, sp);
      this.#place(ctx, state, sp);
      this.#sync(state, sp);
    }
  }

  /**
   * A layout pass gave a subplot a new view while a drag, a pinch or a wheel zoom holds it. The
   * new view is the layout's, which has nothing of the gesture yet: it takes up the view `old`
   * had. A drag is anchored again in it at its next step (`#move`).
   */
  #carry(state: SubplotState, old: GeoView | undefined, sp: GeoSubplot): void {
    const view = sp.view;
    if (!state.gesture || !view || old === view) return;
    const drag = this.#drag?.id === sp.id ? this.#drag : undefined;
    const shown = old && carryGeoViewState(old, view, old.state);
    if (!old || !shown) {
      // Another map altogether: a drag goes on from what the layout says, and a wheel zoom that
      // was not committed has nothing left to commit.
      if (drag) drag.start = view.state;
      state.wheelMoved = false;
      return;
    }
    if (drag) drag.start = carryGeoViewState(old, view, drag.start) ?? view.state;
    view.set(shown);
    sp.notify();
  }

  /** The subplot's viewport for this pass, and the view brought inside its scale limits. */
  #place(ctx: ComponentDrawContext, state: SubplotState, sp: GeoSubplot): void {
    const view = sp.view;
    // Nothing is drawn while the projection's code loads, or in a rect too small to fit a map.
    const viewport = view?.valid === true ? sp.viewport(ctx, toRGBA(sp.layout.bgcolor)) : undefined;
    // A globe's own 3D viewport lies under that one; `viewport` has asked for it already, and
    // given it the background (outside the disc a globe has the `bgcolor` a flat map has).
    const globe = viewport && sp.globe ? sp.globeViewport(ctx) : undefined;
    // A globe draws with lazy chunks: `chart.ready` waits for them, and a load that failed is
    // tried again by every layout pass.
    if (globe && !globeLayersModule()) this.#loadGlobe();
    // A viewport nobody asked for in a pass is removed with what was in it.
    if (state.viewport !== viewport) this.#drop(state);
    state.viewport = viewport;
    state.globeViewport = globe?.kind === '3d' ? globe : undefined;
    if (!view || !viewport || !this.#interactive()) return;
    // Have the 110m data in hand before the first gesture needs it, or its first frames would
    // each project the 50m map. Readiness does not wait for it. The subplot's traces get it too.
    sp.quick = this.#quickBasemap(sp);
    // Plotly's zoom event on the first draw of an interactive map: a `projection.scale` outside
    // `[minscale, maxscale]` is shown at the limit (the next gesture commits it).
    const clamp = clampGeoView(view, sp.id);
    if (clamp.changed) {
      view.set(clamp.state);
      sp.notify();
    }
  }

  /** Whether drags and the wheel move the maps (Plotly's `dragmode: 'pan'`). */
  #interactive(): boolean {
    const settings = this.#ctx.chart?.interaction;
    if (!settings || settings.staticPlot) return false;
    return settings.dragmode === 'pan' || settings.dragmode === 'zoom';
  }

  /**
   * Bring a subplot's primitives up to date with its view, layout and basemap (see the module
   * comment for when a layer is projected and when it only gets the transform).
   */
  #sync(state: SubplotState, sp: GeoSubplot): void {
    const view = sp.view;
    const viewport = state.viewport;
    if (!view?.valid || !viewport) {
      this.#drop(state);
      return;
    }
    const ctx = this.#ctx;
    const layout = sp.layout;
    const globeViewport = sp.globe ? state.globeViewport : undefined;
    const code = globeViewport && globeLayersModule();
    const parts = code ? code.globeParts() : undefined;
    if (globeViewport && !parts && !this.#globeFailed) {
      // The globe's code is on its way, and `chart.ready` waits for it: nothing is drawn before.
      this.#drop(state);
      return;
    }
    const order = geoOrder(state.hasChoropleth);
    const full = needsBasemap(layout) ? this.#basemap(layout, layout.resolution, true) : undefined;
    if (globeViewport && code && parts) {
      // The basemap's layers as meshes and 3D lines; until a 50m basemap is there, from the 110m
      // one if that is.
      const basemap = full ?? this.#standIn(layout);
      state.globe ??= new code.GlobeLayers();
      state.globe.sync(ctx, globeViewport, parts, {
        layout,
        hasChoropleth: state.hasChoropleth,
        geometry: (name) => this.#geometry(state, name, layout, basemap),
      });
    } else state.globe?.drop(ctx);
    const quick = full && state.gesture ? sp.quick : undefined;
    const transform = sp.transform;
    const kept = new Set<BaseLayerName>();
    for (const name of shownBaseLayers(layout, state.hasChoropleth)) {
      // On a globe every layer but the frame is in the 3D viewport.
      if (parts && name !== 'frame') continue;
      const target = this.#geometry(state, name, layout, full);
      // A data layer the basemap does not have (not loaded yet, or lost) is not drawn.
      if (!target) continue;
      kept.add(name);
      const layer = state.layers.get(name) ?? this.#create(state, name, viewport);
      const style = baseLayerStyle(layout, name);
      if (layer.style !== style.key) {
        if (layer.fill) layer.primitive.update({ color: style.color });
        else {
          layer.primitive.update({
            color: style.color,
            width: style.width,
            dash: style.dash,
            miterLimit: style.miterLimit,
          });
        }
        layer.style = style.key;
      }
      layer.primitive.object.renderOrder = order[name];
      if (parts) {
        this.#globeFrame(layer, sp);
        continue;
      }
      if (layer.version !== view.version) {
        // The view turned (or is a new one): what is on screen is wrong, so project now, from
        // the 110m data when a gesture is doing this on every frame.
        const source = (quick && isDataLayer(name) && baseLayerGeometry(name, quick)) || target;
        this.#project(layer, sp, source);
        if (source === target) state.queue = state.queue.filter((n) => n !== name);
      } else if (
        !state.gesture &&
        !state.queue.includes(name) &&
        (layer.source !== target || layer.carry)
      ) {
        // New data (the basemap arrived, the graticule changed) outside the settle swap.
        this.#project(layer, sp, target);
      }
      layer.primitive.setTransform(layer.carry ? compose(transform, layer.carry) : transform);
    }
    for (const [name, layer] of state.layers) {
      if (kept.has(name)) continue;
      ctx.remove(layer.primitive);
      state.layers.delete(name);
    }
    state.queue = state.queue.filter((n) => kept.has(n));
  }

  #create(state: SubplotState, name: BaseLayerName, viewport: Viewport): Layer {
    const ctx = this.#ctx;
    const rest: LayerState = { source: undefined, version: -1, carry: undefined, style: '' };
    let layer: Layer;
    if (isFillLayer(name)) {
      // Empty until the first projection, so every change goes through `update`.
      const primitive = createLazyFillPrimitive(ctx.primitives, {
        x: EMPTY,
        y: EMPTY,
        color: [0, 0, 0, 0],
      });
      layer = { ...rest, fill: true, primitive };
    } else {
      layer = { ...rest, fill: false, primitive: new LinePrimitive(ctx.primitives) };
    }
    ctx.add(layer.primitive, viewport);
    state.layers.set(name, layer);
    return layer;
  }

  /** The geometry layer `name` draws at the figure's resolution, in degrees. */
  #geometry(
    state: SubplotState,
    name: BaseLayerName,
    layout: FullGeoLayout,
    basemap: BasemapLayers | undefined,
  ): GeoInput | undefined {
    if (name === 'ocean' || name === 'frame') return SPHERE;
    if (name === 'lataxis' || name === 'lonaxis') {
      const axis = layout[name];
      const key = `${layout.scope}|${axis.tick0}|${axis.dtick}`;
      let graticule = state.graticules.get(name);
      if (graticule?.key !== key) {
        graticule = { key, lines: graticuleLines(name, layout) };
        state.graticules.set(name, graticule);
      }
      return graticule.lines;
    }
    return basemap && baseLayerGeometry(name, basemap);
  }

  /**
   * Project `geometry` into a layer's primitive. The projection is at the view's current state and
   * the subplot's transform applies to its base state, hence `toBase`. The sink's arrays are the
   * layer's own and are reused, so a rotation allocates nothing.
   */
  #project(layer: Layer, sp: GeoSubplot, geometry: GeoInput): void {
    const view = sp.view as GeoView;
    const height = view.size.height;
    if (layer.fill) {
      const out = sp.toBase(projectPolygons(view.projection, height, geometry, layer.out));
      layer.out = out;
      layer.primitive.update({
        x: out.x.subarray(0, out.vertexCount),
        y: out.y.subarray(0, out.vertexCount),
        rings: out.rings.subarray(0, out.ringCount),
        polygons: out.polygons.subarray(0, out.polygonCount),
        // Four projections fold rings back on themselves; those fill by the nonzero rule.
        fillRule: projectedFillRule(view.projection),
      });
    } else {
      const out = sp.toBase(projectLines(view.projection, height, geometry, layer.out));
      layer.out = out;
      layer.primitive.update({
        x: out.x.subarray(0, out.vertexCount),
        y: out.y.subarray(0, out.vertexCount),
        starts: out.starts.subarray(0, out.startCount),
      });
    }
    layer.source = geometry;
    layer.version = view.version;
    layer.carry = undefined;
  }

  /**
   * The frame of a globe: the unit circle, with the globe's radius and centre as its transform.
   * Its geometry is set once; a rotation leaves the transform as it is, a zoom changes it.
   */
  #globeFrame(layer: Layer, sp: GeoSubplot): void {
    if (layer.fill) return;
    if (layer.source !== CIRCLE) {
      layer.primitive.update({ ...unitCircle(), starts: NO_STARTS });
      layer.source = CIRCLE;
      // Not a projection of any view: the 2D path projects it again when the map goes flat.
      layer.version = -1;
      layer.carry = undefined;
    }
    const radius = sp.globeRadius;
    const e = sp.globeMatrix(MATRIX).elements;
    layer.primitive.setTransform({
      scaleX: radius,
      scaleY: radius,
      offsetX: e[12] as number,
      offsetY: e[13] as number,
    });
  }

  #drop(state: SubplotState): void {
    for (const layer of state.layers.values()) this.#ctx.remove(layer.primitive);
    state.layers.clear();
    state.queue = [];
    state.globe?.drop(this.#ctx);
  }

  /** Redraw one subplot after its view changed outside a layout pass. */
  #redraw(sp: GeoSubplot): void {
    const state = this.#states.get(sp.id);
    if (state) this.#sync(state, sp);
    this.#ctx.invalidate();
  }

  // ---- Basemap ------------------------------------------------------------------------------------

  /**
   * The basemap of a container at `resolution`, if it is there; otherwise its load is started
   * (once per request) and the subplots are drawn again when it arrives. With `wait`,
   * `chart.ready` waits for the load.
   */
  #basemap(
    layout: FullGeoLayout,
    resolution: GeoResolution,
    wait: boolean,
    extras = needsBasemapExtras(layout),
  ): BasemapLayers | undefined {
    const options = this.#basemapOptions(extras);
    const key = `${resolution}|${layout.scope}|${options.extras ? 1 : 0}|${options.url ?? ''}`;
    // A basemap that came without its extras is not in the loader's cache: asking again on every
    // pass would load it again on every pass, so what came back is what this view draws.
    const have = peekBasemap(resolution, layout.scope, options) ?? this.#basemaps.get(key);
    if (have || this.#failed.has(key)) return have;
    let load = this.#loads.get(key);
    if (!load) {
      const promise = loadBasemap(resolution, layout.scope, options)
        .then(
          (layers) => void this.#basemaps.set(key, layers),
          (error: unknown) => {
            this.#failed.add(key);
            if (WARNED.has(key)) return;
            WARNED.add(key);
            console.warn(
              `[holochart] the 1:${resolution}m basemap could not be loaded; ` +
                'geo subplots are drawn without its layers.',
              error,
            );
          },
        )
        .then(() => this.#loaded(key));
      this.#loads.set(key, (load = { promise, pending: undefined }));
    }
    if (wait && !load.pending) {
      load.pending = new PendingBasemap(load.promise);
      this.#ctx.add(load.pending);
    }
    return undefined;
  }

  /** Where a basemap comes from (`config.topojsonURL`), with or without the extras. */
  #basemapOptions(extras: boolean): BasemapOptions {
    const url = this.#ctx.fullConfig?.topojsonURL;
    return { extras, ...(typeof url === 'string' && url !== '' ? { url } : {}) };
  }

  /**
   * What a globe of `resolution: 50` draws while its basemap is on its way: the 110m basemap, if
   * it is loaded. It is not asked for: a globe has no other use for it.
   */
  #standIn(layout: FullGeoLayout): BasemapLayers | undefined {
    if (layout.resolution !== SLOW_RESOLUTION || !needsBasemap(layout)) return undefined;
    const options = this.#basemapOptions(needsBasemapExtras(layout));
    return peekBasemap(QUICK_RESOLUTION, layout.scope, options);
  }

  /** A load settled: let go of readiness and draw with what came. Never throws (it is awaited). */
  #loaded(key: string): void {
    const load = this.#loads.get(key);
    this.#loads.delete(key);
    if (this.#disposed) return;
    try {
      if (load?.pending) this.#ctx.remove(load.pending);
      const interactive = this.#interactive();
      for (const [id, sp] of this.#subplots) {
        const state = this.#states.get(id);
        if (!state) continue;
        // The 110m data of a map that can turn may be what arrived.
        if (interactive && state.viewport) sp.quick = this.#quickBasemap(sp);
        this.#sync(state, sp);
      }
    } catch (error) {
      console.error('[holochart] the geo component failed to draw:', error);
    }
    this.#ctx.invalidate();
  }

  /**
   * The 110m basemap a gesture projects from (ADR-025), for a map of `resolution: 50` that a
   * gesture can turn and that has something of the basemap on it: a layer this view draws, or a
   * trace matched against it (`GeoSubplot.layers`), whatever the layout shows. Its load is started
   * when it is not there, from where the subplot's own basemap comes from (`config.topojsonURL`),
   * with the extras when that one has them (the states of a `'USA-states'` trace). `undefined`
   * when it does not apply or has not arrived: the gesture then projects the figure's own
   * resolution.
   */
  #quickBasemap(sp: GeoSubplot): BasemapLayers | undefined {
    const layout = sp.layout;
    if (layout.resolution !== SLOW_RESOLUTION || sp.view?.mode === 'scoped') return undefined;
    // A 3D globe turns by a matrix and projects nothing (unless it fell back to the 2D path).
    if (sp.globe && !this.#globeFailed) return undefined;
    if (!needsBasemap(layout) && !sp.layers) return undefined;
    const extras = needsBasemapExtras(layout) || sp.layers?.subunits !== undefined;
    return this.#basemap(layout, QUICK_RESOLUTION, false, extras);
  }

  // ---- The globe's code ---------------------------------------------------------------------------

  /**
   * Load the chunks a 3D globe draws with (once at a time), and have `chart.ready` wait. When
   * they are there the globes are drawn; when the load fails, a warning says so once and they are
   * drawn flat, by the 2D path.
   */
  #loadGlobe(): void {
    if (this.#globeLoad) return;
    const promise = loadGlobeLayers()
      .then(
        () => {
          this.#globeFailed = false;
        },
        (error: unknown) => {
          this.#globeFailed = true;
          if (globeWarned) return;
          globeWarned = true;
          console.warn(
            "[holochart] the code of the 3D globe ('globe3d') could not be loaded; " +
              'the globe is drawn as a flat orthographic map.',
            error,
          );
        },
      )
      .then(() => this.#globeLoaded());
    this.#globeLoad = new PendingBasemap(promise);
    this.#ctx.add(this.#globeLoad);
  }

  /** The globe's code arrived, or did not: draw the globes. Never throws (it is awaited). */
  #globeLoaded(): void {
    const pending = this.#globeLoad;
    this.#globeLoad = undefined;
    if (this.#disposed) return;
    try {
      if (pending) this.#ctx.remove(pending);
      const interactive = this.#interactive();
      for (const [id, sp] of this.#subplots) {
        const state = this.#states.get(id);
        if (!state || !sp.globe) continue;
        // A globe drawn flat turns like a flat one: from the 110m data.
        if (interactive && state.viewport) sp.quick = this.#quickBasemap(sp);
        this.#sync(state, sp);
      }
    } catch (error) {
      console.error('[holochart] the geo component failed to draw:', error);
    }
    this.#ctx.invalidate();
  }

  /**
   * A gesture on a subplot started or ended: tell its traces (`GeoSubplot.gesture`). The end is
   * followed by one notification, whether or not the gesture commits anything.
   */
  #held(id: string): void {
    const sp = this.#subplots.get(id);
    const state = this.#states.get(id);
    if (!sp || !state) return;
    const was = sp.gesture;
    sp.gesture = state.gesture;
    if (was && !sp.gesture) sp.notify();
  }

  // ---- Settling -----------------------------------------------------------------------------------

  /**
   * A gesture on a subplot ended: bring its layers back to the figure's resolution, and after a
   * zoom to the scale they are now drawn at.
   */
  #settle(state: SubplotState, sp: GeoSubplot, zoomed: boolean): void {
    const view = sp.view;
    if (!view?.valid) return;
    if (zoomed && view.transform.scaleX !== 1) {
      const carry = { ...view.transform };
      const before = view.version;
      if (view.rebase()) {
        // What was drawn stays exact under the transform it had; each layer is projected at the
        // new scale when its turn comes.
        for (const layer of state.layers.values()) {
          if (layer.version !== before) continue;
          layer.carry = layer.carry ? compose(carry, layer.carry) : carry;
          layer.version = view.version;
        }
        sp.notify();
      }
    }
    if (state.globe?.drawn) {
      // A globe's layers are as true after a gesture as before it.
      state.queue = [];
      this.#redraw(sp);
      return;
    }
    const layout = sp.layout;
    const full = needsBasemap(layout) ? this.#basemap(layout, layout.resolution, true) : undefined;
    const stale: BaseLayerName[] = [];
    for (const [name, layer] of state.layers) {
      const target = this.#geometry(state, name, layout, full);
      if (target && (layer.carry || layer.source !== target)) stale.push(name);
    }
    // At 110m everything fits in a frame; at 50m the swap is one layer per frame, lines first.
    state.queue = layout.resolution === SLOW_RESOLUTION ? settleOrder(stale) : [];
    this.#redraw(sp);
    if (state.queue.length > 0) this.#schedule();
  }

  /** Run the settle swap on the chart's frames, one layer per frame. */
  #schedule(): void {
    if (this.#frames) return;
    const root = this.#ctx.chart?.three.root;
    if (!root) {
      // A hand-built context has no frames to spread the work over.
      while (this.#step());
      return;
    }
    const release = root.requestAnimation();
    const off = root.on('beforerender', () => {
      if (!this.#step()) this.#frames?.();
    });
    this.#frames = () => {
      release();
      off();
      this.#frames = undefined;
    };
  }

  /** Project the next waiting layer; `false` when none is left. */
  #step(): boolean {
    for (const [id, state] of this.#states) {
      const sp = this.#subplots.get(id);
      // A new gesture took over: its end builds the queue again.
      if (!sp?.view?.valid || state.gesture) continue;
      const name = state.queue.shift();
      const layer = name && state.layers.get(name);
      if (!name || !layer) continue;
      const layout = sp.layout;
      const full = needsBasemap(layout)
        ? this.#basemap(layout, layout.resolution, true)
        : undefined;
      const target = this.#geometry(state, name, layout, full);
      if (target) {
        this.#project(layer, sp, target);
        layer.primitive.setTransform(sp.transform);
      }
      return true;
    }
    return false;
  }

  // ---- Pointer ------------------------------------------------------------------------------------

  /** The topmost subplot that draws under a container point. */
  #subplotAt(x: number, y: number): GeoSubplot | undefined {
    const subplots = [...this.#subplots.values()].reverse();
    return subplots.find((sp) => sp.view?.valid === true && sp.contains(x, y));
  }

  /**
   * Box / lasso selection starts inside a subplot and is clamped to the rect it draws in; the
   * runtime runs it.
   */
  selectArea(x: number, y: number): SelectArea | undefined {
    const sp = this.#subplotAt(x, y);
    return sp && { id: sp.id, rect: sp.clipRect };
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    const chart = this.#ctx.chart;
    if (!chart || this.#subplots.size === 0) return false;
    if (this.#drag) return this.#dragPointer(event);
    const sp = this.#subplotAt(event.x, event.y);
    if (!sp) return false;
    if (event.type === 'move') {
      // Not taken: the points under the pointer hover. The cursor says what a press here does.
      const cursor = this.#cursor();
      if (cursor) event.cursor = cursor;
      return false;
    }
    // Plotly's geo moves in `dragmode: 'pan'` only, and a geo-only figure turns 'zoom' into 'pan'.
    if (!this.#interactive()) return false;
    if (event.type === 'down' && event.button === 0) {
      this.#begin(sp, event);
      return true;
    }
    if (event.type === 'wheel') return this.#wheel(sp, event);
    if (event.type === 'dblclick') {
      this.#reset(sp);
      chart.emit('doubleclick', undefined);
      return true;
    }
    return false;
  }

  /** The cursor over a map: what a press there starts (as on a cartesian plot area). */
  #cursor(): string | undefined {
    const settings = this.#ctx.chart?.interaction;
    if (!settings || settings.staticPlot) return undefined;
    const dragmode = settings.dragmode;
    if (dragmode === 'pan' || dragmode === 'zoom') return 'move';
    return dragmode === 'select' || dragmode === 'lasso' ? 'crosshair' : undefined;
  }

  #dragPointer(event: ComponentPointerEvent): boolean {
    if (this.#touchEnd) {
      // Fingers are followed by the listeners of `#followTouches`, which run after the runtime's.
      // The lift of the finger the runtime routes is taken here, before them: for a tap the
      // runtime goes on at once with the tap's hover and its click, and those must find the
      // gesture ended, or the map would take them for moves of a drag.
      const native = event.native as PointerEvent | undefined;
      if (event.type === 'up' && native) this.#touchLift?.(native);
      else if (event.type === 'leave') this.#cancel();
      return true;
    }
    if (event.type === 'move') this.#move(event.x, event.y);
    else if (event.type === 'wheel') {
      // The map is held: a wheel that would zoom it is not the page's to scroll with.
      if (this.#scrollZoom()) (event.native as WheelEvent | undefined)?.preventDefault();
    } else if (event.type === 'up') this.#end();
    else if (event.type === 'leave') {
      // A cancelled gesture (pointercancel): back to where the drag started.
      this.#cancel();
    }
    return true;
  }

  #begin(at: GeoSubplot, event: ComponentPointerEvent): void {
    const state = this.#states.get(at.id);
    if (!state) return;
    // A wheel zoom still waiting for its rest is committed first: one relayout per gesture.
    if (state.wheel !== undefined) this.#wheelRest(at.id);
    // The pass of that relayout may already have replaced the subplot.
    const sp = this.#subplots.get(at.id) ?? at;
    const view = sp.view;
    if (!view) return;
    const [x, y] = sp.toSubplot(event.x, event.y);
    this.#drag = {
      id: sp.id,
      view,
      gesture: startGeoGesture(view, x, y),
      start: view.state,
      moved: false,
      zoomed: false,
      span0: 0,
      x: event.x,
      y: event.y,
      span: 0,
    };
    state.dragging = true;
    this.#held(sp.id);
    const native = event.native as PointerEvent | undefined;
    if (native?.pointerType === 'touch') this.#followTouches(native, event.x, event.y);
  }

  /**
   * One step of the drag: the pointer (or the middle of a pinch, whose fingers are `span` px
   * apart) is at container `(x, y)`.
   */
  #move(x: number, y: number, span = 0): void {
    const drag = this.#drag;
    const sp = drag && this.#subplots.get(drag.id);
    const view = sp?.view;
    if (!drag || !sp || !view?.valid) return;
    // A layout pass replaced the view (and `#carry` gave it what the old one showed): anchor the
    // gesture in it where the pointer was, the fingers of a pinch as far apart as they were.
    if (view !== drag.view) this.#anchor(drag.x, drag.y, drag.span);
    drag.x = x;
    drag.y = y;
    drag.span = span;
    const factor = drag.span0 > 0 && span > 0 ? span / drag.span0 : 1;
    const [sx, sy] = sp.toSubplot(x, y);
    const step = moveGeoGesture(view, drag.gesture, sx, sy, factor, sp.id);
    drag.gesture = step.gesture;
    if (!step.changed) return;
    view.set(step.state);
    sp.notify();
    drag.moved = true;
    if (factor !== 1) drag.zoomed = true;
    this.#redraw(sp);
    this.#ctx.chart?.emit('relayouting', step.relayout);
  }

  /**
   * Anchor the gesture anew at container `(x, y)`, in the subplot's current view; `span` is the
   * distance between the fingers of a pinch there.
   */
  #anchor(x: number, y: number, span = 0): void {
    const drag = this.#drag;
    const sp = drag && this.#subplots.get(drag.id);
    const view = sp?.view;
    if (!drag || !sp || !view) return;
    const [sx, sy] = sp.toSubplot(x, y);
    drag.view = view;
    drag.gesture = startGeoGesture(view, sx, sy);
    drag.span0 = span;
    drag.x = x;
    drag.y = y;
    drag.span = span;
  }

  /** The drag ended: settle the layers and commit the view. */
  #end(): void {
    const drag = this.#drag;
    this.#drag = undefined;
    this.#touchEnd?.();
    const state = drag && this.#states.get(drag.id);
    if (!drag || !state) return;
    state.dragging = false;
    const sp = this.#subplots.get(drag.id);
    if (!sp) return;
    this.#settle(state, sp, drag.zoomed);
    // The traces go back to their own geometry now, not with the pass of the commit: a drag that
    // ends where it began commits nothing.
    this.#held(sp.id);
    if (drag.moved) this.#commit(sp);
  }

  #cancel(): void {
    const drag = this.#drag;
    const sp = drag && this.#subplots.get(drag.id);
    // `start` is a state of the subplot's view as it is now (`#carry` keeps it so).
    if (drag?.moved && sp?.view) {
      sp.view.set(drag.start);
      sp.notify();
      // Still a gesture: a globe turned back is projected from the 110m data, then settles.
      this.#redraw(sp);
      drag.moved = false;
    }
    this.#end();
  }

  /** One GUI relayout with the keys Plotly writes for the subplot's kind of map. */
  #commit(sp: GeoSubplot): void {
    const view = sp.view;
    const chart = this.#ctx.chart;
    if (!view || !chart) return;
    const update = geoRelayout(view, view.state, sp.id);
    if (Object.keys(update).length === 0) return;
    chart.relayout(update, { gui: true }).catch(() => undefined);
  }

  // ---- Wheel --------------------------------------------------------------------------------------

  #wheel(sp: GeoSubplot, event: ComponentPointerEvent): boolean {
    const state = this.#states.get(sp.id);
    const view = sp.view;
    const native = event.native as WheelEvent | undefined;
    if (!this.#scrollZoom() || !native || !state || !view) return false;
    native.preventDefault();
    const [x, y] = sp.toSubplot(event.x, event.y);
    const step = zoomGeoView(view, geoWheelFactor(native.deltaY, native.deltaMode), x, y, sp.id);
    clearTimeout(state.wheel);
    state.wheel = setTimeout(() => this.#wheelRest(sp.id), WHEEL_REST);
    this.#held(sp.id);
    if (!step.changed) return true;
    view.set(step.state);
    sp.notify();
    state.wheelMoved = true;
    this.#redraw(sp);
    // The label of a point hovered beside the pointer follows it as the map grows around the
    // pointer (a drag has no label: the runtime unhovers when one starts).
    this.#ctx.chart?.refreshHover();
    this.#ctx.chart?.emit('relayouting', step.relayout);
    return true;
  }

  /** Whether `config.scrollZoom` gives the wheel to geo subplots. */
  #scrollZoom(): boolean {
    // `fullConfig` is always set by the runtime; without it the schema's default applies.
    const zoom = this.#ctx.fullConfig?.scrollZoom ?? 'geo';
    return zoom === true || (typeof zoom === 'string' && zoom.split('+').includes('geo'));
  }

  /** The wheel came to rest: the zoom has settled, and is committed. */
  #wheelRest(id: string): void {
    const state = this.#states.get(id);
    if (!state) return;
    clearTimeout(state.wheel);
    state.wheel = undefined;
    const moved = state.wheelMoved;
    state.wheelMoved = false;
    const sp = this.#subplots.get(id);
    if (!sp) return;
    if (moved) this.#settle(state, sp, true);
    this.#held(id);
    if (moved) this.#commit(sp);
  }

  // ---- Touch --------------------------------------------------------------------------------------

  /**
   * Follow every finger on the canvas until they all lift (the runtime routes only the first):
   * one finger drags, two pinch about their middle.
   */
  #followTouches(first: PointerEvent, x: number, y: number): void {
    const target = first.target as HTMLElement | null;
    if (!target) return;
    const offX = first.clientX - x;
    const offY = first.clientY - y;
    const touches = new Map<number, { x: number; y: number }>([[first.pointerId, { x, y }]]);
    const middle = (): { x: number; y: number; span: number } => {
      const [a, b] = [...touches.values()] as [{ x: number; y: number }, { x: number; y: number }?];
      if (!b) return { x: a.x, y: a.y, span: 0 };
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, span: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    // The zoom of a pinch is measured from where it was anchored, so a finger landing or lifting
    // starts the measure anew.
    const anchor = (): void => {
      const m = middle();
      this.#anchor(m.x, m.y, m.span);
    };
    const onDown = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch' || touches.size >= 2 || touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX - offX, y: e.clientY - offY });
      anchor();
    };
    const onMove = (e: PointerEvent): void => {
      const touch = touches.get(e.pointerId);
      if (!touch) return;
      touch.x = e.clientX - offX;
      touch.y = e.clientY - offY;
      const m = middle();
      this.#move(m.x, m.y, m.span);
    };
    const onUp = (e: PointerEvent): void => {
      if (!touches.delete(e.pointerId)) return;
      if (touches.size === 0) this.#end();
      else anchor();
    };
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
    this.#touchLift = onUp;
    this.#touchEnd = () => {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      this.#touchEnd = undefined;
      this.#touchLift = undefined;
    };
  }

  // ---- Reset --------------------------------------------------------------------------------------

  /** Back to the first drawn view (double-click). */
  #reset(sp: GeoSubplot): void {
    const state = this.#states.get(sp.id);
    const chart = this.#ctx.chart;
    if (!state?.initial || !chart) return;
    // The reset replaces a wheel zoom that has not been committed yet.
    clearTimeout(state.wheel);
    state.wheel = undefined;
    state.wheelMoved = false;
    this.#held(sp.id);
    chart.relayout(geoResetRelayout(state.initial, sp.id), { gui: true }).catch(() => undefined);
  }

  dispose(): void {
    this.#disposed = true;
    this.#touchEnd?.();
    this.#frames?.();
    this.#drag = undefined;
    for (const state of this.#states.values()) clearTimeout(state.wheel);
    // The primitives were added through the context: the runtime removes and disposes them.
    this.#states.clear();
    this.#subplots.clear();
  }
}

/**
 * The geo component: draws the base layers of geo subplots and runs their pan, zoom and rotation
 * (see the module comment). Register it with the geo traces.
 */
export const geoComponent: ComponentModule = {
  name: 'geo',
  // Under the other components (the legend, titles) like the cartesian axes.
  order: -10,
  draw: {
    create: (ctx) => new GeoComponentView(ctx),
  },
};
