/**
 * `funnel` calc and cross-trace calc (plan E12.5), ported from plotly.js' `funnel/calc.js`,
 * `cross_trace_calc.js` and the funnel branches of bar's `setGroupPositions`.
 *
 * - **Stages.** One bar per stage; negative values are treated as missing (Plotly).
 * - **Centered bars.** Every bar is centered on the value axis' zero: it spans `−v / 2` to
 *   `v / 2` (`group` and `overlay` modes); in `stack` mode (the default) the traces' bars of a
 *   stage stack, and the whole stack is centered.
 * - **Percentages** (per trace, Plotly's `begR`, `difR`, `sumR`): of the first stage, of the
 *   previous stage with a value (1 for the first), of the trace's total.
 * - **Connectors.** A stage connects to the next when both have a value.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { CalcContext, CrossTraceContext, CrossTraceEntry } from '@mk7s/holochart-runtime';
import { calcBar, type BarCalc } from '@mk7s/holochart-traces-basic';
import {
  centerStacks,
  crossTraceLayout,
  layoutAlone,
  stackInput,
  type BarLikeLayout,
} from '../bars/layout.ts';

/** Funnel calcdata: bar's calc (bars centered on zero) plus the stage percentages. */
export interface FunnelCalc extends BarCalc {
  /** Value as a fraction of the first stage's (Plotly's `begR`). */
  readonly percentInitial: Float64Array;
  /** Value as a fraction of the previous stage with a value (Plotly's `difR`). */
  readonly percentPrevious: Float64Array;
  /** Value as a fraction of the trace's total (Plotly's `sumR`). */
  readonly percentTotal: Float64Array;
  /** 1 when a connector goes from this stage to the next (Plotly's `cNext`). */
  readonly connectNext: Uint8Array;
}

/** How funnels are laid out (see `bars/layout.ts`): centered bars, centered stacks. */
export const FUNNEL_LAYOUT: BarLikeLayout<FunnelCalc> = {
  type: 'funnel',
  // Stacks start from zero and are centered afterwards; other modes use the centered bases.
  input: (calc, trace, index, mode) =>
    stackInput(
      calc,
      trace,
      index,
      mode === 'stack'
        ? { base: new Float64Array(calc.length), hasBase: new Uint8Array(calc.length) }
        : undefined,
    ),
  adjust: (inputs, outputs, mode) => {
    if (mode === 'stack') centerStacks(inputs, outputs);
  },
};

/** Funnel calc: stages, centered bases and percentages, laid out as if the trace were alone. */
export function calcFunnel(trace: FullTrace, ctx: CalcContext): FunnelCalc {
  const bars = calcBar(trace, ctx);
  const n = bars.length;
  const size = new Float64Array(n);
  const base = new Float64Array(n);
  const hasBase = new Uint8Array(n);
  const connectNext = new Uint8Array(n);
  const percentInitial = new Float64Array(n).fill(NaN);
  const percentPrevious = new Float64Array(n).fill(NaN);
  const percentTotal = new Float64Array(n).fill(NaN);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const v = bars.size[i]!;
    // Negative values are missing values (Plotly).
    size[i] = v >= 0 ? v : NaN;
    if (Number.isFinite(size[i]!)) {
      base[i] = -size[i]! / 2;
      hasBase[i] = 1;
      total += size[i]!;
    }
  }
  const first = Number.isFinite(size[0]!) ? size[0]! : 0;
  let previous: number | undefined;
  for (let i = 0; i < n; i++) {
    const v = size[i]!;
    if (i + 1 < n && Number.isFinite(v) && Number.isFinite(size[i + 1]!)) connectNext[i] = 1;
    percentInitial[i] = (Number.isFinite(v) ? v : 0) / first;
    if (!Number.isFinite(v)) continue;
    percentTotal[i] = v / total;
    percentPrevious[i] = previous !== undefined ? v / previous : 1;
    previous = v;
  }
  const calc: FunnelCalc = {
    ...bars,
    size,
    base,
    hasBase,
    percentInitial,
    percentPrevious,
    percentTotal,
    connectNext,
  };
  layoutAlone(FUNNEL_LAYOUT, calc, trace, ctx.index, ctx.fullLayout);
  return calc;
}

/** Cross-trace calc: every funnel of a subplot laid out together per `funnelmode`. */
export function crossTraceCalcFunnel(
  entries: readonly CrossTraceEntry<FunnelCalc>[],
  ctx: CrossTraceContext,
): void {
  crossTraceLayout(FUNNEL_LAYOUT, entries, ctx);
}
