/**
 * `scatterpolar` attribute schema (plan E11.4, ADR-002), following plotly.js
 * `traces/scatterpolar/attributes.js`: `r` / `theta` (or `r0` + `dr`, `theta0` + `dtheta`), the
 * subplot, and scatter's modes, markers, lines (`linear` or `spline`), text and fills (`toself`,
 * `tonext`). Marker, text and selection attributes are scatter's own declarations.
 *
 * Not declared (deferred): `line.backoff`, `marker.gradient`, `fillpattern`.
 */
import { attr } from '@mk7s/holochart-core';
import { scatterAttributes } from '@mk7s/holochart-traces-basic';
import { subplotAttribute } from '../polar/layout-attributes.ts';

const S = scatterAttributes.children;

/** `r`, `theta` and their implicit forms, shared with `barpolar`. */
export const polarCoordinateAttributes = {
  r: attr.dataArray({ editType: 'calc', role: 'data', description: 'Radial coordinates.' }),
  theta: attr.dataArray({
    editType: 'calc',
    role: 'data',
    description:
      'Angular coordinates: numbers in `thetaunit` on a linear angular axis, category names on a category axis.',
  }),
  r0: attr.any({
    dflt: 0,
    editType: 'calc',
    description: 'Alternative to `r`: the first radial coordinate, stepped by `dr`.',
  }),
  dr: attr.number({ dflt: 1, editType: 'calc', description: 'Radial step of the implicit `r`.' }),
  theta0: attr.any({
    dflt: 0,
    editType: 'calc',
    description: 'Alternative to `theta`: the first angular coordinate, stepped by `dtheta`.',
  }),
  dtheta: attr.number({
    editType: 'calc',
    description:
      'Angular step of the implicit `theta`. Defaults to the subplot period (a full turn, or the category count) divided by the number of points.',
  }),
  thetaunit: attr.enumerated({
    values: ['radians', 'degrees', 'gradians'],
    dflt: 'degrees',
    editType: 'calc',
    description: 'Unit of `theta` (and `theta0`, `dtheta`) on linear angular axes.',
  }),
  subplot: subplotAttribute,
} as const;

/** Polar hover flags (`hoverinfo`). */
export const polarHoverinfo = /* @__PURE__ */ (() =>
  attr.flaglist({
    flags: ['r', 'theta', 'text', 'name'],
    extras: ['all', 'none', 'skip'],
    arrayOk: true,
    editType: 'none',
    description:
      "Which fields hover labels show (`r: …`, `θ: …`, the text and the trace name); `'skip'` also turns hover events off for this trace. Default `'all'`.",
  }))();

export const scatterpolarAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...polarCoordinateAttributes,
      mode: S.mode,
      text: S.text,
      texttemplate: S.texttemplate,
      textposition: S.textposition,
      textfont: S.textfont,
      line: attr.object(
        {
          color: S.line.children.color,
          width: S.line.children.width,
          dash: S.line.children.dash,
          shape: attr.enumerated({
            values: ['linear', 'spline'],
            dflt: 'linear',
            editType: 'plot',
            description:
              "Interpolation between points: straight segments, or `'spline'` (centripetal Catmull-Rom, see `smoothing`), drawn in screen space as Plotly does.",
          }),
          smoothing: S.line.children.smoothing,
        },
        {
          editType: 'plot',
          description: 'Line style (`mode` `lines`). `shape` and `smoothing` also shape fills.',
        },
      ),
      connectgaps: S.connectgaps,
      marker: S.marker,
      cliponaxis: attr.boolean({
        dflt: false,
        editType: 'plot',
        description:
          'Clip markers and text to the subplot outline. Lines and fills are always clipped; unclipped markers outside the radial range or sector are hidden, as in Plotly.',
      }),
      fill: attr.enumerated({
        values: ['none', 'toself', 'tonext'],
        dflt: 'none',
        editType: 'plot',
        description:
          '`toself` closes the line (each run between gaps) into a filled shape (radar charts); `tonext` fills the ring between this trace and the previous scatterpolar trace on the subplot (one should enclose the other), and acts like `toself` for the first trace.',
      }),
      fillcolor: S.fillcolor,
      hoveron: S.hoveron,
      hoverinfo: polarHoverinfo,
      selected: S.selected,
      unselected: S.unselected,
    },
    {
      editType: 'calc',
      description:
        'Markers, lines, text and filled areas (radar charts) at polar coordinates `r`, `theta` on a polar subplot (`layout.polar`).',
    },
  ))();
