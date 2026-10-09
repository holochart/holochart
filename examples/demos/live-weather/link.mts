/**
 * Links the x axes and the hover of several charts that share a time axis, with nothing but the
 * chart events: a zoom or pan on one (`relayout`) is applied to the others with `chart.relayout`,
 * and hovering one (`hover` / `unhover`) hovers the others at the same x with `chart.hover`.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import type { Chart } from '@mk7s/holochart';

/** The chart type the link works on (re-exported for the tests, which sit outside the workspace). */
export type LinkedChart = Chart;

type Range = readonly [unknown, unknown];

const same = (a: Range, b: Range): boolean =>
  String(a[0]) === String(b[0]) && String(a[1]) === String(b[1]);

/**
 * The x range a `relayout` payload leaves the chart with, given the range before it: `home` when
 * the axis went back to autorange, `null` when the edit did not touch the x range.
 */
export function xRangeAfter(
  edits: Record<string, unknown>,
  before: Range,
  home: Range,
): Range | null {
  if (edits['xaxis.autorange'] === true) return home;
  const whole = edits['xaxis.range'];
  if (Array.isArray(whole) && whole.length === 2) return [whole[0], whole[1]];
  const has0 = 'xaxis.range[0]' in edits;
  const has1 = 'xaxis.range[1]' in edits;
  if (!has0 && !has1) return null;
  return [has0 ? edits['xaxis.range[0]'] : before[0], has1 ? edits['xaxis.range[1]'] : before[1]];
}

export interface Link {
  /** Shows `range` on every chart, and makes it the range a double-click goes back to. */
  show(range: Range): void;
  /** Stops listening; the charts stay as they are. */
  dispose(): void;
}

export function linkCharts(charts: readonly Chart[], home: Range): Link {
  let current: Range = home;
  let base: Range = home;
  // Set while this module is the one moving the charts, so their own events are not relayed back.
  let relaying = false;

  const apply = (range: Range, except?: Chart): void => {
    current = range;
    relaying = true;
    const moves = charts
      .filter((c) => c !== except)
      .map((c) => c.relayout({ 'xaxis.range': [range[0], range[1]] }).catch(() => undefined));
    void Promise.all(moves).then(() => {
      relaying = false;
    });
  };

  const offs = charts.flatMap((chart) => [
    chart.on('relayout', (edits) => {
      if (relaying) return;
      const range = xRangeAfter(edits as Record<string, unknown>, current, base);
      if (range === null || same(range, current)) return;
      // An autorange reset leaves the source at its data extent; bring it to the shared range too.
      apply(range, edits['xaxis.autorange'] === true ? undefined : chart);
    }),
    chart.on('hover', (e) => {
      // Programmatic hovers carry no DOM event; relaying those would loop.
      if (e.event === undefined || e.xvals?.[0] === undefined) return;
      for (const other of charts) if (other !== chart) other.hover({ xval: e.xvals[0] });
    }),
    chart.on('unhover', (e) => {
      if (e.event === undefined) return;
      for (const other of charts) if (other !== chart) other.unhover();
    }),
  ]);

  return {
    show(range) {
      base = range;
      apply(range);
    },
    dispose() {
      for (const off of offs) off();
    },
  };
}
