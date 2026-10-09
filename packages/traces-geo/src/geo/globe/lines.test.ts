/**
 * Lines and arcs on the globe (backlog GEO8): on the sphere at their radius, in pieces no longer
 * than asked, unbroken across the antimeridian; arcs that rise by their length.
 */
import fc from 'fast-check';
import type { Feature, LineString, MultiLineString, Polygon } from 'geojson';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadBasemap } from '../../basemap/index.ts';
import { loadGlobe, type GlobeModule } from '../globe-loader.ts';
import { angle, point } from './__testing__/measure.ts';
import type { SphereLines } from './lines.ts';

let globe: GlobeModule;

beforeAll(async () => {
  globe = await loadGlobe();
});

const DEGREES = 180 / Math.PI;

function at(lines: SphereLines, i: number): [number, number, number] {
  return [lines.x[i]!, lines.y[i]!, lines.z[i]!];
}

function radiusAt(lines: SphereLines, i: number): number {
  return Math.hypot(...at(lines, i));
}

/** The vertex ranges of the polylines, by `starts`. */
function polylines(lines: SphereLines): [number, number][] {
  const out: [number, number][] = [];
  let from = 0;
  for (const start of [...lines.starts, lines.vertexCount]) {
    if (start > from) out.push([from, start]);
    from = start;
  }
  return out;
}

/** The longest step between two vertices of a polyline, in degrees as seen from the centre. */
function longestStep(lines: SphereLines): number {
  let most = 0;
  for (const [from, to] of polylines(lines)) {
    for (let i = from + 1; i < to; i++)
      most = Math.max(most, angle(at(lines, i - 1), at(lines, i)));
  }
  return most;
}

function expectLayout(lines: SphereLines): void {
  expect(lines.x).toHaveLength(lines.vertexCount);
  expect(lines.y).toHaveLength(lines.vertexCount);
  expect(lines.z).toHaveLength(lines.vertexCount);
  // `starts` has every polyline after the first, ascending, each of two vertices or more.
  expect(lines.starts).toHaveLength(Math.max(0, lines.lineCount - 1));
  let previous = 0;
  for (const start of [...lines.starts, lines.vertexCount]) {
    if (lines.vertexCount > 0) expect(start - previous).toBeGreaterThanOrEqual(2);
    previous = start;
  }
}

const line = (coordinates: number[][]): LineString => ({ type: 'LineString', coordinates });

describe('buildSphereLines', () => {
  it('puts a line on the unit sphere, in pieces of at most 2.5°', () => {
    const lines = globe.buildSphereLines(
      line([
        [0, 0],
        [40, 50],
        [100, 20],
      ]),
    );
    expectLayout(lines);
    expect(lines.lineCount).toBe(1);
    for (let i = 0; i < lines.vertexCount; i++) expect(radiusAt(lines, i)).toBeCloseTo(1, 6);
    expect(longestStep(lines)).toBeLessThanOrEqual(2.5 + 1e-4);
    // The data's points are vertices, in order: first, somewhere inside, last.
    expect(angle(at(lines, 0), point(0, 0))).toBeLessThan(1e-4);
    expect(angle(at(lines, lines.vertexCount - 1), point(100, 20))).toBeLessThan(1e-4);
    let corner = Infinity;
    for (let i = 0; i < lines.vertexCount; i++) {
      corner = Math.min(corner, angle(at(lines, i), point(40, 50)));
    }
    expect(corner).toBeLessThan(1e-4);
    // Every vertex of the first segment is on the great circle through its ends.
    const a = point(0, 0);
    const b = point(40, 50);
    const normal = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const length = Math.hypot(...normal);
    for (let i = 0; i < 20; i++) {
      const [x, y, z] = at(lines, i);
      expect(Math.abs(x * normal[0]! + y * normal[1]! + z * normal[2]!) / length).toBeLessThan(
        1e-6,
      );
    }
  });

  it('takes the radius and the piece length it is given', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.3, max: 20, noNaN: true }),
        fc.double({ min: 0.5, max: 3, noNaN: true }),
        fc.array(
          fc.tuple(
            fc.double({ min: -180, max: 180, noNaN: true }),
            fc.double({ min: -85, max: 85, noNaN: true }),
          ),
          { minLength: 2, maxLength: 6 },
        ),
        (densify, radius, coordinates) => {
          const lines = globe.buildSphereLines(line(coordinates), { densify, radius });
          expectLayout(lines);
          for (let i = 0; i < lines.vertexCount; i++) {
            expect(radiusAt(lines, i) / radius).toBeCloseTo(1, 5);
          }
          expect(longestStep(lines)).toBeLessThanOrEqual(densify + 1e-3);
        },
      ),
    );
    // Values that are not positive numbers are the defaults.
    const dflt = globe.buildSphereLines(
      line([
        [0, 0],
        [90, 0],
      ]),
    );
    const odd = globe.buildSphereLines(
      line([
        [0, 0],
        [90, 0],
      ]),
      { densify: 0, radius: NaN },
    );
    expect(odd.vertexCount).toBe(dflt.vertexCount);
    expect(dflt.vertexCount).toBe(37);
  });

  it('does not break a line at the antimeridian', () => {
    for (const coordinates of [
      [
        [170, 10],
        [-170, 20],
      ],
      // The same crossing as stitched data writes it.
      [
        [170, 10],
        [190, 20],
      ],
      [
        [-175, -40],
        [175, -45],
        [-178, -50],
      ],
    ]) {
      const lines = globe.buildSphereLines(line(coordinates));
      expect(lines.lineCount).toBe(1);
      expect([...lines.starts]).toEqual([]);
      // No jump: the short way across, 20° or so, and not the long way round.
      expect(longestStep(lines)).toBeLessThanOrEqual(2.5 + 1e-4);
      expect(lines.vertexCount).toBeLessThan(30);
    }
  });

  it('closes the rings of polygons, and starts a polyline for every line and ring', () => {
    const polygon: Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 10],
          [10, 10],
          [10, 0],
          [0, 0],
        ],
        // A hole whose ring is not closed in the data: it is closed here.
        [
          [2, 2],
          [8, 2],
          [8, 8],
        ],
      ],
    };
    const rings = globe.buildSphereLines(polygon);
    expectLayout(rings);
    expect(rings.lineCount).toBe(2);
    for (const [from, to] of polylines(rings)) {
      expect(angle(at(rings, from), at(rings, to - 1))).toBeLessThan(1e-5);
    }
    // 4 sides of 10° in 4 pieces each: 17 vertices, the first again at the end.
    expect(polylines(rings)[0]).toEqual([0, 17]);

    const multi: MultiLineString = {
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
        [
          [5, 5],
          [6, 6],
          [7, 5],
        ],
      ],
    };
    const lines = globe.buildSphereLines(multi);
    expect(lines.lineCount).toBe(2);
    expect([...lines.starts]).toEqual([2]);
    expect(lines.vertexCount).toBe(5);

    // Features, collections, arrays of features and geometry collections are walked.
    const feature: Feature<MultiLineString> = { type: 'Feature', properties: {}, geometry: multi };
    expect(globe.buildSphereLines(feature).vertexCount).toBe(5);
    expect(globe.buildSphereLines([feature, feature]).lineCount).toBe(4);
    expect(
      globe.buildSphereLines({ type: 'FeatureCollection', features: [feature] }).lineCount,
    ).toBe(2);
    const collection = { type: 'GeometryCollection', geometries: [multi, polygon] } as const;
    expect(globe.buildSphereLines(collection as never).lineCount).toBe(4);
    // Geometry without lines, and a feature without geometry, are nothing.
    expect(globe.buildSphereLines({ type: 'Point', coordinates: [0, 0] }).vertexCount).toBe(0);
    expect(globe.buildSphereLines({ type: 'Sphere' }).lineCount).toBe(0);
    expect(globe.buildSphereLines({ type: 'Feature', geometry: null }).vertexCount).toBe(0);
  });

  it('breaks a line at a point that is nowhere, and drops what is left of one point', () => {
    const lines = globe.buildSphereLines(
      line([
        [0, 0],
        [1, 0],
        [NaN, 0],
        [5, 0],
        [6, 0],
        [7, Infinity],
        [9, 0],
      ]),
    );
    expectLayout(lines);
    expect(lines.lineCount).toBe(2);
    expect(lines.vertexCount).toBe(4);
    // A point alone is no line; a repeated point adds nothing.
    expect(globe.buildSphereLines(line([[3, 3]])).vertexCount).toBe(0);
    expect(
      globe.buildSphereLines(
        line([
          [3, 3],
          [3, 3],
          [4, 3],
        ]),
      ).vertexCount,
    ).toBe(2);
  });

  it('goes over the pole between antipodes', () => {
    const lines = globe.buildSphereLines(
      line([
        [0, 0],
        [180, 0],
      ]),
    );
    expect(lines.lineCount).toBe(1);
    expect(longestStep(lines)).toBeLessThanOrEqual(2.5 + 1e-4);
    let north = -Infinity;
    for (let i = 0; i < lines.vertexCount; i++) {
      north = Math.max(north, lines.y[i]!);
      expect(radiusAt(lines, i)).toBeCloseTo(1, 6);
    }
    expect(north).toBeCloseTo(1, 6);
    // From a pole to the other, by longitude 0.
    const poles = globe.buildSphereLines(
      line([
        [0, 90],
        [0, -90],
      ]),
    );
    expect(Math.max(...poles.z)).toBeCloseTo(1, 6);
  });

  it('draws the coastlines of the basemap', async () => {
    const layers = await loadBasemap(110, 'world', { extras: false });
    const lines = globe.buildSphereLines(layers.coastlines!, { radius: 1.001 });
    expectLayout(lines);
    expect(lines.lineCount).toBeGreaterThan(100);
    for (let i = 0; i < lines.vertexCount; i += 7) expect(radiusAt(lines, i)).toBeCloseTo(1.001, 5);
    expect(longestStep(lines)).toBeLessThanOrEqual(2.5 + 1e-3);
  });
});

describe('buildArcs', () => {
  /** New York, London. */
  const NYC = [-74, 40.7] as const;
  const LONDON = [-0.1, 51.5] as const;

  it('joins two points by an arc that starts and ends on the surface and peaks in the middle', () => {
    const arcs = globe.buildArcs([NYC[0], LONDON[0]], [NYC[1], LONDON[1]]);
    expectLayout(arcs);
    expect(arcs.lineCount).toBe(1);
    const n = arcs.vertexCount;
    expect(angle(at(arcs, 0), point(...NYC))).toBeLessThan(1e-4);
    expect(angle(at(arcs, n - 1), point(...LONDON))).toBeLessThan(1e-4);
    expect(radiusAt(arcs, 0)).toBeCloseTo(1, 6);
    expect(radiusAt(arcs, n - 1)).toBeCloseTo(1, 6);
    // The highest vertex is the middle one, `lift` × the arc's angle above the surface.
    const length = angle(point(...NYC), point(...LONDON)) / DEGREES;
    expect(length * DEGREES).toBeCloseTo(50.1, 0);
    expect(globe.DEFAULT_LIFT).toBe(0.15);
    let top = 0;
    let topAt = -1;
    for (let i = 0; i < n; i++) {
      const r = radiusAt(arcs, i);
      expect(r).toBeGreaterThanOrEqual(1 - 1e-6);
      if (r > top) {
        top = r;
        topAt = i;
      }
    }
    expect(n % 2).toBe(1);
    expect(topAt).toBe((n - 1) / 2);
    expect(top).toBeCloseTo(1 + 0.15 * length, 5);
    expect(top).toBeCloseTo(1.131, 3);
    // It rises and falls evenly: the same height at the same distance from either end.
    for (let i = 0; i < n; i++) {
      expect(radiusAt(arcs, i)).toBeCloseTo(radiusAt(arcs, n - 1 - i), 5);
      if (i > 0 && i <= topAt) expect(radiusAt(arcs, i)).toBeGreaterThan(radiusAt(arcs, i - 1));
    }
    // Under it, the great circle: every vertex is above the arc between the two cities.
    const a = point(...NYC);
    const b = point(...LONDON);
    const normal = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    for (let i = 0; i < n; i++) {
      const [x, y, z] = at(arcs, i);
      expect(Math.abs(x * normal[0]! + y * normal[1]! + z * normal[2]!)).toBeLessThan(1e-6);
    }
    expect(longestStep(arcs)).toBeLessThanOrEqual(2.5 + 1e-3);
  });

  it('rises by the length of the segment, times the lift', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.double({ min: -180, max: 180, noNaN: true }),
          fc.double({ min: -89, max: 89, noNaN: true }),
        ),
        fc.tuple(
          fc.double({ min: -180, max: 180, noNaN: true }),
          fc.double({ min: -89, max: 89, noNaN: true }),
        ),
        fc.double({ min: 0, max: 0.3, noNaN: true }),
        fc.double({ min: 0.5, max: 2, noNaN: true }),
        (from, to, lift, radius) => {
          const length = angle(point(...from), point(...to)) / DEGREES;
          fc.pre(length > 1e-3 && length < Math.PI - 1e-3);
          const arcs = globe.buildArcs([from[0], to[0]], [from[1], to[1]], { lift, radius });
          expect(arcs.lineCount).toBe(1);
          const n = arcs.vertexCount;
          expect(radiusAt(arcs, 0) / radius).toBeCloseTo(1, 5);
          expect(radiusAt(arcs, n - 1) / radius).toBeCloseTo(1, 5);
          let top = 0;
          for (let i = 0; i < n; i++) top = Math.max(top, radiusAt(arcs, i));
          expect(top / radius).toBeCloseTo(1 + lift * length, 4);
          // A lift so small that the height underflows to 0 (5e-324) lifts nothing: the
          // segment then has no vertex in its middle to speak of.
          if (lift * length > 0 && n > 2) {
            expect(radiusAt(arcs, (n - 1) / 2) / radius).toBeCloseTo(1 + lift * length, 4);
          }
          expect(longestStep(arcs)).toBeLessThanOrEqual(2.5 + 1e-3);
        },
      ),
    );
  });

  it('keeps a short hop low and gives a high arc the pieces its curve needs', () => {
    // 1° apart: 0.0026 radii up, which one piece cannot show: two.
    const hop = globe.buildArcs([0, 1], [0, 0]);
    expect(hop.vertexCount).toBe(3);
    expect(radiusAt(hop, 1)).toBeCloseTo(1 + (0.15 * Math.PI) / 180, 6);
    // Lift 0: on the surface, as `buildSphereLines` draws it.
    const flat = globe.buildArcs([0, 40], [0, 0], { lift: 0 });
    expect(flat.vertexCount).toBe(17);
    for (let i = 0; i < flat.vertexCount; i++) expect(radiusAt(flat, i)).toBeCloseTo(1, 6);
    // A coarse `densify` does not make a high arc angular.
    const coarse = globe.buildArcs([0, 60], [0, 0], { densify: 60, lift: 0.3 });
    expect(coarse.vertexCount).toBeGreaterThan(10);
    // A negative or absent lift is none, or the default.
    expect(radiusAt(globe.buildArcs([0, 40], [0, 0], { lift: -1 }), 8)).toBeCloseTo(1, 6);
  });

  it('reaches the antipodes, half a radius up and inside the room the camera keeps', () => {
    const arcs = globe.buildArcs([10, -170], [35, -35]);
    expect(arcs.lineCount).toBe(1);
    const n = arcs.vertexCount;
    expect(angle(at(arcs, 0), point(10, 35))).toBeLessThan(1e-4);
    expect(angle(at(arcs, n - 1), point(-170, -35))).toBeLessThan(1e-4);
    let top = 0;
    for (let i = 0; i < n; i++) top = Math.max(top, radiusAt(arcs, i));
    expect(top).toBeCloseTo(1 + 0.15 * Math.PI, 4);
    expect(top).toBeLessThan(2);
    expect(longestStep(arcs)).toBeLessThanOrEqual(2.5 + 1e-3);
  });

  it('joins consecutive points, each segment an arc of its own', () => {
    const arcs = globe.buildArcs([0, 30, 60, 60], [0, 0, 0, 0]);
    expect(arcs.lineCount).toBe(1);
    // Back on the surface at every point of the data.
    let onSurface = 0;
    for (let i = 0; i < arcs.vertexCount; i++) if (radiusAt(arcs, i) < 1 + 1e-6) onSurface++;
    expect(onSurface).toBe(3);
    // A repeated point adds nothing.
    expect(arcs.vertexCount).toBe(globe.buildArcs([0, 30, 60], [0, 0, 0]).vertexCount);
  });

  it('breaks at a gap, unless the gaps are connected', () => {
    const lon = [0, 10, NaN, 30, 40, 50];
    const lat = [0, 0, 0, 0, null as unknown as number, 0];
    const broken = globe.buildArcs(lon, lat);
    expectLayout(broken);
    // 0–10, then 30 alone (dropped), then 50 alone (dropped).
    expect(broken.lineCount).toBe(1);
    expect(angle(at(broken, broken.vertexCount - 1), point(10, 0))).toBeLessThan(1e-4);
    const two = globe.buildArcs([0, 10, NaN, 30, 40], [0, 0, 0, 0, 0]);
    expect(two.lineCount).toBe(2);
    expect(two.starts).toHaveLength(1);
    expect(angle(at(two, two.starts[0]!), point(30, 0))).toBeLessThan(1e-4);
    const connected = globe.buildArcs(lon, lat, { connectgaps: true });
    expect(connected.lineCount).toBe(1);
    expect(angle(at(connected, connected.vertexCount - 1), point(50, 0))).toBeLessThan(1e-4);
    // 0 → 10 → 30 → 50: back on the surface four times.
    let onSurface = 0;
    for (let i = 0; i < connected.vertexCount; i++) {
      if (radiusAt(connected, i) < 1 + 1e-6) onSurface++;
    }
    expect(onSurface).toBe(4);
    // Typed arrays are taken, and the shorter of the two decides.
    const typed = globe.buildArcs(Float64Array.of(0, 10, 20), Float32Array.of(0, 0));
    expect(angle(at(typed, typed.vertexCount - 1), point(10, 0))).toBeLessThan(1e-4);
    expect(globe.buildArcs([], []).vertexCount).toBe(0);
  });
});
