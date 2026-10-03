import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, fmtHr, SURPASS_CVOT } from './data.mts';
import { LOOK, mount, NO_EFFECT_LINE } from './ui.mts';

/**
 * SURPASS-CVOT, tirzepatide against dulaglutide, as a forest plot of the primary endpoint and its
 * components and secondary outcomes: hazard ratios on a log axis with asymmetric `error_x`
 * intervals. The primary endpoint is a diamond in the accent color; the rest, which were not
 * adjusted for multiplicity, are muted squares. A shaded band (`shapes`, a rect on the x axis)
 * marks the noninferiority margin of 1.05.
 */
export const meta: ExampleMeta = {
  title: 'Tirzepatide vs dulaglutide: cardiovascular outcomes (SURPASS-CVOT)',
  description:
    'Hazard ratios for the primary endpoint and secondary outcomes of SURPASS-CVOT as a forest plot, with the noninferiority margin shaded.',
  tags: ['demo', 'scatter', 'error-bars', 'log', 'forest-plot', 'shapes', 'medical'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = SURPASS_CVOT.map((h) => h.label);
  return mount(el, (narrow) => ({
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x: SURPASS_CVOT.map((h) => h.hr),
        y: rows,
        marker: {
          symbol: SURPASS_CVOT.map((_, i) => (i === 0 ? 'diamond-wide' : 'square')),
          size: SURPASS_CVOT.map((_, i) => (i === 0 ? 18 : 11)),
          color: SURPASS_CVOT.map((_, i) => (i === 0 ? COLOR.tirz15 : COLOR.tirz10)),
        },
        error_x: {
          type: 'data',
          array: SURPASS_CVOT.map((h) => h.hi - h.hr),
          arrayminus: SURPASS_CVOT.map((h) => h.hr - h.lo),
          color: '#9aa0b4',
          thickness: 1.5,
          width: 3,
        },
        hovertext: SURPASS_CVOT.map(
          (h) =>
            `${h.label}: HR ${fmtHr(h)}<br>events, tirzepatide / dulaglutide: ${h.events ?? 'n/a'}` +
            (h.note ? `<br>${h.note}` : ''),
        ),
        hoverinfo: 'text',
        showlegend: false,
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : 'Noninferior to dulaglutide on MACE; fewer deaths from any cause',
      },
      margin: { l: narrow ? 140 : 210, r: narrow ? 20 : 150, t: 60, b: 70 },
      xaxis: {
        type: 'log',
        range: [Math.log10(0.62), Math.log10(1.25)],
        tickvals: [0.7, 0.8, 0.9, 1, 1.1, 1.2],
        title: { text: 'Hazard ratio, tirzepatide vs dulaglutide (log scale)' },
        zeroline: false,
      },
      yaxis: { autorange: 'reversed', categoryorder: 'array', categoryarray: rows },
      shapes: [
        {
          type: 'rect',
          xref: 'x',
          yref: 'paper',
          x0: 1,
          x1: 1.05,
          y0: 0,
          y1: 1,
          fillcolor: 'rgba(128, 131, 143, 0.16)',
          line: { width: 0 },
          layer: 'below',
        },
        {
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: 1,
          x1: 1,
          y0: 0,
          y1: 1,
          line: NO_EFFECT_LINE,
        },
      ],
      annotations: narrow
        ? []
        : [
            ...SURPASS_CVOT.map((h) => ({
              xref: 'paper' as const,
              yref: 'y' as const,
              x: 1.02,
              y: h.label,
              xanchor: 'left' as const,
              text: fmtHr(h),
              font: { size: 11, color: LOOK.text },
              showarrow: false,
            })),
            {
              xref: 'x',
              yref: 'paper',
              x: Math.log10(1.05),
              y: 1,
              xanchor: 'left',
              yanchor: 'bottom',
              text: 'noninferiority margin 1.05',
              font: { size: 10, style: 'italic', color: LOOK.tick },
              showarrow: false,
            },
          ],
    },
  }));
}
