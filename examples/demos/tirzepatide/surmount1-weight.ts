import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { fmtPct, SURMOUNT1 } from './data.mts';
import { mount } from './ui.mts';

/**
 * SURMOUNT-1, after Figure 1A of the NEJM paper: mean percent change in body weight at week 72 for
 * placebo and tirzepatide 5, 10 and 15 mg, with 95% confidence intervals as asymmetric `error_y`
 * bars (`array` to the upper bound, `arrayminus` to the lower). The interval sits where a bar label
 * would, so each value is printed in the tick label under its bar instead (`ticktext`).
 */
export const meta: ExampleMeta = {
  title: 'Tirzepatide: weight change by dose in SURMOUNT-1',
  description:
    'Percent change in body weight at week 72 by tirzepatide dose in SURMOUNT-1, as bars with 95% confidence intervals.',
  tags: ['demo', 'bar', 'error-bars', 'medical'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { arms, weightPct, weightCi, colors, n } = SURMOUNT1;
  return mount(el, (narrow) => ({
    data: [
      {
        type: 'bar',
        x: [...arms],
        y: [...weightPct],
        customdata: weightCi.map((ci) => [ci[0], ci[1]]),
        error_y: {
          type: 'data',
          array: weightPct.map((v, i) => (weightCi[i] as readonly number[])[1]! - v),
          arrayminus: weightPct.map((v, i) => v - (weightCi[i] as readonly number[])[0]!),
          color: '#eceef4',
          thickness: 1.5,
          width: 6,
        },
        marker: { color: [...colors], line: { width: 0 } },
        hovertemplate: '%{y:.1f}% (95% CI %{customdata[0]} to %{customdata[1]})<extra></extra>',
        showlegend: false,
      },
    ],
    layout: {
      title: { text: narrow ? '' : 'A fifth of body weight at the two higher doses' },
      bargap: 0.35,
      margin: { t: 60, b: 80 },
      xaxis: {
        type: 'category',
        showgrid: false,
        tickvals: [...arms],
        ticktext: arms.map(
          (a, i) => `${a}<br><b>${fmtPct(weightPct[i] as number)}</b><br>n = ${n[i]}`,
        ),
      },
      yaxis: {
        title: { text: 'Change in body weight at week 72, %' },
        range: [-24, 0],
        ticksuffix: '%',
        zeroline: true,
      },
    },
  }));
}
