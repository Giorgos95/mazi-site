// The invite page's logic is shared with the Mazí app: its script changes
// only on purpose, on main, and the page must keep behaving the way it always has.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './serve.mjs';
import { launch } from './browser.mjs';
import { baseline, readFile } from './baseline.mjs';
import { BOOT } from './pages.mjs';

const html = readFile('join.html');
// Inline scripts other than the theme boot script, which every page carries.
// The baseline may hold an older boot script, so any script that only picks
// the theme is left out, not just today's.
const isBoot = (x) => x === BOOT || /^<script>\(function\(d\)\{var t;try\{t=localStorage\.getItem\('mazi-theme'\)\}[^<]*<\/script>$/.test(x);
const inlineScript = (s) => [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[0]).filter((x) => !isBoot(x));

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
  for (const id of 'invite code copy bad android android-open play apple ios ios-open desktop step-code heading lead code-label ios-have qr step-get step-account'.split(' ')) {
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

// iPhone has no install referrer, so the App Store button copies the code on
// the way for the app's Paste button. The store link must still be followed.
test('iphone app store tap copies the code', async () => {
  await withPage('/join?code=ABCD2345', { userAgent: IPHONE }, async (page) => {
    await page.eval(`(() => {
      window.__copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } },
      });
      window.__followed = null;
      window.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (!a) return;
        window.__followed = e.defaultPrevented ? 'prevented' : a.href;
        e.preventDefault();
      });
    })()`);
    await page.click('#apple');
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(await page.eval('window.__copied'), ['ABCD2345']);
    assert.ok((await page.eval('window.__followed')).startsWith('https://apps.apple.com/'));
    assert.equal(await page.eval(`document.getElementById('copy').textContent`), 'Copied');
    assert.match(await page.eval(`document.getElementById('step-code').textContent`), /App Store button copies your code/);
    assert.deepEqual(page.errors, []);
  });
});

// Android brings the code through Play, so its steps say so and nothing is copied.
test('android keeps its own steps', async () => {
  await withPage('/join?code=ABCD2345', { userAgent: ANDROID }, async (page) => {
    assert.match(await page.eval(`document.getElementById('step-code').textContent`), /already filled in/);
  });
});

// A phone set to Greek reads the page in Greek; nearly every invite is sent from Mazí in Greek.
const GREEK = `Object.defineProperty(navigator, 'languages', { get: () => ['el-GR', 'el', 'en'] });
Object.defineProperty(navigator, 'language', { get: () => 'el-GR' });`;
const text = (page, id) => page.eval(`document.getElementById('${id}').textContent`);

test('greek phone reads greek', async () => {
  await withPage('/join?code=ABCD2345', { userAgent: ANDROID, initScript: GREEK }, async (page) => {
    assert.equal(await page.eval('document.documentElement.lang'), 'el');
    assert.equal(await page.eval('document.title'), 'Πρόσκληση στο Mazí');
    assert.match(await text(page, 'heading'), /Σας προσκάλεσαν/);
    assert.equal(await text(page, 'copy'), 'Αντιγραφή κωδικού');
    assert.equal(await text(page, 'android-open'), 'Άνοιγμα στο Mazí');
    assert.match(await text(page, 'step-code'), /ήδη συμπληρωμένος/);
    assert.match(await text(page, 'step-code'), /«Μπείτε σε υπάρχον»/);
    assert.equal(await text(page, 'code'), 'ABCD2345');
    assert.deepEqual(page.errors, []);
  });
});

test('greek iphone keeps its copy step', async () => {
  await withPage('/join?code=ABCD2345', { userAgent: IPHONE, initScript: GREEK }, async (page) => {
    assert.match(await text(page, 'step-code'), /Το κουμπί του App Store αντιγράφει/);
    assert.equal(await text(page, 'ios-have'), 'Έχετε ήδη το Mazí;');
  });
});

test('greek missing code', async () => {
  await withPage('/join', { initScript: GREEK }, async (page) => {
    assert.ok(await visible(page, 'bad'));
    assert.match(await text(page, 'bad'), /λείπει ο κωδικός/);
  });
});

test('?lang= wins over the phone', async () => {
  await withPage('/join?code=ABCD2345&lang=en', { userAgent: ANDROID, initScript: GREEK }, async (page) => {
    assert.equal(await page.eval('document.documentElement.lang'), 'en');
    assert.match(await text(page, 'heading'), /You're invited/);
  });
  await withPage('/join?code=ABCD2345&lang=el', { userAgent: ANDROID }, async (page) => {
    assert.match(await text(page, 'heading'), /Σας προσκάλεσαν/);
  });
});

test('an english phone stays english', async () => {
  await withPage('/join?code=ABCD2345', { userAgent: ANDROID }, async (page) => {
    assert.equal(await page.eval('document.documentElement.lang'), 'en');
    assert.match(await text(page, 'step-code'), /already filled in/);
  });
});

// On a computer the same invite shows as a QR code for the phone's camera.
const qrDrawn = (page) => page.eval(`(() => {
  const p = document.querySelector('#qr svg path');
  return !!p && p.getAttribute('d').length > 100;
})()`);
async function waitFor(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)); }
  return false;
}

test('desktop draws a qr code of the invite', async () => {
  await withPage('/join?code=ABCD2345', {}, async (page) => {
    assert.ok(await visible(page, 'qr'));
    assert.ok(await waitFor(() => qrDrawn(page)), 'qr drawn');
    assert.match(await text(page, 'desktop'), /camera/);
    assert.equal(await attr(page, 'qr', 'role'), 'img');
    const box = await page.eval(`JSON.stringify(document.getElementById('qr').getBoundingClientRect())`);
    const { width, height } = JSON.parse(box);
    assert.ok(width >= 196 && width === height, `square, ${width}x${height}`);
    assert.deepEqual(page.errors, []);
  });
});

test('greek desktop says it in greek', async () => {
  await withPage('/join?code=ABCD2345', { initScript: GREEK }, async (page) => {
    assert.ok(await waitFor(() => qrDrawn(page)), 'qr drawn');
    assert.match(await text(page, 'desktop'), /κάμερα/);
    assert.equal(await attr(page, 'qr', 'aria-label'), 'Κωδικός QR για αυτή την πρόσκληση');
  });
});

test('no qr code without a code, and none on a phone', async () => {
  await withPage('/join', {}, async (page) => {
    assert.ok(!(await visible(page, 'qr')));
    assert.match(await text(page, 'desktop'), /Open this link on your phone/);
  });
  for (const userAgent of [ANDROID, IPHONE]) {
    await withPage('/join?code=ABCD2345', { userAgent }, async (page) => {
      await new Promise((r) => setTimeout(r, 300));
      assert.ok(!(await visible(page, 'qr')));
      assert.equal(await page.eval(`document.querySelectorAll('script[src*="qrcode"]').length`), 0);
    });
  }
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
