import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { CLASS_OBESITY, COLOR, fmtPct } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * The incretin class in obesity: weight change on the highest dose and on placebo in each agent's
 * main trial in adults without diabetes, ranked, as a dumbbell chart. Injectables are circles and
 * oral agents diamonds (`marker.symbol` per point); each drug keeps its color from the other
 * charts. All values are the treatment-policy estimand, from separate trials.
 */
export const meta: ExampleMeta = {
  title: 'GLP-1 based drugs for obesity: weight loss by agent',
  description:
    'Weight change on drug and on placebo in eight phase 3 obesity trials, ranked, as a dumbbell chart with per-point colors and symbols.',
  tags: ['demo', 'scatter', 'dumbbell', 'category', 'symbols', 'medical'],
  size: { width: 960, height: 540 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = CLASS_OBESITY.map((t) => `${t.drug}<br>${t.target}`);
  const hover = CLASS_OBESITY.map(
    (t) =>
      `${t.drug} (${t.route})<br>${t.trial}, ${t.ref.short}: n = ${t.n.toLocaleString('en-US')}, ${t.weeks} weeks<br>` +
      `drug ${fmtPct(t.drugPct)} · placebo ${fmtPct(t.placeboPct)}` +
      (t.note ? `<br>${t.note}` : ''),
  );
  return mount(el, (narrow) => ({
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        x: CLASS_OBESITY.flatMap((t) => [t.drugPct, t.placeboPct, null]),
        y: rows.flatMap((r) => [r, r, null]),
        line: { color: LOOK.zero, width: 3 },
        showlegend: false,
        hoverinfo: 'skip',
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Placebo',
        x: CLASS_OBESITY.map((t) => t.placeboPct),
        y: rows,
        marker: { size: 11, color: COLOR.placebo },
        hovertext: hover,
        hoverinfo: 'text',
      },
      {
        type: 'scatter',
        mode: 'markers+text',
        name: 'Drug, highest dose (circle: injection, diamond: oral)',
        x: CLASS_OBESITY.map((t) => t.drugPct),
        y: rows,
        text: CLASS_OBESITY.map((t) => `${fmtPct(t.drugPct)}  ${t.trial}, ${t.weeks} wk`),
        textposition: 'middle left',
        textfont: { size: 11, color: LOOK.text },
        marker: {
          size: 14,
          color: CLASS_OBESITY.map((t) => t.color),
          symbol: CLASS_OBESITY.map((t) => (t.route === 'oral' ? 'diamond' : 'circle')),
        },
        hovertext: hover,
        hoverinfo: 'text',
      },
    ],
    layout: {
      title: { text: narrow ? '' : 'From 7% to 25%: weight loss across the class' },
      margin: { l: narrow ? 150 : 220 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        title: { text: 'Change in body weight, % (treatment-policy estimand)' },
        range: [-35, 1],
        ticksuffix: '%',
        zeroline: true,
      },
      yaxis: { categoryorder: 'array', categoryarray: rows },
    },
  }));
}
