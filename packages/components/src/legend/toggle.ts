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
  /** Has a legend item (traces without one are never hidden by "toggle others"). */
  inLegend: boolean;
}

/** The visibility changes of one legend action: trace index → new `visible`. */
export type VisibilityChanges = Map<number, true | 'legendonly'>;

/**
 * Visibility changes for a legend click on trace `target`:
 *
 * - `toggle`: a shown item (and, with `groupclick: 'togglegroup'`, its whole `legendgroup`) goes
 *   to `legendonly`; a hidden one comes back.
 * - `toggleothers` (default double-click): isolate the item (and its group) — unless it is
 *   already the only one shown, in which case everything comes back.
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
  const togglable = traces.filter((t) => t.visible !== false && t.inLegend);
  const sameGroup = (t: ToggleTrace): boolean =>
    t.index === target ||
    (groupclick === 'togglegroup' &&
      clicked.legendgroup !== '' &&
      t.legendgroup === clicked.legendgroup);
  const set = (t: ToggleTrace, v: true | 'legendonly'): void => {
    if (t.visible !== v) changes.set(t.index, v);
  };

  if (mode === 'toggle') {
    const next = clicked.visible === true ? 'legendonly' : true;
    for (const t of togglable) if (sameGroup(t)) set(t, next);
    return changes;
  }
  const others = togglable.filter((t) => !sameGroup(t));
  const isolated =
    togglable.filter(sameGroup).every((t) => t.visible === true) &&
    others.every((t) => t.visible === 'legendonly');
  for (const t of togglable) {
    if (isolated) set(t, true);
    else set(t, sameGroup(t) ? true : 'legendonly');
  }
  return changes;
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
