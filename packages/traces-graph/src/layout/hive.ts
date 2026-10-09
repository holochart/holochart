/**
 * The `hive` arrangement (ADR-029): a hive plot (Krzywinski et al., 2012). Nodes sit on a few
 * straight axes that leave the centre like spokes; which axis and how far out are both read from
 * the node itself (its group, its degree, a value), never from an optimisation, so two graphs
 * drawn the same way can be compared and the drawing is the same on every run. Links are curves
 * between the axes. Pure: typed arrays in, typed arrays out.
 *
 * Steps:
 * 1. give every node an axis:
 *    - with groups (`graph.group` and `graph.groups > 0`): one axis per group, in group order, and
 *      one more at the end for the nodes without a group, only when there are some;
 *    - otherwise by `assign`. `'degree'` (the default) sorts the nodes by degree (ties by index)
 *      and cuts that list into `axes` parts of equal size: axis 0 has the least connected nodes.
 *      `'direction'` is the rule of the original hive plots and always makes 3 axes: 0 for sources
 *      (links out, none in), 1 for the nodes in between (and those without links), 2 for sinks
 *      (links in, none out).
 *      The two rules are never mixed on the layout's own judgement: the links of an undirected
 *      graph point whichever way they were typed in, the layout cannot tell that from a real
 *      direction, and a rule that switched on what the data looks like would redraw the whole
 *      plot when one link is added. So the rule that works for every graph and every number of
 *      axes is the default and the directed one is asked for by name;
 * 2. axis `a` of `A` points at `startAngle + a · 360 / A` degrees, counter-clockwise from +x;
 * 3. place the nodes of an axis between `innerRadius` and `outerRadius`:
 *    - `position: 'degree'`: in order of degree (ties by index), least connected nearest the
 *      centre, first node at `innerRadius` and last at `outerRadius`, with equal gaps between the
 *      outlines of neighbours (so equal steps when the nodes are the same size). When the nodes do
 *      not fit, they are not pushed beyond `outerRadius`: their centres are spread in equal steps
 *      and neighbours overlap. A node alone on its axis sits halfway;
 *    - `position: 'value'`: linearly by `graph.value`, the smallest value of the graph at
 *      `innerRadius` and the largest at `outerRadius` (one scale for all axes, so radii compare
 *      across them). A value that is not finite counts as the smallest. Nodes with close values
 *      overlap: that is what the scale says. If all values are equal, every node sits halfway.
 *      Without `graph.value` this is `'degree'`;
 * 4. route the links. A link between two axes is one cubic Bézier from its source to its target
 *    that bows around the centre: its two control points are at the source's and the target's
 *    radius, one third and two thirds of the way along the angle between the two axes, the short
 *    way round. Between two axes exactly opposite, the curve goes counter-clockwise from the axis
 *    with the lower index, whichever way the link points. Parallel links share one curve (the
 *    same points, one route object each), and so do a link and its reverse, run in the two
 *    directions.
 *
 * Links within one axis are **left out**, self-links among them: they get no route and a 1 in
 * `omitted`, and the trace does not draw them. A hive plot shows what goes on between classes of
 * nodes; a link inside a class would lie on the axis, over its nodes, and a loop beside the axis
 * would run through the curves to the neighbouring axes. The count of omitted links is itself
 * worth reading: when it is large, the axes do not split the graph along its links.
 *
 * A node's extent along its axis is the distance from its centre to the outline of its box
 * (`halfWidth`, `halfHeight`) in the axis's direction: exact for a box, a little generous for a
 * round marker on a slanted axis.
 */
import type { LayoutGraph, LayoutResult, LinkRoute } from './types.ts';

/** Options of {@link hiveLayout}. Lengths are layout units (CSS px), angles degrees. */
export interface HiveLayoutOptions {
  /**
   * Number of axes when the graph has no groups and `assign` is `'degree'`: 1 to 360, rounded
   * down. Default 3.
   */
  readonly axes?: number;
  /**
   * How nodes get their axis when the graph has no groups: `'degree'` cuts the nodes, sorted by
   * degree, into `axes` equal parts; `'direction'` makes three axes of sources, nodes in between
   * and sinks. Default `'degree'`.
   */
  readonly assign?: 'degree' | 'direction';
  /** Angle of the first axis, counter-clockwise from the +x axis. Default 90 (up). */
  readonly startAngle?: number;
  /** Distance from the centre to the first node of an axis. Default 40. */
  readonly innerRadius?: number;
  /** Distance from the centre to the last node of an axis; at least `innerRadius`. Default 300. */
  readonly outerRadius?: number;
  /**
   * What places a node along its axis: its rank by degree among the nodes of the axis, or
   * `graph.value` on one linear scale. Default `'degree'`.
   */
  readonly position?: 'degree' | 'value';
}

/** What {@link hiveLayout} returns: the positions and routes, and the axes it made. */
export interface HiveLayoutResult extends LayoutResult {
  /** One entry per link: a `'spline'` route of 4 points, `undefined` where `omitted` is 1. */
  readonly routes: readonly (LinkRoute | undefined)[];
  /** The axis of each node. */
  readonly axis: Int32Array;
  /** The angle of each axis in degrees, counter-clockwise from the +x axis. */
  readonly axisAngle: Float64Array;
  /**
   * 1 for each link that is not drawn: both ends on one axis (self-links too), or an end that is
   * not a node (the contract rules those out).
   */
  readonly omitted: Uint8Array;
}

const number = (v: unknown, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : dflt;

/** A node's half extent as given, 0 when it is missing, negative or not finite. */
const extent = (v: number | undefined): number =>
  v !== undefined && v > 0 && v < Infinity ? v : 0;

/** Both ends of a link are nodes. */
const isLink = (s: number | undefined, t: number | undefined, n: number): boolean =>
  s !== undefined && t !== undefined && s >= 0 && s < n && t >= 0 && t < n;

const QUARTER_COS = [1, 0, -1, 0] as const;
const QUARTER_SIN = [0, 1, 0, -1] as const;

/**
 * Cosine and sine of an angle in degrees, exact at the quarter turns: an axis that points up has
 * its nodes at x = 0, not at 1e-14.
 */
function direction(degrees: number): readonly [number, number] {
  const quarters = degrees / 90;
  if (Number.isInteger(quarters)) {
    const q = ((quarters % 4) + 4) % 4;
    return [QUARTER_COS[q]!, QUARTER_SIN[q]!];
  }
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)];
}

/**
 * A hive plot of `graph`: nodes on axes around the origin, links as curves between the axes. See
 * the module comment for the steps and for the links that are left out.
 */
export function hiveLayout(graph: LayoutGraph, options: HiveLayoutOptions = {}): HiveLayoutResult {
  const n = graph.nodes;
  const links = graph.source.length;
  const inner = Math.max(0, number(options.innerRadius, 40));
  const outer = Math.max(inner, number(options.outerRadius, 300));
  const startAngle = number(options.startAngle, 90);

  // Links in and out of each node (self-links aside) and the degree (a self-link counts twice).
  const into = new Int32Array(n);
  const out = new Int32Array(n);
  const degree = new Int32Array(n);
  for (let k = 0; k < links; k++) {
    const s = graph.source[k];
    const t = graph.target[k];
    if (!isLink(s, t, n)) continue;
    degree[s!]!++;
    degree[t!]!++;
    if (s === t) continue;
    out[s!]!++;
    into[t!]!++;
  }

  // 1. Axes.
  const axis = new Int32Array(n);
  let axes: number;
  const group = graph.group;
  const groups = Math.floor(number(graph.groups, 0));
  if (group && groups > 0) {
    axes = groups;
    for (let i = 0; i < n; i++) {
      const g = group[i];
      if (g !== undefined && g >= 0 && g < groups) {
        axis[i] = g;
      } else {
        axis[i] = groups;
        axes = groups + 1;
      }
    }
  } else if (options.assign === 'direction') {
    axes = 3;
    for (let i = 0; i < n; i++) {
      axis[i] = into[i] === 0 && out[i]! > 0 ? 0 : out[i] === 0 && into[i]! > 0 ? 2 : 1;
    }
  } else {
    axes = Math.min(360, Math.max(1, Math.floor(number(options.axes, 3))));
    const byDegree = new Int32Array(n);
    for (let i = 0; i < n; i++) byDegree[i] = i;
    byDegree.sort((a, b) => degree[a]! - degree[b]! || a - b);
    for (let q = 0; q < n; q++) axis[byDegree[q]!] = Math.floor((q * axes) / n);
  }

  // 2. Angles.
  const axisAngle = new Float64Array(axes);
  const cos = new Float64Array(axes);
  const sin = new Float64Array(axes);
  for (let a = 0; a < axes; a++) {
    const angle = startAngle + (a * 360) / axes;
    axisAngle[a] = angle;
    const [c, s] = direction(angle);
    cos[a] = c;
    sin[a] = s;
  }

  // 3. Radii.
  const radius = new Float64Array(n);
  const room = outer - inner;
  const value = options.position === 'value' ? graph.value : undefined;
  if (value) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = value[i];
      if (v === undefined || !Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // Halved, so that a range as wide as the doubles themselves does not overflow.
    const range = max / 2 - min / 2;
    for (let i = 0; i < n; i++) {
      const v = value[i];
      const known = v !== undefined && Number.isFinite(v);
      const t = !(range > 0) ? 0.5 : known ? (v / 2 - min / 2) / range : 0;
      radius[i] = inner + t * room;
    }
  } else {
    // The nodes of each axis next to each other, from the centre outwards.
    const sorted = new Int32Array(n);
    for (let i = 0; i < n; i++) sorted[i] = i;
    sorted.sort((a, b) => axis[a]! - axis[b]! || degree[a]! - degree[b]! || a - b);
    // Half extent of each node along its axis: to the outline of its box in the axis's direction.
    const reach = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const c = Math.abs(cos[axis[i]!]!);
      const s = Math.abs(sin[axis[i]!]!);
      const w = extent(graph.halfWidth[i]);
      const h = extent(graph.halfHeight[i]);
      reach[i] = Math.min(c > 0 ? w / c : Infinity, s > 0 ? h / s : Infinity);
    }
    for (let from = 0; from < n;) {
      const a = axis[sorted[from]!]!;
      let to = from + 1;
      while (to < n && axis[sorted[to]!] === a) to++;
      const count = to - from;
      if (count === 1) {
        radius[sorted[from]!] = inner + room / 2;
      } else {
        // What the outlines need with no gap at all; the room left over is shared by the gaps.
        let needed = 0;
        for (let p = from + 1; p < to; p++) needed += reach[sorted[p - 1]!]! + reach[sorted[p]!]!;
        const fits = needed <= room;
        const gap = (room - needed) / (count - 1);
        let r = inner;
        for (let p = from; p < to; p++) {
          const i = sorted[p]!;
          if (p > from) r += fits ? reach[sorted[p - 1]!]! + reach[i]! + gap : room / (count - 1);
          radius[i] = Math.min(r, outer);
        }
        // The steps add up to the room but for rounding: the last node is at the end exactly.
        radius[sorted[to - 1]!] = outer;
      }
      from = to;
    }
  }
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = radius[i]! * cos[axis[i]!]! + 0;
    y[i] = radius[i]! * sin[axis[i]!]! + 0;
  }

  // 4. Routes.
  const routes: (LinkRoute | undefined)[] = new Array<LinkRoute | undefined>(links).fill(undefined);
  const omitted = new Uint8Array(links);
  const step = 360 / axes;
  for (let k = 0; k < links; k++) {
    const s = graph.source[k];
    const t = graph.target[k];
    if (!isLink(s, t, n) || axis[s!] === axis[t!]) {
      omitted[k] = 1;
      continue;
    }
    const a = axis[s!]!;
    const b = axis[t!]!;
    // Axes to pass from `a` to `b`: counter-clockwise if that is the short way, else clockwise
    // (negative). Counted in axes, so "exactly opposite" is an exact test.
    const ahead = (((b - a) % axes) + axes) % axes;
    const turn = 2 * ahead < axes || (2 * ahead === axes && a < b) ? ahead : ahead - axes;
    const from = axisAngle[a]!;
    const sweep = turn * step;
    const angle1 = ((from + sweep / 3) * Math.PI) / 180;
    const angle2 = ((from + (2 * sweep) / 3) * Math.PI) / 180;
    const points = new Float64Array(8);
    points[0] = x[s!]!;
    points[1] = y[s!]!;
    points[2] = radius[s!]! * Math.cos(angle1);
    points[3] = radius[s!]! * Math.sin(angle1);
    points[4] = radius[t!]! * Math.cos(angle2);
    points[5] = radius[t!]! * Math.sin(angle2);
    points[6] = x[t!]!;
    points[7] = y[t!]!;
    routes[k] = { points, kind: 'spline' };
  }

  return { x, y, routes, axis, axisAngle, omitted };
}
