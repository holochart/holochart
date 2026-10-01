import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, sep } from 'node:path';

/** Port of the fixtures' static server (dedicated; the other suites use 5198/5199). */
export const PORT = Number(process.env.PACKAGE_PORT ?? 5891);
export const HOST = '127.0.0.1';
export const BASE = `http://${HOST}:${PORT}`;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.otf': 'font/otf',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/**
 * A static file server for `root` on {@link PORT}, like any web server or CDN would serve the
 * files: symlinks (pnpm's `node_modules`) are followed but must stay inside `root`.
 */
export function serveStatic(root: string): Promise<Server> {
  const base = realpathSync(root);
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', BASE).pathname);
    let file: string;
    try {
      file = realpathSync(join(base, pathname));
      if (!file.startsWith(base + sep)) throw new Error('outside root');
      if (statSync(file).isDirectory()) file = realpathSync(join(file, 'index.html'));
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, () => resolve(server));
  });
}
