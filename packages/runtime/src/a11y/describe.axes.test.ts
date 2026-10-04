// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { AxisInfo, DescribeContext, TraceModule } from '../contracts.ts';
import {
  createDotsModule,
  createLog,
  setup,
  type DotsCalc,
  type TestSetup,
} from '../__testing__/fakes.ts';
import { formatAxisValue } from './text.ts';

let t: TestSetup;
let charts: Chart[] = [];

async function chart(figure: Parameters<typeof createChart>[1]): Promise<Chart> {
  const c = createChart(t.container, figure, t.options);
  charts.push(c);
  await c.ready;
  return c;
}

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  t.container.remove();
  vi.restoreAllMocks();
});

describe('axis sentences of the description (E17.1)', () => {
  it('lists the categories of a category axis', async () => {
    const c = await chart({
      data: [{ type: 'dots', x: ['Mon', 'Tue', '<b>Wed</b>'], y: [1, 2, 3] }],
    });
    expect(c.description?.axes[0]).toBe(
      'X axis: category axis with 3 categories: Mon, Tue and Wed.',
    );
  });

  it('says "1 category" for a single one', async () => {
    const c = await chart({ data: [{ type: 'dots', x: ['Mon'], y: [1] }] });
    expect(c.description?.axes[0]).toBe('X axis: category axis with 1 category: Mon.');
  });

  it('names the first ten categories and counts the rest', async () => {
    const x = Array.from({ length: 13 }, (_, i) => `c${i}`);
    const c = await chart({ data: [{ type: 'dots', x, y: x.map((_, i) => i) }] });
    expect(c.description?.axes[0]).toBe(
      'X axis: category axis with 13 categories: c0, c1, c2, c3, c4, c5, c6, c7, c8, c9 and 3 more.',
    );
  });

  it('says when a category axis has no categories', async () => {
    const c = await chart({
      data: [{ type: 'dots', x: [], y: [] }],
      layout: { xaxis: { type: 'category', title: { text: 'Day' } } },
    });
    expect(c.description?.axes[0]).toBe('X axis "Day": category axis without categories.');
  });

  it('names a log axis logarithmic, with its range as the axis shows it', async () => {
    const c = await chart({
      data: [{ type: 'dots', x: [1, 10, 100], y: [1, 2, 3] }],
      // A log axis' range is in decades: 10^0 to 10^2.
      layout: { xaxis: { type: 'log', range: [0, 2] } },
    });
    expect(c.description?.axes[0]).toBe('X axis: logarithmic axis from 1 to 100.');
  });

  it('numbers additional axes', async () => {
    const c = await chart({
      data: [
        { type: 'dots', x: [0, 1], y: [0, 1] },
        { type: 'dots', x: [0, 1], y: [0, 1], yaxis: 'y2' },
      ],
      layout: {
        xaxis: { range: [0, 1] },
        yaxis: { range: [0, 1] },
        yaxis2: { range: [0, 50], overlaying: 'y', side: 'right', title: { text: 'Share' } },
      },
    });
    expect(c.description?.axes).toEqual([
      'X axis: linear axis from 0 to 1.',
      'Y axis: linear axis from 0 to 1.',
      'Y axis 2 "Share": linear axis from 0 to 50.',
    ]);
  });
});

describe("what a trace's describe() is given (E17.1)", () => {
  it("gets the trace's own axes, which format values like the chart's hover labels", async () => {
    const seen: { x: AxisInfo | undefined; y: AxisInfo | undefined }[] = [];
    const module: TraceModule<DotsCalc> = {
      ...createDotsModule(createLog()),
      type: 'described',
      describe(ctx: DescribeContext<DotsCalc>) {
        seen[ctx.index] = { x: ctx.xaxis, y: ctx.yaxis };
        return { summary: 'Described.' };
      },
    };
    t.registry.register(module);
    const c = await chart({
      data: [
        { type: 'described', x: [0, 1], y: [0, 1] },
        { type: 'described', x: [0, 1], y: [0, 1], yaxis: 'y2' },
      ],
      layout: {
        yaxis: { hoverformat: '.2f' },
        yaxis2: { overlaying: 'y', ticksuffix: ' %', showticksuffix: 'all' },
      },
    });
    expect(c.description?.traces).toEqual(['Described.', 'Described.']);
    expect(seen.map((s) => [s.x?.id, s.y?.id])).toEqual([
      ['x', 'y'],
      ['x', 'y2'],
    ]);
    // The axis' hover format and suffix; a plain number without an axis; nothing for a gap.
    expect(formatAxisValue(seen[0]!.y, 0.5)).toBe('0.50');
    expect(formatAxisValue(seen[1]!.y, 12)).toBe('12 %');
    expect(formatAxisValue(undefined, 1234.5678)).toBe('1234.57');
    expect(formatAxisValue(seen[0]!.y, NaN)).toBe('');
    expect(formatAxisValue(undefined, Infinity)).toBe('');
  });
});
