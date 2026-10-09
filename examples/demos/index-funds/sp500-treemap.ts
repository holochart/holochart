import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { fmtDate, HOLDINGS, LABEL, SECTOR_COLOR, sectorWeights } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * Everything the S&P 500 fund (SPY) holds, as tiles sized by weight: the index, its eleven
 * sectors, and about 500 stocks. A `treemap` with unique `ids`, `branchvalues: 'total'` (a
 * sector's value is the sum of its stocks), tiles colored by sector (`marker.colors`), the ticker
 * and weight on each tile through `text` (tiles too small for 8 px text stay blank,
 * `uniformtext`), the sector's name and weight in its header, and the company's name, sector and
 * weight in the hover text (`customdata`). Click a sector to zoom into it; the path bar leads back.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: what the S&P 500 holds',
  description:
    'Treemap of SPY’s holdings: the S&P 500, its eleven sectors and about 500 stocks, sized by weight and colored by sector.',
  tags: ['demo', 'treemap', 'hierarchical', 'uniformtext', 'pathbar', 'hover', 'financial'],
  size: { width: 960, height: 560 },
  testTolerance: 0.004,
};

const ROOT = 'S&P 500';

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const { holdings, asOf } = HOLDINGS.SPY;
  const ids: string[] = [];
  const labels: string[] = [];
  const parents: string[] = [];
  const values: number[] = [];
  const colors: string[] = [];
  const text: string[] = [];
  const customdata: [string, string][] = [];
  const add = (
    id: string,
    label: string,
    parent: string,
    value: number,
    color: string,
    shown: string,
    hover: [string, string],
  ): void => {
    ids.push(id);
    labels.push(label);
    parents.push(parent);
    values.push(value);
    colors.push(color);
    text.push(shown);
    customdata.push(hover);
  };

  const sectors = sectorWeights().map((s) => {
    const members = holdings.filter((h) => h.sector === s.sector);
    // Summed in the order the stocks are added, so the branch total matches its children exactly.
    return { ...s, members, weight: members.reduce((a, h) => a + h.weight, 0) };
  });
  const total = sectors.reduce((a, s) => a + s.weight, 0);
  add(ROOT, ROOT, '', total, LOOK.zero, '', [`${holdings.length} stocks`, '']);
  for (const s of sectors) {
    const name = LABEL[s.sector];
    add(s.sector, `${name}  ${s.weight.toFixed(1)}%`, ROOT, s.weight, SECTOR_COLOR[s.sector], '', [
      `${s.count} stocks`,
      '',
    ]);
    for (const h of s.members) {
      add(
        `${s.sector}/${h.ticker}`,
        h.ticker,
        s.sector,
        h.weight,
        SECTOR_COLOR[s.sector],
        `${h.ticker}<br>${h.weight.toFixed(h.weight < 1 ? 2 : 1)}%`,
        [h.name, `${name}<br>`],
      );
    }
  }

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'treemap',
        name: 'SPY',
        ids,
        labels,
        parents,
        values,
        text,
        customdata,
        branchvalues: 'total',
        textinfo: 'text',
        textfont: { color: '#ffffff' },
        hovertemplate:
          '<b>%{label}</b> %{customdata[0]}<br>%{customdata[1]}' +
          '%{value:.2f}% of the S&P 500<extra></extra>',
        marker: {
          colors,
          line: { color: LOOK.bg, width: 1 },
          pad: { t: 20, l: 2, r: 2, b: 2 },
        },
        tiling: { pad: 1 },
        pathbar: { visible: !narrow },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `The S&P 500 by sector and stock: SPY’s ${holdings.length} holdings on ${fmtDate(asOf)}`,
      },
      margin: { t: narrow ? 16 : 64, l: 10, r: 10, b: 10 },
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
