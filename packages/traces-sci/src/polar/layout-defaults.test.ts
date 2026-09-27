import { createRegistry, supplyDefaults, validate, type FigureInput } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { barpolar } from '../barpolar/index.ts';
import { scatterpolar } from '../scatterpolar/index.ts';
import { POLAR_SUBPLOTS } from './layout-defaults.ts';

const registry = createRegistry().register(scatterpolar, barpolar);

function layout(figure: FigureInput): Record<string, unknown> {
  return supplyDefaults(figure, registry, { validate: false }).fullLayout as Record<
    string,
    unknown
  >;
}

type Polar = Record<string, unknown> & {
  angularaxis: Record<string, unknown>;
  radialaxis: Record<string, unknown>;
};

function polarOf(figure: FigureInput, id = 'polar'): Polar {
  return layout(figure)[id] as Polar;
}

const trace = { type: 'scatterpolar', r: [1, 2, 3], theta: [0, 90, 180] };

describe('polar layout defaults (plotly.js polar/layout_defaults.js)', () => {
  it('defaults the subplot container', () => {
    const polar = polarOf({ data: [trace] });
    expect(polar['sector']).toEqual([0, 360]);
    expect(polar['hole']).toBe(0);
    expect(polar['bgcolor']).toBe('rgb(255, 255, 255)');
    expect(polar['domain']).toMatchObject({ x: [0, 1], y: [0, 1] });
    // `gridshape` only matters (and exists) on category angular axes.
    expect(polar['gridshape']).toBeUndefined();
    // Bar options only with bars.
    expect(polar['barmode']).toBeUndefined();
  });

  it('detects axis types from the first trace, linear by default', () => {
    expect(polarOf({ data: [trace] }).angularaxis['type']).toBe('linear');
    const cats = polarOf({
      data: [{ type: 'scatterpolar', r: [1, 2], theta: ['a', 'b'] }],
    });
    expect(cats.angularaxis['type']).toBe('category');
    expect(cats.angularaxis['_categories']).toEqual(['a', 'b']);
    expect(cats['gridshape']).toBe('circular');
    // `period` belongs to category axes, `thetaunit` to linear ones.
    expect('thetaunit' in cats.angularaxis).toBe(false);
    expect(polarOf({ data: [trace] }).angularaxis['thetaunit']).toBe('degrees');
  });

  it('collects categories of every trace on the subplot, in trace order', () => {
    const polar = polarOf({
      data: [
        { type: 'scatterpolar', r: [1, 2], theta: ['b', 'a'] },
        { type: 'barpolar', r: [1, 2], theta: ['c', 'a'] },
        { type: 'scatterpolar', subplot: 'polar2', r: [1], theta: ['z'] },
      ],
      layout: { polar: { angularaxis: { categoryorder: 'category ascending' } } },
    });
    expect(polar.angularaxis['_categories']).toEqual(['a', 'b', 'c']);
  });

  it('hides the traces of a date angular axis (Plotly has none yet)', () => {
    const { fullData, fullLayout } = supplyDefaults(
      { data: [{ type: 'scatterpolar', r: [1, 2], theta: ['2024-01-01', '2024-02-01'] }] },
      registry,
      { validate: false },
    );
    expect(fullData[0]!.visible).toBe(false);
    expect((fullLayout['polar'] as Polar).angularaxis['type']).toBe('linear');
  });

  it('rotates clockwise axes to start at 12 o’clock', () => {
    expect(polarOf({ data: [trace] }).angularaxis['rotation']).toBe(0);
    const cw = polarOf({
      data: [trace],
      layout: { polar: { angularaxis: { direction: 'clockwise' } } },
    });
    expect(cw.angularaxis['rotation']).toBe(90);
    const set = polarOf({
      data: [trace],
      layout: { polar: { angularaxis: { direction: 'clockwise', rotation: 10 } } },
    });
    expect(set.angularaxis['rotation']).toBe(10);
  });

  it('puts the radial axis on the first sector angle and suffixes degrees', () => {
    const polar = polarOf({ data: [trace], layout: { polar: { sector: [30, 200] } } });
    expect(polar.radialaxis['angle']).toBe(30);
    expect(polar.angularaxis['ticksuffix']).toBe('°');
    expect(polar.radialaxis['ticksuffix']).toBe('');
    const radians = polarOf({
      data: [trace],
      layout: { polar: { angularaxis: { thetaunit: 'radians' } } },
    });
    expect(radians.angularaxis['ticksuffix']).toBe('');
  });

  it('defaults the radial range like Plotly: autorange from zero, partial ranges', () => {
    const auto = polarOf({ data: [trace] }).radialaxis;
    expect(auto['autorange']).toBe(true);
    expect(auto['rangemode']).toBe('tozero');
    const fixed = polarOf({ data: [trace], layout: { polar: { radialaxis: { range: [0, 5] } } } });
    expect(fixed.radialaxis['autorange']).toBe(false);
    expect(fixed.radialaxis['rangemode']).toBeUndefined();
    const min = polarOf({
      data: [trace],
      layout: { polar: { radialaxis: { range: [null, 5] } } },
    });
    expect(min.radialaxis['autorange']).toBe('min');
    // An invalid partial range autoranges fully.
    const bad = polarOf({
      data: [trace],
      layout: { polar: { radialaxis: { range: [null, 5], autorange: 'max' } } },
    });
    expect(bad.radialaxis['autorange']).toBe(true);
    expect(bad.radialaxis['range']).toBeUndefined();
  });

  it('draws outside ticks and a grid 60 % towards the background', () => {
    const polar = polarOf({ data: [trace] });
    expect(polar.radialaxis['ticks']).toBe('outside');
    expect(polar.radialaxis['linecolor']).toBe('rgb(68, 68, 68)');
    // Plotly: mix(#444, #fff, 60 %) = rgb(180, 180, 180).
    expect(polar.radialaxis['gridcolor']).toBe('rgb(180, 180, 180)');
  });

  it('places several subplots side by side, or in grid cells', () => {
    const fl = layout({
      data: [trace, { ...trace, subplot: 'polar2' }],
    });
    expect(fl[POLAR_SUBPLOTS]).toEqual(['polar', 'polar2']);
    expect((fl['polar'] as Polar)['domain']).toMatchObject({ x: [0, 0.5] });
    expect((fl['polar2'] as Polar)['domain']).toMatchObject({ x: [0.5, 1] });
    const grid = layout({
      data: [trace, { ...trace, subplot: 'polar2' }],
      layout: { grid: { rows: 2, columns: 1 }, polar2: { domain: { row: 1 } } },
    });
    const d = (grid['polar2'] as Polar)['domain'] as { y: number[] };
    expect(d.y[1]).toBeLessThan(0.5);
  });

  it('applies the template’s polar container to every subplot', () => {
    const fl = layout({
      data: [trace, { ...trace, subplot: 'polar2' }],
      layout: { template: { layout: { polar: { bgcolor: '#123456' } } } },
    });
    expect((fl['polar2'] as Polar)['bgcolor']).toBe('rgb(18, 52, 86)');
  });

  it('adds barmode and bargap with barpolar traces', () => {
    const polar = polarOf({ data: [{ type: 'barpolar', r: [1, 2], theta: [0, 90] }] });
    expect(polar['barmode']).toBe('stack');
    expect(polar['bargap']).toBe(0.1);
  });

  it('validates polarN containers and polar trace attributes', () => {
    const issues = validate(
      [{ type: 'scatterpolar', r: [1], theta: [0], subplot: 'polar3', thetaunit: 'gradians' }],
      { polar3: { hole: 0.2, radialaxis: { angle: 45 }, angularaxis: { period: 6 } } },
      registry,
    );
    expect(issues).toEqual([]);
  });
});
