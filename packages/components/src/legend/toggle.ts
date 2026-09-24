/**
 * Legend click behavior (plan E5.2), pure: which traces a click or double-click shows or hides,
 * following Plotly's `legend/handle_click.js`, and a small dispatcher that tells a single click
 * from the first half of a double-click.
 */

/** What the toggle logic needs to know about a trace. */
export interface ToggleTrace {
  index: number;
  visible: boolean | 'legendonly';
  legendgroup: string;
  /**
   * Has a legend item (Plotly's `showlegend === true`). Traces without one still toggle with their
   * `legendgroup`; without a group they stay shown when another item is isolated.
   */
  inLegend: boolean;
}

/** The visibility changes of one legend action: trace index → new `visible`. */
export type VisibilityChanges = Map<number, true | 'legendonly'>;

/**
 * Visibility changes for a legend click on trace `target`, as plotly.js `legend/handle_click.js`:
 *
 * - `toggle`: a shown item goes to `legendonly`, a hidden one comes back. With
 *   `groupclick: 'togglegroup'` (the default) every trace of its `legendgroup` follows — including
 *   traces with `showlegend: false`, which have no item of their own.
 * - `toggleothers` (default double-click): isolate the item and its `legendgroup` (whatever
 *   `groupclick` says, as in Plotly) — unless it is already the only one shown, in which case
 *   everything comes back. A hidden item brings everything back. Traces without a legend item
 *   and without a group are always shown; grouped ones follow their group.
 *
 * Traces with `visible: false` are never touched.
 */
export function legendToggle(
  traces: readonly ToggleTrace[],
  target: number,
  mode: 'toggle' | 'toggleothers',
  groupclick: 'toggleitem' | 'togglegroup',
): VisibilityChanges {
  const changes: VisibilityChanges = new Map();
  const clicked = traces.find((t) => t.index === target);
  if (!clicked || clicked.visible === false) return changes;
  const group = clicked.legendgroup;
  const inGroup = (t: ToggleTrace): boolean =>
    t === clicked || (group !== '' && t.legendgroup === group);
  const set = (t: ToggleTrace, v: true | 'legendonly'): void => {
    if (t.visible !== false && t.visible !== v) changes.set(t.index, v);
  };

  if (mode === 'toggle') {
    const next = clicked.visible === true ? 'legendonly' : true;
    if (groupclick === 'toggleitem') set(clicked, next);
    else for (const t of traces) if (inGroup(t)) set(t, next);
    return changes;
  }
  if (clicked.visible === 'legendonly') {
    for (const t of traces) set(t, true);
    return changes;
  }
  // Isolated already: no other shown item outside the group.
  const isolated = !traces.some(
    (t) => t !== clicked && t.inLegend && !inGroup(t) && t.visible === true,
  );
  for (const t of traces) {
    const free = !t.inLegend && t.legendgroup === '';
    set(t, isolated || free || inGroup(t) ? true : 'legendonly');
  }
  return changes;
}

/**
 * The next `layout.hiddenlabels` after a legend click on a per-point item (pie labels; Plotly's
 * `handle_click` for pie-like traces). `keys` are every per-point item shown in the legend.
 *
 * - `toggle`: hide `key`, or show it again.
 * - `toggleothers`: show `key` and hide every other item — unless that is already the case, in
 *   which case every item comes back.
 *
 * Returns `undefined` when nothing changes. Labels hidden but not in the legend are kept.
 */
export function hiddenLabelsToggle(
  hidden: readonly string[],
  keys: readonly string[],
  key: string,
  mode: 'toggle' | 'toggleothers',
): string[] | undefined {
  const set = new Set(hidden);
  if (mode === 'toggle') {
    if (set.has(key)) set.delete(key);
    else set.add(key);
  } else {
    const others = keys.filter((k) => k !== key);
    const isolated = !set.has(key) && others.every((k) => set.has(k));
    if (isolated) for (const k of others) set.delete(k);
    else {
      set.delete(key);
      for (const k of others) set.add(k);
    }
  }
  const next = [...set];
  const same = next.length === hidden.length && next.every((k, i) => k === hidden[i]);
  return same ? undefined : next;
}

/** Scheduling functions (injectable for tests). */
export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
  /** Milliseconds, monotonic. */
  now(): number;
}

const DEFAULT_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
};

/**
 * Separates single from double clicks on legend items: a click waits `delay` ms, and a
 * double-click on the same item within that time cancels it (Plotly waits the same way, so a
 * double-click never first toggles the item).
 */
export class ClickDispatcher<K> {
  readonly #onClick: (key: K) => void;
  readonly #onDouble: (key: K) => void;
  readonly #timers: Timers;
  #pending: { key: K; handle: unknown } | undefined;
  #lastDouble: { key: K; time: number } | undefined;

  constructor(
    onClick: (key: K) => void,
    onDouble: (key: K) => void,
    timers: Timers = DEFAULT_TIMERS,
  ) {
    this.#onClick = onClick;
    this.#onDouble = onDouble;
    this.#timers = timers;
  }

  /** A click on `key`. With `delay` 0 (no double-click action) it fires at once. */
  click(key: K, delay: number): void {
    // The second click of a double-click may be reported after the double-click itself.
    const last = this.#lastDouble;
    if (last && last.key === key && this.#timers.now() - last.time < Math.max(delay, 1)) return;
    this.cancel();
    if (delay <= 0) {
      this.#onClick(key);
      return;
    }
    const handle = this.#timers.set(() => {
      this.#pending = undefined;
      this.#onClick(key);
    }, delay);
    this.#pending = { key, handle };
  }

  /** A double-click on `key` (the runtime reports it after the second click). */
  doubleClick(key: K): void {
    const pending = this.#pending;
    this.cancel();
    if (pending && pending.key !== key) this.#onClick(pending.key);
    this.#lastDouble = { key, time: this.#timers.now() };
    this.#onDouble(key);
  }

  /** Drop a click still waiting for a possible double-click. */
  cancel(): void {
    if (this.#pending) this.#timers.clear(this.#pending.handle);
    this.#pending = undefined;
  }
}
