import { createChart, type Chart, type ConeTrace, type Scatter3dTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { linspace } from './data.mts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { CHARGE, CHARGES, K_COULOMB } from './waves-fields-planets.mts';

/**
 * The electric field around a positive and a negative charge of 1 nC, 4 cm apart, in 3D: a `cone`
 * at each point of a 9 × 5 × 5 grid points the way a small positive test charge would be pushed.
 * The field of each charge follows Coulomb's law (`E = k·q/r²`, away from the positive charge and
 * towards the negative one) and the two are added as vectors. The field is hundreds of times
 * stronger next to a charge than at the edge, so the cone length and color follow the logarithm of
 * the strength (each step on the colorbar is ten times stronger); the hover gives the strength in
 * volts per metre. The charges are `scatter3d` markers.
 */
export const meta: ExampleMeta = {
  title: 'Electricity: the field around two charges',
  description:
    '3D cones showing the direction and (log-scaled) strength of the electric field around a positive and a negative charge.',
  tags: ['demo', 'cone', 'scatter3d', '3d', 'vector field', 'colorscale', 'physics'],
  size: { width: 720, height: 560 },
  testTolerance: 0.004,
};

/** Field strength that maps to a cone length of zero, V/m. */
const E0 = 100;

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  const u: number[] = [];
  const v: number[] = [];
  const w: number[] = [];
  const strength: string[] = [];
  // The x nodes (−5, −3.75, …, 5 cm) straddle the charges at x = ±2 cm.
  for (const zz of linspace(-3, 3, 5)) {
    for (const yy of linspace(-3, 3, 5)) {
      for (const xx of linspace(-5, 5, 9)) {
        let ex = 0;
        let ey = 0;
        let ez = 0;
        for (const c of CHARGES) {
          // Distances in metres for Coulomb's law.
          const d = [(xx - c.x) / 100, yy / 100, zz / 100] as const;
          const r = Math.hypot(...d);
          const k = (c.sign * K_COULOMB * CHARGE) / r ** 3;
          ex += k * d[0];
          ey += k * d[1];
          ez += k * d[2];
        }
        const e = Math.hypot(ex, ey, ez);
        const length = Math.max(0.2, Math.log10(e / E0));
        x.push(xx);
        y.push(yy);
        z.push(zz);
        u.push((ex / e) * length);
        v.push((ey / e) * length);
        w.push((ez / e) * length);
        strength.push(`${Number(e.toPrecision(2)).toLocaleString('en-US')} V/m`);
      }
    }
  }

  const field: ConeTrace = {
    type: 'cone',
    name: 'Electric field',
    x,
    y,
    z,
    u,
    v,
    w,
    sizemode: 'scaled',
    sizeref: 0.9,
    anchor: 'center',
    cmin: 0,
    cmax: 3,
    colorscale: [
      [0, '#27306b'],
      [0.45, '#5e74d5'],
      [0.75, '#e3b04b'],
      [1, '#fff1c2'],
    ],
    colorbar: {
      title: { text: 'Field strength', side: 'right' },
      tickvals: [0, 1, 2, 3],
      ticktext: ['100 V/m', '1,000 V/m', '10,000 V/m', '100,000 V/m'],
      thickness: 12,
      len: 0.7,
    },
    text: strength,
    hovertemplate: 'Field of <b>%{text}</b><br>at x %{x} cm, y %{y} cm, z %{z} cm<extra></extra>',
  };
  const charges = CHARGES.map((c): Scatter3dTrace => ({
    type: 'scatter3d',
    mode: 'markers+text',
    name: c.name,
    x: [c.x],
    y: [0],
    z: [0],
    text: [c.sign > 0 ? '+1 nC' : '−1 nC'],
    textposition: 'top center',
    textfont: { color: LOOK.title, size: 11 },
    marker: { color: c.color, size: 12, line: { color: LOOK.title, width: 1 } },
    hovertemplate: `Charge of ${c.name}<extra></extra>`,
    showlegend: false,
  }));

  const chart: Chart = createChart(chartEl, {
    data: [field, ...charges],
    layout: {
      title: {
        text: narrow ? '' : 'Electric field: away from the positive charge, into the negative one',
      },
      margin: { l: 0, r: 0, t: 48, b: 0 },
      scene: {
        aspectmode: 'data',
        camera: { eye: { x: 0.3, y: -2.2, z: 1 } },
        xaxis: { title: { text: 'x (cm)' } },
        yaxis: { title: { text: 'y (cm)' } },
        zaxis: { title: { text: 'z (cm)' } },
      },
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
