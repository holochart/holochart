import { describe, expect, it } from 'vitest';
import { arcLayout } from '../layout/arc.ts';
import { bundleLinks } from '../layout/bundle/index.ts';
import { circularLayout } from '../layout/circular.ts';
import { forceLayout } from '../layout/force/index.ts';
import { warmForceLayout } from '../layout/force/warm.ts';
import { gridLayout } from '../layout/grid.ts';
import { hiveLayout } from '../layout/hive.ts';
import { layeredLayout } from '../layout/layered/index.ts';
import { presetLayout } from '../layout/preset.ts';
import { dendrogramLayout, radialTreeLayout, tidyTreeLayout } from '../layout/tree/index.ts';
import type { LayoutGraph, LayoutResult } from '../layout/types.ts';
import { randomGraph, sameBytes, treeGraph, withGroups } from './__testing__/graphs.ts';
import { createLayoutHandler, createPause, type LayoutHandlerEnvironment } from './handler.ts';
import {
  decodeResult,
  type LayoutDone,
  type LayoutProgressMessage,
  type LayoutRequest,
  type LayoutResponse,
  type WorkerArrangement,
} from './protocol.ts';

/** A handler whose responses are kept, with the buffers each one said it transfers. */
function recording(environment?: LayoutHandlerEnvironment) {
  const responses: LayoutResponse[] = [];
  const transfers: ArrayBuffer[][] = [];
  const handler = createLayoutHandler((response, transfer) => {
    responses.push(response);
    transfers.push(transfer);
  }, environment);
  const of = <Type extends LayoutResponse['type']>(type: Type) =>
    responses.filter((r): r is Extract<LayoutResponse, { type: Type }> => r.type === type);
  return { handler, responses, transfers, of };
}

const request = (
  id: number,
  arrangement: WorkerArrangement,
  graph: LayoutGraph,
  rest: Partial<LayoutRequest> = {},
): LayoutRequest => ({ type: 'layout', id, arrangement, graph, ...rest });

/** A clock that moves by `step` ms every time it is read: a tick "takes" one step. */
const stepping = (step: number) => {
  let time = 0;
  return () => (time += step);
};

const done = (responses: readonly LayoutResponse[]): LayoutResult => {
  const last = responses.at(-1);
  if (last?.type !== 'done') throw new Error(`ended with ${last?.type ?? 'nothing'}`);
  return decodeResult(last.result);
};

describe('a force layout through the handler', () => {
  const graph = randomGraph(300, 900);
  const options = { ticks: 60 };
  const expected = forceLayout(graph, options);

  it('is the main-thread layout bit for bit, whatever the slices', async () => {
    for (const slice of [0.001, 3, 1e9]) {
      const { handler, responses } = recording({ now: stepping(1) });
      await handler.handle(request(1, 'force', graph, { options, slice }));
      const result = done(responses);
      expect(sameBytes(result.x, expected.x)).toBe(true);
      expect(sameBytes(result.y, expected.y)).toBe(true);
      expect(result.z).toBeUndefined();
    }
  });

  it('goes on from given positions, as the warm layout on the main thread does', async () => {
    const start = {
      x: Float64Array.from({ length: 300 }, (_, i) => Math.cos(i) * 200),
      y: Float64Array.from({ length: 300 }, (_, i) => Math.sin(i * 1.3) * 200),
      alpha: 0.3,
    };
    const warm = warmForceLayout(graph, options, start);
    const { handler, responses, of } = recording({ now: stepping(1) });
    await handler.handle(request(1, 'force', graph, { options, start, slice: 3 }));
    const result = done(responses);
    expect(sameBytes(result.x, warm.x)).toBe(true);
    expect(sameBytes(result.y, warm.y)).toBe(true);
    // Not the cold layout, and the first positions reported are near the start, not the spiral.
    expect(sameBytes(result.x, expected.x)).toBe(false);
    const first = of('progress')[0] as LayoutProgressMessage;
    let moved = 0;
    for (let i = 0; i < 300; i++) moved = Math.max(moved, Math.abs(first.x[i]! - start.x[i]!));
    expect(moved).toBeLessThan(150);
    // A third of a run: it starts cooler.
    expect((responses.at(-1) as LayoutDone).ticks).toBeLessThan(options.ticks);
  });

  it('reports positions before the result, then ends with one done', async () => {
    const { handler, responses, of } = recording({ now: stepping(1) });
    await handler.handle(request(7, 'force', graph, { options, progress: { interval: 0 } }));
    const progress = of('progress');
    expect(progress.length).toBeGreaterThan(5);
    expect(responses.findIndex((r) => r.type === 'progress')).toBe(0);
    expect(of('done')).toHaveLength(1);
    expect(responses.at(-1)!.type).toBe('done');
    expect(responses.every((r) => r.type === 'ready' || r.id === 7)).toBe(true);
    const ticks = progress.map((p) => p.ticks);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    expect(new Set(ticks).size).toBe(ticks.length);
    const alphas = progress.map((p) => p.alpha);
    expect(alphas[0]!).toBeGreaterThan(alphas.at(-1)!);
    expect(progress.every((p) => p.totalTicks === 60 && !p.settled)).toBe(true);
    expect(progress.every((p) => p.x.length === 300 && p.x.every(Number.isFinite))).toBe(true);
    expect((responses.at(-1) as LayoutDone).ticks).toBe(60);
  });

  it('hands every progress its own arrays and lists them for transfer', async () => {
    const { handler, responses, transfers } = recording({ now: stepping(1) });
    await handler.handle(request(1, 'force', graph, { options, progress: { interval: 0 } }));
    const buffers = new Set<ArrayBufferLike>();
    responses.forEach((response, k) => {
      if (response.type !== 'progress') return;
      expect(transfers[k]).toEqual([response.x.buffer, response.y.buffer]);
      buffers.add(response.x.buffer).add(response.y.buffer);
    });
    expect(buffers.size).toBe(2 * responses.filter((r) => r.type === 'progress').length);
  });

  it('spaces reports by ticks and by time', async () => {
    const everyTen = recording({ now: stepping(1) });
    await everyTen.handler.handle(
      request(1, 'force', graph, {
        options,
        slice: 0.001,
        progress: { everyTicks: 10, interval: 0 },
      }),
    );
    expect(everyTen.of('progress').map((p) => p.ticks)).toEqual([10, 20, 30, 40, 50, 60]);

    // Three clock readings per one-tick slice, 1 ms each: a report every 30 ms is every 10 ticks.
    const timed = recording({ now: stepping(1) });
    await timed.handler.handle(
      request(1, 'force', graph, { options, slice: 0.001, progress: { interval: 30 } }),
    );
    const ticks = timed.of('progress').map((p) => p.ticks);
    expect(ticks[0]).toBe(1);
    expect(ticks.length).toBeGreaterThan(3);
    expect(ticks.length).toBeLessThan(10);
  });

  it('sends no progress when told not to', async () => {
    const { handler, responses } = recording();
    await handler.handle(request(1, 'force', graph, { options, progress: false }));
    expect(responses.map((r) => r.type)).toEqual(['done']);
  });

  it('lays out in three dimensions, z in progress and result', async () => {
    const three = { ...options, dimensions: 3 as const };
    const { handler, responses, of } = recording({ now: stepping(1) });
    await handler.handle(request(1, 'force', graph, { options: three, progress: { interval: 0 } }));
    const result = done(responses);
    expect(result.z).toEqual(forceLayout(graph, three).z);
    expect(of('progress')[0]!.z).toHaveLength(300);
  });

  it('measures the time it computed', async () => {
    const { handler, responses } = recording({ now: stepping(1) });
    await handler.handle(request(1, 'force', graph, { options }));
    expect((responses.at(-1) as LayoutDone).elapsed).toBeGreaterThan(60);
  });
});

describe('every built-in arrangement through the handler', () => {
  const tree = treeGraph(40);
  const grouped = withGroups(randomGraph(60, 150), 4);
  const placed: LayoutGraph = {
    ...randomGraph(20, 30),
    x: Float64Array.from({ length: 20 }, (_, i) => (i === 3 ? NaN : i * 7)),
    y: Float64Array.from({ length: 20 }, (_, i) => i * i),
  };
  const cases: readonly [WorkerArrangement, LayoutGraph, unknown, () => LayoutResult][] = [
    ['preset', placed, undefined, () => presetLayout(placed, undefined)],
    ['circular', grouped, { sort: 'group' }, () => circularLayout(grouped, { sort: 'group' })],
    ['grid', grouped, undefined, () => gridLayout(grouped, undefined)],
    ['force', grouped, { ticks: 20 }, () => forceLayout(grouped, { ticks: 20 })],
    [
      'layered',
      grouped,
      { rankdir: 'LR', clusters: true },
      () => layeredLayout(grouped, { rankdir: 'LR', clusters: true }),
    ],
    ['tree', tree, { links: 'curved' }, () => tidyTreeLayout(tree, { links: 'curved' })],
    ['radial', tree, { collapsed: [1] }, () => radialTreeLayout(tree, { collapsed: [1] })],
    ['dendrogram', tree, undefined, () => dendrogramLayout(tree)],
    ['arc', grouped, { order: 'group' }, () => arcLayout(grouped, { order: 'group' })],
    ['hive', grouped, undefined, () => hiveLayout(grouped)],
  ];

  it.each(cases)('%s gives what the layout gives', async (arrangement, graph, options, direct) => {
    const { handler, responses } = recording();
    await handler.handle(request(1, arrangement, graph, { options, progress: false }));
    expect(responses.map((r) => r.type)).toEqual(['done']);
    // Through the structured clone a worker's answer takes, to be sure nothing is lost on the way.
    const last = responses[0] as LayoutDone;
    expect(decodeResult(structuredClone(last.result))).toEqual(direct());
  });
});

describe('cancelling', () => {
  const graph = randomGraph(200, 500);

  it('stops a layout between two slices', async () => {
    const { handler, responses, of } = recording({ now: stepping(1) });
    const running = handler.handle(
      request(3, 'force', graph, {
        options: { ticks: 500 },
        slice: 0.001,
        progress: { interval: 0 },
      }),
    );
    expect(handler.active).toBe(1);
    const pause = createPause();
    while (of('progress').length < 3) await pause();
    await handler.handle({ type: 'cancel', id: 3 });
    await running;
    expect(responses.at(-1)).toEqual({ type: 'cancelled', id: 3 });
    expect(of('done')).toHaveLength(0);
    expect(of('progress').at(-1)!.ticks).toBeLessThan(50);
    expect(handler.active).toBe(0);
  });

  it('stops a layout before it starts when the cancel is right behind the request', async () => {
    const { handler, responses } = recording();
    const running = handler.handle(request(4, 'layered', graph));
    void handler.handle({ type: 'cancel', id: 4 });
    await running;
    expect(responses).toEqual([{ type: 'cancelled', id: 4 }]);
  });

  it('leaves other requests running', async () => {
    const { handler, of } = recording({ now: stepping(1) });
    const first = handler.handle(
      request(1, 'force', graph, { options: { ticks: 40 }, slice: 0.001 }),
    );
    const second = handler.handle(
      request(2, 'force', graph, { options: { ticks: 40 }, slice: 0.001 }),
    );
    expect(handler.active).toBe(2);
    void handler.handle({ type: 'cancel', id: 1 });
    await Promise.all([first, second]);
    expect(of('cancelled').map((r) => r.id)).toEqual([1]);
    expect(of('done').map((r) => r.id)).toEqual([2]);
  });

  it('does nothing for a request that has ended or never was', async () => {
    const { handler, responses } = recording();
    await handler.handle(request(1, 'grid', graph));
    await handler.handle({ type: 'cancel', id: 1 });
    await handler.handle({ type: 'cancel', id: 99 });
    expect(responses.map((r) => r.type)).toEqual(['done']);
  });
});

describe('requests side by side', () => {
  it('each get their own answer', async () => {
    const a = randomGraph(120, 300, 1);
    const b = randomGraph(80, 200, 2);
    const { handler, responses, of } = recording({ now: stepping(1) });
    await Promise.all([
      handler.handle(request(1, 'force', a, { options: { ticks: 30 }, slice: 0.001 })),
      handler.handle(request(2, 'force', b, { options: { ticks: 30 }, slice: 0.001 })),
    ]);
    // Interleaved: the second started before the first ended.
    const ids = responses.map((r) => (r.type === 'ready' ? 0 : r.id));
    expect(ids.indexOf(2)).toBeLessThan(ids.lastIndexOf(1));
    const results = new Map(of('done').map((r) => [r.id, decodeResult(r.result)]));
    expect(results.get(1)!.x).toEqual(forceLayout(a, { ticks: 30 }).x);
    expect(results.get(2)!.x).toEqual(forceLayout(b, { ticks: 30 }).x);
  });

  it('refuses a second request under an id that is running', async () => {
    const graph = randomGraph(50, 100);
    const { handler, of } = recording();
    await Promise.all([
      handler.handle(request(5, 'force', graph, { options: { ticks: 10 } })),
      handler.handle(request(5, 'grid', graph)),
    ]);
    expect(of('done')).toHaveLength(1);
  });
});

describe('what goes wrong', () => {
  const graph = randomGraph(10, 20);

  it('answers error for an arrangement the worker does not have', async () => {
    const { handler, responses } = recording();
    await handler.handle(request(1, 'custom' as WorkerArrangement, graph));
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ type: 'error', id: 1, name: 'Error' });
    expect((responses[0] as { message: string }).message).toContain("'custom'");
  });

  it('does not take a property of every object for an arrangement', async () => {
    const { handler, responses } = recording();
    await handler.handle(request(1, 'toString' as WorkerArrangement, graph));
    expect(responses[0]).toMatchObject({ type: 'error', id: 1 });
  });

  it('answers error when the layout throws, with its name and message', async () => {
    const broken = { ...graph, halfWidth: null } as unknown as LayoutGraph;
    const { handler, responses } = recording();
    await handler.handle(request(2, 'force', broken));
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ type: 'error', id: 2, name: 'TypeError' });
    expect(handler.active).toBe(0);
  });

  it('ignores what is not a message of the protocol', async () => {
    const { handler, responses } = recording();
    for (const junk of [
      null,
      undefined,
      3,
      'layout',
      {},
      { type: 'layout' },
      { type: 'nope', id: 1 },
    ]) {
      await handler.handle(junk);
    }
    await handler.handle({ type: 'layout', id: 'one', graph });
    await handler.handle({ type: 'layout', id: 1 });
    expect(responses).toEqual([]);
  });
});

describe('bundling after the layout', () => {
  const graph = withGroups(randomGraph(60, 200), 5);

  it('reports the settled positions, then the result with bundled routes', async () => {
    const bundle = { method: 'hierarchical', strength: 0.8 } as const;
    const { handler, responses, of } = recording();
    await handler.handle(request(1, 'circular', graph, { bundle }));
    expect(responses.map((r) => r.type)).toEqual(['progress', 'done']);
    const settled = of('progress')[0] as LayoutProgressMessage;
    expect(settled.settled).toBe(true);
    const positions = circularLayout(graph, undefined);
    expect(settled.x).toEqual(positions.x);
    const result = done(responses);
    expect(result.x).toEqual(positions.x);
    const expected = bundleLinks(positions, graph, bundle).routes;
    expect(result.routes).toEqual(expected);
    expect(result.routes!.some((route) => route?.kind === 'spline')).toBe(true);
    // How the bundling went travels with the result.
    expect((responses.at(-1) as LayoutDone).bundle).toEqual({
      method: 'hierarchical',
      refused: false,
    });
  });

  it('leaves the nodes the layout left out out of the bundling', async () => {
    // Under `preset` a node without a position is parked at 0, 0: not a place to bundle through.
    const placed = circularLayout(graph, undefined);
    const x = Float64Array.from(placed.x);
    const y = Float64Array.from(placed.y);
    x[0] = y[0] = NaN;
    x[7] = NaN;
    const bundle = { method: 'hierarchical', strength: 0.8 } as const;
    const { handler, responses } = recording();
    await handler.handle(request(1, 'preset', { ...graph, x, y }, { bundle, progress: false }));
    const result = done(responses);
    expect(Array.from(result.hidden!.subarray(0, 8))).toEqual([1, 0, 0, 0, 0, 0, 0, 1]);
    const at = { x: Float64Array.from(x), y: Float64Array.from(y) };
    at.x[7] = at.y[7] = NaN;
    expect(result.routes).toEqual(bundleLinks(at, graph, bundle).routes);
    // Not what the parked positions would give.
    const parked = { x: x.map((v) => (v === v ? v : 0)), y: y.map((v) => (v === v ? v : 0)) };
    parked.x[7] = parked.y[7] = 0;
    expect(result.routes).not.toEqual(bundleLinks(parked, graph, bundle).routes);
  });

  it('says when force-directed bundling was refused, and without bundling says nothing', async () => {
    const { handler, responses } = recording();
    const bundle = { method: 'force', maxLinks: 10 } as const;
    await handler.handle(request(1, 'circular', graph, { bundle, progress: false }));
    expect((responses.at(-1) as LayoutDone).bundle).toEqual({ method: 'none', refused: true });
    expect(done(responses).routes!.every((route) => route === undefined)).toBe(true);
    await handler.handle(request(2, 'circular', graph, { progress: false }));
    expect((responses.at(-1) as LayoutDone).bundle).toBeUndefined();
  });

  it('can be cancelled between the layout and the bundling', async () => {
    const { handler, responses } = recording();
    const running = handler.handle(request(1, 'circular', graph, { bundle: {}, progress: false }));
    const pause = createPause();
    await pause();
    void handler.handle({ type: 'cancel', id: 1 });
    await running;
    expect(responses).toEqual([{ type: 'cancelled', id: 1 }]);
  });
});

describe('the default pause', () => {
  it('lets waiting tasks in', async () => {
    const pause = createPause();
    let ran = false;
    // Node's default pause uses setImmediate. A zero-delay timer has a minimum
    // delay and need not be due even after many fast check-phase turns.
    const node = globalThis as typeof globalThis & { setImmediate: (callback: () => void) => void };
    node.setImmediate(() => (ran = true));
    expect(ran).toBe(false);
    await pause();
    expect(ran).toBe(true);
  });
});
