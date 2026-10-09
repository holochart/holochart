/**
 * The tidy tree's one hard step (backlog G4): where each node goes across the tree, so that
 * subtrees sit as close together as their outlines allow. This is Reingold and Tilford's method
 * for trees of any degree (Walker, 1990) in the linear-time form of Buchheim, Jünger and Leipert
 * ("Improving Walker's Algorithm to Run in Linear Time", 2002), written from the paper over typed
 * arrays and without recursion, so depth is not limited by the call stack.
 *
 * What it guarantees, for the separation the caller asks between neighbours on a level:
 * - neighbours on a level are at least their separation apart, in the order of the tree, so no two
 *   subtrees interleave;
 * - a parent is centred over its first and last child;
 * - a subtree is drawn the same wherever it is in the tree;
 * - small subtrees between two larger ones are spread evenly instead of piling up on the left.
 *
 * ## Steps
 *
 * 1. Bottom up (`place`), each node gets a preliminary position right of its left sibling, and its
 *    subtree is pushed right until its left outline clears the right outline of the subtrees
 *    before it (`apportion`). Outlines are followed level by level through `thread` pointers; a
 *    push is shared out over the siblings in between through `shift` and `change`, applied once
 *    per parent, which is what makes the whole pass linear.
 * 2. Top down, the pushes (`mod`) are summed along each path to give final positions.
 *
 * ## Mirror images
 *
 * A tree and its mirror image come out as mirror drawings, to rounding, although the pass runs
 * from the left: a push is shared evenly over the subtrees in between. A property test holds this
 * over random trees with mixed node sizes; it is an observation, not something proved here.
 */
import type { TreeView } from './forest.ts';

/**
 * How far apart the centers of two neighbours on a level must be. `left` comes before `right` in
 * the tree's order; they may be siblings or the facing ends of two subtrees.
 */
export type Separation = (left: number, right: number) => number;

/**
 * Position of every visible node across the tree, increasing in sibling order. A single root is at
 * 0; the roots of a forest are laid out as the children of a virtual root at 0. Hidden nodes get 0.
 */
export function tidyBreadth(view: TreeView, separation: Separation): Float64Array {
  const n = view.forest.nodes;
  const { order, roots, childStart, childEnd, children } = view;
  // Node `n` is the virtual root that holds the roots.
  const total = n + 1;
  const up = new Int32Array(total).fill(-1);
  const first = new Int32Array(total).fill(-1);
  const last = new Int32Array(total).fill(-1);
  const before = new Int32Array(total).fill(-1);
  const after = new Int32Array(total).fill(-1);
  /** Place among the siblings, from 0. */
  const number = new Int32Array(total);

  const adopt = (p: number, list: Int32Array, start: number, end: number): void => {
    let previous = -1;
    for (let c = start; c < end; c++) {
      const w = list[c]!;
      up[w] = p;
      number[w] = c - start;
      before[w] = previous;
      if (previous >= 0) after[previous] = w;
      else first[p] = w;
      previous = w;
    }
    last[p] = previous;
  };
  adopt(n, roots, 0, roots.length);
  for (let s = 0; s < order.length; s++) {
    const v = order[s]!;
    adopt(v, children, childStart[v]!, childEnd[v]!);
  }

  const prelim = new Float64Array(total);
  const mod = new Float64Array(total);
  const shift = new Float64Array(total);
  const change = new Float64Array(total);
  const thread = new Int32Array(total).fill(-1);
  const ancestor = new Int32Array(total);
  const fallback = new Int32Array(total);
  for (let i = 0; i < total; i++) {
    ancestor[i] = i;
    fallback[i] = first[i]!;
  }

  /** The next node down the left (right) outline of a subtree: a child, or the thread out of it. */
  const nextLeft = (v: number): number => (first[v]! >= 0 ? first[v]! : thread[v]!);
  const nextRight = (v: number): number => (last[v]! >= 0 ? last[v]! : thread[v]!);

  /** Sets `v` right of its left sibling and clears its subtree from the ones before it. */
  const place = (v: number): void => {
    const w = before[v]!;
    if (first[v]! < 0) {
      prelim[v] = w >= 0 ? prelim[w]! + separation(w, v) : 0;
    } else {
      // The pushes the children gave each other, shared out from the right.
      let pushed = 0;
      let delta = 0;
      for (let c = last[v]!; c >= 0; c = before[c]!) {
        prelim[c]! += pushed;
        mod[c]! += pushed;
        delta += change[c]!;
        pushed += shift[c]! + delta;
      }
      const middle = (prelim[first[v]!]! + prelim[last[v]!]!) / 2;
      if (w >= 0) {
        prelim[v] = prelim[w]! + separation(w, v);
        mod[v] = prelim[v]! - middle;
      } else {
        prelim[v] = middle;
      }
    }
    if (w < 0) return;

    // Apportion: walk down the facing outlines of `v`'s subtree (`inRight`, `outRight`) and of the
    // subtrees left of it (`inLeft`, `outLeft`), with the sums of `mod` along each.
    const p = up[v]!;
    let inRight = v;
    let outRight = v;
    let inLeft = w;
    let outLeft = first[p]!;
    let sumInRight = mod[inRight]!;
    let sumOutRight = mod[outRight]!;
    let sumInLeft = mod[inLeft]!;
    let sumOutLeft = mod[outLeft]!;
    for (;;) {
      const nextInLeft = nextRight(inLeft);
      const nextInRight = nextLeft(inRight);
      if (nextInLeft < 0 || nextInRight < 0) {
        // One side ended. The deeper one's outline continues in the other through a thread.
        if (nextInLeft >= 0 && nextRight(outRight) < 0) {
          thread[outRight] = nextInLeft;
          mod[outRight]! += sumInLeft - sumOutRight;
        }
        if (nextInRight >= 0 && nextLeft(outLeft) < 0) {
          thread[outLeft] = nextInRight;
          mod[outLeft]! += sumInRight - sumOutLeft;
          fallback[p] = v;
        }
        break;
      }
      inLeft = nextInLeft;
      inRight = nextInRight;
      outLeft = nextLeft(outLeft);
      outRight = nextRight(outRight);
      ancestor[outRight] = v;
      const push =
        prelim[inLeft]! + sumInLeft - (prelim[inRight]! + sumInRight) + separation(inLeft, inRight);
      if (push > 0) {
        // The sibling of `v` whose subtree `inLeft` is in; the siblings between it and `v` take
        // their share of the push when the parent is placed.
        const a = ancestor[inLeft]!;
        const from = up[a] === p ? a : fallback[p]!;
        const between = number[v]! - number[from]!;
        change[v]! -= push / between;
        shift[v]! += push;
        change[from]! += push / between;
        prelim[v]! += push;
        mod[v]! += push;
        sumInRight += push;
        sumOutRight += push;
      }
      sumInLeft += mod[inLeft]!;
      sumInRight += mod[inRight]!;
      sumOutLeft += mod[outLeft]!;
      sumOutRight += mod[outRight]!;
    }
  };

  // Children before parents, siblings left to right, following the links instead of recursing.
  let v = n;
  while (first[v]! >= 0) v = first[v]!;
  for (;;) {
    place(v);
    if (after[v]! >= 0) {
      v = after[v]!;
      while (first[v]! >= 0) v = first[v]!;
    } else {
      v = up[v]!;
      if (v < 0) break;
    }
  }

  // Parents before children: sum the pushes along each path.
  const offset = new Float64Array(total);
  const out = new Float64Array(n);
  const origin = prelim[n]!;
  for (let s = 0; s < order.length; s++) {
    const node = order[s]!;
    const p = up[node]!;
    offset[node] = offset[p]! + mod[p]!;
    out[node] = prelim[node]! + offset[node]! - origin;
  }
  return out;
}
