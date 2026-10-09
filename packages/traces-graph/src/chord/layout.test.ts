import { describe, expect, it } from 'vitest';
import {
  chordLayout,
  matrixLinks,
  matrixSize,
  MAX_PAD_SHARE,
  type ChordLayout,
  type ChordLayoutInput,
} from './layout.ts';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Links as `[source, target, value]` rows. */
function input(
  nodes: number,
  rows: readonly (readonly [number, number, number])[],
  extra: Partial<ChordLayoutInput> = {},
): ChordLayoutInput {
  return {
    nodes,
    source: rows.map((r) => r[0]),
    target: rows.map((r) => r[1]),
    value: rows.map((r) => r[2]),
    ...extra,
  };
}

const span = (a: { start: number; end: number }): number => Math.abs(a.end - a.start);
const spans = (l: ChordLayout): number[] => l.arcs.map(span);
const sum = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0);

/** A → B 3, B → C 1, C → D 2, D → A 2: widths A 5, B 4, C 3, D 4. */
const RING = input(4, [
  [0, 1, 3],
  [1, 2, 1],
  [2, 3, 2],
  [3, 0, 2],
]);

describe('chordLayout arcs', () => {
  it('lays an empty input out to nothing', () => {
    const l = chordLayout(input(0, []));
    expect(l.arcs).toEqual([]);
    expect(l.groups).toEqual([]);
    expect(l.ribbons).toEqual([]);
    expect(l.total).toBe(0);
    expect(l.scale).toBe(0);
    // Nodes without links have no arc either.
    const idle = chordLayout(input(3, []));
    expect(idle.arcs).toEqual([]);
    expect(Array.from(idle.arcOf)).toEqual([-1, -1, -1]);
  });

  it('gives every node an arc as wide as its outgoing plus its incoming flow', () => {
    const l = chordLayout(RING);
    expect(l.arcs.map((a) => a.node)).toEqual([0, 1, 2, 3]);
    expect(l.arcs.map((a) => a.value)).toEqual([5, 4, 3, 4]);
    expect(l.arcs.map((a) => a.out)).toEqual([3, 1, 2, 2]);
    expect(l.arcs.map((a) => a.in)).toEqual([2, 3, 1, 2]);
    expect(l.total).toBe(16);
    spans(l).forEach((s, p) => expect(s).toBeCloseTo((l.arcs[p]!.value / 16) * TAU, 12));
    // Without padding the arcs fill the turn, from 12 o'clock clockwise.
    expect(sum(spans(l))).toBeCloseTo(TAU, 12);
    expect(l.arcs[0]!.start).toBe(0);
    expect(l.arcs[3]!.end).toBeCloseTo(TAU, 12);
    l.arcs.forEach((a, p) => p > 0 && expect(a.start).toBeCloseTo(l.arcs[p - 1]!.end, 12));
    expect(l.direction).toBe(1);
  });

  it('takes the padding out of the turn and keeps the spans proportional', () => {
    const pad = 5 * DEG;
    const l = chordLayout(RING, { padAngle: pad });
    expect(sum(spans(l))).toBeCloseTo(TAU - 4 * pad, 12);
    expect(l.scale).toBeCloseTo((TAU - 4 * pad) / 16, 12);
    expect(span(l.arcs[0]!) / span(l.arcs[2]!)).toBeCloseTo(5 / 3, 12);
    l.arcs.forEach((a, p) => p > 0 && expect(a.start - l.arcs[p - 1]!.end).toBeCloseTo(pad, 12));
    // The ring is closed: the last gap ends where the first arc starts, a turn later.
    expect(l.arcs[3]!.end + pad).toBeCloseTo(TAU, 12);
  });

  it('scales padding that would take more than its share of the ring', () => {
    const l = chordLayout(RING, { padAngle: Math.PI });
    expect(sum(spans(l))).toBeCloseTo(TAU * (1 - MAX_PAD_SHARE), 12);
    expect(l.arcs[1]!.start - l.arcs[0]!.end).toBeCloseTo((TAU * MAX_PAD_SHARE) / 4, 12);
    // A single arc has no neighbour: no gap, the whole ring.
    const one = chordLayout(input(1, [[0, 0, 2]]), { padAngle: 1 });
    expect(span(one.arcs[0]!)).toBeCloseTo(TAU, 12);
    // Negative and non-numeric padding is none.
    expect(sum(spans(chordLayout(RING, { padAngle: -1 })))).toBeCloseTo(TAU, 12);
    expect(sum(spans(chordLayout(RING, { padAngle: NaN })))).toBeCloseTo(TAU, 12);
  });

  it('starts at the rotation and runs clockwise or counterclockwise', () => {
    const cw = chordLayout(RING, { rotation: 90 * DEG });
    expect(cw.arcs[0]!.start).toBeCloseTo(Math.PI / 2, 12);
    expect(cw.arcs[0]!.end).toBeGreaterThan(cw.arcs[0]!.start);
    const ccw = chordLayout(RING, { rotation: 90 * DEG, clockwise: false });
    expect(ccw.direction).toBe(-1);
    expect(ccw.arcs[0]!.start).toBeCloseTo(Math.PI / 2, 12);
    expect(ccw.arcs[0]!.end).toBeLessThan(ccw.arcs[0]!.start);
    // The same ring, mirrored about its start.
    ccw.arcs.forEach((a, p) => {
      expect(a.start - Math.PI / 2).toBeCloseTo(-(cw.arcs[p]!.start - Math.PI / 2), 12);
      expect(a.end - Math.PI / 2).toBeCloseTo(-(cw.arcs[p]!.end - Math.PI / 2), 12);
    });
    ccw.ribbons.forEach((r, k) => {
      expect(r.sourceStart - Math.PI / 2).toBeCloseTo(
        -(cw.ribbons[k]!.sourceStart - Math.PI / 2),
        12,
      );
    });
    expect(chordLayout(RING, { rotation: NaN }).arcs[0]!.start).toBe(0);
  });

  it('sorts the arcs by index or by width', () => {
    expect(chordLayout(RING).arcs.map((a) => a.node)).toEqual([0, 1, 2, 3]);
    expect(chordLayout(RING, { sort: 'input' }).arcs.map((a) => a.node)).toEqual([0, 1, 2, 3]);
    // Widest first; equal widths keep index order.
    const byValue = chordLayout(RING, { sort: 'value' });
    expect(byValue.arcs.map((a) => a.node)).toEqual([0, 1, 3, 2]);
    expect(Array.from(byValue.arcOf)).toEqual([0, 1, 3, 2]);
    // Without groups, 'group' is index order.
    expect(chordLayout(RING, { sort: 'group' }).arcs.map((a) => a.node)).toEqual([0, 1, 2, 3]);
  });
});

describe('chordLayout groups', () => {
  /** Six nodes in a ring of links; groups b, a, b, (none), a, 10. */
  const GROUPED = input(
    6,
    [
      [0, 1, 1],
      [1, 2, 2],
      [2, 3, 3],
      [3, 4, 1],
      [4, 5, 2],
      [5, 0, 4],
    ],
    { group: [0, 1, 0, -1, 1, 2], groupNames: ['b', 'a', '10'] },
  );

  it('keeps the nodes of a group next to each other, groups by first node', () => {
    const l = chordLayout(GROUPED);
    // b (0, 2), a (1, 4), the node without a group, then 10 (5).
    expect(l.arcs.map((a) => a.node)).toEqual([0, 2, 1, 4, 3, 5]);
    expect(l.groups.map((g) => g.group)).toEqual([0, 1, 2]);
    expect(l.groups.map((g) => g.nodes)).toEqual([[0, 2], [1, 4], [5]]);
    // A group arc runs from its first node's start to its last node's end.
    for (const g of l.groups) {
      expect(g.start).toBe(l.arcs[l.arcOf[g.nodes[0]!]!]!.start);
      expect(g.end).toBe(l.arcs[l.arcOf[g.nodes.at(-1)!]!]!.end);
      expect(g.value).toBe(sum(g.nodes.map((i) => l.arcs[l.arcOf[i]!]!.value)));
    }
  });

  it('orders groups by width, and their nodes too, with sort value', () => {
    const l = chordLayout(GROUPED, { sort: 'value' });
    // Widths: node 0: 5, 1: 3, 2: 5, 3: 4, 4: 3, 5: 6. Groups: b 10, a 6, 10: 6; node 3 alone: 4.
    expect(l.arcs.map((a) => a.node)).toEqual([0, 2, 1, 4, 5, 3]);
    expect(l.groups.map((g) => g.value)).toEqual([10, 6, 6]);
  });

  it('orders groups by name with sort group: numbers first, nodes without a group last', () => {
    const l = chordLayout(GROUPED, { sort: 'group' });
    expect(l.groups.map((g) => g.group)).toEqual([2, 1, 0]);
    expect(l.arcs.map((a) => a.node)).toEqual([5, 1, 4, 0, 2, 3]);
    // Numbers by value, not as text; equal and missing names keep group order.
    const names = (groupNames: string[]): number[] =>
      chordLayout(
        input(
          4,
          [
            [0, 1, 1],
            [1, 2, 1],
            [2, 3, 1],
            [3, 0, 1],
          ],
          { group: [0, 1, 2, 3], groupNames },
        ),
        { sort: 'group' },
      ).groups.map((g) => g.group);
    expect(names(['10', '9', 'x', ''])).toEqual([1, 0, 3, 2]);
    expect(names(['b', 'b', 'a', 'a'])).toEqual([2, 3, 0, 1]);
    expect(names([])).toEqual([0, 1, 2, 3]);
  });

  it('separates blocks by the group padding and nodes of a group by the node padding', () => {
    const pad = 2 * DEG;
    const groupPad = 10 * DEG;
    const l = chordLayout(GROUPED, { padAngle: pad, groupPadAngle: groupPad });
    const gaps = l.arcs.map((a, p) =>
      p + 1 < l.arcs.length ? l.arcs[p + 1]!.start - a.end : TAU - a.end,
    );
    // Order 0, 2 | 1, 4 | 3 | 5: node gaps inside b and a, block gaps elsewhere.
    [pad, groupPad, pad, groupPad, groupPad, groupPad].forEach((g, p) =>
      expect(gaps[p]).toBeCloseTo(g, 12),
    );
    expect(sum(spans(l))).toBeCloseTo(TAU - 2 * pad - 4 * groupPad, 12);
    // The group padding defaults to the node padding, and is ignored without groups.
    const even = chordLayout(GROUPED, { padAngle: pad });
    expect(sum(spans(even))).toBeCloseTo(TAU - 6 * pad, 12);
    expect(sum(spans(chordLayout(RING, { padAngle: pad, groupPadAngle: 1 })))).toBeCloseTo(
      TAU - 4 * pad,
      12,
    );
    // One group around every node: no block boundary.
    const one = chordLayout({ ...RING, group: [0, 0, 0, 0] }, { padAngle: pad, groupPadAngle: 1 });
    expect(sum(spans(one))).toBeCloseTo(TAU - 4 * pad, 12);
    expect(one.groups).toHaveLength(1);
  });

  it('reads anything but a whole number ≥ 0 as no group', () => {
    const l = chordLayout({ ...RING, group: [0, -3, 1.5, NaN] });
    expect(l.groups.map((g) => g.nodes)).toEqual([[0]]);
    expect(l.arcs.map((a) => a.node)).toEqual([0, 1, 2, 3]);
  });
});

describe('chordLayout ribbons', () => {
  it('gives every link a span of its source and a span of its target, as wide as its value', () => {
    const l = chordLayout(RING, { padAngle: 3 * DEG });
    expect(l.ribbons.map((r) => r.link)).toEqual([0, 1, 2, 3]);
    l.ribbons.forEach((r, k) => {
      const w = RING.value[k]! * l.scale;
      expect(r.sourceEnd - r.sourceStart).toBeCloseTo(w, 12);
      expect(r.targetEnd - r.targetStart).toBeCloseTo(w, 12);
      expect(r.self).toBe(false);
      const s = l.arcs[l.arcOf[r.source]!]!;
      const t = l.arcs[l.arcOf[r.target]!]!;
      expect(r.sourceStart).toBeGreaterThanOrEqual(s.start - 1e-12);
      expect(r.sourceEnd).toBeLessThanOrEqual(s.end + 1e-12);
      expect(r.targetStart).toBeGreaterThanOrEqual(t.start - 1e-12);
      expect(r.targetEnd).toBeLessThanOrEqual(t.end + 1e-12);
    });
    // The spans on an arc tile it without overlap.
    for (const a of l.arcs) {
      const on = l.ribbons.flatMap((r) => [
        ...(r.source === a.node ? [[r.sourceStart, r.sourceEnd]] : []),
        ...(r.target === a.node ? [[r.targetStart, r.targetEnd]] : []),
      ]) as [number, number][];
      on.sort((p, q) => p[0] - q[0]);
      expect(on[0]![0]).toBeCloseTo(a.start, 12);
      expect(on.at(-1)![1]).toBeCloseTo(a.end, 12);
      on.forEach((s, p) => p > 0 && expect(s[0]).toBeCloseTo(on[p - 1]![1], 12));
    }
  });

  it('orders the ends on an arc by where their other end is', () => {
    // Node 0 links to every other node of five.
    const l = chordLayout(
      input(5, [
        [0, 1, 1],
        [0, 2, 1],
        [0, 3, 1],
        [0, 4, 1],
      ]),
    );
    const starts = l.ribbons.map((r) => r.sourceStart);
    // From the start of node 0's arc: to node 4 (the arc before it), 3, 2, then 1 (the next).
    expect(starts[3]!).toBeLessThan(starts[2]!);
    expect(starts[2]!).toBeLessThan(starts[1]!);
    expect(starts[1]!).toBeLessThan(starts[0]!);
    // The ribbon to the next arc leaves from the end of this one.
    expect(l.ribbons[0]!.sourceEnd).toBeCloseTo(l.arcs[0]!.end, 12);
    expect(l.ribbons[3]!.sourceStart).toBeCloseTo(l.arcs[0]!.start, 12);
  });

  it('nests the links between the same two nodes instead of crossing them', () => {
    const l = chordLayout(
      input(2, [
        [0, 1, 1],
        [1, 0, 2],
        [0, 1, 3],
      ]),
    );
    const at0 = l.ribbons.map((r) => (r.source === 0 ? r.sourceStart : r.targetStart));
    const at1 = l.ribbons.map((r) => (r.source === 1 ? r.sourceStart : r.targetStart));
    // Link order on node 0, the reverse on node 1.
    expect(at0[0]!).toBeLessThan(at0[1]!);
    expect(at0[1]!).toBeLessThan(at0[2]!);
    expect(at1[2]!).toBeLessThan(at1[1]!);
    expect(at1[1]!).toBeLessThan(at1[0]!);
  });

  it('sorts the ends by width or by link index when asked', () => {
    const rows = input(4, [
      [0, 3, 1],
      [0, 1, 5],
      [0, 2, 3],
    ]);
    const order = (linkSort: 'value' | 'input' | 'position'): number[] =>
      chordLayout(rows, { linkSort })
        .ribbons.map((r) => [r.link, r.sourceStart] as const)
        .sort((a, b) => a[1] - b[1])
        .map((r) => r[0]);
    expect(order('value')).toEqual([1, 2, 0]);
    expect(order('input')).toEqual([0, 1, 2]);
    expect(order('position')).toEqual([0, 2, 1]);
    // Equal widths keep link order.
    const equal = chordLayout(
      input(3, [
        [0, 2, 1],
        [0, 1, 1],
      ]),
      { linkSort: 'value' },
    );
    expect(equal.ribbons[0]!.sourceStart).toBeLessThan(equal.ribbons[1]!.sourceStart);
  });

  it('draws a self-link as one span of its arc, counted once', () => {
    const l = chordLayout(
      input(2, [
        [0, 0, 2],
        [0, 1, 2],
      ]),
    );
    // Node 0: the self-link once, and the link to node 1. Node 1: that link.
    expect(l.arcs.map((a) => a.value)).toEqual([4, 2]);
    expect(l.arcs[0]!.out).toBe(4);
    expect(l.arcs[0]!.in).toBe(2);
    const self = l.ribbons[0]!;
    expect(self.self).toBe(true);
    expect(self.targetStart).toBe(self.sourceStart);
    expect(self.targetEnd).toBe(self.sourceEnd);
    expect(self.sourceEnd - self.sourceStart).toBeCloseTo(2 * l.scale, 12);
    // It comes first on its arc, before the ribbons to other arcs.
    expect(self.sourceStart).toBeCloseTo(l.arcs[0]!.start, 12);
    expect(l.ribbons[1]!.sourceStart).toBeCloseTo(self.sourceEnd, 12);
  });

  it('skips links without a positive width or with ends that are not nodes', () => {
    const l = chordLayout(
      input(3, [
        [0, 1, 2],
        [0, 1, 0],
        [1, 2, -4],
        [1, 2, NaN],
        [2, 0, Infinity],
        [0, 3, 1],
        [-1, 0, 1],
        [0.5, 1, 1],
        [2, 2, 0],
      ]),
    );
    expect(l.ribbons.map((r) => r.link)).toEqual([0]);
    expect(l.arcs.map((a) => a.node)).toEqual([0, 1]);
    expect(l.total).toBe(4);
    // Lists of different lengths: only the links that have all three.
    const short = chordLayout({ nodes: 2, source: [0, 1], target: [1], value: [1, 1, 1] });
    expect(short.ribbons).toHaveLength(1);
    // A node count that is not a number is no nodes.
    expect(chordLayout({ nodes: NaN, source: [0], target: [0], value: [1] }).arcs).toEqual([]);
  });

  it('gives the two ends of a link their own widths with targetValue', () => {
    const l = chordLayout({
      nodes: 3,
      source: [0, 0],
      target: [1, 2],
      value: [5, 0],
      targetValue: [3, 2],
    });
    expect(l.arcs.map((a) => a.value)).toEqual([5, 3, 2]);
    const [wide, pointed] = l.ribbons;
    expect(wide!.sourceEnd - wide!.sourceStart).toBeCloseTo(5 * l.scale, 12);
    expect(wide!.targetEnd - wide!.targetStart).toBeCloseTo(3 * l.scale, 12);
    // No width at the source: the ribbon is a point there.
    expect(pointed!.sourceEnd).toBe(pointed!.sourceStart);
    expect(pointed!.targetEnd - pointed!.targetStart).toBeCloseTo(2 * l.scale, 12);
    // A link with no width at either end has no ribbon.
    const none = chordLayout({ nodes: 2, source: [0], target: [1], value: [0], targetValue: [0] });
    expect(none.ribbons).toEqual([]);
  });
});

describe('matrixLinks', () => {
  const FLOWS = [
    [1, 5, 0],
    [3, 0, 2],
    [0, 4, 6],
  ];

  it('reads a directed matrix as one link per positive cell', () => {
    const m = matrixLinks(FLOWS);
    expect(m.source).toEqual([0, 0, 1, 1, 2, 2]);
    expect(m.target).toEqual([0, 1, 0, 2, 1, 2]);
    expect(m.value).toEqual([1, 5, 3, 2, 4, 6]);
    expect(m.targetValue).toEqual(m.value);
    expect(m.cell).toEqual([0, 1, 3, 5, 7, 8]);
    expect(m.dropped).toBe(0);
  });

  it('lays a matrix out like the node and link input it stands for', () => {
    const m = matrixLinks(FLOWS);
    const fromMatrix = chordLayout({ nodes: 3, ...m }, { padAngle: 0.1 });
    const fromLinks = chordLayout(
      input(3, [
        [0, 0, 1],
        [0, 1, 5],
        [1, 0, 3],
        [1, 2, 2],
        [2, 1, 4],
        [2, 2, 6],
      ]),
      { padAngle: 0.1 },
    );
    expect(fromMatrix.arcs).toEqual(fromLinks.arcs);
    expect(fromMatrix.ribbons).toEqual(fromLinks.ribbons);
    // Arcs: row sums plus column sums, the diagonal once.
    expect(fromMatrix.arcs.map((a) => a.value)).toEqual([6 + 4 - 1, 5 + 9 - 0, 10 + 8 - 6]);
  });

  it('reads an undirected matrix as one link per pair, each end as wide as its own cell', () => {
    const m = matrixLinks(FLOWS, false);
    expect(m.source).toEqual([0, 0, 1, 2]);
    expect(m.target).toEqual([0, 1, 2, 2]);
    expect(m.value).toEqual([1, 5, 2, 6]);
    expect(m.targetValue).toEqual([1, 3, 4, 6]);
    // The pair 0–2 has no flow either way: no link.
    const l = chordLayout({ nodes: 3, ...m });
    // Arcs: the row sums, as d3's chord().
    expect(l.arcs.map((a) => a.value)).toEqual([6, 5, 10]);
    // A symmetric matrix gives bands as wide at both ends: the links of its upper triangle.
    const symmetric = matrixLinks(
      [
        [0, 2, 1],
        [2, 0, 3],
        [1, 3, 0],
      ],
      false,
    );
    expect(symmetric.targetValue).toEqual(symmetric.value);
    expect(chordLayout({ nodes: 3, ...symmetric }).ribbons).toEqual(
      chordLayout(
        input(3, [
          [0, 1, 2],
          [0, 2, 1],
          [1, 2, 3],
        ]),
      ).ribbons,
    );
  });

  it('treats missing cells as 0 and counts the cells it cannot use', () => {
    const ragged = [[0, '2', null], [1], undefined, [0, 0, 0, 7]];
    expect(matrixSize(ragged)).toBe(4);
    const m = matrixLinks(ragged);
    expect(m.source).toEqual([0, 1, 3]);
    expect(m.target).toEqual([1, 0, 3]);
    expect(m.value).toEqual([2, 1, 7]);
    expect(m.cell).toEqual([1, 4, 15]);
    const bad = matrixLinks([
      [0, -1, 'x'],
      [NaN, 0, 1],
      [{}, Infinity, ''],
    ]);
    expect(bad.value).toEqual([1]);
    expect(bad.dropped).toBe(5);
    // Undirected, a pair is kept for the direction that is usable.
    const half = matrixLinks(
      [
        [0, -1],
        [4, 0],
      ],
      false,
    );
    expect(half.value).toEqual([0]);
    expect(half.targetValue).toEqual([4]);
    expect(half.dropped).toBe(1);
    const back = matrixLinks(
      [
        [0, 4],
        ['no', 0],
      ],
      false,
    );
    expect(back.value).toEqual([4]);
    expect(back.targetValue).toEqual([0]);
    expect(back.dropped).toBe(1);
    // Typed rows work; what is not a list is an empty matrix.
    expect(matrixLinks([new Float64Array([0, 1]), new Float64Array([2, 0])]).value).toEqual([1, 2]);
    expect(matrixLinks(undefined).source).toEqual([]);
    expect(matrixLinks('ab').source).toEqual([]);
    expect(matrixSize(7)).toBe(0);
  });
});
