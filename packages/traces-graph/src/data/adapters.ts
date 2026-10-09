/**
 * Adapters from the shapes graphs usually arrive in to {@link GraphData} (backlog G9): an edge
 * list, an adjacency matrix, and node-link JSON as networkx, d3, graphology and Cytoscape write
 * it. They are pure and keep the source's node order. `fromDot` (`dot.ts`) reads Graphviz text.
 */
import {
  GraphBuilder,
  pick,
  rest,
  toNumber,
  toText,
  type GraphId,
  type LinkInput,
  type NodeInput,
} from './build.ts';
import type { GraphData } from './types.ts';

type Rec = Readonly<Record<string, unknown>>;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is GraphId =>
  typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

// Attribute names sources use for the same thing, in the order they are tried.
const LABEL_KEYS = ['label', 'name', 'title'] as const;
const GROUP_KEYS = ['group', 'community', 'cluster', 'category', 'module'] as const;
const NODE_VALUE_KEYS = ['value', 'size', 'weight'] as const;
const LINK_VALUE_KEYS = ['value', 'weight', 'width'] as const;
const COLOR_KEYS = ['color'] as const;

const toGroup = (v: unknown): string | number | undefined =>
  typeof v === 'string' && v !== ''
    ? v
    : typeof v === 'number' && Number.isFinite(v)
      ? v
      : undefined;

/** Node fields from an attribute record; what is not recognised goes to `customdata`. */
function nodeFields(attributes: Rec, skip: readonly string[] = []): NodeInput {
  return {
    label: pick(attributes, LABEL_KEYS, toText),
    group: pick(attributes, GROUP_KEYS, toGroup),
    x: toNumber(attributes['x']),
    y: toNumber(attributes['y']),
    value: pick(attributes, NODE_VALUE_KEYS, toNumber),
    color: pick(attributes, COLOR_KEYS, toText),
    customdata: rest(attributes, [
      ...skip,
      ...LABEL_KEYS,
      ...GROUP_KEYS,
      ...NODE_VALUE_KEYS,
      ...COLOR_KEYS,
      'x',
      'y',
    ]),
  };
}

function linkFields(attributes: Rec, skip: readonly string[] = []): LinkInput {
  return {
    value: pick(attributes, LINK_VALUE_KEYS, toNumber),
    label: pick(attributes, LABEL_KEYS, toText),
    color: pick(attributes, COLOR_KEYS, toText),
    customdata: rest(attributes, [...skip, ...LINK_VALUE_KEYS, ...LABEL_KEYS, ...COLOR_KEYS]),
  };
}

// ---- Edge lists ---------------------------------------------------------------------------------

/** Options of {@link fromEdgeList}. */
export interface EdgeListOptions {
  /** Keys of an edge object's ends and weight. Defaults `'source'`, `'target'`, `'value'`. */
  readonly source?: string;
  readonly target?: string;
  readonly value?: string;
  /**
   * A node table: one object per node, for labels, groups and nodes without links. Nodes come in
   * this order first; ends of edges that are not in it are added after.
   */
  readonly nodes?: readonly Readonly<Record<string, unknown>>[];
  /** Key of a node object's id (what the edges' ends refer to). Default `'id'`. */
  readonly id?: string;
  /** Whether the links have a direction. Default `true`. */
  readonly directed?: boolean;
}

/**
 * A graph from a list of edges: `[source, target]` or `[source, target, value]` tuples, or
 * objects with those keys. Ends are node ids (strings or numbers), not indices. Edges without two
 * usable ends are skipped.
 */
export function fromEdgeList(
  edges: Iterable<readonly unknown[] | Readonly<Record<string, unknown>>>,
  options: EdgeListOptions = {},
): GraphData {
  const sourceKey = options.source ?? 'source';
  const targetKey = options.target ?? 'target';
  const valueKey = options.value ?? 'value';
  const idKey = options.id ?? 'id';
  const builder = new GraphBuilder();
  for (const row of options.nodes ?? []) {
    const id = row[idKey];
    if (isId(id)) builder.node(id, nodeFields(row, [idKey]));
  }
  for (const edge of edges) {
    if (Array.isArray(edge)) {
      const [s, t, v] = edge as readonly unknown[];
      if (isId(s) && isId(t)) builder.link(s, t, { value: toNumber(v) });
    } else if (isRecord(edge)) {
      const s = edge[sourceKey];
      const t = edge[targetKey];
      if (!isId(s) || !isId(t)) continue;
      const fields = linkFields(edge, [sourceKey, targetKey, valueKey]);
      builder.link(s, t, { ...fields, value: toNumber(edge[valueKey]) ?? fields.value });
    }
  }
  return builder.build(options.directed ?? true);
}

// ---- Adjacency matrices -------------------------------------------------------------------------

/** Options of {@link fromAdjacencyMatrix}. */
export interface AdjacencyMatrixOptions {
  /** Node labels, one per row. Default: the row indices. */
  readonly labels?: readonly string[];
  /**
   * Whether `matrix[i][j]` is a link from `i` to `j` only. Default: `false` when the matrix is
   * symmetric, in which case each pair gives one link (from its upper triangle), else `true`.
   */
  readonly directed?: boolean;
  /** Entries with an absolute value at or below this are no link. Default `0`. */
  readonly threshold?: number;
}

/**
 * A graph from a square adjacency matrix: `matrix[i][j]` is the weight of the link from row `i`
 * to column `j`. Entries that are not finite numbers are no link; the diagonal gives self-links.
 */
export function fromAdjacencyMatrix(
  matrix: ArrayLike<ArrayLike<number>>,
  options: AdjacencyMatrixOptions = {},
): GraphData {
  const n = matrix.length;
  const at = (i: number, j: number): number => {
    const v = matrix[i]?.[j];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };
  let symmetric = true;
  for (let i = 0; i < n && symmetric; i++) {
    for (let j = i + 1; j < n; j++) {
      if (at(i, j) !== at(j, i)) {
        symmetric = false;
        break;
      }
    }
  }
  const directed = options.directed ?? !symmetric;
  const threshold = options.threshold ?? 0;
  const source: number[] = [];
  const target: number[] = [];
  const value: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = directed ? 0 : i; j < n; j++) {
      const v = at(i, j);
      if (Math.abs(v) <= threshold) continue;
      source.push(i);
      target.push(j);
      value.push(v);
    }
  }
  const label = Array.from({ length: n }, (_, i) => options.labels?.[i] ?? String(i));
  return { node: { label }, link: { source, target, value }, directed };
}

// ---- Node-link JSON -----------------------------------------------------------------------------

/**
 * A graph from node-link JSON, whichever of these shapes it has:
 *
 * - **networkx** `node_link_data` and **d3**: `{ directed?, nodes: [{ id, … }], links | edges:
 *   [{ source, target, … }] }`. Ends are node ids; when the nodes have no ids, they are indices.
 * - **graphology** `graph.export()`: `{ options: { type }, nodes: [{ key, attributes }], edges:
 *   [{ source, target, attributes, undirected? }] }`.
 * - **Cytoscape** `cy.json()` and element lists: `{ elements: { nodes: [{ data: { id, … },
 *   position }], edges: [{ data: { source, target, … } }] } }`, `{ elements: [ … ] }` or the array
 *   itself. A node's `parent` (a compound node) becomes its group. Cytoscape's y axis points
 *   down, so `position.y` is negated.
 *
 * Attributes named `label` / `name`, `group` / `community` / `cluster`, `value` / `size` /
 * `weight`, `color`, `x` and `y` fill the matching arrays; the rest goes to `customdata`. Links
 * whose ends are not nodes are skipped. Throws a `TypeError` for anything else.
 */
export function fromNodeLink(json: unknown): GraphData {
  if (Array.isArray(json)) return fromCytoscape(json);
  if (!isRecord(json)) throw new TypeError('fromNodeLink: expected an object or an array');
  const elements = json['elements'];
  if (Array.isArray(elements)) return fromCytoscape(elements);
  if (isRecord(elements)) {
    return fromCytoscape([
      ...tagged(elements['nodes'], 'nodes'),
      ...tagged(elements['edges'], 'edges'),
    ]);
  }
  const nodes = json['nodes'];
  const links = Array.isArray(json['links']) ? json['links'] : json['edges'];
  if (!Array.isArray(nodes) || !Array.isArray(links)) {
    throw new TypeError('fromNodeLink: expected `nodes` and `links` (or `edges`) arrays');
  }
  const graphology = nodes.some((n) => isRecord(n) && 'key' in n);
  return graphology ? fromGraphology(json, nodes, links) : fromNetworkx(json, nodes, links);
}

function fromNetworkx(json: Rec, nodes: readonly unknown[], links: readonly unknown[]): GraphData {
  const builder = new GraphBuilder();
  // d3 examples without node ids refer to nodes by index.
  const byIndex = !nodes.some((n) => isRecord(n) && isId(n['id']));
  nodes.forEach((n, i) => {
    if (isId(n)) builder.node(n);
    else if (!isRecord(n)) return;
    else if (byIndex) builder.node(i, nodeFields(n, ['id']));
    else if (isId(n['id'])) builder.node(n['id'], nodeFields(n, ['id']));
  });
  for (const l of links) {
    if (!isRecord(l)) continue;
    const s = endId(l['source']);
    const t = endId(l['target']);
    if (s === undefined || t === undefined || !builder.has(s) || !builder.has(t)) continue;
    builder.link(s, t, linkFields(l, ['source', 'target', 'key']));
  }
  return builder.build(json['directed'] === true);
}

/** A link end: an id, or (d3 after a simulation ran) the node object itself. */
function endId(v: unknown): GraphId | undefined {
  if (isId(v)) return v;
  if (isRecord(v) && isId(v['id'])) return v['id'];
  return undefined;
}

function fromGraphology(
  json: Rec,
  nodes: readonly unknown[],
  edges: readonly unknown[],
): GraphData {
  const builder = new GraphBuilder();
  for (const n of nodes) {
    if (!isRecord(n) || !isId(n['key'])) continue;
    builder.node(n['key'], isRecord(n['attributes']) ? nodeFields(n['attributes']) : undefined);
  }
  let undirected = 0;
  let count = 0;
  for (const e of edges) {
    if (!isRecord(e)) continue;
    const s = e['source'];
    const t = e['target'];
    if (!isId(s) || !isId(t) || !builder.has(s) || !builder.has(t)) continue;
    builder.link(s, t, isRecord(e['attributes']) ? linkFields(e['attributes']) : undefined);
    count++;
    if (e['undirected'] === true) undirected++;
  }
  const options = json['options'];
  const type = isRecord(options) ? options['type'] : undefined;
  // A mixed graph is directed unless every one of its edges says otherwise.
  const directed = type === 'directed' || (type !== 'undirected' && undirected < count);
  return builder.build(directed);
}

function tagged(list: unknown, group: 'nodes' | 'edges'): Rec[] {
  if (!Array.isArray(list)) return [];
  return list.filter(isRecord).map((element) => ({ ...element, group }));
}

function fromCytoscape(elements: readonly unknown[]): GraphData {
  const builder = new GraphBuilder();
  const edges: Rec[] = [];
  const labels = new Map<string, string>();
  const parents = new Set<string>();
  const nodes: { id: GraphId; data: Rec; position: unknown }[] = [];
  for (const element of elements) {
    if (!isRecord(element) || !isRecord(element['data'])) continue;
    const data = element['data'];
    const isEdge =
      element['group'] === 'edges' || (element['group'] !== 'nodes' && 'source' in data);
    if (isEdge) {
      edges.push(data);
      continue;
    }
    if (!isId(data['id'])) continue;
    nodes.push({ id: data['id'], data, position: element['position'] });
    const label = pick(data, LABEL_KEYS, toText);
    if (label !== undefined) labels.set(String(data['id']), label);
    if (isId(data['parent'])) parents.add(String(data['parent']));
  }
  for (const { id, data, position } of nodes) {
    // A compound node is a frame around its children, not a node of the graph.
    if (parents.has(String(id))) continue;
    const fields = nodeFields(data, ['id', 'parent']);
    if (isId(data['parent'])) {
      fields.group = labels.get(String(data['parent'])) ?? data['parent'];
    }
    if (isRecord(position)) {
      fields.x = toNumber(position['x']);
      const y = toNumber(position['y']);
      fields.y = y === undefined ? undefined : -y;
    }
    builder.node(id, fields);
  }
  for (const data of edges) {
    const s = data['source'];
    const t = data['target'];
    if (!isId(s) || !isId(t) || !builder.has(s) || !builder.has(t)) continue;
    builder.link(s, t, linkFields(data, ['id', 'source', 'target']));
  }
  // Cytoscape has no graph-level flag: its edges have a direction, and styles decide the arrows.
  return builder.build(true);
}
