import { createChart, type Chart, type ViolinTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { meanSpeed, sampleSpeeds } from './matter.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Speeds of the molecules of six gases at the same temperature, 300 K, simulated: 2,000 molecules
 * of each (velocity components normal with standard deviation sqrt(kT/m), seeded; the speed is
 * the length of the vector). One `violin` per gas, lightest first, with an inner box (`box`) for
 * the quartiles and a mean line (`meanline`); the violin's width shows how common each speed is.
 *
 * At one temperature every gas has the same average energy of motion, so light molecules must
 * move faster: hydrogen (2 u) averages about 1,780 m/s, carbon dioxide (44 u) about 380 m/s.
 */
export const meta: ExampleMeta = {
  title: 'Gas speeds: light and heavy molecules at 300 K',
  description:
    'Violin plots of the simulated speeds of 2,000 molecules each of H₂, He, H₂O, N₂, O₂ and CO₂ at 300 K, with box and mean line.',
  tags: ['demo', 'violin', 'box', 'meanline', 'simulated', 'statistical', 'physics'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const KELVIN = 300;
const N = 2000;
const GASES = [
  { formula: 'H<sub>2</sub>', name: 'Hydrogen', mass: 2, color: '#d8dae3' },
  { formula: 'He', name: 'Helium', mass: 4, color: '#e0b93a' },
  { formula: 'H<sub>2</sub>O', name: 'Water vapor', mass: 18, color: '#12a38a' },
  { formula: 'N<sub>2</sub>', name: 'Nitrogen', mass: 28, color: '#5e74d5' },
  { formula: 'O<sub>2</sub>', name: 'Oxygen', mass: 32, color: '#ea2a37' },
  { formula: 'CO<sub>2</sub>', name: 'Carbon dioxide', mass: 44, color: '#80838f' },
] as const;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const traces = GASES.map((g, i): ViolinTrace => {
    const label = narrow ? g.formula : `${g.formula}<br>${g.mass} u`;
    const speeds = sampleSpeeds(g.mass, KELVIN, N, 7000 + i);
    return {
      type: 'violin',
      name: `${g.name} (${g.formula}, ${g.mass} u)`,
      x: speeds.map(() => label),
      y: speeds,
      spanmode: 'hard',
      points: false,
      width: 0.85,
      line: { color: g.color, width: 1.25 },
      fillcolor: `${g.color}59`,
      box: { visible: true, width: 0.18, fillcolor: 'rgba(10, 10, 15, 0.5)' },
      meanline: { visible: true, color: LOOK.title, width: 1 },
      hoveron: 'violins',
      hoverlabel: { namelength: -1 },
    };
  });

  const first = GASES[0];
  const last = GASES[GASES.length - 1]!;
  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow ? '' : 'Six gases at 300 K (27 °C): 2,000 simulated molecules of each',
      },
      showlegend: false,
      hovermode: 'closest',
      violingap: 0.1,
      xaxis: { type: 'category', title: { text: narrow ? '' : 'Gas and mass of one molecule' } },
      yaxis: {
        title: { text: 'Speed (m/s)' },
        range: [0, 5000],
        dtick: 1000,
        tickformat: ',',
        hoverformat: ',.0f',
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.99,
          y: 0.97,
          xanchor: 'right',
          yanchor: 'top',
          align: 'right',
          showarrow: false,
          font: { size: 11, color: LOOK.text },
          text:
            'Same temperature, same average energy of motion:<br>lighter molecules move faster.<br>' +
            `Mean speed: ${first.formula} ${Math.round(meanSpeed(first.mass, KELVIN)).toLocaleString('en-US')} m/s, ` +
            `${last.formula} ${Math.round(meanSpeed(last.mass, KELVIN))} m/s`,
        },
      ],
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
