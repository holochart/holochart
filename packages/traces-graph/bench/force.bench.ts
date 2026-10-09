/**
 * Benchmark of the force layout (backlog G2 and G7: 10,000 nodes and 50,000 links laid out in
 * under 2 s). Lays out seeded random graphs of three sizes with both algorithms, in 2D and 3D, at
 * the default options, and prints the time per tick and the time of a whole `forceLayout` call
 * (set-up, the default number of ticks for the size, centering), wall-clock and CPU: on a busy
 * machine the two part, and the CPU time is the one to read.
 *
 *   node packages/traces-graph/bench/force.bench.ts
 *   node packages/traces-graph/bench/force.bench.ts --runs 5 --no-collide
 *
 * Plain Node (type stripping, Node ≥ 22.18), no build. Each figure is the median of `--runs` runs
 * (default 3) after one warm-up run of the smallest graph, so the JIT has seen the code.
 */
import os from 'node:os';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { defaultTicks, forceLayout, type ForceOptions } from '../src/layout/force/index.ts';
import type { LayoutGraph } from '../src/layout/types.ts';

const { values: args } = parseArgs({
  options: {
    runs: { type: 'string', default: '3' },
    'no-collide': { type: 'boolean', default: false },
  },
});
const RUNS = Math.max(1, Number(args.runs) || 3);

/** A random graph: `links` links between uniformly drawn pairs of `nodes` nodes, seeded. */
function randomGraph(nodes: number, links: number, seed: number): LayoutGraph {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const source = new Int32Array(links);
  const target = new Int32Array(links);
  for (let k = 0; k < links; k++) {
    const s = Math.floor(next() * nodes);
    let t = Math.floor(next() * (nodes - 1));
    if (t >= s) t++;
    source[k] = s;
    target[k] = t;
  }
  return {
    nodes,
    source,
    target,
    weight: new Float64Array(links).fill(1),
    halfWidth: new Float64Array(nodes).fill(4),
    halfHeight: new Float64Array(nodes).fill(4),
    x: new Float64Array(nodes).fill(NaN),
    y: new Float64Array(nodes).fill(NaN),
    z: new Float64Array(nodes).fill(NaN),
  };
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/** Wall-clock and CPU time (user, this process) of a `forceLayout` call, each the median over the runs. */
function measure(
  graph: LayoutGraph,
  options: ForceOptions,
): { wall: number; cpu: number; finite: boolean } {
  const wall: number[] = [];
  const cpu: number[] = [];
  let finite = true;
  for (let run = 0; run < RUNS; run++) {
    const usage = process.cpuUsage();
    const start = performance.now();
    const result = forceLayout(graph, options);
    wall.push(performance.now() - start);
    cpu.push(process.cpuUsage(usage).user / 1000);
    finite &&=
      result.x.every(Number.isFinite) &&
      result.y.every(Number.isFinite) &&
      (result.z?.every(Number.isFinite) ?? true);
  }
  return { wall: median(wall), cpu: median(cpu), finite };
}

const SIZES: readonly (readonly [number, number])[] = [
  [1000, 5000],
  [5000, 20000],
  [10000, 50000],
];
const CONFIGS: readonly (readonly [string, ForceOptions])[] = [
  ['spring 2D', { algorithm: 'spring', dimensions: 2 }],
  ['spring 3D', { algorithm: 'spring', dimensions: 3 }],
  ['forceatlas2 2D', { algorithm: 'forceatlas2', dimensions: 2 }],
  ['forceatlas2 3D', { algorithm: 'forceatlas2', dimensions: 3 }],
];
const collide = !args['no-collide'];

const cpus = os.cpus();
const load = os.loadavg()[0]!;
console.log(
  `${cpus[0]?.model ?? 'unknown CPU'}, ${cpus.length} cores, ${os.platform()} ${os.arch()}, ` +
    `Node ${process.version}, load average ${load.toFixed(1)}`,
);
console.log(`median of ${RUNS} runs, collide: ${collide}, other options at their defaults`);
if (load > cpus.length) {
  console.log('the machine is busy: wall-clock times are inflated, read the CPU column');
}
console.log();

// Warm-up.
for (const [, options] of CONFIGS) forceLayout(randomGraph(1000, 5000, 1), { ...options, collide });

const rows: string[][] = [
  ['algorithm', 'nodes', 'links', 'ticks', 'cpu ms/tick', 'cpu ms', 'wall ms', 'finite'],
];
for (const [label, options] of CONFIGS) {
  for (const [nodes, links] of SIZES) {
    const graph = randomGraph(nodes, links, 42);
    const ticks = defaultTicks(nodes);
    const { wall, cpu, finite } = measure(graph, { ...options, collide });
    rows.push([
      label,
      String(nodes),
      String(links),
      String(ticks),
      (cpu / ticks).toFixed(2),
      cpu.toFixed(0),
      wall.toFixed(0),
      finite ? 'yes' : 'NO',
    ]);
  }
}
const widths = rows[0]!.map((_, c) => Math.max(...rows.map((row) => row[c]!.length)));
for (const row of rows) {
  console.log(
    row
      .map((cell, c) => (c === 0 ? cell.padEnd(widths[c]!) : cell.padStart(widths[c]!)))
      .join('  '),
  );
}
