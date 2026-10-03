import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Style rules (plan E8.5): conditional per-point styling as plain JSON. A cloud of 400 sensor
 * readings (`customdata`: `[sensor id, site]`) is drawn in one trace; `styleRules` then
 * - colors readings above the 2.0 alert line red and enlarges them,
 * - marks the readings of sites `A` and `B` inside the ±0.5 band with squares,
 * - and highlights the ten first readings (`pointNumber`) gold, winning over the other rules.
 *
 * The rules survive `chartToJSON()` unchanged, unlike style functions.
 */
export const meta: ExampleMeta = {
  title: 'Scatter: style rules',
  description:
    'Serializable styleRules: per-point colors, sizes and symbols from conditions on y, customdata[1] and pointNumber; later rules win.',
  tags: ['scatter', 'markers', 'style-rules', 'conditional-styling'],
  testTolerance: 0.004,
};

const SITES = ['A', 'B', 'C', 'D'];

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(7);
  const normal = gaussian(rng(8));
  const n = 400;
  const x = Float64Array.from({ length: n }, (_, i) => i);
  const y = Float64Array.from({ length: n }, (_, i) => Math.sin(i / 40) * 1.2 + normal() * 0.6);
  const customdata = Array.from({ length: n }, (_, i) => [
    `s${i % 17}`,
    SITES[Math.floor(random() * SITES.length)] as string,
  ]);

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'readings',
        x,
        y,
        customdata,
        marker: { size: 5, color: '#64748b' },
        hovertemplate: 'reading %{x}: %{y:.2f}<br>site %{customdata[1]}<extra></extra>',
        styleRules: [
          { when: { y: { gt: 2 } }, set: { 'marker.color': '#ef4444', 'marker.size': 10 } },
          {
            when: { y: { between: [-0.5, 0.5] }, 'customdata[1]': { in: ['A', 'B'] } },
            set: { 'marker.symbol': 'square', 'marker.color': '#3b82f6', 'marker.size': 7 },
          },
          {
            when: { pointNumber: { lt: 10 } },
            set: { 'marker.color': '#facc15', 'marker.size': 9 },
          },
        ],
      },
    ],
    layout: {
      title: { text: 'Sensor readings with style rules' },
      xaxis: { title: { text: 'Reading' } },
      yaxis: { title: { text: 'Deviation' } },
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          x0: 0,
          x1: 1,
          y0: 2,
          y1: 2,
          line: { color: '#ef4444', width: 1, dash: 'dash' },
        },
      ],
      showlegend: false,
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
