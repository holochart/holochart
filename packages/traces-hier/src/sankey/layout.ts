/**
 * Sankey layout (plan E13.5a): a deterministic port of `@plotly/d3-sankey` 0.7 (the d3-sankey fork
 * plotly.js lays sankeys out with) and, for graphs with cycles, the loop routing of
 * `@plotly/d3-sankey-circular`. Pure: plain objects in, plain objects out, no DOM, no d3.
 *
 * Coordinates are the "flow frame": x runs along the flow (layers left to right), y across it (top
 * to bottom). A vertical sankey is laid out in this frame with the domain's height as `width` and
 * transposed by the caller.
 *
 * Steps (d3-sankey 0.7):
 * 1. node values: the larger of the in- and outflow;
 * 2. depth (longest path from a source) and height (longest path to a sink), then the layer from
 *    `align` (`justify`, `left`, `right`, `center`), spread evenly over the width;
 * 3. breadths: nodes stacked per layer at the scale `ky` that fits the fullest layer, the padding
 *    capped at 2/3 of the room per gap (the Plotly fork), then `iterations` rounds of relaxation —
 *    right to left towards the value-weighted centers of their targets, left to right towards
 *    their sources, with a decaying `alpha` — each followed by collision resolution (push down,
 *    then back up from the bottom);
 * 4. link breadths: each node's links stacked in the order of the nodes at their other end.
 *
 * Cycles (d3-sankey-circular): an edge `u → v` is circular when `v` reaches `u` through nodes with
 * an index ≥ `v` — the closing edge of every elementary cycle at its lowest node, as the library's
 * Johnson enumeration marks them — so the rest is acyclic and is laid out as above. Circular links
 * alternate below / above the diagram (`circularType`, shared by the links of a node), room is
 * reserved for them around the node area, and each gets a route ({@link CircularPath}): out of the
 * source's right side, around a corner, along a lane beyond the nodes, around the target's column
 * and into its left side. Lanes of overlapping loops stack outwards, shortest spans innermost; the
 * corner radii of the loops of one column nest the same way.
 */

export type SankeyAlign = 'justify' | 'left' | 'right' | 'center';

/** A link between two node indices. */
export interface SankeyLinkInput {
  readonly source: number;
  readonly target: number;
  readonly value: number;
}

export interface SankeyLayoutOptions {
  /** Extent along the flow (px). */
  readonly width: number;
  /** Extent across the flow (px). */
  readonly height: number;
  /** Node thickness along the flow (Plotly `node.thickness`). */
  readonly nodeWidth: number;
  /** Space between the nodes of a layer (Plotly `node.pad`); reduced when it does not fit. */
  readonly nodePadding: number;
  /** Default `'justify'`. */
  readonly align?: SankeyAlign;
  /** Relaxation rounds (Plotly: 50). Default 50. */
  readonly iterations?: number;
}

export interface SankeyNode {
  /** Index in {@link SankeyGraph.nodes} (the caller's node order). */
  readonly index: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** The larger of the in- and outflow. */
  value: number;
  /** Longest path from a source (circular links left out). */
  depth: number;
  /** Longest path to a sink (circular links left out). */
  height: number;
  /** Column, 0 = leftmost. */
  layer: number;
  /** Outgoing links, top to bottom after {@link updateSankey}. */
  readonly sourceLinks: SankeyLink[];
  /** Incoming links, top to bottom after {@link updateSankey}. */
  readonly targetLinks: SankeyLink[];
}

export type CircularType = 'top' | 'bottom';

/**
 * The route of a circular link's center line: from (`sourceX`, `sourceY`) right to `rightX`, around
 * a corner of radius `rSource` to the lane at `extent`, along it to `leftX`, around a corner of
 * radius `rTarget` and right into (`targetX`, `targetY`). d3-sankey-circular's `circularPathData`.
 */
export interface CircularPath {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly rightX: number;
  readonly leftX: number;
  readonly rSource: number;
  readonly rTarget: number;
  /** y of the lane (below the nodes for `bottom` links, above for `top`). */
  readonly extent: number;
}

export interface SankeyLink {
  /** Index in {@link SankeyGraph.links} (the caller's link order). */
  readonly index: number;
  readonly source: SankeyNode;
  readonly target: SankeyNode;
  readonly value: number;
  /** Breadth: `value × ky`. */
  width: number;
  /** Center across the flow where the link leaves its source / enters its target. */
  y0: number;
  y1: number;
  /** Closes a cycle: drawn as a loop around the diagram. */
  readonly circular: boolean;
  circularType: CircularType | undefined;
  /** The loop route of a circular link (after {@link updateSankey}). */
  path: CircularPath | undefined;
}

export interface SankeyGraph {
  readonly nodes: SankeyNode[];
  readonly links: SankeyLink[];
  /** Number of layers (max depth + 1). */
  readonly layers: number;
  /** Node padding used (≤ the requested one). */
  readonly padding: number;
  /** Px per unit of value. */
  readonly ky: number;
  /** The area nodes are laid out in: the whole size, minus the room reserved for loops. */
  readonly extent: {
    readonly x0: number;
    readonly x1: number;
    readonly y0: number;
    readonly y1: number;
  };
  readonly width: number;
  readonly height: number;
  /** Some link is circular. */
  readonly circular: boolean;
}

/** d3-sankey-circular's constants (Plotly sets `circularLinkGap` to 0). */
export const BASE_RADIUS = 10;
export const NODE_BUFFER = 5;
export const VERTICAL_MARGIN = 25;
export const CIRCULAR_GAP = 0;

/**
 * Which links close a cycle (see the module comment): self links, and `u → v` when `v` reaches `u`
 * through nodes with indices ≥ `v`. Removing them leaves an acyclic graph.
 */
export function circularLinks(nodeCount: number, links: readonly SankeyLinkInput[]): boolean[] {
  const out: number[][] = Array.from({ length: nodeCount }, () => []);
  for (const l of links) out[l.source]?.push(l.target);
  const reaches = (from: number, to: number, min: number): boolean => {
    const seen = new Uint8Array(nodeCount);
    const stack = [from];
    seen[from] = 1;
    while (stack.length > 0) {
      const u = stack.pop()!;
      if (u === to) return true;
      for (const v of out[u]!) {
        if (v < min || seen[v]) continue;
        seen[v] = 1;
        stack.push(v);
      }
    }
    return false;
  };
  const memo = new Map<number, boolean>();
  return links.map((l) => {
    if (l.source === l.target) return true;
    if (l.source < l.target) return false;
    const key = l.source * nodeCount + l.target;
    let hit = memo.get(key);
    if (hit === undefined) memo.set(key, (hit = reaches(l.target, l.source, l.target)));
    return hit;
  });
}

/** Node column from its depth / height (d3-sankey's `sankeyJustify`, …), before clamping. */
function alignOf(align: SankeyAlign, node: SankeyNode, layers: number): number {
  switch (align) {
    case 'left':
      return node.depth;
    case 'right':
      return layers - 1 - node.height;
    case 'center': {
      if (node.targetLinks.length > 0) return node.depth;
      if (node.sourceLinks.length === 0) return 0;
      let min = Infinity;
      for (const l of node.sourceLinks) min = Math.min(min, l.target.depth);
      return min - 1;
    }
    default:
      return node.sourceLinks.length > 0 ? node.depth : layers - 1;
  }
}

/** Longest paths along `next` (d3-sankey's breadth-first relabelling); returns the pass count. */
function longestPaths(
  nodes: readonly SankeyNode[],
  next: (n: SankeyNode) => Iterable<SankeyNode>,
  set: (n: SankeyNode, v: number) => void,
): number {
  let current: SankeyNode[] = [...nodes];
  let x = 0;
  while (current.length > 0 && x <= nodes.length) {
    const seen = new Set<SankeyNode>();
    const following: SankeyNode[] = [];
    for (const node of current) {
      set(node, x);
      for (const m of next(node)) {
        if (seen.has(m)) continue;
        seen.add(m);
        following.push(m);
      }
    }
    current = following;
    x++;
  }
  return x;
}

function* targetsOf(node: SankeyNode): Iterable<SankeyNode> {
  for (const l of node.sourceLinks) if (!l.circular) yield l.target;
}

function* sourcesOf(node: SankeyNode): Iterable<SankeyNode> {
  for (const l of node.targetLinks) if (!l.circular) yield l.source;
}

const center = (n: SankeyNode): number => (n.y0 + n.y1) / 2;

/** Push overlapping nodes of a layer down, then back up from the bottom (d3-sankey 0.7). */
export function resolveCollisions(
  column: SankeyNode[],
  y0: number,
  y1: number,
  padding: number,
): void {
  const n = column.length;
  if (n === 0) return;
  column.sort((a, b) => a.y0 - b.y0);
  let y = y0;
  for (const node of column) {
    const dy = y - node.y0;
    if (dy > 0) {
      node.y0 += dy;
      node.y1 += dy;
    }
    y = node.y1 + padding;
  }
  let dy = y - padding - y1;
  if (dy > 0) {
    const last = column[n - 1]!;
    last.y0 -= dy;
    last.y1 -= dy;
    y = last.y0;
    for (let i = n - 2; i >= 0; i--) {
      const node = column[i]!;
      dy = node.y1 + padding - y;
      if (dy > 0) {
        node.y0 -= dy;
        node.y1 -= dy;
      }
      y = node.y0;
    }
  }
}

/** Assign circular links to the bottom or top (d3-sankey-circular's `selectCircularLinkTypes`). */
function selectCircularTypes(links: readonly SankeyLink[]): void {
  const nodeType = new Map<SankeyNode, CircularType>();
  let tops = 0;
  let bottoms = 0;
  for (const link of links) {
    if (!link.circular) continue;
    const known = nodeType.get(link.source) ?? nodeType.get(link.target);
    const type: CircularType = known ?? (tops < bottoms ? 'top' : 'bottom');
    link.circularType = type;
    if (type === 'top') tops++;
    else bottoms++;
    nodeType.set(link.source, type);
    nodeType.set(link.target, type);
  }
  for (const link of links) {
    if (!link.circular) continue;
    const s = nodeType.get(link.source);
    if (s !== undefined && (s === nodeType.get(link.target) || link.source === link.target)) {
      link.circularType = s;
    }
  }
}

/**
 * Lay out a sankey (see the module comment). `links` refer to node indices `0 … nodeCount − 1`;
 * links whose value is not positive, or whose ends are not nodes, must be filtered by the caller.
 */
export function sankeyLayout(
  nodeCount: number,
  input: readonly SankeyLinkInput[],
  options: SankeyLayoutOptions,
): SankeyGraph {
  const W = Math.max(0, options.width);
  const H = Math.max(0, options.height);
  const dx = options.nodeWidth;
  const align = options.align ?? 'justify';
  const iterations = options.iterations ?? 50;
  const marks = circularLinks(nodeCount, input);

  const nodes: SankeyNode[] = Array.from({ length: nodeCount }, (_, index) => ({
    index,
    x0: 0,
    x1: 0,
    y0: 0,
    y1: 0,
    value: 0,
    depth: 0,
    height: 0,
    layer: 0,
    sourceLinks: [],
    targetLinks: [],
  }));
  const links: SankeyLink[] = input.map((l, index) => {
    const link: SankeyLink = {
      index,
      source: nodes[l.source]!,
      target: nodes[l.target]!,
      value: l.value,
      width: 0,
      y0: 0,
      y1: 0,
      circular: marks[index]!,
      circularType: undefined,
      path: undefined,
    };
    link.source.sourceLinks.push(link);
    link.target.targetLinks.push(link);
    return link;
  });
  const circular = links.some((l) => l.circular);

  // 1. Values.
  for (const node of nodes) {
    let out = 0;
    let into = 0;
    for (const l of node.sourceLinks) out += l.value;
    for (const l of node.targetLinks) into += l.value;
    node.value = Math.max(out, into);
  }

  // 2. Depths, heights and layers.
  const layers = Math.max(
    1,
    longestPaths(nodes, targetsOf, (n, v) => (n.depth = v)),
  );
  longestPaths(nodes, sourcesOf, (n, v) => (n.height = v));
  for (const node of nodes) {
    node.layer = Math.max(0, Math.min(layers - 1, Math.floor(alignOf(align, node, layers))));
  }
  if (circular) selectCircularTypes(links);

  const columns: SankeyNode[][] = [];
  for (const node of nodes) (columns[node.layer] ??= []).push(node);
  const filled = columns.filter((c): c is SankeyNode[] => c !== undefined);

  // 3. Breadths: padding, scale and the room loops need.
  let py = options.nodePadding;
  const most = filled.reduce((m, c) => Math.max(m, c.length), 0);
  if (most > 1) py = Math.min(py, ((2 / 3) * H) / (most - 1));
  let topValue = 0;
  let bottomValue = 0;
  let leftValue = 0;
  let rightValue = 0;
  for (const l of links) {
    if (!l.circular) continue;
    if (l.circularType === 'top') topValue += l.value;
    else bottomValue += l.value;
    if (l.target.layer === 0) leftValue += l.value;
    if (l.source.layer === layers - 1) rightValue += l.value;
  }
  const room = (v: number): number => (v > 0 ? VERTICAL_MARGIN + BASE_RADIUS : 0);
  let ky = Infinity;
  for (const column of filled) {
    let sum = 0;
    for (const n of column) sum += n.value;
    const k =
      (H - room(topValue) - room(bottomValue) - (column.length - 1) * py) /
      (sum + topValue + bottomValue);
    ky = Math.min(ky, k);
  }
  if (!Number.isFinite(ky) || ky < 0) ky = 0;
  let y0 = topValue * ky + room(topValue);
  let y1 = H - bottomValue * ky - room(bottomValue);
  if (!(y1 > y0)) [y0, y1] = [0, H];
  let x0 = leftValue * ky + room(leftValue);
  let x1 = W - rightValue * ky - room(rightValue);
  if (!(x1 - x0 >= dx)) [x0, x1] = [0, W];
  const kx = layers > 1 ? (x1 - x0 - dx) / (layers - 1) : 0;
  for (const node of nodes) {
    node.x0 = x0 + node.layer * kx;
    node.x1 = node.x0 + dx;
  }
  for (const column of filled) {
    column.forEach((node, i) => {
      node.y0 = y0 + i;
      node.y1 = node.y0 + node.value * ky;
    });
  }
  for (const l of links) l.width = l.value * ky;

  const resolve = (): void => {
    for (const column of filled) resolveCollisions(column, y0, y1, py);
  };
  const relax = (column: SankeyNode[], alpha: number, forward: boolean): void => {
    for (const node of column) {
      let weighted = 0;
      let sum = 0;
      for (const l of forward ? node.targetLinks : node.sourceLinks) {
        if (l.circular) continue;
        weighted += center(forward ? l.source : l.target) * l.value;
        sum += l.value;
      }
      if (!(sum > 0)) continue;
      const dy = (weighted / sum - center(node)) * alpha;
      node.y0 += dy;
      node.y1 += dy;
    }
  };
  resolve();
  let alpha = 1;
  for (let i = 0; i < iterations; i++) {
    alpha *= 0.99;
    for (let c = filled.length - 1; c >= 0; c--) relax(filled[c]!, alpha, false);
    resolve();
    for (const column of filled) relax(column, alpha, true);
    resolve();
  }

  const graph: SankeyGraph = {
    nodes,
    links,
    layers,
    padding: py,
    ky,
    extent: { x0, x1, y0, y1 },
    width: W,
    height: H,
    circular,
  };
  updateSankey(graph);
  return graph;
}

/** Order group of a link at a node: top loops first, then plain links, then bottom loops. */
const group = (l: SankeyLink): number => (!l.circular ? 1 : l.circularType === 'top' ? 0 : 2);

/** Layers a loop spans back (0 for a self link). */
const span = (l: SankeyLink): number => l.source.layer - l.target.layer;

/**
 * Recompute link breadths (and loop routes) after nodes moved: d3-sankey's `sankey.update`. Each
 * node's links are stacked top to bottom — top loops (longest first), plain links in the order of
 * the nodes at their other end, bottom loops (longest first, so the shortest hug the node).
 */
export function updateSankey(graph: SankeyGraph): void {
  const bySource = (a: SankeyLink, b: SankeyLink): number =>
    group(a) - group(b) ||
    (a.circular ? span(b) - span(a) || a.index - b.index : a.target.y0 - b.target.y0);
  const byTarget = (a: SankeyLink, b: SankeyLink): number =>
    group(a) - group(b) ||
    (a.circular ? span(b) - span(a) || a.index - b.index : a.source.y0 - b.source.y0);
  for (const node of graph.nodes) {
    node.sourceLinks.sort(bySource);
    node.targetLinks.sort(byTarget);
    let y0 = node.y0;
    let y1 = node.y0;
    for (const l of node.sourceLinks) {
      l.y0 = y0 + l.width / 2;
      y0 += l.width;
    }
    for (const l of node.targetLinks) {
      l.y1 = y1 + l.width / 2;
      y1 += l.width;
    }
  }
  if (graph.circular) routeCircularLinks(graph);
}

/** Only circular link at both its ends (d3-sankey-circular's `onlyCircularLink`). */
function onlyCircular(l: SankeyLink): boolean {
  let s = 0;
  let t = 0;
  for (const m of l.source.sourceLinks) if (m.circular) s++;
  for (const m of l.target.targetLinks) if (m.circular) t++;
  return s <= 1 && t <= 1;
}

/** Two loops whose layer spans overlap (their lanes must stack). */
function loopsCross(a: SankeyLink, b: SankeyLink): boolean {
  return !(a.source.layer < b.target.layer || a.target.layer > b.source.layer);
}

/** Loop routes (d3-sankey-circular's `addCircularPathData`, see {@link CircularPath}). */
function routeCircularLinks(graph: SankeyGraph): void {
  const loops = graph.links.filter((l) => l.circular);
  const buffers = new Map<SankeyLink, number>();
  for (const type of ['bottom', 'top'] as const) {
    const sign = type === 'bottom' ? 1 : -1;
    // Shortest spans first (innermost lanes), then by where they leave their source.
    const list = loops
      .filter((l) => l.circularType === type)
      .sort((a, b) => span(a) - span(b) || sign * (b.y0 - a.y0) || a.index - b.index);
    list.forEach((l, i) => {
      let buffer = 0;
      if (!(l.source === l.target && onlyCircular(l))) {
        for (let j = 0; j < i; j++) {
          const m = list[j]!;
          if (loopsCross(l, m))
            buffer = Math.max(buffer, buffers.get(m)! + m.width / 2 + CIRCULAR_GAP);
        }
      }
      buffers.set(l, buffer + l.width / 2);
    });
  }
  const radius = (l: SankeyLink, side: 'source' | 'target'): number => {
    const sign = l.circularType === 'bottom' ? 1 : -1;
    const layer = side === 'source' ? l.source.layer : l.target.layer;
    const at = (m: SankeyLink): number => (side === 'source' ? m.y0 : m.y1);
    const same = loops
      .filter(
        (m) =>
          m.circularType === l.circularType &&
          (side === 'source' ? m.source.layer : m.target.layer) === layer,
      )
      .sort((a, b) => sign * (at(b) - at(a)) || a.index - b.index);
    let offset = 0;
    for (const m of same) {
      if (m === l) break;
      offset += m.width + CIRCULAR_GAP;
    }
    return BASE_RADIUS + l.width / 2 + offset;
  };
  const { y0, y1 } = graph.extent;
  for (const l of loops) {
    const bottom = l.circularType !== 'top';
    const buffer = buffers.get(l)!;
    let rSource: number;
    let rTarget: number;
    let extent: number;
    if (l.source === l.target && onlyCircular(l)) {
      rSource = rTarget = BASE_RADIUS + l.width / 2;
      extent = bottom
        ? l.source.y1 + VERTICAL_MARGIN + buffer
        : l.source.y0 - VERTICAL_MARGIN - buffer;
    } else {
      rSource = radius(l, 'source');
      rTarget = radius(l, 'target');
      extent = bottom
        ? Math.max(y1, l.source.y1, l.target.y1) + VERTICAL_MARGIN + buffer
        : Math.min(y0, l.source.y0, l.target.y0) - VERTICAL_MARGIN - buffer;
    }
    const sourceX = l.source.x1;
    const targetX = l.target.x0;
    l.path = {
      sourceX,
      sourceY: l.y0,
      targetX,
      targetY: l.y1,
      rightX: sourceX + NODE_BUFFER + rSource,
      leftX: targetX - NODE_BUFFER - rTarget,
      rSource,
      rTarget,
      extent,
    };
  }
}

/**
 * A deep copy of a laid-out graph (nodes and links re-linked), so a drag can move nodes without
 * touching the cached layout.
 */
export function cloneGraph(graph: SankeyGraph): SankeyGraph {
  const nodes: SankeyNode[] = graph.nodes.map((n) => ({
    ...n,
    sourceLinks: [],
    targetLinks: [],
  }));
  const links: SankeyLink[] = graph.links.map((l) => ({
    ...l,
    source: nodes[l.source.index]!,
    target: nodes[l.target.index]!,
  }));
  graph.nodes.forEach((n, i) => {
    const copy = nodes[i]!;
    for (const l of n.sourceLinks) copy.sourceLinks.push(links[l.index]!);
    for (const l of n.targetLinks) copy.targetLinks.push(links[l.index]!);
  });
  return { ...graph, nodes, links };
}
