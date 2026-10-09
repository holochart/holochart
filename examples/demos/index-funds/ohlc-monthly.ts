import { createChart, type Chart, type LayoutAnnotation, type LayoutShape } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  BASE_DATE,
  COLOR,
  CORE,
  DOWN,
  fmtDate,
  LABEL,
  OHLCV,
  pct,
  resample,
  type Traded,
  UP,
} from './analysis.mts';
import { chartConfig, frame, halfLabels, halfShapes, isNarrow, LOOK, settled } from './ui.mts';

/**
 * The four years as 48 monthly `ohlc` bars per fund, in 2 × 2 small multiples: each panel has its
 * own x and y axis (`xaxis2` … `xaxis4`, placed by `domain`), and `xperiod: 'M1'` with
 * `xperiodalignment: 'middle'` centers every bar in its month. The left tick is the month's open
 * and the right tick its close; bars that closed above their open are green, the others red. The
 * halves' bands and the split line are drawn per panel (`halfShapes` with the panel's `xref` and
 * `yref`), and a caption in each panel counts the months that closed up. Prices are as traded:
 * split-adjusted, not dividend-adjusted.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: monthly OHLC bars of the four funds',
  description:
    'Monthly open-high-low-close bars of SPY, QQQ, DIA and IWM from October 2022 to September 2026 as 2 × 2 small multiples, with the two halves marked.',
  tags: ['demo', 'ohlc', 'subplots', 'small multiples', 'date', 'period', 'shapes', 'financial'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // Panel k: column k % 2, row ⌊k / 2⌋ from the top.
  const gapX = narrow ? 0.16 : 0.09;
  const gapY = 0.16;
  const xDomain = (k: number): [number, number] =>
    k % 2 === 0 ? [0, (1 - gapX) / 2] : [(1 + gapX) / 2, 1];
  const yDomain = (k: number): [number, number] =>
    k < 2 ? [(1 + gapY) / 2, 1] : [0, (1 - gapY) / 2];
  const id = (axis: 'x' | 'y', k: number): string => (k === 0 ? axis : `${axis}${k + 1}`);
  const layoutKey = (axis: 'x' | 'y', k: number): string =>
    k === 0 ? `${axis}axis` : `${axis}axis${k + 1}`;

  const data: Record<string, unknown>[] = [];
  const axes: Record<string, unknown> = {};
  const shapes: LayoutShape[] = [];
  const annotations: LayoutAnnotation[] = [];

  CORE.forEach((fund, k) => {
    const t = fund as Traded;
    const m = resample(OHLCV[t], 'month');
    const previous = [OHLCV[t].close[0] as number, ...m.close.slice(0, -1)];
    const change = m.close.map((c, i) => c / (previous[i] as number) - 1);
    const up = m.close.filter((c, i) => c >= (m.open[i] as number)).length;
    const x = id('x', k);
    const y = id('y', k);
    data.push({
      type: 'ohlc',
      name: t,
      xaxis: x,
      yaxis: y,
      x: [...m.date],
      open: [...m.open],
      high: [...m.high],
      low: [...m.low],
      close: [...m.close],
      customdata: change,
      xperiod: 'M1',
      xperiodalignment: 'middle',
      increasing: { line: { color: UP, width: 1.5 } },
      decreasing: { line: { color: DOWN, width: 1.5 } },
      hovertemplate:
        `<b>${t}</b> %{x|%b %Y}<br>Open %{open:$.2f}  High %{high:$.2f}<br>` +
        'Low %{low:$.2f}  Close %{close:$.2f}<br>Month %{customdata:+.1%}<extra></extra>',
    });
    axes[layoutKey('x', k)] = {
      type: 'date',
      domain: xDomain(k),
      anchor: y,
      rangeslider: { visible: false },
      dtick: narrow ? 'M24' : 'M12',
      tickformat: '%Y',
      ticklabelmode: 'period',
    };
    axes[layoutKey('y', k)] = {
      domain: yDomain(k),
      anchor: x,
      tickprefix: '$',
      nticks: 5,
    };
    shapes.push(...halfShapes(x, `${y} domain`));
    const first = previous[0] as number;
    const last = m.close.at(-1) as number;
    annotations.push(
      {
        // Panel heading, above the panel's top left corner.
        xref: `${x} domain`,
        yref: `${y} domain`,
        x: 0,
        y: 1,
        xanchor: 'left',
        yanchor: 'bottom',
        yshift: 3,
        text: narrow
          ? `<b>${t}</b>`
          : `<b>${t}</b>  <span style="color:${LOOK.text}">${LABEL[t]}</span>`,
        showarrow: false,
        font: { color: COLOR[t], size: 12 },
      },
      {
        // What the bars add up to, above the panel's top right corner.
        xref: `${x} domain`,
        yref: `${y} domain`,
        x: 1,
        y: 1,
        xanchor: 'right',
        yanchor: 'bottom',
        yshift: 3,
        text: narrow
          ? `${up} of ${m.date.length} up`
          : `${up} of ${m.date.length} months up · price ${pct(last / first - 1)}`,
        showarrow: false,
        font: { size: 10 },
      },
    );
    if (k === 0 && !narrow) annotations.push(...halfLabels(x, `${y} domain`));
  });

  const chart: Chart = createChart(chartEl, {
    data,
    layout: {
      title: {
        text: narrow
          ? ''
          : `Monthly bars since the close of ${fmtDate(BASE_DATE)}: open, high, low, close`,
      },
      showlegend: false,
      hovermode: 'closest',
      margin: { t: narrow ? 32 : 72, r: 16, b: 32 },
      ...axes,
      shapes,
      annotations,
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
