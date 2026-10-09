/**
 * Geometry correctness against d3 itself (backlog GEO5): every projection Plotly has, built the
 * way a figure builds it (the layout defaults, then the view), with the real basemap streamed
 * through it. `sink.test.ts` has the properties of the sink on made-up polygons in six
 * projections; this file asks the same of all 84 names, the lazy ones included, and of the data
 * the maps are drawn from: Russia and Fiji across the antimeridian, Antarctica around the pole,
 * Lesotho inside South Africa.
 *
 * The reference is `geoPath` for the same projection, since Plotly draws with it too. A fill that
 * leaks is caught twice: the rings' area is compared with `geoPath().area()`, and so is the area
 * of the triangles the fill primitive makes of them.
 */
import {
  attr,
  createRegistry,
  supplyDefaults,
  type CoreTraceModule,
  type FigureInput,
} from '@mk7s/holochart-core';
import { triangulateFills } from '@mk7s/holochart-render';
import { geoPath, type GeoPermissibleObjects } from 'd3-geo';
import fc from 'fast-check';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadBasemap } from '../basemap/index.ts';
import { SPHERE } from './base-layers.ts';
import { PROJECTION_TYPES } from './constants.ts';
import { geoLayoutSchema, geoSubplotAttribute } from './layout-attributes.ts';
import { supplyGeoLayoutDefaults } from './layout-defaults.ts';
import { hasSeams, isAlbersUsaProjection, loadProjection } from './projections.ts';
import {
  MIN_RING_AREA,
  projectedFillRule,
  projectLines,
  projectPolygons,
  sinkStats,
  type GeoInput,
} from './sink.ts';
import type {
  BasemapLayers,
  CountryProperties,
  FullGeoLayout,
  ProjectedPolygons,
} from './types.ts';
import { createGeoView, type GeoView } from './view.ts';

const SIZE = { width: 700, height: 450 };
const H = SIZE.height;
const RAD = Math.PI / 180;

// ---- a figure's view ------------------------------------------------------------------------

/** A minimal trace on a geo subplot: the layout defaults run for the subplots of such traces. */
const points: CoreTraceModule = {
  type: 'geopoints',
  categories: ['geo'],
  schema: attr.object({ geo: geoSubplotAttribute }),
  layoutSchema: geoLayoutSchema,
  meta: { description: 'Test trace drawn on a geo subplot.' },
  supplyDefaults(_in, _out, ctx) {
    ctx.coerce('geo');
  },
  supplyLayoutDefaults: supplyGeoLayoutDefaults,
};
const registry = createRegistry().register(points);

type Rotation = readonly [lon: number, lat: number, roll: number];

/** The defaulted container of `layout.geo`, with `fitbounds` off so that the view is the layout's. */
function container(geo: Record<string, unknown>): FullGeoLayout {
  const figure = { data: [{ type: 'geopoints' }], layout: { geo: { fitbounds: false, ...geo } } };
  const { fullLayout } = supplyDefaults(figure as FigureInput, registry, { validate: false });
  return (fullLayout as Record<string, unknown>)['geo'] as FullGeoLayout;
}

/** The view of a world map in `type`, turned to `rotation`, in a subplot of {@link SIZE}. */
function worldView(type: string, rotation: Rotation = [0, 0, 0]): GeoView {
  const [lon, lat, roll] = rotation;
  return createGeoView(container({ projection: { type, rotation: { lon, lat, roll } } }), SIZE);
}

// ---- reading the output ---------------------------------------------------------------------

interface Ring {
  x: Float64Array;
  y: Float64Array;
  /** Shoelace area in the output's y-up px: negative for an outer ring, positive for a hole. */
  area: number;
}

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
      const x = out.x.subarray(out.rings[r]!, b);
      const y = out.y.subarray(out.rings[r]!, b);
      rings.push({ x, y, area: signedArea(x, y) });
    }
    polygons.push(rings);
  }
  return polygons;
}

/** Area the polygons fill: outer rings less their holes. */
function filledArea(out: ProjectedPolygons): number {
  let sum = 0;
  for (const rings of polygonsOf(out)) for (const ring of rings) sum -= ring.area;
  return sum;
}

/**
 * Area of the triangles the fill primitive draws for the output, by the rule the projection asks
 * for. More than the polygons' area means triangles outside them (a leak) or on top of each other.
 */
function triangleArea(out: ProjectedPolygons, fillRule: 'simple' | 'nonzero'): number {
  const { positions: p, indices } = triangulateFills({
    x: out.x.subarray(0, out.vertexCount),
    y: out.y.subarray(0, out.vertexCount),
    rings: out.rings.subarray(0, out.ringCount),
    polygons: out.polygons.subarray(0, out.polygonCount),
    fillRule,
  });
  let twice = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3;
    const b = indices[i + 1]! * 3;
    const c = indices[i + 2]! * 3;
    twice += Math.abs(
      (p[b]! - p[a]!) * (p[c + 1]! - p[a + 1]!) - (p[c]! - p[a]!) * (p[b + 1]! - p[a + 1]!),
    );
  }
  return twice / 2;
}

function boxOf(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  count: number,
): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < count; i++) {
    x0 = Math.min(x0, x[i]!);
    x1 = Math.max(x1, x[i]!);
    y0 = Math.min(y0, y[i]!);
    y1 = Math.max(y1, y[i]!);
  }
  return [x0, y0, x1, y1];
}

/**
 * The invariants of the fill primitive's input: finite vertices, ascending index arrays within
 * their counts, and in every polygon an outer ring (negative area) followed by holes (positive,
 * smaller than it). Whether the holes are inside is `sink.test.ts`'s to check, on rings that are
 * simple; those of a projection with seams are not.
 */
function expectStructure(out: ProjectedPolygons, label: string): void {
  for (let i = 0; i < out.vertexCount; i++) {
    if (!Number.isFinite(out.x[i]) || !Number.isFinite(out.y[i])) {
      throw new Error(`${label}: vertex ${i} is (${out.x[i]}, ${out.y[i]})`);
    }
  }
  for (let r = 1; r < out.ringCount; r++) {
    if (!(out.rings[r]! > out.rings[r - 1]!))
      throw new Error(`${label}: ring ${r} does not ascend`);
  }
  for (let p = 1; p < out.polygonCount; p++) {
    if (!(out.polygons[p]! > out.polygons[p - 1]!)) {
      throw new Error(`${label}: polygon ${p} does not ascend`);
    }
  }
  if (out.ringCount > 0) {
    expect(out.rings[0], label).toBe(0);
    expect(out.rings[out.ringCount - 1], label).toBeLessThan(out.vertexCount);
    expect(out.polygons[0], label).toBe(0);
    expect(out.polygons[out.polygonCount - 1], label).toBeLessThan(out.ringCount);
  } else {
    expect(out.vertexCount, label).toBe(0);
    expect(out.polygonCount, label).toBe(0);
  }
  for (const rings of polygonsOf(out)) {
    const outer = rings[0]!;
    if (outer.x.length < 3 || !(outer.area < -MIN_RING_AREA)) {
      throw new Error(`${label}: an outer ring has area ${outer.area}`);
    }
    for (const hole of rings.slice(1)) {
      if (hole.x.length < 3 || !(hole.area > MIN_RING_AREA) || !(hole.area < -outer.area)) {
        throw new Error(`${label}: a hole of area ${hole.area} in a ring of ${outer.area}`);
      }
    }
  }
}

/** What the sinks counted while `run` ran. */
function counted<T>(run: () => T): { result: T; orphans: number; nonFinite: number } {
  const before = { ...sinkStats };
  const result = run();
  return {
    result,
    orphans: sinkStats.orphanHoles - before.orphanHoles,
    nonFinite: sinkStats.nonFinitePoints - before.nonFinitePoints,
  };
}

// ---- data -----------------------------------------------------------------------------------

type Country = Feature<Polygon | MultiPolygon, CountryProperties>;

let world110: BasemapLayers;
let world50: BasemapLayers;

beforeAll(async () => {
  await loadProjection('robinson');
  world110 = await loadBasemap(110, 'world', { extras: true });
  world50 = await loadBasemap(50, 'world', { extras: true });
});

function country(layers: BasemapLayers, id: string): Country {
  const found = layers.countries?.find((c) => c.id === id);
  if (!found) throw new Error(`the basemap has no ${id}`);
  return found;
}

/** The longitudes a geometry spans, as its coordinates have them. */
function lonSpan(geometry: Polygon | MultiPolygon): [number, number] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let west = Infinity;
  let east = -Infinity;
  for (const polygon of polygons) {
    for (const [lon] of polygon[0] as Position[]) {
      west = Math.min(west, lon!);
      east = Math.max(east, lon!);
    }
  }
  return [west, east];
}

// ---- every projection -----------------------------------------------------------------------

/**
 * Rotations each projection is drawn at: none, the antimeridian in the middle, and two with a
 * latitude and a roll, so that the poles and the clip edge fall on land.
 */
const ROTATIONS: readonly Rotation[] = [
  [0, 0, 0],
  [180, 0, 0],
  [-135, 30, 0],
  [20, -60, 15],
];

/**
 * A world map in the conic conformal projection sends the south pole to infinity, and the clip
 * circle of Plotly's 90° passes 0.001° from it: the outline and the land are sampled at other
 * points there, tens of thousands of px away, and one is not inside the other's box.
 */
const UNBOUNDED: ReadonlySet<string> = new Set(['conic conformal']);

describe('every projection draws the 110m land as d3 does', () => {
  it.each(PROJECTION_TYPES)('%s', (type) => {
    const land = world110.land!;
    for (const rotation of isAlbersUsaProjection(type) ? ROTATIONS.slice(0, 1) : ROTATIONS) {
      const label = `${type} at ${rotation.join(', ')}`;
      const view = worldView(type, rotation);
      expect(view.valid, label).toBe(true);
      const path = geoPath(view.projection);
      const clipped = view.clipAngle !== null;

      const {
        result: out,
        orphans,
        nonFinite,
      } = counted(() => projectPolygons(view.projection, H, land));
      expect(nonFinite, label).toBe(0);
      expectStructure(out, label);

      // Nothing outside the outline of the map.
      if (!UNBOUNDED.has(type)) {
        const [[sx0, sy0], [sx1, sy1]] = path.bounds(SPHERE);
        const [x0, y0, x1, y1] = boxOf(out.x, out.y, out.vertexCount);
        expect(x0, label).toBeGreaterThanOrEqual(sx0 - 1);
        expect(x1, label).toBeLessThanOrEqual(sx1 + 1);
        expect(y0, label).toBeGreaterThanOrEqual(H - sy1 - 1);
        expect(y1, label).toBeLessThanOrEqual(H - sy0 + 1);
      }

      // The same land as geoPath fills: no ring dropped, none grouped with the wrong sign.
      const reference = path.area(land);
      expect(reference, label).toBeGreaterThan(100);
      expect(Math.abs(filledArea(out) - reference), label).toBeLessThan(1e-3 * reference + 1);
      // Only a clip circle leaves slivers that come out inverted (see `sink.ts`).
      if (clipped) expect(orphans, label).toBeLessThanOrEqual(6);
      else expect(orphans, label).toBe(0);

      // And the triangles drawn for it cover that land, and nothing else. Where a clip circle
      // closes rings with chords, a ring can cross itself within the precision, and triangles
      // then lie on top of each other, inside the land: 1.5% of it in Craig's projection, whose
      // edge is squeezed to a point, 3.6% in Wiechel's, which wraps the far side around its rim.
      // (A leak is far more: see the seams below.)
      const drawn = triangleArea(out, projectedFillRule(view.projection));
      const slack = clipped ? 0.06 * reference + 200 : 2e-3 * reference + 2;
      expect(Math.abs(drawn - reference), label).toBeLessThan(slack);
    }
  });

  it('fills the ocean with the outline the frame draws', () => {
    for (const type of PROJECTION_TYPES) {
      for (const rotation of [ROTATIONS[0]!, ROTATIONS[3]!]) {
        const label = `${type} at ${rotation.join(', ')}`;
        const view = worldView(type, rotation);
        const ocean = projectPolygons(view.projection, H, SPHERE);
        const frame = projectLines(view.projection, H, SPHERE);
        expectStructure(ocean, label);
        expect(ocean.polygonCount, label).toBeGreaterThan(0);
        const reference = geoPath(view.projection).area(SPHERE);
        expect(Math.abs(filledArea(ocean) - reference), label).toBeLessThan(1e-6 * reference + 1);
        // The frame is the ocean's rings, closed.
        expect(frame.startCount + 1, label).toBe(ocean.ringCount);
        const a = boxOf(ocean.x, ocean.y, ocean.vertexCount);
        const b = boxOf(frame.x, frame.y, frame.vertexCount);
        for (let i = 0; i < 4; i++) expect(b[i], label).toBeCloseTo(a[i]!, 9);
      }
    }
  });

  it('names the four projections whose rings need the nonzero rule, and they do need it', () => {
    const seamed = PROJECTION_TYPES.filter((type) => hasSeams(worldView(type).projection));
    expect(seamed).toEqual(['gringorten', 'gringorten quincuncial', 'guyou', 'peirce quincuncial']);
    for (const type of PROJECTION_TYPES) {
      expect(projectedFillRule(worldView(type).projection), type).toBe(
        seamed.includes(type) ? 'nonzero' : 'simple',
      );
    }
    // A projection the module did not build has no seams to know of.
    expect(projectedFillRule({})).toBe('simple');
    // Regression: as simple polygons, Eurasia's ring leaked over a seventh of a Guyou map
    // turned to the antimeridian, and the land over a third of a Peirce one.
    for (const type of ['guyou', 'peirce quincuncial']) {
      const view = worldView(type, [180, 0, 0]);
      const out = projectPolygons(view.projection, H, world110.land!);
      const reference = geoPath(view.projection).area(world110.land!);
      expect(triangleArea(out, 'simple') - reference, type).toBeGreaterThan(0.1 * reference);
      expect(Math.abs(triangleArea(out, 'nonzero') - reference), type).toBeLessThan(2);
    }
  });
});

// ---- properties over every projection -------------------------------------------------------

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

/** A star-shaped polygon around `center`, wound clockwise as d3 wants an outer ring. */
function star(center: Position, radii: readonly number[]): Polygon {
  const ring = radii.map((r, i) => destination(center, (360 * i) / radii.length, r));
  ring.push(ring[0]!);
  return { type: 'Polygon', coordinates: [ring] };
}

/** Spread evenly over `[min, max]` (`fc.double` crowds the representable doubles near 0). */
const uniform = (min: number, max: number): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: 2 ** 30 }).map((i) => min + ((max - min) * i) / 2 ** 30);

const typeArb = fc.constantFrom(...PROJECTION_TYPES);
const rotationArb = fc.tuple(uniform(-180, 180), uniform(-90, 90), uniform(-180, 180));
const starArb = fc
  .record({
    center: fc.tuple(uniform(-180, 180), uniform(-85, 85)),
    radii: fc.array(uniform(3, 35), { minLength: 8, maxLength: 14 }),
  })
  .map(({ center, radii }) => star(center, radii));

describe('properties in every projection', () => {
  it('a rotated then projected polygon keeps the sign of its area, and the area geoPath gives it', () => {
    fc.assert(
      fc.property(typeArb, rotationArb, starArb, (type, rotation, polygon) => {
        const view = worldView(type, rotation);
        const { result: out, nonFinite } = counted(() =>
          projectPolygons(view.projection, H, polygon),
        );
        expect(nonFinite).toBe(0);
        // Every polygon starts with an outer ring: no projection turns the star over. (A star
        // around the point a clip circle hides comes out as the map's outline with a hole.)
        expectStructure(out, type);
        const reference = geoPath(view.projection).area(polygon);
        // A ring the clip edge inverts is dropped; it is a sliver (see `sink.ts`).
        expect(Math.abs(filledArea(out) - reference)).toBeLessThan(1e-3 * reference + 1);
      }),
      { numRuns: 400, interruptAfterTimeLimit: 20_000 },
    );
  });

  it('no projected vertex is outside the clip outline', () => {
    fc.assert(
      fc.property(
        typeArb.filter((type) => !UNBOUNDED.has(type)),
        rotationArb,
        starArb,
        (type, rotation, polygon) => {
          const view = worldView(type, rotation);
          const [[sx0, sy0], [sx1, sy1]] = geoPath(view.projection).bounds(SPHERE);
          const fill = projectPolygons(view.projection, H, polygon);
          const line = projectLines(view.projection, H, {
            type: 'LineString',
            coordinates: polygon.coordinates[0]!,
          });
          for (const out of [fill, line]) {
            if (out.vertexCount === 0) continue;
            const [x0, y0, x1, y1] = boxOf(out.x, out.y, out.vertexCount);
            expect(x0).toBeGreaterThanOrEqual(sx0 - 1);
            expect(x1).toBeLessThanOrEqual(sx1 + 1);
            expect(y0).toBeGreaterThanOrEqual(H - sy1 - 1);
            expect(y1).toBeLessThanOrEqual(H - sy0 + 1);
          }
        },
      ),
      { numRuns: 400, interruptAfterTimeLimit: 20_000 },
    );
  });
});

// ---- invert ---------------------------------------------------------------------------------

describe('invert(project(p)) in every projection', () => {
  /** Offsets from the rotation's centre, in degrees: inside every clip angle, off the axes. */
  const OFFSETS: readonly (readonly [number, number])[] = [
    [0.5, 0.25],
    [-21, 13],
    [34, -27],
    [-48, -31],
    [57, 22],
  ];

  it.each(PROJECTION_TYPES)('%s', (type) => {
    const albersUsa = isAlbersUsaProjection(type);
    for (const rotation of [ROTATIONS[0]!, [40, 20, 0] as const]) {
      const view = worldView(type, rotation);
      const [lon0, lat0] = albersUsa ? [-98, 39] : rotation;
      const scale = albersUsa ? 0.2 : 1;
      for (const [dLon, dLat] of OFFSETS) {
        const lon = lon0 + dLon * scale;
        const lat = lat0 + dLat * scale;
        const label = `${type} at ${rotation.join(', ')}: [${lon}, ${lat}]`;
        const px = view.project(lon, lat);
        expect(px, label).not.toBeNull();
        // Some of d3's inverses are a Newton iteration: a thousandth of a degree is what all give.
        const back = view.invert(px![0], px![1]);
        expect(back, label).not.toBeNull();
        expect(Math.abs(((back![0] - lon + 540) % 360) - 180), label).toBeLessThan(1e-3);
        expect(Math.abs(back![1] - lat), label).toBeLessThan(1e-3);
      }
    }
  });
});

// ---- the real basemap: the hard cases -------------------------------------------------------

/** How many polygons of a geometry reach from one side of ±180° to the other. */
function crossing(geometry: Polygon | MultiPolygon): number {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.filter((coordinates) => {
    const [west, east] = lonSpan({ type: 'Polygon', coordinates });
    return east - west > 300;
  }).length;
}

/** Projections of the whole world on one sheet, where the antimeridian is the map's two sides. */
const FLAT = [
  'equirectangular',
  'mercator',
  'natural earth',
  'robinson',
  'mollweide',
  'winkel tripel',
];

/** The longest step between two consecutive vertices of a polyline or ring, in px along x. */
function longestStepX(x: ArrayLike<number>, bounds: readonly number[]): number {
  let longest = 0;
  for (let l = 0; l + 1 < bounds.length; l++) {
    for (let i = bounds[l]! + 1; i < bounds[l + 1]!; i++) {
      longest = Math.max(longest, Math.abs(x[i]! - x[i - 1]!));
    }
  }
  return longest;
}

describe('the antimeridian, on the real basemap', () => {
  it('has Russia and Fiji stitched across ±180° in the data, not cut', () => {
    for (const layers of [world110, world50]) {
      // Russia's mainland and Wrangel Island; in Fiji, Taveuni and the tip of Vanua Levu.
      expect(crossing(country(layers, 'RUS').geometry)).toBe(2);
      expect(crossing(country(layers, 'FJI').geometry)).toBeGreaterThan(0);
    }
    expect(crossing(country(world50, 'FJI').geometry)).toBe(3);
  });

  // Regression (GEO5): at 1:50m Natural Earth's two halves of Taveuni end 30 m apart on the
  // antimeridian, so they were not stitched: the island had a border and a coastline down 180°.
  it('has no edge along ±180° in any country, in the land or in the coastlines', () => {
    const along = (ring: readonly Position[]): number => {
      let count = 0;
      for (let i = 1; i < ring.length; i++) {
        const [lon0, lat0] = ring[i - 1] as [number, number];
        const [lon1, lat1] = ring[i] as [number, number];
        if (Math.abs(lon0) > 179.999 && Math.abs(lon1) > 179.999 && Math.abs(lat1 - lat0) > 1e-6) {
          count++;
        }
      }
      return count;
    };
    const rings = (geometry: Polygon | MultiPolygon): Position[][] =>
      (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).flat();
    for (const layers of [world110, world50]) {
      for (const feature of layers.countries!) {
        for (const ring of rings(feature.geometry))
          expect(along(ring), feature.id as string).toBe(0);
      }
      for (const ring of rings(layers.land!)) expect(along(ring), 'land').toBe(0);
      for (const line of layers.coastlines!.coordinates) expect(along(line), 'coast').toBe(0);
      for (const line of layers.borders!.coordinates) expect(along(line), 'border').toBe(0);
      for (const feature of layers.subunits!) {
        for (const ring of rings(feature.geometry))
          expect(along(ring), feature.id as string).toBe(0);
      }
    }
  });

  it.each(FLAT)('cuts Russia and Fiji at the sides of a %s map, with no edge across it', (type) => {
    const view = worldView(type);
    const width = view.bounds.x1 - view.bounds.x0;
    for (const id of ['RUS', 'FJI']) {
      const feature = country(world110, id);
      const sources = feature.geometry.type === 'Polygon' ? 1 : feature.geometry.coordinates.length;
      const { result: out, orphans } = counted(() =>
        projectPolygons(view.projection, H, feature.geometry),
      );
      expectStructure(out, `${type} ${id}`);
      expect(orphans).toBe(0);
      // Each polygon that crosses ±180° (Russia's mainland and Wrangel Island, Fiji's Taveuni)
      // becomes two: one at each side of the map.
      expect(out.polygonCount, id).toBe(sources + crossing(feature.geometry));
      // (At Russia's and Fiji's latitudes the pseudocylindrical maps are narrower than at the
      // equator.)
      const [x0, , x1] = boxOf(out.x, out.y, out.vertexCount);
      expect(x1 - x0, id).toBeGreaterThan(0.55 * width);
      // No ring spans the map: every edge is short.
      const rings = [...out.rings.subarray(0, out.ringCount), out.vertexCount];
      expect(longestStepX(out.x, rings), id).toBeLessThan(0.25 * width);
      const reference = geoPath(view.projection).area(feature.geometry);
      expect(Math.abs(filledArea(out) - reference), id).toBeLessThan(1e-6 * reference + 1e-3);
    }
  });

  it('leaves them whole on a map centred on 180°', () => {
    for (const type of FLAT) {
      const view = worldView(type, [180, 0, 0]);
      const width = view.bounds.x1 - view.bounds.x0;
      for (const id of ['RUS', 'FJI']) {
        const feature = country(world110, id);
        const sources =
          feature.geometry.type === 'Polygon' ? 1 : feature.geometry.coordinates.length;
        const out = projectPolygons(view.projection, H, feature.geometry);
        expect(out.polygonCount, `${type} ${id}`).toBe(sources);
        const [x0, , x1] = boxOf(out.x, out.y, out.vertexCount);
        expect(x1 - x0, `${type} ${id}`).toBeLessThan(0.6 * width);
      }
    }
  });

  it.each(FLAT)('draws no line along or across a %s map: coastlines and borders', (type) => {
    for (const rotation of [ROTATIONS[0]!, ROTATIONS[1]!]) {
      const view = worldView(type, rotation);
      const width = view.bounds.x1 - view.bounds.x0;
      for (const lines of [world110.coastlines!, world110.borders!]) {
        const out = projectLines(view.projection, H, lines);
        const bounds = [0, ...out.starts.subarray(0, out.startCount), out.vertexCount];
        // A line that crossed ±180° without a cut would step across the map.
        expect(longestStepX(out.x, bounds)).toBeLessThan(0.25 * width);
        // A line down the antimeridian would have both ends of a step on a side of the map.
        // (Antarctica's coast ends there; it does not run along it.)
        let onSide = 0;
        for (let l = 0; l + 1 < bounds.length; l++) {
          for (let i = bounds[l]! + 1; i < bounds[l + 1]!; i++) {
            const lonlat0 = view.invertAt(view.state, out.x[i - 1]!, out.y[i - 1]!);
            const lonlat1 = view.invertAt(view.state, out.x[i]!, out.y[i]!);
            if (!lonlat0 || !lonlat1) continue;
            const seam = rotation[0] + 180;
            const off0 = Math.abs(((lonlat0[0] - seam + 540) % 360) - 180);
            const off1 = Math.abs(((lonlat1[0] - seam + 540) % 360) - 180);
            const step = Math.hypot(out.x[i]! - out.x[i - 1]!, out.y[i]! - out.y[i - 1]!);
            if (off0 < 1e-3 && off1 < 1e-3 && step > 0.5) onSide++;
          }
        }
        expect(onSide, type).toBe(0);
      }
    }
  });
});

describe('the poles, on the real basemap', () => {
  /** Antarctica's mainland: the polygon that goes around the pole. */
  function mainland(layers: BasemapLayers): Polygon {
    const geometry = country(layers, 'ATA').geometry as MultiPolygon;
    const coordinates = geometry.coordinates.reduce((a, b) =>
      b[0]!.length > a[0]!.length ? b : a,
    );
    return { type: 'Polygon', coordinates };
  }

  it('draws Antarctica as one polygon down to the bottom edge of an equirectangular map', () => {
    for (const layers of [world110, world50]) {
      const view = worldView('equirectangular');
      const polygon = mainland(layers);
      // The ring goes once around the pole and never to it: d3 closes it along the bottom edge.
      expect(lonSpan(polygon)).toEqual([-180, expect.any(Number) as number]);
      expect(Math.min(...polygon.coordinates[0]!.map((p) => p[1]!))).toBeGreaterThan(-89.99);
      const { result: out, orphans } = counted(() => projectPolygons(view.projection, H, polygon));
      expectStructure(out, 'Antarctica');
      expect(orphans).toBe(0);
      expect(out.polygonCount).toBe(1);
      expect(out.ringCount).toBe(1);
      const [x0, y0, x1] = boxOf(out.x, out.y, out.vertexCount);
      expect(x0).toBeCloseTo(view.bounds.x0, 1);
      expect(x1).toBeCloseTo(view.bounds.x1, 1);
      expect(y0).toBeCloseTo(view.bounds.y0, 1);
      const reference = geoPath(view.projection).area(polygon);
      expect(Math.abs(filledArea(out) - reference)).toBeLessThan(1e-6 * reference);
      // A cap, not the rest of the globe: under a seventh of the map.
      expect(reference).toBeLessThan((SIZE.width * SIZE.height) / 7);
    }
  });

  it('draws it whole, and uncut, on a globe seen from below', () => {
    const view = worldView('orthographic', [0, -90, 0]);
    const polygon = mainland(world110);
    const { result: out, orphans } = counted(() => projectPolygons(view.projection, H, polygon));
    expect(orphans).toBe(0);
    expect(out.polygonCount).toBe(1);
    expect(out.ringCount).toBe(1);
    // Around the middle of the subplot, where the pole is.
    const [x0, y0, x1, y1] = boxOf(out.x, out.y, out.vertexCount);
    expect((x0 + x1) / 2).toBeCloseTo(SIZE.width / 2, -1.5);
    expect((y0 + y1) / 2).toBeCloseTo(SIZE.height / 2, -1.5);
    const reference = geoPath(view.projection).area(polygon);
    expect(Math.abs(filledArea(out) - reference)).toBeLessThan(1e-6 * reference);
  });

  it('draws the Arctic and the Antarctic of both resolutions as geoPath does', () => {
    for (const layers of [world110, world50]) {
      for (const lat of [90, -90]) {
        const view = worldView('orthographic', [0, lat, 0]);
        const { result: out, orphans } = counted(() =>
          projectPolygons(view.projection, H, layers.land!),
        );
        expectStructure(out, `lat ${lat}`);
        expect(orphans).toBeLessThanOrEqual(6);
        const reference = geoPath(view.projection).area(layers.land!);
        expect(Math.abs(filledArea(out) - reference)).toBeLessThan(1e-4 * reference + 2);
      }
    }
  });
});

describe('holes and multipolygons, on the real basemap', () => {
  /** The holes of the projected polygons, largest first. */
  function holesOf(out: ProjectedPolygons): number[] {
    return polygonsOf(out)
      .flatMap((rings) => rings.slice(1).map((ring) => ring.area))
      .sort((a, b) => b - a);
  }

  function projectedArea(view: GeoView, object: GeoInput): number {
    return geoPath(view.projection).area(object as GeoPermissibleObjects);
  }

  it('cuts Lesotho out of South Africa', () => {
    for (const layers of [world110, world50]) {
      const view = createGeoView(container({ scope: 'africa' }), SIZE);
      const out = projectPolygons(view.projection, H, country(layers, 'ZAF').geometry);
      expectStructure(out, 'ZAF');
      const holes = holesOf(out);
      expect(holes).toHaveLength(1);
      // The hole is Lesotho: the same ring, shared in the topology.
      const lesotho = projectedArea(view, country(layers, 'LSO').geometry);
      expect(holes[0]).toBeCloseTo(lesotho, 6);
      expect(lesotho).toBeGreaterThan(20);
    }
  });

  it('cuts San Marino and the Vatican out of Italy at 50m', () => {
    const view = createGeoView(container({ scope: 'europe', resolution: 50 }), SIZE);
    const out = projectPolygons(view.projection, H, country(world50, 'ITA').geometry);
    expectStructure(out, 'ITA');
    const holes = holesOf(out);
    expect(holes).toHaveLength(2);
    expect(holes[0]).toBeCloseTo(projectedArea(view, country(world50, 'SMR').geometry), 6);
    expect(holes[1]).toBeCloseTo(projectedArea(view, country(world50, 'VAT').geometry), 6);
    // Both are far below a px at this scale, and kept: a zoom shows them.
    expect(holes[1]).toBeGreaterThan(MIN_RING_AREA);
    // The 110m map has neither.
    expect(holesOf(projectPolygons(view.projection, H, country(world110, 'ITA').geometry))).toEqual(
      [],
    );
  });

  it('has the Caspian Sea as the one hole of the land, and the other lakes inside the land', () => {
    for (const layers of [world110, world50]) {
      const view = worldView('natural earth');
      const land = projectPolygons(view.projection, H, layers.land!);
      expectStructure(land, 'land');
      const holes = polygonsOf(land).flatMap((rings) => rings.slice(1));
      expect(holes).toHaveLength(1);
      const [x0, y0, x1, y1] = boxOf(holes[0]!.x, holes[0]!.y, holes[0]!.x.length);
      const caspian = view.project(51, 42)!;
      expect(caspian[0]).toBeGreaterThan(x0);
      expect(caspian[0]).toBeLessThan(x1);
      expect(caspian[1]).toBeGreaterThan(y0);
      expect(caspian[1]).toBeLessThan(y1);
      // The lakes layer is drawn over the land: wound as outer rings, none of them dropped.
      const { result: lakes, orphans } = counted(() =>
        projectPolygons(view.projection, H, layers.lakes!),
      );
      expectStructure(lakes, 'lakes');
      expect(orphans).toBe(0);
      expect(lakes.polygonCount).toBeGreaterThanOrEqual(layers.lakes!.coordinates.length);
    }
  });
});

describe('both resolutions through the main projections', () => {
  const CASES: readonly (readonly [type: string, rotation: Rotation])[] = [
    ['equirectangular', [0, 0, 0]],
    ['natural earth', [180, 0, 0]],
    ['robinson', [-135, 0, 0]],
    ['mercator', [90, 0, 0]],
    ['mollweide', [20, 30, 15]],
    ['orthographic', [0, 0, 0]],
    ['orthographic', [-100, 45, 0]],
    ['azimuthal equal area', [180, -60, 0]],
    ['stereographic', [30, 30, 0]],
    ['albers usa', [0, 0, 0]],
  ];

  it.each([110, 50] as const)(
    '%im: no ring lost but the slivers of a clip circle',
    (resolution) => {
      const layers = resolution === 110 ? world110 : world50;
      for (const [type, rotation] of CASES) {
        const label = `${type} at ${rotation.join(', ')}`;
        const view = worldView(type, rotation);
        const clipped = view.clipAngle !== null;
        for (const object of [layers.land!, layers.countries!, layers.lakes!] as GeoInput[]) {
          const {
            result: out,
            orphans,
            nonFinite,
          } = counted(() => projectPolygons(view.projection, H, object));
          expect(nonFinite, label).toBe(0);
          expectStructure(out, label);
          if (clipped) expect(orphans, label).toBeLessThanOrEqual(12);
          else expect(orphans, label).toBe(0);
          // geoPath sums features one by one, as the sink streams them.
          const path = geoPath(view.projection);
          const list = Array.isArray(object) ? (object as Country[]) : [object];
          let reference = 0;
          for (const item of list) reference += path.area(item as GeoPermissibleObjects);
          expect(Math.abs(filledArea(out) - reference), label).toBeLessThan(1e-4 * reference + 2);
        }
      }
    },
  );
});
