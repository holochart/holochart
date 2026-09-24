/**
 * Imported before the root Playwright config, whose sandbox server and `baseURL` read
 * `VISUAL_PORT` when the module loads: the gallery gets its own port (default 5198, override with
 * `GALLERY_PORT`), so it never reuses or races a visual-suite server on 5199.
 */
process.env['VISUAL_PORT'] = process.env['GALLERY_PORT'] ?? '5198';

export {};
