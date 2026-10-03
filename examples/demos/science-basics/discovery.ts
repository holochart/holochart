import {
  createChart,
  type Chart,
  type HistogramTrace,
  type LayoutAnnotation,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { ELEMENTS } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * When the elements were discovered: a `histogram` of the year of discovery in 25-year bins from
 * 1650 to 2025 (`xbins`), and the running total of known elements as a stepped `scatter` line on
 * a second y axis (`yaxis2`, `overlaying: 'y'`, `line.shape: 'hv'`). The elements with no
 * discovery year in the data are the ones known since antiquity (gold, iron, carbon and so on):
 * the running total starts from their count, and an annotation says how many there are. Hover on
 * the line names each element at its year (`text`).
 *
 * Discovery years follow PubChem, which dates an element from its first identification, so a few
 * are earlier than the year the pure element was first isolated.
 */
export const meta: ExampleMeta = {
  title: 'Elements: when they were discovered',
  description:
    'A histogram of element discoveries in 25-year bins from 1650 to 2025, with the running total on a second axis.',
  tags: ['demo', 'histogram', 'scatter', 'xbins', 'multiple-axes', 'annotations', 'hover'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const START = 1650;
const END = 2025;
const BIN = 25;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const ancient = ELEMENTS.filter((e) => e.discovered === null);
  const dated = ELEMENTS.filter((e) => e.discovered !== null).sort(
    (a, b) => (a.discovered as number) - (b.discovered as number) || a.z - b.z,
  );
  const years = dated.map((e) => e.discovered as number);

  const bars: HistogramTrace = {
    type: 'histogram',
    name: 'Discovered per 25 years',
    x: years,
    xbins: { start: START, end: END, size: BIN },
    marker: { color: LOOK.colorway[1], line: { color: LOOK.bg, width: 1 } },
    opacity: 0.85,
    hovertemplate: '%{x}<br><b>%{y} elements</b> discovered<extra></extra>',
  };
  const total: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: 'Known elements (right axis)',
    yaxis: 'y2',
    x: [START, ...years, END],
    y: [ancient.length, ...years.map((_, i) => ancient.length + i + 1), ELEMENTS.length],
    text: ['', ...dated.map((e) => `${e.name} (${e.symbol})`), ''],
    line: { color: LOOK.colorway[4], width: 2, shape: 'hv' },
    hovertemplate: '%{x}: %{text}<br><b>%{y} elements</b> known<extra></extra>',
  };

  // The busiest 25 years.
  const counts = new Map<number, number>();
  for (const y of years) {
    const b = Math.floor((y - START) / BIN);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const [peakBin, peakCount] = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a));
  const peakStart = START + peakBin * BIN;

  const annotations: LayoutAnnotation[] = [
    {
      x: START + 4,
      y: ancient.length,
      xref: 'x',
      yref: 'y2',
      text:
        `<b>${ancient.length} elements</b> were known since antiquity,<br>` +
        'such as gold, copper, iron and carbon',
      showarrow: true,
      arrowhead: 0,
      arrowwidth: 1,
      arrowcolor: LOOK.tick,
      ax: 36,
      ay: -64,
      xanchor: 'left',
      align: 'left',
      font: { size: 10, color: LOOK.text },
    },
    {
      x: peakStart + BIN / 2,
      y: peakCount,
      xref: 'x',
      yref: 'y',
      text: `<b>${peakCount} elements</b> in ${peakStart} to ${peakStart + BIN}`,
      showarrow: false,
      yshift: 10,
      font: { size: 10, color: LOOK.text },
    },
  ];

  const chart: Chart = createChart(chartEl, {
    data: [bars, total],
    layout: {
      title: {
        text: narrow
          ? ''
          : `From ${ancient.length} known elements to ${ELEMENTS.length}: most were found after 1750`,
      },
      hovermode: 'closest',
      bargap: 0.06,
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        title: { text: 'Year of discovery' },
        range: [START, END],
        tick0: START,
        dtick: narrow ? 100 : 50,
        showgrid: false,
      },
      yaxis: {
        title: { text: 'Elements discovered per 25 years' },
        range: [0, 24],
        dtick: 4,
      },
      yaxis2: {
        title: { text: 'Known elements in total' },
        overlaying: 'y',
        side: 'right',
        range: [0, 120],
        dtick: 20,
        showgrid: false,
        zeroline: false,
      },
      annotations: narrow ? [annotations[0]!] : annotations,
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
