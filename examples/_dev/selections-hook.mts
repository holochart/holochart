/**
 * Shared by the range slider and selections examples (`rangeslider-*`, `selections-*`): expose the
 * chart and its events on `window.__interaction`, the hook the Playwright interaction suite
 * (tests/interaction) reads. A `.mts` file so the example registry does not list it.
 */
import type { Chart } from '@mk7s/holochart';

interface Hook {
  chart: Chart;
  events: { name: string; payload: unknown }[];
}

const EVENTS = [
  'relayout',
  'relayouting',
  'selecting',
  'selected',
  'deselect',
  'click',
  'doubleclick',
] as const;

/** Points without their trace objects, so payloads stay small and serializable. */
function summarize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as Record<string, unknown>;
  const points = Array.isArray(p['points'])
    ? (p['points'] as Record<string, unknown>[]).map((pt) => ({
        curveNumber: pt['curveNumber'],
        pointNumber: pt['pointNumber'],
        x: pt['x'],
        y: pt['y'],
      }))
    : undefined;
  return JSON.parse(
    JSON.stringify({ ...p, event: undefined, xvals: undefined, yvals: undefined, points }),
  ) as unknown;
}

/** Put `chart` on `window.__interaction` and log its events; returns the cleanup. */
export function exposeChart(chart: Chart): () => void {
  const hook: Hook = { chart, events: [] };
  for (const name of EVENTS) {
    chart.on(name, (payload: unknown) => {
      hook.events.push({ name, payload: summarize(payload) });
    });
  }
  const w = window as unknown as { __interaction?: unknown };
  w.__interaction = hook;
  return () => {
    if (w.__interaction === hook) delete w.__interaction;
  };
}
