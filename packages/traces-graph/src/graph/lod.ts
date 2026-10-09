/**
 * Level of detail of the `graph` trace (backlog G7): what a large graph leaves out while it is
 * drawn small, and gets back on a zoom. Pure: the measures and the rules are functions of the
 * positions on screen and the axis scales; the view (`plot.ts`) keeps the state they need (what
 * was drawn last, for the hysteresis) and says here what it settled on ({@link setLod}), so that
 * hover and the link geometry agree with what is drawn ({@link lodOf}).
 *
 * ## The measures
 *
 * All three follow the zoom and nothing else, so a pan never changes the detail:
 *
 * - **node spacing**: how far apart the nodes would be if they were spread evenly over the part
 *   of their box they occupy, in px: `√(occupied area in px / nodes)`. The occupied part is
 *   counted on a coarse grid (the cells with a node in them), so a graph of a few tight clusters
 *   is measured by its clusters, not by the empty space between them;
 * - **link length**: the mean length of a link on screen, in px (exact when the two axes have
 *   one scale, as under every computed arrangement; else the mean length scaled by the mean
 *   extents of the links along each axis);
 * - **link coverage**: how many links deep the occupied area is inked on average: the links'
 *   lengths times their widths, over that area.
 *
 * ## The rules ({@link nextLod})
 *
 * - **Labels** are drawn once the node spacing is {@link LOD.labelsOn} px, and go again below
 *   {@link LOD.labelsOff}. Not for box nodes, whose text is part of the node.
 * - **Arrowheads** are drawn once the links are {@link LOD.arrowsOn} px long on average, and go
 *   again below {@link LOD.arrowsOff}. Without them the links are plain segments between the
 *   node centers, which a zoom does not rebuild.
 * - **Nodes** are drawn smaller when they are closer together than {@link LOD.fill} times their
 *   mean size: by the factor that puts them that far apart again, down to dots of
 *   {@link LOD.point} px (all of one size then, without outlines: the marker's cheapest path).
 *   Outlines go below a drawn size of {@link LOD.outlinesOff} px and come back at
 *   {@link LOD.outlinesOn}.
 * - **Link opacity** is multiplied by `coverage target / coverage`, at most 1 and at least
 *   {@link LOD.alphaMin}: links that would paint the box solid several times over are drawn
 *   fainter by as much, so the denser parts still read as denser.
 *
 * The two factors move in steps of {@link LOD.step}, so that a slow zoom restyles a few times,
 * not on every frame.
 */
import type { GraphCalc } from './calc.ts';
import type { GraphModel } from './model.ts';

/** The thresholds (see the module comment). Sizes and lengths are CSS px. */
export const LOD = {
  /** `lod: 'auto'` applies above this many nodes or links. */
  nodes: 3000,
  links: 5000,
  labelsOn: 24,
  labelsOff: 18,
  arrowsOn: 24,
  arrowsOff: 18,
  fill: 1.5,
  point: 1.5,
  outlinesOn: 5,
  outlinesOff: 4,
  /** The mean depth of link ink the links are faded to. */
  coverage: 1.5,
  alphaMin: 0.04,
  step: 0.05,
} as const;

/** What of a graph is drawn at the current zoom. */
export interface GraphLod {
  readonly labels: boolean;
  readonly arrows: boolean;
  readonly outlines: boolean;
  /** Factor on the node sizes, above 0 and at most 1. */
  readonly nodeScale: number;
  /** The nodes are dots of {@link LOD.point} px, all alike. */
  readonly points: boolean;
  /** Factor on the link opacity, {@link LOD.alphaMin} to 1. */
  readonly linkAlpha: number;
}

/** Everything drawn in full: a graph without level of detail. */
export const FULL_LOD: GraphLod = {
  labels: true,
  arrows: true,
  outlines: true,
  nodeScale: 1,
  points: false,
  linkAlpha: 1,
};

/** The trace's `lod`: `'auto'`, `true` or `false`. */
export function lodMode(trace: Readonly<Record<string, unknown>>): 'auto' | boolean {
  const v = trace['lod'];
  return v === true || v === false ? v : 'auto';
}

/** Whether level of detail applies to a graph of this size under `mode`. */
export function lodApplies(mode: 'auto' | boolean, nodes: number, links: number): boolean {
  return mode === true || (mode === 'auto' && (nodes > LOD.nodes || links > LOD.links));
}

/** What the measures are taken from: the picture in linear coordinates, without the zoom. */
export interface LodStats {
  /** Nodes that are drawn, and the box around them in linear units. */
  readonly nodes: number;
  readonly width: number;
  readonly height: number;
  /** The share of the box the nodes occupy, above 0 and at most 1 (see the module comment). */
  readonly occupied: number;
  /** Mean node size in px. */
  readonly meanSize: number;
  /**
   * Links between two drawn nodes, their mean length and mean extent along each axis (linear
   * units) and their mean width (px).
   */
  readonly links: number;
  readonly meanLength: number;
  readonly meanDx: number;
  readonly meanDy: number;
  readonly meanWidth: number;
}

/** The stats of the positions `at` (a frame of the calc). `widths`: the link widths in px. */
export function lodStats(
  at: { readonly x: Float64Array; readonly y: Float64Array; readonly hidden: Uint8Array },
  model: GraphModel,
  widths?: Float32Array,
): LodStats {
  let nodes = 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let size = 0;
  for (let i = 0; i < model.nodes; i++) {
    const x = at.x[i]!;
    const y = at.y[i]!;
    if (at.hidden[i] === 1 || x !== x || y !== y) continue;
    nodes++;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    size += model.size[i]!;
  }
  // The cells of a grid with about four nodes to a cell that have a node in them.
  let occupied = 1;
  const side = Math.min(64, Math.floor(Math.sqrt(nodes / 4)));
  if (side >= 4 && x1 > x0 && y1 > y0) {
    const cells = new Uint8Array(side * side);
    const kx = side / (x1 - x0);
    const ky = side / (y1 - y0);
    let count = 0;
    for (let i = 0; i < model.nodes; i++) {
      const x = at.x[i]!;
      const y = at.y[i]!;
      if (at.hidden[i] === 1 || x !== x || y !== y) continue;
      const cell =
        Math.min(side - 1, Math.floor((y - y0) * ky)) * side +
        Math.min(side - 1, Math.floor((x - x0) * kx));
      if (cells[cell] === 0) {
        cells[cell] = 1;
        count++;
      }
    }
    occupied = count / cells.length;
  }
  let links = 0;
  let length = 0;
  let dx = 0;
  let dy = 0;
  let width = 0;
  for (let k = 0; k < model.links; k++) {
    const a = model.source[k]!;
    const b = model.target[k]!;
    if (at.hidden[a] === 1 || at.hidden[b] === 1) continue;
    const ex = Math.abs(at.x[b]! - at.x[a]!);
    const ey = Math.abs(at.y[b]! - at.y[a]!);
    if (ex !== ex || ey !== ey) continue;
    links++;
    length += Math.hypot(ex, ey);
    dx += ex;
    dy += ey;
    width += widths ? widths[k]! : 1;
  }
  return {
    nodes,
    width: nodes > 0 ? x1 - x0 : 0,
    height: nodes > 0 ? y1 - y0 : 0,
    occupied,
    meanSize: nodes > 0 ? size / nodes : 0,
    links,
    meanLength: links > 0 ? length / links : 0,
    meanDx: links > 0 ? dx / links : 0,
    meanDy: links > 0 ? dy / links : 0,
    meanWidth: links > 0 ? width / links : 0,
  };
}

/** The three measures at a zoom (see the module comment). */
export interface LodMeasures {
  /** Mean node spacing in px (`Infinity` for fewer than two nodes). */
  readonly spacing: number;
  /** Mean link length in px (`Infinity` without links). */
  readonly linkLength: number;
  /** Mean depth of link ink over the box of the nodes. */
  readonly coverage: number;
}

/** The measures of `stats` under the axis scales (px per linear unit; the sign is ignored). */
export function lodMeasures(stats: LodStats, scaleX: number, scaleY: number): LodMeasures {
  const sx = Math.abs(scaleX);
  const sy = Math.abs(scaleY);
  if (!(sx > 0) || !(sy > 0) || !Number.isFinite(sx + sy)) {
    return { spacing: Infinity, linkLength: Infinity, coverage: 0 };
  }
  const w = stats.width * sx;
  const h = stats.height * sy;
  // Nodes on one line (an arc diagram) are spaced along it.
  const spacing =
    stats.nodes < 2
      ? Infinity
      : w > 0 && h > 0
        ? Math.sqrt((w * h * stats.occupied) / stats.nodes)
        : Math.max(w, h) / (stats.nodes - 1);
  // The mean length, stretched as the links' mean extents are: by the one scale when the axes
  // share it, and by something between the two otherwise.
  const extent = Math.hypot(stats.meanDx, stats.meanDy);
  const stretch =
    extent > 0 ? Math.hypot(stats.meanDx * sx, stats.meanDy * sy) / extent : Math.sqrt(sx * sy);
  const linkLength = stats.links > 0 ? stats.meanLength * stretch : Infinity;
  const area = Math.max(w, 1) * Math.max(h, 1) * stats.occupied;
  const coverage = stats.links > 0 ? (stats.links * linkLength * stats.meanWidth) / area : 0;
  return { spacing, linkLength, coverage };
}

/** `value` in steps of {@link LOD.step} of itself, keeping `previous` while it is within a step. */
function stepped(value: number, previous: number | undefined): number {
  if (previous !== undefined && Math.abs(value / previous - 1) < LOD.step) return previous;
  return value;
}

/** On above `on`, off below `off`, as before in between. */
function hysteresis(
  value: number,
  on: number,
  off: number,
  previous: boolean | undefined,
): boolean {
  if (value >= on) return true;
  if (value < off) return false;
  return previous ?? false;
}

/**
 * The level of detail at `measures` (see the module comment). `previous`: what was drawn last,
 * for the thresholds that have two sides. `box`: the nodes are boxes (they keep their labels,
 * outlines and size: boxes shrink with the axes by themselves, `nodeScaleOf`).
 */
export function nextLod(
  previous: GraphLod | undefined,
  measures: LodMeasures,
  stats: Pick<LodStats, 'meanSize'>,
  box = false,
): GraphLod {
  const arrows = hysteresis(measures.linkLength, LOD.arrowsOn, LOD.arrowsOff, previous?.arrows);
  const alpha = measures.coverage > LOD.coverage ? LOD.coverage / measures.coverage : 1;
  const linkAlpha = Math.min(1, stepped(Math.max(LOD.alphaMin, alpha), previous?.linkAlpha));
  if (box) return { ...FULL_LOD, arrows, linkAlpha };
  const labels = hysteresis(measures.spacing, LOD.labelsOn, LOD.labelsOff, previous?.labels);
  const size = stats.meanSize;
  let nodeScale = 1;
  let points = false;
  let outlines = true;
  if (size > 0 && Number.isFinite(measures.spacing)) {
    const fit = measures.spacing / (LOD.fill * size);
    if (fit < 1) {
      nodeScale = stepped(Math.max(LOD.point / size, fit), previous?.nodeScale);
      nodeScale = Math.min(1, nodeScale);
    }
    const drawn = size * nodeScale;
    points = drawn <= LOD.point * (1 + LOD.step);
    outlines =
      !points && hysteresis(drawn, LOD.outlinesOn, LOD.outlinesOff, previous?.outlines ?? true);
  }
  return { labels, arrows, outlines, nodeScale, points, linkAlpha };
}

/** Whether two levels of detail draw the same. */
export function sameLod(a: GraphLod, b: GraphLod): boolean {
  return (
    a.labels === b.labels &&
    a.arrows === b.arrows &&
    a.outlines === b.outlines &&
    a.nodeScale === b.nodeScale &&
    a.points === b.points &&
    a.linkAlpha === b.linkAlpha
  );
}

const LODS = new WeakMap<GraphCalc, GraphLod>();

/** The level of detail `calc` is drawn at: what its view said last, else everything. */
export function lodOf(calc: GraphCalc): GraphLod {
  return LODS.get(calc) ?? FULL_LOD;
}

/** Say what `calc` is drawn at (its view). */
export function setLod(calc: GraphCalc, lod: GraphLod): void {
  if (lod === FULL_LOD) LODS.delete(calc);
  else LODS.set(calc, lod);
}
