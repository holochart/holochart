import { componentsReady, createChart, register } from '@mk7s/holochart';
import { ar } from '@mk7s/holochart-locales';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Right-to-left text (plan E17.6): an Arabic title, Arabic month names from plotly.js's `ar`
 * locale (`tickformat: '%B'`) and a Hebrew axis title. The text engine (troika) orders
 * right-to-left runs with the Unicode bidi algorithm and joins Arabic letters (initial, medial and
 * final forms from the font), so mixed strings such as `مبيعات 2024` read correctly. The built-in
 * default font has no Arabic or Hebrew glyphs: they come from troika's unicode fallback fonts (a
 * CDN by default) or a registered family, so this example is not visually tested.
 */
export const meta: ExampleMeta = {
  title: 'Locales: right-to-left labels',
  description:
    'Arabic and Hebrew titles and Arabic month names (config.locale "ar"), laid out right to left with joined Arabic letters.',
  tags: ['locales', 'bar', 'text', 'config', 'no-visual-test'],
};

const VALUES = [42, 38, 51, 57, 63, 60, 71, 76, 68, 64, 59, 73];

export function run(el: HTMLElement): ExampleHandle {
  register(ar);
  const chart = createChart(el, {
    data: [
      {
        type: 'bar',
        x: VALUES.map((_, i) => Date.UTC(2024, i, 1)),
        y: VALUES,
        hovertemplate: '%{x|%B %Y}: %{y}<extra></extra>',
      },
    ],
    layout: {
      title: { text: 'المبيعات الشهرية 2024' },
      xaxis: { type: 'date', tickformat: '%B', dtick: 'M2' },
      yaxis: { title: { text: 'מכירות (אלפים)' } },
    },
    config: { locale: 'ar' },
  });

  return {
    ready: componentsReady(chart),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
