import { geoCircle } from 'd3-geo';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { angle, point } from './__testing__/measure.ts';
import { chartOf, FLAT, NORTH, SOUTH, type Chart } from './chart.ts';
import type { Vec3 } from './sphere.ts';

const lonLatArb = fc.tuple(
  fc.double({ min: -180, max: 180, noNaN: true }),
  fc.double({ min: -90, max: 90, noNaN: true }),
);

function ringOf(center: [number, number], radius: number): number[][] {
  return geoCircle().center(center).radius(radius).precision(10)().coordinates[0]!;
}

describe('the charts', () => {
  it('map a point of the sphere to their plane and back', () => {
    fc.assert(
      fc.property(lonLatArb, fc.constantFrom(FLAT, NORTH, SOUTH), ([lon, lat], chart) => {
        const p = point(lon, lat) as Vec3;
        const [u, v] = chart.toPlane(p, lon, [0, 0]);
        const back = chart.toSphere(u, v, [0, 0, 0]);
        // The polar charts tear at the other pole, where a rounding error is a long way.
        const far = chart !== FLAT && angle(p, chart === NORTH ? [0, -1, 0] : [0, 1, 0]) < 1e-3;
        if (!far) expect(angle(p, back)).toBeLessThan(1e-9);
        expect(Math.hypot(...back)).toBeCloseTo(1, 12);
      }),
    );
  });

  it('are the plane of longitude and latitude, and the planes about the poles', () => {
    expect(FLAT.toPlane(point(30, 40) as Vec3, 30, [0, 0])).toEqual([
      expect.closeTo(30, 10),
      expect.closeTo(40, 10),
    ]);
    // A longitude stays on the side it is asked for.
    expect(FLAT.toPlane(point(180, 10) as Vec3, 179, [0, 0])[0]).toBeCloseTo(180, 10);
    expect(FLAT.toPlane(point(180, 10) as Vec3, -179, [0, 0])[0]).toBeCloseTo(-180, 10);
    // The pole is the origin, and a point 20° from it is 20 from the origin.
    for (const [chart, side] of [
      [NORTH, 1],
      [SOUTH, -1],
    ] as [Chart, number][]) {
      expect(chart.toPlane([0, side, 0], 0, [9, 9])).toEqual([0, 0]);
      expect(chart.toSphere(0, 0, [9, 9, 9])).toEqual([0, side, 0]);
      const [u, v] = chart.toPlane(point(70, side * 70) as Vec3, 0, [0, 0]);
      expect(Math.hypot(u, v)).toBeCloseTo(20, 10);
    }
  });

  it('keep the sense of rotation, and never shorten an arc', () => {
    fc.assert(
      fc.property(
        lonLatArb,
        fc.double({ min: 0.1, max: 3, noNaN: true }),
        fc.constantFrom(FLAT, NORTH, SOUTH),
        ([lon, lat], size, chart) => {
          // A small triangle, counter-clockwise seen from outside, well inside the chart.
          const clear = chart === FLAT ? Math.abs(lat) < 80 && Math.abs(lon) < 170 : true;
          const side = chart === NORTH ? 1 : -1;
          if (!clear || (chart !== FLAT && side * lat < -60)) return;
          const corners = [
            [lon, lat],
            [lon + size, lat],
            [lon, lat + (lat < 80 ? size : -size)],
          ] as const;
          const p = corners.map(([x, y]) => point(x, y) as Vec3);
          const turn =
            p[0]![0] * (p[1]![1] * p[2]![2] - p[1]![2] * p[2]![1]) +
            p[0]![1] * (p[1]![2] * p[2]![0] - p[1]![0] * p[2]![2]) +
            p[0]![2] * (p[1]![0] * p[2]![1] - p[1]![1] * p[2]![0]);
          const q = p.map((at, i) => [...chart.toPlane(at, corners[i]![0], [0, 0])]);
          const area =
            (q[1]![0]! - q[0]![0]!) * (q[2]![1]! - q[0]![1]!) -
            (q[2]![0]! - q[0]![0]!) * (q[1]![1]! - q[0]![1]!);
          if (Math.abs(turn) < 1e-9) return;
          expect(Math.sign(area)).toBe(Math.sign(turn));
          for (const [i, j] of [
            [0, 1],
            [1, 2],
            [2, 0],
          ] as const) {
            const inPlane = Math.hypot(q[i]![0]! - q[j]![0]!, q[i]![1]! - q[j]![1]!);
            expect(inPlane).toBeGreaterThanOrEqual(angle(p[i]!, p[j]!) - 1e-9);
          }
        },
      ),
    );
  });
});

describe('chartOf', () => {
  it('is the flat chart for what stays clear of the poles', () => {
    expect(chartOf(ringOf([10, 20], 30))).toBe(FLAT);
    expect(chartOf(ringOf([179, 0], 40))).toBe(FLAT);
    expect(chartOf(ringOf([0, 60], 20))).toBe(FLAT);
  });

  it('is the chart of the pole a polygon holds', () => {
    expect(chartOf(ringOf([0, 90], 20))).toBe(NORTH);
    expect(chartOf(ringOf([50, 70], 30))).toBe(NORTH);
    expect(chartOf(ringOf([0, -90], 20))).toBe(SOUTH);
    expect(chartOf(ringOf([-120, -40], 75))).toBe(SOUTH);
    // A hemisphere about a pole, and more.
    expect(chartOf(ringOf([0, 90], 90))).toBe(NORTH);
    expect(chartOf(ringOf([0, 80], 85))).toBe(NORTH);
  });

  it('is the chart of a pole a polygon comes near, unless it reaches far from it', () => {
    expect(chartOf(ringOf([0, 80], 7))).toBe(NORTH);
    expect(chartOf(ringOf([0, -80], 7))).toBe(SOUTH);
    expect(chartOf(ringOf([0, 80], 4))).toBe(FLAT);
    // From 87°N to 60°S: the flat chart has no tear in it, and stretches it less.
    const strip = [
      [0, 87],
      [0, -60],
      [10, -60],
      [10, 87],
      [0, 87],
    ];
    expect(chartOf(strip)).toBe(FLAT);
  });

  it('takes a ring near a pole that runs the other way round for what is outside it', () => {
    // d3's winding: counter-clockwise is everything but the cap, which holds both poles.
    expect(chartOf([...ringOf([0, 80], 7)].reverse())).toBe(FLAT);
    expect(chartOf([...ringOf([0, -80], 7)].reverse())).toBe(FLAT);
  });

  it('is the flat chart for what no polar chart can take', () => {
    // Everything but a cap on the equator holds both poles.
    expect(chartOf([...ringOf([0, 0], 30)].reverse())).toBe(FLAT);
    // Everything but a small cap about the south pole holds the north pole and reaches the south.
    expect(chartOf([...ringOf([0, -90], 5)].reverse())).toBe(FLAT);
    // … and but a larger cap, it stays clear of the south pole.
    expect(chartOf([...ringOf([0, -90], 20)].reverse())).toBe(NORTH);
  });
});
