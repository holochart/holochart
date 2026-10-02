import { createChart, type Chart, type LayoutShape, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { linspace } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Radioactive decay as a smooth curve: the carbon-14 left in a sample over 30,000 years,
 * 100% · (1/2)^(t / 5,730 years), and the nitrogen-14 it has turned into, as two stacked `scatter`
 * areas (`stackgroup`) that always add up to 100%. Dotted vertical lines (`layout.shapes`) mark
 * each half-life, which the x axis ticks follow (`tickvals`); on each one the carbon-14 is half of
 * what it was at the line before: 50%, 25%, 12.5%, 6.25%, 3.125%.
 */
export const meta: ExampleMeta = {
  title: 'Half-life: carbon-14 turning into nitrogen-14',
  description:
    'Stacked areas of carbon-14 remaining and nitrogen-14 formed over 30,000 years, with a dotted line at every 5,730-year half-life.',
  tags: ['demo', 'scatter', 'area', 'stackgroup', 'shapes', 'physics'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

const HALF_LIFE = 5730;
const T_END = 30_000;
const C14 = '#5e74d5';
const N14 = '#997600';

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const t = linspace(0, T_END, 301);
  const left = t.map((v) => 100 * 0.5 ** (v / HALF_LIFE));
  const halves = [1, 2, 3, 4, 5].map((k) => k * HALF_LIFE);

  const area = (name: string, y: number[], color: string): ScatterTrace => ({
    type: 'scatter',
    mode: 'lines',
    name,
    x: t,
    y,
    stackgroup: 'atoms',
    line: { color, width: 2 },
    fillcolor: `${color}80`,
    hovertemplate: `${name}: <b>%{y:.1f}%</b> after %{x:,.0f} years<extra></extra>`,
  });

  const lines = halves.map((x): LayoutShape => ({
    type: 'line',
    xref: 'x',
    x0: x,
    x1: x,
    yref: 'paper',
    y0: 0,
    y1: 1,
    line: { color: LOOK.title, width: 1, dash: 'dot' },
  }));

  const chart: Chart = createChart(chartEl, {
    data: [
      area('Carbon-14 left', left, C14),
      area(
        'Nitrogen-14 formed',
        left.map((v) => 100 - v),
        N14,
      ),
    ],
    layout: {
      title: { text: narrow ? '' : 'A sample’s carbon-14 decays into nitrogen-14' },
      hovermode: 'x unified',
      legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
      xaxis: {
        title: { text: 'Time (years); each tick is one half-life of 5,730 years' },
        range: [0, T_END],
        tickvals: [0, ...halves],
        tickformat: ',',
        showgrid: false,
        zeroline: false,
      },
      yaxis: {
        title: { text: 'Share of the original carbon-14 atoms' },
        range: [0, 100],
        ticksuffix: '%',
        dtick: 25,
      },
      shapes: lines,
      annotations: halves.map((x, i) => ({
        x,
        y: 100 / 2 ** (i + 1),
        text: `${100 / 2 ** (i + 1)}%`,
        showarrow: false,
        xanchor: i === halves.length - 1 ? ('right' as const) : ('left' as const),
        yanchor: 'bottom' as const,
        xshift: i === halves.length - 1 ? -4 : 4,
        yshift: 2,
        font: { size: 10, color: LOOK.title },
      })),
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
