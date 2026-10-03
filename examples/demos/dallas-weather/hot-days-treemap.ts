import { createChart, type Chart, type TreemapTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CURRENT_YEAR, fmtDate, LAST_DATE, N, YEAR } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { decadeOf, is100, scaleColor } from './years-events.mts';

/**
 * Every day of 100 °F or more in the record as a `treemap`: the root is all of them, then one
 * box per decade, then one tile per year, with area in proportion to the number of such days
 * that year (`parents`, `branchvalues: 'total'`). Tiles are colored by the same count, from dark
 * red for a handful to bright orange for the worst summers, and carry the year and the count
 * (`text`); tiles too small for it stay blank (`uniformtext`). Years without a 100 °F day are
 * not there at all. Click a decade to zoom into it.
 *
 * The summers of 1980 and 2011 are the two largest tiles; the decade labels give each decade's
 * total, which makes the 1950s drought and the years since 2010 stand out.
 */
export const meta: ExampleMeta = {
  title: 'Dallas weather: every 100 °F day, by decade and year',
  description:
    'A treemap of all days of 100 °F or more at Dallas Love Field since 1939, grouped by decade and year, with tile area and color by the number of days.',
  tags: ['demo', 'treemap', 'hierarchy', 'uniformtext'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

/** Few days dark red, many bright orange. */
const COUNT_SCALE: [number, string][] = [
  [0, '#4d1a22'],
  [0.35, '#a3232d'],
  [0.7, '#ea4a2f'],
  [1, '#ffab3d'],
];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  // Counted from the daily highs, so the partial first and last years are included.
  const perYear = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    if (is100(i)) perYear.set(YEAR[i] as number, (perYear.get(YEAR[i] as number) ?? 0) + 1);
  }
  const years = [...perYear.entries()].sort((a, b) => a[0] - b[0]);
  const total = years.reduce((a, [, n]) => a + n, 0);
  const most = Math.max(...years.map(([, n]) => n));
  const decades = [...new Set(years.map(([y]) => decadeOf(y)))];
  const firstYear = YEAR[0] as number;

  const ids: string[] = ['all'];
  const labels: string[] = [
    `${total.toLocaleString('en-US')} days of 100 °F or more, ${firstYear} to ${fmtDate(LAST_DATE)}`,
  ];
  const parents: string[] = [''];
  const values: number[] = [total];
  const text: string[] = [''];
  const colors: string[] = [LOOK.bg];
  const ink: string[] = [LOOK.title];
  for (const decade of decades) {
    const own = years.filter(([y]) => decadeOf(y) === decade);
    const sum = own.reduce((a, [, n]) => a + n, 0);
    ids.push(`d${decade}`);
    labels.push(`${decade}s: ${sum} days`);
    parents.push('all');
    values.push(sum);
    text.push('');
    colors.push(LOOK.grid);
    ink.push(LOOK.title);
    for (const [year, n] of own) {
      const t = (n - 1) / (most - 1);
      ids.push(String(year));
      labels.push(year === CURRENT_YEAR ? `${year} so far` : String(year));
      parents.push(`d${decade}`);
      values.push(n);
      text.push(`<b>${year}</b><br>${n}`);
      colors.push(scaleColor(COUNT_SCALE, t));
      ink.push(t > 0.8 ? '#1a0d08' : '#ffffff');
    }
  }

  const trace: TreemapTrace = {
    type: 'treemap',
    ids,
    labels,
    parents,
    values,
    text,
    branchvalues: 'total',
    // Decades and years in time order, not by size.
    sort: false,
    textinfo: 'text',
    textposition: 'middle center',
    textfont: { size: narrow ? 9 : 12, color: ink },
    marker: {
      colors,
      line: { color: LOOK.bg, width: 1 },
      pad: { t: 20, l: 3, r: 3, b: 3 },
    },
    tiling: { pad: 1 },
    hovertemplate: '<b>%{label}</b><br>%{value} days of 100 °F or more<extra></extra>',
  };

  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: {
        text: narrow ? '' : 'Every 100 °F day on record: one tile per year, sized by its count',
      },
      margin: narrow ? { t: 8, l: 4, r: 4, b: 4 } : { l: 10, r: 10, b: 10 },
      uniformtext: { minsize: 8, mode: 'hide' },
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
