/**
 * `sankey` calc (plan E13.5a), after plotly.js' `sankey/calc.js` (`convertToD3Sankey`): the links
 * with a positive value between valid node indices, re-attached to their `node.groups` (links
 * inside one group dropped), the nodes some link touches (group nodes after the others), whether
 * the graph has a cycle, each link's flow (the links sharing its source and target) and its
 * concentration in it, and every layout input (`node.pad`, `thickness`, `align`, `orientation`,
 * `arrangement`, `link.arrowlen`, fixed `node.x` / `node.y`), so the laid-out graph is cached per
 * calc. Pure; `model.ts` lays it out.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { SankeyAlign } from './layout.ts';

/** One drawn node. */
export interface SankeyCalcNode {
  /**
   * Node index (Plotly's `pointNumber`): its index in the `node` arrays, or `nodeCount + g` for
   * group `g` of `node.groups`.
   */
  readonly index: number;
  readonly label: string;
  /** A combined node made by `node.groups`. */
  readonly group: boolean;
  /** Node indices merged into this group node. */
  readonly children: readonly number[];
  /** Fixed center (fractions of the domain along / across the flow), from `node.x` / `node.y`. */
  readonly fixed: readonly [number, number] | undefined;
}

/** The links sharing a source and a target (Plotly's `link.flow`). */
export interface SankeyFlow {
  /** Sum of their values. */
  readonly value: number;
  /** Link indices (`pointNumber`s). */
  readonly links: readonly number[];
}

/** One drawn link. */
export interface SankeyCalcLink {
  /** Link index (Plotly's `pointNumber`) in the `link` arrays. */
  readonly index: number;
  /** Positions in {@link SankeyCalc.nodes}. */
  readonly source: number;
  readonly target: number;
  readonly value: number;
  readonly label: string;
  /** Index in `link.colorscales` of the concentration scale for this label, or −1. */
  readonly colorscale: number;
  readonly flow: SankeyFlow;
  /** Share of the flow: this link's value, and that of the flow's links with its label. */
  readonly concentration: number;
  readonly labelConcentration: number;
}

/** Calcdata of a sankey trace. */
export interface SankeyCalc {
  readonly nodes: readonly SankeyCalcNode[];
  readonly links: readonly SankeyCalcLink[];
  /** One more than the largest node index a link names (Plotly's `node._count`). */
  readonly nodeCount: number;
  /** The graph has a cycle: circular links are drawn as loops. */
  readonly circular: boolean;
  readonly horizontal: boolean;
  readonly pad: number;
  readonly thickness: number;
  readonly align: SankeyAlign;
  readonly arrangement: 'snap' | 'perpendicular' | 'freeform' | 'fixed';
  readonly arrowlen: number;
}

const array = (v: unknown): ArrayLike<unknown> => (isArrayLike(v) ? v : []);

/** Plotly's `Lib.isIndex`: a whole number (numeric strings too) in `[0, length)`. */
function index(v: unknown, length: number): number | undefined {
  if (v === null || v === '' || typeof v === 'boolean') return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < length ? n : undefined;
}

const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

/** Plotly's truthy test of fixed positions: a non-zero finite number. */
function position(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}

/** Whether a graph has a cycle (Plotly's `circularityPresent`: a self link or a larger SCC). */
export function hasCycle(
  nodeCount: number,
  links: readonly { readonly source: number; readonly target: number }[],
): boolean {
  const out: number[][] = Array.from({ length: nodeCount }, () => []);
  for (const l of links) {
    if (l.source === l.target) return true;
    out[l.source]?.push(l.target);
  }
  // Iterative three-color depth-first search: a back edge is a cycle.
  const state = new Uint8Array(nodeCount);
  for (let s = 0; s < nodeCount; s++) {
    if (state[s]) continue;
    const stack: [number, number][] = [[s, 0]];
    state[s] = 1;
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const next = out[top[0]]![top[1]++];
      if (next === undefined) {
        state[top[0]] = 2;
        stack.pop();
      } else if (state[next] === 1) return true;
      else if (state[next] === 0) {
        state[next] = 1;
        stack.push([next, 0]);
      }
    }
  }
  return false;
}

/** Sankey calc. */
export function calcSankey(trace: FullTrace): SankeyCalc {
  const node = (trace['node'] ?? {}) as Record<string, unknown>;
  const link = (trace['link'] ?? {}) as Record<string, unknown>;
  const sources = array(link['source']);
  const targets = array(link['target']);
  const values = array(link['value']);
  const labels = array(link['label']);
  const scales = (Array.isArray(link['colorscales']) ? link['colorscales'] : []) as Record<
    string,
    unknown
  >[];

  let maxId = 0;
  for (let i = 0; i < values.length; i++) {
    const s = Number(sources[i]);
    const t = Number(targets[i]);
    if (s > maxId) maxId = s;
    if (t > maxId) maxId = t;
  }
  const nodeCount = Number.isFinite(maxId) ? Math.floor(maxId) + 1 : 0;

  // Group lookup: node index → group node index (the first group a node is in wins, as Plotly).
  const groups = (Array.isArray(node['groups']) ? node['groups'] : []) as unknown[][];
  const groupOf = new Map<number, number>();
  groups.forEach((members, g) => {
    for (const m of Array.isArray(members) ? members : []) {
      const i = index(m, Infinity);
      if (i !== undefined && !groupOf.has(i)) groupOf.set(i, nodeCount + g);
    }
  });

  const scaleOf = new Map<string, number>();
  scales.forEach((s, i) => {
    const label = text(s['label']);
    // Plotly keys the scales by label: the last one with a label wins.
    scaleOf.set(label, i);
  });

  interface RawLink {
    index: number;
    source: number;
    target: number;
    value: number;
    label: string;
  }
  const raw: RawLink[] = [];
  const linked = new Set<number>();
  for (let i = 0; i < values.length; i++) {
    const value = Number(values[i]);
    let source = index(sources[i], nodeCount);
    let target = index(targets[i], nodeCount);
    if (!(value > 0) || source === undefined || target === undefined) continue;
    const gs = groupOf.get(source);
    const gt = groupOf.get(target);
    if (gs !== undefined && gs === gt) continue;
    if (gt !== undefined) target = gt;
    if (gs !== undefined) source = gs;
    linked.add(source);
    linked.add(target);
    raw.push({ index: i, source, target, value, label: text(labels[i]) });
  }

  // Nodes some link touches, by index (group nodes come after every node).
  const nodeLabels = array(node['label']);
  const xs = array(node['x']);
  const ys = array(node['y']);
  const useFixed = xs.length > 0 && ys.length > 0;
  const members = new Map<number, number[]>();
  for (const [i, g] of groupOf) {
    if (!members.has(g)) members.set(g, []);
    members.get(g)!.push(i);
  }
  const order = [...linked].sort((a, b) => a - b);
  const slot = new Map(order.map((n, k) => [n, k]));
  const nodes = order.map((i): SankeyCalcNode => {
    const group = i >= nodeCount;
    const children = group ? (members.get(i) ?? []).sort((a, b) => a - b) : [];
    let label = text(nodeLabels[i]);
    if (group && label === '') {
      label = children
        .map((c) => text(nodeLabels[c]))
        .filter((l) => l !== '')
        .join(', ');
    }
    const fx = useFixed ? position(xs[i]) : undefined;
    const fy = useFixed ? position(ys[i]) : undefined;
    return {
      index: i,
      label,
      group,
      children,
      fixed: fx !== undefined && fy !== undefined ? [fx, fy] : undefined,
    };
  });

  // Flows: the links between one source and one target, and the label shares in them.
  const flows = new Map<string, RawLink[]>();
  for (const l of raw) {
    const key = `${l.source}:${l.target}`;
    const list = flows.get(key);
    if (list) list.push(l);
    else flows.set(key, [l]);
  }
  const links = raw.map((l): SankeyCalcLink => {
    const list = flows.get(`${l.source}:${l.target}`)!;
    let total = 0;
    let labelTotal = 0;
    for (const m of list) {
      total += m.value;
      if (m.label === l.label) labelTotal += m.value;
    }
    const scale = l.label !== '' ? scaleOf.get(l.label) : undefined;
    return {
      index: l.index,
      source: slot.get(l.source)!,
      target: slot.get(l.target)!,
      value: l.value,
      label: l.label,
      colorscale: scale ?? -1,
      flow: { value: total, links: list.map((m) => m.index) },
      concentration: l.value / total,
      labelConcentration: labelTotal / total,
    };
  });

  const arrangement = trace['arrangement'];
  return {
    nodes,
    links,
    nodeCount,
    circular: hasCycle(nodes.length, links),
    horizontal: trace['orientation'] !== 'v',
    pad: Number(node['pad'] ?? 20),
    thickness: Number(node['thickness'] ?? 20),
    align: (['left', 'right', 'center'] as const).find((a) => a === node['align']) ?? 'justify',
    arrangement:
      arrangement === 'perpendicular' || arrangement === 'freeform' || arrangement === 'fixed'
        ? arrangement
        : 'snap',
    arrowlen: Math.max(0, Number(link['arrowlen']) || 0),
  };
}
