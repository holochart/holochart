/**
 * `bar3d` attribute schema (plan E14.9, a Holochart extension; ADR-002): true 3D bars on an x/y
 * grid. Positions `x`, `y` (numbers, dates or categories, per the scene's axes), heights `z`, the
 * bar footprint (`width` along x, `depth` along y, in axis units), `base`, stacking of traces
 * (`stackgroup`), the marker (`color` per bar or through a colorscale, which maps `z` when no
 * color array is given; `opacity`; `line`: the box edges), Plotly's `lighting` / `lightposition`
 * and the `material` extension, hover (`hoverinfo` with a `base` flag, hover formats). Common trace
 * attributes (`name`, `opacity`, `hovertext`, `hovertemplate`, …) come from core.
 */
import { attr } from '@mk7s/holochart-core';
import { colorscaleAttributes } from '@mk7s/holochart-traces-basic';
import { sceneIdAttribute } from '../scene/layout-attributes.ts';
import {
  sceneLightingAttributes,
  sceneMaterialAttributes,
  type SceneLightingDefaults,
} from '../scene/lighting-attributes.ts';

/**
 * Plotly's mesh lighting with more directional contrast (boxes read by the shade of their faces:
 * top, front and side must differ) and no normal epsilons (box faces are never degenerate).
 */
export const BAR3D_LIGHTING: SceneLightingDefaults = {
  lighting: { ambient: 0.55, diffuse: 0.6, specular: 0.08, roughness: 0.5, fresnel: 0.2 },
  lightposition: [1e5, 1e5, 0],
};

function position(letter: 'x' | 'y') {
  return attr.dataArray({
    editType: 'calc',
    role: 'data',
    description: `${letter.toUpperCase()} position of each bar's center (numbers, dates or categories, per the scene's ${letter} axis).`,
  });
}

function extent(letter: 'x' | 'y', name: string) {
  return attr.number({
    min: 0,
    arrayOk: true,
    editType: 'calc',
    description: `Bar ${name} along the ${letter} axis, in ${letter} axis units (one category is 1, dates in ms), or one per bar. Default: 0.8 of the smallest distance between the trace's distinct ${letter} positions (1 with a single position).`,
  });
}

function hoverformat(letter: string) {
  return attr.string({
    dflt: '',
    editType: 'none',
    description: `d3 number format of ${letter} values in hover labels. Default: the scene's ${letter} axis format.`,
  });
}

/** The bar3d schema. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const bar3dAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      scene: sceneIdAttribute,
      x: position('x'),
      y: position('y'),
      z: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'Bar heights along the z axis, from `base` (or the top of the bar below it with `stackgroup`). Negative heights go down.',
      }),
      base: attr.number({
        arrayOk: true,
        editType: 'calc',
        description:
          'Where the bars start on the z axis (z data units), or one per bar. Default 0. In a `stackgroup`, only the bottom bar of each stack uses it.',
      }),
      width: extent('x', 'width'),
      depth: extent('y', 'depth'),
      stackgroup: attr.string({
        dflt: '',
        editType: 'calc',
        description:
          "Stack this trace's bars on those of earlier `bar3d` traces of the same scene with the same `stackgroup` (Plotly's `barmode: 'stack'`, per trace like scatter's `stackgroup`): bars at the same (x, y) stack in trace order. Empty: no stacking (bars at the same position overlap).",
      }),
      text: attr.string({
        arrayOk: true,
        dflt: '',
        editType: 'calc',
        description: 'Text per bar, shown in hover labels and as `%{text}` in templates.',
      }),
      hoverinfo: attr.flaglist({
        flags: ['x', 'y', 'z', 'base', 'text', 'name'],
        extras: ['all', 'none', 'skip'],
        arrayOk: true,
        dflt: 'all',
        editType: 'none',
        description:
          "Which fields hover labels show: the position (`x`, `y`), the height (`z`), the bar's `base` (when it has one or is stacked), `text` and the trace `name`; `'skip'` also turns hover events off.",
      }),
      marker: attr.object(
        {
          color: attr.color({
            arrayOk: true,
            editType: 'style',
            description:
              'Bar color, or one per bar: colors, or numbers mapped through `marker.colorscale`. With a colorscale (or `marker.coloraxis`) and no color array, the bars are colored by their height `z`. Defaults to the colorway.',
          }),
          ...colorscaleAttributes({
            colorAttr: 'marker.color',
            showscale: true,
            coloraxis: true,
          }),
          opacity: attr.number({
            min: 0,
            max: 1,
            dflt: 1,
            editType: 'style',
            description:
              'Bar opacity (times the trace `opacity`). Translucent bars are sorted back to front as the camera moves.',
          }),
          line: attr.object(
            {
              color: attr.color({
                dflt: '#444',
                editType: 'style',
                description: 'Color of the box edges.',
              }),
              width: attr.number({
                min: 0,
                dflt: 1,
                editType: 'style',
                description:
                  'Width of the box edges in CSS px, drawn in the faces at any depth (half on each face of an edge); 0 for none.',
              }),
            },
            { editType: 'style', description: 'The edges of the boxes.' },
          ),
        },
        { editType: 'calc', description: 'Bar style.' },
      ),
      ...sceneLightingAttributes(BAR3D_LIGHTING),
      ...sceneMaterialAttributes,
      xhoverformat: hoverformat('x'),
      yhoverformat: hoverformat('y'),
      zhoverformat: hoverformat('z'),
    },
    {
      description:
        'True 3D bars on an x/y grid (a Holochart extension): lit boxes of height `z` at (`x`, `y`), categorical or numeric, stacked across traces with `stackgroup`, colored per bar or by height through a colorscale, one instanced draw call per trace.',
    },
  ))();
