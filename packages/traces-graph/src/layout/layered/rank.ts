/**
 * Layer assignment, the second Sugiyama step (story G3): an integer rank per node with
 * `rank[head] − rank[tail] ≥ 1` for every link of the acyclic graph that cycle breaking left.
 *
 * Three rankers, each the starting point of the next:
 *
 * - `longest-path`: a node's rank is the longest path that reaches it from a source, as sankey's
 *   depth is. Linear time, but every source sits in rank 0 however late it is needed, so links
 *   from late sources are long.
 * - `tight-tree`: the longest-path ranks, then the components that tight links (length 1) hold
 *   together are joined, the smallest first, each along the link with the least slack that leaves
 *   it, by moving the smaller side until that link is tight. The result is a spanning tree of
 *   tight links per connected part of the graph: no part of the graph hangs further away than
 *   some link forces it to.
 * - `network-simplex`: the method of Gansner, Koutsofios, North and Vo ("A technique for drawing
 *   directed graphs", 1993), which makes `Σ weight × length` over the links as small as it can
 *   be. It starts from the tight tree and exchanges a tree link with a negative cut value for the
 *   non-tree link with the least slack that crosses the same cut, until no cut value is negative.
 *
 * How the simplex is kept cheap here:
 *
 * - A cut value needs no walk over links. With `balance[v] = Σ weight(out) − Σ weight(in)`, the
 *   links inside a subtree cancel in the sum of its balances, so that sum is the weight leaving
 *   the subtree minus the weight entering it: the cut value of the subtree's link to its parent,
 *   up to the sign the link's direction gives.
 * - Nodes are numbered in postorder (`lim`, with `low` the smallest number in the subtree, as in
 *   the paper), so a subtree is a contiguous slice of `order` and "is `w` below `v`" is two
 *   comparisons.
 * - After an exchange only the subtree under the lowest common ancestor of the entering link's
 *   ends has changed shape, so only that subtree is walked again.
 *
 * - The search for the entering link walks the smaller side of the cut and stops at the first link
 *   without slack, which nothing can beat.
 *
 * The simplex has a budget ({@link WORK_LIMIT}, counted in nodes and links looked at): on a large
 * graph without a direction it would otherwise run for many seconds. When the budget is spent it
 * stops with the ranking it has, which is feasible and tight, only not the shortest.
 *
 * Deterministic: every search runs in a fixed order and the first of equals wins. Cut values are
 * sums of `weight`, so with weights that are not integers they are compared against a tolerance.
 * A graph that is not connected is handled as it is: one tree per connected part, each part with
 * its smallest rank at 0.
 */
import type { LayeredRanker } from './options.ts';

/** How many negative cut values a search for the leaving link looks at before it takes the worst. */
const SEARCH = 30;
/**
 * Nodes and links the network simplex may look at before it stops improving. 5,000 nodes and
 * 10,000 links finish within half of it whatever their shape, and 20,000 and 40,000 do when the
 * links are local (a pipeline, a build graph); the limit is for larger graphs without a
 * direction, where the simplex would run for many seconds. A count, not a clock: the result is
 * the same on every machine.
 */
export const WORK_LIMIT = 1e8;

/** Counters a caller may ask for (tests, timings). */
export interface RankStats {
  /** Tree links exchanged by the network simplex. */
  exchanges: number;
}

/**
 * Longest-path ranks: 0 for a node without incoming links, else one more than its latest
 * predecessor. The links must be acyclic and without self-links.
 */
export function longestPathRanks(nodes: number, tail: Int32Array, head: Int32Array): Int32Array {
  const rank = new Int32Array(nodes);
  const links = tail.length;
  const start = new Int32Array(nodes + 1);
  const inDegree = new Int32Array(nodes);
  for (let k = 0; k < links; k++) {
    start[tail[k]! + 1]!++;
    inDegree[head[k]!]!++;
  }
  for (let v = 0; v < nodes; v++) start[v + 1]! += start[v]!;
  const to = new Int32Array(links);
  const cursor = start.slice(0, nodes);
  for (let k = 0; k < links; k++) to[cursor[tail[k]!]!++] = head[k]!;
  const queue = new Int32Array(nodes);
  let size = 0;
  for (let v = 0; v < nodes; v++) if (inDegree[v] === 0) queue[size++] = v;
  for (let i = 0; i < size; i++) {
    const v = queue[i]!;
    const next = rank[v]! + 1;
    for (let j = start[v]!; j < start[v + 1]!; j++) {
      const w = to[j]!;
      if (next > rank[w]!) rank[w] = next;
      if (--inDegree[w]! === 0) queue[size++] = w;
    }
  }
  return rank;
}

/** `Σ weight × (rank[head] − rank[tail])`: what the network simplex minimises. */
export function rankLength(
  tail: Int32Array,
  head: Int32Array,
  weight: Float64Array,
  rank: Int32Array,
): number {
  let sum = 0;
  for (let k = 0; k < tail.length; k++) sum += weight[k]! * (rank[head[k]!]! - rank[tail[k]!]!);
  return sum;
}

/**
 * Joins the components of tight links into one tight tree per connected part (see the module
 * comment), marking the tree links in `inTree` and moving `rank` as it goes. Returns the
 * connected part of each node (the index of one of its nodes).
 */
function tightForest(
  nodes: number,
  tail: Int32Array,
  head: Int32Array,
  rank: Int32Array,
  incStart: Int32Array,
  incLink: Int32Array,
  inTree: Uint8Array,
): Int32Array {
  const links = tail.length;
  const parent = new Int32Array(nodes);
  const size = new Int32Array(nodes).fill(1);
  const first = new Int32Array(nodes);
  const last = new Int32Array(nodes);
  const nextMember = new Int32Array(nodes).fill(-1);
  for (let v = 0; v < nodes; v++) parent[v] = first[v] = last[v] = v;
  const find = (v: number): number => {
    while (parent[v] !== v) {
      parent[v] = parent[parent[v]!]!;
      v = parent[v]!;
    }
    return v;
  };
  /** Joins two roots; the larger one (the lower index on a tie) stays the root. */
  const union = (a: number, b: number): number => {
    const keepA = size[a]! > size[b]! || (size[a] === size[b] && a < b);
    const root = keepA ? a : b;
    const other = keepA ? b : a;
    parent[other] = root;
    size[root]! += size[other]!;
    nextMember[last[root]!] = first[other]!;
    last[root] = last[other]!;
    return root;
  };

  for (let k = 0; k < links; k++) {
    if (rank[head[k]!]! - rank[tail[k]!]! !== 1) continue;
    const a = find(tail[k]!);
    const b = find(head[k]!);
    if (a === b) continue;
    inTree[k] = 1;
    union(a, b);
  }

  // A binary heap of (size, root), smallest first; entries go stale when their component grows.
  const capacity = 2 * nodes + 1;
  const heapSize = new Int32Array(capacity);
  const heapRoot = new Int32Array(capacity);
  let heapLength = 0;
  const before = (i: number, j: number): boolean =>
    heapSize[i]! < heapSize[j]! || (heapSize[i] === heapSize[j] && heapRoot[i]! < heapRoot[j]!);
  const swap = (i: number, j: number): void => {
    const s = heapSize[i]!;
    const r = heapRoot[i]!;
    heapSize[i] = heapSize[j]!;
    heapRoot[i] = heapRoot[j]!;
    heapSize[j] = s;
    heapRoot[j] = r;
  };
  const push = (root: number): void => {
    let i = heapLength++;
    heapSize[i] = size[root]!;
    heapRoot[i] = root;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (!before(i, up)) break;
      swap(i, up);
      i = up;
    }
  };
  const pop = (): number => {
    const root = heapRoot[0]!;
    heapLength--;
    if (heapLength > 0) {
      heapSize[0] = heapSize[heapLength]!;
      heapRoot[0] = heapRoot[heapLength]!;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let least = i;
        if (l < heapLength && before(l, least)) least = l;
        if (r < heapLength && before(r, least)) least = r;
        if (least === i) break;
        swap(i, least);
        i = least;
      }
    }
    return root;
  };

  for (let v = 0; v < nodes; v++) if (parent[v] === v && size[v]! < nodes) push(v);
  while (heapLength > 0) {
    const entrySize = heapSize[0]!;
    const c = pop();
    if (parent[c] !== c || size[c] !== entrySize) continue;
    // The link with the least slack between this component and any other.
    let best = -1;
    let bestSlack = Infinity;
    let bestLeaves = false;
    for (let v = first[c]!; v >= 0; v = nextMember[v]!) {
      for (let i = incStart[v]!; i < incStart[v + 1]!; i++) {
        const k = incLink[i]!;
        if (inTree[k]) continue;
        const leaves = tail[k] === v;
        if (find(leaves ? head[k]! : tail[k]!) === c) continue;
        const slack = rank[head[k]!]! - rank[tail[k]!]! - 1;
        if (slack < bestSlack || (slack === bestSlack && k < best)) {
          best = k;
          bestSlack = slack;
          bestLeaves = leaves;
        }
      }
    }
    if (best < 0) continue;
    if (bestSlack > 0) {
      const delta = bestLeaves ? bestSlack : -bestSlack;
      for (let v = first[c]!; v >= 0; v = nextMember[v]!) rank[v]! += delta;
    }
    inTree[best] = 1;
    push(union(c, find(bestLeaves ? head[best]! : tail[best]!)));
  }

  const part = new Int32Array(nodes);
  for (let v = 0; v < nodes; v++) part[v] = find(v);
  return part;
}

/**
 * Ranks by `'tight-tree'` (`exchange: false`) or `'network-simplex'`. `tail`, `head` and `weight`
 * describe an acyclic graph without self-links. `maxWork` bounds the simplex by the nodes and
 * links it may look at ({@link WORK_LIMIT} by default): when that is spent it stops where it is,
 * with a ranking that is feasible and tight but not the shortest.
 */
export function networkSimplexRanks(
  nodes: number,
  tail: Int32Array,
  head: Int32Array,
  weight: Float64Array,
  exchange = true,
  maxWork = WORK_LIMIT,
  stats?: RankStats,
): Int32Array {
  const rank = longestPathRanks(nodes, tail, head);
  const links = tail.length;
  if (stats) stats.exchanges = 0;
  if (nodes === 0 || links === 0) return rank;

  // Every link, listed at both of its ends.
  const incStart = new Int32Array(nodes + 1);
  for (let k = 0; k < links; k++) {
    incStart[tail[k]! + 1]!++;
    incStart[head[k]! + 1]!++;
  }
  for (let v = 0; v < nodes; v++) incStart[v + 1]! += incStart[v]!;
  const incLink = new Int32Array(2 * links);
  const cursor = incStart.slice(0, nodes);
  for (let k = 0; k < links; k++) {
    incLink[cursor[tail[k]!]!++] = k;
    incLink[cursor[head[k]!]!++] = k;
  }

  const inTree = new Uint8Array(links);
  const part = tightForest(nodes, tail, head, rank, incStart, incLink, inTree);

  if (exchange) {
    const balance = new Float64Array(nodes);
    let total = 0;
    for (let k = 0; k < links; k++) {
      const w = weight[k]!;
      balance[tail[k]!]! += w;
      balance[head[k]!]! -= w;
      total += w;
    }
    const epsilon = 1e-10 * total;

    /** The tree link to the parent, −1 for a root. */
    const parentLink = new Int32Array(nodes).fill(-1);
    const low = new Int32Array(nodes);
    const lim = new Int32Array(nodes).fill(-1);
    /** Nodes by `lim`, and the copy a walk writes the new numbering into. */
    const order = new Int32Array(nodes);
    const renumbered = new Int32Array(nodes);
    /** Weight leaving the node's subtree minus weight entering it. */
    const net = new Float64Array(nodes);
    /** The walk a node was last marked for: only marked nodes are walked into. */
    const stamp = new Int32Array(nodes).fill(1);
    const stackNode = new Int32Array(nodes);
    const stackNext = new Int32Array(nodes);
    /** Nodes and links looked at so far. */
    let work = 0;

    /**
     * Numbers the subtree of `root` from its `low` on (`from`) and sums its balances. A child that
     * is not marked with `mark` hangs there as it did before, so its subtree is not walked: its
     * sum stands and its numbers only move along.
     */
    const walk = (root: number, rootLink: number, from: number, mark: number): number => {
      let counter = from;
      let depth = 0;
      parentLink[root] = rootLink;
      low[root] = counter;
      net[root] = balance[root]!;
      stackNode[0] = root;
      stackNext[0] = incStart[root]!;
      while (depth >= 0) {
        const v = stackNode[depth]!;
        const i = stackNext[depth]!;
        if (i < incStart[v + 1]!) {
          stackNext[depth] = i + 1;
          const k = incLink[i]!;
          if (!inTree[k] || k === parentLink[v]) continue;
          const w = tail[k] === v ? head[k]! : tail[k]!;
          if (stamp[w] !== mark) {
            const a = low[w]!;
            const b = lim[w]!;
            const shift = counter - a;
            if (shift !== 0) {
              work += b - a + 1;
              for (let j = a; j <= b; j++) {
                const u = order[j]!;
                renumbered[j + shift] = u;
                low[u]! += shift;
                lim[u]! += shift;
              }
            }
            counter += b - a + 1;
            net[v]! += net[w]!;
            continue;
          }
          parentLink[w] = k;
          low[w] = counter;
          net[w] = balance[w]!;
          depth++;
          stackNode[depth] = w;
          stackNext[depth] = incStart[w]!;
        } else {
          work += incStart[v + 1]! - incStart[v]!;
          lim[v] = counter;
          renumbered[counter] = v;
          counter++;
          depth--;
          if (depth >= 0) net[stackNode[depth]!]! += net[v]!;
        }
      }
      return counter;
    };

    // The first walk: every node is marked, every tree is numbered in one stretch.
    const treeLow = new Int32Array(nodes);
    const treeLim = new Int32Array(nodes);
    let counter = 0;
    for (let v = 0; v < nodes; v++) {
      if (lim[v]! >= 0) continue;
      const from = counter;
      counter = walk(v, -1, from, 1);
      treeLow[part[v]!] = from;
      treeLim[part[v]!] = counter - 1;
    }
    order.set(renumbered);
    work = 0;

    /** The entering link found so far and its slack. */
    let entering = -1;
    let slack = Infinity;
    // The same links once more, by direction: the search below wants only one of the two.
    const outStart = new Int32Array(nodes + 1);
    const inStart = new Int32Array(nodes + 1);
    for (let k = 0; k < links; k++) {
      outStart[tail[k]! + 1]!++;
      inStart[head[k]! + 1]!++;
    }
    for (let v = 0; v < nodes; v++) {
      outStart[v + 1]! += outStart[v]!;
      inStart[v + 1]! += inStart[v]!;
    }
    const outLink = new Int32Array(links);
    const inLink = new Int32Array(links);
    const outCursor = outStart.slice(0, nodes);
    const inCursor = inStart.slice(0, nodes);
    for (let k = 0; k < links; k++) {
      outLink[outCursor[tail[k]!]!++] = k;
      inLink[inCursor[head[k]!]!++] = k;
    }

    /**
     * Looks at the non-tree links of `order[from … to]` that have their head (`atHead`) or their
     * tail there and their other end on the other side of the cut around `order[lo … hi]`. The
     * first link of the least slack wins; a slack of 0 cannot be beaten and ends the search.
     */
    const search = (
      from: number,
      to: number,
      atHead: boolean,
      lo: number,
      hi: number,
      below: boolean,
    ): void => {
      const start = atHead ? inStart : outStart;
      const list = atHead ? inLink : outLink;
      const far = atHead ? tail : head;
      let best = entering;
      let least = slack;
      for (let i = from; i <= to && least > 0; i++) {
        const v = order[i]!;
        const end = start[v + 1]!;
        work += end - start[v]! + 1;
        for (let j = start[v]!; j < end; j++) {
          const k = list[j]!;
          if (inTree[k]) continue;
          const at = lim[far[k]!]!;
          if ((at >= lo && at <= hi) === below) continue;
          const s = rank[head[k]!]! - rank[tail[k]!]! - 1;
          if (s < least) {
            least = s;
            best = k;
            if (s === 0) break;
          }
        }
      }
      entering = best;
      slack = least;
    };

    let scan = 0;
    let exchanges = 0;
    while (work < maxWork) {
      // Leaving link: the most negative cut value among the next few found, scanning in a circle.
      let child = -1;
      let worst = -epsilon;
      let found = 0;
      for (let i = 0; i < nodes && found < SEARCH; i++) {
        work++;
        const c = scan;
        scan = scan + 1 === nodes ? 0 : scan + 1;
        const k = parentLink[c]!;
        if (k < 0) continue;
        const cut = tail[k] === c ? net[c]! : -net[c]!;
        if (cut < -epsilon) {
          found++;
          if (cut < worst) {
            worst = cut;
            child = c;
          }
        }
      }
      if (child < 0) break;

      // Entering link: least slack among the links that cross the cut the other way. The subtree
      // below the leaving link is `order[lo … hi]`; the smaller side of the cut is searched.
      const leaving = parentLink[child]!;
      const lo = low[child]!;
      const hi = lim[child]!;
      const first = treeLow[part[child]!]!;
      const last = treeLim[part[child]!]!;
      const below = 2 * (hi - lo + 1) <= last - first + 1;
      /** The entering link runs from the rest of the tree into the subtree. */
      const inward = tail[leaving] === child;
      entering = -1;
      slack = Infinity;
      // On the subtree's side an inward link is found at its head; on the other side at its tail.
      if (below) {
        search(lo, hi, inward, lo, hi, true);
      } else {
        search(first, lo - 1, !inward, lo, hi, false);
        search(hi + 1, last, !inward, lo, hi, false);
      }
      if (entering < 0) break;

      if (slack > 0) {
        // Move the smaller side so that the entering link becomes tight.
        const delta = inward ? -slack : slack;
        if (below) {
          for (let i = lo; i <= hi; i++) rank[order[i]!]! += delta;
        } else {
          for (let i = first; i < lo; i++) rank[order[i]!]! -= delta;
          for (let i = hi + 1; i <= last; i++) rank[order[i]!]! -= delta;
        }
      }

      // The tree changes along the path between the entering link's ends: mark it, up to their
      // lowest common ancestor, and walk that ancestor's subtree again.
      const mark = exchanges + 2;
      const target = lim[head[entering]!]!;
      let top = tail[entering]!;
      stamp[top] = mark;
      while (!(low[top]! <= target && target <= lim[top]!)) {
        const k = parentLink[top]!;
        top = tail[k] === top ? head[k]! : tail[k]!;
        stamp[top] = mark;
      }
      for (let v = head[entering]!; v !== top;) {
        stamp[v] = mark;
        const k = parentLink[v]!;
        v = tail[k] === v ? head[k]! : tail[k]!;
      }
      inTree[leaving] = 0;
      inTree[entering] = 1;
      const from = low[top]!;
      const end = walk(top, parentLink[top]!, from, mark);
      order.set(renumbered.subarray(from, end), from);
      exchanges++;
    }
    if (stats) stats.exchanges = exchanges;
  }

  // Each connected part starts at rank 0.
  const least = new Int32Array(nodes).fill(2147483647);
  for (let v = 0; v < nodes; v++) if (rank[v]! < least[part[v]!]!) least[part[v]!] = rank[v]!;
  for (let v = 0; v < nodes; v++) rank[v]! -= least[part[v]!]!;
  return rank;
}

/** Ranks of an acyclic graph without self-links, by the ranker asked for. */
export function assignRanks(
  nodes: number,
  tail: Int32Array,
  head: Int32Array,
  weight: Float64Array,
  ranker: LayeredRanker,
  stats?: RankStats,
): Int32Array {
  if (ranker === 'longest-path') {
    if (stats) stats.exchanges = 0;
    return longestPathRanks(nodes, tail, head);
  }
  return networkSimplexRanks(
    nodes,
    tail,
    head,
    weight,
    ranker === 'network-simplex',
    WORK_LIMIT,
    stats,
  );
}
