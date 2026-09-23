/**
 * Knowing when a chart's components have settled: text glyphs typeset (SDF text is async, ADR-005)
 * and any follow-up layout pass a component requested (automargin) drawn. Visual tests and image
 * export await this before capturing.
 */
import type { Chart } from '@mk7s/holochart-runtime';

const pending = new WeakMap<Chart, Promise<unknown>>();

/** Record an update a component started on `chart` (e.g. an extra automargin layout pass). */
export function trackPending(chart: Chart, promise: Promise<unknown>): void {
  const prev = pending.get(chart);
  pending.set(chart, prev ? Promise.all([prev, promise]) : promise);
}

function textReady(chart: Chart): Promise<unknown>[] {
  const out: Promise<unknown>[] = [];
  let viewports;
  try {
    viewports = chart.three.viewports;
  } catch {
    return out;
  }
  for (const vp of viewports) {
    for (const p of vp.primitives) {
      const ready = (p as { readonly ready?: unknown }).ready;
      if (ready instanceof Promise) out.push(ready);
    }
  }
  return out;
}

/**
 * Resolves once `chart` has drawn its first frame, every follow-up pass its components requested
 * has run, and all text (tick labels, titles, legend) is typeset.
 *
 * Contract gap (reported for the runtime): `chart.ready` resolves before async text is typeset;
 * once the runtime awaits component readiness itself, this becomes `chart.ready`.
 *
 * @example
 * ```ts
 * const chart = createChart(el, figure);
 * await componentsReady(chart); // safe to screenshot / export
 * ```
 */
export async function componentsReady(chart: Chart): Promise<void> {
  await chart.ready;
  for (let i = 0; i < 8; i++) {
    const p = pending.get(chart);
    pending.delete(chart);
    if (p) await p.catch(() => undefined);
    await Promise.all(textReady(chart));
    if (!pending.has(chart)) return;
  }
}
