import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { PEAKS, ROUTE_COLOR, ROUTE_NAME, type Route } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * Peak THC in whole blood against the time it occurred, for eaten, smoked and vaporised cannabis
 * in three controlled studies: a scatter on a log y axis, one trace per route, each point labelled
 * with its dose (`mode: 'markers+text'`). Inhaled doses peak in the first sample and many times
 * higher; edibles peak two to three hours later.
 */
export const meta: ExampleMeta = {
  title: 'THC: peak blood concentration and when it occurs, by route',
  description:
    'Peak whole-blood THC against time of peak for eaten, smoked and vaporised cannabis, as a labelled scatter on a log axis.',
  tags: ['demo', 'scatter', 'log', 'text', 'medical'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const routes: Route[] = ['vaporised', 'smoked', 'oral'];
  return mount(el, (narrow) => ({
    data: routes.map((route) => {
      const points = PEAKS.filter((p) => p.route === route);
      return {
        type: 'scatter' as const,
        mode: 'markers+text' as const,
        name: ROUTE_NAME[route],
        x: points.map((p) => p.atHours),
        y: points.map((p) => p.peak),
        text: points.map((p) => `${p.doseMg} mg`),
        textposition: 'middle right' as const,
        textfont: { size: 11, color: LOOK.text },
        marker: { size: 13, color: ROUTE_COLOR[route] },
        hovertext: points.map(
          (p) =>
            `${ROUTE_NAME[p.route]} ${p.doseMg} mg: ${p.peak} ng/mL at ` +
            `${p.atHours === 0 ? 'the first sample' : `${p.atHours} h`}<br>${p.ref.short}`,
        ),
        hoverinfo: 'text' as const,
      };
    }),
    layout: {
      title: {
        text: narrow ? '' : 'Inhaled THC peaks at once and high; eaten THC peaks late and low',
      },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        title: { text: 'Time of peak, hours after the dose' },
        range: [-0.2, 3.2],
        dtick: 0.5,
        zeroline: false,
      },
      yaxis: {
        type: 'log',
        title: { text: 'Peak THC in whole blood, ng/mL (log scale)' },
        range: [Math.log10(0.4), Math.log10(60)],
        tickvals: [0.5, 1, 2, 5, 10, 20, 50],
      },
    },
  }));
}
