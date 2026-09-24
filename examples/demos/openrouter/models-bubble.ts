import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { fmtDate, fmtT } from './analysis.mts';
import { AUTHORS, authorColor, authorName, MODELS, type Model } from './datasets.mts';
import { chartConfig, isNarrow, LOOK, settled } from './ui.mts';

/**
 * OpenRouter's text models by price and context window (demo page `demos/openrouter`): prompt
 * price per million tokens against context length, both on log axes. The whole catalog is drawn
 * as small grey points; models that made a weekly top 9 are bubbles sized by their tokens in
 * their latest such week (`sizemode: 'area'`, one shared `sizeref`) and colored by author.
 */
export const meta: ExampleMeta = {
  title: 'OpenRouter: models by price, context and usage',
  description:
    'Every text model by prompt price and context length on log axes; models with top-9 usage as bubbles sized by weekly tokens, colored by author.',
  tags: ['demo', 'bubble', 'scatter', 'markers', 'log', 'hover'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

const K = 1024;
const CONTEXT_TICKS = [
  4 * K,
  8 * K,
  16 * K,
  32 * K,
  64 * K,
  128 * K,
  256 * K,
  512 * K,
  K * K,
  2 * K * K,
];
const CONTEXT_TEXT = ['4K', '8K', '16K', '32K', '64K', '128K', '256K', '512K', '1M', '2M'];
const PRICE_TICKS = [0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100];

const contextLabel = (n: number): string =>
  n >= K * K ? `${+(n / (K * K)).toFixed(2)}M` : `${Math.round(n / K)}K`;

const hoverRow = (m: Model): string[] => [
  m.name,
  authorName(m.author),
  `$${m.promptPerM} / $${m.completionPerM}`,
  contextLabel(m.contextLength),
  m.weeklyTokensT === undefined || m.weeklyTokensWeek === undefined
    ? ''
    : `${fmtT(m.weeklyTokensT)} in the week of ${fmtDate(m.weeklyTokensWeek)}`,
];

export function run(el: HTMLElement): ExampleHandle {
  const narrow = isNarrow(el);
  const priced = MODELS.filter((m) => m.promptPerM > 0 && m.contextLength > 0);
  const used = priced.filter((m) => (m.weeklyTokensT ?? 0) > 0);
  const unused = priced.filter((m) => !((m.weeklyTokensT ?? 0) > 0));

  // One trace per top author (legend = author), then the other authors together.
  const groups = [...AUTHORS.filter((a) => a !== 'others'), 'others'].map((author) => ({
    author,
    models: used.filter((m) =>
      author === 'others'
        ? !AUTHORS.includes(m.author) || m.author === 'others'
        : m.author === author,
    ),
  }));
  const maxTokens = Math.max(...used.map((m) => m.weeklyTokensT ?? 0));
  // The largest model 56 px across (Plotly's rule: sizeref = 2 · max / maxPx²).
  const sizeref = (2 * maxTokens) / 56 ** 2;

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'No top-9 week',
        x: unused.map((m) => m.promptPerM),
        y: unused.map((m) => m.contextLength),
        marker: { size: 3, color: LOOK.zero },
        customdata: unused.map(hoverRow),
        hovertemplate:
          '<b>%{customdata[0]}</b><br>%{customdata[1]}<br>' +
          'Prompt / completion per 1M: %{customdata[2]}<br>Context: %{customdata[3]}<extra></extra>',
      },
      ...groups
        .filter((g) => g.models.length > 0)
        .map((g) => ({
          type: 'scatter',
          mode: 'markers',
          name: g.author === 'others' ? 'Other authors' : authorName(g.author),
          x: g.models.map((m) => m.promptPerM),
          y: g.models.map((m) => m.contextLength),
          marker: {
            size: g.models.map((m) => m.weeklyTokensT ?? 0),
            sizemode: 'area',
            sizeref,
            sizemin: 3,
            color: authorColor(g.author),
            opacity: 0.75,
            line: { width: 1 },
          },
          customdata: g.models.map(hoverRow),
          hovertemplate:
            '<b>%{customdata[0]}</b><br>%{customdata[1]}<br>' +
            'Prompt / completion per 1M: %{customdata[2]}<br>Context: %{customdata[3]}<br>' +
            '%{customdata[4]}<extra></extra>',
        })),
    ],
    layout: {
      title: {
        text: narrow ? '' : 'Text models: prompt price vs context window, sized by weekly tokens',
      },
      hovermode: 'closest',
      xaxis: {
        type: 'log',
        title: { text: 'Prompt price, USD per million tokens' },
        tickmode: 'array',
        tickvals: PRICE_TICKS,
        ticktext: PRICE_TICKS.map((v) => `$${v}`),
      },
      yaxis: {
        type: 'log',
        title: { text: 'Context window (tokens)' },
        tickmode: 'array',
        tickvals: CONTEXT_TICKS,
        ticktext: CONTEXT_TEXT,
      },
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
