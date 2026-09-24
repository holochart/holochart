import { componentsReady, createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A Hertzsprung–Russell diagram of a synthetic stellar population: surface temperature against
 * luminosity, both on log axes. By astronomical convention temperature runs backwards, hot stars
 * on the left: `autorange: 'reversed'`, with the autorange pinned to 40,000–2,500 K by
 * `autorangeoptions.minallowed` / `maxallowed`. Its labels are written out in full
 * (`exponentformat: 'none'`, so `10,000 K` rather than `10k K`) with `separatethousands`.
 *
 * A second x axis on top (`overlaying: 'x'`, same range) names the spectral classes O B A F G K M:
 * bold letters (`tickfont.weight`) at the class centers and minor ticks at the class boundaries.
 * The temperature axis places minor grid lines at the same boundaries (`minor.tickmode: 'array'`),
 * dotted, splitting the diagram into classes. The luminosity axis labels every other decade as a power of ten and marks
 * the decades between with minor ticks (`minor.dtick: 1`).
 */
export const meta: ExampleMeta = {
  title: 'Axes: Hertzsprung–Russell diagram',
  description:
    'A reversed log temperature axis, an overlaying spectral-class axis with array minor ticks, and a power-of-ten luminosity axis.',
  tags: ['axes', 'log', 'secondary-axis', 'science', 'scatter', 'minor-ticks'],
  size: { width: 720, height: 520 },
  testTolerance: 0.004,
};

/** Spectral class boundaries, K (hot → cool), and the class letters between them. */
const BOUNDS = [40000, 30000, 10000, 7500, 6000, 5200, 3700, 2500];
const CLASSES = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];

/** Approximate star color from surface temperature (blue-white → orange-red). */
const COLOR_STOPS: [number, [number, number, number]][] = [
  [3000, [255, 170, 110]],
  [4500, [255, 205, 150]],
  [6000, [255, 240, 225]],
  [10000, [205, 218, 255]],
  [30000, [150, 175, 255]],
];

function starColor(t: number): string {
  let i = 0;
  while (i < COLOR_STOPS.length - 2 && t > (COLOR_STOPS[i + 1] as [number, unknown])[0]) i++;
  const [t0, c0] = COLOR_STOPS[i] as [number, [number, number, number]];
  const [t1, c1] = COLOR_STOPS[i + 1] as [number, [number, number, number]];
  const f = Math.min(1, Math.max(0, (Math.log(t) - Math.log(t0)) / (Math.log(t1) - Math.log(t0))));
  const c = c0.map((v, k) => Math.round(v + ((c1[k] ?? v) - v) * f));
  return `rgb(${c.join(',')})`;
}

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(1912);
  const normal = gaussian(random);
  const temp: number[] = [];
  const lum: number[] = [];
  const add = (t: number, logL: number) => {
    temp.push(t);
    lum.push(10 ** logL);
  };
  // Main sequence: many cool dwarfs, few hot giants. L ≈ (T / T☉)^7.5.
  for (let i = 0; i < 520; i++) {
    const logT = Math.log10(2800) + random() ** 2.2 * (Math.log10(33000) - Math.log10(2800));
    add(10 ** logT, 7.5 * (logT - Math.log10(5772)) + normal() * 0.18);
  }
  // Red giant branch and clump.
  for (let i = 0; i < 90; i++) {
    const t = 3600 + random() * 1500;
    add(t, 1.4 + (5100 - t) / 700 + normal() * 0.25);
  }
  // Supergiants across the top.
  for (let i = 0; i < 24; i++) add(3500 * 10 ** (random() * 0.95), 4.3 + random() * 1.2);
  // White dwarfs.
  for (let i = 0; i < 45; i++) {
    const logT = Math.log10(5500) + random() * (Math.log10(28000) - Math.log10(5500));
    add(10 ** logT, -3.6 + 3.2 * (logT - 4) + normal() * 0.15);
  }

  const centers = CLASSES.map((_, i) => Math.sqrt((BOUNDS[i] ?? 1) * (BOUNDS[i + 1] ?? 1)));

  const chart = createChart(el, {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Stars',
        x: temp,
        y: lum,
        marker: { size: 4, color: temp.map(starColor), opacity: 0.85 },
        hovertemplate: '%{x} · %{y:.3g} L☉<extra></extra>',
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Sun',
        x: [5772],
        y: [1],
        marker: { size: 9, color: '#ffe066', line: { color: '#0a0a0f', width: 1 } },
      },
    ],
    layout: {
      title: { text: 'Hertzsprung–Russell diagram of a synthetic cluster' },
      showlegend: false,
      annotations: [
        // Log axes take annotation positions as log10 of the data values.
        { x: Math.log10(5772), y: 0, text: 'Sun', ax: -40, ay: 34 },
        { x: Math.log10(4200), y: 3.6, text: 'Giants', showarrow: false },
        { x: Math.log10(20000), y: -3.7, text: 'White dwarfs', showarrow: false },
        { x: Math.log10(15000), y: 1.2, text: 'Main sequence', showarrow: false },
      ],
      xaxis: {
        type: 'log',
        title: { text: 'Surface temperature' },
        autorange: 'reversed',
        autorangeoptions: { minallowed: 2500, maxallowed: 40000 },
        tickvals: [3000, 4000, 5000, 6000, 8000, 10000, 15000, 20000, 30000],
        exponentformat: 'none',
        separatethousands: true,
        ticksuffix: ' K',
        // Spectral class boundaries: grid lines only, the ticks are on the class axis above.
        minor: {
          tickmode: 'array',
          tickvals: BOUNDS.slice(1, -1),
          showgrid: true,
          griddash: 'dot',
          gridcolor: '#3e3e4c',
        },
      },
      xaxis2: {
        type: 'log',
        overlaying: 'x',
        side: 'top',
        range: [Math.log10(40000), Math.log10(2500)],
        tickvals: centers,
        ticktext: CLASSES,
        ticks: '',
        tickfont: { size: 11, weight: 700 },
        showgrid: false,
        minor: { tickvals: BOUNDS.slice(1, -1), ticks: 'outside', ticklen: 8 },
        title: { text: 'Spectral class' },
      },
      yaxis: {
        type: 'log',
        title: { text: 'Luminosity (L☉)' },
        exponentformat: 'power',
        dtick: 2,
        minor: { dtick: 1, ticks: 'outside', showgrid: true },
      },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
