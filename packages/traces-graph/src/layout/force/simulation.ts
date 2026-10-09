/**
 * The force simulation (backlog G2, ADR-029): a {@link LayoutSimulation} over a
 * {@link LayoutGraph}, stepped by one of two algorithms (`spring.ts`, `forceatlas2.ts`) in two or
 * three dimensions.
 *
 * What is the same for both algorithms lives here: the start positions, the pins, and `alpha`,
 * the measure of how far the layout is from rest. `alpha` starts at 1 and is multiplied by
 * `1 − alphaDecay` before each tick; the simulation is at rest, and {@link LayoutSimulation.tick}
 * returns `false`, once it is below `alphaMin`.
 *
 * Deterministic: positions depend on the graph and the options alone. There is no `Math.random`
 * (a seeded generator parts coincident nodes), no clock, and no arithmetic beyond `+ − × ÷ √`
 * (`math.ts`), except `Math.log` in ForceAtlas2's `linLog` mode.
 */
import type { LayoutGraph, LayoutSimulation } from '../types.ts';
import { createForceAtlas2 } from './forceatlas2.ts';
import { prepareLinks } from './links.ts';
import { Lcg, nthRoot } from './math.ts';
import { resolveOptions, type ForceOptions, type ResolvedForceOptions } from './options.ts';
import { createSpring } from './spring.ts';
import { placeStart } from './start.ts';
import type { ForceState } from './state.ts';
import { BarnesHutTree } from './tree.ts';

/** A finite coordinate holds the node; anything else leaves it free. */
function held(values: ArrayLike<number> | undefined, i: number): number {
  const v = values?.[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
}

/** The mean of the given coordinates along an axis, 0 when none is given. */
function meanHeld(fix: Float64Array): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < fix.length; i++) {
    const v = fix[i]!;
    if (v === v) {
      // A running mean, so coordinates near the largest double do not overflow the sum.
      count++;
      sum += (v - sum) / count;
    }
  }
  return sum;
}

/** A simulation and what {@link forceLayout} needs to know about it. */
export interface ForceEngine {
  readonly simulation: LayoutSimulation;
  readonly state: ForceState;
  readonly options: ResolvedForceOptions;
}

export function createForceEngine(
  graph: LayoutGraph,
  forceOptions: ForceOptions = {},
): ForceEngine {
  const options = resolveOptions(graph, forceOptions);
  const n = Math.max(0, Math.floor(graph.nodes));
  const three = options.three;

  const fixX = new Float64Array(n);
  const fixY = new Float64Array(n);
  const fixZ = new Float64Array(n);
  const pinned = new Uint8Array(n);
  const radius = new Float64Array(n);
  const setPinned = (i: number): void => {
    const all = fixX[i] === fixX[i] && fixY[i] === fixY[i] && (!three || fixZ[i] === fixZ[i]);
    pinned[i] = all ? 1 : 0;
  };
  for (let i = 0; i < n; i++) {
    fixX[i] = held(graph.x, i);
    fixY[i] = held(graph.y, i);
    fixZ[i] = three ? held(graph.z, i) : NaN;
    setPinned(i);
    const w = graph.halfWidth[i];
    const h = graph.halfHeight[i];
    const extent = Math.max(w !== undefined && w > 0 ? w : 0, h !== undefined && h > 0 ? h : 0);
    radius[i] = (extent < Infinity ? extent : 0) + options.collidePadding / 2;
  }

  const center = new Float64Array(3);
  const given = options.center;
  center[0] = given[0] === given[0] ? given[0] : meanHeld(fixX);
  center[1] = given[1] === given[1] ? given[1] : meanHeld(fixY);
  center[2] = !three ? 0 : given[2] === given[2] ? given[2] : meanHeld(fixZ);

  const groups = graph.group ? Math.max(0, Math.floor(graph.groups ?? 0)) : 0;
  const state: ForceState = {
    n,
    three,
    options,
    x: new Float64Array(n),
    y: new Float64Array(n),
    z: new Float64Array(n),
    fixX,
    fixY,
    fixZ,
    pinned,
    links: prepareLinks(graph),
    group: graph.group && groups > 0 ? Int32Array.from(graph.group) : null,
    groups,
    radius,
    center,
    tree: new BarnesHutTree(three ? 3 : 2),
    rng: new Lcg(options.seed),
    alpha: 1,
  };
  placeStart(state);
  const model =
    options.algorithm === 'forceatlas2' ? createForceAtlas2(state) : createSpring(state);
  // Aimed a billionth below `alphaMin`, so rounding cannot leave `alpha` a hair above it after the
  // last tick and cost one more.
  const alphaDecay =
    options.alphaDecay ?? 1 - nthRoot(options.alphaMin * (1 - 1e-9), options.ticks);

  const hold = (fix: Float64Array, position: Float64Array, i: number, v: number | undefined) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      fix[i] = v;
      position[i] = v;
    } else {
      fix[i] = NaN;
    }
  };

  const simulation: LayoutSimulation = {
    x: state.x,
    y: state.y,
    ...(three ? { z: state.z } : {}),
    get alpha() {
      return state.alpha;
    },
    tick(steps = 1) {
      for (let k = 0; k < steps; k++) {
        if (state.alpha < options.alphaMin) return false;
        state.alpha -= state.alpha * alphaDecay;
        model.step();
      }
      return state.alpha >= options.alphaMin;
    },
    reheat(alpha = 0.3) {
      if (alpha > state.alpha) state.alpha = Math.min(1, alpha);
    },
    pin(i, x, y, z) {
      if (!(Number.isInteger(i) && i >= 0 && i < n)) return;
      hold(fixX, state.x, i, x);
      hold(fixY, state.y, i, y);
      if (three) hold(fixZ, state.z, i, z);
      setPinned(i);
    },
    unpin(i) {
      if (!(Number.isInteger(i) && i >= 0 && i < n)) return;
      fixX[i] = NaN;
      fixY[i] = NaN;
      fixZ[i] = NaN;
      pinned[i] = 0;
    },
  };
  return { simulation, state, options };
}

/**
 * A force simulation of `graph`, at its start positions and `alpha` 1. Step it with `tick`; drag a
 * node with `pin` and `reheat`. `x`, `y` (and `z` with `dimensions: 3`) are its own arrays, updated
 * in place.
 */
export function createForceSimulation(
  graph: LayoutGraph,
  options: ForceOptions = {},
): LayoutSimulation {
  return createForceEngine(graph, options).simulation;
}
