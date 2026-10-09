import {
  geoAlbersUsa,
  geoArea,
  geoConicConformal,
  geoEquirectangular,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  type GeoProjection,
  type GeoStream,
  type GeoStreamWrapper,
} from 'd3-geo';
import fc from 'fast-check';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { describe, expect, it } from 'vitest';
import {
  MIN_RING_AREA,
  projectLines,
  projectPolygons,
  sinkStats,
  type GeoFeatureInput,
  type GeoInput,
} from './sink.ts';
import type { CountryProperties, ProjectedLines, ProjectedPolygons } from './types.ts';

const W = 800;
const H = 500;
const SPHERE = { type: 'Sphere' } as const;
const RAD = Math.PI / 180;

// ---- reading the output ---------------------------------------------------------------------

interface Ring {
  x: number[];
  y: number[];
  /** Shoelace area in the output's y-up px: negative for an outer ring, positive for a hole. */
  area: number;
}

/** Shoelace area about the first vertex, which keeps the digits of a sliver far from the origin. */
function signedArea(x: ArrayLike<number>, y: ArrayLike<number>): number {
  let twice = 0;
  for (let i = 2; i < x.length; i++) {
    twice += (x[i - 1]! - x[0]!) * (y[i]! - y[0]!) - (x[i]! - x[0]!) * (y[i - 1]! - y[0]!);
  }
  return twice / 2;
}

/** The output as polygons of rings, by its own index arrays. */
function polygonsOf(out: ProjectedPolygons): Ring[][] {
  const polygons: Ring[][] = [];
  for (let p = 0; p < out.polygonCount; p++) {
    const r1 = p + 1 < out.polygonCount ? out.polygons[p + 1]! : out.ringCount;
    const rings: Ring[] = [];
    for (let r = out.polygons[p]!; r < r1; r++) {
      const b = r + 1 < out.ringCount ? out.rings[r + 1]! : out.vertexCount;
      const x = Array.from(out.x.subarray(out.rings[r]!, b));
      const y = Array.from(out.y.subarray(out.rings[r]!, b));
      rings.push({ x, y, area: signedArea(x, y) });
    }
    polygons.push(rings);
  }
  return polygons;
}

/** The output as polylines of `[x, y]` points. */
function polylinesOf(out: ProjectedLines): [number, number][][] {
  const bounds = [0, ...out.starts.subarray(0, out.startCount), out.vertexCount];
  const lines: [number, number][][] = [];
  for (let l = 0; l + 1 < bounds.length; l++) {
    const line: [number, number][] = [];
    for (let i = bounds[l]!; i < bounds[l + 1]!; i++) line.push([out.x[i]!, out.y[i]!]);
    if (line.length > 0) lines.push(line);
  }
  return lines;
}

/** Area the polygons fill: outer rings less their holes. */
function filledArea(out: ProjectedPolygons): number {
  let sum = 0;
  for (const rings of polygonsOf(out)) for (const ring of rings) sum -= ring.area;
  return sum;
}

function inRing(ring: Ring, px: number, py: number): boolean {
  let inside = false;
  const { x, y } = ring;
  for (let i = 0, j = x.length - 1; i < x.length; j = i++) {
    if (
      y[i]! > py !== y[j]! > py &&
      px < ((x[j]! - x[i]!) * (py - y[i]!)) / (y[j]! - y[i]!) + x[i]!
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToRing(ring: Ring, px: number, py: number): number {
  let best = Infinity;
  const { x, y } = ring;
  for (let i = 0, j = x.length - 1; i < x.length; j = i++) {
    const dx = x[i]! - x[j]!;
    const dy = y[i]! - y[j]!;
    const t = Math.max(
      0,
      Math.min(1, ((px - x[j]!) * dx + (py - y[j]!) * dy) / (dx * dx + dy * dy)),
    );
    best = Math.min(best, Math.hypot(px - x[j]! - t * dx, py - y[j]! - t * dy));
  }
  return best;
}

/**
 * The invariants of the fill primitive's input that every output must keep (GEO5): ascending
 * index arrays within their counts, finite vertices, an outer ring first, then holes inside it,
 * and no ring without area.
 */
function expectValidPolygons(out: ProjectedPolygons, featureCount: number): void {
  expect(out.vertexCount).toBeLessThanOrEqual(out.x.length);
  expect(out.vertexCount).toBeLessThanOrEqual(out.y.length);
  expect(out.ringCount).toBeLessThanOrEqual(out.rings.length);
  expect(out.polygonCount).toBeLessThanOrEqual(out.polygons.length);
  expect(out.featureOf!.length).toBeGreaterThanOrEqual(out.polygonCount);
  for (let i = 0; i < out.vertexCount; i++) {
    if (!Number.isFinite(out.x[i]) || !Number.isFinite(out.y[i])) {
      throw new Error(`vertex ${i} is (${out.x[i]}, ${out.y[i]})`);
    }
  }
  if (out.ringCount > 0) expect(out.rings[0]).toBe(0);
  for (let r = 1; r < out.ringCount; r++) expect(out.rings[r]).toBeGreaterThan(out.rings[r - 1]!);
  if (out.ringCount > 0) expect(out.rings[out.ringCount - 1]).toBeLessThan(out.vertexCount);
  else expect(out.vertexCount).toBe(0);
  if (out.polygonCount > 0) expect(out.polygons[0]).toBe(0);
  else expect(out.ringCount).toBe(0);
  for (let p = 1; p < out.polygonCount; p++) {
    expect(out.polygons[p]).toBeGreaterThan(out.polygons[p - 1]!);
    expect(out.featureOf![p]).toBeGreaterThanOrEqual(out.featureOf![p - 1]!);
  }
  if (out.polygonCount > 0) {
    expect(out.polygons[out.polygonCount - 1]).toBeLessThan(out.ringCount);
    expect(out.featureOf![out.polygonCount - 1]).toBeLessThan(featureCount);
  }
  for (const rings of polygonsOf(out)) {
    const outer = rings[0]!;
    expect(outer.x.length).toBeGreaterThanOrEqual(3);
    expect(outer.area).toBeLessThan(-MIN_RING_AREA);
    for (const hole of rings.slice(1)) {
      expect(hole.x.length).toBeGreaterThanOrEqual(3);
      expect(hole.area).toBeGreaterThan(MIN_RING_AREA);
      expect(hole.area).toBeLessThan(-outer.area);
      for (let i = 0; i < hole.x.length; i++) {
        // Inside, or on the outer ring where d3's clip put a chord for a curved clip edge.
        const inside =
          inRing(outer, hole.x[i]!, hole.y[i]!) ||
          distanceToRing(outer, hole.x[i]!, hole.y[i]!) < 0.25;
        if (!inside) throw new Error(`hole vertex (${hole.x[i]}, ${hole.y[i]}) is outside`);
      }
    }
  }
}

function expectValidLines(out: ProjectedLines): void {
  expect(out.vertexCount).toBeLessThanOrEqual(out.x.length);
  expect(out.startCount).toBeLessThanOrEqual(out.starts.length);
  for (let i = 0; i < out.vertexCount; i++) {
    if (!Number.isFinite(out.x[i]) || !Number.isFinite(out.y[i])) {
      throw new Error(`vertex ${i} is (${out.x[i]}, ${out.y[i]})`);
    }
  }
  if (out.vertexCount === 0) expect(out.startCount).toBe(0);
  // Every polyline has two vertices or more, and no vertex repeats the one before it.
  const bounds = [0, ...out.starts.subarray(0, out.startCount), out.vertexCount];
  for (let l = 0; l + 1 < bounds.length; l++) {
    if (out.vertexCount > 0) expect(bounds[l + 1]! - bounds[l]!).toBeGreaterThanOrEqual(2);
    for (let i = bounds[l]! + 1; i < bounds[l + 1]!; i++) {
      expect(out.x[i] === out.x[i - 1] && out.y[i] === out.y[i - 1]).toBe(false);
    }
  }
}

/** A copy of what is in use, to compare two outputs. */
function snapshot(out: ProjectedPolygons): unknown {
  return {
    x: Array.from(out.x.subarray(0, out.vertexCount)),
    y: Array.from(out.y.subarray(0, out.vertexCount)),
    rings: Array.from(out.rings.subarray(0, out.ringCount)),
    polygons: Array.from(out.polygons.subarray(0, out.polygonCount)),
    featureOf: Array.from(out.featureOf!.subarray(0, out.polygonCount)),
  };
}

// ---- geometry on the sphere -----------------------------------------------------------------

/** The point `distance` degrees from `center` along `bearing` (degrees clockwise from north). */
function destination(center: Position, bearing: number, distance: number): Position {
  const lat = center[1]! * RAD;
  const d = distance * RAD;
  const b = bearing * RAD;
  const sinLat = Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(b);
  const lon =
    center[0]! * RAD +
    Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * sinLat);
  return [((lon / RAD + 540) % 360) - 180, Math.asin(Math.max(-1, Math.min(1, sinLat))) / RAD];
}

/**
 * A ring around `center` with a vertex every `360° / radii.length` of bearing, clockwise as d3
 * wants an outer ring, or counterclockwise for a hole. Star-shaped, so it never crosses itself.
 */
function starRing(center: Position, radii: readonly number[], hole = false): Position[] {
  const ring = radii.map((r, i) => destination(center, (360 * i) / radii.length, r));
  if (hole) ring.reverse();
  ring.push(ring[0]!);
  return ring;
}

interface Star {
  center: [number, number];
  radii: number[];
  hole: boolean;
}

/** A star polygon, with a hexagonal hole well inside it when asked. */
function starPolygon(star: Star): Polygon {
  const rings = [starRing(star.center, star.radii)];
  if (star.hole) {
    const r = 0.4 * Math.min(...star.radii);
    rings.push(starRing(star.center, [r, r, r, r, r, r], true));
  }
  return { type: 'Polygon', coordinates: rings };
}

/** A clockwise (outer) box in degrees, with a vertex every `step` degrees so edges stay parallels. */
function lonLatBox(w: number, s: number, e: number, n: number, step = 5): Position[] {
  const ring: Position[] = [];
  for (let lat = s; lat < n; lat += step) ring.push([w, lat]);
  for (let lon = w; lon < e; lon += step) ring.push([lon, n]);
  for (let lat = n; lat > s; lat -= step) ring.push([e, lat]);
  for (let lon = e; lon > w; lon -= step) ring.push([lon, s]);
  ring.push(ring[0]!);
  return ring;
}

const feature = (geometry: Polygon | MultiPolygon | null): GeoFeatureInput => ({
  type: 'Feature',
  geometry,
});

// ---- projections ----------------------------------------------------------------------------

type Rotation = [number, number, number];

/** Plotly's `projection.precision`; the default of d3 is 0.7 px. */
const PRECISION = 0.1;

const PROJECTIONS: Record<string, (rotation: Rotation) => GeoProjection> = {
  equirectangular: (r) =>
    geoEquirectangular().fitSize([W, H], SPHERE).rotate(r).precision(PRECISION),
  mercator: (r) => geoMercator().fitSize([W, H], SPHERE).rotate(r).precision(PRECISION),
  'natural earth': (r) => geoNaturalEarth1().fitSize([W, H], SPHERE).rotate(r).precision(PRECISION),
  orthographic: (r) => geoOrthographic().fitSize([W, H], SPHERE).rotate(r).precision(PRECISION),
  // A composite of three conic projections, each clipped to its own rectangle; it does not rotate.
  'albers usa': () => geoAlbersUsa().fitSize([W, H], SPHERE).precision(PRECISION),
  // Europe's projection, clipped to a rectangle inside the subplot as a scoped map is.
  'conic conformal': (r) =>
    geoConicConformal()
      .parallels([0, 60])
      .scale(420)
      .translate([W / 2, H])
      .rotate([r[0], 0, 0])
      .precision(PRECISION)
      .clipExtent([
        [100, 60],
        [700, 440],
      ]),
};
const PROJECTION_NAMES = Object.keys(PROJECTIONS);

/** The box of the clip outline in output px: `[minX, minY, maxX, maxY]`, y up. */
function outlineBox(projection: GeoProjection): [number, number, number, number] {
  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(SPHERE);
  return [x0, H - y1, x1, H - y0];
}

/**
 * A number spread evenly over `[min, max]`, both ends included and favoured. (`fc.double` spreads
 * over the representable doubles instead: nearly all of [-180, 180] is then within 1e-100 of 0.)
 */
const uniform = (min: number, max: number): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: 2 ** 30 }).map((i) => min + ((max - min) * i) / 2 ** 30);

/**
 * For the properties over lists of rings: a failing case can take fast-check many minutes to
 * shrink, inside one synchronous call that Vitest's timeout cannot stop. This stops it.
 */
const LIMITS = { interruptAfterTimeLimit: 20_000 } as const;

const rotationArb = fc.tuple(uniform(-180, 180), uniform(-90, 90), uniform(-180, 180));

const starArb = (maxLat = 85): fc.Arbitrary<Star> =>
  fc.record({
    center: fc.tuple(uniform(-180, 180), uniform(-maxLat, maxLat)),
    radii: fc.array(uniform(3, 35), { minLength: 8, maxLength: 14 }),
    hole: fc.boolean(),
  });

/** One to four features, single polygons and multipolygons of two. */
const featuresArb = fc.array(
  fc.oneof(
    starArb().map((s) => feature(starPolygon(s))),
    fc.tuple(starArb(), starArb()).map(([a, b]) =>
      feature({
        type: 'MultiPolygon',
        coordinates: [starPolygon(a).coordinates, starPolygon(b).coordinates],
      }),
    ),
  ),
  { minLength: 1, maxLength: 4 },
);

// ---- a stream that is not a projection ------------------------------------------------------

/** Passes px through untouched: GeoJSON coordinates are then d3 px (y down), in the order given. */
const IDENTITY: GeoStreamWrapper = { stream: (sink) => sink };

/** A clockwise-on-screen box in d3 px (an outer ring), closed. */
function pxBox(x0: number, y0: number, x1: number, y1: number): Position[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
}
/** The same box the other way round (a hole). */
const pxHole = (x0: number, y0: number, x1: number, y1: number): Position[] =>
  pxBox(x0, y0, x1, y1).reverse();

const pxPolygon = (...rings: Position[][]): Polygon => ({ type: 'Polygon', coordinates: rings });

/** Rings as `[x0, y0, x1, y1]` boxes in output px, to compare with what was put in. */
function boxesOf(out: ProjectedPolygons): number[][][] {
  return polygonsOf(out).map((rings) =>
    rings.map((r) => [Math.min(...r.x), Math.min(...r.y), Math.max(...r.x), Math.max(...r.y)]),
  );
}

// ---------------------------------------------------------------------------------------------

describe('test fixtures', () => {
  it('winds star rings the way d3 wants them', () => {
    const star = { center: [20, 10] as [number, number], radii: [10, 12, 9, 14, 10, 11, 13, 9] };
    expect(geoArea(starPolygon({ ...star, hole: false }))).toBeLessThan(1);
    expect(geoArea(starPolygon({ ...star, hole: true }))).toBeLessThan(
      geoArea(starPolygon({ ...star, hole: false })),
    );
    expect(geoArea(pxPolygon(lonLatBox(170, -20, 190, -10)))).toBeLessThan(1);
  });
});

describe('projectPolygons: sign convention and area', () => {
  const simple = starPolygon({
    center: [10, 20],
    radii: [14, 9, 12, 10, 15, 9, 11, 13],
    hole: false,
  });
  const holed = starPolygon({
    center: [10, 20],
    radii: [14, 9, 12, 10, 15, 9, 11, 13],
    hole: true,
  });

  it('gives an outer ring a negative area and a hole a positive one, unclipped', () => {
    const projection = PROJECTIONS['equirectangular']!([0, 0, 0]);
    const one = polygonsOf(projectPolygons(projection, H, simple));
    expect(one).toHaveLength(1);
    expect(one[0]).toHaveLength(1);
    expect(one[0]![0]!.area).toBeLessThan(0);
    expect(-one[0]![0]!.area).toBeCloseTo(geoPath(projection).area(simple), 6);

    const two = polygonsOf(projectPolygons(projection, H, holed));
    expect(two).toHaveLength(1);
    expect(two[0]).toHaveLength(2);
    expect(two[0]![0]!.area).toBeCloseTo(one[0]![0]!.area, 9);
    expect(two[0]![1]!.area).toBeGreaterThan(0);
    expect(-two[0]![0]!.area - two[0]![1]!.area).toBeCloseTo(geoPath(projection).area(holed), 6);
  });

  it('keeps that convention where the clip edge cuts the polygon', () => {
    // The polygon's center is 80° from the view's: the horizon cuts the outer ring, not the hole.
    const projection = PROJECTIONS['orthographic']!([-90, -20, 0]);
    const cut = projectPolygons(projection, H, simple);
    const cutHoled = projectPolygons(projection, H, holed);
    for (const [out, object] of [
      [cut, simple],
      [cutHoled, holed],
    ] as const) {
      const polygons = polygonsOf(out);
      expect(polygons).toHaveLength(1);
      expect(polygons[0]![0]!.area).toBeLessThan(0);
      // Less than the whole polygon would cover: it is cut.
      expect(filledArea(out)).toBeCloseTo(geoPath(projection).area(object), 6);
    }
    expect(polygonsOf(cut)[0]).toHaveLength(1);
    expect(polygonsOf(cutHoled)[0]).toHaveLength(2);
    expect(polygonsOf(cutHoled)[0]![1]!.area).toBeGreaterThan(0);
    expectValidPolygons(cutHoled, 1);
  });

  it('flips y about the height it is given', () => {
    const projection = PROJECTIONS['equirectangular']!([0, 0, 0]);
    const out = projectPolygons(projection, H, pxPolygon(lonLatBox(0, 0, 10, 10, 10)));
    const [x0, y0] = projection([0, 10])!;
    // The north-west corner is the second vertex; north is up, so its y is the larger one.
    expect(out.x[1]).toBeCloseTo(x0, 9);
    expect(out.y[1]).toBeCloseTo(H - y0, 9);
    expect(out.y[1]).toBeGreaterThan(out.y[0]!);
    const taller = projectPolygons(projection, H + 100, pxPolygon(lonLatBox(0, 0, 10, 10, 10)));
    expect(taller.y[1]).toBeCloseTo(H + 100 - y0, 9);
  });

  it('projects the sphere to the outline of the map', () => {
    const flat = PROJECTIONS['equirectangular']!([0, 0, 0]);
    const rect = polygonsOf(projectPolygons(flat, H, SPHERE));
    expect(rect).toHaveLength(1);
    expect(rect[0]).toHaveLength(1);
    expect(-rect[0]![0]!.area).toBeCloseTo(geoPath(flat).area(SPHERE), 6);
    expect(Math.min(...rect[0]![0]!.x)).toBeCloseTo(0, 6);
    expect(Math.max(...rect[0]![0]!.x)).toBeCloseTo(W, 6);

    const globe = PROJECTIONS['orthographic']!([30, -40, 10]);
    const disc = polygonsOf(projectPolygons(globe, H, SPHERE));
    expect(disc).toHaveLength(1);
    const radius = globe.scale();
    expect(-disc[0]![0]!.area).toBeCloseTo(geoPath(globe).area(SPHERE), 6);
    expect(-disc[0]![0]!.area / (Math.PI * radius * radius)).toBeCloseTo(1, 3);
    // d3 closes the sphere's ring with a copy of its first vertex; the output does not.
    const ring = disc[0]![0]!;
    const last = ring.x.length - 1;
    expect(ring.x[0] === ring.x[last] && ring.y[0] === ring.y[last]).toBe(false);

    // Albers USA has three outlines: the lower 48, and the insets of Alaska and Hawaii.
    const usa = projectPolygons(PROJECTIONS['albers usa']!([0, 0, 0]), H, SPHERE);
    expect(usa.polygonCount).toBe(3);
    expectValidPolygons(usa, 1);
  });

  it('matches geoPath area for a polygon wholly in view, and keeps its hole', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('equirectangular', 'mercator', 'natural earth', 'orthographic'),
        starArb(40),
        (name, star) => {
          // Centered on the polygon, whose radius is at most 35°: nothing clips it.
          const projection = PROJECTIONS[name]!([-star.center[0], -star.center[1], 0]);
          const polygon = starPolygon(star);
          const out = projectPolygons(projection, H, polygon);
          const polygons = polygonsOf(out);
          expect(polygons).toHaveLength(1);
          expect(polygons[0]).toHaveLength(star.hole ? 2 : 1);
          const reference = geoPath(projection).area(polygon);
          expect(Math.abs(filledArea(out) - reference)).toBeLessThan(1e-6 * reference + 1e-9);
          if (star.hole) {
            const hole: Polygon = { type: 'Polygon', coordinates: [polygon.coordinates[1]!] };
            // Alone, the hole is a ring wound the wrong way: d3 fills the rest of the sphere.
            const holeArea = geoPath(projection).area(SPHERE) - geoPath(projection).area(hole);
            expect(polygons[0]![1]!.area / holeArea).toBeCloseTo(1, 6);
          }
          expectValidPolygons(out, 1);
        },
      ),
      LIMITS,
    );
  });

  it('keeps the sign of the area under any rotation, clipped or not', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('equirectangular', 'natural earth', 'orthographic'),
        rotationArb,
        starArb(),
        (name, rotation, star) => {
          const projection = PROJECTIONS[name]!(rotation);
          const polygon = starPolygon(star);
          const out = projectPolygons(projection, H, polygon);
          const reference = geoPath(projection).area(polygon);
          for (const rings of polygonsOf(out)) {
            let sum = 0;
            for (const ring of rings) sum += ring.area;
            expect(rings[0]!.area).toBeLessThan(0);
            expect(sum).toBeLessThan(0);
          }
          // The filled area is d3's, but for slivers on the clip edge that are dropped here.
          expect(Math.abs(filledArea(out) - reference)).toBeLessThan(2 + 1e-6 * reference);
        },
      ),
      LIMITS,
    );
  });
});

describe('projectPolygons: clipping', () => {
  it('keeps every vertex finite and inside the clip outline, with valid rings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PROJECTION_NAMES),
        rotationArb,
        featuresArb,
        (name, rotation, features) => {
          const projection = PROJECTIONS[name]!(rotation);
          const out = projectPolygons(projection, H, features);
          expectValidPolygons(out, features.length);
          // What is filled is what d3 fills, whichever clip cut it (a circle, the antimeridian,
          // a rectangle, three rectangles), but for the slivers dropped on a curved clip edge:
          // as thin as the precision, and under 2 px² for each source polygon.
          const path = geoPath(projection);
          let reference = 0;
          let sourcePolygons = 0;
          for (const f of features) {
            reference += path.area(f as Feature);
            sourcePolygons += f.geometry?.type === 'MultiPolygon' ? 2 : 1;
          }
          expect(Math.abs(filledArea(out) - reference)).toBeLessThan(
            2 * sourcePolygons + 1e-6 * reference,
          );
          const [x0, y0, x1, y1] = outlineBox(projection);
          const tol = 1e-6;
          for (let i = 0; i < out.vertexCount; i++) {
            const x = out.x[i]!;
            const y = out.y[i]!;
            if (x < x0 - tol || x > x1 + tol || y < y0 - tol || y > y1 + tol) {
              throw new Error(`(${x}, ${y}) is outside [${x0}, ${y0}, ${x1}, ${y1}] of ${name}`);
            }
          }
          if (name === 'orthographic') {
            const [cx, cy] = projection.translate();
            const radius = projection.scale();
            for (let i = 0; i < out.vertexCount; i++) {
              const r = Math.hypot(out.x[i]! - cx, out.y[i]! - (H - cy));
              expect(r).toBeLessThanOrEqual(radius + tol);
            }
          }
        },
      ),
      LIMITS,
    );
  });

  it('keeps Albers USA vertices inside one of its three frames', () => {
    const projection = PROJECTIONS['albers usa']!([0, 0, 0]);
    const frames = boxesOf(projectPolygons(projection, H, SPHERE)).map((rings) => rings[0]!);
    // A box over the western states, Alaska and Hawaii: each projection of the composite cuts it.
    const out = projectPolygons(projection, H, pxPolygon(lonLatBox(-170, 18, -100, 72)));
    expect(out.polygonCount).toBe(3);
    expectValidPolygons(out, 1);
    for (let i = 0; i < out.vertexCount; i++) {
      const inside = frames.some(
        ([x0, y0, x1, y1]) =>
          out.x[i]! >= x0! - 1e-6 &&
          out.x[i]! <= x1! + 1e-6 &&
          out.y[i]! >= y0! - 1e-6 &&
          out.y[i]! <= y1! + 1e-6,
      );
      expect(inside).toBe(true);
    }
  });

  it('gives nothing for a polygon on the far side of the globe', () => {
    const out = projectPolygons(
      PROJECTIONS['orthographic']!([0, 0, 0]),
      H,
      starPolygon({ center: [180, 0], radii: [20, 20, 20, 20, 20, 20, 20, 20], hole: true }),
    );
    expect(out.vertexCount).toBe(0);
    expect(out.ringCount).toBe(0);
    expect(out.polygonCount).toBe(0);
  });
});

describe('projectPolygons: antimeridian and poles', () => {
  const projection = PROJECTIONS['equirectangular']!([0, 0, 0]);
  // The map is twice as wide as tall: it fills the width, with a margin above and below.
  const pxPerDegree = W / 360;
  const mapBottom = (H - W / 2) / 2;

  /** No edge runs from one side of the map to the other. */
  function expectNoSpanningEdge(out: ProjectedPolygons): void {
    for (const rings of polygonsOf(out)) {
      for (const ring of rings) {
        for (let i = 0, j = ring.x.length - 1; i < ring.x.length; j = i++) {
          expect(Math.abs(ring.x[i]! - ring.x[j]!)).toBeLessThan(W / 2);
        }
      }
    }
  }

  it('cuts a box across ±180° (Fiji) in two', () => {
    const fiji = pxPolygon(lonLatBox(170, -20, 190, -10));
    const out = projectPolygons(projection, H, fiji);
    expectValidPolygons(out, 1);
    const boxes = boxesOf(out).map((rings) => rings[0]!);
    expect(boxes).toHaveLength(2);
    boxes.sort((a, b) => a[0]! - b[0]!);
    // 180° to 190° at the left edge, 170° to 180° at the right one.
    expect(boxes[0]![0]).toBeCloseTo(0, 6);
    expect(boxes[0]![2]).toBeCloseTo(10 * pxPerDegree, 6);
    expect(boxes[1]![0]).toBeCloseTo(W - 10 * pxPerDegree, 6);
    expect(boxes[1]![2]).toBeCloseTo(W, 6);
    expect(filledArea(out)).toBeCloseTo(geoPath(projection).area(fiji), 6);
    // The box's edges are a parallel's chords, so the area is a little under 20° by 10°.
    expect(filledArea(out) / (200 * pxPerDegree * pxPerDegree)).toBeCloseTo(1, 1);
    expectNoSpanningEdge(out);
  });

  it('cuts a band across ±180° (Russia) in two, holes on either side kept', () => {
    const russia = pxPolygon(
      lonLatBox(30, 50, 190, 75),
      lonLatBox(60, 55, 70, 60).reverse(),
      lonLatBox(182, 60, 186, 65, 1).reverse(),
    );
    const out = projectPolygons(projection, H, russia);
    expectValidPolygons(out, 1);
    const boxes = boxesOf(out);
    expect(boxes).toHaveLength(2);
    expect(boxes.map((rings) => rings.length)).toEqual([2, 2]);
    boxes.sort((a, b) => a[0]![0]! - b[0]![0]!);
    expect(boxes[0]![0]![0]).toBeCloseTo(0, 6);
    expect(boxes[0]![0]![2]).toBeCloseTo(10 * pxPerDegree, 6);
    expect(boxes[1]![0]![0]).toBeCloseTo(210 * pxPerDegree, 6);
    expect(boxes[1]![0]![2]).toBeCloseTo(W, 6);
    expect(filledArea(out)).toBeCloseTo(geoPath(projection).area(russia), 6);
    expectNoSpanningEdge(out);
  });

  it('gives a cap over the south pole (Antarctica) one polygon down to the bottom edge', () => {
    const ring: Position[] = [];
    for (let lon = -180; lon < 180; lon += 10) ring.push([lon, -70]);
    ring.push(ring[0]!);
    // Clockwise as seen from outside the sphere is west to east around the south pole.
    const cap = pxPolygon(ring);
    expect(geoArea(cap)).toBeLessThan(1);
    const out = projectPolygons(projection, H, cap);
    expectValidPolygons(out, 1);
    const boxes = boxesOf(out);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveLength(1);
    const [x0, y0, x1, y1] = boxes[0]![0]!;
    expect(x0).toBeCloseTo(0, 6);
    expect(x1).toBeCloseTo(W, 6);
    expect(y0).toBeCloseTo(mapBottom, 6);
    // The vertices are at 70°S, 20° above the pole's edge; the arcs between them dip south.
    expect(y1).toBeCloseTo(mapBottom + 20 * pxPerDegree, 6);
    expect(filledArea(out)).toBeCloseTo(geoPath(projection).area(cap), 6);
    expect(filledArea(out) / (W * 20 * pxPerDegree)).toBeCloseTo(1, 1);
  });

  it('never leaves an edge spanning a flat map, wherever the polygon is', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('equirectangular', 'mercator', 'natural earth'),
        uniform(-180, 180),
        // Away from the poles: a polygon over a pole rightly has an edge along the whole map.
        starArb(40),
        (name, lon, star) => {
          const flat = PROJECTIONS[name]!([lon, 0, 0]);
          const polygon = starPolygon(star);
          const out = projectPolygons(flat, H, polygon);
          expectValidPolygons(out, 1);
          // Two pieces when the antimeridian cuts it, or more: a star has lobes.
          expect(out.polygonCount).toBeGreaterThanOrEqual(1);
          expectNoSpanningEdge(out);
          const reference = geoPath(flat).area(polygon);
          expect(Math.abs(filledArea(out) - reference)).toBeLessThan(2 + 1e-6 * reference);
        },
      ),
      LIMITS,
    );
  });
});

describe('projectPolygons: ring grouping', () => {
  it('groups rings d3 emits in any order: holes first, several outer rings', () => {
    // One polygon's rings as a clip leaves them: a hole of B, then A, a hole of A, then B.
    const out = projectPolygons(
      IDENTITY,
      100,
      pxPolygon(
        pxHole(62, 12, 68, 18),
        pxBox(10, 10, 40, 40),
        pxHole(20, 20, 30, 30),
        pxBox(60, 10, 90, 40),
      ),
    );
    expectValidPolygons(out, 1);
    // Output y is 100 - y.
    expect(boxesOf(out)).toEqual([
      [
        [10, 60, 40, 90],
        [20, 70, 30, 80],
      ],
      [
        [60, 60, 90, 90],
        [62, 82, 68, 88],
      ],
    ]);
    expect(Array.from(out.rings.subarray(0, out.ringCount))).toEqual([0, 4, 8, 12]);
    expect(Array.from(out.polygons.subarray(0, out.polygonCount))).toEqual([0, 2]);
  });

  it('keeps the holes of an outer ring in the order d3 gave them', () => {
    const out = projectPolygons(
      IDENTITY,
      100,
      pxPolygon(
        pxHole(12, 12, 14, 14),
        pxHole(22, 12, 24, 14),
        pxBox(10, 10, 40, 40),
        pxHole(32, 12, 34, 14),
      ),
    );
    expect(boxesOf(out)[0]!.map((box) => box[0])).toEqual([10, 12, 22, 32]);
  });

  it('gives a hole to the smallest outer ring around it', () => {
    // An island in a lake: the island's own lake belongs to the island.
    const out = projectPolygons(
      IDENTITY,
      100,
      pxPolygon(
        pxHole(44, 44, 46, 46),
        pxBox(0, 0, 90, 90),
        pxHole(30, 30, 60, 60),
        pxBox(40, 40, 50, 50),
      ),
    );
    expectValidPolygons(out, 1);
    expect(boxesOf(out)).toEqual([
      [
        [0, 10, 90, 100],
        [30, 40, 60, 70],
      ],
      [
        [40, 50, 50, 60],
        [44, 54, 46, 56],
      ],
    ]);
  });

  it('drops rings without area or with fewer than three distinct vertices', () => {
    const before = sinkStats.degenerateRings;
    const out = projectPolygons(
      IDENTITY,
      100,
      pxPolygon(
        // A sliver on a clip edge: three points in a line.
        [
          [0, 50],
          [40, 50],
          [80, 50],
          [0, 50],
        ],
        // Two distinct vertices, and one vertex four times.
        [
          [5, 5],
          [6, 6],
          [5, 5],
        ],
        [
          [7, 7],
          [7, 7],
          [7, 7],
          [7, 7],
        ],
        // There and back: four vertices, no area.
        [
          [1, 1],
          [9, 1],
          [1, 1],
          [9, 1],
          [1, 1],
        ],
        // A thousandth of a px wide and a thousandth long.
        pxBox(50, 50, 50.0005, 50.001),
        pxBox(10, 10, 40, 40),
      ),
    );
    expectValidPolygons(out, 1);
    expect(boxesOf(out)).toEqual([[[10, 60, 40, 90]]]);
    expect(sinkStats.degenerateRings - before).toBe(5);
  });

  it('strips the closing vertex and repeated vertices d3 leaves at a cut', () => {
    const out = projectPolygons(IDENTITY, 100, {
      type: 'Polygon',
      // geoStream drops the last coordinate of a ring, so this ring still ends on its first.
      coordinates: [
        [
          [10, 10],
          [40, 10],
          [40, 10],
          [40, 40],
          [10, 40],
          [10, 40],
          [10, 10],
          [10, 10],
        ],
      ],
    });
    expect(out.vertexCount).toBe(4);
    expect(Array.from(out.x.subarray(0, 4))).toEqual([10, 40, 40, 10]);
    expect(Array.from(out.y.subarray(0, 4))).toEqual([90, 90, 60, 60]);
  });

  it('drops a hole that no outer ring contains, and counts it', () => {
    const before = sinkStats.orphanHoles;
    const out = projectPolygons(IDENTITY, 100, [
      // Beside its outer ring, though inside the box of the two outer rings together.
      feature(pxPolygon(pxBox(10, 10, 40, 40), pxHole(45, 20, 50, 25), pxBox(60, 10, 90, 40))),
      // The sign of a hole and nothing around it: the inverted sliver of a curved clip edge.
      feature(pxPolygon(pxHole(10, 60, 40, 90))),
      // Larger than the only outer ring.
      feature(pxPolygon(pxBox(60, 60, 70, 70), pxHole(50, 50, 90, 90))),
    ]);
    expectValidPolygons(out, 3);
    expect(boxesOf(out)).toEqual([[[10, 60, 40, 90]], [[60, 60, 90, 90]], [[60, 30, 70, 40]]]);
    expect(Array.from(out.featureOf!.subarray(0, out.polygonCount))).toEqual([0, 0, 2]);
    expect(sinkStats.orphanHoles - before).toBe(3);
  });

  it('places a hole that pokes through the chord its outer ring was closed with', () => {
    // As d3 leaves a hole beside a curved clip edge: the outer ring's right side is a chord at
    // x = 40, and the hole reaches 40.3. Its first vertex is one of those beyond the chord.
    const out = projectPolygons(
      IDENTITY,
      100,
      pxPolygon(
        [
          [40.3, 20],
          [40.3, 30],
          [30, 30],
          [30, 20],
          [40.3, 20],
        ].reverse(),
        pxBox(10, 10, 40, 40),
        pxBox(60, 10, 90, 40),
      ),
    );
    expect(boxesOf(out)).toEqual([
      [
        [10, 60, 40, 90],
        [30, 70, 40.3, 80],
      ],
      [[60, 60, 90, 90]],
    ]);
  });

  it('places a hole that touches its outer ring at the vertex tested first', () => {
    const out = projectPolygons(
      IDENTITY,
      100,
      pxPolygon(
        pxBox(10, 10, 40, 40),
        // A triangle whose first vertex is on the left edge of the box above.
        [
          [10, 25],
          [20, 30],
          [20, 20],
          [10, 25],
        ],
        pxBox(60, 10, 90, 40),
      ),
    );
    expect(boxesOf(out).map((rings) => rings.length)).toEqual([2, 1]);
  });

  it('groups hundreds of rings in one polygon, whatever their order', () => {
    // A 20 by 20 grid of boxes, each with a hole, as one polygon; fast-check shuffles the rings.
    const rings: { ring: Position[]; cell: number; hole: boolean }[] = [];
    for (let cell = 0; cell < 400; cell++) {
      const x = 10 * (cell % 20);
      const y = 10 * Math.floor(cell / 20);
      rings.push({ ring: pxBox(x, y, x + 8, y + 8), cell, hole: false });
      rings.push({ ring: pxHole(x + 2, y + 2, x + 6, y + 6), cell, hole: true });
    }
    fc.assert(
      fc.property(fc.shuffledSubarray(rings, { minLength: rings.length }), (shuffled) => {
        const out = projectPolygons(IDENTITY, 200, pxPolygon(...shuffled.map((r) => r.ring)));
        expectValidPolygons(out, 1);
        expect(out.polygonCount).toBe(400);
        expect(out.ringCount).toBe(800);
        // Polygons come in the order of their outer rings.
        const outers = shuffled.filter((r) => !r.hole);
        for (const [p, rings2] of boxesOf(out).entries()) {
          const x = 10 * (outers[p]!.cell % 20);
          const y = 200 - 10 * Math.floor(outers[p]!.cell / 20);
          expect(rings2).toEqual([
            [x, y - 8, x + 8, y],
            [x + 2, y - 6, x + 6, y - 2],
          ]);
        }
      }),
      { numRuns: 20, ...LIMITS },
    );
  });

  it('skips points the projection could not place', () => {
    const before = sinkStats.nonFinitePoints;
    const holey: GeoStreamWrapper = {
      stream: (sink: GeoStream): GeoStream => ({
        point: (x, y) => sink.point(x === 25 ? NaN : x, y === 25 ? Infinity : y),
        lineStart: () => sink.lineStart(),
        lineEnd: () => sink.lineEnd(),
        polygonStart: () => sink.polygonStart(),
        polygonEnd: () => sink.polygonEnd(),
      }),
    };
    const out = projectPolygons(holey, 100, {
      type: 'Polygon',
      coordinates: [
        [
          [10, 10],
          [25, 10],
          [40, 10],
          [40, 25],
          [40, 40],
          [10, 40],
          [10, 10],
        ],
      ],
    });
    expectValidPolygons(out, 1);
    expect(out.vertexCount).toBe(4);
    expect(sinkStats.nonFinitePoints - before).toBe(2);
  });

  it('takes only polygons', () => {
    const out = projectPolygons(IDENTITY, 100, {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [1, 1] },
        {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [50, 0],
            [50, 50],
            [0, 0],
          ],
        },
        pxPolygon(pxBox(10, 10, 40, 40)),
      ],
    });
    expect(boxesOf(out)).toEqual([[[10, 60, 40, 90]]]);
  });
});

describe('projectPolygons: features', () => {
  const near = (lon: number): Polygon =>
    starPolygon({ center: [lon, 0], radii: [8, 8, 8, 8, 8, 8, 8, 8], hole: false });
  const features: Feature<Polygon | MultiPolygon, CountryProperties>[] = [
    {
      type: 'Feature',
      properties: { name: 'Two islands', ct: [0, 0] },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [near(-20).coordinates, near(20).coordinates],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Far side', ct: [180, 0] },
      geometry: near(170),
    },
    {
      type: 'Feature',
      properties: { name: 'Fiji', ct: [180, -15] },
      geometry: pxPolygon(lonLatBox(170, -20, 190, -10)),
    },
    { type: 'Feature', properties: { name: 'One island', ct: [50, 0] }, geometry: near(50) },
  ];

  const featureOf = (out: ProjectedPolygons): number[] =>
    Array.from(out.featureOf!.subarray(0, out.polygonCount));

  it('maps each polygon to its feature: multipolygons, and features cut in two', () => {
    const flat = PROJECTIONS['equirectangular']!([0, 0, 0]);
    const out = projectPolygons(flat, H, features);
    expectValidPolygons(out, features.length);
    expect(featureOf(out)).toEqual([0, 0, 1, 2, 2, 3]);
  });

  it('skips features that are clipped away', () => {
    const globe = PROJECTIONS['orthographic']!([0, 0, 0]);
    const out = projectPolygons(globe, H, features);
    expectValidPolygons(out, features.length);
    expect(featureOf(out)).toEqual([0, 0, 3]);
  });

  it('indexes a feature collection like an array, and skips a null geometry', () => {
    const flat = PROJECTIONS['equirectangular']!([0, 0, 0]);
    const collection: GeoInput = {
      type: 'FeatureCollection',
      features: [feature(null), ...features],
    };
    expect(featureOf(projectPolygons(flat, H, collection))).toEqual([1, 1, 2, 3, 3, 4]);
    expect(projectPolygons(flat, H, []).polygonCount).toBe(0);
  });

  it('uses index 0 for a lone feature or geometry', () => {
    const flat = PROJECTIONS['equirectangular']!([0, 0, 0]);
    expect(featureOf(projectPolygons(flat, H, features[2]!))).toEqual([0, 0]);
    expect(featureOf(projectPolygons(flat, H, features[0]!.geometry))).toEqual([0, 0]);
  });
});

describe('projectPolygons: reusing the output', () => {
  const globe = PROJECTIONS['orthographic']!([40, -30, 0]);

  it('gives the same result into a used output as into a fresh one, without growing it', () => {
    fc.assert(
      fc.property(featuresArb, featuresArb, rotationArb, (first, second, rotation) => {
        const projection = PROJECTIONS['natural earth']!(rotation);
        const fresh = snapshot(projectPolygons(projection, H, second));
        // Something else first, so that stale vertices, rings and counts are there to leak.
        const out = projectPolygons(globe, H, first);
        expect(projectPolygons(projection, H, second, out)).toBe(out);
        expect(snapshot(out)).toEqual(fresh);
        const { x, y, rings, polygons, featureOf } = out;
        projectPolygons(projection, H, second, out);
        expect(snapshot(out)).toEqual(fresh);
        expect(out.x).toBe(x);
        expect(out.y).toBe(y);
        expect(out.rings).toBe(rings);
        expect(out.polygons).toBe(polygons);
        expect(out.featureOf).toBe(featureOf);
      }),
      LIMITS,
    );
  });

  it('grows an output that is too small, featureOf included', () => {
    // 600 boxes of 8 vertices each: more than the arrays start with.
    const many: GeoFeatureInput[] = [];
    for (let i = 0; i < 600; i++) {
      const lon = -170 + 11 * (i % 30);
      const lat = -80 + 8 * Math.floor(i / 30);
      many.push(feature(pxPolygon(lonLatBox(lon, lat, lon + 6, lat + 4, 3))));
    }
    const flat = PROJECTIONS['equirectangular']!([0, 0, 0]);
    const fresh = projectPolygons(flat, H, many);
    expect(fresh.polygonCount).toBe(600);
    expectValidPolygons(fresh, 600);
    const empty: ProjectedPolygons = {
      x: new Float64Array(0),
      y: new Float64Array(0),
      vertexCount: 0,
      rings: new Uint32Array(0),
      ringCount: 0,
      polygons: new Uint32Array(0),
      polygonCount: 0,
    };
    projectPolygons(flat, H, many, empty);
    expect(snapshot(empty)).toEqual(snapshot(fresh));
    // And shrinks its counts, not its arrays, for less.
    const { x } = empty;
    projectPolygons(flat, H, many.slice(0, 3), empty);
    expect(empty.polygonCount).toBe(3);
    expect(empty.ringCount).toBe(3);
    expect(empty.x).toBe(x);
    expect(snapshot(empty)).toEqual(snapshot(projectPolygons(flat, H, many.slice(0, 3))));
  });

  it('leaves the output consistent when the projection throws', () => {
    const out = projectPolygons(globe, H, SPHERE);
    const broken: GeoStreamWrapper = {
      stream: () => {
        throw new Error('no stream');
      },
    };
    expect(() => projectPolygons(broken, H, SPHERE, out)).toThrow('no stream');
    expect(out.polygonCount).toBe(0);
    expectValidPolygons(out, 1);
    expect(projectPolygons(globe, H, SPHERE, out).polygonCount).toBe(1);
  });
});

describe('projectLines', () => {
  const flat = PROJECTIONS['equirectangular']!([0, 0, 0]);
  const globe = PROJECTIONS['orthographic']!([0, 0, 0]);
  const line = (...coordinates: Position[]): GeoInput => ({ type: 'LineString', coordinates });

  it('projects a line to one polyline, y up', () => {
    const out = projectLines(flat, H, line([0, 0], [10, 0], [10, 10]));
    expectValidLines(out);
    expect(out.startCount).toBe(0);
    const points = polylinesOf(out)[0]!;
    expect(points[0]![0]).toBeCloseTo(W / 2, 9);
    expect(points[0]![1]).toBeCloseTo(H / 2, 9);
    const end = points[points.length - 1]!;
    expect(end[0]).toBeCloseTo(W / 2 + (10 * W) / 360, 9);
    expect(end[1]).toBeCloseTo(H / 2 + (10 * W) / 360, 9);
  });

  it('splits a line that crosses the antimeridian', () => {
    const out = projectLines(flat, H, line([170, 10], [-170, 10]));
    expectValidLines(out);
    const lines = polylinesOf(out);
    expect(lines).toHaveLength(2);
    expect(out.startCount).toBe(1);
    expect(out.starts[0]).toBe(lines[0]!.length);
    // To the right edge, then on from the left edge.
    expect(lines[0]![lines[0]!.length - 1]![0]).toBeCloseTo(W, 6);
    expect(lines[1]![0]![0]).toBeCloseTo(0, 6);
    for (const points of lines) {
      for (let i = 1; i < points.length; i++) {
        expect(Math.abs(points[i]![0] - points[i - 1]![0])).toBeLessThan(W / 2);
      }
    }
  });

  it('gives nothing for a line on the far side of the globe', () => {
    const out = projectLines(globe, H, line([150, -20], [180, 0], [-150, 20]));
    expect(out.vertexCount).toBe(0);
    expect(out.startCount).toBe(0);
    expect(polylinesOf(out)).toEqual([]);
  });

  it('keeps the visible part of a line that goes over the horizon', () => {
    const out = projectLines(globe, H, line([60, 0], [120, 0]));
    expectValidLines(out);
    const lines = polylinesOf(out);
    expect(lines).toHaveLength(1);
    const [cx, cy] = globe.translate();
    const end = lines[0]![lines[0]!.length - 1]!;
    expect(Math.hypot(end[0] - cx, end[1] - (H - cy))).toBeCloseTo(globe.scale(), 3);
  });

  it('lists the start of every polyline after the first', () => {
    const multi: GeoInput = {
      type: 'MultiLineString',
      coordinates: [
        // Behind the globe: dropped, so the next line is the first.
        [
          [170, 0],
          [175, 5],
        ],
        [
          [0, 0],
          [10, 0],
        ],
        // A single point is no line.
        [[20, 20]],
        [
          [0, 10],
          [10, 10],
          [20, 10],
        ],
      ],
    };
    const out = projectLines(globe, H, multi);
    expectValidLines(out);
    const lines = polylinesOf(out);
    expect(lines).toHaveLength(2);
    expect(Array.from(out.starts.subarray(0, out.startCount))).toEqual([lines[0]!.length]);
  });

  it('closes the rings of polygons, and draws the frame from the sphere', () => {
    const polygon = starPolygon({
      center: [10, 20],
      radii: [14, 9, 12, 10, 15, 9, 11, 13],
      hole: true,
    });
    const rings = polygonsOf(projectPolygons(flat, H, polygon))[0]!;
    const outlines = polylinesOf(projectLines(flat, H, polygon));
    expect(outlines).toHaveLength(2);
    for (const [r, outline] of outlines.entries()) {
      // The ring's vertices, and its first one again.
      expect(outline).toHaveLength(rings[r]!.x.length + 1);
      expect(outline[outline.length - 1]).toEqual(outline[0]);
      expect(outline.slice(0, -1).map((p) => p[0])).toEqual(rings[r]!.x);
      expect(outline.slice(0, -1).map((p) => p[1])).toEqual(rings[r]!.y);
    }

    const frame = polylinesOf(projectLines(globe, H, SPHERE));
    expect(frame).toHaveLength(1);
    expect(frame[0]![frame[0]!.length - 1]).toEqual(frame[0]![0]);
    const [cx, cy] = globe.translate();
    for (const [x, y] of frame[0]!) {
      expect(Math.hypot(x - cx, y - (H - cy))).toBeCloseTo(globe.scale(), 6);
    }

    const rect = polylinesOf(projectLines(flat, H, SPHERE));
    expect(rect).toHaveLength(1);
    expect(rect[0]![rect[0]!.length - 1]).toEqual(rect[0]![0]);

    // One frame for each part of Albers USA.
    expect(
      polylinesOf(projectLines(PROJECTIONS['albers usa']!([0, 0, 0]), H, SPHERE)),
    ).toHaveLength(3);
  });

  it('takes features, collections and arrays of features', () => {
    const a: GeoFeatureInput = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [10, 0],
        ],
      },
    };
    const b: GeoFeatureInput = {
      type: 'Feature',
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [0, 10],
            [10, 10],
          ],
          [
            [0, 20],
            [10, 20],
          ],
        ],
      },
    };
    expect(polylinesOf(projectLines(flat, H, a))).toHaveLength(1);
    expect(
      polylinesOf(projectLines(flat, H, [a, b, { type: 'Feature', geometry: null }])),
    ).toHaveLength(3);
    expect(
      polylinesOf(projectLines(flat, H, { type: 'FeatureCollection', features: [b, a] })),
    ).toHaveLength(3);
  });

  it('breaks a line at a point the projection could not place', () => {
    const holey: GeoStreamWrapper = {
      stream: (sink: GeoStream): GeoStream => ({
        point: (x, y) => sink.point(x === 30 ? NaN : x, y),
        lineStart: () => sink.lineStart(),
        lineEnd: () => sink.lineEnd(),
        polygonStart: () => sink.polygonStart(),
        polygonEnd: () => sink.polygonEnd(),
      }),
    };
    const out = projectLines(
      holey,
      100,
      line([10, 10], [20, 10], [30, 10], [40, 10], [50, 10], [30, 20], [60, 10]),
    );
    expectValidLines(out);
    // The piece after the second gap is one point, which is no line.
    expect(polylinesOf(out)).toEqual([
      [
        [10, 90],
        [20, 90],
      ],
      [
        [40, 90],
        [50, 90],
      ],
    ]);
  });

  it('keeps polylines apart should two lines ever be open at once', () => {
    // What a composite projection would do if two of its parts showed the same point: each
    // part's clip writes to the one sink, and their events interleave.
    const interleaved: GeoStreamWrapper = {
      stream: (sink: GeoStream): GeoStream => ({
        point: () => {},
        lineStart: () => {},
        lineEnd: () => {},
        polygonStart: () => {},
        polygonEnd: () => {},
        sphere: () => {
          sink.lineStart();
          sink.point(0, 0);
          sink.point(10, 0);
          sink.lineStart();
          sink.point(50, 50);
          sink.point(60, 50);
          sink.lineEnd();
          sink.point(20, 0);
          sink.lineEnd();
        },
      }),
    };
    const out = projectLines(interleaved, 100, SPHERE);
    expectValidLines(out);
    expect(polylinesOf(out)).toEqual([
      [
        [0, 100],
        [10, 100],
      ],
      [
        [50, 50],
        [60, 50],
      ],
    ]);
  });

  it('keeps starts consistent and vertices inside the clip outline on random lines', () => {
    const pathArb = fc.array(fc.tuple(uniform(-180, 180), uniform(-89, 89)), {
      minLength: 1,
      maxLength: 12,
    });
    fc.assert(
      fc.property(
        fc.constantFrom(...PROJECTION_NAMES),
        rotationArb,
        fc.array(pathArb, { minLength: 1, maxLength: 5 }),
        featuresArb,
        (name, rotation, paths, features) => {
          const projection = PROJECTIONS[name]!(rotation);
          const [x0, y0, x1, y1] = outlineBox(projection);
          const lines = projectLines(projection, H, {
            type: 'MultiLineString',
            coordinates: paths,
          });
          const outlines = projectLines(projection, H, features);
          for (const out of [lines, outlines]) {
            expectValidLines(out);
            for (let i = 0; i < out.vertexCount; i++) {
              const x = out.x[i]!;
              const y = out.y[i]!;
              if (x < x0 - 1e-6 || x > x1 + 1e-6 || y < y0 - 1e-6 || y > y1 + 1e-6) {
                throw new Error(`(${x}, ${y}) is outside [${x0}, ${y0}, ${x1}, ${y1}] of ${name}`);
              }
            }
          }
          // The outlines of polygons are closed polylines, one per ring of the fill.
          const fill = projectPolygons(projection, H, features);
          const closed = polylinesOf(outlines).filter((points) => {
            const end = points[points.length - 1]!;
            return end[0] === points[0]![0] && end[1] === points[0]![1];
          });
          expect(closed.length).toBeGreaterThanOrEqual(fill.ringCount);
        },
      ),
      LIMITS,
    );
  });

  it('reuses its output without growing it', () => {
    const multi: GeoInput = {
      type: 'MultiLineString',
      coordinates: [
        [
          [170, 10],
          [-170, 10],
        ],
        [
          [0, 0],
          [50, 50],
        ],
      ],
    };
    const out = projectLines(globe, H, SPHERE);
    const fresh = projectLines(flat, H, multi);
    expect(projectLines(flat, H, multi, out)).toBe(out);
    expect(polylinesOf(out)).toEqual(polylinesOf(fresh));
    expect(Array.from(out.starts.subarray(0, out.startCount))).toEqual(
      Array.from(fresh.starts.subarray(0, fresh.startCount)),
    );
    const { x, y, starts } = out;
    projectLines(flat, H, multi, out);
    expect(polylinesOf(out)).toEqual(polylinesOf(fresh));
    expect(out.x).toBe(x);
    expect(out.y).toBe(y);
    expect(out.starts).toBe(starts);

    // From nothing: the arrays grow, to hold a few thousand vertices and a few hundred lines.
    const graticule: Position[][] = [];
    for (let lon = -180; lon < 180; lon += 1) {
      graticule.push([
        [lon, -80],
        [lon, 0],
        [lon, 80],
      ]);
    }
    const empty: ProjectedLines = {
      x: new Float64Array(0),
      y: new Float64Array(0),
      vertexCount: 0,
      starts: new Uint32Array(0),
      startCount: 0,
    };
    projectLines(
      PROJECTIONS['natural earth']!([0, 0, 0]),
      H,
      { type: 'MultiLineString', coordinates: graticule },
      empty,
    );
    expectValidLines(empty);
    expect(empty.startCount).toBe(359);
    expect(empty.vertexCount).toBeGreaterThan(1080);
  });
});
