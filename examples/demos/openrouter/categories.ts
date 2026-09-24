import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CATEGORIES } from './datasets.mts';
import { chartConfig, isNarrow, LOOK, settled } from './ui.mts';

/**
 * What OpenRouter's tokens are spent on (demo page `demos/openrouter`): the top task categories by
 * share of tokens over a trailing 30-day window, as horizontal bars (`orientation: 'h'`), one
 * trace per task group so the legend names the groups. `categoryorder: 'total ascending'` sorts
 * the bars across traces, largest at the top, and `texttemplate` prints each share at the bar end.
 */
export const meta: ExampleMeta = {
  title: 'OpenRouter: tokens by task category',
  description:
    'Top task categories by share of tokens as horizontal bars, colored by task group and sorted across traces.',
  tags: ['demo', 'bar', 'horizontal', 'categoryorder', 'text', 'hover'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

const TOP = 15;
const GROUP_COLORS: Record<string, string> = {
  Agent: LOOK.colorway[2],
  Code: LOOK.colorway[1],
  Data: LOOK.colorway[5],
  General: LOOK.colorway[6],
};

export function run(el: HTMLElement): ExampleHandle {
  const narrow = isNarrow(el);
  const top = [...CATEGORIES].sort((a, b) => b.share - a.share).slice(0, TOP);
  const groups = [...new Set(top.map((c) => c.group))];

  const chart = createChart(el, {
    data: groups.map((group) => {
      const items = top.filter((c) => c.group === group);
      return {
        type: 'bar',
        orientation: 'h',
        name: group,
        y: items.map((c) => c.name),
        x: items.map((c) => c.share),
        marker: { color: GROUP_COLORS[group] ?? LOOK.tick },
        texttemplate: '%{x:.1%}',
        textposition: 'outside',
        hovertemplate: `<b>%{y}</b> (${group})<br>%{x:.1%} of tokens<extra></extra>`,
      };
    }),
    layout: {
      title: {
        text: narrow
          ? ''
          : `Share of tokens by task, top ${TOP} of ${CATEGORIES.length} (trailing 30 days)`,
      },
      barmode: 'overlay',
      bargap: 0.25,
      xaxis: { tickformat: '.0%', rangemode: 'tozero' },
      yaxis: { categoryorder: 'total ascending', automargin: true },
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
