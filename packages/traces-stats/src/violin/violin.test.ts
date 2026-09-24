import { createScale, supplyDefaults, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { IDENTITY_TRANSFORM } from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CrossTraceContext,
  type HoverContext,
  type HoverQuery,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { box } from '../box/index.ts';
import { boxShapes } from '../box/geometry.ts';
import { boxStats, kdeAt, kdeBandwidth } from '../shared/stats.ts';
import { violin, type ViolinCalc } from './index.ts';
import { violinShapes } from './geometry.ts';
import { innerBoxOptions } from './plot.ts';

const registry = createChartRegistry().register(violin, box);

function axis(
  id: string,
  type: 'linear' | 'category',
  categories?: string[],
  range: [number, number] = [0, 1],
): AxisInfo {
  const scale = createScale({ type, range, ...(categories ? { categories } : {}) });
  return { id, scale, type, letter: id.charAt(0), full: { type } } as unknown as AxisInfo;
}

function calcAll(data: unknown[], layout: Record<string, unknown> = {}) {
  const traces = data.map((t) => ({ type: 'violin', ...(t as object) }));
  const { fullData, fullLayout } = supplyDefaults({ data: traces, layout }, registry.core);
  const x = axis('x', 'linear', undefined, [-1, 3]);
  const y = axis('y', 'linear', undefined, [-5, 25]);
  const calcs = fullData.map((trace, index) =>
    violin.calc!(trace, { fullLayout, index, xaxis: x, yaxis: y }),
  );
  violin.crossTraceCalc!(
    fullData.map((trace, index) => ({ trace, index, calc: calcs[index]! })),
    { fullLayout, xaxis: x, yaxis: y, subplot: {} as never } satisfies CrossTraceContext,
  );
  return { traces: fullData as FullTrace[], calcs: calcs as ViolinCalc[], fullLayout, x, y };
}

const A = [2, 3, 3.5, 4, 4.2, 5, 5.5, 6, 7, 9];
const B = [8, 9, 9.5, 10, 11, 11.5, 12, 14, 15, 18, 19, 20];

describe('violin defaults', () => {
  it('defaults scalegroup to the name, spanmode from span, and hides box and meanline', () => {
    const { traces, fullLayout } = calcAll([
      { name: 'v', y: A },
      { y: A, span: [0, 10], box: { fillcolor: 'red' }, meanline: { width: 1 } },
    ]);
    expect(traces[0]?.['scalegroup']).toBe('v');
    expect(traces[0]?.['spanmode']).toBe('soft');
    expect(traces[0]?.['box']).toEqual({ visible: false });
    expect(traces[0]?.['meanline']).toEqual({ visible: false });
    expect(traces[0]?.['points']).toBe('outliers');
    expect(traces[0]?.['hoveron']).toBe('violins+points+kde');
    expect(traces[1]?.['spanmode']).toBe('manual');
    const inner = traces[1]?.['box'] as Record<string, unknown>;
    expect(inner['visible']).toBe(true);
    expect(inner['width']).toBe(0.25);
    expect((traces[1]?.['meanline'] as { visible: boolean }).visible).toBe(true);
    expect(fullLayout['violinmode']).toBe('overlay');
    expect(fullLayout['violingap']).toBe(0.3);
  });
});

describe('violin calc', () => {
  it('evaluates the KDE with Silverman’s bandwidth over the soft span', () => {
    const { calcs } = calcAll([{ x: A.map(() => 0), y: A }]);
    const c = calcs[0]!;
    const h = kdeBandwidth(A, boxStats(A));
    expect(c.bandwidth[0]).toBeCloseTo(h, 12);
    expect(c.span0[0]).toBeCloseTo(2 - 2 * h, 12);
    expect(c.span1[0]).toBeCloseTo(9 + 2 * h, 12);
    const { t, v, start } = c.density;
    expect(start[1]! - start[0]!).toBe(Math.ceil((7 + 4 * h) / (h / 3)) + 1);
    expect(v[5]).toBeCloseTo(kdeAt(A, h, t[5]!), 12);
    expect(c.maxKDE).toBe(Math.max(...v));
  });

  it('honors hard and manual spans and a user bandwidth', () => {
    const hard = calcAll([{ x: A.map(() => 0), y: A, spanmode: 'hard', bandwidth: 0.5 }]).calcs[0]!;
    expect([hard.span0[0], hard.span1[0], hard.bandwidth[0]]).toEqual([2, 9, 0.5]);
    const manual = calcAll([{ x: A.map(() => 0), y: A, span: [0, 'end'] }]).calcs[0]!;
    expect(manual.span0[0]).toBe(0);
    expect(manual.span1[0]).toBeCloseTo(9 + 2 * manual.bandwidth[0]!, 12);
  });

  it('scales the widest violin to the half-width (scalemode width)', () => {
    const { calcs } = calcAll([{ x: [...A.map(() => 0), ...B.map(() => 1)], y: [...A, ...B] }]);
    const c = calcs[0]!;
    let widest = 0;
    for (let k = 0; k < c.density.v.length; k++) {
      const b = k < c.density.start[1]! ? 0 : 1;
      widest = Math.max(widest, c.density.v[k]! / c.scale[b]!);
    }
    expect(widest).toBeCloseTo(c.offsets.bdPos, 12);
  });

  it('scalemode count widens violins with more samples', () => {
    const { calcs } = calcAll([
      { x: [...A.map(() => 0), ...B.map(() => 1)], y: [...A, ...B], scalemode: 'count' },
    ]);
    const c = calcs[0]!;
    // scale = (maxKDE / bdPos) · (maxCount / n): the 10-sample violin gets 12/10 of the scale.
    expect(c.scale[0]! / c.scale[1]!).toBeCloseTo(12 / 10, 12);
  });

  it('shares a scale across traces of one scale group only', () => {
    const own = calcAll([
      { x: A.map(() => 0), y: A },
      { x: B.map(() => 1), y: B },
    ]).calcs;
    expect(own[0]!.scale[0]).toBeCloseTo(own[0]!.maxKDE / own[0]!.offsets.bdPos, 12);
    expect(own[1]!.scale[0]).toBeCloseTo(own[1]!.maxKDE / own[1]!.offsets.bdPos, 12);
    const shared = calcAll([
      { x: A.map(() => 0), y: A, scalegroup: 'g' },
      { x: B.map(() => 1), y: B, scalegroup: 'g' },
    ]).calcs;
    const peak = Math.max(shared[0]!.maxKDE, shared[1]!.maxKDE);
    expect(shared[0]!.scale[0]).toBeCloseTo(peak / shared[0]!.offsets.bdPos, 12);
    expect(shared[1]!.scale[0]).toBeCloseTo(peak / shared[1]!.offsets.bdPos, 12);
  });

  it('groups violins like boxes and reports the spans for autorange', () => {
    const { calcs, x, y } = calcAll(
      [
        { x: A.map(() => 0), y: A },
        { x: B.map(() => 0), y: B },
      ],
      { violinmode: 'group' },
    );
    expect(calcs[0]!.offsets.bPos).toBeCloseTo(-0.175, 12);
    expect(calcs[1]!.offsets.bPos).toBeCloseTo(0.175, 12);
    const ext = violin.extremes!(calcs[0]!, {} as FullTrace, {
      fullLayout: {} as FullLayout,
      index: 0,
      xaxis: x,
      yaxis: y,
    });
    expect(ext.y?.min[0]?.l).toBeCloseTo(calcs[0]!.span0[0]!, 12);
    expect(ext.y?.max[0]?.l).toBeCloseTo(calcs[0]!.span1[0]!, 12);
  });
});

describe('violin geometry', () => {
  it('mirrors the density for both sides and closes the outline at the center', () => {
    const { calcs } = calcAll([{ x: A.map(() => 0), y: A }]);
    const c = calcs[0]!;
    const n = c.density.t.length;
    const s = violinShapes(c, 'both', false);
    expect(s.bodies.x.length).toBe(2 * n);
    expect(s.bodies.x[0]).toBeCloseTo(c.density.v[0]! / c.scale[0]!, 12);
    expect(s.bodies.x[2 * n - 1]).toBeCloseTo(-c.density.v[0]! / c.scale[0]!, 12);
    expect(s.outlines.x.length).toBe(2 * n + 2);
    expect([s.outlines.x[0], s.outlines.x[2 * n + 1]]).toEqual([0, 0]);
  });

  it('split violins draw one side each, open at the center line', () => {
    const { calcs } = calcAll([
      { x: A.map(() => 0), y: A, side: 'positive' },
      { x: B.map(() => 0), y: B, side: 'negative' },
    ]);
    const pos = violinShapes(calcs[0]!, 'positive', false);
    const neg = violinShapes(calcs[1]!, 'negative', false);
    expect(Math.min(...pos.bodies.x)).toBe(0);
    expect(Math.max(...neg.bodies.x)).toBe(0);
    expect(Math.max(...pos.bodies.x)).toBeGreaterThan(0);
    expect(Math.min(...neg.bodies.x)).toBeLessThan(0);
  });

  it('draws the mean line across the density, and the inner box on the drawn side', () => {
    const { calcs, traces } = calcAll([
      {
        x: A.map(() => 0),
        y: A,
        side: 'positive',
        box: { visible: true },
        meanline: { visible: true },
      },
    ]);
    const c = calcs[0]!;
    const withMean = violinShapes(c, 'positive', true);
    expect(withMean.means.x[0]).toBe(0);
    expect(withMean.means.y[0]).toBeCloseTo(c.stats.mean[0]!, 12);
    const inner = boxShapes(c, innerBoxOptions(c, traces[0]!));
    expect(Math.min(...inner.bodies.x)).toBe(0);
    expect(Math.max(...inner.bodies.x)).toBeCloseTo((c.offsets.bdPos * 0.25) / 2, 12);
    // The inner box's mean line (meanline visible).
    expect(inner.means.starts.length).toBe(1);
  });
});

describe('violin hover', () => {
  it('labels the statistics and the density at the pointer', () => {
    const { calcs, traces, fullLayout, x, y } = calcAll([{ x: A.map(() => 0), y: A }]);
    const c = calcs[0]!;
    const ctx: HoverContext = {
      fullLayout,
      xaxis: x,
      yaxis: y,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 100, offsetX: 100, scaleY: 10, offsetY: 50 },
    };
    const q: HoverQuery = { px: 100, py: 5 * 10 + 50, xl: 0, yl: 5, mode: 'closest', distance: 20 };
    const points = violin.hoverPoints!(c, traces[0]!, q, ctx);
    const kde = points[0]!;
    expect(kde.hoverText).toMatch(/^\(0, y: 5, kde: 0\.\d{3}\)$/);
    const density = kdeAt(A, c.bandwidth[0]!, 5);
    expect(kde.fields?.['kde']).toBeCloseTo(density / c.maxKDE, 12);
    expect(kde.px).toBeCloseTo(100 + (100 * density) / c.scale[0]!, 9);
    expect(points.slice(1).map((p) => p.fields?.['stat'])).toEqual([
      'max',
      'uf',
      'q3',
      'med',
      'q1',
      'lf',
      'min',
    ]);
    expect(points.every((p) => p.multi)).toBe(true);
    // Beyond the span: nothing.
    expect(violin.hoverPoints!(c, traces[0]!, { ...q, yl: 40, py: 450 }, ctx)).toEqual([]);
  });
});
