/**
 * `pnpm bench:gpu --profile`: where the main thread spends an example's mount (`run()` to ready),
 * from the V8 sampling profiler over the DevTools protocol. Self time per function, so a native
 * call that blocks (`texImage2D`, `bufferData`, `compileShader`) shows up under its own name.
 *
 * A profiled run is slower than a plain one (the sampler interrupts the thread every 100 µs), so
 * it is an extra run whose total is not reported: read the shares, not the milliseconds.
 */
import type { CDPSession, Page } from '@playwright/test';

interface CallFrame {
  functionName: string;
  url: string;
  lineNumber: number;
}

interface ProfileNode {
  id: number;
  callFrame: CallFrame;
}

interface Profile {
  nodes: ProfileNode[];
  samples?: number[];
  timeDeltas?: number[];
}

export interface ProfileRow {
  /** `function (file:line)`, or the V8 pseudo-frame (`(garbage collector)`, `(program)`). */
  name: string;
  selfMs: number;
}

export interface ProfileResult {
  totalMs: number;
  /** Every function with self time, largest first. */
  rows: ProfileRow[];
}

const SAMPLING_INTERVAL_US = 100;

/** Start the CPU profiler on `page`; the returned function stops it and aggregates self times. */
export async function startProfile(page: Page): Promise<() => Promise<ProfileResult>> {
  const client: CDPSession = await page.context().newCDPSession(page);
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: SAMPLING_INTERVAL_US });
  await client.send('Profiler.start');
  return async () => {
    const { profile } = (await client.send('Profiler.stop')) as { profile: Profile };
    await client.detach();
    return aggregate(profile);
  };
}

function label(frame: CallFrame): string {
  const name = frame.functionName || '(anonymous)';
  if (!frame.url) return name;
  const file = frame.url.replace(/[?#].*$/, '').replace(/^.*\/(?=[^/]+\/[^/]+$)/, '');
  return `${name} (${file}:${frame.lineNumber + 1})`;
}

function aggregate(profile: Profile): ProfileResult {
  const names = new Map<number, string>();
  for (const node of profile.nodes) names.set(node.id, label(node.callFrame));
  const self = new Map<string, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  let total = 0;
  for (let i = 0; i < samples.length; i++) {
    const name = names.get(samples[i] as number) ?? '(unknown)';
    // A sample's delta is the time since the previous one: attribute it to the earlier sample.
    const ms = (deltas[i + 1] ?? 0) / 1000;
    if (name === '(idle)') continue;
    self.set(name, (self.get(name) ?? 0) + ms);
    total += ms;
  }
  const rows = [...self].map(([name, selfMs]) => ({ name, selfMs }));
  rows.sort((a, b) => b.selfMs - a.selfMs);
  return { totalMs: total, rows };
}

/** The top `count` rows as aligned text lines. */
export function formatProfile(result: ProfileResult, count = 25): string {
  const lines = result.rows.slice(0, count).map((row) => {
    const share = ((100 * row.selfMs) / result.totalMs).toFixed(1).padStart(5);
    return `${row.selfMs.toFixed(1).padStart(8)} ms ${share} %  ${row.name}`;
  });
  return [`main thread busy ${result.totalMs.toFixed(0)} ms (profiled)`, ...lines].join('\n');
}
