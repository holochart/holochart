/**
 * Figure builders for the zip-code weather demo. Each takes the forecast the page just fetched and
 * returns a figure; nothing here touches the DOM or the network, so the unit tests can run them.
 *
 * The four time-series figures (temperature, sky, precipitation, wind) share one x axis setup:
 * local wall-clock time as naive ISO strings (Holochart reads and shows those as written), the
 * same left and right margins so their plot areas line up under the day strip, night bands between
 * sunset and sunrise, and a line at the time of the current reading.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import type { Figure } from '@mk7s/holochart';
import { LOOK } from '../openrouter/ui.mts';
import { compass, type Forecast } from './data.mts';

type Layout = NonNullable<Figure['layout']>;
type Shape = NonNullable<Layout['shapes']>[number];
type Series = readonly (number | null)[];

export interface View {
  /** Phone-sized container: tighter margins, smaller type, no value labels. */
  narrow: boolean;
  /** Days in view, counting from today. */
  days: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export const COLOR = {
  temperature: '#f0525c',
  feelsLike: '#b78be0',
  dewPoint: '#4fb872',
  rain: '#3aa0c8',
  snow: '#c9d3f2',
  total: '#7f93ea',
  humidity: '#b5b84a',
  cloud: 'rgba(164, 167, 181, 0.32)',
  cloudLine: 'rgba(164, 167, 181, 0.7)',
  pressure: '#eceef4',
  wind: '#6f8cf0',
  gust: 'rgba(111, 140, 240, 0.45)',
  night: 'rgba(138, 144, 166, 0.09)',
  now: '#eceef4',
} as const;

/** Left and right margins of the time-series figures, px; the page pads the day strip to match. */
export function sideMargins(narrow: boolean): { l: number; r: number } {
  return narrow ? { l: 38, r: 44 } : { l: 52, r: 60 };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const utc = (date: string): number => Date.parse(`${date}T00:00:00Z`);

/** `YYYY-MM-DD` plus `n` days. */
export function addDays(date: string, n: number): string {
  return new Date(utc(date) + n * DAY_MS).toISOString().slice(0, 10);
}

/** `Sat 10/3` for `2026-10-03`. */
export function dayLabel(date: string): string {
  const d = new Date(utc(date));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** The x range for `days` days from the first forecast day, midnight to midnight. */
export function timeRange(f: Forecast, days: number): [string, string] {
  const first = (f.days[0] as { date: string }).date;
  const shown = Math.max(1, Math.min(days, f.days.length));
  return [`${first}T00:00`, `${addDays(first, shown)}T00:00`];
}

/** A band from each sunset to the next sunrise, and from the edges of the forecast to the first and last. */
export function nightBands(f: Forecast): Shape[] {
  const first = f.days[0] as { date: string };
  const last = f.days.at(-1) as { date: string };
  const edges: [string | null, string | null][] = [
    [`${first.date}T00:00`, f.days[0]?.sunrise ?? null],
    ...f.days.map((d, i): [string | null, string | null] => [
      d.sunset,
      f.days[i + 1]?.sunrise ?? `${addDays(last.date, 1)}T00:00`,
    ]),
  ];
  return edges
    .filter((e): e is [string, string] => e[0] !== null && e[1] !== null)
    .map(([x0, x1]) => ({
      type: 'rect',
      xref: 'x',
      yref: 'paper',
      x0,
      x1,
      y0: 0,
      y1: 1,
      layer: 'below',
      fillcolor: COLOR.night,
      line: { width: 0 },
    }));
}

function nowLine(f: Forecast): Shape {
  return {
    type: 'line',
    xref: 'x',
    yref: 'paper',
    x0: f.current.time,
    x1: f.current.time,
    y0: 0,
    y1: 1,
    line: { color: COLOR.now, width: 1 },
  };
}

/** What the four time-series figures have in common. */
function timeLayout(f: Forecast, view: View): Layout {
  return {
    margin: { ...sideMargins(view.narrow), t: 34, b: 30 },
    font: { size: view.narrow ? 10 : 12 },
    hovermode: 'x unified',
    legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
    xaxis: {
      type: 'date',
      range: timeRange(f, view.days),
      hoverformat: '%a %b %-d, %-I %p',
      // Room for a tick per day when all ten are in view.
      nticks: view.narrow ? 6 : 12,
      ticklabelmode: 'period',
      tickformatstops: [
        { dtickrange: [null, DAY_MS - 1], value: '%a %-I %p' },
        { dtickrange: [DAY_MS, null], value: '%a %-m/%-d' },
      ],
    },
    shapes: [...nightBands(f), nowLine(f)],
  };
}

const finite = (values: Series): number[] => values.filter((v): v is number => v !== null);
const round = (v: number, step: number, up: boolean): number =>
  (up ? Math.ceil(v / step) : Math.floor(v / step)) * step;

/** Index of the hottest and coldest hour of each day that has hourly temperatures. */
export function dailyExtremes(f: Forecast): { high: number[]; low: number[] } {
  const high: number[] = [];
  const low: number[] = [];
  for (const day of f.days) {
    let hi = -1;
    let lo = -1;
    f.hourly.time.forEach((t, i) => {
      const v = f.hourly.temperature[i];
      if (v === null || v === undefined || !t.startsWith(day.date)) return;
      if (hi < 0 || v > (f.hourly.temperature[hi] as number)) hi = i;
      if (lo < 0 || v < (f.hourly.temperature[lo] as number)) lo = i;
    });
    if (hi >= 0) high.push(hi);
    if (lo >= 0) low.push(lo);
  }
  return { high, low };
}

/**
 * Temperature, feels-like and dew point by the hour. Each day's highest and lowest hour carries
 * its value as a text label (a `markers+text` trace), dropped on phones.
 */
export function temperatureFigure(f: Forecast, view: View): Figure {
  const { time, temperature, feelsLike, dewPoint } = f.hourly;
  const all = finite([...temperature, ...feelsLike, ...dewPoint]);
  const extremes = dailyExtremes(f);
  const labels = (indices: number[], position: 'top center' | 'bottom center') => ({
    type: 'scatter' as const,
    mode: 'markers+text' as const,
    x: indices.map((i) => time[i] as string),
    y: indices.map((i) => temperature[i] as number),
    text: indices.map((i) => `${Math.round(temperature[i] as number)}°`),
    textposition: position,
    textfont: { size: 10, color: LOOK.title },
    marker: { size: 5, color: COLOR.temperature, line: { color: LOOK.bg, width: 1 } },
    hoverinfo: 'skip' as const,
    showlegend: false,
  });
  const line = (name: string, y: Series, color: string, width: number) => ({
    type: 'scatter' as const,
    mode: 'lines' as const,
    name,
    x: time,
    y: [...y],
    line: { color, width, shape: 'spline' as const, smoothing: 0.6 },
    hovertemplate: `${name} %{y:.0f} °F`,
  });
  return {
    data: [
      line('Dew point', dewPoint, COLOR.dewPoint, 1.5),
      line('Feels like', feelsLike, COLOR.feelsLike, 1.5),
      line('Temperature', temperature, COLOR.temperature, 2.25),
      ...(view.narrow
        ? []
        : [labels(extremes.high, 'top center'), labels(extremes.low, 'bottom center')]),
    ],
    layout: {
      ...timeLayout(f, view),
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', traceorder: 'reversed' },
      yaxis: {
        range: [round(Math.min(...all) - 3, 5, false), round(Math.max(...all) + 4, 5, true)],
        ticksuffix: '°',
        fixedrange: true,
        zeroline: false,
      },
    },
  };
}

/**
 * Cloud cover and chance of precipitation as filled areas, humidity as a line, all in percent;
 * sea-level pressure on a second y axis on the right (`overlaying: 'y'`).
 */
export function skyFigure(f: Forecast, view: View): Figure {
  const { time, cloudCover, precipChance, humidity, pressure } = f.hourly;
  const p = finite(pressure);
  const pressureRange =
    p.length > 0
      ? [round(Math.min(...p) - 0.02, 0.05, false), round(Math.max(...p) + 0.02, 0.05, true)]
      : [29.5, 30.5];
  return {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Cloud cover',
        x: time,
        y: [...cloudCover],
        fill: 'tozeroy',
        fillcolor: COLOR.cloud,
        line: { color: COLOR.cloudLine, width: 1 },
        hovertemplate: 'Cloud cover %{y:.0f}%',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Chance of precipitation',
        x: time,
        y: [...precipChance],
        fill: 'tozeroy',
        fillcolor: 'rgba(58, 160, 200, 0.4)',
        line: { color: COLOR.rain, width: 1.5 },
        hovertemplate: 'Chance of precipitation %{y:.0f}%',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Humidity',
        x: time,
        y: [...humidity],
        line: { color: COLOR.humidity, width: 1.75 },
        hovertemplate: 'Humidity %{y:.0f}%',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Pressure (inHg)',
        yaxis: 'y2',
        x: time,
        y: [...pressure],
        line: { color: COLOR.pressure, width: 2 },
        hovertemplate: 'Pressure %{y:.2f} inHg',
      },
    ],
    layout: {
      ...timeLayout(f, view),
      yaxis: { range: [0, 100], dtick: 20, ticksuffix: '%', fixedrange: true },
      yaxis2: {
        overlaying: 'y',
        side: 'right',
        range: pressureRange,
        tickformat: '.2f',
        showgrid: false,
        zeroline: false,
        fixedrange: true,
      },
    },
  };
}

/** Running total of an hourly series; a gap adds nothing. */
export function runningTotal(values: Series): number[] {
  let sum = 0;
  return values.map((v) => (sum += v ?? 0));
}

/**
 * Hourly precipitation as bars (snowfall as a second bar trace when any is forecast), and the
 * total since midnight today as a stepped line on a second y axis.
 */
export function precipFigure(f: Forecast, view: View): Figure {
  const { time, precip, snowfall } = f.hourly;
  const total = runningTotal(precip);
  const sum = total.at(-1) ?? 0;
  const snows = finite(snowfall).some((v) => v > 0);
  const peak = Math.max(0, ...finite(precip), ...(snows ? finite(snowfall) : []));
  return {
    data: [
      {
        type: 'bar',
        name: 'Hourly precipitation (in)',
        x: time,
        y: [...precip],
        marker: { color: COLOR.rain },
        hovertemplate: 'Precipitation %{y:.2f} in',
      },
      ...(snows
        ? [
            {
              type: 'bar' as const,
              name: 'Hourly snowfall (in)',
              x: time,
              y: [...snowfall],
              marker: { color: COLOR.snow },
              hovertemplate: 'Snowfall %{y:.1f} in',
            },
          ]
        : []),
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Total since midnight today (in)',
        yaxis: 'y2',
        x: time,
        y: total,
        line: { color: COLOR.total, width: 2, shape: 'hv' },
        hovertemplate: 'Total so far %{y:.2f} in',
      },
    ],
    layout: {
      ...timeLayout(f, view),
      barmode: 'overlay',
      yaxis: {
        range: [0, Math.max(0.1, peak * 1.15)],
        tickformat: '.2f',
        fixedrange: true,
      },
      yaxis2: {
        overlaying: 'y',
        side: 'right',
        range: [0, Math.max(0.25, sum * 1.1)],
        tickformat: '.2f',
        tickfont: { color: COLOR.total },
        showgrid: false,
        fixedrange: true,
      },
      annotations:
        sum > 0
          ? []
          : [
              {
                xref: 'paper',
                yref: 'paper',
                x: 0.5,
                y: 0.5,
                showarrow: false,
                text: `No precipitation in the ${f.days.length}-day forecast`,
                font: { size: view.narrow ? 11 : 13, color: LOOK.text },
              },
            ],
    },
  };
}

/** Hours between direction arrows on the wind figure. */
const ARROW_EVERY = 6;

/**
 * Sustained wind and gusts by the hour. Every sixth hour carries an arrow on the wind line
 * pointing the way the wind blows (`marker.symbol: 'arrow'` with per-point `marker.angle`).
 */
export function windFigure(f: Forecast, view: View): Figure {
  const { time, windSpeed, windGust, windDirection } = f.hourly;
  const from = windDirection.map((d) => (d === null ? '' : compass(d)));
  const arrows = time
    .map((_, i) => i)
    .filter(
      (i) =>
        i % ARROW_EVERY === ARROW_EVERY / 2 && windSpeed[i] != null && windDirection[i] != null,
    );
  const top = Math.max(10, ...finite(windGust), ...finite(windSpeed));
  return {
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Gusts',
        x: time,
        y: [...windGust],
        line: { color: COLOR.gust, width: 1.25 },
        hovertemplate: 'Gusts %{y:.0f} mph',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Wind speed',
        x: time,
        y: [...windSpeed],
        customdata: from,
        line: { color: COLOR.wind, width: 2 },
        hovertemplate: 'Wind %{y:.0f} mph from the %{customdata}',
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Blowing toward',
        x: arrows.map((i) => time[i] as string),
        y: arrows.map((i) => windSpeed[i] as number),
        marker: {
          symbol: 'arrow',
          size: view.narrow ? 8 : 9,
          // The data say where the wind comes from; the arrow points where it goes.
          angle: arrows.map((i) => ((windDirection[i] as number) + 180) % 360),
          color: LOOK.title,
        },
        hoverinfo: 'skip',
      },
    ],
    layout: {
      ...timeLayout(f, view),
      yaxis: {
        range: [0, round(top * 1.08, 5, true)],
        ticksuffix: view.narrow ? '' : ' mph',
        fixedrange: true,
      },
    },
  };
}

type Colorscale = [number, string][];

const THERMAL: Colorscale = [
  [0, '#2b3f9e'],
  [0.25, '#3aa0c8'],
  [0.5, '#e3d27a'],
  [0.75, '#e8833a'],
  [1, '#ea2a37'],
];
const scaleTo = (color: string): Colorscale => [
  [0, '#12131b'],
  [1, color],
];

/** What the hour-by-day grid can show. */
export const GRID_METRICS = {
  temperature: { label: 'Temperature', series: 'temperature', suffix: ' °F', colorscale: THERMAL },
  precipChance: {
    label: 'Chance of rain',
    series: 'precipChance',
    suffix: '%',
    colorscale: scaleTo('#3aa0c8'),
    range: [0, 100],
  },
  cloudCover: {
    label: 'Cloud cover',
    series: 'cloudCover',
    suffix: '%',
    colorscale: scaleTo('#c3c7d6'),
    range: [0, 100],
  },
  windSpeed: {
    label: 'Wind',
    series: 'windSpeed',
    suffix: ' mph',
    colorscale: scaleTo('#7f93ea'),
    floor: 0,
  },
  uvIndex: {
    label: 'UV index',
    series: 'uvIndex',
    suffix: '',
    colorscale: scaleTo('#c77be0'),
    floor: 0,
  },
} as const satisfies Record<
  string,
  {
    label: string;
    series: keyof Forecast['hourly'];
    suffix: string;
    colorscale: Colorscale;
    range?: readonly [number, number];
    floor?: number;
  }
>;

export type GridMetric = keyof typeof GRID_METRICS;

const HOUR_NAMES = Array.from(
  { length: 24 },
  (_, h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`,
);

/** `z[hour][day]` for an hourly series; hours the forecast does not cover stay `null`. */
export function hourGrid(f: Forecast, values: Series): (number | null)[][] {
  const column = new Map(f.days.map((d, i) => [d.date, i]));
  const z = HOUR_NAMES.map(() => f.days.map((): number | null => null));
  f.hourly.time.forEach((t, i) => {
    const day = column.get(t.slice(0, 10));
    const row = z[Number(t.slice(11, 13))];
    if (day !== undefined && row !== undefined) row[day] = values[i] ?? null;
  });
  return z;
}

/**
 * One metric as a `heatmap` with a column per day and a row per hour of the day, midnight at the
 * top, so the daily cycle reads down each column and a change in the weather reads across.
 */
export function hourGridFigure(f: Forecast, metric: GridMetric, view: View): Figure {
  const m: {
    label: string;
    series: keyof Forecast['hourly'];
    suffix: string;
    colorscale: Colorscale;
    range?: readonly [number, number];
    floor?: number;
  } = GRID_METRICS[metric];
  const values = f.hourly[m.series] as Series;
  const seen = finite(values);
  const zmin = m.range?.[0] ?? m.floor ?? Math.min(...seen);
  const zmax = m.range?.[1] ?? Math.max(zmin + 1, ...seen);
  return {
    data: [
      {
        type: 'heatmap',
        x: f.days.map((d) => dayLabel(d.date)),
        y: HOUR_NAMES,
        z: hourGrid(f, values),
        zmin,
        zmax,
        colorscale: m.colorscale,
        xgap: 3,
        colorbar: {
          thickness: 10,
          ticksuffix: m.suffix.trim() === '°F' ? '°' : m.suffix,
          outlinewidth: 0,
        },
        hovertemplate: `%{x}, %{y}<br><b>%{z:.0f}${m.suffix}</b><extra>${m.label}</extra>`,
      },
    ],
    layout: {
      margin: { l: view.narrow ? 44 : 56, r: view.narrow ? 8 : 16, t: 12, b: 34 },
      font: { size: view.narrow ? 10 : 12 },
      xaxis: { type: 'category', fixedrange: true, showgrid: false },
      yaxis: {
        type: 'category',
        autorange: 'reversed',
        tickvals: [0, 3, 6, 9, 12, 15, 18, 21].map((h) => HOUR_NAMES[h] as string),
        fixedrange: true,
        showgrid: false,
      },
    },
  };
}

/** Speed classes of the hourly sustained wind, mph (lower bounds). */
export const WIND_CLASSES = [
  { from: 0, name: 'Under 5 mph', color: '#3d4a8f' },
  { from: 5, name: '5 to 10', color: '#5468c4' },
  { from: 10, name: '10 to 15', color: '#3aa0c8' },
  { from: 15, name: '15 to 20', color: '#e3d27a' },
  { from: 20, name: '20 mph and up', color: '#e8833a' },
] as const;

const SECTORS = Array.from({ length: 16 }, (_, s) => compass(s * 22.5));

/** Percent of forecast hours in each [speed class][compass sector]. */
export function windRose(f: Forecast): { share: number[][]; hours: number } {
  const counts = WIND_CLASSES.map(() => SECTORS.map(() => 0));
  let hours = 0;
  f.hourly.windSpeed.forEach((speed, i) => {
    const direction = f.hourly.windDirection[i];
    if (speed === null || direction === null || direction === undefined) return;
    let k = 0;
    while (k + 1 < WIND_CLASSES.length && speed >= (WIND_CLASSES[k + 1] as { from: number }).from) {
      k++;
    }
    const row = counts[k] as number[];
    const sector = SECTORS.indexOf(compass(direction));
    row[sector] = (row[sector] as number) + 1;
    hours++;
  });
  return {
    share: counts.map((row) => row.map((n) => (hours > 0 ? (n / hours) * 100 : 0))),
    hours,
  };
}

/**
 * Where the wind will come from: the share of forecast hours from each of 16 compass points,
 * stacked outward by speed class (`barpolar`, `polar.barmode: 'stack'`), north at the top.
 */
export function windRoseFigure(f: Forecast, view: View): Figure {
  const { share } = windRose(f);
  const spoke = SECTORS.map((_, s) => share.reduce((a, row) => a + (row[s] as number), 0));
  const top = Math.max(10, Math.ceil(Math.max(...spoke) / 5) * 5);
  // The radial tick labels go along the emptiest direction. `radialaxis.angle` counts
  // counter-clockwise from east on screen, whatever the angular axis does.
  const quiet = spoke.indexOf(Math.min(...spoke)) * 22.5;
  return {
    data: WIND_CLASSES.map((c, k) => ({
      type: 'barpolar' as const,
      name: c.name,
      theta: [...SECTORS],
      r: share[k] as number[],
      customdata: spoke,
      marker: { color: c.color, line: { color: LOOK.bg, width: 0.5 } },
      hovertemplate:
        `From the %{theta}, ${c.name.toLowerCase()}<br><b>%{r:.0f}%</b> of hours ` +
        '(%{customdata:.0f}% from this direction at any speed)<extra></extra>',
    })),
    layout: {
      margin: { t: 28, b: 28, l: 24, r: 24 },
      font: { size: view.narrow ? 10 : 12 },
      legend: view.narrow
        ? { orientation: 'h', x: 0, y: -0.08, yanchor: 'top' }
        : { orientation: 'v', x: 1, xanchor: 'right', y: 1, yanchor: 'top' },
      polar: {
        barmode: 'stack',
        bargap: 0.06,
        domain: view.narrow ? { x: [0, 1], y: [0.08, 1] } : { x: [0, 0.8], y: [0, 1] },
        angularaxis: { type: 'category', direction: 'clockwise', rotation: 90 },
        radialaxis: {
          range: [0, top],
          dtick: top > 30 ? 10 : 5,
          ticksuffix: '%',
          angle: 90 - quiet,
          tickfont: { size: 9 },
        },
      },
    },
  };
}
