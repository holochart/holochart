/**
 * Benchmark of the layout worker (backlog G7: 10,000 nodes and 50,000 links laid out in under
 * 2 s without blocking). Lays out seeded random graphs with the force layout three ways and
 * prints, for each: the time to the first positions, the time to the result, the CPU time of the
 * process, and the longest stretch the main thread was held.
 *
 * - `blocking`: one `forceLayout` call on the main thread;
 * - `worker`: `GraphLayoutWorker` on a `node:worker_threads` thread (the handler of
 *   `src/worker/handler.ts`, as a browser's worker runs it);
 * - `sliced`: the same client without a worker, which is its fallback: the handler on the main
 *   thread, a few milliseconds at a time.
 *
 * Then what crossing the thread boundary costs on the main thread: copying the graph before it is
 * transferred, against the structured clone that sending it untransferred would be, and decoding
 * a result with routes.
 *
 *   node packages/traces-graph/bench/worker.bench.ts
 *   node packages/traces-graph/bench/worker.bench.ts --runs 5 --full
 *
 * `--full` adds the runs at 300 ticks, the tick count of small graphs (the default above 3,000
 * nodes is lower: 90 at 10,000). Plain Node (type stripping, Node ≥ 22.18), no build. Each figure
 * is the median of `--runs` runs (default 3). On a busy machine the wall-clock times are
 * inflated: the line at the top says how busy it was, and the CPU column is the one to read.
 */
import os from 'node:os';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { Worker } from 'node:worker_threads';
import { defaultTicks, forceLayout } from '../src/layout/force/index.ts';
import { tidyTreeLayout } from '../src/layout/tree/index.ts';
import type { LayoutGraph } from '../src/layout/types.ts';
import { randomGraph, sameBytes, treeGraph } from '../src/worker/__testing__/graphs.ts';
import { GraphLayoutWorker, type LayoutWorkerLike } from '../src/worker/client.ts';
import {
  copyGraph,
  decodeResult,
  encodeResult,
  graphTransferables,
} from '../src/worker/protocol.ts';

const { values: args } = parseArgs({
  options: {
    runs: { type: 'string', default: '3' },
    full: { type: 'boolean', default: false },
  },
});
const RUNS = Math.max(1, Number(args.runs) || 3);

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/** The longest time between two turns of this thread's event loop, until the returned call. */
function watchBlocking(): () => number {
  let longest = 0;
  let last = performance.now();
  let running = true;
  const beat = (): void => {
    const time = performance.now();
    longest = Math.max(longest, time - last);
    last = time;
    if (running) setTimeout(beat, 0);
  };
  setTimeout(beat, 0);
  return () => {
    running = false;
    return Math.max(longest, performance.now() - last);
  };
}

/** A client on a worker thread of Node, as the tests make it. */
function threaded(): { layouts: GraphLayoutWorker; end: () => Promise<unknown> } {
  let thread: Worker | undefined;
  const layouts = new GraphLayoutWorker({
    createWorker: () => {
      const node = new Worker(
        new URL('../src/worker/__testing__/node-worker.mjs', import.meta.url),
      );
      thread = node;
      const like: LayoutWorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage: (message, transfer) => node.postMessage(message, transfer),
        terminate: () => void node.terminate(),
      };
      node.on('message', (data) => like.onmessage?.({ data }));
      node.on('error', (error) => like.onerror?.(error));
      return like;
    },
  });
  return { layouts, end: async () => thread?.terminate() };
}

/** A client that never has a worker: every request runs on the main thread in slices. */
const sliced = new GraphLayoutWorker({
  createWorker: () => {
    throw new Error('the benchmark asked for the fallback');
  },
  warn: () => undefined,
});

interface Measured {
  first: number;
  total: number;
  cpu: number;
  blocked: number;
  progress: number;
  same: boolean;
}

type Mode = 'blocking' | 'worker' | 'sliced';

async function once(
  mode: Mode,
  graph: LayoutGraph,
  ticks: number,
  layouts: GraphLayoutWorker,
  expected: Float64Array,
): Promise<Measured> {
  // Let the heartbeat start before the clock does.
  const blocked = watchBlocking();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const usage = process.cpuUsage();
  const started = performance.now();
  let first = NaN;
  let progress = 0;
  const result =
    mode === 'blocking'
      ? forceLayout(graph, { ticks })
      : await layouts.run(
          graph,
          'force',
          { ticks },
          {
            onProgress: () => {
              if (progress++ === 0) first = performance.now() - started;
            },
          },
        );
  const total = performance.now() - started;
  const { user, system } = process.cpuUsage(usage);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {
    first,
    total,
    cpu: (user + system) / 1000,
    blocked: blocked(),
    progress,
    same: sameBytes(result.x, expected),
  };
}

const cpus = os.cpus();
const load = os.loadavg()[0]!;
console.log(
  `${cpus[0]?.model ?? 'unknown CPU'}, ${cpus.length} cores, ${os.platform()} ${os.arch()}, ` +
    `Node ${process.version}, load average ${load.toFixed(1)}`,
);
console.log(`median of ${RUNS} runs; force layout, 'spring', 2D, other options at their defaults`);
if (load > cpus.length) {
  console.log('the machine is busy: wall-clock times are inflated, read the CPU column');
}
console.log();

const SIZES: readonly (readonly [number, number])[] = [
  [10_000, 50_000],
  [50_000, 200_000],
];

const { layouts: inWorker, end } = threaded();
// Warm-up: the worker has loaded and both threads have compiled the layout.
{
  const small = randomGraph(1000, 5000, 1);
  const expected = forceLayout(small, { ticks: 50 }).x;
  await once('worker', small, 50, inWorker, expected);
  await once('sliced', small, 50, sliced, expected);
}

const table = (rows: string[][]): void => {
  const widths = rows[0]!.map((_, c) => Math.max(...rows.map((row) => row[c]!.length)));
  for (const row of rows) {
    console.log(
      row
        .map((cell, c) => (c <= 1 ? cell.padEnd(widths[c]!) : cell.padStart(widths[c]!)))
        .join('  '),
    );
  }
};

const rows: string[][] = [
  [
    'graph',
    'mode',
    'ticks',
    'first positions ms',
    'total ms',
    'cpu ms',
    'longest block ms',
    'reports',
    'same bytes',
  ],
];
for (const [nodes, links] of SIZES) {
  const graph = randomGraph(nodes, links, 42);
  const tickCounts = args.full ? [defaultTicks(nodes), 300] : [defaultTicks(nodes)];
  for (const ticks of tickCounts) {
    const expected = forceLayout(graph, { ticks }).x;
    for (const mode of ['blocking', 'worker', 'sliced'] as const) {
      const runs: Measured[] = [];
      for (let run = 0; run < RUNS; run++) {
        runs.push(await once(mode, graph, ticks, mode === 'worker' ? inWorker : sliced, expected));
      }
      const of = (pick: (m: Measured) => number): string => median(runs.map(pick)).toFixed(0);
      rows.push([
        `${nodes} / ${links}`,
        mode,
        String(ticks),
        mode === 'blocking' ? '-' : of((m) => m.first),
        of((m) => m.total),
        of((m) => m.cpu),
        of((m) => m.blocked),
        of((m) => m.progress),
        runs.every((m) => m.same) ? 'yes' : 'NO',
      ]);
    }
  }
}
table(rows);
await end();
console.log();

// What the boundary costs on the main thread.
const timed = (run: () => unknown): number => {
  const times: number[] = [];
  for (let k = 0; k < Math.max(5, RUNS); k++) {
    const started = performance.now();
    run();
    times.push(performance.now() - started);
  }
  return median(times);
};
const costs: string[][] = [
  ['graph', 'bytes', 'copy ms', 'copy + transfer ms', 'structured clone ms'],
];
for (const [nodes, links] of SIZES) {
  const graph = randomGraph(nodes, links, 42);
  const bytes = graphTransferables(graph).reduce((sum, buffer) => sum + buffer.byteLength, 0);
  costs.push([
    `${nodes} / ${links}`,
    `${(bytes / 1e6).toFixed(1)} MB`,
    timed(() => copyGraph(graph)).toFixed(2),
    timed(() => {
      const copy = copyGraph(graph);
      structuredClone(copy, { transfer: graphTransferables(copy) });
    }).toFixed(2),
    timed(() => structuredClone(graph)).toFixed(2),
  ]);
}
table(costs);
console.log(
  '(the client copies and transfers; a structured clone copies once more on the receiving side)',
);
console.log();

// A result with routes: a tree with curved links, encoded, sent and decoded.
{
  const tree = treeGraph(50_000);
  const result = tidyTreeLayout(tree, { links: 'curved' });
  const encodeMs = timed(() => encodeResult(result));
  const encoded = encodeResult(result);
  const decodeMs = timed(() => decodeResult(encoded));
  const cloneMs = timed(() => structuredClone(result));
  console.log(
    `a result with ${result.routes?.length ?? 0} routes (tree of 50,000 nodes, curved links): ` +
      `encode ${encodeMs.toFixed(2)} ms (in the worker), decode ${decodeMs.toFixed(2)} ms (on the page); ` +
      `a structured clone of the same result, one object per route, takes ${cloneMs.toFixed(2)} ms on each side`,
  );
}
