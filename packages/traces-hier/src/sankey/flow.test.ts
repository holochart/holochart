import { supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createResourceManager } from '@mk7s/holochart-render';
import { createChartRegistry } from '@mk7s/holochart-runtime';
import fc from 'fast-check';
import { Mesh } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  centerLine,
  createFlowParticles,
  particleCount,
  particleSeed,
  resample,
  SAMPLES,
  type CenterLine,
} from './flow.ts';
import { outlineContains } from './geometry.ts';
import { sankey } from './index.ts';
import { buildModel, type SankeyModel } from './model.ts';

const registry = createChartRegistry().register(sankey);
/** 400 × 200 px domain at (50, 20), in a 300 px tall viewport. */
const RECT = { x: 50, y: 20, width: 400, height: 200 };
const H = 300;

function build(input: Record<string, unknown>) {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'sankey', ...input }], layout: { template: 'none' } },
    registry.core,
  );
  const trace = fullData[0] as FullTrace;
  const calc = sankey.calc!(trace, { fullLayout, index: 0, xaxis: undefined, yaxis: undefined });
  return { trace, calc, fullLayout };
}

function modelOf(input: Record<string, unknown>): SankeyModel {
  const { trace, calc, fullLayout } = build(input);
  return buildModel(calc, trace, fullLayout, RECT);
}

/** A → C, B → C, C → D, C → E. */
const BASIC = {
  node: { label: ['A', 'B', 'C', 'D', 'E'] },
  link: { source: [0, 1, 2, 2], target: [2, 2, 3, 4], value: [4, 2, 5, 1], flow: {} },
};
/** A → B → C with a loop C → B, and an arrowhead on every link. */
const LOOP = {
  node: { label: ['A', 'B', 'C'] },
  link: { source: [0, 1, 2], target: [1, 2, 1], value: [5, 6, 2], arrowlen: 8, flow: {} },
};

/** Position along a link (0…1) of a particle with `phase` moving at `rate` links per second. */
const particlePhase = (phase: number, rate: number, time: number): number =>
  (((phase + time * rate) % 1) + 1) % 1;

/**
 * World position of a particle `u` (0…1) along link slot `slot` of resampled `paths` and `lane`
 * (−1…1) across it: the vertex shader's placement, on the CPU.
 */
function particleAt(paths: Float32Array, slot: number, u: number, lane: number): [number, number] {
  const f = Math.min(1, Math.max(0, u)) * (SAMPLES - 1);
  const i = Math.min(Math.floor(f), SAMPLES - 2);
  const t = f - i;
  const a = (slot * SAMPLES + i) * 4;
  const at = (c: number): number => paths[a + c]! + (paths[a + 4 + c]! - paths[a + c]!) * t;
  return [at(0) + at(2) * lane, at(1) + at(3) * lane];
}

/** Resampled center lines of every link of `model`. */
function pathsOf(model: SankeyModel): { paths: Float32Array; lengths: number[] } {
  const paths = new Float32Array(model.links.length * SAMPLES * 4);
  const lengths = model.links.map((_, k) =>
    resample(centerLine(model, k, H), SAMPLES, paths, k * SAMPLES * 4),
  );
  return { paths, lengths };
}

/** A link's ribbon in world px (the model's outline is in container px). */
function ribbon(model: SankeyModel, k: number) {
  const o = model.links[k]!.outline;
  return { x: o.x, y: o.y.map((y) => H - y) };
}

describe('sankey flow particles: defaults', () => {
  it('coerces link.flow only when given, so particles stay off by default', () => {
    const link = (input: Record<string, unknown>) =>
      build(input).trace['link'] as Record<string, unknown>;
    expect(link({ ...BASIC, link: { ...BASIC.link, flow: undefined } })).not.toHaveProperty('flow');
    expect(link(BASIC)['flow']).toEqual({ density: 2, speed: 50, size: 3, opacity: 1 });
    expect(
      link({ ...BASIC, link: { ...BASIC.link, flow: { speed: [10, 20], color: 'red', time: 1 } } })[
        'flow'
      ],
    ).toEqual({
      density: 2,
      speed: [10, 20],
      size: 3,
      color: 'rgb(255, 0, 0)',
      opacity: 1,
      time: 1,
    });
  });
});

describe('sankey flow particles: center lines', () => {
  it('runs a band from its source to its target, offsets across the flow', () => {
    const model = modelOf(BASIC);
    const g = model.graph.links[0]!;
    const line = centerLine(model, 0, H);
    const n = line.x.length;
    expect(line.x[0]).toBeCloseTo(RECT.x + g.source.x1, 9);
    expect(line.y[0]).toBeCloseTo(H - RECT.y - g.y0, 9);
    expect(line.x[n - 1]).toBeCloseTo(RECT.x + g.target.x0, 9);
    expect(line.y[n - 1]).toBeCloseTo(H - RECT.y - g.y1, 9);
    for (let i = 0; i < n; i++) {
      expect(line.ox[i]).toBe(0);
      expect(line.oy[i]).toBeCloseTo(-g.width / 2, 9);
    }
  });

  it('transposes a vertical sankey', () => {
    const model = modelOf({ ...BASIC, orientation: 'v' });
    const g = model.graph.links[0]!;
    const line = centerLine(model, 0, H);
    expect(line.x[0]).toBeCloseTo(RECT.x + g.y0, 9);
    expect(line.y[0]).toBeCloseTo(H - RECT.y - g.source.x1, 9);
    expect(line.ox[0]).toBeCloseTo(g.width / 2, 9);
    expect(line.oy[0]).toBe(-0);
  });

  it('stops at the base of an arrowhead, and follows a loop with offsets of half its width', () => {
    const model = modelOf(LOOP);
    const band = model.graph.links[0]!;
    const line = centerLine(model, 0, H);
    expect(line.x[line.x.length - 1]).toBeCloseTo(RECT.x + band.target.x0 - 8, 9);
    const k = model.links.findIndex((l) => l.circular);
    const g = model.graph.links[k]!;
    const loop = centerLine(model, k, H);
    const n = loop.x.length;
    expect(loop.x[0]).toBeCloseTo(RECT.x + g.path!.sourceX, 9);
    expect(loop.x[n - 1]).toBeCloseTo(RECT.x + g.path!.targetX - 8, 9);
    expect(loop.y[n - 1]).toBeCloseTo(H - RECT.y - g.path!.targetY, 9);
    for (let i = 0; i < n; i++) {
      expect(Math.hypot(loop.ox[i]!, loop.oy[i]!)).toBeCloseTo(g.width / 2, 6);
    }
  });
});

describe('sankey flow particles: arc-length resampling', () => {
  it('spaces samples evenly along a polyline, ends included', () => {
    const line: CenterLine = { x: [0, 30, 30], y: [0, 0, 40], ox: [0, 0, 2], oy: [1, 1, 1] };
    const out = new Float32Array(11 * 4);
    expect(resample(line, 11, out)).toBe(70);
    const at = (i: number) => [out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]];
    expect(at(0)).toEqual([0, 0, 0, 1]);
    expect(at(3)).toEqual([21, 0, 0, 1]);
    // 35 px: 5 px past the corner, the offset interpolated along the second segment.
    expect(at(5)).toEqual([30, 5, 0.25, 1]);
    expect(at(10)).toEqual([30, 40, 2, 1]);
  });

  it('keeps consecutive samples one step apart on every center line (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 40 }), { minLength: 3, maxLength: 3 }),
        fc.boolean(),
        (values, vertical) => {
          const model = modelOf({
            ...LOOP,
            orientation: vertical ? 'v' : 'h',
            link: { ...LOOP.link, value: values },
          });
          const { paths, lengths } = pathsOf(model);
          lengths.forEach((length, k) => {
            const step = length / (SAMPLES - 1);
            for (let i = 1; i < SAMPLES; i++) {
              const a = (k * SAMPLES + i - 1) * 4;
              const d = Math.hypot(paths[a + 4]! - paths[a]!, paths[a + 5]! - paths[a + 1]!);
              // A chord across a corner of the polyline is a little shorter than the arc step.
              expect(d).toBeLessThanOrEqual(step + 1e-3);
              expect(d).toBeGreaterThan(step * 0.9);
            }
          });
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('sankey flow particles: placement and motion', () => {
  it('keeps particles inside their ribbons, bands and loops (property)', () => {
    const models = [modelOf(BASIC), modelOf(LOOP), modelOf({ ...LOOP, orientation: 'v' })];
    const all = models.map((m) => ({ model: m, ...pathsOf(m) }));
    fc.assert(
      fc.property(
        fc.nat({ max: all.length - 1 }),
        fc.nat(),
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        fc.double({ min: -0.9, max: 0.9, noNaN: true }),
        (m, k0, u, lane) => {
          const { model, paths } = all[m]!;
          const k = k0 % model.links.length;
          const [x, y] = particleAt(paths, k, u, lane);
          expect(outlineContains(ribbon(model, k), x, y)).toBe(true);
        },
      ),
    );
  });

  it('counts density particles per 100 px for every 10 px of width, one lane at least', () => {
    expect(particleCount(1, 200, 5)).toBe(2);
    expect(particleCount(1, 200, 10)).toBe(2);
    expect(particleCount(1, 200, 40)).toBe(8);
    expect(particleCount(2.5, 200, 40)).toBe(20);
    expect(particleCount(0.01, 50, 2)).toBe(1);
    expect(particleCount(0, 200, 40)).toBe(0);
    expect(particleCount(1, 0, 40)).toBe(0);
    expect(particleCount(1e6, 1000, 100)).toBe(4096);
  });

  it('spreads particles evenly along and across a link, whatever their count', () => {
    const seeds = Array.from({ length: 200 }, (_, j) => particleSeed(3, j));
    for (const [phase, lane] of seeds) {
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
      expect(Math.abs(lane)).toBeLessThanOrEqual(1);
    }
    // Every tenth of the link and every fifth of its width gets its share (R2 sequence).
    const along = new Array<number>(10).fill(0);
    const across = new Array<number>(5).fill(0);
    for (const [phase, lane] of seeds) {
      along[Math.floor(phase * 10)]!++;
      across[Math.min(4, Math.floor(((lane + 1) / 2) * 5))]!++;
    }
    for (const n of along) expect(Math.abs(n - 20)).toBeLessThanOrEqual(2);
    for (const n of across) expect(Math.abs(n - 40)).toBeLessThanOrEqual(2);
    // Other links get other patterns.
    expect(particleSeed(4, 0)).not.toEqual(particleSeed(3, 0));
  });

  it('moves particles `speed` px per second along the link (property)', () => {
    const model = modelOf(LOOP);
    const { paths, lengths } = pathsOf(model);
    fc.assert(
      fc.property(
        fc.nat({ max: 2 }),
        fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 0.2, noNaN: true }),
        (k, phase, speed, t) => {
          const length = lengths[k]!;
          const u0 = particlePhase(phase, speed / length, 0);
          const u1 = particlePhase(phase, speed / length, t);
          // The distance travelled along the link, modulo its length.
          const d = (((u1 - u0) * length) % length) + (u1 < u0 ? length : 0);
          expect(d).toBeCloseTo((speed * t) % length, 6);
          // A particle a few px on is a few px away (the samples follow the arc).
          if (speed * t < 5 && u0 + (speed * t) / length < 1) {
            const [x0, y0] = particleAt(paths, k, u0, 0);
            const [x1, y1] = particleAt(paths, k, u1, 0);
            expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThanOrEqual(speed * t + 1e-3);
          }
        },
      ),
    );
  });
});

describe('sankey flow particles: the primitive', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function particles(model: SankeyModel) {
    const context = { resources: createResourceManager(), invalidate: vi.fn() };
    const mesh = new Mesh();
    const flow = createFlowParticles(context, mesh);
    flow.update({ model, height: H, lit: new Set() });
    return { flow, mesh, context };
  }

  function stubFrames(reduced = false) {
    const frames: (() => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const listeners: (() => void)[] = [];
    const query = {
      matches: reduced,
      addEventListener: (_: string, f: () => void) => listeners.push(f),
      removeEventListener: () => undefined,
    };
    vi.stubGlobal('matchMedia', () => query);
    return { frames, query, change: () => listeners.forEach((f) => f()) };
  }

  it('draws density × size particles per link, in one instanced draw', () => {
    const model = modelOf(BASIC);
    const { flow, mesh } = particles(model);
    const { lengths } = pathsOf(model);
    const expected = model.links.reduce(
      (n, _, k) => n + particleCount(2, lengths[k]!, model.graph.links[k]!.width),
      0,
    );
    expect(flow.count).toBe(expected);
    expect(mesh.visible).toBe(true);
    expect((mesh.geometry as { instanceCount?: number }).instanceCount).toBe(expected);
    flow.dispose();
  });

  it('freezes the clock at link.flow.time, and runs it while motion is allowed', () => {
    const frames = stubFrames();
    const frozen = particles(modelOf({ ...BASIC, link: { ...BASIC.link, flow: { time: 2.5 } } }));
    expect(frozen.flow.time()).toBe(2.5);
    expect(frozen.flow.running).toBe(false);
    frozen.flow.dispose();

    const live = particles(modelOf(BASIC));
    expect(live.flow.running).toBe(true);
    expect(frames.frames.length).toBe(1);
    const t0 = live.flow.time(performance.now());
    expect(live.flow.time(performance.now() + 500)).toBeCloseTo(t0 + 0.5, 3);
    // Every frame asks for the next one and a render.
    frames.frames.shift()!();
    expect(frames.frames.length).toBe(1);
    expect(live.context.invalidate).toHaveBeenCalled();
    live.flow.dispose();
    expect(live.flow.running).toBe(false);
  });

  it('holds particles still under prefers-reduced-motion, and resumes from there', () => {
    const frames = stubFrames(true);
    const { flow } = particles(modelOf(BASIC));
    expect(flow.running).toBe(false);
    expect(frames.frames.length).toBe(0);
    expect(flow.time()).toBe(0);
    frames.query.matches = false;
    frames.change();
    expect(flow.running).toBe(true);
    frames.query.matches = true;
    frames.change();
    expect(flow.running).toBe(false);
    const still = flow.time();
    expect(flow.time(performance.now() + 10_000)).toBe(still);
    flow.dispose();
  });

  it('follows config.a11y.reducedMotion over the media query', () => {
    stubFrames(true);
    const model = modelOf(BASIC);
    const { flow } = particles(model);
    expect(flow.running).toBe(false);
    flow.update({ model, height: H, lit: new Set(), reducedMotion: false });
    expect(flow.running).toBe(true);
    flow.update({ model, height: H, lit: new Set(), reducedMotion: true });
    expect(flow.running).toBe(false);
    flow.update({ model, height: H, lit: new Set(), reducedMotion: 'auto' });
    expect(flow.running).toBe(false);
    flow.dispose();
  });

  it('does not animate particles without speed', () => {
    stubFrames();
    const { flow } = particles(modelOf({ ...BASIC, link: { ...BASIC.link, flow: { speed: 0 } } }));
    expect(flow.count).toBeGreaterThan(0);
    expect(flow.running).toBe(false);
    flow.dispose();
  });

  it('keeps particles where they are when a link changes length (a drag)', () => {
    // Frozen 3 s in, so the phase offsets matter.
    const model = modelOf({ ...BASIC, link: { ...BASIC.link, flow: { time: 3 } } });
    const { flow, mesh } = particles(model);
    /** Particle positions along their links (0…1), by link and particle of the link. */
    const phases = (motion: ArrayLike<number>) => {
      const out = new Map<number, number[]>();
      for (let p = 0; p < motion.length / 4; p++) {
        const [slot, phase, rate] = [0, 1, 2].map((c) => motion[p * 4 + c]!);
        out.set(slot!, [...(out.get(slot!) ?? []), particlePhase(phase!, rate!, 3)]);
      }
      return out;
    };
    const motion = () =>
      Array.from(mesh.geometry.getAttribute('iMotion').array).slice(0, flow.count * 4);
    const before = phases(motion());
    // Move node C down: the links from A and B get longer or shorter.
    const moved = buildModel(
      model.calc,
      model.trace,
      undefined,
      RECT,
      new Map([[2, { x0: model.graph.nodes[2]!.x0, y0: model.graph.nodes[2]!.y0 + 30 }]]),
    );
    flow.update({ model: moved, height: H, lit: new Set() });
    const after = phases(motion());
    expect(pathsOf(moved).lengths[0]).not.toBeCloseTo(pathsOf(model).lengths[0]!, 3);
    for (const [k, us] of before) {
      const vs = after.get(k)!;
      // The same particles (a longer link may add some) at the same fraction of their link.
      for (let j = 0; j < Math.min(us.length, vs.length); j++) {
        const d = Math.abs(vs[j]! - us[j]!);
        expect(Math.min(d, 1 - d)).toBeLessThan(1e-6);
      }
    }
    flow.dispose();
  });

  it('dims particles of links outside the hover highlight', () => {
    const model = modelOf({
      ...BASIC,
      link: { ...BASIC.link, color: 'rgba(255, 0, 0, 0.3)', flow: { opacity: 0.8 } },
    });
    const { flow, mesh } = particles(model);
    const colors = () =>
      (mesh.geometry.getAttribute('iColor').array as Float32Array).slice(0, flow.count * 4);
    const alphas = (c: Float32Array) => new Set(Array.from(c.filter((_, i) => i % 4 === 3)));
    expect([...colors().slice(0, 3)]).toEqual([1, 0, 0]);
    expect(alphas(colors())).toEqual(new Set([Math.fround(0.8)]));
    flow.update({ model, height: H, lit: new Set([0]) });
    expect(alphas(colors())).toEqual(new Set([Math.fround(0.8), Math.fround(0.2)]));
    flow.dispose();
  });
});
