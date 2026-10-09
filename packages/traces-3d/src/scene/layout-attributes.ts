/**
 * `layout.scene`, `scene2`, … (plan E14.1a, E14.1b): the 3D scene container, following plotly.js
 * `plots/gl3d/layout/layout_attributes.js` and `axis_attributes.js`. Declared by the scene
 * component (`sceneComponent.layoutSchema`); subplot families are not coerced by core, so figures
 * without 3D traces pay nothing (the scene defaults run only for scenes 3D traces use).
 *
 * The axis attributes reuse the cartesian declarations (ticks, labels, lines, grid, zero line) with
 * Plotly's 3D edit types: everything redraws the scene (`plot`); types and categories recalculate
 * (`calc`). The camera only moves the view (`camera`: components redraw, traces don't).
 */
import {
  attr,
  domainTraceAttributes,
  xaxisSchema,
  type Children,
  type EditType,
  type SchemaNode,
} from '@mk7s/holochart-core';
import { sceneAnnotationsAttributes } from './annotations.ts';
import { sceneAutorotateAttributes } from './camera-animation.ts';
import { sceneLightRigAttributes } from './lighting-attributes.ts';

/** A copy of a schema node with `editType` set on it and every descendant. */
function withEdit<N extends SchemaNode>(node: N, editType: EditType): N {
  if (node.kind === 'attr') return { ...node, editType };
  if (node.kind === 'items') return { ...node, editType, item: withEdit(node.item, editType) };
  const children: Record<string, SchemaNode> = {};
  for (const [k, v] of Object.entries(node.children)) children[k] = withEdit(v, editType);
  return { ...node, editType, children };
}

function pick(keys: readonly string[], editType: EditType): Children {
  const axis = xaxisSchema.children as Children;
  const out: Record<string, SchemaNode> = {};
  for (const k of keys) {
    const node = axis[k];
    if (node) out[k] = withEdit(node, editType);
  }
  return out;
}

/** Cartesian axis attributes a 3D axis shares (Plotly's `gl3d/layout/axis_attributes.js`). */
const SHARED = [
  'visible',
  'color',
  'autorange',
  'autorangeoptions',
  'rangemode',
  'range',
  'minallowed',
  'maxallowed',
  'tickmode',
  'nticks',
  'tick0',
  'dtick',
  'tickvals',
  'ticktext',
  'ticks',
  'mirror',
  'ticklen',
  'tickwidth',
  'tickcolor',
  'showticklabels',
  'tickfont',
  'tickangle',
  'tickprefix',
  'showtickprefix',
  'ticksuffix',
  'showticksuffix',
  'showexponent',
  'exponentformat',
  'minexponent',
  'separatethousands',
  'tickformat',
  'tickformatstops',
  'showline',
  'linecolor',
  'linewidth',
  'showgrid',
  'gridcolor',
  'gridwidth',
  'zeroline',
  'zerolinecolor',
  'zerolinewidth',
] as const;

/** `scene.xaxis`, `scene.yaxis`, `scene.zaxis`. @internal */
export const sceneAxisAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...pick(SHARED, 'plot'),
      type: attr.enumerated({
        values: ['-', 'linear', 'log', 'date', 'category'],
        dflt: '-',
        editType: 'calc',
        description:
          "Axis type. `'-'` detects it from this axis' data (`x`, `y` or `z`) of the first trace on the scene.",
      }),
      ...pick(['autotypenumbers', 'categoryorder', 'categoryarray'], 'calc'),
      hoverformat: withEdit(xaxisSchema.children.hoverformat, 'none'),
      title: attr.object(
        {
          text: attr.string({
            editType: 'plot',
            description: "Axis title, drawn beside the axis. Defaults to the axis letter (`'x'`).",
          }),
          font: withEdit(xaxisSchema.children.title.children.font, 'plot'),
        },
        { editType: 'plot', description: 'Axis title.' },
      ),
      showbackground: attr.boolean({
        dflt: false,
        editType: 'plot',
        description:
          "Fill this axis' wall (the back plane perpendicular to it) with `backgroundcolor`.",
      }),
      backgroundcolor: attr.color({
        dflt: 'rgba(204, 204, 204, 0.5)',
        editType: 'plot',
        description: "Color of this axis' wall.",
      }),
      showaxeslabels: attr.boolean({
        dflt: true,
        editType: 'plot',
        description: 'Draw the axis title.',
      }),
      showspikes: attr.boolean({
        dflt: true,
        editType: 'plot',
        description:
          "On hover, draw spikes from the hovered point to this axis' walls (3D hover, plan E14.1d).",
      }),
      spikesides: attr.boolean({
        dflt: true,
        editType: 'plot',
        description: 'Extend the spikes from the walls to the edges of the axis box.',
      }),
      spikethickness: attr.number({
        min: 0,
        dflt: 2,
        editType: 'plot',
        description: 'Thickness of the spikes, px.',
      }),
      spikecolor: attr.color({
        editType: 'plot',
        description: 'Color of the spikes. Defaults to the axis `color`.',
      }),
    },
    { editType: 'plot', description: 'An axis of a 3D scene.' },
  ))();

/** One camera vector (`eye`, `center`, `up`), in the scene's normalized units. */
function cameraVector(x: number, y: number, z: number, description: string) {
  return attr.object(
    {
      x: attr.number({ dflt: x, editType: 'camera', description: 'x component.' }),
      y: attr.number({ dflt: y, editType: 'camera', description: 'y component.' }),
      z: attr.number({ dflt: z, editType: 'camera', description: 'z component.' }),
    },
    { editType: 'camera', description },
  );
}

const sceneDomain = /* @__PURE__ */ (() =>
  attr.object(domainTraceAttributes.domain.children, {
    editType: 'plot',
    description:
      'Extent of the scene as fractions of the plot area, or the `layout.grid` cell at `row` / `column`. Scenes without one sit side by side.',
  }))();

/** The `scene` subplot container family (`scene`, `scene2`, …). @experimental */
export const sceneAttributes = /* @__PURE__ */ (() =>
  attr.subplotObject(
    'scene',
    {
      domain: sceneDomain,
      bgcolor: attr.color({
        dflt: 'rgba(0,0,0,0)',
        editType: 'plot',
        description: 'Background color of the scene (transparent: the paper shows through).',
      }),
      camera: attr.object(
        {
          eye: cameraVector(
            1.25,
            1.25,
            1.25,
            'Where the camera is, in scene units: the axis box spans `aspectratio` around the origin (`[-x/2, x/2]`, …).',
          ),
          center: cameraVector(0, 0, 0, 'The point the camera looks at, in scene units.'),
          up: cameraVector(
            0,
            0,
            1,
            'The direction that points up on the screen. The default puts the z axis up.',
          ),
          projection: attr.object(
            {
              type: attr.enumerated({
                values: ['perspective', 'orthographic'],
                dflt: 'perspective',
                editType: 'camera',
                description:
                  'Perspective (45° vertical field of view) or orthographic projection (the view spans 2 scene units vertically; zooming scales `aspectratio`).',
              }),
            },
            { editType: 'camera', description: 'The camera projection.' },
          ),
        },
        {
          editType: 'camera',
          description:
            "The view of the scene. Orbiting, panning and zooming report it in a `relayout` event (`'scene.camera'`) when the gesture ends.",
        },
      ),
      aspectmode: attr.enumerated({
        values: ['auto', 'cube', 'data', 'manual'],
        dflt: 'auto',
        editType: 'plot',
        description:
          '`cube`: the axes form a cube whatever their ranges. `data`: axis lengths follow their data spans (per axis type). `manual`: `aspectratio`. `auto` (default; `manual` when `aspectratio` is given): `data` unless one axis would be more than 4 times longer than another, then `cube`.',
      }),
      aspectratio: attr.object(
        {
          x: attr.number({
            min: 0,
            editType: 'plot',
            description: 'Relative length of the x axis.',
          }),
          y: attr.number({
            min: 0,
            editType: 'plot',
            description: 'Relative length of the y axis.',
          }),
          z: attr.number({
            min: 0,
            editType: 'plot',
            description: 'Relative length of the z axis.',
          }),
        },
        {
          editType: 'plot',
          description:
            'Relative lengths of the axes (with `aspectmode: manual`). The full layout holds the ratio in use for every mode.',
        },
      ),
      xaxis: sceneAxisAttributes,
      yaxis: sceneAxisAttributes,
      zaxis: sceneAxisAttributes,
      dragmode: attr.enumerated({
        values: ['orbit', 'turntable', 'zoom', 'pan', false],
        editType: 'modebar',
        description:
          "What dragging does: `orbit` rotates freely, `turntable` rotates about the z axis (keeping it up), `zoom` moves the camera closer, `pan` moves it sideways; `false` turns dragging off. Defaults to `layout.dragmode` when the figure has only 3D subplots and that is one of these, else `turntable` (or `orbit` when `camera.up` isn't the z axis).",
      }),
      hovermode: attr.enumerated({
        values: ['closest', false],
        dflt: 'closest',
        editType: 'modebar',
        description: 'Hover labels on the scene (`closest`) or none (`false`).',
      }),
      uirevision: attr.any({
        editType: 'none',
        description:
          'Persistence of user-driven camera changes. Accepted for Plotly compatibility; `layout.uirevision` governs them.',
      }),
      annotations: sceneAnnotationsAttributes,
      lighting: sceneLightRigAttributes,
      autorotate: sceneAutorotateAttributes,
    },
    {
      editType: 'plot',
      description:
        "A 3D scene. `scene2`, `scene3`, … declare more, referenced from 3D traces' `scene` (`'scene2'`).",
      role: 'layout',
    },
  ))();

/** What the scene component declares as its `layoutSchema`. */
export const sceneLayoutSchema = /* @__PURE__ */ (() => ({ scene: sceneAttributes }))();

/** The `scene` trace attribute of 3D traces (spread into their schemas). @experimental */
export const sceneIdAttribute = /* @__PURE__ */ (() =>
  attr.subplotId({
    dflt: 'scene',
    editType: 'calc',
    description:
      "The 3D scene this trace is drawn in: `'scene'` (`layout.scene`), `'scene2'` (`layout.scene2`), ….",
  }))();
