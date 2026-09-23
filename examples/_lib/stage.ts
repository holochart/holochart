import { Color, OrthographicCamera, Scene, WebGLRenderer } from 'three';
import {
  createResourceManager,
  type Primitive,
  type PrimitiveContext,
  type ViewportSize,
} from '@mk7s/holochart-render';

/**
 * Minimal 2D pixel-space stage for primitive demos, used until the chart runtime exists.
 * World units are CSS pixels, origin bottom-left, +y up (ADR-008).
 */
export interface DevStage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: OrthographicCamera;
  readonly context: PrimitiveContext;
  readonly size: ViewportSize;
  /** Add a primitive's object to the scene and keep its viewport uniforms in sync. */
  add<T>(primitive: Primitive<T>): Primitive<T>;
  /** Render synchronously (normally rendering is scheduled via `context.invalidate()`). */
  render(): void;
  dispose(): void;
}

export function createDevStage(el: HTMLElement, options: { background?: string } = {}): DevStage {
  const renderer = new WebGLRenderer({ antialias: true });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(new Color(options.background ?? '#ffffff'), 1);
  el.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 1, 0, -1000, 1000);
  const resources = createResourceManager();
  const primitives = new Set<Primitive<unknown>>();
  const size: ViewportSize = { width: 1, height: 1, pixelRatio };

  let frame = 0;
  const render = (): void => {
    frame = 0;
    renderer.render(scene, camera);
  };
  const context: PrimitiveContext = {
    resources,
    invalidate() {
      if (!frame) frame = requestAnimationFrame(render);
    },
  };

  const resize = (): void => {
    size.width = Math.max(1, el.clientWidth);
    size.height = Math.max(1, el.clientHeight);
    renderer.setSize(size.width, size.height);
    camera.right = size.width;
    camera.top = size.height;
    camera.updateProjectionMatrix();
    for (const p of primitives) p.setViewport(size);
    context.invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(el);
  resize();

  return {
    renderer,
    scene,
    camera,
    context,
    size,
    add(primitive) {
      primitives.add(primitive as Primitive<unknown>);
      scene.add(primitive.object);
      primitive.setViewport(size);
      context.invalidate();
      return primitive;
    },
    render,
    dispose() {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      for (const p of primitives) p.dispose();
      primitives.clear();
      resources.disposeAll();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
