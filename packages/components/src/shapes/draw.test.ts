import { createScale, type AxisType, type FullAxis } from '@mk7s/holochart-core';
import type { SubplotInfo } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { defaults, testRegistry } from '../__testing__/fixtures.ts';
import type { FullFont } from '../shared/text.ts';
import {
  activeshapeOf,
  contrastColor,
  drawnOutline,
  eraseActiveShape,
  newshapeOf,
  outlineShape,
  previewShape,
  setShapeEraser,
  type FullNewShape,
} from './draw.ts';
import { shapeGeometry, type ShapeAxis, type ShapeEnv } from './geometry.ts';
import { shapesComponent, shapesOf } from './shapes.ts';

const AREA = { x: 100, y: 50, width: 400, height: 200 };
const registry = testRegistry([shapesComponent]);

function axis(id: string, range: [number, number], type: AxisType = 'linear'): ShapeAxis {
  const letter = id.startsWith('x') ? 'x' : 'y';
  const length = letter === 'x' ? AREA.width : AREA.height;
  const start = letter === 'x' ? AREA.x : AREA.y + AREA.height;
  return {
    id,
    letter,
    type,
    scale: createScale({ type, range, length }),
    full: { domain: [0, 1] } as unknown as FullAxis,
    start,
    end: letter === 'x' ? start + length : start - length,
  };
}

function env(x: ShapeAxis = axis('x', [0, 10]), y: ShapeAxis = axis('y', [0, 100])): ShapeEnv {
  return { plotArea: AREA, axes: new Map([x, y].map((a) => [a.id, a])) };
}

const SUBPLOT = {
  id: 'xy',
  rect: AREA,
  xaxis: { id: 'x' },
  yaxis: { id: 'y' },
} as unknown as SubplotInfo;

/** Container px of data (x, y) on the default axes. */
const px = (x: number, y: number): [number, number] => [100 + 40 * x, 250 - 2 * y];

function layout(input: Record<string, unknown> = {}) {
  return defaults({ font: { family: 'Inter', size: 10, color: '#123456' }, ...input }, [], registry)
    .fullLayout as Record<string, unknown>;
}

describe('newshape / activeshape defaults (plotly.js draw_newshape/defaults.js)', () => {
  it("defaults like Plotly's, with the line contrasting with plot_bgcolor", () => {
    const ns = newshapeOf(layout());
    expect(ns).toMatchObject({
      visible: true,
      line: { color: 'rgb(68, 68, 68)', width: 4, dash: 'solid' },
      fillcolor: 'rgba(0, 0, 0, 0)',
      fillrule: 'evenodd',
      opacity: 1,
      layer: 'above',
      drawdirection: 'diagonal',
    });
    expect(ns.label.font.family).toBe('Inter');
    expect(ns.label.textposition).toBe('middle center');
    expect(newshapeOf(layout({ plot_bgcolor: '#111' })).line.color).toBe('rgb(255, 255, 255)');
    expect(newshapeOf(layout({ dragmode: 'drawline' })).label.textposition).toBe('middle');
    expect(newshapeOf(layout({ newshape: { line: { color: 'red' } } })).line.color).toBe(
      'rgb(255, 0, 0)',
    );
    expect(activeshapeOf(layout())).toEqual({ fillcolor: 'rgb(255, 0, 255)', opacity: 0.5 });
  });

  it('accepts the draw dragmodes', () => {
    for (const mode of ['drawline', 'drawopenpath', 'drawclosedpath', 'drawcircle', 'drawrect']) {
      expect(layout({ dragmode: mode })['dragmode']).toBe(mode);
    }
  });

  it('contrastColor follows Color.contrast', () => {
    const [light, dark] = ['rgb(255, 255, 255)', 'rgb(68, 68, 68)'];
    expect(contrastColor('white')).toBe(dark);
    expect(contrastColor('#1f1f1f')).toBe(light);
    expect(contrastColor('rgba(0,0,0,0.1)')).toBe(dark);
    expect(contrastColor(undefined)).toBe(dark);
  });
});

describe('drawnOutline (plotly.js select.js draw modes)', () => {
  const pts = (...p: [number, number][]): number[] => p.flat();
  const outline = (
    mode: Parameters<typeof drawnOutline>[0],
    points: number[],
    dir: FullNewShape['drawdirection'] = 'diagonal',
  ) => drawnOutline(mode, points, AREA, dir);

  it('rectangles: free, or spanning the plot height / width', () => {
    const p = pts([150, 100], [300, 200]);
    expect(outline('drawrect', p)).toEqual({ type: 'rect', box: [150, 100, 300, 200] });
    expect(outline('drawrect', p, 'ortho')).toEqual({ type: 'rect', box: [150, 100, 300, 200] });
    expect(outline('drawrect', p, 'vertical')).toEqual({ type: 'rect', box: [150, 50, 300, 250] });
    expect(outline('drawrect', p, 'horizontal')).toEqual({
      type: 'rect',
      box: [100, 100, 500, 200],
    });
    expect(outline('drawrect', pts([150, 100], [150, 100]))).toBeUndefined();
  });

  it('lines: free, snapped by ortho, or spanning the plot at the pointer', () => {
    const p = pts([150, 100], [300, 120]);
    expect(outline('drawline', p)).toEqual({ type: 'line', box: [150, 100, 300, 120] });
    // Mostly horizontal: horizontal through the pointer.
    expect(outline('drawline', p, 'ortho')).toEqual({ type: 'line', box: [150, 120, 300, 120] });
    expect(outline('drawline', pts([150, 100], [160, 200]), 'ortho')).toEqual({
      type: 'line',
      box: [160, 100, 160, 200],
    });
    expect(outline('drawline', p, 'vertical')).toEqual({ type: 'line', box: [300, 50, 300, 250] });
    expect(outline('drawline', p, 'horizontal')).toEqual({
      type: 'line',
      box: [100, 120, 500, 120],
    });
  });

  it('circles: centred on the start, through the pointer', () => {
    const o = outline('drawcircle', pts([200, 150], [230, 170]));
    expect(o?.type).toBe('circle');
    const box = (o as { box: readonly number[] }).box;
    const r = [30 * Math.SQRT2, 20 * Math.SQRT2];
    expect(box[0]).toBeCloseTo(200 - r[0]!);
    expect(box[2]).toBeCloseTo(200 + r[0]!);
    expect(box[1]).toBeCloseTo(150 + r[1]!);
    expect(box[3]).toBeCloseTo(150 - r[1]!);
    // Along one axis only: a circle of that radius.
    const flat = outline('drawcircle', pts([200, 150], [230, 150])) as { box: readonly number[] };
    expect(flat.box).toEqual([170, 180, 230, 120]);
  });

  it('freeform paths keep their vertices', () => {
    const p = pts([150, 100], [200, 110], [210, 180]);
    expect(outline('drawopenpath', p)).toEqual({
      type: 'path',
      x: [150, 200, 210],
      y: [100, 110, 180],
      closed: false,
    });
    expect(outline('drawclosedpath', p)).toMatchObject({ closed: true });
    expect(outline('drawopenpath', pts([150, 100]))).toBeUndefined();
  });
});

describe('outlineShape (plotly.js newshapes.js)', () => {
  const style = newshapeOf(
    layout({ newshape: { line: { color: 'red', width: 2 }, fillcolor: 'blue', opacity: 0.8 } }),
  );

  it('writes the subplot data coordinates and the newshape style', () => {
    const [x0, y0] = px(1, 20);
    const [x1, y1] = px(4, 70);
    const shape = outlineShape({ type: 'rect', box: [x0, y0, x1, y1] }, SUBPLOT, env(), style);
    expect(shape).toEqual({
      editable: true,
      type: 'rect',
      x0: 1,
      y0: 20,
      x1: 4,
      y1: 70,
      visible: true,
      showlegend: false,
      legendgroup: '',
      xref: 'x',
      yref: 'y',
      layer: 'above',
      opacity: 0.8,
      line: { color: 'rgb(255, 0, 0)', width: 2, dash: 'solid' },
      fillcolor: 'rgb(0, 0, 255)',
      fillrule: 'evenodd',
    });
  });

  it('writes paths (closed with Z), without a fill when open; dates use `_`', () => {
    const outline = {
      type: 'path' as const,
      x: [px(1, 10)[0], px(2, 30)[0], px(3, 10)[0]],
      y: [px(1, 10)[1], px(2, 30)[1], px(3, 10)[1]],
      closed: true,
    };
    expect(outlineShape(outline, SUBPLOT, env(), style)?.['path']).toBe('M1,10L2,30L3,10Z');
    const open = outlineShape({ ...outline, closed: false }, SUBPLOT, env(), style);
    expect(open?.['path']).toBe('M1,10L2,30L3,10');
    expect(open).not.toHaveProperty('fillcolor');
    const day = 864e5;
    const dates = env(axis('x', [0, 10 * day], 'date'));
    const d = outlineShape(outline, SUBPLOT, dates, style)?.['path'] as string;
    expect(d.startsWith('M1970-01-02,10L1970-01-03,30')).toBe(true);
    const noon = outlineShape(
      { type: 'path', x: [100 + 40 * 1.5, 200], y: [200, 150], closed: false },
      SUBPLOT,
      dates,
      style,
    )?.['path'] as string;
    expect(noon.startsWith('M1970-01-02_12:00,25')).toBe(true);
  });

  it('adds the label only with text; the preview shows at half opacity', () => {
    const labelled = newshapeOf(layout({ newshape: { label: { text: 'zone' } } }));
    const shape = outlineShape(
      { type: 'line', box: [...px(1, 10), ...px(2, 20)] },
      SUBPLOT,
      env(),
      labelled,
    );
    expect(shape?.['label']).toMatchObject({ text: 'zone', textposition: 'middle center' });
    expect(shape).not.toHaveProperty('fillcolor', undefined);
    const plain = outlineShape(
      { type: 'line', box: [...px(1, 10), ...px(2, 20)] },
      SUBPLOT,
      env(),
      style,
    );
    expect(plain).not.toHaveProperty('label');
    const preview = previewShape(plain!, style, {
      family: 'Inter',
      size: 10,
      color: '#000',
    } as FullFont);
    expect(preview).toMatchObject({ _index: -1, type: 'line', opacity: 0.4, editable: false });
    expect(preview.label.textposition).toBe('middle');
    expect(shapeGeometry(preview, env())?.ends).toEqual([1, 10, 2, 20]);
  });

  it('log axes store data values', () => {
    const logEnv = env(axis('x', [0, 10]), axis('y', [0, 2], 'log'));
    const shape = outlineShape({ type: 'rect', box: [140, 150, 180, 50] }, SUBPLOT, logEnv, style);
    expect(shape?.['y0']).toBeCloseTo(10);
    expect(shape?.['y1']).toBeCloseTo(100);
  });
});

describe('axis type changes (plotly.js: shapes need no convertCoords)', () => {
  it('shapes on log axes are data values, so switching linear ↔ log keeps them in place', () => {
    const { fullLayout } = defaults(
      { shapes: [{ type: 'line', x0: 1, x1: 2, y0: 10, y1: 100 }] },
      [],
      registry,
    );
    const s = shapesOf(fullLayout)[0]!;
    const lin = shapeGeometry(s, env(axis('x', [0, 10]), axis('y', [0, 200])))!;
    const log = shapeGeometry(s, env(axis('x', [0, 10]), axis('y', [0, 3], 'log')))!;
    const yPx = (g: typeof lin, i: 1 | 3) => g.y.toPx(g.ends![i]);
    // y 10 and 100 at the same data values on both axis types.
    expect(yPx(lin, 1)).toBeCloseTo(250 - (10 / 200) * 200);
    expect(yPx(log, 1)).toBeCloseTo(250 - (1 / 3) * 200);
    expect(yPx(log, 3)).toBeCloseTo(250 - (2 / 3) * 200);
  });
});

describe('eraseActiveShape', () => {
  it('calls the eraser registered for the chart', () => {
    const chart = {};
    expect(eraseActiveShape(chart)).toBe(false);
    let erased = 0;
    setShapeEraser(chart, () => ++erased > 0);
    expect(eraseActiveShape(chart)).toBe(true);
    setShapeEraser(chart, undefined);
    expect(eraseActiveShape(chart)).toBe(false);
    expect(erased).toBe(1);
  });
});
