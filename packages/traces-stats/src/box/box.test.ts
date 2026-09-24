import { createScale, supplyDefaults, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { IDENTITY_TRANSFORM } from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CrossTraceContext,
  type DescribeContext,
  type HoverContext,
  type HoverQuery,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { box, type BoxCalc } from './index.ts';
import { boxShapes } from './geometry.ts';
import { boxShapeOptions } from './plot.ts';
import { boxLegendIcon, pointStyle } from './style.ts';
import { layoutOffsets, type OffsetInput } from './offsets.ts';

const registry = createChartRegistry().register(box);

function defaults(data: unknown[], layout: Record<string, unknown> = {}) {
  const traces = data.map((t) => ({ type: 'box', ...(t as object) }));
  return supplyDefaults({ data: traces, layout }, registry.core);
}

function axis(
  id: string,
  type: 'linear' | 'log' | 'date' | 'category',
  categories?: string[],
  range: [number, number] = [0, 1],
): AxisInfo {
  const scale = createScale({ type, range, ...(categories ? { categories } : {}) });
  return { id, scale, type, letter: id.charAt(0), full: { type } } as unknown as AxisInfo;
}

function calcAll(data: unknown[], layout: Record<string, unknown>, x: AxisInfo, y: AxisInfo) {
  const { fullData, fullLayout } = defaults(data, layout);
  const calcs = fullData.map((trace, index) =>
    box.calc!(trace, { fullLayout, index, xaxis: x, yaxis: y }),
  );
  box.crossTraceCalc!(
    fullData.map((trace, index) => ({ trace, index, calc: calcs[index]! })),
    { fullLayout, xaxis: x, yaxis: y, subplot: {} as never } satisfies CrossTraceContext,
  );
  return { traces: fullData as FullTrace[], calcs: calcs as BoxCalc[], fullLayout };
}

const SAMPLE = [-10, 1, 2, 3, 4, 5, 6, 7, 8, 30];

describe('box defaults', () => {
  it('infers the orientation and places sample boxes at their names on a category axis', () => {
    const { fullData, fullLayout } = defaults([
      { name: 'A', y: [1, 2, 3] },
      { name: 'B', x: [1, 2, 3] },
    ]);
    expect(fullData[0]?.['orientation']).toBe('v');
    expect(fullData[1]?.['orientation']).toBe('h');
    // The position is written as a one-element array, so the axis types and collects it.
    expect(fullData[0]?.['x']).toEqual(['A']);
    expect(fullData[0]?.['_posImplicit']).toBe(true);
    expect((fullLayout['xaxis'] as { type: string }).type).toBe('category');
    expect(fullLayout['boxmode']).toBe('overlay');
    expect(fullLayout['boxgap']).toBe(0.3);
    expect(fullLayout['boxgroupgap']).toBe(0.3);
    expect(fullLayout['_numBoxes']).toBe(2);
  });

  it('uses numeric names on linear axes and the trace index otherwise', () => {
    const { fullData } = defaults(
      [
        { name: '5', y: [1, 2] },
        { name: 'label', y: [1, 2] },
      ],
      { xaxis: { type: 'linear' } },
    );
    expect(fullData[0]?.['x']).toEqual(['5']);
    expect(fullData[1]?.['x']).toEqual([1]);
  });

  it('defaults boxpoints, jitter and pointpos like Plotly', () => {
    const { fullData } = defaults([
      { y: [1] },
      { y: [1], marker: { outliercolor: 'red' } },
      { y: [1], boxpoints: 'all' },
      { y: [1], boxpoints: false },
    ]);
    expect(fullData.map((t) => t['boxpoints'])).toEqual([
      'outliers',
      'suspectedoutliers',
      'all',
      false,
    ]);
    expect(fullData[2]?.['jitter']).toBe(0.3);
    expect(fullData[2]?.['pointpos']).toBe(-1.5);
    expect(fullData[0]?.['jitter']).toBe(0);
    expect(fullData[3]?.['marker']).toBeUndefined();
    const marker = fullData[1]?.['marker'] as { color: string; line: { outliercolor: string } };
    expect(marker.line.outliercolor).toBe(marker.color);
  });

  it('defaults colors from the line color (fill at half opacity)', () => {
    const { fullData } = defaults([{ y: [1], line: { color: '#ff0000' } }]);
    const line = fullData[0]?.['line'] as { color: string };
    expect(fullData[0]?.['fillcolor']).toBe('rgba(255, 0, 0, 0.5)');
    expect((fullData[0]?.['marker'] as { color: string }).color).toBe(line.color);
  });

  it('turns notches on with notchwidth, and whiskers off in sd mode', () => {
    const { fullData } = defaults([
      { y: [1], notchwidth: 0.1 },
      { y: [1], sizemode: 'sd' },
    ]);
    expect(fullData[0]?.['notched']).toBe(true);
    expect(fullData[1]?.['showwhiskers']).toBe(false);
    expect(fullData[1]?.['boxmean']).toBeUndefined();
  });

  it('detects precomputed statistics, with boxmean and notches from mean/sd/notchspan', () => {
    const { fullData } = defaults([
      { q1: [1, 2], median: [2, 3], q3: [3, 4], mean: [2, 3], sd: [1, 1], notchspan: [0.2, 0.2] },
    ]);
    const t = fullData[0]!;
    expect(t['_hasPreCompStats']).toBe(true);
    expect(t['_length']).toBe(2);
    expect(t['orientation']).toBe('v');
    expect(t['x0']).toBe(0);
    expect(t['dx']).toBe(1);
    expect(t['boxmean']).toBe('sd');
    expect(t['notched']).toBe(true);
    expect(t['boxpoints']).toBe('all');
  });

  it('records offset groups per alignment group in group mode', () => {
    const { fullData, fullLayout } = defaults(
      [
        { y: [1], offsetgroup: 'a' },
        { y: [1], offsetgroup: 'b' },
        { y: [1], offsetgroup: 'a' },
      ],
      { boxmode: 'group' },
    );
    expect(fullLayout['_boxAlignment']).toEqual({ 'x|v|': ['a', 'b'] });
    expect(fullData.map((t) => t['_offsetIndex'])).toEqual([0, 1, 0]);
  });
});

describe('box calc', () => {
  const x = axis('x', 'category', ['a', 'b']);
  const y = axis('y', 'linear');

  it('groups samples by position and computes Plotly’s statistics', () => {
    const { calcs } = calcAll(
      [{ x: [...SAMPLE.map(() => 'a'), 'b', 'b', 'b'], y: [...SAMPLE, 1, 2, 3] }],
      {},
      x,
      y,
    );
    const c = calcs[0]!;
    expect(c.count).toBe(2);
    expect([...c.pos]).toEqual([0, 1]);
    expect(c.stats.n[0]).toBe(10);
    expect([c.stats.q1[0], c.stats.med[0], c.stats.q3[0]]).toEqual([2, 4.5, 7]);
    expect([c.stats.lf[0], c.stats.uf[0]]).toEqual([1, 8]);
    expect([c.stats.min[0], c.stats.max[0]]).toEqual([-10, 30]);
    // Only the two samples beyond the fences are drawn (`outliers`).
    const shown = [...c.samples.shown.subarray(0, 10)];
    expect(shown).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(c.valueRange).toEqual([-10, 30]);
  });

  it('tags suspected outliers between the fences and 3 IQR', () => {
    const { calcs } = calcAll(
      [{ x: [...SAMPLE, 0].map(() => 'a'), y: [...SAMPLE, 40], boxpoints: 'suspectedoutliers' }],
      {},
      x,
      y,
    );
    const c = calcs[0]!;
    // q1 = 2.25, q3 = 7.75: fences at 1 and 8; 3 IQR bounds at −14.25 and 24.25. Samples between
    // the fences and those bounds are suspected outliers (outlier style); farther ones are not.
    expect([c.stats.lo[0], c.stats.uo[0]]).toEqual([-14.25, 24.25]);
    const at = (v: number) => c.samples.value.indexOf(v);
    expect([c.samples.shown[at(-10)], c.samples.suspected[at(-10)]]).toEqual([1, 1]);
    expect([c.samples.shown[at(30)], c.samples.suspected[at(30)]]).toEqual([1, 0]);
    expect([c.samples.shown[at(40)], c.samples.suspected[at(40)]]).toEqual([1, 0]);
    expect(c.samples.shown[at(5)]).toBe(0);
  });

  it('uses the quartile method', () => {
    const data = { x: [1, 1, 1, 1, 1, 1, 1, 1, 1], y: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
    const lin = axis('x', 'linear');
    const q = (method: string) => {
      const c = calcAll([{ ...data, quartilemethod: method }], {}, lin, y).calcs[0]!;
      return [c.stats.q1[0], c.stats.q3[0]];
    };
    expect(q('linear')).toEqual([2.75, 7.25]);
    expect(q('exclusive')).toEqual([2.5, 7.5]);
    expect(q('inclusive')).toEqual([3, 7]);
  });

  it('reads precomputed statistics and fills in missing ones like Plotly', () => {
    const lin = axis('x', 'linear');
    const { calcs } = calcAll(
      [
        {
          x: [1, 2, 3],
          q1: [2, 5, 2],
          median: [3, 6, 3],
          q3: [5, 8, 5],
          lowerfence: [0, 99],
          upperfence: [9],
          y: [[3], [1, 5, 6, 7, 20], []],
        },
      ],
      {},
      lin,
      y,
    );
    const c = calcs[0]!;
    expect(c.precomputed).toBe(true);
    expect([...c.pos]).toEqual([1, 2, 3]);
    expect([c.stats.lf[0], c.stats.uf[0]]).toEqual([0, 9]);
    // An invalid lower fence (above q1) and a missing upper fence come from the samples.
    expect([c.stats.lf[1], c.stats.uf[1]]).toEqual([1, 8]);
    // Without mean/sd: from the samples, else (q1 + q3) / 2 and q3 − q1.
    expect([c.stats.mean[0], c.stats.sd[0]]).toEqual([3, 0]);
    expect([c.stats.mean[2], c.stats.sd[2]]).toEqual([3.5, 3]);
    expect([c.stats.lf[2], c.stats.uf[2]]).toEqual([2, 5]);
    expect(c.stats.mean[1]).toBeCloseTo(7.8, 12);
    // Points: all samples (the default with precomputed statistics); min/max include them.
    expect(c.stats.max[1]).toBe(20);
    expect(c.samples.shown.reduce((a, v) => a + v, 0)).toBe(6);
  });

  it('draws invalid precomputed statistics as a line', () => {
    const lin = axis('x', 'linear');
    const c = calcAll([{ q1: [5], median: [3], q3: [4] }], {}, lin, y).calcs[0]!;
    expect([c.stats.q1[0], c.stats.q3[0], c.stats.lf[0]]).toEqual([3, 3, 3]);
  });

  it('puts calc values in raw units on log axes and ms on date axes', () => {
    const log = axis('y', 'log', undefined, [0, 3]);
    const c = calcAll([{ y: [10, 100, 1000] }], {}, axis('x', 'category', ['trace 0']), log)
      .calcs[0]!;
    expect(c.stats.med[0]).toBe(100);
    const date = axis('y', 'date');
    const d = calcAll([{ y: ['2026-01-01', '2026-01-03'] }], {}, x, date).calcs[0]!;
    expect(d.stats.min[0]).toBe(Date.UTC(2026, 0, 1));
  });
});

describe('box layout (offsets)', () => {
  const base: OffsetInput = {
    pos: [0, 1, 2],
    width: 0,
    num: 0,
    offsetIndex: 0,
    offsetGroups: 0,
    side: 'both',
    hasPoints: false,
    pointpos: 0,
    jitter: 0,
    markerSize: 6,
  };
  const options = { mode: 'overlay' as const, gap: 0.3, groupgap: 0.3, total: 1, category: false };

  it('overlay: half-width 0.5 · 0.7 · 0.7 of the position spacing', () => {
    const [o] = layoutOffsets([base], options);
    expect(o!.dPos).toBe(0.5);
    expect(o!.bdPos).toBeCloseTo(0.245, 12);
    expect(o!.bPos).toBe(0);
    expect(o!.wHover).toBe(0.5);
  });

  it('group: traces side by side in their share of the slot', () => {
    const out = layoutOffsets([base, { ...base, num: 1 }], {
      ...options,
      mode: 'group',
      total: 2,
    });
    expect(out[0]!.bdPos).toBeCloseTo((0.5 * 0.7 * 0.7) / 2, 12);
    expect(out[0]!.bPos).toBeCloseTo(-0.175, 12);
    expect(out[1]!.bPos).toBeCloseTo(0.175, 12);
    expect(out[0]!.wHover).toBeCloseTo(0.175, 12);
  });

  it('group with offset groups: one slot per offset group', () => {
    const out = layoutOffsets(
      [
        { ...base, offsetGroups: 2, offsetIndex: 0 },
        { ...base, num: 1, offsetGroups: 2, offsetIndex: 1 },
        { ...base, num: 2, offsetGroups: 2, offsetIndex: 0 },
      ],
      { ...options, mode: 'group', total: 3 },
    );
    expect(out[0]!.bPos).toBeCloseTo(out[2]!.bPos, 12);
    expect(out[1]!.bPos).toBeCloseTo(-out[0]!.bPos, 12);
  });

  it('a fixed width sets the half-width and pads the axis 5%', () => {
    const [o] = layoutOffsets([{ ...base, width: 0.4 }], options);
    expect([o!.bdPos, o!.dPos, o!.bPos]).toEqual([0.2, 0.2, 0]);
    expect(o!.extremes.min[0]).toEqual({ l: -0.2, padPx: 0, extrapad: true });
  });

  it('pads the position axis for points drawn beside the boxes', () => {
    const [o] = layoutOffsets([{ ...base, hasPoints: true, pointpos: -1.8, jitter: 0.3 }], options);
    // Points reach 2.1 half-widths to the left: past the push value, so padded with the radius.
    expect(o!.extremes.min[0]!.l).toBeCloseTo(-0.245 * 2.1, 12);
    expect(o!.extremes.min[0]!.padPx).toBe(3);
    expect(o!.extremes.max[0]).toEqual({ l: 2.5, padPx: 0, extrapad: true });
  });

  it('categories are one slot apart whatever the positions', () => {
    const [o] = layoutOffsets([{ ...base, pos: [0, 2] }], { ...options, category: true });
    expect(o!.dPos).toBe(0.5);
  });

  it('cross-trace calc groups every box trace of the subplot', () => {
    const x = axis('x', 'category', ['a']);
    const { calcs } = calcAll(
      [
        { x: ['a', 'a'], y: [1, 2] },
        { x: ['a', 'a'], y: [3, 4] },
      ],
      { boxmode: 'group' },
      x,
      axis('y', 'linear'),
    );
    expect(calcs[0]!.offsets.bPos).toBeCloseTo(-0.175, 12);
    expect(calcs[1]!.offsets.bPos).toBeCloseTo(0.175, 12);
  });
});

describe('box geometry', () => {
  const x = axis('x', 'linear');
  const y = axis('y', 'linear');

  it('draws a ring from mid-q1, a median, whiskers and caps', () => {
    const { calcs, traces } = calcAll([{ x: [0, 0, 0, 0, 0], y: [1, 2, 3, 4, 5] }], {}, x, y);
    const c = calcs[0]!;
    const shapes = boxShapes(c, boxShapeOptions(c, traces[0]!));
    const bd = c.offsets.bdPos;
    // Ring: 4 corners.
    expect(shapes.bodies.rings.length).toBe(1);
    expect([...shapes.bodies.x]).toEqual([-bd, -bd, bd, bd]);
    expect([...shapes.bodies.y]).toEqual([
      c.stats.q1[0],
      c.stats.q3[0],
      c.stats.q3[0],
      c.stats.q1[0],
    ]);
    // Outline ring (6 vertices, starting and ending mid-edge), median, 2 whiskers, 2 caps.
    expect(shapes.outlines.starts.length).toBe(6);
    expect(shapes.outlines.x[0]).toBe(0);
    expect(shapes.outlines.x[5]).toBe(0);
    expect(shapes.means.starts.length).toBe(0);
  });

  it('notches the box at the median confidence interval', () => {
    const { calcs, traces } = calcAll(
      [{ x: [0, 0, 0, 0, 0], y: [1, 2, 3, 4, 5], notched: true, boxmean: 'sd' }],
      {},
      x,
      y,
    );
    const c = calcs[0]!;
    const shapes = boxShapes(c, boxShapeOptions(c, traces[0]!));
    expect(shapes.bodies.x.length).toBe(10);
    // The notch tip sits at the median, 1 − 2·0.25 of the half-width from the center.
    expect(shapes.bodies.x[2]).toBeCloseTo(-c.offsets.bdPos * 0.5, 12);
    expect(shapes.bodies.y[2]).toBe(c.stats.med[0]);
    // Mean line and ± sd diamond.
    expect(shapes.means.starts.length).toBe(2);
  });

  it('whiskers reach min/max without points (Plotly)', () => {
    const { calcs, traces } = calcAll(
      [{ x: SAMPLE.map(() => 0), y: SAMPLE, boxpoints: false }],
      {},
      x,
      y,
    );
    const c = calcs[0]!;
    const shapes = boxShapes(c, boxShapeOptions(c, traces[0]!));
    const ys = [...shapes.outlines.y];
    expect(ys).toContain(-10);
    expect(ys).toContain(30);
  });
});

describe('box points and style', () => {
  it('places points at pointpos with repeatable jitter', () => {
    const x = axis('x', 'linear');
    const run = () =>
      calcAll([{ x: SAMPLE.map(() => 0), y: SAMPLE, boxpoints: 'all' }], {}, x, axis('y', 'linear'))
        .calcs[0]!;
    const a = run();
    const b = run();
    expect([...a.pointPos]).toEqual([...b.pointPos]);
    const bd = a.offsets.bdPos;
    for (const p of a.pointPos) {
      expect(p).toBeGreaterThanOrEqual(bd * (-1.5 - 0.3) - 1e-12);
      expect(p).toBeLessThanOrEqual(bd * (-1.5 + 0.3) + 1e-12);
    }
  });

  it('styles suspected outliers and dims unselected points', () => {
    const { calcs, traces } = calcAll(
      [
        {
          x: SAMPLE.map(() => 0),
          y: [...SAMPLE.slice(0, 9), 20],
          boxpoints: 'suspectedoutliers',
          marker: { color: '#00ff00', outliercolor: '#ff0000' },
        },
      ],
      {},
      axis('x', 'linear'),
      axis('y', 'linear'),
    );
    const s = pointStyle(calcs[0]!, traces[0]!, new Set([0]));
    expect(s.count).toBe(2);
    expect([...s.color.subarray(0, 4)]).toEqual([1, 0, 0, 1]);
    // Data index 0 (−10) is selected, the other point is dimmed.
    expect(s.opacity[0]).toBe(1);
    expect(s.opacity[1]).toBeCloseTo(0.2, 6);
  });

  it('legend: a filled square, or a marker for strip plots', () => {
    const { fullData } = defaults([
      { y: [1] },
      { y: [1], boxpoints: 'all', fillcolor: 'rgba(0,0,0,0)', line: { width: 0 } },
    ]);
    expect(boxLegendIcon(fullData[0]!).kind).toBe('bar');
    expect(boxLegendIcon(fullData[1]!).kind).toBe('marker');
  });
});

describe('box hover', () => {
  function setup(extra: Record<string, unknown> = {}, layout: Record<string, unknown> = {}) {
    const x = axis('x', 'category', ['a', 'b'], [-0.5, 1.5]);
    const y = axis('y', 'linear', undefined, [-20, 40]);
    const { calcs, traces, fullLayout } = calcAll(
      [{ x: [...SAMPLE.map(() => 'a'), 'b', 'b'], y: [...SAMPLE, 1, 2], ...extra }],
      layout,
      x,
      y,
    );
    const ctx: HoverContext = {
      fullLayout: fullLayout as FullLayout,
      xaxis: x,
      yaxis: y,
      // l → px: x = 100·l + 50, y = 10·l + 200.
      transform: { ...IDENTITY_TRANSFORM, scaleX: 100, offsetX: 50, scaleY: 10, offsetY: 200 },
    };
    return { calc: calcs[0]!, trace: traces[0]!, ctx };
  }
  const query = (xl: number, yl: number, mode: HoverQuery['mode'] = 'closest'): HoverQuery => ({
    px: xl * 100 + 50,
    py: yl * 10 + 200,
    xl,
    yl,
    mode,
    distance: 20,
  });

  it('labels every statistic of the hovered box as one multi-label group', () => {
    const { calc, trace, ctx } = setup();
    const points = box.hoverPoints!(calc, trace, query(0.1, 5), ctx);
    expect(points.map((p) => p.hoverText)).toEqual([
      '(a, max: 30)',
      '(a, upper fence: 8)',
      '(a, q3: 7)',
      '(a, median: 4.5)',
      '(a, q1: 2)',
      '(a, lower fence: 1)',
      '(a, min: −10)',
    ]);
    expect(points.every((p) => p.multi === true && p.pointIndex === -1)).toBe(true);
    expect(points.filter((p) => p.showName !== false).map((p) => p.fields?.['stat'])).toEqual([
      'med',
    ]);
    // Anchored at the box's right edge, at each value.
    const edge = (calc.pos[0]! + calc.offsets.bdPos) * 100 + 50;
    expect(points[3]!.px).toBeCloseTo(edge, 9);
    expect(points[3]!.py).toBeCloseTo(4.5 * 10 + 200, 9);
    expect(points[0]!.distance).toBeLessThan(20);
  });

  it('adds the mean (± σ) with boxmean and plain values in compare modes', () => {
    const { calc, trace, ctx } = setup({ boxmean: 'sd' });
    const points = box.hoverPoints!(calc, trace, query(0, 5, 'x'), ctx);
    const mean = points.find((p) => p.fields?.['stat'] === 'mean')!;
    expect(mean.hoverText).toMatch(/^mean ± σ: 5\.6 ± /);
  });

  it('prefers a point under the pointer in closest mode, shows both in compare modes', () => {
    const { calc, trace, ctx } = setup({ hovertext: SAMPLE.map((v) => `v=${v}`) });
    // The outlier at 30 sits at the box center (pointpos 0, no jitter with outliers).
    const q = query(calc.pos[0]!, 30);
    const closest = box.hoverPoints!(calc, trace, q, ctx);
    expect(closest.length).toBe(1);
    expect(closest[0]!.pointIndex).toBe(9);
    expect(closest[0]!.text).toBe('v=30');
    const compare = box.hoverPoints!(calc, trace, { ...q, mode: 'x' }, ctx);
    expect(compare.length).toBe(8);
  });

  it('hovers nothing outside the boxes', () => {
    const { calc, trace, ctx } = setup();
    // The whole slot hovers (Plotly's `wHover`), but only within the box's value range.
    expect(box.hoverPoints!(calc, trace, query(0.49, 5), ctx).length).toBe(7);
    expect(box.hoverPoints!(calc, trace, query(0.6, 5), ctx)).toEqual([]);
    expect(box.hoverPoints!(calc, trace, query(0, 35), ctx)).toEqual([]);
  });

  it('selects drawn points inside a box selection', () => {
    const { calc, trace, ctx } = setup();
    const picked = box.selectPoints!(calc, trace, { kind: 'rect', x: [-1, 1], y: [20, 40] }, ctx);
    expect(picked).toEqual([9]);
  });
});

describe('box describe', () => {
  it('summarizes medians and lists every box', () => {
    const x = axis('x', 'category', ['a', 'b']);
    const y = axis('y', 'linear');
    const { calcs, traces, fullLayout } = calcAll(
      [{ name: 'Tips', x: ['a', 'a', 'a', 'b', 'b'], y: [1, 2, 3, 10, 12] }],
      {},
      x,
      y,
    );
    const d = box.describe!({
      trace: traces[0]!,
      calc: calcs[0]!,
      index: 0,
      fullLayout,
      xaxis: x,
      yaxis: y,
      maxRows: 100,
    } as DescribeContext<BoxCalc>)!;
    expect(d.kind).toBe('box');
    expect(d.summary).toBe('Box plot "Tips": 2 boxes, 5 samples. Medians from 2 at a to 11 at b.');
    expect(d.table?.rows[1]).toEqual(['b', '2', '10', '10', '11', '12', '12', '11']);
  });
});
