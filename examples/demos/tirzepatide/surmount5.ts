import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, SURMOUNT5 } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * SURMOUNT-5, the head-to-head trial of tirzepatide and semaglutide in obesity, as two subplots.
 * Left: mean change in body weight (%) and waist (cm) at week 72 with 95% CIs (`error_y`). Right:
 * the share of participants reaching each weight-loss threshold, as lines over the thresholds
 * with the gap between the drugs shaded (`fill: 'tonexty'`).
 */
export const meta: ExampleMeta = {
  title: 'Tirzepatide vs semaglutide in obesity (SURMOUNT-5)',
  description:
    'SURMOUNT-5 as two subplots: mean weight and waist change with 95% CIs, and weight-loss thresholds reached with the gap between drugs shaded.',
  tags: ['demo', 'bar', 'scatter', 'subplots', 'error-bars', 'fill', 'medical'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

type Est = readonly [number, number, number];

export function run(el: HTMLElement): ExampleHandle {
  const { weightPct, waistCm, thresholds, responders } = SURMOUNT5;
  const measures = ['Body weight, %', 'Waist, cm'];
  const bars = (name: string, color: string, a: Est, b: Est) => ({
    type: 'bar' as const,
    name,
    legendgroup: name,
    x: measures,
    y: [a[0], b[0]],
    error_y: {
      type: 'data' as const,
      array: [a[2] - a[0], b[2] - b[0]],
      arrayminus: [a[0] - a[1], b[0] - b[1]],
      color: '#eceef4',
      thickness: 1.5,
      width: 5,
    },
    marker: { color, line: { width: 0 } },
    texttemplate: '%{y:.1f}',
    textposition: 'inside' as const,
    insidetextanchor: 'middle' as const,
    hovertemplate: `${name}  %{y:.1f}<extra>%{x}</extra>`,
  });
  const line = (name: string, color: string, y: readonly number[], fill: boolean) => ({
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name,
    legendgroup: name,
    showlegend: false,
    xaxis: 'x2',
    yaxis: 'y2',
    x: [...thresholds],
    y: [...y],
    line: { color, width: 2.5 },
    marker: { size: 8, color },
    ...(fill ? { fill: 'tonexty' as const, fillcolor: 'rgba(169, 182, 242, 0.14)' } : {}),
    hovertemplate: `${name}  %{y:.1f}%<extra>%{x} weight loss</extra>`,
  });

  return mount(el, (narrow) => ({
    data: [
      bars('Tirzepatide 10 or 15 mg', COLOR.tirz15, weightPct.tirz, waistCm.tirz),
      bars('Semaglutide 1.7 or 2.4 mg', COLOR.sema, weightPct.sema, waistCm.sema),
      line('Semaglutide 1.7 or 2.4 mg', COLOR.sema, responders.sema, false),
      line('Tirzepatide 10 or 15 mg', COLOR.tirz15, responders.tirz, true),
    ],
    layout: {
      title: {
        text: narrow ? '' : 'Head to head, tirzepatide took off about half as much weight again',
      },
      barmode: 'group',
      bargap: 0.25,
      bargroupgap: 0.06,
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { domain: [0, 0.42], type: 'category', showgrid: false },
      yaxis: { title: { text: 'Mean change at week 72' }, range: [-27, 0], zeroline: true },
      xaxis2: {
        domain: [0.54, 1],
        anchor: 'y2',
        type: 'category',
        title: { text: 'Weight reduction from baseline' },
      },
      yaxis2: {
        anchor: 'x2',
        title: { text: 'Participants, %' },
        range: [0, 100],
        ticksuffix: '%',
      },
      annotations: narrow
        ? []
        : [
            {
              xref: 'x',
              yref: 'y',
              x: 'Body weight, %',
              y: -24.5,
              text: 'difference −6.5 points<br>(−8.1 to −4.9)',
              font: { size: 11, color: LOOK.text },
              showarrow: false,
            },
            {
              xref: 'x',
              yref: 'y',
              x: 'Waist, cm',
              y: -24.5,
              text: 'difference −5.4 cm<br>(−7.1 to −3.6)',
              font: { size: 11, color: LOOK.text },
              showarrow: false,
            },
          ],
    },
  }));
}
