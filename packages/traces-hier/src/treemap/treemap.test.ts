import {
  createResourceManager,
  IDENTITY_TRANSFORM,
  LazyFillPrimitive,
  LinePrimitive,
  RectPrimitive,
  TextPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import type { ComponentPointerEvent, TracePlotContext } from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { labelContent } from '@mk7s/holochart-traces-basic';
import { nodeContext, nodeHoverText } from '../hierarchy/format.ts';
import type { NodeLabel } from '../hierarchy/view.ts';
import { rectGeometry, type RectCalc } from './geometry.ts';
import { rectClick, rectHoverPoints } from './hover.ts';
import { treemap } from './index.ts';
import { segmentPolygon, tileRects } from './plot.ts';
import { depthfadeColor, rectStyles } from './style.ts';
import { layoutRectText, placeInRect, textSpot, wrapToFit } from './text.ts';
import { closestEdge, planPathbarTween, planRectTween, rectKey } from './tween.ts';
import { build, defaults, EVE, type Built } from './__testing__/build.ts';

// troika typesets in a worker with browser globals; the view tests only need its object graph.
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

/** The interaction example's tree: `total` values, easy dice geometry. */
const TREE = {
  labels: ['Eve', 'Seth', 'Cain', 'Awan', 'Abel', 'Enos', 'Noam', 'Enoch'],
  parents: ['', 'Eve', 'Eve', 'Eve', 'Eve', 'Seth', 'Seth', 'Awan'],
  values: [60, 30, 15, 9, 6, 20, 10, 9],
  branchvalues: 'total',
  tiling: { packing: 'dice', pad: 0 },
  marker: { pad: { t: 20, l: 0, r: 0, b: 0 } },
};

const geometryOf = (b: Built, k = 0) => rectGeometry(b.calcs[k]!, b.traces[k]!)!;
const tile = (b: Built, id: string, k = 0) => geometryOf(b, k).tiles.find((t) => t.node.id === id)!;

describe('treemap defaults', () => {
  it('needs labels and parents', () => {
    const { fullData } = defaults([{}, { labels: ['a'] }, { labels: ['a'], parents: [''] }]);
    expect(fullData.map((t) => t.visible)).toEqual([false, false, true]);
  });

  it('defaults like Plotly: squarify, header padding from the font, depth fade, path bar', () => {
    const { fullData } = defaults(
      [
        { ...EVE },
        {
          ...EVE,
          textposition: 'bottom right',
          textfont: { size: 20 },
          tiling: { packing: 'dice' },
        },
        { ...EVE, marker: { colors: ['red'] }, pathbar: { visible: false } },
        { ...EVE, marker: { colors: [1, 2, 3] } },
      ],
      { paper_bgcolor: '#123456' },
    );
    const [plain, bottom, colored, scaled] = fullData;
    expect(plain).toMatchObject({
      tiling: { packing: 'squarify', squarifyratio: 1, flip: '', pad: 3 },
      marker: {
        pad: { t: 24, l: 6, r: 6, b: 6 },
        depthfade: true,
        cornerradius: 0,
        line: { width: 1, color: 'rgb(18, 52, 86)' },
      },
      pathbar: { visible: true, side: 'top', edgeshape: '>', thickness: 18 },
      textposition: 'top left',
      textinfo: 'label',
      root: { color: 'rgba(0, 0, 0, 0)' },
    });
    expect(plain!['leaf']).toBeUndefined();
    expect(bottom).toMatchObject({ marker: { pad: { t: 10, l: 10, r: 10, b: 40 } } });
    expect((bottom!['tiling'] as Record<string, unknown>)['squarifyratio']).toBeUndefined();
    expect((bottom!['pathbar'] as Record<string, unknown>)['thickness']).toBe(26);
    expect(colored).toMatchObject({ marker: { depthfade: false }, pathbar: { visible: false } });
    expect((colored!['pathbar'] as Record<string, unknown>)['thickness']).toBeUndefined();
    expect((scaled!['marker'] as Record<string, unknown>)['depthfade']).toBeUndefined();
    expect(scaled!['_hasColorscale']).toBe(true);
  });

  it('path bar labels contrast with their segment unless a text color is set', () => {
    const { fullData } = defaults([{ ...EVE }, { ...EVE, textfont: { color: 'red' } }]);
    const bar = (k: number) =>
      (fullData[k]!['pathbar'] as { textfont: Record<string, unknown> }).textfont;
    expect(bar(0)['color']).toBeUndefined();
    expect(bar(0)['size']).toBe(12);
    expect(bar(1)['color']).toBe('rgb(255, 0, 0)');
  });
});

describe('treemap geometry', () => {
  const b = build([TREE], { margin: { l: 0, r: 0, t: 0, b: 0 } });

  it('fills the domain with the entry and tiles the branches below their headers', () => {
    expect(tile(b, 'Eve')).toMatchObject({ x0: 0, x1: 600, y0: 0, y1: 400, header: true });
    expect(tile(b, 'Seth')).toMatchObject({ x0: 0, x1: 300, y0: 20, y1: 400, header: true });
    expect(tile(b, 'Cain')).toMatchObject({ x0: 300, x1: 450, header: false });
    expect(tile(b, 'Enos')).toMatchObject({ x0: 0, x1: 200, y0: 40, y1: 400, depth: 2 });
    expect(geometryOf(b).pathbar).toEqual([]);
    expect(geometryOf(b).layers).toBe(3);
  });

  it('collapses levels below maxdepth and makes the last level drawn headerless', () => {
    const m = build([{ ...TREE, maxdepth: 2 }]);
    expect(tile(m, 'Enos')).toMatchObject({ hidden: true, x0: 100, x1: 100 });
    expect(tile(m, 'Seth').header).toBe(false);
    expect(geometryOf(m).layers).toBe(2);
  });

  it('lays out the path bar: the ancestors in equal segments above (or below) the domain', () => {
    const top = build([{ ...TREE, level: 'Enos' }]);
    const g = geometryOf(top);
    expect(g.entry.id).toBe('Enos');
    expect(g.pathbar.map((s) => [s.node.id, s.x0, s.x1, s.y0, s.y1])).toEqual([
      ['Seth', 300, 600, -20, -2],
      ['Eve', 0, 300, -20, -2],
    ]);
    const bottom = build([{ ...TREE, level: 'Seth', pathbar: { side: 'bottom', thickness: 30 } }]);
    expect(geometryOf(bottom).pathbar[0]).toMatchObject({ y0: 402, y1: 432 });
  });

  it('draws a generated root of several roots transparent, without an outline', () => {
    const m = build([{ labels: ['a', 'b'], parents: ['', ''], values: [1, 2] }]);
    const g = geometryOf(m);
    expect(g.tiles[0]!.node.generated).toBe('multiple');
    const styles = rectStyles(m.traces[0]!, g.tiles, g, 'white', { colorscale: false });
    expect(styles[0]).toMatchObject({ width: 0, fill: [0, 0, 0, 0] });
  });
});

describe('treemap colors', () => {
  it("fades like Plotly's depthfade (tinycolor rounding)", () => {
    const c = depthfadeColor('rgb(31, 119, 180)', '#fff', 2);
    expect(c.map((v) => Math.round(v * 255))).toEqual([73, 145, 194, 255]);
    expect(depthfadeColor('rgb(31, 119, 180)', '#fff', 0)[0]).toBeCloseTo(31 / 255);
  });

  it('fades branches by height, leaves not at all; reversed fades the leaves', () => {
    const b = build([{ ...EVE }], { paper_bgcolor: 'white' });
    const g = geometryOf(b);
    const styles = rectStyles(b.traces[0]!, g.tiles, g, 'white', { colorscale: false });
    const at = (id: string) => styles[g.tiles.findIndex((t) => t.node.id === id)]!;
    const seth = g.tiles.find((t) => t.node.id === 'Seth')!.node;
    const enos = g.tiles.find((t) => t.node.id === 'Enos')!.node;
    expect(enos.color).toBe(seth.color);
    // Seth (height 1) takes two steps, Enos (a leaf) one, which is no change.
    expect(at('Seth').fill).toEqual(depthfadeColor(seth.color, 'white', 2));
    expect(at('Enos').fill.map((v) => Math.round(v * 255))).toEqual(
      depthfadeColor(enos.color, 'white', 0).map((v) => Math.round(v * 255)),
    );
    // The transparent root has no outline.
    expect(at('Eve')).toMatchObject({ width: 0 });

    const r = build([{ ...EVE, marker: { depthfade: 'reversed' } }], { paper_bgcolor: 'white' });
    const gr = geometryOf(r);
    const rs = rectStyles(r.traces[0]!, gr.tiles, gr, 'white', { colorscale: false });
    const enosIndex = gr.tiles.findIndex((t) => t.node.id === 'Enos');
    expect(rs[enosIndex]!.fill).toEqual(depthfadeColor(enos.color, 'white', 2));
  });

  it('uses treemapcolorway on the first level and outlines with marker.line', () => {
    const b = build([{ ...EVE, marker: { line: { width: 3, color: 'red' } } }], {
      treemapcolorway: ['#010203', '#040506'],
      extendtreemapcolors: false,
    });
    const g = geometryOf(b);
    expect(g.tiles.find((t) => t.node.id === 'Seth')!.node.color).toBe('rgb(1, 2, 3)');
    const styles = rectStyles(b.traces[0]!, g.tiles, g, 'white', { colorscale: false });
    expect(styles[1]).toMatchObject({ width: 3, line: [1, 0, 0, 1] });
  });
});

describe('treemap coloraxis', () => {
  it('colors tiles and icicle cells through layout.coloraxis, one colorbar for both', () => {
    const b = build(
      [
        { ...EVE, marker: { colors: [0, 1, 2, 3, 4, 5, 6, 7, 8], coloraxis: 'coloraxis2' } },
        { ...EVE, type: 'icicle', marker: { coloraxis: 'coloraxis2' } },
      ],
      {
        coloraxis2: {
          colorscale: [
            [0, '#000000'],
            [1, '#ffffff'],
          ],
          showscale: false,
        },
      },
    );
    expect(b.fullLayout['coloraxis2']).toMatchObject({ _min: 0, _max: 14 });
    expect(b.calcs[0]!.hierarchy!.nodes[0]!.color).toBe('rgb(0, 0, 0)');
    // The icicle's Cain is colored by its value (14), the top of the shared domain.
    const cain = b.calcs[1]!.hierarchy!.nodes.find((n) => n.id === 'Cain')!;
    expect(cain.color).toBe('rgb(255, 255, 255)');
    expect(b.traces[0]!['marker']).not.toHaveProperty('depthfade');
    expect(treemap.colorbar!(b.traces[0]!, { fullLayout: b.fullLayout })).toBeNull();
  });
});

describe('treemap labels', () => {
  const spot = textSpot('top left');

  it('places labels by textposition, 3 px in, shrinking (never growing) to fit', () => {
    const rect = { x0: 0, x1: 100, y0: 0, y1: 50 };
    expect(placeInRect(rect, 40, 14.4, spot)).toEqual({ x: 23, y: 10.2, scale: 1 });
    expect(placeInRect(rect, 40, 14.4, textSpot('bottom right'))).toEqual({
      x: 77,
      y: expect.closeTo(39.8),
      scale: 1,
    });
    expect(placeInRect(rect, 40, 14.4, textSpot('middle center'))).toEqual({
      x: 50,
      y: 25,
      scale: 1,
    });
    expect(placeInRect(rect, 188, 14.4, spot).scale).toBeCloseTo(0.5);
  });

  it('puts header labels in the header padding, and path bar labels on the left', () => {
    const pads = { t: 24, l: 6, r: 6, b: 6 };
    const header = placeInRect(
      { x0: 0, x1: 100, y0: 0, y1: 80 },
      40,
      14.4,
      textSpot('middle center'),
      {
        header: true,
        pads,
      },
    );
    expect(header).toEqual({ x: 50, y: 10.2, scale: 1 });
    const below = placeInRect(
      { x0: 0, x1: 100, y0: 0, y1: 80 },
      40,
      14.4,
      textSpot('bottom left'),
      {
        header: true,
        pads: { ...pads, t: 6, b: 24 },
      },
    );
    expect(below).toEqual({ x: 26, y: expect.closeTo(69.8), scale: 1 });
    const bar = placeInRect({ x0: 0, x1: 100, y0: 0, y1: 18 }, 40, 12, textSpot('middle center'), {
      onPathbar: true,
    });
    expect(bar).toEqual({ x: 23, y: 9, scale: 1 });
  });

  it('wraps a label that is short of width before shrinking it', () => {
    const content = labelContent('Fresh produce and more', { family: 'sans-serif', size: 12 });
    const fit = wrapToFit(content, 60, 80, 0.4);
    expect(fit).toBeDefined();
    expect(fit!.content.text).toContain('\n');
    expect(fit!.scale).toBeGreaterThan(0.4);
  });

  it('labels tiles with textinfo, headers with their label, and the path bar in one line', () => {
    const b = build([{ ...TREE, textinfo: 'label+value', level: 'Seth' }]);
    const g = geometryOf(b);
    const labels = layoutRectText(b.traces[0]!, b.calcs[0]!, g, b.fullLayout);
    expect(labels.map((l) => l.text)).toEqual(['Seth', 'Enos\n20', 'Noam\n10', 'Eve']);
    // The path bar's Eve (the root) uses the outside font: not a contrast color.
    expect(labels[3]).toMatchObject({ align: 'left' });
    const noHeader = build([{ ...TREE, marker: { pad: { t: 0 } } }]);
    const texts = layoutRectText(
      noHeader.traces[0]!,
      noHeader.calcs[0]!,
      geometryOf(noHeader),
      noHeader.fullLayout,
    ).map((l) => l.text);
    expect(texts).not.toContain('Seth');
  });
});

describe('treemap uniformtext', () => {
  const labelsOf = (layout: Record<string, unknown>, type = 'treemap') => {
    const b = build([{ ...TREE, type, level: 'Seth', textfont: { size: 30 } }], layout);
    return layoutRectText(b.traces[0]!, b.calcs[0]!, geometryOf(b), b.fullLayout);
  };
  const sizeOf = (l: NodeLabel): number => l.font?.size ?? 0;

  for (const type of ['treemap', 'icicle']) {
    it(`sizes ${type} labels alike, path bar labels included, and hides small ones`, () => {
      const free = labelsOf({}, type);
      const sizes = [...new Set(free.map(sizeOf))].sort((a, b) => a - b);
      expect(sizes.length).toBeGreaterThan(1);
      expect(free.some((l) => l.align === 'left')).toBe(true);
      const shown = labelsOf({ uniformtext: { mode: 'show', minsize: 0 } }, type);
      expect(shown.map((l) => l.text)).toEqual(free.map((l) => l.text));
      expect(new Set(shown.map(sizeOf))).toEqual(new Set([sizes[0]]));
      // A left-aligned label resized smaller keeps its left edge: its center moves left.
      const b = build([{ ...TREE, type, level: 'Seth', textfont: { size: 30 } }]);
      const pass = { uniform: { mode: 'show', minsize: 0 } as const, size: 4, items: [] };
      const small = layoutRectText(b.traces[0]!, b.calcs[0]!, geometryOf(b), b.fullLayout, pass);
      const eve = (ls: typeof free) => ls.find((l) => l.text === 'Eve')!;
      expect(sizeOf(eve(small))).toBe(4);
      expect(eve(small).x).toBeLessThan(eve(free).x);
      expect(pass.items).toHaveLength(free.length);
      const minsize = sizes[1]!;
      const hidden = labelsOf({ uniformtext: { mode: 'hide', minsize } }, type);
      expect(hidden.length).toBeLessThan(free.length);
      expect(new Set(hidden.map(sizeOf))).toEqual(new Set([minsize]));
    });
  }
});

describe('treemap path bar', () => {
  it('shapes segment edges like Plotly, kept inside the domain on the left', () => {
    const s = { x0: 0, x1: 100, y0: -20, y1: -2 };
    expect(segmentPolygon(s, '>', 18, 600)).toEqual([
      [0, -20],
      [91, -20],
      [100, -11],
      [91, -2],
      [0, -2],
      [0, -11],
    ]);
    expect(segmentPolygon({ ...s, x0: 100, x1: 200 }, '<', 18, 600)).toEqual([
      [100, -20],
      [200, -20],
      [191, -11],
      [200, -2],
      [100, -2],
      [91, -11],
    ]);
    expect(segmentPolygon({ ...s, x0: 100, x1: 200 }, '/', 18, 600)[3]).toEqual([191, -2]);
    expect(segmentPolygon({ ...s, x0: 100, x1: 200 }, '|', 18, 600)[2]).toEqual([200, -11]);
  });
});

describe('treemap hover and clicks', () => {
  const b = build([{ ...TREE, hoverinfo: 'all' }], { margin: { l: 0, r: 0, t: 0, b: 0 } });
  const calc = b.calcs[0]!;
  const trace = b.traces[0]!;
  const query = (cx: number, cy: number) => ({
    px: cx,
    py: 400 - cy,
    xl: cx,
    yl: 400 - cy,
    mode: 'closest' as const,
    distance: 20,
    cx,
    cy,
  });
  const hoverCtx = {
    fullLayout: b.fullLayout,
    xaxis: undefined,
    yaxis: undefined,
    transform: IDENTITY_TRANSFORM,
  };

  it('reports the deepest tile under the pointer with Plotly fields, anchored at its header', () => {
    const [p] = rectHoverPoints(calc, trace, query(100, 200), hoverCtx as never);
    expect(p).toMatchObject({
      pointIndex: 5,
      distance: 0,
      // Enos: right end (no right padding), middle of the top padding (20 / 2), overlay y up.
      px: 200,
      py: 400 - 50,
      fields: {
        label: 'Enos',
        value: 20,
        parent: 'Seth',
        currentPath: 'Eve/Seth/',
        percentRoot: 1 / 3,
      },
    });
    expect(p!.hoverText).toContain('67% of Seth');
    expect(
      rectHoverPoints(calc, trace, query(100, 30), hoverCtx as never)[0]!.fields,
    ).toMatchObject({
      label: 'Seth',
    });
  });

  it('leaves the entry percentage out of path bar hover text', () => {
    const d = build([{ ...TREE, level: 'Seth', hoverinfo: 'label+percent entry+percent root' }]);
    const g = geometryOf(d);
    const ctx = nodeContext(d.calcs[0]!.hierarchy!, g.entry, d.fullLayout);
    const eve = g.pathbar[0]!.node;
    const cain = d.calcs[0]!.hierarchy!.nodes.find((n) => n.id === 'Cain')!;
    expect(nodeHoverText(d.traces[0]!, cain, ctx, { onPathbar: true })).not.toContain('of Seth');
    expect(nodeHoverText(d.traces[0]!, cain, ctx)).toContain('50% of Seth');
    const [p] = rectHoverPoints(d.calcs[0]!, d.traces[0]!, query(300, -10), hoverCtx as never);
    expect(p!.fields).toMatchObject({ label: eve.label });
  });

  it('drills into tiles and leaves, up from the entry and to path bar segments', () => {
    const click = (c: RectCalc, t = trace, x = 0, y = 0) =>
      rectClick(c, t, {}, 0, b.fullLayout, x, y);
    expect(click(calc, trace, 100, 30)).toMatchObject({ nextLevel: 'Seth', drills: true });
    expect(click(calc, trace, 100, 200)).toMatchObject({ nextLevel: 'Enos', drills: true });
    const root = click(calc, trace, 300, 10)!;
    expect(root).toMatchObject({ nextLevel: 'Eve', drills: false });
    expect(root.point).toMatchObject({
      curveNumber: 0,
      pointNumber: 0,
      label: 'Eve',
      entry: 'Eve',
    });
    expect(click(calc, trace, 700, 10)).toBeUndefined();

    const d = build([{ ...TREE, level: 'Enos' }], { margin: { l: 0, r: 0, t: 0, b: 0 } });
    const [dc, dt] = [d.calcs[0]!, d.traces[0]!];
    expect(click(dc, dt, 100, 200)).toMatchObject({ nextLevel: 'Seth', drills: true });
    expect(click(dc, dt, 100, -10)).toMatchObject({ nextLevel: 'Eve', drills: true });
    expect(click(dc, dt, 400, -10)).toMatchObject({ nextLevel: 'Seth', drills: true });
  });

  it('goes up to the whole hierarchy of several roots with an empty level', () => {
    const m = build([
      { labels: ['a', 'b', 'c'], parents: ['', '', 'a'], values: [1, 2, 3], level: 'a' },
    ]);
    const up = rectClick(m.calcs[0]!, m.traces[0]!, {}, 0, m.fullLayout, 300, -10);
    expect(up).toMatchObject({ nextLevel: '', drills: true });
  });
});

describe('treemap drill-down transition', () => {
  it("pushes rects beyond a reference to the domain's edges (Plotly's findClosestEdge)", () => {
    const ref = { x0: 100, x1: 200, y0: 100, y1: 200 };
    expect(closestEdge(ref, ref, 3, 600, 400)).toEqual(ref);
    // Left of the reference: collapses on the left edge.
    expect(closestEdge({ x0: 10, x1: 90, y0: 120, y1: 180 }, ref, 3, 600, 400)).toEqual({
      x0: 0,
      x1: 0,
      y0: 120,
      y1: 180,
    });
    // Around it (an ancestor): grows to the whole domain.
    expect(closestEdge({ x0: 50, x1: 300, y0: 50, y1: 300 }, ref, 3, 600, 400)).toEqual({
      x0: 0,
      x1: 600,
      y0: 0,
      y1: 400,
    });
  });

  it('drilling in: kept tiles move, others are pushed out of the clicked tile', () => {
    const before = build([TREE]);
    const after = build([{ ...TREE, level: 'Seth' }]);
    const g0 = geometryOf(before);
    const g1 = geometryOf(after);
    const prev = g0.tiles.map((t) => ({ ...t, key: rectKey(t.node) }));
    const plan = planRectTween({
      prev,
      prevEntry: '',
      next: g1.tiles,
      entry: g1.entry,
      pad: 0,
      width: 600,
      height: 400,
    });
    const enos = g1.tiles.findIndex((t) => t.node.id === 'Enos');
    expect(plan.update[enos]!.from).toMatchObject({ x0: 0, x1: 200 });
    expect(plan.update[enos]!.to).toMatchObject({ x0: 0, x1: 400 });
    expect(plan.exit.map((e) => prev[e.index]!.node.id)).toEqual([
      'Eve',
      'Cain',
      'Awan',
      'Abel',
      'Enoch',
    ]);
    // Cain, right of Seth, collapses on the right edge.
    expect(plan.exit[1]!.to).toMatchObject({ x0: 600, x1: 600 });

    // Going up: new tiles slide in from the edges around the old entry's new tile; nothing leaves.
    const up = planRectTween({
      prev: g1.tiles.map((t) => ({ ...t, key: rectKey(t.node) })),
      prevEntry: 'Seth',
      next: g0.tiles,
      entry: g0.entry,
      pad: 0,
      width: 600,
      height: 400,
    });
    expect(up.exit).toEqual([]);
    const cain = g0.tiles.findIndex((t) => t.node.id === 'Cain');
    expect(up.update[cain]!.from).toMatchObject({ x0: 600, x1: 600 });
    expect(up.update[0]!.from).toEqual(up.update[0]!.to);
  });

  it('path bar segments slide in from the right end and leave there', () => {
    const origin = { x0: 600, x1: 600, y0: -20, y1: -2 };
    const d = build([{ ...TREE, level: 'Enos' }]);
    const plan = planPathbarTween([], geometryOf(d).pathbar, origin);
    expect(plan.update.map((u) => u.from)).toEqual([origin, origin]);
    const back = planPathbarTween([{ ...origin, x0: 0, key: '' }], [], origin);
    expect(back.exit[0]!.to).toEqual(origin);
  });
});

describe('treemap view', () => {
  function plotContext(built: Built, index = 0) {
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<RectCalc> = {
      trace: built.traces[index]!,
      calc: built.calcs[index]!,
      index,
      fullLayout: built.fullLayout,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform: IDENTITY_TRANSFORM,
      viewport: { size: { width: 600, height: 400, pixelRatio: 1 } } as unknown as Viewport,
      domain: built.entries[index]!.domain,
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

  it('draws every tile with one rect primitive and one text primitive, below components', () => {
    const built = build([EVE]);
    const { ctx, added } = plotContext(built);
    const view = treemap.plot!.create(ctx);
    const rects = added.filter((p) => p instanceof RectPrimitive) as RectPrimitive[];
    expect(rects).toHaveLength(1);
    expect(rects[0]!.instanceCount).toBe(9);
    expect(added.filter((p) => p instanceof TextPrimitive)).toHaveLength(1);
    expect(added.some((p) => p instanceof LazyFillPrimitive)).toBe(false);
    for (const p of added) {
      expect(p.object.renderOrder).toBeGreaterThanOrEqual(-10);
      expect(p.object.renderOrder).toBeLessThan(0);
    }
    view.update(ctx, { calc: false, plot: true, style: true, transform: false });
    expect(added).toHaveLength(2);
  });

  it('draws the path bar as one fill batch with outlines once drilled in', () => {
    const built = build([{ ...EVE, level: 'Enos' }]);
    const { ctx, added } = plotContext(built);
    treemap.plot!.create(ctx);
    expect(added.filter((p) => p instanceof LazyFillPrimitive)).toHaveLength(1);
    expect(added.filter((p) => p instanceof LinePrimitive)).toHaveLength(1);
  });

  it('places tiles in world px with centered outlines, rounded corners and patterns', () => {
    const built = build([
      { ...TREE, marker: { ...TREE.marker, cornerradius: 30, pattern: { shape: ['', '/'] } } },
    ]);
    const g = geometryOf(built);
    const styles = rectStyles(built.traces[0]!, g.tiles, g, 'white', { colorscale: false });
    const layout = built.calcs[0]!.layout!;
    const r = tileRects(
      built.traces[0]!,
      g.tiles,
      styles,
      layout,
      g.tiles.map(() => true),
      'white',
    );
    const k = g.tiles.findIndex((t) => t.node.id === 'Seth');
    expect([r.x0[k], r.x1[k], r.y0[k], r.y1[k]]).toEqual([0, 300, 380, 0]);
    // Labelled tiles keep corners within the top-left label's padding (t 20, l 0).
    expect(r.cornerRadius).toBeInstanceOf(Float32Array);
    expect((r.cornerRadius as Float32Array)[k]).toBe(0);
    const patterns = r.pattern!.pattern as (Record<string, unknown> | undefined)[];
    expect(patterns[k]).toMatchObject({ shape: '/', bgcolor: 'white' });
    expect(patterns[0]).toBeUndefined();
  });

  it('outlines the hovered tile in place (Plotly: 2 px contrasting the paper)', () => {
    const built = build([TREE], { paper_bgcolor: 'white', margin: { l: 0, r: 0, t: 0, b: 0 } });
    const { ctx, added } = plotContext(built);
    const view = treemap.plot!.create(ctx);
    const rects = added.find((p) => p instanceof RectPrimitive) as RectPrimitive;
    const update = vi.spyOn(rects, 'update');
    const move = { type: 'move', x: 400, y: 200, button: 0 } as ComponentPointerEvent;
    expect(view.handlePointer!(move)).toBe(false);
    const patch = update.mock.calls.at(-1)![0] as {
      borderWidth: Float32Array;
      borderColor: Float32Array;
    };
    const cain = geometryOf(built).tiles.findIndex((t) => t.node.id === 'Cain');
    expect(patch.borderWidth[cain]).toBe(2);
    expect(
      [...patch.borderColor.slice(cain * 4, cain * 4 + 4)].map((v) => Math.round(v * 255)),
    ).toEqual([0x44, 0x44, 0x44, 255]);
    view.handlePointer!({ ...move, type: 'leave' } as ComponentPointerEvent);
    expect(patch.borderWidth[cain]).toBe(1);
  });
});

describe('treemap description', () => {
  it('formats every node on demand, past maxRows (the visible data table, E17.3)', () => {
    const b = build([EVE]);
    const describeWith = (maxRows: number) =>
      treemap.describe!({
        ...b.entries[0]!,
        fullLayout: b.fullLayout,
        xaxis: undefined,
        yaxis: undefined,
        maxRows,
      })!.table!;
    const all = describeWith(100);
    const t = describeWith(3);
    expect(t.rows).toEqual(all.rows.slice(0, 3));
    expect(t.total).toBe(9);
    expect(Array.from({ length: 9 }, (_, i) => t.row!(i))).toEqual(all.rows);
    expect(t.row!(8)?.[0]).toBe('Enoch');
  });
});
