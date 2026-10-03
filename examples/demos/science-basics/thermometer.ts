import { createChart, type Chart, type Figure, type IndicatorTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * One temperature on three scales: three `indicator` traces side by side (`domain`), each a
 * number with an angular gauge, in kelvin, degrees Celsius (K − 273.15) and degrees Fahrenheit
 * (°C × 9/5 + 32). The three gauges cover the same span, absolute zero to 400 K, so their bars
 * always reach equally far; only the numbers on the dial differ. Gauge `steps` shade where water
 * is ice (below 273.15 K), liquid and steam (above 373.15 K, at normal air pressure).
 *
 * The toolbar toggle picks a landmark temperature and calls `chart.react(…)`; with
 * `layout.transition` set, the numbers count and the bars sweep to the new value.
 */
export const meta: ExampleMeta = {
  title: 'Temperature: kelvin, Celsius and Fahrenheit',
  description:
    'Three gauges showing one temperature in kelvin, degrees Celsius and degrees Fahrenheit, with a toggle for landmark temperatures.',
  tags: ['demo', 'indicator', 'gauge', 'number', 'transitions', 'react'],
  size: { width: 960, height: 420 },
  testTolerance: 0.004,
};

type Landmark = 'zero' | 'freeze' | 'room' | 'body' | 'boil';

const LANDMARKS: Record<Landmark, { kelvin: number; short: string; text: string }> = {
  zero: { kelvin: 0, short: 'Absolute zero', text: 'Absolute zero, the coldest possible' },
  freeze: { kelvin: 273.15, short: 'Water freezes', text: 'Water freezes' },
  room: { kelvin: 293.15, short: 'Room', text: 'Room temperature' },
  body: { kelvin: 310.15, short: 'Body', text: 'Body temperature' },
  boil: { kelvin: 373.15, short: 'Water boils', text: 'Water boils' },
};
const ORDER: Landmark[] = ['zero', 'freeze', 'room', 'body', 'boil'];

const MAX_K = 400;
const FREEZE_K = 273.15;
const BOIL_K = 373.15;

interface Scale {
  name: string;
  unit: string;
  fromKelvin: (k: number) => number;
  ticks: number[];
  color: string;
  x: [number, number];
}

const SCALES: Scale[] = [
  {
    name: 'Kelvin',
    unit: ' K',
    fromKelvin: (k) => k,
    ticks: [0, 100, 200, 300, 400],
    color: LOOK.colorway[2],
    x: [0.02, 0.3],
  },
  {
    name: 'Celsius',
    unit: ' °C',
    fromKelvin: (k) => k - 273.15,
    ticks: [-273.15, -200, -100, 0, 100],
    color: LOOK.colorway[5],
    x: [0.36, 0.64],
  },
  {
    name: 'Fahrenheit',
    unit: ' °F',
    fromKelvin: (k) => ((k - 273.15) * 9) / 5 + 32,
    ticks: [-459.67, -300, -150, 0, 150],
    color: LOOK.colorway[4],
    x: [0.7, 0.98],
  },
];

/** A number without a trailing ".00", with a real minus sign. */
function plain(v: number): string {
  const s = Number(v.toFixed(2)).toString();
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  const figure = (landmark: Landmark): Figure => {
    const { kelvin, text } = LANDMARKS[landmark];
    const gauges = SCALES.map((s): IndicatorTrace => ({
      type: 'indicator',
      mode: 'gauge+number',
      name: s.name,
      value: s.fromKelvin(kelvin),
      number: { suffix: s.unit, valueformat: '.2f', font: { size: narrow ? 18 : 30 } },
      title: { text: s.name, font: { size: narrow ? 11 : 14 } },
      domain: { x: s.x, y: [0.12, 0.9] },
      gauge: {
        shape: 'angular',
        axis: {
          range: [s.fromKelvin(0), s.fromKelvin(MAX_K)],
          tickvals: s.ticks,
          ticktext: s.ticks.map((t) => plain(Math.round(t))),
          tickfont: { size: 10 },
        },
        bar: { color: s.color, thickness: 0.45 },
        bgcolor: 'rgba(255, 255, 255, 0.04)',
        steps: [
          { range: [s.fromKelvin(0), s.fromKelvin(FREEZE_K)], color: 'rgba(94, 116, 213, 0.22)' },
          {
            range: [s.fromKelvin(FREEZE_K), s.fromKelvin(BOIL_K)],
            color: 'rgba(18, 139, 139, 0.3)',
          },
          {
            range: [s.fromKelvin(BOIL_K), s.fromKelvin(MAX_K)],
            color: 'rgba(204, 84, 10, 0.3)',
          },
        ],
      },
    }));
    const values = SCALES.map((s) => `${plain(s.fromKelvin(kelvin))}${s.unit}`).join(' = ');
    return {
      data: gauges,
      layout: {
        title: { text: narrow ? '' : `${text}: ${values}` },
        transition: { duration: 600, easing: 'cubic-in-out' },
        margin: { l: 32, r: 32, t: 56, b: 40 },
        annotations: [
          {
            xref: 'paper',
            yref: 'paper',
            x: 0.5,
            y: 0,
            yanchor: 'top',
            yshift: -8,
            showarrow: false,
            text: 'Shading on each dial: water is ice (blue), liquid (green) or steam (orange) at normal air pressure.',
            font: { size: 11, color: LOOK.text },
          },
        ],
      },
      config: chartConfig(narrow),
    };
  };

  const chart: Chart = createChart(chartEl, figure('room'));

  segmented<Landmark>(
    toolbar,
    'Temperature',
    ORDER.map((value) => ({ value, text: LANDMARKS[value].short })),
    (value) => void chart.react(figure(value)),
    'room',
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
