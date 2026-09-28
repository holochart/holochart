/**
 * Accessible description of an indicator (plan E17.1, E12.7): its title (or name), the value with
 * the number's prefix and suffix, the change from the delta reference, and the gauge range and
 * threshold.
 */
import {
  accessibleText,
  formatPlainNumber,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import type { IndicatorCalc } from './calc.ts';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v !== null && typeof v === 'object' ? (v as Obj) : {});

/** The indicator module's `describe()`. */
export function describeIndicator(ctx: DescribeContext<IndicatorCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const title = accessibleText(obj(trace['title'])['text']);
  const name = title || traceNameText(trace['name'], ctx.index);
  const number = obj(trace['number']);
  const affix = (v: unknown): string => accessibleText(typeof v === 'string' ? v : '');
  let summary = `Indicator "${name}": `;
  summary +=
    calc.value === undefined
      ? 'no value.'
      : `${affix(number['prefix'])}${formatPlainNumber(calc.value)}${affix(number['suffix'])}.`;
  if (trace['_hasDelta'] === true && Number.isFinite(calc.delta) && calc.reference !== undefined) {
    const change =
      calc.delta === 0
        ? 'unchanged'
        : `${calc.delta > 0 ? 'up' : 'down'} ${formatPlainNumber(Math.abs(calc.delta))}`;
    const relative = Number.isFinite(calc.relativeDelta)
      ? ` (${formatPlainNumber(Math.abs(calc.relativeDelta) * 100)}%)`
      : '';
    summary += ` ${change[0]!.toUpperCase()}${change.slice(1)}${calc.delta === 0 ? '' : relative} from ${formatPlainNumber(calc.reference)}.`;
  }
  if (trace['_hasGauge'] === true) {
    const gauge = obj(trace['gauge']);
    const range = obj(gauge['axis'])['range'];
    if (Array.isArray(range)) {
      summary += ` Gauge from ${formatPlainNumber(Number(range[0]))} to ${formatPlainNumber(Number(range[1]))}`;
      const threshold = obj(gauge['threshold'])['value'];
      summary +=
        typeof threshold === 'number' ? `, threshold ${formatPlainNumber(threshold)}.` : '.';
    }
  }
  if (calc.value === undefined) return { kind: 'indicator', summary };
  const hasReference = trace['_hasDelta'] === true && calc.reference !== undefined;
  return {
    kind: 'indicator',
    summary,
    insight: {
      kind: 'value',
      value: calc.value,
      ...(hasReference ? { reference: calc.reference } : {}),
      formatValue: (v) =>
        `${affix(number['prefix'])}${formatPlainNumber(v)}${affix(number['suffix'])}`,
    },
  };
}
