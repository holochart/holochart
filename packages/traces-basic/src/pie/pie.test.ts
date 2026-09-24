import type { FullTrace } from '@mk7s/holochart-core';
import {
  ArcPrimitive,
  createResourceManager,
  IDENTITY_TRANSFORM,
  LinePrimitive,
  TextPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import type { TracePlotContext } from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { calcPie, type PieCalc } from './calc.ts';
import { adjustLightnessHex } from './helpers.ts';
import { pie } from './index.ts';
import { pieArcs } from './plot.ts';
import { build, defaults, type Built } from './__testing__/build.ts';

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

describe('pie defaults', () => {
  it('hides traces without data or without a positive value', () => {
    const { fullData } = defaults([{}, { values: [0, -1] }, { labels: ['a'], values: [1] }]);
    expect(fullData.map((t) => t.visible)).toEqual([false, false, true]);
    expect(fullData[2]?.['_length']).toBe(1);
  });

  it('defaults textinfo, direction, sort and the slice colorway like Plotly', () => {
    const { fullData, fullLayout } = defaults([
      { values: [1, 2] },
      { values: [1, 2], text: ['a', 'b'] },
      { values: [1, 2], texttemplate: '%{label}' },
    ]);
    expect(fullData[0]?.['textinfo']).toBe('percent');
    expect(fullData[1]?.['textinfo']).toBe('text+percent');
    expect(fullData[2]?.['textinfo']).toBeUndefined();
    expect(fullData[0]?.['direction']).toBe('counterclockwise');
    expect(fullData[0]?.['sort']).toBe(true);
    expect(fullData[0]?.['textposition']).toBe('auto');
    expect(fullData[0]?.['insidetextorientation']).toBe('auto');
    expect(fullData[0]?.['label0']).toBe(0);
    expect(fullData[0]?.['domain']).toMatchObject({ x: [0, 1], y: [0, 1] });
    expect(fullLayout['piecolorway']).toEqual(fullLayout.colorway);
    expect(fullLayout['extendpiecolors']).toBe(true);
  });

  it("sets textposition 'none' for textinfo 'none' and skips fonts", () => {
    const { fullData } = defaults([{ values: [1], textinfo: 'none' }]);
    expect(fullData[0]?.['textposition']).toBe('none');
    expect(fullData[0]?.['textfont']).toBeUndefined();
  });

  it('only coerces label0/dlabel without labels, and the line color with a line width', () => {
    const { fullData } = defaults([
      { labels: ['a'], values: [1] },
      { values: [1], marker: { line: { width: 2 } } },
    ]);
    expect(fullData[0]?.['label0']).toBeUndefined();
    expect((fullData[0]?.['marker'] as { line?: { color?: unknown } }).line?.color).toBeUndefined();
    expect((fullData[1]?.['marker'] as { line: { color: unknown } }).line.color).toBe(
      'rgb(68, 68, 68)',
    );
  });

  it('defaults the title position from the hole', () => {
    const { fullData } = defaults([
      { values: [1], title: { text: 'T' }, hole: 0.4 },
      { values: [1], title: { text: 'T' } },
      { values: [1], title: { text: 'T', position: 'middle center' } },
    ]);
    const pos = fullData.map((t) => (t['title'] as { position: string }).position);
    expect(pos).toEqual(['middle center', 'top center', 'top center']);
    expect((fullData[0]?.['title'] as { font: { size: number } }).font.size).toBe(12);
  });

  it('inherits inside and outside fonts from textfont, except the inside color', () => {
    const { fullData } = defaults([
      { values: [1], textfont: { size: 20 } },
      { values: [1], textfont: { color: 'red' } },
    ]);
    const b444 = 'rgb(68, 68, 68)';
    const font = (t: FullTrace, key: string) => t[key] as { size: number; color?: string };
    expect(font(fullData[0]!, 'insidetextfont').size).toBe(20);
    expect(font(fullData[0]!, 'insidetextfont').color).toBeUndefined();
    expect(font(fullData[0]!, 'outsidetextfont').color).toBe(b444);
    expect(font(fullData[1]!, 'insidetextfont').color).toBe('rgb(255, 0, 0)');
  });
});

describe('pie calc', () => {
  const calc = (trace: Record<string, unknown>, layout: Record<string, unknown> = {}) => {
    const { fullData, fullLayout } = defaults([trace], layout);
    return calcPie(fullData[0]!, { fullLayout });
  };

  it('merges duplicate labels, keeping every index and the first color', () => {
    const c = calc({
      labels: ['a', 'b', 'a'],
      values: [1, 2, 3],
      marker: { colors: [null, 'blue', 'red'] },
    });
    expect(c.slices.map((s) => [s.label, s.v, s.pts])).toEqual([
      ['a', 4, [0, 2]],
      ['b', 2, [1]],
    ]);
    expect(c.slices[0]?.explicitColor).toBe('rgb(255, 0, 0)');
    expect(c.slices[0]?.i).toBe(0);
    expect(c.vTotal).toBe(6);
  });

  it('sorts descending by value unless sort is off', () => {
    const data = { labels: ['a', 'b', 'c'], values: [1, 3, 2] };
    expect(calc(data).slices.map((s) => s.label)).toEqual(['b', 'c', 'a']);
    expect(calc({ ...data, sort: false }).slices.map((s) => s.label)).toEqual(['a', 'b', 'c']);
  });

  it('skips non-numeric values and drops negative slices', () => {
    const c = calc({ labels: ['a', 'b', 'c', 'd', 'e'], values: [1, 'x', null, '2', -4] });
    expect(c.slices.map((s) => [s.label, s.v])).toEqual([
      ['d', 2],
      ['a', 1],
    ]);
    expect(c.vTotal).toBe(3);
    // A merged slice may include negative values.
    expect(calc({ labels: ['a', 'a'], values: [5, -2] }).slices[0]?.v).toBe(3);
  });

  it('builds labels from label0/dlabel, and counts labels without values', () => {
    expect(
      calc({ values: [1, 2, 3], label0: 10, dlabel: 5, sort: false }).slices.map((s) => s.label),
    ).toEqual(['10', '15', '20']);
    const counted = calc({ labels: ['x', 'y', 'x', ''] });
    expect(counted.slices.map((s) => [s.label, s.v])).toEqual([
      ['x', 2],
      ['y', 1],
      ['3', 1],
    ]);
  });

  it('keeps hidden labels but leaves them out of the total and the angles', () => {
    const c = calc({ labels: ['a', 'b', 'c'], values: [1, 2, 3] }, { hiddenlabels: ['c'] });
    expect(c.vTotal).toBe(3);
    const hidden = c.slices.find((s) => s.label === 'c')!;
    expect(hidden.hidden).toBe(true);
    expect(hidden.midAngle).toBeNaN();
    const visible = c.slices.filter((s) => !s.hidden);
    const span = visible.reduce((sum, s) => sum + Math.abs(s.stopAngle - s.startAngle), 0);
    expect(span).toBeCloseTo(2 * Math.PI);
  });

  it("starts the first slice at 12 o'clock and goes around per direction and rotation", () => {
    const values = { labels: ['a', 'b'], values: [1, 3], sort: false };
    const cw = calc({ ...values, direction: 'clockwise' }).slices;
    expect(cw[0]?.startAngle).toBeCloseTo(0);
    expect(cw[0]?.stopAngle).toBeCloseTo(Math.PI / 2);
    expect(cw[1]?.stopAngle).toBeCloseTo(2 * Math.PI);
    // Counterclockwise: the first slice still has its edge at 12 o'clock, on the right.
    const ccw = calc(values).slices;
    expect(ccw[0]?.startAngle).toBeCloseTo(Math.PI / 2);
    expect(ccw[0]?.stopAngle).toBeCloseTo(0);
    expect(ccw[1]?.stopAngle).toBeCloseTo(-3 * (Math.PI / 2));
    const rotated = calc({ ...values, direction: 'clockwise', rotation: 90 }).slices;
    expect(rotated[0]?.startAngle).toBeCloseTo(Math.PI / 2);
  });

  it('reads per-slice pulls and the largest pull', () => {
    const c = calc({ labels: ['a', 'b'], values: [2, 1], pull: [0, 0.3] });
    expect(c.slices.map((s) => s.pull)).toEqual([0, 0.3]);
    expect(c.maxPull).toBe(0.3);
  });
});

describe('pie colors (crossTraceLayout)', () => {
  const colorsOf = (b: Built) => b.calcs.map((c) => c.slices.map((s) => [s.label, s.color]));

  it('shares one label → color map across pies, in trace and slice order', () => {
    const b = build([
      { labels: ['a', 'b'], values: [2, 1] },
      { labels: ['c', 'b'], values: [2, 1] },
    ]);
    const way = b.fullLayout.colorway;
    expect(colorsOf(b)).toEqual([
      [
        ['a', way[0]],
        ['b', way[1]],
      ],
      [
        ['c', way[2]],
        ['b', way[1]],
      ],
    ]);
  });

  it('registers explicit colors first, for every pie', () => {
    const b = build([
      { labels: ['a', 'b'], values: [2, 1] },
      { labels: ['a'], values: [1], marker: { colors: ['#00ff00'] } },
    ]);
    expect(b.calcs[0]?.slices[0]?.color).toBe('rgb(0, 255, 0)');
    // 'b' takes the first colorway color: explicit colors don't use up the colorway.
    expect(b.calcs[0]?.slices[1]?.color).toBe(b.fullLayout.colorway[0]);
  });

  it('extends the colorway with lighter then darker copies', () => {
    const labels = Array.from({ length: 5 }, (_, i) => `l${i}`);
    const data = [{ labels, values: [5, 4, 3, 2, 1] }];
    const layout = { piecolorway: ['#ff0000', '#0000ff'] };
    const extended = build(data, layout).calcs[0]!.slices.map((s) => s.color);
    expect(extended).toEqual([
      'rgb(255, 0, 0)',
      'rgb(0, 0, 255)',
      adjustLightnessHex('#ff0000', 20),
      adjustLightnessHex('#0000ff', 20),
      adjustLightnessHex('#ff0000', -20),
    ]);
    expect(adjustLightnessHex('#ff0000', 20)).toBe('#FF6666');
    expect(adjustLightnessHex('#ff0000', -20)).toBe('#990000');
    const plain = build(data, { ...layout, extendpiecolors: false }).calcs[0]!.slices;
    expect(plain.map((s) => s.color)).toEqual([
      'rgb(255, 0, 0)',
      'rgb(0, 0, 255)',
      'rgb(255, 0, 0)',
      'rgb(0, 0, 255)',
      'rgb(255, 0, 0)',
    ]);
  });

  it('colors hidden slices too, and is idempotent', () => {
    const b = build([{ labels: ['a', 'b'], values: [2, 1] }], { hiddenlabels: ['a'] });
    const before = colorsOf(b);
    expect(before[0]?.[0]?.[1]).toBe(b.fullLayout.colorway[0]);
    pie.crossTraceLayout!(b.entries, {
      fullLayout: b.fullLayout,
      width: 600,
      height: 400,
      plotArea: { x: 0, y: 0, width: 600, height: 400 },
    });
    expect(colorsOf(b)).toEqual(before);
  });
});

describe('pie areas (crossTraceLayout)', () => {
  it('centers the pie in its domain with the inscribed radius', () => {
    const { layout } = build([{ values: [1, 2], domain: { x: [0.5, 1] } }]).calcs[0]!;
    expect(layout).toMatchObject({ cx: 450, cy: 200, r: 150, width: 600, height: 400 });
  });

  it('leaves room for the largest pull', () => {
    const { layout } = build([{ values: [1, 2], pull: [0, 0.25] }]).calcs[0]!;
    expect(layout?.r).toBeCloseTo(200 / 1.25);
  });

  it('leaves room for outside titles', () => {
    const top = build([{ values: [1], title: { text: 'Title' } }]).calcs[0]!;
    const h = top.titleBox!.height;
    expect(h).toBeGreaterThan(0);
    expect(top.layout?.r).toBeCloseTo((400 - h) / 2);
    expect(top.layout?.cy).toBeCloseTo(400 - (400 - h) / 2);
    const bottom = build([{ values: [1], title: { text: 'Title', position: 'bottom left' } }])
      .calcs[0]!;
    expect(bottom.layout?.cy).toBeCloseTo((400 - h) / 2);
    const inside = build([{ values: [1], hole: 0.5, title: { text: 'Title' } }]).calcs[0]!;
    expect(inside.layout?.r).toBe(200);
  });

  it('sizes pies of a scale group by area', () => {
    const b = build([
      { values: [1], domain: { x: [0, 0.5] }, scalegroup: 'g' },
      { values: [2, 2], domain: { x: [0.5, 1] }, scalegroup: 'g' },
      { values: [9], domain: { x: [0.5, 1] } },
    ]);
    const [r1, r2, r3] = b.calcs.map((c) => c.layout!.r);
    expect(r2).toBeCloseTo(150);
    expect(r1).toBeCloseTo(75);
    expect(r3).toBeCloseTo(150);
  });
});

describe('pie legend', () => {
  it('returns one item per label with hidden flags and slice colors', () => {
    const b = build(
      [{ labels: ['a', 'b', 'a'], values: [1, 1, 1], marker: { line: { width: 2 } } }],
      {
        hiddenlabels: ['b'],
      },
    );
    const items = pie.legendItems!(b.calcs[0]!, b.traces[0]!, { fullLayout: b.fullLayout })!;
    expect(items.map((i) => [i.key, i.name, i.hidden])).toEqual([
      ['a', 'a', false],
      ['b', 'b', true],
    ]);
    expect(items[0]?.glyph).toEqual({
      kind: 'bar',
      fill: { color: b.fullLayout.colorway[0], lineColor: 'rgb(68, 68, 68)', lineWidth: 2 },
    });
  });

  it('has a trace glyph in the first slice color', () => {
    const { fullData, fullLayout } = defaults([
      { values: [1], marker: { colors: ['red'] } },
      { values: [1] },
    ]);
    expect(pie.legendIcon!(fullData[0]!, { fullLayout }).fill?.color).toBe('rgb(255, 0, 0)');
    expect(pie.legendIcon!(fullData[1]!, { fullLayout }).fill?.color).toBe(fullLayout.colorway[0]);
  });
});

describe('pie view', () => {
  function plotContext(b: Built, index = 0) {
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

  it('draws every slice with one arc primitive and one text primitive, below components', () => {
    const b = build([{ labels: ['a', 'b', 'c'], values: [3, 2, 1] }]);
    const { ctx, added } = plotContext(b);
    const view = pie.plot!.create(ctx);
    expect(added.filter((p) => p instanceof ArcPrimitive)).toHaveLength(1);
    expect(added.filter((p) => p instanceof TextPrimitive)).toHaveLength(1);
    const arcs = added[0] as ArcPrimitive;
    // Wedge + outer rim per slice (rims culled without an outline).
    expect(arcs.instanceCount).toBe(6);
    for (const p of added) {
      expect(p.object.renderOrder).toBeGreaterThanOrEqual(-10);
      expect(p.object.renderOrder).toBeLessThan(0);
    }
    // Updates reuse the primitives.
    view.update(ctx, { calc: true, plot: true, style: true, transform: true });
    expect(added[0]).toBe(arcs);
    expect(added).toHaveLength(2);
  });

  it('places wedges in world px, pulled along their bisector, with centered outlines', () => {
    const b = build([
      {
        labels: ['a', 'b'],
        values: [1, 1],
        pull: [0.5, 0],
        hole: 0.5,
        direction: 'clockwise',
        marker: { line: { width: 4, color: '#fff' } },
      },
    ]);
    const calc = b.calcs[0]!;
    const { r, cx, cy } = calc.layout!;
    const arcs = pieArcs(b.traces[0]!, calc, 400);
    expect(arcs.count).toBe(6);
    // Slice a spans 12 → 6 o'clock clockwise: pulled right.
    expect(arcs.x[0]).toBeCloseTo(cx + 0.5 * r);
    expect(arcs.y[0]).toBeCloseTo(400 - cy);
    expect(arcs.x[3]).toBeCloseTo(cx);
    expect([arcs.startAngle[0], arcs.endAngle[0]]).toEqual([
      Math.fround(Math.PI / 2),
      Math.fround(-Math.PI / 2),
    ]);
    expect(arcs.innerRadius[0]).toBeCloseTo(0.5 * r);
    expect(arcs.borderWidth[0]).toBe(2);
    // Outer and inner rims carry the other half of the stroke.
    expect([arcs.innerRadius[1], arcs.outerRadius[1]]).toEqual([
      Math.fround(r),
      Math.fround(r + 2),
    ]);
    expect(arcs.outerRadius[2]).toBeCloseTo(0.5 * r);
    expect(arcs.innerRadius[2]).toBeCloseTo(0.5 * r - 2);
  });

  it('draws leader lines when outside labels are moved, and removes them again', () => {
    const labels = Array.from({ length: 12 }, (_, i) => `slice ${i}`);
    const values = [100, ...Array.from({ length: 11 }, () => 1)];
    const b = build([{ labels, values, textposition: 'outside', textinfo: 'label' }]);
    const { ctx, added } = plotContext(b);
    const view = pie.plot!.create(ctx);
    expect(added.some((p) => p instanceof LinePrimitive)).toBe(true);
    const next = build([{ labels, values, textposition: 'none' }]);
    view.update(
      { ...ctx, trace: next.traces[0]!, calc: next.calcs[0]! },
      { calc: true, plot: true, style: true, transform: false },
    );
    expect(added.some((p) => p instanceof LinePrimitive)).toBe(false);
    expect(added.some((p) => p instanceof TextPrimitive)).toBe(false);
  });
});
