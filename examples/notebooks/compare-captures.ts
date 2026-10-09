/** Compare captures exactly, allowing only machine-precision noise inside figure numbers. */
export function captureDifference(
  expected: unknown,
  actual: unknown,
  path = '$',
): string | undefined {
  if (expected === actual) return;
  if (typeof expected === 'number' && typeof actual === 'number' && path.includes('.figure.')) {
    // Transcendental Math functions differ by a few ULPs between V8 versions/platforms.
    // Source hashes, metadata, array lengths, and meaningful data changes remain exact gates.
    const tolerance = 8 * Number.EPSILON * Math.max(1, Math.abs(expected), Math.abs(actual));
    if (
      Number.isFinite(expected) &&
      Number.isFinite(actual) &&
      Math.abs(expected - actual) <= tolerance
    )
      return;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return `${path}.length`;
    for (let i = 0; i < expected.length; i++) {
      const difference = captureDifference(expected[i], actual[i], `${path}.${i}`);
      if (difference) return difference;
    }
    return;
  }
  if (
    expected &&
    actual &&
    typeof expected === 'object' &&
    typeof actual === 'object' &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    const left = expected as Record<string, unknown>;
    const right = actual as Record<string, unknown>;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length || keys.some((key) => !Object.hasOwn(right, key)))
      return `${path} (keys)`;
    for (const key of keys) {
      const difference = captureDifference(left[key], right[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return;
  }
  return path;
}
