/**
 * What a chart shows when it cannot draw (S1.8): without WebGL2 the container gets a short note
 * and the chart's text description instead of a blank box, and `createChart` throws (`newPlot`
 * rejects with) a {@link WebGLUnavailableError}. `purge(el)`, or a new chart in `el`, removes it.
 */
import { HolochartError } from '@mk7s/holochart-core';

/**
 * Thrown by `createChart` (and the rejection of `newPlot` / `react` / `toImage`) when no WebGL2
 * context can be created: the browser lacks WebGL2, it is disabled, or the GPU is blocklisted.
 * `cause` holds the renderer's own error.
 */
export class WebGLUnavailableError extends HolochartError {
  constructor(cause: unknown) {
    super('holochart: WebGL2 is unavailable', { cause });
    this.name = 'WebGLUnavailableError';
  }
}

const FALLBACKS = new WeakMap<HTMLElement, HTMLElement>();

/** Show the "WebGL2 is required" note and `lines` (the chart's text description) in `el`. */
export function showFallback(el: HTMLElement, lines: readonly string[], width: number): void {
  const box = el.ownerDocument.createElement('div');
  box.className = 'holochart-fallback';
  box.setAttribute('role', 'note');
  box.style.cssText = `box-sizing:border-box;width:${width}px;max-width:100%;padding:0 1em;border:1px dashed`;
  for (const text of ['This chart needs WebGL2, which this browser does not provide.', ...lines]) {
    box.appendChild(el.ownerDocument.createElement('p')).textContent = text;
  }
  removeFallback(el);
  el.appendChild(box);
  FALLBACKS.set(el, box);
}

/** Remove the note {@link showFallback} put in `el`, if any. */
export function removeFallback(el: HTMLElement): void {
  FALLBACKS.get(el)?.remove();
  FALLBACKS.delete(el);
}
