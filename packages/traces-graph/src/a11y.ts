/**
 * Keyboard stops of the graph traces (backlog G10, S2.14), loaded with the chart's first keyboard
 * focus (`TraceModule.a11y`, `a11y-loader.ts`): every stop is the hover point of a drawn node or
 * link, so its label and announcement read what hovering it shows.
 *
 * One rule holds for every arrangement, as for sankey and the hierarchies: **↓ goes along a link,
 * ↑ comes back, ← / → move among the stops beside this one.** What is beside a stop depends on
 * what the arrangement draws:
 *
 * - **A network** (`force`, `circular`, `grid`, `preset`, `arc`, `hive`, a custom layout, and
 *   every `graph3d` but a layered one): the drawn nodes in index order, then the links of each
 *   node. On a node ← / → go to the previous / next node, ↓ to the first of its links, Home to
 *   the most-connected node and End to the last node. On a link of a node ← / → turn to the
 *   previous / next link of that node, around it and back to the first (clockwise from 12 o'clock
 *   as drawn; in 3D by the index of the node at the other end), ↓ follows the link to the node at
 *   its other end, ↑ goes back to the node, Home / End to its first / last link. A link is a stop
 *   once from each of its ends, whatever its direction.
 * - **A tree** (`tree`, `radial`, `dendrogram`): the drawn nodes. ← / → the previous / next
 *   sibling as drawn (the roots are siblings), ↑ the parent, ↓ the first child, Home / End the
 *   first / last sibling: the keys of sunburst, treemap and icicle. Links that are not tree
 *   edges are not followed. Enter on a node that has children folds or unfolds it, as a click
 *   on it does (`tree.collapsible`; `KeyboardPoint.click`).
 * - **Ranks** (`layered`): the drawn nodes. ← / → the previous / next node of the rank as drawn,
 *   ↓ the linked node in the nearest later rank and ↑ the one in the nearest earlier rank (of
 *   several, the one nearest across the rank), Home / End the first / last node of the rank. A
 *   link the layout turned around to break a cycle is followed the way it is drawn. A layered
 *   `graph3d` has the same keys on its planes: a plane's nodes in index order, and of several
 *   linked nodes the nearest in space.
 * - **`chord`**: the node arcs in ring order, then the ribbons in link order. ← / → move around
 *   the ring (on a ribbon: between the ribbons of its source node), ↓ goes from a node to its
 *   first ribbon and from a ribbon to its target node, ↑ from a ribbon to its source node,
 *   Home / End to the first / last of the stops ← / → move between.
 *
 * A node that is not drawn (in a folded subtree, of a group hidden through the legend, without a
 * position) is not a stop, and neither are its links. With `link.hoverinfo: 'skip'` the links are
 * not stops and a network's nodes are stepped through in order; with `node.hoverinfo: 'skip'`
 * there are no stops.
 *
 * ## The cursor after an update
 *
 * The stops are numbered again whenever the chart updates, and the cursor stays on its node or
 * link (`KeyboardStops.locate`): on the node that was folded, on the link of the same node. When
 * its stop is gone, it goes to what is left of it nearby. From a link that is no longer drawn: to
 * the node whose link it was. From a node that is no longer drawn: in a tree to its nearest
 * ancestor that is (the node its subtree was folded into), else to the drawn node nearest to it
 * in index order, the one before it first.
 *
 * ## Announcements
 *
 * A stop says what it is and its place ({@link NODE_TEMPLATE}, {@link LINK_TEMPLATE},
 * {@link RANK_TEMPLATE}, {@link TREE_TEMPLATE}), then where ↑ and ↓ lead from it when they lead
 * somewhere ({@link UP_TEMPLATE}, {@link DOWN_TEMPLATE}): "net: Valjean, Links: 36, Group: 2,
 * node 12 of 77. Down: Valjean – Javert." Each sentence is an English template that is its own
 * key in a locale dictionary; they are looked up here and joined, and the runtime fills them in.
 * ← / → are not announced: they lead to the stop before and after the place just said.
 *
 * A tree node whose subtree is folded away says so after its place ({@link FOLDED_TEMPLATE}):
 * "org: A, Links: 3, level 2, 1 of 2, children: 2. Folded. Up: Root." Enter on a node announces
 * it again as it is then: folded, or with the child ↓ leads to.
 *
 * ## Cost
 *
 * The stops are built on demand (`KeyboardStops.at`). Listing them is one pass over the nodes and
 * two over the links (typed arrays: the drawn nodes, and the links at each of them); the links of
 * a node are put in order the first time the cursor is on it, and the siblings of a tree the first
 * time one of them is. A graph of 100,000 nodes and 500,000 links has 1.1 million stops: listing
 * them takes about 10 ms and 5 MB, on the first key and after every update of the chart, and a
 * key press costs what the node under the cursor has links (a quarter of a millisecond; a few
 * for a hub with 10,000 links, once). The first stop on a link builds the geometry of the links,
 * as the first hover on one does. Only the ranks of a layered arrangement sort all nodes once
 * ({@link graphRanks}). Finding the cursor again after an update is a lookup of what its stop
 * stood for (a `WeakMap` entry per stop handed out), and for a link the links of its node.
 *
 * This file imports types only: each trace's loader hands over the functions its stops need, so
 * the chunk shares no module with the package (an app's bundler adds no shared chunk for it, and a
 * bundle with one of the traces doesn't pull in the others' code).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type {
  accessibleText,
  HoverContext,
  HoverPoint,
  HoverQuery,
  KeyboardPoint,
  KeyboardStops,
  TraceA11yParts,
} from '@mk7s/holochart-runtime';
import type { sceneFor } from '@mk7s/holochart-traces-3d';
import type { ChordCalc } from './chord/calc.ts';
import type { ChordHit, hoverLabel, hoverModel, toHoverPoint } from './chord/hover.ts';
import type { GraphCalc, GraphTree } from './graph/calc.ts';
import type { connectedComponents } from './data/metrics.ts';
import type { nodeName } from './graph/describe.ts';
import type { frameOf } from './graph/frame.ts';
import type { linkHoverPoint, nodeHoverPoint, partHoverinfo } from './graph/hover.ts';
import type { arrowsOf, drawnLinks } from './graph/links.ts';
import type { GraphModel } from './graph/model.ts';
import type { Graph3dCalc } from './graph3d/calc.ts';
import type { graph3dLinkPoint, graph3dNodePoint } from './graph3d/hover.ts';

/** The announcement of a node among the nodes of a network or of a chord's ring. */
export const NODE_TEMPLATE = '{name}: {text}, node {n} of {count}.';
/** The announcement of a link among the links of `{node}`. */
export const LINK_TEMPLATE = '{name}: {text}, link {n} of {count} of {node}.';
/** The announcement of a node of a layered arrangement: its rank and its place in the rank. */
export const RANK_TEMPLATE = '{name}: {text}, rank {rank} of {ranks}, {n} of {count}.';
/** The announcement of a node of a tree arrangement: the hierarchy traces' sentence. */
export const TREE_TEMPLATE = '{name}: {text}, level {level}, {n} of {count}, children: {children}.';
/** Said after the sentence of a tree node whose subtree is folded away (`tree.collapsed`). */
export const FOLDED_TEMPLATE = 'Folded.';
/** Where ↑ leads from a stop, said after its own sentence. */
export const UP_TEMPLATE = 'Up: {up}.';
/** Where ↓ leads from a stop, said after its own sentence. */
export const DOWN_TEMPLATE = 'Down: {down}.';

type Say = NonNullable<KeyboardPoint['say']>;

/**
 * What the stops of `graph` and `graph3d` both need of the package (see `a11y-loader.ts`). Handed
 * over as one argument, not spread: spread into the loader calls it kept both trace modules in a
 * bundle with one of them.
 */
export type GraphKit = readonly [
  info: typeof partHoverinfo,
  arrows: typeof arrowsOf,
  name: typeof nodeName,
  components: typeof connectedComponents,
];

/** Two rank coordinates this close are one rank, in layout units. */
const RANK_EPSILON = 1e-6;

/** The ranks of a layered arrangement: the rank of each node (-1 for none) and their number. */
export interface GraphRanks {
  readonly rank: ArrayLike<number>;
  readonly count: number;
}

/**
 * The ranks of `arrangement: 'layered'`, `undefined` for any other. A `graph3d` calc has them
 * (its planes). The 2D layout does not return them, so they are read off the drawing: the layout
 * lays out every connected part by itself and gives the nodes of a rank one coordinate along
 * `rankdir`, so within a part the distinct coordinates, in the direction of the links, are its
 * ranks 0, 1, 2, … This sorts the nodes once.
 */
export function graphRanks(
  calc: Pick<GraphCalc, 'arrangement' | 'model' | 'x' | 'y'>,
  trace: FullTrace,
  components: typeof connectedComponents,
): GraphRanks | undefined {
  if (calc.arrangement !== 'layered') return undefined;
  const planes = (calc as { planes?: { rank: ArrayLike<number>; at: ArrayLike<number> } }).planes;
  if (planes) return { rank: planes.rank, count: planes.at.length };
  const { model } = calc;
  const dir = (trace['layered'] as { rankdir?: unknown } | undefined)?.rankdir;
  const along = dir === 'LR' || dir === 'RL' ? calc.x : calc.y;
  // Layout units have y up: the ranks of 'TB' go down, those of 'RL' to the left.
  const sign = dir === 'LR' || dir === 'BT' ? 1 : -1;
  const { component } = components({ link: model }, { nodes: model.nodes });
  const order: number[] = [];
  for (let i = 0; i < model.nodes; i++) if (Number.isFinite(along[i])) order.push(i);
  order.sort((a, b) => component[a]! - component[b]! || sign * (along[a]! - along[b]!) || a - b);
  const rank = new Int32Array(model.nodes).fill(-1);
  let count = 0;
  let r = 0;
  order.forEach((i, k) => {
    const before = order[k - 1];
    if (before === undefined || component[before] !== component[i]) r = 0;
    else if (sign * (along[i]! - along[before]!) > RANK_EPSILON) r++;
    rank[i] = r;
    if (r >= count) count = r + 1;
  });
  return { rank, count };
}

/** A graph as navigation sees it: what is drawn, and the hover point of each part. */
interface Net {
  readonly model: GraphModel;
  /** 1 where the node is not drawn. */
  readonly hidden: ArrayLike<number>;
  /** 1 where a link is not drawn though its ends are. */
  readonly omitted: ArrayLike<number> | undefined;
  /** Whether links are stops (`link.hoverinfo` is not `'skip'`). */
  readonly links: boolean;
  node(i: number): HoverPoint | undefined;
  link(k: number): HoverPoint | undefined;
  name(i: number): string;
  /** A sentence template in the chart's language. */
  t(template: string): string;
  /** `→`, `←`, `↔` or `–` between the names of a link's source and target. */
  readonly joint: string;
}

/** The parts of a `graph` or `graph3d` trace as a {@link Net}. */
function netOf(
  calc: { readonly model: GraphModel },
  trace: FullTrace,
  ctx: HoverContext,
  kit: GraphKit,
  parts: Pick<Net, 'hidden' | 'omitted' | 'node' | 'link'>,
): Net {
  const [info, arrows, name] = kit;
  const { end, start } = arrows(trace);
  const locale = ctx.fullLayout._locale;
  return {
    ...parts,
    model: calc.model,
    links: info(trace, 'link') !== 'skip',
    name: (i) => name(calc.model, i),
    t: (template) => locale?._(template) ?? template,
    joint: end && start ? '↔' : end ? '→' : start ? '←' : '–',
  };
}

/**
 * A stop's sentence, then a sentence about its `state` if it has one, then where ↑ and ↓ lead
 * when they lead somewhere: the templates in the chart's language, joined (with a space after a
 * full stop that takes one: not after `。`).
 */
function sentence(
  net: Pick<Net, 't'>,
  template: string,
  values: Record<string, string>,
  up: string | undefined,
  down: string | undefined,
  state?: string,
): Say {
  let text = net.t(template);
  const add = (more: string): void => {
    text += `${/[.!?]$/.test(text) ? ' ' : ''}${net.t(more)}`;
  };
  if (state !== undefined) add(state);
  if (up !== undefined) {
    add(UP_TEMPLATE);
    values['up'] = up;
  }
  if (down !== undefined) {
    add(DOWN_TEMPLATE);
    values['down'] = down;
  }
  return [text, values];
}

/**
 * What each stop handed out stands for: its node, and for a link of that node the link (else
 * -1). The cursor is found by it among the stops listed after an update
 * (`KeyboardStops.locate`); the entry goes with its stop.
 */
const PLACES = new WeakMap<KeyboardPoint, readonly [node: number, link: number]>();

/** `stop`, remembered as the stop of `node`, or of its link `link`. */
function placed(stop: KeyboardPoint, node: number, link = -1): KeyboardPoint {
  PLACES.set(stop, [node, link]);
  return stop;
}

/**
 * The stop of node `i`, else of the drawn node nearest to it in index order (of two as near, the
 * one before it); -1 when no node is drawn, or `i` is far from being a node of this graph.
 */
function nearestStop(stopOf: Int32Array, i: number): number {
  for (let d = 0; d < stopOf.length; d++) {
    const before = stopOf[i - d];
    if (before !== undefined && before >= 0) return before;
    const after = stopOf[i + d];
    if (after !== undefined && after >= 0) return after;
  }
  return -1;
}

/** The drawn nodes in index order, and each node's place among them (-1 for none). */
function drawnNodes(net: Net): { drawn: Int32Array; stopOf: Int32Array } {
  const n = net.model.nodes;
  const stopOf = new Int32Array(n).fill(-1);
  const drawn = new Int32Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (net.hidden[i] === 1) continue;
    stopOf[i] = count;
    drawn[count++] = i;
  }
  return { drawn: drawn.subarray(0, count), stopOf };
}

/**
 * The drawn links at each drawn node: `ends[start[s] … start[s + 1])` are the links of the node
 * at stop `s`, in link order. A link is at both its ends, a self-link once.
 */
function linkEnds(net: Net, stopOf: Int32Array, count: number) {
  const { model, hidden, omitted } = net;
  const start = new Uint32Array(count + 1);
  const drawn = (k: number): boolean =>
    hidden[model.source[k]!] !== 1 && hidden[model.target[k]!] !== 1 && omitted?.[k] !== 1;
  for (let k = 0; k < model.links; k++) {
    if (!drawn(k)) continue;
    const a = model.source[k]!;
    const b = model.target[k]!;
    start[stopOf[a]! + 1]!++;
    if (b !== a) start[stopOf[b]! + 1]!++;
  }
  for (let s = 0; s < count; s++) start[s + 1]! += start[s]!;
  const ends = new Int32Array(start[count]!);
  const next = start.slice(0, count);
  for (let k = 0; k < model.links; k++) {
    if (!drawn(k)) continue;
    const a = model.source[k]!;
    const b = model.target[k]!;
    ends[next[stopOf[a]!]!++] = k;
    if (b !== a) ends[next[stopOf[b]!]!++] = k;
  }
  return { start, ends };
}

/** `values[from … to)` put in ascending order of `key` (ties keep their order), in place. */
function sortSlice(
  values: Int32Array,
  from: number,
  to: number,
  key: (value: number) => number,
): void {
  if (to - from < 2) return;
  const slice = values.subarray(from, to);
  const keys = Float64Array.from(slice, key);
  // Two keys that are both infinite differ by NaN: they keep their order too.
  const order = Uint32Array.from(slice, (_, at) => at).sort((p, q) => keys[p]! - keys[q]! || p - q);
  slice.set(Int32Array.from(order, (at) => slice[at]!));
}

/**
 * The stops of a network (see the module comment). `turn`: where the node at the other end of a
 * link lies as seen from a node, as a number that grows around it; without it the links of a node
 * are in the order of the nodes at their other ends.
 */
function network(net: Net, turn?: (from: number, to: number) => number): KeyboardStops {
  const { model } = net;
  const { drawn, stopOf } = drawnNodes(net);
  const count = drawn.length;
  const { start, ends } = net.links
    ? linkEnds(net, stopOf, count)
    : { start: new Uint32Array(count + 1), ends: new Int32Array(0) };
  const other = (k: number, i: number): number =>
    model.source[k] === i ? model.target[k]! : model.source[k]!;
  const linkName = (k: number): string =>
    `${net.name(model.source[k]!)} ${net.joint} ${net.name(model.target[k]!)}`;
  /** The links of the node at stop `s`, in order around it: sorted when first asked for. */
  const sorted = new Uint8Array(count);
  const ring = (s: number): void => {
    if (sorted[s] === 1) return;
    sorted[s] = 1;
    const i = drawn[s]!;
    sortSlice(ends, start[s]!, start[s + 1]!, (k) => {
      const j = other(k, i);
      // A self-link has no direction: after the others.
      return j === i ? Infinity : turn ? turn(i, j) : j;
    });
  };
  let hub = 0;
  for (let s = 1; s < count; s++) {
    if (model.degree[drawn[s]!]! > model.degree[drawn[hub]!]!) hub = s;
  }
  return {
    length: count + ends.length,
    at(e) {
      if (!Number.isInteger(e) || e < 0 || e >= count + ends.length) return undefined;
      if (e < count) {
        const point = net.node(drawn[e]!);
        if (!point) return undefined;
        ring(e);
        const first = start[e]! < start[e + 1]! ? start[e]! : undefined;
        return placed(
          {
            ...point,
            nav: [
              Math.max(0, e - 1),
              Math.min(count - 1, e + 1),
              e,
              first === undefined ? e : count + first,
              hub,
              count - 1,
            ],
            say: sentence(
              net,
              NODE_TEMPLATE,
              { n: `${e + 1}`, count: `${count}` },
              undefined,
              first === undefined ? undefined : linkName(ends[first]!),
            ),
          },
          drawn[e]!,
        );
      }
      // The node whose link this is: the last one whose links start at or before it.
      const h = e - count;
      let s = 0;
      for (let hi = count - 1; s < hi;) {
        const mid = (s + hi + 1) >> 1;
        if (start[mid]! <= h) s = mid;
        else hi = mid - 1;
      }
      ring(s);
      const k = ends[h]!;
      const point = net.link(k);
      if (!point) return undefined;
      const a = start[s]!;
      const d = start[s + 1]! - a;
      const at = h - a;
      const i = drawn[s]!;
      const j = other(k, i);
      return placed(
        {
          ...point,
          nav: [
            count + a + ((at + d - 1) % d),
            count + a + ((at + 1) % d),
            s,
            stopOf[j]!,
            count + a,
            count + a + d - 1,
          ],
          say: sentence(
            net,
            LINK_TEMPLATE,
            { n: `${at + 1}`, count: `${d}`, node: net.name(i) },
            undefined,
            net.name(j),
          ),
        },
        i,
        k,
      );
    },
    locate(point) {
      const place = PLACES.get(point);
      if (!place) return -1;
      const [i, k] = place;
      const s = stopOf[i] ?? -1;
      if (s < 0) return nearestStop(stopOf, i);
      if (k < 0) return s;
      // The link among the links of its node, as they are in order now; the node without it.
      ring(s);
      const at = ends.subarray(start[s]!, start[s + 1]!).indexOf(k);
      return at < 0 ? s : count + start[s]! + at;
    },
  };
}

/**
 * The stops of a tree arrangement (see the module comment). `across`: where a node is drawn among
 * its siblings, as a number that grows from the first to the last. `folds`: whether a click on a
 * node that has children folds or unfolds it (`tree.collapsible`).
 */
function treeStops(
  net: Net,
  tree: GraphTree,
  across: (i: number) => number,
  folds: boolean,
): KeyboardStops {
  const { drawn, stopOf } = drawnNodes(net);
  const count = drawn.length;
  const n = net.model.nodes;
  // The drawn children of every node, and after them the drawn roots (as the children of `n`).
  const home = (i: number): number => (tree.parent[i]! >= 0 ? tree.parent[i]! : n);
  const start = new Uint32Array(n + 2);
  for (const i of drawn) start[home(i) + 1]!++;
  for (let p = 0; p <= n; p++) start[p + 1]! += start[p]!;
  const kids = new Int32Array(count);
  const next = start.slice(0, n + 1);
  for (const i of drawn) kids[next[home(i)]!++] = i;
  /** The children of `p` as they are drawn: sorted when first asked for. */
  const sorted = new Uint8Array(n + 1);
  const childrenOf = (p: number): Int32Array => {
    if (sorted[p] !== 1) {
      sorted[p] = 1;
      sortSlice(kids, start[p]!, start[p + 1]!, across);
    }
    return kids.subarray(start[p]!, start[p + 1]!);
  };
  return {
    length: count,
    at(s) {
      const i = drawn[s];
      const point = i === undefined ? undefined : net.node(i);
      if (i === undefined || !point) return undefined;
      const parent = tree.parent[i]!;
      const siblings = childrenOf(home(i));
      const at = siblings.indexOf(i);
      const child = childrenOf(i)[0];
      const up = parent >= 0 && stopOf[parent]! >= 0 ? parent : undefined;
      let level = 1;
      for (let p = parent; p >= 0; p = tree.parent[p]!) level++;
      const stop = (j: number | undefined): number => (j === undefined ? s : stopOf[j]!);
      return placed(
        {
          ...point,
          nav: [
            stop(siblings[at - 1]),
            stop(siblings[at + 1]),
            stop(up),
            stop(child),
            stop(siblings[0]),
            stop(siblings[siblings.length - 1]),
          ],
          say: sentence(
            net,
            TREE_TEMPLATE,
            {
              level: `${level}`,
              n: `${at + 1}`,
              count: `${siblings.length}`,
              children: `${tree.children[i]}`,
            },
            up === undefined ? undefined : net.name(up),
            child === undefined ? undefined : net.name(child),
            tree.collapsed[i] === 1 ? FOLDED_TEMPLATE : undefined,
          ),
          // Enter is the click that folds the node or unfolds it.
          ...(folds && tree.children[i]! > 0 ? { click: true } : {}),
        },
        i,
      );
    },
    locate(point) {
      const i = PLACES.get(point)?.[0];
      if (i === undefined) return -1;
      // The node, else the nearest ancestor that is drawn: the one its subtree was folded into.
      for (let p = i; p >= 0; p = tree.parent[p] ?? -1) {
        const s = stopOf[p] ?? -1;
        if (s >= 0) return s;
      }
      return nearestStop(stopOf, i);
    },
  };
}

/**
 * The stops of a layered arrangement (see the module comment). `across`: where a node is drawn in
 * its rank, as a number that grows from the first to the last. `gap`: how far apart two nodes are
 * drawn, to choose among the linked nodes of a rank; by default their distance across the ranks.
 */
function rankStops(
  net: Net,
  ranks: GraphRanks,
  across: (i: number) => number,
  gap = (i: number, j: number): number => Math.abs(across(j) - across(i)),
): KeyboardStops {
  const { model } = net;
  const { drawn, stopOf } = drawnNodes(net);
  const count = drawn.length;
  const rankOf = (i: number): number => Math.max(0, ranks.rank[i] ?? 0);
  // The drawn nodes rank by rank, each rank as it is drawn, and each node's place in its rank.
  const rows = Math.max(1, ranks.count);
  const start = new Uint32Array(rows + 1);
  for (const i of drawn) start[rankOf(i) + 1]!++;
  for (let r = 0; r < rows; r++) start[r + 1]! += start[r]!;
  const row = new Int32Array(count);
  const next = start.slice(0, rows);
  for (const i of drawn) row[next[rankOf(i)]!++] = i;
  const place = new Int32Array(model.nodes);
  for (let r = 0; r < rows; r++) {
    sortSlice(row, start[r]!, start[r + 1]!, across);
    for (let at = start[r]!; at < start[r + 1]!; at++) place[row[at]!] = at - start[r]!;
  }
  const links = linkEnds(net, stopOf, count);
  /** The linked node in the nearest rank after (`dir` 1) or before `i`, nearest across. */
  const linked = (s: number, dir: 1 | -1): number | undefined => {
    const i = drawn[s]!;
    let best: number | undefined;
    let bestRank = Infinity;
    let bestGap = Infinity;
    for (let at = links.start[s]!; at < links.start[s + 1]!; at++) {
      const k = links.ends[at]!;
      const j = model.source[k] === i ? model.target[k]! : model.source[k]!;
      const away = (rankOf(j) - rankOf(i)) * dir;
      if (away <= 0) continue;
      const apart = gap(i, j);
      if (
        away < bestRank ||
        (away === bestRank && (apart < bestGap || (apart === bestGap && j < best!)))
      ) {
        best = j;
        bestRank = away;
        bestGap = apart;
      }
    }
    return best;
  };
  return {
    length: count,
    at(s) {
      const i = drawn[s];
      const point = i === undefined ? undefined : net.node(i);
      if (i === undefined || !point) return undefined;
      const r = rankOf(i);
      const from = start[r]!;
      const size = start[r + 1]! - from;
      const at = place[i]!;
      const up = linked(s, -1);
      const down = linked(s, 1);
      const stop = (j: number | undefined): number => (j === undefined ? s : stopOf[j]!);
      return placed(
        {
          ...point,
          nav: [
            stop(row[from + Math.max(0, at - 1)]),
            stop(row[from + Math.min(size - 1, at + 1)]),
            stop(up),
            stop(down),
            stop(row[from]),
            stop(row[from + size - 1]),
          ],
          say: sentence(
            net,
            RANK_TEMPLATE,
            { rank: `${r + 1}`, ranks: `${rows}`, n: `${at + 1}`, count: `${size}` },
            up === undefined ? undefined : net.name(up),
            down === undefined ? undefined : net.name(down),
          ),
        },
        i,
      );
    },
    locate(point) {
      const i = PLACES.get(point)?.[0];
      return i === undefined ? -1 : nearestStop(stopOf, i);
    },
  };
}

/** The parts of `graph`. */
export const graph = (
  frame: typeof frameOf,
  nodePoint: typeof nodeHoverPoint,
  linkPoint: typeof linkHoverPoint,
  links: typeof drawnLinks,
  kit: GraphKit,
): TraceA11yParts => ({
  graph: {
    keyboardPoints(calc: GraphCalc, trace: FullTrace, ctx: HoverContext) {
      const [info, , , components] = kit;
      if (info(trace, 'node') === 'skip') return undefined;
      // The positions on screen now, in px with y up: what "beside" and "around" are read from.
      // What is drawn is read from the calc: a node that is folding away shows for a moment more
      // (the frame of a tree that folds) and is a stop no more.
      const { x, y } = frame(calc);
      const { hidden, model, tree } = calc;
      const { scaleX, scaleY, offsetX, offsetY } = ctx.transform;
      const px = (i: number): number => x[i]! * scaleX;
      const down = (i: number): number => -y[i]! * scaleY;
      const net = netOf(calc, trace, ctx, kit, {
        hidden,
        omitted: calc.omitted,
        node(i) {
          const point = nodePoint(calc, trace, i, ctx);
          // A tree node is anchored where it is at rest: a fold on its way ends there, and the
          // label of the cursor waits for its node.
          return tree
            ? { ...point, px: tree.x[i]! * scaleX + offsetX, py: tree.y[i]! * scaleY + offsetY }
            : point;
        },
        link(k) {
          // Anchored on the middle of the link as it is drawn (a curve, a route, a loop): its
          // middle vertex, or between its two middle ones. A link with nothing to draw between
          // two overlapping nodes: between their centers.
          const { geometry } = links(calc, trace, scaleX, scaleY);
          const from = geometry.offsets[k]!;
          const to = geometry.offsets[k + 1]!;
          if (to === from) {
            const a = model.source[k]!;
            const b = model.target[k]!;
            return linkPoint(calc, trace, k, ctx, (x[a]! + x[b]!) / 2, (y[a]! + y[b]!) / 2, 0);
          }
          const lo = from + ((to - from - 1) >> 1);
          const hi = from + ((to - from) >> 1);
          return linkPoint(
            calc,
            trace,
            k,
            ctx,
            (geometry.x[lo]! + geometry.x[hi]!) / 2,
            (geometry.y[lo]! + geometry.y[hi]!) / 2,
            0,
          );
        },
      });
      if (tree) {
        const rule = calc.labelRule;
        // Siblings as the tree draws them at rest, where a fold on its way ends: around a radial
        // tree, down a tree that grows sideways, else across.
        const sideways =
          rule?.kind === 'tree' && (rule.orientation === 'LR' || rule.orientation === 'RL');
        return treeStops(
          net,
          tree,
          rule?.kind === 'radial'
            ? (i) => rule.angle[i]!
            : sideways
              ? (i) => -tree.y[i]! * scaleY
              : (i) => tree.x[i]! * scaleX,
          (trace['tree'] as { collapsible?: unknown } | undefined)?.collapsible !== false,
        );
      }
      const ranks = graphRanks(calc, trace, components);
      if (ranks) {
        const dir = (trace['layered'] as { rankdir?: unknown } | undefined)?.rankdir;
        return rankStops(net, ranks, dir === 'LR' || dir === 'RL' ? down : px);
      }
      // Clockwise on screen from 12 o'clock, 0 to 2π.
      return network(net, (i, j) => {
        const angle = Math.atan2(px(j) - px(i), down(i) - down(j));
        return angle < 0 ? angle + 2 * Math.PI : angle;
      });
    },
  },
});

/** The parts of `graph3d`: its stops. The loader adds the view keys of its scene. */
export const graph3d = (
  scene: typeof sceneFor,
  nodePoint: typeof graph3dNodePoint,
  linkPoint: typeof graph3dLinkPoint,
  kit: GraphKit,
): TraceA11yParts => ({
  graph3d: {
    keyboardPoints(calc: Graph3dCalc, trace: FullTrace, ctx: HoverContext) {
      const [info, , , components] = kit;
      const s = scene(ctx.fullLayout, trace);
      if (info(trace, 'node') === 'skip' || !s) return undefined;
      // Overlay px from container px, as the scene's own stops are anchored.
      const py = ctx.height ?? 0;
      const query: HoverQuery = {
        px: 0,
        py,
        xl: 0,
        yl: py,
        cx: 0,
        cy: 0,
        mode: 'closest',
        distance: 0,
      };
      const pick = { scene: s, hits: [], query };
      const net = netOf(calc, trace, ctx, kit, {
        hidden: calc.hidden,
        omitted: undefined,
        node: (i) => nodePoint(pick, calc, trace, i, ctx.fullLayout),
        link: (k) => linkPoint(pick, calc, trace, k),
      });
      // Space has no left and right that a turn of the camera keeps: a rank is in index order,
      // and of the linked nodes of a rank the nearest in space is the one ↑ and ↓ lead to.
      const ranks = graphRanks(calc as unknown as GraphCalc, trace, components);
      const { x, y, z } = calc;
      return ranks
        ? rankStops(
            net,
            ranks,
            (i) => i,
            (i, j) => Math.hypot(x[j]! - x[i]!, y[j]! - y[i]!, z[j]! - z[i]!),
          )
        : network(net);
    },
  },
});

/** The parts of `chord`. */
export const chord = (
  modelOf: typeof hoverModel,
  labelOf: typeof hoverLabel,
  point: typeof toHoverPoint,
  plain: typeof accessibleText,
): TraceA11yParts => ({
  chord: {
    keyboardPoints(calc: ChordCalc, trace: FullTrace, ctx: HoverContext): KeyboardPoint[] {
      const m = modelOf(calc, trace, ctx);
      if (!m) return [];
      const { nodes, ribbons, nodeAt } = m;
      const n = nodes.length;
      const locale = ctx.fullLayout._locale;
      const net = { t: (template: string): string => locale?._(template) ?? template };
      const name = (i: number): string => plain(calc.names[i]);
      const from = (node: number): number[] =>
        ribbons.flatMap((r, k) => (r.link.source === node ? n + k : []));
      // A part with `hoverinfo: 'skip'` has no stops: the indices of the others no longer match
      // the ring and the links, so they are a list, stepped through in order.
      const list =
        (n > 0 && !labelOf(m, { kind: 'node', i: 0 })) ||
        (ribbons.length > 0 && !labelOf(m, { kind: 'link', i: 0 }));
      const stop = (
        hit: ChordHit,
        k: number,
        group: readonly number[],
        up: number | undefined,
        down: number | undefined,
        say: (at: number) => Say,
      ): KeyboardPoint[] => {
        const label = labelOf(m, hit);
        if (!label) return [];
        const g = group.indexOf(k);
        const nav = [
          group[g - 1] ?? group.at(-1),
          group[g + 1] ?? group[0],
          up ?? k,
          down ?? k,
          group[0],
          group.at(-1),
        ];
        return [{ ...point(label, ctx.height ?? 0), ...(list ? {} : { nav }), say: say(g) }];
      };
      const ring = nodes.map((_, k) => k);
      return [
        ...nodes.flatMap((node, k) => {
          const first = from(node.i)[0];
          const link = first === undefined || list ? undefined : ribbons[first - n]!.link;
          return stop({ kind: 'node', i: k }, k, ring, undefined, first, (at) =>
            sentence(
              net,
              NODE_TEMPLATE,
              { n: `${at + 1}`, count: `${n}` },
              undefined,
              link && `${name(link.source)} ${calc.directed ? '→' : '—'} ${name(link.target)}`,
            ),
          );
        }),
        ...ribbons.flatMap((r, k) => {
          const group = from(r.link.source);
          return stop(
            { kind: 'link', i: k },
            n + k,
            group,
            nodeAt[r.link.source],
            nodeAt[r.link.target],
            (at) =>
              sentence(
                net,
                LINK_TEMPLATE,
                { n: `${at + 1}`, count: `${group.length}`, node: name(r.link.source) },
                undefined,
                list ? undefined : name(r.link.target),
              ),
          );
        }),
      ];
    },
  },
});
