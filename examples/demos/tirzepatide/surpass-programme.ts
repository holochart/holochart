import { createChart, type Chart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, SURPASS } from './data.mts';
import { chartConfig, frame, isNarrow, segmented, settled } from './ui.mts';

/**
 * The five SURPASS registration trials in type 2 diabetes: change in HbA1c (or body weight, with
 * the toolbar toggle and `chart.react`) for tirzepatide 5, 10 and 15 mg next to each trial's
 * comparator, as grouped bars. The comparator differs by trial, so its bars take a per-bar color
 * (`marker.color` array) and the tick label names it. All values are one analysis, the
 * treatment-regimen estimand from the Mounjaro label.
 */
export const meta: ExampleMeta = {
  title: 'Tirzepatide: the SURPASS programme in type 2 diabetes',
  description:
    'HbA1c and weight change for tirzepatide 5, 10 and 15 mg against each comparator in SURPASS-1 to -5, as grouped bars with a measure toggle.',
  tags: ['demo', 'bar', 'grouped', 'ticktext', 'react', 'medical'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

type Measure = 'hba1c' | 'weight';

const DOSES = [
  { name: 'Tirzepatide 5 mg', color: COLOR.tirz5 },
  { name: 'Tirzepatide 10 mg', color: COLOR.tirz10 },
  { name: 'Tirzepatide 15 mg', color: COLOR.tirz15 },
] as const;

function figure(measure: Measure, narrow: boolean): FigureInput {
  const key = measure === 'hba1c' ? 'hba1c' : 'weightKg';
  const unit = measure === 'hba1c' ? ' points' : ' kg';
  const trials = SURPASS.map((t) => t.trial);
  return {
    data: [
      ...DOSES.map((dose, i) => ({
        type: 'bar' as const,
        name: dose.name,
        x: trials,
        y: SURPASS.map((t) => t[key][i] as number),
        marker: { color: dose.color, line: { width: 0 } },
        hovertemplate: `${dose.name}  %{y:+.1f}${unit}<extra>%{x}</extra>`,
      })),
      {
        type: 'bar' as const,
        name: 'Comparator (named under each trial)',
        x: trials,
        y: SURPASS.map((t) => t[key][3]),
        customdata: SURPASS.map((t) => t.comparator),
        marker: { color: SURPASS.map((t) => t.comparatorColor), line: { width: 0 } },
        hovertemplate: `%{customdata}  %{y:+.1f}${unit}<extra>%{x}</extra>`,
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : measure === 'hba1c'
            ? 'HbA1c fell about 2 points in every trial, whatever the comparator'
            : 'Weight fell with dose; on insulin it rose',
      },
      barmode: 'group',
      bargap: 0.22,
      bargroupgap: 0.05,
      margin: { b: 86 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        type: 'category',
        showgrid: false,
        tickvals: trials,
        ticktext: SURPASS.map(
          (t) => `${t.trial}<br>vs ${t.comparator.toLowerCase()}<br>${t.weeks} weeks`,
        ),
      },
      yaxis: {
        title: {
          text:
            measure === 'hba1c'
              ? 'Change in HbA1c, percentage points'
              : 'Change in body weight, kg',
        },
        zeroline: true,
      },
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('hba1c', narrow));

  segmented<Measure>(
    toolbar,
    'Measure',
    [
      { value: 'hba1c', text: 'HbA1c' },
      { value: 'weight', text: 'Body weight' },
    ],
    (measure) => void chart.react(figure(measure, narrow)),
    'hba1c',
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
