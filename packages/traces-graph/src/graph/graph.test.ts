import { createScale, supplyDefaults, type FullAxis, type FullTrace } from '@mk7s/holochart-core';
import {
  createResourceManager,
  LinePrimitive,
  MarkerSet,
  RectPrimitive,
  TextPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type CalcContext,
  type HoverContext,
  type HoverQuery,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGraphLayout } from '../layout/index.ts';
import type { GraphLayout, LayoutResult } from '../layout/types.ts';
import { graphExtremes, type GraphCalc } from './calc.ts';
import { backgroundOf, darkBackground, LINK_COLOR } from './defaults.ts';
import { graphHoverPoints, linkFields, nodeFields, partHoverinfo } from './hover.ts';
import { graph, graphAxisHints } from './index.ts';
import { currentLinks, drawnLinks } from './links.ts';
import { LABELS_SETTLE_MIN, LARGE, SETTLE_MS } from './plot.ts';
import {
  arrowSizes,
  contrastColor,
  linkColors,
  linkCss,
  linkCurves,
  linkWidths,
  nodeBoxStyle,
  nodeCss,
  nodeFillColors,
  nodeMarkerStyle,
} from './style.ts';

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

const registry = createChartRegistry().register(graph);

function axisInfo(type: 'linear' | 'log' | 'date' | 'category', categories?: string[]): AxisInfo {
  const scale = createScale({ type, ...(categories ? { categories } : {}) });
  return { scale, type, full: {} } as unknown as AxisInfo;
}

function defaults(input: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'graph', ...input }], layout: { template: 'none', ...layout } },
    registry.core,
    { onIssue: () => {} },
  );
  return { trace: fullData[0] as FullTrace, fullLayout };
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
  const calc = graph.calc!(trace, ctx);
  return { trace, calc, fullLayout, ctx };
}

const part = (trace: FullTrace, key: 'node' | 'link') => trace[key] as Record<string, unknown>;

/** A, B, C in a row 100 apart and D above B; A → B, B → C, B → D. */
const BASIC = {
  node: { label: ['A', 'B', 'C', 'D'], x: [0, 100, 200, 100], y: [0, 0, 0, 100] },
  link: { source: [0, 1, 1], target: [1, 2, 3], value: [5, 1, 2] },
};

/** Linear coordinates are px here: the transform is the identity. */
const IDENTITY = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

function hoverCtx(fullLayout: unknown, transform = IDENTITY): HoverContext {
  return { fullLayout, xaxis: undefined, yaxis: undefined, transform } as HoverContext;
}

function query(px: number, py: number, transform = IDENTITY, distance = 20): HoverQuery {
  return {
    px,
    py,
    xl: (px - transform.offsetX) / transform.scaleX,
    yl: (py - transform.offsetY) / transform.scaleY,
    mode: 'closest',
    distance,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('graph defaults', () => {
  it('uses preset positions when every node has one, and the trace color', () => {
    const { trace } = defaults(BASIC, { colorway: ['#ff0000', '#00ff00'] });
    expect(trace['arrangement']).toBe('preset');
    expect(trace['_length']).toBe(4);
    expect(part(trace, 'node')).toMatchObject({
      color: 'rgb(255, 0, 0)',
      size: 10,
      sizeby: 'none',
      symbol: 'circle',
      opacity: 1,
      shape: 'marker',
      textposition: 'auto',
      line: { color: 'rgb(255, 255, 255)', width: 1 },
      hoverinfo: 'all',
    });
    expect(part(trace, 'link')).toMatchObject({
      color: LINK_COLOR.light,
      width: 1,
      widthby: 'none',
      dash: 'solid',
      arrow: { end: false, start: false, size: 8 },
      opacity: 1,
    });
    expect(part(trace, 'node')['textfont']).toMatchObject({ size: 12, shadow: 'auto' });
    // Nothing to list in a legend without groups.
    expect(trace['showlegend']).toBe(false);
    // Options of modes that are off are not in the full trace.
    expect(part(trace, 'node')['sizerange']).toBeUndefined();
    expect(part(trace, 'link')['widthrange']).toBeUndefined();
    expect(trace['custom']).toBeUndefined();
  });

  it('asks for a layout when a node has no position', () => {
    expect(defaults({ link: { source: [0], target: [1] } }).trace['arrangement']).toBe('force');
    const some = defaults({ node: { label: ['a', 'b', 'c'], x: [0, 1], y: [0, 1, 2] } });
    expect(some.trace['arrangement']).toBe('force');
    expect(defaults({ ...BASIC, arrangement: 'grid' }).trace['arrangement']).toBe('grid');
  });

  it('hides a trace without nodes', () => {
    expect(defaults({}).trace.visible).toBe(false);
    expect(defaults({ node: { size: 4 }, link: { source: [], target: [] } }).trace.visible).toBe(
      false,
    );
  });

  it('leaves node colors to the groups, and shows their legend', () => {
    const { trace } = defaults({ node: { ...BASIC.node, group: ['x', 'x', 'y', 'y'] } });
    expect(part(trace, 'node')['color']).toBeUndefined();
    expect(trace['showlegend']).toBe(true);
    const own = defaults({ node: { ...BASIC.node, group: ['x', 'x', 'y', 'y'], color: 'teal' } });
    expect(part(own.trace, 'node')['color']).toBe('rgb(0, 128, 128)');
  });

  it('turns the colorscale attributes on for numeric colors', () => {
    const { trace } = defaults({
      node: { ...BASIC.node, color: [1, 2, 3, 4], showscale: true, colorscale: 'Viridis' },
    });
    expect(part(trace, 'node')).toMatchObject({ cauto: true, showscale: true });
    expect(part(trace, 'node')['colorbar']).toBeDefined();
    expect(part(defaults(BASIC).trace, 'node')['cauto']).toBeUndefined();
  });

  it('chooses link and outline colors for the background', () => {
    const dark = defaults(BASIC, { plot_bgcolor: '#111', paper_bgcolor: '#111' });
    expect(part(dark.trace, 'link')['color']).toBe(LINK_COLOR.dark);
    expect((part(dark.trace, 'node')['line'] as { color: string }).color).toBe('rgb(17, 17, 17)');
    expect(darkBackground(dark.fullLayout)).toBe(true);
    // A transparent plot area shows the paper.
    const paper = defaults(BASIC, { plot_bgcolor: 'rgba(0,0,0,0)', paper_bgcolor: '#fafafa' });
    expect(backgroundOf(paper.fullLayout)).toBe('rgb(250, 250, 250)');
    expect(darkBackground(paper.fullLayout)).toBe(false);
  });

  it('passes the trace hoverinfo to the parts, and coerces what the modes need', () => {
    const { trace } = defaults({
      ...BASIC,
      hoverinfo: 'none',
      arrangement: 'custom',
      custom: { name: 'mine', options: { a: 1 } },
      node: { ...BASIC.node, sizeby: 'degree', shape: 'box' },
      link: { ...BASIC.link, widthby: 'value' },
    });
    expect(part(trace, 'node')['hoverinfo']).toBe('none');
    expect(part(trace, 'link')['hoverinfo']).toBe('none');
    expect(trace['custom']).toEqual({ name: 'mine', options: { a: 1 } });
    expect(part(trace, 'node')['sizerange']).toEqual([6, 30]);
    expect(part(trace, 'link')['widthrange']).toEqual([1, 8]);
    // A box's text takes the color that reads on it: none is set, and no halo.
    const font = part(trace, 'node')['textfont'] as Record<string, unknown>;
    expect(font['color']).toBeUndefined();
    expect(font['shadow']).toBe('none');
  });

  it('labels the nodes of tree input from `labels`', () => {
    const { trace } = defaults({ labels: ['root', 'kid'], parents: ['', 'root'] });
    expect(part(trace, 'node')['label']).toEqual(['root', 'kid']);
    expect(trace['_length']).toBe(2);
    expect(trace['arrangement']).toBe('force');
  });

  it('is a fixed point', () => {
    const first = defaults({ ...BASIC, node: { ...BASIC.node, group: ['x', 'x', 'y', 'y'] } });
    const plain: Record<string, unknown> = { ...first.trace };
    for (const key of ['_module', '_input', '_index']) delete plain[key];
    const again = defaults(plain);
    expect({ ...again.trace, _input: 0, _module: 0 }).toEqual({
      ...first.trace,
      _input: 0,
      _module: 0,
    });
  });
});

describe('graph axes', () => {
  const layoutOf = (input: Record<string, unknown>, layout: Record<string, unknown> = {}) =>
    defaults(input, layout).fullLayout as unknown as Record<string, FullAxis>;

  it('puts preset positions on the axes like data, and types them', () => {
    const l = layoutOf({
      node: { x: ['2024-01-01', '2024-03-01'], y: ['low', 'high'] },
      link: { source: [0], target: [1] },
    });
    expect(l['xaxis']!.type).toBe('date');
    expect(l['yaxis']!.type).toBe('category');
    expect(l['xaxis']!.visible).toBe(true);
    expect(l['yaxis']!.scaleanchor).toBeUndefined();
  });

  it('hides the axes of a computed arrangement and locks them to one scale', () => {
    const l = layoutOf({ ...BASIC, arrangement: 'circular' });
    expect(l['xaxis']!.visible).toBe(false);
    expect(l['yaxis']!.visible).toBe(false);
    expect(l['yaxis']!.scaleanchor).toBe('x');
    // The figure's own settings win.
    const own = layoutOf({ ...BASIC, arrangement: 'grid' }, { xaxis: { visible: true } });
    expect(own['xaxis']!.visible).toBe(true);
  });

  it('answers axisHints for both kinds', () => {
    const preset = defaults(BASIC).trace;
    expect(graphAxisHints(preset)).toEqual({ x: BASIC.node.x, y: BASIC.node.y });
    expect(graphAxisHints(defaults({ ...BASIC, arrangement: 'circular' }).trace)).toEqual({
      hide: true,
      equal: true,
    });
  });
});

describe('graph calc', () => {
  it('places preset nodes at their positions', () => {
    const { calc } = build(BASIC);
    expect(calc).toMatchObject({ arrangement: 'preset', preset: true, length: 4 });
    expect(Array.from(calc.x)).toEqual([0, 100, 200, 100]);
    expect(Array.from(calc.y)).toEqual([0, 0, 0, 100]);
    expect(Array.from(calc.hidden)).toEqual([0, 0, 0, 0]);
    expect(calc.model.links).toBe(3);
  });

  it('takes positions through the axis scales: dates, categories, log', () => {
    const { calc } = build(
      {
        node: { x: ['2024-01-01', '2024-01-02'], y: [10, 1000] },
        link: { source: [0], target: [1] },
      },
      {},
      { xaxis: axisInfo('date'), yaxis: axisInfo('log') },
    );
    expect(calc.x[1]! - calc.x[0]!).toBe(86_400_000);
    expect(Array.from(calc.y)).toEqual([1, 3]);
    const cats = build(
      { node: { x: ['b', 'a'], y: [0, 0] } },
      {},
      { xaxis: axisInfo('category', ['a', 'b']) },
    );
    expect(Array.from(cats.calc.x)).toEqual([1, 0]);
  });

  it('reads plain numbers without axes', () => {
    const { trace, fullLayout } = defaults({ node: { x: [1, '2', 'x'], y: [3, 4, 5] } });
    const calc = graph.calc!(trace, { fullLayout, index: 0, xaxis: undefined, yaxis: undefined });
    expect(Array.from(calc.x.subarray(0, 2))).toEqual([1, 2]);
    expect(Array.from(calc.hidden)).toEqual([0, 0, 1]);
  });

  it('does not draw a preset node without a position, nor its links', () => {
    const { calc, trace } = build({
      arrangement: 'preset',
      node: { label: ['a', 'b', 'c'], x: [0, 10, null], y: [0, 0, 5] },
      link: { source: [0, 1], target: [1, 2] },
    });
    expect(Array.from(calc.hidden)).toEqual([0, 0, 1]);
    expect(calc.x[2]).toBeNaN();
    const { geometry } = drawnLinks(calc, trace, 1, 1);
    expect(Array.from(geometry.offsets)).toEqual([0, 2, 2]);
  });

  it('runs the circular and grid arrangements', () => {
    const circle = build({ ...BASIC, arrangement: 'circular' });
    expect(circle.calc).toMatchObject({ arrangement: 'circular', preset: false });
    const r = Array.from(circle.calc.x, (x, i) => Math.hypot(x, circle.calc.y[i]!));
    expect(Math.max(...r) - Math.min(...r)).toBeLessThan(1e-9);
    expect(r[0]).toBeGreaterThan(5);
    const grid = build({ ...BASIC, arrangement: 'grid' });
    expect(grid.calc.arrangement).toBe('grid');
    expect(new Set(Array.from(grid.calc.y)).size).toBe(2);
  });

  it('draws a custom layout that is not registered as circular, with a warning and no error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { calc } = build({
      link: { source: [0, 1], target: [1, 2] },
      arrangement: 'custom',
      custom: { name: 'test-nowhere' },
    });
    expect(calc.arrangement).toBe('circular');
    expect(Array.from(calc.x).every(Number.isFinite)).toBe(true);
    expect(String(warn.mock.calls.at(-1)?.[0] ?? "'test-nowhere'")).toContain("'test-nowhere'");
  });

  it('runs a registered layout with its options, and draws what it returns', () => {
    const seen: unknown[] = [];
    const layout: GraphLayout<{ gap: number }> = (g, options): LayoutResult => {
      seen.push(options, g.nodes, Array.from(g.x), g.groups);
      return {
        x: Float64Array.from({ length: g.nodes }, (_, i) => i * options.gap),
        y: new Float64Array(g.nodes),
        hidden: Uint8Array.of(0, 0, 0, 1),
        routes: [{ kind: 'polyline', points: Float64Array.of(0, 0, 3, 40, 7, 0) }],
        reversed: Uint8Array.of(0, 1, 0),
        clusters: [{ group: 0, x0: -30, y0: -20, x1: 60, y1: 55 }],
      };
    };
    const remove = registerGraphLayout('test-row', layout);
    const { calc, trace } = build({
      ...BASIC,
      node: { ...BASIC.node, group: ['g', 'g', 'h', 'h'] },
      arrangement: 'custom',
      custom: { name: 'test-row', options: { gap: 7 } },
    });
    remove();
    // The layout gets the given positions (pinned nodes), the groups and its own options.
    expect(seen).toEqual([{ gap: 7 }, 4, [0, 100, 200, 100], 2]);
    expect(calc.arrangement).toBe('custom');
    expect(Array.from(calc.x.subarray(0, 3))).toEqual([0, 7, 14]);
    // A node the layout hid is not drawn and has no position.
    expect(Array.from(calc.hidden)).toEqual([0, 0, 0, 1]);
    expect(calc.x[3]).toBeNaN();
    expect(calc.reversed).toEqual(Uint8Array.of(0, 1, 0));
    const { geometry } = drawnLinks(calc, trace, 1, 1);
    // The routed link has the route's three points; the link to the hidden node is not drawn.
    expect(Array.from(geometry.offsets)).toEqual([0, 3, 5, 5]);
    expect(geometry.y[1]).toBe(40);
    // Autorange covers the route and the group frame.
    const ex = graphExtremes(calc, trace);
    expect(Math.max(...ex.y!.max.map((p) => p.l))).toBe(55);
    expect(Math.min(...ex.x!.min.map((p) => p.l))).toBe(-30);
  });

  it('gives a stand-in layout no options, and survives a layout that throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const remove = registerGraphLayout('test-broken', () => {
      throw new Error('no');
    });
    const { calc } = build({
      ...BASIC,
      arrangement: 'custom',
      custom: { name: 'test-broken', options: { radius: 1 } },
    });
    remove();
    expect(calc.arrangement).toBe('circular');
    expect(Array.from(calc.x).every(Number.isFinite)).toBe(true);
    expect(warn).toHaveBeenCalled();
    // `tree` is not there yet: circular runs without `trace.tree`.
    const missing = build({ ...BASIC, arrangement: 'tree', tree: { radius: 1 } });
    expect(Math.hypot(missing.calc.x[0]!, missing.calc.y[0]!)).toBeGreaterThan(5);
  });

  it('hides a node the layout gave no finite position', () => {
    const remove = registerGraphLayout('test-nan', (g) => ({
      x: new Float64Array(g.nodes).fill(NaN, 1, 2),
      y: new Float64Array(g.nodes),
    }));
    const { calc } = build({ ...BASIC, arrangement: 'custom', custom: { name: 'test-nan' } });
    remove();
    expect(Array.from(calc.hidden)).toEqual([0, 1, 0, 0]);
  });

  it('hides the groups the legend turned off, without moving the others', () => {
    const input = {
      ...BASIC,
      arrangement: 'circular',
      node: { ...BASIC.node, group: ['x', 'x', 'y', 'y'] },
    };
    const all = build(input);
    const some = build(input, { hiddenlabels: ['y'] });
    expect(Array.from(some.calc.hidden)).toEqual([0, 0, 1, 1]);
    expect([...some.calc.hiddenGroups]).toEqual([1]);
    expect(Array.from(some.calc.x)).toEqual(Array.from(all.calc.x));
    expect(graphExtremes(some.calc, some.trace)).toEqual(graphExtremes(all.calc, all.trace));
  });

  it('keeps loops off the side of the labels', () => {
    const loop = {
      node: { label: ['a'], x: [0], y: [0] },
      link: { source: [0], target: [0] },
    };
    const apex = (textposition: string): number[] => {
      const b = build({ ...loop, node: { ...loop.node, textposition } });
      const { geometry } = drawnLinks(b.calc, b.trace, 1, 1);
      const mid = (geometry.offsets[1]! - 1) / 2;
      return [Math.round(geometry.x[mid]!), Math.round(geometry.y[mid]!)];
    };
    // The label is to the right by default: the loop goes left. Above: the loop goes down.
    expect(apex('auto')).toEqual([-19, 0]);
    expect(apex('top center')).toEqual([0, -19]);
    expect(apex('none')).toEqual([0, 19]);
  });

  it('builds a tree from labels and parents', () => {
    const { calc } = build({
      arrangement: 'grid',
      labels: ['root', 'a', 'b'],
      parents: ['', 'root', 'root'],
    });
    expect(calc.model.links).toBe(2);
    expect(Array.from(calc.model.parent!)).toEqual([-1, 0, 0]);
  });
});

describe('graph autorange', () => {
  const pads = (e: ReturnType<typeof graphExtremes>, axis: 'x' | 'y', side: 'min' | 'max') =>
    Math.max(...e[axis]![side].map((p) => p.padPx));

  it('pads every node by half its size and outline', () => {
    const { calc, trace } = build({
      node: { x: [0, 100], y: [0, 50], size: [10, 30], line: { width: 2 } },
    });
    const e = graphExtremes(calc, trace);
    // A larger node further in may still reach further out: both are candidates.
    expect(e.x!.min).toEqual([
      { l: 0, padPx: 6, extrapad: true },
      { l: 100, padPx: 16, extrapad: true },
    ]);
    expect(e.x!.max).toEqual([{ l: 100, padPx: 16, extrapad: true }]);
    expect(e.y!.max).toEqual([{ l: 50, padPx: 16, extrapad: true }]);
  });

  it('leaves room for labels on the side they are drawn', () => {
    const right = build(BASIC);
    const e = graphExtremes(right.calc, right.trace);
    expect(pads(e, 'x', 'max')).toBeGreaterThan(pads(e, 'x', 'min'));
    expect(pads(e, 'y', 'max')).toBe(pads(e, 'y', 'min'));
    const top = build({ ...BASIC, node: { ...BASIC.node, textposition: 'top left' } });
    const t = graphExtremes(top.calc, top.trace);
    expect(pads(t, 'y', 'max')).toBeGreaterThan(pads(t, 'y', 'min'));
    expect(pads(t, 'x', 'min')).toBeGreaterThan(pads(t, 'x', 'max'));
    const below = build({ ...BASIC, node: { ...BASIC.node, textposition: 'bottom center' } });
    const b = graphExtremes(below.calc, below.trace);
    expect(pads(b, 'y', 'min')).toBeGreaterThan(pads(b, 'y', 'max'));
    expect(pads(b, 'x', 'min')).toBe(pads(b, 'x', 'max'));
    const none = build({ ...BASIC, node: { ...BASIC.node, textposition: 'none' } });
    expect(pads(graphExtremes(none.calc, none.trace), 'x', 'max')).toBe(5.5);
  });

  it('gives the labels around a circle room on every side', () => {
    const { calc, trace } = build({ ...BASIC, arrangement: 'circular' });
    const e = graphExtremes(calc, trace);
    for (const [axis, side] of [
      ['x', 'min'],
      ['x', 'max'],
      ['y', 'min'],
      ['y', 'max'],
    ] as const) {
      expect(pads(e, axis, side)).toBeGreaterThan(10);
    }
  });

  it('covers loops and, under a computed arrangement, the apex of curved links', () => {
    const loop = build({
      node: { x: [0, 100], y: [0, 0], size: 10, textposition: 'none' },
      link: { source: [0, 0], target: [0, 1] },
    });
    const e = graphExtremes(loop.calc, loop.trace);
    // The node's radius, the loop's reach and half the outline.
    expect(pads(e, 'x', 'min')).toBe(5 + 14 + 0.5);
    expect(pads(e, 'y', 'max')).toBe(5 + 14 + 0.5);

    const flat = { node: { label: ['a', 'b', 'c', 'd'] }, link: { source: [0], target: [1] } };
    const straight = build({ ...flat, arrangement: 'grid' });
    const curved = build({ ...flat, arrangement: 'grid', link: { ...flat.link, curve: 1 } });
    const top = (b: typeof straight) =>
      Math.max(...graphExtremes(b.calc, b.trace).y!.max.map((p) => p.l));
    // The first row's link bows up by its own length.
    expect(top(curved) - top(straight)).toBeCloseTo(curved.calc.x[1]! - curved.calc.x[0]!, 6);
    // Under preset the axes may differ: curves are not ranged over.
    const preset = build({ ...BASIC, link: { ...BASIC.link, curve: 1 } });
    expect(Math.max(...graphExtremes(preset.calc, preset.trace).y!.max.map((p) => p.l))).toBe(100);
  });

  it('is what the module reports', () => {
    const { calc, trace, ctx } = build(BASIC);
    expect(graph.extremes!(calc, trace, ctx)).toEqual(graphExtremes(calc, trace));
  });
});

describe('graph styles', () => {
  it('colors nodes by group from the colorway, gray without a group', () => {
    const { calc, trace, fullLayout } = build(
      { node: { ...BASIC.node, group: ['x', 'y', 'x', ''] } },
      { colorway: ['#ff0000', '#0000ff'] },
    );
    const colors = nodeFillColors(calc, trace, fullLayout) as Float32Array;
    expect(Array.from(colors.subarray(0, 12))).toEqual([1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1]);
    expect(colors[12]).toBeCloseTo(0.6, 6);
    expect(nodeCss(calc, trace, fullLayout, 1)).toBe('rgb(0, 0, 255)');
    expect(nodeCss(calc, trace, fullLayout, 3)).toBe('rgb(153, 153, 153)');
  });

  it('takes one color, or one per node, as given', () => {
    const one = build({ node: { ...BASIC.node, color: '#00ff00' } });
    expect(nodeFillColors(one.calc, one.trace, one.fullLayout)).toEqual([0, 1, 0, 1]);
    expect(nodeCss(one.calc, one.trace, one.fullLayout, 2)).toBe('rgb(0, 255, 0)');
    const each = build({ node: { ...BASIC.node, color: ['red', 'blue'] } });
    const colors = nodeFillColors(each.calc, each.trace, each.fullLayout) as Float32Array;
    expect(colors).toHaveLength(16);
    expect(Array.from(colors.subarray(4, 8))).toEqual([0, 0, 1, 1]);
    // Nodes past the end of the array take the fallback gray.
    expect(colors[12]).toBeCloseTo(0.4, 6);
    expect(nodeCss(each.calc, each.trace, each.fullLayout, 0)).toBe('red');
    expect(nodeCss(each.calc, each.trace, each.fullLayout, 3)).toBe('rgb(102, 102, 102)');
  });

  it('maps numbers through the colorscale: on the GPU for markers', () => {
    const b = build({
      node: {
        ...BASIC.node,
        color: [0, 5, 10, null],
        colorscale: [
          [0, '#000'],
          [1, '#fff'],
        ],
      },
    });
    const style = nodeMarkerStyle(b.calc, b.trace, b.fullLayout);
    expect(style.colorscale).toBeTruthy();
    expect([style.cmin, style.cmax]).toEqual([0, 10]);
    expect(Array.from(style.colorValues as Float64Array).slice(0, 3)).toEqual([0, 5, 10]);
    expect((style.colorValues as Float64Array)[3]).toBeNaN();
    expect(nodeCss(b.calc, b.trace, b.fullLayout, 2)).toBe('rgb(255, 255, 255)');
    const cpu = nodeFillColors(b.calc, b.trace, b.fullLayout) as Float32Array;
    expect(Array.from(cpu.subarray(8, 12))).toEqual([1, 1, 1, 1]);
  });

  it('resolves mixed numbers and CSS colors per node', () => {
    const b = build({
      node: {
        ...BASIC.node,
        color: [0, 'red', 10, 5],
        colorscale: [
          [0, '#000'],
          [1, '#fff'],
        ],
      },
    });
    const style = nodeMarkerStyle(b.calc, b.trace, b.fullLayout);
    expect(style.colorscale).toBeNull();
    expect(Array.from((style.color as Float32Array).subarray(4, 8))).toEqual([1, 0, 0, 1]);
    expect(nodeCss(b.calc, b.trace, b.fullLayout, 1)).toBe('red');
  });

  it('dims what a selection leaves out, and applies the selected styles', () => {
    const b = build({ ...BASIC, opacity: 0.5 });
    const dimmed = nodeMarkerStyle(b.calc, b.trace, b.fullLayout, [1]);
    expect(Array.from(dimmed.opacity as Float32Array)).toEqual(
      [0.1, 0.5, 0.1, 0.1].map((v) => Math.fround(v)),
    );
    expect(nodeMarkerStyle(b.calc, b.trace, b.fullLayout).opacity).toBe(0.5);
    const styled = build({
      ...BASIC,
      node: { ...BASIC.node, opacity: [1, 0.5, 1, 1], color: [1, 2, 3, 4] },
      selected: { node: { opacity: 0.9, color: 'red' } },
      unselected: { node: { opacity: 0.3, color: 'gray' } },
    });
    const s = nodeMarkerStyle(styled.calc, styled.trace, styled.fullLayout, [0]);
    expect(Array.from(s.opacity as Float32Array)).toEqual([0.9, 0.3, 0.3, 0.3].map(Math.fround));
    // Explicit selection colors take numeric colors off the GPU colorscale.
    expect(s.colorscale).toBeNull();
    expect(Array.from((s.color as Float32Array).subarray(0, 4))).toEqual([1, 0, 0, 1]);
    const noSelection = nodeMarkerStyle(styled.calc, styled.trace, styled.fullLayout);
    expect(Array.from(noSelection.opacity as Float32Array)).toEqual([1, 0.5, 1, 1]);
    expect(noSelection.colorscale).toBeTruthy();
  });

  it('takes symbols, outline colors and widths per node', () => {
    const b = build({
      node: {
        ...BASIC.node,
        symbol: ['square', 'circle', 'diamond', 'x'],
        line: { color: ['red', 'blue'], width: [0, 1, 2, -1] },
      },
    });
    const style = nodeMarkerStyle(b.calc, b.trace, b.fullLayout);
    expect(style.symbol).toEqual(['square', 'circle', 'diamond', 'x']);
    expect(Array.from(style.lineWidth as Float32Array)).toEqual([0, 1, 2, 0]);
    expect(Array.from((style.lineColor as Float32Array).subarray(0, 4))).toEqual([1, 0, 0, 1]);
    expect(style.size).toBe(b.calc.model.size);
  });

  it('styles boxes for the rect primitive, with opacity in the colors', () => {
    const b = build({
      ...BASIC,
      node: { ...BASIC.node, shape: 'box', color: '#ff0000', opacity: 0.5 },
    });
    const style = nodeBoxStyle(b.calc, b.trace, b.fullLayout);
    expect(style.fill).toEqual([1, 0, 0, 0.5]);
    expect(style.fills).toEqual([1, 0, 0, 1]);
    const selected = nodeBoxStyle(b.calc, b.trace, b.fullLayout, [0]);
    expect((selected.fill as Float32Array)[3]).toBeCloseTo(0.5, 6);
    expect((selected.fill as Float32Array)[7]).toBeCloseTo(0.1, 6);
    expect(contrastColor([1, 1, 0, 1])[0]).toBeLessThan(0.5);
    expect(contrastColor([0, 0, 0.5, 1])).toEqual([1, 1, 1, 1]);
  });

  it('gives links their widths: as set, per link, or by value', () => {
    const b = build(BASIC);
    expect(Array.from(linkWidths(b.calc.model, b.trace))).toEqual([1, 1, 1]);
    const each = build({ ...BASIC, link: { ...BASIC.link, width: [1, 4] } });
    expect(Array.from(linkWidths(each.calc.model, each.trace))).toEqual([1, 4, 1]);
    const by = build({ ...BASIC, link: { ...BASIC.link, widthby: 'value', widthrange: [1, 11] } });
    // Values 5, 1, 2 of a largest 5.
    expect(Array.from(linkWidths(by.calc.model, by.trace))).toEqual([11, 3, 5]);
    const flat = build({
      ...BASIC,
      link: { source: [0], target: [1], widthby: 'value' },
    });
    expect(Array.from(linkWidths(flat.calc.model, flat.trace))).toEqual([1]);
    expect(Array.from(arrowSizes(by.trace, Float32Array.of(1, 4)))).toEqual([8, 12]);
  });

  it('gives links their curvature: the fan, one value, or one per link', () => {
    const input = { ...BASIC, link: { source: [0, 0, 1], target: [1, 1, 2] } };
    const fan = build(input);
    expect(linkCurves(fan.calc.model, fan.trace)).toBe(fan.calc.model.fan);
    const one = build({ ...input, link: { ...input.link, curve: 0.3 } });
    expect(Array.from(linkCurves(one.calc.model, one.trace))).toEqual(
      [0.3, 0.3, 0.3].map(Math.fround),
    );
    const each = build({ ...input, link: { ...input.link, curve: [0.5, null] } });
    const curves = linkCurves(each.calc.model, each.trace);
    expect(curves[0]).toBe(0.5);
    // Where a link has none of its own, the fan stands.
    expect(curves[1]).toBeCloseTo(0.1, 6);
    expect(curves[2]).toBe(0);
  });

  it('colors links: one color, per link, and dimmed outside a selection', () => {
    const b = build({ ...BASIC, link: { ...BASIC.link, color: 'rgba(255, 0, 0, 0.5)' } });
    expect(linkColors(b.calc, b.trace)).toEqual([1, 0, 0, 0.5]);
    expect(linkCss(b.calc.model, b.trace, 0)).toBe('rgb(255, 0, 0)');
    // Only A → B joins two selected nodes.
    const selected = linkColors(b.calc, b.trace, [0, 1]) as Float32Array;
    expect(Array.from(selected.filter((_, i) => i % 4 === 3))).toEqual(
      [0.5, 0.1, 0.1].map(Math.fround),
    );
    const each = build({ ...BASIC, link: { ...BASIC.link, color: ['red', 'lime', 'nope'] } });
    const colors = linkColors(each.calc, each.trace) as Float32Array;
    expect(Array.from(colors.subarray(4, 8))).toEqual([0, 1, 0, 1]);
    expect(colors[8]).toBeCloseTo(0.4, 6);
  });
});

describe('graph hover and selection', () => {
  it('hits the node under the pointer, with its label, degree and group', () => {
    const { calc, trace, fullLayout } = build({
      ...BASIC,
      node: { ...BASIC.node, group: ['x', 'x', 'y', 'y'], customdata: ['a', 'b', 'c', 'd'] },
    });
    const [p] = graphHoverPoints(calc, trace, query(102, 3), hoverCtx(fullLayout));
    expect(p).toMatchObject({
      pointIndex: 1,
      kind: 'node',
      distance: 0,
      px: 100,
      py: 0,
      x: 100,
      y: 0,
      hoverText: 'B<br>Links: 3<br>Group: x',
    });
    expect(p!.fields).toMatchObject({
      kind: 'node',
      index: 1,
      label: 'B',
      degree: 3,
      indegree: 1,
      outdegree: 2,
      group: 'x',
      size: 10,
      customdata: 'b',
    });
    expect(p!.color).toBeDefined();
  });

  it('reports in and out links of a directed graph, and names a node without a label', () => {
    const { calc, trace, fullLayout } = build({
      node: { x: [0, 100], y: [0, 0] },
      link: { source: [0], target: [1], arrow: { end: true } },
    });
    const [p] = graphHoverPoints(calc, trace, query(100, 0), hoverCtx(fullLayout));
    expect(p!.hoverText).toBe('Node 1<br>Links in: 1, out: 0');
  });

  it('hits small nodes a few px out, and nothing beyond', () => {
    const { calc, trace, fullLayout } = build({
      node: { x: [0], y: [0], size: 2 },
    });
    const at = (px: number) => graphHoverPoints(calc, trace, query(px, 0), hoverCtx(fullLayout));
    expect(at(2.5)).toHaveLength(1);
    expect(at(6)).toHaveLength(0);
  });

  it('hits a box node inside its rectangle', () => {
    const { calc, trace, fullLayout } = build({
      node: { label: ['A wide label here'], x: [0], y: [0], shape: 'box' },
    });
    const at = (px: number, py: number) =>
      graphHoverPoints(calc, trace, query(px, py), hoverCtx(fullLayout)).length;
    const hw = calc.model.halfWidth[0]!;
    expect(at(hw - 1, 5)).toBe(1);
    expect(at(hw - 1, calc.model.halfHeight[0]! + 2)).toBe(0);
  });

  it('prefers the node whose center is nearest among overlapping nodes', () => {
    const { calc, trace, fullLayout } = build({
      node: { x: [0, 12], y: [0, 0], size: 30 },
    });
    const at = (px: number) =>
      graphHoverPoints(calc, trace, query(px, 0), hoverCtx(fullLayout))[0]!.pointIndex;
    expect(at(2)).toBe(0);
    expect(at(10)).toBe(1);
  });

  it('hits the nearest link within reach: its ends, label and value', () => {
    const { calc, trace, fullLayout } = build({
      ...BASIC,
      link: { ...BASIC.link, label: ['first', null, 'third'], customdata: [1, 2, 3] },
    });
    const [p] = graphHoverPoints(calc, trace, query(50, 2), hoverCtx(fullLayout));
    expect(p).toMatchObject({
      pointIndex: 0,
      kind: 'link',
      px: 50,
      py: 0,
      hoverText: 'A – B<br>first<br>Value: 5',
      labels: { value: '5' },
      color: 'rgb(68, 68, 68)',
    });
    expect(p!.distance).toBeCloseTo(1.5, 6);
    expect(p!.fields).toMatchObject({
      kind: 'link',
      index: 0,
      label: 'first',
      value: 5,
      source: { index: 0, label: 'A', degree: 1 },
      target: { index: 1, label: 'B', degree: 3 },
      customdata: 1,
    });
    // Too far from every link.
    expect(graphHoverPoints(calc, trace, query(50, 30), hoverCtx(fullLayout))).toEqual([]);
    // The vertical link B → D.
    const [up] = graphHoverPoints(calc, trace, query(101, 50), hoverCtx(fullLayout));
    expect(up).toMatchObject({ pointIndex: 2, kind: 'link' });
    expect(up!.hoverText).toBe('B – D<br>third<br>Value: 2');
  });

  it('follows the transform: px distances at any zoom', () => {
    const { calc, trace, fullLayout } = build(BASIC);
    const t = { scaleX: 3, scaleY: 3, offsetX: 20, offsetY: 10 };
    const node = graphHoverPoints(calc, trace, query(322, 12, t), hoverCtx(fullLayout, t));
    expect(node[0]).toMatchObject({ pointIndex: 1, kind: 'node', px: 320, py: 10 });
    const link = graphHoverPoints(calc, trace, query(170, 12, t), hoverCtx(fullLayout, t));
    expect(link[0]).toMatchObject({ pointIndex: 0, kind: 'link' });
    expect(
      graphHoverPoints(
        calc,
        trace,
        query(170, 12, { ...t, scaleX: 0 }),
        hoverCtx(fullLayout, { ...t, scaleX: 0 }),
      ),
    ).toHaveLength(0);
  });

  it('marks the direction of a link by its arrowheads, and reports wide links further out', () => {
    const arrow = (a: Record<string, boolean>) => {
      const b = build({ ...BASIC, link: { ...BASIC.link, width: 12, arrow: a } });
      return graphHoverPoints(b.calc, b.trace, query(50, 9), hoverCtx(b.fullLayout))[0]!.hoverText;
    };
    expect(arrow({ end: true })).toContain('A → B');
    expect(arrow({ start: true })).toContain('A ← B');
    expect(arrow({ end: true, start: true })).toContain('A ↔ B');
  });

  it('fills hovertemplates with the fields', () => {
    const { calc, trace, fullLayout } = build({
      ...BASIC,
      node: {
        ...BASIC.node,
        hovertemplate:
          '%{label}: %{degree} (%{indegree} in, %{outdegree} out) at %{x}<extra>n</extra>',
      },
      link: {
        ...BASIC.link,
        hovertemplate: '%{source.label} to %{target.label}: %{value}',
      },
    });
    const [n] = graphHoverPoints(calc, trace, query(100, 0), hoverCtx(fullLayout));
    expect(n).toMatchObject({ hoverText: 'B: 3 (1 in, 2 out) at 100', extra: 'n' });
    const [l] = graphHoverPoints(calc, trace, query(150, 1), hoverCtx(fullLayout));
    expect(l!.hoverText).toBe('B to C: 1');
    expect(l!.extra).toBeUndefined();
  });

  it('honours hoverinfo of the trace and of each part', () => {
    const skip = build({ ...BASIC, hoverinfo: 'skip' });
    expect(
      graphHoverPoints(skip.calc, skip.trace, query(100, 0), hoverCtx(skip.fullLayout)),
    ).toEqual([]);
    expect(partHoverinfo(skip.trace, 'node')).toBe('skip');
    const nodes = build({ ...BASIC, node: { ...BASIC.node, hoverinfo: 'skip' } });
    // Over node B, with nodes skipped, the link that ends there answers.
    const under = graphHoverPoints(
      nodes.calc,
      nodes.trace,
      query(97, 0),
      hoverCtx(nodes.fullLayout),
    );
    expect(under[0]!.kind).toBe('link');
    const links = build({ ...BASIC, link: { ...BASIC.link, hoverinfo: 'skip' } });
    expect(
      graphHoverPoints(links.calc, links.trace, query(50, 0), hoverCtx(links.fullLayout)),
    ).toEqual([]);
    const none = build({ ...BASIC, hoverinfo: 'none' });
    const [silent] = graphHoverPoints(
      none.calc,
      none.trace,
      query(100, 0),
      hoverCtx(none.fullLayout),
    );
    expect(silent).toMatchObject({ pointIndex: 1, hoverText: '' });
    expect(partHoverinfo(none.trace, 'link')).toBe('none');
  });

  it('does not hit hidden nodes or their links', () => {
    const { calc, trace, fullLayout } = build(
      { ...BASIC, node: { ...BASIC.node, group: ['x', 'y', 'x', 'x'] } },
      { hiddenlabels: ['y'] },
    );
    expect(graphHoverPoints(calc, trace, query(100, 0), hoverCtx(fullLayout))).toEqual([]);
    expect(graphHoverPoints(calc, trace, query(50, 0), hoverCtx(fullLayout))).toEqual([]);
    expect(graphHoverPoints(calc, trace, query(0, 0), hoverCtx(fullLayout))).toHaveLength(1);
  });

  it('selects the nodes inside a box or a lasso', () => {
    const { calc, trace, ctx } = build(BASIC);
    const hover = hoverCtx(ctx.fullLayout);
    expect(
      graph.selectPoints!(calc, trace, { kind: 'rect', x: [-10, 150], y: [-10, 10] }, hover),
    ).toEqual([0, 1]);
    const lasso = graph.selectPoints!(
      calc,
      trace,
      {
        kind: 'lasso',
        x: [50, 250],
        y: [-50, 150],
        polygon: [
          [50, -50],
          [250, -50],
          [250, 50],
          [150, 150],
          [50, 150],
        ],
      },
      hover,
    );
    expect(lasso).toEqual([1, 2, 3]);
    expect(graph.eventData!(calc, trace, 2)).toMatchObject({ kind: 'node', label: 'C', degree: 1 });
    expect(graph.eventData!(calc, trace, 9)).toEqual({});
  });

  it('describes fields of links without a value', () => {
    const { calc, trace } = build({ node: BASIC.node, link: { source: [0], target: [1] } });
    expect(linkFields(calc, trace, 0)).toMatchObject({ value: undefined, label: '' });
    expect(nodeFields(calc, trace, 0)['group']).toBeUndefined();
  });
});

describe('graph legend and colorbar', () => {
  it('lists one legend item per group, hidden ones marked', () => {
    const { calc, trace, fullLayout } = build(
      { ...BASIC, node: { ...BASIC.node, group: ['x', 'y', 'x', 'x'] } },
      { colorway: ['#ff0000', '#0000ff'], hiddenlabels: ['y'] },
    );
    const items = graph.legendItems!(calc, trace, { fullLayout })!;
    expect(items.map((i) => [i.key, i.name, i.hidden])).toEqual([
      ['x', 'x', false],
      ['y', 'y', true],
    ]);
    expect(items[1]!.glyph).toMatchObject({
      kind: 'marker',
      marker: { color: 'rgb(0, 0, 255)', symbol: 'circle', lineWidth: 1 },
    });
  });

  it('has no group items without groups or with per-node colors', () => {
    const plain = build(BASIC);
    expect(graph.legendItems!(plain.calc, plain.trace, plain)).toBeUndefined();
    const own = build({
      ...BASIC,
      node: { ...BASIC.node, group: ['x', 'y', 'x', 'x'], color: [1, 2, 3, 4] },
    });
    expect(graph.legendItems!(own.calc, own.trace, own)).toBeUndefined();
    // One color for all: the items differ by name.
    const one = build({
      ...BASIC,
      node: { ...BASIC.node, group: ['x', 'y', 'x', 'x'], color: 'red', shape: 'box' },
    });
    const items = graph.legendItems!(one.calc, one.trace, one)!;
    expect(items.map((i) => i.glyph.marker?.color)).toEqual(['rgb(255, 0, 0)', 'rgb(255, 0, 0)']);
    expect(items[0]!.glyph.marker?.symbol).toBe('square');
  });

  it('draws the trace as a node in its color', () => {
    const { trace, fullLayout } = build(BASIC, { colorway: ['#123456'] });
    expect(graph.legendIcon!(trace, { fullLayout }).marker?.color).toBe('rgb(18, 52, 86)');
    const grouped = build(
      { node: { ...BASIC.node, group: ['x', 'y', 'x', 'x'] } },
      { colorway: ['#123456'] },
    );
    expect(graph.legendIcon!(grouped.trace, grouped).marker?.color).toBe('rgb(18, 52, 86)');
    expect(graph.legendIcon!(grouped.trace).marker?.color).toBe('#636efa');
  });

  it('shows a colorbar for numeric colors with showscale', () => {
    const shown = build({
      ...BASIC,
      node: { ...BASIC.node, color: [1, 2, 3, 4], showscale: true },
    });
    expect(graph.colorbar!(shown.trace, shown)).toMatchObject({ cmin: 1, cmax: 4 });
    const off = build({ ...BASIC, node: { ...BASIC.node, color: [1, 2, 3, 4] } });
    expect(graph.colorbar!(off.trace, off)).toBeNull();
    expect(graph.colorbar!(build(BASIC).trace, build(BASIC))).toBeNull();
  });

  it('shares a color axis, with the extent of the node colors', () => {
    const { trace, fullLayout } = build({
      ...BASIC,
      node: { ...BASIC.node, color: [2, 4, 6, 8], coloraxis: 'coloraxis' },
    });
    const axis = (fullLayout as unknown as Record<string, Record<string, unknown>>)['coloraxis']!;
    expect([axis['_min'], axis['_max']]).toEqual([2, 8]);
    expect(graph.colorbar!(trace, { fullLayout })).toMatchObject({
      coloraxis: 'coloraxis',
      cmin: 2,
      cmax: 8,
    });
  });
});

describe('graph view', () => {
  function plotCtx(
    input: Record<string, unknown>,
    transform = IDENTITY,
    layout: Record<string, unknown> = {},
  ) {
    const { trace, calc, fullLayout } = build(input, layout);
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<GraphCalc> = {
      trace,
      calc,
      index: 0,
      fullLayout,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform,
      viewport: { size: { width: 500, height: 300 } } as Viewport,
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

  const NONE = { calc: false, plot: false, style: false, transform: false };
  const kinds = (added: Primitive<unknown>[]) => added.map((p) => p.constructor);
  const byOrder = (added: Primitive<unknown>[]) =>
    [...added].sort((a, b) => a.object.renderOrder - b.object.renderOrder);
  const labelsOf = (text: Primitive<unknown>) =>
    (text as unknown as { data: { labels: { text: string }[] } }).data.labels.map((l) => l.text);

  it('draws links, nodes and labels as one primitive each, nodes above links', () => {
    const { ctx, added } = plotCtx(BASIC);
    graph.plot!.create(ctx);
    expect(kinds(byOrder(added))).toEqual([LinePrimitive, MarkerSet, TextPrimitive]);
    const markers = added.find((p) => p instanceof MarkerSet) as MarkerSet;
    expect(markers.count).toBe(4);
    expect(labelsOf(added.find((p) => p instanceof TextPrimitive)!)).toEqual(['B', 'A', 'C', 'D']);
  });

  it('adds one marker set of arrowheads between the links and the nodes', () => {
    const { ctx, added } = plotCtx({ ...BASIC, link: { ...BASIC.link, arrow: { end: true } } });
    graph.plot!.create(ctx);
    const ordered = byOrder(added);
    expect(kinds(ordered)).toEqual([LinePrimitive, MarkerSet, MarkerSet, TextPrimitive]);
    expect((ordered[1] as MarkerSet).count).toBe(3);
    expect((ordered[2] as MarkerSet).count).toBe(4);
  });

  it('draws box nodes as rects with their labels inside, all of them', () => {
    const { ctx, added } = plotCtx({ ...BASIC, node: { ...BASIC.node, shape: 'box' } });
    graph.plot!.create(ctx);
    expect(kinds(byOrder(added))).toEqual([LinePrimitive, RectPrimitive, TextPrimitive]);
    expect(labelsOf(added.find((p) => p instanceof TextPrimitive)!)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('draws no text without labels or with textposition none, and no line without links', () => {
    const none = plotCtx({ ...BASIC, node: { ...BASIC.node, textposition: 'none' } });
    graph.plot!.create(none.ctx);
    expect(kinds(byOrder(none.added))).toEqual([LinePrimitive, MarkerSet]);
    const bare = plotCtx({ node: { x: [0, 1], y: [0, 1] } });
    graph.plot!.create(bare.ctx);
    expect(kinds(bare.added)).toEqual([MarkerSet]);
  });

  it('culls colliding labels and brings them back on zoom', () => {
    const close = {
      node: { label: ['Alpha', 'Beta', 'Gamma'], x: [0, 4, 200], y: [100, 100, 100] },
      link: { source: [0, 0, 0], target: [1, 1, 2] },
    };
    const { ctx, added } = plotCtx(close);
    const view = graph.plot!.create(ctx);
    const text = added.find((p) => p instanceof TextPrimitive)!;
    // Alpha has the most links; Beta is 4 px from it.
    expect(labelsOf(text)).toEqual(['Alpha', 'Gamma']);
    const zoomed = { ...ctx, transform: { scaleX: 20, scaleY: 1, offsetX: 0, offsetY: 0 } };
    view.update(zoomed, { ...NONE, transform: true });
    expect(labelsOf(text)).toEqual(['Alpha', 'Beta', 'Gamma']);
    // A pan changes nothing about a small graph's labels.
    const before = (text as unknown as { data: { labels: unknown } }).data.labels;
    view.update(
      { ...zoomed, transform: { ...zoomed.transform, offsetX: 5 } },
      { ...NONE, transform: true },
    );
    expect((text as unknown as { data: { labels: unknown } }).data.labels).toBe(before);
  });

  it('rebuilds arrow geometry when the scale changes, and nothing on a pan', () => {
    const { ctx, added } = plotCtx({ ...BASIC, link: { ...BASIC.link, arrow: { end: true } } });
    const view = graph.plot!.create(ctx);
    const first = currentLinks(ctx.calc, ctx.trace, 1, 1)!;
    expect(first.geometry.arrows.x[0]).toBeCloseTo(95, 3);
    const line = added.find((p) => p instanceof LinePrimitive) as LinePrimitive;
    const setTransform = vi.spyOn(line, 'setTransform');
    const update = vi.spyOn(line, 'update');
    view.update({ ...ctx, transform: { ...IDENTITY, offsetX: 40 } }, { ...NONE, transform: true });
    expect(update).not.toHaveBeenCalled();
    expect(setTransform).toHaveBeenCalledTimes(1);
    expect(currentLinks(ctx.calc, ctx.trace, 1, 1)).toBe(first);
    const zoomed = { scaleX: 2, scaleY: 2, offsetX: 0, offsetY: 0 };
    view.update({ ...ctx, transform: zoomed }, { ...NONE, transform: true });
    expect(update).toHaveBeenCalledTimes(1);
    const second = currentLinks(ctx.calc, ctx.trace, 2, 2)!;
    expect(second).not.toBe(first);
    // The tip is still 5 px from the node center: 2.5 units at twice the scale.
    expect(second.geometry.arrows.x[0]).toBeCloseTo(97.5, 3);
  });

  it('keeps straight links as they are under any zoom', () => {
    const { ctx, added } = plotCtx(BASIC);
    const view = graph.plot!.create(ctx);
    const line = added.find((p) => p instanceof LinePrimitive) as LinePrimitive;
    const update = vi.spyOn(line, 'update');
    view.update(
      { ...ctx, transform: { scaleX: 9, scaleY: 0.5, offsetX: 3, offsetY: 4 } },
      { ...NONE, transform: true },
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('resizes box nodes with the scale', () => {
    const { ctx, added } = plotCtx({ ...BASIC, node: { ...BASIC.node, shape: 'box' } });
    const view = graph.plot!.create(ctx);
    const rects = added.find((p) => p instanceof RectPrimitive) as RectPrimitive;
    const update = vi.spyOn(rects, 'update');
    view.update({ ...ctx, transform: { ...IDENTITY, offsetY: 9 } }, { ...NONE, transform: true });
    expect(update).not.toHaveBeenCalled();
    view.update(
      { ...ctx, transform: { scaleX: 2, scaleY: 2, offsetX: 0, offsetY: 0 } },
      { ...NONE, transform: true },
    );
    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0]![0] as { x0: Float64Array; x1: Float64Array };
    // Half the width in units at twice the scale.
    expect(data.x1[0]! - data.x0[0]!).toBeCloseTo(ctx.calc.model.halfWidth[0]!, 6);
  });

  it('restyles in place: colors and the selection, without new geometry', () => {
    // Two selected nodes would highlight the path between them (`highlight.test.ts`): not here.
    const { ctx, added } = plotCtx({
      ...BASIC,
      link: { ...BASIC.link, arrow: { end: true } },
      highlight: { mode: 'neighbors' },
    });
    const view = graph.plot!.create(ctx);
    const [line, arrows, nodes] = byOrder(added) as [LinePrimitive, MarkerSet, MarkerSet];
    const lineUpdate = vi.spyOn(line, 'update');
    const nodeUpdate = vi.spyOn(nodes, 'update');
    const arrowUpdate = vi.spyOn(arrows, 'update');
    view.update({ ...ctx, selectedPoints: [0, 1] }, { ...NONE, selection: true });
    expect(lineUpdate.mock.calls[0]![0]).not.toHaveProperty('x');
    const colors = (lineUpdate.mock.calls[0]![0] as { color: Float32Array }).color;
    // Per vertex now: the first link keeps its alpha, the others are dimmed.
    expect(colors[3]).toBeCloseTo(0.45, 6);
    expect(colors[colors.length - 1]).toBeCloseTo(0.09, 6);
    expect((nodeUpdate.mock.calls[0]![0] as { opacity: Float32Array }).opacity[2]).toBeCloseTo(
      0.2,
      6,
    );
    expect(arrowUpdate).toHaveBeenCalledTimes(1);
    view.update({ ...ctx, selectedPoints: null }, { ...NONE, style: true });
    expect((nodeUpdate.mock.calls[1]![0] as { opacity: number }).opacity).toBe(1);
    expect(added).toHaveLength(4);
  });

  it('restyles boxes and their label colors', () => {
    const { ctx, added } = plotCtx({
      ...BASIC,
      node: { ...BASIC.node, shape: 'box', color: '#000' },
    });
    const view = graph.plot!.create(ctx);
    const text = added.find((p) => p instanceof TextPrimitive)!;
    const colorOf = () =>
      (text as unknown as { data: { labels: { color: number[] }[] } }).data.labels[0]!.color;
    expect(colorOf()).toEqual([1, 1, 1, 1]);
    const lighter = build({ ...BASIC, node: { ...BASIC.node, shape: 'box', color: '#fff' } });
    view.update({ ...ctx, trace: lighter.trace }, { ...NONE, style: true });
    expect(colorOf()[0]).toBeLessThan(0.5);
  });

  it('switches primitives on a plot or calc update', () => {
    const { ctx, added } = plotCtx(BASIC);
    const view = graph.plot!.create(ctx);
    const boxes = build({ ...BASIC, node: { ...BASIC.node, shape: 'box' } });
    view.update({ ...ctx, trace: boxes.trace, calc: boxes.calc }, { ...NONE, calc: true });
    expect(kinds(byOrder(added))).toEqual([LinePrimitive, RectPrimitive, TextPrimitive]);
    const bare = build({
      node: { x: [0, 1], y: [0, 1] },
      link: { source: [0], target: [1], arrow: { end: true } },
    });
    view.update({ ...ctx, trace: bare.trace, calc: bare.calc }, { ...NONE, plot: true });
    // Two nodes one unit apart at one px per unit leave no room for a link with a head.
    expect(kinds(added)).toEqual([MarkerSet]);
    view.update({ ...ctx, trace: ctx.trace, calc: ctx.calc }, { ...NONE, calc: true });
    expect(kinds(byOrder(added))).toEqual([LinePrimitive, MarkerSet, TextPrimitive]);
    view.dispose?.();
  });

  it('draws the group frames of a layout under the links, and drops those of hidden groups', () => {
    const remove = registerGraphLayout('test-frames', (g) => ({
      x: Float64Array.from({ length: g.nodes }, (_, i) => i * 50),
      y: new Float64Array(g.nodes),
      clusters: [
        { group: 0, x0: -20, y0: -20, x1: 70, y1: 20 },
        { group: 1, x0: 80, y0: -20, x1: 170, y1: 20 },
      ],
    }));
    const input = {
      ...BASIC,
      node: { ...BASIC.node, group: ['x', 'x', 'y', 'y'] },
      arrangement: 'custom',
      custom: { name: 'test-frames' },
    };
    const { ctx, added } = plotCtx(input, IDENTITY, { colorway: ['#ff0000', '#0000ff'] });
    const view = graph.plot!.create(ctx);
    const ordered = byOrder(added);
    expect(kinds(ordered)).toEqual([RectPrimitive, LinePrimitive, MarkerSet, TextPrimitive]);
    const frames = ordered[0] as RectPrimitive;
    const update = vi.spyOn(frames, 'update');
    const hidden = build(input, { colorway: ['#ff0000', '#0000ff'], hiddenlabels: ['y'] });
    view.update({ ...ctx, ...hidden }, { ...NONE, calc: true });
    const data = update.mock.calls[0]![0] as { x0: Float64Array; fill: Float32Array };
    expect(Array.from(data.x0)).toEqual([-20]);
    expect(Array.from(data.fill)).toEqual([1, 0, 0, 0.08].map(Math.fround));
    remove();
    // Without frames the rect goes.
    const plain = build(BASIC);
    view.update({ ...ctx, ...plain }, { ...NONE, calc: true });
    expect(added.some((p) => p instanceof RectPrimitive)).toBe(false);
  });

  it('points the labels of a circular arrangement outwards', () => {
    const { ctx, added } = plotCtx(
      { ...BASIC, arrangement: 'circular' },
      {
        scaleX: 1,
        scaleY: 1,
        offsetX: 250,
        offsetY: 150,
      },
    );
    graph.plot!.create(ctx);
    const text = added.find((p) => p instanceof TextPrimitive)!;
    const labels = (
      text as unknown as { data: { labels: { text: string; anchorX: string; anchorY: string }[] } }
    ).data.labels;
    const anchors = Object.fromEntries(labels.map((l) => [l.text, [l.anchorX, l.anchorY]]));
    // A is on top, B to the right, C at the bottom, D to the left.
    expect(anchors).toEqual({
      A: ['center', 'bottom'],
      B: ['left', 'middle'],
      C: ['center', 'top'],
      D: ['right', 'middle'],
    });
  });

  it('places the labels of a graph of some size only once the zoom has settled', () => {
    vi.useFakeTimers();
    const n = LABELS_SETTLE_MIN;
    const { ctx, added } = plotCtx({
      node: {
        x: Array.from({ length: n }, (_, i) => (i % 25) * 4),
        y: Array.from({ length: n }, (_, i) => Math.floor(i / 25) * 4),
        size: 2,
        label: Array.from({ length: n }, (_, i) => `n${i}`),
      },
      // The two ends of the first row.
      link: { source: [0], target: [24], arrow: { end: true } },
    });
    const view = graph.plot!.create(ctx);
    const text = added.find((p) => p instanceof TextPrimitive)!;
    const line = added.find((p) => p instanceof LinePrimitive) as LinePrimitive;
    const lineUpdate = vi.spyOn(line, 'update');
    const before = labelsOf(text).length;
    view.update(
      { ...ctx, transform: { scaleX: 4, scaleY: 4, offsetX: 0, offsetY: 0 } },
      { ...NONE, transform: true },
    );
    // The arrowheads follow at once; the labels are those of the previous scale.
    expect(lineUpdate).toHaveBeenCalledTimes(1);
    expect(labelsOf(text)).toHaveLength(before);
    vi.advanceTimersByTime(SETTLE_MS + 1);
    expect(labelsOf(text).length).toBeGreaterThan(before);
    expect(ctx.invalidate).toHaveBeenCalledTimes(1);
    view.dispose?.();
  });

  it('waits for the zoom to settle on a large graph', () => {
    vi.useFakeTimers();
    const n = LARGE + 2;
    const xs = Array.from({ length: n }, (_, i) => (i % 150) * 10);
    const ys = Array.from({ length: n }, (_, i) => Math.floor(i / 150) * 10);
    const { ctx, added } = plotCtx({
      node: { x: xs, y: ys, size: 2, label: xs.map((_, i) => (i < 3 ? `n${i}` : '')) },
      link: { source: [0, 1], target: [1, 2], arrow: { end: true } },
    });
    const view = graph.plot!.create(ctx);
    const line = added.find((p) => p instanceof LinePrimitive) as LinePrimitive;
    const update = vi.spyOn(line, 'update');
    const zoom = (s: number) =>
      view.update(
        { ...ctx, transform: { scaleX: s, scaleY: s, offsetX: 0, offsetY: 0 } },
        { ...NONE, transform: true },
      );
    zoom(2);
    zoom(3);
    // Nothing is rebuilt while the zoom goes on…
    expect(update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SETTLE_MS + 1);
    // …and once, for the last transform, when it stops.
    expect(update).toHaveBeenCalledTimes(1);
    expect(ctx.invalidate).toHaveBeenCalledTimes(1);
    expect(currentLinks(ctx.calc, ctx.trace, 3, 3)).toBeDefined();
    // A pan beyond the label margin of a large graph places labels again.
    const text = added.find((p) => p instanceof TextPrimitive)!;
    const textUpdate = vi.spyOn(text as unknown as { update(d: unknown): void }, 'update');
    view.update(
      { ...ctx, transform: { scaleX: 3, scaleY: 3, offsetX: -400, offsetY: 0 } },
      { ...NONE, transform: true },
    );
    vi.advanceTimersByTime(SETTLE_MS + 1);
    expect(textUpdate).toHaveBeenCalledTimes(1);
    // A pending pass is dropped with the view.
    zoom(5);
    view.dispose?.();
    vi.advanceTimersByTime(SETTLE_MS + 1);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
