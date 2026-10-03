import type { LayoutAnnotation } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { fmtPct, WITHDRAWAL } from './data.mts';
import { LOOK, mount } from './ui.mts';

/**
 * Weight after stopping treatment, after Figure 2 of SURMOUNT-4 (JAMA 2024) and Figure 1 of the
 * STEP 1 extension (2022), drawn on one week axis. Only the published landmark values are
 * plotted, joined by straight lines: the papers' per-visit curves exist only as images and were
 * not traced. Segments after the drug was stopped are dotted, and an arrow annotation marks each
 * stopping point.
 */
export const meta: ExampleMeta = {
  title: 'Weight regain after stopping tirzepatide or semaglutide',
  description:
    'Landmark weight changes from SURMOUNT-4 and the STEP 1 extension on one time axis, with stopping points annotated.',
  tags: ['demo', 'scatter', 'lines', 'annotations', 'medical'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const stops: Partial<LayoutAnnotation>[] = [
    { x: 36, y: -20.9, text: 'SURMOUNT-4: randomised at week 36', ax: 70, ay: 34 },
    { x: 68, y: -17.3, text: 'STEP 1: all treatment stopped at week 68', ax: 40, ay: 40 },
  ].map((a) => ({
    ...a,
    showarrow: true,
    arrowhead: 2,
    arrowcolor: LOOK.tick,
    font: { size: 11, color: LOOK.text },
  }));

  return mount(el, (narrow) => ({
    data: WITHDRAWAL.flatMap((series) => {
      const stop = series.stopWeek;
      const before = stop === undefined ? series.points : series.points.filter((p) => p[0] <= stop);
      const after = stop === undefined ? [] : series.points.filter((p) => p[0] >= stop);
      const last = series.points.at(-1) as readonly [number, number];
      const label = (p: readonly [number, number]): string => (p === last ? fmtPct(p[1]) : '');
      const base = {
        type: 'scatter' as const,
        legendgroup: series.name,
        hovertemplate: `week %{x}: %{y:.1f}%<extra>${series.name}<br>${series.detail}</extra>`,
      };
      return [
        {
          ...base,
          mode: 'lines+markers+text' as const,
          name: series.name,
          x: before.map((p) => p[0]),
          y: before.map((p) => p[1]),
          text: stop === undefined ? before.map(label) : before.map(() => ''),
          textposition: 'middle right' as const,
          textfont: { size: 11, color: series.color },
          line: { color: series.color, width: 2.5 },
          marker: { size: 8, color: series.color },
        },
        {
          ...base,
          mode: 'lines+markers+text' as const,
          showlegend: false,
          x: after.map((p) => p[0]),
          y: after.map((p) => p[1]),
          text: after.map(label),
          textposition: 'middle right' as const,
          textfont: { size: 11, color: series.color },
          line: { color: series.color, width: 2.5, dash: 'dot' as const },
          marker: { size: 8, color: series.color },
        },
      ].filter((t) => t.x.length > 0);
    }),
    layout: {
      title: {
        text: narrow
          ? ''
          : 'Half to two thirds of the lost weight returns within a year of stopping',
      },
      margin: { r: 60 },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
      xaxis: {
        title: { text: 'Weeks since starting treatment' },
        range: [-2, 132],
        dtick: 12,
        zeroline: false,
      },
      yaxis: {
        title: { text: 'Change in body weight from week 0, %' },
        range: [-28, 2],
        ticksuffix: '%',
        zeroline: true,
      },
      annotations: narrow ? [] : stops,
    },
  }));
}
