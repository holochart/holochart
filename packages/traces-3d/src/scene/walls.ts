/**
 * Which walls and edges of a scene's axis box are drawn, per camera (plan E14.1b), after gl-axes3d
 * (`lib/cube.js`, `getCubeEdges`): the walls are the three far faces, seen from inside the box, so
 * they never hide the data; each axis' ticks and labels go on an edge of the box outline, below or
 * beside it on screen.
 *
 * Box corners are numbered by bits: bit `d` set means the high side (`+a/2`) of axis `d`
 * (0: x, 1: y, 2: z). Cheap (8 corners): recomputed on every camera change.
 */

/** Screen position of a projected corner (normalized device coordinates, y up). */
export interface CornerPoint {
  readonly x: number;
  readonly y: number;
}

export interface BoxFrame {
  /** The corner nearest the camera. */
  readonly closest: number;
  /** Per axis: the side (0 low, 1 high) of its wall, the far face perpendicular to it. */
  readonly walls: readonly [0 | 1, 0 | 1, 0 | 1];
  /**
   * Per axis: the edge along it that carries its ticks and labels, as the corner at its low end
   * (the other two axes' bits give the edge; the axis' own bit is 0).
   */
  readonly edges: readonly [number, number, number];
}

/**
 * The corner nearest the camera. `toward` is the eye position (perspective) or the direction
 * towards the eye (orthographic) in scene units, the box centered at the origin: the nearest
 * corner takes, per axis, the side the eye is on.
 */
export function closestCorner(toward: readonly [number, number, number]): number {
  return (toward[0] > 0 ? 1 : 0) | (toward[1] > 0 ? 2 : 0) | (toward[2] > 0 ? 4 : 0);
}

const LOG2 = [0, 0, 1, 1, 2] as const;

/**
 * Walls and label edges for a box whose corners project to `corners` (8 points, bit-numbered),
 * seen from `closest` (see {@link closestCorner}). The label edges follow gl-axes3d: from the
 * lowest corner on screen (other than the nearest and farthest ones), the edges to its left and
 * right neighbours, and the edge up from one of those.
 */
export function boxFrame(corners: readonly CornerPoint[], closest: number): BoxFrame {
  const farthest = 7 ^ closest;
  let bottom = -1;
  for (let i = 0; i < 8; i++) {
    if (i === closest || i === farthest) continue;
    if (bottom < 0 || corners[i]!.y < corners[bottom]!.y) bottom = i;
  }
  let left = -1;
  let right = -1;
  for (let d = 0; d < 3; d++) {
    const n = bottom ^ (1 << d);
    if (n === closest || n === farthest) continue;
    if (left < 0 || corners[n]!.x < corners[left]!.x) left = n;
  }
  for (let d = 0; d < 3; d++) {
    const n = bottom ^ (1 << d);
    if (n === closest || n === farthest || n === left) continue;
    if (right < 0 || corners[n]!.x > corners[right]!.x) right = n;
  }
  const edges: [number, number, number] = [0, 0, 0];
  edges[LOG2[left ^ bottom]!] = bottom & left;
  edges[LOG2[bottom ^ right]!] = bottom & right;
  let top = right ^ 7;
  if (top === closest || top === farthest) {
    top = left ^ 7;
    edges[LOG2[right ^ top]!] = top & right;
  } else {
    edges[LOG2[left ^ top]!] = top & left;
  }
  const side = (d: number): 0 | 1 => ((closest >> d) & 1 ? 0 : 1);
  return { closest, walls: [side(0), side(1), side(2)], edges };
}
