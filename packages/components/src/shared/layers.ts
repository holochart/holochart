/**
 * Plotly's drawing layers for layout shapes and images (plan E5.5, E5.6), mapped onto viewports.
 *
 * Plotly stacks, bottom to top: plot backgrounds → the figure's lower image and shape layers
 * (items with a `paper` reference and `layer: 'below'`) → per subplot: `below` shapes, `below`
 * images, grid and zero lines, `between` shapes, traces → the upper image and shape layers
 * (`layer: 'above'`). Items are clipped along their data axes only (a `paper` or `domain`
 * dimension may leave the plot area).
 *
 * Here each subplot is a scissored viewport that clears to `plot_bgcolor`, so:
 *
 * - `below` / `between` items with axis references draw inside their subplot's viewport, with a
 *   `renderOrder` below or above the grid (`BELOW_TRACES_ORDER`).
 * - Lower-layer items draw twice: into an underlay viewport drawn before every subplot (the part
 *   outside plot areas) and into each subplot viewport under everything (the part a subplot's
 *   background clear erased). Each pixel is still drawn once.
 * - Upper-layer items draw into a viewport drawn after every subplot and before the overlay, so
 *   they cover traces; unlike Plotly, axis lines, tick labels, legend and annotations (overlay) stay
 *   on top of them.
 *
 * Extra viewports are keyed by their clip axes and drawn only when something uses them.
 */
import type { DataTransform, Viewport, ViewportRect } from '@mk7s/holochart-render';
import type { AxisInfo, ComponentDrawContext, SubplotInfo } from '@mk7s/holochart-runtime';
import { BELOW_TRACES_ORDER } from './batches.ts';
import { findChart, rectTransform } from './host.ts';

/** Where an item sits in Plotly's stack: `lower` = `below`/`between` items with a paper ref. */
export type LayerStack = 'lower' | 'below' | 'between' | 'upper';

/** Which component draws: images go under shapes within a layer (Plotly's order). */
export type LayerKind = 'shapes' | 'images';

/** A viewport and draw order an item is drawn with. */
export interface LayerPlacement {
  /** Identity of (viewport, order): items with the same key can share primitives. */
  readonly key: string;
  readonly viewport: Viewport;
  /** Container px → world px of `viewport`. */
  readonly world: DataTransform;
  /** `renderOrder` inside the viewport. */
  readonly order: number;
}

/** What an item needs to be placed. */
export interface LayerRequest {
  readonly stack: LayerStack;
  /** Data axes the item is clipped to. */
  readonly clipX: Pick<AxisInfo, 'id' | 'start' | 'end'> | undefined;
  readonly clipY: Pick<AxisInfo, 'id' | 'start' | 'end'> | undefined;
  /** The subplot of the item's axes (`below` / `between`). */
  readonly subplot: SubplotInfo | undefined;
}

/** `renderOrder`s inside subplot viewports, around the grid (`BELOW_TRACES_ORDER`). */
const SUBPLOT_ORDER = {
  images: { lower: BELOW_TRACES_ORDER - 40, below: BELOW_TRACES_ORDER - 10, between: 0 },
  shapes: {
    lower: BELOW_TRACES_ORDER - 30,
    below: BELOW_TRACES_ORDER - 20,
    between: BELOW_TRACES_ORDER + 10,
  },
} as const;

/** Viewport orders of the extra viewports: subplots use 0, 1, …; the overlay is last. */
const VIEWPORT_ORDER = {
  images: { lower: -2, upper: 1e15 },
  shapes: { lower: -1, upper: 1e15 + 1 },
} as const;

/** Linear → container px of an axis as `c = l·m + b` (x from the left, y from the top). */
export function axisAffine(axis: Pick<AxisInfo, 'letter' | 'scale' | 'start'>): {
  m: number;
  b: number;
} {
  const { m, b } = axis.scale.affine();
  return axis.letter === 'x' ? { m, b: axis.start + b } : { m: -m, b: axis.start - b };
}

/**
 * Transform of geometry stored per dimension either in an axis' linear coordinates (`x` / `y`
 * given) or in container px, into a placement's world: the axis affine, then container → world.
 * Zoom and pan only change this transform.
 */
export function classTransform(
  x: Pick<AxisInfo, 'letter' | 'scale' | 'start'> | undefined,
  y: Pick<AxisInfo, 'letter' | 'scale' | 'start'> | undefined,
  world: DataTransform,
): DataTransform {
  const ax = x ? axisAffine(x) : { m: 1, b: 0 };
  const ay = y ? axisAffine(y) : { m: 1, b: 0 };
  return {
    scaleX: world.scaleX * ax.m,
    offsetX: world.scaleX * ax.b + world.offsetX,
    scaleY: world.scaleY * ay.m,
    offsetY: world.scaleY * ay.b + world.offsetY,
    scaleZ: 1,
    offsetZ: 0,
  };
}

/** The rect an item is clipped to: its data axes' spans, the whole figure elsewhere. */
export function clipRect(
  clipX: Pick<AxisInfo, 'start' | 'end'> | undefined,
  clipY: Pick<AxisInfo, 'start' | 'end'> | undefined,
  width: number,
  height: number,
): ViewportRect {
  const [x0, x1] = clipX
    ? [Math.min(clipX.start, clipX.end), Math.max(clipX.start, clipX.end)]
    : [0, width];
  const [y0, y1] = clipY
    ? [Math.min(clipY.start, clipY.end), Math.max(clipY.start, clipY.end)]
    : [0, height];
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** Whether `inner` lies inside `outer` (0.5 px slack). */
function inside(inner: ViewportRect, outer: ViewportRect): boolean {
  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5
  );
}

/**
 * Resolves placements and owns the extra viewports of one component view. Call {@link begin}
 * before placing a frame's items and {@link end} after, which removes viewports nothing used.
 */
export class LayerHost {
  readonly #kind: LayerKind;
  readonly #viewports = new Map<string, Viewport>();
  #used = new Set<string>();
  #ctx: ComponentDrawContext;

  constructor(ctx: ComponentDrawContext, kind: LayerKind) {
    this.#ctx = ctx;
    this.#kind = kind;
  }

  begin(ctx: ComponentDrawContext): void {
    this.#ctx = ctx;
    this.#used = new Set();
  }

  /** Every placement an item is drawn with (several for the lower layer). */
  place(req: LayerRequest): LayerPlacement[] {
    const ctx = this.#ctx;
    const orders = SUBPLOT_ORDER[this.#kind];
    const inSubplot = (sp: SubplotInfo, order: number): LayerPlacement => ({
      key: `${sp.viewport.id}:${order}`,
      viewport: sp.viewport,
      world: rectTransform(sp.rect),
      order,
    });
    const clip = clipRect(req.clipX, req.clipY, ctx.width, ctx.height);
    if (req.stack === 'upper') {
      const vp = this.#extra(VIEWPORT_ORDER[this.#kind].upper, req, clip);
      return vp ? [vp] : [];
    }
    if (req.stack !== 'lower' && req.subplot) {
      const order = req.stack === 'below' ? orders.below : orders.between;
      return [inSubplot(req.subplot, order)];
    }
    const out: LayerPlacement[] = [];
    const under = this.#extra(VIEWPORT_ORDER[this.#kind].lower, req, clip);
    if (under) out.push(under);
    const seen = new Set<string>();
    for (const sp of ctx.subplots.values()) {
      const r = sp.rect;
      const key = `${r.x},${r.y},${r.width},${r.height}`;
      // Overlaying subplots share a rect: draw once, into the first (lowest) one.
      if (seen.has(key)) continue;
      seen.add(key);
      if (inside(r, clip)) out.push(inSubplot(sp, orders.lower));
    }
    return out;
  }

  /** An extra viewport (created on first use) at `order`, clipped to `clip`. */
  #extra(order: number, req: LayerRequest, clip: ViewportRect): LayerPlacement | undefined {
    const key = `${order}|${req.clipX?.id ?? ''}|${req.clipY?.id ?? ''}`;
    let vp = this.#viewports.get(key);
    if (!vp || vp.disposed) {
      const root = rootOf(this.#ctx);
      if (!root) {
        // No chart (hand-built contexts in tests): draw into the overlay, unclipped.
        const ov = this.#ctx.overlay;
        return { key: `${ov.id}:${order}`, viewport: ov, world: rectTransform(ov.rect), order };
      }
      vp = root.addViewport({ kind: '2d', rect: clip, clip: true, order, name: `layer-${key}` });
      this.#viewports.set(key, vp);
    } else vp.setRect(clip);
    this.#used.add(key);
    return { key: `${vp.id}:0`, viewport: vp, world: rectTransform(clip), order: 0 };
  }

  /** Remove the extra viewports this frame did not use. */
  end(): void {
    for (const [key, vp] of this.#viewports) {
      if (this.#used.has(key)) continue;
      this.#viewports.delete(key);
      rootOf(this.#ctx)?.removeViewport(vp);
    }
  }

  /** Remove every extra viewport (call after removing the primitives drawn into them). */
  dispose(): void {
    this.#used = new Set();
    this.end();
  }
}

type Root = ReturnType<typeof rootOfChart>;

function rootOfChart(ctx: ComponentDrawContext) {
  return findChart(ctx)?.three.root;
}

/** The chart's render root, if the chart is alive. */
function rootOf(ctx: ComponentDrawContext): Root | undefined {
  try {
    return rootOfChart(ctx);
  } catch {
    return undefined;
  }
}
