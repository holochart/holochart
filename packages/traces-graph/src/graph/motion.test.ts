import { createScale, supplyDefaults, type FullTrace } from '@mk7s/holochart-core';
import { createChartRegistry, type AxisInfo, type CalcContext } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { createForceRun, forceLayout } from '../layout/force/index.ts';
import type { LinkRoute } from '../layout/types.ts';
import type { GraphCalc } from './calc.ts';
import { graph } from './index.ts';
import { ForceAnimation, ticksPerFrame, type AnimationHost } from './simulate.ts';
import { ease, throughTransform, treeTween, type TweenEnd } from './tween.ts';

const registry = createChartRegistry().register(graph);

function build(input: Record<string, unknown>, axis: 'linear' | 'date' = 'linear'): GraphCalc {
  const { fullData, fullLayout } = supplyDefaults(
    { data: [{ type: 'graph', ...input }], layout: { template: 'none' } },
    registry.core,
    { onIssue: () => {} },
  );
  const info = (type: 'linear' | 'date'): AxisInfo =>
    ({ scale: createScale({ type }), type, full: {} }) as unknown as AxisInfo;
  const ctx: CalcContext = { fullLayout, index: 0, xaxis: info(axis), yaxis: info('linear') };
  return graph.calc!(fullData[0] as FullTrace, ctx);
}

/** Two triangles joined by a link. */
const NET = {
  arrangement: 'force',
  link: { source: [0, 1, 2, 3, 4, 5, 2], target: [1, 2, 0, 4, 5, 3, 3] },
};

/** A host that keeps the frames it is asked for, to be run by hand. */
function host() {
  const shown: ({ x: number[]; y: number[] } | undefined)[] = [];
  const queue = new Map<number, () => void>();
  let ids = 0;
  const h: AnimationHost = {
    show: (p) => shown.push(p ? { x: Array.from(p.x), y: Array.from(p.y) } : undefined),
    requestFrame: (callback) => {
      queue.set(++ids, callback);
      return ids;
    },
    cancelFrame: (id) => queue.delete(id),
  };
  /** Run the frame that is waiting; whether there was one. */
  const frame = (): boolean => {
    const next = queue.entries().next().value;
    if (!next) return false;
    queue.delete(next[0]);
    next[1]();
    return true;
  };
  const run = (): number => {
    let frames = 0;
    while (frame()) frames++;
    return frames;
  };
  return { host: h, shown, queue, frame, run };
}

describe('a force layout in steps', () => {
  it('finishes on the layout that runs in one call', () => {
    const calc = build(NET);
    const { graph: g, options } = calc.force!;
    const whole = forceLayout(g, options);
    const run = createForceRun(g, options);
    expect(run.ticks).toBe(options.ticks);
    // In uneven steps, as frames would take them.
    let more = true;
    let ticks = 0;
    while (more) {
      more = run.simulation.tick(7);
      ticks += 7;
    }
    expect(ticks).toBeGreaterThanOrEqual(run.ticks);
    expect(ticks).toBeLessThan(run.ticks + 7);
    const stepped = run.finish();
    expect(Array.from(stepped.x)).toEqual(Array.from(whole.x));
    expect(Array.from(stepped.y)).toEqual(Array.from(whole.y));
  });

  it('gives frames centered like the finished layout, without touching the simulation', () => {
    const calc = build(NET);
    const run = createForceRun(calc.force!.graph, calc.force!.options);
    run.simulation.tick(50);
    const before = Array.from(run.simulation.x);
    const x = new Float64Array(6);
    const y = new Float64Array(6);
    run.frame(x, y);
    expect(Array.from(run.simulation.x)).toEqual(before);
    // The box around the nodes (their extents included) is centered on the origin.
    const mid = (v: Float64Array) => (Math.min(...v) + Math.max(...v)) / 2;
    expect(mid(x)).toBeCloseTo(0, 9);
    expect(mid(y)).toBeCloseTo(0, 9);
    // The frame is the simulation, moved as a whole.
    expect(x[1]! - x[0]!).toBeCloseTo(run.simulation.x[1]! - run.simulation.x[0]!, 9);
  });

  it('does not center a frame along an axis a node is held on', () => {
    const calc = build({
      ...NET,
      node: { x: [100, null, null, null, null, null], y: [40, null, null, null, null, null] },
    });
    const run = createForceRun(calc.force!.graph, calc.force!.options);
    run.simulation.tick(20);
    const x = new Float64Array(6);
    const y = new Float64Array(6);
    run.frame(x, y);
    expect([x[0], y[0]]).toEqual([100, 40]);
  });
});

describe('force.simulate', () => {
  it('shows the run a few ticks a frame and ends on the calc itself', () => {
    const calc = build({ ...NET, force: { simulate: true } });
    const h = host();
    const animation = new ForceAnimation(h.host);
    expect(animation.sync(calc, true)).toBe(true);
    expect(animation.running).toBe(true);
    // Before the first frame: the start positions, a spiral around the origin.
    const start = animation.positions()!;
    expect(Math.max(...Array.from(start.x).map(Math.abs))).toBeLessThan(60);
    const frames = h.run();
    const per = ticksPerFrame(calc.force!.options.ticks);
    expect(per).toBe(4);
    expect(frames).toBe(Math.ceil(600 / per));
    expect(animation.ticks).toBe(600);
    // Every frame but the last draws positions; the last draws the calc.
    expect(h.shown).toHaveLength(frames);
    expect(h.shown.at(-1)).toBeUndefined();
    expect(h.shown.slice(0, -1).every((p) => p !== undefined)).toBe(true);
    expect(animation.running).toBe(false);
    expect(animation.positions()).toBeUndefined();
    expect(h.queue.size).toBe(0);
    // The frame before the last is the settled layout, but for the last overlaps removed.
    const last = h.shown.at(-2)!;
    for (let i = 0; i < calc.length; i++) {
      expect(last.x[i]).toBeCloseTo(calc.x[i]!, 0);
      expect(last.y[i]).toBeCloseTo(calc.y[i]!, 0);
    }
    // The nodes moved on the way: the first frame is not the last.
    expect(Math.abs(h.shown[0]!.x[0]! - last.x[0]!)).toBeGreaterThan(1);
  });

  it('is the same simulation as the static layout: frame by frame, deterministic', () => {
    const calc = build({ ...NET, force: { simulate: true } });
    const a = host();
    const b = host();
    new ForceAnimation(a.host).sync(calc, true);
    new ForceAnimation(b.host).sync(build({ ...NET, force: { simulate: true } }), true);
    a.run();
    b.run();
    expect(a.shown).toEqual(b.shown);
    // And a figure without `simulate` has the same calc.
    const still = build(NET);
    expect(Array.from(still.x)).toEqual(Array.from(calc.x));
    expect(still.layoutKey).toBe(calc.layoutKey);
  });

  it('does not restart for a calc that lays out the same', () => {
    const h = host();
    const animation = new ForceAnimation(h.host);
    const calc = build({ ...NET, force: { simulate: true } });
    animation.sync(calc, true);
    for (let k = 0; k < 10; k++) h.frame();
    const ticks = animation.ticks;
    expect(ticks).toBe(40);
    // New labels, colors and widths: a new calc with the same layout. The run goes on.
    const restyled = build({
      ...NET,
      force: { simulate: true },
      node: { label: ['a', 'b', 'c', 'd', 'e', 'f'], color: 'red' },
      link: { ...NET.link, width: 3 },
    });
    expect(restyled.layoutKey).toBe(calc.layoutKey);
    expect(animation.sync(restyled, true)).toBe(true);
    expect(animation.ticks).toBe(ticks);
    expect(h.queue.size).toBe(1);
    h.run();
    expect(animation.ticks).toBe(600);
    // Finished: the same layout again does not replay it.
    const shown = h.shown.length;
    expect(animation.sync(build({ ...NET, force: { simulate: true } }), true)).toBe(false);
    expect(h.queue.size).toBe(0);
    expect(h.shown).toHaveLength(shown);
  });

  it('restarts when what the layout reads changes', () => {
    const h = host();
    const animation = new ForceAnimation(h.host);
    animation.sync(build({ ...NET, force: { simulate: true } }), true);
    h.run();
    for (const changed of [
      { ...NET, force: { simulate: true, charge: -90 } },
      { ...NET, force: { simulate: true }, link: { source: [0, 1], target: [1, 2] } },
      { ...NET, force: { simulate: true }, node: { size: 24 } },
    ]) {
      expect(animation.sync(build(changed), true)).toBe(true);
      expect(animation.ticks).toBe(0);
      h.frame();
      expect(animation.ticks).toBe(4);
      h.run();
      expect(animation.running).toBe(false);
    }
    // A change in the middle of a run starts over, with one frame waiting, not two.
    animation.sync(build({ ...NET, force: { simulate: true, seed: 5 } }), true);
    h.frame();
    animation.sync(build({ ...NET, force: { simulate: true, seed: 6 } }), true);
    expect(animation.ticks).toBe(0);
    expect(h.queue.size).toBe(1);
  });

  it('draws the settled layout at once without motion, off, or for a large graph', () => {
    const h = host();
    const animation = new ForceAnimation(h.host);
    const calc = build({ ...NET, force: { simulate: true } });
    // Reduced motion.
    expect(animation.sync(calc, false)).toBe(false);
    expect(h.queue.size).toBe(0);
    expect(animation.positions()).toBeUndefined();
    // `simulate` off.
    expect(animation.sync(build(NET), true)).toBe(false);
    // Another arrangement.
    expect(animation.sync(build({ ...NET, arrangement: 'circular' }), true)).toBe(false);
    // Too large for the main thread: calc says so.
    const large: GraphCalc = { ...calc, force: { ...calc.force!, simulate: false } };
    expect(animation.sync(large, true)).toBe(false);
    expect(h.shown).toHaveLength(0);
  });

  it('stops when it is turned off or motion is taken away, and can start again', () => {
    const h = host();
    const animation = new ForceAnimation(h.host);
    const calc = build({ ...NET, force: { simulate: true } });
    animation.sync(calc, true);
    h.frame();
    expect(animation.sync(build(NET), true)).toBe(false);
    expect(animation.running).toBe(false);
    expect(h.queue.size).toBe(0);
    // On again: the layout was not shown to its end, so it runs.
    expect(animation.sync(calc, true)).toBe(true);
    h.frame();
    expect(animation.sync(calc, false)).toBe(false);
    expect(h.queue.size).toBe(0);
  });

  it('leaves no frame behind when the trace goes away', () => {
    const h = host();
    const animation = new ForceAnimation(h.host);
    animation.sync(build({ ...NET, force: { simulate: true } }), true);
    h.frame();
    expect(h.queue.size).toBe(1);
    animation.stop();
    expect(h.queue.size).toBe(0);
    expect(animation.running).toBe(false);
    expect(h.frame()).toBe(false);
    const shown = h.shown.length;
    animation.stop();
    expect(h.shown).toHaveLength(shown);
  });

  it('keeps the nodes of a timeline at their values in every frame', () => {
    const dates = [
      '2020-01-01',
      '2020-06-01',
      '2021-01-01',
      '2021-06-01',
      '2022-01-01',
      '2023-01-01',
    ];
    const calc = build({ ...NET, force: { simulate: true }, node: { x: dates } }, 'date');
    const h = host();
    const animation = new ForceAnimation(h.host);
    animation.sync(calc, true);
    for (let k = 0; k < 5; k++) h.frame();
    const frame = h.shown.at(-1)!;
    expect(frame.x).toEqual(dates.map((d) => Date.parse(d)));
    expect(frame.y.every(Number.isFinite)).toBe(true);
  });

  it('hands out the live simulation while it runs, for a drag to pin a node and reheat', () => {
    const h = host();
    const animation = new ForceAnimation(h.host);
    expect(animation.simulation).toBeUndefined();
    animation.sync(build({ ...NET, force: { simulate: true } }), true);
    const simulation = animation.simulation!;
    for (let k = 0; k < 100; k++) h.frame();
    simulation.pin(0, 300, 300);
    simulation.reheat(0.5);
    expect(simulation.alpha).toBe(0.5);
    h.frame();
    expect(simulation.x[0]).toBe(300);
    // `resume` asks for a frame only when none is waiting.
    animation.resume();
    expect(h.queue.size).toBe(1);
    h.run();
    expect(animation.simulation).toBeUndefined();
  });

  it('shows a run of any length in about three seconds of frames', () => {
    expect(ticksPerFrame(1)).toBe(1);
    expect(ticksPerFrame(180)).toBe(1);
    expect(ticksPerFrame(300)).toBe(2);
    expect(ticksPerFrame(600)).toBe(4);
    expect(ticksPerFrame(5000)).toBe(28);
  });
});

describe('folding and unfolding a tree', () => {
  const route = (...points: number[]): LinkRoute => ({
    kind: 'spline',
    points: Float64Array.from(points),
  });
  // A root at the origin with a child; the child has a leaf. Links: root → child, child → leaf.
  const source = Int32Array.of(0, 1);
  const target = Int32Array.of(1, 2);
  const open: TweenEnd = {
    x: Float64Array.of(0, 100, 200),
    y: Float64Array.of(0, 40, 60),
    hidden: new Uint8Array(3),
    routes: [route(0, 0, 50, 0, 50, 40, 100, 40), route(100, 40, 150, 40, 150, 60, 200, 60)],
  };
  // Folded at the child: the leaf is parked on it, and the child moved.
  const folded: TweenEnd = {
    x: Float64Array.of(0, 100, 100),
    y: Float64Array.of(0, 0, 0),
    hidden: Uint8Array.of(0, 0, 1),
    routes: [undefined, undefined],
  };

  it('starts on one tree and ends on the other', () => {
    const fold = treeTween(open, folded, source, target);
    const first = fold(0);
    expect(Array.from(first.x)).toEqual([0, 100, 200]);
    expect(Array.from(first.y)).toEqual([0, 40, 60]);
    expect(Array.from(first.fade!)).toEqual([1, 1, 1]);
    expect(Array.from(first.routes![1]!.points)).toEqual(Array.from(open.routes![1]!.points));
    const last = fold(1);
    expect(Array.from(last.x)).toEqual([0, 100, 100]);
    expect(Array.from(last.y)).toEqual([0, 0, 0]);
    // The folded node has faded away on the node that holds it.
    expect(Array.from(last.fade!)).toEqual([1, 1, 0]);
    // A node shows while it moves, at either end.
    expect(Array.from(first.hidden)).toEqual([0, 0, 0]);
  });

  it('moves every node and fades the ones that fold, in step', () => {
    const fold = treeTween(open, folded, source, target);
    const half = fold(0.5);
    expect(ease(0.5)).toBe(0.5);
    expect(Array.from(half.x)).toEqual([0, 100, 150]);
    expect(Array.from(half.y)).toEqual([0, 20, 30]);
    expect(Array.from(half.fade!)).toEqual([1, 1, 0.5]);
    // Slow at both ends.
    expect(ease(0.1)).toBeLessThan(0.1);
    expect(ease(0.9)).toBeGreaterThan(0.9);
    expect([ease(-1), ease(0), ease(1), ease(2)]).toEqual([0, 0, 1, 1]);
  });

  it('unfolds as the same run backwards', () => {
    const unfold = treeTween(folded, open, source, target);
    const first = unfold(0);
    expect(Array.from(first.x)).toEqual([0, 100, 100]);
    expect(Array.from(first.fade!)).toEqual([1, 1, 0]);
    const last = unfold(1);
    expect(Array.from(last.x)).toEqual([0, 100, 200]);
    expect(Array.from(last.fade!)).toEqual([1, 1, 1]);
    expect(Array.from(last.routes![1]!.points)).toEqual(Array.from(open.routes![1]!.points));
  });

  it('moves a route to and from the straight line where one end has none', () => {
    const fold = treeTween(open, folded, source, target);
    // Root → child at the start is a curve; at the end the straight line from (0, 0) to (100, 0).
    const end = fold(1).routes![0]!;
    expect(end.kind).toBe('spline');
    const xs = Array.from(end.points).filter((_, j) => j % 2 === 0);
    const ys = Array.from(end.points).filter((_, j) => j % 2 === 1);
    expect(xs[0]).toBe(0);
    expect(xs[3]).toBe(100);
    expect(xs[1]).toBeCloseTo(100 / 3, 9);
    expect(ys).toEqual([0, 0, 0, 0]);
    // Half way it is half way.
    const mid = fold(0.5).routes![0]!.points;
    expect(mid[3]).toBeCloseTo(0, 9);
    expect(mid[5]).toBeCloseTo(20, 9);
    expect(mid[7]).toBeCloseTo(20, 9);
  });

  it('draws straight the routes it cannot match, and nothing for nodes missing at both ends', () => {
    const other: TweenEnd = {
      ...open,
      routes: [{ kind: 'polyline', points: Float64Array.of(0, 0, 0, 40, 100, 40) }, undefined],
      hidden: Uint8Array.of(0, 0, 1),
    };
    const gone: TweenEnd = { ...folded, routes: [route(0, 0, 1, 1, 2, 2, 100, 0), undefined] };
    const tween = treeTween(other, gone, source, target)(0.3);
    // Another kind and another number of points: no route, a straight link.
    expect(tween.routes![0]).toBeUndefined();
    // The leaf is hidden at both ends: hidden throughout, and nothing fades.
    expect(tween.hidden[2]).toBe(1);
    expect(Number.isNaN(tween.x[2])).toBe(true);
    expect(tween.fade).toBeUndefined();
  });

  it('needs no routes at all', () => {
    const a: TweenEnd = { ...open, routes: undefined };
    const b: TweenEnd = { ...folded, routes: undefined };
    expect(treeTween(a, b, source, target)(0.5).routes).toBeUndefined();
  });

  it('starts from the pixels the tree was on when autorange changes the view', () => {
    // The old view: 2 px per unit. The new one: 1 px per unit, moved by 50 px.
    const was = { scaleX: 2, scaleY: 2, offsetX: 0, offsetY: 0 };
    const now = { scaleX: 1, scaleY: -1, offsetX: 50, offsetY: 300 };
    const moved = throughTransform(open, was, now);
    for (let i = 0; i < 3; i++) {
      expect(moved.x[i]! * now.scaleX + now.offsetX).toBeCloseTo(open.x[i]! * 2, 9);
      expect(moved.y[i]! * now.scaleY + now.offsetY).toBeCloseTo(open.y[i]! * 2, 9);
    }
    const p = moved.routes![1]!.points;
    expect(p[0]! * now.scaleX + now.offsetX).toBeCloseTo(200, 9);
    expect(p[1]! * now.scaleY + now.offsetY).toBeCloseTo(80, 9);
    expect(moved.hidden).toBe(open.hidden);
    // The same view: the same tree.
    expect(throughTransform(open, was, was)).toBe(open);
  });
});
