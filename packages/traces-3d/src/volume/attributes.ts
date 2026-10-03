/**
 * `volume` attribute schema (plan E14.7, ADR-002), following plotly.js `volume/attributes.js`:
 * `isosurface`'s attributes ({@link isoAttributes}; the space frame's `fill` defaults to 1) plus
 * `opacityscale` (Plotly's, from `surface`), and the Holochart extension `render`: Plotly's stacked
 * isosurfaces (`'isosurfaces'`, the default) or GPU ray marching (`'raymarch'`, with `raymarch`
 * options).
 */
import { attr } from '@mk7s/holochart-core';
import { isoAttributes } from '../isosurface/attributes.ts';

/** The volume schema. @experimental */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const volumeAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...isoAttributes('volume'),
      opacityscale: attr.any({
        editType: 'calc',
        description:
          "Opacity by value, like a colorscale: `[[0, 0.1], [0.5, 1], [1, 0.4]]` (positions 0–1 of the color domain, opacities 0–1), or `'max'` (the highest values opaque, the lowest faded to 0.1), `'min'` (the reverse), `'extremes'` (both ends opaque, the middle faded) or `'uniform'` (the default: `opacity` everywhere). Multiplies `opacity`.",
      }),
      render: attr.enumerated({
        values: ['isosurfaces', 'raymarch'],
        dflt: 'isosurfaces',
        editType: 'calc',
        description:
          "How the volume is drawn (Holochart extension). `'isosurfaces'`: Plotly's stacked translucent isosurfaces (`surface.count` of them), with caps, slices and the space frame. `'raymarch'`: GPU ray marching through the grid (a 3D texture), every value in `[isomin, isomax]` drawn with the colorscale and `opacity` · `opacityscale` (the opacity of one grid cell's thickness); `surface`, `caps`, `slices` and `spaceframe` don't apply.",
      }),
      raymarch: attr.object(
        {
          step: attr.number({
            min: 0.05,
            max: 4,
            dflt: 0.5,
            editType: 'plot',
            description:
              'Sample spacing along the rays, in grid cells: smaller is finer and slower (the opacity per cell stays the same).',
          }),
          shading: attr.boolean({
            dflt: false,
            editType: 'plot',
            description:
              "Shade by the value gradient: a light at the camera, with the trace's `lighting.ambient` and `lighting.diffuse` (six more samples per step).",
          }),
        },
        { editType: 'plot', description: "Ray-marching options (`render: 'raymarch'`)." },
      ),
    },
    {
      description:
        'A scalar field on a 3D grid drawn as a volume: stacked translucent isosurfaces (as Plotly) or GPU ray marching, with an opacity scale, colored by value.',
    },
  ))();
