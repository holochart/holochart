import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A vertical legend taller than the plot (plan E5.2): hourly load of 24 grid regions. As in Plotly,
 * a vertical legend beside the plot is at most as tall as the plot (`maxheight` defaults to 1, a
 * fraction of the plot height), so the 24 entries scroll inside the box: the wheel over the legend
 * scrolls it (without zooming the plot), the scrollbar at its right edge can be dragged, a finger
 * drags the items, and moving the keyboard focus through the items scrolls the focused one into
 * view. The legend's title scrolls with the items.
 *
 * The legend starts at the top (the visual baseline); its scroll position is kept when a click
 * toggles a region.
 */
export const meta: ExampleMeta = {
  title: 'Legend: scrolling vertical legend',
  description:
    'Twenty-four load curves with a vertical legend beside the plot that is taller than the plot, so it scrolls, with a scrollbar.',
  tags: ['legend', 'line', 'scatter'],
  size: { width: 720, height: 420 },
  testTolerance: 0.004,
};

const REGIONS = [
  'Alpine',
  'Baltic',
  'Basque',
  'Brittany',
  'Calabria',
  'Carpathia',
  'Catalonia',
  'Cornwall',
  'Dalmatia',
  'Flanders',
  'Galicia',
  'Hesse',
  'Jutland',
  'Lapland',
  'Lorraine',
  'Moravia',
  'Normandy',
  'Piedmont',
  'Provence',
  'Saxony',
  'Silesia',
  'Tuscany',
  'Wallonia',
  'Zealand',
];

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(71));
  const hours = Array.from({ length: 25 }, (_, h) => h);
  const data = REGIONS.map((name, r) => {
    const base = 2 + (r % 6) * 1.1;
    const peak = 17 + (r % 4);
    return {
      type: 'scatter' as const,
      mode: 'lines' as const,
      name,
      x: hours,
      y: hours.map(
        (h) =>
          +(
            base *
              (1 +
                0.35 * Math.exp(-(((h - peak) / 3) ** 2)) +
                0.15 * Math.sin((h / 24) * 2 * Math.PI)) +
            normal() * 0.05
          ).toFixed(2),
      ),
      line: { width: 1.25 },
    };
  });

  const chart = createChart(el, {
    data,
    layout: {
      title: { text: 'Grid load by region, one day' },
      xaxis: { title: { text: 'Hour' }, dtick: 3 },
      yaxis: { title: { text: 'GW' } },
      legend: {
        orientation: 'v',
        x: 1.02,
        xanchor: 'left',
        y: 1,
        yanchor: 'top',
        title: { text: 'Region' },
      },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
