import { createScale, type AxisType, type FullAxis } from '@mk7s/holochart-core';
import { fitImage } from '@mk7s/holochart-render';
import { describe, expect, it } from 'vitest';
import { defaults, testRegistry } from '../__testing__/fixtures.ts';
import type { ShapeAxis, ShapeEnv } from '../shapes/geometry.ts';
import { imageSpan, imageStack, imagesComponent, imagesOf } from './images.ts';

const AREA = { x: 100, y: 50, width: 400, height: 200 };

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

const ENV: ShapeEnv = {
  plotArea: AREA,
  axes: new Map([
    ['x', axis('x', [0, 10])],
    ['y', axis('y', [0, 100])],
    ['x2', axis('x2', [10, 0])],
    ['y2', axis('y2', [0, 3], 'log')],
  ]),
};

describe('defaults', () => {
  it('follows Plotly and hides images without a source', () => {
    const { fullLayout } = defaults(
      { images: [{ source: 'a.png' }, { x: 1 }] },
      [],
      testRegistry([imagesComponent]),
    );
    const [a, b] = imagesOf(fullLayout);
    expect(a).toMatchObject({
      visible: true,
      layer: 'above',
      sizing: 'contain',
      xref: 'paper',
      yref: 'paper',
      xanchor: 'left',
      yanchor: 'top',
      x: 0,
      y: 0,
      sizex: 0,
      opacity: 1,
    });
    expect(b?.visible).toBe(false);
  });
});

describe('imageSpan', () => {
  it('sizes paper boxes from the plot area, anchored by side', () => {
    expect(imageSpan('paper', 0.5, 0.25, 'left', 'x', ENV)).toMatchObject({
      axis: undefined,
      paper: true,
      lo: 300,
      hi: 400,
    });
    expect(imageSpan('paper', 0.5, 0.25, 'center', 'x', ENV)).toMatchObject({ lo: 250, hi: 350 });
    expect(imageSpan('paper', 0.5, 0.25, 'right', 'x', ENV)).toMatchObject({ lo: 200, hi: 300 });
    // y: `top` hangs the box down from y.
    expect(imageSpan('paper', 1, 0.5, 'top', 'y', ENV)).toMatchObject({ lo: 50, hi: 150 });
    expect(imageSpan('paper', 0, 0.5, 'bottom', 'y', ENV)).toMatchObject({ lo: 150, hi: 250 });
  });

  it('keeps data boxes in linear units, extending right and down on screen', () => {
    expect(imageSpan('x', 2, 3, 'left', 'x', ENV)).toMatchObject({ lo: 2, hi: 5 });
    expect(imageSpan('y', 80, 30, 'top', 'y', ENV)).toMatchObject({ lo: 80, hi: 50 });
    expect(imageSpan('y', 80, 30, 'middle', 'y', ENV)).toMatchObject({ lo: 95, hi: 65 });
    // Reversed x: the box still extends to the right on screen (toward smaller values).
    expect(imageSpan('x2', 8, 2, 'left', 'x', ENV)).toMatchObject({ lo: 8, hi: 6 });
    // Log axes take exponents (range units), as Plotly.
    expect(imageSpan('y2', 2, 1, 'top', 'y', ENV)).toMatchObject({ lo: 2, hi: 1 });
    expect(imageSpan('x', 'nope', 1, 'left', 'x', ENV)?.lo).toBeNaN();
    expect(imageSpan('x5', 0, 1, 'left', 'x', ENV)).toBeUndefined();
  });

  it('sizes domain boxes along the axis', () => {
    const span = imageSpan('x domain', 0.5, 0.5, 'left', 'x', ENV);
    expect(span).toMatchObject({ axis: undefined, paper: false, lo: 300, hi: 500 });
    expect(span?.owner?.id).toBe('x');
  });
});

describe('imageStack', () => {
  const data = { paper: false } as never;
  const paper = { paper: true } as never;
  it('follows Plotly: below with data refs in the subplot, paper refs under every subplot', () => {
    expect(imageStack({ layer: 'above' }, data, data)).toBe('upper');
    expect(imageStack({ layer: 'below' }, data, data)).toBe('below');
    expect(imageStack({ layer: 'below' }, paper, data)).toBe('lower');
  });
});

describe('sizing (fitImage)', () => {
  it('maps Plotly sizing to the primitive fit, aligned by the anchors', () => {
    const box = { x0: 0, y0: 0, x1: 200, y1: 100 };
    // contain, xanchor left / yanchor top: a 160×64 logo scaled to 200×80 at the top.
    expect(fitImage(box, { width: 160, height: 64 }, 'contain', 0, 0)?.rect).toEqual([
      0, 20, 200, 100,
    ]);
    // fill (cover): the box is covered, the uv rect crops the sides.
    const cover = fitImage(box, { width: 100, height: 100 }, 'cover', 0.5, 0.5);
    expect(cover?.rect).toEqual([0, 0, 200, 100]);
    expect(cover?.uv[1]).toBeCloseTo(0.25);
    expect(cover?.uv[3]).toBeCloseTo(0.75);
    expect(fitImage(box, { width: 10, height: 50 }, 'stretch', 0, 0)?.uv).toEqual([0, 0, 1, 1]);
  });
});
