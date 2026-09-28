/**
 * The drill-down transition of `sunburst` (plan E13.2), ported from plotly.js'
 * `traces/sunburst/plot.js` (`makeUpdateSliceInterpolator`, `makeExitSliceInterpolator`,
 * `interpX0X1FromParent`): where each sector starts and ends when the entry changes, matched by id.
 *
 * - Sectors drawn before move from where they were.
 * - New sectors twist in from 3 o'clock (rotation included), from whichever side of the previous
 *   entry they end on; new outer rings (with `maxdepth`) grow out of their parent's old span at
 *   the rim; a new entry disc grows from the center.
 * - Sectors that go away: those inside the new entry's old ring (its ancestors) shrink into the
 *   center, the others fold to 3 o'clock on their side; without the new entry among the old
 *   sectors (going up with `maxdepth`), they fold into their parent's new span at the rim.
 *
 * Angles are Plotly's partition angles (`x0`, `x1`), radii px; everything interpolates linearly.
 */
import type { HierNode } from '../hierarchy/build.ts';
import type { Sector } from './geometry.ts';

const TAU = Math.PI * 2;

/** A sector's geometry at one moment. */
export interface SectorState {
  readonly x0: number;
  readonly x1: number;
  readonly r0: number;
  readonly r1: number;
}

/** A sector as drawn: its node id, parent id and geometry (Plotly's `prevLookup` entries). */
export interface DrawnSector extends SectorState {
  readonly id: string;
  readonly parentId: string | undefined;
}

/** How one sector moves: `from` → `to`. */
export interface SectorTween {
  readonly from: SectorState;
  readonly to: SectorState;
}

/** A transition's plan: the new sectors (in their order) and the old ones leaving. */
export interface TweenPlan {
  /** One per new sector, in the order of `next`. */
  readonly update: readonly SectorTween[];
  /** Old sectors without a new one (by index in `prev`), to draw below the others. */
  readonly exit: readonly (SectorTween & { readonly index: number })[];
}

/** The geometry of a laid-out sector. */
export function stateOf(s: Pick<Sector, 'x0' | 'x1' | 'r0' | 'r1'>): SectorState {
  return { x0: s.x0, x1: s.x1, r0: s.r0, r1: s.r1 };
}

/** `a` → `b` at `t` (0–1). */
export function lerpState(a: SectorState, b: SectorState, t: number): SectorState {
  const l = (p: number, q: number): number => p + (q - p) * t;
  return { x0: l(a.x0, b.x0), x1: l(a.x1, b.x1), r0: l(a.r0, b.r0), r1: l(a.r1, b.r1) };
}

/**
 * Plan the transition from the sectors drawn (`prev`, with the entry drawn then, if it was drawn)
 * to the sectors of the new entry (`next`); `baseX` is the rotation in radians and `rMax` the outer
 * radius (see the module comment).
 */
export function planTween(
  prev: readonly DrawnSector[],
  prevEntryId: string | undefined,
  next: readonly Sector[],
  nextEntry: HierNode,
  baseX: number,
  rMax: number,
): TweenPlan {
  const prevById = new Map<string, DrawnSector>();
  for (const p of prev) if (!prevById.has(p.id)) prevById.set(p.id, p);
  const nextById = new Map<string, Sector>();
  for (const s of next) if (!nextById.has(s.node.id)) nextById.set(s.node.id, s);

  const hadEntry = prevEntryId !== undefined && prevById.has(prevEntryId);
  const nextX1ofPrevEntry = prevEntryId !== undefined ? nextById.get(prevEntryId)?.x1 : undefined;

  // Plotly's `interpX0X1FromParent`: a point on the parent's old span, by child index.
  const fromParent = (node: HierNode): { x0: number; x1: number } => {
    const parent = node.parent;
    const parentPrev = parent ? prevById.get(parent.id) : undefined;
    if (!parent || !parentPrev) return { x0: 0, x1: 0 };
    const ci = parent.children.indexOf(node);
    const x = parentPrev.x0 + ((parentPrev.x1 - parentPrev.x0) * ci) / parent.children.length;
    return { x0: x, x1: x };
  };

  const update = next.map((s): SectorTween => {
    const to = stateOf(s);
    const was = prevById.get(s.node.id);
    if (was) return { from: stateOf(was), to };
    if (!hadEntry) return { from: { ...to, x0: baseX, x1: baseX }, to };
    if (s.node === nextEntry) return { from: { ...to, r0: 0, r1: 0 }, to };
    if (nextX1ofPrevEntry !== undefined && nextX1ofPrevEntry !== 0) {
      const a = (s.x1 > nextX1ofPrevEntry ? TAU : 0) + baseX;
      return { from: { ...to, x0: a, x1: a }, to };
    }
    return { from: { ...fromParent(s.node), r0: rMax, r1: rMax }, to };
  });

  const entryPrev = prevById.get(nextEntry.id);
  const exit: (SectorTween & { index: number })[] = [];
  prev.forEach((p, index) => {
    if (nextById.has(p.id)) return;
    const from = stateOf(p);
    if (entryPrev) {
      const a = (p.x1 > entryPrev.x1 ? TAU : 0) + baseX;
      const to =
        p.r1 < entryPrev.r1
          ? { x0: p.x0, x1: p.x1, r0: 0, r1: 0 }
          : { x0: a, x1: a, r0: p.r0, r1: p.r1 };
      exit.push({ index, from, to });
      return;
    }
    const parent = p.parentId !== undefined ? nextById.get(p.parentId) : undefined;
    if (!parent) {
      exit.push({ index, from, to: { ...from, r0: from.r1 } });
      return;
    }
    const siblings = parent.node.children;
    const ci = Math.max(
      0,
      siblings.findIndex((c) => c.id === p.id),
    );
    const span = parent.x1 - parent.x0;
    exit.push({
      index,
      from,
      to: {
        x0: parent.x0 + (span * ci) / siblings.length,
        x1: parent.x0 + (span * (ci + 1)) / siblings.length,
        r0: rMax,
        r1: rMax,
      },
    });
  });
  return { update, exit };
}
