/**
 * The network functions (backlog G8, G9): `graph`, `chord` and `adjacencyMatrix` against the
 * `graph`, `chord` and `heatmap` traces they write for small edge and node tables, node-link data
 * and matrices. The figures are asserted as objects: drawing a graph or a chord takes the graph
 * package, which Express does not depend on (ADR-029).
 */
import { DEFAULT_COLORWAY } from '@mk7s/holochart-core';
import { describe, expect, it, vi } from 'vitest';
import hx, { adjacencyMatrix, chord, graph } from '../index.ts';

vi.mock('@mk7s/holochart-runtime', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  newPlot: vi.fn(async (el: unknown, figure: unknown) => ({ el, figure })),
}));

const [C0, C1, C2] = DEFAULT_COLORWAY as unknown as [string, string, string];
const classic = { template: 'plotly-classic' } as const;

/** Who mailed whom: `dee` is in no node table, and `eve` (below) mailed nobody. */
const emails = [
  { from: 'ann', to: 'bob', count: 3, kind: 'work' },
  { from: 'bob', to: 'cy', count: 1, kind: 'work' },
  { from: 'ann', to: 'cy', count: 2, kind: 'social' },
  { from: 'dee', to: 'ann', count: 5, kind: 'social' },
];
const people = [
  { name: 'cy', team: 'red', age: 30, full: 'Cy Young', px: 0, py: 1 },
  { name: 'ann', team: 'blue', age: 41, full: 'Ann Lee', px: 1, py: 1 },
  { name: 'bob', team: 'red', age: 25, full: 'Bob Ray', px: 2, py: 0 },
  { name: 'eve', team: 'blue', age: 38, full: 'Eve Fox', px: 3, py: 2 },
];
const ends = { source: 'from', target: 'to' } as const;
const table = { ...ends, nodes: people, id: 'name' } as const;

type Part = Record<string, unknown>;
const node = (f: { data: Part[] }): Part => f.data[0]?.['node'] as Part;
const link = (f: { data: Part[] }): Part => f.data[0]?.['link'] as Part;

describe('graph: an edge table', () => {
  it('one graph trace: nodes in order of first appearance, links by node index', () => {
    const f = graph(emails, { ...ends, ...classic });
    expect(f.data).toEqual([
      {
        type: 'graph',
        node: {
          // `ann` and `bob` from the first edge, source first; then `cy`, then `dee`.
          label: ['ann', 'bob', 'cy', 'dee'],
          hovertemplate: 'node=%{label}<extra></extra>',
        },
        link: {
          source: [0, 1, 0, 3],
          target: [1, 2, 2, 0],
          hovertemplate: 'from=%{source.label}<br>to=%{target.label}<extra></extra>',
        },
      },
    ]);
    expect(f.layout).toEqual({
      legend: { tracegroupgap: 0 },
      margin: { t: 60 },
      template: 'plotly-classic',
    });
    expect(f.frames).toBeUndefined();
  });

  it('source and target default to columns of those names; weight is link.value', () => {
    const rows = [
      { source: 1, target: 2, w: 0.5 },
      { source: 2, target: 3, w: 2 },
    ];
    const f = graph(rows, { weight: 'w', labels: { w: 'Weight', source: 'From' } });
    expect(node(f)['label']).toEqual(['1', '2', '3']);
    expect(link(f)).toEqual({
      source: [0, 1],
      target: [1, 2],
      value: [0.5, 2],
      hovertemplate:
        'From=%{source.label}<br>target=%{target.label}<br>Weight=%{value}<extra></extra>',
    });
  });

  it('directed draws arrowheads; title, size and the top margin as the other functions', () => {
    const f = graph(emails, { ...ends, directed: true, title: 'Mail', width: 600, height: 400 });
    expect(link(f)['arrow']).toEqual({ end: true });
    expect(f.layout).toEqual({
      legend: { tracegroupgap: 0 },
      title: { text: 'Mail' },
      width: 600,
      height: 400,
    });
    expect(link(graph(emails, { ...ends, directed: false }))['arrow']).toBeUndefined();
  });

  it('link labels, colors by value and hover data', () => {
    const f = graph(emails, {
      ...ends,
      weight: 'count',
      linkLabel: 'kind',
      linkColor: 'kind',
      linkColorMap: { social: 'gold' },
      linkHoverData: { count: ':.1f', from: false },
      ...classic,
    });
    expect(link(f)).toEqual({
      source: [0, 1, 0, 3],
      target: [1, 2, 2, 0],
      value: [3, 1, 2, 5],
      label: ['work', 'work', 'social', 'social'],
      // The map's entry, then the sequence where the map leaves it (as the engine does).
      color: [C1, C1, 'gold', 'gold'],
      hovertemplate: 'to=%{target.label}<br>count=%{value:.1f}<br>kind=%{label}<extra></extra>',
    });
    const own = graph(
      [
        { source: 'a', target: 'b', stroke: 'navy', note: 'x' },
        { source: 'b', target: 'c', stroke: 'teal', note: 'y' },
      ],
      { linkColor: 'stroke', linkColorMap: 'identity', linkHoverData: ['note'] },
    );
    expect(link(own)).toMatchObject({
      color: ['navy', 'teal'],
      customdata: [['x'], ['y']],
      hovertemplate:
        'source=%{source.label}<br>target=%{target.label}<br>note=%{customdata[0]}<extra></extra>',
    });
    // A color by value is a line of the hover label, read from customdata.
    const byKind = graph(emails, { ...ends, linkColor: 'kind', ...classic });
    expect(link(byKind)).toMatchObject({
      color: [C0, C0, C1, C1],
      customdata: [['work'], ['work'], ['social'], ['social']],
      hovertemplate:
        'from=%{source.label}<br>to=%{target.label}<br>kind=%{customdata[0]}<extra></extra>',
    });
  });

  it('skips edges without both ends; ids that print the same are one node', () => {
    const f = graph(
      [
        { a: 1, b: '2' },
        { a: null, b: 1 },
        { a: 2, b: NaN },
        { a: '1', b: 1 },
        { a: 2, b: 3, extra: 'kept' },
      ],
      { source: 'a', target: 'b', linkHoverData: ['extra'] },
    );
    expect(node(f)['label']).toEqual(['1', '2', '3']);
    expect(link(f)).toMatchObject({
      source: [0, 0, 1],
      target: [1, 0, 2],
      // One entry per link, not per row of the table.
      customdata: [[null], [null], ['kept']],
    });
  });

  it('columns given as arrays, and errors naming the function', () => {
    const f = graph(null, { source: ['a', 'b'], target: Int32Array.of(7, 8) });
    expect(node(f)['label']).toEqual(['a', '7', 'b', '8']);
    expect(link(f)).toMatchObject({ source: [0, 2], target: [1, 3] });
    expect(() => graph(emails, { source: 'from' })).toThrow(
      "graph: the value of 'target' is not the name of a column in the data. Expected one of ['from', 'to', 'count', 'kind'] but received: 'target'.",
    );
    expect(() => graph(emails, { ...ends, weight: 'n' })).toThrow(
      /graph: the value of 'weight' is not the name of a column/,
    );
    expect(() => graph(emails, { ...ends, linkHoverData: ['nope'] })).toThrow(
      /graph: the value of 'linkHoverData' is not the name of a column/,
    );
    expect(() =>
      graph(
        [
          [0, 1],
          [1, 0],
        ] as never,
        {},
      ),
    ).toThrow('graph: a matrix is not an edge table; chord and adjacencyMatrix take one.');
  });
});

describe('graph: a node table', () => {
  it('nodes in table order, then the ids only the edges name; groups with a legend', () => {
    const f = graph(emails, { ...table, weight: 'count', color: 'team', ...classic });
    expect(f.data[0]).toEqual({
      type: 'graph',
      node: {
        // `eve` has no link and is a node; `dee` is in no row and comes last, without a group.
        label: ['cy', 'ann', 'bob', 'eve', 'dee'],
        group: ['red', 'blue', 'red', 'blue', null],
        hovertemplate: 'name=%{label}<br>team=%{group}<extra></extra>',
      },
      link: {
        source: [1, 2, 1, 4],
        target: [2, 0, 0, 1],
        value: [3, 1, 2, 5],
        hovertemplate:
          'from=%{source.label}<br>to=%{target.label}<br>count=%{value}<extra></extra>',
      },
    });
    // The trace colors the groups from the colorway, which is the template's: nothing to write.
    expect(f.layout).toEqual({
      legend: { tracegroupgap: 0, title: { text: 'team' } },
      margin: { t: 60 },
      template: 'plotly-classic',
    });
  });

  it('color maps, sequences and category orders go to the colorway, in group order', () => {
    const base = { ...table, color: 'team', ...classic } as const;
    // Groups appear as red, blue: the map's color for blue, the sequence's next for red.
    expect(
      graph(emails, { ...base, colorDiscreteMap: { blue: 'navy' } }).layout['colorway'],
    ).toEqual([C1, 'navy']);
    expect(
      graph(emails, { ...base, colorDiscreteSequence: ['teal', 'gold'] }).layout['colorway'],
    ).toEqual(['teal', 'gold']);
    // Listed values take their colors first, with or without rows.
    expect(
      graph(emails, { ...base, categoryOrders: { team: ['green', 'blue'] } }).layout['colorway'],
    ).toEqual([C2, C1]);
    expect(graph(emails, { ...base, labels: { team: 'Team' } }).layout['legend']).toEqual({
      tracegroupgap: 0,
      title: { text: 'Team' },
    });
    // Identity: the values are the colors; no groups, no legend title.
    const own = graph(emails, { ...table, color: 'team', colorDiscreteMap: 'identity' });
    expect(node(own)).toEqual({
      label: ['cy', 'ann', 'bob', 'eve', 'dee'],
      color: ['red', 'blue', 'red', 'blue', null],
      hovertemplate: 'name=%{label}<extra></extra>',
    });
    expect(own.layout['legend']).toEqual({ tracegroupgap: 0 });
    // Without a color column the sequence still colors the nodes, through the colorway.
    expect(graph(emails, { ...ends, colorDiscreteSequence: ['teal'] }).layout['colorway']).toEqual([
      'teal',
    ]);
  });

  it('a numeric color is a colorscale on coloraxis, with a colorbar', () => {
    const f = graph(emails, {
      ...table,
      color: 'age',
      colorContinuousScale: ['white', 'black'],
      rangeColor: [20, 50],
      labels: { age: 'Age' },
    });
    expect(node(f)).toEqual({
      label: ['cy', 'ann', 'bob', 'eve', 'dee'],
      color: [30, 41, 25, 38, null],
      coloraxis: 'coloraxis',
      hovertemplate: 'name=%{label}<br>Age=%{color}<extra></extra>',
    });
    expect(f.layout['coloraxis']).toEqual({
      colorbar: { title: { text: 'Age' } },
      colorscale: [
        [0, 'white'],
        [1, 'black'],
      ],
      cmin: 20,
      cmax: 50,
    });
    expect(f.layout['legend']).toEqual({ tracegroupgap: 0 });
    expect(f.layout['colorway']).toBeUndefined();
  });

  it("size: 'degree' is the trace's own measure; a column gives diameters", () => {
    const d = graph(emails, { ...table, size: 'degree' });
    expect(node(d)).toEqual({
      label: ['cy', 'ann', 'bob', 'eve', 'dee'],
      sizeby: 'degree',
      hovertemplate: 'name=%{label}<br>degree=%{degree}<extra></extra>',
    });
    // It needs no node table.
    const bare = graph(emails, { ...ends, size: 'indegree', sizeMax: 40 });
    expect(node(bare)).toMatchObject({ sizeby: 'indegree', sizerange: [6, 40] });
    expect(node(bare)['hovertemplate']).toBe(
      'node=%{label}<br>indegree=%{indegree}<extra></extra>',
    );

    // A column: from 6 px to sizeMax, areas growing with the value; 6 px without one.
    const c = graph(emails, { ...table, size: 'age', sizeMax: 26 });
    const sizes = node(c)['size'] as number[];
    expect(sizes[1]).toBe(26);
    expect(sizes[0]).toBeCloseTo(6 + 20 * Math.sqrt(30 / 41));
    expect(sizes[4]).toBe(6);
    expect(node(c)).toMatchObject({
      customdata: [[30], [41], [25], [38], [null]],
      hovertemplate: 'name=%{label}<br>age=%{customdata[0]}<extra></extra>',
    });
    expect(node(c)['sizeby']).toBeUndefined();
    // A column called `degree` wins over the measure.
    const own = graph([{ source: 'a', target: 'b' }], {
      nodes: [
        { id: 'a', degree: 4 },
        { id: 'b', degree: 1 },
      ],
      size: 'degree',
    });
    expect(node(own)['size']).toEqual([30, 18]);
    expect(node(own)['sizeby']).toBeUndefined();
  });

  it('labels, symbols, values, positions and the hover options', () => {
    const f = graph(emails, {
      ...table,
      label: 'full',
      symbol: 'team',
      symbolSequence: ['star', 'x'],
      value: 'age',
      x: 'px',
      y: 'py',
      hoverName: 'full',
      hoverData: { team: true, age: ':.0f', px: false },
      customData: ['name'],
    });
    expect(node(f)).toEqual({
      // The label column, and the id where it has no row.
      label: ['Cy Young', 'Ann Lee', 'Bob Ray', 'Eve Fox', 'dee'],
      symbol: ['star', 'x', 'star', 'x', null],
      value: [30, 41, 25, 38, null],
      x: [0, 1, 2, 3, null],
      y: [1, 1, 0, 2, null],
      // customData first, then what the hover label reads.
      customdata: [
        ['cy', 'Cy Young', 'red'],
        ['ann', 'Ann Lee', 'blue'],
        ['bob', 'Bob Ray', 'red'],
        ['eve', 'Eve Fox', 'blue'],
        [null, null, null],
      ],
      // `px: false` hides its line; a format goes on the column's own line.
      hovertemplate:
        '<b>%{customdata[1]}</b><br><br>full=%{label}<br>team=%{customdata[2]}<br>age=%{value:.0f}<br>py=%{y}<extra></extra>',
    });
    // Positions are not data under a computed arrangement: no hover lines for them.
    const forced = graph(emails, { ...table, x: 'px', y: 'py', arrangement: 'force' });
    expect(node(forced)['hovertemplate']).toBe('name=%{label}<extra></extra>');
    expect(node(forced)['x']).toEqual([0, 1, 2, 3, null]);
    const mapped = graph(emails, { ...table, symbol: 'team', symbolMap: 'identity' });
    expect(node(mapped)['symbol']).toEqual(['red', 'blue', 'red', 'blue', null]);
    expect(node(mapped)['customdata']).toBeUndefined();
  });

  it('passes the arrangement and its options to the trace', () => {
    const force = { ticks: 200, charge: -40 };
    const f = graph(emails, { ...ends, arrangement: 'force', force, layered: { rankdir: 'LR' } });
    expect(f.data[0]).toMatchObject({
      arrangement: 'force',
      force: { ticks: 200, charge: -40 },
      layered: { rankdir: 'LR' },
    });
    // A copy: the figure does not share the options' objects.
    expect(f.data[0]?.['force']).not.toBe(force);
    const t = graph(emails, {
      ...ends,
      arrangement: 'custom',
      custom: { name: 'elk', options: { direction: 'DOWN' } },
      tree: { orientation: 'LR' },
      arc: { orientation: 'v' },
      hive: { axes: 4 },
    });
    expect(t.data[0]).toMatchObject({
      arrangement: 'custom',
      custom: { name: 'elk', options: { direction: 'DOWN' } },
      tree: { orientation: 'LR' },
      arc: { orientation: 'v' },
      hive: { axes: 4 },
    });
    const bare = graph(emails, ends);
    expect(Object.keys(bare.data[0] ?? {})).toEqual(['type', 'node', 'link']);
  });

  it('missing ids are skipped, repeated ids are an error', () => {
    const f = graph(emails, {
      ...ends,
      nodes: [{ name: 'bob', team: 'red' }, { name: null, team: 'lost' }, { team: 'lost' }],
      id: 'name',
      color: 'team',
    });
    expect(node(f)).toMatchObject({
      label: ['bob', 'ann', 'cy', 'dee'],
      group: ['red', null, null, null],
    });
    expect(() =>
      graph(emails, { ...ends, nodes: [{ id: 'ann' }, { id: 'bob' }, { id: 'ann' }] }),
    ).toThrow(
      "graph: node ids must be unique; 'ann' is the id of more than one row of the node table.",
    );
    // Numbers and their text are one id here too.
    expect(() => graph(emails, { ...ends, nodes: [{ id: 1 }, { id: '1' }] })).toThrow(/unique/);
  });

  it('errors for node columns: unknown names, and names without a node table', () => {
    expect(() => graph(emails, { ...ends, nodes: people })).toThrow(
      "graph: the value of 'id' is not the name of a column in the data. Expected one of ['name', 'team', 'age', 'full', 'px', 'py'] but received: 'id'.",
    );
    expect(() => graph(emails, { ...table, color: 'group' })).toThrow(
      /graph: the value of 'color' is not the name of a column/,
    );
    // A node column without a node table: there is no such column.
    expect(() => graph(emails, { ...ends, color: 'team' })).toThrow(
      "graph: the value of 'color' is not the name of a column in the data. Expected one of [] but received: 'team'.",
    );
    expect(() => graph(emails, { ...ends, size: 'age' })).toThrow(
      /graph: the value of 'size' is not the name of a column/,
    );
  });

  it('without a node table, node options are arrays in node order', () => {
    const f = graph(emails, { ...ends, color: ['x', 'y', 'x', 'y'], label: ['A', 'B', 'C', 'D'] });
    expect(node(f)).toMatchObject({
      label: ['A', 'B', 'C', 'D'],
      group: ['x', 'y', 'x', 'y'],
      hovertemplate: 'label=%{label}<br>color=%{group}<extra></extra>',
    });
  });
});

describe('graph: node-link data', () => {
  const data = {
    node: { label: ['a', 'b', 'c'], group: ['g', 'g', 'h'], x: [0, 1, 2], y: [0, 1, 0] },
    link: { source: [0, 1], target: [1, 2], value: [1, 2], label: ['first', null] },
    directed: true,
  };

  it('reads the containers as tables: labels, groups, positions, weights, direction', () => {
    const f = graph(data);
    expect(f.data[0]).toEqual({
      type: 'graph',
      node: {
        label: ['a', 'b', 'c'],
        group: ['g', 'g', 'h'],
        x: [0, 1, 2],
        y: [0, 1, 0],
        hovertemplate: 'label=%{label}<br>group=%{group}<br>x=%{x}<br>y=%{y}<extra></extra>',
      },
      link: {
        source: [0, 1],
        target: [1, 2],
        value: [1, 2],
        label: ['first', null],
        arrow: { end: true },
        hovertemplate:
          'source=%{source.label}<br>target=%{target.label}<br>value=%{value}<br>label=%{label}<extra></extra>',
      },
    });
    expect(f.layout['legend']).toEqual({ tracegroupgap: 0, title: { text: 'group' } });
  });

  it('options win over what the data implies; a measure is a node column', () => {
    // As `louvain(graph)` returns them: one number per node.
    const communities = Int32Array.of(0, 1, 1);
    const f = graph(data, {
      directed: false,
      color: Array.from(communities, (c) => `community ${c + 1}`),
      labels: { color: 'Community' },
    });
    expect(link(f)['arrow']).toBeUndefined();
    expect(node(f)).toMatchObject({
      group: ['community 1', 'community 2', 'community 2'],
      hovertemplate: 'label=%{label}<br>Community=%{group}<br>x=%{x}<br>y=%{y}<extra></extra>',
    });
    // Links only: the nodes are the indices, in order of first appearance.
    const bare = graph({ link: { source: [2, 0], target: [0, 1] } });
    expect(node(bare)['label']).toEqual(['2', '0', '1']);
    expect(link(bare)).toMatchObject({ source: [0, 1], target: [1, 2] });
  });
});

describe('chord', () => {
  it('an edge table: one chord trace with the same containers', () => {
    const f = chord(emails, { ...table, weight: 'count', color: 'team', ...classic });
    expect(f.data).toEqual([
      {
        type: 'chord',
        node: {
          label: ['cy', 'ann', 'bob', 'eve', 'dee'],
          group: ['red', 'blue', 'red', 'blue', null],
          hovertemplate: 'name=%{label}<br>team=%{group}<extra></extra>',
        },
        link: {
          source: [1, 2, 1, 4],
          target: [2, 0, 0, 1],
          value: [3, 1, 2, 5],
          hovertemplate:
            'from=%{source.label}<br>to=%{target.label}<br>count=%{value}<extra></extra>',
        },
      },
    ]);
    expect(f.layout).toEqual({
      legend: { tracegroupgap: 0, title: { text: 'team' } },
      margin: { t: 60 },
      template: 'plotly-classic',
    });
  });

  it('a numeric color groups too; directed and the other options', () => {
    const f = chord(emails, {
      ...table,
      color: 'age',
      colorDiscreteSequence: ['teal', 'gold'],
      directed: false,
      linkColor: 'kind',
      hoverName: 'full',
      title: 'Mail',
    });
    expect(f.data[0]?.['directed']).toBe(false);
    expect(node(f)).toMatchObject({
      group: ['30', '41', '25', '38', null],
      customdata: [['Cy Young'], ['Ann Lee'], ['Bob Ray'], ['Eve Fox'], [null]],
      hovertemplate: '<b>%{customdata[0]}</b><br><br>name=%{label}<br>age=%{group}<extra></extra>',
    });
    expect(node(f)['coloraxis']).toBeUndefined();
    expect(f.layout).toMatchObject({
      colorway: ['teal', 'gold', 'teal', 'gold'],
      title: { text: 'Mail' },
    });
    expect(f.layout['coloraxis']).toBeUndefined();
    expect(link(f)['color']).toEqual(['teal', 'teal', 'gold', 'gold']);
    // The trace's own default (directed) unless told.
    expect(Object.keys(chord(emails, ends).data[0] ?? {})).toEqual(['type', 'node', 'link']);
  });

  it('a square matrix with labels: the matrix itself goes to the trace', () => {
    const matrix = [
      [0, 5, 2],
      [3, 0, 1],
      [4, 0, 0],
    ];
    const f = chord(matrix, { label: ['Harbor', 'Campus', 'Station'], labels: { value: 'Trips' } });
    expect(f.data).toEqual([
      {
        type: 'chord',
        matrix,
        node: {
          label: ['Harbor', 'Campus', 'Station'],
          hovertemplate: 'label=%{label}<extra></extra>',
        },
        link: {
          hovertemplate:
            'source=%{source.label}<br>target=%{target.label}<br>Trips=%{value}<extra></extra>',
        },
      },
    ]);
    expect(f.data[0]?.['matrix']).toBe(matrix);
    // Rows are nodes: groups as an array, or as a node table in the matrix's order.
    const grouped = chord([Float64Array.of(0, 1), Float64Array.of(2, 0)], {
      color: ['north', 'south'],
      directed: false,
      colorDiscreteMap: { south: 'gold' },
      ...classic,
    });
    expect(grouped.data[0]).toMatchObject({ directed: false });
    expect(node(grouped)).toMatchObject({ label: ['0', '1'], group: ['north', 'south'] });
    expect(grouped.layout['colorway']).toEqual([C1, 'gold']);
    const tabled = chord(matrix, {
      nodes: [{ district: 'Harbor' }, { district: 'Campus' }, { district: 'Station' }],
      label: 'district',
    });
    expect(node(tabled)).toMatchObject({
      label: ['Harbor', 'Campus', 'Station'],
      hovertemplate: 'district=%{label}<extra></extra>',
    });
    expect(() => chord(matrix, { label: ['A', 'B'], color: ['x', 'y', 'z'] })).toThrow(
      "chord: 'label' has 2 values; the data has 3 rows.",
    );
  });

  it('node-link data', () => {
    const f = chord({
      node: { label: ['a', 'b'], group: ['g', 'h'] },
      link: { source: [0], target: [1], value: [7] },
      directed: false,
    });
    expect(f.data[0]).toMatchObject({
      type: 'chord',
      directed: false,
      node: { label: ['a', 'b'], group: ['g', 'h'] },
      link: { source: [0], target: [1], value: [7] },
    });
  });
});

describe('adjacencyMatrix', () => {
  type Axis = Record<string, unknown>;
  const z = (f: { data: Part[] }): number[][] => f.data[0]?.['z'] as number[][];
  const ticks = (f: { data: Part[] }): string[] => f.data[0]?.['x'] as string[];

  it('a square heatmap of the summed weights, first node at the top, labels on the axes', () => {
    const f = adjacencyMatrix(emails, { ...ends, weight: 'count', ...classic });
    expect(f.data).toEqual([
      {
        type: 'heatmap',
        name: '0',
        x: ['ann', 'bob', 'cy', 'dee'],
        y: ['ann', 'bob', 'cy', 'dee'],
        // Links without a direction fill both cells.
        z: [
          [0, 3, 2, 5],
          [3, 0, 1, 0],
          [2, 1, 0, 0],
          [5, 0, 0, 0],
        ],
        coloraxis: 'coloraxis',
        hovertemplate: '%{y} – %{x}<br>count=%{z}<extra></extra>',
        xaxis: 'x',
        yaxis: 'y',
      },
    ]);
    expect(f.layout['xaxis']).toEqual({
      domain: [0, 1],
      anchor: 'y',
      type: 'category',
      // Square cells.
      constrain: 'domain',
      scaleanchor: 'y',
    });
    expect(f.layout['yaxis']).toEqual({
      domain: [0, 1],
      anchor: 'x',
      type: 'category',
      constrain: 'domain',
      autorange: 'reversed',
    });
    expect(f.layout['coloraxis']).toMatchObject({ colorbar: { title: { text: 'count' } } });
    expect(f.layout).toMatchObject({ margin: { t: 60 }, template: 'plotly-classic' });
  });

  it('directed: rows are sources and columns targets; without weights, the number of links', () => {
    const f = adjacencyMatrix([...emails, emails[0] as object], {
      ...ends,
      directed: true,
      title: 'Mail',
      colorContinuousScale: 'Viridis',
      rangeColor: [0, 4],
      labels: { from: 'Sender' },
    });
    expect(z(f)).toEqual([
      [0, 2, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 0],
      [1, 0, 0, 0],
    ]);
    expect(f.data[0]?.['hovertemplate']).toBe(
      'Sender=%{y}<br>to=%{x}<br>count=%{z}<extra></extra>',
    );
    expect((f.layout['xaxis'] as Axis)['title']).toEqual({ text: 'to' });
    expect((f.layout['yaxis'] as Axis)['title']).toEqual({ text: 'Sender' });
    expect(f.layout['coloraxis']).toEqual({
      colorscale: 'Viridis',
      cmin: 0,
      cmax: 4,
      colorbar: { title: { text: 'count' } },
    });
    expect(f.layout['title']).toEqual({ text: 'Mail' });
    expect(f.layout['margin']).toBeUndefined();
  });

  it("order: 'degree' puts the most connected first, by weight", () => {
    const f = adjacencyMatrix(emails, { ...ends, weight: 'count', order: 'degree' });
    // Weighted degrees: ann 10, dee 5, bob 4, cy 3.
    expect(ticks(f)).toEqual(['ann', 'dee', 'bob', 'cy']);
    expect(f.data[0]?.['y']).toEqual(['ann', 'dee', 'bob', 'cy']);
    expect(z(f)[0]).toEqual([0, 5, 3, 2]);
    // Unweighted: ann 3, then bob and cy (2 each, in node order), dee 1.
    expect(ticks(adjacencyMatrix(emails, { ...ends, order: 'degree' }))).toEqual([
      'ann',
      'bob',
      'cy',
      'dee',
    ]);
  });

  it("order: 'group' keeps the nodes of a color together; it is the default with color", () => {
    const f = adjacencyMatrix(emails, { ...table, weight: 'count', color: 'team' });
    // red (cy's, the first row), by degree: bob 4, cy 3; blue: ann 10, eve 0; then no group.
    expect(ticks(f)).toEqual(['bob', 'cy', 'ann', 'eve', 'dee']);
    expect(z(f)).toEqual([
      [0, 1, 3, 0, 0],
      [1, 0, 2, 0, 0],
      [3, 2, 0, 0, 5],
      [0, 0, 0, 0, 0],
      [0, 0, 5, 0, 0],
    ]);
    const listed = adjacencyMatrix(emails, {
      ...table,
      weight: 'count',
      color: 'team',
      order: 'group',
      categoryOrders: { team: ['blue'] },
    });
    expect(ticks(listed)).toEqual(['ann', 'eve', 'bob', 'cy', 'dee']);
    // The color column orders; it colors nothing and adds no legend.
    expect(f.layout['legend']).toBeUndefined();
    expect(ticks(adjacencyMatrix(emails, { ...table, color: 'team', order: 'input' }))).toEqual([
      'cy',
      'ann',
      'bob',
      'eve',
      'dee',
    ]);
  });

  it("order: 'community' puts the largest group first and needs the communities", () => {
    // As `louvain(graph)` returns them, one per node in node order (ann, bob, cy, dee).
    const communities = Int32Array.of(1, 0, 0, 0);
    const f = adjacencyMatrix(emails, {
      ...ends,
      weight: 'count',
      color: communities,
      order: 'community',
    });
    expect(ticks(f)).toEqual(['dee', 'bob', 'cy', 'ann']);
    // 'group' keeps the groups in order of first appearance instead.
    expect(
      ticks(
        adjacencyMatrix(emails, { ...ends, weight: 'count', color: communities, order: 'group' }),
      ),
    ).toEqual(['ann', 'dee', 'bob', 'cy']);
    expect(() => adjacencyMatrix(emails, { ...ends, order: 'community' })).toThrow(
      /adjacencyMatrix: order 'community' needs 'color', the nodes' groups or communities\. Express detects none/,
    );
    expect(() => adjacencyMatrix(emails, { ...ends, order: 'group' })).toThrow(
      /adjacencyMatrix: order 'group' needs 'color'/,
    );
    expect(() => adjacencyMatrix(emails, { ...ends, order: 'cluster' as never })).toThrow(
      "adjacencyMatrix: order 'cluster' is not 'input', 'degree', 'group' or 'community'.",
    );
  });

  it('order as a list of node indices: those nodes, in that order', () => {
    const f = adjacencyMatrix(emails, { ...ends, order: [3, 0, 0, 9, 1.5, 2] });
    expect(ticks(f)).toEqual(['dee', 'ann', 'cy']);
    expect(z(f)).toEqual([
      [0, 1, 0],
      [1, 0, 1],
      [0, 1, 0],
    ]);
    expect(
      ticks(adjacencyMatrix(emails, { ...ends, order: Int32Array.of(1, 0) as never })),
    ).toEqual(['bob', 'ann']);
  });

  it('a matrix: its rows and columns reordered, read as directed', () => {
    const matrix = [
      [0, 2, 0],
      [1, 0, 0],
      [0, 4, NaN],
    ];
    const f = adjacencyMatrix(matrix, { label: ['A', 'B', 'C'], order: 'degree' });
    // Degrees (row plus column sums): B 7, C 4, A 3.
    expect(ticks(f)).toEqual(['B', 'C', 'A']);
    expect(z(f)).toEqual([
      [0, 0, 1],
      [4, 0, 0],
      [2, 0, 0],
    ]);
    expect(f.data[0]?.['hovertemplate']).toBe(
      'source=%{y}<br>target=%{x}<br>value=%{z}<extra></extra>',
    );
    const plain = adjacencyMatrix(matrix);
    expect(ticks(plain)).toEqual(['0', '1', '2']);
    expect(z(plain)[2]).toEqual([0, 4, 0]);
    const grouped = adjacencyMatrix(matrix, { color: ['x', 'y', 'x'] });
    expect(ticks(grouped)).toEqual(['2', '0', '1']);
  });

  it('labels that repeat get their id, so that every node keeps its row', () => {
    const f = adjacencyMatrix(
      [
        { source: 1, target: 2 },
        { source: 2, target: 3 },
      ],
      {
        nodes: [
          { id: 1, city: 'Springfield' },
          { id: 2, city: 'Salem' },
          { id: 3, city: 'Springfield' },
        ],
        label: 'city',
      },
    );
    expect(ticks(f)).toEqual(['Springfield (1)', 'Salem', 'Springfield (3)']);
  });

  it('node-link data, and the errors', () => {
    const data = {
      node: { label: ['a', 'b', 'c'], group: ['g', 'h', 'g'] },
      link: { source: [0, 1], target: [1, 2], value: [2, 3] },
      directed: true,
    };
    const f = adjacencyMatrix(data);
    // Groups from `node.group`: g (c 3, a 2), then h.
    expect(ticks(f)).toEqual(['c', 'a', 'b']);
    expect(z(f)).toEqual([
      [0, 0, 0],
      [0, 0, 2],
      [3, 0, 0],
    ]);
    expect(() => adjacencyMatrix([], ends)).toThrow(
      /adjacencyMatrix: the value of 'source' is not the name of a column/,
    );
    expect(() => adjacencyMatrix({ source: [], target: [] })).toThrow(
      'adjacencyMatrix: the data has no nodes.',
    );
  });
});

describe('rendering and the namespace', () => {
  it('renders with newPlot when given an element', async () => {
    const el = { nodeType: 1, tagName: 'DIV' } as unknown as HTMLElement;
    const drawn = (await hx.graph(el, emails, ends)) as unknown as {
      el: unknown;
      figure: { data: Part[] };
    };
    expect(drawn.el).toBe(el);
    expect(drawn.figure.data[0]?.['type']).toBe('graph');
    const ring = (await hx.chord(el, [
      [0, 1],
      [1, 0],
    ])) as unknown as { figure: { data: Part[] } };
    expect(ring.figure.data[0]?.['type']).toBe('chord');
    const grid = (await hx.adjacencyMatrix(el, emails, ends)) as unknown as {
      figure: { data: Part[] };
    };
    expect(grid.figure.data[0]?.['type']).toBe('heatmap');
    expect(hx.graph).toBe(graph);
    expect(hx.chord).toBe(chord);
    expect(hx.adjacencyMatrix).toBe(adjacencyMatrix);
    await expect(hx.graph(el, emails, { source: 'nope' })).rejects.toThrow(/graph/);
  });
});
