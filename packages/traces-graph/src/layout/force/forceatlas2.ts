/**
 * The `'forceatlas2'` algorithm, after Jacomy, Venturini, Heymann and Bastian, "ForceAtlas2, a
 * Continuous Graph Layout Algorithm for Handy Network Visualization" (PLoS ONE, 2014). Written
 * from the paper's equations, on the same state, tree and pins as the spring model.
 *
 * Each tick sums a force per node and moves the node by `force × speed`:
 * - repulsion between every pair, `scalingRatio × (deg(a) + 1) × (deg(b) + 1) / distance`, through
 *   the Barnes–Hut tree: hubs push harder, so poorly connected nodes end up around them, not
 *   between them;
 * - attraction along each link, `weight × distance`, or `weight × log(1 + distance)` with
 *   `linLog`;
 * - gravity toward the center, `gravity × (deg + 1)`, times the distance with `strongGravity`;
 * - the centering, positional and group forces (`fields.ts`), each like a link to its target.
 *
 * The speed is the paper's adaptive one. A node's **swinging** is how much its force changed since
 * the last tick, its **traction** how much of it stayed; a node moves at
 * `speed / (1 + speed × √swinging)`, so one that oscillates slows down while one that travels
 * keeps going, and the global `speed` is steered to keep the total swinging at a tolerated share
 * of the total traction, rising by at most half per tick.
 *
 * Where this differs from the paper:
 * - **Cooling.** The paper's layout runs until it is stopped. Here it must come to rest on the
 *   simulation's schedule, so once `alpha` is below {@link COOL_BELOW} (from 43% of the ticks
 *   on) moves are scaled by the square of `alpha / COOL_BELOW`, down to 1/2500 at the end. Until
 *   then a few nodes keep swinging by a unit or two a tick, as they do in any ForceAtlas2.
 * - **Overlap** (`collide`). As in the paper a link stops attracting once its nodes touch (its
 *   length is measured between the outlines). Overlaps are then removed by the same collision
 *   pass as the spring model's, applied to the positions, in place of the paper's hundredfold
 *   repulsion between overlapping nodes. That repulsion is why the paper slows a sized layout to
 *   a tenth of the speed and 10 units a tick; without it the speed stays as it is.
 * - **Disconnected parts.** The paper's gravity is the same at any distance, so it holds a node
 *   without links only at `scalingRatio × Σ(deg + 1) / gravity` from the center, thousands of
 *   units beside a graph of a hundred nodes, and its strong gravity, which would hold it, curls
 *   every long path into an arc. Here each connected component is also pulled toward the center
 *   as a whole (`centerStrength`, times `deg + 1` like gravity), which holds the parts together
 *   and leaves a connected graph exactly as the paper lays it out.
 * - Close pairs are softened by `distanceMin`, as in the spring model, so coincident nodes part
 *   gently instead of being thrown.
 */
import { createFieldForces } from './fields.ts';
import { bounded, type ForceModel, type ForceState } from './state.ts';

/** Moves shrink with `alpha` below this. */
const COOL_BELOW = 0.05;

/**
 * A link pulls at most this many times as hard as the median link. Beyond it a weight says nothing
 * more about the layout (the two nodes already touch) and only makes the forces overflow.
 */
const MAX_WEIGHT = 1000;

/**
 * The global speed never exceeds this. The paper sets no limit, and at rest, where nothing swings,
 * the speed would grow by half every tick without end. Layouts in motion stay far below it.
 */
const MAX_SPEED = 1000;

export function createForceAtlas2(state: ForceState): ForceModel {
  const { n, three, x, y, z, fixX, fixY, fixZ, links, options, tree, rng, center, radius } = state;
  const { source, target, degree } = links;
  // Forces of this tick and of the last.
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const fz = new Float64Array(n);
  const lastX = new Float64Array(n);
  const lastY = new Float64Array(n);
  const lastZ = new Float64Array(n);
  const fields = createFieldForces(state);

  const mass = new Float64Array(n);
  // The tree sums `mass × (other − node) / d²`: a negative mass turns that into a push away.
  const charge = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    mass[i] = degree[i]! + 1;
    charge[i] = -mass[i]!;
  }
  const weight = new Float64Array(links.count);
  for (let k = 0; k < links.count; k++) {
    weight[k] = options.linkWeight === 'none' ? 1 : Math.min(links.weight[k]!, MAX_WEIGHT);
  }

  const theta2 = options.theta * options.theta;
  const distanceMin2 = options.distanceMin * options.distanceMin;
  const distanceMax2 = options.distanceMax * options.distanceMax;
  const { scalingRatio, gravity, strongGravity, linLog, jitterTolerance } = options;
  const sized = options.collide;

  let speed = 1;

  function forces(): void {
    if (n > 1 && scalingRatio > 0) {
      tree.build(n, x, y, z, charge, null);
      tree.accumulate(fx, fy, fz, theta2, distanceMin2, distanceMax2, rng);
      for (let i = 0; i < n; i++) {
        const k = scalingRatio * mass[i]!;
        fx[i]! *= k;
        fy[i]! *= k;
        fz[i]! *= k;
      }
    } else {
      fx.fill(0);
      fy.fill(0);
      fz.fill(0);
    }

    if (gravity > 0) {
      for (let i = 0; i < n; i++) {
        const dx = x[i]! - center[0]!;
        const dy = y[i]! - center[1]!;
        const dz = three ? z[i]! - center[2]! : 0;
        let k = gravity * mass[i]!;
        if (!strongGravity) {
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d === 0) continue;
          k /= d;
        }
        fx[i]! -= dx * k;
        fy[i]! -= dy * k;
        fz[i]! -= dz * k;
      }
    }

    for (let k = 0; k < links.count; k++) {
      const s = source[k]!;
      const t = target[k]!;
      const dx = x[s]! - x[t]!;
      const dy = y[s]! - y[t]!;
      const dz = z[s]! - z[t]!;
      let f = weight[k]!;
      if (sized || linLog) {
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // Between the outlines when nodes have a size: no pull once they touch.
        const gap = sized ? d - radius[s]! - radius[t]! : d;
        if (!(gap > 0)) continue;
        f *= (linLog ? Math.log(1 + gap) : gap) / d;
      }
      fx[s]! -= dx * f;
      fy[s]! -= dy * f;
      fz[s]! -= dz * f;
      fx[t]! += dx * f;
      fy[t]! += dy * f;
      fz[t]! += dz * f;
    }

    fields.apply(fx, fy, fz, 1, mass);

    // A held axis carries no force: it neither moves nor counts as swinging.
    for (let i = 0; i < n; i++) {
      if (fixX[i] === fixX[i]) fx[i] = 0;
      if (fixY[i] === fixY[i]) fy[i] = 0;
      if (!three || fixZ[i] === fixZ[i]) fz[i] = 0;
    }
  }

  /**
   * The global speed: the tolerated ratio of swinging to traction, `jitterTolerance × traction /
   * swinging`, each summed over the nodes weighted by `deg + 1`. It may fall at once but rises by
   * at most half per tick.
   */
  function adaptSpeed(): void {
    let swinging = 0;
    let traction = 0;
    for (let i = 0; i < n; i++) {
      const sx = fx[i]! - lastX[i]!;
      const sy = fy[i]! - lastY[i]!;
      const sz = fz[i]! - lastZ[i]!;
      const tx = fx[i]! + lastX[i]!;
      const ty = fy[i]! + lastY[i]!;
      const tz = fz[i]! + lastZ[i]!;
      swinging += mass[i]! * Math.sqrt(sx * sx + sy * sy + sz * sz);
      traction += (mass[i]! * Math.sqrt(tx * tx + ty * ty + tz * tz)) / 2;
    }
    // Nothing moves, or the sums overflowed: keep the speed.
    if (!(swinging > 0 && swinging < Infinity && traction < Infinity)) return;
    speed = Math.min((jitterTolerance * traction) / swinging, 1.5 * speed, MAX_SPEED);
  }

  return {
    step() {
      forces();
      adaptSpeed();

      const cool = Math.min(1, state.alpha / COOL_BELOW) ** 2;
      for (let i = 0; i < n; i++) {
        const sx = fx[i]! - lastX[i]!;
        const sy = fy[i]! - lastY[i]!;
        const sz = fz[i]! - lastZ[i]!;
        const swinging = Math.sqrt(sx * sx + sy * sy + sz * sz);
        const factor = (cool * speed) / (1 + speed * Math.sqrt(swinging));
        x[i]! += bounded(fx[i]! * factor);
        y[i]! += bounded(fy[i]! * factor);
        z[i]! += bounded(fz[i]! * factor);
        lastX[i] = fx[i]!;
        lastY[i] = fy[i]!;
        lastZ[i] = fz[i]!;
      }

      if (sized && n > 1) {
        for (let pass = 0; pass < options.collideIterations; pass++) {
          fx.fill(0);
          fy.fill(0);
          fz.fill(0);
          tree.build(n, x, y, z, null, radius);
          tree.separate(fx, fy, fz, state.pinned, options.collideStrength, rng);
          for (let i = 0; i < n; i++) {
            if (fixX[i] !== fixX[i]) x[i]! += fx[i]!;
            if (fixY[i] !== fixY[i]) y[i]! += fy[i]!;
            if (three && fixZ[i] !== fixZ[i]) z[i]! += fz[i]!;
          }
        }
      }
    },
  };
}
