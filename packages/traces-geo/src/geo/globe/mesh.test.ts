/**
 * The sphere meshes of the globe (backlog GEO8) against d3 itself: a mesh covers what
 * `d3.geoArea` says its polygons cover, with every triangle facing outwards, no edge too long and
 * no T-junction, for made-up polygons anywhere on the sphere and for the real basemap: Russia and
 * Fiji across the antimeridian, Antarctica around the pole, Lesotho inside South Africa.
 */
import { geoArea, geoCircle } from 'd3-geo';
import fc from 'fast-check';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadBasemap } from '../../basemap/index.ts';
import { loadGlobe, type GlobeModule } from '../globe-loader.ts';
import type { BasemapLayers, CountryProperties } from '../types.ts';
import {
  angle,
  arc,
  coverage,
  directedEdges,
  lonLat,
  mostSharedEdge,
  point,
  rim,
  turn,
  vertex,
} from './__testing__/measure.ts';
import type { SphereMesh } from './mesh.ts';

let globe: GlobeModule;
let world110: BasemapLayers;
let world50: BasemapLayers;

beforeAll(async () => {
  globe = await loadGlobe();
  world110 = await loadBasemap(110, 'world', { extras: false });
  world50 = await loadBasemap(50, 'world', { extras: false });
});

type Country = Feature<Polygon | MultiPolygon, CountryProperties>;

function country(layers: BasemapLayers, name: string): Country {
  const found = layers.countries!.find((f) => f.properties.name === name);
  if (!found) throw new Error(`no country ${name}`);
  return found;
}

/** A small circle about `center`, wound for d3: the cap is the inside. */
function cap(center: [number, number], radius: number, precision = 10): Polygon {
  return geoCircle().center(center).radius(radius).precision(precision)();
}

/** A box of longitude and latitude, wound for d3 (clockwise seen from outside). */
function box(west: number, south: number, east: number, north: number): Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    ],
  };
}

function feature(geometry: Polygon | MultiPolygon): Feature<Polygon | MultiPolygon> {
  return { type: 'Feature', properties: {}, geometry };
}

/** What every mesh must be, whatever it was built from. */
function expectSound(mesh: SphereMesh, maxEdge = 5): void {
  const { positions, indices, vertexCount, triangleCount } = mesh;
  expect(positions).toHaveLength(vertexCount * 3);
  expect(mesh.normals).toBe(positions);
  expect(indices).toHaveLength(triangleCount * 3);
  expect(mesh.featureOf).toHaveLength(vertexCount);
  expect(mesh.boundary).toHaveLength(mesh.boundaryCount * 2);
  // Every vertex on the unit sphere, as far as float32 has it.
  let off = 0;
  for (let v = 0; v < vertexCount; v++) {
    off = Math.max(off, Math.abs(Math.hypot(...vertex(mesh, v)) - 1));
  }
  expect(off).toBeLessThan(1e-6);
  let highest = 0;
  for (let i = 0; i < indices.length; i++) highest = Math.max(highest, indices[i]!);
  expect(highest).toBeLessThan(vertexCount);
  // Every triangle faces outwards, and none is longer than asked.
  const cover = coverage(mesh);
  expect(cover.inward).toBe(0);
  expect(cover.longestEdge).toBeLessThanOrEqual(maxEdge + 1e-6);
  // No T-junctions: an edge belongs to two triangles, or to one on the rim. The two run it in
  // opposite ways, but for the few slivers that were turned round.
  expect(mostSharedEdge(mesh)).toBeLessThanOrEqual(2);
  if (mesh.overlap === 0) {
    for (const count of directedEdges(mesh).values()) expect(count).toBe(1);
  }
  // A triangle belongs to one feature.
  for (let i = 0; i < indices.length; i += 3) {
    const f = mesh.featureOf[indices[i]!];
    expect(mesh.featureOf[indices[i + 1]!]).toBe(f);
    expect(mesh.featureOf[indices[i + 2]!]).toBe(f);
  }
}

/** The mesh covers `expected` steradians: once, and twice more on the slivers it reports. */
function expectArea(mesh: SphereMesh, expected: number, what = '', slivers = 2e-3): void {
  const covered = coverage(mesh).area - 2 * mesh.overlap;
  // Float32 positions: a few millionths for a region, and a floor for an islet.
  expect(Math.abs(covered - expected), what).toBeLessThan(1e-5 * expected + 2e-9);
  // The slivers are a detail, not a share of the region.
  expect(mesh.overlap, what).toBeLessThan(slivers * expected + 1e-12);
}

/**
 * The boundary of a mesh is part of its rim, run with the region on the left; what else is on
 * the rim lies along the antimeridian or on a pole.
 *
 * Vertices are compared by where they are: a ring of the 1:50m data that touches itself in a
 * point has two vertices there, and the triangulation may join either to their neighbours.
 */
function expectBoundary(mesh: SphereMesh, stray = 0): { seam: number; pole: number } {
  const n = mesh.vertexCount;
  const first = new Map<string, number>();
  const place = (v: number): number => {
    const key = vertex(mesh, v).join();
    const known = first.get(key);
    if (known === undefined) first.set(key, v);
    return known ?? v;
  };
  const edges = new Set(rim(mesh).map(([a, b]) => place(a) * n + place(b)));
  const listed = new Set<number>();
  let strays = 0;
  for (let e = 0; e < mesh.boundaryCount; e++) {
    const a = place(mesh.boundary[2 * e]!);
    const b = place(mesh.boundary[2 * e + 1]!);
    // A triangle runs its edges with itself on the left; one turned round runs them backwards.
    const ok = edges.has(a * n + b) || (mesh.overlap > 0 && edges.has(b * n + a));
    if (!ok) strays++;
    listed.add(a * n + b).add(b * n + a);
  }
  expect(strays).toBeLessThanOrEqual(stray);
  let seam = 0;
  let pole = 0;
  for (const key of edges) {
    if (listed.has(key)) continue;
    const a = lonLat(mesh, Math.floor(key / n));
    const b = lonLat(mesh, key % n);
    const atPole = Math.abs(a[1]) > 90 - 1e-4 && Math.abs(b[1]) > 90 - 1e-4;
    const atSeam = Math.abs(a[0]) > 180 - 1e-4 && Math.abs(b[0]) > 180 - 1e-4;
    if (!atPole && !atSeam) strays++;
    else if (atPole) pole++;
    else seam++;
  }
  expect(strays).toBeLessThanOrEqual(2 * stray);
  return { seam, pole };
}

describe('buildSphereMesh', () => {
  it('meshes a box: on the sphere, outwards, with its area and its outline', () => {
    const polygon = box(10, 20, 50, 60);
    const mesh = globe.buildSphereMesh(polygon);
    expectSound(mesh);
    expectArea(mesh, geoArea(polygon));
    expect(mesh.overlap).toBe(0);
    expect([...new Set(mesh.featureOf)]).toEqual([0]);
    // The whole rim is boundary: nothing was cut.
    expect(expectBoundary(mesh)).toEqual({ seam: 0, pole: 0 });
    expect(mesh.boundaryCount).toBe(rim(mesh).length);
    // The boundary is one closed loop: every vertex on it is left once and reached once.
    const from = new Map<number, number>();
    const to = new Map<number, number>();
    for (let e = 0; e < mesh.boundaryCount; e++) {
      from.set(mesh.boundary[2 * e]!, (from.get(mesh.boundary[2 * e]!) ?? 0) + 1);
      to.set(mesh.boundary[2 * e + 1]!, (to.get(mesh.boundary[2 * e + 1]!) ?? 0) + 1);
    }
    expect([...from.values()].every((c) => c === 1)).toBe(true);
    expect([...to.keys()].sort()).toEqual([...from.keys()].sort());
    // The corners are vertices, where the data put them.
    const corners = [
      [10, 20],
      [10, 60],
      [50, 60],
      [50, 20],
    ];
    for (const [lon, lat] of corners) {
      let nearest = Infinity;
      for (let v = 0; v < mesh.vertexCount; v++) {
        const at = lonLat(mesh, v);
        nearest = Math.min(nearest, Math.hypot(at[0] - lon!, at[1] - lat!));
      }
      expect(nearest).toBeLessThan(1e-4);
    }
  });

  it('follows the great arcs of the edges, not the parallels', () => {
    // The box's top is the great arc from (10°, 60°) to (50°, 60°), which rises to 61.8° in
    // the middle: the boundary's vertices are on that arc.
    const mesh = globe.buildSphereMesh(box(10, 20, 50, 60));
    let top = -Infinity;
    for (let e = 0; e < mesh.boundaryCount; e++)
      top = Math.max(top, lonLat(mesh, mesh.boundary[2 * e]!)[1]);
    const middle = Math.atan(Math.tan((60 * Math.PI) / 180) / Math.cos((20 * Math.PI) / 180));
    expect(top).toBeCloseTo((middle * 180) / Math.PI, 3);
  });

  it('keeps every edge within maxEdge and every boundary piece within densify', () => {
    const polygon = cap([30, 40], 35, 30);
    for (const [densify, maxEdge] of [
      [2.5, 5],
      [1, 2],
      [10, 20],
      [0.5, 12],
    ] as const) {
      const mesh = globe.buildSphereMesh(polygon, { densify, maxEdge });
      expectSound(mesh, maxEdge);
      // Coarse triangles leave coarser slivers.
      expectArea(mesh, geoArea(polygon), `${densify}, ${maxEdge}`, maxEdge > 5 ? 2e-2 : 2e-3);
      for (let e = 0; e < mesh.boundaryCount; e++) {
        const piece = arc(mesh, mesh.boundary[2 * e]!, mesh.boundary[2 * e + 1]!);
        expect(piece).toBeLessThanOrEqual(densify + 1e-6);
      }
    }
    // Finer settings make a finer mesh of the same thing.
    const coarse = globe.buildSphereMesh(polygon, { densify: 10, maxEdge: 20 });
    const fine = globe.buildSphereMesh(polygon, { densify: 1, maxEdge: 2 });
    expect(fine.triangleCount).toBeGreaterThan(4 * coarse.triangleCount);
    // Values that are not positive numbers are the defaults.
    const dflt = globe.buildSphereMesh(polygon);
    const odd = globe.buildSphereMesh(polygon, { densify: NaN, maxEdge: -1 });
    expect(odd.triangleCount).toBe(dflt.triangleCount);
    expect([globe.DEFAULT_DENSIFY, globe.DEFAULT_MAX_EDGE]).toEqual([2.5, 5]);
  });

  it('cuts a hole', () => {
    const outer = cap([-70, -10], 30).coordinates[0]!;
    const inner = [...cap([-70, -10], 12).coordinates[0]!].reverse();
    const polygon: Polygon = { type: 'Polygon', coordinates: [outer, inner] };
    const mesh = globe.buildSphereMesh(polygon);
    expectSound(mesh);
    expectArea(mesh, geoArea(polygon));
    expect(geoArea(polygon)).toBeLessThan(geoArea(cap([-70, -10], 30)));
    // Two loops of boundary: the rim and the hole's edge.
    expect(expectBoundary(mesh)).toEqual({ seam: 0, pole: 0 });
    // Nothing of the mesh is inside the hole.
    const centre = point(-70, -10);
    for (let v = 0; v < mesh.vertexCount; v++) {
      expect(angle(vertex(mesh, v), centre)).toBeGreaterThan(11.9);
    }
  });

  it('meshes a region across the antimeridian, with no boundary along the cut', () => {
    // A box from 150°E eastwards to 150°W, as stitched data has it.
    const polygon = box(150, 40, 210, 70);
    const mesh = globe.buildSphereMesh(polygon);
    expectSound(mesh);
    expectArea(mesh, geoArea(polygon));
    const { seam, pole } = expectBoundary(mesh);
    expect(seam).toBeGreaterThan(0);
    expect(pole).toBe(0);
    for (let e = 0; e < mesh.boundaryCount; e++) {
      const a = lonLat(mesh, mesh.boundary[2 * e]!);
      const b = lonLat(mesh, mesh.boundary[2 * e + 1]!);
      expect(Math.abs(a[0]) > 179.999 && Math.abs(b[0]) > 179.999).toBe(false);
    }
    // Both sides of the cut have the same vertices along it: no gap on the sphere. (A vertex
    // at ±180° keeps the sign of its longitude in the sign of its x, which is ±1e-16.)
    const along = (side: number): number[] => {
      const lats = new Set<number>();
      for (let v = 0; v < mesh.vertexCount; v++) {
        const [lon, lat] = lonLat(mesh, v);
        if (Math.abs(lon) > 179.9999 && Math.sign(lon) === side) lats.add(lat);
      }
      return [...lats].sort((a, b) => a - b);
    };
    expect(along(1).length).toBeGreaterThan(6);
    expect(along(1)).toEqual(along(-1));
  });

  it('meshes a cap around a pole in the plane about that pole: no cut, no pole edge', () => {
    for (const centre of [
      [0, 90],
      [40, -90],
      [120, 80],
      [-30, -75],
    ] as [number, number][]) {
      const polygon = cap(centre, 25);
      const mesh = globe.buildSphereMesh(polygon);
      expectSound(mesh);
      expectArea(mesh, geoArea(polygon), centre.join());
      expect(expectBoundary(mesh), centre.join()).toEqual({ seam: 0, pole: 0 });
      expect(mesh.boundaryCount).toBe(rim(mesh).length);
      // The boundary is the cap's rim: its vertices are 25° from the centre, or a little less
      // between two of the cap's own (the arc between them is inside the circle).
      for (let e = 0; e < mesh.boundaryCount; e++) {
        const from = angle(vertex(mesh, mesh.boundary[2 * e]!), point(...centre));
        expect(from).toBeGreaterThan(24.8);
        expect(from).toBeLessThan(25.001);
      }
    }
  });

  it('keeps the edge of a feature that ends at the antimeridian, and not one that goes on', () => {
    // A box whose east side is the antimeridian: its boundary runs along it.
    const ends = globe.buildSphereMesh(box(160, 0, 180, 20));
    expectSound(ends);
    expect(expectBoundary(ends)).toEqual({ seam: 0, pole: 0 });
    // The same box and its neighbour across the antimeridian, as one feature split by its data.
    const split: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [box(160, 0, 180, 20).coordinates, box(-180, 0, -160, 20).coordinates],
    };
    const goesOn = globe.buildSphereMesh(split);
    expectSound(goesOn);
    expectArea(goesOn, geoArea(split));
    const { seam } = expectBoundary(goesOn);
    expect(seam).toBeGreaterThan(0);
    // As two features, each ends there.
    const two = globe.buildSphereMesh([
      feature(box(160, 0, 180, 20)),
      feature(box(-180, 0, -160, 20)),
    ]);
    expect(expectBoundary(two)).toEqual({ seam: 0, pole: 0 });
  });

  it('names the feature of every vertex, and covers each feature', () => {
    const features = [
      feature(cap([0, 0], 20)),
      feature(cap([180, 10], 15)),
      // No polygon: a feature without vertices.
      { type: 'Feature', properties: {}, geometry: null } as unknown as Feature<Polygon>,
      feature({
        type: 'MultiPolygon',
        coordinates: [cap([-100, 60], 8).coordinates, cap([100, -60], 8).coordinates],
      }),
      feature(cap([30, -90], 10)),
    ];
    const mesh = globe.buildSphereMesh(features);
    expectSound(mesh);
    expect([...new Set(mesh.featureOf)].sort()).toEqual([0, 1, 3, 4]);
    // Each feature's triangles cover the feature.
    const areas = new Map<number, number>();
    for (let t = 0; t < mesh.triangleCount; t++) {
      const f = mesh.featureOf[mesh.indices[3 * t]!]!;
      areas.set(f, (areas.get(f) ?? 0) + coverage(mesh, t, 1).area);
    }
    for (const [f, area] of areas) {
      expect(Math.abs(area - geoArea(features[f]!)), `feature ${f}`).toBeLessThan(2e-5);
    }
    // A collection, a lone feature and a bare geometry are taken as well.
    const collection = globe.buildSphereMesh({ type: 'FeatureCollection', features });
    expect(collection.triangleCount).toBe(mesh.triangleCount);
    expect(globe.buildSphereMesh(features[0]!).triangleCount).toBe(
      globe.buildSphereMesh(features[0]!.geometry).triangleCount,
    );
    // Nothing to mesh is an empty mesh.
    const empty = globe.buildSphereMesh({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [10, 10],
      ],
    });
    expect([empty.vertexCount, empty.triangleCount, empty.boundaryCount]).toEqual([0, 0, 0]);
  });

  it('gives two regions the same vertices along the edge they share', () => {
    // Two triangles on either side of the great arc from (0°, 0°) to (40°, 50°), which is
    // neither a meridian nor a parallel; each runs it the other way.
    const a: Position = [0, 0];
    const b: Position = [40, 50];
    const left = feature({ type: 'Polygon', coordinates: [[a, [-20, 40], b, a]] });
    const right = feature({ type: 'Polygon', coordinates: [[a, b, [50, 0], a]] });
    expect(geoArea(left)).toBeLessThan(2 * Math.PI);
    expect(geoArea(right)).toBeLessThan(2 * Math.PI);
    const mesh = globe.buildSphereMesh([left, right], { densify: 1, maxEdge: 2 });
    expectSound(mesh, 2);
    // Vertices on the shared arc: those whose position both features have, bit for bit.
    const keyOf = (v: number): string => vertex(mesh, v).join(',');
    const sides: [Set<string>, Set<string>] = [new Set(), new Set()];
    for (let e = 0; e < mesh.boundaryCount; e++) {
      const v = mesh.boundary[2 * e]!;
      sides[mesh.featureOf[v] as 0 | 1].add(keyOf(v));
    }
    const shared = [...sides[0]].filter((k) => sides[1].has(k));
    // The arc is 60.5° long: 61 pieces of at most 1°, and so 62 vertices or more.
    expect(shared.length).toBeGreaterThanOrEqual(62);
    // Every boundary vertex of either side that lies on the arc is one of them.
    const p = point(0, 0);
    const q = point(40, 50);
    const normal = [
      p[1] * q[2] - p[2] * q[1],
      p[2] * q[0] - p[0] * q[2],
      p[0] * q[1] - p[1] * q[0],
    ];
    const length = Math.hypot(...normal);
    for (const side of sides) {
      let onArc = 0;
      for (const key of side) {
        const [x, y, z] = key.split(',').map(Number) as [number, number, number];
        if (Math.abs((x * normal[0]! + y * normal[1]! + z * normal[2]!) / length) < 1e-6) onArc++;
      }
      expect(onArc).toBe(shared.length);
    }
  });

  it('covers any cap on the sphere, with or without a hole', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.double({ min: -180, max: 180, noNaN: true }),
          fc.double({ min: -90, max: 90, noNaN: true }),
        ),
        fc.double({ min: 2, max: 85, noNaN: true }),
        fc.constantFrom(5, 10, 30, 60),
        fc.boolean(),
        (centre, radius, precision, holed) => {
          const outer = cap(centre, radius, precision).coordinates[0]!;
          const polygon: Polygon = {
            type: 'Polygon',
            coordinates: holed
              ? [outer, [...cap(centre, radius / 3, precision).coordinates[0]!].reverse()]
              : [outer],
          };
          const mesh = globe.buildSphereMesh(polygon);
          expectSound(mesh);
          expectArea(mesh, geoArea(polygon));
          expectBoundary(mesh);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('meshes a region that holds both poles in the flat chart, fans about the poles and all', () => {
    // Everything but a cap on the equator: the cap's ring run the other way round.
    const hole = [...cap([0, 0], 30).coordinates[0]!].reverse();
    const polygon: Polygon = { type: 'Polygon', coordinates: [hole] };
    expect(geoArea(polygon)).toBeGreaterThan(3 * Math.PI);
    const mesh = globe.buildSphereMesh(polygon);
    expectSound(mesh);
    // No chart is without a tear in it. In the flat one each pole is an edge, and the triangles
    // about it do not all lie right on the sphere: the mesh covers the region, and covers some
    // of it near the poles more than once, which it reports.
    expectArea(mesh, geoArea(polygon), '', 2e-2);
    expect(mesh.overlap).toBeGreaterThan(0);
    const { seam, pole } = expectBoundary(mesh);
    expect(seam).toBeGreaterThan(0);
    expect(pole).toBeGreaterThan(0);
    // The boundary is the cap's rim alone.
    for (let e = 0; e < mesh.boundaryCount; e++) {
      const from = angle(vertex(mesh, mesh.boundary[2 * e]!), point(0, 0));
      expect(from).toBeGreaterThan(29.8);
      expect(from).toBeLessThan(30.001);
    }
  });

  it('needs what loadGlobe() hands it', async () => {
    vi.resetModules();
    const fresh = await import('./mesh.ts');
    expect(() => fresh.buildSphereMesh(box(0, 0, 10, 10))).toThrow(/loadGlobe\(\)/);
    vi.resetModules();
  });
});

describe('buildSphereMesh on the basemap', () => {
  it('covers the land at 1:110m', () => {
    const land = world110.land!;
    const mesh = globe.buildSphereMesh(land);
    expectSound(mesh);
    expectArea(mesh, geoArea(land));
    expectBoundary(mesh);
  });

  it('covers every country at 1:110m, each on its own', () => {
    const countries = world110.countries!;
    expect(countries.length).toBeGreaterThan(170);
    for (const f of countries) {
      const mesh = globe.buildSphereMesh(f);
      const name = f.properties.name;
      expect(coverage(mesh).inward, name).toBe(0);
      expectArea(mesh, geoArea(f), name);
    }
  });

  it('covers all countries at 1:110m as one mesh, each vertex naming its country', () => {
    const countries = world110.countries!;
    const mesh = globe.buildSphereMesh(countries);
    expectSound(mesh);
    expectArea(
      mesh,
      countries.reduce((sum, f) => sum + geoArea(f), 0),
    );
    expectBoundary(mesh);
    const areas = new Float64Array(countries.length);
    for (let t = 0; t < mesh.triangleCount; t++) {
      areas[mesh.featureOf[mesh.indices[3 * t]!]!]! += coverage(mesh, t, 1).area;
    }
    countries.forEach((f, i) => {
      const expected = geoArea(f);
      // Without the slivers' share, which the mesh reports for all countries together.
      expect(Math.abs(areas[i]! - expected), f.properties.name).toBeLessThan(
        2e-3 * expected + 1e-8,
      );
    });
  });

  it('covers the land at 1:50m', () => {
    const land = world50.land!;
    const mesh = globe.buildSphereMesh(land);
    expectSound(mesh);
    expectArea(mesh, geoArea(land));
    // Two atolls of the 1:50m data are rings that overlap themselves, which is no polygon to
    // triangulate: one edge of each is listed as boundary and is no edge of the mesh.
    expect(mesh.boundaryCount).toBeGreaterThan(50000);
    expectBoundary(mesh, 4);
  });

  it('meshes Russia and Fiji across the antimeridian', () => {
    for (const name of ['Russia', 'Fiji']) {
      const f = country(world110, name);
      const mesh = globe.buildSphereMesh(f);
      expectSound(mesh);
      expectArea(mesh, geoArea(f), name);
      const { seam, pole } = expectBoundary(mesh);
      expect(seam, name).toBeGreaterThan(0);
      expect(pole, name).toBe(0);
      // Vertices on both sides of the antimeridian.
      let east = 0;
      let west = 0;
      for (let v = 0; v < mesh.vertexCount; v++) {
        const lon = lonLat(mesh, v)[0];
        if (lon > 170) east++;
        if (lon < -170) west++;
      }
      expect(east, name).toBeGreaterThan(0);
      expect(west, name).toBeGreaterThan(0);
    }
  });

  it('meshes Antarctica around the pole', () => {
    const f = country(world110, 'Antarctica');
    const mesh = globe.buildSphereMesh(f);
    expectSound(mesh);
    expectArea(mesh, geoArea(f));
    // Meshed in the plane about the south pole: nothing is cut, and all of the rim is coast.
    expect(expectBoundary(mesh)).toEqual({ seam: 0, pole: 0 });
    expect(mesh.boundaryCount).toBe(rim(mesh).length);
    // The pole itself is covered: it is inside one of the triangles.
    const pole = { positions: new Float32Array(12), indices: mesh.indices };
    pole.positions.set([0, -1, 0], 9);
    let holding = 0;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      for (let k = 0; k < 3; k++) pole.positions.set(vertex(mesh, mesh.indices[i + k]!), 3 * k);
      if (turn(pole, 0, 1, 3) >= 0 && turn(pole, 1, 2, 3) >= 0 && turn(pole, 2, 0, 3) >= 0) {
        holding++;
      }
    }
    expect(holding).toBeGreaterThanOrEqual(1);
    // And every triangle faces away from the centre, also the fan around the pole.
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const det = turn(mesh, mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!);
      expect(det).toBeGreaterThan(-1e-9);
    }
  });

  it('leaves Lesotho out of South Africa', () => {
    const southAfrica = country(world110, 'South Africa');
    const lesotho = country(world110, 'Lesotho');
    const mesh = globe.buildSphereMesh(southAfrica);
    expectSound(mesh);
    expectArea(mesh, geoArea(southAfrica));
    // A point of Lesotho is in none of South Africa's triangles.
    const inside = { positions: new Float32Array(12), indices: mesh.indices };
    inside.positions.set(vertex(globe.buildSphereMesh(lesotho), 0), 9);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      for (let k = 0; k < 3; k++) inside.positions.set(vertex(mesh, mesh.indices[i + k]!), 3 * k);
      const within =
        turn(inside, 0, 1, 3) > 1e-9 &&
        turn(inside, 1, 2, 3) > 1e-9 &&
        turn(inside, 2, 0, 3) > 1e-9;
      expect(within).toBe(false);
    }
  });
});

describe('buildSphereShell', () => {
  it('is the whole sphere: watertight, outwards, 4π', () => {
    const shell = globe.buildSphereShell();
    expectSound(shell);
    expect(coverage(shell).area).toBeCloseTo(4 * Math.PI, 5);
    // Watertight: every edge is run once each way.
    expect(rim(shell)).toEqual([]);
    expect(directedEdges(shell).size).toBe(shell.triangleCount * 3);
    expect([shell.boundaryCount, shell.overlap]).toEqual([0, 0]);
    expect([...new Set(shell.featureOf)]).toEqual([0]);
    // Euler's formula for a sphere: V − E + F = 2.
    expect(shell.vertexCount - (shell.triangleCount * 3) / 2 + shell.triangleCount).toBe(2);
    expect([shell.vertexCount, shell.triangleCount]).toEqual([2562, 5120]);
  });

  it('is as fine as asked', () => {
    for (const [maxEdge, triangles] of [
      [70, 20],
      [40, 80],
      [20, 320],
      [5, 5120],
      [2.5, 20480],
    ] as const) {
      const shell = globe.buildSphereShell(maxEdge);
      expect(shell.triangleCount).toBe(triangles);
      const cover = coverage(shell);
      expect(cover.longestEdge).toBeLessThanOrEqual(maxEdge);
      expect(cover.inward).toBe(0);
      expect(cover.area).toBeCloseTo(4 * Math.PI, 4);
      expect(rim(shell)).toEqual([]);
    }
  });
});
