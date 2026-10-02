import { createChart, type BarTrace, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { element, STATE_COLOR, type State } from './data.mts';
import { fmt } from './elements.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The temperature range in which 14 familiar elements are liquid: a horizontal `bar` per element
 * that starts at the melting point (`base`) and ends at the boiling point, in kelvin on a log axis
 * (helium melts near 1 K, tungsten boils near 5,800 K), sorted by melting point
 * (`categoryarray`). One trace per state at room temperature gives the legend and the colors, and
 * a vertical line (`shapes`) marks room temperature, 293 K: bars to its left are gases at room
 * temperature, bars to its right are solids, and the two bars it crosses (bromine and mercury)
 * are liquids. The label at the end of each bar (`text`, `textposition: 'outside'`) gives the two
 * temperatures.
 *
 * Values are at normal pressure, except helium, which only freezes under about 25 atmospheres.
 */
export const meta: ExampleMeta = {
  title: 'Elements: the temperature range in which they are liquid',
  description:
    'Range bars from melting point to boiling point in kelvin for 14 familiar elements on a log axis, with room temperature marked.',
  tags: ['demo', 'bar', 'base', 'horizontal', 'log', 'shapes', 'annotations', 'range'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

const SYMBOLS = ['He', 'N', 'O', 'Cl', 'Br', 'Hg', 'Na', 'S', 'Sn', 'Pb', 'Al', 'Cu', 'Fe', 'W'];
const ROOM_K = 293;
const STATES: readonly State[] = ['Gas', 'Liquid', 'Solid'];

/** A temperature in K: whole kelvins, or two decimals below 10 K. */
const kelvin = (v: number): string => fmt(v, v < 10 ? 2 : 0);

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const shown = SYMBOLS.map(element)
    .filter((e) => e.melting !== null && e.boiling !== null)
    .sort((a, b) => (a.melting as number) - (b.melting as number));
  const label = (name: string, symbol: string): string => (narrow ? symbol : `${name} (${symbol})`);

  const traces = STATES.map((state): BarTrace => {
    const es = shown.filter((e) => e.state === state);
    return {
      type: 'bar',
      orientation: 'h',
      name: `${state} at room temperature`,
      y: es.map((e) => label(e.name, e.symbol)),
      base: es.map((e) => e.melting as number),
      x: es.map((e) => (e.boiling as number) - (e.melting as number)),
      customdata: es.map((e) => [
        kelvin(e.melting as number),
        kelvin(e.boiling as number),
        kelvin((e.boiling as number) - (e.melting as number)),
        e.name,
      ]),
      text: es.map((e) => `${kelvin(e.melting as number)} to ${kelvin(e.boiling as number)} K`),
      textposition: narrow ? 'none' : 'outside',
      textfont: { size: 10, color: LOOK.text },
      cliponaxis: false,
      width: 0.62,
      marker: { color: STATE_COLOR[state] },
      hovertemplate:
        '<b>%{customdata[3]}</b><br>melts at %{customdata[0]} K, boils at %{customdata[1]} K<br>' +
        `liquid over %{customdata[2]} K<extra>${state} at 293 K</extra>`,
    };
  });

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: { text: narrow ? '' : 'Where each element is a liquid: from melting to boiling' },
      hovermode: 'closest',
      barmode: 'overlay',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { l: narrow ? 36 : 104, r: narrow ? 16 : 40 },
      xaxis: {
        type: 'log',
        title: { text: 'Temperature, K (log scale)' },
        range: [Math.log10(0.7), Math.log10(30000)],
        tickvals: [1, 3, 10, 30, 100, 300, 1000, 3000, 10000],
        ticktext: ['1', '3', '10', '30', '100', '300', '1,000', '3,000', '10,000'],
      },
      yaxis: {
        type: 'category',
        categoryorder: 'array',
        categoryarray: shown.map((e) => label(e.name, e.symbol)),
        showgrid: false,
      },
      shapes: [
        {
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: ROOM_K,
          x1: ROOM_K,
          y0: 0,
          y1: 1,
          line: { color: LOOK.title, width: 1, dash: 'dot' },
        },
      ],
      annotations: [
        {
          xref: 'x',
          yref: 'paper',
          x: Math.log10(ROOM_K),
          y: 0.98,
          xanchor: 'right',
          yanchor: 'top',
          xshift: -6,
          align: 'right',
          showarrow: false,
          text: narrow ? '293 K' : 'Room temperature<br>293 K (20 °C)',
          font: { size: 10, color: LOOK.title },
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
