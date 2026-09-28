import {
  ArcPrimitive,
  createResourceManager,
  IDENTITY_TRANSFORM,
  TextPrimitive,
  type Primitive,
  type Viewport,
} from '@mk7s/holochart-render';
import type { TracePlotContext } from '@mk7s/holochart-runtime';
import { describe, expect, it, vi } from 'vitest';
import { layoutSectors, sectorAt, sunburstGeometry, type SunburstCalc } from './geometry.ts';
import { sunburstClick, sunburstHoverPoints } from './hover.ts';
import { sunburst } from './index.ts';
import { sectorArcs, sectorStyles } from './plot.ts';
import { contrastColor, layoutSunburstText } from './text.ts';
import { lerpState, planTween, stateOf } from './tween.ts';
import { build, defaults, EVE, type Built } from './__testing__/build.ts';

// troika typesets in a worker with browser globals; the view tests only need its object graph.
// Mocked by path, like pie's tests: traces-hier does not depend on troika, render does.
vi.mock('../../../render/node_modules/troika-three-text', async () => {
  const { Object3D } = await import('three');
  type Node = InstanceType<typeof Object3D>;
  const noopDispose = (o: object): void => {
    Object.assign(o, { dispose: (): void => {} });
  };
  class Text extends Object3D {
    constructor() {
      super();
      noopDispose(this);
    }
  }
  class BatchedText extends Object3D {
    material: unknown = null;
    addText(text: Node): void {
      this.add(text);
    }
    removeText(text: Node): void {
      this.remove(text);
    }
    constructor() {
      super();
      noopDispose(this);
    }
    sync(callback?: () => void): void {
      callback?.();
    }
  }
  return { Text, BatchedText, configureTextBuilder: () => {}, preloadFont: () => {} };
});

const TAU = Math.PI * 2;
const deg = (rad: number): number => (rad * 180) / Math.PI;
const mod180 = (d: number): number => ((d % 180) + 180) % 180;

describe('sunburst defaults', () => {
  it('needs labels and parents', () => {
    const { fullData } = defaults([{}, { labels: ['a'] }, { labels: ['a'], parents: [''] }]);
    expect(fullData.map((t) => t.visible)).toEqual([false, false, true]);
  });

  it('defaults like Plotly: counts without values, paper-colored outlines, faded leaves', () => {
    const { fullData, fullLayout } = defaults(
      [
        { labels: ['a', 'b'], parents: ['', 'a'] },
        { ...EVE, text: ['x'], marker: { colors: [1, 2, 3] } },
      ],
      { paper_bgcolor: '#123456' },
    );
    const [plain, scaled] = fullData;
    expect(plain).toMatchObject({
      count: 'leaves',
      maxdepth: -1,
      textinfo: 'label',
      hoverinfo: 'label+text+value+name',
      insidetextorientation: 'auto',
      rotation: 0,
      sort: true,
      root: { color: 'rgba(0, 0, 0, 0)' },
      leaf: { opacity: 0.7 },
      marker: { line: { width: 1, color: 'rgb(18, 52, 86)' } },
    });
    expect(plain?.['branchvalues']).toBeUndefined();
    expect(plain?.['level']).toBeUndefined();
    expect(plain?.['_hasColorscale']).toBe(false);
    expect(scaled).toMatchObject({
      branchvalues: 'remainder',
      textinfo: 'text+label',
      leaf: { opacity: 1 },
      _hasColorscale: true,
    });
    expect(fullLayout['sunburstcolorway']).toEqual(fullLayout.colorway);
    expect(fullLayout['extendsunburstcolors']).toBe(true);
    // Inside labels contrast with their sector unless a text color is set.
    expect((plain?.['insidetextfont'] as { color?: unknown }).color).toBeUndefined();
  });
});

describe('sunburst geometry', () => {
  const b = build([EVE]);
  const calc = b.calcs[0]!;
  const trace = b.traces[0]!;

  it('centers the sunburst in its domain with half the smaller side as radius', () => {
    expect(calc.layout).toMatchObject({ cx: 300, cy: 200, r: 200 });
  });

  it('draws the entry as a disc and each level as an equal ring, sectors by value', () => {
    const g = sunburstGeometry(calc, trace)!;
    const at = (id: string) => g.sectors.find((s) => s.node.id === id)!;
    expect(g.sectors.map((s) => s.node.id)).toEqual([
      'Eve',
      'Seth',
      'Cain',
      'Awan',
      'Abel',
      'Azura',
      'Enos',
      'Noam',
      'Enoch',
    ]);
    expect(at('Eve')).toMatchObject({ x0: 0, x1: TAU, r0: 0, rInscribed: 1, ring: 1 });
    expect(at('Eve').r1).toBeCloseTo(200 / 3);
    const seth = at('Seth');
    expect(seth.x0).toBe(0);
    expect(seth.x1).toBeCloseTo((24 / 68) * TAU);
    expect(seth.r0).toBeCloseTo(200 / 3);
    expect(seth.r1).toBeCloseTo(400 / 3);
    expect(at('Noam').x0).toBeCloseTo((10 / 68) * TAU);
    expect(at('Noam').r1).toBeCloseTo(200);
    // Pie's angles: clockwise from 12 o'clock.
    expect(seth.startAngle).toBeCloseTo(Math.PI / 2);
    expect(seth.midAngle).toBeCloseTo(Math.PI / 2 - (12 / 68) * TAU);
  });

  it('turns counterclockwise by rotation', () => {
    const g = layoutSectors(calc, { ...trace, rotation: 90 }, 200)!;
    expect(g.sectors[1]!.x0).toBeCloseTo(Math.PI / 2);
    expect(g.baseX).toBeCloseTo(Math.PI / 2);
  });

  it('starts from level and stops at maxdepth', () => {
    const seth = layoutSectors(calc, { ...trace, level: 'Seth' }, 200)!;
    expect(seth.entry.id).toBe('Seth');
    expect(seth.sectors.map((s) => [s.node.id, s.r0, s.r1])).toEqual([
      ['Seth', 0, 100],
      ['Enos', 100, 200],
      ['Noam', 100, 200],
    ]);
    expect(seth.sectors[1]!.x1).toBeCloseTo((10 / 24) * TAU);
    const shallow = layoutSectors(calc, { ...trace, maxdepth: 2 }, 200)!;
    expect(shallow.sectors).toHaveLength(6);
    expect(shallow.sectors[1]!.r1).toBe(200);
  });

  it('skips the generated root of several roots', () => {
    const multi = build([{ labels: ['A', 'B', 'a'], parents: ['', '', 'A'], values: [1, 1, 1] }]);
    const g = sunburstGeometry(multi.calcs[0]!, multi.traces[0]!)!;
    expect(g.sectors.map((s) => [s.node.id, s.r0, s.r1])).toEqual([
      ['A', 0, 100],
      ['B', 0, 100],
      ['a', 100, 200],
    ]);
  });

  it('hit tests sectors in container px', () => {
    const g = sunburstGeometry(calc, trace)!;
    const layout = calc.layout!;
    const noam = g.sectors.find((s) => s.node.id === 'Noam')!;
    const mid = (noam.x0 + noam.x1) / 2;
    expect(sectorAt(g, layout, 300 + 170 * Math.cos(mid), 200 - 170 * Math.sin(mid))?.node.id).toBe(
      'Noam',
    );
    expect(sectorAt(g, layout, 300, 200)?.node.id).toBe('Eve');
    // In Eve's remainder gap (the last 10/68 of the circle) and outside.
    expect(
      sectorAt(g, layout, 300 + 100 * Math.cos(-0.3), 200 - 100 * Math.sin(-0.3)),
    ).toBeUndefined();
    expect(sectorAt(g, layout, 10, 10)).toBeUndefined();
  });

  it('draws nothing and warns when the hierarchy cannot be built', () => {
    const bad = build([{ labels: ['a', 'b'], parents: ['x', 'y'] }]);
    expect(bad.warnings).toEqual([
      '[holochart] Multiple implied roots, cannot build sunburst hierarchy of trace 0. These roots include: x, y',
    ]);
    expect(sunburstGeometry(bad.calcs[0]!, bad.traces[0]!)).toBeUndefined();
    expect(
      sunburst.describe!({
        ...bad.entries[0]!,
        fullLayout: bad.fullLayout,
        xaxis: undefined,
        yaxis: undefined,
        maxRows: 100,
      })?.summary,
    ).toContain('could not be built');
  });
});

describe('sunburst colors', () => {
  it('uses sunburstcolorway on the first level, parents below, root.color in the middle', () => {
    const b = build([EVE], {
      sunburstcolorway: ['#aa0000', '#00aa00'],
      extendsunburstcolors: false,
    });
    const g = sunburstGeometry(b.calcs[0]!, b.traces[0]!)!;
    expect(g.sectors.map((s) => s.node.color)).toEqual([
      'rgba(0, 0, 0, 0)',
      'rgb(170, 0, 0)',
      'rgb(0, 170, 0)',
      'rgb(170, 0, 0)',
      'rgb(0, 170, 0)',
      'rgb(170, 0, 0)',
      'rgb(170, 0, 0)',
      'rgb(170, 0, 0)',
      'rgb(170, 0, 0)',
    ]);
  });

  it('fades leaves by leaf.opacity and outlines with marker.line', () => {
    const b = build([{ ...EVE, marker: { line: { width: [3], color: 'red' } } }]);
    const g = sunburstGeometry(b.calcs[0]!, b.traces[0]!)!;
    const styles = sectorStyles(b.traces[0]!, g.sectors, 'white');
    expect(styles[0]).toMatchObject({ width: 3, opacity: 1, line: [1, 0, 0, 1] });
    const cain = styles[g.sectors.findIndex((s) => s.node.id === 'Cain')]!;
    expect(cain.opacity).toBe(0.7);
    expect(cain.fill[3]).toBeCloseTo(0.7);
    expect(cain.width).toBe(0);
  });

  it('picks a contrasting label color like Plotly', () => {
    expect(contrastColor('#1f77b4')).toEqual([1, 1, 1, 1]);
    expect(contrastColor('#ffdd00')[0]).toBeCloseTo(68 / 255);
  });

  it('reports a colorbar for colorscaled sectors with showscale', () => {
    const b = build([
      { ...EVE, values: undefined, marker: { colorscale: 'Viridis', showscale: true } },
    ]);
    const bar = sunburst.colorbar!(b.traces[0]!, { fullLayout: b.fullLayout });
    // Colored by leaf counts: 1 (a leaf) to 6 (the root).
    expect(bar).toMatchObject({ cmin: 1, cmax: 6 });
  });
});

describe('sunburst labels', () => {
  const layoutOf = (b: Built) => b.calcs[0]!.layout!;
  const labelsOf = (b: Built, trace = b.traces[0]!) =>
    layoutSunburstText(
      trace,
      b.calcs[0]!,
      sunburstGeometry(b.calcs[0]!, trace)!,
      layoutOf(b),
      b.fullLayout,
    );

  it('centers the root label in the disc with the outside font', () => {
    const b = build([{ ...EVE, outsidetextfont: { color: '#ff0000' } }]);
    const root = labelsOf(b).find((l) => l.text === 'Eve')!;
    expect(root).toMatchObject({ x: 300, y: 200, angle: 0, color: [1, 0, 0, 1] });
  });

  it('orients labels horizontally, radially or tangentially', () => {
    const noamOf = (orientation: string) => {
      const b = build([{ ...EVE, insidetextorientation: orientation }]);
      const g = sunburstGeometry(b.calcs[0]!, b.traces[0]!)!;
      const k = g.sectors.findIndex((s) => s.node.id === 'Noam');
      return { label: labelsOf(b).find((l) => l.sector === k)!, sector: g.sectors[k]! };
    };
    expect(noamOf('horizontal').label.angle).toBe(0);
    const radial = noamOf('radial');
    expect(mod180(radial.label.angle)).toBeCloseTo(mod180(deg(radial.sector.midAngle) - 90));
    const tangential = noamOf('tangential');
    expect(mod180(tangential.label.angle)).toBeCloseTo(mod180(deg(tangential.sector.midAngle)));
    // The label sits on the sector's bisector.
    const { label, sector } = radial;
    const a = Math.atan2(label.x - 300, 200 - label.y);
    expect(a).toBeCloseTo(sector.midAngle);
  });

  it('shrinks labels to fit and drops those that would vanish', () => {
    const b = build([
      { ...EVE, textfont: { size: 40 }, texttemplate: '%{label} %{label} %{label}' },
    ]);
    const labels = labelsOf(b);
    for (const l of labels) expect(l.font.size).toBeLessThanOrEqual(40);
    expect(labels.some((l) => l.font.size < 40)).toBe(true);
    const tiny = build([{ labels: ['R', 'a', 'b'], parents: ['', 'R', 'R'], values: [0, 1e6, 1] }]);
    expect(labelsOf(tiny).map((l) => l.text)).not.toContain('b');
  });
});

describe('sunburst hover and clicks', () => {
  const b = build([{ ...EVE, customdata: EVE.labels }]);
  const calc = b.calcs[0]!;
  const trace = b.traces[0]!;
  const ctx = {
    fullLayout: b.fullLayout,
    xaxis: undefined,
    yaxis: undefined,
    transform: IDENTITY_TRANSFORM,
  };
  const query = (x: number, y: number) =>
    sunburstHoverPoints(
      calc,
      trace,
      { px: x, py: 400 - y, xl: x, yl: 400 - y, mode: 'closest', distance: 20, cx: x, cy: y },
      ctx,
    );

  it('reports the sector under the pointer with Plotly fields and hover text', () => {
    const [p] = query(300 + 100 * Math.cos(0.3), 200 - 100 * Math.sin(0.3));
    expect(p).toMatchObject({
      pointIndex: 2,
      distance: 0,
      hoverText: 'Seth<br>12',
      fields: {
        label: 'Seth',
        value: 12,
        parent: 'Eve',
        currentPath: 'Eve/',
        percentParent: 24 / 68,
        percentRoot: 24 / 68,
        customdata: 'Seth',
      },
      labels: { value: '12', percentParent: '35%' },
    });
    expect(query(10, 10)).toEqual([]);
  });

  it('anchors the root label in the middle', () => {
    const [p] = query(300, 200);
    expect(p).toMatchObject({ px: 300, py: 200, pointIndex: 0 });
  });

  it('drills into branches and up from the center, not on leaves or the root', () => {
    const click = (x: number, y: number, level?: string) =>
      sunburstClick(
        calc,
        level === undefined ? trace : { ...trace, level },
        {},
        0,
        b.fullLayout,
        x,
        y,
      );
    const seth = click(300 + 100 * Math.cos(0.3), 200 - 100 * Math.sin(0.3))!;
    expect(seth.nextLevel).toBe('Seth');
    expect(seth.point).toMatchObject({
      curveNumber: 0,
      pointNumber: 2,
      label: 'Seth',
      entry: 'Eve',
    });
    expect(click(300, 200)?.nextLevel).toBeUndefined();
    const cainAngle = (24 / 68 + 7 / 68) * TAU;
    expect(
      click(300 + 100 * Math.cos(cainAngle), 200 - 100 * Math.sin(cainAngle))?.nextLevel,
    ).toBeUndefined();
    expect(click(300, 200, 'Seth')).toMatchObject({ nextLevel: 'Eve', point: { entry: 'Seth' } });
    expect(click(5, 5)).toBeUndefined();
  });

  it('goes up to the whole hierarchy of several roots with an empty level', () => {
    const multi = build([{ labels: ['A', 'B', 'a', 'x'], parents: ['', '', 'A', 'a'] }]);
    const t = { ...multi.traces[0]!, level: 'A' };
    expect(sunburstClick(multi.calcs[0]!, t, {}, 0, multi.fullLayout, 300, 200)?.nextLevel).toBe(
      '',
    );
  });
});

describe('sunburst drill-down transition', () => {
  const b = build([EVE]);
  const calc = b.calcs[0]!;
  const trace = b.traces[0]!;
  const root = layoutSectors(calc, trace, 200)!;
  const seth = layoutSectors(calc, { ...trace, level: 'Seth' }, 200)!;
  const drawn = (g: typeof root) =>
    g.sectors.map((s) => ({ ...stateOf(s), id: s.node.id, parentId: s.node.parent?.id }));

  it('drilling in: kept sectors move, ancestors shrink to the center, others fold away', () => {
    const plan = planTween(drawn(root), 'Eve', seth.sectors, seth.entry, 0, 200);
    const oldSeth = root.sectors.find((s) => s.node.id === 'Seth')!;
    expect(plan.update[0]).toEqual({ from: stateOf(oldSeth), to: stateOf(seth.sectors[0]!) });
    const exits = new Map(plan.exit.map((e) => [root.sectors[e.index]!.node.id, e.to]));
    expect([...exits.keys()]).toEqual(['Eve', 'Cain', 'Awan', 'Abel', 'Azura', 'Enoch']);
    expect(exits.get('Eve')).toMatchObject({ r0: 0, r1: 0 });
    // Past Seth's old end: folded to a full turn (counterclockwise).
    expect(exits.get('Cain')).toMatchObject({ x0: TAU, x1: TAU });
  });

  it('going up: the new center grows, new sectors twist in from 3 o’clock', () => {
    const plan = planTween(drawn(seth), 'Seth', root.sectors, root.entry, 0, 200);
    expect(plan.exit).toEqual([]);
    const from = new Map(root.sectors.map((s, k) => [s.node.id, plan.update[k]!.from]));
    expect(from.get('Eve')).toMatchObject({ r0: 0, r1: 0 });
    expect(from.get('Cain')).toMatchObject({ x0: TAU, x1: TAU });
    expect(from.get('Seth')).toEqual(stateOf(seth.sectors[0]!));
  });

  it('new outer rings grow out of their parent at the rim (maxdepth)', () => {
    const shallow = layoutSectors(calc, { ...trace, maxdepth: 2 }, 200)!;
    const deep = layoutSectors(calc, { ...trace, level: 'Seth', maxdepth: 2 }, 200)!;
    const plan = planTween(drawn(shallow), 'Eve', deep.sectors, deep.entry, 0, 200);
    expect(plan.update[1]!.from).toMatchObject({ r0: 200, r1: 200 });
    expect(lerpState(plan.update[1]!.from, plan.update[1]!.to, 1)).toEqual(plan.update[1]!.to);
  });
});

describe('sunburst view', () => {
  function plotContext(built: Built, index = 0) {
    const added: Primitive<unknown>[] = [];
    const ctx: TracePlotContext<SunburstCalc> = {
      trace: built.traces[index]!,
      calc: built.calcs[index]!,
      index,
      fullLayout: built.fullLayout,
      subplot: undefined,
      xaxis: undefined,
      yaxis: undefined,
      transform: IDENTITY_TRANSFORM,
      viewport: { size: { width: 600, height: 400, pixelRatio: 1 } } as unknown as Viewport,
      domain: built.entries[index]!.domain,
      primitives: { resources: createResourceManager(), invalidate: vi.fn() },
      add: (p) => {
        added.push(p as Primitive<unknown>);
        return p;
      },
      remove: (p) => {
        added.splice(added.indexOf(p as Primitive<unknown>), 1);
        p.dispose();
      },
      invalidate: vi.fn(),
    };
    return { ctx, added };
  }

  it('draws every sector with one arc primitive and one text primitive, below components', () => {
    const built = build([EVE]);
    const { ctx, added } = plotContext(built);
    const view = sunburst.plot!.create(ctx);
    expect(added.filter((p) => p instanceof ArcPrimitive)).toHaveLength(1);
    expect(added.filter((p) => p instanceof TextPrimitive)).toHaveLength(1);
    // Wedge + outer rim per sector.
    expect((added[0] as ArcPrimitive).instanceCount).toBe(18);
    for (const p of added) {
      expect(p.object.renderOrder).toBeGreaterThanOrEqual(-10);
      expect(p.object.renderOrder).toBeLessThan(0);
    }
    view.update(ctx, { calc: false, plot: true, style: true, transform: false });
    expect(added).toHaveLength(2);
  });

  it('places wedges in world px with half-width borders and outer rims', () => {
    const built = build([{ ...EVE, marker: { line: { width: 4, color: '#fff' } } }]);
    const g = sunburstGeometry(built.calcs[0]!, built.traces[0]!)!;
    const styles = sectorStyles(built.traces[0]!, g.sectors, 'white');
    const arcs = sectorArcs(g.sectors.map(stateOf), styles, { cx: 300, cy: 200 }, 400);
    expect([arcs.x[2], arcs.y[2]]).toEqual([300, 200]);
    expect([arcs.innerRadius[2], arcs.outerRadius[2], arcs.borderWidth[2]]).toEqual([
      expect.closeTo(200 / 3),
      expect.closeTo(400 / 3),
      2,
    ]);
    expect([arcs.innerRadius[3], arcs.outerRadius[3]]).toEqual([
      expect.closeTo(400 / 3),
      expect.closeTo(400 / 3 + 2),
    ]);
    expect(arcs.startAngle[2]).toBe(0);
    expect(arcs.pattern).toBeNull();
  });

  it('draws marker.pattern on the sectors, not on the rims', () => {
    const built = build([{ ...EVE, marker: { pattern: { shape: ['', '/'] } } }]);
    const g = sunburstGeometry(built.calcs[0]!, built.traces[0]!)!;
    const styles = sectorStyles(built.traces[0]!, g.sectors, 'white');
    const arcs = sectorArcs(g.sectors.map(stateOf), styles, { cx: 300, cy: 200 }, 400, 'white');
    const patterns = arcs.pattern!.pattern as (Record<string, unknown> | undefined)[];
    // Cain (data index 1) is the third sector.
    expect(patterns[4]).toMatchObject({ shape: '/', bgcolor: 'white' });
    expect(patterns[0]).toBeUndefined();
    expect(patterns[5]).toBeUndefined();
  });
});
