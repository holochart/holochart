import {
  createChart,
  type Chart,
  type Figure,
  type LayoutAnnotation,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CATEGORIES, CATEGORY_COLOR, ELEMENTS, type Category, type Element } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * Why the table is called periodic: a property of the elements plotted against atomic number, for
 * hydrogen (1) to radon (86). A grey `scatter` line joins the elements in order, and one
 * markers trace per category colors the points and fills the legend; two families are labelled
 * with their symbols (`mode: 'markers+text'`, `textposition`).
 *
 * The "Show" toggle swaps the property with `chart.react`: first ionization energy (the energy
 * needed to pull one electron off an atom, in eV: noble gases at the peaks, alkali metals in the
 * dips), Pauling electronegativity (halogens at the peaks, alkali metals in the dips) and the van
 * der Waals radius (alkali metals at the peaks). Elements with no value leave a gap in the line.
 * In every view the same pattern comes back after each row of the table.
 */
export const meta: ExampleMeta = {
  title: 'Elements: properties repeat with atomic number',
  description:
    'First ionization energy, electronegativity or atomic radius against atomic number for elements 1 to 86, colored by category.',
  tags: ['demo', 'scatter', 'lines', 'markers', 'text', 'legend', 'annotations', 'react'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

type Mode = 'ionization' | 'electronegativity' | 'radius';

interface ModeSpec {
  title: string;
  axis: string;
  unit: string;
  value(e: Element): number | null;
  /** Labelled families, and where the label sits relative to the marker. */
  labels: Partial<Record<Category, 'top center' | 'bottom center'>>;
  note: string;
  /** The corner of the plot that the data leaves free. */
  noteAt: 'left' | 'right';
  range: [number, number];
}

const MODES: Record<Mode, ModeSpec> = {
  ionization: {
    title: 'Energy to remove one electron: the same zigzag in every row of the table',
    axis: 'First ionization energy, eV',
    unit: ' eV',
    value: (e) => e.ionization,
    labels: { 'Noble gas': 'top center', 'Alkali metal': 'bottom center' },
    note:
      '<b>Peaks: noble gases</b>, which hold their electrons tightly.<br>' +
      '<b>Dips: alkali metals</b>, which give one up easily.<br>' +
      'The pattern repeats, hence "periodic" table.',
    noteAt: 'right',
    range: [0, 27],
  },
  electronegativity: {
    title: 'Pull on shared electrons: rises across each row, then drops back',
    axis: 'Electronegativity, Pauling scale',
    unit: '',
    value: (e) => e.electronegativity,
    labels: { Halogen: 'top center', 'Alkali metal': 'bottom center' },
    note:
      '<b>Peaks: halogens</b>, one electron short of a full shell.<br>' +
      '<b>Dips: alkali metals.</b> Most noble gases have no value<br>' +
      'because they rarely form bonds.',
    noteAt: 'right',
    range: [0, 4.4],
  },
  radius: {
    title: 'Size of the atom: jumps up at the start of every row',
    axis: 'Van der Waals radius, pm',
    unit: ' pm',
    value: (e) => e.radius,
    labels: { 'Alkali metal': 'top center' },
    note:
      '<b>Peaks: alkali metals.</b> Each one starts a new<br>' +
      'electron shell, so the atom is suddenly bigger.<br>' +
      '1 pm is a millionth of a millionth of a meter.',
    noteAt: 'left',
    range: [100, 370],
  },
};

const SHOWN = ELEMENTS.filter((e) => e.z <= 86);

function figure(mode: Mode, narrow: boolean): Figure {
  const spec = MODES[mode];
  const line: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: 'In order of atomic number',
    x: SHOWN.map((e) => e.z),
    y: SHOWN.map(spec.value),
    line: { color: LOOK.zero, width: 1.25 },
    hoverinfo: 'skip',
    showlegend: false,
  };
  const points = CATEGORIES.flatMap((category): ScatterTrace[] => {
    const es = SHOWN.filter((e) => e.category === category && spec.value(e) !== null);
    if (es.length === 0) return [];
    const position = spec.labels[category];
    return [
      {
        type: 'scatter',
        mode: position && !narrow ? 'markers+text' : 'markers',
        name: category,
        x: es.map((e) => e.z),
        y: es.map(spec.value),
        text: es.map((e) => e.symbol),
        customdata: es.map((e) => e.name),
        ...(position ? { textposition: position } : {}),
        textfont: { size: 10, color: LOOK.title },
        marker: { color: CATEGORY_COLOR[category], size: 7, line: { color: LOOK.bg, width: 1 } },
        hovertemplate:
          `<b>%{customdata}</b> (%{text}), atomic number %{x}<br>` +
          `${spec.axis.split(',')[0]} <b>%{y}${spec.unit}</b><extra>${category}</extra>`,
      },
    ];
  });
  const note: LayoutAnnotation = {
    xref: 'paper',
    yref: 'paper',
    x: spec.noteAt === 'right' ? 0.99 : 0.01,
    y: 0.98,
    xanchor: spec.noteAt,
    yanchor: 'top',
    align: 'left',
    showarrow: false,
    text: spec.note,
    font: { size: 11, color: LOOK.text },
  };
  // Where each row of the table starts: at an alkali metal (or hydrogen).
  const rowStarts = SHOWN.filter((e) => e.group === 1).map((e) => e.z);
  return {
    data: [line, ...points],
    layout: {
      title: { text: narrow ? '' : spec.title },
      hovermode: 'closest',
      legend: narrow
        ? { orientation: 'h', y: -0.2 }
        : { orientation: 'v', x: 1.01, xanchor: 'left', y: 0.5, yanchor: 'middle' },
      xaxis: {
        title: { text: 'Atomic number (protons in the nucleus)' },
        range: [0, 88],
        tickvals: narrow ? [1, 19, 37, 55, 86] : [1, 3, 11, 19, 37, 55, 86],
        showgrid: false,
        zeroline: false,
      },
      yaxis: { title: { text: spec.axis }, range: spec.range, zeroline: false },
      shapes: rowStarts.map((z) => ({
        type: 'line' as const,
        xref: 'x' as const,
        yref: 'paper' as const,
        x0: z - 0.5,
        x1: z - 0.5,
        y0: 0,
        y1: 1,
        layer: 'below' as const,
        line: { color: LOOK.grid, width: 1 },
      })),
      annotations: narrow ? [] : [note],
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('ionization', narrow));

  segmented<Mode>(
    toolbar,
    'Show',
    [
      { value: 'ionization', text: 'Ionization energy' },
      { value: 'electronegativity', text: 'Electronegativity' },
      { value: 'radius', text: 'Atomic radius' },
    ],
    (value) => void chart.react(figure(value, narrow)),
    'ionization',
  );

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
