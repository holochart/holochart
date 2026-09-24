import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A legend laid out as a grid inside the plot (plan E5.2): eight temperature probes in a cold-chain
 * warehouse. The default look's legend is already a row (`orientation: 'h'`); here it moves into
 * the empty band above the curves (`y` / `yanchor` in paper units) and every entry gets the same
 * width, a quarter of the plot width (`entrywidth: 0.25`, `entrywidthmode: 'fraction'`), so the
 * eight probes line up in four columns instead of flowing ragged.
 *
 * Because the legend sits on top of the grid, its text gets a dark halo (`font.shadow: 'auto'`),
 * the probe ids are shown in capitals (`font.textcase: 'upper'`), and the title sits above the grid
 * (`title.side: 'top left'`) rather than to its left, underlined (`title.font.lineposition`).
 */
export const meta: ExampleMeta = {
  title: 'Legend: fixed-width columns inside the plot',
  description:
    'Eight probe series with a horizontal legend drawn over the plot in four equal columns, with haloed, uppercased entries and an underlined title.',
  tags: ['legend', 'line', 'scatter'],
  size: { width: 720, height: 420 },
  testTolerance: 0.004,
};

const PROBES = [
  'dock-a',
  'dock-b',
  'aisle-1',
  'aisle-2',
  'aisle-3',
  'freezer',
  'chiller',
  'office',
];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(64));
  const hours = Array.from({ length: 97 }, (_, i) => i / 2);

  const data = PROBES.map((probe, p) => {
    const setpoint = p === 5 ? -18 : p === 6 ? 2 : 4 + p * 0.6;
    const swing = p < 2 ? 2.4 : 0.8;
    let drift = 0;
    const y = hours.map((h) => {
      drift = drift * 0.9 + normal() * 0.25;
      // Loading docks warm up while the doors are open (08:00–18:00).
      const open = p < 2 && h % 24 >= 8 && h % 24 <= 18 ? 3 : 0;
      return +(setpoint + swing * Math.sin((h / 24) * 2 * Math.PI) + open + drift).toFixed(2);
    });
    return { type: 'scatter' as const, mode: 'lines' as const, name: probe, x: hours, y };
  });

  const chart = createChart(el, {
    data,
    layout: {
      title: { text: 'Cold-chain warehouse: probe temperatures, last 48 h' },
      xaxis: { title: { text: 'Hours' }, dtick: 6 },
      yaxis: { title: { text: '°C' }, range: [-22, 21] },
      legend: {
        x: 0.01,
        y: 0.99,
        yanchor: 'top',
        entrywidth: 0.25,
        entrywidthmode: 'fraction',
        font: { shadow: 'auto', textcase: 'upper' },
        title: { text: 'Probe', side: 'top left', font: { lineposition: 'under' } },
      },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
