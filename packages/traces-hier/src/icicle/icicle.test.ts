import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildHierarchy } from '../hierarchy/build.ts';
import { rectGeometry } from '../treemap/geometry.ts';
import { rectClick } from '../treemap/hover.ts';
import { rectStyles } from '../treemap/style.ts';
import { layoutRectText } from '../treemap/text.ts';
import { planRectTween, rectKey } from '../treemap/tween.ts';
import { build, defaults, EVE, type Built } from '../treemap/__testing__/build.ts';
import { iciclePartition } from './partition.ts';

const TREE = {
  type: 'icicle',
  labels: ['Eve', 'Seth', 'Cain', 'Awan', 'Abel', 'Enos', 'Noam', 'Enoch'],
  parents: ['', 'Eve', 'Eve', 'Eve', 'Eve', 'Seth', 'Seth', 'Awan'],
  values: [60, 30, 15, 9, 6, 20, 10, 9],
  branchvalues: 'total',
};

const geometryOf = (b: Built) => rectGeometry(b.calcs[0]!, b.traces[0]!)!;
const cell = (b: Built, id: string) => geometryOf(b).tiles.find((t) => t.node.id === id)!;
const box = (b: Built, id: string) => {
  const c = cell(b, id);
  return [c.x0, c.x1, c.y0, c.y1];
};

describe('icicle defaults', () => {
  it('defaults like Plotly: horizontal, no padding, faded leaves, the path bar', () => {
    const { fullData } = defaults([{ ...EVE, type: 'icicle' }]);
    expect(fullData[0]).toMatchObject({
      tiling: { orientation: 'h', flip: '', pad: 0 },
      leaf: { opacity: 0.7 },
      pathbar: { visible: true, side: 'top', edgeshape: '>', thickness: 18 },
      textposition: 'top left',
      marker: { line: { width: 1 } },
    });
    expect((fullData[0]!['marker'] as Record<string, unknown>)['pad']).toBeUndefined();
  });
});

describe('icicle partition', () => {
  it('h: levels left to right, cells as tall as their values', () => {
    const b = build([TREE]);
    expect(box(b, 'Eve')).toEqual([0, 200, 0, 400]);
    expect(box(b, 'Seth')).toEqual([200, 400, 0, 200]);
    expect(box(b, 'Cain')).toEqual([200, 400, 200, 300]);
    expect(box(b, 'Enos')).toEqual([400, 600, 0, expect.closeTo(400 / 3)]);
  });

  it('v: levels top to bottom; flips move the root to the other side', () => {
    const v = build([{ ...TREE, tiling: { orientation: 'v' } }]);
    expect(box(v, 'Eve')).toEqual([0, 600, 0, expect.closeTo(400 / 3)]);
    expect(box(v, 'Seth')).toEqual([0, 300, expect.closeTo(400 / 3), expect.closeTo(800 / 3)]);
    const vy = build([{ ...TREE, tiling: { orientation: 'v', flip: 'y' } }]);
    expect(box(vy, 'Eve')).toEqual([0, 600, expect.closeTo(800 / 3), 400]);
    const hx = build([{ ...TREE, tiling: { flip: 'x' } }]);
    expect(box(hx, 'Eve')).toEqual([400, 600, 0, 400]);
    expect(box(hx, 'Seth')).toEqual([200, 400, 0, 200]);
    const hy = build([{ ...TREE, tiling: { flip: 'y' } }]);
    expect(box(hy, 'Seth')).toEqual([200, 400, 200, 400]);
  });

  it('pads cells at their far ends (d3), and stretches levels to maxdepth', () => {
    const p = build([{ ...TREE, tiling: { pad: 4 } }]);
    // h transposes d3's layout: the root starts 4 px in, cells give up 4 px at their ends.
    expect(box(p, 'Eve')).toEqual([4, 196, 4, 396]);
    expect(box(p, 'Seth')).toEqual([200, 396, 4, 198]);
    const m = build([{ ...TREE, maxdepth: 2 }]);
    expect(box(m, 'Eve')).toEqual([0, 300, 0, 400]);
    expect(cell(m, 'Enos')).toMatchObject({ hidden: true });
  });

  it('cells nest in their parents along the level axis (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 30 })), {
          minLength: 1,
          maxLength: 30,
        }),
        fc.constantFrom('h', 'v'),
        fc.constantFrom('', 'x', 'y', 'x+y'),
        (rows, orientation, flip) => {
          const h = buildHierarchy({
            labels: rows.map((_, i) => `n${i}`),
            parents: rows.map(([p], i) => (i === 0 ? '' : `n${p % i}`)),
            values: rows.map(([, v]) => v),
            type: 'icicle',
            name: 't',
          }).hierarchy!;
          const cells = iciclePartition(h.root, 300, 200, {
            orientation: orientation as 'h' | 'v',
            flipX: flip.includes('x'),
            flipY: flip.includes('y'),
            pad: 0,
            maxDepth: Infinity,
          });
          const byNode = new Map(cells.map((c) => [c.node, c]));
          for (const c of cells) {
            expect(c.x0).toBeGreaterThanOrEqual(-1e-9);
            expect(c.x1).toBeLessThanOrEqual(300 + 1e-9);
            expect(c.y0).toBeGreaterThanOrEqual(-1e-9);
            expect(c.y1).toBeLessThanOrEqual(200 + 1e-9);
            const parent = c.node.parent && byNode.get(c.node.parent);
            if (!parent) continue;
            // Children span within their parent across levels.
            if (orientation === 'h') {
              expect(c.y0).toBeGreaterThanOrEqual(parent.y0 - 1e-9);
              expect(c.y1).toBeLessThanOrEqual(parent.y1 + 1e-9);
            } else {
              expect(c.x0).toBeGreaterThanOrEqual(parent.x0 - 1e-9);
              expect(c.x1).toBeLessThanOrEqual(parent.x1 + 1e-9);
            }
          }
        },
      ),
    );
  });
});

describe('icicle styles, labels and clicks', () => {
  it('fades leaves by leaf.opacity and outlines the transparent root too', () => {
    const b = build([TREE], { paper_bgcolor: 'white' });
    const g = geometryOf(b);
    const styles = rectStyles(b.traces[0]!, g.tiles, g, 'white', { colorscale: false });
    const cain = g.tiles.findIndex((t) => t.node.id === 'Cain');
    expect(styles[cain]).toMatchObject({ opacity: 0.7, width: 1 });
    expect(styles[cain]!.fill[3]).toBeCloseTo(0.7);
    expect(styles[0]).toMatchObject({ opacity: 1, width: 1 });
  });

  it('labels every cell with textinfo, headers included', () => {
    const b = build([{ ...TREE, textinfo: 'label+value' }]);
    const texts = layoutRectText(b.traces[0]!, b.calcs[0]!, geometryOf(b), b.fullLayout).map(
      (l) => l.text,
    );
    expect(texts).toContain('Seth\n30');
    expect(texts).toContain('Eve\n60');
  });

  it('drills into cells, up from the entry; a new entry grows from the root side', () => {
    const b = build([TREE]);
    const click = (x: number, y: number) =>
      rectClick(b.calcs[0]!, b.traces[0]!, {}, 0, b.fullLayout, x, y);
    expect(click(300, 100)).toMatchObject({ nextLevel: 'Seth', drills: true });
    const d = build([{ ...TREE, level: 'Seth' }]);
    expect(rectClick(d.calcs[0]!, d.traces[0]!, {}, 0, d.fullLayout, 100, 100)).toMatchObject({
      nextLevel: 'Eve',
      drills: true,
    });
    const g0 = geometryOf(d);
    const g1 = geometryOf(b);
    const plan = planRectTween({
      prev: g0.tiles.map((t) => ({ ...t, key: rectKey(t.node) })),
      prevEntry: 'Seth',
      next: g1.tiles,
      entry: g1.entry,
      pad: 0,
      width: 600,
      height: 400,
      icicle: { orientation: 'h', flipX: false, flipY: false },
    });
    expect(plan.update[0]!.from).toMatchObject({ x0: 0, x1: 0 });
  });
});
