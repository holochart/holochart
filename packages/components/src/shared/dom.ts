/**
 * DOM helpers shared by the components that draw real DOM controls over the chart (modebar, update
 * menus, sliders): one `<style>` element per document (or shadow root), a positioned host so the
 * controls can be absolutely placed against `chart.element`, and shielding of pointer events so a
 * press on a control never starts a zoom, pan or double-click on the chart.
 */
import { measurementFace } from '@mk7s/holochart-render';
import { LINE_HEIGHT, textFont, type FullFont } from './text.ts';

/**
 * Insert `css` once as a `<style id="{id}">` where it reaches `el`: `document.head`, or the shadow
 * root `el` lives in (document styles do not reach into shadow roots).
 */
export function ensureStyle(el: HTMLElement, id: string, css: string): void {
  const doc = el.ownerDocument;
  const root = el.getRootNode();
  const inShadow = typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot;
  const scope: Document | ShadowRoot = inShadow ? root : doc;
  if (scope.getElementById(id)) return;
  const style = doc.createElement('style');
  style.id = id;
  style.textContent = css;
  if (inShadow) root.appendChild(style);
  else (doc.head ?? doc.documentElement).appendChild(style);
}

interface HostClaim {
  count: number;
  /** The host's inline `position` before it was set to `relative`, when it was. */
  previous: string | undefined;
}

const claims = new WeakMap<HTMLElement, HostClaim>();

/**
 * Make `host` a positioning context for absolutely placed controls: a statically positioned host
 * gets `position: relative`. Claims are counted per element, so several components can share the
 * host; the last release restores the host's own inline `position`.
 *
 * @returns Release function (idempotent).
 */
export function claimPositionedHost(host: HTMLElement): () => void {
  let claim = claims.get(host);
  if (!claim) {
    const view = host.ownerDocument.defaultView;
    const position = view ? view.getComputedStyle(host).position : '';
    let previous: string | undefined;
    if (position === 'static' || position === '') {
      previous = host.style.position;
      host.style.position = 'relative';
    }
    claim = { count: 0, previous };
    claims.set(host, claim);
  }
  claim.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const c = claims.get(host);
    if (!c || --c.count > 0) return;
    claims.delete(host);
    if (c.previous !== undefined) host.style.position = c.previous;
  };
}

/** Events stopped at a control so they never reach the chart's own drag/zoom/double-click. */
export const SHIELDED_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'dblclick'] as const;

const stop = (event: Event): void => event.stopPropagation();

/** Stop {@link SHIELDED_EVENTS} from bubbling out of `el`. Returns the undo function. */
export function shieldEvents(el: HTMLElement): () => void {
  for (const type of SHIELDED_EVENTS) el.addEventListener(type, stop);
  return () => {
    for (const type of SHIELDED_EVENTS) el.removeEventListener(type, stop);
  };
}

/** `requestAnimationFrame` where available (browsers), else a 16 ms timeout (tests, workers). */
export function nextFrame(callback: () => void): () => void {
  const g = globalThis as {
    requestAnimationFrame?: (cb: () => void) => number;
    cancelAnimationFrame?: (id: number) => void;
  };
  if (typeof g.requestAnimationFrame === 'function') {
    const id = g.requestAnimationFrame(callback);
    return () => g.cancelAnimationFrame?.(id);
  }
  const id = setTimeout(callback, 16);
  return () => clearTimeout(id);
}

/** A unique DOM id prefix per document (for `aria-controls`, `aria-activedescendant`). */
let idCounter = 0;
export function uniqueDomId(prefix: string): string {
  idCounter++;
  return `${prefix}-${idCounter.toString(36)}`;
}

/**
 * Style `el`'s text with a defaulted Plotly font, using the face the SDF text and the layout's
 * measurements use (a registered family, else the built-in default font, ADR-005 / E2.18): DOM
 * labels then match the canvas text and the sizes computed for them, on every platform.
 */
export function applyDomFont(el: HTMLElement, font: FullFont): void {
  const face = measurementFace(textFont(font));
  const s = el.style;
  s.fontFamily = face.family;
  s.fontWeight = String(face.weight);
  s.fontStyle = face.style;
  s.fontSize = `${font.size}px`;
  s.lineHeight = String(LINE_HEIGHT);
  s.color = font.color;
}
