/**
 * Graphs for the worker's tests and benchmarks: seeded, so every run and every thread sees the
 * same one.
 */
import type { LayoutGraph } from '../../layout/types.ts';

/** A random graph: `links` links between uniformly drawn pairs of `nodes` nodes, seeded. */
export function randomGraph(nodes: number, links: number, seed = 42): LayoutGraph {
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
  };
}

/** `graph` with `groups` groups, node `i` in group `i mod groups`. */
export function withGroups(graph: LayoutGraph, groups: number): LayoutGraph {
  const group = new Int32Array(graph.nodes);
  for (let i = 0; i < graph.nodes; i++) group[i] = i % groups;
  return { ...graph, group, groups };
}

/** A tree of `nodes` nodes as links: node `i` hangs under node `⌊(i − 1) / fan⌋`. */
export function treeGraph(nodes: number, fan = 3): LayoutGraph {
  const links = Math.max(0, nodes - 1);
  const source = new Int32Array(links);
  const target = new Int32Array(links);
  for (let i = 1; i < nodes; i++) {
    source[i - 1] = Math.floor((i - 1) / fan);
    target[i - 1] = i;
  }
  return {
    nodes,
    source,
    target,
    weight: new Float64Array(links).fill(1),
    halfWidth: new Float64Array(nodes).fill(10),
    halfHeight: new Float64Array(nodes).fill(6),
    x: new Float64Array(nodes).fill(NaN),
    y: new Float64Array(nodes).fill(NaN),
  };
}

/** Whether two arrays hold the same bytes: `-0` and `0`, or two `NaN`s of different bits, differ. */
export function sameBytes(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false;
  const p = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const q = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
  return true;
}
