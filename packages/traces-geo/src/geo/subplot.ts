/**
 * A geo subplot laid out for one pass (backlog GEO2): its place in the figure, its {@link GeoView}
 * and the viewport it draws in. {@link geoCrossTraceLayout} builds one per subplot and hands it to
 * the subplot's traces (`calc.subplot`) and to the geo component, which draws the base layers and
 * runs the drags.
 *
 * Everything on a map is projected to **subplot px** (see `types.ts`) at the view's base state and
 * carried to the screen by {@link GeoSubplot.transform}, so a pan or a zoom moves the primitives
 * without projecting again (ADR-025). The subplot draws in a 2D viewport of its own, clipped to
 * the pixel bounds of the `lonaxis` × `lataxis` range box, which is the rectangle Plotly clips to.
 *
 * ## The globe (backlog GEO8, ADR-028)
 *
 * A subplot whose projection type is `'globe3d'` ({@link GeoSubplot.globe}) draws in a **3D**
 * viewport instead, with an orthographic camera placed so that the viewport's world units are the
 * same px as the 2D viewport's: x right and y up from the bottom-left corner of
 * {@link GeoSubplot.clipRect}, and z towards the viewer. Whatever the 2D code positions through
 * {@link GeoSubplot.transform} therefore lands on the same pixel, at z = 0, and
 * {@link GeoSubplot.globeMatrix} places geometry built on the unit sphere in the same frame.
 * The geo component and the subplot's traces all get the viewport from
 * {@link GeoSubplot.viewport}, so they agree on its key, its kind and its camera.
 */
import type { DataTransform, RGBA, Viewport, ViewportRect } from '@mk7s/holochart-render';
import type { Chart, SubplotViewportOptions } from '@mk7s/holochart-runtime';
import { Matrix4 } from 'three';
import { globeRotation } from './globe-frame.ts';
import { placeGlobeScene } from './globe-scene.ts';
import type { GeoViewInitial } from './interact.ts';
import { isGlobeProjection } from './projections.ts';
import type { BasemapLayers, FullGeoLayout } from './types.ts';
import type { GeoView } from './view.ts';

/** The part of a plot or draw context that hands out subplot viewports. */
export interface GeoViewportSource {
  subplotViewport?(key: string, options: SubplotViewportOptions): Viewport;
}

/**
 * How far the globe's camera sees, in globe radii either side of the globe's centre: the sphere
 * and what rises up to one radius above it (arcs, prisms) need 2, and the rest is room for a zoom
 * step that has not been followed yet.
 */
const GLOBE_DEPTH = 3;

/** The background each viewport was last given, so a call that gives none keeps it. */
const BACKGROUNDS = new WeakMap<Viewport, RGBA | null>();

/** Set `viewport`'s background to `background`, or back to what it was last set to. */
function keepBackground(viewport: Viewport, background: RGBA | null | undefined): void {
  if (background !== undefined) BACKGROUNDS.set(viewport, background);
  viewport.background = BACKGROUNDS.get(viewport) ?? null;
}

/** Scratch for the globe's matrix. */
const MATRIX = new Matrix4();

/** What {@link GeoSubplot} is built from. */
export interface GeoSubplotInput {
  readonly id: string;
  readonly layout: FullGeoLayout;
  /** The subplot's domain on the plot area, container px (top-left origin). */
  readonly rect: Readonly<ViewportRect>;
  /** `undefined` while the projection's code is still loading. */
  readonly view: GeoView | undefined;
  /** See {@link GeoSubplot.layers}. */
  readonly layers?: BasemapLayers | undefined;
  /** See {@link GeoSubplot.loading}. */
  readonly loading?: Promise<void> | undefined;
  /** See {@link GeoSubplot.chart}. */
  readonly chart?: Chart | undefined;
}

/** A geo subplot laid out (see the module comment). @experimental */
export class GeoSubplot {
  readonly id: string;
  /** The subplot's defaulted layout container (`fullLayout.geoN`). */
  readonly layout: FullGeoLayout;
  /** The subplot's domain on the plot area, container px (top-left origin). */
  readonly rect: Readonly<ViewportRect>;
  /**
   * The projection and its current pan, zoom and rotation. `undefined` while the projection's
   * code is still loading (the projections of `d3-geo-projection` are a lazy chunk): nothing is
   * drawn until a later pass has it.
   */
  readonly view: GeoView | undefined;
  /**
   * The basemap of the subplot's `resolution` and `scope` that the `locations` of its traces are
   * matched against (`location-data.ts`), once it is loaded. `undefined` until then, and on a
   * subplot without such a trace: the geo component loads the layers it draws on its own.
   */
  readonly layers: BasemapLayers | undefined;
  /**
   * Set while data that the subplot's traces are located with is loading (the basemap, a
   * `geojson` URL, the country-name table): settles, without rejecting, when the loads have
   * arrived or failed and the layout pass has been asked to run again. Those traces draw nothing
   * until that pass, and hold `chart.ready` with it (`LoadingHold`).
   */
  readonly loading: Promise<void> | undefined;
  /**
   * The subplot is a 3D globe (`projection.type: 'globe3d'`, ADR-028): it draws in a 3D viewport
   * (see {@link viewport}), and its view is the orthographic one.
   */
  readonly globe: boolean;
  /**
   * The chart the subplot was laid out for: what a trace needs its render root for (GPU picking
   * of the regions on a globe, ADR-028) and hover that an asynchronous pick has to run again
   * (`chart.refreshHover()`). `undefined` in a hand-built layout context.
   */
  readonly chart: Chart | undefined;

  /**
   * The view a reset returns to (a double-click, the `0` key): Plotly's `viewInitial`, saved by
   * the geo component when the subplot is first drawn and handed to every subplot it draws after.
   * `undefined` until the component has drawn the subplot.
   */
  initial: GeoViewInitial | undefined;
  /**
   * A drag, a pinch or a wheel zoom holds the view: set by the geo component when the gesture
   * starts and cleared when it ends (the pointer is released, the wheel has rested), on every
   * subplot it draws meanwhile. Clearing it is followed by one {@link notify}, whether or not the
   * gesture commits anything, so a trace that draws coarser geometry while a gesture turns the map
   * ({@link quick}) goes back to its own at that notification and needs no timer.
   */
  gesture = false;
  /**
   * The 110m basemap that stands in for the subplot's own while a gesture turns a map of
   * `resolution: 50` (ADR-025), once it is loaded: the geo component loads it, from where
   * `config.topojsonURL` says, for a map that can turn and that draws a basemap layer or has a
   * trace matched against the basemap ({@link layers}), with the extras when the subplot's own
   * basemap has them. `undefined` otherwise: what turns is then projected from its own geometry.
   */
  quick: BasemapLayers | undefined;

  #listeners = new Set<() => void>();
  /** The globe's viewport as {@link globeViewport} last handed it out: {@link notify} keeps it placed. */
  #globeViewport: Viewport | undefined;

  constructor(input: GeoSubplotInput) {
    this.id = input.id;
    this.layout = input.layout;
    this.rect = input.rect;
    this.view = input.view;
    this.layers = input.layers;
    this.loading = input.loading;
    this.chart = input.chart;
    this.globe = isGlobeProjection(input.layout.projection.type);
  }

  /**
   * The key of the globe's 3D viewport at the runtime; the subplot's 2D viewport has the key
   * {@link id}. They are two keys because the runtime fixes a key's kind with the first call
   * for it, and because a globe has both.
   */
  get viewportKey(): string {
    return `${this.id}-globe`;
  }

  /**
   * The subplot's 2D viewport, from the runtime: world units are px from the bottom-left corner of
   * {@link clipRect}, and everything positioned in subplot px is drawn here (base layers of a flat
   * map; markers, text and the frame on any map). The one place that asks for it, used by the geo
   * component and by the subplot's traces. `undefined` when `ctx` hands out no subplot viewports
   * (a hand-built context).
   *
   * On a globe this viewport lies over the globe's own ({@link globeViewport}), which is asked
   * for first so that it is drawn first, and which then has the background.
   *
   * The runtime sets a viewport's background on every call. `background` is therefore remembered
   * per viewport: leave it out to keep what the viewport has, as a trace does, which does not
   * decide the subplot's background.
   */
  viewport(ctx: GeoViewportSource, background?: RGBA | null): Viewport | undefined {
    const globe = this.globe ? this.globeViewport(ctx, background) : undefined;
    const viewport = ctx.subplotViewport?.(this.id, {
      kind: '2d',
      rect: this.clipRect,
      background: null,
    });
    if (viewport) {
      keepBackground(viewport, this.globe ? null : background);
      // What is drawn here tests depth at z = 0 and writes none. Over a globe, whose body has
      // written its depth into the same pixels, the test would hide markers, text and the frame:
      // the depth is cleared between the two viewports.
      viewport.clearDepth = this.globe;
      // Viewports of one order are drawn oldest first, and on a subplot that was a flat map
      // before it became a globe the 2D viewport is the older one: it goes above by its order.
      if (globe && viewport.order <= globe.order) viewport.order = globe.order + 1;
    }
    return viewport;
  }

  /**
   * The globe's 3D viewport (ADR-028), or `undefined` on a flat map: an orthographic camera placed
   * by {@link placeCamera}, under the subplot's 2D viewport. What is built in globe coordinates
   * goes on its globe (`globe-scene.ts`: `addToGlobe`), which this call puts where the view has it.
   */
  globeViewport(ctx: GeoViewportSource, background?: RGBA | null): Viewport | undefined {
    if (!this.globe) return undefined;
    const viewport = ctx.subplotViewport?.(this.viewportKey, {
      kind: '3d',
      projection: 'orthographic',
      // The whole domain, not `clipRect` (the disc's box): arcs and prisms rise past the limb.
      rect: this.rect,
      background: null,
    });
    if (viewport) {
      keepBackground(viewport, background);
      this.#placeGlobe(viewport);
    }
    this.#globeViewport = viewport;
    return viewport;
  }

  /** The camera, and the globe under it (`globe-scene.ts`), where the view now has them. */
  #placeGlobe(viewport: Viewport): void {
    this.placeCamera(viewport);
    if (viewport.kind === '3d') placeGlobeScene(viewport, this.globeMatrix(MATRIX));
  }

  /**
   * Place the camera of a globe's viewport so that world units are px in the frame of
   * {@link clipRect}: x right and y up from its bottom-left corner, as in a 2D viewport, and z
   * towards the viewer, with the globe's centre at z = 0.
   *
   * The camera looks down −z from the middle of the rect, and half the rect's height is half of
   * what it sees. Its near and far planes follow the globe's radius, which grows with every zoom
   * and soon passes a 3D viewport's default far plane of 1,000: the camera stands 4 radii in front
   * of the centre and sees from 3 radii in front of it to 3 behind (the sphere, and what rises up
   * to a radius above its surface, need 2). {@link viewport} calls this in every layout pass and
   * {@link notify} after every change of the view between passes. The viewport's own `layout()`
   * (a resize) keeps the planes: it only sets the frustum's sides.
   */
  placeCamera(viewport: Viewport): void {
    // A stand-in viewport of a hand-built context has no camera to place.
    if (viewport.kind !== '3d') return;
    const { rect } = this;
    const clip = this.clipRect;
    const { width, height } = rect;
    const camera = viewport.camera;
    if ((camera as { top?: number }).top !== height / 2) viewport.setOrthoHalfHeight(height / 2);
    const radius = this.globeRadius || Math.max(width, height, 1);
    // The middle of the domain, in px from the clip rect's bottom-left corner (the world's origin).
    camera.position.set(
      rect.x + width / 2 - clip.x,
      clip.y + clip.height - (rect.y + height / 2),
      (GLOBE_DEPTH + 1) * radius,
    );
    camera.quaternion.identity();
    camera.near = radius;
    camera.far = (2 * GLOBE_DEPTH + 1) * radius;
    camera.updateProjectionMatrix();
  }

  /**
   * The radius of the globe in px (d3's scale of the orthographic projection): it grows with
   * `projection.scale`. 0 without a valid view.
   */
  get globeRadius(): number {
    const view = this.view;
    return view?.valid ? view.projection.scale() : 0;
  }

  /**
   * Globe coordinates (the unit sphere of `globe-frame.ts`) → world units of the globe's viewport,
   * written to `out`: `translate(centre) · scale(radius) · rotation`. The rotation is the one d3
   * applies for the view's `projection.rotation`, the radius is {@link globeRadius}, and the
   * centre is where the 2D code draws the point the rotation faces. So a point of the near
   * hemisphere has the x and y that {@link transform} gives its {@link basePoint}, and a z above
   * 0; the far hemisphere is below 0. The identity without a valid view.
   *
   * A pan, a zoom and a rotation each change this matrix and nothing else about the globe.
   */
  globeMatrix(out: Matrix4): Matrix4 {
    const view = this.view;
    if (!view?.valid) return out.identity();
    const { rotation } = view.state;
    // d3 px (y down from the top of `rect`) of the point in the middle of the globe's disc. The
    // translate point alone is not it: d3's `center` moves the map against it.
    const at = view.projection([rotation.lon, rotation.lat]) as [number, number];
    const clip = this.clipRect;
    // To the frame of `clipRect`, y up from its bottom edge.
    const x = at[0] - (clip.x - this.rect.x);
    const y = clip.y + clip.height - this.rect.y - at[1];
    const k = view.projection.scale();
    globeRotation(rotation, out);
    const e = out.elements;
    // Scale the rotation (the upper 3 × 3 of the column-major elements), then set the translation.
    for (let i = 0; i < 11; i++) if (i % 4 !== 3) e[i] = (e[i] as number) * k;
    e[12] = x;
    e[13] = y;
    e[14] = 0;
    return out;
  }

  /**
   * Where the subplot draws, in container px (top-left origin): the part of its domain that the
   * range box covers. Fixed for the life of the subplot; a pan moves the map under it.
   */
  get clipRect(): ViewportRect {
    const { rect, view } = this;
    if (!view?.valid) return { ...rect };
    const b = view.bounds;
    const x0 = Math.max(0, Math.min(b.x0, b.x1));
    const x1 = Math.min(rect.width, Math.max(b.x0, b.x1));
    const y0 = Math.max(0, Math.min(b.y0, b.y1));
    const y1 = Math.min(rect.height, Math.max(b.y0, b.y1));
    if (!(x1 > x0) || !(y1 > y0)) return { ...rect };
    // Bounds are subplot px with y up; rects have their origin at the top-left.
    return { x: rect.x + x0, y: rect.y + rect.height - y1, width: x1 - x0, height: y1 - y0 };
  }

  /**
   * Geometry projected at the view's base state → world units of the subplot's viewport (CSS px
   * from the bottom-left corner of {@link clipRect}). Changes with every pan and zoom.
   */
  get transform(): DataTransform {
    const { rect, view } = this;
    const clip = this.clipRect;
    const dx = clip.x - rect.x;
    const dy = rect.y + rect.height - (clip.y + clip.height);
    const t = view?.transform;
    return {
      scaleX: t?.scaleX ?? 1,
      scaleY: t?.scaleY ?? 1,
      offsetX: (t?.offsetX ?? 0) - dx,
      offsetY: (t?.offsetY ?? 0) - dy,
    };
  }

  /**
   * Where a longitude and latitude are in the geometry of the view's **base** state, the
   * coordinates {@link transform} applies to; `null` when the projection hides the point or the
   * view is not ready. Use it, not {@link GeoView.project}, for positions handed to primitives.
   */
  basePoint(lon: number, lat: number): [number, number] | null {
    const view = this.view;
    const p = view?.project(lon, lat);
    if (!view || !p) return null;
    const t = view.transform;
    return [(p[0] - t.offsetX) / t.scaleX, (p[1] - t.offsetY) / t.scaleY];
  }

  /**
   * Takes geometry streamed through {@link GeoView.projection}, which is at the view's current
   * state, back to the base state, in place. The projection moves with every pan and zoom while
   * {@link transform} carries base geometry, so everything handed to a primitive goes through
   * here; right after a projection the two states are the same and nothing is done.
   */
  toBase<T extends { x: Float64Array; y: Float64Array; vertexCount: number }>(geometry: T): T {
    const t = this.view?.transform;
    if (!t || (t.scaleX === 1 && t.scaleY === 1 && t.offsetX === 0 && t.offsetY === 0)) {
      return geometry;
    }
    const { x, y, vertexCount } = geometry;
    for (let i = 0; i < vertexCount; i++) {
      x[i] = ((x[i] as number) - t.offsetX) / t.scaleX;
      y[i] = ((y[i] as number) - t.offsetY) / t.scaleY;
    }
    return geometry;
  }

  /**
   * A container point (px, top-left origin) in subplot px, the units of {@link GeoView.project}
   * and {@link GeoView.invert}.
   */
  toSubplot(x: number, y: number): [number, number] {
    return [x - this.rect.x, this.rect.y + this.rect.height - y];
  }

  /** Whether a container point is inside the part of the subplot that draws. */
  contains(x: number, y: number): boolean {
    const c = this.clipRect;
    return x >= c.x && x <= c.x + c.width && y >= c.y && y <= c.y + c.height;
  }

  /**
   * Subscribe to view changes made outside a layout pass (a drag or a wheel step previews through
   * {@link GeoView.set}, then calls {@link notify}). Compare {@link GeoView.version} to tell a
   * move, which only needs {@link transform}, from a rotation, which needs projecting again.
   * Returns the unsubscribe function.
   */
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Tell the subscribers that the view changed. A globe's camera follows the view first. */
  notify(): void {
    if (this.#globeViewport) this.#placeGlobe(this.#globeViewport);
    for (const listener of [...this.#listeners]) listener();
  }
}
