// The homepage in Chrome: its sections in order, the hero í beside the Today
// screen, "the problem" (a family chat landing in its places in Mazí), the
// four features, and Mazí spelled by the family at the end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { launch } from './browser.mjs';
import { CONTRAST_JS } from './contrast.mjs';

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

// ---------- The problem: the family chat and the Mazí panel ----------

const MESSAGES = [
  ['Maria', 'we’re out of milk AGAIN 🙃'],
  ['George', 'who’s taking the bins out??'],
  ['Sofia', 'football is at 5 not 6!!'],
  ['Maria', 'can someone grab feta'],
  ['Sofia', 'did anyone feed the dog'],
  ['Sofia', 'dentist friday at 4, someone remind me 🙏'],
  ['Sofia', 'and kitchen roll pls'],
  ['George', 'someone hoover before grandma comes'],
  ['Maria', 'parents’ evening tue 18:30, don’t forget'],
];
// Each section's heading, then its rows as [text, initial, the message it came from].
const PANEL = [
  ['🛒 Shopping', [['Milk', 'M', '0'], ['Feta', 'M', '3'], ['Kitchen roll', 'S', '6']]],
  ['✅ Tasks', [['Take out the bins', 'G', '1'], ['Feed the dog', 'S', '4'], ['Hoover the living room', 'G', '7']]],
  ['📅 Calendar', [['Football · Sat 17:00', 'S', '2'], ['Dentist · Fri 16:00', 'S', '5'], ['Parents’ evening · Tue 18:30', 'M', '8']]],
];
const SORT = '↺ Back to the chat';
const UNSORT = 'Show me in Mazí →';

// How many of these are on show: rendered, not visibility: hidden, not see-through.
const shown = (selector) => `[...document.querySelectorAll(${JSON.stringify(selector)})]
  .filter((el) => el.checkVisibility({ visibilityProperty: true, opacityProperty: true })).length`;
const PROBLEM = `(() => {
  const shown = (el) => el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  const all = (s, root = document) => [...root.querySelectorAll(s)];
  return {
    rows: all('#problem .row').filter(shown).length,
    perSection: all('#problem .mz-sec').map((sec) => all('.row', sec).filter(shown).length),
    messages: all('#problem .dmsg').filter(shown).length,
    quiet: shown(document.getElementById('quiet')),
    button: document.getElementById('sort-btn').textContent,
    flying: document.querySelectorAll('.flying').length,
    inDom: all('.row').length,
  };
})()`;
const SORTED = { rows: 9, perSection: [3, 3, 3], messages: 0, quiet: true, button: SORT, flying: 0, inDom: 9 };
const SORT_I = `[document.getElementById('sort-i').dataset.pose, document.querySelector('#sort-i .say').textContent, document.querySelector('#sort-i .say').classList.contains('show')]`;
// The heights of the chat and the panel, which must not change as the chat fills up and empties.
const HEIGHTS = `['.chat', '.mz'].map((s) => document.querySelector('#problem ' + s).getBoundingClientRect().height)`;
// Counts what is added to the page from now on: clones in flight and confetti.
const WATCH_ADDED = `window.added = { flying: 0, confetti: 0, loud: 0 };
  new MutationObserver((changes) => { for (const c of changes) for (const n of c.addedNodes) {
    if (n.classList?.contains('flying')) window.added.flying++;
    if (n.classList?.contains('confetti')) window.added.confetti++;
    if (n.matches?.('.flying, .confetti') && n.getAttribute('aria-hidden') !== 'true') window.added.loud++;
  } }).observe(document.body, { childList: true, subtree: true })`;
const toSorter = `document.querySelector('#problem .sorter').scrollIntoView({ block: 'center' })`;

test('problem copy', async () => {
  await withPage('/', {}, async (page) => {
    const copy = await page.eval(`(() => {
      const s = document.getElementById('problem');
      const text = (el) => el.textContent.replace(/\\s+/g, ' ').trim();
      return {
        band: s.className,
        eyebrow: text(s.querySelector('.eyebrow')),
        h2: text(s.querySelector('h2')),
        lead: text(s.querySelector('.sec-lead')),
        button: text(document.getElementById('sort-btn')),
        quiet: text(document.getElementById('quiet')),
        chat: document.getElementById('chat-body').tagName,
        messages: [...s.querySelectorAll('#chat-body > .dmsg')].map((m) => [m.dataset.i, text(m.querySelector('.who')), text(m)]),
        panel: [...s.querySelectorAll('.mz-sec')].map((sec) => [
          sec.querySelector('h3').firstChild.textContent.trim(),
          [...sec.querySelectorAll('.row')].map((r) => [text(r.querySelector('.txt')), text(r.querySelector('.av')), r.dataset.from]),
        ]),
        ticks: [...s.querySelectorAll('.row')].map((r) => {
          const tk = r.querySelector('.tk');
          return tk.tagName === 'BUTTON' && tk.type === 'button' && tk.getAttribute('aria-pressed') === 'false'
            && tk.getAttribute('aria-label') === 'Tick ' + text(r.querySelector('.txt'));
        }),
        avatars: Object.fromEntries([...s.querySelectorAll('.row .av')].map((av) => [av.textContent, getComputedStyle(av).backgroundColor])),
        header: text(s.querySelector('.mz-top')),
      };
    })()`);
    assert.equal(copy.band, 'band band-yellow');
    assert.equal(copy.eyebrow, '💬 The problem');
    assert.equal(copy.h2, 'Your family group chat was never a to-do list.');
    assert.equal(copy.lead, 'Nine messages, three jobs nobody claimed, one football match at the wrong time. In Mazí, each one has its place. Press the button to see.');
    assert.equal(copy.button, UNSORT);
    assert.equal(copy.quiet, 'All quiet. Everything has a place. 😌');
    assert.equal(copy.chat, 'OL');
    assert.deepEqual(copy.messages, MESSAGES.map(([who, msg], i) => [String(i), who, `${who} ${msg}`]));
    assert.deepEqual(copy.panel, PANEL);
    assert.deepEqual(copy.ticks, Array(9).fill(true));
    assert.deepEqual(copy.avatars, { M: 'rgb(230, 73, 128)', G: 'rgb(59, 91, 219)', S: 'rgb(232, 89, 12)' });
    assert.equal(copy.header, 'Mazí Our Home · 3 people');
    // Ruling R6: every bubble, the í and the avatars' initials are skipped by screen readers.
    assert.equal(await page.eval(`[...document.querySelectorAll('#problem .say, #problem .av')].filter((el) => el.getAttribute('aria-hidden') !== 'true').length`), 0);
    assert.deepEqual(page.errors, []);
  });
});

test('without JS the section shows both sides', async () => {
  for (const opts of [{}, PHONE]) {
    await withPage('/', { ...opts, javascript: false }, async (page) => {
      const seen = await page.eval(`(() => {
        const shown = (el) => el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
        const body = document.getElementById('chat-body').getBoundingClientRect();
        const messages = [...document.querySelectorAll('#problem .dmsg')];
        return {
          messages: messages.filter(shown).length,
          // All nine fit in the chat, none cut off.
          inside: messages.every((m) => { const r = m.getBoundingClientRect(); return r.top >= body.top - 0.5 && r.bottom <= body.bottom + 0.5; }),
          rows: [...document.querySelectorAll('#problem .row')].filter(shown).length,
          button: shown(document.getElementById('sort-btn')),
          ticks: [...document.querySelectorAll('#problem .tk')].filter(shown).length,
          quiet: shown(document.getElementById('quiet')),
          // There is no button to press.
          lead: document.querySelector('#problem .sec-lead').innerText.includes('Press the button'),
        };
      })()`);
      assert.deepEqual(seen, { messages: 9, inside: true, rows: 9, button: false, ticks: 0, quiet: false, lead: false }, `${opts.width ?? 1280}px`);
    });
  }
});

test('sorting moves every message into its section', async () => {
  await withPage('/', {}, async (page) => {
    // Nothing plays until the chat is in view.
    assert.equal(await page.eval(shown('#problem .dmsg')), 0, 'the chat played before it was seen');
    assert.equal(await page.eval(shown('#problem .row')), 0, 'the panel is filled before the sort');
    const heights = await page.eval(HEIGHTS);
    await page.eval(WATCH_ADDED);
    await page.eval(toSorter);
    assert.equal(await until(page, `document.querySelector('#sort-i .say').classList.contains('show')`, 1500), true, 'the í did not ask for help');
    assert.deepEqual(await page.eval(SORT_I), ['sad', 'help…', true]);
    assert.equal(await until(page, `${shown('#problem .dmsg')} === 9`, 15000), true, 'the nine messages did not play in');
    assert.ok(Number(await page.eval(`document.getElementById('unread').textContent`)) >= 9, 'the unread badge did not count them');
    assert.deepEqual(await page.eval(HEIGHTS), heights, 'the chat or the panel changed height as the chat filled');

    await page.click('#sort-btn');
    assert.deepEqual(await page.eval(SORT_I), ['strain', 'watch this', true]);
    await sleep(3000);
    assert.deepEqual(await page.eval(PROBLEM), SORTED);
    assert.deepEqual(await page.eval(SORT_I), ['joy', 'that\'s better 😌', true]);
    const added = await page.eval('window.added');
    assert.equal(added.flying, 9, 'one clone per message');
    assert.ok(added.confetti > 0, 'no confetti');
    assert.equal(added.loud, 0, 'clones and confetti are hidden from screen readers');
    assert.deepEqual(await page.eval(HEIGHTS), heights, 'the chat or the panel changed height in the sort');
    assert.deepEqual(page.errors, []);
  });
});

test('back to the chat resets', async () => {
  await withPage('/', {}, async (page) => {
    await page.click('#sort-btn');
    await sleep(3000);
    assert.deepEqual(await page.eval(PROBLEM), SORTED);
    await page.click('#sort-btn');
    const now = await page.eval(PROBLEM);
    assert.equal(now.rows, 0);
    assert.equal(now.button, UNSORT);
    assert.equal(now.quiet, false);
    assert.equal(now.inDom, 9);
    assert.deepEqual(await page.eval(SORT_I), ['sad', 'oh no, not again', true]);
    assert.equal(await page.eval(`document.getElementById('unread').textContent`), '0');
    assert.equal(await until(page, `${shown('#problem .dmsg')} >= 2`, 4000), true, 'the messages did not replay');
    assert.deepEqual(page.errors, []);
  });
});

test('reduced motion sorts instantly', async () => {
  await withPage('/', { reducedMotion: true }, async (page) => {
    // Every message is there at once.
    assert.equal(await page.eval(shown('#problem .dmsg')), 9);
    await page.eval(WATCH_ADDED);
    await page.click('#sort-btn');
    assert.equal(await until(page, `${shown('#problem .row')} === 9`, 100), true, 'the rows took longer than 100 ms');
    assert.deepEqual(await page.eval(PROBLEM), SORTED);
    assert.equal(await page.eval(`document.getAnimations().filter((a) => a.playState === 'running').length`), 0, 'something moves');
    await sleep(1200);
    assert.deepEqual(await page.eval('window.added'), { flying: 0, confetti: 0, loud: 0 });
    // And back, as instantly.
    await page.click('#sort-btn');
    const back = await page.eval(PROBLEM);
    assert.deepEqual([back.rows, back.messages, back.button], [0, 9, UNSORT]);
    assert.deepEqual(page.errors, []);
  });
});

test('rows tick', async () => {
  await withPage('/', {}, async (page) => {
    await page.click('#sort-btn');
    await sleep(3000);
    const TICK = `(() => { const r = document.querySelector('#problem .row'); return [r.querySelector('.tk').getAttribute('aria-pressed'), r.classList.contains('done')]; })()`;
    await page.click('#problem .row .tk');
    assert.deepEqual(await page.eval(TICK), ['true', true]);
    await page.click('#problem .row .tk');
    assert.deepEqual(await page.eval(TICK), ['false', false]);
    // A tick does not survive going back to the chat.
    await page.click('#problem .row .tk');
    await page.click('#sort-btn');
    assert.deepEqual(await page.eval(TICK), ['false', false]);
    assert.deepEqual(page.errors, []);
  });
});

// Review Focus 3: the button pressed again and again while the messages are in flight.
test('mashing the button stays consistent', async () => {
  await withPage('/', {}, async (page) => {
    const [x, y] = await page.eval(`(() => {
      const b = document.getElementById('sort-btn');
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    })()`);
    const start = Date.now();
    for (let n = 0; n < 5; n++) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      }
    }
    const took = Date.now() - start;
    assert.ok(took < 300, `the five clicks took ${took} ms`);
    await sleep(3000);
    const s = await page.eval(PROBLEM);
    assert.equal(s.inDom, 9, 'rows were added or lost');
    assert.equal(s.flying, 0, 'a clone is stuck');
    const sorted = s.rows === 9 && s.messages === 0 && s.quiet && s.button === SORT;
    const reset = s.rows === 0 && !s.quiet && s.button === UNSORT;
    assert.ok(sorted || reset, `half sorted: ${JSON.stringify(s)}`);
    assert.deepEqual(page.errors, []);
  });
});

test('the chat and the panel are readable, day and night', async () => {
  for (const colorScheme of ['light', 'dark']) {
    for (const javascript of [true, false]) {
      // With motion off every message is on show at once.
      await withPage('/', { colorScheme, javascript, reducedMotion: true }, async (page) => {
        const setup = `${colorScheme}, javascript ${javascript}`;
        assert.equal(await page.eval(shown('#problem .dmsg')), 9, setup);
        assert.deepEqual(await page.eval(CONTRAST_JS), [], `${setup}: the chat`);
        if (!javascript) return;
        await page.click('#sort-btn');
        assert.equal(await page.eval(shown('#problem .row')), 9, setup);
        assert.deepEqual(await page.eval(CONTRAST_JS), [], `${setup}: the panel`);
      });
    }
  }
});

test('the chat, the í and the panel stack below 1000px', async () => {
  for (const [width, stacked] of [[1280, false], [1000, false], [999, true], [360, true]]) {
    await withPage('/', { width, height: 900, mobile: width <= 400 }, async (page) => {
      const [chat, mid, panel] = await page.eval(`['.chat', '.mid', '.mz'].map((s) => {
        const r = document.querySelector('#problem ' + s).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      })`);
      for (const box of [chat, mid, panel]) assert.ok(box.left >= 0 && box.right <= width, `${width}px: off the screen`);
      if (stacked) assert.ok(chat.bottom <= mid.top && mid.bottom <= panel.top, `${width}px: not stacked in order`);
      else assert.ok(chat.right <= mid.left && mid.right <= panel.left, `${width}px: not side by side`);
    });
  }
});
