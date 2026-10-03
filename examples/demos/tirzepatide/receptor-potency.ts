import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { COLOR, RECEPTOR } from './data.mts';
import { mount } from './ui.mts';

/**
 * Tirzepatide's receptor pharmacology from its discovery paper (Coskun 2018): binding affinity (Ki)
 * and cAMP potency (EC50) at the GIP and GLP-1 receptors, with semaglutide at the GLP-1 receptor in
 * the same assays. A dot plot on a log axis, since the values span almost three decades; SEMs are
 * symmetric `error_x` bars. Lower is more potent, so the axis is reversed to put "more potent" on
 * the right.
 */
export const meta: ExampleMeta = {
  title: 'Tirzepatide: receptor affinity and potency',
  description:
    'Ki and cAMP EC50 of tirzepatide at the GIP and GLP-1 receptors and semaglutide at the GLP-1 receptor, as a dot plot on a reversed log axis.',
  tags: ['demo', 'scatter', 'log', 'error-bars', 'medical', 'dot-plot'],
  size: { width: 960, height: 360 },
  testTolerance: 0.004,
};

export function run(el: HTMLElement): ExampleHandle {
  const labels = RECEPTOR.map((r) => r.label);
  const colors = RECEPTOR.map((r) => (r.drug === 'tirzepatide' ? COLOR.tirz15 : COLOR.sema));
  return mount(el, (narrow) => ({
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Binding affinity, Ki',
        x: RECEPTOR.map((r) => r.ki?.[0] ?? null),
        y: labels,
        error_x: {
          type: 'data',
          array: RECEPTOR.map((r) => r.ki?.[1] ?? 0),
          color: '#80838f',
          thickness: 1.5,
          width: 4,
        },
        marker: { symbol: 'circle', size: 13, color: colors },
        hovertemplate: 'Ki %{x} nM<extra>%{y}</extra>',
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'cAMP potency, EC50',
        x: RECEPTOR.map((r) => r.ec50[0]),
        y: labels,
        error_x: {
          type: 'data',
          array: RECEPTOR.map((r) => r.ec50[1]),
          color: '#80838f',
          thickness: 1.5,
          width: 4,
        },
        marker: {
          symbol: 'diamond',
          size: 14,
          color: colors,
          line: { color: '#eceef4', width: 1 },
        },
        hovertemplate: 'EC50 %{x} nM<extra>%{y}</extra>',
      },
    ],
    layout: {
      title: {
        text: narrow
          ? ''
          : 'Strong at the GIP receptor, weaker than semaglutide at the GLP-1 receptor',
      },
      margin: { l: narrow ? 150 : 210, b: 70 },
      xaxis: {
        type: 'log',
        autorange: 'reversed',
        range: [Math.log10(12), Math.log10(0.008)],
        tickvals: [0.01, 0.03, 0.1, 0.3, 1, 3, 10],
        title: { text: 'nM, log scale (more potent →)' },
        zeroline: false,
      },
      yaxis: {
        autorange: 'reversed',
        categoryorder: 'array',
        categoryarray: labels,
        zeroline: false,
      },
      legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
    },
  }));
}
