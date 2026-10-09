/**
 * The location lookup (backlog GEO3, GEO4): each `locationmode` against hand-made basemap layers
 * and GeoJSON, the country-name table, the point a feature is drawn at, the warning about
 * locations that match nothing, and the cache. One test reads the real 1:110m basemap.
 */
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBasemap } from '../basemap/index.ts';
import { countryNameToIso3, sanitize } from './country-names.ts';
import {
  featureCentroid,
  geojsonCoords,
  locate,
  locationsOf,
  usaStateCode,
  type LocationsRequest,
} from './locations.ts';
import type { BasemapLayers, CountryProperties, SubunitProperties } from './types.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/** A square of side `s` with its lower left corner at `(x, y)`. */
function square(x: number, y: number, s = 10): Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [x, y],
        [x, y + s],
        [x + s, y + s],
        [x + s, y],
        [x, y],
      ],
    ],
  };
}

function country(
  id: string,
  name: string,
  ct: [number, number],
): Feature<Polygon, CountryProperties> {
  return { type: 'Feature', id, properties: { name, ct }, geometry: square(ct[0] - 5, ct[1] - 5) };
}

function subunit(
  id: string,
  name: string,
  gu: string,
  ct: [number, number],
): Feature<Polygon, SubunitProperties> {
  return {
    type: 'Feature',
    id,
    properties: { name, gu, ct },
    geometry: square(ct[0] - 1, ct[1] - 1, 2),
  };
}

function layers(): BasemapLayers {
  return {
    countries: [
      country('FRA', 'France', [2, 47]),
      country('USA', 'United States of America', [-100, 40]),
      country('RUS', 'Russia', [100, 60]),
      country('KOR', 'South Korea', [128, 36]),
      country('CIV', 'Ivory Coast', [-5, 8]),
      country('CZE', 'Czechia', [15, 50]),
      country('COD', 'Dem. Rep. Congo', [23, -3]),
      country('VNM', 'Vietnam', [106, 16]),
    ],
    subunits: [
      subunit('WA', 'Western Australia', 'AUS', [122, -25]),
      subunit('CA', 'California', 'USA', [-120, 37]),
      subunit('WA', 'Washington', 'USA', [-120, 47]),
      subunit('NY', 'New York', 'USA', [-75, 43]),
      subunit('DC', 'District of Columbia', 'USA', [-77, 39]),
      subunit('BC', 'British Columbia', 'CAN', [-125, 54]),
    ],
  };
}

function request(
  locations: unknown[],
  locationmode: LocationsRequest['locationmode'] = 'ISO-3',
  rest: Partial<LocationsRequest> = {},
): LocationsRequest {
  return { locations, locationmode, featureidkey: 'id', label: 'test trace', ...rest };
}

const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('locationsOf', () => {
  it('reads the location attributes of a trace, and nothing without locations', () => {
    const locations = ['FRA'];
    const geojson = { type: 'FeatureCollection', features: [] };
    expect(
      locationsOf(
        {
          type: 'scattergeo',
          visible: true,
          locations,
          locationmode: 'geojson-id',
          geojson,
          featureidkey: 'properties.name',
        } as never,
        'trace 0',
      ),
    ).toEqual({
      locations,
      locationmode: 'geojson-id',
      geojson,
      featureidkey: 'properties.name',
      label: 'trace 0',
    });
    const iso = locationsOf({ type: 'scattergeo', visible: true, locations } as never);
    expect(iso).toMatchObject({ locationmode: 'ISO-3', featureidkey: 'id' });
    expect(iso!.locations).toBe(locations);
    expect(locationsOf({ type: 'scattergeo', visible: true, lon: [0] } as never)).toBeUndefined();
    expect(
      locationsOf({ type: 'scattergeo', visible: true, locations: [] } as never),
    ).toBeUndefined();
  });
});

describe("locate: 'ISO-3'", () => {
  it('matches country ids in any case, at the label point of the basemap', () => {
    const base = layers();
    const result = locate(request(['FRA', 'usa', ' Rus ', 'Kor']), { layers: base })!;
    expect(result.features.map((f) => f?.id)).toEqual(['FRA', 'USA', 'RUS', 'KOR']);
    expect(result.features[0]!.feature).toBe(base.countries![0]);
    expect(result.features[0]!.custom).toBe(false);
    expect(result.features[1]!.point).toEqual([-100, 40]);
    expect(Array.from(result.lon)).toEqual([2, -100, 100, 128]);
    expect(Array.from(result.lat)).toEqual([47, 40, 60, 36]);
    expect(result.unmatched).toEqual([]);
  });

  it('skips what matches nothing, and treats empty locations as gaps', () => {
    const warn = quiet();
    const result = locate(request(['FRA', 'XXX', null, '', undefined, NaN, 250, 'France']), {
      layers: layers(),
    })!;
    expect(result.features.map((f) => f?.id)).toEqual([
      'FRA',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(Array.from(result.lon)).toEqual([2, NaN, NaN, NaN, NaN, NaN, NaN, NaN]);
    expect(Array.from(result.lat)).toEqual([47, NaN, NaN, NaN, NaN, NaN, NaN, NaN]);
    // Gaps are not reported; a number and a name are not ISO-3 codes.
    expect(result.unmatched).toEqual(['XXX', '250', 'France']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('answers nothing while the basemap has no countries', () => {
    expect(locate(request(['FRA']), {})).toBeUndefined();
    expect(locate(request(['FRA']), { layers: {} })).toBeUndefined();
  });
});

describe("locate: 'USA-states'", () => {
  it('matches postal codes and state names against the subunits of the USA', () => {
    const base = layers();
    const result = locate(
      request(['CA', 'wa', 'New York', ' washington d.c. ', 'District of Columbia'], 'USA-states'),
      { layers: base },
    )!;
    expect(result.features.map((f) => f?.id)).toEqual(['CA', 'WA', 'NY', 'DC', 'DC']);
    // WA is Washington, not Western Australia, which comes first in the layer.
    expect(result.features[1]!.feature.properties).toMatchObject({ name: 'Washington' });
    expect(result.features[1]!.point).toEqual([-120, 47]);
    expect(result.features[3]).toBe(result.features[4]);
  });

  it('leaves out the subunits of other countries and names that are not states', () => {
    const warn = quiet();
    const result = locate(request(['BC', 'Ontario', 'USA', 'CA'], 'USA-states'), {
      layers: layers(),
    })!;
    expect(result.features.map((f) => f?.id)).toEqual([undefined, undefined, undefined, 'CA']);
    expect(result.unmatched).toEqual(['BC', 'Ontario', 'USA']);
    expect(warn.mock.calls[0]![0]).toMatch(/no US state of the base map/);
  });

  it('needs the extras: without subunits there is no answer', () => {
    const { countries } = layers();
    expect(locate(request(['CA'], 'USA-states'), { layers: { countries } })).toBeUndefined();
  });

  it('knows every state and the district by name', () => {
    expect(usaStateCode('California')).toBe('CA');
    expect(usaStateCode('  NEW mexico ')).toBe('NM');
    expect(usaStateCode('tx')).toBe('TX');
    expect(usaStateCode('Washington DC')).toBe('DC');
    expect(usaStateCode('Puerto Rico')).toBeUndefined();
    expect(usaStateCode('XX')).toBeUndefined();
  });
});

describe("locate: 'country names'", () => {
  it('resolves names through the table to the ids of the basemap', () => {
    const result = locate(
      request(
        [
          'United States',
          'USA',
          'Russia',
          'South Korea',
          'Côte d’Ivoire',
          'Ivory Coast',
          'Czechia',
          'DR Congo',
          'Viet Nam',
          'France',
        ],
        'country names',
      ),
      { layers: layers(), countryNames: countryNameToIso3 },
    )!;
    expect(result.features.map((f) => f?.id)).toEqual([
      'USA',
      'USA',
      'RUS',
      'KOR',
      'CIV',
      'CIV',
      'CZE',
      'COD',
      'VNM',
      'FRA',
    ]);
    expect(result.unmatched).toEqual([]);
  });

  it('reports a name that is no country, and a country the basemap does not have', () => {
    const warn = quiet();
    const result = locate(request(['Atlantis', 'Germany', 'France'], 'country names'), {
      layers: layers(),
      countryNames: countryNameToIso3,
    })!;
    expect(result.features.map((f) => f?.id)).toEqual([undefined, undefined, 'FRA']);
    expect(result.unmatched).toEqual(['Atlantis', 'Germany']);
    expect(warn.mock.calls[0]![0]).toMatch(
      /no country of the base map \(locationmode 'country names'\)/,
    );
  });

  it('answers nothing until the table is loaded', () => {
    expect(locate(request(['France'], 'country names'), { layers: layers() })).toBeUndefined();
  });
});

describe('the country-name table (country-iso-search 0.1.2)', () => {
  it('resolves names, historical and native names, and names with marks and punctuation', () => {
    const cases: Record<string, string> = {
      'United States': 'USA',
      'United States of America': 'USA',
      USA: 'USA',
      'the United States': 'USA',
      Russia: 'RUS',
      'Russian Federation': 'RUS',
      'South Korea': 'KOR',
      'Korea, Republic of': 'KOR',
      'Korea (the Republic of)': 'KOR',
      'North Korea': 'PRK',
      "Côte d'Ivoire": 'CIV',
      'Cote dIvoire': 'CIV',
      'Ivory Coast': 'CIV',
      Czechia: 'CZE',
      'Czech Republic': 'CZE',
      'DR Congo': 'COD',
      'Democratic Republic of the Congo': 'COD',
      Congo: 'COG',
      'Viet Nam': 'VNM',
      Vietnam: 'VNM',
      Burma: 'MMR',
      Türkiye: 'TUR',
      Turkey: 'TUR',
      'St. Kitts and Nevis': 'KNA',
      'Guinea-Bissau': 'GNB',
      Guinea: 'GIN',
      Niger: 'NER',
      Nigeria: 'NGA',
      'U.K.': 'GBR',
      'United Kingdom': 'GBR',
      '  france ': 'FRA',
      '🇯🇵': 'JPN',
      'Jammu and Kashmir': 'XJK',
      // Holochart's own record: the basemap has Kosovo under this id.
      Kosovo: 'XKX',
    };
    for (const [name, iso3] of Object.entries(cases)) {
      expect(countryNameToIso3(name), name).toBe(iso3);
    }
  });

  it('resolves ISO and UN M49 codes, as country-iso-search does', () => {
    expect(countryNameToIso3('fra')).toBe('FRA');
    expect(countryNameToIso3('FR')).toBe('FRA');
    expect(countryNameToIso3('250')).toBe('FRA');
    expect(countryNameToIso3('04')).toBe('AFG');
    expect(countryNameToIso3('0250')).toBe('FRA');
    expect(countryNameToIso3('xac')).toBe('XAC');
  });

  it('matches whole names only', () => {
    for (const name of ['Atlantis', 'Republic of Franc', 'Fran', 'ZZZ', 'ZZ', '999', '', '   ']) {
      expect(countryNameToIso3(name), name).toBeUndefined();
    }
  });

  it('sanitizes like country-iso-search', () => {
    expect(sanitize('Côte d’Ivoire')).toBe('cote divoire');
    expect(sanitize('St. Kitts & Nevis')).toBe('saint kitts and nevis');
    expect(sanitize('Korea (the Republic of)')).toBe('korea republic of');
    expect(sanitize('The  Guinea–Bissau [x]')).toBe('guinea bissau x');
  });

  it('gives codes the real 1:110m basemap has countries for', async () => {
    const { countries } = await loadBasemap(110, 'world');
    const ids = new Set(countries!.map((f) => f.id));
    const names = [
      'United States',
      'Russia',
      'South Korea',
      'North Korea',
      'Ivory Coast',
      'Czechia',
      'DR Congo',
      'Congo',
      'Viet Nam',
      'France',
      'Norway',
      'United Kingdom',
      'Türkiye',
      'Bolivia',
      'Iran',
      'Syria',
      'Tanzania',
      'Laos',
      'Brunei',
      'Eswatini',
      'North Macedonia',
      'Palestine',
      'Taiwan',
      'Antarctica',
      'Kosovo',
    ];
    const missing = names.filter((name) => !ids.has(countryNameToIso3(name)));
    expect(missing).toEqual([]);
    // Every country of the basemap is known to the table by its id.
    const unknown = countries!
      .map((f) => String(f.id))
      .filter((id) => /^[A-Z]{3}$/.test(id) && countryNameToIso3(id) !== id);
    expect(unknown).toEqual([]);
    // And the lookup finds them where the basemap labels them.
    const result = locate(request(names, 'country names'), {
      layers: { countries },
      countryNames: countryNameToIso3,
    })!;
    expect(result.unmatched).toEqual([]);
    expect(result.features.every((f) => f && Number.isFinite(f.point[0]))).toBe(true);
  });
});

describe("locate: 'geojson-id'", () => {
  const counties = () => ({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: '01001',
        properties: { name: 'Autauga', fips: 1001 },
        geometry: square(0, 0),
      },
      { type: 'Feature', id: 7, properties: { name: 'Seven' }, geometry: square(20, 20, 4) },
      {
        type: 'Feature',
        id: 'multi',
        properties: { name: 'Islands', meta: { code: 'isl' } },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [square(100, 0, 1).coordinates, square(40, 40, 20).coordinates],
        } satisfies MultiPolygon,
      },
      {
        type: 'Feature',
        id: 'point',
        properties: { name: 'A point' },
        geometry: { type: 'Point', coordinates: [1, 1] },
      },
      // A second feature of an id that is taken: the first one stands.
      { type: 'Feature', id: '01001', properties: { name: 'Again' }, geometry: square(60, 60) },
    ],
  });

  it('matches feature ids, strings and numbers alike, at the vertex mean of the feature', () => {
    const geojson = counties();
    const result = locate(request(['01001', 7, '7', 'multi'], 'geojson-id'), { geojson })!;
    expect(result.features.map((f) => f?.id)).toEqual(['01001', '7', '7', 'multi']);
    expect(result.features[0]!.feature).toBe(geojson.features[0]);
    expect(result.features[0]!.custom).toBe(true);
    expect(result.features[1]).toBe(result.features[2]);
    expect(result.features[0]!.point).toEqual([5, 5]);
    expect(result.features[1]!.point).toEqual([22, 22]);
    // The larger polygon of the MultiPolygon.
    expect(result.features[3]!.point).toEqual([50, 50]);
    expect(Array.from(result.lon)).toEqual([5, 22, 22, 50]);
  });

  it('matches a nested `featureidkey`', () => {
    quiet();
    const geojson = counties();
    const byName = locate(
      request(['Autauga', 'Islands', 'Seven'], 'geojson-id', { featureidkey: 'properties.name' }),
      { geojson },
    )!;
    expect(byName.features.map((f) => f?.feature.id)).toEqual(['01001', 'multi', 7]);
    const byCode = locate(
      request(['isl', 1001], 'geojson-id', { featureidkey: 'properties.meta.code' }),
      { geojson },
    );
    expect(byCode!.features.map((f) => f?.feature.id)).toEqual(['multi', undefined]);
    const byFips = locate(request([1001], 'geojson-id', { featureidkey: 'properties.fips' }), {
      geojson,
    })!;
    expect(byFips.features[0]!.id).toBe('1001');
  });

  it('takes a single Feature, and reports features that are not areas', () => {
    const warn = quiet();
    const feature = counties().features[0]!;
    expect(
      locate(request(['01001'], 'geojson-id'), { geojson: feature })!.features[0]!.feature,
    ).toBe(feature);
    const result = locate(request(['point', 'nowhere', '01001'], 'geojson-id'), {
      geojson: counties(),
    })!;
    expect(result.unmatched).toEqual(['point', 'nowhere']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(
      '[holochart] test trace: 2 locations match no Polygon or MultiPolygon feature of `geojson` ' +
        `at 'id' (locationmode 'geojson-id') and are not drawn: "point", "nowhere".`,
    );
  });

  it('matches nothing in a geojson that is not a FeatureCollection or a Feature, and says so', () => {
    const warn = quiet();
    const result = locate(request(['a'], 'geojson-id'), { geojson: square(0, 0) })!;
    expect(result.features).toEqual([undefined]);
    expect(result.unmatched).toEqual(['a']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(
      /`geojson` is neither a FeatureCollection nor a Feature/,
    );
  });

  it('answers nothing while the geojson is not an object (a URL still loading)', () => {
    expect(locate(request(['a'], 'geojson-id'), {})).toBeUndefined();
    expect(locate(request(['a'], 'geojson-id'), { geojson: 'https://x/y.json' })).toBeUndefined();
    // The basemap is not what a 'geojson-id' trace is matched against.
    expect(locate(request(['FRA'], 'geojson-id'), { layers: layers() })).toBeUndefined();
  });
});

describe('featureCentroid (plotly.js findCentroid)', () => {
  it('is the mean of the vertices, holes included, closing coordinates left out', () => {
    const withHole: Polygon = {
      type: 'Polygon',
      coordinates: [
        square(0, 0, 10).coordinates[0]!,
        // A hole off centre pulls the mean towards it.
        [
          [6, 6],
          [8, 6],
          [8, 8],
          [6, 8],
          [6, 6],
        ],
      ],
    };
    expect(featureCentroid(withHole)).toEqual([6, 6]);
    // Not the centre of area: three vertices on one side outweigh one on the other.
    expect(
      featureCentroid({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 1],
            [10, 2],
            [0, 0],
          ],
        ],
      }),
    ).toEqual([7.5, 0.75]);
  });

  it('takes the polygon with the largest area, whichever way it is wound', () => {
    const small = square(0, 0, 2).coordinates;
    const large = square(50, 50, 10).coordinates;
    const reversed = [[...large[0]!].reverse()];
    expect(featureCentroid({ type: 'MultiPolygon', coordinates: [small, large] })).toEqual([
      55, 55,
    ]);
    expect(featureCentroid({ type: 'MultiPolygon', coordinates: [reversed, small] })).toEqual([
      55, 55,
    ]);
  });

  it('is NaN for a geometry without a polygon that has an area', () => {
    expect(featureCentroid({ type: 'MultiPolygon', coordinates: [] })).toEqual([NaN, NaN]);
    expect(featureCentroid({ type: 'Polygon', coordinates: [] })).toEqual([NaN, NaN]);
    // A collapsed ring measures nothing.
    const line = [
      [
        [0, 0],
        [1, 1],
        [0, 0],
      ],
    ];
    expect(featureCentroid({ type: 'MultiPolygon', coordinates: [line] })).toEqual([NaN, NaN]);
    const warn = quiet();
    const geojson = {
      type: 'Feature',
      id: 'flat',
      properties: null,
      geometry: { type: 'MultiPolygon', coordinates: [line] },
    };
    const result = locate(request(['flat'], 'geojson-id'), { geojson })!;
    // The feature is matched (a choropleth can still try to fill it) but has no point.
    expect(result.features[0]!.id).toBe('flat');
    expect(Array.from(result.lon)).toEqual([NaN]);
    expect(Array.from(result.lat)).toEqual([NaN]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('geojsonCoords (plotly.js coordsOf)', () => {
  it('lists every coordinate of collections, features and geometries', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 2] } },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'GeometryCollection',
            geometries: [
              {
                type: 'LineString',
                coordinates: [
                  [3, 4],
                  [5, 6],
                ],
              },
              { type: 'MultiPolygon', coordinates: [square(10, 10, 1).coordinates] },
            ],
          },
        },
        { type: 'Feature', properties: {}, geometry: null },
      ],
    };
    const coords = geojsonCoords(geojson);
    expect(coords).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [10, 10],
      [10, 11],
      [11, 11],
      [11, 10],
      [10, 10],
    ]);
    // Once per object.
    expect(geojsonCoords(geojson)).toBe(coords);
    expect(geojsonCoords({ type: 'Sphere' })).toEqual([]);
    expect(geojsonCoords(undefined)).toEqual([]);
    expect(geojsonCoords('https://x/y.json')).toEqual([]);
  });
});

describe('locate: the warning and the cache', () => {
  it('names the unmatched locations once, the first ten of a long list', () => {
    const warn = quiet();
    const base = layers();
    const locations = ['FRA', ...Array.from({ length: 13 }, (_, i) => `N${i}`), 'N0', 'N1'];
    const req = request(locations);
    const first = locate(req, { layers: base })!;
    expect(first.unmatched).toHaveLength(13);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(
      '[holochart] test trace: 13 locations match no country of the base map by its ISO-3 code ' +
        `(locationmode 'ISO-3') and are not drawn: "N0", "N1", "N2", "N3", "N4", "N5", "N6", ` +
        '"N7", "N8", "N9", and 3 more.',
    );
    // Every later layout pass asks again: the same answer, and no second warning.
    expect(locate(req, { layers: base })).toBe(first);
    expect(locate({ ...req, label: 'another trace' }, { layers: base })).toBe(first);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('says it of one location in the singular', () => {
    const warn = quiet();
    locate(request(['FRA', 'XXX']), { layers: layers() });
    expect(warn.mock.calls[0]![0]).toMatch(
      /: 1 location matches no country .* and is not drawn: "XXX"\.$/,
    );
  });

  it('caches by the locations array, the mode, the features and the id key', () => {
    quiet();
    const base = layers();
    const locations = ['FRA', 'USA'];
    const iso = locate(request(locations), { layers: base })!;
    // The same layers through another object with the same countries.
    expect(locate(request(locations), { layers: { countries: base.countries } })).toBe(iso);
    // Another array with the same content is computed again, to the same features.
    const copy = locate(request([...locations]), { layers: base })!;
    expect(copy).not.toBe(iso);
    expect(copy.features[0]).toBe(iso.features[0]);
    // Another mode, and another basemap.
    const names = locate(request(locations, 'country names'), {
      layers: base,
      countryNames: countryNameToIso3,
    })!;
    expect(names).not.toBe(iso);
    expect(names.features[0]).toBe(iso.features[0]);
    const other = layers();
    const swapped = locate(request(locations), { layers: other })!;
    expect(swapped).not.toBe(iso);
    expect(swapped.features[0]!.feature).toBe(other.countries![0]);
    // The first answer is still there for the first basemap.
    expect(locate(request(locations), { layers: base })).toBe(iso);

    const geojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', id: 'FRA', properties: { name: 'USA' }, geometry: square(0, 0) },
      ],
    };
    const byId = locate(request(locations, 'geojson-id'), { geojson })!;
    const byName = locate(request(locations, 'geojson-id', { featureidkey: 'properties.name' }), {
      geojson,
    })!;
    expect(byId.features.map((f) => f?.id)).toEqual(['FRA', undefined]);
    expect(byName.features.map((f) => f?.id)).toEqual([undefined, 'USA']);
    expect(locate(request(locations, 'geojson-id'), { geojson })).toBe(byId);
    expect(locate(request(locations, 'geojson-id'), { geojson: { ...geojson } })).not.toBe(byId);
  });

  it('takes typed arrays of ids', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', id: 3, properties: {}, geometry: square(0, 0) }],
    };
    const warn = quiet();
    const result = locate(request(new Int32Array([3, 4]) as never, 'geojson-id'), { geojson })!;
    expect(result.features.map((f) => f?.id)).toEqual(['3', undefined]);
    expect(result.unmatched).toEqual(['4']);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
