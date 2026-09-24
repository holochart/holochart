/**
 * Rectangular clipping for table primitives (plan E9.13). Plotly clips a table's scrolling rows to
 * the table and each column's text to the column (SVG clip paths). Domain traces draw into the
 * figure's unclipped overlay viewport, so a table clips its own primitives: each clipped mesh sets
 * a GL scissor in `onBeforeRender` (intersected with any scissor already active) and restores the
 * previous one in `onAfterRender`, three's per-object hooks around the draw call.
 *
 * The rect is in container px (top-left origin); it is mapped through the viewport GL is drawing
 * into (`renderer.getViewport`) relative to the overlay's world size, so it stays right however
 * the canvas is rendered (device pixel ratio, an export at another size).
 *
 * The text primitive creates its batched mesh when the text engine has loaded: meshes added to the
 * primitive's root later are hooked when they arrive (`childadded`).
 */
import { Vector4, type Object3D, type WebGLRenderer } from 'three';

/** A clip rect in container px, top-left origin. */
export interface ClipRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type Hook = NonNullable<Object3D['onBeforeRender']>;

const saved = new Vector4();
const viewport = new Vector4();

/** Intersection of two rects (`[x, y, w, h]`, any origin), empty when they don't overlap. */
export function intersect(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): [number, number, number, number] {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
}

/**
 * GL scissor (CSS px, bottom-left origin, as `renderer.setScissor` takes it) for `rect` in a world
 * of `size` drawn into the GL viewport `vp` (`[x, y, width, height]`, bottom-left origin).
 */
export function scissorFor(
  rect: ClipRect,
  size: { readonly width: number; readonly height: number },
  vp: readonly [number, number, number, number],
): [number, number, number, number] {
  const sx = size.width > 0 ? vp[2] / size.width : 1;
  const sy = size.height > 0 ? vp[3] / size.height : 1;
  return [
    vp[0] + rect.x * sx,
    vp[1] + (size.height - rect.y - rect.height) * sy,
    rect.width * sx,
    rect.height * sy,
  ];
}

/** A clip shared by the meshes it is attached to; `rect = null` disables it. */
export class ScissorClip {
  /** The clip rect, or `null` for no clipping. */
  rect: ClipRect | null = null;
  /** The overlay's world size (container px). */
  size: { width: number; height: number } = { width: 0, height: 0 };
  #restore: { scissor: [number, number, number, number]; test: boolean } | null = null;

  /** Clip `object` (and the meshes added to it later). */
  attach(object: Object3D): void {
    this.#hook(object);
    for (const child of object.children) this.#hook(child);
    object.addEventListener('childadded', (e) => {
      const child = (e as { child?: Object3D }).child;
      if (child) this.#hook(child);
    });
  }

  #hook(object: Object3D): void {
    const flagged = object as Object3D & { __tableClip?: ScissorClip };
    if (flagged.__tableClip === this) return;
    flagged.__tableClip = this;
    const before: Hook = object.onBeforeRender.bind(object);
    const after: Hook = object.onAfterRender.bind(object);
    object.onBeforeRender = (renderer, ...rest) => {
      before(renderer, ...rest);
      this.#begin(renderer);
    };
    object.onAfterRender = (renderer, ...rest) => {
      this.#end(renderer);
      after(renderer, ...rest);
    };
  }

  #begin(renderer: WebGLRenderer): void {
    const rect = this.rect;
    if (!rect) return;
    renderer.getScissor(saved);
    const test = renderer.getScissorTest();
    renderer.getViewport(viewport);
    let s = scissorFor(rect, this.size, [viewport.x, viewport.y, viewport.z, viewport.w]);
    if (test) s = intersect(s, [saved.x, saved.y, saved.z, saved.w]);
    this.#restore = { scissor: [saved.x, saved.y, saved.z, saved.w], test };
    renderer.setScissor(s[0], s[1], s[2], s[3]);
    renderer.setScissorTest(true);
  }

  #end(renderer: WebGLRenderer): void {
    const r = this.#restore;
    if (!r) return;
    this.#restore = null;
    renderer.setScissor(r.scissor[0], r.scissor[1], r.scissor[2], r.scissor[3]);
    renderer.setScissorTest(r.test);
  }
}
