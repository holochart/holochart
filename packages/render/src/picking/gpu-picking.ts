/**
 * GPU ID picking for 3D views (plan E2.13, ADR-010).
 *
 * CPU spatial indexes answer 2D hover; in 3D, points and meshes are projected through a
 * perspective camera and occlude each other, so the GPU answers "what is drawn here" directly:
 *
 * 1. **Registration.** Pickables are registered once: a {@link PickablePrimitive} (e.g. a
 *    `MarkerSet`, which brings its own pick shader: the same SDF code with a `PICKING` define), or
 *    any `Object3D`, whose meshes get a generic pick material. Non-pickable objects can be
 *    registered as `occludeOnly` so they still hide what is behind them.
 * 2. **Proxies.** The picker keeps a private scene of proxy meshes that SHARE the sources'
 *    geometry (and instance buffers) but use pick materials. Nothing on the user's objects is
 *    mutated, and nothing is uploaded twice. Proxies copy world matrices, render order, layers, and
 *    depth state from their sources on every pick, so depth testing and draw order (opaque first,
 *    then transparent by depth) match the visible frame.
 * 3. **Ids.** Each proxy gets a contiguous id range for this pick ({@link PickIdLayout}): one id per
 *    marker instance, per `InstancedMesh` instance, per vertex/triangle, or one per object. The
 *    shader writes `base + element` encoded as RGBA8 (`encodePickId`).
 * 4. **Window.** Only a `(2⌈r·dpr⌉ + 1)²` device-pixel window around the cursor is rendered, into a
 *    small render target, with the camera projection narrowed onto that window
 *    ({@link pickProjection}); GPU cost is proportional to the window, not the canvas. Screen-space
 *    sized primitives get the window's CSS size as their resolution, so markers keep their pixel
 *    size.
 * 5. **Readback.** `WebGLRenderer.readRenderTargetPixelsAsync` (PBO + fence) so hover never stalls
 *    the pipeline. Pixels are decoded, filtered by radius and the view's visible region, deduped
 *    per id (minimum distance), and sorted nearest first.
 *
 * Steady-state picks allocate no GPU resources and reuse the render target, pixel buffers, id
 * layouts, and window/camera scratch; only the returned result objects are new.
 *
 * Limitations (by design, documented for callers): skinned/morphed meshes pick in their rest
 * pose; materials that change the silhouette in the shader (alphaTest, alpha maps, displacement,
 * logarithmic depth) are picked by their geometry; `Points`/`Line` objects are not picked.
 */
import {
  Camera,
  Color,
  InstancedMesh,
  Mesh,
  NearestFilter,
  RGBAFormat,
  Scene,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import type { ViewportRect } from '../core/viewport.ts';
import { effectiveMeshElement, meshPickCount, MeshPickMaterial } from './mesh-pick-material.ts';
import { PickHitList, gatherPickHits } from './pick-hits.ts';
import { PickIdLayout, type PickIdRange } from './pick-id.ts';
import {
  computePickWindow,
  createPickWindow,
  pickProjection,
  type PickCanvas,
  type PickWindow,
} from './pick-window.ts';
import type {
  MeshPickElement,
  PickablePrimitive,
  PickElementKind,
  PickMaterialHandle,
  PickMode,
  PickRenderState,
  PickResult,
} from './types.ts';

/** A GPU pick query. */
export interface GpuPickRequest {
  /** CSS px from the canvas' left edge. */
  x: number;
  /** CSS px from the canvas' top edge. */
  y: number;
  /** Search radius in CSS px (default 0: the pixel under the cursor). */
  radius?: number;
  /** `'closest'` (default) returns at most one hit; `'all'` every hit. `x`/`y` act as `closest`. */
  mode?: PickMode;
}

/**
 * What the picker renders through: the view's camera and where on the canvas it draws. A
 * `Viewport` satisfies this structurally.
 */
export interface GpuPickView {
  readonly camera: Camera;
  /** Rect GL renders into (CSS px, top-left origin of the canvas). */
  readonly renderArea: Readonly<ViewportRect>;
  /** Visible (scissor) rect, or null when unclipped. */
  readonly scissor: Readonly<ViewportRect> | null;
  /** When set, only pickables attached to this scene are picked. */
  readonly scene?: Object3D;
}

/** Options for {@link GpuPicker.register}. */
export interface GpuPickableOptions {
  /** Reported as {@link PickResult.traceIndex}. Default 0. */
  traceIndex?: number;
  /**
   * Element ids for generic meshes (ignored for pickable primitives). Default: `'instance'` for
   * `InstancedMesh`, `'object'` otherwise.
   */
  element?: MeshPickElement;
  /** Draw depth only: hides pickables behind it but is never reported. Default false. */
  occludeOnly?: boolean;
}

interface Registration {
  readonly id: number;
  readonly target: Object3D | PickablePrimitive;
  readonly root: Object3D;
  readonly primitive: PickablePrimitive | null;
  traceIndex: number;
  element: MeshPickElement | null;
  occludeOnly: boolean;
  readonly proxies: PickProxy[];
  readonly bySource: Map<Mesh, PickProxy>;
  alive: boolean;
}

interface PickProxy {
  readonly reg: Registration;
  readonly source: Mesh;
  readonly mesh: Mesh;
  readonly handle: PickMaterialHandle;
  kind: PickElementKind;
  seen: boolean;
}

interface ReadSlot {
  pixels: Uint8Array;
  readonly layout: PickIdLayout<PickProxy>;
  readonly win: PickWindow;
  busy: boolean;
}

function isPickablePrimitive(value: unknown): value is PickablePrimitive {
  const v = value as Partial<PickablePrimitive> | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.createPickMaterial === 'function' &&
    typeof v.object === 'object'
  );
}

/** Whether `object` and all its ancestors are visible, and (if given) it hangs under `scene`. */
function isRendered(object: Object3D, scene: Object3D | undefined): boolean {
  let o: Object3D | null = object;
  let top: Object3D = object;
  while (o) {
    if (!o.visible) return false;
    top = o;
    o = o.parent;
  }
  return scene === undefined || top === scene;
}

/**
 * GPU ID picker for one 3D view (see the module docs for the design). Create one per viewport;
 * {@link Picker} does this automatically for 3D viewports.
 */
export class GpuPicker {
  readonly renderer: WebGLRenderer;
  readonly view: GpuPickView;

  readonly #registrations = new Map<number, Registration>();
  readonly #byTarget = new Map<Object3D | PickablePrimitive, Registration>();
  readonly #scene = new Scene();
  readonly #camera = new Camera();
  readonly #target: WebGLRenderTarget;
  readonly #slots: ReadSlot[] = [];
  readonly #hits = new PickHitList();
  readonly #range: PickIdRange<PickProxy> = { base: 0, size: 0, entry: null };
  readonly #state: PickRenderState = { base: 0, windowWidth: 1, windowHeight: 1, pixelRatio: 1 };
  readonly #canvas: PickCanvas = { width: 1, height: 1, pixelRatio: 1 };
  readonly #cssSize = new Vector2();
  readonly #savedClear = new Color();
  #syncReg: Registration | null = null;
  #syncSlot: ReadSlot | null = null;
  #nextId = 1;
  #disposed = false;

  constructor(renderer: WebGLRenderer, view: GpuPickView) {
    this.renderer = renderer;
    this.view = view;
    this.#scene.name = 'holochart:pick-scene';
    // Proxies carry world matrices copied from their sources; nothing to recompute.
    this.#scene.matrixWorldAutoUpdate = false;
    this.#scene.matrixAutoUpdate = false;
    this.#camera.matrixAutoUpdate = false;
    this.#camera.matrixWorldAutoUpdate = false;
    this.#target = new WebGLRenderTarget(1, 1, {
      format: RGBAFormat,
      type: UnsignedByteType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
    });
  }

  /** Number of registrations. */
  get size(): number {
    return this.#registrations.size;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  /** Whether `target` is registered. */
  has(target: Object3D | PickablePrimitive): boolean {
    return this.#byTarget.has(target);
  }

  /**
   * Make `target` pickable and return its registration id. Registering the same target again
   * updates its options and returns the same id.
   */
  register(target: Object3D | PickablePrimitive, options: GpuPickableOptions = {}): number {
    this.#assertAlive();
    const traceIndex = options.traceIndex ?? 0;
    if (!Number.isInteger(traceIndex)) {
      throw new RangeError(`traceIndex must be an integer: ${traceIndex}`);
    }
    const existing = this.#byTarget.get(target);
    if (existing) {
      existing.traceIndex = traceIndex;
      const occludeOnly = options.occludeOnly ?? false;
      const element = options.element ?? null;
      if (occludeOnly !== existing.occludeOnly || element !== existing.element) {
        // Materials depend on these; rebuild proxies lazily on the next pick.
        this.#dropProxies(existing);
        existing.occludeOnly = occludeOnly;
        existing.element = element;
      }
      return existing.id;
    }
    const primitive = isPickablePrimitive(target) ? target : null;
    const root = primitive ? primitive.object : (target as Object3D);
    if (!primitive && !(root as Partial<Object3D>).isObject3D) {
      throw new TypeError('register() expects an Object3D or a pickable primitive');
    }
    const reg: Registration = {
      id: this.#nextId++,
      target,
      root,
      primitive,
      traceIndex,
      element: options.element ?? null,
      occludeOnly: options.occludeOnly ?? false,
      proxies: [],
      bySource: new Map(),
      alive: true,
    };
    this.#registrations.set(reg.id, reg);
    this.#byTarget.set(target, reg);
    return reg.id;
  }

  /** Stop picking a target (by registration id or the registered object). Returns whether found. */
  unregister(target: number | Object3D | PickablePrimitive): boolean {
    const reg =
      typeof target === 'number' ? this.#registrations.get(target) : this.#byTarget.get(target);
    if (!reg) return false;
    reg.alive = false;
    this.#registrations.delete(reg.id);
    this.#byTarget.delete(reg.target);
    this.#dropProxies(reg);
    return true;
  }

  /**
   * Resolve the hits around a CSS position, nearest first. Resolves to `[]` when the position is
   * outside the view, nothing is registered, the context is lost, or the picker is disposed.
   * Several picks may be in flight; each has its own readback buffer.
   */
  async pick(request: GpuPickRequest): Promise<PickResult[]> {
    if (this.#disposed || this.#registrations.size === 0) return [];
    const renderer = this.renderer;
    const gl = renderer.getContext() as Partial<WebGL2RenderingContext>;
    if (typeof gl.isContextLost === 'function' && gl.isContextLost()) return [];

    const slot = this.#acquireSlot();
    try {
      const view = this.view;
      const canvas = this.#canvas;
      renderer.getSize(this.#cssSize);
      canvas.width = this.#cssSize.x;
      canvas.height = this.#cssSize.y;
      canvas.pixelRatio = renderer.getPixelRatio();
      const win = slot.win;
      const inside = computePickWindow(
        win,
        request.x,
        request.y,
        request.radius ?? 0,
        canvas,
        view.renderArea,
        view.scissor,
      );
      if (!inside) return [];

      if (!this.#syncProxies(slot)) return [];
      this.#syncCamera(win);
      const pending = this.#renderAndRead(slot);
      await pending;
      if (this.#disposed) return [];
      return this.#decode(slot, request.mode ?? 'closest');
    } catch {
      // Readback can fail when the context is lost mid-flight; treat as "no hit".
      return [];
    } finally {
      slot.layout.reset();
      slot.busy = false;
    }
  }

  /** Release GPU resources, pick materials, and all registrations. In-flight picks resolve `[]`. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const reg of this.#registrations.values()) {
      reg.alive = false;
      this.#dropProxies(reg);
    }
    this.#registrations.clear();
    this.#byTarget.clear();
    this.#target.dispose();
    this.#slots.length = 0;
  }

  // ---- internals -------------------------------------------------------------------------

  #assertAlive(): void {
    if (this.#disposed) throw new Error('GpuPicker has been disposed');
  }

  #acquireSlot(): ReadSlot {
    for (const slot of this.#slots) {
      if (!slot.busy) {
        slot.busy = true;
        return slot;
      }
    }
    const slot: ReadSlot = {
      pixels: new Uint8Array(4),
      layout: new PickIdLayout<PickProxy>(),
      win: createPickWindow(),
      busy: true,
    };
    this.#slots.push(slot);
    return slot;
  }

  /** Lay out ids and sync every proxy for this pick. Returns false when nothing would draw. */
  #syncProxies(slot: ReadSlot): boolean {
    const win = slot.win;
    const state = this.#state;
    state.windowWidth = win.windowWidth;
    state.windowHeight = win.windowHeight;
    state.pixelRatio = win.pixelRatio;
    slot.layout.reset();
    let drawn = 0;
    this.#syncSlot = slot;
    for (const reg of this.#registrations.values()) {
      for (const p of reg.proxies) {
        p.seen = false;
        p.mesh.visible = false;
      }
      if (!isRendered(reg.root, this.view.scene)) continue;
      reg.root.updateWorldMatrix(true, !reg.primitive);
      this.#syncReg = reg;
      if (reg.primitive) this.#syncMesh(reg.primitive.object);
      else reg.root.traverseVisible(this.#visit);
      this.#syncReg = null;
      this.#pruneProxies(reg);
      for (const p of reg.proxies) if (p.mesh.visible) drawn++;
    }
    this.#syncSlot = null;
    return drawn > 0 && slot.layout.total > 0;
  }

  readonly #visit = (object: Object3D): void => {
    if ((object as Partial<Mesh>).isMesh) this.#syncMesh(object as Mesh);
  };

  #syncMesh(source: Mesh): void {
    const reg = this.#syncReg!;
    const slot = this.#syncSlot!;
    const proxy = reg.bySource.get(source) ?? this.#createProxy(reg, source);
    proxy.seen = true;
    const mesh = proxy.mesh;
    let count: number;
    let kind: PickElementKind;
    if (reg.primitive) {
      count = reg.primitive.pickCount;
      kind = reg.primitive.pickKind;
    } else {
      const element = reg.element ?? (isInstanced(source) ? 'instance' : 'object');
      count = meshPickCount(source, element);
      kind = effectiveMeshElement(source, element);
    }
    if (reg.occludeOnly) count = 0;
    else if (count <= 0) return;

    mesh.geometry = source.geometry;
    mesh.matrixWorld.copy(source.matrixWorld);
    mesh.renderOrder = source.renderOrder;
    mesh.layers.mask = source.layers.mask;
    if (isInstanced(source)) {
      const im = mesh as InstancedMesh;
      im.instanceMatrix = source.instanceMatrix;
      im.count = source.count;
      // InstancedMesh culling would compute instance bounds on the proxy every pick.
      mesh.frustumCulled = false;
    } else {
      mesh.frustumCulled = source.frustumCulled;
    }
    proxy.kind = kind;
    this.#state.base = reg.occludeOnly ? 0 : slot.layout.allocate(proxy, count);
    proxy.handle.prepare(this.#state);
    mesh.visible = true;
  }

  #createProxy(reg: Registration, source: Mesh): PickProxy {
    const handle: PickMaterialHandle = reg.primitive
      ? reg.primitive.createPickMaterial()
      : new MeshPickMaterial(
          source,
          reg.element ?? (isInstanced(source) ? 'instance' : 'object'),
          reg.occludeOnly,
        );
    const mesh = isInstanced(source)
      ? new InstancedMesh(source.geometry, handle.material, 0)
      : new Mesh(source.geometry, handle.material);
    mesh.name = 'holochart:pick-proxy';
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.visible = false;
    this.#scene.add(mesh);
    const proxy: PickProxy = { reg, source, mesh, handle, kind: 'object', seen: false };
    reg.proxies.push(proxy);
    reg.bySource.set(source, proxy);
    return proxy;
  }

  /** Remove proxies whose source was not found this pick (detached or hidden meshes). */
  #pruneProxies(reg: Registration): void {
    const list = reg.proxies;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p.seen) list[w++] = p;
      else this.#disposeProxy(p);
    }
    list.length = w;
  }

  #dropProxies(reg: Registration): void {
    for (const p of reg.proxies) this.#disposeProxy(p);
    reg.proxies.length = 0;
  }

  #disposeProxy(p: PickProxy): void {
    p.reg.bySource.delete(p.source);
    // Never `mesh.dispose()`: an InstancedMesh proxy would free the SOURCE's instance buffer.
    this.#scene.remove(p.mesh);
    p.handle.dispose();
  }

  #syncCamera(win: PickWindow): void {
    const src = this.view.camera;
    src.updateMatrixWorld();
    const cam = this.#camera;
    cam.matrixWorld.copy(src.matrixWorld);
    cam.matrixWorldInverse.copy(src.matrixWorldInverse);
    pickProjection(cam.projectionMatrix, src.projectionMatrix, win);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.layers.mask = src.layers.mask;
    // The copied projection is already in the source's depth convention; stop three.js from
    // "fixing" it (it would call updateProjectionMatrix, which a base Camera does not have).
    (cam as unknown as { _reversedDepth: boolean })._reversedDepth = src.reversedDepth;
  }

  /** Render the window and start the async readback; restores all renderer state it touches. */
  #renderAndRead(slot: ReadSlot): Promise<unknown> {
    const renderer = this.renderer;
    const n = slot.win.size;
    const target = this.#target;
    if (target.width < n || target.height < n) {
      target.setSize(Math.max(n, target.width), Math.max(n, target.height));
    }
    const bytes = n * n * 4;
    if (slot.pixels.length < bytes) slot.pixels = new Uint8Array(bytes);
    target.viewport.set(0, 0, n, n);
    target.scissor.set(0, 0, n, n);
    target.scissorTest = true;

    const prevTarget = renderer.getRenderTarget();
    const prevFace = renderer.getActiveCubeFace();
    const prevLevel = renderer.getActiveMipmapLevel();
    const prevAutoClear = renderer.autoClear;
    renderer.getClearColor(this.#savedClear);
    const prevAlpha = renderer.getClearAlpha();
    // Keep the host's frame statistics about the visible frame only.
    const info = renderer.info.render;
    const { calls, triangles, points, lines, frame } = info;
    try {
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(this.#scene, this.#camera);
      // Issues readPixels into a PBO synchronously; only the wait for the fence is async.
      return renderer.readRenderTargetPixelsAsync(target, 0, 0, n, n, slot.pixels);
    } finally {
      renderer.setRenderTarget(prevTarget, prevFace, prevLevel);
      renderer.setClearColor(this.#savedClear, prevAlpha);
      renderer.autoClear = prevAutoClear;
      info.calls = calls;
      info.triangles = triangles;
      info.points = points;
      info.lines = lines;
      info.frame = frame;
    }
  }

  #decode(slot: ReadSlot, mode: PickMode): PickResult[] {
    const hits = gatherPickHits(slot.pixels, slot.win, this.#hits);
    const results: PickResult[] = [];
    const limit = mode === 'all' ? Infinity : 1;
    const range = this.#range;
    for (let i = 0; i < hits.count && results.length < limit; i++) {
      const id = hits.ids[i]!;
      if (!slot.layout.lookup(id, range)) continue;
      const proxy = range.entry;
      if (!proxy?.reg.alive) continue;
      results.push({
        traceIndex: proxy.reg.traceIndex,
        pointIndex: proxy.kind === 'object' ? -1 : id - range.base,
        distance: hits.distances[i]!,
        kind: proxy.kind,
        object: proxy.source,
      });
    }
    range.entry = null;
    return results;
  }
}

function isInstanced(mesh: Mesh): mesh is InstancedMesh {
  return (mesh as Partial<InstancedMesh>).isInstancedMesh === true;
}

/** Create a GPU picker for one 3D view (plan E2.13). See {@link GpuPicker}. */
export function createGpuPicker(renderer: WebGLRenderer, view: GpuPickView): GpuPicker {
  return new GpuPicker(renderer, view);
}
