/**
 * Accessible description of a `graph` trace (backlog G1, G10; plan E17.1), which `graph3d` says of
 * itself too (`../graph3d/index.ts`).
 *
 * The summary is two to four sentences:
 *
 * 1. what it is and how it is arranged: 'Directed network graph "Pipeline": 9 nodes, 11 links,
 *    3 groups, layered left to right, 1 link reversed to break cycles.' A tree arrangement says
 *    its roots and levels, a layered one its direction and the links it turned (and its ranks
 *    when the calc has them: a `graph3d`'s planes);
 * 2. how it hangs together and where its hubs are: 'All nodes are connected; most connected:
 *    Valjean (36 links), Gavroche (22), Marius (19).', or '3 connected components, the largest
 *    with 60 nodes, 2 nodes without links; …';
 * 3. the largest groups with their sizes, when there are groups;
 * 4. the links that were left out, when there are any.
 *
 * The table is the edge list, one row per kept link: source and target (parent and child for tree
 * input), the value when a link has one and the label when a link has one. Only the first
 * `ctx.maxRows` rows are built up front; `row` formats any link on demand (E17.3). It lists the
 * links of the data: those of a folded subtree or of a group hidden through the legend are in it.
 *
 * Everything here is one pass over the nodes or the links: a graph of 100,000 nodes and 500,000
 * links is described in about 20 ms, most of it finding the connected components.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import {
  accessibleText,
  countText,
  formatPlainNumber,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import { connectedComponents } from '../data/metrics.ts';
import type { GraphCalc } from './calc.ts';
import { arrowsOf } from './links.ts';
import { nodeLabel, type GraphModel } from './model.ts';
import { part } from './style.ts';

/** How many of the most-connected nodes the summary names: fewer for a small graph. */
const HUBS = 5;
const HUBS_SMALL = 3;
/** A graph up to this many nodes is a small one. */
const SMALL = 20;
/** How many of the largest groups the summary names. */
const GROUPS = 5;

/** The arrangements in words a reader knows; a layered one and the trees say more. */
const ARRANGED: Readonly<Record<string, string>> = {
  force: 'force-directed layout',
  circular: 'arranged in a circle',
  grid: 'arranged in a grid',
  arc: 'arc diagram',
  hive: 'hive plot',
  preset: 'at given positions',
  custom: 'custom layout',
  tree: 'tree',
  radial: 'radial tree',
  dendrogram: 'dendrogram',
};

const RANKDIR: Readonly<Record<string, string>> = {
  TB: 'top to bottom',
  BT: 'bottom to top',
  LR: 'left to right',
  RL: 'right to left',
};

/** The name of node `i` in a description or an announcement: its label, else "Node i". */
export function nodeName(model: GraphModel, i: number): string {
  return accessibleText(nodeLabel(model, i)) || `Node ${i}`;
}

/** The roots and the levels of the tree a tree arrangement drew. */
function treeShape(parent: Int32Array): { roots: number; levels: number } {
  const n = parent.length;
  const depth = new Int32Array(n).fill(-1);
  let roots = 0;
  let levels = 0;
  for (let i = 0; i < n; i++) {
    if (parent[i]! < 0) roots++;
    // Up to the first ancestor whose depth is known, then back down.
    let j = i;
    let steps = 0;
    while (j >= 0 && depth[j] === -1) {
      j = parent[j]!;
      steps++;
    }
    let d = (j >= 0 ? depth[j]! : -1) + steps;
    if (d >= levels) levels = d + 1;
    for (j = i; j >= 0 && depth[j] === -1; j = parent[j]!) depth[j] = d--;
  }
  return { roots, levels };
}

/** How the graph is arranged, as the end of the first sentence. */
function arrangementText(calc: GraphCalc, trace: FullTrace): string {
  if (calc.arrangement === 'layered') {
    // A `graph3d` calc has its ranks (the planes); the 2D layout returns none.
    const planes = (calc as { planes?: { axis: number; at: ArrayLike<number> } }).planes;
    let reversed = 0;
    for (const v of calc.reversed ?? []) reversed += v;
    return (
      (planes
        ? `layered along ${'xyz'[planes.axis]} in ${countText(planes.at.length, 'rank')}`
        : `layered ${RANKDIR[String(part(trace, 'layered')['rankdir'])] ?? RANKDIR['TB']}`) +
      (reversed > 0 ? `, ${countText(reversed, 'link')} reversed to break cycles` : '')
    );
  }
  const word = ARRANGED[calc.arrangement] ?? ARRANGED['custom']!;
  if (!calc.tree) return word;
  const { roots, levels } = treeShape(calc.tree.parent);
  return `${word} with ${countText(roots, 'root')} and ${countText(levels, 'level')}`;
}

/** `A (5 links), B (3), C (2)`: the unit is said once. */
function listWithCounts(
  items: readonly number[],
  name: (i: number) => string,
  count: (i: number) => number,
  noun: string,
): string {
  return items
    .map((i, k) => {
      const text = countText(count(i), noun);
      return `${name(i)} (${k === 0 ? text : text.slice(0, text.indexOf(' '))})`;
    })
    .join(', ');
}

/** The `most` indices below `n` with the largest `count`, largest first (ties: lowest index). */
function largest(n: number, most: number, count: (i: number) => number): number[] {
  const top: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = count(i);
    if (c <= 0 || (top.length === most && c <= count(top[most - 1]!))) continue;
    let at = top.length;
    while (at > 0 && count(top[at - 1]!) < c) at--;
    top.splice(at, 0, i);
    if (top.length > most) top.pop();
  }
  return top;
}

/** The `graph` trace's description: a summary and one row per link. */
export function describeGraph(ctx: DescribeContext<GraphCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const { model } = calc;
  const n = model.nodes;
  const title = traceNameText(trace.name, ctx.index);
  const name = (i: number): string => nodeName(model, i);
  const arrows = arrowsOf(trace);
  const kind = arrows.end || arrows.start ? 'Directed network graph' : 'Network graph';
  const groups = model.groupNames.length;
  const head = [
    countText(n, 'node'),
    countText(model.links, 'link'),
    ...(groups > 0 ? [countText(groups, 'group')] : []),
    ...(n > 0 ? [arrangementText(calc, trace)] : []),
  ];
  const sentences = [`${kind} "${title}": ${head.join(', ')}.`];

  if (n > 1) {
    const { count, sizes } = connectedComponents({ link: model }, { nodes: n });
    let big = 0;
    for (const s of sizes) if (s > big) big = s;
    let alone = 0;
    for (let i = 0; i < n; i++) if (model.degree[i] === 0) alone++;
    const parts =
      count === 1
        ? 'All nodes are connected'
        : `${countText(count, 'connected component')}, the largest with ${countText(big, 'node')}` +
          (alone > 0 ? `, ${countText(alone, 'node')} without links` : '');
    const hubs = largest(n, n > SMALL ? HUBS : HUBS_SMALL, (i) => model.degree[i]!);
    sentences.push(
      hubs.length > 0
        ? `${parts}; most connected: ${listWithCounts(hubs, name, (i) => model.degree[i]!, 'link')}.`
        : `${parts}.`,
    );
  }
  if (groups > 0) {
    const size = new Int32Array(groups);
    for (let i = 0; i < n; i++) if (model.group[i]! >= 0) size[model.group[i]!]!++;
    const top = largest(groups, GROUPS, (g) => size[g]!);
    const more = groups - top.length;
    sentences.push(
      `${more > 0 ? 'Largest groups' : 'Groups'}: ${listWithCounts(
        top,
        (g) => accessibleText(model.groupNames[g]),
        (g) => size[g]!,
        'node',
      )}.`,
    );
  }
  if (model.dropped > 0) {
    sentences.push(
      `${countText(model.dropped, 'link')} left out: ${
        model.parent ? 'they close a cycle of parents' : 'an end is not a node'
      }.`,
    );
  }

  // The edge list. Tree input has neither values nor labels of links.
  const given = model.parent ? undefined : part(trace, 'link')['label'];
  const labels =
    isArrayLike(given) && typeof given !== 'string' ? (given as ArrayLike<unknown>) : undefined;
  const label = (k: number): string => accessibleText(labels?.[model.linkIndex[k]!]);
  let valued = false;
  for (let k = 0; k < model.links && !valued; k++) valued = Number.isFinite(model.value[k]);
  let labelled = false;
  if (labels) for (let k = 0; k < model.links && !labelled; k++) labelled = label(k) !== '';
  const row = (k: number): string[] => {
    const v = model.value[k]!;
    return [
      name(model.source[k]!),
      name(model.target[k]!),
      ...(valued ? [Number.isFinite(v) ? formatPlainNumber(v) : ''] : []),
      ...(labelled ? [label(k)] : []),
    ];
  };
  const rows: string[][] = [];
  for (let k = 0; k < Math.min(model.links, ctx.maxRows); k++) rows.push(row(k));
  return {
    kind: 'network graph',
    summary: sentences.join(' '),
    ...(model.links > 0
      ? {
          table: {
            caption: title,
            columns: [
              ...(model.parent ? ['Parent', 'Child'] : ['Source', 'Target']),
              ...(valued ? ['Value'] : []),
              ...(labelled ? ['Label'] : []),
            ],
            rows,
            total: model.links,
            row,
          },
        }
      : {}),
  };
}
