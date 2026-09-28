/**
 * The chart's keyboard focus target (plan E6.5, E17.4): a focusable element over the plot area,
 * the chart's first tab stop (before the legend and the other controls). Everything it does —
 * the focus ring, keys, announcements — is keyboard navigation's (`keyboard.ts`), whose code loads
 * the first time the target gets focus; keys pressed before it arrives are replayed.
 *
 * It is `role="application"`: screen readers hand it the arrow keys instead of reading on in
 * browse mode, while the rest of the chart (the figure, its description and data tables) stays
 * browsable. Keys pressed while a control inside the chart has focus never reach it (the listener
 * is on this element, and controls are not inside it).
 */
import { localize, type FullLayout } from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import type { KeyboardHost, KeyboardNav } from './keyboard.ts';

/** The focus target of one interactive chart (`config.a11y.keyboard`). */
export class FocusTarget {
  readonly el: HTMLDivElement;
  #nav: KeyboardNav | undefined;
  /** Keys pressed before the navigation code arrived. */
  readonly #queue: KeyboardEvent[] = [];
  #destroyed = false;

  /** Insert the target into `parent` before `before` (after the canvas: the first tab stop). */
  constructor(parent: HTMLElement, before: Node | null, host: KeyboardHost) {
    const el = parent.ownerDocument.createElement('div');
    el.className = 'holochart-focus';
    el.tabIndex = 0;
    el.setAttribute('role', 'application');
    el.style.cssText =
      'position:absolute;left:0;top:0;pointer-events:none;outline-style:solid;outline-width:0;outline-offset:2px;';
    el.addEventListener('keydown', (e) => this.#nav || this.#queue.push(e));
    el.addEventListener(
      'focus',
      () => {
        import('./keyboard.ts').then(
          (m) => {
            if (!this.#destroyed) this.#nav = new m.KeyboardNav(el, host, this.#queue);
          },
          (error: unknown) => console.warn('holochart: loading keyboard navigation failed', error),
        );
      },
      { once: true },
    );
    parent.insertBefore(el, before);
    this.el = el;
  }

  /** After a pipeline run: cover the plot area, label and color for the figure. */
  refresh(plot: Readonly<ViewportRect>, fullLayout: FullLayout): void {
    const s = this.el.style;
    s.transform = `translate(${plot.x}px,${plot.y}px)`;
    s.width = `${plot.width}px`;
    s.height = `${plot.height}px`;
    s.outlineColor = String(fullLayout.font.color);
    this.el.setAttribute(
      'aria-label',
      localize(fullLayout, 'Chart data: arrow keys move between points, + and - zoom'),
    );
    this.#nav?.refresh();
  }

  destroy(): void {
    this.#destroyed = true;
    this.#nav?.destroy();
    this.el.remove();
  }
}
