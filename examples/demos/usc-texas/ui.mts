import { createChart } from '@mk7s/holochart';
import type { ExampleHandle } from '../../_lib/types.ts';
import { build } from './charts.mts';
import { chartConfig, frame, isNarrow, settled } from '../openrouter/ui.mts';

/** Shared responsive frame; hide long categorical labels on phones and retain them in hover. */
export function demo(el: HTMLElement, id: string, title: string): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const f = build(id);
  if (narrow && id === 'scoring-table') {
    const table = f.data[0]!;
    const cells = table['cells'] as Record<string, unknown>;
    const values = cells['values'] as string[][];
    table['columnwidth'] = [85, 60, 160, 65];
    table['header'] = {
      values: ['Time', 'Team', 'Scorer', 'Score'],
      fill: { color: '#242633' },
      font: { color: '#eceef4', size: 10 },
    };
    cells['values'] = [
      values[0]!.map((q, i) => `${q} ${values[1]![i]}`),
      values[2],
      values[3],
      values[5],
    ];
    cells['font'] = { color: '#d8dbe8', size: 10 };
  }
  const margin = f.layout['margin'] as Record<string, number> | undefined;
  const xaxis = f.layout['xaxis'] as Record<string, unknown> | undefined;
  const chart = createChart(chartEl, {
    data: f.data,
    layout: {
      title: { text: narrow ? '' : title },
      colorway: ['#e88945', '#ec5267', '#6c93da', '#9f80d0'],
      font: { size: narrow ? 10 : 12 },
      legend: { orientation: 'h', x: 0, y: 1.1, font: { size: narrow ? 10 : 11 } },
      ...f.layout,
      margin: { t: narrow ? 50 : 85, l: narrow ? 55 : 65, r: 30, b: 65, ...margin },
      ...(narrow && id === 'scoring-waterfall'
        ? { xaxis: { ...xaxis, showticklabels: false } }
        : {}),
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
