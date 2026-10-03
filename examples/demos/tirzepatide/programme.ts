import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, fmtPct, PROGRAMME } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * Weight change across tirzepatide's obesity programme as a dumbbell chart: the highest-dose arm
 * and the comparator of each trial joined by a connector (one `lines` trace broken by nulls). The
 * comparator marker takes its color per point, so the one active comparator (semaglutide in
 * SURMOUNT-5) stands out from the placebos, and SURMOUNT-4's regain on placebo crosses zero.
 */
export const meta: ExampleMeta = {
  title: 'Tirzepatide: weight change across the SURMOUNT programme',
  description:
    'Tirzepatide against the comparator in eight trials as a dumbbell chart, with per-point comparator colors and value labels.',
  tags: ['demo', 'scatter', 'dumbbell', 'category', 'medical'],
  size: { width: 960, height: 520 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const rows = PROGRAMME.map((p) => `${p.trial}<br>${p.population}`);
  const hover = PROGRAMME.map(
    (p) =>
      `${p.trial} (${p.ref.short}), n = ${p.n.toLocaleString('en-US')}<br>` +
      `weeks ${p.weeks}, ${p.estimand} estimand<br>` +
      `tirzepatide ${fmtPct(p.tirz)} · ${p.comparatorName.toLowerCase()} ${fmtPct(p.comparator)}`,
  );
  return mount(el, (narrow) => ({
    data: [
      {
        type: 'scatter',
        mode: 'lines',
        x: PROGRAMME.flatMap((p) => [p.tirz, p.comparator, null]),
        y: rows.flatMap((r) => [r, r, null]),
        line: { color: LOOK.zero, width: 3 },
        showlegend: false,
        hoverinfo: 'skip',
      },
      {
        type: 'scatter',
        mode: 'markers+text',
        name: 'Comparator (placebo grey, semaglutide orange)',
        x: PROGRAMME.map((p) => p.comparator),
        y: rows,
        text: PROGRAMME.map((p) => fmtPct(p.comparator)),
        textposition: 'middle right',
        textfont: { size: 11, color: LOOK.text },
        marker: { size: 12, color: PROGRAMME.map((p) => p.comparatorColor) },
        hovertext: hover,
        hoverinfo: 'text',
      },
      {
        type: 'scatter',
        mode: 'markers+text',
        name: 'Tirzepatide 15 mg or maximum tolerated dose',
        x: PROGRAMME.map((p) => p.tirz),
        y: rows,
        text: PROGRAMME.map((p) => fmtPct(p.tirz)),
        textposition: 'middle left',
        textfont: { size: 11, color: LOOK.title },
        marker: { size: 12, color: COLOR.tirz15 },
        hovertext: hover,
        hoverinfo: 'text',
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : 'Large losses in every population studied, and regain when the drug is withdrawn',
      },
      margin: { l: narrow ? 150 : 290, r: 40 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        title: { text: 'Change in body weight, %' },
        range: [-27, 19],
        ticksuffix: '%',
        zeroline: true,
      },
      yaxis: { autorange: 'reversed', categoryorder: 'array', categoryarray: rows },
    },
  }));
}
