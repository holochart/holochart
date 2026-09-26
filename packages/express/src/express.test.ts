/**
 * Express figures against px (plan E23.1, E23.2): the expected figures are written from plotly.py
 * `px`'s documented output for the same data (trace names, legend groups, hover templates, colors
 * from the template's colorway, `layout.legend`), with the `plotly-classic` template so the colors
 * are Plotly's.
 */
import { DEFAULT_COLORWAY, HOLOCHART_COLORWAY } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import hx, { bar, fromCSV, histogram, line, scatter, toTable } from './index.ts';

const [C0, C1] = DEFAULT_COLORWAY as unknown as [string, string];

const tips = [
  { total_bill: 10, tip: 1, sex: 'Female', day: 'Sun', smoker: 'No', size: 2 },
  { total_bill: 12, tip: 2, sex: 'Male', day: 'Sat', smoker: 'Yes', size: 3 },
  { total_bill: 14, tip: 3, sex: 'Female', day: 'Sat', smoker: 'Yes', size: 4 },
];

describe('px parity: structure of the generated figures', () => {
  it('px.scatter(df, x, y, color)', () => {
    const figure = scatter(tips, {
      x: 'total_bill',
      y: 'tip',
      color: 'sex',
      template: 'plotly-classic',
    });
    expect(figure).toEqual({
      data: [
        {
          type: 'scatter',
          name: 'Female',
          legendgroup: 'Female',
          showlegend: true,
          marker: { color: C0, symbol: 'circle' },
          mode: 'markers',
          orientation: 'v',
          x: [10, 14],
          y: [1, 3],
          xaxis: 'x',
          yaxis: 'y',
          hovertemplate: 'sex=Female<br>total_bill=%{x}<br>tip=%{y}<extra></extra>',
        },
        {
          type: 'scatter',
          name: 'Male',
          legendgroup: 'Male',
          showlegend: true,
          marker: { color: C1, symbol: 'circle' },
          mode: 'markers',
          orientation: 'v',
          x: [12],
          y: [2],
          xaxis: 'x',
          yaxis: 'y',
          hovertemplate: 'sex=Male<br>total_bill=%{x}<br>tip=%{y}<extra></extra>',
        },
      ],
      layout: {
        legend: { title: { text: 'sex' }, tracegroupgap: 0 },
        margin: { t: 60 },
        template: 'plotly-classic',
        xaxis: { anchor: 'y', domain: [0, 1], title: { text: 'total_bill' } },
        yaxis: { anchor: 'x', domain: [0, 1], title: { text: 'tip' } },
      },
    });
  });

  it('px.histogram(df, x, color)', () => {
    const figure = histogram(tips, { x: 'total_bill', color: 'sex', template: 'plotly-classic' });
    expect(figure.data[0]).toEqual({
      type: 'histogram',
      name: 'Female',
      legendgroup: 'Female',
      showlegend: true,
      marker: { color: C0 },
      bingroup: 'x',
      orientation: 'v',
      x: [10, 14],
      xaxis: 'x',
      yaxis: 'y',
      hovertemplate: 'sex=Female<br>total_bill=%{x}<br>count=%{y}<extra></extra>',
    });
    expect(figure.layout).toMatchObject({
      barmode: 'relative',
      xaxis: { title: { text: 'total_bill' } },
      yaxis: { title: { text: 'count' } },
    });
  });

  it('px.scatter(df, x, y, facet_col)', () => {
    const figure = scatter(tips, {
      x: 'total_bill',
      y: 'tip',
      facetCol: 'day',
      template: 'plotly-classic',
    });
    expect(
      figure.data.map((t) => [t['name'], t['showlegend'], t['xaxis'], t['yaxis'], t['marker']]),
    ).toEqual([
      ['', false, 'x', 'y', { color: C0, symbol: 'circle' }],
      ['', false, 'x2', 'y2', { color: C0, symbol: 'circle' }],
    ]);
    expect(figure.data[0]?.['hovertemplate']).toBe(
      'day=Sun<br>total_bill=%{x}<br>tip=%{y}<extra></extra>',
    );
    const { layout } = figure;
    expect(layout['xaxis']).toEqual({
      anchor: 'y',
      domain: [0, 0.49],
      title: { text: 'total_bill' },
    });
    expect(layout['xaxis2']).toEqual({
      anchor: 'y2',
      domain: [0.51, 1],
      matches: 'x',
      title: { text: 'total_bill' },
    });
    expect(layout['yaxis']).toEqual({ anchor: 'x', domain: [0, 1], title: { text: 'tip' } });
    expect(layout['yaxis2']).toEqual({
      anchor: 'x2',
      domain: [0, 1],
      matches: 'y',
      showticklabels: false,
    });
    expect(layout['annotations']).toEqual([
      {
        name: 'facet label',
        showarrow: false,
        text: 'day=Sun',
        x: 0.245,
        xanchor: 'center',
        xref: 'paper',
        y: 1,
        yanchor: 'bottom',
        yref: 'paper',
      },
      {
        name: 'facet label',
        showarrow: false,
        text: 'day=Sat',
        x: 0.755,
        xanchor: 'center',
        xref: 'paper',
        y: 1,
        yanchor: 'bottom',
        yref: 'paper',
      },
    ]);
  });

  it('px.bar(df, x, y, color) stacks (relative) with textposition auto', () => {
    const figure = bar(tips, { x: 'day', y: 'tip', color: 'smoker', template: 'plotly-classic' });
    expect(figure.layout['barmode']).toBe('relative');
    expect(figure.data[0]).toMatchObject({
      type: 'bar',
      name: 'No',
      marker: { color: C0 },
      orientation: 'v',
      textposition: 'auto',
      hovertemplate: 'smoker=No<br>day=%{x}<br>tip=%{y}<extra></extra>',
    });
    expect(figure.data[0]).not.toHaveProperty('offsetgroup');
    const grouped = bar(tips, { x: 'day', y: 'tip', color: 'smoker', barmode: 'group' });
    expect(grouped.data[1]).toMatchObject({ alignmentgroup: 'True', offsetgroup: 'Yes' });
  });

  it('px.line(df, x, y, color, line_dash) colors lines and dashes them', () => {
    const figure = line(tips, { x: 'total_bill', y: 'tip', color: 'sex', lineDash: 'smoker' });
    expect(figure.data.map((t) => [t['name'], t['line'], t['mode']])).toEqual([
      ['Female, No', { color: HOLOCHART_COLORWAY[0], dash: 'solid' }, 'lines'],
      ['Female, Yes', { color: HOLOCHART_COLORWAY[0], dash: 'dot' }, 'lines'],
      ['Male, Yes', { color: HOLOCHART_COLORWAY[1], dash: 'dot' }, 'lines'],
    ]);
    expect(figure.layout['legend']).toEqual({ tracegroupgap: 0, title: { text: 'sex, smoker' } });
  });
});

describe('grouping and colors', () => {
  it('orders groups by first appearance, then by categoryOrders (listed values keep their color slot)', () => {
    const rows = [{ g: 'b' }, { g: 'a' }, { g: 'c' }, { g: 'a' }].map((r, i) => ({ ...r, v: i }));
    const names = (f: { data: Record<string, unknown>[] }) => f.data.map((t) => t['name']);
    expect(names(scatter(rows, { x: 'v', y: 'v', color: 'g' }))).toEqual(['b', 'a', 'c']);
    const ordered = scatter(rows, {
      x: 'v',
      y: 'v',
      color: 'g',
      categoryOrders: { g: ['z', 'c', 'a'] },
    });
    expect(names(ordered)).toEqual(['c', 'a', 'b']);
    // 'z' has no rows but takes the first color, as in px.
    expect(ordered.data.map((t) => (t['marker'] as { color: string }).color)).toEqual(
      HOLOCHART_COLORWAY.slice(1, 4),
    );
  });

  it('colors with the map first, then the sequence after the map entries; identity maps', () => {
    const rows = ['x', 'y', 'z'].map((g, i) => ({ g, v: i }));
    const colors = (f: { data: Record<string, unknown>[] }) =>
      f.data.map((t) => (t['marker'] as { color: string }).color);
    expect(
      colors(
        scatter(rows, {
          x: 'v',
          y: 'v',
          color: 'g',
          colorDiscreteMap: { y: 'gold' },
          colorDiscreteSequence: ['red', 'green', 'blue'],
        }),
      ),
    ).toEqual(['green', 'gold', 'blue']);
    const identity = scatter(
      [
        { c: 'red', v: 1 },
        { c: 'blue', v: 2 },
      ],
      { x: 'v', y: 'v', color: 'c', colorDiscreteMap: 'identity' },
    );
    expect(colors(identity)).toEqual(['red', 'blue']);
    expect(identity.data.map((t) => t['name'])).toEqual(['', '']);
  });

  it('takes the colorway, symbols and dashes from the template', () => {
    const rows = [
      { g: 'a', v: 1 },
      { g: 'b', v: 2 },
    ];
    const f = scatter(rows, { x: 'v', y: 'v', color: 'g', symbol: 'g' });
    expect(f.data.map((t) => t['marker'])).toEqual([
      { color: HOLOCHART_COLORWAY[0], symbol: 'circle' },
      { color: HOLOCHART_COLORWAY[1], symbol: 'diamond' },
    ]);
    const custom = scatter(rows, {
      x: 'v',
      y: 'v',
      color: 'g',
      template: {
        layout: { colorway: ['#111', '#222'] },
        data: { scatter: [{ marker: { symbol: 'star' } }] },
      },
    });
    expect(custom.data.map((t) => t['marker'])).toEqual([
      { color: '#111', symbol: 'star' },
      { color: '#222', symbol: 'star' },
    ]);
  });

  it('drops rows with a missing grouping value (pandas drops null group keys)', () => {
    const rows = [
      { g: 'a', v: 1 },
      { g: null, v: 2 },
      { g: NaN, v: 3 },
      { g: 'a', v: 4 },
    ];
    expect(scatter(rows, { x: 'v', y: 'v', color: 'g' }).data.map((t) => t['x'])).toEqual([[1, 4]]);
  });

  it('maps a numeric color to a colorscale on coloraxis, with a colorbar', () => {
    const f = scatter(tips, {
      x: 'total_bill',
      y: 'tip',
      color: 'size',
      rangeColor: [0, 5],
      colorContinuousScale: ['#000', '#fff'],
    });
    expect(f.data).toHaveLength(1);
    expect(f.data[0]?.['marker']).toEqual({
      color: [2, 3, 4],
      coloraxis: 'coloraxis',
      symbol: 'circle',
    });
    expect(f.data[0]?.['hovertemplate']).toBe(
      'total_bill=%{x}<br>tip=%{y}<br>size=%{marker.color}<extra></extra>',
    );
    expect(f.layout['coloraxis']).toEqual({
      colorbar: { title: { text: 'size' } },
      colorscale: [
        [0, '#000'],
        [1, '#fff'],
      ],
      cmin: 0,
      cmax: 5,
    });
    // Default: the template's sequential scale.
    const dflt = scatter(tips, { x: 'total_bill', y: 'tip', color: 'size' });
    expect((dflt.layout['coloraxis'] as { colorscale: unknown[] }).colorscale[0]).toEqual([
      0,
      '#3a0ca3',
    ]);
  });

  it('sizes markers by area with px sizeref, and keeps legend items constant', () => {
    const f = scatter(tips, { x: 'total_bill', y: 'tip', size: 'size', sizeMax: 10 });
    expect(f.data[0]?.['marker']).toMatchObject({
      size: [2, 3, 4],
      sizemode: 'area',
      sizeref: (2 * 4) / 100,
    });
    expect(f.layout['legend']).toEqual({ tracegroupgap: 0, itemsizing: 'constant' });
  });
});

describe('hover templates', () => {
  it('puts hoverName in bold on top and hoverData in customdata', () => {
    const f = scatter(tips, {
      x: 'total_bill',
      y: 'tip',
      hoverName: 'day',
      hoverData: ['smoker', 'tip'],
      customData: ['size'],
    });
    const t = f.data[0] as Record<string, unknown>;
    expect(t['hovertemplate']).toBe(
      '<b>%{hovertext}</b><br><br>total_bill=%{x}<br>tip=%{y}<br>smoker=%{customdata[1]}<extra></extra>',
    );
    expect(t['hovertext']).toEqual(['Sun', 'Sat', 'Sat']);
    expect(t['customdata']).toEqual([
      [2, 'No'],
      [3, 'Yes'],
      [4, 'Yes'],
    ]);
  });

  it('hides and formats lines with hoverData as an object, and renames with labels', () => {
    const f = scatter(tips, {
      x: 'total_bill',
      y: 'tip',
      color: 'sex',
      hoverData: { tip: ':.2f', total_bill: false, smoker: true },
      labels: { tip: 'Tip ($)', sex: 'Sex' },
    });
    expect(f.data[0]?.['hovertemplate']).toBe(
      'Sex=Female<br>Tip ($)=%{y:.2f}<br>smoker=%{customdata[0]}<extra></extra>',
    );
    expect(f.layout['legend']).toMatchObject({ title: { text: 'Sex' } });
    expect(f.layout['yaxis']).toMatchObject({ title: { text: 'Tip ($)' } });
  });

  it('names histogram aggregates (px get_decorated_label)', () => {
    const y = (o: Parameters<typeof histogram>[1]) =>
      (histogram(tips, { x: 'day', ...o }).layout['yaxis'] as { title: { text: string } }).title
        .text;
    expect(y({})).toBe('count');
    expect(y({ histnorm: 'percent' })).toBe('percent');
    expect(y({ y: 'tip' })).toBe('sum of tip');
    expect(y({ y: 'tip', histfunc: 'avg' })).toBe('avg of tip');
    expect(y({ y: 'tip', histnorm: 'probability' })).toBe('fraction of sum of tip');
    expect(y({ y: 'tip', histfunc: 'avg', histnorm: 'percent' })).toBe(
      'percent of sum of avg of tip',
    );
    expect(y({ y: 'tip', histnorm: 'density' })).toBe('density weighted by tip');
    expect(y({ barnorm: 'fraction' })).toBe('count (normalized as fraction)');
  });
});

describe('data input', () => {
  it('takes rows, columns, CSV tables and literal arrays alike', () => {
    const columns = { total_bill: [10, 12], tip: [1, 2] };
    const csv = fromCSV('total_bill,tip\n10,1\n12,2\n');
    const a = scatter(columns, { x: 'total_bill', y: 'tip' });
    expect(scatter(toTable(columns).toRows(), { x: 'total_bill', y: 'tip' })).toEqual(a);
    expect(scatter(csv, { x: 'total_bill', y: 'tip' })).toEqual(a);
    const arrays = scatter(null, { x: [10, 12], y: [1, 2] });
    expect(arrays.data[0]?.['hovertemplate']).toBe('x=%{x}<br>y=%{y}<extra></extra>');
    expect(arrays.data[0]?.['x']).toEqual([10, 12]);
  });

  it('mixes column names and arrays; arrays take the option name', () => {
    const f = scatter(tips, { x: 'total_bill', y: 'tip', color: ['a', 'b', 'a'] });
    expect(f.data.map((t) => t['name'])).toEqual(['a', 'b']);
    expect(f.layout['legend']).toMatchObject({ title: { text: 'color' } });
    expect(() => scatter(tips, { x: 'total_bill', y: [1] })).toThrow(
      "'y' has 1 values; the data has 3 rows",
    );
  });

  it('writes Date values as date strings', () => {
    const f = scatter([{ t: new Date(Date.UTC(2020, 0, 2)), v: 1 }], { x: 't', y: 'v' });
    expect(f.data[0]?.['x']).toEqual(['2020-01-02']);
  });

  it('reports unknown columns with the known ones', () => {
    expect(() => scatter(tips, { x: 'bill', y: 'tip' })).toThrow(
      "scatter: the value of 'x' is not the name of a column in the data. Expected one of ['total_bill', 'tip', 'sex', 'day', 'smoker', 'size'] but received: 'bill'.",
    );
  });

  it('exposes everything on the default namespace', () => {
    expect(Object.keys(hx).sort()).toEqual(
      [
        'area',
        'bar',
        'box',
        'data',
        'densityContour',
        'densityHeatmap',
        'ecdf',
        'ff',
        'histogram',
        'line',
        'parallelCategories',
        'parallelCoordinates',
        'pie',
        'scatter',
        'scatterMatrix',
        'strip',
        'timeline',
        'violin',
      ].sort(),
    );
    expect(hx.data.fromCSV('a\n1').column('a')).toEqual([1]);
  });
});

describe('titles, sizes and templates', () => {
  it('sets title, width and height; px adds a 60 px top margin only without a title', () => {
    const f = scatter(tips, {
      x: 'tip',
      y: 'tip',
      title: 'T',
      width: 500,
      height: 300,
      template: 'plotly-classic',
    });
    expect(f.layout).toMatchObject({ title: { text: 'T' }, width: 500, height: 300 });
    expect(f.layout).not.toHaveProperty('margin');
    // The default look sets its own top margin.
    expect(scatter(tips, { x: 'tip', y: 'tip' }).layout).not.toHaveProperty('margin');
  });
});
