import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { SURMOUNT1 } from './data.mts';
import { mount } from './ui.mts';

/**
 * Lipid changes in SURMOUNT-1 by dose, as an annotated heatmap: percent change from baseline at
 * week 72 for five lipid measures (rows) across placebo and the three tirzepatide doses (columns).
 * A diverging colorscale centered on zero (`zmid`) separates the falls (blue) from the rise in HDL
 * cholesterol (red), and `texttemplate` prints each value.
 */
export const meta: ExampleMeta = {
  title: 'Tirzepatide: lipid changes by dose in SURMOUNT-1',
  description:
    'Percent change in five lipid measures by tirzepatide dose in SURMOUNT-1, as an annotated heatmap on a diverging colorscale.',
  tags: ['demo', 'heatmap', 'texttemplate', 'category', 'annotated', 'medical'],
  size: { width: 960, height: 400 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { arms, lipidNames, lipids } = SURMOUNT1;
  // Rows are lipid measures, columns are arms: transpose the per-arm rows.
  const z = lipidNames.map((_, row) => lipids.map((arm) => arm[row] as number));
  return mount(el, (narrow) => ({
    data: [
      {
        type: 'heatmap',
        x: [...arms],
        y: [...lipidNames],
        z,
        zmid: 0,
        zmin: -30,
        zmax: 30,
        colorscale: 'RdBu',
        texttemplate: '%{z:+.1f}%',
        xgap: 2,
        ygap: 2,
        colorbar: { title: { text: '% change' }, ticksuffix: '%' },
        hovertemplate: '%{y}, %{x}: %{z:+.1f}%<extra></extra>',
      },
    ],
    layout: {
      title: { text: narrow ? '' : 'Triglycerides fall by up to 29%; HDL cholesterol rises' },
      margin: { l: narrow ? 120 : 170, t: 60 },
      xaxis: { type: 'category' },
      yaxis: { type: 'category', autorange: 'reversed' },
    },
  }));
}
