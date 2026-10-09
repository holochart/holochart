/**
 * Benchmark of the layered layout (story G3): seeded random acyclic graphs of 1,000 nodes and
 * 2,000 links and of 5,000 and 10,000, in two shapes, laid out at the default options. Prints the
 * time of each step and what the run did.
 *
 *   node packages/traces-graph/bench/layered.bench.ts
 *   node packages/traces-graph/bench/layered.bench.ts 7      (runs per case)
 *
 * Plain Node (type stripping, Node ≥ 22.18), no build. Each line is the fastest of the runs
 * (default 5) after a warm-up, which is the one least disturbed by a busy machine; `cpu` is the
 * least processor time a run took, which a busy machine disturbs less still.
 *
 * The shapes: "local" links join a node to one of the next 40, as the stages of a pipeline or the
 * modules of a build do; "uniform" links join any earlier node to any later one, which makes few
 * ranks, long links and a great many crossings: the hard case for every step.
 */
import { emptyStats, runLayered, type LayeredStats } from '../src/layout/layered/layered.ts';
import type { LayeredOptions } from '../src/layout/layered/options.ts';
import { graphOf, randomDagLinks } from '../src/layout/layered/testing.ts';

declare const process: {
  readonly argv: readonly string[];
  cpuUsage(): { readonly user: number };
};

const RUNS = Math.max(1, Number(process.argv[2]) || 5);

function measure(nodes: number, links: number, window: number, options: LayeredOptions) {
  const graph = graphOf(nodes, randomDagLinks(nodes, links, 1, window), {
    halfWidth: 30,
    halfHeight: 12,
  });
  let best: LayeredStats | undefined;
  let cpu = Infinity;
  for (let run = 0; run < RUNS; run++) {
    const stats = emptyStats();
    const before = process.cpuUsage().user;
    runLayered(graph, options, stats);
    cpu = Math.min(cpu, (process.cpuUsage().user - before) / 1000);
    if (!best || stats.total < best.total) best = stats;
  }
  return { ...best!, cpu };
}

// Warm-up: every step has run before anything is timed.
measure(300, 600, 300, {});
measure(300, 600, 20, { routing: 'orthogonal', ranker: 'tight-tree' });

const ms = (value: number): string => value.toFixed(0).padStart(6);
console.log(
  'nodes links shape    ranker           total   rank  order  place  route    cpu | ranks dummies exchanges crossings',
);
for (const [nodes, links] of [
  [1000, 2000],
  [5000, 10000],
] as const) {
  for (const [shape, window] of [
    ['local', 40],
    ['uniform', nodes],
  ] as const) {
    for (const ranker of ['network-simplex', 'tight-tree'] as const) {
      const s = measure(nodes, links, window, { ranker });
      console.log(
        `${String(nodes).padStart(5)} ${String(links).padStart(5)} ${shape.padEnd(8)} ${ranker.padEnd(15)}` +
          `${ms(s.total)} ${ms(s.rank)} ${ms(s.order)} ${ms(s.position)} ${ms(s.route)} ${ms(s.cpu)} |` +
          ` ${String(s.ranks).padStart(5)} ${String(s.dummies).padStart(7)} ${String(s.exchanges).padStart(9)} ${String(s.crossings).padStart(9)}`,
      );
    }
  }
}
