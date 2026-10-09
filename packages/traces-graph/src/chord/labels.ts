/**
 * Chord labels (backlog G8, ADR-029): where the name of every arc goes, outside its ring. Pure
 * and in container px (y down), with the layout's angles (radians clockwise from 12 o'clock); the
 * text sizes are measured by the caller, so placement is tested without a font.
 *
 * - Radial labels run along the radius from just outside the ring. On the right half they read
 *   away from the center, anchored at their start; on the left half they are turned around and
 *   anchored at their end, so no label is upside down.
 * - Tangential labels sit across the radius, centered over the middle of their arc, and are
 *   turned around on the lower half.
 * - A label is left out when it does not fit its arc: a radial one when its line is taller than
 *   the arc is long (with the gaps to its neighbours), a tangential one when it is wider than the
 *   arc as seen from the center.
 */

const TAU = Math.PI * 2;

/** Px between a ring and its labels. */
export const TEXT_PAD = 4;

export type LabelOrientation = 'radial' | 'tangential';

/** An arc to label: its span, and the size of its text. */
export interface LabelArc {
  readonly start: number;
  readonly end: number;
  /** Width and height of the text, px; a width of 0 means no label. */
  readonly width: number;
  readonly height: number;
}

/** A placed label. */
export interface LabelPlace {
  /** Index of the arc in the input. */
  readonly arc: number;
  /** The anchor point, container px. */
  readonly x: number;
  readonly y: number;
  /** Degrees clockwise on screen, between −90 and 90. */
  readonly angle: number;
  /** Which side of the text is at the anchor. */
  readonly anchor: 'left' | 'center' | 'right';
}

/** The angle between the end of arc `p` and the start of the next (the ring is closed). */
function gapAfter(arcs: readonly LabelArc[], p: number): number {
  if (arcs.length < 2) return 0;
  const a = arcs[p]!;
  const b = arcs[(p + 1) % arcs.length]!;
  const direction = a.end >= a.start ? 1 : -1;
  return ((((b.start - a.end) * direction) % TAU) + TAU) % TAU;
}

/** Degrees in (−180, 180]. */
function degrees(radians: number): number {
  const d = (((radians * 180) / Math.PI) % 360) + 360;
  const n = d % 360;
  return n > 180 ? n - 360 : n;
}

/** Whether a tangential label of `width` fits the arc of `span` radians when placed at `radius`. */
export function fitsTangential(width: number, span: number, radius: number): boolean {
  if (span >= Math.PI) return true;
  return 2 * Math.atan2(width / 2, Math.max(1e-6, radius)) <= span;
}

/**
 * Place the labels of `arcs` (in ring order) around (`cx`, `cy`), starting `TEXT_PAD` outside
 * `radius`. Arcs without text and arcs too short for theirs get none.
 */
export function placeLabels(
  arcs: readonly LabelArc[],
  cx: number,
  cy: number,
  radius: number,
  orientation: LabelOrientation,
): LabelPlace[] {
  const out: LabelPlace[] = [];
  arcs.forEach((a, p) => {
    if (!(a.width > 0 && a.height > 0)) return;
    const span = Math.abs(a.end - a.start);
    const mid = (a.start + a.end) / 2;
    const sin = Math.sin(mid);
    const cos = Math.cos(mid);
    if (orientation === 'radial') {
      const r = radius + TEXT_PAD;
      // Half of each neighbouring gap is this label's too.
      const room =
        span + (gapAfter(arcs, p) + gapAfter(arcs, (p + arcs.length - 1) % arcs.length)) / 2;
      if (a.height > room * r && room < TAU - 1e-9) return;
      const left = sin < -1e-9;
      out.push({
        arc: p,
        x: cx + r * sin,
        y: cy - r * cos,
        angle: degrees(mid - Math.PI / 2 + (left ? Math.PI : 0)),
        anchor: left ? 'right' : 'left',
      });
      return;
    }
    if (!fitsTangential(a.width, span, radius + TEXT_PAD)) return;
    const r = radius + TEXT_PAD + a.height / 2;
    const below = cos < -1e-9;
    out.push({
      arc: p,
      x: cx + r * sin,
      y: cy - r * cos,
      angle: degrees(mid + (below ? Math.PI : 0)),
      anchor: 'center',
    });
  });
  return out;
}
