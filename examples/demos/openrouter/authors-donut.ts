import { createChart, render, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { fmtDate, fmtT } from './analysis.mts';
import { AUTHOR_WEEKS, AUTHORS, authorColor, authorName } from './datasets.mts';
import { chartConfig, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Who processed last week's OpenRouter tokens (demo page `demos/openrouter`): a donut of the
 * latest complete week by model author, in the demo's author colors, with the week's total as the
 * trace title in the hole. Slices keep the data order (`sort: false`, largest author first,
 * "Other models" last: the tokens of models outside the week's top 9, which OpenRouter does
 * not break down) and run clockwise from 12 o'clock.
 */
export const meta: ExampleMeta = {
  title: 'OpenRouter: last week by author (donut)',
  description:
    "The latest complete week's tokens by model author as a donut, with the week's total in the hole.",
  tags: ['demo', 'pie', 'donut', 'hover'],
  size: { width: 480, height: 400 },
  testTolerance: 0.004,
};

const CHARACTERS = '0123456789.,%·T ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz()';

export function run(el: HTMLElement): ExampleHandle {
  const narrow = isNarrow(el);
  const week = AUTHOR_WEEKS[AUTHOR_WEEKS.length - 1];
  let chart: Chart | undefined;
  let disposed = false;
  // Inside-label fit depends on text metrics: measure with the default font from the start.
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed || !week) return;
    const named = AUTHORS.filter((a) => a !== 'others' && (week.tokensT[a] ?? 0) > 0).sort(
      (a, b) => (week.tokensT[b] ?? 0) - (week.tokensT[a] ?? 0),
    );
    const order = [...named, 'others'];
    const total = order.reduce((s, a) => s + (week.tokensT[a] ?? 0), 0);
    chart = createChart(el, {
      data: [
        {
          type: 'pie',
          name: 'Tokens',
          labels: order.map((a) => (a === 'others' ? 'Other models' : authorName(a))),
          values: order.map((a) => week.tokensT[a] ?? 0),
          sort: false,
          direction: 'clockwise',
          hole: 0.55,
          textinfo: 'percent',
          marker: {
            colors: order.map(authorColor),
            line: { color: LOOK.bg, width: 2 },
          },
          hovertemplate: '<b>%{label}</b><br>%{value:.1f}T tokens<br>%{percent}<extra></extra>',
          title: {
            text: `${fmtT(total)} tokens<br>week of ${fmtDate(week.week)}`,
            position: 'middle center',
            font: { size: 14 },
          },
        },
      ],
      layout: {
        title: { text: narrow ? '' : 'Tokens by author, latest complete week' },
        showlegend: true,
        // A vertical legend right of the ring (a horizontal one would wrap into the title).
        legend: { orientation: 'v', x: 1, xanchor: 'left', y: 0.5, yanchor: 'middle' },
      },
      config: chartConfig(narrow),
    });
    await settled(chart);
  });

  return {
    ready,
    get renderer() {
      return chart?.three.renderer;
    },
    dispose: () => {
      disposed = true;
      chart?.destroy();
    },
  };
}
