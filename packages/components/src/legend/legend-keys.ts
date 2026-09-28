/**
 * Keyboard access to the legend (plan E17.4). The legend is drawn in WebGL, so its items get
 * transparent `<button>`s laid over them: a toolbar (WAI-ARIA APG) with one tab stop, where the
 * arrow keys, Home and End move between items, Enter / Space act like a click (toggle the trace,
 * its label or its group) and Shift + Enter / Space like a double-click (isolate). Each button is
 * named after its item and `aria-pressed` while the item is shown. The buttons draw nothing but a
 * focus ring (in the legend's text color) and take no pointer events: the mouse keeps going to the
 * canvas, as before.
 *
 * Loaded by the legend view once an interactive chart draws a legend (`config.a11y.keyboard`),
 * and mounted where the legend's DOM would be in the chart's tab order: after the plot area's focus
 * target, before the update menus, sliders, modebar and range selectors. Each legend (`legend2`, …)
 * is a toolbar of its own, named "Legend" / "Legend 2" (with its title after a colon). Focusing
 * an item of a scrolling legend scrolls it into view.
 */
import { localize, type FullLayout } from '@mk7s/holochart-core';
import { ensureStyle } from '../shared/dom.ts';

/** One legend item as a key target (container px). */
export interface LegendKeyItem {
  /** The legend's click-dispatch id of the item. */
  readonly id: string;
  /** Item text as drawn (plain, lines separated by `\n`). */
  readonly label: string;
  /** Whether the item is shown (`aria-pressed`). */
  readonly pressed: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const STYLE_ID = 'holochart-legend-keys-style';
const CSS =
  '.hc-legend-keys{position:absolute;left:0;top:0;width:0;height:0;z-index:3}' +
  '.hc-legend-key{position:absolute;box-sizing:border-box;margin:0;padding:0;border:0;' +
  'background:none;color:transparent;font-size:0;pointer-events:none;border-radius:2px;' +
  'outline:none}' +
  '.hc-legend-key:focus-visible{outline:2px solid var(--hc-legend-focus,currentColor);' +
  'outline-offset:1px}';

/** The legend's key targets (see the module comment). */
export class LegendKeys {
  readonly root: HTMLDivElement;
  readonly #act: (id: string, double: boolean) => void;
  readonly #reveal: ((id: string) => void) | undefined;
  #buttons: HTMLButtonElement[] = [];
  #ids: string[] = [];
  /** The item holding the tab stop. */
  #current = '';

  /**
   * Mount in place of `anchor` (the legend's place in the chart's tab order). `reveal` runs when an
   * item gets the focus (to scroll it into view).
   */
  constructor(
    anchor: ChildNode,
    act: (id: string, double: boolean) => void,
    reveal?: (id: string) => void,
  ) {
    const doc = anchor.ownerDocument as Document;
    const root = doc.createElement('div');
    root.className = 'hc-legend-keys';
    root.setAttribute('role', 'toolbar');
    root.addEventListener('keydown', this.#onKey);
    root.addEventListener('focusin', this.#onFocusin);
    anchor.replaceWith(root);
    ensureStyle(root, STYLE_ID, CSS);
    this.root = root;
    this.#act = act;
    this.#reveal = reveal;
  }

  /**
   * Match the drawn items of legend `id` (`[]` removes the buttons); focus stays on an item that
   * remains.
   */
  update(items: readonly LegendKeyItem[], fullLayout: FullLayout | undefined, id = 'legend'): void {
    const root = this.root;
    const doc = root.ownerDocument;
    const legend = fullLayout?.[id] as LegendLike | undefined;
    root.hidden = items.length === 0;
    const name = localize(fullLayout, 'Legend') + (id === 'legend' ? '' : ` ${id.slice(6)}`);
    const title = plain(legend?.title?.text);
    root.setAttribute('aria-label', title ? `${name}: ${title}` : name);
    const color = legend?.font?.color ?? fullLayout?.font.color ?? '#444';
    root.style.setProperty('--hc-legend-focus', String(color));
    const byId = new Map(this.#ids.map((id, k) => [id, this.#buttons[k] as HTMLButtonElement]));
    const buttons = items.map((item) => {
      let b = byId.get(item.id);
      byId.delete(item.id);
      if (!b) {
        b = doc.createElement('button');
        b.type = 'button';
        b.className = 'hc-legend-key';
        b.addEventListener('click', this.#onClick);
      }
      const s = b.style;
      s.left = `${item.left}px`;
      s.top = `${item.top}px`;
      s.width = `${item.width}px`;
      s.height = `${item.height}px`;
      const label = item.label.replace(/\s+/g, ' ').trim() || item.id;
      if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', String(item.pressed));
      return b;
    });
    // Items that are gone; the tab stop moves to the first item if it was theirs.
    for (const b of byId.values()) b.remove();
    this.#buttons = buttons;
    this.#ids = items.map((item) => item.id);
    if (!this.#ids.includes(this.#current)) this.#current = this.#ids[0] ?? '';
    buttons.forEach((b, k) => {
      b.tabIndex = this.#ids[k] === this.#current ? 0 : -1;
      // In item order (appending an attached node moves it without losing focus).
      if (root.children[k] !== b) root.insertBefore(b, root.children[k] ?? null);
    });
  }

  destroy(): void {
    this.root.remove();
    this.#buttons = [];
    this.#ids = [];
  }

  #focus(k: number): void {
    const n = this.#buttons.length;
    if (n === 0) return;
    const i = ((k % n) + n) % n;
    this.#current = this.#ids[i] as string;
    this.#buttons.forEach((b, j) => (b.tabIndex = j === i ? 0 : -1));
    this.#buttons[i]?.focus({ preventScroll: true });
  }

  readonly #onKey = (e: KeyboardEvent): void => {
    const k = this.#ids.indexOf(this.#current);
    let next: number | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = k + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = k - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = this.#buttons.length - 1;
    else if ((e.key === 'Enter' || e.key === ' ') && e.shiftKey) {
      // Shift: a double-click (a plain Enter / Space clicks the button natively).
      e.preventDefault();
      this.#act(this.#current, true);
      return;
    }
    if (next === undefined) return;
    e.preventDefault();
    this.#focus(next);
  };

  readonly #onClick = (e: MouseEvent): void => {
    const k = this.#buttons.indexOf(e.currentTarget as HTMLButtonElement);
    if (k >= 0) this.#act(this.#ids[k] as string, false);
  };

  readonly #onFocusin = (e: FocusEvent): void => {
    const k = this.#buttons.indexOf(e.target as HTMLButtonElement);
    if (k < 0) return;
    this.#current = this.#ids[k] as string;
    this.#buttons.forEach((b, j) => (b.tabIndex = j === k ? 0 : -1));
    this.#reveal?.(this.#current);
  };
}

/** What the toolbar reads of its legend: the title (its name) and the text color (focus ring). */
interface LegendLike {
  readonly title?: { readonly text?: unknown };
  readonly font?: { readonly color?: unknown };
}

/** A title as plain text (markup dropped, whitespace collapsed). */
function plain(text: unknown): string {
  return typeof text === 'string'
    ? text
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}
