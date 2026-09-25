/**
 * `splom` attribute schema (plan E10.9, ADR-002), following plotly.js' splom attributes: the
 * dimensions, which halves and the diagonal are drawn, the axes of each dimension, text, and the
 * scatter marker styles (with colorscale and colorbar) and selected / unselected styles.
 *
 * Deferred: `xhoverformat` / `yhoverformat` (the axes' `hoverformat` applies), `marker.gradient`.
 */
import { attr } from '@mk7s/holochart-core';
import { scatterAttributes } from '@mk7s/holochart-traces-basic';

const scatterMarker = scatterAttributes.children.marker.children;
const { maxdisplayed: _maxdisplayed, ...markerChildren } = scatterMarker;

/** `selected` / `unselected`: marker styles only (splom has no text labels). */
function selectionAttributes(which: 'selected' | 'unselected') {
  return attr.object(
    { marker: scatterAttributes.children[which].children.marker },
    {
      editType: 'style',
      description: `Style of ${which} points while a selection is active (box/lasso select in any cell, \`selectedpoints\`), in every cell.`,
    },
  );
}

/** Subplot axis ids of the dimensions, one per dimension. */
function axesAttribute(letter: 'x' | 'y') {
  return attr.infoArray({
    items: attr.subplotId({ dflt: letter, editType: 'plot' }),
    freeLength: true,
    editType: 'calc',
    description: `The ${letter} axis of each dimension, in order (\`'${letter}'\`, \`'${letter}2'\`, …). Default \`['${letter}', '${letter}2', …]\`, one per dimension. Dimension \`i\` is drawn along the ${letter === 'x' ? 'column' : 'row'} of this axis.`,
  });
}

export const splomAttributes = attr.object(
  {
    dimensions: attr.items(
      {
        visible: attr.boolean({
          dflt: true,
          editType: 'calc',
          description:
            'Whether the dimension is drawn. A hidden dimension keeps its row and column, empty. Forced to `false` without `values`.',
        }),
        label: attr.string({
          editType: 'calc',
          description:
            'Label of the dimension: the default title of its axes and the name hover labels give its values.',
        }),
        values: attr.dataArray({
          editType: 'calc',
          role: 'data',
          description:
            'Values of the dimension, one per sample (numbers, dates or categories; typed arrays are used as they are). Every dimension indexes the same samples; the shortest one sets the sample count.',
        }),
        axis: attr.object(
          {
            type: attr.enumerated({
              values: ['linear', 'log', 'date', 'category'],
              editType: 'calc',
              description:
                "Default `type` of the dimension's axes. Without it the type is detected from `values`.",
            }),
            matches: attr.boolean({
              dflt: false,
              editType: 'calc',
              description:
                "Link the dimension's x and y axes (`matches`), so zooming one zooms the other.",
            }),
          },
          { editType: 'calc', description: "Defaults for the dimension's axes." },
        ),
      },
      {
        itemName: 'dimension',
        editType: 'calc',
        description:
          'The dimensions of the matrix: one row and one column per dimension, in order (row 0 on top).',
      },
    ),
    text: attr.string({
      arrayOk: true,
      dflt: '',
      editType: 'calc',
      description: 'Text per sample, shown in hover labels.',
    }),
    diagonal: attr.object(
      {
        visible: attr.boolean({
          dflt: true,
          editType: 'calc',
          description:
            'Whether the diagonal cells (each dimension against itself: the samples on a line) are drawn.',
        }),
      },
      { editType: 'calc', description: 'The diagonal cells.' },
    ),
    showupperhalf: attr.boolean({
      dflt: true,
      editType: 'calc',
      description: 'Whether the cells above the diagonal are drawn.',
    }),
    showlowerhalf: attr.boolean({
      dflt: true,
      editType: 'calc',
      description: 'Whether the cells below the diagonal are drawn.',
    }),
    xaxes: axesAttribute('x'),
    yaxes: axesAttribute('y'),
    marker: attr.object(markerChildren, {
      editType: 'calc',
      description:
        'Marker style, the same in every cell: color (per sample, or numbers mapped through `colorscale` with an optional colorbar), size, symbol, opacity, angle and outline.',
    }),
    selected: selectionAttributes('selected'),
    unselected: selectionAttributes('unselected'),
  },
  {
    description:
      'Scatter plot matrix: every pair of dimensions as a scatter plot, one cell per pair, with linked selection across cells.',
  },
);
