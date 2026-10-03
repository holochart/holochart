import { createChart, type Chart, type LayoutAnnotation, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { linspace } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Ohm's law: the current through a resistor against the voltage across it, 0 to 12 V, for
 * resistors of 10, 20 and 50 ohms (`I = V / R`: straight `scatter` lines, steeper for a smaller
 * resistance), and a filament lamp whose line bends because the filament's resistance grows as it
 * heats up. The lamp is an illustrative model of a typical 12 V, 3 W bulb,
 * `I = 0.25 A × (V / 12)^0.6`, not a measurement. The lines are labelled at their ends with
 * `annotations` instead of a legend.
 */
export const meta: ExampleMeta = {
  title: 'Electricity: Ohm’s law and a lamp that breaks it',
  description:
    'Current against voltage for 10, 20 and 50 ohm resistors (straight lines) and a filament lamp (a curve), labelled at the line ends.',
  tags: ['demo', 'scatter', 'lines', 'annotations', 'physics'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const RESISTORS = [
  { ohms: 10, color: LOOK.colorway[0] },
  { ohms: 20, color: LOOK.colorway[4] },
  { ohms: 50, color: LOOK.colorway[1] },
] as const;
const LAMP_COLOR = '#e3b04b';
const lamp = (v: number): number => 0.25 * (v / 12) ** 0.6;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const volts = linspace(0, 12, 121);
  const traces: ScatterTrace[] = RESISTORS.map((r) => ({
    type: 'scatter',
    mode: 'lines',
    name: `${r.ohms} Ω resistor`,
    x: volts,
    y: volts.map((v) => v / r.ohms),
    line: { color: r.color, width: 2 },
    hovertemplate: `${r.ohms} Ω: %{y:.2f} A at %{x:.1f} V<extra></extra>`,
  }));
  traces.push({
    type: 'scatter',
    mode: 'lines',
    name: 'Filament lamp',
    x: volts,
    y: volts.map(lamp),
    line: { color: LAMP_COLOR, width: 3 },
    hovertemplate: 'Lamp: %{y:.3f} A at %{x:.1f} V<extra></extra>',
  });

  const endLabels = RESISTORS.map((r): LayoutAnnotation => ({
    x: 12,
    y: 12 / r.ohms,
    xanchor: 'left',
    xshift: 6,
    yshift: r.ohms === 50 ? -7 : 0,
    showarrow: false,
    align: 'left',
    text: narrow ? `${r.ohms} Ω` : `${r.ohms} Ω: ${(12 / r.ohms).toFixed(2)} A at 12 V`,
    font: { size: 11, color: r.color },
  }));
  const lampLabel: LayoutAnnotation = {
    x: 4,
    y: lamp(4),
    ax: narrow ? 30 : 60,
    ay: -64,
    showarrow: true,
    arrowcolor: LAMP_COLOR,
    arrowwidth: 1,
    arrowhead: 0,
    align: 'left',
    text: narrow
      ? 'Filament lamp'
      : 'Filament lamp: the line bends, because<br>a hotter filament resists more',
    font: { size: 11, color: LAMP_COLOR },
  };

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : 'Current against voltage: resistors give straight lines, a lamp does not',
      },
      showlegend: false,
      margin: { r: narrow ? 48 : 150 },
      xaxis: { title: { text: 'Voltage (V)' }, range: [0, 12], dtick: 2 },
      yaxis: {
        title: { text: 'Current (A)' },
        range: [0, 1.25],
        dtick: 0.2,
        hoverformat: '.2f',
      },
      annotations: [...endLabels, lampLabel],
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
