import { uniformTextSize, type UniformText } from '@mk7s/holochart-core';
import {
  createResourceManager,
  IDENTITY_TRANSFORM,
  TextPrimitive,
  type Primitive,
  type PrimitiveContext,
  type TextLabel,
  type Viewport,
} from '@mk7s/holochart-render';
import type { ComponentPointerEvent, TracePlotContext } from '@mk7s/holochart-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, type Built } from './__testing__/build.ts';
import type { PieCalc } from './calc.ts';
import { formatPiePercent, formatPieValue, numSeparate, plainText } from './helpers.ts';
import { pie } from './index.ts';
import {
  fitOutsideLabels,
  layoutPieText,
  leaderLine,
  sliceText,
  textBox,
  titleBlockSize,
  transformInsideText,
  transformOutsideText,
  type LabelPoint,
  type PieLabel,
  type SliceShape,
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

describe('pie number formatting', () => {
  it('formats percents with 3 significant digits like Plotly', () => {
    expect(formatPiePercent(1 / 3)).toBe('33.3%');
    expect(formatPiePercent(0.5)).toBe('50%');
    expect(formatPiePercent(0.0001234)).toBe('0.0123%');
    expect(formatPiePercent(1)).toBe('100%');
    expect(formatPiePercent(0.12345)).toBe('12.3%');
  });

  it('formats values with 10 significant digits and thousands past 4 digits', () => {
    expect(formatPieValue(1 / 3)).toBe('0.3333333333');
    expect(formatPieValue(1234)).toBe('1234');
    expect(formatPieValue(12345.5)).toBe('12,345.5');
    expect(formatPieValue(2)).toBe('2');
    expect(numSeparate('-123456')).toBe('-123,456');
  });

  it('simplifies pseudo-HTML for the SDF text', () => {
    expect(plainText('<b>A</b><br>50%')).toBe('A\n50%');
    expect(plainText('a &amp; b')).toBe('a & b');
  });
});

describe('pie label content', () => {
  const one = (trace: Record<string, unknown>) => {
    const b = build([trace]);
    return { trace: b.traces[0]!, calc: b.calcs[0]! };
  };

  it('joins the textinfo parts in a fixed order', () => {
    const { trace, calc } = one({
      labels: ['a', 'b'],
      values: [3, 1],
      text: ['x', 'y'],
      textinfo: 'percent+value+text+label',
    });
    expect(sliceText(trace, calc, calc.slices[0]!)).toBe('a<br>x<br>3<br>75%');
  });

  it('fills texttemplate with formatted value and percent by default', () => {
    const { trace, calc } = one({
      labels: ['a', 'b'],
      values: [3000, 1000],
      texttemplate: '%{label}: %{value} (%{percent}) %{percent:.1%} %{value:,.0f}',
    });
    expect(sliceText(trace, calc, calc.slices[0]!)).toBe('a: 3000 (75%) 75.0% 3,000');
  });

  it('gives no label with an empty template entry', () => {
    const { trace, calc } = one({ labels: ['a', 'b'], values: [3, 1], texttemplate: ['', 'B'] });
    expect(sliceText(trace, calc, calc.slices[0]!)).toBe('');
    expect(sliceText(trace, calc, calc.slices[1]!)).toBe('B');
  });
});

describe('pie inside text (transformInsideText)', () => {
  // The right half of a pie: from 12 to 6 o'clock, clockwise.
  const half: SliceShape = {
    startAngle: 0,
    stopAngle: Math.PI,
    midAngle: Math.PI / 2,
    halfAngle: Math.PI / 2,
    ring: 1,
    rInscribed: Math.min(1 / (1 + 1 / Math.sin(Math.PI / 2)), 0.5),
  };

  it('keeps small labels horizontal at full size', () => {
    const t = transformInsideText({ width: 20, height: 10 }, half, 100, 'auto');
    expect(t.scale).toBeGreaterThanOrEqual(1);
    expect(t.rotate).toBe(0);
    expect(t.rCenter).toBeCloseTo(0.5);
  });

  it('turns labels radially or tangentially', () => {
    const box = { width: 120, height: 12 };
    expect(transformInsideText(box, half, 100, 'radial').rotate).toBeCloseTo(0);
    expect(transformInsideText(box, half, 100, 'tangential').rotate).toBeCloseTo(-90);
    // Auto picks the largest placement.
    const auto = transformInsideText(box, half, 100, 'auto');
    for (const o of ['horizontal', 'radial', 'tangential'] as const) {
      expect(auto.scale).toBeGreaterThanOrEqual(transformInsideText(box, half, 100, o).scale);
    }
  });

  it('scales labels down in thin slices and hides empty ones', () => {
    const thin: SliceShape = {
      ...half,
      stopAngle: 0.1,
      midAngle: 0.05,
      halfAngle: 0.05,
      rInscribed: 0.05,
    };
    expect(
      transformInsideText({ width: 40, height: 12 }, thin, 100, 'horizontal').scale,
    ).toBeLessThan(1);
    const empty: SliceShape = { ...half, stopAngle: 0 };
    expect(transformInsideText({ width: 40, height: 12 }, empty, 100, 'auto').scale).toBe(0);
  });

  it('places outside labels diagonally past the edge', () => {
    const t = transformOutsideText({ width: 40, height: 10 }, [70.7, -70.7]);
    expect(t.outside).toBe(true);
    expect(t.x).toBeCloseTo(20 + 2.5);
    expect(t.y).toBeCloseTo(-2.5);
  });
});

function box(l: PieLabel) {
  const { width, height } = textBox(l.text, l.font);
  const x0 = l.anchorX === 'left' ? l.x : l.anchorX === 'right' ? l.x - width : l.x - width / 2;
  const y0 = l.anchorY === 'top' ? l.y : l.anchorY === 'bottom' ? l.y - height : l.y - height / 2;
  return { x0, x1: x0 + width, y0, y1: y0 + height };
}

describe('pie label layout', () => {
  it('puts labels inside when they fit and outside otherwise (auto)', () => {
    const b = build([
      {
        labels: ['big', 'tiny'],
        values: [99, 1],
        textinfo: 'label+percent',
        domain: { y: [0, 0.8] },
      },
    ]);
    const { labels } = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout);
    expect(labels.map((l) => [l.text, l.outside])).toEqual([
      ['big\n99%', false],
      ['tiny\n1%', true],
    ]);
    const { cx, cy, r } = b.calcs[0]!.layout!;
    const tiny = labels[1]!;
    expect(Math.hypot(tiny.x - cx, tiny.y - cy)).toBeGreaterThan(r);
  });

  it('shrinks inside labels and honours outside', () => {
    const b = build([
      { labels: ['a', 'long label'], values: [99, 1], textposition: 'inside', textinfo: 'label' },
      { labels: ['a', 'long label'], values: [99, 1], textposition: 'outside', textinfo: 'label' },
    ]);
    const inside = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout).labels;
    expect(inside.every((l) => !l.outside)).toBe(true);
    expect(inside[1]!.font.size).toBeLessThan(12);
    const outside = layoutPieText(b.traces[1]!, b.calcs[1]!, b.fullLayout).labels;
    expect(outside.every((l) => l.outside)).toBe(true);
  });

  it('keeps inside labels of donuts on the ring', () => {
    const b = build([{ labels: ['a', 'b', 'c'], values: [5, 4, 3], hole: 0.6 }]);
    const { cx, cy, r } = b.calcs[0]!.layout!;
    const { labels } = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout);
    expect(labels).toHaveLength(3);
    for (const l of labels) {
      expect(l.outside).toBe(false);
      const d = Math.hypot(l.x - cx, l.y - cy);
      expect(d).toBeGreaterThan(0.6 * r);
      expect(d).toBeLessThan(r);
    }
  });

  it('uses contrasting inside colors and the outside font color', () => {
    const b = build([
      {
        labels: ['a', 'b'],
        values: [99, 1],
        marker: { colors: ['#000', '#fff'] },
        textposition: ['inside', 'outside'],
        outsidetextfont: { color: 'red' },
      },
    ]);
    const { labels } = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout);
    expect(labels[0]!.color).toEqual([1, 1, 1, 1]);
    expect(labels[1]!.color).toEqual([1, 0, 0, 1]);
  });

  it('moves many small outside labels apart, inside the figure, with leader lines', () => {
    const n = 20;
    const labels = Array.from({ length: n }, (_, i) => `slice ${i}`);
    const values = [200, ...Array.from({ length: n - 1 }, (_, i) => 1 + (i % 3))];
    const b = build([
      { labels, values, textinfo: 'label', textposition: 'outside', domain: { y: [0.1, 0.9] } },
    ]);
    const text = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout);
    const boxes = text.labels.filter((l) => l.outside).map(box);
    expect(boxes).toHaveLength(n);
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i]!;
      expect(a.x0).toBeGreaterThanOrEqual(-1e-6);
      expect(a.x1).toBeLessThanOrEqual(600 + 1e-6);
      expect(a.y0).toBeGreaterThanOrEqual(-1e-6);
      expect(a.y1).toBeLessThanOrEqual(400 + 1e-6);
      for (let j = i + 1; j < boxes.length; j++) {
        const c = boxes[j]!;
        const overlap =
          Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) > 1e-6 &&
          Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0) > 1e-6;
        expect(overlap, `labels ${i} and ${j} overlap`).toBe(false);
      }
    }
    expect(text.lines.length).toBeGreaterThan(0);
    expect(text.lines[0]!.width).toBeCloseTo(1.5);
  });

  it('never overlaps outside labels, even when they cannot all fit in the figure', () => {
    const n = 40;
    const labels = Array.from({ length: n }, (_, i) => `slice ${i}`);
    const values = [300, ...Array.from({ length: n - 1 }, () => 1)];
    const b = build([{ labels, values, textinfo: 'label+percent', textposition: 'outside' }]);
    const boxes = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout)
      .labels.filter((l) => l.outside)
      .map(box);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, c] = [boxes[i]!, boxes[j]!];
        const overlap =
          Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) > 1e-6 &&
          Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0) > 1e-6;
        expect(overlap, `labels ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  it('keeps labels in the figure horizontally and separates overlapping ones', () => {
    const point = (y: number, x: number): LabelPoint => ({
      index: 0,
      pts: [0],
      pull: 0,
      pxmid: [10, 0],
      px0: [10, 0],
      px1: [10, 0],
      cxFinal: 0,
      cyFinal: 0,
      yLabelMin: y - 5,
      yLabelMid: y,
      yLabelMax: y + 5,
      xLabelMin: x - 20,
      xLabelMax: x + 20,
      labelExtraX: 0,
      labelExtraY: 0,
    });
    const a = point(2, 590);
    const b = point(6, 580);
    const far = point(6, 100);
    fitOutsideLabels([a, b, far], { width: 600, height: 100 });
    expect(a.labelExtraX).toBe(-10);
    expect(a.labelExtraY).toBe(3);
    expect(b.labelExtraY).toBe(9);
    expect(far.labelExtraY).toBe(0);
    expect(leaderLine(a)).not.toBeNull();
    expect(leaderLine(far)).toBeNull();
  });

  it('places titles in the hole or outside the pie', () => {
    const b = build([
      { values: [1], hole: 0.5, title: { text: 'Inside' } },
      { values: [1], title: { text: 'Top', position: 'top left' } },
      { values: [1], title: { text: 'Bottom', position: 'bottom right' } },
    ]);
    const title = (k: number) =>
      layoutPieText(b.traces[k]!, b.calcs[k]!, b.fullLayout).labels.find((l) => l.slice === -1)!;
    const l0 = b.calcs[0]!.layout!;
    expect(title(0)).toMatchObject({ x: l0.cx, y: l0.cy, anchorX: 'center', anchorY: 'middle' });
    const l1 = b.calcs[1]!.layout!;
    expect(title(1)).toMatchObject({
      x: l1.cx - l1.r,
      y: l1.cy - l1.r,
      anchorX: 'left',
      anchorY: 'bottom',
    });
    const l2 = b.calcs[2]!.layout!;
    expect(title(2)).toMatchObject({
      x: l2.cx + l2.r,
      y: l2.cy + l2.r,
      anchorX: 'right',
      anchorY: 'top',
    });
    expect(title(1).font.size).toBe(12);
  });
});

describe('pie rich text', () => {
  it('draws mixed styles as runs and label-wide styles as one plain label', () => {
    const b = build([
      {
        labels: ['a', 'b'],
        values: [1, 1],
        texttemplate: ['<b>%{label}</b>', '%{label}<sup>2</sup>'],
      },
    ]);
    const [bold, sup] = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout).labels;
    expect(bold!.text).toBe('a');
    expect(bold!.runs).toBeUndefined();
    expect(bold!.font.weight).toBe('bold');
    expect(sup!.text).toBe('b2');
    expect(sup!.runs?.[0]).toHaveLength(2);
    expect(sup!.runs![0]![1]!.font?.size).toBeCloseTo(sup!.font.size * 0.7);
  });

  it('keeps the default textinfo labels plain', () => {
    const b = build([{ labels: ['a', 'b'], values: [3, 1], textinfo: 'label+percent' }]);
    const labels = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout).labels;
    expect(labels.map((l) => [l.text, l.runs])).toEqual([
      ['a\n75%', undefined],
      ['b\n25%', undefined],
    ]);
  });

  it('measures and draws rich titles', () => {
    const b = build([{ values: [1], title: { text: '<i>Sales</i> 2026<br>by region' } }]);
    const trace = b.traces[0]!;
    const title = layoutPieText(trace, b.calcs[0]!, b.fullLayout).labels.find((l) => l.slice < 0)!;
    expect(title.text).toBe('Sales 2026\nby region');
    expect(title.runs).toHaveLength(2);
    expect(titleBlockSize(trace, '<i>Sales</i> 2026<br>by region').height).toBeCloseTo(
      2 * 12 * 1.2,
    );
    expect(plainText('<i>Sales</i> &lt;2&gt;')).toBe('Sales <2>');
  });
});

describe('pie uniformtext', () => {
  // Pie 0: two short labels that fit. Pie 1: a long label squeezed into a thin slice.
  const data = [
    { labels: ['a', 'b'], values: [1, 1], textinfo: 'label', domain: { x: [0, 0.5] } },
    {
      labels: ['x', 'a much longer label'],
      values: [95, 5],
      textinfo: 'label',
      textposition: 'inside',
      domain: { x: [0.5, 1] },
    },
  ];
  const SIZE = { width: 600, height: 200 };
  const texts = (b: Built, u: UniformText, size?: number) =>
    b.traces.map((t, k) =>
      layoutPieText(t, b.calcs[k]!, b.fullLayout, {
        uniformText: u,
        ...(size !== undefined ? { uniformSize: size } : {}),
      }),
    );

  it('shrinks every pie to the smallest label size (show)', () => {
    const u: UniformText = { mode: 'show', minsize: 2 };
    const b = build(data, { uniformtext: u }, SIZE);
    const own = texts(b, u);
    const size = uniformTextSize([...own[0]!.items, ...own[1]!.items], u)!;
    expect(size).toBeLessThan(12);
    expect(size).toBeGreaterThanOrEqual(2);
    const sized = texts(b, u, size);
    const sizes = sized.flatMap((t) => t.labels.map((l) => l.font.size));
    expect(sizes).toHaveLength(4);
    for (const s of sizes) expect(s).toBe(Math.floor(size * 4) / 4);
  });

  it('hides labels below minsize and leaves the rest alone (hide)', () => {
    const u: UniformText = { mode: 'hide', minsize: 11 };
    const b = build(data, { uniformtext: u }, SIZE);
    const own = texts(b, u);
    const size = uniformTextSize([...own[0]!.items, ...own[1]!.items], u);
    const sized = texts(b, u, size);
    expect(sized[1]!.labels.map((l) => l.text)).toEqual(['x']);
    expect(sized[0]!.labels.map((l) => l.font.size)).toEqual([12, 12]);
  });

  it('raises fonts to minsize', () => {
    const u: UniformText = { mode: 'hide', minsize: 14 };
    const b = build([data[0]], { uniformtext: u });
    const text = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout);
    expect(text.items.map((i) => i.fontSize)).toEqual([14, 14]);
    expect(text.labels.map((l) => l.font.size)).toEqual([14, 14]);
  });

  it('is off without a mode', () => {
    const b = build(data);
    const text = layoutPieText(b.traces[1]!, b.calcs[1]!, b.fullLayout);
    expect(text.items).toEqual([]);
    expect(text.uniformSize).toBeUndefined();
    expect(text.labels).toHaveLength(2);
  });
});

describe('pie view text', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function viewContext(b: Built, index: number, primitives: PrimitiveContext) {
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<PieCalc> = {
      trace: b.traces[index]!,
      calc: b.calcs[index]!,
      index,
      fullLayout: b.fullLayout,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform: IDENTITY_TRANSFORM,
      viewport: { size: { width: 600, height: 400, pixelRatio: 1 } } as unknown as Viewport,
      domain: b.entries[index]!.domain,
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

  it('negotiates uniformtext across pies, refreshing pies drawn earlier', () => {
    const b = build(
      [
        { labels: ['a', 'b'], values: [1, 1], textinfo: 'label', domain: { x: [0, 0.5] } },
        {
          labels: ['x', 'a much longer label'],
          values: [95, 5],
          textinfo: 'label',
          textposition: 'inside',
          domain: { x: [0.5, 1] },
        },
      ],
      { uniformtext: { mode: 'show', minsize: 2 } },
      { width: 600, height: 200 },
    );
    const primitives: PrimitiveContext = {
      resources: createResourceManager(),
      invalidate: vi.fn(),
    };
    const first = viewContext(b, 0, primitives);
    const view0 = pie.plot!.create(first.ctx);
    expect(labelsOf(first.added).map((l) => l.font?.size)).toEqual([12, 12]);
    const second = viewContext(b, 1, primitives);
    const view1 = pie.plot!.create(second.ctx);
    const size = labelsOf(second.added)[0]!.font!.size!;
    expect(size).toBeLessThan(12);
    expect(labelsOf(second.added).map((l) => l.font?.size)).toEqual([size, size]);
    expect(labelsOf(first.added).map((l) => l.font?.size)).toEqual([size, size]);
    view0.dispose?.();
    view1.dispose?.();
  });

  it('opens slice label links on click', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    const b = build([
      {
        labels: ['a', 'b'],
        values: [1, 1],
        texttemplate: '<a href="https://example.com/%{label}">%{label} link</a>',
        insidetextorientation: 'horizontal',
      },
    ]);
    const primitives: PrimitiveContext = {
      resources: createResourceManager(),
      invalidate: vi.fn(),
    };
    const { ctx } = viewContext(b, 0, primitives);
    const view = pie.plot!.create(ctx);
    const [label] = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout).labels;
    const event = (type: ComponentPointerEvent['type'], x: number, y: number) =>
      ({ type, x, y, button: 0, cursor: undefined }) as ComponentPointerEvent;
    // Labels are in container px: the label's center is on its link.
    const move = event('move', label!.x, label!.y);
    expect(view.handlePointer!(move)).toBe(true);
    expect(move.cursor).toBe('pointer');
    view.handlePointer!(event('click', label!.x, label!.y));
    expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener');
    expect(view.handlePointer!(event('move', 1, 1))).toBe(false);
  });
});
