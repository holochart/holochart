/**
 * `box` attribute schema (plan E10.4, ADR-002), following plotly.js' box attributes. The sample,
 * point, marker and grouping attributes are shared with `violin` (E10.5) through the builders
 * exported here.
 *
 * Deferred: period alignment (`xperiod`…), `xcalendar` / `ycalendar`, `selected.marker.size`.
 */
import { attr } from '@mk7s/holochart-core';
import { SCATTER_SYMBOLS } from '@mk7s/holochart-traces-basic';

type TraceKind = 'box' | 'violin';

/** Sample coordinates and the implicit position (`x0` / `y0`, and `dx` / `dy` for precomputed boxes). */
export function sampleAttributes(kind: TraceKind) {
  const shape = kind === 'box' ? 'box' : 'violin';
  const coordinate = (letter: 'x' | 'y') => {
    const other = letter === 'x' ? 'y' : 'x';
    return attr.dataArray({
      editType: 'calc',
      role: 'data',
      description: `${letter} samples: the values of horizontal ${shape}es when \`${other}\` is not given, else the position of each sample (one ${shape} per distinct ${letter}) for vertical ${shape}es.${kind === 'box' ? ` With precomputed statistics (\`q1\`, \`median\`, \`q3\`): the position of each box, or one sample array per box on the value axis.` : ''}`,
    });
  };
  const start = (letter: 'x' | 'y') =>
    attr.any({
      editType: 'calc',
      description: `Position of the ${shape} when \`${letter}\` is not given. Default: the trace name on category axes (and numeric or date names on linear, log and date axes), else the ${shape}'s index among the ${shape} traces.`,
    });
  return {
    x: coordinate('x'),
    y: coordinate('y'),
    x0: start('x'),
    y0: start('y'),
  };
}

/** `orientation` and the position-grouping attributes shared by box and violin. */
export function layoutRoleAttributes(kind: TraceKind) {
  const shape = kind === 'box' ? 'box' : 'violin';
  return {
    orientation: attr.enumerated({
      values: ['v', 'h'],
      editType: 'calc',
      description: `\`'v'\`: vertical ${shape}es at \`x\` positions over \`y\` values; \`'h'\`: horizontal ones at \`y\` positions. Default: \`'v'\` when \`y\` is given, else \`'h'\`.`,
    }),
    width: attr.number({
      min: 0,
      dflt: 0,
      editType: 'calc',
      description: `${kind === 'box' ? 'Box' : 'Violin'} width in position-axis units (category slots, or ms on date axes). 0 (default): computed from the spacing of the positions and \`layout.${kind}gap\`, \`${kind}groupgap\` and \`${kind}mode\`.`,
    }),
    offsetgroup: attr.string({
      dflt: '',
      editType: 'calc',
      description: `With \`layout.${kind}mode: 'group'\`, traces with the same offset group share one slot at each position; different offset groups sit side by side.`,
    }),
    alignmentgroup: attr.string({
      dflt: '',
      editType: 'calc',
      description: `Traces on the same position axis with the same alignment group split each position between their offset groups; different alignment groups lay out independently.`,
    }),
    quartilemethod: attr.enumerated({
      values: ['linear', 'exclusive', 'inclusive'],
      dflt: 'linear',
      editType: 'calc',
      description:
        "How quartiles are computed from samples: `linear` interpolates over the whole sample (Plotly's method, the one most tools call type 5); for odd counts, `exclusive` takes the medians of the lower and upper halves without the median, `inclusive` with it. Even counts use `linear` in every method.",
    }),
  };
}

/** Line and fill of the shape itself. */
export function outlineAttributes(kind: TraceKind) {
  const shape = kind === 'box' ? 'box' : 'violin';
  return {
    line: attr.object(
      {
        color: attr.color({
          editType: 'style',
          description: `Outline color of the ${shape}${kind === 'box' ? ', its median and whiskers' : ''}. Default: \`marker.color\`, else the colorway.`,
        }),
        width: attr.number({
          min: 0,
          dflt: 2,
          editType: 'style',
          description: `Outline width in CSS px.`,
        }),
      },
      { editType: 'style', description: `Outline of the ${shape}.` },
    ),
    fillcolor: attr.color({
      editType: 'style',
      description: `Fill color of the ${shape}. Default: \`line.color\` at half opacity.`,
    }),
  };
}

/** Which sample points are drawn (`boxpoints` / `points`). */
export function pointsModeAttribute(kind: TraceKind) {
  return attr.enumerated({
    values: ['all', 'outliers', 'suspectedoutliers', false],
    editType: 'calc',
    description: `Which samples are drawn as points: \`'all'\`, only those beyond the whiskers (\`'outliers'\`, the default), those plus a highlight of the ones between the whiskers and 3 IQR from the quartiles (\`'suspectedoutliers'\`, styled by \`marker.outliercolor\` and \`marker.line.outlier*\`), or none (\`false\`${kind === 'box' ? ', the whiskers then reach the extreme samples' : ''}). Default: \`'suspectedoutliers'\` when an outlier color is set${kind === 'box' ? ", `'all'` with precomputed statistics" : ''}, else \`'outliers'\`.`,
  });
}

/** How sample points spread and where they sit. */
export function pointAttributes(kind: TraceKind) {
  const key = kind === 'box' ? 'boxpoints' : 'points';
  const shape = kind === 'box' ? 'box' : 'violin';
  return {
    jitter: attr.number({
      min: 0,
      max: 1,
      editType: 'calc',
      description: `Random spread of the points across the position axis, as a fraction of the ${shape} width (0: all on one line). Denser stretches spread more. Default: 0.3 with \`${key}: 'all'\`, else 0. The spread is repeatable (Plotly's seeded generator).`,
    }),
    pointpos: attr.number({
      min: -2,
      max: 2,
      editType: 'calc',
      description: `Where the points sit relative to the ${shape}, in ${shape} half-widths: 0 on its center line, 1 on its right (or top) edge, −2 one ${shape} width to the left (or below). Default: −1.5 with \`${key}: 'all'\`, else 0.`,
    }),
  } as const;
}

/** Point markers, with Plotly's outlier styling. */
export function markerAttributes() {
  return attr.object(
    {
      outliercolor: attr.color({
        dflt: 'rgba(0, 0, 0, 0)',
        editType: 'style',
        description:
          "Fill of suspected outliers (between the whiskers and 3 IQR from the quartiles) with `'suspectedoutliers'`. Setting it makes that mode the default.",
      }),
      symbol: attr.enumerated({
        values: SCATTER_SYMBOLS,
        dflt: 'circle',
        editType: 'style',
        description: "Point symbol: a name (`'diamond-open'`) or a Plotly numeric code.",
      }),
      opacity: attr.number({
        min: 0,
        max: 1,
        dflt: 1,
        editType: 'style',
        description: 'Point opacity (multiplied by the trace `opacity`).',
      }),
      angle: attr.angle({
        dflt: 0,
        editType: 'style',
        description: 'Point rotation in degrees, clockwise.',
      }),
      size: attr.number({
        min: 0,
        dflt: 6,
        editType: 'calc',
        description: 'Point diameter in CSS px.',
      }),
      color: attr.color({
        editType: 'style',
        description: 'Point fill color. Default: `line.color`.',
      }),
      line: attr.object(
        {
          color: attr.color({
            dflt: '#444',
            editType: 'style',
            description: 'Point outline color.',
          }),
          width: attr.number({
            min: 0,
            dflt: 0,
            editType: 'style',
            description: 'Point outline width in CSS px.',
          }),
          outliercolor: attr.color({
            editType: 'style',
            description:
              "Outline color of suspected outliers with `'suspectedoutliers'`. Default: `marker.color`. Setting it makes that mode the default.",
          }),
          outlierwidth: attr.number({
            min: 0,
            dflt: 1,
            editType: 'style',
            description: "Outline width (px) of suspected outliers with `'suspectedoutliers'`.",
          }),
        },
        { editType: 'style', description: 'Point outlines.' },
      ),
    },
    { editType: 'calc', description: 'Style of the sample points.' },
  );
}

/** Point styles while a selection is active (E6.3). */
export function selectionAttributes(which: 'selected' | 'unselected') {
  return attr.object(
    {
      marker: attr.object(
        {
          color: attr.color({ editType: 'style', description: `Color of ${which} points.` }),
          opacity: attr.number({
            min: 0,
            max: 1,
            editType: 'style',
            description:
              which === 'unselected'
                ? 'Opacity of unselected points. Default: 0.2 × the marker opacity.'
                : 'Opacity of selected points.',
          }),
        },
        { editType: 'style', description: `Marker style of ${which} points.` },
      ),
    },
    { editType: 'style', description: `Style of ${which} points while a selection is active.` },
  );
}

/** Per-point text shown in hover labels of points. */
export function textAttributes() {
  return {
    text: attr.string({
      arrayOk: true,
      dflt: '',
      editType: 'calc',
      description: 'Text per sample, shown in the hover label of its point.',
    }),
    zorder: attr.integer({
      dflt: 0,
      editType: 'plot',
      description:
        'Stacking order among the traces of a subplot: higher is drawn on top. At equal `zorder`, violins draw below boxes and both below scatter traces (Plotly’s layer order), then in trace order.',
    }),
  };
}

const statArray = (description: string) =>
  attr.dataArray({ editType: 'calc', role: 'data', description });

/** The box schema. Common trace attributes (`name`, `opacity`, `hovertemplate`, …) come from core. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const boxAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...sampleAttributes('box'),
      dx: attr.number({
        editType: 'calc',
        description:
          'Step between the positions of precomputed boxes when `x` is not given: box `i` is at `x0 + i·dx`. Default 1.',
      }),
      dy: attr.number({
        editType: 'calc',
        description:
          'Step between the positions of precomputed horizontal boxes when `y` is not given. Default 1.',
      }),
      q1: statArray(
        'Precomputed first quartiles, one per box. With `median` and `q3`, switches the trace to precomputed statistics.',
      ),
      median: statArray('Precomputed medians, one per box.'),
      q3: statArray('Precomputed third quartiles, one per box.'),
      lowerfence: statArray(
        'Precomputed lower whisker ends, one per box. Default: the lowest sample within 1.5 IQR of q1 when samples are given, else q1.',
      ),
      upperfence: statArray(
        'Precomputed upper whisker ends, one per box. Default: the highest sample within 1.5 IQR of q3 when samples are given, else q3.',
      ),
      mean: statArray(
        'Precomputed means, one per box (turns `boxmean` on by default). Default: the sample mean, else (q1 + q3) / 2.',
      ),
      sd: statArray(
        "Precomputed standard deviations, one per box (with `mean`, makes `boxmean: 'sd'` the default). Default: the sample standard deviation, else q3 − q1.",
      ),
      notchspan: statArray(
        'Precomputed notch half-heights, one per box (turns `notched` on by default). Default: 1.57 · IQR / √n.',
      ),
      notched: attr.boolean({
        editType: 'calc',
        description:
          "Draw notches at the median's 95% confidence interval (median ± 1.57 · IQR / √n): boxes whose notches don't overlap have different medians with roughly 95% confidence. Default: true when `notchwidth` (or `notchspan`) is set.",
      }),
      notchwidth: attr.number({
        min: 0,
        max: 0.5,
        dflt: 0.25,
        editType: 'calc',
        description: 'How far notches cut into the box, as a fraction of its width (0–0.5).',
      }),
      boxpoints: pointsModeAttribute('box'),
      ...pointAttributes('box'),
      sdmultiple: attr.number({
        min: 0,
        dflt: 1,
        editType: 'calc',
        description:
          "How many standard deviations the `sizemode: 'sd'` box and the `boxmean: 'sd'` diamond span on each side of the mean.",
      }),
      sizemode: attr.enumerated({
        values: ['quartiles', 'sd'],
        dflt: 'quartiles',
        editType: 'calc',
        description:
          "`'quartiles'`: the box spans q1–q3 with a line at the median; `'sd'`: it spans mean ± `sdmultiple` standard deviations with a line at the mean (no whiskers by default).",
      }),
      boxmean: attr.enumerated({
        values: [true, 'sd', false],
        editType: 'calc',
        description:
          "Draw the mean as a dashed line (`true`), plus a dashed diamond spanning ± `sdmultiple` standard deviations (`'sd'`). Default: on with precomputed `mean` (and `'sd'` with `sd`).",
      }),
      ...layoutRoleAttributes('box'),
      marker: markerAttributes(),
      ...outlineAttributes('box'),
      whiskerwidth: attr.number({
        min: 0,
        max: 1,
        dflt: 0.5,
        editType: 'calc',
        description: 'Width of the whisker caps as a fraction of the box width (0: no caps).',
      }),
      showwhiskers: attr.boolean({
        editType: 'calc',
        description: "Draw the whiskers. Default: true, except with `sizemode: 'sd'`.",
      }),
      selected: selectionAttributes('selected'),
      unselected: selectionAttributes('unselected'),
      ...textAttributes(),
      hoveron: attr.flaglist({
        flags: ['boxes', 'points'],
        dflt: 'boxes+points',
        editType: 'style',
        description:
          'What shows hover labels: the boxes (one label per statistic, as Plotly), the points, or both (a point under the pointer wins).',
      }),
    },
    {
      description:
        'Box plot: quartiles, median, whiskers and outliers of samples (or of precomputed statistics) at each position.',
    },
  ))();

/** Layout attributes owned by `box` (coerced when a box trace is present). */
export const boxLayoutAttributes = /* @__PURE__ */ (() => {
  const { mode, gap, groupgap } = groupingLayoutAttributes('box');
  return { boxmode: mode, boxgap: gap, boxgroupgap: groupgap };
})();

/** The nodes of `layout.<kind>mode`, `<kind>gap` and `<kind>groupgap`. */
export function groupingLayoutAttributes(kind: TraceKind) {
  const shape = kind === 'box' ? 'box' : 'violin';
  return {
    mode: attr.enumerated({
      values: ['group', 'overlay'],
      dflt: 'overlay',
      editType: 'calc',
      description: `How ${shape}es of different traces at the same position combine: side by side (\`group\`) or drawn over each other (\`overlay\`).`,
    }),
    gap: attr.number({
      min: 0,
      max: 1,
      dflt: 0.3,
      editType: 'calc',
      description: `Gap between ${shape}es at neighboring positions, as a fraction of the position slot.`,
    }),
    groupgap: attr.number({
      min: 0,
      max: 1,
      dflt: 0.3,
      editType: 'calc',
      description: `Gap between the ${shape}es of one position in \`group\` mode, as a fraction of each one's share.`,
    }),
  };
}
