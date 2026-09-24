import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { fmtDate } from './analysis.mts';
import { PLATFORM_WEEKS, REQUEST_WEEKS } from './datasets.mts';
import { chartConfig, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Why OpenRouter's tokens grow faster than its requests (demo page `demos/openrouter`): the whole
 * platform's weekly tokens divided by its weekly text requests, as a line with markers, with the
 * first and last week labelled by annotations. Tokens per request rising means longer prompts
 * and outputs (agents re-sending large contexts), not only more calls.
 */
export const meta: ExampleMeta = {
  title: 'OpenRouter: tokens per request',
  description:
    'Weekly platform tokens divided by weekly requests: a line with markers and annotated end points.',
  tags: ['demo', 'line', 'scatter', 'annotations', 'hover', 'date'],
  size: { width: 960, height: 300 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const narrow = isNarrow(el);
  const requests = new Map(
    REQUEST_WEEKS.map((w) => [w.week, Object.values(w.requestsB).reduce((s, v) => s + v, 0)]),
  );
  // Thousands of tokens per request, for the weeks both series cover.
  const points = PLATFORM_WEEKS.flatMap((w) => {
    const r = requests.get(w.week);
    return r ? [{ week: w.week, k: (w.tokensT * 1e12) / (r * 1e9) / 1000 }] : [];
  });
  const first = points[0];
  const last = points[points.length - 1];
  const label = (p: { week: string; k: number } | undefined, anchor: 'left' | 'right'): object[] =>
    p
      ? [
          {
            x: p.week,
            y: p.k,
            text: `<b>${p.k.toFixed(1)}K</b>`,
            showarrow: false,
            xanchor: anchor,
            yanchor: 'bottom',
            yshift: 6,
            font: { color: LOOK.title, size: 10 },
          },
        ]
      : [];

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Tokens per request',
        x: points.map((p) => p.week),
        y: points.map((p) => p.k),
        line: { color: LOOK.colorway[4], width: 1.5 },
        marker: { size: 4 },
        customdata: points.map((p) =>
          fmtDate(p.week, { month: 'short', day: 'numeric', year: 'numeric' }),
        ),
        hovertemplate:
          'Week of %{customdata}<br><b>%{y:.1f}K</b> tokens per request<extra></extra>',
      },
    ],
    layout: {
      title: { text: narrow ? '' : 'Average tokens per request, whole platform (thousands)' },
      showlegend: false,
      xaxis: { type: 'date', tickformat: "%b '%y" },
      yaxis: { ticksuffix: 'K', rangemode: 'tozero' },
      annotations: [...label(first, 'left'), ...label(last, 'right')],
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
