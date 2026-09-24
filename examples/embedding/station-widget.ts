import { createChart, modebarIcons, type Chart } from '@mk7s/holochart';
import { rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A weather-station meteogram as an embeddable widget: the figure carries the chart, `config`
 * carries what the host page decides.
 *
 * - Periods: monthly climatology is given at month starts and drawn mid-month with `xperiod:
 *   'M1'`. Weekly rain totals are bars at implicit positions (`x0` + `dx` of one week); the
 *   year-to-date line is known at the end of each Monday-based week (`xperiod` of 7 days,
 *   `xperiod0` on a Monday, `xperiodalignment: 'end'`).
 * - The typical temperature range is a `tonexty` band with a vertical `fillgradient` from cold
 *   (`start`, −5 °C) to warm (`stop`, 25 °C); `hoveron: 'points+fills'` names it anywhere inside.
 * - Wind: `arrow` markers rotated by `marker.angle` to where the wind blows, sized by speed.
 * - Hover labels are styled per trace (`hoverlabel.bgcolor` / `bordercolor` / `font` / `align` /
 *   `namelength`).
 * - Modebar: always shown (`displayModeBar: true`), vertical (`layout.modebar.orientation`) and
 *   themed (`bgcolor`, `color`, `activecolor`). The figure drops the selection tools and adds the
 *   hover-mode toggles (`modebar.remove` / `add`); the host page drops zoom in/out
 *   (`modeBarButtonsToRemove`) and adds a "Summer" button (`modeBarButtonsToAdd`).
 * - Other embedding config: double-click resets the axes, a slower `doubleClickDelay`, the
 *   snapshot's format, file name and size (`toImageButtonOptions`), an accessible name
 *   (`ariaLabel`), a low-power GPU hint (`powerPreference`) and a fixed `pixelRatio` so the
 *   widget stays sharp when the page is zoomed.
 */
export const meta: ExampleMeta = {
  title: 'Embedding: weather-station widget',
  description:
    'A meteogram widget: period-aligned monthly and weekly series, a gradient range band, wind arrows, and a vertical, themed modebar with config-level buttons.',
  tags: ['embedding', 'modebar', 'config', 'scatter', 'bar', 'date', 'period'],
  testTolerance: 0.006,
  size: { width: 760, height: 480 },
};

const MONTHS = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}-01`);
const T_MIN = [-2, -2, 1, 4, 8, 11, 13, 13, 10, 6, 2, -1];
const T_MAX = [5, 6, 10, 14, 18, 21, 24, 23, 19, 14, 9, 6];
/** Prevailing wind: direction it comes from (degrees) and mean speed (m/s). */
const WIND_FROM = [240, 230, 250, 270, 290, 300, 310, 300, 260, 240, 230, 235];
const WIND_SPEED = [7.8, 7.2, 6.5, 5.4, 4.6, 4.1, 3.8, 3.9, 4.8, 6.1, 7.0, 7.6];
const MONTH_NAMES = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const FIRST_MONDAY = Date.UTC(2025, 0, 6);

export function run(el: HTMLElement): ExampleHandle {
  const random = rng(606);
  // Weekly rain: wetter in winter, with the odd storm week.
  const rain = Array.from({ length: 51 }, (_, i) => {
    const season = 14 + 10 * Math.cos((2 * Math.PI * (i + 2)) / 52);
    const storm = random() > 0.9 ? 25 + random() * 20 : 0;
    return Math.round((season * (0.4 + random()) + storm) * 10) / 10;
  });
  let total = 0;
  const ytd = rain.map((r) => (total += r));
  const weekStarts = rain.map((_, i) => new Date(FIRST_MONDAY + i * WEEK).toISOString());
  const tMean = T_MIN.map((lo, i) => (lo + T_MAX[i]!) / 2);

  const chart = createChart(el, {
    data: [
      {
        name: 'Daily low',
        mode: 'lines',
        x: MONTHS,
        y: T_MIN,
        xperiod: 'M1',
        line: { width: 0 },
        showlegend: false,
        hoverinfo: 'skip',
      },
      {
        name: 'Typical range',
        mode: 'lines',
        x: MONTHS,
        y: T_MAX,
        xperiod: 'M1',
        line: { width: 0 },
        fill: 'tonexty',
        fillgradient: {
          type: 'vertical',
          start: -5,
          stop: 25,
          colorscale: [
            [0, 'rgba(58, 95, 205, 0.55)'],
            [0.5, 'rgba(128, 131, 143, 0.35)'],
            [1, 'rgba(204, 84, 10, 0.6)'],
          ],
        },
        hoveron: 'points+fills',
        hovertext: MONTH_NAMES.map((m, i) => `${m}: ${T_MIN[i]} to ${T_MAX[i]} °C`),
        hoverinfo: 'text',
      },
      {
        name: 'Monthly mean',
        mode: 'lines+markers',
        x: MONTHS,
        y: tMean,
        xperiod: 'M1',
        line: { color: '#e6e8f0', width: 2 },
        marker: { size: 5 },
        hovertemplate: '%{y:.1f} °C',
        hoverlabel: {
          bgcolor: '#1b1e2b',
          bordercolor: '#e6e8f0',
          font: { color: '#e6e8f0', size: 12 },
          namelength: -1,
        },
      },
      {
        name: 'Wind',
        mode: 'markers',
        yaxis: 'y4',
        x: MONTHS,
        y: MONTHS.map(() => 0),
        xperiod: 'M1',
        marker: {
          symbol: 'arrow',
          angle: WIND_FROM.map((d) => (d + 180) % 360),
          size: WIND_SPEED.map((s) => 6 + s * 1.6),
          color: '#8fa2e8',
        },
        hovertext: MONTH_NAMES.map((m, i) => `${m}: from ${WIND_FROM[i]}°, ${WIND_SPEED[i]} m/s`),
        hoverinfo: 'text',
        showlegend: false,
      },
      {
        type: 'bar',
        name: 'Weekly rain',
        yaxis: 'y2',
        x0: new Date(FIRST_MONDAY + 3.5 * DAY).toISOString(),
        dx: WEEK,
        y: rain,
        marker: { color: '#5e74d5' },
        hovertemplate: '%{y:.1f} mm',
        hoverlabel: {
          bgcolor: '#5e74d5',
          bordercolor: '#c9cde0',
          font: { family: 'monospace', size: 12, color: '#ffffff' },
          align: 'right',
        },
      },
      {
        name: 'Year to date',
        mode: 'lines',
        yaxis: 'y3',
        x: weekStarts,
        y: ytd,
        xperiod: WEEK,
        xperiod0: new Date(FIRST_MONDAY).toISOString(),
        xperiodalignment: 'end',
        line: { color: '#cc540a', width: 2, shape: 'hv' },
        hovertemplate: '%{y:.0f} mm since Jan 1',
      },
    ],
    layout: {
      title: { text: 'Harbor Point station, 2025' },
      margin: { r: 90 },
      xaxis: { anchor: 'y2', range: ['2025-01-01', '2026-01-01'] },
      yaxis4: {
        anchor: 'x',
        domain: [0.88, 1],
        range: [-1, 1],
        showticklabels: false,
        showgrid: false,
        zeroline: false,
        title: { text: 'Wind' },
      },
      yaxis: { anchor: 'x', domain: [0.42, 0.82], title: { text: '°C' } },
      yaxis2: { anchor: 'x', domain: [0, 0.32], title: { text: 'mm/week' } },
      yaxis3: {
        anchor: 'x',
        overlaying: 'y2',
        side: 'right',
        showgrid: false,
        title: { text: 'YTD mm' },
      },
      legend: { orientation: 'h', x: 0, y: -0.1 },
      modebar: {
        orientation: 'v',
        bgcolor: 'rgba(27, 30, 43, 0.85)',
        color: '#80838f',
        activecolor: '#8fa2e8',
        remove: ['select2d', 'lasso2d'],
        add: ['hoverClosestCartesian', 'hoverCompareCartesian'],
      },
    },
    config: {
      displayModeBar: true,
      modeBarButtonsToRemove: ['zoomIn2d', 'zoomOut2d'],
      modeBarButtonsToAdd: [
        {
          name: 'summer',
          title: 'Show June to August',
          icon: modebarIcons.expand,
          click: (c: Chart) => {
            c.relayout({ 'xaxis.range': ['2025-06-01', '2025-09-01'] }).catch(() => undefined);
          },
        },
      ],
      doubleClick: 'reset',
      doubleClickDelay: 400,
      toImageButtonOptions: {
        format: 'webp',
        filename: 'harbor-point-2025',
        width: 1200,
        height: 760,
      },
      ariaLabel: 'Harbor Point weather station, 2025: temperature, wind and rainfall',
      powerPreference: 'low-power',
      pixelRatio: 2,
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
