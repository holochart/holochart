// @vitest-environment jsdom
/**
 * Rejected updates leave the chart as it was: in strict mode (`config.strict`) every edit of the
 * figure is validated, style-only ones included, before the pipeline applies anything, and an
 * update call whose arguments are wrong applies none of them.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '@mk7s/holochart-core';
import { createChart, type Chart } from './chart.ts';
import type { TraceModule } from './contracts.ts';
import { createChartRegistry } from './registry.ts';
import { createDotsModule, setup, type DotsCalc, type TestSetup } from './__testing__/fakes.ts';

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

async function chart(labels: readonly string[], strict = true): Promise<Chart> {
  const c = createChart(t.container, { data: labels.map(trace), config: { strict } }, t.options);
  charts.push(c);
  await c.ready;
  t.log.calc.length = t.log.create.length = t.log.updates.length = t.log.disposed.length = 0;
  return c;
}

const labels = (c: Chart): unknown[] => c.data.map((d) => d['label']);
const colors = (c: Chart): unknown[] => c.fullData.map((d) => d['color']);

describe('strict mode', () => {
  it('validates a style-only update', async () => {
    const c = await chart(['a']);
    await expect(c.restyle({ color: 12 })).rejects.toThrow(ValidationError);
    await expect(c.relayout({ 'xaxis.color': 12 })).rejects.toThrow(ValidationError);
  });

  it('leaves the figure as it was when it rejects an update', async () => {
    const c = await chart(['a', 'b']);
    const data = [...c.data];
    const layout = c.layout;
    const shown = colors(c);
    await expect(c.restyle({ color: 12 }, 1)).rejects.toThrow(ValidationError);
    await expect(c.restyle({ x: 'not an array' }, 0)).rejects.toThrow(ValidationError);
    await expect(c.relayout({ 'xaxis.color': 12 })).rejects.toThrow(ValidationError);
    await expect(
      c.update({ layout: { paper_bgcolor: 'white' }, data: [{ color: 12 }] }),
    ).rejects.toThrow(ValidationError);
    // The same trace objects and layout: nothing kept the rejected values.
    expect(c.data).toEqual(data);
    c.data.forEach((d, i) => expect(d).toBe(data[i]));
    expect(c.layout).toBe(layout);
    expect(colors(c)).toEqual(shown);
    expect(t.log.calc).toEqual([]);
    expect(t.log.updates).toEqual([]);
    // The chart still takes updates, and they are not poisoned by the rejected ones.
    await c.restyle({ color: 'red' }, 1);
    expect(colors(c)).toEqual([shown[0], 'rgb(255, 0, 0)']);
    expect(t.log.updates.map((u) => [u.index, u.plan.style, u.plan.calc])).toEqual([
      [1, true, false],
    ]);
  });

  it('rejects every call batched with an invalid one, and applies none', async () => {
    const c = await chart(['a']);
    const good = c.restyle({ label: 'renamed' });
    const bad = c.restyle({ color: 12 });
    await expect(good).rejects.toThrow(ValidationError);
    await expect(bad).rejects.toThrow(ValidationError);
    expect(labels(c)).toEqual(['a']);
  });

  it('rejects an invalid figure or trace without replacing or adding anything', async () => {
    const c = await chart(['a', 'b']);
    const figure = { data: [{ ...trace('z'), color: 12 }], config: { strict: true } };
    await expect(c.react(figure)).rejects.toThrow(ValidationError);
    await expect(c.addTraces({ ...trace('c'), color: 12 }, 0)).rejects.toThrow(ValidationError);
    expect(labels(c)).toEqual(['a', 'b']);
    expect(c.config).toEqual({ strict: true });
    // Nothing was recalculated, and views and calcs still belong to their traces: a restyle
    // touches only its own.
    await c.relayout({});
    expect(t.log.calc).toEqual([]);
    t.log.create.length = t.log.updates.length = t.log.disposed.length = 0;
    await c.restyle({ label: 'B' }, 1);
    expect(c.fullData.map((d) => d['label'])).toEqual(['a', 'B']);
    expect(t.log.create).toEqual([]);
    expect(t.log.disposed).toEqual([]);
    expect(t.log.updates.map((u) => [u.index, u.plan.plot])).toEqual([
      [0, false],
      [1, true],
    ]);
  });

  it('draws the traces again that a rejected batch had removed', async () => {
    const c = await chart(['a', 'b']);
    const removed = c.deleteTraces(0);
    const bad = c.restyle({ color: 12 });
    await expect(removed).rejects.toThrow(ValidationError);
    await expect(bad).rejects.toThrow(ValidationError);
    expect(labels(c)).toEqual(['a', 'b']);
    // An empty update resolves once the chart has drawn what it shows now.
    await c.relayout({});
    expect(c.fullData.map((d) => d['label'])).toEqual(['a', 'b']);
    expect(t.log.disposed).toEqual([0]);
    expect(t.log.create).toEqual([0]);
    expect(t.log.calc).toEqual([]);
  });

  it('takes back edits that joined a run a view had asked for', async () => {
    // A view that asks for a recalc while it is drawn opens the next batch during the run.
    const dots = createDotsModule(t.log);
    const module: TraceModule<DotsCalc> = {
      ...dots,
      plot: {
        create(ctx) {
          const view = dots.plot!.create(ctx);
          return {
            ...view,
            update(c, plan) {
              view.update(c, plan);
              if (plan.plot && !plan.calc) c.recalc?.();
            },
          };
        },
      },
    };
    const options = { ...t.options, registry: createChartRegistry().register(module) };
    const c = createChart(t.container, { data: [trace('a')], config: { strict: true } }, options);
    charts.push(c);
    await c.ready;
    // The listener runs after the frame of the rename, before the run the view asked for.
    let bad: Promise<Chart> | undefined;
    c.once('restyle', () => (bad = c.restyle({ color: 12 })));
    await c.restyle({ label: 'A' }).catch(() => undefined);
    await expect(bad).rejects.toThrow(ValidationError);
    expect(c.data[0]?.['color']).toBeUndefined();
    expect(labels(c)).toEqual(['A']);
  });

  it('keeps a rejected config change out too', async () => {
    const c = await chart(['a'], false);
    await c.restyle({ color: 12 });
    // Turning strict mode on validates the figure as it is.
    await expect(c.update({ config: { strict: true } })).rejects.toThrow(ValidationError);
    expect(c.config).toEqual({ strict: false });
    expect(t.renderers).toHaveLength(1);
  });
});

describe('without strict mode', () => {
  it('does not validate style-only updates', async () => {
    const c = await chart(['a'], false);
    await expect(c.restyle({ color: 12 })).resolves.toBe(c);
    expect(c.data[0]?.['color']).toBe(12);
  });
});

describe('an update call with wrong arguments', () => {
  it('applies nothing when a trace index is out of range', async () => {
    const c = await chart(['a'], false);
    const patch = {
      config: { pixelRatio: 2 },
      layout: { title: { text: 'T' } },
      data: [{ color: 'red' }, { color: 'blue' }],
    };
    await expect(c.update(patch)).rejects.toThrow(RangeError);
    await expect(c.update(patch, { traces: [0, 3] })).rejects.toThrow(RangeError);
    expect(c.data[0]?.['color']).toBeUndefined();
    expect(c.layout['title']).toBeUndefined();
    expect(c.config).toEqual({ strict: false });
    // Nothing of it is drawn with the next update either.
    const shown = colors(c);
    await c.relayout({});
    expect(colors(c)).toEqual(shown);
    expect(c.fullLayout?.title.text).not.toBe('T');
    expect(t.renderers).toHaveLength(1);
    expect(t.log.updates).toEqual([]);
  });

  it('applies nothing when a later part of the call throws', async () => {
    const c = await chart(['a', 'b'], false);
    const seen: string[] = [];
    c.on('restyle', () => seen.push('restyle'));
    // The layout path is malformed: the restyle before it must not stay.
    await expect(
      c.updateAttributes({ color: 'red' }, { 'xaxis..range': [0, 1] }),
    ).rejects.toThrow();
    expect(c.data.map((d) => d['color'])).toEqual([undefined, undefined]);
    // Batched after a call that stands: that one is drawn, the failed one leaves no trace.
    const renamed = c.restyle({ label: 'A' }, 0);
    await expect(
      c.updateAttributes({ color: 'red' }, { 'xaxis..range': [0, 1] }),
    ).rejects.toThrow();
    await renamed;
    expect(c.data.map((d) => d['color'])).toEqual([undefined, undefined]);
    expect(c.fullData.map((d) => d['label'])).toEqual(['A', 'b']);
    expect(seen).toEqual(['restyle']);
  });
});
