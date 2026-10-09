import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import type { GraphCalc } from './calc.ts';
import {
  emphasizedOrder,
  givenEmphasis,
  graphPath,
  HIGHLIGHT_MAX,
  highlightOptions,
  hoverEmphasis,
  hoverHighlights,
  modelPath,
  neighborsOf,
  pathEmphasis,
  pathEnds,
  pathInfo,
  type Emphasis,
} from './highlight.ts';
import { graphEventData, graphHoverPoints, nodeFields } from './hover.ts';
import { graph } from './index.ts';
import { linkColors, nodeBoxStyle, nodeMarkerStyle, nodeOpacities } from './style.ts';

const registry = createChartRegistry().register(graph);

function build(input: Record<string, unknown>): { trace: FullTrace; calc: GraphCalc } {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'graph', ...input }], layout: { template: 'none' } },
    registry.core,
    { onIssue: () => {} },
  );
  const axis = { scale: createScale({ type: 'linear' }), type: 'linear', full: {} };
  const ctx: CalcContext = {
    fullLayout,
    index: 0,
    xaxis: axis as unknown as AxisInfo,
    yaxis: axis as unknown as AxisInfo,
  };
  const trace = fullData[0] as FullTrace;
  return { trace, calc: graph.calc!(trace, ctx) };
}

const flags = (mask: Uint8Array): number[] => {
  const out: number[] = [];
  mask.forEach((v, i) => v === 1 && out.push(i));
  return out;
};

/**
 * Six nodes at given positions: a chain 0 → 1 → 2 → 3, a shortcut 0 → 3 of value 9, and a pair
 * 4 → 5 apart from them. A link to a node that does not exist is dropped, so the trace's link
 * indices and the model's differ from there on (link 3 is dropped; 4 and 5 are kept as 3 and 4).
 */
const NET = {
  node: { x: [0, 1, 2, 3, 0, 1], y: [0, 0, 0, 0, 2, 2], label: ['a', 'b', 'c', 'd', 'e', 'f'] },
  link: {
    source: [0, 1, 2, 0, 0, 4],
    target: [1, 2, 3, 99, 3, 5],
    value: [1, 1, 1, 1, 9, 1],
  },
};

describe('the highlight attributes', () => {
  it('default to one hop either way, both kinds of highlight on', () => {
    const { trace } = build(NET);
    expect(trace['highlight']).toEqual({
      mode: 'neighbors+path',
      hops: 1,
      direction: 'both',
      dim: 0.15,
      pathweight: 'hops',
      pathdirected: false,
    });
    expect(highlightOptions(trace)).toEqual({
      neighbors: true,
      selectedPath: true,
      hops: 1,
      direction: 'both',
      dim: 0.15,
      color: null,
      nodes: [],
      path: undefined,
      weighted: false,
      directed: false,
    });
  });

  it('follow the direction of the links by default when they have arrowheads', () => {
    const { trace } = build({ ...NET, link: { ...NET.link, arrow: { end: true } } });
    expect(highlightOptions(trace).directed).toBe(true);
    const off = build({
      ...NET,
      link: { ...NET.link, arrow: { end: true } },
      highlight: { pathdirected: false },
    });
    expect(highlightOptions(off.trace).directed).toBe(false);
  });

  it('are read as given', () => {
    const { trace } = build({
      ...NET,
      highlight: {
        mode: 'path',
        hops: 3,
        direction: 'out',
        dim: 0.4,
        color: '#ff0000',
        path: [0, 3],
        pathweight: 'value',
        pathdirected: true,
      },
    });
    expect(highlightOptions(trace)).toEqual({
      neighbors: false,
      selectedPath: true,
      hops: 3,
      direction: 'out',
      dim: 0.4,
      color: [1, 0, 0, 1],
      nodes: [],
      path: [0, 3],
      weighted: true,
      directed: true,
    });
    expect(highlightOptions(build({ ...NET, highlight: { mode: 'none' } }).trace)).toMatchObject({
      neighbors: false,
      selectedPath: false,
    });
  });
});

describe('what a hover emphasizes', () => {
  it('a node: itself, its links and its neighbours', () => {
    const { trace, calc } = build(NET);
    const e = hoverEmphasis(calc.model, { kind: 'node', i: 0 }, highlightOptions(trace))!;
    expect(flags(e.node)).toEqual([0, 1, 3]);
    // Model positions: the link 0 → 1 and the shortcut 0 → 3.
    expect(flags(e.link)).toEqual([0, 3]);
    expect(e.dim).toBe(0.15);
    expect(e.color).toBeNull();
    expect(e.focus).toEqual([0]);
  });

  it('reaches as far as `hops`, along `direction`', () => {
    const two = build({ ...NET, highlight: { hops: 2 } });
    const far = hoverEmphasis(two.calc.model, { kind: 'node', i: 1 }, highlightOptions(two.trace))!;
    expect(flags(far.node)).toEqual([0, 1, 2, 3]);
    expect(flags(far.link)).toEqual([0, 1, 2, 3]);
    const out = build({ ...NET, highlight: { hops: 5, direction: 'out' } });
    const down = hoverEmphasis(
      out.calc.model,
      { kind: 'node', i: 1 },
      highlightOptions(out.trace),
    )!;
    expect(flags(down.node)).toEqual([1, 2, 3]);
    expect(flags(down.link)).toEqual([1, 2]);
    const into = build({ ...NET, highlight: { hops: 5, direction: 'in' } });
    const up = hoverEmphasis(
      into.calc.model,
      { kind: 'node', i: 3 },
      highlightOptions(into.trace),
    )!;
    expect(flags(up.node)).toEqual([0, 1, 2, 3]);
  });

  it('a link: itself and its two ends', () => {
    const { trace, calc } = build(NET);
    const e = hoverEmphasis(calc.model, { kind: 'link', k: 4 }, highlightOptions(trace))!;
    expect(flags(e.node)).toEqual([4, 5]);
    expect(flags(e.link)).toEqual([4]);
  });

  it('nothing without a hover, with the mode off, or for what is not there', () => {
    const { trace, calc } = build(NET);
    const options = highlightOptions(trace);
    expect(hoverEmphasis(calc.model, undefined, options)).toBeUndefined();
    expect(hoverEmphasis(calc.model, { kind: 'node', i: 77 }, options)).toBeUndefined();
    expect(hoverEmphasis(calc.model, { kind: 'link', k: 77 }, options)).toBeUndefined();
    const off = build({ ...NET, highlight: { mode: 'path' } });
    expect(
      hoverEmphasis(off.calc.model, { kind: 'node', i: 0 }, highlightOptions(off.trace)),
    ).toBeUndefined();
  });

  it('does not pass through nodes that are not drawn', () => {
    const { trace, calc } = build({ ...NET, highlight: { hops: 3 } });
    const hidden = Uint8Array.from([0, 0, 1, 0, 0, 0]);
    const e = hoverEmphasis(calc.model, { kind: 'node', i: 1 }, highlightOptions(trace), {
      hidden,
    })!;
    expect(flags(e.node)).toEqual([0, 1, 3]);
  });

  it('`highlight.nodes` gives the same without a pointer, whatever the mode', () => {
    const { trace, calc } = build({
      ...NET,
      highlight: { nodes: [4, 0, 2.5, -1, 'x'], mode: 'none' },
    });
    const options = highlightOptions(trace);
    expect(options.nodes).toEqual([4, 0]);
    const e = givenEmphasis(calc.model, options)!;
    expect(flags(e.node)).toEqual([0, 1, 3, 4, 5]);
    expect(flags(e.link)).toEqual([0, 3, 4]);
    expect(e.focus).toEqual([4, 0]);
    // Nodes that are not there are no seeds.
    const hidden = Uint8Array.from([1, 0, 0, 0, 0, 0]);
    expect(flags(givenEmphasis(calc.model, options, { hidden })!.node)).toEqual([4, 5]);
    expect(givenEmphasis(calc.model, highlightOptions(build(NET).trace))).toBeUndefined();
    const far = build({ ...NET, highlight: { nodes: [99] } });
    expect(givenEmphasis(far.calc.model, highlightOptions(far.trace))).toBeUndefined();
  });

  it('is skipped above the size limit', () => {
    const { trace, calc } = build(NET);
    const options = highlightOptions(trace);
    expect(hoverHighlights(calc.model, options)).toBe(true);
    const huge = { ...calc.model, nodes: HIGHLIGHT_MAX, links: 1 };
    expect(hoverHighlights(huge, options)).toBe(false);
    expect(hoverEmphasis(huge, { kind: 'node', i: 0 }, options)).toBeUndefined();
  });
});

describe('the highlighted path', () => {
  it('is asked for by `highlight.path`, else by a selection of exactly two nodes', () => {
    const { trace } = build(NET);
    const options = highlightOptions(trace);
    expect(pathEnds(options, null)).toBeUndefined();
    expect(pathEnds(options, [3])).toBeUndefined();
    expect(pathEnds(options, [3, 0])).toEqual({ from: 0, to: 3, either: true });
    expect(pathEnds(options, [0, 1, 3])).toBeUndefined();
    const given = highlightOptions(build({ ...NET, highlight: { path: [3, 0] } }).trace);
    expect(pathEnds(given, [4, 5])).toEqual({ from: 3, to: 0, either: false });
    const off = highlightOptions(build({ ...NET, highlight: { mode: 'neighbors' } }).trace);
    expect(pathEnds(off, [0, 3])).toBeUndefined();
  });

  it('has the fewest links, or the least value', () => {
    const hops = build(NET);
    const short = modelPath(hops.calc.model, highlightOptions(hops.trace), [0, 3])!;
    expect(short).toEqual({ nodes: [0, 3], links: [3], length: 1 });
    // The trace's own index of that link is 4: link 3 was dropped.
    expect(pathInfo(hops.calc.model, short)).toEqual({ nodes: [0, 3], links: [4], length: 1 });
    const value = build({ ...NET, highlight: { pathweight: 'value' } });
    expect(modelPath(value.calc.model, highlightOptions(value.trace), [0, 3])).toEqual({
      nodes: [0, 1, 2, 3],
      links: [0, 1, 2],
      length: 3,
    });
  });

  it('follows the links when directed; a selection is tried both ways, `highlight.path` not', () => {
    const selected = build({ ...NET, highlight: { pathdirected: true } });
    const options = highlightOptions(selected.trace);
    // 1 → 2 → 3 exists; nothing leads from 3 to 1.
    expect(modelPath(selected.calc.model, options, [3, 1])?.nodes).toEqual([1, 2, 3]);
    const back = build({ ...NET, highlight: { pathdirected: true, path: [3, 1] } });
    expect(modelPath(back.calc.model, highlightOptions(back.trace), null)).toBeUndefined();
    const forth = build({ ...NET, highlight: { pathdirected: true, path: [1, 3] } });
    expect(modelPath(forth.calc.model, highlightOptions(forth.trace), null)?.nodes).toEqual([
      1, 2, 3,
    ]);
  });

  it('is undefined between nodes that are not linked', () => {
    const { trace, calc } = build(NET);
    expect(modelPath(calc.model, highlightOptions(trace), [0, 5])).toBeUndefined();
  });

  it('emphasizes its nodes and links', () => {
    const { trace, calc } = build({ ...NET, highlight: { pathweight: 'value', color: 'blue' } });
    const options = highlightOptions(trace);
    const e = pathEmphasis(calc.model, modelPath(calc.model, options, [0, 3])!, options);
    expect(flags(e.node)).toEqual([0, 1, 2, 3]);
    expect(flags(e.link)).toEqual([0, 1, 2]);
    expect(e.color).toEqual([0, 0, 1, 1]);
  });

  it('is read from a defaulted trace with `graphPath`', () => {
    const { trace } = build(NET);
    expect(graphPath(trace)).toBeUndefined();
    expect(graphPath({ ...trace, selectedpoints: [3, 0] })).toEqual({
      nodes: [0, 3],
      links: [4],
      length: 1,
    });
    expect(graphPath({ ...trace, selectedpoints: [0, 5] })).toBeUndefined();
    const given = build({ ...NET, highlight: { path: [0, 2], pathweight: 'value' } }).trace;
    expect(graphPath(given)).toEqual({ nodes: [0, 1, 2], links: [0, 1], length: 2 });
    // Whatever is selected.
    expect(graphPath({ ...given, selectedpoints: [4, 5] })?.nodes).toEqual([0, 1, 2]);
    expect(graphPath({ type: 'scatter' })).toBeUndefined();
  });
});

describe('styles under an emphasis', () => {
  const emphasis = (calc: GraphCalc, nodes: number[], links: number[]): Emphasis => {
    const node = new Uint8Array(calc.model.nodes);
    const link = new Uint8Array(calc.model.links);
    for (const i of nodes) node[i] = 1;
    for (const k of links) link[k] = 1;
    return { node, link, dim: 0.25, color: null };
  };

  it('dims the nodes outside it and leaves the others as they are', () => {
    const { trace, calc } = build({ ...NET, node: { ...NET.node, opacity: 0.8 } });
    const e = emphasis(calc, [0, 1], [0]);
    const opacity = nodeOpacities(trace, calc.length, undefined, undefined, e) as Float32Array;
    expect(Array.from(opacity, (v) => +v.toFixed(3))).toEqual([0.8, 0.8, 0.2, 0.2, 0.2, 0.2]);
    const style = nodeMarkerStyle(calc, trace, undefined, null, undefined, e);
    expect(Array.from(style.opacity as Float32Array, (v) => +v.toFixed(3))).toEqual([
      0.8, 0.8, 0.2, 0.2, 0.2, 0.2,
    ]);
    // Without one: a single opacity for all.
    expect(nodeMarkerStyle(calc, trace, undefined).opacity).toBeCloseTo(0.8, 6);
  });

  it('takes the place of the dimming of a selection', () => {
    const { trace, calc } = build(NET);
    const selected = Uint8Array.from([1, 0, 0, 1, 0, 0]);
    const plain = nodeOpacities(trace, calc.length, selected) as Float32Array;
    expect(Array.from(plain, (v) => +v.toFixed(2))).toEqual([1, 0.2, 0.2, 1, 0.2, 0.2]);
    // A path 0 – 1 – 2 – 3 between the two selected nodes: its inner nodes show in full.
    const e = emphasis(calc, [0, 1, 2, 3], [0, 1, 2]);
    const path = nodeOpacities(trace, calc.length, selected, undefined, e) as Float32Array;
    expect(Array.from(path, (v) => +v.toFixed(2))).toEqual([1, 1, 1, 1, 0.25, 0.25]);
    // `selected.node.opacity` still marks the selected ones among them.
    const styled = build({ ...NET, selected: { node: { opacity: 0.6 } } });
    const marked = nodeOpacities(styled.trace, 6, selected, undefined, e) as Float32Array;
    expect(Array.from(marked, (v) => +v.toFixed(2))).toEqual([0.6, 1, 1, 0.6, 0.25, 0.25]);
  });

  it('draws its links opaque and dims the others', () => {
    const { trace, calc } = build({
      ...NET,
      link: { ...NET.link, color: 'rgba(10, 20, 30, 0.4)' },
    });
    const plain = linkColors(calc, trace);
    expect(plain).not.toBeInstanceOf(Float32Array);
    const colors = linkColors(
      calc,
      trace,
      null,
      undefined,
      emphasis(calc, [0, 1], [0]),
    ) as Float32Array;
    expect(colors).toHaveLength(4 * calc.model.links);
    expect(colors[3]).toBeCloseTo(1, 6);
    expect(colors[0]).toBeCloseTo(10 / 255, 6);
    for (let k = 1; k < calc.model.links; k++) expect(colors[4 * k + 3]).toBeCloseTo(0.4 * 0.25, 6);
  });

  it('draws its links in `highlight.color` when there is one', () => {
    const { trace, calc } = build(NET);
    const e = { ...emphasis(calc, [4, 5], [4]), color: [1, 0.5, 0, 1] as const };
    const colors = linkColors(calc, trace, null, undefined, e) as Float32Array;
    expect(Array.from(colors.subarray(16, 20), (v) => +v.toFixed(3))).toEqual([1, 0.5, 0, 1]);
  });

  it('ignores the selection for links: only the emphasis counts', () => {
    const { trace, calc } = build(NET);
    const e = emphasis(calc, [0, 1, 2, 3], [0, 1, 2]);
    const colors = linkColors(calc, trace, [0, 3], undefined, e) as Float32Array;
    // The link 1 → 2 joins no two selected nodes and is on the path: in full.
    expect(colors[4 + 3]).toBeCloseTo(1, 6);
    // The shortcut 0 → 3 joins the two selected nodes and is not on the path: dimmed.
    const base = linkColors(calc, trace) as readonly number[];
    expect(colors[12 + 3]).toBeCloseTo(base[3]! * 0.25, 6);
  });

  it('dims boxes through their colors, and frames the pinned ones', () => {
    const { trace, calc } = build({ ...NET, node: { ...NET.node, shape: 'box' } });
    const e = emphasis(calc, [0], []);
    const style = nodeBoxStyle(calc, trace, undefined, null, undefined, e);
    const fill = style.fill as Float32Array;
    expect(fill[3]).toBeCloseTo(1, 6);
    expect(fill[7]).toBeCloseTo(0.25, 6);
    const framed = nodeBoxStyle(
      calc,
      trace,
      undefined,
      null,
      undefined,
      undefined,
      Uint8Array.from([0, 1, 0, 0, 0, 0]),
    );
    const widths = framed.borderWidth as Float32Array;
    expect(widths[1]).toBeGreaterThanOrEqual(2);
    expect(widths[0]).toBeLessThan(widths[1]!);
  });

  it('orders the labels of its nodes: those it is about first, then by priority', () => {
    const order = Uint32Array.from([3, 0, 2, 1, 4]);
    const lit = Uint8Array.from([0, 1, 0, 1, 1]);
    expect(emphasizedOrder(order, { node: lit })).toEqual([3, 1, 4]);
    expect(emphasizedOrder(order, { node: lit, focus: [4] })).toEqual([4, 3, 1]);
    // A node it is about that is not in it (hidden), or named twice, is not placed twice.
    expect(emphasizedOrder(order, { node: lit, focus: [0, 4, 4, 99] })).toEqual([4, 3, 1]);
  });
});

describe('what templates and events know', () => {
  it('a node says how many nodes it is linked to', () => {
    const { trace, calc } = build({
      node: { label: ['a', 'b', 'c'], x: [0, 1, 2], y: [0, 0, 0] },
      link: { source: [0, 0, 1, 0], target: [1, 1, 0, 0] },
    });
    expect(Array.from(neighborsOf(calc.model))).toEqual([1, 1, 0]);
    expect(nodeFields(calc, trace, 0)).toMatchObject({ degree: 5, neighbors: 1 });
    expect(nodeFields(calc, trace, 2)).toMatchObject({ degree: 0, neighbors: 0 });
  });

  it('`%{neighbors}` fills a node hovertemplate', () => {
    const { trace, calc } = build({
      ...NET,
      node: { ...NET.node, hovertemplate: '%{label}: %{neighbors} of %{degree}<extra></extra>' },
    });
    const points = graphHoverPoints(
      calc,
      trace,
      { xl: 0, yl: 0, px: 0, py: 0, mode: 'closest', distance: 20 },
      {
        fullLayout: {} as never,
        xaxis: undefined,
        yaxis: undefined,
        transform: { scaleX: 100, scaleY: 100, offsetX: 0, offsetY: 0 },
        height: 300,
      },
    );
    expect(points[0]).toMatchObject({ kind: 'node', pointIndex: 0, hoverText: 'a: 2 of 2' });
  });

  it('a link hover says which nodes a click selects: its two ends', () => {
    const { trace, calc } = build(NET);
    const points = graphHoverPoints(
      calc,
      trace,
      { xl: 0.5, yl: 2, px: 50, py: 200, mode: 'closest', distance: 20 },
      {
        fullLayout: {} as never,
        xaxis: undefined,
        yaxis: undefined,
        transform: { scaleX: 100, scaleY: 100, offsetX: 0, offsetY: 0 },
        height: 300,
      },
    );
    expect(points[0]).toMatchObject({ kind: 'link', pointIndex: 5, selects: [4, 5] });
    expect(points[0]!.fields).toMatchObject({
      kind: 'link',
      index: 5,
      source: { index: 4, label: 'e' },
      target: { index: 5, label: 'f' },
    });
  });

  it('a selected node lists its links to the other selected nodes', () => {
    const { trace, calc } = build(NET);
    const selection = [0, 1, 3];
    expect(graphEventData(calc, trace, 0, selection)).toMatchObject({
      kind: 'node',
      index: 0,
      label: 'a',
      // The trace's own indices: 0 → 1, and the shortcut 0 → 3.
      links: [0, 4],
    });
    expect(graphEventData(calc, trace, 1, selection)['links']).toEqual([0]);
    expect(graphEventData(calc, trace, 3, selection)['links']).toEqual([4]);
    expect(graphEventData(calc, trace, 0, selection)).not.toHaveProperty('path');
    // Without the selection (a caller that does not pass it): the node's own fields.
    expect(graphEventData(calc, trace, 0)).not.toHaveProperty('links');
    expect(graphEventData(calc, trace, 42, selection)).toEqual({});
  });

  it('a loop is listed once', () => {
    const { trace, calc } = build({
      node: { x: [0, 1], y: [0, 0] },
      link: { source: [0, 0], target: [0, 1] },
    });
    expect(graphEventData(calc, trace, 0, [0])['links']).toEqual([0]);
    expect(graphEventData(calc, trace, 0, [0, 1])['links']).toEqual([0, 1]);
  });

  it('two selected nodes carry the path between them', () => {
    const { trace, calc } = build({ ...NET, highlight: { pathweight: 'value' } });
    const selection = [3, 0];
    const path = { nodes: [0, 1, 2, 3], links: [0, 1, 2], length: 3 };
    expect(graphEventData(calc, trace, 3, selection)['path']).toEqual(path);
    expect(graphEventData(calc, trace, 0, selection)['path']).toEqual(path);
    // They are linked directly too: the link among them.
    expect(graphEventData(calc, trace, 0, selection)['links']).toEqual([4]);
    const off = build({ ...NET, highlight: { mode: 'neighbors' } });
    expect(graphEventData(off.calc, off.trace, 0, selection)).not.toHaveProperty('path');
  });
});
