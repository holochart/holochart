/**
 * `table` attribute schema (plan E9.13, ADR-002), following plotly.js' `traces/table/attributes.js`.
 * `domain` comes from the registry (the trace is in the `domain` category); `name`, `uid`, `meta`,
 * … are common trace attributes.
 *
 * Styling attributes accept one value, one per column, or (nested arrays) one per column and row,
 * picked like Plotly's `gridPick`: `a[min(col, a.length − 1)]`, then, if that is an array,
 * `[min(row, length − 1)]`. Columns are counted in data order (before `columnorder`).
 *
 * Plotly sets every table attribute to `editType: 'calc'`; here data, formats and the column order
 * are `calc`, sizes and fonts `plot` and colors `style`, since the renderer lays tables out itself.
 *
 * Deferred: the font `variant` / `textcase` / `lineposition` / `shadow` fields.
 */
import { attr } from '@mk7s/holochart-core';

/** Font of header or cell text: every field one value, one per column, or per column and row. */
function tableFont(description: string) {
  return attr.object(
    {
      family: attr.string({
        noBlank: true,
        strict: true,
        arrayOk: true,
        editType: 'plot',
        description: 'CSS font-family list, or one per column (nested arrays: per row).',
      }),
      size: attr.number({
        min: 1,
        arrayOk: true,
        editType: 'plot',
        description: 'Font size in CSS px, or one per column (nested arrays: per row).',
      }),
      color: attr.color({
        arrayOk: true,
        editType: 'style',
        description: 'Text color, or one per column (nested arrays: per row).',
      }),
      weight: attr.integer({
        min: 1,
        max: 1000,
        extras: ['normal', 'bold'],
        arrayOk: true,
        editType: 'plot',
        description:
          'Font weight: a CSS numeric weight (1–1000), `normal` or `bold`, or one per column.',
      }),
      style: attr.enumerated({
        values: ['normal', 'italic'],
        arrayOk: true,
        editType: 'plot',
        description: 'Font style, or one per column (nested arrays: per row).',
      }),
    },
    { editType: 'plot', description },
  );
}

/** The `header` / `cells` container (they differ only in their default height). */
function block(which: 'header' | 'cells', height: number) {
  const rows = which === 'header' ? 'header rows' : 'rows';
  return attr.object(
    {
      values: attr.dataArray({
        editType: 'calc',
        role: 'data',
        description:
          which === 'header'
            ? 'Header text, one entry per column: a value, or an array of values for several header rows. Plotly pseudo-HTML is accepted (tags are stripped until rich text lands; `<br>` breaks lines).'
            : 'Cell values, column by column: `values[column][row]`. Columns may differ in length (short ones are padded with empty cells). A column beyond the header gets an empty header.',
      }),
      format: attr.dataArray({
        editType: 'calc',
        description:
          'd3-format specifiers applied to numeric values (e.g. `,.2f`, `.1%`), one per column or, nested, per column and row. Non-numeric values are shown as they are.',
      }),
      prefix: attr.string({
        arrayOk: true,
        editType: 'calc',
        description: 'Text before each value, one per column or, nested, per column and row.',
      }),
      suffix: attr.string({
        arrayOk: true,
        editType: 'calc',
        description: 'Text after each value, one per column or, nested, per column and row.',
      }),
      height: attr.number({
        dflt: height,
        editType: 'plot',
        description: `Height of the ${rows} in px. Rows grow to fit text that has spaces, line breaks or markup: its height plus 8 px of padding above and below (Plotly's \`cellPad\`).`,
      }),
      align: attr.enumerated({
        values: ['left', 'center', 'right'],
        dflt: 'center',
        arrayOk: true,
        editType: 'plot',
        description:
          'Horizontal alignment of the text in its cell, one per column or, nested, per column and row.',
      }),
      line: attr.object(
        {
          width: attr.number({
            dflt: 1,
            arrayOk: true,
            editType: 'plot',
            description:
              'Width of the cell outlines in px (centered on the cell edges), one per column or, nested, per column and row.',
          }),
          color: attr.color({
            dflt: 'grey',
            arrayOk: true,
            editType: 'style',
            description:
              'Color of the cell outlines, one per column or, nested, per column and row.',
          }),
        },
        { editType: 'plot', description: 'Cell outlines.' },
      ),
      fill: attr.object(
        {
          color: attr.color({
            dflt: 'white',
            arrayOk: true,
            editType: 'style',
            description:
              'Cell background color, one per column or, nested, per column and row (e.g. alternating row colors).',
          }),
        },
        { editType: 'style', description: 'Cell background.' },
      ),
      font: tableFont(`Font of the ${which} text. Defaults to \`layout.font\`.`),
    },
    {
      editType: 'calc',
      description:
        which === 'header'
          ? 'The header: fixed above the scrolling cells; drag a header cell to reorder columns.'
          : 'The cells, scrolled with the wheel, by dragging, or with the scrollbar.',
    },
  );
}

/** The table schema. */
// A pure IIFE, so bundles without this trace drop the whole schema: a package ships as one file,
// where top-level `attr.*()` calls would otherwise look side-effectful (E21.6).
export const tableAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      columnwidth: attr.number({
        arrayOk: true,
        editType: 'plot',
        description:
          'Relative column widths: columns share the domain width in proportion to these values (one for all, or one per column; a short array repeats its last entry, non-numeric entries count 1).',
      }),
      columnorder: attr.dataArray({
        editType: 'calc',
        description:
          'The rendered order of the data columns: a value `2` at position `0` means that data column 0 is drawn as the third column. Dragging a header cell reorders the columns and restyles this attribute.',
      }),
      header: block('header', 28),
      cells: block('cells', 20),
    },
    {
      description:
        'Table: a grid of formatted values with a fixed header, placed by `domain`. Only the visible rows are laid out and drawn, so large tables scroll smoothly.',
    },
  ))();
