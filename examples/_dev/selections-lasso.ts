import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';
import { exposeChart } from './selections-hook.mts';

/**
 * A restored lasso selection (plan E5.12): `layout.selections` holds a `path` polygon in data
 * units (`M x,y L x,y … Z`, dates written `2024-03-01_12:00`), so a lasso drawn in one session
 * comes back in the next, selecting the same points. Here the lasso picks the late-evening
 * readings of a week of sensor data on a date axis; `selected` / `unselected` styles show them.
 */
export const meta: ExampleMeta = {
  title: 'Selections: restored lasso on a date axis',
  description:
    'A path (lasso) selection given in layout.selections selects points of a date-axis scatter on load.',
  tags: ['dev', 'interaction', 'selections', 'lasso', 'date', 'scatter'],
  size: { width: 640, height: 400 },
  testTolerance: 0.004,
};

const HOUR = 3_600_000;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(9));
  const t0 = Date.parse('2024-03-01T00:00:00Z');
  const x: string[] = [];
  const y: number[] = [];
  for (let i = 0; i < 7 * 24; i += 1) {
    const t = t0 + i * HOUR;
    const hour = i % 24;
    x.push(new Date(t).toISOString().slice(0, 16).replace('T', ' '));
    y.push(Math.round((18 + 5 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + normal()) * 10) / 10);
  }
  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Temperature',
        x,
        y,
        marker: { size: 5 },
        selected: { marker: { color: '#ff9e00', size: 7 } },
        unselected: { marker: { opacity: 0.25 } },
      },
    ],
    layout: {
      dragmode: 'lasso',
      yaxis: { ticksuffix: ' °C' },
      selections: [
        {
          type: 'path',
          path: 'M2024-03-02_12:00,22 L2024-03-04_18:00,25.5 L2024-03-06_06:00,21 L2024-03-05_00:00,16.5 L2024-03-03_06:00,18 Z',
        },
      ],
    },
  });
  const dispose = exposeChart(chart);
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => {
      dispose();
      chart.destroy();
    },
  };
}
