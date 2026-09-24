import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * A report page: a revenue table and a donut of the plan's regional mix, placed in the two cells
 * of `layout.grid` with `domain.row` / `domain.column`.
 *
 * - Table: the year columns have numeric headers, printed as "FY 2023" by `header.prefix` and
 *   `header.format: 'd'` (no thousands separator); the plan column gets a `header.suffix` and is
 *   italic in both header and cells (`font.style` per column). The query returns the plan before
 *   the actuals; `columnorder` shows the years chronologically. Taller rows (`header.height`,
 *   `cells.height`), hairline rules (`line.width`, `line.color`), smaller type (`font.size`) and a
 *   bold total row (`cells.font.weight` per cell).
 * - Donut: region labels sit inside the large slices (`insidetextfont`) and outside the small ones
 *   (`outsidetextfont`, lighter and smaller), all bold via `textfont`. The center `title` has its
 *   own font. The table already names the regions, so the pie has no legend (`showlegend:
 *   false`); `hovertext` adds each region's largest account, and `hoverinfo` picks the fields.
 */
export const meta: ExampleMeta = {
  title: 'Reports: regional revenue table and donut',
  description:
    'A formatted revenue table (numeric headers with prefix/format/suffix, columnorder, row heights, rules, a bold total row) beside a donut with inside/outside label fonts, placed with layout.grid.',
  tags: ['reports', 'table', 'pie', 'donut', 'finance', 'grid'],
  testTolerance: 0.004,
  size: { width: 820, height: 380 },
};

const REGIONS = ['North America', 'Europe', 'APAC', 'LATAM', 'Middle East'];
const FY23 = [14200, 9800, 6100, 2100, 1300];
const FY24 = [15600, 10400, 7300, 2600, 1500];
const PLAN = [17100, 11000, 8600, 3000, 1500];
const TOP_ACCOUNT = [
  'Northwind Health',
  'Contoso Retail',
  'Kagawa Logistics',
  'Andes Foods',
  'Gulf Energy',
];

const sum = (v: readonly number[]): number => v.reduce((s, x) => s + x, 0);

export function run(el: HTMLElement): ExampleHandle {
  const rows = [...REGIONS, 'Total'];
  const plan = [...PLAN, sum(PLAN)];
  const fy23 = [...FY23, sum(FY23)];
  const fy24 = [...FY24, sum(FY24)];
  const cagr = plan.map((p, i) => Math.sqrt(p / fy23[i]!) - 1);
  const weight = rows.map((r) => (r === 'Total' ? 'bold' : 'normal'));
  // Column data order as returned by the query: region, plan, FY23, FY24, CAGR.
  const italicPlan = ['normal', 'italic', 'normal', 'normal', 'normal'];

  const chart = createChart(el, {
    data: [
      {
        type: 'table',
        domain: { row: 0, column: 0 },
        columnorder: [0, 3, 1, 2, 4],
        columnwidth: [1.6, 1.3, 1, 1, 0.8],
        header: {
          values: ['Region', 2025, 2023, 2024, 'CAGR'],
          prefix: ['', 'FY ', 'FY ', 'FY ', ''],
          format: ['', 'd', 'd', 'd', ''],
          suffix: ['', ' plan', '', '', ''],
          align: ['left', 'right', 'right', 'right', 'right'],
          height: 34,
          line: { width: 1, color: '#3a3e4f' },
          font: { size: 12, style: italicPlan },
        },
        cells: {
          values: [rows, plan, fy23, fy24, cagr],
          prefix: ['', '$', '$', '$', ''],
          suffix: ['', 'k', 'k', 'k', ''],
          format: ['', ',', ',', ',', '+.1%'],
          align: ['left', 'right', 'right', 'right', 'right'],
          height: 28,
          line: { width: 0.5, color: '#2a2d3a' },
          font: { size: 12, weight: italicPlan.map(() => weight), style: italicPlan },
        },
      },
      {
        type: 'pie',
        domain: { row: 0, column: 1 },
        labels: REGIONS,
        values: PLAN,
        hole: 0.55,
        textinfo: 'label+percent',
        textposition: 'auto',
        textfont: { weight: 'bold' },
        insidetextfont: { size: 12, color: '#ffffff' },
        outsidetextfont: { size: 11, color: '#c9cde0', weight: 'normal' },
        title: {
          text: 'FY 2025 plan<br>$41.2M',
          font: { size: 14, color: '#e6e8f0', weight: 'bold' },
        },
        showlegend: false,
        hovertext: TOP_ACCOUNT.map((a) => `Largest account: ${a}`),
        hoverinfo: 'label+value+text',
      },
    ],
    layout: {
      title: { text: 'Revenue by region (US$ thousands)' },
      grid: { rows: 1, columns: 2, xgap: 0.04 },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
