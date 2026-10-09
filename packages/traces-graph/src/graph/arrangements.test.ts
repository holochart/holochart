import { createScale, supplyDefaults, type FullAxis, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { forceLayout } from '../layout/force/index.ts';
import { graphExtremes } from './calc.ts';
import { frameOf, nodeScaleOf, showFrame } from './frame.ts';
import { graphHoverPoints, nodeAt, nodeFields } from './hover.ts';
import { graph, graphAxisHints } from './index.ts';
import { drawnLinks } from './links.ts';
import {
  arcOptionsOf,
  collapsedMask,
  collapsedValue,
  collapseToggle,
  defaultForceTicks,
  equalScales,
  forceOptionsOf,
  hiveOptionsOf,
  layeredOptionsOf,
  layoutExtents,
  plotAreaOf,
  realAxisOf,
  RING_REACH,
  SIMULATE_MAX_NODES,
  treeOptionsOf,
} from './options.ts';
import { linkColors, nodeBoxStyle, secondaryDash } from './style.ts';

const registry = createChartRegistry().register(graph);

function axisInfo(type: 'linear' | 'date'): AxisInfo {
  return { scale: createScale({ type }), type, full: {} } as unknown as AxisInfo;
}

function defaults(input: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const figure = { data: [{ type: 'graph', ...input }], layout: { template: 'none', ...layout } };
  const first = supplyDefaults(figure, registry.core, { onIssue: () => {} });
  return { trace: first.fullData[0] as FullTrace, fullLayout: first.fullLayout };
}

function build(
  input: Record<string, unknown>,
  layout: Record<string, unknown> = {},
  axes: Partial<Pick<CalcContext, 'xaxis' | 'yaxis'>> = {},
) {
  const { trace, fullLayout } = defaults(input, layout);
  const ctx: CalcContext = {
    fullLayout,
    index: 0,
    xaxis: axes.xaxis ?? axisInfo('linear'),
    yaxis: axes.yaxis ?? axisInfo('linear'),
  };
  return { trace, calc: graph.calc!(trace, ctx), fullLayout };
}

const container = (trace: Readonly<Record<string, unknown>>, key: string) =>
  trace[key] as Record<string, unknown>;
const finite = (values: Float64Array) => Array.from(values).every(Number.isFinite);

/** A → B → C → D with a link back from D to B, and a link from A to itself. */
const CYCLE = {
  node: { label: ['A', 'B', 'C', 'D'] },
  link: { source: [0, 1, 2, 3, 0], target: [1, 2, 3, 1, 0] },
};

/** A root with two children; the first child has two leaves. Rows are in id order. */
const TREE = {
  ids: ['r', 'a', 'b', 'a1', 'a2'],
  labels: ['Root', 'A', 'B', 'A one', 'A two'],
  parents: ['', 'r', 'r', 'a', 'a'],
};

/** Two groups of three nodes, tied inside and across. */
const GROUPED = {
  node: { label: ['a', 'b', 'c', 'x', 'y', 'z'], group: ['p', 'p', 'p', 'q', 'q', 'q'] },
  link: { source: [0, 1, 0, 3, 4, 2, 0], target: [1, 2, 2, 4, 5, 3, 5] },
};

describe('graph layout options', () => {
  it('gives the force layout its own defaults, by the names the engine knows', () => {
    const { trace } = defaults({ ...GROUPED, arrangement: 'force' });
    expect(forceOptionsOf(trace, 6)).toEqual({
      algorithm: 'spring',
      seed: 1,
      ticks: 600,
      collide: true,
      collidePadding: 2,
      linkWeight: 'strength',
      linkDistance: 30,
      chargeStrength: -60,
      velocityDecay: 0.25,
    });
  });

  it('maps every force attribute to its option', () => {
    const { trace } = defaults({
      ...GROUPED,
      arrangement: 'force',
      force: {
        seed: 7,
        ticks: 40,
        linkdistance: 55,
        linkstrength: 0.5,
        linkweight: 'distance',
        charge: -200,
        gravity: 0.2,
        collide: false,
        groupstrength: 0.1,
      },
    });
    expect(forceOptionsOf(trace, 6)).toMatchObject({
      seed: 7,
      ticks: 40,
      linkDistance: 55,
      linkStrength: 0.5,
      linkWeight: 'distance',
      chargeStrength: -200,
      centerStrength: 0.2,
      collide: false,
      groupStrength: 0.1,
    });
    const atlas = defaults({
      ...GROUPED,
      arrangement: 'force',
      force: { algorithm: 'forceatlas2', linlog: true, scalingratio: 4, gravity: 2, charge: -9 },
    }).trace;
    const options = forceOptionsOf(atlas, 6);
    expect(options).toMatchObject({
      algorithm: 'forceatlas2',
      linLog: true,
      scalingRatio: 4,
      gravity: 2,
    });
    // The spring's options are not passed to the other model.
    expect(options).not.toHaveProperty('chargeStrength');
    expect(options).not.toHaveProperty('linkDistance');
    expect(container(atlas, 'force')).not.toHaveProperty('charge');
  });

  it('runs fewer ticks on larger graphs', () => {
    expect(defaultForceTicks(1)).toBe(600);
    expect(defaultForceTicks(500)).toBe(600);
    expect(defaultForceTicks(1000)).toBe(300);
    expect(defaultForceTicks(3000)).toBe(300);
    expect(defaultForceTicks(10_000)).toBe(90);
  });

  it('maps the layered attributes, and packs to the proportions of the plot area', () => {
    const { trace, fullLayout, calc } = build(
      { ...GROUPED, arrangement: 'layered' },
      { width: 800, height: 400, margin: { l: 50, r: 50, t: 50, b: 50 } },
    );
    const area = plotAreaOf(fullLayout, trace);
    expect(area).toEqual({ width: 700, height: 300 });
    expect(layeredOptionsOf(trace, calc.model, area)).toEqual({
      rankdir: 'TB',
      ranksep: 50,
      nodesep: 30,
      edgesep: 12,
      ranker: 'network-simplex',
      routing: 'spline',
      clusters: false,
      clusterPadding: 12,
      clusterLabelHeight: 0,
      aspect: 700 / 300,
    });
    const set = defaults({
      ...GROUPED,
      arrangement: 'layered',
      layered: {
        rankdir: 'LR',
        ranksep: 20,
        nodesep: 10,
        edgesep: 4,
        ranker: 'longest-path',
        routing: 'orthogonal',
        clusters: true,
        clusterpadding: 6,
        aspect: 2,
      },
    }).trace;
    expect(layeredOptionsOf(set, calc.model, area)).toMatchObject({
      rankdir: 'LR',
      ranksep: 20,
      nodesep: 10,
      edgesep: 4,
      ranker: 'longest-path',
      routing: 'orthogonal',
      clusters: true,
      clusterPadding: 6,
      aspect: 2,
    });
    // A title strip as high as a line of the label font.
    expect(layeredOptionsOf(set, calc.model, area).clusterLabelHeight).toBeGreaterThan(12);
  });

  it('frames clusters only when the nodes have groups', () => {
    const { trace, calc } = build({
      ...CYCLE,
      arrangement: 'layered',
      layered: { clusters: true },
    });
    expect(layeredOptionsOf(trace, calc.model, { width: 1, height: 1 }).clusters).toBe(false);
    expect(calc.clusters).toBeUndefined();
  });

  it('reads the plot area of the subplot the trace is on', () => {
    const { trace, fullLayout } = defaults(
      { ...CYCLE, xaxis: 'x2', yaxis: 'y2' },
      {
        width: 1000,
        height: 500,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        xaxis2: { domain: [0.5, 1] },
        yaxis2: { domain: [0, 0.4] },
      },
    );
    expect(plotAreaOf(fullLayout, trace)).toEqual({ width: 500, height: 200 });
  });

  it('gives each tree arrangement its options', () => {
    const tidy = build({ ...TREE, arrangement: 'tree' });
    const inner = Uint8Array.of(1, 1, 0, 0, 0);
    const options = treeOptionsOf(tidy.trace, 'tree', tidy.calc.model, inner);
    expect(options).toMatchObject({
      orientation: 'LR',
      links: 'curved',
      nodesep: 10,
      sort: 'input',
      sortOrder: 'descending',
    });
    // Room for the widest label that is drawn between two levels ('Root', 'A').
    expect(options.ranksep).toBeGreaterThan(50);
    expect(options).not.toHaveProperty('collapsed');

    const radial = defaults({
      ...TREE,
      arrangement: 'radial',
      tree: { sector: { start: 90, span: 180 }, links: 'elbow', subtreesep: 30, ranksep: 70 },
    }).trace;
    expect(treeOptionsOf(radial, 'radial', tidy.calc.model, inner)).toMatchObject({
      sector: { start: 90, span: 180 },
      links: 'elbow',
      subtreesep: 30,
      ranksep: 70,
    });

    const dendrogram = defaults({
      ...TREE,
      arrangement: 'dendrogram',
      tree: { links: 'curved', sort: 'size', sortorder: 'ascending', nodesep: 4 },
    }).trace;
    expect(treeOptionsOf(dendrogram, 'dendrogram', tidy.calc.model)).toEqual({
      orientation: 'TB',
      // A dendrogram has no curves.
      links: 'elbow',
      nodesep: 4,
      ranksep: 50,
      sort: 'size',
      sortOrder: 'ascending',
    });
  });

  it('spaces box nodes of a tree further apart, and upright trees by their levels', () => {
    const boxes = build({ ...TREE, arrangement: 'tree', node: { shape: 'box' } });
    expect(treeOptionsOf(boxes.trace, 'tree', boxes.calc.model)).toMatchObject({
      nodesep: 20,
      ranksep: 50,
    });
    const down = build({ ...TREE, arrangement: 'tree', tree: { orientation: 'TB' } });
    const inner = Uint8Array.of(1, 1, 0, 0, 0);
    expect(treeOptionsOf(down.trace, 'tree', down.calc.model, inner).ranksep).toBe(50);
  });

  it('reads tree.collapsed as indices or ids, and writes it back in kind', () => {
    const byIndex = build({ ...TREE, arrangement: 'tree', tree: { collapsed: [1, '2', 99] } });
    expect(Array.from(collapsedMask(byIndex.trace, byIndex.calc.model)!)).toEqual([0, 1, 1, 0, 0]);
    const byId = build({ ...TREE, arrangement: 'tree', tree: { collapsed: ['a', 'nowhere'] } });
    const mask = collapsedMask(byId.trace, byId.calc.model)!;
    expect(Array.from(mask)).toEqual([0, 1, 0, 0, 0]);
    // The trace gives ids: they are what a click writes.
    expect(collapsedValue(byId.trace, byId.calc.model, mask)).toEqual(['a']);
    expect(collapsedMask(build({ ...TREE, arrangement: 'tree' }).trace, byId.calc.model)).toBe(
      undefined,
    );

    // Links, not rows: nodes are known by index only.
    const links = build({
      node: { label: ['r', 'a', 'b'] },
      link: { source: [0, 0], target: [1, 2] },
      arrangement: 'tree',
      tree: { collapsed: [0] },
    });
    expect(collapsedValue(links.trace, links.calc.model, Uint8Array.of(1, 0, 0))).toEqual([0]);
    // Without `ids`, labels are ids for reading, and indices are written.
    const labelled = build({
      labels: ['r', 'a', 'b'],
      parents: ['', 'r', 'r'],
      arrangement: 'tree',
      tree: { collapsed: ['r'] },
    });
    expect(Array.from(collapsedMask(labelled.trace, labelled.calc.model)!)).toEqual([1, 0, 0]);
    expect(collapsedValue(labelled.trace, labelled.calc.model, Uint8Array.of(1, 0, 0))).toEqual([
      0,
    ]);
  });

  it('maps the arc and hive attributes', () => {
    const plain = build({ ...CYCLE, arrangement: 'arc' });
    expect(arcOptionsOf(plain.trace, plain.calc.model)).toEqual({
      orientation: 'h',
      order: 'input',
      nodesep: 20,
      groupsep: 0,
      sides: 'above',
      loopSize: 12,
    });
    const arc = build({
      ...GROUPED,
      arrangement: 'arc',
      arc: { orientation: 'v', nodesep: 5, groupsep: 9, sides: 'direction', maxheight: 80 },
    });
    expect(arcOptionsOf(arc.trace, arc.calc.model)).toEqual({
      orientation: 'v',
      // Groups order the line unless the figure says otherwise.
      order: 'group',
      nodesep: 5,
      groupsep: 9,
      sides: 'direction',
      loopSize: 12,
      maxHeight: 80,
    });
    expect(hiveOptionsOf(defaults({ ...CYCLE, arrangement: 'hive' }).trace)).toEqual({
      axes: 3,
      assign: 'degree',
      startAngle: 90,
      innerRadius: 40,
      outerRadius: 300,
      position: 'degree',
    });
    const hive = defaults({
      ...CYCLE,
      arrangement: 'hive',
      hive: { axes: 4, startangle: 0, innerradius: 500, outerradius: 100, position: 'value' },
    }).trace;
    // The outer radius is never inside the inner one.
    expect(hiveOptionsOf(hive)).toMatchObject({
      axes: 4,
      startAngle: 0,
      innerRadius: 500,
      outerRadius: 500,
      position: 'value',
    });
  });
});

describe('graph defaults by arrangement', () => {
  it('draws a layered graph with boxes and arrowheads', () => {
    const { trace } = defaults({ ...CYCLE, arrangement: 'layered' });
    expect(container(trace, 'node')['shape']).toBe('box');
    expect(container(container(trace, 'link'), 'arrow')['end']).toBe(true);
    expect(container(container(trace, 'link'), 'secondary')).toEqual({
      dash: 'dash',
      opacity: 0.7,
    });
    // The figure's word wins, and nodes without labels stay markers.
    const set = defaults({
      ...CYCLE,
      arrangement: 'layered',
      node: { ...CYCLE.node, shape: 'marker' },
      link: { ...CYCLE.link, arrow: { end: false } },
    }).trace;
    expect(container(set, 'node')['shape']).toBe('marker');
    expect(container(container(set, 'link'), 'arrow')['end']).toBe(false);
    const bare = defaults({ link: CYCLE.link, arrangement: 'layered' }).trace;
    expect(container(bare, 'node')['shape']).toBe('marker');
  });

  it('keeps markers, plain links and no secondary style elsewhere', () => {
    const { trace } = defaults({ ...CYCLE, arrangement: 'force' });
    expect(container(trace, 'node')).toMatchObject({ shape: 'marker', size: 10 });
    expect(container(container(trace, 'link'), 'arrow')['end']).toBe(false);
    expect(container(trace, 'link')).not.toHaveProperty('secondary');
  });

  it('grows a tree from the left and a dendrogram from the top, with smaller nodes', () => {
    const tree = defaults({ ...TREE, arrangement: 'tree' }).trace;
    expect(container(tree, 'tree')).toEqual({
      orientation: 'LR',
      links: 'curved',
      nodesep: 10,
      sort: 'input',
      collapsible: true,
    });
    const dendrogram = defaults({ ...TREE, arrangement: 'dendrogram' }).trace;
    expect(container(dendrogram, 'tree')).toMatchObject({ orientation: 'TB', links: 'elbow' });
    expect(container(dendrogram, 'node')['size']).toBe(6);
    expect(container(defaults({ ...TREE, arrangement: 'tree' }).trace, 'node')['size']).toBe(10);
    const radial = defaults({ ...TREE, arrangement: 'radial' }).trace;
    expect(container(radial, 'tree')).toMatchObject({ sector: { start: 0, span: 360 } });
    expect(container(radial, 'tree')).not.toHaveProperty('orientation');
  });

  it('coerces only the container of the arrangement in use', () => {
    const all = { force: { seed: 3 }, layered: { ranksep: 9 }, tree: { nodesep: 2 } };
    const force = defaults({ ...CYCLE, ...all, arrangement: 'force' }).trace;
    expect(force).toHaveProperty('force');
    expect(force).not.toHaveProperty('layered');
    expect(force).not.toHaveProperty('tree');
    const layered = defaults({ ...CYCLE, ...all, arrangement: 'layered' }).trace;
    expect(layered).toHaveProperty('layered');
    expect(layered).not.toHaveProperty('force');
    const preset = defaults({
      node: { x: [0, 1], y: [0, 1] },
      ...all,
    }).trace;
    expect(preset['arrangement']).toBe('preset');
    for (const key of ['force', 'layered', 'tree', 'arc', 'hive']) {
      expect(preset).not.toHaveProperty(key);
    }
  });

  it('orders an arc diagram by group when there are groups', () => {
    expect(container(defaults({ ...GROUPED, arrangement: 'arc' }).trace, 'arc')['order']).toBe(
      'group',
    );
    expect(container(defaults({ ...CYCLE, arrangement: 'arc' }).trace, 'arc')['order']).toBe(
      'input',
    );
  });

  it('is a fixed point for every arrangement', () => {
    for (const arrangement of ['force', 'layered', 'tree', 'radial', 'dendrogram', 'arc', 'hive']) {
      const figure = {
        data: [{ type: 'graph', ...GROUPED, arrangement }],
        layout: { template: 'none' },
      };
      const first = supplyDefaults(figure, registry.core, { onIssue: () => {} });
      const again = supplyDefaults(
        { data: first.fullData.map((t) => ({ ...t })), layout: { template: 'none' } },
        registry.core,
        { onIssue: () => {} },
      );
      const strip = (t: object): unknown =>
        JSON.parse(JSON.stringify(t, (key, v: unknown) => (key.startsWith('_') ? undefined : v)));
      expect(strip(again.fullData[0]!), arrangement).toEqual(strip(first.fullData[0]!));
    }
  });
});

describe('graph axes by arrangement', () => {
  const axesOf = (input: Record<string, unknown>, layout: Record<string, unknown> = {}) => {
    const { fullLayout } = defaults(input, layout);
    return (key: string) => fullLayout[key] as FullAxis & Record<string, unknown>;
  };

  it('locks the scales of everything but a tidy tree and a dendrogram', () => {
    expect(equalScales('force')).toBe(true);
    expect(equalScales('radial')).toBe(true);
    expect(equalScales('tree')).toBe(false);
    expect(equalScales('dendrogram')).toBe(false);
    const tree = axesOf({ ...TREE, arrangement: 'tree' });
    expect(tree('xaxis').visible).toBe(false);
    expect(tree('yaxis').visible).toBe(false);
    expect(tree('yaxis').scaleanchor).toBeUndefined();
    expect(axesOf({ ...TREE, arrangement: 'radial' })('yaxis').scaleanchor).toBe('x');
    expect(axesOf({ ...CYCLE, arrangement: 'layered' })('yaxis').scaleanchor).toBe('x');
  });

  it('shows the axis of the heights of a dendrogram, in data units', () => {
    const input = { ...TREE, arrangement: 'dendrogram', node: { value: [9, 4, 0, 0, 0] } };
    const { trace } = defaults(input);
    expect(realAxisOf(trace, 'dendrogram')).toEqual({ axis: 'y', reversed: false, kind: 'value' });
    expect(graphAxisHints(trace)).toEqual({ hide: 'x', y: [9, 4, 0, 0, 0] });
    const axes = axesOf(input);
    expect(axes('xaxis').visible).toBe(false);
    expect(axes('yaxis').visible).toBe(true);
    expect(axes('yaxis').type).toBe('linear');
    expect(axes('yaxis').scaleanchor).toBeUndefined();
    expect(axes('yaxis').autorange).toBe(true);
  });

  it('turns the axis of the heights with the orientation', () => {
    const at = (orientation: string) => {
      const input = {
        ...TREE,
        arrangement: 'dendrogram',
        node: { value: [9, 4, 0, 0, 0] },
        tree: { orientation },
      };
      return { real: realAxisOf(defaults(input).trace, 'dendrogram'), axes: axesOf(input) };
    };
    // The root, with the largest height, is at the bottom: the axis runs downwards.
    const bt = at('BT');
    expect(bt.real).toEqual({ axis: 'y', reversed: true, kind: 'value' });
    expect(bt.axes('yaxis').autorange).toBe('reversed');
    const lr = at('LR');
    expect(lr.real).toEqual({ axis: 'x', reversed: true, kind: 'value' });
    expect(lr.axes('xaxis').autorange).toBe('reversed');
    expect(lr.axes('xaxis').visible).toBe(true);
    expect(lr.axes('yaxis').visible).toBe(false);
    expect(at('RL').real).toEqual({ axis: 'x', reversed: false, kind: 'value' });
  });

  it('hides both axes of a dendrogram without heights', () => {
    const input = { ...TREE, arrangement: 'dendrogram' };
    expect(realAxisOf(defaults(input).trace, 'dendrogram')).toBeUndefined();
    const axes = axesOf(input);
    expect(axes('xaxis').visible).toBe(false);
    expect(axes('yaxis').visible).toBe(false);
    // Values that are not numbers are no heights.
    const blank = { ...input, node: { value: ['', null, 'x'] } };
    expect(realAxisOf(defaults(blank).trace, 'dendrogram')).toBeUndefined();
  });

  it('keeps the axis of a timeline: every node has an x and none a y', () => {
    const input = {
      arrangement: 'force',
      node: { x: ['2020-01-01', '2021-01-01', '2022-01-01'] },
      link: { source: [0, 1], target: [1, 2] },
    };
    expect(realAxisOf(defaults(input).trace, 'force')).toEqual({
      axis: 'x',
      reversed: false,
      kind: 'position',
    });
    const axes = axesOf(input);
    expect(axes('xaxis').visible).toBe(true);
    expect(axes('xaxis').type).toBe('date');
    expect(axes('yaxis').visible).toBe(false);
    expect(axes('yaxis').scaleanchor).toBeUndefined();
    // Some nodes with an x, or an x and a y: pins, and no axis.
    const some = { ...input, node: { x: [0, null, 5], label: ['a', 'b', 'c'] } };
    expect(realAxisOf(defaults(some).trace, 'force')).toBeUndefined();
    const both = { ...input, node: { x: [0, 1, 2], y: [0, null, null] } };
    expect(realAxisOf(defaults(both).trace, 'force')).toBeUndefined();
    const along = { ...input, node: { y: [1, 2, 3] } };
    expect(realAxisOf(defaults(along).trace, 'force')?.axis).toBe('y');
  });
});

describe('graph calc by arrangement', () => {
  it('places a force layout: finite, deterministic, the layout itself', () => {
    const a = build({ ...GROUPED, arrangement: 'force' });
    const b = build({ ...GROUPED, arrangement: 'force' });
    expect(a.calc.arrangement).toBe('force');
    expect(finite(a.calc.x) && finite(a.calc.y)).toBe(true);
    expect(Array.from(a.calc.x)).toEqual(Array.from(b.calc.x));
    const direct = forceLayout(a.calc.force!.graph, a.calc.force!.options);
    expect(Array.from(a.calc.x)).toEqual(Array.from(direct.x));
    expect(Array.from(a.calc.y)).toEqual(Array.from(direct.y));
    expect(a.calc).toMatchObject({ units: true, equal: true, preset: false, real: undefined });
    expect(a.calc.force).toMatchObject({ simulate: false, options: { ticks: 600 } });
    // Force is the arrangement of a graph without positions.
    expect(build(GROUPED).calc.arrangement).toBe('force');
  });

  it('untangles a short path with its defaults', () => {
    const { calc } = build({ link: { source: [0, 1, 2, 3], target: [1, 2, 3, 4] } });
    const step = (a: number, b: number) =>
      Math.hypot(calc.x[a]! - calc.x[b]!, calc.y[a]! - calc.y[b]!);
    const length = step(0, 1) + step(1, 2) + step(2, 3) + step(3, 4);
    // With d3's defaults the same path ends at 0.43 of its length.
    expect(step(0, 4) / length).toBeGreaterThan(0.95);
  });

  it('holds pinned nodes where the figure put them', () => {
    const { calc } = build({
      arrangement: 'force',
      node: { x: [0, null, 100, null], y: [0, null, 50, null] },
      link: { source: [0, 1, 2], target: [1, 2, 3] },
    });
    expect([calc.x[0], calc.y[0], calc.x[2], calc.y[2]]).toEqual([0, 0, 100, 50]);
    expect(finite(calc.x) && finite(calc.y)).toBe(true);
    expect(calc.real).toBeUndefined();
  });

  it('simulates only when asked, and not a graph too large to step on the main thread', () => {
    const on = build({ ...GROUPED, arrangement: 'force', force: { simulate: true } });
    expect(on.calc.force!.simulate).toBe(true);
    const n = SIMULATE_MAX_NODES + 1;
    const large = build({
      arrangement: 'force',
      force: { simulate: true, ticks: 1 },
      node: { size: new Array<number>(n).fill(4) },
    });
    expect(large.calc.length).toBe(n);
    expect(large.calc.force!.simulate).toBe(false);
  });

  it('keeps the nodes of a timeline at their values and lays out the other axis in px', () => {
    const dates = ['2020-01-01', '2020-07-01', '2021-01-01', '2022-01-01'];
    const input = {
      arrangement: 'force',
      node: { x: dates },
      link: { source: [0, 1, 2, 0], target: [1, 2, 3, 3] },
    };
    const { calc, trace } = build(
      input,
      { width: 700, height: 400, margin: { l: 50, r: 50, t: 50, b: 50 } },
      { xaxis: axisInfo('date') },
    );
    const ms = dates.map((d) => Date.parse(d));
    expect(Array.from(calc.x)).toEqual(ms);
    expect(calc).toMatchObject({ units: false, equal: false, real: { axis: 'x' } });
    expect(finite(calc.y)).toBe(true);
    // The layout saw the dates spread over the width of the plot area, not as milliseconds.
    const given = calc.force!.graph.x;
    expect(given[3]! - given[0]!).toBeCloseTo(600 - 80, 6);
    expect(Math.max(...Array.from(calc.y).map(Math.abs))).toBeLessThan(600);
    // Along the free axis a unit stays a px: autorange spans the height of the plot area.
    const range = graphExtremes(calc, trace).y!;
    const lo = Math.min(...range.min.map((e) => e.l));
    const hi = Math.max(...range.max.map((e) => e.l));
    expect(hi - lo).toBeCloseTo(300 - 40, 6);
  });

  it('routes a layered graph, and sets apart the links it turned around', () => {
    const { calc, trace } = build({ ...CYCLE, arrangement: 'layered' });
    expect(calc.arrangement).toBe('layered');
    expect(calc.model.box).toBe(true);
    expect(finite(calc.x) && finite(calc.y)).toBe(true);
    // Top to bottom: every link that was not turned points down.
    expect(Array.from(calc.reversed!)).toEqual([0, 0, 0, 1, 0]);
    expect(calc.secondary).toBe(calc.reversed);
    for (let k = 0; k < 3; k++) {
      expect(calc.y[calc.model.target[k]!]!).toBeLessThan(calc.y[calc.model.source[k]!]!);
    }
    // Every link has a route, the loop too.
    expect(calc.routes!.filter(Boolean)).toHaveLength(5);
    expect(calc.tree).toBeUndefined();
    // The turned link is drawn fainter, and dashed by a line of its own.
    const colors = linkColors(calc, trace) as Float32Array;
    expect(colors[4 * 3 + 3]).toBeCloseTo(colors[3]! * 0.7, 6);
    expect(secondaryDash(trace)).toBe('dash');
    // An acyclic graph has no secondary links.
    const dag = build({
      node: { label: ['a', 'b', 'c'] },
      link: { source: [0, 0, 1], target: [1, 2, 2] },
      arrangement: 'layered',
    });
    expect(dag.calc.secondary).toBeUndefined();
    expect(linkColors(dag.calc, dag.trace)).toHaveLength(4);
  });

  it('runs a layered graph in all four directions and with all three routings', () => {
    for (const rankdir of ['TB', 'BT', 'LR', 'RL']) {
      for (const routing of ['spline', 'polyline', 'orthogonal']) {
        const { calc } = build({
          node: { label: ['a', 'b', 'c', 'd'] },
          link: { source: [0, 0, 1, 2, 0], target: [1, 2, 3, 3, 3] },
          arrangement: 'layered',
          layered: { rankdir, routing },
        });
        const horizontal = rankdir === 'LR' || rankdir === 'RL';
        const along = horizontal ? calc.x : calc.y;
        const sign = rankdir === 'TB' || rankdir === 'RL' ? -1 : 1;
        expect(sign * (along[3]! - along[0]!), `${rankdir} ${routing}`).toBeGreaterThan(0);
        for (const route of calc.routes!) {
          expect(route!.kind).toBe(routing === 'spline' ? 'spline' : 'polyline');
          expect(Array.from(route!.points).every(Number.isFinite)).toBe(true);
        }
        if (routing === 'orthogonal') {
          // Every segment is level or upright.
          for (const route of calc.routes!) {
            const p = route!.points;
            for (let i = 2; i < p.length; i += 2) {
              const dx = Math.abs(p[i]! - p[i - 2]!);
              const dy = Math.abs(p[i + 1]! - p[i - 1]!);
              expect(Math.min(dx, dy)).toBeLessThan(1e-9);
            }
          }
        }
      }
    }
  });

  it('frames the groups of a layered graph around their nodes', () => {
    const { calc } = build({ ...GROUPED, arrangement: 'layered', layered: { clusters: true } });
    expect(calc.clusters).toHaveLength(2);
    for (const c of calc.clusters!) {
      for (let i = 0; i < calc.length; i++) {
        if (calc.model.group[i] !== c.group) continue;
        expect(calc.x[i]! - calc.model.halfWidth[i]!).toBeGreaterThan(c.x0);
        expect(calc.x[i]! + calc.model.halfWidth[i]!).toBeLessThan(c.x1);
        // The top of the frame also has the strip of its title.
        expect(calc.y[i]! + calc.model.halfHeight[i]!).toBeLessThan(c.y1 - 16);
        expect(calc.y[i]! - calc.model.halfHeight[i]!).toBeGreaterThan(c.y0);
      }
    }
  });

  it('lays out a tidy tree from ids and parents, with a route per tree link', () => {
    const { calc } = build({ ...TREE, arrangement: 'tree' });
    expect(calc.arrangement).toBe('tree');
    expect(finite(calc.x) && finite(calc.y)).toBe(true);
    // Left to right: children are to the right of their parent.
    expect(calc.x[1]!).toBeGreaterThan(calc.x[0]!);
    expect(calc.x[3]!).toBeGreaterThan(calc.x[1]!);
    expect(calc.routes!.filter(Boolean).length).toBeGreaterThan(0);
    expect(calc.tree).toMatchObject({
      parent: Int32Array.of(-1, 0, 0, 1, 1),
      children: Int32Array.of(2, 2, 0, 0, 0),
      collapsed: new Uint8Array(5),
    });
    expect(calc.secondary).toBeUndefined();
    expect(calc).toMatchObject({ units: true, equal: false });
    expect(calc.labelRule).toEqual({
      kind: 'tree',
      orientation: 'LR',
      leaf: Uint8Array.of(0, 0, 1, 1, 1),
    });
  });

  it('builds the tree of node and link input, and sets the other links apart', () => {
    const { calc, trace } = build({
      node: { label: ['r', 'a', 'b', 'c'] },
      // r → a, r → b, a → c, and b → c, which is not a tree link.
      link: { source: [0, 0, 1, 2], target: [1, 2, 3, 3] },
      arrangement: 'tree',
    });
    expect(Array.from(calc.tree!.parent)).toEqual([-1, 0, 0, 1]);
    expect(Array.from(calc.secondary!)).toEqual([0, 0, 0, 1]);
    // It has no route: it is drawn straight, in the secondary style.
    expect(calc.routes![3]).toBeUndefined();
    const colors = linkColors(calc, trace) as Float32Array;
    expect(colors[15]).toBeCloseTo(colors[3]! * 0.7, 6);
  });

  it('folds a subtree: its nodes are hidden, parked on the node that holds them', () => {
    const open = build({ ...TREE, arrangement: 'tree' });
    const { calc } = build({ ...TREE, arrangement: 'tree', tree: { collapsed: ['a'] } });
    expect(Array.from(calc.hidden)).toEqual([0, 0, 0, 1, 1]);
    expect(Array.from(calc.tree!.collapsed)).toEqual([0, 1, 0, 0, 0]);
    // Not drawn and not ranged over, but with a place to move from and to.
    expect(Number.isNaN(calc.x[3])).toBe(true);
    expect([calc.tree!.x[3], calc.tree!.y[3]]).toEqual([calc.x[1], calc.y[1]]);
    expect([calc.tree!.x[4], calc.tree!.y[4]]).toEqual([calc.x[1], calc.y[1]]);
    // The collapsed node is a leaf for its label now, and the tree is smaller.
    expect((calc.labelRule as { leaf: Uint8Array }).leaf[1]).toBe(1);
    const height = (c: typeof calc) =>
      Math.max(...Array.from(c.y).filter(Number.isFinite)) -
      Math.min(...Array.from(c.y).filter(Number.isFinite));
    expect(height(calc)).toBeLessThan(height(open.calc));
    // A leaf that is named in `collapsed` has nothing to fold.
    const leaf = build({ ...TREE, arrangement: 'tree', tree: { collapsed: ['b'] } });
    expect(leaf.calc.tree!.collapsed.includes(1)).toBe(false);
    expect(leaf.calc.hidden.includes(1)).toBe(false);
  });

  it('makes the restyle of a click: the node in or out of tree.collapsed', () => {
    const open = build({ ...TREE, arrangement: 'tree' });
    expect(collapseToggle(open.trace, open.calc.model, open.calc.tree!, 1)).toEqual({
      'tree.collapsed': [['a']],
    });
    // A leaf has nothing to fold.
    expect(collapseToggle(open.trace, open.calc.model, open.calc.tree!, 2)).toBeUndefined();
    expect(collapseToggle(open.trace, open.calc.model, open.calc.tree!, -1)).toBeUndefined();
    const folded = build({ ...TREE, arrangement: 'tree', tree: { collapsed: ['a', 'r'] } });
    expect(collapseToggle(folded.trace, folded.calc.model, folded.calc.tree!, 0)).toEqual({
      'tree.collapsed': [['a']],
    });
  });

  it('lays out a radial tree around its root, with the angle of every node', () => {
    const { calc } = build({ ...TREE, arrangement: 'radial' });
    expect(calc.arrangement).toBe('radial');
    expect([calc.x[0], calc.y[0]]).toEqual([0, 0]);
    const r = (i: number) => Math.hypot(calc.x[i]!, calc.y[i]!);
    expect(r(1)).toBeCloseTo(r(2), 6);
    expect(r(3)).toBeGreaterThan(r(1));
    expect(calc.labelRule).toMatchObject({ kind: 'radial', leaf: Uint8Array.of(0, 0, 1, 1, 1) });
    expect(calc).toMatchObject({ units: true, equal: true });
  });

  it('puts the heights of a dendrogram on its axis as values', () => {
    const value = [9, 4, 0, 0, 0];
    const { calc, trace } = build({ ...TREE, arrangement: 'dendrogram', node: { value } });
    expect(Array.from(calc.model.nodeValue!)).toEqual(value);
    // y is the value itself; x is the layout's, with the leaves evenly spaced.
    expect(Array.from(calc.y)).toEqual(value);
    expect(finite(calc.x)).toBe(true);
    expect(calc).toMatchObject({ units: false, equal: false, real: { axis: 'y', kind: 'value' } });
    // The brackets are in the same coordinates: no point of a route is above the root.
    const ys = calc.routes!.flatMap((route) =>
      route ? Array.from(route.points).filter((_, j) => j % 2 === 1) : [],
    );
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(9);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    // Labels hang under the leaves, turned upright, and autorange leaves them room below.
    expect(calc.labelRule).toMatchObject({ kind: 'tree', orientation: 'TB' });
    const range = graphExtremes(calc, trace).y!;
    expect(Math.max(...range.min.map((e) => e.padPx))).toBeGreaterThan(20);
    expect(nodeFields(calc, trace, 1)['value']).toBe(4);
    expect(nodeFields(calc, trace, 2)['value']).toBe(0);
  });

  it('draws a dendrogram without heights by levels, on hidden axes', () => {
    const { calc } = build({ ...TREE, arrangement: 'dendrogram' });
    expect(calc.real).toBeUndefined();
    expect(calc.units).toBe(true);
    // The leaves are on one line, the root above them.
    expect(new Set([calc.y[2], calc.y[3], calc.y[4]]).size).toBe(1);
    expect(calc.y[0]!).toBeGreaterThan(calc.y[1]!);
    expect(calc.y[1]!).toBeGreaterThan(calc.y[3]!);
  });

  it('turns a sideways dendrogram: values along x, root at the high end', () => {
    const { calc } = build({
      ...TREE,
      arrangement: 'dendrogram',
      node: { value: [9, 4, 0, 0, 0] },
      tree: { orientation: 'LR' },
    });
    expect(Array.from(calc.x)).toEqual([9, 4, 0, 0, 0]);
    expect(calc.real).toEqual({ axis: 'x', reversed: true, kind: 'value' });
    expect(calc.labelRule).toMatchObject({ orientation: 'RL' });
  });

  it('puts the nodes of an arc diagram on a line, with an arc per link', () => {
    const { calc } = build({ ...GROUPED, arrangement: 'arc' });
    expect(new Set(Array.from(calc.y)).size).toBe(1);
    expect(new Set(Array.from(calc.x)).size).toBe(6);
    expect(calc.routes!.filter(Boolean)).toHaveLength(7);
    expect(calc.labelRule).toEqual({ kind: 'arc', vertical: false, arcs: 'above' });
    const upright = build({
      ...GROUPED,
      arrangement: 'arc',
      arc: { orientation: 'v', sides: 'below' },
    });
    expect(new Set(Array.from(upright.calc.x)).size).toBe(1);
    expect(upright.calc.labelRule).toEqual({ kind: 'arc', vertical: true, arcs: 'below' });
  });

  it('puts the groups of a hive plot on axes and leaves out the links within one', () => {
    const { calc, trace } = build({ ...GROUPED, arrangement: 'hive' });
    // Links within a group: 0–1, 1–2, 0–2, 3–4, 4–5. Between: 2–3, 0–5.
    expect(Array.from(calc.omitted!)).toEqual([1, 1, 1, 1, 1, 0, 0]);
    expect(calc.guides!.titles.map((t) => t.text)).toEqual(['p', 'q']);
    expect(Array.from(calc.guides!.starts)).toEqual([2]);
    // The first axis points up, from the inner to the outer radius.
    expect(calc.guides!.x[0]).toBeCloseTo(0, 9);
    expect([calc.guides!.y[0], calc.guides!.y[1]]).toEqual([40, 300]);
    expect(calc.labelRule).toMatchObject({ kind: 'hive' });
    // Every node is on the line of its axis.
    for (let i = 0; i < 3; i++) expect(calc.x[i]).toBeCloseTo(0, 9);
    const drawn = drawnLinks(calc, trace, 1, 1).geometry;
    const count = (k: number) => drawn.offsets[k + 1]! - drawn.offsets[k]!;
    expect([0, 1, 2, 3, 4].map(count)).toEqual([0, 0, 0, 0, 0]);
    expect(count(5)).toBeGreaterThan(2);
    // A hidden group takes its axis with it.
    const hidden = build({ ...GROUPED, arrangement: 'hive' }, { hiddenlabels: ['q'] });
    expect(hidden.calc.guides!.titles.map((t) => t.text)).toEqual(['p']);
  });

  it('names the three axes of a hive plot by direction', () => {
    const { calc } = build({
      link: { source: [0, 1, 0], target: [1, 2, 2] },
      arrangement: 'hive',
      hive: { assign: 'direction' },
    });
    expect(calc.guides!.titles.map((t) => t.text)).toEqual(['Sources', 'Between', 'Sinks']);
    expect(build({ ...CYCLE, arrangement: 'hive' }).calc.guides!.titles).toEqual([]);
  });

  it('fingerprints what the layout read, and nothing else', () => {
    const key = (input: Record<string, unknown>) => build(input).calc.layoutKey;
    const base = { ...GROUPED, arrangement: 'force' };
    expect(key(base)).toBe(key(base));
    // Style, labels of marker nodes and hover data do not move anything.
    expect(
      key({
        ...base,
        node: { ...GROUPED.node, label: ['1', '2', '3', '4', '5', '6'], color: 'red' },
        link: { ...GROUPED.link, width: 4, color: 'blue' },
        force: { simulate: true },
      }),
    ).toBe(key(base));
    // The graph, the sizes and the options do.
    expect(key({ ...base, link: { source: [0], target: [1] } })).not.toBe(key(base));
    expect(key({ ...base, node: { ...GROUPED.node, size: 30 } })).not.toBe(key(base));
    expect(key({ ...base, force: { charge: -100 } })).not.toBe(key(base));
    expect(key({ ...base, force: { seed: 2 } })).not.toBe(key(base));
    expect(key({ ...base, arrangement: 'circular' })).not.toBe(key(base));
  });
});

describe('room around nodes for the layouts', () => {
  it('counts a line of label where labels would run into each other', () => {
    const sideways = build({ ...TREE, arrangement: 'tree' });
    const grown = layoutExtents(sideways.trace, 'tree', sideways.calc.model)!;
    // Labels read along the levels: their height counts across them.
    expect(grown.halfHeight[0]!).toBeGreaterThan(sideways.calc.model.halfHeight[0]!);
    expect(grown.halfWidth[0]).toBe(sideways.calc.model.halfWidth[0]);
    const down = build({ ...TREE, arrangement: 'dendrogram' });
    const upright = layoutExtents(down.trace, 'dendrogram', down.calc.model)!;
    expect(upright.halfWidth[0]!).toBeGreaterThan(down.calc.model.halfWidth[0]!);
    expect(upright.halfHeight[0]).toBe(down.calc.model.halfHeight[0]);
    const arc = build({ ...CYCLE, arrangement: 'arc' });
    expect(layoutExtents(arc.trace, 'arc', arc.calc.model)!.halfWidth[0]).toBeGreaterThan(5);
  });

  it('leaves nodes as they are without labels beside them', () => {
    const none = build({ ...TREE, arrangement: 'tree', node: { textposition: 'none' } });
    expect(layoutExtents(none.trace, 'tree', none.calc.model)).toBeUndefined();
    const boxes = build({ ...TREE, arrangement: 'tree', node: { shape: 'box' } });
    expect(layoutExtents(boxes.trace, 'tree', boxes.calc.model)).toBeUndefined();
    const force = build({ ...CYCLE, arrangement: 'force' });
    expect(layoutExtents(force.trace, 'force', force.calc.model)).toBeUndefined();
  });

  it('keeps room for the ring of a collapsed node', () => {
    const folded = build({
      ...TREE,
      arrangement: 'radial',
      node: { textposition: 'none' },
      tree: { collapsed: ['a'] },
    });
    const extents = layoutExtents(folded.trace, 'radial', folded.calc.model)!;
    expect(extents.halfWidth[1]).toBe(folded.calc.model.halfWidth[1]! + RING_REACH);
    expect(extents.halfWidth[0]).toBe(folded.calc.model.halfWidth[0]);
  });
});

describe('what is on screen', () => {
  const IDENTITY = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

  it('is the calc until a frame is shown, and the calc again after', () => {
    const { calc } = build({ ...GROUPED, arrangement: 'circular' });
    expect(frameOf(calc)).toMatchObject({ x: calc.x, y: calc.y, hidden: calc.hidden, stamp: 0 });
    const moved = {
      x: calc.x.map((v) => v + 500),
      y: calc.y,
      hidden: calc.hidden,
      routes: undefined,
    };
    const a = showFrame(calc, moved);
    expect(frameOf(calc)).toBe(a);
    expect(a.stamp).toBeGreaterThan(0);
    expect(showFrame(calc, moved).stamp).toBeGreaterThan(a.stamp);
    expect(showFrame(calc, undefined).stamp).toBe(0);
    expect(frameOf(calc).x).toBe(calc.x);
  });

  it('answers hover and selection where the nodes are drawn', () => {
    const { calc, trace, fullLayout } = build({ ...GROUPED, arrangement: 'circular' });
    const ctx = { fullLayout, xaxis: undefined, yaxis: undefined, transform: IDENTITY };
    const at = (x: number, y: number) =>
      graphHoverPoints(
        calc,
        trace,
        { px: x, py: y, xl: x, yl: y, mode: 'closest', distance: 20 },
        ctx as never,
      )[0];
    const [x0, y0] = [calc.x[0]!, calc.y[0]!];
    expect(at(x0, y0)).toMatchObject({ kind: 'node', pointIndex: 0 });
    showFrame(calc, {
      x: calc.x.map((v) => v + 500),
      y: calc.y,
      hidden: calc.hidden,
      routes: undefined,
    });
    // The node moved with its frame: nothing where it was, and it is found where it is.
    expect(at(x0, y0)?.kind).not.toBe('node');
    expect(at(x0 + 500, y0)).toMatchObject({ kind: 'node', pointIndex: 0, px: x0 + 500 });
    expect(nodeAt(calc, { xl: x0 + 500, yl: y0, distance: 0 }, { transform: IDENTITY })?.[0]).toBe(
      0,
    );
    // The links are rebuilt for the frame too.
    expect(drawnLinks(calc, trace, 1, 1).geometry.x[0]).toBe(x0 + 500);
    showFrame(calc, undefined);
    expect(at(x0, y0)).toMatchObject({ kind: 'node', pointIndex: 0 });
    expect(drawnLinks(calc, trace, 1, 1).geometry.x[0]).toBe(x0);
  });

  it('draws the boxes of a diagram smaller when the axes shrink it', () => {
    const { calc, trace, fullLayout } = build({ ...CYCLE, arrangement: 'layered' });
    expect(nodeScaleOf(calc, 1, 1)).toBe(1);
    expect(nodeScaleOf(calc, 2.5, 2.5)).toBe(1);
    expect(nodeScaleOf(calc, 0.5, -0.5)).toBe(0.5);
    expect(nodeScaleOf(calc, 0, 0)).toBe(1);
    // Markers, and boxes at positions that are data, keep their size.
    expect(nodeScaleOf(build({ ...CYCLE, arrangement: 'circular' }).calc, 0.5, 0.5)).toBe(1);
    const preset = build({ node: { shape: 'box', label: ['a', 'b'], x: [0, 1000], y: [0, 1] } });
    expect(nodeScaleOf(preset.calc, 0.5, 0.5)).toBe(1);
    // A box is hit inside its drawn size only: at half the scale it is as wide in layout units
    // as it was, where a box of fixed size would be twice as wide.
    const half = { scaleX: 0.5, scaleY: 0.5, offsetX: 0, offsetY: 0 };
    const hw = calc.model.halfWidth[0]!;
    const inside = { xl: calc.x[0]! + hw * 0.9, yl: calc.y[0]!, distance: 0 };
    const beyond = { xl: calc.x[0]! + hw * 1.5, yl: calc.y[0]!, distance: 0 };
    expect(nodeAt(calc, inside, { transform: IDENTITY })?.[0]).toBe(0);
    expect(nodeAt(calc, inside, { transform: half })?.[0]).toBe(0);
    expect(nodeAt(calc, beyond, { transform: half })).toBeUndefined();
    const fixed = {
      xl: preset.calc.x[0]! + preset.calc.model.halfWidth[0]! * 1.5,
      yl: 0,
      distance: 0,
    };
    const zoomedOut = { scaleX: 0.5, scaleY: 0.5, offsetX: 0, offsetY: 0 };
    expect(nodeAt(preset.calc, fixed, { transform: zoomedOut })?.[0]).toBe(0);
    expect(nodeBoxStyle(calc, trace, fullLayout).borderWidth).toBe(1);
  });

  it('frames a collapsed box in the text color', () => {
    const { calc, trace, fullLayout } = build(
      { ...TREE, arrangement: 'tree', node: { shape: 'box' }, tree: { collapsed: ['a'] } },
      { font: { color: '#ff0000' } },
    );
    const style = nodeBoxStyle(calc, trace, fullLayout);
    expect(Array.from(style.borderWidth as Float32Array)).toEqual([1, 2, 1, 1, 1]);
    expect(Array.from((style.borderColor as Float32Array).subarray(4, 8))).toEqual([1, 0, 0, 1]);
  });
});
