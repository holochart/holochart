/**
 * CPU mirror of the pattern shader (`pattern-code.ts`, plan E8.10) — keep the two in sync; the unit
 * tests exercise this copy. Not used at runtime.
 *
 * Tile geometry follows plotly.js' `Drawing.pattern` (SVG tiles, `patternUnits="userSpaceOnUse"`),
 * in CSS px with y down, tiles from the origin:
 *
 * - `/` and `\`: 45° lines through the tile corners of a `size·√2` tile, so lines are `size` apart;
 *   `/` rises to the right (`x + y ≡ 0`), `\` falls (`x − y ≡ 0`). `x` is both.
 * - `-` and `|`: lines through the middle of a `size` tile (`y ≡ size/2`, `x ≡ size/2`); `+` is both.
 * - `.`: a dot in the middle of a `size` tile, clipped to it (large dots fill the tile).
 * - Line width: `solidity·size`; for the crossed shapes (`x`, `+`) `size·(1 − √(1 − solidity))`, so
 *   the covered fraction is `solidity` either way. Dot radius: `√(solidity·size²/π)` (area
 *   `solidity`) up to solidity π/4, where the dot touches the tile sides, then linear to `size/√2`
 *   (the whole tile) at 1.
 *
 * Coverage is anti-aliased with a box filter one device pixel (`aa` CSS px) wide: exact for lines
 * of any width (a line thinner than a pixel keeps its average intensity instead of vanishing or
 * turning into a full-intensity pixel), and area-preserving for dots smaller than a pixel.
 */

/** Width in CSS px of the lines of a line shape (code 1–6, see `PATTERN_SHAPES`). */
export function patternLineWidth(shape: number, size: number, solidity: number): number {
  return shape === 3 || shape === 6 ? size * (1 - Math.sqrt(1 - solidity)) : solidity * size;
}

/** Radius in CSS px of the dots of the `.` shape. */
export function patternDotRadius(size: number, solidity: number): number {
  const q = Math.PI / 4;
  return solidity < q
    ? Math.sqrt((solidity * size * size) / Math.PI)
    : size / 2 + ((solidity - q) / (1 - q)) * (size / Math.SQRT2 - size / 2);
}

/** Coverage of the stripe `|t| ≤ hw` by a box filter `aa` wide centred at `d`. */
function band(d: number, hw: number, aa: number): number {
  return clamp01((Math.min(d + aa / 2, hw) - Math.max(d - aa / 2, -hw)) / aa);
}

/** Coverage of lines `w` wide at `u ≡ o (mod s)`: the two nearest ones. */
function lines(u: number, o: number, s: number, w: number, aa: number): number {
  const d = mod(u - o, s);
  return Math.min(band(d, w / 2, aa) + band(s - d, w / 2, aa), 1);
}

/**
 * Foreground coverage (0–1) of pattern `shape` (code, see `PATTERN_SHAPES`) at `(x, y)` (CSS px,
 * y down) for tiles of `size` px and `solidity`, anti-aliased over `aa` px. 0 for no shape.
 */
export function patternCoverage(
  x: number,
  y: number,
  shape: number,
  size: number,
  solidity: number,
  aa: number,
): number {
  if (!(size > 0)) return 0;
  const k = Math.round(shape);
  const s = clamp01(solidity);
  if (k >= 1 && k <= 6) {
    const w = patternLineWidth(k, size, s);
    // Diagonals: u across the lines, spacing `size`; else horizontal / vertical middle lines.
    const diagonal = k <= 3;
    const a =
      k === 2 || k === 5
        ? 0
        : diagonal
          ? lines((x + y) * Math.SQRT1_2, 0, size, w, aa)
          : lines(y, size / 2, size, w, aa);
    const b =
      k === 1 || k === 4
        ? 0
        : diagonal
          ? lines((x - y) * Math.SQRT1_2, 0, size, w, aa)
          : lines(x, size / 2, size, w, aa);
    return Math.max(a, b);
  }
  if (k === 7) {
    const r = patternDotRadius(size, s);
    const d = Math.hypot(mod(x, size) - size / 2, mod(y, size) - size / 2);
    // Dots under a pixel: a pixel-wide dot at the dot's average intensity.
    const re = Math.max(r, aa / 2);
    return clamp01((re - d) / aa + 0.5) * ((r * r) / (re * re));
  }
  return 0;
}

/** GLSL `mod`: `a − b·floor(a/b)`, in `[0, b)`. */
function mod(a: number, b: number): number {
  return a - b * Math.floor(a / b);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
