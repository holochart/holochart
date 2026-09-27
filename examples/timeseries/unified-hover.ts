import { componentsReady, createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Unified hover (plan E12.1, E6.1): two weeks of hourly temperatures from three greenhouse
 * sensors. `hovermode: 'x unified'` shows one hover label listing every sensor at the hour under
 * the pointer, with a spike line across the plot; `xaxis.hoverformat` formats its date title.
 */
export const meta: ExampleMeta = {
  title: 'Time series: unified hover',
  description:
    'Hourly temperatures from three sensors with one hover label for all series at the hovered time (hovermode x unified).',
  tags: ['time-series', 'date', 'line', 'scatter', 'hover'],
  testTolerance: 0.004,
};

const HOUR = 3_600_000;

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(1402));
  const start = Date.UTC(2025, 4, 1);
  const x: number[] = [];
  const sensors = [
    { name: 'North bay', base: 19, swing: 5 },
    { name: 'South bay', base: 22, swing: 7 },
    { name: 'Nursery', base: 24, swing: 2.5 },
  ];
  const ys = sensors.map(() => [] as number[]);
  const drift = sensors.map(() => 0);
  for (let h = 0; h < 14 * 24; h++) {
    x.push(start + h * HOUR);
    const daily = Math.sin((((h % 24) - 9) / 24) * 2 * Math.PI);
    sensors.forEach((s, k) => {
      drift[k] = 0.9 * drift[k]! + normal() * 0.3;
      ys[k]!.push(Math.round((s.base + s.swing * daily + drift[k]!) * 10) / 10);
    });
  }

  const chart = createChart(el, {
    data: sensors.map((s, k) => ({
      type: 'scatter',
      mode: 'lines',
      name: s.name,
      x,
      y: ys[k]!,
      line: { width: 1.5 },
      hovertemplate: '%{y:.1f} °C',
    })),
    layout: {
      title: { text: 'Greenhouse temperatures' },
      hovermode: 'x unified',
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'date', hoverformat: '%a %d %b, %H:00' },
      yaxis: { title: { text: 'Temperature' }, ticksuffix: ' °C' },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
