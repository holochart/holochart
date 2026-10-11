// @vitest-environment jsdom
/**
 * What a font change redoes. Text is measured synchronously with whatever font the browser has, so
 * a stage that measured text (a trace's calc, extremes or plot) holds the fallback font's sizes
 * until it runs again; stages that measured nothing are left alone.
 *
 * The test trace type measures its `label` in the stage named by `where`, with an oracle whose
 * glyph width the tests change to stand for the font that finished loading.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFontMetricsOracle,
  measureText,
  registerFont,
  setDefaultFontMetricsOracle,
  type FontMetricsOracle,
} from '@mk7s/holochart-render';
import { createChart, type Chart } from './chart.ts';
import type { TraceModule } from './contracts.ts';
import { linearExtremes } from './axes.ts';
import { createChartRegistry } from './registry.ts';
import { createDotsModule, setup, type DotsCalc, type TestSetup } from './__testing__/fakes.ts';

type Where = 'calc' | 'extremes' | 'plot';

const FONT = { family: 'sans-serif', size: 10 };
const UPDATED = { calc: false, plot: false, style: false, transform: true };

/** Px per character at a font size of 1: the "font" the oracle measures with. */
let glyph = 0.5;
let oracle: FontMetricsOracle;
let t: TestSetup;
let charts: Chart[] = [];
/** Trace indices whose `extremes` ran, in order. */
let extremes: number[] = [];

/** Dots that measure their `label` (when they have one) in one stage. */
function measuringModule(where: Where): TraceModule<DotsCalc> {
  const dots = createDotsModule(t.log);
  const width = (trace: Record<string, unknown>): number =>
    trace['label'] ? measureText(String(trace['label']), FONT).width : 0;
  return {
    ...dots,
    calc(trace, ctx) {
      if (where === 'calc') width(trace);
      return dots.calc!(trace, ctx);
    },
    extremes(calc, trace, ctx) {
      extremes.push(ctx.index);
      const pad = where === 'extremes' ? width(trace) : 0;
      return { x: linearExtremes(calc.x, pad), y: linearExtremes(calc.y, 0) };
    },
    plot: {
      create(ctx) {
        const view = dots.plot!.create(ctx);
        if (where === 'plot') width(ctx.trace);
        return {
          ...view,
          update(c, plan) {
            // Like a view that lays its labels out again only when it re-reads the trace.
            if (where === 'plot' && plan.plot) width(c.trace);
            view.update(c, plan);
          },
        };
      },
    },
  };
}

async function chart(where: Where, labels: readonly string[]): Promise<Chart> {
  const registry = createChartRegistry().register(measuringModule(where));
  const data = labels.map((label) => ({ type: 'dots', x: [0, 10], y: [0, 100], label, size: 0 }));
  const c = createChart(t.container, { data }, { ...t.options, registry });
  charts.push(c);
  await c.ready;
  t.log.calc.length = t.log.updates.length = extremes.length = 0;
  return c;
}

/** The font finished loading: text is now `to` px per character wide. */
async function loadFont(c: Chart, to: number): Promise<void> {
  glyph = to;
  oracle.clear();
  // Any registration notifies font-change subscribers (the chart is one).
  registerFont({ family: 'Loaded', url: '/loaded.woff' }, { cssFontFace: false })();
  // An empty update resolves with the run the font change queued.
  await c.relayout({});
}

const xRange = (c: Chart): [number, number] =>
  (c.fullLayout?.['xaxis'] as { range: [number, number] }).range;

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  glyph = 0.5;
  oracle = createFontMetricsOracle({
    measurer: {
      kind: 'test',
      width: (text) => text.length * glyph,
      vertical: () => ({ ascent: 0.8, descent: 0.2 }),
    },
  });
  setDefaultFontMetricsOracle(oracle);
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  extremes = [];
  t.container.remove();
  setDefaultFontMetricsOracle(null);
});

describe('a font change', () => {
  it('measures extremes again where they measured text, and only there', async () => {
    const c = await chart('extremes', ['outside label', '']);
    const before = xRange(c);
    await loadFont(c, 1);
    // Trace 0 padded its extremes by the label's width, which doubled; trace 1 measured nothing.
    expect(extremes).toEqual([0]);
    const after = xRange(c);
    expect(after[1] - after[0]).toBeGreaterThan(before[1] - before[0]);
    // Nothing was recalculated or re-read: the new range only moved the traces.
    expect(t.log.calc).toEqual([]);
    expect(t.log.updates.map((u) => u.plan)).toEqual([UPDATED, UPDATED]);
  });

  it('recalculates a trace whose calc measured text, and only that trace', async () => {
    const c = await chart('calc', ['', 'boxed label']);
    await loadFont(c, 1);
    expect(t.log.calc).toEqual([1]);
    expect(t.log.updates.map((u) => u.plan)).toEqual([
      UPDATED,
      { calc: true, plot: true, style: true, transform: true },
    ]);
  });

  it('has a view that measured text re-read its trace, and only that view', async () => {
    const c = await chart('plot', ['placed label', '']);
    await loadFont(c, 1);
    expect(t.log.calc).toEqual([]);
    expect(t.log.updates.map((u) => u.plan)).toEqual([
      { calc: false, plot: true, style: true, transform: true },
      UPDATED,
    ]);
  });

  it('leaves traces without text alone', async () => {
    const c = await chart('extremes', ['', '']);
    const before = xRange(c);
    await loadFont(c, 1);
    expect(extremes).toEqual([]);
    expect(t.log.calc).toEqual([]);
    expect(xRange(c)).toEqual(before);
    expect(t.log.updates.map((u) => u.plan)).toEqual([UPDATED, UPDATED]);
  });

  it('keeps following a stage that measured text across later font changes', async () => {
    const c = await chart('extremes', ['outside label']);
    await loadFont(c, 0.75);
    const first = xRange(c);
    extremes.length = 0;
    await loadFont(c, 1);
    expect(extremes).toEqual([0]);
    const second = xRange(c);
    expect(second[1] - second[0]).toBeGreaterThan(first[1] - first[0]);
  });
});
