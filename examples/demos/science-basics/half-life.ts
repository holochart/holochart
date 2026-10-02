import { createChart, type Chart, type FunnelTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Radioactive decay in steps, as a `funnel`: the carbon-14 left in a sample after each half-life
 * of 5,730 years. Every stage is half as wide as the one above it (100%, 50%, 25%, 12.5%, 6.25%,
 * 3.125%), whatever the amount you start with. Bar text shows the percent (`texttemplate`), the
 * stage labels give the years, and the bars fade as the carbon-14 runs out (`marker.color` per
 * stage). This steady halving is the clock behind radiocarbon dating.
 */
export const meta: ExampleMeta = {
  title: 'Half-life: carbon-14, halving every 5,730 years',
  description:
    'A funnel of the carbon-14 left after 0 to 5 half-lives: 100%, 50%, 25%, 12.5%, 6.25% and 3.125% at 0 to 28,650 years.',
  tags: ['demo', 'funnel', 'texttemplate', 'physics'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

const HALF_LIFE = 5730;
const STAGES = [0, 1, 2, 3, 4, 5] as const;
const SHADES = ['#5e74d5', '#5469c0', '#4a5dab', '#405196', '#374682', '#2e3a6d'] as const;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const years = STAGES.map((k) => (k * HALF_LIFE).toLocaleString('en-US'));

  const trace: FunnelTrace = {
    type: 'funnel',
    name: 'Carbon-14',
    y: STAGES.map((k) =>
      k === 0 ? 'Start' : narrow ? `${years[k]} y` : `After ${years[k]} years`,
    ),
    x: STAGES.map((k) => 100 / 2 ** k),
    customdata: STAGES.map((k) => [k, years[k]]),
    texttemplate: '%{x}%',
    // The last bar is too narrow for its label.
    textposition: STAGES.map((k) => (k === 5 ? 'outside' : 'inside')),
    textfont: { color: LOOK.title, size: 12 },
    marker: { color: [...SHADES], line: { color: LOOK.bg, width: 1 } },
    connector: {
      fillcolor: 'rgba(94, 116, 213, 0.15)',
      line: { color: LOOK.zero, width: 1 },
    },
    hovertemplate:
      '<b>%{x}% of the carbon-14 is left</b><br>after %{customdata[1]} years (%{customdata[0]} half-lives)<extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: { text: narrow ? '' : 'Carbon-14 left in a sample: half is gone every 5,730 years' },
      showlegend: false,
      funnelgap: 0.25,
      margin: narrow ? { l: 72, r: 12, t: 28, b: 16 } : { l: 150, r: 40, b: 32 },
      yaxis: { tickfont: { size: narrow ? 9 : 11 } },
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
