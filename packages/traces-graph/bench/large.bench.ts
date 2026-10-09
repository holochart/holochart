/**
 * Benchmark of what a large graph costs on the main thread besides its layout (backlog G7): the
 * link geometry (built once, and again when the zoom changes what depends on it), the same after
 * one node moved (a frame of a drag: built again, or patched), the spatial index of the links
 * that hover uses, a hover query through the index and without it, and the stats the level of
 * detail is measured on.
 *
 *   node packages/traces-graph/bench/large.bench.ts
 *   node packages/traces-graph/bench/large.bench.ts --runs 7
 *
 * Plain Node (type stripping, Node ≥ 22.18), no build. Graphs are seeded: nodes spread over a
 * square, and links either between any two nodes (a hairball of long links: the worst case for
 * the index) or between nodes that are near each other. Each figure is the median of `--runs`
 * runs (default 5) after a warm-up. Times are wall-clock: read them on a quiet machine.
 */
import os from 'node:os';
import process from 'node:process';
import { parseArgs } from 'node:util';
import {
  buildLinkGeometry,
  distanceToLink,
  patchLinkGeometry,
  type LinkGeometry,
  type LinkGeometryInput,
} from '../src/graph/geometry.ts';
import { buildLinkIndex } from '../src/graph/link-index.ts';
import { lodMeasures, lodStats } from '../src/graph/lod.ts';
import type { GraphModel } from '../src/graph/model.ts';
import type { LinkRoute } from '../src/layout/types.ts';

const { values: args } = parseArgs({ options: { runs: { type: 'string', default: '5' } } });
const RUNS = Math.max(1, Number(args.runs) || 5);
const SIDE = 4000;

function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

interface Fixture {
  readonly name: string;
  readonly input: LinkGeometryInput;
  readonly model: GraphModel;
}

/** `shape`: links between any two nodes, between near nodes, or bundled (routes of 20 points). */
function fixture(
  nodes: number,
  links: number,
  shape: 'hairball' | 'local' | 'routed',
  arrows = false,
): Fixture {
  const next = generator(nodes + links);
  const side = Math.ceil(Math.sqrt(nodes));
  const x = new Float64Array(nodes);
  const y = new Float64Array(nodes);
  // A jittered grid, so that a node's neighbours in space are known by index.
  for (let i = 0; i < nodes; i++) {
    x[i] = (((i % side) + next()) * SIDE) / side;
    y[i] = ((Math.floor(i / side) + next()) * SIDE) / side;
  }
  const source = new Int32Array(links);
  const target = new Int32Array(links);
  for (let k = 0; k < links; k++) {
    const a = Math.floor(next() * nodes);
    let b: number;
    if (shape === 'local') {
      const dx = Math.floor(next() * 5) - 2;
      const dy = Math.floor(next() * 5) - 2;
      b = Math.min(nodes - 1, Math.max(0, a + dx + dy * side));
    } else {
      b = Math.floor(next() * nodes);
    }
    source[k] = a;
    target[k] = b === a ? (a + 1) % nodes : b;
  }
  let routes: (LinkRoute | undefined)[] | undefined;
  if (shape === 'routed') {
    // A polyline of 20 points that bows towards the middle of the square, as a bundle does.
    routes = Array.from({ length: links }, (_, k) => {
      const a = source[k]!;
      const b = target[k]!;
      const points = new Float64Array(40);
      for (let j = 0; j < 20; j++) {
        const t = j / 19;
        const pull = 0.5 * Math.sin(Math.PI * t);
        points[2 * j] = (x[a]! + (x[b]! - x[a]!) * t) * (1 - pull) + (SIDE / 2) * pull;
        points[2 * j + 1] = (y[a]! + (y[b]! - y[a]!) * t) * (1 - pull) + (SIDE / 2) * pull;
      }
      return { points, kind: 'polyline' as const };
    });
  }
  const input: LinkGeometryInput = {
    x,
    y,
    hidden: new Uint8Array(nodes),
    source,
    target,
    halfWidth: new Float64Array(nodes).fill(3),
    halfHeight: new Float64Array(nodes).fill(3),
    box: false,
    curve: new Float32Array(links),
    loop: new Int32Array(links).fill(-1),
    routes,
    arrowEnd: arrows,
    arrowStart: false,
    arrowSize: new Float32Array(links).fill(8),
    // Arrowheads are drawn once a zoom has made room for them (the level of detail): zoomed in.
    scaleX: arrows ? 2 : 0.2,
    scaleY: arrows ? 2 : 0.2,
  };
  const model = {
    nodes,
    links,
    source,
    target,
    size: new Float32Array(nodes).fill(6),
  } as unknown as GraphModel;
  const k = (n: number): string => (n >= 1000 ? `${n / 1000}k` : String(n));
  return {
    name: `${k(nodes)} nodes, ${k(links)} ${shape} links${arrows ? ', arrowheads' : ''}`,
    input,
    model,
  };
}

function median(run: () => void): number {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    run();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)]!;
}

/** The nearest link within 4 px of a point, among `candidates` (every link when undefined). */
function nearest(
  geometry: LinkGeometry,
  px: number,
  py: number,
  transform: { scaleX: number; scaleY: number; offsetX: number; offsetY: number },
  candidates: ArrayLike<number> | undefined,
): number {
  const links = geometry.offsets.length - 1;
  let best = -1;
  let bestD = 4.5 * 4.5;
  const count = candidates ? candidates.length : links;
  for (let j = 0; j < count; j++) {
    const k = candidates ? candidates[j]! : j;
    const d2 = distanceToLink(geometry, k, px, py, transform);
    if (d2 < bestD || (d2 === bestD && k > best)) {
      bestD = d2;
      best = k;
    }
  }
  return best;
}

const ms = (v: number): string => v.toFixed(v < 10 ? 2 : 1).padStart(8);

const FIXTURES = [
  fixture(10_000, 50_000, 'hairball'),
  fixture(10_000, 50_000, 'local'),
  fixture(10_000, 50_000, 'local', true),
  fixture(10_000, 50_000, 'routed'),
  fixture(100_000, 150_000, 'local'),
  fixture(100_000, 150_000, 'local', true),
];

console.log(
  `${os.cpus()[0]?.model ?? 'unknown CPU'}, ${os.cpus().length} cores, ${process.platform} ${process.arch}, Node ${process.version}, load average ${os.loadavg()[0]!.toFixed(1)}`,
);
console.log(`median of ${RUNS} runs; times in ms, a hover query in µs\n`);
console.log(
  [
    'graph'.padEnd(46),
    'geometry',
    '   patch',
    '   index',
    ' entries/link',
    ' hover index',
    '  hover scan',
    '   seen',
    ' lod stats',
  ].join(' '),
);

// Warm-up.
buildLinkIndex(buildLinkGeometry(fixture(2000, 6000, 'local', true).input));

for (const { name, input, model } of FIXTURES) {
  const transform = { scaleX: input.scaleX, scaleY: input.scaleY, offsetX: 0, offsetY: 0 };
  let geometry = buildLinkGeometry(input);
  const build = median(() => {
    geometry = buildLinkGeometry(input);
  });
  // One node moved: its links.
  const node = Math.floor(input.x.length / 2);
  const moved = { ...input, x: Float64Array.from(input.x), y: Float64Array.from(input.y) };
  moved.x[node] = moved.x[node]! + 25;
  const at: number[] = [];
  for (let k = 0; k < input.source.length; k++) {
    if (input.source[k] === node || input.target[k] === node) at.push(k);
  }
  let patched = true;
  const patch = median(() => {
    patched = patchLinkGeometry(geometry, moved, at) !== undefined && patched;
  });
  let index = buildLinkIndex(geometry);
  const indexing = median(() => {
    index = buildLinkIndex(geometry);
  });
  // Hover: 2,000 points over the square, a reach of 4.5 px.
  const next = generator(7);
  const queries = Array.from({ length: 2000 }, () => [next() * SIDE, next() * SIDE] as const);
  const reach = 4.5 / input.scaleX;
  let seen = 0;
  let viaIndex = 0;
  const hoverIndex = median(() => {
    seen = 0;
    viaIndex = 0;
    for (const [qx, qy] of queries) {
      const candidates = index.near(qx, qy, reach, reach);
      seen += candidates.length;
      viaIndex += nearest(geometry, qx * input.scaleX, qy * input.scaleY, transform, candidates);
    }
  });
  let viaScan = 0;
  const scanned = queries.slice(0, 100);
  const hoverScan = median(() => {
    viaScan = 0;
    for (const [qx, qy] of scanned) {
      viaScan += nearest(geometry, qx * input.scaleX, qy * input.scaleY, transform, undefined);
    }
  });
  // The same answers, for the queries both ran.
  let check = 0;
  for (const [qx, qy] of scanned) {
    const candidates = index.near(qx, qy, reach, reach);
    check += nearest(geometry, qx * input.scaleX, qy * input.scaleY, transform, candidates);
  }
  if (check !== viaScan) throw new Error(`${name}: the index and the scan disagree`);
  const stats = median(() => {
    lodMeasures(lodStats(input, model), input.scaleX, input.scaleY);
  });
  console.log(
    [
      name.padEnd(46),
      ms(build),
      patched ? ms(patch) : '   (all)',
      ms(indexing),
      (index.entries / input.source.length).toFixed(1).padStart(13),
      ((hoverIndex * 1000) / queries.length).toFixed(1).padStart(12),
      ((hoverScan * 1000) / scanned.length).toFixed(0).padStart(12),
      (seen / queries.length).toFixed(0).padStart(7),
      ms(stats),
    ].join(' '),
  );
  void viaIndex;
}
