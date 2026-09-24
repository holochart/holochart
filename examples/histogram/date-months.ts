import { createChart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Date bins by month (plan E10.1): on a date axis, `xbins.size: 'M1'` bins by calendar month
 * (`'M3'` would bin by quarter, `'M12'` by year), so bins follow the calendar — February's bin is
 * shorter than March's. The samples are whole days, so the bins are shifted half a day to keep
 * every day inside one month, and hover shows the month range (`Jan 1, 2024 - Jan 31, 2024`).
 * The bars share the smallest bin width (February's), as in Plotly.
 */
export const meta: ExampleMeta = {
  title: 'Histogram: dates by month',
  description:
    'Sign-up dates over two years binned by calendar month with xbins.size "M1", growing with a seasonal swing.',
  tags: ['histogram', 'chart', 'date', 'bins', 'statistical'],
};

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(17);
  const start = Date.UTC(2024, 0, 1);
  const days = 731;
  const x: string[] = [];
  // Rejection sampling of a rising, seasonal sign-up rate.
  while (x.length < 1800) {
    const d = Math.floor(random() * days);
    const rate = (0.35 + (0.65 * d) / days) * (0.75 + 0.25 * Math.sin((2 * Math.PI * d) / 365));
    if (random() < rate) x.push(new Date(start + d * 86_400_000).toISOString().slice(0, 10));
  }
  const chart = createChart(el, {
    data: [{ type: 'histogram', x, name: 'Sign-ups', xbins: { size: 'M1' } }],
    layout: {
      title: { text: 'Monthly sign-ups' },
      yaxis: { title: { text: 'Sign-ups per month' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
