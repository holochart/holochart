/**
 * From GeoJSON to the render primitives' input, through a `d3-geo` projection (backlog GEO2 and
 * GEO5, ADR-025): the projection's stream writes straight into flat typed arrays, in the layout of
 * render's `FillGeometryInput` ({@link projectPolygons}) and `LineGeometryInput`
 * ({@link projectLines}). No projected GeoJSON is built on the way, and a reused output allocates
 * nothing, because this runs on every frame of a rotation.
 *
 * **Coordinates.** A d3 projection emits px with y down from the top-left corner. The output is in
 * subplot px, y **up** from the bottom edge, so every y is `height - y`.
 *
 * **Ring sign.** In the output's y-up px an outer ring has a **negative** shoelace area (it runs
 * clockwise on screen) and a hole a positive one. That is d3's own convention, seen through the
 * flip: d3 wants outer rings clockwise on the sphere, its projections keep the orientation, and its
 * clip closes cut rings the same way round. It holds for whole polygons and for clipped ones, and
 * the tests check it against `geoPath().area()`. A projection that mirrors (`reflectX` without
 * `reflectY`) would invert it; none of Plotly's does.
 *
 * **Ring grouping.** Between `polygonStart` and `polygonEnd` d3 emits the rings of one source
 * polygon (a multipolygon is one such group per member, so groups are small: at most 4 rings in
 * the 50m countries). After clipping the rings come in any order: a polygon cut in two has two
 * outer rings, holes can come before the ring that holds them, some rings repeat their first
 * vertex at the end and some do not, and the clip edge leaves slivers. A group is staged in
 * scratch arrays and written out when it ends:
 *
 * - a ring with fewer than 3 vertices, or with an area of at most {@link MIN_RING_AREA}, is
 *   dropped;
 * - every hole goes to the smallest outer ring that contains it (a vertex of the hole is tested
 *   against the outer rings whose box holds it, and a few more vertices if the first is in none);
 * - each outer ring, in d3's order, becomes a polygon: itself, then its holes;
 * - a hole that no outer ring contains is dropped and counted in {@link sinkStats}. Such rings are
 *   real: where a polygon leaves a sliver along a curved clip edge, thinner than the sagitta of
 *   the chord d3 closes it with (which is under the projection's precision), the chord passes on
 *   the wrong side of the sliver and the ring comes out inverted, with no outer ring around it.
 *   An orthographic view of the 50m countries, 1,024 px wide, has 3 or 4 of them in a frame, all
 *   within 0.13 px of the limb and about 1 px² together. `geoPath` would fill them.
 *
 * **Seams.** Four projections (`hasSeams` in `projections.ts`: Peirce's and Gringorten's
 * quincuncial, Guyou, Gringorten) jump across lines that d3 does not cut at. A ring that crosses
 * such a seam leaves by a long edge, along a side of the map or across it, and comes back by
 * another that retraces it: a corridor without width between two parts of the ring. The ring is
 * then not a simple polygon. `geoPath` fills it by the nonzero rule, under which a corridor
 * encloses nothing; a triangulation that takes the ring for a simple polygon fills triangles
 * across the map (up to half of it, measured on the 110m land). The rings are passed on as d3
 * emits them, and {@link projectedFillRule} says which rule fills them: give it to the fill
 * primitive (`fillRule`) with the output. Pairing the corridors' edges here to cut such rings
 * apart was tried and does not work: three crossings of one seam leave it open which two belong
 * together.
 *
 * **Cost.** Linear in the vertices d3 emits: each is written twice (staged, then copied), and each
 * ring is scanned once for its area and box. A group with holes adds, per hole, a point-in-ring
 * scan of the outer rings of the group whose box holds the hole's first vertex (of up to
 * {@link HOLE_PROBES} vertices for a hole that is in none), so a polygon with `h` holes in an
 * outer ring of `v` vertices costs `O(h · v)`. For the 50m countries (98,000 vertices, 1,616
 * polygons) the sink's whole share is about 1 ms of a call of 27 to 34 ms, and 0.1 ms of 3 to 4 ms
 * at 110m (an M1 Max); the rest is d3's clipping and resampling.
 */
import { geoStream } from 'd3-geo';
import type {
  GeoGeometryObjects,
  GeoPermissibleObjects,
  GeoStream,
  GeoStreamWrapper,
} from 'd3-geo';
import { hasSeams } from './projections.ts';
import type { ProjectedLines, ProjectedPolygons } from './types.ts';

/** A GeoJSON feature as far as projecting reads it; `id` and `properties` stay the caller's. */
export interface GeoFeatureInput {
  readonly type: 'Feature';
  readonly geometry: GeoGeometryObjects | null;
}

/** A GeoJSON feature collection as far as projecting reads it. */
export interface GeoFeatureCollectionInput {
  readonly type: 'FeatureCollection';
  readonly features: readonly GeoFeatureInput[];
}

/**
 * What {@link projectPolygons} and {@link projectLines} take: a geometry (d3's `Sphere` and
 * geometry collections included), a feature, a feature collection, or an array of features.
 */
export type GeoInput =
  GeoGeometryObjects | GeoFeatureInput | GeoFeatureCollectionInput | readonly GeoFeatureInput[];

/**
 * Rings with an area of at most this, in px², are dropped. The slivers d3's clip leaves on the
 * clip edge run from 10⁻⁹ px² upwards with no gap to real geometry (the smallest islands of the
 * 50m world are near 10⁻³ px² in a world view), so the cut is by what can be seen: a ring this
 * small stays under a hundredth of a px² after a zoom of 100 without reprojection.
 */
export const MIN_RING_AREA = 1e-6;

/** How many vertices of a hole are tried, at most, to find the outer ring it is in. */
export const HOLE_PROBES = 8;

/** Counters of what the sinks threw away, for debugging. They only ever grow; zero them freely. */
export interface SinkStats {
  /** Rings dropped for having fewer than 3 vertices or no area. */
  degenerateRings: number;
  /** Rings with the sign of a hole that no outer ring of their polygon contains. */
  orphanHoles: number;
  /** Points the projection returned as NaN or ±Infinity. */
  nonFinitePoints: number;
}

export const sinkStats: SinkStats = { degenerateRings: 0, orphanHoles: 0, nonFinitePoints: 0 };

const INITIAL_VERTICES = 1024;
const INITIAL_RINGS = 64;

/** What a sink holds between calls, so that it does not keep the last output alive. */
const EMPTY_FLOAT64: Float64Array = new Float64Array(0);
const EMPTY_UINT32: Uint32Array = new Uint32Array(0);

function grownFloat64(a: Float64Array, used: number, needed: number): Float64Array {
  const next = new Float64Array(Math.max(needed, a.length * 2, INITIAL_VERTICES));
  next.set(a.subarray(0, used));
  return next;
}

function grownUint32(a: Uint32Array, used: number, needed: number): Uint32Array {
  const next = new Uint32Array(Math.max(needed, a.length * 2, INITIAL_RINGS));
  next.set(a.subarray(0, used));
  return next;
}

/** Whether `(px, py)` is inside the ring of vertices `[a, b)` (crossing number). */
function pointInRing(
  x: Float64Array,
  y: Float64Array,
  a: number,
  b: number,
  px: number,
  py: number,
): boolean {
  let inside = false;
  for (let i = a, j = b - 1; i < b; j = i++) {
    const yi = y[i]!;
    const yj = y[j]!;
    if (yi > py !== yj > py && px < ((x[j]! - x[i]!) * (py - yi)) / (yj - yi) + x[i]!) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The stream sink of {@link projectPolygons}. Rings are staged per polygon and grouped when the
 * polygon ends (see the file comment); lines and points outside a polygon are ignored.
 */
class PolygonSink implements GeoStream {
  /** Index of the feature being streamed; it goes into `featureOf`. */
  feature = 0;

  // The output being written. The arrays are the output's own, replaced when they grow.
  #x = EMPTY_FLOAT64;
  #y = EMPTY_FLOAT64;
  #vertexCount = 0;
  #rings = EMPTY_UINT32;
  #ringCount = 0;
  #polygons = EMPTY_UINT32;
  #featureOf = EMPTY_UINT32;
  #polygonCount = 0;
  #height = 0;

  // The rings of the polygon being streamed: vertices, then per ring its start vertex, signed
  // area, box (min x, min y, max x, max y) and, for grouping, the lists of holes per outer ring.
  #sx: Float64Array = new Float64Array(INITIAL_VERTICES);
  #sy: Float64Array = new Float64Array(INITIAL_VERTICES);
  #sn = 0;
  #start = new Uint32Array(INITIAL_RINGS + 1);
  #area: Float64Array = new Float64Array(INITIAL_RINGS);
  #box: Float64Array = new Float64Array(INITIAL_RINGS * 4);
  #firstHole = new Int32Array(INITIAL_RINGS);
  #nextHole = new Int32Array(INITIAL_RINGS);
  #count = 0;
  #inPolygon = false;
  #inRing = false;
  #ringStart = 0;

  begin(out: ProjectedPolygons, height: number): void {
    this.#x = out.x;
    this.#y = out.y;
    this.#rings = out.rings;
    this.#polygons = out.polygons;
    this.#featureOf = out.featureOf ?? new Uint32Array(out.polygons.length);
    this.#vertexCount = 0;
    this.#ringCount = 0;
    this.#polygonCount = 0;
    this.#height = height;
    this.#inPolygon = false;
    this.#inRing = false;
    this.feature = 0;
  }

  end(out: ProjectedPolygons): void {
    out.x = this.#x;
    out.y = this.#y;
    out.vertexCount = this.#vertexCount;
    out.rings = this.#rings;
    out.ringCount = this.#ringCount;
    out.polygons = this.#polygons;
    out.polygonCount = this.#polygonCount;
    out.featureOf = this.#featureOf;
    // The sink outlives the call (d3 caches a projection's stream per sink): let the output go.
    this.#x = this.#y = EMPTY_FLOAT64;
    this.#rings = this.#polygons = this.#featureOf = EMPTY_UINT32;
  }

  polygonStart(): void {
    this.#inPolygon = true;
    this.#inRing = false;
    this.#sn = 0;
    this.#count = 0;
  }

  lineStart(): void {
    if (!this.#inPolygon) return;
    this.#inRing = true;
    this.#ringStart = this.#sn;
  }

  point(px: number, py: number): void {
    if (!this.#inRing) return;
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      sinkStats.nonFinitePoints++;
      return;
    }
    const y = this.#height - py;
    const n = this.#sn;
    // d3 repeats a vertex here and there where it cuts a ring.
    if (n > this.#ringStart && this.#sx[n - 1] === px && this.#sy[n - 1] === y) return;
    if (n === this.#sx.length) {
      this.#sx = grownFloat64(this.#sx, n, n + 1);
      this.#sy = grownFloat64(this.#sy, n, n + 1);
    }
    this.#sx[n] = px;
    this.#sy[n] = y;
    this.#sn = n + 1;
  }

  lineEnd(): void {
    if (!this.#inRing) return;
    this.#inRing = false;
    const sx = this.#sx;
    const sy = this.#sy;
    const a = this.#ringStart;
    let b = this.#sn;
    // The ring is dropped unless it is recorded below.
    this.#sn = a;
    // d3 closes some rings with a copy of their first vertex (rejoined rings, the sphere).
    while (b - a > 1 && sx[b - 1] === sx[a] && sy[b - 1] === sy[a]) b--;
    if (b - a < 3) {
      if (b > a) sinkStats.degenerateRings++;
      return;
    }
    // Shoelace area about the first vertex (px near 1,000 would otherwise cost digits), and the
    // box. The edges at the first vertex contribute nothing.
    const x0 = sx[a]!;
    const y0 = sy[a]!;
    let minX = x0;
    let maxX = x0;
    let minY = y0;
    let maxY = y0;
    let twice = 0;
    let ux = 0;
    let uy = 0;
    for (let i = a + 1; i < b; i++) {
      const x = sx[i]!;
      const y = sy[i]!;
      const vx = x - x0;
      const vy = y - y0;
      twice += ux * vy - vx * uy;
      ux = vx;
      uy = vy;
      if (x < minX) minX = x;
      else if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      else if (y > maxY) maxY = y;
    }
    const area = twice / 2;
    if (!(Math.abs(area) > MIN_RING_AREA)) {
      sinkStats.degenerateRings++;
      return;
    }
    const k = this.#count;
    if (k === this.#area.length) this.#growRings();
    this.#start[k] = a;
    this.#area[k] = area;
    this.#box[4 * k] = minX;
    this.#box[4 * k + 1] = minY;
    this.#box[4 * k + 2] = maxX;
    this.#box[4 * k + 3] = maxY;
    this.#count = k + 1;
    this.#sn = b;
  }

  polygonEnd(): void {
    if (!this.#inPolygon) return;
    this.#inPolygon = false;
    this.#inRing = false;
    const count = this.#count;
    if (count === 0) return;
    const area = this.#area;
    this.#start[count] = this.#sn;
    if (count === 1) {
      // The common case by far: one ring.
      if (area[0]! < 0) {
        this.#beginPolygon();
        this.#writeRing(0);
      } else sinkStats.orphanHoles++;
      return;
    }
    // Chain the holes of each outer ring. Holes are visited last to first and pushed at the head,
    // so a chain reads in d3's order.
    const firstHole = this.#firstHole;
    const nextHole = this.#nextHole;
    for (let k = 0; k < count; k++) firstHole[k] = -1;
    for (let k = count - 1; k >= 0; k--) {
      if (area[k]! < 0) continue;
      const outer = this.#containerOf(k);
      if (outer < 0) {
        sinkStats.orphanHoles++;
        continue;
      }
      nextHole[k] = firstHole[outer]!;
      firstHole[outer] = k;
    }
    for (let k = 0; k < count; k++) {
      if (!(area[k]! < 0)) continue;
      this.#beginPolygon();
      this.#writeRing(k);
      for (let h = firstHole[k]!; h >= 0; h = nextHole[h]!) this.#writeRing(h);
    }
  }

  sphere(): void {
    // A projection's stream turns the sphere into a polygon (its outline) before it gets here.
  }

  /**
   * The smallest outer ring of the staged polygon that contains hole `h`, or -1.
   *
   * A vertex of the hole stands for it, and one vertex is not enough: along a curved clip edge d3
   * closes the outer ring with chords, and a hole next to that edge can have vertices beyond a
   * chord (by up to the projection's precision), or a vertex exactly on the ring. So up to
   * {@link HOLE_PROBES} vertices, spread around the hole, are tried until one is inside.
   */
  #containerOf(h: number): number {
    const sx = this.#sx;
    const sy = this.#sy;
    const start = this.#start;
    const area = this.#area;
    const box = this.#box;
    const count = this.#count;
    const first = start[h]!;
    const length = start[h + 1]! - first;
    const probes = Math.min(length, HOLE_PROBES);
    for (let i = 0; i < probes; i++) {
      const v = first + Math.floor((i * length) / probes);
      const px = sx[v]!;
      const py = sy[v]!;
      let best = -1;
      let bestSize = Infinity;
      for (let k = 0; k < count; k++) {
        const size = -area[k]!;
        if (!(size > 0) || size >= bestSize) continue;
        if (
          px < box[4 * k]! ||
          py < box[4 * k + 1]! ||
          px > box[4 * k + 2]! ||
          py > box[4 * k + 3]!
        ) {
          continue;
        }
        if (pointInRing(sx, sy, start[k]!, start[k + 1]!, px, py)) {
          best = k;
          bestSize = size;
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Double the room for the rings of one polygon; the five arrays grow together. */
  #growRings(): void {
    const used = this.#count;
    const size = this.#area.length * 2;
    const start = new Uint32Array(size + 1);
    start.set(this.#start.subarray(0, used));
    this.#start = start;
    const area = new Float64Array(size);
    area.set(this.#area.subarray(0, used));
    this.#area = area;
    const box = new Float64Array(size * 4);
    box.set(this.#box.subarray(0, used * 4));
    this.#box = box;
    this.#firstHole = new Int32Array(size);
    this.#nextHole = new Int32Array(size);
  }

  #beginPolygon(): void {
    const p = this.#polygonCount;
    if (p === this.#polygons.length) this.#polygons = grownUint32(this.#polygons, p, p + 1);
    if (p >= this.#featureOf.length) this.#featureOf = grownUint32(this.#featureOf, p, p + 1);
    this.#polygons[p] = this.#ringCount;
    this.#featureOf[p] = this.feature;
    this.#polygonCount = p + 1;
  }

  /** Append staged ring `k` to the output. */
  #writeRing(k: number): void {
    const a = this.#start[k]!;
    const length = this.#start[k + 1]! - a;
    const n = this.#vertexCount;
    if (n + length > this.#x.length) {
      this.#x = grownFloat64(this.#x, n, n + length);
      this.#y = grownFloat64(this.#y, n, n + length);
    }
    const r = this.#ringCount;
    if (r === this.#rings.length) this.#rings = grownUint32(this.#rings, r, r + 1);
    this.#rings[r] = n;
    this.#ringCount = r + 1;
    const x = this.#x;
    const y = this.#y;
    const sx = this.#sx;
    const sy = this.#sy;
    for (let i = 0; i < length; i++) {
      x[n + i] = sx[a + i]!;
      y[n + i] = sy[a + i]!;
    }
    this.#vertexCount = n + length;
  }
}

/**
 * The stream sink of {@link projectLines}: every line d3 emits is a polyline, and every ring of a
 * polygon a closed one.
 */
class LineSink implements GeoStream {
  #x = EMPTY_FLOAT64;
  #y = EMPTY_FLOAT64;
  #n = 0;
  #starts = EMPTY_UINT32;
  #startCount = 0;
  #height = 0;
  #lineStart = 0;
  #open = false;
  /** Inside a polygon, where lines are rings and close. */
  #ring = false;
  /** The open ring lost a point, so its ends no longer meet. */
  #broken = false;

  begin(out: ProjectedLines, height: number): void {
    this.#x = out.x;
    this.#y = out.y;
    this.#starts = out.starts;
    this.#n = 0;
    this.#startCount = 0;
    this.#height = height;
    this.#open = false;
    this.#ring = false;
  }

  end(out: ProjectedLines): void {
    if (this.#open) this.#endPolyline();
    this.#open = false;
    out.x = this.#x;
    out.y = this.#y;
    out.vertexCount = this.#n;
    out.starts = this.#starts;
    out.startCount = this.#startCount;
    this.#x = this.#y = EMPTY_FLOAT64;
    this.#starts = EMPTY_UINT32;
  }

  polygonStart(): void {
    this.#ring = true;
  }

  polygonEnd(): void {
    this.#ring = false;
  }

  lineStart(): void {
    // A composite projection feeds one sink from several clips. d3's Albers USA has two of them
    // with a line open at once where a line goes from one frame straight into another, and the
    // points cannot be told apart here: `albers-usa.ts` keeps them apart before they arrive.
    // Should another projection do the same, keep the polylines valid.
    if (this.#open) this.#endPolyline();
    this.#open = true;
    this.#broken = false;
    this.#lineStart = this.#n;
  }

  point(px: number, py: number): void {
    if (!this.#open) return;
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      // A gap, not a bridge: the line stops here and starts again at the next point.
      sinkStats.nonFinitePoints++;
      this.#endPolyline();
      this.#broken = true;
      this.#lineStart = this.#n;
      return;
    }
    this.#push(px, this.#height - py);
  }

  lineEnd(): void {
    if (!this.#open) return;
    const a = this.#lineStart;
    // d3 leaves a ring open (the last edge is implied), or now and then closes it itself, which
    // `point` then drops as a repeat only if nothing lies between.
    if (this.#ring && !this.#broken && this.#n - a >= 3) this.#push(this.#x[a]!, this.#y[a]!);
    this.#endPolyline();
    this.#open = false;
  }

  sphere(): void {
    // As for polygons: the projection streams the sphere's outline as a polygon.
  }

  /** Append a vertex, in output px, unless it repeats the one before it (a join needs a direction). */
  #push(x: number, y: number): void {
    const n = this.#n;
    if (n > this.#lineStart && this.#x[n - 1] === x && this.#y[n - 1] === y) return;
    if (n === this.#x.length) {
      this.#x = grownFloat64(this.#x, n, n + 1);
      this.#y = grownFloat64(this.#y, n, n + 1);
    }
    this.#x[n] = x;
    this.#y[n] = y;
    this.#n = n + 1;
  }

  /** Keep the vertices since `#lineStart` as a polyline if there are two or more. */
  #endPolyline(): void {
    const a = this.#lineStart;
    if (this.#n - a < 2) {
      this.#n = a;
      return;
    }
    // `starts` lists every polyline after the first.
    if (a === 0) return;
    const s = this.#startCount;
    if (s === this.#starts.length) this.#starts = grownUint32(this.#starts, s, s + 1);
    this.#starts[s] = a;
    this.#startCount = s + 1;
  }
}

/**
 * The rule that fills what {@link projectPolygons} makes through `projection`, for render's
 * `FillGeometryInput.fillRule`: `'simple'` (each polygon an outer ring and its holes, triangulated
 * by earcut) for every projection but the four with seams, whose rings double back on themselves
 * and need `'nonzero'` (see "Seams" in the file comment). The nonzero rule costs about five times
 * the triangulation (5 to 11 ms for the 110m land, an M1 Max), which is why it is not the rule
 * for all.
 */
export function projectedFillRule(projection: object): 'simple' | 'nonzero' {
  return hasSeams(projection) ? 'nonzero' : 'simple';
}

// One sink of each kind for the module: d3 keeps the stream it built for a sink until the
// projection changes, so a still projection reuses its pipeline from one layer to the next.
let polygonSink: PolygonSink | undefined;
let lineSink: LineSink | undefined;

const isArray = Array.isArray as (value: unknown) => value is readonly unknown[];

/** The features of `object` when it is a list of them, by array or by collection. */
function featuresOf(object: GeoInput): readonly GeoFeatureInput[] | undefined {
  if (isArray(object)) return object;
  return object.type === 'FeatureCollection'
    ? (object as GeoFeatureCollectionInput).features
    : undefined;
}

/**
 * Project the polygons of `object` (`Polygon`, `MultiPolygon` and `Sphere` geometries, in features
 * or not; other geometry is skipped) into the fill primitive's layout, in subplot px with y up
 * from the bottom of a subplot `height` px tall. The projection clips, cuts at the antimeridian
 * and resamples; rings are then grouped so that each polygon is its outer ring followed by its
 * holes (see the file comment).
 *
 * `featureOf[p]` is the index of the feature polygon `p` came from, in the array or collection
 * given, and 0 for a lone geometry or feature. Indices ascend; a feature has several polygons
 * (a multipolygon, or a polygon the clip cut in two) or none (wholly clipped away).
 *
 * `out` is filled and returned when given: its arrays are reused, and replaced by larger ones only
 * when they are too small, so pass the last result back in when projecting on every frame.
 */
export function projectPolygons(
  projection: GeoStreamWrapper,
  height: number,
  object: GeoInput,
  out: ProjectedPolygons = {
    x: new Float64Array(INITIAL_VERTICES),
    y: new Float64Array(INITIAL_VERTICES),
    vertexCount: 0,
    rings: new Uint32Array(INITIAL_RINGS),
    ringCount: 0,
    polygons: new Uint32Array(INITIAL_RINGS),
    polygonCount: 0,
    featureOf: new Uint32Array(INITIAL_RINGS),
  },
): ProjectedPolygons {
  const sink = (polygonSink ??= new PolygonSink());
  sink.begin(out, height);
  try {
    const stream = projection.stream(sink);
    const features = featuresOf(object);
    if (features) {
      for (let i = 0; i < features.length; i++) {
        sink.feature = i;
        geoStream(features[i] as GeoPermissibleObjects, stream);
      }
    } else geoStream(object as GeoPermissibleObjects, stream);
  } finally {
    sink.end(out);
  }
  return out;
}

/**
 * Project the lines of `object` into the line primitive's layout, in subplot px with y up from the
 * bottom of a subplot `height` px tall: `LineString` and `MultiLineString` geometries as open
 * polylines, and the rings of `Polygon`, `MultiPolygon` and `Sphere` geometries as closed ones
 * (the frame of a map is the sphere's outline). A line the projection cuts, at the antimeridian or
 * at its clip edge, becomes several polylines; one with fewer than two points is dropped.
 *
 * `out` is filled and returned when given, as in {@link projectPolygons}.
 */
export function projectLines(
  projection: GeoStreamWrapper,
  height: number,
  object: GeoInput,
  out: ProjectedLines = {
    x: new Float64Array(INITIAL_VERTICES),
    y: new Float64Array(INITIAL_VERTICES),
    vertexCount: 0,
    starts: new Uint32Array(INITIAL_RINGS),
    startCount: 0,
  },
): ProjectedLines {
  const sink = (lineSink ??= new LineSink());
  sink.begin(out, height);
  try {
    const stream = projection.stream(sink);
    const features = featuresOf(object);
    if (features) {
      for (const feature of features) geoStream(feature as GeoPermissibleObjects, stream);
    } else geoStream(object as GeoPermissibleObjects, stream);
  } finally {
    sink.end(out);
  }
  return out;
}
