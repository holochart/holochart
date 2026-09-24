import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Basic line chart (plan E9.2): one year of daily values on a date axis. `x` holds ISO date
 * strings, so the axis becomes a date axis on its own; `mode: 'lines'` draws the line only.
 */
export const meta: ExampleMeta = {
  title: 'Line: basic time series',
  description: 'A year of daily values as a line on a date axis, with a title and axis titles.',
  tags: ['line', 'scatter', 'date', 'time-series'],
  testTolerance: 0.004,
};

const DAY = 86_400_000;

export function run(el: HTMLElement): ExampleHandle {
  // A seeded random walk with a weekly cycle: deterministic, so the visual test is stable.
  const normal = gaussian(rng(101));
  const start = Date.UTC(2025, 0, 1);
  const x: string[] = [];
  const y: number[] = [];
  let level = 1200;
  for (let i = 0; i < 365; i++) {
    level += 4 + normal() * 18;
    const weekend = [0, 6].includes(new Date(start + i * DAY).getUTCDay());
    x.push(new Date(start + i * DAY).toISOString().slice(0, 10));
    y.push(Math.round(level * (weekend ? 0.82 : 1)));
  }

  const chart = createChart(el, {
    data: [{ type: 'scatter', mode: 'lines', name: 'Active users', x, y }],
    layout: {
      title: { text: 'Daily active users, 2025' },
      xaxis: { title: { text: 'Date' } },
      yaxis: { title: { text: 'Users' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
