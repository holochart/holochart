import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { SURMOUNT1 } from './data.mts';
import { mount } from './ui.mts';

/**
 * SURMOUNT-1, after Figure 1B of the NEJM paper: the share of participants who reached weight
 * reductions of at least 5, 10, 15 and 20% at week 72, as grouped bars, one trace per arm. The
 * proportions are the treatment-regimen values tabulated in the Zepbound label.
 */
export const meta: ExampleMeta = {
  title: 'Tirzepatide: weight-loss thresholds reached in SURMOUNT-1',
  description:
    'Share of SURMOUNT-1 participants reaching 5, 10, 15 and 20% weight loss at week 72, grouped by dose.',
  tags: ['demo', 'bar', 'grouped', 'medical'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { arms, thresholds, responders, colors } = SURMOUNT1;
  return mount(el, (narrow) => ({
    data: arms.map((arm, i) => ({
      type: 'bar' as const,
      name: arm,
      x: [...thresholds],
      y: [...(responders[i] as readonly number[])],
      marker: { color: colors[i] as string, line: { width: 0 } },
      texttemplate: '%{y:.0f}',
      textposition: 'outside' as const,
      hovertemplate: `${arm}  %{y:.1f}%<extra>%{x} weight loss</extra>`,
    })),
    layout: {
      title: { text: narrow ? '' : 'More than half lost at least 20% on 15 mg; 3% did on placebo' },
      barmode: 'group',
      bargap: 0.2,
      bargroupgap: 0.06,
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        type: 'category',
        showgrid: false,
        title: { text: 'Weight reduction from baseline' },
      },
      yaxis: { title: { text: 'Participants, %' }, range: [0, 104], ticksuffix: '%' },
    },
  }));
}
