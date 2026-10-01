/**
 * The 3D functions (plan E23.6): `scatter3d` and `line3d` against the trace and scene structure
 * plotly.py's `px.scatter_3d` and `px.line_3d` write for the same data.
 */
import { DEFAULT_COLORWAY } from '@mk7s/holochart-core';
import { describe, expect, it, vi } from 'vitest';
import hx, { line3d, scatter3d } from '../index.ts';

vi.mock('@mk7s/holochart-runtime', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  newPlot: vi.fn(async (el: unknown, figure: unknown) => ({ el, figure })),
}));

const [C0, C1] = DEFAULT_COLORWAY as unknown as [string, string];
const classic = { template: 'plotly-classic' } as const;

const iris = [
  { sl: 5.1, sw: 3.5, pw: 0.2, species: 'setosa', id: 1 },
  { sl: 4.9, sw: 3.0, pw: 0.4, species: 'setosa', id: 2 },
  { sl: 7.0, sw: 3.2, pw: 1.4, species: 'versicolor', id: 3 },
  { sl: 6.4, sw: 3.2, pw: 1.5, species: 'versicolor', id: 4 },
  { sl: 6.3, sw: 3.3, pw: 2.5, species: 'virginica', id: 5 },
];

const sceneDomain = { domain: { x: [0, 1], y: [0, 1] } };

describe('px parity: scatter3d', () => {
  it('px.scatter_3d(df, x, y, z, color, symbol, size)', () => {
    const f = scatter3d(iris, {
      x: 'sl',
      y: 'sw',
      z: 'pw',
      color: 'species',
      symbol: 'species',
      size: 'pw',
      ...classic,
    });
    expect(f.data).toHaveLength(3);
    expect(f.data[0]).toEqual({
      type: 'scatter3d',
      name: 'setosa',
      legendgroup: 'setosa',
      showlegend: true,
      marker: {
        color: C0,
        symbol: 'circle',
        size: [0.2, 0.4],
        sizemode: 'area',
        sizeref: (2 * 2.5) / 400,
      },
      mode: 'markers',
      x: [5.1, 4.9],
      y: [3.5, 3.0],
      z: [0.2, 0.4],
      // px's hover label dict: `pw` first for z, then overwritten in place by size.
      hovertemplate: 'species=setosa<br>sl=%{x}<br>sw=%{y}<br>pw=%{marker.size}<extra></extra>',
      scene: 'scene',
    });
    expect(f.data[1]?.['marker']).toMatchObject({ color: C1, symbol: 'diamond' });
    expect(f.layout).toEqual({
      legend: { title: { text: 'species' }, tracegroupgap: 0, itemsizing: 'constant' },
      margin: { t: 60 },
      template: 'plotly-classic',
      scene: {
        ...sceneDomain,
        xaxis: { title: { text: 'sl' } },
        yaxis: { title: { text: 'sw' } },
        zaxis: { title: { text: 'pw' } },
      },
    });
    expect(f.frames).toBeUndefined();
  });

  it('continuous color: one trace on coloraxis with a colorbar', () => {
    const f = scatter3d(iris, {
      x: 'sl',
      y: 'sw',
      z: 'pw',
      color: 'sl',
      colorContinuousScale: ['white', 'black'],
      rangeColor: [4, 8],
      labels: { sl: 'Sepal length' },
    });
    expect(f.data).toHaveLength(1);
    expect(f.data[0]).toMatchObject({
      name: '',
      showlegend: false,
      marker: { color: [5.1, 4.9, 7.0, 6.4, 6.3], coloraxis: 'coloraxis' },
      hovertemplate: 'Sepal length=%{marker.color}<br>sw=%{y}<br>pw=%{z}<extra></extra>',
    });
    expect(f.layout['coloraxis']).toEqual({
      colorbar: { title: { text: 'Sepal length' } },
      colorscale: [
        [0, 'white'],
        [1, 'black'],
      ],
      cmin: 4,
      cmax: 8,
    });
    expect(f.layout['scene']).toMatchObject({ xaxis: { title: { text: 'Sepal length' } } });
  });

  it('text, hover name / data, custom data, error bars and opacity', () => {
    const f = scatter3d(iris, {
      x: 'sl',
      y: 'sw',
      z: 'pw',
      text: 'species',
      hoverName: 'id',
      hoverData: { sw: false, species: true },
      customData: ['id'],
      errorX: 'pw',
      errorZ: 'pw',
      errorZMinus: 'sw',
      opacity: 0.6,
    });
    const t = f.data[0] as Record<string, unknown>;
    expect(t['mode']).toBe('markers+text');
    expect(t['text']).toEqual(['setosa', 'setosa', 'versicolor', 'versicolor', 'virginica']);
    expect(t['hovertext']).toEqual([1, 2, 3, 4, 5]);
    expect(t['marker']).toMatchObject({ opacity: 0.6, symbol: 'circle' });
    expect(t['error_x']).toEqual({ array: [0.2, 0.4, 1.4, 1.5, 2.5] });
    expect(t['error_z']).toEqual({
      array: [0.2, 0.4, 1.4, 1.5, 2.5],
      arrayminus: [3.5, 3.0, 3.2, 3.2, 3.3],
    });
    expect(t['error_y']).toBeUndefined();
    // customData first, then hoverData's columns (which take over the text's hover line, as px);
    // `sw: false` hides the y line.
    expect((t['customdata'] as unknown[])[0]).toEqual([1, 'setosa']);
    expect(t['hovertemplate']).toBe(
      '<b>%{hovertext}</b><br><br>sl=%{x}<br>pw=%{z}<br>species=%{customdata[1]}<extra></extra>',
    );
  });

  it("the scene's axes: log types, ranges and category orders (px's configure_3d_axes)", () => {
    const f = scatter3d(iris, {
      x: 'species',
      y: 'sw',
      z: 'pw',
      logZ: true,
      rangeZ: [0.1, 10],
      rangeY: [2, 4],
      categoryOrders: { species: ['virginica', 'setosa'] },
    });
    expect(f.layout['scene']).toEqual({
      ...sceneDomain,
      xaxis: {
        title: { text: 'species' },
        categoryorder: 'array',
        categoryarray: ['virginica', 'setosa'],
      },
      yaxis: { title: { text: 'sw' }, range: [2, 4] },
      zaxis: { title: { text: 'pw' }, type: 'log', range: [-1, 1] },
    });
    // An axis column that also groups the traces lists every value (listed first); y
    // categories are not reversed as on cartesian axes.
    const g = scatter3d(iris, {
      x: 'sl',
      y: 'species',
      z: 'pw',
      color: 'species',
      categoryOrders: { species: ['virginica'] },
    });
    expect(g.data.map((t) => t['name'])).toEqual(['virginica', 'setosa', 'versicolor']);
    expect(g.layout['scene']).toMatchObject({
      yaxis: { categoryorder: 'array', categoryarray: ['virginica', 'setosa', 'versicolor'] },
    });
    // Unset columns leave the axis bare.
    expect(scatter3d(iris, { x: 'sl', y: 'sw' }).layout['scene']).toMatchObject({
      zaxis: {},
    });
  });

  it('colorDiscreteMap, symbolMap, labels, title and size', () => {
    const f = scatter3d(iris, {
      x: 'sl',
      y: 'sw',
      z: 'pw',
      color: 'species',
      symbol: 'species',
      colorDiscreteMap: { versicolor: 'red' },
      symbolMap: { setosa: 'square-open' },
      labels: { species: 'Species' },
      title: 'Iris in 3D',
      ...classic,
      width: 600,
      height: 500,
    });
    expect(f.data.map((t) => (t['marker'] as Record<string, unknown>)['color'])).toEqual([
      DEFAULT_COLORWAY[1],
      'red',
      DEFAULT_COLORWAY[2],
    ]);
    expect((f.data[0]?.['marker'] as Record<string, unknown>)['symbol']).toBe('square-open');
    expect(f.data[0]?.['hovertemplate']).toMatch(/^Species=setosa<br>/);
    expect(f.layout).toMatchObject({
      title: { text: 'Iris in 3D' },
      width: 600,
      height: 500,
      legend: { title: { text: 'Species' } },
    });
    expect(f.layout['margin']).toBeUndefined();
  });

  it('accepts arrays as columns and checks column names', () => {
    const f = scatter3d(null, { x: [1, 2], y: [3, 4], z: [5, 6] });
    expect(f.data[0]).toMatchObject({ x: [1, 2], y: [3, 4], z: [5, 6] });
    expect(f.data[0]?.['hovertemplate']).toBe('x=%{x}<br>y=%{y}<br>z=%{z}<extra></extra>');
    expect(() => scatter3d(iris, { x: 'sl', y: 'sw', z: 'nope' })).toThrow(
      /scatter3d: the value of 'z' is not the name of a column/,
    );
  });
});

describe('px parity: line3d', () => {
  const flights = [
    { t: 0, x: 0, y: 0, z: 0, flight: 'A', leg: 1, kind: 'jet' },
    { t: 1, x: 1, y: 1, z: 2, flight: 'A', leg: 1, kind: 'jet' },
    { t: 0, x: 3, y: 0, z: 1, flight: 'A', leg: 2, kind: 'jet' },
    { t: 1, x: 4, y: 2, z: 3, flight: 'A', leg: 2, kind: 'jet' },
    { t: 0, x: 0, y: 5, z: 0, flight: 'B', leg: 1, kind: 'prop' },
    { t: 1, x: 2, y: 4, z: 1, flight: 'B', leg: 1, kind: 'prop' },
  ];

  it('px.line_3d(df, x, y, z, color)', () => {
    const f = line3d(flights, { x: 'x', y: 'y', z: 'z', color: 'flight', ...classic });
    expect(f.data).toHaveLength(2);
    expect(f.data[0]).toEqual({
      type: 'scatter3d',
      name: 'A',
      legendgroup: 'A',
      showlegend: true,
      line: { color: C0, dash: 'solid' },
      marker: { symbol: 'circle' },
      mode: 'lines',
      x: [0, 1, 3, 4],
      y: [0, 1, 0, 2],
      z: [0, 2, 1, 3],
      hovertemplate: 'flight=A<br>x=%{x}<br>y=%{y}<br>z=%{z}<extra></extra>',
      scene: 'scene',
    });
    expect(f.data[1]?.['line']).toEqual({ color: C1, dash: 'solid' });
    expect(f.layout['scene']).toEqual({
      ...sceneDomain,
      xaxis: { title: { text: 'x' } },
      yaxis: { title: { text: 'y' } },
      zaxis: { title: { text: 'z' } },
    });
  });

  it('lineGroup splits lines within a color; lineDash and symbol group too', () => {
    const f = line3d(flights, {
      x: 'x',
      y: 'y',
      z: 'z',
      color: 'flight',
      lineGroup: 'leg',
      lineDash: 'kind',
      symbol: 'kind',
    });
    expect(f.data.map((t) => [t['name'], t['showlegend'], t['x']])).toEqual([
      ['A, jet', true, [0, 1]],
      ['A, jet', false, [3, 4]],
      ['B, prop', true, [0, 2]],
    ]);
    expect(f.data[2]).toMatchObject({
      mode: 'lines+markers',
      line: { dash: 'dot' },
      marker: { symbol: 'diamond' },
    });
    expect(f.layout['legend']).toMatchObject({ title: { text: 'flight, kind' } });
  });

  it('markers and text modes; a numeric color stays discrete', () => {
    expect(line3d(flights, { x: 'x', y: 'y', z: 'z', markers: true }).data[0]?.['mode']).toBe(
      'lines+markers',
    );
    expect(line3d(flights, { x: 'x', y: 'y', z: 'z', text: 'leg' }).data[0]?.['mode']).toBe(
      'lines+markers+text',
    );
    const n = line3d(flights, { x: 'x', y: 'y', z: 'z', color: 'leg' });
    expect(n.layout['coloraxis']).toBeUndefined();
    expect(n.data.map((t) => t['name'])).toEqual(['1', '2']);
  });
});

describe('animation frames of 3D charts', () => {
  const rows = [
    { year: 2000, country: 'a', x: 1, y: 10, z: 100 },
    { year: 2000, country: 'b', x: 2, y: 20, z: 200 },
    { year: 2001, country: 'a', x: 3, y: 15, z: 50 },
    { year: 2001, country: 'b', x: 5, y: 25, z: 300 },
  ];

  it('one frame per value with ids, px controls, and redraw', () => {
    const f = scatter3d(rows, {
      x: 'x',
      y: 'y',
      z: 'z',
      color: 'country',
      animationFrame: 'year',
      animationGroup: 'country',
    });
    expect(f.frames?.map((fr) => fr.name)).toEqual(['2000', '2001']);
    expect(f.frames?.[1]?.data.map((t) => [t['name'], t['ids'], t['x']])).toEqual([
      ['a', ['a'], [3]],
      ['b', ['b'], [5]],
    ]);
    expect(f.data).toBe(f.frames?.[0]?.data);
    expect(f.data[0]?.['hovertemplate']).toBe(
      'country=a<br>year=2000<br>x=%{x}<br>y=%{y}<br>z=%{z}<extra></extra>',
    );
    const sliders = f.layout['sliders'] as { currentvalue: unknown; steps: unknown[] }[];
    expect(sliders[0]?.currentvalue).toEqual({ prefix: 'year=' });
    expect(sliders[0]?.steps).toHaveLength(2);
    const menus = f.layout['updatemenus'] as { buttons: { args: unknown[] }[] }[];
    expect(menus[0]?.buttons[0]?.args[1]).toMatchObject({ frame: { redraw: true } });
  });

  it('scene ranges fixed over every frame (a Holochart default; px leaves it to range_*)', () => {
    const f = line3d(rows, { x: 'x', y: 'y', z: 'z', animationFrame: 'year', logZ: true });
    const scene = f.layout['scene'] as Record<string, { range?: number[] }>;
    expect(scene['xaxis']?.range?.[0]).toBeCloseTo(0.8);
    expect(scene['xaxis']?.range?.[1]).toBeCloseTo(5.2);
    expect(scene['yaxis']?.range?.[0]).toBeCloseTo(9.25);
    const span = Math.log10(300) - Math.log10(50);
    expect(scene['zaxis']?.range?.[0]).toBeCloseTo(Math.log10(50) - span * 0.05);
    expect(scene['zaxis']?.range?.[1]).toBeCloseTo(Math.log10(300) + span * 0.05);
    // Sized markers pad 10%; an explicit range wins; unanimated charts keep autorange.
    const sized = scatter3d(rows, { x: 'x', y: 'y', z: 'z', size: 'y', animationFrame: 'year' });
    expect(
      (sized.layout['scene'] as Record<string, { range: number[] }>)['xaxis']?.range[0],
    ).toBeCloseTo(0.6);
    const given = scatter3d(rows, {
      x: 'x',
      y: 'y',
      z: 'z',
      animationFrame: 'year',
      rangeX: [0, 9],
    });
    expect(given.layout['scene']).toMatchObject({ xaxis: { range: [0, 9] } });
    const still = scatter3d(rows, { x: 'x', y: 'y', z: 'z' });
    expect((still.layout['scene'] as Record<string, Record<string, unknown>>)['xaxis']).toEqual({
      title: { text: 'x' },
    });
  });

  it('renders with newPlot when given an element', async () => {
    const el = { nodeType: 1, tagName: 'DIV' } as unknown as HTMLElement;
    const chart = (await hx.scatter3d(el, rows, { x: 'x', y: 'y', z: 'z' })) as unknown as {
      el: unknown;
      figure: { data: Record<string, unknown>[] };
    };
    expect(chart.el).toBe(el);
    expect(chart.figure.data[0]?.['type']).toBe('scatter3d');
    const line = (await hx.line3d(el, rows, { x: 'x', y: 'y', z: 'z' })) as unknown as {
      figure: { data: unknown[] };
    };
    expect(line.figure.data).toHaveLength(1);
    await expect(hx.line3d(el, rows, { x: 'nope' })).rejects.toThrow(/line3d/);
  });
});
