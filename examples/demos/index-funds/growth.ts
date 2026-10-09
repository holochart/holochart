import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, DASH, fmtDate, FUNDS, growth, BASE_DATE, usd } from './analysis.mts';
import { chartConfig, frame, halfLabels, halfShapes, isNarrow, segmented, settled } from './ui.mts';

/**
 * Growth of $10,000 in the five main index funds over the four years, dividends reinvested. The
 * two halves are tinted bands with a dotted line at the split (`halfShapes`, shared by every time
 * chart of the demo). End-of-line labels are annotations, nudged apart where two would overlap. A
 * DOM toggle switches the y axis between linear and log with `chart.relayout`; on the log axis
 * equal heights are equal percentage moves, so the two halves' slopes can be compared.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: growth of $10,000 over four years',
  description:
    'Growth of $10,000 in SPY, QQQ, DIA, IWM and VTI from October 2022 to September 2026, dividends reinvested, with the two halves marked.',
  tags: ['demo', 'line', 'date', 'log', 'shapes', 'annotations', 'relayout', 'financial'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  const paths = FUNDS.map((t) => ({ t, ...growth(t) }));
  const traces = paths.map(({ t, dates, value }): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name: t,
    x: dates,
    y: value,
    line: { color: COLOR[t], width: t === 'VTI' ? 1.25 : 1.75, dash: DASH[t] },
    hovertemplate: `${t}  %{y:$,.0f}<extra></extra>`,
  }));

  // End-of-line labels, lowest first; a label closer than 4% to the one below moves up.
  const finals = paths
    .map(({ t, dates, value }) => ({ t, x: dates.at(-1) as string, v: value.at(-1) as number }))
    .sort((a, b) => a.v - b.v);
  const shift = new Map<string, number>();
  finals.forEach((f, i) => {
    const below = finals[i - 1];
    if (below && f.v / below.v < 1.04) {
      shift.set(below.t, (shift.get(below.t) ?? 0) - 5);
      shift.set(f.t, 5);
    }
  });
  const labelY = (v: number, log: boolean): number => (log ? Math.log10(v) : v);
  const ends = finals.map((f): LayoutAnnotation => ({
    x: f.x,
    y: labelY(f.v, false),
    xref: 'x',
    yref: 'y',
    text: `${f.t} ${usd(f.v)}`,
    showarrow: false,
    xanchor: 'left',
    xshift: 4,
    yshift: shift.get(f.t) ?? 0,
    font: { color: COLOR[f.t], size: 9 },
  }));
  const halves = halfLabels();

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : `Growth of $10,000 since ${fmtDate(BASE_DATE)}` },
      hovermode: 'x unified',
      margin: { r: narrow ? 64 : 96 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'date' },
      yaxis: { title: { text: 'Value (USD)' }, tickprefix: '$', tickformat: ',.0f' },
      shapes: halfShapes(),
      annotations: [...halves, ...ends],
    },
    config: chartConfig(narrow),
  });

  segmented(
    toolbar,
    'Y axis',
    [
      { value: 'linear', text: 'Linear' },
      { value: 'log', text: 'Log' },
    ],
    (value) => {
      const log = value === 'log';
      const update: Record<string, unknown> = {
        'yaxis.type': value,
        'yaxis.autorange': true,
        'yaxis.title.text': log ? 'Value (USD, log scale)' : 'Value (USD)',
      };
      finals.forEach((f, i) => {
        update[`annotations[${halves.length + i}].y`] = labelY(f.v, log);
      });
      void chart.relayout(update);
    },
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
