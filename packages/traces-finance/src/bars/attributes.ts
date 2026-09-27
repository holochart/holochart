/**
 * Attributes shared by the bar-like financial traces, `waterfall` (E12.4) and `funnel` (E12.5):
 * plotly.js builds both from bar's attributes (`waterfall/attributes.js`, `funnel/attributes.js`),
 * so they are taken from `bar`'s schema here too — coordinates with period alignment, labels
 * (`text`, `textposition`, fonts, `textangle`, `constraintext`), bar extent and grouping
 * (`width`, `offset`, `offsetgroup`, `alignmentgroup`) and `zorder` — plus the connector line and
 * the layout attributes each type owns (`<type>mode`, `<type>gap`, `<type>groupgap`).
 */
import { attr } from '@mk7s/holochart-core';
import { barAttributes } from '@mk7s/holochart-traces-basic';

/** Bar's coordinate, label, extent and grouping attributes (called inside a schema IIFE). */
export function barLikeAttributes() {
  const B = barAttributes.children;
  return {
    x: B.x,
    x0: B.x0,
    dx: B.dx,
    xperiod: B.xperiod,
    xperiod0: B.xperiod0,
    xperiodalignment: B.xperiodalignment,
    y: B.y,
    y0: B.y0,
    dy: B.dy,
    yperiod: B.yperiod,
    yperiod0: B.yperiod0,
    yperiodalignment: B.yperiodalignment,
    text: B.text,
    textposition: B.textposition,
    insidetextanchor: B.insidetextanchor,
    textangle: B.textangle,
    textfont: B.textfont,
    insidetextfont: B.insidetextfont,
    outsidetextfont: B.outsidetextfont,
    constraintext: B.constraintext,
    cliponaxis: B.cliponaxis,
    offset: B.offset,
    width: B.width,
    offsetgroup: B.offsetgroup,
    alignmentgroup: B.alignmentgroup,
    zorder: B.zorder,
  } as const;
}

/** A flaglist of `hoverinfo` with a trace type's own flags after Plotly's cartesian ones. */
export function hoverinfoAttribute<const F extends readonly string[]>(flags: F, what: string) {
  return attr.flaglist({
    flags: ['name', 'x', 'y', 'text', ...flags],
    extras: ['all', 'none', 'skip'],
    arrayOk: true,
    editType: 'none',
    description: `Which fields hover labels show: the position and value (\`x\`, \`y\`), \`text\`, ${what} and the trace \`name\`; \`'skip'\` also turns hover events off for this trace. Default \`'all'\`.`,
  });
}

/** The connector line's `color`, `width` and `dash` (Plotly's scatter line attributes). */
export function connectorLine(dfltWidth: number, what: string) {
  return attr.object(
    {
      color: attr.color({
        dflt: '#444',
        editType: 'style',
        description: `Color of the ${what}.`,
      }),
      width: attr.number({
        min: 0,
        dflt: dfltWidth,
        editType: 'plot',
        description: `Width in CSS px of the ${what}${dfltWidth === 0 ? ' (0: not drawn)' : ''}.`,
      }),
      dash: attr.string({
        dflt: 'solid',
        editType: 'style',
        description:
          "Dash style: `'solid'`, `'dot'`, `'dash'`, `'longdash'`, `'dashdot'`, `'longdashdot'`, or a dash list such as `'5px,10px,2px'`.",
      }),
    },
    { editType: 'plot', description: `The ${what}.` },
  );
}

/** Layout attributes of a bar-like type: `<type>mode`, `<type>gap`, `<type>groupgap`. */
export function barLikeLayoutAttributes<const M extends readonly string[]>(
  type: 'waterfall' | 'funnel',
  modes: M,
  dflt: M[number],
) {
  const stack = modes.includes('stack') ? ', stacked on top of one another (`stack`),' : '';
  return {
    mode: attr.enumerated({
      values: modes,
      dflt,
      editType: 'calc',
      description: `How ${type} bars at the same position combine: side by side (\`group\`)${stack} or drawn over each other (\`overlay\`; lower the \`opacity\` to see them all). Traces of other types never share their slots.`,
    }),
    gap: attr.number({
      min: 0,
      max: 1,
      dflt: 0.2,
      editType: 'calc',
      description: `Gap between ${type} bars at neighboring positions, as a fraction of the position slot.`,
    }),
    groupgap: attr.number({
      min: 0,
      max: 1,
      dflt: 0,
      editType: 'calc',
      description: `Gap between ${type} bars of the same position, as a fraction of each bar’s share.`,
    }),
  } as const;
}
