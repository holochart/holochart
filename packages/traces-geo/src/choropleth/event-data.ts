/**
 * Event data of `choropleth` regions (backlog GEO6), following plotly.js
 * `choropleth/event_data.js` (MIT): every point of a click, hover or selection event carries
 * `location`, `z` and `ct` (the `[lon, lat]` of the feature's point), next to the runtime's
 * `pointNumber`, `curveNumber`… A location that names a feature of the trace's `geojson` also
 * carries the feature's `properties`, and a trace with an `elevation` (Holochart's second value,
 * the height of the region on a 3D globe) the location's `elevation`.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { ChoroplethCalc } from './calc.ts';
import { choroplethPointFields } from './hover.ts';

/** The fields of location `i` for selection events (`TraceModule.eventData`). */
export function choroplethEventData(
  calc: ChoroplethCalc,
  trace: FullTrace,
  i: number,
): Readonly<Record<string, unknown>> {
  return choroplethPointFields(calc, trace, i);
}
