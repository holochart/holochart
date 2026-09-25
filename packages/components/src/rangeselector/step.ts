/**
 * Date math of the range selector (plan E5.9): the range a button sets and whether it is the one
 * in view. Plotly's `components/rangeselector/get_update_object.js` and `isActive`, with d3-time's
 * UTC interval semantics (`utcMonth.offset`, `utcYear.ceil`, …) written out by hand on `Date`'s
 * UTC methods, so no d3 dependency.
 *
 * Values are ms since the epoch (UTC). On axes with range breaks the axis' linear space is
 * compressed: the math runs on raw ms (`scale.breaks.toRaw`) and results go back through
 * `scale.r2l`, so a start inside a break snaps to the break's end, as it is drawn.
 */
import type { Scale } from '@mk7s/holochart-core';

/** `rangeselector.buttons[].step`. */
export type RangeselectorStep = 'month' | 'year' | 'day' | 'hour' | 'minute' | 'second' | 'all';

/** A calendar step (every step but `all`). */
export type RangeselectorDateStep = Exclude<RangeselectorStep, 'all'>;

/** `rangeselector.buttons[].stepmode`. */
export type RangeselectorStepmode = 'backward' | 'todate';

/** One defaulted `rangeselector.buttons[]` item. */
export interface RangeselectorButton {
  /** `false`: not drawn (e.g. a template-linked item without its template item). */
  readonly visible?: boolean;
  readonly step: RangeselectorStep;
  readonly stepmode: RangeselectorStepmode;
  /** Number of steps; fractional counts are floored, like d3's `interval.offset`. */
  readonly count: number;
  readonly label?: string;
  readonly name?: string;
  readonly templateitemname?: string;
  /** Index in the input `buttons` array. */
  readonly _index?: number;
}

/** The parts of an axis (`AxisInfo`) the range selector math reads. */
export interface RangeselectorAxisLike {
  /** Layout key: `'xaxis'`, `'xaxis2'`, … */
  readonly name: string;
  /** The defaulted axis (`autorange` for the `all` button). */
  readonly full: { readonly autorange?: unknown };
  /** `range` is the linear range in use; `breaks` is set on axes with range breaks. */
  readonly scale: Pick<Scale, 'range' | 'r2l' | 'l2r'> & {
    readonly breaks?: { toRaw(l: number): number } | undefined;
  };
}

const MS_SECOND = 1000;
const MS_MINUTE = 60 * MS_SECOND;
const MS_HOUR = 60 * MS_MINUTE;

/**
 * `ms` moved by `n` steps (d3's `utc<Step>.offset`): `n` is floored; months and years use
 * `Date`'s overflow (Mar 31 − 1 month = "Feb 31" = Mar 2 or 3), days are calendar days, hours,
 * minutes and seconds are fixed durations. `ms` is truncated to whole ms (`new Date(ms)`).
 */
export function stepOffset(ms: number, step: RangeselectorDateStep, n: number): number {
  const d = new Date(ms);
  const k = Math.floor(n);
  switch (step) {
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() + k);
      return d.getTime();
    case 'month':
      d.setUTCMonth(d.getUTCMonth() + k);
      return d.getTime();
    case 'day':
      d.setUTCDate(d.getUTCDate() + k);
      return d.getTime();
    case 'hour':
      return d.getTime() + k * MS_HOUR;
    case 'minute':
      return d.getTime() + k * MS_MINUTE;
    case 'second':
      return d.getTime() + k * MS_SECOND;
  }
}

/** Start of the `step` period containing `ms` (d3's `utc<Step>.floor`). */
export function stepFloor(ms: number, step: RangeselectorDateStep): number {
  const d = new Date(ms);
  switch (step) {
    case 'year':
      d.setUTCMonth(0, 1);
      d.setUTCHours(0, 0, 0, 0);
      break;
    case 'month':
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      break;
    case 'day':
      d.setUTCHours(0, 0, 0, 0);
      break;
    case 'hour':
      d.setUTCMinutes(0, 0, 0);
      break;
    case 'minute':
      d.setUTCSeconds(0, 0);
      break;
    case 'second':
      d.setUTCMilliseconds(0);
      break;
  }
  return d.getTime();
}

/**
 * First `step` boundary at or after `ms` (d3's `utc<Step>.ceil`: floor of `ms − 1`, one step on,
 * floored again), so a boundary stays itself.
 */
export function stepCeil(ms: number, step: RangeselectorDateStep): number {
  return stepFloor(stepOffset(stepFloor(ms - 1, step), step, 1), step);
}

/**
 * The raw `[start, end]` (ms) button `button` sets when the range ends at `endMs` (Plotly's
 * `getXRange`): `backward` starts `count` steps before the end; `todate` starts at the first
 * `step` boundary after that (`count: 1, step: 'year'` is year to date). `undefined` for `all`.
 */
export function rangeselectorRange(
  endMs: number,
  button: Pick<RangeselectorButton, 'step' | 'stepmode' | 'count'>,
): readonly [number, number] | undefined {
  const { step } = button;
  if (step === 'all') return undefined;
  const back = stepOffset(endMs, step, -button.count);
  return [button.stepmode === 'todate' ? stepCeil(back, step) : back, endMs];
}

/** The raw end (ms) of the axis' current range: `range[1]`, expanded on range-break axes. */
function rawRangeEnd(axis: RangeselectorAxisLike): number {
  const l = axis.scale.range[1];
  const breaks = axis.scale.breaks;
  return breaks ? breaks.toRaw(l) : l;
}

/** The linear `[start, end]` button `button` sets on `axis`, or `undefined` (`all`, invalid). */
function linearButtonRange(
  axis: RangeselectorAxisLike,
  button: Pick<RangeselectorButton, 'step' | 'stepmode' | 'count'>,
): readonly [number, number] | undefined {
  const raw = rangeselectorRange(rawRangeEnd(axis), button);
  if (!raw) return undefined;
  const l0 = axis.scale.r2l(raw[0]);
  const l1 = axis.scale.r2l(raw[1]);
  return Number.isFinite(l0) && Number.isFinite(l1) ? [l0, l1] : undefined;
}

/**
 * The `relayout` update of a button click (Plotly's `getUpdateObject`): `{ 'xaxis.autorange':
 * true }` for `all`, else `{ 'xaxis.range[0]': start, 'xaxis.range[1]': end }` as range values
 * (date strings) with the current end kept. Setting a range turns autorange off (the runtime's
 * range implications). Empty when the range cannot be computed (dates out of range).
 */
export function rangeselectorUpdate(
  axis: RangeselectorAxisLike,
  button: Pick<RangeselectorButton, 'step' | 'stepmode' | 'count'>,
): Record<string, unknown> {
  if (button.step === 'all') return { [`${axis.name}.autorange`]: true };
  const range = linearButtonRange(axis, button);
  if (!range) return {};
  return {
    [`${axis.name}.range[0]`]: axis.scale.l2r(range[0]),
    [`${axis.name}.range[1]`]: axis.scale.l2r(range[1]),
  };
}

/** Tolerance of {@link rangeselectorIsActive}, linear units (ms): range strings round to 1 ms. */
const ACTIVE_TOLERANCE = 1;

/**
 * Whether `button`'s range is the one in view (Plotly's `isActive`): `all` while the axis
 * autoranges, else when the axis range equals the range a click would set now, compared
 * positionally (`range[0]` with the start) like Plotly. Plotly compares range strings exactly; the
 * linear ranges here are compared within 1 ms.
 */
export function rangeselectorIsActive(
  axis: RangeselectorAxisLike,
  button: Pick<RangeselectorButton, 'step' | 'stepmode' | 'count'>,
): boolean {
  if (button.step === 'all') return axis.full.autorange === true;
  const range = linearButtonRange(axis, button);
  if (!range) return false;
  const [r0, r1] = axis.scale.range;
  return Math.abs(range[0] - r0) <= ACTIVE_TOLERANCE && Math.abs(range[1] - r1) <= ACTIVE_TOLERANCE;
}

// With the button geometry (the margins measure the labels), which only the view needs this module
// for: it loads on first use (`shared/lazy-view.ts`).
export { buttonLabel } from './layout.ts';

/**
 * A spoken description of the range a button sets, for tooltips and screen readers: `Last 6
 * months`, `Year to date`, `3 months to date`, `All`.
 */
export function buttonDescription(
  button: Pick<RangeselectorButton, 'step' | 'stepmode' | 'count'>,
): string {
  const { step } = button;
  if (step === 'all') return 'All';
  const count = Math.floor(button.count);
  const unit = count === 1 ? step : `${step}s`;
  if (button.stepmode === 'todate') {
    return count === 1
      ? `${step.charAt(0).toUpperCase()}${step.slice(1)} to date`
      : `${count} ${unit} to date`;
  }
  return `Last ${count} ${unit}`;
}
