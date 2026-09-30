/**
 * `scatter3d` attribute schema (plan E14.2), following plotly.js `traces/scatter3d/attributes.js`:
 * `x`, `y`, `z` in a 3D scene, `mode` (markers, lines, text), Plotly's eight 3D marker symbols,
 * markers and lines colored directly or through colorscales, 3D error bars, shadows of the points
 * on the walls (`projection`), a surface through the points (`surfaceaxis`) and camera-facing
 * text. Holochart extensions: `marker.render` (`'sphere'`: lit spheres instead of flat sprites)
 * and `line.render` (`'tube'`, `'ribbon'`: lit meshes instead of screen-space lines, with
 * `line.radius`, `line.ribbon`, `line.lighting`, `line.lightposition` and `line.material`).
 *
 * Scatter's own declarations are reused where the semantics match (text, fonts, colorscales,
 * bubble sizing), with Plotly's 3D defaults (`mode: 'lines+markers'`, `marker.size: 8`,
 * `textposition: 'top center'`).
 */
import { attr, type SchemaNode } from '@mk7s/holochart-core';
import { colorscaleAttributes, scatterAttributes } from '@mk7s/holochart-traces-basic';
import { sceneIdAttribute } from '../scene/layout-attributes.ts';
import {
  sceneLightingAttributes,
  sceneMaterialAttributes,
  type SceneLightingDefaults,
} from '../scene/lighting-attributes.ts';

const S = scatterAttributes.children;
const M = S.marker.children;

/** Plotly's 3D marker symbols (`gl3d/markers.js`), drawn with the 2D symbols of the same names. */
export const SCATTER3D_SYMBOLS = [
  'circle',
  'circle-open',
  'cross',
  'diamond',
  'diamond-open',
  'square',
  'square-open',
  'x',
] as const;

/** Plotly's 3D dash names (`gl3d_dashes.js`), drawn like the 2D dashes of the same names. */
export const SCATTER3D_DASHES = [
  'dash',
  'dashdot',
  'dot',
  'longdash',
  'longdashdot',
  'solid',
] as const;

/**
 * Lighting of tube and ribbon lines (`line.render`): Plotly's mesh model with more directional
 * contrast than its mesh defaults, so round tubes read as round.
 */
export const LINE_MESH_LIGHTING: SceneLightingDefaults = {
  lighting: { ambient: 0.5, diffuse: 0.7, specular: 0.15, roughness: 0.4, fresnel: 0.2 },
  lightposition: [1e5, 1e5, 0],
};

/** A copy of an attribute node with fields replaced (e.g. a 3D default). */
function override<N extends SchemaNode>(node: N, fields: Record<string, unknown>): N {
  return { ...node, ...fields } as N;
}

function coordinate(letter: 'x' | 'y' | 'z') {
  return attr.dataArray({
    editType: 'calc',
    role: 'data',
    description: `The ${letter} coordinates (numbers, dates or categories, per the scene's ${letter} axis).`,
  });
}

function hoverformat(letter: 'x' | 'y' | 'z') {
  return attr.string({
    dflt: '',
    editType: 'none',
    description: `d3-format (or d3-time-format on date axes) of the ${letter} values in hover labels, overriding the scene axis' \`hoverformat\`.`,
  });
}

function projection(letter: 'x' | 'y' | 'z') {
  return attr.object(
    {
      show: attr.boolean({
        dflt: false,
        editType: 'plot',
        description: `Draw the points' shadow on the wall perpendicular to the ${letter} axis (the far wall, behind the data).`,
      }),
      opacity: attr.number({
        min: 0,
        max: 1,
        dflt: 1,
        editType: 'style',
        description: 'Opacity of the shadow markers (times the markers own opacity).',
      }),
      scale: attr.number({
        min: 0,
        max: 10,
        dflt: 2 / 3,
        editType: 'style',
        description: 'Size of the shadow markers relative to the markers.',
      }),
    },
    {
      editType: 'plot',
      description: `Shadow of the markers on the wall perpendicular to the ${letter} axis.`,
    },
  );
}

function errorBars(letter: 'x' | 'y' | 'z') {
  const E = S.error_y.children;
  const axis = (node: SchemaNode): SchemaNode =>
    node.kind === 'attr' && typeof node.description === 'string'
      ? override(node, { description: node.description.replace(/\by axis\b/g, `${letter} axis`) })
      : node;
  const children: Record<string, SchemaNode> = {};
  for (const [k, v] of Object.entries(E)) children[k] = axis(v as SchemaNode);
  children['width'] = attr.number({
    min: 0,
    editType: 'style',
    description:
      'Accepted for Plotly compatibility: 3D error bars are drawn without caps (Plotly draws them with a width of 0 by default).',
  });
  if (letter !== 'z') {
    children['copy_zstyle'] = attr.boolean({
      editType: 'style',
      description:
        'Use the `error_z` color and thickness. Defaults to true when `error_z` is visible and none of those is set here.',
    });
  }
  return attr.object(children, {
    editType: 'calc',
    description: `Error bars along the ${letter} axis, drawn as 3D segments through the points.`,
  });
}

/** `scatter3d`. */
export const scatter3dAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      scene: sceneIdAttribute,
      x: coordinate('x'),
      y: coordinate('y'),
      z: coordinate('z'),
      mode: attr.flaglist({
        flags: ['lines', 'markers', 'text'],
        extras: ['none'],
        dflt: 'lines+markers',
        editType: 'calc',
        description:
          "Drawing mode: any of `'lines'`, `'markers'`, `'text'` joined by `+`, or `'none'`.",
      }),
      text: S.text,
      texttemplate: S.texttemplate,
      textposition: attr.enumerated({
        values: S.textposition.values ?? [],
        dflt: 'top center',
        arrayOk: true,
        editType: 'plot',
        description:
          'Position of each text label around its point (and marker), or one per point; the labels face the camera.',
      }),
      textfont: S.textfont,
      xhoverformat: hoverformat('x'),
      yhoverformat: hoverformat('y'),
      zhoverformat: hoverformat('z'),
      connectgaps: S.connectgaps,
      line: attr.object(
        {
          color: attr.color({
            arrayOk: true,
            editType: 'style',
            description:
              'Line color, or one per point (numbers map through `line.colorscale`; the color is interpolated along each segment). Defaults to the marker color (when a single color) or the colorway.',
          }),
          ...colorscaleAttributes({ colorAttr: 'line.color', showscale: true, coloraxis: true }),
          width: attr.number({
            min: 0,
            dflt: 2,
            editType: 'style',
            description: 'Line width in CSS px, at every depth (screen-space lines).',
          }),
          dash: attr.enumerated({
            values: SCATTER3D_DASHES,
            dflt: 'solid',
            editType: 'style',
            description:
              'Dash style, measured in CSS px along the drawn line (`render: "screen"` only).',
          }),
          render: attr.enumerated({
            values: ['screen', 'tube', 'ribbon'],
            dflt: 'screen',
            editType: 'calc',
            description:
              "How the line is drawn (a Holochart extension): `'screen'` — Plotly's look, a flat band `width` CSS px wide at every depth; `'tube'` — a lit tube of `radius` around the line; `'ribbon'` — a lit strip swept along an axis (`ribbon`), e.g. waterfall plots of spectra. Tubes and ribbons are meshes: they scale with the view like the data, and take `lighting`, `lightposition` and `material`.",
          }),
          radius: attr.number({
            min: 0,
            dflt: 0.01,
            editType: 'calc',
            description:
              "Tube radius (`render: 'tube'`) as a fraction of the longest side of the scene's axis box (so tubes stay round whatever the axis scales).",
          }),
          ribbon: attr.object(
            {
              axis: attr.enumerated({
                values: ['x', 'y', 'z'],
                dflt: 'y',
                editType: 'calc',
                description: 'The axis the ribbon extends along (on both sides of the line).',
              }),
              width: attr.number({
                min: 0,
                editType: 'calc',
                description:
                  "Ribbon width along `axis`, in that axis' units (a category is 1, dates in ms). Default: a twentieth of the axis range.",
              }),
            },
            { editType: 'calc', description: "The ribbon of `render: 'ribbon'`." },
          ),
          ...sceneLightingAttributes(LINE_MESH_LIGHTING),
          ...sceneMaterialAttributes,
        },
        { editType: 'plot', description: 'Line style (`mode` `lines`).' },
      ),
      marker: attr.object(
        {
          color: M.color,
          ...colorscaleAttributes({ colorAttr: 'marker.color', showscale: true, coloraxis: true }),
          size: override(M.size, { dflt: 8 }),
          sizemode: M.sizemode,
          sizeref: M.sizeref,
          sizemin: M.sizemin,
          symbol: attr.enumerated({
            values: SCATTER3D_SYMBOLS,
            dflt: 'circle',
            arrayOk: true,
            editType: 'style',
            description: "Marker symbol (Plotly's 3D set), or one per point.",
          }),
          opacity: attr.number({
            min: 0,
            max: 1,
            editType: 'style',
            description:
              'Marker opacity. Translucent markers are sorted back to front as the camera moves.',
          }),
          line: attr.object(
            {
              color: M.line.children.color,
              ...colorscaleAttributes({
                colorAttr: 'marker.line.color',
                showscale: false,
                coloraxis: true,
              }),
              width: attr.number({
                min: 0,
                editType: 'style',
                description: 'Width of the marker outline in CSS px.',
              }),
            },
            { editType: 'style', description: 'Marker outline.' },
          ),
          render: attr.enumerated({
            values: ['sprite', 'sphere'],
            dflt: 'sprite',
            editType: 'plot',
            description:
              "How markers are drawn (a Holochart extension): `'sprite'` — flat symbols facing the camera, Plotly's look; `'sphere'` — lit, shaded spheres of the same size (every symbol draws as a sphere).",
          }),
        },
        { editType: 'plot', description: 'Marker style (`mode` `markers`).' },
      ),
      surfaceaxis: attr.enumerated({
        values: [-1, 0, 1, 2],
        dflt: -1,
        editType: 'calc',
        description:
          'Fill a surface through the points, triangulated (Delaunay) in the plane perpendicular to this axis (0: x, 1: y, 2: z); -1 for none.',
      }),
      surfacecolor: attr.color({
        editType: 'style',
        description: 'Color of the `surfaceaxis` surface. Defaults to the line or marker color.',
      }),
      projection: attr.object(
        { x: projection('x'), y: projection('y'), z: projection('z') },
        { editType: 'plot', description: "Shadows of the markers on the scene's walls." },
      ),
      error_x: errorBars('x'),
      error_y: errorBars('y'),
      error_z: errorBars('z'),
    },
    {
      editType: 'calc',
      description:
        'Markers, lines and text at `x`, `y`, `z` in a 3D scene (`layout.scene`), with colorscales, error bars, wall shadows (`projection`) and a surface through the points (`surfaceaxis`).',
    },
  ))();
