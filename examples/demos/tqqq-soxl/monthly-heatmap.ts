import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  COMMON_START,
  fmtDate,
  type Fund,
  LAST_DATE,
  MONTH_NAMES,
  pct,
  periodReturns,
  RETURN_SCALE,
} from './analysis.mts';
import { chartConfig, frame, fundPicker, isNarrow, settled } from './ui.mts';

/**
 * Every calendar month of TQQQ or SOXL since SOXL's first day (Mar 11, 2010) as a calendar
 * heatmap: a row per year (the latest on top), a column per month, each cell labelled with its
 * return (`texttemplate: '%{text}'`, drawn black or white against the cell). The diverging
 * `RETURN_SCALE` is centered on 0 and capped at ±50% (`zmin` / `zmax`), so a handful of extreme
 * months don't wash the rest out; the label still shows the true value. A narrow second heatmap on
 * its own x axis (`xaxis2`, sharing the y axis) adds the year's total on a wider ±150% scale.
 * Hover (`hovertext`) names the month and flags the partial first and last periods. A DOM toggle
 * swaps the fund with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: monthly returns calendar',
  description:
    'Monthly returns of TQQQ or SOXL since March 2010 as a year × month heatmap with labelled cells and yearly totals.',
  tags: ['demo', 'heatmap', 'texttemplate', 'category', 'colorbar', 'react', 'financial'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

/** Monthly colors saturate at ±50%, yearly ones at ±150%. */
const MONTH_CAP = 0.5;
const YEAR_CAP = 1.5;
const MONTH_RANGE = `${fmtDate(COMMON_START)} – ${fmtDate(LAST_DATE)}`;

/** A cell label: whole percent, and a plain `0%` where rounding would print `−0%`. */
const cellLabel = (r: number): string => (Math.round(r * 100) === 0 ? '0%' : pct(r, 0));

interface Grid {
  years: string[];
  z: (number | null)[][];
  label: string[][];
  hover: string[][];
  yearZ: (number | null)[][];
  yearLabel: string[][];
  yearHover: string[][];
}

function grid(fund: Fund): Grid {
  const months = periodReturns(fund, 'month', COMMON_START);
  const years = periodReturns(fund, 'year', COMMON_START);
  const first = months[0]!.year;
  const last = months[months.length - 1]!.year;
  const ys: number[] = [];
  for (let y = first; y <= last; y++) ys.push(y);
  const row = (y: number): number => y - first;
  const z = ys.map(() => MONTH_NAMES.map((): number | null => null));
  const label = ys.map(() => MONTH_NAMES.map(() => ''));
  const hover = ys.map((y) => MONTH_NAMES.map((m) => `${fund} · ${m} ${y}<br>no data`));
  for (const p of months) {
    const j = row(p.year);
    const i = p.month - 1;
    z[j]![i] = p.ret;
    label[j]![i] = cellLabel(p.ret);
    const name = `${MONTH_NAMES[i]} ${p.year}`;
    const note = !p.partial
      ? ''
      : p.year === first && p.month === months[0]!.month
        ? `<br><i>partial: from ${fmtDate(COMMON_START)} (SOXL's first day)</i>`
        : `<br><i>partial: to ${fmtDate(LAST_DATE)} (end of data)</i>`;
    hover[j]![i] = `${fund} · ${name}<br><b>${pct(p.ret, 1)}</b>${note}`;
  }
  const yearZ = ys.map((): (number | null)[] => [null]);
  const yearLabel = ys.map(() => ['']);
  const yearHover = ys.map(() => ['']);
  for (const p of years) {
    const j = row(p.year);
    yearZ[j]![0] = p.ret;
    yearLabel[j]![0] = cellLabel(p.ret);
    const note = !p.partial
      ? ''
      : p.year === first
        ? `<br><i>partial: from ${fmtDate(COMMON_START)}</i>`
        : `<br><i>year to date, to ${fmtDate(LAST_DATE)}</i>`;
    yearHover[j]![0] = `${fund} · ${p.year}<br><b>${pct(p.ret, 1)}</b>${note}`;
  }
  return { years: ys.map(String), z, label, hover, yearZ, yearLabel, yearHover };
}

function figure(fund: Fund, narrow: boolean): Record<string, unknown> {
  const g = grid(fund);
  const cell = { xgap: 2, ygap: 2, hoverongaps: false, textfont: { size: narrow ? 8 : 10 } };
  return {
    data: [
      {
        type: 'heatmap',
        name: fund,
        x: MONTH_NAMES,
        y: g.years,
        z: g.z,
        text: g.label,
        hovertext: g.hover,
        texttemplate: '%{text}',
        hovertemplate: '%{text}<extra></extra>',
        colorscale: RETURN_SCALE,
        zmin: -MONTH_CAP,
        zmax: MONTH_CAP,
        colorbar: {
          title: { text: 'Monthly<br>return' },
          tickvals: [-0.5, -0.25, 0, 0.25, 0.5],
          ticktext: ['≤ −50%', '−25%', '0%', '+25%', '≥ +50%'],
          thickness: 12,
          len: 0.9,
        },
        ...cell,
      },
      {
        type: 'heatmap',
        name: `${fund} yearly`,
        xaxis: 'x2',
        yaxis: 'y',
        x: ['Year'],
        y: g.years,
        z: g.yearZ,
        text: g.yearLabel,
        hovertext: g.yearHover,
        texttemplate: '%{text}',
        hovertemplate: '%{text}<extra></extra>',
        colorscale: RETURN_SCALE,
        zmin: -YEAR_CAP,
        zmax: YEAR_CAP,
        showscale: false,
        ...cell,
      },
    ],
    layout: {
      title: { text: narrow ? '' : `${fund} monthly returns, ${MONTH_RANGE}` },
      margin: { t: narrow ? 16 : 40, l: 44, r: narrow ? 56 : 72, b: 28 },
      xaxis: { domain: [0, 0.885], type: 'category', showgrid: false, ticks: '', fixedrange: true },
      xaxis2: {
        domain: [0.9, 1],
        anchor: 'y',
        type: 'category',
        showgrid: false,
        ticks: '',
        fixedrange: true,
      },
      yaxis: { type: 'category', showgrid: false, ticks: '', fixedrange: true },
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('TQQQ', narrow));
  fundPicker(toolbar, (fund) => void chart.react(figure(fund, narrow)), 'TQQQ');
  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
