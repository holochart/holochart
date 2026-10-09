/**
 * Cycle breaking, the first Sugiyama step (story G3): which links to turn around so that the rest
 * of the pipeline sees an acyclic graph. The links chosen are a feedback arc set; the layout draws
 * them against the flow and reports them in `LayoutResult.reversed`.
 *
 * Two published pieces, put together:
 *
 * 1. Strongly connected components (Tarjan 1972, iterative). Only a link inside a component can
 *    lie on a cycle, so links between components are never turned: an acyclic input comes back
 *    untouched, and so does the acyclic part of a cyclic one.
 * 2. Inside the components, the greedy heuristic of Eades, Lin and Smyth ("A fast and effective
 *    heuristic for the feedback arc set problem", 1993): repeatedly take a sink to the right end
 *    of a sequence, a source to the left end, and otherwise the node with the largest out-degree
 *    minus in-degree to the left end; the links that point backwards in the sequence are the set.
 *    It runs in linear time on degree buckets and turns at most half of the links of a component.
 *
 * Why not the back edges of a depth-first search, which is what sankey's `circularLinks` amounts
 * to (the closing link of each cycle at its lowest node)? Both leave an acyclic graph, but the
 * DFS set depends on where the search starts and can be large: on `0 → 1 → … → n − 1` with a link
 * from every node back to 0 it turns `n − 1` links where turning `0 → 1` alone is enough. The
 * greedy order finds that one.
 *
 * Deterministic: ties go to the node that entered its bucket first, which at the start is the node
 * with the lowest index, so a plain cycle `a → b → c → a` is opened at the link into its first
 * node. Links count once each (parallel links separately); `weight` is not looked at. Self-links
 * are not part of the problem: they are never marked here and get their own loop route.
 */

/** Strongly connected component of each node (Tarjan, without recursion). */
function strongComponents(
  nodes: number,
  outStart: Int32Array,
  outTo: Int32Array,
): { readonly component: Int32Array; readonly count: number } {
  const index = new Int32Array(nodes).fill(-1);
  const low = new Int32Array(nodes);
  const component = new Int32Array(nodes).fill(-1);
  const onStack = new Uint8Array(nodes);
  const stack = new Int32Array(nodes);
  const callNode = new Int32Array(nodes);
  const callNext = new Int32Array(nodes);
  let stackSize = 0;
  let counter = 0;
  let count = 0;
  for (let start = 0; start < nodes; start++) {
    if (index[start]! >= 0) continue;
    let depth = 0;
    callNode[0] = start;
    callNext[0] = outStart[start]!;
    index[start] = low[start] = counter++;
    stack[stackSize++] = start;
    onStack[start] = 1;
    while (depth >= 0) {
      const v = callNode[depth]!;
      const next = callNext[depth]!;
      if (next < outStart[v + 1]!) {
        callNext[depth] = next + 1;
        const w = outTo[next]!;
        if (index[w]! < 0) {
          index[w] = low[w] = counter++;
          stack[stackSize++] = w;
          onStack[w] = 1;
          depth++;
          callNode[depth] = w;
          callNext[depth] = outStart[w]!;
        } else if (onStack[w]) {
          if (index[w]! < low[v]!) low[v] = index[w]!;
        }
        continue;
      }
      if (low[v] === index[v]) {
        let w: number;
        do {
          w = stack[--stackSize]!;
          onStack[w] = 0;
          component[w] = count;
        } while (w !== v);
        count++;
      }
      depth--;
      if (depth >= 0) {
        const parent = callNode[depth]!;
        if (low[v]! < low[parent]!) low[parent] = low[v]!;
      }
    }
  }
  return { component, count };
}

/** Adjacency in compressed rows: the entries of node `v` are `start[v] … start[v + 1] − 1`. */
function rows(
  nodes: number,
  from: Int32Array,
  to: Int32Array,
  keep: (k: number) => boolean,
): { readonly start: Int32Array; readonly entries: Int32Array } {
  const start = new Int32Array(nodes + 1);
  for (let k = 0; k < from.length; k++) if (keep(k)) start[from[k]! + 1]!++;
  for (let v = 0; v < nodes; v++) start[v + 1]! += start[v]!;
  const entries = new Int32Array(start[nodes]!);
  const cursor = start.slice(0, nodes);
  for (let k = 0; k < from.length; k++) if (keep(k)) entries[cursor[from[k]!]!++] = to[k]!;
  return { start, entries };
}

/**
 * The links to reverse so that no cycle is left: 1 for a link of the feedback arc set, 0 for the
 * others (and for self-links). `source` and `target` are node indices below `nodes`.
 */
export function feedbackLinks(nodes: number, source: Int32Array, target: Int32Array): Uint8Array {
  const links = source.length;
  const reversed = new Uint8Array(links);
  if (nodes === 0 || links === 0) return reversed;

  const notSelf = (k: number): boolean => source[k] !== target[k];
  const all = rows(nodes, source, target, notSelf);
  const { component } = strongComponents(nodes, all.start, all.entries);

  // Only the links inside a strong component take part from here on.
  const inside = (k: number): boolean =>
    source[k] !== target[k] && component[source[k]!] === component[target[k]!];
  const out = rows(nodes, source, target, inside);
  if (out.entries.length === 0) return reversed;
  const into = rows(nodes, target, source, inside);

  const outDegree = new Int32Array(nodes);
  const inDegree = new Int32Array(nodes);
  let maxDegree = 0;
  for (let v = 0; v < nodes; v++) {
    outDegree[v] = out.start[v + 1]! - out.start[v]!;
    inDegree[v] = into.start[v + 1]! - into.start[v]!;
    maxDegree = Math.max(maxDegree, outDegree[v]!, inDegree[v]!);
  }

  // Buckets by out-degree minus in-degree: doubly linked lists, first in first out.
  const bucketHead = new Int32Array(2 * maxDegree + 1).fill(-1);
  const bucketTail = new Int32Array(2 * maxDegree + 1).fill(-1);
  const prev = new Int32Array(nodes).fill(-1);
  const next = new Int32Array(nodes).fill(-1);
  const bucketOf = new Int32Array(nodes).fill(-1);
  /** 0: in a bucket, 1: waiting as a sink or a source, 2: placed (or never part of it). */
  const state = new Uint8Array(nodes);
  const sinks = new Int32Array(nodes);
  const sources = new Int32Array(nodes);
  let sinkHead = 0;
  let sinkTail = 0;
  let sourceHead = 0;
  let sourceTail = 0;
  let top = 0;

  const unlink = (v: number): void => {
    const b = bucketOf[v]!;
    if (b < 0) return;
    const p = prev[v]!;
    const n = next[v]!;
    if (p >= 0) next[p] = n;
    else bucketHead[b] = n;
    if (n >= 0) prev[n] = p;
    else bucketTail[b] = p;
    prev[v] = next[v] = bucketOf[v] = -1;
  };
  const place = (v: number): void => {
    if (outDegree[v] === 0) {
      state[v] = 1;
      sinks[sinkTail++] = v;
    } else if (inDegree[v] === 0) {
      state[v] = 1;
      sources[sourceTail++] = v;
    } else {
      const b = outDegree[v]! - inDegree[v]! + maxDegree;
      const tail = bucketTail[b]!;
      prev[v] = tail;
      if (tail >= 0) next[tail] = v;
      else bucketHead[b] = v;
      bucketTail[b] = v;
      bucketOf[v] = b;
      if (b > top) top = b;
    }
  };

  let remaining = 0;
  for (let v = 0; v < nodes; v++) {
    if (outDegree[v] === 0 && inDegree[v] === 0) {
      state[v] = 2;
    } else {
      remaining++;
      place(v);
    }
  }

  /** Place in the sequence: counted up from the left end and down from the right end. */
  const order = new Int32Array(nodes);
  let left = 0;
  let right = nodes - 1;
  const take = (v: number, atLeft: boolean): void => {
    state[v] = 2;
    order[v] = atLeft ? left++ : right--;
    for (let i = out.start[v]!; i < out.start[v + 1]!; i++) {
      const w = out.entries[i]!;
      if (state[w] === 2) continue;
      inDegree[w]!--;
      if (state[w] === 0) {
        unlink(w);
        place(w);
      }
    }
    for (let i = into.start[v]!; i < into.start[v + 1]!; i++) {
      const u = into.entries[i]!;
      if (state[u] === 2) continue;
      outDegree[u]!--;
      if (state[u] === 0) {
        unlink(u);
        place(u);
      }
    }
  };

  while (remaining > 0) {
    if (sinkHead < sinkTail) {
      take(sinks[sinkHead++]!, false);
    } else if (sourceHead < sourceTail) {
      take(sources[sourceHead++]!, true);
    } else {
      while (bucketHead[top]! < 0) top--;
      const v = bucketHead[top]!;
      unlink(v);
      take(v, true);
    }
    remaining--;
  }

  for (let k = 0; k < links; k++) {
    if (inside(k) && order[source[k]!]! > order[target[k]!]!) reversed[k] = 1;
  }
  return reversed;
}

/**
 * `true` when the links, with the marked ones turned around and self-links left out, have no
 * cycle (Kahn's algorithm). The pipeline relies on it; the tests assert it.
 */
export function isAcyclic(
  nodes: number,
  source: Int32Array,
  target: Int32Array,
  reversed?: Uint8Array,
): boolean {
  const inDegree = new Int32Array(nodes);
  const tail = new Int32Array(source.length);
  const head = new Int32Array(source.length);
  for (let k = 0; k < source.length; k++) {
    const turned = reversed !== undefined && reversed[k] === 1;
    tail[k] = turned ? target[k]! : source[k]!;
    head[k] = turned ? source[k]! : target[k]!;
  }
  const out = rows(nodes, tail, head, (k) => tail[k] !== head[k]);
  for (let i = 0; i < out.entries.length; i++) inDegree[out.entries[i]!]!++;
  const queue = new Int32Array(nodes);
  let size = 0;
  for (let v = 0; v < nodes; v++) if (inDegree[v] === 0) queue[size++] = v;
  for (let i = 0; i < size; i++) {
    const v = queue[i]!;
    for (let j = out.start[v]!; j < out.start[v + 1]!; j++) {
      const w = out.entries[j]!;
      if (--inDegree[w]! === 0) queue[size++] = w;
    }
  }
  return size === nodes;
}
