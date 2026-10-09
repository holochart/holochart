/**
 * @mk7s/holochart-traces-graph — network graphs (backlog G1–G10, ADR-029): the `graph` trace
 * (nodes and links at given positions or placed by a layout). It is not part of the
 * `@mk7s/holochart` bundle: register it yourself (`register(...tracesGraph)`), or import
 * `@mk7s/holochart/graph`.
 */
import type { Registrable } from '@mk7s/holochart-runtime';
import { sceneComponent } from '@mk7s/holochart-traces-3d';
import { chord } from './chord/index.ts';
import { graph } from './graph/index.ts';
import { graph3d } from './graph3d/index.ts';

export { chord, chordAttributes, chordLayout, matrixLinks } from './chord/index.ts';
export type {
  ChordArc,
  ChordCalc,
  ChordGroupArc,
  ChordLayout,
  ChordLayoutInput,
  ChordLayoutOptions,
  ChordLinkSort,
  ChordNodeSort,
  ChordRibbon,
  MatrixLinks,
} from './chord/index.ts';
export { graph, graphAttributes, graphPath } from './graph/index.ts';
export type {
  BundleSpace,
  GraphBundle,
  GraphCalc,
  GraphForce,
  GraphGuides,
  GraphModel,
  GraphPathInfo,
  GraphPending,
  GraphTree,
  LabelRule,
  PlotArea,
  RealAxis,
} from './graph/index.ts';
export {
  forceLayout3d,
  graph3d,
  graph3dAttributes,
  GRAPH3D_ARRANGEMENTS,
  layeredLayout3d,
} from './graph3d/index.ts';
export type {
  Graph3dArrangement,
  Graph3dCalc,
  Graph3dPlanes,
  Layered3dOptions,
  Layered3dResult,
} from './graph3d/index.ts';
export {
  GRAPH_ARRANGEMENTS,
  registerGraphLayout,
  circularLayout,
  gridLayout,
  presetLayout,
} from './layout/index.ts';
export type { CircularOptions, GraphArrangement, GridOptions, NodeSort } from './layout/index.ts';
// The layouts behind the computed arrangements of `graph` (backlog G2–G4, G8), as pure functions
// over a `LayoutGraph`, with their options. (`forceLayout` and `ForceOptions` are exported below.)
export {
  arcLayout,
  createForceSimulation,
  dendrogramLayout,
  hiveLayout,
  layeredLayout,
  radialTreeLayout,
  tidyTreeLayout,
} from './layout/index.ts';
export type {
  ArcLayoutOptions,
  ArcLayoutResult,
  ArcOrder,
  ArcSides,
  CollapsedInput,
  DendrogramOptions,
  DendrogramResult,
  ForceAlgorithm,
  HiveLayoutOptions,
  HiveLayoutResult,
  LayeredOptions,
  LayeredRankdir,
  LayeredRanker,
  LayeredRouting,
  LinkWeightMode,
  PerNode,
  RadialTreeOptions,
  RadialTreeResult,
  TidyTreeOptions,
  TreeLayoutResult,
  TreeLinkShape,
  TreeOptions,
  TreeOrientation,
  TreeSort,
} from './layout/index.ts';
export type {
  GraphLayout,
  LayoutCluster,
  LayoutGraph,
  LayoutResult,
  LayoutSimulation,
  LinkRoute,
} from './layout/types.ts';
// Large graphs (backlog G7): layout off the main thread with positions streamed back
// (`layoutInWorker`; the worker itself is `dist/layout-worker.js`), and edge bundling. The
// `graph` trace uses them through a lazy chunk of its own (`worker`, `link.bundle`;
// `graph/pending.ts`); they are exported for apps that lay graphs out themselves. `forceLayout`
// is here for callers that compare or fall back to the blocking layout.
export { forceLayout } from './layout/force/index.ts';
export type { ForceOptions } from './layout/force/index.ts';
export type { ForceStart } from './layout/force/warm.ts';
export { bundleLinks, forceBundle, hierarchicalBundle } from './layout/bundle/index.ts';
export type {
  BundleGraph,
  BundleOptions,
  BundlePositions,
  BundleResult,
  ForceBundleOptions,
  ForceBundleResult,
  HierarchicalBundleOptions,
} from './layout/bundle/index.ts';
export {
  GraphLayoutWorker,
  LAYOUT_PROTOCOL,
  WORKER_ARRANGEMENTS,
  createLayoutHandler,
  decodeResult,
  encodeResult,
  graphLayoutWorker,
  isLayoutAbort,
  layoutInWorker,
  setGraphWorkerUrl,
} from './worker/index.ts';
export type {
  EncodedLayoutResult,
  EncodedRoutes,
  GraphLayoutWorkerOptions,
  LayoutBundleInfo,
  LayoutHandler,
  LayoutHandlerEnvironment,
  LayoutMessage,
  LayoutProgress,
  LayoutProgressOptions,
  LayoutRequest,
  LayoutResponse,
  LayoutRunInfo,
  LayoutRunOptions,
  LayoutThread,
  LayoutWorkerLike,
  PostLayoutResponse,
  WorkerArrangement,
} from './worker/index.ts';
// Data in (backlog G9): adapters from graph formats and the measures nodes are colored and sized
// by. Pure functions, usable without registering a trace. `degrees` here is the public measure;
// the layouts' own `degrees` (`layout/order.ts`) stays internal.
export {
  adjacencyMatrix,
  connectedComponents,
  degrees,
  fromAdjacencyMatrix,
  fromDot,
  fromEdgeList,
  fromNodeLink,
  louvain,
  modularity,
} from './data/index.ts';
export type {
  AdjacencyMatrix,
  AdjacencyMatrixOptions,
  AdjacencyOptions,
  CommunityOptions,
  Components,
  Degrees,
  EdgeListOptions,
  GraphData,
  GraphLike,
  GraphLinkData,
  GraphNodeData,
  MetricOptions,
} from './data/index.ts';

/** Every graph module, for `register(...tracesGraph)`. */
export const tracesGraph: readonly Registrable[] = [graph, chord];

/**
 * The `graph3d` trace with the 3D scene it is drawn in, for `register(...tracesGraph3d)`. Apart
 * from `tracesGraph`, so that an app with 2D graphs only does not bundle the 3D package.
 */
export const tracesGraph3d: readonly Registrable[] = [sceneComponent, graph3d];

/**
 * Figure input types of this package's traces (backlog S1.6): one per trace type (`GraphTrace`)
 * and their union, generated from the attribute schemas by `tools/schema-gen`.
 */
export type * from './generated/traces.ts';
