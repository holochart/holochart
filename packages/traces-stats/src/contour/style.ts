/**
 * Contour colors of `histogram2dcontour` and `contour` (plan E10.3, E11.2), following plotly.js
 * `contour/make_color_map.js`, `contour/colorbar.js` and `contour/style.js`:
 *
 * - `fill`: band k (between level k and k + 1) takes the color at its middle, the colorscale
 *   spanning `[start − size/2, last + size/2]`; the area below the first level takes the band −1
 *   color. The colorbar shows the bands as blocks with hard edges at the levels.
 * - `lines`: each line takes the color at its level, the colorscale spanning `[start, last]`.
 * - `heatmap`: the trace's `zmin` / `zmax` domain, as a heatmap (continuous colorbar).
 * - `none`: lines in `line.color`, no colorbar.
 * - constraint contours: lines in `line.color`, the shaded region in `fillcolor`, no colorbar.
 */
import { toRGBA, type FullLayout, type FullTrace, type RGBA } from '@mk7s/holochart-core';
import { sampleColorscale } from '@mk7s/holochart-render';
import type { ColorbarSpec, LegendGlyph, LegendIconContext } from '@mk7s/holochart-runtime';
import { rgbaToCss } from '@mk7s/holochart-traces-basic';
import { heatmapLegendIcon } from '../histogram2d/index.ts';
import { recordedZExtent, zColorMapping, type ZColorMapping } from '../histogram2d/colorscale.ts';
import { bandValue, contourColorRange, type ContourLevels } from '../shared/contour.ts';
import { levelsOf } from './field.ts';

/** Whether a trace draws constraint contours. @internal */
export function isConstraint(trace: FullTrace): boolean {
  return (trace['contours'] as { type?: unknown } | undefined)?.type === 'constraint';
}

/** Color of `z` in a colorscale spanning `[lo, hi]` (clamped; `reversescale` honored). */
export function colorIn(mapping: ZColorMapping, lo: number, hi: number, z: number): RGBA {
  let t = hi > lo ? (z - lo) / (hi - lo) : 0.5;
  t = Math.min(1, Math.max(0, t));
  if (mapping.reversescale) t = 1 - t;
  return sampleColorscale(mapping.colorscale, t);
}

/**
 * Fill colors: the background (band −1), then one per level, 4 floats each (sRGB 0–1), for
 * `coloring: 'fill'`.
 */
export function bandColors(levels: ContourLevels, mapping: ZColorMapping): Float32Array {
  const [lo, hi] = contourColorRange('fill', levels, mapping.zmin, mapping.zmax);
  const n = levels.levels.length;
  const out = new Float32Array((n + 1) * 4);
  for (let k = -1; k < n; k++) out.set(colorIn(mapping, lo, hi, bandValue(levels, k)), (k + 1) * 4);
  return out;
}

/** Line color of each level: its colormap color (`coloring: 'lines'`) or `line.color`. */
export function levelLineColors(
  trace: FullTrace,
  levels: ContourLevels,
  mapping: ZColorMapping | undefined,
): RGBA[] {
  const contours = (trace['contours'] ?? {}) as Record<string, unknown>;
  if (contours['coloring'] === 'lines' && mapping && !isConstraint(trace)) {
    const [lo, hi] = contourColorRange('lines', levels, mapping.zmin, mapping.zmax);
    return levels.levels.map((l) => colorIn(mapping, lo, hi, l));
  }
  const line = (trace['line'] ?? {}) as Record<string, unknown>;
  const color = (typeof line['color'] === 'string' ? toRGBA(line['color']) : undefined) ?? [
    0, 0, 0, 1,
  ];
  return levels.levels.map(() => color);
}

/**
 * The colorscale of a contour trace: `undefined` for `coloring: 'none'` and constraint contours
 * (lines in `line.color` only). `extent` is the value extent.
 * @internal
 */
export function contourMapping(
  trace: FullTrace,
  fullLayout: FullLayout,
  extent?: readonly [number, number],
): ZColorMapping | undefined {
  const coloring = (trace['contours'] as { coloring?: unknown } | undefined)?.coloring;
  if (coloring === 'none' || isConstraint(trace)) return undefined;
  return zColorMapping(trace, fullLayout, extent);
}

/**
 * The `colorbar` hook: bands for `fill` (hard steps at the levels, over the band colors' span
 * widened to the data), a continuous bar for `heatmap` and `lines`, nothing for `none`.
 * @internal
 */
export function contourColorbar(trace: FullTrace, fullLayout: FullLayout): ColorbarSpec | null {
  if (trace.visible !== true || isConstraint(trace)) return null;
  const coloring = (trace['contours'] as { coloring?: unknown } | undefined)?.coloring;
  if (coloring === 'none') return null;
  const axisId = trace['coloraxis'];
  const axis =
    typeof axisId === 'string'
      ? (fullLayout[axisId] as Record<string, unknown> | undefined)
      : undefined;
  const owner = axis ?? trace;
  if (owner['showscale'] !== true) return null;
  const cb = owner['colorbar'];
  if (cb === null || typeof cb !== 'object') return null;
  const extent = recordedZExtent(trace);
  if (!extent) return null;
  const mapping = zColorMapping(trace, fullLayout, extent);
  const common = {
    ...(axis && typeof axisId === 'string' ? { coloraxis: axisId } : {}),
    attributes: cb as Record<string, unknown>,
  };
  if (coloring === 'heatmap') {
    return {
      colorscale: cssStops(mapping, 0, 1),
      cmin: mapping.zmin,
      cmax: mapping.zmax,
      ...common,
    };
  }
  const levels = levelsOf(trace, extent);
  if (coloring === 'lines') {
    const [lo, hi] = contourColorRange('lines', levels, mapping.zmin, mapping.zmax);
    return { colorscale: cssStops(mapping, 0, 1), cmin: lo, cmax: hi, ...common };
  }
  // Filled bands, as blocks between the levels (Plotly's `fillLevels`), over the color range
  // widened to the data.
  const [flo, fhi] = contourColorRange('fill', levels, mapping.zmin, mapping.zmax);
  const lo = Math.min(flo, mapping.zmin);
  const hi = Math.max(fhi, mapping.zmax);
  const span = hi - lo || 1;
  const stops: [number, string][] = [];
  const n = levels.levels.length;
  for (let k = -1; k < n; k++) {
    const from = k < 0 ? lo : levels.levels[k]!;
    const to = k + 1 < n ? levels.levels[k + 1]! : hi;
    const css = rgbaToCss(colorIn(mapping, flo, fhi, bandValue(levels, k)));
    stops.push([(from - lo) / span, css], [(to - lo) / span, css]);
  }
  return { colorscale: stops, cmin: lo, cmax: hi, ...common };
}

/** CSS stops of a mapping's colorscale between positions `a` and `b` (reversed if asked). */
function cssStops(mapping: ZColorMapping, a: number, b: number): [number, string][] {
  const stops = mapping.colorscale.map(([p, c]): [number, string] => [
    a + p * (b - a),
    rgbaToCss(c),
  ]);
  return mapping.reversescale
    ? stops.map(([p, c]): [number, string] => [1 - p, c]).reverse()
    : stops;
}

/**
 * Legend glyph: the line for `coloring: 'none'`, the shaded region with its outline for
 * constraint contours, else a swatch of the colorscale.
 * @internal
 */
export function contourLegendIcon(trace: FullTrace, ctx?: LegendIconContext): LegendGlyph {
  const contours = (trace['contours'] ?? {}) as Record<string, unknown>;
  const line = (trace['line'] ?? {}) as Record<string, unknown>;
  const lineColor = typeof line['color'] === 'string' ? line['color'] : '#000';
  const lineWidth = typeof line['width'] === 'number' ? line['width'] : 0.5;
  const showLines = contours['showlines'] !== false;
  if (isConstraint(trace) && typeof trace['fillcolor'] === 'string') {
    return {
      kind: 'fill',
      fill: {
        color: trace['fillcolor'],
        ...(showLines ? { lineColor, lineWidth: Math.min(lineWidth, 2) } : {}),
      },
    };
  }
  if (contours['coloring'] !== 'none' && !isConstraint(trace)) return heatmapLegendIcon(trace, ctx);
  return {
    kind: 'line',
    line: {
      color: lineColor,
      width: lineWidth,
      ...(typeof line['dash'] === 'string' ? { dash: line['dash'] } : {}),
    },
  };
}
