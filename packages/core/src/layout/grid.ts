/**
 * `layout.grid` attribute schema (plan E4.4; Plotly's `plots/grid.js`): a regular grid of subplot
 * cells whose domains become the default `domain` / `anchor` / `side` / `position` of the cartesian
 * axes placed in it, and the default `domain` of domain traces (pie, …) placed by `domain.row` /
 * `domain.column`. The defaults themselves are computed in `defaults/grid.ts`.
 */
import { attr } from '../schema/attr.ts';

/**
 * Largest `rows` / `columns`. Plotly has no bound; one keeps a typo (`rows: 1e6`) from allocating
 * millions of cells, far beyond any readable grid.
 */
export const MAX_GRID_CELLS_PER_SIDE = 100;

const gridDomainItems = [
  attr.number({ min: 0, max: 1, dflt: 0 }),
  attr.number({ min: 0, max: 1, dflt: 1 }),
] as const;

/** The `layout.grid` container. */
export const gridSchema = attr.object(
  {
    rows: attr.integer({
      min: 1,
      max: MAX_GRID_CELLS_PER_SIDE,
      description:
        'Number of rows. Defaults to the length of `subplots` or `yaxes`. A grid needs more than one cell (`rows * columns > 1`); otherwise it is ignored.',
    }),
    roworder: attr.enumerated({
      values: ['top to bottom', 'bottom to top'],
      dflt: 'top to bottom',
      description:
        'Whether row 0 (of `subplots`, `yaxes` and trace `domain.row`) is the top row or the bottom row.',
    }),
    columns: attr.integer({
      min: 1,
      max: MAX_GRID_CELLS_PER_SIDE,
      description: 'Number of columns. Defaults to the length of `subplots[0]` or `xaxes`.',
    }),
    subplots: attr.infoArray({
      items: attr.infoArray({ items: attr.string({ dflt: '' }), dflt: [] }),
      description:
        "The cartesian subplot of each cell, as a 2D array `[row][column]` of ids like `'xy'` or `'x2y3'`, or `''` for an empty cell. All cells of a column must share one x axis and all cells of a row one y axis; a subplot that breaks this, or that no trace or axis creates, leaves its cell empty. Takes precedence over `xaxes`/`yaxes`. With `pattern: 'independent'` and no arrays, it defaults to `'xy'`, `'x2y2'`, … in row-major order.",
    }),
    xaxes: attr.infoArray({
      items: attr.string({ dflt: '' }),
      description:
        "The x axis of each column (`'x'`, `'x2'`, …, or `''` for none), used when there is no `subplots` array. Defaults to `'x'`, `'x2'`, … for `pattern: 'coupled'`.",
    }),
    yaxes: attr.infoArray({
      items: attr.string({ dflt: '' }),
      description:
        "The y axis of each row (`'y'`, `'y2'`, …, or `''` for none), used when there is no `subplots` array. Defaults to `'y'`, `'y2'`, … for `pattern: 'coupled'`.",
    }),
    pattern: attr.enumerated({
      values: ['independent', 'coupled'],
      dflt: 'coupled',
      description:
        "Default cell contents when neither `subplots` nor `xaxes`/`yaxes` is given: `coupled` shares one x axis per column and one y axis per row (`xaxes: ['x', 'x2', …]`, `yaxes: ['y', 'y2', …]`); `independent` gives every cell its own pair (`'xy'`, `'x2y2'`, … in row-major order).",
    }),
    xgap: attr.number({
      min: 0,
      max: 1,
      description:
        'Horizontal space between columns, as a fraction of a column width. Defaults to 0.2 for a grid of independent subplots (`subplots` or `pattern: independent`), 0.1 otherwise.',
    }),
    ygap: attr.number({
      min: 0,
      max: 1,
      description:
        'Vertical space between rows, as a fraction of a row height. Defaults to 0.3 for a grid of independent subplots (`subplots` or `pattern: independent`), 0.1 otherwise.',
    }),
    domain: attr.object(
      {
        x: attr.infoArray({
          items: gridDomainItems,
          dflt: [0, 1],
          description:
            'Horizontal extent `[start, end]` of the whole grid, as fractions of the plot area. An empty or reversed extent falls back to `[0, 1]`.',
        }),
        y: attr.infoArray({
          items: gridDomainItems,
          dflt: [0, 1],
          description:
            'Vertical extent `[start, end]` of the whole grid, as fractions of the plot area (from the bottom). An empty or reversed extent falls back to `[0, 1]`.',
        }),
      },
      { description: 'The part of the plot area the grid fills.' },
    ),
    xside: attr.enumerated({
      values: ['bottom', 'bottom plot', 'top plot', 'top'],
      dflt: 'bottom plot',
      description:
        "Where the x axes are drawn by default: `bottom plot` / `top plot` against the bottom-most / top-most subplot of their column; `bottom` / `top` at the bottom / top edge of the grid (`anchor: 'free'`), even when that cell is empty.",
    }),
    yside: attr.enumerated({
      values: ['left', 'left plot', 'right plot', 'right'],
      dflt: 'left plot',
      description:
        "Where the y axes are drawn by default: `left plot` / `right plot` against the left-most / right-most subplot of their row; `left` / `right` at the left / right edge of the grid (`anchor: 'free'`), even when that cell is empty.",
    }),
  },
  {
    // Grid values only feed defaults (axis domains and anchors, domain-trace extents), which
    // supply-defaults recomputes on every update; `calc` then re-runs everything after it,
    // including subplot placement.
    editType: 'calc',
    description:
      'A grid of subplots (Plotly `layout.grid`). Cartesian axes placed in the grid get their `domain`, `anchor`, `side` and `position` defaults from their cell; domain traces (pie, …) are placed with `domain.row` / `domain.column`. Values given on an axis or a trace always win.',
    role: 'layout',
  },
);
