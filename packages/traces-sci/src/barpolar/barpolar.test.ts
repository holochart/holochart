import { createRegistry, supplyDefaults } from '@mk7s/holochart-core';
import type { HoverQuery } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { layoutFigure } from '../polar/__testing__/figure.ts';
import { scatterpolar } from '../scatterpolar/index.ts';
import { barPixels } from './geometry.ts';
import { barpolar } from './index.ts';

const registry = createRegistry().register(scatterpolar, barpolar);

describe('barpolar defaults (plotly.js barpolar/defaults.js)', () => {
  it('takes bar’s marker defaults and the polar coordinates', () => {
    const trace = supplyDefaults(
      { data: [{ type: 'barpolar', r: [1, 2], theta: [0, 90], width: 20 }] },
      registry,
      { validate: false },
    ).fullData[0]!;
    expect(trace['_length']).toBe(2);
    expect(trace['width']).toBe(20);
    expect(trace['marker']).toMatchObject({ opacity: 1, line: { width: 0 } });
    expect(typeof (trace['marker'] as { color: unknown }).color).toBe('string');
    expect((trace['marker'] as Record<string, unknown>)['cornerradius']).toBeUndefined();
    expect(trace['textposition']).toBeUndefined();
  });
});

describe('barpolar geometry and hover', () => {
  const f = layoutFigure({
    data: [
      { type: 'barpolar', r: [2, 4], theta: ['a', 'b'], text: ['first', 'second'] },
      { type: 'barpolar', r: [1, 1], theta: ['a', 'b'] },
    ],
    layout: { polar: { radialaxis: { range: [0, 5] } } },
  });
  const sp = f.subplot();

  it('maps stacked bars to px and angles', () => {
    const px = barPixels(f.calcs[1]!, sp)!;
    // Stacked on the first trace: from r = 2 (80 px) to 3 (120 px) at `a` (0°, 0.9 × 180° wide).
    expect(px.rp0[0]).toBeCloseTo(80, 9);
    expect(px.rp1[0]).toBeCloseTo(120, 9);
    expect(px.g1[0]! - px.g0[0]!).toBeCloseTo(0.9 * Math.PI, 9);
  });

  it('hovers the bar under the pointer, labelled at its outer edge', () => {
    const at = (r: number, deg: number): HoverQuery => {
      const a = (deg * Math.PI) / 180;
      const cx = sp.cx + r * Math.cos(a);
      const cy = sp.cy - r * Math.sin(a);
      return { px: cx, py: 400 - cy, xl: cx, yl: 400 - cy, mode: 'closest', distance: 20, cx, cy };
    };
    const ctx = {
      fullLayout: f.fullLayout,
      xaxis: undefined,
      yaxis: undefined,
      transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
    };
    // Trace 0's bar at `b` (180°) spans 0–160 px.
    const hit = barpolar.hoverPoints!(f.calcs[0]!, f.fullData[0]!, at(100, 180), ctx);
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({
      pointIndex: 1,
      text: 'second',
      hoverText: 'r: 4<br>θ: b<br>second',
      fields: { r: 4, theta: 'b' },
    });
    // Ranked just under points: within the hover distance.
    expect(hit[0]!.distance).toBeLessThanOrEqual(20);
    expect(hit[0]!.px).toBeCloseTo(sp.cx - 160, 6);
    // Past the bar's end: nothing.
    expect(barpolar.hoverPoints!(f.calcs[0]!, f.fullData[0]!, at(170, 180), ctx)).toEqual([]);
  });
});
