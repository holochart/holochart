import { supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  ArcPrimitive,
  createResourceManager,
  LazyFillPrimitive,
  TextPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type ComponentPointerEvent,
  type HoverContext,
  type KeyboardPoint,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { chordNodeCount, isLinkInput, type ChordCalc } from './calc.ts';
import { ringPoint } from './geometry.ts';
import {
  chordHoverPoints,
  groupFields,
  highlightOf,
  hitTest,
  hoverLabel,
  hoverModel,
  linkFields,
  nodeFields,
  partHoverinfo,
  percentLabel,
  toHoverPoint,
  valueLabel,
} from './hover.ts';
import { chord } from './index.ts';
import { TEXT_PAD } from './labels.ts';
import { chordLegendIcon, chordLegendItems } from './legend.ts';
import {
  buildModel,
  DIM,
  fontOf,
  GRADIENT_STRIPS,
  groupColors,
  HOVER_ALPHA,
  LABEL_SHARE,
  modelFor,
  nodeColors,
  traceRect,
  type ChordModel,
} from './model.ts';
import { arcData, ribbonColors, ribbonData, textLabels } from './plot.ts';

// troika typesets in a worker with browser globals; the view test only needs its object graph.
vi.mock('../../../render/node_modules/troika-three-text', async () => {
  const { Object3D } = await import('three');
  type Node = InstanceType<typeof Object3D>;
  const noopDispose = (o: object): void => {
    Object.assign(o, { dispose: (): void => {} });
  };
  class Text extends Object3D {
    constructor() {
      super();
      noopDispose(this);
    }
  }
  class BatchedText extends Object3D {
    material: unknown = null;
    addText(text: Node): void {
      this.add(text);
    }
    removeText(text: Node): void {
      this.remove(text);
    }
    constructor() {
      super();
      noopDispose(this);
    }
    sync(callback?: () => void): void {
      callback?.();
    }
  }
  return { Text, BatchedText, configureTextBuilder: () => {}, preloadFont: () => {} };
});

const registry = createChartRegistry().register(chord);
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function build(input: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'chord', ...input }], layout: { template: 'none', ...layout } },
    registry.core,
  );
  const trace = fullData[0] as FullTrace;
  const calc = chord.calc!(trace, { fullLayout, index: 0, xaxis: undefined, yaxis: undefined });
  return { trace, calc, fullLayout };
}

const container = (trace: FullTrace, key: string) => trace[key] as Record<string, unknown>;

/** A → B 3, B → C 1, C → D 2, D → A 2: arcs A 5, B 4, C 3, D 4 of 16. */
const RING = {
  padangle: 0,
  textorientation: 'none',
  node: { label: ['A', 'B', 'C', 'D'] },
  link: { source: [0, 1, 2, 3], target: [1, 2, 3, 0], value: [3, 1, 2, 2] },
};
/** 400 × 300 px domain at (50, 20): the ring is centered on (250, 170), 150 px to the edge. */
const RECT = { x: 50, y: 20, width: 400, height: 300 };
const CX = 250;
const CY = 170;

function modelOf(input: Record<string, unknown> = RING, layout: Record<string, unknown> = {}) {
  const b = build(input, layout);
  return { ...b, model: buildModel(b.calc, b.trace, b.fullLayout, RECT) };
}

/** A container point at `degrees` clockwise from 12 o'clock and `radius` from the center. */
const at = (degrees: number, radius: number): [number, number] =>
  ringPoint(CX, CY, radius, degrees * DEG);

const hoverCtx = (fullLayout: HoverContext['fullLayout']): HoverContext => ({
  fullLayout,
  xaxis: undefined,
  yaxis: undefined,
  transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
  domain: { x: [0, 1], y: [0, 1], rect: RECT },
  height: 340,
});

describe('chord defaults', () => {
  it('is not drawn without links or a matrix', () => {
    expect(build({}).trace.visible).toBe(false);
    expect(build({ node: { label: ['A'] } }).trace.visible).toBe(false);
    expect(build({ matrix: [] }).trace.visible).toBe(false);
    // Links need both ends.
    expect(build({ link: { source: [0, 1] } }).trace.visible).toBe(false);
  });

  it('takes node / link input over a matrix', () => {
    const { trace } = build({ ...RING, matrix: [[1]], labels: ['x'] });
    expect(trace.visible).toBe(true);
    expect(trace['matrix']).toBeUndefined();
    expect(trace['labels']).toBeUndefined();
    expect(container(trace, 'link')['value']).toEqual([3, 1, 2, 2]);
    expect(container(trace, 'node')['label']).toEqual(['A', 'B', 'C', 'D']);
    expect(isLinkInput(trace)).toBe(true);
  });

  it('reads a matrix with its labels as the node labels', () => {
    const { trace } = build({
      matrix: [
        [0, 1],
        [2, 0],
      ],
      labels: ['x', 'y'],
    });
    expect(trace['matrix']).toEqual([
      [0, 1],
      [2, 0],
    ]);
    expect(container(trace, 'node')['label']).toEqual(['x', 'y']);
    expect(isLinkInput(trace)).toBe(false);
    // `node.label` wins over `labels`.
    const own = build({
      matrix: [
        [0, 1],
        [2, 0],
      ],
      labels: ['x', 'y'],
      node: { label: ['p', 'q'] },
    });
    expect(container(own.trace, 'node')['label']).toEqual(['p', 'q']);
  });

  it('fills in the look from the layout', () => {
    const { trace } = build(
      { ...RING, textorientation: undefined },
      { paper_bgcolor: '#123456', font: { family: 'Inter', size: 15, color: '#abc' } },
    );
    expect(trace['directed']).toBe(true);
    expect(trace['sort']).toBe('input');
    expect(trace['direction']).toBe('clockwise');
    expect(trace['rotation']).toBe(0);
    expect(trace['textorientation']).toBe('auto');
    expect(trace['valueformat']).toBe(',.4~g');
    const node = container(trace, 'node');
    expect(node['thickness']).toBe(12);
    expect(node['color']).toBeUndefined();
    expect(node['line']).toEqual({ color: 'rgb(18, 52, 86)', width: 0 });
    const link = container(trace, 'link');
    expect(link['sort']).toBe('position');
    expect(link['colorsource']).toBe('source');
    expect(link['opacity']).toBe(0.6);
    expect(link['gap']).toBe(2);
    expect(link['targetgap']).toBe(2);
    expect(link['arrowlen']).toBe(0);
    expect(trace['textfont']).toMatchObject({
      family: 'Inter',
      size: 15,
      color: 'rgb(170, 187, 204)',
      shadow: 'none',
    });
    // No groups: no group ring, and no legend (the labels are around the ring).
    expect(trace['groups']).toBeUndefined();
    expect(trace['showlegend']).toBe(false);
  });

  it('coerces the directed options only for a directed trace', () => {
    const { trace } = build({
      ...RING,
      directed: false,
      link: { ...RING.link, gap: 5, arrowlen: 9 },
    });
    const link = container(trace, 'link');
    expect(link['gap']).toBe(5);
    expect(link['targetgap']).toBeUndefined();
    expect(link['arrowlen']).toBeUndefined();
    // The target gap follows the gap.
    const directed = build({ ...RING, link: { ...RING.link, gap: 5 } });
    expect(container(directed.trace, 'link')['targetgap']).toBe(5);
  });

  it('adds the group ring, and the legend, with node.group', () => {
    const { trace, fullLayout } = build({
      ...RING,
      padangle: 3,
      textfont: { size: 9, color: 'red' },
      node: { ...RING.node, group: ['x', 'x', 'y', 'y'] },
    });
    expect(trace['showlegend']).toBe(true);
    const groups = container(trace, 'groups');
    expect(groups['visible']).toBe(true);
    expect(groups['thickness']).toBe(8);
    expect(groups['gap']).toBe(4);
    expect(groups['padangle']).toBe(6);
    expect(groups['textfont']).toMatchObject({ size: 9, color: 'rgb(255, 0, 0)', weight: 'bold' });
    expect(fullLayout['hiddenlabels']).toBeUndefined();
    expect(build(RING, { hiddenlabels: ['A'] }).fullLayout['hiddenlabels']).toEqual(['A']);
  });

  it('hands the trace hoverinfo down to its parts', () => {
    const none = build({ ...RING, hoverinfo: 'none' }).trace;
    expect(container(none, 'node')['hoverinfo']).toBe('none');
    expect(container(none, 'link')['hoverinfo']).toBe('none');
    const mixed = build({ ...RING, hoverinfo: 'skip', node: { ...RING.node, hoverinfo: 'all' } });
    expect(container(mixed.trace, 'node')['hoverinfo']).toBe('all');
    expect(container(mixed.trace, 'link')['hoverinfo']).toBe('skip');
    expect(container(build(RING).trace, 'node')['hoverinfo']).toBe('all');
  });
});

describe('chord calc', () => {
  it('counts nodes by their arrays, else by the links', () => {
    expect(build(RING).calc.nodes).toBe(4);
    // A longer per-node array adds nodes without links.
    expect(build({ ...RING, node: { label: ['A', 'B', 'C', 'D', 'E', 'F'] } }).calc.nodes).toBe(6);
    expect(
      build({ ...RING, node: { color: ['red', 'blue', 'green', 'gold', 'gray'] } }).calc.nodes,
    ).toBe(5);
    // One color for all is not an array.
    expect(
      build({ link: { source: [0, 4], target: [1, '2'] }, node: { color: 'red' } }).calc.nodes,
    ).toBe(5);
    expect(chordNodeCount({ link: { source: ['x'], target: [0] } })).toBe(0);
    expect(chordNodeCount({ matrix: [[0, 1, 2], [1]] })).toBe(3);
    expect(chordNodeCount({})).toBe(0);
  });

  it('keeps the links with two node ends and a positive value, and counts the rest', () => {
    const { calc } = build({
      node: { label: ['A', 'B', 'C'] },
      link: {
        source: [0, '1', 2, 0, 3, -1, 1, 0, 2, 1.5],
        target: [1, 2, 0, 0, 0, 1, 2, 1, null, 0],
        value: [2, '3', 0, 4, 1, 1, -5, 'x', 1, 1],
        label: ['first', undefined, 'zero'],
      },
    });
    // Kept: 0 → 1, '1' → 2 (numeric strings count), and the self-link 0 → 0.
    expect(calc.links.map((l) => [l.index, l.source, l.target, l.value])).toEqual([
      [0, 0, 1, 2],
      [1, 1, 2, 3],
      [3, 0, 0, 4],
    ]);
    expect(calc.links.map((l) => l.label)).toEqual(['first', '', '']);
    expect(calc.links.every((l) => !l.pair && l.reverse === 0)).toBe(true);
    expect(calc.dropped).toBe(7);
    expect(calc.total).toBe(9);
    expect(calc.matrix).toBe(false);
    expect(calc.directed).toBe(true);
    // The self-link takes its value of the arc once.
    expect(calc.layout.arcs.map((a) => a.value)).toEqual([6, 5, 3]);
    expect(calc.layout.ribbons.map((r) => r.self)).toEqual([false, false, true]);
  });

  it('gives every link a value of 1 without link.value', () => {
    const { calc } = build({ link: { source: [0, 0, 1], target: [1, 2, 2] } });
    expect(calc.links.map((l) => l.value)).toEqual([1, 1, 1]);
    expect(calc.dropped).toBe(0);
    expect(calc.layout.arcs.map((a) => a.value)).toEqual([2, 2, 2]);
    // An infinite value is no value.
    expect(build({ link: { source: [0], target: [1], value: [Infinity] } }).calc.dropped).toBe(1);
  });

  it('names nodes by their label, and groups in order of first appearance', () => {
    const { calc } = build({
      ...RING,
      node: { label: ['A', '', null, 7], group: ['y', 'x', '', 'y', 'extra'] },
    });
    expect(calc.nodes).toBe(5);
    expect(calc.labels).toEqual(['A', '', '', '7', '']);
    expect(calc.names).toEqual(['A', 'Node 1', 'Node 2', '7', 'Node 4']);
    expect(calc.groupNames).toEqual(['y', 'x', 'extra']);
    expect(Array.from(calc.group)).toEqual([0, 1, -1, 0, 2]);
    // 0 and false are names; objects are not.
    const odd = build({ ...RING, node: { group: [0, false, {}, null] } }).calc;
    expect(odd.groupNames).toEqual(['0', 'false']);
    expect(Array.from(odd.group)).toEqual([0, 1, -1, -1]);
    // The nodes of a group are next to each other on the ring.
    expect(calc.layout.arcs.map((a) => a.node)).toEqual([0, 3, 1, 2]);
    expect(calc.layout.groups.map((g) => g.nodes)).toEqual([[0, 3], [1]]);
  });

  it('reads a directed matrix cell by cell, and an undirected one pair by pair', () => {
    const matrix = [
      [1, 5, 0],
      [3, 0, 2],
      [0, 4, 6],
    ];
    const directed = build({
      matrix,
      labels: ['a', 'b', 'c'],
      link: { label: ['self', 'a→b'] },
    }).calc;
    expect(directed.matrix).toBe(true);
    expect(directed.nodes).toBe(3);
    // `pointNumber` is the flat cell index.
    expect(directed.links.map((l) => [l.index, l.source, l.target, l.value])).toEqual([
      [0, 0, 0, 1],
      [1, 0, 1, 5],
      [3, 1, 0, 3],
      [5, 1, 2, 2],
      [7, 2, 1, 4],
      [8, 2, 2, 6],
    ]);
    expect(directed.links.map((l) => l.label)).toEqual(['self', 'a→b', '', '', '', '']);
    expect(directed.total).toBe(21);
    const undirected = build({ matrix, directed: false }).calc;
    expect(undirected.directed).toBe(false);
    expect(undirected.links.map((l) => [l.source, l.target, l.value, l.reverse, l.pair])).toEqual([
      [0, 0, 1, 0, false],
      [0, 1, 5, 3, true],
      [1, 2, 2, 4, true],
      [2, 2, 6, 0, false],
    ]);
    // Both directions of a pair count in the total; each arc is its row's sum.
    expect(undirected.total).toBe(21);
    expect(undirected.layout.arcs.map((a) => a.value)).toEqual([6, 5, 10]);
    // Cells that are no flow are counted.
    expect(
      build({
        matrix: [
          [0, -1],
          ['x', 0],
          [1, 0],
        ],
      }).calc.dropped,
    ).toBe(2);
  });

  it('lays a matrix out like the node and link input it stands for', () => {
    const fromMatrix = build({
      padangle: 4,
      matrix: [
        [0, 5, 1],
        [3, 0, 2],
        [0, 4, 0],
      ],
    }).calc;
    const fromLinks = build({
      padangle: 4,
      link: { source: [0, 0, 1, 1, 2], target: [1, 2, 0, 2, 1], value: [5, 1, 3, 2, 4] },
    }).calc;
    expect(fromMatrix.layout.arcs).toEqual(fromLinks.layout.arcs);
    expect(fromMatrix.layout.ribbons).toEqual(fromLinks.layout.ribbons);
    expect(fromMatrix.total).toBe(fromLinks.total);
  });

  it('passes the layout options on', () => {
    const { calc } = build({
      ...RING,
      padangle: 10,
      rotation: 90,
      direction: 'counterclockwise',
      sort: 'value',
    });
    const { arcs, direction, scale } = calc.layout;
    expect(direction).toBe(-1);
    expect(arcs.map((a) => a.node)).toEqual([0, 1, 3, 2]);
    expect(arcs[0]!.start).toBeCloseTo(Math.PI / 2, 12);
    expect(scale).toBeCloseTo((TAU - 40 * DEG) / 16, 12);
    // Bands by width instead of by position.
    const byValue = build({
      link: { source: [0, 0, 0], target: [3, 1, 2], value: [1, 5, 3], sort: 'value' },
    }).calc.layout.ribbons;
    expect(byValue[1]!.sourceStart).toBeLessThan(byValue[2]!.sourceStart);
    expect(byValue[2]!.sourceStart).toBeLessThan(byValue[0]!.sourceStart);
    const byInput = build({
      link: { source: [0, 0, 0], target: [3, 1, 2], value: [1, 5, 3], sort: 'input' },
    }).calc.layout.ribbons;
    expect(byInput[0]!.sourceStart).toBeLessThan(byInput[1]!.sourceStart);
    // The group gap: twice the node gap by default, or as set.
    const grouped = { ...RING, padangle: 5, node: { ...RING.node, group: ['x', 'x', 'y', 'y'] } };
    expect(build(grouped).calc.layout.scale).toBeCloseTo((TAU - 30 * DEG) / 16, 12);
    expect(build({ ...grouped, groups: { padangle: 20 } }).calc.layout.scale).toBeCloseTo(
      (TAU - 50 * DEG) / 16,
      12,
    );
    expect(build({ ...grouped, sort: 'group' }).calc.layout.arcs.map((a) => a.node)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('leaves out what the legend hid: nodes by name, or groups', () => {
    const { calc } = build(RING, { hiddenlabels: ['B', 'nobody'] });
    expect(Array.from(calc.hidden)).toEqual([0, 1, 0, 0]);
    // B's links (A → B, B → C) have no ribbon; the links stay in the calc.
    expect(calc.links).toHaveLength(4);
    expect(calc.layout.ribbons.map((r) => r.link)).toEqual([2, 3]);
    expect(calc.layout.arcs.map((a) => a.node)).toEqual([0, 2, 3]);
    expect(calc.total).toBe(4);
    expect(calc.dropped).toBe(0);
    // A node without a label goes by its name.
    const unnamed = build(
      { link: { source: [0, 1], target: [1, 2] } },
      { hiddenlabels: ['Node 2'] },
    );
    expect(Array.from(unnamed.calc.hidden)).toEqual([0, 0, 1]);
    // With groups the legend lists groups: node names do not hide anything.
    const grouped = { ...RING, node: { ...RING.node, group: ['x', 'x', 'y', 'y'] } };
    const byGroup = build(grouped, { hiddenlabels: ['y', 'A'] }).calc;
    expect([...byGroup.hiddenGroups]).toEqual([1]);
    expect(Array.from(byGroup.hidden)).toEqual([0, 0, 1, 1]);
    expect(byGroup.layout.ribbons.map((r) => r.link)).toEqual([0]);
    expect(byGroup.layout.groups.map((g) => g.group)).toEqual([0]);
    expect(build(grouped).calc.hiddenGroups.size).toBe(0);
  });
});

describe('chord model', () => {
  it('centers the ring in the domain and ends the ribbons short of it', () => {
    const { model } = modelOf();
    expect([model.cx, model.cy]).toEqual([CX, CY]);
    expect(model.radii).toEqual({
      source: 136,
      target: 136,
      inner: 138,
      outer: 150,
      groupInner: 0,
      groupOuter: 0,
    });
    expect(model.orientation).toBe('none');
    expect(model.labels).toEqual([]);
    expect(model.nodes.map((n) => n.i)).toEqual([0, 1, 2, 3]);
    expect(Array.from(model.nodeAt)).toEqual([0, 1, 2, 3]);
    expect(model.ribbons.map((r) => r.k)).toEqual([0, 1, 2, 3]);
    expect(Array.from(model.ribbonAt)).toEqual([0, 1, 2, 3]);
    // The widest ribbon is drawn first, equal ones in link order.
    expect(model.order).toEqual([0, 2, 3, 1]);
    expect(model.arrow).toBe(0);
  });

  it('applies the sizes of the trace', () => {
    const { model } = modelOf({
      ...RING,
      node: { ...RING.node, thickness: 20 },
      link: { ...RING.link, gap: 0, targetgap: 6, arrowlen: 10 },
    });
    expect(model.radii).toMatchObject({ source: 130, target: 124, inner: 130, outer: 150 });
    expect(model.arrow).toBe(10);
    // The ends of ribbon A → B are on their radii: the source span, and the arrow's tip.
    const o = model.ribbons[0]!.outline;
    const radii = o.x.map((x, i) => Math.hypot(x - CX, o.y[i]! - CY));
    expect(Math.max(...radii)).toBeCloseTo(130, 9);
    expect(radii.filter((r) => Math.abs(r - 124) < 1e-9)).toHaveLength(1);
    // Undirected: no arrow, one gap.
    const flat = modelOf({ ...RING, directed: false, link: { ...RING.link, gap: 3 } }).model;
    expect(flat.radii).toMatchObject({ source: 135, target: 135 });
    expect(flat.arrow).toBe(0);
  });

  it('colors nodes from the colorway and ribbons from their source', () => {
    const layout = { colorway: ['#ff0000', '#00ff00', '#0000ff'] };
    const { model, calc, trace, fullLayout } = modelOf(RING, layout);
    expect(model.nodes.map((n) => n.css)).toEqual([
      'rgb(255, 0, 0)',
      'rgb(0, 255, 0)',
      'rgb(0, 0, 255)',
      'rgb(255, 0, 0)',
    ]);
    expect(model.ribbons.map((r) => r.colors)).toEqual([
      [[1, 0, 0, 0.6]],
      [[0, 1, 0, 0.6]],
      [[0, 0, 1, 0.6]],
      [[1, 0, 0, 0.6]],
    ]);
    expect(model.ribbons[0]!.hover).toEqual([[1, 0, 0, 0.6 + HOVER_ALPHA]]);
    expect(model.ribbons[0]!.css).toBe('rgba(255, 0, 0, 0.6)');
    expect(nodeColors(calc, trace, fullLayout)).toHaveLength(4);
    // Without a colorway there is still a color.
    expect(nodeColors(calc, trace, undefined)[0]).toHaveLength(4);
  });

  it('takes node.color, link.color, link.opacity and link.hovercolor', () => {
    const { model } = modelOf(
      {
        ...RING,
        node: {
          ...RING.node,
          color: ['#000', 'nope', '#fff'],
          line: { color: 'blue', width: [2, -1] },
        },
        link: {
          ...RING.link,
          color: ['rgba(0, 255, 0, 0.5)', '', 'bad'],
          hovercolor: ['#f00'],
          opacity: 0.5,
          colorsource: 'target',
          customdata: ['k0'],
        },
      },
      { colorway: ['#ff0000', '#00ff00'] },
    );
    expect(model.nodes.map((n) => n.css)).toEqual([
      'rgb(0, 0, 0)',
      'rgb(0, 255, 0)',
      'rgb(255, 255, 255)',
      'rgb(0, 255, 0)',
    ]);
    expect(model.nodes.map((n) => n.lineWidth)).toEqual([2, 0, 0, 0]);
    expect(model.nodes[0]!.lineColor).toEqual([0, 0, 1, 1]);
    const [own, fromTarget] = model.ribbons;
    // Its own color at half opacity; the others take their target's.
    expect(own!.colors).toEqual([[0, 1, 0, 0.25]]);
    expect(own!.hover).toEqual([[1, 0, 0, 1]]);
    expect(own!.customdata).toBe('k0');
    expect(fromTarget!.colors).toEqual([[1, 1, 1, 0.5]]);
    expect(fromTarget!.hover).toEqual([[1, 1, 1, 0.75]]);
    // One color for all nodes.
    const one = modelOf({ ...RING, node: { ...RING.node, color: '#00f' } }).model;
    expect(new Set(one.nodes.map((n) => n.css))).toEqual(new Set(['rgb(0, 0, 255)']));
  });

  it('cuts a gradient ribbon into strips from its source color to its target color', () => {
    const { model } = modelOf(
      {
        padangle: 0,
        textorientation: 'none',
        link: { source: [0, 0, 1], target: [1, 0, 2], value: [2, 1, 1], colorsource: 'gradient' },
        node: { color: ['#ff0000', '#0000ff', '#0000ff'] },
      },
      {},
    );
    const [mixed, self, same] = model.ribbons;
    expect(mixed!.parts).toHaveLength(GRADIENT_STRIPS);
    expect(mixed!.colors).toHaveLength(GRADIENT_STRIPS);
    const first = mixed!.colors[0]!;
    const last = mixed!.colors.at(-1)!;
    expect(first[0]).toBeGreaterThan(0.95);
    expect(first[2]).toBeLessThan(0.05);
    expect(last[0]).toBeLessThan(0.05);
    expect(last[2]).toBeGreaterThan(0.95);
    expect(mixed!.colors.every((c) => c[3] === 0.6)).toBe(true);
    expect(mixed!.hover.every((c) => c[3] === 0.6 + HOVER_ALPHA)).toBe(true);
    // A self-link, and a link between nodes of one color, stay one polygon.
    expect(self!.parts).toEqual([self!.outline]);
    expect(same!.parts).toEqual([same!.outline]);
    // An explicit link color wins over the gradient.
    const own = modelOf({
      ...RING,
      link: { ...RING.link, colorsource: 'gradient', color: '#123456' },
    }).model;
    expect(own.ribbons.every((r) => r.parts.length === 1)).toBe(true);
  });

  it('draws the group ring outside the node ring, in the groups’ colors', () => {
    const input = {
      ...RING,
      node: { ...RING.node, group: ['x', 'x', 'y', 'y'] },
      groups: { thickness: 10, gap: 5, textfont: { size: 10 } },
    };
    const { model, calc, trace, fullLayout } = modelOf(input, {
      colorway: ['#ff0000', '#00ff00', '#0000ff'],
    });
    const line = 12; // 10 px at line height 1.2
    expect(model.radii.groupOuter).toBeCloseTo(150 - line - 2 * TEXT_PAD, 9);
    expect(model.radii.groupInner).toBeCloseTo(model.radii.groupOuter - 10, 9);
    // No node labels: the node ring is the gap inside the group ring.
    expect(model.radii.outer).toBeCloseTo(model.radii.groupInner - 5, 9);
    expect(model.groups.map((g) => [g.g, g.name, g.css])).toEqual([
      [0, 'x', 'rgb(255, 0, 0)'],
      [1, 'y', 'rgb(0, 255, 0)'],
    ]);
    // Nodes take their group's color.
    expect(model.nodes.map((n) => n.css)).toEqual([
      'rgb(255, 0, 0)',
      'rgb(255, 0, 0)',
      'rgb(0, 255, 0)',
      'rgb(0, 255, 0)',
    ]);
    // The group labels, bold, across the radius outside the ring.
    expect(model.labels.map((l) => l.text)).toEqual(['x', 'y']);
    expect(model.labels.every((l) => l.anchor === 'center' && l.font.weight === 'bold')).toBe(true);
    expect(groupColors(calc, trace, fullLayout)).toHaveLength(2);
    // `groups.color`, and a node without a group takes a color after the groups'.
    const custom = modelOf(
      { ...input, node: { ...RING.node, group: ['x', 'x', '', 'y'] }, groups: { color: ['#000'] } },
      { colorway: ['#ff0000', '#00ff00', '#0000ff'] },
    ).model;
    expect(custom.groups.map((g) => g.css)).toEqual(['rgb(0, 0, 0)', 'rgb(0, 255, 0)']);
    expect(custom.nodes.find((n) => n.i === 2)!.css).toBe('rgb(0, 255, 0)');
    // Hidden: no ring, no room for it.
    const off = modelOf({ ...input, groups: { visible: false } }).model;
    expect(off.groups).toEqual([]);
    expect(off.radii).toMatchObject({ groupInner: 0, groupOuter: 0, outer: 150 });
  });

  it('writes the labels across the radius when they all fit, else along it', () => {
    const short = modelOf({ ...RING, textorientation: 'auto' }).model;
    expect(short.orientation).toBe('tangential');
    expect(short.labels.map((l) => l.text)).toEqual(['A', 'B', 'C', 'D']);
    expect(short.labels.every((l) => l.anchor === 'center')).toBe(true);
    const lineHeight = 12 * 1.2;
    expect(short.radii.outer).toBeCloseTo(150 - lineHeight - 2 * TEXT_PAD, 9);
    // One label too long for its arc turns them all.
    const long = modelOf({
      ...RING,
      textorientation: 'auto',
      node: { label: ['A', 'B', 'A label much longer than its arc could hold', 'D'] },
    }).model;
    expect(long.orientation).toBe('radial');
    expect(long.labels).toHaveLength(4);
    // On the right half anchored at their start, on the left half at their end.
    expect(long.labels.map((l) => l.anchor)).toEqual(['left', 'left', 'right', 'right']);
    // Radial labels take at most their share of the room; the long one is cut.
    const most = 150 * LABEL_SHARE - 2 * TEXT_PAD;
    expect(long.radii.outer).toBeCloseTo(150 - most - 2 * TEXT_PAD, 9);
    expect(long.labels.map((l) => l.maxWidth)).toEqual([undefined, undefined, most, undefined]);
    // Asked for, whatever fits.
    expect(modelOf({ ...RING, textorientation: 'radial' }).model.orientation).toBe('radial');
    expect(modelOf({ ...RING, textorientation: 'tangential' }).model.orientation).toBe(
      'tangential',
    );
    // Nothing to write: no room taken.
    const blank = modelOf({ ...RING, textorientation: 'auto', node: { label: [] } }).model;
    expect(blank.orientation).toBe('none');
    expect(blank.radii.outer).toBe(150);
  });

  it('leaves out the labels of arcs too short for them', () => {
    const { model } = modelOf({
      padangle: 0,
      textorientation: 'radial',
      node: { label: ['big', 'tiny', 'small', 'other'] },
      link: { source: [0, 1, 2], target: [3, 3, 3], value: [100, 1, 1] },
    });
    expect(model.labels.map((l) => l.text)).toEqual(['big', 'other']);
    // Rich text keeps its runs.
    const rich = modelOf({
      ...RING,
      textorientation: 'tangential',
      node: { label: ['<b>A</b>x', 'B', 'C', 'D'] },
    });
    expect(rich.model.labels[0]!.text).toBe('Ax');
    expect(rich.model.labels[0]!.runs).toBeDefined();
  });

  it('survives a domain too small for its rings', () => {
    const { calc, trace, fullLayout } = build({ ...RING, textorientation: 'radial' });
    const tiny = buildModel(calc, trace, fullLayout, { x: 0, y: 0, width: 10, height: 6 });
    expect(Object.values(tiny.radii).every((r) => r >= 0 && Number.isFinite(r))).toBe(true);
    const none = buildModel(calc, trace, fullLayout, { x: 0, y: 0, width: 0, height: 0 });
    expect(none.radii.outer).toBe(0);
    expect(none.ribbons.every((r) => r.outline.x.every(Number.isFinite))).toBe(true);
  });

  it('is cached per calc for the same trace and rect', () => {
    const { calc, trace, fullLayout } = build(RING);
    const a = modelFor(calc, trace, fullLayout, RECT);
    expect(modelFor(calc, trace, fullLayout, { ...RECT })).toBe(a);
    expect(modelFor(calc, trace, fullLayout, { ...RECT, width: 300 })).not.toBe(a);
    expect(modelFor(calc, { ...trace }, fullLayout, { ...RECT, width: 300 })).not.toBe(a);
  });

  it('finds the rect of the trace', () => {
    const viewport = { size: { width: 500, height: 300 } };
    expect(traceRect({ domain: { rect: RECT }, viewport })).toEqual(RECT);
    expect(traceRect({ plotArea: { x: 1, y: 2, width: -3, height: 4 }, viewport })).toEqual({
      x: 1,
      y: 2,
      width: 0,
      height: 4,
    });
    expect(traceRect({ viewport })).toEqual({ x: 0, y: 0, width: 500, height: 300 });
  });

  it('reads fonts with their defaults', () => {
    expect(fontOf({})).toEqual({
      font: { family: 'sans-serif', size: 12 },
      color: [0.27, 0.27, 0.27, 1],
    });
    expect(
      fontOf({
        family: 'Inter',
        size: 9,
        weight: 700,
        style: 'italic',
        shadow: 'auto',
        color: '#f00',
      }),
    ).toEqual({
      font: { family: 'Inter', size: 9, weight: 700, style: 'italic', shadow: 'auto' },
      color: [1, 0, 0, 1],
    });
    expect(fontOf({ size: -1, shadow: 'none', weight: 'heavy' }).font).toEqual({
      family: 'sans-serif',
      size: 12,
    });
  });
});

describe('chord hover', () => {
  /** A ring with a group ring: groups x (A, B) and y (C, D). */
  const GROUPED = { ...RING, node: { ...RING.node, group: ['x', 'x', 'y', 'y'] } };

  it('finds the node arc, the group arc or the ribbon under a point', () => {
    const { model } = modelOf();
    // Arcs: A 0–112.5°, B 112.5–202.5°, C 202.5–270°, D 270–360°.
    expect(hitTest(model, ...at(50, 144))).toEqual({ kind: 'node', i: 0 });
    expect(hitTest(model, ...at(200, 139))).toEqual({ kind: 'node', i: 1 });
    expect(hitTest(model, ...at(203, 149))).toEqual({ kind: 'node', i: 2 });
    expect(hitTest(model, ...at(359, 144))).toEqual({ kind: 'node', i: 3 });
    // Outside the ring, and in the gap between ring and ribbons.
    expect(hitTest(model, ...at(50, 151))).toBeUndefined();
    expect(hitTest(model, ...at(50, 137))).toBeUndefined();
    // Ribbon A → B leaves A between 45° and 112.5°.
    expect(hitTest(model, ...at(80, 130))).toEqual({ kind: 'link', i: 0 });
    expect(hitTest(model, ...at(20, 130))).toEqual({ kind: 'link', i: 3 });
    const r = model.ribbons[1]!;
    expect(hitTest(model, r.ax, r.ay)).toEqual({ kind: 'link', i: 1 });
    // The middle of this ring is between the ribbons.
    expect(hitTest(model, CX, CY)).toBeUndefined();
    const grouped = modelOf(GROUPED).model;
    const mid = (grouped.radii.groupInner + grouped.radii.groupOuter) / 2;
    expect(hitTest(grouped, ...at(100, mid))).toEqual({ kind: 'group', i: 0 });
    expect(hitTest(grouped, ...at(300, mid))).toEqual({ kind: 'group', i: 1 });
    expect(hitTest(grouped, ...at(100, grouped.radii.groupOuter + 3))).toBeUndefined();
  });

  it('puts the thinner ribbon on top where two overlap', () => {
    // Two links cross in the middle: 0 → 2 (wide) and 1 → 3 (thin).
    const { model } = modelOf({
      padangle: 0,
      textorientation: 'none',
      link: { source: [0, 1], target: [2, 3], value: [5, 1] },
    });
    expect(model.order).toEqual([0, 1]);
    const thin = model.ribbons[1]!;
    const wide = model.ribbons[0]!;
    expect(hitTest(model, thin.ax, thin.ay)).toEqual({ kind: 'link', i: 1 });
    expect(hitTest(model, wide.ax, wide.ay)?.kind).toBe('link');
  });

  it('highlights the ribbons of a node, of a group, or the one hovered', () => {
    const { model } = modelOf(GROUPED);
    expect(highlightOf(model, undefined)).toBeUndefined();
    expect([...highlightOf(model, { kind: 'link', i: 2 })!]).toEqual([2]);
    // A: A → B and D → A.
    expect([...highlightOf(model, { kind: 'node', i: 0 })!]).toEqual([0, 3]);
    // Group x (A, B): every ribbon with an end in it.
    expect([...highlightOf(model, { kind: 'group', i: 0 })!]).toEqual([0, 1, 3]);
    const skipped = modelOf({ ...GROUPED, node: { ...GROUPED.node, hoverinfo: 'skip' } }).model;
    expect(highlightOf(skipped, { kind: 'node', i: 0 })).toBeUndefined();
    expect(highlightOf(skipped, { kind: 'group', i: 0 })).toBeUndefined();
    expect(highlightOf(skipped, { kind: 'link', i: 0 })).toBeDefined();
  });

  it('labels a node with its flows and its share of the ring', () => {
    const { model, trace } = modelOf({ ...RING, valuesuffix: ' t' });
    const label = hoverLabel(model, { kind: 'node', i: 0 })!;
    expect(label).toMatchObject({
      kind: 'node',
      index: 0,
      text: 'A<br>Outgoing: 3 t<br>Incoming: 2 t<br>Share: 31.3%',
      extra: '5 t',
      color: model.nodes[0]!.css,
    });
    // Anchored on the middle of the arc's outer edge.
    const [x, y] = at(56.25, 150);
    expect(label.x).toBeCloseTo(x, 9);
    expect(label.y).toBeCloseTo(y, 9);
    expect(label.fields).toMatchObject({
      kind: 'node',
      pointNumber: 0,
      label: 'A',
      value: 5,
      out: 3,
      in: 2,
    });
    expect(label.fields['percent']).toBeCloseTo(5 / 16, 12);
    expect(nodeFields(model, 1)).toMatchObject({ pointNumber: 1, label: 'B', value: 4 });
    expect(partHoverinfo(trace, 'node')).toBe('all');
    // Undirected: no outgoing and incoming.
    const flat = modelOf({ ...RING, directed: false }).model;
    expect(hoverLabel(flat, { kind: 'node', i: 0 })!.text).toBe('A<br>Share: 31.3%');
  });

  it('labels a link with its ends, and a pair with both its flows', () => {
    const labelled = {
      ...RING,
      link: { ...RING.link, label: ['a to b'], customdata: [{ id: 7 }] },
    };
    const { model } = modelOf(labelled);
    const label = hoverLabel(model, { kind: 'link', i: 0 })!;
    expect(label).toMatchObject({
      kind: 'link',
      index: 0,
      text: 'a to b<br>A → B<br>Share of flow: 37.5%',
      extra: '3',
      x: model.ribbons[0]!.ax,
      y: model.ribbons[0]!.ay,
      color: 'rgb(31, 119, 180)',
    });
    expect(label.fields).toMatchObject({
      kind: 'link',
      pointNumber: 0,
      label: 'a to b',
      value: 3,
      customdata: { id: 7 },
      source: { kind: 'node', pointNumber: 0, label: 'A', value: 5 },
      target: { kind: 'node', pointNumber: 1, label: 'B', value: 4 },
    });
    expect(label.fields['reverse']).toBeUndefined();
    expect(linkFields(model, 1)).toMatchObject({ pointNumber: 1, label: '', value: 1 });
    expect(hoverLabel(model, { kind: 'link', i: 1 })!.text).toBe('B → C<br>Share of flow: 12.5%');
    // Undirected: a dash; a self-link: its node alone.
    const flat = modelOf({
      padangle: 0,
      directed: false,
      node: { label: ['A', 'B'] },
      link: { source: [0, 0], target: [1, 0], value: [3, 1] },
    }).model;
    expect(hoverLabel(flat, { kind: 'link', i: 0 })!.text).toBe('A — B<br>Share of flow: 75%');
    expect(hoverLabel(flat, { kind: 'link', i: 1 })!.text).toBe('A<br>Share of flow: 25%');
    // A pair of matrix cells: both directions, their sum in the box.
    const pair = modelOf({
      directed: false,
      matrix: [
        [0, 5],
        [3, 0],
      ],
      labels: ['A', 'B'],
    }).model;
    const both = hoverLabel(pair, { kind: 'link', i: 0 })!;
    expect(both.text).toBe('A → B: 5<br>B → A: 3<br>Share of flow: 100%');
    expect(both.extra).toBe('8');
    expect(both.index).toBe(1);
    expect(both.fields).toMatchObject({ value: 5, reverse: 3, percent: 1 });
    expect(both.labels).toMatchObject({ value: '5', reverse: '3' });
  });

  it('labels a group with its nodes and its share', () => {
    const { model } = modelOf(GROUPED);
    const label = hoverLabel(model, { kind: 'group', i: 1 })!;
    expect(label).toMatchObject({
      kind: 'group',
      index: 1,
      text: 'y<br>Nodes: 2<br>Share: 43.8%',
      extra: '7',
    });
    expect(groupFields(model, 0)).toMatchObject({
      kind: 'group',
      pointNumber: 0,
      label: 'x',
      value: 9,
      nodes: [0, 1],
    });
    // A node says its group.
    expect(nodeFields(model, 2)['group']).toBe('y');
    expect(nodeFields(modelOf().model, 2)['group']).toBeUndefined();
  });

  it('fills hovertemplates, and follows hoverinfo', () => {
    const { model } = modelOf({
      ...RING,
      valueformat: '.1f',
      node: {
        ...RING.node,
        hovertemplate: '%{label}: %{value} (%{percent}, out %{out}, in %{in})',
      },
      link: {
        ...RING.link,
        hovertemplate: '%{source.label} > %{target.label}: %{value}<extra>%{percent}</extra>',
      },
    });
    const node = hoverLabel(model, { kind: 'node', i: 1 })!;
    expect(node.text).toBe('B: 4.0 (25%, out 1.0, in 3.0)');
    expect(node.extra).toBe('4.0');
    const link = hoverLabel(model, { kind: 'link', i: 0 })!;
    expect(link.text).toBe('A > B: 3.0');
    expect(link.extra).toBe('37.5%');
    // `none`: the highlight and the event, without a label; `skip`: nothing.
    const quiet = modelOf({
      ...RING,
      node: { ...RING.node, hoverinfo: 'none' },
      link: { ...RING.link, hoverinfo: 'skip' },
    });
    expect(hoverLabel(quiet.model, { kind: 'node', i: 0 })).toMatchObject({
      text: '',
      extra: undefined,
    });
    expect(hoverLabel(quiet.model, { kind: 'link', i: 0 })).toBeUndefined();
    expect(partHoverinfo(quiet.trace, 'link')).toBe('skip');
    expect(partHoverinfo(build({ ...RING, hoverinfo: 'skip' }).trace, 'node')).toBe('skip');
  });

  it('formats values and shares', () => {
    const { trace } = build(RING);
    expect(valueLabel(trace, 1234.5)).toBe('1,235');
    expect(valueLabel({ ...trace, valueformat: '', valuesuffix: '%' }, 1.5)).toBe('1.5%');
    expect(
      valueLabel({ ...trace, valueformat: 5, valuesuffix: 5 } as unknown as FullTrace, 1.5),
    ).toBe('1.5');
    expect(percentLabel(0.125)).toBe('12.5%');
    expect(percentLabel(NaN)).toBe('0%');
  });

  it('answers the runtime with one point, bottom up', () => {
    const { calc, trace, fullLayout } = build(RING);
    const ctx = hoverCtx(fullLayout);
    const [cx, cy] = at(50, 144);
    const query = {
      px: cx,
      py: 340 - cy,
      xl: cx,
      yl: 340 - cy,
      mode: 'closest' as const,
      distance: 20,
      cx,
      cy,
    };
    const [point] = chordHoverPoints(calc, trace, query, ctx);
    expect(point).toMatchObject({
      pointIndex: 0,
      kind: 'node',
      distance: 0,
      extra: '5',
      showName: false,
      labels: { value: '5', percent: '31.3%' },
    });
    const [ax, ay] = at(56.25, 150);
    expect(point!.px).toBeCloseTo(ax, 9);
    expect(point!.py).toBeCloseTo(340 - ay, 9);
    expect(point!.hoverText).toContain('Outgoing: 3');
    // A link under the pointer; nothing in the middle.
    const model = hoverModel(calc, trace, ctx)!;
    const r = model.ribbons[2]!;
    const onLink = { ...query, cx: r.ax, cy: r.ay, py: 340 - r.ay };
    expect(chordHoverPoints(calc, trace, onLink, ctx)[0]).toMatchObject({
      kind: 'link',
      pointIndex: 2,
    });
    expect(chordHoverPoints(calc, trace, { ...query, cx: CX, cy: CY }, ctx)).toEqual([]);
    // No domain, no container position, or hover turned off: no points.
    expect(chordHoverPoints(calc, trace, query, { ...ctx, domain: undefined })).toEqual([]);
    expect(chordHoverPoints(calc, trace, { ...query, cx: undefined }, ctx)).toEqual([]);
    expect(chordHoverPoints(calc, { ...trace, hoverinfo: 'skip' }, query, ctx)).toEqual([]);
    expect(hoverModel(calc, trace, { ...ctx, domain: undefined })).toBeUndefined();
    // A label without a secondary box has no `extra`.
    const label = hoverLabel(model, { kind: 'node', i: 0 })!;
    expect(toHoverPoint({ ...label, extra: undefined }, 340)).not.toHaveProperty('extra');
  });
});

describe('chord legend and description', () => {
  it('lists the nodes that have links, or the groups', () => {
    const layout = { colorway: ['#ff0000', '#00ff00'], hiddenlabels: ['C'] };
    const { calc, trace, fullLayout } = build(
      { ...RING, node: { label: ['A', 'B', 'C', 'D', 'idle'] } },
      layout,
    );
    const items = chordLegendItems(calc, trace, { fullLayout });
    expect(items.map((i) => [i.key, i.name, i.hidden])).toEqual([
      ['A', 'A', false],
      ['B', 'B', false],
      ['C', 'C', true],
      ['D', 'D', false],
    ]);
    expect(items[1]!.glyph).toEqual({
      kind: 'bar',
      fill: { color: 'rgb(0, 255, 0)', lineWidth: 0 },
    });
    const grouped = build(
      { ...RING, node: { ...RING.node, group: ['x', 'x', 'y', 'y'] } },
      { ...layout, hiddenlabels: ['y'] },
    );
    const groups = chordLegendItems(grouped.calc, grouped.trace, {
      fullLayout: grouped.fullLayout,
    });
    expect(groups.map((i) => [i.key, i.hidden, i.glyph.fill?.color])).toEqual([
      ['x', false, 'rgb(255, 0, 0)'],
      ['y', true, 'rgb(0, 255, 0)'],
    ]);
    expect(chordLegendIcon(trace, { fullLayout }).fill?.color).toBe('rgb(255, 0, 0)');
    expect(chordLegendIcon(trace).fill?.color).toBe('#636efa');
    expect(chord.legendItems).toBe(chordLegendItems);
  });

  it('describes its nodes, links, total and largest flows', () => {
    const { calc, trace, fullLayout } = build({
      ...RING,
      name: 'Flows',
      link: { ...RING.link, label: ['a to b'] },
    });
    const d = chord.describe!({
      trace,
      calc,
      index: 0,
      fullLayout,
      xaxis: undefined,
      yaxis: undefined,
      maxRows: 3,
    })!;
    expect(d.kind).toBe('chord diagram');
    expect(d.summary).toBe(
      'Directed chord diagram "Flows": 4 nodes, 4 links, total flow 8. Largest: A → B (3); C → D (2); D → A (2).',
    );
    expect(d.table).toMatchObject({
      caption: 'Flows',
      columns: ['Source', 'Target', 'Value', 'Label'],
      rows: [
        ['A', 'B', '3', 'a to b'],
        ['B', 'C', '1', ''],
        ['C', 'D', '2', ''],
      ],
      total: 4,
    });
    expect(d.table!.row!(3)).toEqual(['D', 'A', '2', '']);
    expect(d.insight).toMatchObject({
      kind: 'shares',
      part: 'flow',
      length: 4,
      values: [3, 1, 2, 2],
      total: 8,
    });
    const insight = d.insight as { label(i: number): string; formatValue(v: number): string };
    expect(insight.label(1)).toBe('B → C');
    expect(insight.formatValue(2)).toBe('2');
  });

  it('describes groups, pairs, what was dropped and what the legend hid', () => {
    const describe = (input: Record<string, unknown>, layout = {}) => {
      const { calc, trace, fullLayout } = build(input, layout);
      return chord.describe!({
        trace,
        calc,
        index: 0,
        fullLayout,
        xaxis: undefined,
        yaxis: undefined,
        maxRows: 100,
      })!;
    };
    const grouped = describe({
      ...RING,
      directed: false,
      node: { ...RING.node, group: ['x', 'x', 'y', 'y'] },
      link: { source: [0, 1, 9], target: [1, 2, 0], value: [3, 1, 2] },
    });
    expect(grouped.summary).toBe(
      'Chord diagram "trace 0": 3 nodes, 2 links, 2 groups, total flow 4. Largest: A — B (3); B — C (1). 1 link left out: no valid ends or no positive value.',
    );
    // A pair's row has both directions together.
    const pair = describe({
      directed: false,
      matrix: [
        [0, 5],
        [3, 0],
      ],
      labels: ['A', 'B'],
    });
    // No link has a label: the table has no column for one, as the graph trace's has none.
    expect(pair.table!.columns).toEqual(['Source', 'Target', 'Value']);
    expect(pair.table!.rows).toEqual([['A', 'B', '8']]);
    // Hidden nodes and their links are not described.
    const hidden = describe(RING, { hiddenlabels: ['B'] });
    expect(hidden.summary).toContain('3 nodes, 2 links, total flow 4.');
    expect(hidden.table!.total).toBe(2);
    // Nothing drawn: no largest flows.
    expect(describe(RING, { hiddenlabels: ['A', 'B', 'C', 'D'] }).summary).toBe(
      'Directed chord diagram "trace 0": 0 nodes, 0 links, total flow 0.',
    );
  });
});

describe('chord keyboard stops', () => {
  async function stops(input: Record<string, unknown> = RING): Promise<KeyboardPoint[]> {
    const { calc, trace, fullLayout } = build(input);
    const parts = await chord.a11y!();
    const points = parts['chord']!.keyboardPoints!(calc as never, trace, hoverCtx(fullLayout));
    return Array.from({ length: points!.length }, (_, i) => points!.at(i)!);
  }

  it('visits the node arcs around the ring, then the ribbons', async () => {
    const all = await stops();
    expect(all.map((p) => [p.kind, p.pointIndex])).toEqual([
      ['node', 0],
      ['node', 1],
      ['node', 2],
      ['node', 3],
      ['link', 0],
      ['link', 1],
      ['link', 2],
      ['link', 3],
    ]);
    // A: ← wraps to D, → B, ↑ stays, ↓ its first ribbon (A → B), Home A, End D.
    expect(all[0]!.nav).toEqual([3, 1, 0, 4, 0, 3]);
    expect(all[3]!.nav).toEqual([2, 0, 3, 7, 0, 3]);
    // A → B: alone among A's ribbons; ↑ its source A, ↓ its target B.
    expect(all[4]!.nav).toEqual([4, 4, 0, 1, 4, 4]);
    expect(all[7]!.nav).toEqual([7, 7, 3, 0, 7, 7]);
    // Announced like the nodes and links of a graph: the place, then where ↓ leads.
    expect(all[0]!.say).toEqual([
      '{name}: {text}, node {n} of {count}. Down: {down}.',
      { n: '1', count: '4', down: 'A → B' },
    ]);
    expect(all[5]!.say).toEqual([
      '{name}: {text}, link {n} of {count} of {node}. Down: {down}.',
      { n: '1', count: '1', node: 'B', down: 'C' },
    ]);
    // The stops are the hover points: same anchors and text.
    expect(all[0]!.hoverText).toContain('Outgoing: 3');
    expect(all[0]!.py).toBeCloseTo(340 - at(56.25, 150)[1], 9);
  });

  it('moves between the ribbons of one source, and stays where there is nowhere to go', async () => {
    const all = await stops({
      padangle: 0,
      textorientation: 'none',
      link: { source: [0, 0, 1], target: [1, 2, 2], value: [1, 1, 1] },
    });
    // Three nodes, then 0 → 1, 0 → 2, 1 → 2.
    expect(all[3]!.nav).toEqual([4, 4, 0, 1, 3, 4]);
    expect(all[4]!.nav).toEqual([3, 3, 0, 2, 3, 4]);
    // Node 2 has no outgoing ribbon: ↓ stays, and nothing is said of it.
    expect(all[2]!.nav![3]).toBe(2);
    expect(all[2]!.say).toEqual(['{name}: {text}, node {n} of {count}.', { n: '3', count: '3' }]);
    // The second ribbon of node 0 (an undirected trace would name it with a dash).
    expect(all[4]!.say![1]).toEqual({ n: '2', count: '2', node: 'Node 0', down: 'Node 2' });
  });

  it('has no stops for a part with hoverinfo skip, and none without a domain', async () => {
    const all = await stops({ ...RING, link: { ...RING.link, hoverinfo: 'skip' } });
    expect(all.map((p) => p.kind)).toEqual(['node', 'node', 'node', 'node']);
    expect(all.every((p) => p.nav === undefined)).toBe(true);
    // A list: each says its place, and no arrow leads along a link.
    expect(all[1]!.say).toEqual(['{name}: {text}, node {n} of {count}.', { n: '2', count: '4' }]);
    const { calc, trace, fullLayout } = build(RING);
    const parts = await chord.a11y!();
    const ctx = { ...hoverCtx(fullLayout), domain: undefined, height: undefined };
    expect(parts['chord']!.keyboardPoints!(calc as never, trace, ctx)).toEqual([]);
  });
});

describe('chord view', () => {
  function plotCtx(input: Record<string, unknown> = RING) {
    const { trace, calc, fullLayout } = build(input);
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<ChordCalc> = {
      trace,
      calc,
      index: 0,
      fullLayout,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
      viewport: { size: { width: 500, height: 340 } } as Viewport,
      domain: { x: [0, 1], y: [0, 1], rect: RECT },
      primitives: { resources: createResourceManager(), invalidate: vi.fn() },
      add: (p) => {
        added.push(p as Primitive<unknown>);
        return p;
      },
      remove: (p) => {
        added.splice(added.indexOf(p as Primitive<unknown>), 1);
        p.dispose();
      },
      invalidate: vi.fn(),
    };
    return { ctx, added };
  }

  function pointer(
    type: ComponentPointerEvent['type'],
    x: number,
    y: number,
  ): ComponentPointerEvent {
    return {
      type,
      x,
      y,
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      native: undefined,
      cursor: undefined,
    };
  }

  const alphas = (colors: Float32Array): number[] =>
    Array.from(colors).filter((_, i) => i % 4 === 3);

  it('builds arc instances for the node ring and the group ring, y up', () => {
    const { model } = modelOf({
      ...RING,
      node: { ...RING.node, group: ['x', 'x', 'y', 'y'], line: { width: 1 } },
    });
    const data = arcData(model, 340) as Record<string, Float32Array | Float64Array>;
    expect(data['x']).toHaveLength(6);
    expect(Array.from(data['x']!)).toEqual(new Array(6).fill(CX));
    expect(Array.from(data['y']!)).toEqual(new Array(6).fill(340 - CY));
    expect(data['innerRadius']![0]).toBeCloseTo(model.radii.inner, 4);
    expect(data['outerRadius']![5]).toBeCloseTo(model.radii.groupOuter, 4);
    // 12 o'clock clockwise → the arc primitive's π/2 counterclockwise.
    expect(data['startAngle']![0]).toBeCloseTo(Math.PI / 2, 6);
    expect(data['endAngle']![0]).toBeCloseTo(Math.PI / 2 - model.nodes[0]!.arc.end, 6);
    expect(Array.from(data['borderWidth']!)).toEqual([1, 1, 1, 1, 0, 0]);
    expect(Array.from(data['fill']!.slice(16, 20))).toEqual(
      Array.from(Float32Array.from(model.groups[0]!.color)),
    );
  });

  it('builds one polygon per ribbon in drawing order, and dims around a highlight', () => {
    const { model } = modelOf();
    const data = ribbonData(model, 340, undefined);
    expect(data.rings).toHaveLength(4);
    expect(data.rings![0]).toBe(0);
    // Drawing order 0, 2, 3, 1: the second polygon is ribbon 2.
    expect(data.rings![1]).toBe(model.ribbons[0]!.outline.x.length);
    const second = model.ribbons[2]!.outline;
    expect(data.x[data.rings![1]!]).toBe(second.x[0]);
    expect(data.y[data.rings![1]!]).toBe(340 - second.y[0]!);
    expect(data.x).toHaveLength(model.ribbons.reduce((n, r) => n + r.outline.x.length, 0));
    expect(alphas(data.color as Float32Array)).toEqual(new Array(4).fill(Math.fround(0.6)));
    // Ribbon 2 lit: its hover color; the others dimmed.
    const lit = alphas(ribbonColors(model, new Set([2])));
    expect(lit[1]).toBeCloseTo(0.6 + HOVER_ALPHA, 6);
    for (const k of [0, 2, 3]) expect(lit[k]).toBeCloseTo(0.6 * DIM, 6);
    // An empty highlight dims everything.
    expect(alphas(ribbonColors(model, new Set()))[0]).toBeCloseTo(0.6 * DIM, 6);
    // A gradient ribbon is one polygon per strip.
    const gradient = modelOf({ ...RING, link: { ...RING.link, colorsource: 'gradient' } }).model;
    expect(ribbonData(gradient, 340, undefined).rings).toHaveLength(4 * GRADIENT_STRIPS);
  });

  it('turns the labels into text primitive labels, y up', () => {
    const { model } = modelOf({
      ...RING,
      textorientation: 'radial',
      node: { label: ['A', 'B', 'C with a label that is far too long for the ring', 'D'] },
    });
    const labels = textLabels(model, 340);
    expect(labels).toHaveLength(4);
    expect(labels[0]).toMatchObject({
      text: 'A',
      anchorX: 'left',
      anchorY: 'middle',
      lineHeight: 1.2,
    });
    expect(labels[0]!.y).toBeCloseTo(340 - model.labels[0]!.y, 9);
    expect(labels[0]!.angle).toBe(model.labels[0]!.angle);
    expect(labels[0]).not.toHaveProperty('maxWidth');
    expect(labels[2]).toMatchObject({ overflow: 'ellipsis', maxWidth: model.labels[2]!.maxWidth });
  });

  it('draws ribbons, arcs and labels, and recolors the ribbons on hover', async () => {
    const { ctx, added } = plotCtx({ ...RING, textorientation: 'auto' });
    const view = chord.plot!.create(ctx);
    expect(added.map((p) => p.constructor)).toEqual([
      LazyFillPrimitive,
      ArcPrimitive,
      TextPrimitive,
    ]);
    const orders = added.map((p) => p.object.renderOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    const fill = added[0] as LazyFillPrimitive;
    await fill.ready;
    const colors = (): number[] =>
      alphas((fill.fill as unknown as { data: { color: Float32Array } }).data.color);
    const base = colors();
    expect(base).toEqual(new Array(4).fill(Math.fround(0.6)));
    const model: ChordModel = modelFor(ctx.calc, ctx.trace, ctx.fullLayout, RECT);
    const mid = (model.radii.inner + model.radii.outer) / 2;
    // Hover arc A: its two ribbons (A → B, D → A) take their hover color, the others dim.
    expect(view.handlePointer!(pointer('move', ...at(50, mid)))).toBe(false);
    const lit = colors();
    // Drawing order 0, 2, 3, 1.
    expect(lit[0]).toBeCloseTo(0.6 + HOVER_ALPHA, 6);
    expect(lit[2]).toBeCloseTo(0.6 + HOVER_ALPHA, 6);
    expect(lit[1]).toBeCloseTo(0.6 * DIM, 6);
    expect(lit[3]).toBeCloseTo(0.6 * DIM, 6);
    expect(ctx.invalidate).toHaveBeenCalled();
    // The same arc again changes nothing; a ribbon highlights itself alone.
    const calls = vi.mocked(ctx.invalidate).mock.calls.length;
    view.handlePointer!(pointer('move', ...at(60, mid)));
    expect(vi.mocked(ctx.invalidate).mock.calls.length).toBe(calls);
    const r = model.ribbons[1]!;
    view.handlePointer!(pointer('move', r.ax, r.ay));
    expect(colors().map((a) => a > 0.5)).toEqual([false, false, false, true]);
    // Other events do not change the highlight; leaving clears it.
    expect(view.handlePointer!(pointer('down', r.ax, r.ay))).toBe(false);
    expect(colors().map((a) => a > 0.5)).toEqual([false, false, false, true]);
    view.handlePointer!(pointer('leave', 0, 0));
    expect(colors()).toEqual(base);
  });

  it('updates in place, and drops the fill when there is nothing to fill', async () => {
    const { ctx, added } = plotCtx();
    const view = chord.plot!.create(ctx);
    expect(added.map((p) => p.constructor)).toEqual([
      LazyFillPrimitive,
      ArcPrimitive,
      TextPrimitive,
    ]);
    const plan = {} as Parameters<typeof view.update>[1];
    // The same context again: same primitives, and a highlight it interrupts is taken back.
    const fill = added[0] as LazyFillPrimitive;
    await fill.ready;
    const colors = (): number[] =>
      alphas((fill.fill as unknown as { data: { color: Float32Array } }).data.color);
    const hovered = modelFor(ctx.calc, ctx.trace, ctx.fullLayout, RECT).ribbons[0]!;
    view.handlePointer!(pointer('move', hovered.ax, hovered.ay));
    expect(colors().some((a) => a < 0.5)).toBe(true);
    view.update(ctx, plan);
    expect(added).toHaveLength(3);
    expect(colors()).toEqual(new Array(4).fill(Math.fround(0.6)));
    // A new size and new labels.
    const labelled = build({ ...RING, textorientation: 'radial' });
    view.update(
      { ...ctx, ...labelled, viewport: { size: { width: 500, height: 400 } } as Viewport },
      plan,
    );
    expect(added).toHaveLength(3);
    // Everything hidden through the legend: no ribbons.
    const hidden = build(RING, { hiddenlabels: ['A', 'B', 'C', 'D'] });
    view.update({ ...ctx, ...hidden }, plan);
    expect(added.map((p) => p.constructor)).toEqual([ArcPrimitive, TextPrimitive]);
    // Hover without ribbons is harmless, and they come back.
    expect(view.handlePointer!(pointer('move', CX, CY))).toBe(false);
    view.update(ctx, plan);
    expect(added.some((p) => p instanceof LazyFillPrimitive)).toBe(true);
  });

  it('draws without a domain, in the plot area or the viewport', () => {
    const { ctx, added } = plotCtx();
    chord.plot!.create({ ...ctx, domain: undefined, plotArea: RECT });
    expect(added).toHaveLength(3);
  });
});

describe('chord module', () => {
  it('is a domain trace with a per-item legend', () => {
    expect(chord.type).toBe('chord');
    expect(chord.categories).toEqual(['domain', 'noOpacity', 'showLegend', 'pie-like']);
    expect(chord.layoutSchema).toHaveProperty('hiddenlabels');
    expect(registry.getTrace('chord')).toBe(chord);
  });
});
