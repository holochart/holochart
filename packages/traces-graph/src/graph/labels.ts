/**
 * Label placement and collision culling of the `graph` trace (backlog G1, ADR-029). Pure.
 *
 * Labels are offered in priority order (the nodes with the most links first, see
 * {@link labelPriority}) and a label is kept when its box overlaps no label kept before it and
 * no node offered before it, so the most connected nodes keep their labels and the rest appear
 * as a zoom makes room. A label may cover a node of lower priority: in a dense cluster that is
 * the only way the hub in its middle is named. Kept boxes go into a uniform grid, so a pass
 * costs about one lookup per label whatever their number (the quadratic `cullOverlaps` of the
 * 3D scene's axis labels is for a few dozen).
 *
 * Only labels whose node is inside the view (plus a margin) are considered: on a large graph a
 * zoomed-in view places the labels of what it shows, and the pass is redone when the view leaves
 * the margin.
 */

/** Where a label sits relative to its node. */
export interface LabelPlacement {
  /** Anchor of the text at the label point: the text grows away from the node. */
  readonly anchorX: 'left' | 'center' | 'right';
  readonly anchorY: 'top' | 'middle' | 'bottom';
  /**
   * Direction from the node center to the label point, screen convention (+y down): each
   * component is multiplied by half the node's extent plus {@link LABEL_GAP}. -1, 0 or 1 for
   * scatter's `textposition` values; a unit vector for a label placed at an angle.
   */
  readonly dx: number;
  readonly dy: number;
  /**
   * The text turned about its anchor, in degrees clockwise on screen (the text primitive's
   * `angle`): -90 reads from the bottom up. Unset: upright.
   */
  readonly angle?: number;
}

/** Gap between a node's edge and its label, in px. */
export const LABEL_GAP = 3;

/** Where a label is on screen around its node's center, in px with y down. */
export interface LabelBox {
  /** The box around the label: the rectangle of the text when it is not turned. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /**
   * The corners of the text's rectangle, `[x, y]` × 4 going round, for a label that is turned to
   * an angle that is not a quarter turn: two such labels can be side by side where their boxes
   * overlap. Unset: the box is the text.
   */
  quad?: Float64Array;
}

/**
 * Where the label of a node is (see {@link LabelBox}). `hw` / `hh`: half the node's extent;
 * `width` / `height`: the size of the text.
 */
export function labelBox(
  placement: LabelPlacement,
  hw: number,
  hh: number,
  width: number,
  height: number,
): LabelBox {
  const ax = placement.dx * (hw + LABEL_GAP);
  const ay = placement.dy * (hh + LABEL_GAP);
  // The text's rectangle about its anchor, before it is turned.
  const u0 = placement.anchorX === 'right' ? -width : placement.anchorX === 'left' ? 0 : -width / 2;
  const v0 =
    placement.anchorY === 'bottom' ? -height : placement.anchorY === 'top' ? 0 : -height / 2;
  const angle = placement.angle ?? 0;
  if (angle === 0) return { x0: ax + u0, y0: ay + v0, x1: ax + u0 + width, y1: ay + v0 + height };
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const quad = new Float64Array(8);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let corner = 0; corner < 4; corner++) {
    // Going round: (0, 0), (w, 0), (w, h), (0, h).
    const u = u0 + (corner === 1 || corner === 2 ? width : 0);
    const v = v0 + (corner >= 2 ? height : 0);
    // Clockwise on screen, y down.
    const x = ax + u * cos - v * sin;
    const y = ay + u * sin + v * cos;
    quad[2 * corner] = x;
    quad[2 * corner + 1] = y;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  // At a quarter turn the box is the text.
  const quarter = Math.abs(sin) < 1e-9 || Math.abs(cos) < 1e-9;
  return quarter ? { x0, y0, x1, y1 } : { x0, y0, x1, y1, quad };
}

/**
 * Whether two rectangles given by their corners (`[x, y]` × 4 going round) come within `gap` of
 * each other: no side of either has all of the other at least `gap` beyond it.
 */
export function quadsTouch(a: ArrayLike<number>, b: ArrayLike<number>, gap: number): boolean {
  for (let pass = 0; pass < 2; pass++) {
    const p = pass === 0 ? a : b;
    const q = pass === 0 ? b : a;
    // Two sides of a rectangle give its two directions.
    for (let side = 0; side < 2; side++) {
      const ex = p[2 * side + 2]! - p[2 * side]!;
      const ey = p[2 * side + 3]! - p[2 * side + 1]!;
      const len = Math.hypot(ex, ey);
      if (!(len > 0)) continue;
      // Along the normal of the side.
      const nx = -ey / len;
      const ny = ex / len;
      let pMin = Infinity;
      let pMax = -Infinity;
      let qMin = Infinity;
      let qMax = -Infinity;
      for (let c = 0; c < 4; c++) {
        const dp = p[2 * c]! * nx + p[2 * c + 1]! * ny;
        const dq = q[2 * c]! * nx + q[2 * c + 1]! * ny;
        if (dp < pMin) pMin = dp;
        if (dp > pMax) pMax = dp;
        if (dq < qMin) qMin = dq;
        if (dq > qMax) qMax = dq;
      }
      if (pMax + gap <= qMin || qMax + gap <= pMin) return false;
    }
  }
  return true;
}

/** The placement of a scatter `textposition` value (`'middle right'`, …). */
export function labelPlacement(position: string): LabelPlacement {
  const [vertical, horizontal] = position.split(' ');
  const dx = horizontal === 'left' ? -1 : horizontal === 'right' ? 1 : 0;
  const dy = vertical === 'top' ? -1 : vertical === 'bottom' ? 1 : 0;
  return {
    anchorX: dx < 0 ? 'right' : dx > 0 ? 'left' : 'center',
    anchorY: dy < 0 ? 'bottom' : dy > 0 ? 'top' : 'middle',
    dx,
    dy,
  };
}

/**
 * The placement of a label pushed out from a node in direction (`ux`, `uy`) (screen convention,
 * +y down; any length): around a circle of nodes, every label points away from the center. A
 * direction of no length puts the label to the right.
 */
export function directedPlacement(ux: number, uy: number): LabelPlacement {
  const len = Math.hypot(ux, uy);
  if (!(len > 1e-9)) return labelPlacement('middle right');
  const dx = ux / len;
  const dy = uy / len;
  // Within about 20° of an axis the text is centered on it.
  const t = 0.35;
  return {
    anchorX: dx > t ? 'left' : dx < -t ? 'right' : 'center',
    anchorY: dy > t ? 'top' : dy < -t ? 'bottom' : 'middle',
    dx,
    dy,
  };
}

/**
 * What an arrangement says about where its labels have room (`node.textposition: 'auto'`). Angles
 * are degrees counter-clockwise from the x axis in layout coordinates (y up), as the layouts
 * return them.
 */
export type LabelRule =
  /**
   * A tidy tree or a dendrogram: beyond a leaf, and beside a node whose children show. `leaf`:
   * 1 for the nodes without children showing (leaves, and collapsed nodes).
   */
  | {
      readonly kind: 'tree';
      readonly orientation: 'TB' | 'BT' | 'LR' | 'RL';
      readonly leaf: Uint8Array;
    }
  /** A radial tree: along the radius, outwards from a leaf and inwards from the others. */
  | {
      readonly kind: 'radial';
      readonly angle: Float64Array;
      readonly radius: Float64Array;
      readonly leaf: Uint8Array;
    }
  /** An arc diagram: on the side of the line the arcs are not on (`arcs`: the side they are on). */
  | { readonly kind: 'arc'; readonly vertical: boolean; readonly arcs: 'above' | 'below' }
  /** A hive plot: beside the node's axis. */
  | { readonly kind: 'hive'; readonly axis: Int32Array; readonly axisAngle: Float64Array };

/** What {@link nodePlacements} reads of a calc. */
interface Placed {
  /** Node positions; `NaN` for a node that has none. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly arrangement: string;
  readonly labelRule?: LabelRule | undefined;
}

/** A label turned upright, hanging under its node (`down`) or standing on it. */
function uprightPlacement(down: boolean): LabelPlacement {
  // Read from the bottom up either way: under a node the text ends at it, over a node it starts.
  return {
    anchorX: down ? 'right' : 'left',
    anchorY: 'middle',
    dx: 0,
    dy: down ? 1 : -1,
    angle: -90,
  };
}

/** The placements of a {@link LabelRule}. `sx` / `sy`: the signs of the axis scales. */
function rulePlacements(
  rule: LabelRule,
  sx: number,
  sy: number,
): LabelPlacement | ((i: number) => LabelPlacement) {
  if (rule.kind === 'tree') {
    const { orientation, leaf } = rule;
    let beyond: LabelPlacement;
    let before: LabelPlacement;
    if (orientation === 'LR' || orientation === 'RL') {
      const right = (orientation === 'LR') === sx >= 0;
      beyond = labelPlacement(right ? 'middle right' : 'middle left');
      before = labelPlacement(right ? 'middle left' : 'middle right');
    } else {
      beyond = uprightPlacement((orientation === 'TB') === sy >= 0);
      // Beside the node: the links leave and arrive above and below it.
      before = labelPlacement('middle right');
    }
    return (i) => (leaf[i] === 1 ? beyond : before);
  }
  if (rule.kind === 'arc') {
    const above = rule.arcs === 'above';
    if (rule.vertical) return labelPlacement(above === sx >= 0 ? 'middle left' : 'middle right');
    return uprightPlacement(above === sy >= 0);
  }
  if (rule.kind === 'hive') {
    const sides = Array.from(rule.axisAngle, (degrees) => {
      // The side of the axis that points more to the right (up, for a level axis).
      const a = (degrees * Math.PI) / 180;
      let px = Math.sin(a) * sx;
      let py = -Math.cos(a) * sy;
      if (px < -1e-9 || (Math.abs(px) <= 1e-9 && py < 0)) {
        px = -px;
        py = -py;
      }
      // Screen y is down.
      return directedPlacement(px, -py);
    });
    const none = labelPlacement('middle right');
    return (i) => sides[rule.axis[i]!] ?? none;
  }
  const { angle, radius, leaf } = rule;
  const center = labelPlacement('top center');
  return (i) => {
    if (!(radius[i]! > 0)) return center;
    const a = (angle[i]! * Math.PI) / 180;
    // The direction from the center to the node on screen (y down).
    // (`+ 0`: no negative zeros.)
    const ux = Math.cos(a) * sx + 0;
    const uy = -Math.sin(a) * sy + 0;
    const out = leaf[i] === 1 ? 1 : -1;
    const turn = (Math.atan2(uy, ux) * 180) / Math.PI;
    // On the left half the text is turned round, so that none is upside down.
    const flip = ux < 0;
    return {
      anchorX: out > 0 !== flip ? 'left' : 'right',
      anchorY: 'middle',
      dx: out * ux + 0,
      dy: out * uy + 0,
      angle: flip ? turn + 180 : turn,
    };
  };
}

/**
 * Where the labels of a trace sit, for a `node.textposition` value: one placement for all, or,
 * for `'auto'`, where the arrangement has room: by its {@link LabelRule} (trees, arc diagrams,
 * hive plots), or around a circular arrangement one per node, pointing away from the center of
 * the placed nodes (hidden groups included, so hiding one does not turn the labels of the others).
 * `scaleX` / `scaleY` are the axis scales (px per unit, signed): screen directions follow them.
 * `undefined` for `'none'`.
 */
export function nodePlacements(
  position: string,
  calc: Placed,
  scaleX: number,
  scaleY: number,
): LabelPlacement | ((i: number) => LabelPlacement) | undefined {
  if (position === 'none') return undefined;
  if (position !== 'auto') return labelPlacement(position);
  if (calc.labelRule)
    return rulePlacements(calc.labelRule, scaleX < 0 ? -1 : 1, scaleY < 0 ? -1 : 1);
  if (calc.arrangement !== 'circular') return labelPlacement('middle right');
  let cx = 0;
  let cy = 0;
  let count = 0;
  for (let i = 0; i < calc.x.length; i++) {
    if (!Number.isFinite(calc.x[i]) || !Number.isFinite(calc.y[i])) continue;
    cx += calc.x[i]!;
    cy += calc.y[i]!;
    count++;
  }
  if (count < 2) return labelPlacement('middle right');
  cx /= count;
  cy /= count;
  // Linear y is up, screen y is down.
  return (i) => directedPlacement((calc.x[i]! - cx) * scaleX, -(calc.y[i]! - cy) * scaleY);
}

/**
 * Node indices in label priority: most links first, ties by index. Nodes without a label are
 * left out by the caller's `width` (0).
 */
export function labelPriority(degree: Int32Array): Uint32Array {
  const order = new Uint32Array(degree.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  return order.sort((a, b) => degree[b]! - degree[a]! || a - b);
}

/** What {@link cullLabels} places. Positions are screen px, +y down. */
export interface CullInput {
  /** Node indices in priority order. */
  readonly order: ArrayLike<number>;
  /** Node center of node `i` in px; non-finite for a node that is not drawn. */
  px(i: number): number;
  py(i: number): number;
  /** Half the node's extent in px, by node. */
  readonly halfWidth: ArrayLike<number>;
  readonly halfHeight: ArrayLike<number>;
  /** The label's size in px; a width of 0 is no label. Asked only for nodes in the view. */
  width(i: number): number;
  readonly height: number;
  /** Where labels sit: one placement for all, or one per node. */
  readonly placement: LabelPlacement | ((i: number) => LabelPlacement);
  /**
   * Labels keep clear of the nodes that rank before them (default true). Turn it off for graphs
   * whose nodes are dots smaller than a label's gap.
   */
  readonly avoidNodes?: boolean;
  /** The view in px; labels of nodes outside it (grown by `margin`) are not placed. */
  readonly view: {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
  };
  readonly margin?: number;
  /** Space kept between two labels, in px. Default 2. */
  readonly gap?: number;
  /** Stop after this many labels. Default: no limit. */
  readonly max?: number;
}

/** The node indices whose labels are drawn, in priority order. */
export function cullLabels(input: CullInput): number[] {
  const { order, view } = input;
  const gap = input.gap ?? 2;
  const margin = input.margin ?? 0;
  const max = input.max ?? Infinity;
  const height = input.height;
  const avoidNodes = input.avoidNodes !== false;
  const fixed = typeof input.placement === 'function' ? undefined : input.placement;
  const placementOf = typeof input.placement === 'function' ? input.placement : undefined;
  // Cells about as large as a label: a box touches a handful of them (a label that is turned
  // upright a few more).
  const cellW = Math.max(16, height * 4);
  const cellH = Math.max(8, height + gap);
  const cells = new Map<number, number[]>();
  // Occupied boxes (kept labels, and nodes), flat: x0, y0, x1, y1; and the corners of those that
  // are turned, by box.
  const boxes: number[] = [];
  const quads = new Map<number, Float64Array>();
  const kept: number[] = [];
  const corners = (b: number): ArrayLike<number> =>
    quads.get(b) ?? [
      boxes[b]!,
      boxes[b + 1]!,
      boxes[b + 2]!,
      boxes[b + 1]!,
      boxes[b + 2]!,
      boxes[b + 3]!,
      boxes[b]!,
      boxes[b + 3]!,
    ];
  const cx0 = view.x0 - margin;
  const cy0 = view.y0 - margin;
  const cx1 = view.x1 + margin;
  const cy1 = view.y1 + margin;
  // Cell columns are offset so that the key of (column, row) is unique for any view size.
  const STRIDE = 1 << 20;

  const occupy = (x0: number, y0: number, x1: number, y1: number, quad?: Float64Array): void => {
    const at = boxes.length;
    boxes.push(x0, y0, x1, y1);
    if (quad) quads.set(at, quad);
    const c1 = Math.floor(x1 / cellW);
    const r1 = Math.floor(y1 / cellH);
    for (let c = Math.floor(x0 / cellW); c <= c1; c++) {
      for (let r = Math.floor(y0 / cellH); r <= r1; r++) {
        const key = c * STRIDE + r;
        const cell = cells.get(key);
        if (cell) cell.push(at);
        else cells.set(key, [at]);
      }
    }
  };

  for (let k = 0; k < order.length && kept.length < max; k++) {
    const i = order[k]!;
    const x = input.px(i);
    const y = input.py(i);
    if (!(x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1)) continue;
    const hw = input.halfWidth[i]!;
    const hh = input.halfHeight[i]!;
    const w = input.width(i);
    if (w > 0) {
      const box = labelBox(fixed ?? placementOf!(i), hw, hh, w, height);
      const x0 = x + box.x0;
      const y0 = y + box.y0;
      const x1 = x + box.x1;
      const y1 = y + box.y1;
      // A turned label's own corners, on screen.
      let quad: Float64Array | undefined;
      if (box.quad) {
        quad = box.quad;
        for (let c = 0; c < 8; c += 2) {
          quad[c] = quad[c]! + x;
          quad[c + 1] = quad[c + 1]! + y;
        }
      }
      const c1 = Math.floor((x1 + gap) / cellW);
      const r1 = Math.floor((y1 + gap) / cellH);
      let free = true;
      for (let c = Math.floor((x0 - gap) / cellW); c <= c1 && free; c++) {
        for (let r = Math.floor((y0 - gap) / cellH); r <= r1 && free; r++) {
          const cell = cells.get(c * STRIDE + r);
          if (!cell) continue;
          for (const b of cell) {
            if (
              x0 < boxes[b + 2]! + gap &&
              boxes[b]! < x1 + gap &&
              y0 < boxes[b + 3]! + gap &&
              boxes[b + 1]! < y1 + gap
            ) {
              // The boxes meet. When either is a turned label, their rectangles may not.
              if (
                (quad || quads.has(b)) &&
                !quadsTouch(quad ?? [x0, y0, x1, y0, x1, y1, x0, y1], corners(b), gap)
              ) {
                continue;
              }
              free = false;
              break;
            }
          }
        }
      }
      if (free) {
        occupy(x0, y0, x1, y1, quad);
        kept.push(i);
      }
    }
    // The node itself is in the way of every label that ranks after it.
    if (avoidNodes && hw > 0 && hh > 0) occupy(x - hw, y - hh, x + hw, y + hh);
  }
  return kept;
}
