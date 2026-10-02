// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FullTrace } from '@mk7s/holochart-core';
import { linearExtremes } from '../axes.ts';
import { createChart, type Chart } from '../chart.ts';
import type { TraceModule, TraceUpdatePlan } from '../contracts.ts';
import { usesStyles } from '../plan.ts';
import { styleRulePaths } from './styles.ts';
import { setup, type TestSetup } from '../__testing__/fakes.ts';
import { spots } from '../__testing__/spots.ts';

/** `spots` (see `__testing__/spots.ts`) with calc and a view recording the plans it is updated with. */
function spotsModule(plans: TraceUpdatePlan[]): TraceModule<{ x: Float64Array; y: Float64Array }> {
  return {
    ...(spots as unknown as TraceModule<{ x: Float64Array; y: Float64Array }>),
    animatable: ['x', 'y', 'marker.size'],
    calc(trace, ctx) {
      return {
        x: ctx.xaxis!.scale.d2lArray((trace['x'] as ArrayLike<unknown>) ?? []),
        y: ctx.yaxis!.scale.d2lArray((trace['y'] as ArrayLike<unknown>) ?? []),
      };
    },
    extremes(calc) {
      return { x: linearExtremes(calc.x, 0), y: linearExtremes(calc.y, 0) };
    },
    plot: {
      create() {
        return { update: (_c, plan) => void plans.push({ ...plan }) };
      },
    },
  };
}

let t: TestSetup;
let chart: Chart | undefined;
let plans: TraceUpdatePlan[];

beforeAll(async () => {
  // Have the lazily loaded code in the module cache (the chart awaits it on first use).
  await import('./styles.ts');
  await import('../anim/animation.ts');
});

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  plans = [];
  t.registry.register(spotsModule(plans));
});

afterEach(() => {
  chart?.destroy();
  chart = undefined;
  t.container.remove();
  vi.restoreAllMocks();
});

async function make(figure: Parameters<typeof createChart>[1]): Promise<Chart> {
  chart = createChart(t.container, figure, t.options);
  await chart.ready;
  return chart;
}

function marker(c: Chart, i = 0): Record<string, unknown> {
  return (c.fullData[i] as FullTrace)['marker'] as Record<string, unknown>;
}

const GOLD = 'rgb(255, 215, 0)';
const RED = 'rgb(255, 0, 0)';
const BLUE = 'rgb(0, 0, 255)';
const rule = (y: number, set: Record<string, unknown>) => ({ when: { y: { gt: y } }, set });
const X = [0, 1, 2];
const Y = [1, 5, 9];
const trace = (extra: Record<string, unknown> = {}) => ({
  type: 'spots',
  x: X,
  y: Y,
  marker: { color: 'blue', size: 2 },
  ...extra,
});

describe('charts with style rules (E8.5)', () => {
  it('draws with the rules applied from the first frame', async () => {
    const c = await make({ data: [trace({ styleRules: [rule(4, { 'marker.color': 'gold' })] })] });
    expect(marker(c)['color']).toEqual([BLUE, GOLD, GOLD]);
  });

  it('restyling rules that set styles only restyles; sizes recalc', async () => {
    const c = await make({ data: [trace({ styleRules: [rule(4, { 'marker.color': 'gold' })] })] });
    plans.length = 0;
    await c.restyle({ styleRules: [[rule(8, { 'marker.color': 'red' })]] });
    expect(marker(c)['color']).toEqual([BLUE, BLUE, RED]);
    expect(plans).toEqual([{ calc: false, plot: false, style: true, transform: false }]);
    plans.length = 0;
    await c.update({ data: [{ styleRules: [rule(8, { 'marker.size': 9 })] }] });
    expect(marker(c)['size']).toEqual(Float64Array.of(2, 2, 9));
    expect(marker(c)['color']).toBe(BLUE);
    expect(plans[0]?.calc).toBe(true);
  });

  it('react: a rules change is a style change, a data change recomputes', async () => {
    const c = await make({ data: [trace({ styleRules: [rule(4, { 'marker.color': 'gold' })] })] });
    plans.length = 0;
    await c.react({ data: [trace({ styleRules: [rule(0, { 'marker.color': 'gold' })] })] });
    expect(marker(c)['color']).toEqual([GOLD, GOLD, GOLD]);
    expect(plans).toEqual([{ calc: false, plot: false, style: true, transform: false }]);
    plans.length = 0;
    await c.react({
      data: [trace({ y: [9, 1, 1], styleRules: [rule(4, { 'marker.color': 'gold' })] })],
    });
    expect(marker(c)['color']).toEqual([GOLD, BLUE, BLUE]);
    expect(plans[0]?.calc).toBe(true);
  });

  it('keeps its arrays across updates that do not touch the trace', async () => {
    const c = await make({ data: [trace({ styleRules: [rule(4, { 'marker.size': 8 })] })] });
    const size = marker(c)['size'];
    await c.relayout({ 'title.text': 'hi', 'xaxis.range': [0, 5] });
    expect(marker(c)['size']).toBe(size);
  });

  it('rejects the update in strict mode', async () => {
    chart = createChart(
      t.container,
      {
        data: [trace({ styleRules: [{ when: { y: { gtt: 1 } }, set: {} }] })],
        config: { strict: true },
      },
      t.options,
    );
    await expect(chart.ready).rejects.toThrow(/unknown operator 'gtt'/);
  });

  it('round-trips as JSON', async () => {
    const rules = [rule(4, { 'marker.color': 'gold', 'marker.size': 14 })];
    const c = await make({ data: [trace({ styleRules: rules })] });
    const json = JSON.parse(JSON.stringify(c.toJSON())) as { data: Record<string, unknown>[] };
    expect(json.data[0]?.['styleRules']).toEqual(rules);
    chart = undefined;
    c.destroy();
    const again = await make(json);
    expect(marker(again)['size']).toEqual(Float64Array.of(2, 14, 14));
  });

  it('transitions interpolate what the rules give, and end on the new rules', async () => {
    const figure = (rules: unknown[]) => ({
      data: [trace({ styleRules: rules })],
      layout: { transition: { duration: 160, easing: 'linear' as const } },
    });
    const c = await make(figure([rule(4, { 'marker.size': 10 })]));
    expect(marker(c)['size']).toEqual(Float64Array.of(2, 10, 10));
    const done = c.react(figure([rule(8, { 'marker.size': 20 })]));
    const flush = async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    };
    await flush();
    for (let i = 0; i < 5; i++) {
      t.scheduler.step();
      await flush();
    }
    // Halfway: [2, 10, 10] → [2, 2, 20], not snapped by the rules.
    expect(Array.from(marker(c)['size'] as ArrayLike<number>)).toEqual([2, 6, 15]);
    for (let i = 0; i < 6; i++) {
      t.scheduler.step();
      await flush();
    }
    await done;
    expect(marker(c)['size']).toEqual(Float64Array.of(2, 2, 20));
    expect((c.data[0] as Record<string, unknown>)['marker']).toEqual({ color: 'blue', size: 2 });
  });
});

describe('charts with style functions (E8.6)', () => {
  const color = (p: { y: number }) => (p.y > 4 ? 'gold' : 'gray');

  it('evaluates functions into arrays; a new function is a style change', async () => {
    const c = await make({ data: [trace({ marker: { color, size: (p: { x: number }) => p.x } })] });
    expect(marker(c)['color']).toEqual(['gray', 'gold', 'gold']);
    expect(marker(c)['size']).toEqual([0, 1, 2]);
    plans.length = 0;
    await c.restyle({ 'marker.color': () => 'red' });
    expect(marker(c)['color']).toEqual(['red', 'red', 'red']);
    expect(plans).toEqual([{ calc: false, plot: false, style: true, transform: false }]);
  });

  it('toJSON evaluates functions into arrays and warns once per attribute', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const c = await make({ data: [trace({ marker: { color } })] });
    const json = c.toJSON() as { data: Record<string, unknown>[] };
    expect(json.data[0]?.['marker']).toEqual({ color: ['gray', 'gold', 'gold'] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/data\[0\]\.marker\.color: style function/);
    // The input keeps the function.
    expect(((c.data[0] as Record<string, unknown>)['marker'] as { color: unknown }).color).toBe(
      color,
    );
  });
});

describe('planning helpers', () => {
  it('usesStyles finds rules and functions, not data arrays', () => {
    expect(usesStyles({ y: [1, 2] })).toBe(false);
    expect(usesStyles({ styleRules: [] })).toBe(true);
    expect(usesStyles({ marker: { line: { color: () => 'red' } } })).toBe(true);
    expect(usesStyles(null)).toBe(false);
  });

  it('styleRulePaths swaps rules edits for what the rules set, before and after', () => {
    const before = { styleRules: [{ set: { 'marker.size': 1 } }] };
    const after = { styleRules: [{ set: { 'marker.color': 'red' } }, { bad: 1 }] };
    expect(styleRulePaths(['y'], before, after)).toEqual(['y']);
    expect(styleRulePaths(['styleRules', 'x'], before, after)).toEqual([
      'x',
      'marker.size',
      'marker.color',
    ]);
    expect(styleRulePaths(['styleRules[0].set'], undefined, { styleRules: 3 })).toEqual([]);
  });
});
