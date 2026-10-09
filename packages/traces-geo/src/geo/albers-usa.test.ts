import { geoAlbersUsa, geoStream, type GeoPermissibleObjects, type GeoProjection } from 'd3-geo';
import type { LineString, MultiPoint, Polygon } from 'geojson';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadBasemap } from '../basemap/index.ts';
import { albersUsa } from './albers-usa.ts';
import { SPHERE } from './base-layers.ts';
import { graticuleLines } from './graticule.ts';
import { createProjection } from './projections.ts';
import { projectLines } from './sink.ts';
import type { BasemapLayers, ProjectedLines } from './types.ts';

const H = 500;

/** Both projections placed alike, as a view places them. */
function placed<T extends GeoProjection>(projection: T, scale = 900): T {
  projection.precision(0.1).scale(scale).translate([400, 250]);
  return projection;
}

/** Everything a projection's stream sends its sink, in order. */
function events(projection: GeoProjection, object: GeoPermissibleObjects): string[] {
  const log: string[] = [];
  geoStream(
    object,
    projection.stream({
      point: (x, y) => void log.push(`${x},${y}`),
      lineStart: () => void log.push('lineStart'),
      lineEnd: () => void log.push('lineEnd'),
      polygonStart: () => void log.push('polygonStart'),
      polygonEnd: () => void log.push('polygonEnd'),
      sphere: () => void log.push('sphere'),
    }),
  );
  return log;
}

function polylinesOf(out: ProjectedLines): [number, number][][] {
  const bounds = [0, ...out.starts.subarray(0, out.startCount), out.vertexCount];
  const lines: [number, number][][] = [];
  for (let l = 0; l + 1 < bounds.length; l++) {
    const line: [number, number][] = [];
    for (let i = bounds[l]!; i < bounds[l + 1]!; i++) line.push([out.x[i]!, out.y[i]!]);
    lines.push(line);
  }
  return lines;
}

type Frame = 'lower48' | 'alaska' | 'hawaii';

/** The frames of the three parts in output px (y up), by d3's rule for scale `k` at `(x, y)`. */
function frames(projection: GeoProjection): Record<Frame, [number, number, number, number]> {
  const k = projection.scale();
  const [x, y] = projection.translate();
  const box = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): [number, number, number, number] => [
    x + x0 * k,
    H - (y + y1 * k),
    x + x1 * k,
    H - (y + y0 * k),
  ];
  return {
    lower48: box(-0.455, -0.238, 0.455, 0.238),
    alaska: box(-0.425, 0.12, -0.214, 0.234),
    hawaii: box(-0.214, 0.166, -0.115, 0.234),
  };
}

function inside(point: readonly [number, number], box: readonly number[], slack = 1e-6): boolean {
  return (
    point[0] >= box[0]! - slack &&
    point[0] <= box[2]! + slack &&
    point[1] >= box[1]! - slack &&
    point[1] <= box[3]! + slack
  );
}

/** Airports, and the part of the map each is drawn in. */
const AIRPORTS: Record<string, { at: [number, number]; frame: Frame }> = {
  Honolulu: { at: [-157.92, 21.32], frame: 'hawaii' },
  Anchorage: { at: [-149.99, 61.17], frame: 'alaska' },
  'Los Angeles': { at: [-118.41, 33.94], frame: 'lower48' },
  Seattle: { at: [-122.31, 47.45], frame: 'lower48' },
  Chicago: { at: [-87.9, 41.98], frame: 'lower48' },
};

const flight = (from: string, to: string): LineString => ({
  type: 'LineString',
  coordinates: [AIRPORTS[from]!.at, AIRPORTS[to]!.at],
});

let world: BasemapLayers;
beforeAll(async () => {
  world = await loadBasemap(110, 'world');
});

describe('albersUsa', () => {
  it('is the projection the geo subplot builds', () => {
    const made = createProjection('albers usa')!;
    const reference = geoAlbersUsa();
    expect(made([-98, 39])).toEqual(reference([-98, 39]));
    expect(made([-150, 61])).toEqual(reference([-150, 61]));
    expect(made([-157, 21])).toEqual(reference([-157, 21]));
    expect(made([0, 0])).toBeNull();
    expect(made.invert!([300, 200])).toEqual(reference.invert!([300, 200]));
  });

  it("streams polygons, the sphere and points exactly as d3's does", () => {
    const state: Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-109, 41],
          [-102, 41],
          [-102, 37],
          [-109, 37],
          [-109, 41],
        ],
      ],
    };
    for (const scale of [900, 1070, 333]) {
      const mine = placed(albersUsa(), scale);
      const d3 = placed(geoAlbersUsa(), scale);
      for (const object of [SPHERE, state, world.land!, world.countries![4]!.geometry]) {
        expect(events(mine, object)).toEqual(events(d3, object));
      }
      const points: MultiPoint = {
        type: 'MultiPoint',
        coordinates: [AIRPORTS['Seattle']!.at, [10, 10]],
      };
      expect(events(mine, points)).toEqual(events(d3, points));
    }
  });

  it('streams a line that stays in one frame as d3 does', () => {
    const mine = placed(albersUsa());
    const d3 = placed(geoAlbersUsa());
    for (const [from, to] of [
      ['Seattle', 'Chicago'],
      ['Los Angeles', 'Chicago'],
    ] as const) {
      expect(events(mine, flight(from, to))).toEqual(events(d3, flight(from, to)));
    }
  });

  it('follows the scale and the translate it is given, and keeps its stream for one sink', () => {
    const mine = albersUsa();
    const d3 = geoAlbersUsa();
    const sink = {
      point() {},
      lineStart() {},
      lineEnd() {},
      polygonStart() {},
      polygonEnd() {},
    };
    const first = mine.stream(sink);
    expect(mine.stream(sink)).toBe(first);
    expect(mine.stream({ ...sink })).not.toBe(first);
    for (const projection of [mine, d3]) projection.scale(640).translate([123, 77]).precision(0.3);
    expect(mine.stream(sink)).not.toBe(first);
    expect(events(mine, world.land!)).toEqual(events(d3, world.land!));
    // d3's fits go through the same stream.
    for (const projection of [mine, d3]) {
      projection.fitExtent(
        [
          [10, 20],
          [710, 470],
        ],
        SPHERE,
      );
    }
    expect(mine.scale()).toBe(d3.scale());
    expect(mine.translate()).toEqual(d3.translate());
  });

  // Regression (GEO5): the stray line of the module comment.
  it('keeps a line from one frame to another in two pieces, each in its frame', () => {
    const pairs = [
      ['Honolulu', 'Los Angeles'],
      ['Los Angeles', 'Honolulu'],
      ['Anchorage', 'Seattle'],
      ['Seattle', 'Anchorage'],
      ['Chicago', 'Anchorage'],
      ['Anchorage', 'Honolulu'],
      ['Honolulu', 'Anchorage'],
    ] as const;
    const mine = placed(albersUsa());
    const rects = frames(mine);
    for (const [from, to] of pairs) {
      const label = `${from} to ${to}`;
      const lines = polylinesOf(projectLines(mine, H, flight(from, to)));
      const a = mine(AIRPORTS[from]!.at)!;
      const b = mine(AIRPORTS[to]!.at)!;
      // One piece leaves the first airport, another arrives at the second.
      const leaving = lines.filter((line) => line[0]![0] === a[0] && line[0]![1] === H - a[1]);
      const arriving = lines.filter((line) => {
        const last = line[line.length - 1]!;
        return last[0] === b[0] && last[1] === H - b[1];
      });
      expect(leaving, label).toHaveLength(1);
      expect(arriving, label).toHaveLength(1);
      expect(leaving[0], label).not.toBe(arriving[0]);
      // Each stays in the frame of its airport, up to that frame's edge.
      for (const point of leaving[0]!) {
        expect(inside(point, rects[AIRPORTS[from]!.frame]), label).toBe(true);
      }
      for (const point of arriving[0]!) {
        expect(inside(point, rects[AIRPORTS[to]!.frame]), label).toBe(true);
      }
      // And no piece is in more frames than one: an inset's piece never leaves the inset.
      for (const line of lines) {
        const insets = (['alaska', 'hawaii'] as const).filter((frame) =>
          line.every((point) => inside(point, rects[frame])),
        );
        const whole = line.every((point) => inside(point, rects.lower48));
        expect(whole, label).toBe(true);
        if (line === leaving[0] && AIRPORTS[from]!.frame !== 'lower48') {
          expect(insets, label).toEqual([AIRPORTS[from]!.frame]);
        }
      }
    }

    // d3's own stream joins the pieces: its line to Los Angeles goes on into Hawaii's frame.
    const d3 = placed(geoAlbersUsa());
    const joined = polylinesOf(projectLines(d3, H, flight('Honolulu', 'Los Angeles')));
    const honolulu = d3(AIRPORTS['Honolulu']!.at)!;
    expect(joined.some((line) => line[0]![0] === honolulu[0])).toBe(false);
  });

  it('draws the graticule of a map of the USA with every line in one frame', () => {
    const mine = placed(albersUsa());
    const rects = frames(mine);
    const layout = {
      scope: 'usa',
      lonaxis: { tick0: 0, dtick: 10 },
      lataxis: { tick0: 0, dtick: 5 },
    } as Parameters<typeof graticuleLines>[1];
    for (const axis of ['lonaxis', 'lataxis'] as const) {
      const lines = polylinesOf(projectLines(mine, H, graticuleLines(axis, layout)));
      expect(lines.length).toBeGreaterThan(10);
      for (const line of lines) {
        // Wholly in an inset, or with no step from the big frame into an inset's piece: a line
        // that hands over would step from one part's pixel to another's, far away.
        let longest = 0;
        for (let i = 1; i < line.length; i++) {
          longest = Math.max(
            longest,
            Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]),
          );
        }
        expect(line.every((point) => inside(point, rects.lower48))).toBe(true);
        // Points are 2.5° apart: 40 px at this scale in the contiguous states, less in Alaska.
        expect(longest).toBeLessThan(60);
      }
    }
  });
});
