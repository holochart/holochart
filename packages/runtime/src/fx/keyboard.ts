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
 *   cartesian traces, and domain traces whose module lists its points (`keyboardPoints`: pie).
 * - A cartesian trace's points are its data points ordered along its position axis: x, or y for
 *   horizontal traces (`orientation: 'h'`), where ↑ / ↓ step through the points and ← / → move
 *   between traces instead. Only points whose position is inside the axis range are visited, so
 *   after a zoom the cursor stays in view. Domain traces' points follow `keyboardPoints` (← / ↑
 *   previous, → / ↓ next).
 * - ↑ / ↓ go to the point, among the traces on the same subplot, nearest to the cursor's position
 *   whose label sits next above / below it on screen (ties in legend order) — through the lines or
 *   bars stacked at one x.
 * - Page Up / Page Down keep the position: the new trace's point nearest to the cursor on screen.
 * - The first key without a cursor starts at the first trace's first point (End: its last point).
 * - The cursor stays when the chart loses focus (its label hides) and after data or layout
 *   changes while its trace and point still exist.
 *
 * Polar, 3D, grid (heatmap, histogram2d, contour), histogram and box / violin traces are not
 * navigated yet.
 *
 * ## Announcements
 *
 * Each move announces the point like its hover label, in plain text: "Revenue: (Mar 1, 2024, 11),
 * point 3 of 6." Zoom, pan and reset are announced briefly. Every text comes from
 * {@link KEYBOARD_TEMPLATES}, English strings that are also their locale dictionary keys.
 *
 * ## Events
 *
 * Moving emits `hover` (without `event`, like `chart.hover`), Escape `unhover`, Enter `click` (and
 * `selected` with `clickmode: 'select'`) with the Plotly-shaped point and the `KeyboardEvent`.
 * Hierarchy nodes (sunburst, treemap, icicle) get the click their view handles (drill-down). Zoom,
 * pan and reset emit `relayout` with the same keys as a drag (`'xaxis.range[0]'`, …).
 */
import {
  getIn,
  isArrayLike,
  localize,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import type { AxisInfo, HoverPoint, HoverQuery, SubplotInfo } from '../contracts.ts';
import type { ChartPoint } from '../events.ts';
import { accessibleText, traceNameText } from '../a11y/text.ts';
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
  reset: 'View reset.',
} as const;

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

/** A template of {@link KEYBOARD_TEMPLATES} in the chart's language, filled in. */
export function announce(
  fullLayout: FullLayout | undefined,
  template: keyof typeof KEYBOARD_TEMPLATES,
  values: Readonly<Record<string, string>> = {},
): string {
  return localize(fullLayout, KEYBOARD_TEMPLATES[template]).replace(
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
  /** Items in navigation order: data indices (cartesian) or indices into `points` (domain). */
  readonly order: readonly number[];
  /** Linear position per data index (cartesian). */
  readonly pos: Float64Array;
  /** The module's points (domain traces). */
  readonly points: readonly HoverPoint[];
}

/** The cursor: a trace and an item of its {@link NavTrace.order}. */
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

  /** Take over the focus target's keys (`queued`: pressed while this code was loading). */
  constructor(target: HTMLElement, host: KeyboardHost, queued: KeyboardEvent[] = []) {
    this.#target = target;
    this.#host = host;
    const live = target.ownerDocument.createElement('div');
    live.className = 'holochart-live';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    live.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;' +
      'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';
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

  /** The last announcement (for tests and diagnostics). */
  get announcement(): string {
    return (this.#live.textContent ?? '').trimEnd();
  }

  /** The cursor as `{ curveNumber, pointNumber }`, or `undefined` without one. */
  get cursor(): { curveNumber: number; pointNumber: number } | undefined {
    const found = this.#found();
    return found
      ? { curveNumber: found.entry.index, pointNumber: found.point.pointIndex }
      : undefined;
  }

  /** Handle a key press on the focus target. */
  key(e: KeyboardEvent): void {
    const action = keyAction(e);
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case 'click':
        this.#click(e);
        break;
      case 'clear':
        this.#cursor = undefined;
        this.#host.unhover();
        this.#say('');
        break;
      case 'zoomIn':
      case 'zoomOut':
        this.#zoom(action === 'zoomIn' ? ZOOM_STEP : 1 / ZOOM_STEP, action);
        break;
      case 'panLeft':
      case 'panRight':
      case 'panUp':
      case 'panDown':
        this.#pan(action);
        break;
      case 'reset': {
        const s = this.#host.fx.settings();
        if (s.doubleClick === false || this.#host.fx.subplots().length === 0) return;
        this.#host.fx.resetView(s.doubleClick);
        this.#say(announce(this.#host.fx.fullLayout(), 'reset'));
        break;
      }
      default:
        this.#move(action);
    }
  }

  /** After a pipeline run: points may have moved or gone; re-show the cursor while focused. */
  refresh(): void {
    this.#traces = undefined;
    if (!this.#cursor) return;
    const traces = this.#list();
    const cursor = this.#cursor;
    const t = traces[cursor.trace];
    if (!t || cursor.item >= t.order.length) {
      this.#cursor = undefined;
      return;
    }
    if (this.#focused()) this.#show(false);
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
    const add = (entry: HoverEntry): void => {
      if (entry.skip || seen.has(entry.index) || !entry.module.hoverPoints) return;
      const { module, trace } = entry;
      if (entry.subplot) {
        if (
          !module.categories.includes('cartesian') ||
          NOT_NAVIGATED.test(module.categories.join())
        )
          return;
        const letter = trace['orientation'] === 'h' ? 'y' : 'x';
        const axis = letter === 'x' ? entry.subplot.xaxis : entry.subplot.yaxis;
        const pos = positions(trace, letter, axis);
        seen.add(entry.index);
        list.push({ entry, letter, order: sortedOrder(pos), pos, points: [] });
        return;
      }
      const points = module.keyboardPoints?.(entry.calc, trace, entry.ctx);
      if (!points || points.length === 0) return;
      seen.add(entry.index);
      list.push({
        entry,
        letter: undefined,
        order: points.map((_, k) => k),
        pos: new Float64Array(0),
        points,
      });
    };
    for (const sp of fx.subplots()) for (const e of fx.entries(sp)) add(e);
    for (const e of fx.domainEntries?.().entries ?? []) add(e);
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

  /** The hover point of item `item` of trace `t`. */
  #point(t: NavTrace, item: number): HoverPoint {
    if (!t.letter) return t.points[item] as HoverPoint;
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
    for (const mode of ['closest', t.letter] as const) {
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
    const item = t.order[cursor.item];
    return item === undefined ? undefined : { entry: t.entry, point: this.#point(t, item) };
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
        const t = traces[k] as NavTrace;
        const dir = action === 'last' ? -1 : 1;
        const at = stepIndex(t.order, dir === 1 ? -1 : t.order.length, dir, (i) =>
          this.#inView(t, i),
        );
        if (at >= 0 && at < t.order.length) {
          this.#setCursor(k, at);
          this.#show(true);
          return;
        }
      }
      this.#say(announce(fullLayout, 'empty'));
      return;
    }
    const t = traces[cursor.trace] as NavTrace;
    const inView = (i: number): boolean => this.#inView(t, i);
    const along = (dir: 1 | -1): void => {
      const item = t.order[cursor.item] as number;
      if (t.letter && !inView(item)) {
        // Out of view after a zoom or pan: go to the nearest point in view first.
        const k = nearestIndex(t.order, t.pos, t.pos[item] as number, inView);
        if (k >= 0) cursor.item = k;
        return;
      }
      cursor.item = stepIndex(t.order, cursor.item, dir, inView);
    };
    switch (action) {
      case 'first':
      case 'last': {
        const dir = action === 'first' ? 1 : -1;
        const k = stepIndex(t.order, dir === 1 ? -1 : t.order.length, dir, inView);
        if (k >= 0 && k < t.order.length) cursor.item = k;
        break;
      }
      case 'prevTrace':
      case 'nextTrace':
        this.#switchTrace(action === 'nextTrace' ? 1 : -1);
        break;
      default: {
        const { along: a, across } = directions(t.letter, action);
        if (a !== 0) along(a);
        else if (across !== 0) this.#across(across);
      }
    }
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
      const inView = (i: number): boolean => this.#inView(t, i);
      let at: number;
      if (a && t.letter && t.entry.subplot) {
        const axis = t.letter === 'x' ? t.entry.subplot.xaxis : t.entry.subplot.yaxis;
        const target = axis.scale.p2l(t.letter === 'x' ? a.x - axis.start : axis.start - a.y);
        at = nearestIndex(t.order, t.pos, target, inView);
      } else {
        at = stepIndex(t.order, -1, 1, inView);
      }
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
    if (!from || !sp || !current.letter) return;
    const a = anchorOf(from.entry, from.point);
    // Screen coordinate across the position axis, growing in the direction of ↑ (→ for `y`).
    const across = (p: { x: number; y: number }): number => (current.letter === 'x' ? -p.y : p.x);
    const candidates: { k: number; item: number; v: number }[] = [
      { k: cursor.trace, item: cursor.item, v: across(a) },
    ];
    traces.forEach((t, k) => {
      if (k === cursor.trace || t.letter !== current.letter || t.entry.subplot !== sp) return;
      const target = current.pos[current.order[cursor.item] as number] as number;
      const item = nearestIndex(t.order, t.pos, target, (i) => this.#inView(t, i));
      if (item < 0) return;
      const p = this.#point(t, t.order[item] as number);
      candidates.push({ k, item, v: across(anchorOf(t.entry, p)) });
    });
    candidates.sort((p, q) => p.v - q.v || p.k - q.k);
    const at = candidates.findIndex((c) => c.k === cursor.trace);
    const next = candidates[at + dir];
    if (next) this.#setCursor(next.k, next.item);
  }

  /** Show the cursor's label (emits `hover`), and announce it. */
  #show(speak: boolean): void {
    const found = this.#found();
    if (!found) return;
    this.#host.hover([found]);
    if (speak) this.#say(this.#describe(found));
  }

  /** "Revenue: (Mar 1, 2024, 11), point 3 of 6." */
  #describe(found: Found): string {
    const fullLayout = this.#host.fx.fullLayout();
    const cursor = this.#cursor as Cursor;
    const t = this.#list()[cursor.trace] as NavTrace;
    const { entry, point } = found;
    let text = '';
    if (fullLayout) {
      text = accessibleText(labelText(entry, point, 'closest', false, fullLayout).text);
    }
    if (text === '') {
      const x = buildPoint(entry, point, false);
      text = [x.x, x.y].filter((v) => v !== undefined).join(', ');
    }
    return announce(fullLayout, 'point', {
      name: traceNameText(entry.trace['name'], entry.index),
      text,
      n: String(cursor.item + 1),
      count: String(t.order.length),
    });
  }

  #say(text: string): void {
    this.#flip = !this.#flip;
    this.#live.textContent = text === '' ? '' : this.#flip ? text : `${text}\u00a0`;
  }

  /** Enter / Space: the view's own click (hierarchies drill down), else `click` / click-select. */
  #click(e: KeyboardEvent): void {
    const found = this.#found();
    if (!found) return;
    const { entry, point } = found;
    const host = this.#host;
    const a = anchorOf(entry, point);
    if (!entry.subplot && host.clickTrace(entry.index, a.x, a.y, e)) return;
    const s = host.fx.settings();
    const events = host.fx.events;
    if (s.clickEvent) events.emit('click', { points: [buildPoint(entry, point, true)], event: e });
    if (!s.clickSelect || !entry.module.selectPoints || point.pointIndex < 0) return;
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
    const t = this.#list()[(this.#cursor as Cursor).trace] as NavTrace;
    const points: ChartPoint[] = list.map((j) => buildPoint(entry, this.#point(t, j), false));
    events.emit('selected', { points, event: e });
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

  #zoom(factor: number, action: 'zoomIn' | 'zoomOut'): void {
    const fx = this.#host.fx;
    const found = this.#found();
    const ranges = new Map<string, LinearRange>();
    for (const sp of this.#subplots()) {
      const r = sp.rect;
      const a =
        found && found.entry.subplot === sp
          ? anchorOf(found.entry, found.point)
          : { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      const axes = [...this.#family(sp, 'x'), ...this.#family(sp, 'y')];
      for (const [id, range] of zoomRanges(axes, r, a.x, a.y, factor, (ax) => fx.limits(ax))) {
        if (!ranges.has(id)) ranges.set(id, range);
      }
    }
    if (ranges.size === 0) return;
    fx.commit(ranges);
    this.#say(announce(fx.fullLayout(), action));
  }

  #pan(action: 'panLeft' | 'panRight' | 'panUp' | 'panDown'): void {
    const fx = this.#host.fx;
    const letter = action === 'panLeft' || action === 'panRight' ? 'x' : 'y';
    const share = action === 'panRight' || action === 'panUp' ? PAN_STEP : -PAN_STEP;
    const ranges = new Map<string, LinearRange>();
    for (const sp of this.#subplots()) {
      for (const [id, range] of panRanges(this.#family(sp, letter), share, (ax) => fx.limits(ax))) {
        if (!ranges.has(id)) ranges.set(id, range);
      }
    }
    if (ranges.size === 0) return;
    fx.commit(ranges);
    this.#say(announce(fx.fullLayout(), 'pan'));
  }
}

/** Trace categories not navigated yet (aggregated or grid hover). */
const NOT_NAVIGATED = /\b(?:histogram|2dMap|box-violin)\b/;

/**
 * What an arrow does for a trace positioned along `letter`: a step `along` its points, or a move
 * `across` traces (+1 toward ↑ for x-positioned traces, → for y-positioned ones).
 */
export function directions(
  letter: 'x' | 'y' | undefined,
  action: KeyAction,
): { along: -1 | 0 | 1; across: -1 | 0 | 1 } {
  if (letter === undefined) {
    if (action === 'right' || action === 'down') return { along: 1, across: 0 };
    if (action === 'left' || action === 'up') return { along: -1, across: 0 };
    return { along: 0, across: 0 };
  }
  const [prev, next, below, above] =
    letter === 'x' ? ['left', 'right', 'down', 'up'] : ['down', 'up', 'left', 'right'];
  if (action === next) return { along: 1, across: 0 };
  if (action === prev) return { along: -1, across: 0 };
  if (action === above) return { along: 0, across: 1 };
  if (action === below) return { along: 0, across: -1 };
  return { along: 0, across: 0 };
}
