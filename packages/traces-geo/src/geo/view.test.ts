import * as d3Geo from 'd3-geo';
import { geoPath, geoStream, type GeoProjection } from 'd3-geo';
import * as d3GeoProjection from 'd3-geo-projection';
import fc from 'fast-check';
import type { Polygon } from 'geojson';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  D3_GEO_PROJECTION_PROJECTIONS,
  D3_GEO_PROJECTIONS,
  LATAXIS_SPAN,
  LONAXIS_SPAN,
  PROJECTION_TYPES,
  SCOPE_DEFAULTS,
} from './constants.ts';
import { loadProjection } from './projections.ts';
import type { FullGeoLayout, GeoScope } from './types.ts';
import {
  createGeoView,
  geoInteractionMode,
  isScopedGeo,
  makeRangeBox,
  unwrapLonRange,
  type GeoFit,
  type GeoView,
} from './view.ts';

beforeAll(async () => {
  await loadProjection('robinson');
});

interface LayoutOptions {
  scope?: GeoScope;
  type?: string;
  rotation?: { lon?: number; lat?: number; roll?: number };
  center?: { lon?: number; lat?: number };
  scale?: number;
  minscale?: number;
  maxscale?: number;
  lonRange?: [number, number];
  latRange?: [number, number];
  parallels?: [number, number];
  tilt?: number;
  distance?: number;
  fitbounds?: FullGeoLayout['fitbounds'];
}

/**
 * A defaulted container, by the rules of Plotly's `layout_defaults.js`: a scope brings its
 * projection, ranges, rotation and parallels; a world map's ranges span the projection around
 * its rotation; the center is the middle of the ranges.
 */
function geoLayout(o: LayoutOptions = {}): FullGeoLayout {
  const scope = o.scope ?? 'world';
  const defaults = SCOPE_DEFAULTS[scope];
  const type = o.type ?? defaults.projType;
  const albersUsa = type === 'albers usa';
  const scoped = scope !== 'world' || albersUsa;
  const rotate = defaults.projRotate ?? [0, 0, 0];
  const rotation = {
    lon: o.rotation?.lon ?? (albersUsa ? 0 : rotate[0]),
    lat: o.rotation?.lat ?? (albersUsa ? 0 : rotate[1]),
    roll: o.rotation?.roll ?? (albersUsa ? 0 : rotate[2]),
  };
  const lonHalf = (LONAXIS_SPAN[type] ?? 360) / 2;
  const latHalf = (LATAXIS_SPAN[type] ?? 180) / 2;
  const lonRange: [number, number] =
    o.lonRange ??
    (scoped
      ? [defaults.lonaxisRange[0], defaults.lonaxisRange[1]]
      : [rotation.lon - lonHalf, rotation.lon + lonHalf]);
  const latRange: [number, number] =
    o.latRange ??
    (scoped
      ? [defaults.lataxisRange[0], defaults.lataxisRange[1]]
      : [rotation.lat - latHalf, rotation.lat + latHalf]);
  const conic = type.includes('conic') || type === 'albers';
  const axis = { showgrid: false, tick0: 0, dtick: 30, gridcolor: '#eee', gridwidth: 1 };
  return {
    domain: { x: [0, 1], y: [0, 1] },
    fitbounds: o.fitbounds ?? false,
    resolution: 110,
    scope: albersUsa ? 'usa' : scope,
    projection: {
      type,
      rotation,
      scale: o.scale ?? 1,
      minscale: o.minscale ?? 0,
      ...(o.maxscale !== undefined ? { maxscale: o.maxscale } : {}),
      ...(conic ? { parallels: o.parallels ?? [...(defaults.projParallels ?? [0, 60])] } : {}),
      ...(type === 'satellite' ? { tilt: o.tilt ?? 0, distance: o.distance ?? 2 } : {}),
    } as FullGeoLayout['projection'],
    center: {
      lon:
        o.center?.lon ??
        (albersUsa ? -96.6 : scoped ? (lonRange[0] + lonRange[1]) / 2 : rotation.lon),
      lat: o.center?.lat ?? (albersUsa ? 38.7 : (latRange[0] + latRange[1]) / 2),
    },
    visible: true,
    showcoastlines: true,
    coastlinecolor: '#444',
    coastlinewidth: 1,
    showland: false,
    landcolor: '#F0DC82',
    showocean: false,
    oceancolor: '#3399FF',
    showlakes: false,
    lakecolor: '#3399FF',
    showrivers: false,
    rivercolor: '#3399FF',
    riverwidth: 1,
    showcountries: false,
    countrycolor: '#444',
    countrywidth: 1,
    showsubunits: false,
    subunitcolor: '#444',
    subunitwidth: 1,
    showframe: true,
    framecolor: '#444',
    framewidth: 1,
    bgcolor: '#fff',
    lonaxis: { ...axis, range: lonRange, griddash: 'solid' },
    lataxis: { ...axis, range: latRange, dtick: 10, griddash: 'solid' },
  };
}

const SIZE = { width: 700, height: 450 };

/** The range box, written out again here so the reference does not lean on `makeRangeBox`. */
function rangeBox(lon: readonly [number, number], lat: readonly [number, number]): Polygon {
  const pad = 0.001;
  const lon0 = lon[0] + pad;
  let lon1 = lon[1] - pad;
  if (lon0 > lon1) lon1 += 360;
  const lat0 = lat[0] + pad;
  const lat1 = lat[1] - pad;
  const d = (lon1 - lon0) / 4;
  const top = [0, 1, 2, 3].map((i) => [lon0 + i * d, lat1]);
  const bottom = [0, 1, 2, 3].map((i) => [lon1 - i * d, lat0]);
  return {
    type: 'Polygon',
    coordinates: [[[lon0, lat0], ...top, [lon1, lat1], ...bottom, [lon0, lat0]]],
  };
}

type AnyProjection = GeoProjection & {
  parallels?: (p: [number, number]) => unknown;
  tilt?: (t: number) => unknown;
  distance?: (d: number) => unknown;
};

function d3Factory(type: string): () => AnyProjection {
  const builtin = (D3_GEO_PROJECTIONS as Record<string, string>)[type];
  const name = builtin ?? (D3_GEO_PROJECTION_PROJECTIONS as Record<string, string>)[type]!;
  const lib = (builtin ? d3Geo : d3GeoProjection) as unknown as Record<string, () => AnyProjection>;
  return lib[name]!;
}

interface Reference {
  projection: AnyProjection;
  fitScale: number;
  /** d3 px, y down. */
  bounds: [[number, number], [number, number]];
  mid: [number, number];
}

/**
 * What plotly.js `getProjection` and `updateProjection` do for a container without `fitbounds`,
 * as raw d3 calls in their order. Only `clipExtent(bounds)` is left out, as the view leaves it out,
 * and a globe's hemisphere is fitted by the sphere's outline (below).
 */
function plotlyProjection(
  layout: FullGeoLayout,
  size: { width: number; height: number },
): Reference {
  const { type, rotation, parallels } = layout.projection;
  const projection = d3Factory(type)();
  const clipAngle =
    type === 'satellite'
      ? (Math.acos(1 / layout.projection.distance!) * 180) / Math.PI
      : LONAXIS_SPAN[type] !== undefined
        ? LONAXIS_SPAN[type] / 2
        : null;
  projection.precision(0.1);
  if (type === 'satellite') {
    projection.tilt!(layout.projection.tilt!);
    projection.distance!(layout.projection.distance!);
  }
  if (clipAngle) projection.clipAngle(clipAngle - 0.001);
  if (type !== 'albers usa') {
    projection
      .center([layout.center.lon - rotation.lon, layout.center.lat - rotation.lat])
      .rotate([-rotation.lon, -rotation.lat, rotation.roll]);
    if (parallels && typeof projection.parallels === 'function') projection.parallels(parallels);
  }
  // The one place the view leaves Plotly's recipe: a globe showing the hemisphere around its
  // rotation is fitted by the sphere's outline, not by the hemisphere's range box, which d3 clips
  // to less than the disc at some rotations (see "the fit of a globe").
  const [lon0, lon1] = layout.lonaxis.range;
  const [lat0, lat1] = layout.lataxis.range;
  const hemisphere =
    type === 'orthographic' &&
    layout.scope === 'world' &&
    Math.abs(lon0 - (rotation.lon - 90)) < 1e-9 &&
    Math.abs(lon1 - (rotation.lon + 90)) < 1e-9 &&
    Math.abs(lat0 - (rotation.lat - 90)) < 1e-9 &&
    Math.abs(lat1 - (rotation.lat + 90)) < 1e-9;
  const box: d3Geo.GeoGeometryObjects = hemisphere
    ? { type: 'Sphere' }
    : rangeBox(layout.lonaxis.range, layout.lataxis.range);
  projection.fitExtent(
    [
      [0, 0],
      [size.width, size.height],
    ],
    box,
  );
  const bounds = geoPath(projection).bounds(box);
  const fitScale = projection.scale();
  projection.scale(layout.projection.scale * fitScale);
  const mid: [number, number] = [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2,
  ];
  projection.translate(mid);
  if (type === 'albers usa') {
    const centerPx = projection([layout.center.lon, layout.center.lat]);
    if (centerPx) {
      const tt = projection.translate();
      projection.translate([tt[0] - (centerPx[0] - tt[0]), tt[1] - (centerPx[1] - tt[1])]);
    }
  }
  return { projection, fitScale, bounds, mid };
}

function expectParity(layout: FullGeoLayout, size = SIZE): GeoView {
  const view = createGeoView(layout, size);
  const ref = plotlyProjection(layout, size);
  const label = `${layout.scope} / ${layout.projection.type}`;
  expect(view.valid, label).toBe(true);
  expect(view.fitScale, label).toBeCloseTo(ref.fitScale, 9);
  expect(view.projection.scale(), label).toBeCloseTo(ref.projection.scale(), 9);
  const t = view.projection.translate();
  const rt = ref.projection.translate();
  expect(t[0], label).toBeCloseTo(rt[0], 9);
  expect(t[1], label).toBeCloseTo(rt[1], 9);
  // Bounds and the mid-point, flipped to y up.
  expect(view.bounds.x0, label).toBeCloseTo(ref.bounds[0][0], 9);
  expect(view.bounds.x1, label).toBeCloseTo(ref.bounds[1][0], 9);
  expect(view.bounds.y0, label).toBeCloseTo(size.height - ref.bounds[1][1], 9);
  expect(view.bounds.y1, label).toBeCloseTo(size.height - ref.bounds[0][1], 9);
  expect(view.midPoint[0], label).toBeCloseTo(ref.mid[0], 9);
  expect(view.midPoint[1], label).toBeCloseTo(size.height - ref.mid[1], 9);
  // The same pixels for points across the ranges.
  const [lon0, lon1] = unwrapLonRange(layout.lonaxis.range);
  const [lat0, lat1] = layout.lataxis.range;
  for (const u of [0.1, 0.35, 0.5, 0.8]) {
    for (const v of [0.2, 0.5, 0.9]) {
      const lon = lon0 + u * (lon1 - lon0);
      const lat = lat0 + v * (lat1 - lat0);
      const expected = ref.projection([lon, lat]);
      const got = view.projectAt(view.state, lon, lat);
      if (!expected) {
        expect(got, label).toBeNull();
        continue;
      }
      expect(got![0], label).toBeCloseTo(expected[0], 9);
      expect(got![1], label).toBeCloseTo(size.height - expected[1], 9);
    }
  }
  return view;
}

const SCOPES = Object.keys(SCOPE_DEFAULTS) as GeoScope[];
const WORLD_TYPES = [
  'equirectangular',
  'mercator',
  'natural earth',
  'orthographic',
  'robinson',
  'conic conformal',
  'azimuthal equal area',
  'stereographic',
  'satellite',
];

describe("parity with Plotly's fit", () => {
  it.each(SCOPES)('fits the defaults of scope %s', (scope) => {
    const view = expectParity(geoLayout({ scope }));
    // The fit fills the rect in one direction and is centred in the other.
    const w = view.bounds.x1 - view.bounds.x0;
    const h = view.bounds.y1 - view.bounds.y0;
    expect(Math.max(w / SIZE.width, h / SIZE.height)).toBeCloseTo(1, 6);
    expect((view.bounds.x0 + view.bounds.x1) / 2).toBeCloseTo(SIZE.width / 2, 6);
    expect((view.bounds.y0 + view.bounds.y1) / 2).toBeCloseTo(SIZE.height / 2, 6);
  });

  it.each(WORLD_TYPES)('fits a world map in %s', (type) => {
    expectParity(geoLayout({ type }));
  });

  it('fits Albers USA, with and without a center of its own', () => {
    expectParity(geoLayout({ type: 'albers usa' }));
    expectParity(geoLayout({ type: 'albers usa', center: { lon: -110, lat: 44 }, scale: 2 }));
  });

  it('follows rotation, center, scale, parallels, tilt and custom ranges', () => {
    expectParity(geoLayout({ type: 'natural earth', rotation: { lon: 150 }, scale: 1.7 }));
    expectParity(geoLayout({ type: 'orthographic', rotation: { lon: -40, lat: 35, roll: 10 } }));
    expectParity(geoLayout({ type: 'mercator', center: { lon: 20, lat: 30 }, scale: 3 }));
    expectParity(geoLayout({ type: 'conic equal area', parallels: [20, 50], lonRange: [-30, 60] }));
    expectParity(geoLayout({ type: 'satellite', tilt: 20, distance: 3, rotation: { lat: 30 } }));
    expectParity(
      geoLayout({ type: 'equirectangular', lonRange: [100, -120], latRange: [-20, 40] }),
    );
    expectParity(geoLayout({ scope: 'asia', type: 'robinson' }));
    expectParity(geoLayout({ scope: 'europe', center: { lon: 5, lat: 50 }, scale: 2.5 }));
  });

  it('fits any rect', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'equirectangular',
          'natural earth',
          'orthographic',
          'albers usa',
          'robinson',
        ),
        fc.integer({ min: 40, max: 1600 }),
        fc.integer({ min: 40, max: 1200 }),
        (type, width, height) => {
          expectParity(geoLayout({ type }), { width, height });
        },
      ),
      { numRuns: 40 },
    );
  });

  it('builds every projection Plotly has', async () => {
    await loadProjection('robinson');
    for (const type of PROJECTION_TYPES) {
      const view = createGeoView(geoLayout({ type }), SIZE);
      expect(view.valid, type).toBe(true);
      expect(view.transform, type).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
      // A zoom is transform only in every one of them.
      const version = view.version;
      view.set({ scale: 2, translate: [view.midPoint[0] + 30, view.midPoint[1] - 20] });
      expect(view.version, type).toBe(version);
      expect(view.transform.scaleX, type).toBeCloseTo(2, 12);
    }
  });

  // Regression (GEO5): the sides of Plotly's range box touch the clip circle of a clipped world
  // map, and d3 then lost the box at some longitudes: a gnomonic map was empty at
  // `rotation.lon` 180 (and at -175, -100, …), and half as large again as its subplot at -171.
  it('fits a gnomonic map the same at every rotation.lon', () => {
    const at0 = createGeoView(geoLayout({ type: 'gnomonic' }), SIZE);
    expect(at0.valid).toBe(true);
    // The disc of 80° around the centre, as high as the subplot.
    expect(at0.bounds.y1 - at0.bounds.y0).toBeCloseTo(SIZE.height, 6);
    expect(at0.bounds.x1 - at0.bounds.x0).toBeCloseTo(SIZE.height, 6);
    for (let lon = -180; lon <= 180; lon++) {
      const view = createGeoView(geoLayout({ type: 'gnomonic', rotation: { lon } }), SIZE);
      expect(view.valid, `lon ${lon}`).toBe(true);
      expect(view.fitScale, `lon ${lon}`).toBeCloseTo(at0.fitScale, 4);
      expect(view.bounds.x0, `lon ${lon}`).toBeCloseTo(at0.bounds.x0, 3);
      expect(view.bounds.x1, `lon ${lon}`).toBeCloseTo(at0.bounds.x1, 3);
      expect(view.bounds.y0, `lon ${lon}`).toBeCloseTo(at0.bounds.y0, 3);
      expect(view.bounds.y1, `lon ${lon}`).toBeCloseTo(at0.bounds.y1, 3);
    }
  });

  it('fits a world map the same wherever it is turned in longitude, in every projection', async () => {
    await loadProjection('robinson');
    for (const type of PROJECTION_TYPES) {
      const at0 = createGeoView(geoLayout({ type }), SIZE);
      for (let lon = -180; lon <= 180; lon += 15) {
        const label = `${type}, lon ${lon}`;
        const view = createGeoView(geoLayout({ type, rotation: { lon } }), SIZE);
        expect(view.valid, label).toBe(true);
        // d3's clip of a circle of nearly 180° (azimuthal equidistant) rounds to 3e-5.
        expect(Math.abs(view.fitScale / at0.fitScale - 1), label).toBeLessThan(1e-4);
        expect(view.bounds.x0, label).toBeCloseTo(at0.bounds.x0, 1);
        expect(view.bounds.x1, label).toBeCloseTo(at0.bounds.x1, 1);
        expect(view.bounds.y0, label).toBeCloseTo(at0.bounds.y0, 1);
        expect(view.bounds.y1, label).toBeCloseTo(at0.bounds.y1, 1);
      }
    }
  });

  it('keeps the scale extent in layout units, whichever way round it came', () => {
    expect(createGeoView(geoLayout(), SIZE).scaleExtent).toEqual([0, Infinity]);
    expect(createGeoView(geoLayout({ minscale: 0.5, maxscale: 4 }), SIZE).scaleExtent).toEqual([
      0.5, 4,
    ]);
    expect(createGeoView(geoLayout({ minscale: 4, maxscale: 0.5 }), SIZE).scaleExtent).toEqual([
      0.5, 4,
    ]);
  });

  it('throws for a projection of the lazy chunk that is not loaded, and for an unknown one', () => {
    expect(() => createGeoView(geoLayout({ type: 'no such' }), SIZE)).toThrow(/'no such'/);
  });

  it('is not valid in an empty rect', () => {
    expect(createGeoView(geoLayout(), { width: 0, height: 0 }).valid).toBe(false);
  });
});

describe('modes and helpers', () => {
  it("picks Plotly's interaction", () => {
    expect(geoInteractionMode('world', 'equirectangular')).toBe('unclipped');
    expect(geoInteractionMode('world', 'orthographic')).toBe('clipped');
    // A scope wins over its clipped projection; Albers USA is always scoped.
    expect(geoInteractionMode('europe', 'conic conformal')).toBe('scoped');
    expect(geoInteractionMode('world', 'albers usa')).toBe('scoped');
    expect(isScopedGeo('world', 'mercator')).toBe(false);
    expect(createGeoView(geoLayout({ scope: 'europe' }), SIZE).mode).toBe('scoped');
  });

  it('makes the range box d3 expects', () => {
    expect(makeRangeBox([-30, 60], [30, 85])).toEqual(rangeBox([-30, 60], [30, 85]));
    // Across the antimeridian the east edge is unwrapped.
    const box = makeRangeBox([170, -170], [0, 10]);
    expect(box.coordinates[0]![5]![0]).toBeCloseTo(189.999, 9);
    expect(unwrapLonRange([170, -170])).toEqual([170, 190]);
    expect(unwrapLonRange([-10, 20])).toEqual([-10, 20]);
    // The box is the inside: its area is less than half the sphere.
    expect(d3Geo.geoArea(makeRangeBox([-180, 180], [-90, 90]))).toBeGreaterThan(4 * Math.PI - 0.01);
    expect(d3Geo.geoArea(makeRangeBox([-30, 60], [30, 85]))).toBeLessThan(2);
  });
});

const lonArb = fc.double({ min: -179, max: 179, noNaN: true });

describe('project and invert', () => {
  const cases: { name: string; layout: FullGeoLayout; lat: [number, number]; digits: number }[] = [
    { name: 'equirectangular', layout: geoLayout(), lat: [-89, 89], digits: 8 },
    { name: 'mercator', layout: geoLayout({ type: 'mercator' }), lat: [-84, 84], digits: 8 },
    {
      name: 'natural earth',
      layout: geoLayout({ type: 'natural earth' }),
      lat: [-89, 89],
      digits: 6,
    },
    { name: 'robinson', layout: geoLayout({ type: 'robinson' }), lat: [-85, 85], digits: 5 },
    {
      name: 'orthographic',
      layout: geoLayout({ type: 'orthographic', rotation: { lon: 20, lat: 30 } }),
      lat: [-89, 89],
      digits: 6,
    },
    { name: 'europe', layout: geoLayout({ scope: 'europe' }), lat: [30, 85], digits: 7 },
  ];

  it.each(cases)('invert(project(p)) is p for visible points: $name', ({ layout, lat, digits }) => {
    const view = createGeoView(layout, SIZE);
    fc.assert(
      fc.property(lonArb, fc.double({ min: lat[0], max: lat[1], noNaN: true }), (lon, la) => {
        const px = view.project(lon, la);
        if (!px) {
          expect(view.isLonLatOverEdges(lon, la)).toBe(true);
          return;
        }
        const back = view.invert(px[0], px[1]);
        // Near the edge of a clipped globe the inverse is ill-conditioned; skip the last degree.
        if (view.clipAngle !== null) {
          const away = d3Geo.geoDistance(
            [lon, la],
            [view.state.rotation.lon, view.state.rotation.lat],
          );
          if (away > ((view.clipAngle - 1) * Math.PI) / 180) return;
        }
        expect(back).not.toBeNull();
        expect(d3Geo.geoDistance(back!, [lon, la]) * (180 / Math.PI)).toBeCloseTo(0, digits);
      }),
    );
  });

  it('round-trips inside the contiguous states of Albers USA', () => {
    const view = createGeoView(geoLayout({ type: 'albers usa' }), SIZE);
    fc.assert(
      fc.property(
        fc.double({ min: -120, max: -75, noNaN: true }),
        fc.double({ min: 31, max: 48, noNaN: true }),
        (lon, lat) => {
          const px = view.project(lon, lat)!;
          const back = view.invert(px[0], px[1])!;
          expect(back[0]).toBeCloseTo(lon, 6);
          expect(back[1]).toBeCloseTo(lat, 6);
        },
      ),
    );
  });

  it('is in subplot px, y up', () => {
    const view = createGeoView(geoLayout(), SIZE);
    const north = view.project(0, 60)!;
    const south = view.project(0, -60)!;
    expect(north[1]).toBeGreaterThan(south[1]);
    expect(view.project(0, 0)![0]).toBeCloseTo(SIZE.width / 2, 9);
    expect(view.project(0, 0)![1]).toBeCloseTo(SIZE.height / 2, 9);
    // The d3 projection itself has y down from the top of the rect.
    const d3px = view.projection([0, 60])!;
    expect(d3px[1]).toBeCloseTo(SIZE.height - north[1], 9);
  });

  it('hides the far side of an orthographic globe', () => {
    const view = createGeoView(geoLayout({ type: 'orthographic', rotation: { lon: 10 } }), SIZE);
    expect(view.clipAngle).toBe(90);
    expect(view.project(10, 0)).not.toBeNull();
    expect(view.project(95, 0)).not.toBeNull();
    expect(view.project(-170, 0)).toBeNull();
    expect(view.project(101, 0)).toBeNull();
    expect(view.isLonLatOverEdges(-170, 0)).toBe(true);
    expect(view.isLonLatOverEdges(10, 0)).toBe(false);
    // Off the disc there is no longitude and latitude, though d3 answers with a point of the edge.
    expect(view.invert(2, 2)).toBeNull();
    expect(view.invertAt(view.state, 2, 2)).not.toBeNull();
    expect(view.invert(view.midPoint[0] + 20, view.midPoint[1])).not.toBeNull();
    // The hidden side follows the rotation.
    view.set({ rotation: { lon: -170 } });
    expect(view.project(-170, 0)).not.toBeNull();
    expect(view.project(10, 0)).toBeNull();
  });

  it('has no pixel outside the three parts of Albers USA', () => {
    const view = createGeoView(geoLayout({ type: 'albers usa' }), SIZE);
    expect(view.project(-98, 39)).not.toBeNull();
    expect(view.project(-150, 64)).not.toBeNull(); // Alaska
    expect(view.project(-157, 21)).not.toBeNull(); // Hawaii
    expect(view.project(0, 51)).toBeNull(); // London
    expect(view.project(-58, -34)).toBeNull(); // Buenos Aires
    expect(view.isLonLatOverEdges(0, 51)).toBe(true);
  });

  it('uses the clip angle a projection has of its own, which Plotly overlooks', () => {
    const view = createGeoView(geoLayout({ type: 'airy' }), SIZE);
    expect(view.clipAngle).toBeCloseTo(147, 6);
    expect(view.project(170, 0)).toBeNull();
    expect(view.project(140, 0)).not.toBeNull();
    expect(createGeoView(geoLayout({ type: 'mercator' }), SIZE).clipAngle).toBeNull();
    const satellite = createGeoView(geoLayout({ type: 'satellite', distance: 2 }), SIZE);
    expect(satellite.clipAngle).toBeCloseTo(60, 9);
    expect(satellite.project(0, 59)).not.toBeNull();
    expect(satellite.project(0, 61)).toBeNull();
  });
});

/** Applies a view's transform to a base-projected point. */
function carried(view: GeoView, p: readonly [number, number]): [number, number] {
  const t = view.transform;
  return [p[0] * t.scaleX + t.offsetX, p[1] * t.scaleY + t.offsetY];
}

const TRANSFORM_CASES: {
  name: string;
  layout: FullGeoLayout;
  lon: [number, number];
  lat: [number, number];
}[] = [
  { name: 'mercator', layout: geoLayout({ type: 'mercator' }), lon: [-179, 179], lat: [-84, 84] },
  { name: 'equirectangular', layout: geoLayout(), lon: [-179, 179], lat: [-89, 89] },
  {
    name: 'natural earth',
    layout: geoLayout({ type: 'natural earth', rotation: { lon: 40 } }),
    lon: [-179, 179],
    lat: [-89, 89],
  },
  {
    name: 'conic conformal (europe)',
    layout: geoLayout({ scope: 'europe' }),
    lon: [-30, 60],
    lat: [30, 85],
  },
  {
    name: 'conic conformal (world)',
    layout: geoLayout({ type: 'conic conformal', rotation: { lon: -20, lat: 10 } }),
    lon: [-100, 60],
    lat: [-50, 80],
  },
  {
    name: 'albers usa',
    layout: geoLayout({ type: 'albers usa' }),
    lon: [-170, -66],
    lat: [18, 71],
  },
  {
    name: 'orthographic',
    layout: geoLayout({ type: 'orthographic', rotation: { lon: 30, lat: 20, roll: 15 } }),
    lon: [-179, 179],
    lat: [-89, 89],
  },
  { name: 'robinson', layout: geoLayout({ type: 'robinson' }), lon: [-179, 179], lat: [-89, 89] },
];

describe('the base and the transform', () => {
  it.each(TRANSFORM_CASES)(
    'carries base-projected points to a pan and zoom without reprojecting: $name',
    ({ layout, lon, lat }) => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.double({ min: lon[0], max: lon[1], noNaN: true }),
              fc.double({ min: lat[0], max: lat[1], noNaN: true }),
            ),
            { minLength: 1, maxLength: 12 },
          ),
          fc.double({ min: 0.2, max: 12, noNaN: true }),
          fc.double({ min: -400, max: 400, noNaN: true }),
          fc.double({ min: -300, max: 300, noNaN: true }),
          (points, zoom, dx, dy) => {
            const view = createGeoView(layout, SIZE);
            const version = view.version;
            const base = points.map(([lo, la]) => view.project(lo, la));
            expect(view.transform).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });

            const t0 = view.state.translate;
            view.set({ scale: view.state.scale * zoom, translate: [t0[0] + dx, t0[1] + dy] });
            expect(view.version).toBe(version);
            expect(view.transform.scaleX).toBeCloseTo(zoom, 9);
            expect(view.transform.scaleY).toBe(view.transform.scaleX);

            points.forEach(([lo, la], i) => {
              const fresh = view.project(lo, la);
              const was = base[i];
              // A point the projection clips has no pixel on either side.
              if (!was || !fresh) return;
              const moved = carried(view, was);
              expect(Math.abs(moved[0] - fresh[0])).toBeLessThan(1e-6);
              expect(Math.abs(moved[1] - fresh[1])).toBeLessThan(1e-6);
            });

            // A second step composes: the transform is still from the same base.
            view.set({ scale: view.state.scale * 0.5 });
            expect(view.version).toBe(version);
            points.forEach(([lo, la], i) => {
              const fresh = view.project(lo, la);
              const was = base[i];
              if (!was || !fresh) return;
              const moved = carried(view, was);
              expect(Math.abs(moved[0] - fresh[0])).toBeLessThan(1e-6);
              expect(Math.abs(moved[1] - fresh[1])).toBeLessThan(1e-6);
            });
          },
        ),
        { numRuns: 60 },
      );
    },
  );

  it('carries streamed geometry too: d3 px flipped to y up, then the transform', () => {
    for (const { name, layout, lon, lat } of TRANSFORM_CASES) {
      const view = createGeoView(layout, SIZE);
      const coordinates: [number, number][] = [];
      for (let i = 0; i <= 6; i++) {
        for (let j = 0; j <= 4; j++) {
          coordinates.push([
            lon[0] + ((lon[1] - lon[0]) * (i + 0.5)) / 7,
            lat[0] + ((lat[1] - lat[0]) * (j + 0.5)) / 5,
          ]);
        }
      }
      // A sink as the subplot's will be: it keeps what d3 lets through, flipped.
      const streamed = (): Map<string, [number, number]> => {
        const out = new Map<string, [number, number]>();
        let index = 0;
        const noop = (): void => {};
        const sink = view.projection.stream({
          point: (x, y) => out.set(String(index), [x, view.size.height - y]),
          lineStart: noop,
          lineEnd: noop,
          polygonStart: noop,
          polygonEnd: noop,
        });
        for (const c of coordinates) {
          geoStream({ type: 'Point', coordinates: c }, sink);
          index += 1;
        }
        return out;
      };
      const base = streamed();
      expect(base.size, name).toBeGreaterThan(5);
      view.set({
        scale: 3,
        translate: [view.state.translate[0] - 120, view.state.translate[1] + 75],
      });
      const fresh = streamed();
      for (const [key, was] of base) {
        const now = fresh.get(key);
        if (!now) continue;
        const moved = carried(view, was);
        expect(Math.abs(moved[0] - now[0]), name).toBeLessThan(1e-6);
        expect(Math.abs(moved[1] - now[1]), name).toBeLessThan(1e-6);
      }
    }
  });

  it('changes version on a rotation, and starts again from the identity', () => {
    const view = createGeoView(geoLayout({ type: 'natural earth' }), SIZE);
    const version = view.version;
    view.set({ scale: 2 });
    expect(view.version).toBe(version);
    view.set({ rotation: { lon: 30 } });
    expect(view.version).not.toBe(version);
    expect(view.transform).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
    expect(view.state.scale).toBe(2);
    const after = view.version;
    view.set({ rotation: { lat: 10 } });
    expect(view.version).not.toBe(after);
    const rolled = view.version;
    view.set({ rotation: { roll: 5 } });
    expect(view.version).not.toBe(rolled);
    // Setting what is already there is not a change.
    const same = view.version;
    view.set({ rotation: { lon: 30, lat: 10, roll: 5 }, scale: 2 });
    view.set({ scale: Number.NaN, translate: [Number.NaN, 0] });
    view.set({ scale: -1 });
    expect(view.version).toBe(same);
    expect(view.state.scale).toBe(2);
  });

  it('rebases: the current state becomes the base', () => {
    const view = createGeoView(geoLayout({ type: 'mercator' }), SIZE);
    const version = view.version;
    // Nothing to do at the base.
    expect(view.rebase()).toBe(false);
    expect(view.version).toBe(version);
    view.set({ scale: 8 });
    expect(view.transform.scaleX).toBeCloseTo(8, 12);
    expect(view.rebase()).toBe(true);
    expect(view.version).not.toBe(version);
    expect(view.transform).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
    expect(view.state.scale).toBe(8);
    // And the next zoom is measured from there.
    const base = view.project(10, 20)!;
    view.set({ scale: 16 });
    const moved = carried(view, base);
    const fresh = view.project(10, 20)!;
    expect(moved[0]).toBeCloseTo(fresh[0], 6);
    expect(moved[1]).toBeCloseTo(fresh[1], 6);
  });

  it('gives every view and every reprojection its own version', () => {
    const a = createGeoView(geoLayout(), SIZE);
    const b = createGeoView(geoLayout(), SIZE);
    expect(a.version).not.toBe(b.version);
    const seen = new Set([a.version, b.version]);
    a.set({ rotation: { lon: 5 } });
    expect(seen.has(a.version)).toBe(false);
  });

  it('does not rotate Albers USA', () => {
    const view = createGeoView(geoLayout({ type: 'albers usa' }), SIZE);
    const version = view.version;
    view.set({ rotation: { lon: 40 } });
    expect(view.version).toBe(version);
    expect(view.state.rotation).toEqual({ lon: 0, lat: 0, roll: 0 });
  });

  it('keeps the base across a relayout that only moves the centre or the scale', () => {
    for (const { name, layout, lon, lat } of TRANSFORM_CASES) {
      const first = createGeoView(layout, SIZE);
      const point: [number, number] = [(lon[0] + lon[1]) / 2 + 3, (lat[0] + lat[1]) / 2 + 2];
      const base = first.project(point[0], point[1]);
      const moved: FullGeoLayout = {
        ...layout,
        center: { lon: layout.center.lon + 4, lat: layout.center.lat - 3 },
        projection: { ...layout.projection, scale: 2.5 },
      };
      const second = createGeoView(moved, SIZE, { previous: first });
      expect(second.version, name).toBe(first.version);
      const fresh = second.project(point[0], point[1]);
      if (base && fresh) {
        const at = carried(second, base);
        expect(Math.abs(at[0] - fresh[0]), name).toBeLessThan(1e-6);
        expect(Math.abs(at[1] - fresh[1]), name).toBeLessThan(1e-6);
      }
      // Rebasing the new view does not disturb the old one's version.
      expect(second.rebase(), name).toBe(true);
      expect(second.version, name).not.toBe(first.version);
    }
  });

  it('does not keep the base when the projection differs', () => {
    const layout = geoLayout({ type: 'natural earth' });
    const first = createGeoView(layout, SIZE);
    const differ: [string, FullGeoLayout, { width: number; height: number }][] = [
      ['type', geoLayout({ type: 'robinson' }), SIZE],
      ['rotation', geoLayout({ type: 'natural earth', rotation: { lon: 10 } }), SIZE],
      ['size', layout, { width: 701, height: 450 }],
    ];
    for (const [what, next, size] of differ) {
      const second = createGeoView(next, size, { previous: first });
      expect(second.version, what).not.toBe(first.version);
      expect(second.transform, what).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
    }
    const conic = geoLayout({ type: 'conic equal area', parallels: [20, 50] });
    const other = geoLayout({ type: 'conic equal area', parallels: [20, 60] });
    const a = createGeoView(conic, SIZE);
    expect(createGeoView(other, SIZE, { previous: a }).version).not.toBe(a.version);
    const sat = createGeoView(geoLayout({ type: 'satellite', tilt: 10 }), SIZE);
    const tilted = createGeoView(geoLayout({ type: 'satellite', tilt: 20 }), SIZE, {
      previous: sat,
    });
    expect(tilted.version).not.toBe(sat.version);
  });

  it("does not keep the base between 'orthographic' and 'globe3d'", () => {
    // The pixels are the same, but the two are drawn in different viewports (a 2D one and the
    // globe's 3D one, ADR-028): a relayout from one to the other draws everything again, and a
    // new version is what makes every layer and trace do so.
    for (const [from, to] of [
      ['orthographic', 'globe3d'],
      ['globe3d', 'orthographic'],
    ] as const) {
      const first = createGeoView(geoLayout({ type: from, rotation: { lon: 20, lat: 10 } }), SIZE);
      first.set({ scale: 2 });
      const second = createGeoView(
        geoLayout({ type: to, rotation: { lon: 20, lat: 10 }, scale: 2 }),
        SIZE,
        { previous: first },
      );
      expect(second.version, to).not.toBe(first.version);
      expect(second.transform, to).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
    }
    // A globe continues a globe.
    const globe = createGeoView(geoLayout({ type: 'globe3d' }), SIZE);
    const zoomed = createGeoView(geoLayout({ type: 'globe3d', scale: 2 }), SIZE, {
      previous: globe,
    });
    expect(zoomed.version).toBe(globe.version);
  });
});

describe("the view of 'globe3d' (ADR-028)", () => {
  it('is the orthographic view: the same fit, bounds, clip, mode, pixels and inverse', () => {
    fc.assert(
      fc.property(
        fc.record({
          lon: fc.double({ min: -180, max: 180, noNaN: true }),
          lat: fc.double({ min: -90, max: 90, noNaN: true }),
          roll: fc.double({ min: -180, max: 180, noNaN: true }),
          scale: fc.double({ min: 0.2, max: 20, noNaN: true }),
        }),
        fc.array(
          fc.tuple(
            fc.double({ min: -180, max: 180, noNaN: true }),
            fc.double({ min: -90, max: 90, noNaN: true }),
          ),
          { minLength: 1, maxLength: 8 },
        ),
        ({ lon, lat, roll, scale }, points) => {
          const options = { rotation: { lon, lat, roll }, scale };
          const globe = createGeoView(geoLayout({ ...options, type: 'globe3d' }), SIZE);
          const flat = createGeoView(geoLayout({ ...options, type: 'orthographic' }), SIZE);
          expect(globe.type).toBe('globe3d');
          expect(globe.mode).toBe('clipped');
          expect(globe.valid).toBe(flat.valid);
          expect(globe.fitScale).toBe(flat.fitScale);
          expect(globe.bounds).toEqual(flat.bounds);
          expect(globe.clipAngle).toBe(flat.clipAngle);
          expect(globe.state).toEqual(flat.state);
          expect(globe.toLayout()).toEqual(flat.toLayout());
          for (const [x, y] of points) {
            expect(globe.project(x, y)).toEqual(flat.project(x, y));
            expect(globe.isLonLatOverEdges(x, y)).toBe(flat.isLonLatOverEdges(x, y));
          }
          expect(globe.invert(350, 225)).toEqual(flat.invert(350, 225));
        },
      ),
      { numRuns: 50 },
    );
  });

  it('fits its data as the orthographic view does', () => {
    const fit: GeoFit = {
      points: [
        [100, 10],
        [140, 40],
      ],
      pad: 10,
    };
    const globe = createGeoView(geoLayout({ type: 'globe3d', fitbounds: 'locations' }), SIZE, {
      fit,
    });
    const flat = createGeoView(geoLayout({ type: 'orthographic', fitbounds: 'locations' }), SIZE, {
      fit,
    });
    expect(globe.state).toEqual(flat.state);
    expect(globe.state.rotation.lon).toBeCloseTo(120, 6);
    expect(geoInteractionMode('world', 'globe3d')).toBe('clipped');
    expect(geoInteractionMode('europe', 'globe3d')).toBe('scoped');
  });
});

describe('reading the view back as layout values', () => {
  it('returns what the layout said, before any interaction', () => {
    for (const layout of [
      geoLayout(),
      geoLayout({ scope: 'europe' }),
      geoLayout({ scope: 'africa', center: { lon: 10, lat: -5 }, scale: 2 }),
      geoLayout({ type: 'albers usa' }),
      geoLayout({ type: 'natural earth', rotation: { lon: 60 } }),
    ]) {
      const view = createGeoView(layout, SIZE);
      const read = view.toLayout();
      const label = `${layout.scope} / ${layout.projection.type}`;
      expect(read.scale, label).toBe(layout.projection.scale);
      expect(read.rotation.lon, label).toBe(layout.projection.rotation.lon);
      expect(read.center!.lon, label).toBeCloseTo(layout.center.lon, 1);
      expect(read.center!.lat, label).toBeCloseTo(layout.center.lat, 1);
    }
  });

  it('reads the center back from the pixel in the middle, as Plotly does after a pan', () => {
    const layout = geoLayout({ scope: 'africa' });
    const view = createGeoView(layout, SIZE);
    const t = view.state.translate;
    view.set({ translate: [t[0] + 80, t[1] - 40], scale: 1.5 });
    const read = view.toLayout();
    const expected = view.invert(view.midPoint[0], view.midPoint[1])!;
    expect(read.center).toEqual({ lon: expected[0], lat: expected[1] });
    expect(read.scale).toBe(1.5);

    // A view built from those values draws the same map: the pan became `center`.
    const next = createGeoView(
      {
        ...layout,
        center: read.center!,
        projection: { ...layout.projection, scale: read.scale },
      },
      SIZE,
    );
    for (const [lon, lat] of [
      [0, 0],
      [20, 10],
      [-10, -30],
    ] as const) {
      const a = view.project(lon, lat)!;
      const b = next.project(lon, lat)!;
      expect(b[0]).toBeCloseTo(a[0], 6);
      expect(b[1]).toBeCloseTo(a[1], 6);
    }
  });
});

/** The scale `fitbounds` gives, as raw d3 calls on the reference projection. */
function fitScaleOf(ref: Reference, lon: [number, number], lat: [number, number]): number {
  const path = geoPath(ref.projection);
  const b = ref.bounds;
  const b2 = path.bounds(rangeBox(lon, lat));
  return Math.min(
    (b[1][0] - b[0][0]) / (b2[1][0] - b2[0][0]),
    (b[1][1] - b[0][1]) / (b2[1][1] - b2[0][1]),
  );
}

describe('fitbounds', () => {
  const lon: [number, number] = [2, 24];
  const lat: [number, number] = [41, 55];
  const fit: GeoFit = { lon, lat };

  it('moves the center of a scoped map and scales it to the data', () => {
    const layout = geoLayout({ scope: 'europe', fitbounds: 'locations' });
    const view = createGeoView(layout, SIZE, { fit });
    // The reference: the same container with the center the fit computes, scale 1.
    const ref = plotlyProjection({ ...layout, center: { lon: 13, lat: 48 } }, SIZE);
    const k2 = fitScaleOf(ref, lon, lat);
    expect(view.state.scale).toBeCloseTo(k2, 9);
    expect(view.state.rotation).toEqual(layout.projection.rotation);
    expect(view.ranges).toEqual({ lon: layout.lonaxis.range, lat: layout.lataxis.range });
    expect(view.fitScale).toBeCloseTo(ref.fitScale, 9);
    const c = view.toLayout().center!;
    expect(c.lon).toBeCloseTo(13, 6);
    expect(c.lat).toBeCloseTo(48, 6);
    // The data's box is as large as the bounds in one direction. On a cone it is not centred
    // on its own middle, so a corner may reach a few px past them, as it does in Plotly.
    const corners = [view.project(2, 41)!, view.project(24, 41)!, view.project(13, 55)!];
    for (const p of corners) {
      expect(p[0]).toBeGreaterThan(view.bounds.x0 - 10);
      expect(p[0]).toBeLessThan(view.bounds.x1 + 10);
      expect(p[1]).toBeGreaterThan(view.bounds.y0 - 10);
      expect(p[1]).toBeLessThan(view.bounds.y1 + 10);
    }
  });

  it('turns a clipped world map to the data and shows the whole span around it', () => {
    const layout = geoLayout({ type: 'orthographic', fitbounds: 'locations' });
    const view = createGeoView(layout, SIZE, { fit });
    expect(view.state.rotation).toEqual({ lon: 13, lat: 48, roll: 0 });
    expect(view.ranges).toEqual({ lon: [-77, 103], lat: [-42, 138] });
    const fitted = geoLayout({
      type: 'orthographic',
      rotation: { lon: 13, lat: 48 },
      center: { lon: 13, lat: 48 },
      lonRange: [-77, 103],
      latRange: [-42, 138],
    });
    const ref = plotlyProjection(fitted, SIZE);
    expect(view.fitScale).toBeCloseTo(ref.fitScale, 9);
    expect(view.state.scale).toBeCloseTo(fitScaleOf(ref, lon, lat), 9);
    const mid = view.project(13, 48)!;
    expect(mid[0]).toBeCloseTo(view.midPoint[0], 6);
    expect(mid[1]).toBeCloseTo(view.midPoint[1], 6);
  });

  it('turns any other world map in longitude only', () => {
    const layout = geoLayout({ type: 'natural earth', fitbounds: 'geojson' });
    const view = createGeoView(layout, SIZE, { fit });
    expect(view.state.rotation).toEqual({ lon: 13, lat: 0, roll: 0 });
    const ref = plotlyProjection(
      {
        ...geoLayout({ type: 'natural earth', rotation: { lon: 13 }, lonRange: [-180, 180] }),
        center: { lon: 13, lat: 48 },
      },
      SIZE,
    );
    expect(view.fitScale).toBeCloseTo(ref.fitScale, 9);
    expect(view.state.scale).toBeCloseTo(fitScaleOf(ref, lon, lat), 9);
    const mid = view.project(13, 48)!;
    expect(mid[0]).toBeCloseTo(view.midPoint[0], 6);
    expect(mid[1]).toBeCloseTo(view.midPoint[1], 6);
  });

  it('does not fit the projections Plotly cannot fit, nor when it is off', () => {
    const usa = geoLayout({ type: 'albers usa', fitbounds: 'locations' });
    const plain = createGeoView(geoLayout({ type: 'albers usa' }), SIZE);
    const view = createGeoView(usa, SIZE, { fit: { lon: [-100, -90], lat: [30, 40] } });
    expect(view.state).toEqual(plain.state);
    const off = createGeoView(geoLayout({ scope: 'europe' }), SIZE, { fit });
    expect(off.state.scale).toBe(1);
  });

  it('fits the axis ranges when there is no data', () => {
    const layout = geoLayout({ scope: 'europe', fitbounds: 'locations' });
    for (const noFit of [undefined, { points: [] }, { points: [[Number.NaN, 0]] }] as const) {
      const view = createGeoView(layout, SIZE, noFit ? { fit: noFit as GeoFit } : {});
      expect(view.state.scale).toBeCloseTo(1, 9);
    }
  });

  it('bounds points, the short way round the antimeridian', () => {
    const layout = geoLayout({ type: 'equirectangular', fitbounds: 'locations' });
    const view = createGeoView(layout, SIZE, {
      fit: {
        points: [
          [170, -10],
          [-170, 10],
          [175, 0],
        ],
      },
    });
    // Minimum to maximum would be 340° wide and centred on 0; the arc is 20° wide around 180.
    expect(Math.abs(view.state.rotation.lon)).toBeCloseTo(180, 9);
    expect(view.toLayout().center!.lat).toBeCloseTo(0, 6);
    expect(view.state.scale).toBeGreaterThan(8);

    // Points that do not cross it keep their minimum and maximum.
    const plain = createGeoView(layout, SIZE, {
      fit: {
        points: [
          [10, 40],
          [30, 60],
        ],
      },
    });
    const same = createGeoView(layout, SIZE, { fit: { lon: [10, 30], lat: [40, 60] } });
    expect(plain.state.rotation.lon).toBeCloseTo(20, 9);
    expect(plain.state.scale).toBeCloseTo(same.state.scale, 9);
  });

  it('gives one point a degree on each side, and keeps room for markers', () => {
    const layout = geoLayout({ type: 'equirectangular', fitbounds: 'locations' });
    const one = createGeoView(layout, SIZE, { fit: { points: [[30, 20]] } });
    const box = createGeoView(layout, SIZE, { fit: { lon: [29, 31], lat: [19, 21] } });
    expect(one.state.scale).toBeCloseTo(box.state.scale, 9);
    expect(one.state.rotation.lon).toBeCloseTo(30, 9);

    const bare = createGeoView(layout, SIZE, { fit: { lon: [0, 40], lat: [0, 5] } });
    const padded = createGeoView(layout, SIZE, { fit: { lon: [0, 40], lat: [0, 5], pad: 35 } });
    // 35 px on each side of a 700 px rect: the data takes 630 px of it (but for the box's pad).
    expect(padded.state.scale / bare.state.scale).toBeCloseTo(630 / 700, 4);
    const left = padded.project(0, 2)!;
    expect(left[0] - padded.bounds.x0).toBeCloseTo(35, 1);
    // A pad that leaves nothing is ignored.
    const silly = createGeoView(layout, SIZE, { fit: { lon: [0, 40], lat: [0, 5], pad: 340 } });
    expect(silly.state.scale).toBeCloseTo(bare.state.scale, 9);
  });
});

describe('the fit of a globe', () => {
  it('fits the disc at every rotation (not what d3 leaves of the range box)', () => {
    // Plotly's recipe, fitting the hemisphere's range box, gives a globe 1.5 times too large here.
    const odd = createGeoView(
      geoLayout({ type: 'orthographic', rotation: { lon: -45, lat: 28 } }),
      { width: 600, height: 400 },
    );
    expect(odd.fitScale).toBeCloseTo(200, 2);
    expect(odd.bounds.x1 - odd.bounds.x0).toBeCloseTo(400, 1);
    expect(odd.bounds.y1 - odd.bounds.y0).toBeCloseTo(400, 1);
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.constantFrom('orthographic', 'globe3d'),
        (lon, lat, roll, type) => {
          const view = createGeoView(geoLayout({ type, rotation: { lon, lat, roll } }), {
            width: 600,
            height: 400,
          });
          expect(view.valid).toBe(true);
          expect(view.fitScale).toBeCloseTo(200, 2);
          const b = view.bounds;
          expect([b.x0, b.y0, b.x1, b.y1].map((v) => Math.round(v * 10) / 10)).toEqual([
            100, 0, 500, 400,
          ]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('keeps the range box when the figure sets its own ranges', () => {
    const view = createGeoView(
      geoLayout({ type: 'orthographic', lonRange: [-40, 40], latRange: [-20, 20] }),
      { width: 600, height: 400 },
    );
    // A box narrower than the hemisphere is fitted as before: the globe is larger than the rect.
    expect(view.fitScale).toBeGreaterThan(300);
  });
});
