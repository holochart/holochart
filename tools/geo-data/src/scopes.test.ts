import type { Feature, Position } from 'geojson';
import { describe, expect, it } from 'vitest';
import { countryCodes, countryLocator, polygonCodes, splitByScope } from './scopes.ts';

function country(adm0: string, continent: string, x0: number, x1: number): Feature {
  return {
    type: 'Feature',
    properties: { ADM0_A3: adm0, CONTINENT: continent },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x0, 0],
          [x0, 10],
          [x1, 10],
          [x1, 0],
          [x0, 0],
        ],
      ],
    },
  };
}

// Canada-like and US-like neighbours, an island state of no continent, and a gap of sea at 20..22.
const countries = [
  country('CAN', 'North America', 0, 10),
  country('USA', 'North America', 10, 20),
  country('MEX', 'South America', 22, 30),
  country('SEA', 'Seven seas (open ocean)', 40, 41),
];
const locate = countryLocator(countries);

describe('scope codes', () => {
  it('are the continent, and `us` for the United States', () => {
    expect(countryCodes({ ADM0_A3: 'FRA', CONTINENT: 'Europe' })).toBe('eu');
    expect(countryCodes({ ADM0_A3: 'USA', CONTINENT: 'North America' })).toBe('na us');
    expect(countryCodes({ ADM0_A3: 'ATF', CONTINENT: 'Seven seas (open ocean)' })).toBe('');
  });

  it('are looked up by position', () => {
    expect(locate([5, 5])).toBe('na');
    expect(locate([15, 5])).toBe('na us');
    expect(locate([25, 5])).toBe('sa');
    expect(locate([21, 5])).toBe('');
    expect(locate([40.5, 5])).toBe('');
    expect(locate([5, 50])).toBe('');
  });

  it('of a polygon are those of every country its outline touches', () => {
    const lake: Position[][] = [
      [
        [8, 4],
        [8, 6],
        [12, 6],
        [12, 4],
        [8, 4],
      ],
    ];
    expect(polygonCodes(lake, locate)).toBe('na us');
    expect(
      polygonCodes(
        [
          [
            [2, 2],
            [2, 3],
            [3, 3],
            [2, 2],
          ],
        ],
        locate,
      ),
    ).toBe('na');
    expect(
      polygonCodes(
        [
          [
            [60, 2],
            [60, 3],
            [61, 3],
            [60, 2],
          ],
        ],
        locate,
      ),
    ).toBe('');
  });
});

describe('splitByScope', () => {
  it('cuts a line on the border it crosses', () => {
    const stretches = splitByScope(
      [
        [2, 5],
        [8, 5],
        [14, 5],
        [18, 5],
      ],
      locate,
    );
    expect(stretches.map((stretch) => stretch.codes)).toEqual(['na', 'na us']);
    const [north, south] = stretches;
    expect(north?.line).toHaveLength(3);
    expect(south?.line).toHaveLength(3);
    // Both stretches end on the border, at lon 10.
    expect(north?.line[2]?.[0]).toBeCloseTo(10, 4);
    expect(south?.line[0]).toEqual(north?.line[2]);
  });

  it('leaves a line within one country whole', () => {
    const line: Position[] = [
      [11, 1],
      [15, 5],
      [19, 9],
    ];
    expect(splitByScope(line, locate)).toEqual([{ codes: 'na us', line }]);
  });

  it('gives vertices at sea to the stretch they follow, or the one they lead into', () => {
    // Out of the US, across the strait at 20..22, into the southern neighbour.
    const crossing = splitByScope(
      [
        [18, 5],
        [21, 5],
        [25, 5],
      ],
      locate,
    );
    expect(crossing.map((stretch) => stretch.codes)).toEqual(['na us', 'sa']);
    // The cut is on the far coast: the sea stays with the side the line left.
    expect(crossing[0]?.line[2]?.[0]).toBeCloseTo(22, 4);
    // A line that starts at sea belongs to the country it reaches.
    expect(
      splitByScope(
        [
          [21, 5],
          [25, 5],
        ],
        locate,
      ).map((stretch) => stretch.codes),
    ).toEqual(['sa']);
    // A line wholly at sea is in no scope but the world.
    expect(
      splitByScope(
        [
          [60, 5],
          [61, 5],
        ],
        locate,
      ).map((stretch) => stretch.codes),
    ).toEqual(['']);
  });
});
