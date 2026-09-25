/**
 * The range selector's view (plan E5.9, Plotly's `xaxis.rangeselector`): preset range buttons
 * ("1m", "6m", "YTD", "all") above a date x axis. A click relayouts the axis range (`step.ts`);
 * the button whose range is in view is shown pressed. The component (`component.ts`) loads this
 * module the first time an x axis shows a range selector (`shared/lazy-view.ts`).
 *
 * Like the modebar it is plain DOM: one absolutely positioned `role="group"` per axis inside
 * `chart.element`, holding real `<button>`s (Tab to focus, Enter / Space to press, `aria-pressed`
 * for the active one). Colors come from CSS custom properties per group and one shared stylesheet;
 * hover is pure CSS. Pointer presses are shielded so they never start a zoom or pan.
 *
 * Deviations from Plotly: labels are plain text (pseudo-HTML tags are removed, not styled); a
 * button's border straddles its box like Plotly's SVG stroke; with `staticPlot` the buttons are
 * drawn (as Plotly does) but `disabled`, so they neither react nor take focus.
 */
import { isPlainObject } from '@mk7s/holochart-core';
import type { ViewportRect } from '@mk7s/holochart-render';
import type { ComponentUpdatePlan } from '@mk7s/holochart-runtime';
import { applyDomFont, claimPositionedHost, ensureStyle, shieldEvents } from '../shared/dom.ts';
import { fireAndForget } from '../shared/host.ts';
import { oracleMeasure, plainText, type MeasureLine } from '../shared/text.ts';
import {
  layoutRangeselector,
  readRangeselector,
  type FullRangeselector,
  type RangeselectorLayout,
} from './layout.ts';
import {
  buttonDescription,
  rangeselectorIsActive,
  rangeselectorUpdate,
  type RangeselectorAxisLike,
  type RangeselectorButton,
} from './step.ts';

// ---- Styles -----------------------------------------------------------------------------------

const STYLE_ID = 'hc-rangeselector-style';
const ACTIVE = 'hc-rangeselector-btn--active';

/** Below the modebar (z-index 1001), like the update menus and sliders. */
const CSS = `
.hc-rangeselector{position:absolute;z-index:1000;margin:0;padding:0;pointer-events:none}
.hc-rangeselector-btn{-webkit-appearance:none;appearance:none;position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;margin:0;padding:0;border:var(--hc-rs-border);border-radius:3px;background:var(--hc-rs-bg);color:inherit;font:inherit;line-height:inherit;text-align:center;white-space:pre;overflow:hidden;cursor:pointer;pointer-events:auto;user-select:none;-webkit-user-select:none;touch-action:manipulation}
.hc-rangeselector-btn:hover:not(:disabled),.hc-rangeselector-btn.${ACTIVE}{background:var(--hc-rs-active)}
.hc-rangeselector-btn:focus-visible{outline:2px solid var(--hc-rs-focus);outline-offset:1px}
.hc-rangeselector-btn:disabled{cursor:default}
`;

// ---- View -------------------------------------------------------------------------------------

/** The parts of a `Chart` the range selector uses (the view factory takes this for testability). */
export interface RangeselectorChartLike {
  readonly element: HTMLElement;
  readonly fullConfig: { readonly staticPlot?: unknown } | undefined;
  relayout(update: Record<string, unknown>, options?: { gui?: boolean }): Promise<unknown>;
}

/** The parts of an `AxisInfo` the view reads. */
export interface RangeselectorViewAxis extends RangeselectorAxisLike {
  readonly id: string;
  readonly letter: 'x' | 'y';
  readonly full: {
    readonly autorange?: unknown;
    readonly rangeselector?: unknown;
    readonly title?: unknown;
  };
}

/** What the view reads from the component draw context. */
export interface RangeselectorViewContext {
  readonly axes: ReadonlyMap<string, RangeselectorViewAxis>;
  readonly plotArea: Readonly<ViewportRect>;
  readonly fullConfig?: { readonly staticPlot?: unknown } | undefined;
}

/** Options of {@link createRangeselectorView}. */
export interface RangeselectorViewOptions<Ctx extends RangeselectorViewContext> {
  /** Retry finding the chart on updates while it is unknown. */
  readonly locate?: (ctx: Ctx) => RangeselectorChartLike | undefined;
  /** Text measure (default: the shared font-metrics oracle). */
  readonly measure?: MeasureLine;
}

/** A range selector view; `groups` are the mounted per-axis groups by axis id (for tests). */
export interface RangeselectorView<Ctx extends RangeselectorViewContext> {
  update(ctx: Ctx, plan?: ComponentUpdatePlan): void;
  dispose(): void;
  readonly groups: ReadonlyMap<string, HTMLElement>;
}

interface ButtonEntry {
  readonly el: HTMLButtonElement;
  button: RangeselectorButton;
}

interface Group {
  readonly el: HTMLDivElement;
  key: string | undefined;
  buttons: ButtonEntry[];
  left: number | undefined;
  top: number | undefined;
  label: string | undefined;
}

/** The axis title as plain text, if any. */
function axisTitle(full: RangeselectorViewAxis['full']): string {
  const title = full.title;
  const text = isPlainObject(title) ? title['text'] : title;
  return typeof text === 'string' ? plainText(text).replace(/\s+/g, ' ').trim() : '';
}

function groupLabel(axis: RangeselectorViewAxis): string {
  const title = axisTitle(axis.full);
  if (title !== '') return `Range selector: ${title}`;
  return axis.id === 'x' ? 'Range selector' : `Range selector (${axis.id})`;
}

/**
 * The accessible name: the visible label first (WCAG 2.5.3, "label in name"), then the range it
 * sets unless the label says just that.
 */
function accessibleName(label: string, span: string): string {
  const text = label.replace(/\s+/g, ' ').trim();
  if (text === '' || text.toLowerCase() === span.toLowerCase()) return span;
  return `${text} (${span})`;
}

/** Rebuild key: everything drawn except the group's position and the pressed states. */
function groupKey(selector: FullRangeselector, layout: RangeselectorLayout, disabled: boolean) {
  return JSON.stringify([
    disabled,
    selector.font,
    selector.bgcolor,
    selector.activecolor,
    selector.bordercolor,
    selector.borderwidth,
    layout.width,
    layout.height,
    layout.buttons.map((b) => [
      b.label,
      b.button.step,
      b.button.stepmode,
      b.button.count,
      b.left,
      b.top,
      b.width,
      b.height,
    ]),
  ]);
}

/**
 * Create a range selector view for `chart` (the component's `draw.create` finds the chart). With
 * no chart the view does nothing until `options.locate` finds one.
 *
 * `update` is cheap: it re-places each axis' selector (measurements are cached per defaulted
 * selector object), rebuilds a group's buttons only when their labels, sizes or styles changed,
 * and recomputes the pressed state on every update, previews included, so it follows zooms and
 * pans. Axes without a visible selector have no DOM; with none left the host claim is released.
 */
export function createRangeselectorView<Ctx extends RangeselectorViewContext>(
  initialChart: RangeselectorChartLike | undefined,
  ctx: Ctx,
  options: RangeselectorViewOptions<Ctx> = {},
): RangeselectorView<Ctx> {
  let chart = initialChart;
  let last: Ctx = ctx;
  const groups = new Map<string, Group>();
  const elements = new Map<string, HTMLElement>();
  const unshields = new Map<string, () => void>();
  const measure = options.measure ?? oracleMeasure;
  /** Layout per defaulted selector object and plot area (re-measured when either changes). */
  const layouts = new WeakMap<object, { area: string; layout: RangeselectorLayout }>();
  let releaseHost: (() => void) | undefined;
  let disposed = false;

  const click = (axisId: string, entry: ButtonEntry): void => {
    if (!chart || entry.el.disabled) return;
    // The axis as of the latest update: its current range is the end of the new one.
    const axis = last.axes.get(axisId);
    if (!axis) return;
    const update = rangeselectorUpdate(axis, entry.button);
    if (Object.keys(update).length === 0) return;
    fireAndForget(chart.relayout(update, { gui: true }));
  };

  const layoutOf = (
    raw: object,
    selector: FullRangeselector,
    plotArea: Readonly<ViewportRect>,
  ): RangeselectorLayout => {
    const area = `${plotArea.x},${plotArea.y},${plotArea.width},${plotArea.height}`;
    const cached = layouts.get(raw);
    if (cached?.area === area) return cached.layout;
    const layout = layoutRangeselector(selector, plotArea, measure);
    layouts.set(raw, { area, layout });
    return layout;
  };

  const removeGroup = (id: string): void => {
    const g = groups.get(id);
    if (!g) return;
    unshields.get(id)?.();
    unshields.delete(id);
    g.el.remove();
    groups.delete(id);
    elements.delete(id);
  };

  const unmountAll = (): void => {
    for (const id of [...groups.keys()]) removeGroup(id);
    releaseHost?.();
    releaseHost = undefined;
  };

  const mountGroup = (host: HTMLElement, id: string): Group => {
    ensureStyle(host, STYLE_ID, CSS);
    releaseHost ??= claimPositionedHost(host);
    const el = host.ownerDocument.createElement('div');
    el.className = 'hc-rangeselector';
    el.setAttribute('role', 'group');
    el.dataset['axis'] = id;
    unshields.set(id, shieldEvents(el));
    host.appendChild(el);
    const group: Group = {
      el,
      key: undefined,
      buttons: [],
      left: undefined,
      top: undefined,
      label: undefined,
    };
    groups.set(id, group);
    elements.set(id, el);
    return group;
  };

  const build = (
    group: Group,
    axisId: string,
    selector: FullRangeselector,
    layout: RangeselectorLayout,
    disabled: boolean,
  ): void => {
    const el = group.el;
    const doc = el.ownerDocument;
    const focused = group.buttons.findIndex((b) => b.el === doc.activeElement);
    el.replaceChildren();
    applyDomFont(el, selector.font);
    const bw = selector.borderwidth;
    el.style.width = `${layout.width}px`;
    el.style.height = `${layout.height}px`;
    el.style.setProperty('--hc-rs-bg', selector.bgcolor);
    el.style.setProperty('--hc-rs-active', selector.activecolor);
    el.style.setProperty('--hc-rs-focus', selector.font.color);
    el.style.setProperty(
      '--hc-rs-border',
      bw > 0 ? `${bw}px solid ${selector.bordercolor}` : 'none',
    );
    group.buttons = layout.buttons.map((box) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'hc-rangeselector-btn';
      b.textContent = box.label;
      const span = buttonDescription(box.button);
      b.title = span;
      b.setAttribute('aria-label', accessibleName(box.label, span));
      b.setAttribute('aria-pressed', 'false');
      b.disabled = disabled;
      // The border straddles the box edge, like Plotly's SVG stroke.
      const s = b.style;
      s.left = `${box.left - bw / 2}px`;
      s.top = `${box.top - bw / 2}px`;
      s.width = `${box.width + bw}px`;
      s.height = `${box.height + bw}px`;
      const entry: ButtonEntry = { el: b, button: box.button };
      b.addEventListener('click', () => click(axisId, entry));
      el.appendChild(b);
      return entry;
    });
    if (focused >= 0) group.buttons[Math.min(focused, group.buttons.length - 1)]?.el.focus();
  };

  const refresh = (
    group: Group,
    axis: RangeselectorViewAxis,
    layout: RangeselectorLayout,
  ): void => {
    const el = group.el;
    if (group.left !== layout.left) el.style.left = `${layout.left}px`;
    if (group.top !== layout.top) el.style.top = `${layout.top}px`;
    group.left = layout.left;
    group.top = layout.top;
    const label = groupLabel(axis);
    if (group.label !== label) el.setAttribute('aria-label', label);
    group.label = label;
    group.buttons.forEach((entry, i) => {
      const box = layout.buttons[i];
      if (box) entry.button = box.button;
      const active = rangeselectorIsActive(axis, entry.button);
      const value = active ? 'true' : 'false';
      if (entry.el.getAttribute('aria-pressed') !== value) {
        entry.el.setAttribute('aria-pressed', value);
      }
      entry.el.classList.toggle(ACTIVE, active);
    });
  };

  const sync = (c: Ctx): void => {
    if (disposed) return;
    last = c;
    chart ??= options.locate?.(c);
    if (!chart) return;
    const staticPlot = (c.fullConfig ?? chart.fullConfig)?.staticPlot === true;
    const seen = new Set<string>();
    for (const axis of c.axes.values()) {
      if (axis.letter !== 'x') continue;
      const selector = readRangeselector(axis.full);
      if (!selector) continue;
      const raw = axis.full.rangeselector as object;
      const layout = layoutOf(raw, selector, c.plotArea);
      if (layout.buttons.length === 0) continue;
      seen.add(axis.id);
      const group = groups.get(axis.id) ?? mountGroup(chart.element, axis.id);
      const key = groupKey(selector, layout, staticPlot);
      if (group.key !== key) {
        build(group, axis.id, selector, layout, staticPlot);
        group.key = key;
      }
      refresh(group, axis, layout);
    }
    for (const id of [...groups.keys()]) if (!seen.has(id)) removeGroup(id);
    if (groups.size === 0) unmountAll();
  };

  sync(ctx);

  return {
    update: (c) => sync(c),
    dispose() {
      unmountAll();
      disposed = true;
    },
    groups: elements,
  };
}

// The component (in `component.ts`, which loads this view on first use), for existing imports.
export { rangeselectorComponent, rangeselectorMarginPushes } from './component.ts';
