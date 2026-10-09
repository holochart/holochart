/**
 * The bundled basemap data as the loader decodes it (ADR-024): winding, ids, label points,
 * scopes and the derived line layers, at both resolutions. These read the checked-in modules of
 * `generated/`; `tools/geo-data` has the tests of the build itself.
 */
import { geoArea, geoContains } from 'd3-geo';
import type { MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BasemapLayers, GeoResolution, GeoScope } from '../geo/types.ts';
import { loadBasemap } from './index.ts';

const TAU = 2 * Math.PI;
const RESOLUTIONS: GeoResolution[] = [110, 50];
const SCOPES: GeoScope[] = [
  'world',
  'usa',
  'europe',
  'asia',
  'africa',
  'north america',
  'south america',
  'antarctica',
  'oceania',
];

/** Features Natural Earth has no ISO 3166-1 code for; they have no id (tools/geo-data README). */
const WITHOUT_ID: Record<GeoResolution, string[]> = {
  110: ['Northern Cyprus', 'Somaliland'],
  50: [
    'Ashmore and Cartier Islands',
    'Indian Ocean Territories',
    'Northern Cyprus',
    'Siachen Glacier',
    'Somaliland',
  ],
};

function polygonsOf(geometry: Polygon | MultiPolygon): Position[][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

/** Area on the sphere of a ring taken as a polygon of its own. */
function ringArea(ring: Position[]): number {
  return geoArea({ type: 'Polygon', coordinates: [ring] });
}

/**
 * A polygon wound for d3 covers less than a hemisphere; one wound the other way is the globe
 * without itself. Ring by ring: the first is the outer ring, the rest are holes.
 */
function expectWound(geometry: Polygon | MultiPolygon, what: string): void {
  for (const polygon of polygonsOf(geometry)) {
    const area = geoArea({ type: 'Polygon', coordinates: polygon });
    if (!(area < TAU)) throw new Error(`${what}: a polygon covers ${area} sr`);
    polygon.forEach((ring, index) => {
      if (ringArea(ring) < TAU !== (index === 0)) {
        throw new Error(`${what}: ring ${index} is wound the wrong way`);
      }
    });
  }
}

/** The segments of a multiline as direction-free keys. */
function segments(lines: MultiLineString): Set<string> {
  const out = new Set<string>();
  for (const line of lines.coordinates) {
    for (let i = 1; i < line.length; i++) {
      const a = String(line[i - 1]);
      const b = String(line[i]);
      out.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
  }
  return out;
}

function ids(layers: BasemapLayers): string[] {
  return (layers.countries ?? []).flatMap((country) =>
    country.id === undefined ? [] : [`${country.id}`],
  );
}

describe.each(RESOLUTIONS)('bundled basemap at 1:%im', (resolution) => {
  const byScope = new Map<GeoScope, BasemapLayers>();
  const layersOf = (scope: GeoScope): BasemapLayers => {
    const layers = byScope.get(scope);
    if (!layers) throw new Error(`no layers for ${scope}`);
    return layers;
  };

  beforeAll(async () => {
    for (const scope of SCOPES) {
      byScope.set(scope, await loadBasemap(resolution, scope, { extras: true }));
    }
  });

  it('winds every polygon for d3', () => {
    for (const scope of SCOPES) {
      const layers = layersOf(scope);
      for (const country of layers.countries ?? []) {
        expectWound(country.geometry, `${scope} ${country.properties.name}`);
      }
      for (const subunit of layers.subunits ?? []) {
        expectWound(subunit.geometry, `${scope} ${subunit.properties.name}`);
      }
      if (layers.land) expectWound(layers.land, `${scope} land`);
      if (layers.lakes) expectWound(layers.lakes, `${scope} lakes`);
    }
  });

  it('has land the size of the land', () => {
    const land = layersOf('world').land;
    expect(land).toBeDefined();
    // 29 % of the sphere, give or take the generalization.
    const share = geoArea(land as MultiPolygon) / (2 * TAU);
    expect(share).toBeGreaterThan(0.28);
    expect(share).toBeLessThan(0.3);
  });

  it('gives countries unique ISO 3166-1 alpha-3 ids, but for the documented exceptions', () => {
    const countries = layersOf('world').countries ?? [];
    const withId = ids(layersOf('world'));
    expect(withId.every((id) => /^[A-Z]{3}$/.test(id))).toBe(true);
    expect(new Set(withId).size).toBe(withId.length);
    const without = countries.filter((c) => c.id === undefined).map((c) => c.properties.name);
    expect(without.sort()).toEqual(WITHOUT_ID[resolution]);
    for (const id of ['FRA', 'NOR', 'USA', 'XKX', 'PSE', 'SSD', 'ESH'])
      expect(withId).toContain(id);
    const france = countries.find((country) => country.id === 'FRA');
    expect(france?.properties).toMatchObject({ name: 'France', n: '250' });
    // Kosovo's id is user-assigned, so it has no ISO numeric code to go with it.
    expect(countries.find((country) => country.id === 'XKX')?.properties.n).toBeUndefined();
  });

  it('puts every label point inside its feature', () => {
    const world = layersOf('world');
    for (const feature of [...(world.countries ?? []), ...(world.subunits ?? [])]) {
      const { ct, name } = feature.properties;
      if (!geoContains(feature, ct)) throw new Error(`${name}: ${String(ct)} is outside`);
    }
  });

  it('shows only the United States and its states in the usa scope', () => {
    const usa = layersOf('usa');
    expect(ids(usa)).toEqual(['USA']);
    const states = usa.subunits ?? [];
    expect(states).toHaveLength(51);
    expect(states.every((state) => state.properties.gu === 'USA')).toBe(true);
    const postal = states.map((state) => state.id);
    expect(new Set(postal).size).toBe(51);
    for (const id of ['CA', 'TX', 'AK', 'HI', 'DC']) expect(postal).toContain(id);
    const california = states.find((state) => state.id === 'CA');
    expect(california?.properties.name).toBe('California');
    expect(usa.subunitBorders?.coordinates.length).toBeGreaterThan(0);
    expect(usa.borders).toBeUndefined();
  });

  it.each([
    ['europe', ['FRA', 'DEU', 'RUS', 'ISL', 'GBR'], ['TUR', 'MAR', 'USA', 'GRL', 'KAZ']],
    ['asia', ['CHN', 'IND', 'JPN', 'TUR', 'KAZ', 'IDN'], ['RUS', 'EGY', 'AUS', 'PNG']],
    ['africa', ['EGY', 'ZAF', 'NGA', 'MDG'], ['ESP', 'SAU', 'YEM']],
    ['north america', ['USA', 'CAN', 'MEX', 'GRL', 'CUB', 'PAN'], ['COL', 'ISL', 'RUS']],
    ['south america', ['BRA', 'ARG', 'COL', 'CHL'], ['PAN', 'MEX', 'TTO']],
    ['oceania', ['AUS', 'NZL', 'PNG', 'FJI'], ['IDN', 'PHL', 'ATA']],
    ['antarctica', ['ATA'], ['ARG', 'AUS', 'ZAF']],
  ] as [GeoScope, string[], string[]][])('scopes %s by continent', (scope, has, hasNot) => {
    const found = ids(layersOf(scope));
    for (const id of has) expect(found).toContain(id);
    for (const id of hasNot) expect(found).not.toContain(id);
    expect(found.length).toBeLessThan(ids(layersOf('world')).length);
  });

  it('keeps a scoped country to the polygons inside the scope box', () => {
    const lonOf = (scope: GeoScope): number[] => {
      const france = layersOf(scope).countries?.find((country) => country.id === 'FRA');
      if (!france) throw new Error('no France');
      return polygonsOf(france.geometry).flatMap((polygon) =>
        (polygon[0] ?? []).map((position) => position[0] ?? 0),
      );
    };
    // French Guiana is part of France in Natural Earth; it is in the world, not in Europe.
    expect(Math.min(...lonOf('world'))).toBeLessThan(-50);
    expect(Math.min(...lonOf('europe'))).toBeGreaterThan(-10);
  });

  it('derives coastlines and borders that share no segment', () => {
    for (const scope of SCOPES) {
      const layers = layersOf(scope);
      expect(layers.land?.coordinates.length, scope).toBeGreaterThan(0);
      expect(layers.coastlines?.coordinates.length, scope).toBeGreaterThan(0);
      if (!layers.borders || !layers.coastlines) continue;
      const coast = segments(layers.coastlines);
      for (const segment of segments(layers.borders)) {
        if (coast.has(segment)) throw new Error(`${scope}: border segment ${segment} is coast`);
      }
    }
    for (const scope of ['world', 'europe', 'asia', 'africa', 'north america'] as GeoScope[]) {
      expect(layersOf(scope).borders?.coordinates.length, scope).toBeGreaterThan(0);
    }
  });

  it('has lakes and rivers in the world and in the scopes they lie in', () => {
    const world = layersOf('world');
    const count = (scope: GeoScope, layer: 'lakes' | 'rivers'): number =>
      layersOf(scope)[layer]?.coordinates.length ?? 0;
    expect(count('world', 'lakes')).toBeGreaterThan(0);
    expect(count('world', 'rivers')).toBeGreaterThan(0);
    for (const scope of ['usa', 'africa', 'asia', 'north america'] as GeoScope[]) {
      expect(count(scope, 'lakes'), scope).toBeGreaterThan(0);
      expect(count(scope, 'lakes'), scope).toBeLessThan(count('world', 'lakes'));
      expect(count(scope, 'rivers'), scope).toBeGreaterThan(0);
    }
    expect(count('usa', 'lakes')).toBeLessThanOrEqual(count('north america', 'lakes'));
    expect(world.subunits?.length).toBeGreaterThanOrEqual(51);
    // No subunit border runs along a coast or a country border.
    if (world.subunitBorders && world.coastlines && world.borders) {
      const outline = new Set([...segments(world.coastlines), ...segments(world.borders)]);
      for (const segment of segments(world.subunitBorders))
        expect(outline.has(segment)).toBe(false);
    }
  });

  it('leaves the extras out unless they are asked for', async () => {
    const base = await loadBasemap(resolution, 'world');
    expect(base.countries?.length).toBe(layersOf('world').countries?.length);
    expect(base.lakes).toBeUndefined();
    expect(base.rivers).toBeUndefined();
    expect(base.subunits).toBeUndefined();
    expect(base.subunitBorders).toBeUndefined();
  });
});

describe('bundled basemap, across resolutions', () => {
  it('has more countries and more detail at 1:50m', async () => {
    const coarse = await loadBasemap(110, 'world', { extras: true });
    const fine = await loadBasemap(50, 'world', { extras: true });
    expect(coarse.countries).toHaveLength(177);
    expect(fine.countries).toHaveLength(242);
    // The smallest countries survive the grid.
    for (const id of ['VAT', 'MCO', 'TUV', 'NRU']) expect(ids(fine)).toContain(id);
    expect(fine.subunits?.length).toBe(100);
    expect(coarse.subunits?.length).toBe(51);
    const vertices = (layers: BasemapLayers): number =>
      (layers.land?.coordinates ?? []).reduce((sum, polygon) => sum + (polygon[0]?.length ?? 0), 0);
    expect(vertices(fine)).toBeGreaterThan(5 * vertices(coarse));
  });
});
