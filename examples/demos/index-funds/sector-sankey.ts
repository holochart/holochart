import { createChart, type Chart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, fmtDate, HOLDINGS, LABEL, SECTOR_COLOR, sectorWeights } from './analysis.mts';
import { chartConfig, frame, isNarrow, LOOK, rgba, settled } from './ui.mts';

/**
 * Where a dollar put into the S&P 500 goes: a `sankey` from the index to its eleven sectors (each
 * link as wide as the sector's weight) and on to each sector's three largest stocks, with the
 * rest of the sector in one "others" node. Nodes and links take the sector colors (links
 * translucent), the labels carry the weights, and `node.customdata` / `link.customdata` feed the
 * hover templates with company names. Values are percent of the index.
 *
 * The nodes are placed with `node.x` / `node.y` (`arrangement: 'fixed'`) instead of the automatic
 * layout: the 44 stock nodes keep their sectors' order, every one of them gets at least a label's
 * height (most are thinner than their label), and each sector sits level with its own stocks, so
 * no two links cross.
 */
export const meta: ExampleMeta = {
  title: 'Index funds: from the S&P 500 to its sectors and largest stocks',
  description:
    'Sankey of the S&P 500: the index, its eleven sectors by weight, and each sector’s three largest stocks plus the rest.',
  tags: ['demo', 'sankey', 'flow', 'hierarchical', 'hover', 'financial'],
  size: { width: 960, height: 720 },
  testTolerance: 0.004,
};

/** Stocks named per sector; the rest of the sector is one node. */
const TOP = 3;
/** Node padding and thickness, px, and the least height a stock node's slot gets (its label's). */
const PAD = 9;
const THICKNESS = 14;
const SLOT = 11.5;
const MARGIN = { l: 16, r: 16, b: 16 };

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const { holdings, asOf } = HOLDINGS.SPY;
  const w = (v: number): string => `${v.toFixed(1)}%`;

  const labels: string[] = [];
  const colors: string[] = [];
  const nodeHover: string[] = [];
  const weights: number[] = [];
  const node = (label: string, color: string, hover: string, weight: number): number => {
    labels.push(label);
    colors.push(color);
    nodeHover.push(hover);
    weights.push(weight);
    return labels.length - 1;
  };
  /** Per sector: its node and its stock nodes, top to bottom. */
  const tree: { sector: number; stocks: number[] }[] = [];
  const source: number[] = [];
  const target: number[] = [];
  const value: number[] = [];
  const linkColor: string[] = [];
  const linkHover: string[] = [];
  const link = (s: number, t: number, v: number, color: string, hover: string): void => {
    source.push(s);
    target.push(t);
    value.push(v);
    linkColor.push(rgba(color, 0.45));
    linkHover.push(hover);
  };

  const root = node('S&P 500', COLOR.SPY, `${holdings.length} stocks in eleven sectors`, 100);
  for (const s of sectorWeights()) {
    const color = SECTOR_COLOR[s.sector];
    const name = LABEL[s.sector];
    const members = holdings.filter((h) => h.sector === s.sector);
    const sector = node(
      narrow ? `${s.sector} ${w(s.weight)}` : `${name} ${w(s.weight)}`,
      color,
      `${name}: ${s.count} stocks, ${s.weight.toFixed(2)}% of the index`,
      s.weight,
    );
    const stocks: number[] = [];
    tree.push({ sector, stocks });
    link(
      root,
      sector,
      s.weight,
      color,
      `S&P 500 → ${name}<br>${s.weight.toFixed(2)}% of the index`,
    );
    for (const h of members.slice(0, TOP)) {
      const stock = node(
        `${h.ticker} ${w(h.weight)}`,
        color,
        `${h.name}<br>${h.weight.toFixed(2)}% of the index, ` +
          `${((h.weight / s.weight) * 100).toFixed(0)}% of ${name}`,
        h.weight,
      );
      stocks.push(stock);
      link(
        sector,
        stock,
        h.weight,
        color,
        `${name} → ${h.name}<br>${h.weight.toFixed(2)}% of the index`,
      );
    }
    const rest = members.slice(TOP);
    const others = rest.reduce((a, h) => a + h.weight, 0);
    if (rest.length > 0) {
      const text = `${rest.length} other ${name} stocks`;
      const other = node(
        `${rest.length} others ${w(others)}`,
        color,
        `${text}<br>${others.toFixed(2)}% of the index, ` +
          `${((others / s.weight) * 100).toFixed(0)}% of ${name}`,
        others,
      );
      stocks.push(other);
      link(sector, other, others, color, `${text}<br>${others.toFixed(2)}% of the index`);
    }
  }

  // Positions, as fractions of the plot area (node centers). The layout scales every node by the
  // fullest column: the stocks, `PAD` apart (less when the chart is short).
  const marginT = narrow ? 16 : 64;
  const width = Math.max(200, chartEl.clientWidth - MARGIN.l - MARGIN.r);
  const height = Math.max(200, chartEl.clientHeight - marginT - MARGIN.b);
  const count = tree.reduce((a, s) => a + s.stocks.length, 0);
  const pad = Math.min(PAD, ((2 / 3) * height) / (count - 1));
  const total = tree.reduce((a, s) => a + (weights[s.sector] as number), 0);
  const scale = (height - (count - 1) * pad) / total;
  const slots = weights.map((v) => Math.max(v * scale, SLOT));
  const used = tree.reduce((a, s) => a + s.stocks.reduce((b, i) => b + (slots[i] as number), 0), 0);
  const gap = Math.max(0, (height - used) / (count - 1));
  const x = weights.map(() => 0.44);
  const y = weights.map(() => 0.5);
  const edge = THICKNESS / 2 / width;
  x[root] = edge;
  let cursor = 0;
  for (const s of tree) {
    const top = cursor;
    for (const i of s.stocks) {
      x[i] = 1 - edge;
      y[i] = (cursor + (slots[i] as number) / 2) / height;
      cursor += (slots[i] as number) + gap;
    }
    // Level with the middle of its stocks.
    y[s.sector] = (top + cursor - gap) / 2 / height;
  }

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'sankey',
        arrangement: 'fixed',
        valueformat: '.2f',
        valuesuffix: '%',
        textfont: { size: narrow ? 8 : 10, color: LOOK.title },
        node: {
          label: labels,
          color: colors,
          x,
          y,
          pad: PAD,
          thickness: THICKNESS,
          line: { width: 0 },
          customdata: nodeHover,
          hovertemplate: '%{customdata}<extra></extra>',
        },
        link: {
          source,
          target,
          value,
          color: linkColor,
          customdata: linkHover,
          hovertemplate: '%{customdata}<extra></extra>',
        },
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : `S&P 500 → sectors → each sector’s three largest stocks (percent of the index, ${fmtDate(asOf)})`,
      },
      margin: { t: marginT, ...MARGIN },
      font: { color: LOOK.text },
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
