import { createChart, type BoxTrace, type Chart, type LayoutAnnotation } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, COMMON_START, MONTH_NAMES, pct, periodReturns, type Ticker } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Monthly returns of the two 3× funds next to their unleveraged ETFs, as `box` plots: every full
 * calendar month since SOXL's inception (Apr 2010 on; the partial first and current months are
 * left out) drawn beside its box (`boxpoints: 'all'`, `jitter`, `pointpos`), with the mean and
 * standard deviation as a dashed diamond (`boxmean: 'sd'`). Each index family keeps its hue, the
 * reference lighter. Hover names the month of each point (`text`) and the box statistics.
 *
 * Leverage spreads the monthly outcomes about 3× wider than the index's, so the funds' boxes are
 * much taller than QQQ's and SOXX's even where the medians differ less.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: monthly returns',
  description:
    'Box plots of every full month’s return since 2010 for TQQQ, QQQ, SOXL and SOXX, with all points and the mean.',
  tags: ['demo', 'box', 'boxmean', 'points', 'jitter', 'statistical', 'hover'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

const ORDER: readonly Ticker[] = ['QQQ', 'TQQQ', 'SOXX', 'SOXL'];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const traces = ORDER.map((t) => {
    const months = periodReturns(t, 'month', COMMON_START).filter((p) => !p.partial);
    return {
      type: 'box',
      name: t,
      y: months.map((p) => p.ret * 100),
      text: months.map((p) => `${MONTH_NAMES[p.month - 1]} ${p.year}`),
      boxpoints: 'all',
      jitter: 0.5,
      pointpos: -1.6,
      boxmean: 'sd',
      width: 0.45,
      line: { color: COLOR[t], width: 1.25 },
      fillcolor: t === 'TQQQ' || t === 'SOXL' ? `${COLOR[t]}40` : `${COLOR[t]}26`,
      marker: { color: COLOR[t], size: 3, opacity: 0.6 },
      hoverlabel: { namelength: -1 },
    } satisfies BoxTrace;
  });
  const n = traces[0]!.y.length;
  // Label the best and worst month of all (both SOXL's), next to their points.
  const soxl = traces[ORDER.indexOf('SOXL')]!;
  const extreme = (best: boolean): LayoutAnnotation => {
    const i = soxl.y.indexOf(best ? Math.max(...soxl.y) : Math.min(...soxl.y));
    return {
      x: 'SOXL',
      y: soxl.y[i],
      xshift: -116,
      xanchor: 'right',
      text: `${best ? 'Best' : 'Worst'} month, ${soxl.text[i]}: ${pct(soxl.y[i]! / 100, 0)}`,
      showarrow: false,
      font: { size: 10, color: LOOK.text },
    };
  };

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow ? '' : `Monthly returns, ${n} full months since ${MONTH_NAMES[3]} 2010`,
      },
      hovermode: 'closest',
      showlegend: true,
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'category' },
      yaxis: {
        title: { text: 'Monthly return' },
        ticksuffix: '%',
        hoverformat: '+.1f',
        zeroline: true,
        zerolinecolor: LOOK.zero,
      },
      annotations: [extreme(true), extreme(false)],
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
