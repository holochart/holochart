/**
 * DOM helpers for the tirzepatide review demo: the OpenRouter demo's toolbar, segmented toggles and
 * settle wait (styled after the default template, ADR-021), plus `mount` for the charts that have
 * no toolbar.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import { createChart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle } from '../../_lib/types.ts';
import { chartConfig, isNarrow, settled } from '../openrouter/ui.mts';

export { chartConfig, frame, isNarrow, LOOK, segmented, settled } from '../openrouter/ui.mts';

/** Creates a chart from `build(narrow)` with the demo config, and returns the example handle. */
export function mount(el: HTMLElement, build: (narrow: boolean) => FigureInput): ExampleHandle {
  const narrow = isNarrow(el);
  const figure = build(narrow);
  const chart = createChart(el, {
    ...figure,
    config: { ...chartConfig(narrow), ...figure.config },
  });
  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}

/** Styling shared by the forest plots' no-effect line at a ratio of 1. */
export const NO_EFFECT_LINE = { color: '#80838f', width: 1, dash: 'dash' } as const;
