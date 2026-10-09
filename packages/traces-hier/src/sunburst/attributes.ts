/**
 * `sunburst` attribute schema (plan E13.2, ADR-002), following plotly.js'
 * `traces/sunburst/attributes.js` and `layout_attributes.js`: the hierarchy attributes shared with
 * treemap and icicle (`../hierarchy/attributes.ts`) plus `rotation` and `insidetextorientation`.
 * `domain` comes from the registry (the trace is in the `domain` category); `ids`, `customdata`,
 * `hovertext`, `hovertemplate`, `opacity`, … are common trace attributes.
 *
 * Deferred: the layered 3D extrusion (`depth` / `depthstep`, P2).
 */
import { attr } from '@mk7s/holochart-core';
import {
  hierarchyDataAttributes,
  hierarchyLayoutAttributes,
  hierarchyMarkerAttributes,
  hierarchyStyleAttributes,
  hierarchyTextAttributes,
} from '../hierarchy/attributes.ts';

/** The sunburst schema. @experimental */
// A pure IIFE, so bundles without this trace drop the whole schema: a package ships as one file,
// where top-level `attr.*()` calls would otherwise look side-effectful (E21.6).
export const sunburstAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...hierarchyDataAttributes('sector'),
      marker: hierarchyMarkerAttributes('sector', 1),
      ...hierarchyStyleAttributes(),
      ...hierarchyTextAttributes('sector'),
      insidetextorientation: attr.enumerated({
        values: ['horizontal', 'radial', 'tangential', 'auto'],
        dflt: 'auto',
        editType: 'plot',
        description:
          'Orientation of labels inside sectors: `horizontal`, `radial` (along the radius), `tangential` (across it), or `auto` (whichever is largest).',
      }),
      rotation: attr.angle({
        dflt: 0,
        editType: 'plot',
        description:
          "Rotates the whole diagram counterclockwise by this many degrees. By default the first sector starts at 3 o'clock.",
      }),
    },
    {
      description:
        'Sunburst: a hierarchy as rings of sectors, children outside their parents, with drill-down.',
    },
  ))();

/** Layout attributes owned by `sunburst` (coerced when a sunburst trace is present). @internal */
// Pure IIFE: see above.
export const sunburstLayoutAttributes = /* @__PURE__ */ (() =>
  hierarchyLayoutAttributes('sunburst'))();
