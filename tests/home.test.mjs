// The homepage in Chrome: its sections in order, the hero í beside the Today
// screen, the four features, and Mazí spelled by the family at the end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { launch } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { width: 360, height: 780, mobile: true };

// A new tab on the page. It is closed after fn, pass or fail.
async function withPage(url, opts, fn) {
  const page = await browser.newPage(opts);
  try {
    await page.goto(server.origin + url);
    return await fn(page);
  } finally {
    await page.close();
  }
}

// Tabs share localStorage, so a test that uses the switch forgets it after.
const forget = () => withPage('/', {}, (page) => page.eval('localStorage.clear()'));

// Asks the page again and again until the answer is truthy, or ms have passed.
async function until(page, expression, ms = 3000) {
  for (const end = Date.now() + ms; ; await sleep(50)) {
    const value = await page.eval(expression);
    if (value || Date.now() > end) return value;
  }
}

const HERO_STATE = `[document.querySelector('#hero [data-pose]').dataset.pose, document.querySelector('#hero .say').textContent, document.querySelector('#hero .say').classList.contains('show')]`;
const CTA_DRAWN = `document.querySelectorAll('#get .cta-row svg').length === 4`;

test('sections in order', async () => {
  await withPage('/', {}, async (page) => {
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('main > *')].map((el) => el.id)`),
      ['hero', 'problem', 'f-shop', 'f-tasks', 'f-meals', 'f-cal', 'fam', 'why', 'get']);
    assert.deepEqual(page.errors, []);
  });
});

test('no marquee, no light-and-dark section', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /marquee|At home in light and dark/);
});

test('notifications are real ones', async () => {
  await withPage('/', {}, async (page) => {
    const cards = await page.eval(`[...document.querySelectorAll('#hero .notif')].map((n) => {
      const av = n.querySelector('.av');
      return {
        label: n.querySelector('b').textContent,
        text: n.querySelector('.msg').textContent,
        avatar: av.tagName === 'IMG' ? av.getAttribute('src') : [av.textContent, getComputedStyle(av).backgroundColor],
      };
    })`);
    assert.deepEqual(cards, [
      { label: 'TASKS', text: 'George gave you a task: take out the recycling', avatar: ['G', 'rgb(59, 91, 219)'] },
      { label: 'CALENDAR', text: 'Sofia added an event: dentist, Fri 16:00', avatar: ['S', 'rgb(232, 89, 12)'] },
      { label: 'TODAY', text: '3 tasks due today', avatar: '/assets/icon.png' },
    ]);
    // Decoration (ruling R6): the cards, stickers and stars are skipped by screen readers.
    assert.equal(await page.eval(`[...document.querySelectorAll('#hero .notifs, #hero .floaty, #hero .stars')]
      .filter((el) => el.getAttribute('aria-hidden') !== 'true').length`), 0);
  });
});

test('the hero waves even when opened at night', async () => {
  await withPage('/', { colorScheme: 'dark' }, async (page) => {
    assert.equal(await page.eval('document.documentElement.dataset.theme'), 'night');
    assert.equal(await until(page, `document.querySelector('#hero [data-pose]')?.dataset.pose`), 'wave');
    await sleep(500);
    assert.equal(await page.eval(`document.querySelector('#hero [data-pose]').dataset.pose`), 'wave');
    assert.deepEqual(page.errors, []);
  });
});

test('flipping to night puts it to bed', async () => {
  try {
    await withPage('/', { colorScheme: 'light' }, async (page) => {
      await until(page, `document.querySelector('#hero [data-pose]')`);
      await page.click('#theme-switch');
      assert.equal(await page.eval('document.documentElement.dataset.theme'), 'night');
      assert.deepEqual(await page.eval(HERO_STATE), ['sleepy', 'is it bedtime already?', true]);
      // It stays asleep after the bubble goes.
      await sleep(2400);
      assert.deepEqual(await page.eval(HERO_STATE), ['sleepy', 'is it bedtime already?', false]);

      await page.click('#theme-switch');
      assert.deepEqual(await page.eval(HERO_STATE), ['joy', 'good morning! ☀️', true]);
      await sleep(1800);
      assert.equal(await page.eval(`document.querySelector('#hero [data-pose]').dataset.pose`), 'wave');
      assert.deepEqual(page.errors, []);
    });
  } finally {
    await forget();
  }
});

test('the hero í reacts to taps and to the store badges', async () => {
  await withPage('/', {}, async (page) => {
    await until(page, `document.querySelector('#hero [data-pose] svg')`);
    const turns = [['joy', 'hi! 👋'], ['cheeky', 'hehe'], ['phone', 'checking the list…'], ['surprised', 'oh! you again'], ['joy', 'hi! 👋']];
    for (const [pose, text] of turns) {
      await page.click('#hero [data-pose]');
      assert.deepEqual(await page.eval(HERO_STATE), [pose, text, true]);
    }
    await page.hover('#hero .badges');
    assert.deepEqual(await page.eval(HERO_STATE), ['joy', 'yes! that one!', true]);
    // Every speech bubble on the page is decoration.
    assert.equal(await page.eval(`[...document.querySelectorAll('.say')].filter((s) => s.tagName !== 'SPAN' || s.getAttribute('aria-hidden') !== 'true').length`), 0);
    assert.deepEqual(page.errors, []);
  });
});

test('the stars come out only at night', async () => {
  for (const [colorScheme, want] of [['light', '0'], ['dark', '1']]) {
    // Reduced motion, so the twinkle does not change the opacity being read.
    await withPage('/', { colorScheme, reducedMotion: true }, async (page) => {
      const stars = await page.eval(`[...document.querySelectorAll('#hero .star')].map((s) => getComputedStyle(s).opacity)`);
      assert.equal(stars.length, 26);
      assert.deepEqual([...new Set(stars)], [want], colorScheme);
    });
  }
});

test('the hero phone shows the dark screen at night, also without JavaScript', async () => {
  for (const javascript of [true, false]) {
    for (const [colorScheme, want] of [['light', '0'], ['dark', '1']]) {
      await withPage('/', { colorScheme, javascript, reducedMotion: true }, async (page) => {
        const [light, dark] = await page.eval(`['.scr-day', '.scr-night'].map((s) => getComputedStyle(document.querySelector('#hero ' + s)).opacity)`);
        assert.equal(light, '1', `${colorScheme}, javascript ${javascript}`);
        assert.equal(dark, want, `${colorScheme}, javascript ${javascript}`);
      });
    }
  }
});

test('under reduced motion the notifications sit still in a readable stack', async () => {
  for (const opts of [{}, PHONE]) {
    await withPage('/', { ...opts, reducedMotion: true }, async (page) => {
      const cards = await page.eval(`[...document.querySelectorAll('#hero .notif')].map((n) => {
        const r = n.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, opacity: getComputedStyle(n).opacity };
      })`);
      assert.equal(cards.length, 3);
      for (const [i, card] of cards.entries()) {
        assert.equal(card.opacity, '1', `card ${i} is hidden`);
        assert.ok(card.left >= 0 && card.right <= (opts.width ?? 1280), `card ${i} is off the screen`);
        if (i) assert.ok(card.top >= cards[i - 1].bottom, `card ${i} overlaps the one above`);
      }
    });
  }
});

test('each feature has its stage and alternates sides', async () => {
  await withPage('/', {}, async (page) => {
    await sleep(500);
    const rows = await page.eval(`['f-shop', 'f-tasks', 'f-meals', 'f-cal'].map((id) => {
      const s = document.getElementById(id);
      const stage = s.querySelector('.fstage');
      return {
        eyebrow: s.querySelector('.eyebrow').textContent,
        pose: s.querySelector('[data-i-pose]')?.dataset.pose,
        flip: s.classList.contains('flip'),
        stageFirst: stage.getBoundingClientRect().left < s.querySelector('h2').getBoundingClientRect().left,
        reveal: s.querySelectorAll('.reveal').length > 0,
      };
    })`);
    assert.deepEqual(rows, [
      { eyebrow: '🛒 Shopping', pose: 'push', flip: false, stageFirst: false, reveal: true },
      { eyebrow: '✅ Tasks', pose: 'strain', flip: true, stageFirst: true, reveal: true },
      { eyebrow: '🍽️ Kitchen', pose: 'stir', flip: false, stageFirst: false, reveal: true },
      { eyebrow: '📅 Calendar', pose: 'awake', flip: true, stageFirst: true, reveal: true },
    ]);
    assert.deepEqual(page.errors, []);
  });
});

test('every rise-in has risen by the end of the page', async () => {
  for (const opts of [{ width: 1280, height: 900 }, PHONE]) {
    await withPage('/', opts, async (page) => {
      assert.ok(await page.eval(`document.querySelectorAll('.reveal.pending').length`) > 0, 'nothing waits to rise in');
      // Down the page half a screen at a time, as a visitor scrolls, to the very end.
      await page.eval(`(async () => {
        const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) { scrollTo(0, y); await frame(); }
        scrollTo(0, document.documentElement.scrollHeight); await frame();
      })()`);
      await sleep(1200);
      assert.deepEqual(await page.eval(`[...document.querySelectorAll('.reveal')]
        .filter((el) => el.classList.contains('pending') || getComputedStyle(el).opacity !== '1')
        .map((el) => el.closest('section')?.id)`), [], `${opts.width}px`);
    });
  }
});

test('the í is as tall as the M', async () => {
  await withPage('/', {}, async (page) => {
    assert.equal(await until(page, CTA_DRAWN), true, 'the letters are not drawn');
    const row = await page.eval(`(() => {
      const row = document.querySelector('#get .cta-row');
      const height = (svg) => svg.getBoundingClientRect().height;
      return {
        hidden: row.getAttribute('aria-hidden'),
        letters: [...row.querySelectorAll('.cl text')].map((t) => t.textContent),
        trainers: [...row.querySelectorAll('.cl .legs ellipse:nth-of-type(2)')].map((e) => e.getAttribute('fill')),
        heights: [...row.querySelectorAll('svg')].map(height),
        i: height(row.querySelector('.ci svg')),
        m: height(row.querySelector('.cl svg')),
        iViewBox: row.querySelector('.ci svg').getAttribute('viewBox'),
        // Each letter is cropped to its own glyph, 10 either side.
        crops: [...row.querySelectorAll('.cl svg')].map((svg) => {
          const bb = svg.querySelector('text').getBBox();
          const [x, , w] = svg.getAttribute('viewBox').split(' ').map(Number);
          return Math.abs(x - (bb.x - 10)) < 0.01 && Math.abs(w - (bb.width + 20)) < 0.01;
        }),
        last: row.lastElementChild.className,
      };
    })()`);
    assert.equal(row.hidden, 'true');
    assert.deepEqual(row.letters, ['M', 'a', 'z']);
    assert.deepEqual(row.trainers, ['#3B5BDB', '#E64980', '#E8590C']);
    assert.equal(row.last, 'ci');
    assert.equal(row.iViewBox, '58 0 116 240');
    assert.deepEqual(row.crops, [true, true, true]);
    assert.ok(Math.abs(row.i - row.m) <= 1, `í ${row.i}px, M ${row.m}px`);
    for (const h of row.heights) assert.ok(Math.abs(h - 140) <= 0.5, `${h}px, not 140`);
    assert.deepEqual(page.errors, []);
  });
});

// Review Focus 4 on the homepage: without Fredoka the letters are measured in the fallback font.
test('the family is drawn even when Fredoka fails to load', async () => {
  await withPage('/', { blockUrls: ['*fredoka.woff2'] }, async (page) => {
    assert.equal(await until(page, CTA_DRAWN), true, 'the letters are not drawn');
    assert.equal(await page.eval(`document.querySelectorAll('#get .cta-row .legs ellipse').length`), 9, 'the letters have no legs');
    assert.deepEqual(page.errors, []);
  });
});

test('the family hops in turn when the closing comes into view', async () => {
  await withPage('/', {}, async (page) => {
    assert.equal(await until(page, CTA_DRAWN), true, 'the letters are not drawn');
    assert.equal(await page.eval(`document.querySelectorAll('#get .cta-row > .hop').length`), 0);
    await page.eval(`document.getElementById('get').scrollIntoView({ block: 'center' })`);
    assert.equal(await until(page, `document.querySelectorAll('#get .cta-row > .hop').length === 4`, 1500), true);
  });
});

// Review Focus 5: the sticky header must not cover what a link jumps to.
test('jumping to #get clears the header', async () => {
  const clear = `(() => {
    const header = document.querySelector('header').getBoundingClientRect().bottom;
    return { scrolled: scrollY > 0, header, section: document.getElementById('get').getBoundingClientRect().top, h2: document.querySelector('#get h2').getBoundingClientRect().top };
  })()`;
  for (const opts of [{}, PHONE]) {
    await withPage('/#get', opts, async (page) => {
      await sleep(300);
      const at = await page.eval(clear);
      assert.ok(at.scrolled, 'the page did not jump');
      assert.ok(at.h2 >= at.header, `the heading is under the header (${at.h2} < ${at.header})`);
      assert.ok(at.section >= at.header - 1, `the section is under the header (${at.section} < ${at.header})`);
    });
    // The header's "Get the app".
    await withPage('/', opts, async (page) => {
      await page.click('.get-btn');
      await sleep(600);
      const at = await page.eval(clear);
      assert.ok(at.scrolled, 'the button did not jump');
      assert.ok(at.h2 >= at.header, `the heading is under the header (${at.h2} < ${at.header})`);
      assert.ok(at.section >= at.header - 1, `the section is under the header (${at.section} < ${at.header})`);
    });
  }
});
