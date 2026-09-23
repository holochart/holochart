/**
 * The modebar component (plan E5.8): a DOM toolbar over the top-right corner of the chart with
 * download, drag-mode, zoom and reset buttons.
 *
 * It is plain DOM, not GPU text: real `<button>`s are focusable, keyboard-operable and announced
 * by screen readers for free. The view adds one absolutely positioned `div` to `chart.element`;
 * visibility (`displayModeBar: 'hover'`) is CSS driven by a class on that element and one shared
 * `<style>` element, so hovering costs no JavaScript.
 */
import { attr, isPlainObject, toRGBA, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import type {
  Chart,
  ComponentDrawContext,
  ComponentModule,
  ComponentUpdatePlan,
  ComponentView,
} from '@mk7s/holochart-runtime';
import { findChart, fireAndForget } from '../shared/host.ts';
import {
  MODEBAR_ZOOM_IN_FACTOR,
  MODEBAR_ZOOM_OUT_FACTOR,
  modebarAutoscaleUpdate,
  modebarAxisFixed,
  modebarDownloadImage,
  modebarResetUpdate,
  modebarSpikelinesState,
  modebarSpikelinesUpdate,
  modebarZoomUpdate,
  recordModebarResetState,
  type ModebarAxisLike,
  type ModebarLayoutUpdate,
  type ModebarResetState,
} from './actions.ts';
import {
  modebarButtonActive,
  modebarButtonsKey,
  resolveModebarButtons,
  type ModebarActiveState,
  type ModebarButton,
  type ModebarButtonGroup,
} from './buttons.ts';
import type { ModebarIcon } from './icons.ts';

// ---- Layout attributes ------------------------------------------------------------------------

/** `layout.modebar` (Plotly-compatible). */
export const modebarLayoutSchema = attr.object(
  {
    orientation: attr.enumerated({
      values: ['h', 'v'],
      dflt: 'h',
      description: 'Lay the buttons out horizontally (`h`) or vertically (`v`).',
    }),
    bgcolor: attr.color({
      description: 'Background of the button groups. Default: `paper_bgcolor` at half opacity.',
    }),
    color: attr.color({
      description: 'Icon color. Default: `layout.font.color` at 0.3 opacity.',
    }),
    activecolor: attr.color({
      description:
        'Icon color of pressed and hovered buttons. Default: `layout.font.color` at 0.7 opacity.',
    }),
    add: attr.infoArray({
      items: attr.string(),
      freeLength: true,
      dflt: [],
      description:
        'Names of built-in buttons to add (e.g. `hoverclosest`, `hovercompare`, `v1hovermode`, `togglespikelines`).',
    }),
    remove: attr.infoArray({
      items: attr.string(),
      freeLength: true,
      dflt: [],
      description:
        'Names of buttons to remove (e.g. `zoom`, `pan`, `select`, `lasso`, `zoomin`, `zoomout`, `autoscale`, `resetscale`, `toimage`), case-insensitive.',
    }),
    uirevision: attr.any({
      description:
        'Keeps user-driven modebar changes across `react` while unchanged. Accepted for Plotly compatibility; the modebar has no state of its own yet.',
    }),
  },
  { editType: 'modebar', description: 'The modebar: toolbar with zoom, pan, select and export.' },
);

/** Color `css` with its alpha multiplied by `alpha`, as `rgba()`; `undefined` if invalid. */
function withAlpha(css: unknown, alpha: number): string | undefined {
  if (typeof css !== 'string') return undefined;
  const c = toRGBA(css);
  if (!c) return undefined;
  const [r, g, b, a] = c;
  const ch = (v: number): number => Math.round(v * 255);
  return `rgba(${ch(r)}, ${ch(g)}, ${ch(b)}, ${Math.round(a * alpha * 1000) / 1000})`;
}

/**
 * Derive the modebar colors Plotly derives: `bgcolor` from `paper_bgcolor` at 0.5 opacity,
 * `color` / `activecolor` from `layout.font.color` at 0.3 / 0.7. Alphas multiply the source alpha
 * (a transparent paper gives a transparent modebar, where Plotly would give 50% black). Only unset
 * values are filled, so running it twice changes nothing.
 */
export function supplyModebarDefaults(
  _layoutIn: Readonly<Record<string, unknown>>,
  layoutOut: FullLayout,
): void {
  const existing = layoutOut['modebar'];
  const modebar: Record<string, unknown> = isPlainObject(existing)
    ? existing
    : { orientation: 'h' };
  layoutOut['modebar'] = modebar;
  const font = isPlainObject(layoutOut.font) ? layoutOut.font['color'] : undefined;
  modebar['bgcolor'] ??= withAlpha(layoutOut.paper_bgcolor, 0.5) ?? 'rgba(255, 255, 255, 0.5)';
  modebar['color'] ??= withAlpha(font, 0.3) ?? 'rgba(68, 68, 68, 0.3)';
  modebar['activecolor'] ??= withAlpha(font, 0.7) ?? 'rgba(68, 68, 68, 0.7)';
}

// ---- Styles -----------------------------------------------------------------------------------

const STYLE_ID = 'hc-modebar-style';
const HOST = 'hc-modebar-host';
const HOST_HOVER = 'hc-modebar-host--hover';

/**
 * Shared by every modebar in a document (or shadow root). `'hover'` mode hides the toolbar with
 * opacity (not `display`) so its buttons stay in the tab order; it shows while the chart is
 * hovered, and while a button has keyboard focus (`:focus-visible`, so a mouse click does not pin
 * it open; `:focus-within` where `:has()` is unsupported). Touch screens without hover always
 * show it.
 */
const CSS = `
.hc-modebar{position:absolute;top:2px;right:2px;z-index:1001;display:flex;flex-direction:row;align-items:flex-start;gap:4px;line-height:0;opacity:1;transition:opacity .3s ease}
.hc-modebar[aria-orientation="vertical"]{flex-direction:column;align-items:flex-end}
.hc-modebar-group{display:flex;flex-direction:row;padding:1px;border-radius:3px;background:var(--hc-modebar-bg)}
.hc-modebar[aria-orientation="vertical"] .hc-modebar-group{flex-direction:column}
.hc-modebar-btn{-webkit-appearance:none;appearance:none;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:24px;height:24px;margin:0;padding:4px;border:0;border-radius:2px;background:transparent;color:var(--hc-modebar-color);cursor:pointer;font:inherit}
.hc-modebar-btn:hover,.hc-modebar-btn[aria-pressed="true"]{color:var(--hc-modebar-active)}
.hc-modebar-btn:focus-visible{outline:2px solid var(--hc-modebar-active);outline-offset:-2px}
.hc-modebar-btn svg{display:block;width:16px;height:16px;pointer-events:none}
.hc-modebar-btn .hc-modebar-icon{display:block;width:16px;height:16px;pointer-events:none}
.hc-modebar-btn .hc-modebar-icon svg{width:100%;height:100%}
.${HOST_HOVER} .hc-modebar{opacity:0;pointer-events:none}
.${HOST_HOVER}:hover .hc-modebar{opacity:1;pointer-events:auto}
@supports selector(:has(*)){.${HOST_HOVER} .hc-modebar:has(:focus-visible){opacity:1;pointer-events:auto}}
@supports not selector(:has(*)){.${HOST_HOVER} .hc-modebar:focus-within{opacity:1;pointer-events:auto}}
@media (hover:none){.${HOST_HOVER} .hc-modebar{opacity:1;pointer-events:auto}}
@media (prefers-reduced-motion:reduce){.hc-modebar{transition:none}}
`;

function ensureStyle(el: HTMLElement): void {
  const doc = el.ownerDocument;
  const root = el.getRootNode();
  // Styles in `document.head` do not reach into a shadow root: inject into the root instead.
  const inShadow = typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot;
  const scope: Document | ShadowRoot = inShadow ? root : doc;
  if (scope.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  if (inShadow) root.appendChild(style);
  else (doc.head ?? doc.documentElement).appendChild(style);
}

// ---- Icons ------------------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

function iconElement(doc: Document, icon: ModebarIcon): Element {
  if ('svg' in icon) {
    // Trusted developer config (like the button's `click`): inserted as markup.
    const span = doc.createElement('span');
    span.className = 'hc-modebar-icon';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = icon.svg;
    return span;
  }
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'currentColor');
  const addPath = (d: string, transform?: string): void => {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill-rule', 'evenodd');
    if (transform !== undefined) path.setAttribute('transform', transform);
    svg.appendChild(path);
  };
  if ('paths' in icon) {
    svg.setAttribute('viewBox', icon.viewBox ?? '0 0 24 24');
    for (const d of icon.paths) addPath(d);
  } else {
    svg.setAttribute('viewBox', `0 0 ${icon.width ?? 1000} ${icon.height ?? 1000}`);
    addPath(icon.path, icon.transform);
  }
  return svg;
}

// ---- View -------------------------------------------------------------------------------------

/** The parts of a {@link Chart} the modebar uses (the view factory takes this for testability). */
export interface ModebarChartLike {
  readonly element: HTMLElement;
  /** The user's input layout (for "Reset axes"). */
  readonly layout: Readonly<Record<string, unknown>>;
  readonly fullConfig:
    | {
        readonly displayModeBar?: unknown;
        readonly staticPlot?: unknown;
        readonly modeBarButtonsToRemove?: unknown;
        readonly modeBarButtonsToAdd?: unknown;
        readonly toImageButtonOptions?: { readonly filename?: unknown };
      }
    | undefined;
  /** Cartesian axes, read at click time (current ranges). */
  readonly axes: ReadonlyMap<string, ModebarAxisLike>;
  relayout(update: ModebarLayoutUpdate): Promise<unknown>;
  readonly three: {
    readonly renderer: { readonly domElement: HTMLCanvasElement };
    readonly root: { renderNow(): void };
  };
}

/** What the view reads from the component draw context. */
export type ModebarViewContext = Pick<ComponentDrawContext, 'fullLayout' | 'fullData' | 'axes'>;

/** Options of {@link createModebarView}. */
export interface ModebarViewOptions<Ctx extends ModebarViewContext> {
  /** Retry finding the chart on updates while it is unknown (e.g. created before being attached). */
  readonly locate?: (ctx: Ctx) => ModebarChartLike | undefined;
  /** Warnings (unknown button names, …). Default `console.warn`. */
  readonly warn?: (message: string) => void;
}

/** A modebar view; `toolbar` is the mounted toolbar element, if any (for tests and debugging). */
export interface ModebarView<Ctx extends ModebarViewContext> {
  update(ctx: Ctx, plan?: ComponentUpdatePlan): void;
  dispose(): void;
  readonly toolbar: HTMLElement | undefined;
}

interface ModebarStyle {
  readonly orientation: 'h' | 'v';
  readonly bgcolor: string;
  readonly color: string;
  readonly activecolor: string;
}

function modebarStyle(fullLayout: FullLayout): ModebarStyle {
  const mb = isPlainObject(fullLayout['modebar']) ? fullLayout['modebar'] : {};
  const str = (v: unknown, dflt: string): string => (typeof v === 'string' ? v : dflt);
  return {
    orientation: mb['orientation'] === 'v' ? 'v' : 'h',
    bgcolor: str(mb['bgcolor'], 'rgba(255, 255, 255, 0.5)'),
    color: str(mb['color'], 'rgba(68, 68, 68, 0.3)'),
    activecolor: str(mb['activecolor'], 'rgba(68, 68, 68, 0.7)'),
  };
}

function hasSelectable(fullData: readonly FullTrace[]): boolean {
  return fullData.some((t) => t.visible === true && typeof t._module?.selectPoints === 'function');
}

/** Stop pointer events on the toolbar from reaching the chart's own drag/zoom/double-click. */
const SHIELDED_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'dblclick'] as const;
const stop = (event: Event): void => event.stopPropagation();

/**
 * Create a modebar view for `chart` (the component's `draw.create` finds the chart and calls
 * this). With no chart the view does nothing until `options.locate` finds one.
 *
 * `update` is cheap: it re-resolves the button set (a few small arrays) and rebuilds the button
 * DOM only when the set changed; otherwise it only refreshes pressed states, orientation and
 * colors. `displayModeBar: false` or `staticPlot: true` removes all DOM.
 */
export function createModebarView<Ctx extends ModebarViewContext>(
  initialChart: ModebarChartLike | undefined,
  ctx: Ctx,
  options: ModebarViewOptions<Ctx> = {},
): ModebarView<Ctx> {
  let chart = initialChart;
  let resetState: ModebarResetState | undefined = chart && recordModebarResetState(chart.layout);
  let last: Ctx = ctx;
  let toolbar: HTMLDivElement | undefined;
  let key: string | undefined;
  let customs: readonly unknown[] = [];
  let buttons: { readonly el: HTMLButtonElement; readonly button: ModebarButton }[] = [];
  let focusIndex = 0;
  let appliedStyle: ModebarStyle | undefined;
  /** The host's inline `position` before we set `relative`, when we did. */
  let hostPosition: string | undefined;
  let disposed = false;

  const warned = new Set<string>();
  const warn = (message: string): void => {
    if (warned.has(message)) return;
    warned.add(message);
    (options.warn ?? ((m: string) => console.warn(m)))(message);
  };

  const relayout = (update: ModebarLayoutUpdate): void => {
    if (!chart || Object.keys(update).length === 0) return;
    fireAndForget(chart.relayout(update));
  };

  const axes = (): ModebarAxisLike[] => (chart ? [...chart.axes.values()] : []);

  const run = (button: ModebarButton, event: MouseEvent): void => {
    if (!chart) return;
    if (button.custom) {
      // Custom buttons are typed against the real Chart; the view is only ever given one
      // outside of tests.
      button.custom.click(chart as unknown as Chart, event);
      return;
    }
    const fl = last.fullLayout;
    switch (button.builtin) {
      case 'toImage':
        modebarDownloadImage(chart);
        return;
      case 'zoom2d':
      case 'pan2d':
      case 'select2d':
      case 'lasso2d':
        if (fl.dragmode !== button.dragmode) relayout({ dragmode: button.dragmode });
        return;
      case 'hoverClosestCartesian':
      case 'hoverCompareCartesian':
        if (fl.hovermode !== button.hovermode) relayout({ hovermode: button.hovermode });
        return;
      case 'zoomIn2d':
        relayout(modebarZoomUpdate(axes(), MODEBAR_ZOOM_IN_FACTOR));
        return;
      case 'zoomOut2d':
        relayout(modebarZoomUpdate(axes(), MODEBAR_ZOOM_OUT_FACTOR));
        return;
      case 'autoScale2d':
        relayout(modebarAutoscaleUpdate(axes()));
        return;
      case 'resetScale2d':
        relayout(modebarResetUpdate(axes(), resetState ?? new Map(), chart.layout));
        return;
      case 'toggleSpikelines': {
        const update = modebarSpikelinesUpdate(axes());
        if (Object.keys(update).length === 0) {
          warn('[holochart] toggleSpikelines: axes have no `showspikes` attribute yet; ignored.');
        }
        relayout(update);
        return;
      }
      default:
        return;
    }
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const el = target.closest('button');
    const entry = buttons.find((b) => b.el === el);
    if (entry) run(entry.button, event);
  };

  const focusButton = (index: number): void => {
    const n = buttons.length;
    if (n === 0) return;
    focusIndex = ((index % n) + n) % n;
    buttons.forEach((b, i) => (b.el.tabIndex = i === focusIndex ? 0 : -1));
    buttons[focusIndex]?.el.focus();
  };

  // Toolbar pattern (WAI-ARIA APG): one tab stop, arrow keys move between buttons.
  const onKeydown = (event: KeyboardEvent): void => {
    const vertical = toolbar?.getAttribute('aria-orientation') === 'vertical';
    const next = vertical ? 'ArrowDown' : 'ArrowRight';
    const prev = vertical ? 'ArrowUp' : 'ArrowLeft';
    let index: number | undefined;
    if (event.key === next) index = focusIndex + 1;
    else if (event.key === prev) index = focusIndex - 1;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = buttons.length - 1;
    if (index === undefined) return;
    event.preventDefault();
    focusButton(index);
  };

  const onFocusin = (event: FocusEvent): void => {
    const i = buttons.findIndex((b) => b.el === event.target);
    if (i < 0 || i === focusIndex) return;
    focusIndex = i;
    buttons.forEach((b, j) => (b.el.tabIndex = j === i ? 0 : -1));
  };

  const mount = (host: HTMLElement): HTMLDivElement => {
    ensureStyle(host);
    const doc = host.ownerDocument;
    const view = doc.defaultView;
    const position = view ? view.getComputedStyle(host).position : '';
    // The toolbar is absolutely positioned against the chart element.
    if (position === 'static' || position === '') {
      hostPosition = host.style.position;
      host.style.position = 'relative';
    }
    host.classList.add(HOST);
    const bar = doc.createElement('div');
    bar.className = 'hc-modebar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Chart toolbar');
    bar.addEventListener('click', onClick);
    bar.addEventListener('keydown', onKeydown);
    bar.addEventListener('focusin', onFocusin);
    for (const type of SHIELDED_EVENTS) bar.addEventListener(type, stop);
    host.appendChild(bar);
    return bar;
  };

  const unmount = (): void => {
    if (!toolbar) return;
    toolbar.removeEventListener('click', onClick);
    toolbar.removeEventListener('keydown', onKeydown);
    toolbar.removeEventListener('focusin', onFocusin);
    for (const type of SHIELDED_EVENTS) toolbar.removeEventListener(type, stop);
    toolbar.remove();
    toolbar = undefined;
    key = undefined;
    customs = [];
    buttons = [];
    appliedStyle = undefined;
    if (chart) {
      const host = chart.element;
      host.classList.remove(HOST, HOST_HOVER);
      if (hostPosition !== undefined) host.style.position = hostPosition;
    }
    hostPosition = undefined;
  };

  const build = (bar: HTMLDivElement, groups: readonly ModebarButtonGroup[]): void => {
    const doc = bar.ownerDocument;
    const hadFocus = bar.contains(doc.activeElement);
    bar.replaceChildren();
    buttons = [];
    for (const group of groups) {
      const g = doc.createElement('div');
      g.className = 'hc-modebar-group';
      for (const button of group) {
        const el = doc.createElement('button');
        el.type = 'button';
        el.className = 'hc-modebar-btn';
        el.title = button.title;
        el.setAttribute('aria-label', button.title);
        el.dataset['button'] = button.name;
        el.tabIndex = -1;
        el.appendChild(iconElement(doc, button.icon));
        g.appendChild(el);
        buttons.push({ el, button });
      }
      bar.appendChild(g);
    }
    focusIndex = Math.min(focusIndex, Math.max(0, buttons.length - 1));
    const current = buttons[focusIndex];
    if (current) current.el.tabIndex = 0;
    if (hadFocus) current?.el.focus();
  };

  const refresh = (bar: HTMLDivElement, c: Ctx): void => {
    const style = modebarStyle(c.fullLayout);
    const prev = appliedStyle;
    if (prev?.orientation !== style.orientation) {
      bar.setAttribute('aria-orientation', style.orientation === 'v' ? 'vertical' : 'horizontal');
    }
    if (prev?.bgcolor !== style.bgcolor) bar.style.setProperty('--hc-modebar-bg', style.bgcolor);
    if (prev?.color !== style.color) bar.style.setProperty('--hc-modebar-color', style.color);
    if (prev?.activecolor !== style.activecolor) {
      bar.style.setProperty('--hc-modebar-active', style.activecolor);
    }
    appliedStyle = style;

    const state: ModebarActiveState = {
      dragmode: c.fullLayout.dragmode,
      hovermode: c.fullLayout.hovermode,
      spikelines: modebarSpikelinesState(c.axes.values()).on,
    };
    for (const { el, button } of buttons) {
      const active = modebarButtonActive(button, state);
      if (active === undefined) continue;
      const value = active ? 'true' : 'false';
      if (el.getAttribute('aria-pressed') !== value) el.setAttribute('aria-pressed', value);
    }
  };

  const sync = (c: Ctx): void => {
    if (disposed) return;
    last = c;
    if (!chart) {
      chart = options.locate?.(c);
      if (!chart) return;
      resetState = recordModebarResetState(chart.layout);
    }
    const config = chart.fullConfig;
    const display = config?.displayModeBar ?? 'hover';
    if (display === false || config?.staticPlot === true) {
      unmount();
      return;
    }
    toolbar ??= mount(chart.element);
    chart.element.classList.toggle(HOST_HOVER, display === 'hover');

    const axisList = [...c.axes.values()];
    const groups = resolveModebarButtons({
      config,
      layoutModebar: isPlainObject(c.fullLayout['modebar']) ? c.fullLayout['modebar'] : undefined,
      hasCartesian: axisList.length > 0,
      hasSelectable: hasSelectable(c.fullData),
      allAxesFixed: axisList.length > 0 && axisList.every(modebarAxisFixed),
      warn,
    });
    const nextKey = modebarButtonsKey(groups);
    const nextCustoms = groups.flatMap((g) => g.flatMap((b) => (b.custom ? [b.custom] : [])));
    const sameCustoms =
      nextCustoms.length === customs.length && nextCustoms.every((b, i) => b === customs[i]);
    if (nextKey !== key || !sameCustoms) {
      build(toolbar, groups);
      key = nextKey;
      customs = nextCustoms;
    }
    refresh(toolbar, c);
  };

  sync(ctx);

  return {
    update: (c) => sync(c),
    dispose() {
      unmount();
      disposed = true;
    },
    get toolbar() {
      return toolbar;
    },
  };
}

// ---- Component --------------------------------------------------------------------------------

/**
 * The modebar component (plan E5.8): `layout.modebar` attributes and the DOM toolbar. Buttons act
 * through `chart.relayout` (drag mode, hover mode, zoom, autoscale, reset) or download a PNG;
 * custom buttons come from `config.modeBarButtonsToAdd`.
 */
export const modebarComponent: ComponentModule = {
  name: 'modebar',
  order: 100,
  layoutSchema: { modebar: modebarLayoutSchema },
  supplyLayoutDefaults: supplyModebarDefaults,
  draw: {
    create(ctx: ComponentDrawContext): ComponentView {
      return createModebarView(findChart(ctx), ctx, { locate: findChart });
    },
  },
};
