import { createChart } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Rich text in a table (plan E9.13, E2.10): header and cell values take Plotly's pseudo-HTML, drawn
 * as styled runs: `<b>`, `<i>`, colored `<span style>`, `<sup>` / `<sub>`, `<br>` line breaks, a
 * clickable `<a href>` link, and entities. A long rich description wraps to its column at spaces
 * across the styled runs, and its row grows to fit, like plain text. The default look styles the
 * table; only the markup is set here.
 */
export const meta: ExampleMeta = {
  title: 'Table: rich text in cells',
  description:
    'Bold, italic and colored spans, superscripts and subscripts, line breaks, a link and a long rich description that wraps to its column.',
  tags: ['table', 'chart', 'rich-text', 'wrap', 'link'],
  testTolerance: 0.004,
};

const RED = '#ea2a37';
const BLUE = '#5e74d5';
const GREEN = '#118e36';

export function run(el: HTMLElement): ExampleHandle {
  const chart = createChart(el, {
    data: [
      {
        type: 'table',
        columnwidth: [1.1, 0.9, 2.8, 1],
        header: {
          values: ['<b>Compound</b>', '<b>Formula</b>', '<b>Notes</b> <sup>†</sup>', 'Source'],
          align: 'left',
        },
        cells: {
          values: [
            ['<b>Water</b>', '<b>Carbon dioxide</b>', '<b>Ammonia</b>', '<i>Ethanol</i>'],
            ['H<sub>2</sub>O', 'CO<sub>2</sub>', 'NH<sub>3</sub>', 'C<sub>2</sub>H<sub>5</sub>OH'],
            [
              `A <b>polar</b> molecule: the <span style="color:${RED}">oxygen</span> atom pulls the shared electrons, so water dissolves <i>many</i> salts and has a high boiling point for its size.`,
              `Sublimes at <b>−78.5 °C</b><br>(at 1 atm: no liquid phase)`,
              `<span style="color:${BLUE}">Base</span>: pK<sub>b</sub> ≈ 4.75`,
              `Energy density ≈ 29.7 MJ·kg<sup>−1</sup>, <span style="color:${GREEN}">renewable</span> &amp; <i>common</i>`,
            ],
            [
              `<a href="https://en.wikipedia.org/wiki/Water" style="color:${BLUE}">Wikipedia</a>`,
              'NIST <i>WebBook</i>',
              'IUPAC <b>Gold Book</b>',
              'CRC <i>Handbook</i>',
            ],
          ],
          align: 'left',
        },
      },
    ],
    layout: { title: { text: 'Molecules <i>at a glance</i>' } },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
