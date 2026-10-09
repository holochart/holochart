/**
 * Accessible description of `choropleth` traces (plan E17.1, backlog GEO6): the number of regions
 * drawn, the lowest and the highest by name with their values (formatted like the hover labels),
 * the locations that are not drawn, and a table of the first locations and values. Color is the
 * only encoding of a choropleth, so the table is where a reader without it finds the values. A
 * trace with an `elevation` (the height of the regions on a 3D globe, backlog GEO8) names the
 * region with the largest and has it as a column of the table.
 *
 * The summary is English, like every trace's `describe()`. The sentence of the chart's generated
 * summary (plan E17.2), which is in the chart's language, comes from the `insight`: the drawn
 * regions as values by label, of which the runtime says the highest and the lowest ("GDP is
 * highest at United States of America (30k) and lowest at Brazil (0.5).").
 */
import {
  accessibleText,
  countText,
  traceNameText,
  type DescribeContext,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import { geoLabel } from '../scattergeo/hover.ts';
import type { ChoroplethCalc } from './calc.ts';
import { choroplethRegionName } from './hover.ts';

/** The `choropleth` trace's `describe()`. */
export function describeChoropleth(ctx: DescribeContext<ChoroplethCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const kind = 'choropleth map';
  const name = traceNameText(trace['name'], ctx.index);
  const n = calc.length;
  const drawn = calc.drawn?.index ?? [];
  const value = (i: number): string => geoLabel(ctx.fullLayout, calc.z[i] as number);
  let lowest = -1;
  let highest = -1;
  for (let k = 0; k < drawn.length; k++) {
    const i = drawn[k] as number;
    const z = calc.z[i] as number;
    if (lowest < 0 || z < (calc.z[lowest] as number)) lowest = i;
    if (highest < 0 || z > (calc.z[highest] as number)) highest = i;
  }
  let summary = `Choropleth map "${name}": ${countText(drawn.length, 'region')}.`;
  const named = (i: number): string =>
    `${accessibleText(choroplethRegionName(calc, trace, i))} (${value(i)})`;
  if (drawn.length > 1 && calc.z[lowest] !== calc.z[highest]) {
    summary += ` Lowest: ${named(lowest)}. Highest: ${named(highest)}.`;
  } else if (drawn.length > 1) {
    summary += ` All at ${value(lowest)}.`;
  } else if (drawn.length === 1) {
    summary += ` ${named(lowest)}.`;
  }
  // The second value: the height of the regions on a 3D globe.
  const elevation = calc.elevation;
  const height = (i: number): string => geoLabel(ctx.fullLayout, elevation?.[i] as number);
  if (elevation && drawn.length > 0) {
    let tallest = -1;
    for (let k = 0; k < drawn.length; k++) {
      const i = drawn[k] as number;
      const e = elevation[i] as number;
      if (e > 0 && Number.isFinite(e) && (tallest < 0 || e > (elevation[tallest] as number))) {
        tallest = i;
      }
    }
    if (tallest >= 0) {
      const raised = calc.subplot?.globe ? 'Regions rise by elevation' : 'Elevation';
      summary += ` ${raised}: highest at ${accessibleText(choroplethRegionName(calc, trace, tallest))} (${height(tallest)}).`;
    }
  }
  if (calc.unresolved) summary += ' Its regions are not drawn.';
  else if (drawn.length < n) summary += ` ${countText(n - drawn.length, 'location')} not drawn.`;
  const locations = calc.locations?.locations;
  const text = trace['text'];
  const hasText = Array.isArray(text);
  const columns = ['location', 'value'];
  if (elevation) columns.push('elevation');
  if (hasText) columns.push('text');
  const row = (i: number): string[] => {
    const cells = [accessibleText(locations?.[i]), value(i)];
    if (elevation) cells.push(height(i));
    if (hasText) cells.push(accessibleText((text as unknown[])[i]));
    return cells;
  };
  const rows: string[][] = [];
  for (let i = 0; i < Math.min(n, ctx.maxRows); i++) rows.push(row(i));
  const table = { caption: name, columns, rows, total: n, row };
  // While the regions are loading (or when they cannot be) there is nothing to say of them.
  if (calc.unresolved) return { kind, summary, table };
  const shown = new Uint8Array(n);
  for (let k = 0; k < drawn.length; k++) shown[drawn[k] as number] = 1;
  return {
    kind,
    summary,
    table,
    insight: {
      kind: 'shares',
      // Values by label, not parts of a whole: the highest and the lowest are named.
      part: 'bar',
      length: n,
      values: calc.z,
      label: (i) => accessibleText(choroplethRegionName(calc, trace, i)),
      skip: (i) => shown[i] !== 1,
      formatValue: (v) => geoLabel(ctx.fullLayout, v),
    },
  };
}
