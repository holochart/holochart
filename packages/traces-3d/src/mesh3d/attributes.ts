/**
 * `mesh3d` attribute schema (plan E14.4, ADR-002), following plotly.js `mesh3d/attributes.js`:
 * vertices (`x`, `y`, `z`), triangles (`i`, `j`, `k`, or derived from `alphahull` /
 * `delaunayaxis`), colors (`intensity` through a colorscale, `vertexcolor`, `facecolor`, `color`),
 * shading (`flatshading`, `lighting`, `lightposition`, and the `material` extension), the hover
 * contour (`contour`) and hover formats. Common trace attributes (`name`, `opacity`, `hoverinfo`
 * with its `x` / `y` / `z` / `text` / `name` flags, `hovertext`, `hovertemplate`, …) come from core.
 *
 * Deferred: `xcalendar` / `ycalendar` / `zcalendar`, `hovertemplatefallback`.
 */
import { attr } from '@mk7s/holochart-core';
import { colorscaleAttributes } from '@mk7s/holochart-traces-basic';
import { sceneIdAttribute } from '../scene/layout-attributes.ts';
import { sceneLightingAttributes, sceneMaterialAttributes } from '../scene/lighting-attributes.ts';

function coordinate(letter: 'x' | 'y' | 'z') {
  return attr.dataArray({
    editType: 'calc',
    role: 'data',
    description: `${letter.toUpperCase()} coordinates of the vertices (numbers, dates or categories). \`x\`, \`y\` and \`z\` must have the same length.`,
  });
}

function index(letter: 'i' | 'j' | 'k', nth: string) {
  return attr.dataArray({
    editType: 'calc',
    description: `Index (into \`x\` / \`y\` / \`z\`) of the ${nth} vertex of each triangle: triangle \`m\` joins vertices \`i[m]\`, \`j[m]\` and \`k[m]\`. Give all three or none (then \`alphahull\` makes the triangles). Indices are rounded; one out of range hides the trace, as in Plotly.`,
  });
}

function hoverformat(letter: 'x' | 'y' | 'z') {
  return attr.string({
    dflt: '',
    editType: 'none',
    description: `d3 number or date format of ${letter} values in hover labels. Default: the scene's ${letter} axis format.`,
  });
}

/** The mesh3d schema. @experimental */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const mesh3dAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      scene: sceneIdAttribute,
      x: coordinate('x'),
      y: coordinate('y'),
      z: coordinate('z'),
      i: index('i', 'first'),
      j: index('j', 'second'),
      k: index('k', 'third'),
      text: attr.string({
        arrayOk: true,
        dflt: '',
        editType: 'calc',
        description:
          'Text per vertex (per triangle with cell colors: `intensitymode: "cell"` or `facecolor`), shown in hover labels and as `%{text}` in templates.',
      }),
      delaunayaxis: attr.enumerated({
        values: ['x', 'y', 'z'],
        dflt: 'z',
        editType: 'calc',
        description:
          'Without `i` / `j` / `k` and with `alphahull: -1`: the axis the points are projected along before their 2D Delaunay triangulation (`z` triangulates the x–y positions). Suits a single surface layer seen along this axis.',
      }),
      alphahull: attr.number({
        dflt: -1,
        editType: 'calc',
        description:
          'How triangles are derived from the vertices when `i` / `j` / `k` are not given: `-1` (default) a 2D Delaunay triangulation along `delaunayaxis`; `0` the convex hull; a positive value the alpha shape with this alpha (Delaunay tetrahedra with circumradius < 1 / alpha, in coordinates scaled to the unit cube per axis, as Plotly).',
      }),
      intensity: attr.dataArray({
        editType: 'calc',
        description:
          'Values mapped through the colorscale: one per vertex (`intensitymode: "vertex"`, interpolated across triangles) or one per triangle (`"cell"`). Takes precedence over `vertexcolor`, `facecolor` and `color`.',
      }),
      intensitymode: attr.enumerated({
        values: ['vertex', 'cell'],
        dflt: 'vertex',
        editType: 'calc',
        description: 'Whether `intensity` holds one value per vertex or per triangle (cell).',
      }),
      color: attr.color({
        editType: 'calc',
        description:
          'Color of the whole mesh (without `intensity`, `vertexcolor` and `facecolor`). Default: the trace color from the colorway.',
      }),
      vertexcolor: attr.dataArray({
        editType: 'calc',
        description:
          'A CSS color per vertex, interpolated across triangles. Takes precedence over `facecolor` and `color` (not over `intensity`).',
      }),
      facecolor: attr.dataArray({
        editType: 'calc',
        description:
          'A CSS color per triangle. Takes precedence over `color` (not over `intensity`); only used without `vertexcolor`.',
      }),
      ...colorscaleAttributes({
        colorAttr: 'intensity',
        showscale: true,
        showscaleDflt: true,
        coloraxis: true,
      }),
      flatshading: attr.boolean({
        dflt: false,
        editType: 'calc',
        description:
          'Flat shading: one normal per triangle (faceted look) instead of normals interpolated across triangles.',
      }),
      contour: attr.object(
        {
          show: attr.boolean({
            dflt: false,
            editType: 'calc',
            description:
              'While hovering, draw the contour line through the hovered point: the level set of `intensity` (of z without intensity) at its value, as Plotly.',
          }),
          color: attr.color({
            dflt: '#444',
            editType: 'calc',
            description: 'Color of the hover contour.',
          }),
          width: attr.number({
            min: 1,
            max: 16,
            dflt: 2,
            editType: 'calc',
            description: 'Width of the hover contour, px (Plotly draws 1 px whatever the width).',
          }),
        },
        { editType: 'calc', description: 'The contour drawn through the hovered point.' },
      ),
      ...sceneLightingAttributes('mesh3d'),
      ...sceneMaterialAttributes,
      xhoverformat: hoverformat('x'),
      yhoverformat: hoverformat('y'),
      zhoverformat: hoverformat('z'),
    },
    {
      description:
        'A 3D triangle mesh: vertices with explicit triangles, or triangles derived from the points (Delaunay, convex hull or alpha shape), colored by intensity through a colorscale, per vertex, per triangle or in one color, lit with Plotly’s lighting model.',
    },
  ))();
