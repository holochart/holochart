import { createScale, type FullAxis } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { defaults, measure, testRegistry } from '../__testing__/fixtures.ts';
import { annotationBatches, annotationsComponent, annotationsOf } from './annotations.ts';
import {
  annotationGeometry,
  arrowGeometry,
  exitDistance,
  hitAnnotation,
  parseRef,
  pxToRef,
  refToPx,
  resolveAnchors,
  type AnnotationEnv,
  type AxisRef,
} from './layout.ts';
import type { FullAnnotation } from './schema.ts';

const AREA = { x: 100, y: 50, width: 400, height: 200 };

function axis(letter: 'x' | 'y', range: [number, number], domain: [number, number] = [0, 1]) {
  const scale = createScale({
    type: 'linear',
    range,
    length: letter === 'x' ? AREA.width * (domain[1] - domain[0]) : AREA.height,
  });
  const start =
    letter === 'x' ? AREA.x + domain[0] * AREA.width : AREA.y + (1 - domain[0]) * AREA.height;
  const ax: AxisRef = {
    letter,
    scale,
    full: { domain } as unknown as FullAxis,
    start,
    end: letter === 'x' ? start + scale.length : start - scale.length,
    l2c: (l) => (letter === 'x' ? start + scale.l2p(l) : start - scale.l2p(l)),
  };
  return ax;
}

const ENV: AnnotationEnv = {
  size: { width: 600, height: 300 },
  plotArea: AREA,
  axes: new Map([
    ['x', axis('x', [0, 10])],
    ['y', axis('y', [0, 100])],
    ['x2', axis('x', [0, 1], [0.5, 1])],
  ]),
  measure,
};

const registry = testRegistry([annotationsComponent]);

function full(ann: Record<string, unknown>, layout: Record<string, unknown> = {}): FullAnnotation {
  const { fullLayout } = defaults(
    { font: { family: 'Inter', size: 10, color: '#123456' }, annotations: [ann], ...layout },
    [],
    registry,
  );
  return annotationsOf(fullLayout)[0] as FullAnnotation;
}

describe('annotation defaults', () => {
  it('inherits the font and derives arrow color, width and pixel tails', () => {
    const a = full({ text: 'hi', x: 1, y: 2 });
    expect(a.font).toMatchObject({ family: 'Inter', size: 10 });
    expect(a).toMatchObject({ arrowcolor: '#444', arrowwidth: 2, ax: -10, ay: -30 });
    expect(a).toMatchObject({ xref: 'x', yref: 'y', showarrow: true, captureevents: false });
    const b = full({ text: 'b', bordercolor: 'red', borderwidth: 3, hovertext: 'tip' });
    expect(b.arrowwidth).toBe(6);
    expect(b.captureevents).toBe(true);
    expect(b.arrowcolor).toMatch(/255, 0, 0|red/);
  });
});

describe('references', () => {
  it('parses paper, pixel, axis and domain refs', () => {
    expect(parseRef('paper')).toEqual({ kind: 'paper' });
    expect(parseRef('x1')).toEqual({ kind: 'data', axis: 'x' });
    expect(parseRef('y2 domain')).toEqual({ kind: 'domain', axis: 'y2' });
    expect(parseRef('z')).toBeUndefined();
  });

  it('converts data, domain and paper positions to container px and back', () => {
    expect(refToPx('x', 5, 'x', ENV)).toBe(300);
    expect(refToPx('y', 25, 'y', ENV)).toBe(200);
    expect(refToPx('paper', 0, 'x', ENV)).toBe(100);
    expect(refToPx('paper', 1, 'y', ENV)).toBe(50);
    // x2 spans the right half of the plot area.
    expect(refToPx('x2 domain', 0, 'x', ENV)).toBe(300);
    expect(refToPx('x2 domain', 1, 'x', ENV)).toBe(500);
    expect(refToPx('x3', 1, 'x', ENV)).toBeUndefined();
    expect(refToPx('y', 1, 'x', ENV)).toBeUndefined();
    for (const [ref, v, letter] of [
      ['x', 7.5, 'x'],
      ['y', 40, 'y'],
      ['paper', 0.3, 'y'],
      ['x2 domain', 0.25, 'x'],
    ] as const) {
      const px = refToPx(ref, v, letter, ENV) as number;
      expect(pxToRef(ref, px, letter, ENV) as number).toBeCloseTo(v);
    }
  });
});

describe('anchors', () => {
  it('centers with an arrow or a data ref, else picks by thirds', () => {
    const base = { xanchor: 'auto', yanchor: 'auto', xref: 'paper', yref: 'paper' } as const;
    expect(resolveAnchors({ ...base, x: 0.1, y: 0.9 }, false)).toEqual({ x: 'left', y: 'top' });
    expect(resolveAnchors({ ...base, x: 0.9, y: 0.1 }, false)).toEqual({
      x: 'right',
      y: 'bottom',
    });
    expect(resolveAnchors({ ...base, x: 0.1, y: 0.1 }, true)).toEqual({ x: 'center', y: 'middle' });
    expect(resolveAnchors({ ...base, xref: 'x', x: 0.1, y: 0.5 }, false).x).toBe('center');
    expect(resolveAnchors({ ...base, xanchor: 'right', x: 0.1, y: 0.5 }, false).x).toBe('right');
  });

  it('places the box by its anchor, rotated boxes by their bounding box', () => {
    // 'abcd' at 10 px: 20 × 13 text, + 2 × (1 border + 1 pad) → 24 × 17 box.
    const a = full({ text: 'abcd', xref: 'paper', yref: 'paper', x: 0, y: 1, showarrow: false });
    const g = annotationGeometry(a, ENV);
    expect(g?.box).toMatchObject({ cx: 100 + 12, cy: 50 + 8.5, hw: 12, hh: 8.5 });
    const r = annotationGeometry({ ...a, textangle: 90 }, ENV);
    expect(r?.box.cx).toBeCloseTo(100 + 8.5);
    expect(r?.box.cy).toBeCloseTo(50 + 12);
    expect(r?.label).toMatchObject({ angle: 90, anchorX: 'center', anchorY: 'middle' });
  });

  it('applies xshift / yshift to the text and the arrow', () => {
    const a = full({ text: 't', x: 5, y: 50, xshift: 10, yshift: 20 });
    const g = annotationGeometry(a, ENV);
    expect(g?.head).toEqual({ x: 310, y: 150 - 20 });
    expect(g?.tail).toEqual({ x: 300, y: 100 });
  });
});

describe('arrows', () => {
  it('points from the tail (text center) to the head with default pixel offsets', () => {
    const g = annotationGeometry(full({ text: 'ab', x: 5, y: 50 }), ENV);
    expect(g?.head).toEqual({ x: 300, y: 150 });
    expect(g?.tail).toEqual({ x: 290, y: 120 });
    expect(g?.box.cx).toBe(290);
    const line = g?.arrow?.line;
    expect(line).toBeDefined();
    // Starts on the box edge (box: 14 × 17 → bottom edge 8.5 px below the tail).
    expect(line?.[0].y).toBeCloseTo(120 + 8.5);
  });

  it('takes the tail in axis units with axref / ayref', () => {
    const g = annotationGeometry(
      full({ text: 't', x: 5, y: 50, axref: 'x', ax: 2, ayref: 'y', ay: 75 }),
      ENV,
    );
    expect(g?.tail).toEqual({ x: 180, y: 100 });
  });

  it('backs the line off for standoff and the head, whose tip lands on the stood-off point', () => {
    const o = {
      arrowside: 'end',
      arrowhead: 2,
      startarrowhead: 1,
      arrowsize: 1,
      startarrowsize: 1,
      arrowwidth: 2,
      standoff: 5,
      startstandoff: 0,
    };
    const a = arrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, undefined, o);
    // Head 2 backs off 1.3 × width 2.
    expect(a.line?.[1].x).toBeCloseTo(100 - 5 - 2.6);
    expect(a.heads).toHaveLength(1);
    const tipX = Math.max(...(a.heads[0] ?? []).map((p) => p.x));
    expect(tipX).toBeCloseTo(95);
    // Both ends with startstandoff; the start head points back at the tail.
    const both = arrowGeometry({ x: 0, y: 0 }, { x: 0, y: 100 }, undefined, {
      ...o,
      arrowside: 'end+start',
      startstandoff: 3,
    });
    expect(both.heads).toHaveLength(2);
    const startTip = Math.min(...(both.heads[0] ?? []).map((p) => p.y));
    expect(startTip).toBeCloseTo(3);
    // Heads 0 (none): no polygons; circles / squares don't rotate.
    expect(
      arrowGeometry({ x: 0, y: 0 }, { x: 50, y: 0 }, undefined, { ...o, arrowhead: 0 }).heads,
    ).toEqual([]);
    const sq = arrowGeometry({ x: 0, y: 0 }, { x: 50, y: 50 }, undefined, { ...o, arrowhead: 7 });
    const xs = (sq.heads[0] ?? []).map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(8);
  });

  it('draws nothing when the standoffs eat the whole arrow', () => {
    const o = {
      arrowside: 'end',
      arrowhead: 1,
      startarrowhead: 1,
      arrowsize: 1,
      startarrowsize: 1,
      arrowwidth: 1,
      standoff: 60,
      startstandoff: 50,
    };
    expect(arrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, undefined, o)).toEqual({
      line: undefined,
      heads: [],
    });
  });

  it('clips rays at rotated boxes', () => {
    const box = { cx: 0, cy: 0, hw: 10, hh: 5, angle: 0 };
    expect(exitDistance(box, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(10);
    expect(exitDistance({ ...box, angle: 90 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(5);
    expect(exitDistance(box, { x: 50, y: 0 }, { x: 1, y: 0 })).toBe(0);
  });
});

describe('visibility and hit testing', () => {
  it('hides data-anchored annotations outside the axis range, never paper ones', () => {
    expect(annotationGeometry(full({ text: 't', x: 50, y: 50 }), ENV)).toBeUndefined();
    expect(
      annotationGeometry(full({ text: 't', xref: 'paper', x: 1.2, y: 50 }), ENV),
    ).toBeDefined();
    expect(annotationGeometry(full({ text: 't', x: 5, y: 50, visible: false }), ENV)).toBe(
      undefined,
    );
  });

  it('defaults a missing position to the middle of its reference', () => {
    const g = annotationGeometry(full({ text: 't', showarrow: false }), ENV);
    expect(g?.head).toEqual({ x: 300, y: 150 });
  });

  it('hits the box and the arrow head', () => {
    const g = annotationGeometry(full({ text: 'ab', x: 5, y: 50 }), ENV);
    if (!g) throw new Error('expected geometry');
    expect(hitAnnotation(g, 290, 120)).toBe('box');
    expect(hitAnnotation(g, 301, 149)).toBe('head');
    expect(hitAnnotation(g, 400, 200)).toBeUndefined();
  });

  it('batches boxes, borders, heads and arrow segments', () => {
    const g = annotationGeometry(
      full({ text: 'ab', x: 5, y: 50, bgcolor: 'white', bordercolor: 'black', opacity: 0.5 }),
      ENV,
    );
    const b = annotationBatches(g ? [g] : []);
    // Background, border ring (2 rings), arrowhead.
    expect(b.fill.polygons).toEqual([0, 1, 3]);
    expect(b.fill.color.slice(0, 4)).toEqual([1, 1, 1, 0.5]);
    expect(b.lines.x).toHaveLength(2);
    expect(b.labels[0]?.color[3]).toBeCloseTo(0.5);
  });
});
