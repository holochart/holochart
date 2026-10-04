// @vitest-environment jsdom
/**
 * Which selection a trace shows when its input `selectedpoints` and `layout.selections` (E5.12)
 * both have a say: an edit of `selectedpoints` wins for its trace (restyle or react), the other
 * traces keep following the layout selections. Also: `selectedpoints` given as a typed array.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import { setup, type TestSetup } from './__testing__/fakes.ts';

const POINTS = { type: 'dots', x: [0, 1, 2, 3, 4], y: [0, 1, 2, 3, 4] };
/** Contains the points 1 and 2. */
const BOX = { x0: 0.5, x1: 2.5, y0: 0.5, y1: 2.5 };

let t: TestSetup;
let charts: Chart[] = [];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  t.container.remove();
});

async function chart(figure: Parameters<typeof createChart>[1]): Promise<Chart> {
  const c = createChart(t.container, figure, t.options);
  charts.push(c);
  await c.ready;
  return c;
}

/** What the trace's view was last told is selected. */
function shown(index: number): readonly number[] | null | undefined {
  return t.log.updates.filter((u) => u.index === index).at(-1)?.selected;
}

describe('input selectedpoints against layout.selections', () => {
  it('a selectedpoints restyle batched with a selections edit wins for its trace only', async () => {
    const c = await chart({ data: [POINTS, POINTS], layout: { selections: [BOX] } });
    expect(c.fullData.map((d) => d['selectedpoints'])).toEqual([
      [1, 2],
      [1, 2],
    ]);
    await Promise.all([
      // The box grows to contain point 3 too ...
      c.relayout({ 'selections[0].x1': 3.5, 'selections[0].y1': 3.5 }),
      // ... while trace 0 is told what to select.
      c.restyle({ selectedpoints: [[4]] }, 0),
    ]);
    expect(c.fullData[0]?.['selectedpoints']).toEqual([4]);
    expect(c.fullData[1]?.['selectedpoints']).toEqual([1, 2, 3]);
    expect(shown(0)).toEqual([4]);
    expect(shown(1)).toEqual([1, 2, 3]);
  });

  it('react with a new selectedpoints replaces what the layout selection selected', async () => {
    const c = await chart({ data: [POINTS], layout: { selections: [BOX] } });
    expect(c.fullData[0]?.['selectedpoints']).toEqual([1, 2]);
    await c.react({ data: [{ ...POINTS, selectedpoints: [0] }], layout: { selections: [BOX] } });
    expect(c.fullData[0]?.['selectedpoints']).toEqual([0]);
    expect(shown(0)).toEqual([0]);
  });
});

describe('selectedpoints as a typed array', () => {
  it('is read like a plain array of indices', async () => {
    const c = await chart({ data: [{ ...POINTS, selectedpoints: Int32Array.from([1, 3]) }] });
    await c.restyle({ color: 'red' });
    expect(shown(0)).toEqual([1, 3]);
  });
});
