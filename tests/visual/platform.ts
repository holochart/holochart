/**
 * Examples whose baseline can only be reproduced on one platform, by example id.
 *
 * Baselines are CI's renderings, made in a pinned Linux container (CONTRIBUTING.md). SwiftShader
 * gives the same pixels on every machine for almost every example, but a few pictures differ
 * between operating systems by more than their tolerances. Listing one here keeps its limits as
 * they are where the baseline was made, instead of loosening `meta.testTolerance` for everyone.
 *
 * Add an example only when its difference is in how the platform rasterizes (say what differs),
 * never to quiet a failure that CI shows too.
 */
export const BASELINE_PLATFORM: Readonly<Record<string, 'linux'>> = {
  // Dense dashed lines: 1.1–1.3% of the pixels differ on macOS.
  'demos/tqqq-soxl/drawdowns': 'linux',
  'demos/tqqq-soxl/rolling-vol': 'linux',
};

/** The platform an example's baseline was made on, when it is listed in {@link BASELINE_PLATFORM}. */
export function baselinePlatformOf(id: string): string | undefined {
  return Object.hasOwn(BASELINE_PLATFORM, id) ? BASELINE_PLATFORM[id] : undefined;
}

/**
 * Whether a difference from the baseline fails the visual test of example `id`.
 *
 * On another platform than its baseline's, a listed example is still rendered and compared, and
 * uncaught page errors still fail it; the difference is reported, not failed, and
 * `test:visual:update` leaves the baseline alone. So a local run can neither fail on it nor
 * replace CI's rendering with its own.
 *
 * CI always gates, whatever its platform: a CI job that cannot reproduce a baseline should fail.
 */
export function gatesBaseline(
  id: string,
  platform: string = process.platform,
  ci = Boolean(process.env.CI),
): boolean {
  const made = baselinePlatformOf(id);
  return ci || made === undefined || made === platform;
}
