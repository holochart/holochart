// @vitest-environment jsdom
import { supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import {
  createResourceManager,
  LinePrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type ComponentPointerEvent,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrushGesture, brushCursor, ordinalZone, regionAt, type BrushAxis } from './brush.ts';
import { calcParcoords, fixExtent, type ParcoordsCalc } from './calc.ts';
import { lineColorMapping } from './common.ts';
import { describeParcoords } from './describe.ts';
import { parcoords } from './index.ts';
import { hitAt, ParcoordsInteraction, type ParcoordsHitGeometry } from './interaction.ts';
import {
  axisTicks,
  axisX,
  dimensionContainer,
  dragOrder,
  labelPlacement,
  layoutAxes,
  rangeLabels,
  unitToY,
  yToUnit,
} from './layout.ts';
import { lineColors, lineGeometry, selectionMask, unselectedColor } from './lines.ts';
import { cleanRanges, mergeRanges, snapToTicks, storedRanges } from './ranges.ts';

const restyle = vi.fn(() => Promise.resolve());
vi.mock('@mk7s/holochart-runtime', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@mk7s/holochart-runtime')>();
  return { ...mod, getChart: (el: unknown) => (el ? { restyle } : undefined) };
});

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

const registry = createChartRegistry().register(parcoords);

function defaults(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'parcoords', ...trace }], layout },
    registry.core,
  );
  return { trace: fullData[0]!, fullLayout };
}

function calcOf(trace: Record<string, unknown>): { trace: FullTrace; calc: ParcoordsCalc } {
  const { trace: full } = defaults(trace);
  return { trace: full, calc: calcParcoords(full) };
}

const dimsOf = (trace: FullTrace) => trace['dimensions'] as Record<string, unknown>[];

describe('parcoords defaults', () => {
  it('hides dimensions without values, cleans constraint ranges and sets the line count', () => {
    const { trace } = defaults({
      dimensions: [
        { label: 'a', values: [1, 2, 3, 4], constraintrange: [3, 1] },
        { label: 'b', values: [] },
        {
          values: [5, 6, 7],
          constraintrange: [
            [4, 5],
            [4.5, 6],
            [8, 9],
          ],
        },
        {
          values: [1, 2, 3],
          multiselect: false,
          constraintrange: [
            [2, 3],
            [0, 1],
          ],
        },
      ],
    });
    const dims = dimsOf(trace);
    expect(dims[0]!['constraintrange']).toEqual([1, 3]);
    expect(dims[1]!['visible']).toBe(false);
    expect(dims[1]!['label']).toBeUndefined();
    expect(dims[2]!['constraintrange']).toEqual([
      [4, 6],
      [8, 9],
    ]);
    expect(dims[3]!['constraintrange']).toEqual([2, 3]);
    expect(dims.map((d) => d['_index'])).toEqual([0, 1, 2, 3]);
    expect(trace['_length']).toBe(3);
  });

  it('snaps constraint ranges of ordinal axes to their ticks', () => {
    const { trace } = defaults({
      dimensions: [{ values: [1, 2, 3], tickvals: [1, 2, 3], constraintrange: [1.4, 2.2] }],
    });
    // Low end up to tick 2, a quarter gap below it; high end down to tick 2, a quarter above.
    expect(dimsOf(trace)[0]!['constraintrange']).toEqual([1.75, 2.25]);
    // Fed back in, the stored value is stable (fixed point).
    const again = defaults({
      dimensions: [{ values: [1, 2, 3], tickvals: [1, 2, 3], constraintrange: [1.75, 2.25] }],
    });
    expect(dimsOf(again.trace)[0]!['constraintrange']).toEqual([1.75, 2.25]);
  });

  it('caps dimensions at 60 and hides a trace without any', () => {
    const many = Array.from({ length: 70 }, () => ({ values: [1, 2] }));
    expect(dimsOf(defaults({ dimensions: many }).trace)).toHaveLength(60);
    expect(defaults({ dimensions: [] }).trace.visible).toBe(false);
  });

  it('defaults the line colorscale (Viridis, no autocolorscale) only for numeric colors', () => {
    const plain = defaults({ dimensions: [{ values: [1, 2] }] }, { colorway: ['#123456'] }).trace;
    expect((plain['line'] as Record<string, unknown>)['color']).toBe('rgb(18, 52, 86)');
    expect((plain['line'] as Record<string, unknown>)['cauto']).toBeUndefined();
    const scaled = defaults({ dimensions: [{ values: [1, 2, 3] }], line: { color: [1, 2] } }).trace;
    const line = scaled['line'] as Record<string, unknown>;
    expect(line['colorscale']).toBe('Viridis');
    expect(line['autocolorscale']).toBe(false);
    expect(line['cauto']).toBe(true);
    expect(line['showscale']).toBe(false);
    expect(scaled['_length']).toBe(2);
  });

  it('sizes the fonts at 1/1.2 of layout.font and defaults the unselected style', () => {
    const { trace } = defaults(
      { dimensions: [{ values: [1] }] },
      { font: { size: 12, color: '#abc' } },
    );
    expect((trace['labelfont'] as Record<string, unknown>)['size']).toBe(10);
    expect((trace['tickfont'] as Record<string, unknown>)['color']).toBe('rgb(170, 187, 204)');
    expect((trace['rangefont'] as Record<string, unknown>)['size']).toBe(10);
    expect(trace['unselected']).toEqual({ line: { color: 'rgb(127, 127, 127)', opacity: 'auto' } });
    expect(trace['labelside']).toBe('top');
    expect(trace['labelangle']).toBe(0);
  });
});

describe('parcoords calc', () => {
  it('maps values onto their axis range (given, flipped, or the extent)', () => {
    const { calc } = calcOf({
      dimensions: [
        { values: [0, 5, 10] },
        { values: [0, 5, 10], range: [10, 0] },
        { values: [2, 2, 2] },
        { values: [0, 5, 20], range: [0, 20] },
      ],
    });
    expect(calc.dimensions.map((d) => d.range)).toEqual([
      [0, 10],
      [10, 0],
      [1.8, 2.2],
      [0, 20],
    ]);
    expect(Array.from(calc.dimensions[0]!.unit)).toEqual([0, 0.5, 1]);
    expect(Array.from(calc.dimensions[1]!.unit)).toEqual([1, 0.5, 0]);
    expect(Array.from(calc.dimensions[3]!.unit)).toEqual([0, 0.25, 1]);
    expect(fixExtent(0, 0)).toEqual([-1, 1]);
    expect(fixExtent(NaN, Infinity)).toEqual([-1, 1]);
  });

  it('draws lines with higher color values on top', () => {
    const { calc } = calcOf({
      dimensions: [{ values: [1, 2, 3, 4] }],
      line: { color: [3, NaN, 1, 2] },
    });
    expect(Array.from(calc.order)).toEqual([1, 2, 3, 0]);
    expect(calc.colorExtent).toEqual([1, 3]);
  });
});

describe('parcoords layout', () => {
  const rect = { x: 100, y: 50, width: 300, height: 204 };

  it('puts the first and last axes on the domain edges', () => {
    expect([0, 1, 2, 3].map((s) => axisX(rect, 4, s))).toEqual([100, 200, 300, 400]);
    expect(axisX(rect, 1, 0)).toBe(100);
  });

  it('maps axis positions to px 2 px inside the domain, and back', () => {
    expect(unitToY(rect, 0)).toBe(252);
    expect(unitToY(rect, 1)).toBe(52);
    expect(unitToY(rect, 0.5)).toBe(152);
    expect(yToUnit(rect, 102)).toBeCloseTo(0.75, 12);
  });

  it('computes ticks with core, and ordinal ticks from tickvals / ticktext', () => {
    const { trace, calc } = calcOf({
      dimensions: [
        { values: [0, 10] },
        { values: [1, 3], tickvals: [1, 2, 3], ticktext: ['low', 'mid'] },
        { values: [0, 1], tickformat: '.0%' },
      ],
    });
    const lin = axisTicks(calc.dimensions[0]!, dimensionContainer(trace, calc.dimensions[0]!), 200);
    expect(lin.map((t) => t.text)).toEqual(['0', '2', '4', '6', '8', '10']);
    expect(lin[1]!.u).toBeCloseTo(0.2, 12);
    const ord = axisTicks(calc.dimensions[1]!, dimensionContainer(trace, calc.dimensions[1]!), 200);
    expect(ord).toEqual([
      { u: 0, text: 'low' },
      { u: 0.5, text: 'mid' },
    ]);
    const pct = axisTicks(calc.dimensions[2]!, dimensionContainer(trace, calc.dimensions[2]!), 200);
    expect(pct.at(-1)!.text).toBe('100%');
  });

  it('labels the range ends to 1 % of the span, not on ordinal axes', () => {
    const { trace, calc } = calcOf({
      dimensions: [{ values: [0.123, 7.891] }, { values: [1, 2], tickvals: [1, 2] }],
    });
    const d0 = calc.dimensions[0]!;
    expect(rangeLabels(d0, dimensionContainer(trace, d0))).toEqual({
      bottom: '0.123',
      top: '7.891',
    });
    const d1 = calc.dimensions[1]!;
    expect(rangeLabels(d1, dimensionContainer(trace, d1))).toEqual({ bottom: '', top: '' });
  });

  it('places axis labels 28 px beyond the axis end, anchored by angle', () => {
    expect(labelPlacement(0, 'top')).toEqual({ dy: -28, anchorX: 'center' });
    expect(labelPlacement(0, 'bottom')).toEqual({ dy: 28, anchorX: 'center' });
    expect(labelPlacement(-90, 'top').anchorX).toBe('left');
    expect(labelPlacement(90, 'top').anchorX).toBe('right');
    expect(labelPlacement(90, 'bottom').anchorX).toBe('left');
  });

  it('reorders axes by the dragged axis position and clamps it to the overdrag', () => {
    expect(dragOrder(rect, [0, 1, 2, 3], 0, 250)).toEqual([1, 0, 2, 3]);
    expect(dragOrder(rect, [0, 1, 2, 3], 3, 90)).toEqual([3, 0, 1, 2]);
    const { calc } = calcOf({ dimensions: [{ values: [1] }, { values: [2] }] });
    const axes = layoutAxes(calc, rect, [0, 1], { dim: 1, x: 1000 });
    expect(axes.map((a) => a.x)).toEqual([100, 445]);
  });
});

describe('parcoords constraint ranges', () => {
  it('merges overlapping and touching ranges', () => {
    expect(
      mergeRanges([
        [5, 6],
        [1, 2],
        [2, 3],
        [5.5, 7],
      ]),
    ).toEqual([
      [1, 3],
      [5, 7],
    ]);
  });

  it('snaps ordinal range ends with a quarter-gap overshoot, none at the outer ticks', () => {
    const ticks = [0, 10, 20, 30];
    expect(snapToTicks(false, ticks, 12)).toBe(17.5);
    // Within 1 % past tick 10: down to it, then a quarter gap below.
    expect(snapToTicks(false, ticks, 10.05)).toBe(7.5);
    expect(snapToTicks(false, ticks, -5)).toBe(0);
    expect(snapToTicks(true, ticks, 18)).toBe(12.5);
    expect(snapToTicks(true, ticks, 35)).toBe(30);
    // Ends inside a staying range are kept.
    expect(snapToTicks(false, ticks, 12, [[11, 13]])).toBe(12);
  });

  it('stores one range bare and several as a list', () => {
    expect(storedRanges([])).toBeUndefined();
    expect(storedRanges([[1, 2]])).toEqual([1, 2]);
    expect(
      storedRanges([
        [1, 2],
        [3, 4],
      ]),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(cleanRanges([[2, 1]], true)).toEqual([[1, 2]]);
  });
});

describe('parcoords brushing', () => {
  // A 0–100 axis drawn from y = 400 (bottom) to y = 0 (top): 4 px per unit.
  const axis = (multiselect = true, ticks?: number[]): BrushAxis => ({
    valueAt: (y) => (400 - y) / 4,
    yOf: (v) => 400 - 4 * v,
    ticks,
    multiselect,
  });

  it('finds the end and body regions of a range, 8 px beyond it at most', () => {
    const a = axis();
    const ranges = [[20, 60] as const];
    // Range px: top 160 (60), bottom 320 (20); ends are its outer 10 % (16 px).
    expect(regionAt(a, ranges, 155)?.region).toBe('n');
    expect(regionAt(a, ranges, 170)?.region).toBe('n');
    expect(regionAt(a, ranges, 240)?.region).toBe('ns');
    expect(regionAt(a, ranges, 310)?.region).toBe('s');
    expect(regionAt(a, ranges, 329)?.region).toBeUndefined();
    expect(brushCursor(a, ranges, 240)).toBe('ns-resize');
    expect(brushCursor(a, ranges, 100)).toBe('crosshair');
  });

  it('creates a range by dragging on an empty axis', () => {
    const g = new BrushGesture(axis(), [], 200);
    expect(g.move(100)).toEqual([[50, 75]]);
    expect(g.end(100)).toEqual([[50, 75]]);
  });

  it('extends a range by dragging its end, and moves it by dragging its body', () => {
    const grow = new BrushGesture(axis(), [[20, 60]], 162);
    grow.move(40);
    expect(grow.end(40)).toEqual([[20, 90]]);
    const move = new BrushGesture(axis(), [[20, 60]], 240);
    expect(move.move(200)).toEqual([[30, 70]]);
    expect(move.end(200)).toEqual([[30, 70]]);
  });

  it('adds ranges with multiselect (merging overlaps) and replaces them without', () => {
    const multi = new BrushGesture(axis(), [[20, 30]], 40);
    multi.move(80);
    expect(multi.end(80)).toEqual([
      [20, 30],
      [80, 90],
    ]);
    const merge = new BrushGesture(axis(), [[20, 30]], 260);
    merge.move(240);
    // A new range 35–40 does not touch 20–30; 25–40 does.
    expect(merge.end(240)).toEqual([
      [20, 30],
      [35, 40],
    ]);
    const single = new BrushGesture(axis(false), [[20, 30]], 40);
    single.move(80);
    expect(single.end(80)).toEqual([[80, 90]]);
  });

  it('clears on a click off the ranges and removes a range clicked on its body', () => {
    const ranges = [
      [20, 30],
      [60, 80],
    ] as const;
    expect(new BrushGesture(axis(), ranges, 20).end(20)).toEqual([]);
    expect(new BrushGesture(axis(), ranges, 120).end(120)).toEqual([[20, 30]]);
    expect(new BrushGesture(axis(false), ranges, 120).end(120)).toEqual([]);
  });

  it('selects a tick zone on click and snaps drags to the ticks on ordinal axes', () => {
    const ticks = [0, 25, 50, 75, 100];
    expect(ordinalZone(ticks, 48)).toEqual([43.75, 56.25]);
    expect(ordinalZone(ticks, 40)).toBeUndefined();
    expect(new BrushGesture(axis(true, ticks), [], 208).end(208)).toEqual([[43.75, 56.25]]);
    const drag = new BrushGesture(axis(true, ticks), [], 280); // 30
    drag.move(120); // 70
    expect(drag.end(120)).toEqual([[43.75, 56.25]]);
  });
});

describe('parcoords interaction', () => {
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
  const brush: BrushAxis = {
    valueAt: (y) => (400 - y) / 4,
    yOf: (v) => 400 - 4 * v,
    multiselect: true,
  };
  const geometry: ParcoordsHitGeometry = {
    rect: { x: 0, y: 0, width: 200, height: 400 },
    axes: [
      { dim: 0, x: 0, top: 2, bottom: 398, label: undefined, brush, ranges: [] },
      {
        dim: 1,
        x: 200,
        top: 2,
        bottom: 398,
        label: { x: 180, y: -40, width: 40, height: 14 },
        brush,
        ranges: [],
      },
    ],
  };

  it('finds brush strips and labels', () => {
    expect(hitAt(geometry, 4, 100)?.zone).toBe('brush');
    expect(hitAt(geometry, 6, 100)).toBeUndefined();
    expect(hitAt(geometry, 190, -30)).toEqual({ axis: geometry.axes[1], zone: 'label' });
  });

  it('brushes an axis and reorders by dragging a label', () => {
    const host = {
      geometry: () => geometry,
      previewRanges: vi.fn(),
      commitRanges: vi.fn(),
      dragAxis: vi.fn(),
      reorder: vi.fn(),
    };
    const ia = new ParcoordsInteraction(host);
    expect(ia.handle(pointer('move', 300, 100))).toBe(false);
    const move = pointer('move', 1, 100);
    expect(ia.handle(move)).toBe(true);
    expect(move.cursor).toBe('crosshair');
    ia.handle(pointer('down', 1, 200));
    ia.handle(pointer('move', 1, 100));
    expect(host.previewRanges).toHaveBeenLastCalledWith(0, [[50, 75]]);
    ia.handle(pointer('up', 1, 100));
    expect(host.commitRanges).toHaveBeenCalledWith(0, [[50, 75]], expect.anything());
    expect(ia.active).toBe(false);

    ia.handle(pointer('down', 200, -33));
    ia.handle(pointer('move', 190, -33));
    ia.handle(pointer('move', -20, -33));
    expect(host.dragAxis).toHaveBeenLastCalledWith({ dim: 1, x: -20, order: [1, 0] });
    ia.handle(pointer('up', -20, -33));
    expect(host.dragAxis).toHaveBeenLastCalledWith(undefined);
    expect(host.reorder).toHaveBeenCalledWith([1, 0], expect.anything());
  });
});

describe('parcoords lines', () => {
  it('builds one polyline per row, rows in draw order, in axis space', () => {
    const { calc } = calcOf({
      dimensions: [{ values: [0, 10] }, { values: [5, 0] }],
      line: { color: [2, 1] },
    });
    const g = lineGeometry(calc, [1, 0], [0, 1]);
    // Row 1 (color 1) first, then row 0; axes swapped.
    expect(Array.from(g.x)).toEqual([0, 1, 0, 1]);
    expect(Array.from(g.y)).toEqual([0, 1, 1, 0]);
    expect(Array.from(g.starts)).toEqual([2]);
  });

  it('colors lines through the colorscale and dims the unselected ones', () => {
    const { trace, calc } = calcOf({
      dimensions: [{ values: [1, 2, 3] }],
      line: {
        color: [0, 5, 10],
        colorscale: [
          [0, '#000000'],
          [1, '#ffffff'],
        ],
      },
    });
    const mapping = lineColorMapping(trace, undefined, calc.colorExtent)!;
    const lut = new Float32Array([0, 0, 0, 1, 1, 1, 1, 1]);
    const mask = selectionMask(calc, new Map([[0, [[1.5, 3]] as const]]));
    expect(Array.from(mask!)).toEqual([0, 1, 1]);
    const unsel = unselectedColor([0.5, 0.5, 0.5, 1], 'auto', 8);
    expect(unsel[3]).toBeCloseTo(0.5, 12);
    const colors = lineColors(
      calc,
      1,
      { mapping, lut, flat: [1, 0, 0, 1], unselected: unsel },
      mask,
    );
    expect(Array.from(colors)).toEqual([0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(selectionMask(calc, new Map())).toBeUndefined();
    expect(unselectedColor([0, 0, 0, 0.5], 0.5, 8)[3]).toBe(0.25);
  });
});

describe('parcoords view', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    restyle.mockClear();
  });

  function viewOf(input: Record<string, unknown>) {
    const { trace, fullLayout } = defaults(input);
    const calc = calcParcoords(trace);
    const added: Primitive<unknown>[] = [];
    const ctx = (t: FullTrace, c: ParcoordsCalc): TracePlotContext<ParcoordsCalc> => ({
      trace: t,
      calc: c,
      index: 0,
      fullLayout,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
      viewport: { size: { width: 600, height: 400, pixelRatio: 1 } } as unknown as Viewport,
      domain: { x: [0, 1], y: [0, 1], rect: { x: 50, y: 50, width: 500, height: 304 } },
      primitives: { resources: createResourceManager(), invalidate: vi.fn() },
      add: (p) => {
        added.push(p as Primitive<unknown>);
        return p;
      },
      remove: (p) => p.dispose(),
      invalidate: vi.fn(),
    });
    const view = parcoords.plot!.create(ctx(trace, calc));
    const line = added.find((p) => p instanceof LinePrimitive) as LinePrimitive;
    return { view, line, trace, calc, ctx };
  }

  it('recolors on brushing and style restyles without rebuilding the geometry', () => {
    const { view, line, trace, calc, ctx } = viewOf({
      dimensions: [{ values: [0, 5, 10] }, { values: [1, 2, 3] }],
      line: { color: [1, 2, 3] },
    });
    expect(line.instanceCount).toBeGreaterThan(0);
    const update = vi.spyOn(LinePrimitive.prototype, 'update');
    const el = document.createElement('div');
    const at = (type: ComponentPointerEvent['type'], y: number): ComponentPointerEvent => ({
      type,
      x: 50,
      y,
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      native: { target: el } as unknown as Event,
      cursor: undefined,
    });
    // Brush the first axis (x = 50) from its middle (5) to the top (10).
    expect(view.handlePointer!(at('down', 202))).toBe(true);
    view.handlePointer!(at('move', 52));
    view.handlePointer!(at('up', 52));
    expect(update.mock.calls.length).toBeGreaterThan(0);
    for (const [patch] of update.mock.calls) expect(Object.keys(patch)).toEqual(['color']);
    expect(restyle).toHaveBeenCalledTimes(1);
    const [edit, traces, options] = restyle.mock.calls[0] as unknown as [
      Record<string, unknown>,
      number[],
      unknown,
    ];
    expect(Object.keys(edit)).toEqual(['dimensions[0].constraintrange']);
    const [[lo, hi]] = edit['dimensions[0].constraintrange'] as [[number, number]];
    expect(lo).toBeCloseTo(5, 6);
    expect(hi).toBeCloseTo(10, 6);
    expect(traces).toEqual([0]);
    expect(options).toEqual({ gui: true });

    // A style restyle (colorscale) recolors in place too.
    update.mockClear();
    const restyled = { ...trace, line: { ...(trace['line'] as object), colorscale: 'Greys' } };
    view.update(ctx(restyled as FullTrace, calc), {
      calc: false,
      plot: false,
      style: true,
      transform: false,
    });
    expect(update.mock.calls.map(([p]) => Object.keys(p))).toEqual([['color']]);
  });

  it('restyles the dimensions in the new order when an axis label is dropped', () => {
    const { view } = viewOf({
      dimensions: [
        { label: 'A', values: [1, 2] },
        { label: 'B', values: [3, 4], visible: false },
        { label: 'C', values: [5, 6] },
      ],
    });
    const el = document.createElement('div');
    const ev = (type: ComponentPointerEvent['type'], x: number): ComponentPointerEvent => ({
      type,
      x,
      y: 50 - 28 - 3,
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      native: { target: el } as unknown as Event,
      cursor: undefined,
    });
    // Label "A" sits centered on x = 50, 28 px above the domain.
    expect(view.handlePointer!(ev('down', 50))).toBe(true);
    view.handlePointer!(ev('move', 300));
    view.handlePointer!(ev('move', 600));
    view.handlePointer!(ev('up', 600));
    const [edit] = restyle.mock.calls[0] as unknown as [Record<string, unknown[][]>];
    const dims = edit['dimensions']![0] as { label: string }[];
    expect(dims.map((d) => d.label)).toEqual(['C', 'B', 'A']);
  });
});

describe('parcoords describe', () => {
  it('summarizes axes, brushes and the selected share, with a table of lines', () => {
    const { trace, calc } = calcOf({
      name: 'cars',
      dimensions: [
        { label: 'mpg', values: [10, 20, 30] },
        { label: 'hp', values: [300, 150, 90], constraintrange: [100, 400] },
      ],
      line: { color: [1, 2, 3] },
    });
    const d = describeParcoords({
      trace,
      calc,
      index: 0,
      fullLayout: {} as never,
      xaxis: undefined,
      yaxis: undefined,
      maxRows: 2,
    });
    expect(d.summary).toBe(
      'Parallel coordinates "cars": 3 lines across 2 axes: mpg (10 to 30) and hp (90 to 300). Brushed: hp 100 to 400; 2 of 3 lines selected.',
    );
    expect(d.table?.columns).toEqual(['mpg', 'hp', 'Color value', 'Selected']);
    expect(d.table?.rows).toEqual([
      ['10', '300', '1', 'yes'],
      ['20', '150', '2', 'yes'],
    ]);
    expect(d.table?.total).toBe(3);
  });
});
