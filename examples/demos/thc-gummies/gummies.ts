import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { GUMMIES, ROUTE_COLOR } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * Time to peak plasma THC for five commercial 10 mg edibles (Ewell 2021), as a dot plot with the
 * standard deviation as `error_x` bars, clipped at zero by `arrayminus`. Gummies are circles and
 * the other products diamonds (`marker.symbol` per point); the mean peak concentration is printed
 * beside each row. The spread between people is wider than the gap between products.
 */
export const meta: ExampleMeta = {
  title: 'THC gummies: time to peak for five commercial products',
  description:
    'Time to peak plasma THC, with standard deviations, for five commercial 10 mg edibles, as a dot plot.',
  tags: ['demo', 'scatter', 'error-bars', 'dot-plot', 'symbols', 'medical'],
  size: { width: 960, height: 400 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = GUMMIES.map((g) => g.product);
  return mount(el, (narrow) => ({
    data: [
      {
        type: 'scatter',
        mode: 'markers+text',
        x: GUMMIES.map((g) => g.tmax[0]),
        y: rows,
        error_x: {
          type: 'data',
          array: GUMMIES.map((g) => g.tmax[1]),
          arrayminus: GUMMIES.map((g) => Math.min(g.tmax[1], g.tmax[0])),
          color: '#80838f',
          thickness: 1.5,
          width: 4,
        },
        text: GUMMIES.map((g) => `${Math.round(g.tmax[0])} min`),
        textposition: 'top center',
        textfont: { size: 11, color: LOOK.title },
        marker: {
          size: 14,
          color: ROUTE_COLOR.oral,
          symbol: GUMMIES.map((g) => (g.kind === 'gummy' ? 'circle' : 'diamond')),
        },
        hovertext: GUMMIES.map(
          (g) =>
            `${g.product} (${g.kind})<br>peak at ${g.tmax[0]} ± ${g.tmax[1]} min` +
            `<br>peak THC ${g.cmax[0]} ± ${g.cmax[1]} ng/mL plasma`,
        ),
        hoverinfo: 'text',
        showlegend: false,
      },
    ],
    layout: {
      title: {
        text: narrow ? '' : 'On an empty stomach, 10 mg gummies peaked in 36 to 62 minutes',
      },
      margin: { l: narrow ? 120 : 160, t: 60 },
      xaxis: {
        title: { text: 'Time to peak plasma THC, minutes (bars: ± 1 SD between people)' },
        range: [0, 190],
        dtick: 30,
        zeroline: false,
      },
      yaxis: { autorange: 'reversed', categoryorder: 'array', categoryarray: rows },
    },
  }));
}
