/**
 * Subplot mirrors (plan E5.9, M3 wave 2): a second view of one cartesian subplot's traces, drawn
 * into a viewport of its own with its own axis ranges — the range slider's thumbnail.
 *
 * A mirror is not a screenshot: every trace on the subplot gets a second {@link TraceView} from its
 * module's `plot.create`, fed the same calc, style and selection as the main view but a context
 * whose axes, transform and viewport are the mirror's. The runtime keeps the mirror views in step
 * with the main ones (a restyle restyles both, new data re-uploads both), while moving or
 * re-ranging a mirror is transform-only. Mirror views get no pointer events and no hover.
 *
 * Components ask for mirrors with `ComponentDrawContext.mirrorSubplot`; a mirror lives until its
 * `dispose()` or until the component that created it is disposed.
 */
import { createScale, type FullLayout, type FullTrace, type Scale } from '@mk7s/holochart-core';
import type {
  DataTransform,
  Primitive,
  RenderRoot,
  Viewport,
  ViewportRect,
} from '@mk7s/holochart-render';
import { dataTransform, sameTransform } from './axes.ts';
import type {
  AxisInfo,
  SubplotInfo,
  SubplotMirror,
  SubplotMirrorOptions,
  TraceModule,
  TracePlotContext,
  TraceUpdatePlan,
  TraceView,
} from './contracts.ts';

/** What a mirror needs from its chart. */
export interface MirrorHost {
  root(): RenderRoot;
  subplot(id: string): SubplotInfo | undefined;
  fullLayout(): FullLayout | undefined;
  fullData(): readonly FullTrace[];
  /** The trace's module and calc, when it has one (visible, calculated). */
  trace(index: number): { module: TraceModule | undefined; calc: unknown } | undefined;
  selection(index: number): readonly number[] | null;
  plotArea(): Readonly<ViewportRect>;
}

const TRANSFORM_ONLY: TraceUpdatePlan = { calc: false, plot: false, style: false, transform: true };
const EVERYTHING: TraceUpdatePlan = { calc: true, plot: true, style: true, transform: true };

/** Draw order of mirror viewports: after every subplot (orders are small), before the overlay. */
const MIRROR_ORDER = 1e6;

/** An axis of a mirror: the main axis' type, categories, breaks and attributes, its own range. */
class MirrorAxis implements AxisInfo {
  readonly id: string;
  readonly name: string;
  readonly letter: 'x' | 'y';
  source: AxisInfo;
  scale: Scale;
  #sourceScale: Scale;
  start = 0;
  end = 0;

  constructor(source: AxisInfo) {
    this.id = source.id;
    this.name = source.name;
    this.letter = source.letter;
    this.source = source;
    this.#sourceScale = source.scale;
    this.scale = cloneScale(source.scale);
  }

  get type() {
    return this.source.type;
  }

  get full() {
    return this.source.full;
  }

  /** Follow the main axis; returns whether the scale was rebuilt (new linear space). */
  follow(source: AxisInfo): boolean {
    this.source = source;
    if (source.scale === this.#sourceScale) return false;
    this.#sourceScale = source.scale;
    const [r0, r1] = this.scale.range;
    const length = this.scale.length;
    this.scale = cloneScale(source.scale);
    this.scale.setLength(length);
    this.scale.setRange(r0, r1);
    return true;
  }

  l2c(l: number): number {
    const p = this.scale.l2p(l);
    return this.letter === 'x' ? this.start + p : this.start - p;
  }
}

/** A scale with the same linear space as `scale` (type, categories, range breaks). */
function cloneScale(scale: Scale): Scale {
  return createScale({
    type: scale.type,
    range: scale.range,
    length: scale.length,
    ...(scale.categories.length > 0 ? { categories: scale.categories } : {}),
    ...(scale.multicategories.length > 0 ? { multicategories: scale.multicategories } : {}),
    ...(scale.breaks ? { breaks: scale.breaks } : {}),
  });
}

interface MirrorView {
  module: TraceModule;
  view: TraceView | undefined;
  primitives: Set<Primitive<unknown>>;
}

/** One mirror (the handle components get). */
class Mirror implements SubplotMirror {
  readonly subplot: string;
  readonly owner: object;
  readonly viewport: Viewport;
  readonly #host: MirrorHost;
  readonly #views = new Map<number, MirrorView>();
  #xaxis: MirrorAxis | undefined;
  #yaxis: MirrorAxis | undefined;
  #rect: ViewportRect;
  #x: readonly [number, number];
  #y: readonly [number, number];
  #transform: DataTransform | undefined;
  #disposed = false;
  readonly #onDispose: (m: Mirror) => void;

  constructor(
    host: MirrorHost,
    owner: object,
    subplot: string,
    options: SubplotMirrorOptions,
    onDispose: (m: Mirror) => void,
  ) {
    this.#host = host;
    this.owner = owner;
    this.subplot = subplot;
    this.#onDispose = onDispose;
    this.#rect = { ...options.rect };
    this.#x = [options.x[0], options.x[1]];
    this.#y = [options.y[0], options.y[1]];
    this.viewport = host.root().addViewport({
      kind: '2d',
      rect: this.#rect,
      clip: true,
      order: MIRROR_ORDER + (options.order ?? 0),
      name: `mirror-${subplot}`,
      background: options.background ?? null,
    });
    this.#place();
    this.sync(undefined);
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  get xaxis(): AxisInfo | undefined {
    return this.#xaxis;
  }

  get yaxis(): AxisInfo | undefined {
    return this.#yaxis;
  }

  get transform(): Readonly<DataTransform> | undefined {
    return this.#transform;
  }

  get rect(): Readonly<ViewportRect> {
    return this.#rect;
  }

  set(options: SubplotMirrorOptions): void {
    if (this.#disposed) return;
    this.#rect = { ...options.rect };
    this.#x = [options.x[0], options.x[1]];
    this.#y = [options.y[0], options.y[1]];
    this.viewport.setRect(this.#rect);
    this.viewport.background = options.background ?? null;
    if (options.order !== undefined) this.viewport.order = MIRROR_ORDER + options.order;
    const moved = this.#place();
    this.sync(undefined, moved);
    this.#host.root().invalidate();
  }

  /**
   * Put the mirror axes on the mirror's rect and ranges (following the main axes' scales);
   * returns whether the transform changed.
   */
  #place(): boolean {
    const sp = this.#host.subplot(this.subplot);
    if (!sp) return false;
    let rescaled = false;
    if (!this.#xaxis || !this.#yaxis) {
      this.#xaxis = new MirrorAxis(sp.xaxis);
      this.#yaxis = new MirrorAxis(sp.yaxis);
      rescaled = true;
    } else {
      rescaled = this.#xaxis.follow(sp.xaxis) || rescaled;
      rescaled = this.#yaxis.follow(sp.yaxis) || rescaled;
    }
    const r = this.#rect;
    const xa = this.#xaxis;
    const ya = this.#yaxis;
    xa.scale.setLength(Math.max(1, r.width));
    ya.scale.setLength(Math.max(1, r.height));
    xa.scale.setRange(this.#x[0], this.#x[1]);
    ya.scale.setRange(this.#y[0], this.#y[1]);
    xa.start = r.x;
    xa.end = r.x + r.width;
    ya.start = r.y + r.height;
    ya.end = r.y;
    const t = dataTransform(xa.scale, ya.scale);
    const changed = rescaled || !this.#transform || !sameTransform(this.#transform, t);
    this.#transform = t;
    if (rescaled) {
      // A new linear space: every view must re-read its (recalculated) data.
      for (const v of this.#views.values()) this.#disposeView(v);
      this.#views.clear();
    }
    return changed;
  }

  /**
   * Bring the mirror views up to date: create views for traces now on the subplot, drop the
   * others, and update the rest with the main views' plans (`plans[i]`, or nothing new when
   * `undefined`), plus a transform update when the mirror moved.
   */
  sync(plans: readonly (TraceUpdatePlan | undefined)[] | undefined, moved = false): void {
    if (this.#disposed) return;
    const sp = this.#host.subplot(this.subplot);
    const fullLayout = this.#host.fullLayout();
    if (!sp || !fullLayout) {
      for (const v of this.#views.values()) this.#disposeView(v);
      this.#views.clear();
      return;
    }
    if (plans !== undefined) moved = this.#place() || moved;
    const fullData = this.#host.fullData();
    const seen = new Set<number>();
    fullData.forEach((trace, index) => {
      const slot = this.#host.trace(index);
      const module = slot?.module;
      if (
        !slot ||
        !module?.plot ||
        trace.visible !== true ||
        `${String(trace['xaxis'])}${String(trace['yaxis'])}` !== this.subplot
      ) {
        return;
      }
      seen.add(index);
      let entry = this.#views.get(index);
      if (entry && entry.module !== module) {
        this.#disposeView(entry);
        entry = undefined;
      }
      if (!entry) {
        entry = { module, view: undefined, primitives: new Set() };
        this.#views.set(index, entry);
        entry.view = module.plot.create(this.#context(index, trace, slot.calc, entry, fullLayout));
        return;
      }
      const main = plans?.[index];
      // The main plan's `transform` is about the main axes: the mirror moves only by `set`.
      const plan: TraceUpdatePlan = main
        ? { ...main, transform: moved }
        : moved
          ? TRANSFORM_ONLY
          : { calc: false, plot: false, style: false, transform: false };
      if (!(plan.calc || plan.plot || plan.style || plan.transform || plan.selection === true)) {
        return;
      }
      entry.view?.update(this.#context(index, trace, slot.calc, entry, fullLayout), plan);
    });
    for (const [index, entry] of this.#views) {
      if (seen.has(index)) continue;
      this.#disposeView(entry);
      this.#views.delete(index);
    }
  }

  /** Recreate every view (traces were added, removed or reordered). */
  rebuild(): void {
    for (const v of this.#views.values()) this.#disposeView(v);
    this.#views.clear();
    this.sync(undefined);
  }

  /** A full redraw of the views that exist (after `rebuild` they are fresh anyway). */
  refresh(): void {
    const plans = this.#host.fullData().map(() => EVERYTHING);
    this.sync(plans, true);
  }

  #context(
    index: number,
    trace: FullTrace,
    calc: unknown,
    entry: MirrorView,
    fullLayout: FullLayout,
  ): TracePlotContext {
    const root = this.#host.root();
    const viewport = this.viewport;
    const xaxis = this.#xaxis as MirrorAxis;
    const yaxis = this.#yaxis as MirrorAxis;
    const transform = this.#transform as DataTransform;
    const subplot: SubplotInfo = {
      id: this.subplot,
      xaxis,
      yaxis,
      rect: this.#rect,
      viewport,
      transform,
    };
    return {
      trace,
      calc,
      index,
      fullLayout,
      subplot,
      xaxis,
      yaxis,
      transform,
      viewport,
      plotArea: this.#host.plotArea(),
      primitives: root.context,
      add: (primitive) => {
        viewport.add(primitive);
        entry.primitives.add(primitive as Primitive<unknown>);
        return primitive;
      },
      remove: (primitive) => {
        entry.primitives.delete(primitive as Primitive<unknown>);
        viewport.remove(primitive, { dispose: true });
      },
      invalidate: () => root.invalidate(),
      selectedPoints: this.#host.selection(index),
    };
  }

  #disposeView(entry: MirrorView): void {
    const view = entry.view;
    entry.view = undefined;
    try {
      view?.dispose?.();
    } finally {
      for (const p of entry.primitives) {
        if (!this.viewport.disposed) this.viewport.remove(p, { dispose: true });
      }
      entry.primitives.clear();
    }
  }

  /** Primitives of the mirror views (the chart waits for their text / fill loading). */
  *primitives(): IterableIterator<Primitive<unknown>> {
    for (const v of this.#views.values()) yield* v.primitives;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const v of this.#views.values()) this.#disposeView(v);
    this.#views.clear();
    const root = this.#host.root();
    root.removeViewport(this.viewport);
    this.#onDispose(this);
  }
}

/** Every mirror of a chart. */
export class SubplotMirrors {
  readonly #host: MirrorHost;
  readonly #mirrors = new Set<Mirror>();

  constructor(host: MirrorHost) {
    this.#host = host;
  }

  get size(): number {
    return this.#mirrors.size;
  }

  /** A new mirror of subplot `id` owned by `owner` (a component slot), or `undefined`. */
  create(owner: object, id: string, options: SubplotMirrorOptions): SubplotMirror | undefined {
    if (!this.#host.subplot(id)) return undefined;
    const mirror = new Mirror(this.#host, owner, id, options, (m) => this.#mirrors.delete(m));
    this.#mirrors.add(mirror);
    return mirror;
  }

  /**
   * After the main trace views were updated: the same plans for the mirror views (see
   * `Mirror.sync`); `structural` (traces added, removed or moved) recreates them.
   */
  sync(plans: readonly (TraceUpdatePlan | undefined)[], structural: boolean): void {
    for (const m of [...this.#mirrors]) {
      if (structural) m.rebuild();
      else m.sync(plans);
    }
  }

  /** Dispose the mirrors `owner` created. */
  disposeOwner(owner: object): void {
    for (const m of [...this.#mirrors]) if (m.owner === owner) m.dispose();
  }

  *primitives(): IterableIterator<Primitive<unknown>> {
    for (const m of this.#mirrors) yield* m.primitives();
  }

  clear(): void {
    for (const m of [...this.#mirrors]) m.dispose();
  }
}
