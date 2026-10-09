/**
 * Which node labels of a `graph3d` trace are drawn (backlog G6). The rule is the 2D trace's, with
 * the scene's greedy culling (`traces-3d`, `scene/labels.ts`): candidates are taken in priority
 * order (the nodes with the most links first) and a label is kept when its box is clear of the
 * labels kept before it. What differs in space is what else is in the way: every node on screen,
 * near or far, whatever its rank, because a label that crosses a sphere is either hidden behind it
 * or drawn over it. So a clump of nodes shows no labels until the camera has come close enough to
 * open it, and nodes with room around them are named.
 *
 * Pure: screen positions in, node indices out. Boxes are looked up through a grid of cells about a
 * label in size, so a pass costs about one step per node and per candidate.
 */
import { LABEL_GAP, type LabelPlacement } from '../graph/labels.ts';

export interface Label3dInput {
  /** The candidates, as node indices in priority order. */
  readonly order: ArrayLike<number>;
  /** Where every node is on screen, in px (y down); not finite for a node that is not there. */
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  /** Every node's radius on screen, in px. */
  readonly radius: ArrayLike<number>;
  /** The width of a node's label in px; 0 is no label. Asked for candidates on screen only. */
  width(i: number): number;
  /** The height of a label in px. */
  readonly height: number;
  /** Where a label sits relative to its node. */
  readonly placement: LabelPlacement;
  /** The scene on screen: a label is kept only when all of it is inside. */
  readonly view: {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
  };
  /** Space kept around a label, in px. Default 2. */
  readonly gap?: number;
  /** Stop after this many labels. Default: no limit. */
  readonly max?: number;
}

/** The candidates whose labels are drawn, in priority order (see the module comment). */
export function cullLabels3d(input: Label3dInput): number[] {
  const { order, x, y, radius, view, placement, height } = input;
  const gap = input.gap ?? 2;
  const max = input.max ?? Infinity;
  const cellW = Math.max(16, height * 4);
  const cellH = Math.max(8, height + gap);
  // Cell columns are offset so that the key of (column, row) is unique for any view size.
  const STRIDE = 1 << 20;
  const cells = new Map<number, number[]>();
  // Occupied boxes (nodes, then kept labels), flat: x0, y0, x1, y1.
  const boxes: number[] = [];

  const occupy = (x0: number, y0: number, x1: number, y1: number): void => {
    const at = boxes.length;
    boxes.push(x0, y0, x1, y1);
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
  const free = (x0: number, y0: number, x1: number, y1: number): boolean => {
    const c1 = Math.floor((x1 + gap) / cellW);
    const r1 = Math.floor((y1 + gap) / cellH);
    for (let c = Math.floor((x0 - gap) / cellW); c <= c1; c++) {
      for (let r = Math.floor((y0 - gap) / cellH); r <= r1; r++) {
        const cell = cells.get(c * STRIDE + r);
        if (!cell) continue;
        for (const b of cell) {
          if (
            x0 < boxes[b + 2]! + gap &&
            boxes[b]! < x1 + gap &&
            y0 < boxes[b + 3]! + gap &&
            boxes[b + 1]! < y1 + gap
          ) {
            return false;
          }
        }
      }
    }
    return true;
  };

  // Every node on screen is in the way of every label.
  for (let i = 0; i < x.length; i++) {
    const px = x[i]!;
    const py = y[i]!;
    const r = radius[i]!;
    if (!(px + r >= view.x0 && px - r <= view.x1 && py + r >= view.y0 && py - r <= view.y1)) {
      continue;
    }
    occupy(px - r, py - r, px + r, py + r);
  }

  const kept: number[] = [];
  for (let k = 0; k < order.length && kept.length < max; k++) {
    const i = order[k]!;
    const px = x[i]!;
    const py = y[i]!;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const w = input.width(i);
    if (!(w > 0)) continue;
    const reach = radius[i]! + LABEL_GAP;
    const ax = px + placement.dx * reach;
    const ay = py + placement.dy * reach;
    const x0 =
      placement.anchorX === 'right' ? ax - w : placement.anchorX === 'left' ? ax : ax - w / 2;
    const y0 =
      placement.anchorY === 'bottom'
        ? ay - height
        : placement.anchorY === 'top'
          ? ay
          : ay - height / 2;
    const x1 = x0 + w;
    const y1 = y0 + height;
    if (x0 < view.x0 || y0 < view.y0 || x1 > view.x1 || y1 > view.y1) continue;
    if (!free(x0, y0, x1, y1)) continue;
    occupy(x0, y0, x1, y1);
    kept.push(i);
  }
  return kept;
}
