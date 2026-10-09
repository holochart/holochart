/**
 * Benchmark of edge bundling (`src/layout/bundle`). Force-directed bundling on seeded random
 * graphs of 1,000, 5,000 and 20,000 links, with the nodes spread evenly over a square (a hairball
 * without structure: the worst case, every link has as many compatible links as the bounds allow)
 * and with the nodes in a few clusters (the case bundling is for); hierarchical bundling on 5,000,
 * 50,000 and 200,000 links between nodes on a circle in 20 groups. All at the default options.
 *
 * For the force method it prints the time of the compatibility lists and of the rest (the
 * iterations, smoothing and thinning) apart, the mean number of neighbours a link ends up with,
 * and the mean number of points of a bundled route, which is the number of vertices it is drawn
 * with. Times are wall-clock and CPU: on a busy machine the two part, and the CPU time is the one
 * to read.
 *
 *   node packages/traces-graph/bench/bundle.bench.ts
 *   node packages/traces-graph/bench/bundle.bench.ts --runs 5 --side 2000
 *
 * Plain Node (type stripping, Node ≥ 22.18), no build. Each figure is the median of `--runs` runs
 * (default 3) after one warm-up run of the smallest graph, so the JIT has seen the code. `--side`
 * is the side of the square the nodes are placed in, in layout units (default 1000): it matters
 * because routes are thinned to a tolerance in those units.
 */
import os from 'node:os';
import process from 'node:process';
import { parseArgs } from 'node:util';
import {
  forceBundle,
  hierarchicalBundle,
  linkCompatibility,
  type BundleGraph,
  type BundlePositions,
} from '../src/layout/bundle/index.ts';
import type { LinkRoute } from '../src/layout/types.ts';

const { values: args } = parseArgs({
  options: {
    runs: { type: 'string', default: '3' },
    side: { type: 'string', default: '1000' },
  },
});
const RUNS = Math.max(1, Number(args.runs) || 3);
const SIDE = Math.max(1, Number(args.side) || 1000);

type Fixture = BundlePositions & BundleGraph;

/** A seeded generator of values in `[0, 1)`. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** `links` links between uniformly drawn pairs of different nodes. */
function randomLinks(nodes: number, links: number, next: () => number): BundleGraph {
  const source = new Int32Array(links);
  const target = new Int32Array(links);
  for (let k = 0; k < links; k++) {
    const s = Math.floor(next() * nodes);
    let t = Math.floor(next() * (nodes - 1));
    if (t >= s) t++;
    source[k] = s;
    target[k] = t;
  }
  return { source, target };
}

/** Nodes spread evenly over the square, random links: a hairball. */
function uniform(nodes: number, links: number, seed: number): Fixture {
  const next = generator(seed);
  const x = new Float64Array(nodes);
  const y = new Float64Array(nodes);
  for (let i = 0; i < nodes; i++) {
    x[i] = SIDE * next();
    y[i] = SIDE * next();
  }
  return { x, y, ...randomLinks(nodes, links, next) };
}

/** Nodes in 12 round clusters (each a twelfth of the square wide), random links. */
function clustered(nodes: number, links: number, seed: number): Fixture {
  const next = generator(seed);
  const clusters = 12;
  const centerX: number[] = [];
  const centerY: number[] = [];
  for (let c = 0; c < clusters; c++) {
    centerX.push(SIDE * (0.1 + 0.8 * next()));
    centerY.push(SIDE * (0.1 + 0.8 * next()));
  }
  const x = new Float64Array(nodes);
  const y = new Float64Array(nodes);
  for (let i = 0; i < nodes; i++) {
    const c = i % clusters;
    // A point in a disc, without trigonometry: draw in the square until it falls inside.
    let dx = 1;
    let dy = 1;
    while (dx * dx + dy * dy > 1) {
      dx = 2 * next() - 1;
      dy = 2 * next() - 1;
    }
    x[i] = centerX[c]! + (SIDE / 24) * dx;
    y[i] = centerY[c]! + (SIDE / 24) * dy;
  }
  return { x, y, ...randomLinks(nodes, links, next) };
}

/** Nodes on a circle in 20 groups of neighbours, random links. */
function grouped(nodes: number, links: number, seed: number): Fixture {
  const next = generator(seed);
  const groups = 20;
  const x = new Float64Array(nodes);
  const y = new Float64Array(nodes);
  const group = new Int32Array(nodes);
  for (let i = 0; i < nodes; i++) {
    const angle = (2 * Math.PI * i) / nodes;
    x[i] = (SIDE / 2) * Math.cos(angle);
    y[i] = (SIDE / 2) * Math.sin(angle);
    group[i] = Math.floor((i * groups) / nodes);
  }
  return { x, y, group, groups, ...randomLinks(nodes, links, next) };
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/** Wall-clock and CPU time (user, this process) of `run`, each the median over the runs, in ms. */
function measure<T>(run: () => T): { wall: number; cpu: number; result: T } {
  const wall: number[] = [];
  const cpu: number[] = [];
  let result!: T;
  for (let i = 0; i < RUNS; i++) {
    const usage = process.cpuUsage();
    const start = performance.now();
    result = run();
    wall.push(performance.now() - start);
    cpu.push(process.cpuUsage(usage).user / 1000);
  }
  return { wall: median(wall), cpu: median(cpu), result };
}

/** How many links got a route, their mean number of points, and whether all are finite. */
function summary(routes: readonly (LinkRoute | undefined)[]): {
  bundled: number;
  points: number;
  finite: boolean;
} {
  let bundled = 0;
  let points = 0;
  let finite = true;
  for (const route of routes) {
    if (!route) continue;
    bundled++;
    points += route.points.length / 2;
    finite &&= route.points.every(Number.isFinite);
  }
  return { bundled, points: bundled > 0 ? points / bundled : 0, finite };
}

function print(rows: string[][]): void {
  const widths = rows[0]!.map((_, c) => Math.max(...rows.map((row) => row[c]!.length)));
  for (const row of rows) {
    console.log(
      row
        .map((cell, c) => (c === 0 ? cell.padEnd(widths[c]!) : cell.padStart(widths[c]!)))
        .join('  '),
    );
  }
  console.log();
}

const cpus = os.cpus();
const load = os.loadavg()[0]!;
console.log(
  `${cpus[0]?.model ?? 'unknown CPU'}, ${cpus.length} cores, ${os.platform()} ${os.arch()}, ` +
    `Node ${process.version}, load average ${load.toFixed(1)}`,
);
console.log(`median of ${RUNS} runs, nodes in a square of ${SIDE} layout units, default options`);
if (load > cpus.length) {
  console.log('the machine is busy: wall-clock times are inflated, read the CPU columns');
}
console.log();

// Warm-up.
const small = clustered(250, 1000, 1);
forceBundle(small, small);
const ring = grouped(1000, 5000, 1);
hierarchicalBundle(ring, ring);

const FORCE_SIZES: readonly (readonly [number, number])[] = [
  [250, 1000],
  [1250, 5000],
  [5000, 20000],
];
const forceRows: string[][] = [
  [
    'force',
    'nodes',
    'links',
    'lists cpu ms',
    'rest cpu ms',
    'total cpu ms',
    'total wall ms',
    'neighbours',
    'bundled',
    'points',
    'finite',
  ],
];
for (const [label, make] of [
  ['uniform', uniform],
  ['clustered', clustered],
] as const) {
  for (const [nodes, links] of FORCE_SIZES) {
    const graph = make(nodes, links, 42);
    const lists = measure(() => linkCompatibility(graph, graph));
    const total = measure(() => forceBundle(graph, graph));
    const { bundled, points, finite } = summary(total.result.routes);
    forceRows.push([
      label,
      String(nodes),
      String(links),
      lists.cpu.toFixed(0),
      Math.max(0, total.cpu - lists.cpu).toFixed(0),
      total.cpu.toFixed(0),
      total.wall.toFixed(0),
      (lists.result.neighbour.length / Math.max(1, lists.result.bundleable)).toFixed(1),
      String(bundled),
      points.toFixed(1),
      finite && !total.result.refused ? 'yes' : 'NO',
    ]);
  }
}
print(forceRows);

const HIERARCHICAL_SIZES: readonly (readonly [number, number])[] = [
  [1000, 5000],
  [5000, 50000],
  [20000, 200000],
];
const hierarchicalRows: string[][] = [
  ['hierarchical', 'nodes', 'links', 'cpu ms', 'wall ms', 'bundled', 'points', 'finite'],
];
for (const [nodes, links] of HIERARCHICAL_SIZES) {
  const graph = grouped(nodes, links, 42);
  const { wall, cpu, result } = measure(() => hierarchicalBundle(graph, graph));
  const { bundled, points, finite } = summary(result);
  hierarchicalRows.push([
    '20 groups on a circle',
    String(nodes),
    String(links),
    cpu.toFixed(0),
    wall.toFixed(0),
    String(bundled),
    points.toFixed(1),
    finite ? 'yes' : 'NO',
  ]);
}
print(hierarchicalRows);
