import path from 'node:path';

/**
 * Per-example diff records written by visual.spec.ts and summarized by report.ts (plan E20.9).
 * They live under Playwright's `outputDir`, which Playwright clears at the start of every run.
 */
export const DIFF_REPORT_DIR = 'test-results/visual/diff-report';

export interface DiffRecord {
  id: string;
  /** Pixelmatch verdict against the tolerance. */
  pass: boolean;
  tolerance: number;
  totalPixels: number;
  /** Pixelmatch count (YIQ threshold, anti-aliasing ignored): what the test gates on. */
  diffPixels: number;
  ratio: number;
  /** Pixels whose RGBA differs at all: reported, never gated. */
  exactPixels: number;
  /** Largest per-channel difference (0–255). */
  maxDelta: number;
}

/** File for one example id (ids contain `/`, e.g. `scatter/basic`). */
export function reportFileFor(dir: string, id: string): string {
  return path.join(dir, `${id.replaceAll('/', '__')}.json`);
}
