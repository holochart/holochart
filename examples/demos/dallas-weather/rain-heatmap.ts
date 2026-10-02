import { createChart, type Chart, type FigureInput, type HeatmapTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CURRENT_YEAR, FIRST_YEAR, MONTH_NAMES, MONTHLY_RAIN, YEARS } from './analysis.mts';
import { monthName, RAIN_SCALE } from './rain.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Every month's rain since 1940 as a heatmap: a column per year, a row per month (January on
 * top, `yaxis.autorange: 'reversed'`), colored on a sequential blue scale that saturates at
 * 10 inches (`zmax`) so one extreme month does not darken the rest. Months without a complete
 * rain record are `null` and stay blank (`hoverongaps: false`). Hover gives the month and its
 * total in inches (`hovertext`). An annotation points at the wettest month of the record. The
 * bright cells cluster in the May and October rows; the July and August rows stay dark.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: rain of every month since 1940',
  description:
    'Monthly rain totals as a year × month heatmap on a sequential blue colorscale, with blank cells for missing months and the wettest month labelled.',
  tags: ['demo', 'heatmap', 'colorscale', 'colorbar', 'annotations', 'gaps'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

/** The colorscale saturates here, inches. */
const CAP = 10;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const years = [...YEARS, CURRENT_YEAR];
  // Rows are months, columns are years.
  const z = MONTH_NAMES.map((_, m) => MONTHLY_RAIN.map((row) => row[m] ?? null));
  const hover = MONTH_NAMES.map((name, m) =>
    years.map((y, k) => {
      const v = z[m]![k];
      return v === null || v === undefined
        ? `${name} ${y}<br>no complete record`
        : `${name} ${y}<br><b>${v.toFixed(2)} in</b> of rain`;
    }),
  );
  let best = { v: -1, m: 0, year: FIRST_YEAR };
  let dryMonths = 0;
  z.forEach((row, m) =>
    row.forEach((v, k) => {
      if (v === null) return;
      if (v < 0.01) dryMonths++;
      if (v > best.v) best = { v, m, year: years[k] as number };
    }),
  );

  const rowMean = z.map((row) => {
    const v = row.filter((x): x is number => x !== null);
    return v.reduce((a, b) => a + b, 0) / v.length;
  });
  const wetRow = rowMean.indexOf(Math.max(...rowMean));
  const dryRow = rowMean.indexOf(Math.min(...rowMean));

  const cells = {
    type: 'heatmap',
    name: 'Rain',
    x: years,
    y: MONTH_NAMES,
    z,
    hovertext: hover,
    hovertemplate: '%{hovertext}<extra></extra>',
    hoverongaps: false,
    colorscale: RAIN_SCALE,
    zmin: 0,
    zmax: CAP,
    xgap: 1,
    ygap: 1,
    colorbar: {
      title: { text: 'Rain,<br>inches' },
      tickvals: [0, 2, 4, 6, 8, 10],
      ticktext: ['0', '2', '4', '6', '8', `≥ ${CAP}`],
      thickness: 12,
      len: 0.9,
    },
  } satisfies HeatmapTrace;

  const figure: FigureInput = {
    data: [cells],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Rain of every month since ${FIRST_YEAR}: ${monthName(wetRow + 1)} is the wettest on average, ${monthName(dryRow + 1)} the driest; ${dryMonths} months had no rain at all`,
      },
      margin: { t: narrow ? 16 : 48, l: 44, r: narrow ? 56 : 72, b: 32 },
      xaxis: { showgrid: false, ticks: '', dtick: 10, tickformat: 'd' },
      yaxis: { type: 'category', autorange: 'reversed', showgrid: false, ticks: '' },
      annotations: [
        {
          xref: 'x',
          yref: 'y',
          x: best.year,
          y: MONTH_NAMES[best.m] as string,
          text: `<b>${monthName(best.m + 1)} ${best.year}</b>: ${best.v.toFixed(1)} in,<br>the wettest month on record`,
          showarrow: true,
          arrowhead: 0,
          arrowwidth: 1,
          arrowcolor: LOOK.title,
          ax: -96,
          ay: -74,
          align: 'right',
          font: { size: 10, color: LOOK.title },
          bgcolor: 'rgba(10, 10, 15, 0.85)',
          borderpad: 3,
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
