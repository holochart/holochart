import { supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createResourceManager,
  LazyFillPrimitive,
  LinePrimitive,
  RectPrimitive,
  TextPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type ComponentPointerEvent,
  type HoverContext,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { hasCycle, type SankeyCalc } from './calc.ts';
import { defaultHoverColor, darkBackground } from './defaults.ts';
import { dragPositions, restylePayload, SankeyDrag, type SankeyDragHost } from './drag.ts';
import {
  eventPoint,
  highlightOf,
  hitTest,
  hoverLabels,
  sankeyHoverPoints,
  valueLabel,
} from './hover.ts';
import { sankey } from './index.ts';
import { buildModel, snapToColumns, type NodeOverrides, type SankeyModel } from './model.ts';
import { affectedLinks } from './plot.ts';
import type { SankeyNode } from './layout.ts';

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

const registry = createChartRegistry().register(sankey);

function build(input: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'sankey', ...input }], layout: { template: 'none', ...layout } },
    registry.core,
  );
  const trace = fullData[0] as FullTrace;
  const calc = sankey.calc!(trace, { fullLayout, index: 0, xaxis: undefined, yaxis: undefined });
  return { trace, calc, fullLayout };
}

const part = (trace: FullTrace, key: 'node' | 'link') => trace[key] as Record<string, unknown>;

/** A → C, B → C, C → D, C → E. */
const BASIC = {
  node: { label: ['A', 'B', 'C', 'D', 'E'] },
  link: { source: [0, 1, 2, 2], target: [2, 2, 3, 4], value: [4, 2, 5, 1] },
};
/** 400 × 200 px domain at (50, 20). */
const RECT = { x: 50, y: 20, width: 400, height: 200 };

function modelOf(input: Record<string, unknown> = BASIC, overrides?: NodeOverrides) {
  const b = build(input);
  return { ...b, model: buildModel(b.calc, b.trace, b.fullLayout, RECT, overrides) };
}

const center = (m: SankeyModel, i: number): [number, number] => {
  const n = m.nodes[i]!;
  return [(n.x0 + n.x1) / 2, (n.y0 + n.y1) / 2];
};

function pointer(type: ComponentPointerEvent['type'], x: number, y: number): ComponentPointerEvent {
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

describe('sankey defaults', () => {
  it('follows Plotly: node colors from the colorway at 0.8, pad 20, thickness 20, snap', () => {
    const { trace } = build(BASIC, { colorway: ['#ff0000', '#00ff00'] });
    const node = part(trace, 'node');
    expect(node['color']).toEqual([
      'rgba(255, 0, 0, 0.8)',
      'rgba(0, 255, 0, 0.8)',
      'rgba(255, 0, 0, 0.8)',
      'rgba(0, 255, 0, 0.8)',
      'rgba(255, 0, 0, 0.8)',
    ]);
    expect(node['pad']).toBe(20);
    expect(node['thickness']).toBe(20);
    expect(node['align']).toBe('justify');
    expect(node['line']).toEqual({ color: 'rgb(68, 68, 68)', width: 0.5 });
    expect(trace['arrangement']).toBe('snap');
    expect(trace['orientation']).toBe('h');
    expect(trace['valueformat']).toBe('.3s');
    expect(part(trace, 'link')['line']).toEqual({ color: 'rgb(68, 68, 68)', width: 0 });
    expect(part(trace, 'link')['arrowlen']).toBe(0);
  });

  it('colors every node, group nodes and nodes without labels included', () => {
    const { trace } = build({
      node: { label: ['A'], groups: [[1, 2]] },
      link: { source: [0, 0], target: [1, 2], value: [1, 1] },
    });
    expect((part(trace, 'node')['color'] as unknown[]).length).toBe(4);
  });

  it('picks translucent black or white links from the paper, and derives hover colors', () => {
    expect(part(build(BASIC).trace, 'link')['color']).toBe('rgba(0, 0, 0, 0.2)');
    expect(part(build(BASIC).trace, 'link')['hovercolor']).toBe('rgba(0, 0, 0, 0.4)');
    const dark = build(BASIC, { paper_bgcolor: '#111' }).trace;
    expect(part(dark, 'link')['color']).toBe('rgba(255, 255, 255, 0.6)');
    expect(part(dark, 'link')['hovercolor']).toBe('rgba(255, 255, 255, 0.8)');
    expect(darkBackground('#111')).toBe(true);
    expect(darkBackground('#fff')).toBe(false);
    // Opaque colors brighten on dark paper and darken (HSL lightness − 10 %) on light paper.
    expect(defaultHoverColor('#808080', true)).toBe('rgb(154, 154, 154)');
    expect(defaultHoverColor('#808080', false)).toBe('rgb(103, 103, 103)');
    const arrays = build({
      ...BASIC,
      link: { ...BASIC.link, color: ['red', 'rgba(0,0,255,0.5)'] },
    });
    expect(part(arrays.trace, 'link')['hovercolor']).toEqual([
      'rgb(204, 0, 0)',
      'rgba(0, 0, 255, 0.7)',
    ]);
  });

  it('defaults node/link hoverinfo from the trace and arrangement from fixed positions', () => {
    const { trace } = build({ ...BASIC, hoverinfo: 'none' });
    expect(part(trace, 'node')['hoverinfo']).toBe('none');
    expect(part(trace, 'link')['hoverinfo']).toBe('none');
    const fixed = build({ ...BASIC, node: { ...BASIC.node, x: [0.1], y: [0.2] } }).trace;
    expect(fixed['arrangement']).toBe('freeform');
    const kept = build({
      ...BASIC,
      arrangement: 'fixed',
      node: { ...BASIC.node, x: [0.1], y: [0.2] },
    });
    expect(kept.trace['arrangement']).toBe('fixed');
  });

  it('takes the text font from the layout with the automatic halo', () => {
    const { trace } = build(BASIC, { font: { size: 15, color: '#123456' } });
    expect(trace['textfont']).toMatchObject({ size: 15, color: 'rgb(18, 52, 86)', shadow: 'auto' });
  });

  it('coerces the concentration colorscales item by item', () => {
    const { trace } = build({
      ...BASIC,
      link: { ...BASIC.link, colorscales: [{ label: 'x', cmax: 0.5 }, {}] },
    });
    const scales = part(trace, 'link')['colorscales'] as Record<string, unknown>[];
    expect(scales).toHaveLength(2);
    expect(scales[0]).toMatchObject({ label: 'x', cmin: 0, cmax: 0.5 });
    expect(scales[1]).toMatchObject({ label: '', cmin: 0, cmax: 1 });
    expect(scales[1]!['colorscale']).toEqual([
      [0, 'rgb(255, 255, 255)'],
      [1, 'rgb(0, 0, 0)'],
    ]);
  });
});

describe('sankey calc', () => {
  it('keeps positive links between valid nodes and the nodes they touch', () => {
    const { calc } = build({
      node: { label: ['A', 'B', 'C', 'D', 'E', 'F'] },
      link: {
        source: [0, 1, 2, 0, '3', 1.5, 0],
        target: [1, 2, 5, 5, '4', 2, -1],
        value: [1, 2, 0, -3, 2, 1, 1],
      },
    });
    expect(calc.links.map((l) => l.index)).toEqual([0, 1, 4]);
    expect(calc.nodes.map((n) => n.label)).toEqual(['A', 'B', 'C', 'D', 'E']);
    // Node F (index 5) is only named by dropped links.
    expect(calc.nodeCount).toBe(6);
    expect(calc.circular).toBe(false);
  });

  it('merges groups: links attach to the group, links inside a group are dropped', () => {
    const { calc } = build({
      node: { label: ['A', 'B', 'C', 'D', 'BC'], groups: [[1, 2]] },
      link: { source: [0, 0, 1, 2], target: [1, 2, 2, 3], value: [3, 1, 5, 2] },
    });
    expect(calc.nodes.map((n) => [n.index, n.label, n.group])).toEqual([
      [0, 'A', false],
      [3, 'D', false],
      [4, 'BC', true],
    ]);
    expect(calc.nodes[2]!.children).toEqual([1, 2]);
    expect(calc.links.map((l) => [l.index, l.source, l.target])).toEqual([
      [0, 0, 2],
      [1, 0, 2],
      [3, 2, 1],
    ]);
    // Without a label of its own a group reads its members' labels.
    const unnamed = build({
      node: { label: ['A', 'B', 'C', 'D'], groups: [[1, 2]] },
      link: { source: [0, 0, 2], target: [1, 2, 3], value: [3, 1, 2] },
    });
    expect(unnamed.calc.nodes.find((n) => n.group)!.label).toBe('B, C');
  });

  it('computes flows and concentrations of links between the same nodes', () => {
    const { calc } = build({
      link: {
        source: [0, 0, 0, 0],
        target: [1, 1, 1, 2],
        value: [2, 3, 5, 4],
        label: ['a', 'b', 'a', 'a'],
        colorscales: [{ label: 'a' }],
      },
    });
    expect(calc.links.map((l) => l.flow)).toEqual([
      { value: 10, links: [0, 1, 2] },
      { value: 10, links: [0, 1, 2] },
      { value: 10, links: [0, 1, 2] },
      { value: 4, links: [3] },
    ]);
    expect(calc.links.map((l) => l.concentration)).toEqual([0.2, 0.3, 0.5, 1]);
    expect(calc.links.map((l) => l.labelConcentration)).toEqual([0.7, 0.3, 0.7, 1]);
    expect(calc.links.map((l) => l.colorscale)).toEqual([0, -1, 0, 0]);
  });

  it('detects cycles (self links and larger strongly connected components)', () => {
    expect(
      hasCycle(3, [
        { source: 0, target: 1 },
        { source: 1, target: 2 },
      ]),
    ).toBe(false);
    expect(hasCycle(1, [{ source: 0, target: 0 }])).toBe(true);
    expect(
      hasCycle(3, [
        { source: 0, target: 1 },
        { source: 1, target: 2 },
        { source: 2, target: 1 },
      ]),
    ).toBe(true);
  });

  it('carries the layout inputs and fixed positions (zero counts as unset, as Plotly)', () => {
    const { calc } = build({
      ...BASIC,
      orientation: 'v',
      node: { ...BASIC.node, x: [0.1, 0, 0.5], y: [0.2, 0.3, 0.6], pad: 5, align: 'left' },
      link: { ...BASIC.link, arrowlen: 7 },
    });
    expect(calc.nodes.map((n) => n.fixed)).toEqual([
      [0.1, 0.2],
      undefined,
      [0.5, 0.6],
      undefined,
      undefined,
    ]);
    expect(calc).toMatchObject({
      horizontal: false,
      pad: 5,
      thickness: 20,
      align: 'left',
      arrangement: 'freeform',
      arrowlen: 7,
    });
  });
});

describe('sankey model', () => {
  it('lays the graph out in the domain, labels on the right but in the last column', () => {
    const { model } = modelOf();
    expect(model.nodes.map((n) => [n.x0, n.x1])).toEqual([
      [50, 70],
      [50, 70],
      [240, 260],
      [430, 450],
      [430, 450],
    ]);
    for (const n of model.nodes) {
      expect(n.y0).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(n.y1).toBeLessThanOrEqual(220 + 1e-9);
    }
    expect(model.nodes.map((n) => n.labelLeft)).toEqual([false, false, false, true, true]);
    expect(model.links).toHaveLength(4);
    // Ribbons start at their source's right side and end at their target's left side.
    const [x0, , x1] = model.links[0]!.bounds;
    expect(x0).toBeCloseTo(70, 9);
    expect(x1).toBeCloseTo(240, 9);
  });

  it('transposes a vertical sankey', () => {
    const h = modelOf().model;
    const v = modelOf({ ...BASIC, orientation: 'v' }).model;
    expect(v.horizontal).toBe(false);
    expect([v.along, v.across]).toEqual([200, 400]);
    // Layers run down the domain: node thickness is now vertical.
    for (const n of v.nodes) expect(n.y1 - n.y0).toBeCloseTo(20, 9);
    expect(v.nodes[0]!.y0).toBe(20);
    expect(v.nodes[3]!.y1).toBe(220);
    expect(v.nodes.every((n) => !n.labelLeft)).toBe(true);
    expect(h.nodes[0]!.x1 - h.nodes[0]!.x0).toBe(20);
  });

  it('places fixed nodes by their center, and snaps them into columns', () => {
    const fixed = {
      ...BASIC,
      arrangement: 'freeform',
      node: { ...BASIC.node, x: [0.5, 0.52, 0.9, 0.9, 0.9], y: [0.25, 0.3, 0.5, 0.2, 0.8] },
    };
    const free = modelOf(fixed).model;
    expect(center(free, 0)).toEqual([50 + 200, 20 + 50]);
    expect(center(free, 1)[0]).toBeCloseTo(50 + 208, 9);
    const snapped = modelOf({ ...fixed, arrangement: 'snap' }).model;
    // A and B overlap in x: B joins A's column, and their overlap is resolved.
    expect(snapped.nodes[1]!.x0).toBe(snapped.nodes[0]!.x0);
    expect(snapped.nodes[1]!.y0).toBeGreaterThanOrEqual(snapped.nodes[0]!.y1 - 1e-9);
  });

  it('snaps overlapping x ranges into one column', () => {
    const nodes = [0, 12, 60].map(
      (x0, index) => ({ index, x0, x1: x0 + 20 }) as unknown as SankeyNode,
    );
    expect(snapToColumns(nodes, 20).map((c) => c.map((n) => n.index))).toEqual([[0, 1], [2]]);
    expect(nodes.map((n) => n.x0)).toEqual([0, 0, 60]);
  });

  it('colors links by concentration, other links by link.color', () => {
    const { model } = modelOf({
      node: { label: ['A', 'B'] },
      link: {
        source: [0, 0],
        target: [1, 1],
        value: [1, 3],
        label: ['x', 'y'],
        color: 'rgba(0, 0, 255, 0.5)',
        colorscales: [
          {
            label: 'x',
            colorscale: [
              [0, '#000000'],
              [1, '#ffffff'],
            ],
          },
        ],
      },
    });
    const [x, y] = model.links;
    expect(x!.scaled).toBe(true);
    expect(x!.color[0]).toBeCloseTo(0.25, 2);
    expect(x!.hover).toEqual(x!.color);
    expect(y!.scaled).toBe(false);
    expect(y!.color).toEqual([0, 0, 1, 0.5]);
  });

  it('reuses ribbons of unchanged links when rebuilt', () => {
    const { calc, trace, fullLayout, model } = modelOf();
    const again = buildModel(calc, trace, fullLayout, RECT, undefined, model);
    again.links.forEach((l, k) => expect(l.outline).toBe(model.links[k]!.outline));
  });
});

describe('sankey hover', () => {
  function query(model: SankeyModel, x: number, y: number) {
    return {
      px: x,
      py: 300 - y,
      xl: x,
      yl: 300 - y,
      cx: x,
      cy: y,
      mode: 'closest' as const,
      distance: 20,
    };
  }
  function hoverCtx(fullLayout: Record<string, unknown>): HoverContext {
    return {
      fullLayout: fullLayout as HoverContext['fullLayout'],
      xaxis: undefined,
      yaxis: undefined,
      transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
      domain: { x: [0, 1], y: [0, 1], rect: RECT },
    };
  }

  it('hits nodes (with Plotly’s wider zone) before links', () => {
    const { model } = modelOf();
    const [cx, cy] = center(model, 2);
    expect(hitTest(model, cx, cy)).toEqual({ kind: 'node', i: 2 });
    // 8 px right of the node, over its outgoing links: still the node.
    expect(hitTest(model, model.nodes[2]!.x1 + 8, cy)).toEqual({ kind: 'node', i: 2 });
    const link = model.links[0]!;
    expect(hitTest(model, link.ax, link.ay)).toEqual({ kind: 'link', i: 0 });
    expect(hitTest(model, 5, 5)).toBeUndefined();
  });

  it('labels nodes and links like Plotly, the value in the secondary box', () => {
    const { model } = modelOf({ ...BASIC, valuesuffix: ' t' });
    const [node] = hoverLabels(model, { kind: 'node', i: 2 }, 'closest');
    expect(node).toMatchObject({
      kind: 'node',
      index: 2,
      text: 'C<br>Incoming flow count: 2<br>Outgoing flow count: 2',
      extra: '6.00 t',
    });
    const [link] = hoverLabels(model, { kind: 'link', i: 2 }, 'closest');
    expect(link).toMatchObject({
      kind: 'link',
      index: 2,
      text: 'Source: C<br>Target: D',
      extra: '5.00 t',
    });
    expect(link!.fields['source']).toMatchObject({ label: 'C', pointNumber: 2, value: 6 });
    expect(link!.fields['target']).toMatchObject({ label: 'D', pointNumber: 3, value: 5 });
    expect(valueLabel(model.trace, 1234)).toBe('1.23k t');
  });

  it('fills node and link hovertemplates, with %{value} formatted', () => {
    const { model } = modelOf({
      ...BASIC,
      valueformat: '.1f',
      node: { ...BASIC.node, hovertemplate: '%{label}: %{value} (%{targetLinks.length} in)' },
      link: {
        ...BASIC.link,
        hovertemplate: '%{source.label} → %{target.label}: %{value:.2f}<extra>flow</extra>',
      },
    });
    expect(hoverLabels(model, { kind: 'node', i: 2 }, 'closest')[0]).toMatchObject({
      text: 'C: 6.0 (2 in)',
      extra: '6.0',
    });
    expect(hoverLabels(model, { kind: 'link', i: 3 }, 'closest')[0]).toMatchObject({
      text: 'C → E: 1.00',
      extra: 'flow',
    });
  });

  it('shows the concentration of colorscaled links, and every flow link outside closest mode', () => {
    const { model } = modelOf({
      link: {
        source: [0, 0],
        target: [1, 1],
        value: [1, 3],
        label: ['x', 'y'],
        colorscales: [{ label: 'x' }],
      },
    });
    expect(hoverLabels(model, { kind: 'link', i: 0 }, 'closest')[0]!.text).toContain(
      'Concentration: 25.00%',
    );
    expect(hoverLabels(model, { kind: 'link', i: 0 }, 'x')).toHaveLength(2);
  });

  it('honors node/link hoverinfo: none keeps the highlight, skip drops hover', () => {
    const none = modelOf({ ...BASIC, node: { ...BASIC.node, hoverinfo: 'none' } }).model;
    expect(hoverLabels(none, { kind: 'node', i: 2 }, 'closest')[0]!.text).toBe('');
    expect(highlightOf(none, { kind: 'node', i: 2 }).size).toBe(4);
    const skip = modelOf({ ...BASIC, link: { ...BASIC.link, hoverinfo: 'skip' } }).model;
    expect(hoverLabels(skip, { kind: 'link', i: 0 }, 'closest')).toEqual([]);
    expect(highlightOf(skip, { kind: 'link', i: 0 }).size).toBe(0);
  });

  it('highlights a node’s links, a link, and the links sharing their labels', () => {
    const { model } = modelOf({
      ...BASIC,
      link: { ...BASIC.link, label: ['p', '', '', 'p'] },
    });
    expect([...highlightOf(model, { kind: 'node', i: 3 })].sort()).toEqual([2]);
    expect([...highlightOf(model, { kind: 'link', i: 0 })].sort()).toEqual([0, 3]);
    expect([...highlightOf(model, { kind: 'node', i: 0 })].sort()).toEqual([0, 3]);
    expect(highlightOf(model, undefined).size).toBe(0);
  });

  it('reports hover points in figure px with kinds, values and fields', () => {
    const { calc, trace, fullLayout, model } = modelOf();
    const [cx, cy] = center(model, 2);
    const points = sankeyHoverPoints(calc, trace, query(model, cx, cy), hoverCtx(fullLayout));
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      pointIndex: 2,
      kind: 'node',
      distance: 0,
      extra: '6.00',
      labels: { value: '6.00' },
      showName: false,
    });
    expect(points[0]!.fields).toMatchObject({ label: 'C', value: 6, sourceLinks: [2, 3] });
    const skipped = build({ ...BASIC, hoverinfo: 'skip' });
    expect(
      sankeyHoverPoints(skipped.calc, skipped.trace, query(model, cx, cy), hoverCtx(fullLayout)),
    ).toEqual([]);
  });

  it('builds click points like the runtime', () => {
    const { model } = modelOf();
    const p = eventPoint(model, { kind: 'node', i: 1 }, 3, { type: 'sankey' });
    expect(p).toMatchObject({
      curveNumber: 3,
      pointNumber: 1,
      pointIndex: 1,
      label: 'B',
      value: 2,
    });
    expect(p.data).toEqual({ type: 'sankey' });
    expect(JSON.parse(JSON.stringify({ ...p, fullData: undefined }))).toMatchObject({ label: 'B' });
  });
});

describe('sankey drag', () => {
  it('moves across the flow only with perpendicular, clamped to the domain', () => {
    const { model } = modelOf({ ...BASIC, arrangement: 'perpendicular' });
    const g = model.graph;
    const n = g.nodes[2]!;
    const h = n.y1 - n.y0;
    const p = dragPositions(g, 2, 999, 30, 'perpendicular');
    expect(p.get(2)).toEqual({ x0: n.x0, y0: 30 - h / 2 });
    expect(p.get(2)!.y0 + h / 2).toBe(30);
    expect(dragPositions(g, 2, 0, 1e6, 'perpendicular').get(2)!.y0).toBe(200 - h);
    expect(dragPositions(g, 2, 0, 50, 'fixed').get(2)).toEqual({ x0: n.x0, y0: n.y0 });
  });

  it('moves anywhere with freeform', () => {
    const { model } = modelOf();
    const n = model.graph.nodes[2]!;
    expect(dragPositions(model.graph, 2, 100, 60, 'freeform').get(2)).toEqual({
      x0: 90,
      y0: 60 - (n.y1 - n.y0) / 2,
    });
  });

  it('snaps: the column makes room, the node returns to its column on release', () => {
    const { model } = modelOf();
    const g = model.graph;
    const [a, b] = [g.nodes[0]!, g.nodes[1]!];
    const target = (b.y0 + b.y1) / 2;
    const moving = dragPositions(g, 0, 300, target, 'snap');
    expect(moving.get(0)!.x0).toBe(290);
    const released = dragPositions(g, 0, 300, target, 'snap', true);
    expect(released.get(0)!.x0).toBe(a.x0);
    // B is pushed out of the way, keeping the padding, inside the domain.
    const a0 = released.get(0)!.y0;
    const b0 = released.get(1)!.y0;
    const ha = a.y1 - a.y0;
    const hb = b.y1 - b.y0;
    const gap = b0 >= a0 ? b0 - (a0 + ha) : a0 - (b0 + hb);
    expect(gap).toBeGreaterThanOrEqual(g.padding - 1e-9);
    expect(b0).toBeGreaterThanOrEqual(0);
    expect(b0 + hb).toBeLessThanOrEqual(200 + 1e-9);
  });

  it('restyles node.x / node.y with node centers as fractions of the domain', () => {
    const { model } = modelOf({ ...BASIC, node: { ...BASIC.node, x: [0, 0, 0, 0, 0, 0, 0.3] } });
    const positions = dragPositions(model.graph, 2, 100, 50, 'freeform');
    const update = restylePayload(model, positions);
    const xs = (update['node.x'] as number[][])[0]!;
    const ys = (update['node.y'] as number[][])[0]!;
    expect(xs).toHaveLength(7);
    expect(xs[2]).toBeCloseTo(100 / 400, 9);
    expect(ys[2]).toBeCloseTo(50 / 200, 9);
    expect(xs[6]).toBe(0.3);
    expect(xs[0]).toBeCloseTo(10 / 400, 9);
  });

  function setup(input: Record<string, unknown> = BASIC) {
    let { model } = modelOf(input);
    const host = {
      model: () => model,
      begin: vi.fn(),
      show: vi.fn((o: NodeOverrides | undefined) => {
        model = buildModel(model.calc, model.trace, undefined, RECT, o, model);
      }),
      drop: vi.fn(),
      click: vi.fn(),
    } satisfies SankeyDragHost;
    return { host, drag: new SankeyDrag(host), model: () => model };
  }

  it('drags a pressed node once past the click tolerance, then restyles on release', () => {
    const { host, drag, model } = setup();
    const [cx, cy] = center(model(), 2);
    expect(drag.handle(pointer('move', cx, cy))).toBe(false);
    expect(drag.handle(pointer('down', cx, cy))).toBe(true);
    expect(drag.handle(pointer('move', cx, cy + 2))).toBe(true);
    expect(host.show).not.toHaveBeenCalled();
    const move = pointer('move', cx + 30, cy + 20);
    expect(drag.handle(move)).toBe(true);
    expect(host.begin).toHaveBeenCalledWith(2);
    expect(move.cursor).toBe('move');
    expect(model().overrides?.get(2)?.y0).toBeCloseTo(model().base.nodes[2]!.y0 + 20, 6);
    expect(drag.handle(pointer('up', cx + 30, cy + 20))).toBe(true);
    expect(drag.active).toBe(false);
    const [positions, update] = host.drop.mock.calls[0]!;
    // Snap: back in its column on release.
    expect(positions.get(2)!.x0).toBe(model().base.nodes[2]!.x0);
    expect(Object.keys(update)).toEqual(['node.x', 'node.y']);
  });

  it('clicks on a press without a move, and cancels a drag on leave', () => {
    const { host, drag, model } = setup();
    const [cx, cy] = center(model(), 1);
    drag.handle(pointer('down', cx, cy));
    drag.handle(pointer('up', cx, cy));
    expect(host.click).toHaveBeenCalledWith({ kind: 'node', i: 1 }, expect.anything());
    drag.handle(pointer('down', cx, cy));
    drag.handle(pointer('move', cx, cy + 40));
    drag.handle(pointer('leave', cx, cy + 40));
    expect(host.show).toHaveBeenLastCalledWith(undefined);
    expect(host.drop).not.toHaveBeenCalled();
  });

  it('ignores presses off nodes and with arrangement fixed', () => {
    const { drag } = setup();
    expect(drag.handle(pointer('down', 5, 5))).toBe(false);
    const fixed = setup({ ...BASIC, arrangement: 'fixed' });
    const [cx, cy] = center(fixed.model(), 1);
    expect(fixed.drag.handle(pointer('down', cx, cy))).toBe(false);
  });

  it('knows which links a drag can change', () => {
    const { model } = modelOf();
    // Moving A changes A → C, and the other links at C.
    expect([...affectedLinks(model, new Set([0]))].sort()).toEqual([0, 1, 2, 3]);
    expect([...affectedLinks(model, new Set([3]))].sort()).toEqual([0, 1, 2, 3]);
    const chain = modelOf({ link: { source: [0, 1, 2], target: [1, 2, 3], value: [1, 1, 1] } });
    expect([...affectedLinks(chain.model, new Set([3]))].sort()).toEqual([1, 2]);
  });
});

describe('sankey view and description', () => {
  function plotCtx(input: Record<string, unknown> = BASIC) {
    const { trace, calc, fullLayout } = build(input);
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<SankeyCalc> = {
      trace,
      calc,
      index: 0,
      fullLayout,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
      viewport: { size: { width: 500, height: 300 } } as Viewport,
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

  it('draws links, nodes and labels, and recolors links on hover', async () => {
    const { ctx, added } = plotCtx();
    const view = sankey.plot!.create(ctx);
    expect(added.map((p) => p.constructor)).toEqual([
      LazyFillPrimitive,
      RectPrimitive,
      TextPrimitive,
    ]);
    const orders = added.map((p) => p.object.renderOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    const fill = added[0] as LazyFillPrimitive;
    await fill.ready;
    const colors = (): number[] =>
      Array.from((fill.fill as unknown as { data: { color: Float32Array } }).data.color);
    const base = colors();
    // Hover node C: its four links take the hover color (alpha 0.2 → 0.4).
    const model = buildModel(ctx.calc, ctx.trace, ctx.fullLayout, RECT);
    const [cx, cy] = center(model, 2);
    expect(view.handlePointer!(pointer('move', cx, cy))).toBe(false);
    const lit = colors();
    expect(lit.filter((_, i) => i % 4 === 3)).toEqual(
      [0.4, 0.4, 0.4, 0.4].map((v) => Math.fround(v)),
    );
    view.handlePointer!(pointer('leave', 0, 0));
    expect(colors()).toEqual(base);
    // A press on a node is a drag; moving it splits the moved links into their own fill.
    expect(view.handlePointer!(pointer('down', cx, cy))).toBe(true);
    view.handlePointer!(pointer('move', cx, cy + 40));
    expect(added.filter((p) => p instanceof LazyFillPrimitive)).toHaveLength(2);
    view.handlePointer!(pointer('leave', cx, cy + 40));
    expect(added.filter((p) => p instanceof LazyFillPrimitive)).toHaveLength(1);
  });

  it('draws flow particles with link.flow only, dimmed outside the hover highlight', async () => {
    const { ctx, added } = plotCtx({ ...BASIC, link: { ...BASIC.link, flow: {} } });
    const view = sankey.plot!.create(ctx);
    expect(added).toHaveLength(4);
    const flow = added[1]!;
    // Above the ribbons, below the nodes.
    expect(flow.object.renderOrder).toBeGreaterThan(added[0]!.object.renderOrder);
    expect(flow.object.renderOrder).toBeLessThan(added[2]!.object.renderOrder);
    await (flow as { ready?: Promise<void> }).ready;
    const mesh = flow.object as Mesh;
    expect(mesh.visible).toBe(true);
    const alphas = (): Set<number> => {
      const c = mesh.geometry.getAttribute('iColor').array as Float32Array;
      const n = (mesh.geometry as { instanceCount?: number }).instanceCount ?? 0;
      return new Set(Array.from(c.slice(0, n * 4).filter((_, i) => i % 4 === 3)));
    };
    expect(alphas()).toEqual(new Set([1]));
    // Hovering node A lights A → C only: the other links' particles dim.
    const model = buildModel(ctx.calc, ctx.trace, ctx.fullLayout, RECT);
    const [ax, ay] = center(model, 0);
    view.handlePointer!(pointer('move', ax, ay));
    expect(alphas()).toEqual(new Set([1, 0.25]));
    view.handlePointer!(pointer('leave', 0, 0));
    expect(alphas()).toEqual(new Set([1]));
    // Without link.flow, the particles go.
    const plan = { calc: false, plot: true, style: true, transform: false };
    view.update({ ...ctx, trace: plotCtx().ctx.trace }, plan);
    expect(added).not.toContain(flow);
  });

  it('outlines links with a line primitive when link.line.width is set', () => {
    const { ctx, added } = plotCtx({
      ...BASIC,
      link: { ...BASIC.link, line: { color: 'red', width: 1 } },
    });
    sankey.plot!.create(ctx);
    expect(added.some((p) => p instanceof LinePrimitive)).toBe(true);
  });

  it('describes nodes, links and flow', () => {
    const { trace, calc, fullLayout } = build({ ...BASIC, name: 'Flows' });
    const d = sankey.describe!({
      trace,
      calc,
      index: 0,
      fullLayout,
      xaxis: undefined,
      yaxis: undefined,
      maxRows: 2,
    })!;
    expect(d.summary).toBe('Sankey diagram "Flows": 5 nodes, 4 links, total flow from sources 6.');
    expect(d.table).toEqual({
      caption: 'Flows',
      columns: ['Source', 'Target', 'Value', 'Label'],
      rows: [
        ['A', 'C', '4', ''],
        ['B', 'C', '2', ''],
      ],
      total: 4,
    });
  });
});
