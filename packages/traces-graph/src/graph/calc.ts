/**
 * `graph` calc (backlog G1–G4, ADR-029): the model of the trace, the layout `arrangement` names,
 * and the node positions in the linear coordinates of the trace's axes.
 *
 * Positions the figure gives (`node.x` / `node.y`) go through the axis scales, so with
 * `arrangement: 'preset'` they may be dates, categories or values on a log axis. Every layout
 * gets them (a node with both is pinned for the layouts that move nodes) and returns positions in
 * layout units, which are put on the axes as they are: the axes of a computed arrangement are
 * linear, hidden and locked to one scale (`axisHints`), and autorange fits the result to the plot
 * area with room for the nodes.
 *
 * Two arrangements can keep one axis as a real scale (`realAxisOf`), and then the two axes have
 * scales of their own:
 *
 * - a dendrogram with `node.value`: the layout's heights are turned back into values along that
 *   axis (nodes and routes alike), so the axis shows the data's units;
 * - a force layout whose nodes all have an `x` and no `y` (or the reverse): the given values are
 *   spread over the width of the plot area for the layout, which then moves the nodes along the
 *   other axis only, and the nodes are drawn at the values themselves.
 *
 * A node is not drawn (`hidden`) when it has no position under `'preset'`, when the layout left it
 * out (a collapsed subtree), when the layout returned no finite position for it, or when its group
 * is hidden through the legend (`layout.hiddenlabels`). Its links are not drawn either. Hidden
 * nodes still take part in the layout and in autorange, so hiding a group does not move the rest.
 *
 * What a layout says beyond positions is kept for the view: routes, the links to draw in the
 * secondary style (`reversed` of a layered layout, the links of a tree arrangement that are not
 * tree edges), the links not to draw (within an axis of a hive plot), group frames, the tree
 * that was drawn (for collapsing), where labels have room, the axes of a hive plot. A force
 * layout also leaves what `force.simulate` needs to run it again in steps.
 */
import { isArrayLike, warnOnce, type FullTrace } from '@mk7s/holochart-core';
import { linearExtremes, type CalcContext, type TraceExtremes } from '@mk7s/holochart-runtime';
import type { ArcLayoutResult } from '../layout/arc.ts';
import { circularLayout } from '../layout/circular.ts';
import type { ForceOptions } from '../layout/force/index.ts';
import type { HiveLayoutResult } from '../layout/hive.ts';
import { resolveGraphLayout, type GraphArrangement, GRAPH_ARRANGEMENTS } from '../layout/index.ts';
import {
  buildForest,
  type DendrogramResult,
  type RadialTreeResult,
  type TreeLayoutResult,
} from '../layout/tree/index.ts';
import type { LayoutCluster, LayoutGraph, LayoutResult, LinkRoute } from '../layout/types.ts';
import { pinnedNodes } from './drag.ts';
import { LOOP_REACH, LOOP_STEP } from './geometry.ts';
import { LABEL_GAP, labelBox, nodePlacements, type LabelRule } from './labels.ts';
import {
  buildGraphModel,
  LABEL_LINE_HEIGHT,
  labelFont,
  layoutGraphOf,
  nodeLabel,
  type GraphModel,
} from './model.ts';
import {
  arcOptionsOf,
  collapsedMask,
  equalScales,
  forceOptionsOf,
  hiveOptionsOf,
  labelWidthEstimate,
  layeredOptionsOf,
  layoutExtents,
  plotAreaOf,
  realAxisOf,
  RING_REACH,
  SIMULATE_MAX_LINKS,
  SIMULATE_MAX_NODES,
  treeOptionsOf,
  treeOrientationOf,
  type PlotArea,
  type RealAxis,
} from './options.ts';
import {
  bundleAskOf,
  bundledRoutes,
  bundlerNow,
  BUNDLES,
  bundleThread,
  dataSpace,
  LAYOUTS,
  layoutThread,
  toSpace,
  UNIT_SPACE,
  workerOf,
  type BundleAsk,
  type GraphBundle,
  type GraphPending,
} from './pending.ts';
import { linkCurves } from './style.ts';
import { forceRunOf, forceStartOf, warmForceLayout, type ForceStart } from './warm.ts';

/** The tree a tree arrangement drew, for collapsing and expanding. */
export interface GraphTree {
  /** Each node's parent in the tree, -1 for a root. */
  readonly parent: Int32Array;
  /** How many children each node has (whether they show or not). */
  readonly children: Int32Array;
  /** 1 where the node is collapsed: it has children and they are folded away. */
  readonly collapsed: Uint8Array;
  /**
   * Where the layout put every node, in linear coordinates, the hidden ones included: each sits
   * on its nearest ancestor that shows, which is where it folds into and unfolds from.
   */
  readonly x: Float64Array;
  readonly y: Float64Array;
}

/** Lines an arrangement draws behind the graph (the axes of a hive plot) and their names. */
export interface GraphGuides {
  /** Polylines in linear coordinates: the vertex stream and where each line after the first starts. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly starts: Uint32Array;
  /** A name at the end of each line: where, which way it points (y up) and for which group. */
  readonly titles: readonly {
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly ux: number;
    readonly uy: number;
    readonly group: number;
  }[];
}

/** What `force.simulate` needs to run the layout of a calc again, step by step. */
export interface GraphForce {
  /** The graph and the options the layout ran with. */
  readonly graph: LayoutGraph;
  readonly options: ForceOptions & { readonly ticks: number };
  /** `force.simulate`, for a graph small enough to step on the main thread. */
  readonly simulate: boolean;
  /**
   * `force.start`: the positions the layout went on from instead of starting from the spiral,
   * and how warm it was there (`warm.ts`).
   */
  readonly start?: ForceStart | undefined;
}

/** @experimental */
export interface GraphCalc {
  readonly model: GraphModel;
  /** Node count (`model.nodes`). */
  readonly length: number;
  /** Node centers in linear coordinates; finite for every node that is drawn. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** 1 where the node is not drawn (see the module comment). */
  readonly hidden: Uint8Array;
  /** The arrangement that placed the nodes (`'circular'` when the one asked for is missing). */
  readonly arrangement: GraphArrangement;
  /** Positions are the figure's data on the axes (`arrangement: 'preset'`). */
  readonly preset: boolean;
  /** From the layout, by link (see `LayoutResult`): routed links, reversed links, group frames. */
  readonly routes: readonly (LinkRoute | undefined)[] | undefined;
  readonly reversed: Uint8Array | undefined;
  readonly clusters: readonly LayoutCluster[] | undefined;
  // What follows is the 2D trace's own (`graph3d` builds its calc without them: all optional).
  /**
   * Positions are layout units on both axes (a computed arrangement without a real axis): a unit
   * is a px at the size the graph was laid out for. Unset: as for any computed arrangement.
   */
  readonly units?: boolean | undefined;
  /**
   * The two axes are locked to one scale (`units`, but for a tidy tree and a dendrogram, which
   * fill the plot area along each axis). Curves and loops are then known in linear coordinates.
   * Unset: as for any computed arrangement.
   */
  readonly equal?: boolean | undefined;
  /** The axis that is a real scale under a computed arrangement, if one is. */
  readonly real?: RealAxis | undefined;
  /** The plot area the graph was laid out for, in px (an estimate: see `plotAreaOf`). */
  readonly area?: PlotArea | undefined;
  /**
   * 1 for the links drawn in the `link.secondary` style: the links a layered layout turned around
   * to break cycles (`reversed`), or under a tree arrangement the links that are not tree edges.
   */
  readonly secondary?: Uint8Array | undefined;
  /** 1 for the links that are not drawn at all (both ends on one axis of a hive plot). */
  readonly omitted?: Uint8Array | undefined;
  /** The tree of a tree arrangement. */
  readonly tree?: GraphTree | undefined;
  /** Where the labels of the arrangement have room (`node.textposition: 'auto'`). */
  readonly labelRule?: LabelRule | undefined;
  readonly guides?: GraphGuides | undefined;
  /** Set when a force layout placed the nodes. */
  readonly force?: GraphForce | undefined;
  /**
   * A fingerprint of everything the layout read (the graph, its sizes, the given positions and
   * the options): two calcs with the same key have the same positions, whatever else changed.
   */
  readonly layoutKey?: string | undefined;
  /** Group indices hidden through the legend. */
  readonly hiddenGroups: ReadonlySet<number>;
  /**
   * What this calc waits for (`pending.ts`): its layout, which runs off the main thread (the
   * nodes are at a cheap placement until it arrives), or the routes of its bundled links (which
   * are straight until then). The view asks for it, and calc runs again when it is there.
   */
  readonly pending?: GraphPending | undefined;
  /** The bundling of the links (`link.bundle`), when some are bundled. */
  readonly bundle?: GraphBundle | undefined;
}

/**
 * What the helpers shared with `graph3d` read of a calc (styles, hover fields, the legend): the
 * model and the groups hidden through the legend, and for the link colors the secondary links,
 * which a 3D graph does not have. A `GraphCalc` and a `Graph3dCalc` both fit.
 */
export type GraphModelCalc = Pick<GraphCalc, 'model' | 'hiddenGroups'> &
  Partial<Pick<GraphCalc, 'secondary'>>;

type Container = Readonly<Record<string, unknown>>;

function container(trace: Container, key: string): Container {
  const v = trace[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Container) : {};
}

/** The arrangement of a defaulted trace. */
export function arrangementOf(trace: Container): GraphArrangement {
  const a = trace['arrangement'];
  return (GRAPH_ARRANGEMENTS as readonly unknown[]).includes(a) ? (a as GraphArrangement) : 'force';
}

/**
 * Positions along one axis as linear coordinates, one per node; `NaN` where there is none.
 * `scale`: the axis scale the values go through (data → linear); without one, numbers are taken
 * as they are.
 */
export function positions(
  values: unknown,
  nodes: number,
  scale: { d2lArray(values: ArrayLike<unknown>): ArrayLike<number> } | undefined,
): Float64Array {
  const out = new Float64Array(nodes).fill(NaN);
  if (!isArrayLike(values) || typeof values === 'string') return out;
  const given = values as ArrayLike<unknown>;
  const n = Math.min(nodes, given.length);
  if (scale) {
    const linear = scale.d2lArray(given);
    for (let i = 0; i < n; i++) out[i] = Number.isFinite(linear[i]) ? linear[i]! : NaN;
    return out;
  }
  for (let i = 0; i < n; i++) {
    const v = given[i];
    const l = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
    out[i] = Number.isFinite(l) ? l : NaN;
  }
  return out;
}

let warnedThrow = false;

/** Run a layout; one that throws is reported once and replaced by `circular`. */
function runLayout(
  layout: (graph: LayoutGraph, options: unknown) => LayoutResult,
  graph: LayoutGraph,
  options: unknown,
): { result: LayoutResult; failed: boolean } {
  try {
    return { result: layout(graph, options), failed: false };
  } catch (error) {
    if (!warnedThrow) {
      warnedThrow = true;
      console.warn("[holochart] graph: the layout threw; drawn with 'circular'.", error);
    }
    return { result: circularLayout(graph, undefined), failed: true };
  }
}

/** Group indices whose name is in `layout.hiddenlabels`. */
export function hiddenGroupsOf(model: GraphModel, hiddenlabels: unknown): Set<number> {
  const out = new Set<number>();
  if (!isArrayLike(hiddenlabels) || model.groupNames.length === 0) return out;
  const hidden = new Set(Array.from(hiddenlabels as ArrayLike<unknown>, String));
  model.groupNames.forEach((name, g) => {
    if (hidden.has(name)) out.add(g);
  });
  return out;
}

/** What the layouts return beyond {@link LayoutResult}, each under its own arrangement. */
type AnyResult = LayoutResult &
  Partial<
    Pick<TreeLayoutResult, 'parent' | 'treeLinks'> &
      Pick<RadialTreeResult, 'angle' | 'radius'> &
      Pick<DendrogramResult, 'valueAxis'> &
      Pick<HiveLayoutResult, 'axis' | 'axisAngle' | 'omitted'> &
      Pick<ArcLayoutResult, 'order'>
  >;

/** FNV-1a over the bytes of what a layout reads, as the fingerprint of its input. */
class Fingerprint {
  #h = 0x811c9dc5;

  bytes(view: ArrayBufferView | undefined): this {
    if (!view) return this.text('-');
    const b = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let h = this.#h;
    for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i]!, 0x01000193);
    this.#h = h;
    return this.text('|');
  }

  text(s: string): this {
    let h = this.#h;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    this.#h = h;
    return this;
  }

  get value(): string {
    return (this.#h >>> 0).toString(16);
  }
}

/**
 * Options as text for the fingerprint (typed arrays by content); `undefined` for options that
 * cannot be written down (a custom layout's, with a cycle in them).
 */
function optionsText(options: unknown): string | undefined {
  try {
    return (
      JSON.stringify(options, (_key, v: unknown) =>
        ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v,
      ) ?? ''
    );
  } catch {
    return undefined;
  }
}

function layoutKeyOf(
  arrangement: string,
  graph: LayoutGraph,
  options: unknown,
  start?: ForceStart,
): string {
  return (
    new Fingerprint()
      .text(`${arrangement}:${graph.nodes}:`)
      .bytes(graph.source)
      .bytes(graph.target)
      .bytes(graph.weight)
      .bytes(graph.halfWidth)
      .bytes(graph.halfHeight)
      .bytes(graph.x)
      .bytes(graph.y)
      .bytes(graph.group)
      .bytes(graph.parent)
      .bytes(graph.value)
      .bytes(start?.x)
      .bytes(start?.y)
      .text(`${start?.alpha ?? ''}`)
      // Options that cannot be written down are never the same twice.
      .text(optionsText(options) ?? String(Math.random())).value
  );
}

/** The given values along the real axis of a force layout, spread over `span` layout units. */
function spread(values: Float64Array, span: number): Float64Array {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const out = new Float64Array(values.length).fill(NaN);
  if (!(hi > lo)) {
    for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) out[i] = 0;
    return out;
  }
  const k = span / (hi - lo);
  for (let i = 0; i < values.length; i++) out[i] = (values[i]! - (lo + hi) / 2) * k;
  return out;
}

/** The room kept at each side of a timeline for its first and last nodes, in px. */
const TIMELINE_INSET = 40;

/** The options of the layout of `arrangement`, and what calc needs to know about the tree. */
function planLayout(
  trace: FullTrace,
  arrangement: GraphArrangement,
  model: GraphModel,
  graph: LayoutGraph,
  area: PlotArea,
): { options: unknown; children?: Int32Array; collapsed?: Uint8Array } {
  switch (arrangement) {
    case 'custom':
      return { options: container(trace, 'custom')['options'] };
    case 'force':
      return { options: forceOptionsOf(trace, model.nodes) };
    case 'layered':
      return { options: layeredOptionsOf(trace, model, area) };
    case 'arc':
      return { options: arcOptionsOf(trace, model) };
    case 'hive':
      return { options: hiveOptionsOf(trace) };
    case 'tree':
    case 'radial':
    case 'dendrogram': {
      // The tree the layout will draw, to know which nodes have children: their labels are
      // drawn between the levels, and they are the ones a click can fold.
      const forest = buildForest(graph);
      const n = model.nodes;
      const children = new Int32Array(n);
      for (let i = 0; i < n; i++) children[i] = forest.childStart[i + 1]! - forest.childStart[i]!;
      const folded = collapsedMask(trace, model);
      const collapsed = new Uint8Array(n);
      const inner = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (children[i]! === 0) continue;
        if (folded?.[i] === 1) collapsed[i] = 1;
        else inner[i] = 1;
      }
      return { options: treeOptionsOf(trace, arrangement, model, inner), children, collapsed };
    }
    default:
      return { options: undefined };
  }
}

/** `route` with `map` applied to its coordinates along one axis. */
function mapRoute(route: LinkRoute, axis: 'x' | 'y', map: (v: number) => number): LinkRoute {
  const points = Float64Array.from(route.points);
  for (let i = axis === 'x' ? 0 : 1; i < points.length; i += 2) points[i] = map(points[i]!);
  return { points, kind: route.kind };
}

/** The axes of a hive plot as lines from the center outwards, with the names of their groups. */
function hiveGuides(
  trace: FullTrace,
  model: GraphModel,
  result: AnyResult,
  hiddenGroups: ReadonlySet<number>,
): GraphGuides | undefined {
  const angles = result.axisAngle;
  if (!angles || angles.length === 0) return undefined;
  const { innerRadius = 40, outerRadius = 300, assign } = hiveOptionsOf(trace);
  const grouped = model.groupNames.length > 0;
  const names =
    !grouped && assign === 'direction' && angles.length === 3
      ? ['Sources', 'Between', 'Sinks']
      : undefined;
  const x: number[] = [];
  const y: number[] = [];
  const starts: number[] = [];
  const titles: GraphGuides['titles'][number][] = [];
  angles.forEach((degrees, a) => {
    if (grouped && hiddenGroups.has(a)) return;
    const rad = (degrees * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    if (x.length > 0) starts.push(x.length);
    x.push(innerRadius * ux, outerRadius * ux);
    y.push(innerRadius * uy, outerRadius * uy);
    const text = grouped ? (model.groupNames[a] ?? '') : (names?.[a] ?? '');
    if (text !== '') {
      titles.push({
        text,
        x: outerRadius * ux,
        y: outerRadius * uy,
        ux,
        uy,
        group: grouped ? a : -1,
      });
    }
  });
  if (x.length === 0) return undefined;
  return {
    x: Float64Array.from(x),
    y: Float64Array.from(y),
    starts: Uint32Array.from(starts),
    titles,
  };
}

/**
 * Where the nodes of a layout that is still to come are drawn: a force layout at its own start
 * (the spiral, or `force.start`, with the pinned nodes where they are held), which is where the
 * positions it reports set out from; any other on a circle.
 */
function placeholder(
  arrangement: GraphArrangement,
  graph: LayoutGraph,
  options: unknown,
  start: ForceStart | undefined,
): LayoutResult {
  if (arrangement !== 'force') return circularLayout(graph, undefined);
  const x = new Float64Array(graph.nodes);
  const y = new Float64Array(graph.nodes);
  forceRunOf(graph, options as GraphForce['options'], start).frame(x, y);
  return { x, y };
}

/**
 * The bundling of a calc's links (`link.bundle`): which links, along what, and in which space.
 * A link the arrangement routed keeps its route, and a loop, a link that is not drawn and a link
 * with an end that has no position are left out. `undefined` when nothing is left, or when
 * hierarchical bundling is asked for and the nodes have neither groups nor a tree.
 */
function planBundle(
  ask: BundleAsk,
  model: GraphModel,
  at: { readonly x: Float64Array; readonly y: Float64Array },
  given: {
    readonly routes: readonly (LinkRoute | undefined)[] | undefined;
    readonly omitted: Uint8Array | undefined;
    readonly parent: Int32Array | undefined;
    readonly preset: boolean;
    readonly area: PlotArea;
  },
): GraphBundle | undefined {
  const picked: number[] = [];
  for (let k = 0; k < model.links; k++) {
    const a = model.source[k]!;
    const b = model.target[k]!;
    if (a === b || given.routes?.[k] || given.omitted?.[k] === 1) continue;
    if (!Number.isFinite(at.x[a]! + at.y[a]! + at.x[b]! + at.y[b]!)) continue;
    picked.push(k);
  }
  if (picked.length === 0) return undefined;
  const grouped = model.groupNames.length > 0 && model.group.some((g) => g >= 0);
  const hierarchy: 'groups' | 'parents' | undefined = grouped
    ? 'groups'
    : given.parent
      ? 'parents'
      : undefined;
  const method = ask.method === 'auto' ? (hierarchy ? 'hierarchical' : 'force') : ask.method;
  if (method === 'hierarchical' && !hierarchy) return undefined;
  const all = picked.length === model.links;
  const space = given.preset
    ? dataSpace(at.x, at.y, given.area.width, given.area.height)
    : UNIT_SPACE;
  const options: GraphBundle['options'] =
    method === 'hierarchical'
      ? { method, strength: ask.strength, hierarchy: hierarchy! }
      : { method, strength: ask.strength, compatibility: ask.compatibility };
  return {
    options,
    links: all ? undefined : Int32Array.from(picked),
    graph: {
      source: all ? model.source : Int32Array.from(picked, (k) => model.source[k]!),
      target: all ? model.target : Int32Array.from(picked, (k) => model.target[k]!),
      ...(method === 'hierarchical' && hierarchy === 'groups'
        ? { group: model.group, groups: model.groupNames.length }
        : {}),
      ...(method === 'hierarchical' && hierarchy === 'parents' && given.parent
        ? { parent: given.parent }
        : {}),
    },
    space,
    key: JSON.stringify([options, space]),
  };
}

/** The request for the routes of `bundle`: the `'preset'` arrangement over the placed nodes. */
function bundleRequest(
  key: string,
  bundle: GraphBundle,
  at: { readonly x: Float64Array; readonly y: Float64Array },
  thread: 'worker' | 'main',
): GraphPending {
  const n = at.x.length;
  const { graph, space } = bundle;
  return {
    key,
    what: 'bundle',
    arrangement: 'preset',
    graph: {
      nodes: n,
      source: graph.source,
      target: graph.target,
      weight: new Float64Array(graph.source.length).fill(1),
      halfWidth: new Float64Array(n),
      halfHeight: new Float64Array(n),
      x: toSpace(at.x, space.originX, space.scaleX),
      y: toSpace(at.y, space.originY, space.scaleY),
      ...(graph.group ? { group: graph.group, groups: graph.groups ?? 0 } : {}),
      ...(graph.parent ? { parent: graph.parent } : {}),
    },
    options: undefined,
    bundle: bundle.options,
    thread,
    streams: false,
  };
}

export function calcGraph(trace: FullTrace, ctx: CalcContext): GraphCalc {
  const model = buildGraphModel(trace);
  const n = model.nodes;
  const node = container(trace, 'node');
  const area = plotAreaOf(ctx.fullLayout, trace);
  const asked = arrangementOf(trace);
  const customName = container(trace, 'custom')['name'];
  const resolved = resolveGraphLayout(
    asked,
    typeof customName === 'string' ? customName : undefined,
  );
  const real = resolved.fallback ? undefined : realAxisOf(trace, asked);

  let gx = positions(node['x'], n, ctx.xaxis?.scale);
  let gy = positions(node['y'], n, ctx.yaxis?.scale);
  // A timeline: the values along the real axis, as the layout units the layout works in.
  const held = real?.kind === 'position' ? (real.axis === 'x' ? gx : gy) : undefined;
  if (held && real) {
    const span = Math.max(1, (real.axis === 'x' ? area.width : area.height) - 2 * TIMELINE_INSET);
    if (real.axis === 'x') gx = spread(held, span);
    else gy = spread(held, span);
  }
  // A stand-in layout does not get the options of the one it stands in for.
  const extents = resolved.fallback ? undefined : layoutExtents(trace, asked, model);
  const graph = layoutGraphOf(model, gx, gy, extents);
  const plan = resolved.fallback
    ? { options: undefined }
    : planLayout(trace, asked, model, graph, area);
  // `force.start`: the force layout goes on from given positions (a node was dragged).
  const start = !resolved.fallback && asked === 'force' ? forceStartOf(trace, n) : undefined;
  // The layout, or what stands in for it while it runs off the main thread (`pending.ts`).
  const worker = workerOf(trace);
  // Nothing is kept for a layout whose key is another one on every calc (options that cannot be
  // written down): its bundles would be asked for again and again.
  const keyed = optionsText(plan.options) !== undefined;
  const ask = resolved.fallback || !keyed ? undefined : bundleAskOf(trace);
  const key = layoutKeyOf(resolved.arrangement, graph, plan.options, start);
  const off =
    !resolved.fallback &&
    layoutThread(worker, {
      arrangement: asked,
      nodes: n,
      links: model.links,
      real: real !== undefined,
      atRest: start?.alpha === 0,
    }) === 'worker';
  const kept = off || ask ? LAYOUTS.get(key) : undefined;
  let pending: GraphPending | undefined;
  let ran: { result: LayoutResult; failed: boolean };
  if (kept?.result) {
    ran = { result: kept.result, failed: false };
  } else if (off && !kept?.failed) {
    ran = { result: placeholder(asked, graph, plan.options, start), failed: false };
    pending = {
      key,
      what: 'layout',
      arrangement: asked as GraphPending['arrangement'],
      graph,
      options: plan.options,
      start,
      thread: 'worker',
      streams: asked === 'force',
    };
  } else {
    ran = runLayout(
      start ? (g, o) => warmForceLayout(g, o as GraphForce['options'], start) : resolved.layout,
      graph,
      plan.options,
    );
    // Kept, so that a change of the bundling alone does not lay the graph out again.
    if (ask && !ran.failed) LAYOUTS.set(key, { result: ran.result });
  }
  const result: AnyResult = ran.result;
  const failed = ran.failed;
  const arrangement = failed ? 'circular' : resolved.arrangement;
  // A layout that is still to come has given nothing but the stand-in positions.
  const ok = !failed && !resolved.fallback && !pending;

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const hidden = new Uint8Array(n);
  const hiddenGroups = hiddenGroupsOf(model, ctx.fullLayout['hiddenlabels']);
  for (let i = 0; i < n; i++) {
    const xi = result.x[i];
    const yi = result.y[i];
    const placed = Number.isFinite(xi) && Number.isFinite(yi);
    x[i] = placed ? xi! : NaN;
    y[i] = placed ? yi! : NaN;
    if (!placed || result.hidden?.[i] === 1 || hiddenGroups.has(model.group[i]!)) hidden[i] = 1;
  }

  // The real axis: back from layout units to what the axis shows.
  let routes = result.routes;
  if (ok && real?.kind === 'position' && held) {
    (real.axis === 'x' ? x : y).set(held);
  } else if (ok && real?.kind === 'value' && result.valueAxis) {
    const { offset, scale } = result.valueAxis;
    const along = result.valueAxis.axis;
    // `+ 0`: a height of 0 on a scale that runs backwards is 0, not −0.
    const toValue = (v: number): number => (scale !== 0 ? (v - offset) / scale + 0 : 0);
    const moved = along === 'x' ? x : y;
    for (let i = 0; i < n; i++) moved[i] = toValue(moved[i]!);
    routes = routes?.map((route) => (route ? mapRoute(route, along, toValue) : undefined));
  }

  const tree =
    ok && plan.children && plan.collapsed && result.parent
      ? {
          parent: result.parent,
          children: plan.children,
          collapsed: plan.collapsed,
          x: Float64Array.from(x),
          y: Float64Array.from(y),
        }
      : undefined;
  // A node the layout left out has a position all the same (`preset` gives 0, a tree its nearest
  // ancestor that shows): not one to draw at, and not one to range over.
  if (result.hidden) {
    for (let i = 0; i < n; i++) if (result.hidden[i] === 1) x[i] = y[i] = NaN;
  }

  let secondary: Uint8Array | undefined;
  if (ok && asked === 'layered' && result.reversed?.includes(1)) secondary = result.reversed;
  if (ok && tree && result.treeLinks) {
    const links = result.treeLinks;
    if (links.includes(0)) secondary = links.map((t) => (t === 1 ? 0 : 1));
  }

  let labelRule: LabelRule | undefined;
  if (ok && tree) {
    const leaf = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (tree.children[i] === 0 || tree.collapsed[i] === 1) leaf[i] = 1;
    labelRule =
      asked === 'radial' && result.angle && result.radius
        ? { kind: 'radial', angle: result.angle, radius: result.radius, leaf }
        : {
            kind: 'tree',
            // With the heights on a real axis the root is at the high end of it, whichever way
            // the axis runs on screen.
            orientation:
              real?.kind === 'value'
                ? real.axis === 'y'
                  ? 'TB'
                  : 'RL'
                : treeOrientationOf(trace, asked),
            leaf,
          };
  } else if (ok && asked === 'arc') {
    const arc = arcOptionsOf(trace, model);
    labelRule = {
      kind: 'arc',
      vertical: arc.orientation === 'v',
      arcs: arc.sides === 'below' ? 'below' : 'above',
    };
  } else if (ok && asked === 'hive' && result.axis && result.axisAngle) {
    labelRule = { kind: 'hive', axis: result.axis, axisAngle: result.axisAngle };
  }

  // The bundled links (`link.bundle`): their routes when they have arrived, else a request.
  let omitted = ok && asked === 'hive' && result.omitted?.includes(1) ? result.omitted : undefined;
  let bundle: GraphBundle | undefined;
  if (ask && !pending && !failed && model.links > 0) {
    bundle = planBundle(
      ask,
      model,
      { x, y },
      { routes, omitted, parent: tree?.parent, preset: arrangement === 'preset', area },
    );
    let got = bundle ? BUNDLES.get(`${key}|${bundle.key}`) : undefined;
    // Hierarchical bundles are cheap: once their code is there, they are made here and now (a
    // node that was dropped has its bundles in the same frame). The first calc waits for it.
    const run =
      bundle && !got && bundle.options.method === 'hierarchical' ? bundlerNow() : undefined;
    if (bundle && run) {
      const { space } = bundle;
      const made = run(
        {
          x: toSpace(x, space.originX, space.scaleX),
          y: toSpace(y, space.originY, space.scaleY),
        },
        bundle.graph,
        bundle.options,
      );
      got = { routes: made.routes, method: made.method, refused: made.refused };
      BUNDLES.set(`${key}|${bundle.key}`, got);
    }
    if (bundle && got) {
      bundle = { ...bundle, method: got.method, refused: got.refused, base: routes };
      routes = bundledRoutes(bundle, got.routes, model.links, routes);
      if (got.refused) {
        warnOnce(
          'graph:bundle-refused',
          `[holochart] graph: force-directed link bundling is not done for more than 20,000 links (this graph bundles ${bundle.graph.source.length}); the links are drawn straight. Give the nodes groups for hierarchical bundling, which has no such limit.`,
        );
      }
    } else if (bundle) {
      const method = bundle.options.method === 'hierarchical' ? 'hierarchical' : 'force';
      pending = bundleRequest(
        `${key}|${bundle.key}`,
        bundle,
        { x, y },
        bundleThread(worker, method, bundle.graph.source.length),
      );
    }
  }
  // Nodes that stand in a circle for a layout that is still to come are drawn without links.
  if (pending?.what === 'layout' && !pending.streams) {
    omitted = new Uint8Array(model.links).fill(1);
  }

  const force =
    ok && asked === 'force'
      ? {
          graph,
          options: plan.options as GraphForce['options'],
          simulate:
            container(trace, 'force')['simulate'] === true &&
            n <= SIMULATE_MAX_NODES &&
            model.links <= SIMULATE_MAX_LINKS,
          start,
        }
      : undefined;

  return {
    model,
    length: n,
    x,
    y,
    hidden,
    arrangement,
    preset: arrangement === 'preset',
    units: arrangement !== 'preset' && !(ok && real),
    equal: equalScales(arrangement) && !(ok && real),
    real: ok ? real : undefined,
    area,
    routes,
    clusters: result.clusters,
    reversed: result.reversed,
    secondary,
    omitted,
    tree,
    labelRule,
    guides: ok && asked === 'hive' ? hiveGuides(trace, model, result, hiddenGroups) : undefined,
    force,
    layoutKey: failed ? layoutKeyOf(arrangement, graph, plan.options, undefined) : key,
    hiddenGroups,
    pending,
    bundle,
  };
}

/** Graphs up to this many nodes leave room for their labels in autorange. */
const LABEL_ROOM_MAX_NODES = 2000;
/** The most room a label gets at the edge of the plot, in px. */
const LABEL_ROOM_MAX = 90;
/** Gap between the end of a guide line and its name, in px. */
export const GUIDE_TITLE_GAP = 8;

/**
 * Autorange: every node center with half its extent and its outline as padding, plus
 *
 * - for a graph small enough that most labels show, an estimate of the label on the side it is
 *   drawn (turned labels included);
 * - the reach of a node's loops;
 * - the apex of every curved link when the axes have one scale (the apex is then known in linear
 *   coordinates; under `'preset'` and with a real axis the two axes may have any scales);
 * - the routes, the group frames and the guide lines of the layout, with their names;
 * - for a timeline, the height (or width) of the plot area along the axis the layout is free on,
 *   so that a layout unit there is a px unless the graph needs more.
 */
export function graphExtremes(calc: GraphCalc, trace: FullTrace): TraceExtremes {
  const { model } = calc;
  const n = model.nodes;
  const node = container(trace, 'node');
  // A real axis that runs backwards puts the larger values on the left, or at the bottom.
  const sx = calc.real?.axis === 'x' && calc.real.reversed ? -1 : 1;
  const sy = calc.real?.axis === 'y' && calc.real.reversed ? -1 : 1;
  const placement = model.box
    ? undefined
    : nodePlacements(String(node['textposition'] ?? 'auto'), calc, sx, sy);
  const labelled =
    placement !== undefined &&
    n <= LABEL_ROOM_MAX_NODES &&
    (model.labels !== undefined || model.implied.length > 0);
  const font = labelFont(trace);
  const lineWidth = container(node, 'line')['width'];
  // Collapsed nodes have a ring around them, and so have pinned ones.
  const ringed = calc.tree?.collapsed.includes(1) === true || pinnedNodes(trace, calc);
  const ring = ringed ? RING_REACH : 0;
  const outline = (typeof lineWidth === 'number' ? lineWidth / 2 : 1) + ring;
  // Padding in px at the low and the high end of each axis.
  const left = new Float64Array(n);
  const right = new Float64Array(n);
  const bottom = new Float64Array(n);
  const top = new Float64Array(n);
  const height = font.size * LABEL_LINE_HEIGHT;
  for (let i = 0; i < n; i++) {
    const hw = model.halfWidth[i]! + outline;
    const hh = model.halfHeight[i]! + outline;
    left[i] = right[i] = hw;
    bottom[i] = top[i] = hh;
    if (!labelled) continue;
    const text = nodeLabel(model, i);
    if (text === '') continue;
    const at = typeof placement === 'function' ? placement(i) : placement;
    // An estimate keeps calc from measuring every label.
    const width = Math.min(LABEL_ROOM_MAX, labelWidthEstimate(text, font.size));
    if (at.angle === undefined) {
      // Upright: room on the side the text grows to (placements are y down: a label anchored
      // by its bottom is above the node).
      const reachX = Math.abs(at.dx) * hw + width + LABEL_GAP;
      const reachY = Math.abs(at.dy) * hh + height + LABEL_GAP;
      const toRight = (at.anchorX === 'left') === sx > 0;
      if (at.anchorX === 'center') left[i] = right[i] = Math.max(hw, (width + LABEL_GAP) / 2);
      else if (toRight) right[i] = Math.max(hw, reachX);
      else left[i] = Math.max(hw, reachX);
      if (at.anchorY !== 'middle') {
        if ((at.anchorY === 'bottom') === sy > 0) top[i] = Math.max(hh, reachY);
        else bottom[i] = Math.max(hh, reachY);
      }
      continue;
    }
    // Turned: the box around the text on screen (y down); a reversed axis swaps its two ends.
    const box = labelBox(at, hw, hh, width, height);
    const lo = sx > 0 ? -box.x0 : box.x1;
    const hi = sx > 0 ? box.x1 : -box.x0;
    const below = sy > 0 ? box.y1 : -box.y0;
    const above = sy > 0 ? -box.y0 : box.y1;
    if (lo > left[i]!) left[i] = lo;
    if (hi > right[i]!) right[i] = hi;
    if (below > bottom[i]!) bottom[i] = below;
    if (above > top[i]!) top[i] = above;
  }
  for (let k = 0; k < model.links; k++) {
    if (model.loop[k]! < 0 || calc.routes?.[k] || calc.omitted?.[k] === 1) continue;
    const a = model.source[k]!;
    const r = Math.max(model.halfWidth[a]!, model.halfHeight[a]!);
    // A loop may point any way: its reach counts on every side.
    const reach = r + Math.max(LOOP_REACH, r) + LOOP_STEP * model.loop[k]! + outline;
    left[a] = Math.max(left[a]!, reach);
    right[a] = Math.max(right[a]!, reach);
    bottom[a] = Math.max(bottom[a]!, reach);
    top[a] = Math.max(top[a]!, reach);
  }
  // Further points to range over, each list with its padding in px.
  const xs: [Float64Array, number][] = [];
  const ys: [Float64Array, number][] = [];
  if ((calc.equal ?? !calc.preset) && model.links > 0) {
    const curves = linkCurves(model, trace);
    const ax: number[] = [];
    const ay: number[] = [];
    for (let k = 0; k < model.links; k++) {
      const c = curves[k]!;
      const a = model.source[k]!;
      const b = model.target[k]!;
      if (c === 0 || a === b || calc.routes?.[k]) continue;
      const dx = calc.x[b]! - calc.x[a]!;
      const dy = calc.y[b]! - calc.y[a]!;
      // The apex: the chord's middle, moved to the left of the link by c × its length.
      ax.push((calc.x[a]! + calc.x[b]!) / 2 - c * dy);
      ay.push((calc.y[a]! + calc.y[b]!) / 2 + c * dx);
    }
    if (ax.length > 0) {
      // Half a wide link, about.
      xs.push([Float64Array.from(ax), 2]);
      ys.push([Float64Array.from(ay), 2]);
    }
  }
  calc.routes?.forEach((route, k) => {
    if (!route) return;
    if (calc.hidden[model.source[k]!] === 1 || calc.hidden[model.target[k]!] === 1) return;
    const count = route.points.length >> 1;
    const rx = new Float64Array(count);
    const ry = new Float64Array(count);
    for (let j = 0; j < count; j++) {
      rx[j] = route.points[2 * j]!;
      ry[j] = route.points[2 * j + 1]!;
    }
    xs.push([rx, 2]);
    ys.push([ry, 2]);
  });
  for (const c of calc.clusters ?? []) {
    xs.push([Float64Array.of(c.x0, c.x1), 2]);
    ys.push([Float64Array.of(c.y0, c.y1), 2]);
  }
  if (calc.guides) {
    xs.push([calc.guides.x, 2]);
    ys.push([calc.guides.y, 2]);
    for (const title of calc.guides.titles) {
      // The name is centered on a point a little beyond the end of its line.
      const reach = GUIDE_TITLE_GAP + height / 2;
      const half = Math.min(LABEL_ROOM_MAX, labelWidthEstimate(title.text, font.size)) / 2;
      xs.push([Float64Array.of(title.x), Math.abs(title.ux) * reach + half]);
      ys.push([Float64Array.of(title.y), Math.abs(title.uy) * reach + height / 2]);
    }
  }
  if (calc.real?.kind === 'position') {
    // The layout is free along the other axis and worked in px: keep that scale when it fits.
    const free = calc.real.axis === 'x' ? calc.y : calc.x;
    const area = calc.area ?? { width: 0, height: 0 };
    const span = (calc.real.axis === 'x' ? area.height : area.width) / 2 - 20;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = free[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi >= lo && span > 0) {
      const mid = (lo + hi) / 2;
      (calc.real.axis === 'x' ? ys : xs).push([Float64Array.of(mid - span, mid + span), 0]);
    }
  }
  const merge = (
    values: Float64Array,
    lo: Float64Array,
    hi: Float64Array,
    more: [Float64Array, number][],
  ): NonNullable<TraceExtremes['x']> => {
    const min = linearExtremes(values, lo, { padded: true }).min;
    const max = linearExtremes(values, hi, { padded: true }).max;
    for (const [extra, pad] of more) {
      const e = linearExtremes(extra, pad, { padded: true });
      min.push(...e.min);
      max.push(...e.max);
    }
    return { min, max };
  };
  return { x: merge(calc.x, left, right, xs), y: merge(calc.y, bottom, top, ys) };
}
