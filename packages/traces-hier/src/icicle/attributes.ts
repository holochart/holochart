/**
 * `icicle` attribute schema (plan E13.4, ADR-002), following plotly.js'
 * `traces/icicle/attributes.js` and `layout_attributes.js`: the hierarchy attributes shared with
 * sunburst and treemap (`../hierarchy/attributes.ts`) plus `tiling` (orientation, flip, pad), the
 * path bar and `textposition` of treemaps. `domain` comes from the registry.
 */
import { attr } from '@mk7s/holochart-core';
import {
  hierarchyDataAttributes,
  hierarchyLayoutAttributes,
  hierarchyMarkerAttributes,
  hierarchyStyleAttributes,
  hierarchyTextAttributes,
} from '../hierarchy/attributes.ts';
import { pathbarAttributes, tileTextposition } from '../treemap/attributes.ts';

/** The icicle schema. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const icicleAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...hierarchyDataAttributes('cell'),
      tiling: attr.object(
        {
          orientation: attr.enumerated({
            values: ['v', 'h'],
            dflt: 'h',
            editType: 'plot',
            description:
              'Direction levels go in: `h` from left to right (right to left with `flip: x`), `v` from top to bottom (bottom to top with `flip: y`).',
          }),
          flip: attr.flaglist({
            flags: ['x', 'y'],
            dflt: '',
            editType: 'plot',
            description: 'Mirror the layout along x and / or y.',
          }),
          pad: attr.number({
            min: 0,
            dflt: 0,
            editType: 'plot',
            description: 'Gap between cells, px.',
          }),
        },
        { editType: 'calc', description: 'How cells are laid out.' },
      ),
      marker: hierarchyMarkerAttributes('cell', 1),
      ...hierarchyStyleAttributes(),
      pathbar: pathbarAttributes(),
      ...hierarchyTextAttributes('cell'),
      textposition: tileTextposition(),
    },
    {
      description:
        'Icicle: a hierarchy as rows (or columns) of cells, children next to their parents, with a path bar and drill-down.',
    },
  ))();

/** Layout attributes owned by `icicle` (coerced when an icicle trace is present). */
// Pure IIFE: see above.
export const icicleLayoutAttributes = /* @__PURE__ */ (() => hierarchyLayoutAttributes('icicle'))();
