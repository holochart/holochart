/**
 * Event data of `scattergeo` points (backlog GEO6), following plotly.js `scattergeo/event_data.js`
 * (MIT): every point of a click, hover or selection event carries `lon`, `lat` and `location`
 * (`null` for a trace given by coordinates), next to the runtime's `pointNumber`, `curveNumber`…
 * A location that names a feature of the trace's `geojson` also carries the feature's
 * `properties`. For a trace given by `locations`, `lon` and `lat` are where it is drawn.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { ScattergeoCalc } from './calc.ts';
import { geoPointFields } from './hover.ts';

/** The fields of point `i` for selection events (`TraceModule.eventData`). */
export function scattergeoEventData(
  calc: ScattergeoCalc,
  trace: FullTrace,
  i: number,
): Readonly<Record<string, unknown>> {
  return geoPointFields(calc, trace, i).fields;
}
