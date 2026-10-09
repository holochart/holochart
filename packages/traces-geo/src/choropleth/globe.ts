/**
 * `choropleth` on a 3D globe (backlog GEO8, ADR-028): the regions as a triangle mesh on the
 * sphere, raised into prisms by a second value, with their outlines, picked on the GPU.
 *
 * Everything here is built in **globe coordinates** (the unit sphere of `globe-frame.ts`) and
 * parented under the globe of the subplot's 3D viewport (`addToGlobe`), whose matrix the subplot
 * keeps. A rotation, a zoom or a pan of the globe is that matrix: this view builds nothing and
 * uploads nothing for it.
 *
 * ## What is drawn
 *
 * - **The surface**: one mesh of every drawn region (`buildSphereMesh` of the features), a color
 *   per vertex (the region's `z` through the colorscale, with the region's opacity as alpha),
 *   lit by the globe's light (`globe-light.ts`), front faces only, **without a depth test and without writing depth**: it lies on the
 *   globe's body, at the body's depth, and is ordered by `renderOrder` (the `backplot` slot of
 *   the choropleth layer order) between the base layers as on a flat map. The far hemisphere is
 *   back-facing and so not drawn.
 * - **The prisms** (`elevation`): a second mesh, `buildPrisms` of the same mesh, with the caps
 *   and walls of the raised regions in the region's color. It **tests and writes depth**: a prism
 *   hides what is behind it, and the globe's body hides the prisms behind the globe. A region
 *   whose elevation is 0, negative or not a number is not in it: it stays on the surface, in the
 *   surface mesh, which in turn leaves out the triangles of the raised regions (their footprints
 *   are under their prisms). Both meshes have a color for every vertex of every region, so they
 *   are opaque or translucent together and keep their order.
 * - **The outlines** (`marker.line`): 3D lines along the true boundary of each region
 *   (`SphereMesh.boundary`, chained into polylines: the edges a region only has because it was
 *   cut at the antimeridian are not on it), depth-tested against the body, {@link LINE_LIFT}
 *   above the surface (over every base line of the globe, which lie up to 0.001 above it), or
 *   above the cap of a raised region. Like the globe's other lines above the regions it is drawn
 *   with the translucent objects: smooth edges, no depth written.
 *
 * ## Redraw rules
 *
 * - A rotation, a zoom, a pan: nothing (see above). The subplot's change notification only tells
 *   the picker that the globe moved.
 * - A pipeline pass over the same drawn regions (a restyle of `z` with numbers where they were,
 *   `colorscale`, `zmin`…, opacities, a selection; also the relayout that ends a gesture):
 *   the colors of the meshes and the style of the line are written once more. No geometry.
 * - `elevation` or `elevationscale` changed: the prisms are built again from the mesh that is
 *   kept (no triangulation), the outline is lifted to the new caps, and the surface gets a new
 *   index when the set of raised regions changed.
 * - Other regions (`locations`, a `z` that changes which locations have a number, the features
 *   arriving): everything is built again.
 *
 * ## Cost
 *
 * Measured on an M1 Max in Node 26, the median of 5 runs, for every country of the basemap with
 * two thirds of them raised:
 *
 * | Basemap | Countries | Mesh vertices | `buildSphereMesh` | `buildPrisms` | Prism vertices | Outline |
 * | ------- | --------- | ------------- | ----------------- | ------------- | -------------- | ------- |
 * | 110m    | 177       | 16,136        | 14.6 ms           | 1.2 ms        | 40,184         | 0.9 ms  |
 * | 50m     | 242       | 107,047       | 94.2 ms           | 8.0 ms        | 359,879        | 1.9 ms  |
 *
 * The mesh is built once per set of drawn regions, the prisms once per `elevation`; a restyle of
 * colors writes four floats per vertex, and a rotation nothing.
 *
 * This module is lazy code: `plot.ts` imports it the first time a choropleth is drawn on a globe,
 * and waits for the features of the trace's locations itself.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import {
  createLazyMeshPrimitive,
  linesMarkers3DModule,
  type LazyMeshPrimitive,
  type Line3D,
  type Viewport,
} from '@mk7s/holochart-render';
import type { TracePlotContext, TraceUpdatePlan } from '@mk7s/holochart-runtime';
import { Matrix4 } from 'three';
import { globePicking, provideGlobePicker, type GlobePicking } from '../geo/globe-pick.ts';
import type { PrismMesh, SphereMesh } from '../geo/globe/index.ts';
import type { GeoSubplot } from '../geo/subplot.ts';
import type { ChoroplethCalc } from './calc.ts';
import type { GlobeRegions } from './globe-state.ts';
import type { OutlineVertices } from './plot.ts';
import type { DrawnRegions } from './regions.ts';

/**
 * What this module needs of the package's initial code. It is handed over by `plot.ts` when it
 * loads the module ({@link provideChoroplethGlobeDeps}) and not imported: the module then shares
 * no module with the package's initial code, and a bundler makes no chunk for what the two would
 * share (ADR-026; `geo/globe/deps.ts` and `a11y-loader.ts` do the same).
 */
export interface ChoroplethGlobeDeps {
  /** `geo/globe-loader.ts`: the globe's geometry builders, loaded. */
  readonly globeModule: typeof import('../geo/globe-loader.ts').globeModule;
  /** `geo/globe-scene.ts`. */
  readonly globeScene: typeof import('../geo/globe-scene.ts').globeScene;
  readonly addToGlobe: typeof import('../geo/globe-scene.ts').addToGlobe;
  /** `geo/globe-light.ts`: the light every mesh on a globe has. */
  readonly GLOBE_LIGHTING: typeof import('../geo/globe-light.ts').GLOBE_LIGHTING;
  readonly lightGlobeMesh: typeof import('../geo/globe-light.ts').lightGlobeMesh;
  /** `globe-state.ts`. */
  readonly setGlobeRegions: typeof import('./globe-state.ts').setGlobeRegions;
  /** `plot.ts`: the draw order and the styles the flat map has too. */
  readonly CHOROPLETH_LAYER: typeof import('./plot.ts').CHOROPLETH_LAYER;
  readonly choroplethOrder: typeof import('./plot.ts').choroplethOrder;
  readonly opacityOf: typeof import('./plot.ts').opacityOf;
  readonly outlineStyle: typeof import('./plot.ts').outlineStyle;
  readonly regionColors: typeof import('./plot.ts').regionColors;
  /** Render's `createPicker`, from its lazy picker chunk (`loadPicker`). */
  readonly createPicker: typeof import('@mk7s/holochart-render').createPicker;
}

let provided: ChoroplethGlobeDeps | undefined;

/** Hand the module what it needs. `plot.ts` does this before it creates a view. */
export function provideChoroplethGlobeDeps(deps: ChoroplethGlobeDeps): void {
  provided = deps;
  provideGlobePicker(deps.createPicker);
}

function deps(): ChoroplethGlobeDeps {
  if (!provided) {
    throw new Error('The globe view of choropleth was not loaded by its trace (plot.ts).');
  }
  return provided;
}

/**
 * How far above the surface, or above a prism's cap, an outline runs, in globe radii (0.6 px on
 * a globe 300 px in radius): clear of the facets of the mesh under it, which a line at the same
 * radius would dip into.
 */
export const LINE_LIFT = 0.002;

/**
 * The largest `elevationscale` that is drawn: one globe radius, the headroom the globe's camera
 * keeps above the surface (`GeoSubplot.placeCamera`). A larger value is drawn as this one.
 */
export const MAX_ELEVATION_SCALE = 1;

const RADIANS = Math.PI / 180;

// ---- Heights ------------------------------------------------------------------------------------

/**
 * The height of every drawn region's prism in globe radii, or `undefined` when no region is
 * raised (no `elevation`, or none above 0).
 *
 * The largest elevation of the trace is `elevationscale` high (capped at
 * {@link MAX_ELEVATION_SCALE}, the headroom the globe's camera keeps above the surface) and the
 * others in proportion. As the color domain spans every number of `z`, the largest elevation is
 * the largest of every location, drawn or not. An elevation that is 0, negative or not a number
 * leaves its region on the surface (height 0).
 */
export function regionHeights(
  calc: Pick<ChoroplethCalc, 'elevation' | 'length'>,
  trace: FullTrace,
  drawn: DrawnRegions,
): Float64Array | undefined {
  const elevation = calc.elevation;
  if (!elevation) return undefined;
  const count = Math.min(calc.length, elevation.length);
  let max = 0;
  for (let i = 0; i < count; i++) {
    const e = elevation[i] as number;
    if (e > max && Number.isFinite(e)) max = e;
  }
  // Defaulted with `elevation` (`defaults.ts`).
  const given = trace['elevationscale'];
  const scale = Math.min(
    MAX_ELEVATION_SCALE,
    typeof given === 'number' && Number.isFinite(given) ? given : 0,
  );
  if (!(max > 0) || !(scale > 0)) return undefined;
  const heights = new Float64Array(drawn.index.length);
  let raised = 0;
  for (let k = 0; k < heights.length; k++) {
    const i = drawn.index[k] as number;
    const e = i < count ? (elevation[i] as number) : NaN;
    if (!(e > 0) || !Number.isFinite(e)) continue;
    heights[k] = (e / max) * scale;
    raised++;
  }
  return raised > 0 ? heights : undefined;
}

function sameHeights(a: Float64Array | undefined, b: Float64Array | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}

/** Whether the same regions are raised in `a` and in `b` (to whatever height). */
function sameRaised(a: Float64Array | undefined, b: Float64Array | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++)
    if ((a[k] as number) > 0 !== (b[k] as number) > 0) return false;
  return true;
}

// ---- Geometry -----------------------------------------------------------------------------------

/**
 * The triangles of `mesh` whose region lies on the surface: all of them (`mesh.indices` itself)
 * when none is raised.
 */
export function surfaceIndices(mesh: SphereMesh, heights: Float64Array | undefined): Uint32Array {
  if (!heights) return mesh.indices;
  const { indices, featureOf } = mesh;
  const out = new Uint32Array(indices.length);
  let n = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] as number;
    // Regions share no vertices: a triangle's first vertex names its region.
    if ((heights[featureOf[a] as number] as number) > 0) continue;
    out[n++] = a;
    out[n++] = indices[t + 1] as number;
    out[n++] = indices[t + 2] as number;
  }
  return out.slice(0, n);
}

/** The boundary of a mesh's regions as polylines of its vertices. */
export interface GlobeOutline extends OutlineVertices {
  /** The mesh vertex of each line vertex. */
  readonly vertex: Uint32Array;
  /** The start vertex of every polyline after the first (the layout of render's lines). */
  readonly starts: Uint32Array;
}

/**
 * Chain the boundary edges of `mesh` into polylines, so that the line primitive joins them: a
 * ring comes back to its first vertex, and a boundary that was cut (at the antimeridian, where
 * the mesh has the vertices of both sides) is an open line from one end to the other.
 */
export function outlineOfMesh(mesh: SphereMesh): GlobeOutline {
  const { boundary, boundaryCount, featureOf, vertexCount } = mesh;
  // The edges that start at each vertex, as a linked list (a pinch point starts more than one).
  const first = new Int32Array(vertexCount).fill(-1);
  const next = new Int32Array(boundaryCount).fill(-1);
  const incoming = new Uint8Array(vertexCount);
  for (let e = boundaryCount - 1; e >= 0; e--) {
    const a = boundary[2 * e] as number;
    next[e] = first[a] as number;
    first[a] = e;
    incoming[boundary[2 * e + 1] as number] = 1;
  }
  const used = new Uint8Array(boundaryCount);
  const vertex: number[] = [];
  const starts: number[] = [];
  const walk = (start: number): void => {
    if (vertex.length > 0) starts.push(vertex.length);
    vertex.push(boundary[2 * start] as number);
    let e = start;
    while (e >= 0) {
      used[e] = 1;
      const b = boundary[2 * e + 1] as number;
      vertex.push(b);
      e = first[b] as number;
      while (e >= 0 && used[e] === 1) e = next[e] as number;
    }
  };
  // Open lines first, from the end nothing leads to; what is left are rings.
  for (let e = 0; e < boundaryCount; e++) {
    if (used[e] === 0 && incoming[boundary[2 * e] as number] === 0) walk(e);
  }
  for (let e = 0; e < boundaryCount; e++) if (used[e] === 0) walk(e);
  const region = new Uint32Array(vertex.length);
  for (let v = 0; v < vertex.length; v++) region[v] = featureOf[vertex[v] as number] as number;
  return {
    vertex: Uint32Array.from(vertex),
    starts: Uint32Array.from(starts),
    region,
    vertexCount: vertex.length,
  };
}

/** The positions of an outline: its mesh vertices, lifted above the surface or the cap. */
function outlinePositions(
  mesh: SphereMesh,
  outline: GlobeOutline,
  heights: Float64Array | undefined,
): { x: Float32Array; y: Float32Array; z: Float32Array } {
  const n = outline.vertexCount;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const p = mesh.positions;
  for (let v = 0; v < n; v++) {
    const m = 3 * (outline.vertex[v] as number);
    const r = 1 + LINE_LIFT + (heights ? (heights[outline.region[v] as number] as number) : 0);
    x[v] = (p[m] as number) * r;
    y[v] = (p[m + 1] as number) * r;
    z[v] = (p[m + 2] as number) * r;
  }
  return { x, y, z };
}

/** A color per vertex from a color per region. */
function vertexColors(regions: Float32Array, featureOf: Uint32Array, count: number): Float32Array {
  const color = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    const k = 4 * (featureOf[v] as number);
    color[4 * v] = regions[k] as number;
    color[4 * v + 1] = regions[k + 1] as number;
    color[4 * v + 2] = regions[k + 2] as number;
    color[4 * v + 3] = regions[k + 3] as number;
  }
  return color;
}

// ---- The view -----------------------------------------------------------------------------------

const MATRIX = new Matrix4();
const POINT: [number, number, number] = [0, 0, 0];

/**
 * What `plot.ts` holds of the globe's view. `viewport` is the globe's 3D viewport
 * (`GeoSubplot.globeViewport`), which `plot.ts` asks the runtime for in every pipeline pass: a
 * draw between two passes (when the globe's code has loaded) gets the one of the last pass, and
 * does not ask, which would keep the viewport alive for a pass in which nobody draws in it.
 */
export interface ChoroplethGlobeView {
  update(
    ctx: TracePlotContext<ChoroplethCalc>,
    plan: TraceUpdatePlan,
    viewport: Viewport | undefined,
  ): void;
  /** Remove everything drawn (the subplot is no longer a globe). */
  clear(ctx: TracePlotContext<ChoroplethCalc>): void;
  dispose(): void;
}

class GlobeView implements ChoroplethGlobeView, GlobeRegions {
  #ctx: TracePlotContext<ChoroplethCalc>;
  #subplot: GeoSubplot | undefined;
  #off: (() => void) | undefined;

  /** The globe's 3D viewport, from the last pipeline pass. */
  #viewport: Viewport | undefined;
  #picking: GlobePicking | undefined;
  #surface: LazyMeshPrimitive | undefined;
  #surfaceKey = -1;
  #prisms: LazyMeshPrimitive | undefined;
  #prismsKey = -1;
  #line: Line3D | undefined;

  /** What the primitives hold: the regions, their mesh and outline, the heights and prisms. */
  #drawn: DrawnRegions | undefined;
  #mesh: SphereMesh | undefined;
  #outline: GlobeOutline | undefined;
  #heights: Float64Array | undefined;
  #prismMesh: PrismMesh | undefined;
  /** The heights the outline's positions were lifted by (`null`: not placed yet). */
  #lineHeights: Float64Array | undefined | null = null;
  /** The drawn region of each location, -1 where it is not drawn. */
  #regionOf: Int32Array | undefined;

  constructor(ctx: TracePlotContext<ChoroplethCalc>, viewport: Viewport | undefined) {
    this.#ctx = ctx;
    this.#draw(ctx, viewport);
  }

  update(
    ctx: TracePlotContext<ChoroplethCalc>,
    _plan: TraceUpdatePlan,
    viewport: Viewport | undefined,
  ): void {
    this.#ctx = ctx;
    this.#draw(ctx, viewport);
  }

  #follow(subplot: GeoSubplot | undefined): void {
    if (subplot === this.#subplot) return;
    this.#off?.();
    this.#subplot = subplot;
    this.#off = subplot?.onChange(() => {
      // The subplot has placed the globe: nothing is built. A pick made before is stale.
      this.#picking?.changed(false);
      this.#ctx.invalidate();
    });
  }

  /** Bring the primitives up to date, in `viewport`. */
  #draw(ctx: TracePlotContext<ChoroplethCalc>, viewport: Viewport | undefined): void {
    const { calc, trace } = ctx;
    const d = deps();
    const subplot = calc.subplot;
    this.#follow(subplot);
    const drawn = calc.drawn;
    const globe = d.globeModule();
    // No globe, a stand-in viewport of a hand-built context, or no region to draw: draw nothing.
    if (
      !subplot?.globe ||
      !subplot.view?.valid ||
      !globe ||
      viewport?.kind !== '3d' ||
      !drawn ||
      drawn.features.length === 0
    ) {
      this.#remove(ctx);
      return;
    }
    // Another viewport (the trace moved to another subplot): what is drawn is in the old one.
    if (this.#viewport && viewport !== this.#viewport) this.#remove(ctx);
    this.#viewport = viewport;
    this.#picking ??= globePicking(viewport, d.globeScene).acquire();
    const picking = this.#picking;
    picking.attach(subplot.chart);
    const order = d.choroplethOrder(ctx.index);
    let moved = false;

    // The mesh: once per drawn regions.
    let mesh = this.#mesh;
    const rebuilt = !mesh || drawn !== this.#drawn;
    if (!mesh || rebuilt) {
      mesh = this.#mesh = globe.buildSphereMesh(drawn.features);
      this.#drawn = drawn;
      this.#outline = undefined;
      this.#lineHeights = null;
      this.#prismMesh = undefined;
      const regionOf = new Int32Array(calc.length).fill(-1);
      for (let k = 0; k < drawn.index.length; k++) regionOf[drawn.index[k] as number] = k;
      this.#regionOf = regionOf;
    }

    // The heights: the prisms are built again when one changed, from the mesh that is kept.
    let heights = regionHeights(calc, trace, drawn);
    const raise = rebuilt || !sameHeights(heights, this.#heights);
    const reindex = rebuilt || !sameRaised(heights, this.#heights);
    // The same heights are the same array: what was built from it is told by it.
    if (!raise) heights = this.#heights;
    this.#heights = heights;

    const regions = d.regionColors(ctx, drawn);
    const opacity = d.opacityOf(trace);

    // The surface.
    const colors = { color: vertexColors(regions, mesh.featureOf, mesh.vertexCount), opacity };
    if (!this.#surface) {
      this.#surface = createLazyMeshPrimitive(ctx.primitives, {
        positions: mesh.positions,
        normals: mesh.normals,
        indices: surfaceIndices(mesh, heights),
        side: 'front',
        // On the body's surface, at the body's depth: ordered, not depth-tested (ADR-028).
        // On the surface: tested against the body, which lies under it, and against prisms.
        depthTest: true,
        depthWrite: false,
        lighting: d.GLOBE_LIGHTING,
        // Front faces of a sphere never overlap: there is nothing to sort when the globe turns.
        sortTriangles: false,
        ...colors,
      });
      d.lightGlobeMesh(this.#surface);
      ctx.add(this.#surface, viewport);
      d.addToGlobe(viewport, this.#surface.object);
      this.#surfaceKey = picking.register(this.#surface);
      moved = true;
    } else if (rebuilt) {
      this.#surface.update({
        positions: mesh.positions,
        normals: mesh.normals,
        indices: surfaceIndices(mesh, heights),
        ...colors,
      });
      moved = true;
    } else if (reindex) {
      this.#surface.update({ indices: surfaceIndices(mesh, heights), ...colors });
      moved = true;
    } else this.#surface.update(colors);
    this.#surface.object.renderOrder = order + d.CHOROPLETH_LAYER.fill;

    // The prisms.
    if (heights) {
      let prisms = this.#prismMesh;
      const built = !prisms || raise;
      if (!prisms || built) {
        prisms = this.#prismMesh = globe.buildPrisms(mesh, heights, { raisedOnly: true });
      }
      const prismColors = {
        color: vertexColors(regions, prisms.featureOf, prisms.vertexCount),
        opacity,
      };
      const geometry = {
        positions: prisms.positions,
        normals: prisms.normals,
        indices: prisms.indices,
      };
      if (!this.#prisms) {
        this.#prisms = createLazyMeshPrimitive(ctx.primitives, {
          ...geometry,
          side: 'front',
          // Above the surface: hidden by what is in front, the globe's body included.
          depthTest: true,
          depthWrite: true,
          lighting: d.GLOBE_LIGHTING,
          ...prismColors,
        });
        d.lightGlobeMesh(this.#prisms);
        ctx.add(this.#prisms, viewport);
        d.addToGlobe(viewport, this.#prisms.object);
        this.#prismsKey = picking.register(this.#prisms);
        moved = true;
      } else if (built) {
        this.#prisms.update({ ...geometry, ...prismColors });
        moved = true;
      } else this.#prisms.update(prismColors);
      this.#prisms.object.renderOrder =
        order + (d.CHOROPLETH_LAYER.fill + d.CHOROPLETH_LAYER.line) / 2;
    } else {
      this.#prismMesh = undefined;
      if (this.#prisms) {
        picking.unregister(this.#prisms);
        ctx.remove(this.#prisms);
        this.#prisms = undefined;
        this.#prismsKey = -1;
      }
    }

    // The outlines: the mesh's boundary, on the surface or on the caps.
    const style = d.outlineStyle(ctx);
    if (style) {
      const outline = (this.#outline ??= outlineOfMesh(mesh));
      const placed = this.#line !== undefined && this.#lineHeights === heights;
      const positions = placed
        ? undefined
        : { ...outlinePositions(mesh, outline, heights), starts: outline.starts };
      this.#lineHeights = heights;
      if (!this.#line) {
        this.#line = linesMarkers3DModule()!.createLine3D(
          ctx.primitives,
          { ...positions, ...style(outline) },
          // Against the body and the prisms; with the translucent objects, as the globe's other
          // lines above the regions are (`globe-layers.ts`): smooth edges, and in layer order.
          { depthTest: true, blend: 'translucent' },
        );
        ctx.add(this.#line, viewport);
        d.addToGlobe(viewport, this.#line.object);
      } else this.#line.update({ ...positions, ...style(outline) });
      this.#line.object.renderOrder = order + d.CHOROPLETH_LAYER.line;
    } else if (this.#line) {
      ctx.remove(this.#line);
      this.#line = undefined;
      this.#lineHeights = null;
    }

    // What is under the pointer may be another region now.
    if (moved) picking.changed();
    else picking.changed(false);
    d.setGlobeRegions(calc, this);
  }

  // ---- What hover asks (`GlobeRegions`) ---------------------------------------------------------

  locationAt(cx: number, cy: number): number {
    const drawn = this.#drawn;
    const picking = this.#picking;
    if (!drawn || !picking) return -1;
    // The one thing in front at the pointer, of every trace on the globe.
    for (const hit of picking.hits(cx, cy)) {
      const featureOf =
        hit.traceIndex === this.#surfaceKey
          ? this.#mesh?.featureOf
          : hit.traceIndex === this.#prismsKey
            ? this.#prismMesh?.featureOf
            : undefined;
      const region = featureOf?.[hit.pointIndex];
      if (region !== undefined && region < drawn.index.length) return drawn.index[region] as number;
    }
    return -1;
  }

  height(i: number): number {
    const k = this.#regionOf?.[i] ?? -1;
    return k >= 0 ? (this.#heights?.[k] ?? 0) : 0;
  }

  anchor(i: number): [number, number] | null | undefined {
    const h = this.height(i);
    if (!(h > 0)) return undefined;
    const { calc } = this.#ctx;
    const subplot = calc.subplot;
    const lon = calc.lon?.[i];
    const lat = calc.lat?.[i];
    if (!subplot?.view?.valid || lon === undefined || lat === undefined || Number.isNaN(lon)) {
      return null;
    }
    // The top of the prism above the feature's point, in the px of the globe's viewport.
    const e = subplot.globeMatrix(MATRIX).elements as unknown as number[];
    // Globe coordinates (`globe-frame.ts`) of the point, at the cap's radius.
    const p = POINT;
    const r = (1 + h) * Math.cos(lat * RADIANS);
    p[0] = r * Math.sin(lon * RADIANS);
    p[1] = (1 + h) * Math.sin(lat * RADIANS);
    p[2] = r * Math.cos(lon * RADIANS);
    const x = e[0]! * p[0] + e[4]! * p[1] + e[8]! * p[2] + e[12]!;
    const y = e[1]! * p[0] + e[5]! * p[1] + e[9]! * p[2] + e[13]!;
    const z = e[2]! * p[0] + e[6]! * p[1] + e[10]! * p[2] + e[14]!;
    // Behind the globe's centre and inside its disc: the body hides it.
    if (z < 0 && Math.hypot(x - e[12]!, y - e[13]!) < subplot.globeRadius) return null;
    const clip = subplot.clipRect;
    const cx = clip.x + x;
    const cy = clip.y + clip.height - y;
    return subplot.contains(cx, cy) ? [cx, cy] : null;
  }

  // ---- Removal ----------------------------------------------------------------------------------

  /** Remove the primitives and forget what they held. */
  #remove(ctx: TracePlotContext<ChoroplethCalc>): void {
    const picking = this.#picking;
    if (this.#surface) {
      picking?.unregister(this.#surface);
      ctx.remove(this.#surface);
    }
    if (this.#prisms) {
      picking?.unregister(this.#prisms);
      ctx.remove(this.#prisms);
    }
    if (this.#line) ctx.remove(this.#line);
    picking?.release();
    this.#picking = undefined;
    this.#surface = undefined;
    this.#prisms = undefined;
    this.#line = undefined;
    this.#surfaceKey = this.#prismsKey = -1;
    this.#viewport = undefined;
    this.#drawn = undefined;
    this.#mesh = undefined;
    this.#outline = undefined;
    this.#heights = undefined;
    this.#prismMesh = undefined;
    this.#lineHeights = null;
    this.#regionOf = undefined;
    const { setGlobeRegions } = deps();
    setGlobeRegions(this.#ctx.calc, undefined);
    setGlobeRegions(ctx.calc, undefined);
  }

  clear(ctx: TracePlotContext<ChoroplethCalc>): void {
    this.#remove(ctx);
  }

  dispose(): void {
    this.#off?.();
    this.#off = undefined;
    this.#subplot = undefined;
    // The runtime removes the primitives; the picker must not keep them.
    const picking = this.#picking;
    if (picking) {
      if (this.#surface) picking.unregister(this.#surface);
      if (this.#prisms) picking.unregister(this.#prisms);
      picking.release();
    }
    this.#picking = undefined;
    deps().setGlobeRegions(this.#ctx.calc, undefined);
  }
}

/** The globe's view of a choropleth (see the module comment). */
export function createChoroplethGlobeView(
  ctx: TracePlotContext<ChoroplethCalc>,
  viewport: Viewport | undefined,
): ChoroplethGlobeView {
  return new GlobeView(ctx, viewport);
}
