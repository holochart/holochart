import {
  createScale,
  supplyDefaults,
  uniformTextSize,
  type FullTrace,
  type UniformText,
} from '@mk7s/holochart-core';
import {
  createResourceManager,
  IDENTITY_TRANSFORM,
  TextPrimitive,
  type Primitive,
  type PrimitiveContext,
  type TextLabel,
  type Viewport,
} from '@mk7s/holochart-render';
import {
  createChartRegistry,
  type AxisInfo,
  type ComponentPointerEvent,
  type SubplotInfo,
  type TracePlotContext,
} from '@mk7s/holochart-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bar, type BarCalc } from './index.ts';
import { formatTemplate } from './template.ts';
import {
  barLabel,
  barTextLabels,
  labelSize,
  placeBarText,
  planBarText,
  TEXTPAD,
  type BarBox,
  type BarTextContext,
  type TextPlacementOptions,
} from './text.ts';

// troika typesets in a worker with browser globals; the view tests only need its object graph.
// Mocked by path, like the scatter tests: traces-basic does not depend on troika, render does.
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

const base: TextPlacementOptions = {
  position: 'auto',
  horizontal: false,
  outmost: true,
  angle: 'auto',
  anchor: 'end',
  constrainInside: true,
  constrainOutside: true,
  inside: { width: 20, height: 12 },
  outside: { width: 20, height: 12 },
};

// A vertical bar 40 px wide from y = 0 up to y = 100 (y up).
const tall: BarBox = { x0: 0, y0: 0, x1: 40, y1: 100 };

describe('placeBarText', () => {
  it('auto: puts a fitting label inside, against the bar end', () => {
    const p = placeBarText(tall, base)!;
    expect(p.inside).toBe(true);
    expect(p.cx).toBe(20);
    expect(p.cy).toBe(100 - TEXTPAD - 6);
    expect([p.rotate, p.scale]).toEqual([0, 1]);
  });

  it('auto: goes outside when the label does not fit, past the bar end', () => {
    const label = { width: 30, height: 12 };
    // Shrunk to the bar width (10 / 30), the label is 4 px tall: fits a 5 px bar, not a 3 px one.
    const fitsShrunk: BarBox = { x0: 0, y0: 0, x1: 10, y1: 5 };
    expect(placeBarText(fitsShrunk, { ...base, inside: label, outside: label })!.inside).toBe(true);
    const short: BarBox = { x0: 0, y0: 0, x1: 10, y1: 3 };
    const p = placeBarText(short, { ...base, inside: label, outside: label })!;
    expect(p.inside).toBe(false);
    // Outside labels are constrained to the bar width too.
    expect(p.scale).toBeCloseTo(1 / 3);
    expect(p.cy).toBeCloseTo(3 + TEXTPAD + 2);
  });

  it('auto: inner bars of a stack stay inside, and outside becomes inside for them', () => {
    const short: BarBox = { x0: 0, y0: 0, x1: 10, y1: 5 };
    expect(placeBarText(short, { ...base, outmost: false })!.inside).toBe(true);
    expect(placeBarText(tall, { ...base, position: 'outside', outmost: false })!.inside).toBe(true);
  });

  it('points outside labels away from negative bars', () => {
    const down: BarBox = { x0: 0, y0: 100, x1: 40, y1: 60 };
    const p = placeBarText(down, { ...base, position: 'outside' })!;
    expect(p.cy).toBe(60 - TEXTPAD - 6);
    const inside = placeBarText(down, { ...base, position: 'inside' })!;
    expect(inside.cy).toBe(60 + TEXTPAD + 6);
  });

  it('anchors inside labels at the start or middle', () => {
    expect(placeBarText(tall, { ...base, anchor: 'start' })!.cy).toBe(TEXTPAD + 6);
    expect(placeBarText(tall, { ...base, anchor: 'middle' })!.cy).toBe(50);
  });

  it('rotates a long label 90° inside a tall, narrow bar (textangle auto)', () => {
    const narrow: BarBox = { x0: 0, y0: 0, x1: 16, y1: 100 };
    const p = placeBarText(narrow, {
      ...base,
      position: 'inside',
      inside: { width: 60, height: 8 },
    })!;
    expect(p.rotate).toBe(90);
    expect(p.scale).toBe(1);
  });

  it('keeps an explicit angle and shrinks to fit when constrained', () => {
    const narrow: BarBox = { x0: 0, y0: 0, x1: 16, y1: 100 };
    const opts = {
      ...base,
      position: 'inside' as const,
      angle: 0,
      inside: { width: 60, height: 12 },
    };
    expect(placeBarText(narrow, opts)!.scale).toBeCloseTo(10 / 60);
    expect(placeBarText(narrow, { ...opts, constrainInside: false })!.scale).toBe(1);
  });

  it('places horizontal-bar labels along x', () => {
    const wide: BarBox = { x0: 0, y0: 0, x1: 200, y1: 30 };
    const p = placeBarText(wide, { ...base, horizontal: true })!;
    expect(p.cx).toBe(200 - TEXTPAD - 10);
    expect(p.cy).toBe(15);
    const out = placeBarText(
      { x0: 0, y0: 0, x1: 10, y1: 30 },
      {
        ...base,
        horizontal: true,
        position: 'outside',
      },
    )!;
    expect(out.cx).toBe(10 + TEXTPAD + 10);
  });

  it('shows nothing for none or an empty label', () => {
    expect(placeBarText(tall, { ...base, position: 'none' })).toBeNull();
    const empty = { width: 0, height: 12 };
    expect(placeBarText(tall, { ...base, inside: empty, outside: empty })).toBeNull();
  });
});

describe('formatTemplate', () => {
  it('fills variables with labels, d3 and date formats', () => {
    const scope = {
      values: { value: 3.14159, label: 'A', x: Date.UTC(2024, 2, 5), customdata: [7, 8] },
      labels: { label: 'Label A' },
    };
    expect(formatTemplate('%{label}: %{value:.1f}', scope)).toBe('Label A: 3.1');
    expect(formatTemplate('%{x|%b %Y}', scope)).toBe('Mar 2024');
    expect(formatTemplate('%{customdata[1]} %{missing}!', scope)).toBe('8 !');
    expect(formatTemplate('plain', scope)).toBe('plain');
  });
});

const registry = createChartRegistry().register(bar);

function setup(trace: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'bar', ...trace }], layout },
    registry.core,
  );
  const x = {
    id: 'x',
    scale: createScale({ type: 'category', categories: ['a', 'b'], range: [-0.5, 1.5] }),
  } as unknown as AxisInfo;
  const y = {
    id: 'y',
    scale: createScale({ type: 'linear', range: [0, 10] }),
  } as unknown as AxisInfo;
  const t = fullData[0] as FullTrace;
  const calc = bar.calc!(t, { fullLayout, index: 0, xaxis: x, yaxis: y }) as BarCalc;
  return { trace: t, calc, x, y };
}

describe('bar labels', () => {
  it('uses texttemplate over text, with the bar value and position', () => {
    const { trace, calc } = setup({
      x: ['a', 'b'],
      y: [2, 5],
      text: ['t0', 't1'],
      texttemplate: '%{label}=%{value} (%{text})',
    });
    expect(barLabel(trace, calc, 1)).toBe('b=5 (t1)');
    const plain = setup({ x: ['a', 'b'], y: [2, 5], text: 'same' });
    expect(barLabel(plain.trace, plain.calc, 0)).toBe('same');
  });

  it('builds one label per bar with contrast colors, in linear coordinates', () => {
    const { trace, calc } = setup(
      { x: ['a', 'b'], y: [8, 0.2], text: ['long label here', 'b'], marker: { color: '#000' } },
      {},
    );
    // 100 px per category, 20 px per y unit.
    const transform = { ...IDENTITY_TRANSFORM, scaleX: 100, offsetX: 50, scaleY: 20 };
    const labels = barTextLabels(trace, calc, {
      transform,
      xRange: [-0.5, 1.5],
      yRange: [0, 10],
      fill: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
      background: [1, 1, 1, 1],
      formatters: {},
      floor: NaN,
      selected: null,
    });
    expect(labels).toHaveLength(2);
    const [first, second] = labels;
    // Inside the tall black bar: white, centered on the bar.
    expect(first!.color).toEqual([1, 1, 1, 1]);
    expect(first!.x).toBeCloseTo(0);
    expect(first!.y).toBeLessThan(8);
    // The short bar's label goes outside, above it, in the default dark color.
    expect(second!.y).toBeGreaterThan(0.2);
    expect(second!.color?.[0]).toBeCloseTo(68 / 255);
  });

  it('dims labels of unselected bars', () => {
    const { trace, calc } = setup({ x: ['a', 'b'], y: [8, 8], text: ['a', 'b'] });
    const labels = barTextLabels(trace, calc, {
      transform: { ...IDENTITY_TRANSFORM, scaleX: 100, scaleY: 20 },
      xRange: undefined,
      yRange: undefined,
      fill: new Float32Array(8).fill(1),
      background: [1, 1, 1, 1],
      formatters: {},
      floor: NaN,
      selected: new Set([0]),
    });
    expect(labels[0]!.color?.[3]).toBe(1);
    expect(labels[1]!.color?.[3]).toBeCloseTo(0.2);
  });
});

// ---- Rich text (E2.10) and uniformtext (E4.6) ---------------------------------------------------

/** 100 px per category (bars 80 px wide), 20 px per y unit, y range [0, 10]. */
function textContext(overrides: Partial<BarTextContext> = {}): BarTextContext {
  return {
    transform: { ...IDENTITY_TRANSFORM, scaleX: 100, offsetX: 50, scaleY: 20 },
    xRange: [-0.5, 1.5],
    yRange: [0, 10],
    fill: new Float32Array(8).fill(0.5),
    background: [1, 1, 1, 1],
    formatters: {},
    floor: NaN,
    selected: null,
    ...overrides,
  };
}

describe('bar rich-text labels', () => {
  it('draws mixed styles as runs and label-wide styles as one plain label', () => {
    const { trace, calc } = setup({
      x: ['a', 'b'],
      y: [8, 8],
      text: ['x<sup>2</sup>', '<b>50%</b>'],
      insidetextfont: { size: 20 },
    });
    const [sup, bold] = barTextLabels(trace, calc, textContext());
    expect(sup!.text).toBe('x2');
    expect(sup!.runs).toEqual([[{ text: 'x' }, { text: '2', font: { size: 14 }, shift: 8.4 }]]);
    expect(bold!.text).toBe('50%');
    expect(bold!.runs).toBeUndefined();
    expect(bold!.font).toMatchObject({ size: 20, weight: 'bold' });
  });

  it('scales runs with a label shrunk to fit its bar', () => {
    const { trace, calc } = setup({
      x: ['a', 'b'],
      y: [0.6, 8],
      text: ['wide label x<sup>2</sup>', ''],
      textposition: 'inside',
      insidetextfont: { size: 20 },
    });
    const [label] = barTextLabels(trace, calc, textContext());
    const size = label!.font!.size!;
    expect(size).toBeLessThan(20);
    const sup = label!.runs![0]![1]!;
    expect(sup.font?.size).toBeCloseTo(14 * (size / 20));
    expect(sup.shift).toBeCloseTo(8.4 * (size / 20));
  });

  it('measures rich labels without their markup', () => {
    const font = { family: 'sans-serif', size: 12 };
    expect(labelSize('<b>ab</b>', font).width).toBeCloseTo(
      labelSize('ab', { ...font, weight: 'bold' }).width,
    );
    expect(labelSize('a<br>b', font).height).toBeCloseTo(2 * 12 * 1.2);
  });

  it('fades explicit run colors of unselected bars', () => {
    const { trace, calc } = setup({
      x: ['a', 'b'],
      y: [8, 8],
      text: 'a<span style="color:#ff0000">b</span>',
    });
    const labels = barTextLabels(trace, calc, textContext({ selected: new Set([0]) }));
    expect(labels[0]!.runs![0]![1]!.color).toEqual([1, 0, 0, 1]);
    expect(labels[1]!.runs![0]![1]!.color?.[3]).toBeCloseTo(0.2);
  });
});

describe('bar uniformtext', () => {
  const HIDE: UniformText = { mode: 'hide', minsize: 10 };
  const SHOW: UniformText = { mode: 'show', minsize: 10 };

  // Trace A: 20 px labels that fit. Trace B: a 12 px label that fits, and one squeezed below
  // minsize into a 6 px bar (a hidden candidate).
  const a = setup({ x: ['a', 'b'], y: [8, 8], text: 'AA', insidetextfont: { size: 20 } });
  const b = setup({
    x: ['a', 'b'],
    y: [8, 0.3],
    text: ['B', 'a long label'],
    textposition: 'inside',
    insidetextfont: { size: 12 },
  });

  it('records every label, hidden candidates included', () => {
    const plan = planBarText(b.trace, b.calc, textContext({ uniformText: HIDE }));
    expect(plan.items).toHaveLength(2);
    expect(plan.items[0]).toEqual({ fontSize: 12, scale: 1 });
    expect(plan.items[1]!.fontSize * plan.items[1]!.scale).toBeLessThan(10);
    // Nothing is recorded without a mode.
    expect(planBarText(b.trace, b.calc, textContext()).items).toHaveLength(0);
  });

  it('draws both traces at the smallest size and hides candidates in hide mode', () => {
    const planA = planBarText(a.trace, a.calc, textContext({ uniformText: HIDE }));
    const planB = planBarText(b.trace, b.calc, textContext({ uniformText: HIDE }));
    const size = uniformTextSize([...planA.items, ...planB.items], HIDE);
    expect(size).toBe(12);
    expect(planA.labels(size).map((l) => l.font?.size)).toEqual([12, 12]);
    const labelsB = planB.labels(size);
    expect(labelsB.map((l) => l.text)).toEqual(['B']);
    expect(labelsB[0]!.font?.size).toBe(12);
  });

  it('draws hidden candidates at the uniform size in show mode', () => {
    const planA = planBarText(a.trace, a.calc, textContext({ uniformText: SHOW }));
    const planB = planBarText(b.trace, b.calc, textContext({ uniformText: SHOW }));
    const size = uniformTextSize([...planA.items, ...planB.items], SHOW);
    const labelsB = planB.labels(size);
    expect(labelsB.map((l) => [l.text, l.font?.size])).toEqual([
      ['B', 12],
      ['a long label', 12],
    ]);
  });

  it('keeps the anchored bar end when resizing', () => {
    const plan = planBarText(a.trace, a.calc, textContext({ uniformText: HIDE }));
    const [label] = plan.labels(12);
    // End-anchored inside label: its top stays TEXTPAD below the bar end (8 · 20 = 160 px).
    const height = 12 * 1.2;
    expect(label!.y * 20).toBeCloseTo(160 - TEXTPAD - height / 2);
  });

  it('raises fonts below minsize before fitting', () => {
    const small = setup({ x: ['a', 'b'], y: [8, 8], text: 'x', insidetextfont: { size: 6 } });
    const plan = planBarText(small.trace, small.calc, textContext({ uniformText: HIDE }));
    expect(plan.items[0]).toEqual({ fontSize: 10, scale: 1 });
    expect(plan.labels().map((l) => l.font?.size)).toEqual([10, 10]);
  });

  it('changes nothing when the mode is off', () => {
    const off = barTextLabels(
      b.trace,
      b.calc,
      textContext({ uniformText: { mode: false, minsize: 20 } }),
    );
    expect(off).toEqual(barTextLabels(b.trace, b.calc, textContext()));
    expect(off).toHaveLength(2);
  });
});

describe('bar view text', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function viewContext(
    trace: FullTrace,
    calc: BarCalc,
    primitives: PrimitiveContext,
    fullLayout: Record<string, unknown>,
    subplot?: SubplotInfo,
  ) {
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<BarCalc> = {
      trace,
      calc,
      index: 0,
      fullLayout: fullLayout as never,
      subplot,
      xaxis: undefined,
      yaxis: undefined,
      transform: { ...IDENTITY_TRANSFORM, scaleX: 100, offsetX: 50, scaleY: 20 },
      viewport: {} as Viewport,
      primitives,
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

  const labelsOf = (added: Primitive<unknown>[]): TextLabel[] => {
    const text = added.find((p) => p instanceof TextPrimitive);
    return (text as unknown as { data: { labels: TextLabel[] } } | undefined)?.data.labels ?? [];
  };

  it('negotiates one size across bar traces, refreshing views drawn earlier', () => {
    const layout = { uniformtext: { mode: 'hide', minsize: 10 } };
    const a = setup({ x: ['a', 'b'], y: [8, 8], text: 'AA', insidetextfont: { size: 20 } }, layout);
    const b = setup({ x: ['a', 'b'], y: [8, 8], text: 'B', insidetextfont: { size: 12 } }, layout);
    const primitives: PrimitiveContext = {
      resources: createResourceManager(),
      invalidate: vi.fn(),
    };
    const va = viewContext(a.trace, a.calc, primitives, layout);
    const viewA = bar.plot!.create(va.ctx);
    expect(labelsOf(va.added).map((l) => l.font?.size)).toEqual([20, 20]);
    const vb = viewContext(b.trace, b.calc, primitives, layout);
    const viewB = bar.plot!.create(vb.ctx);
    expect(labelsOf(vb.added).map((l) => l.font?.size)).toEqual([12, 12]);
    // A was refreshed when B lowered the size.
    expect(labelsOf(va.added).map((l) => l.font?.size)).toEqual([12, 12]);
    // B's labels removed: A grows back.
    const noText = setup({ x: ['a', 'b'], y: [8, 8] }, layout);
    viewB.update(
      { ...vb.ctx, trace: noText.trace, calc: noText.calc },
      {
        calc: true,
        plot: true,
        style: false,
        transform: false,
      },
    );
    expect(labelsOf(va.added).map((l) => l.font?.size)).toEqual([20, 20]);
    viewA.dispose?.();
    viewB.dispose?.();
  });

  it('opens label links on click', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    const { trace, calc } = setup({
      x: ['a', 'b'],
      y: [8, 8],
      text: '<a href="https://example.com/">go</a>',
      textposition: 'inside',
      insidetextanchor: 'middle',
    });
    // The plot area is 200 × 200 px at (10, 20); bar a's label is centered at (50, 80) px (y up).
    const subplot = { rect: { x: 10, y: 20, width: 200, height: 200 } } as unknown as SubplotInfo;
    const primitives: PrimitiveContext = {
      resources: createResourceManager(),
      invalidate: vi.fn(),
    };
    const { ctx } = viewContext(trace, calc, primitives, {}, subplot);
    const view = bar.plot!.create(ctx);
    const event = (type: ComponentPointerEvent['type'], x: number, y: number) =>
      ({ type, x, y, button: 0, cursor: undefined }) as ComponentPointerEvent;
    const move = event('move', 10 + 50, 20 + 200 - 80);
    expect(view.handlePointer!(move)).toBe(true);
    expect(move.cursor).toBe('pointer');
    expect(view.handlePointer!(event('click', 60, 140))).toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener');
    // Away from the label: not handled, so zoom and hover still work.
    expect(view.handlePointer!(event('move', 60, 40))).toBe(false);
  });
});
