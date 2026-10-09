/**
 * The `'spring'` algorithm: the model of d3-force, on typed arrays and in two or three dimensions.
 * A tick adds each force's pull to the nodes' velocities, scaled by the cooling factor `alpha`,
 * then moves the nodes by their decayed velocities (velocity Verlet with unit time step and mass):
 *
 * 1. links: each spring moves its two ends toward its rest length, the end with fewer links
 *    moving more, on the positions the nodes are about to have (so springs see each other's
 *    work within a tick);
 * 2. many-body: every node repels every other with a force that falls off as `1 / distance`,
 *    summed through the Barnes–Hut tree;
 * 3. centering (each connected component is pulled, as a whole, toward the center), the
 *    positional forces and the group force (`fields.ts`);
 * 4. collision (`tree.ts`), last, so it corrects what the other forces add;
 * 5. integration: `velocity ← velocity × (1 − velocityDecay)`, `position ← position + velocity`,
 *    except along an axis a node is held on.
 */
import { createFieldForces } from './fields.ts';
import { bounded, type ForceModel, type ForceState } from './state.ts';

export function createSpring(state: ForceState): ForceModel {
  const { n, three, x, y, z, fixX, fixY, fixZ, pinned, links, options, tree, rng } = state;
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const vz = new Float64Array(n);
  // Scratch: the many-body sums, then the positions collision works on.
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const az = new Float64Array(n);
  const fields = createFieldForces(state);

  // Per link: rest length, strength and the share of the correction its higher end takes.
  const { source, target, degree } = links;
  const distance = new Float64Array(links.count);
  const strength = new Float64Array(links.count);
  const bias = new Float64Array(links.count);
  for (let k = 0; k < links.count; k++) {
    const ds = degree[source[k]!]!;
    const dt = degree[target[k]!]!;
    const w = options.linkWeight === 'none' ? 1 : links.weight[k]!;
    const base = options.linkStrength ?? 1 / Math.min(ds, dt);
    strength[k] = Math.min(1, options.linkWeight === 'strength' ? base * w : base);
    distance[k] =
      options.linkWeight === 'distance'
        ? options.linkDistance * Math.min(4, Math.max(0.25, 1 / w))
        : options.linkDistance;
    bias[k] = ds / (ds + dt);
  }

  const charge = new Float64Array(n).fill(options.chargeStrength);
  const theta2 = options.theta * options.theta;
  const distanceMin2 = options.distanceMin * options.distanceMin;
  const distanceMax2 = options.distanceMax * options.distanceMax;
  const decay = 1 - options.velocityDecay;

  function linkForce(alpha: number): void {
    for (let k = 0; k < links.count; k++) {
      const s = source[k]!;
      const t = target[k]!;
      let dx = x[t]! + vx[t]! - x[s]! - vx[s]!;
      let dy = y[t]! + vy[t]! - y[s]! - vy[s]!;
      let dz = z[t]! + vz[t]! - z[s]! - vz[s]!;
      let l = dx * dx + dy * dy + dz * dz;
      if (l === 0) {
        dx = rng.jiggle();
        dy = rng.jiggle();
        if (three) dz = rng.jiggle();
        l = dx * dx + dy * dy + dz * dz;
      }
      l = Math.sqrt(l);
      const f = ((l - distance[k]!) / l) * alpha * strength[k]!;
      const b = bias[k]!;
      dx *= f;
      dy *= f;
      dz *= f;
      // A held node keeps a zero velocity, so the springs after this one see it where it is.
      if (pinned[t] === 0) {
        vx[t]! -= dx * b;
        vy[t]! -= dy * b;
        vz[t]! -= dz * b;
      }
      if (pinned[s] === 0) {
        vx[s]! += dx * (1 - b);
        vy[s]! += dy * (1 - b);
        vz[s]! += dz * (1 - b);
      }
    }
  }

  return {
    step() {
      const alpha = state.alpha;
      for (let pass = 0; pass < options.linkIterations; pass++) linkForce(alpha);

      if (options.chargeStrength !== 0 && n > 1) {
        tree.build(n, x, y, z, charge, null);
        tree.accumulate(ax, ay, az, theta2, distanceMin2, distanceMax2, rng);
        for (let i = 0; i < n; i++) {
          vx[i]! += ax[i]! * alpha;
          vy[i]! += ay[i]! * alpha;
          if (three) vz[i]! += az[i]! * alpha;
        }
      }

      fields.apply(vx, vy, vz, alpha);

      if (options.collide && n > 1) {
        for (let pass = 0; pass < options.collideIterations; pass++) {
          for (let i = 0; i < n; i++) {
            ax[i] = x[i]! + vx[i]!;
            ay[i] = y[i]! + vy[i]!;
            az[i] = z[i]! + vz[i]!;
          }
          tree.build(n, ax, ay, az, null, state.radius);
          tree.separate(vx, vy, vz, pinned, options.collideStrength, rng);
        }
      }

      for (let i = 0; i < n; i++) {
        const hx = fixX[i]!;
        const hy = fixY[i]!;
        if (hx === hx) {
          x[i] = hx;
          vx[i] = 0;
        } else {
          x[i]! += vx[i] = bounded(vx[i]! * decay);
        }
        if (hy === hy) {
          y[i] = hy;
          vy[i] = 0;
        } else {
          y[i]! += vy[i] = bounded(vy[i]! * decay);
        }
        if (three) {
          const hz = fixZ[i]!;
          if (hz === hz) {
            z[i] = hz;
            vz[i] = 0;
          } else {
            z[i]! += vz[i] = bounded(vz[i]! * decay);
          }
        } else {
          vz[i] = 0;
        }
      }
    },
  };
}
