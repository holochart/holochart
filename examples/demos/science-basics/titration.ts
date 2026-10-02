import {
  createChart,
  type Chart,
  type LayoutAnnotation,
  type LayoutShape,
  type ScatterTrace,
} from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';

/**
 * A titration curve: the pH in a flask of 25 mL of 0.1 mol/L hydrochloric acid while 0.1 mol/L
 * sodium hydroxide is added, as a `scatter` line. Computed exactly for a strong acid and a strong
 * base: the acid left over (or the base in excess) per litre of the mixed solution is
 * c = 0.1 · (25 − V) / (25 + V), and the hydrogen ion concentration solves h − Kw/h = c with
 * Kw = 10⁻¹⁴, so pH = −log₁₀ h. That gives pH 1 at the start, exactly 7 at the equivalence point
 * (25 mL, where acid and base have cancelled) and 12.5 at 50 mL.
 *
 * Horizontal bands (`layout.shapes` rectangles on `xref: 'paper'`) shade the pH range over which
 * two indicators change color: methyl orange (3.1–4.4) and phenolphthalein (8.2–10.0). The curve
 * is so steep at 25 mL that it crosses both bands within a fraction of a drop, which is why either
 * indicator finds the end point. An annotation marks the equivalence point.
 */
export const meta: ExampleMeta = {
  title: 'Titration: adding a base to an acid',
  description:
    'The pH of 25 mL of 0.1 mol/L HCl as 0.1 mol/L NaOH is added, with the color-change ranges of two indicators as bands.',
  tags: ['demo', 'scatter', 'line', 'shapes', 'annotations', 'chemistry'],
  size: { width: 960, height: 460 },
  testTolerance: 0.004,
};

const ACID_ML = 25;
const CONC = 0.1;
const KW = 1e-14;

/** pH after `v` mL of base, strong acid and strong base. */
function ph(v: number): number {
  const c = (CONC * (ACID_ML - v)) / (ACID_ML + v);
  // Positive root of h² − c·h − Kw = 0, written to stay accurate when c is negative.
  const root = Math.sqrt(c * c + 4 * KW);
  const h = c >= 0 ? (c + root) / 2 : (2 * KW) / (root - c);
  return -Math.log10(h);
}

/** Volumes from 0 to 50 mL, packed closely around the equivalence point. */
function volumes(): number[] {
  const out = new Set<number>();
  for (let i = 0; i <= 200; i++) out.add(i * 0.25);
  for (let e = -6; e <= 0; e += 0.125) {
    const d = 10 ** e;
    out.add(ACID_ML - d);
    out.add(ACID_ML + d);
  }
  return [...out].sort((a, b) => a - b);
}

const INDICATORS = [
  { name: 'Methyl orange', lo: 3.1, hi: 4.4, change: 'red to yellow', color: '#f07c1e' },
  { name: 'Phenolphthalein', lo: 8.2, hi: 10.0, change: 'colorless to pink', color: '#e0559b' },
] as const;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);
  const v = volumes();

  const curve: ScatterTrace = {
    type: 'scatter',
    mode: 'lines',
    name: 'pH',
    x: v,
    y: v.map(ph),
    line: { color: LOOK.colorway[1], width: 2.5 },
    hovertemplate: '%{x:.2f} mL of NaOH added<br><b>pH %{y:.2f}</b><extra></extra>',
  };
  const point: ScatterTrace = {
    type: 'scatter',
    mode: 'markers',
    name: 'Equivalence point',
    x: [ACID_ML],
    y: [7],
    marker: { color: LOOK.title, size: 9, line: { color: LOOK.bg, width: 1.5 } },
    hovertemplate: 'Equivalence point<br>25 mL, <b>pH 7</b><extra></extra>',
  };

  const bands = INDICATORS.map((ind): LayoutShape => ({
    type: 'rect',
    xref: 'paper',
    x0: 0,
    x1: 1,
    yref: 'y',
    y0: ind.lo,
    y1: ind.hi,
    layer: 'below',
    fillcolor: ind.color,
    opacity: 0.22,
    line: { width: 0 },
  }));
  const bandLabels = INDICATORS.map((ind): LayoutAnnotation => ({
    xref: 'paper',
    x: 0.01,
    xanchor: 'left',
    yref: 'y',
    // Clear of the gridlines at pH 4 and 10.
    y: ind.lo + 0.45,
    text: narrow
      ? `${ind.name}, pH ${ind.lo}–${ind.hi.toFixed(1)}`
      : `<b>${ind.name}</b> changes from ${ind.change} between pH ${ind.lo} and ${ind.hi.toFixed(1)}`,
    showarrow: false,
    font: { size: 10, color: LOOK.title },
  }));

  const chart: Chart = createChart(chartEl, {
    data: [curve, point],
    layout: {
      title: { text: narrow ? '' : 'Neutralizing 25 mL of hydrochloric acid, drop by drop' },
      showlegend: false,
      hovermode: 'closest',
      xaxis: {
        title: { text: 'Sodium hydroxide solution added (mL, 0.1 mol/L)' },
        range: [0, 50],
        dtick: 5,
      },
      yaxis: { title: { text: 'pH in the flask' }, range: [0, 14], dtick: 2, zeroline: false },
      shapes: bands,
      annotations: [
        ...bandLabels,
        {
          x: ACID_ML,
          y: 7,
          text: narrow
            ? 'Equivalence point<br>25 mL, pH 7'
            : '<b>Equivalence point</b>: 25 mL, pH 7<br>acid and base have exactly cancelled',
          showarrow: true,
          arrowhead: 0,
          arrowwidth: 1,
          arrowcolor: LOOK.tick,
          ax: narrow ? 60 : 110,
          ay: 0,
          xanchor: 'left',
          align: 'left',
          standoff: 6,
          font: { size: 10, color: LOOK.text },
        },
      ],
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
