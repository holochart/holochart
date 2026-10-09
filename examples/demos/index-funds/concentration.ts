import { createChart, type Chart, type LayoutAnnotation, type PieTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, fmtDate, HOLDINGS, LABEL, topShare } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * How concentrated the two best-known indexes are: one donut per fund (`pie` with `hole`, placed
 * side by side through `domain`), the ten largest holdings as slices in a ramp of the fund's hue
 * (largest lightest) and everything else as one gray slice: the other 494 stocks of the S&P 500,
 * the other 20 of the Dow. The share of the fund in its ten largest holdings (`topShare`) is
 * written in the hole of each donut with annotations. Slices keep the holdings' order
 * (`sort: false`, clockwise from the top), labels sit outside the ring, and the hover text names
 * the company (`customdata`).
 */
export const meta: ExampleMeta = {
  title: 'Index funds: how much is in the ten largest holdings',
  description:
    'Two donuts: the ten largest holdings of SPY and of DIA against the rest of each fund, with the top-ten share in the middle.',
  tags: ['demo', 'pie', 'donut', 'domain', 'annotations', 'hover', 'financial'],
  size: { width: 960, height: 440 },
  testTolerance: 0.004,
};

const TOP = 10;
const REST_COLOR = '#4b4f60';
const FUNDS = ['SPY', 'DIA'] as const;
type Held = (typeof FUNDS)[number];

/** A color between two `#rrggbb` colors (`t` from 0 to 1). */
function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, k: number): number =>
    Number.parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16);
  const out = [0, 1, 2].map((k) => Math.round(ch(a, k) + (ch(b, k) - ch(a, k)) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
/** `n` shades of one hue, from light to dark, all apart from the gray of the rest. */
function ramp(hue: string, n: number): string[] {
  const light = mix(hue, '#ffffff', 0.45);
  const dark = mix(hue, '#000000', 0.45);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return t < 0.5 ? mix(light, hue, t * 2) : mix(hue, dark, t * 2 - 1);
  });
}

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // Side by side; stacked on a phone.
  const domain = (k: number): { x: [number, number]; y: [number, number] } =>
    narrow
      ? { x: [0.12, 0.88], y: k === 0 ? [0.53, 0.91] : [0.02, 0.4] }
      : { x: k === 0 ? [0.06, 0.44] : [0.56, 0.94], y: [0.05, 0.88] };

  const traces = FUNDS.map((fund, k): PieTrace => {
    const { holdings } = HOLDINGS[fund];
    const top = holdings.slice(0, TOP);
    const rest = holdings.slice(TOP);
    const restWeight = rest.reduce((a, h) => a + h.weight, 0);
    const restLabel = `The other ${rest.length}`;
    return {
      type: 'pie',
      name: fund,
      labels: [...top.map((h) => h.ticker), restLabel],
      values: [...top.map((h) => h.weight), restWeight],
      text: [
        ...top.map((h) => `${h.ticker} ${h.weight.toFixed(1)}%`),
        `${restLabel}<br>${restWeight.toFixed(1)}%`,
      ],
      customdata: [
        ...top.map((h) => h.name),
        `${rest.length} stocks, ${(restWeight / rest.length).toFixed(2)}% each on average`,
      ],
      textinfo: 'text',
      textposition: 'outside',
      textfont: { size: narrow ? 9 : 10, color: LOOK.text },
      hole: 0.6,
      sort: false,
      direction: 'clockwise',
      domain: domain(k),
      marker: {
        colors: [...ramp(COLOR[fund], TOP), REST_COLOR],
        line: { color: LOOK.bg, width: 1.5 },
      },
      hovertemplate: `<b>%{label}</b><br>%{customdata}<br>%{value:.2f}% of ${fund}<extra></extra>`,
    };
  });

  const center = (fund: Held, k: number): LayoutAnnotation[] => {
    const d = domain(k);
    const at = {
      xref: 'paper',
      yref: 'paper',
      x: (d.x[0] + d.x[1]) / 2,
      y: (d.y[0] + d.y[1]) / 2,
      xanchor: 'center',
      showarrow: false,
    } as const;
    return [
      {
        ...at,
        yanchor: 'bottom',
        text: `<b>${topShare(fund, TOP).toFixed(1)}%</b>`,
        font: { size: narrow ? 20 : 26, color: LOOK.title },
      },
      {
        ...at,
        yanchor: 'top',
        text: `of ${fund} is in its<br>${TOP} largest holdings`,
        font: { size: narrow ? 9 : 11, color: LOOK.text },
      },
    ];
  };
  const caption = (fund: Held, k: number): LayoutAnnotation => {
    const d = domain(k);
    return {
      xref: 'paper',
      yref: 'paper',
      x: (d.x[0] + d.x[1]) / 2,
      y: d.y[1],
      xanchor: 'center',
      yanchor: 'bottom',
      yshift: 14,
      showarrow: false,
      text: `<b>${LABEL[fund]}</b> (${fund}): ${HOLDINGS[fund].holdings.length} stocks`,
      font: { size: narrow ? 10 : 12, color: COLOR[fund] },
    };
  };

  const chart: Chart = createChart(chartEl, {
    data: traces,
    layout: {
      title: {
        text: narrow
          ? ''
          : `The ten largest holdings of the S&P 500 and of the Dow (${fmtDate(HOLDINGS.SPY.asOf)})`,
      },
      showlegend: false,
      margin: { t: narrow ? 16 : 64, l: 10, r: 10, b: 10 },
      annotations: FUNDS.flatMap((fund, k) => [caption(fund, k), ...center(fund, k)]),
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
