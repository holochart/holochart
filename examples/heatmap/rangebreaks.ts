import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A heatmap on a date axis with range breaks (plan E11.1, E3.8, ADR-022): daily sector returns
 * for every calendar day of January and February 2024, with weekends and two market holidays
 * hidden by `rangebreaks`. As in Plotly, the columns that fall in a break are dropped; the others
 * tile the compressed axis, so each trading day keeps a full-width column and Friday meets Monday.
 */
export const meta: ExampleMeta = {
  title: 'Heatmap: range breaks',
  description:
    'Daily sector returns with weekends and holidays hidden by rangebreaks: trading days only, each a full column.',
  tags: ['heatmap', 'scientific', 'date', 'rangebreaks'],
  testTolerance: 0.004,
};

const DAY = 86_400_000;

export function run(el: HTMLElement): ExampleHandle {
  const start = Date.UTC(2024, 0, 1);
  const days = Array.from({ length: 60 }, (_, i) =>
    new Date(start + i * DAY).toISOString().slice(0, 10),
  );
  const sectors = ['Energy', 'Tech', 'Health', 'Finance', 'Retail'];
  // Deterministic pseudo-returns (%), with a shared market swing.
  const z = sectors.map((_, s) =>
    days.map((_, d) => {
      const market = 1.2 * Math.sin(d / 4);
      const own = Math.sin(d * (1.7 + s * 0.9) + s) * (0.6 + 0.2 * s);
      return +(market + own).toFixed(2);
    }),
  );
  const chart = createChart(el, {
    data: [
      {
        type: 'heatmap',
        x: days,
        y: sectors,
        z,
        colorscale: 'RdBu',
        zmid: 0,
        colorbar: { title: { text: 'return (%)' } },
        hovertemplate: '%{y}, %{x|%a %b %d}: %{z:+.2f}%<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Daily sector returns, trading days only' },
      xaxis: {
        rangebreaks: [{ bounds: ['sat', 'mon'] }, { values: ['2024-01-15', '2024-02-19'] }],
      },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
