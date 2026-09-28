/**
 * The hierarchy builder (plan E13.1), ported from plotly.js' `traces/sunburst/calc.js` with the
 * d3-hierarchy steps it relies on (`stratify`, `hierarchy.sum`, `sort`) written out here. One
 * builder for `sunburst`, `treemap` and `icicle`.
 *
 * ## Rows → nodes (Plotly's `calc`)
 *
 * A row `i` becomes a node when its id (`ids[i]`, else `labels[i]`) is set — `0` counts — and,
 * with `values`, `values[i]` is a number ≥ 0. Its parent is `parents[i]` (`''` for a root). Then:
 *
 * - No row has an empty parent: the one parent id that is not a node id becomes an **implied
 *   root** (labelled with its id); several such ids cannot be built ("Multiple implied roots").
 * - Several rows have an empty parent: a **generated root of roots** holds them (Plotly's
 *   `hasMultipleRoots`), and the charts start one level below it.
 * - d3's `stratify` then links children to parents in data order and fails on a parent id that
 *   is not a node (`missing: X`), a parent id used by several nodes (`ambiguous: X`; repeated ids
 *   are fine for leaves) and nodes that never reach the root (`cycle`).
 *
 * ## Values
 *
 * With `values`, `branchvalues: 'remainder'` sums each node's value with its descendants' (d3
 * `sum`), `'total'` takes the node's own value, which must not be smaller than its children's sum
 * (generated roots take that sum). Without `values`, nodes count their descendants per `count`
 * (`leaves`, `branches` or both). `sort` orders siblings by value, largest first.
 *
 * Failures return Plotly's warning text (`[holochart]`-prefixed by the calc) instead of a tree;
 * the trace then draws nothing, as in Plotly.
 */
import { isArrayLike } from '@mk7s/holochart-core';

/** One node of a hierarchy: Plotly's calcdata item (`cdi`) and its d3 node in one object. */
export interface HierNode {
  /** Node id: `ids[i]`, else `labels[i]` (stringified); a generated root's id. */
  readonly id: string;
  /** Parent id (`''` for the root). */
  readonly pid: string;
  /** `labels[i]` (stringified, `''` when unset); a generated root's label. */
  readonly label: string;
  /** Data index, or -1 for a generated root. */
  readonly i: number;
  /** `values[i]` as a number (only when the trace has `values`). */
  readonly v: number | undefined;
  /**
   * A root the data does not have: `'implied'` (the one parent id that is no node id, Plotly's
   * `hasImpliedRoot`) or `'multiple'` (the root of several roots, Plotly's `hasMultipleRoots`).
   */
  readonly generated: 'implied' | 'multiple' | undefined;
  parent: HierNode | null;
  /** Children in data order (sorted by value with `sort`); empty for leaves. */
  children: HierNode[];
  /** Levels below the root (d3 `depth`). */
  depth: number;
  /** Levels to the deepest leaf below (d3 `height`). */
  height: number;
  /** The node's size: summed, total or counted (d3 `value`). */
  value: number;
  /** CSS fill color, resolved by the trace's cross-trace step (`''` until then). */
  color: string;
}

/** A built hierarchy. */
export interface Hierarchy {
  readonly root: HierNode;
  /** Every node, breadth first (d3 `each`): the root, its children, their children, … */
  readonly nodes: readonly HierNode[];
  /** The root was generated to hold several roots: charts start one level below it. */
  readonly hasMultipleRoots: boolean;
  /** The root is the implied parent of the top-level rows. */
  readonly hasImpliedRoot: boolean;
}

/** What {@link buildHierarchy} reads (a defaulted trace's attributes). */
export interface HierarchyInput {
  readonly labels: unknown;
  readonly parents: unknown;
  readonly ids?: unknown;
  readonly values?: unknown;
  readonly branchvalues?: unknown;
  /** Flags of `count`: `'leaves'` (default), `'branches'` or `'branches+leaves'`. */
  readonly count?: unknown;
  /** Order siblings by value, largest first. Default true. */
  readonly sort?: unknown;
  /** For messages: trace type and name (`'sunburst'`, `'trace 0'`). */
  readonly type: string;
  readonly name: string;
}

/** A hierarchy, or Plotly's warning when the rows do not make one. */
export type HierarchyResult =
  | { readonly hierarchy: Hierarchy; readonly warnings: readonly string[] }
  | { readonly hierarchy: undefined; readonly warnings: readonly string[] };

/**
 * Plotly's `ALMOST_EQUAL` (`1 − 1e-9`): a `total` smaller than its children's sum by less than this
 * relative amount is rounding, not a violation.
 */
const ALMOST_EQUAL = 1 - 1e-9;

/** The id of the generated root of several roots (Plotly uses a random string). */
export const MULTIPLE_ROOTS_ID = '\u0000roots';

/** Plotly treats the number `0` as a valid id or parent. */
function isValidKey(k: unknown): boolean {
  return Boolean(k) || typeof k === 'number';
}

/** `fast-isnumeric`: finite numbers and numeric strings. */
export function isNumeric(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.trim() !== '' && Number.isFinite(Number(v));
  return false;
}

function node(
  id: string,
  pid: string,
  label: string,
  i: number,
  v: number | undefined,
  generated?: 'implied' | 'multiple',
): HierNode {
  return {
    id,
    pid,
    label,
    i,
    v,
    generated,
    parent: null,
    children: [],
    depth: 0,
    height: 0,
    value: 0,
    color: '',
  };
}

/** Rows → nodes, implied and multiple roots (Plotly's `calc`, before `stratify`). */
function collectRows(input: HierarchyInput): { rows: HierNode[]; warning?: string } {
  const { labels, parents, ids, values } = input;
  const hasIds = isArrayLike(ids);
  const hasValues = isArrayLike(values);
  const labelAt = (i: number): unknown => (isArrayLike(labels) ? labels[i] : undefined);
  const parentAt = (i: number): unknown => (isArrayLike(parents) ? parents[i] : undefined);
  const keyAt = (i: number): unknown => (hasIds ? (ids as ArrayLike<unknown>)[i] : labelAt(i));
  let len = Math.min(
    hasIds ? (ids as ArrayLike<unknown>).length : isArrayLike(labels) ? labels.length : 0,
    isArrayLike(parents) ? parents.length : 0,
  );
  if (hasValues) len = Math.min(len, (values as ArrayLike<unknown>).length);

  const rows: HierNode[] = [];
  const childrenOf = new Map<string, number>();
  const idSet = new Set<string>();
  for (let i = 0; i < len; i++) {
    const key = keyAt(i);
    if (!isValidKey(key)) continue;
    let v: number | undefined;
    if (hasValues) {
      const raw = (values as ArrayLike<unknown>)[i];
      if (!isNumeric(raw) || Number(raw) < 0) continue;
      v = Number(raw);
    }
    const id = String(key);
    const p = parentAt(i);
    const pid = isValidKey(p) ? String(p) : '';
    const label = labelAt(i);
    rows.push(node(id, pid, isValidKey(label) ? String(label) : '', i, v));
    childrenOf.set(pid, (childrenOf.get(pid) ?? 0) + 1);
    idSet.add(id);
  }

  const topLevel = childrenOf.get('') ?? 0;
  if (rows.length === 0) return { rows };
  if (topLevel === 0) {
    const implied = [...childrenOf.keys()].filter((k) => !idSet.has(k));
    if (implied.length === 1) {
      const k = implied[0]!;
      rows.unshift(node(k, '', k, -1, undefined, 'implied'));
    } else if (implied.length > 1) {
      return {
        rows: [],
        warning: `Multiple implied roots, cannot build ${input.type} hierarchy of ${input.name}. These roots include: ${implied.join(', ')}`,
      };
    }
    // No implied root and no empty parent: every parent is a node, so the parents loop (d3 fails
    // with `cycle` once it has a root; here there is none to start from).
  } else if (topLevel > 1) {
    // Several rows at the top: a root of roots makes d3 build the tree (Plotly's `dummyId`).
    for (let k = 0; k < rows.length; k++) {
      const row = rows[k]!;
      if (row.pid === '') rows[k] = { ...row, pid: MULTIPLE_ROOTS_ID };
    }
    rows.unshift(node(MULTIPLE_ROOTS_ID, '', '', -1, undefined, 'multiple'));
  }
  return { rows };
}

/** d3's `stratify`: link rows to their parents; the error message on failure. */
function stratify(rows: HierNode[]): { root: HierNode } | { error: string } {
  const AMBIGUOUS = {} as HierNode;
  const byId = new Map<string, HierNode>();
  for (const row of rows) byId.set(row.id, byId.has(row.id) ? AMBIGUOUS : row);
  let root: HierNode | undefined;
  for (const row of rows) {
    if (row.pid === '') {
      if (root) return { error: 'multiple roots' };
      root = row;
      continue;
    }
    const parent = byId.get(row.pid);
    if (!parent) return { error: `missing: ${row.pid}` };
    if (parent === AMBIGUOUS) return { error: `ambiguous: ${row.pid}` };
    parent.children.push(row);
    row.parent = parent;
  }
  if (!root) return { error: rows.length > 0 ? 'cycle' : 'no root' };
  // Depths from the root; nodes it never reaches are on a parent loop.
  let reached = 0;
  const stack: HierNode[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    reached++;
    for (const c of n.children) {
      c.depth = n.depth + 1;
      stack.push(c);
    }
  }
  if (reached < rows.length) return { error: 'cycle' };
  return { root };
}

/** Nodes breadth first (d3 `each`). */
export function breadthFirst(root: HierNode): HierNode[] {
  const out: HierNode[] = [root];
  for (let k = 0; k < out.length; k++) {
    for (const c of out[k]!.children) out.push(c);
  }
  return out;
}

/** d3's `eachBefore` height pass: levels to the deepest leaf, from the bottom up. */
function computeHeights(nodes: readonly HierNode[]): void {
  for (let k = nodes.length - 1; k >= 0; k--) {
    const n = nodes[k]!;
    let h = 0;
    for (const c of n.children) h = Math.max(h, c.height + 1);
    n.height = h;
  }
}

/** d3's `sum`: each node's own value plus its descendants' (bottom up). */
function sumRemainder(nodes: readonly HierNode[]): void {
  for (let k = nodes.length - 1; k >= 0; k--) {
    const n = nodes[k]!;
    let sum = n.v !== undefined && n.v > 0 ? n.v : 0;
    for (const c of n.children) sum += c.value;
    n.value = sum;
  }
}

/**
 * `branchvalues: 'total'`: each node's own value, which must cover its children (generated roots
 * take their children's sum). Returns Plotly's warnings, one per violating node.
 */
function sumTotal(nodes: readonly HierNode[]): string[] {
  const warnings: string[] = [];
  for (const n of nodes) {
    let v = n.v ?? 0;
    if (n.children.length > 0) {
      let partialSum = 0;
      for (const c of n.children) partialSum += c.v ?? 0;
      if (n.generated) v = partialSum;
      if (v < partialSum * ALMOST_EQUAL) {
        warnings.push(
          `Total value for node ${n.id} is smaller than the sum of its children. \nparent value = ${v} \nchildren sum = ${partialSum}`,
        );
        continue;
      }
    }
    n.value = v;
  }
  return warnings;
}

/** Plotly's `countDescendants`: leaves and / or branches below (and including) each node. */
function countDescendants(nodes: readonly HierNode[], count: unknown): void {
  const flags = typeof count === 'string' ? count.split('+') : ['leaves'];
  const leaves = flags.includes('leaves');
  const branches = flags.includes('branches');
  for (let k = nodes.length - 1; k >= 0; k--) {
    const n = nodes[k]!;
    let c = 0;
    if (n.children.length > 0) {
      for (const child of n.children) c += child.value;
      if (branches) c++;
    } else if (leaves) c++;
    n.value = c;
  }
}

/** d3's `sort` with Plotly's comparator: siblings by value, largest first (stable). */
function sortByValue(nodes: readonly HierNode[]): void {
  for (const n of nodes) {
    if (n.children.length > 1) n.children.sort((a, b) => b.value - a.value);
  }
}

/**
 * Build the hierarchy of a trace's rows (see the module comment). `warnings` holds Plotly's
 * messages, also when a tree was built (none today: every warning is fatal, as in Plotly).
 */
export function buildHierarchy(input: HierarchyInput): HierarchyResult {
  const { rows, warning } = collectRows(input);
  if (warning) return { hierarchy: undefined, warnings: [warning] };
  if (rows.length === 0) return { hierarchy: undefined, warnings: [] };
  const linked = stratify(rows);
  if ('error' in linked) {
    return {
      hierarchy: undefined,
      warnings: [
        `Failed to build ${input.type} hierarchy of ${input.name}. Error: ${linked.error}`,
      ],
    };
  }
  const root = linked.root;
  let nodes = breadthFirst(root);
  computeHeights(nodes);

  if (isArrayLike(input.values)) {
    if (input.branchvalues === 'total') {
      const warnings = sumTotal(nodes);
      if (warnings.length > 0) return { hierarchy: undefined, warnings };
    } else sumRemainder(nodes);
  } else countDescendants(nodes, input.count);

  if (input.sort !== false) {
    sortByValue(nodes);
    nodes = breadthFirst(root);
  }
  return {
    hierarchy: {
      root,
      nodes,
      hasMultipleRoots: root.generated === 'multiple',
      hasImpliedRoot: root.generated === 'implied',
    },
    warnings: [],
  };
}
