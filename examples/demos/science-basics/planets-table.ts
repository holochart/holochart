import { createChart, type Chart, type TableTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { PLANETS, type Planet } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { tint } from './waves-fields-planets.mts';

/**
 * The eight planets as a `table` trace: type, diameter, mass (Earth = 1, from the mass in kg
 * divided by Earth's), surface gravity, mean distance from the Sun in astronomical units (1 AU is
 * the Earth's distance), the length of the year and the mean temperature (NASA Planetary Fact
 * Sheet). Numbers are formatted and right-aligned (`cells.align` per column); each row's fill is a
 * tint of its kind of planet (`cells.fill.color` per cell), and the planet's name takes the color
 * the other planet charts use. Narrow containers (phones) keep four columns.
 */
export const meta: ExampleMeta = {
  title: 'Planets: the eight planets in numbers',
  description:
    'A table of the eight planets: type, diameter, mass, surface gravity, distance from the Sun, year length and mean temperature, rows tinted by kind.',
  tags: ['demo', 'table', 'style', 'astronomy'],
  size: { width: 960, height: 420 },
  testTolerance: 0.004,
};

const KIND_COLOR: Record<Planet['kind'], string> = {
  Rocky: '#cc540a',
  'Gas giant': '#c2a019',
  'Ice giant': '#128b8b',
};

const int = (v: number): string => Math.round(v).toLocaleString('en-US');
const minus = (s: string): string => s.replace('-', '−');

/** The length of a planet's year: Earth days up to two years, Earth years beyond. */
function year(days: number): string {
  return days < 730 ? `${int(days)} days` : `${(days / 365.25).toFixed(1)} years`;
}

/** Mass relative to the Earth's (5.97 × 10²⁴ kg). */
function earthMasses(p: Planet): string {
  const m = p.mass / 5.97;
  return m >= 10 ? m.toFixed(0) : m.toFixed(m >= 1 ? 1 : 2);
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const columns: { header: string; values: string[]; width: number; narrow: boolean }[] = [
    { header: 'Planet', values: PLANETS.map((p) => `<b>${p.name}</b>`), width: 1.1, narrow: true },
    { header: 'Type', values: PLANETS.map((p) => p.kind), width: 1.1, narrow: false },
    {
      header: narrow ? 'Diameter<br>(km)' : 'Diameter (km)',
      values: PLANETS.map((p) => int(p.diameter)),
      width: 1.1,
      narrow: true,
    },
    { header: 'Mass (Earth = 1)', values: PLANETS.map(earthMasses), width: 1.2, narrow: false },
    {
      header: 'Gravity (m/s²)',
      values: PLANETS.map((p) => p.gravity.toFixed(1)),
      width: 1.1,
      narrow: false,
    },
    {
      header: narrow ? 'From the<br>Sun (AU)' : 'Distance from the Sun (AU)',
      values: PLANETS.map((p) => p.distance.toFixed(2)),
      width: narrow ? 1.1 : 2,
      narrow: true,
    },
    {
      header: narrow ? 'Year' : 'Length of year',
      values: PLANETS.map((p) => year(p.period)),
      width: 1.2,
      narrow: true,
    },
    {
      header: 'Mean temperature (°C)',
      values: PLANETS.map((p) => minus(String(p.temperature))),
      width: 1.5,
      narrow: false,
    },
  ].filter((c) => !narrow || c.narrow);

  const rowFill = PLANETS.map((p) => tint(KIND_COLOR[p.kind], 0.2));
  const table: TableTrace = {
    type: 'table',
    columnwidth: columns.map((c) => c.width),
    header: {
      values: columns.map((c) => `<b>${c.header}</b>`),
      align: ['left', narrow ? 'right' : 'left', 'right'],
      height: narrow ? 40 : 30,
      fill: { color: '#15151d' },
      line: { color: LOOK.axis, width: 1 },
      font: { size: 11, color: LOOK.title },
    },
    cells: {
      values: columns.map((c) => c.values),
      align: ['left', narrow ? 'right' : 'left', 'right'],
      height: 30,
      fill: { color: columns.map(() => rowFill) },
      line: { color: LOOK.bg, width: 1 },
      font: {
        size: 12,
        color: columns.map((_, i) => (i === 0 ? PLANETS.map((p) => p.color) : LOOK.title)),
      },
    },
  };

  const chart: Chart = createChart(chartEl, {
    data: [table],
    layout: {
      title: { text: narrow ? '' : 'The eight planets, from the Sun outwards' },
      margin: { t: narrow ? 12 : 52, b: 40, l: 16, r: 16 },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0,
          y: 0,
          xanchor: 'left',
          yanchor: 'top',
          yshift: -6,
          showarrow: false,
          align: 'left',
          text: narrow
            ? '1 AU is the distance from the Earth to the Sun.'
            : '1 AU (astronomical unit) is the distance from the Earth to the Sun, about 150 million km. Gravity and temperature of the giants are taken where the pressure equals the Earth’s at sea level. Source: NASA.',
          font: { size: 9, color: LOOK.tick },
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
