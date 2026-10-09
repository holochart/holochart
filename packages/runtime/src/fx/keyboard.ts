/**
 * Keyboard navigation of a chart's data (plan E6.5): a virtual cursor moves between points, shows
 * their hover label and announces them in a polite live region; keys zoom, pan and reset the view
 * through the same GUI relayout as drags. Loaded the first time the chart's focus target
 * (`focus.ts`) gets focus; keys reach it only while that target has focus, never while a control
 * inside the chart (legend item, menu, slider, modebar) has it.
 *
 * ## Keys
 *
 * | Key                         | Action                                                        |
 * | --------------------------- | ------------------------------------------------------------- |
 * | ← / →                       | previous / next point of the trace                            |
 * | ↑ / ↓                       | the next trace up / down at this position (see below)         |
 * | Page Up / Page Down         | previous / next trace, in legend order                        |
 * | Home / End                  | first / last point of the trace                               |
 * | Enter / Space               | `click` on the point (Shift toggles it with `clickmode` select) |
 * | Escape                      | clear the cursor and its label                                |
 * | `+` (`=`) / `-` (`_`)       | zoom in / out around the cursor (the plot center without one) |
 * | Shift + arrows              | pan by a tenth of the range                                   |
 * | `0`                         | reset the view like a double-click (`config.doubleClick`)     |
 *
 * Keys with Ctrl, Alt or Meta are left to the browser (Ctrl + `+` zooms the page).
 *
 * ## Cursor rules
 *
 * - The navigable traces are the visible, hoverable ones (not `hoverinfo: 'skip'`), in legend
 *   order (`legendrank`, then trace order; reversed with a `reversed` `legend.traceorder`):
 *   cartesian traces, and the traces whose module lists its stops (`keyboardPoints`, which may
 *   load on first use: `TraceModule.a11y`).
 * - A cartesian trace's points are its data points ordered along its position axis: x, or y for
 *   horizontal traces (`orientation: 'h'`), where ↑ / ↓ step through the points and ← / → move
 *   between traces instead. Only points whose position is inside the axis range are visited, so
 *   after a zoom the cursor stays in view. A cartesian module's own stops (histogram bins, the
 *   statistics of each box or violin) are ordered and visited the same way, by their anchors.
 * - Other stops follow `keyboardPoints`: ← / ↑ the previous stop and → / ↓ the next (pie,
 *   funnelarea, scatter3d, polar traces), unless the stop says where its arrows lead
 *   (`KeyboardPoint.nav`) — hierarchies (sunburst, treemap, icicle: ← / → siblings, ↑ the parent,
 *   ↓ the first child), sankey (← / → the nodes or the links of a node, ↓ downstream, ↑ upstream),
 *   grids (heatmap and contour cells, parcoords lines × axes, parcats categories: ← / → columns,
 *   ↑ / ↓ rows).
 * - ↑ / ↓ go to the point, among the traces on the same subplot, nearest to the cursor's position
 *   whose label sits next above / below it on screen (ties in legend order) — through the lines or
 *   bars stacked at one x.
 * - Page Up / Page Down keep the position: the new trace's point nearest to the cursor on screen.
 * - The first key without a cursor starts at the first trace's first point (End: its last point).
 * - The cursor stays when the chart loses focus (its label hides) and after data or layout
 *   changes while its trace and point still exist; on a list of stops it follows its point (a
 *   hierarchy node keeps the cursor through a drill-down). Stops built on demand say where the
 *   cursor is among them now (`KeyboardStops.locate`: a `graph` node keeps the cursor through a
 *   fold, and when it is no longer drawn the cursor goes to a stop near it), or that it is
 *   nowhere: it then goes to the first stop. Those that cannot say keep the cursor's index.
 * - On a trace that is not on cartesian axes and handles view keys (`TraceA11y.keyboardView`: 3D
 *   scenes, maps), `+` / `-` move the camera in and out, Shift + arrows orbit it (a map pans or
 *   turns) and `0` resets it; the cursor's trace gets them, every such trace without a cursor.
 *
 * Not navigated: cartesian grid or aggregating traces without stops of their own, and 3D traces
 * other than scatter3d (their scenes still take the view keys).
 *
 * ## Announcements
 *
 * Each move announces the point like its hover label, in plain text: "Revenue: (Mar 1, 2024, 11),
 * point 3 of 6." (every label of a stop with several, and a label's secondary box when the trace
 * filled it: a sankey value). Zoom, pan, rotation and reset are announced briefly, or with the
 * sentence the trace has for its new view (`TraceA11y.keyboardViewSay`: a map says where it is
 * centered). Every text comes from {@link KEYBOARD_TEMPLATES}, from the stop (`KeyboardPoint.say`)
 * or from the trace, English sentences that are also their locale dictionary keys.
 *
 * ## Events
 *
 * Moving emits `hover` (without `event`, like `chart.hover`), Escape `unhover`, Enter `click` (and
 * `selected` with `clickmode: 'select'`) with the Plotly-shaped point and the `KeyboardEvent`.
 * Hierarchy nodes (sunburst, treemap, icicle) get the click their view handles (drill-down). The
 * view of a trace on cartesian axes gets the click of a stop that asks for it
 * (`KeyboardPoint.click`: a `graph` tree folds a node), and the stop is announced again when the
 * click changed what it says. Zoom, pan and reset emit `relayout` with the same keys as a drag
 * (`'xaxis.range[0]'`, …).
 */
import {
  getIn,
  isArrayLike,
  localize,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import type {
  AxisInfo,
  HoverPoint,
  HoverQuery,
  KeyboardPoint,
  KeyboardStops,
  SubplotInfo,
} from '../contracts.ts';
import type { ChartPoint } from '../events.ts';
import { a11yParts } from '../a11y/lazy.ts';
import { accessibleText, traceNameText, VISUALLY_HIDDEN } from '../a11y/text.ts';
import { limitRange, panBy, zoomAround, type LinearRange } from './geometry.ts';
import { anchorOf, buildPoint, labelText, type Found, type HoverEntry } from './hover.ts';
import type { InteractionHost } from './interaction.ts';
import { perPoint } from './point-values.ts';

/** What keyboard navigation needs from its chart. */
export interface KeyboardHost {
  /** The chart's interaction host: subplots, hover entries, settings, range commits, … */
  readonly fx: InteractionHost;
  /** Show the hover label of resolved points and emit `hover` (programmatic hover). */
  hover(found: readonly Found[]): void;
  /** Hide hover labels (emits `unhover` when something was hovered). */
  unhover(): void;
  /** Offer a click at a container point to trace `index`'s view; whether the view handled it. */
  clickTrace(index: number, x: number, y: number, event: KeyboardEvent): boolean;
  /** A GUI relayout (a view key on a trace that is not on cartesian axes: a 3D scene). */
  relayout(update: Readonly<Record<string, unknown>>): void;
}

/** What a key does (see the module comment). */
export type KeyAction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'prevTrace'
  | 'nextTrace'
  | 'first'
  | 'last'
  | 'click'
  | 'clear'
  | 'zoomIn'
  | 'zoomOut'
  | 'panLeft'
  | 'panRight'
  | 'panUp'
  | 'panDown'
  | 'reset';

/** The zoom factor of `+` (`-` zooms by its inverse). */
export const ZOOM_STEP = 0.8;
/** The share of the range Shift + arrow pans by. */
export const PAN_STEP = 0.1;

/**
 * The English announcements; each is also its own key in a locale dictionary (a translation keeps
 * the `{placeholders}`).
 */
export const KEYBOARD_TEMPLATES = {
  point: '{name}: {text}, point {n} of {count}.',
  empty: 'No data points to explore.',
  zoomIn: 'Zoomed in.',
  zoomOut: 'Zoomed out.',
  pan: 'Panned.',
  rotate: 'View rotated.',
  reset: 'View reset.',
} as const;

/** The arrows and Home / End, in the order of `KeyboardPoint.nav`. */
const NAV: readonly KeyAction[] = ['left', 'right', 'up', 'down', 'first', 'last'];

const ARROWS: Readonly<Record<string, KeyAction>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const PANS: Readonly<Record<string, KeyAction>> = {
  ArrowLeft: 'panLeft',
  ArrowRight: 'panRight',
  ArrowUp: 'panUp',
  ArrowDown: 'panDown',
};

const KEYS: Readonly<Record<string, KeyAction>> = {
  PageUp: 'prevTrace',
  PageDown: 'nextTrace',
  Home: 'first',
  End: 'last',
  Enter: 'click',
  ' ': 'click',
  Escape: 'clear',
  '+': 'zoomIn',
  '=': 'zoomIn',
  '-': 'zoomOut',
  _: 'zoomOut',
  '0': 'reset',
};

/** The action of a key press, or `undefined` for keys navigation leaves alone. */
export function keyAction(e: {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
}): KeyAction | undefined {
  if (e.ctrlKey || e.altKey || e.metaKey) return undefined;
  const arrow = e.shiftKey ? PANS[e.key] : ARROWS[e.key];
  return arrow ?? KEYS[e.key];
}

/** Indices of the finite values in ascending order (ties in index order). */
export function sortedOrder(values: ArrayLike<number>): number[] {
  const order: number[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) order.push(i);
  return order.sort((a, b) => (values[a] as number) - (values[b] as number) || a - b);
}

/**
 * The next item of `order` from position `at` in direction `dir` (±1) whose `ok` holds, or `at`
 * itself when there is none (the cursor stops at the ends).
 */
export function stepIndex(
  order: readonly number[],
  at: number,
  dir: 1 | -1,
  ok: (item: number) => boolean,
): number {
  for (let k = at + dir; k >= 0 && k < order.length; k += dir) {
    if (ok(order[k] as number)) return k;
  }
  return at;
}

/** The position in `order` of the item whose value is nearest to `target` (`order` ascending). */
export function nearestIndex(
  order: readonly number[],
  values: ArrayLike<number>,
  target: number,
  ok: (item: number) => boolean,
): number {
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < order.length; k++) {
    const item = order[k] as number;
    if (!ok(item)) continue;
    const d = Math.abs((values[item] as number) - target);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/**
 * A template of {@link KEYBOARD_TEMPLATES} (by key), or a stop's own English sentence, in the
 * chart's language, filled in.
 */
export function announce(
  fullLayout: FullLayout | undefined,
  template: string,
  values: Readonly<Record<string, string>> = {},
): string {
  const known = (KEYBOARD_TEMPLATES as Readonly<Record<string, string>>)[template];
  return localize(fullLayout, known ?? template).replace(
    /\{(\w+)\}/g,
    (match, key: string) => values[key] ?? match,
  );
}

/** The ranges of zooming `axes` by `factor` around container point `(cx, cy)`. */
export function zoomRanges(
  axes: readonly AxisInfo[],
  rect: { readonly x: number; readonly y: number; readonly height: number },
  cx: number,
  cy: number,
  factor: number,
  limits: (axis: AxisInfo) => readonly [number | undefined, number | undefined],
): Map<string, LinearRange> {
  const out = new Map<string, LinearRange>();
  for (const a of axes) {
    const p = a.letter === 'x' ? cx - rect.x : rect.y + rect.height - cy;
    const [lo, hi] = limits(a);
    const r = a.scale.range;
    out.set(a.id, limitRange(zoomAround([r[0], r[1]], a.scale.p2l(p), factor), lo, hi, false));
  }
  return out;
}

/**
 * The ranges of panning `axes` by `share` of their span: positive shows what lies right (x) or
 * above (y), whatever the axis direction.
 */
export function panRanges(
  axes: readonly AxisInfo[],
  share: number,
  limits: (axis: AxisInfo) => readonly [number | undefined, number | undefined],
): Map<string, LinearRange> {
  const out = new Map<string, LinearRange>();
  for (const a of axes) {
    const [r0, r1] = a.scale.range;
    const [lo, hi] = limits(a);
    out.set(a.id, limitRange(panBy([r0, r1], (r1 - r0) * share), lo, hi, true));
  }
  return out;
}

/** One navigable trace. */
interface NavTrace {
  readonly entry: HoverEntry;
  /** Position axis letter of a cartesian trace; `undefined` for domain traces. */
  readonly letter: 'x' | 'y' | undefined;
  /**
   * Items along the position axis (cartesian): data indices, or indices into `stops`. `undefined`
   * for stops visited in their own order (or through their `nav`).
   */
  readonly order: readonly number[] | undefined;
  /** Linear position per item of `order`. */
  readonly pos: Float64Array;
  /** The module's stops (`keyboardPoints`). */
  readonly stops: KeyboardStops | undefined;
  /** Items the cursor can be on. */
  readonly count: number;
}

/** The cursor: a trace and a position in its {@link NavTrace.order}, or the index of a stop. */
interface Cursor {
  trace: number;
  item: number;
}

/** Linear positions of a cartesian trace along `letter` (`x0` / `dx` when the array is absent). */
function positions(trace: FullTrace, letter: 'x' | 'y', axis: AxisInfo): Float64Array {
  const data = trace[letter];
  const array = isArrayLike(data) ? data : undefined;
  const length = trace['_length'];
  const n = typeof length === 'number' ? length : (array?.length ?? 0);
  const out = new Float64Array(n);
  if (array) {
    for (let i = 0; i < n; i++) out[i] = axis.scale.d2l(array[i]);
    return out;
  }
  const v0 = axis.scale.d2l(trace[`${letter}0`] ?? 0);
  const d = Number(trace[`d${letter}`] ?? 1);
  for (let i = 0; i < n; i++) out[i] = v0 + i * d;
  return out;
}

/** Traces in legend order: `legendrank`, then index; reversed with a `reversed` traceorder. */
function legendOrder(list: NavTrace[], fullLayout: FullLayout | undefined): NavTrace[] {
  const rank = (t: NavTrace): number => {
    const r = t.entry.trace['legendrank'];
    return typeof r === 'number' ? r : 1000;
  };
  list.sort((a, b) => rank(a) - rank(b) || a.entry.index - b.entry.index);
  const order = getIn(fullLayout, 'legend.traceorder');
  if (typeof order === 'string' && order.includes('reversed')) list.reverse();
  return list;
}

/** Keyboard navigation of one chart (see the module comment). */
export class KeyboardNav {
  readonly #target: HTMLElement;
  readonly #host: KeyboardHost;
  readonly #live: HTMLDivElement;
  #traces: NavTrace[] | undefined;
  #cursor: Cursor | undefined;
  /** The trace index (`curveNumber`) of the cursor, kept across list rebuilds. */
  #cursorIndex: number | undefined;
  /** Alternates a trailing space so a repeated announcement is read again. */
  #flip = false;
  /** The point shown last: the cursor follows it through a rebuild of its trace's stops. */
  #shown: HoverPoint | undefined;
  /**
   * What the cursor's stop said when Enter went to its trace's view (`KeyboardPoint.click`), until
   * the next pipeline run or key: the stop is announced again when the click changed that.
   */
  #clicked: string | undefined;
  /** Traces' accessibility parts on their way (`TraceModule.a11y`), and the keys waiting for them. */
  #loading: Promise<unknown> | undefined;
  readonly #queue: KeyboardEvent[] = [];

  /** Take over the focus target's keys (`queued`: pressed while this code was loading). */
  constructor(target: HTMLElement, host: KeyboardHost, queued: KeyboardEvent[] = []) {
    this.#target = target;
    this.#host = host;
    const live = target.ownerDocument.createElement('div');
    live.className = 'holochart-live';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    live.style.cssText = VISUALLY_HIDDEN;
    target.appendChild(live);
    this.#live = live;
    // The focus ring shows while the target has focus.
    const ring = (on: boolean) => (target.style.outlineWidth = on ? '2px' : '0');
    target.addEventListener('focus', () => ring(true));
    target.addEventListener('blur', () => {
      ring(false);
      this.blur();
    });
    target.addEventListener('keydown', (e) => this.key(e));
    ring(this.#focused());
    for (const e of queued.splice(0)) this.key(e);
  }

  /** Handle a key press on the focus target. */
  key(e: KeyboardEvent): void {
    const action = keyAction(e);
    if (!action) return;
    e.preventDefault();
    this.#clicked = undefined;
    this.#list();
    if (this.#loading) {
      this.#queue.push(e);
      return;
    }
    const { fx } = this.#host;
    if (action === 'click') this.#click(e);
    else if (action === 'clear') {
      this.#cursor = undefined;
      this.#host.unhover();
      this.#say('');
    } else if (!/^(zoom|pan|reset)/.test(action)) this.#move(action);
    else if (this.#view(action)) return;
    else if (action === 'reset') {
      const s = fx.settings();
      if (s.doubleClick === false || fx.subplots().length === 0) return;
      fx.resetView(s.doubleClick);
      this.#say(announce(fx.fullLayout(), action));
    } else this.#shift(action);
  }

  /** After a pipeline run: points may have moved or gone; re-show the cursor while focused. */
  refresh(): void {
    this.#traces = undefined;
    const clicked = this.#clicked;
    this.#clicked = undefined;
    if (!this.#cursor) return;
    const traces = this.#list();
    const cursor = this.#cursor;
    const t = traces[cursor.trace];
    const was = this.#shown;
    if (t && !t.order && was && Array.isArray(t.stops)) {
      const k = (t.stops as KeyboardPoint[]).findIndex(
        (p) => p.pointIndex === was.pointIndex && p.kind === was.kind,
      );
      if (k >= 0) cursor.item = k;
    } else if (t && !t.order && was && t.stops?.locate) {
      // Stops built on demand say where the cursor is now; when it is nowhere, the first stop.
      cursor.item = Math.max(0, t.stops.locate(was));
    }
    if (!t || cursor.item >= t.count) {
      this.#cursor = undefined;
      return;
    }
    // After Enter on a stop whose view takes clicks: said again when the click changed it.
    if (this.#focused()) this.#show(clicked !== undefined, clicked);
  }

  /** Focus left the chart: hide the label, keep the cursor. */
  blur(): void {
    if (this.#cursor) this.#host.unhover();
  }

  destroy(): void {
    this.#live.remove();
  }

  #focused(): boolean {
    return this.#target.ownerDocument.activeElement === this.#target;
  }

  /** Navigable traces in legend order, built lazily after each pipeline run. */
  #list(): NavTrace[] {
    if (this.#traces) return this.#traces;
    const fx = this.#host.fx;
    const list: NavTrace[] = [];
    const seen = new Set<number>();
    const loads: Promise<unknown>[] = [];
    const add = (entry: HoverEntry): void => {
      const { module, trace } = entry;
      const sp = entry.subplot;
      const parts = a11yParts(module);
      if (parts instanceof Promise) loads.push(parts);
      else if (!entry.skip && !seen.has(entry.index)) {
        const stops = (module.keyboardPoints ?? parts?.keyboardPoints)?.(
          entry.calc as never,
          trace,
          entry.ctx,
        );
        let letter: 'x' | 'y' | undefined;
        let pos: Float64Array | undefined;
        if (sp && (!stops || Array.isArray(stops))) {
          // Along the position axis: the data points, or the module's stops by their anchors.
          if (
            !module.categories.includes('cartesian') ||
            (!stops && (!module.hoverPoints || NOT_NAVIGATED.test(module.categories.join())))
          )
            return;
          letter = trace['orientation'] === 'h' ? 'y' : 'x';
          const x = letter === 'x';
          const axis = x ? sp.xaxis : sp.yaxis;
          pos = stops
            ? Float64Array.from(stops as KeyboardPoint[], (p) => axis.scale.p2l(x ? p.px : p.py))
            : positions(trace, letter, axis);
        } else if (!stops?.length) return;
        const order = pos && sortedOrder(pos);
        seen.add(entry.index);
        list.push({
          entry,
          letter,
          order,
          pos: pos ?? new Float64Array(0),
          stops,
          count: order ? order.length : (stops as KeyboardStops).length,
        });
      }
    };
    for (const sp of fx.subplots()) for (const e of fx.entries(sp)) add(e);
    for (const e of fx.domainEntries?.().entries ?? []) add(e);
    if (loads.length > 0) {
      // Keys wait for the traces' stops; then the list is rebuilt and they are replayed.
      this.#loading = Promise.all(loads).then(() => {
        this.#loading = this.#traces = undefined;
        for (const e of this.#queue.splice(0)) this.key(e);
      });
    }
    this.#traces = legendOrder(list, fx.fullLayout());
    // The cursor follows its trace through a rebuild (its place in the list may change).
    if (this.#cursor) {
      const k = this.#traces.findIndex((t) => t.entry.index === this.#cursorIndex);
      if (k < 0) this.#cursor = undefined;
      else this.#cursor.trace = k;
    }
    return this.#traces;
  }

  /** Whether item `item` of trace `t` is in view (domain points always are). */
  #inView(t: NavTrace, item: number): boolean {
    if (!t.letter || !t.entry.subplot) return true;
    const axis = t.letter === 'x' ? t.entry.subplot.xaxis : t.entry.subplot.yaxis;
    const p = axis.scale.l2p(t.pos[item] as number);
    return p >= -0.5 && p <= axis.scale.length + 0.5;
  }

  /** The first (`dir` 1) or last item of `t` the cursor can be on, or -1. */
  #end(t: NavTrace, dir: 1 | -1): number {
    const n = t.count;
    if (!t.order) return dir > 0 ? 0 : n - 1;
    const k = stepIndex(t.order, dir > 0 ? -1 : n, dir, (i) => this.#inView(t, i));
    return k < n ? k : -1;
  }

  /** The hover point of item `item` of trace `t` (a data index, or the index of a stop). */
  #point(t: NavTrace, item: number): KeyboardPoint | undefined {
    if (t.stops) return t.stops.at(item);
    const { entry } = t;
    const sp = entry.subplot as SubplotInfo;
    const trace = entry.trace;
    const sx = sp.xaxis.scale;
    const sy = sp.yaxis.scale;
    const x = perPoint(trace['x'], item);
    const y = perPoint(trace['y'], item);
    const xl = t.letter === 'x' ? (t.pos[item] as number) : sx.d2l(x);
    const yl = t.letter === 'y' ? (t.pos[item] as number) : sy.d2l(y);
    // A missing value (ohlc has no `y`): ask along the position axis at mid height.
    const px = Number.isFinite(xl) ? sx.l2p(xl) : sx.length / 2;
    const py = Number.isFinite(yl) ? sy.l2p(yl) : sy.length / 2;
    const r = sp.rect;
    for (const mode of ['closest', t.letter as 'x' | 'y'] as const) {
      const query: HoverQuery = {
        px,
        py,
        xl: sx.p2l(px),
        yl: sy.p2l(py),
        mode,
        distance: 1,
        cx: r.x + px,
        cy: r.y + r.height - py,
      };
      const hit = entry.module
        .hoverPoints?.(entry.calc, trace, query, entry.ctx)
        .find((p) => p.pointIndex === item);
      if (hit) return hit;
    }
    return { pointIndex: item, distance: 0, px, py, x, y };
  }

  #found(): Found | undefined {
    const cursor = this.#cursor;
    const t = cursor && this.#list()[cursor.trace];
    if (!cursor || !t) return undefined;
    const item = t.order ? t.order[cursor.item] : cursor.item;
    const point = item === undefined ? undefined : this.#point(t, item);
    return point && { entry: t.entry, point };
  }

  #setCursor(trace: number, item: number): void {
    this.#cursor = { trace, item };
    this.#cursorIndex = this.#traces?.[trace]?.entry.index;
  }

  #move(action: KeyAction): void {
    const traces = this.#list();
    const fullLayout = this.#host.fx.fullLayout();
    if (traces.length === 0) {
      this.#say(announce(fullLayout, 'empty'));
      return;
    }
    const cursor = this.#cursor;
    if (!cursor) {
      // Start at the first trace with a point in view: its first point (End: its last).
      for (let k = 0; k < traces.length; k++) {
        const at = this.#end(traces[k] as NavTrace, action === 'last' ? -1 : 1);
        if (at >= 0) {
          this.#setCursor(k, at);
          this.#show(true);
          return;
        }
      }
      this.#say(announce(fullLayout, 'empty'));
      return;
    }
    const t = traces[cursor.trace] as NavTrace;
    const { order } = t;
    const inView = (i: number): boolean => this.#inView(t, i);
    const nav = NAV.indexOf(action);
    const { along, across } = directions(t.letter, action);
    if (nav < 0) this.#switchTrace(action === 'nextTrace' ? 1 : -1);
    else if (!order) {
      // Stops: where this one says the key leads, else the previous / next / first / last.
      const last = t.count - 1;
      cursor.item =
        this.#point(t, cursor.item)?.nav?.[nav] ??
        (nav > 3
          ? nav > 4
            ? last
            : 0
          : Math.min(last, Math.max(0, cursor.item + (nav % 2 ? 1 : -1))));
    } else if (nav > 3) {
      const k = this.#end(t, nav > 4 ? -1 : 1);
      if (k >= 0) cursor.item = k;
    } else if (along !== 0) {
      const item = order[cursor.item] as number;
      if (inView(item)) cursor.item = stepIndex(order, cursor.item, along, inView);
      else {
        // Out of view after a zoom or pan: go to the nearest point in view first.
        const k = nearestIndex(order, t.pos, t.pos[item] as number, inView);
        if (k >= 0) cursor.item = k;
      }
    } else if (across !== 0) this.#across(across);
    this.#show(true);
  }

  /** PgUp / PgDn: the previous / next trace with a point in view, nearest to the cursor. */
  #switchTrace(dir: 1 | -1): void {
    const traces = this.#list();
    const cursor = this.#cursor as Cursor;
    const from = this.#found();
    const a = from ? anchorOf(from.entry, from.point) : undefined;
    for (let k = cursor.trace + dir; k >= 0 && k < traces.length; k += dir) {
      const t = traces[k] as NavTrace;
      let at: number;
      if (a && t.order && t.entry.subplot) {
        const axis = t.letter === 'x' ? t.entry.subplot.xaxis : t.entry.subplot.yaxis;
        const target = axis.scale.p2l(t.letter === 'x' ? a.x - axis.start : axis.start - a.y);
        at = nearestIndex(t.order, t.pos, target, (i) => this.#inView(t, i));
      } else at = this.#end(t, 1);
      if (at >= 0) {
        this.#setCursor(k, at);
        return;
      }
    }
  }

  /**
   * ↑ / ↓ (← / → for horizontal traces): among the traces on the cursor's subplot, the point
   * nearest to the cursor's position whose label is next on screen in `dir` (ties in legend order).
   */
  #across(dir: 1 | -1): void {
    const traces = this.#list();
    const cursor = this.#cursor as Cursor;
    const current = traces[cursor.trace] as NavTrace;
    const from = this.#found();
    const sp = current.entry.subplot;
    const order = current.order;
    if (!from || !sp || !order) return;
    const a = anchorOf(from.entry, from.point);
    // Screen coordinate across the position axis, growing in the direction of ↑ (→ for `y`).
    const across = (p: { x: number; y: number }): number => (current.letter === 'x' ? -p.y : p.x);
    const candidates: { k: number; item: number; v: number }[] = [
      { k: cursor.trace, item: cursor.item, v: across(a) },
    ];
    traces.forEach((t, k) => {
      if (k === cursor.trace || !t.order || t.letter !== current.letter || t.entry.subplot !== sp)
        return;
      const target = current.pos[order[cursor.item] as number] as number;
      const item = nearestIndex(t.order, t.pos, target, (i) => this.#inView(t, i));
      const p = item < 0 ? undefined : this.#point(t, t.order[item] as number);
      if (p) candidates.push({ k, item, v: across(anchorOf(t.entry, p)) });
    });
    candidates.sort((p, q) => p.v - q.v || p.k - q.k);
    const at = candidates.findIndex((c) => c.k === cursor.trace);
    const next = candidates[at + dir];
    if (next) this.#setCursor(next.k, next.item);
  }

  /** Show the cursor's label (emits `hover`), and announce it unless it says `unless`. */
  #show(speak: boolean, unless?: string): void {
    const found = this.#found();
    if (!found) return;
    const { entry, point } = found;
    this.#shown = point;
    const more = (point as KeyboardPoint).more ?? [];
    this.#host.hover([found, ...more.map((p) => ({ entry, point: p }))]);
    if (!speak) return;
    const text = this.#describe(found);
    if (text !== unless) this.#say(text);
  }

  /** "Revenue: (Mar 1, 2024, 11), point 3 of 6." */
  #describe(found: Found): string {
    const fullLayout = this.#host.fx.fullLayout();
    const cursor = this.#cursor as Cursor;
    const t = this.#list()[cursor.trace] as NavTrace;
    const { entry } = found;
    const point: KeyboardPoint = found.point;
    let text = '';
    if (fullLayout) {
      // Every label of the stop, each with the secondary box its trace filled (a sankey value);
      // the lines of a label are read as a list.
      text = accessibleText(
        [point, ...(point.more ?? [])]
          .flatMap((p) => [labelText(entry, p, 'closest', false, fullLayout).text, p.extra])
          .filter(Boolean)
          .join('<br>')
          .replace(/<br\s*\/?>/gi, ', '),
      );
    }
    if (text === '') {
      const x = buildPoint(entry, point, false);
      text = [x.x, x.y].filter((v) => v !== undefined).join(', ');
    }
    return announce(fullLayout, point.say?.[0] ?? 'point', {
      name: traceNameText(entry.trace['name'], entry.index),
      text,
      n: String(cursor.item + 1),
      count: String(t.count),
      ...point.say?.[1],
    });
  }

  #say(text: string): void {
    this.#flip = !this.#flip;
    this.#live.textContent = text === '' ? '' : this.#flip ? text : `${text}\u00a0`;
  }

  /**
   * Enter / Space: the view's own click (hierarchies drill down, a `graph` tree folds), else
   * `click` / click-select.
   */
  #click(e: KeyboardEvent): void {
    const found = this.#found();
    if (!found) return;
    const { entry } = found;
    const point: KeyboardPoint = found.point;
    const host = this.#host;
    const t = this.#list()[(this.#cursor as Cursor).trace] as NavTrace;
    const a = anchorOf(entry, point);
    // A view on cartesian axes gets the click of the stops that ask for it only: the views of
    // other traces take clicks for their own ends (a link in a text label opens).
    if (point.click) this.#clicked = this.#describe(found);
    if ((!entry.subplot || point.click) && host.clickTrace(entry.index, a.x, a.y, e)) return;
    const s = host.fx.settings();
    const events = host.fx.events;
    if (s.clickEvent) events.emit('click', { points: [buildPoint(entry, point, true)], event: e });
    // Stops aren't data points (a bin, a box): they are clicked, not selected.
    if (!s.clickSelect || !entry.module.selectPoints || point.pointIndex < 0 || t.stops) return;
    // Click-select: this point; Shift toggles it in the trace's selection.
    const i = point.pointIndex;
    const prev = host.fx.selection(entry.index) ?? [];
    let list = [i];
    if (e.shiftKey) {
      const set = new Set(prev);
      if (set.has(i)) set.delete(i);
      else set.add(i);
      list = [...set].sort((p, q) => p - q);
    }
    const next = new Map<number, number[]>();
    if (!e.shiftKey && entry.subplot) {
      for (const other of host.fx.entries(entry.subplot))
        if (other.module.selectPoints) next.set(other.index, []);
    }
    next.set(entry.index, list);
    host.fx.select(next);
    const points: ChartPoint[] = list.map((j) =>
      buildPoint(entry, this.#point(t, j) as HoverPoint, false),
    );
    events.emit('selected', { points, event: e });
  }

  /**
   * A view key (`+`, `-`, Shift + arrows, `0`) on traces that are not on cartesian axes (3D
   * scenes): the relayout of the cursor's trace, or of every such trace without a cursor. Whether
   * a trace took the key (cartesian subplots then keep their view).
   */
  #view(action: KeyAction): boolean {
    const { fx } = this.#host;
    const at = this.#found()?.entry;
    const update: Record<string, unknown> = {};
    // What the traces say of their new view (`keyboardViewSay`), each sentence once: the traces
    // of one subplot say the same.
    const fullLayout = fx.fullLayout();
    const said = new Set<string>();
    for (const e of at ? [at] : (fx.domainEntries?.().entries ?? [])) {
      const parts = a11yParts(e.module);
      if (parts instanceof Promise) continue;
      const own = parts?.keyboardView?.(e.trace, e.ctx, action);
      if (!own) continue;
      Object.assign(update, own);
      const say = parts?.keyboardViewSay?.(e.trace, e.ctx, action, own);
      if (say) said.add(announce(fullLayout, say[0], say[1]));
    }
    if (Object.keys(update).length === 0) return false;
    this.#host.relayout(update);
    this.#say(
      said.size > 0
        ? [...said].join(' ')
        : announce(fullLayout, action[0] === 'p' ? 'rotate' : action),
    );
    return true;
  }

  /** The subplots keys zoom and pan: the cursor's, else all of them. */
  #subplots(): readonly SubplotInfo[] {
    const sp = this.#found()?.entry.subplot;
    return sp ? [sp] : this.#host.fx.subplots();
  }

  /** A subplot's axis of `letter` with the axes overlaying it (not fixed), like drags move. */
  #family(sp: SubplotInfo, letter: 'x' | 'y'): AxisInfo[] {
    const fx = this.#host.fx;
    const axis = letter === 'x' ? sp.xaxis : sp.yaxis;
    const base = (a: AxisInfo): string => {
      const o = getIn(a.full, 'overlaying');
      return typeof o === 'string' && o !== '' && o !== 'free' ? o : a.id;
    };
    const root = base(axis);
    const out: AxisInfo[] = [];
    for (const other of fx.subplots()) {
      const a = letter === 'x' ? other.xaxis : other.yaxis;
      if (base(a) === root && !fx.isFixed(a) && !out.includes(a)) out.push(a);
    }
    return out;
  }

  /** `+` / `-` and Shift + arrows on cartesian subplots: zoom around the cursor, or pan. */
  #shift(action: KeyAction): void {
    const fx = this.#host.fx;
    const found = this.#found();
    const limits = (ax: AxisInfo): readonly [number | undefined, number | undefined] =>
      fx.limits(ax);
    const zoom = action[0] === 'z';
    const ranges = new Map<string, LinearRange>();
    for (const sp of this.#subplots()) {
      const r = sp.rect;
      const a =
        found && found.entry.subplot === sp
          ? anchorOf(found.entry, found.point)
          : { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      const next = zoom
        ? zoomRanges(
            [...this.#family(sp, 'x'), ...this.#family(sp, 'y')],
            r,
            a.x,
            a.y,
            action === 'zoomIn' ? ZOOM_STEP : 1 / ZOOM_STEP,
            limits,
          )
        : panRanges(
            this.#family(sp, /Left|Right/.test(action) ? 'x' : 'y'),
            /Right|Up/.test(action) ? PAN_STEP : -PAN_STEP,
            limits,
          );
      for (const [id, range] of next) if (!ranges.has(id)) ranges.set(id, range);
    }
    if (ranges.size === 0) return;
    fx.commit(ranges);
    this.#say(announce(fx.fullLayout(), zoom ? action : 'pan'));
  }
}

/** Categories whose traces are navigated only through their own stops (aggregated or grid hover). */
const NOT_NAVIGATED = /\b(?:histogram|2dMap|box-violin)\b/;

/**
 * What an arrow does for a trace positioned along `letter`: a step `along` its points, or a move
 * `across` traces (+1 toward ↑ for x-positioned traces, → for y-positioned ones).
 */
export function directions(
  letter: 'x' | 'y' | undefined,
  action: KeyAction,
): { along: -1 | 0 | 1; across: -1 | 0 | 1 } {
  // ← → ↑ ↓ in the order of `NAV`: a list goes back with ← / ↑; on axes, ↑ is the way forward.
  const k = NAV.indexOf(action);
  if (k < 0 || k > 3) return { along: 0, across: 0 };
  const step = k % 2 > 0 !== (letter !== undefined && k > 1) ? 1 : -1;
  return !letter || (letter === 'x') === k < 2
    ? { along: step, across: 0 }
    : { along: 0, across: step };
}
