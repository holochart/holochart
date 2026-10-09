import { writeExampleArtifacts } from './artifacts.ts';
/** Compile output is only promoted to rendered after the exact copied artifact runs in Chromium. */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR, REPO_ROOT } from './manifest.ts';
import type { StandaloneIndex } from './standalone.ts';

const file = path.join(PUBLIC_DIR, 'gallery/sources.json');
const index: StandaloneIndex = JSON.parse(readFileSync(file, 'utf8'));
const requested = process.argv.slice(2);
const ids = requested.length
  ? requested
  : [
      'bar/basic',
      'scatter/basic',
      'line/basic',
      'box/basic',
      'heatmap/basic',
      'pie/basic',
      'candlestick/basic',
      'polar/basic',
      'choropleth/basic',
      'sankey/basic',
      'graph/basic',
      'scatter3d/basic',
      'surface/basic',
      'express/adjacency-matrix',
      'express/ecdf',
      'recipes/dumbbell',
      'demos/science-basics/pendulum-energy',
      'themes/holochart',
    ].filter((id) => id in index.examples);
const temp = mkdtempSync(path.join(REPO_ROOT, 'examples/_standalone-smoke-'));
const server = await createServer({
  configFile: false,
  root: REPO_ROOT,
  cacheDir: path.join(temp, '.vite'),
  logLevel: 'error',
  resolve: { conditions: ['source'] },
  optimizeDeps: {
    entries: [],
    include: [
      'three',
      'troika-three-text',
      'd3-array',
      'd3-force',
      'd3-geo',
      'd3-geo-projection',
      'earcut',
      'maplibre-gl',
    ],
  },
  server: { port: 0, host: '127.0.0.1', fs: { allow: [REPO_ROOT] } },
});
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const failures: string[] = [];
try {
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('Source smoke server unavailable.');
  const origin = `http://127.0.0.1:${address.port}`;
  for (const id of ids) {
    const artifact = index.examples[id];
    if (!artifact) throw new Error(`Unknown exported source ${id}.`);
    const copied = path.join(temp, 'main.js');
    const code = readFileSync(path.join(PUBLIC_DIR, artifact.javascript), 'utf8');
    writeFileSync(copied, code);
    const moduleUrl = `/@fs/${copied}?smoke=${encodeURIComponent(id)}`;
    // Finish the initial dependency crawl before a browser imports the copied module.
    // Otherwise cold-cache optimizer reloads can abort that first dynamic import.
    await server.warmupRequest(moduleUrl);
    await server.waitForRequestsIdle();
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/@'))
        errors.push(`${response.status()} ${response.statusText()}: ${response.url()}`);
    });
    try {
      await page.goto(origin);
      await page.evaluate(async (file) => {
        document.body.innerHTML = '';
        document.body.style.cssText = 'margin:0;background:#0a0a0f;';
        const example = await import(/* @vite-ignore */ file);
        if (!document.querySelector('#holochart-example canvas'))
          throw new Error('No canvas rendered by copied source.');
        if (typeof example.cleanup !== 'function') throw new Error('Copied source lacks cleanup.');
        await new Promise((resolve) => setTimeout(resolve, 500));
        example.cleanup();
        if (document.getElementById('holochart-example'))
          throw new Error('Copied source cleanup left its container mounted.');
      }, moduleUrl);
      if (errors.length) throw new Error(errors.join('\n'));
      artifact.verification = 'rendered';
      artifact.browserEvidence = {
        hash: artifact.hash,
        runner: 'Chromium WebGL2; copied standalone source + ready/canvas/cleanup',
        checkedAt: new Date().toISOString(),
      };
      console.log(`rendered  ${id}`);
    } catch (error) {
      failures.push(id);
      console.error(
        `failed    ${id}: ${error instanceof Error ? error.message : error}\n${errors.join('\n')}`,
      );
    } finally {
      await page.close();
    }
  }
  writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`);
  writeExampleArtifacts(index);
} finally {
  await browser.close();
  await server.close();
  rmSync(temp, { recursive: true, force: true });
}
console.log(`Standalone browser smoke: ${ids.length - failures.length}/${ids.length} rendered.`);
if (failures.length) process.exitCode = 1;
