import type { ExampleMeta } from '@mk7s/holochart-examples/_lib/types.ts';

/**
 * Contract between the sandbox's test mode (`?example=<id>&test=1`) and the visual regression
 * suite (tests/visual). Plain constants and types only (no DOM/Vite code), so the Node-side
 * test suite can import it too.
 */
export interface ExampleTestResult {
  id: string;
  meta: ExampleMeta;
  /** True when the example is tagged `no-visual-test` and was therefore not run. */
  skipped: boolean;
  /** CSS size of the example container (the screenshot region). */
  width: number;
  height: number;
}

/** Selector of the element the visual suite screenshots. */
export const TEST_CONTAINER_ID = 'example-root';

/** Default container size when `meta.size` is not set. */
export const DEFAULT_TEST_SIZE = { width: 640, height: 400 } as const;

/** Max time the sandbox waits for `handle.ready` before rejecting `__exampleReady`. */
export const READY_TIMEOUT_MS = 20_000;

declare global {
  interface Window {
    /**
     * Test mode only. Resolves after the example has rendered (`handle.ready` + two animation
     * frames); rejects with the load/run error otherwise.
     */
    __exampleReady?: Promise<ExampleTestResult>;
    /** All example ids known to the registry (for cross-checking the filesystem enumeration). */
    __exampleIds?: readonly string[];
  }
}
