/**
 * `sunburst`, `treemap` and `icicle` (plan E13.1, E23.6): the `path` processing of plotly.py's
 * `process_dataframe_hierarchy` (ids / parents, missing leaves, sums, weighted-mean and `'(?)'`
 * colors, hover data) and the trace structure px.sunburst / px.treemap / px.icicle write.
 */
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import hx, { icicle, sunburst, treemap } from '../index.ts';

vi.mock('@mk7s/holochart-runtime', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  newPlot: vi.fn(async (el: unknown, figure: unknown) => ({ el, figure })),
}));

const rows = [
  {
    continent: 'Asia',
    country: 'China',
    pop: 10,
    lifeExp: 70,
    size: 'big',
    iso: 'CHN',
    year: 2007,
  },
  {
    continent: 'Europe',
    country: 'France',
    pop: 4,
    lifeExp: 80,
    size: 'small',
    iso: 'FRA',
    year: 2007,
  },
  {
    continent: 'Asia',
    country: 'India',
    pop: 30,
    lifeExp: 60,
    size: 'big',
    iso: 'IND',
    year: 2007,
  },
  {
    continent: 'Europe',
    country: 'Spain',
    pop: 6,
    lifeExp: 75,
    size: 'big',
    iso: 'ESP',
    year: 2007,
  },
];

const domain = { x: [0, 1], y: [0, 1] };

describe('path (px process_dataframe_hierarchy)', () => {
  it('px.sunburst(df, path=[continent, country], values=pop, color=lifeExp)', () => {
    const f = sunburst(rows, { path: ['continent', 'country'], values: 'pop', color: 'lifeExp' });
    expect(f.data).toHaveLength(1);
    const { marker, ...trace } = f.data[0] as Record<string, unknown>;
    expect(trace).toEqual({
      type: 'sunburst',
      name: '',
      branchvalues: 'total',
      labels: ['China', 'France', 'India', 'Spain', 'Asia', 'Europe'],
      values: [10, 4, 30, 6, 40, 10],
      parents: ['Asia', 'Europe', 'Asia', 'Europe', '', ''],
      ids: ['Asia/China', 'Europe/France', 'Asia/India', 'Europe/Spain', 'Asia', 'Europe'],
      // px lists the color in hover_data (customdata), then labels it with %{color}.
      customdata: [[70], [80], [60], [75], [62.5], [77]],
      hovertemplate:
        'labels=%{label}<br>pop=%{value}<br>parent=%{parent}<br>id=%{id}<br>lifeExp=%{color}<extra></extra>',
      domain,
    });
    // Values-weighted means: Asia (70·10 + 60·30) / 40, Europe (80·4 + 75·6) / 10.
    expect(marker).toMatchObject({
      colors: [70, 80, 60, 75, 62.5, 77],
      showscale: true,
      colorbar: { title: { text: 'lifeExp' } },
    });
    expect(f.layout).toEqual({ legend: { tracegroupgap: 0 } });
    const classic = sunburst(rows, { path: ['continent'], template: 'plotly-classic' });
    expect(classic.layout).toMatchObject({ margin: { t: 60 } });
  });

  it('a discrete color keeps agreeing values, else "(?)", sorted so "(?)" comes first', () => {
    const f = treemap(rows, {
      path: ['continent', 'country'],
      values: 'pop',
      color: 'size',
      colorDiscreteMap: { '(?)': 'gray' },
      colorDiscreteSequence: ['red', 'blue'],
    });
    expect(f.data[0]).toEqual({
      type: 'treemap',
      name: '',
      branchvalues: 'total',
      labels: ['Europe', 'China', 'India', 'Spain', 'Asia', 'France'],
      values: [10, 10, 30, 6, 40, 4],
      parents: ['', 'Asia', 'Asia', 'Europe', '', 'Europe'],
      ids: ['Europe', 'Asia/China', 'Asia/India', 'Europe/Spain', 'Asia', 'Europe/France'],
      customdata: [['(?)'], ['big'], ['big'], ['big'], ['big'], ['small']],
      // The map, then the sequence from where the map leaves it (px, per trace).
      marker: { colors: ['gray', 'blue', 'blue', 'blue', 'blue', 'red'] },
      hovertemplate:
        'labels=%{label}<br>pop=%{value}<br>parent=%{parent}<br>id=%{id}<br>size=%{customdata[0]}<extra></extra>',
      domain,
    });
    expect(f.layout['treemapcolorway']).toEqual(['red', 'blue']);
    expect(f.layout['coloraxis']).toBeUndefined();
  });

  it('counts rows without values; a values column that is also color is summed as <name>_sum', () => {
    const counted = icicle(rows, { path: ['continent', 'country'] });
    expect(counted.data[0]).toMatchObject({
      type: 'icicle',
      values: [1, 1, 1, 1, 2, 2],
      hovertemplate:
        'labels=%{label}<br>count=%{value}<br>parent=%{parent}<br>id=%{id}<extra></extra>',
    });
    const withCount = rows.map((r) => ({ ...r, count: 1 }));
    expect(icicle(withCount, { path: ['continent'] }).data[0]?.['hovertemplate']).toContain(
      'count_1=%{value}',
    );
    const same = sunburst(rows, { path: ['continent', 'country'], values: 'pop', color: 'pop' });
    expect(same.data[0]).toMatchObject({
      values: [10, 4, 30, 6, 40, 10],
      // (10·10 + 30·30) / 40 and (4·4 + 6·6) / 10.
      marker: { colors: [10, 4, 30, 6, 25, 5.2] },
      hovertemplate:
        'labels=%{label}<br>pop_sum=%{value}<br>parent=%{parent}<br>id=%{id}<br>pop=%{color}<extra></extra>',
    });
  });

  it('aggregates hoverName, hoverData and customData like a discrete color', () => {
    const f = sunburst(rows, {
      path: ['continent', 'country'],
      values: 'pop',
      hoverName: 'iso',
      hoverData: ['year', 'pop'],
      customData: ['continent'],
    });
    expect(f.data[0]).toMatchObject({
      hovertext: ['CHN', 'FRA', 'IND', 'ESP', '(?)', '(?)'],
      customdata: [
        ['Asia', 2007, 10],
        ['Europe', 2007, 4],
        ['Asia', 2007, 30],
        ['Europe', 2007, 6],
        ['Asia', 2007, 40],
        ['Europe', 2007, 10],
      ],
      hovertemplate:
        '<b>%{hovertext}</b><br><br>labels=%{label}<br>pop=%{customdata[2]}<br>parent=%{parent}<br>id=%{id}<br>year=%{customdata[1]}<extra></extra>',
    });
    // hoverData as an object: `false` hides the color line px would add.
    const g = sunburst(rows, {
      path: ['continent'],
      color: 'lifeExp',
      hoverData: { lifeExp: false },
    });
    expect(g.data[0]?.['hovertemplate']).toBe(
      'labels=%{label}<br>count=%{value}<br>parent=%{parent}<br>id=%{id}<extra></extra>',
    );
  });

  it('missing entries end a path early; they cannot have present children', () => {
    const data = [
      { a: 'A', b: 'x', c: 'p', v: 1 },
      { a: 'A', b: 'x', c: 'q', v: 2 },
      { a: 'A', b: 'y', c: null, v: 3 },
      { a: 'B', b: null, c: null, v: 4 },
    ];
    const f = sunburst(data, { path: ['a', 'b', 'c'], values: 'v' });
    expect(f.data[0]).toMatchObject({
      ids: ['A/x/p', 'A/x/q', 'A/x', 'A/y', 'A', 'B'],
      parents: ['A/x', 'A/x', 'A', 'A', '', ''],
      labels: ['p', 'q', 'x', 'y', 'A', 'B'],
      values: [1, 2, 3, 3, 6, 4],
    });
    expect(() => sunburst([{ a: 'A', b: null, c: 'p' }], { path: ['a', 'b', 'c'] })).toThrow(
      /None entries cannot have not-None children/,
    );
    const nonLeaf = [
      { a: 'A', b: 'x' },
      { a: 'A', b: null },
    ];
    expect(() => sunburst(nonLeaf, { path: ['a', 'b'] })).toThrow(
      /non-leaf rows are not permitted/,
    );
  });

  it('values must be numbers; numeric strings and missing values are accepted', () => {
    const data = [
      { a: 'A', v: '2' },
      { a: 'A', v: null },
      { a: 'B', v: 5 },
    ];
    expect(sunburst(data, { path: ['a'], values: 'v' }).data[0]?.['values']).toEqual([2, 5]);
    expect(() => sunburst([{ a: 'A', v: 'lots' }], { path: ['a'], values: 'v' })).toThrow(
      /could not be converted to numbers/,
    );
  });

  it('path entries can be arrays; path excludes ids and parents', () => {
    const f = treemap(rows, { path: [rows.map((r) => r.continent), 'country'], values: 'pop' });
    expect(f.data[0]?.['ids']).toEqual([
      'Asia/China',
      'Europe/France',
      'Asia/India',
      'Europe/Spain',
      'Asia',
      'Europe',
    ]);
    expect(() => sunburst(rows, { path: ['continent'], parents: 'country' })).toThrow(
      /mutually exclusive/,
    );
  });

  it('leaf values add up to their roots, and every parent is a node (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            a: fc.constantFrom('A', 'B', 'C'),
            b: fc.constantFrom('x', 'y', 'z'),
            c: fc.constantFrom('p', 'q'),
            v: fc.integer({ min: 0, max: 100 }),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (data) => {
          const trace = sunburst(data, { path: ['a', 'b', 'c'], values: 'v' }).data[0] as {
            ids: string[];
            parents: string[];
            values: number[];
          };
          const { ids, parents, values } = trace;
          expect(new Set(ids).size).toBe(ids.length);
          const value = new Map(ids.map((id, k) => [id, values[k] as number]));
          const children = new Map<string, number>();
          parents.forEach((p, k) => {
            if (p !== '') expect(value.has(p)).toBe(true);
            children.set(p, (children.get(p) ?? 0) + (values[k] as number));
          });
          // branchvalues 'total': every branch is exactly the sum of its children.
          for (const [id, sum] of children) if (id !== '') expect(value.get(id)).toBe(sum);
          expect(children.get('')).toBe(data.reduce((s, r) => s + r.v, 0));
        },
      ),
    );
  });
});

describe('without path', () => {
  const family = [
    { character: 'Eve', parent: '', value: 10 },
    { character: 'Cain', parent: 'Eve', value: 14 },
    { character: 'Seth', parent: 'Eve', value: 12 },
  ];

  it('px.sunburst(df, names=character, parents=parent, values=value)', () => {
    const f = sunburst(family, { names: 'character', parents: 'parent', values: 'value' });
    expect(f.data).toEqual([
      {
        type: 'sunburst',
        name: '',
        labels: ['Eve', 'Cain', 'Seth'],
        values: [10, 14, 12],
        parents: ['', 'Eve', 'Eve'],
        hovertemplate: 'character=%{label}<br>value=%{value}<br>parent=%{parent}<extra></extra>',
        domain,
      },
    ]);
  });

  it('arrays take px hover names; ids, branchvalues, maxdepth, a colorscale', () => {
    const f = icicle(null, {
      names: ['a', 'b', 'c'],
      parents: ['', 'a', 'a'],
      ids: ['1', '2', '3'],
      values: [3, 1, 2],
      color: [3, 1, 2],
      branchvalues: 'remainder',
      maxdepth: 2,
      colorContinuousScale: ['white', 'black'],
      rangeColor: [0, 4],
      title: 'Tree',
      width: 300,
    });
    expect(f.data[0]).toMatchObject({
      ids: ['1', '2', '3'],
      branchvalues: 'remainder',
      maxdepth: 2,
      marker: {
        colors: [3, 1, 2],
        colorscale: [
          [0, 'white'],
          [1, 'black'],
        ],
        cmin: 0,
        cmax: 4,
        showscale: true,
        colorbar: { title: { text: 'color' } },
      },
      hovertemplate:
        'label=%{label}<br>value=%{value}<br>parent=%{parent}<br>id=%{id}<br>color=%{color}<extra></extra>',
    });
    expect(f.layout).toMatchObject({ title: { text: 'Tree' }, width: 300 });
  });

  it('renders when given an element', async () => {
    const el = { nodeType: 1, tagName: 'DIV' } as unknown as HTMLElement;
    const chart = (await hx.treemap(el, family, {
      names: 'character',
      parents: 'parent',
    })) as unknown as { figure: { data: { type: string }[] } };
    expect(chart.figure.data[0]?.type).toBe('treemap');
  });
});
