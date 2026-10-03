import {
  createChart,
  type BarTrace,
  type Chart,
  type FigureInput,
  type LayoutAnnotation,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  CURRENT_YEAR,
  fmtDate,
  LAST_DATE,
  RAIN,
  RAIN_YEARS,
  THIS_YEAR,
  YEARLY,
} from './analysis.mts';
import { DRIEST_YEAR, MEAN_YEAR_RAIN, WETTEST_YEAR } from './rain.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Total rain of every year since 1940 as bars on a date axis (one bar per year, placed mid-year),
 * with a dotted line at the long-term average (a shape), the wettest and driest years labelled
 * (annotations with arrows) and the year in progress drawn lighter and labelled "so far"
 * (per-bar `marker.color`). The two years with gaps in the rain record are left out and the
 * chart says so. The point: a year in Dallas can bring anything from half to almost twice the
 * average.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: rain per year',
  description:
    'Total rain of each year since 1940 as bars on a date axis, with the average, the wettest and driest years and the year so far.',
  tags: ['demo', 'bar', 'date', 'timeseries', 'shapes', 'annotations'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

/** Behind the labels that sit over bars. */
const LABEL_BG = 'rgba(10, 10, 15, 0.82)';

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const years = [...RAIN_YEARS, THIS_YEAR];
  const mid = (year: number): string => `${year}-07-01`;
  const skipped = YEARLY.filter((y) => !RAIN_YEARS.includes(y)).map((y) => y.year);

  const bars = {
    type: 'bar',
    name: 'Rain',
    x: years.map((y) => mid(y.year)),
    y: years.map((y) => y.rain),
    customdata: years.map((y) => [
      y.year === CURRENT_YEAR ? `${y.year}, through ${fmtDate(LAST_DATE)}` : String(y.year),
      y.rainDays,
    ]),
    marker: {
      color: years.map((y) => (y.year === CURRENT_YEAR ? 'rgba(159, 220, 240, 0.8)' : RAIN)),
      line: { width: 0 },
    },
    hovertemplate:
      '%{customdata[0]}<br><b>%{y:.1f} in</b> of rain on %{customdata[1]} days<extra></extra>',
  } satisfies BarTrace;

  const label = (
    year: number,
    rain: number,
    text: string,
    ax: number,
    ay: number,
  ): LayoutAnnotation => ({
    xref: 'x',
    yref: 'y',
    x: mid(year),
    y: rain,
    text,
    showarrow: true,
    arrowhead: 0,
    arrowwidth: 1,
    arrowcolor: LOOK.tick,
    ax,
    ay,
    font: { size: 10, color: LOOK.title },
    bgcolor: LABEL_BG,
    borderpad: 3,
  });

  const figure: FigureInput = {
    data: [bars],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Rain per year: ${MEAN_YEAR_RAIN.toFixed(0)} inches on average, from ${DRIEST_YEAR.rain.toFixed(0)} to ${WETTEST_YEAR.rain.toFixed(0)}`,
      },
      showlegend: false,
      bargap: 0.15,
      margin: { r: 84 },
      xaxis: {
        type: 'date',
        range: ['1939-06-01', `${CURRENT_YEAR + 1}-08-01`],
        dtick: 'M120',
        tick0: '1940-07-01',
        tickformat: '%Y',
        showgrid: false,
      },
      yaxis: {
        title: { text: 'Rain, inches' },
        range: [0, Math.ceil(WETTEST_YEAR.rain / 10) * 10 + 5],
      },
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          x0: 0,
          x1: 1,
          yref: 'y',
          y0: MEAN_YEAR_RAIN,
          y1: MEAN_YEAR_RAIN,
          line: { color: LOOK.title, width: 1, dash: 'dot' },
        },
      ],
      annotations: [
        label(
          WETTEST_YEAR.year,
          WETTEST_YEAR.rain,
          `<b>${WETTEST_YEAR.year}</b>, the wettest: ${WETTEST_YEAR.rain.toFixed(1)} in`,
          -90,
          -4,
        ),
        label(
          DRIEST_YEAR.year,
          DRIEST_YEAR.rain,
          `<b>${DRIEST_YEAR.year}</b>, the driest:<br>${DRIEST_YEAR.rain.toFixed(1)} in`,
          0,
          -226,
        ),
        label(
          CURRENT_YEAR,
          THIS_YEAR.rain,
          `<b>${CURRENT_YEAR}</b> so far:<br>${THIS_YEAR.rain.toFixed(1)} in`,
          -30,
          -196,
        ),
        {
          xref: 'paper',
          yref: 'y',
          x: 1,
          xanchor: 'left',
          xshift: 6,
          y: MEAN_YEAR_RAIN,
          yanchor: 'middle',
          align: 'left',
          text: `Average of<br>${RAIN_YEARS.length} years:<br>${MEAN_YEAR_RAIN.toFixed(1)} in`,
          showarrow: false,
          font: { size: 10, color: LOOK.title },
        },
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.005,
          xanchor: 'left',
          y: 0.99,
          yanchor: 'top',
          text: `${skipped.join(' and ')} are left out: the rain record has gaps in those years`,
          showarrow: false,
          font: { size: 10, color: LOOK.text },
        },
      ],
    },
    config: chartConfig(narrow),
  };
  const chart: Chart = createChart(chartEl, figure);

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
