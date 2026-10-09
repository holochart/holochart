import {
  attr,
  createRegistry,
  supplyDefaults,
  type CoreTraceModule,
  type FigureInput,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { geoSubplotDomain, geoSubplotRect } from './domain.ts';
import { geoLayoutSchema, geoSubplotAttribute } from './layout-attributes.ts';
import { supplyGeoLayoutDefaults } from './layout-defaults.ts';

/** A minimal trace on a geo subplot (scattergeo comes with GEO3). */
const points: CoreTraceModule = {
  type: 'geopoints',
  categories: ['geo'],
  schema: attr.object({ geo: geoSubplotAttribute }),
  layoutSchema: geoLayoutSchema,
  meta: { description: 'Test trace drawn on a geo subplot.' },
  supplyDefaults(_in, _out, ctx) {
    ctx.coerce('geo');
  },
  supplyLayoutDefaults: supplyGeoLayoutDefaults,
};

const registry = createRegistry().register(points);

function defaults(figure: FigureInput): { fullData: FullTrace[]; fullLayout: FullLayout } {
  const { fullData, fullLayout } = supplyDefaults(figure, registry, { validate: false });
  return { fullData: [...fullData], fullLayout };
}

/** The plot area of a 640×400 container with margins l 40, r 20, t 30, b 50. */
const AREA = { x: 40, y: 30, width: 580, height: 320 };

describe('geo subplot domains', () => {
  it('gives a trace the domain of its subplot', () => {
    const { fullData, fullLayout } = defaults({
      data: [{ type: 'geopoints' }, { type: 'geopoints', geo: 'geo2' }],
      layout: { geo2: { domain: { x: [0.5, 1], y: [0, 0.4] } } },
    } as FigureInput);
    // Without a domain of their own, subplots are stacked from the bottom.
    expect(geoSubplotDomain(fullData[0]!, fullLayout)).toEqual({ x: [0, 1], y: [0, 0.5] });
    expect(geoSubplotDomain(fullData[1]!, fullLayout)).toEqual({ x: [0.5, 1], y: [0, 0.4] });
  });

  it('has none for a trace whose subplot the layout lacks', () => {
    const { fullData, fullLayout } = defaults({ data: [{ type: 'geopoints' }] } as FigureInput);
    const stray = { ...fullData[0]!, geo: 'geo7' } as FullTrace;
    expect(geoSubplotDomain(stray, fullLayout)).toBeUndefined();
    expect(geoSubplotRect(fullLayout, 'geo7', AREA)).toBeUndefined();
    expect(geoSubplotRect(undefined, 'geo', AREA)).toBeUndefined();
  });

  it('reads a hand-built container, whole where an extent is missing', () => {
    const fullLayout = { geo: { domain: { x: [0.2, 0.8] } } } as unknown as FullLayout;
    expect(geoSubplotDomain({ geo: 'geo' } as unknown as FullTrace, fullLayout)).toEqual({
      x: [0.2, 0.8],
      y: [0, 1],
    });
  });

  it('maps a subplot’s domain onto the plot area, y from the bottom', () => {
    const { fullLayout } = defaults({
      data: [{ type: 'geopoints' }, { type: 'geopoints', geo: 'geo2' }],
      layout: {
        geo: { domain: { x: [0, 0.5], y: [0, 0.25] } },
        geo2: { domain: { x: [0.5, 1], y: [0.25, 1] } },
      },
    } as FigureInput);
    // Container px, top-left origin: the bottom quarter of the plot area's left half.
    expect(geoSubplotRect(fullLayout, 'geo', AREA)).toEqual({
      x: 40,
      y: 270,
      width: 290,
      height: 80,
    });
    expect(geoSubplotRect(fullLayout, 'geo2', AREA)).toEqual({
      x: 330,
      y: 30,
      width: 290,
      height: 240,
    });
  });

  it('follows grid cells', () => {
    const { fullLayout } = defaults({
      data: [{ type: 'geopoints' }, { type: 'geopoints', geo: 'geo2' }],
      layout: {
        grid: { rows: 1, columns: 2, xgap: 0 },
        geo2: { domain: { column: 1 } },
      },
    } as FigureInput);
    const left = geoSubplotRect(fullLayout, 'geo', AREA)!;
    const right = geoSubplotRect(fullLayout, 'geo2', AREA)!;
    expect(left).toEqual({ x: 40, y: 30, width: 290, height: 320 });
    expect(right).toEqual({ x: 330, y: 30, width: 290, height: 320 });
  });
});
