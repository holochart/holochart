/**
 * Layout attribute schema (plan E1.4 / E1.9, cartesian axes E3).
 *
 * Cartesian axes carry every E3.1–E3.7 attribute (types, autorange, ticks, formats, categories)
 * and the E3.4 rendering attributes. Axis defaults that depend on other values (colors inherited
 * from `color`, fonts from `layout.font`, `tickmode` from `tickvals`/`dtick`, …) are filled in
 * `defaults/axes.ts`. Trace modules and components add their own layout attributes through the
 * registry.
 */
import { attr } from '../schema/attr.ts';
import { fontExtraAttributes, layoutFontExtraAttributes } from './font-attributes.ts';
import { gridSchema } from './grid.ts';
import type { AttrSpec, EditType } from '../schema/types.ts';

/** Transition easing names (Plotly-compatible). */
export const EASINGS = [
  'linear',
  'quad',
  'cubic',
  'sin',
  'exp',
  'circle',
  'elastic',
  'back',
  'bounce',
  'linear-in',
  'quad-in',
  'cubic-in',
  'sin-in',
  'exp-in',
  'circle-in',
  'elastic-in',
  'back-in',
  'bounce-in',
  'linear-out',
  'quad-out',
  'cubic-out',
  'sin-out',
  'exp-out',
  'circle-out',
  'elastic-out',
  'back-out',
  'bounce-out',
  'linear-in-out',
  'quad-in-out',
  'cubic-in-out',
  'sin-in-out',
  'exp-in-out',
  'circle-in-out',
  'elastic-in-out',
  'back-in-out',
  'bounce-in-out',
] as const;

/** The default Plotly/D3 category10 colorway. */
export const DEFAULT_COLORWAY = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf',
] as const;

/** Default font family stack. */
export const DEFAULT_FONT_FAMILY = '"Open Sans", verdana, arial, sans-serif';

/**
 * Font attributes without defaults. Containers like `title.font` inherit unset fields from
 * `layout.font` during supply-defaults.
 */
export function fontSchema(description: string) {
  return attr.object(
    {
      family: attr.string({
        noBlank: true,
        strict: true,
        description:
          'CSS font-family list. The renderer uses the first family it can load and falls back through the list.',
      }),
      size: attr.number({ min: 1, description: 'Font size in CSS pixels.' }),
      color: attr.color({ description: 'Text color.', editType: 'style' }),
      weight: attr.integer({
        min: 1,
        max: 1000,
        extras: ['normal', 'bold'],
        description: 'Font weight: a CSS numeric weight (1–1000), `normal` or `bold`.',
      }),
      style: attr.enumerated({
        values: ['normal', 'italic'],
        description: 'Font style.',
      }),
      ...fontExtraAttributes(),
    },
    { description, editType: ['layout', 'plot'] },
  );
}

/** Axis types (plan E3.1). `'-'` means "detect from data". */
export const AXIS_TYPES = ['-', 'linear', 'log', 'date', 'category', 'multicategory'] as const;

/** `categoryorder` values (plan E3.6). */
export const CATEGORY_ORDERS = [
  'trace',
  'category ascending',
  'category descending',
  'array',
  'total ascending',
  'total descending',
  'min ascending',
  'min descending',
  'max ascending',
  'max descending',
  'sum ascending',
  'sum descending',
  'mean ascending',
  'mean descending',
  'median ascending',
  'median descending',
] as const;

const SHOW_MODES = ['all', 'first', 'last', 'none'] as const;
const TICK_PLACEMENTS = ['outside', 'inside', ''] as const;

const DTICK_DESCRIPTION =
  'Tick step. Linear axes: a positive number. Log axes: an integer `n` (a tick every `n` decades), `L<f>` (linear steps of `f` in data units, e.g. `L0.5`), `D1` (every digit) or `D2` (1, 2 and 5). Date axes: milliseconds, or `M<n>` for `n` months (`M12` for years).';

const GRIDDASH_DESCRIPTION =
  'Dash style: `solid`, `dot`, `dash`, `longdash`, `dashdot`, `longdashdot`, or a CSS-like list of dash lengths in px (`5px,10px,2px,2px`).';

const AXIS_EDIT: EditType = ['layout', 'ticks', 'plot'];

const X_SIDE = attr.enumerated({
  values: ['bottom', 'top'],
  dflt: 'bottom',
  editType: AXIS_EDIT,
  description: 'Which side of the plot area the axis is drawn on.',
});
const Y_SIDE = attr.enumerated({
  values: ['left', 'right'],
  dflt: 'left',
  editType: AXIS_EDIT,
  description: 'Which side of the plot area the axis is drawn on.',
});

/** `side` per axis letter, typed exactly (x: bottom/top, y: left/right). */
function sideAttr<L extends 'x' | 'y'>(letter: L) {
  return (letter === 'x' ? X_SIDE : Y_SIDE) as unknown as L extends 'x'
    ? typeof X_SIDE
    : typeof Y_SIDE;
}

/**
 * `overlaying` (Plotly; plan E3.9): draw this axis over another axis of the same letter, e.g. a
 * secondary y axis. The subplot id builder needs a base id (`dflt`), so the attribute is typed
 * without a default: supply-defaults leaves it unset unless the user sets it (`defaults/axes.ts`).
 */
function overlayingAttr<L extends 'x' | 'y'>(letter: L) {
  return attr.subplotId({
    dflt: letter,
    extras: ['free'],
    editType: AXIS_EDIT,
    description: `Draw this axis over another ${letter} axis (\`'${letter}'\`, \`'${letter}2'\`, …), sharing its \`domain\` (this axis' own \`domain\` is ignored), e.g. a secondary y axis with \`side: 'right'\`. Unset (or \`free\`) by default. The target must exist and must not overlay another axis itself; otherwise this is ignored. Templates cannot set it, since it names specific axes.`,
  }) as unknown as AttrSpec<
    `${L}` | `${L}${number}` | 'free',
    `${L}` | `${L}${number}` | 'free' | undefined
  >;
}

/**
 * An axis font: {@link fontSchema} without defaults (they come from `layout.font`, see
 * `defaults/axes.ts`), where every field — color included — re-renders the axis (`editType`),
 * since axis labels are rebuilt rather than restyled in place.
 */
function axisFontSchema(description: string, editType: EditType) {
  const base = fontSchema(description);
  return attr.object(
    { ...base.children, color: attr.color({ description: 'Text color.' }) },
    { description, editType },
  );
}

function axisSchema<const L extends 'x' | 'y'>(letter: L) {
  // Cast keeps the literal counterpart ('y' for x axes) so inferred anchor types stay exact.
  const other = (letter === 'x' ? 'y' : 'x') as L extends 'x' ? 'y' : 'x';
  const tickLayout: EditType = ['layout', 'ticks'];
  const rangeEdit = AXIS_EDIT;
  return attr.subplotObject(
    letter,
    {
      visible: attr.boolean({
        dflt: true,
        editType: rangeEdit,
        description:
          'Draw the axis (line, ticks, labels, grid and title). A hidden axis still maps data to pixels.',
      }),
      color: attr.color({
        dflt: '#444',
        editType: 'ticks',
        description:
          'Base color of the axis: the default for `linecolor`, `tickcolor`, `zerolinecolor`, `dividercolor` and (when changed) the tick-label and title font colors.',
      }),

      // --- Type (E3.1) -------------------------------------------------------------------------
      type: attr.enumerated({
        values: AXIS_TYPES,
        dflt: '-',
        editType: 'calc',
        description:
          "Axis type. `'-'` detects the type from the data of the first trace on this axis (Plotly's rules: mostly dates → `date`; more than twice as many distinct strings as numbers → `category`; two-level `[[groups], [items]]` arrays → `multicategory`; otherwise `linear`).",
      }),
      autotypenumbers: attr.enumerated({
        values: ['convert types', 'strict'],
        dflt: 'convert types',
        editType: 'calc',
        description:
          "How type detection treats numeric strings: `convert types` counts `'12'` as a number; `strict` counts only real numbers, so numeric strings make a `category` axis.",
      }),

      // --- Range & autorange (E3.2) --------------------------------------------------------------
      autorange: attr.enumerated({
        values: [true, false, 'reversed', 'min reversed', 'max reversed', 'min', 'max'],
        dflt: true,
        editType: rangeEdit,
        description:
          'Whether the range is computed from the data. `reversed` autoranges with the axis flipped. `min`/`max` autorange only that end and take the other from `range` (`min reversed`/`max reversed` also flip the axis). Defaults to `false` when a full `range` is given, and to `min`/`max` when one end of `range` is `null`.',
      }),
      autorangeoptions: attr.object(
        {
          minallowed: attr.any({
            description: 'The autoranged minimum is exactly this value (data units).',
          }),
          maxallowed: attr.any({
            description: 'The autoranged maximum is exactly this value (data units).',
          }),
          clipmin: attr.any({
            description: 'The autoranged minimum is at least this value (data units).',
          }),
          clipmax: attr.any({
            description: 'The autoranged maximum is at most this value (data units).',
          }),
          include: attr.any({
            arrayOk: true,
            description: 'Value(s) the autorange must include (data units).',
          }),
        },
        { editType: rangeEdit, description: 'Constraints applied to the computed autorange.' },
      ),
      rangemode: attr.enumerated({
        values: ['normal', 'tozero', 'nonnegative'],
        dflt: 'normal',
        editType: rangeEdit,
        description:
          'Linear axes only. `tozero` extends the autorange to include 0; `nonnegative` keeps it ≥ 0.',
      }),
      fixedrange: attr.boolean({
        dflt: false,
        editType: 'none',
        description:
          'Disables zoom and pan on this axis (drag, scroll, and modebar zoom leave its range alone).',
      }),
      range: attr.infoArray({
        // `null` items are kept (partial ranges, `autorange: 'min' | 'max'`).
        items: [attr.any({ dflt: null }), attr.any({ dflt: null })],
        editType: ['ticks', 'plot'],
        animatable: true,
        description:
          'Visible range `[start, end]` in data units (numbers, dates or category names; exponents on log axes, as in Plotly). Setting it turns `autorange` off; `null` for one end autoranges that end only.',
      }),
      minallowed: attr.any({
        editType: 'plot',
        description:
          'Lowest value zoom and pan may reach, in range units (like `range`: exponents on log axes). Also caps the autorange.',
      }),
      maxallowed: attr.any({
        editType: 'plot',
        description:
          'Highest value zoom and pan may reach, in range units (like `range`: exponents on log axes). Also caps the autorange.',
      }),
      rangebreaks: attr.items(
        {
          enabled: attr.boolean({
            dflt: true,
            description: 'Whether this range break is applied.',
          }),
          visible: attr.boolean({
            dflt: true,
            description:
              'Set to `false` (by the template machinery) when `templateitemname` names no template break; hidden breaks are ignored like disabled ones.',
          }),
          bounds: attr.infoArray({
            items: [attr.any(), attr.any()],
            description:
              "Lower and upper bound of the break. Without `pattern`: values in data units (`['2024-01-06', '2024-01-08']`). With `pattern: 'day of week'`: day numbers 0–6 (Sunday = 0) or English day names (`['sat', 'mon']` hides Saturday and Sunday). With `pattern: 'hour'`: hours 0–24 (`[17, 9]` hides 17:00–09:00, wrapping past midnight). Patterns use UTC days and hours.",
          }),
          pattern: attr.enumerated({
            values: ['day of week', 'hour', ''],
            description:
              "How `bounds` repeat: `day of week` or `hour` (date axes only), or `''` for a single span. Defaults to `day of week` when `bounds` names days, else `''`.",
          }),
          values: attr.infoArray({
            items: attr.any(),
            freeLength: true,
            description:
              'Individual values to hide when no `bounds` are given, each hiding `[value, value + dvalue)` (e.g. holidays on a date axis).',
          }),
          dvalue: attr.number({
            min: 0,
            dflt: 86_400_000,
            description:
              'Size of each break in `values`, in data units (milliseconds on date axes). Default: one day.',
          }),
        },
        {
          itemName: 'rangebreak',
          editType: 'calc',
          description:
            'Spans hidden from the axis (plan E3.8): the axis skips them, so a weekday-only stock chart has no gaps for weekends or nights. Date and linear axes; data inside a break is not drawn. Ticks never land in a break; hover, zoom and pan work across breaks.',
        },
      ),

      // --- Placement (E4.1 / E3.4) ---------------------------------------------------------------
      domain: attr.infoArray({
        items: [attr.number({ min: 0, max: 1, dflt: 0 }), attr.number({ min: 0, max: 1, dflt: 1 })],
        dflt: [0, 1],
        editType: 'layout',
        description: 'Fraction of the plot area `[start, end]` this axis spans.',
      }),
      anchor: attr.subplotId({
        dflt: other,
        extras: ['free'],
        editType: 'layout',
        description: `The ${other} axis this axis is drawn against, or \`free\`. Defaults to the ${other} axis of the first subplot using this axis.`,
      }),
      side: sideAttr(letter),
      overlaying: overlayingAttr(letter),
      position: attr.number({
        min: 0,
        max: 1,
        dflt: 0,
        editType: rangeEdit,
        description: `Position of the axis in paper coordinates (0–1 across the ${other} direction). Only used when \`anchor\` is \`free\`.`,
      }),
      autoshift: attr.boolean({
        editType: rangeEdit,
        description:
          "y axes with `anchor: 'free'` only: move the axis sideways so it does not overlap other free axes on the same side (and default `position` to the overlaid plot's edge, `automargin` to `true`, `shift` to ∓3 px). Plotly semantics.",
      }),
      shift: attr.number({
        editType: rangeEdit,
        description:
          "y axes with `anchor: 'free'` only: extra horizontal offset in px (negative to the left). Defaults to -3 on the left and 3 on the right when `autoshift` is on, else 0.",
      }),

      // --- Linked axes and constraints (E3.9) ---------------------------------------------------
      matches: attr.string({
        strict: true,
        noBlank: true,
        editType: 'calc',
        description:
          "Link this axis' range to another axis of the same type (`'x'`, `'x2'`, `'y'`, …): they autorange together over all their data, and zoom, pan and `relayout` of one move all. The linked axes share `range`, `autorange`, `rangemode`, `rangebreaks`, `constrain` and the category order. An axis that would create a loop, or a target of another type, is ignored.",
      }),
      scaleanchor: attr.any({
        editType: rangeEdit,
        description:
          "Lock the scale (px per unit) of this axis to another axis (`'x'`, `'y2'`, …) of the same type, times `scaleratio`: `yaxis: { scaleanchor: 'x' }` keeps one unit the same length on both axes, e.g. for maps or square plots. Zooming either axis zooms the other. `false` or unset for none; ignored with `matches` or when it would create a loop.",
      }),
      scaleratio: attr.number({
        min: 0,
        dflt: 1,
        editType: rangeEdit,
        description:
          'With `scaleanchor`: px per unit of this axis divided by px per unit of the anchor axis (2 makes one unit here twice as long).',
      }),
      constrain: attr.enumerated({
        values: ['range', 'domain'],
        dflt: 'range',
        editType: rangeEdit,
        description:
          'How a `scaleanchor` / `matches` constraint is met on this axis: `range` widens the range, `domain` shrinks the axis (and its subplot) inside its `domain`.',
      }),
      constraintoward: attr.enumerated({
        values: ['left', 'center', 'right', 'top', 'middle', 'bottom'],
        editType: rangeEdit,
        description:
          'Which end stays put when a constraint changes the range or domain: `left`/`center`/`right` for x axes (default `center`), `bottom`/`middle`/`top` for y axes (default `middle`).',
      }),
      layer: attr.enumerated({
        values: ['above traces', 'below traces'],
        dflt: 'above traces',
        editType: 'plot',
        description:
          'Draw the axis line, ticks and labels above or below the traces. Grid lines are always below.',
      }),
      automargin: attr.flaglist({
        flags: ['height', 'width', 'left', 'right', 'top', 'bottom'],
        extras: [true, false],
        dflt: false,
        editType: rangeEdit,
        description:
          'Grow the figure margins so tick labels and the title fit (E4.2). `true` allows every direction; flags restrict it.',
      }),

      // --- Tick values (E3.3) --------------------------------------------------------------------
      tickmode: attr.enumerated({
        values: ['auto', 'linear', 'array', 'sync'],
        editType: 'ticks',
        description:
          '`auto` picks up to `nticks` round ticks; `linear` places ticks from `tick0` every `dtick`; `array` uses `tickvals`/`ticktext`; `sync` aligns with the overlaid axis (reserved; behaves as `auto`). Defaults to `array` when `tickvals` is set, `linear` when `dtick` is set, else `auto`.',
      }),
      nticks: attr.integer({
        min: 0,
        dflt: 0,
        editType: 'ticks',
        description:
          'Maximum number of ticks for `tickmode: auto` (the actual number may be lower so steps stay round). 0 picks it from the axis length.',
      }),
      tick0: attr.any({
        editType: 'ticks',
        description:
          'Position of one tick for `tickmode: linear` (data units; a date on date axes, an exponent on log axes unless `dtick` is `L<f>`). Defaults to 0, or 2000-01-01 on date axes.',
      }),
      dtick: attr.any({ editType: 'ticks', description: DTICK_DESCRIPTION }),
      tickvals: attr.dataArray({
        editType: 'ticks',
        description: 'Tick positions for `tickmode: array` (data units).',
      }),
      ticktext: attr.dataArray({
        editType: 'ticks',
        description: 'Tick labels for `tickvals`. Missing entries are formatted as usual.',
      }),

      // --- Tick labels (E3.3, E3.5, E3.7) --------------------------------------------------------
      showticklabels: attr.boolean({
        dflt: true,
        editType: tickLayout,
        description: 'Show tick labels.',
      }),
      tickfont: axisFontSchema('Tick-label font. Defaults to `layout.font`.', tickLayout),
      tickangle: attr.angle({
        extras: ['auto'],
        dflt: 'auto',
        editType: tickLayout,
        description:
          'Tick-label rotation in degrees. `auto` rotates x-axis labels by the first `autotickangles` entry that avoids overlap.',
      }),
      autotickangles: attr.infoArray({
        items: attr.angle(),
        dflt: [0, 30, 90],
        editType: tickLayout,
        description: 'Candidate angles, in order of preference, for `tickangle: auto`.',
      }),
      tickformat: attr.string({
        dflt: '',
        editType: tickLayout,
        description:
          'Tick-label format: a [d3-format](https://github.com/d3/d3-format) specifier for numbers (`.2f`, `~s`, `$,`) or a [d3-time-format](https://github.com/d3/d3-time-format) specifier for dates (`%b %Y`), plus `%{n}f` for `n` digits of fractional seconds and `%h` for the half year. Empty picks a format automatically.',
      }),
      tickformatstops: attr.items(
        {
          enabled: attr.boolean({
            dflt: true,
            description: 'Whether this stop is used.',
          }),
          visible: attr.boolean({
            dflt: true,
            description:
              'Set to `false` (by the template machinery) when `templateitemname` names no template stop; hidden stops are ignored like disabled ones.',
          }),
          dtickrange: attr.infoArray({
            items: [attr.any({ dflt: null }), attr.any({ dflt: null })],
            description:
              'Range `[min, max]` of the tick step (`dtick`) this format applies to; `null` for an open end. Date steps are in ms or `M<n>`.',
          }),
          value: attr.string({
            dflt: '',
            description: 'The `tickformat` to use while the tick step is inside `dtickrange`.',
          }),
        },
        {
          itemName: 'tickformatstop',
          editType: tickLayout,
          description:
            'Zoom-dependent tick formats: the first enabled stop whose `dtickrange` contains the current tick step replaces `tickformat`.',
        },
      ),
      hoverformat: attr.string({
        dflt: '',
        editType: 'none',
        description:
          'Format of this axis’ values in hover labels (same syntax as `tickformat`). Empty uses the tick format with extra precision.',
      }),
      tickprefix: attr.string({
        dflt: '',
        editType: tickLayout,
        description: 'Text before each tick label.',
      }),
      showtickprefix: attr.enumerated({
        values: SHOW_MODES,
        dflt: 'all',
        editType: tickLayout,
        description: 'Which tick labels get `tickprefix`.',
      }),
      ticksuffix: attr.string({
        dflt: '',
        editType: tickLayout,
        description: 'Text after each tick label.',
      }),
      showticksuffix: attr.enumerated({
        values: SHOW_MODES,
        dflt: 'all',
        editType: tickLayout,
        description: 'Which tick labels get `ticksuffix`.',
      }),
      exponentformat: attr.enumerated({
        values: ['none', 'e', 'E', 'power', 'SI', 'B'],
        dflt: 'B',
        editType: tickLayout,
        description:
          'How large and small numbers are written: `none` (1000000), `e` (1e+6), `E` (1E+6), `power` (1×10⁶), `SI` (1M), `B` (like SI but 1B for 10⁹).',
      }),
      showexponent: attr.enumerated({
        values: SHOW_MODES,
        dflt: 'all',
        editType: tickLayout,
        description: 'Which tick labels show the exponent.',
      }),
      minexponent: attr.number({
        min: 0,
        dflt: 3,
        editType: tickLayout,
        description:
          'Smallest decimal exponent written in exponent form (`SI`/`B` and exponent formats); smaller magnitudes are written out in full.',
      }),
      separatethousands: attr.boolean({
        dflt: false,
        editType: tickLayout,
        description:
          'Always separate thousands (1,000). By default only numbers with 5 or more integer digits are separated.',
      }),
      ticklabelmode: attr.enumerated({
        values: ['instant', 'period'],
        dflt: 'instant',
        editType: 'ticks',
        description:
          'Date axes: `instant` labels the tick instant; `period` centers each label in the period that starts at its tick (e.g. month names between month ticks).',
      }),
      ticklabelposition: attr.enumerated({
        values: [
          'outside',
          'inside',
          'outside top',
          'inside top',
          'outside left',
          'inside left',
          'outside right',
          'inside right',
          'outside bottom',
          'inside bottom',
        ],
        dflt: 'outside',
        editType: rangeEdit,
        description:
          'Tick labels outside or inside the plot area, optionally shifted to one side of the tick (`top`/`bottom` for y axes, `left`/`right` for x axes).',
      }),
      ticklabeloverflow: attr.enumerated({
        values: ['allow', 'hide past div', 'hide past domain'],
        editType: 'ticks',
        description:
          'What to do with labels that overflow: keep them, or hide those past the figure or the axis domain. Defaults to `hide past div` for outside labels and `hide past domain` for inside labels.',
      }),
      ticklabelstep: attr.integer({
        min: 1,
        dflt: 1,
        editType: 'ticks',
        description: 'Label every n-th tick only (`tickmode` `auto` and `linear`).',
      }),
      minorloglabels: attr.enumerated({
        values: ['small digits', 'complete', 'none'],
        dflt: 'small digits',
        editType: tickLayout,
        description:
          'Log axes whose automatic ticks fall between powers of ten (2, 5 or every digit): `small digits` labels them with a small digit (2, 5), `complete` with the full value in the tick font, with `tickprefix`/`ticksuffix` (20, 50, 200), `none` leaves them unlabelled.',
      }),
      ticklabelshift: attr.integer({
        dflt: 0,
        editType: tickLayout,
        description: 'Shift of tick labels along the axis, in px.',
      }),
      ticklabelstandoff: attr.integer({
        dflt: 0,
        editType: tickLayout,
        description: 'Extra distance between tick labels and ticks, in px.',
      }),

      // --- Categories (E3.6) ---------------------------------------------------------------------
      categoryorder: attr.enumerated({
        values: CATEGORY_ORDERS,
        editType: 'calc',
        description:
          'Order of categories: as they first appear in the traces (`trace`), alphabetical/numerical (`category ascending|descending`), `categoryarray` first (`array`), or by an aggregate of the trace values per category (`total`, `min`, `max`, `sum`, `mean`, `median`). Defaults to `array` when `categoryarray` is set, else `trace`.',
      }),
      categoryarray: attr.dataArray({
        editType: 'calc',
        description:
          'Category order for `categoryorder: array`. Categories not listed follow in trace order.',
      }),
      showdividers: attr.boolean({
        dflt: true,
        editType: 'ticks',
        description: 'Multicategory axes: draw divider lines between groups.',
      }),
      dividercolor: attr.color({
        editType: 'ticks',
        description: 'Multicategory divider color. Defaults to `color`.',
      }),
      dividerwidth: attr.number({
        min: 0,
        dflt: 1,
        editType: 'ticks',
        description: 'Multicategory divider width in px.',
      }),

      // --- Lines, ticks, grid (E3.4) -------------------------------------------------------------
      showline: attr.boolean({
        dflt: false,
        editType: rangeEdit,
        description: 'Draw the axis line.',
      }),
      linecolor: attr.color({
        editType: 'ticks',
        description: 'Axis line color. Defaults to `color`.',
      }),
      linewidth: attr.number({
        min: 0,
        dflt: 1,
        editType: 'ticks',
        description: 'Axis line width in px.',
      }),
      mirror: attr.enumerated({
        values: [true, 'ticks', false, 'all', 'allticks'],
        dflt: false,
        editType: rangeEdit,
        description:
          'Repeat the axis line on the opposite side of the plot area: `true` (line), `ticks` (line and ticks); `all`/`allticks` do the same on every subplot sharing this axis.',
      }),
      ticks: attr.enumerated({
        values: TICK_PLACEMENTS,
        dflt: '',
        editType: rangeEdit,
        description: "Draw tick marks outside or inside the plot area, or not at all (`''`).",
      }),
      ticklen: attr.number({
        min: 0,
        dflt: 5,
        editType: tickLayout,
        description: 'Tick length in px.',
      }),
      tickwidth: attr.number({
        min: 0,
        dflt: 1,
        editType: 'ticks',
        description: 'Tick width in px.',
      }),
      tickcolor: attr.color({
        editType: 'ticks',
        description: 'Tick color. Defaults to `color`.',
      }),
      showgrid: attr.boolean({
        dflt: true,
        editType: 'ticks',
        description: 'Draw grid lines at each tick.',
      }),
      gridcolor: attr.color({
        dflt: '#eee',
        editType: 'ticks',
        description: 'Grid line color.',
      }),
      gridwidth: attr.number({
        min: 0,
        dflt: 1,
        editType: 'ticks',
        description: 'Grid line width in px.',
      }),
      griddash: attr.string({
        dflt: 'solid',
        editType: 'ticks',
        description: GRIDDASH_DESCRIPTION,
      }),
      zeroline: attr.boolean({
        dflt: true,
        editType: 'ticks',
        description: 'Draw a line at 0 (linear axes whose range contains 0).',
      }),
      zerolinecolor: attr.color({
        editType: 'ticks',
        description: 'Zero line color. Defaults to `color`.',
      }),
      zerolinewidth: attr.number({
        min: 0,
        dflt: 1,
        editType: 'ticks',
        description: 'Zero line width in px.',
      }),

      // --- Spike lines (E3.10) -------------------------------------------------------------------
      showspikes: attr.boolean({
        editType: 'modebar',
        description:
          "Draw a spike line from the hovered point to this axis. Defaults to `false`, or `true` when any other `spike*` attribute is set or `hovermode` is this axis' unified mode (`x unified` for x axes).",
      }),
      spikecolor: attr.color({
        editType: 'none',
        description:
          "Spike line color. Defaults to the hovered point's color (or a contrasting color when that is too close to the background).",
      }),
      spikethickness: attr.number({
        dflt: 3,
        editType: 'none',
        description: 'Spike line width in px (1.5 in unified hover).',
      }),
      spikedash: attr.string({
        dflt: 'dash',
        editType: 'none',
        description: `Spike line dash (\`dot\` in unified hover). ${GRIDDASH_DESCRIPTION}`,
      }),
      spikemode: attr.flaglist({
        flags: ['toaxis', 'across', 'marker'],
        dflt: 'toaxis',
        editType: 'none',
        description:
          '`toaxis`: from the point to the axis; `across`: across the whole plot area; `marker`: a dot on the axis. Combine with `+` (`across+marker`). Unified hover defaults to `across`.',
      }),
      spikesnap: attr.enumerated({
        values: ['data', 'cursor', 'hovered data'],
        dflt: 'hovered data',
        editType: 'none',
        description:
          '`hovered data`: the spike follows the hovered point; `data`: the closest point within `spikedistance`, even when no label shows; `cursor`: the pointer position.',
      }),

      // --- Minor ticks (E3.3) --------------------------------------------------------------------
      minor: attr.object(
        {
          tickmode: attr.enumerated({
            values: ['auto', 'linear', 'array'],
            description:
              'As the major `tickmode`. Defaults to `array` when `minor.tickvals` is set, `linear` when `minor.dtick` is set, else `auto`.',
          }),
          nticks: attr.integer({
            min: 0,
            dflt: 5,
            description:
              'Maximum number of minor ticks per major interval for `tickmode: auto` (0 picks it from the axis length).',
          }),
          tick0: attr.any({ description: 'As the major `tick0`. Defaults to the major `tick0`.' }),
          dtick: attr.any({ description: `Minor tick step. ${DTICK_DESCRIPTION}` }),
          tickvals: attr.dataArray({ description: 'Minor tick positions for `tickmode: array`.' }),
          ticks: attr.enumerated({
            values: TICK_PLACEMENTS,
            dflt: '',
            description: 'Draw minor tick marks outside or inside the plot area, or not at all.',
          }),
          ticklen: attr.number({
            min: 0,
            description: 'Minor tick length in px. Defaults to 60% of `ticklen`.',
          }),
          tickwidth: attr.number({
            min: 0,
            description: 'Minor tick width in px. Defaults to `tickwidth`.',
          }),
          tickcolor: attr.color({ description: 'Minor tick color. Defaults to `tickcolor`.' }),
          showgrid: attr.boolean({ dflt: false, description: 'Draw minor grid lines.' }),
          gridcolor: attr.color({
            description:
              'Minor grid color. Defaults to `gridcolor` blended halfway to the plot background.',
          }),
          gridwidth: attr.number({
            min: 0,
            description: 'Minor grid width in px. Defaults to `gridwidth`.',
          }),
          griddash: attr.string({
            description: `Minor grid dash style. Defaults to \`griddash\`. ${GRIDDASH_DESCRIPTION}`,
          }),
        },
        { editType: 'ticks', description: 'Minor ticks and grid lines between the major ticks.' },
      ),

      // --- Title (E3.4) --------------------------------------------------------------------------
      title: attr.object(
        {
          text: attr.string({
            dflt: '',
            description: 'Axis title text (supports rich-text tags, E2.10).',
          }),
          font: axisFontSchema(
            'Axis title font. Defaults to `layout.font` with 1.2× size.',
            AXIS_EDIT,
          ),
          standoff: attr.number({
            min: 0,
            description:
              'Distance in px between the tick labels and the title. By default it follows the tick labels automatically.',
          }),
        },
        { editType: rangeEdit, description: 'Axis title.' },
      ),
    },
    {
      editType: 'calc',
      description: `A ${letter} axis. \`${letter}axis2\`, \`${letter}axis3\`, … declare further ${letter} axes, referenced from traces as \`'${letter}2'\`, \`'${letter}3'\`, ….`,
      role: 'layout',
    },
  );
}

const RANGE_DESCRIPTION =
  'in data units, like the axis `range` (dates on date axes, exponents on log axes)';

/**
 * `xaxis.rangeslider` (plan E5.9, Plotly semantics): an overview strip under the x axis with a
 * thumbnail of the subplot's traces and a draggable window over the axis range. Present in the
 * full layout only while visible (see `defaults/rangeslider.ts`).
 */
export const rangesliderSchema = attr.object(
  {
    visible: attr.boolean({
      description:
        'Show the range slider. Defaults to `true` when `rangeslider` is given (`rangeslider: {}` is enough), else `false`.',
    }),
    thickness: attr.number({
      min: 0,
      max: 1,
      dflt: 0.15,
      description:
        'Height of the slider as a fraction of the figure height minus `margin.t` and `margin.b`. The bottom margin grows to make room for it.',
    }),
    bgcolor: attr.color({ description: 'Background of the slider. Defaults to `plot_bgcolor`.' }),
    bordercolor: attr.color({ dflt: '#444', description: 'Border color of the slider.' }),
    borderwidth: attr.integer({ min: 0, dflt: 0, description: 'Border width of the slider, px.' }),
    autorange: attr.boolean({
      description:
        'Span every data point of the axis (its autorange, whatever the axis range in view). Defaults to `true` unless a full `range` is given.',
    }),
    range: attr.infoArray({
      items: [attr.any({ dflt: null }), attr.any({ dflt: null })],
      description: `Range the slider spans, ${RANGE_DESCRIPTION}. The slider always covers the axis range in view as well.`,
    }),
    yaxis: attr.subplotObject(
      'y',
      {
        rangemode: attr.enumerated({
          values: ['auto', 'fixed', 'match'],
          description:
            "The y range of this subplot's thumbnail: `match` follows the y axis range in view, `auto` spans all the y data (autorange), `fixed` uses `range`. Defaults to `fixed` with a valid `range`, else `match`.",
        }),
        range: attr.infoArray({
          items: [attr.any({ dflt: null }), attr.any({ dflt: null })],
          description: `Thumbnail y range for \`rangemode: 'fixed'\`, ${RANGE_DESCRIPTION}.`,
        }),
      },
      {
        description:
          'Thumbnail y range per y axis: `yaxis` for the subplot on `y`, `yaxis2` for `y2`, … (one thumbnail per subplot on this x axis, drawn over each other).',
      },
    ),
  },
  {
    editType: 'layout',
    description:
      'Range slider (plan E5.9): an overview of all the data under the x axis, with a window over the range in view. Drag the window to pan, its ends to zoom, or click elsewhere to center the window there; the axis range changes with one `relayout` at the end of the drag. Y axes anchored to an axis with a range slider default to `fixedrange: true`, as in Plotly.',
  },
);

/** `xaxis.rangeselector` (plan E5.9, Plotly semantics): preset range buttons over the chart. */
export const rangeselectorSchema = attr.object(
  {
    visible: attr.boolean({
      description: 'Show the range selector. Defaults to `true` when it has `buttons`.',
    }),
    buttons: attr.items(
      {
        visible: attr.boolean({ dflt: true, description: 'Show this button.' }),
        step: attr.enumerated({
          values: ['month', 'year', 'day', 'hour', 'minute', 'second', 'all'],
          dflt: 'month',
          description:
            'Unit of the range the button sets, with `count`; `all` autoranges the axis instead.',
        }),
        stepmode: attr.enumerated({
          values: ['backward', 'todate'],
          dflt: 'backward',
          description:
            "`backward`: the range ends at the current range end and starts `count` `step`s before it. `todate`: it starts at the start of the `step` period, `count - 1` periods back (`count: 1, step: 'year'` is year-to-date).",
        }),
        count: attr.number({
          min: 0,
          dflt: 1,
          description: 'Number of `step`s the range spans.',
        }),
        label: attr.string({
          description:
            'Button text. Default: `count` and the first letter of `step` (`6m`), or `all`.',
        }),
      },
      { itemName: 'button', description: 'The buttons, left to right.' },
    ),
    x: attr.number({
      min: -2,
      max: 3,
      description:
        'Horizontal position in paper coordinates (fractions of the plot area width). Defaults to the start of the axis domain. Give `x` and `y` together; one alone is ignored.',
    }),
    xanchor: attr.enumerated({
      values: ['auto', 'left', 'center', 'right'],
      dflt: 'left',
      description: 'Which side of the button row `x` refers to.',
    }),
    y: attr.number({
      min: -2,
      max: 3,
      description:
        'Vertical position in paper coordinates. Defaults to just above the highest subplot on this x axis.',
    }),
    yanchor: attr.enumerated({
      values: ['auto', 'top', 'middle', 'bottom'],
      dflt: 'bottom',
      description: 'Which side of the button row `y` refers to.',
    }),
    font: axisFontSchema('Button font. Defaults to `layout.font`.', 'layout'),
    bgcolor: attr.color({ dflt: '#eee', description: 'Background of the buttons.' }),
    activecolor: attr.color({
      description:
        'Background of the active button (the one whose range is in view) and of hovered buttons. Defaults to `bgcolor` darkened (light colors) or lightened (dark colors).',
    }),
    bordercolor: attr.color({ dflt: '#444', description: 'Border color of the buttons.' }),
    borderwidth: attr.number({ min: 0, dflt: 0, description: 'Border width of the buttons, px.' }),
  },
  {
    editType: 'layout',
    description:
      'Range selector (plan E5.9): buttons over the chart that set the x range to a preset span ending at the current range end (last 6 months, year to date, all). Date axes only. The button whose range is in view shows as active.',
  },
);

const xaxisBase = axisSchema('x');

/** Cartesian x-axis schema (plan E3): the axis attributes plus the range slider and selector. */
export const xaxisSchema = attr.subplotObject(
  'x',
  { ...xaxisBase.children, rangeslider: rangesliderSchema, rangeselector: rangeselectorSchema },
  {
    ...(xaxisBase.editType === undefined ? {} : { editType: xaxisBase.editType }),
    ...(xaxisBase.description === undefined ? {} : { description: xaxisBase.description }),
    role: 'layout',
  },
);
/** Cartesian y-axis schema (plan E3). */
export const yaxisSchema = axisSchema('y');

/**
 * `layout.selections[]` (plan E5.12, Plotly 2.13+): box and lasso selections kept as layout
 * objects. Box and lasso drags add one (`relayout` of `selections`); selections given in the
 * layout select the points inside them on every draw; dragging one moves or resizes it.
 */
export const selectionsSchema = attr.items(
  {
    visible: attr.boolean({
      dflt: true,
      description:
        'Whether this selection applies (set to `false` by the template machinery when `templateitemname` names no template selection).',
    }),
    type: attr.enumerated({
      values: ['rect', 'path'],
      description:
        '`rect`: the box from (`x0`, `y0`) to (`x1`, `y1`); `path`: the polygon `path` (lasso). Default: `path` when `path` is set, else `rect`.',
    }),
    xref: attr.subplotId({
      dflt: 'x',
      description: 'The x axis the coordinates refer to (`x`, `x2`, …).',
    }),
    yref: attr.subplotId({
      dflt: 'y',
      description: 'The y axis the coordinates refer to (`y`, `y2`, …).',
    }),
    x0: attr.any({
      description:
        'Start x of a `rect`, in data units of `xref` (dates, category names or indices; data values on log axes). A `rect` needs all four of `x0`, `x1`, `y0`, `y1`.',
    }),
    x1: attr.any({ description: 'End x of a `rect`.' }),
    y0: attr.any({ description: 'Start y of a `rect`.' }),
    y1: attr.any({ description: 'End y of a `rect`.' }),
    path: attr.string({
      description:
        'Polygon of a `path` selection, SVG-like in data units: `M x,y L x,y … Z` (also `H`, `V` and relative commands). Dates use `_` between date and time (`2024-01-05_12:00`).',
    }),
    opacity: attr.number({ min: 0, max: 1, dflt: 0.7, description: 'Opacity of the outline.' }),
    line: attr.object(
      {
        color: attr.color({
          description:
            'Outline color. Default: a color contrasting with `plot_bgcolor` (white on dark, `#444` on light).',
        }),
        width: attr.number({ min: 1, dflt: 1, description: 'Outline width, px.' }),
        dash: attr.string({
          dflt: 'dot',
          description:
            "Dash style: `solid`, `dot`, `dash`, `longdash`, `dashdot`, `longdashdot` or a px list (`'5px,10px'`).",
        }),
      },
      { description: 'Outline style.' },
    ),
  },
  {
    itemName: 'selection',
    editType: 'plot',
    description:
      'Selections as layout objects (plan E5.12): each box or lasso drag in `select` / `lasso` mode adds one (shift keeps the others), and every selection on a subplot selects the points inside it (`selectedpoints` follows). Set them to restore a selection; drag one to move or resize it; a double-click clears them.',
  },
);

/** The base layout schema. Registry-merged with trace-module and component layout attributes. */
export const layoutSchema = attr.object(
  {
    width: attr.number({
      min: 10,
      dflt: 700,
      editType: 'layout',
      description: 'Figure width in CSS pixels. Ignored when `autosize` fills the container.',
    }),
    height: attr.number({
      min: 10,
      dflt: 450,
      editType: 'layout',
      description: 'Figure height in CSS pixels. Ignored when `autosize` fills the container.',
    }),
    autosize: attr.boolean({
      dflt: false,
      editType: 'layout',
      description:
        'Size the figure to its container on first render (and on resize with `config.responsive`).',
    }),
    margin: attr.object(
      {
        l: attr.number({ min: 0, dflt: 80, description: 'Left margin in CSS pixels.' }),
        r: attr.number({ min: 0, dflt: 80, description: 'Right margin in CSS pixels.' }),
        t: attr.number({ min: 0, dflt: 100, description: 'Top margin in CSS pixels.' }),
        b: attr.number({ min: 0, dflt: 80, description: 'Bottom margin in CSS pixels.' }),
        pad: attr.number({
          min: 0,
          dflt: 0,
          description: 'Padding between the plot area and the axis lines, in CSS pixels.',
        }),
        autoexpand: attr.boolean({
          dflt: true,
          description: 'Let components (legend, colorbars, automargin axes) grow the margins.',
        }),
        gutter: attr.number({
          min: 0,
          dflt: 0,
          description:
            'Holochart extension: space (CSS px) kept between the figure edge and content that grows a margin (automargin tick labels and axis titles, legends, colorbars), so it never touches the edge. 0 (Plotly) lets that content reach the edge.',
        }),
      },
      { editType: 'layout', description: 'Space around the plot area.' },
    ),
    paper_bgcolor: attr.color({
      dflt: '#fff',
      editType: 'style',
      description: 'Background color of the whole figure.',
    }),
    plot_bgcolor: attr.color({
      dflt: '#fff',
      editType: 'style',
      description: 'Background color of the plot area between the axes.',
    }),
    font: attr.object(
      {
        family: attr.string({
          noBlank: true,
          strict: true,
          dflt: DEFAULT_FONT_FAMILY,
          description: 'CSS font-family list used by every text element unless overridden.',
        }),
        size: attr.number({ min: 1, dflt: 12, description: 'Base font size in CSS pixels.' }),
        color: attr.color({ dflt: '#444', editType: 'style', description: 'Base text color.' }),
        weight: attr.integer({
          min: 1,
          max: 1000,
          extras: ['normal', 'bold'],
          dflt: 'normal',
          description: 'Base font weight.',
        }),
        style: attr.enumerated({
          values: ['normal', 'italic'],
          dflt: 'normal',
          description: 'Base font style.',
        }),
        ...layoutFontExtraAttributes(),
      },
      {
        editType: ['layout', 'plot'],
        description: 'Global font. Every text element inherits unset font fields from here.',
      },
    ),
    colorway: attr.colorlist({
      dflt: DEFAULT_COLORWAY,
      editType: ['style', 'legend'],
      description: 'Default trace colors, cycled by trace index.',
    }),
    template: attr.any({
      editType: 'calc',
      description:
        "Template: a registered name (`'dark'`), a `+`-composition (`'dark+presentation'`) or an object `{ layout, data }`. `null` disables the default template.",
    }),
    title: attr.object(
      {
        text: attr.string({
          dflt: '',
          description: 'Title text (supports rich-text tags, E2.10).',
        }),
        font: fontSchema('Title font. Defaults to `layout.font` with 1.4× size.'),
        x: attr.number({
          min: 0,
          max: 1,
          dflt: 0.5,
          description: 'Horizontal position in `xref` coordinates.',
        }),
        y: attr.number({
          min: 0,
          max: 1,
          extras: ['auto'],
          dflt: 'auto',
          description:
            'Vertical position in `yref` coordinates. `auto` places it in the top margin.',
        }),
        xref: attr.enumerated({
          values: ['container', 'paper'],
          dflt: 'container',
          description: '`container` spans the whole figure; `paper` spans the plot area.',
        }),
        yref: attr.enumerated({
          values: ['container', 'paper'],
          dflt: 'container',
          description: '`container` spans the whole figure; `paper` spans the plot area.',
        }),
        xanchor: attr.enumerated({
          values: ['auto', 'left', 'center', 'right'],
          dflt: 'auto',
          description: 'Horizontal alignment of the title box relative to `x`.',
        }),
        yanchor: attr.enumerated({
          values: ['auto', 'top', 'middle', 'bottom'],
          dflt: 'auto',
          description: 'Vertical alignment of the title box relative to `y`.',
        }),
      },
      { editType: ['layout', 'plot'], description: 'Figure title.' },
    ),
    showlegend: attr.boolean({
      editType: ['legend', 'layout'],
      description:
        'Show the legend. Defaults to `true` when more than one trace has a legend entry.',
    }),
    uniformtext: attr.object(
      {
        mode: attr.enumerated({
          values: [false, 'hide', 'show'],
          dflt: false,
          description:
            'Uniform size for the text inside bars and pie slices, per trace type (E4.6): labels are drawn at the smallest fitted size; `hide` drops labels that would be smaller than `minsize`, `show` draws them at the uniform size. `false` lets every label scale on its own.',
        }),
        minsize: attr.number({
          min: 0,
          dflt: 0,
          description:
            'Minimum text size in px for `uniformtext.mode`. Also raises trace fonts smaller than it.',
        }),
      },
      { editType: 'plot', description: 'Uniform text sizing for bar and pie labels (E4.6).' },
    ),
    hovermode: attr.enumerated({
      values: ['x', 'y', 'closest', false, 'x unified', 'y unified'],
      dflt: 'closest',
      editType: 'modebar',
      description:
        'How hover picks points: nearest point, all points at the same x/y, or unified labels.',
    }),
    dragmode: attr.enumerated({
      values: [
        'zoom',
        'pan',
        'select',
        'lasso',
        'drawclosedpath',
        'drawopenpath',
        'drawline',
        'drawrect',
        'drawcircle',
        'orbit',
        'turntable',
        false,
      ],
      dflt: 'zoom',
      editType: 'modebar',
      description:
        'What dragging on the plot area does: zoom, pan, box or lasso select, or draw a new shape (`draw*`, styled by `newshape`).',
    }),
    transition: attr.object(
      {
        duration: attr.number({
          min: 0,
          dflt: 500,
          description: 'Transition duration in milliseconds.',
        }),
        easing: attr.enumerated({
          values: EASINGS,
          dflt: 'cubic-in-out',
          description: 'Easing function.',
        }),
        ordering: attr.enumerated({
          values: ['layout first', 'traces first'],
          dflt: 'layout first',
          description: 'Whether layout or trace changes animate first.',
        }),
      },
      { editType: 'none', description: 'Default transition for animated updates (E7.3).' },
    ),
    uirevision: attr.any({
      editType: 'none',
      description:
        'While unchanged across updates, user interaction state (zoom, legend toggles, selections) is preserved.',
    }),
    datarevision: attr.any({
      editType: 'calc',
      description: 'Change this to force data arrays to be re-read when they are mutated in place.',
    }),
    meta: attr.any({
      arrayOk: true,
      editType: 'plot',
      description: 'Arbitrary user data, available in text templates as `%{meta}`.',
    }),
    grid: gridSchema,
    xaxis: xaxisSchema,
    yaxis: yaxisSchema,
    selections: selectionsSchema,
  },
  { editType: 'calc', description: 'Figure layout.' },
);
