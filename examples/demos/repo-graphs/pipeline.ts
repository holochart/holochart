import { createChart, type Chart } from '@mk7s/holochart';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { FLOWS, STAGES } from './analysis.mts';
import { chartConfig, frame, isNarrow, settled } from './ui.mts';

/**
 * The rendering pipeline of this library, as `ARCHITECTURE.md` describes it, drawn by the library:
 * `arrangement: 'layered'` with `rankdir: 'LR'` and `routing: 'orthogonal'`, the stages in
 * `layered.clusters` by where they run. The pipeline is a loop: an interaction goes through the
 * update planner back to "Supply defaults". The layered layout turns one link of every cycle
 * around to give the others one direction, and draws it in the `link.secondary` style (dashed),
 * with its arrowhead still pointing the way the data says. The two links that skip a stage are
 * what an attribute's `editType` saves on an update.
 */
export const meta: ExampleMeta = {
  title: 'This repository: the rendering pipeline',
  description:
    'The stages of Holochart’s rendering pipeline as a left-to-right layered diagram with orthogonal links, clusters and the dashed link that closes the update loop.',
  tags: ['demo', 'graph', 'layered', 'pipeline', 'clusters', 'orthogonal', 'cycle', 'diagram'],
  size: { width: 960, height: 380 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const chart: Chart = createChart(chartEl, {
    data: [
      {
        type: 'graph',
        arrangement: 'layered',
        layered: {
          rankdir: 'LR',
          routing: 'orthogonal',
          clusters: true,
          ranksep: 30,
          nodesep: 26,
          clusterpadding: 12,
        },
        node: {
          label: STAGES.map((s) => s.label),
          group: STAGES.map((s) => s.group),
          textfont: { size: narrow ? 9 : 12 },
          customdata: STAGES.map((s) => `${s.does}<br>Owner: ${s.owner}`),
          hovertemplate: '<b>%{label}</b><br>%{customdata}<extra>%{group}</extra>',
        },
        link: {
          source: FLOWS.map((f) => f[0]),
          target: FLOWS.map((f) => f[1]),
          label: FLOWS.map((f) => f[2]),
          width: 1.5,
          hovertemplate: '%{source.label} → %{target.label}<br>%{label}<extra></extra>',
        },
      },
    ],
    layout: {
      title: { text: narrow ? '' : 'From a figure to a frame, and back on every update' },
      showlegend: false,
      margin: { l: 12, r: 12, t: narrow ? 12 : 56, b: 12 },
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
