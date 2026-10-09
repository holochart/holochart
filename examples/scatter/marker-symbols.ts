import { createChart } from '@mk7s/holochart';
import { MARKER_SYMBOLS, SYMBOL_VARIANTS } from '@mk7s/holochart-render';
import type { ExampleHandle, ExampleMeta } from '../_lib/types.ts';

/**
 * Every built-in marker symbol in its four variants, drawn with `marker.symbol` on scatter traces.
 * Each row is one symbol, labelled with its numeric code and name; its four markers are the filled
 * symbol and the `-open`, `-dot` and `-open-dot` variants, one trace (and one color) per variant.
 * The names come from the symbol table the renderer draws from, so the chart cannot miss one.
 */
export const meta: ExampleMeta = {
  title: 'Scatter: every marker symbol',
  description:
    'All built-in marker symbols with their numeric codes, each as filled, -open, -dot and -open-dot.',
  tags: ['scatter', 'markers', 'symbols'],
  size: { width: 720, height: 600 },
  testTolerance: 0.004,
};

/** Symbols per column of the chart. */
const ROWS = 19;
/** Width of a column in x units: four markers one unit apart, then the label. */
const COLUMN = 9.25;

export function run(el: HTMLElement): ExampleHandle {
  const columns = Math.ceil(MARKER_SYMBOLS.length / ROWS);
  const column = MARKER_SYMBOLS.map((symbol) => Math.floor(symbol.code / ROWS) * COLUMN);
  const row = MARKER_SYMBOLS.map((symbol) => symbol.code % ROWS);

  const chart = createChart(el, {
    data: [
      // One trace per variant: `'star'`, `'star-open'`, `'star-dot'`, `'star-open-dot'`.
      ...SYMBOL_VARIANTS.map((suffix, variant) => ({
        type: 'scatter' as const,
        mode: 'markers' as const,
        name: suffix === '' ? 'filled' : suffix,
        x: column.map((x) => x + variant),
        y: row,
        // The same symbol by number is `code + 100 * variant`: 17, 117, 217, 317.
        text: MARKER_SYMBOLS.map((s) => `${s.name}${suffix} (${s.code + 100 * variant})`),
        hoverinfo: 'text' as const,
        marker: {
          symbol: MARKER_SYMBOLS.map((s) => s.name + suffix),
          size: 11,
          line: { width: 1, color: '#eceef4' },
        },
      })),
      {
        type: 'scatter',
        mode: 'text',
        // Arrows have their tip on the point and extend a whole marker size past it.
        x: column.map((x) => x + SYMBOL_VARIANTS.length - 0.1),
        y: row,
        text: MARKER_SYMBOLS.map((s) => `${s.code}  ${s.name}`),
        textposition: 'middle right',
        textfont: { size: 10, color: '#a4a7b5' },
        hoverinfo: 'skip',
        showlegend: false,
      },
    ],
    layout: {
      xaxis: { range: [-0.75, columns * COLUMN - 0.75], visible: false, fixedrange: true },
      yaxis: { range: [ROWS - 0.4, -0.6], visible: false, fixedrange: true },
      margin: { l: 8, r: 8, b: 8 },
    },
  });

  return {
    ready: chart.ready.then(() => undefined),
    renderer: chart.three.renderer,
    dispose: () => chart.destroy(),
  };
}
