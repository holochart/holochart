import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { fmtDate } from './analysis.mts';
import { authorColor, INDUSTRY, type IndustryPoint } from './datasets.mts';
import { chartConfig, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Token volumes that AI providers have announced (demo page `demos/openrouter`): one
 * `lines+markers` trace per provider, every figure converted to trillion tokens per day so the
 * series share a log y axis on dates. Scopes differ (all of Google's products, API-only figures,
 * China's national total), so the chart is about slopes, not levels. Annotations with arrows mark
 * a few milestones; on a log axis their `y` is the exponent, as in Plotly.
 */
export const meta: ExampleMeta = {
  title: 'Announced token volumes by provider',
  description:
    'Published token-volume figures of several providers, converted to tokens per day, as lines with markers on a log axis with annotated milestones.',
  tags: ['demo', 'line', 'scatter', 'log', 'date', 'annotations', 'hover'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

/** Series colors: the demo's author colors where the provider is also a model author. */
const COLORS: Record<string, string> = {
  'OpenRouter (platform)': LOOK.colorway[0],
  'Google (all products)': authorColor('google'),
  'Google (customer API)': authorColor('google'),
  'OpenAI (API)': authorColor('openai'),
  'Microsoft (Azure AI Foundry)': LOOK.colorway[1],
  'ByteDance (Doubao / Volcano Engine)': LOOK.colorway[2],
  'China (national total)': LOOK.colorway[3],
  'Fireworks AI': LOOK.colorway[4],
};

/** `0.0014T`, `4.0T`, `180T` per day. */
const perDay = (v: number): string =>
  v >= 10 ? `${Math.round(v)}T` : v >= 1 ? `${v.toFixed(1)}T` : `${+v.toPrecision(2)}T`;

/** A figure in its own unit: `9.7 trillion tokens per month`. */
const asAnnounced = (p: IndustryPoint, unit: string): string =>
  `${p.value.toLocaleString('en-US')} ${unit}`;

const host = (url: string): string => new URL(url).hostname.replace(/^www\./, '');

/** Milestones to annotate: series, date of the point, label, arrow offset. */
const MILESTONES: { series: string; date: string; text: string; ax: number; ay: number }[] = [
  {
    series: 'Google (all products)',
    date: '2025-10-09',
    text: 'Google: 1.3 quadrillion<br>tokens a month',
    ax: -70,
    ay: -26,
  },
  {
    series: 'China (national total)',
    date: '2025-12-31',
    text: 'China: 100T a day',
    ax: 40,
    ay: 30,
  },
  {
    series: 'OpenRouter (platform)',
    date: '2026-05-26',
    text: 'OpenRouter: 25T a week<br>(Series B)',
    ax: -30,
    ay: 36,
  },
];

export function run(el: HTMLElement): ExampleHandle {
  const narrow = isNarrow(el);
  const series = INDUSTRY.map((s) => ({
    ...s,
    points: [...s.points].sort((a, b) => a.date.localeCompare(b.date)),
  }));

  const annotations = MILESTONES.flatMap((m) => {
    const point = series.find((s) => s.name === m.series)?.points.find((p) => p.date === m.date);
    if (!point) return [];
    return [
      {
        x: point.date,
        y: Math.log10(point.perDayT),
        xref: 'x',
        yref: 'y',
        text: m.text,
        showarrow: true,
        arrowwidth: 1,
        arrowhead: 0,
        ax: m.ax,
        ay: m.ay,
        font: { color: LOOK.text, size: 9 },
      },
    ];
  });

  const chart = createChart(el, {
    data: series.map((s) => ({
      type: 'scatter',
      mode: 'lines+markers',
      name: s.name,
      x: s.points.map((p) => p.date),
      y: s.points.map((p) => p.perDayT),
      line: {
        color: COLORS[s.name] ?? LOOK.tick,
        width: s.name.startsWith('OpenRouter') ? 2 : 1.25,
        dash: s.name === 'Google (customer API)' ? 'dot' : 'solid',
      },
      marker: { size: s.name.startsWith('OpenRouter') ? 6 : 5 },
      customdata: s.points.map((p) => [
        fmtDate(p.date, { month: 'short', day: 'numeric', year: 'numeric' }),
        asAnnounced(p, s.unit),
        perDay(p.perDayT),
        host(p.source),
      ]),
      hovertemplate:
        '<b>%{fullData.name}</b><br>%{customdata[0]}<br>%{customdata[1]}<br>' +
        '≈ %{customdata[2]} tokens a day<br>Source: %{customdata[3]}<extra></extra>',
    })),
    layout: {
      title: { text: narrow ? '' : 'Announced token volumes, trillion tokens per day (log scale)' },
      hovermode: 'closest',
      legend: { tracegroupgap: 4 },
      margin: { t: narrow ? 90 : 64 },
      xaxis: { type: 'date', tickformat: "%b '%y" },
      yaxis: {
        type: 'log',
        tickmode: 'array',
        tickvals: [0.001, 0.01, 0.1, 1, 10, 100, 1000],
        ticktext: ['1B', '10B', '100B', '1T', '10T', '100T', '1,000T'],
        title: { text: 'Tokens per day' },
      },
      annotations: narrow ? [] : annotations,
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
