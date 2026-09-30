/**
 * `surface` attribute schema (plan E14.3), following plotly.js `surface/attributes.js`: the grid
 * (`z` as a 2D array, `x` / `y` as vectors or 2D arrays), `surfacecolor`, the `c` colorscale
 * (`cmin` / `cmax` / `cmid` / `cauto` on `z` or `surfacecolor`), `opacityscale`, `hidesurface`,
 * `connectgaps`, `contours.{x, y, z}`, Plotly's `lighting` / `lightposition` (and the `material`
 * extension, E8.7) and the `wireframe` extension.
 */
import { attr } from '@mk7s/holochart-core';
import { colorscaleAttributes } from '@mk7s/holochart-traces-basic';
import { sceneLightingAttributes, sceneMaterialAttributes } from '../scene/lighting-attributes.ts';
import { sceneIdAttribute } from '../scene/layout-attributes.ts';

/** Plotly's `Color.defaultLine`: contour and highlight lines. */
export const SURFACE_LINE_COLOR = '#444';

const AXES = ['x', 'y', 'z'] as const;

/** `contours.x` / `.y` / `.z`. */
function contourAxis(letter: (typeof AXES)[number]) {
  const what = letter === 'z' ? 'heights (`z`)' : `\`${letter}\` coordinates`;
  const project = attr.object(
    Object.fromEntries(
      AXES.map((wall) => [
        wall,
        attr.boolean({
          dflt: false,
          editType: 'plot',
          description: `Also draw these contour lines projected onto the scene's ${wall} wall (the far wall across the ${wall} axis, following the camera).`,
        }),
      ]),
    ) as Record<(typeof AXES)[number], ReturnType<typeof attr.boolean>>,
    {
      editType: 'plot',
      description: 'Projections of the contour lines (and highlight lines) onto the axis walls.',
    },
  );
  return attr.object(
    {
      show: attr.boolean({
        dflt: false,
        editType: 'plot',
        description: `Draw contour lines of the ${what} on the surface.`,
      }),
      start: attr.number({
        editType: 'plot',
        description: `First contour level (with \`end\` and \`size\`). Default: the ${letter} axis ticks.`,
      }),
      end: attr.number({
        editType: 'plot',
        description: `Last contour level (with \`start\` and \`size\`). Default: the ${letter} axis ticks.`,
      }),
      size: attr.number({
        min: 0,
        editType: 'plot',
        description: `Step between contour levels (with \`start\` and \`end\`). Default: the ${letter} axis ticks.`,
      }),
      project,
      color: attr.color({
        dflt: SURFACE_LINE_COLOR,
        editType: 'plot',
        description: 'Color of the contour lines.',
      }),
      usecolormap: attr.boolean({
        dflt: false,
        editType: 'plot',
        description: "Color the contour lines with the surface's colorscale instead of `color`.",
      }),
      width: attr.number({
        min: 1,
        max: 16,
        dflt: 2,
        editType: 'plot',
        description: 'Width of the contour lines, px.',
      }),
      highlight: attr.boolean({
        dflt: true,
        editType: 'plot',
        description: `Draw the contour line of the hovered point's ${letter} value while hovering.`,
      }),
      highlightcolor: attr.color({
        dflt: SURFACE_LINE_COLOR,
        editType: 'plot',
        description: 'Color of the highlight line.',
      }),
      highlightwidth: attr.number({
        min: 1,
        max: 16,
        dflt: 2,
        editType: 'plot',
        description: 'Width of the highlight line, px.',
      }),
    },
    {
      editType: 'plot',
      description: `Contour lines of constant ${letter}: drawn in the surface's shader (exact at any zoom), and projected onto the walls with \`project\`.`,
    },
  );
}

/** A 2D-capable data array (`text`, `hovertext`). */
function textArray(description: string, editType: 'calc' | 'style') {
  return attr.dataArray({ editType, description });
}

/** The surface schema. Common trace attributes (`name`, `opacity`, `hoverinfo`, …) come from core. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const surfaceAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      scene: sceneIdAttribute,
      z: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'Heights: a 2D array, `z[row][column]` (rows along y, columns along x). Non-numeric entries are gaps (see `connectgaps`).',
      }),
      x: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'x coordinates (numbers, dates or categories): one per column of `z`, or a 2D array like `z` (one per point, for grids that are not rectangular in x and y). Default: the column indices.',
      }),
      y: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'y coordinates: one per row of `z`, or a 2D array like `z`. Default: the row indices.',
      }),
      surfacecolor: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'Values the colorscale colors the surface by, a 2D array like `z`. Default: `z` itself.',
      }),
      text: textArray(
        'Text per point (a 2D array like `z`, or one string): shown in hover labels and as `%{text}`.',
        'calc',
      ),
      hovertext: textArray(
        'Hover text per point (a 2D array like `z`, or one string); takes precedence over `text`.',
        'style',
      ),
      connectgaps: attr.boolean({
        dflt: false,
        editType: 'calc',
        description:
          "Fill the gaps in `z` by interpolating their neighbours (Plotly's Laplace fill) instead of leaving holes.",
      }),
      hidesurface: attr.boolean({
        dflt: false,
        editType: 'plot',
        description: 'Hide the surface itself, keeping its contour lines and wireframe.',
      }),
      opacityscale: attr.any({
        editType: 'plot',
        description:
          "Opacity by color value, like a colorscale: `[[0, 0.1], [0.5, 1], [1, 0.4]]` (positions 0–1 of the color domain, opacities 0–1), or `'max'` (the highest values opaque, the lowest faded to 0.1), `'min'` (the reverse) or `'extremes'` (both ends opaque, the middle faded).",
      }),
      ...colorscaleAttributes({
        colorAttr: 'z or surfacecolor',
        showscale: true,
        showscaleDflt: true,
        coloraxis: true,
      }),
      contours: attr.object(
        { x: contourAxis('x'), y: contourAxis('y'), z: contourAxis('z') },
        { editType: 'plot', description: 'Contour lines of constant x, y and z.' },
      ),
      ...sceneLightingAttributes('surface'),
      ...sceneMaterialAttributes,
      wireframe: attr.object(
        {
          show: attr.boolean({
            dflt: false,
            editType: 'plot',
            description: 'Draw the grid lines of the surface over it (Holochart extension).',
          }),
          color: attr.color({
            dflt: SURFACE_LINE_COLOR,
            editType: 'plot',
            description: 'Color of the grid lines.',
          }),
          width: attr.number({
            min: 0.5,
            max: 16,
            dflt: 1,
            editType: 'plot',
            description: 'Width of the grid lines, px.',
          }),
          step: attr.integer({
            min: 1,
            dflt: 1,
            editType: 'plot',
            description: 'Draw every `step`-th grid line (1: every row and column of `z`).',
          }),
        },
        {
          editType: 'plot',
          description:
            'A wireframe over the surface: its grid lines, drawn in the shader (Holochart extension, not in Plotly).',
        },
      ),
      xhoverformat: attr.string({
        dflt: '',
        editType: 'none',
        description:
          'd3 number or date format of x values in hover labels. Default: the axis format.',
      }),
      yhoverformat: attr.string({
        dflt: '',
        editType: 'none',
        description:
          'd3 number or date format of y values in hover labels. Default: the axis format.',
      }),
      zhoverformat: attr.string({
        dflt: '',
        editType: 'none',
        description:
          'd3 number or date format of z values in hover labels. Default: the axis format.',
      }),
    },
    {
      description:
        'Surface: a grid of heights drawn as a lit 3D surface, built on the GPU from a height texture, with contour lines, projections and an optional wireframe.',
    },
  ))();
