/**
 * `layout.polar`, `polar2`, … (plan E11.4, E11.5): the polar subplot container, following plotly.js
 * `plots/polar/layout_attributes.js` and `traces/barpolar/layout_attributes.js`. Declared by the
 * polar trace modules (`layoutSchema`), so figures without polar traces don't carry it.
 *
 * The axis attributes reuse the cartesian axis declarations (tick values, labels, lines, grid) with
 * Plotly's polar edit types: everything redraws the subplot (`plot`); axis types and categories
 * recalculate (`calc`). Rotation, direction, sector and hole only move what is drawn, so they are
 * `plot` edits here (Plotly declares some `calc`).
 */
import {
  attr,
  domainTraceAttributes,
  xaxisSchema,
  type Children,
  type EditType,
  type SchemaNode,
} from '@mk7s/holochart-core';

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

/** Line and grid attributes shared by both axes (Plotly's `axisLineGridAttr`). */
const LINE_GRID = [
  'color',
  'linecolor',
  'linewidth',
  'gridcolor',
  'gridwidth',
  'griddash',
] as const;

/** Tick attributes shared by both axes (Plotly's `axisTickAttrs`). */
const TICKS = [
  'tickmode',
  'nticks',
  'tick0',
  'dtick',
  'tickvals',
  'ticktext',
  'ticks',
  'ticklen',
  'tickwidth',
  'tickcolor',
  'ticklabelstep',
  'showticklabels',
  'minorloglabels',
  'showtickprefix',
  'tickprefix',
  'showticksuffix',
  'ticksuffix',
  'showexponent',
  'exponentformat',
  'minexponent',
  'separatethousands',
  'tickfont',
  'tickangle',
  'tickformat',
  'tickformatstops',
  'layer',
] as const;

const common = (): Children => ({
  visible: attr.boolean({
    dflt: true,
    editType: 'plot',
    description: 'Draw the axis (line, ticks, labels and grid).',
  }),
  showline: attr.boolean({ dflt: true, editType: 'plot', description: 'Draw the axis line.' }),
  showgrid: attr.boolean({ dflt: true, editType: 'plot', description: 'Draw the grid lines.' }),
  ...pick(LINE_GRID, 'plot'),
  ...pick(TICKS, 'plot'),
  ...pick(['autotypenumbers', 'categoryorder', 'categoryarray'], 'calc'),
  hoverformat: withEdit(xaxisSchema.children.hoverformat, 'none'),
  uirevision: attr.any({
    editType: 'none',
    description:
      'Persistence of user-driven changes of this axis (range, angle, rotation). Defaults to the subplot `uirevision`.',
  }),
});

/** `polar.radialaxis`. */
export const radialAxisAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...common(),
      type: attr.enumerated({
        values: ['-', 'linear', 'log', 'date', 'category'],
        dflt: '-',
        editType: 'calc',
        description:
          "Radial axis type. `'-'` detects it from the `r` data of the first trace on the subplot.",
      }),
      ...pick(
        ['autorange', 'autorangeoptions', 'range', 'minallowed', 'maxallowed', 'autotickangles'],
        'plot',
      ),
      rangemode: attr.enumerated({
        values: ['tozero', 'nonnegative', 'normal'],
        dflt: 'tozero',
        editType: 'plot',
        description:
          'Linear axes only. `tozero`: the autorange extends to 0 whatever the data; `nonnegative`: it stays ≥ 0; `normal`: it follows the data extremes, like a cartesian axis.',
      }),
      angle: attr.angle({
        editType: 'plot',
        description:
          'Angle in degrees (counterclockwise from 3 o’clock) along which the radial axis is drawn. Defaults to the first `sector` angle.',
      }),
      side: attr.enumerated({
        values: ['clockwise', 'counterclockwise'],
        dflt: 'clockwise',
        editType: 'plot',
        description: 'On which side of the radial axis line its ticks and labels are drawn.',
      }),
      title: attr.object(
        {
          text: attr.string({ dflt: '', editType: 'plot', description: 'Radial axis title.' }),
          font: withEdit(xaxisSchema.children.title.children.font, 'plot'),
        },
        { editType: 'plot', description: 'Radial axis title, drawn along the axis.' },
      ),
    },
    { editType: 'calc', description: 'The radial axis of a polar subplot.' },
  ))();

/** `polar.angularaxis`. */
export const angularAxisAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...common(),
      type: attr.enumerated({
        values: ['-', 'linear', 'category'],
        dflt: '-',
        editType: 'calc',
        description:
          "Angular axis type. `'-'` detects it from the `theta` data of the first trace on the subplot. `linear`: `thetaunit` sets how labels read; `category`: `period` sets how many categories go around the circle.",
      }),
      thetaunit: attr.enumerated({
        values: ['radians', 'degrees'],
        dflt: 'degrees',
        editType: 'plot',
        description: 'Unit of the tick labels and hover values of a `linear` angular axis.',
      }),
      period: attr.number({
        min: 0,
        editType: 'plot',
        description:
          'Number of category positions around the circle of a `category` angular axis. Defaults to the number of categories.',
      }),
      direction: attr.enumerated({
        values: ['counterclockwise', 'clockwise'],
        dflt: 'counterclockwise',
        editType: 'plot',
        description: 'Direction of increasing angles.',
      }),
      rotation: attr.angle({
        editType: 'plot',
        description:
          'Where the angular axis starts, in degrees counterclockwise from 3 o’clock. Defaults to 0 (east) with `direction: counterclockwise` and 90 (north, like a compass) with `clockwise`.',
      }),
    },
    { editType: 'calc', description: 'The angular axis of a polar subplot.' },
  ))();

/** `polar.domain`: the extent of the subplot in the plot area (or a `layout.grid` cell). */
const polarDomain = /* @__PURE__ */ (() => {
  const d = domainTraceAttributes.domain;
  return attr.object(d.children, {
    editType: 'plot',
    description:
      'Extent of the polar subplot as fractions of the plot area, or the `layout.grid` cell at `row` / `column`. The subplot is the largest circle (or sector) that fits in it, centered.',
  });
})();

/** `polar.bargap` and `polar.barmode` (plotly.js `barpolar/layout_attributes.js`). */
export const barpolarLayoutAttributes = {
  barmode: attr.enumerated({
    values: ['stack', 'overlay'],
    dflt: 'stack',
    editType: 'calc',
    description:
      '`barpolar` bars at the same angle: `stack` stacks them outwards, `overlay` draws them over one another (reduce `opacity` to see through).',
  }),
  bargap: attr.number({
    min: 0,
    max: 1,
    dflt: 0.1,
    editType: 'calc',
    description:
      'Gap between `barpolar` bars at adjacent angles, as a fraction of the smallest angle difference in the data.',
  }),
} as const;

/** The `polar` subplot container family (`polar`, `polar2`, …). @experimental */
export const polarAttributes = /* @__PURE__ */ (() =>
  attr.subplotObject(
    'polar',
    {
      domain: polarDomain,
      sector: attr.infoArray({
        items: [attr.number({ editType: 'plot' }), attr.number({ editType: 'plot' })],
        dflt: [0, 360],
        editType: 'plot',
        description:
          'Angular span `[start, end]` of the subplot in degrees, counterclockwise from 3 o’clock (`[0, 180]`: the upper half).',
      }),
      hole: attr.number({
        min: 0,
        max: 1,
        dflt: 0,
        editType: 'plot',
        description: 'Fraction of the radius cut out of the middle.',
      }),
      bgcolor: attr.color({
        dflt: '#fff',
        editType: 'plot',
        description: 'Background color of the subplot.',
      }),
      gridshape: attr.enumerated({
        values: ['circular', 'linear'],
        dflt: 'circular',
        editType: 'plot',
        description:
          'Radial grid lines and the angular axis line as circles (`circular`) or polygons through the category angles (`linear`: radar charts). Category angular axes only.',
      }),
      radialaxis: radialAxisAttributes,
      angularaxis: angularAxisAttributes,
      ...barpolarLayoutAttributes,
      uirevision: attr.any({
        editType: 'none',
        description:
          'Persistence of user-driven changes of the axes (unless they set their own). Defaults to `layout.uirevision`.',
      }),
    },
    {
      editType: 'calc',
      description:
        "A polar subplot. `polar2`, `polar3`, … declare more, referenced from polar traces' `subplot` (`'polar2'`).",
      role: 'layout',
    },
  ))();

/** What polar trace modules spread into their `layoutSchema`. */
export const polarLayoutSchema = /* @__PURE__ */ (() => ({ polar: polarAttributes }))();

/** The `subplot` trace attribute of polar traces. */
export const subplotAttribute = /* @__PURE__ */ (() =>
  attr.subplotId({
    dflt: 'polar',
    editType: 'calc',
    description:
      "The polar subplot this trace is drawn on: `'polar'` (`layout.polar`), `'polar2'` (`layout.polar2`), ….",
  }))();
