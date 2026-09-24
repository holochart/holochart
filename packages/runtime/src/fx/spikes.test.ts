import { createScale, type FullAxis, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import type { AxisInfo, HoverPoint, SubplotInfo, TraceModule } from '../contracts.ts';
import type { Found, HoverEntry } from './hover.ts';
import {
  acrossSpan,
  axisLinePosition,
  dashArray,
  defaultSpikeColor,
  readability,
  selectSpikePoint,
  spikeBackground,
  spikeGeometry,
  type SpikeFrame,
  type SpikePoint,
} from './spikes.ts';

// Plot area 100..300 × 50..250 (container px); x axis bottom at y = 250, y axis left at x = 100.
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
      spikedash: 'dash',
      ...full,
    } as unknown as FullAxis,
    scale,
    start,
    end,
    l2c: (l) => (letter === 'x' ? start + scale.l2p(l) : start - scale.l2p(l)),
  };
}

const LAYOUT = {
  paper_bgcolor: '#0a0a0f',
  plot_bgcolor: '#0a0a0f',
  margin: { pad: 0 },
} as unknown as FullLayout;

function setup(xFull: Record<string, unknown> = {}, yFull: Record<string, unknown> = {}) {
  const xaxis = axis('x', xFull);
  const yaxis = axis('y', yFull);
  const subplot = { id: 'xy', xaxis, yaxis, rect: AREA } as unknown as SubplotInfo;
  const frame: SpikeFrame = {
    fullLayout: LAYOUT,
    axes: new Map([
      ['x', xaxis],
      ['y', yaxis],
    ]),
    subplots: [subplot],
    plotArea: AREA,
  };
  const entry: HoverEntry = {
    index: 0,
    module: { categories: [] } as unknown as TraceModule,
    trace: { type: 'dots' } as unknown as FullTrace,
    input: {},
    calc: undefined,
    subplot,
    rect: AREA,
    ctx: {
      fullLayout: LAYOUT,
      xaxis,
      yaxis,
      transform: { scaleX: 20, offsetX: 0, scaleY: 20, offsetY: 0, scaleZ: 1, offsetZ: 0 },
    },
    skip: false,
  };
  return { xaxis, yaxis, subplot, frame, entry };
}

function spikePoint(entry: HoverEntry, px: number, py: number, color = '#ea2a37'): SpikePoint {
  const point: HoverPoint = { pointIndex: 0, distance: 0, px, py };
  return { entry, point, x: AREA.x + px, y: AREA.y + AREA.height - py, color };
}

describe('spike colors and dashes', () => {
  it('keeps a visible point color and swaps an invisible one for a contrasting color', () => {
    expect(defaultSpikeColor('#ea2a37', '#0a0a0f')).toBe('#ea2a37');
    // Near-black on the dark default background: white (Plotly `Color.contrast`).
    expect(defaultSpikeColor('#101014', '#0a0a0f')).toBe('#fff');
    // Near-white on white: Plotly's `#444`.
    expect(defaultSpikeColor('#fafafa', '#ffffff')).toBe('#444');
  });

  it('computes WCAG readability like tinycolor', () => {
    expect(readability([0, 0, 0], [1, 1, 1])).toBeCloseTo(21, 5);
    expect(readability([1, 1, 1], [1, 1, 1])).toBeCloseTo(1, 5);
  });

  it('composites a transparent plot background over the paper', () => {
    const bg = spikeBackground({
      paper_bgcolor: '#ffffff',
      plot_bgcolor: 'rgba(0,0,0,0)',
    } as unknown as FullLayout);
    expect(bg).toBe('rgb(255, 255, 255)');
  });

  it("follows Plotly's dashStyle (lengths scale with the width, at least 3 px)", () => {
    expect(dashArray('solid', 3)).toBe('');
    expect(dashArray('dot', 1)).toBe('3px,3px');
    expect(dashArray('dash', 3)).toBe('9px,9px');
    expect(dashArray('dashdot', 4)).toBe('12px,4px,4px,4px');
    expect(dashArray('5px,2px', 3)).toBe('5px,2px');
  });
});

describe('spike geometry', () => {
  it('draws toaxis spikes from the point to both axis lines, over wider background lines', () => {
    const { frame, entry } = setup();
    const p = spikePoint(entry, 60, 80);
    const scene = spikeGeometry(frame, { v: p, h: p }, { x: 0, y: 0 });
    // y spike (horizontal) first, then x spike (vertical); each = background + spike.
    expect(scene.lines).toHaveLength(4);
    const [hBg, h, vBg, v] = scene.lines;
    expect(h).toMatchObject({ x1: 100, x2: 160, y1: 170, y2: 170, width: 3, color: '#ea2a37' });
    expect(h?.dash).toBe('9px,9px');
    expect(hBg).toMatchObject({ x1: 100, x2: 160, width: 5, dash: '' });
    expect(v).toMatchObject({ x1: 160, x2: 160, y1: 250, y2: 170 });
    expect(vBg?.color).toBe('rgb(10, 10, 15)');
    expect(scene.dots).toHaveLength(0);
  });

  it('spans every subplot on the axis with `across`, and adds axis dots with `marker`', () => {
    const { frame, entry, xaxis } = setup({ spikemode: 'across+marker', spikecolor: '#0f0' });
    // A second subplot above sharing the x axis.
    const y2 = axis('y2');
    const upper = {
      id: 'xy2',
      xaxis,
      yaxis: y2,
      rect: { x: 100, y: 0, width: 200, height: 40 },
    } as unknown as SubplotInfo;
    const f2: SpikeFrame = { ...frame, subplots: [...frame.subplots, upper] };
    expect(acrossSpan(xaxis, f2)).toEqual([0, 250]);
    const scene = spikeGeometry(f2, { v: spikePoint(entry, 60, 80) }, { x: 0, y: 0 });
    expect(scene.lines[1]).toMatchObject({ x1: 160, x2: 160, y1: 0, y2: 250, color: '#0f0' });
    // Bottom axis: the dot sits just inside the plot, one thickness above the line.
    expect(scene.dots).toEqual([{ cx: 160, cy: 247, r: 3, color: '#0f0' }]);
  });

  it('puts `spikesnap: cursor` spikes through the pointer', () => {
    const { frame, entry } = setup({}, { spikesnap: 'cursor' });
    const scene = spikeGeometry(frame, { h: spikePoint(entry, 60, 80) }, { x: 222, y: 99 });
    expect(scene.lines[1]).toMatchObject({ x1: 100, x2: 222, y1: 99, y2: 99 });
  });

  it('places spikes of free and right-side axes at their lines (with pad and shift)', () => {
    const { frame } = setup();
    const right = axis('y2', { side: 'right' });
    expect(axisLinePosition(right, frame)).toBe(300);
    const free = axis('y3', { anchor: 'free', position: 0.25, shift: -10 });
    expect(axisLinePosition(free, frame)).toBe(100 + 50 - 10);
    const padded: SpikeFrame = {
      ...frame,
      fullLayout: { ...LAYOUT, margin: { pad: 4 } } as unknown as FullLayout,
    };
    expect(axisLinePosition(frame.axes.get('x') as AxisInfo, padded)).toBe(254);
    const top = axis('x2', { side: 'top', anchor: 'y' });
    expect(axisLinePosition(top, padded)).toBe(46);
  });
});

describe('selectSpikePoint', () => {
  it('picks the nearest point on a spiking axis within spikedistance', () => {
    const { entry } = setup();
    const near: Found = { entry, point: { pointIndex: 0, distance: 5, px: 50, py: 50 } };
    const far: Found = { entry, point: { pointIndex: 1, distance: 1, px: 150, py: 150 } };
    // Pointer at px 55, py 50 → container (155, 200).
    expect(selectSpikePoint([far, near], 2, 'x', -1, 155, 200)?.point.pointIndex).toBe(0);
    expect(selectSpikePoint([far, near], 2, 'x', 2, 155, 200)).toBeUndefined();
    expect(selectSpikePoint([far, near], 2, 'x', 0, 155, 200)).toBeUndefined();
    // The trace may report its own spike distance.
    const own: Found = { entry, point: { ...far.point, spikeDistance: 0 } };
    expect(selectSpikePoint([near, own], 2, 'x', -1, 155, 200)?.point.pointIndex).toBe(1);
    // Bar-like winners in x / y modes keep the spike.
    expect(selectSpikePoint([far, near], 2, 'x', -1, 155, 200, true)?.point.pointIndex).toBe(1);
  });

  it('skips points on axes without showspikes', () => {
    const { entry } = setup({ showspikes: false });
    const f: Found = { entry, point: { pointIndex: 0, distance: 0, px: 50, py: 50 } };
    expect(selectSpikePoint([f], 1, 'x', -1, 150, 200)).toBeUndefined();
    expect(selectSpikePoint([f], 1, 'y', -1, 150, 200)).toBe(f);
  });
});
