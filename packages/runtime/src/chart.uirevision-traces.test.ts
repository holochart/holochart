// @vitest-environment jsdom
/**
 * `restyle(…, { gui: true })` marks a trace edit as the user's (a legend click hiding a trace):
 * `react` keeps it for as long as `uirevision` stays the same (core `applyUirevision`), by trace
 * `uid` when the trace has one, else by index. Programmatic restyles are not kept.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import { setup, type TestSetup } from './__testing__/fakes.ts';

const XY = { type: 'dots', x: [0, 10], y: [0, 100] };

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

const visible = (c: Chart): unknown[] => c.fullData.map((d) => d.visible);

describe('GUI trace edits and uirevision', () => {
  it('survive react while uirevision is unchanged, and go when it changes', async () => {
    const c = await chart({ data: [XY, XY], layout: { uirevision: 1 } });
    await c.restyle({ visible: 'legendonly' }, 1, { gui: true });
    expect(visible(c)).toEqual([true, 'legendonly']);

    // The app re-renders with its own figure, which never mentions `visible`.
    await c.react({ data: [XY, { ...XY, color: 'red' }], layout: { uirevision: 1 } });
    expect(visible(c)).toEqual([true, 'legendonly']);
    expect(c.fullData[1]?.['color']).toBe('rgb(255, 0, 0)');

    await c.react({ data: [XY, { ...XY, color: 'red' }], layout: { uirevision: 2 } });
    expect(visible(c)).toEqual([true, true]);
  });

  it('are the only ones kept: a programmatic restyle is replaced by the next figure', async () => {
    const c = await chart({ data: [XY, XY], layout: { uirevision: 1 } });
    await c.restyle({ visible: 'legendonly' }, 1);
    expect(visible(c)).toEqual([true, 'legendonly']);
    await c.react({ data: [XY, XY], layout: { uirevision: 1 } });
    expect(visible(c)).toEqual([true, true]);
  });

  it('follow a trace with a uid when the next figure reorders the traces', async () => {
    const a = { ...XY, uid: 'a' };
    const b = { ...XY, uid: 'b' };
    const c = await chart({ data: [a, b], layout: { uirevision: 1 } });
    await c.restyle({ visible: 'legendonly' }, 1, { gui: true });
    await c.react({ data: [b, a], layout: { uirevision: 1 } });
    expect(c.fullData.map((d) => [d['uid'], d.visible])).toEqual([
      ['b', 'legendonly'],
      ['a', true],
    ]);
  });

  it('stay with the index for traces without a uid', async () => {
    const c = await chart({
      data: [
        { ...XY, label: 'first' },
        { ...XY, label: 'second' },
      ],
      layout: { uirevision: 1 },
    });
    await c.restyle({ visible: 'legendonly' }, [0], { gui: true });
    // Swapped labels, no uids: the hidden trace is still the one at index 0.
    await c.react({
      data: [
        { ...XY, label: 'second' },
        { ...XY, label: 'first' },
      ],
      layout: { uirevision: 1 },
    });
    expect(c.fullData.map((d) => [d['label'], d.visible])).toEqual([
      ['second', 'legendonly'],
      ['first', true],
    ]);
  });
});
