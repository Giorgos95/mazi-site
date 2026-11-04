// The invite page's logic is shared with the Mazí app: its script must not
// change, and the page must keep behaving the way it always has.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './serve.mjs';
import { launch } from './browser.mjs';
import { baseline, readFile } from './baseline.mjs';
import { BOOT } from './pages.mjs';

const html = readFile('join.html');
// Inline scripts other than the theme boot script, which every page carries.
const inlineScript = (s) => [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[0]).filter((x) => x !== BOOT);

let server, browser;
before(async () => { server = await startServer({ fixtures: true }); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function withPage(url, opts, fn) {
  const page = await browser.newPage(opts);
  try {
    const res = await page.goto(server.origin + url);
    return await fn(page, res);
  } finally {
    await page.close();
  }
}
const visible = (page, id) => page.eval(`(() => { const e = document.getElementById('${id}'); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; })()`);
const attr = (page, id, name) => page.eval(`document.getElementById('${id}').getAttribute('${name}')`);

test('script is byte-identical', () => {
  const now = inlineScript(html);
  const was = inlineScript(baseline('join.html'));
  assert.equal(was.length, 1);
  assert.deepEqual(now, was);
});

test('every id the script uses exists', () => {
  for (const id of 'invite code copy bad android android-open play apple ios ios-open desktop step-code'.split(' ')) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test('desktop with a code', async () => {
  await withPage('/join?code=ABCD2345', {}, async (page) => {
    assert.ok(await visible(page, 'invite'));
    assert.equal(await page.eval(`document.getElementById('code').textContent`), 'ABCD2345');
    assert.ok(await visible(page, 'desktop'));
    assert.ok((await page.eval(`document.getElementById('play').href`)).endsWith('%26code%3DABCD2345'));
    assert.deepEqual(page.errors, []);
  });
});

test('android', async () => {
  await withPage('/join?code=ABCD2345', { userAgent: ANDROID }, async (page) => {
    assert.ok(await visible(page, 'android'));
    assert.ok((await attr(page, 'android-open', 'href')).startsWith('intent://join?code=ABCD2345#Intent;scheme=mazi;package=com.mazi.family;'));
    assert.ok(!(await visible(page, 'apple')));
  });
});

test('iphone', async () => {
  await withPage('/join?code=ABCD2345', { userAgent: IPHONE }, async (page) => {
    assert.ok(await visible(page, 'ios'));
    assert.equal(await attr(page, 'ios-open', 'href'), 'mazi://join?code=ABCD2345');
    assert.ok(!(await visible(page, 'play')));
  });
});

test('missing code', async () => {
  await withPage('/join', {}, async (page) => {
    assert.ok(await visible(page, 'bad'));
    assert.ok(!(await visible(page, 'invite')));
  });
});

test('404 status and look', async () => {
  await withPage('/nope/deeper', {}, async (page, { status }) => {
    assert.equal(status, 404);
    await new Promise((r) => setTimeout(r, 800));
    assert.deepEqual(page.errors, []);
    assert.equal(await page.eval(`document.querySelectorAll('[data-i-pose="dizzy"] svg').length`), 1);
  });
});
