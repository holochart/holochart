/**
 * The map functions (backlog GEO7): `scatterGeo`, `lineGeo` and `choropleth` against the trace and
 * `layout.geo` structure plotly.py's `px.scatter_geo`, `px.line_geo` and `px.choropleth` write for
 * the same data. The figures are asserted as objects: drawing them takes the geo package, which
 * Express does not depend on (ADR-026).
 */
import { DEFAULT_COLORWAY } from '@mk7s/holochart-core';
import { describe, expect, it, vi } from 'vitest';
import hx, { choropleth, lineGeo, scatterGeo } from '../index.ts';

vi.mock('@mk7s/holochart-runtime', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  newPlot: vi.fn(async (el: unknown, figure: unknown) => ({ el, figure })),
}));

const [C0, C1, C2] = DEFAULT_COLORWAY as unknown as [string, string, string];
const classic = { template: 'plotly-classic' } as const;

const countries = [
  { iso: 'FRA', country: 'France', continent: 'Europe', pop: 68, lifeExp: 82.5 },
  { iso: 'DEU', country: 'Germany', continent: 'Europe', pop: 83, lifeExp: 81 },
  { iso: 'JPN', country: 'Japan', continent: 'Asia', pop: 125, lifeExp: 84.5 },
  { iso: 'IND', country: 'India', continent: 'Asia', pop: 1400, lifeExp: 70 },
  { iso: 'BRA', country: 'Brazil', continent: 'Americas', pop: 216, lifeExp: 75.5 },
];

const cities = [
  { city: 'Paris', lat: 48.86, lon: 2.35, temp: 12, route: 'west', leg: 1 },
  { city: 'Berlin', lat: 52.52, lon: 13.4, temp: 10, route: 'west', leg: 1 },
  { city: 'Tokyo', lat: 35.68, lon: 139.69, temp: 16, route: 'east', leg: 1 },
  { city: 'Delhi', lat: 28.61, lon: 77.21, temp: 25, route: 'east', leg: 2 },
];

const whole = { domain: { x: [0, 1], y: [0, 1] } };
type Geo = { domain: { x: number[]; y: number[] } } & Record<string, unknown>;

describe('px parity: scatterGeo', () => {
  it('px.scatter_geo(df, locations, color, size, hover_name)', () => {
    const f = scatterGeo(countries, {
      locations: 'iso',
      color: 'continent',
      size: 'pop',
      hoverName: 'country',
      ...classic,
    });
    expect(f.data).toHaveLength(3);
    expect(f.data[0]).toEqual({
      type: 'scattergeo',
      name: 'Europe',
      legendgroup: 'Europe',
      showlegend: true,
      marker: {
        color: C0,
        symbol: 'circle',
        size: [68, 83],
        sizemode: 'area',
        sizeref: (2 * 1400) / 400,
      },
      mode: 'markers',
      hovertext: ['France', 'Germany'],
      locations: ['FRA', 'DEU'],
      hovertemplate:
        '<b>%{hovertext}</b><br><br>continent=Europe<br>pop=%{marker.size}<br>iso=%{location}<extra></extra>',
      geo: 'geo',
    });
    expect(f.data.map((t) => (t['marker'] as { color: string }).color)).toEqual([C0, C1, C2]);
    expect(f.layout).toEqual({
      legend: { title: { text: 'continent' }, tracegroupgap: 0, itemsizing: 'constant' },
      margin: { t: 60 },
      template: 'plotly-classic',
      geo: whole,
    });
    expect(f.frames).toBeUndefined();
  });

  it('lat / lon, a numeric color on coloraxis, text, opacity and hover data', () => {
    const f = scatterGeo(cities, {
      lat: 'lat',
      lon: 'lon',
      color: 'temp',
      text: 'city',
      opacity: 0.6,
      hoverData: { route: true, lat: false, temp: ':.1f' },
      customData: ['leg'],
      colorContinuousScale: ['white', 'black'],
      rangeColor: [0, 30],
      labels: { temp: 'Temperature' },
    });
    expect(f.data).toHaveLength(1);
    expect(f.data[0]).toMatchObject({
      type: 'scattergeo',
      name: '',
      showlegend: false,
      mode: 'markers+text',
      lat: [48.86, 52.52, 35.68, 28.61],
      lon: [2.35, 13.4, 139.69, 77.21],
      text: ['Paris', 'Berlin', 'Tokyo', 'Delhi'],
      marker: { color: [12, 10, 16, 25], coloraxis: 'coloraxis', opacity: 0.6 },
      customdata: [
        [1, 'west', 12],
        [1, 'west', 10],
        [1, 'east', 16],
        [2, 'east', 25],
      ],
      // `lat: false` hides its line; a format goes on the column's own line.
      hovertemplate:
        'city=%{text}<br>lon=%{lon}<br>route=%{customdata[1]}<br>Temperature=%{marker.color:.1f}<extra></extra>',
      geo: 'geo',
    });
    expect(f.data[0]?.['locations']).toBeUndefined();
    expect(f.layout['coloraxis']).toEqual({
      colorbar: { title: { text: 'Temperature' } },
      colorscale: [
        [0, 'white'],
        [1, 'black'],
      ],
      cmin: 0,
      cmax: 30,
    });
  });

  it('symbol groups, symbol and color maps, category orders', () => {
    const f = scatterGeo(cities, {
      lat: 'lat',
      lon: 'lon',
      color: 'route',
      symbol: 'route',
      colorDiscreteMap: { east: 'red' },
      symbolSequence: ['star', 'x'],
      categoryOrders: { route: ['east', 'west'] },
      ...classic,
    });
    expect(f.data.map((t) => [t['name'], t['marker']])).toEqual([
      ['east', { color: 'red', symbol: 'star' }],
      // px: values outside the map continue the sequence after the map's entries.
      ['west', { color: C1, symbol: 'x' }],
    ]);
  });

  it("the view: px's configure_geo, and the location attributes on the traces", () => {
    const geojson = { type: 'FeatureCollection', features: [] };
    const center = { lat: 50, lon: 10 };
    const f = scatterGeo(countries, {
      locations: 'country',
      locationMode: 'country names',
      geojson,
      featureIdKey: 'properties.name',
      color: 'continent',
      projection: 'natural earth',
      scope: 'europe',
      center,
      fitBounds: 'locations',
      basemapVisible: false,
      title: 'Countries',
      width: 600,
      height: 400,
    });
    for (const trace of f.data) {
      expect(trace).toMatchObject({
        locationmode: 'country names',
        featureidkey: 'properties.name',
      });
      // The GeoJSON object itself, on every trace: never a copy.
      expect(trace['geojson']).toBe(geojson);
    }
    expect(f.layout['geo']).toEqual({
      ...whole,
      center: { lat: 50, lon: 10 },
      scope: 'europe',
      fitbounds: 'locations',
      visible: false,
      projection: { type: 'natural earth' },
    });
    expect((f.layout['geo'] as Geo)['center']).not.toBe(center);
    expect(f.layout).toMatchObject({ title: { text: 'Countries' }, width: 600, height: 400 });
    expect(f.layout['margin']).toBeUndefined();
    // Nothing is written that was not given (px drops its `None`s).
    const bare = scatterGeo(countries, { locations: 'iso' });
    expect(bare.layout['geo']).toEqual(whole);
    expect(Object.keys(bare.data[0] ?? {})).not.toEqual(
      expect.arrayContaining(['locationmode', 'geojson', 'featureidkey']),
    );
  });

  it('columns given as arrays, and errors naming the function', () => {
    const f = scatterGeo(null, { lat: [10, 20], lon: Float64Array.of(1, 2) });
    expect(f.data[0]).toMatchObject({ lat: [10, 20], lon: [1, 2] });
    expect(() => scatterGeo(countries, { locations: 'nope' })).toThrow(
      /scatterGeo: the value of 'locations' is not the name of a column/,
    );
  });
});

describe('px parity: lineGeo', () => {
  it('px.line_geo(df, lat, lon, color)', () => {
    const f = lineGeo(cities, { lat: 'lat', lon: 'lon', color: 'route', ...classic });
    expect(f.data).toHaveLength(2);
    expect(f.data[0]).toEqual({
      type: 'scattergeo',
      name: 'west',
      legendgroup: 'west',
      showlegend: true,
      line: { color: C0, dash: 'solid' },
      marker: { symbol: 'circle' },
      mode: 'lines',
      lat: [48.86, 52.52],
      lon: [2.35, 13.4],
      hovertemplate: 'route=west<br>lat=%{lat}<br>lon=%{lon}<extra></extra>',
      geo: 'geo',
    });
    expect(f.data[1]?.['line']).toEqual({ color: C1, dash: 'solid' });
    expect(f.layout['geo']).toEqual(whole);
  });

  it('lineGroup splits lines within a color; lineDash and symbol group too', () => {
    const f = lineGeo(cities, {
      lat: 'lat',
      lon: 'lon',
      color: 'route',
      lineGroup: 'leg',
      lineDash: 'route',
      symbol: 'route',
    });
    expect(f.data.map((t) => [t['name'], t['showlegend'], t['lat']])).toEqual([
      ['west', true, [48.86, 52.52]],
      ['east', true, [35.68]],
      ['east', false, [28.61]],
    ]);
    expect(f.data[1]).toMatchObject({
      mode: 'lines+markers',
      line: { dash: 'dot' },
      marker: { symbol: 'diamond' },
    });
  });

  it('markers and text modes; locations; a numeric color stays discrete', () => {
    expect(lineGeo(cities, { lat: 'lat', lon: 'lon', markers: true }).data[0]?.['mode']).toBe(
      'lines+markers',
    );
    expect(lineGeo(cities, { lat: 'lat', lon: 'lon', text: 'city' }).data[0]?.['mode']).toBe(
      'lines+markers+text',
    );
    const n = lineGeo(countries, { locations: 'iso', color: 'pop', locationMode: 'ISO-3' });
    expect(n.layout['coloraxis']).toBeUndefined();
    expect(n.data.map((t) => t['name'])).toEqual(['68', '83', '125', '1400', '216']);
    expect(n.data[0]).toMatchObject({
      locations: ['FRA'],
      locationmode: 'ISO-3',
      hovertemplate: 'pop=68<br>iso=%{location}<extra></extra>',
    });
  });
});

describe('px parity: choropleth', () => {
  it('px.choropleth(df, locations, color, hover_name): z on coloraxis', () => {
    const f = choropleth(countries, {
      locations: 'iso',
      color: 'lifeExp',
      hoverName: 'country',
      hoverData: ['pop'],
      colorContinuousScale: 'Viridis',
      colorContinuousMidpoint: 75,
      ...classic,
    });
    expect(f.data).toEqual([
      {
        type: 'choropleth',
        name: '',
        legendgroup: '',
        showlegend: false,
        hovertext: ['France', 'Germany', 'Japan', 'India', 'Brazil'],
        locations: ['FRA', 'DEU', 'JPN', 'IND', 'BRA'],
        z: [82.5, 81, 84.5, 70, 75.5],
        coloraxis: 'coloraxis',
        customdata: [[68], [83], [125], [1400], [216]],
        hovertemplate:
          '<b>%{hovertext}</b><br><br>iso=%{location}<br>pop=%{customdata[0]}<br>lifeExp=%{z}<extra></extra>',
        geo: 'geo',
      },
    ]);
    expect(f.layout).toEqual({
      coloraxis: { colorbar: { title: { text: 'lifeExp' } }, colorscale: 'Viridis', cmid: 75 },
      legend: { tracegroupgap: 0 },
      margin: { t: 60 },
      template: 'plotly-classic',
      geo: whole,
    });
  });

  it('a color that is not numeric: one trace and one color per value', () => {
    const f = choropleth(countries, {
      locations: 'iso',
      color: 'continent',
      colorDiscreteMap: { Asia: 'gold' },
      ...classic,
    });
    expect(f.data).toHaveLength(3);
    expect(f.data[0]).toEqual({
      type: 'choropleth',
      name: 'Europe',
      legendgroup: 'Europe',
      showlegend: true,
      locations: ['FRA', 'DEU'],
      // px: the group's color as a colorscale of one color, every value 1, no colorbar.
      colorscale: [
        [0, C1],
        [1, C1],
      ],
      z: [1, 1],
      showscale: false,
      hovertemplate: 'continent=Europe<br>iso=%{location}<extra></extra>',
      geo: 'geo',
    });
    expect(f.data.map((t) => (t['colorscale'] as [number, string][])[1]?.[1])).toEqual([
      C1,
      'gold',
      C2,
    ]);
    expect(f.layout['coloraxis']).toBeUndefined();
    expect(f.layout['legend']).toEqual({ title: { text: 'continent' }, tracegroupgap: 0 });
  });

  it('without color every region takes the first color; identity colors', () => {
    const f = choropleth(countries, { locations: 'iso', colorDiscreteSequence: ['teal'] });
    expect(f.data).toHaveLength(1);
    expect(f.data[0]).toMatchObject({
      name: '',
      showlegend: false,
      colorscale: [
        [0, 'teal'],
        [1, 'teal'],
      ],
      z: [1, 1, 1, 1, 1],
      showscale: false,
    });
    const own = choropleth(
      [
        { iso: 'FRA', fill: 'navy' },
        { iso: 'DEU', fill: 'gold' },
      ],
      { locations: 'iso', color: 'fill', colorDiscreteMap: 'identity' },
    );
    expect(own.data.map((t) => (t['colorscale'] as [number, string][])[0]?.[1])).toEqual([
      'navy',
      'gold',
    ]);
  });

  it('geojson by reference with its key, and the view', () => {
    const geojson = { type: 'FeatureCollection', features: [] };
    const f = choropleth(countries, {
      locations: 'country',
      geojson,
      featureIdKey: 'properties.name',
      color: 'continent',
      fitBounds: 'geojson',
      projection: 'mercator',
    });
    expect(f.data).toHaveLength(3);
    for (const trace of f.data) {
      expect(trace['geojson']).toBe(geojson);
      expect(trace['featureidkey']).toBe('properties.name');
    }
    expect(f.layout['geo']).toEqual({
      ...whole,
      fitbounds: 'geojson',
      projection: { type: 'mercator' },
    });
    const url = choropleth(countries, { locations: 'iso', geojson: 'https://example.test/a.json' });
    expect(url.data[0]?.['geojson']).toBe('https://example.test/a.json');
  });
});

describe('facets of maps: one geo subplot per cell', () => {
  it('facetCol: geo and geo2 side by side, labelled, with the view on each', () => {
    const f = scatterGeo(countries, {
      locations: 'iso',
      facetCol: 'continent',
      scope: 'world',
      projection: 'robinson',
      center: { lon: 20 },
    });
    expect(f.data.map((t) => t['geo'])).toEqual(['geo', 'geo2', 'geo3']);
    expect(f.data[1]?.['hovertemplate']).toBe('continent=Asia<br>iso=%{location}<extra></extra>');
    const geos = ['geo', 'geo2', 'geo3'].map((id) => f.layout[id] as Geo);
    // px's facet_col_spacing of 0.02 between three columns.
    expect(geos[0]?.domain.x[0]).toBe(0);
    expect(geos[0]?.domain.x[1]).toBeCloseTo(0.32);
    expect(geos[1]?.domain.x[0]).toBeCloseTo(0.34);
    expect(geos[2]?.domain.x[1]).toBeCloseTo(1);
    for (const geo of geos) {
      expect(geo.domain.y).toEqual([0, 1]);
      expect(geo).toMatchObject({
        scope: 'world',
        projection: { type: 'robinson' },
        center: { lon: 20 },
      });
    }
    // Each subplot has its own objects.
    expect(geos[0]?.['center']).not.toBe(geos[1]?.['center']);
    expect(geos[0]?.['projection']).not.toBe(geos[1]?.['projection']);
    const annotations = f.layout['annotations'] as { text: string; x: number; y: number }[];
    expect(annotations.map((a) => a.text)).toEqual([
      'continent=Europe',
      'continent=Asia',
      'continent=Americas',
    ]);
    expect(annotations[1]).toMatchObject({ xref: 'paper', yref: 'paper', y: 1 });
    expect(annotations[1]?.x).toBeCloseTo(0.5);
  });

  it('facetRow numbers the subplots from the bottom, like the axes', () => {
    const f = choropleth(countries, { locations: 'iso', color: 'pop', facetRow: 'continent' });
    // The first value is the top row, which is the last subplot counted from the bottom.
    expect(f.data.map((t) => t['geo'])).toEqual(['geo3', 'geo2', 'geo']);
    const y = (id: string) => (f.layout[id] as Geo).domain.y;
    expect(y('geo')[0]).toBe(0);
    expect(y('geo3')[1]).toBeCloseTo(1);
    expect(y('geo2')[0]).toBeGreaterThan(y('geo')[1] as number);
    // One color axis for every facet.
    expect(f.data.every((t) => t['coloraxis'] === 'coloraxis')).toBe(true);
    const annotations = f.layout['annotations'] as { text: string; textangle: number }[];
    expect(annotations[0]).toMatchObject({ text: 'continent=Europe', textangle: 90 });
  });

  it('facetColWrap leaves the unused cells without a subplot', () => {
    const f = scatterGeo(countries, { locations: 'iso', facetCol: 'continent', facetColWrap: 2 });
    // Bottom row first: the third facet alone at the bottom-left, then the top row.
    expect(f.data.map((t) => t['geo'])).toEqual(['geo2', 'geo3', 'geo']);
    expect(Object.keys(f.layout).filter((k) => k.startsWith('geo'))).toEqual([
      'geo',
      'geo2',
      'geo3',
    ]);
    expect((f.layout['geo'] as Geo).domain.x[0]).toBe(0);
    expect((f.layout['geo'] as Geo).domain.y[0]).toBe(0);
    expect((f.layout['geo3'] as Geo).domain.x[1]).toBeCloseTo(1);
  });

  it('a discrete choropleth color keeps one legend item per value across facets', () => {
    const rows = [
      { iso: 'FRA', group: 'a', year: 2000 },
      { iso: 'DEU', group: 'b', year: 2000 },
      { iso: 'FRA', group: 'b', year: 2001 },
      { iso: 'DEU', group: 'a', year: 2001 },
    ];
    const f = choropleth(rows, { locations: 'iso', color: 'group', facetCol: 'year' });
    expect(f.data.map((t) => [t['name'], t['geo'], t['showlegend'], t['legendgroup']])).toEqual([
      ['a', 'geo', true, 'a'],
      ['a', 'geo2', false, 'a'],
      ['b', 'geo', true, 'b'],
      ['b', 'geo2', false, 'b'],
    ]);
  });
});

describe('animation frames of maps', () => {
  const rows = [
    { year: 2000, iso: 'FRA', pop: 59, group: 'low' },
    { year: 2000, iso: 'DEU', pop: 82, group: 'high' },
    { year: 2001, iso: 'FRA', pop: 61, group: 'high' },
    { year: 2001, iso: 'DEU', pop: 82, group: 'high' },
  ];

  it('one frame per value with ids and px controls; the view holds still', () => {
    const f = scatterGeo(rows, {
      locations: 'iso',
      size: 'pop',
      animationFrame: 'year',
      animationGroup: 'iso',
    });
    expect(f.frames?.map((fr) => fr.name)).toEqual(['2000', '2001']);
    expect(f.data).toBe(f.frames?.[0]?.data);
    expect(f.frames?.[1]?.data[0]).toMatchObject({
      ids: ['FRA', 'DEU'],
      locations: ['FRA', 'DEU'],
      marker: { size: [61, 82] },
      hovertemplate: 'year=2001<br>pop=%{marker.size}<br>iso=%{location}<extra></extra>',
      geo: 'geo',
    });
    const sliders = f.layout['sliders'] as { currentvalue: unknown; steps: unknown[] }[];
    expect(sliders[0]?.currentvalue).toEqual({ prefix: 'year=' });
    expect(sliders[0]?.steps).toHaveLength(2);
    const menus = f.layout['updatemenus'] as { buttons: { args: unknown[] }[] }[];
    expect(menus[0]?.buttons[0]?.args[1]).toMatchObject({ frame: { redraw: true } });
    // Holochart fits a map to its data by default, which would refit it at every frame.
    expect(f.layout['geo']).toEqual({ ...whole, fitbounds: false });
    const fitted = scatterGeo(rows, {
      locations: 'iso',
      animationFrame: 'year',
      fitBounds: 'locations',
    });
    expect(fitted.layout['geo']).toEqual({ ...whole, fitbounds: 'locations' });
  });

  it('choropleth frames: values per frame, and discrete groups in every frame', () => {
    const geojson = { type: 'FeatureCollection', features: [] };
    const f = choropleth(rows, {
      locations: 'iso',
      color: 'pop',
      animationFrame: 'year',
      rangeColor: [50, 90],
      geojson,
    });
    expect(f.frames?.map((fr) => fr.data[0]?.['z'])).toEqual([
      [59, 82],
      [61, 82],
    ]);
    expect(f.layout['coloraxis']).toMatchObject({ cmin: 50, cmax: 90 });
    expect(f.frames?.every((fr) => fr.data[0]?.['geojson'] === geojson)).toBe(true);

    const d = choropleth(rows, {
      locations: 'iso',
      color: 'group',
      animationFrame: 'year',
      ...classic,
    });
    // Every frame has every group's trace, so traces line up by index (empty where no rows).
    expect(d.frames?.map((fr) => fr.data.map((t) => [t['name'], t['locations'], t['z']]))).toEqual([
      [
        ['low', ['FRA'], [1]],
        ['high', ['DEU'], [1]],
      ],
      [
        ['low', [], []],
        ['high', ['FRA', 'DEU'], [1, 1]],
      ],
    ]);
    expect(d.frames?.[1]?.data[0]?.['colorscale']).toEqual([
      [0, C0],
      [1, C0],
    ]);
  });

  it('renders with newPlot when given an element', async () => {
    const el = { nodeType: 1, tagName: 'DIV' } as unknown as HTMLElement;
    const chart = (await hx.scatterGeo(el, rows, { locations: 'iso' })) as unknown as {
      el: unknown;
      figure: { data: Record<string, unknown>[] };
    };
    expect(chart.el).toBe(el);
    expect(chart.figure.data[0]?.['type']).toBe('scattergeo');
    const map = (await hx.choropleth(el, rows, { locations: 'iso', color: 'pop' })) as unknown as {
      figure: { data: Record<string, unknown>[] };
    };
    expect(map.figure.data[0]?.['type']).toBe('choropleth');
    expect(hx.lineGeo).toBe(lineGeo);
    await expect(hx.lineGeo(el, rows, { lat: 'nope' })).rejects.toThrow(/lineGeo/);
  });
});
