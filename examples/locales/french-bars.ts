import { componentsReady, createChart, register } from '@mk7s/holochart';
import { fr } from '@mk7s/holochart-locales';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * French number formatting (plan E17.6): with `config.locale: 'fr'`, numbers use the French
 * separators — a decimal comma and a space between thousands (`12 345,6`) — in tick labels, in
 * `texttemplate` / `hovertemplate` formats such as `%{y:,.1f}`, and in `tickformat`.
 * `layout.separators` would override them.
 */
export const meta: ExampleMeta = {
  title: 'Locales: French number formatting',
  description:
    'Revenue by region with config.locale "fr": thousands separated by spaces and decimal commas in tick labels and bar text.',
  tags: ['locales', 'bar', 'text', 'config'],
};

const REGIONS = [
  'Île-de-France',
  'Auvergne-Rhône-Alpes',
  'Nouvelle-Aquitaine',
  'Occitanie',
  'Hauts-de-France',
  'Grand Est',
];
const REVENUE = [48_215.4, 31_870.25, 22_404.8, 19_963.1, 17_512.65, 15_048.3];

export function run(el: HTMLElement): ExampleHandle {
  register(fr);
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        x: REGIONS,
        y: REVENUE,
        texttemplate: '%{y:,.1f}',
        textposition: 'outside',
        hovertemplate: '%{x}<br>%{y:,.2f} k€<extra></extra>',
      },
    ],
    layout: {
      title: { text: "Chiffre d'affaires 2024 par région (k€)" },
      yaxis: { title: { text: 'Milliers d’euros' }, range: [0, 55_000], exponentformat: 'none' },
      xaxis: { tickangle: 0 },
      margin: { b: 100 },
    },
    config: { locale: 'fr' },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
