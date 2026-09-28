/**
 * The M5 additions (plan E23.5, E23.6): `agg` on bars and lines (a Holochart extension), and
 * `funnel`, `funnelArea`, `scatterPolar`, `linePolar`, `barPolar` against the trace structure
 * plotly.py's `px.funnel`, `px.funnel_area`, `px.scatter_polar`, `px.line_polar` and
 * `px.bar_polar` write for the same data.
 */
import { DEFAULT_COLORWAY } from '@mk7s/holochart-core';
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import hx, {
  bar,
  barPolar,
  funnel,
  funnelArea,
  line,
  linePolar,
  scatterPolar,
  type AggFunction,
} from '../index.ts';

vi.mock('@mk7s/holochart-runtime', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  newPlot: vi.fn(async (el: unknown, figure: unknown) => ({ el, figure })),
}));

const [C0, C1] = DEFAULT_COLORWAY as unknown as [string, string];
const classic = { template: 'plotly-classic' } as const;

const sales = [
  { day: 'Mon', region: 'N', units: 3, price: 2 },
  { day: 'Tue', region: 'N', units: 5, price: 4 },
  { day: 'Mon', region: 'S', units: 2, price: 6 },
  { day: 'Mon', region: 'N', units: 4, price: null },
  { day: 'Tue', region: 'S', units: 1, price: 3 },
  { day: 'Tue', region: 'N', units: 6, price: 1 },
  { day: null, region: 'S', units: 9, price: 9 },
];

describe('agg (bar, line, area)', () => {
  it('sums the rows of each position per group, titled like a histogram', () => {
    const f = bar(sales, { x: 'day', y: 'units', color: 'region', agg: 'sum', ...classic });
    expect(f.data.map((t) => [t['name'], t['x'], t['y']])).toEqual([
      ['N', ['Mon', 'Tue'], [7, 11]],
      ['S', ['Mon', 'Tue'], [2, 1]],
    ]);
    expect(f.data[0]?.['hovertemplate']).toBe(
      'region=N<br>day=%{x}<br>sum of units=%{y}<extra></extra>',
    );
    expect(f.layout['yaxis']).toMatchObject({ title: { text: 'sum of units' } });
  });

  it('avg / min / max / median / count skip missing values; a function names its label', () => {
    const by = (agg: AggFunction) => bar(sales, { x: 'day', y: 'price', agg }).data[0]?.['y'];
    expect(by('avg')).toEqual([4, 8 / 3]);
    expect(by('min')).toEqual([2, 1]);
    expect(by('max')).toEqual([6, 4]);
    expect(by('median')).toEqual([4, 3]);
    expect(by('count')).toEqual([2, 3]);
    const range = (v: number[]) => Math.max(...v) - Math.min(...v);
    const f = bar(sales, { x: 'day', y: 'price', agg: range });
    expect(f.data[0]?.['y']).toEqual([4, 3]);
    expect(f.layout['yaxis']).toMatchObject({ title: { text: 'range of price' } });
    // All values missing: no bar height (pandas' mean of nothing); sum is 0.
    const empty = [{ k: 'a', v: null }];
    expect(bar(empty, { x: 'k', y: 'v', agg: 'avg' }).data[0]?.['y']).toEqual([null]);
    expect(bar(empty, { x: 'k', y: 'v', agg: 'sum' }).data[0]?.['y']).toEqual([0]);
  });

  it('counts rows with only the position column; a lone y is horizontal', () => {
    const f = bar(sales, { x: 'day', agg: 'count' });
    expect(f.data[0]).toMatchObject({
      orientation: 'v',
      x: ['Mon', 'Tue'],
      y: [3, 3],
      hovertemplate: 'day=%{x}<br>count=%{y}<extra></extra>',
    });
    expect(f.layout['yaxis']).toMatchObject({ title: { text: 'count' } });
    const h = bar(sales, { y: 'region', agg: 'count' });
    expect(h.data[0]).toMatchObject({ orientation: 'h', y: ['N', 'S'], x: [4, 3] });
    // Horizontal with both: grouped by y.
    const hb = bar(sales, { x: 'units', y: 'region', agg: 'max' });
    expect(hb.data[0]).toMatchObject({ orientation: 'h', y: ['N', 'S'], x: [6, 9] });
    expect(() => bar(sales, { x: 'day', agg: 'sum' })).toThrow(/needs 'y'/);
    expect(() => bar(sales, { x: 'day', y: 'units', agg: 'mean' as never })).toThrow(/agg must be/);
  });

  it('line and area: one point per x in first-appearance order', () => {
    const f = line(sales, { x: 'day', y: 'units', agg: 'avg' });
    expect(f.data[0]).toMatchObject({ x: ['Mon', 'Tue'], y: [3, 4], mode: 'lines' });
    const a = hx.area(sales, { x: 'day', y: 'units', color: 'region', agg: 'sum' });
    expect(a.data.map((t) => t['y'])).toEqual([
      [7, 11],
      [2, 1],
    ]);
  });

  it('sums add up to the total of the present values (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            k: fc.constantFrom('a', 'b', 'c', null),
            g: fc.constantFrom('x', 'y'),
            v: fc.oneof(fc.integer({ min: -100, max: 100 }), fc.constant(null)),
          }),
          { minLength: 1, maxLength: 40 },
        ),
        (rows) => {
          const f = bar(rows, { x: 'k', y: 'v', color: 'g', agg: 'sum' });
          const total = f.data.flatMap((t) => t['y'] as number[]).reduce((s, v) => s + v, 0);
          const expected = rows
            .filter((r) => r.k !== null && r.v !== null)
            .reduce((s, r) => s + (r.v as number), 0);
          expect(total).toBe(expected);
          for (const t of f.data) {
            const xs = t['x'] as unknown[];
            expect(new Set(xs).size).toBe(xs.length);
          }
        },
      ),
    );
  });
});

const stages = [
  { stage: 'Visit', office: 'Montreal', number: 39 },
  { stage: 'Download', office: 'Montreal', number: 27.4 },
  { stage: 'Visit', office: 'Toronto', number: 52 },
  { stage: 'Download', office: 'Toronto', number: 36 },
];

describe('px parity: funnels', () => {
  it('px.funnel(df, x="number", y="stage", color="office")', () => {
    const f = funnel(stages, { x: 'number', y: 'stage', color: 'office', ...classic });
    expect(f.data[0]).toEqual({
      type: 'funnel',
      name: 'Montreal',
      legendgroup: 'Montreal',
      showlegend: true,
      marker: { color: C0 },
      orientation: 'h',
      x: [39, 27.4],
      y: ['Visit', 'Download'],
      hovertemplate: 'office=Montreal<br>number=%{x}<br>stage=%{y}<extra></extra>',
      xaxis: 'x',
      yaxis: 'y',
    });
    expect(f.data[1]?.['marker']).toEqual({ color: C1 });
    expect(f.layout).toMatchObject({
      legend: { title: { text: 'office' }, tracegroupgap: 0 },
      xaxis: { title: { text: 'number' } },
      yaxis: { title: { text: 'stage' } },
    });
    // Vertical when y holds the values; opacity on the trace (px); facets.
    const v = funnel(stages, { x: 'stage', y: 'number', opacity: 0.5, facetCol: 'office' });
    expect(v.data[0]).toMatchObject({ orientation: 'v', opacity: 0.5, xaxis: 'x' });
    expect(v.data[1]).toMatchObject({ xaxis: 'x2' });
  });

  it('px.funnel_area(df, names="stage", values="number")', () => {
    const f = funnelArea(stages, { names: 'stage', values: 'number' });
    expect(f.data).toEqual([
      {
        type: 'funnelarea',
        name: '',
        legendgroup: '',
        showlegend: true,
        labels: ['Visit', 'Download', 'Visit', 'Download'],
        values: [39, 27.4, 52, 36],
        hovertemplate: 'stage=%{label}<br>number=%{value}<extra></extra>',
        domain: { x: [0, 1], y: [0, 1] },
      },
    ]);
    // color: discrete sector colors (the map, then the sequence from where the map leaves it, as
    // px), listed in the hover label; the sequence also as funnelareacolorway.
    const c = funnelArea(stages, {
      names: 'stage',
      values: 'number',
      color: 'office',
      colorDiscreteSequence: ['red', 'blue'],
      colorDiscreteMap: { Toronto: 'green' },
    });
    expect(c.data[0]).toMatchObject({
      marker: { colors: ['blue', 'blue', 'green', 'green'] },
      customdata: [['Montreal'], ['Montreal'], ['Toronto'], ['Toronto']],
      hovertemplate: 'stage=%{label}<br>number=%{value}<br>office=%{customdata[0]}<extra></extra>',
    });
    expect(c.layout['funnelareacolorway']).toEqual(['red', 'blue']);
    // A numeric color stays discrete.
    const n = funnelArea(stages, { names: 'stage', values: 'number', color: 'number' });
    expect(n.layout['coloraxis']).toBeUndefined();
    expect((n.data[0]?.['marker'] as Record<string, unknown>)['colors']).toHaveLength(4);
    expect(funnelArea(stages, { values: 'number' }).data[0]?.['showlegend']).toBe(false);
  });
});

const wind = [
  { direction: 'N', strength: '0-1', frequency: 0.5 },
  { direction: 'E', strength: '0-1', frequency: 0.4 },
  { direction: 'S', strength: '0-1', frequency: 0.3 },
  { direction: 'N', strength: '1-2', frequency: 1.2 },
  { direction: 'E', strength: '1-2', frequency: 0.8 },
  { direction: 'S', strength: '1-2', frequency: 1.5 },
];
const polarLayout = {
  domain: { x: [0, 1], y: [0, 1] },
  angularaxis: { direction: 'clockwise', rotation: 90 },
  radialaxis: {},
};

describe('px parity: polar charts', () => {
  it('px.scatter_polar(df, r, theta, color, symbol, size)', () => {
    const f = scatterPolar(wind, {
      r: 'frequency',
      theta: 'direction',
      color: 'strength',
      symbol: 'strength',
      size: 'frequency',
      ...classic,
    });
    expect(f.data[0]).toEqual({
      type: 'scatterpolar',
      name: '0-1',
      legendgroup: '0-1',
      showlegend: true,
      marker: {
        color: C0,
        symbol: 'circle',
        size: [0.5, 0.4, 0.3],
        sizemode: 'area',
        sizeref: (2 * 1.5) / 400,
      },
      mode: 'markers',
      r: [0.5, 0.4, 0.3],
      theta: ['N', 'E', 'S'],
      // px's hover label dict: `frequency` first for r, then overwritten in place by size.
      hovertemplate:
        'strength=0-1<br>frequency=%{marker.size}<br>direction=%{theta}<extra></extra>',
      subplot: 'polar',
    });
    expect(f.data[1]?.['marker']).toMatchObject({ color: C1, symbol: 'diamond' });
    expect(f.layout['polar']).toEqual(polarLayout);
    expect(f.layout['legend']).toMatchObject({
      title: { text: 'strength' },
      itemsizing: 'constant',
    });
  });

  it('continuous color, text, axes options and category orders', () => {
    const f = scatterPolar(wind, {
      r: 'frequency',
      theta: 'direction',
      color: 'frequency',
      text: 'strength',
      direction: 'counterclockwise',
      startAngle: 0,
      rangeR: [1, 100],
      logR: true,
      rangeTheta: [0, 180],
      categoryOrders: { direction: ['N', 'S', 'E'] },
    });
    expect(f.data[0]).toMatchObject({
      mode: 'markers+text',
      marker: { color: [0.5, 0.4, 0.3, 1.2, 0.8, 1.5], coloraxis: 'coloraxis' },
    });
    expect(f.layout['coloraxis']).toMatchObject({ colorbar: { title: { text: 'frequency' } } });
    expect(f.layout['polar']).toEqual({
      domain: { x: [0, 1], y: [0, 1] },
      angularaxis: {
        direction: 'counterclockwise',
        rotation: 0,
        categoryorder: 'array',
        categoryarray: ['N', 'S', 'E'],
      },
      radialaxis: { type: 'log', range: [0, 2] },
      sector: [0, 180],
    });
  });

  it('px.line_polar(df, r, theta, color, line_close=True)', () => {
    const f = linePolar(wind, {
      r: 'frequency',
      theta: 'direction',
      color: 'strength',
      lineClose: true,
      ...classic,
    });
    expect(f.data[0]).toEqual({
      type: 'scatterpolar',
      name: '0-1',
      legendgroup: '0-1',
      showlegend: true,
      line: { color: C0, dash: 'solid' },
      marker: { symbol: 'circle' },
      mode: 'lines',
      r: [0.5, 0.4, 0.3, 0.5],
      theta: ['N', 'E', 'S', 'N'],
      hovertemplate: 'strength=0-1<br>frequency=%{r}<br>direction=%{theta}<extra></extra>',
      subplot: 'polar',
    });
    const m = linePolar(wind, {
      r: 'frequency',
      theta: 'direction',
      text: 'strength',
      lineShape: 'spline',
    });
    expect(m.data[0]).toMatchObject({ mode: 'lines+markers+text', line: { shape: 'spline' } });
  });

  it('px.bar_polar(df, r, theta, color): a wind rose', () => {
    const f = barPolar(wind, { r: 'frequency', theta: 'direction', color: 'strength', ...classic });
    expect(f.data[0]).toEqual({
      type: 'barpolar',
      name: '0-1',
      legendgroup: '0-1',
      showlegend: true,
      marker: { color: C0 },
      r: [0.5, 0.4, 0.3],
      theta: ['N', 'E', 'S'],
      hovertemplate: 'strength=0-1<br>frequency=%{r}<br>direction=%{theta}<extra></extra>',
      subplot: 'polar',
    });
    expect(f.layout['barmode']).toBe('relative');
    expect(f.layout['polar']).toEqual(polarLayout);
    const o = barPolar(wind, { r: 'frequency', theta: 'direction', barmode: 'overlay' });
    expect(o.layout['polar']).toMatchObject({ barmode: 'overlay' });
    const p = barPolar(wind, { r: 'frequency', theta: 'direction', pattern: 'strength' });
    expect(p.data[1]?.['marker']).toMatchObject({ pattern: { shape: '/' } });
  });

  it('animation frames of polar charts', async () => {
    const rows = wind.map((r, i) => ({ ...r, hour: i % 2 }));
    const f = barPolar(rows, {
      r: 'frequency',
      theta: 'direction',
      color: 'strength',
      animationFrame: 'hour',
    });
    expect(f.frames?.map((fr) => fr.name)).toEqual(['0', '1']);
    expect(f.layout['sliders']).toBeDefined();
    const el = { nodeType: 1, tagName: 'DIV' } as unknown as HTMLElement;
    const chart = (await hx.scatterPolar(el, wind, {
      r: 'frequency',
      theta: 'direction',
    })) as unknown as {
      figure: { data: unknown[] };
    };
    expect(chart.figure.data).toHaveLength(1);
  });
});
