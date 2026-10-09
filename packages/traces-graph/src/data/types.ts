/**
 * Graph data as the adapters return it and the metrics read it (backlog G9): the `node` and
 * `link` containers of a `graph` trace, with links as node indices. Spread it into a trace:
 * `{ type: 'graph', ...fromNodeLink(json) }`. `chord` and `sankey` take the same two containers.
 */

/** The `node` container: one entry per node in every array that is present. */
export interface GraphNodeData {
  label: string[];
  /** Group of each node (a community, a package, a DOT cluster); `null` for none. */
  group?: (string | number | null)[];
  /** Positions, when the source had them. `NaN` where a node has none. */
  x?: number[];
  y?: number[];
  /** A number per node (the source's `value`, `size` or `weight`). `NaN` where it has none. */
  value?: number[];
  color?: (string | null)[];
  /** The node's remaining attributes in the source, as they were. */
  customdata?: unknown[];
}

/** The `link` container: one entry per link in every array that is present. */
export interface GraphLinkData {
  /** Index into the nodes. */
  source: number[];
  target: number[];
  /** Weight of each link, when the source had weights. `1` where a link has none. */
  value?: number[];
  label?: (string | null)[];
  color?: (string | null)[];
  /** The link's remaining attributes in the source, as they were. */
  customdata?: unknown[];
}

/** What an adapter returns. */
export interface GraphData {
  node: GraphNodeData;
  link: GraphLinkData;
  /**
   * Whether the source said its links have a direction. Not a trace attribute: a figure draws
   * arrows with `link.arrow.end`, which Express sets from this.
   */
  directed: boolean;
}

/** Anything with nodes and links by index: a {@link GraphData}, or a trace's two containers. */
export interface GraphLike {
  readonly node?:
    | { readonly label?: ArrayLike<unknown>; readonly group?: ArrayLike<unknown> | undefined }
    | undefined;
  readonly link: {
    readonly source: ArrayLike<number>;
    readonly target: ArrayLike<number>;
    readonly value?: ArrayLike<number> | undefined;
  };
  readonly directed?: boolean | undefined;
}

/**
 * Number of nodes of `graph`: its labels, or one more than the largest index a link uses when it
 * has no labels. `nodes` overrides both.
 */
export function nodeCount(graph: GraphLike, nodes?: number): number {
  if (nodes !== undefined) return nodes;
  const labels = graph.node?.label?.length;
  if (labels !== undefined) return labels;
  let max = -1;
  const { source, target } = graph.link;
  for (let k = 0; k < source.length; k++) {
    max = Math.max(max, source[k] as number, target[k] as number);
  }
  return max + 1;
}

/** `true` for an index of an existing node. */
export function validIndex(i: unknown, nodes: number): i is number {
  return typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < nodes;
}
