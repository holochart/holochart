import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { BODY_COMPOSITION, COLOR } from './data.mts';
import { mount } from './ui.mts';

/**
 * What the lost weight is made of: percent change in body weight, fat mass, visceral fat and lean
 * mass by DXA, for tirzepatide and placebo in the SURMOUNT-1 substudy (week 72) and for
 * semaglutide in the STEP 1 substudy (week 68), as grouped bars. The substudies are separate, so
 * the semaglutide bars are context, not a comparison.
 */
export const meta: ExampleMeta = {
  title: 'Tirzepatide and semaglutide: body composition by DXA',
  description:
    'Percent change in body weight, fat mass, visceral fat and lean mass in the SURMOUNT-1 and STEP 1 DXA substudies, as grouped bars.',
  tags: ['demo', 'bar', 'grouped', 'medical'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { measures, tirz, tirzPlacebo, sema } = BODY_COMPOSITION;
  const bars = (name: string, color: string, y: readonly number[]) => ({
    type: 'bar' as const,
    name,
    x: [...measures],
    y: [...y],
    marker: { color, line: { width: 0 } },
    texttemplate: '%{y:.1f}',
    textposition: 'outside' as const,
    hovertemplate: `${name}  %{y:.1f}%<extra>%{x}</extra>`,
  });
  return mount(el, (narrow) => ({
    data: [
      bars('Tirzepatide, pooled doses (SURMOUNT-1, n = 124)', COLOR.tirz15, tirz),
      bars('Semaglutide 2.4 mg (STEP 1, n = 95)', COLOR.sema, sema),
      bars('Placebo (SURMOUNT-1, n = 36)', COLOR.placebo, tirzPlacebo),
    ],
    layout: {
      title: {
        text: narrow ? '' : 'Fat falls three times as far as lean mass, but lean mass falls too',
      },
      barmode: 'group',
      bargap: 0.22,
      bargroupgap: 0.06,
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'category', showgrid: false },
      yaxis: {
        title: { text: 'Change from baseline, %' },
        range: [-46, 0],
        ticksuffix: '%',
        zeroline: true,
      },
    },
  }));
}
