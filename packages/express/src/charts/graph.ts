/**
 * Network graphs (backlog G8, G9): `graph`, `chord` and `adjacencyMatrix` from an edge table (one
 * row per link, with the ids of its two ends) and an optional node table (one row per node, with
 * the id the edges refer to), or from node-link data, or (`chord`, `adjacencyMatrix`) from a square
 * matrix. px has no counterpart; the options follow its naming.
 *
 * The functions only build figures, so they need nothing from the graph package; drawing a `graph`
 * or `chord` trace does (ADR-029): `import '@mk7s/holochart/graph'`, or `register(...tracesGraph)`
 * from `@mk7s/holochart-traces-graph`. That package also has the adapters (`fromNodeLink`,
 * `fromDot`, …) and measures (`louvain`, `connectedComponents`, …) whose results these functions
 * take: node-link data as the data, a measure as a node column (`color: louvain(graph)`).
 */
import { isPlainObject } from '@mk7s/holochart-core';
import type { Chart } from '@mk7s/holochart-runtime';
import { prepare, type Args } from '../core/args.ts';
import { colorscaleAttributes } from '../core/engine.ts';
import { groupValue, valueText } from '../core/labels.ts';
import { expressFunction } from '../core/render.ts';
import { isMissing, plainValue, type DataInput } from '../data/table.ts';
import type {
  ColumnRef,
  CommonOptions,
  ContinuousColorOptions,
  DiscreteColorOptions,
  ExpressFigure,
  HoverOptions,
  SymbolOptions,
} from '../options.ts';
import { imshow } from './imshow.ts';
import { defined } from './shared.ts';

/**
 * Node-link data: the `node` and `link` containers of a `graph` trace, with links as node indices.
 * It is what the adapters of `@mk7s/holochart-traces-graph` return (`fromNodeLink`, `fromDot`,
 * `fromEdgeList`, `fromAdjacencyMatrix`). Its arrays are read as columns: `node.label`,
 * `node.group` (the default `color`), `node.x` / `node.y`, `node.value`, `link.value` (the default
 * `weight`) and `link.label` are used without being named, and `directed` is the default of the
 * option. @experimental
 */
export interface NodeLinkInput {
  readonly node?:
    | {
        readonly label?: ArrayLike<unknown> | undefined;
        readonly group?: ArrayLike<unknown> | undefined;
        readonly x?: ArrayLike<unknown> | undefined;
        readonly y?: ArrayLike<unknown> | undefined;
        readonly value?: ArrayLike<unknown> | undefined;
        readonly color?: ArrayLike<unknown> | undefined;
        readonly customdata?: ArrayLike<unknown> | undefined;
      }
    | undefined;
  readonly link: {
    readonly source: ArrayLike<unknown>;
    readonly target: ArrayLike<unknown>;
    readonly value?: ArrayLike<unknown> | undefined;
    readonly label?: ArrayLike<unknown> | undefined;
    readonly color?: ArrayLike<unknown> | undefined;
    readonly customdata?: ArrayLike<unknown> | undefined;
  };
  readonly directed?: boolean | undefined;
}

/** What {@link graph} reads: an edge table, or node-link data. @experimental */
export type GraphInput = DataInput | NodeLinkInput;

/**
 * A square matrix: `matrix[i][j]` is the weight of the link from node `i` to node `j`. Its nodes
 * have no table: node options are arrays with one value per row (`label: ['A', 'B', 'C']`), or
 * columns of a `nodes` table whose rows are in the order of the matrix. @experimental
 */
export type GraphMatrix = readonly ArrayLike<number>[];

/** Options the graph functions share: the columns of the edge and node tables. @experimental */
export interface GraphDataOptions extends CommonOptions, DiscreteColorOptions, HoverOptions {
  /** Edge column of the id of the node a link starts at. Default `'source'`. */
  readonly source?: ColumnRef;
  /** Edge column of the id of the node a link ends at. Default `'target'`. */
  readonly target?: ColumnRef;
  /** Edge column of link weights (`link.value`). */
  readonly weight?: ColumnRef;
  /** Edge column of link labels, for the hover label (`link.label`). */
  readonly linkLabel?: ColumnRef;
  /**
   * Edge column to color the links by: one color per value, from `linkColorMap` and then the color
   * sequence. Links have no legend; the value is a line of the hover label.
   */
  readonly linkColor?: ColumnRef;
  /** Fixed link colors per value of `linkColor`; `'identity'`: the values are colors. */
  readonly linkColorMap?: Readonly<Record<string, string>> | 'identity';
  /** More edge columns for the link hover label, like `hoverData`. */
  readonly linkHoverData?: readonly ColumnRef[] | Readonly<Record<string, boolean | string>>;
  /**
   * The node table: one row per node. It gives the nodes labels, colors and hover text, sets their
   * order (nodes that only the edges name follow, in order of first appearance) and adds nodes
   * without links. `color`, `hoverName`, `hoverData`, `customData` and the other node options
   * name its columns. Without it, they can only be arrays with one value per node, in order of
   * first appearance in the edges.
   */
  readonly nodes?: DataInput;
  /** Node column of the ids that `source` and `target` refer to. Default `'id'`. */
  readonly id?: ColumnRef;
  /** Node column of labels (`node.label`). Default: the ids. */
  readonly label?: ColumnRef;
  /**
   * Whether links have a direction. `graph`: arrowheads at the target end (default `false`).
   * `chord`: the trace's `directed` (its default is `true`). `adjacencyMatrix`: rows are sources
   * and columns targets; otherwise (the default) a link fills both cells.
   */
  readonly directed?: boolean;
}

/** Options of {@link graph}. @experimental */
export interface GraphOptions extends GraphDataOptions, ContinuousColorOptions, SymbolOptions {
  /**
   * Node column of sizes, or `'degree'`, `'indegree'` or `'outdegree'` to size the nodes by their
   * links (`node.sizeby`). Diameters run from 6 px to `sizeMax`, as `node.sizerange` does.
   */
  readonly size?: ColumnRef | 'degree' | 'indegree' | 'outdegree';
  /** Diameter of the largest node with `size`, in px. Default 30. */
  readonly sizeMax?: number;
  /** Node column of a number per node (`node.value`): dendrogram heights, tree and hive order. */
  readonly value?: ColumnRef;
  /** Node column of x positions (`node.x`). With `y` for every node, the nodes stay there. */
  readonly x?: ColumnRef;
  /** Node column of y positions (`node.y`). */
  readonly y?: ColumnRef;
  /**
   * The layout that places the nodes (the trace's `arrangement`). Default: the trace's, `'preset'`
   * when every node has an `x` and a `y`, else `'force'`.
   */
  readonly arrangement?:
    | 'preset'
    | 'force'
    | 'layered'
    | 'tree'
    | 'radial'
    | 'dendrogram'
    | 'circular'
    | 'grid'
    | 'arc'
    | 'hive'
    | 'custom';
  /** Options of `arrangement: 'force'` (the trace's `force` container, as it is). */
  readonly force?: Readonly<Record<string, unknown>>;
  /** Options of `arrangement: 'layered'` (the trace's `layered` container). */
  readonly layered?: Readonly<Record<string, unknown>>;
  /** Options of `'tree'`, `'radial'` and `'dendrogram'` (the trace's `tree` container). */
  readonly tree?: Readonly<Record<string, unknown>>;
  /** Options of `arrangement: 'arc'` (the trace's `arc` container). */
  readonly arc?: Readonly<Record<string, unknown>>;
  /** Options of `arrangement: 'hive'` (the trace's `hive` container). */
  readonly hive?: Readonly<Record<string, unknown>>;
  /** The layout of `arrangement: 'custom'`: `{ name, options }` (the trace's `custom`). */
  readonly custom?: Readonly<Record<string, unknown>>;
}

/**
 * Options of {@link chord}. `color` groups the nodes whatever its type (a chord has no
 * colorscale). @experimental
 */
export type ChordOptions = GraphDataOptions;

/** Options of {@link adjacencyMatrix}. @experimental */
export interface AdjacencyMatrixOptions
  extends Omit<GraphDataOptions, keyof DiscreteColorOptions>, ContinuousColorOptions {
  /** Node column of groups or communities, which `order` reads. It colors nothing. */
  readonly color?: ColumnRef;
  /**
   * The order of rows and columns. `'input'`: the nodes' own. `'degree'`: the most connected
   * first (by weight). `'group'`: the nodes of a `color` value together, groups in order of first
   * appearance (or `categoryOrders`), by degree within. `'community'`: the same with the largest
   * group first, for `color: louvain(graph)`: Express does not detect communities itself. Or a
   * list of node indices, such as the `order` of the graph package's `adjacencyMatrix`. Default:
   * `'group'` with `color`, else `'input'`.
   */
  readonly order?: 'input' | 'degree' | 'group' | 'community' | readonly number[];
}

/**
 * A graph function: called with data it returns the figure, with an element first it renders.
 * @experimental
 */
export interface GraphFunction<D, O> {
  (data: D | null | undefined, options?: O): ExpressFigure;
  (el: HTMLElement, data: D | null | undefined, options?: O): Promise<Chart>;
}

type Options = Readonly<Record<string, unknown>>;

/** Options that name columns of the edge table; the other column options are the node table's. */
const EDGE_KEYS = ['source', 'target', 'weight', 'linkLabel', 'linkColor', 'linkHoverData'];
/** Options the edge table shares with the node table. */
const SHARED_KEYS = ['labels', 'template', 'categoryOrders', 'colorDiscreteSequence'];
/** `size` values that are measures of the trace (`node.sizeby`), not columns. */
const SIZE_BY = ['degree', 'indegree', 'outdegree'];
/** Options `adjacencyMatrix` passes to `imshow`. */
const FIGURE_KEYS = [
  'title',
  'template',
  'width',
  'height',
  'colorContinuousScale',
  'rangeColor',
  'colorContinuousMidpoint',
];
/** Options passed to the `graph` trace under the same name. */
const TRACE_KEYS = ['arrangement', 'force', 'layered', 'tree', 'arc', 'hive', 'custom'];

const isList = (v: unknown): v is ArrayLike<unknown> => Array.isArray(v) || ArrayBuffer.isView(v);
/** `from`'s values of `keys` (`undefined` for all of them without `from`). */
const pick = (keys: readonly string[], from?: Options): Options =>
  Object.fromEntries(keys.map((k) => [k, from?.[k]]));
/** The arrays of a container, as columns. */
const columns = (container: unknown): Record<string, ArrayLike<unknown>> =>
  Object.fromEntries(Object.entries(container ?? {}).filter(([, v]) => isList(v))) as Record<
    string,
    ArrayLike<unknown>
  >;
/** `{ option: column }` for the columns a table has. */
const present = (table: object, options: Readonly<Record<string, string>>): Options =>
  Object.fromEntries(Object.entries(options).filter(([, column]) => column in table));

/** The nodes and links of one call, read from its tables. */
interface Read {
  /** The options, with what node-link data implies filled in. */
  readonly o: Options;
  readonly edges: Args;
  readonly nodes: Args;
  /** The data, when it is a matrix (then there are no links here). */
  readonly matrix: readonly ArrayLike<unknown>[] | undefined;
  /** The id of every node, in node order. */
  readonly ids: readonly unknown[];
  /** The label of every node: its `label`, else its id. */
  readonly labels: string[];
  /** Node-table values of a column, one per node; `null` for a node only the edges name. */
  nodeValues(column: string): unknown[];
  /** Node index of each link's ends. */
  readonly source: number[];
  readonly target: number[];
  /** Edge-table values of a column, one per link. */
  linkValues(column: string): unknown[];
}

/**
 * Read the tables. Nodes are the rows of the node table that have an id, in order, then the ends
 * of edges that are not among them, in order of first appearance (a link's source before its
 * target): the order of `fromEdgeList`, so its measures line up with these nodes. Ids that print
 * the same are one node. Edges without both ends are skipped, as are node rows without an id.
 *
 * @throws {Error} For unknown columns (a node column named without a node table is one) and
 *   node ids that repeat.
 */
function read(fn: string, data: unknown, options: Options): Read {
  let o = options;
  let edgesIn = data as DataInput | null | undefined;
  let nodesIn = o['nodes'] as DataInput | null | undefined;
  let matrix: readonly ArrayLike<unknown>[] | undefined;
  // Nodes that are their index (rows of a matrix, entries of a `node` container) have no id column.
  let indexed = false;
  if (Array.isArray(data) && isList(data[0])) {
    if (fn === 'graph') {
      throw new Error(`${fn}: a matrix is not an edge table; chord and adjacencyMatrix take one.`);
    }
    matrix = data as ArrayLike<unknown>[];
    edgesIn = null;
    indexed = true;
  } else if (isPlainObject(data) && isPlainObject(data['link'])) {
    const link = columns(data['link']);
    edgesIn = link;
    let implied: Options = present(link, { weight: 'value', linkLabel: 'label' });
    if (nodesIn === undefined || nodesIn === null) {
      const node = columns(data['node']);
      if (Object.keys(node).length > 0) nodesIn = node;
      indexed = true;
      implied = {
        ...implied,
        ...present(node, { label: 'label', color: 'group', value: 'value', x: 'x', y: 'y' }),
      };
    }
    o = { ...implied, directed: data['directed'], ...defined(o) };
  }
  const edges = prepare(fn, edgesIn, {
    ...pick(SHARED_KEYS, o),
    ...(matrix ? {} : { source: 'source', target: 'target', ...defined(pick(EDGE_KEYS, o)) }),
  });
  const size = o['size'];
  const nodes = prepare(fn, nodesIn, {
    ...o,
    ...pick(EDGE_KEYS),
    id: indexed ? undefined : (o['id'] ?? (nodesIn ? 'id' : undefined)),
    size: typeof size === 'string' && SIZE_BY.includes(size) ? undefined : size,
  });

  const index = new Map<string, number>();
  const ids: unknown[] = [];
  const rows: (number | undefined)[] = [];
  const add = (id: unknown, row?: number): number => {
    const key = valueText(id);
    let i = index.get(key);
    if (i === undefined) {
      index.set(key, (i = ids.length));
      ids.push(id);
      rows.push(row);
    }
    return i;
  };
  const count = matrix ? matrix.length : indexed ? nodes.table.length : 0;
  for (let i = 0; i < count; i++) add(i);
  const idColumn = nodes.cols.id;
  if (idColumn !== undefined) {
    nodes.table.column(idColumn).forEach((value, row) => {
      const id = groupValue(value);
      if (isMissing(id)) return;
      if (index.has(valueText(id))) {
        throw new Error(
          `${fn}: node ids must be unique; '${valueText(id)}' is the id of more than one row of the node table.`,
        );
      }
      add(id, row);
    });
  }
  const source: number[] = [];
  const target: number[] = [];
  const kept: number[] = [];
  if (!matrix) {
    const from = edges.table.column(edges.cols.source as string);
    const to = edges.table.column(edges.cols.target as string);
    for (let k = 0; k < from.length; k++) {
      const a = groupValue(from[k]);
      const b = groupValue(to[k]);
      if (isMissing(a) || isMissing(b)) continue;
      source.push(add(a));
      target.push(add(b));
      kept.push(k);
    }
  }
  // Without an id column, row `i` of the node table (or of the options' arrays) is node `i`.
  if (idColumn === undefined)
    rows.forEach((_, i) => (rows[i] = i < nodes.table.length ? i : undefined));
  const nodeValues = (column: string): unknown[] => {
    const values = nodes.table.column(column);
    return rows.map((row) => (row === undefined ? null : (plainValue(values[row]) ?? null)));
  };
  const given = nodes.cols.label === undefined ? [] : nodeValues(nodes.cols.label);
  return {
    o,
    edges,
    nodes,
    matrix,
    ids,
    labels: ids.map((id, i) => valueText(isMissing(given[i]) ? id : given[i])),
    source,
    target,
    nodeValues,
    linkValues(column) {
      const values = edges.table.column(column);
      return kept.map((k) => plainValue(values[k]) ?? null);
    },
  };
}

/**
 * The style of every value of a grouping column, as the engine assigns them: the map's entries,
 * then the sequence, to the values `categoryOrders` lists and then in order of first appearance.
 */
function styles(
  args: Args,
  column: string,
  values: readonly unknown[],
  given: unknown,
  sequence: readonly unknown[],
): (value: unknown) => unknown {
  if (given === 'identity') return (value) => value;
  const map = new Map<string, unknown>(Object.entries((given ?? {}) as Record<string, unknown>));
  const orders = (args.options['categoryOrders'] ?? {}) as Record<string, readonly unknown[]>;
  for (const value of [...(orders[column] ?? []), ...values]) {
    const key = valueText(groupValue(value));
    if (!isMissing(value) && !map.has(key)) map.set(key, sequence[map.size % sequence.length]);
  }
  return (value) => (isMissing(value) ? null : map.get(valueText(value)));
}

/**
 * The hover label of the nodes or of the links: px's `label=value` lines, with the columns that
 * are not trace attributes read from `customdata`.
 */
function hover(args: Args, values: (column: string) => unknown[], count: number) {
  const custom: string[] = [];
  const lines = new Map<string, string>();
  const shown = new Set<string>();
  const at = (column: string): string => {
    let k = custom.indexOf(column);
    if (k < 0) k = custom.push(column) - 1;
    return `%{customdata[${k}]}`;
  };
  return {
    /** The template variable of a column, which goes to `customdata`. */
    at,
    /**
     * Add the line of a column (`variable`: the trace's own, else from `customdata`). A column
     * has one line: its first.
     */
    line(column: string | undefined, variable?: string, label?: string): void {
      // `hoverData` as an object hides (`false`) or formats (`':.2f'`) a column's line.
      const how = column === undefined ? undefined : args.hoverFormats.get(column);
      if (how === false || (column !== undefined && shown.has(column))) return;
      if (column !== undefined) shown.add(column);
      const v = variable ?? at(column ?? '');
      lines.set(
        label ?? args.label(column ?? ''),
        typeof how === 'string' ? v.replace('}', `${how}}`) : v,
      );
    },
    /** Write `customdata` and `hovertemplate` on the container. */
    write(container: Record<string, unknown>, header = ''): void {
      if (custom.length > 0) {
        const data = custom.map(values);
        container['customdata'] = Array.from({ length: count }, (_, i) => data.map((d) => d[i]));
      }
      const body = [...lines].map(([label, v]) => `${label}=${v}`).join('<br>');
      container['hovertemplate'] = `${header}${body}<extra></extra>`;
    },
  };
}

/** What every Express figure's layout has: size, legend, title or top margin, template. */
function baseLayout(args: Args): Record<string, unknown> {
  const o = args.options;
  const layout: Record<string, unknown> = { legend: { tracegroupgap: 0 } };
  for (const key of ['height', 'width']) if (o[key] !== undefined) layout[key] = o[key];
  const margin = (args.template?.layout as { margin?: { t?: unknown } } | undefined)?.margin;
  if (o['title'] !== undefined) layout['title'] = { text: o['title'] };
  else if (margin?.t === undefined) layout['margin'] = { t: 60 };
  if (o['template'] !== undefined) layout['template'] = o['template'];
  return layout;
}

/**
 * The figure of one `graph` or `chord` trace: the `node` and `link` containers both take, colors
 * by group (with a legend) or by value (`graph`: a colorscale on `coloraxis`), what only one of
 * them has (sizes, symbols, positions and the layout of a `graph`; the matrix of a `chord`), and
 * the hover labels.
 */
function nodeLink(fn: 'graph' | 'chord', data: unknown, options: Options): ExpressFigure {
  const r = read(fn, data, options);
  const { o, nodes, edges } = r;
  const layout = baseLayout(nodes);

  const node: Record<string, unknown> = { label: r.labels };
  const nodeHover = hover(nodes, r.nodeValues, r.ids.length);
  for (const column of nodes.lists.customData ?? []) nodeHover.at(column);
  const hoverName = nodes.cols.hoverName;
  const header = hoverName === undefined ? '' : `<b>${nodeHover.at(hoverName)}</b><br><br>`;
  const named = nodes.cols.label ?? nodes.cols.id;
  nodeHover.line(named, '%{label}', nodes.label(named ?? 'node'));

  const color = nodes.cols.color;
  if (color === undefined) {
    // The trace takes its colors from the colorway: one for the nodes of a graph, one per node
    // of a chord.
    if (o['colorDiscreteSequence'] !== undefined) layout['colorway'] = [...nodes.colorway];
  } else {
    const values = r.nodeValues(color);
    if (fn === 'graph' && nodes.table.type(color) === 'numeric') {
      node['color'] = values;
      node['coloraxis'] = 'coloraxis';
      layout['coloraxis'] = {
        colorbar: { title: { text: nodes.label(color) } },
        ...colorscaleAttributes(nodes),
      };
      nodeHover.line(color, '%{color}');
    } else if (o['colorDiscreteMap'] === 'identity') {
      node['color'] = values;
    } else {
      // One group per value: the trace colors the groups from the colorway in order of first
      // appearance and lists them in the legend, so the colors go there, in that order.
      const groups = values.map((v) => (isMissing(v) ? null : valueText(v)));
      const style = styles(nodes, color, values, o['colorDiscreteMap'], nodes.colorway);
      const way = [...new Set(groups.filter((g) => g !== null))].map(style);
      const dflt = nodes.colorway;
      if (
        o['colorDiscreteSequence'] !== undefined ||
        way.some((c, g) => c !== dflt[g % dflt.length])
      ) {
        layout['colorway'] = way;
      }
      node['group'] = groups;
      (layout['legend'] as Record<string, unknown>)['title'] = { text: nodes.label(color) };
      nodeHover.line(color, '%{group}');
    }
  }

  const link: Record<string, unknown> = r.matrix ? {} : { source: r.source, target: r.target };
  const linkHover = hover(edges, r.linkValues, r.source.length);
  const { source, target, weight, linkLabel, linkColor } = edges.cols;
  linkHover.line(source, '%{source.label}', edges.label(source ?? 'source'));
  linkHover.line(target, '%{target.label}', edges.label(target ?? 'target'));
  if (weight !== undefined) link['value'] = r.linkValues(weight);
  if (weight !== undefined || r.matrix) {
    linkHover.line(weight, '%{value}', edges.label(weight ?? 'value'));
  }
  if (linkLabel !== undefined) {
    link['label'] = r.linkValues(linkLabel);
    linkHover.line(linkLabel, '%{label}');
  }
  if (linkColor !== undefined) {
    const values = r.linkValues(linkColor);
    link['color'] = values.map(styles(edges, linkColor, values, o['linkColorMap'], edges.colorway));
    if (o['linkColorMap'] !== 'identity') linkHover.line(linkColor);
  }
  for (const column of edges.lists.linkHoverData ?? []) linkHover.line(column);

  const trace: Record<string, unknown> = { type: fn, node, link };
  if (fn === 'chord') {
    // The matrix itself, not a copy: the trace reads it.
    if (r.matrix) trace['matrix'] = r.matrix;
    if (o['directed'] !== undefined) trace['directed'] = o['directed'];
  } else {
    const size = o['size'];
    const measure = typeof size === 'string' && SIZE_BY.includes(size);
    // A column called `degree` wins over the measure.
    const sizeColumn = nodes.cols.size ?? (measure && nodes.table.has(size) ? size : undefined);
    const largest = o['sizeMax'] as number | undefined;
    if (sizeColumn !== undefined) {
      // Diameters as `node.sizeby` gives them: from 6 px, areas growing with the value.
      const values = r.nodeValues(sizeColumn).map((v) => (typeof v === 'number' && v > 0 ? v : 0));
      const max = Math.max(0, ...values);
      node['size'] = values.map(
        (v) => 6 + ((largest ?? 30) - 6) * Math.sqrt(max > 0 ? v / max : 0),
      );
      nodeHover.line(sizeColumn);
    } else if (measure) {
      node['sizeby'] = size;
      if (largest !== undefined) node['sizerange'] = [6, largest];
      nodeHover.line(undefined, `%{${size}}`, nodes.label(size));
    }
    const symbol = nodes.cols.symbol;
    if (symbol !== undefined) {
      const values = r.nodeValues(symbol);
      node['symbol'] = values.map(
        styles(nodes, symbol, values, o['symbolMap'], nodes.symbolSequence),
      );
      if (o['symbolMap'] !== 'identity') nodeHover.line(symbol);
    }
    const value = nodes.cols.value;
    if (value !== undefined) {
      node['value'] = r.nodeValues(value);
      nodeHover.line(value, '%{value}');
    }
    for (const letter of ['x', 'y'] as const) {
      const column = nodes.cols[letter];
      if (column === undefined) continue;
      node[letter] = r.nodeValues(column);
      // Hover labels know positions that are data, which a computed arrangement's are not.
      if ((o['arrangement'] ?? 'preset') === 'preset') nodeHover.line(column, `%{${letter}}`);
    }
    if (o['directed'] === true) link['arrow'] = { end: true };
    for (const key of TRACE_KEYS) {
      const v = o[key];
      if (v !== undefined) trace[key] = isPlainObject(v) ? { ...v } : v;
    }
  }
  for (const column of nodes.lists.hoverData ?? []) nodeHover.line(column);
  nodeHover.write(node, header);
  linkHover.write(link);
  return { data: [trace], layout };
}

function buildAdjacencyMatrix(
  data: GraphInput | GraphMatrix | null | undefined,
  options: AdjacencyMatrixOptions,
): ExpressFigure {
  const fn = 'adjacencyMatrix';
  const r = read(fn, data, options as Options);
  const { o, nodes, edges, matrix } = r;
  let order = r.ids.map((_, i) => i);
  if (order.length === 0) throw new Error(`${fn}: the data has no nodes.`);

  // `flow[i][j]`: the summed weight of the links from node `i` to node `j`.
  const flow = order.map((i) =>
    order.map((j) => {
      const v = matrix?.[i]?.[j];
      return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    }),
  );
  const cell = (i: number, j: number): number => (flow[i] as number[])[j] as number;
  const { source, target, weight } = edges.cols;
  const weights = weight === undefined ? [] : r.linkValues(weight);
  r.source.forEach((s, k) => {
    // A link without a positive weight counts as 1, as it does for the traces.
    const w = weights[k];
    const t = r.target[k] as number;
    (flow[s] as number[])[t] = cell(s, t) + (typeof w === 'number' && w > 0 ? w : 1);
  });
  const degree = flow.map((row, i) => row.reduce((sum, v, j) => sum + v + cell(j, i), 0));

  const color = nodes.cols.color;
  const given = o['order'] ?? (color === undefined ? 'input' : 'group');
  if (typeof given !== 'string') {
    order = [...new Set(given as Iterable<number>)].filter((i) => i in flow);
  } else if (given !== 'input') {
    const block = order.map(() => 0);
    if (given !== 'degree') {
      if (given !== 'group' && given !== 'community') {
        throw new Error(
          `${fn}: order '${given}' is not 'input', 'degree', 'group' or 'community'.`,
        );
      }
      if (color === undefined) {
        throw new Error(
          `${fn}: order '${given}' needs 'color', the nodes' groups or communities. Express detects none: pass louvain(graph) of @mk7s/holochart-traces-graph.`,
        );
      }
      const keys = r.nodeValues(color).map(valueText);
      const orders = (o['categoryOrders'] ?? {}) as Record<string, readonly unknown[]>;
      const names = [...new Set([...(orders[color] ?? []).map(valueText), ...keys])];
      if (given === 'community') {
        // The largest first; equal sizes keep the order of their first nodes.
        const size = (name: string): number => keys.filter((key) => key === name).length;
        names.sort((a, b) => size(b) - size(a));
      }
      keys.forEach((key, i) => (block[i] = names.indexOf(key)));
    }
    order.sort(
      (a, b) =>
        (block[a] as number) - (block[b] as number) ||
        (degree[b] as number) - (degree[a] as number) ||
        a - b,
    );
  }

  const directed = matrix !== undefined || o['directed'] === true;
  const z = order.map((i) => order.map((j) => cell(i, j) + (directed || i === j ? 0 : cell(j, i))));
  // Tick text: the labels, with the id added to those that repeat (an axis has one of each).
  const ticks = order.map((i) => {
    const text = r.labels[i] as string;
    return r.labels.indexOf(text) === r.labels.lastIndexOf(text)
      ? text
      : `${text} (${valueText(r.ids[i])})`;
  });

  const from = edges.label(source ?? 'source');
  const to = edges.label(target ?? 'target');
  const value = edges.label(weight ?? (matrix ? 'value' : 'count'));
  const figure = imshow(z, {
    x: ticks,
    y: ticks,
    labels: { color: value, ...(directed ? { x: to, y: from } : {}) },
    ...defined(pick(FIGURE_KEYS, o)),
  });
  // Labels are categories whatever they look like (`'1'`, `'2024-01-01'`).
  for (const axis of ['xaxis', 'yaxis']) {
    (figure.layout[axis] as Record<string, unknown>)['type'] = 'category';
  }
  const ends = directed ? `${from}=%{y}<br>${to}=%{x}` : '%{y} – %{x}';
  for (const trace of figure.data) {
    trace['hovertemplate'] = `${ends}<br>${value}=%{z}<extra></extra>`;
  }
  return figure;
}

/**
 * A network graph: one `graph` trace of the nodes and links of an edge table (`source`, `target`,
 * `weight`), with an optional node table (`nodes`, matched by `id`) for labels, colors, sizes,
 * symbols, positions and hover text. `color` groups the nodes (one color and legend item per
 * value), or maps a numeric column through a colorscale on `coloraxis`; `size` takes a column or
 * `'degree'`; `directed` draws arrowheads; `arrangement` picks the layout, with its options under
 * the trace's own name (`force`, `layered`, `tree`, `arc`, `hive`). Drawing the figure needs the
 * graph package: `import '@mk7s/holochart/graph'`.
 *
 * @experimental
 * @example
 * ```ts
 * const figure = graph(emails, {
 *   source: 'from', target: 'to', weight: 'count',
 *   nodes: people, id: 'name', color: 'team', size: 'degree',
 * });
 * ```
 */
export const graph = expressFunction<GraphOptions>((data, options) =>
  // `expressFunction` types its first argument as table data; `GraphFunction` retypes it.
  nodeLink('graph', data, options as Options),
) as unknown as GraphFunction<GraphInput, GraphOptions>;

/**
 * A chord diagram: one `chord` trace, the nodes as arcs of a ring and the links as ribbons, from
 * an edge table (with the options of {@link graph} that are about data) or from a square matrix
 * (`matrix[i][j]`: the flow from node `i` to node `j`) with `label` as an array. `color` groups
 * the nodes: the nodes of a group sit together, share a color and a legend item.
 *
 * @experimental
 * @example
 * ```ts
 * const figure = chord(trips, { source: 'from', target: 'to', weight: 'trips' });
 * const same = chord(matrix, { label: ['Harbor', 'Old Town', 'Campus'] });
 * ```
 */
export const chord = expressFunction<ChordOptions>((data, options) =>
  nodeLink('chord', data, options as Options),
) as unknown as GraphFunction<GraphInput | GraphMatrix, ChordOptions>;

/**
 * A graph as a matrix (backlog G8): one `heatmap` trace on `coloraxis`, a row and a column per
 * node, each cell the summed `weight` (or the number) of the links between the two, with square
 * cells, the first node at the top and the labels on both axes. `order` sorts rows and columns so
 * that clusters show as blocks on the diagonal. It reads where a node-link drawing is a hairball,
 * and needs only the `heatmap` trace, which the full bundle has.
 *
 * @experimental
 * @example
 * ```ts
 * const figure = adjacencyMatrix(emails, {
 *   source: 'from', target: 'to', weight: 'count', nodes: people, id: 'name', color: 'team',
 * });
 * ```
 */
export const adjacencyMatrix = expressFunction<AdjacencyMatrixOptions>((data, options) =>
  buildAdjacencyMatrix(data, options),
) as unknown as GraphFunction<GraphInput | GraphMatrix, AdjacencyMatrixOptions>;
