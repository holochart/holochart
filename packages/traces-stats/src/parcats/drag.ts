/**
 * Dragging in a `parcats` trace (plan E10.11), after plotly.js' `parcats/parcats.js` drag
 * handlers. Unless `arrangement` is `'fixed'`, a press on a category band (±2 px) drags it
 * vertically — and, with `'freeform'`, its dimension horizontally — and a press elsewhere in a
 * dimension's column (its label) drags the dimension. The dragged element follows the pointer and
 * swaps places with a neighbor once it passes the neighbor's middle (categories) or edge
 * (dimensions); the release restyles `displayindex`, or `categoryarray` / `ticktext` /
 * `categoryorder: 'array'` of the reordered dimensions.
 *
 * The state machine is pure: it works on the layout the view last drew and calls back into it
 * ({@link ParcatsDragHost}), so it is unit tested without a renderer.
 */
import type { ComponentPointerEvent } from '@mk7s/holochart-runtime';
import type { ParcatsCalc } from './calc.ts';
import {
  DIM_WIDTH,
  hitTest,
  type ParcatsLayout,
  type ParcatsOrder,
  type ParcatsState,
} from './layout.ts';

/** Room above the top category where a press grabs the dimension (its label). */
const LABEL_ROOM = 30;

/** Callbacks into the parcats view. */
export interface ParcatsDragHost {
  /** The layout last drawn, or `undefined`. */
  layout(): ParcatsLayout | undefined;
  /** The trace's `arrangement`. */
  arrangement(): unknown;
  /** Draw with a drag state (`undefined`: back to the calc's or the pending order). */
  show(state: ParcatsState | undefined): void;
  /** A drag reordered something: keep `order` shown and restyle with `update`. */
  drop(order: ParcatsOrder, update: Record<string, unknown>, event: ComponentPointerEvent): void;
}

/** What a press at `(x, y)` grabs: a category, a dimension, or nothing. */
export function pressTarget(
  layout: ParcatsLayout,
  x: number,
  y: number,
): { dim: number; cat?: number } | undefined {
  const hit = hitTest(layout, x, y, 2);
  if (hit?.kind === 'category') return { dim: hit.dim.dim, cat: hit.cat.cat };
  const { rect } = layout;
  if (y < rect.y - LABEL_ROOM || y > rect.y + rect.height) return undefined;
  const dim = layout.dims.find((d) => x >= d.x - 2 && x <= d.x + DIM_WIDTH + 2);
  return dim ? { dim: dim.dim } : undefined;
}

/** The restyle for going from `initial` to `order` (see the module comment), or `undefined`. */
export function restylePayload(
  calc: ParcatsCalc,
  initial: ParcatsOrder,
  order: ParcatsOrder,
): Record<string, unknown> | undefined {
  const update: Record<string, unknown> = {};
  const key = (d: number, attr: string): string =>
    `dimensions[${calc.dimensions[d]!.container}].${attr}`;
  if (order.dims.some((d, i) => d !== initial.dims[i])) {
    order.dims.forEach((d, i) => (update[key(d, 'displayindex')] = i));
  }
  calc.dimensions.forEach((dim, d) => {
    const listed = order.cats[d] ?? [];
    if (listed.every((c, i) => c === initial.cats[d]?.[i])) return;
    const rest = dim.categories.filter((c) => !listed.includes(c.index));
    const cats = [...listed.map((c) => dim.categories[c]!), ...rest];
    update[key(d, 'categoryarray')] = [cats.map((c) => c.value)];
    update[key(d, 'ticktext')] = [cats.map((c) => c.label)];
    update[key(d, 'categoryorder')] = 'array';
  });
  return Object.keys(update).length > 0 ? update : undefined;
}

interface Gesture {
  readonly dim: number;
  readonly cat: number | undefined;
  readonly x0: number;
  readonly y0: number;
  readonly dimX: number;
  readonly catY: number;
  readonly initial: ParcatsOrder;
  order: { dims: number[]; cats: number[][] };
  moved: boolean;
}

const swap = (list: number[], i: number, j: number): void => {
  [list[i], list[j]] = [list[j]!, list[i]!];
};

/** Pointer state machine of one parcats view (see the module comment). */
export class ParcatsDrag {
  readonly #host: ParcatsDragHost;
  #g: Gesture | undefined;

  constructor(host: ParcatsDragHost) {
    this.#host = host;
  }

  /** A drag is in progress. */
  get active(): boolean {
    return this.#g !== undefined;
  }

  /** Handle one pointer event; `true` when the drag took it. */
  handle(event: ComponentPointerEvent): boolean {
    if (this.#g) return this.#continue(event, this.#g);
    if (event.type !== 'down' || event.button !== 0) return false;
    const arrangement = this.#host.arrangement();
    const layout = this.#host.layout();
    if (arrangement === 'fixed' || !layout) return false;
    const target = pressTarget(layout, event.x, event.y);
    if (!target) return false;
    const dim = layout.dims.find((d) => d.dim === target.dim)!;
    const order = layout.order;
    this.#g = {
      dim: target.dim,
      cat: target.cat,
      x0: event.x,
      y0: event.y,
      dimX: dim.x,
      catY: dim.cats.find((c) => c.cat === target.cat)?.y ?? 0,
      initial: order,
      order: { dims: [...order.dims], cats: order.cats.map((c) => [...c]) },
      moved: false,
    };
    return true;
  }

  #continue(event: ComponentPointerEvent, g: Gesture): boolean {
    if (event.type === 'move') {
      const dx = event.x - g.x0;
      const dy = event.y - g.y0;
      if (!g.moved && dx === 0 && dy === 0) return true;
      g.moved = true;
      const layout = this.#host.layout();
      if (!layout) return true;
      const free = g.cat === undefined || this.#host.arrangement() === 'freeform';
      const { rect } = layout;
      const x = free
        ? Math.max(rect.x, Math.min(rect.x + rect.width - DIM_WIDTH, g.dimX + dx))
        : undefined;
      const y = g.cat === undefined ? undefined : g.catY + dy;
      const dims = layout.dims;
      const k = dims.findIndex((d) => d.dim === g.dim);
      if (y !== undefined) {
        const cats = dims[k]!.cats;
        const list = g.order.cats[g.dim]!;
        const i = list.indexOf(g.cat!);
        const h = cats[i]?.height ?? 0;
        const above = cats[i - 1];
        const below = cats[i + 1];
        if (above && y < above.y + above.height / 2) swap(list, i, i - 1);
        else if (below && y + h > below.y + below.height / 2) swap(list, i, i + 1);
      }
      if (x !== undefined) {
        const prev = dims[k - 1];
        const next = dims[k + 1];
        if (prev && x < prev.x + DIM_WIDTH) swap(g.order.dims, k, k - 1);
        else if (next && x + DIM_WIDTH > next.x) swap(g.order.dims, k, k + 1);
      }
      this.#host.show({
        order: g.order,
        drag: {
          dim: g.dim,
          ...(g.cat !== undefined ? { cat: g.cat, y } : {}),
          ...(x !== undefined ? { x } : {}),
        },
      });
      event.cursor = g.cat === undefined ? 'ew-resize' : free ? 'move' : 'ns-resize';
      return true;
    }
    if (event.type === 'up' || event.type === 'leave') {
      this.#g = undefined;
      if (!g.moved) return true;
      const layout = this.#host.layout();
      const update = layout && restylePayload(layout.calc, g.initial, g.order);
      if (update) this.#host.drop(g.order, update, event);
      else this.#host.show(undefined);
      return true;
    }
    return event.type !== 'click';
  }
}
