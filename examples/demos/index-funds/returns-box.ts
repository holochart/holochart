import { createChart, type BoxTrace, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { FUNDS, HALVES, MONTH_SPANS, monthlyReturns, PERIODS } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, rgba, settled } from './ui.mts';

/**
 * Monthly returns of the five main index funds, half by half, as grouped `box` plots
 * (`boxmode: 'group'`): one trace per half, the fund on a category axis, so each fund gets a teal
 * box (the 24 months of 2022–24) next to an amber one (the 24 months of 2024–26). All 24 months
 * are drawn beside their box (`boxpoints: 'all'`, `jitter`, `pointpos`), the mean is a dashed line
 * (`boxmean`), and hover names the month of each point (`text`).
 */
export const meta: ExampleMeta = {
  title: 'Index funds: monthly returns by fund and half',
  description:
    'Grouped box plots of the 24 monthly returns of SPY, QQQ, DIA, IWM and VTI in each half, with every month drawn beside its box.',
  tags: [
    'demo',
    'box',
    'group',
    'boxmean',
    'points',
    'jitter',
    'statistical',
    'hover',
    'financial',
  ],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const monthly = FUNDS.map((t) => ({ t, r: monthlyReturns(t) }));
  const traces = HALVES.map((half): BoxTrace => {
    const x: string[] = [];
    const y: number[] = [];
    const text: string[] = [];
    for (const { t, r } of monthly) {
      MONTH_SPANS.forEach((span, i) => {
        if (span.half !== half) return;
        x.push(t);
        y.push((r[i] as number) * 100);
        text.push(`${t}, ${span.label}`);
      });
    }
    const color = PERIODS[half].color;
    return {
      type: 'box',
      name: PERIODS[half].label,
      x,
      y,
      text,
      boxpoints: 'all',
      jitter: 0.45,
      pointpos: -1.55,
      boxmean: true,
      line: { color, width: 1.25 },
      fillcolor: rgba(color, 0.25),
      marker: { color, size: 3.5, opacity: 0.75 },
      hoverlabel: { namelength: -1 },
    };
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : 'Monthly returns: 24 months in each half' },
      boxmode: 'group',
      boxgap: 0.25,
      boxgroupgap: 0.45,
      hovermode: 'closest',
      showlegend: true,
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'category', range: [-0.65, FUNDS.length - 0.45] },
      yaxis: {
        title: { text: 'Monthly return' },
        ticksuffix: '%',
        hoverformat: '+.1f',
        dtick: 5,
        zeroline: true,
        zerolinecolor: LOOK.zero,
      },
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
