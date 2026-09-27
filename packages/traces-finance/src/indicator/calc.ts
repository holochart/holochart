/** `indicator` calc (plan E12.7), following plotly.js `traces/indicator/calc.js`. */
import type { FullTrace } from '@mk7s/holochart-core';

/** The value of an indicator and its difference to the delta reference. */
export interface IndicatorCalc {
  /** `value`, or `undefined` when unset. */
  readonly value: number | undefined;
  /** The delta reference (`delta.reference`, default `value`). */
  readonly reference: number | undefined;
  /** `value − reference` (NaN without a value). */
  readonly delta: number;
  /** `(value − reference) / reference`. */
  readonly relativeDelta: number;
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** The indicator `calc`. */
export function calcIndicator(trace: FullTrace): IndicatorCalc {
  const value = num(trace['value']);
  const reference =
    num((trace['delta'] as { reference?: unknown } | undefined)?.reference) ?? value;
  const delta = value !== undefined && reference !== undefined ? value - reference : NaN;
  return { value, reference, delta, relativeDelta: delta / (reference as number) };
}
