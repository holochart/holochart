/**
 * DOM helpers for the TQQQ and SOXL demo: the OpenRouter demo's toolbar, segmented toggles and
 * settle wait (styled after the default template, ADR-021), plus a ticker picker built on them.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import { segmented } from '../openrouter/ui.mts';
import type { Fund } from './analysis.mts';

export { chartConfig, frame, isNarrow, LOOK, segmented, settled } from '../openrouter/ui.mts';
export type { Frame } from '../openrouter/ui.mts';

/** A TQQQ / SOXL toggle in the toolbar. */
export function fundPicker(
  toolbar: HTMLElement,
  onChange: (fund: Fund) => void,
  initial: Fund = 'TQQQ',
): { set(value: Fund): void } {
  return segmented<Fund>(
    toolbar,
    'Fund',
    [
      { value: 'TQQQ', text: 'TQQQ' },
      { value: 'SOXL', text: 'SOXL' },
    ],
    onChange,
    initial,
  );
}
