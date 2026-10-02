/**
 * Shared renderer: one WebGL2 context that draws many figures (plan E2.16, ADR-023).
 *
 * Browsers keep only so many live WebGL contexts per page (about 16 on desktop, 8 on mobile) and
 * drop the oldest beyond that. A {@link SharedRenderer} owns one `WebGLRenderer` on a canvas that
 * is never attached to the document. Each render root that uses it draws its frame into the
 * bottom-left corner of that drawing buffer, then copies the pixels into its own 2D canvas. The
 * context count stays at one however many figures share it.
 *
 * The drawing buffer is as large as the largest figure that uses it (device px). All figures
 * anchor at GL's origin, so viewport, scissor and `gl_FragCoord` maths are the same as on a
 * dedicated canvas.
 */
import type { WebGLRenderer, WebGLRendererParameters } from 'three';

/**
 * How many roots get a context of their own under `shared: 'auto'` before later ones share.
 * Low enough to leave room under the mobile limit of 8 for the shared context, exports and other
 * WebGL content on the page.
 */
export const MAX_DEDICATED_CONTEXTS = 4;

export type RendererFactory = (parameters: WebGLRendererParameters) => WebGLRenderer;

/** What a shared renderer needs to know about a root that draws through it. */
export interface SharedClient {
  /** CSS size and pixel ratio of the root's canvas (read live). */
  readonly size: { readonly width: number; readonly height: number; readonly pixelRatio: number };
  contextLost(): void;
  contextRestored(): void;
}

let dedicated = 0;

/** Live roots that own a WebGL context (those created with holochart's default renderer). */
export function dedicatedContextCount(): number {
  return dedicated;
}

/** @internal */
export function trackDedicatedContext(delta: 1 | -1): void {
  dedicated = Math.max(0, dedicated + delta);
}

const presenting = new WeakMap<object, HTMLCanvasElement>();

/**
 * The on-page canvas a renderer is drawing for: the root's own canvas under a shared renderer,
 * `renderer.domElement` otherwise. Use it instead of `renderer.domElement` for anything that needs
 * the visible element (visibility observers, layout).
 */
export function presentedCanvas(renderer: Pick<WebGLRenderer, 'domElement'>): HTMLCanvasElement {
  return presenting.get(renderer) ?? renderer.domElement;
}

export class SharedRenderer {
  readonly renderer: WebGLRenderer;
  /** The renderer's own canvas; never in the document. */
  readonly canvas: HTMLCanvasElement;

  readonly #clients = new Set<SharedClient>();
  readonly #onEmpty: () => void;
  // Drawing-buffer size (device px) and pixel ratio last given to the renderer.
  #width = 0;
  #height = 0;
  #pixelRatio = 0;

  constructor(renderer: WebGLRenderer, onEmpty: () => void) {
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.#onEmpty = onEmpty;
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    this.canvas.addEventListener('webglcontextlost', this.#onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.#onContextRestored, false);
  }

  /** Number of roots drawing through this renderer. */
  get clients(): number {
    return this.#clients.size;
  }

  add(client: SharedClient): void {
    this.#clients.add(client);
  }

  /** Stop drawing for `client`. The context is released with the last one. */
  remove(client: SharedClient): void {
    if (!this.#clients.delete(client) || this.#clients.size > 0) return;
    this.#onEmpty();
    this.canvas.removeEventListener('webglcontextlost', this.#onContextLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this.#onContextRestored, false);
    const renderer = this.renderer;
    try {
      renderer.renderLists.dispose();
      renderer.dispose();
    } catch (error) {
      console.warn('[holochart] disposing GPU resources failed:', error);
    }
    try {
      renderer.forceContextLoss();
    } catch {
      // Extension unavailable; the context is released on GC.
    }
  }

  /**
   * Make the renderer draw for `client`: its pixel ratio, and a drawing buffer that fits every
   * client. Resizing the buffer clears it, which is harmless: every frame redraws its own region
   * and the figures keep their pixels in their own canvases.
   */
  begin(client: SharedClient, canvas: HTMLCanvasElement): void {
    presenting.set(this.renderer, canvas);
    const pixelRatio = client.size.pixelRatio;
    let width = 1;
    let height = 1;
    for (const c of this.#clients) {
      width = Math.max(width, Math.ceil(c.size.width * c.size.pixelRatio));
      height = Math.max(height, Math.ceil(c.size.height * c.size.pixelRatio));
    }
    if (width === this.#width && height === this.#height && pixelRatio === this.#pixelRatio) return;
    this.#width = width;
    this.#height = height;
    this.#pixelRatio = pixelRatio;
    // three floors `size * pixelRatio`; the half pixel keeps that at exactly `width` × `height`
    // for any ratio, so figures with different pixel ratios do not reallocate the buffer.
    this.renderer.setDrawingBufferSize(
      (width + 0.5) / pixelRatio,
      (height + 0.5) / pixelRatio,
      pixelRatio,
    );
  }

  /** Copy the frame just drawn for a figure into its canvas (`target` is that canvas' context). */
  present(target: CanvasRenderingContext2D): void {
    const { width, height } = target.canvas;
    if (width <= 0 || height <= 0) return;
    // Replace, not blend: the frame carries its own (premultiplied) alpha.
    target.globalCompositeOperation = 'copy';
    target.drawImage(this.canvas, 0, this.#height - height, width, height, 0, 0, width, height);
  }

  readonly #onContextLost = (): void => {
    for (const client of [...this.#clients]) client.contextLost();
  };

  readonly #onContextRestored = (): void => {
    for (const client of [...this.#clients]) client.contextRestored();
  };
}

// One shared renderer per factory and set of context attributes (a context cannot change them).
const pools = new WeakMap<RendererFactory, Map<string, SharedRenderer>>();

/**
 * The shared renderer for these context attributes, created on first use. It lives until its last
 * client is removed. Throws what the factory throws (no WebGL2).
 */
export function acquireSharedRenderer(
  parameters: WebGLRendererParameters,
  factory: RendererFactory,
): SharedRenderer {
  let pool = pools.get(factory);
  if (!pool) pools.set(factory, (pool = new Map()));
  const key = `${parameters.antialias ? 1 : 0}|${parameters.powerPreference ?? 'default'}`;
  let shared = pool.get(key);
  if (!shared) {
    const members = pool;
    shared = new SharedRenderer(factory(parameters), () => members.delete(key));
    pool.set(key, shared);
  }
  return shared;
}
