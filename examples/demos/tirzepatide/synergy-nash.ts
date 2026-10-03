import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { SYNERGY_NASH } from './data.mts';
import { mount } from './ui.mts';

/**
 * SYNERGY-NASH, the phase 2 trial in steatohepatitis with fibrosis: the share of participants with
 * MASH resolution without worsening of fibrosis, and with at least one stage of fibrosis
 * improvement without worsening of MASH, at week 52, as grouped bars by dose with the value above
 * each bar. Resolution rises with dose; fibrosis improvement does not.
 */
export const meta: ExampleMeta = {
  title: 'Tirzepatide in steatohepatitis: histology at 52 weeks (SYNERGY-NASH)',
  description:
    'MASH resolution and fibrosis improvement by tirzepatide dose in SYNERGY-NASH, as grouped bars with value labels.',
  tags: ['demo', 'bar', 'grouped', 'text', 'medical'],
  size: { width: 960, height: 420 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { arms, colors, resolution, fibrosis } = SYNERGY_NASH;
  const endpoints = [
    'MASH resolution<br>without worse fibrosis',
    'Fibrosis improved ≥1 stage<br>without worse MASH',
  ];
  return mount(el, (narrow) => ({
    data: arms.map((arm, i) => ({
      type: 'bar' as const,
      name: arm === 'Placebo' ? arm : `Tirzepatide ${arm}`,
      x: endpoints,
      y: [resolution[i] as number, fibrosis[i] as number],
      marker: { color: colors[i] as string, line: { width: 0 } },
      text: [`${resolution[i]}%`, `${fibrosis[i]}%`],
      textposition: 'outside' as const,
      hovertemplate: `${arm}  %{y}%<extra></extra>`,
    })),
    layout: {
      title: { text: narrow ? '' : 'MASH resolved in 44 to 62% on tirzepatide, 10% on placebo' },
      barmode: 'group',
      bargap: 0.3,
      bargroupgap: 0.06,
      margin: { b: 70 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'category', showgrid: false },
      yaxis: { title: { text: 'Participants, %' }, range: [0, 76], ticksuffix: '%' },
    },
  }));
}
