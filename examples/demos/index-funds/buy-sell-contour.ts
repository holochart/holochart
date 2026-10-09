import {
  createChart,
  type Chart,
  type FigureInput,
  type LayoutAnnotation,
  type LayoutShape,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import {
  CALENDAR,
  DOWN,
  fmtDate,
  type Fund,
  LABEL,
  MONTH_SPANS,
  NEUTRAL,
  pct,
  PERIODS,
  returnBetween,
  UP,
} from './analysis.mts';
import { chartConfig, frame, fundPicker, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Any entry, any exit: the total return of a fund bought at one month-end close (x) and sold at a
 * later one (y), for every pair in the four years. A filled `contour` with a band every 10 points
 * and labelled lines; both axes count month-end closes (`tickvals` / `ticktext` name them), so only
 * the triangle above the diagonal has data: `z` is `null` where the sale would come before the
 * purchase, and the trace leaves that corner empty. The diverging scale has its neutral color at 0
 * and the same slope both ways, cut off where the data ends (`zmin` / `zmax` with a colorscale
 * built to match), and a second `contour` with `coloring: 'none'` and a single level draws the
 * break-even line around the pairs that lost money. Dotted lines mark the split on both axes,
 * which divides the triangle into "both in the first half", "bought in the first, sold in the
 * second" and "both in the second". The empty corner holds the tally. The toolbar toggle swaps the
 * fund with `chart.react`.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: any entry, any exit',
  description:
    'Contour map of the total return of SPY, QQQ, DIA or IWM for every pair of month-end purchase and sale between September 2022 and September 2026.',
  tags: ['demo', 'contour', 'labels', 'colorscale', 'gaps', 'shapes', 'react', 'financial'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

/**
 * The 49 month-end closes, as indexes in `CALENDAR`: close 0 is the base (Sep 30, 2022), close `k`
 * the end of the `k`th month. Both axes count closes, so the diagonal is "sold when bought".
 */
const CLOSES = [MONTH_SPANS[0]!.from, ...MONTH_SPANS.map((m) => m.to)];
const N = MONTH_SPANS.length;
/** The 48 closes to buy at (all but the last) and the 48 to sell at (all but the first). */
const BUY = CLOSES.map((_, k) => k).slice(0, N);
const SELL = CLOSES.map((_, k) => k).slice(1);
/** The close the halves meet at. */
const SPLIT_AT = MONTH_SPANS.findIndex((m) => m.half === 'second');
const STEP = 0.1;

/** Close `k` as `'Sep 30, 2024'`, and as `'Sep 2024'` (a month's last session is in that month). */
const dateOf = (k: number): string => fmtDate(CALENDAR[CLOSES[k] as number] as string);
const monthOf = (k: number): string => `${dateOf(k).slice(0, 3)} ${dateOf(k).slice(-4)}`;
const count = (n: number): string => n.toLocaleString('en-US');

/** A color between two `#rrggbb` colors, `t` of the way from `a` to `b`. */
function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, k: number): number =>
    Number.parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16);
  const c = [0, 1, 2].map((k) => Math.round(ch(a, k) + (ch(b, k) - ch(a, k)) * t));
  return `rgb(${c.join(', ')})`;
}

function figure(fund: Fund, narrow: boolean): FigureInput {
  const z = SELL.map((to) =>
    BUY.map((from) =>
      to > from ? returnBetween(fund, CLOSES[from] as number, CLOSES[to] as number) : null,
    ),
  );
  const pairs = SELL.flatMap((sell, j) =>
    BUY.flatMap((buy, i) => {
      const r = z[j]?.[i];
      return r === null || r === undefined ? [] : [{ r, buy, sell }];
    }),
  );
  const best = pairs.reduce((a, b) => (b.r > a.r ? b : a));
  const worst = pairs.reduce((a, b) => (b.r < a.r ? b : a));
  const gained = pairs.filter((p) => p.r > 0).length;

  // The scale: neutral at 0, the same slope both ways, cut off at the data's ends.
  const lo = Math.floor(worst.r / STEP) * STEP;
  const hi = Math.ceil(best.r / STEP) * STEP;
  const reach = Math.max(-lo, hi);
  const colorscale: [number, string][] = [
    [0, mix(NEUTRAL, DOWN, -lo / reach)],
    [-lo / (hi - lo), NEUTRAL],
    [1, mix(NEUTRAL, UP, hi / reach)],
  ];
  const ticks: number[] = [];
  for (let k = Math.round(lo / STEP); k <= Math.round(hi / STEP); k++) {
    if (k % (hi > 1.5 ? 4 : 2) === 0) ticks.push(k * STEP);
  }

  // A tick every six months (every twelve on phones), on both axes.
  const ticksAt = CLOSES.map((_, k) => k).filter((k) => k % (narrow ? 12 : 6) === 0);

  const splitLine = (vertical: boolean): LayoutShape => ({
    type: 'line',
    xref: vertical ? 'x' : 'x domain',
    yref: vertical ? 'y domain' : 'y',
    x0: vertical ? SPLIT_AT : 0,
    x1: vertical ? SPLIT_AT : 1,
    y0: vertical ? 0 : SPLIT_AT,
    y1: vertical ? 1 : SPLIT_AT,
    line: { color: LOOK.title, width: 1, dash: 'dot' },
  });
  const note = (text: string, extra: Partial<LayoutAnnotation>): LayoutAnnotation => ({
    xref: 'x',
    yref: 'y',
    showarrow: false,
    text,
    font: { size: narrow ? 8 : 10, color: LOOK.title },
    bgcolor: 'rgba(10, 10, 15, 0.55)',
    borderpad: 3,
    ...extra,
  });
  const first = `<span style="color:${PERIODS.first.color}">${PERIODS.first.short}</span>`;
  const second = `<span style="color:${PERIODS.second.color}">${PERIODS.second.short}</span>`;

  return {
    data: [
      {
        type: 'contour',
        name: fund,
        x: BUY,
        y: SELL,
        z,
        hovertext: SELL.map((sell, j) =>
          BUY.map((buy, i) =>
            sell > buy
              ? `<b>${fund}</b> bought at the close of ${dateOf(buy)},<br>` +
                `sold at the close of ${dateOf(sell)}: <b>${pct(z[j]?.[i] ?? 0, 1)}</b>`
              : '',
          ),
        ),
        zmin: lo,
        zmax: hi,
        colorscale,
        autocontour: false,
        contours: {
          coloring: 'fill',
          start: lo,
          end: hi,
          size: STEP,
          showlabels: !narrow,
          labelformat: '+.0%',
          labelfont: { size: 9, color: LOOK.title },
        },
        line: { width: 0.75, color: 'rgba(10, 10, 15, 0.45)' },
        colorbar: {
          title: { text: 'Total return', side: 'right' },
          tickvals: ticks,
          ticktext: ticks.map((v) => (Math.abs(v) < 1e-9 ? '0%' : pct(v))),
          thickness: 12,
        },
        hovertemplate: '%{hovertext}<extra></extra>',
      },
      {
        type: 'contour',
        name: 'break-even',
        x: BUY,
        y: SELL,
        z,
        autocontour: false,
        contours: { coloring: 'none', start: 0, end: 0, size: 1 },
        line: { color: LOOK.title, width: 1.5, dash: 'dash' },
        showscale: false,
        showlegend: false,
        hoverinfo: 'skip',
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `${fund} · ${LABEL[fund]}: ${count(gained)} of ${count(pairs.length)} month-end entry and exit pairs gained`,
      },
      hovermode: 'closest',
      showlegend: false,
      margin: { t: narrow ? 16 : 44, r: narrow ? 56 : 84, b: 52 },
      xaxis: {
        title: { text: 'Bought at the close of' },
        range: [0, N],
        tickvals: ticksAt,
        ticktext: ticksAt.map((k) => monthOf(k).replace(' ', '<br>')),
        showgrid: false,
        zeroline: false,
      },
      yaxis: {
        title: { text: 'Sold at the close of' },
        range: [0, N],
        tickvals: ticksAt,
        ticktext: ticksAt.map(monthOf),
        showgrid: false,
        zeroline: false,
      },
      shapes: [splitLine(true), splitLine(false)],
      annotations: [
        note(narrow ? `both in ${first}` : `bought and sold in ${first}`, {
          x: 0,
          y: SPLIT_AT,
          xanchor: 'left',
          yanchor: 'top',
          xshift: 8,
          yshift: -8,
        }),
        note(narrow ? `${first} → ${second}` : `bought in ${first}, sold in ${second}`, {
          x: 0,
          y: SPLIT_AT,
          xanchor: 'left',
          yanchor: 'bottom',
          xshift: 8,
          yshift: 8,
        }),
        note(narrow ? `both in ${second}` : `bought and sold in ${second}`, {
          x: SPLIT_AT,
          y: N,
          xanchor: 'left',
          yanchor: 'top',
          xshift: 8,
          yshift: -8,
        }),
        ...(narrow
          ? []
          : [
              note(
                `<b>${count(pairs.length)} pairs of month-end closes</b><br>` +
                  `${count(gained)} gained, ${count(pairs.length - gained)} lost (inside the dashed lines)<br>` +
                  `best: ${monthOf(best.buy)} → ${monthOf(best.sell)}  <b>${pct(best.r, 1)}</b><br>` +
                  `worst: ${monthOf(worst.buy)} → ${monthOf(worst.sell)}  <b>${pct(worst.r, 1)}</b>`,
                {
                  xref: 'x domain',
                  yref: 'y domain',
                  x: 0.98,
                  y: 0.06,
                  xanchor: 'right',
                  yanchor: 'bottom',
                  align: 'right',
                  bgcolor: 'rgba(0, 0, 0, 0)',
                  font: { size: 10, color: LOOK.text },
                },
              ),
            ]),
      ],
    },
    config: chartConfig(narrow),
  };
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  const chart: Chart = createChart(chartEl, figure('SPY', narrow));
  fundPicker(toolbar, (fund) => void chart.react(figure(fund, narrow)));

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
