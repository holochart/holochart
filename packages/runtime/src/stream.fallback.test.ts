// @vitest-environment jsdom
/**
 * When `extendTraces` / `prependTraces` (E7.2) cannot take the streaming path: the batch does not
 * describe a pure append (see `PendingAppend` in chart.ts), so the trace is recalculated in full.
 * Either way the trace must end up with the calc of its whole data.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import type { TraceAppend, TraceModule } from './contracts.ts';
import {
  createDotsModule,
  createLog,
  setup,
  type CallLog,
  type DotsCalc,
  type TestSetup,
} from './__testing__/fakes.ts';
import { createChartRegistry } from './registry.ts';

interface StreamSetup extends TestSetup {
  /** Every `calcAppend` call (the streaming path). */
  appends: TraceAppend[];
}

/** The `dots` module with a point count (`_length`) and a recording `calcAppend`. */
function streamingSetup(): StreamSetup {
  const base = setup({ width: 640, height: 400 });
  const log: CallLog = createLog();
  const appends: TraceAppend[] = [];
  const dots = createDotsModule(log);
  const module: TraceModule<DotsCalc> = {
    ...dots,
    type: 'sdots',
    supplyDefaults(input, out: FullTrace, ctx) {
      dots.supplyDefaults(input, out, ctx);
      const x = out['x'] as ArrayLike<unknown> | undefined;
      const y = out['y'] as ArrayLike<unknown> | undefined;
      out['_length'] = Math.min(x?.length ?? 0, y?.length ?? 0);
    },
    calcAppend(_prev, trace, ctx, append) {
      appends.push(append);
      // Same result as a full calc, but `dots.calc` logs into `log.calc`: a streaming step must
      // not count as one.
      const before = log.calc.length;
      const out = dots.calc!(trace, ctx);
      log.calc.length = before;
      return out;
    },
  };
  const registry = createChartRegistry().register(module);
  return { ...base, log, appends, registry, options: { ...base.options, registry } };
}

let s: StreamSetup;
let charts: Chart[] = [];

beforeEach(() => {
  s = streamingSetup();
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  s.container.remove();
});

async function chart(data: Record<string, unknown>[]): Promise<Chart> {
  const c = createChart(s.container, { data }, s.options);
  charts.push(c);
  await c.ready;
  s.log.calc.length = 0;
  return c;
}

const calcOf = (c: Chart, index: number): { x: number[]; y: number[] } => {
  const calc = c.getCalcdata(index) as DotsCalc;
  return { x: Array.from(calc.x), y: Array.from(calc.y) };
};

const SDOTS = { type: 'sdots', x: [0, 1, 2], y: [0, 1, 2] };

describe('streaming edits that fall back to a full calc', () => {
  it('streams a plain append (the baseline the fallbacks below are compared with)', async () => {
    const c = await chart([SDOTS]);
    await c.extendTraces({ x: [[3]], y: [[3]] }, [0]);
    expect(s.appends).toHaveLength(1);
    expect(s.log.calc).toEqual([]);
    expect(calcOf(c, 0)).toEqual({ x: [0, 1, 2, 3], y: [0, 1, 2, 3] });
  });

  it('a prepend that fills the whole window keeps no old point: full calc', async () => {
    const c = await chart([SDOTS]);
    // Five new points into a window of two: none of the three old points is retained, which a
    // TraceAppend (trimmed <= previous) cannot say.
    await c.prependTraces({ x: [[10, 11, 12, 13, 14]], y: [[10, 11, 12, 13, 14]] }, [0], 2);
    expect(c.data[0]).toMatchObject({ x: [10, 11], y: [10, 11] });
    expect(s.appends).toEqual([]);
    expect(s.log.calc).toEqual([0]);
    expect(calcOf(c, 0)).toEqual({ x: [10, 11], y: [10, 11] });
    expect(s.log.updates.at(-1)?.plan).toMatchObject({ calc: true });
    expect(s.log.updates.at(-1)?.plan.append).toBeUndefined();
  });

  it('an append batched with addTraces is recalculated in full', async () => {
    const c = await chart([SDOTS]);
    await Promise.all([
      c.addTraces({ type: 'sdots', x: [5], y: [5] }, 0),
      // Index 1 is where the first trace is once the new one is in front of it.
      c.extendTraces({ x: [[3]], y: [[3]] }, [1]),
    ]);
    expect(s.appends).toEqual([]);
    expect(calcOf(c, 1)).toEqual({ x: [0, 1, 2, 3], y: [0, 1, 2, 3] });
    expect(calcOf(c, 0)).toEqual({ x: [5], y: [5] });
  });

  it('an append followed by a move in the same tick is recalculated at the new index', async () => {
    const c = await chart([SDOTS, { type: 'sdots', x: [7], y: [7] }]);
    await Promise.all([c.extendTraces({ x: [[3]], y: [[3]] }, [0]), c.moveTraces(0)]);
    expect(s.appends).toEqual([]);
    expect(s.log.calc).toEqual([1]);
    expect(calcOf(c, 1)).toEqual({ x: [0, 1, 2, 3], y: [0, 1, 2, 3] });
    expect(calcOf(c, 0)).toEqual({ x: [7], y: [7] });
  });

  it('one call that trims its keys differently spoils the whole batch', async () => {
    const c = await chart([SDOTS]);
    void c.extendTraces({ x: [[3]], y: [[3]] }, [0]);
    // x keeps 3 points (2 trimmed), y keeps 4 (1 trimmed): not one shift for every key.
    await c.extendTraces({ x: [[4]], y: [[4]] }, [0], { x: [3], y: [4] });
    expect(c.data[0]).toMatchObject({ x: [2, 3, 4], y: [1, 2, 3, 4] });
    expect(s.appends).toEqual([]);
    expect(s.log.calc).toEqual([0]);
    expect(calcOf(c, 0)).toEqual({ x: [2, 3, 4], y: [1, 2, 3, 4] });
  });
});
