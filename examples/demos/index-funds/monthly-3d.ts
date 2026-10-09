import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  CORE,
  LABEL,
  MONTH_SPANS,
  monthlyReturns,
  pct,
  PERIODS,
  RETURN_SCALE,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * The monthly returns of the heatmap as a landscape of 3D bars (`bar3d`, a Holochart extension):
 * the 48 months across, the four core funds in depth, each bar as tall as the month's return,
 * rising for gains and sinking below the zero plane for losses. Bars are colored by height through
 * the diverging `RETURN_SCALE` (`marker.colorscale` with no color array, `cmin` / `cmax` capped at
 * ±12%). The month axis is numeric with a labelled tick each October (`tickvals` / `ticktext`), so
 * the tick in the middle is the first month of the second half. Hover (a `hovertemplate` reading
 * each bar's `text`) names the fund, the month and its half; drag to orbit.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: monthly returns in 3D',
  description:
    'Every monthly return of SPY, QQQ, DIA and IWM from October 2022 to September 2026 as 3D bars over a fund × month grid, colored by return.',
  tags: ['demo', 'bar3d', '3d', 'bar', 'colorscale', 'colorbar', 'financial'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

const CAP = 0.12;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const cells = CORE.flatMap((t) =>
    monthlyReturns(t).map((r, i) => ({ t, i, r, span: MONTH_SPANS[i]! })),
  );
  const away = narrow ? 1.75 : 1;
  const best = cells.reduce((a, b) => (b.r > a.r ? b : a));
  const worst = cells.reduce((a, b) => (b.r < a.r ? b : a));
  // A tick at each October: the start of the four years, of each year in between, and of the
  // second half.
  const octobers = MONTH_SPANS.map((m, i) => ({ m, i })).filter(({ m }) =>
    m.label.startsWith('Oct'),
  );

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'bar3d',
        name: 'Monthly return',
        x: cells.map((c) => c.i),
        y: cells.map((c) => c.t),
        z: cells.map((c) => c.r),
        text: cells.map(
          (c) =>
            `<b>${c.t}</b> · ${LABEL[c.t]}<br>${c.span.label}: <b>${pct(c.r, 1)}</b><br>` +
            `<i>${PERIODS[c.span.half].short}</i>`,
        ),
        hovertemplate: '%{text}<extra></extra>',
        width: 0.72,
        depth: 0.5,
        marker: {
          colorscale: RETURN_SCALE,
          cmin: -CAP,
          cmax: CAP,
          showscale: true,
          colorbar: {
            title: { text: 'Monthly<br>return' },
            tickvals: [-0.12, -0.06, 0, 0.06, 0.12],
            ticktext: ['≤ −12%', '−6%', '0%', '+6%', '≥ +12%'],
            thickness: narrow ? 8 : 12,
            len: 0.6,
          },
          line: { width: 0.5 },
        },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `Monthly returns: best ${best.t} ${best.span.label} ${pct(best.r, 1)}, worst ${worst.t} ${worst.span.label} ${pct(worst.r, 1)}`,
      },
      margin: { t: narrow ? 8 : 36, l: 0, r: 0, b: 0 },
      scene: {
        // Phones: a shorter month axis seen from further away, so the whole grid fits the width.
        camera: {
          eye: { x: 0.44 * away, y: -1.7 * away, z: 0.76 * away },
          center: { x: narrow ? -0.2 : 0.03, y: 0, z: -0.1 },
        },
        aspectmode: 'manual',
        aspectratio: { x: narrow ? 1.5 : 2.1, y: 0.6, z: 0.6 },
        xaxis: {
          title: { text: '' },
          range: [-1, MONTH_SPANS.length + 3],
          tickvals: octobers.map(({ i }) => i),
          ticktext: octobers.map(({ m }) => m.label),
        },
        yaxis: {
          title: { text: '' },
          type: 'category',
          categoryorder: 'array',
          categoryarray: [...CORE],
        },
        zaxis: { title: { text: 'Return' }, tickformat: '.0%', dtick: 0.05 },
      },
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
