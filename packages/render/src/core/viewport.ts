/**
 * Viewports & cameras (plan E2.3, ADR-004, ADR-008).
 *
 * A figure renders every subplot into one canvas. Each {@link Viewport} owns a `Scene` and a camera
 * and draws into a rectangle of the canvas:
 *
 * - `rect` is given by layout in **CSS px, top-left origin** of the render root's container.
 * - 2D viewports use an `OrthographicCamera` where 1 world unit = 1 CSS px, origin at the rect's
 *   **bottom-left**, +y up (ADR-008).
 * - 3D viewports use a `PerspectiveCamera` (default) or an `OrthographicCamera`; the render root
 *   only maintains the aspect ratio — scene layers own position/orientation.
 *
 * Clipping (`cliponaxis`): GL clips geometry to the GL viewport, so a 2D viewport whose content may
 * overflow its rect (`clip: false`, or a custom clip rect) renders into the *whole canvas* while its
 * camera still puts world (0, 0) at the rect's bottom-left. The scissor rect then decides what is
 * visible. Primitives receive the render-area size through `setViewport`, which is what their
 * screen-space sizing math needs.
 */
import { OrthographicCamera, PerspectiveCamera, Scene, type Material, type Object3D } from 'three';
import type { Primitive, RGBA, ViewportSize } from '../types.ts';

/** Rectangle in CSS px. Top-left origin unless stated otherwise. */
export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ViewportKind = '2d' | '3d';

export interface ViewportOptions {
  /** Default `'2d'`. */
  kind?: ViewportKind;
  /** Rect in CSS px (top-left origin of the container). Required unless `fit` is true. */
  rect?: ViewportRect;
  /** Track the full canvas size (used by the overlay viewport). */
  fit?: boolean;
  /**
   * Clipping. `true` (default): content is clipped to `rect`. `false`: no clipping (content may
   * draw anywhere on the canvas, e.g. `cliponaxis: false`). A rect: clip to that rect (container
   * coordinates, top-left origin) instead of `rect`.
   */
  clip?: boolean | ViewportRect;
  /** Background fill for `rect` (sRGB 0–1). Omit/null to draw over what is below. */
  background?: RGBA | null;
  /** Clear depth before drawing. Defaults to true for 3D viewports, false for 2D. */
  clearDepth?: boolean;
  /** Draw order; lower draws first. Ties keep insertion order. Default 0. */
  order?: number;
  /** 3D only. Default `'perspective'`. */
  projection?: 'perspective' | 'orthographic';
  /** 3D perspective vertical field of view in degrees. Default 45. */
  fov?: number;
  /** 3D orthographic: half of the visible height in world units. Default 1. */
  orthoHalfHeight?: number;
  /** Camera near/far. Defaults: 2D ±10000, 3D 0.01..1000. */
  near?: number;
  far?: number;
  /** Debug label. */
  name?: string;
}

/** Hooks a viewport needs from its render root. */
export interface ViewportHost {
  invalidate(): void;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly pixelRatio: number;
}

/** Convert a top-left-origin rect to GL's bottom-left origin (still CSS px). */
export function toGLRect(
  rect: Readonly<ViewportRect>,
  canvasHeight: number,
  out: ViewportRect = { x: 0, y: 0, width: 0, height: 0 },
): ViewportRect {
  out.x = rect.x;
  out.y = canvasHeight - rect.y - rect.height;
  out.width = rect.width;
  out.height = rect.height;
  return out;
}

/** Intersection of two rects (empty rects have zero width/height, never negative). */
export function intersectRect(
  a: Readonly<ViewportRect>,
  b: Readonly<ViewportRect>,
  out: ViewportRect = { x: 0, y: 0, width: 0, height: 0 },
): ViewportRect {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  out.x = x0;
  out.y = y0;
  out.width = Math.max(0, x1 - x0);
  out.height = Math.max(0, y1 - y0);
  return out;
}

/**
 * Orthographic frustum for a 2D viewport whose world origin is the bottom-left of `rect` (1 unit =
 * 1 CSS px) while GL draws into `area` (both top-left-origin container rects).
 */
export function orthoFrustum(
  rect: Readonly<ViewportRect>,
  area: Readonly<ViewportRect>,
): { left: number; right: number; top: number; bottom: number } {
  const rectBottom = rect.y + rect.height;
  return {
    left: area.x - rect.x,
    right: area.x + area.width - rect.x,
    top: rectBottom - area.y,
    bottom: rectBottom - (area.y + area.height),
  };
}

/**
 * The rect GL renders into for a viewport: its own rect for clipped 2D and all 3D viewports, the
 * whole canvas for 2D viewports that may overflow their rect.
 */
export function renderAreaFor(
  kind: ViewportKind,
  rect: Readonly<ViewportRect>,
  clip: boolean | Readonly<ViewportRect>,
  canvasWidth: number,
  canvasHeight: number,
): ViewportRect {
  if (kind === '3d' || clip === true) return { ...rect };
  return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
}

/** The scissor rect (top-left origin), or null when the viewport is not clipped. */
export function scissorFor(
  rect: Readonly<ViewportRect>,
  clip: boolean | Readonly<ViewportRect>,
): ViewportRect | null {
  if (clip === false) return null;
  if (clip === true) return { ...rect };
  return { ...clip };
}

let nextViewportId = 1;

/** A scissored region of the canvas with its own scene and camera. Create via the render root. */
export class Viewport {
  readonly id = nextViewportId++;
  readonly kind: ViewportKind;
  readonly name: string;
  readonly scene = new Scene();
  readonly camera: OrthographicCamera | PerspectiveCamera;
  readonly fit: boolean;
  /** Size handed to primitives (render-area size in CSS px + DPR). Mutated in place. */
  readonly size: ViewportSize = { width: 1, height: 1, pixelRatio: 1 };
  /** Draw only when true. */
  visible = true;
  background: RGBA | null;
  clearDepth: boolean;

  readonly #host: ViewportHost;
  readonly #primitives = new Set<Primitive<unknown>>();
  readonly #rect: ViewportRect;
  #clip: boolean | ViewportRect;
  #order: number;
  #area: ViewportRect = { x: 0, y: 0, width: 1, height: 1 };
  #scissor: ViewportRect | null = null;
  #orthoHalfHeight: number;
  #disposed = false;
  /** Set by the root so it can re-sort when `order` changes. */
  onOrderChange: (() => void) | null = null;

  constructor(host: ViewportHost, options: ViewportOptions = {}) {
    this.#host = host;
    this.kind = options.kind ?? '2d';
    this.name = options.name ?? `viewport-${this.id}`;
    this.fit = options.fit ?? false;
    this.#rect = options.rect
      ? { ...options.rect }
      : { x: 0, y: 0, width: host.canvasWidth, height: host.canvasHeight };
    this.#clip = normalizeClip(options.clip);
    this.#order = options.order ?? 0;
    this.background = options.background ?? null;
    this.clearDepth = options.clearDepth ?? this.kind === '3d';
    this.#orthoHalfHeight = options.orthoHalfHeight ?? 1;

    if (this.kind === '2d') {
      this.camera = new OrthographicCamera(
        0,
        1,
        1,
        0,
        options.near ?? -10000,
        options.far ?? 10000,
      );
    } else if (options.projection === 'orthographic') {
      this.camera = new OrthographicCamera(-1, 1, 1, -1, options.near ?? 0.01, options.far ?? 1000);
    } else {
      this.camera = new PerspectiveCamera(
        options.fov ?? 45,
        1,
        options.near ?? 0.01,
        options.far ?? 1000,
      );
    }
    this.layout();
  }

  /** Rect in CSS px, top-left origin of the container. Treat as read-only; use {@link setRect}. */
  get rect(): Readonly<ViewportRect> {
    return this.#rect;
  }

  /** Rect GL renders into (top-left origin). */
  get renderArea(): Readonly<ViewportRect> {
    return this.#area;
  }

  /** Scissor rect (top-left origin), or null when unclipped. */
  get scissor(): Readonly<ViewportRect> | null {
    return this.#scissor;
  }

  get clip(): boolean | Readonly<ViewportRect> {
    return this.#clip;
  }

  get order(): number {
    return this.#order;
  }

  set order(value: number) {
    if (value === this.#order) return;
    this.#order = value;
    this.onOrderChange?.();
    this.#host.invalidate();
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  /** Registered primitives (read-only view). */
  get primitives(): ReadonlySet<Primitive<unknown>> {
    return this.#primitives;
  }

  setRect(rect: Readonly<ViewportRect>): void {
    const r = this.#rect;
    if (r.x === rect.x && r.y === rect.y && r.width === rect.width && r.height === rect.height) {
      return;
    }
    r.x = rect.x;
    r.y = rect.y;
    r.width = rect.width;
    r.height = rect.height;
    this.layout();
  }

  setClip(clip: boolean | ViewportRect): void {
    this.#clip = normalizeClip(clip);
    this.layout();
  }

  /** Set the orthographic half-height of a 3D orthographic viewport (zoom). */
  setOrthoHalfHeight(halfHeight: number): void {
    this.#orthoHalfHeight = halfHeight;
    this.layout();
  }

  /** Add a primitive: its object joins the scene and its viewport uniforms are kept in sync. */
  add<T>(primitive: Primitive<T>): Primitive<T> {
    const p = primitive as Primitive<unknown>;
    if (!this.#primitives.has(p)) {
      this.#primitives.add(p);
      this.scene.add(p.object);
      p.setViewport(this.size);
      this.#host.invalidate();
    }
    return primitive;
  }

  /** Remove a primitive from this viewport, optionally disposing it. */
  remove<T>(primitive: Primitive<T>, options: { dispose?: boolean } = {}): void {
    const p = primitive as Primitive<unknown>;
    if (!this.#primitives.delete(p)) return;
    this.scene.remove(p.object);
    if (options.dispose) p.dispose();
    this.#host.invalidate();
  }

  /**
   * Convert container CSS px (top-left origin, e.g. from a pointer event) to 2D world coordinates
   * (bottom-left origin of this viewport's rect).
   */
  toWorld(
    px: number,
    py: number,
    out: { x: number; y: number } = { x: 0, y: 0 },
  ): { x: number; y: number } {
    out.x = px - this.#rect.x;
    out.y = this.#rect.y + this.#rect.height - py;
    return out;
  }

  /** Whether a container-space point lies inside the rect. */
  contains(px: number, py: number): boolean {
    const r = this.#rect;
    return px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height;
  }

  /**
   * Recompute render area, scissor, camera, and primitive viewport uniforms. Called by the root on
   * canvas resize / DPR change and by {@link setRect}.
   */
  layout(): void {
    const host = this.#host;
    if (this.fit) {
      this.#rect.x = 0;
      this.#rect.y = 0;
      this.#rect.width = host.canvasWidth;
      this.#rect.height = host.canvasHeight;
    }
    this.#area = renderAreaFor(
      this.kind,
      this.#rect,
      this.#clip,
      host.canvasWidth,
      host.canvasHeight,
    );
    this.#scissor = scissorFor(this.#rect, this.#clip);

    const width = Math.max(1, this.#area.width);
    const height = Math.max(1, this.#area.height);
    const camera = this.camera;
    if (this.kind === '2d') {
      const f = orthoFrustum(this.#rect, this.#area);
      const c = camera as OrthographicCamera;
      c.left = f.left;
      c.right = f.right;
      c.top = f.top;
      c.bottom = f.bottom;
      c.updateProjectionMatrix();
    } else if ((camera as PerspectiveCamera).isPerspectiveCamera) {
      const c = camera as PerspectiveCamera;
      c.aspect = width / height;
      c.updateProjectionMatrix();
    } else {
      const c = camera as OrthographicCamera;
      const h = this.#orthoHalfHeight;
      const aspect = width / height;
      c.left = -h * aspect;
      c.right = h * aspect;
      c.top = h;
      c.bottom = -h;
      c.updateProjectionMatrix();
    }

    const size = this.size;
    const changed =
      size.width !== width || size.height !== height || size.pixelRatio !== host.pixelRatio;
    size.width = width;
    size.height = height;
    size.pixelRatio = host.pixelRatio;
    if (changed) for (const p of this.#primitives) p.setViewport(size);
    host.invalidate();
  }

  /**
   * Dispose registered primitives, then any geometry/material still attached to the scene (objects
   * added directly via scene access). Textures are owned by the resource manager or by the caller.
   */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const p of this.#primitives) {
      this.scene.remove(p.object);
      p.dispose();
    }
    this.#primitives.clear();
    this.scene.traverse(disposeObject);
    this.scene.clear();
    this.onOrderChange = null;
  }
}

function normalizeClip(clip: boolean | ViewportRect | undefined): boolean | ViewportRect {
  if (clip === undefined || clip === true) return true;
  if (clip === false) return false;
  return { ...clip };
}

function disposeObject(object: Object3D): void {
  const o = object as Object3D & {
    geometry?: { dispose(): void };
    material?: Material | Material[];
  };
  o.geometry?.dispose();
  const m = o.material;
  if (Array.isArray(m)) for (const x of m) x.dispose();
  else m?.dispose();
}
