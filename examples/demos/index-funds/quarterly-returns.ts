import { createChart, type Chart, type LayoutAnnotation, type LayoutShape } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COLOR,
  CORE,
  type Half,
  LABEL,
  pct,
  PERIODS,
  QUARTER_SPANS,
  quarterlyReturns,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, rgba, settled } from './ui.mts';

/**
 * The sixteen quarters of the four years as grouped bars (`barmode: 'group'`): the total return of
 * SPY, QQQ, DIA and IWM in each quarter, in the funds' colors. The x axis is a category axis, so
 * the two halves are marked with shapes placed by category position (a tinted `rect` over quarters
 * 1–8 and one over quarters 9–16, a dotted line between them) and labelled with annotations, in
 * the style the demo's date charts get from `halfShapes`. Hover is unified per quarter.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: quarterly returns',
  description:
    'Total return of SPY, QQQ, DIA and IWM in each of the 16 quarters from Q4 2022 to Q3 2026 as grouped bars, with the two halves marked.',
  tags: ['demo', 'bar', 'grouped', 'category', 'shapes', 'annotations', 'financial'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

/** The first quarter of the second half, as a category position. */
const SPLIT_AT = QUARTER_SPANS.findIndex((q) => q.half === 'second');

/** `halfShapes` for a category axis: a faint band per half and a dotted line at the split. */
function quarterShapes(): LayoutShape[] {
  const band = (x0: number, x1: number, color: string): LayoutShape => ({
    type: 'rect',
    xref: 'x',
    yref: 'y domain',
    x0,
    x1,
    y0: 0,
    y1: 1,
    fillcolor: rgba(color, 0.05),
    line: { width: 0 },
    layer: 'below',
  });
  return [
    band(-0.5, SPLIT_AT - 0.5, PERIODS.first.color),
    band(SPLIT_AT - 0.5, QUARTER_SPANS.length - 0.5, PERIODS.second.color),
    {
      type: 'line',
      xref: 'x',
      yref: 'y domain',
      x0: SPLIT_AT - 0.5,
      x1: SPLIT_AT - 0.5,
      y0: 0,
      y1: 1,
      line: { color: '#80838f', width: 1, dash: 'dot' },
    },
  ];
}

/** `halfLabels` for a category axis. */
function quarterLabels(long: boolean): LayoutAnnotation[] {
  const label = (x: number, half: Half): LayoutAnnotation => ({
    xref: 'x',
    yref: 'y domain',
    x,
    y: 1,
    text: long ? `${PERIODS[half].short}  (${PERIODS[half].label})` : PERIODS[half].short,
    showarrow: false,
    xanchor: 'left',
    yanchor: 'top',
    xshift: 6,
    yshift: -4,
    font: { color: PERIODS[half].color, size: 10 },
  });
  return [label(-0.5, 'first'), label(SPLIT_AT - 0.5, 'second')];
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const quarters = QUARTER_SPANS.map((q) => q.label);
  // Ticks every 5 points, in whole percents so that 0 is exact.
  const ticks = Array.from({ length: 13 }, (_, i) => -20 + 5 * i);
  const up = QUARTER_SPANS.filter((q, i) => CORE.every((t) => (quarterlyReturns(t)[i] ?? 0) > 0));

  const chart: Chart = createChart(chartEl, {
    data: CORE.map((t) => ({
      type: 'bar',
      name: narrow ? t : `${t} · ${LABEL[t]}`,
      x: quarters,
      y: quarterlyReturns(t),
      marker: { color: COLOR[t], line: { width: 0 } },
      hovertemplate: `${t}  %{y:+.1%}<extra></extra>`,
    })),
    layout: {
      title: {
        text: narrow
          ? ''
          : `Quarterly total returns: all four funds rose in ${up.length} of ${quarters.length} quarters`,
      },
      barmode: 'group',
      bargap: 0.22,
      bargroupgap: 0.05,
      hovermode: 'x unified',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { b: 48 },
      xaxis: {
        type: 'category',
        showgrid: false,
        tickvals: quarters,
        ticktext: QUARTER_SPANS.map((q) =>
          narrow
            ? q.label.startsWith('Q1')
              ? q.label.slice(3)
              : ''
            : q.label.replace(' ', '<br>'),
        ),
        tickfont: { size: 10 },
      },
      yaxis: {
        title: { text: 'Total return in the quarter' },
        tickvals: ticks.map((v) => v / 100),
        ticktext: ticks.map((v) => (v === 0 ? '0%' : pct(v / 100))),
        zeroline: true,
      },
      shapes: quarterShapes(),
      annotations: quarterLabels(!narrow),
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
