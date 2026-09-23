/**
 * `layout.legend` attributes and defaults (plan E5.2), following Plotly's legend model.
 *
 * Trace-level legend attributes (`legendrank`, `legendgrouptitle`, `legendwidth`) live in core's
 * common trace schema. Multiple legends (`legend: 'legend2'`) are not supported yet.
 */
import {
  attr,
  fontSchema,
  type FullLayout,
  type LayoutDefaultsContext,
} from '@mk7s/holochart-core';
import { inheritFont, type FullFont } from '../shared/text.ts';

const LEGEND_EDIT = ['legend', 'layout'] as const;

/** The `layout.legend` container. */
export const legendAttributes = attr.object(
  {
    visible: attr.boolean({ dflt: true, description: 'Draw the legend (with `showlegend`).' }),
    bgcolor: attr.color({ description: 'Background color. Defaults to `paper_bgcolor`.' }),
    bordercolor: attr.color({ dflt: '#444', description: 'Border color.' }),
    borderwidth: attr.number({ min: 0, dflt: 0, description: 'Border width in px.' }),
    font: fontSchema('Item font. Defaults to `layout.font`.'),
    grouptitlefont: fontSchema('Group title font. Defaults to the legend font.'),
    orientation: attr.enumerated({
      values: ['v', 'h'],
      dflt: 'v',
      description: 'Stack items vertically (`v`) or in rows (`h`).',
    }),
    traceorder: attr.flaglist({
      flags: ['reversed', 'grouped'],
      extras: ['normal'],
      description:
        'Item order: trace order (`normal`), reversed, grouped by `legendgroup`, or both. Defaults to `grouped` when any trace has a `legendgroup`, else `normal`.',
    }),
    tracegroupgap: attr.number({
      min: 0,
      dflt: 10,
      description: 'Gap between legend groups in px (grouped order).',
    }),
    entrywidth: attr.number({
      min: 0,
      description: 'Width of each item (`h` orientation): px or a fraction of the plot width.',
    }),
    entrywidthmode: attr.enumerated({
      values: ['fraction', 'pixels'],
      dflt: 'pixels',
      description: 'Unit of `entrywidth`.',
    }),
    indentation: attr.number({ min: -15, dflt: 0, description: 'Indent of the items in px.' }),
    itemsizing: attr.enumerated({
      values: ['trace', 'constant'],
      dflt: 'trace',
      description: 'Glyph sizes follow the traces (capped) or are constant.',
    }),
    itemwidth: attr.number({ min: 30, dflt: 30, description: 'Width of the glyph area in px.' }),
    itemclick: attr.enumerated({
      values: ['toggle', 'toggleothers', false],
      dflt: 'toggle',
      description: 'What clicking an item does.',
    }),
    itemdoubleclick: attr.enumerated({
      values: ['toggle', 'toggleothers', false],
      dflt: 'toggleothers',
      description: 'What double-clicking an item does.',
    }),
    groupclick: attr.enumerated({
      values: ['toggleitem', 'togglegroup'],
      dflt: 'togglegroup',
      description: 'Whether clicks toggle the whole `legendgroup` or only the item.',
    }),
    x: attr.number({
      min: -2,
      max: 3,
      description: 'Horizontal position (`xref` fraction). Defaults to 1.02 (`v`) or 0 (`h`).',
    }),
    xanchor: attr.enumerated({
      values: ['auto', 'left', 'center', 'right'],
      dflt: 'left',
      description: 'Which side of the legend sits at `x`.',
    }),
    xref: attr.enumerated({
      values: ['container', 'paper'],
      dflt: 'paper',
      description: 'Reference of `x`.',
    }),
    y: attr.number({
      min: -2,
      max: 3,
      description: 'Vertical position (`yref` fraction). Defaults to 1 (`v`) or −0.1 (`h`).',
    }),
    yanchor: attr.enumerated({
      values: ['auto', 'top', 'middle', 'bottom'],
      description: 'Which side sits at `y`. Defaults to `auto` (`v`) or `top` (`h`).',
    }),
    yref: attr.enumerated({
      values: ['container', 'paper'],
      dflt: 'paper',
      description: 'Reference of `y`.',
    }),
    valign: attr.enumerated({
      values: ['top', 'middle', 'bottom'],
      dflt: 'middle',
      description: 'Vertical alignment of the text with its glyph (multi-line items).',
    }),
    maxheight: attr.number({
      min: 0,
      description:
        'Maximum height (px, or a fraction of the figure height when ≤ 1). Scrolling is not implemented yet: overflowing items are cut.',
    }),
    title: attr.object(
      {
        text: attr.string({ dflt: '', description: 'Legend title.' }),
        font: fontSchema('Title font. Defaults to the legend font.'),
        side: attr.enumerated({
          values: ['top', 'left', 'top left', 'top center', 'top right'],
          description: 'Where the title goes. Defaults to `top` (`v`) or `left` (`h`).',
        }),
      },
      { editType: LEGEND_EDIT, description: 'Legend title.' },
    ),
    uirevision: attr.any({ description: 'Keeps legend UI state across updates while unchanged.' }),
  },
  { editType: LEGEND_EDIT, description: 'The legend (E5.2).' },
);

/** The defaulted legend. */
export interface FullLegend {
  visible: boolean;
  bgcolor: string;
  bordercolor: string;
  borderwidth: number;
  font: FullFont;
  grouptitlefont: FullFont;
  orientation: 'v' | 'h';
  traceorder: string;
  tracegroupgap: number;
  entrywidth?: number;
  entrywidthmode: 'fraction' | 'pixels';
  indentation: number;
  itemsizing: 'trace' | 'constant';
  itemwidth: number;
  itemclick: 'toggle' | 'toggleothers' | false;
  itemdoubleclick: 'toggle' | 'toggleothers' | false;
  groupclick: 'toggleitem' | 'togglegroup';
  x: number;
  xanchor: 'auto' | 'left' | 'center' | 'right';
  xref: 'container' | 'paper';
  y: number;
  yanchor: 'auto' | 'top' | 'middle' | 'bottom';
  yref: 'container' | 'paper';
  valign: 'top' | 'middle' | 'bottom';
  maxheight?: number;
  title: { text: string; font: FullFont; side: string };
}

/**
 * Orientation-dependent and inherited legend defaults (Plotly's `legend/defaults.js`): position,
 * anchors, title side, fonts and background. Only fills values that are still unset, so feeding
 * the output back in gives the same result.
 */
export function supplyLegendDefaults(
  layoutOut: FullLayout,
  ctx: Pick<LayoutDefaultsContext, 'fullData'>,
): void {
  const legend = layoutOut['legend'] as Partial<FullLegend> | undefined;
  if (!legend) return;
  const h = legend.orientation === 'h';
  legend.x ??= h ? 0 : 1.02;
  legend.y ??= h ? -0.1 : 1;
  legend.yanchor ??= h ? 'top' : 'auto';
  legend.bgcolor ??= layoutOut.paper_bgcolor;
  const base = layoutOut.font as FullFont;
  legend.font = inheritFont(legend.font, base);
  legend.grouptitlefont = inheritFont(legend.grouptitlefont, legend.font);
  const title = (legend.title ??= { text: '', font: legend.font, side: h ? 'left' : 'top' });
  title.font = inheritFont(title.font, legend.font);
  title.side ??= h ? 'left' : 'top';
  if (legend.traceorder === undefined) {
    const grouped = ctx.fullData.some(
      (t) => typeof t['legendgroup'] === 'string' && t['legendgroup'] !== '',
    );
    legend.traceorder = grouped ? 'grouped' : 'normal';
  }
}
