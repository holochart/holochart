import { createChart, type Chart, type SplomTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CATEGORIES, CATEGORY_COLOR, ELEMENTS } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Four properties of the elements against each other, as a scatter plot matrix: atomic mass (u),
 * van der Waals radius (pm), Pauling electronegativity and first ionization energy (eV), for the
 * elements that have all four values. One `splom` trace per category shares the grid of axes, so
 * the legend lists the categories and a click hides one; the diagonal is left out
 * (`diagonal.visible: false`) and hover lists all four values of the element (`text`).
 *
 * The clearest pair is electronegativity against ionization energy: atoms that hold on to their
 * own electrons also pull hard on shared ones. Metals sit at the low end of both, nonmetals and
 * halogens at the high end.
 */
export const meta: ExampleMeta = {
  title: 'Elements: four properties, pair by pair',
  description:
    'A scatter plot matrix of atomic mass, radius, electronegativity and ionization energy of the elements, colored by category.',
  tags: ['demo', 'splom', 'statistical', 'legend', 'hover'],
  size: { width: 800, height: 760 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const shown = ELEMENTS.filter(
    (e) => e.radius !== null && e.electronegativity !== null && e.ionization !== null,
  );

  const traces = CATEGORIES.flatMap((category): SplomTrace[] => {
    const es = shown.filter((e) => e.category === category);
    if (es.length === 0) return [];
    return [
      {
        type: 'splom',
        name: category,
        dimensions: [
          { label: 'Atomic mass, u', values: es.map((e) => e.mass) },
          { label: 'Radius, pm', values: es.map((e) => e.radius) },
          { label: 'Electronegativity', values: es.map((e) => e.electronegativity) },
          { label: 'Ionization energy, eV', values: es.map((e) => e.ionization) },
        ],
        diagonal: { visible: false },
        text: es.map(
          (e) =>
            `<b>${e.name}</b> (${e.symbol})<br>atomic mass ${e.mass} u<br>radius ${e.radius} pm<br>` +
            `electronegativity ${e.electronegativity}<br>ionization energy ${e.ionization} eV`,
        ),
        hovertemplate: `%{text}<extra>${category}</extra>`,
        marker: {
          color: CATEGORY_COLOR[category],
          size: narrow ? 3.5 : 5,
          opacity: 0.85,
          line: { color: LOOK.bg, width: 0.5 },
        },
      },
    ];
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow ? '' : `Four properties of ${shown.length} elements, pair by pair`,
      },
      hovermode: 'closest',
      dragmode: 'zoom',
      legend: { orientation: 'h', x: 0, y: -0.08, yanchor: 'top', font: { size: 10 } },
      margin: { t: narrow ? 16 : 48, b: 96 },
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
