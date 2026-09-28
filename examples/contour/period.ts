import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Contours with period alignment (plan E11.2, E3.5): monthly lake temperature profiles, each
 * measured "for" its month and stamped with the month's first day. `xperiod: 'M1'` with
 * `xperiodalignment: 'middle'` puts every profile in the middle of its month, so the contours line
 * up with the month labels (`ticklabelmode: 'period'`). Hover shows the dates as given.
 */
export const meta: ExampleMeta = {
  title: 'Contour: period alignment',
  description:
    'Monthly lake temperature by depth, each profile centered in its month with xperiod M1.',
  tags: ['contour', 'scientific', 'date', 'period'],
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const months = Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}-01`);
  const depths = Array.from({ length: 16 }, (_, j) => j * 2);
  // Warm surface water over a thermocline that deepens from spring into autumn; 4 °C at depth.
  const z = depths.map((d) =>
    months.map((_, m) => {
      const surface = 4 + 9 * (1 - Math.cos(((m - 0.5) / 12) * 2 * Math.PI));
      const thermocline = 4 + (12 * Math.min(Math.max(m - 3, 0), 7)) / 7;
      return +(4 + (surface - 4) / (1 + Math.exp((d - thermocline) / 2))).toFixed(2);
    }),
  );
  const chart = createChart(el, {
    data: [
      {
        type: 'contour',
        x: months,
        y: depths,
        z,
        xperiod: 'M1',
        xperiodalignment: 'middle',
        colorscale: 'RdBu',
        contours: { showlabels: true },
        colorbar: { title: { text: '°C' } },
        hovertemplate: '%{x|%B}, %{y} m: %{z:.1f} °C<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'Lake temperature by depth' },
      xaxis: { dtick: 'M1', tickformat: '%b', ticklabelmode: 'period' },
      yaxis: { autorange: 'reversed', title: { text: 'depth (m)' } },
    },
  });
  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
