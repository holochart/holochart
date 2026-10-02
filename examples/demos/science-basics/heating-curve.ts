import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { STATE_COLOR } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The heating curve of water: the temperature of 1 kg of water as heat is added steadily, from
 * ice at −20 °C to steam at 120 °C, as five filled `scatter` areas, one per stretch and color
 * (each fills down to an invisible baseline trace with `fill: 'tonexty'`). Computed from the
 * specific heat capacities 2.09 (ice), 4.18 (water) and 2.01 (steam) kJ/(kg·K) and the latent
 * heats 334 kJ/kg (melting) and 2,260 kJ/kg (boiling).
 *
 * The temperature climbs while one state warms up, and stays flat while the state changes: all
 * the heat then goes into pulling the molecules apart. Boiling the water away takes 2,260 kJ, more
 * than five times the 418 kJ that took it from 0 to 100 °C. The two flat stretches are labelled.
 */
export const meta: ExampleMeta = {
  title: 'Heating curve: ice to steam',
  description:
    'Temperature of 1 kg of water against heat added, from −20 °C ice to 120 °C steam, as five filled areas with the melting and boiling plateaus.',
  tags: ['demo', 'scatter', 'area', 'fill', 'annotations', 'physics'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const C_ICE = 2.09; // kJ/(kg·K)
const C_WATER = 4.18;
const C_STEAM = 2.01;
const L_MELT = 334; // kJ/kg
const L_BOIL = 2260;
const T_START = -20;
const T_END = 120;
const BASE = -40;

interface Stage {
  name: string;
  /** Heat taken by the stage, kJ. */
  heat: number;
  t0: number;
  t1: number;
  color: string;
  how: string;
}

const STAGES: readonly Stage[] = [
  {
    name: 'Ice warms',
    heat: C_ICE * (0 - T_START),
    t0: T_START,
    t1: 0,
    color: STATE_COLOR.Solid,
    how: '2.09 kJ per kg per °C',
  },
  { name: 'Ice melts', heat: L_MELT, t0: 0, t1: 0, color: '#7a8fd0', how: '334 kJ per kg' },
  {
    name: 'Water warms',
    heat: C_WATER * 100,
    t0: 0,
    t1: 100,
    color: STATE_COLOR.Liquid,
    how: '4.18 kJ per kg per °C',
  },
  { name: 'Water boils', heat: L_BOIL, t0: 100, t1: 100, color: '#c0703a', how: '2,260 kJ per kg' },
  {
    name: 'Steam warms',
    heat: C_STEAM * (T_END - 100),
    t0: 100,
    t1: T_END,
    color: STATE_COLOR.Gas,
    how: '2.01 kJ per kg per °C',
  },
];

const kj = (v: number): string =>
  `${Math.round(v).toLocaleString('en-US', { maximumFractionDigits: 0 })} kJ`;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const traces: ScatterTrace[] = [];
  const starts: number[] = [];
  let q = 0;
  for (const s of STAGES) {
    starts.push(q);
    const x = [q, q + s.heat];
    // The floor each area fills down to.
    traces.push({
      type: 'scatter',
      mode: 'lines',
      x,
      y: [BASE, BASE],
      line: { width: 0, color: s.color },
      showlegend: false,
      hoverinfo: 'skip',
    });
    traces.push({
      type: 'scatter',
      mode: 'lines',
      name: s.name,
      x,
      y: [s.t0, s.t1],
      fill: 'tonexty',
      fillcolor: `${s.color}66`,
      line: { color: s.color, width: 2.5 },
      hovertemplate:
        `<b>${s.name}</b>: ${kj(s.heat)} (${s.how})<br>` +
        '%{x:,.0f} kJ added so far, %{y:.0f} °C<extra></extra>',
    });
    q += s.heat;
  }
  const total = q;

  const plateau = (i: number, text: string): LayoutAnnotation => {
    const s = STAGES[i]!;
    return {
      x: starts[i]! + s.heat / 2,
      y: s.t0,
      text,
      showarrow: true,
      arrowhead: 0,
      arrowwidth: 1,
      arrowcolor: LOOK.tick,
      ax: 0,
      ay: -34,
      align: 'center',
      font: { size: 10, color: LOOK.text },
    };
  };

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : 'Heating 1 kg of ice until it is steam' },
      hovermode: 'closest',
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: {
        title: { text: 'Heat added (kJ)' },
        range: [0, total],
        tickformat: ',',
        zeroline: false,
      },
      yaxis: {
        title: { text: 'Temperature (°C)' },
        range: [BASE, 140],
        tickvals: [-20, 0, 20, 40, 60, 80, 100, 120],
        zeroline: false,
      },
      annotations: [
        plateau(1, narrow ? 'Melting, 0 °C' : '<b>Melting at 0 °C</b><br>334 kJ'),
        plateau(
          3,
          narrow
            ? 'Boiling, 100 °C: 2,260 kJ'
            : '<b>Boiling at 100 °C</b>: 2,260 kJ and the temperature does not move',
        ),
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
