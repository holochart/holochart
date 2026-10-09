/**
 * The forces that pull a node toward a place rather than toward or away from another node, shared
 * by both algorithms:
 * - centering: each connected component is pulled toward the center as a whole, every node of it
 *   by the same amount, the offset of the component's centroid. This keeps disconnected parts
 *   together without bending or squeezing any of them, which a pull on each node by its own
 *   distance does (it curls a long path into an arc). A component with a node held along an axis
 *   is held already, and is not pulled along it;
 * - the positional forces along x, y and z (d3's `forceX`/`forceY`: toward one value or a target
 *   per node);
 * - the group force (toward the centroid of the node's group).
 *
 * Each adds `(target − position) × strength × scale` to the arrays it is given: velocities and
 * `scale = alpha` for the spring model, forces and `scale = 1` for ForceAtlas2, where it then acts
 * like a link of that weight to the target.
 */
import type { ForceState } from './state.ts';

function pull(
  out: Float64Array,
  position: Float64Array,
  target: Float64Array | null,
  k: number,
  n: number,
): void {
  if (!target || k === 0) return;
  for (let i = 0; i < n; i++) {
    const t = target[i]!;
    if (t === t) out[i]! += (t - position[i]!) * k;
  }
}

export interface FieldForces {
  /**
   * Add the centering, positional and group forces at the current positions. With `mass`, the
   * centering pull on a node is multiplied by its mass (ForceAtlas2's gravity is, too).
   */
  apply(
    outX: Float64Array,
    outY: Float64Array,
    outZ: Float64Array,
    scale: number,
    mass?: Float64Array,
  ): void;
}

export function createFieldForces(state: ForceState): FieldForces {
  const { n, three, x, y, z, fixX, fixY, fixZ, options, group, groups, center } = state;
  const grouped = group !== null && groups > 0 && options.groupStrength > 0;
  const sumX = new Float64Array(grouped ? groups : 0);
  const sumY = new Float64Array(grouped ? groups : 0);
  const sumZ = new Float64Array(grouped ? groups : 0);
  const size = new Float64Array(grouped ? groups : 0);

  // Per component: summed positions, node count and whether a node is held along each axis.
  const { component, components } = state.links;
  const partX = new Float64Array(components);
  const partY = new Float64Array(components);
  const partZ = new Float64Array(components);
  const partSize = new Float64Array(components);
  const heldX = new Uint8Array(components);
  const heldY = new Uint8Array(components);
  const heldZ = new Uint8Array(components);

  function centering(
    outX: Float64Array,
    outY: Float64Array,
    outZ: Float64Array,
    k: number,
    mass: Float64Array | undefined,
  ): void {
    partX.fill(0);
    partY.fill(0);
    partZ.fill(0);
    partSize.fill(0);
    heldX.fill(0);
    heldY.fill(0);
    heldZ.fill(0);
    for (let i = 0; i < n; i++) {
      const c = component[i]!;
      partX[c]! += x[i]!;
      partY[c]! += y[i]!;
      partZ[c]! += z[i]!;
      partSize[c]!++;
      if (fixX[i] === fixX[i]) heldX[c] = 1;
      if (fixY[i] === fixY[i]) heldY[c] = 1;
      if (fixZ[i] === fixZ[i]) heldZ[c] = 1;
    }
    for (let i = 0; i < n; i++) {
      const c = component[i]!;
      const count = partSize[c]!;
      const f = mass ? k * mass[i]! : k;
      if (heldX[c] === 0) outX[i]! += (center[0]! - partX[c]! / count) * f;
      if (heldY[c] === 0) outY[i]! += (center[1]! - partY[c]! / count) * f;
      if (three && heldZ[c] === 0) outZ[i]! += (center[2]! - partZ[c]! / count) * f;
    }
  }

  return {
    apply(outX, outY, outZ, scale, mass) {
      if (options.centerStrength > 0) {
        centering(outX, outY, outZ, options.centerStrength * scale, mass);
      }
      pull(outX, x, options.xTarget, options.xStrength * scale, n);
      pull(outY, y, options.yTarget, options.yStrength * scale, n);
      if (three) pull(outZ, z, options.zTarget, options.zStrength * scale, n);
      if (!grouped) return;

      sumX.fill(0);
      sumY.fill(0);
      sumZ.fill(0);
      size.fill(0);
      for (let i = 0; i < n; i++) {
        const g = group[i]!;
        if (g < 0 || g >= groups) continue;
        sumX[g]! += x[i]!;
        sumY[g]! += y[i]!;
        sumZ[g]! += z[i]!;
        size[g]!++;
      }
      const k = options.groupStrength * scale;
      for (let i = 0; i < n; i++) {
        const g = group[i]!;
        if (g < 0 || g >= groups) continue;
        const count = size[g]!;
        outX[i]! += (sumX[g]! / count - x[i]!) * k;
        outY[i]! += (sumY[g]! / count - y[i]!) * k;
        outZ[i]! += (sumZ[g]! / count - z[i]!) * k;
      }
    },
  };
}
