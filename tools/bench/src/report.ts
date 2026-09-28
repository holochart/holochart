import { FPS_TOLERANCE, type Scenario, type Target } from './scenarios.ts';
import type { RunResult, SweepResult } from './types.ts';

export interface Machine {
  gpu: string;
  browser: string;
  os: string;
  cpu: string;
  memoryGB: number;
  /** 1, 5 and 15 minute load averages before and after the run. */
  loadBefore: readonly number[];
  loadAfter: readonly number[];
  commit: string;
  date: string;
}

export interface Settings {
  runs: number;
  warmupMs: number;
  durationMs: number;
  dpr: number;
  flags: readonly string[];
}

export interface ScenarioReport {
  scenario: Scenario;
  runs: RunResult[];
}

export interface Report {
  machine: Machine;
  settings: Settings;
  notes: string[];
  scenarios: ScenarioReport[];
}

export interface TargetResult {
  target: Target;
  example: string;
  /** Median over the runs; null when not measured. */
  measured: number | null;
  unit: 'ms' | 'fps';
  met: boolean | null;
  /** How `measured` was obtained, when not the plain metric. */
  basis?: string;
}

function median(values: readonly number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? (v[mid] as number) : ((v[mid - 1] as number) + (v[mid] as number)) / 2;
}

/** Median of `pick` over the runs that have the value. */
function med(runs: readonly RunResult[], pick: (r: RunResult) => number | null | undefined) {
  return median(runs.map(pick).filter((x): x is number => typeof x === 'number'));
}

/** First draw as the targets read it: `createChart` → ready plus the queued GPU work. */
function firstDraw(r: RunResult): number {
  return (r.firstDrawMs ?? r.mountMs) + r.finishMs;
}

export function evaluate(report: Report): TargetResult[] {
  const out: TargetResult[] = [];
  for (const { scenario, runs } of report.scenarios) {
    for (const target of scenario.targets) {
      if (target.metric === 'firstDraw') {
        const measured = med(runs, firstDraw);
        const recorded = runs.every((r) => r.firstDrawMs !== null);
        out.push({
          target,
          example: scenario.example,
          measured,
          unit: 'ms',
          met: measured === null ? null : measured < target.value,
          basis: recorded
            ? 'createChart → ready + gl.finish'
            : 'run() → ready + gl.finish (includes data generation)',
        });
      } else {
        const sweep = target.metric === 'panFps' ? 'pan' : 'zoom';
        const measured = med(runs, (r) => r[sweep]?.fps);
        out.push({
          target,
          example: scenario.example,
          measured,
          unit: 'fps',
          met: measured === null ? null : measured >= target.value * FPS_TOLERANCE,
        });
      }
    }
  }
  return out;
}

const ms = (v: number | null | undefined, digits = 1): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '–';

/** `ms` with a unit, or a bare dash. */
const unit = (v: number | null | undefined, digits: number, suffix: string): string => {
  const text = ms(v, digits);
  return text === '–' ? text : `${text} ${suffix}`;
};

function sweepRow(label: string, runs: readonly RunResult[], sweep: 'pan' | 'zoom'): string | null {
  const s = runs.map((r) => r[sweep]).filter((x): x is SweepResult => x !== null);
  if (s.length === 0) return null;
  const m = (pick: (x: SweepResult) => number | null | undefined) =>
    median(s.map(pick).filter((x): x is number => typeof x === 'number'));
  const update = m((x) => x.updateCpuMs?.mean);
  const gpu = m((x) => x.gpuMs?.mean);
  const gpu95 = m((x) => x.gpuMs?.p95);
  return [
    label,
    sweep,
    ms(m((x) => x.fps)),
    ms(m((x) => x.frameMs.p50)),
    ms(m((x) => x.frameMs.p95)),
    ms(m((x) => x.frameMs.max)),
    ms(
      m((x) => x.rendersPerSecond),
      0,
    ),
    update === null ? '–' : ms(update, 2),
    ms(
      m((x) => x.renderCpuMs.mean),
      2,
    ),
    gpu === null ? 'n/a' : `${ms(gpu, 2)} / ${ms(gpu95, 2)}`,
    ms(
      m((x) => x.drawCalls),
      0,
    ),
  ].join(' | ');
}

/** The markdown report (`docs/perf/gpu-benchmarks.md`); formatted with Prettier by the caller. */
export function renderMarkdown(report: Report): string {
  const { machine, settings } = report;
  const targets = evaluate(report);
  const lines: string[] = [];
  const push = (...l: string[]): void => {
    lines.push(...l);
  };
  const load = (l: readonly number[]): string => l.map((x) => x.toFixed(2)).join(' / ');

  push(
    '# GPU benchmarks',
    '',
    'Real-GPU timings of the plan performance targets (§11.7): E12.1, E11.1, E12.3, E13.3 and the',
    'M0 marker baseline E2.4. CI renders with SwiftShader (software GL), so these numbers come from',
    'a local run: `pnpm bench:gpu` (script in `tools/bench/`) writes this page and',
    '`gpu-benchmarks.json` next to it. **Generated: rerun the script instead of editing.**',
    '',
  );
  if (report.notes.length > 0) {
    for (const note of report.notes) push(`> **Note:** ${note}`, '>');
    lines.pop();
    push('');
  }
  push(
    '## Machine',
    '',
    '| Item | Value |',
    '| --- | --- |',
    `| GPU (WebGL renderer) | ${machine.gpu} |`,
    `| Browser | ${machine.browser} |`,
    `| OS | ${machine.os} |`,
    `| CPU | ${machine.cpu} |`,
    `| Memory | ${machine.memoryGB} GB |`,
    `| Load average (1 / 5 / 15 min) | before ${load(machine.loadBefore)}, after ${load(machine.loadAfter)} |`,
    `| Commit | ${machine.commit} |`,
    `| Date | ${machine.date} |`,
    `| Runs | ${settings.runs} per example (medians below), ${settings.warmupMs} ms warm-up + ${settings.durationMs} ms per sweep, device pixel ratio ${settings.dpr} |`,
    '',
    '## Targets',
    '',
    'fps targets count as met at 95 % (headless Chromium paces frames at 60 Hz, so a chart that',
    'keeps up measures 59–60 fps). First-draw targets include the `gl.finish()` right after ready.',
    '',
    '| Story | Example | Target | Measured | Met |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const t of targets) {
    const value = unit(t.measured, t.unit === 'ms' ? 0 : 1, t.unit);
    const met = t.met === null ? 'not measured' : t.met ? 'yes' : '**no**';
    const basis = t.basis ? ` (${t.basis})` : '';
    push(`| ${t.target.story} | \`${t.example}\` | ${t.target.goal} | ${value}${basis} | ${met} |`);
  }
  push(
    '',
    '## First draw',
    '',
    '`createChart` → ready is the example’s own timing (from just before `createChart` to',
    '`chart.ready`: calc, buffers and textures, first frame); `run()` → ready adds its data',
    'generation. `gl.finish` is the GPU work still queued at ready.',
    '',
    '| Example | Canvas | Data generation | createChart → ready | gl.finish | run() → ready | JS heap |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const { scenario, runs } of report.scenarios) {
    const c = runs[0]?.canvas;
    const heap = med(runs, (r) => r.heapMB);
    push(
      [
        `| \`${scenario.example}\``,
        c ? `${c.width} × ${c.height} px` : '–',
        unit(
          med(runs, (r) => r.generateMs),
          0,
          'ms',
        ),
        unit(
          med(runs, (r) => r.firstDrawMs),
          0,
          'ms',
        ),
        unit(
          med(runs, (r) => r.finishMs),
          1,
          'ms',
        ),
        unit(
          med(runs, (r) => r.mountMs),
          0,
          'ms',
        ),
        unit(heap, 0, 'MB'),
      ].join(' | ') + ' |',
    );
  }
  push(
    '',
    '## Pan and zoom',
    '',
    'One view change per animation frame through `chart.previewRanges` (the preview path of zoom',
    'and pan drags), for the measured duration after the warm-up; `_dev/markers-1m` has no chart',
    'and runs its own Pan animation. Frame times are intervals between animation frames. Update',
    'CPU is the `previewRanges` call; render CPU is `renderer.render` (command submission); GPU is',
    '`EXT_disjoint_timer_query_webgl2` around each render (mean / p95). All times in ms.',
    '',
    '| Example | Sweep | fps | Frame p50 | Frame p95 | Frame max | Renders/s | Update CPU | Render CPU | GPU | Draw calls |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const { scenario, runs } of report.scenarios) {
    for (const sweep of ['pan', 'zoom'] as const) {
      const row = sweepRow(`\`${scenario.example}\``, runs, sweep);
      if (row) push(`| ${row} |`);
    }
  }
  push(
    '',
    '## Method',
    '',
    '- Playwright’s Chromium, headless, on the real GPU:',
    `  \`${settings.flags.join(' ')}\`. The script reads \`WEBGL_debug_renderer_info\` first and`,
    '  refuses to run (and to write this page) on a software renderer such as SwiftShader; the',
    '  renderer of every chart context is checked again.',
    '- The examples are served by the sandbox’s Vite dev server (as for the visual and interaction',
    '  suites) and opened in its test mode, one at a time, each run in a fresh browser (cold',
    '  shader and resource caches). The in-page harness is `tools/bench/src/page.ts`.',
    '- Headless Chromium paces animation frames at 60 Hz whatever the display, so fps tops out at',
    '  60: the CPU and GPU columns show the headroom left in the 16.7 ms frame. GPU times are',
    '  timer-query elapsed times on the GPU timeline, so other GPU work on the machine can inflate',
    '  them.',
    '- Numbers vary with load: check the load averages above, and compare runs on an idle machine.',
    '',
  );
  return lines.join('\n');
}
