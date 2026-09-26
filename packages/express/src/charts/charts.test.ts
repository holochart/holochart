/** The rest of the M3 catalogue (plan E23.6): each function's px trace structure. */
import { HOLOCHART_COLORWAY } from '@mk7s/holochart-core';
import { describe, expect, it, vi } from 'vitest';
import {
  area,
  box,
  densityContour,
  densityHeatmap,
  distplot,
  parallelCategories,
  parallelCoordinates,
  pie,
  scatter,
  scatterMatrix,
  strip,
  timeline,
  violin,
} from '../index.ts';

vi.mock('@mk7s/holochart-runtime', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  newPlot: vi.fn(async (el: unknown, figure: unknown) => ({ el, figure })),
}));

const tips = [
  { total_bill: 10, tip: 1, sex: 'Female', day: 'Sun', size: 2 },
  { total_bill: 12, tip: 2, sex: 'Male', day: 'Sat', size: 3 },
  { total_bill: 14, tip: 3, sex: 'Female', day: 'Sat', size: 4 },
  { total_bill: 16, tip: 2, sex: 'Male', day: 'Sun', size: 2 },
];

describe('box, violin and strip', () => {
  it('px.box: one aligned box per group at category " "', () => {
    const f = box(tips, { x: 'day', y: 'tip', color: 'sex', points: 'all' });
    expect(f.data[0]).toMatchObject({
      type: 'box',
      name: 'Female',
      alignmentgroup: 'True',
      offsetgroup: 'Female',
      boxpoints: 'all',
      notched: false,
      x0: ' ',
      y0: ' ',
      orientation: 'v',
      marker: { color: HOLOCHART_COLORWAY[0] },
      hovertemplate: 'sex=Female<br>day=%{x}<br>tip=%{y}<extra></extra>',
    });
    expect(f.layout['boxmode']).toBe('group');
    // Color on the category axis overlays (each category has one box).
    expect(box(tips, { x: 'day', y: 'tip', color: 'day' }).layout['boxmode']).toBe('overlay');
    // Only x: horizontal.
    expect(box(tips, { x: 'tip' }).data[0]?.['orientation']).toBe('h');
    expect(box(tips, { x: 'tip', y: 'day' }).data[0]?.['orientation']).toBe('h');
  });

  it('px.violin: scalegroup, box and points', () => {
    const f = violin(tips, { y: 'tip', box: true, points: false, violinmode: 'overlay' });
    expect(f.data[0]).toMatchObject({
      type: 'violin',
      scalegroup: 'True',
      box: { visible: true },
      points: false,
    });
    expect(f.layout['violinmode']).toBe('overlay');
  });

  it('px.strip: all points, invisible box, jitter', () => {
    const f = strip(tips, { x: 'day', y: 'total_bill', color: 'sex', jitter: 0.5 });
    expect(f.data[1]).toMatchObject({
      type: 'box',
      boxpoints: 'all',
      pointpos: 0,
      hoveron: 'points',
      jitter: 0.5,
      fillcolor: 'rgba(255,255,255,0)',
      line: { color: 'rgba(255,255,255,0)' },
      marker: { color: HOLOCHART_COLORWAY[1] },
    });
    expect(f.layout['boxmode']).toBe('group');
  });
});

describe('area, pie and timeline', () => {
  it('px.area stacks lines filled to the previous', () => {
    const f = area(tips, {
      x: 'day',
      y: 'tip',
      color: 'sex',
      groupnorm: 'fraction',
      lineShape: 'spline',
    });
    expect(f.data[0]).toMatchObject({
      stackgroup: '1',
      groupnorm: 'fraction',
      mode: 'lines',
      line: { color: HOLOCHART_COLORWAY[0], shape: 'spline' },
    });
  });

  it('px.pie: labels, values, discrete sector colors, hole, category order', () => {
    const f = pie(tips, {
      names: 'day',
      values: 'tip',
      color: 'day',
      hole: 0.4,
      colorDiscreteMap: { Sat: 'gold' },
      categoryOrders: { day: ['Sat', 'Sun'] },
    });
    expect(f.data[0]).toMatchObject({
      type: 'pie',
      labels: ['Sat', 'Sat', 'Sun', 'Sun'],
      values: [2, 3, 1, 2],
      hole: 0.4,
      showlegend: true,
      sort: false,
      direction: 'clockwise',
      marker: { colors: ['gold', 'gold', HOLOCHART_COLORWAY[1], HOLOCHART_COLORWAY[1]] },
      hovertemplate: 'day=%{label}<br>tip=%{value}<extra></extra>',
    });
    const numeric = pie(tips, {
      names: 'day',
      values: 'tip',
      color: 'size',
      colorDiscreteSequence: ['red'],
    });
    expect(numeric.data[0]?.['marker']).toEqual({ colors: [2, 3, 4, 2], coloraxis: 'coloraxis' });
    expect(numeric.layout['piecolorway']).toEqual(['red']);
  });

  it('px.timeline: base = start, x = duration in ms, date x axis, overlay', () => {
    const f = timeline(
      [
        { task: 'A', start: '2026-03-01', end: '2026-03-03', team: 'x' },
        { task: 'B', start: '2026-03-02', end: 'nope', team: 'y' },
      ],
      { xStart: 'start', xEnd: 'end', y: 'task', color: 'team' },
    );
    expect(f.data[0]).toMatchObject({
      type: 'bar',
      orientation: 'h',
      base: ['2026-03-01'],
      x: [2 * 86_400_000],
      y: ['A'],
      hovertemplate: 'team=x<br>start=%{base}<br>end=%{x}<br>task=%{y}<extra></extra>',
    });
    expect(f.data[1]?.['x']).toEqual([null]);
    expect(f.layout['barmode']).toBe('overlay');
    expect(f.layout['xaxis']).toMatchObject({ type: 'date' });
    expect(f.layout['xaxis']).not.toHaveProperty('title');
    expect(() => timeline(tips, { xStart: 'day' } as never)).toThrow(/both xStart and xEnd/);
  });
});

describe('densities', () => {
  it('px.density_heatmap: histogram2d on coloraxis, count colorbar', () => {
    const f = densityHeatmap(tips, { x: 'total_bill', y: 'tip', nbinsx: 5 });
    expect(f.data[0]).toEqual({
      type: 'histogram2d',
      name: '',
      coloraxis: 'coloraxis',
      nbinsx: 5,
      xbingroup: 'x',
      ybingroup: 'y',
      x: [10, 12, 14, 16],
      y: [1, 2, 3, 2],
      xaxis: 'x',
      yaxis: 'y',
      hovertemplate: 'total_bill=%{x}<br>tip=%{y}<br>count=%{z}<extra></extra>',
    });
    expect(f.layout['coloraxis']).toMatchObject({ colorbar: { title: { text: 'count' } } });
    const z = densityHeatmap(tips, { x: 'total_bill', y: 'tip', z: 'size', histfunc: 'avg' });
    expect(z.data[0]?.['hovertemplate']).toBe(
      'total_bill=%{x}<br>tip=%{y}<br>avg of size=%{z}<extra></extra>',
    );
    expect(z.layout['coloraxis']).toMatchObject({ colorbar: { title: { text: 'avg of size' } } });
  });

  it('px.density_contour: line-colored contours per group', () => {
    const f = densityContour(tips, { x: 'total_bill', y: 'tip', color: 'sex', marginalX: 'box' });
    expect(f.data.map((t) => t['type'])).toEqual([
      'histogram2dcontour',
      'box',
      'histogram2dcontour',
      'box',
    ]);
    expect(f.data[0]).toMatchObject({
      contours: { coloring: 'none' },
      line: { color: HOLOCHART_COLORWAY[0] },
      legendgroup: 'Female',
    });
    expect(f.data[1]).toMatchObject({ marker: { color: HOLOCHART_COLORWAY[0] } });
  });
});

describe('multidimensional', () => {
  it('px.scatter_matrix: numeric dimensions by default, no diagonal, select dragmode', () => {
    const f = scatterMatrix(tips, { color: 'sex', labels: { tip: 'Tip' } });
    expect(f.data[0]).toMatchObject({
      type: 'splom',
      name: 'Female',
      diagonal: { visible: false },
      dimensions: [
        { label: 'total_bill', values: [10, 14], axis: { matches: true } },
        { label: 'Tip', values: [1, 3], axis: { matches: true } },
        { label: 'size', values: [2, 4], axis: { matches: true } },
      ],
    });
    expect(f.data[0]).not.toHaveProperty('xaxis');
    expect(f.layout['dragmode']).toBe('select');
    expect(f.layout).not.toHaveProperty('xaxis');
  });

  it('px.parallel_coordinates and parallel_categories: dimensions and a line colorscale', () => {
    const f = parallelCoordinates(tips, { color: 'size', rangeColor: [0, 5] });
    expect(f.data[0]).toMatchObject({
      type: 'parcoords',
      domain: { x: [0, 1], y: [0, 1] },
      line: {
        color: [2, 3, 4, 2],
        showscale: true,
        cmin: 0,
        cmax: 5,
        colorbar: { title: { text: 'size' } },
      },
    });
    expect((f.data[0]?.['dimensions'] as { label: string }[]).map((d) => d.label)).toEqual([
      'total_bill',
      'tip',
      'size',
    ]);
    expect(f.data[0]).not.toHaveProperty('hovertemplate');
    const c = parallelCategories(tips, { dimensionsMaxCardinality: 2 });
    expect((c.data[0]?.['dimensions'] as { label: string }[]).map((d) => d.label)).toEqual([
      'sex',
      'day',
    ]);
    expect(() => parallelCategories(tips, { color: 'sex' })).toThrow(/must be a numeric column/);
  });
});

describe('rendering overload', () => {
  it('renders with newPlot when given an element first', async () => {
    const el = { nodeType: 1, tagName: 'DIV' } as unknown as HTMLElement;
    const result = (await scatter(el, tips, { x: 'tip', y: 'tip' })) as unknown as {
      el: unknown;
      figure: unknown;
    };
    expect(result.el).toBe(el);
    expect(result.figure).toEqual(scatter(tips, { x: 'tip', y: 'tip' }));
    const d = (await distplot(el, [[1, 2, 3]], ['a'])) as unknown as { figure: unknown };
    expect(d.figure).toEqual(distplot([[1, 2, 3]], ['a']));
    await expect(scatter(el, tips, { x: 'nope' })).rejects.toThrow(/not the name of a column/);
  });
});
