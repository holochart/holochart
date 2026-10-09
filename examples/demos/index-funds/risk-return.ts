import { createChart, type Chart, type ScatterTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  ETFS,
  GROUP_COLOR,
  groupOf,
  HALVES,
  LABEL,
  pct,
  PERIODS,
  share,
  stats,
  type Group,
  type Half,
  type Stats,
  type Ticker,
} from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Risk and return of all 27 ETFs in each half: one bubble per fund at its annualized volatility
 * (x) and annualized return (y), sized by the half's deepest drawdown and labelled with its
 * ticker, one trace per group (main index funds, style funds, sector funds, other asset classes)
 * so the legend names the colors. Animated with two `frames` (2022–24 and 2024–26), a Play button
 * (`updatemenus`) and a two-step slider; `ids` match each fund's bubble across the frames so it
 * glides from one half to the other. Behind them, every fund in both halves as a faint dot, so the
 * still picture already shows where the bubbles are headed. The axis ranges are fixed and cover
 * both halves. Each label goes on the side of its bubble where it covers the least (a per-point
 * `textposition`, worked out for each frame).
 */
export const meta: ExampleMeta = {
  title: 'Index funds: risk and return of 27 ETFs, half by half',
  description:
    'Animated bubbles of annualized return against volatility for 27 ETFs in 2022–24 and 2024–26, sized by max drawdown and colored by group, with play and a slider.',
  tags: ['demo', 'bubble', 'scatter', 'animation', 'frames', 'sliders', 'updatemenus', 'financial'],
  size: { width: 960, height: 540 },
  testTolerance: 0.004,
};

const GROUPS: readonly { key: Group; name: string }[] = [
  { key: 'fund', name: 'Main index funds' },
  { key: 'style', name: 'Size and style' },
  { key: 'sector', name: 'S&P 500 sectors' },
  { key: 'asset', name: 'Other asset classes' },
];
/** Bubble diameter of a 30% drawdown, in px (sized by area). */
const MAX_SIZE = 30;
const SIZEREF = 0.3 / MAX_SIZE ** 2;
const X_RANGE = [0, 0.29] as const;
const Y_RANGE = [-0.11, 0.46] as const;
const Y_TICKS = [-0.1, 0, 0.1, 0.2, 0.3, 0.4];

type Rect = [left: number, top: number, right: number, bottom: number];
const overlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const POSITIONS = [
  'top center',
  'middle right',
  'bottom center',
  'middle left',
  'top right',
  'bottom right',
  'top left',
  'bottom left',
] as const;

/**
 * A `textposition` per bubble: the side where its label covers the least of the other bubbles and
 * of the other labels, found by placing the labels in turn and then revisiting each a few times.
 * `x`, `y` and `r` are in px, `w` is the label's width; the plot is `width` × `height` px.
 */
function placeLabels(
  points: readonly { x: number; y: number; r: number; w: number }[],
  width: number,
  height: number,
): string[] {
  const h = 11;
  const bubbles = points.map((p): Rect => [p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r]);
  const candidates = points.map((p): Rect[] => {
    const d = p.r + 2;
    const k = p.r * 0.7 + 1;
    return [
      [p.x - p.w / 2, p.y - d - h, p.x + p.w / 2, p.y - d],
      [p.x + d, p.y - h / 2, p.x + d + p.w, p.y + h / 2],
      [p.x - p.w / 2, p.y + d, p.x + p.w / 2, p.y + d + h],
      [p.x - d - p.w, p.y - h / 2, p.x - d, p.y + h / 2],
      [p.x + k, p.y - k - h, p.x + k + p.w, p.y - k],
      [p.x + k, p.y + k, p.x + k + p.w, p.y + k + h],
      [p.x - k - p.w, p.y - k - h, p.x - k, p.y - k],
      [p.x - k - p.w, p.y + k, p.x - k, p.y + k + h],
    ];
  });
  const chosen: (number | undefined)[] = points.map(() => undefined);
  for (let pass = 0; pass < 4; pass++) {
    points.forEach((_, i) => {
      let best = 0;
      let bestCost = Infinity;
      (candidates[i] as Rect[]).forEach((c, k) => {
        const outside = c[0] < 0 || c[1] < 0 || c[2] > width || c[3] > height ? 1e4 : 0;
        let cost = k + outside;
        bubbles.forEach((b, j) => {
          if (j !== i) cost += 2 * overlap(c, b);
          const other = chosen[j];
          if (j !== i && other !== undefined)
            cost += 4 * overlap(c, (candidates[j] as Rect[])[other] as Rect);
        });
        if (cost < bestCost) {
          best = k;
          bestCost = cost;
        }
      });
      chosen[i] = best;
    });
  }
  return chosen.map((k) => POSITIONS[k ?? 0] as string);
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const table = new Map<Half, Map<Ticker, Stats>>(
    HALVES.map((half) => [half, new Map(ETFS.map((t) => [t, stats(t, half)]))]),
  );
  const at = (t: Ticker, half: Half): Stats => table.get(half)?.get(t) as Stats;
  const members = (group: Group): Ticker[] => ETFS.filter((t) => groupOf(t) === group);

  // Label sides, worked out in approximate plot pixels for each half.
  const plotW = Math.max(240, chartEl.clientWidth - 72);
  const plotH = Math.max(160, chartEl.clientHeight - 200);
  const fontSize = narrow ? 8 : 9;
  const sides = new Map<Half, Map<Ticker, string>>(
    HALVES.map((half) => {
      const positions = placeLabels(
        ETFS.map((t) => {
          const s = at(t, half);
          return {
            x: ((s.vol - X_RANGE[0]) / (X_RANGE[1] - X_RANGE[0])) * plotW,
            y: ((Y_RANGE[1] - s.cagr) / (Y_RANGE[1] - Y_RANGE[0])) * plotH,
            r: Math.max(3, Math.sqrt(Math.abs(s.maxDrawdown) / SIZEREF) / 2),
            w: t.length * fontSize * 0.68 + 2,
          };
        }),
        plotW,
        plotH,
      );
      return [half, new Map(ETFS.map((t, i) => [t, positions[i] as string]))];
    }),
  );

  /** The moving traces of one half: a bubble trace per group. */
  const moving = (half: Half): Record<string, unknown>[] =>
    GROUPS.map(({ key }) => {
      const tickers = members(key);
      const s = tickers.map((t) => at(t, half));
      return {
        x: s.map((v) => v.vol),
        y: s.map((v) => v.cagr),
        ids: tickers,
        text: tickers,
        textposition: tickers.map((t) => sides.get(half)?.get(t)),
        customdata: tickers.map((t, i) => [
          LABEL[t],
          PERIODS[half].label,
          pct((s[i] as Stats).cagr, 1),
          share((s[i] as Stats).vol, 1),
          pct((s[i] as Stats).maxDrawdown, 1),
        ]),
        marker: { size: s.map((v) => Math.abs(v.maxDrawdown)) },
      };
    });

  const first = moving('first');
  const bubbles = GROUPS.map(({ key, name }, k): ScatterTrace => ({
    type: 'scatter',
    mode: 'markers+text',
    name,
    ...first[k],
    textfont: { color: LOOK.title, size: fontSize },
    marker: {
      ...(first[k]?.['marker'] as object),
      color: GROUP_COLOR[key],
      opacity: 0.8,
      sizemode: 'area',
      sizeref: SIZEREF,
      sizemin: 3,
      line: { color: LOOK.title, width: 0.75 },
    },
    hovertemplate:
      '<b>%{text} · %{customdata[0]}</b><br>%{customdata[1]}<br>Return %{customdata[2]} a year' +
      '<br>Volatility %{customdata[3]}<br>Deepest drawdown %{customdata[4]}<extra></extra>',
  }));
  // Every fund in both halves as a faint dot: where each bubble comes from and where it goes.
  const ghosts = HALVES.map((half): ScatterTrace => ({
    type: 'scatter',
    mode: 'markers',
    name: `Every ETF, ${PERIODS[half].short}`,
    showlegend: false,
    x: ETFS.map((t) => at(t, half).vol),
    y: ETFS.map((t) => at(t, half).cagr),
    text: ETFS.map((t) => `${t} in ${PERIODS[half].short}`),
    marker: { color: ETFS.map((t) => GROUP_COLOR[groupOf(t)]), size: 5, opacity: 0.55 },
    hovertemplate: '%{text}: %{y:+.1%} a year on %{x:.1%} volatility<extra></extra>',
  }));

  const transition = 900;
  const chart: Chart = createChart(chartEl, {
    data: [...bubbles, ...ghosts],
    frames: HALVES.map((half) => ({ name: half, data: moving(half) })),
    layout: {
      title: { text: narrow ? '' : 'Return against volatility, one bubble per ETF and half' },
      hovermode: 'closest',
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      margin: { t: narrow ? 48 : 72, b: 112 },
      xaxis: {
        title: { text: 'Annualized volatility of daily returns' },
        range: [...X_RANGE],
        tickformat: '.0%',
        dtick: 0.05,
      },
      yaxis: {
        title: { text: 'Annualized return' },
        range: [...Y_RANGE],
        tickvals: Y_TICKS,
        ticktext: Y_TICKS.map((v) => (v === 0 ? '0%' : pct(v))),
        zeroline: true,
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.99,
          y: 0.02,
          xanchor: 'right',
          yanchor: 'bottom',
          showarrow: false,
          align: 'right',
          font: { size: 10, color: LOOK.tick },
          text: 'Bubble area: deepest drawdown in the half<br>Small dots: every ETF in the other half',
        },
      ],
      updatemenus: [
        {
          type: 'buttons',
          direction: 'left',
          showactive: false,
          x: 0,
          xanchor: 'left',
          y: -0.16,
          yanchor: 'top',
          pad: { t: 12 },
          buttons: [
            {
              label: 'Play',
              method: 'animate',
              args: [
                HALVES,
                {
                  mode: 'immediate',
                  frame: { duration: 1600, redraw: false },
                  transition: { duration: transition, easing: 'cubic-in-out' },
                },
              ],
            },
          ],
        },
      ],
      sliders: [
        {
          active: 0,
          x: 0.14,
          len: narrow ? 0.86 : 0.4,
          y: -0.16,
          yanchor: 'top',
          pad: { t: 12 },
          currentvalue: { prefix: 'Half: ', xanchor: 'left' },
          transition: { duration: transition, easing: 'cubic-in-out' },
          steps: HALVES.map((half) => ({
            label: narrow ? PERIODS[half].short : PERIODS[half].label,
            method: 'animate',
            args: [
              [half],
              {
                mode: 'immediate',
                frame: { duration: transition, redraw: false },
                transition: { duration: transition, easing: 'cubic-in-out' },
              },
            ],
          })),
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
