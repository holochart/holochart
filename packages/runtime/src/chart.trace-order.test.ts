// @vitest-environment jsdom
/**
 * Where `addTraces` and `moveTraces` put traces (Plotly's `newIndices`: the index each trace has in
 * the final list, negative ones counting from its end), what they reject, and that edits batched
 * with a reorder follow their trace to its new index.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import { setup, type DotsCalc, type TestSetup } from './__testing__/fakes.ts';

const trace = (label: string): Record<string, unknown> => ({
  type: 'dots',
  x: [0, 10],
  y: [0, 100],
  label,
});

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

async function chart(labels: readonly string[]): Promise<Chart> {
  const c = createChart(t.container, { data: labels.map(trace) }, t.options);
  charts.push(c);
  await c.ready;
  return c;
}

function labels(c: Chart): unknown[] {
  return c.data.map((d) => d['label']);
}

describe('addTraces with newIndices', () => {
  it('puts each new trace at its index in the final list, negative ones from the end', async () => {
    const c = await chart(['a', 'b']);
    await c.addTraces([trace('c'), trace('d')], [0, -1]);
    expect(labels(c)).toEqual(['c', 'a', 'b', 'd']);
    expect(c.fullData.map((d) => d['label'])).toEqual(['c', 'a', 'b', 'd']);
    // Only the two new traces got views; a and b kept theirs.
    expect(t.log.create).toEqual([0, 1, 0, 3]);
    expect(t.log.disposed).toEqual([]);
  });

  it('rejects indices that are not one valid slot per new trace, and adds nothing', async () => {
    const c = await chart(['a', 'b']);
    await expect(c.addTraces(trace('c'), [0, 1])).rejects.toThrow(RangeError);
    // Three traces in the final list: 3 is past its end, -4 before its start.
    await expect(c.addTraces(trace('c'), 3)).rejects.toThrow(/one valid index per new trace/);
    await expect(c.addTraces(trace('c'), -4)).rejects.toThrow(RangeError);
    expect(labels(c)).toEqual(['a', 'b']);
    // The chart still takes updates.
    await c.addTraces(trace('c'), 1);
    expect(labels(c)).toEqual(['a', 'c', 'b']);
  });
});

describe('moveTraces with newIndices', () => {
  it('moves a trace to an explicit or negative index', async () => {
    const c = await chart(['a', 'b', 'c']);
    await c.moveTraces(2, 0);
    expect(labels(c)).toEqual(['c', 'a', 'b']);
    await c.moveTraces(0, -1);
    expect(labels(c)).toEqual(['a', 'b', 'c']);
    // No view was rebuilt for a reorder.
    expect(t.log.create).toEqual([0, 1, 2]);
    expect(t.log.disposed).toEqual([]);
  });

  it('moves several traces, each to the index paired with it', async () => {
    const c = await chart(['a', 'b', 'c']);
    // a ends at index 2 and b at index 0, so c takes what is left.
    await c.moveTraces([0, 1], [2, 0]);
    expect(labels(c)).toEqual(['b', 'c', 'a']);
  });

  it('rejects targets with the wrong count or outside the list, and moves nothing', async () => {
    const c = await chart(['a', 'b', 'c']);
    await expect(c.moveTraces([0, 1], [2])).rejects.toThrow(/one valid index per moved trace/);
    await expect(c.moveTraces(0, 3)).rejects.toThrow(RangeError);
    await expect(c.moveTraces(0, -4)).rejects.toThrow(RangeError);
    expect(labels(c)).toEqual(['a', 'b', 'c']);
  });
});

describe('edits batched with a reorder', () => {
  it('a data edit made before a move in the same tick recalculates the trace where it lands', async () => {
    const c = await chart(['a', 'b', 'c']);
    t.log.calc.length = 0;
    await Promise.all([c.restyle({ x: [[5, 6]] }, 0), c.moveTraces(0)]);
    expect(labels(c)).toEqual(['b', 'c', 'a']);
    expect(c.data[2]?.['x']).toEqual([5, 6]);
    // Only the edited trace was recalculated, at its new index, and its calc has the new data.
    expect(t.log.calc).toEqual([2]);
    expect(Array.from((c.getCalcdata(2) as DotsCalc).x)).toEqual([5, 6]);
    expect(Array.from((c.getCalcdata(0) as DotsCalc).x)).toEqual([0, 10]);
  });

  it('a data edit made before a delete in the same tick still reaches its trace', async () => {
    const c = await chart(['a', 'b', 'c']);
    t.log.calc.length = 0;
    await Promise.all([c.restyle({ y: [[1, 2]] }, 2), c.deleteTraces(0)]);
    expect(labels(c)).toEqual(['b', 'c']);
    expect(t.log.calc).toEqual([1]);
    expect(Array.from((c.getCalcdata(1) as DotsCalc).y)).toEqual([1, 2]);
  });
});
