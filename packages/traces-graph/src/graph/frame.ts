/**
 * What of a `graph` trace is on screen (backlog G2, G4): the node positions, the nodes not drawn
 * and the routes that the view draws and that hover and selection answer for. At rest that is the
 * calc itself. While a force layout is shown settling (`force.simulate`) or a tree folds or
 * unfolds, the view puts a frame in its place for every animation frame, so that the pointer
 * finds a node where it is drawn, not where it will end up. Autorange never reads a frame: the
 * axes are sized for the calc, the settled layout.
 *
 * A frame has a `stamp` that no other frame of its calc has had; what is built from a frame (the
 * link geometry, the spatial index of the nodes) is kept until the stamp changes.
 */
import type { LinkRoute } from '../layout/types.ts';
import type { GraphCalc } from './calc.ts';

/** The positions a view draws. Arrays are indexed by node; `routes` by (kept) link. */
export interface GraphFrame {
  /** Node centers in linear coordinates. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** 1 where the node is not drawn. */
  readonly hidden: Uint8Array;
  readonly routes: readonly (LinkRoute | undefined)[] | undefined;
  /**
   * How much of each node shows, 0 to 1: a node that is folding away or unfolding, and its links
   * with it. Unset: every node drawn in full.
   */
  readonly fade?: Float32Array | undefined;
  /**
   * This frame is the frame with stamp `from` but for the positions of `nodes` (a node dragged):
   * what was built from that frame can be brought up to date instead of built again.
   */
  readonly moved?: { readonly from: number; readonly nodes: readonly number[] } | undefined;
  /** See the module comment. 0 is the calc's own. */
  readonly stamp: number;
}

const SHOWN = new WeakMap<GraphCalc, GraphFrame>();
const OWN = new WeakMap<GraphCalc, GraphFrame>();
let stamps = 0;

/** The frame of `calc` that is on screen: the one last shown, else the calc's own positions. */
export function frameOf(calc: GraphCalc): GraphFrame {
  const shown = SHOWN.get(calc);
  if (shown) return shown;
  let own = OWN.get(calc);
  if (!own) {
    own = { x: calc.x, y: calc.y, hidden: calc.hidden, routes: calc.routes, stamp: 0 };
    OWN.set(calc, own);
  }
  return own;
}

/**
 * Put `frame` on screen in place of `calc`'s own positions, or with `undefined` go back to them.
 * Returns the frame that is now shown.
 */
export function showFrame(
  calc: GraphCalc,
  frame: Omit<GraphFrame, 'stamp'> | undefined,
): GraphFrame {
  if (!frame) {
    SHOWN.delete(calc);
    return frameOf(calc);
  }
  const shown: GraphFrame = { ...frame, stamp: ++stamps };
  SHOWN.set(calc, shown);
  return shown;
}

/**
 * How much smaller than their size in px box nodes are drawn, 0 to 1. Positions that a layout
 * computed are layout units, a px each at the size the graph was laid out for; when the plot area
 * is smaller than that, autorange shrinks the distances between the nodes, and boxes that kept
 * their size would run into each other. So below a scale of one px per unit the boxes, their text
 * and the outlines the links end on shrink with the axes, like a drawing that is scaled to fit,
 * and above it they keep their size, like markers. 1 for markers and for positions that are data.
 */
export function nodeScaleOf(calc: GraphCalc, scaleX: number, scaleY: number): number {
  if (!calc.model.box || !(calc.units ?? !calc.preset)) return 1;
  const k = Math.min(1, Math.abs(scaleX), Math.abs(scaleY));
  return k > 0 && Number.isFinite(k) ? k : 1;
}
