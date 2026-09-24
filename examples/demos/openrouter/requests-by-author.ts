import { createChart, makeSubplots } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { authorName, REQUEST_AUTHORS, REQUEST_WEEKS } from './datasets.mts';
import { chartConfig, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Small multiples of OpenRouter's weekly requests by model author (demo page `demos/openrouter`):
 * `makeSubplots` with one filled sparkline per top author, sharing the x axis per column, each
 * with its own y range. Weeks in which an author was not among OpenRouter's top 9 are gaps. Four columns
 * on wide containers, two on narrow ones.
 */
export const meta: ExampleMeta = {
  title: 'OpenRouter: weekly requests by author (small multiples)',
  description:
    'makeSubplots small multiples: one filled sparkline of weekly requests per top model author, each on its own y scale.',
  tags: ['demo', 'grid', 'subplots', 'make-subplots', 'area', 'scatter', 'hover'],
  size: { width: 960, height: 400 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const authors = REQUEST_AUTHORS.filter((a) => a !== 'others');
  const narrow = isNarrow(el);
  const cols = narrow ? 2 : 4;
  const rows = Math.ceil(authors.length / cols);
  const weeks = REQUEST_WEEKS.map((w) => w.week);

  const sp = makeSubplots({
    rows,
    cols,
    sharedX: true,
    verticalSpacing: narrow ? 0.09 : 0.16,
    horizontalSpacing: narrow ? 0.12 : 0.06,
    subplotTitles: authors.map(authorName),
  });

  // Compact ticks on every sparkline axis, and subplot titles at the template's text size (they
  // default to Plotly's 16 px).
  const layout: Record<string, unknown> = {
    ...sp.layout,
    annotations: ((sp.layout.annotations ?? []) as Record<string, unknown>[]).map((a) => ({
      ...a,
      font: { size: 10, color: LOOK.text },
    })),
  };
  for (const [key, value] of Object.entries(sp.layout)) {
    const axis = value as Record<string, unknown>;
    if (/^xaxis\d*$/.test(key)) layout[key] = { ...axis, tickformat: "%b '%y", nticks: 3 };
    if (/^yaxis\d*$/.test(key)) layout[key] = { ...axis, nticks: 3, rangemode: 'tozero' };
  }

  const color = LOOK.colorway[1];
  const chart = createChart(el, {
    data: authors.map((a, k) =>
      sp.place(
        {
          type: 'scatter',
          mode: 'lines',
          name: authorName(a),
          x: weeks,
          // A zero means the author was not in that week's top 9: a gap, not a real zero.
          y: REQUEST_WEEKS.map((w) =>
            (w.requestsB[a] ?? 0) > 0 ? (w.requestsB[a] ?? 0) * 1000 : null,
          ),
          fill: 'tozeroy',
          fillcolor: 'rgba(94, 116, 213, 0.22)',
          line: { color, width: 1.25 },
          hovertemplate: `<b>${authorName(a)}</b><br>%{x|%b %d, %Y}: %{y:,.0f}M requests<extra></extra>`,
        },
        Math.floor(k / cols) + 1,
        (k % cols) + 1,
      ),
    ),
    layout: {
      ...layout,
      title: { text: narrow ? '' : 'Weekly requests by model author (millions)' },
      showlegend: false,
      margin: { t: narrow ? 28 : 48 },
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
