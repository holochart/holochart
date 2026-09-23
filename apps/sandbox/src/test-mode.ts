import { exampleIds, loadExample, NO_VISUAL_TEST_TAG } from '@mk7s/holochart-examples/index.ts';
import { setDevicePixelRatio } from './dpr.ts';
import {
  DEFAULT_TEST_SIZE,
  READY_TIMEOUT_MS,
  TEST_CONTAINER_ID,
  type ExampleTestResult,
} from './test-protocol.ts';

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function runTest(root: HTMLElement, id: string | null): Promise<ExampleTestResult> {
  if (!id) throw new Error('Test mode requires ?example=<id>.');
  const mod = await loadExample(id);
  const { meta } = mod;
  const { width, height } = meta.size ?? DEFAULT_TEST_SIZE;

  const container = document.createElement('div');
  container.id = TEST_CONTAINER_ID;
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  root.appendChild(container);

  if (meta.tags.includes(NO_VISUAL_TEST_TAG)) return { id, meta, skipped: true, width, height };

  setDevicePixelRatio(1);
  const handle = mod.run(container);
  await withTimeout(handle.ready ?? Promise.resolve(), READY_TIMEOUT_MS, `Example "${id}" ready`);
  // Let scheduled on-demand renders (rAF) flush and the compositor present the frame.
  await nextFrame();
  await nextFrame();
  return { id, meta, skipped: false, width, height };
}

/**
 * Test mode (`&test=1`): no UI chrome, container sized to `meta.size` (default 640×400), DPR
 * forced to 1, and `window.__exampleReady` for the visual suite (see test-protocol.ts).
 */
export function startTestMode(root: HTMLElement, id: string | null): void {
  document.documentElement.classList.add('test-mode');
  window.__exampleIds = exampleIds;
  const ready = runTest(root, id);
  // The suite observes the rejection; keep it from also surfacing as an unhandled rejection.
  ready.catch(() => undefined);
  window.__exampleReady = ready;
}
