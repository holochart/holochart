/**
 * Chord layout (backlog G8, ADR-029), in the manner of d3-chord but our own code: nodes become
 * arcs of a ring, as wide as the links that end on them, and every link becomes a ribbon between
 * a span of its source's arc and a span of its target's. Pure: numbers in, angles out, no time and
 * no randomness, so the same input gives the same ring in a test, on a server and on screen.
 *
 * ## Widths
 *
 * A link takes `value` of its source's arc and, at the other end, `targetValue` of its target's
 * arc (`value` again when there is none): a band as wide at both ends. An arc is as wide as the
 * ends on it, so a node's share of the ring is its outgoing plus its incoming flow. A self-link
 * takes one span of its node's arc (its `value`, once), where it is drawn as a hill. Links whose
 * ends are not nodes, or that have no positive width, get no ribbon.
 *
 * {@link matrixLinks} turns a square matrix into links both ways d3 does. Directed
 * (`chordDirected`): one link per positive cell, `matrix[i][j]` wide at both ends. Undirected
 * (`chord`): one link per pair of nodes, `matrix[i][j]` wide at `i` and `matrix[j][i]` wide at
 * `j`, so a symmetric matrix gives symmetric bands and each arc is its row's sum.
 *
 * ## Order
 *
 * Arcs follow each other in `sort` order from `rotation`, clockwise or counterclockwise, with
 * `padAngle` between them. With groups, the nodes of a group are next to each other whatever the
 * sort (a node without a group is a block of its own), `groupPadAngle` separates the blocks, and
 * every group gets a group arc from its first node's start to its last node's end.
 *
 * Within an arc the ends are ordered by `linkSort`. `'position'` (the default) orders them by
 * where their other end is, going around the ring against its direction from the arc itself: the
 * ribbon to the next arc leaves from the side that faces it, which is the order with the fewest
 * crossings. Links between the same two nodes are nested, not crossed.
 *
 * ## Angles
 *
 * Radians clockwise from 12 o'clock, pie's convention: the point at angle `a` and radius `r`
 * around `(cx, cy)` is `(cx + r·sin a, cy − r·cos a)` in y-down px. A span runs from its `start`
 * to its `end` in the ring's direction, so `end < start` on a counterclockwise ring.
 */

const TAU = Math.PI * 2;

/** Padding may take at most this share of the ring; more is scaled down. */
export const MAX_PAD_SHARE = 0.5;

/** The order of the arcs around the ring. */
export type ChordNodeSort = 'input' | 'value' | 'group';
/** The order of the link ends within an arc. */
export type ChordLinkSort = 'position' | 'value' | 'input';

/** What {@link chordLayout} lays out. */
export interface ChordLayoutInput {
  /** Number of nodes; link ends are indices below it. */
  readonly nodes: number;
  readonly source: ArrayLike<number>;
  readonly target: ArrayLike<number>;
  /** Width of every link at its source end, in the data's units. */
  readonly value: ArrayLike<number>;
  /** Width of every link at its target end; `value` when left out. */
  readonly targetValue?: ArrayLike<number> | undefined;
  /** Group index of every node, −1 (or anything negative) for none. */
  readonly group?: ArrayLike<number> | undefined;
  /** Group names by index, which `sort: 'group'` orders the groups by. */
  readonly groupNames?: readonly string[] | undefined;
}

export interface ChordLayoutOptions {
  /** Radians between neighbouring arcs. Default 0. */
  readonly padAngle?: number;
  /** Radians between neighbouring blocks (groups, nodes without one). Default `padAngle`. */
  readonly groupPadAngle?: number;
  /** Where the first arc starts: radians clockwise from 12 o'clock. Default 0. */
  readonly rotation?: number;
  /** Arcs follow each other clockwise (the default) or counterclockwise. */
  readonly clockwise?: boolean;
  /**
   * `'input'`: by node index. `'value'`: widest first. `'group'`: groups by name, nodes by index.
   * With groups, `'input'` orders the groups by their first node and `'value'` by their width.
   */
  readonly sort?: ChordNodeSort;
  /** See the module comment. `'value'`: widest first; `'input'`: by link index. */
  readonly linkSort?: ChordLinkSort;
}

/** The arc of one node. */
export interface ChordArc {
  /** Node index. */
  readonly node: number;
  readonly start: number;
  readonly end: number;
  /** Width in the data's units: the link ends on the arc. */
  readonly value: number;
  /** Flow out of and into the node (a self-link counts in both, and once in `value`). */
  readonly out: number;
  readonly in: number;
}

/** The arc of one group, around the arcs of its nodes. */
export interface ChordGroupArc {
  /** Group index. */
  readonly group: number;
  readonly start: number;
  readonly end: number;
  /** Sum of its nodes' widths. */
  readonly value: number;
  /** Its nodes, in ring order. */
  readonly nodes: readonly number[];
}

/** The ribbon of one link: a span of its source's arc and a span of its target's. */
export interface ChordRibbon {
  /** Index of the link in the input. */
  readonly link: number;
  readonly source: number;
  readonly target: number;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  /** A self-link has one span: its target span is its source span. */
  readonly targetStart: number;
  readonly targetEnd: number;
  readonly self: boolean;
}

export interface ChordLayout {
  /** The arcs in ring order; nodes without links have none. */
  readonly arcs: readonly ChordArc[];
  /** Position in {@link arcs} of every node, −1 for a node without an arc. */
  readonly arcOf: Int32Array;
  /** Group arcs in ring order; empty without groups. */
  readonly groups: readonly ChordGroupArc[];
  /** One ribbon per link that has one, in link order. */
  readonly ribbons: readonly ChordRibbon[];
  /** Sum of the arcs' widths, in the data's units. */
  readonly total: number;
  /** Radians per unit of width. */
  readonly scale: number;
  /** +1 clockwise, −1 counterclockwise. */
  readonly direction: 1 | -1;
}

/** Links of a square matrix, for {@link chordLayout}. */
export interface MatrixLinks {
  readonly source: number[];
  readonly target: number[];
  readonly value: number[];
  /** Width at the target end: `matrix[j][i]` of an undirected pair, else `value`. */
  readonly targetValue: number[];
  /** Flat cell index (`i · n + j`) each link came from. */
  readonly cell: number[];
  /** Cells left out because their value is negative or not a number. */
  readonly dropped: number;
}

function isList(v: unknown): v is ArrayLike<unknown> {
  return Array.isArray(v) || ArrayBuffer.isView(v);
}

/** A matrix cell as a width: a finite number ≥ 0, `NaN` for anything else that is given. */
function cell(matrix: ArrayLike<unknown>, i: number, j: number): number {
  const row = matrix[i];
  const v = isList(row) ? row[j] : undefined;
  if (v === undefined || v === null || v === '') return 0;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/** The number of nodes of a matrix: its row count, or its longest row when that is larger. */
export function matrixSize(matrix: unknown): number {
  if (!isList(matrix)) return 0;
  let n = matrix.length;
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    if (isList(row) && row.length > n) n = row.length;
  }
  return n;
}

/**
 * The links of a square matrix (`matrix[i][j]`: flow from `i` to `j`), see the module comment.
 * Missing cells are 0; negative and non-numeric ones are dropped and counted.
 */
export function matrixLinks(matrix: unknown, directed = true): MatrixLinks {
  const out: MatrixLinks & { dropped: number } = {
    source: [],
    target: [],
    value: [],
    targetValue: [],
    cell: [],
    dropped: 0,
  };
  const n = matrixSize(matrix);
  if (n === 0) return out;
  const m = matrix as ArrayLike<unknown>;
  const add = (i: number, j: number, value: number, targetValue: number): void => {
    out.source.push(i);
    out.target.push(j);
    out.value.push(value);
    out.targetValue.push(targetValue);
    out.cell.push(i * n + j);
  };
  for (let i = 0; i < n; i++) {
    for (let j = directed ? 0 : i; j < n; j++) {
      let forward = cell(m, i, j);
      if (Number.isNaN(forward)) {
        out.dropped++;
        forward = 0;
      }
      if (directed || i === j) {
        if (forward > 0) add(i, j, forward, forward);
        continue;
      }
      let back = cell(m, j, i);
      if (Number.isNaN(back)) {
        out.dropped++;
        back = 0;
      }
      if (forward > 0 || back > 0) add(i, j, forward, back);
    }
  }
  return out;
}

/** Group names in order: numbers by value, then text by code unit; equal names keep their order. */
function compareNames(a: string | undefined, b: string | undefined): number {
  const x = a === undefined || a.trim() === '' ? NaN : Number(a);
  const y = b === undefined || b.trim() === '' ? NaN : Number(b);
  const xn = Number.isFinite(x);
  const yn = Number.isFinite(y);
  if (xn && yn) return x - y;
  if (xn !== yn) return xn ? -1 : 1;
  const s = a ?? '';
  const t = b ?? '';
  return s < t ? -1 : s > t ? 1 : 0;
}

const width = (v: number | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;

/** One end of a link on an arc. */
interface End {
  readonly link: number;
  /** The node at the other end. */
  readonly other: number;
  readonly width: number;
  /** 0 the source end, 1 the target end, 2 a self-link's one span. */
  readonly role: 0 | 1 | 2;
}

/** Lay a chord diagram out (see the module comment). */
export function chordLayout(
  input: ChordLayoutInput,
  options: ChordLayoutOptions = {},
): ChordLayout {
  const n = Math.max(0, Math.floor(input.nodes) || 0);
  const direction: 1 | -1 = options.clockwise === false ? -1 : 1;
  const rotation = Number.isFinite(options.rotation) ? options.rotation! : 0;
  const sort = options.sort ?? 'input';
  const linkSort = options.linkSort ?? 'position';

  // ---- Link ends per node ----------------------------------------------------------------------
  const count = Math.min(input.source.length, input.target.length, input.value.length);
  const ends: End[][] = Array.from({ length: n }, () => []);
  const value = new Float64Array(n);
  const flowOut = new Float64Array(n);
  const flowIn = new Float64Array(n);
  const kept: number[] = [];
  for (let k = 0; k < count; k++) {
    const s = input.source[k]!;
    const t = input.target[k]!;
    if (!Number.isInteger(s) || !Number.isInteger(t) || s < 0 || t < 0 || s >= n || t >= n)
      continue;
    const ws = width(input.value[k]);
    if (s === t) {
      if (ws === 0) continue;
      ends[s]!.push({ link: k, other: s, width: ws, role: 2 });
      value[s]! += ws;
      flowOut[s]! += ws;
      flowIn[s]! += ws;
    } else {
      const wt = input.targetValue ? width(input.targetValue[k]) : ws;
      if (ws === 0 && wt === 0) continue;
      ends[s]!.push({ link: k, other: t, width: ws, role: 0 });
      ends[t]!.push({ link: k, other: s, width: wt, role: 1 });
      value[s]! += ws;
      value[t]! += wt;
      flowOut[s]! += ws;
      flowIn[t]! += wt;
    }
    kept.push(k);
  }

  // ---- Ring order: blocks (groups, nodes without one), then nodes within a block -----------------
  const group = (i: number): number => {
    const g = input.group ? input.group[i] : undefined;
    return typeof g === 'number' && Number.isInteger(g) && g >= 0 ? g : -1;
  };
  interface Block {
    readonly group: number;
    readonly nodes: number[];
    value: number;
  }
  const blocks: Block[] = [];
  const blockOfGroup = new Map<number, Block>();
  for (let i = 0; i < n; i++) {
    if (!(value[i]! > 0)) continue;
    const g = group(i);
    let block = g >= 0 ? blockOfGroup.get(g) : undefined;
    if (!block) {
      block = { group: g, nodes: [], value: 0 };
      blocks.push(block);
      if (g >= 0) blockOfGroup.set(g, block);
    }
    block.nodes.push(i);
    block.value += value[i]!;
  }
  if (sort === 'value') {
    for (const b of blocks) b.nodes.sort((a, c) => value[c]! - value[a]! || a - c);
    blocks.sort((a, b) => b.value - a.value || a.nodes[0]! - b.nodes[0]!);
  } else if (sort === 'group') {
    const names = input.groupNames ?? [];
    blocks.sort((a, b) => {
      // Nodes without a group come after the groups, in index order.
      if (a.group < 0 || b.group < 0) {
        return a.group < 0 && b.group < 0 ? a.nodes[0]! - b.nodes[0]! : a.group < 0 ? 1 : -1;
      }
      return compareNames(names[a.group], names[b.group]) || a.group - b.group;
    });
  }

  // ---- Arcs ------------------------------------------------------------------------------------
  const order: number[] = [];
  const blockAt: number[] = [];
  blocks.forEach((b, k) => {
    for (const i of b.nodes) {
      order.push(i);
      blockAt.push(k);
    }
  });
  const m = order.length;
  let total = 0;
  for (const i of order) total += value[i]!;
  const pad = Math.max(0, Number.isFinite(options.padAngle) ? options.padAngle! : 0);
  const groupPad = Math.max(
    0,
    Number.isFinite(options.groupPadAngle) ? options.groupPadAngle! : pad,
  );
  // The gap after arc `p` (the ring is closed, so the last arc has one too). Without groups every
  // node is a block of its own, and the gaps are node gaps.
  const grouped = blockOfGroup.size > 0;
  const gaps = new Float64Array(m);
  let padding = 0;
  if (m > 1) {
    for (let p = 0; p < m; p++) {
      gaps[p] = grouped && blockAt[p] !== blockAt[(p + 1) % m] ? groupPad : pad;
      padding += gaps[p]!;
    }
    const most = TAU * MAX_PAD_SHARE;
    if (padding > most) {
      for (let p = 0; p < m; p++) gaps[p] = (gaps[p]! * most) / padding;
      padding = most;
    }
  }
  const scale = total > 0 ? (TAU - padding) / total : 0;
  const angle = (t: number): number => rotation + direction * t;

  const arcs: ChordArc[] = [];
  const arcOf = new Int32Array(n).fill(-1);
  const startOf = new Float64Array(m);
  let cursor = 0;
  order.forEach((i, p) => {
    const span = value[i]! * scale;
    startOf[p] = cursor;
    arcOf[i] = p;
    arcs.push({
      node: i,
      start: angle(cursor),
      end: angle(cursor + span),
      value: value[i]!,
      out: flowOut[i]!,
      in: flowIn[i]!,
    });
    cursor += span + gaps[p]!;
  });

  const groups: ChordGroupArc[] = [];
  for (const b of blocks) {
    if (b.group < 0) continue;
    const first = arcs[arcOf[b.nodes[0]!]!]!;
    const last = arcs[arcOf[b.nodes.at(-1)!]!]!;
    groups.push({
      group: b.group,
      start: first.start,
      end: last.end,
      value: b.value,
      nodes: b.nodes,
    });
  }

  // ---- Link ends within each arc -----------------------------------------------------------------
  // Spans by link: [source start, source end, target start, target end], as ring progress.
  const spans = new Map<number, [number, number, number, number]>();
  order.forEach((i, p) => {
    const list = ends[i]!;
    if (linkSort === 'value') list.sort((a, b) => b.width - a.width || a.link - b.link);
    else if (linkSort === 'position') {
      // How far back around the ring the other end is: 0 for a self-link, then the arc before
      // this one, …, and the arc after it last.
      const back = (e: End): number => (e.role === 2 ? 0 : (p - arcOf[e.other]! + m) % m);
      list.sort((a, b) => {
        const d = back(a) - back(b);
        if (d !== 0) return d;
        // Links between the same two nodes: one order here, the reverse at the other end.
        return a.other === i || p < arcOf[a.other]! ? a.link - b.link : b.link - a.link;
      });
    }
    let at = startOf[p]!;
    for (const e of list) {
      const span = e.width * scale;
      let s = spans.get(e.link);
      if (!s) spans.set(e.link, (s = [0, 0, 0, 0]));
      if (e.role !== 1) {
        s[0] = at;
        s[1] = at + span;
      }
      if (e.role !== 0) {
        s[2] = at;
        s[3] = at + span;
      }
      at += span;
    }
  });

  const ribbons = kept.map((k): ChordRibbon => {
    const s = spans.get(k)!;
    const source = input.source[k]!;
    const target = input.target[k]!;
    return {
      link: k,
      source,
      target,
      sourceStart: angle(s[0]),
      sourceEnd: angle(s[1]),
      targetStart: angle(s[2]),
      targetEnd: angle(s[3]),
      self: source === target,
    };
  });

  return { arcs, arcOf, groups, ribbons, total, scale, direction };
}
