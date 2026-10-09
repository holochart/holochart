/**
 * `cone` attribute schema (plan E14.5, ADR-002), following plotly.js `cone/attributes.js`: the
 * positions (`x`, `y`, `z`) and vectors (`u`, `v`, `w`), cone sizing (`sizemode`, `sizeref`) and
 * placement (`anchor`), the colorscale of the vector norms, Plotly's lighting (`lighting`,
 * `lightposition`), hover (`hoverinfo` with the `u` / `v` / `w` / `norm` flags, hover formats).
 * Common trace attributes (`name`, `opacity`, `hovertext`, `hovertemplate`, …) come from core.
 *
 * Deferred: `hovertemplatefallback`, the `material` extension (cones draw with Plotly's model).
 */
import { attr } from '@mk7s/holochart-core';
import { colorscaleAttributes } from '@mk7s/holochart-traces-basic';
import { sceneIdAttribute } from '../scene/layout-attributes.ts';
import { sceneLightingAttributes } from '../scene/lighting-attributes.ts';

function position(letter: 'x' | 'y' | 'z') {
  return attr.dataArray({
    editType: 'calc',
    role: 'data',
    description: `${letter.toUpperCase()} coordinates of the cones (numbers, dates or categories).`,
  });
}

function component(letter: 'u' | 'v' | 'w', axis: 'x' | 'y' | 'z') {
  return attr.dataArray({
    editType: 'calc',
    role: 'data',
    description: `${axis} component of the vector field at each position (numbers).`,
  });
}

function hoverformat(letter: string, what: string) {
  return attr.string({
    dflt: '',
    editType: 'none',
    description: `d3 number format of ${letter} values in hover labels. Default: ${what}.`,
  });
}

/** The cone schema. @experimental */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const coneAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      scene: sceneIdAttribute,
      x: position('x'),
      y: position('y'),
      z: position('z'),
      u: component('u', 'x'),
      v: component('v', 'y'),
      w: component('w', 'z'),
      sizemode: attr.enumerated({
        values: ['scaled', 'absolute', 'raw'],
        dflt: 'scaled',
        editType: 'calc',
        description:
          "How cone lengths follow the vector norms. `scaled`: scaled so that the cones fit between neighbouring positions, times `sizeref`. `absolute`: the same, with `sizeref` in vector-norm units (the largest vector gets `sizeref`'s length). `raw`: the vectors' own lengths in data units, times `sizeref`.",
      }),
      sizeref: attr.number({
        min: 0,
        editType: 'calc',
        description:
          'Scale of the cones (see `sizemode`). Default: 1 with `sizemode: "raw"`, else 0.5.',
      }),
      anchor: attr.enumerated({
        values: ['tip', 'tail', 'cm', 'center'],
        dflt: 'cm',
        editType: 'calc',
        description:
          'Which part of the cone sits at its position: the tip, the tail (base), the center of mass (`cm`, a quarter of the way from tail to tip) or the middle (`center`).',
      }),
      text: attr.string({
        arrayOk: true,
        dflt: '',
        editType: 'calc',
        description: 'Text per cone, shown in hover labels and as `%{text}` in templates.',
      }),
      hoverinfo: attr.flaglist({
        flags: ['x', 'y', 'z', 'u', 'v', 'w', 'norm', 'text', 'name'],
        extras: ['all', 'none', 'skip'],
        arrayOk: true,
        dflt: 'x+y+z+norm+text+name',
        editType: 'none',
        description:
          "Which fields hover labels show: the position (`x`, `y`, `z`), the vector (`u`, `v`, `w`), its `norm`, `text` and the trace `name`; `'skip'` also turns hover events off.",
      }),
      ...colorscaleAttributes({
        colorAttr: 'u/v/w norm',
        showscale: true,
        showscaleDflt: true,
        coloraxis: true,
      }),
      ...sceneLightingAttributes('cone'),
      xhoverformat: hoverformat('x', "the scene's x axis format"),
      yhoverformat: hoverformat('y', "the scene's y axis format"),
      zhoverformat: hoverformat('z', "the scene's z axis format"),
      uhoverformat: hoverformat('u', "the scene's x axis format"),
      vhoverformat: hoverformat('v', "the scene's y axis format"),
      whoverformat: hoverformat('w', "the scene's z axis format"),
    },
    {
      description:
        'A 3D vector field drawn as cones: one lit cone per position, pointing along its vector, sized by the vector norms and colored by them through a colorscale (one instanced draw call).',
    },
  ))();
