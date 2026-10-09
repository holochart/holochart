import { afterEach, describe, expect, it, vi } from 'vitest';
import { forceLayout } from '../layout/force/index.ts';
import { warmForceLayout } from '../layout/force/warm.ts';
import { layeredLayout } from '../layout/layered/index.ts';
import type { LayoutGraph } from '../layout/types.ts';
import { randomGraph, sameBytes } from './__testing__/graphs.ts';
import {
  GraphLayoutWorker,
  graphLayoutWorker,
  isLayoutAbort,
  layoutInWorker,
  setGraphWorkerUrl,
  type LayoutProgress,
  type LayoutRunInfo,
  type LayoutWorkerLike,
} from './client.ts';
import { createLayoutHandler, createPause } from './handler.ts';
import {
  LAYOUT_PROTOCOL,
  type LayoutMessage,
  type LayoutRequest,
  type LayoutResponse,
} from './protocol.ts';

const pause = createPause();
const later = (run: () => void): void => void pause().then(run);

interface FakeWorkerOptions {
  /** `false`: never says ready. A number: says ready with that protocol version. */
  readonly ready?: boolean | number;
  /** Does not pass `cancel` on, as a worker deep in one long call would not see it. */
  readonly deaf?: boolean;
}

/**
 * A worker in this thread: the real handler behind the structured clone and the transfer of a
 * real `postMessage`, answering in later tasks.
 */
function fakeWorker(options: FakeWorkerOptions = {}) {
  const received: LayoutMessage[] = [];
  const sent: LayoutResponse[] = [];
  let terminated = false;
  const deliver = (response: LayoutResponse, transfer: ArrayBuffer[] = []): void => {
    const data = structuredClone(response, { transfer });
    later(() => {
      if (terminated) return;
      sent.push(data);
      worker.onmessage?.({ data });
    });
  };
  const handler = createLayoutHandler(deliver);
  const worker: LayoutWorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(message, transfer) {
      const data = structuredClone(message, { transfer });
      received.push(data);
      if (options.deaf && data.type === 'cancel') return;
      later(() => void handler.handle(data));
    },
    terminate() {
      terminated = true;
    },
  };
  if (options.ready !== false) {
    deliver({
      type: 'ready',
      protocol: typeof options.ready === 'number' ? options.ready : LAYOUT_PROTOCOL,
    });
  }
  return {
    worker,
    received,
    sent,
    get terminated() {
      return terminated;
    },
    /** What a failed load or a crash does. */
    fail: (message: string) => worker.onerror?.({ message }),
  };
}

/** A client on a fake worker, with its warnings kept. */
function client(options: FakeWorkerOptions | (() => LayoutWorkerLike) = {}) {
  const warnings: string[] = [];
  const fakes: ReturnType<typeof fakeWorker>[] = [];
  const layouts = new GraphLayoutWorker({
    warn: (message) => warnings.push(message),
    createWorker:
      typeof options === 'function'
        ? options
        : () => {
            const fake = fakeWorker(options);
            fakes.push(fake);
            return fake.worker;
          },
  });
  return { layouts, warnings, fakes };
}

const same = sameBytes;

const graph = randomGraph(200, 600);
const options = { ticks: 40 };
const expected = forceLayout(graph, options);
const every = { progress: { interval: 0 } };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a layout in the worker', () => {
  it('gives the main-thread result bit for bit and leaves the caller its arrays', async () => {
    const { layouts, warnings, fakes } = client();
    expect(layouts.thread).toBeUndefined();
    const result = await layouts.run(graph, 'force', options);
    expect(layouts.thread).toBe('worker');
    expect(same(result.x, expected.x) && same(result.y, expected.y)).toBe(true);
    expect(graph.source).toHaveLength(600);
    expect(warnings).toEqual([]);
    expect(fakes).toHaveLength(1);
    expect(fakes[0]!.received.map((m) => m.type)).toEqual(['layout']);
  });

  it('reports progress from the worker before the result, and how the run went', async () => {
    const { layouts } = client();
    const progress: LayoutProgress[] = [];
    let info: LayoutRunInfo | undefined;
    const result = await layouts.run(graph, 'force', options, {
      ...every,
      slice: 0.001,
      onProgress: (p) => progress.push(p),
      onDone: (i) => (info = i),
    });
    expect(progress.length).toBeGreaterThan(3);
    expect(progress.every((p) => p.thread === 'worker' && p.x.length === 200)).toBe(true);
    expect(progress.at(-1)!.ticks).toBeLessThanOrEqual(40);
    expect(info).toMatchObject({ thread: 'worker', ticks: 40 });
    expect(info!.total).toBeGreaterThanOrEqual(info!.elapsed);
    expect(same(result.x, expected.x)).toBe(true);
  });

  it('sends the start of a warm layout and the bundling, and says how the bundling went', async () => {
    const { layouts, fakes } = client();
    const start = {
      x: Float64Array.from({ length: 200 }, (_, i) => Math.cos(i) * 150),
      y: Float64Array.from({ length: 200 }, (_, i) => Math.sin(i) * 150),
      alpha: 0.3,
    };
    let info: LayoutRunInfo | undefined;
    const bundle = { method: 'force', maxLinks: 10 } as const;
    const result = await layouts.run(graph, 'force', options, {
      start,
      bundle,
      onDone: (i) => (info = i),
    });
    const sent = fakes[0]!.received[0] as LayoutRequest;
    expect(sent.start?.alpha).toBe(0.3);
    expect(sent.bundle).toEqual(bundle);
    // The caller keeps its start.
    expect(start.x).toHaveLength(200);
    const warm = warmForceLayout(graph, options, start);
    expect(same(result.x, warm.x)).toBe(true);
    // More links than the cap: refused, and said so.
    expect(info?.bundle).toEqual({ method: 'none', refused: true });
  });

  it('counts the requests that have not ended', async () => {
    const { layouts } = client();
    expect(layouts.pending).toBe(0);
    const first = layouts.run(graph, 'force', options, { owner: 'a' });
    const second = layouts.run(graph, 'force', options, { owner: 'b' });
    expect(layouts.pending).toBe(2);
    layouts.cancel('a');
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(layouts.pending).toBe(1);
    await second;
    expect(layouts.pending).toBe(0);
  });

  it('asks for no progress when nobody listens', async () => {
    const { layouts, fakes } = client();
    await layouts.run(graph, 'force', options);
    expect(fakes[0]!.received[0]).toMatchObject({ type: 'layout', progress: false });
    expect(fakes[0]!.sent.map((r) => r.type)).toEqual(['ready', 'done']);
  });

  it('moves the arrays instead of copying them when told to', async () => {
    const { layouts } = client();
    const mine = randomGraph(200, 600);
    const result = await layouts.run(mine, 'force', options, { move: true });
    expect(mine.source).toHaveLength(0);
    expect(mine.x).toHaveLength(0);
    expect(same(result.x, expected.x)).toBe(true);
  });

  it('serves several requests with one worker', async () => {
    const { layouts, fakes } = client();
    const [a, b, c] = await Promise.all([
      layouts.run(graph, 'force', options),
      layouts.run(graph, 'layered'),
      layouts.run(graph, 'force', options),
    ]);
    expect(fakes).toHaveLength(1);
    expect(same(a.x, expected.x) && same(c.x, expected.x)).toBe(true);
    expect(b).toEqual(layeredLayout(graph, undefined));
  });

  it('starts ahead of the first request when asked', async () => {
    const { layouts, fakes } = client();
    const [first, second] = await Promise.all([layouts.start(), layouts.start()]);
    expect([first, second]).toEqual(['worker', 'worker']);
    expect(fakes).toHaveLength(1);
    expect(await layouts.start()).toBe('worker');
  });

  it("rejects with the layout's error", async () => {
    const { layouts } = client();
    const broken = { ...graph, halfWidth: null } as unknown as LayoutGraph;
    await expect(layouts.run(broken, 'force')).rejects.toMatchObject({ name: 'TypeError' });
    // And goes on working.
    expect(same((await layouts.run(graph, 'force', options)).x, expected.x)).toBe(true);
  });
});

describe('cancelling', () => {
  it('a newer request of the same owner replaces the older one', async () => {
    const { layouts, fakes } = client();
    const owner = {};
    const first = layouts.run(graph, 'force', { ticks: 400 }, { owner });
    const outcome = first.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await layouts.start();
    const second = layouts.run(graph, 'force', options, { owner });
    const error = await outcome;
    expect(isLayoutAbort(error)).toBe(true);
    expect(same((await second).x, expected.x)).toBe(true);
    expect(fakes[0]!.received.map((m) => m.type)).toEqual(['layout', 'cancel', 'layout']);
    expect(fakes[0]!.sent.map((r) => r.type)).toContain('cancelled');
  });

  it('requests of different owners do not disturb each other', async () => {
    const { layouts } = client();
    const [a, b] = await Promise.all([
      layouts.run(graph, 'force', options, { owner: 'a' }),
      layouts.run(graph, 'force', options, { owner: 'b' }),
    ]);
    expect(same(a.x, b.x)).toBe(true);
  });

  it('an abort signal cancels, with its reason', async () => {
    const { layouts, fakes } = client();
    const controller = new AbortController();
    const progress: LayoutProgress[] = [];
    const running = layouts.run(
      graph,
      'force',
      { ticks: 400 },
      {
        ...every,
        slice: 0.001,
        signal: controller.signal,
        onProgress: (p) => {
          progress.push(p);
          if (progress.length === 2) controller.abort(new Error('enough'));
        },
      },
    );
    await expect(running).rejects.toThrow('enough');
    const seen = progress.length;
    for (let k = 0; k < 20; k++) await pause();
    // Progress that was on its way when the cancel left is dropped.
    expect(progress).toHaveLength(seen);
    expect(fakes[0]!.received.at(-1)).toMatchObject({ type: 'cancel' });
  });

  it('a signal that is already aborted never starts anything', async () => {
    const { layouts, fakes } = client();
    await expect(
      layouts.run(graph, 'force', options, { signal: AbortSignal.abort() }),
    ).rejects.toSatisfy(isLayoutAbort);
    expect(fakes).toHaveLength(0);
  });

  it('cancel(owner) and cancel() reject with an AbortError', async () => {
    const { layouts } = client();
    const a = layouts.run(graph, 'force', { ticks: 400 }, { owner: 'a' });
    const b = layouts.run(graph, 'force', { ticks: 400 }, { owner: 'b' });
    const c = layouts.run(graph, 'force', { ticks: 400 });
    layouts.cancel('a');
    await expect(a).rejects.toSatisfy(isLayoutAbort);
    layouts.cancel();
    await expect(b).rejects.toSatisfy(isLayoutAbort);
    await expect(c).rejects.toSatisfy(isLayoutAbort);
  });

  it('an answer that comes after the cancel is dropped', async () => {
    const { layouts, fakes } = client({ deaf: true });
    const owner = {};
    const onDone = vi.fn();
    const first = layouts.run(graph, 'force', options, { owner, onDone });
    first.catch(() => undefined);
    await layouts.start();
    const second = await layouts.run(graph, 'grid', undefined, { owner });
    await expect(first).rejects.toSatisfy(isLayoutAbort);
    for (let k = 0; k < 200 && fakes[0]!.sent.filter((r) => r.type === 'done').length < 2; k++) {
      await pause();
    }
    // The worker never heard the cancel and answered both; only the second answer counted.
    expect(fakes[0]!.sent.filter((r) => r.type === 'done')).toHaveLength(2);
    expect(onDone).not.toHaveBeenCalled();
    expect(second.x).toHaveLength(200);
  });

  it('an error thrown by onProgress rejects the request and stops it', async () => {
    const { layouts, fakes } = client();
    const running = layouts.run(
      graph,
      'force',
      { ticks: 400 },
      {
        ...every,
        onProgress: () => {
          throw new Error('view is gone');
        },
      },
    );
    await expect(running).rejects.toThrow('view is gone');
    expect(fakes[0]!.received.at(-1)).toMatchObject({ type: 'cancel' });
  });

  it('dispose ends the worker and rejects what was running; the next request starts another', async () => {
    const { layouts, fakes } = client();
    const running = layouts.run(graph, 'force', { ticks: 400 });
    await layouts.start();
    layouts.dispose();
    await expect(running).rejects.toSatisfy(isLayoutAbort);
    expect(fakes[0]!.terminated).toBe(true);
    expect(layouts.thread).toBeUndefined();
    expect(same((await layouts.run(graph, 'force', options)).x, expected.x)).toBe(true);
    expect(fakes).toHaveLength(2);
  });
});

describe('without a worker', () => {
  it('runs on the main thread in slices, with the same progress and result, and warns once', async () => {
    const { layouts, warnings } = client(() => {
      throw new Error('blocked by CSP');
    });
    const progress: LayoutProgress[] = [];
    let info: LayoutRunInfo | undefined;
    const result = await layouts.run(graph, 'force', options, {
      ...every,
      slice: 0.001,
      onProgress: (p) => progress.push(p),
      onDone: (i) => (info = i),
    });
    expect(layouts.thread).toBe('main');
    expect(same(result.x, expected.x) && same(result.y, expected.y)).toBe(true);
    expect(progress.length).toBeGreaterThan(3);
    expect(progress.every((p) => p.thread === 'main')).toBe(true);
    expect(info).toMatchObject({ thread: 'main', ticks: 40 });
    await layouts.run(graph, 'grid');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('blocked by CSP');
    expect(warnings[0]).toContain('setGraphWorkerUrl');
  });

  it('does not block: other tasks run between the slices', async () => {
    const { layouts } = client(() => {
      throw new Error('no');
    });
    let between = 0;
    const timer = setInterval(() => between++, 0);
    await layouts.run(graph, 'force', { ticks: 200 }, { slice: 0.001 });
    clearInterval(timer);
    expect(between).toBeGreaterThan(3);
  });

  it('can be cancelled there too', async () => {
    const { layouts } = client(() => {
      throw new Error('no');
    });
    const owner = {};
    const first = layouts.run(graph, 'force', { ticks: 400 }, { owner, slice: 0.001 });
    first.catch(() => undefined);
    await pause();
    await pause();
    const second = await layouts.run(graph, 'force', options, { owner });
    await expect(first).rejects.toSatisfy(isLayoutAbort);
    expect(same(second.x, expected.x)).toBe(true);
  });

  it('takes over when the file does not load', async () => {
    const { layouts, warnings, fakes } = client({ ready: false });
    const running = layouts.run(graph, 'force', options);
    const started = layouts.start();
    fakes[0]!.fail('');
    expect(await started).toBe('main');
    expect(same((await running).x, expected.x)).toBe(true);
    expect(fakes[0]!.terminated).toBe(true);
    expect(fakes[0]!.received).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('could not be loaded: the file did not load');
  });

  it('takes over when the worker does not answer in time', async () => {
    const warnings: string[] = [];
    const fake = fakeWorker({ ready: false });
    const layouts = new GraphLayoutWorker({
      createWorker: () => fake.worker,
      warn: (message) => warnings.push(message),
      startTimeout: 5,
    });
    const result = await layouts.run(graph, 'force', options);
    expect(layouts.thread).toBe('main');
    expect(same(result.x, expected.x)).toBe(true);
    expect(fake.terminated).toBe(true);
    expect(warnings[0]).toContain('did not load in time');
  });

  it('takes over when the file is of another version', async () => {
    const { layouts, warnings } = client({ ready: LAYOUT_PROTOCOL + 1 });
    const result = await layouts.run(graph, 'force', options);
    expect(layouts.thread).toBe('main');
    expect(same(result.x, expected.x)).toBe(true);
    expect(warnings[0]).toContain('another version');
  });

  it('takes over what a worker that fails later was doing, unless the arrays went with it', async () => {
    const { layouts, warnings, fakes } = client({ deaf: true });
    await layouts.start();
    const kept = layouts.run(graph, 'force', options);
    const moved = layouts.run(randomGraph(200, 600), 'force', options, { move: true });
    moved.catch(() => undefined);
    fakes[0]!.fail('out of memory');
    await expect(moved).rejects.toThrow('the layout worker failed: out of memory');
    expect(same((await kept).x, expected.x)).toBe(true);
    expect(layouts.thread).toBe('main');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('it failed: out of memory');
  });

  it('runs a request on the main thread when its options cannot be sent', async () => {
    const { layouts, warnings } = client();
    await layouts.start();
    const unsendable = { ...options, note: () => 'a function' };
    let info: LayoutRunInfo | undefined;
    const result = await layouts.run(graph, 'force', unsendable, { onDone: (i) => (info = i) });
    expect(info!.thread).toBe('main');
    expect(same(result.x, expected.x)).toBe(true);
    expect(graph.source).toHaveLength(600);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('plain data');
    // The worker is still the place for the next one.
    await layouts.run(graph, 'force', options, { onDone: (i) => (info = i) });
    expect(info!.thread).toBe('worker');
  });

  it('runs one request on the main thread when asked, without touching the worker', async () => {
    const { layouts, warnings, fakes } = client();
    let info: LayoutRunInfo | undefined;
    await layouts.run(graph, 'force', options, { thread: 'main', onDone: (i) => (info = i) });
    expect(info!.thread).toBe('main');
    expect(fakes).toHaveLength(0);
    expect(warnings).toEqual([]);
    expect(layouts.thread).toBeUndefined();
  });
});

describe('the shared worker of the page', () => {
  it('falls back where there is no Worker (Node), saying so once on the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setGraphWorkerUrl(null);
    const result = await layoutInWorker(graph, 'force', options);
    await layoutInWorker(graph, 'grid');
    expect(same(result.x, expected.x)).toBe(true);
    expect(graphLayoutWorker().thread).toBe('main');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('this environment has no Worker');
  });

  it("is replaced when the worker's address is set", () => {
    const before = graphLayoutWorker();
    expect(graphLayoutWorker()).toBe(before);
    setGraphWorkerUrl('/assets/layout-worker.js');
    expect(graphLayoutWorker()).not.toBe(before);
    expect(graphLayoutWorker().thread).toBeUndefined();
    setGraphWorkerUrl(null);
  });
});
