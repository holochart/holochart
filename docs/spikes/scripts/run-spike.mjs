// Safe runner for the E0.7 spike pages (examples/_spikes/*): one spike per invocation, in its own
// headless Chromium on the hardware GPU (ANGLE/Metal), with a hard timeout and a memory watchdog.
//
// Why: running the spikes inside an embedded app browser (shared GPU process) took that app down.
// Here a runaway workload can only kill this throwaway browser. Start at a small `scale` and step up
// only after a clean run.
//
// Usage (from the repo root, with the sandbox dev server running on --port):
//   pnpm --filter @mk7s/holochart-sandbox exec vite --port 5197 --strictPort --host 127.0.0.1 &
//   node docs/spikes/scripts/run-spike.mjs --spike a-markers --params 'scale=0.1' --out /tmp/spikes
//
// Options: --port (5197), --spike (required: a-markers | b-lines | c-text | d-viewports),
//          --params (extra query string), --dpr (1), --timeout (seconds, 240),
//          --rss-cap-mb (browser process tree RSS limit, 6144), --out (required),
//          --gl (metal | swiftshader; default metal).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values: args } = parseArgs({
  options: {
    port: { type: 'string', default: '5197' },
    spike: { type: 'string' },
    params: { type: 'string', default: '' },
    dpr: { type: 'string', default: '1' },
    timeout: { type: 'string', default: '240' },
    'rss-cap-mb': { type: 'string', default: '6144' },
    out: { type: 'string' },
    gl: { type: 'string', default: 'metal' },
  },
});
if (!args.spike || !args.out) {
  console.error('--spike and --out are required');
  process.exit(2);
}

const GL_ARGS = {
  metal: ['--use-gl=angle', '--use-angle=metal'],
  swiftshader: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
const dpr = Number(args.dpr);
const timeoutMs = Number(args.timeout) * 1000;
const rssCapKB = Number(args['rss-cap-mb']) * 1024;

/** Total RSS (KB) of `rootPid` and all its descendants. */
function treeRssKB(rootPid) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const children = new Map();
  for (const [pid, ppid] of rows) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  const rss = new Map(rows.map(([pid, , kb]) => [pid, kb]));
  let total = 0;
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    total += rss.get(pid) ?? 0;
    stack.push(...(children.get(pid) ?? []));
  }
  return total;
}

const server = await chromium.launchServer({
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', ...GL_ARGS[args.gl]],
});
const browserPid = server.process().pid;
let peakKB = 0;
let aborted = null;
const watchdog = setInterval(() => {
  try {
    const kb = treeRssKB(browserPid);
    peakKB = Math.max(peakKB, kb);
    if (kb > rssCapKB && !aborted) {
      aborted = `RSS ${Math.round(kb / 1024)} MB exceeded cap ${args['rss-cap-mb']} MB`;
      void server.kill();
    }
  } catch {
    // ps can fail transiently while processes exit; the next tick retries.
  }
}, 500);

const started = Date.now();
let record = null;
try {
  const browser = await chromium.connect(server.wsEndpoint());
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: dpr,
  });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

  const query = `example=_spikes/${args.spike}&dpr=${args.dpr}${args.params ? `&${args.params}` : ''}`;
  await page.goto(`http://127.0.0.1:${args.port}/?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(
    (id) => ['done', 'error'].includes(window.__spikeResults?.[id]?.status),
    args.spike,
    { timeout: timeoutMs, polling: 500 },
  );
  record = await page.evaluate((id) => window.__spikeResults[id], args.spike);
  record.readout = await page.textContent('#spike-readout');
  record.console = logs.slice(-50);
  await browser.close();
} catch (error) {
  record ??= { status: 'error' };
  record.error = aborted ?? String(error?.message ?? error);
} finally {
  clearInterval(watchdog);
  await server.close().catch(() => {});
}

const summary = {
  spike: args.spike,
  params: args.params,
  dpr,
  gl: args.gl,
  wallSeconds: Math.round((Date.now() - started) / 100) / 10,
  peakBrowserRssMB: Math.round(peakKB / 1024),
  aborted,
  ...record,
};
mkdirSync(args.out, { recursive: true });
const tag = [args.spike, args.params.replace(/[^a-z0-9.=]+/gi, '_'), `dpr${args.dpr}`, args.gl]
  .filter(Boolean)
  .join('__');
const file = path.join(args.out, `${tag}.json`);
writeFileSync(file, JSON.stringify(summary, null, 2));
console.log(
  `${summary.status} in ${summary.wallSeconds}s, peak browser RSS ${summary.peakBrowserRssMB} MB` +
    `${aborted ? ` (ABORTED: ${aborted})` : ''} → ${file}`,
);
process.exit(summary.status === 'done' ? 0 : 1);
