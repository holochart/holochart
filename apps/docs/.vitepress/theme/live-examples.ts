/**
 * A page-wide budget of live example embeds (`<Example>`).
 *
 * Every running example holds a WebGL context, and browsers keep only about 16 per page: past
 * that they drop the oldest, which then shows a blank or "context lost" canvas. Long pages such as
 * the demos embed more examples than that, so at most `MAX_LIVE` run at once. While over budget,
 * the live example farthest from the viewport is evicted (disposed); its embed starts again when
 * it scrolls back into view. An embed that is in or near view is never evicted: if all of them
 * are (a very tall viewport), the budget is exceeded until some scroll out (`rebalance`).
 */
export const MAX_LIVE = 12;

export interface LiveExample {
  /** The embed's root element, to measure its distance from the viewport. */
  el: HTMLElement;
  /** Whether the embed is in or near the viewport (its IntersectionObserver's last report). */
  inView(): boolean;
  /** Disposes the example and returns the embed to its idle state. */
  evict(): void;
}

const live = new Set<LiveExample>();

/** Distance from the element's middle to the viewport's middle, in CSS pixels. */
function distance(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  return Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2);
}

/** Evicts the farthest out-of-view live examples while over budget. */
export function rebalance(): void {
  while (live.size > MAX_LIVE) {
    let farthest: LiveExample | undefined;
    let farthestDistance = -1;
    for (const entry of live) {
      if (entry.inView()) continue;
      const d = distance(entry.el);
      if (d > farthestDistance) {
        farthest = entry;
        farthestDistance = d;
      }
    }
    if (!farthest) return;
    live.delete(farthest);
    farthest.evict();
  }
}

/**
 * Adds a starting example to the budget and rebalances. Returns the function that removes it
 * again (call it when the example is disposed).
 */
export function claimLiveSlot(entry: LiveExample): () => void {
  live.add(entry);
  rebalance();
  return () => live.delete(entry);
}
