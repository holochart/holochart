// @vitest-environment jsdom
/**
 * The mirror handle components get from `mirrorSubplot` (E5.9, see `SubplotMirror`): its axes
 * (the main axes' linear space with the mirror's own range and length), `set`, what happens to
 * the mirror views when the subplot's axes, traces or the subplot itself change, and the
 * primitives mirror views add. Setup as in mirror.test.ts: a 640×400 chart with a fake renderer.
 */
import type { FigureInput } from '@mk7s/holochart-core';
import type { Primitive } from '@mk7s/holochart-render';
import { Object3D } from 'three';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import type {
  ComponentDrawContext,
  ComponentModule,
  SubplotMirror,
  SubplotMirrorOptions,
  TraceModule,
  TracePlotContext,
  TraceUpdatePlan,
} from './contracts.ts';
import { createDotsModule, createLog, setup, type TestSetup } from './__testing__/fakes.ts';

const XY = { type: 'dots', x: [0, 10], y: [0, 100] };
const RECT = { x: 40, y: 300, width: 200, height: 40 };
const OPTIONS: SubplotMirrorOptions = { rect: RECT, x: [0, 20], y: [0, 200] };

interface FakePrimitive extends Primitive<unknown> {
  dispose: Mock<() => void>;
}

function primitive(ready?: Promise<void>): FakePrimitive {
  return {
    object: new Object3D(),
    ...(ready ? { ready } : {}),
    update: () => undefined,
    setTransform: () => undefined,
    setViewport: () => undefined,
    dispose: vi.fn<() => void>(),
  } as unknown as FakePrimitive;
}

interface Hooks {
  create?(ctx: TracePlotContext): void;
  update?(ctx: TracePlotContext, plan: TraceUpdatePlan): void;
}

/** The dots module as `type`, logging `<what> <type><index>@<viewport>` for every view call. */
function recording(type: string, calls: string[], hooks: Hooks = {}): TraceModule {
  const base = createDotsModule(createLog()) as TraceModule;
  return {
    ...base,
    type,
    plot: {
      create(ctx) {
        const name = `${type}${ctx.index}@${ctx.viewport.name}`;
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
        };
      },
    },
  };
}

interface Mirrors {
  module: ComponentModule;
  /** The mirrors asked for at create, by subplot id (`undefined`: no such subplot). */
  made: Map<string, SubplotMirror | undefined>;
  ctx(): ComponentDrawContext | undefined;
}

/** A component that mirrors each of `subplots` with {@link OPTIONS} when it is created. */
function mirrors(...subplots: string[]): Mirrors {
  const made = new Map<string, SubplotMirror | undefined>();
  let ctx: ComponentDrawContext | undefined;
  const module: ComponentModule = {
    name: 'test-mirror',
    draw: {
      create(c) {
        ctx = c;
        for (const id of subplots) made.set(id, c.mirrorSubplot?.(id, OPTIONS));
        return { update: () => undefined };
      },
    },
  };
  return { module, made, ctx: () => ctx };
}

let charts: Chart[] = [];
let setups: TestSetup[] = [];

afterEach(() => {
  for (const c of charts) c.destroy();
  for (const s of setups) s.container.remove();
  charts = [];
  setups = [];
  vi.restoreAllMocks();
});

function start(
  m: Mirrors,
  modules: TraceModule[],
  data: unknown[],
  layout: Record<string, unknown> = {},
): { c: Chart; s: TestSetup } {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const s = setup({ width: 640, height: 400, components: [m.module] });
  s.registry.register(...modules);
  setups.push(s);
  const c = createChart(s.container, { data, layout } as FigureInput, s.options);
  charts.push(c);
  return { c, s };
}

const mirrorCalls = (calls: readonly string[]): string[] =>
  calls.filter((k) => k.includes('@mirror-'));

describe('the mirror handle', () => {
  it('is undefined for a subplot that does not exist', async () => {
    const m = mirrors('xy', 'x9y9');
    const { c } = start(m, [], [XY]);
    await c.ready;
    expect(m.made.get('xy')).toBeDefined();
    expect(m.made.has('x9y9')).toBe(true);
    expect(m.made.get('x9y9')).toBeUndefined();
    expect(c.three.viewports.map((v) => v.name)).toEqual(['subplot-xy', 'mirror-xy', 'overlay']);
  });

  it('has axes on the mirror rect and ranges, backed by the main axes', async () => {
    const m = mirrors('xy');
    const { c } = start(m, [], [XY], { xaxis: { title: { text: 'Main x' } } });
    await c.ready;
    const mirror = m.made.get('xy');
    const xa = mirror?.xaxis;
    const ya = mirror?.yaxis;
    expect(mirror?.subplot).toBe('xy');
    expect(xa?.id).toBe('x');
    expect(xa?.type).toBe('linear');
    // Attributes are the main axis' (one defaulted axis object, not a copy).
    expect(xa?.full).toBe(c.axes.get('x')?.full);
    // Its own range and length: x 0..20 over 200 px, y 0..200 over 40 px.
    expect(xa?.scale.range).toEqual([0, 20]);
    expect(xa?.scale.length).toBe(200);
    expect(ya?.scale.range).toEqual([0, 200]);
    expect(ya?.scale.length).toBe(40);
    expect(c.axes.get('x')?.scale.range).not.toEqual([0, 20]);
    // Linear → container px: x from the rect's left edge, y from its bottom edge upward.
    expect(xa?.l2c(0)).toBe(40);
    expect(xa?.l2c(10)).toBe(140);
    expect(ya?.l2c(0)).toBe(340);
    expect(ya?.l2c(100)).toBe(320);
    expect(mirror?.transform?.scaleX).toBeCloseTo(10);
    expect(mirror?.transform?.scaleY).toBeCloseTo(0.2);
  });

  it('dispose() removes the viewport and the views, and reports it', async () => {
    const calls: string[] = [];
    const m = mirrors('xy');
    const { c } = start(m, [recording('dots', calls)], [XY]);
    await c.ready;
    const mirror = m.made.get('xy');
    expect(mirror?.disposed).toBe(false);
    calls.length = 0;
    mirror?.dispose();
    expect(mirror?.disposed).toBe(true);
    expect(calls).toEqual(['dispose dots0@mirror-xy']);
    expect(c.three.viewports.map((v) => v.name)).toEqual(['subplot-xy', 'overlay']);
    // The chart no longer updates it.
    calls.length = 0;
    await c.restyle({ color: 'red' });
    expect(mirrorCalls(calls)).toEqual([]);
  });
});

describe('set()', () => {
  it('with unchanged options does not touch the views', async () => {
    const calls: string[] = [];
    const m = mirrors('xy');
    const { c } = start(m, [recording('dots', calls)], [XY]);
    await c.ready;
    calls.length = 0;
    m.made.get('xy')?.set({ rect: { ...RECT }, x: [0, 20], y: [0, 200] });
    expect(calls).toEqual([]);
    m.made.get('xy')?.set({ rect: RECT, x: [0, 40], y: [0, 200] });
    expect(calls).toEqual(['update dots0@mirror-xy']);
  });

  it('changes the background and the draw order among mirrors', async () => {
    const m = mirrors('xy', 'x2y2');
    const { c } = start(m, [], [XY, { ...XY, xaxis: 'x2', yaxis: 'y2' }], {
      xaxis: { domain: [0, 0.45] },
      xaxis2: { domain: [0.55, 1], anchor: 'y2' },
      yaxis2: { anchor: 'x2' },
    });
    await c.ready;
    const names = (): string[] => c.three.viewports.map((v) => v.name);
    expect(names()).toEqual(['subplot-xy', 'subplot-x2y2', 'mirror-xy', 'mirror-x2y2', 'overlay']);
    const first = m.made.get('xy');
    expect(first?.viewport.background).toBeNull();
    first?.set({ ...OPTIONS, order: 5, background: [1, 0, 0, 1] });
    expect(names()).toEqual(['subplot-xy', 'subplot-x2y2', 'mirror-x2y2', 'mirror-xy', 'overlay']);
    expect(first?.viewport.background).toEqual([1, 0, 0, 1]);
  });
});

describe('a mirror axis has the linear space of the main axis', () => {
  it('categories, and follows when the main axis gets new ones', async () => {
    const calls: string[] = [];
    const m = mirrors('xy');
    const { c } = start(
      m,
      [recording('dots', calls)],
      [{ type: 'dots', x: ['a', 'b', 'c'], y: [1, 2, 3] }],
    );
    await c.ready;
    const mirror = m.made.get('xy');
    expect(mirror?.xaxis?.type).toBe('category');
    expect(mirror?.xaxis?.scale.categories).toEqual(['a', 'b', 'c']);
    // Category 'c' is linear 2: on the mirror's 0..20 range over 200 px, 20 px from the left.
    expect(mirror?.xaxis?.scale.d2p('c')).toBeCloseTo(20);

    calls.length = 0;
    await c.restyle({ x: [['c', 'd']], y: [[1, 2]] });
    expect(c.axes.get('x')?.scale.categories).toEqual(['c', 'd']);
    expect(mirror?.xaxis?.scale.categories).toEqual(['c', 'd']);
    // The mirror keeps its own range and length on the new scale ...
    expect(mirror?.xaxis?.scale.range).toEqual([0, 20]);
    expect(mirror?.xaxis?.scale.length).toBe(200);
    expect(mirror?.xaxis?.scale.d2p('d')).toBeCloseTo(10);
    // ... and its view is rebuilt: the calc is in a new linear space.
    expect(mirrorCalls(calls)).toEqual(['dispose dots0@mirror-xy', 'create dots0@mirror-xy']);
  });

  it('multicategories', async () => {
    const m = mirrors('xy');
    const { c } = start(
      m,
      [],
      [
        {
          type: 'dots',
          x: [
            ['g1', 'g1', 'g2'],
            ['a', 'b', 'a'],
          ],
          y: [1, 2, 3],
        },
      ],
    );
    await c.ready;
    const xa = m.made.get('xy')?.xaxis;
    expect(xa?.type).toBe('multicategory');
    expect(xa?.scale.multicategories).toEqual([
      ['g1', 'a'],
      ['g1', 'b'],
      ['g2', 'a'],
    ]);
  });

  it('range breaks: a skipped weekend takes no width in the mirror either', async () => {
    const m = mirrors('xy');
    const { c } = start(
      m,
      [],
      [{ type: 'dots', x: ['2024-01-05', '2024-01-08', '2024-01-09'], y: [1, 2, 3] }],
      { xaxis: { rangebreaks: [{ bounds: ['sat', 'mon'] }] } },
    );
    await c.ready;
    const scale = m.made.get('xy')?.xaxis?.scale;
    if (!scale) throw new Error('no mirror x axis');
    expect(scale.type).toBe('date');
    // As on the main axis: Friday → Monday is one day in linear space, and a Saturday has no place.
    expect(scale.d2l('2024-01-08') - scale.d2l('2024-01-05')).toBe(86_400_000);
    expect(scale.d2l('2024-01-06')).toBeNaN();
    // (Without the breaks Monday would be three days after Friday.) Same coordinates as the main
    // axis, so the calc both views share lands in the right place.
    expect(scale.d2l('2024-01-08')).toBe(c.axes.get('x')?.scale.d2l('2024-01-08'));
  });
});

describe('mirror views follow the subplot', () => {
  it('a trace that changes type gets a mirror view of the new type', async () => {
    const calls: string[] = [];
    const m = mirrors('xy');
    const { c } = start(m, [recording('dots', calls), recording('squares', calls)], [XY]);
    await c.ready;
    calls.length = 0;
    await c.restyle({ type: 'squares' });
    expect(mirrorCalls(calls)).toEqual(['dispose dots0@mirror-xy', 'create squares0@mirror-xy']);
  });

  it('the views go when the subplot does, and come back with it', async () => {
    const calls: string[] = [];
    const m = mirrors('xy');
    const { c } = start(m, [recording('dots', calls)], [XY], {
      xaxis2: { anchor: 'y2' },
      yaxis2: { anchor: 'x2' },
    });
    await c.ready;
    const mirror = m.made.get('xy');
    calls.length = 0;
    await c.restyle({ xaxis: 'x2', yaxis: 'y2' });
    expect([...c.subplots.keys()]).toEqual(['x2y2']);
    expect(mirrorCalls(calls)).toEqual(['dispose dots0@mirror-xy']);
    expect(mirror?.disposed).toBe(false);
    // Moving a mirror without a subplot draws nothing.
    calls.length = 0;
    mirror?.set({ rect: RECT, x: [0, 40], y: [0, 200] });
    expect(calls).toEqual([]);

    await c.restyle({ xaxis: 'x', yaxis: 'y' });
    expect(mirrorCalls(calls)).toEqual(['create dots0@mirror-xy']);
    // On the range last set.
    expect(mirror?.xaxis?.scale.range).toEqual([0, 40]);
  });
});

describe('primitives of mirror views', () => {
  it('live in the mirror viewport, can be removed, and are disposed with the mirror', async () => {
    const added = new Map<string, FakePrimitive[]>();
    const m = mirrors('xy');
    const module = recording('dots', [], {
      create: (ctx) => {
        const pair = [primitive(), primitive()];
        added.set(ctx.viewport.name, pair);
        for (const p of pair) ctx.add(p);
      },
      update: (ctx) => {
        const first = added.get(ctx.viewport.name)?.[0];
        if (first) ctx.remove(first);
      },
    });
    const { c } = start(m, [module], [XY]);
    await c.ready;
    const mirror = m.made.get('xy');
    const [first, second] = added.get('mirror-xy') ?? [];
    if (!mirror || !first || !second) throw new Error('no mirror view');
    expect(mirror.viewport.scene.children).toEqual([first.object, second.object]);
    // Mirror primitives are not the trace's own objects.
    expect(c.getTraceObjects(0)).toEqual(added.get('subplot-xy')?.map((p) => p.object));

    await c.restyle({ color: 'red' });
    expect(mirror.viewport.scene.children).toEqual([second.object]);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).not.toHaveBeenCalled();

    mirror.dispose();
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(first.dispose).toHaveBeenCalledTimes(1);
  });

  it('invalidate() from a mirror view draws one more frame', async () => {
    let mirrorCtx: TracePlotContext | undefined;
    const m = mirrors('xy');
    const module = recording('dots', [], {
      create: (ctx) => {
        if (ctx.viewport.name === 'mirror-xy') mirrorCtx = ctx;
      },
    });
    const { c, s } = start(m, [module], [XY]);
    await c.ready;
    const frames = s.frames();
    s.scheduler.step();
    expect(s.frames()).toBe(frames);
    mirrorCtx?.invalidate();
    s.scheduler.step();
    expect(s.frames()).toBe(frames + 1);
  });

  it('`ready` waits for text a mirror view is still typesetting', async () => {
    let finish!: () => void;
    const typeset = new Promise<void>((resolve) => (finish = resolve));
    const m = mirrors('xy');
    const module = recording('dots', [], {
      create: (ctx) => {
        if (ctx.viewport.name === 'mirror-xy') ctx.add(primitive(typeset));
      },
    });
    const { c } = start(m, [module], [XY]);
    let resolved = false;
    void c.ready.then(() => (resolved = true));
    await new Promise((r) => setTimeout(r, 0));
    expect(resolved).toBe(false);
    finish();
    await c.ready;
    expect(resolved).toBe(true);
  });
});
