import { createChart, type Chart, type FunnelTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { dailyReturns, HALVES, LABEL, PERIODS, share, type Fund } from './analysis.mts';
import { chartConfig, frame, fundPicker, isNarrow, LOOK, rgba, settled } from './ui.mts';

/**
 * How rare big days are, as grouped funnels (`funnel` with `funnelmode: 'group'`): of the 501
 * sessions in each half, how many moved more than 0.5%, 1%, 2% and 3% in either direction. One
 * trace per half, so every stage has a teal bar (2022–24) above an amber one (2024–26), each
 * centered on the value axis with its own connector regions. Each bar is labelled with its count
 * and its share of the half's sessions (`text` with `textinfo: 'text'`); hover adds the share of
 * the previous stage. The fund picker rebuilds the figure with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: how rare big days are',
  description:
    'Grouped funnels of the sessions in each half that moved more than 0.5%, 1%, 2% and 3% either way, with a fund picker.',
  tags: ['demo', 'funnel', 'group', 'funnelmode', 'text', 'connector', 'react', 'financial'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

/** Absolute daily return each stage has to exceed. */
const THRESHOLDS = [0, 0.005, 0.01, 0.02, 0.03];
const STAGES = [
  'All sessions',
  'Moved more than 0.5%',
  'More than 1%',
  'More than 2%',
  'More than 3%',
];
const SHORT = ['All', '> 0.5%', '> 1%', '> 2%', '> 3%'];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  function figure(fund: Fund): { data: FunnelTrace[]; layout: Record<string, unknown> } {
    const data = HALVES.map((half): FunnelTrace => {
      const { r } = dailyReturns(fund, half);
      const counts = THRESHOLDS.map((t) => r.filter((v) => Math.abs(v) > t || t === 0).length);
      const color = PERIODS[half].color;
      return {
        type: 'funnel',
        name: PERIODS[half].label,
        y: narrow ? SHORT : STAGES,
        x: counts,
        // Padded with no-break spaces, so a label outside a thin bar stands clear of it.
        text: counts.map((n, i) => {
          const part = n / r.length;
          return i === 0
            ? `${n} sessions`
            : `\u00a0${n} · ${share(part, part < 0.0995 ? 1 : 0)}\u00a0`;
        }),
        textinfo: 'text',
        textposition: 'auto',
        insidetextfont: { size: 11, color: LOOK.bg },
        outsidetextfont: { size: 11, color },
        marker: { color },
        connector: { fillcolor: rgba(color, 0.14), line: { color: rgba(color, 0.5), width: 1 } },
        hovertemplate:
          `<b>%{y}</b><br>${PERIODS[half].short}: %{x} of ${r.length} sessions ` +
          `(%{percentInitial:.1%})<br>%{percentPrevious:.0%} of the stage above<extra></extra>`,
      };
    });
    return {
      data,
      layout: {
        title: {
          text: narrow ? '' : `${fund} (${LABEL[fund]}): sessions by the size of the day’s move`,
        },
        funnelmode: 'group',
        funnelgap: 0.22,
        funnelgroupgap: 0.08,
        hovermode: 'closest',
        legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
        margin: { l: narrow ? 56 : 152, r: 24, b: 24 },
        xaxis: { visible: false },
        yaxis: { showgrid: false, tickfont: { size: 11, color: LOOK.text } },
      },
    };
  }

  const chart: Chart = createChart(chartEl, { ...figure('SPY'), config: chartConfig(narrow) });
  fundPicker(toolbar, (fund) => {
    void chart.react({ ...figure(fund), config: chartConfig(narrow) });
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
