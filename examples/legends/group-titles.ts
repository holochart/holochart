import { createChart } from '@mk7s/holochart';
import { gaussian, rng } from '../_lib/rng.ts';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Legend group titles in a horizontal legend (plan E5.2): monthly electricity generation by
 * source, grouped by kind. Each trace names its `legendgroup`; the first trace of a group gives it
 * a heading (`legendgrouptitle.text`). In the default look's top legend, each group is a column
 * headed by its title (Plotly's grouped horizontal layout), and the columns flow left to right.
 *
 * Group titles use `legend.grouptitlefont` (by default the global font, 10% larger); here it is
 * brightened, and one group's title overrides it (`legendgrouptitle.font`). Every item has the
 * same text width (`legendwidth`), so the columns line up. Clicking a title toggles its whole
 * group (`groupclick: 'togglegroup'`, the default); the title fades when its group is hidden.
 */
export const meta: ExampleMeta = {
  title: 'Legend: group titles in a horizontal legend',
  description:
    'Generation by source, grouped by kind: legendgroup columns headed by legendgrouptitle, equal item widths (legendwidth), and a brighter grouptitlefont.',
  tags: ['legend', 'line', 'scatter'],
  size: { width: 720, height: 420 },
};

const SOURCES = [
  { name: 'Wind', group: 'renewable', base: 60, season: 18, color: '#3fd0e0' },
  { name: 'Solar', group: 'renewable', base: 35, season: -22, color: '#f9c74f' },
  { name: 'Hydro', group: 'renewable', base: 28, season: 6, color: '#2f7de1' },
  { name: 'Gas', group: 'fossil', base: 70, season: 14, color: '#ff9e00' },
  { name: 'Coal', group: 'fossil', base: 30, season: 8, color: '#9a8c98' },
  { name: 'Nuclear', group: 'nuclear', base: 55, season: 2, color: '#ff2bd6' },
];

const TITLES: Record<string, { text: string; font?: { color: string } }> = {
  renewable: { text: 'Renewable' },
  fossil: { text: 'Fossil', font: { color: '#ff9e00' } },
  nuclear: { text: 'Other' },
};

export function run(el: HTMLElement): ExampleHandle {
  const normal = gaussian(rng(17));
  const months = Array.from({ length: 36 }, (_, i) => {
    const d = new Date(Date.UTC(2023, i, 1));
    return d.toISOString().slice(0, 10);
  });
  const seen = new Set<string>();
  const data = SOURCES.map((s) => {
    const first = !seen.has(s.group);
    seen.add(s.group);
    const trend = s.group === 'renewable' ? 0.9 : s.group === 'fossil' ? -0.6 : 0;
    const y = months.map(
      (_, i) =>
        +(s.base + trend * i + s.season * Math.cos((i / 12) * 2 * Math.PI) + normal() * 3).toFixed(
          1,
        ),
    );
    return {
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: s.name,
      x: months,
      y,
      line: { color: s.color },
      legendgroup: s.group,
      legendwidth: 44,
      ...(first ? { legendgrouptitle: TITLES[s.group] } : {}),
    };
  });

  const chart = createChart(el, {
    data,
    layout: {
      title: { text: 'Electricity generation by source (TWh per month)' },
      yaxis: { title: { text: 'TWh' } },
      legend: { grouptitlefont: { color: '#eceef4' } },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
