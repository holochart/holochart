import { supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createResourceManager,
  LazyFillPrimitive,
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
import { describe, expect, it, vi } from 'vitest';
import { categoryValues, displayPositions, type ParcatsCalc } from './calc.ts';
import { ParcatsDrag, pressTarget, restylePayload, type ParcatsDragHost } from './drag.ts';
import { highlightOf } from './hover.ts';
import { parcats } from './index.ts';
import {
  compareKeys,
  controls,
  hitTest,
  layoutParcats,
  pathOutline,
  type ParcatsLayout,
  type ParcatsState,
} from './layout.ts';

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

const registry = createChartRegistry().register(parcats);

function build(input: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'parcats', ...input }], layout },
    registry.core,
  );
  const trace = fullData[0] as FullTrace;
  const calc =
    trace.visible === true
      ? parcats.calc!(trace, { fullLayout, index: 0, xaxis: undefined, yaxis: undefined })
      : undefined;
  return { trace, calc: calc!, fullLayout };
}

const dims = (trace: FullTrace) => trace['dimensions'] as Record<string, unknown>[];

/** 2 dims, 4 samples: A = x x y y, B = p q p p. */
const BASIC = {
  dimensions: [
    { label: 'A', values: ['x', 'x', 'y', 'y'] },
    { label: 'B', values: ['p', 'q', 'p', 'p'] },
  ],
};
/** 496 × 208 px: columns at 40 and 440; 2 categories max → 200 px of bands (50 px per count). */
const RECT = { x: 0, y: 0, width: 496, height: 208 };

function laid(input: Record<string, unknown> = BASIC, state?: ParcatsState) {
  const b = build(input);
  return { ...b, layout: layoutParcats(b.calc, b.trace, b.fullLayout, RECT, state) };
}

function pathYs(layout: ParcatsLayout, calc: ParcatsCalc) {
  const out: Record<string, number[]> = {};
  for (const p of layout.paths) {
    const key = calc.paths[p.index]!.categories.join('');
    out[key] = [...p.ys];
  }
  return out;
}

describe('parcats defaults', () => {
  it('hides traces without (visible) dimensions and dimensions without values', () => {
    expect(build({}).trace.visible).toBe(false);
    expect(build({ dimensions: [{ values: [] }] }).trace.visible).toBe(false);
    const { trace } = build({
      dimensions: [{ values: ['a', 'b', 'c'] }, { values: [] }, { values: ['a', 'b'] }],
    });
    expect(trace.visible).toBe(true);
    expect(dims(trace).map((d) => d['visible'])).toEqual([true, false, true]);
    expect(dims(trace).map((d) => d['_index'])).toEqual([0, 1, 2]);
    expect(trace._length).toBe(2);
  });

  it('defaults categoryorder from categoryarray and keeps categoryarray/ticktext for arrays only', () => {
    const { trace } = build({
      dimensions: [
        { values: ['a'], categoryarray: ['b', 'a'], ticktext: ['B', 'A'] },
        {
          values: ['a'],
          categoryorder: 'category ascending',
          categoryarray: ['b'],
          ticktext: ['B'],
        },
        { values: ['a'], categoryorder: 'array' },
        { values: ['a'] },
      ],
    });
    const d = dims(trace);
    expect(d[0]).toMatchObject({
      categoryorder: 'array',
      categoryarray: ['b', 'a'],
      ticktext: ['B', 'A'],
    });
    expect(d[1]!['categoryorder']).toBe('category ascending');
    expect(d[1]!['categoryarray']).toBeUndefined();
    expect(d[1]!['ticktext']).toBeUndefined();
    expect(d[2]!['categoryorder']).toBe('trace');
    expect(d[3]!['categoryorder']).toBe('trace');
    expect(d.map((x) => x['displayindex'])).toEqual([0, 1, 2, 3]);
  });

  it('defaults the rest: fonts, color, counts, arrangement and hover', () => {
    const { trace, fullLayout } = build(BASIC);
    const size = fullLayout.font.size;
    expect((trace['labelfont'] as Record<string, unknown>)['size']).toBe(Math.round(size));
    expect((trace['tickfont'] as Record<string, unknown>)['size']).toBe(Math.round(size / 1.2));
    expect(trace['counts']).toBe(1);
    expect(trace['arrangement']).toBe('perpendicular');
    expect(trace['bundlecolors']).toBe(true);
    expect(trace['sortpaths']).toBe('forward');
    expect(trace['hoveron']).toBe('category');
    expect(trace['hoverinfo']).toBe('all');
    const line = trace['line'] as Record<string, unknown>;
    expect(line['shape']).toBe('linear');
    expect(typeof line['color']).toBe('string');
    expect(line['colorscale']).toBeUndefined();
    expect(trace._length).toBe(4);
  });

  it('caps the length at a numeric line.color and turns its colorscale on', () => {
    const { trace } = build({ ...BASIC, line: { color: [1, 2, 3], colorscale: 'Viridis' } });
    expect(trace._length).toBe(3);
    expect(trace['line']).toMatchObject({ cauto: true, autocolorscale: false });
    const auto = build({ ...BASIC, line: { color: [1, 2, 3] } }).trace;
    expect((auto['line'] as Record<string, unknown>)['autocolorscale']).toBe(true);
    expect(parcats.colorbar!(trace, { fullLayout: build(BASIC).fullLayout })).toBeNull();
  });
});

describe('parcats calc', () => {
  const vals = (dim: Record<string, unknown>) =>
    categoryValues(dim, (dim['values'] as unknown[]).length);

  it('orders categories by trace, sort order and categoryarray', () => {
    const values = ['b', 10, 'a', 2, 'b'];
    expect(vals({ values, categoryorder: 'trace' })).toEqual(['b', 10, 'a', 2]);
    expect(vals({ values: [10, '2', 1], categoryorder: 'category ascending' })).toEqual([
      1,
      '2',
      10,
    ]);
    expect(vals({ values: [10, '2', 1], categoryorder: 'category descending' })).toEqual([
      10,
      '2',
      1,
    ]);
    expect(vals({ values: ['b', 'c', 'a'], categoryorder: 'category ascending' })).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(
      vals({
        values: ['c', 'b', 'd', 'a'],
        categoryorder: 'array',
        categoryarray: ['a', 'z', 'b'],
      }),
    ).toEqual(['a', 'z', 'b', 'c', 'd']);
  });

  it('labels categories with ticktext padded by the values, and keeps empty categories', () => {
    const { calc } = build({
      dimensions: [{ values: ['c', 'a'], categoryarray: ['a', 'z', 'c'], ticktext: ['A'] }],
    });
    const cats = calc.dimensions[0]!.categories;
    expect(cats.map((c) => c.label)).toEqual(['A', 'z', 'c']);
    expect(cats.map((c) => c.count)).toEqual([1, 0, 1]);
    expect(cats[2]!.valueInds).toEqual([0]);
  });

  it('uses displayindex only when it is a permutation', () => {
    expect(displayPositions([1, 0, 2])).toEqual([1, 0, 2]);
    expect(displayPositions([0, 0, 2])).toEqual([0, 1, 2]);
    expect(displayPositions([5, 1])).toEqual([0, 1]);
    const { calc } = build({
      dimensions: [
        { values: [1], displayindex: 1 },
        { values: [], displayindex: 5 },
        { values: [1], displayindex: 0 },
      ],
    });
    expect(calc.dimensions.map((d) => [d.container, d.display])).toEqual([
      [0, 1],
      [2, 0],
    ]);
  });

  it('aggregates samples into paths by category and color, weighted by counts', () => {
    const { calc } = build({
      ...BASIC,
      counts: [1, 2],
      line: { color: [5, 5, 7, 5] },
    });
    // counts repeat: 1 2 1 2.
    expect(calc.total).toBe(6);
    expect(calc.numeric).toBe(true);
    expect(
      calc.paths.map((p) => [p.categories.join(''), p.rawColor, p.count, p.valueInds]),
    ).toEqual([
      ['00', 5, 1, [0]],
      ['01', 5, 2, [1]],
      ['10', 7, 1, [2]],
      ['10', 5, 2, [3]],
    ]);
    expect(calc.dimensions[1]!.categories.map((c) => c.count)).toEqual([4, 2]);
  });
});

describe('parcats layout', () => {
  it('spreads dimensions and stacks categories by count, 8 px apart, centered', () => {
    const { layout } = laid({
      dimensions: [...BASIC.dimensions, { label: 'C', values: ['k', 'k', 'k', 'k'] }],
    });
    // (496 − 2·40 − 16) / 2 = 200 px between columns.
    expect(layout.dims.map((d) => d.x)).toEqual([40, 240, 440]);
    expect(layout.dims[0]!.cats.map((c) => [c.y, c.height])).toEqual([
      [0, 100],
      [108, 100],
    ]);
    expect(layout.dims[1]!.cats.map((c) => [c.y, c.height])).toEqual([
      [0, 150],
      [158, 50],
    ]);
    // One category of at most two: centered by half a spacing.
    expect(layout.dims[2]!.cats.map((c) => [c.y, c.height])).toEqual([[4, 200]]);
  });

  it('stacks paths through the categories and forms bands', () => {
    const { layout, calc } = laid();
    expect(pathYs(layout, calc)).toEqual({ '00': [0, 0], '01': [50, 158], '10': [108, 50] });
    expect(layout.paths.map((p) => p.height)).toEqual([50, 50, 100]);
    // One plain color: one band per category.
    expect(layout.dims[1]!.cats[0]!.bands).toMatchObject([{ y: 0, height: 150, count: 3 }]);
    // Rect offset.
    const moved = layoutParcats(calc, laid().trace, undefined, { ...RECT, x: 10, y: 20 });
    expect(moved.dims[0]!.x).toBe(50);
    expect(moved.dims[0]!.cats[0]!.y).toBe(20);
  });

  it('bundles colors unless bundlecolors is off', () => {
    const input = {
      dimensions: [{ values: ['a', 'a', 'a'] }, { values: ['p', 'q', 'p'] }],
      line: { color: [2, 1, 2] },
    };
    const bundled = laid(input);
    const a = bundled.layout.dims[0]!.cats[0]!;
    expect(a.bands.map((b) => [b.rawColor, b.count])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(a.bands[0]!.y).toBe(a.y);
    expect(a.bands[1]!.y).toBeCloseTo(a.y + a.bands[0]!.height);
    const loose = laid({ ...input, bundlecolors: false });
    const b = loose.layout.dims[0]!.cats[0]!;
    expect(b.bands.map((x) => [x.rawColor, x.count])).toEqual([
      [2, 2],
      [1, 1],
    ]);
    // Draw order by color value.
    expect(bundled.layout.paths.map((p) => p.rawColor)).toEqual([1, 2]);
  });

  it('sorts paths from the left (forward) or the right (backward)', () => {
    const input = {
      dimensions: [
        { values: ['a0', 'a1'] },
        { values: ['b', 'b'] },
        { values: ['c1', 'c0'], categoryarray: ['c0', 'c1'] },
      ],
    };
    const fwd = laid(input);
    // Path of sample 0 (a0 … c1) comes first in b going forward.
    // b is the one category of at most two: centered 4 px down.
    expect(pathYs(fwd.layout, fwd.calc)['001']![1]).toBe(4);
    const back = laid({ ...input, sortpaths: 'backward' });
    expect(pathYs(back.layout, back.calc)['001']![1]).toBe(104);
    expect(pathYs(back.layout, back.calc)['100']![1]).toBe(4);
  });

  it('compares sort keys with incomparable entries last and shorter keys first', () => {
    expect(compareKeys([1, 2], [1, 3])).toBeLessThan(0);
    expect(compareKeys([undefined, 5], [undefined, 4])).toBeGreaterThan(0);
    expect(compareKeys([NaN], [0])).toBeGreaterThan(0);
    expect(compareKeys([0], [0, 1])).toBeLessThan(0);
  });

  it('builds linear and hspline outlines', () => {
    expect(controls(0, 100, 0)).toEqual([0, 100]);
    expect(controls(0, 100, 0.5)).toEqual([50, 50]);
    const lin = pathOutline([0, 100], [0, 50], 10, 0);
    expect(lin.x).toEqual([0, 16, 100, 116, 116, 100, 16, 0]);
    expect(lin.y).toEqual([0, 0, 50, 50, 60, 60, 10, 10]);
    const curve = pathOutline([0, 100], [0, 50], 10, 0.5, 4);
    expect(curve.x.length).toBe(8 + 2 * 3);
    // Midpoint of the top curve: halfway in x and y.
    expect(curve.x[3]).toBeCloseTo(58);
    expect(curve.y[3]).toBeCloseTo(25);
  });

  it('follows a drag state: reordered dimensions and categories, dragged positions', () => {
    const { calc, trace } = laid();
    const layout = layoutParcats(calc, trace, undefined, RECT, {
      order: {
        dims: [1, 0],
        cats: [
          [1, 0],
          [0, 1],
        ],
      },
      drag: { dim: 0, cat: 0, y: 30 },
    });
    expect(layout.dims.map((d) => [d.dim, d.x])).toEqual([
      [1, 40],
      [0, 440],
    ]);
    expect(layout.dims[1]!.cats.map((c) => [c.cat, c.y])).toEqual([
      [1, 0],
      [0, 30],
    ]);
  });
});

describe('parcats hover', () => {
  function hover(input: Record<string, unknown>, cx: number, cy: number) {
    const { trace, calc, fullLayout } = build(input);
    const ctx = {
      fullLayout,
      xaxis: undefined,
      yaxis: undefined,
      transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
      domain: { x: [0, 1], y: [0, 1], rect: RECT },
    } as HoverContext;
    return parcats.hoverPoints!(
      calc,
      trace,
      { px: cx, py: 300 - cy, xl: 0, yl: 0, mode: 'closest', distance: 20, cx, cy },
      ctx,
    );
  }

  it('shows a category with its count and probability', () => {
    const [p, ...rest] = hover(BASIC, 45, 50);
    expect(rest).toEqual([]);
    expect(p).toMatchObject({
      px: 56,
      py: 250,
      distance: 0,
      hoverText: 'Count: 2<br>P(x): 0.500',
      color: '#d3d3d3',
      showName: false,
      pointIndex: 0,
      pointIndices: [0, 1],
      fields: { count: 2, probability: 0.5, category: 'x' },
    });
    // The last column's labels anchor on its left edge.
    expect(hover(BASIC, 445, 10)[0]!.px).toBe(440);
  });

  it('shows a path between two columns', () => {
    const [p] = hover(BASIC, 248, 150);
    expect(p).toMatchObject({
      px: 248,
      py: 300 - 129,
      hoverText: 'Count: 2<br>P: 0.500',
      pointIndices: [2, 3],
    });
    expect(hover(BASIC, 248, 20)[0]!.pointIndices).toEqual([0]);
    expect(hover(BASIC, 20, 20)).toEqual([]);
    expect(hover({ ...BASIC, hoverinfo: 'count' }, 248, 20)[0]!.hoverText).toBe('Count: 1');
    expect(hover({ ...BASIC, hoverinfo: 'none' }, 248, 20)[0]!.hoverText).toBe('');
    expect(hover({ ...BASIC, hoverinfo: 'skip' }, 248, 20)).toEqual([]);
    expect(
      hover(
        { ...BASIC, line: { hovertemplate: '%{count} of %{probability:.0%}<extra></extra>' } },
        248,
        20,
      )[0]!.hoverText,
    ).toBe('1 of 25%');
  });

  it('shows the colored band for hoveron color', () => {
    const input = { ...BASIC, hoveron: 'color', line: { color: [1, 2, 1, 1] } };
    // Category p of B holds samples 0, 2 and 3, all color 1: one band.
    const [p] = hover(input, 445, 20);
    expect(p!.fields).toMatchObject({
      count: 3,
      categorycount: 3,
      colorcount: 3,
      bandcolorcount: 3,
    });
    expect(p!.hoverText).toBe(
      'Count: 3<br>P(color ∩ p): 0.750<br>P(p | color): 1.000<br>P(color | p): 1.000',
    );
    // Category x of A holds colors 1 (sample 0) and 2 (sample 1): the lower band is color 2.
    const [q] = hover(input, 45, 90);
    expect(q!.fields).toMatchObject({ count: 1, categorycount: 2, colorcount: 1 });
    expect(q!.py).toBe(300 - 75);
  });

  it('shows every category of the dimension for hoveron dimension', () => {
    const pts = hover({ ...BASIC, hoveron: 'dimension' }, 45, 50);
    expect(pts.map((p) => [p.hoverText, p.multi])).toEqual([
      ['Count: 2<br>P(x): 0.500', true],
      ['Count: 2<br>P(y): 0.500', true],
    ]);
  });

  it('highlights a path, a category, or a category’s band color', () => {
    const { layout, calc, trace } = laid();
    expect(highlightOf(calc, trace, hitTest(layout, 248, 20))!.paths).toEqual(new Set([0]));
    const cat = highlightOf(calc, trace, hitTest(layout, 445, 20))!;
    expect([...cat.paths]).toEqual([0, 2]);
    expect(cat.cat).toMatchObject({ dim: 1, cat: 0 });
    const colored = laid({ ...BASIC, hoveron: 'color', line: { color: [1, 2, 1, 1] } });
    const band = highlightOf(colored.calc, colored.trace, hitTest(colored.layout, 45, 90))!;
    expect(band.cat).toBeUndefined();
    expect(band.paths.size).toBe(1);
    expect(
      highlightOf(calc, { ...trace, hoverinfo: 'skip' } as FullTrace, hitTest(layout, 248, 20)),
    ).toBeUndefined();
  });
});

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

describe('parcats drag', () => {
  function setup(input: Record<string, unknown> = BASIC) {
    const { calc, trace } = build(input);
    let layout = layoutParcats(calc, trace, undefined, RECT);
    const drops: Record<string, unknown>[] = [];
    const shown: (ParcatsState | undefined)[] = [];
    const host: ParcatsDragHost = {
      layout: () => layout,
      arrangement: () => trace['arrangement'],
      show: (state) => {
        shown.push(state);
        layout = layoutParcats(calc, trace, undefined, RECT, state);
      },
      drop: (order, update) => {
        drops.push(update);
        layout = layoutParcats(calc, trace, undefined, RECT, { order });
      },
    };
    return { drag: new ParcatsDrag(host), drops, shown, layout: () => layout, calc };
  }

  it('finds what a press grabs', () => {
    const { layout } = laid();
    expect(pressTarget(layout, 38, 150)).toEqual({ dim: 0, cat: 1 });
    expect(pressTarget(layout, 445, -10)).toEqual({ dim: 1 });
    expect(pressTarget(layout, 445, -40)).toBeUndefined();
    expect(pressTarget(layout, 200, 50)).toBeUndefined();
  });

  it('swaps a category with the one above past its middle and restyles categoryarray', () => {
    const s = setup();
    expect(s.drag.handle(pointer('down', 45, 150))).toBe(true);
    const move = pointer('move', 45, 100); // y = 58: above the middle (50) of x? No.
    s.drag.handle(move);
    expect(move.cursor).toBe('ns-resize');
    expect(s.layout().order.cats[0]).toEqual([0, 1]);
    s.drag.handle(pointer('move', 45, 90)); // y = 48 < 50: swap.
    expect(s.layout().order.cats[0]).toEqual([1, 0]);
    expect(s.layout().dims[0]!.cats.map((c) => [c.cat, c.y])).toEqual([
      [1, 48],
      [0, 108],
    ]);
    expect(s.drag.handle(pointer('up', 45, 90))).toBe(true);
    expect(s.drops).toEqual([
      {
        'dimensions[0].categoryarray': [['y', 'x']],
        'dimensions[0].ticktext': [['y', 'x']],
        'dimensions[0].categoryorder': 'array',
      },
    ]);
    expect(s.drag.handle(pointer('click', 45, 90))).toBe(false);
  });

  it('swaps a category with the one below once its bottom passes the middle', () => {
    const s = setup();
    s.drag.handle(pointer('down', 45, 10));
    s.drag.handle(pointer('move', 45, 67)); // bottom 157 < 158: no swap.
    expect(s.layout().order.cats[0]).toEqual([0, 1]);
    s.drag.handle(pointer('move', 45, 69)); // bottom 159 > 158.
    expect(s.layout().order.cats[0]).toEqual([1, 0]);
  });

  it('moves dimensions horizontally and restyles displayindex', () => {
    const s = setup();
    expect(s.drag.handle(pointer('down', 445, -10))).toBe(true);
    const move = pointer('move', 65, -10); // x = 60 ≥ 56: no swap.
    s.drag.handle(move);
    expect(move.cursor).toBe('ew-resize');
    expect(s.layout().order.dims).toEqual([0, 1]);
    expect(s.layout().dims[1]!.x).toBe(60);
    s.drag.handle(pointer('move', 50, -10)); // x = 45 < 56: swap.
    expect(s.layout().order.dims).toEqual([1, 0]);
    s.drag.handle(pointer('up', 50, -10));
    expect(s.drops).toEqual([{ 'dimensions[1].displayindex': 0, 'dimensions[0].displayindex': 1 }]);
  });

  it('moves the dimension with a category in freeform, and nothing when fixed', () => {
    const free = setup({ ...BASIC, arrangement: 'freeform' });
    free.drag.handle(pointer('down', 45, 50));
    const move = pointer('move', 105, 60);
    free.drag.handle(move);
    expect(move.cursor).toBe('move');
    expect(free.layout().dims[0]!.x).toBe(100);
    expect(free.layout().dims[0]!.cats[0]!.y).toBe(10);
    free.drag.handle(pointer('up', 105, 60));
    expect(free.drops).toEqual([]);
    expect(free.shown.at(-1)).toBeUndefined();

    const fixed = setup({ ...BASIC, arrangement: 'fixed' });
    expect(fixed.drag.handle(pointer('down', 45, 50))).toBe(false);
    expect(fixed.drag.active).toBe(false);
  });

  it('leaves a press without movement as a click', () => {
    const s = setup();
    s.drag.handle(pointer('down', 45, 50));
    expect(s.drag.handle(pointer('up', 45, 50))).toBe(true);
    expect(s.drag.handle(pointer('click', 45, 50))).toBe(false);
    expect(s.shown).toEqual([]);
    expect(s.drops).toEqual([]);
  });

  it('builds restyles for reordered categories of hidden-index dimensions', () => {
    const { calc } = build({
      dimensions: [{ values: [] }, { values: ['a', 'b'], categoryarray: ['b', 'a', 'z'] }],
    });
    const initial = { dims: [0], cats: [[0, 1]] };
    expect(restylePayload(calc, initial, initial)).toBeUndefined();
    expect(restylePayload(calc, initial, { dims: [0], cats: [[1, 0]] })).toEqual({
      'dimensions[1].categoryarray': [['a', 'b', 'z']],
      'dimensions[1].ticktext': [['a', 'b', 'z']],
      'dimensions[1].categoryorder': 'array',
    });
  });
});

describe('parcats view and description', () => {
  function plotCtx(input: Record<string, unknown> = BASIC) {
    const { trace, calc, fullLayout } = build(input);
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<ParcatsCalc> = {
      trace,
      calc,
      index: 0,
      fullLayout,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
      viewport: { size: { width: 600, height: 300 } } as Viewport,
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

  it('draws paths, hovered paths, bands, outlines and labels, and highlights on move', async () => {
    const { ctx, added } = plotCtx();
    const view = parcats.plot!.create(ctx);
    expect(added.map((p) => p.constructor)).toEqual([
      LazyFillPrimitive,
      LazyFillPrimitive,
      RectPrimitive,
      RectPrimitive,
      TextPrimitive,
    ]);
    const orders = added.map((p) => p.object.renderOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    const outlines = added[3] as unknown as { data: { borderWidth: Float32Array } };
    const move = pointer('move', 445, 20);
    expect(view.handlePointer!(move)).toBe(false);
    expect(move.cursor).toBe('ns-resize');
    expect(Array.from(outlines.data.borderWidth)).toEqual([1, 1, 2.5, 1]);
    view.handlePointer!(pointer('leave', 0, 0));
    expect(Array.from(outlines.data.borderWidth)).toEqual([1, 1, 1, 1]);
    // Hovering a path fills the hovered copy; the empty one loads fine too.
    view.handlePointer!(pointer('move', 248, 20));
    const fills = added.slice(0, 2) as LazyFillPrimitive[];
    await Promise.all(fills.map((f) => f.ready));
    expect(fills.every((f) => f.fill !== null)).toBe(true);
    view.handlePointer!(pointer('leave', 0, 0));
    // A press on a category is a drag.
    expect(view.handlePointer!(pointer('down', 45, 50))).toBe(true);
  });

  it('describes dimensions, paths and counts', () => {
    const { trace, calc, fullLayout } = build({
      ...BASIC,
      name: 'Survey',
      line: { color: [1, 1, 2, 2] },
    });
    const d = parcats.describe!({
      trace,
      calc,
      index: 0,
      fullLayout,
      xaxis: undefined,
      yaxis: undefined,
      maxRows: 2,
    })!;
    expect(d.summary).toBe(
      'Parallel categories "Survey": 2 dimensions (A and B), 3 paths, total count 4.',
    );
    expect(d.table).toEqual({
      caption: 'Survey',
      columns: ['A', 'B', 'Count', 'Color'],
      rows: [
        ['x', 'p', '1', '1'],
        ['x', 'q', '1', '1'],
      ],
      total: 3,
    });
  });
});
