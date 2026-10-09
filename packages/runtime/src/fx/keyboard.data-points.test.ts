// @vitest-environment jsdom
/**
 * Keyboard navigation of a cartesian trace's data points: where they are along x when the trace
 * gives `x0` / `dx` instead of an `x` array, and where the cursor's label is anchored when the
 * trace's hover does not report the point. Through a real chart with a fake renderer; the container
 * is 640×400 with margins l 40, r 20, t 30, b 50 (plot area x 40–620, y 30–350), x in [0, 10] and
 * y in [0, 100], so data (x, y) sits at container (40 + 58·x, 350 − 3.2·y).
 */
import { attr, type FigureInput } from '@mk7s/holochart-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from '../chart.ts';
import type { TraceModule } from '../contracts.ts';
import type { ChartEventName } from '../events.ts';
import {
  createDotsModule,
  createLog,
  setup,
  type DotsCalc,
  type TestSetup,
} from '../__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };
const RANGES = { xaxis: { range: [0, 10] }, yaxis: { range: [0, 100] } };

let t: TestSetup;
let charts: Chart[] = [];

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
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

function target(c: Chart): HTMLElement {
  return c.element.querySelector<HTMLElement>('.holochart-focus') as HTMLElement;
}

/** Focus the chart and wait for the navigation code. */
async function focus(c: Chart): Promise<void> {
  const el = target(c);
  el.focus();
  await vi.waitFor(() => expect(el.querySelector('.holochart-live')).not.toBeNull());
}

function press(c: Chart, key: string): void {
  target(c).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function said(c: Chart): string {
  return (target(c).querySelector('.holochart-live')?.textContent ?? '').trimEnd();
}

function record(c: Chart, ...names: ChartEventName[]): { name: string; payload: unknown }[] {
  const log: { name: string; payload: unknown }[] = [];
  for (const name of names) c.on(name, (payload: unknown) => void log.push({ name, payload }));
  return log;
}

function lastPoint(log: { name: string; payload: unknown }[]): Record<string, unknown> {
  const p = log[log.length - 1]?.payload as { points: Record<string, unknown>[] };
  return p.points[0] as Record<string, unknown>;
}

describe('a trace positioned by x0 and dx', () => {
  /** Dots without an `x` array: point `i` is at `x0 + i·dx`, and its hover reports that x. */
  function steps(): TraceModule<DotsCalc> {
    const dots = createDotsModule(createLog());
    return {
      ...dots,
      type: 'steps',
      schema: attr.object({
        y: attr.dataArray({ editType: 'calc' }),
        x0: attr.number({ dflt: 0, editType: 'calc' }),
        dx: attr.number({ dflt: 1, editType: 'calc' }),
      }),
      supplyDefaults(_in, out, ctx) {
        const y = ctx.coerce<ArrayLike<unknown> | undefined>('y');
        ctx.coerce('x0');
        ctx.coerce('dx');
        out['_length'] = y?.length ?? 0;
      },
      calc(trace, ctx) {
        const y = ctx.yaxis!.scale.d2lArray(trace['y'] as ArrayLike<unknown>);
        const x = Float64Array.from(y, (_, i) => Number(trace['x0']) + i * Number(trace['dx']));
        return { x, y };
      },
      hoverPoints(calc, trace, q, ctx) {
        return dots.hoverPoints!(calc, trace, q, ctx).map((p) => ({
          ...p,
          x: calc.x[p.pointIndex],
        }));
      },
    };
  }

  it('walks the points at x0 + i·dx, those in view only', async () => {
    t.registry.register(steps() as TraceModule);
    const c = await chart([{ type: 'steps', name: 'S', x0: 2, dx: 3, y: [10, 20, 30, 40] }]);
    const log = record(c, 'hover');
    await focus(c);
    press(c, 'Home');
    expect(said(c)).toBe('S: (2, 10), point 1 of 4.');
    expect(lastPoint(log)).toMatchObject({ pointNumber: 0, bbox: { x0: 40 + 58 * 2 } });
    press(c, 'ArrowRight');
    expect(said(c)).toBe('S: (5, 20), point 2 of 4.');
    // The fourth point is at x = 11, right of the range [0, 10].
    press(c, 'End');
    expect(said(c)).toBe('S: (8, 30), point 3 of 4.');
  });
});

describe('a trace whose hover does not report the cursor’s point', () => {
  /** Dots whose hover finds nothing (the pointer would have to be somewhere else). */
  function quiet(): TraceModule {
    return {
      ...(createDotsModule(createLog()) as TraceModule),
      type: 'quiet',
      hoverPoints: () => [],
    };
  }

  it('still visits each data point, labelled with its values at its own position', async () => {
    t.registry.register(quiet());
    const c = await chart([{ type: 'quiet', name: 'Q', x: [4, 0, 8], y: [40, 10, 80] }]);
    const log = record(c, 'hover');
    await focus(c);
    press(c, 'End');
    expect(said(c)).toBe('Q: (8, 80), point 3 of 3.');
    const p = lastPoint(log);
    expect(p).toMatchObject({ curveNumber: 0, pointNumber: 2, x: 8, y: 80 });
    const bbox = p['bbox'] as { x0: number; y0: number };
    expect(bbox.x0).toBeCloseTo(40 + 58 * 8);
    expect(bbox.y0).toBeCloseTo(350 - 3.2 * 80);
  });

  it('anchors a point without a y value at mid height, at its x', async () => {
    t.registry.register(quiet());
    const c = await chart([{ type: 'quiet', name: 'Q', x: [4, 0, 8], y: [40, null, 80] }]);
    const log = record(c, 'hover');
    await focus(c);
    press(c, 'Home'); // x = 0: the point without y
    const p = lastPoint(log);
    expect(p).toMatchObject({ pointNumber: 1, x: 0 });
    const bbox = p['bbox'] as { x0: number; y0: number };
    expect(bbox.x0).toBeCloseTo(40);
    // The plot area spans y 30–350.
    expect(bbox.y0).toBeCloseTo(190);
  });
});
