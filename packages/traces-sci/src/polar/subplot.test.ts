import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { layoutFigure } from './__testing__/figure.ts';
import { toRadians } from './coordinates.ts';
import { radianLabel } from './subplot.ts';

const deg = (d: number): number => (d * Math.PI) / 180;

describe('coordinates (plotly.js polar set_convert)', () => {
  it('converts theta units to radians, gradians included', () => {
    expect(toRadians(180, 'degrees')).toBeCloseTo(Math.PI, 12);
    expect(toRadians(200, 'gradians')).toBeCloseTo(Math.PI, 12);
    expect(toRadians(1.5, 'radians')).toBe(1.5);
  });

  it('reads theta in the trace unit and r on the radial scale', () => {
    const f = layoutFigure({
      data: [
        { type: 'scatterpolar', r: [1, 2], theta: [90, 180] },
        { type: 'scatterpolar', r: [1, 2], theta: [Math.PI / 2, Math.PI], thetaunit: 'radians' },
        { type: 'scatterpolar', r: [1, 2], theta: [100, 200], thetaunit: 'gradians' },
      ],
    });
    for (const c of f.calcs) {
      expect(c!.coords.theta[0]).toBeCloseTo(Math.PI / 2, 12);
      expect(c!.coords.theta[1]).toBeCloseTo(Math.PI, 12);
    }
    const log = layoutFigure({
      data: [{ type: 'scatterpolar', r: [10, 1000], theta: [0, 90] }],
      layout: { polar: { radialaxis: { type: 'log' } } },
    });
    expect([...log.calcs[0]!.coords.r]).toEqual([1, 3]);
  });

  it('builds implicit coordinates from r0 / dr and theta0 / dtheta', () => {
    const f = layoutFigure({
      data: [
        { type: 'scatterpolar', r: [1, 1, 1, 1] },
        { type: 'scatterpolar', theta: [0, 90], r0: 2, dr: 3 },
        { type: 'scatterpolar', r: [1, 1], theta0: 10, dtheta: 20 },
      ],
    });
    // A full turn split over the points.
    expect(f.calcs[0]!.coords.theta[1]).toBeCloseTo(Math.PI / 2, 12);
    expect([...f.calcs[1]!.coords.r]).toEqual([2, 5]);
    expect(f.calcs[2]!.coords.theta[1]).toBeCloseTo(deg(30), 12);
  });

  it('places categories every period step', () => {
    const f = layoutFigure({
      data: [{ type: 'scatterpolar', r: [1, 1, 1], theta: ['a', 'b', 'c'] }],
      layout: { polar: { angularaxis: { period: 6 } } },
    });
    const sp = f.subplot();
    expect([...f.calcs[0]!.coords.theta]).toEqual([0, 1, 2]);
    // Six positions around the circle: 60° apart.
    expect(sp.c2g(1)).toBeCloseTo(deg(60), 12);
  });
});

describe('PolarSubplot mapping', () => {
  it('maps the radial range from the hole to the edge, clamping below it', () => {
    const f = layoutFigure({
      data: [{ type: 'scatterpolar', r: [1, 2], theta: [0, 90] }],
      layout: { polar: { hole: 0.5, radialaxis: { range: [1, 3] } } },
    });
    const sp = f.subplot();
    expect(sp.radius).toBe(200);
    expect(sp.innerRadius).toBe(100);
    expect(sp.r2px(1)).toBe(100);
    expect(sp.r2px(3)).toBe(200);
    expect(sp.r2px(2)).toBe(150);
    // Below range[0]: at the hole's edge (Plotly's rFilter).
    expect(sp.r2px(0)).toBe(100);
    expect(sp.px2r(150)).toBeCloseTo(2, 12);
    expect(f.fullLayout['polar']).toMatchObject({ radialaxis: { range: [1, 3] } });
  });

  it('follows direction and rotation', () => {
    const f = layoutFigure({
      data: [{ type: 'scatterpolar', r: [1], theta: [0] }],
      layout: { polar: { angularaxis: { direction: 'clockwise' } } },
    });
    const sp = f.subplot();
    // 0° at 12 o'clock, 90° at 3 o'clock.
    expect(sp.c2g(0)).toBeCloseTo(deg(90), 12);
    expect(sp.c2g(deg(90))).toBeCloseTo(0, 12);
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (c) => {
        expect(sp.g2c(sp.c2g(c))).toBeCloseTo(c, 9);
      }),
    );
  });

  it('autoranges from zero with the markers’ padding', () => {
    const f = layoutFigure({
      data: [{ type: 'scatterpolar', r: [2, 4], theta: [0, 90], mode: 'lines' }],
    });
    expect([...f.subplot().rl]).toEqual([0, 4]);
    const m = layoutFigure({
      data: [{ type: 'scatterpolar', r: [2, 4], theta: [0, 90], mode: 'markers' }],
    });
    const [lo, hi] = m.subplot().rl;
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(4);
    expect(hi).toBeLessThan(4.2);
  });

  it('lays out a subplot without data at [0, 1]', () => {
    const f = layoutFigure({ data: [{ type: 'scatterpolar', r: [], theta: [] }] });
    expect(f.calcs[0]).toBeUndefined();
  });

  it('previews a view and notifies listeners', () => {
    const f = layoutFigure({
      data: [{ type: 'scatterpolar', r: [1, 2], theta: [0, 90] }],
      layout: { polar: { radialaxis: { range: [0, 4] } } },
    });
    const sp = f.subplot();
    let calls = 0;
    const off = sp.onChange(() => calls++);
    sp.setView({ range: [0, 2], rotation: 30 });
    expect(calls).toBe(1);
    expect(sp.r2px(2)).toBe(200);
    expect(sp.c2g(0)).toBeCloseTo(deg(30), 12);
    expect(sp.version).toBe(1);
    off();
    sp.setView({ rotation: 0 });
    expect(calls).toBe(1);
  });
});

describe('ticks and labels', () => {
  it('puts linear angular ticks every 45° without repeating 360°', () => {
    const f = layoutFigure({ data: [{ type: 'scatterpolar', r: [1], theta: [0] }] });
    const ticks = f.subplot().angularTicks();
    expect(ticks.map((t) => t.text)).toEqual([
      '0°',
      '45°',
      '90°',
      '135°',
      '180°',
      '225°',
      '270°',
      '315°',
    ]);
  });

  it('labels radian axes with fractions of π', () => {
    expect(radianLabel(90)).toBe('<sup>1</sup>⁄<sub>2</sub>π');
    expect(radianLabel(180)).toBe('π');
    expect(radianLabel(360)).toBe('2π');
    expect(radianLabel(-45)).toBe('−<sup>1</sup>⁄<sub>4</sub>π');
    expect(radianLabel(0)).toBe('0');
    const f = layoutFigure({
      data: [{ type: 'scatterpolar', r: [1], theta: [0] }],
      layout: { polar: { angularaxis: { thetaunit: 'radians' } } },
    });
    expect(f.subplot().angularTicks()[4]!.text).toBe('π');
  });

  it('keeps category ticks inside the sector', () => {
    const f = layoutFigure({
      data: [{ type: 'scatterpolar', r: [1, 1, 1, 1], theta: ['N', 'E', 'S', 'W'] }],
      layout: { polar: { sector: [0, 180] } },
    });
    // N at 0°, E at 90°, S at 180°; W at 270° is outside.
    expect(
      f
        .subplot()
        .angularTicks()
        .map((t) => t.text),
    ).toEqual(['N', 'E', 'S']);
  });

  it('doubles the radial axis’ auto tick count (Plotly)', () => {
    const f = layoutFigure({
      data: [{ type: 'scatterpolar', r: [1], theta: [0] }],
      layout: { polar: { radialaxis: { range: [0, 10] } } },
    });
    // 200 px: (4 + 1) × 2 = 10 ticks over 10 → a rough step of 1, rounded up to 2 (Plotly's
    // `roundBase10`); a cartesian axis this long would step by 5.
    expect(
      f
        .subplot()
        .radialTicks()
        .map((t) => t.text),
    ).toEqual(['0', '2', '4', '6', '8', '10']);
  });

  it('formats hover values like Plotly’s formatLabels', () => {
    const f = layoutFigure({
      data: [{ type: 'scatterpolar', r: [1.5], theta: [22.5] }],
      layout: { polar: { radialaxis: { range: [0, 2] } } },
    });
    const sp = f.subplot();
    expect(sp.rLabel(1.5)).toBe('1.5');
    expect(sp.thetaLabel(deg(22.5))).toBe('22.5°');
    const cats = layoutFigure({ data: [{ type: 'scatterpolar', r: [1], theta: ['x'] }] });
    expect(cats.subplot().thetaLabel(0)).toBe('x');
  });

  it('snaps the radial axis to a polygon vertex', () => {
    const f = layoutFigure({
      data: [{ type: 'scatterpolar', r: [1, 1, 1, 1], theta: ['a', 'b', 'c', 'd'] }],
      layout: { polar: { gridshape: 'linear', radialaxis: { angle: 30 } } },
    });
    const sp = f.subplot();
    expect(sp.vangles).toHaveLength(4);
    expect(sp.radialAxisAngle).toBeCloseTo(0, 9);
  });
});
