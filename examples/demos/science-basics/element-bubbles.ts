import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CATEGORIES, CATEGORY_COLOR, element, ELEMENTS } from './data.mts';
import { fmtDensity } from './elements.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Melting point against boiling point (both in kelvin) for every element with both values and a
 * density, as a bubble chart: a `scatter` trace per category (one legend entry each, constant
 * legend marker size through `legend.itemsizing`), bubble area proportional to density
 * (`marker.sizemode: 'area'`, `sizeref`, `sizemin` so the gases stay visible). Hover names the
 * element and gives the three values (`customdata`). Six famous elements are labelled with
 * annotations.
 *
 * Elements that melt at a high temperature also boil at a high temperature, and the dense ones
 * (big bubbles) are mostly up there with them. The gases sit in the bottom left corner. The dotted
 * line is "boils where it melts": the further above it, the wider the range in which the element
 * is a liquid.
 */
export const meta: ExampleMeta = {
  title: 'Elements: melting point, boiling point and density',
  description:
    'A bubble chart of the elements: melting point against boiling point in kelvin, bubble size by density, color by category.',
  tags: ['demo', 'scatter', 'bubble', 'markers', 'sizeref', 'legend', 'annotations', 'hover'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

/** Bubble diameter of the densest element (osmium), in px. */
const MAX_PX = 26;

/** Labelled elements and the label offset from the bubble, in px. */
const FAMOUS: readonly { symbol: string; note: string; ax: number; ay: number }[] = [
  { symbol: 'W', note: 'Tungsten: the metal that is hardest to melt', ax: -10, ay: 60 },
  { symbol: 'C', note: 'Carbon', ax: 44, ay: 24 },
  { symbol: 'Hg', note: 'Mercury: liquid at room temperature', ax: 110, ay: 30 },
  { symbol: 'He', note: 'Helium: boils at 4 K', ax: 24, ay: -96 },
  { symbol: 'Fe', note: 'Iron', ax: 40, ay: 30 },
  { symbol: 'Au', note: 'Gold', ax: -36, ay: -30 },
];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const shown = ELEMENTS.filter(
    (e) => e.melting !== null && e.boiling !== null && e.density !== null,
  );
  const maxDensity = Math.max(...shown.map((e) => e.density as number));

  const bubbles = CATEGORIES.flatMap((category): ScatterTrace[] => {
    const es = shown.filter((e) => e.category === category);
    if (es.length === 0) return [];
    return [
      {
        type: 'scatter',
        mode: 'markers',
        name: category,
        x: es.map((e) => e.melting),
        y: es.map((e) => e.boiling),
        text: es.map((e) => `${e.name} (${e.symbol})`),
        customdata: es.map((e) => fmtDensity(e.density as number)),
        marker: {
          color: CATEGORY_COLOR[category],
          size: es.map((e) => e.density as number),
          sizemode: 'area',
          sizeref: maxDensity / MAX_PX ** 2,
          sizemin: 2.5,
          opacity: 0.75,
          line: { color: LOOK.bg, width: 1 },
        },
        hovertemplate:
          '<b>%{text}</b><br>melts at %{x:,.0f} K, boils at %{y:,.0f} K<br>' +
          `density %{customdata} g/cm³<extra>${category}</extra>`,
      },
    ];
  });
  const diagonal: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: 'Boils where it melts',
    x: [0, 4200],
    y: [0, 4200],
    line: { color: LOOK.zero, width: 1, dash: 'dot' },
    hoverinfo: 'skip',
    showlegend: false,
  };

  const labels = FAMOUS.map(({ symbol, note, ax, ay }): LayoutAnnotation => {
    const e = element(symbol);
    return {
      x: e.melting as number,
      y: e.boiling as number,
      text: narrow ? symbol : note,
      showarrow: true,
      arrowhead: 0,
      arrowwidth: 1,
      arrowcolor: LOOK.tick,
      ax: narrow ? ax / 2 : ax,
      ay: narrow ? ay / 2 : ay,
      font: { size: 10, color: LOOK.title },
    };
  });

  const chart: Chart = createChart(chartEl, {
    data: [diagonal, ...bubbles],
    layout: {
      title: {
        text: narrow ? '' : 'Hard to melt means hard to boil. Bubble size shows density',
      },
      hovermode: 'closest',
      legend: narrow
        ? { orientation: 'h', y: -0.2, itemsizing: 'constant' }
        : {
            orientation: 'v',
            itemsizing: 'constant',
            x: 1.01,
            xanchor: 'left',
            y: 0.5,
            yanchor: 'middle',
          },
      xaxis: {
        title: { text: 'Melting point, K' },
        range: [-150, 4200],
        tickformat: ',d',
        zeroline: false,
      },
      yaxis: {
        title: { text: 'Boiling point, K' },
        range: [-250, 6400],
        tickformat: ',d',
        zeroline: false,
      },
      annotations: [
        ...labels,
        {
          x: 2900,
          y: 2900,
          text: narrow ? '' : 'on this line: boils where it melts',
          showarrow: false,
          xanchor: 'left',
          yanchor: 'top',
          xshift: 6,
          font: { size: 9, color: LOOK.tick },
        },
      ],
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
