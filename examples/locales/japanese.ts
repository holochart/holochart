import { componentsReady, createChart, register } from '@mk7s/holochart';
import { ja } from '@mk7s/holochart-locales';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A Japanese locale (plan E17.6): month names (`1月`), weekday names in the hover template and the
 * modebar titles come from plotly.js's `ja` locale. The built-in default font has no CJK glyphs:
 * troika draws them with its unicode fallback fonts (Noto, fetched from a CDN unless
 * `configureText({ unicodeFontsURL })` points at a self-hosted copy), or register a CJK family
 * with `fonts.register` and name it in `layout.font.family`. Depending on those fonts, this
 * example is not visually tested.
 */
export const meta: ExampleMeta = {
  title: 'Locales: Japanese',
  description:
    'Monthly sales with config.locale "ja": Japanese month names on the date axis and CJK titles drawn with fallback fonts.',
  tags: ['locales', 'bar', 'date', 'config', 'no-visual-test'],
};

const SALES = [182, 175, 210, 238, 251, 244, 262, 270, 233, 229, 247, 301];

export function run(el: HTMLElement): ExampleHandle {
  register(ja);
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        x: SALES.map((_, i) => Date.UTC(2024, i, 1)),
        y: SALES,
        hovertemplate: '%{x|%Y年%B}<br>%{y}百万円<extra></extra>',
      },
    ],
    layout: {
      title: { text: '月間売上高（2024年）' },
      xaxis: { type: 'date', tickformat: '%b', dtick: 'M1' },
      yaxis: { title: { text: '百万円' } },
    },
    config: { locale: 'ja' },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
