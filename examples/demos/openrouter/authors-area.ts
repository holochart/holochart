import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { AUTHOR_WEEKS, AUTHORS, authorColor, authorName } from './datasets.mts';
import { chartConfig, frame, isNarrow, segmented, settled } from './ui.mts';

/**
 * Weekly OpenRouter tokens by model author over a year (demo page `demos/openrouter`): one scatter
 * trace per author in a shared `stackgroup`, with the unattributed rest (other models: everything
 * outside each week's top 9) on top. A DOM toggle switches between absolute tokens and each author's share
 * of the week with `chart.restyle({ groupnorm: 'percent' })` on the stack group's first trace.
 */
export const meta: ExampleMeta = {
  title: 'OpenRouter: weekly tokens by author, stacked',
  description:
    'A year of weekly tokens by model author as stacked areas, with a toggle between totals and 100% shares (groupnorm).',
  tags: ['demo', 'area', 'stacked', 'stackgroup', 'groupnorm', 'scatter', 'hover', 'restyle'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

/** Band fill: the author color at 70% (other models fainter, so the named authors stand out). */
function fill(author: string): string {
  const hex = authorColor(author);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${author === 'others' ? 0.35 : 0.7})`;
}

export interface Options {
  /** Start in share (100%) mode. */
  share?: boolean;
}

export function run(el: HTMLElement): ExampleHandle {
  return mount(el);
}

/** `run`, with options (the `authors-share` example starts in share mode). */
export function mount(el: HTMLElement, options: Options = {}): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const share = options.share ?? false;
  const weeks = AUTHOR_WEEKS.map((w) => w.week);
  const narrow = isNarrow(el);

  // Top authors bottom-up, largest last week at the bottom; "others" on top.
  const last = AUTHOR_WEEKS[AUTHOR_WEEKS.length - 1];
  const named = AUTHORS.filter((a) => a !== 'others').sort(
    (a, b) => (last?.tokensT[b] ?? 0) - (last?.tokensT[a] ?? 0),
  );
  const order = [...named, 'others'];

  const hover = (percent: boolean): string =>
    percent
      ? '%{fullData.name}: %{y:.1f}%<extra></extra>'
      : '%{fullData.name}: %{y:.2f}T<extra></extra>';

  const chart = createChart(chartEl, {
    data: order.map((author, i) => ({
      type: 'scatter',
      name: author === 'others' ? 'Other models (outside the weekly top 9)' : authorName(author),
      x: weeks,
      y: AUTHOR_WEEKS.map((w) => w.tokensT[author] ?? 0),
      stackgroup: 'authors',
      ...(i === 0 && share ? { groupnorm: 'percent' } : {}),
      line: { color: authorColor(author), width: 0.75 },
      fillcolor: fill(author),
      hovertemplate: hover(share),
    })),
    layout: {
      title: { text: narrow ? '' : 'Weekly tokens by model author' },
      hovermode: 'x unified',
      xaxis: { type: 'date', tickformat: "%b '%y" },
      yaxis: share
        ? { ticksuffix: '%', range: [0, 100] }
        : { ticksuffix: 'T', title: { text: 'Tokens per week' } },
    },
    config: chartConfig(narrow),
  });

  segmented(
    toolbar,
    'Show',
    [
      { value: 'tokens', text: 'Tokens' },
      { value: 'share', text: 'Share' },
    ],
    (value) => {
      const percent = value === 'share';
      void chart
        .restyle({ groupnorm: percent ? 'percent' : '' }, [0])
        .then(() => chart.restyle({ hovertemplate: hover(percent) }))
        .then(() =>
          chart.relayout(
            percent
              ? { 'yaxis.ticksuffix': '%', 'yaxis.range': [0, 100], 'yaxis.title.text': '' }
              : {
                  'yaxis.ticksuffix': 'T',
                  'yaxis.autorange': true,
                  'yaxis.title.text': 'Tokens per week',
                },
          ),
        );
    },
    share ? 'share' : 'tokens',
  );

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
