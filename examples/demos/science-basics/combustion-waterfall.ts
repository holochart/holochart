import { createChart, type Chart, type WaterfallTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Energy bookkeeping for burning methane, CH₄ + 2 O₂ → CO₂ + 2 H₂O, as a `waterfall`. Breaking
 * bonds costs energy (rising bars, `increasing`): four C–H bonds at 413 kJ/mol and two O=O bonds
 * at 498. Forming bonds gives energy back (falling bars, `decreasing`): two C=O bonds in CO₂ at
 * 799 and four O–H bonds at 463. The `measure: 'total'` bar is what is left: −802 kJ per mole of
 * methane, energy released as heat (`totals` gives it its own color). Values are average bond
 * energies, so the result is an estimate that happens to match the measured heat of combustion
 * to water vapor.
 */
export const meta: ExampleMeta = {
  title: 'Combustion: the energy books of burning methane',
  description:
    'A waterfall of bond energies for CH₄ + 2 O₂ → CO₂ + 2 H₂O: 2,648 kJ/mol in to break bonds, 3,450 out forming new ones, net −802.',
  tags: ['demo', 'waterfall', 'measure', 'annotations', 'chemistry'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const STEPS: readonly { label: string; count: number; bond: number; sign: 1 | -1 }[] = [
  { label: 'Break 4 C–H<br>in CH<sub>4</sub>', count: 4, bond: 413, sign: 1 },
  { label: 'Break 2 O=O<br>in 2 O<sub>2</sub>', count: 2, bond: 498, sign: 1 },
  { label: 'Form 2 C=O<br>in CO<sub>2</sub>', count: 2, bond: 799, sign: -1 },
  { label: 'Form 4 O–H<br>in 2 H<sub>2</sub>O', count: 4, bond: 463, sign: -1 },
];

const IN = '#5e74d5';
const OUT = '#cc540a';
const NET = '#e0b93a';

const signed = (v: number): string => `${v < 0 ? '−' : '+'}${Math.abs(v).toLocaleString('en-US')}`;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const y = STEPS.map((s) => s.sign * s.count * s.bond);
  const total = y.reduce((a, v) => a + v, 0);
  const put = y.filter((v) => v > 0).reduce((a, v) => a + v, 0);

  const trace: WaterfallTrace = {
    type: 'waterfall',
    name: 'Energy',
    x: [...STEPS.map((s) => s.label), 'Net<br>per mole of CH<sub>4</sub>'],
    y: [...y, null],
    measure: [...STEPS.map(() => 'relative'), 'total'],
    text: [...y.map(signed), signed(total)],
    textinfo: 'text',
    textposition: 'outside',
    textfont: { color: LOOK.title },
    customdata: [...STEPS.map((s) => `${s.count} × ${s.bond} kJ/mol`), 'energy released as heat'],
    hovertemplate: '%{x}<br><b>%{text} kJ/mol</b> (%{customdata})<extra></extra>',
    increasing: { marker: { color: IN } },
    decreasing: { marker: { color: OUT } },
    totals: { marker: { color: NET } },
    connector: { line: { color: LOOK.zero, width: 1 } },
  };

  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: {
        text: narrow ? '' : 'Burning methane: energy in to break bonds, more out making new ones',
      },
      showlegend: false,
      waterfallgap: 0.3,
      margin: { b: 64 },
      xaxis: { type: 'category', tickfont: { size: narrow ? 8 : 11 } },
      yaxis: {
        title: { text: 'Energy (kJ per mole of methane)' },
        range: [-1300, 3100],
        dtick: 500,
        tickformat: ',',
        zeroline: true,
        zerolinecolor: LOOK.text,
      },
      annotations: narrow
        ? []
        : [
            {
              xref: 'paper',
              x: 0.99,
              xanchor: 'right',
              yref: 'paper',
              y: 0.97,
              yanchor: 'top',
              align: 'right',
              showarrow: false,
              font: { size: 11, color: LOOK.text },
              text:
                `<span style="color:${IN}"><b>Energy in</b></span>: ${put.toLocaleString('en-US')} kJ to break the old bonds<br>` +
                `<span style="color:${OUT}"><b>Energy out</b></span>: ${(put - total).toLocaleString('en-US')} kJ from forming the new ones<br>` +
                `<span style="color:${NET}"><b>Net</b></span>: ${Math.abs(total)} kJ released, which is why a flame is hot`,
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
