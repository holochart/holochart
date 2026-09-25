/**
 * `parcats` attribute schema (plan E10.11, ADR-002), following plotly.js'
 * `traces/parcats/attributes.js`. `domain` comes from the registry (the trace is in the `domain`
 * category); `name`, `uid`, `hovertemplate`, … are common trace attributes.
 *
 * Edit types: data, category order and `line.color` are `calc` (they change the paths); labels,
 * fonts, `arrangement`, bundling and sorting are `plot` (the renderer lays the trace out); the
 * colorscale is `style`.
 */
import { attr } from '@mk7s/holochart-core';
import { lineColorscaleAttributes, traceFont } from '../parcoords/common.ts';

/** One dimension (a column of category bands). */
function dimension() {
  return attr.items(
    {
      label: attr.string({ editType: 'plot', description: 'Dimension title, drawn above it.' }),
      values: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          'The category of each sample in this dimension. A dimension without values is hidden.',
      }),
      categoryorder: attr.enumerated({
        values: ['trace', 'category ascending', 'category descending', 'array'],
        editType: 'calc',
        description:
          "Order of the categories, top to bottom: first appearance (`'trace'`), sorted, or `categoryarray` (then unlisted values by appearance). Default: `'array'` when `categoryarray` is given, else `'trace'`. Dragging a category restyles it to `'array'`.",
      }),
      categoryarray: attr.dataArray({
        editType: 'calc',
        description: "The category order with `categoryorder: 'array'`.",
      }),
      ticktext: attr.dataArray({
        editType: 'calc',
        description:
          "Category labels, one per `categoryarray` entry (`categoryorder: 'array'` only). Default: the values.",
      }),
      displayindex: attr.integer({
        editType: 'calc',
        description:
          'Position of this dimension, left to right. Default: its index. Used only when the visible dimensions form a permutation of 0 … n − 1; dragging a dimension restyles it.',
      }),
      visible: attr.boolean({
        dflt: true,
        editType: 'calc',
        description: 'Show this dimension. Hidden dimensions keep their place in `dimensions`.',
      }),
    },
    {
      itemName: 'dimension',
      editType: 'calc',
      description: 'The dimensions, left to right: each sample is a path across them.',
    },
  );
}

/** The parcats schema. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const parcatsAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      dimensions: dimension(),
      counts: attr.number({
        min: 0,
        dflt: 1,
        arrayOk: true,
        editType: 'calc',
        description: 'Weight of each sample (one for all, or one per sample; arrays repeat).',
      }),
      line: attr.object(
        {
          color: attr.color({
            arrayOk: true,
            editType: 'calc',
            description:
              'Path color: one CSS color, or one number per sample mapped through `line.colorscale` (samples of different colors form separate paths). Default: the trace color.',
          }),
          ...lineColorscaleAttributes('one per sample'),
          shape: attr.enumerated({
            values: ['linear', 'hspline'],
            dflt: 'linear',
            editType: 'plot',
            description: 'Path shape between dimensions: straight or a horizontal S-curve.',
          }),
          hovertemplate: attr.string({
            editType: 'none',
            description:
              'Template of the path hover labels: `%{count}`, `%{probability}`. Overrides `hoverinfo` for paths.',
          }),
        },
        { editType: 'calc', description: 'The paths, one per distinct combination and color.' },
      ),
      arrangement: attr.enumerated({
        values: ['perpendicular', 'freeform', 'fixed'],
        dflt: 'perpendicular',
        editType: 'plot',
        description:
          "Dragging: categories move vertically and dimensions horizontally (`'perpendicular'`), categories move freely (`'freeform'`), or nothing moves (`'fixed'`).",
      }),
      bundlecolors: attr.boolean({
        dflt: true,
        editType: 'plot',
        description: 'Group paths of the same color together within each category.',
      }),
      sortpaths: attr.enumerated({
        values: ['forward', 'backward'],
        dflt: 'forward',
        editType: 'plot',
        description:
          'Stack paths by their categories from the leftmost dimension (`forward`) or the rightmost (`backward`).',
      }),
      hoveron: attr.enumerated({
        values: ['category', 'color', 'dimension'],
        dflt: 'category',
        editType: 'none',
        description:
          "What a hover over a category band shows: the category, the colored band under the pointer (`'color'`), or every category of the dimension.",
      }),
      hoverinfo: attr.flaglist({
        flags: ['count', 'probability'],
        extras: ['all', 'none', 'skip'],
        dflt: 'all',
        editType: 'none',
        description:
          "Fields of the hover labels; `'none'` keeps the highlighting without labels, `'skip'` turns hover off.",
      }),
      labelfont: traceFont('Font of the dimension labels. Default: `layout.font`.'),
      tickfont: traceFont('Font of the category labels. Default: `layout.font`, 1/1.2 the size.'),
    },
    {
      description:
        'Parallel categories: one column of category bands per dimension, with paths across them sized by the number of samples; drag categories and dimensions to reorder them.',
    },
  ))();
