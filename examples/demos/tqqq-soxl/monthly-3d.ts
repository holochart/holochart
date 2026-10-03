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
 * The monthly returns of the calendar heatmap as a landscape of 3D bars (`bar3d`, a Holochart
 * extension): months across, years in depth, each bar as tall as the month's return, rising for
 * gains and sinking below the zero plane for losses. Bars are colored by height through the
 * diverging `RETURN_SCALE` (`marker.colorscale` with no color array, `cmin` / `cmax` capped at
 * ±50% so the extremes don't wash the rest out). The month axis keeps calendar order with
 * `categoryorder: 'array'` (the first year starts in March). Hover (a `hovertemplate` reading each
 * bar's `text`) names the month and flags the partial first and last months. A DOM toggle swaps
 * the fund with `chart.react`; drag to orbit.
 */
export const meta: ExampleMeta = {
  title: 'TQQQ and SOXL: monthly returns in 3D',
  description:
    'Every monthly return of TQQQ or SOXL since March 2010 as 3D bars over a year × month grid, colored by return.',
  tags: ['demo', 'bar3d', '3d', 'bar', 'colorscale', 'colorbar', 'react', 'financial'],
  size: { width: 960, height: 600 },
  testTolerance: 0.004,
};

const CAP = 0.5;

function figure(fund: Fund, narrow: boolean): Record<string, unknown> {
  const months = periodReturns(fund, 'month', COMMON_START);
  const first = months[0]!;
  const x = months.map((p) => MONTH_NAMES[p.month - 1]!);
  const y = months.map((p) => p.year);
  const z = months.map((p) => p.ret);
  const text = months.map((p) => {
    const note = !p.partial
      ? ''
      : p === first
        ? `<br><i>partial: from ${fmtDate(COMMON_START)} (SOXL's first day)</i>`
        : `<br><i>partial: to ${fmtDate(LAST_DATE)} (end of data)</i>`;
    return `${fund} · ${MONTH_NAMES[p.month - 1]} ${p.year}<br><b>${pct(p.ret, 1)}</b>${note}`;
  });
  const best = months.reduce((a, b) => (b.ret > a.ret ? b : a));
  const worst = months.reduce((a, b) => (b.ret < a.ret ? b : a));
  const name = (p: (typeof months)[number]): string => `${MONTH_NAMES[p.month - 1]} ${p.year}`;
  return {
    data: [
      {
        type: 'bar3d',
        name: fund,
        x,
        y,
        z,
        text,
        hovertemplate: '%{text}<extra></extra>',
        width: 0.7,
        depth: 0.7,
        marker: {
          colorscale: RETURN_SCALE,
          cmin: -CAP,
          cmax: CAP,
          showscale: true,
          colorbar: {
            title: { text: 'Monthly<br>return' },
            tickvals: [-0.5, -0.25, 0, 0.25, 0.5],
            ticktext: ['≤ −50%', '−25%', '0%', '+25%', '≥ +50%'],
            thickness: 12,
            len: 0.7,
          },
          line: { width: 0.5 },
        },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${fund} monthly returns since ${fmtDate(COMMON_START)}: best ${name(best)} ${pct(best.ret, 0)}, worst ${name(worst)} ${pct(worst.ret, 0)}`,
      },
      margin: { t: narrow ? 8 : 36, l: 0, r: 0, b: 0 },
      scene: {
        camera: { eye: { x: 0.3, y: -1.7, z: 0.85 }, center: { x: 0, y: 0.05, z: -0.2 } },
        aspectmode: 'manual',
        aspectratio: { x: 1.5, y: 1.2, z: 0.55 },
        xaxis: {
          title: { text: '' },
          type: 'category',
          categoryorder: 'array',
          categoryarray: MONTH_NAMES,
        },
        yaxis: { title: { text: '' }, dtick: 2, tickformat: 'd' },
        zaxis: { title: { text: 'Return' }, tickformat: '.0%', dtick: 0.5 },
      },
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('SOXL', narrow));
  fundPicker(toolbar, (fund) => void chart.react(figure(fund, narrow)), 'SOXL');
  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
