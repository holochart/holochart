import { geoArea } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import type {
  GeometryCollection,
  GeometryObject,
  MultiPolygon as TopoMultiPolygon,
} from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import {
  buildBasemap,
  countryId,
  countryName,
  countryNumeric,
  joinExtras,
  type BuildSources,
} from './build.ts';
import { isWoundForD3, polygonsOf } from './geometry.ts';

const collection = (features: Feature[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

/** A rectangle wound as RFC 7946 (counterclockwise), with a vertex wherever `ys` puts one on its sides. */
function rectangle(x0: number, x1: number, ys: number[]): Polygon {
  const up = ys.map((y): Position => [x1, y]);
  const down = ys
    .slice()
    .reverse()
    .map((y): Position => [x0, y]);
  return { type: 'Polygon', coordinates: [[...up, ...down, up[0] as Position]] };
}

/**
 * Two countries side by side, West (lon 0..10, Europe) and East (lon 10..20, Asia), a lake on
 * their border, a river through both, and East's two provinces. The provinces' outer edges run
 * along East's own outline, vertex for vertex.
 */
const SOURCES: BuildSources = {
  countries: collection([
    {
      type: 'Feature',
      properties: {
        NAME: 'West',
        ADMIN: 'West',
        ADM0_A3: 'WST',
        ISO_A3: 'WST',
        ISO_A3_EH: 'WST',
        ISO_N3: '901',
        ISO_N3_EH: '901',
        CONTINENT: 'Europe',
        LABEL_X: 5,
        LABEL_Y: 5,
      },
      geometry: rectangle(0, 10, [0, 5, 10]),
    },
    {
      type: 'Feature',
      properties: {
        // Cut down to fit a map label, as Natural Earth does: ADMIN has it in full.
        NAME: 'E. Country',
        ADMIN: 'East',
        ADM0_A3: 'EST',
        // Natural Earth's France and Norway: no ISO_A3, but an ISO_A3_EH of their own.
        ISO_A3: '-99',
        ISO_A3_EH: 'EST',
        ISO_N3: '-99',
        ISO_N3_EH: '902',
        CONTINENT: 'Asia',
        // A label point placed on a more detailed shape, outside this one.
        LABEL_X: 30,
        LABEL_Y: 5,
      },
      geometry: rectangle(10, 20, [0, 5, 10]),
    },
  ]),
  lakes: collection([{ type: 'Feature', properties: {}, geometry: rectangle(9, 11, [4, 6]) }]),
  rivers: collection([
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [2, 2],
          [18, 2],
        ],
      },
    },
  ]),
  subunits: collection([
    {
      type: 'Feature',
      properties: { name: 'South', postal: 'S', adm0_a3: 'EST', longitude: 15, latitude: 2.5 },
      geometry: rectangle(10, 20, [0, 5]),
    },
    {
      type: 'Feature',
      properties: { name: 'North', postal: 'N', adm0_a3: 'EST', longitude: 15, latitude: 7.5 },
      geometry: rectangle(10, 20, [5, 10]),
    },
    {
      type: 'Feature',
      properties: { name: 'Elsewhere', postal: 'E', adm0_a3: 'WST', longitude: 5, latitude: 5 },
      geometry: rectangle(0, 10, [0, 10]),
    },
  ]),
};

describe('country ids', () => {
  it('are ISO_A3, then an ISO_A3_EH of the feature itself, then an override', () => {
    expect(countryId({ ADM0_A3: 'DEU', ISO_A3: 'DEU', ISO_A3_EH: 'DEU' })).toBe('DEU');
    expect(countryId({ ADM0_A3: 'FRA', ISO_A3: '-99', ISO_A3_EH: 'FRA' })).toBe('FRA');
    expect(countryId({ ADM0_A3: 'NOR', ISO_A3: '-99', ISO_A3_EH: 'NOR' })).toBe('NOR');
    // Natural Earth's own codes differ from ISO's for these; ISO's wins.
    expect(countryId({ ADM0_A3: 'SDS', ISO_A3: 'SSD', ISO_A3_EH: 'SSD' })).toBe('SSD');
    expect(countryId({ ADM0_A3: 'PSX', ISO_A3: 'PSE', ISO_A3_EH: 'PSE' })).toBe('PSE');
    expect(countryId({ ADM0_A3: 'KOS', ISO_A3: '-99', ISO_A3_EH: '-99' })).toBe('XKX');
  });

  it('are missing where Natural Earth has no code of the feature itself', () => {
    expect(countryId({ ADM0_A3: 'CYN', ISO_A3: '-99', ISO_A3_EH: '-99' })).toBeUndefined();
    expect(countryId({ ADM0_A3: 'SOL', ISO_A3: '-99', ISO_A3_EH: '-99' })).toBeUndefined();
    // ISO_A3_EH is the sovereign's here, and Australia is a feature of its own.
    expect(countryId({ ADM0_A3: 'IOA', ISO_A3: '-99', ISO_A3_EH: 'AUS' })).toBeUndefined();
    expect(countryId({ ADM0_A3: 'ATC', ISO_A3: '-99', ISO_A3_EH: 'AUS' })).toBeUndefined();
  });

  it('go with a name that is not abbreviated', () => {
    expect(countryName({ NAME: 'Russia', ADMIN: 'Russia' })).toBe('Russia');
    expect(countryName({ NAME: 'Tanzania', ADMIN: 'United Republic of Tanzania' })).toBe(
      'Tanzania',
    );
    expect(
      countryName({ NAME: 'Dem. Rep. Congo', ADMIN: 'Democratic Republic of the Congo' }),
    ).toBe('Democratic Republic of the Congo');
    expect(countryName({ NAME: 'St-Martin', ADMIN: 'Saint Martin' })).toBe('Saint Martin');
  });

  it('come with the numeric code, from ISO_N3 or ISO_N3_EH', () => {
    expect(countryNumeric({ ISO_N3: '004', ISO_N3_EH: '004' })).toBe('004');
    expect(countryNumeric({ ISO_N3: '-99', ISO_N3_EH: '250' })).toBe('250');
    expect(countryNumeric({ ISO_N3: '-99', ISO_N3_EH: '-99' })).toBeUndefined();
  });
});

describe('buildBasemap', () => {
  const { base, extras, report } = buildBasemap(SOURCES, { grid: 3600, subunitCountries: ['EST'] });
  const joined = joinExtras(base, extras);
  const geometries = (name: string, of = base): GeometryObject[] =>
    (of.objects[name] as GeometryCollection).geometries;

  it('writes countries with ids, names, numeric codes, continents and label points', () => {
    expect(geometries('countries').map((g) => [g.id, g.properties])).toEqual([
      ['WST', { name: 'West', n: '901', c: 'eu', ct: [5, 5] }],
      ['EST', { name: 'East', n: '902', c: 'as', ct: expect.any(Array) as unknown }],
    ]);
    const [x, y] = (geometries('countries')[1]?.properties as { ct: [number, number] }).ct;
    expect(x).toBeGreaterThan(10);
    expect(x).toBeLessThan(20);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(10);
    expect(report.movedLabels).toEqual(['East']);
    expect(report.withoutId).toEqual([]);
    expect(report.countries).toBe(2);
  });

  it('quantizes to a grid over the whole sphere', () => {
    expect(base.transform).toEqual({ scale: [0.1, 0.05], translate: [-180, -90] });
    expect(extras.transform).toEqual(base.transform);
    expect(base.bbox).toBeUndefined();
    expect(report.grid).toBe(3600);
    expect(report.maxDisplacementKm).toBeLessThan(0.001);
  });

  it('winds every polygon for d3, whatever the source did', () => {
    const shapes = [
      ...feature(base, base.objects['countries'] as GeometryCollection).features,
      feature(base, base.objects['land'] as TopoMultiPolygon),
      ...feature(joined, joined.objects['lakes'] as GeometryCollection).features,
      ...feature(joined, joined.objects['subunits'] as GeometryCollection).features,
    ];
    expect(shapes).toHaveLength(6);
    for (const { geometry } of shapes) {
      expect(polygonsOf(geometry as Polygon | MultiPolygon).every(isWoundForD3)).toBe(true);
    }
  });

  it('merges the countries into land without the border between them', () => {
    const land = feature(base, base.objects['land'] as TopoMultiPolygon).geometry;
    expect(land.type).toBe('MultiPolygon');
    expect(land.coordinates).toHaveLength(1);
    expect(land.coordinates[0]).toHaveLength(1);
    const countries = feature(base, base.objects['countries'] as GeometryCollection).features;
    const sum = countries.reduce((total, country) => total + geoArea(country), 0);
    expect(geoArea(land)).toBeCloseTo(sum, 10);
    // No vertex of the land's outline is on the inside of the border at lon 10.
    const inner = (land.coordinates[0]?.[0] ?? []).filter(
      ([x = 0, y = 0]) => x === 10 && y > 0 && y < 10,
    );
    expect(inner).toEqual([]);
  });

  it('keeps the subunits of the listed countries, on arcs of the base where they run along it', () => {
    expect(report.subunits).toBe(2);
    expect(geometries('subunits', extras).map((g) => [g.id, g.properties])).toEqual([
      ['S', { name: 'South', gu: 'EST', ct: [15, 2.5] }],
      ['N', { name: 'North', gu: 'EST', ct: [15, 7.5] }],
    ]);
    expect(extras.base).toBe(base.arcs.length);
    const refs = geometries('subunits', extras).flatMap((g) =>
      (g as { arcs: number[][] }).arcs.flat(),
    );
    const index = (ref: number): number => (ref < 0 ? ~ref : ref);
    expect(refs.some((ref) => index(ref) < extras.base)).toBe(true);
    expect(refs.some((ref) => index(ref) >= extras.base)).toBe(true);
    // Decoded over the joined arcs, the two provinces tile their country.
    const provinces = feature(joined, joined.objects['subunits'] as GeometryCollection).features;
    const east = feature(base, base.objects['countries'] as GeometryCollection).features[1];
    const area = provinces.reduce((total, province) => total + geoArea(province), 0);
    expect(area).toBeCloseTo(east ? geoArea(east) : NaN, 10);
  });

  it('refuses extras built against another base', () => {
    expect(() => joinExtras({ ...base, arcs: base.arcs.slice(1) }, extras)).toThrow(/another base/);
  });

  it('tags lakes with every scope they touch and cuts rivers at the border', () => {
    expect(geometries('lakes', extras).map((g) => g.properties)).toEqual([{ s: 'as eu' }]);
    expect(report.lakes).toBe(1);
    expect(geometries('rivers', extras).map((g) => g.properties)).toEqual([
      { s: 'as' },
      { s: 'eu' },
    ]);
    expect(report.rivers).toBe(2);
    const rivers = feature(joined, joined.objects['rivers'] as GeometryCollection).features;
    const ends = rivers.map((river) => {
      const line = (river.geometry as { coordinates: Position[][] }).coordinates[0] ?? [];
      return [line[0]?.[0], line[line.length - 1]?.[0]].map((x) => Math.round(x ?? NaN));
    });
    expect(ends).toEqual([
      [10, 18],
      [2, 10],
    ]);
  });

  it('drops what collapses on the grid and says so', () => {
    const speck: Feature = {
      type: 'Feature',
      properties: {
        ...SOURCES.countries.features[0]?.properties,
        NAME: 'Speck',
        ADM0_A3: 'SPK',
        ISO_A3: 'SPK',
      },
      geometry: rectangle(50, 50.001, [50, 50.001]),
    };
    const built = buildBasemap(
      { ...SOURCES, countries: collection([...SOURCES.countries.features, speck]) },
      { grid: 3600, subunitCountries: [] },
    );
    expect(built.report.countries).toBe(2);
    expect(built.report.droppedFeatures).toEqual(['Speck']);
    expect(built.report.droppedPolygons).toEqual({ countries: 1 });
    expect(built.extras.objects['subunits']).toMatchObject({ geometries: [] });
  });
});
