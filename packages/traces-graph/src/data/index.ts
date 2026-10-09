/**
 * Data in (backlog G9): adapters from common graph formats to the `node` / `link` containers of
 * the `graph`, `chord` and `sankey` traces, and the measures nodes are usually colored and sized
 * by. Pure functions: usable without registering any trace.
 */
export {
  fromAdjacencyMatrix,
  fromEdgeList,
  fromNodeLink,
  type AdjacencyMatrixOptions,
  type EdgeListOptions,
} from './adapters.ts';
export { fromDot } from './dot.ts';
export {
  adjacencyMatrix,
  connectedComponents,
  degrees,
  louvain,
  modularity,
  type AdjacencyMatrix,
  type AdjacencyOptions,
  type CommunityOptions,
  type Components,
  type Degrees,
  type MetricOptions,
} from './metrics.ts';
export type { GraphData, GraphLike, GraphLinkData, GraphNodeData } from './types.ts';
