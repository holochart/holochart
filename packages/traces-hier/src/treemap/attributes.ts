/**
 * `treemap` attribute schema (plan E13.3, ADR-002), following plotly.js'
 * `traces/treemap/attributes.js` and `layout_attributes.js`: the hierarchy attributes shared with
 * sunburst and icicle (`../hierarchy/attributes.ts`) plus `tiling`, the tile paddings, `depthfade`
 * and `cornerradius` of `marker`, the path bar (`pathbar`, shared with icicle) and 9-way
 * `textposition`. `domain` comes from the registry (the trace is in the `domain` category).
 *
 * Deferred: the "city" 3D treemap (P2).
 */
import { attr } from '@mk7s/holochart-core';
import {
  hierarchyDataAttributes,
  hierarchyLayoutAttributes,
  hierarchyMarkerAttributes,
  hierarchyStyleAttributes,
  hierarchyTextAttributes,
  hierarchyTextFont,
} from '../hierarchy/attributes.ts';

/** `pathbar` of treemap and icicle traces (Plotly's `pathbar`). */
export function pathbarAttributes() {
  return attr.object(
    {
      visible: attr.boolean({
        dflt: true,
        editType: 'plot',
        description:
          'Whether the path bar is drawn: the ancestors of the current root (`level`) as a bar outside the `domain`, one pixel away. Clicking a segment goes up to it.',
      }),
      side: attr.enumerated({
        values: ['top', 'bottom'],
        dflt: 'top',
        editType: 'plot',
        description: 'Side of the chart the path bar is on.',
      }),
      edgeshape: attr.enumerated({
        values: ['>', '<', '|', '/', '\\'],
        dflt: '>',
        editType: 'plot',
        description: 'Shape of the edges between path bar segments.',
      }),
      thickness: attr.number({
        min: 12,
        editType: 'plot',
        description:
          'Thickness of the path bar in px. Default: `pathbar.textfont.size` plus 3 px on each side.',
      }),
      textfont: hierarchyTextFont(
        'Font of path bar labels. Defaults to `textfont`, with a color contrasting the segment.',
      ),
    },
    {
      editType: 'calc',
      description: 'The path bar: where the current root sits in the hierarchy.',
    },
  );
}

/** `textposition` of treemap and icicle labels. */
export function tileTextposition() {
  return attr.enumerated({
    values: [
      'top left',
      'top center',
      'top right',
      'middle left',
      'middle center',
      'middle right',
      'bottom left',
      'bottom center',
      'bottom right',
    ],
    dflt: 'top left',
    editType: 'plot',
    description:
      'Where labels sit in their tiles. Branch labels (headers) sit in the top padding, or the bottom one for the `bottom` positions.',
  });
}

/** The treemap schema. @experimental */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const treemapAttributes = /* @__PURE__ */ (() => {
  const marker = hierarchyMarkerAttributes('tile', 1);
  const { root, sort } = hierarchyStyleAttributes();
  const pad = (side: string) =>
    attr.number({ min: 0, editType: 'plot', description: `Padding from the ${side}, px.` });
  return attr.object(
    {
      ...hierarchyDataAttributes('tile'),
      tiling: attr.object(
        {
          packing: attr.enumerated({
            values: ['squarify', 'binary', 'dice', 'slice', 'slice-dice', 'dice-slice'],
            dflt: 'squarify',
            editType: 'plot',
            description:
              "How children share their parent's area (d3-hierarchy's tilings): `squarify` (tiles close to `squarifyratio`), `binary` (balanced splits), `dice` (side by side), `slice` (stacked), `slice-dice` / `dice-slice` (alternating by level).",
          }),
          squarifyratio: attr.number({
            min: 1,
            dflt: 1,
            editType: 'plot',
            description:
              'With `squarify`: the aspect ratio tiles aim for, either way (2 gives tiles about 2:1 or 1:2). Plotly uses 1 (squares) where d3 uses the golden ratio.',
          }),
          flip: attr.flaglist({
            flags: ['x', 'y'],
            dflt: '',
            editType: 'plot',
            description: 'Mirror the layout along x and / or y.',
          }),
          pad: attr.number({
            min: 0,
            dflt: 3,
            editType: 'plot',
            description: 'Gap between sibling tiles, px.',
          }),
        },
        { editType: 'calc', description: 'How tiles are laid out.' },
      ),
      marker: attr.object(
        {
          ...marker.children,
          pad: attr.object(
            { t: pad('top'), l: pad('left'), r: pad('right'), b: pad('bottom') },
            {
              editType: 'calc',
              description:
                "Padding inside branch tiles around their children, px. Defaults to twice `textfont.size` on the header's side (the top, the bottom with `bottom` text positions) and half of `textfont.size` elsewhere.",
            },
          ),
          depthfade: attr.enumerated({
            values: [true, false, 'reversed'],
            editType: 'style',
            description:
              'Fade tile colors towards the background from the leaves up to the headers (`reversed`: from the top down to the leaves). Not with a colorscale; default true unless `marker.colors` is set.',
          }),
          cornerradius: attr.number({
            min: 0,
            dflt: 0,
            editType: 'plot',
            description:
              'Largest corner radius of tiles, px (limited by the padding on the label side).',
          }),
        },
        { editType: 'calc', description: 'Tile style.' },
      ),
      pathbar: pathbarAttributes(),
      root,
      sort,
      ...hierarchyTextAttributes('tile'),
      textposition: tileTextposition(),
    },
    {
      description:
        'Treemap: a hierarchy as nested rectangles sized by value, with a path bar and drill-down.',
    },
  );
})();

/** Layout attributes owned by `treemap` (coerced when a treemap trace is present). @internal */
// Pure IIFE: see above.
export const treemapLayoutAttributes = /* @__PURE__ */ (() =>
  hierarchyLayoutAttributes('treemap'))();
