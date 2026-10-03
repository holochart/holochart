import type { LayoutAnnotation } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, SURPASS2 } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * SURPASS-2, after Figures 1A and 2A of the NEJM paper: change in HbA1c and in body weight at week
 * 40 for tirzepatide 5, 10 and 15 mg and semaglutide 1 mg, as two side-by-side subplots (`xaxis2`,
 * `yaxis2`). Each tirzepatide bar carries its estimated difference from semaglutide with the 95%
 * CI as an annotation, the way the published figure prints them under the bars.
 */
export const meta: ExampleMeta = {
  title: 'Tirzepatide vs semaglutide 1 mg in type 2 diabetes (SURPASS-2)',
  description:
    'HbA1c and weight change at week 40 in SURPASS-2 as two bar subplots, with each estimated treatment difference against semaglutide annotated.',
  tags: ['demo', 'bar', 'subplots', 'annotations', 'medical'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const SHORT = ['5 mg', '10 mg', '15 mg', 'Semaglutide<br>1 mg'];
const COLORS = [COLOR.tirz5, COLOR.tirz10, COLOR.tirz15, COLOR.sema];

/** `−0.45 (−0.57 to −0.32)`, with real minus signs. */
const etdText = (etd: readonly number[], digits: number): string => {
  const f = (v: number): string => v.toFixed(digits).replace('-', '−');
  return `${f(etd[0] as number)}<br>(${f(etd[1] as number)} to ${f(etd[2] as number)})`;
};

export function run(el: HTMLElement): ExampleHandle {
  const notes = (
    values: readonly number[],
    etds: readonly (readonly number[])[],
    digits: number,
    axis: '' | '2',
  ): Partial<LayoutAnnotation>[] =>
    etds.map((etd, i) => ({
      xref: `x${axis}`,
      yref: `y${axis}`,
      x: SHORT[i] as string,
      y: values[i] as number,
      yanchor: 'top',
      yshift: -4,
      text: etdText(etd, digits),
      font: { size: 10, color: LOOK.text },
      showarrow: false,
    }));

  return mount(el, (narrow) => ({
    data: [
      {
        type: 'bar',
        x: SHORT,
        y: [...SURPASS2.hba1c],
        marker: { color: COLORS, line: { width: 0 } },
        texttemplate: '%{y:.2f}',
        textposition: 'inside',
        insidetextanchor: 'middle',
        hovertemplate: '%{y:.2f} points<extra>%{x}</extra>',
        showlegend: false,
      },
      {
        type: 'bar',
        x: SHORT,
        y: [...SURPASS2.weightKg],
        xaxis: 'x2',
        yaxis: 'y2',
        marker: { color: COLORS, line: { width: 0 } },
        texttemplate: '%{y:.1f}',
        textposition: 'inside',
        insidetextanchor: 'middle',
        hovertemplate: '%{y:.1f} kg<extra>%{x}</extra>',
        showlegend: false,
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : 'Every tirzepatide dose beat semaglutide 1 mg on HbA1c and on weight',
      },
      bargap: 0.3,
      margin: { t: 60, b: 70 },
      xaxis: { domain: [0, 0.46], type: 'category', showgrid: false },
      yaxis: { title: { text: 'Change in HbA1c, points' }, range: [-2.95, 0], zeroline: true },
      xaxis2: { domain: [0.56, 1], anchor: 'y2', type: 'category', showgrid: false },
      yaxis2: {
        anchor: 'x2',
        title: { text: 'Change in body weight, kg' },
        range: [-14.4, 0],
        zeroline: true,
      },
      annotations: narrow
        ? []
        : [
            ...notes(SURPASS2.hba1c, SURPASS2.hba1cEtd, 2, ''),
            ...notes(SURPASS2.weightKg, SURPASS2.weightEtd, 1, '2'),
            {
              xref: 'paper',
              yref: 'paper',
              x: 0,
              y: -0.2,
              xanchor: 'left',
              yanchor: 'top',
              text: 'Under each bar: difference from semaglutide (95% CI). Treatment-regimen estimand, week 40.',
              font: { size: 11, style: 'italic', color: LOOK.tick },
              showarrow: false,
            },
          ],
    },
  }));
}
