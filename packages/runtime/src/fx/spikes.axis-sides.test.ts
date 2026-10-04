/**
 * Spike geometry on axes that are not the bottom-left pair: top and right sides, free axes placed
 * by `position`, y axes shared by subplots side by side, and `spikemode: 'marker'` dots. The plot
 * area is x 100–300, y 50–250 (container px): the bottom edge at y = 250, the left one at x = 100.
 */
import { createScale, type FullAxis, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import type { AxisInfo, HoverPoint, SubplotInfo, TraceModule } from '../contracts.ts';
import type { HoverEntry } from './hover.ts';
import {
  acrossSpan,
  axisLinePosition,
  dashArray,
  NO_SPIKES,
  spikeGeometry,
  type SpikeFrame,
  type SpikePoint,
} from './spikes.ts';

const AREA = { x: 100, y: 50, width: 200, height: 200 };

function axis(id: string, full: Record<string, unknown> = {}): AxisInfo {
  const letter = id.startsWith('y') ? 'y' : 'x';
  const scale = createScale({ type: 'linear', range: [0, 10], length: 200 });
  const start = letter === 'x' ? AREA.x : AREA.y + AREA.height;
  const end = letter === 'x' ? AREA.x + AREA.width : AREA.y;
  return {
    id,
    name: `${letter}axis${id.slice(1)}`,
    letter,
    type: 'linear',
    full: {
      type: 'linear',
      anchor: letter === 'x' ? 'y' : 'x',
      side: letter === 'x' ? 'bottom' : 'left',
      position: 0,
      showspikes: true,
      spikemode: 'toaxis',
      spikesnap: 'hovered data',
      spikethickness: 3,
      spikedash: 'solid',
      spikecolor: '#0f0',
      ...full,
    } as unknown as FullAxis,
    scale,
    start,
    end,
    l2c: (l) => (letter === 'x' ? start + scale.l2p(l) : start - scale.l2p(l)),
  };
}

function layout(pad: number): FullLayout {
  return {
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    margin: { pad },
  } as unknown as FullLayout;
}

function subplot(xaxis: AxisInfo, yaxis: AxisInfo, rect = AREA): SubplotInfo {
  return { id: `${xaxis.id}${yaxis.id}`, xaxis, yaxis, rect } as unknown as SubplotInfo;
}

/** A frame with one subplot on the given axes, its plot area margins padded by `pad` px. */
function frameOf(xaxis: AxisInfo, yaxis: AxisInfo, pad = 0): SpikeFrame {
  return {
    fullLayout: layout(pad),
    axes: new Map([
      [xaxis.id, xaxis],
      [yaxis.id, yaxis],
    ]),
    subplots: [subplot(xaxis, yaxis)],
    plotArea: AREA,
  };
}

/** A spiked point at plot px `(px, py)` (from the bottom-left corner) of the frame's subplot. */
function spikePoint(frame: SpikeFrame, px: number, py: number): SpikePoint {
  const sp = frame.subplots[0] as SubplotInfo;
  const entry: HoverEntry = {
    index: 0,
    module: { categories: [] } as unknown as TraceModule,
    trace: { type: 'dots' } as unknown as FullTrace,
    input: {},
    calc: undefined,
    subplot: sp,
    rect: AREA,
    ctx: {
      fullLayout: frame.fullLayout,
      xaxis: sp.xaxis,
      yaxis: sp.yaxis,
      transform: { scaleX: 20, offsetX: 0, scaleY: 20, offsetY: 0, scaleZ: 1, offsetZ: 0 },
    },
    skip: false,
  };
  const point: HoverPoint = { pointIndex: 0, distance: 0, px, py };
  return { entry, point, x: AREA.x + px, y: AREA.y + AREA.height - py, color: '#ea2a37' };
}

describe('dash patterns', () => {
  it("follows Plotly's dashStyle for the long dashes", () => {
    expect(dashArray('longdash', 3)).toBe('15px,15px');
    expect(dashArray('longdashdot', 4)).toBe('20px,8px,4px,8px');
    // Thin lines use a 3 px unit.
    expect(dashArray('longdash', 1)).toBe('15px,15px');
  });
});

describe('where an axis line is', () => {
  it('puts a free x axis at its position up the plot area, padded away from the plot', () => {
    const frame = frameOf(axis('x'), axis('y'), 4);
    // A quarter of the way up from the bottom edge (y = 250) of a 200 px high area.
    const bottom = axis('x2', { anchor: 'free', position: 0.25 });
    expect(axisLinePosition(bottom, frame)).toBe(200 + 4);
    const top = axis('x3', { anchor: 'free', position: 1, side: 'top' });
    expect(axisLinePosition(top, frame)).toBe(50 - 4);
  });

  it('puts a free y axis at its position across the plot area, padded away from the plot', () => {
    const frame = frameOf(axis('x'), axis('y'), 4);
    const right = axis('y2', { anchor: 'free', position: 1, side: 'right' });
    expect(axisLinePosition(right, frame)).toBe(300 + 4);
    const left = axis('y3', { anchor: 'free', position: 0.5 });
    expect(axisLinePosition(left, frame)).toBe(200 - 4);
  });

  it('puts an anchored right-side y axis at the far end of its x axis, padded outward', () => {
    const frame = frameOf(axis('x'), axis('y'), 4);
    expect(axisLinePosition(axis('y2', { side: 'right' }), frame)).toBe(300 + 4);
    expect(axisLinePosition(axis('y'), frame)).toBe(100 - 4);
  });
});

describe('the span of `across` spikes', () => {
  it('covers every subplot on a y axis from left to right, and no other subplot', () => {
    const y = axis('y');
    const x = axis('x');
    const x2 = axis('x2', { anchor: 'y' });
    const other = subplot(axis('x3'), axis('y2'), { x: 600, y: 50, width: 100, height: 200 });
    const frame: SpikeFrame = {
      ...frameOf(x, y),
      subplots: [subplot(x, y), subplot(x2, y, { x: 340, y: 50, width: 200, height: 200 }), other],
    };
    expect(acrossSpan(y, frame)).toEqual([100, 540]);
    // An x axis' span is vertical: its own subplot only here.
    expect(acrossSpan(x, frame)).toEqual([50, 250]);
  });

  it('reaches out to the line of a free axis outside its subplots', () => {
    const x = axis('x');
    // A free y axis drawn at the left edge of the plot area, its subplot starting at x = 180.
    const y = axis('y2', { anchor: 'free', position: 0 });
    const frame: SpikeFrame = {
      ...frameOf(x, y),
      subplots: [subplot(x, y, { x: 180, y: 50, width: 120, height: 200 })],
    };
    expect(acrossSpan(y, frame)).toEqual([100, 300]);
    // A free x axis at the top of the plot area, its subplot starting lower down.
    const top = axis('x2', { anchor: 'free', position: 1, side: 'top' });
    const lower: SpikeFrame = {
      ...frameOf(top, axis('y')),
      subplots: [subplot(top, axis('y'), { x: 100, y: 120, width: 200, height: 130 })],
    };
    expect(acrossSpan(top, lower)).toEqual([50, 250]);
  });
});

describe('spike geometry', () => {
  it('draws nothing without a spiked point', () => {
    const frame = frameOf(axis('x'), axis('y'));
    expect(spikeGeometry(frame, {}, { x: 0, y: 0 })).toBe(NO_SPIKES);
    expect(NO_SPIKES).toEqual({ lines: [], dots: [] });
  });

  it('draws `toaxis` spikes to a top x axis and a right y axis', () => {
    const frame = frameOf(axis('x', { side: 'top' }), axis('y', { side: 'right' }));
    // The point is at container (160, 170).
    const p = spikePoint(frame, 60, 80);
    const scene = spikeGeometry(frame, { v: p, h: p }, { x: 0, y: 0 });
    const [, h, , v] = scene.lines;
    expect(h).toMatchObject({ x1: 300, x2: 160, y1: 170, y2: 170 });
    expect(v).toMatchObject({ x1: 160, x2: 160, y1: 50, y2: 170 });
  });

  it('draws only a dot on the axis line with `spikemode: marker`, just inside the plot', () => {
    const marker = { spikemode: 'marker' };
    const frame = frameOf(axis('x', marker), axis('y', marker));
    const p = spikePoint(frame, 60, 80);
    const scene = spikeGeometry(frame, { v: p, h: p }, { x: 0, y: 0 });
    expect(scene.lines).toEqual([]);
    // The y axis' dot (left edge, at the point's height), then the x axis' (bottom edge).
    expect(scene.dots).toEqual([
      { cx: 103, cy: 170, r: 3, color: '#0f0' },
      { cx: 160, cy: 247, r: 3, color: '#0f0' },
    ]);
  });

  it('puts the dots of top and right axes inside the plot too', () => {
    const frame = frameOf(
      axis('x', { spikemode: 'marker', side: 'top' }),
      axis('y', { spikemode: 'marker', side: 'right' }),
    );
    const p = spikePoint(frame, 60, 80);
    const scene = spikeGeometry(frame, { v: p, h: p }, { x: 0, y: 0 });
    expect(scene.dots).toEqual([
      { cx: 297, cy: 170, r: 3, color: '#0f0' },
      { cx: 160, cy: 53, r: 3, color: '#0f0' },
    ]);
  });

  it('puts the dots of `spikesnap: cursor` axes at the pointer', () => {
    const cursor = { spikemode: 'marker', spikesnap: 'cursor' };
    const frame = frameOf(axis('x', cursor), axis('y', cursor));
    const p = spikePoint(frame, 60, 80);
    const scene = spikeGeometry(frame, { v: p, h: p }, { x: 222, y: 99 });
    expect(scene.dots).toEqual([
      { cx: 103, cy: 99, r: 3, color: '#0f0' },
      { cx: 222, cy: 247, r: 3, color: '#0f0' },
    ]);
  });
});
