/**
 * Node dragging in a `sankey` trace (plan E13.5b), after plotly.js' `sankey/render.js`
 * `attachDragBehavior`. Unless `arrangement` is `'fixed'`, a press on a node (or its hover zone)
 * drags it once the pointer moves more than the click tolerance:
 *
 * - `'perpendicular'`: across the flow only, its center kept within the domain (Plotly's clamp);
 * - `'freeform'`: along the flow too (unclamped, as Plotly);
 * - `'snap'`: anywhere while dragged, the other nodes of its column making room (Plotly runs a
 *   collision force; here they are pushed apart deterministically from where they were when the
 *   drag started, keeping the padding and staying in the domain), and back into its column on
 *   release.
 *
 * Links follow on every move (link breadths and loop routes are recomputed). The release restyles
 * `node.x` / `node.y` of every node to the positions shown (fractions of the domain, node
 * centers), as Plotly's `persistFinalNodePositions` does; a press without a move is a click. The
 * state machine is pure: it works on the model the view last drew and calls back into it
 * ({@link SankeyDragHost}), so it is unit tested without a renderer.
 */
import { isArrayLike } from '@mk7s/holochart-core';
import type { ComponentPointerEvent } from '@mk7s/holochart-runtime';
import { hitTest, type SankeyHit } from './hover.ts';
import { toFlow, type NodeOverrides, type SankeyModel } from './model.ts';
import type { SankeyGraph, SankeyNode } from './layout.ts';

/** The runtime's click tolerance (px): a press that moves less is a click. */
export const DRAG_TOLERANCE = 3;

/** Callbacks into the sankey view. */
export interface SankeyDragHost {
  /** The model last drawn, or `undefined`. */
  model(): SankeyModel | undefined;
  /** A drag of node `i` (a position in the model) started: drop the hover. */
  begin(i: number): void;
  /** Draw with node positions (`undefined`: back to the model's own). */
  show(overrides: NodeOverrides | undefined): void;
  /** The drag ended: keep `overrides` shown and restyle with `update`. */
  drop(overrides: NodeOverrides, update: Record<string, unknown>): void;
  /** A press without a move on a node. */
  click(hit: SankeyHit, event: ComponentPointerEvent): void;
}

/** Nodes sharing `node`'s column (the same left edge), `node` included. */
function columnOf(graph: SankeyGraph, node: SankeyNode): SankeyNode[] {
  return graph.nodes.filter((n) => Math.abs(n.x0 - node.x0) < 1e-6);
}

/**
 * Positions (flow frame, every node) after moving node `i` of `graph` so its center is at
 * (`cx`, `cy`), following `arrangement` (see the module comment). `release` puts a snapped node
 * back into its column.
 */
export function dragPositions(
  graph: SankeyGraph,
  i: number,
  cx: number,
  cy: number,
  arrangement: string,
  release = false,
): Map<number, { x0: number; y0: number }> {
  const out = new Map(graph.nodes.map((n) => [n.index, { x0: n.x0, y0: n.y0 }]));
  const node = graph.nodes[i];
  if (!node || arrangement === 'fixed') return out;
  const w = node.x1 - node.x0;
  const h = node.y1 - node.y0;
  const size = graph.height;
  if (arrangement !== 'snap') {
    const y = Math.max(0, Math.min(size - h / 2, cy));
    out.set(i, { x0: arrangement === 'freeform' ? cx - w / 2 : node.x0, y0: y - h / 2 });
    return out;
  }
  const y0 = cy - h / 2;
  out.set(i, { x0: release ? node.x0 : cx - w / 2, y0 });
  // Push the rest of the column away from the dragged node, keeping the padding.
  const pad = graph.padding;
  const peers = columnOf(graph, node).filter((n) => n !== node);
  // Nearest first on both sides.
  const above = peers.filter((n) => (n.y0 + n.y1) / 2 < cy).sort((a, b) => b.y0 - a.y0);
  const below = peers.filter((n) => (n.y0 + n.y1) / 2 >= cy).sort((a, b) => a.y0 - b.y0);
  // Nodes with no room left on their side pass to the other one (the dragged node went past).
  const room = (list: readonly SankeyNode[]): number =>
    list.reduce((s, n) => s + n.y1 - n.y0 + pad, 0);
  for (let guard = 0; guard < peers.length; guard++) {
    const first = below[0];
    const last = above[0];
    if (
      first &&
      y0 + h + room(below) > size &&
      y0 - room(above) - (first.y1 - first.y0) - pad >= 0
    ) {
      above.unshift(below.shift()!);
    } else if (
      last &&
      y0 - room(above) < 0 &&
      y0 + h + room(below) + (last.y1 - last.y0) + pad <= size
    ) {
      below.unshift(above.shift()!);
    } else break;
  }
  const place = (list: SankeyNode[], down: boolean): void => {
    let edge = down ? y0 + h + pad : y0 - pad;
    const ys = list.map((n) => {
      const nh = n.y1 - n.y0;
      let top = n.y0;
      if (down && top < edge) top = edge;
      if (!down && top + nh > edge) top = edge - nh;
      edge = down ? top + nh + pad : top - pad;
      return top;
    });
    // Back into the domain, towards the dragged node.
    let bound = down ? size : 0;
    for (let k = list.length - 1; k >= 0; k--) {
      const nh = list[k]!.y1 - list[k]!.y0;
      if (down && ys[k]! + nh > bound) ys[k] = bound - nh;
      if (!down && ys[k]! < bound) ys[k] = bound;
      bound = down ? ys[k]! - pad : ys[k]! + nh + pad;
    }
    list.forEach((n, k) => out.set(n.index, { x0: n.x0, y0: ys[k]! }));
  };
  place(above, false);
  place(below, true);
  return out;
}

/**
 * The restyle of a drop (Plotly's `persistFinalNodePositions`): `node.x` / `node.y` of every drawn
 * node, the center as a fraction of the domain along / across the flow, by node index. Entries of
 * nodes that are not drawn keep their value (0, unset, by default).
 */
export function restylePayload(
  model: SankeyModel,
  positions: NodeOverrides,
): Record<string, unknown> {
  const node = (model.trace['node'] ?? {}) as Record<string, unknown>;
  const oldX = isArrayLike(node['x']) ? node['x'] : [];
  const oldY = isArrayLike(node['y']) ? node['y'] : [];
  let n = Math.max(oldX.length, oldY.length);
  for (const c of model.calc.nodes) n = Math.max(n, c.index + 1);
  const xs = Array.from({ length: n }, (_, k) => (Number(oldX[k]) || 0) as number);
  const ys = Array.from({ length: n }, (_, k) => (Number(oldY[k]) || 0) as number);
  model.graph.nodes.forEach((g, i) => {
    const p = positions.get(i) ?? { x0: g.x0, y0: g.y0 };
    const index = model.calc.nodes[i]!.index;
    xs[index] = (p.x0 + (g.x1 - g.x0) / 2) / (model.along || 1);
    ys[index] = (p.y0 + (g.y1 - g.y0) / 2) / (model.across || 1);
  });
  return { 'node.x': [xs], 'node.y': [ys] };
}

interface Gesture {
  readonly node: number;
  readonly x0: number;
  readonly y0: number;
  /** The node's flow-frame center when pressed. */
  readonly cx: number;
  readonly cy: number;
  readonly model: SankeyModel;
  moved: boolean;
}

/** Pointer state machine of one sankey view (see the module comment). */
export class SankeyDrag {
  readonly #host: SankeyDragHost;
  #g: Gesture | undefined;

  constructor(host: SankeyDragHost) {
    this.#host = host;
  }

  /** A press or drag is in progress. */
  get active(): boolean {
    return this.#g !== undefined;
  }

  /** Handle one pointer event; `true` when the drag took it. */
  handle(event: ComponentPointerEvent): boolean {
    if (this.#g) return this.#continue(event, this.#g);
    if (event.type !== 'down' || event.button !== 0) return false;
    const model = this.#host.model();
    if (!model || model.calc.arrangement === 'fixed') return false;
    const hit = hitTest(model, event.x, event.y);
    if (hit?.kind !== 'node') return false;
    const n = model.graph.nodes[hit.i]!;
    this.#g = {
      node: hit.i,
      x0: event.x,
      y0: event.y,
      cx: (n.x0 + n.x1) / 2,
      cy: (n.y0 + n.y1) / 2,
      model,
      moved: false,
    };
    return true;
  }

  #continue(event: ComponentPointerEvent, g: Gesture): boolean {
    if (event.type === 'move') {
      if (!g.moved && Math.hypot(event.x - g.x0, event.y - g.y0) <= DRAG_TOLERANCE) return true;
      if (!g.moved) {
        g.moved = true;
        this.#host.begin(g.node);
      }
      const [fx, fy] = toFlow(g.model, event.x, event.y);
      const [sx, sy] = toFlow(g.model, g.x0, g.y0);
      this.#host.show(
        dragPositions(
          g.model.graph,
          g.node,
          g.cx + fx - sx,
          g.cy + fy - sy,
          g.model.calc.arrangement,
        ),
      );
      event.cursor =
        g.model.calc.arrangement === 'perpendicular'
          ? g.model.horizontal
            ? 'ns-resize'
            : 'ew-resize'
          : 'move';
      return true;
    }
    if (event.type === 'leave') {
      // A cancelled gesture (no `up` follows): back to where the nodes were.
      this.#g = undefined;
      if (g.moved) this.#host.show(undefined);
      return true;
    }
    if (event.type === 'up') {
      this.#g = undefined;
      if (!g.moved) {
        this.#host.click({ kind: 'node', i: g.node }, event);
        return true;
      }
      const [fx, fy] = toFlow(g.model, event.x, event.y);
      const [sx, sy] = toFlow(g.model, g.x0, g.y0);
      const positions = dragPositions(
        g.model.graph,
        g.node,
        g.cx + fx - sx,
        g.cy + fy - sy,
        g.model.calc.arrangement,
        true,
      );
      this.#host.drop(positions, restylePayload(g.model, positions));
      return true;
    }
    // The runtime's own click after an `up` without a move: already handled.
    return true;
  }
}
