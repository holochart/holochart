/**
 * Accessible description of surfaces (plan E17.1, E14.3): the grid size, each axis' range and
 * where the highest point is, formatted like the scene's axes.
 */
import {
  accessibleText,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import { sceneAxisHoverText } from '../scene/hover.ts';
import { sceneFor } from '../scene/scene.ts';
import type { SurfaceCalc } from './calc.ts';
import { finiteExtent, gridX, gridY } from './grid.ts';

/** `describe()` of surface traces. */
export function describeSurface(ctx: DescribeContext<SurfaceCalc>): TraceDescription {
  const { trace, calc, index, fullLayout } = ctx;
  const kind = '3D surface';
  const name = traceNameText(trace['name'], index);
  const g = calc.grid;
  if (!g) return { kind, summary: `Surface '${accessibleText(name)}': no data.` };
  const parts = [`Surface '${name}': ${g.nx} × ${g.ny} grid`];
  const axes = sceneFor(fullLayout, trace)?.layout.axes;
  const text = (a: 0 | 1 | 2, l: number): string =>
    axes ? sceneAxisHoverText(axes[a], l) : String(l);
  for (const [a, values] of [g.x, g.y, g.z].entries()) {
    const e = finiteExtent(values);
    if (e) parts.push(`${'xyz'[a]} ${text(a as 0 | 1 | 2, e[0])}–${text(a as 0 | 1 | 2, e[1])}`);
  }
  let best = -1;
  for (let k = 0; k < g.z.length; k++) {
    const v = g.z[k]!;
    if (Number.isFinite(v) && (best < 0 || v > g.z[best]!)) best = k;
  }
  let summary = parts.join('; ');
  if (best >= 0) {
    const i = best % g.nx;
    const j = Math.floor(best / g.nx);
    summary += `; highest at x ${text(0, gridX(g, i, j))}, y ${text(1, gridY(g, i, j))}`;
  }
  return { kind, summary: `${accessibleText(summary)}.` };
}
