// Opens every page in Chrome: day and night, desktop and phone, without
// JavaScript and with reduced motion, then checks the day/night switch.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './serve.mjs';
import { launch } from './browser.mjs';
import { PAGES } from './pages.mjs';
import { CONTRAST_JS } from './contrast.mjs';

let server, browser;
before(async () => { server = await startServer({ fixtures: true }); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUNNING = `document.getAnimations().filter((a) => a.playState === 'running').length`;
const THEME_COLOURS = `[...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content)`;

// A new tab on the page. It is closed after fn, pass or fail.
async function withPage(path, opts, fn) {
  const page = await browser.newPage(opts);
  try {
    const res = await page.goto(server.origin + path);
    return await fn(page, res);
  } finally {
    await page.close();
  }
}

// Tabs share localStorage, so a test that picks a theme forgets it after.
const forget = () => withPage('/privacy', {}, (page) => page.eval('localStorage.clear()'));

for (const { path, kind, pose, prop } of PAGES) {
  test(`${path}: no errors, day and night, desktop and 360px phone`, async () => {
    for (const colorScheme of ['light', 'dark']) {
      for (const width of [1280, 360]) {
        const setup = `${colorScheme} ${width}px`;
        await withPage(path, { colorScheme, width, height: width > 400 ? 900 : 780, mobile: width <= 400 }, async (page, { status }) => {
          assert.equal(status, kind === '404' ? 404 : 200, setup);
          assert.deepEqual(page.errors, [], setup);
          // On a phone Chrome zooms out to fit anything too wide, which makes innerWidth grow too.
          const [inner, scroll] = await page.eval('[innerWidth, document.documentElement.scrollWidth]');
          assert.equal(inner, width, `${setup}: the page was zoomed out to fit something wider`);
          assert.ok(scroll <= inner, `${setup}: scrolls sideways (${scroll} > ${inner})`);
          assert.equal(await page.eval('document.documentElement.dataset.theme'), colorScheme === 'dark' ? 'night' : 'day', setup);
        });
      }
    }
  });

  test(`${path}: readable without JavaScript`, async () => {
    await withPage(path, { javascript: false }, async (page) => {
      const h1 = await page.eval(`(() => { const r = document.querySelector('h1').getBoundingClientRect(); return [r.width, r.height]; })()`);
      assert.ok(h1[0] > 0 && h1[1] > 0, 'the h1 has no box');
      assert.equal(await page.eval(`document.querySelectorAll('.pending').length`), 0);
      assert.equal(await page.eval(`getComputedStyle(document.getElementById('theme-switch')).display`), 'none');
    });
  });

  test(`${path}: contrast passes, day and night`, async () => {
    for (const colorScheme of ['light', 'dark']) {
      await withPage(path, { colorScheme }, async (page) => {
        assert.deepEqual(await page.eval(CONTRAST_JS), [], colorScheme);
      });
    }
  });

  // Fonts and the í arrive after the first paint; nothing may move when they do.
  test(`${path}: nothing shifts`, async () => {
    await withPage(path, {}, async (page) => {
      await page.eval(`window.shift = 0; new PerformanceObserver((list) => { for (const e of list.getEntries()) window.shift += e.value; }).observe({ type: 'layout-shift', buffered: true })`);
      await sleep(2500);
      const shift = await page.eval('window.shift');
      assert.ok(shift < 0.01, `layout shift ${shift}`);
    });
  });

  if (pose) {
    test(`${path}: the í appears in its pose with its prop`, async () => {
      await withPage(path, {}, async (page) => {
        await sleep(800);
        assert.equal(await page.eval(`document.querySelectorAll('[data-i-pose] svg').length`), 1, 'the í is not drawn');
        assert.equal(await page.eval(`document.querySelector('[data-i-pose]').dataset.pose`), pose);
        if (prop) {
          const sel = prop === 'thoughts' ? '.fstage .thought' : '.fstage .prop';
          assert.ok(await page.eval(`document.querySelectorAll('${sel}').length`) > 0, 'the prop is missing');
        }
        assert.deepEqual(page.errors, []);
      });
    });
  }

  // A stage is drawn for 460px; on a phone it is narrower, and the í must
  // not end up standing on the screenshot.
  if (kind === 'feature' || kind === 'home') {
    test(`${path}: at 360px each í stays clear of its phone`, async () => {
      await withPage(path, { width: 360, height: 780, mobile: true }, async (page) => {
        await sleep(500);
        const stages = await page.eval(`[...document.querySelectorAll('.fstage')].map((stage) => {
          const box = (el) => el.getBoundingClientRect();
          const s = box(stage), i = box(stage.querySelector('.fi')), phone = box(stage.querySelector('.fphone'));
          return { left: s.left, right: s.right, gap: phone.left - i.right };
        })`);
        assert.ok(stages.length > 0, 'no stage');
        for (const [n, s] of stages.entries()) {
          assert.ok(s.left >= 0 && s.right <= 360, `stage ${n} is wider than the screen`);
          assert.ok(s.gap >= 0, `stage ${n}: the í overlaps the phone by ${Math.round(-s.gap)}px`);
        }
      });
    });
  }

  test(`${path}: reduced motion stops everything`, async () => {
    try {
      await withPage(path, { reducedMotion: true }, async (page) => {
        await sleep(1000);
        assert.equal(await page.eval(RUNNING), 0, 'after load');
        // Flipping the theme would slide the switch and fade the colours.
        await page.click('#theme-switch');
        await sleep(50);
        assert.equal(await page.eval(RUNNING), 0, 'after the switch');
      });
    } finally {
      await forget();
    }
  });
}

// ---------- Speech bubbles ----------

// The page's column keeps 1.25rem clear at each side of the screen; a bubble
// stays inside it, and never makes the page wider than the screen.
const OUTSIDE = (width) => `(() => {
  const out = [];
  for (const b of document.querySelectorAll('.say.show')) {
    const r = b.getBoundingClientRect();
    const column = b.closest('.wrap, .article');
    const pad = column ? parseFloat(getComputedStyle(column).paddingLeft) : 0;
    if (r.left < pad - 0.5 || r.right > ${width} - pad + 0.5) out.push(b.textContent + ' at ' + r.left.toFixed(1) + '..' + r.right.toFixed(1));
  }
  if (innerWidth !== ${width}) out.push('the page grew to ' + innerWidth + 'px');
  if (document.documentElement.scrollWidth > ${width}) out.push('the page scrolls sideways to ' + document.documentElement.scrollWidth + 'px');
  return out;
})()`;
const DEFAULT_LINES = `import('/assets/mascot-1.js').then((m) => m.DEFAULT_REACTIONS.map(([, text]) => text))`;

// The í beside the title stands at the right edge of a phone's screen.
for (const path of ['/faq', '/join', '/nope/deeper']) {
  test(`${path}: what the í says stays on a 360px screen`, async () => {
    await withPage(path, { width: 360, height: 780, mobile: true }, async (page) => {
      await sleep(500);
      for (const line of await page.eval(DEFAULT_LINES)) {
        await page.click('[data-i-pose]');
        await sleep(400);
        assert.deepEqual(await page.eval(`[...document.querySelectorAll('.say.show')].map((b) => b.textContent)`), [line]);
        assert.deepEqual(await page.eval(OUTSIDE(360)), [], line);
      }
      assert.deepEqual(page.errors, []);
    });
  });
}

// Every bubble on every page, with every line it can say, from a small phone
// to a desktop. The homepage's own lines are listed here; every other í says
// DEFAULT_REACTIONS. Motion is off, so each bubble is at once where it ends up.
const OWN_LINES = {
  '#hero .say': ['hi! 👋', 'hehe', 'checking the list…', 'oh! you again', 'yes! that one!', 'is it bedtime already?', 'good morning! ☀️'],
  '#sort-i .say': ['help…', 'watch this', 'that\'s better 😌', 'oh no, not again', 'much better.', 'press the button 🥺'],
  '#fam [data-who="Maria"] .say': ['parents’ evening, don’t let me forget'],
  '#fam [data-who="George"] .say': ['bins are mine today'],
  '#fam [data-who="Sofia"] .say': ['football on saturday!!'],
};
test('every speech bubble stays on the screen at 320 to 1280px', async () => {
  for (const { path } of PAGES) {
    await withPage(path, { reducedMotion: true }, async (page) => {
      await sleep(500);
      if (!(await page.eval(`document.querySelectorAll('.say').length`))) return;
      const defaults = await page.eval(DEFAULT_LINES);
      for (const width of [320, 360, 390, 768, 1024, 1280]) {
        await page.send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width <= 1024 });
        const outside = await page.eval(`(async () => {
          const own = ${JSON.stringify(OWN_LINES)};
          const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const out = [];
          for (const b of document.querySelectorAll('.say')) {
            const lines = Object.entries(own).find(([s]) => b.matches(s))?.[1] ?? ${JSON.stringify(defaults)};
            for (const line of lines) {
              b.textContent = line;
              b.classList.add('show');
              await frame();
              out.push(...${OUTSIDE(width)});
              b.classList.remove('show');
            }
          }
          return out;
        })()`);
        assert.deepEqual(outside, [], `${path} at ${width}px`);
      }
    });
  }
});

// The contrast test above runs with motion on, so every section below the
// fold is waiting to rise in (opacity 0). It must still be measured.
test('contrast measures sections still waiting to rise in', async () => {
  await withPage('/__test/contrast.html', { colorScheme: 'light' }, async (page) => {
    assert.equal(await page.eval(`document.querySelectorAll('.reveal.pending').length`), 1, 'the section is hidden, waiting');
    assert.deepEqual((await page.eval(CONTRAST_JS)).map((f) => f.text), ['Too faint, below the fold']);
    assert.deepEqual(page.errors, []);
  });
});

test('the switch flips and remembers', async () => {
  try {
    await withPage('/privacy', { colorScheme: 'light' }, async (page) => {
      assert.equal(await page.eval('document.documentElement.dataset.theme'), 'day');
      await page.eval(`document.addEventListener('mazi:theme', (e) => { window.heard = e.detail; })`);
      await page.click('#theme-switch');
      assert.equal(await page.eval('document.documentElement.dataset.theme'), 'night');
      assert.equal(await page.eval(`document.getElementById('theme-switch').getAttribute('aria-pressed')`), 'true');
      assert.equal(await page.eval(`localStorage.getItem('mazi-theme')`), 'night');
      assert.deepEqual(await page.eval(THEME_COLOURS), ['#141E33', '#141E33']);
      assert.deepEqual(await page.eval('window.heard'), { theme: 'night', byUser: true });
    });
    await withPage('/terms', { colorScheme: 'light' }, async (page) => {
      assert.equal(await page.eval('document.documentElement.dataset.theme'), 'night');
      assert.equal(await page.eval(`document.getElementById('theme-switch').getAttribute('aria-pressed')`), 'true');
    });
  } finally {
    await forget();
  }
});

test('a stored choice beats the system', async () => {
  try {
    await withPage('/privacy', {}, (page) => page.eval(`localStorage.setItem('mazi-theme', 'day')`));
    await withPage('/privacy', { colorScheme: 'dark' }, async (page) => {
      assert.equal(await page.eval('document.documentElement.dataset.theme'), 'day');
      assert.deepEqual(await page.eval(THEME_COLOURS), ['#FFF7EC', '#FFF7EC']);
    });
  } finally {
    await forget();
  }
});

// Back restores the page from the back-forward cache as it was left, so it
// must take up a choice made on the page the visitor came back from.
test('Back shows the choice made on the next page', async () => {
  try {
    // A choice is stored all along, so the system theme plays no part.
    await withPage('/privacy', {}, (page) => page.eval(`localStorage.setItem('mazi-theme', 'day')`));
    let restored = false;
    // Chrome now and then empties its cache; the page then simply loads
    // again, which proves nothing here, so that try does not count.
    for (let attempt = 0; attempt < 3 && !restored; attempt++) {
      await withPage('/privacy', { colorScheme: 'light' }, async (page) => {
        await page.eval('window.left = true');
        assert.equal(await page.eval('document.documentElement.dataset.theme'), 'day');
        await page.goto(server.origin + '/terms');
        await page.click('#theme-switch');
        assert.equal(await page.eval('document.documentElement.dataset.theme'), 'night');
        await page.eval('history.back()');
        await sleep(800);
        if (!(await page.eval('window.left === true'))) return;
        restored = true;
        assert.equal(await page.eval('location.pathname'), '/privacy');
        assert.equal(await page.eval('document.documentElement.dataset.theme'), 'night');
        assert.equal(await page.eval(`document.getElementById('theme-switch').getAttribute('aria-pressed')`), 'true');
        assert.deepEqual(await page.eval(THEME_COLOURS), ['#141E33', '#141E33']);
        assert.deepEqual(page.errors, []);
      });
    }
    assert.ok(restored, 'Chrome never restored the page from its back-forward cache');
  } finally {
    await forget();
  }
});

// Review Focus 1: Safari with storage blocked, and some private modes, throw on any use of localStorage.
test('storage that throws does not break the switch', async () => {
  const initScript = `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked') } })`;
  await withPage('/privacy', { colorScheme: 'light', initScript }, async (page) => {
    assert.equal(await page.eval('document.documentElement.dataset.theme'), 'day');
    await page.click('#theme-switch');
    assert.equal(await page.eval('document.documentElement.dataset.theme'), 'night');
    await page.click('#theme-switch');
    assert.equal(await page.eval('document.documentElement.dataset.theme'), 'day');
    // Shown again from the back-forward cache, it keeps what was picked here.
    await page.eval(`dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))`);
    assert.equal(await page.eval('document.documentElement.dataset.theme'), 'day');
    assert.deepEqual(page.errors, []);
  });
});

// Review Focus 2: the system goes dark (at sunset, say) while the page is open.
test('follows the system while no choice is stored', async () => {
  try {
    await withPage('/privacy', { colorScheme: 'light' }, async (page) => {
      const themeWithin = async (ms, want) => {
        let theme;
        for (const end = Date.now() + ms; Date.now() < end; await sleep(25)) {
          theme = await page.eval('document.documentElement.dataset.theme');
          if (theme === want) break;
        }
        return theme;
      };
      await page.eval(`document.addEventListener('mazi:theme', (e) => { window.heard = e.detail; })`);
      await page.media({ colorScheme: 'dark' });
      assert.equal(await themeWithin(500, 'night'), 'night');
      assert.deepEqual(await page.eval('window.heard'), { theme: 'night', byUser: false });
      assert.equal(await page.eval(`document.getElementById('theme-switch').getAttribute('aria-pressed')`), 'true');

      // Once the visitor has used the switch, their choice stays put.
      await page.click('#theme-switch');
      await page.media({ colorScheme: 'light' });
      await page.media({ colorScheme: 'dark' });
      await sleep(300);
      assert.equal(await page.eval('document.documentElement.dataset.theme'), 'day');
    });
  } finally {
    await forget();
  }
});
