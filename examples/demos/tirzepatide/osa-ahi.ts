import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, OSA } from './data.mts';
import { mount } from './ui.mts';

/**
 * SURMOUNT-OSA: change in the apnoea-hypopnoea index at week 52 in the two trials (participants
 * not using, and using, positive airway pressure), tirzepatide against placebo, as grouped bars
 * with 95% confidence intervals (`error_y` with `arrayminus`). The intervals sit where bar labels
 * would, so the values are printed in the tick labels instead (`ticktext`).
 */
export const meta: ExampleMeta = {
  title: 'Tirzepatide in obstructive sleep apnoea (SURMOUNT-OSA)',
  description:
    'Change in the apnoea-hypopnoea index at week 52 in both SURMOUNT-OSA trials, as grouped bars with 95% confidence intervals.',
  tags: ['demo', 'bar', 'grouped', 'error-bars', 'medical'],
  size: { width: 960, height: 420 },
  testTolerance: 0.004,
};

type Est = readonly [number, number, number];

/** A signed number with a real minus sign. */
const fmtNum = (v: number): string => v.toFixed(1).replace('-', '−');

export function run(el: HTMLElement): ExampleHandle {
  const bars = (name: string, color: string, values: readonly Est[]) => ({
    type: 'bar' as const,
    name,
    x: [...OSA.trials],
    y: values.map((v) => v[0]),
    customdata: values.map((v) => [v[1], v[2]]),
    error_y: {
      type: 'data' as const,
      array: values.map((v) => v[2] - v[0]),
      arrayminus: values.map((v) => v[0] - v[1]),
      color: '#eceef4',
      thickness: 1.5,
      width: 6,
    },
    marker: { color, line: { width: 0 } },
    hovertemplate: `${name}  %{y:.1f} events/h (95% CI %{customdata[0]} to %{customdata[1]})<extra>%{x}</extra>`,
  });
  return mount(el, (narrow) => ({
    data: [
      bars('Tirzepatide 10 or 15 mg', COLOR.tirz15, OSA.tirz),
      bars('Placebo', COLOR.placebo, OSA.placebo),
    ],
    layout: {
      title: { text: narrow ? '' : 'About 25 to 29 fewer breathing interruptions an hour' },
      barmode: 'group',
      bargap: 0.3,
      bargroupgap: 0.06,
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { b: 70 },
      xaxis: {
        type: 'category',
        showgrid: false,
        tickvals: [...OSA.trials],
        ticktext: OSA.trials.map(
          (t, i) =>
            `${t}<br><b>${fmtNum(OSA.tirz[i]![0])}</b> vs ${fmtNum(OSA.placebo[i]![0])} events per hour`,
        ),
      },
      yaxis: {
        title: { text: 'Change in AHI at week 52, events per hour' },
        range: [-36, 0],
        zeroline: true,
      },
    },
  }));
}
