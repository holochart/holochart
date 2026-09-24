import { componentsReady, createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Climate small multiples in a coupled `layout.grid`: `xaxes` gives each city column its own
 * month axis and `yaxes` gives each row one shared scale (temperature, precipitation), so values
 * compare across a row at a glance. `xside: 'top plot'` puts the month axes above the top row,
 * where their bold small-caps titles read as column headers (the y axis titles, styled the same
 * but in the series colors, are the row headers), and `grid.domain.y` leaves a strip
 * at the bottom for the source note.
 *
 * The temperature scale includes 0 °C (`autorangeoptions.include`), with a highlighted zero line,
 * so the warm cities are not exaggerated. Mumbai's monsoon would flatten every other bar, so the
 * precipitation autorange is capped with `autorangeoptions.clipmax` and the clipped July bar is
 * labeled. `minallowed` / `maxallowed` stop panning and zooming beyond January–December and beyond
 * a plausible temperature range. Month labels are upper-cased with `tickfont.textcase` and stay
 * horizontal or turn fully vertical, never to 30°, with `autotickangles`.
 */
export const meta: ExampleMeta = {
  title: 'Layout: climate small multiples',
  description:
    'A coupled 2×3 grid (xaxes/yaxes) with top month axes, shared row scales, autorange include/clip and zoom limits.',
  tags: ['layout', 'grid', 'subplots', 'axes', 'climate', 'bar', 'line'],
  size: { width: 820, height: 480 },
  testTolerance: 0.004,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Approximate monthly climate normals: mean temperature (°C) and precipitation (mm). */
const CITIES = [
  {
    name: 'Madrid',
    temp: [6.3, 7.9, 11.2, 12.9, 16.9, 22.2, 25.6, 25.1, 20.9, 15.1, 9.9, 6.9],
    rain: [33, 35, 25, 45, 43, 22, 11, 10, 28, 56, 56, 43],
  },
  {
    name: 'Mumbai',
    temp: [24.4, 25.1, 27.1, 28.9, 30.3, 29.3, 27.9, 27.6, 27.9, 28.9, 28.1, 26.2],
    rain: [1, 0, 0, 1, 11, 580, 840, 520, 340, 90, 15, 5],
  },
  {
    name: 'Sydney',
    temp: [23.5, 23.4, 22.1, 19.5, 16.6, 14.2, 13.4, 14.5, 17.0, 19.0, 20.4, 22.1],
    rain: [91, 131, 117, 114, 101, 142, 80, 80, 68, 77, 84, 77],
  },
];

const TEMP = '#e8a33d';
const RAIN = '#3fd0e0';

export function run(el: HTMLElement): ExampleHandle {
  const [madrid, mumbai, sydney] = CITIES as [
    (typeof CITIES)[number],
    (typeof CITIES)[number],
    (typeof CITIES)[number],
  ];
  const chart = createChart(el, {
    data: [
      { name: 'Madrid °C', x: MONTHS, y: madrid.temp, line: { color: TEMP } },
      { name: 'Mumbai °C', x: MONTHS, y: mumbai.temp, xaxis: 'x2', line: { color: TEMP } },
      { name: 'Sydney °C', x: MONTHS, y: sydney.temp, xaxis: 'x3', line: { color: TEMP } },
      { type: 'bar', name: 'Madrid mm', x: MONTHS, y: madrid.rain, yaxis: 'y2' },
      { type: 'bar', name: 'Mumbai mm', x: MONTHS, y: mumbai.rain, xaxis: 'x2', yaxis: 'y2' },
      { type: 'bar', name: 'Sydney mm', x: MONTHS, y: sydney.rain, xaxis: 'x3', yaxis: 'y2' },
    ].map((t) =>
      t.type === 'bar'
        ? { ...t, marker: { color: RAIN } }
        : { ...t, type: 'scatter' as const, mode: 'lines+markers' as const, marker: { size: 5 } },
    ),
    layout: {
      showlegend: false,
      title: {
        text: 'Monthly climate normals',
        subtitle: {
          text: 'Mean temperature (line) and precipitation (bars), one shared scale per row',
          font: { style: 'italic' },
        },
      },
      margin: { b: 8 },
      grid: {
        rows: 2,
        columns: 3,
        xaxes: ['x', 'x2', 'x3'],
        yaxes: ['y', 'y2'],
        xside: 'top plot',
        xgap: 0.08,
        ygap: 0.12,
        domain: { y: [0.08, 1] },
      },
      annotations: [
        {
          xref: 'x2',
          yref: 'y2',
          x: 'Jul',
          y: 300,
          yanchor: 'bottom',
          text: 'Jul peak 840 mm ↑',
          showarrow: false,
          font: { size: 8 },
        },
        {
          xref: 'paper',
          yref: 'paper',
          x: 0,
          y: 0,
          xanchor: 'left',
          yanchor: 'bottom',
          text: 'Approximate 1991–2020 normals. Precipitation axis capped at 300 mm.',
          showarrow: false,
          font: { size: 8, color: '#8b8e9c' },
        },
      ],
      xaxis: {
        title: { text: madrid.name, font: { size: 12, weight: 700, variant: 'small-caps' } },
        tickfont: { textcase: 'upper' },
        autotickangles: [0, 90],
        minallowed: -0.5,
        maxallowed: 11.5,
      },
      xaxis2: {
        title: { text: mumbai.name, font: { size: 12, weight: 700, variant: 'small-caps' } },
        tickfont: { textcase: 'upper' },
        autotickangles: [0, 90],
        minallowed: -0.5,
        maxallowed: 11.5,
      },
      xaxis3: {
        title: { text: sydney.name, font: { size: 12, weight: 700, variant: 'small-caps' } },
        tickfont: { textcase: 'upper' },
        autotickangles: [0, 90],
        minallowed: -0.5,
        maxallowed: 11.5,
      },
      yaxis: {
        title: {
          text: 'Mean temperature',
          font: { size: 12, weight: 700, variant: 'small-caps', color: TEMP },
        },
        ticksuffix: '°C',
        autorangeoptions: { include: 0 },
        zerolinecolor: '#6fa8dc',
        zerolinewidth: 1.5,
        minallowed: -30,
        maxallowed: 50,
      },
      yaxis2: {
        title: {
          text: 'Precipitation',
          font: { size: 12, weight: 700, variant: 'small-caps', color: RAIN },
        },
        ticksuffix: ' mm',
        autorangeoptions: { clipmax: 300 },
        minallowed: 0,
      },
    },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
