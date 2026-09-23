/**
 * Render root: one canvas + one WebGL2 context per figure (plan E2.1, ADR-004).
 *
 * Owns the `WebGLRenderer`, device-pixel-ratio handling, responsive resizing, the on-demand
 * {@link RenderLoop}, the shared {@link ResourceManager}, and the list of {@link Viewport}s drawn
 * each frame (scissored, in `order`, overlay last).
 *
 * ## Context loss
 * three.js re-initialises its GL state on `webglcontextrestored` and re-uploads buffers and textures
 * lazily from their CPU-side arrays, which every holochart primitive keeps. The root pauses the loop
 * while the context is lost and emits `contextlost` / `contextrestored` so higher layers can rebuild
 * anything they hold only on the GPU (e.g. render targets) before the next frame.
 */
import { Color, SRGBColorSpace, WebGLRenderer, type WebGLRendererParameters } from 'three';
import { createResourceManager } from '../resources.ts';
import type { PrimitiveContext, ResourceManager, RGBA, ViewportSize } from '../types.ts';
import { Emitter } from './emitter.ts';
import { RenderLoop, type FrameInfo, type FrameScheduler } from './loop.ts';
import {
  toGLRect,
  Viewport,
  type ViewportHost,
  type ViewportOptions,
  type ViewportRect,
} from './viewport.ts';

export interface RenderRootOptions {
  /** Device pixel ratio. Default `min(devicePixelRatio, 2)`, re-evaluated when the DPR changes. */
  pixelRatio?: number;
  /** Resize with the container via `ResizeObserver`. Default true. */
  responsive?: boolean;
  /** Fixed CSS size when not responsive (defaults to the container's size at creation). */
  width?: number;
  height?: number;
  /** Canvas clear color (sRGB 0–1). `null` = transparent. Default opaque white. */
  background?: RGBA | null;
  /** MSAA for geometry edges. Default true. */
  antialias?: boolean;
  /** Needed for `toDataURL` after the frame (export). Default false. */
  preserveDrawingBuffer?: boolean;
  powerPreference?: WebGLPowerPreference;
  /** Create the figure-level overlay viewport. Default true. */
  overlay?: boolean;
  /** Injectable frame scheduler (tests). Default: `requestAnimationFrame`. */
  scheduler?: FrameScheduler;
  /** Injectable renderer factory (tests, or custom renderer setup). */
  createRenderer?: (parameters: WebGLRendererParameters) => WebGLRenderer;
}

export interface RenderRootEvents {
  beforerender: FrameInfo;
  afterrender: FrameInfo;
  /** Canvas CSS size or pixel ratio changed. */
  resize: Readonly<ViewportSize>;
  contextlost: undefined;
  /** GL state is back; rebuild GPU-only resources here. A frame is scheduled afterwards. */
  contextrestored: undefined;
}

const DEFAULT_BACKGROUND: RGBA = [1, 1, 1, 1];

function defaultPixelRatio(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(dpr, 2);
}

export class RenderRoot implements ViewportHost {
  readonly container: HTMLElement;
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly resources: ResourceManager;
  /** Context handed to primitives. */
  readonly context: PrimitiveContext;
  readonly loop: RenderLoop;
  /** Figure-level overlay (paper-space components), drawn after every other viewport. */
  readonly overlay: Viewport | null;

  readonly #events = new Emitter<RenderRootEvents>();
  readonly #viewports: Viewport[] = [];
  readonly #size: ViewportSize = { width: 1, height: 1, pixelRatio: 1 };
  readonly #fixedPixelRatio: number | undefined;
  readonly #clear = new Color();
  readonly #vpColor = new Color();
  readonly #gl: ViewportRect = { x: 0, y: 0, width: 0, height: 0 };
  #background: RGBA | null;
  #observer: ResizeObserver | null = null;
  #dprQuery: MediaQueryList | null = null;
  #sortNeeded = false;
  #sized = false;
  #contextLost = false;
  #destroyed = false;

  constructor(container: HTMLElement, options: RenderRootOptions = {}) {
    this.container = container;
    this.#fixedPixelRatio = options.pixelRatio;
    this.#background = options.background === undefined ? DEFAULT_BACKGROUND : options.background;

    const parameters: WebGLRendererParameters = {
      antialias: options.antialias ?? true,
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      powerPreference: options.powerPreference ?? 'default',
    };
    this.renderer = options.createRenderer
      ? options.createRenderer(parameters)
      : new WebGLRenderer(parameters);
    this.canvas = this.renderer.domElement;
    // Viewports are cleared individually (scissored); `info` accumulates over the whole frame.
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.canvas.style.display = 'block';
    this.canvas.addEventListener('webglcontextlost', this.#onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.#onContextRestored, false);
    container.appendChild(this.canvas);

    this.resources = createResourceManager();
    this.loop = new RenderLoop(
      this.#render,
      options.scheduler ? { scheduler: options.scheduler } : {},
    );
    this.loop.on('beforerender', (info) => this.#events.emit('beforerender', info));
    this.loop.on('afterrender', (info) => this.#events.emit('afterrender', info));
    this.context = { resources: this.resources, invalidate: () => this.loop.invalidate() };

    this.#size.pixelRatio = this.#fixedPixelRatio ?? defaultPixelRatio();
    this.renderer.setPixelRatio(this.#size.pixelRatio);
    const responsive = options.responsive ?? true;
    this.resize(
      options.width ?? (container.clientWidth || 300),
      options.height ?? (container.clientHeight || 150),
    );

    this.overlay =
      options.overlay === false
        ? null
        : this.addViewport({ kind: '2d', fit: true, order: Infinity, name: 'overlay' });

    if (responsive && typeof ResizeObserver !== 'undefined') {
      this.#observer = new ResizeObserver(this.#onResize);
      this.#observer.observe(container);
    }
    if (this.#fixedPixelRatio === undefined) this.#watchPixelRatio();
  }

  // ---- ViewportHost -------------------------------------------------------------------------

  get canvasWidth(): number {
    return this.#size.width;
  }

  get canvasHeight(): number {
    return this.#size.height;
  }

  get pixelRatio(): number {
    return this.#size.pixelRatio;
  }

  // ---- public API -------------------------------------------------------------------------

  /** Canvas CSS size and pixel ratio (read-only, updated in place). */
  get size(): Readonly<ViewportSize> {
    return this.#size;
  }

  get viewports(): readonly Viewport[] {
    this.#sortViewports();
    return this.#viewports;
  }

  get contextLost(): boolean {
    return this.#contextLost;
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  /** Schedule a frame (coalesced). */
  invalidate(): void {
    this.loop.invalidate();
  }

  /** Enter continuous rendering until the returned function is called (ref-counted). */
  requestAnimation(): () => void {
    return this.loop.requestAnimation();
  }

  /** Render synchronously if a frame is pending. */
  flush(): void {
    this.loop.flush();
  }

  /** Render synchronously now, regardless of the dirty flag (e.g. for image export). */
  renderNow(): void {
    this.loop.invalidate();
    this.loop.flush();
  }

  on<K extends keyof RenderRootEvents>(
    type: K,
    listener: (payload: RenderRootEvents[K]) => void,
  ): () => void {
    return this.#events.on(type, listener);
  }

  setBackground(background: RGBA | null): void {
    this.#background = background;
    this.invalidate();
  }

  addViewport(options: ViewportOptions = {}): Viewport {
    this.#assertAlive();
    const viewport = new Viewport(this, options);
    viewport.onOrderChange = () => {
      this.#sortNeeded = true;
    };
    this.#viewports.push(viewport);
    this.#sortNeeded = true;
    this.invalidate();
    return viewport;
  }

  /** Remove a viewport. By default its primitives and scene contents are disposed. */
  removeViewport(viewport: Viewport, options: { dispose?: boolean } = {}): void {
    const i = this.#viewports.indexOf(viewport);
    if (i < 0) return;
    this.#viewports.splice(i, 1);
    if (options.dispose ?? true) viewport.dispose();
    viewport.onOrderChange = null;
    this.invalidate();
  }

  /** Topmost visible viewport under a container-space point (for hover routing). */
  viewportAt(px: number, py: number): Viewport | null {
    const list = this.viewports;
    for (let i = list.length - 1; i >= 0; i--) {
      const vp = list[i]!;
      if (vp !== this.overlay && vp.visible && vp.contains(px, py)) return vp;
    }
    return null;
  }

  /** Resize the canvas (CSS px). Called automatically when responsive. */
  resize(width: number, height: number): void {
    if (this.#destroyed) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.#sized && w === this.#size.width && h === this.#size.height) return;
    this.#sized = true;
    this.#size.width = w;
    this.#size.height = h;
    this.renderer.setSize(w, h, true);
    this.#relayout();
  }

  /** Override the pixel ratio (disables automatic DPR tracking only if passed at construction). */
  setPixelRatio(pixelRatio: number): void {
    if (this.#destroyed || pixelRatio === this.#size.pixelRatio) return;
    this.#size.pixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.#size.width, this.#size.height, true);
    this.#relayout();
  }

  /** Dispose every viewport, primitive, GPU resource, listener, and the context itself. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.loop.dispose();
    this.#observer?.disconnect();
    this.#observer = null;
    this.#dprQuery?.removeEventListener('change', this.#onPixelRatioChange);
    this.#dprQuery = null;
    this.canvas.removeEventListener('webglcontextlost', this.#onContextLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this.#onContextRestored, false);
    for (const vp of this.#viewports) vp.dispose();
    this.#viewports.length = 0;
    this.resources.disposeAll();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    // Free the context slot now instead of waiting for GC (browsers cap live contexts at ~16).
    try {
      this.renderer.forceContextLoss();
    } catch {
      // Extension unavailable; the context is released on GC.
    }
    this.canvas.remove();
    this.#events.clear();
  }

  // ---- internals -------------------------------------------------------------------------

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('RenderRoot has been destroyed');
  }

  #relayout(): void {
    for (const vp of this.#viewports) vp.layout();
    this.#events.emit('resize', this.#size);
    this.invalidate();
  }

  #sortViewports(): void {
    if (!this.#sortNeeded) return;
    this.#sortNeeded = false;
    // Array.prototype.sort is stable, so equal orders keep insertion order.
    this.#viewports.sort((a, b) => a.order - b.order);
  }

  readonly #render = (): void => {
    if (this.#contextLost || this.#destroyed) return;
    const renderer = this.renderer;
    const H = this.#size.height;
    renderer.info.reset();
    renderer.setRenderTarget(null);

    renderer.setScissorTest(false);
    const bg = this.#background;
    if (bg) renderer.setClearColor(this.#clear.setRGB(bg[0], bg[1], bg[2], SRGBColorSpace), bg[3]);
    else renderer.setClearColor(this.#clear.setRGB(0, 0, 0), 0);
    renderer.clear(true, true, true);

    this.#sortViewports();
    const gl = this.#gl;
    for (const vp of this.#viewports) {
      if (!vp.visible) continue;
      const area = vp.renderArea;
      if (area.width <= 0 || area.height <= 0) continue;

      if (vp.background || vp.clearDepth) {
        toGLRect(vp.rect, H, gl);
        renderer.setScissor(gl.x, gl.y, gl.width, gl.height);
        renderer.setScissorTest(true);
        const b = vp.background;
        if (b) renderer.setClearColor(this.#vpColor.setRGB(b[0], b[1], b[2], SRGBColorSpace), b[3]);
        renderer.clear(!!b, true, false);
      }

      // Nothing to draw (e.g. an unused overlay): skip the render call entirely.
      if (vp.scene.children.length === 0) continue;

      const scissor = vp.scissor;
      if (scissor) {
        toGLRect(scissor, H, gl);
        renderer.setScissor(gl.x, gl.y, gl.width, gl.height);
        renderer.setScissorTest(true);
      } else {
        renderer.setScissorTest(false);
      }
      toGLRect(area, H, gl);
      renderer.setViewport(gl.x, gl.y, gl.width, gl.height);
      renderer.render(vp.scene, vp.camera);
    }
    renderer.setScissorTest(false);
  };

  readonly #onResize = (entries: ResizeObserverEntry[]): void => {
    const entry = entries[entries.length - 1];
    if (!entry) return;
    const { width, height } = entry.contentRect;
    const before = this.loop.frameCount;
    this.resize(width, height);
    // Resizing clears the canvas; ResizeObserver runs before paint, so draw now to avoid a blank frame.
    if (this.loop.pending && before === this.loop.frameCount) this.loop.flush();
  };

  #watchPixelRatio(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    this.#dprQuery?.removeEventListener('change', this.#onPixelRatioChange);
    this.#dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.#dprQuery.addEventListener('change', this.#onPixelRatioChange);
  }

  readonly #onPixelRatioChange = (): void => {
    if (this.#destroyed) return;
    this.setPixelRatio(defaultPixelRatio());
    this.#watchPixelRatio();
  };

  readonly #onContextLost = (): void => {
    // three.js calls preventDefault() itself, which is what allows the context to be restored.
    this.#contextLost = true;
    this.loop.setPaused(true);
    this.#events.emit('contextlost', undefined);
  };

  readonly #onContextRestored = (): void => {
    this.#contextLost = false;
    this.#events.emit('contextrestored', undefined);
    this.loop.setPaused(false);
    this.invalidate();
  };
}

/** Create a render root inside `container` (plan E2.1). */
export function createRenderRoot(
  container: HTMLElement,
  options: RenderRootOptions = {},
): RenderRoot {
  return new RenderRoot(container, options);
}
