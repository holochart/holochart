/**
 * Node dragging in a `graph` trace (backlog G5), on the pattern of sankey's (`SankeyDrag`): a
 * press on a node takes the gesture, a move past the click tolerance drags the node with its
 * links, and the release restyles the node's position like any change made on the chart
 * (`{ gui: true }`: `uirevision` keeps it, `restyle` is emitted). The state machine is pure: it
 * calls back into the view ({@link GraphDragHost}), so it is tested without a renderer.
 *
 * Which nodes drag, and what a release writes ({@link positionUpdate}):
 *
 * - `arrangement: 'preset'`: positions are data. `node.x` / `node.y` get the node's new position
 *   in the axes' units ({@link axisValue}: a date string on a date axis, a power of ten on a log
 *   axis, the nearest category on a category axis; a multicategory axis keeps the node where it
 *   is along it). The other entries are written back as they were.
 * - `'force'` (not a timeline): the node's `node.x` / `node.y` become given, in layout units,
 *   which pins it; the other nodes' stay as they are (unset, unless pinned before). `force.start`
 *   gets the picture on screen, at rest, so the figure is that picture and no layout runs
 *   (`warm.ts`). A double click on a pinned node unsets its two entries again, and `force.start`
 *   gets the picture, warm: the layout goes on from it.
 * - `'custom'` with `node.draggable: true`: as `'force'` without `force.start`; the positions
 *   reach the layout as `graph.x` / `graph.y`, to do with them what it likes.
 * - every other arrangement places each node itself and ignores given positions: no drag.
 *
 * A press that does not move is left to the chart: it is a click on the node (the view lets it
 * through, `clickThrough`). The press itself is taken either way, so the chart starts no zoom
 * box, pan or selection from a node.
 */
import { isArrayLike } from '@mk7s/holochart-core';
import type { AxisInfo, ComponentPointerEvent } from '@mk7s/holochart-runtime';
import type { GraphCalc } from './calc.ts';

/** The runtime's click tolerances (px): a press that moves less is a click (mouse; touch, pen). */
export const DRAG_TOLERANCE = 3;
export const TOUCH_TOLERANCE = 10;

type Container = Readonly<Record<string, unknown>>;

function part(trace: Container, key: string): Container {
  const v = trace[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Container) : {};
}

/** How the nodes of a calc drag: not at all, as data on the axes, or as pins of a layout. */
export type DragKind = 'none' | 'preset' | 'force' | 'custom';

/** How the nodes of `trace` drag (see the module comment). */
export function dragKind(trace: Container, calc: GraphCalc): DragKind {
  if (part(trace, 'node')['draggable'] !== true) return 'none';
  if (calc.preset) return 'preset';
  // A timeline's nodes are held on a real axis, and a layout that failed is drawn as a circle.
  if (calc.arrangement === 'force' && calc.force && !calc.real) return 'force';
  if (calc.arrangement === 'custom') return 'custom';
  return 'none';
}

/**
 * 1 for the nodes a force layout holds where the figure says (`node.x` and `node.y` both given),
 * `undefined` when there is none or the nodes do not drag: they are the ones with a ring, which a
 * double click releases.
 */
export function pinnedNodes(trace: Container, calc: GraphCalc): Uint8Array | undefined {
  if (dragKind(trace, calc) !== 'force' || !calc.force) return undefined;
  const { x, y } = calc.force.graph;
  let mask: Uint8Array | undefined;
  for (let i = 0; i < calc.length; i++) {
    if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue;
    mask ??= new Uint8Array(calc.length);
    mask[i] = 1;
  }
  return mask;
}

type Axis = Pick<AxisInfo, 'type' | 'scale'> | undefined;

/**
 * Where a node dragged to linear `l` along `axis` may be: anywhere on a continuous axis, on the
 * nearest category of a category axis, and where it was (`from`) on a multicategory axis.
 */
export function axisSnap(axis: Axis, l: number, from: number): number {
  if (axis?.type === 'multicategory') return from;
  if (axis?.type !== 'category') return l;
  const count = axis.scale.categories.length;
  return count > 0 ? Math.min(count - 1, Math.max(0, Math.round(l))) : from;
}

/**
 * The linear coordinate `l` as a value of `axis`, for `node.x` / `node.y`: a number, a date
 * string, a category name. `undefined` on a multicategory axis (the entry is left as it is).
 */
export function axisValue(axis: Axis, l: number): unknown {
  if (!axis) return l;
  if (axis.type === 'multicategory') return undefined;
  if (axis.type === 'date') return axis.scale.l2r(l);
  if (axis.type === 'category') return axis.scale.l2d(Math.round(l));
  return axis.scale.l2d(l);
}

/** Layout units as they are written to a figure: to a hundredth of a px. */
export function roundUnit(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : v;
}

/** `values` as a plain array of at least `count` entries (`null` where there is none). */
function entries(values: unknown, count: number): unknown[] {
  const given =
    isArrayLike(values) && typeof values !== 'string' ? (values as ArrayLike<unknown>) : [];
  const out = new Array<unknown>(Math.max(count, given.length)).fill(null);
  for (let k = 0; k < given.length; k++) {
    const v = given[k];
    out[k] = v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? null : v;
  }
  return out;
}

/** A picture a force layout goes on from: `force.start` (`warm.ts`). */
export interface StartPositions {
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  /** How warm the layout is there: 0 at rest. */
  readonly alpha: number;
}

/** The restyle that sets `force.start` to a picture, in layout units to a hundredth. */
export function startUpdate(start: StartPositions): Record<string, unknown> {
  // One value for one trace: a restyle reads an array as a value per trace.
  return {
    'force.start.x': [Array.from(start.x, roundUnit)],
    'force.start.y': [Array.from(start.y, roundUnit)],
    'force.start.alpha': [start.alpha],
  };
}

/**
 * The restyle that puts node `i` at (`x`, `y`): `node.x` and `node.y` of every node as they were,
 * with the two entries of node `i` replaced (`null` unsets one, `undefined` leaves it). The two
 * arrays get an entry for each of the `count` nodes of the trace: a trace that gives its nodes
 * through its links alone counts them by its longest per-node array once it has one. `start` adds
 * `force.start` ({@link startUpdate}).
 */
export function positionUpdate(
  trace: Container,
  count: number,
  i: number,
  x: unknown,
  y: unknown,
  start?: StartPositions,
): Record<string, unknown> {
  const node = part(trace, 'node');
  const xs = entries(node['x'], Math.max(count, i + 1));
  const ys = entries(node['y'], Math.max(count, i + 1));
  if (x !== undefined) xs[i] = x;
  if (y !== undefined) ys[i] = y;
  return { 'node.x': [xs], 'node.y': [ys], ...(start ? startUpdate(start) : {}) };
}

/** Callbacks into the graph view. Positions are linear coordinates of the trace's axes. */
export interface GraphDragHost {
  /** The node a press at the event's place takes hold of; -1 for none (or none that drags). */
  pick(event: ComponentPointerEvent): number;
  /** The pointer of an event, kept inside the plot area; `undefined` when there is no plot area. */
  locate(event: ComponentPointerEvent): readonly [number, number] | undefined;
  /** Where node `i` is drawn. */
  position(i: number): readonly [number, number];
  /** A drag of node `i` started (the press moved): drop the hover. */
  begin(i: number): void;
  /** Draw node `i` at (`x`, `y`). */
  move(i: number, x: number, y: number): void;
  /** The drag ended with node `i` at (`x`, `y`): restyle. */
  drop(i: number, x: number, y: number): void;
  /** A drag that had started was cancelled (no release follows): back to where the node was. */
  cancel(i: number): void;
  /** Whether a double click releases node `i` (it is pinned). */
  pinned(i: number): boolean;
  /** A double click on pinned node `i`: release it. */
  release(i: number): void;
}

interface Gesture {
  readonly node: number;
  /** The press, container px. */
  readonly px: number;
  readonly py: number;
  /** From the pointer to the node's center when pressed, linear: the node does not jump. */
  readonly dx: number;
  readonly dy: number;
  readonly tolerance: number;
  moved: boolean;
}

function toleranceOf(event: ComponentPointerEvent): number {
  const type = (event.native as { pointerType?: unknown } | undefined)?.pointerType;
  return type === 'touch' || type === 'pen' ? TOUCH_TOLERANCE : DRAG_TOLERANCE;
}

/** Pointer state machine of one graph view (see the module comment). */
export class GraphDrag {
  readonly #host: GraphDragHost;
  #g: Gesture | undefined;
  /** The release of a drag is not a click, whatever the runtime's own tolerance says. */
  #swallow = false;

  constructor(host: GraphDragHost) {
    this.#host = host;
  }

  /** A press on a node is in progress (it may not have moved yet). */
  get active(): boolean {
    return this.#g !== undefined;
  }

  /** A node is being dragged. */
  get dragging(): boolean {
    return this.#g?.moved === true;
  }

  /** The node of the gesture in progress, -1 for none. */
  get node(): number {
    return this.#g?.node ?? -1;
  }

  /** Forget the gesture in progress without calling back (the trace changed under it). */
  reset(): void {
    this.#g = undefined;
    this.#swallow = false;
  }

  /** Handle one pointer event; `true` when the drag took it. */
  handle(event: ComponentPointerEvent): boolean {
    const g = this.#g;
    if (g) return this.#continue(event, g);
    if (event.type === 'down') {
      this.#swallow = false;
      if (event.button !== 0) return false;
      const node = this.#host.pick(event);
      const at = node < 0 ? undefined : this.#host.locate(event);
      if (node < 0 || !at) return false;
      const [nx, ny] = this.#host.position(node);
      this.#g = {
        node,
        px: event.x,
        py: event.y,
        dx: nx - at[0],
        dy: ny - at[1],
        tolerance: toleranceOf(event),
        moved: false,
      };
      return true;
    }
    if (event.type === 'click') {
      const swallow = this.#swallow;
      this.#swallow = false;
      return swallow;
    }
    if (event.type === 'dblclick') {
      if (event.button !== 0) return false;
      const node = this.#host.pick(event);
      if (node < 0 || !this.#host.pinned(node)) return false;
      this.#host.release(node);
      return true;
    }
    // The click of a release follows it at once: anything else in between, and none is owed.
    this.#swallow = false;
    return false;
  }

  #target(event: ComponentPointerEvent, g: Gesture): readonly [number, number] {
    const at = this.#host.locate(event);
    return at ? [at[0] + g.dx, at[1] + g.dy] : this.#host.position(g.node);
  }

  #continue(event: ComponentPointerEvent, g: Gesture): boolean {
    switch (event.type) {
      case 'move': {
        if (!g.moved && Math.hypot(event.x - g.px, event.y - g.py) <= g.tolerance) return true;
        if (!g.moved) {
          g.moved = true;
          this.#host.begin(g.node);
        }
        const [x, y] = this.#target(event, g);
        this.#host.move(g.node, x, y);
        event.cursor = 'grabbing';
        return true;
      }
      case 'up': {
        this.#g = undefined;
        if (!g.moved) return true;
        this.#swallow = true;
        const [x, y] = this.#target(event, g);
        this.#host.drop(g.node, x, y);
        return true;
      }
      case 'leave':
        // A cancelled gesture (no `up` follows).
        this.#g = undefined;
        if (g.moved) this.#host.cancel(g.node);
        return true;
      default:
        return true;
    }
  }
}
