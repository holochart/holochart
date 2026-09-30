/**
 * Shaders of the 3D line primitive (plan E14.2, `line3d.ts`): the 2D screen-space line shaders
 * (`line.glsl.ts`: joins, caps, dashes, hairlines, the exact join ownership split) with the 3D
 * parts injected at fixed anchors, so the 2D program and the 2D bundle are untouched and the joins
 * and dashes of both stay one piece of code:
 *
 * - **Near-plane clipping** in clip space (`z + w ≥ NEAR_EPS`, see `line3d-math.ts`) replaces the
 *   2D shader's `w > ε` guard: exact for perspective and orthographic cameras, and it cuts
 *   segments at the near plane rather than just in front of the eye (whose projection explodes).
 *   A cut end becomes a cap, and its color is interpolated to the cut.
 * - **Exact depth**: the 2D quad spans each segment plus its join / cap extent and the AA margin,
 *   with the end depths on its outer corners, so its linearly interpolated depth ramp was longer
 *   than the segment: the line's depth tilted through the true one by up to `(ext + aa) / len` of
 *   the segment's depth change (large for short, steep segments at grazing angles). Opaque lines
 *   write that depth, so anything at the line's depth (markers at its vertices, a plane it lies
 *   on, a crossing line) z-fought it in a sawtooth, one dash per segment (the stray "arrowheads").
 *   The 3D quad (`line3d.ts`) therefore has four more vertices, on the end points
 *   (`position.z = 1`): the depth is exact along the segment and constant over joins, caps and the
 *   AA margin, which take their end's depth (`segmentDepthAt`, `line3DQuadAlong`).
 * - **Picking** (`#define PICKING`, E2.13): each fragment writes the pick id of the nearer vertex
 *   of its segment (split where the segment's 3D midpoint projects), from the stream's source
 *   indices (`aSrcA` / `aSrcB`).
 *
 * `inject` throws when an anchor is missing, so an edit of the 2D shaders that breaks the 3D
 * variant fails the unit tests instead of producing a silently different program.
 */
import { PICK_ENCODE_GLSL } from '../picking/pick.glsl.ts';
import { LINE_FRAGMENT_SHADER, LINE_VERTEX_SHADER } from './line.glsl.ts';
import { NEAR_EPS } from './line3d-math.ts';

/** Replace the single occurrence of `anchor` in `source` (throws when absent or ambiguous). */
export function inject(source: string, anchor: string, replacement: string): string {
  const at = source.indexOf(anchor);
  if (at < 0 || source.indexOf(anchor, at + 1) >= 0) {
    throw new Error(`[holochart] line3d shader anchor not found once: ${anchor.trim()}`);
  }
  return source.slice(0, at) + replacement + source.slice(at + anchor.length);
}

const VERTEX_DECL = `in vec2 aDist;
`;
const VERTEX_CLIP = `  // Clip the segment against the near plane (perspective cameras) before the w divide.
  if (cA.w < W_EPS && cB.w < W_EPS) { cull(); return; }
  if (cA.w < W_EPS) cA = mix(cA, cB, (W_EPS - cA.w) / (cB.w - cA.w));
  if (cB.w < W_EPS) cB = mix(cB, cA, (W_EPS - cB.w) / (cA.w - cB.w));
`;
const VERTEX_PREV = `bool hasPrev = aPrev.w > 0.5;`;
const VERTEX_NEXT = `bool hasNext = aNext.w > 0.5;`;
const VERTEX_COLORS = `  vColorA = aColorA;
  vColorB = aColorB;
`;
const VERTEX_ALONG = `  float along = atB ? len + extB + aa : -(extA + aa);
`;

export const LINE3D_VERTEX_SHADER = [
  [
    VERTEX_DECL,
    `${VERTEX_DECL}
const float NEAR_EPS = ${NEAR_EPS.toExponential()};
#ifdef PICKING
in int aSrcA;
in int aSrcB;
uniform uint uPickBase;
flat out uvec2 vPickIds;
flat out float vPickSplit;
#endif
`,
  ],
  [
    VERTEX_CLIP,
    `  // Near-plane clip in clip space (z + w >= 0 is visible) before the w divide (line3d-math.ts).
  vec4 cA0 = cA;
  vec4 cB0 = cB;
  float dA = cA.z + cA.w;
  float dB = cB.z + cB.w;
  if (dA < NEAR_EPS && dB < NEAR_EPS) { cull(); return; }
  float sA = dA < NEAR_EPS ? (NEAR_EPS - dA) / (dB - dA) : 0.0;
  float sB = dB < NEAR_EPS ? (NEAR_EPS - dB) / (dA - dB) : 0.0;
  cA = mix(cA0, cB0, sA);
  cB = mix(cB0, cA0, sB);
`,
  ],
  // A cut end has no visible neighbour: it becomes a cap.
  [VERTEX_PREV, `bool hasPrev = aPrev.w > 0.5 && sA == 0.0;`],
  // The 3D quad has inner vertices on the end points (see the module comment).
  [
    VERTEX_ALONG,
    `  float along = position.z > 0.5 ? (atB ? len : 0.0) : (atB ? len + extB + aa : -(extA + aa));
`,
  ],
  [VERTEX_NEXT, `bool hasNext = aNext.w > 0.5 && sB == 0.0;`],
  [
    VERTEX_COLORS,
    `  vColorA = mix(aColorA, aColorB, sA);
  vColorB = mix(aColorB, aColorA, sB);
#ifdef PICKING
  vPickIds = uvec2(uPickBase + uint(aSrcA), uPickBase + uint(aSrcB));
  // Fragments before the projected 3D midpoint belong to A, after it to B.
  vec4 cM = 0.5 * (cA0 + cB0);
  if (cM.z + cM.w < NEAR_EPS) vPickSplit = sA > 0.0 ? -1e20 : 1e20;
  else vPickSplit = dot(hcClipToScreen(cM) - a, dir);
#endif
`,
  ],
].reduce((src, [anchor, replacement]) => inject(src, anchor!, replacement!), LINE_VERTEX_SHADER);

const FRAGMENT_DECL = `out highp vec4 fragColor;
`;
const FRAGMENT_OUT = `  fragColor = vec4(color.rgb, alpha);
`;

export const LINE3D_FRAGMENT_SHADER = [
  [
    FRAGMENT_DECL,
    `${FRAGMENT_DECL}#ifdef PICKING
precision highp int;
flat in uvec2 vPickIds;
flat in float vPickSplit;
${PICK_ENCODE_GLSL}
#endif
`,
  ],
  [
    FRAGMENT_OUT,
    `#ifdef PICKING
  // Silhouette, not appearance: any covered pixel of a visible line picks.
  fragColor = holochartEncodePickId(t < vPickSplit ? vPickIds.x : vPickIds.y);
#else
${FRAGMENT_OUT}#endif
`,
  ],
].reduce((src, [anchor, replacement]) => inject(src, anchor!, replacement!), LINE_FRAGMENT_SHADER);
