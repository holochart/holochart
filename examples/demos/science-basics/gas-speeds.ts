import { createChart, type Chart, type HistogramTrace, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { linspace } from './data.mts';
import { maxwell, meanSpeed, sampleSpeeds } from './matter.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * How fast the molecules of a gas move, simulated: 4,000 nitrogen molecules (28 u) at each of
 * 100 K, 300 K and 900 K. Each velocity component is drawn from a normal distribution with
 * standard deviation sqrt(kT/m) (seeded, so every run is the same) and the speed is the length of
 * the velocity vector. One translucent `histogram` per temperature (`barmode: 'overlay'`,
 * `histnorm: 'probability density'`, shared 25 m/s `xbins`), with the Maxwell–Boltzmann curve the
 * simulation should follow drawn on top as a `scatter` line.
 *
 * The hotter the gas, the faster its molecules on average and the wider the spread of speeds:
 * the mean goes from 275 m/s at 100 K to 825 m/s at 900 K (nine times the temperature, three
 * times the speed).
 */
export const meta: ExampleMeta = {
  title: 'Gas speeds: nitrogen at three temperatures',
  description:
    'Overlaid histograms of the simulated speeds of 4,000 nitrogen molecules at 100 K, 300 K and 900 K, with the Maxwell–Boltzmann curves.',
  tags: ['demo', 'histogram', 'scatter', 'overlay', 'histnorm', 'simulated', 'physics'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const MASS = 28; // u
const N = 4000;
const BIN = 25; // m/s
const V_MAX = 1800;
const GASES = [
  { kelvin: 100, color: '#5e74d5', seed: 101 },
  { kelvin: 300, color: '#e0b93a', seed: 303 },
  { kelvin: 900, color: '#ea2a37', seed: 909 },
] as const;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const v = linspace(0, V_MAX, 361);

  const histograms = GASES.map((g): HistogramTrace => ({
    type: 'histogram',
    name: `${g.kelvin} K`,
    legendgroup: String(g.kelvin),
    x: sampleSpeeds(MASS, g.kelvin, N, g.seed),
    xbins: { start: 0, end: V_MAX + 400, size: BIN },
    histnorm: 'probability density',
    opacity: 0.5,
    marker: { color: g.color },
    hovertemplate: `${g.kelvin} K, simulated<br>%{x} m/s<extra></extra>`,
  }));
  const curves = GASES.map((g): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name: `${g.kelvin} K theory`,
    legendgroup: String(g.kelvin),
    showlegend: false,
    x: v,
    y: v.map((s) => maxwell(s, MASS, g.kelvin)),
    line: { color: g.color, width: 2 },
    hovertemplate: `${g.kelvin} K, Maxwell–Boltzmann curve<br>%{x:.0f} m/s<extra></extra>`,
  }));

  const chart: Chart = createChart(chartEl, {
    data: [...histograms, ...curves],
    layout: {
      title: {
        text: narrow ? '' : 'Speeds of nitrogen molecules: 4,000 simulated at each temperature',
      },
      barmode: 'overlay',
      bargap: 0,
      hovermode: 'closest',
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: { title: { text: 'Speed (m/s)' }, range: [0, V_MAX], dtick: 200 },
      yaxis: {
        title: { text: 'Share of molecules per m/s' },
        tickformat: '.2%',
        rangemode: 'tozero',
      },
      annotations: [
        ...GASES.map((g) => {
          const mean = meanSpeed(MASS, g.kelvin);
          // Label each hump just above its peak (the most likely speed, sqrt(2) σ).
          const peak = (mean * Math.sqrt(Math.PI)) / 2;
          return {
            x: peak,
            y: maxwell(peak, MASS, g.kelvin),
            text: narrow
              ? `<b>${g.kelvin} K</b>`
              : `<b>${g.kelvin} K</b><br>mean ${Math.round(mean)} m/s`,
            showarrow: false,
            xanchor: 'left' as const,
            yanchor: 'bottom' as const,
            xshift: 10,
            yshift: 2,
            align: 'left' as const,
            font: { size: 10, color: LOOK.title },
          };
        }),
        {
          xref: 'paper' as const,
          yref: 'paper' as const,
          x: 0.99,
          y: 0.72,
          xanchor: 'right' as const,
          yanchor: 'top' as const,
          align: 'right' as const,
          showarrow: false,
          font: { size: 10, color: LOOK.text },
          text: 'Bars: simulated molecules. Lines: the Maxwell–Boltzmann curve.<br>Hotter gas is faster and more spread out.',
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
