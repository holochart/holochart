/**
 * Where the nodes start: a fixed pattern by node index, so a layout never depends on chance.
 *
 * - 2D: the phyllotaxis spiral d3-force starts from. Node `i` sits at radius `r × √(i + ½)` and
 *   angle `i × golden angle`: an even disc that grows outwards.
 * - 3D: a ball. Node `i` sits at radius `r × ∛(i + ½)`, in a direction from a low-discrepancy
 *   sequence on the sphere (height `1 − 2 × frac((i + ½) / ρ)`, azimuth `i × 2π / ρ²`, ρ the
 *   plastic number): an even ball that grows outwards.
 *
 * The angles' sines and cosines come from rotating a unit vector by the fixed step, not from
 * `Math.sin` and `Math.cos`, which may differ in the last bit between engines (see `math.ts`).
 *
 * A coordinate the figure gives is kept; the pattern fills the others.
 */
import { cubeRoot } from './math.ts';
import type { ForceState } from './state.ts';

/** cos and sin of the golden angle, π × (3 − √5). */
const GOLDEN_COS = -0.7373688780783197;
const GOLDEN_SIN = 0.6754902942615238;
/** 1 / ρ, and cos and sin of 2π / ρ², for the plastic number ρ = 1.3247…. */
const PLASTIC_INVERSE = 0.7548776662466927;
const PLASTIC_COS = -0.9052538583630299;
const PLASTIC_SIN = -0.4248711003573289;

export function placeStart(state: ForceState): void {
  const { n, three, x, y, z, fixX, fixY, fixZ, center } = state;
  const r = state.options.initialRadius;
  const stepCos = three ? PLASTIC_COS : GOLDEN_COS;
  const stepSin = three ? PLASTIC_SIN : GOLDEN_SIN;
  let cos = 1;
  let sin = 0;
  for (let i = 0; i < n; i++) {
    let px: number;
    let py: number;
    let pz = 0;
    if (three) {
      const radius = r * cubeRoot(i + 0.5);
      const u = (i + 0.5) * PLASTIC_INVERSE;
      const height = 1 - 2 * (u - Math.floor(u));
      const ring = Math.sqrt(Math.max(0, 1 - height * height));
      px = radius * ring * cos;
      py = radius * ring * sin;
      pz = radius * height;
    } else {
      const radius = r * Math.sqrt(i + 0.5);
      px = radius * cos;
      py = radius * sin;
    }
    const hx = fixX[i]!;
    const hy = fixY[i]!;
    const hz = fixZ[i]!;
    x[i] = hx === hx ? hx : center[0]! + px;
    y[i] = hy === hy ? hy : center[1]! + py;
    z[i] = !three ? 0 : hz === hz ? hz : center[2]! + pz;
    const next = cos * stepCos - sin * stepSin;
    sin = sin * stepCos + cos * stepSin;
    cos = next;
  }
}
