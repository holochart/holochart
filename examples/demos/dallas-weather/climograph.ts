import {
  createChart,
  type BarTrace,
  type Chart,
  type FigureInput,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLD, HOT, MONTH_NAMES, NORMAL_FROM, NORMAL_TO, NORMALS, RAIN } from './analysis.mts';
import { monthName } from './rain.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The climate of Dallas in one picture (a climograph): the 1991–2020 average rain of each month
 * as bars on the left axis (inches) and the average daily high and low as two lines on a second
 * y axis at the right (`yaxis2` with `overlaying: 'y'`, °F). Rain peaks twice, in May and in
 * October, and dips in July and August, exactly when it is hottest. One hover label covers all
 * three series (`hovermode: 'x unified'`).
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: rain and temperature by month',
  description:
    'Climograph of Dallas: 1991–2020 average monthly rain as bars and average high and low as lines on a second y axis.',
  tags: ['demo', 'bar', 'scatter', 'multiple-axes', 'category', 'unified-hover'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const byRain = [...NORMALS].sort((a, b) => b.rain - a.rain);
  const wet = byRain.slice(0, 2).sort((a, b) => a.month - b.month);
  const dry = byRain[byRain.length - 1]!;

  const rain = {
    type: 'bar',
    name: 'Rain',
    x: MONTH_NAMES,
    y: NORMALS.map((n) => n.rain),
    marker: { color: RAIN, opacity: 0.85, line: { width: 0 } },
    hovertemplate: '%{y:.2f} in<extra>Rain</extra>',
  } satisfies BarTrace;
  const line = (name: string, y: number[], color: string): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines+markers',
    name,
    x: MONTH_NAMES,
    y,
    yaxis: 'y2',
    line: { color, width: 2.5, shape: 'spline' },
    marker: { color, size: 6 },
    hovertemplate: `%{y:.0f} °F<extra>${name}</extra>`,
  });

  const figure: FigureInput = {
    data: [
      rain,
      line(
        'Average high',
        NORMALS.map((n) => n.high),
        HOT,
      ),
      line(
        'Average low',
        NORMALS.map((n) => n.low),
        COLD,
      ),
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Two wet seasons, ${monthName(wet[0]!.month)} and ${monthName(wet[1]!.month)}, and a dry, hot ${monthName(dry.month)} (${NORMAL_FROM}–${NORMAL_TO} averages)`,
      },
      hovermode: 'x unified',
      bargap: 0.3,
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { r: 64 },
      xaxis: { type: 'category', showgrid: false },
      yaxis: {
        title: { text: 'Rain per month, inches', font: { color: RAIN } },
        range: [0, 6],
        dtick: 1,
      },
      yaxis2: {
        title: { text: 'Temperature, °F' },
        overlaying: 'y',
        side: 'right',
        range: [0, 120],
        dtick: 20,
        ticksuffix: '°',
        showgrid: false,
        zeroline: false,
      },
      annotations: [
        {
          xref: 'x',
          yref: 'y',
          x: dry.name,
          y: dry.rain,
          text: `${dry.name}: ${dry.rain.toFixed(1)} in of rain,<br>highs near ${dry.high.toFixed(0)} °F`,
          showarrow: true,
          arrowhead: 0,
          arrowwidth: 1,
          arrowcolor: LOOK.tick,
          ax: 0,
          ay: -34,
          font: { size: 10, color: LOOK.title },
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
