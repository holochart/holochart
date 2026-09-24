import { createScale, type AxisType, type FullAxis } from '@mk7s/holochart-core';
import type { Chart } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { defaults, testRegistry } from '../__testing__/fixtures.ts';
import { classTransform } from '../shared/layers.ts';
import {
  labelPosition,
  quantizeScale,
  shapeDim,
  shapeExtremes,
  shapeGeometry,
  type ShapeAxis,
  type ShapeEnv,
  type ShapeGeometry,
} from './geometry.ts';
import { addHline, addHrect, addVline, addVrect } from './helpers.ts';
import {
  accumulateShape,
  closedPolyline,
  dragOverride,
  hitShape,
  movePath,
  shapesComponent,
  shapesOf,
  shapeStack,
} from './shapes.ts';
import type { FullShape } from './schema.ts';

const AREA = { x: 100, y: 50, width: 400, height: 200 };

function axis(
  id: string,
  range: [number, number],
  opts: { domain?: [number, number]; type?: AxisType; categories?: string[] } = {},
): ShapeAxis {
  const letter = id.startsWith('x') ? 'x' : 'y';
  const domain = opts.domain ?? [0, 1];
  const length = letter === 'x' ? AREA.width * (domain[1] - domain[0]) : AREA.height;
  const type = opts.type ?? 'linear';
  const scale = createScale({
    type,
    range,
    length,
    ...(opts.categories ? { categories: opts.categories } : {}),
  });
  const start =
    letter === 'x' ? AREA.x + domain[0] * AREA.width : AREA.y + (1 - domain[0]) * AREA.height;
  return {
    id,
    letter,
    type,
    scale,
    full: { domain } as unknown as FullAxis,
    start,
    end: letter === 'x' ? start + length : start - length,
  };
}

function env(axes: ShapeAxis[] = [axis('x', [0, 10]), axis('y', [0, 100])]): ShapeEnv {
  return { plotArea: AREA, axes: new Map(axes.map((a) => [a.id, a])) };
}

const registry = testRegistry([shapesComponent]);

function full(shape: Record<string, unknown>, layout: Record<string, unknown> = {}): FullShape {
  const { fullLayout } = defaults(
    { font: { family: 'Inter', size: 10, color: '#123456' }, shapes: [shape], ...layout },
    [],
    registry,
  );
  return shapesOf(fullLayout)[0] as FullShape;
}

function geom(shape: Record<string, unknown>, e: ShapeEnv = env()): ShapeGeometry {
  const g = shapeGeometry(full(shape), e);
  if (!g) throw new Error('no geometry');
  return g;
}

/** Container px of a geometry's rings. */
function px(g: ShapeGeometry): [number, number][][] {
  return g.rings.map((r) => r.x.map((u, i) => [g.x.toPx(u), g.y.toPx(r.y[i] as number)]));
}

describe('defaults', () => {
  it('fills type, label defaults and pixel positions', () => {
    const s = full({ x0: 1, x1: 2, y0: 3, y1: 4, label: { text: 'a' } });
    expect(s.type).toBe('rect');
    expect(s.layer).toBe('above');
    expect(s.xref).toBe('x');
    expect(s.line).toEqual({ color: 'rgb(68, 68, 68)', width: 2, dash: 'solid' });
    expect(s.label.textposition).toBe('middle center');
    expect(s.label.yanchor).toBe('middle');
    expect(s.label.font.family).toBe('Inter');
    expect(s.fillrule).toBe('evenodd');
    expect(full({ path: 'M0 0L1 1' }).type).toBe('path');
    const line = full({ type: 'line', label: { text: 'l' } });
    expect(line.label.textposition).toBe('middle');
    expect(line.label.yanchor).toBe('bottom');
    expect(full({ label: { text: 'b', textposition: 'top left' } }).label.yanchor).toBe('top');
    const px = full({ xsizemode: 'pixel', ysizemode: 'pixel' });
    expect([px.x0, px.x1, px.y0, px.y1]).toEqual([0, 10, 0, 10]);
  });
});

describe('shapeDim', () => {
  it('maps data, paper and domain references to px', () => {
    const e = env([
      axis('x', [0, 10]),
      axis('y', [0, 100]),
      axis('x2', [0, 1], { domain: [0.5, 1] }),
    ]);
    const x = shapeDim('x', 'x', false, undefined, e);
    expect(x?.axis?.id).toBe('x');
    expect(x?.toPx(x.toClass(5))).toBe(300);
    expect(x?.fromPx(300)).toBe(5);
    const y = shapeDim('y', 'y', false, undefined, e);
    expect(y?.toPx(y.toClass(25))).toBe(200);
    const paper = shapeDim('paper', 'y', false, undefined, e);
    expect(paper?.axis).toBeUndefined();
    expect(paper?.paper).toBe(true);
    expect(paper?.toPx(paper.toClass(1))).toBe(50);
    expect(paper?.fromPx(250)).toBe(0);
    const dom = shapeDim('x2 domain', 'x', false, undefined, e);
    expect(dom?.axis).toBeUndefined();
    expect(dom?.owner?.id).toBe('x2');
    expect(dom?.clip).toBeUndefined();
    expect(dom?.toClass(0)).toBe(300);
    expect(dom?.toClass(1)).toBe(500);
    expect(dom?.fromPx(400)).toBe(0.5);
    expect(shapeDim('x3', 'x', false, undefined, e)).toBeUndefined();
    expect(shapeDim('y', 'x', false, undefined, e)).toBeUndefined();
    expect(shapeDim('bogus', 'x', false, undefined, e)).toBeUndefined();
  });

  it('uses data values on log axes and names or indices on category axes', () => {
    const e = env([
      axis('x', [0, 3], { type: 'log' }),
      axis('y', [-0.5, 2.5], { type: 'category', categories: ['a', 'b', 'c'] }),
    ]);
    const x = shapeDim('x', 'x', false, undefined, e);
    expect(x?.toClass(100)).toBeCloseTo(2);
    expect(x?.fromPx(x.toPx(2))).toBeCloseTo(100);
    const y = shapeDim('y', 'y', false, undefined, e);
    expect(y?.toClass('b')).toBe(1);
    expect(y?.toClass(1.5)).toBe(1.5);
  });

  it('pixel size mode offsets from the anchor (y up)', () => {
    const e = env();
    const x = shapeDim('x', 'x', true, 5, e);
    expect(x?.axis).toBeUndefined();
    expect(x?.clip?.id).toBe('x');
    expect(x?.toPx(x.toClass(10))).toBe(310);
    expect(x?.fromPx(310)).toBe(10);
    const y = shapeDim('paper', 'y', true, 0, e);
    expect(y?.toPx(y.toClass(20))).toBe(230);
    expect(y?.fromPx(230)).toBe(20);
  });
});

describe('shapeGeometry', () => {
  it('builds rects, lines and ellipses in class coordinates', () => {
    const r = geom({ type: 'rect', x0: 1, x1: 3, y0: 10, y1: 30 });
    expect(r.rings).toEqual([{ x: [1, 3, 3, 1], y: [10, 10, 30, 30], closed: true }]);
    expect(r.filled).toBe(false);
    const l = geom({ type: 'line', x0: 1, x1: 3, y0: 10, y1: 30 });
    expect(l.rings[0]?.closed).toBe(false);
    expect(l.ends).toEqual([1, 10, 3, 30]);
    const c = geom({ type: 'circle', x0: 0, x1: 4, y0: 0, y1: 40, fillcolor: 'red' });
    expect(c.filled).toBe(true);
    const pts = px(c)[0] ?? [];
    // An ellipse centered at (180, 210) px with radii 80 and 40 px.
    for (const [x, y] of pts)
      expect(((x - 180) / 80) ** 2 + ((y - 210) / 40) ** 2).toBeCloseTo(1, 6);
    expect(pts.length).toBeGreaterThanOrEqual(16);
  });

  it('defaults missing positions to 25% and 75% of the reference', () => {
    const g = geom({ type: 'rect', xref: 'paper' });
    expect(g.ends?.[0]).toBe(200);
    expect(g.ends?.[2]).toBe(400);
    expect(g.ends?.[1]).toBe(25);
    expect(g.ends?.[3]).toBe(75);
  });

  it('keeps data geometry across zoom (only the transform changes)', () => {
    const shape = { type: 'circle', x0: 1, x1: 3, y0: 10, y1: 30, xref: 'x', yref: 'y' };
    // Zooms within one power of two of px per unit keep the flattening.
    const a = geom(shape, env([axis('x', [0, 10]), axis('y', [0, 120])]));
    const zoomed = env([axis('x', [1, 8]), axis('y', [10, 110])]);
    const b = geom(shape, zoomed);
    expect(b.rings).toEqual(a.rings);
    // The composed transform maps class coordinates to the zoomed px.
    const t = classTransform(b.x.axis as never, b.y.axis as never, {
      scaleX: 1,
      offsetX: 0,
      scaleY: 1,
      offsetY: 0,
    });
    expect(3 * t.scaleX + t.offsetX).toBeCloseTo(b.x.toPx(3));
    expect(30 * t.scaleY + t.offsetY).toBeCloseTo(b.y.toPx(30));
    // Zooming in 8× re-flattens the circle more finely.
    const deep = geom(shape, env([axis('x', [1.5, 2.1]), axis('y', [15, 21])]));
    expect(deep.rings[0]!.x.length).toBeGreaterThan(a.rings[0]!.x.length);
  });

  it('parses paths once and maps their coordinates', () => {
    const g = geom({ type: 'path', path: 'M 1 10 L 3 10 L 2 30 Z', fillcolor: 'blue' });
    expect(g.rings).toEqual([{ x: [1, 3, 2], y: [10, 10, 30], closed: true }]);
    expect(g.fillRule).toBe('evenodd');
    expect(geom({ type: 'path', path: 'M0 0 H 2 V 2 Z', fillrule: 'nonzero' }).fillRule).toBe(
      'nonzero',
    );
    expect(shapeGeometry(full({ type: 'path', path: '' }), env())).toBeUndefined();
    expect(shapeGeometry(full({ type: 'path', path: 'X' }), env())).toBeUndefined();
  });

  it('skips hidden shapes and missing axes', () => {
    expect(shapeGeometry(full({ visible: false, x0: 1, x1: 2 }), env())).toBeUndefined();
    expect(shapeGeometry(full({ visible: 'legendonly', x0: 1 }), env())).toBeUndefined();
    expect(shapeGeometry(full({ xref: 'x5', x0: 1 }), env())).toBeUndefined();
  });

  it('applies opacity to fill and line colors', () => {
    const g = geom({ x0: 1, x1: 2, y0: 1, y1: 2, fillcolor: 'red', opacity: 0.5 });
    expect(g.fillColor).toEqual([1, 0, 0, 0.5]);
    expect(g.lineColor[3]).toBe(0.5);
  });

  it('labels lines along the line and formats texttemplates', () => {
    const g = geom({
      type: 'line',
      x0: 0,
      x1: 10,
      y0: 0,
      y1: 100,
      label: { texttemplate: 'dx=%{dx} slope=%{slope:.1f}' },
    });
    expect(g.label?.text).toBe('dx=10 slope=10.0');
    // Screen angle of the line: up and to the right.
    expect(g.label?.angle).toBeCloseTo((Math.atan2(-200, 400) * 180) / Math.PI);
    expect(g.label?.anchorY).toBe('bottom');
    expect(g.label?.color).toEqual([0x12 / 255, 0x34 / 255, 0x56 / 255, 1]);
  });
});

describe('labelPosition', () => {
  const box = [100, 50, 300, 150] as const;
  const l = {
    textposition: 'top left',
    textangle: 'auto',
    xanchor: 'auto',
    yanchor: 'top',
    padding: 3,
  } as const;
  it('places box labels inside with padding', () => {
    expect(labelPosition('rect', box, l)).toEqual({ x: 106, y: 53, anchorX: 'left', angle: 0 });
    expect(
      labelPosition('rect', box, { ...l, textposition: 'bottom right', yanchor: 'bottom' }),
    ).toEqual({ x: 294, y: 147, anchorX: 'right', angle: 0 });
    expect(
      labelPosition('rect', box, { ...l, textposition: 'middle center', yanchor: 'middle' }),
    ).toEqual({ x: 200, y: 100, anchorX: 'center', angle: 0 });
    expect(labelPosition('rect', box, { ...l, textangle: 30 }).angle).toBe(30);
  });

  it('places line labels at start, middle or end, padded perpendicular', () => {
    const h = [100, 100, 300, 100] as const;
    const mid = labelPosition('line', h, { ...l, textposition: 'middle', yanchor: 'bottom' });
    expect(mid).toEqual({ x: 200, y: 97, anchorX: 'center', angle: 0 });
    expect(
      labelPosition('line', h, { ...l, textposition: 'start', yanchor: 'bottom' }).anchorX,
    ).toBe('left');
    expect(labelPosition('line', h, { ...l, textposition: 'end', yanchor: 'bottom' }).anchorX).toBe(
      'right',
    );
    // A leftward line reads left to right too (never upside down).
    const back = labelPosition('line', [300, 100, 100, 100], {
      ...l,
      textposition: 'end',
      yanchor: 'bottom',
    });
    expect(back.angle).toBeCloseTo(0);
    expect(back.anchorX).toBe('left');
    // Vertical line going up: text reads bottom to top.
    expect(labelPosition('line', [100, 200, 100, 50], { ...l, textposition: 'middle' }).angle).toBe(
      -90,
    );
  });
});

describe('layer stack', () => {
  const data = { paper: false };
  const paper = { paper: true };
  it('follows Plotly: above → upper, paper refs below → lower', () => {
    expect(shapeStack({ layer: 'above' }, data, data)).toBe('upper');
    expect(shapeStack({ layer: 'above' }, paper, data)).toBe('upper');
    expect(shapeStack({ layer: 'below' }, data, data)).toBe('below');
    expect(shapeStack({ layer: 'between' }, data, data)).toBe('between');
    expect(shapeStack({ layer: 'below' }, data, paper)).toBe('lower');
    expect(shapeStack({ layer: 'between' }, paper, data)).toBe('lower');
  });
});

describe('batching', () => {
  it('closes rings mid-edge so the line ends meet on a straight segment', () => {
    expect(closedPolyline({ x: [0, 2, 2, 0], y: [0, 0, 2, 2] })).toEqual({
      x: [1, 2, 2, 0, 0, 1],
      y: [0, 0, 2, 2, 0, 0],
    });
  });

  it('accumulates fills per polygon and lines per ring', () => {
    const fill = { x: [], y: [], rings: [], polygons: [], color: [] };
    const line = { x: [], y: [], starts: [], color: [], width: [] };
    accumulateShape(geom({ x0: 1, x1: 2, y0: 1, y1: 2, fillcolor: 'red' }), fill, line);
    accumulateShape(geom({ type: 'line', x0: 1, x1: 2, y0: 1, y1: 2 }), fill, line);
    expect(fill.polygons).toEqual([0]);
    expect(fill.rings).toEqual([0]);
    expect(fill.color).toEqual([1, 0, 0, 1]);
    expect(line.x).toHaveLength(8);
    expect(line.starts).toEqual([6]);
    expect(line.width).toEqual(Array(8).fill(2));
  });
});

describe('editing', () => {
  it('hits line ends, box edges and insides, and paths', () => {
    const line = geom({ type: 'line', x0: 1, x1: 5, y0: 50, y1: 50 });
    expect(hitShape(line, 140, 150)).toBe('start');
    expect(hitShape(line, 300, 150)).toBe('end');
    expect(hitShape(line, 220, 152)).toBe('move');
    expect(hitShape(line, 220, 170)).toBeUndefined();
    const box = geom({ x0: 1, x1: 5, y0: 25, y1: 75 });
    expect(hitShape(box, 220, 150)).toBe('move');
    expect(hitShape(box, 300, 150)).toBe('resize-e');
    expect(hitShape(box, 140, 100)).toBe('resize-nw');
    expect(hitShape(box, 220, 201)).toBe('resize-s');
    expect(hitShape(box, 400, 150)).toBeUndefined();
    const tri = geom({ type: 'path', path: 'M 1 10 L 3 10 L 2 30 Z' });
    expect(hitShape(tri, 180, 225)).toBe('move');
    expect(hitShape(tri, 250, 150)).toBeUndefined();
  });

  it('turns drags into attribute values in reference units', () => {
    const e = env();
    const box = geom({ x0: 1, x1: 5, y0: 25, y1: 75 });
    const drag = (mode: string, dx: number, dy: number, g = box) =>
      dragOverride({ index: 0, mode: mode as 'move', base: g, x0: 0, y0: 0, dx, dy }, e);
    expect(drag('move', 40, -20)).toEqual({ x0: 2, x1: 6, y0: 35, y1: 85 });
    expect(drag('resize-e', 40, 0)).toEqual({ x1: 6 });
    expect(drag('resize-nw', -40, -20)).toEqual({ x0: 0, y1: 85 });
    const line = geom({ type: 'line', x0: 1, x1: 5, y0: 50, y1: 50 });
    expect(drag('end', 40, 40, line)).toEqual({ x1: 6, y1: 30 });
    const pixel = geom({
      xsizemode: 'pixel',
      ysizemode: 'pixel',
      xanchor: 2,
      yanchor: 50,
      x0: -5,
      x1: 5,
      y0: -5,
      y1: 5,
    });
    expect(drag('move', 40, 20, pixel)).toEqual({ xanchor: 3, yanchor: 40 });
    expect(drag('resize-e', 4, 0, geom({ ...pixelBox(), x1: 20 }))).toEqual({ x1: 24 });
  });

  it('moves paths, keeping dates as dates', () => {
    const e = env();
    const x = shapeDim('x', 'x', false, undefined, e)!;
    const y = shapeDim('y', 'y', false, undefined, e)!;
    expect(movePath('M 1 10 L 3 10 Z', x, y, 40, -20)).toBe('M2,20L4,20Z');
    const date = env([axis('x', [0, 864e5 * 10], { type: 'date' }), axis('y', [0, 100])]);
    const dx = shapeDim('x', 'x', false, undefined, date)!;
    const dy = shapeDim('y', 'y', false, undefined, date)!;
    expect(movePath('M 1970-01-02 10 L 1970-01-03_12:00 10', dx, dy, 40, 0)).toBe(
      'M1970-01-03,10L1970-01-04_12:00,10',
    );
  });
});

function pixelBox(): Record<string, unknown> {
  return { xsizemode: 'pixel', xanchor: 2, x0: 0, x1: 20, y0: 25, y1: 75 };
}

describe('helpers', () => {
  function fakeChart(shapes?: unknown[]) {
    const calls: Record<string, unknown>[] = [];
    const chart = {
      layout: shapes ? { shapes } : {},
      relayout: (u: Record<string, unknown>) => {
        calls.push(u);
        return Promise.resolve(chart);
      },
    };
    return { chart: chart as unknown as Chart, calls };
  }

  it('append spanning lines and bands with domain references', async () => {
    const { chart, calls } = fakeChart([{}]);
    await addHline(chart, 5, { line: { color: 'red' } });
    await addVline(chart, '2024-01-01', { yref: 'y2' });
    await addHrect(chart, 1, 2, { xref: 'x2', fillcolor: 'blue' });
    await addVrect(chart, 3, 4);
    expect(calls[0]).toEqual({
      'shapes[1]': {
        type: 'line',
        line: { color: 'red' },
        xref: 'x domain',
        x0: 0,
        x1: 1,
        yref: 'y',
        y0: 5,
        y1: 5,
      },
    });
    expect(calls[1]?.['shapes[1]']).toMatchObject({
      xref: 'x',
      x0: '2024-01-01',
      yref: 'y2 domain',
    });
    expect(calls[2]?.['shapes[1]']).toMatchObject({
      type: 'rect',
      xref: 'x2 domain',
      y0: 1,
      y1: 2,
    });
    expect(calls[3]?.['shapes[1]']).toMatchObject({ yref: 'y domain', x0: 3, x1: 4, y0: 0, y1: 1 });
    const empty = fakeChart();
    await addHline(empty.chart, 1);
    expect(Object.keys(empty.calls[0] ?? {})).toEqual(['shapes[0]']);
  });
});

describe('quantizeScale', () => {
  it('rounds up to powers of two', () => {
    expect(quantizeScale(3)).toBe(4);
    expect(quantizeScale(4)).toBe(4);
    expect(quantizeScale(0.3)).toBe(0.5);
    expect(quantizeScale(0)).toBe(1);
    expect(quantizeScale(Number.NaN)).toBe(1);
  });
});

describe('shapeExtremes (Plotly shapes/calc_autorange.js)', () => {
  const axes = env().axes;
  const ends = (e: {
    min: { l: number; padPx: number }[];
    max: { l: number; padPx: number }[];
  }) => ({
    lo: Math.min(...e.min.map((p) => p.l)),
    hi: Math.max(...e.max.map((p) => p.l)),
  });

  it('adds data-referenced positions, padded by half the line width', () => {
    const s = full({
      type: 'line',
      xref: 'x',
      yref: 'y',
      x0: 2,
      x1: 12,
      y0: 150,
      y1: 150,
      line: { width: 4 },
    });
    const e = shapeExtremes([s], axes, 1)!;
    expect(ends(e['x']!)).toEqual({ lo: 2, hi: 12 });
    expect(ends(e['y']!)).toEqual({ lo: 150, hi: 150 });
    expect(e['y']!.max[0]!.padPx).toBe(2);
  });

  it('ignores paper and domain references, hidden shapes, and figures without traces', () => {
    const paper = full({ type: 'rect', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 5, y1: 500 });
    expect(shapeExtremes([paper], axes, 1)).toEqual({ y: expect.anything() as unknown });
    const domain = full({
      type: 'rect',
      xref: 'x domain',
      yref: 'y domain',
      x0: 0,
      x1: 1,
      y0: 0,
      y1: 1,
    });
    expect(shapeExtremes([domain], axes, 1)).toBeUndefined();
    const hidden = full({
      type: 'line',
      xref: 'x',
      yref: 'y',
      x0: 0,
      x1: 1,
      y0: 0,
      y1: 900,
      visible: false,
    });
    expect(shapeExtremes([hidden], axes, 1)).toBeUndefined();
    const line = full({ type: 'line', xref: 'x', yref: 'y', x0: 0, x1: 1, y0: 0, y1: 900 });
    expect(shapeExtremes([line], axes, 0)).toBeUndefined();
  });

  it('uses every path coordinate, control points included', () => {
    const s = full({ type: 'path', xref: 'x', yref: 'y', path: 'M 1 10 Q 5 300 9 10 Z' });
    const e = shapeExtremes([s], axes, 1)!;
    expect(ends(e['x']!)).toEqual({ lo: 1, hi: 9 });
    expect(ends(e['y']!)).toEqual({ lo: 10, hi: 300 });
  });

  it('adds the anchor of pixel-sized dimensions, padded by their px extent', () => {
    const s = full({
      type: 'rect',
      xref: 'x',
      yref: 'y',
      ysizemode: 'pixel',
      yanchor: 40,
      y0: -5,
      y1: 20,
      x0: 1,
      x1: 2,
      line: { width: 2 },
    });
    const y = shapeExtremes([s], axes, 1)!['y']!;
    expect(y.min).toEqual([{ l: 40, padPx: 6 }]);
    expect(y.max).toEqual([{ l: 40, padPx: 21 }]);
  });
});
