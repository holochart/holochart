/**
 * Console warnings that are worth saying once (backlog S2.4): a figure is usually drawn many
 * times, and the same warning on every draw buries the others.
 */

/**
 * Where a warning goes. Tests pass their own; each function has its own "already said" set.
 * @internal
 */
export type WarnFunction = (message: string) => void;

const consoleWarn: WarnFunction = (message) => console.warn(message);
const seenBy = new WeakMap<WarnFunction, Set<string>>();

/** Warn with `message` the first time `key` is seen (per `warn` function). @internal */
export function warnOnce(key: string, message: string, warn: WarnFunction = consoleWarn): void {
  let seen = seenBy.get(warn);
  if (!seen) seenBy.set(warn, (seen = new Set()));
  if (seen.has(key)) return;
  seen.add(key);
  warn(message);
}

/**
 * Say once that something still works but is on its way out. `message` names the replacement:
 * `deprecate('config.foo', '`config.foo` is deprecated; use `config.bar`.')`.
 * @internal
 */
export function deprecate(key: string, message: string, warn?: WarnFunction): void {
  warnOnce(`deprecated:${key}`, `[holochart] ${message}`, warn);
}
