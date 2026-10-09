import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { ASSESSMENT_HOURS, EFFECT_WINDOWS, ROUTE_COLOR, ROUTE_NAME, type Route } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * When the effects of an edible and of vaporised cannabis were measurable, from Spindle 2021, as a
 * timeline: one row per outcome and dose, a dot at every hourly assessment where the outcome
 * differed significantly from baseline, joined by a thick line (one `lines+markers` trace per
 * route, rows separated by nulls). Faint dotted verticals (`shapes`) mark the hours at which
 * participants were assessed, so a gap between 6 and 8 hours reads as "not measured", not as
 * "no effect".
 */
export const meta: ExampleMeta = {
  title: 'THC: when effects are felt after eating and after vaporising',
  description:
    'Hours with a significant drug effect or impairment after cannabis brownies and vaporised cannabis, as a timeline with one row per outcome and dose.',
  tags: ['demo', 'scatter', 'lines', 'timeline', 'category', 'shapes', 'medical'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

const rowOf = (w: (typeof EFFECT_WINDOWS)[number]): string =>
  `${w.outcome}<br>${ROUTE_NAME[w.route].toLowerCase()} ${w.doseMg} mg`;

export function run(el: HTMLElement): ExampleHandle {
  const rows = EFFECT_WINDOWS.map(rowOf);
  const routes: Route[] = ['oral', 'vaporised'];
  return mount(el, (narrow) => ({
    data: routes.map((route) => {
      const windows = EFFECT_WINDOWS.filter((w) => w.route === route);
      const hoursIn = (w: (typeof windows)[number]): number[] =>
        ASSESSMENT_HOURS.filter((h) => h >= w.hours[0] && h <= w.hours[1]);
      return {
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: `${ROUTE_NAME[route]} (${route === 'oral' ? 'brownie' : 'vaporiser'})`,
        x: windows.flatMap((w) => [...hoursIn(w), null]),
        y: windows.flatMap((w) => [...hoursIn(w).map(() => rowOf(w)), null]),
        line: { color: ROUTE_COLOR[route], width: 8 },
        marker: { size: 13, color: ROUTE_COLOR[route], line: { color: LOOK.bg, width: 2 } },
        hovertemplate: `hour %{x}<extra>%{y}</extra>`,
      };
    }),
    layout: {
      title: {
        text: narrow
          ? ''
          : 'The edible window runs about an hour behind the vaporiser, and impairment comes later',
      },
      margin: { l: narrow ? 150 : 230 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        title: { text: 'Hours after the dose (assessed at 0, 1, 2, 3, 4, 5, 6 and 8)' },
        range: [-0.4, 8.4],
        tickvals: [...ASSESSMENT_HOURS],
        showgrid: false,
        zeroline: false,
      },
      yaxis: { autorange: 'reversed', categoryorder: 'array', categoryarray: rows },
      shapes: ASSESSMENT_HOURS.map((h) => ({
        type: 'line' as const,
        xref: 'x' as const,
        yref: 'paper' as const,
        x0: h,
        x1: h,
        y0: 0,
        y1: 1,
        line: { color: LOOK.axis, width: 1, dash: 'dot' as const },
        layer: 'below' as const,
      })),
    },
  }));
}
