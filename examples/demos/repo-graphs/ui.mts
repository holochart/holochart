/**
 * DOM and color helpers for the "This repository as graphs" demo: the OpenRouter demo's toolbar,
 * segmented toggles and settle wait (styled after the default template, ADR-021), and the colors
 * the charts share, so that a package or a kind of commit has one color on the whole page.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import { LOOK } from '../openrouter/ui.mts';
import { PACKAGE_DIRS } from './analysis.mts';
import type { CommitKind } from './analysis.mts';

export { chartConfig, frame, isNarrow, LOOK, segmented, settled } from '../openrouter/ui.mts';
export type { Frame } from '../openrouter/ui.mts';

/** `#rrggbb` with an alpha, as `rgba(…)`. */
export function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * A color per package under `packages/`: the template's colorway for the eight the others build
 * on or that stand alone, and a lighter tint of it for each further trace package.
 */
const PACKAGE_COLORS: Readonly<Record<string, string>> = {
  core: '#ea2a37',
  render: '#5e74d5',
  runtime: '#118e36',
  components: '#9962c0',
  'traces-basic': '#cc540a',
  express: '#128b8b',
  locales: '#997600',
  holochart: '#b8267e',
  themes: '#d1b64d',
  'traces-3d': '#a6b3ea',
  'traces-stats': '#eb9a66',
  'traces-sci': '#6fc4c4',
  'traces-finance': '#6fc48a',
  'traces-hier': '#c8a8de',
  'traces-geo': '#f28b93',
  'traces-graph': '#e07fb5',
};

/** The color of a package, by its directory name. */
export function packageColor(dir: string): string {
  return PACKAGE_COLORS[dir] ?? LOOK.tick;
}

/** The package colors in the order of {@link PACKAGE_DIRS}: a `colorway` for charts grouped by package. */
export function packageColorway(dirs: readonly string[] = PACKAGE_DIRS): string[] {
  return dirs.map(packageColor);
}

/** A color per kind of commit; merges are neutral, since they carry no change of their own. */
export const COMMIT_COLOR: Readonly<Record<CommitKind, string>> = {
  feat: '#5e74d5',
  fix: '#ea2a37',
  perf: '#cc540a',
  docs: '#118e36',
  test: '#9962c0',
  chore: '#997600',
  merge: '#a4a7b5',
};

/**
 * A `colorway` for a `graph` trace with `node.group`: the trace gives its groups the colorway's
 * colors in order of first appearance, so this lists `color(group)` in that order.
 */
export function groupColorway(
  groups: readonly string[],
  color: (group: string) => string,
): string[] {
  return [...new Set(groups)].map(color);
}
