// A local server that answers like Cloudflare does for this repo (see
// _redirects, wrangler.jsonc and .assetsignore), so tests and Giorgos see the
// same thing the live site will show.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.svg', '.json', '.txt', '.xml']);

// The "from to 301" lines of _redirects, as a map.
function readRedirects() {
  const redirects = new Map();
  for (const line of fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8').split('\n')) {
    const [from, to, status] = line.trim().split(/\s+/);
    if (from && !from.startsWith('#') && status === '301') redirects.set(from, to);
  }
  return redirects;
}

// Every entry of .assetsignore is a file or folder at the root of the repo.
function readIgnored() {
  return fs.readFileSync(path.join(ROOT, '.assetsignore'), 'utf8').split('\n')
    .map((l) => l.trim().replace(/^\/|\/$/g, '')).filter((l) => l && !l.startsWith('#'));
}

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

// The tests listen on this computer only; host '0.0.0.0' also lets a phone on
// the same network in.
export function startServer({ port = 0, fixtures = false, host = '127.0.0.1' } = {}) {
  const redirects = readRedirects();
  const ignored = readIgnored();

  // Which file answers this address? null means "no page here".
  function resolve(pathname) {
    if (fixtures && pathname.startsWith('/__test/')) {
      const file = path.resolve(FIXTURES, '.' + pathname.slice('/__test'.length));
      return file.startsWith(FIXTURES + path.sep) && isFile(file) ? file : null;
    }
    if (ignored.includes(pathname.split('/')[1])) return null;
    const rel = pathname === '/' ? '/index.html' : pathname;
    for (const file of [path.join(ROOT, rel), path.join(ROOT, rel + '.html')]) {
      // Never serve anything outside the repo.
      if (file.startsWith(ROOT + path.sep) && isFile(file)) return file;
    }
    return null;
  }

  function send(req, res, status, file) {
    const ext = path.extname(file);
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
    let body = fs.readFileSync(file);
    if (COMPRESSIBLE.has(ext)) {
      headers.Vary = 'Accept-Encoding';
      if (/\bbr\b/.test(req.headers['accept-encoding'] || '')) {
        body = zlib.brotliCompressSync(body);
        headers['Content-Encoding'] = 'br';
      }
    }
    headers['Content-Length'] = body.length;
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { pathname = '/__nope__'; }
    if (pathname.includes('\0') || pathname.split('/').includes('..')) pathname = '/__nope__';

    if (redirects.has(pathname)) {
      res.writeHead(301, { Location: redirects.get(pathname) });
      return res.end();
    }
    const file = resolve(pathname);
    if (file) return send(req, res, 200, file);
    send(req, res, 404, path.join(ROOT, '404.html'));
  });

  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => ok({
      origin: `http://localhost:${server.address().port}`,
      close: () => new Promise((done) => { server.close(() => done()); server.closeAllConnections(); }),
    }));
  });
}

// `node tests/serve.mjs` is how to click through the branch, on this
// computer or on a phone on the same Wi-Fi (at one of the other addresses).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = 8788;
  await startServer({ port, host: '0.0.0.0' });
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((a) => a && (a.family === 'IPv4' || a.family === 4) && !a.internal).map((a) => a.address);
  for (const host of ['localhost', ...ips]) console.log(`http://${host}:${port}`);
}
