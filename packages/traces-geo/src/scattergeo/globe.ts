/**
 * The line and the `toself` fill of a `scattergeo` trace on a 3D globe (backlog GEO8, ADR-028).
 * Markers and text stay on the 2D path (`plot.ts`): projected by the view, hidden on the far
 * side on the CPU, drawn in the subplot's 2D viewport above the globe.
 *
 * Both parts are built in **globe coordinates** (the unit sphere of `globe-frame.ts`) and
 * parented under the globe of the subplot's 3D viewport (`addToGlobe`), whose matrix the subplot
 * keeps: a rotation, a zoom or a pan builds nothing and uploads nothing here.
 *
 * - **The line** is `buildArcs` of the trace's runs: each segment follows its great circle and
 *   rises above the surface in its middle, `line.lift` globe radii per radian of its length, so
 *   a long route stands clear of the globe and passes behind it where it is behind it. One 3D
 *   line, depth-tested against the globe's body, with the trace's `line.color`, `line.width`
 *   and `line.dash`. An arc starts and ends where its points' markers are drawn. The line of a
 *   filled trace is the outline of its fill: it is closed, as on a flat map, and stays on the
 *   surface.
 * - **The fill** (`fill: 'toself'`) is `buildSphereMesh` of the rings the flat map fills: a mesh
 *   on the surface, lit by the globe's light, front faces only, without a depth test (it lies on
 *   the body, ADR-028 "Depth"), under the line in the trace's slot of the draw order. It is
 *   always drawn with the translucent objects, as the globe's lines and lakes are, so that it is
 *   above them as on a flat map.
 *
 * What is on the surface is drawn {@link SURFACE_LIFT} above it, over every base line of the
 * globe (they lie up to 0.001 above it).
 * A line at the sphere's own radius would dip into the facets of the body's mesh.
 *
 * ## Redraw rules
 *
 * The geometry is of the trace's path (`geoPath`: one object per calc, `connectgaps` and fill)
 * and of `line.lift`. A pipeline pass with the same path and lift (a restyle of the line or the
 * fill color, the relayout that ends a gesture) writes the style and nothing else.
 *
 * This module is lazy code: `plot.ts` imports it the first time a trace draws a line or a fill
 * on a globe.
 */
import type { FullTrace, RGBAColor } from '@mk7s/holochart-core';
import {
  createLazyMeshPrimitive,
  linesMarkers3DModule,
  type LazyMeshPrimitive,
  type Line3D,
  type Line3DData,
  type Viewport,
} from '@mk7s/holochart-render';
import type { TracePlotContext } from '@mk7s/holochart-runtime';
import type { ScattergeoCalc } from './calc.ts';
import type { GeoPath } from './lines.ts';

/**
 * What this module needs of the package's initial code. It is handed over by `plot.ts` when it
 * loads the module ({@link provideScattergeoGlobeDeps}) and not imported: the module then shares
 * no module with the package's initial code, and a bundler makes no chunk for what the two would
 * share (ADR-026; `geo/globe/deps.ts` and `a11y-loader.ts` do the same).
 */
export interface ScattergeoGlobeDeps {
  /** `geo/globe-loader.ts`: the globe's geometry builders, loaded. */
  readonly globeModule: typeof import('../geo/globe-loader.ts').globeModule;
  /** `geo/globe-scene.ts`. */
  readonly addToGlobe: typeof import('../geo/globe-scene.ts').addToGlobe;
  /** `geo/globe-light.ts`: the light every mesh on a globe has. */
  readonly GLOBE_LIGHTING: typeof import('../geo/globe-light.ts').GLOBE_LIGHTING;
  readonly lightGlobeMesh: typeof import('../geo/globe-light.ts').lightGlobeMesh;
}

let provided: ScattergeoGlobeDeps | undefined;

/** Hand the module what it needs. `plot.ts` does this before it draws with it. */
export function provideScattergeoGlobeDeps(deps: ScattergeoGlobeDeps): void {
  provided = deps;
}

function deps(): ScattergeoGlobeDeps {
  if (!provided) {
    throw new Error('The globe parts of scattergeo were not loaded by their trace (plot.ts).');
  }
  return provided;
}

/**
 * The largest `line.lift` that is drawn: an arc to the antipode is then one globe radius high,
 * the room the globe's camera keeps above the surface. A larger value is drawn as this one.
 */
export const MAX_LINE_LIFT = 1 / Math.PI;

/**
 * How far above the surface a line that lies on it is drawn, in globe radii (0.6 px on a globe
 * 300 px in radius), and where a lifted arc starts and ends: under its marker to the pixel.
 */
export const SURFACE_LIFT = 0.002;

/**
 * The opacity that puts a mesh among the translucent objects, which three.js draws after the
 * opaque ones: it changes a color by less than one step of 255.
 */
const BLENDED = 1 - 1 / 1024;

/** What the globe's parts are drawn with, in one pass. */
export interface GlobePartsInput {
  /** The globe's 3D viewport. */
  readonly viewport: Viewport;
  /** The trace's path; its `polygons` are set when the trace is filled. */
  readonly path: GeoPath;
  /** The trace draws its line (`mode` has `lines`). */
  readonly lines: boolean;
  /** `fill: 'toself'`. */
  readonly fill: boolean;
  /** The trace's line style, as the flat map's line takes it. */
  readonly lineStyle: Partial<Line3DData>;
  readonly fillStyle: { color: RGBAColor; opacity: number };
  /** `renderOrder` of the line and of the fill. */
  readonly lineOrder: number;
  readonly fillOrder: number;
}

/** The line and the fill of one trace on a globe. */
export interface ScattergeoGlobeParts {
  draw(ctx: TracePlotContext<ScattergeoCalc>, input: GlobePartsInput): void;
  /** Remove both. */
  clear(ctx: TracePlotContext<ScattergeoCalc>): void;
}

/**
 * The lift of a trace's arcs in globe radii per radian: `line.lift`, at most {@link MAX_LINE_LIFT}
 * (where an arc to the antipode is one radius high, the room the globe's camera keeps above the
 * surface), and 0 for a filled trace, whose line is the outline of its fill.
 */
export function liftOf(trace: FullTrace): number {
  if (trace['fill'] === 'toself') return 0;
  // Defaulted with a line (`defaults.ts`); a trace built by hand gets the arcs' own default.
  const lift = (trace['line'] as { lift?: unknown } | undefined)?.lift;
  const value =
    typeof lift === 'number' && Number.isFinite(lift)
      ? lift
      : (deps().globeModule()?.DEFAULT_LIFT ?? 0);
  return Math.max(0, Math.min(MAX_LINE_LIFT, value));
}

/** The runs of a path as `lon` and `lat` with a gap between two runs, as `buildArcs` reads them. */
function runsOf(path: GeoPath): { lon: number[]; lat: number[] } {
  const lon: number[] = [];
  const lat: number[] = [];
  for (const run of path.lines.coordinates) {
    if (lon.length > 0) {
      lon.push(NaN);
      lat.push(NaN);
    }
    for (const p of run) {
      lon.push(p[0] as number);
      lat.push(p[1] as number);
    }
  }
  return { lon, lat };
}

class GlobeParts implements ScattergeoGlobeParts {
  #viewport: Viewport | undefined;
  #line: Line3D | undefined;
  #fill: LazyMeshPrimitive | undefined;
  /** What the line was built from. */
  #linePath: GeoPath | undefined;
  #lift = NaN;
  /** What the fill was built from. */
  #fillPath: GeoPath | undefined;

  draw(ctx: TracePlotContext<ScattergeoCalc>, input: GlobePartsInput): void {
    const d = deps();
    const globe = d.globeModule();
    const lines3d = linesMarkers3DModule();
    const { viewport, path } = input;
    if (!globe || !lines3d || viewport.kind !== '3d') {
      this.clear(ctx);
      return;
    }
    // Another viewport (the trace moved to another subplot): what is drawn is in the old one.
    if (this.#viewport && viewport !== this.#viewport) this.clear(ctx);
    this.#viewport = viewport;

    // The line: arcs above the surface.
    if (input.lines) {
      const lift = liftOf(ctx.trace);
      const stale = path !== this.#linePath || lift !== this.#lift;
      let geometry:
        { x: Float32Array; y: Float32Array; z: Float32Array; starts: Uint32Array } | undefined;
      if (stale || !this.#line) {
        const { lon, lat } = runsOf(path);
        // The runs are already split at the gaps `connectgaps` leaves.
        const arcs = globe.buildArcs(lon, lat, { lift, radius: 1 + SURFACE_LIFT });
        geometry = { x: arcs.x, y: arcs.y, z: arcs.z, starts: arcs.starts };
        this.#linePath = path;
        this.#lift = lift;
      }
      if (!this.#line) {
        this.#line = lines3d.createLine3D(
          ctx.primitives,
          { ...geometry, ...input.lineStyle },
          // Against the globe's body and what stands on it: an arc passes behind the globe. With
          // the translucent objects, as the globe's base lines: smooth edges, in layer order.
          { depthTest: true, blend: 'translucent' },
        );
        ctx.add(this.#line, viewport);
        d.addToGlobe(viewport, this.#line.object);
      } else this.#line.update({ ...geometry, ...input.lineStyle });
      this.#line.object.renderOrder = input.lineOrder;
    } else this.#removeLine(ctx);

    // The fill: a mesh on the surface.
    const polygons = input.fill ? path.polygons : undefined;
    if (polygons && polygons.coordinates.length > 0) {
      const stale = path !== this.#fillPath;
      const mesh = stale || !this.#fill ? globe.buildSphereMesh(polygons) : undefined;
      const geometry = mesh
        ? { positions: mesh.positions, normals: mesh.normals, indices: mesh.indices }
        : undefined;
      this.#fillPath = path;
      // Above every base layer, of which the lines and the lakes are drawn with the translucent
      // objects: an opaque fill is put among them too, or they would be drawn over it.
      const style = {
        color: input.fillStyle.color,
        opacity: Math.min(input.fillStyle.opacity, BLENDED),
      };
      if (!this.#fill) {
        this.#fill = createLazyMeshPrimitive(ctx.primitives, {
          ...(geometry as NonNullable<typeof geometry>),
          side: 'front',
          // On the body's surface, at the body's depth: ordered, not depth-tested.
          // On the surface: tested against the body, which lies under it, and against prisms.
          depthTest: true,
          depthWrite: false,
          lighting: d.GLOBE_LIGHTING,
          // Front faces of a sphere never overlap: there is nothing to sort when the globe turns.
          sortTriangles: false,
          ...style,
        });
        d.lightGlobeMesh(this.#fill);
        ctx.add(this.#fill, viewport);
        d.addToGlobe(viewport, this.#fill.object);
      } else this.#fill.update({ ...geometry, ...style });
      this.#fill.object.renderOrder = input.fillOrder;
    } else this.#removeFill(ctx);
  }

  #removeLine(ctx: TracePlotContext<ScattergeoCalc>): void {
    if (this.#line) ctx.remove(this.#line);
    this.#line = undefined;
    this.#linePath = undefined;
    this.#lift = NaN;
  }

  #removeFill(ctx: TracePlotContext<ScattergeoCalc>): void {
    if (this.#fill) ctx.remove(this.#fill);
    this.#fill = undefined;
    this.#fillPath = undefined;
  }

  clear(ctx: TracePlotContext<ScattergeoCalc>): void {
    this.#removeLine(ctx);
    this.#removeFill(ctx);
    this.#viewport = undefined;
  }
}

/** The globe's parts of a scattergeo trace (see the module comment). */
export function createScattergeoGlobeParts(): ScattergeoGlobeParts {
  return new GlobeParts();
}
