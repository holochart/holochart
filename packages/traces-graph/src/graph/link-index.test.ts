import { describe, expect, it } from 'vitest';
import { buildLinkGeometry, distanceToLink, type LinkGeometry } from './geometry.ts';
import { buildLinkIndex } from './link-index.ts';

/** A seeded generator of numbers in [0, 1). */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** The geometry of a random graph: straight links, curved ones, or links with long routes. */
function geometryOf(
  nodes: number,
  links: number,
  seed: number,
  shape: 'straight' | 'curved' | 'local' = 'straight',
  scale: readonly [number, number] = [1, 1],
): LinkGeometry {
  const next = random(seed);
  const x = Float64Array.from({ length: nodes }, () => next() * 1000);
  const y = Float64Array.from({ length: nodes }, () => next() * 600);
  const source = new Int32Array(links);
  const target = new Int32Array(links);
  for (let k = 0; k < links; k++) {
    const a = Math.floor(next() * nodes);
    // Local links join nodes that are close in index and, here, anywhere in space: sort first.
    const b =
      shape === 'local'
        ? Math.min(nodes - 1, a + 1 + Math.floor(next() * 3))
        : Math.floor(next() * nodes);
    source[k] = a;
    target[k] = b === a ? (a + 1) % nodes : b;
  }
  if (shape === 'local') {
    // Nodes along a path that wanders: neighbours in index are neighbours in space.
    for (let i = 1; i < nodes; i++) {
      x[i] = Math.min(1000, Math.max(0, x[i - 1]! + (next() - 0.5) * 30));
      y[i] = Math.min(600, Math.max(0, y[i - 1]! + (next() - 0.5) * 30));
    }
  }
  return buildLinkGeometry({
    x,
    y,
    hidden: new Uint8Array(nodes),
    source,
    target,
    halfWidth: new Float64Array(nodes).fill(4),
    halfHeight: new Float64Array(nodes).fill(4),
    box: false,
    curve: new Float32Array(links).fill(shape === 'curved' ? 0.25 : 0),
    loop: new Int32Array(links).fill(-1),
    arrowEnd: false,
    arrowStart: false,
    arrowSize: new Float32Array(links),
    scaleX: scale[0],
    scaleY: scale[1],
  });
}

/** The links within `reach` px of a point by measuring every one (the scan the index replaces). */
function scan(
  geometry: LinkGeometry,
  px: number,
  py: number,
  reach: number,
  transform: { scaleX: number; scaleY: number; offsetX: number; offsetY: number },
): { within: number[]; best: number; distance: number } {
  const links = geometry.offsets.length - 1;
  const within: number[] = [];
  let best = -1;
  let distance = Infinity;
  for (let k = 0; k < links; k++) {
    const d2 = distanceToLink(geometry, k, px, py, transform);
    if (d2 > reach * reach) continue;
    within.push(k);
    const d = Math.sqrt(d2);
    if (d < distance || (d === distance && k > best)) {
      distance = d;
      best = k;
    }
  }
  return { within, best, distance };
}

const CASES = [
  ['a hairball of long links', 300, 4000, 'straight', [1, 1]],
  ['short links', 3000, 6000, 'local', [1, 1]],
  ['curved links', 400, 1500, 'curved', [1, 1]],
  ['axes of very different scales', 500, 2500, 'straight', [0.02, 37]],
  ['a reversed axis', 500, 2500, 'straight', [-2, 1.5]],
] as const;

describe('buildLinkIndex', () => {
  for (const [name, nodes, links, shape, scale] of CASES) {
    it(`finds every link within reach of a point, as measuring each does: ${name}`, () => {
      const geometry = geometryOf(nodes, links, 7, shape, scale);
      const index = buildLinkIndex(geometry);
      const transform = { scaleX: scale[0], scaleY: scale[1], offsetX: 13, offsetY: -4 };
      const next = random(99);
      let hits = 0;
      for (let q = 0; q < 400; q++) {
        // In linear coordinates anywhere in the box, and a little outside.
        const xl = (next() * 1.1 - 0.05) * 1000;
        const yl = (next() * 1.1 - 0.05) * 600;
        const px = xl * transform.scaleX + transform.offsetX;
        const py = yl * transform.scaleY + transform.offsetY;
        const reach = 2 + next() * 10;
        const expected = scan(geometry, px, py, reach, transform);
        const near = index.near(
          xl,
          yl,
          reach / Math.abs(transform.scaleX),
          reach / Math.abs(transform.scaleY),
        );
        const candidates = new Set(near);
        // Each link once.
        expect(candidates.size).toBe(near.length);
        for (const k of expected.within) expect(candidates.has(k)).toBe(true);
        // And so the nearest link among the candidates is the nearest link.
        let best = -1;
        let distance = Infinity;
        for (const k of near) {
          const d2 = distanceToLink(geometry, k, px, py, transform);
          if (d2 > reach * reach) continue;
          const d = Math.sqrt(d2);
          if (d < distance || (d === distance && k > best)) {
            distance = d;
            best = k;
          }
        }
        expect(best).toBe(expected.best);
        if (expected.best >= 0) hits++;
      }
      // The queries were not all misses.
      expect(hits).toBeGreaterThan(20);
    });
  }

  it('looks at a small share of the links of a graph of short links', () => {
    const geometry = geometryOf(5000, 10_000, 3, 'local');
    const index = buildLinkIndex(geometry);
    let looked = 0;
    const next = random(5);
    for (let q = 0; q < 200; q++) looked += index.near(next() * 1000, next() * 600, 6, 6).length;
    // On average well under a hundredth of the links.
    expect(looked / 200).toBeLessThan(100);
  });

  it('keeps the entries of a hairball in proportion to its links', () => {
    const geometry = geometryOf(300, 20_000, 11);
    const index = buildLinkIndex(geometry);
    // A long link is in a few cells, not in hundreds.
    expect(index.entries / 20_000).toBeLessThan(40);
    expect(index.columns * index.rows).toBeGreaterThan(1);
  });

  it('answers nothing for a geometry without segments, and for a point far outside', () => {
    const empty = buildLinkIndex(geometryOf(10, 0, 1));
    expect(empty.near(0, 0, 100, 100)).toHaveLength(0);
    const index = buildLinkIndex(geometryOf(50, 200, 1));
    expect(index.near(5000, 5000, 5, 5)).toHaveLength(0);
    expect(index.near(-500, 300, 5, 5)).toHaveLength(0);
  });

  it('skips links that are not drawn', () => {
    const nodes = 20;
    const hidden = new Uint8Array(nodes);
    hidden[0] = 1;
    const geometry = buildLinkGeometry({
      x: Float64Array.from({ length: nodes }, (_, i) => i * 10),
      y: new Float64Array(nodes),
      hidden,
      source: Int32Array.from({ length: nodes - 1 }, (_, i) => i),
      target: Int32Array.from({ length: nodes - 1 }, (_, i) => i + 1),
      halfWidth: new Float64Array(nodes).fill(2),
      halfHeight: new Float64Array(nodes).fill(2),
      box: false,
      curve: new Float32Array(nodes - 1),
      loop: new Int32Array(nodes - 1).fill(-1),
      arrowEnd: false,
      arrowStart: false,
      arrowSize: new Float32Array(nodes - 1),
      scaleX: 1,
      scaleY: 1,
    });
    const index = buildLinkIndex(geometry);
    // Link 0 has a hidden end: over where it would be, only link 1 is near (it starts at x = 10).
    expect(Array.from(index.near(5, 0, 2, 2))).not.toContain(0);
    expect(Array.from(index.near(15, 0, 2, 2))).toContain(1);
  });
});
