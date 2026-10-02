import { createChart, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLD, DATE, FIRST_DATE, fmtDate, HOT, LAST_DATE, TMAX, TMIN } from './analysis.mts';
import { withAlpha } from './temperature.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Every daily high and low of the whole record, 87 years of days, as two `scatter` lines on a
 * date axis with the band between them filled (`fill: 'tonexty'`): about 63,000 points drawn at
 * once. The chart opens on the last five years (`xaxis.range`); the range selector buttons
 * (`xaxis.rangeselector`) jump to 1, 5 or 20 years or the whole record, and the range slider
 * (`xaxis.rangeslider`) under the plot shows all of it and pans or zooms the window. Dotted lines
 * (`shapes`) mark 100 °F and freezing. Missing readings (`null`) leave a gap in the line.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: every daily high and low since 1939',
  description:
    'The daily high and low at Dallas Love Field for the whole record, about 63,000 points, with a range slider and 1, 5, 20 year and all buttons.',
  tags: ['demo', 'scatter', 'line', 'date', 'rangeslider', 'rangeselector', 'fill', 'performance'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const points = TMAX.filter((v) => v !== null).length + TMIN.filter((v) => v !== null).length;
  const highs = TMAX.filter((v): v is number => v !== null);
  const lows = TMIN.filter((v): v is number => v !== null);
  const top = Math.max(...highs);
  const bottom = Math.min(...lows);
  const from = `${Number(LAST_DATE.slice(0, 4)) - 5}${LAST_DATE.slice(4)}`;

  const low = {
    type: 'scatter',
    mode: 'lines',
    name: 'Daily low',
    x: DATE,
    y: TMIN,
    line: { color: COLD, width: 1 },
    hovertemplate: 'Low <b>%{y} °F</b><extra></extra>',
  } satisfies ScatterTrace;
  const high = {
    type: 'scatter',
    mode: 'lines',
    name: 'Daily high',
    x: DATE,
    y: TMAX,
    line: { color: HOT, width: 1 },
    fill: 'tonexty',
    fillcolor: withAlpha(LOOK.tick, 0.16),
    hovertemplate: '%{x|%a %b %-d, %Y}<br>High <b>%{y} °F</b><extra></extra>',
  } satisfies ScatterTrace;

  const mark = (y: number, text: string, color: string) => ({
    shape: {
      type: 'line' as const,
      xref: 'paper' as const,
      yref: 'y' as const,
      x0: 0,
      x1: 1,
      y0: y,
      y1: y,
      line: { color, width: 1, dash: 'dot' as const },
    },
    annotation: {
      xref: 'paper' as const,
      yref: 'y' as const,
      x: 0.005,
      y,
      xanchor: 'left' as const,
      yanchor: 'bottom' as const,
      showarrow: false,
      text,
      font: { size: 10, color: LOOK.title },
      bgcolor: 'rgba(10, 10, 15, 0.7)',
      yshift: 2,
    },
  });
  const marks = [mark(100, '100 °F', LOOK.text), mark(32, 'Freezing, 32 °F', LOOK.text)];

  const chart: Chart = createChart(chartEl, {
    data: [low, high],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${points.toLocaleString('en-US')} daily highs and lows, ${fmtDate(FIRST_DATE)} to ${fmtDate(LAST_DATE)}`,
      },
      hovermode: 'x',
      legend: { orientation: 'h', x: 0, xanchor: 'left', y: 1.02, yanchor: 'bottom' },
      xaxis: {
        type: 'date',
        range: [from, LAST_DATE],
        rangeslider: { visible: true, thickness: 0.1 },
        rangeselector: {
          buttons: [
            { count: 1, label: '1 year', step: 'year', stepmode: 'backward' },
            { count: 5, label: '5 years', step: 'year', stepmode: 'backward' },
            { count: 20, label: '20 years', step: 'year', stepmode: 'backward' },
            { step: 'all', label: 'All' },
          ],
        },
      },
      yaxis: {
        title: { text: 'Temperature (°F)' },
        range: [Math.floor(bottom / 10) * 10 - 5, Math.ceil(top / 10) * 10 + 5],
        dtick: 20,
        fixedrange: true,
      },
      shapes: marks.map((m) => m.shape),
      annotations: marks.map((m) => m.annotation),
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
