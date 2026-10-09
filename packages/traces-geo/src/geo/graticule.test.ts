import { geoEquirectangular } from 'd3-geo';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SCOPE_DEFAULTS } from './constants.ts';
import { graticuleLines, graticuleValues, type GraticuleLayout } from './graticule.ts';
import { projectLines } from './sink.ts';
import type { FullGeoAxis, GeoScope } from './types.ts';

/** An axis after defaults; Plotly's `dtick` defaults are 30 for longitude and 10 for latitude. */
function axis(dtick: number, tick0 = 0): FullGeoAxis {
  return {
    range: [0, 0],
    showgrid: true,
    tick0,
    dtick,
    gridcolor: '#eee',
    gridwidth: 1,
    griddash: 'solid',
  };
}

function layout(scope: GeoScope, lon = axis(30), lat = axis(10)): GraticuleLayout {
  return { scope, lonaxis: lon, lataxis: lat };
}

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
};

describe('graticuleValues', () => {
  it('gives the world its meridians every 30° and parallels every 10°, as Plotly does', () => {
    // Plotly: calcTicks over [-180, 180 - 1e-6] gives -180 … 180, and the last is popped.
    expect(graticuleValues('lonaxis', layout('world'))).toEqual(range(-180, 150, 30));
    // Both poles are ticks: the parallels at ±90° are the top and bottom edges of a flat map.
    expect(graticuleValues('lataxis', layout('world'))).toEqual(range(-90, 90, 10));
  });

  it('has no duplicate meridian at ±180° wherever the scope spans a full turn', () => {
    for (const scope of ['world', 'antarctica', 'oceania'] as const) {
      const values = graticuleValues('lonaxis', layout(scope));
      expect(values[0]).toBe(-180);
      expect(values).not.toContain(180);
    }
  });

  it('keeps every meridian of a scoped map (Plotly drops the last one)', () => {
    expect(graticuleValues('lonaxis', layout('europe'))).toEqual([-30, 0, 30, 60]);
    expect(graticuleValues('lataxis', layout('europe'))).toEqual([30, 40, 50, 60, 70, 80]);
    expect(graticuleValues('lonaxis', layout('asia'))).toEqual([30, 60, 90, 120, 150]);
    expect(graticuleValues('lataxis', layout('asia'))).toEqual([-10, 0, 10, 20, 30, 40, 50]);
    expect(graticuleValues('lonaxis', layout('usa'))).toEqual([-180, -150, -120, -90, -60]);
    expect(graticuleValues('lataxis', layout('usa'))).toEqual([20, 30, 40, 50, 60, 70, 80]);
    expect(graticuleValues('lonaxis', layout('north america'))).toEqual(range(-180, -60, 30));
    expect(graticuleValues('lonaxis', layout('south america'))).toEqual([-90, -60, -30]);
  });

  it('follows tick0 and dtick, and drops a meridian only when it repeats the first', () => {
    // No meridian is on the antimeridian here, so none is a duplicate.
    expect(graticuleValues('lonaxis', layout('world', axis(30, 10)))).toEqual(range(-170, 160, 30));
    expect(graticuleValues('lonaxis', layout('world', axis(50)))).toEqual(range(-150, 150, 50));
    expect(graticuleValues('lonaxis', layout('world', axis(45, 720)))).toEqual(
      range(-180, 135, 45),
    );
    expect(graticuleValues('lataxis', layout('world', axis(30), axis(20, 5)))).toEqual(
      range(-75, 85, 20),
    );
    expect(graticuleValues('lataxis', layout('world', axis(30), axis(200)))).toEqual([0]);
  });

  it('takes the upper bound of a scope as a tick, through the pad of calcTicks', () => {
    // 85 is the end of Europe's latitudes; the range ends 1e-6 short of it and is padded by 1e-4.
    expect(graticuleValues('lataxis', layout('europe', axis(30), axis(5)))).toContain(85);
    expect(graticuleValues('lataxis', layout('europe', axis(30), axis(5)))).toHaveLength(12);
  });

  it('gives no lines for a dtick that is not a positive number', () => {
    for (const dtick of [0, -10, NaN, Infinity]) {
      expect(graticuleValues('lonaxis', layout('world', axis(dtick)))).toEqual([]);
      expect(graticuleLines('lonaxis', layout('world', axis(dtick))).coordinates).toEqual([]);
    }
    expect(graticuleValues('lataxis', layout('world', axis(30), axis(10, NaN)))).toEqual([]);
  });

  it('stops where calcTicks stops, at 1001 ticks', () => {
    expect(graticuleValues('lataxis', layout('world', axis(30), axis(0.01)))).toHaveLength(1001);
    expect(graticuleValues('lataxis', layout('world', axis(30), axis(1e-30)))).toHaveLength(1);
  });

  it('lists every multiple of dtick from tick0 in the padded range, and nothing else', () => {
    const scopes = Object.keys(SCOPE_DEFAULTS) as GeoScope[];
    fc.assert(
      fc.property(
        fc.constantFrom(...scopes),
        fc.constantFrom('lonaxis' as const, 'lataxis' as const),
        // `fc.double` favours small magnitudes: fine steps, and a tick0 that is mostly near 0.
        fc.double({ min: 0.5, max: 400, noNaN: true }),
        fc.oneof(
          fc.double({ min: -500, max: 500, noNaN: true }),
          fc.integer({ min: -5000, max: 5000 }).map((i) => i / 10),
        ),
        (scope, name, dtick, tick0) => {
          const values = graticuleValues(
            name,
            layout(scope, axis(dtick, tick0), axis(dtick, tick0)),
          );
          const [r0, r1] = SCOPE_DEFAULTS[scope][`${name}Range`];
          const pad = (r1 - 1e-6 - r0) * 1e-4;
          const lo = r0 - pad;
          const hi = r1 - 1e-6 + pad;
          const tol = 1e-9 * (Math.abs(tick0) + 360);
          for (const [i, v] of values.entries()) {
            expect(v).toBeGreaterThanOrEqual(lo - tol);
            expect(v).toBeLessThanOrEqual(hi + tol);
            const steps = (v - tick0) / dtick;
            expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9 * (1 + Math.abs(steps)));
            if (i > 0) expect(v - values[i - 1]!).toBeCloseTo(dtick, 9);
          }
          // Complete: the multiples before the first and after the last are out of the range,
          // unless the last was a meridian a full turn after the first.
          const first = values[0];
          const last = values[values.length - 1];
          if (first === undefined || last === undefined) {
            expect(Math.ceil((lo - tick0) / dtick) * dtick + tick0).toBeGreaterThan(hi - tol);
            return;
          }
          expect(first - dtick).toBeLessThan(lo + tol);
          const dropped = name === 'lonaxis' && last + dtick - first > 360 - 2e-6;
          if (!dropped) expect(last + dtick).toBeGreaterThan(hi - tol);
          // No two meridians coincide on the globe.
          if (name === 'lonaxis') expect(last - first).toBeLessThanOrEqual(360 - 1e-6);
        },
      ),
    );
  });
});

describe('graticuleLines', () => {
  it('runs each meridian of the world from pole to pole in steps of 2.5°', () => {
    const { type, coordinates } = graticuleLines('lonaxis', layout('world'));
    expect(type).toBe('MultiLineString');
    expect(coordinates).toHaveLength(12);
    for (const [i, line] of coordinates.entries()) {
      expect(line).toHaveLength(73);
      expect(line[0]).toEqual([-180 + 30 * i, -90]);
      expect(line[1]).toEqual([-180 + 30 * i, -87.5]);
      expect(line[72]).toEqual([-180 + 30 * i, 90]);
    }
  });

  it('runs each parallel of the world once around', () => {
    const { coordinates } = graticuleLines('lataxis', layout('world'));
    expect(coordinates).toHaveLength(19);
    for (const [i, line] of coordinates.entries()) {
      expect(line).toHaveLength(145);
      expect(line[0]).toEqual([-180, -90 + 10 * i]);
      expect(line[144]).toEqual([180, -90 + 10 * i]);
    }
  });

  it('spans the range of the scope, not of the figure', () => {
    const custom = layout('europe');
    custom.lonaxis.range = [0, 10];
    custom.lataxis.range = [40, 50];
    const meridians = graticuleLines('lonaxis', custom).coordinates;
    expect(meridians.map((line) => line[0]![0])).toEqual([-30, 0, 30, 60]);
    for (const line of meridians) {
      expect(line.map((p) => p[1])).toEqual(range(30, 85, 2.5));
    }
    const parallels = graticuleLines('lataxis', custom).coordinates;
    expect(parallels.map((line) => line[0]![1])).toEqual([30, 40, 50, 60, 70, 80]);
    for (const line of parallels) {
      expect(line.map((p) => p[0])).toEqual(range(-30, 60, 2.5));
    }
  });

  it("overshoots a range that is not a multiple of 2.5° wide, like Plotly's loop", () => {
    // Asia's longitudes run from 22° to 160°: 22 + 56 · 2.5 = 162.
    const parallel = graticuleLines('lataxis', layout('asia')).coordinates[0]!;
    expect(parallel[0]).toEqual([22, -10]);
    expect(parallel[parallel.length - 1]).toEqual([162, -10]);
  });

  it('projects to one polyline per line on an unrotated flat map', () => {
    const height = 400;
    const projection = geoEquirectangular().fitSize([800, height], { type: 'Sphere' });
    const parallels = projectLines(projection, height, graticuleLines('lataxis', layout('world')));
    expect(parallels.startCount + 1).toBe(19);
    const starts = [
      0,
      ...parallels.starts.subarray(0, parallels.startCount),
      parallels.vertexCount,
    ];
    for (let l = 0; l < 19; l++) {
      // Parallel `l` is at -90° + 10°·l: a horizontal line, the bottom edge first.
      for (let i = starts[l]!; i < starts[l + 1]!; i++) {
        expect(parallels.y[i]).toBeCloseTo((height * l) / 18, 6);
      }
    }
    const meridians = projectLines(projection, height, graticuleLines('lonaxis', layout('world')));
    expect(meridians.startCount + 1).toBe(12);
    // No meridian is drawn twice: twelve distinct x positions.
    const xs = new Set<number>();
    const mStarts = [0, ...meridians.starts.subarray(0, meridians.startCount)];
    for (const s of mStarts) xs.add(Math.round(meridians.x[s]! * 1e6));
    expect(xs.size).toBe(12);
  });
});
