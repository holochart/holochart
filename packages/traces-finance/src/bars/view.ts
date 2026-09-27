/**
 * Rendering of the bar-like financial traces (plan E12.4, E12.5, E22.1): the bars and their labels
 * are bar's own renderer (one instanced rect set, batched SDF labels, `uniformtext`, selection
 * dimming, label links), fed the trace *as bar reads it* — per-bar fill and outline colors from
 * the type's own style attributes, label strings from its `textinfo` / `texttemplate` — so the
 * geometry, label placement (`inside` / `outside` / `auto`, `insidetextanchor`, `textangle`,
 * `constraintext`) and update paths are exactly bar's. Each type adds its connectors as extra
 * layers of the same view.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type {
  ComponentPointerEvent,
  TracePlotContext,
  TraceRenderer,
  TraceUpdatePlan,
  TraceView,
} from '@mk7s/holochart-runtime';
import { bar, type BarCalc } from '@mk7s/holochart-traces-basic';

/** Extra layers of a bar-like view (connectors), drawn with the bars. */
export interface BarLikeLayer<C> {
  update(ctx: TracePlotContext<C>, plan: TraceUpdatePlan): void;
}

/** What a bar-like type adds to bar's renderer. */
export interface BarLikeRenderer<C extends BarCalc> {
  /** The trace as bar's renderer reads it (per-bar colors, label strings, no corner radius). */
  barTrace(ctx: TracePlotContext<C>): FullTrace;
  /** The type's extra layers, created once per view. */
  layers?(): BarLikeLayer<C>[];
}

const FULL: TraceUpdatePlan = { calc: true, plot: true, style: true, transform: true };

class BarLikeView<C extends BarCalc> implements TraceView<C> {
  readonly #spec: BarLikeRenderer<C>;
  readonly #bars: TraceView<BarCalc>;
  readonly #layers: BarLikeLayer<C>[];

  constructor(ctx: TracePlotContext<C>, spec: BarLikeRenderer<C>) {
    this.#spec = spec;
    this.#bars = bar.plot!.create(this.#barContext(ctx));
    this.#layers = spec.layers?.() ?? [];
    for (const layer of this.#layers) layer.update(ctx, FULL);
  }

  #barContext(ctx: TracePlotContext<C>): TracePlotContext<BarCalc> {
    return { ...ctx, trace: this.#spec.barTrace(ctx) };
  }

  update(ctx: TracePlotContext<C>, plan: TraceUpdatePlan): void {
    this.#bars.update(this.#barContext(ctx), plan);
    for (const layer of this.#layers) layer.update(ctx, plan);
  }

  handlePointer(event: ComponentPointerEvent): boolean {
    return this.#bars.handlePointer?.(event) === true;
  }

  dispose(): void {
    this.#bars.dispose?.();
  }
}

/** A trace renderer drawing bars with bar's renderer plus the type's layers. */
export function barLikeRenderer<C extends BarCalc>(spec: BarLikeRenderer<C>): TraceRenderer<C> {
  return { create: (ctx) => new BarLikeView(ctx, spec) };
}
