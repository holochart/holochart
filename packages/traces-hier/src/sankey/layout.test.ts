import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BASE_RADIUS,
  circularLinks,
  cloneGraph,
  resolveCollisions,
  sankeyLayout,
  updateSankey,
  VERTICAL_MARGIN,
  type SankeyGraph,
  type SankeyLinkInput,
  type SankeyNode,
} from './layout.ts';

const OPTIONS = { width: 600, height: 400, nodeWidth: 20, nodePadding: 20 } as const;

const links = (list: readonly (readonly [number, number, number])[]): SankeyLinkInput[] =>
  list.map(([source, target, value]) => ({ source, target, value }));

/** Layers of the nodes, by node index. */
const layersOf = (g: SankeyGraph): number[] => g.nodes.map((n) => n.layer);

/** Nodes of each layer, top to bottom. */
function columns(g: SankeyGraph): SankeyNode[][] {
  const out: SankeyNode[][] = [];
  for (const n of g.nodes) (out[n.layer] ??= []).push(n);
  return out.filter(Boolean).map((c) => [...c].sort((a, b) => a.y0 - b.y0));
}

const EPS = 1e-6;

describe('sankey layout: layers', () => {
  it('assigns depths, heights and evenly spread layers', () => {
    const g = sankeyLayout(
      3,
      links([
        [0, 1, 5],
        [1, 2, 5],
      ]),
      OPTIONS,
    );
    expect(g.nodes.map((n) => n.depth)).toEqual([0, 1, 2]);
    expect(g.nodes.map((n) => n.height)).toEqual([2, 1, 0]);
    expect(g.layers).toBe(3);
    expect(g.nodes.map((n) => n.x0)).toEqual([0, 290, 580]);
    expect(g.nodes.every((n) => n.x1 - n.x0 === 20)).toBe(true);
  });

  // 0 → 1 → 2, 3 → 2 (a late source), 0 → 4 (an early sink).
  const GRAPH = links([
    [0, 1, 4],
    [1, 2, 4],
    [3, 2, 2],
    [0, 4, 1],
  ]);

  it.each([
    ['justify', [0, 1, 2, 0, 2]],
    ['left', [0, 1, 2, 0, 1]],
    ['right', [0, 1, 2, 1, 2]],
    ['center', [0, 1, 2, 1, 1]],
  ] as const)('aligns nodes: %s', (align, expected) => {
    expect(layersOf(sankeyLayout(5, GRAPH, { ...OPTIONS, align }))).toEqual(expected);
  });

  it('sizes nodes by the larger of their in- and outflow', () => {
    const g = sankeyLayout(
      3,
      links([
        [0, 1, 5],
        [1, 2, 3],
        [0, 2, 1],
      ]),
      OPTIONS,
    );
    expect(g.nodes.map((n) => n.value)).toEqual([6, 5, 4]);
    for (const n of g.nodes) expect(n.y1 - n.y0).toBeCloseTo(n.value * g.ky, 9);
  });

  it('fits the fullest layer: its nodes and padding fill the height', () => {
    const g = sankeyLayout(
      4,
      links([
        [0, 2, 6],
        [1, 2, 3],
        [2, 3, 9],
      ]),
      OPTIONS,
    );
    const first = columns(g)[0]!;
    const used = first.reduce((s, n) => s + n.y1 - n.y0, 0) + (first.length - 1) * g.padding;
    expect(used).toBeCloseTo(400, 6);
    expect(g.padding).toBe(20);
  });

  it('reduces the padding to 2/3 of the room per gap (Plotly fork)', () => {
    const many = Array.from({ length: 10 }, (_, i) => [i, 10, 1] as const);
    const g = sankeyLayout(11, links(many), { ...OPTIONS, height: 90, nodePadding: 30 });
    expect(g.padding).toBeCloseTo((2 / 3) * (90 / 9), 9);
  });

  it('is deterministic and relaxes nodes towards their neighbours', () => {
    const input = links([
      [0, 3, 2],
      [1, 4, 5],
      [2, 3, 1],
      [2, 4, 1],
      [3, 5, 3],
      [4, 5, 6],
    ]);
    const a = sankeyLayout(6, input, OPTIONS);
    const b = sankeyLayout(6, input, OPTIONS);
    expect(a.nodes.map((n) => [n.x0, n.y0])).toEqual(b.nodes.map((n) => [n.x0, n.y0]));
    // Relaxation lowers the total link slant against the stacked start.
    const slant = (g: SankeyGraph): number =>
      g.links.reduce((s, l) => s + l.value * Math.abs(l.y0 - l.y1), 0);
    expect(slant(a)).toBeLessThan(slant(sankeyLayout(6, input, { ...OPTIONS, iterations: 0 })));
  });

  it('converges: more iterations barely move the nodes', () => {
    const input = links([
      [0, 2, 3],
      [1, 2, 2],
      [1, 3, 4],
      [2, 4, 5],
      [3, 4, 4],
    ]);
    const a = sankeyLayout(5, input, { ...OPTIONS, iterations: 300 });
    const b = sankeyLayout(5, input, { ...OPTIONS, iterations: 600 });
    a.nodes.forEach((n, i) => expect(Math.abs(n.y0 - b.nodes[i]!.y0)).toBeLessThan(0.5));
  });

  it('stacks links at their nodes, ordered by the other end', () => {
    const g = sankeyLayout(
      4,
      links([
        [0, 1, 2],
        [0, 2, 3],
        [0, 3, 1],
      ]),
      OPTIONS,
    );
    const src = g.nodes[0]!;
    const order = src.sourceLinks.map((l) => l.target.index);
    const targetsTopDown = [1, 2, 3].sort((a, b) => g.nodes[a]!.y0 - g.nodes[b]!.y0);
    expect(order).toEqual(targetsTopDown);
    let y = src.y0;
    for (const l of src.sourceLinks) {
      expect(l.y0).toBeCloseTo(y + l.width / 2, 9);
      y += l.width;
    }
  });

  it('handles an empty graph and a single layer', () => {
    const empty = sankeyLayout(0, [], OPTIONS);
    expect(empty.nodes).toEqual([]);
    const self = sankeyLayout(1, links([[0, 0, 2]]), OPTIONS);
    expect(self.layers).toBe(1);
    expect(Number.isFinite(self.nodes[0]!.x0)).toBe(true);
  });
});

describe('sankey layout: collisions', () => {
  const node = (y0: number, h: number): SankeyNode => ({ y0, y1: y0 + h }) as unknown as SankeyNode;

  it('pushes overlapping nodes down, then back up from the bottom', () => {
    const column = [node(0, 30), node(10, 30), node(80, 30)];
    resolveCollisions(column, 0, 120, 10);
    expect(column.map((n) => n.y0)).toEqual([0, 40, 80]);
    const tall = [node(50, 40), node(60, 40)];
    resolveCollisions(tall, 0, 100, 10);
    expect(tall.map((n) => [n.y0, n.y1])).toEqual([
      [10, 50],
      [60, 100],
    ]);
  });
});

describe('sankey layout: cycles', () => {
  it('marks the closing edge of each cycle at its lowest node, and self links', () => {
    expect(
      circularLinks(
        3,
        links([
          [0, 1, 1],
          [1, 2, 1],
          [2, 0, 1],
        ]),
      ),
    ).toEqual([false, false, true]);
    expect(
      circularLinks(
        2,
        links([
          [0, 0, 1],
          [0, 1, 1],
        ]),
      ),
    ).toEqual([true, false]);
    // Two cycles through node 1: 1 → 2 → 1 and 1 → 2 → 3 → 1.
    expect(
      circularLinks(
        4,
        links([
          [0, 1, 1],
          [1, 2, 1],
          [2, 1, 1],
          [2, 3, 1],
          [3, 1, 1],
        ]),
      ),
    ).toEqual([false, false, true, false, true]);
    // A backward edge that closes no cycle is a plain link.
    expect(
      circularLinks(
        3,
        links([
          [2, 0, 1],
          [2, 1, 1],
        ]),
      ),
    ).toEqual([false, false]);
  });

  it('leaves an acyclic graph once circular links are removed (property)', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 9 })
          .chain((n) =>
            fc.tuple(
              fc.constant(n),
              fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1)), { maxLength: 24 }),
            ),
          ),
        ([n, edges]) => {
          const input = edges.map(([source, target]) => ({ source, target, value: 1 }));
          const marks = circularLinks(n, input);
          const kept = input.filter((_, i) => !marks[i]);
          // Kahn's algorithm consumes every node of an acyclic graph.
          const indeg = new Array<number>(n).fill(0);
          for (const l of kept) indeg[l.target]!++;
          const queue = indeg.flatMap((d, i) => (d === 0 ? [i] : []));
          let seen = 0;
          while (queue.length > 0) {
            const u = queue.pop()!;
            seen++;
            for (const l of kept)
              if (l.source === u && --indeg[l.target]! === 0) queue.push(l.target);
          }
          expect(seen).toBe(n);
          // A marked edge always closes a cycle: its target reaches its source.
          input.forEach((l, i) => {
            if (!marks[i] || l.source === l.target) return;
            const reach = new Set([l.target]);
            let grew = true;
            while (grew) {
              grew = false;
              for (const m of input) {
                if (reach.has(m.source) && !reach.has(m.target)) {
                  reach.add(m.target);
                  grew = true;
                }
              }
            }
            expect(reach.has(l.source)).toBe(true);
          });
        },
      ),
    );
  });

  // 0 → 1 → 2 → 3, loops 3 → 1 and 2 → 2 (self), plus 2 → 0.
  const LOOPY = links([
    [0, 1, 10],
    [1, 2, 12],
    [2, 3, 8],
    [3, 1, 2],
    [2, 2, 3],
    [2, 0, 1],
  ]);

  it('routes circular links as loops beyond the node area', () => {
    const g = sankeyLayout(4, LOOPY, OPTIONS);
    expect(g.circular).toBe(true);
    const loops = g.links.filter((l) => l.circular);
    expect(loops.map((l) => [l.source.index, l.target.index])).toEqual([
      [3, 1],
      [2, 2],
      [2, 0],
    ]);
    // Circular links are left out of depths: the chain keeps its layers.
    expect(layersOf(g)).toEqual([0, 1, 2, 3]);
    for (const l of loops) {
      const p = l.path!;
      expect(p.sourceX).toBe(l.source.x1);
      expect(p.targetX).toBe(l.target.x0);
      expect(p.rightX).toBeGreaterThan(p.sourceX);
      expect(p.leftX).toBeLessThan(p.targetX);
      const nodes = [l.source, l.target];
      if (l.circularType === 'bottom') {
        expect(p.extent).toBeGreaterThanOrEqual(
          Math.max(...nodes.map((n) => n.y1)) + VERTICAL_MARGIN,
        );
      } else {
        expect(p.extent).toBeLessThanOrEqual(Math.min(...nodes.map((n) => n.y0)) - VERTICAL_MARGIN);
      }
      expect(p.rSource).toBeGreaterThanOrEqual(BASE_RADIUS + l.width / 2);
    }
    // Loops stay inside the size: room is reserved for them.
    for (const l of loops) {
      const p = l.path!;
      expect(p.extent + l.width / 2).toBeLessThanOrEqual(400 + EPS);
      expect(p.extent - l.width / 2).toBeGreaterThanOrEqual(-EPS);
    }
  });

  it('shares a node’s loop side and stacks the lanes of overlapping loops', () => {
    const g = sankeyLayout(4, LOOPY, OPTIONS);
    const [a, self, back] = g.links.filter((l) => l.circular);
    // First loop goes below; the others touch its nodes' types or alternate.
    expect(a!.circularType).toBe('bottom');
    expect(self!.circularType).toBe(back!.circularType);
    const same = g.links.filter((l) => l.circular && l.circularType === a!.circularType);
    for (let i = 0; i < same.length; i++) {
      for (let j = i + 1; j < same.length; j++) {
        const p = same[i]!;
        const q = same[j]!;
        const cross = !(p.source.layer < q.target.layer || p.target.layer > q.source.layer);
        if (!cross || p.source === p.target || q.source === q.target) continue;
        expect(Math.abs(p.path!.extent - q.path!.extent)).toBeGreaterThanOrEqual(
          (p.width + q.width) / 2 - EPS,
        );
      }
    }
  });

  it('stacks top loops, plain links and bottom loops at a node', () => {
    const g = sankeyLayout(4, LOOPY, OPTIONS);
    for (const n of g.nodes) {
      const rank = n.sourceLinks.map((l) => (!l.circular ? 1 : l.circularType === 'top' ? 0 : 2));
      expect([...rank].sort()).toEqual(rank);
    }
  });
});

describe('sankey layout: updates', () => {
  it('re-stacks links after a node moves, on a copy', () => {
    const g = sankeyLayout(
      4,
      links([
        [0, 1, 2],
        [0, 2, 2],
        [3, 1, 1],
      ]),
      OPTIONS,
    );
    const copy = cloneGraph(g);
    const before = copy.nodes[0]!.sourceLinks.map((l) => l.target.index);
    // Move the upper target below the lower one.
    const [top, bottom] = before.map((i) => copy.nodes[i]!) as [SankeyNode, SankeyNode];
    const d = bottom.y1 + 10 - top.y0;
    top.y0 += d;
    top.y1 += d;
    updateSankey(copy);
    const after = copy.nodes[0]!.sourceLinks.map((l) => l.target.index);
    expect(after).toEqual([...before].reverse());
    // The original is untouched.
    expect(g.nodes[0]!.sourceLinks.map((l) => l.target.index)).toEqual(before);
    expect(copy.links[0]!.source).toBe(copy.nodes[0]);
  });
});

describe('sankey layout: properties', () => {
  /** A random acyclic graph: links go from lower to higher node indices. */
  const dag = fc.integer({ min: 2, max: 12 }).chain((n) =>
    fc.tuple(
      fc.constant(n),
      fc.array(
        fc
          .tuple(fc.nat(n - 2), fc.nat(n - 1), fc.integer({ min: 1, max: 1000 }))
          .filter(([s, t]) => s < t),
        { minLength: 1, maxLength: 30 },
      ),
      fc.integer({ min: 100, max: 900 }),
      fc.integer({ min: 60, max: 600 }),
      fc.integer({ min: 0, max: 30 }),
    ),
  );

  it('conserves flow: link widths add up to node heights, stacked without gaps', () => {
    fc.assert(
      fc.property(dag, ([n, edges, width, height, pad]) => {
        const g = sankeyLayout(n, links(edges), {
          width,
          height,
          nodeWidth: 10,
          nodePadding: pad,
        });
        for (const node of g.nodes) {
          const check = (list: typeof node.sourceLinks, end: 'y0' | 'y1'): void => {
            let y = node.y0;
            for (const l of list) {
              expect(l.width).toBeCloseTo(l.value * g.ky, 6);
              expect(l[end]).toBeCloseTo(y + l.width / 2, 6);
              y += l.width;
            }
            expect(y).toBeLessThanOrEqual(node.y1 + 1e-6);
          };
          check(node.sourceLinks, 'y0');
          check(node.targetLinks, 'y1');
          const out = node.sourceLinks.reduce((s, l) => s + l.width, 0);
          const into = node.targetLinks.reduce((s, l) => s + l.width, 0);
          if (node.sourceLinks.length + node.targetLinks.length > 0) {
            expect(Math.max(out, into)).toBeCloseTo(node.y1 - node.y0, 6);
          }
        }
      }),
    );
  });

  /**
   * How far two nodes of a layer are from keeping `padding` between them (≤ 0 when they do),
   * whichever is on top. Not "sort by `y0`, compare neighbours": a node without links has no
   * height, and with no padding it sits exactly on the edge of the next one, so `y0` alone does
   * not say which of the two comes first.
   */
  const overlap = (a: SankeyNode, b: SankeyNode, padding: number): number =>
    Math.min(a.y1 + padding - b.y0, b.y1 + padding - a.y0);

  // Shrunk from a failure of the property below when it sorted by `y0` (fast-check seed 1, numRuns
  // 200,000): ten nodes share the last layer, eight without links. `@plotly/d3-sankey` 0.7.2 gives
  // these positions to the last digit.
  it('puts a node without height on the edge between its neighbours (no padding)', () => {
    const g = sankeyLayout(
      12,
      links([
        [1, 2, 1],
        [0, 4, 100],
      ]),
      { width: 100, height: 60, nodeWidth: 10, nodePadding: 0 },
    );
    const ky = 60 / 101;
    const edge = 100 * ky;
    const [, , small, empty, big] = g.nodes as [
      SankeyNode,
      SankeyNode,
      SankeyNode,
      SankeyNode,
      SankeyNode,
    ];
    expect(layersOf(g)).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(g.padding).toBe(0);
    expect(g.ky).toBeCloseTo(ky, 12);
    // Top to bottom: node 4 (0 … edge), node 3 (nothing, at the edge), node 2 (edge … 60).
    expect([big.y0, big.y1]).toEqual([expect.closeTo(0, 9), expect.closeTo(edge, 9)]);
    expect([empty.y0, empty.y1]).toEqual([expect.closeTo(edge, 9), expect.closeTo(edge, 9)]);
    expect([small.y0, small.y1]).toEqual([expect.closeTo(edge, 9), expect.closeTo(60, 9)]);
    // Nodes 2 and 3 start at the same y, and the lower index is the one with a height: ordering
    // by `y0` alone reads them as overlapping.
    expect(empty.y0).toBe(small.y0);
    expect(overlap(empty, small, g.padding)).toBeLessThanOrEqual(1e-6);
    expect(overlap(big, small, g.padding)).toBeLessThanOrEqual(1e-6);
    // The other nodes without links are stacked at the bottom.
    for (const node of g.nodes.slice(5)) expect([node.y0, node.y1]).toEqual([60, 60]);
  });

  it('never overlaps nodes of a layer and keeps them in the height', () => {
    fc.assert(
      fc.property(dag, ([n, edges, width, height, pad]) => {
        const g = sankeyLayout(n, links(edges), {
          width,
          height,
          nodeWidth: 10,
          nodePadding: pad,
        });
        for (const column of columns(g)) {
          for (let i = 1; i < column.length; i++) {
            for (let j = 0; j < i; j++) {
              expect(overlap(column[i]!, column[j]!, g.padding)).toBeLessThanOrEqual(1e-6);
            }
          }
          for (const node of column) {
            expect(node.y0).toBeGreaterThanOrEqual(-1e-6);
            expect(node.y1).toBeLessThanOrEqual(height + 1e-6);
            expect(node.x0).toBeGreaterThanOrEqual(-1e-6);
            expect(node.x1).toBeLessThanOrEqual(width + 1e-6);
          }
        }
      }),
    );
  });
});
