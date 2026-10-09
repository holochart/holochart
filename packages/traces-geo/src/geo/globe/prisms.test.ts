/**
 * Regions raised from the globe (backlog GEO8): caps at their height, walls on the true boundary
 * only, and nothing open between a wall and its cap.
 */
import { geoCircle } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadBasemap } from '../../basemap/index.ts';
import { loadGlobe, type GlobeModule } from '../globe-loader.ts';
import type { BasemapLayers, CountryProperties } from '../types.ts';
import { coverage, lonLat, mostSharedEdge, rim, vertex } from './__testing__/measure.ts';
import type { SphereMesh } from './mesh.ts';
import type { PrismMesh } from './prisms.ts';

let globe: GlobeModule;
let world: BasemapLayers;

beforeAll(async () => {
  globe = await loadGlobe();
  world = await loadBasemap(110, 'world', { extras: false });
});

function cap(center: [number, number], radius: number): Polygon {
  return geoCircle().center(center).radius(radius).precision(10)();
}

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

const feature = (geometry: Polygon | MultiPolygon): Feature<Polygon | MultiPolygon> => ({
  type: 'Feature',
  properties: {},
  geometry,
});

function country(name: string): Feature<Polygon | MultiPolygon, CountryProperties> {
  const found = world.countries!.find((f) => f.properties.name === name);
  if (!found) throw new Error(`no country ${name}`);
  return found;
}

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalOf = (mesh: PrismMesh, v: number): V3 => [
  mesh.normals[3 * v]!,
  mesh.normals[3 * v + 1]!,
  mesh.normals[3 * v + 2]!,
];

/** The walls of a prism mesh: for each, its four vertices (bottom a, bottom b, top b, top a). */
function wallsOf(prisms: PrismMesh): number[] {
  const walls: number[] = [];
  for (let v = prisms.capVertexCount; v < prisms.vertexCount; v += 4) walls.push(v);
  return walls;
}

/**
 * What every prism mesh must be: caps at their height with the sphere's normals, and walls from
 * the surface to the cap that face away from their region and leave nothing open.
 */
function expectPrisms(mesh: SphereMesh, prisms: PrismMesh, heights: ArrayLike<number>): void {
  expect(prisms.capVertexCount).toBe(mesh.vertexCount);
  expect(prisms.capTriangleCount).toBe(mesh.triangleCount);
  expect(prisms.positions).toHaveLength(prisms.vertexCount * 3);
  expect(prisms.normals).toHaveLength(prisms.vertexCount * 3);
  expect(prisms.featureOf).toHaveLength(prisms.vertexCount);
  expect(prisms.indices).toHaveLength(prisms.triangleCount * 3);
  const heightOf = (f: number): number => {
    const h = heights[f] as number;
    return h > 0 && Number.isFinite(h) ? h : 0;
  };

  // Caps: the mesh's vertices and triangles, each vertex at its region's radius.
  expect([...prisms.indices.subarray(0, mesh.indices.length)]).toEqual([...mesh.indices]);
  for (let v = 0; v < mesh.vertexCount; v++) {
    const f = mesh.featureOf[v]!;
    expect(prisms.featureOf[v]).toBe(f);
    const p = vertex(prisms, v);
    expect(Math.hypot(...p)).toBeCloseTo(1 + heightOf(f), 5);
    const n = normalOf(prisms, v);
    expect(Math.hypot(...n)).toBeCloseTo(1, 6);
    // Straight up: the sphere's normal, which is where the vertex is.
    expect(dot(n, p) / Math.hypot(...p)).toBeCloseTo(1, 6);
    expect(n).toEqual(vertex(mesh, v));
  }

  // Walls: one for every boundary edge of a raised region, and no other.
  let raised = 0;
  for (let e = 0; e < mesh.boundaryCount; e++) {
    if (heightOf(mesh.featureOf[mesh.boundary[2 * e]!]!) > 0) raised++;
  }
  const walls = wallsOf(prisms);
  expect(walls).toHaveLength(raised);
  expect(prisms.vertexCount).toBe(mesh.vertexCount + 4 * raised);
  expect(prisms.triangleCount).toBe(mesh.triangleCount + 2 * raised);
  const tops = new Set<string>();
  walls.forEach((w, k) => {
    const [a, b, bTop, aTop] = [0, 1, 2, 3].map((i) => vertex(prisms, w + i)) as [V3, V3, V3, V3];
    const f = prisms.featureOf[w]!;
    const h = heightOf(f);
    expect(h).toBeGreaterThan(0);
    for (let i = 1; i < 4; i++) expect(prisms.featureOf[w + i]).toBe(f);
    // From the surface up to the cap, straight above.
    expect(Math.hypot(...a)).toBeCloseTo(1, 6);
    expect(Math.hypot(...b)).toBeCloseTo(1, 6);
    expect(Math.hypot(...aTop)).toBeCloseTo(1 + h, 5);
    expect(Math.hypot(...bTop)).toBeCloseTo(1 + h, 5);
    expect(dot(a, aTop) / Math.hypot(...aTop)).toBeCloseTo(1, 6);
    // The normal: one for the four corners, of unit length, across the wall (at right angles to
    // its edge and to straight up) and away from the region.
    const n = normalOf(prisms, w);
    for (let i = 1; i < 4; i++) expect(normalOf(prisms, w + i)).toEqual(n);
    expect(Math.hypot(...n)).toBeCloseTo(1, 6);
    const along = sub(b, a);
    const up: V3 = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    expect(Math.abs(dot(n, along)) / Math.hypot(...along)).toBeLessThan(1e-4);
    expect(Math.abs(dot(n, up)) / Math.hypot(...up)).toBeLessThan(1e-4);
    // The two triangles are the quad, counter-clockwise seen from where the normal points.
    const i = 3 * (prisms.capTriangleCount + 2 * k);
    expect([...prisms.indices.subarray(i, i + 6)]).toEqual([w, w + 1, w + 2, w, w + 2, w + 3]);
    expect(dot(cross(sub(b, a), sub(bTop, a)), n)).toBeGreaterThan(0);
    expect(dot(cross(sub(bTop, a), sub(aTop, a)), n)).toBeGreaterThan(0);
    tops.add(`${aTop.join()}|${bTop.join()}`);
  });

  // Closed: the upper edge of every wall is an edge of the cap's rim, vertex for vertex, and
  // every edge of the cap's boundary has its wall.
  for (let e = 0; e < mesh.boundaryCount; e++) {
    const a = mesh.boundary[2 * e]!;
    const b = mesh.boundary[2 * e + 1]!;
    if (!(heightOf(mesh.featureOf[a]!) > 0)) continue;
    expect(tops.has(`${vertex(prisms, a).join()}|${vertex(prisms, b).join()}`)).toBe(true);
  }
}

/** Whether a wall faces away from its region: its normal points out of the cap next to it. */
function expectOutward(mesh: SphereMesh, prisms: PrismMesh, heights: ArrayLike<number>): void {
  // The cap triangle on each boundary edge, by its directed edge.
  const n = mesh.vertexCount;
  const owner = new Map<number, number>();
  for (let t = 0; t < mesh.triangleCount; t++) {
    for (let k = 0; k < 3; k++) {
      owner.set(mesh.indices[3 * t + k]! * n + mesh.indices[3 * t + ((k + 1) % 3)]!, t);
    }
  }
  let checked = 0;
  let k = 0;
  for (let e = 0; e < mesh.boundaryCount; e++) {
    const a = mesh.boundary[2 * e]!;
    const b = mesh.boundary[2 * e + 1]!;
    // Walls are in the order of the boundary edges of the raised regions.
    const h = heights[mesh.featureOf[a]!] as number;
    if (!(h > 0 && Number.isFinite(h))) continue;
    const w = prisms.capVertexCount + 4 * k;
    k++;
    expect(vertex(prisms, w)).toEqual(vertex(mesh, a));
    const t = owner.get(a * n + b);
    if (t === undefined) continue;
    // From the edge's middle towards the far corner of the triangle that owns it: inwards.
    const far = [0, 1, 2].map((i) => mesh.indices[3 * t + i]!).find((v) => v !== a && v !== b)!;
    const pa = vertex(mesh, a);
    const pb = vertex(mesh, b);
    const middle: V3 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
    const inwards = sub(vertex(mesh, far), middle);
    if (Math.hypot(...inwards) < 1e-5) continue;
    // (A triangle of three boundary vertices almost in a line has its far corner on the edge.)
    expect(dot(normalOf(prisms, w), inwards)).toBeLessThan(1e-6);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
}

describe('buildPrisms', () => {
  it('raises a region: a cap at its height and walls around it', () => {
    const mesh = globe.buildSphereMesh(box(10, 20, 50, 60));
    const prisms = globe.buildPrisms(mesh, [0.25]);
    expectPrisms(mesh, prisms, [0.25]);
    expectOutward(mesh, prisms, [0.25]);
    // A wall for every edge of the outline, which is the whole rim of the cap.
    expect(wallsOf(prisms)).toHaveLength(mesh.boundaryCount);
    expect(mesh.boundaryCount).toBe(rim(mesh).length);
    // The walls close on themselves: each upper corner ends one wall and starts another.
    const starts = new Map<string, number>();
    const ends = new Map<string, number>();
    for (const w of wallsOf(prisms)) {
      const from = vertex(prisms, w + 3).join();
      const to = vertex(prisms, w + 2).join();
      starts.set(from, (starts.get(from) ?? 0) + 1);
      ends.set(to, (ends.get(to) ?? 0) + 1);
    }
    expect([...starts.values()].every((c) => c === 1)).toBe(true);
    expect([...ends.keys()].sort()).toEqual([...starts.keys()].sort());
    // The cap covers what the region covers, a quarter radius up.
    expect(
      coverage({ positions: mesh.positions, indices: prisms.indices }, 0, mesh.triangleCount).area,
    ).toBeCloseTo(coverage(mesh).area, 9);
    expect(mostSharedEdge(prisms)).toBeLessThanOrEqual(2);
  });

  it('with raisedOnly, leaves the cap triangles of the regions that are not raised out', () => {
    const features = [
      feature(cap([0, 0], 10)),
      feature(cap([40, 0], 10)),
      feature(cap([80, 0], 10)),
    ];
    const mesh = globe.buildSphereMesh(features);
    const all = globe.buildPrisms(mesh, [0.2, 0, 0.1]);
    const raised = globe.buildPrisms(mesh, [0.2, 0, 0.1], { raisedOnly: true });
    // The same vertices, in the same order: a color per vertex of the mesh still fits the caps.
    expect(raised.vertexCount).toBe(all.vertexCount);
    expect(raised.capVertexCount).toBe(mesh.vertexCount);
    expect(Array.from(raised.positions)).toEqual(Array.from(all.positions));
    expect(Array.from(raised.normals)).toEqual(Array.from(all.normals));
    expect(Array.from(raised.featureOf)).toEqual(Array.from(all.featureOf));
    // The caps of the first and the third region, and none of the second's.
    const capsOf = (prisms: PrismMesh): Map<number, number> => {
      const count = new Map<number, number>();
      for (let t = 0; t < prisms.capTriangleCount; t++) {
        const f = prisms.featureOf[prisms.indices[3 * t]!]!;
        count.set(f, (count.get(f) ?? 0) + 1);
      }
      return count;
    };
    const every = capsOf(all);
    const kept = capsOf(raised);
    expect([...kept.keys()].sort()).toEqual([0, 2]);
    expect(kept.get(0)).toBe(every.get(0));
    expect(kept.get(2)).toBe(every.get(2));
    expect(raised.capTriangleCount).toBe(all.capTriangleCount - every.get(1)!);
    // The walls are the same ones, after the caps that are left.
    const walls = (prisms: PrismMesh): number[] =>
      Array.from(prisms.indices.subarray(3 * prisms.capTriangleCount));
    expect(walls(raised)).toEqual(walls(all));
    expect(raised.triangleCount).toBe(raised.indices.length / 3);
    // Nothing raised: no triangle at all.
    const none = globe.buildPrisms(mesh, [0, -1, NaN], { raisedOnly: true });
    expect(none.triangleCount).toBe(0);
    expect(none.capTriangleCount).toBe(0);
    expect(none.vertexCount).toBe(mesh.vertexCount);
  });

  it('leaves a region without a height on the surface, with no walls', () => {
    const features = [
      feature(cap([0, 0], 10)),
      feature(cap([40, 0], 10)),
      feature(cap([80, 0], 10)),
      feature(cap([120, 0], 10)),
      feature(cap([160, 0], 10)),
      feature(cap([-160, 0], 10)),
    ];
    const mesh = globe.buildSphereMesh(features);
    // Missing (one height too few), zero, negative and not finite are all "no height".
    const heights = [0.1, 0, NaN, -0.2, Infinity];
    const prisms = globe.buildPrisms(mesh, heights);
    expectPrisms(mesh, prisms, heights);
    expectOutward(mesh, prisms, heights);
    const raised = new Set(wallsOf(prisms).map((w) => prisms.featureOf[w]));
    expect([...raised]).toEqual([0]);
    for (let v = 0; v < mesh.vertexCount; v++) {
      const r = Math.hypot(...vertex(prisms, v));
      expect(r).toBeCloseTo(mesh.featureOf[v] === 0 ? 1.1 : 1, 5);
    }
    // No heights at all: the mesh itself, as caps on the surface.
    const none = globe.buildPrisms(mesh, []);
    expect(none.vertexCount).toBe(mesh.vertexCount);
    expect([...none.positions]).toEqual([...mesh.positions]);
    expect(none.triangleCount).toBe(mesh.triangleCount);
  });

  it('scales the heights', () => {
    const mesh = globe.buildSphereMesh(cap([10, 10], 5));
    const prisms = globe.buildPrisms(mesh, [2], { scale: 0.05 });
    expectPrisms(mesh, prisms, [0.1]);
    expect(Math.hypot(...vertex(prisms, 0))).toBeCloseTo(1.1, 5);
  });

  it('builds no wall along the antimeridian through a region', () => {
    // Like Russia's far east: from 150°E eastwards to 150°W.
    const mesh = globe.buildSphereMesh(box(150, 40, 210, 70));
    const prisms = globe.buildPrisms(mesh, [0.2]);
    expectPrisms(mesh, prisms, [0.2]);
    expectOutward(mesh, prisms, [0.2]);
    // The cut left a rim on both sides of ±180° that has no wall.
    expect(rim(mesh).length).toBeGreaterThan(mesh.boundaryCount);
    for (const w of wallsOf(prisms)) {
      const a = lonLat(prisms, w);
      const b = lonLat(prisms, w + 1);
      expect(Math.abs(a[0]) > 179.999 && Math.abs(b[0]) > 179.999).toBe(false);
    }
    // The walls are the box's four sides: one closed loop around both halves. (At the cut a
    // vertex of one half and its twin of the other differ in the sign of an x of 1e-16.)
    const where = (v: number): string =>
      vertex(prisms, v)
        .map((c) => Math.round(c * 1e6) + 0)
        .join();
    const starts = new Set(wallsOf(prisms).map((w) => where(w + 3)));
    const ends = new Set(wallsOf(prisms).map((w) => where(w + 2)));
    expect([...ends].sort()).toEqual([...starts].sort());
    // A region that ends at the antimeridian has its wall there.
    const ending = globe.buildSphereMesh(box(160, 0, 180, 20));
    const walled = globe.buildPrisms(ending, [0.2]);
    expectPrisms(ending, walled, [0.2]);
    const onMeridian = wallsOf(walled).filter(
      (w) =>
        Math.abs(lonLat(walled, w)[0]) > 179.999 && Math.abs(lonLat(walled, w + 1)[0]) > 179.999,
    );
    expect(onMeridian.length).toBeGreaterThan(0);
  });

  it('builds no wall at the pole of a region that holds it', () => {
    // Like Antarctica: a cap about the south pole, and one off it that still holds it.
    for (const centre of [
      [0, -90],
      [60, -80],
      [0, 90],
    ] as [number, number][]) {
      const mesh = globe.buildSphereMesh(cap(centre, 25));
      const prisms = globe.buildPrisms(mesh, [0.3]);
      expectPrisms(mesh, prisms, [0.3]);
      expectOutward(mesh, prisms, [0.3]);
      // Every wall stands on the cap's rim, 25° from its centre: none near the pole.
      for (const w of wallsOf(prisms)) {
        expect(Math.abs(lonLat(prisms, w)[1])).toBeLessThan(89);
      }
      expect(wallsOf(prisms)).toHaveLength(rim(mesh).length);
    }
    // In the flat chart, where the poles are edges: a region that holds both of them.
    const hole = [...cap([0, 0], 30).coordinates[0]!].reverse();
    const mesh = globe.buildSphereMesh({ type: 'Polygon', coordinates: [hole] });
    const prisms = globe.buildPrisms(mesh, [0.1]);
    expectPrisms(mesh, prisms, [0.1]);
    expect(rim(mesh).length).toBeGreaterThan(mesh.boundaryCount);
    for (const w of wallsOf(prisms)) {
      const a = lonLat(prisms, w);
      const b = lonLat(prisms, w + 1);
      expect(Math.abs(a[1]) > 89.999 && Math.abs(b[1]) > 89.999).toBe(false);
      expect(Math.abs(a[0]) > 179.999 && Math.abs(b[0]) > 179.999).toBe(false);
    }
  });

  it('raises Russia and Antarctica of the basemap', () => {
    const features = [country('Russia'), country('Antarctica'), country('Fiji')];
    const mesh = globe.buildSphereMesh(features);
    const heights = [0.2, 0.1, 0.4];
    const prisms = globe.buildPrisms(mesh, heights);
    expectPrisms(mesh, prisms, heights);
    expectOutward(mesh, prisms, heights);
    for (const w of wallsOf(prisms)) {
      const a = lonLat(prisms, w);
      const b = lonLat(prisms, w + 1);
      // No wall along the cut through Russia and Fiji, and none at the pole. (Where the data
      // has a vertex on the antimeridian, d3 cuts a hair beside it: a wall 0.0002° long from
      // the vertex to the cut is the coast's.)
      const alongCut = Math.abs(a[0]) > 179.999 && Math.abs(b[0]) > 179.999;
      if (alongCut) expect(Math.abs(a[1] - b[1])).toBeLessThan(0.001);
      expect(a[1]).toBeGreaterThan(-89.9);
    }
    // Each country has walls, on its own coast.
    const walled = new Set(wallsOf(prisms).map((w) => prisms.featureOf[w]));
    expect([...walled].sort()).toEqual([0, 1, 2]);
  });

  it('raises every country of the basemap', () => {
    const countries = world.countries!;
    const mesh = globe.buildSphereMesh(countries);
    const heights = countries.map((_, i) => (i % 3 === 0 ? 0 : 0.01 + (i % 7) * 0.02));
    const t0 = performance.now();
    const prisms = globe.buildPrisms(mesh, heights);
    expect(performance.now() - t0).toBeLessThan(500);
    expectPrisms(mesh, prisms, heights);
    expectOutward(mesh, prisms, heights);
  });
});
