import { holochartTemplate, uniformTextSize, type UniformText } from '@mk7s/holochart-core';
import {
  createResourceManager,
  LazyFillPrimitive,
  LinePrimitive,
  TextPrimitive,
  type PrimitiveContext,
  type TextLabel,
} from '@mk7s/holochart-render';
import type { DomainInfo } from '@mk7s/holochart-runtime';
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { figure, plotCtx } from '../__testing__/bars.ts';
import { calcFunnelarea, crossTraceLayoutFunnelarea, type FunnelareaCalc } from './calc.ts';
import { funnelareaHoverPoints, stageAt } from './hover.ts';
import { funnelarea } from './index.ts';
import { funnelareaLegendIcon, funnelareaLegendItems } from './legend.ts';
import { funnelareaShapes } from './plot.ts';
import { funnelareaLabels, layoutFunnelareaText } from './text.ts';

// troika typesets in a worker with browser globals; the view tests only need its object graph.
// Mocked by path, like bar's and pie's tests: traces-finance does not depend on troika, render does.
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

const LABELS = ['Leads', 'Qualified', 'Proposals', 'Won'];
const AREA = { type: 'funnelarea', labels: LABELS, values: [40, 30, 20, 10] };
/** A 400 × 400 px domain at (100, 50). */
const RECT = { x: 100, y: 50, width: 400, height: 400 };

/** Defaults, calcs and the cross-trace layout of a figure of funnel areas in `rects`. */
function laidOut(
  data: Record<string, unknown>[],
  layout: Record<string, unknown> = {},
  rects: { x: number; y: number; width: number; height: number }[] = [RECT],
) {
  const { fullData, fullLayout } = figure(data, layout);
  const calcs = fullData.map((t) => calcFunnelarea(t, { fullLayout }));
  crossTraceLayoutFunnelarea(
    fullData.map((trace, index) => ({
      trace,
      index,
      calc: calcs[index]!,
      domain: { x: [0, 1], y: [0, 1], rect: rects[index] ?? RECT } as DomainInfo,
    })),
    { fullLayout, width: 600, height: 500, plotArea: RECT },
  );
  return { fullData, fullLayout, calcs };
}

/** Area of a stage's trapezoid. */
function area(calc: FunnelareaCalc, k: number): number {
  const c = calc.slices[k]!.corners!;
  return ((c.tr[0] - c.tl[0] + (c.br[0] - c.bl[0])) / 2) * (c.bl[1] - c.tl[1]);
}

describe('funnelarea defaults', () => {
  it('outlines stages in the paper color, shows percents inside, puts the title on top', () => {
    const { fullData, fullLayout } = figure([{ ...AREA, title: { text: 'Sales' } }], {
      paper_bgcolor: '#123456',
    });
    expect(fullData[0]).toMatchObject({
      marker: { line: { width: 1, color: 'rgb(18, 52, 86)' } },
      textinfo: 'percent',
      textposition: 'inside',
      title: { text: 'Sales', position: 'top center' },
      aspectratio: 1,
      baseratio: 0.333,
      scalegroup: '',
    });
    expect(fullLayout).toMatchObject({ extendfunnelareacolors: true });
    expect(fullLayout['funnelareacolorway']).toEqual(fullLayout.colorway);
    const [none] = figure([{ ...AREA, textinfo: 'none' }]).fullData;
    expect(none).toMatchObject({ textposition: 'none' });
    expect(figure([{ ...AREA, values: [0, -1, 0, 0] }]).fullData[0]!.visible).toBe(false);
  });

  it('takes the paper color of the default look for outlines', () => {
    const [t] = figure([AREA], { template: holochartTemplate }).fullData;
    expect(t).toMatchObject({ marker: { line: { color: 'rgb(10, 10, 15)', width: 1 } } });
  });
});

describe('funnelarea calc', () => {
  it('keeps the data order, but sorts by value when labels were merged', () => {
    const { fullData, fullLayout } = figure([
      { ...AREA, values: [10, 40, 20, 30] },
      { ...AREA, labels: ['a', 'b', 'a', 'c'], values: [1, 5, 2, 4] },
    ]);
    const order = (i: number) =>
      calcFunnelarea(fullData[i]!, { fullLayout }).slices.map((s) => s.label);
    expect(order(0)).toEqual(LABELS);
    expect(order(1)).toEqual(['b', 'c', 'a']);
  });

  it('shares stage colors by label across funnel areas, from funnelareacolorway', () => {
    const { calcs } = laidOut(
      [
        { ...AREA, marker: { colors: ['#ff0000'] } },
        { ...AREA, labels: ['Won', 'Lost'], values: [1, 2] },
      ],
      { funnelareacolorway: ['#111111', '#222222'], extendfunnelareacolors: false },
      [RECT, RECT],
    );
    expect(calcs[0]!.slices.map((s) => s.color)).toEqual([
      'rgb(255, 0, 0)',
      'rgb(17, 17, 17)',
      'rgb(34, 34, 34)',
      'rgb(17, 17, 17)',
    ]);
    expect(calcs[1]!.slices.map((s) => s.color)).toEqual(['rgb(17, 17, 17)', 'rgb(34, 34, 34)']);
  });
});

describe('funnelarea geometry', () => {
  it('stacks trapezoids in a triangle cut at baseratio, as wide as the domain', () => {
    const { calcs } = laidOut([AREA]);
    const calc = calcs[0]!;
    expect(calc.layout).toMatchObject({ cx: 300, cy: 250, r: 200 });
    const top = calc.slices[0]!.corners!;
    const bottom = calc.slices[3]!.corners!;
    // Top edge: the full width; bottom edge: baseratio of it; height: 2 r · aspectratio.
    expect(top.tr[0] - top.tl[0]).toBeCloseTo(400);
    expect((bottom.br[0] - bottom.bl[0]) / 400).toBeCloseTo(0.333);
    expect(bottom.bl[1] - top.tl[1]).toBeCloseTo(400);
    expect(calc.halfHeight).toBeCloseTo(200);
    // Stages touch: each bottom edge is the next stage's top edge.
    expect(calc.slices[1]!.corners!.tl).toEqual(top.bl);
  });

  it('gives stages areas proportional to their values (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 7 }),
        fc.double({ min: 0.2, max: 3, noNaN: true }),
        fc.double({ min: 0, max: 0.95, noNaN: true }),
        (values, aspectratio, baseratio) => {
          const { calcs } = laidOut([
            {
              type: 'funnelarea',
              values,
              aspectratio,
              baseratio,
              labels: values.map((_, i) => `s${i}`),
            },
          ]);
          const calc = calcs[0]!;
          const total = values.reduce((a, b) => a + b, 0);
          const areas = values.map((_, k) => area(calc, k));
          const sum = areas.reduce((a, b) => a + b, 0);
          values.forEach((v, k) => expect(areas[k]! / sum).toBeCloseTo(v / total, 6));
          expect(2 * calc.halfHeight).toBeLessThanOrEqual(400 + 1e-6);
          expect(2 * calc.layout!.r).toBeLessThanOrEqual(400 + 1e-6);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('fits a tall aspect ratio to the domain height and leaves room for the title', () => {
    const { calcs } = laidOut([{ ...AREA, aspectratio: 2, title: { text: 'T' } }]);
    const calc = calcs[0]!;
    const title = calc.titleBox!.height;
    expect(2 * calc.halfHeight).toBeCloseTo(400 - title);
    expect(calc.layout!.r).toBeCloseTo((400 - title) / 4);
    expect(calc.layout!.cy).toBeCloseTo(50 + 400 - (400 - title) / 2);
  });

  it('sizes funnel areas of a scalegroup by their totals', () => {
    const { calcs } = laidOut(
      [
        { ...AREA, scalegroup: 'g' },
        { ...AREA, values: [10, 7.5, 5, 2.5], scalegroup: 'g' },
      ],
      {},
      [RECT, { ...RECT, x: 500 }],
    );
    const total = (c: FunnelareaCalc) => c.slices.reduce((s, _, k) => s + area(c, k), 0);
    expect(total(calcs[1]!) / total(calcs[0]!)).toBeCloseTo(0.25);
  });

  it('leaves hidden labels out', () => {
    const { calcs } = laidOut([AREA], { hiddenlabels: ['Qualified'] });
    const calc = calcs[0]!;
    expect(calc.vTotal).toBe(70);
    expect(calc.slices[1]!.corners).toBeUndefined();
    expect(calc.slices[2]!.corners!.tl).toEqual(calc.slices[0]!.corners!.bl);
  });

  it('draws one ring per stage and closed outlines', () => {
    const { fullData, calcs } = laidOut([AREA]);
    const shapes = funnelareaShapes(fullData[0]!, calcs[0]!, 500);
    expect(shapes.rings).toEqual([0, 4, 8, 12]);
    // World y is up: the top stage is highest.
    expect(shapes.y[0]).toBeCloseTo(500 - 50);
    // 5 points per closed ring, NaN between rings.
    expect(shapes.outline.x.length).toBe(4 * 5 + 3);
    expect(Array.from(shapes.outline.width.subarray(0, 5))).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('funnelarea labels and title', () => {
  it('centers each label in its stage, shrunk to fit', () => {
    const { fullData, fullLayout, calcs } = laidOut([{ ...AREA, textinfo: 'label+value' }]);
    const labels = funnelareaLabels(fullData[0]!, calcs[0]!, fullLayout);
    expect(labels.map((l) => l.text)).toEqual([
      'Leads\n40',
      'Qualified\n30',
      'Proposals\n20',
      'Won\n10',
    ]);
    const c = calcs[0]!.slices[0]!.corners!;
    expect(labels[0]!.x).toBeCloseTo(300);
    expect(labels[0]!.y).toBeCloseTo(250 + (c.tl[1] + c.bl[1]) / 2);
    expect(labels[0]!.font.size).toBeLessThanOrEqual(12);
  });

  it('puts the title above the funnel, aligned by title.position', () => {
    const { fullData, fullLayout, calcs } = laidOut([
      { ...AREA, textinfo: 'none', title: { text: 'Pipeline', position: 'top left' } },
    ]);
    const [title] = funnelareaLabels(fullData[0]!, calcs[0]!, fullLayout);
    const calc = calcs[0]!;
    expect(title).toMatchObject({
      text: 'Pipeline',
      anchorX: 'left',
      anchorY: 'bottom',
      slice: -1,
    });
    expect(title!.x).toBeCloseTo(calc.layout!.cx - calc.layout!.r);
    expect(title!.y).toBeCloseTo(calc.layout!.cy - calc.halfHeight);
  });
});

describe('funnelarea hover and legend', () => {
  it('finds the stage under the pointer, with pie-like label lines', () => {
    const { fullData, fullLayout, calcs } = laidOut([
      { ...AREA, hoverinfo: 'label+value+percent' },
    ]);
    const calc = calcs[0]!;
    const c = calc.slices[1]!.corners!;
    const y = 250 + (c.tl[1] + c.bl[1]) / 2;
    expect(stageAt(calc, 300, y)?.label).toBe('Qualified');
    // Outside the slanted edge.
    expect(stageAt(calc, 300 + c.tr[0] + 5, 250 + c.tl[1] + 1)).toBeUndefined();
    const [p] = funnelareaHoverPoints(
      calc,
      fullData[0]!,
      { px: 300, py: 500 - y, xl: 300, yl: 500 - y, mode: 'closest', distance: 20, cx: 300, cy: y },
      { fullLayout, xaxis: undefined, yaxis: undefined, transform: {} as never },
    );
    expect(p).toMatchObject({
      pointIndex: 1,
      distance: 0,
      hoverText: 'Qualified<br>30<br>30%',
      labels: { value: '30', percent: '30%' },
    });
    // Anchored at the middle of the stage's right edge.
    expect(p!.px).toBeCloseTo(300 + (c.tr[0] + c.br[0]) / 2);
  });

  it('lists one legend item per label, hidden labels marked', () => {
    const { fullData, fullLayout, calcs } = laidOut([AREA], { hiddenlabels: ['Won'] });
    const items = funnelareaLegendItems(calcs[0]!, fullData[0]!, { fullLayout });
    expect(items.map((i) => [i.key, i.hidden])).toEqual([
      ['Leads', false],
      ['Qualified', false],
      ['Proposals', false],
      ['Won', true],
    ]);
    expect(items[0]!.glyph).toMatchObject({ kind: 'bar', fill: { lineWidth: 1 } });
    expect(funnelareaLegendIcon(fullData[0]!, { fullLayout }).fill!.color).toBe(
      fullLayout.colorway[0],
    );
    expect(funnelarea.categories).toContain('pie-like');
  });
});

describe('funnelarea view', () => {
  it('draws one fill, one outline and one text batch, updated in place', () => {
    const { fullData, fullLayout, calcs } = laidOut([{ ...AREA, title: { text: 'T' } }]);
    const { ctx, added } = plotCtx(fullData[0]!, calcs[0]!, fullLayout);
    const view = funnelarea.plot!.create(ctx);
    expect(added.filter((p) => p instanceof LazyFillPrimitive)).toHaveLength(1);
    expect(added.filter((p) => p instanceof LinePrimitive)).toHaveLength(1);
    expect(added.filter((p) => p instanceof TextPrimitive)).toHaveLength(1);
    const before = [...added];
    view.update(ctx, { calc: false, plot: true, style: true, transform: false });
    expect(added).toEqual(before);
    // Without outlines or labels those primitives go away.
    view.update(
      {
        ...ctx,
        trace: { ...ctx.trace, marker: { line: { width: 0 } }, textinfo: 'none', title: {} },
      },
      { calc: false, plot: true, style: true, transform: false },
    );
    expect(added).toHaveLength(1);
  });
});

describe('funnelarea patterns', () => {
  it('coerces marker.pattern only with a shape, as pie', () => {
    const [plain] = figure([AREA]).fullData;
    expect((plain!['marker'] as Record<string, unknown>)['pattern']).toBeUndefined();
    const [noShape] = figure([{ ...AREA, marker: { pattern: { size: 4 } } }]).fullData;
    expect((noShape!['marker'] as Record<string, unknown>)['pattern']).toEqual({ shape: '' });
    const [t] = figure([
      { ...AREA, marker: { pattern: { shape: ['/', '.'], fgcolor: ['red'], solidity: [0.5] } } },
    ]).fullData;
    expect((t!['marker'] as Record<string, unknown>)['pattern']).toEqual({
      shape: ['/', '.'],
      fillmode: 'replace',
      fgcolor: ['red'],
      size: 8,
      solidity: [0.5],
    });
  });

  it('gives each drawn stage its pattern, on the paper color unless overlaid', () => {
    const { fullData, calcs } = laidOut(
      [
        {
          ...AREA,
          marker: { pattern: { shape: ['/', '', 'x', '.'], size: [4, 5, 6, 7], solidity: 0.6 } },
        },
      ],
      { paper_bgcolor: '#101010', hiddenlabels: ['Qualified'] },
    );
    const shapes = funnelareaShapes(fullData[0]!, calcs[0]!, 500, '#101010');
    // One pattern per ring (the hidden stage has neither), array attributes cast per stage.
    expect(shapes.rings).toHaveLength(3);
    const fill = shapes.pattern!;
    expect(fill.pattern).toEqual([
      { shape: '/', fillmode: 'replace', size: 4, solidity: 0.6, bgcolor: '#101010' },
      { shape: 'x', fillmode: 'replace', size: 6, solidity: 0.6, bgcolor: '#101010' },
      { shape: '.', fillmode: 'replace', size: 7, solidity: 0.6, bgcolor: '#101010' },
    ]);
    // The stage colors are the pattern's default colors.
    expect(fill.color).toBe(shapes.fill);
    expect(fill.background).toBe('#101010');

    const overlay = laidOut([
      { ...AREA, marker: { pattern: { shape: '+', fillmode: 'overlay' } } },
    ]);
    const o = funnelareaShapes(overlay.fullData[0]!, overlay.calcs[0]!, 500, 'white').pattern!;
    expect((o.pattern as Record<string, unknown>[])[0]).toEqual({
      shape: '+',
      fillmode: 'overlay',
      size: 8,
      solidity: 0.3,
    });
    // Without a shape on any stage the fill stays plain.
    const none = laidOut([{ ...AREA, marker: { pattern: { shape: ['', ''] } } }]);
    expect(funnelareaShapes(none.fullData[0]!, none.calcs[0]!, 500).pattern).toBeNull();
  });

  it('shows the stage patterns in the legend glyphs', () => {
    const { fullData, fullLayout, calcs } = laidOut([
      { ...AREA, marker: { pattern: { shape: ['/', '', 'x'] } } },
    ]);
    const items = funnelareaLegendItems(calcs[0]!, fullData[0]!, { fullLayout });
    expect(items.map((i) => i.glyph.fill?.pattern?.['shape'])).toEqual([
      '/',
      undefined,
      'x',
      undefined,
    ]);
    expect(items[0]!.glyph.fill!.pattern).toMatchObject({ bgcolor: fullLayout.paper_bgcolor });
    expect(funnelareaLegendIcon(fullData[0]!, { fullLayout }).fill!.pattern).toMatchObject({
      shape: '/',
    });
  });
});

describe('funnelarea uniformtext', () => {
  // A long label in the thin bottom stage has to shrink much more than the others.
  const TALL = {
    ...AREA,
    labels: ['Leads', 'Qualified', 'Proposals', 'Closed won deals this quarter'],
    values: [40, 30, 20, 4],
    textinfo: 'label',
  };
  const texts = (u: UniformText, size?: number) => {
    const { fullData, fullLayout, calcs } = laidOut([TALL], { uniformtext: u });
    return layoutFunnelareaText(fullData[0]!, calcs[0]!, fullLayout, {
      uniformText: u,
      ...(size !== undefined ? { uniformSize: size } : {}),
    });
  };

  it('is off without a mode', () => {
    const { fullData, fullLayout, calcs } = laidOut([TALL]);
    const text = layoutFunnelareaText(fullData[0]!, calcs[0]!, fullLayout);
    expect(text.items).toEqual([]);
    expect(text.uniformSize).toBeUndefined();
    const sizes = text.labels.map((l) => l.font.size);
    expect(sizes[0]).toBe(12);
    expect(sizes[3]).toBeLessThan(12);
  });

  it('draws every stage label at the smallest fitted size (show)', () => {
    const u: UniformText = { mode: 'show', minsize: 2 };
    const text = texts(u);
    expect(text.items).toHaveLength(4);
    const size = uniformTextSize(text.items, u)!;
    expect(text.uniformSize).toBe(size);
    expect(size).toBeLessThan(12);
    expect(text.labels.map((l) => l.font.size)).toEqual(
      Array.from({ length: 4 }, () => Math.floor(size * 4) / 4),
    );
  });

  it('hides labels that would be smaller than minsize (hide)', () => {
    const u: UniformText = { mode: 'hide', minsize: 11 };
    const text = texts(u);
    expect(text.labels.map((l) => l.text)).toEqual(['Leads', 'Qualified', 'Proposals']);
    expect(text.labels.map((l) => l.font.size)).toEqual([12, 12, 12]);
  });

  it('raises fonts to minsize, before the fit', () => {
    const u: UniformText = { mode: 'hide', minsize: 14 };
    const text = texts(u);
    expect(text.items.map((i) => i.fontSize)).toEqual([14, 14, 14, 14]);
    expect(text.labels[0]!.font.size).toBe(14);
  });

  it('negotiates one size across funnel areas, refreshing those drawn earlier', () => {
    const { fullData, fullLayout, calcs } = laidOut(
      [
        { ...AREA, textinfo: 'label', domain: { x: [0, 0.5] } },
        { ...TALL, domain: { x: [0.5, 1] } },
      ],
      { uniformtext: { mode: 'show', minsize: 2 } },
      [
        { ...RECT, width: 200 },
        { ...RECT, x: 300, width: 200 },
      ],
    );
    const primitives: PrimitiveContext = {
      resources: createResourceManager(),
      invalidate: vi.fn(),
    };
    const labelsOf = (added: unknown[]): TextLabel[] =>
      (
        added.find((p) => p instanceof TextPrimitive) as unknown as {
          data: { labels: TextLabel[] };
        }
      ).data.labels;
    const first = plotCtx(fullData[0]!, calcs[0]!, fullLayout, { primitives });
    const view0 = funnelarea.plot!.create(first.ctx);
    const own = labelsOf(first.added).map((l) => l.font!.size!);
    const second = plotCtx(fullData[1]!, calcs[1]!, fullLayout, { primitives, index: 1 });
    const view1 = funnelarea.plot!.create(second.ctx);
    const size = labelsOf(second.added)[0]!.font!.size!;
    expect(size).toBeLessThan(Math.min(...own));
    expect(labelsOf(second.added).map((l) => l.font!.size)).toEqual([size, size, size, size]);
    expect(labelsOf(first.added).map((l) => l.font!.size)).toEqual([size, size, size, size]);
    // Once the second one goes, the first one is back to its own size.
    view1.dispose?.();
    view0.update(first.ctx, { calc: false, plot: true, style: true, transform: false });
    expect(labelsOf(first.added).map((l) => l.font!.size)).toEqual(own);
    view0.dispose?.();
  });
});

describe('funnelarea description', () => {
  it('formats every visible stage on demand, past maxRows (the visible data table, E17.3)', () => {
    const { fullData, fullLayout, calcs } = laidOut([AREA]);
    const describeWith = (maxRows: number) =>
      funnelarea.describe!({
        trace: fullData[0]!,
        calc: calcs[0]!,
        index: 0,
        fullLayout,
        xaxis: undefined,
        yaxis: undefined,
        maxRows,
      })!.table!;
    const all = describeWith(100);
    const t = describeWith(1);
    expect(t.rows).toEqual(all.rows.slice(0, 1));
    expect(t.total).toBe(4);
    expect(Array.from({ length: 4 }, (_, i) => t.row!(i))).toEqual(all.rows);
    expect(t.row!(3)).toEqual([LABELS[3], '10', '10%']);
  });
});
