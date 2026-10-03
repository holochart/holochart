/**
 * `pnpm bench:gpu`: the plan's performance targets measured on this machine's real GPU (§11.7,
 * a first step towards E16.1). CI only has SwiftShader, so this runs locally:
 *
 *   pnpm bench:gpu                         every scenario, 3 runs each
 *   pnpm bench:gpu --only heatmap          scenarios whose example id contains "heatmap"
 *   pnpm bench:gpu --runs 5 --dpr 2        more runs, retina pixel ratio
 *   pnpm bench:gpu --note "…"              add a note to the report (e.g. what else was running)
 *   pnpm bench:gpu --only heatmap --profile  also print where each mount spends its CPU time
 *
 * Options: `--runs N` (3), `--duration MS` per sweep (3000), `--warmup MS` (500), `--dpr N` (1),
 * `--port N` for the sandbox dev server (5721, or BENCH_PORT), `--out DIR` (docs/perf).
 *
 * Starts the sandbox's Vite dev server (like the visual and interaction suites), launches
 * Playwright's headless Chromium with hardware GL, checks with `WEBGL_debug_renderer_info` that
 * the renderer is a real GPU (and refuses to report otherwise), then runs every scenario of
 * `scenarios.ts` sequentially, each run in a fresh browser, through the in-page harness
 * (`page.ts`). Writes `gpu-benchmarks.json` and `gpu-benchmarks.md` to the output folder.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser } from '@playwright/test';
import * as prettier from 'prettier';
import { openExample } from '../../../tests/visual/harness.ts';
import { formatProfile, startProfile } from './profile.ts';
import { evaluate, renderMarkdown, type Machine, type Report } from './report.ts';
import { SCENARIOS, type Scenario } from './scenarios.ts';
import type { RunOptions, RunResult } from './types.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const HOST = '127.0.0.1';
const SERVER_TIMEOUT_MS = 120_000;
/** Software rasterizers: numbers from these say nothing about a GPU. */
const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render/i;

const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    runs: { type: 'string', default: '3' },
    duration: { type: 'string', default: '3000' },
    warmup: { type: 'string', default: '500' },
    dpr: { type: 'string', default: '1' },
    port: { type: 'string', default: process.env['BENCH_PORT'] ?? '5721' },
    out: { type: 'string', default: path.join(REPO_ROOT, 'docs/perf') },
    note: { type: 'string', multiple: true, default: [] },
    profile: { type: 'boolean', default: false },
  },
});

function positive(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a positive number.`);
  return n;
}

const RUNS = Math.round(positive('runs', args.runs));
const DURATION_MS = positive('duration', args.duration);
const WARMUP_MS = Number(args.warmup);
const DPR = positive('dpr', args.dpr);
const PORT = Math.round(positive('port', args.port));
const BASE_URL = `http://${HOST}:${PORT}`;

/** Hardware GL through ANGLE's native backend for this OS. */
function chromiumFlags(): string[] {
  const angle =
    process.env['BENCH_ANGLE'] ??
    (process.platform === 'darwin' ? 'metal' : process.platform === 'win32' ? 'd3d11' : 'gl');
  return [
    `--use-angle=${angle}`,
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
  ];
}

function startServer(): ChildProcess {
  const child = spawn(
    'pnpm',
    [
      '--filter',
      '@mk7s/holochart-sandbox',
      'exec',
      'vite',
      '--port',
      String(PORT),
      '--strictPort',
      '--host',
      HOST,
    ],
    { cwd: REPO_ROOT, detached: true, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  return child;
}

function stopServer(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  try {
    // The whole process group: pnpm and the vite process it started.
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

async function waitForServer(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`The sandbox dev server exited (is port ${PORT} in use? try --port).`);
    }
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`The sandbox dev server did not start on ${BASE_URL}.`);
}

async function launch(): Promise<Browser> {
  return chromium.launch({ headless: true, args: chromiumFlags() });
}

/** The WebGL renderer string of a fresh context in a blank page. */
async function probeRenderer(browser: Browser): Promise<string> {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return 'no WebGL2';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    });
  } finally {
    await page.close();
  }
}

function assertHardware(renderer: string): void {
  if (SOFTWARE_GL.test(renderer) || renderer === 'no WebGL2' || renderer === 'unknown') {
    throw new Error(
      `WebGL renders with "${renderer}", not a GPU: refusing to report. ` +
        'Check the ANGLE backend (BENCH_ANGLE) and that the machine has a usable GPU.',
    );
  }
}

/** Vite reloads the page when it discovers and optimizes a new dependency on the first visit. */
const RELOADED = /Execution context was destroyed|navigation/i;

/**
 * One measurement of `scenario` in a fresh browser; retried when Vite reloads the page. With
 * `profile`, the mount alone runs under the CPU profiler and its breakdown is printed.
 */
async function runOnce(scenario: Scenario, profile = false): Promise<RunResult> {
  const options: RunOptions = {
    example: scenario.example,
    drive: scenario.drive,
    ...(scenario.pan ? { pan: scenario.pan } : {}),
    ...(scenario.zoom ? { zoom: scenario.zoom } : {}),
    ...(scenario.perfGlobal ? { perfGlobal: scenario.perfGlobal } : {}),
    warmupMs: WARMUP_MS,
    durationMs: DURATION_MS,
    ...(profile ? { mountOnly: true } : {}),
  };
  for (let attempt = 1; ; attempt++) {
    const browser = await launch();
    try {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: DPR,
        colorScheme: 'light',
        locale: 'en-US',
        timezoneId: 'UTC',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(120_000);
      const opened = await openExample(page, scenario.example);
      if (!opened.skipped) {
        throw new Error(
          `"${scenario.example}" ran in test mode: benchmark examples must be tagged no-visual-test.`,
        );
      }
      await page.evaluate(
        (url) => import(/* @vite-ignore */ url).then(() => undefined),
        `/@fs${REPO_ROOT}/tools/bench/src/page.ts`,
      );
      const stopProfile = profile ? await startProfile(page) : undefined;
      const result = await page.evaluate((o) => {
        const bench = window.__holochartBench;
        if (!bench) throw new Error('The benchmark harness did not load.');
        return bench.run(o);
      }, options);
      if (stopProfile) console.log(formatProfile(await stopProfile()));
      assertHardware(result.renderer);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!RELOADED.test(message) || attempt >= 3) throw error;
      console.log(`${scenario.example}: the dev server reloaded the page, retrying`);
    } finally {
      await browser.close();
    }
  }
}

function osName(): string {
  if (process.platform === 'darwin') {
    try {
      const version = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim();
      return `macOS ${version} (Darwin ${os.release()}, ${os.arch()})`;
    } catch {
      // Fall through.
    }
  }
  return `${os.type()} ${os.release()} (${os.arch()})`;
}

function commit(): string {
  try {
    const git = (...a: string[]): string =>
      execFileSync('git', a, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const sha = git('rev-parse', '--short', 'HEAD');
    return git('status', '--porcelain').length > 0 ? `${sha} (with uncommitted changes)` : sha;
  } catch {
    return 'unknown';
  }
}

function summaryLine(result: RunResult): string {
  const parts = [
    `first draw ${(result.firstDrawMs ?? result.mountMs).toFixed(0)} ms`,
    `finish ${result.finishMs.toFixed(1)} ms`,
  ];
  for (const sweep of ['pan', 'zoom'] as const) {
    const s = result[sweep];
    if (s) {
      parts.push(
        `${sweep} ${s.fps.toFixed(1)} fps (p95 ${s.frameMs.p95.toFixed(1)} ms, gpu ${s.gpuMs ? s.gpuMs.mean.toFixed(2) : 'n/a'} ms)`,
      );
    }
  }
  return parts.join(' · ');
}

async function main(): Promise<void> {
  const scenarios = SCENARIOS.filter((s) => !args.only || s.example.includes(args.only));
  if (scenarios.length === 0) throw new Error(`No scenario matches "${args.only}".`);

  const loadBefore = os.loadavg();
  const cores = os.cpus().length;
  console.log(`Load average ${loadBefore.map((l) => l.toFixed(2)).join(' / ')} (${cores} cores)`);

  // Refuse early, before the dev server, when there is no GPU.
  const probe = await launch();
  let gpu: string;
  let browserVersion: string;
  try {
    gpu = await probeRenderer(probe);
    browserVersion = `Chromium ${probe.version()} (Playwright, headless)`;
  } finally {
    await probe.close();
  }
  assertHardware(gpu);
  console.log(`GPU: ${gpu}\n${browserVersion}`);

  const server = startServer();
  const stop = (): void => stopServer(server);
  process.once('SIGINT', () => {
    stop();
    process.exit(130);
  });
  const report: Report = {
    machine: {} as Machine,
    settings: {
      runs: RUNS,
      warmupMs: WARMUP_MS,
      durationMs: DURATION_MS,
      dpr: DPR,
      flags: chromiumFlags(),
    },
    notes: [],
    scenarios: [],
  };
  try {
    await waitForServer(server);
    for (const scenario of scenarios) {
      const runs: RunResult[] = [];
      for (let i = 1; i <= RUNS; i++) {
        const result = await runOnce(scenario);
        console.log(`${scenario.example} [${i}/${RUNS}] ${summaryLine(result)}`);
        runs.push(result);
      }
      report.scenarios.push({ scenario, runs });
      if (args.profile) {
        console.log(`${scenario.example}: profiled mount (an extra run, not in the report)`);
        await runOnce(scenario, true);
      }
    }
  } finally {
    stop();
  }

  const loadAfter = os.loadavg();
  report.machine = {
    gpu,
    browser: browserVersion,
    os: osName(),
    cpu: `${os.cpus()[0]?.model ?? 'unknown'} (${cores} cores)`,
    memoryGB: Math.round(os.totalmem() / 2 ** 30),
    loadBefore,
    loadAfter,
    commit: commit(),
    date: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  };
  report.notes.push(...(args.note ?? []));
  const busiest = Math.max(loadBefore[0] ?? 0, loadAfter[0] ?? 0);
  if (busiest > cores / 2) {
    report.notes.push(
      `The machine was busy (1-minute load average up to ${busiest.toFixed(1)} on ${cores} ` +
        'cores): frame times and first draws are pessimistic. Rerun on an idle machine.',
    );
  }
  if (args.only) report.notes.push(`Partial run: only examples matching "${args.only}".`);

  const outDir = path.resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  const jsonFile = path.join(outDir, 'gpu-benchmarks.json');
  const mdFile = path.join(outDir, 'gpu-benchmarks.md');
  const json = { ...report, targets: evaluate(report) };
  const format = async (source: string, file: string): Promise<string> =>
    prettier.format(source, { ...(await prettier.resolveConfig(file)), filepath: file });
  writeFileSync(jsonFile, await format(JSON.stringify(json), jsonFile));
  writeFileSync(mdFile, await format(renderMarkdown(report), mdFile));

  console.log('');
  for (const t of json.targets) {
    const value = t.measured === null ? '–' : `${t.measured.toFixed(1)} ${t.unit}`;
    const met = t.met === null ? 'not measured' : t.met ? 'met' : 'NOT met';
    console.log(`${t.target.story} ${t.example}: ${t.target.goal} → ${value} (${met})`);
  }
  console.log(`\nWrote ${jsonFile} and ${mdFile}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
