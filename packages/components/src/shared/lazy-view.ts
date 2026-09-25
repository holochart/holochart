/**
 * Component views whose code loads on first use (plan E21.6, like render's lazy fill primitive and
 * the SDF text engine).
 *
 * The update menus, sliders, range selector, range slider and selection outlines draw DOM controls
 * or outlines that most figures never show. Their schemas, defaults and margin pushes stay in the
 * package entry (validation, `supplyDefaults` and layout need them synchronously); only the code
 * that draws and handles events sits behind a dynamic `import()`, fetched the first time a figure
 * actually uses the component. Bundlers that split code emit it as its own chunk; single-file
 * builds (the IIFE) inline it, and the import resolves on the next microtask.
 *
 * ## Readiness
 *
 * Until the view code has arrived, the component holds a hidden placeholder primitive whose
 * `ready` promise covers the load and the creation of the real view. `chart.ready`, update
 * promises, image export and `componentsReady` wait for primitives' `ready` promises (the way they
 * wait for SDF text and layout images), so they resolve once the controls are drawn.
 *
 * ## Same result once loaded
 *
 * Once the code is loaded (by any chart), views are created synchronously, exactly as without lazy
 * loading. A view created after its load is created with the latest draw context, and the DOM it
 * mounts in `chart.element` is moved to where it would have been mounted synchronously (an anchor
 * left in the component's draw order), so the tab order of the chart's controls doesn't change.
 */
import type { Primitive } from '@mk7s/holochart-render';
import type {
  ComponentDrawContext,
  ComponentPointerEvent,
  ComponentRenderer,
  ComponentUpdatePlan,
  ComponentView,
  DrawGesture,
} from '@mk7s/holochart-runtime';
import { Object3D } from 'three';
import { findChart } from './host.ts';

/** Creates the real view (what the lazily loaded module provides). */
export type ComponentViewFactory = (ctx: ComponentDrawContext) => ComponentView;

/** What {@link lazyRenderer} needs to know about a component. */
export interface LazyViewOptions {
  /** Component name, for the error message of a failed load. */
  readonly name: string;
  /**
   * Whether the figure uses the component: only then is the view code fetched. Evaluated on every
   * draw until it returns `true` once; cheap checks on the defaulted layout (e.g. a non-empty
   * `layout.updatemenus`).
   */
  used(ctx: ComponentDrawContext): boolean;
  /** Fetch the view code: a dynamic `import()` of the module that draws. */
  load(): Promise<ComponentViewFactory>;
}

/** A {@link ComponentRenderer} whose view code loads on first use. */
export interface LazyComponentRenderer extends ComponentRenderer {
  /** Whether the view code has loaded (for tests and diagnostics). */
  readonly loaded: boolean;
  /**
   * Start fetching the view code without drawing anything (e.g. in parallel with loading data).
   * Views load it on their own when a figure uses the component.
   */
  preload(): Promise<void>;
}

/** Whether `value` is a non-empty array (e.g. `layout.updatemenus`). */
export function nonEmpty(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * A primitive that draws nothing and whose `ready` is a pending view load: the hook through which
 * chart readiness waits for the load (see the module comment).
 */
class PendingViewPrimitive implements Primitive<never> {
  readonly object = new Object3D();
  readonly ready: Promise<void>;
  constructor(ready: Promise<void>) {
    this.ready = ready;
    this.object.visible = false;
  }
  update(): void {}
  setTransform(): void {}
  setViewport(): void {}
  dispose(): void {}
}

/**
 * The draw renderer of a component whose view code loads on first use (see the module comment).
 *
 * @example
 * ```ts
 * draw: lazyRenderer({
 *   name: 'updatemenus',
 *   used: (ctx) => nonEmpty(ctx.fullLayout['updatemenus']),
 *   load: () => import('./view.ts').then((m) => (ctx) => m.createUpdatemenusView(…)),
 * }),
 * ```
 */
export function lazyRenderer(options: LazyViewOptions): LazyComponentRenderer {
  let factory: ComponentViewFactory | null = null;
  let loading: Promise<ComponentViewFactory> | null = null;
  let errorReported = false;

  /** Load once (concurrent callers share the request; a failed load is retried). */
  const load = (): Promise<ComponentViewFactory> => {
    if (factory) return Promise.resolve(factory);
    loading ??= options.load().then(
      (create) => (factory = create),
      (error: unknown) => {
        loading = null;
        if (!errorReported) {
          errorReported = true;
          console.error(`[holochart] could not load the ${options.name} component:`, error);
        }
        throw error;
      },
    );
    return loading;
  };

  return {
    get loaded() {
      return factory !== null;
    },
    preload: () => load().then(() => undefined),
    create: (ctx) => (factory ? factory(ctx) : new LazyView(ctx, options.used, load)),
  };
}

/**
 * Stands in for a component's view until its code has loaded, then forwards everything to the
 * real view.
 */
class LazyView implements ComponentView {
  #ctx: ComponentDrawContext;
  readonly #used: (ctx: ComponentDrawContext) => boolean;
  readonly #load: () => Promise<ComponentViewFactory>;
  #view: ComponentView | undefined;
  #pending: PendingViewPrimitive | undefined;
  /** Where the view's DOM would have been mounted, in the chart element. */
  #anchor: Comment | undefined;
  #disposed = false;

  constructor(
    ctx: ComponentDrawContext,
    used: (ctx: ComponentDrawContext) => boolean,
    load: () => Promise<ComponentViewFactory>,
  ) {
    this.#ctx = ctx;
    this.#used = used;
    this.#load = load;
    this.#start();
  }

  update(ctx: ComponentDrawContext, plan: ComponentUpdatePlan): void {
    if (this.#view) {
      this.#view.update(ctx, plan);
      return;
    }
    this.#ctx = ctx;
    this.#start();
  }

  handlePointer(event: ComponentPointerEvent): boolean | void {
    return this.#view?.handlePointer?.(event);
  }

  drawShape(gesture: DrawGesture): boolean | void {
    return this.#view?.drawShape?.(gesture);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#anchor?.remove();
    this.#anchor = undefined;
    this.#view?.dispose?.();
    this.#view = undefined;
    // The placeholder was added through the context: the runtime removes and disposes it.
    this.#pending = undefined;
  }

  /** Once the figure uses the component: fetch the code, then create the view. */
  #start(): void {
    if (this.#pending || this.#disposed || !this.#used(this.#ctx)) return;
    const element = findChart(this.#ctx)?.element;
    if (element && !this.#anchor) {
      this.#anchor = element.ownerDocument.createComment('holochart: loading component');
      element.appendChild(this.#anchor);
    }
    const ready: Promise<void> = this.#load().then(
      (create) => this.#attach(create, pending),
      () => {
        // Reported by the loader; the next draw retries.
        this.#release(pending);
      },
    );
    const pending: PendingViewPrimitive = new PendingViewPrimitive(ready);
    this.#pending = pending;
    // Hand-built test contexts may lack `add`.
    if (typeof this.#ctx.add === 'function') this.#ctx.add(pending);
  }

  /** Create the real view with the latest context, and mount its DOM at the anchor. */
  #attach(create: ComponentViewFactory, pending: PendingViewPrimitive): void {
    if (this.#disposed || this.#pending !== pending) return;
    const ctx = this.#ctx;
    const element = findChart(ctx)?.element;
    const before = element ? new Set(element.childNodes) : undefined;
    try {
      this.#view = create(ctx);
      const anchor = this.#anchor;
      if (element && before && anchor?.parentNode === element) {
        const mounted = [...element.childNodes].filter((n) => !before.has(n));
        if (mounted.length > 0) anchor.before(...mounted);
      }
    } catch (error) {
      // Like a view that throws while drawing: reported, and the chart keeps going without it.
      console.error('[holochart] a component view failed to draw:', error);
    } finally {
      this.#release(pending);
    }
    ctx.invalidate();
  }

  /** Drop the placeholder (and the anchor). */
  #release(pending: PendingViewPrimitive): void {
    if (this.#pending !== pending) return;
    this.#pending = undefined;
    this.#anchor?.remove();
    this.#anchor = undefined;
    if (!this.#disposed && typeof this.#ctx.remove === 'function') this.#ctx.remove(pending);
  }
}
