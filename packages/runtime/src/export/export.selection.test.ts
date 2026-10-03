// @vitest-environment jsdom
/**
 * `chart.toImage` draws the selection the live chart shows (E18.1): the interactive selection
 * lives in the chart, not in the figure, so it is handed to the offscreen chart as
 * `selectedpoints`. The offscreen chart uses the same registry, so its trace views are observable
 * through the same module. The container is 640×400 with margins l 40, r 20, t 30, b 50.
 */
import type { FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { TraceModule } from '../contracts.ts';
import { createDotsModule, createLog, setup, type TestSetup } from '../__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };
const DOTS = { type: 'dots', x: [0, 5, 10], y: [0, 50, 100] };

/** Container px of data (x, y) on the fixed ranges above. */
const cx = (x: number): number => 40 + 58 * x;
const cy = (y: number): number => 350 - 3.2 * y;

let t: TestSetup;
let charts: Chart[] = [];
/** `selectedPoints` every trace view was created with, live and offscreen, in order. */
let created: (readonly number[] | null | undefined)[];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  created = [];
  const dots = createDotsModule(createLog()) as TraceModule;
  t.registry.register({
    ...dots,
    plot: {
      create(ctx) {
        created.push(ctx.selectedPoints);
        return { update: () => undefined };
      },
    },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  // jsdom has no 2D canvas and no canvas encoder (see export.test.ts).
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,QUJD');
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  t.container.remove();
  vi.restoreAllMocks();
});

async function chart(data: unknown[], layout: Record<string, unknown> = {}): Promise<Chart> {
  const c = createChart(
    t.container,
    { data, layout: { margin: MARGIN, ...RANGES, ...layout } } as FigureInput,
    t.options,
  );
  charts.push(c);
  await c.ready;
  return c;
}

function click(c: Chart, x: number, y: number): void {
  for (const type of ['pointerdown', 'pointerup']) {
    c.three.root.canvas.dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
      }),
    );
  }
}

describe('toImage and the interactive selection', () => {
  it('draws a click-selected point selected, though the figure has no selectedpoints', async () => {
    const c = await chart([DOTS], { clickmode: 'event+select' });
    click(c, cx(5), cy(50));
    await c.relayout({});
    expect(c.fullData[0]?.['selectedpoints']).toEqual([1]);
    expect(c.data[0]?.['selectedpoints']).toBeUndefined();

    created.length = 0;
    await c.toImage();
    expect(created).toEqual([[1]]);
  });

  it('draws nothing selected after clearSelection, though the figure has selectedpoints', async () => {
    const c = await chart([{ ...DOTS, selectedpoints: [0] }]);
    expect(created).toEqual([[0]]);
    await c.clearSelection();
    expect(c.data[0]?.['selectedpoints']).toEqual([0]);

    created.length = 0;
    await c.toImage();
    expect(created).toEqual([null]);
  });

  it('leaves selectedpoints as the figure has them when nothing was selected by hand', async () => {
    const c = await chart([{ ...DOTS, selectedpoints: [2] }, DOTS]);
    created.length = 0;
    await c.toImage();
    expect(created).toEqual([[2], null]);
  });
});
