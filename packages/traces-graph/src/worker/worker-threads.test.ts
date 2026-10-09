import { describe, expect, it } from 'vitest';
import { forceLayout } from '../layout/force/index.ts';
import { tidyTreeLayout } from '../layout/tree/index.ts';
import { randomGraph, sameBytes, treeGraph } from './__testing__/graphs.ts';
import {
  GraphLayoutWorker,
  isLayoutAbort,
  type LayoutProgress,
  type LayoutRunInfo,
  type LayoutWorkerLike,
} from './client.ts';

/** What the test uses of `node:worker_threads` (the package is type-checked without Node's types). */
interface NodeWorker {
  on(event: 'message' | 'error', listener: (value: unknown) => void): void;
  postMessage(message: unknown, transfer: ArrayBuffer[]): void;
  terminate(): Promise<number>;
}
interface WorkerThreads {
  Worker: new (file: URL) => NodeWorker;
}

/**
 * The client on a worker thread of Node: the handler runs from source on another thread
 * (`__testing__/node-worker.mjs`), and messages cross a real boundary, with real transfers.
 */
async function threaded(): Promise<{
  layouts: GraphLayoutWorker;
  /** The type of every message the thread sent, in order. */
  seen: string[];
  end: () => Promise<number>;
}> {
  const name = 'node:worker_threads';
  const { Worker } = (await import(/* @vite-ignore */ name)) as WorkerThreads;
  let thread: NodeWorker | undefined;
  const seen: string[] = [];
  const layouts = new GraphLayoutWorker({
    createWorker: () => {
      const node = new Worker(new URL('./__testing__/node-worker.mjs', import.meta.url));
      thread = node;
      const like: LayoutWorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage: (message, transfer) => node.postMessage(message, transfer),
        terminate: () => void node.terminate(),
      };
      node.on('message', (data) => {
        seen.push((data as { type: string }).type);
        like.onmessage?.({ data });
      });
      node.on('error', (error) => like.onerror?.(error));
      return like;
    },
  });
  return { layouts, seen, end: async () => (await thread?.terminate()) ?? 0 };
}

describe('the layout handler on another thread (node:worker_threads)', () => {
  it('lays out off the thread, reports progress, and matches the main thread bit for bit', async () => {
    const { layouts, end } = await threaded();
    try {
      const graph = randomGraph(1500, 4000);
      const options = { ticks: 120 };
      const progress: LayoutProgress[] = [];
      let info: LayoutRunInfo | undefined;
      const result = await layouts.run(graph, 'force', options, {
        onProgress: (p) => progress.push(p),
        onDone: (i) => (info = i),
      });
      expect(layouts.thread).toBe('worker');
      expect(info).toMatchObject({ thread: 'worker', ticks: 120 });
      expect(progress.length).toBeGreaterThan(0);
      expect(progress.every((p) => p.thread === 'worker' && p.x.length === 1500)).toBe(true);
      const expected = forceLayout(graph, options);
      expect(sameBytes(result.x, expected.x)).toBe(true);
      expect(sameBytes(result.y, expected.y)).toBe(true);
      // The caller's arrays were copied, not moved.
      expect(graph.source).toHaveLength(4000);

      // Routes and the extras of a tree layout come back whole.
      const tree = treeGraph(200);
      const tidy = await layouts.run(tree, 'tree', { links: 'curved' });
      expect(tidy).toEqual(tidyTreeLayout(tree, { links: 'curved' }));
    } finally {
      await end();
    }
  });

  it('cancels a running layout and takes the next one', async () => {
    const { layouts, seen, end } = await threaded();
    try {
      const graph = randomGraph(1500, 4000);
      const controller = new AbortController();
      let reports = 0;
      const running = layouts.run(
        graph,
        'force',
        { ticks: 100_000 },
        {
          signal: controller.signal,
          onProgress: () => {
            if (++reports === 2) controller.abort();
          },
        },
      );
      await expect(running).rejects.toSatisfy(isLayoutAbort);
      const next = await layouts.run(graph, 'grid');
      expect(next.x).toHaveLength(1500);
      // The thread heard the cancel and stopped its 100,000 ticks: it says so, and nothing of
      // the first request comes after.
      await expect.poll(() => seen.includes('cancelled'), { timeout: 20_000 }).toBe(true);
      expect(seen.filter((type) => type === 'done')).toHaveLength(1);
    } finally {
      await end();
    }
  });
});
