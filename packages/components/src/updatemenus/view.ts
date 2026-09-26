/**
 * The update-menus DOM view (plan E5.10): real `<button>`s over the chart, positioned from the
 * pure layout in `layout.ts`.
 *
 * Accessibility (plan E17.4):
 * - `buttons` menus are a `role="toolbar"` with one tab stop; arrow keys (along the menu's
 *   direction), Home and End move between buttons, Enter / Space press them. With `showactive`
 *   each button is a toggle (`aria-pressed`); without it they are plain action buttons.
 * - dropdowns are a `<button aria-haspopup="listbox" aria-expanded>` showing the active label and a
 *   `role="listbox"` of `role="option"`s (`aria-selected` on the active one). Enter, Space or an
 *   arrow key opens the list with the active option highlighted (`aria-activedescendant`); arrows,
 *   Home, End and typing a first letter move the highlight; Enter / Space choose; Escape closes and
 *   returns focus to the button; Tab or a click outside closes it.
 * - visible focus rings in the menu's text color; `prefers-reduced-motion` has nothing to disable
 *   (no animation).
 */
import type { ComponentDrawContext, ComponentUpdatePlan } from '@mk7s/holochart-runtime';
import {
  applyDomFont,
  claimPositionedHost,
  ensureStyle,
  shieldEvents,
  uniqueDomId,
} from '../shared/dom.ts';
import { fireAndForget } from '../shared/host.ts';
import { oracleMeasure, type MeasureLine } from '../shared/text.ts';
import { CommandObserver, executeCommand, type CommandChart } from './commands.ts';
import type { ButtonClickedEvent } from './events.ts';
import {
  layoutUpdatemenu,
  placeUpdatemenu,
  UPDATEMENU_METRICS,
  type MenuItemBox,
  type MenuLayout,
} from './layout.ts';
import type { FullUpdatemenu, FullUpdatemenuButton } from './schema.ts';

/** The parts of a `Chart` the menus use. */
export interface UpdatemenusChartLike extends CommandChart {
  readonly element: HTMLElement;
  relayout(update: Readonly<Record<string, unknown>>, options?: { gui?: boolean }): unknown;
  emit(type: 'buttonclicked', payload: ButtonClickedEvent): unknown;
}

/** What the view reads from the draw context. */
export type UpdatemenusViewContext = Pick<
  ComponentDrawContext,
  'fullLayout' | 'fullData' | 'plotArea' | 'width' | 'height'
>;

export interface UpdatemenusViewOptions<Ctx extends UpdatemenusViewContext> {
  /** Find the chart later (a context without one at creation). */
  readonly locate?: (ctx: Ctx) => UpdatemenusChartLike | undefined;
  readonly warn?: (message: string) => void;
  /** Text measure (default: the shared font-metrics oracle). */
  readonly measure?: MeasureLine;
}

export interface UpdatemenusView<Ctx extends UpdatemenusViewContext> {
  update(ctx: Ctx, plan?: ComponentUpdatePlan): void;
  dispose(): void;
  /** The container of every menu (for tests), if mounted. */
  readonly root: HTMLElement | undefined;
  /** Click button `button` of the shown menu `menu` (index in `updatemenus`), as a user would. */
  click(menu: number, button: number): void;
}

const STYLE_ID = 'hc-updatemenus-style';

const CSS = `
.hc-menus{position:absolute;left:0;top:0;width:0;height:0;z-index:1000}
.hc-menu{position:absolute;pointer-events:none}
.hc-menu-btn{-webkit-appearance:none;appearance:none;position:absolute;box-sizing:border-box;display:flex;align-items:center;margin:0;padding:0 0 0 var(--hc-menu-padx);border:var(--hc-menu-bw) solid var(--hc-menu-border);border-radius:var(--hc-menu-radius);background:var(--hc-menu-bg);color:inherit;font:inherit;line-height:inherit;text-align:left;white-space:pre;overflow:hidden;cursor:pointer;pointer-events:auto;user-select:none;-webkit-user-select:none}
.hc-menu-btn:hover,.hc-menu-opt[data-highlight]{background:var(--hc-menu-hover)}
.hc-menu-btn[data-active]{background:var(--hc-menu-active)}
.hc-menu-btn:focus-visible,.hc-menu-list:focus-visible .hc-menu-opt[data-highlight]{outline:2px solid var(--hc-menu-focus);outline-offset:-1px}
.hc-menu-list{position:absolute;display:none;outline:none}
.hc-menu-list[data-open]{display:block}
.hc-menu-arrow{position:absolute;right:var(--hc-menu-arrowx);top:50%;width:var(--hc-menu-arrow);height:var(--hc-menu-arrow);margin-top:calc(var(--hc-menu-arrow) / -2);fill:currentColor;pointer-events:none}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Arrow triangles by direction, in a 10×10 box. */
const ARROWS: Record<FullUpdatemenu['direction'], string> = {
  down: 'M1 3h8L5 8z',
  up: 'M1 7h8L5 2z',
  right: 'M3 1v8l5-4z',
  left: 'M7 1v8L2 5z',
};

interface MenuDom {
  /** Index in `fullLayout.updatemenus`. */
  readonly position: number;
  readonly el: HTMLDivElement;
  key: string;
  menu: FullUpdatemenu;
  layout: MenuLayout;
  /** Buttons (`buttons` menus) or options (dropdowns), by button index. */
  items: Map<number, HTMLElement>;
  /** Visible button indices in order. */
  order: number[];
  header?: HTMLButtonElement;
  headerLabel?: HTMLSpanElement;
  list?: HTMLDivElement;
  open: boolean;
  /** Roving focus (buttons) / highlighted option (dropdown), as a position in `order`. */
  cursor: number;
  /** Active index set by a click on a template-only menu (see `sync`). */
  pendingActive?: number;
}

/**
 * Create the update-menus view. Menus appear in `chart.element`, above the canvas; with no chart
 * yet the view waits for `options.locate` to find one.
 */
export function createUpdatemenusView<Ctx extends UpdatemenusViewContext>(
  initialChart: UpdatemenusChartLike | undefined,
  ctx: Ctx,
  options: UpdatemenusViewOptions<Ctx> = {},
): UpdatemenusView<Ctx> {
  let chart = initialChart;
  let root: HTMLDivElement | undefined;
  let releaseHost: (() => void) | undefined;
  let unshield: (() => void) | undefined;
  let menus: MenuDom[] = [];
  let disposed = false;
  const observers = new Map<number, CommandObserver>();
  const measure = options.measure ?? oracleMeasure;

  const warned = new Set<string>();
  const warn = (message: string): void => {
    if (warned.has(message)) return;
    warned.add(message);
    (options.warn ?? ((m: string) => console.warn(m)))(message);
  };

  // ---- actions ----------------------------------------------------------------------------------

  /** Set a menu's active button: shown at once, stored with a GUI `relayout` like Plotly. */
  const setActive = (m: MenuDom, index: number): void => {
    m.menu.active = index;
    m.pendingActive = index;
    if (chart && m.menu._index >= 0) {
      const result = chart.relayout(
        { [`updatemenus[${m.menu._index}].active`]: index },
        { gui: true },
      );
      if (result instanceof Promise) fireAndForget(result);
    }
    refreshStates(m);
  };

  const press = (m: MenuDom, index: number, event?: Event): void => {
    const menu = m.menu;
    const button = menu.buttons[index];
    if (!button || !chart) return;
    if (button.execute) {
      if (button.args2 !== undefined && menu.active === index) {
        setActive(m, -1);
        void executeCommand(chart, button.method, button.args2, warn);
      } else {
        setActive(m, index);
        void executeCommand(chart, button.method, button.args, warn);
      }
    }
    chart.emit('buttonclicked', {
      menu,
      button,
      active: menu.active,
      ...(event ? { event } : {}),
    });
  };

  // ---- dropdown ---------------------------------------------------------------------------------

  const highlight = (m: MenuDom, cursor: number): void => {
    const n = m.order.length;
    if (n === 0) return;
    m.cursor = ((cursor % n) + n) % n;
    const current = m.items.get(m.order[m.cursor] as number);
    for (const el of m.items.values()) {
      if (el === current) el.setAttribute('data-highlight', '');
      else el.removeAttribute('data-highlight');
    }
    if (current) m.list?.setAttribute('aria-activedescendant', current.id);
    current?.scrollIntoView?.({ block: 'nearest' });
  };

  const openList = (m: MenuDom, focus: boolean): void => {
    if (!m.list || !m.header) return;
    for (const other of menus) if (other !== m && other.open) closeList(other, false);
    m.open = true;
    m.list.setAttribute('data-open', '');
    m.header.setAttribute('aria-expanded', 'true');
    const at = m.order.indexOf(m.menu.active);
    highlight(m, at >= 0 ? at : 0);
    if (focus) m.list.focus();
  };

  const closeList = (m: MenuDom, focusHeader: boolean): void => {
    if (!m.open) return;
    m.open = false;
    m.list?.removeAttribute('data-open');
    m.header?.setAttribute('aria-expanded', 'false');
    if (focusHeader) m.header?.focus();
  };

  const onDocPointer = (event: Event): void => {
    for (const m of menus) {
      if (m.open && !event.composedPath().includes(m.el)) closeList(m, false);
    }
  };

  const menuOf = (target: EventTarget | null): MenuDom | undefined => {
    if (!(target instanceof Element)) return undefined;
    const el = target.closest('.hc-menu');
    return menus.find((m) => m.el === el);
  };

  const itemIndex = (m: MenuDom, target: EventTarget | null): number | undefined => {
    if (!(target instanceof Element)) return undefined;
    const el = target.closest('.hc-menu-btn');
    for (const [index, item] of m.items) if (item === el) return index;
    return undefined;
  };

  const onClick = (event: MouseEvent): void => {
    const m = menuOf(event.target);
    if (!m) return;
    if (m.header && event.target instanceof Node && m.header.contains(event.target)) {
      if (m.open) closeList(m, false);
      else openList(m, true);
      return;
    }
    const index = itemIndex(m, event.target);
    if (index === undefined) return;
    if (m.menu.type === 'dropdown') closeList(m, true);
    press(m, index, event);
  };

  const onPointerOver = (event: PointerEvent): void => {
    const m = menuOf(event.target);
    if (!m?.open) return;
    const index = itemIndex(m, event.target);
    if (index !== undefined) highlight(m, m.order.indexOf(index));
  };

  const nextKeys = (m: MenuDom): { next: string[]; prev: string[] } =>
    m.layout.vertical
      ? { next: ['ArrowDown'], prev: ['ArrowUp'] }
      : { next: ['ArrowRight'], prev: ['ArrowLeft'] };

  const onKeydown = (event: KeyboardEvent): void => {
    const m = menuOf(event.target);
    if (!m) return;
    const { next, prev } = nextKeys(m);
    const key = event.key;
    if (m.menu.type === 'buttons') {
      let cursor: number | undefined;
      if (next.includes(key)) cursor = m.cursor + 1;
      else if (prev.includes(key)) cursor = m.cursor - 1;
      else if (key === 'Home') cursor = 0;
      else if (key === 'End') cursor = m.order.length - 1;
      if (cursor === undefined) return;
      event.preventDefault();
      focusButton(m, cursor);
      return;
    }
    // Dropdown header.
    if (event.target === m.header) {
      const opens = [...next, ...prev, 'ArrowDown', 'ArrowUp', 'Enter', ' '];
      if (!m.open && opens.includes(key)) {
        event.preventDefault();
        openList(m, true);
        if (prev.includes(key)) highlight(m, m.order.length - 1);
      } else if (m.open && key === 'Escape') {
        event.preventDefault();
        closeList(m, true);
      }
      return;
    }
    // Dropdown list.
    if (!m.open) return;
    const both = {
      next: [...next, 'ArrowDown', 'ArrowRight'],
      prev: [...prev, 'ArrowUp', 'ArrowLeft'],
    };
    if (both.next.includes(key)) highlight(m, m.cursor + 1);
    else if (both.prev.includes(key)) highlight(m, m.cursor - 1);
    else if (key === 'Home') highlight(m, 0);
    else if (key === 'End') highlight(m, m.order.length - 1);
    else if (key === 'Escape') closeList(m, true);
    else if (key === 'Tab') {
      closeList(m, false);
      return;
    } else if (key === 'Enter' || key === ' ') {
      const index = m.order[m.cursor];
      closeList(m, true);
      if (index !== undefined) press(m, index, event);
    } else if (key.length === 1 && /\S/.test(key)) {
      const lower = key.toLowerCase();
      const n = m.order.length;
      for (let k = 1; k <= n; k++) {
        const pos = (m.cursor + k) % n;
        const label = m.menu.buttons[m.order[pos] as number]?.label ?? '';
        if (label.trim().toLowerCase().startsWith(lower)) {
          highlight(m, pos);
          break;
        }
      }
    } else return;
    event.preventDefault();
  };

  const onFocusout = (event: FocusEvent): void => {
    const m = menuOf(event.target);
    if (!m?.open) return;
    const to = event.relatedTarget;
    if (to instanceof Node && m.el.contains(to)) return;
    closeList(m, false);
  };

  const focusButton = (m: MenuDom, cursor: number): void => {
    const n = m.order.length;
    if (n === 0) return;
    m.cursor = ((cursor % n) + n) % n;
    const index = m.order[m.cursor] as number;
    for (const [i, el] of m.items) el.tabIndex = i === index ? 0 : -1;
    m.items.get(index)?.focus();
  };

  const onFocusin = (event: FocusEvent): void => {
    const m = menuOf(event.target);
    if (!m || m.menu.type !== 'buttons') return;
    const index = itemIndex(m, event.target);
    if (index === undefined) return;
    m.cursor = m.order.indexOf(index);
    for (const [i, el] of m.items) el.tabIndex = i === index ? 0 : -1;
  };

  // ---- DOM --------------------------------------------------------------------------------------

  const mount = (host: HTMLElement): HTMLDivElement => {
    ensureStyle(host, STYLE_ID, CSS);
    releaseHost = claimPositionedHost(host);
    const doc = host.ownerDocument;
    const el = doc.createElement('div');
    el.className = 'hc-menus';
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKeydown);
    el.addEventListener('focusin', onFocusin);
    el.addEventListener('focusout', onFocusout);
    el.addEventListener('pointerover', onPointerOver);
    doc.addEventListener('pointerdown', onDocPointer, true);
    unshield = shieldEvents(el);
    host.appendChild(el);
    return el;
  };

  const unmount = (): void => {
    if (!root) return;
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKeydown);
    root.removeEventListener('focusin', onFocusin);
    root.removeEventListener('focusout', onFocusout);
    root.removeEventListener('pointerover', onPointerOver);
    root.ownerDocument.removeEventListener('pointerdown', onDocPointer, true);
    unshield?.();
    unshield = undefined;
    root.remove();
    root = undefined;
    menus = [];
    releaseHost?.();
    releaseHost = undefined;
  };

  const place = (el: HTMLElement, box: { x: number; y: number; width: number; height: number }) => {
    const s = el.style;
    s.left = `${box.x}px`;
    s.top = `${box.y}px`;
    s.width = `${box.width}px`;
    s.height = `${box.height}px`;
  };

  const labelSpan = (doc: Document, text: string): HTMLSpanElement => {
    const span = doc.createElement('span');
    span.textContent = text;
    return span;
  };

  const build = (m: MenuDom): void => {
    const doc = m.el.ownerDocument;
    const hadFocus = m.el.contains(doc.activeElement);
    const focusedIndex = hadFocus ? itemIndex(m, doc.activeElement) : undefined;
    const headerFocused = hadFocus && doc.activeElement === m.header;
    // An open list keeps the focus across a rebuild (`sync` reopens it).
    const listFocused = hadFocus && m.list !== undefined && doc.activeElement === m.list;
    m.el.replaceChildren();
    m.items = new Map();
    m.header = undefined;
    m.headerLabel = undefined;
    m.list = undefined;
    m.open = false;
    const { menu, layout } = m;
    m.order = layout.items.map((b) => b.index);
    const name = menu.name !== undefined && menu.name !== '' ? menu.name : `Menu ${m.position + 1}`;
    m.el.removeAttribute('role');
    m.el.removeAttribute('aria-label');
    m.el.removeAttribute('aria-orientation');

    const makeItem = (box: MenuItemBox, tag: 'button' | 'div'): HTMLElement => {
      const el = doc.createElement(tag);
      el.className = 'hc-menu-btn';
      if (el instanceof HTMLButtonElement) el.type = 'button';
      el.dataset['index'] = String(box.index);
      el.appendChild(labelSpan(doc, box.label));
      place(el, box);
      return el;
    };

    if (menu.type === 'buttons') {
      m.el.setAttribute('role', 'toolbar');
      m.el.setAttribute('aria-label', name);
      m.el.setAttribute('aria-orientation', layout.vertical ? 'vertical' : 'horizontal');
      for (const box of layout.items) {
        const el = makeItem(box, 'button');
        el.tabIndex = -1;
        m.items.set(box.index, el);
        m.el.appendChild(el);
      }
      const at = m.order.indexOf(menu.active);
      m.cursor = Math.min(Math.max(0, at >= 0 ? at : m.cursor), Math.max(0, m.order.length - 1));
      const current = m.items.get(m.order[m.cursor] as number);
      if (current) current.tabIndex = 0;
      if (focusedIndex !== undefined) m.items.get(focusedIndex)?.focus();
      else if (hadFocus) current?.focus();
      return;
    }

    // Dropdown.
    const listId = uniqueDomId('hc-menu-list');
    const header = doc.createElement('button');
    header.type = 'button';
    header.className = 'hc-menu-btn hc-menu-header';
    header.setAttribute('aria-haspopup', 'listbox');
    header.setAttribute('aria-expanded', 'false');
    header.setAttribute('aria-controls', listId);
    const headerLabel = labelSpan(doc, '');
    header.appendChild(headerLabel);
    const arrow = doc.createElementNS(SVG_NS, 'svg');
    arrow.setAttribute('class', 'hc-menu-arrow');
    arrow.setAttribute('viewBox', '0 0 10 10');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.setAttribute('focusable', 'false');
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ARROWS[menu.direction]);
    arrow.appendChild(path);
    header.appendChild(arrow);
    if (layout.header) place(header, layout.header);
    m.el.appendChild(header);

    const list = doc.createElement('div');
    list.className = 'hc-menu-list';
    list.id = listId;
    list.tabIndex = -1;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', name);
    list.setAttribute('aria-orientation', layout.vertical ? 'vertical' : 'horizontal');
    // The list box spans its options (so it has a real size for hit testing and screen readers).
    const x0 = Math.min(...layout.items.map((b) => b.x));
    const y0 = Math.min(...layout.items.map((b) => b.y));
    const x1 = Math.max(...layout.items.map((b) => b.x + b.width));
    const y1 = Math.max(...layout.items.map((b) => b.y + b.height));
    place(list, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    for (const item of layout.items) {
      const box = { ...item, x: item.x - x0, y: item.y - y0 };
      const el = makeItem(box, 'div');
      el.classList.add('hc-menu-opt');
      el.id = `${listId}-${box.index}`;
      el.setAttribute('role', 'option');
      m.items.set(box.index, el);
      list.appendChild(el);
    }
    m.el.appendChild(list);
    m.header = header;
    m.headerLabel = headerLabel;
    m.list = list;
    if (headerFocused || (hadFocus && !listFocused)) header.focus();
  };

  /** Pressed / selected states and the dropdown's header label. */
  const refreshStates = (m: MenuDom): void => {
    const { menu } = m;
    const show = menu.showactive;
    for (const [index, el] of m.items) {
      const active = index === menu.active;
      if (active && show) el.setAttribute('data-active', '');
      else el.removeAttribute('data-active');
      if (menu.type === 'buttons') {
        if (show) el.setAttribute('aria-pressed', active ? 'true' : 'false');
        else el.removeAttribute('aria-pressed');
      } else {
        el.setAttribute('aria-selected', active ? 'true' : 'false');
      }
    }
    if (m.headerLabel && m.header) {
      const button: FullUpdatemenuButton | undefined = menu.buttons[menu.active];
      const label = button?.visible
        ? (m.layout.items.find((b) => b.index === menu.active)?.label ?? '')
        : '';
      if (m.headerLabel.textContent !== label) m.headerLabel.textContent = label;
      const name = menu.name !== undefined && menu.name !== '' ? `${menu.name}: ` : '';
      m.header.setAttribute('aria-label', `${name}${label === '' ? 'none' : label}`);
    }
  };

  const style = (m: MenuDom): void => {
    const { menu, layout } = m;
    const s = m.el.style;
    applyDomFont(m.el, menu.font);
    s.setProperty('--hc-menu-bg', menu.bgcolor);
    s.setProperty('--hc-menu-border', menu.bordercolor);
    s.setProperty('--hc-menu-bw', `${menu.borderwidth}px`);
    s.setProperty('--hc-menu-active', menu._activecolor);
    s.setProperty('--hc-menu-hover', menu._hovercolor);
    s.setProperty('--hc-menu-focus', menu.font.color);
    s.setProperty('--hc-menu-radius', `${Math.max(1, Math.round(2 * layout.scale))}px`);
    s.setProperty('--hc-menu-padx', `${(UPDATEMENU_METRICS.textPadX / 2) * layout.scale}px`);
    s.setProperty('--hc-menu-arrow', `${Math.round(0.8 * menu.font.size)}px`);
    s.setProperty('--hc-menu-arrowx', `${Math.round(4 * layout.scale)}px`);
  };

  const menuKey = (menu: FullUpdatemenu, layout: MenuLayout): string =>
    JSON.stringify([
      menu.type,
      menu.direction,
      menu.name ?? '',
      layout.items,
      layout.header ?? null,
    ]);

  const observerFor = (position: number): CommandObserver => {
    let o = observers.get(position);
    if (!o) {
      o = new CommandObserver();
      observers.set(position, o);
    }
    return o;
  };

  const sync = (c: Ctx): void => {
    if (disposed) return;
    chart ??= options.locate?.(c);
    if (!chart) return;
    const all = c.fullLayout['updatemenus'];
    const list = Array.isArray(all) ? (all as FullUpdatemenu[]) : [];
    const shown = list
      .map((menu, position) => ({ menu, position }))
      .filter(({ menu }) => menu.visible && menu.buttons.some((b) => b.visible));

    // Active tracking (Plotly `manageCommandObserver`), also for menus not shown.
    list.forEach((menu, position) => {
      const observer = observerFor(position);
      observer.setCommands(
        menu.buttons.map((b) => (b.visible ? b : undefined)),
        c.fullData.length,
      );
      const index = observer.check(c.fullData, c.fullLayout);
      if (index !== undefined && index !== menu.active) {
        menu.active = index;
        if (chart && menu._index >= 0) {
          const result = chart.relayout(
            { [`updatemenus[${menu._index}].active`]: index },
            { gui: true },
          );
          if (result instanceof Promise) fireAndForget(result);
        }
      }
    });
    for (const key of [...observers.keys()]) if (key >= list.length) observers.delete(key);

    if (shown.length === 0) {
      unmount();
      return;
    }
    root ??= mount(chart.element);
    const next: MenuDom[] = [];
    for (const { menu, position } of shown) {
      const layout = layoutUpdatemenu(menu, measure);
      let m = menus.find((d) => d.position === position);
      if (!m) {
        const el: HTMLDivElement = root.ownerDocument.createElement('div');
        el.className = 'hc-menu';
        m = {
          position,
          el,
          key: '',
          menu,
          layout,
          items: new Map(),
          order: [],
          open: false,
          cursor: 0,
        };
      }
      // Template-only menus (`_index: -1`) have no input item to store `active` in: keep it here.
      // Otherwise the click's GUI relayout has run by now and the layout holds it.
      if (m.pendingActive !== undefined) {
        if (menu._index < 0) menu.active = m.pendingActive;
        else m.pendingActive = undefined;
      }
      m.menu = menu;
      m.layout = layout;
      if (m.el.parentNode !== root) root.appendChild(m.el);
      next.push(m);
    }
    for (const m of menus) if (!next.includes(m)) m.el.remove();
    menus = next;

    for (const m of menus) {
      const key = menuKey(m.menu, m.layout);
      style(m);
      if (key !== m.key) {
        // A rebuild (new labels or metrics, e.g. once the font loads) while the list is open keeps
        // it open, focused and highlighted where it was, so keys pressed meanwhile aren't lost.
        const wasOpen = m.open;
        const listFocused =
          wasOpen && m.list !== undefined && m.el.ownerDocument.activeElement === m.list;
        const highlighted = m.order[m.cursor];
        build(m);
        m.key = key;
        if (wasOpen) {
          openList(m, listFocused);
          const at = highlighted === undefined ? -1 : m.order.indexOf(highlighted);
          if (at >= 0) highlight(m, at);
        }
      }
      const pos = placeUpdatemenu(
        m.menu,
        m.layout,
        { width: c.width, height: c.height },
        c.plotArea,
      );
      m.el.style.left = `${pos.left}px`;
      m.el.style.top = `${pos.top}px`;
      m.el.style.width = `${m.layout.width}px`;
      m.el.style.height = `${m.layout.height}px`;
      refreshStates(m);
    }
  };

  sync(ctx);

  return {
    update: (c) => sync(c),
    dispose() {
      unmount();
      disposed = true;
    },
    get root() {
      return root;
    },
    click(menu, button) {
      const m = menus.find((d) => d.position === menu);
      if (m) press(m, button);
    },
  };
}
