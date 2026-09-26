/**
 * The two call styles of every Express function (plan §7.4, E23.6): `fn(data, options)` returns
 * the figure, `fn(el, data, options)` renders it into `el` with `newPlot` and resolves with the
 * chart.
 */
import { newPlot, type Chart } from '@mk7s/holochart-runtime';
import type { DataInput } from '../data/table.ts';
import type { ExpressFigure } from '../options.ts';

/**
 * An Express function: builds a figure from data, or renders it when given an element first.
 *
 * @example
 * ```ts
 * const figure = hx.scatter(rows, { x: 'gdp', y: 'life' }); // a figure to adjust
 * figure.layout.title = { text: 'Income and life expectancy' };
 * createChart(el, figure);
 *
 * const chart = await hx.scatter(el, rows, { x: 'gdp', y: 'life' }); // or render directly
 * ```
 */
export interface ExpressFunction<O> {
  (data: DataInput | null | undefined, options?: O): ExpressFigure;
  (el: HTMLElement, data: DataInput | null | undefined, options?: O): Promise<Chart>;
}

/** Whether `v` is a DOM element (duck-typed, so elements of other windows count too). */
export function isElement(v: unknown): v is HTMLElement {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { nodeType?: unknown }).nodeType === 1 &&
    typeof (v as { tagName?: unknown }).tagName === 'string'
  );
}

/** Wrap a figure builder into an {@link ExpressFunction}. */
export function expressFunction<O>(
  build: (data: DataInput | null | undefined, options: O) => ExpressFigure,
): ExpressFunction<O> {
  function fn(a: unknown, b?: unknown, c?: unknown): ExpressFigure | Promise<Chart> {
    if (isElement(a)) {
      try {
        return newPlot(a, build(b as DataInput | null | undefined, (c ?? {}) as O));
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return build(a as DataInput | null | undefined, (b ?? {}) as O);
  }
  return fn as ExpressFunction<O>;
}
