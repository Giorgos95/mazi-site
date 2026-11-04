// The í and the letter family (assets/mascot-1.js), in Chrome.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './serve.mjs';
import { launch } from './browser.mjs';

let server, browser;
before(async () => { server = await startServer({ fixtures: true }); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const POSES = ['idle', 'wave', 'joy', 'cheeky', 'surprised', 'sleepy', 'phone', 'strain', 'sad', 'push', 'stir', 'awake', 'dizzy'];

// A tab on the fixture, with the module loaded as window.M. Closed after fn.
async function withPage(opts, fn) {
  const page = await browser.newPage(opts);
  try {
    await page.goto(server.origin + '/__test/mascot.html');
    return await fn(page);
  } finally {
    await page.close();
  }
}

// Draws a letter into a box, waits for the fonts, and dresses it.
const DRESS = (id, ch, colour) => `(async () => {
  const box = document.getElementById(${JSON.stringify(id)});
  box.innerHTML = M.letterSvg(${JSON.stringify(ch)});
  await document.fonts.ready;
  M.dressLetter(box, ${JSON.stringify(colour)});
})()`;

test('every pose draws', async () => {
  await withPage({}, async (page) => {
    const bad = await page.eval(`${JSON.stringify(POSES)}.filter((p) => {
      const s = M.iSvg(p);
      return !s.includes('viewBox="0 0 220 240"') || !s.includes('aria-hidden="true"');
    })`);
    assert.deepEqual(bad, []);
    assert.deepEqual(await page.eval('M.POSE_NAMES'), POSES);
  });
});

test('unknown poses throw', async () => {
  await withPage({}, async (page) => {
    assert.equal(await page.eval(`(() => { try { M.iSvg('nope'); } catch (e) { return e.message; } })()`), 'unknown pose: nope');
  });
});

test("the body is the promo's", async () => {
  await withPage({}, async (page) => {
    const svg = await page.eval(`M.iSvg('idle')`);
    assert.ok(svg.includes('x="86" y="72" width="48" height="130" rx="24"'));
    assert.ok(svg.includes('rotate(35 121 53)'));
  });
});

test('act returns to the base pose', async () => {
  await withPage({}, async (page) => {
    await page.eval(`window.b = new M.Buddy(document.createElement('div'), 'idle'); b.act('joy', 200)`);
    assert.equal(await page.eval('b.el.dataset.pose'), 'joy');
    await sleep(400);
    assert.equal(await page.eval('b.el.dataset.pose'), 'idle');
  });
});

test('drawAll draws and reacts', async () => {
  await withPage({}, async (page) => {
    assert.equal(await page.eval(`document.querySelectorAll('.fi svg').length`), 0, 'nothing draws until drawAll');
    assert.equal(await page.eval('M.drawAll().length'), 1);
    assert.equal(await page.eval(`document.querySelectorAll('.fi svg').length`), 1);
    assert.equal(await page.eval(`document.querySelector('.fi').parentElement.querySelectorAll('.prop').length`), 1);
    assert.equal(await page.eval(`document.querySelector('.fi .say').getAttribute('aria-hidden')`), 'true');
    await page.click('.fi');
    assert.equal(await page.eval(`document.querySelector('.fi').classList.contains('hop')`), true);
    assert.equal(await page.eval(`document.querySelector('.say.show')?.textContent`), 'hi! 👋');
    // The bubble survives a redraw, and there is still one í.
    assert.equal(await page.eval(`document.querySelectorAll('.fi svg').length`), 1);
    assert.equal(await page.eval(`document.querySelectorAll('.fi .say').length`), 1);
  });
});

test('eyes follow the pointer', async () => {
  await withPage({}, async (page) => {
    await page.eval('M.drawAll()');
    const [x, y] = await page.eval(`(() => { const r = document.querySelector('.fi').getBoundingClientRect(); return [r.right + 400, r.top + r.height * .44]; })()`);
    await page.moveMouse(x, y);
    await sleep(200);
    const t = await page.eval(`document.querySelector('.fi .look').getAttribute('transform')`);
    const dx = Number(/translate\(([-\d.]+)/.exec(t)?.[1]);
    assert.ok(dx > 0, `transform was ${t}`);
    assert.ok(dx <= 3.2 + 1e-6, `transform was ${t}`);
  });
});

test('letters get legs in their colour', async () => {
  await withPage({}, async (page) => {
    await page.eval(DRESS('cl-1', 'M', '#E64980'));
    assert.equal(await page.eval(`document.querySelectorAll('#cl-1 ellipse[fill="#E64980"]').length`), 2);
  });
});

test('dressLetter shrugs off a box with nothing to measure', async () => {
  await withPage({}, async (page) => {
    await page.eval(`M.dressLetter(document.getElementById('cl-2'), '#E64980')`);
    assert.deepEqual(page.errors, []);
  });
});

// Safari before 15.4 has no Object.hasOwn.
test('works without Object.hasOwn', async () => {
  await withPage({ initScript: 'delete Object.hasOwn' }, async (page) => {
    assert.equal(await page.eval('typeof Object.hasOwn'), 'undefined');
    assert.equal(await page.eval('M.drawAll().length'), 1);
    assert.equal(await page.eval(`(() => { try { M.iSvg('nope'); } catch (e) { return e.message; } })()`), 'unknown pose: nope');
    assert.equal(await page.eval(`(() => { try { M.propHtml('nope'); } catch (e) { return e.message; } })()`), 'unknown prop: nope');
    assert.deepEqual(page.errors, []);
  });
});

test('letters survive a missing font', async () => {
  await withPage({ blockUrls: ['*fredoka.woff2'] }, async (page) => {
    await page.eval(DRESS('cl-1', 'M', '#3B5BDB'));
    assert.deepEqual(page.errors, []);
    assert.equal(await page.eval(`document.querySelectorAll('#cl-1 svg text').length`), 1);
  });
});
