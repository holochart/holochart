/**
 * `chord` calc (backlog G8, ADR-029): the nodes and links of the trace, and the ring they lay out
 * to (`layout.ts`). Angles do not depend on the size of the chart, so the laid-out ring is part
 * of the calc record; `model.ts` puts it on screen.
 *
 * ## Nodes
 *
 * With `node` / `link` input the node count is the length of the longest per-node array
 * (`node.label`, `group`, `customdata`, and `color` when it is an array), as for `graph`; without
 * any of them it is one more than the largest index a link names, as for sankey. With `matrix`
 * input it is the size of the matrix.
 *
 * ## Links
 *
 * A link is kept when both its ends are node indices (whole numbers in range; numeric strings
 * count) and its value is a positive number; without `link.value` every link is worth 1. The
 * others are dropped and counted (`dropped`), and so are negative and non-numeric cells of a
 * matrix. A self-link is kept: it is drawn as a hill on its node's arc.
 *
 * ## Hidden through the legend
 *
 * The legend lists the groups when `node.group` is given, else the nodes. An item whose name is
 * in `layout.hiddenlabels` is hidden: its nodes get no arc and their links no ribbon, and the
 * rest of the ring closes up, as a pie does without a hidden slice.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import {
  chordLayout,
  matrixLinks,
  matrixSize,
  type ChordLayout,
  type ChordLinkSort,
  type ChordNodeSort,
} from './layout.ts';

/** One kept link. */
export interface ChordCalcLink {
  /**
   * The link's index in the trace (`pointNumber`): in the `link` arrays, or the flat index
   * `i · n + j` of the matrix cell it came from.
   */
  readonly index: number;
  /** Node indices. */
  readonly source: number;
  readonly target: number;
  /** Flow from the source to the target. */
  readonly value: number;
  /** Flow back, for a pair of matrix cells drawn as one ribbon (`directed: false`); else 0. */
  readonly reverse: number;
  /** One ribbon for both directions of a pair of matrix cells: `reverse` wide at its target. */
  readonly pair: boolean;
  readonly label: string;
}

/** Calcdata of a chord trace. @experimental */
export interface ChordCalc {
  /** Number of nodes. */
  readonly nodes: number;
  /** Label of every node (`''` for none) and the name it goes by in the legend and in text. */
  readonly labels: readonly string[];
  readonly names: readonly string[];
  /** Group index of every node, −1 for none, and the groups' names by index. */
  readonly group: Int32Array;
  readonly groupNames: readonly string[];
  readonly links: readonly ChordCalcLink[];
  /** Links and matrix cells left out (see the module comment). */
  readonly dropped: number;
  /** The flows came from `matrix`. */
  readonly matrix: boolean;
  readonly directed: boolean;
  /** 1 where the node is hidden through the legend, and the hidden group indices. */
  readonly hidden: Uint8Array;
  readonly hiddenGroups: ReadonlySet<number>;
  /** The ring. Its ribbons name links by their position in {@link links}. */
  readonly layout: ChordLayout;
  /** Sum of the flows of the links that are drawn (both directions of a pair). */
  readonly total: number;
}

type Container = Readonly<Record<string, unknown>>;

function container(trace: Container, key: string): Container {
  const v = trace[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Container) : {};
}

function arrayOf(v: unknown): ArrayLike<unknown> | undefined {
  return isArrayLike(v) && typeof v !== 'string' ? (v as ArrayLike<unknown>) : undefined;
}

/** A node index: a whole number ≥ 0, or a numeric string of one. −1 otherwise. */
function nodeIndex(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : -1;
}

const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

/** A group name: set unless empty (`0` is a name). */
function groupKey(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'
    ? String(v)
    : undefined;
}

/** Whether the trace gives its flows as `node` / `link` (else as `matrix`). */
export function isLinkInput(trace: Container): boolean {
  const link = container(trace, 'link');
  const s = arrayOf(link['source']);
  const t = arrayOf(link['target']);
  return s !== undefined && t !== undefined && s.length > 0 && t.length > 0;
}

/** The per-node arrays that set the node count of `node` / `link` input. */
const NODE_ARRAYS = ['label', 'group', 'customdata', 'color'] as const;

/** The number of nodes of a trace (see the module comment). */
export function chordNodeCount(trace: Container): number {
  if (!isLinkInput(trace)) return matrixSize(trace['matrix']);
  const node = container(trace, 'node');
  let count = 0;
  for (const key of NODE_ARRAYS) count = Math.max(count, arrayOf(node[key])?.length ?? 0);
  if (count > 0) return count;
  const link = container(trace, 'link');
  const s = arrayOf(link['source'])!;
  const t = arrayOf(link['target'])!;
  let max = -1;
  for (let k = 0; k < Math.min(s.length, t.length); k++) {
    const a = nodeIndex(s[k]);
    const b = nodeIndex(t[k]);
    if (a >= 0 && b >= 0) max = Math.max(max, a, b);
  }
  return max + 1;
}

/** The kept links of `node` / `link` input, and how many were dropped. */
function linksOf(trace: Container, nodes: number): { links: ChordCalcLink[]; dropped: number } {
  const link = container(trace, 'link');
  const sources = arrayOf(link['source'])!;
  const targets = arrayOf(link['target'])!;
  const values = arrayOf(link['value']);
  const labels = arrayOf(link['label']);
  const count = Math.max(sources.length, targets.length);
  const links: ChordCalcLink[] = [];
  let dropped = 0;
  for (let k = 0; k < count; k++) {
    const source = nodeIndex(sources[k]);
    const target = nodeIndex(targets[k]);
    const raw = values ? values[k] : 1;
    const value =
      typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? +raw : NaN;
    const ends = source >= 0 && target >= 0 && source < nodes && target < nodes;
    if (!ends || !(value > 0) || !Number.isFinite(value)) {
      dropped++;
      continue;
    }
    links.push({
      index: k,
      source,
      target,
      value,
      reverse: 0,
      pair: false,
      label: text(labels?.[k]),
    });
  }
  return { links, dropped };
}

/** The links of `matrix` input. */
function matrixLinksOf(
  trace: Container,
  directed: boolean,
): { links: ChordCalcLink[]; dropped: number } {
  const m = matrixLinks(trace['matrix'], directed);
  const labels = arrayOf(container(trace, 'link')['label']);
  const links = m.source.map((source, k): ChordCalcLink => ({
    index: m.cell[k]!,
    source,
    target: m.target[k]!,
    value: m.value[k]!,
    reverse: directed || source === m.target[k] ? 0 : m.targetValue[k]!,
    pair: !directed && source !== m.target[k],
    label: text(labels?.[m.cell[k]!]),
  }));
  return { links, dropped: m.dropped };
}

const radians = (degrees: unknown, dflt: number): number =>
  ((typeof degrees === 'number' && Number.isFinite(degrees) ? degrees : dflt) * Math.PI) / 180;

/** Chord calc. */
export function calcChord(trace: FullTrace, ctx: Pick<CalcContext, 'fullLayout'>): ChordCalc {
  const node = container(trace, 'node');
  const link = container(trace, 'link');
  const directed = trace['directed'] !== false;
  const fromLinks = isLinkInput(trace);
  const nodes = chordNodeCount(trace);
  const { links, dropped } = fromLinks ? linksOf(trace, nodes) : matrixLinksOf(trace, directed);

  const given = arrayOf(node['label']) ?? arrayOf(trace['labels']);
  const labels = Array.from({ length: nodes }, (_, i) => text(given?.[i]));
  const names = labels.map((l, i) => (l === '' ? `Node ${i}` : l));

  // Groups, in order of first appearance.
  const group = new Int32Array(nodes).fill(-1);
  const groupNames: string[] = [];
  const groups = arrayOf(node['group']);
  if (groups) {
    const index = new Map<string, number>();
    for (let i = 0; i < Math.min(nodes, groups.length); i++) {
      const key = groupKey(groups[i]);
      if (key === undefined) continue;
      let g = index.get(key);
      if (g === undefined) {
        index.set(key, (g = groupNames.length));
        groupNames.push(key);
      }
      group[i] = g;
    }
  }

  // What the legend hid: groups when there are any, else nodes.
  const hidden = new Uint8Array(nodes);
  const hiddenGroups = new Set<number>();
  const hiddenlabels = arrayOf(ctx.fullLayout['hiddenlabels']);
  if (hiddenlabels && hiddenlabels.length > 0) {
    const off = new Set(Array.from(hiddenlabels, String));
    if (groupNames.length > 0) {
      groupNames.forEach((name, g) => off.has(name) && hiddenGroups.add(g));
      for (let i = 0; i < nodes; i++) if (hiddenGroups.has(group[i]!)) hidden[i] = 1;
    } else {
      for (let i = 0; i < nodes; i++) if (off.has(names[i]!)) hidden[i] = 1;
    }
  }

  // Links of hidden nodes are laid out with no width, so they get no ribbon.
  const count = links.length;
  const source = new Int32Array(count);
  const target = new Int32Array(count);
  const value = new Float64Array(count);
  const targetValue = new Float64Array(count);
  let total = 0;
  links.forEach((l, k) => {
    source[k] = l.source;
    target[k] = l.target;
    if (hidden[l.source] === 1 || hidden[l.target] === 1) return;
    value[k] = l.value;
    targetValue[k] = l.pair ? l.reverse : l.value;
    total += l.value + l.reverse;
  });

  const sort = trace['sort'];
  const linkSort = link['sort'];
  const pad = radians(trace['padangle'], 0);
  const layout = chordLayout(
    {
      nodes,
      source,
      target,
      value,
      targetValue,
      ...(groupNames.length > 0 ? { group, groupNames } : {}),
    },
    {
      padAngle: pad,
      groupPadAngle: radians(container(trace, 'groups')['padangle'], (pad * 180) / Math.PI),
      rotation: radians(trace['rotation'], 0),
      clockwise: trace['direction'] !== 'counterclockwise',
      sort: sort === 'value' || sort === 'group' ? (sort satisfies ChordNodeSort) : 'input',
      linkSort:
        linkSort === 'value' || linkSort === 'input'
          ? (linkSort satisfies ChordLinkSort)
          : 'position',
    },
  );

  return {
    nodes,
    labels,
    names,
    group,
    groupNames,
    links,
    dropped,
    matrix: !fromLinks,
    directed,
    hidden,
    hiddenGroups,
    layout,
    total,
  };
}
