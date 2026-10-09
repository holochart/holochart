/**
 * `choropleth` rendering (backlog GEO4, GEO5, ADR-025), following plotly.js `choropleth/plot.js`
 * and `choropleth/style.js` (MIT). Everything is projected to the geometry of the subplot view's
 * base state and drawn in the subplot's own viewport through `GeoSubplot.transform`, in the
 * `backplot` slot of the choropleth layer order: above the land, the base lines and the frame,
 * under rivers, lakes and the scatter traces.
 *
 * - **The regions** are one batched fill: the polygons of every drawn feature through
 *   `projectPolygons`, which cuts them at the antimeridian and at the clip edge and keeps holes
 *   with their outer ring. A feature becomes several polygons (a multipolygon, a region cut in
 *   two) or none; `featureOf` gives each the color of its region: `z` through the colorscale, with
 *   the region's opacity (`marker.opacity`, or the selected / unselected opacity while a selection
 *   is active) as its alpha.
 * - **The outlines** (`marker.line`) are one line primitive: every ring of the projected polygons,
 *   closed. That is the outline Plotly strokes (the path of the projected polygon, the cut along
 *   the antimeridian included), and it costs no second projection. Colors and widths per location,
 *   and per-region opacities, are per vertex; otherwise the line has one color.
 *
 * While the features are loading the trace draws nothing and holds `chart.ready` (`LoadingHold`).
 *
 * On a 3D globe (`projection.type: 'globe3d'`, backlog GEO8, ADR-028) none of this applies: the
 * regions are a mesh on the sphere, built once and turned by the globe's matrix (`globe.ts`, lazy
 * code that {@link ChoroplethSwitchView} loads and switches to).
 *
 * ## Redraw rules
 *
 * The view remembers the regions and the view version its geometry was projected from.
 *
 * - A pan or a zoom keeps the version: both primitives get the new transform and nothing else.
 * - A rotation, and the rebase after a zoom settles, change the version: the regions are
 *   projected again (once: the outlines are the fill's rings).
 * - A restyle of colors (`z` with numbers where they were, `colorscale`, `zmin`…, `marker.opacity`,
 *   a selection) rewrites the color attribute of the fill and the style of the line; nothing is
 *   projected or triangulated. A `z` that changes which locations have a number is new geometry.
 * - Interactive previews arrive through the subplot's change notification, with no pipeline run,
 *   and are handled by the same rules.
 * - A pipeline pass marks every geo trace `plot` after it laid the subplots out, so a view cannot
 *   tell the relayout that ends a pan from an edit of the trace: such a pass projects nothing and
 *   writes the colors once more.
 *
 * ## Level of detail while rotating (ADR-025)
 *
 * A rotation projects on every frame. On a map of `resolution: 50` that a drag can turn (not a
 * scoped map, which pans), a trace matched against the basemap is projected from the same
 * features of the 110m basemap while a gesture turns the map, when the subplot has that basemap
 * (`GeoSubplot.quick`: the geo component loads it, from where `config.topojsonURL` says, whether
 * or not the layout shows a base layer). A country the 110m data lacks keeps its 50m feature.
 *
 * "A gesture turns the map" is the subplot's word (`GeoSubplot.gesture`, set by the geo component
 * from the press to the release, and until the wheel has rested) and what a change notification
 * shows: the version changed and the view's rotation is not the one the geometry was projected
 * at (a rebase changes the version alone). The full geometry comes back with the notification
 * that follows the end of the gesture, whether or not the gesture commits anything, or with a
 * pipeline pass, whichever is first: no timer is involved, and a pointer that rests in the middle
 * of a drag keeps the 110m features.
 *
 * The features of a trace's `geojson` have no coarser copy and are projected in full.
 *
 * ## Cost of a rotation frame
 *
 * Measured on an M1 Max in Node 26, a view of 800 × 400 px, the median of 40 frames in ms; the
 * upload to the GPU is not in it. "Project" is `projectPolygons`, "triangulate" the fill
 * primitive's triangulation, and the frame is everything this view does for one change
 * notification: both, the colors, and the outline's buffers.
 *
 * | Regions                                | Vertices in | Polygons, vertices out | Project | Triangulate | Frame |
 * | -------------------------------------- | ----------- | ---------------------- | ------- | ----------- | ----- |
 * | 110m countries, orthographic           | 10,540      | 191, 7,414             | 3.3     | 1.1         | 5.2   |
 * | 110m countries, natural earth          | 10,540      | 285, 10,286            | 4.4     | 2.0         | 5.7   |
 * | 50m countries, orthographic, in full   | 98,955      | 802, 63,498            | 26.3    | 11.9        | 42.9  |
 * | 50m countries, 110m while rotating     | 98,955      | 191, 7,414             |         |             | 6.1   |
 * | `geojson`, 3,000 polygons × 4 vertices | 15,000      | 3,000, 12,000          | 6.3     | 0.8         | 9.7   |
 * | `geojson`, 3,000 polygons × 8          | 27,000      | 3,000, 24,000          | 12.0    | 1.2         | 17.8  |
 * | `geojson`, 3,000 polygons × 16         | 51,000      | 3,000, 48,000          | 20.1    | 2.4         | 29.1  |
 * | `geojson`, 3,000 polygons × 32         | 99,000      | 3,000, 96,000          | 40.1    | 6.0         | 54.2  |
 * | `geojson`, 3,000 polygons × 64         | 195,000     | 3,000, 192,000         | 73.0    | 18.8        | 110.1 |
 *
 * The `geojson` rows are a 60 × 50 grid of cells over the United States on an orthographic view
 * that shows them all (the US-counties target of GEO4). A frame costs about 0.55 ms per 1,000
 * vertices and 3 ms for the 3,000 polygons, so a rotation of a trace's own `geojson` holds 60 fps
 * (16.7 ms) up to about 25,000 vertices on this machine and drops under it above; nothing is
 * simplified. Half of a globe's vertices are clipped away before they cost a projection, which is
 * why the 50m countries (as many vertices as the × 32 row) take less.
 *
 * A pan or a zoom costs two transform uniforms, whatever the vertex count.
 *
 * In headless Chromium on the same machine (its GPU through ANGLE's Metal backend, 900 × 600 px at
 * a device pixel ratio of 2), a drag that turns a `resolution: 50` world with 60 countries colored
 * runs at 60 fps with the 110m swap (median and 95th-percentile frame 17 ms). The frame that
 * brings the 50m geometry back at the release is the one long one: 83 ms, with the geo component's
 * own layers in it.
 */
import { toRGBA, type FullTrace, type RGBAColor } from '@mk7s/holochart-core';
import {
  createLazyFillPrimitive,
  LinePrimitive,
  loadLinesMarkers3D,
  loadPicker,
  type ColorInput,
  type LazyFillPrimitive,
  type ScalarInput,
  type Viewport,
} from '@mk7s/holochart-render';
import type {
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { mapColor } from '@mk7s/holochart-traces-basic';
import type { Feature, GeoJsonProperties, MultiPolygon, Polygon } from 'geojson';
import { GLOBE_LIGHTING, lightGlobeMesh } from '../geo/globe-light.ts';
import { globeModule, loadGlobe } from '../geo/globe-loader.ts';
import { addToGlobe, globeScene } from '../geo/globe-scene.ts';
import { LoadingHold } from '../geo/location-data.ts';
import { GEO_ORDER_FOR_CHOROPLETH, geoTraceOrder } from '../geo/order.ts';
import { projectedFillRule, type GeoFeatureInput } from '../geo/sink.ts';
import type { GeoSubplot } from '../geo/subplot.ts';
import type { GeoResolution, ProjectedPolygons } from '../geo/types.ts';
import { DEFAULT_LINE, DESELECT_DIM } from './attributes.ts';
import type { ChoroplethCalc } from './calc.ts';
import { choroplethColorMapping } from './colors.ts';
import { setGlobeRegions } from './globe-state.ts';
import {
  choroplethRegions,
  projectRegions,
  type DrawnRegions,
  type ProjectedRegions,
} from './regions.ts';

/**
 * Draw order of a trace's parts above the trace's base order in the subplot's `backplot` slot
 * (`geoTraceOrder`), where each trace has a hundredth of a unit.
 */
export const CHOROPLETH_LAYER = { fill: 0.001, line: 0.002 } as const;

/**
 * Base draw order of the choropleth at `index`: in the `backplot` slot of its subplot's
 * choropleth layer order, in trace order.
 */
export function choroplethOrder(index: number): number {
  return geoTraceOrder(GEO_ORDER_FOR_CHOROPLETH.backplot, index);
}

/** The resolution that is too slow to project on every frame of a rotation (ADR-025). */
const SLOW_RESOLUTION: GeoResolution = 50;

/** Plotly's `stroke-miterlimit` of map lines. */
const MITER_LIMIT = 2;

const BLACK: RGBAColor = [0, 0, 0, 1];

type AreaFeature = Feature<Polygon | MultiPolygon, GeoJsonProperties>;

/** The trace's `opacity`. */
export function opacityOf(trace: FullTrace): number {
  return typeof trace['opacity'] === 'number' ? trace['opacity'] : 1;
}

function isArray(v: unknown): v is ArrayLike<unknown> {
  return Array.isArray(v) || ArrayBuffer.isView(v);
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// ---- Level of detail ----------------------------------------------------------------------------

/** The features of a basemap layer by upper-case id (of the USA only, for the subunits). */
const QUICK_INDEX = new WeakMap<object, Map<string, AreaFeature>>();

function quickIndex(layer: readonly AreaFeature[], usaOnly: boolean): Map<string, AreaFeature> {
  let index = QUICK_INDEX.get(layer);
  if (!index) {
    index = new Map();
    for (const feature of layer) {
      if (usaOnly && (feature.properties as { gu?: unknown } | null)?.gu !== 'USA') continue;
      if (feature.id === undefined || feature.id === null) continue;
      const id = String(feature.id).toUpperCase();
      if (!index.has(id)) index.set(id, feature);
    }
    QUICK_INDEX.set(layer, index);
  }
  return index;
}

/** The quick features of a list of drawn regions, by the layer they were taken from. */
const QUICK = new WeakMap<DrawnRegions, { layer: object; features: readonly GeoFeatureInput[] }>();

/**
 * The features a rotation projects instead of `drawn.features` (see the module comment), or
 * `undefined` when the trace is projected in full: the same regions from the 110m basemap, in the
 * same order.
 */
export function quickFeatures(
  calc: ChoroplethCalc,
  drawn: DrawnRegions,
  subplot: GeoSubplot,
): readonly GeoFeatureInput[] | undefined {
  const { layout, view } = subplot;
  const mode = calc.locations?.locationmode;
  if (layout.resolution !== SLOW_RESOLUTION || view?.mode === 'scoped') return undefined;
  if (mode === undefined || mode === 'geojson-id') return undefined;
  const states = mode === 'USA-states';
  // The 110m basemap the geo component loaded for the subplot's gestures.
  const layers = subplot.quick;
  const layer: readonly AreaFeature[] | undefined = states ? layers?.subunits : layers?.countries;
  if (!layer) return undefined;
  const hit = QUICK.get(drawn);
  if (hit?.layer === layer) return hit.features;
  const index = quickIndex(layer, states);
  const features = drawn.located.map(
    (located, k) => index.get(located.id.toUpperCase()) ?? (drawn.features[k] as GeoFeatureInput),
  );
  QUICK.set(drawn, { layer, features });
  return features;
}

// ---- Outlines -----------------------------------------------------------------------------------

/** The rings of projected polygons as closed polylines, in the line primitive's layout. */
interface Outline {
  x: Float64Array;
  y: Float64Array;
  vertexCount: number;
  starts: Uint32Array;
  startCount: number;
  /** The drawn region of each vertex (an index into `DrawnRegions`). */
  region: Uint32Array;
}

/**
 * Close every ring of `polygons` into a polyline (a ring's first vertex is repeated at its end).
 * `out` is reused when it has the room.
 */
export function outlineOf(polygons: ProjectedPolygons, out?: Outline): Outline {
  const { x, y, rings, ringCount, vertexCount, polygonCount } = polygons;
  const n = vertexCount + ringCount;
  const o: Outline =
    out && out.x.length >= n && out.starts.length >= ringCount
      ? out
      : {
          x: new Float64Array(n),
          y: new Float64Array(n),
          vertexCount: 0,
          starts: new Uint32Array(ringCount),
          startCount: 0,
          region: new Uint32Array(n),
        };
  const featureOf = polygons.featureOf;
  let v = 0;
  let starts = 0;
  let r = 0;
  for (let p = 0; p < polygonCount; p++) {
    const region = featureOf ? (featureOf[p] as number) : 0;
    const end = p + 1 < polygonCount ? (polygons.polygons[p + 1] as number) : ringCount;
    for (; r < end; r++) {
      const a = rings[r] as number;
      const b = r + 1 < ringCount ? (rings[r + 1] as number) : vertexCount;
      // `starts` lists every polyline after the first.
      if (v > 0) o.starts[starts++] = v;
      for (let i = a; i < b; i++) {
        o.x[v] = x[i] as number;
        o.y[v] = y[i] as number;
        o.region[v++] = region;
      }
      o.x[v] = x[a] as number;
      o.y[v] = y[a] as number;
      o.region[v++] = region;
    }
  }
  o.vertexCount = v;
  o.startCount = starts;
  return o;
}

// ---- Styles -------------------------------------------------------------------------------------

/** The opacity of each location: `marker.opacity`, or what a selection makes of it. */
function regionOpacity(
  trace: FullTrace,
  selected: ReadonlySet<number> | undefined,
): (i: number) => number {
  const marker = (trace['marker'] ?? {}) as { opacity?: unknown };
  const mo = marker.opacity;
  const own = isArray(mo)
    ? (i: number): number => numberOr(mo[i], 1)
    : ((): ((i: number) => number) => {
        const one = numberOr(mo, 1);
        return () => one;
      })();
  if (!selected) return own;
  // Plotly's `selectedPointStyle`: the given opacities, else the region's own and a fifth of it.
  const on = (trace['selected'] as { marker?: { opacity?: unknown } } | undefined)?.marker?.opacity;
  const off = (trace['unselected'] as { marker?: { opacity?: unknown } } | undefined)?.marker
    ?.opacity;
  return (i) =>
    selected.has(i)
      ? typeof on === 'number'
        ? on
        : own(i)
      : typeof off === 'number'
        ? off
        : DESELECT_DIM * own(i);
}

/** Whether every region has the same opacity, and nothing dims one. */
function uniformOpacity(trace: FullTrace, selected: ReadonlySet<number> | undefined): boolean {
  return !selected && !isArray((trace['marker'] as { opacity?: unknown } | undefined)?.opacity);
}

/**
 * The color of every drawn region, four floats each: `z` through the colorscale, with the
 * region's opacity (`marker.opacity`, or what a selection makes of it) as its alpha. The flat map
 * gives each polygon its region's, the globe each vertex.
 */
export function regionColors(
  ctx: TracePlotContext<ChoroplethCalc>,
  drawn: DrawnRegions,
): Float32Array {
  const { trace, calc } = ctx;
  const mapping = choroplethColorMapping(trace, ctx.fullLayout);
  const opacity = regionOpacity(
    trace,
    ctx.selectedPoints ? new Set(ctx.selectedPoints) : undefined,
  );
  const count = drawn.index.length;
  const regions = new Float32Array(count * 4);
  for (let k = 0; k < count; k++) {
    const i = drawn.index[k] as number;
    // Without a domain no `z` is a number, and no region is drawn.
    const rgba = mapping ? mapColor(calc.z[i] as number, mapping) : BLACK;
    regions[4 * k] = rgba[0];
    regions[4 * k + 1] = rgba[1];
    regions[4 * k + 2] = rgba[2];
    regions[4 * k + 3] = rgba[3] * opacity(i);
  }
  return regions;
}

/** The vertices of an outline, as {@link outlineStyle} reads them. */
export interface OutlineVertices {
  readonly vertexCount: number;
  /** The drawn region of each vertex (an index into `DrawnRegions`). */
  readonly region: Uint32Array;
}

/** The style of an outline: what the 2D line primitive and the globe's 3D one both take. */
export interface OutlineStyle {
  color: ColorInput;
  width: ScalarInput;
  opacity: number;
  miterLimit: number;
}

/**
 * The style of the outlines (`marker.line`) for an outline's vertices, or `undefined` when the
 * trace draws none (`marker.line.width` 0). One color, width and opacity for the whole line
 * unless a location has its own.
 */
export function outlineStyle(
  ctx: TracePlotContext<ChoroplethCalc>,
): ((outline: OutlineVertices) => OutlineStyle) | undefined {
  const { trace, calc } = ctx;
  const line = ((trace['marker'] as { line?: unknown } | undefined)?.line ?? {}) as {
    color?: unknown;
    width?: unknown;
  };
  const widths = isArray(line.width) ? line.width : undefined;
  const width = widths ? 0 : numberOr(line.width, 0);
  if (!widths && !(width > 0)) return undefined;
  const colors = isArray(line.color) ? line.color : undefined;
  const one =
    (typeof line.color === 'string' ? toRGBA(line.color) : null) ?? toRGBA(DEFAULT_LINE) ?? BLACK;
  const selected = ctx.selectedPoints ? new Set(ctx.selectedPoints) : undefined;
  const uniform = uniformOpacity(trace, selected);
  const opacity = regionOpacity(trace, selected);
  const drawn = calc.drawn as DrawnRegions;
  return (outline) => {
    const n = outline.vertexCount;
    let color: ColorInput = one;
    if (colors || !uniform) {
      const rgba = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) {
        const i = drawn.index[outline.region[v] as number] as number;
        const c = colors ? colors[i] : undefined;
        const own = (typeof c === 'string' ? toRGBA(c) : null) ?? one;
        rgba[4 * v] = own[0];
        rgba[4 * v + 1] = own[1];
        rgba[4 * v + 2] = own[2];
        rgba[4 * v + 3] = own[3] * (uniform ? 1 : opacity(i));
      }
      color = rgba;
    }
    let w: ScalarInput = width;
    if (widths) {
      const per = new Float32Array(n);
      for (let v = 0; v < n; v++) {
        per[v] = numberOr(widths[drawn.index[outline.region[v] as number] as number], 0);
      }
      w = per;
    }
    return {
      color,
      width: w,
      // Plotly sets the opacity on the path: the outline fades with its region.
      opacity: opacityOf(trace) * (uniform ? opacity(0) : 1),
      miterLimit: MITER_LIMIT,
    };
  };
}

const FULL: TraceUpdatePlan = { calc: true, plot: true, style: true, transform: true };
/** A view change with no pipeline run: nothing about the trace changed. */
const MOVE: TraceUpdatePlan = { calc: false, plot: false, style: false, transform: true };

type Rotation = { readonly lon: number; readonly lat: number; readonly roll: number };

class ChoroplethView implements TraceView<ChoroplethCalc> {
  #fill: LazyFillPrimitive | undefined;
  #line: LinePrimitive | undefined;
  #ctx: TracePlotContext<ChoroplethCalc>;
  /** The subplot's viewport, from the last pipeline pass, and its key (`GeoSubplot.viewportKey`). */
  #viewport: Viewport | undefined;
  #subplot: GeoSubplot | undefined;
  #off: (() => void) | undefined;
  /** Chart readiness waits here while the features of the trace's locations load. */
  readonly #hold = new LoadingHold();

  /** The full geometry, shared with hover (`choroplethRegions`). */
  #regions: ProjectedRegions | undefined;
  /** What the primitives hold: the regions, the view version and rotation, and the polygons. */
  #drawn: DrawnRegions | undefined;
  #version = -1;
  #rotation: Rotation | undefined;
  #polygons: ProjectedPolygons | undefined;
  /** The primitives hold the 110m geometry of a rotation under way. */
  #quick = false;
  /** The 110m geometry and the outline, kept so that a rotation allocates nothing. */
  #quickOut: ProjectedPolygons | undefined;
  #outline: Outline | undefined;
  /** Whether the outline of the last geometry has been built and uploaded. */
  #outlined = false;

  constructor(ctx: TracePlotContext<ChoroplethCalc>) {
    this.#ctx = ctx;
    this.#draw(ctx, FULL, true);
  }

  update(ctx: TracePlotContext<ChoroplethCalc>, plan: TraceUpdatePlan): void {
    this.#ctx = ctx;
    this.#draw(ctx, plan, true);
  }

  #follow(subplot: GeoSubplot | undefined): void {
    if (subplot === this.#subplot) return;
    this.#off?.();
    this.#subplot = subplot;
    this.#off = subplot?.onChange(() => {
      // A drag or a wheel step changed the view, or a gesture ended: redraw now, from the last
      // context.
      this.#draw(this.#ctx, MOVE, false);
      this.#ctx.invalidate();
    });
  }

  /**
   * The subplot's 2D viewport, shared with the geo component, which decides its background (none
   * is given here, so it is kept).
   */
  #viewportOf(ctx: TracePlotContext<ChoroplethCalc>, subplot: GeoSubplot): Viewport {
    return subplot.viewport(ctx) ?? ctx.viewport;
  }

  /**
   * Bring the primitives up to date. `pass` is false for a change notification between pipeline
   * passes: the viewport is then the one of the last pass (asking the runtime for it again would
   * reset what the geo component set on it).
   */
  #draw(ctx: TracePlotContext<ChoroplethCalc>, plan: TraceUpdatePlan, pass: boolean): void {
    const { calc } = ctx;
    const subplot = calc.subplot;
    this.#follow(subplot);
    this.#hold.follow(ctx, calc.locations ? subplot?.loading : undefined);
    const view = subplot?.view;
    const drawn = calc.drawn;
    // No subplot, a projection still loading, or no region to draw: draw nothing.
    if (!subplot || !view?.valid || !drawn || drawn.features.length === 0) {
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
    const rotation = view.state.rotation;
    const turned = view.version !== this.#version;
    const same = drawn === this.#drawn;

    // Which geometry, if any, is projected now.
    const before = this.#rotation;
    const rotating =
      !pass &&
      subplot.gesture &&
      turned &&
      same &&
      before !== undefined &&
      (rotation.lon !== before.lon || rotation.lat !== before.lat || rotation.roll !== before.roll);
    const quick = rotating ? quickFeatures(calc, drawn, subplot) : undefined;
    let polygons: ProjectedPolygons | undefined;
    if (quick) {
      polygons = this.#quickOut = projectRegions(quick, subplot, this.#quickOut);
      this.#quick = true;
    } else if (turned || !same || (this.#quick && (pass || !subplot.gesture))) {
      // Also the end of the gesture that turned the map: its own geometry is due.
      this.#regions = choroplethRegions(calc, this.#regions);
      polygons = this.#regions?.polygons;
      this.#quick = false;
    } else if (!this.#quick) {
      // A new calc over the same regions (a restyle of `z`) takes the geometry over.
      this.#regions = choroplethRegions(calc, this.#regions);
    }

    const restyle = plan.calc || plan.plot || plan.style || plan.selection === true;
    const order = choroplethOrder(ctx.index);
    if (polygons) {
      this.#polygons = polygons;
      this.#drawn = drawn;
      this.#version = view.version;
      this.#rotation = rotation;
      this.#outlined = false;
      const geometry = {
        x: polygons.x.subarray(0, polygons.vertexCount),
        y: polygons.y.subarray(0, polygons.vertexCount),
        rings: polygons.rings.subarray(0, polygons.ringCount),
        polygons: polygons.polygons.subarray(0, polygons.polygonCount),
        // Four projections fold rings back on themselves; those fill by the nonzero rule.
        fillRule: projectedFillRule(view.projection),
      };
      const colors = this.#fillStyle(ctx, drawn, polygons);
      if (!this.#fill) {
        this.#fill = createLazyFillPrimitive(ctx.primitives, { ...geometry, ...colors });
        ctx.add(this.#fill, viewport);
      } else this.#fill.update({ ...geometry, ...colors });
    } else if (restyle && this.#fill && this.#polygons) {
      this.#fill.update(this.#fillStyle(ctx, drawn, this.#polygons));
    }
    if (this.#fill) {
      this.#fill.setTransform(transform);
      this.#fill.object.renderOrder = order + CHOROPLETH_LAYER.fill;
    }

    // Outlines: the rings of the polygons the fill holds.
    const style = this.#polygons ? outlineStyle(ctx) : undefined;
    if (style && this.#polygons) {
      const created = !this.#line;
      if (!this.#line) {
        this.#line = new LinePrimitive(ctx.primitives);
        ctx.add(this.#line, viewport);
      }
      if (!this.#outlined) {
        const outline = (this.#outline = outlineOf(this.#polygons, this.#outline));
        this.#outlined = true;
        this.#line.update({
          x: outline.x.subarray(0, outline.vertexCount),
          y: outline.y.subarray(0, outline.vertexCount),
          starts: outline.starts.subarray(0, outline.startCount),
          ...style(outline),
        });
      } else if ((restyle || created) && this.#outline) {
        this.#line.update(style(this.#outline));
      }
      this.#line.setTransform(transform);
      this.#line.object.renderOrder = order + CHOROPLETH_LAYER.line;
    } else if (this.#line) {
      ctx.remove(this.#line);
      this.#line = undefined;
      this.#outlined = false;
    }
  }

  /** The color of every polygon (its region's, with the region's opacity) and the fill's opacity. */
  #fillStyle(
    ctx: TracePlotContext<ChoroplethCalc>,
    drawn: DrawnRegions,
    polygons: ProjectedPolygons,
  ): { color: Float32Array; opacity: number } {
    const regions = regionColors(ctx, drawn);
    const n = polygons.polygonCount;
    const featureOf = polygons.featureOf as Uint32Array;
    const color = new Float32Array(n * 4);
    for (let p = 0; p < n; p++) {
      const k = 4 * (featureOf[p] as number);
      color[4 * p] = regions[k] as number;
      color[4 * p + 1] = regions[k + 1] as number;
      color[4 * p + 2] = regions[k + 2] as number;
      color[4 * p + 3] = regions[k + 3] as number;
    }
    return { color, opacity: opacityOf(ctx.trace) };
  }

  /** Remove everything drawn (the trace has nothing to draw, or is drawn another way). */
  clear(ctx: TracePlotContext<ChoroplethCalc>): void {
    this.#clear(ctx);
    this.#hold.follow(ctx, undefined);
  }

  #clear(ctx: TracePlotContext<ChoroplethCalc>): void {
    if (this.#fill) ctx.remove(this.#fill);
    if (this.#line) ctx.remove(this.#line);
    this.#fill = undefined;
    this.#line = undefined;
    this.#drawn = undefined;
    this.#polygons = undefined;
    this.#version = -1;
    this.#rotation = undefined;
    this.#quick = false;
    this.#outlined = false;
  }

  dispose(): void {
    this.#off?.();
    this.#off = undefined;
    this.#subplot = undefined;
  }
}

// ---- The 3D globe -------------------------------------------------------------------------------

/** The trace's globe view (`globe.ts`): lazy code, like the geometry it draws (ADR-026, ADR-028). */
type GlobeChunk = typeof import('./globe.ts');

let globeChunk: GlobeChunk | null = null;
let globeLoading: Promise<void> | undefined;
let globeWarned = false;

/**
 * Load what a choropleth on a globe draws with: its view, the globe's geometry builders, render's
 * 3D lines and render's pickers (the mesh primitive loads itself). `undefined` when it is all there, else a
 * promise that settles, without rejecting, when the loads have. A failed load is reported once,
 * leaves the trace undrawn, and is tried again by the next draw.
 */
function loadGlobeChunk(): Promise<void> | undefined {
  if (globeChunk) return undefined;
  globeLoading ??= Promise.all([
    import('./globe.ts'),
    loadPicker(),
    loadGlobe(),
    loadLinesMarkers3D(),
  ]).then(
    ([chunk, createPicker]) => {
      // Handed over, not imported by the chunk: it shares no module with this code (ADR-026).
      chunk.provideChoroplethGlobeDeps({
        globeModule,
        globeScene,
        addToGlobe,
        GLOBE_LIGHTING,
        lightGlobeMesh,
        setGlobeRegions,
        CHOROPLETH_LAYER,
        choroplethOrder,
        opacityOf,
        outlineStyle,
        regionColors,
        createPicker,
      });
      globeChunk = chunk;
      globeLoading = undefined;
    },
    (error: unknown) => {
      globeLoading = undefined;
      if (globeWarned) return;
      globeWarned = true;
      console.warn(
        "[holochart] choropleth: the code that draws regions on a 3D globe ('globe3d') could " +
          'not be loaded; the regions are not drawn.',
        error,
      );
    },
  );
  return globeLoading;
}

/**
 * The view of a `choropleth`: the flat map's ({@link ChoroplethView}) or, on a subplot whose
 * projection is `'globe3d'`, the globe's (`globe.ts`). A relayout of the projection type between
 * the two removes what the one drew and draws the other. The globe's code is loaded when a trace
 * is first drawn on a globe, and `chart.ready` waits for it.
 */
class ChoroplethSwitchView implements TraceView<ChoroplethCalc> {
  #flat: ChoroplethView | undefined;
  #globe: ReturnType<GlobeChunk['createChoroplethGlobeView']> | undefined;
  /** The globe's 3D viewport, from the last pipeline pass. */
  #viewport: Viewport | undefined;
  #ctx: TracePlotContext<ChoroplethCalc>;
  /** Chart readiness waits here while the globe's code loads… */
  readonly #hold = new LoadingHold();
  #waiting: Promise<void> | undefined;
  /** …and here, on a globe, while the features of the trace's locations load. */
  readonly #locations = new LoadingHold();
  #disposed = false;

  constructor(ctx: TracePlotContext<ChoroplethCalc>) {
    this.#ctx = ctx;
    this.#draw(ctx, FULL, true);
  }

  update(ctx: TracePlotContext<ChoroplethCalc>, plan: TraceUpdatePlan): void {
    this.#ctx = ctx;
    this.#draw(ctx, plan, true);
  }

  /**
   * `pass` is false for the draw that follows the load of the globe's code, between two pipeline
   * passes: the globe's viewport is then the one of the last pass (asking the runtime for it
   * outside a pass would keep it for a pass in which nothing is drawn in it).
   */
  #draw(ctx: TracePlotContext<ChoroplethCalc>, plan: TraceUpdatePlan, pass: boolean): void {
    const subplot = ctx.calc.subplot;
    if (subplot?.globe !== true) {
      if (this.#globe) {
        this.#globe.clear(ctx);
        this.#globe.dispose();
        this.#globe = undefined;
      }
      this.#viewport = undefined;
      this.#wait(ctx, undefined);
      this.#locations.follow(ctx, undefined);
      if (this.#flat) this.#flat.update(ctx, plan);
      else this.#flat = new ChoroplethView(ctx);
      return;
    }
    if (this.#flat) {
      this.#flat.clear(ctx);
      this.#flat.dispose();
      this.#flat = undefined;
    }
    this.#locations.follow(ctx, ctx.calc.locations ? subplot.loading : undefined);
    // Asked for in every pass, drawn or not: a viewport nobody asks for is removed.
    if (pass) this.#viewport = subplot.globeViewport(ctx);
    const chunk = globeChunk;
    if (!chunk) {
      this.#wait(ctx, loadGlobeChunk());
      return;
    }
    this.#wait(ctx, undefined);
    if (this.#globe) this.#globe.update(ctx, plan, this.#viewport);
    else this.#globe = chunk.createChoroplethGlobeView(ctx, this.#viewport);
  }

  /** Hold `chart.ready` until `loading` has settled and the trace is drawn with what arrived. */
  #wait(ctx: TracePlotContext<ChoroplethCalc>, loading: Promise<void> | undefined): void {
    if (!loading) {
      this.#waiting = undefined;
      this.#hold.follow(ctx, undefined);
      return;
    }
    // One promise per load: the hold is the same from draw to draw while it is pending.
    if (this.#waiting) return;
    const waiting: Promise<void> = loading.then(() => {
      if (this.#disposed || this.#waiting !== waiting) return;
      this.#waiting = undefined;
      this.#hold.follow(this.#ctx, undefined);
      // A failed load leaves the trace undrawn; the chart is ready all the same.
      if (!globeChunk) return;
      this.#draw(this.#ctx, FULL, false);
      this.#ctx.invalidate();
    });
    this.#waiting = waiting;
    this.#hold.follow(ctx, waiting);
  }

  dispose(): void {
    this.#disposed = true;
    this.#flat?.dispose();
    this.#globe?.dispose();
  }
}

export const choroplethRenderer: TraceRenderer<ChoroplethCalc> = {
  create: (ctx) => new ChoroplethSwitchView(ctx),
};
