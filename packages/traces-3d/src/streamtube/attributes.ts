/**
 * `streamtube` attribute schema (plan E14.6, ADR-002), following plotly.js
 * `streamtube/attributes.js`: the field on a grid (`x`, `y`, `z`, `u`, `v`, `w`), the starts
 * (`starts.{x, y, z}`), `maxdisplayed`, `sizeref`, the colorscale of the vector norms, Plotly's
 * lighting (`lighting`, `lightposition`) and the Holochart `material`, hover (`hoverinfo` with the
 * `u` / `v` / `w` / `norm` / `divergence` flags, hover formats) and `text`. Common trace
 * attributes (`name`, `opacity`, `hovertext`, `hovertemplate`, …) come from core.
 *
 * Deferred: `hovertemplatefallback`, the animated flow texture (P2).
 */
import { attr } from '@mk7s/holochart-core';
import { colorscaleAttributes } from '@mk7s/holochart-traces-basic';
import { sceneIdAttribute } from '../scene/layout-attributes.ts';
import { sceneLightingAttributes, sceneMaterialAttributes } from '../scene/lighting-attributes.ts';

function position(letter: 'x' | 'y' | 'z', description?: string) {
  return attr.dataArray({
    editType: 'calc',
    role: 'data',
    description:
      description ??
      `${letter.toUpperCase()} coordinates of the vector field's grid nodes (numbers, dates or categories), flattened: see \`x\`.`,
  });
}

function component(letter: 'u' | 'v' | 'w', axis: 'x' | 'y' | 'z') {
  return attr.dataArray({
    editType: 'calc',
    role: 'data',
    description: `${axis} component of the vector field at each grid node (numbers).`,
  });
}

function start(letter: 'x' | 'y' | 'z') {
  return attr.dataArray({
    editType: 'calc',
    description: `${letter} coordinates of the tubes' starting positions.`,
  });
}

function hoverformat(letter: string, what: string) {
  return attr.string({
    dflt: '',
    editType: 'none',
    description: `d3 number format of ${letter} values in hover labels. Default: ${what}.`,
  });
}

/** The streamtube schema. @experimental */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const streamtubeAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      scene: sceneIdAttribute,
      x: position(
        'x',
        'X coordinates of the grid nodes (numbers, dates or categories). `x`, `y` and `z` list every node of a rectilinear grid (uniform or not), one axis varying fastest (any order), each axis ascending or descending; other point sets draw nothing, as in Plotly.',
      ),
      y: position('y'),
      z: position('z'),
      u: component('u', 'x'),
      v: component('v', 'y'),
      w: component('w', 'z'),
      starts: attr.object(
        { x: start('x'), y: start('y'), z: start('z') },
        {
          editType: 'calc',
          description:
            'Where the tubes start. Default: the x–z plane at the lowest y of the grid, at every x and z node but the first and last.',
        },
      ),
      maxdisplayed: attr.integer({
        min: 0,
        dflt: 1000,
        editType: 'calc',
        description:
          'The most samples (segments + 1) per tube. Tubes are sampled every 10 / `maxdisplayed` of the field’s diagonal, so this also sets the sampling step.',
      }),
      sizeref: attr.number({
        min: 0,
        dflt: 1,
        editType: 'calc',
        description:
          'Scale of the tube radii. At the default 1, the tubes of adjacent starts touch where the divergence is largest.',
      }),
      text: attr.string({
        dflt: '',
        editType: 'calc',
        description: 'Text shown in every hover label of the trace (a single string).',
      }),
      hoverinfo: attr.flaglist({
        flags: ['x', 'y', 'z', 'u', 'v', 'w', 'norm', 'divergence', 'text', 'name'],
        extras: ['all', 'none', 'skip'],
        dflt: 'x+y+z+norm+text+name',
        editType: 'none',
        description:
          "Which fields hover labels show: the sample's position (`x`, `y`, `z`), the field's vector there (`u`, `v`, `w`), its `norm`, the `divergence`, `text` and the trace `name`; `'skip'` also turns hover events off.",
      }),
      ...colorscaleAttributes({
        colorAttr: 'u/v/w norm',
        showscale: true,
        showscaleDflt: true,
        coloraxis: true,
      }),
      ...sceneLightingAttributes('streamtube'),
      ...sceneMaterialAttributes,
      xhoverformat: hoverformat('x', "the scene's x axis format"),
      yhoverformat: hoverformat('y', "the scene's y axis format"),
      zhoverformat: hoverformat('z', "the scene's z axis format"),
      uhoverformat: hoverformat('u', "the scene's x axis format"),
      vhoverformat: hoverformat('v', "the scene's y axis format"),
      whoverformat: hoverformat('w', "the scene's z axis format"),
    },
    {
      description:
        'Stream tubes through a 3D vector field on a grid: streamlines integrated from starting points, drawn as lit tubes colored by the vector norm, with the radius following the divergence.',
    },
  ))();
