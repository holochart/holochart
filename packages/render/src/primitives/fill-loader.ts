/**
 * Lazy loading of the fill primitive (plan E21.6), like the SDF text engine (`text-engine.ts`).
 *
 * The fill primitive, earcut and the exact fill-rule code (`fill-arrangement.ts`) are about 8 kB
 * (min + gzip) that a chart without fills never runs. Charts draw fills through
 * {@link LazyFillPrimitive}, which fetches that code with a dynamic `import()` (of `fill-lazy.ts`)
 * the first time a fill is created and draws it once it has arrived; every fill created after that
 * is drawn at once. Bundlers that split code emit it as its own chunk; single-file builds (the
 * IIFE) inline it, and the import resolves on the next microtask.
 *
 * `ready` covers the load, so `chart.ready`, update promises and image export wait for the fill
 * like they wait for SDF text. `FillPrimitive` / `createFillPrimitive` stay public, synchronous
 * exports for code that wants them.
 */
import { Mesh } from 'three';
import type { DataTransform, Primitive, PrimitiveContext, ViewportSize } from '../types.ts';
import type { FillData, FillPrimitive } from './fill.ts';

/** The lazily loaded fill module (`fill-lazy.ts`). */
type FillModule = typeof import('./fill-lazy.ts');

let fillModule: FillModule | null = null;
let loading: Promise<FillModule> | null = null;

/** Load the fill code once (concurrent callers share the request; a failed load is retried). */
function loadFillModule(): Promise<FillModule> {
  if (fillModule) return Promise.resolve(fillModule);
  loading ??= import('./fill-lazy.ts').then(
    (mod) => (fillModule = mod),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** Whether the fill code has loaded (for tests and diagnostics). */
export function fillPrimitiveLoaded(): boolean {
  return fillModule !== null;
}

/**
 * Start fetching the fill code without drawing anything, e.g. in parallel with loading data, so
 * the first fill appears without the extra round trip. {@link LazyFillPrimitive} loads it on its
 * own; charts without fills never load it.
 */
export function preloadFillPrimitive(): Promise<void> {
  return loadFillModule().then(() => undefined);
}

let errorReported = false;

/** Report a failed load once (e.g. the lazy chunk could not be fetched). */
function reportLoadError(error: unknown): void {
  if (errorReported) return;
  errorReported = true;
  console.error('[holochart] could not load the fill primitive:', error);
}

const RESOLVED: Promise<void> = Promise.resolve();

/**
 * A {@link FillPrimitive} whose code loads on first use: the same data, updates and transform, and
 * the same drawing once loaded. Until then it keeps the latest data, transform and viewport size
 * and draws nothing; {@link ready} resolves once the fill is drawn (at once when the code has
 * already loaded). A failed load resolves `ready` too (the fill stays undrawn) and is retried by
 * the next {@link update}.
 *
 * {@link object} is the fill's mesh from the start: a hidden placeholder that the fill primitive
 * draws into once loaded, so callers can set its `renderOrder` (or hold it) at any time.
 */
export class LazyFillPrimitive implements Primitive<FillData> {
  readonly object: Mesh;
  readonly #context: PrimitiveContext;
  /** The data until the fill primitive exists (it then owns it). */
  #data: FillData | null;
  #transform: DataTransform | undefined;
  #viewport: ViewportSize | undefined;
  #fill: FillPrimitive | null = null;
  #pending: Promise<void> = RESOLVED;
  #loading = false;
  #disposed = false;

  constructor(context: PrimitiveContext, data: FillData) {
    this.#context = context;
    this.#data = { ...data };
    // Hidden (never drawn, so its default geometry and material never reach the GPU) until the
    // fill primitive takes it over.
    this.object = new Mesh();
    this.object.visible = false;
    if (fillModule) this.#attach(fillModule);
    else this.#load();
  }

  /** Resolves once the fill is drawn: its code has loaded (or failed to) and it holds the data. */
  get ready(): Promise<void> {
    return this.#pending;
  }

  /** The underlying fill primitive, once the fill code has loaded (else `null`). */
  get fill(): FillPrimitive | null {
    return this.#fill;
  }

  update(patch: Partial<FillData>): void {
    if (this.#disposed) return;
    if (this.#fill) {
      this.#fill.update(patch);
      return;
    }
    this.#data = { ...(this.#data as FillData), ...patch };
    if (!this.#loading) this.#load();
  }

  setTransform(transform: DataTransform): void {
    if (this.#fill) this.#fill.setTransform(transform);
    else this.#transform = { ...transform };
  }

  setViewport(size: ViewportSize): void {
    if (this.#fill) this.#fill.setViewport(size);
    else this.#viewport = { ...size };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#fill?.dispose();
    this.#fill = null;
    this.object.removeFromParent();
    this.#data = null;
  }

  /** Load the fill code, then draw: `ready` covers both. */
  #load(): void {
    this.#loading = true;
    this.#pending = loadFillModule().then(
      (mod) => {
        this.#loading = false;
        if (this.#disposed) return;
        this.#attach(mod);
        this.#context.invalidate();
      },
      (error: unknown) => {
        this.#loading = false;
        reportLoadError(error);
      },
    );
  }

  /** Create the fill primitive with everything received so far. */
  #attach(mod: FillModule): void {
    const fill = mod.createFillPrimitive(this.#context, this.#data as FillData, this.object);
    if (this.#transform) fill.setTransform(this.#transform);
    if (this.#viewport) fill.setViewport(this.#viewport);
    this.#data = null;
    this.#transform = undefined;
    this.#viewport = undefined;
    this.object.visible = true;
    this.#fill = fill;
  }
}

/** Create a {@link LazyFillPrimitive}. */
export function createLazyFillPrimitive(
  context: PrimitiveContext,
  data: FillData,
): LazyFillPrimitive {
  return new LazyFillPrimitive(context, data);
}
