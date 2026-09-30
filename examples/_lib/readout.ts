/**
 * A small text readout under a `_dev` example (pick results and the like). It shows in the
 * sandbox, but not in the visual tests (`?test=1`): its DOM text is rasterized by the OS font
 * stack, which differs between the macOS baselines and Linux CI. Examples assert what they print
 * instead (a wrong value fails the example's `ready`, and with it its test).
 */
export function createReadout(el: HTMLElement, side: 'left' | 'right' = 'left'): HTMLDivElement {
  const readout = document.createElement('div');
  readout.style.cssText =
    `position:absolute;${side}:8px;bottom:8px;padding:2px 6px;font:12px/1.4 monospace;` +
    'background:rgba(255,255,255,.9);color:#223';
  if (new URLSearchParams(location.search).get('test') === '1') readout.style.display = 'none';
  el.appendChild(readout);
  return readout;
}

/** Fail the example (and its visual test) when a checked value is wrong. */
export function expectValue(what: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
