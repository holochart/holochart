import { createChart, type BoxTrace, type Chart, type LayoutAnnotation } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CATEGORIES, CATEGORY_COLOR, element, ELEMENTS } from './data.mts';
import { CATEGORY_TWO_LINES, fmtDensity } from './elements.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Density of the solid and liquid elements by category, in g/cm³: a `box` per category in the
 * order of the legends, with every element drawn as a point beside its box (`boxpoints: 'all'`,
 * `jitter`, `pointpos`) in the category's color. Hover on a point names the element (`text`);
 * hover on a box gives the median and quartiles. Gases (density under 0.1 g/cm³) are left out, so
 * there is no noble gas box, and so are the elements with no measured density.
 *
 * Reading a box: the line in the middle is the median (half the elements are lighter, half
 * heavier) and the box holds the middle half. Alkali metals are light enough that some float on
 * water; the transition metals reach 22.6 g/cm³ (osmium).
 */
export const meta: ExampleMeta = {
  title: 'Elements: density by category',
  description:
    'Box plots of the density of solid and liquid elements in g/cm³ by category, with every element as a point.',
  tags: ['demo', 'box', 'points', 'jitter', 'statistical', 'annotations', 'hover'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

/** Below this the element is a gas at room conditions, g/cm³. */
const GAS_BELOW = 0.1;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const shown = ELEMENTS.filter((e) => e.density !== null && e.density >= GAS_BELOW);

  const traces = CATEGORIES.flatMap((category): BoxTrace[] => {
    const es = shown.filter((e) => e.category === category);
    if (es.length === 0) return [];
    return [
      {
        type: 'box',
        name: CATEGORY_TWO_LINES[category],
        y: es.map((e) => e.density),
        text: es.map((e) => `${e.name} (${e.symbol})`),
        boxpoints: 'all',
        jitter: 0.6,
        pointpos: -1.7,
        width: 0.4,
        line: { color: CATEGORY_COLOR[category], width: 1.25 },
        fillcolor: `${CATEGORY_COLOR[category]}33`,
        marker: { color: CATEGORY_COLOR[category], size: 4, opacity: 0.8 },
        hoverlabel: { namelength: -1 },
        hovertemplate: `<b>%{text}</b><br>%{y} g/cm³<extra>${category}</extra>`,
      },
    ];
  });

  const os = element('Os');
  const li = element('Li');
  const point = (
    e: typeof os,
    text: string,
    ax: number,
    ay: number,
    anchor: 'left' | 'right',
  ): LayoutAnnotation => ({
    x: CATEGORY_TWO_LINES[e.category],
    y: e.density as number,
    text,
    showarrow: true,
    arrowhead: 0,
    arrowwidth: 1,
    arrowcolor: LOOK.tick,
    ax,
    ay,
    xanchor: anchor,
    align: anchor,
    font: { size: 10, color: LOOK.text },
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow ? '' : `Density of ${shown.length} solid and liquid elements, by category`,
      },
      hovermode: 'closest',
      showlegend: false,
      xaxis: { type: 'category', tickfont: { size: narrow ? 7 : 10 } },
      yaxis: {
        title: { text: 'Density, g/cm³' },
        range: [-0.8, 25],
        dtick: 5,
        zeroline: true,
        zerolinecolor: LOOK.zero,
      },
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: 1,
          y1: 1,
          layer: 'below',
          line: { color: LOOK.tick, width: 1, dash: 'dot' },
        },
      ],
      annotations: narrow
        ? []
        : [
            point(
              os,
              `Osmium, ${fmtDensity(os.density as number)} g/cm³:<br>the densest element`,
              70,
              6,
              'left',
            ),
            point(
              li,
              `Lithium, ${fmtDensity(li.density as number)} g/cm³:<br>the lightest metal,<br>floats on water`,
              24,
              -112,
              'left',
            ),
            {
              xref: 'paper',
              yref: 'y',
              x: 1,
              y: 1,
              xanchor: 'right',
              yanchor: 'bottom',
              showarrow: false,
              text: 'water, 1 g/cm³',
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
