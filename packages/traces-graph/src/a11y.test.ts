import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type HoverContext,
  type KeyboardPoint,
  type KeyboardStops,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import {
  DOWN_TEMPLATE,
  FOLDED_TEMPLATE,
  graphRanks,
  LINK_TEMPLATE,
  NODE_TEMPLATE,
  RANK_TEMPLATE,
  TREE_TEMPLATE,
  UP_TEMPLATE,
} from './a11y.ts';
import { withSceneKeys } from './a11y-loader.ts';
import { chord } from './chord/index.ts';
import { connectedComponents } from './data/metrics.ts';
import { showFrame } from './graph/frame.ts';
import { graph } from './graph/index.ts';
import { graph3d } from './graph3d/index.ts';

/**
 * Accessibility of the graph traces (backlog G10): the description of `graph` (summary and edge
 * list), its keyboard stops for each kind of arrangement with what they announce and where the
 * cursor is among them after an update, and the lazy chunk that serves the three traces. `chord.test.ts` and `graph3d.test.ts` have the stops of
 * their traces.
 */

const registry = createChartRegistry().register(graph);

function axisInfo(): AxisInfo {
  return {
    scale: createScale({ type: 'linear' }),
    type: 'linear',
    full: {},
  } as unknown as AxisInfo;
}

function build(input: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'graph', ...input }], layout: { template: 'none', ...layout } },
    registry.core,
    { onIssue: () => {} },
  );
  const trace = fullData[0] as FullTrace;
  const ctx: CalcContext = { fullLayout, index: 0, xaxis: axisInfo(), yaxis: axisInfo() };
  return { trace, calc: graph.calc!(trace, ctx), fullLayout };
}

type Built = ReturnType<typeof build>;

function described(input: Record<string, unknown>, maxRows = 100): TraceDescription {
  const built = build(input);
  return graph.describe!({ ...built, index: 0, xaxis: undefined, yaxis: undefined, maxRows })!;
}

/** Linear coordinates are px here: the transform is the identity. */
const IDENTITY = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

function hoverCtx(fullLayout: unknown, transform = IDENTITY): HoverContext {
  return { fullLayout, xaxis: undefined, yaxis: undefined, transform } as HoverContext;
}

async function stopsOf(built: Built, transform = IDENTITY): Promise<KeyboardStops | undefined> {
  const parts = await graph.a11y!();
  return parts['graph']!.keyboardPoints!(
    built.calc as never,
    built.trace,
    hoverCtx(built.fullLayout, transform),
  );
}

async function allStops(input: Record<string, unknown>, layout = {}): Promise<KeyboardPoint[]> {
  const stops = (await stopsOf(build(input, layout)))!;
  return Array.from({ length: stops.length }, (_, i) => stops.at(i)!);
}

/** What a stop is: `B` for a node, `A>B` for a link from its source to its target. */
function what(p: KeyboardPoint): string {
  const f = p.fields as { label: string; source?: { label: string }; target?: { label: string } };
  return p.kind === 'link' ? `${f.source!.label}>${f.target!.label}` : f.label;
}

/** The stops ←, →, ↑, ↓, Home and End lead to from stop `k`, by what they are. */
const leads = (all: readonly KeyboardPoint[], k: number): string[] =>
  all[k]!.nav!.map((to) => what(all[to!]!));

/** A, B, C in a row 100 apart and D above B; A → B, B → C, B → D. */
const BASIC = {
  arrangement: 'preset',
  node: { label: ['A', 'B', 'C', 'D'], x: [0, 100, 200, 100], y: [0, 0, 0, 100] },
  link: { source: [0, 1, 1], target: [1, 2, 3], value: [5, 1, 2] },
};

/** A root with two children; the first child has two leaves. */
const TREE = {
  arrangement: 'tree',
  ids: ['r', 'a', 'b', 'a1', 'a2'],
  labels: ['Root', 'A', 'B', 'A one', 'A two'],
  parents: ['', 'r', 'r', 'a', 'a'],
};

/** A diamond: A → B, A → C, B → D, C → D. */
const DIAMOND = {
  arrangement: 'layered',
  node: { label: ['A', 'B', 'C', 'D'] },
  link: { source: [0, 0, 1, 2], target: [1, 2, 3, 3], arrow: { end: true } },
};

describe('graph description: the summary', () => {
  it('says what the graph is, how it is arranged and where its hubs are', () => {
    expect(described(BASIC).summary).toBe(
      'Network graph "trace 0": 4 nodes, 3 links, at given positions. ' +
        'All nodes are connected; most connected: B (3 links), A (1), C (1).',
    );
    expect(described(BASIC).kind).toBe('network graph');
  });

  it('says that a graph with arrowheads is directed, and names its groups with their sizes', () => {
    const d = described({
      ...BASIC,
      name: 'Deps',
      node: { ...BASIC.node, group: ['x', 'y', 'x', 'x'] },
      link: { ...BASIC.link, arrow: { end: true } },
    });
    expect(d.summary).toBe(
      'Directed network graph "Deps": 4 nodes, 3 links, 2 groups, at given positions. ' +
        'All nodes are connected; most connected: B (3 links), A (1), C (1). ' +
        'Groups: x (3 nodes), y (1).',
    );
  });

  it('counts the connected components, the nodes without links and the links left out', () => {
    const d = described({
      arrangement: 'circular',
      node: { label: ['A', 'B', 'C', 'D', 'E', 'F'] },
      link: { source: [0, 1, 3, 0, 9], target: [1, 2, 4, 2, 0] },
    });
    expect(d.summary).toBe(
      'Network graph "trace 0": 6 nodes, 4 links, arranged in a circle. ' +
        '3 connected components, the largest with 3 nodes, 1 node without links; ' +
        'most connected: A (2 links), B (2), C (2). ' +
        '1 link left out: an end is not a node.',
    );
  });

  it('names more hubs for a larger graph, and the largest groups of many', () => {
    const n = 30;
    const d = described({
      arrangement: 'grid',
      // A star around node 0, and a second hub at node 1.
      node: {
        label: Array.from({ length: n }, (_, i) => `n${i}`),
        group: Array.from({ length: n }, (_, i) => `g${i % 7}`),
      },
      link: {
        source: [...Array.from({ length: n - 1 }, () => 0), 1, 1, 2],
        target: [...Array.from({ length: n - 1 }, (_, i) => i + 1), 2, 3, 3],
      },
    });
    expect(d.summary).toBe(
      'Network graph "trace 0": 30 nodes, 32 links, 7 groups, arranged in a grid. ' +
        'All nodes are connected; most connected: n0 (29 links), n1 (3), n2 (3), n3 (3), n4 (1). ' +
        'Largest groups: g0 (5 nodes), g1 (5), g2 (4), g3 (4), g4 (4).',
    );
  });

  it('says the roots and the levels of a tree arrangement', () => {
    expect(described({ ...TREE, name: 'Org' }).summary).toBe(
      'Network graph "Org": 5 nodes, 4 links, tree with 1 root and 3 levels. ' +
        'All nodes are connected; most connected: A (3 links), Root (2), B (1).',
    );
    const forest = described({
      arrangement: 'radial',
      labels: ['r', 's', 'a', 'b'],
      parents: ['', '', 'r', 'a'],
    });
    expect(forest.summary).toContain('4 nodes, 2 links, radial tree with 2 roots and 3 levels.');
    expect(forest.summary).toContain('2 connected components, the largest with 3 nodes, 1 node');
    // A row that is its own parent is cut loose and counted.
    const cut = described({ arrangement: 'dendrogram', labels: ['r', 'a'], parents: ['r', 'r'] });
    expect(cut.summary).toContain('dendrogram with 1 root and 2 levels.');
    expect(cut.summary).toContain('1 link left out: they close a cycle of parents.');
  });

  it('says the direction of a layered arrangement and the links it turned around', () => {
    expect(described(DIAMOND).summary).toBe(
      'Directed network graph "trace 0": 4 nodes, 4 links, layered top to bottom. ' +
        'All nodes are connected; most connected: A (2 links), B (2), C (2).',
    );
    const cycle = described({
      ...DIAMOND,
      layered: { rankdir: 'LR' },
      link: { source: [0, 1, 2, 3], target: [1, 2, 3, 0], arrow: { end: true } },
    });
    expect(cycle.summary).toContain(
      '4 nodes, 4 links, layered left to right, 1 link reversed to break cycles.',
    );
  });

  it('describes an empty graph and a single node', () => {
    expect(described({})).toEqual({
      kind: 'network graph',
      summary: 'Network graph "trace 0": 0 nodes, 0 links.',
    });
    expect(described({ arrangement: 'circular', node: { label: ['Only'] } })).toEqual({
      kind: 'network graph',
      summary: 'Network graph "trace 0": 1 node, 0 links, arranged in a circle.',
    });
    // Nodes without any link: no hubs to name.
    expect(described({ arrangement: 'grid', node: { label: ['A', 'B'] } }).summary).toBe(
      'Network graph "trace 0": 2 nodes, 0 links, arranged in a grid. ' +
        '2 connected components, the largest with 1 node, 2 nodes without links.',
    );
  });

  it('formats large counts like the rest of the library', () => {
    const n = 1500;
    const d = described({
      arrangement: 'circular',
      link: {
        source: Array.from({ length: n }, (_, i) => i),
        target: Array.from({ length: n }, (_, i) => (i + 1) % n),
      },
    });
    expect(d.summary).toContain('1,500 nodes, 1,500 links, arranged in a circle.');
    expect(d.summary).toContain('most connected: Node 0 (2 links), Node 1 (2)');
    // The counts after the first one, too.
    const hubs = described({
      arrangement: 'circular',
      link: {
        source: [...Array.from({ length: 2 * n }, (_, i) => (i < n ? 0 : 1))],
        target: [...Array.from({ length: 2 * n }, (_, i) => 2 + (i % n))],
      },
    });
    expect(hubs.summary).toContain(
      'most connected: Node 0 (1,500 links), Node 1 (1,500), Node 2 (2)',
    );
  });
});

describe('graph description: the edge list', () => {
  it('has a row per link, with the value and the label only when links have them', () => {
    const plain = described({ ...BASIC, link: { source: [0, 1], target: [1, 2] } }).table!;
    expect(plain.columns).toEqual(['Source', 'Target']);
    expect(plain.rows).toEqual([
      ['A', 'B'],
      ['B', 'C'],
    ]);
    const valued = described(BASIC).table!;
    expect(valued).toMatchObject({
      caption: 'trace 0',
      columns: ['Source', 'Target', 'Value'],
      rows: [
        ['A', 'B', '5'],
        ['B', 'C', '1'],
        ['B', 'D', '2'],
      ],
      total: 3,
    });
    const labelled = described({
      ...BASIC,
      link: { source: [0, 1, 1], target: [1, 2, 3], label: ['<b>uses</b>', '', 'calls'] },
    }).table!;
    expect(labelled.columns).toEqual(['Source', 'Target', 'Label']);
    expect(labelled.rows[0]).toEqual(['A', 'B', 'uses']);
    expect(labelled.row!(1)).toEqual(['B', 'C', '']);
    const both = described({
      ...BASIC,
      link: { ...BASIC.link, value: [1.23456789, undefined, 2], label: ['x', 'y', 'z'] },
    }).table!;
    expect(both.columns).toEqual(['Source', 'Target', 'Value', 'Label']);
    expect(both.rows).toEqual([
      ['A', 'B', '1.23457', 'x'],
      ['B', 'C', '', 'y'],
      ['B', 'D', '2', 'z'],
    ]);
  });

  it('reads parent and child for tree input', () => {
    const table = described(TREE).table!;
    expect(table.columns).toEqual(['Parent', 'Child']);
    expect(table.rows).toEqual([
      ['Root', 'A'],
      ['Root', 'B'],
      ['A', 'A one'],
      ['A', 'A two'],
    ]);
  });

  it('builds the first maxRows rows and any row on demand, and keeps to the kept links', () => {
    const n = 250;
    const table = described(
      {
        arrangement: 'circular',
        node: { label: Array.from({ length: n }, (_, i) => `n${i}`) },
        link: {
          // The first link names a node that does not exist: it is not in the table.
          source: [999, ...Array.from({ length: n - 1 }, (_, i) => i)],
          target: [0, ...Array.from({ length: n - 1 }, (_, i) => i + 1)],
        },
      },
      10,
    ).table!;
    expect(table.total).toBe(n - 1);
    expect(table.rows).toHaveLength(10);
    expect(table.rows[0]).toEqual(['n0', 'n1']);
    expect(table.row!(248)).toEqual(['n248', 'n249']);
  });

  it('has no table without links', () => {
    expect(described({ arrangement: 'grid', node: { label: ['A', 'B'] } }).table).toBeUndefined();
  });
});

describe('graph keyboard stops: a network', () => {
  it('lists the drawn nodes, then the links of each node around it', async () => {
    const all = await allStops(BASIC);
    // B's links clockwise from 12 o'clock: to D above it, to C on its right, to A on its left.
    expect(all.map(what)).toEqual(['A', 'B', 'C', 'D', 'A>B', 'B>D', 'B>C', 'A>B', 'B>C', 'B>D']);
    expect(all.map((p) => p.kind)).toEqual([...Array(4).fill('node'), ...Array(6).fill('link')]);
    // The stops are the hover points: a node at its center, a link on the middle of its path.
    expect(all[1]).toMatchObject({ pointIndex: 1, px: 100, py: 0 });
    expect(all[1]!.hoverText).toBe('B<br>Links: 3');
    expect(all[5]).toMatchObject({ pointIndex: 2, kind: 'link' });
    expect(all[5]!.px).toBeCloseTo(100, 6);
    expect(all[5]!.py).toBeGreaterThan(0);
    expect(all[5]!.py).toBeLessThan(100);
  });

  it('moves between nodes with ← / →, into the links with ↓, to the hub with Home', async () => {
    const all = await allStops(BASIC);
    // ←, →, ↑, ↓, Home, End.
    expect(leads(all, 0)).toEqual(['A', 'B', 'A', 'A>B', 'B', 'D']);
    expect(leads(all, 1)).toEqual(['A', 'C', 'B', 'B>D', 'B', 'D']);
    expect(leads(all, 3)).toEqual(['C', 'D', 'D', 'B>D', 'B', 'D']);
    expect(all[1]!.nav).toEqual([0, 2, 1, 5, 1, 3]);
  });

  it('turns around a node with ← / → on its links, follows one with ↓ and returns with ↑', async () => {
    const all = await allStops(BASIC);
    // B's three links are stops 5, 6, 7: a ring.
    expect(all[5]!.nav).toEqual([7, 6, 1, 3, 5, 7]);
    expect(all[6]!.nav).toEqual([5, 7, 1, 2, 5, 7]);
    expect(all[7]!.nav).toEqual([6, 5, 1, 0, 5, 7]);
    // A link is a stop from each end: A's only link leads to B, and from B back to A.
    expect(all[4]!.nav).toEqual([4, 4, 0, 1, 4, 4]);
    expect(all[7]!.pointIndex).toBe(all[4]!.pointIndex);
  });

  it('orders the links of a node as they are drawn, whatever the axes do', async () => {
    const built = build(BASIC);
    // The y axis runs down the screen: D is below B, so the ring starts with C on the right.
    const flipped = (await stopsOf(built, { ...IDENTITY, scaleY: -1 }))!;
    expect([5, 6, 7].map((k) => what(flipped.at(k)!))).toEqual(['B>C', 'B>D', 'A>B']);
    // The same answer every time: the order is not kept in the calc.
    const again = (await stopsOf(built))!;
    expect([5, 6, 7].map((k) => what(again.at(k)!))).toEqual(['B>D', 'B>C', 'A>B']);
  });

  it('keeps parallel links in link order and puts a self-link last', async () => {
    const all = await allStops({
      arrangement: 'preset',
      node: { label: ['A', 'B'], x: [0, 100], y: [0, 0] },
      link: { source: [0, 0, 1, 0], target: [0, 1, 0, 1], label: ['loop', 'one', 'back', 'two'] },
    });
    const label = (p: KeyboardPoint): string => (p.fields as { label: string }).label;
    // A: its three links to B, then its loop (once). B: the three links.
    expect(all.slice(2).map(label)).toEqual(['one', 'back', 'two', 'loop', 'one', 'back', 'two']);
    // The loop leads back to A.
    expect(all[5]!.nav![3]).toBe(0);
    expect(all[5]!.say![1]).toMatchObject({ n: '4', count: '4', node: 'A', down: 'A' });
  });

  it('announces a node with its place and its first link, a link with its node and its far end', async () => {
    const all = await allStops({ ...BASIC, link: { ...BASIC.link, arrow: { end: true } } });
    expect(all[1]!.say).toEqual([
      `${NODE_TEMPLATE} ${DOWN_TEMPLATE}`,
      { n: '2', count: '4', down: 'B → D' },
    ]);
    expect(all[5]!.say).toEqual([
      `${LINK_TEMPLATE} ${DOWN_TEMPLATE}`,
      { n: '1', count: '3', node: 'B', down: 'D' },
    ]);
    // From B, its link from A leads to A.
    expect(all[7]!.say![1]).toEqual({ n: '3', count: '3', node: 'B', down: 'A' });
    // Without arrowheads the link is named without a direction.
    expect((await allStops(BASIC))[0]!.say![1]).toEqual({ n: '1', count: '4', down: 'A – B' });
  });

  it("joins the sentences in the chart's language", async () => {
    const built = build(BASIC);
    const say = async (dictionary: Record<string, string>) => {
      const _locale = { _: (key: string): string => dictionary[key] ?? key };
      const stops = await stopsOf({
        ...built,
        fullLayout: { ...built.fullLayout, _locale } as never,
      });
      return stops!.at(1)!.say![0];
    };
    expect(await say({ [NODE_TEMPLATE]: 'Knoten {n}.', [DOWN_TEMPLATE]: 'Unten: {down}.' })).toBe(
      'Knoten {n}. Unten: {down}.',
    );
    // No space after a full stop that takes none.
    expect(await say({ [NODE_TEMPLATE]: 'ノード{n}。', [DOWN_TEMPLATE]: '下：{down}。' })).toBe(
      'ノード{n}。下：{down}。',
    );
    // A sentence without a translation stays English.
    expect(await say({ [DOWN_TEMPLATE]: 'Unten: {down}.' })).toBe(
      `${NODE_TEMPLATE} Unten: {down}.`,
    );
  });

  it('skips nodes that are not drawn, and their links', async () => {
    const all = await allStops(
      { ...BASIC, node: { ...BASIC.node, group: ['x', 'x', 'y', 'x'] } },
      { hiddenlabels: ['y'] },
    );
    expect(all.map(what)).toEqual(['A', 'B', 'D', 'A>B', 'B>D', 'A>B', 'B>D']);
    expect(all[1]!.say![1]).toMatchObject({ n: '2', count: '3' });
    // A node without links has nothing below it, and says so by saying nothing.
    const alone = await allStops({ ...BASIC, link: { source: [0], target: [1] } });
    expect(alone.map(what)).toEqual(['A', 'B', 'C', 'D', 'A>B', 'A>B']);
    expect(alone[2]!.nav).toEqual([1, 3, 2, 2, 0, 3]);
    expect(alone[2]!.say).toEqual([NODE_TEMPLATE, { n: '3', count: '4' }]);
  });

  it('follows the frame on screen, not the settled layout', async () => {
    const built = build(BASIC);
    const { calc } = built;
    // C is above A for now: around B, clockwise from D above it, it comes last, after A.
    const x = Float64Array.from(calc.x, (v, i) => (i === 2 ? 50 : v + 50));
    const y = Float64Array.from(calc.y, (v, i) => (i === 2 ? 100 : v));
    showFrame(calc, { x, y, hidden: calc.hidden, routes: undefined });
    const stops = (await stopsOf(built))!;
    expect(stops.length).toBe(4 + 6);
    expect(stops.at(0)!.px).toBe(50);
    expect([5, 6, 7].map((k) => what(stops.at(k)!))).toEqual(['B>D', 'A>B', 'B>C']);
    showFrame(calc, undefined);
  });

  it('finds the cursor again among the same stops', async () => {
    const stops = (await stopsOf(build(BASIC)))!;
    for (let k = 0; k < stops.length; k++) expect(stops.locate!(stops.at(k)!)).toBe(k);
    // A stop of another trace, or one that was copied, is not one of these.
    expect(stops.locate!({ pointIndex: 1, distance: 0, px: 0, py: 0, kind: 'node' })).toBe(-1);
    expect(stops.locate!({ ...stops.at(1)! })).toBe(-1);
  });

  it('finds the cursor again after an update: its node or link, else what is left nearby', async () => {
    const input = { ...BASIC, node: { ...BASIC.node, group: ['x', 'x', 'y', 'x'] } };
    const before = (await stopsOf(build(input)))!;
    const was = Array.from({ length: before.length }, (_, i) => before.at(i)!);
    expect(was.map(what)).toEqual(['A', 'B', 'C', 'D', 'A>B', 'B>D', 'B>C', 'A>B', 'B>C', 'B>D']);
    // C's group is hidden through the legend: the stops are numbered again.
    const after = (await stopsOf(build(input, { hiddenlabels: ['y'] })))!;
    const now = Array.from({ length: after.length }, (_, i) => after.at(i)!);
    expect(now.map(what)).toEqual(['A', 'B', 'D', 'A>B', 'B>D', 'A>B', 'B>D']);
    const to = was.map((p) => after.locate!(p));
    // A, B and D keep the cursor; from C it goes to the drawn node before it, B.
    expect(to.slice(0, 4)).toEqual([0, 1, 1, 2]);
    // A's link, and B's links to D and from A: each among the links of the same node.
    expect([to[4], to[5], to[7], to[9]]).toEqual([3, 4, 5, 6]);
    // B's link to C is not drawn: its node. C's link: where the cursor goes from C.
    expect([to[6], to[8]]).toEqual([1, 1]);
    // And back: every stop that is left is found among all of them again.
    expect(now.map((p) => what(was[before.locate!(p)]!))).toEqual(now.map(what));
    expect(before.locate!(now[5]!)).toBe(7);
  });

  it('goes to the node after a hidden one when none is drawn before it, and survives another graph', async () => {
    const input = { ...BASIC, node: { ...BASIC.node, group: ['y', 'x', 'x', 'x'] } };
    const before = (await stopsOf(build(input)))!;
    const after = (await stopsOf(build(input, { hiddenlabels: ['y'] })))!;
    expect(what(after.at(after.locate!(before.at(0)!))!)).toBe('B');
    // The stops of a larger graph, asked of a smaller one: a node it has, or none.
    const small = (await stopsOf(
      build({ arrangement: 'preset', node: { label: ['P', 'Q'], x: [0, 1], y: [0, 0] } }),
    ))!;
    expect(small.length).toBe(2);
    expect(small.locate!(before.at(3)!)).toBe(-1);
    expect(small.locate!(before.at(5)!)).toBe(1);
    expect(small.locate!(before.at(4)!)).toBe(0);
  });

  it('has no stops with node hover skipped, and only nodes with link hover skipped', async () => {
    expect(await stopsOf(build({ ...BASIC, hoverinfo: 'skip' }))).toBeUndefined();
    expect(
      await stopsOf(build({ ...BASIC, node: { ...BASIC.node, hoverinfo: 'skip' } })),
    ).toBeUndefined();
    const all = await allStops({ ...BASIC, link: { ...BASIC.link, hoverinfo: 'skip' } });
    expect(all.map(what)).toEqual(['A', 'B', 'C', 'D']);
    expect(all[1]!.nav).toEqual([0, 2, 1, 1, 1, 3]);
    expect(all[1]!.say).toEqual([NODE_TEMPLATE, { n: '2', count: '4' }]);
  });

  it('builds stops on demand: a large graph costs no point until the cursor is on it', async () => {
    const n = 100_000;
    const angle = (i: number): number => (2 * Math.PI * i) / n;
    const built = build({
      arrangement: 'preset',
      node: {
        x: Array.from({ length: n }, (_, i) => 1000 * Math.cos(angle(i))),
        y: Array.from({ length: n }, (_, i) => 1000 * Math.sin(angle(i))),
      },
      // A ring, and every node tied to node 0: a hub with 100,000 links.
      link: {
        source: [
          ...Array.from({ length: n }, (_, i) => i),
          ...Array.from({ length: n - 1 }, () => 0),
        ],
        target: [
          ...Array.from({ length: n }, (_, i) => (i + 1) % n),
          ...Array.from({ length: n - 1 }, (_, i) => i + 1),
        ],
      },
    });
    const stops = (await stopsOf(built))!;
    expect(Array.isArray(stops)).toBe(false);
    // Every node, and every link from each of its ends.
    expect(stops.length).toBe(n + 2 * (2 * n - 1));
    const last = stops.at(n - 1)!;
    expect(last.pointIndex).toBe(n - 1);
    expect(last.nav![4]).toBe(0);
    // The last node has three links; ↓ leads to the first of them, the last three stops' first.
    expect(last.nav![3]).toBe(stops.length - 3);
    const link = stops.at(stops.length - 3)!;
    expect(link.kind).toBe('link');
    expect(link.nav!.slice(0, 3)).toEqual([stops.length - 1, stops.length - 2, n - 1]);
    expect(link.say![1]).toMatchObject({ n: '1', count: '3', node: `Node ${n - 1}` });
    expect(stops.at(stops.length)).toBeUndefined();
    expect(stops.at(-1)).toBeUndefined();
  });
});

describe('graph keyboard stops: a tree', () => {
  it('walks the tree like the hierarchy traces: siblings, parent, first child', async () => {
    const built = build(TREE);
    const stops = (await stopsOf(built))!;
    const all = Array.from({ length: stops.length }, (_, i) => stops.at(i)!);
    expect(all.map(what)).toEqual(['Root', 'A', 'B', 'A one', 'A two']);
    // The tree grows sideways: siblings are in order down the screen.
    const { y } = built.calc;
    const [top, bottom] = y[1]! > y[2]! ? ['A', 'B'] : ['B', 'A'];
    const [first, second] = y[3]! > y[4]! ? ['A one', 'A two'] : ['A two', 'A one'];
    expect(leads(all, 0)).toEqual(['Root', 'Root', 'Root', top, 'Root', 'Root']);
    expect(leads(all, 1)).toEqual([
      top === 'A' ? 'A' : 'B',
      top === 'A' ? 'B' : 'A',
      'Root',
      first,
      top,
      bottom,
    ]);
    expect(leads(all, 3).slice(2)).toEqual(['A', 'A one', first, second]);
    // A leaf has nothing below.
    expect(all[2]!.nav![3]).toBe(2);
  });

  it('announces a node like a hierarchy node, with where ↑ and ↓ lead', async () => {
    const all = await allStops(TREE);
    expect(all[0]!.say![0]).toBe(`${TREE_TEMPLATE} ${DOWN_TEMPLATE}`);
    expect(all[0]!.say![1]).toMatchObject({ level: '1', n: '1', count: '1', children: '2' });
    expect(all[1]!.say![0]).toBe(`${TREE_TEMPLATE} ${UP_TEMPLATE} ${DOWN_TEMPLATE}`);
    expect(all[1]!.say![1]).toMatchObject({ level: '2', count: '2', children: '2', up: 'Root' });
    expect(all[3]!.say![0]).toBe(`${TREE_TEMPLATE} ${UP_TEMPLATE}`);
    expect(all[3]!.say![1]).toMatchObject({ level: '3', count: '2', children: '0', up: 'A' });
  });

  it('orders siblings as a tree from top to bottom draws them, and roots as siblings', async () => {
    const built = build({
      arrangement: 'tree',
      tree: { orientation: 'TB' },
      labels: ['r', 's', 'a', 'b', 'c'],
      parents: ['', '', 'r', 'r', 'r'],
    });
    const stops = (await stopsOf(built))!;
    const all = Array.from({ length: stops.length }, (_, i) => stops.at(i)!);
    const { x } = built.calc;
    const byX = [2, 3, 4].sort((p, q) => x[p]! - x[q]!).map((i) => what(all[i]!));
    expect(leads(all, 2).slice(4)).toEqual([byX[0], byX[2]]);
    expect(leads(all, 0).slice(4).sort()).toEqual(['r', 's']);
    expect(all[1]!.say![1]).toMatchObject({ level: '1', count: '2', children: '0' });
  });

  it('skips the nodes of a folded subtree, and says of its node that it is folded', async () => {
    const all = await allStops({ ...TREE, tree: { collapsed: ['a'] } });
    expect(all.map(what)).toEqual(['Root', 'A', 'B']);
    // A still has two children, but nothing to go down to.
    expect(all[1]!.nav![3]).toBe(1);
    expect(all[1]!.say![0]).toBe(`${TREE_TEMPLATE} ${FOLDED_TEMPLATE} ${UP_TEMPLATE}`);
    expect(all[1]!.say![1]).toMatchObject({ children: '2' });
    // The root is open: it says nothing of the kind.
    expect(all[0]!.say![0]).toBe(`${TREE_TEMPLATE} ${DOWN_TEMPLATE}`);
    const root = await allStops({ ...TREE, tree: { collapsed: ['r'] } });
    expect(root.map(what)).toEqual(['Root']);
    expect(root[0]!.say![0]).toBe(`${TREE_TEMPLATE} ${FOLDED_TEMPLATE}`);
  });

  it('asks for the click of Enter on the nodes a click folds', async () => {
    const clicks = (all: readonly KeyboardPoint[]): (boolean | undefined)[] =>
      all.map((p) => p.click);
    // Root and A have children; a folded node unfolds with the same click.
    expect(clicks(await allStops(TREE))).toEqual([true, true, undefined, undefined, undefined]);
    expect(clicks(await allStops({ ...TREE, tree: { collapsed: ['a'] } }))).toEqual([
      true,
      true,
      undefined,
    ]);
    expect(
      clicks(await allStops({ ...TREE, tree: { collapsible: false } })).some((c) => c === true),
    ).toBe(false);
    // No other arrangement has a click of its own.
    expect(clicks(await allStops(BASIC)).some((c) => c !== undefined)).toBe(false);
    expect(clicks(await allStops(DIAMOND)).some((c) => c !== undefined)).toBe(false);
  });

  it('keeps the cursor on a node through a fold, and takes it from a folded subtree to the node it folded into', async () => {
    const open = (await stopsOf(build(TREE)))!;
    const was = Array.from({ length: open.length }, (_, i) => open.at(i)!);
    for (let k = 0; k < open.length; k++) expect(open.locate!(was[k]!)).toBe(k);
    const folded = (await stopsOf(build({ ...TREE, tree: { collapsed: ['a'] } })))!;
    // Root, A and B stay; A one and A two are in A now.
    expect(was.map((p) => what(folded.at(folded.locate!(p))!))).toEqual([
      'Root',
      'A',
      'B',
      'A',
      'A',
    ]);
    const shut = (await stopsOf(build({ ...TREE, tree: { collapsed: ['r'] } })))!;
    expect(was.map((p) => shut.locate!(p))).toEqual([0, 0, 0, 0, 0]);
    // Unfolded again, the cursor is on the same node, wherever its stop is now.
    const now = Array.from({ length: folded.length }, (_, i) => folded.at(i)!);
    expect(now.map((p) => what(was[open.locate!(p)]!))).toEqual(['Root', 'A', 'B']);
    expect(folded.locate!({ ...now[1]! })).toBe(-1);
  });

  it('takes the cursor from a node of a hidden group to its nearest ancestor that is drawn', async () => {
    const input = {
      arrangement: 'tree',
      node: { label: ['R', 'A', 'B', 'C'], group: ['g', 'h', 'h', 'g'] },
      // R → A → B, and R → C.
      link: { source: [0, 1, 0], target: [1, 2, 3] },
    };
    const before = (await stopsOf(build(input)))!;
    const after = (await stopsOf(build(input, { hiddenlabels: ['h'] })))!;
    const to = Array.from({ length: before.length }, (_, i) =>
      what(after.at(after.locate!(before.at(i)!))!),
    );
    expect(to).toEqual(['R', 'R', 'R', 'C']);
    // Without an ancestor that is drawn: the drawn node nearest in index order.
    const rootless = (await stopsOf(build(input, { hiddenlabels: ['g'] })))!;
    expect(what(rootless.at(rootless.locate!(before.at(0)!))!)).toBe('A');
    expect(what(rootless.at(rootless.locate!(before.at(3)!))!)).toBe('B');
  });

  it('reads a tree at rest while it folds: what is drawn, the order of siblings and the anchors', async () => {
    const built = build({ ...TREE, tree: { orientation: 'TB', collapsed: ['a'] } });
    const { calc } = built;
    const tree = calc.tree!;
    const rest = (await stopsOf(built))!;
    const at = [0, 1, 2].map((k) => rest.at(k)!);
    // At rest a stop is anchored on its node, as its hover label is.
    expect(at.map((p) => [p.px, p.py])).toEqual([0, 1, 2].map((i) => [calc.x[i], calc.y[i]]));
    // The first frame of the fold: nothing is hidden yet, and every node is somewhere else.
    showFrame(calc, {
      x: Float64Array.from(tree.x, (v, i) => 500 - 10 * i - v),
      y: Float64Array.from(tree.y, (v) => v + 40),
      hidden: new Uint8Array(calc.length),
      routes: undefined,
    });
    const moving = (await stopsOf(built))!;
    const all = Array.from({ length: moving.length }, (_, i) => moving.at(i)!);
    expect(all.map(what)).toEqual(['Root', 'A', 'B']);
    expect(all.map((p) => p.nav)).toEqual(at.map((p) => p.nav));
    expect(all.map((p) => [p.px, p.py])).toEqual(at.map((p) => [p.px, p.py]));
    showFrame(calc, undefined);
  });

  it('follows the tree edges of a graph given as links', async () => {
    const all = await allStops({
      arrangement: 'radial',
      node: { label: ['A', 'B', 'C', 'D'] },
      // A → B, A → C, B → D, and C → D, which is not a tree edge.
      link: { source: [0, 0, 1, 2], target: [1, 2, 3, 3] },
    });
    expect(all.map(what)).toEqual(['A', 'B', 'C', 'D']);
    expect(leads(all, 3)[2]).toBe('B');
    expect(leads(all, 2)[3]).toBe('C');
  });
});

describe('graph keyboard stops: ranks', () => {
  it('reads the ranks off a layered drawing', () => {
    const { calc, trace } = build(DIAMOND);
    expect(graphRanks(calc, trace, connectedComponents)).toEqual({
      rank: Int32Array.of(0, 1, 1, 2),
      count: 3,
    });
    for (const rankdir of ['BT', 'LR', 'RL']) {
      const turned = build({ ...DIAMOND, layered: { rankdir } });
      expect(Array.from(graphRanks(turned.calc, turned.trace, connectedComponents)!.rank)).toEqual([
        0, 1, 1, 2,
      ]);
    }
    // Every connected part starts at rank 0.
    const parts = build({
      ...DIAMOND,
      node: { label: ['A', 'B', 'C', 'D', 'E', 'F'] },
      link: { source: [0, 0, 1, 2, 4], target: [1, 2, 3, 3, 5], arrow: { end: true } },
    });
    expect(Array.from(graphRanks(parts.calc, parts.trace, connectedComponents)!.rank)).toEqual([
      0, 1, 1, 2, 0, 1,
    ]);
    const other = build(BASIC);
    expect(graphRanks(other.calc, other.trace, connectedComponents)).toBeUndefined();
  });

  it('moves within a rank with ← / → and along the links with ↑ / ↓', async () => {
    const built = build(DIAMOND);
    const stops = (await stopsOf(built))!;
    const all = Array.from({ length: stops.length }, (_, i) => stops.at(i)!);
    expect(all.map(what)).toEqual(['A', 'B', 'C', 'D']);
    const { x } = built.calc;
    const [left, right] = x[1]! < x[2]! ? ['B', 'C'] : ['C', 'B'];
    // A is alone in its rank; ↓ leads to the child nearest across (B on a tie: the lower index).
    expect(leads(all, 0)).toEqual(['A', 'A', 'A', 'B', 'A', 'A']);
    expect(leads(all, 1)).toEqual([left, right, 'A', 'D', left, right]);
    expect(leads(all, 2)).toEqual([left, right, 'A', 'D', left, right]);
    expect(leads(all, 3)).toEqual(['D', 'D', 'B', 'D', 'D', 'D']);
  });

  it('announces a node with its rank and where ↑ and ↓ lead', async () => {
    const all = await allStops(DIAMOND);
    expect(all[0]!.say).toEqual([
      `${RANK_TEMPLATE} ${DOWN_TEMPLATE}`,
      { rank: '1', ranks: '3', n: '1', count: '1', down: 'B' },
    ]);
    expect(all[1]!.say![0]).toBe(`${RANK_TEMPLATE} ${UP_TEMPLATE} ${DOWN_TEMPLATE}`);
    expect(all[1]!.say![1]).toMatchObject({
      rank: '2',
      ranks: '3',
      count: '2',
      up: 'A',
      down: 'D',
    });
    expect(all[3]!.say).toEqual([
      `${RANK_TEMPLATE} ${UP_TEMPLATE}`,
      { rank: '3', ranks: '3', n: '1', count: '1', up: 'B' },
    ]);
  });

  it('follows a link that was turned around the way it is drawn', async () => {
    const built = build({
      ...DIAMOND,
      // A → B → C → A: one link is turned to break the cycle.
      node: { label: ['A', 'B', 'C'] },
      link: { source: [0, 1, 2], target: [1, 2, 0], arrow: { end: true } },
    });
    const rank = Array.from(graphRanks(built.calc, built.trace, connectedComponents)!.rank);
    const stops = (await stopsOf(built))!;
    const all = Array.from({ length: stops.length }, (_, i) => stops.at(i)!);
    expect([...rank].sort()).toEqual([0, 1, 2]);
    all.forEach((p, s) => {
      const [, , up, down] = p.nav as number[];
      // ↓ leads to a later rank, ↑ to an earlier one, or nowhere.
      if (down !== s) expect(rank[down!]!).toBeGreaterThan(rank[s]!);
      if (up !== s) expect(rank[up!]!).toBeLessThan(rank[s]!);
    });
    // The first rank's node leads down to the next rank, and the last one's back up the chain.
    const first = rank.indexOf(0);
    const last = rank.indexOf(2);
    expect(all[first]!.nav![3]).toBe(rank.indexOf(1));
    expect(all[last]!.nav![2]).toBe(rank.indexOf(1));
  });

  it('skips nodes of a hidden group and keeps the rank numbers of the drawing', async () => {
    const all = await allStops(
      { ...DIAMOND, node: { ...DIAMOND.node, group: ['g', 'h', 'g', 'g'] } },
      { hiddenlabels: ['h'] },
    );
    expect(all.map(what)).toEqual(['A', 'C', 'D']);
    expect(leads(all, 0)[3]).toBe('C');
    expect(all[1]!.say![1]).toMatchObject({ rank: '2', ranks: '3', n: '1', count: '1' });
  });

  it('finds the cursor again after an update: its node, else the drawn node before it', async () => {
    const input = { ...DIAMOND, node: { ...DIAMOND.node, group: ['g', 'h', 'g', 'g'] } };
    const before = (await stopsOf(build(input)))!;
    for (let k = 0; k < before.length; k++) expect(before.locate!(before.at(k)!)).toBe(k);
    const after = (await stopsOf(build(input, { hiddenlabels: ['h'] })))!;
    const to = Array.from({ length: before.length }, (_, i) =>
      what(after.at(after.locate!(before.at(i)!))!),
    );
    expect(to).toEqual(['A', 'A', 'C', 'D']);
    expect(after.locate!({ ...after.at(0)! })).toBe(-1);
  });
});

describe('the accessibility chunk of the package', () => {
  it('serves graph, graph3d and chord, each from its module', async () => {
    const [flat, ring, space] = await Promise.all([graph.a11y!(), chord.a11y!(), graph3d.a11y!()]);
    expect(Object.keys(flat)).toEqual(['graph']);
    expect(Object.keys(ring)).toEqual(['chord']);
    expect(Object.keys(space)).toEqual(['graph3d']);
    for (const parts of [flat['graph'], ring['chord'], space['graph3d']]) {
      expect(parts!.keyboardPoints).toBeTypeOf('function');
    }
    // The stops are the chunk's: the modules have none of their own, so nothing loads up front.
    expect(graph.keyboardPoints).toBeUndefined();
    expect(graph3d.keyboardPoints).toBeUndefined();
    expect(chord.keyboardPoints).toBeUndefined();
    // The descriptions stay with the modules: a chart is described without the chunk.
    expect(flat['graph']!.describe).toBeUndefined();
    expect(graph.describe).toBeTypeOf('function');
  });

  it('gives graph3d the view keys of its scene with its stops', async () => {
    const space = (await graph3d.a11y!())['graph3d']!;
    expect(space.keyboardView).toBeTypeOf('function');
    // The join: the scene's `'*'` parts under the type's own, which win.
    const own = { keyboardPoints: () => [] };
    const view = { keyboardView: () => undefined, keyboardPoints: () => undefined };
    const joined = await withSceneKeys(
      't',
      () => Promise.resolve({ t: own }),
      () => Promise.resolve({ '*': view, scatter3d: {} }),
    )();
    expect(joined).toEqual({ t: { keyboardView: view.keyboardView, ...own } });
  });
});
