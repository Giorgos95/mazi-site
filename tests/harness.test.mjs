// Checks the test tools themselves, against today's site.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';
import { launch } from './browser.mjs';
import { baseline, headParts, readFile } from './baseline.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.close(); });

const get = (path, headers = {}) => fetch(server.origin + path, { redirect: 'manual', headers });

test('serves pages without .html', async () => {
  const res = await get('/faq');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Questions about Mazí/);
});

test('redirects .html addresses', async () => {
  const res = await get('/faq.html');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/faq');
});

test('unknown addresses get the 404 page', async () => {
  const res = await get('/nope/deeper');
  assert.equal(res.status, 404);
  assert.match(await res.text(), /There is no page here/);
});

test('does not publish docs or tests', async () => {
  // .superpowers holds the brainstorm and the review notes: git ignores it,
  // but a wrangler deploy from this folder would publish it.
  for (const p of ['/docs/superpowers/specs/2026-11-04-site-redesign-design.md', '/tests/serve.mjs',
    '/.superpowers/sdd/2026-11-04-site-redesign/final-fix-brief.md']) {
    assert.equal((await get(p)).status, 404, p);
  }
});

test('compresses text', async () => {
  // fetch decodes the body for us, but the header still says what was sent.
  const res = await get('/', { 'Accept-Encoding': 'br' });
  assert.equal(res.headers.get('content-encoding'), 'br');
});

test('the browser loads the homepage cleanly', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const { status } = await page.goto(server.origin + '/');
    assert.equal(status, 200);
    assert.deepEqual(page.errors, []);
  } finally {
    await browser.close();
  }
});

test('baseline reads the old homepage', () => {
  assert.equal(headParts(baseline('index.html')).canonical, 'https://meetmazi.com/');
});

// Git on Windows (core.autocrlf) checks files out with CRLF line endings,
// while git show gives LF. The comparisons are about content, not that.
test('a CRLF checkout of a page reads the same as its LF baseline', () => {
  const was = baseline('join.html');
  assert.ok(!was.includes('\r'), 'the baseline has CRLF line endings');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mazi-crlf-'));
  try {
    const file = path.join(dir, 'join.html');
    fs.writeFileSync(file, was.replace(/\n/g, '\r\n'));
    assert.notEqual(fs.readFileSync(file, 'utf8'), was, 'the copy is not CRLF');
    assert.equal(readFile(file), was);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
