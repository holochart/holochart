/**
 * `isosurface` attribute schema (plan E14.8, ADR-002), following plotly.js
 * `isosurface/attributes.js`, and the attributes `volume` shares with it ({@link isoAttributes}):
 * the grid (`x`, `y`, `z`, `value`), the value range (`isomin`, `isomax`), what is drawn
 * (`surface`, `spaceframe`, `caps`, `slices`), the colorscale of the values, Plotly's lighting
 * (`lighting`, `lightposition`, `flatshading`, and the `material` extension) and hover
 * (`text`, `hovertext`, hover formats with `valuehoverformat`). Common trace attributes (`name`,
 * `opacity`, `hoverinfo`, `hovertemplate`, …) come from core.
 *
 * Deferred: `contour` (Plotly's hover iso-line), `x/y/zcalendar`, `hovertemplatefallback`.
 */
import { attr } from '@mk7s/holochart-core';
import { colorscaleAttributes } from '@mk7s/holochart-traces-basic';
import { sceneIdAttribute } from '../scene/layout-attributes.ts';
import { sceneLightingAttributes, sceneMaterialAttributes } from '../scene/lighting-attributes.ts';

type IsoKind = 'isosurface' | 'volume';

function coordinate(letter: 'x' | 'y' | 'z') {
  return attr.dataArray({
    editType: 'calc',
    role: 'data',
    description: `${letter.toUpperCase()} coordinate of every grid point (numbers, dates or categories): \`x\`, \`y\`, \`z\` and \`value\` are flattened columns of a rectilinear grid, one entry per point, the axes nested in any order.`,
  });
}

function sliceAxis(letter: 'x' | 'y' | 'z') {
  return attr.object(
    {
      show: attr.boolean({
        dflt: false,
        editType: 'calc',
        description: `Draw slices: planes of constant ${letter} through the grid, where the values are in \`[isomin, isomax]\`.`,
      }),
      locations: attr.dataArray({
        editType: 'calc',
        description: `${letter} positions of the slices (between grid planes: interpolated). Default: every inner grid plane of ${letter}.`,
      }),
      fill: attr.number({
        min: 0,
        max: 1,
        dflt: 1,
        editType: 'calc',
        description:
          'Share of each slice triangle drawn: below 1 leaves a hole in each triangle (a lattice), 0 hides the slices.',
      }),
    },
    { editType: 'calc', description: `Slices of constant ${letter}.` },
  );
}

function capAxis(letter: 'x' | 'y' | 'z') {
  return attr.object(
    {
      show: attr.boolean({
        dflt: true,
        editType: 'calc',
        description: `Draw the caps: the grid's two boundary faces of constant ${letter} where the values are in \`[isomin, isomax]\`, which close the surfaces cut by the grid's edge.`,
      }),
      fill: attr.number({
        min: 0,
        max: 1,
        dflt: 1,
        editType: 'calc',
        description:
          'Share of each cap triangle drawn: below 1 leaves a hole in each triangle, 0 hides the caps.',
      }),
    },
    { editType: 'calc', description: `The caps at the grid's first and last ${letter}.` },
  );
}

function hoverformat(letter: string, what: string) {
  return attr.string({
    dflt: '',
    editType: 'none',
    description: `d3 number format of ${letter} values in hover labels. Default: ${what}.`,
  });
}

/** The attributes `isosurface` and `volume` share (their Plotly defaults differ per `kind`). */
export function isoAttributes(kind: IsoKind) {
  return {
    scene: sceneIdAttribute,
    x: coordinate('x'),
    y: coordinate('y'),
    z: coordinate('z'),
    value: attr.dataArray({
      editType: 'calc',
      role: 'data',
      description:
        'The value at every grid point (numbers): the field whose level surfaces are drawn and which the colorscale maps.',
    }),
    isomin: attr.number({
      editType: 'calc',
      description: `Lower end of the value range ${kind === 'volume' ? 'drawn' : 'of the isosurfaces'}. Default: the smallest value.`,
    }),
    isomax: attr.number({
      editType: 'calc',
      description: `Upper end of the value range ${kind === 'volume' ? 'drawn' : 'of the isosurfaces'}. Default: the largest value.`,
    }),
    surface: attr.object(
      {
        show: attr.boolean({
          dflt: true,
          editType: 'calc',
          description: 'Draw the isosurfaces between `isomin` and `isomax`.',
        }),
        count: attr.integer({
          min: 1,
          dflt: 2,
          editType: 'calc',
          description:
            'Number of isosurfaces, evenly spread from `isomin` to `isomax` (2: just those two; 1: the middle value).',
        }),
        fill: attr.number({
          min: 0,
          max: 1,
          dflt: 1,
          editType: 'calc',
          description:
            'Share of each surface triangle drawn: below 1 leaves a hole in each triangle (a lattice), 0 hides the surfaces.',
        }),
        pattern: attr.flaglist({
          flags: ['A', 'B', 'C', 'D', 'E'],
          extras: ['all', 'odd', 'even'],
          dflt: 'all',
          editType: 'calc',
          description:
            "Which parts of the surfaces are drawn: every grid cell is cut into five tetrahedra (`A`–`D` at four corners, `E` in the middle); `'all'`, a combination such as `'A+B'`, or `'odd'` / `'even'` (only the cells whose `i + j + k` is odd / even: a checkerboard).",
        }),
      },
      { editType: 'calc', description: 'The isosurfaces.' },
    ),
    spaceframe: attr.object(
      {
        show: attr.boolean({
          dflt: false,
          editType: 'calc',
          description:
            'Draw the space frame: the faces of the central tetrahedron of every grid cell inside `[isomin, isomax]`, useful with open surfaces or caps.',
        }),
        fill: attr.number({
          min: 0,
          max: 1,
          dflt: kind === 'volume' ? 1 : 0.15,
          editType: 'calc',
          description: `Share of each space-frame triangle drawn (default ${kind === 'volume' ? '1' : '0.15: thin frames'}).`,
        }),
      },
      { editType: 'calc', description: 'The space frame.' },
    ),
    slices: attr.object(
      { x: sliceAxis('x'), y: sliceAxis('y'), z: sliceAxis('z') },
      { editType: 'calc', description: 'Slices through the grid.' },
    ),
    caps: attr.object(
      { x: capAxis('x'), y: capAxis('y'), z: capAxis('z') },
      { editType: 'calc', description: "Caps on the grid's boundary." },
    ),
    text: attr.string({
      arrayOk: true,
      dflt: '',
      editType: 'calc',
      description:
        'Text per grid point, shown in hover labels (after the value) and as `%{text}` in templates.',
    }),
    ...colorscaleAttributes({
      colorAttr: 'value',
      showscale: true,
      showscaleDflt: true,
      coloraxis: true,
    }),
    flatshading: attr.boolean({
      dflt: true,
      editType: 'calc',
      description:
        'Flat shading: one normal per triangle (the default, as in Plotly: the extracted triangles share no vertices, so smooth shading looks the same).',
    }),
    ...sceneLightingAttributes(kind),
    ...sceneMaterialAttributes,
    xhoverformat: hoverformat('x', "the scene's x axis format"),
    yhoverformat: hoverformat('y', "the scene's y axis format"),
    zhoverformat: hoverformat('z', "the scene's z axis format"),
    valuehoverformat: hoverformat('value', 'the value with hover precision'),
  };
}

/** The isosurface schema. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const isosurfaceAttributes = /* @__PURE__ */ (() =>
  attr.object(isoAttributes('isosurface'), {
    description:
      'Isosurfaces of a scalar field on a 3D grid: surfaces where the value is constant, between `isomin` and `isomax`, with caps, slices and a space frame, colored by value.',
  }))();
