/**
 * Plotly's transition easings (plan E7.3): `linear`, `quad`, `cubic`, `sin`, `exp`, `circle`,
 * `elastic`, `back` and `bounce`, each with `-in`, `-out` and `-in-out`.
 *
 * Plotly hands these names to d3 v3's `d3.ease`, so this reproduces d3 v3 exactly, quirks included:
 * a bare name means `-in` (`'cubic'` is `'cubic-in'`), an unknown name is linear, the result is
 * clamped to 0 and 1 at the ends, and the `elastic` and `bounce` base curves are already
 * out-shaped, so `'elastic-in'` overshoots at the end and `'elastic-out'` at the start.
 *
 * Only the animation code (a lazily loaded chunk) uses these; the sliders' handle glide is a CSS
 * transition with `cubic-bezier` approximations of the same names (components' `cssEasing`).
 */

/** An easing: maps linear progress in [0, 1] to eased progress (0 → 0, 1 → 1). */
export type Easing = (t: number) => number;

const HALF_PI = Math.PI / 2;
const TAU = 2 * Math.PI;

/** d3 v3 `elastic()` with its defaults: amplitude 1, period 0.45. */
const ELASTIC_PERIOD = 0.45;
/** d3 v3 `back()` overshoot. */
const BACK = 1.70158;

/** d3 v3's base ("in") curves. */
const BASE: Readonly<Record<string, Easing>> = {
  linear: (t) => t,
  quad: (t) => t * t,
  cubic: (t) => t * t * t,
  sin: (t) => 1 - Math.cos(t * HALF_PI),
  exp: (t) => Math.pow(2, 10 * (t - 1)),
  circle: (t) => 1 - Math.sqrt(1 - t * t),
  elastic: (t) =>
    1 + Math.pow(2, -10 * t) * Math.sin(((t - ELASTIC_PERIOD / 4) * TAU) / ELASTIC_PERIOD),
  back: (t) => t * t * ((BACK + 1) * t - BACK),
  bounce: (t) =>
    t < 1 / 2.75
      ? 7.5625 * t * t
      : t < 2 / 2.75
        ? 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
        : t < 2.5 / 2.75
          ? 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
          : 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375,
};

const CACHE = new Map<string, Easing>();

/**
 * The easing function for a Plotly easing name (`'cubic-in-out'`, `'elastic-out'`, `'linear'`,
 * …), like d3 v3's `d3.ease(name)`.
 *
 * @example
 * ```ts
 * easing('quad-in-out')(0.25); // 0.125
 * ```
 */
export function easing(name: string): Easing {
  let fn = CACHE.get(name);
  if (fn) return fn;
  const dash = name.indexOf('-');
  const base = BASE[dash >= 0 ? name.slice(0, dash) : name] ?? (BASE['linear'] as Easing);
  const mode = dash >= 0 ? name.slice(dash + 1) : 'in';
  const f: Easing =
    mode === 'out'
      ? (t) => 1 - base(1 - t)
      : mode === 'in-out'
        ? (t) => 0.5 * (t < 0.5 ? base(2 * t) : 2 - base(2 - 2 * t))
        : mode === 'out-in'
          ? (t) => 0.5 * (t < 0.5 ? 1 - base(1 - 2 * t) : 1 + base(2 * t - 1))
          : base;
  fn = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : f(t));
  CACHE.set(name, fn);
  return fn;
}
