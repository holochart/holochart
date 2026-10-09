import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { DOSE_RESPONSE, ROUTE_COLOR, ROUTE_NAME } from './data.mts';
import { mount } from './ui.mts';

/**
 * How strong the effect feels at each dose: mean peak "drug effect" ratings from five controlled
 * studies, one `lines+markers` trace per study and route, colored by route. Traces of one route
 * share a `legendgroup`, so the legend lists three routes, not seven studies; the study is in the
 * hover.
 */
export const meta: ExampleMeta = {
  title: 'THC: peak drug effect by dose and route',
  description:
    'Mean peak drug-effect ratings against THC dose for eaten, smoked and vaporised cannabis in five studies, as lines colored by route.',
  tags: ['demo', 'scatter', 'lines', 'legendgroup', 'medical'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const seen = new Set<string>();
  return mount(el, (narrow) => ({
    data: DOSE_RESPONSE.map((series) => {
      const first = !seen.has(series.route);
      seen.add(series.route);
      return {
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: ROUTE_NAME[series.route],
        legendgroup: series.route,
        showlegend: first,
        x: series.points.map((p) => p[0]),
        y: series.points.map((p) => p[1]),
        line: { color: ROUTE_COLOR[series.route], width: 2 },
        marker: { size: 9, color: ROUTE_COLOR[series.route] },
        hovertemplate: `%{x} mg ${ROUTE_NAME[series.route].toLowerCase()}: %{y:.1f}<extra>${series.ref.short}</extra>`,
      };
    }),
    layout: {
      title: { text: narrow ? '' : 'Milligram for milligram, inhaled THC feels stronger' },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { title: { text: 'THC dose, mg' }, range: [0, 54], dtick: 10, zeroline: false },
      yaxis: {
        title: { text: 'Peak "drug effect" rating, 0 to 100' },
        range: [0, 100],
      },
    },
  }));
}
