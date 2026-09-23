/**
 * Unified picking API (plan E2.13, ADR-010): `pick(x, y, { radius, mode }) → PickResult[]`.
 *
 * The {@link Picker} routes a container-space position to the topmost viewport under it, then:
 * - **2D viewports → CPU**: point sources (e.g. `MarkerSet`s via {@link markerPointSource}) are
 *   indexed with flatbush and queried in pixel space. Supports every mode, synchronously.
 * - **3D viewports → GPU**: a per-viewport {@link GpuPicker} renders ids around the cursor and reads
 *   them back asynchronously. Handles occlusion and screen-space marker sizes.
 */
import type { Object3D, WebGLRenderer } from 'three';
import type { Viewport } from '../core/viewport.ts';
import {
  isMarkerPositionsLike,
  isPointSource2D,
  markerPointSource,
  PointPicker2D,
  type MarkerPositionsLike,
  type PointSource2D,
} from './cpu-picking.ts';
import { GpuPicker, type GpuPickableOptions, type GpuPickView } from './gpu-picking.ts';
import {
  DEFAULT_PICK_RADIUS,
  type PickablePrimitive,
  type PickOptions,
  type PickResult,
} from './types.ts';

/** Which implementation answers picks in a viewport. */
export type PickRoute = 'cpu' | 'gpu';

/** ADR-010: CPU spatial indexes for 2D viewports, GPU ID picking for 3D viewports. */
export function pickRouteFor(viewport: Pick<Viewport, 'kind'>): PickRoute {
  return viewport.kind === '3d' ? 'gpu' : 'cpu';
}

/** What the picker needs from its render root (a `RenderRoot` satisfies it). */
export interface PickerHost {
  readonly renderer: WebGLRenderer;
  /** Topmost pickable viewport under a container-space CSS position. */
  viewportAt(x: number, y: number): Viewport | null;
}

/** The subset of {@link GpuPicker} the router uses (injectable for tests). */
export interface GpuPickerLike {
  register(target: Object3D | PickablePrimitive, options?: GpuPickableOptions): number;
  unregister(target: number | Object3D | PickablePrimitive): boolean;
  pick(request: {
    x: number;
    y: number;
    radius?: number;
    mode?: PickOptions['mode'];
  }): Promise<PickResult[]>;
  dispose(): void;
}

export interface PickerOptions {
  /** Factory for 3D viewports' GPU pickers. Default: `new GpuPicker(renderer, viewport)`. */
  createGpuPicker?: (renderer: WebGLRenderer, view: GpuPickView) => GpuPickerLike;
}

/**
 * Anything that can be made pickable:
 * - 2D: a {@link PointSource2D}, or a marker set (adapted with {@link markerPointSource}),
 * - 3D: a pickable primitive (marker set) or any `Object3D` (its meshes are picked).
 */
export type PickTarget = PointSource2D | MarkerPositionsLike | PickablePrimitive | Object3D;

/** Options for {@link Picker.add}. */
export type PickerAddOptions = GpuPickableOptions;

interface ViewportPickers {
  cpu: PointPicker2D | null;
  gpu: GpuPickerLike | null;
}

interface Handle {
  readonly id: number;
  readonly viewport: Viewport;
  readonly target: PickTarget;
  readonly route: PickRoute;
  /** The CPU point source actually registered (for marker sets: the adapter). */
  readonly source: PointSource2D | null;
}

/**
 * Routes picks to the CPU (2D) or GPU (3D) implementation per viewport. One per render root; see
 * {@link createPicker}.
 */
export class Picker {
  readonly host: PickerHost;
  readonly #createGpu: (renderer: WebGLRenderer, view: GpuPickView) => GpuPickerLike;
  readonly #viewports = new Map<Viewport, ViewportPickers>();
  readonly #handles = new Map<number, Handle>();
  readonly #world = { x: 0, y: 0 };
  #nextId = 1;
  #disposed = false;

  constructor(host: PickerHost, options: PickerOptions = {}) {
    this.host = host;
    this.#createGpu =
      options.createGpuPicker ?? ((renderer, view) => new GpuPicker(renderer, view));
  }

  /** Number of registrations across all viewports. */
  get size(): number {
    return this.#handles.size;
  }

  /**
   * Make `target` pickable in `viewport` and return a handle id for {@link remove}. The route is
   * chosen by viewport kind ({@link pickRouteFor}).
   *
   * @throws TypeError when the target does not fit the route (e.g. a plain `Object3D` in 2D).
   */
  add(viewport: Viewport, target: PickTarget, options: PickerAddOptions = {}): number {
    this.#assertAlive();
    const route = pickRouteFor(viewport);
    const pickers = this.#pickersFor(viewport);
    const existing = this.#find(viewport, target);
    let source: PointSource2D | null = existing?.source ?? null;
    if (route === 'cpu') {
      if (source) {
        // Re-adding: keep the same adapter, just update the trace index.
      } else if (isPointSource2D(target)) source = target;
      else if (isMarkerPositionsLike(target)) source = markerPointSource(target);
      else {
        throw new TypeError(
          '2D viewports pick through CPU point sources (ADR-010): pass a PointSource2D or a MarkerSet',
        );
      }
      pickers.cpu ??= new PointPicker2D();
      pickers.cpu.add(source, options.traceIndex ?? 0);
    } else {
      if (isPointSource2D(target)) {
        throw new TypeError('3D viewports pick on the GPU: pass a MarkerSet or an Object3D');
      }
      pickers.gpu ??= this.#createGpu(this.host.renderer, viewport);
      pickers.gpu.register(target as Object3D | PickablePrimitive, options);
    }
    if (existing) return existing.id;
    const handle: Handle = { id: this.#nextId++, viewport, target, route, source };
    this.#handles.set(handle.id, handle);
    return handle.id;
  }

  /** Remove a registration by handle id. Returns whether it existed. */
  remove(id: number): boolean {
    const handle = this.#handles.get(id);
    if (!handle) return false;
    this.#handles.delete(id);
    const pickers = this.#viewports.get(handle.viewport);
    if (!pickers) return true;
    if (handle.route === 'cpu') pickers.cpu?.remove(handle.source!);
    else pickers.gpu?.unregister(handle.target as Object3D | PickablePrimitive);
    return true;
  }

  /**
   * Pick at a container-space CSS position (e.g. `event.offsetX/Y` on the canvas), routed to the
   * topmost viewport there. Results are nearest first and carry `viewport`.
   */
  pick(x: number, y: number, options: PickOptions = {}): Promise<PickResult[]> {
    if (this.#disposed) return Promise.resolve([]);
    const viewport = this.host.viewportAt(x, y);
    if (!viewport) return Promise.resolve([]);
    return this.pickIn(viewport, x, y, options);
  }

  /** Pick in a specific viewport (container-space CSS position). */
  async pickIn(
    viewport: Viewport,
    x: number,
    y: number,
    options: PickOptions = {},
  ): Promise<PickResult[]> {
    const sync = this.pickInSync(viewport, x, y, options);
    if (sync) return sync;
    const gpu = this.#viewports.get(viewport)?.gpu;
    if (!gpu || this.#disposed) return [];
    const results = await gpu.pick({
      x,
      y,
      radius: options.radius ?? DEFAULT_PICK_RADIUS,
      mode: options.mode ?? 'closest',
    });
    for (const r of results) r.viewport = viewport;
    return results;
  }

  /**
   * Synchronous pick for CPU-routed (2D) viewports; returns null when the position routes to a 3D
   * viewport (use {@link pick}). Handy for hover handlers that must answer in the same event.
   */
  pickSync(x: number, y: number, options: PickOptions = {}): PickResult[] | null {
    if (this.#disposed) return [];
    const viewport = this.host.viewportAt(x, y);
    if (!viewport) return [];
    return this.pickInSync(viewport, x, y, options);
  }

  /** {@link pickSync} for a specific viewport. */
  pickInSync(
    viewport: Viewport,
    x: number,
    y: number,
    options: PickOptions = {},
  ): PickResult[] | null {
    if (pickRouteFor(viewport) === 'gpu') return null;
    const cpu = this.#viewports.get(viewport)?.cpu;
    if (!cpu || this.#disposed || viewport.disposed) return [];
    const w = viewport.toWorld(x, y, this.#world);
    const results = cpu.pick(
      w.x,
      w.y,
      options.radius ?? DEFAULT_PICK_RADIUS,
      options.mode ?? 'closest',
    );
    for (const r of results) r.viewport = viewport;
    return results;
  }

  /** The GPU picker serving a 3D viewport, if any pickable was added there. */
  gpuPickerFor(viewport: Viewport): GpuPickerLike | null {
    return this.#viewports.get(viewport)?.gpu ?? null;
  }

  /** Drop every registration and pick resource of one viewport (e.g. before removing it). */
  clearViewport(viewport: Viewport): void {
    const pickers = this.#viewports.get(viewport);
    if (!pickers) return;
    pickers.gpu?.dispose();
    pickers.cpu?.clear();
    this.#viewports.delete(viewport);
    for (const [id, handle] of this.#handles) {
      if (handle.viewport === viewport) this.#handles.delete(id);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const pickers of this.#viewports.values()) {
      pickers.gpu?.dispose();
      pickers.cpu?.clear();
    }
    this.#viewports.clear();
    this.#handles.clear();
  }

  #assertAlive(): void {
    if (this.#disposed) throw new Error('Picker has been disposed');
  }

  #find(viewport: Viewport, target: PickTarget): Handle | undefined {
    for (const handle of this.#handles.values()) {
      if (handle.viewport === viewport && handle.target === target) return handle;
    }
    return undefined;
  }

  #pickersFor(viewport: Viewport): ViewportPickers {
    let pickers = this.#viewports.get(viewport);
    if (!pickers) {
      pickers = { cpu: null, gpu: null };
      this.#viewports.set(viewport, pickers);
    }
    return pickers;
  }
}

/** Create the unified picker for a render root (plan E2.13). */
export function createPicker(host: PickerHost, options: PickerOptions = {}): Picker {
  return new Picker(host, options);
}
