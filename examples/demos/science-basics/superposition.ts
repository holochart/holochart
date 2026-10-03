import { createChart, type Chart, type Figure, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { linspace } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * Adding two waves (superposition): where two waves meet, their heights add. Two thin `scatter`
 * lines for the waves and a thick one for their sum. The "Waves" toggle redraws the figure with
 * `chart.react(…)`: in step (same wavelength, crests together: the sum is twice as tall), out of
 * step (half a wavelength apart: crest meets trough and they cancel) and beats (wavelengths of
 * 1 m and 1.1 m: the sum swells and fades every 11 m).
 */
export const meta: ExampleMeta = {
  title: 'Waves: adding two waves',
  description:
    'Two waves and their sum as lines, with a toggle for waves in step, out of step and with slightly different wavelengths (beats).',
  tags: ['demo', 'scatter', 'lines', 'react', 'physics'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

type Mode = 'in' | 'out' | 'beats';

interface Setup {
  /** Wavelength of the second wave, m (the first is 1 m). */
  wavelength: number;
  /** Shift of the second wave, m. */
  shift: number;
  /** Length drawn, m. */
  length: number;
  title: string;
  note: string;
}

const SETUP: Record<Mode, Setup> = {
  in: {
    wavelength: 1,
    shift: 0,
    length: 4,
    title: 'Two waves in step add up to a wave twice as tall',
    note: 'Crest meets crest: the sum is twice as tall',
  },
  out: {
    wavelength: 1,
    shift: 0.5,
    length: 4,
    title: 'Two waves half a wavelength out of step cancel',
    note: 'Crest meets trough: the sum is flat',
  },
  beats: {
    wavelength: 1.1,
    shift: 0,
    length: 22,
    title: 'Wavelengths of 1 m and 1.1 m: the sum swells and fades (beats)',
    note: 'In step here, out of step 5.5 m on, in step again after 11 m',
  },
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);

  const figure = (mode: Mode): Figure => {
    const s = SETUP[mode];
    const x = linspace(0, s.length, 881);
    const a = x.map((v) => Math.sin(2 * Math.PI * v));
    const b = x.map((v) => Math.sin((2 * Math.PI * (v - s.shift)) / s.wavelength));
    const sum = a.map((v, i) => v + (b[i] as number));
    const wave = (
      name: string,
      y: number[],
      color: string,
      dash: 'solid' | 'dash',
    ): ScatterTrace => ({
      type: 'scatter',
      mode: 'lines',
      name,
      x,
      y,
      line: { color, width: 1.5, dash },
      hovertemplate: `${name}: %{y:.2f} at %{x:.2f} m<extra></extra>`,
    });
    return {
      data: [
        wave('Wave 1 (1 m)', a, '#7f93ff', 'solid'),
        wave(
          s.shift > 0 ? 'Wave 2 (1 m, shifted 0.5 m)' : `Wave 2 (${s.wavelength} m)`,
          b,
          '#e8833a',
          'dash',
        ),
        {
          type: 'scatter',
          mode: 'lines',
          name: 'Sum',
          x,
          y: sum,
          line: { color: LOOK.title, width: 3 },
          hovertemplate: 'Sum: %{y:.2f} at %{x:.2f} m<extra></extra>',
        },
      ],
      layout: {
        title: { text: narrow ? '' : s.title },
        hovermode: 'x unified',
        legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
        xaxis: { title: { text: 'Distance (m)' }, range: [0, s.length] },
        yaxis: {
          title: { text: 'Height of the wave' },
          range: [-2.5, 2.5],
          dtick: 1,
          zeroline: true,
          zerolinecolor: LOOK.zero,
        },
        annotations: [
          {
            xref: 'paper',
            yref: 'paper',
            x: 0.01,
            y: 0.98,
            xanchor: 'left',
            yanchor: 'top',
            showarrow: false,
            text: s.note,
            font: { size: 11, color: LOOK.text },
          },
        ],
      },
      config: chartConfig(narrow),
    };
  };

  const chart: Chart = createChart(chartEl, figure('in'));

  segmented<Mode>(
    toolbar,
    'Waves',
    [
      { value: 'in', text: 'In step' },
      { value: 'out', text: 'Out of step' },
      { value: 'beats', text: 'Beats' },
    ],
    (value) => void chart.react(figure(value)),
    'in',
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
