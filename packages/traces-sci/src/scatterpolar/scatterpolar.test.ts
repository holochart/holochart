import { createRegistry, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import type { HoverQuery } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { barpolar } from '../barpolar/index.ts';
import { layoutFigure } from '../polar/__testing__/figure.ts';
import { linePath, polarFillGeometry } from '../polar/fill.ts';
import { polarPositions } from '../polar/positions.ts';
import type { ScatterpolarCalc } from './calc.ts';
import { polarHoverText } from './hover.ts';
import { scatterpolar } from './index.ts';

const registry = createRegistry().register(scatterpolar, barpolar);

function defaults(trace: Record<string, unknown>): FullTrace {
  return supplyDefaults({ data: [{ type: 'scatterpolar', ...trace }] }, registry, {
    validate: false,
  }).fullData[0]!;
}

describe('scatterpolar defaults (plotly.js scatterpolar/defaults.js)', () => {
  it('hides traces without data and counts points like handleRThetaDefaults', () => {
    expect(defaults({}).visible).toBe(false);
    expect(defaults({ r: [1, 2, 3], theta: [0, 1] })['_length']).toBe(2);
    const implicit = defaults({ r: [1, 2, 3] });
    expect(implicit['_length']).toBe(3);
    expect(implicit['theta0']).toBe(0);
    expect(defaults({ theta: [1, 2] })['dr']).toBe(1);
  });

  it('takes scatter’s mode, line, marker and fill defaults', () => {
    const few = defaults({ r: [1, 2, 3], theta: [0, 1, 2] });
    expect(few['mode']).toBe('lines+markers');
    expect(few['cliponaxis']).toBe(false);
    expect(few['subplot']).toBe('polar');
    expect(few['thetaunit']).toBe('degrees');
    expect(few['line']).toMatchObject({ shape: 'linear', width: 2 });
    const many = defaults({ r: new Array(30).fill(1), theta: new Array(30).fill(0) });
    expect(many['mode']).toBe('lines');
    expect(many['cliponaxis']).toBeUndefined();
    const radar = defaults({ r: [1, 2, 3], theta: [0, 1, 2], fill: 'toself' });
    expect(radar['hoveron']).toBe('points+fills');
    expect(typeof radar['fillcolor']).toBe('string');
    // Scatter-only attributes stay out.
    expect(radar['x']).toBeUndefined();
    expect(radar['error_y']).toBeUndefined();
    expect(radar['stackgroup']).toBeUndefined();
  });
});

describe('scatterpolar hover labels (plotly.js makeHoverPointText)', () => {
  const trace = { hoverinfo: 'all' } as unknown as FullTrace;

  it('lists r, θ and the text', () => {
    expect(polarHoverText(trace, 0, '3', '45°', 'note')).toBe('r: 3<br>θ: 45°<br>note');
    const some = { hoverinfo: 'theta+text' } as unknown as FullTrace;
    expect(polarHoverText(some, 0, '3', '45°', undefined)).toBe('θ: 45°');
  });

  it('reports the nearest visible point with r / θ fields', () => {
    const f = layoutFigure({
      data: [{ type: 'scatterpolar', r: [2, 3], theta: [0, 90], mode: 'markers' }],
      layout: { polar: { radialaxis: { range: [0, 4] } } },
    });
    const sp = f.subplot();
    // (r, θ) = (3, 90°): 150 px above the center (200, 200) of the 400 px square plot area.
    const cx = sp.cx;
    const cy = sp.cy - 150;
    const query: HoverQuery = {
      px: cx,
      py: 400 - cy,
      xl: cx,
      yl: 400 - cy,
      mode: 'closest',
      distance: 20,
      cx,
      cy,
    };
    const points = scatterpolar.hoverPoints!(
      f.calcs[0] as ScatterpolarCalc,
      f.fullData[0]!,
      query,
      {
        fullLayout: f.fullLayout,
        xaxis: undefined,
        yaxis: undefined,
        transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
      },
    );
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      pointIndex: 1,
      fields: { r: 3, theta: 90 },
      labels: { r: '3', theta: '90°' },
      hoverText: 'r: 3<br>θ: 90°',
    });
    expect(points[0]!.x).toBeUndefined();
  });
});

describe('scatterpolar fills', () => {
  it('fills toself unclipped inside a disc, clipped with the intersect rule otherwise', () => {
    const f = layoutFigure({
      data: [{ type: 'scatterpolar', r: [1, 2, 3], theta: [0, 120, 240], fill: 'toself' }],
      layout: { polar: { radialaxis: { range: [0, 3] } } },
    });
    const sp = f.subplot();
    const trace = f.fullData[0]!;
    const path = linePath(trace, polarPositions(f.calcs[0]!, sp));
    const g = polarFillGeometry(trace, path, sp)!;
    expect(g.fillRule).toBe('nonzero');
    // Zoomed in: the triangle crosses the edge and gets the region's rings.
    sp.setView({ range: [0, 2] });
    const zoomed = polarFillGeometry(trace, linePath(trace, polarPositions(f.calcs[0]!, sp)), sp)!;
    expect(zoomed.fillRule).toBe('intersect');
    expect((zoomed.rings as number[]).length).toBe(2);
  });

  it('fills tonext between the trace and the previous one (even-odd)', () => {
    const f = layoutFigure({
      data: [
        { type: 'scatterpolar', r: [1, 1, 1], theta: [0, 120, 240], fill: 'toself' },
        { type: 'scatterpolar', r: [2, 2, 2], theta: [0, 120, 240], fill: 'tonext' },
      ],
      layout: { polar: { radialaxis: { range: [0, 3] } } },
    });
    const sp = f.subplot();
    const inner = linePath(f.fullData[0]!, polarPositions(f.calcs[0]!, sp));
    const outer = linePath(f.fullData[1]!, polarPositions(f.calcs[1]!, sp));
    const g = polarFillGeometry(f.fullData[1]!, outer, sp, inner)!;
    expect(g.fillRule).toBe('evenodd');
    expect(g.rings).toEqual([0, 3]);
    expect(g.polygons).toEqual([0]);
  });
});
