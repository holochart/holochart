import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { METABOLITE, ROUTE_COLOR, ROUTE_NAME, type Route } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * Peak THC against peak 11-OH-THC, the active metabolite, on log-log axes. Two reference lines
 * (layout `shapes`) mark equal concentrations and a twentieth as much metabolite. Every oral dose
 * sits near the first line and the intravenous doses near the second: eating THC roughly doubles
 * the active drug in circulation for a given THC level.
 */
export const meta: ExampleMeta = {
  title: 'THC and its active metabolite 11-OH-THC, by route',
  description:
    'Peak 11-OH-THC against peak THC for oral and intravenous doses on log-log axes, with reference lines for a 1:1 and a 1:20 ratio.',
  tags: ['demo', 'scatter', 'log', 'shapes', 'annotations', 'medical'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

const LO = 0.4;
const HI = 130;

export function run(el: HTMLElement): ExampleHandle {
  const routes: Route[] = ['oral', 'iv'];
  const guide = (ratio: number) => ({
    type: 'line' as const,
    xref: 'x' as const,
    yref: 'y' as const,
    x0: LO,
    y0: LO * ratio,
    x1: HI,
    y1: HI * ratio,
    line: { color: LOOK.zero, width: 1, dash: 'dash' as const },
    layer: 'below' as const,
  });
  return mount(el, (narrow) => ({
    data: routes.map((route) => {
      const points = METABOLITE.filter((m) => m.route === route);
      return {
        type: 'scatter' as const,
        mode: 'markers' as const,
        name: ROUTE_NAME[route],
        x: points.map((m) => m.thc),
        y: points.map((m) => m.oh),
        marker: {
          size: 13,
          color: ROUTE_COLOR[route],
          symbol: points.map((m) => (m.matrix === 'plasma' ? 'circle' : 'diamond')),
        },
        hovertext: points.map(
          (m) =>
            `${m.label} (${m.ref.short}, ${m.matrix})<br>THC ${m.thc} ng/mL · 11-OH-THC ${m.oh} ng/mL` +
            (m.tier === 'secondary' ? '<br>quoted from a review' : ''),
        ),
        hoverinfo: 'text' as const,
      };
    }),
    layout: {
      title: { text: narrow ? '' : 'Eaten THC arrives with about as much active metabolite' },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        type: 'log',
        title: { text: 'Peak THC, ng/mL (log scale)' },
        range: [Math.log10(LO), Math.log10(HI)],
        tickvals: [0.5, 1, 2, 5, 10, 20, 50, 100],
      },
      yaxis: {
        type: 'log',
        title: { text: 'Peak 11-OH-THC, ng/mL (log scale)' },
        range: [Math.log10(0.3), Math.log10(20)],
        tickvals: [0.5, 1, 2, 5, 10],
      },
      shapes: [guide(1), guide(1 / 20)],
      annotations: narrow
        ? []
        : [
            {
              x: Math.log10(12),
              y: Math.log10(12),
              text: 'equal amounts',
              textangle: -24,
              yshift: 12,
              font: { size: 11, style: 'italic', color: LOOK.tick },
              showarrow: false,
            },
            {
              x: Math.log10(40),
              y: Math.log10(2),
              text: 'one twentieth as much',
              textangle: -24,
              yshift: 12,
              font: { size: 11, style: 'italic', color: LOOK.tick },
              showarrow: false,
            },
          ],
    },
  }));
}
