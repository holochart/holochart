/**
 * `d3-geo`'s Albers USA with lines that do not run into each other (backlog GEO5).
 *
 * Albers USA is three projections, each clipped to a frame of its own: the contiguous states,
 * Alaska and Hawaii. d3 streams a geometry through all three into one sink, point by point, and
 * relies on the three never having a line open at the same time. They do, for one point, whenever
 * a line goes from one frame straight into another: the part that is entered starts its line
 * while the part that is left has yet to end its own, and the sink (`geoPath` as much as ours)
 * joins the two. A flight from Honolulu to Los Angeles came out as a line from the edge of the
 * map to Los Angeles and on to the edge of Hawaii's frame, without its end at Honolulu.
 *
 * {@link albersUsa} is d3's projection with its `stream` replaced: the three parts are the same
 * three (same parameters, placed by the same rule, checked against d3's in the tests), but each
 * writes its lines into a buffer of its own and hands a line on when it ends. Polygons need no
 * buffer: d3's clip to a rectangle already emits a polygon's rings in one go, part by part.
 * Everything else (`projection(point)`, `invert`, `scale`, `translate`, the fits) is d3's.
 */
import {
  geoAlbers,
  geoAlbersUsa,
  geoConicEqualArea,
  type GeoConicProjection,
  type GeoProjection,
  type GeoStream,
} from 'd3-geo';

/** d3's ε, by which the frames of Alaska and Hawaii stand inside their rectangles. */
const EPSILON = 1e-6;

/**
 * One part's lines, kept until they end. A line outside a polygon is buffered from `lineStart`
 * to `lineEnd` and then passed on whole; everything else passes straight through.
 */
class LineBuffer implements GeoStream {
  readonly #sink: GeoStream;
  #x: Float64Array = new Float64Array(64);
  #y: Float64Array = new Float64Array(64);
  #n = 0;
  #inPolygon = false;
  #buffering = false;

  constructor(sink: GeoStream) {
    this.#sink = sink;
  }

  polygonStart(): void {
    this.#inPolygon = true;
    this.#sink.polygonStart();
  }

  polygonEnd(): void {
    this.#inPolygon = false;
    this.#sink.polygonEnd();
  }

  lineStart(): void {
    if (this.#inPolygon) {
      this.#sink.lineStart();
      return;
    }
    this.#buffering = true;
    this.#n = 0;
  }

  point(x: number, y: number, z?: number): void {
    if (!this.#buffering) {
      this.#sink.point(x, y, z);
      return;
    }
    const n = this.#n;
    if (n === this.#x.length) {
      const grownX = new Float64Array(n * 2);
      const grownY = new Float64Array(n * 2);
      grownX.set(this.#x);
      grownY.set(this.#y);
      this.#x = grownX;
      this.#y = grownY;
    }
    this.#x[n] = x;
    this.#y[n] = y;
    this.#n = n + 1;
  }

  lineEnd(): void {
    if (!this.#buffering) {
      this.#sink.lineEnd();
      return;
    }
    this.#buffering = false;
    const sink = this.#sink;
    const x = this.#x;
    const y = this.#y;
    sink.lineStart();
    for (let i = 0; i < this.#n; i++) sink.point(x[i]!, y[i]!);
    sink.lineEnd();
  }

  sphere(): void {
    this.#sink.sphere?.();
  }
}

/** d3's `multiplex`: every event to every part, in order. */
function multiplex(streams: readonly GeoStream[]): GeoStream {
  return {
    point(x, y) {
      for (const stream of streams) stream.point(x, y);
    },
    sphere() {
      for (const stream of streams) stream.sphere?.();
    },
    lineStart() {
      for (const stream of streams) stream.lineStart();
    },
    lineEnd() {
      for (const stream of streams) stream.lineEnd();
    },
    polygonStart() {
      for (const stream of streams) stream.polygonStart();
    },
    polygonEnd() {
      for (const stream of streams) stream.polygonEnd();
    },
  };
}

/**
 * A new Albers USA projection: `geoAlbersUsa()` whose stream keeps the lines of its three parts
 * apart (see the module comment).
 */
export function albersUsa(): GeoProjection {
  const usa = geoAlbersUsa();
  // The three parts as `d3-geo/src/projection/albersUsa.js` (ISC) builds them.
  const lower48: GeoConicProjection = geoAlbers();
  const alaska = geoConicEqualArea().rotate([154, 0]).center([-2, 58.5]).parallels([55, 65]);
  const hawaii = geoConicEqualArea().rotate([157, 0]).center([-3, 19.9]).parallels([8, 18]);

  let cache: GeoStream | undefined;
  let cacheSink: GeoStream | undefined;
  // What the parts were last placed for: d3's setters do not tell.
  let k = NaN;
  let x = NaN;
  let y = NaN;
  let precision = NaN;

  usa.stream = (sink: GeoStream): GeoStream => {
    const scale = usa.scale();
    const [tx, ty] = usa.translate();
    const p = usa.precision();
    if (scale !== k || tx !== x || ty !== y || p !== precision) {
      k = scale;
      x = tx;
      y = ty;
      precision = p;
      cache = undefined;
      lower48
        .precision(p)
        .scale(k)
        .translate([x, y])
        .clipExtent([
          [x - 0.455 * k, y - 0.238 * k],
          [x + 0.455 * k, y + 0.238 * k],
        ]);
      alaska
        .precision(p)
        .scale(k * 0.35)
        .translate([x - 0.307 * k, y + 0.201 * k])
        .clipExtent([
          [x - 0.425 * k + EPSILON, y + 0.12 * k + EPSILON],
          [x - 0.214 * k - EPSILON, y + 0.234 * k - EPSILON],
        ]);
      hawaii
        .precision(p)
        .scale(k)
        .translate([x - 0.205 * k, y + 0.212 * k])
        .clipExtent([
          [x - 0.214 * k + EPSILON, y + 0.166 * k + EPSILON],
          [x - 0.115 * k - EPSILON, y + 0.234 * k - EPSILON],
        ]);
    }
    if (!cache || cacheSink !== sink) {
      cacheSink = sink;
      cache = multiplex([
        lower48.stream(new LineBuffer(sink)),
        alaska.stream(new LineBuffer(sink)),
        hawaii.stream(new LineBuffer(sink)),
      ]);
    }
    return cache;
  };
  return usa;
}
