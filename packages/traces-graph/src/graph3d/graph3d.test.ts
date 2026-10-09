import { supplyDefaults, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { Viewport, type PickResult, type ViewportRect } from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type DomainTraceEntry,
  type HoverContext,
  type HoverQuery,
  type KeyboardPoint,
  type KeyboardStops,
  type SubplotViewportOptions,
} from '@mk7s/holochart-runtime';
import { acquireScene, sceneComponent, scatter3d } from '@mk7s/holochart-traces-3d';
import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { registerGraphLayout } from '../layout/index.ts';
import { isAcyclic } from '../layout/layered/acyclic.ts';
import type { GraphLayout } from '../layout/types.ts';
import { tracesGraph, tracesGraph3d } from '../index.ts';
import { calcGraph3d, layoutExtremes, type Graph3dCalc } from './calc.ts';
import { planeOutlines, sizeUnit } from './geometry.ts';
import {
  graph3dHoverPoints,
  graph3dLinkPoint,
  graph3dNodePoint,
  PICK_LINKS,
  PICK_TAG,
  pickedPart,
  watchHover,
} from './hover.ts';
import { describeGraph3d, graph3d, graph3dAxisHints } from './index.ts';
import { forceLayout3d, layeredLayout3d } from './layout.ts';
import { fadedColors, linkRender3d, sceneSizeUnit } from './plot.ts';

const registry = createChartRegistry().register(graph3d, scatter3d, sceneComponent);
const AREA: ViewportRect = { x: 0, y: 0, width: 600, height: 400 };

function defaults(data: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  return supplyDefaults(
    {
      data: data.map((t) => ({ type: 'graph3d', ...t })),
      layout: { template: 'none', ...layout },
    },
    registry.core,
  );
}

/** Defaults, calc and the scene layout, as the runtime runs them. */
function build(data: Record<string, unknown>[], layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = defaults(data, layout);
  const entries: DomainTraceEntry<Graph3dCalc>[] = fullData.map((t, index) => ({
    trace: t,
    index,
    calc: calcGraph3d(t, { fullLayout, index, xaxis: undefined, yaxis: undefined }),
    domain: { x: [0, 1], y: [0, 1], rect: AREA },
  }));
  graph3d.crossTraceLayout!(entries, { fullLayout, width: 600, height: 400, plotArea: AREA });
  return { fullLayout, fullData, entries, trace: fullData[0]!, calc: entries[0]!.calc };
}

/** A scene with a real (GL-free) viewport. */
function sceneFor(fullLayout: FullLayout, calc: Graph3dCalc) {
  const host = { invalidate: () => {}, canvasWidth: 600, canvasHeight: 400, pixelRatio: 1 };
  const ctx = {
    fullLayout,
    plotArea: AREA,
    subplotViewport: (_key: string, o: SubplotViewportOptions) =>
      new Viewport(host, { kind: '3d', rect: o.rect, projection: o.projection ?? 'perspective' }),
  };
  return acquireScene(ctx, 'scene', calc.scene)!;
}

/** A ring of `n` nodes with a chord every third node. */
function ring(n: number): { source: number[]; target: number[] } {
  const source: number[] = [];
  const target: number[] = [];
  for (let i = 0; i < n; i++) {
    source.push(i);
    target.push((i + 1) % n);
    if (i % 3 === 0) {
      source.push(i);
      target.push((i + 5) % n);
    }
  }
  return { source, target };
}

const QUERY: HoverQuery = {
  px: 0,
  py: 400,
  xl: 0,
  yl: 400,
  cx: 300,
  cy: 200,
  mode: 'closest',
  distance: 20,
};

const finiteAll = (values: ArrayLike<number>): boolean => Array.from(values).every(Number.isFinite);
const span = (values: ArrayLike<number>): number =>
  Math.max(...Array.from(values)) - Math.min(...Array.from(values));

describe('graph3d defaults', () => {
  it('is a scene trace with groups in the legend, apart from tracesGraph', () => {
    expect(graph3d.categories).toEqual(['gl3d', 'symbols', 'showLegend', 'pie-like']);
    expect(tracesGraph).not.toContain(graph3d);
    expect(tracesGraph3d).toEqual([sceneComponent, graph3d]);
  });

  it("defaults to 'preset' only when every node has x, y and z", () => {
    const link = { source: [0, 1], target: [1, 2] };
    const full = (node: Record<string, unknown>) => defaults([{ node, link }]).fullData[0]!;
    expect(full({ x: [0, 1, 2], y: [0, 1, 0], z: [0, 0, 1] })['arrangement']).toBe('preset');
    expect(full({ x: [0, 1, 2], y: [0, 1, 0] })['arrangement']).toBe('force');
    expect(full({ x: [0, 1, 2], y: [0, 1, 0], z: [0, 0] })['arrangement']).toBe('force');
    expect(full({ label: ['a', 'b', 'c'] })['arrangement']).toBe('force');
    expect(full({ label: ['a', 'b', 'c'] })['scene']).toBe('scene');
  });

  it('coerces the containers of the arrangement in use only', () => {
    const link = { source: [0, 1], target: [1, 2] };
    const force = defaults([{ link, force: { linkdistance: 50, charge: -80, seed: 3 } }])
      .fullData[0]!;
    expect(force['force']).toMatchObject({
      algorithm: 'spring',
      linkdistance: 50,
      charge: -80,
      seed: 3,
      collide: true,
    });
    // The cooling is not animated in a scene.
    expect(force['force']).not.toHaveProperty('simulate');
    expect(graph3d.schema.children.force.children).not.toHaveProperty('simulate');
    expect(force['layered']).toBeUndefined();
    const layered = defaults([{ link, arrangement: 'layered', layered: { axis: 'x' } }])
      .fullData[0]!;
    expect(layered['layered']).toMatchObject({
      axis: 'x',
      ranksep: 80,
      ranker: 'network-simplex',
      showplanes: true,
    });
    // A link at rest spans the distance between two planes.
    expect(layered['force']).toMatchObject({ algorithm: 'spring', linkdistance: 80 });
    const preset = defaults([{ link, node: { x: [0, 1, 2], y: [0, 1, 2], z: [0, 1, 2] } }])
      .fullData[0]!;
    expect(preset['force']).toBeUndefined();
    const fa2 = defaults([{ link, force: { algorithm: 'forceatlas2', charge: -80 } }]).fullData[0]!;
    expect((fa2['force'] as Record<string, unknown>)['charge']).toBeUndefined();
  });

  it('draws spheres and automatic links by default; sprites take a symbol and an outline', () => {
    const link = { source: [0, 1], target: [1, 2] };
    const sphere = defaults([{ link }]).fullData[0]!;
    expect(sphere['node']).toMatchObject({ render: 'sphere', size: 10, textposition: 'auto' });
    expect((sphere['node'] as Record<string, unknown>)['symbol']).toBeUndefined();
    expect(sphere['link']).toMatchObject({ render: 'auto', width: 1 });
    expect(sphere['showlegend']).toBe(false);
    const sprite = defaults([{ link, node: { render: 'sprite', group: ['a', 'b', 'a'] } }])
      .fullData[0]!;
    expect(sprite['node']).toMatchObject({ render: 'sprite', symbol: 'circle' });
    expect((sprite['node'] as { line: unknown }).line).toMatchObject({ width: 1 });
    expect(sprite['showlegend']).toBe(true);
  });

  it("arrowheads are on by default with 'layered' only, and a path follows them", () => {
    const link = { source: [0, 1], target: [1, 2] };
    const arrow = (t: FullTrace) => (t['link'] as { arrow: Record<string, unknown> }).arrow;
    const highlight = (t: FullTrace) => t['highlight'] as Record<string, unknown>;
    const force = defaults([{ link }]).fullData[0]!;
    expect(arrow(force)).toMatchObject({ end: false, start: false, size: 8 });
    expect(highlight(force)['pathdirected']).toBe(false);
    const layered = defaults([{ link, arrangement: 'layered' }]).fullData[0]!;
    expect(arrow(layered)['end']).toBe(true);
    expect(highlight(layered)['pathdirected']).toBe(true);
    const off = defaults([{ arrangement: 'layered', link: { ...link, arrow: { end: false } } }]);
    expect(arrow(off.fullData[0]!)['end']).toBe(false);
    // The description says what the defaults do.
    expect(graph3d.schema.children.link.children.arrow.children.end.description).toContain(
      "`true` with `arrangement: 'layered'`",
    );
  });

  it('takes a curvature for the links, and the highlight of the 2D trace without a selection', () => {
    const link = { source: [0, 1], target: [1, 2], curve: [0.2, -0.1] };
    const t = defaults([{ link, highlight: { mode: 'path', hops: 2, nodes: [1], path: [0, 2] } }])
      .fullData[0]!;
    expect((t['link'] as Record<string, unknown>)['curve']).toEqual([0.2, -0.1]);
    expect(t['highlight']).toMatchObject({
      mode: 'neighbors',
      hops: 2,
      direction: 'both',
      dim: 0.15,
      nodes: [1],
      path: [0, 2],
      pathweight: 'hops',
    });
    expect(
      defaults([{ link, highlight: { mode: 'none' } }]).fullData[0]!['highlight'],
    ).toMatchObject({ mode: 'none' });
    const schema = graph3d.schema.children;
    expect(schema.highlight.children.mode.flags).toEqual(['neighbors']);
    expect(schema.link.children.target.description).toContain('ring');
    expect(schema).not.toHaveProperty('selected');
  });

  it('a trace without nodes is not drawn', () => {
    expect(defaults([{}]).fullData[0]!.visible).toBe(false);
  });

  it('picks tubes for wide links of a small graph', () => {
    const t = (link: Record<string, unknown>) =>
      defaults([{ link: { source: [0], target: [1], ...link } }]).fullData[0]!;
    expect(linkRender3d(t({}), Float32Array.of(1), 1)).toBe('line');
    expect(linkRender3d(t({}), Float32Array.of(1, 4), 2)).toBe('tube');
    expect(linkRender3d(t({}), Float32Array.of(4), 5001)).toBe('line');
    expect(linkRender3d(t({ render: 'tube' }), Float32Array.of(1), 5001)).toBe('tube');
    expect(linkRender3d(t({ render: 'line' }), Float32Array.of(9), 1)).toBe('line');
  });
});

describe('graph3d scene axes', () => {
  const link = { source: [0, 1], target: [1, 2] };
  const axes = (fullLayout: FullLayout) => {
    const scene = fullLayout['scene'] as Record<string, Record<string, unknown>>;
    return [scene['xaxis']!, scene['yaxis']!, scene['zaxis']!];
  };

  it('a computed arrangement hides the axes of its scene; the figure can show them', () => {
    expect(graph3dAxisHints(defaults([{ link }]).fullData[0]!)).toEqual({ hide: true });
    for (const axis of axes(defaults([{ link }]).fullLayout)) expect(axis['visible']).toBe(false);
    const shown = defaults([{ link }], { scene: { zaxis: { visible: true } } }).fullLayout;
    expect(axes(shown).map((a) => a['visible'])).toEqual([false, false, true]);
  });

  it('a scene without axes starts with the camera closer; the figure places it otherwise', () => {
    const eye = (fullLayout: FullLayout) =>
      (fullLayout['scene'] as { camera: { eye: Record<string, number> } }).camera.eye;
    expect(eye(defaults([{ link }]).fullLayout)).toEqual({ x: 0.8, y: 0.8, z: 0.8 });
    const given = { camera: { eye: { x: 2, y: 0.5, z: 1 } } };
    expect(eye(defaults([{ link }], { scene: given }).fullLayout)).toEqual(given.camera.eye);
    // Positions on the axes: Plotly's camera, which leaves room for what is around the box.
    const node = { x: [0, 1, 2], y: [0, 1, 2], z: [0, 1, 2] };
    expect(eye(defaults([{ link, node }]).fullLayout)).toEqual({ x: 1.25, y: 1.25, z: 1.25 });
  });

  it('another trace on the scene shows the axes', () => {
    const { fullLayout } = supplyDefaults(
      {
        data: [
          { type: 'graph3d', link },
          { type: 'scatter3d', x: [0, 1], y: [0, 1], z: [0, 1] },
        ],
        layout: { template: 'none' },
      },
      registry.core,
    );
    for (const axis of axes(fullLayout)) expect(axis['visible']).toBe(true);
  });

  it("'preset' positions are data on the axes, which are shown and typed from them", () => {
    const node = {
      x: ['a', 'b', 'c'],
      y: [1, 10, 100],
      z: ['2026-01-01', '2026-01-02', '2026-01-03'],
    };
    const { fullLayout, fullData } = defaults([{ link, node }]);
    expect(graph3dAxisHints(fullData[0]!)).toEqual(node);
    expect(axes(fullLayout).map((a) => a['type'])).toEqual(['category', 'linear', 'date']);
    expect(axes(fullLayout).map((a) => a['visible'])).toEqual([true, true, true]);
    expect(axes(fullLayout)[0]!['_categories']).toEqual(['a', 'b', 'c']);
    const { calc } = build([{ link, node }]);
    expect(Array.from(calc.x)).toEqual([0, 1, 2]);
    expect(calc.z[1]! - calc.z[0]!).toBe(86400000);
  });
});

describe('graph3d calc', () => {
  it("'preset': the model with z, nodes without a full position hidden, data extents", () => {
    const { calc } = build([
      {
        arrangement: 'preset',
        node: { label: ['a', 'b', 'c', 'd'], x: [0, 4, 4, 0], y: [0, 0, 2, 2], z: [1, 5, 9] },
        link: { source: [0, 1, 2, 3], target: [1, 2, 3, 0] },
      },
    ]);
    expect(calc.model.nodes).toBe(4);
    expect(calc.model.links).toBe(4);
    expect(Array.from(calc.model.degree)).toEqual([2, 2, 2, 2]);
    expect(calc.preset).toBe(true);
    expect(Array.from(calc.z.subarray(0, 3))).toEqual([1, 5, 9]);
    expect(Array.from(calc.hidden)).toEqual([0, 0, 0, 1]);
    expect(Number.isNaN(calc.x[3])).toBe(true);
    expect(calc.sceneExtremes).toEqual({ x: [0, 4], y: [0, 2], z: [1, 9] });
    expect(calc.planes).toBeUndefined();
  });

  it("'force': finite, deterministic, uses the third dimension, keeps pinned nodes", () => {
    const n = 60;
    const x: (number | null)[] = new Array<number | null>(n).fill(null);
    const y = [...x];
    const z = [...x];
    x[0] = 100;
    y[0] = -40;
    z[0] = 70;
    // Held along z only.
    z[1] = -25;
    const data = [{ arrangement: 'force', node: { x, y, z }, link: ring(n) }];
    const { calc, trace } = build(data);
    expect(trace['arrangement']).toBe('force');
    expect(calc.arrangement).toBe('force');
    expect(calc.preset).toBe(false);
    for (const values of [calc.x, calc.y, calc.z]) expect(finiteAll(values)).toBe(true);
    expect(span(calc.z)).toBeGreaterThan(20);
    expect(span(calc.x)).toBeGreaterThan(20);
    expect([calc.x[0], calc.y[0], calc.z[0]]).toEqual([100, -40, 70]);
    expect(calc.z[1]).toBe(-25);
    expect(Array.from(calc.hidden).every((h) => h === 0)).toBe(true);
    const again = build(data).calc;
    expect(Array.from(again.x)).toEqual(Array.from(calc.x));
    expect(Array.from(again.z)).toEqual(Array.from(calc.z));
    // No two nodes overlap (`force.collide`): sizes are in the layout's units.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(
          calc.x[i]! - calc.x[j]!,
          calc.y[i]! - calc.y[j]!,
          calc.z[i]! - calc.z[j]!,
        );
        expect(d).toBeGreaterThanOrEqual(10 - 1e-6);
      }
    }
  });

  it("'force': the trace's options reach the engine", () => {
    const link = ring(40);
    const near = build([{ link, force: { linkdistance: 10 } }]).calc;
    const far = build([{ link, force: { linkdistance: 80 } }]).calc;
    expect(span(far.x)).toBeGreaterThan(2 * span(near.x));
    const flat = forceLayout3d({
      nodes: 3,
      source: Int32Array.of(0, 1),
      target: Int32Array.of(1, 2),
      weight: Float64Array.of(1, 1),
      halfWidth: new Float64Array(3).fill(5),
      halfHeight: new Float64Array(3).fill(5),
      x: new Float64Array(3).fill(NaN),
      y: new Float64Array(3).fill(NaN),
    });
    expect(flat.z).toBeInstanceOf(Float64Array);
  });

  it("'layered': planes hold their coordinate and ranks increase along the links", () => {
    // A diamond with a tail, and a back link that closes a cycle.
    const link = { source: [0, 0, 1, 2, 3, 4, 5, 5], target: [1, 2, 3, 3, 4, 5, 6, 0] };
    const { calc } = build([
      {
        arrangement: 'layered',
        layered: { ranksep: 50 },
        node: { label: 'abcdefg'.split('') },
        link,
      },
    ]);
    const planes = calc.planes!;
    expect(calc.arrangement).toBe('layered');
    expect(planes.axis).toBe(2);
    const ranks = Array.from(planes.rank);
    expect(ranks).toEqual([0, 1, 1, 2, 3, 4, 5]);
    // Planes a `ranksep` apart, centered, the first rank on top.
    expect(Array.from(planes.at)).toEqual([125, 75, 25, -25, -75, -125]);
    for (let i = 0; i < calc.length; i++) expect(calc.z[i]).toBe(planes.at[ranks[i]!]);
    for (const values of [calc.x, calc.y]) expect(finiteAll(values)).toBe(true);
    // The two nodes of rank 1 are apart in their plane.
    expect(Math.hypot(calc.x[1]! - calc.x[2]!, calc.y[1]! - calc.y[2]!)).toBeGreaterThan(10);
    // Every link runs down one rank at least, but the one that was turned to break the cycle.
    const reversed = Array.from(calc.reversed!);
    expect(reversed).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    link.source.forEach((s, k) => {
      const down = ranks[link.target[k]!]! - ranks[s]!;
      if (reversed[k] === 1) expect(down).toBeLessThan(0);
      else expect(down).toBeGreaterThanOrEqual(1);
    });
    expect(
      isAcyclic(7, Int32Array.from(link.source), Int32Array.from(link.target), calc.reversed),
    ).toBe(true);
  });

  it("'layered': another axis, the ranker, and a node pinned in its plane", () => {
    const graph = {
      nodes: 4,
      source: Int32Array.of(0, 1, 0),
      target: Int32Array.of(1, 2, 3),
      weight: Float64Array.of(1, 1, 1),
      halfWidth: new Float64Array(4).fill(5),
      halfHeight: new Float64Array(4).fill(5),
      x: new Float64Array(4).fill(NaN),
      y: Float64Array.of(NaN, NaN, 40, NaN),
      z: Float64Array.of(NaN, NaN, -60, NaN),
    };
    const result = layeredLayout3d(graph, { axis: 0, rankSep: 30, ranker: 'longest-path' });
    expect(Array.from(result.rank)).toEqual([0, 1, 2, 1]);
    expect(Array.from(result.x)).toEqual([30, 0, -30, 0]);
    expect([result.y[2], result.z[2]]).toEqual([40, -60]);
    expect(finiteAll(result.y) && finiteAll(result.z)).toBe(true);
    const { calc } = build([
      { arrangement: 'layered', layered: { axis: 'y' }, link: { source: [0, 1], target: [1, 2] } },
    ]);
    expect(calc.planes!.axis).toBe(1);
    expect(Array.from(calc.y)).toEqual([80, 0, -80]);
  });

  it("'custom': a registered layout places the nodes; without z the graph is flat", () => {
    const helix: GraphLayout<{ pitch: number }> = (g, o) => ({
      x: Float64Array.from({ length: g.nodes }, (_, i) => Math.cos(i)),
      y: Float64Array.from({ length: g.nodes }, (_, i) => Math.sin(i)),
      z: Float64Array.from({ length: g.nodes }, (_, i) => i * o.pitch),
    });
    const off = registerGraphLayout('test-helix', helix);
    const link = { source: [0, 1, 2], target: [1, 2, 3] };
    const { calc } = build([
      { arrangement: 'custom', custom: { name: 'test-helix', options: { pitch: 2 } }, link },
    ]);
    expect(Array.from(calc.z)).toEqual([0, 2, 4, 6]);
    expect(calc.arrangement).toBe('custom');
    off();
    const offFlat = registerGraphLayout('test-flat', (g) => ({
      x: Float64Array.from({ length: g.nodes }, (_, i) => i),
      y: new Float64Array(g.nodes),
    }));
    const flat = build([{ arrangement: 'custom', custom: { name: 'test-flat' }, link }]).calc;
    expect(Array.from(flat.z)).toEqual([0, 0, 0, 0]);
    offFlat();
  });

  it('a group hidden through the legend keeps its place and is not drawn', () => {
    const data = [
      { node: { group: ['a', 'a', 'b', 'b'] }, link: { source: [0, 1, 2], target: [1, 2, 3] } },
    ];
    const shown = build(data).calc;
    const hidden = build(data, { hiddenlabels: ['b'] }).calc;
    expect(Array.from(hidden.hidden)).toEqual([0, 0, 1, 1]);
    expect(hidden.hiddenGroups.has(1)).toBe(true);
    expect(Array.from(hidden.x)).toEqual(Array.from(shown.x));
    expect(hidden.sceneExtremes).toEqual(shown.sceneExtremes);
  });
});

describe('graph3d in the scene', () => {
  it('a computed arrangement gives the scene a cube, so one layout unit is one length', () => {
    expect(
      layoutExtremes(Float64Array.of(0, 100), Float64Array.of(-10, 10), Float64Array.of(5, 5), 4),
    ).toEqual({
      x: [-4, 104],
      y: [-54, 54],
      z: [-49, 59],
    });
    // A layout that fills its box: the cube around a ball that holds its nodes and the points
    // of its box (their gaps are skipped), no larger than the ball around the middle of the box.
    const flat = Float64Array.of(0, 0);
    const held = layoutExtremes(Float64Array.of(-1, 1), flat, flat, 0, {
      x: Float64Array.of(0, NaN),
      y: Float64Array.of(3, NaN),
      z: Float64Array.of(4, NaN),
    });
    const half = (held.x![1] - held.x![0]) / 2;
    expect((held.y![1] - held.y![0]) / 2).toBeCloseTo(half, 12);
    expect((held.z![1] - held.z![0]) / 2).toBeCloseTo(half, 12);
    const middle = [held.x!, held.y!, held.z!].map((e) => (e[0] + e[1]) / 2);
    for (const p of [
      [-1, 0, 0],
      [1, 0, 0],
      [0, 3, 4],
    ]) {
      const d = Math.hypot(p[0]! - middle[0]!, p[1]! - middle[1]!, p[2]! - middle[2]!);
      expect(d).toBeLessThanOrEqual(half + 1e-12);
    }
    // The two farthest points are √26 apart; the box's middle is 5 from the third.
    expect(half).toBeGreaterThanOrEqual(Math.sqrt(26) / 2);
    expect(half).toBeLessThan(5);
    expect(
      layoutExtremes(Float64Array.of(NaN), Float64Array.of(NaN), Float64Array.of(NaN), 4),
    ).toEqual({});
    const { calc, fullLayout } = build([{ link: ring(30) }]);
    const scene = sceneFor(fullLayout, calc);
    expect(scene.layout.aspect.map((a) => Math.round(a * 1e9) / 1e9)).toEqual([1, 1, 1]);
    const t = scene.transform;
    expect(t.scaleY).toBeCloseTo(t.scaleX, 12);
    expect(t.scaleZ).toBeCloseTo(t.scaleX, 12);
    // Every node is inside the scene's box, the longest side of the layout filling most of it.
    let reach = 0;
    for (let i = 0; i < calc.length; i++) {
      const w = scene.toWorld(calc.x[i]!, calc.y[i]!, calc.z[i]!);
      reach = Math.max(reach, Math.abs(w[0]), Math.abs(w[1]), Math.abs(w[2]));
    }
    expect(reach).toBeLessThanOrEqual(0.5);
    expect(reach).toBeGreaterThan(0.35);
    // The planes of a layered arrangement, corners and all, are inside the ball inscribed in it.
    const layered = build([{ link: ring(30), arrangement: 'layered' }]);
    const box = sceneFor(layered.fullLayout, layered.calc);
    const outlines = planeOutlines(layered.calc, layered.calc.planes!)!;
    let corner = 0;
    for (let i = 0; i < outlines.x.length; i++) {
      if (Number.isNaN(outlines.x[i]!)) continue;
      const w = box.toWorld(outlines.x[i]!, outlines.y[i]!, outlines.z[i]!);
      corner = Math.max(corner, Math.hypot(w[0], w[1], w[2]));
    }
    expect(corner).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(corner).toBeGreaterThan(0.4);
  });

  it('sizes are px at the middle of the scene in its first view', () => {
    expect(sizeUnit(1.8, 450)).toBe(0.004);
    expect(sizeUnit(0, 450)).toBe(0);
    const { calc, fullLayout } = build([{ link: ring(30) }]);
    const scene = sceneFor(fullLayout, calc);
    const unit = sceneSizeUnit(scene);
    // Two points 10 units apart across the view, at the scene's center, are 10 px apart.
    const right = scene.viewport.camera.matrixWorld.elements;
    const a = scene.project(0, 0, 0);
    const b = scene.project(right[0]! * 10 * unit, right[1]! * 10 * unit, right[2]! * 10 * unit);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(10, 6);
    // The first view's camera counts: moving the live camera closer does not change the unit.
    scene.setCamera({ ...scene.camera, eye: [0.5, 0.5, 0.5] });
    expect(sceneSizeUnit(scene)).toBe(unit);
    const ortho = build([{ link: ring(30) }], {
      scene: { camera: { projection: { type: 'orthographic' } } },
    });
    expect(sceneSizeUnit(sceneFor(ortho.fullLayout, ortho.calc))).toBeCloseTo(2 / 400, 12);
  });
});

describe('graph3d hover', () => {
  const data = [
    {
      name: 'net',
      node: {
        label: ['A', 'B', 'C'],
        group: ['g1', 'g1', 'g2'],
        x: [0, 2, 2],
        y: [0, 0, 2],
        z: [0, 1, 2],
        customdata: ['ca', 'cb', 'cc'],
      },
      link: {
        source: [0, 1],
        target: [1, 2],
        value: [5, 1.5],
        label: ['ab', ''],
        arrow: { end: true },
      },
    },
  ];

  function hovering(extra: Record<string, unknown> = {}) {
    const merged = [{ ...data[0]!, ...extra }];
    const built = build(merged);
    const scene = sceneFor(built.fullLayout, built.calc);
    const pick = { scene, hits: [], query: QUERY };
    return { ...built, scene, pick };
  }

  it('a node point carries the 2D fields, z, and the built label', () => {
    const { calc, trace, fullLayout, pick, scene } = hovering();
    const p = graph3dNodePoint(pick, calc, trace, 1, fullLayout, 2)!;
    expect(p).toMatchObject({ pointIndex: 1, kind: 'node', distance: 2, x: 2, y: 0 });
    expect(p.fields).toMatchObject({
      kind: 'node',
      index: 1,
      label: 'B',
      degree: 2,
      indegree: 1,
      outdegree: 1,
      group: 'g1',
      size: 10,
      customdata: 'cb',
      z: 1,
    });
    expect(p.hoverText).toBe('B<br>Links in: 1, out: 1<br>Group: g1');
    // Anchored where the node is drawn: its projection, in overlay px (y up).
    const w = scene.toWorld(2, 0, 1);
    const s = scene.project(w[0], w[1], w[2]);
    expect(p.px).toBeCloseTo(s.x - QUERY.cx!, 6);
    expect(p.py).toBeCloseTo(400 - (s.y - QUERY.cy!), 6);
    expect(typeof p.color).toBe('string');
  });

  it('templates know the 2D variables and the positions', () => {
    const { calc, trace, fullLayout, pick } = hovering({
      node: {
        ...data[0]!.node,
        hovertemplate:
          '%{label} d=%{degree} g=%{group} (%{x}, %{y}, %{z}) %{customdata}<extra>%{indegree}</extra>',
      },
      link: {
        ...data[0]!.link,
        hovertemplate: '%{source.label}>%{target.label} %{value} %{label}',
      },
    });
    const node = graph3dNodePoint(pick, calc, trace, 2, fullLayout)!;
    expect(node.hoverText).toBe('C d=1 g=g2 (2, 2, 2) cc');
    expect(node.extra).toBe('1');
    expect(graph3dLinkPoint(pick, calc, trace, 0)!.hoverText).toBe('A>B 5 ab');
  });

  it('a link point names its ends and its value, at its middle', () => {
    const { calc, trace, pick, scene } = hovering();
    const p = graph3dLinkPoint(pick, calc, trace, 1, 0)!;
    expect(p).toMatchObject({ pointIndex: 1, kind: 'link', distance: 0 });
    expect(p.fields).toMatchObject({
      kind: 'link',
      index: 1,
      value: 1.5,
      source: { index: 1, label: 'B' },
      target: { index: 2, label: 'C' },
    });
    expect(p.hoverText).toBe('B → C<br>Value: 1.5');
    const w = scene.toWorld(2, 1, 1.5);
    expect(p.px).toBeCloseTo(scene.project(w[0], w[1], w[2]).x - QUERY.cx!, 6);
  });

  it('a computed arrangement reports no positions', () => {
    const built = build([
      { link: { source: [0, 1], target: [1, 2] }, node: { label: ['A', 'B', 'C'] } },
    ]);
    const scene = sceneFor(built.fullLayout, built.calc);
    const p = graph3dNodePoint(
      { scene, hits: [], query: QUERY },
      built.calc,
      built.trace,
      0,
      built.fullLayout,
    )!;
    expect(p.x).toBeUndefined();
    expect(p.fields).not.toHaveProperty('z');
    expect(p.hoverText).toBe('A<br>Links: 1');
  });

  it('the nearest hit wins, a node over a link as near', () => {
    const tagged = (tag: string, links?: Int32Array): Object3D => {
      const o = new Object3D();
      o.userData[PICK_TAG] = tag;
      if (links) o.userData[PICK_LINKS] = links;
      return o;
    };
    const nodes = tagged('nodes');
    const links = tagged('links', Int32Array.of(0, 0, 0, 1, 1, 1));
    const hit = (object: Object3D, pointIndex: number, distance: number): PickResult => ({
      traceIndex: 0,
      pointIndex,
      distance,
      kind: 'point',
      object,
    });
    expect(pickedPart([hit(links, 4, 0), hit(nodes, 2, 3)], true, true)).toEqual({
      kind: 'link',
      index: 1,
      distance: 0,
    });
    expect(pickedPart([hit(links, 4, 0), hit(nodes, 2, 0)], true, true)).toEqual({
      kind: 'node',
      index: 2,
      distance: 0,
    });
    expect(pickedPart([hit(links, 4, 0), hit(nodes, 2, 3)], true, false)).toEqual({
      kind: 'node',
      index: 2,
      distance: 3,
    });
    expect(pickedPart([hit(links, 4, 0), hit(nodes, 2, 3)], false, false)).toBeUndefined();
    expect(pickedPart([hit(new Object3D(), 4, 0)], true, true)).toBeUndefined();
  });

  it('tells the view what the pointer is over, on hovers that have a place on screen', () => {
    const { calc, trace, fullLayout, scene } = hovering();
    const ctx = { fullLayout } as HoverContext;
    const seen: unknown[] = [];
    watchHover(calc, (hit) => seen.push(hit));
    // Nothing is picked without a renderer: the view is told that nothing is hovered.
    expect(graph3dHoverPoints(calc, trace, QUERY, ctx)).toEqual([]);
    expect(seen).toEqual([undefined]);
    // A point looked up by its index has no place on screen: not a hover.
    const { cx: _cx, cy: _cy, ...lookup } = QUERY;
    graph3dHoverPoints(calc, trace, lookup, ctx);
    expect(seen).toEqual([undefined]);
    expect(scene).toBeDefined();
  });

  it('what a highlight leaves out is faded toward the background, its alpha kept', () => {
    const colors = Float32Array.of(1, 0, 0, 1, 0, 0, 1, 0.5);
    const faded = fadedColors(colors, 2, Uint8Array.of(1, 0), 0.25, [1, 1, 1, 1]);
    expect(Array.from(faded)).toEqual([1, 0, 0, 1, 0.75, 0.75, 1, 0.5]);
    // One color for all.
    expect(
      Array.from(fadedColors([0, 0, 0, 1], 2, Uint8Array.of(0, 1), 0.5, [1, 1, 1, 1])),
    ).toEqual([0.5, 0.5, 0.5, 1, 0, 0, 0, 1]);
  });

  it('hoverinfo: none keeps the events, skip leaves the part out', () => {
    const none = hovering({ hoverinfo: 'none' });
    expect(graph3dNodePoint(none.pick, none.calc, none.trace, 0, none.fullLayout)!.hoverText).toBe(
      '',
    );
    const skip = hovering({ hoverinfo: 'skip' });
    const ctx = { fullLayout: skip.fullLayout } as HoverContext;
    expect(graph3dHoverPoints(skip.calc, skip.trace, QUERY, ctx)).toEqual([]);
  });

  /** The stops of the trace, from the package's accessibility chunk. */
  async function stopsOf(built: {
    calc: Graph3dCalc;
    trace: FullTrace;
    fullLayout: FullLayout;
  }): Promise<KeyboardStops | undefined> {
    const parts = (await graph3d.a11y!())['graph3d']!;
    const ctx = { fullLayout: built.fullLayout, height: 400 } as HoverContext;
    return parts.keyboardPoints!(built.calc as never, built.trace, ctx);
  }
  const fieldsOf = (p: KeyboardPoint) =>
    p.fields as { label: string; source?: { label: string }; target?: { label: string } };
  /** `B` for a node, `A>B` for a link from its source to its target. */
  const what = (p: KeyboardPoint): string =>
    p.kind === 'link'
      ? `${fieldsOf(p).source!.label}>${fieldsOf(p).target!.label}`
      : fieldsOf(p).label;

  it('keyboard stops are the drawn nodes, anchored where they are drawn, then their links', async () => {
    const built = hovering();
    const stops = (await stopsOf(built))!;
    const all = Array.from({ length: stops.length }, (_, i) => stops.at(i)!);
    // A → B → C: B's links are in the order of the nodes at their other ends.
    expect(all.map(what)).toEqual(['A', 'B', 'C', 'A>B', 'A>B', 'B>C', 'B>C']);
    expect(all[2]!.hoverText).toContain('C');
    const w = built.scene.toWorld(2, 2, 2);
    const s = built.scene.project(w[0], w[1], w[2]);
    expect(all[2]!.px).toBeCloseTo(s.x, 6);
    expect(all[2]!.py).toBeCloseTo(400 - s.y, 6);
    // ←, →, ↑, ↓, Home (the most-connected node), End.
    expect(all[0]!.nav).toEqual([0, 1, 0, 3, 1, 2]);
    expect(all[1]!.nav).toEqual([0, 2, 1, 4, 1, 2]);
    // B's two links turn around it; ↓ follows one, ↑ goes back to B.
    expect(all[4]!.nav).toEqual([5, 5, 1, 0, 4, 5]);
    expect(all[5]!.nav).toEqual([4, 4, 1, 2, 4, 5]);
    expect(all[1]!.say).toEqual([
      '{name}: {text}, node {n} of {count}. Down: {down}.',
      { n: '2', count: '3', down: 'A → B' },
    ]);
    expect(all[5]!.say).toEqual([
      '{name}: {text}, link {n} of {count} of {node}. Down: {down}.',
      { n: '2', count: '2', node: 'B', down: 'C' },
    ]);
  });

  it('keyboard stops skip what is not drawn, and there are none with hover skipped', async () => {
    const hidden = hovering();
    const calc = { ...hidden.calc, hidden: Uint8Array.of(0, 1, 0) };
    const stops = (await stopsOf({ ...hidden, calc }))!;
    expect(stops.length).toBe(2);
    expect(stops.at(1)).toMatchObject({ pointIndex: 2, kind: 'node' });
    expect(await stopsOf(hovering({ hoverinfo: 'skip' }))).toBeUndefined();
  });

  it('keyboard stops of a layered graph follow its planes', async () => {
    const built = build([
      {
        arrangement: 'layered',
        node: { label: ['A', 'B', 'C', 'D'] },
        link: { source: [0, 0, 1, 2], target: [1, 2, 3, 3], arrow: { end: true } },
      },
    ]);
    sceneFor(built.fullLayout, built.calc);
    const stops = (await stopsOf(built))!;
    const all = Array.from({ length: stops.length }, (_, i) => stops.at(i)!);
    expect(Array.from(built.calc.planes!.rank)).toEqual([0, 1, 1, 2]);
    expect(all.map(what)).toEqual(['A', 'B', 'C', 'D']);
    // B and C share a plane, in index order; ↑ and ↓ follow the links between the planes.
    expect(all[0]!.nav).toEqual([0, 0, 0, 1, 0, 0]);
    expect(all[1]!.nav).toEqual([1, 2, 0, 3, 1, 2]);
    expect(all[2]!.nav).toEqual([1, 2, 0, 3, 1, 2]);
    // Of D's two parents, the one nearer in space (the lower index on a tie).
    const { x, y, z } = built.calc;
    const far = (i: number): number => Math.hypot(x[i]! - x[3]!, y[i]! - y[3]!, z[i]! - z[3]!);
    expect(all[3]!.nav).toEqual([3, 3, far(2) < far(1) ? 2 : 1, 3, 3, 3]);
    expect(all[2]!.say).toEqual([
      '{name}: {text}, rank {rank} of {ranks}, {n} of {count}. Up: {up}. Down: {down}.',
      { rank: '2', ranks: '3', n: '2', count: '2', up: 'A', down: 'D' },
    ]);
  });

  it("the trace's accessibility parts have its stops and the view keys of its scene", async () => {
    const parts = await graph3d.a11y!();
    expect(Object.keys(parts)).toEqual(['graph3d']);
    expect(parts['graph3d']!.keyboardPoints).toBeTypeOf('function');
    expect(parts['graph3d']!.keyboardView).toBeTypeOf('function');
    expect(graph3d.keyboardPoints).toBeUndefined();
  });

  it('describes the graph as a 3D one', () => {
    const { calc, trace, fullLayout, fullData } = hovering();
    const d = describeGraph3d({
      trace,
      calc,
      index: 0,
      fullLayout,
      fullData,
      maxRows: 100,
    } as never);
    expect(d.kind).toBe('3D network graph');
    expect(d.summary).toBe(
      '3D directed network graph "net": 3 nodes, 2 links, 2 groups, at given positions. ' +
        'All nodes are connected; most connected: B (2 links), A (1), C (1). ' +
        'Groups: g1 (2 nodes), g2 (1).',
    );
    // The edge list is the 2D trace's.
    expect(d.table).toMatchObject({
      columns: ['Source', 'Target', 'Value', 'Label'],
      rows: [
        ['A', 'B', '5', 'ab'],
        ['B', 'C', '1.5', ''],
      ],
    });
    const layered = build([
      {
        arrangement: 'layered',
        layered: { axis: 'x' },
        link: { source: [0, 1, 2], target: [1, 2, 0], arrow: { end: true } },
      },
    ]);
    expect(describeGraph3d({ ...layered, index: 0 } as never).summary).toContain(
      '3 nodes, 3 links, layered along x in 3 ranks, 1 link reversed to break cycles.',
    );
  });

  it("legend items and the colorbar are the 2D trace's", () => {
    const { calc, trace, fullLayout } = hovering();
    const items = graph3d.legendItems!(calc, trace as FullTrace, { fullLayout })!;
    expect(items.map((i) => i.name)).toEqual(['g1', 'g2']);
    const scaled = build([
      { node: { color: [1, 2, 3], showscale: true }, link: { source: [0, 1], target: [1, 2] } },
    ]);
    expect(graph3d.colorbar!(scaled.trace, { fullLayout: scaled.fullLayout })).not.toBeNull();
  });
});
