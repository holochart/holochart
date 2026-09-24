import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * One color scale for two panels (plan E5.3): monthly temperature anomalies for two years, drawn
 * as bars whose fills reference the same `layout.coloraxis` (`marker.coloraxis`). The axis pins its
 * domain to ±3 °C (`cmin` / `cmax`) instead of fitting the data, so a color means the same anomaly
 * in both years, and the default look's automatic diverging scale is picked because the domain
 * crosses zero.
 *
 * The single colorbar is horizontal and sits below both panels: it is placed against the whole
 * figure (`yref: 'container'`, `y: 0`, `yanchor: 'bottom'`) in a bottom margin reserved for it,
 * right-aligned with the plots (`x: 1`, `xanchor: 'right'`), and sized in pixels along
 * (`lenmode: 'pixels'`) but as a fraction of the plot height across (`thicknessmode: 'fraction'`).
 * Its ticks step every 1 °C from −3 (`tickmode: 'linear'`, `tick0`, `dtick`), are signed
 * (`tickformat: '+d'`) and only the last one carries the unit (`showticksuffix: 'last'`). The
 * uppercase bold title sits above the bar (`title.side: 'top'`).
 */
export const meta: ExampleMeta = {
  title: 'Colorbar: one coloraxis shared by two panels',
  description:
    'Two years of monthly anomalies colored through one fixed-domain coloraxis, with a horizontal colorbar anchored to the figure bottom.',
  tags: ['colorbar', 'coloraxis', 'bar', 'subplots'],
  size: { width: 720, height: 440 },
  testTolerance: 0.004,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Monthly anomalies (°C): a warming trend, a seasonal wobble and weather noise. */
function anomalies(seed: number, base: number): number[] {
  const normal = gaussian(rng(seed));
  return MONTHS.map((_, i) => {
    const season = 0.6 * Math.sin(((i - 1) / 12) * 2 * Math.PI);
    return +(base + season + normal() * 0.9).toFixed(2);
  });
}

export function run(el: HTMLElement): ExampleHandle {
  const y2023 = anomalies(2023, 0.2);
  const y2024 = anomalies(2024, 1.1);

  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        name: '2023',
        x: MONTHS,
        y: y2023,
        marker: { color: y2023, coloraxis: 'coloraxis' },
      },
      {
        type: 'bar',
        name: '2024',
        x: MONTHS,
        y: y2024,
        xaxis: 'x2',
        yaxis: 'y2',
        marker: { color: y2024, coloraxis: 'coloraxis' },
      },
    ],
    layout: {
      title: { text: 'Monthly temperature anomaly vs the 1991–2020 normal' },
      showlegend: false,
      margin: { b: 92 },
      xaxis: { anchor: 'y', showticklabels: false },
      yaxis: { domain: [0.54, 1], range: [-3.5, 3.5], title: { text: '2023' } },
      xaxis2: { anchor: 'y2' },
      yaxis2: { domain: [0, 0.46], range: [-3.5, 3.5], title: { text: '2024' } },
      coloraxis: {
        cmin: -3,
        cmax: 3,
        colorbar: {
          orientation: 'h',
          lenmode: 'pixels',
          len: 300,
          thicknessmode: 'fraction',
          thickness: 0.035,
          x: 1,
          xanchor: 'right',
          xpad: 0,
          yref: 'container',
          y: 0,
          yanchor: 'bottom',
          ypad: 8,
          outlinewidth: 0,
          tickmode: 'linear',
          tick0: -3,
          dtick: 1,
          ticklen: 4,
          tickformat: '+d',
          ticksuffix: ' °C',
          showticksuffix: 'last',
          tickfont: { size: 10, color: '#c8cbd6' },
          title: {
            text: 'Anomaly',
            side: 'top',
            font: { size: 10, weight: 'bold', textcase: 'upper', color: '#8a8fa3' },
          },
        },
      },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
