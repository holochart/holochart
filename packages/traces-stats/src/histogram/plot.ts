/**
 * `histogram` renderer (plan E10.1): bar's renderer (one instanced rect set, labels, error bars),
 * with the selection mapped from samples (what `selectedpoints` holds for histograms, Plotly) to
 * the bars that contain them.
 */
import type { TracePlotContext, TraceRenderer, TraceView } from '@mk7s/holochart-runtime';
import { bar, type BarCalc } from '@mk7s/holochart-traces-basic';
import type { HistogramCalc } from './calc.ts';
import { selectedBars } from './hover.ts';

function barContext(ctx: TracePlotContext<HistogramCalc>): TracePlotContext<BarCalc> {
  if (ctx.selectedPoints === undefined || ctx.selectedPoints === null) return ctx;
  return { ...ctx, selectedPoints: selectedBars(ctx.calc, ctx.selectedPoints) };
}

/** The histogram `plot` part: a bar view fed bar-indexed selections. */
export const histogramRenderer: TraceRenderer<HistogramCalc> = {
  create(ctx) {
    const renderer = bar.plot as TraceRenderer<BarCalc>;
    const view = renderer.create(barContext(ctx));
    const out: TraceView<HistogramCalc> = {
      update: (next, plan) => view.update(barContext(next), plan),
      dispose: () => view.dispose?.(),
    };
    if (view.handlePointer) out.handlePointer = (event) => view.handlePointer?.(event);
    return out;
  },
};
