/**
 * From the option containers of a `graph` trace to the options of its layouts (backlog G2–G4,
 * ADR-029). This is the one place where the figure's lowercase names (`force.linkdistance`,
 * `layered.rankdir`, `tree.sortorder`, …) meet the layouts' own (`linkDistance`, `rankdir`,
 * `sortOrder`), and where the defaults that need more than the schema are filled in: those that
 * depend on the size of the graph (`force.ticks`), on the plot area (`layered.aspect`) or on the
 * labels (`tree.ranksep`, the room a layout keeps around a node for its label).
 *
 * The trace's defaults differ from the engines' in a few places, on purpose:
 *
 * - **force** (`'spring'`): a charge of −60 (the engine's, d3's, is −30), a velocity decay of 0.25
 *   (0.4) and 600 ticks up to 500 nodes (300). With d3's numbers a small sparse graph is still
 *   folded when the simulation has cooled: a path of five nodes ends at 43 % of its length and a
 *   grid of 8 × 8 with some forty crossings; with these both come out flat.
 * - **trees**: neighbours 10 apart (the engine's 20) once the height of a label is counted, and
 *   levels far enough apart for the labels drawn between them.
 *
 * Two arrangements can have one axis that is a real scale ({@link realAxisOf}): a dendrogram with
 * `node.value` has its heights on it, and a force layout whose nodes all have an `x` and no `y`
 * (or the reverse) keeps them at those values (a timeline). The other axis stays hidden.
 */
import { isArrayLike, type FullLayout } from '@mk7s/holochart-core';
import type { ArcLayoutOptions } from '../layout/arc.ts';
import { defaultTicks, type ForceOptions } from '../layout/force/index.ts';
import type { HiveLayoutOptions } from '../layout/hive.ts';
import type { GraphArrangement } from '../layout/index.ts';
import type { LayeredOptions } from '../layout/layered/index.ts';
import type {
  DendrogramOptions,
  RadialTreeOptions,
  TidyTreeOptions,
  TreeOrientation,
} from '../layout/tree/index.ts';
import { LABEL_GAP } from './labels.ts';
import { LABEL_LINE_HEIGHT, labelFont, nodeLabel, treeNodeIds, type GraphModel } from './model.ts';

type Container = Readonly<Record<string, unknown>>;

function part(trace: Container, key: string): Container {
  const v = trace[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Container) : {};
}

function arrayOf(v: unknown): ArrayLike<unknown> | undefined {
  return isArrayLike(v) && typeof v !== 'string' ? (v as ArrayLike<unknown>) : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function oneOf<T extends string>(v: unknown, values: readonly T[], dflt: T): T {
  return (values as readonly unknown[]).includes(v) ? (v as T) : dflt;
}

const DIRECTIONS = ['TB', 'BT', 'LR', 'RL'] as const;

// ---- The plot area ------------------------------------------------------------------------------

/** The size in px of the area a trace is laid out for. */
export interface PlotArea {
  readonly width: number;
  readonly height: number;
}

/** The layout key of an axis id (`'x2'` → `'xaxis2'`). */
function axisKey(id: unknown, letter: 'x' | 'y'): string {
  return typeof id === 'string' && id.startsWith(letter)
    ? `${letter}axis${id.slice(1)}`
    : `${letter}axis`;
}

/**
 * The plot area of the trace's subplot as calc can know it: the figure's size less its margins,
 * times the domains of the two axes. Automatic margins are not known yet, so this is a little
 * generous; it is used for proportions and for the scale of a timeline, not for placing anything
 * exactly.
 */
export function plotAreaOf(fullLayout: FullLayout, trace: Container): PlotArea {
  const margin = part(fullLayout, 'margin');
  const side = (key: string): number => Math.max(0, num(margin[key]) ?? 0);
  const span = (letter: 'x' | 'y'): number => {
    const domain = arrayOf(part(fullLayout, axisKey(trace[`${letter}axis`], letter))['domain']);
    const d = (num(domain?.[1]) ?? 1) - (num(domain?.[0]) ?? 0);
    return d > 0 && d <= 1 ? d : 1;
  };
  const width = (num(fullLayout['width']) ?? 700) - side('l') - side('r');
  const height = (num(fullLayout['height']) ?? 450) - side('t') - side('b');
  return { width: Math.max(50, width * span('x')), height: Math.max(50, height * span('y')) };
}

// ---- Arrangements with a real axis -----------------------------------------------------------------

/** How many entries of `values` there are (0 for anything that is not an array). */
function lengthOf(values: unknown): number {
  return arrayOf(values)?.length ?? 0;
}

/** Whether each of the first `count` entries of `values` is a position (not empty). */
export function allGiven(values: unknown, count: number): boolean {
  const list = arrayOf(values);
  if (!list || list.length < count) return false;
  for (let i = 0; i < count; i++) {
    const v = list[i];
    if (v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))) {
      return false;
    }
  }
  return true;
}

/** Whether `node.value` has a finite number in it. */
function hasNodeValues(trace: Container): boolean {
  const values = arrayOf(part(trace, 'node')['value']);
  if (!values) return false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && v.trim() !== '') {
      if (Number.isFinite(Number(v))) return true;
    }
  }
  return false;
}

/** The orientation of a `'tree'` or `'dendrogram'` arrangement. */
export function treeOrientationOf(trace: Container, arrangement: string): TreeOrientation {
  return oneOf(
    part(trace, 'tree')['orientation'],
    DIRECTIONS,
    arrangement === 'dendrogram' ? 'TB' : 'LR',
  );
}

/** An axis that carries data under a computed arrangement, and whether it runs backwards. */
export interface RealAxis {
  readonly axis: 'x' | 'y';
  /** Larger values are to the left, or at the bottom. */
  readonly reversed: boolean;
  /** What is on it: a dendrogram's heights, or the positions the figure gives. */
  readonly kind: 'value' | 'position';
}

/**
 * The axis of a computed arrangement that is a real scale, if it has one (see the module
 * comment). Read from the defaulted trace alone, so that the axis defaults (`axisHints`) and calc
 * agree.
 */
export function realAxisOf(trace: Container, arrangement: string): RealAxis | undefined {
  if (arrangement === 'dendrogram') {
    if (!hasNodeValues(trace)) return undefined;
    const orientation = treeOrientationOf(trace, arrangement);
    // The root, which has the largest height, is where the orientation says.
    return {
      axis: orientation === 'TB' || orientation === 'BT' ? 'y' : 'x',
      reversed: orientation === 'BT' || orientation === 'LR',
      kind: 'value',
    };
  }
  if (arrangement === 'force') {
    const node = part(trace, 'node');
    const count = num(trace['_length']) ?? 0;
    if (count === 0) return undefined;
    const x = lengthOf(node['x']);
    const y = lengthOf(node['y']);
    if (y === 0 && allGiven(node['x'], count)) {
      return { axis: 'x', reversed: false, kind: 'position' };
    }
    if (x === 0 && allGiven(node['y'], count)) {
      return { axis: 'y', reversed: false, kind: 'position' };
    }
  }
  return undefined;
}

// ---- Labels and the room they take -------------------------------------------------------------------

/** Whether the trace draws labels next to its nodes (not inside boxes, not `'none'`). */
function sideLabels(trace: Container, model: GraphModel): boolean {
  if (model.box) return false;
  if (model.labels === undefined && model.implied.length === 0) return false;
  return (part(trace, 'node')['textposition'] ?? 'auto') === 'auto';
}

/** The most room a label is given between two levels, in px. */
const LABEL_ROOM_MAX = 120;

/** An estimate of a label's width in px (0.55 em per character), without measuring it. */
export function labelWidthEstimate(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

/** The ring around a collapsed node reaches this far beyond it, in px (see `plot.ts`). */
export const RING_REACH = 5;

/**
 * Whether the two axes of a computed arrangement are locked to one scale. A tidy tree and a
 * dendrogram are not: their levels and their breadth are two measures, and each fills the plot
 * area along its own axis. Everything with angles or routed curves keeps its proportions.
 */
export function equalScales(arrangement: string): boolean {
  return arrangement !== 'preset' && arrangement !== 'tree' && arrangement !== 'dendrogram';
}

/**
 * The half extents a layout keeps for each node when more than the node counts: the height of a
 * line of its label, across the direction the labels of the arrangement run in, and the ring of
 * a collapsed node. `undefined` when the nodes' own extents are right (boxes, an arrangement
 * that does not pack nodes by size, neither labels nor rings).
 */
export function layoutExtents(
  trace: Container,
  arrangement: GraphArrangement,
  model: GraphModel,
): { halfWidth: Float64Array; halfHeight: Float64Array } | undefined {
  if (model.box) return undefined;
  const tree = arrangement === 'tree' || arrangement === 'dendrogram' || arrangement === 'radial';
  if (!tree && arrangement !== 'arc') return undefined;
  const labels = sideLabels(trace, model);
  const collapsed = tree ? collapsedMask(trace, model) : undefined;
  if (!labels && !collapsed) return undefined;
  const halfWidth = Float64Array.from(model.halfWidth);
  const halfHeight = Float64Array.from(model.halfHeight);
  if (collapsed) {
    for (let i = 0; i < model.nodes; i++) {
      if (collapsed[i] !== 1) continue;
      halfWidth[i] = halfWidth[i]! + RING_REACH;
      halfHeight[i] = halfHeight[i]! + RING_REACH;
    }
  }
  // A radial tree measures a node by its diagonal, which a line of text fits in.
  if (labels && arrangement !== 'radial') {
    // Under a tree that grows downwards the leaf labels are turned upright: a line's height
    // counts along x. Beside one that grows sideways it counts along y. The same for the line
    // of an arc diagram.
    const upright =
      arrangement === 'arc'
        ? part(trace, 'arc')['orientation'] !== 'v'
        : ['TB', 'BT'].includes(treeOrientationOf(trace, arrangement));
    const half = (labelFont(trace).size * LABEL_LINE_HEIGHT) / 2;
    const grown = upright ? halfWidth : halfHeight;
    for (let i = 0; i < model.nodes; i++) {
      if (nodeLabel(model, i) !== '' && grown[i]! < half) grown[i] = half;
    }
  }
  return { halfWidth, halfHeight };
}

// ---- force ----------------------------------------------------------------------------------------

/** Above this many nodes or links `force.simulate` draws the settled layout at once. */
export const SIMULATE_MAX_NODES = 2000;
export const SIMULATE_MAX_LINKS = 10_000;

/**
 * The default `force.ticks` for a graph of `nodes` nodes: 600 up to 500 nodes, then in inverse
 * proportion to the node count down to the engine's own rule (300 from 1,000 to 3,000 nodes, 90
 * at 10,000).
 */
export function defaultForceTicks(nodes: number): number {
  if (!(nodes > 500)) return 600;
  return Math.max(defaultTicks(nodes), Math.round(300_000 / nodes));
}

/** The options of the force layout, with the number of ticks it will run for. */
export function forceOptionsOf(trace: Container, nodes: number): ForceOptions & { ticks: number } {
  const f = part(trace, 'force');
  const forceatlas2 = f['algorithm'] === 'forceatlas2';
  const gravity = num(f['gravity']);
  const groupStrength = num(f['groupstrength']);
  const linkStrength = num(f['linkstrength']);
  const scalingRatio = num(f['scalingratio']);
  return {
    algorithm: forceatlas2 ? 'forceatlas2' : 'spring',
    seed: num(f['seed']) ?? 1,
    ticks: Math.max(1, Math.round(num(f['ticks']) ?? defaultForceTicks(nodes))),
    collide: f['collide'] !== false,
    collidePadding: num(f['collidepadding']) ?? 2,
    linkWeight: oneOf(f['linkweight'], ['strength', 'distance', 'none'] as const, 'strength'),
    ...(groupStrength !== undefined && groupStrength > 0 ? { groupStrength } : {}),
    ...(forceatlas2
      ? {
          linLog: f['linlog'] === true,
          ...(scalingRatio !== undefined ? { scalingRatio } : {}),
          ...(gravity !== undefined ? { gravity } : {}),
        }
      : {
          linkDistance: num(f['linkdistance']) ?? 30,
          chargeStrength: num(f['charge']) ?? -60,
          velocityDecay: 0.25,
          ...(linkStrength !== undefined ? { linkStrength } : {}),
          ...(gravity !== undefined ? { centerStrength: gravity } : {}),
        }),
  };
}

// ---- layered --------------------------------------------------------------------------------------

/** The height of the strip a cluster's title is drawn in, in px. */
export function clusterTitleHeight(trace: Container): number {
  return Math.ceil(labelFont(trace).size * LABEL_LINE_HEIGHT) + 4;
}

/** The options of the layered layout. `area`: the plot area, for the default `aspect`. */
export function layeredOptionsOf(
  trace: Container,
  model: GraphModel,
  area: PlotArea,
): LayeredOptions {
  const l = part(trace, 'layered');
  const clusters = l['clusters'] === true && model.groupNames.length > 0;
  return {
    rankdir: oneOf(l['rankdir'], DIRECTIONS, 'TB'),
    ranksep: num(l['ranksep']) ?? 50,
    nodesep: num(l['nodesep']) ?? 30,
    edgesep: num(l['edgesep']) ?? 12,
    ranker: oneOf(
      l['ranker'],
      ['network-simplex', 'tight-tree', 'longest-path'] as const,
      'network-simplex',
    ),
    routing: oneOf(l['routing'], ['spline', 'polyline', 'orthogonal'] as const, 'spline'),
    clusters,
    clusterPadding: num(l['clusterpadding']) ?? 12,
    clusterLabelHeight: clusters ? clusterTitleHeight(trace) : 0,
    aspect: num(l['aspect']) ?? area.width / area.height,
  };
}

// ---- trees ----------------------------------------------------------------------------------------

/**
 * `tree.collapsed` as a mask over the nodes (`undefined` when it names none). An entry is a node
 * index (a whole number in range, or a numeric string of one); with tree input an entry that is
 * the id of a node (`ids`, else `labels`) names that node, and ids are looked up first.
 */
export function collapsedMask(trace: Container, model: GraphModel): Uint8Array | undefined {
  const entries = arrayOf(part(trace, 'tree')['collapsed']);
  if (!entries || entries.length === 0) return undefined;
  const ids = model.parent ? treeNodeIds(trace, model) : undefined;
  const mask = new Uint8Array(model.nodes);
  let any = false;
  for (let k = 0; k < entries.length; k++) {
    const entry = entries[k];
    let i = -1;
    if (typeof entry === 'string' && ids?.has(entry)) i = ids.get(entry)!;
    else if (typeof entry === 'number' && Number.isInteger(entry)) i = entry;
    else if (typeof entry === 'string' && entry.trim() !== '' && Number.isInteger(Number(entry))) {
      i = Number(entry);
    }
    if (i < 0 || i >= model.nodes) continue;
    mask[i] = 1;
    any = true;
  }
  return any ? mask : undefined;
}

/**
 * The value of `tree.collapsed` for a mask: the ids of the collapsed nodes when the trace gives
 * `ids` (they survive a change of the rows), else their indices.
 */
export function collapsedValue(
  trace: Container,
  model: GraphModel,
  mask: Uint8Array,
): (string | number)[] {
  const out: (string | number)[] = [];
  const byId = model.parent && arrayOf(trace['ids']) ? treeNodeIds(trace, model) : undefined;
  const idOf = new Map<number, string>();
  byId?.forEach((i, id) => {
    if (!idOf.has(i)) idOf.set(i, id);
  });
  for (let i = 0; i < model.nodes; i++) {
    if (mask[i] === 1) out.push(idOf.get(i) ?? i);
  }
  return out;
}

/**
 * The restyle a click on node `i` of a tree makes (`undefined` for a node without children):
 * `tree.collapsed` with the node added, or taken out when it was in. `children` / `collapsed`:
 * the tree as calc drew it (`GraphCalc.tree`).
 */
export function collapseToggle(
  trace: Container,
  model: GraphModel,
  tree: { readonly children: Int32Array; readonly collapsed: Uint8Array },
  i: number,
): { 'tree.collapsed': [(string | number)[]] } | undefined {
  if (!(i >= 0 && i < model.nodes) || tree.children[i] === 0) return undefined;
  const mask = Uint8Array.from(tree.collapsed);
  mask[i] = mask[i] === 1 ? 0 : 1;
  // One value for one trace: a restyle reads an array as a value per trace.
  return { 'tree.collapsed': [collapsedValue(trace, model, mask)] };
}

/** What the three tree layouts share. */
function treeCommon(trace: Container, model: GraphModel) {
  const t = part(trace, 'tree');
  const collapsed = collapsedMask(trace, model);
  return {
    nodesep: num(t['nodesep']) ?? (model.box ? 20 : 10),
    sort: oneOf(t['sort'], ['input', 'size', 'value'] as const, 'input'),
    sortOrder: oneOf(t['sortorder'], ['descending', 'ascending'] as const, 'descending'),
    ...(collapsed ? { collapsed } : {}),
  };
}

/**
 * The default room between two levels: 50, or as much as the widest label drawn between them
 * needs (the labels of the nodes named by `between`, up to {@link LABEL_ROOM_MAX}).
 */
function levelRoom(trace: Container, model: GraphModel, between: Uint8Array | undefined): number {
  const given = num(part(trace, 'tree')['ranksep']);
  if (given !== undefined) return given;
  if (!between || !sideLabels(trace, model)) return 50;
  const size = labelFont(trace).size;
  let widest = 0;
  for (let i = 0; i < model.nodes; i++) {
    if (between[i] !== 1) continue;
    widest = Math.max(widest, labelWidthEstimate(nodeLabel(model, i), size));
  }
  return Math.max(50, 30 + LABEL_GAP + Math.min(LABEL_ROOM_MAX, widest));
}

/**
 * The options of a tree arrangement. `inner`: 1 for the nodes that have children showing, whose
 * labels are drawn between their level and the one before (see `labels.ts`).
 */
export function treeOptionsOf(
  trace: Container,
  arrangement: 'tree' | 'radial' | 'dendrogram',
  model: GraphModel,
  inner?: Uint8Array,
): TidyTreeOptions | RadialTreeOptions | DendrogramOptions {
  const t = part(trace, 'tree');
  const common = treeCommon(trace, model);
  const links = oneOf(
    t['links'],
    ['straight', 'curved', 'elbow'] as const,
    arrangement === 'dendrogram' ? 'elbow' : 'curved',
  );
  const subtreesep = num(t['subtreesep']);
  const between = subtreesep !== undefined ? { subtreesep } : {};
  if (arrangement === 'radial') {
    const sector = part(t, 'sector');
    return {
      ...common,
      ...between,
      ranksep: levelRoom(trace, model, inner),
      links,
      sector: { start: num(sector['start']) ?? 0, span: num(sector['span']) ?? 360 },
    };
  }
  const orientation = treeOrientationOf(trace, arrangement);
  if (arrangement === 'dendrogram') {
    return {
      ...common,
      orientation,
      ranksep: num(t['ranksep']) ?? 50,
      links: links === 'straight' ? 'straight' : 'elbow',
    };
  }
  const sideways = orientation === 'LR' || orientation === 'RL';
  return {
    ...common,
    ...between,
    orientation,
    ranksep: levelRoom(trace, model, sideways ? inner : undefined),
    links,
  };
}

// ---- arc and hive -----------------------------------------------------------------------------------

/** The options of the arc diagram. */
export function arcOptionsOf(trace: Container, model: GraphModel): ArcLayoutOptions {
  const a = part(trace, 'arc');
  const maxHeight = num(a['maxheight']);
  return {
    orientation: a['orientation'] === 'v' ? 'v' : 'h',
    order: oneOf(
      a['order'],
      ['input', 'group', 'degree', 'barycenter'] as const,
      model.groupNames.length > 0 ? 'group' : 'input',
    ),
    nodesep: num(a['nodesep']) ?? 20,
    groupsep: num(a['groupsep']) ?? 0,
    sides: oneOf(a['sides'], ['above', 'below', 'direction'] as const, 'above'),
    loopSize: num(a['loopsize']) ?? 12,
    ...(maxHeight !== undefined ? { maxHeight } : {}),
  };
}

/** The options of the hive plot. */
export function hiveOptionsOf(trace: Container): HiveLayoutOptions {
  const h = part(trace, 'hive');
  const inner = num(h['innerradius']) ?? 40;
  return {
    axes: num(h['axes']) ?? 3,
    assign: h['assign'] === 'direction' ? 'direction' : 'degree',
    startAngle: num(h['startangle']) ?? 90,
    innerRadius: inner,
    outerRadius: Math.max(inner, num(h['outerradius']) ?? 300),
    position: h['position'] === 'value' ? 'value' : 'degree',
  };
}
