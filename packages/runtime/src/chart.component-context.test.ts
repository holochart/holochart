// @vitest-environment jsdom
/**
 * What the chart hands to components (see `ComponentLayoutContext` / `ComponentDrawContext`):
 * several margin pushes from one component, trace modules and calcdata during the margin passes,
 * `remove` / `invalidate` on the draw context, the full-data `autorange` of an axis, and a
 * component replaced in the registry. The container is 640×400.
 */
import type { AxisExtremes, FigureInput } from '@mk7s/holochart-core';
import type { Primitive } from '@mk7s/holochart-render';
import { Object3D } from 'three';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import type { ComponentDrawContext, ComponentModule } from './contracts.ts';
import { setup, type DotsCalc, type TestSetup } from './__testing__/fakes.ts';

const XY = { type: 'dots', x: [0, 10], y: [0, 100], size: 0 };

let charts: Chart[] = [];
let setups: TestSetup[] = [];

afterEach(() => {
  for (const c of charts) c.destroy();
  for (const s of setups) s.container.remove();
  charts = [];
  setups = [];
  vi.restoreAllMocks();
});

async function chart(
  components: ComponentModule[],
  figure: FigureInput,
): Promise<{ c: Chart; s: TestSetup }> {
  const s = setup({ width: 640, height: 400, components });
  setups.push(s);
  const c = createChart(s.container, figure, s.options);
  charts.push(c);
  await c.ready;
  return { c, s };
}

interface FakePrimitive extends Primitive<unknown> {
  dispose: Mock<() => void>;
}

function primitive(): FakePrimitive {
  return {
    object: new Object3D(),
    update: () => undefined,
    setTransform: () => undefined,
    setViewport: () => undefined,
    dispose: vi.fn<() => void>(),
  } as unknown as FakePrimitive;
}

describe('pushMargin', () => {
  it('takes a list of pushes: the largest per side, reserved room stacked on top', async () => {
    const legend: ComponentModule = {
      name: 'legend',
      pushMargin: () => [{ l: 100 }, { r: 80 }, { l: 60, t: 50, reserved: true }],
    };
    const { c } = await chart([legend], {
      data: [XY],
      layout: { margin: { l: 10, r: 10, t: 10, b: 10 } },
    });
    // l: 100 pushed + 60 reserved; r: 80; t: 50 reserved; b: the layout's 10.
    expect(c.subplots.get('xy')?.rect).toEqual({ x: 160, y: 50, width: 400, height: 340 });
  });

  it('sees trace modules, and calcdata from the automargin passes on', async () => {
    const seen: { module: unknown; missing: unknown; calc: unknown }[] = [];
    const legend: ComponentModule = {
      name: 'legend',
      pushMargin: (ctx) => {
        seen.push({
          module: ctx.traceModule?.('dots'),
          missing: ctx.traceModule?.('nope'),
          calc: ctx.calcdata?.(0),
        });
        return undefined;
      },
    };
    const { c, s } = await chart([legend], { data: [XY, { ...XY, visible: false }] });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0]?.module).toBe(s.registry.getTrace('dots'));
    expect(seen[0]?.missing).toBeUndefined();
    // The first margin pass runs before calc; the automargin pass after it.
    expect(seen[0]?.calc).toBeUndefined();
    expect(seen.at(-1)?.calc).toBe(c.getCalcdata(0));
    expect(Array.from((seen.at(-1)?.calc as DotsCalc).x)).toEqual([0, 10]);
  });

  it('gets no calcdata for a hidden trace', async () => {
    const calcs: unknown[] = [];
    const legend: ComponentModule = {
      name: 'legend',
      pushMargin: (ctx) => {
        calcs.push(ctx.calcdata?.(1));
        return undefined;
      },
    };
    await chart([legend], { data: [XY, { ...XY, visible: false }] });
    expect(calcs.length).toBeGreaterThanOrEqual(2);
    expect(calcs.every((v) => v === undefined)).toBe(true);
  });
});

describe('the draw context', () => {
  it('remove() takes a primitive out of its viewport and disposes it, once', async () => {
    const kept = primitive();
    const dropped = primitive();
    const marks: ComponentModule = {
      name: 'marks',
      draw: {
        create(ctx) {
          ctx.add(kept);
          ctx.add(dropped);
          return {
            update(c) {
              c.remove(dropped);
            },
          };
        },
      },
    };
    const { c } = await chart([marks], { data: [XY] });
    const overlay = c.three.scene;
    expect(overlay.children).toContain(dropped.object);
    await c.restyle({ color: 'red' });
    expect(overlay.children).not.toContain(dropped.object);
    expect(overlay.children).toContain(kept.object);
    expect(dropped.dispose).toHaveBeenCalledTimes(1);
    expect(kept.dispose).not.toHaveBeenCalled();
    // The view's teardown disposes what is left, not what was removed already.
    c.destroy();
    expect(kept.dispose).toHaveBeenCalledTimes(1);
    expect(dropped.dispose).toHaveBeenCalledTimes(1);
  });

  it('invalidate() draws one more frame on the next animation frame', async () => {
    let ctx: ComponentDrawContext | undefined;
    const marks: ComponentModule = {
      name: 'marks',
      draw: {
        create(c) {
          ctx = c;
          return { update: () => undefined };
        },
      },
    };
    const { s } = await chart([marks], { data: [XY] });
    const frames = s.frames();
    s.scheduler.step();
    expect(s.frames()).toBe(frames); // nothing to draw
    ctx?.invalidate();
    s.scheduler.step();
    expect(s.frames()).toBe(frames + 1);
  });

  it('autorange(id) spans the visible data on that axis and what components add to it', async () => {
    let ctx: ComponentDrawContext | undefined;
    const marks: ComponentModule = {
      name: 'marks',
      // A data-referenced mark at x = 50 (linear).
      extremes: () => {
        const x: AxisExtremes = { min: [], max: [{ l: 50, padPx: 0 }] };
        return { x };
      },
      draw: {
        create(c) {
          ctx = c;
          return {
            update(next) {
              ctx = next;
            },
          };
        },
      },
    };
    const { c } = await chart([marks], {
      data: [
        XY,
        // On other axes, and hidden: neither counts for x.
        { ...XY, x: [100, 200], xaxis: 'x2', yaxis: 'y2' },
        { ...XY, x: [-500, -400], visible: 'legendonly' },
      ],
      layout: {
        xaxis: { range: [2, 3], domain: [0, 0.45] },
        xaxis2: { domain: [0.55, 1], anchor: 'y2' },
        yaxis2: { anchor: 'x2' },
      },
    });
    expect(c.axes.get('x')?.scale.range).toEqual([2, 3]);
    expect(ctx?.autorange?.('x')).toEqual([0, 50]);
    expect(ctx?.autorange?.('x2')).toEqual([100, 200]);
  });
});

describe('a component registered again under the same name', () => {
  it('replaces the drawn view on the next update', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log: string[] = [];
    const version = (v: string): ComponentModule => ({
      name: 'badge',
      draw: {
        create() {
          log.push(`create ${v}`);
          return {
            update: () => void log.push(`update ${v}`),
            dispose: () => void log.push(`dispose ${v}`),
          };
        },
      },
    });
    const { c, s } = await chart([version('1')], { data: [XY] });
    expect(log).toEqual(['create 1']);
    s.registry.register(version('2'));
    await c.restyle({ color: 'red' });
    expect(log).toEqual(['create 1', 'dispose 1', 'create 2']);
    await c.restyle({ color: 'blue' });
    expect(log).toEqual(['create 1', 'dispose 1', 'create 2', 'update 2']);
  });
});
