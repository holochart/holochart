import { createChart, type BarTrace, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The electromagnetic spectrum by wavelength: radio waves, microwaves, infrared, visible light,
 * ultraviolet, X-rays and gamma rays are all the same kind of wave and differ only in wavelength.
 * One horizontal `bar` per band, floating from its shortest to its longest wavelength (`base` plus
 * the bar length) on a logarithmic x axis with power-of-ten ticks, reversed so that the wavelength
 * shrinks (and the energy grows) to the right. Each bar carries an everyday example as text. The
 * band edges are the usual round textbook boundaries; radio waves and gamma rays have no outer
 * limit, so they are drawn to 10 km and to 10⁻¹⁴ m.
 */
export const meta: ExampleMeta = {
  title: 'Light: the electromagnetic spectrum',
  description:
    'Floating horizontal bars on a log axis for the wavelength range of radio waves, microwaves, infrared, visible light, ultraviolet, X-rays and gamma rays.',
  tags: ['demo', 'bar', 'base', 'log', 'horizontal', 'text', 'physics'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

/** Wavelength bands in metres, longest first. */
const BANDS = [
  {
    name: 'Radio waves',
    from: 1,
    to: 1e4,
    range: 'longer than 1 m',
    use: 'FM radio',
    color: '#8a90a6',
  },
  {
    name: 'Microwaves',
    from: 1e-3,
    to: 1,
    range: '1 mm to 1 m',
    use: 'ovens, Wi-Fi',
    color: '#12a38a',
  },
  {
    name: 'Infrared',
    from: 750e-9,
    to: 1e-3,
    range: '750 nm to 1 mm',
    use: 'heat lamps, remote controls',
    color: '#ea2a37',
  },
  {
    name: 'Visible light',
    from: 380e-9,
    to: 750e-9,
    range: '380 to 750 nm',
    use: 'what we see',
    color: '#e3b04b',
  },
  {
    name: 'Ultraviolet',
    from: 10e-9,
    to: 380e-9,
    range: '10 to 380 nm',
    use: 'sunburn',
    color: '#9962c0',
  },
  {
    name: 'X-rays',
    from: 0.01e-9,
    to: 10e-9,
    range: '0.01 to 10 nm',
    use: 'medical scans',
    color: '#5e74d5',
  },
  {
    name: 'Gamma rays',
    from: 1e-14,
    to: 0.01e-9,
    range: 'shorter than 0.01 nm',
    use: 'radioactive decay',
    color: '#c0559d',
  },
] as const;

const pow10 = (e: number): string =>
  e === 0 ? '1 m' : `10<sup>${String(e).replace('-', '−')}</sup>`;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const bars: BarTrace = {
    type: 'bar',
    orientation: 'h',
    y: BANDS.map((b) => b.name),
    base: BANDS.map((b) => b.from),
    // A bar runs from `base` to `base + x`.
    x: BANDS.map((b) => b.to - b.from),
    width: 0.62,
    marker: { color: BANDS.map((b) => b.color) },
    customdata: BANDS.map((b) => [b.range, b.use]),
    hovertemplate: '<b>%{y}</b><br>wavelength %{customdata[0]}<br>%{customdata[1]}<extra></extra>',
  };
  const exponents = narrow ? [4, 0, -4, -8, -12] : [4, 2, 0, -2, -4, -6, -8, -10, -12, -14];

  const chart: Chart = createChart(chartEl, {
    data: [bars],
    layout: {
      title: {
        text: narrow ? '' : 'The electromagnetic spectrum: one kind of wave, many wavelengths',
      },
      showlegend: false,
      margin: { l: narrow ? 84 : 104, r: 24, b: 56 },
      xaxis: {
        type: 'log',
        title: { text: 'Wavelength (m), shorter to the right' },
        // Log axis ranges are powers of ten; reversed.
        range: [4.6, -14.6],
        tickvals: exponents.map((e) => 10 ** e),
        ticktext: exponents.map(pow10),
      },
      yaxis: { type: 'category', autorange: 'reversed', showgrid: false },
      annotations: [
        // The everyday example beside each bar, on the side with more room.
        ...BANDS.map((b, i) => ({
          x: Math.log10(i < 4 ? b.from : b.to),
          y: b.name,
          xanchor: i < 4 ? ('left' as const) : ('right' as const),
          xshift: i < 4 ? 8 : -8,
          showarrow: false,
          text: narrow ? b.use : `${b.use} · ${b.range}`,
          font: { size: 10, color: LOOK.text },
        })),
        {
          xref: 'paper',
          yref: 'paper',
          x: 1,
          y: 0.99,
          xanchor: 'right',
          yanchor: 'top',
          showarrow: false,
          align: 'right',
          text: narrow
            ? ''
            : 'Visible light is a tiny slice: every wavelength<br>we can see fits between 380 and 750 nm',
          font: { size: 11, color: '#e3b04b' },
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
