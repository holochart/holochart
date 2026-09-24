/**
 * Drawing new shapes (plan E5.5): the draw `dragmode`s (`drawline`, `drawopenpath`,
 * `drawclosedpath`, `drawcircle`, `drawrect`), styled by `layout.newshape`, and the active shape
 * that the `eraseshape` modebar button removes (`layout.activeshape`), after plotly.js
 * `components/shapes/draw_newshape` and `components/selections/select.js`.
 *
 * The runtime tracks the pointer and hands the gesture to the shapes view
 * (`ComponentView.drawShape`); this module turns a gesture into an outline (honouring
 * `newshape.drawdirection` the way Plotly does) and the outline into a `layout.shapes` item in the
 * subplot's data coordinates.
 */
import { attr, fontSchema, isPlainObject, toRGBA, type FullLayout } from '@mk7s/holochart-core';
import type { DrawGesture, SubplotInfo } from '@mk7s/holochart-runtime';
import { inheritFont, type FullFont } from '../shared/text.ts';
import { shapeDim, type ShapeEnv } from './geometry.ts';
import { shapeItemAttributes, supplyShapeDefaults, type FullShape } from './schema.ts';

// ---- Attributes ---------------------------------------------------------------------------------

/** `layout.newshape`: how drawn shapes look (Plotly's `newshape`, the attributes shapes have). */
export const newshapeAttributes = attr.object(
  {
    visible: shapeItemAttributes.visible,
    showlegend: shapeItemAttributes.showlegend,
    legendgroup: shapeItemAttributes.legendgroup,
    line: attr.object(
      {
        color: attr.color({
          description:
            'Outline color. Default: a color contrasting with `plot_bgcolor` (`#444` on light, `#fff` on dark).',
        }),
        width: attr.number({ min: 0, dflt: 4, description: 'Outline width, px.' }),
        dash: attr.string({
          dflt: 'solid',
          description: 'Outline dash style (as `shapes[].line.dash`).',
        }),
      },
      { description: 'Outline of new shapes.' },
    ),
    fillcolor: attr.color({
      dflt: 'rgba(0,0,0,0)',
      description: 'Fill of new closed shapes (`drawopenpath` shapes are not filled).',
    }),
    fillrule: shapeItemAttributes.fillrule,
    opacity: attr.number({
      min: 0,
      max: 1,
      dflt: 1,
      description: 'Opacity of new shapes (the outline drawn while dragging shows at half of it).',
    }),
    layer: shapeItemAttributes.layer,
    drawdirection: attr.enumerated({
      values: ['ortho', 'horizontal', 'vertical', 'diagonal'],
      dflt: 'diagonal',
      description:
        'Constrains `drawline`, `drawrect` and `drawcircle` drags (as in Plotly): `diagonal` is free; `ortho` makes lines horizontal or vertical; `vertical` spans the plot height (rectangles; lines are vertical at the pointer); `horizontal` spans the plot width.',
    }),
    label: attr.object(
      {
        text: attr.string({ dflt: '', description: 'Label text of new shapes.' }),
        texttemplate: attr.string({
          dflt: '',
          description: 'Label template of new shapes (as `shapes[].label.texttemplate`).',
        }),
        font: fontSchema('Label font. Defaults to `layout.font`.'),
        textposition: shapeItemAttributes.label.children.textposition,
        textangle: shapeItemAttributes.label.children.textangle,
        xanchor: shapeItemAttributes.label.children.xanchor,
        yanchor: shapeItemAttributes.label.children.yanchor,
        padding: shapeItemAttributes.label.children.padding,
      },
      { description: 'Label of new shapes.' },
    ),
  },
  {
    editType: 'none',
    description:
      'Style of shapes drawn with the draw `dragmode`s (`drawline`, `drawopenpath`, `drawclosedpath`, `drawcircle`, `drawrect`).',
  },
);

/** `layout.activeshape`: how the shape selected for erasing looks. */
export const activeshapeAttributes = attr.object(
  {
    fillcolor: attr.color({
      dflt: 'rgb(255,0,255)',
      description: 'Fill of the active shape (open paths stay unfilled).',
    }),
    opacity: attr.number({
      min: 0,
      max: 1,
      dflt: 0.5,
      description: 'Opacity of the active shape.',
    }),
  },
  {
    editType: 'plot',
    description:
      'The active shape: an `editable` shape clicked to select it (the `eraseshape` modebar button removes it).',
  },
);

/** A defaulted `layout.newshape`. */
export interface FullNewShape {
  visible: boolean | 'legendonly';
  showlegend: boolean;
  legendgroup: string;
  line: { color: string; width: number; dash: string };
  fillcolor: string;
  fillrule: 'evenodd' | 'nonzero';
  opacity: number;
  layer: FullShape['layer'];
  drawdirection: 'ortho' | 'horizontal' | 'vertical' | 'diagonal';
  label: Omit<FullShape['label'], 'textposition' | 'yanchor'> &
    Partial<Pick<FullShape['label'], 'textposition' | 'yanchor'>>;
}

const LIGHT = 'rgb(255, 255, 255)';
const DARK = 'rgb(68, 68, 68)';

/**
 * Plotly's `Color.contrast`: `#fff` on dark colors, `#444` on light ones (semi-transparent colors
 * over white), in canonical `rgb()` form like other defaulted colors.
 */
export function contrastColor(css: unknown): string {
  const c = typeof css === 'string' ? toRGBA(css) : null;
  if (!c) return DARK;
  const [r, g, b, a] = c;
  const over = (v: number): number => (v * a + (1 - a)) * 255;
  const brightness = (over(r) * 299 + over(g) * 587 + over(b) * 114) / 1000;
  return brightness < 128 ? LIGHT : DARK;
}

/**
 * Dependent `newshape` defaults (plotly.js `draw_newshape/defaults.js`): the line color contrasts
 * with `plot_bgcolor` (the defaulted one, so themes count; Plotly reads the input), the label
 * font inherits `layout.font` and its position depends on whether `dragmode` draws lines.
 * Idempotent.
 */
export function supplyNewshapeDefaults(layoutOut: FullLayout): void {
  const ns = layoutOut['newshape'];
  if (!isPlainObject(ns)) return;
  const line = isPlainObject(ns['line']) ? ns['line'] : (ns['line'] = {});
  line['color'] ??= contrastColor(layoutOut['plot_bgcolor'] ?? '#fff');
  const label = ns['label'];
  if (!isPlainObject(label)) return;
  label['font'] = inheritFont(label['font'] as Partial<FullFont>, layoutOut.font as FullFont);
  label['textposition'] ??= layoutOut.dragmode === 'drawline' ? 'middle' : 'middle center';
}

/** The defaulted `newshape`, or Plotly's defaults when the layout has none. */
export function newshapeOf(fullLayout: Record<string, unknown>): FullNewShape {
  const ns = fullLayout['newshape'];
  if (isPlainObject(ns) && isPlainObject(ns['line']) && isPlainObject(ns['label'])) {
    return ns as unknown as FullNewShape;
  }
  return {
    visible: true,
    showlegend: false,
    legendgroup: '',
    line: { color: contrastColor(fullLayout['plot_bgcolor'] ?? '#fff'), width: 4, dash: 'solid' },
    fillcolor: 'rgba(0,0,0,0)',
    fillrule: 'evenodd',
    opacity: 1,
    layer: 'above',
    drawdirection: 'diagonal',
    label: {
      text: '',
      texttemplate: '',
      font: fullLayout['font'] as FullFont,
      textangle: 'auto',
      xanchor: 'auto',
      padding: 3,
    },
  };
}

/** `layout.activeshape` values. */
export function activeshapeOf(fullLayout: Record<string, unknown>): {
  fillcolor: string;
  opacity: number;
} {
  const a = fullLayout['activeshape'];
  const r = isPlainObject(a) ? a : {};
  return {
    fillcolor: typeof r['fillcolor'] === 'string' ? r['fillcolor'] : 'rgb(255,0,255)',
    opacity: typeof r['opacity'] === 'number' ? r['opacity'] : 0.5,
  };
}

// ---- Gesture → outline --------------------------------------------------------------------------

/** A drawn outline in container px (y down). Boxes are `[x0, y0, x1, y1]`. */
export type DrawnOutline =
  | {
      readonly type: 'line' | 'rect' | 'circle';
      readonly box: readonly [number, number, number, number];
    }
  | {
      readonly type: 'path';
      readonly x: readonly number[];
      readonly y: readonly number[];
      readonly closed: boolean;
    };

/**
 * The outline a draw gesture makes, as plotly.js `select.js` builds it for the draw modes, or
 * `undefined` when it has no extent yet:
 *
 * - `drawrect`: the box from the start to the pointer; `vertical` spans the plot height,
 *   `horizontal` its width.
 * - `drawline`: start to pointer; `ortho` snaps to the larger direction (the line runs through the
 *   pointer), `vertical` / `horizontal` span the plot at the pointer.
 * - `drawcircle`: an ellipse centred on the start and passing through the pointer (its box is √2
 *   times the drag), constrained like lines.
 * - the freeform modes: the sampled vertices (closed for `drawclosedpath`).
 */
export function drawnOutline(
  mode: DrawGesture['mode'],
  points: readonly number[],
  rect: SubplotInfo['rect'],
  direction: FullNewShape['drawdirection'],
): DrawnOutline | undefined {
  if (mode === 'drawopenpath' || mode === 'drawclosedpath') {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i + 1 < points.length; i += 2) {
      x.push(points[i] as number);
      y.push(points[i + 1] as number);
    }
    return x.length >= 2 ? { type: 'path', x, y, closed: mode === 'drawclosedpath' } : undefined;
  }
  const n = points.length;
  if (n < 4) return undefined;
  const [sx, sy] = [points[0] as number, points[1] as number];
  const [px, py] = [points[n - 2] as number, points[n - 1] as number];
  const [left, top] = [rect.x, rect.y];
  const [right, bottom] = [rect.x + rect.width, rect.y + rect.height];
  if (mode === 'drawrect') {
    const box: [number, number, number, number] =
      direction === 'vertical'
        ? [sx, top, px, bottom]
        : direction === 'horizontal'
          ? [left, sy, right, py]
          : [sx, sy, px, py];
    return box[0] === box[2] && box[1] === box[3] ? undefined : { type: 'rect', box };
  }
  const circle = mode === 'drawcircle';
  let a: [number, number];
  let b: [number, number];
  if (direction === 'vertical') {
    a = [px, circle ? (top + bottom) / 2 : top];
    b = [px, bottom];
  } else if (direction === 'horizontal') {
    a = [circle ? (left + right) / 2 : left, py];
    b = [right, py];
  } else if (direction === 'ortho') {
    const vertical = Math.abs(px - sx) < Math.abs(py - sy);
    a = vertical ? [px, sy] : [sx, py];
    b = [px, py];
  } else {
    a = [sx, sy];
    b = [px, py];
  }
  if (!circle) {
    return a[0] === b[0] && a[1] === b[1]
      ? undefined
      : { type: 'line', box: [a[0], a[1], b[0], b[1]] };
  }
  let rx = Math.abs(b[0] - a[0]) * Math.SQRT2;
  let ry = Math.abs(b[1] - a[1]) * Math.SQRT2;
  if (!rx) rx = ry = ry / Math.SQRT2;
  if (!ry) ry = rx = rx / Math.SQRT2;
  if (!rx) return undefined;
  return { type: 'circle', box: [a[0] - rx, a[1] + ry, a[0] + rx, a[1] - ry] };
}

// ---- Outline → shape ----------------------------------------------------------------------------

/** Path value → text: numbers as-is, dates with `_` between date and time (Plotly). */
function pathText(v: unknown): string {
  return typeof v === 'string' ? v.replace(' ', '_') : String(v);
}

/**
 * The `layout.shapes` item for an outline drawn on `subplot`, styled by `newshape` (plotly.js
 * `newshapes.js`): data coordinates of the subplot's axes, `editable: true`, no fill for open
 * paths, the label only when it has text. `undefined` when an axis can't place it.
 */
export function outlineShape(
  outline: DrawnOutline,
  subplot: SubplotInfo,
  env: ShapeEnv,
  style: FullNewShape,
): Record<string, unknown> | undefined {
  const xref = subplot.xaxis.id;
  const yref = subplot.yaxis.id;
  const x = shapeDim(xref, 'x', false, undefined, env);
  const y = shapeDim(yref, 'y', false, undefined, env);
  if (!x || !y) return undefined;
  const shape: Record<string, unknown> = { editable: true, type: outline.type };
  if (outline.type === 'path') {
    const parts = outline.x.map(
      (px, i) => `${pathText(x.fromPx(px))},${pathText(y.fromPx(outline.y[i] as number))}`,
    );
    shape['path'] = `M${parts.join('L')}${outline.closed ? 'Z' : ''}`;
  } else {
    const [x0, y0, x1, y1] = outline.box;
    shape['x0'] = x.fromPx(x0);
    shape['y0'] = y.fromPx(y0);
    shape['x1'] = x.fromPx(x1);
    shape['y1'] = y.fromPx(y1);
  }
  const open = outline.type === 'path' && !outline.closed;
  Object.assign(shape, {
    visible: style.visible,
    showlegend: style.showlegend,
    legendgroup: style.legendgroup,
    xref,
    yref,
    layer: style.layer,
    opacity: style.opacity,
    line: { color: style.line.color, width: style.line.width, dash: style.line.dash },
  });
  if (!open) {
    shape['fillcolor'] = style.fillcolor;
    shape['fillrule'] = style.fillrule;
  }
  const l = style.label;
  if (l.text !== '' || l.texttemplate !== '') {
    const label: Record<string, unknown> = {
      text: l.text,
      texttemplate: l.texttemplate,
      font: { ...l.font },
      textangle: l.textangle,
      xanchor: l.xanchor,
      padding: l.padding,
    };
    if (l.textposition !== undefined) label['textposition'] = l.textposition;
    if (l.yanchor !== undefined) label['yanchor'] = l.yanchor;
    shape['label'] = label;
  }
  return shape;
}

/**
 * The defaulted shape drawn while dragging: the new shape at half the `newshape` opacity (as
 * Plotly's outline), `_index: -1` (not part of `layout.shapes`, not editable).
 */
export function previewShape(
  shape: Record<string, unknown>,
  style: FullNewShape,
  font: FullFont,
): FullShape {
  const label = (shape['label'] as FullShape['label'] | undefined) ?? {
    text: '',
    texttemplate: '',
    font,
    textangle: 'auto',
    xanchor: 'auto',
    padding: 3,
  };
  const preview = {
    ...shape,
    _index: -1,
    xsizemode: 'scaled',
    ysizemode: 'scaled',
    opacity: style.opacity / 2,
    fillcolor: (shape['fillcolor'] as string | undefined) ?? 'rgba(0,0,0,0)',
    fillrule: style.fillrule,
    editable: false,
    visible: true,
    label: { ...label },
  } as unknown as FullShape;
  supplyShapeDefaults({ shapes: [preview], font } as unknown as FullLayout);
  return preview;
}

// ---- Active shape & erasing ---------------------------------------------------------------------

/** Erase hooks of the shapes views, by chart. */
const erasers = new WeakMap<object, () => boolean>();

/** Register (or with `undefined`, drop) the function erasing `chart`'s active shape. */
export function setShapeEraser(chart: object, erase: (() => boolean) | undefined): void {
  if (erase) erasers.set(chart, erase);
  else erasers.delete(chart);
}

/**
 * Remove the active shape of `chart` (the `eraseshape` modebar button; plotly.js
 * `eraseActiveShape`): one GUI `relayout` of `shapes` without it. Returns whether a shape was
 * active. Click an `editable` shape (drawn shapes are) to make it active.
 */
export function eraseActiveShape(chart: object): boolean {
  return erasers.get(chart)?.() ?? false;
}
