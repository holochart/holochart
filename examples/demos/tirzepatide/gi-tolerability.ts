import { createChart, type Chart, type FigureInput } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { GI_EVENTS, LABEL_GI } from './data.mts';
import { chartConfig, frame, isNarrow, segmented, settled } from './ui.mts';

/**
 * Gastrointestinal adverse reactions from the US labels of four obesity drugs, as grouped bars:
 * one trace per drug, four events on the x axis. A toolbar toggle switches between the rate on
 * the drug and the rate on that label's own placebo arm with `chart.react`, on a fixed y range so
 * the two views compare directly. The placebo view draws the same colors at reduced opacity.
 */
export const meta: ExampleMeta = {
  title: 'GLP-1 based obesity drugs: gastrointestinal adverse reactions',
  description:
    'Nausea, diarrhoea, vomiting and constipation rates from four US labels as grouped bars, with a drug / placebo toggle.',
  tags: ['demo', 'bar', 'grouped', 'react', 'medical'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

type Arm = 'drug' | 'placebo';

function figure(arm: Arm, narrow: boolean): FigureInput {
  return {
    data: LABEL_GI.map((d) => ({
      type: 'bar' as const,
      name: d.drug,
      x: [...GI_EVENTS],
      y: [...(arm === 'drug' ? d.drugPct : d.placeboPct)],
      marker: { color: d.color, opacity: arm === 'drug' ? 1 : 0.5, line: { width: 0 } },
      texttemplate: '%{y:.0f}',
      textposition: 'outside' as const,
      hovertemplate:
        `${arm === 'drug' ? d.drug : `Placebo arm of the ${d.ref.short}`}  %{y}%` +
        `<extra>%{x}, n = ${d.n[arm === 'drug' ? 0 : 1].toLocaleString('en-US')}</extra>`,
    })),
    layout: {
      title: {
        text: narrow
          ? ''
          : arm === 'drug'
            ? 'Nausea affects a quarter to nearly half of patients at the top dose'
            : 'The same events on placebo, in the same trials',
      },
      barmode: 'group',
      bargap: 0.2,
      bargroupgap: 0.06,
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: { type: 'category', showgrid: false },
      yaxis: {
        title: { text: 'Patients reporting the event, %' },
        range: [0, 50],
        ticksuffix: '%',
      },
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('drug', narrow));

  segmented<Arm>(
    toolbar,
    'Arm',
    [
      { value: 'drug', text: 'Drug, top dose' },
      { value: 'placebo', text: 'Placebo' },
    ],
    (arm) => void chart.react(figure(arm, narrow)),
    'drug',
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
