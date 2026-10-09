/**
 * DOM and layout helpers for the index funds demo: the OpenRouter demo's toolbar, segmented
 * toggles and settle wait (styled after the default template, ADR-021), pickers for the fund and
 * the half built on them, and the marks every time chart uses to show where the four years split.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import type { LayoutAnnotation, LayoutShape } from '@mk7s/holochart';
import { segmented } from '../openrouter/ui.mts';
import { BASE_DATE, CORE, LAST_DATE, PERIODS, SPLIT_DATE } from './analysis.mts';
import type { Fund, Half, Period } from './analysis.mts';

export { chartConfig, frame, isNarrow, LOOK, segmented, settled } from '../openrouter/ui.mts';
export type { Frame } from '../openrouter/ui.mts';

/** A fund toggle in the toolbar (SPY, QQQ, DIA, IWM unless `funds` says otherwise). */
export function fundPicker<T extends Fund>(
  toolbar: HTMLElement,
  onChange: (fund: T) => void,
  funds: readonly T[] = CORE as readonly T[],
  initial: T | undefined = funds[0],
): { set(value: T): void } {
  return segmented<T>(
    toolbar,
    'Fund',
    funds.map((value) => ({ value, text: value })),
    onChange,
    initial,
  );
}

/** A 2022–24 / 2024–26 toggle in the toolbar, with "All four years" first when `all` is set. */
export function periodPicker<T extends Period = Half>(
  toolbar: HTMLElement,
  onChange: (period: T) => void,
  all = false,
  initial?: T,
): { set(value: T): void } {
  const keys = (all ? ['all', 'first', 'second'] : ['first', 'second']) as T[];
  return segmented<T>(
    toolbar,
    'Period',
    keys.map((value) => ({
      value,
      text: value === 'all' ? 'All four years' : PERIODS[value].short,
    })),
    onChange,
    initial ?? keys[0],
  );
}

/** `#rrggbb` with an alpha, as `rgba(…)`. */
export function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Shapes that show the two halves on a date x axis: a faint band in each half's color over the
 * full plot height and a dotted line at the split (Sep 30, 2024). `xref` picks the axis (`'x'`,
 * `'x2'`, …); `yref` is the matching `'y domain'` so the marks span that subplot only.
 */
export function halfShapes(xref = 'x', yref = 'y domain'): LayoutShape[] {
  const band = (x0: string, x1: string, color: string): LayoutShape => ({
    type: 'rect',
    xref,
    yref,
    x0,
    x1,
    y0: 0,
    y1: 1,
    fillcolor: rgba(color, 0.05),
    line: { width: 0 },
    layer: 'below',
  });
  return [
    band(BASE_DATE, SPLIT_DATE, PERIODS.first.color),
    band(SPLIT_DATE, LAST_DATE, PERIODS.second.color),
    {
      type: 'line',
      xref,
      yref,
      x0: SPLIT_DATE,
      x1: SPLIT_DATE,
      y0: 0,
      y1: 1,
      line: { color: '#80838f', width: 1, dash: 'dot' },
    },
  ];
}

/**
 * The halves' names, each in its color, at the top of its band (`y` in fractions of the plot
 * height, 1 is the top). Pass `long` for "Oct 2022 – Sep 2024" instead of "2022–24".
 */
export function halfLabels(xref = 'x', yref = 'y domain', long = false, y = 1): LayoutAnnotation[] {
  const label = (x: string, half: Half): LayoutAnnotation => ({
    xref,
    yref,
    x,
    y,
    text: long ? PERIODS[half].label : PERIODS[half].short,
    showarrow: false,
    xanchor: 'left',
    yanchor: 'top',
    xshift: 6,
    yshift: -4,
    font: { color: PERIODS[half].color, size: 10 },
  });
  return [label(BASE_DATE, 'first'), label(SPLIT_DATE, 'second')];
}
