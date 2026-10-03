// @vitest-environment jsdom
/**
 * The life of trace views in the chart: primitives removed through the plot context, a view
 * rebuilt when its trace changes type or subplot, and pointer events offered to trace views
 * (`TraceView.handlePointer`: last trace first, a consumed `down` keeps the gesture).
 * The container is 640×400 with margins l 40, r 20, t 30, b 50: plot area x 40–620, y 30–350.
 */
import { attr, type FigureInput } from '@mk7s/holochart-core';
import type { Primitive } from '@mk7s/holochart-render';
import { Object3D } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import type {
  ComponentPointerEvent,
  TraceModule,
  TracePlotContext,
  TraceUpdatePlan,
} from './contracts.ts';
import { setup, type TestSetup } from './__testing__/fakes.ts';

const MARGIN = { l: 40, r: 20, t: 30, b: 50 };

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

interface Hooks {
  create?(ctx: TracePlotContext): void;
  update?(ctx: TracePlotContext, plan: TraceUpdatePlan): void;
  pointer?(index: number, event: ComponentPointerEvent): boolean | void;
}

/**
 * A cartesian trace type whose views log `create` / `update` / `dispose` as
 * `<what> <type><index>@<viewport name>` and run `hooks`.
 */
function probe(type: string, calls: string[], hooks: Hooks = {}): TraceModule<null> {
  return {
    type,
    categories: ['cartesian'],
    schema: attr.object({ label: attr.string({ dflt: '', editType: 'plot' }) }),
    meta: { description: `Test ${type}.` },
    supplyDefaults(_in, _out, ctx) {
      ctx.coerce('label');
    },
    calc: () => null,
    plot: {
      create(ctx) {
        const index = ctx.index;
        const name = `${type}${index}@${ctx.viewport.name}`;
        calls.push(`create ${name}`);
        hooks.create?.(ctx);
        return {
          update(c, plan) {
            calls.push(`update ${type}${c.index}@${c.viewport.name}`);
            hooks.update?.(c, plan);
          },
          dispose() {
            calls.push(`dispose ${name}`);
          },
          ...(hooks.pointer
            ? { handlePointer: (e: ComponentPointerEvent) => hooks.pointer?.(index, e) }
            : {}),
        };
      },
    },
  };
}

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

async function chart(data: unknown[], layout: Record<string, unknown> = {}): Promise<Chart> {
  const c = createChart(
    t.container,
    { data, layout: { margin: MARGIN, ...layout } } as FigureInput,
    t.options,
  );
  charts.push(c);
  await c.ready;
  return c;
}

const TWO_PANELS = {
  xaxis: { domain: [0, 0.45] },
  xaxis2: { domain: [0.55, 1], anchor: 'y2' },
  yaxis2: { anchor: 'x2' },
};

describe('primitives of a trace view', () => {
  it('remove() takes one out of the subplot and disposes it; the rest go with the view', async () => {
    const kept = primitive();
    const dropped = primitive();
    t.registry.register(
      probe('p', [], {
        create: (ctx) => {
          ctx.add(kept);
          ctx.add(dropped);
        },
        update: (ctx) => ctx.remove(dropped),
      }),
    );
    const c = await chart([{ type: 'p' }]);
    const scene = c.three.subplot('xy')?.scene;
    expect(c.getTraceObjects(0)).toEqual([kept.object, dropped.object]);
    await c.restyle({ label: 'again' });
    expect(c.getTraceObjects(0)).toEqual([kept.object]);
    expect(scene?.children).toContain(kept.object);
    expect(scene?.children).not.toContain(dropped.object);
    expect(dropped.dispose).toHaveBeenCalledTimes(1);
    await c.deleteTraces(0);
    expect(kept.dispose).toHaveBeenCalledTimes(1);
    expect(dropped.dispose).toHaveBeenCalledTimes(1);
  });

  it('remove() finds a primitive that was added to another viewport', async () => {
    const elsewhere = primitive();
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    t.registry.register(
      probe('p', [], {
        create: (ctx) => {
          const scene3d = ctx.subplotViewport?.('scene', { rect });
          ctx.add(elsewhere, scene3d);
        },
        update: (ctx) => {
          // Keep the 3D viewport alive (it goes when nobody asks for it), then drop the primitive.
          ctx.subplotViewport?.('scene', { rect });
          ctx.remove(elsewhere);
        },
      }),
    );
    const c = await chart([{ type: 'p' }]);
    const scene3d = c.three.viewports.find((v) => v.name === 'subplot-scene');
    expect(scene3d?.scene.children).toContain(elsewhere.object);
    expect(c.three.subplot('xy')?.scene.children).not.toContain(elsewhere.object);
    await c.restyle({ label: 'again' });
    expect(c.three.viewports).toContain(scene3d);
    expect(scene3d?.scene.children).not.toContain(elsewhere.object);
    expect(elsewhere.dispose).toHaveBeenCalledTimes(1);
    expect(c.getTraceObjects(0)).toEqual([]);
  });

  it('invalidate() draws one more frame on the next animation frame', async () => {
    let ctx: TracePlotContext | undefined;
    t.registry.register(probe('p', [], { create: (c) => void (ctx = c) }));
    await chart([{ type: 'p' }]);
    const frames = t.frames();
    t.scheduler.step();
    expect(t.frames()).toBe(frames);
    ctx?.invalidate();
    t.scheduler.step();
    expect(t.frames()).toBe(frames + 1);
  });
});

describe('a view is rebuilt when its trace', () => {
  it('changes type: the old type disposes, the new one creates', async () => {
    const calls: string[] = [];
    t.registry.register(probe('p', calls), probe('q', calls));
    const c = await chart([{ type: 'p' }, { type: 'p' }]);
    calls.length = 0;
    await c.restyle({ type: 'q' }, 1);
    expect(calls.filter((k) => !k.startsWith('update'))).toEqual([
      'dispose p1@subplot-xy',
      'create q1@subplot-xy',
    ]);
    expect(c.fullData.map((d) => d.type)).toEqual(['p', 'q']);
  });

  it('moves to another subplot that stays: disposed there, created here', async () => {
    const calls: string[] = [];
    t.registry.register(probe('p', calls));
    const c = await chart(
      [{ type: 'p' }, { type: 'p', xaxis: 'x2', yaxis: 'y2' }, { type: 'p' }],
      TWO_PANELS,
    );
    calls.length = 0;
    await c.restyle({ xaxis: 'x2', yaxis: 'y2' }, 2);
    expect(calls.filter((k) => !k.startsWith('update'))).toEqual([
      'dispose p2@subplot-xy',
      'create p2@subplot-x2y2',
    ]);
    expect([...c.subplots.keys()]).toEqual(['xy', 'x2y2']);
  });

  it('leaves a subplot that then has no trace: the subplot and its viewport go too', async () => {
    const calls: string[] = [];
    // One primitive per view.
    const marks: FakePrimitive[] = [];
    t.registry.register(
      probe('p', calls, {
        create: (ctx) => {
          const mark = primitive();
          marks.push(mark);
          ctx.add(mark);
        },
      }),
    );
    const c = await chart([{ type: 'p', xaxis: 'x2', yaxis: 'y2' }], {
      xaxis2: { anchor: 'y2' },
      yaxis2: { anchor: 'x2' },
    });
    expect(c.three.viewports.map((v) => v.name)).toEqual(['subplot-x2y2', 'overlay']);
    const old = c.three.subplot('x2y2');
    calls.length = 0;
    await c.restyle({ xaxis: 'x', yaxis: 'y' }, 0);
    expect(calls.filter((k) => !k.startsWith('update'))).toEqual([
      'dispose p0@subplot-x2y2',
      'create p0@subplot-xy',
    ]);
    expect([...c.subplots.keys()]).toEqual(['xy']);
    expect(c.three.viewports.map((v) => v.name)).toEqual(['subplot-xy', 'overlay']);
    expect(old?.disposed).toBe(true);
    // The old view's primitive was disposed with it (once); the new view's is in the new subplot.
    expect(marks).toHaveLength(2);
    expect(marks[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(marks[1]?.dispose).not.toHaveBeenCalled();
    expect(c.getTraceObjects(0)).toEqual([marks[1]?.object]);
    expect(c.three.subplot('xy')?.scene.children).toContain(marks[1]?.object);
  });
});

describe('a trace type without calc', () => {
  it('still draws: its view is created with no calcdata', async () => {
    const created: unknown[] = [];
    const module = probe('p', [], { create: (ctx) => void created.push(ctx.calc) });
    const { calc: _calc, ...withoutCalc } = module;
    t.registry.register(withoutCalc);
    const c = await chart([{ type: 'p' }]);
    expect(created).toEqual([undefined]);
    expect(c.getCalcdata(0)).toBeUndefined();
  });
});

describe('pointer events offered to trace views', () => {
  function fire(c: Chart, type: string, x: number, y: number): void {
    c.three.root.canvas.dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        bubbles: true,
      }),
    );
  }

  it('go to the last trace first, then down the list until one takes the event', async () => {
    const seen: string[] = [];
    let taker = -1;
    t.registry.register(
      probe('p', [], {
        pointer: (index, e) => {
          seen.push(`${index}:${e.type}@${e.x},${e.y}`);
          return index === taker;
        },
      }),
    );
    const c = await chart([{ type: 'p' }, { type: 'p' }, { type: 'p' }]);
    fire(c, 'pointerdown', 300, 200);
    expect(seen).toEqual(['2:down@300,200', '1:down@300,200', '0:down@300,200']);
    fire(c, 'pointerup', 300, 200);

    seen.length = 0;
    taker = 1;
    fire(c, 'pointerdown', 310, 210);
    // Trace 0 lies under trace 1, which took the event.
    expect(seen).toEqual(['2:down@310,210', '1:down@310,210']);
  });

  it('a view that takes `down` gets the rest of the drag alone, and the chart does not zoom', async () => {
    const seen: string[] = [];
    t.registry.register(
      probe('p', [], {
        pointer: (index, e) => {
          seen.push(`${index}:${e.type}`);
          return index === 0 && e.type === 'down';
        },
      }),
    );
    const c = await chart([{ type: 'p' }, { type: 'p' }], {
      xaxis: { range: [0, 10] },
      yaxis: { range: [0, 100] },
    });
    const relayouts: unknown[] = [];
    c.on('relayout', (e) => void relayouts.push(e));
    fire(c, 'pointerdown', 100, 100);
    expect(seen).toEqual(['1:down', '0:down']);
    seen.length = 0;
    fire(c, 'pointermove', 250, 220);
    t.scheduler.step();
    fire(c, 'pointermove', 400, 300);
    t.scheduler.step();
    fire(c, 'pointerup', 400, 300);
    await c.relayout({});
    // Every event of the gesture went to trace 0's view only.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((k) => k.startsWith('0:'))).toBe(true);
    expect(seen).toContain('0:move');
    expect(seen.at(-1)).toBe('0:up');
    // A drag across the plot area would have been a zoom box.
    expect(relayouts).toEqual([]);
    expect(c.axes.get('x')?.scale.range).toEqual([0, 10]);
  });
});
