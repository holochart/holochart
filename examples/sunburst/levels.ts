import {
  componentsReady,
  createChart,
  render,
  type Chart,
  type SunburstTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * `maxdepth` and `level` (plan E13.1): a four-level taxonomy twice. Left, `maxdepth: 2` draws the
 * root and one ring; deeper levels appear when drilling in. Right, `level: 'Mammals'` starts from
 * that branch (what a click on it does), with `maxdepth: 3` and a quarter turn of `rotation`.
 * Labels show the path and the share of the current root (`percent entry`).
 */
export const meta: ExampleMeta = {
  title: 'Sunburst: maxdepth and level',
  description:
    'A four-level taxonomy cut to two levels, and the same tree entered at one branch with three levels and a rotation.',
  tags: ['sunburst', 'hierarchical', 'chart', 'text', 'domain', 'annotations'],
  size: { width: 760, height: 420 },
  // SDF text anti-aliasing varies slightly across GPUs.
  testTolerance: 0.004,
};

const CHARACTERS = "0123456789%:' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** [label, parent, species count] of leaves; branches are summed. */
const ROWS: readonly (readonly [string, string, number])[] = [
  ['Animals', '', 0],
  ['Vertebrates', 'Animals', 0],
  ['Invertebrates', 'Animals', 0],
  ['Mammals', 'Vertebrates', 0],
  ['Birds', 'Vertebrates', 0],
  ['Fish', 'Vertebrates', 34],
  ['Primates', 'Mammals', 5],
  ['Rodents', 'Mammals', 24],
  ['Bats', 'Mammals', 14],
  ['Carnivores', 'Mammals', 3],
  ['Songbirds', 'Birds', 6],
  ['Raptors', 'Birds', 2],
  ['Insects', 'Invertebrates', 0],
  ['Molluscs', 'Invertebrates', 8],
  ['Beetles', 'Insects', 40],
  ['Flies', 'Insects', 16],
  ['Ants', 'Insects', 12],
];

export function run(el: HTMLElement): ExampleHandle {
  let chart: Chart | undefined;
  let disposed = false;
  const tree = {
    type: 'sunburst',
    labels: ROWS.map((r) => r[0]),
    parents: ROWS.map((r) => r[1]),
    values: ROWS.map((r) => r[2]),
    textinfo: 'label+percent entry',
  } satisfies SunburstTrace;
  const ready = render.preloadTextFont({ characters: CHARACTERS }).then(async () => {
    if (disposed) return;
    chart = createChart(el, {
      data: [
        { ...tree, maxdepth: 2, domain: { x: [0, 0.48] } },
        { ...tree, level: 'Mammals', maxdepth: 3, rotation: 90, domain: { x: [0.52, 1] } },
      ],
      layout: {
        margin: { l: 10, r: 10, t: 40, b: 10 },
        annotations: [
          { text: 'maxdepth: 2', x: 0.24, y: 1.06, xref: 'paper', yref: 'paper', showarrow: false },
          {
            text: "level: 'Mammals', rotation: 90",
            x: 0.76,
            y: 1.06,
            xref: 'paper',
            yref: 'paper',
            showarrow: false,
          },
        ],
      },
      config: { responsive: true },
    });
    await componentsReady(chart);
  });

  return {
    ready,
    get renderer() {
      return chart?.three.renderer;
    },
    dispose: () => {
      disposed = true;
      chart?.destroy();
    },
  };
}
