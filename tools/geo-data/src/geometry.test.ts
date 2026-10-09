import { geoArea, geoContains } from 'd3-geo';
import { geoStitch } from 'd3-geo-projection';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import { describe, expect, it } from 'vitest';
import {
  alignAntimeridian,
  ANTIMERIDIAN_TOLERANCE,
  fromGrid,
  isWoundForD3,
  labelPoint,
  planarContains,
  ringArea,
  snapLine,
  snapPolygon,
  snapRing,
  toGrid,
  windForD3,
} from './geometry.ts';

/** A square ring wound as RFC 7946 has outer rings: counterclockwise. */
function square(x0: number, y0: number, size: number): Position[] {
  return [
    [x0, y0],
    [x0 + size, y0],
    [x0 + size, y0 + size],
    [x0, y0 + size],
    [x0, y0],
  ];
}

describe('winding', () => {
  it('reverses an outer ring wound as RFC 7946 and leaves one wound for d3', () => {
    const rfc = square(0, 0, 10);
    // Wound the RFC way, the ring encloses the globe without the square.
    expect(ringArea(rfc)).toBeGreaterThan(2 * Math.PI);
    expect(isWoundForD3([rfc])).toBe(false);
    const [outer] = windForD3([rfc]);
    expect(outer).toEqual(rfc.slice().reverse());
    expect(ringArea(outer ?? [])).toBeLessThan(0.1);
    expect(windForD3([outer ?? []])[0]).toBe(outer);
  });

  it('winds holes the other way from their outer ring', () => {
    const outer = square(0, 0, 10).reverse();
    const holeLikeOuter = square(4, 4, 2).reverse();
    expect(isWoundForD3([outer, holeLikeOuter])).toBe(false);
    const wound = windForD3([outer, holeLikeOuter]);
    expect(wound[0]).toBe(outer);
    expect(wound[1]).toEqual(square(4, 4, 2));
    expect(isWoundForD3(wound)).toBe(true);
  });
});

describe('snapping to the grid', () => {
  const moved = { maxKm: 0 };

  it('maps the sphere onto 0..n both ways', () => {
    expect(toGrid([-180, -90], 1e4)).toEqual([0, 0]);
    expect(toGrid([180, 90], 1e4)).toEqual([1e4, 1e4]);
    expect(toGrid([0, 0], 1e4)).toEqual([5000, 5000]);
    const [lon, lat] = fromGrid(toGrid([12.3456, -45.6789], 1e4), 1e4);
    expect(Math.abs(lon - 12.3456)).toBeLessThanOrEqual(0.018);
    expect(Math.abs(lat + 45.6789)).toBeLessThanOrEqual(0.009);
  });

  it('drops repeated grid points and records the largest move', () => {
    const displacement = { maxKm: 0 };
    const line = snapLine(
      [
        [0, 0],
        [0.001, 0.001],
        [1, 1],
      ],
      1e4,
      displacement,
    );
    expect(line).toEqual([
      [5000, 5000],
      [5028, 5056],
    ]);
    // Half a cell diagonal at the equator is 2.2 km on a 1e4 grid.
    expect(displacement.maxKm).toBeGreaterThan(0);
    expect(displacement.maxKm).toBeLessThan(2.3);
    expect(
      snapLine(
        [
          [0, 0],
          [0.001, 0.001],
        ],
        1e4,
        displacement,
      ),
    ).toBeUndefined();
  });

  it('drops a ring that collapses to a point or a line', () => {
    expect(snapRing(square(0, 0, 0.001), 1e4, moved)).toBeUndefined();
    // Four distinct grid points in a row are still no area.
    const sliver: Position[] = [
      [0, 0],
      [1, 0.001],
      [2, 0],
      [3, 0.001],
      [0, 0],
    ];
    expect(snapRing(sliver, 1e4, moved)).toBeUndefined();
    expect(snapRing(square(0, 0, 1), 1e4, moved)).toHaveLength(5);
  });

  it('keeps a ring that crosses the antimeridian', () => {
    const ring: Position[] = [
      [179, 0],
      [-179, 0],
      [-179, 1],
      [179, 1],
      [179, 0],
    ];
    expect(snapRing(ring, 1e4, moved)).toHaveLength(5);
  });

  it('drops a polygon with its outer ring, and only the holes that collapse', () => {
    expect(snapPolygon([square(0, 0, 0.001), square(0, 0, 0.0001)], 1e4, moved)).toBeUndefined();
    const polygon = snapPolygon(
      [square(0, 0, 10), square(1, 1, 0.001), square(5, 5, 1)],
      1e4,
      moved,
    );
    expect(polygon).toHaveLength(2);
  });
});

describe('alignAntimeridian', () => {
  /**
   * An island across the antimeridian as Natural Earth has Taveuni at 1:50m: two halves, wound
   * for d3, whose ends on the cut differ in the fourth decimal, the western one with a vertex
   * beside the antimeridian and its ring starting on it.
   */
  const island: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [180, -16.963086],
          [179.928, -17.0],
          [179.89, -16.96],
          [179.93, -16.87],
          [180, -16.785742],
          [179.999219, -16.858789],
          [180, -16.963086],
        ],
      ],
      [
        [
          [-180, -16.785547],
          [-179.89, -16.7],
          [-179.82, -16.77],
          [-179.87, -16.85],
          [-180, -16.962988],
          [-180, -16.907813],
          [-179.999951, -16.858789],
          [-180, -16.785547],
        ],
      ],
    ],
  };

  /** Edges of the geometry's rings that run along ±180° for some length. */
  function edgesAlongCut(geometry: MultiPolygon): number {
    let count = 0;
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        for (let i = 1; i < ring.length; i++) {
          const [x0 = 0, y0 = 0] = ring[i - 1] as Position;
          const [x1 = 0, y1 = 0] = ring[i] as Position;
          if (Math.abs(x0) === 180 && Math.abs(x1) === 180 && y0 !== y1) count++;
        }
      }
    }
    return count;
  }

  it('lets geoStitch join two halves whose cut does not meet to the digit', () => {
    // As Natural Earth has them, the halves stay apart, each with its side along the cut.
    const apart = geoStitch(island);
    expect(apart.coordinates).toHaveLength(2);
    expect(edgesAlongCut(apart)).toBeGreaterThan(0);

    const joined = geoStitch(alignAntimeridian(island));
    expect(joined.coordinates).toHaveLength(1);
    expect(joined.coordinates[0]).toHaveLength(1);
    expect(edgesAlongCut(joined)).toBe(0);
    // The same island: the area of the two halves (to the hundred metres the cut moved by), and
    // both shores.
    expect(Math.abs(geoArea(joined) / geoArea(island) - 1)).toBeLessThan(5e-3);
    expect(geoContains(joined, [179.95, -16.9])).toBe(true);
    expect(geoContains(joined, [-179.9, -16.8])).toBe(true);
    expect(geoContains(joined, [179.5, -16.9])).toBe(false);
  });

  it('puts vertices beside the antimeridian on it, and near latitudes on one', () => {
    const aligned = alignAntimeridian(island);
    const cut = aligned.coordinates
      .flat(2)
      .filter((position) => Math.abs(position[0] as number) > 179.99);
    expect(cut.every((position) => Math.abs(position[0] as number) === 180)).toBe(true);
    expect(new Set(cut.map((position) => position[1])).size).toBe(4);
    // No ring starts on the cut any more, and every ring is still closed.
    for (const [ring] of aligned.coordinates) {
      expect(Math.abs(ring?.[0]?.[0] as number)).toBeLessThan(180);
      expect(ring?.[ring.length - 1]).toEqual(ring?.[0]);
    }
  });

  it('leaves alone what is not near the antimeridian, and cuts further apart than the tolerance', () => {
    const inland: MultiPolygon = { type: 'MultiPolygon', coordinates: [[square(10, 10, 5)]] };
    expect(alignAntimeridian(inland)).toBe(inland);
    const far: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [179, 0],
            [180, 0],
            [180, 1],
            [179, 1],
            [179, 0],
          ],
        ],
        [
          [
            [-179, 0 + 3 * ANTIMERIDIAN_TOLERANCE],
            [-179, 1],
            [-180, 1],
            [-180, 0 + 3 * ANTIMERIDIAN_TOLERANCE],
            [-179, 0 + 3 * ANTIMERIDIAN_TOLERANCE],
          ],
        ],
      ],
    };
    const latitudes = alignAntimeridian(far)
      .coordinates.flat(2)
      .filter((position) => Math.abs(position[0] as number) === 180)
      .map((position) => position[1]);
    expect(new Set(latitudes)).toEqual(new Set([0, 3 * ANTIMERIDIAN_TOLERANCE, 1]));
  });
});

describe('labelPoint', () => {
  // A "C": the square 0..10 without the notch 4..10 × 3..7 on its right side.
  const c: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [0, 10],
        [10, 10],
        [10, 7],
        [4, 7],
        [4, 3],
        [10, 3],
        [10, 0],
        [0, 0],
      ],
    ],
  };

  it('keeps a hint that lies inside, rounded', () => {
    expect(labelPoint(c, [2.004, 5.006])).toEqual([2, 5.01]);
  });

  it('replaces a hint that lies outside by a point well inside', () => {
    expect(planarContains(c.coordinates, 7, 5)).toBe(false);
    const point = labelPoint(c, [7, 5]);
    expect(point).toBeDefined();
    expect(geoContains(c, point ?? [0, 0])).toBe(true);
    // Farthest from the edges is the middle of the bar on the left, 2° from three of them.
    expect(point?.[0]).toBeCloseTo(2, 0);
  });

  it('keeps as many decimals as a small polygon needs', () => {
    const tiny: Polygon = {
      type: 'Polygon',
      coordinates: [square(12.4512, 41.9012, 0.002).reverse()],
    };
    const point = labelPoint(tiny);
    expect(geoContains(tiny, point ?? [0, 0])).toBe(true);
    expect(String(point?.[0]).length).toBeGreaterThan('12.45'.length);
  });

  it('uses the largest polygon of a multipolygon', () => {
    const point = labelPoint({
      type: 'MultiPolygon',
      coordinates: [[square(50, 50, 0.5).reverse()], [square(0, 0, 10).reverse()]],
    });
    expect(point?.[0]).toBeCloseTo(5, 0);
    expect(point?.[1]).toBeCloseTo(5, 0);
  });
});
