// @vitest-environment jsdom
import type { FullTrace } from '@mk7s/holochart-core';
import { afterEach, describe, expect, it } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import type { TraceModule, TraceUpdatePlan } from './contracts.ts';
import { createDotsModule, createLog, setup, type DotsCalc } from './__testing__/fakes.ts';
import { createChartRegistry } from './registry.ts';

/**
 * `crossTraceCalc`'s changed report (E7.2 / E16.3): only the entries a module reports get full
 * plans (calc / plot / style, no `append`); the others keep theirs. The `dots` module here has a
 * recorded `crossTraceCalc` whose report the test sets, and a `calcAppend` so `extendTraces`
 * streams.
 */
function reportSetup(report: (indices: readonly number[]) => Iterable<number> | undefined) {
  const base = setup({ width: 640, height: 400 });
  const log = createLog();
  const dots = createDotsModule(log, { cross: true, crossReport: (i) => report(i) });
  const module: TraceModule<DotsCalc> = {
    ...dots,
    supplyDefaults(input, out: FullTrace, ctx) {
      dots.supplyDefaults(input, out, ctx);
      const x = out['x'] as ArrayLike<unknown> | undefined;
      const y = out['y'] as ArrayLike<unknown> | undefined;
      out['_length'] = Math.min(x?.length ?? 0, y?.length ?? 0);
    },
    calcAppend(_prev, trace, ctx) {
      return {
        x: ctx.xaxis!.scale.d2lArray(Array.from(trace['x'] as ArrayLike<unknown>)),
        y: ctx.yaxis!.scale.d2lArray(Array.from(trace['y'] as ArrayLike<unknown>)),
      };
    },
  };
  const registry = createChartRegistry().register(module);
  return { ...base, log, options: { ...base.options, registry } };
}

let charts: Chart[] = [];

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
});

const DATA = [0, 1, 2].map((k) => ({ type: 'dots', x: [0, 1, 2], y: [k, k + 1, k + 2] }));

/** A chart of three dots traces on one subplot (one cross-trace group), after its first draw. */
async function draw(report: (indices: readonly number[]) => Iterable<number> | undefined) {
  const s = reportSetup(report);
  const c = createChart(s.container, { data: DATA.map((d) => ({ ...d })) }, s.options);
  charts.push(c);
  await c.ready;
  s.log.cross.length = 0;
  s.log.updates.length = 0;
  return { s, c };
}

/** The plans the views got since the last reset, per trace index. */
function plans(updates: readonly { index: number; plan: TraceUpdatePlan }[]) {
  const out = new Map<number, TraceUpdatePlan[]>();
  for (const u of updates) out.set(u.index, [...(out.get(u.index) ?? []), u.plan]);
  return out;
}

const redrawn = (list: TraceUpdatePlan[] | undefined): boolean =>
  (list ?? []).some((p) => p.calc || p.plot);

describe('crossTraceCalc changed report', () => {
  it('keeps plan.append for a streamed trace the module does not report', async () => {
    const { s, c } = await draw(() => []);
    await c.extendTraces({ x: [[3]], y: [[9]] }, [0]);
    // The streamed trace dirtied the group: cross-trace calc ran for all members.
    expect(s.log.cross).toEqual([[0, 1, 2]]);
    const got = plans(s.log.updates);
    const own = got.get(0)!;
    expect(own.at(-1)?.append).toMatchObject({ at: 'end', count: 1 });
    // Unreported members are not redrawn.
    expect(redrawn(got.get(1))).toBe(false);
    expect(redrawn(got.get(2))).toBe(false);
  });

  it('gives only the reported entries full plans (by data index)', async () => {
    const { s, c } = await draw(() => [2, 99]);
    await c.extendTraces({ x: [[3]], y: [[9]] }, [0]);
    const got = plans(s.log.updates);
    expect(got.get(0)!.at(-1)?.append).toBeDefined();
    expect(redrawn(got.get(1))).toBe(false);
    const reported = got.get(2)!.at(-1)!;
    expect(reported).toMatchObject({ calc: true, plot: true, style: true });
    expect(reported.append).toBeUndefined();
  });

  it('a reported streamed trace loses plan.append', async () => {
    const { s, c } = await draw(() => new Set([0]));
    await c.extendTraces({ x: [[3]], y: [[9]] }, [0]);
    const got = plans(s.log.updates);
    const own = got.get(0)!.at(-1)!;
    expect(own).toMatchObject({ calc: true, plot: true, style: true });
    expect(own.append).toBeUndefined();
    expect(redrawn(got.get(1))).toBe(false);
  });

  it('returning nothing marks every entry changed (previous behaviour)', async () => {
    const { s, c } = await draw(() => undefined);
    await c.extendTraces({ x: [[3]], y: [[9]] }, [0]);
    const got = plans(s.log.updates);
    for (const i of [0, 1, 2]) {
      const last = got.get(i)!.at(-1)!;
      expect(last).toMatchObject({ calc: true, plot: true, style: true });
      expect(last.append).toBeUndefined();
    }
  });

  it('a restyled member keeps its own calc plan when unreported', async () => {
    const { s, c } = await draw(() => []);
    await c.restyle({ y: [[5, 5, 5]] }, [1]);
    const got = plans(s.log.updates);
    expect(got.get(1)!.at(-1)).toMatchObject({ calc: true, plot: true });
    expect(redrawn(got.get(0))).toBe(false);
    expect(redrawn(got.get(2))).toBe(false);
  });
});
