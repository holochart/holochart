/**
 * Figure types of the full bundle (backlog S1.6): every built-in trace and layout attribute typed.
 * `exports.ts` types the Plotly-style API against them (types only, no runtime cost).
 *
 * The runtime's own functions (`@mk7s/holochart-runtime`) take the loose `FigureInput`, so partial
 * bundles and plugin traces still compile; this bundle registers every built-in module, so here a
 * figure is checked against all of them.
 */
import type { FigureInput, Frame as CoreFrame } from '@mk7s/holochart-core';
import type { Data, Layout } from './generated/figure.ts';

/**
 * A figure of the full bundle: traces (`Data`, discriminated on `type`), layout, config, frames and
 * datasets, every attribute typed and documented.
 *
 * @example
 * ```ts
 * import { createChart, type Figure } from '@mk7s/holochart';
 * const figure: Figure = {
 *   data: [{ type: 'bar', x: ['a', 'b'], y: [1, 2], marker: { color: ['red', 'blue'] } }],
 *   layout: { title: { text: 'Sales' }, barmode: 'stack' },
 * };
 * createChart(el, figure);
 * ```
 */
export type Figure = FigureInput<Data, Layout>;

/** An animation frame of a {@link Figure}: partial traces and layout changes applied as one step. */
export type Frame = CoreFrame<Data>;
