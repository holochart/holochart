import {
  createChart,
  type Chart,
  type Figure,
  type HeatmapTrace,
  type LayoutAnnotation,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  CATEGORIES,
  CATEGORY_COLOR,
  ELEMENTS,
  tableCell,
  type Category,
  type Element,
} from './data.mts';
import { fmt, fmtDensity } from './elements.mts';
import { chartConfig, frame, isNarrow, LOOK, segmented, settled } from './ui.mts';

/**
 * The periodic table in its usual shape as a `heatmap`: one cell per element (18 groups across,
 * 7 periods down on a reversed y axis, the lanthanides and actinides in two rows below), the
 * symbol as cell text (`texttemplate`, drawn black or white against the cell) and gaps between
 * cells (`xgap`, `ygap`). The main table and the two lower rows are two traces on the same axes,
 * so the lower rows can sit half a row apart.
 *
 * The "Color by" toggle swaps what colors the cells with `chart.react`: the element category
 * (discrete colors through a stepped `colorscale`, with the category names on the colorbar),
 * Pauling electronegativity, melting point (K) or density (g/cm³). Elements with no measured
 * value stay as dark cells. Hover (`hovertext`) gives name, atomic number, mass and the value.
 */
export const meta: ExampleMeta = {
  title: 'Elements: the periodic table',
  description:
    'The periodic table as a heatmap with element symbols, colored by category, electronegativity, melting point or density.',
  tags: ['demo', 'heatmap', 'texttemplate', 'colorscale', 'colorbar', 'annotations', 'react'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

type Mode = 'category' | 'electronegativity' | 'melting' | 'density';

interface ModeSpec {
  title: string;
  bar: string;
  value(e: Element): number | null;
  hover(e: Element): string;
  colorscale: HeatmapTrace['colorscale'];
  zmin: number;
  zmax: number;
}

/** One flat step per category, so the continuous colorscale acts as a discrete one. */
const STEPPED: [number, string][] = [...CATEGORIES]
  .reverse()
  .flatMap((c, k): [number, string][] => [
    [k / CATEGORIES.length, CATEGORY_COLOR[c]],
    [(k + 1) / CATEGORIES.length, CATEGORY_COLOR[c]],
  ]);
/** The z value of a category: the first category gets the highest, so it tops the colorbar. */
const categoryZ = (c: Category): number => CATEGORIES.length - 1 - CATEGORIES.indexOf(c);

const MODES: Record<Mode, ModeSpec> = {
  category: {
    title: 'The periodic table: elements in one column behave alike',
    bar: '',
    value: (e) => categoryZ(e.category),
    hover: (e) => e.category,
    colorscale: STEPPED,
    zmin: -0.5,
    zmax: CATEGORIES.length - 0.5,
  },
  electronegativity: {
    title: 'Electronegativity (pull on shared electrons) grows toward the top right',
    bar: 'Pauling<br>scale',
    value: (e) => e.electronegativity,
    hover: (e) =>
      e.electronegativity === null
        ? 'Electronegativity: no value'
        : `Electronegativity ${fmt(e.electronegativity)} (Pauling scale)`,
    colorscale: 'Viridis',
    zmin: 0.7,
    zmax: 4,
  },
  melting: {
    title: 'Melting point: highest in the middle of the table (tungsten, 3,695 K)',
    bar: 'Melting<br>point, K',
    value: (e) => e.melting,
    hover: (e) =>
      e.melting === null ? 'Melting point: no value' : `Melting point ${fmt(e.melting)} K`,
    colorscale: 'Inferno',
    zmin: 0,
    zmax: 4000,
  },
  density: {
    title: 'Density: heaviest for their size at the bottom center (osmium, 22.6 g/cm³)',
    bar: 'Density,<br>g/cm³',
    value: (e) => e.density,
    hover: (e) =>
      e.density === null ? 'Density: no value' : `Density ${fmtDensity(e.density)} g/cm³`,
    colorscale: 'Viridis',
    zmin: 0,
    zmax: 23,
  },
};

const COLS = Array.from({ length: 18 }, (_, i) => i + 1);
const MAIN_ROWS = [1, 2, 3, 4, 5, 6, 7];
const F_ROWS = [8.5, 9.5];
/** The cell color of an element with no value in the chosen property. */
const EMPTY = '#22222c';

interface Grid {
  z: (number | null)[][];
  text: string[][];
  hover: string[][];
  count: number;
}

/** The cells of one block of rows, holding `value(e)` (cells whose value is `null` stay empty). */
function grid(rows: readonly number[], mode: ModeSpec, value: (e: Element) => number | null): Grid {
  const g: Grid = {
    z: rows.map(() => COLS.map((): number | null => null)),
    text: rows.map(() => COLS.map(() => '')),
    hover: rows.map(() => COLS.map(() => '')),
    count: 0,
  };
  for (const e of ELEMENTS) {
    const { col, row } = tableCell(e);
    const j = rows.indexOf(row);
    const v = value(e);
    if (j < 0 || v === null) continue;
    g.z[j]![col - 1] = v;
    g.text[j]![col - 1] = e.symbol;
    g.hover[j]![col - 1] =
      `<b>${e.name}</b> (${e.symbol})<br>Atomic number ${e.z}<br>` +
      `Atomic mass ${fmt(e.mass, 3)} u<br>${mode.hover(e)}`;
    g.count++;
  }
  return g;
}

function figure(mode: Mode, narrow: boolean): Figure {
  const spec = MODES[mode];
  const cell = {
    xgap: 3,
    ygap: 3,
    hoverongaps: false,
    texttemplate: '%{text}',
    textfont: { size: narrow ? 7 : 11 },
    hovertemplate: '%{hovertext}<extra></extra>',
  } satisfies Partial<HeatmapTrace>;

  const data: HeatmapTrace[] = [];
  [MAIN_ROWS, F_ROWS].forEach((rows, k) => {
    // Under the colored cells: the elements with no value, as plain dark cells.
    const empty = grid(rows, spec, (e) => (spec.value(e) === null ? 0 : null));
    if (empty.count > 0) {
      data.push({
        type: 'heatmap',
        name: 'No value',
        x: COLS,
        y: [...rows],
        z: empty.z,
        text: empty.text,
        hovertext: empty.hover,
        colorscale: [
          [0, EMPTY],
          [1, EMPTY],
        ],
        zmin: 0,
        zmax: 1,
        showscale: false,
        ...cell,
        textfont: { size: narrow ? 7 : 11, color: LOOK.tick },
      });
    }
    const g = grid(rows, spec, spec.value);
    data.push({
      type: 'heatmap',
      name: 'Elements',
      x: COLS,
      y: [...rows],
      z: g.z,
      text: g.text,
      hovertext: g.hover,
      colorscale: spec.colorscale,
      zmin: spec.zmin,
      zmax: spec.zmax,
      showscale: k === 0,
      colorbar:
        mode === 'category'
          ? {
              tickvals: CATEGORIES.map(categoryZ),
              ticktext: [...CATEGORIES],
              ticks: '',
              thickness: 12,
              len: 0.9,
              tickfont: { size: narrow ? 8 : 10 },
            }
          : { title: { text: spec.bar }, thickness: 12, len: 0.9 },
      ...cell,
    });
  });

  const rowLabel = (text: string, y: number): LayoutAnnotation => ({
    x: 2.4,
    y,
    xanchor: 'right',
    showarrow: false,
    text,
    font: { size: narrow ? 7 : 10, color: LOOK.text },
  });

  return {
    data,
    layout: {
      title: { text: narrow ? '' : spec.title },
      margin: {
        t: narrow ? 28 : 64,
        l: narrow ? 24 : 44,
        r: mode === 'category' ? (narrow ? 104 : 150) : narrow ? 56 : 84,
        b: 12,
      },
      hovermode: 'closest',
      xaxis: {
        side: 'top',
        tickvals: COLS,
        range: [0.5, 18.5],
        showgrid: false,
        zeroline: false,
        ticks: '',
        fixedrange: true,
        tickfont: { size: narrow ? 7 : 10 },
        title: { text: narrow ? '' : 'Group (column)', font: { size: 10 }, standoff: 4 },
      },
      yaxis: {
        // Reversed, so period 1 is on top.
        range: [10.1, 0.5],
        tickvals: MAIN_ROWS,
        showgrid: false,
        zeroline: false,
        ticks: '',
        fixedrange: true,
        tickfont: { size: narrow ? 7 : 10 },
        title: { text: narrow ? '' : 'Period (row)', font: { size: 10 } },
      },
      annotations: narrow ? [] : [rowLabel('Lanthanides', 8.5), rowLabel('Actinides', 9.5)],
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('category', narrow));

  segmented<Mode>(
    toolbar,
    'Color by',
    [
      { value: 'category', text: 'Category' },
      { value: 'electronegativity', text: 'Electronegativity' },
      { value: 'melting', text: 'Melting point' },
      { value: 'density', text: 'Density' },
    ],
    (value) => void chart.react(figure(value, narrow)),
    'category',
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
