import { createChart, makeSubplots } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `makeSubplots` (plan E4.4), the counterpart of Python's `make_subplots`: a 2×2 grid whose first
 * column is one tall subplot (`rowspan: 2`, the cell under it is `null`), with `sharedX: true` and
 * subplot titles. The right column shares ONE x axis (`x2`), drawn under its bottom subplot, so
 * the bars and the line above it line up month by month and zoom together; the spanning cell has
 * its own axis. `sp.place()` points each trace at a cell, and `sp.layout` (axis domains, anchors,
 * title annotations) is spread into the figure layout.
 */
export const meta: ExampleMeta = {
  title: 'Grid: makeSubplots with sharedX and a rowspan',
  description:
    'makeSubplots 2×2 with a tall left subplot, a shared x axis in the right column, and subplot titles.',
  tags: ['dev', 'grid', 'subplots', 'make-subplots', 'layout', 'scatter', 'bar'],
  size: { width: 800, height: 480 },
  testTolerance: 0.004,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function run(el: HTMLElement): ExampleHandle {
  // Seeded monthly temperature and sales that follow it, so the panels tell one story.
  const normal = gaussian(rng(2024));
  const temp = MONTHS.map((_, i) => 12 - 10 * Math.cos((2 * Math.PI * i) / 12) + normal());
  const sales = temp.map((t) => Math.round(80 + t * 9 + normal() * 15));

  const sp = makeSubplots({
    rows: 2,
    cols: 2,
    sharedX: true,
    specs: [
      [{ rowspan: 2 }, {}],
      [null, {}],
    ],
    subplotTitles: ['Sales vs temperature', 'Monthly sales', 'Mean temperature'],
    columnWidths: [2, 3],
  });

  const chart = createChart(el, {
    data: [
      sp.place(
        {
          type: 'scatter',
          mode: 'markers',
          name: 'Months',
          x: temp,
          y: sales,
          text: MONTHS,
          marker: { size: 9, opacity: 0.85 },
        },
        1,
        1,
      ),
      sp.place({ type: 'bar', name: 'Sales', x: MONTHS, y: sales }, 1, 2),
      sp.place(
        { type: 'scatter', mode: 'lines+markers', name: 'Temperature', x: MONTHS, y: temp },
        2,
        2,
      ),
    ],
    layout: {
      ...sp.layout,
      showlegend: false,
    },
    config: { responsive: true },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
