import { componentsReady, createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A year of daily electricity demand (a filled area on the left axis) against the mean outdoor
 * temperature (a line on a secondary right axis, `yaxis2.overlaying: 'y'`): demand peaks in the
 * winter cold and again, less, in the summer heat.
 *
 * Both y axes draw their grid (`yaxis2.showgrid`, dotted), and the temperature axis its zero line.
 * As in Plotly, every grid and zero line of the overlaid pair is drawn under every trace: the
 * dotted temperature grid and the 0 °C line disappear behind the demand area, not over it.
 */
export const meta: ExampleMeta = {
  title: 'Axes: demand and temperature on overlaid y axes',
  description:
    'Daily power demand as an area and temperature on a secondary axis, with both grids and a zero line drawn under the traces.',
  tags: ['axes', 'secondary-axis', 'area', 'line', 'energy'],
  size: { width: 760, height: 440 },
  testTolerance: 0.004,
};

const DAY = 86_400_000;
const START = Date.UTC(2025, 0, 1);

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(365);
  const normal = gaussian(random);
  const days = Array.from({ length: 365 }, (_, i) => new Date(START + i * DAY).toISOString());
  // Mean temperature, °C: coldest mid-January, warmest late July, with weather noise.
  let weather = 0;
  const temperature = days.map((_, i) => {
    weather = 0.7 * weather + normal() * 2.2;
    return 9.5 - 12.5 * Math.cos((2 * Math.PI * (i - 18)) / 365) + weather;
  });
  // Demand, GW: heating below 16 °C, cooling above 21 °C, lower on weekends.
  const demand = temperature.map((t, i) => {
    const weekend = (i + 3) % 7 >= 5 ? -3.2 : 0;
    const heating = Math.max(0, 16 - t) * 0.72;
    const cooling = Math.max(0, t - 21) * 0.95;
    return 27 + heating + cooling + weekend + normal() * 0.8;
  });

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Demand',
        x: days,
        y: demand,
        fill: 'tozeroy',
        line: { color: '#5e74d5', width: 1 },
        fillcolor: '#34427e',
        hovertemplate: '%{y:.1f} GW<extra></extra>',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Temperature',
        x: days,
        y: temperature,
        yaxis: 'y2',
        line: { color: '#e8a33d', width: 1.5 },
        hovertemplate: '%{y:.1f} °C<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Daily power demand and temperature, 2025' },
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      hovermode: 'x unified',
      xaxis: { type: 'date', dtick: 'M1', tickformat: '%b' },
      yaxis: { title: { text: 'Demand (GW)' }, range: [0, 50], dtick: 10 },
      yaxis2: {
        title: { text: 'Temperature (°C)', font: { color: '#e8a33d' } },
        overlaying: 'y',
        side: 'right',
        tickfont: { color: '#e8a33d' },
        range: [-10, 30],
        dtick: 10,
        ticksuffix: ' °C',
        showgrid: true,
        griddash: 'dot',
        zeroline: true,
      },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
