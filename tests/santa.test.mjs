// The Secret Santa page: people in a draw join, get a code and, after the
// organizer draws in the Mazí app, see who they buy for. Every answer here
// comes from a fetch stub put in place before the page's own script runs, so
// nothing reaches Supabase; the functions themselves are proven in the app
// repo (docs/santa-probe.mjs, docs/santa-page-probe.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './serve.mjs';
import { launch } from './browser.mjs';
import { readFile } from './baseline.mjs';

let server, browser;
before(async () => { server = await startServer({ fixtures: true }); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const KEY = '0123456789abcdef'.repeat(4);
const URL_ = `/santa?d=${TOKEN}`;
const HEX64 = /^[0-9a-f]{64}$/;

// The page hides the wishes editor once its own date passes the exchange
// date, so the draws here are dated from today, never on a fixed day that a
// later run would find in the past. SANTA_TEST_TODAY=2027-01-05 runs the whole
// file as if that were today: the dates here and every page's clock move to it.
const TODAY = process.env.SANTA_TEST_TODAY || null;
const BASE = TODAY ? new Date(`${TODAY}T12:00:00`) : new Date();
// A local date, as the page reads its own: offset days from today.
const day = (offset) => {
  const d = new Date(BASE.getFullYear(), BASE.getMonth(), BASE.getDate() + offset, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// The tests of the short date use fixed far-future days, whose weekdays were
// read from two other calendars: 2099-12-25 is a Friday, 2099-01-05 a Monday.
const CHRISTMAS_2099 = '2099-12-25';

const draw = (over = {}) => ({
  state: 'open', name: 'Family Secret Santa', budget: '€20', exchange_date: day(10),
  can_join: true, people: ['Eleni', 'Nikos'], me: null, ...over,
});

// Moves the page's clock to noon on a local date, for Date.now() and new Date().
const clock = (iso) => `(() => {
  const Real = Date;
  const shift = new Real('${iso}T12:00:00').getTime() - Real.now();
  class Shifted extends Real {
    constructor(...a) { if (a.length) super(...a); else super(Real.now() + shift); }
    static now() { return Real.now() + shift; }
  }
  window.Date = Shifted;
})();`;
const me = (over = {}) => ({ name: 'Petros', wishes: ['A good book'], reset: false, match: null, ...over });
const MATCH = { name: 'Maria', wishes: ['A warm scarf', 'Hand cream'] };

// Replaces fetch with a stub that answers each function from `table`. A list
// answers its entries in turn and then keeps answering the last; 'fail' is a
// network failure. `stored` puts a key in localStorage for the draw first,
// `blocked` makes localStorage throw, as some private tabs do.
function stub(table, { stored = null, blocked = false, greek = false, now = TODAY } = {}) {
  return `${now ? clock(now) : ''}(() => {
    const table = ${JSON.stringify(table)};
    window.__calls = [];
    window.__alerts = [];
    window.alert = (m) => { window.__alerts.push(String(m)); };
    window.fetch = (url, init) => {
      const fn = String(url).split('/rest/v1/rpc/')[1];
      window.__calls.push({ fn, url: String(url), method: init && init.method, headers: init && init.headers, args: JSON.parse(init.body) });
      let answer = table[fn];
      if (Array.isArray(answer)) answer = answer.length > 1 ? answer.shift() : answer[0];
      if (answer === undefined || answer === 'fail') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
    try { localStorage.removeItem('santa:${TOKEN}'); } catch (e) {}
    ${stored ? `localStorage.setItem('santa:${TOKEN}', ${JSON.stringify(stored)});` : ''}
    ${blocked ? `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });` : ''}
    ${greek ? `Object.defineProperty(navigator, 'languages', { get: () => ['el-GR', 'el', 'en'] });
    Object.defineProperty(navigator, 'language', { get: () => 'el-GR' });` : ''}
  })()`;
}

async function withPage(url, initScript, fn, { userAgent } = {}) {
  const page = await browser.newPage({ initScript, userAgent });
  try {
    await page.goto(server.origin + url);
    return await fn(page);
  } finally {
    await page.close();
  }
}

// The same phones as the invite page's tests (tests/join.test.mjs).
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// Every navigation the page asks for, read from Chrome itself: a desktop Chrome
// knows neither intent:// nor mazi://, so the page stays where it is and only
// the request tells where it meant to go.
function navigations(page) {
  const urls = [];
  page.conn.listeners.add((m) => {
    if (m.sessionId === page.sessionId && m.method === 'Page.frameRequestedNavigation') urls.push(m.params.url);
  });
  return urls;
}

const visible = (page, id) => page.eval(`(() => { const e = document.getElementById('${id}'); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; })()`);
const text = (page, id) => page.eval(`document.getElementById('${id}').textContent.replace(/\\s+/g, ' ').trim()`);
const state = (page) => page.eval(`document.getElementById('santa').dataset.state`);
const calls = (page) => page.eval('window.__calls');
const stored = (page) => page.eval(`localStorage.getItem('santa:${TOKEN}')`);
const type = (page, id, value) => page.eval(`(() => { const e = document.getElementById('${id}'); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
async function waitFor(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)); }
  return false;
}

test('the page is out of search', () => {
  assert.match(readFile('santa.html'), /<meta name="robots" content="noindex">/);
});

test('no draw, or a token of the wrong shape, is ended and asks nothing', async () => {
  for (const url of ['/santa', '/santa?d=short', `/santa?d=${TOKEN}x`, '/santa?d=AbCdEfGhIjKlMnOpQrSt%3C%3E']) {
    await withPage(url, stub({ santa_page: draw() }), async (page) => {
      assert.equal(await state(page), 'ended', url);
      assert.equal(await text(page, 'heading'), 'This Secret Santa has ended.', url);
      assert.ok(!(await visible(page, 'join')), url);
      assert.deepEqual(await calls(page), [], url);
      assert.deepEqual(page.errors, [], url);
    });
  }
});

test('the server saying ended is ended', async () => {
  await withPage(URL_, stub({ santa_page: { state: 'ended' } }), async (page) => {
    assert.ok(await waitFor(async () => (await state(page)) === 'ended'));
    assert.equal(await text(page, 'heading'), 'This Secret Santa has ended.');
    assert.ok(!(await visible(page, 'join')));
  });
});

test('an open draw shows the join form with its name, budget, date and who is in', async () => {
  await withPage(URL_, stub({ santa_page: draw({ exchange_date: CHRISTMAS_2099 }) }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    assert.equal(await text(page, 'heading'), 'Family Secret Santa');
    assert.equal(await text(page, 'facts'), 'Up to €20 · exchange Fri 25 Dec');
    assert.equal(await text(page, 'people'), 'In so far: Eleni, Nikos');
    assert.equal(await text(page, 'join-submit'), "I'm in");
    const [c] = await calls(page);
    assert.equal(c.fn, 'santa_page');
    assert.equal(c.method, 'POST');
    assert.ok(c.url.startsWith('https://') && c.url.endsWith('/rest/v1/rpc/santa_page'));
    assert.equal(c.headers['Content-Type'], 'application/json');
    assert.ok(c.headers.apikey && c.headers.Authorization === `Bearer ${c.headers.apikey}`);
    assert.equal(c.args.p_token, TOKEN);
    assert.match(c.args.p_key, HEX64);
    // A key made only to ask is never kept: this browser has not joined.
    assert.equal(await stored(page), null);
    assert.ok(!(await visible(page, 'recover')));
    assert.deepEqual(page.errors, []);
  });
});

test('the inputs hold what the server takes', async () => {
  await withPage(URL_, stub({ santa_page: draw() }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    const limits = await page.eval(`[...document.querySelectorAll('input')].map((i) => i.id + ':' + i.maxLength)`);
    assert.ok(limits.includes('join-name:30'), limits);
    assert.ok(limits.includes('recover-name:30'), limits);
    assert.ok(limits.includes('recover-code:4'), limits);
    assert.equal(limits.filter((l) => /^join-wish-\d:60$/.test(l)).length, 3, limits);
    assert.equal(limits.filter((l) => /^own-wish-\d:60$/.test(l)).length, 3, limits);
  });
});

test('joining sends the name, the wishes and a new key, keeps the key and shows the code', async () => {
  await withPage(URL_, stub({ santa_page: draw(), santa_join: { ok: true, code: '4821' } }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    await type(page, 'join-name', '  Petros ');
    await type(page, 'join-wish-1', 'A good book');
    await page.click('#join-add');
    await type(page, 'join-wish-2', '  ');
    await page.click('#join-submit');
    assert.ok(await waitFor(() => visible(page, 'code-card')));
    const join = (await calls(page)).find((c) => c.fn === 'santa_join');
    assert.equal(join.args.p_token, TOKEN);
    assert.equal(join.args.p_name, 'Petros');
    assert.deepEqual(join.args.p_wishes, ['A good book']);
    assert.match(join.args.p_key, HEX64);
    assert.equal(await stored(page), join.args.p_key);
    assert.equal(await text(page, 'code'), '4821');
    assert.equal(await text(page, 'in-heading'), "You're in, Petros");
    assert.match(await text(page, 'code-card'), /Keep it, a screenshot works\. It opens your match from any phone or browser\./);
    // The line about the code is body-coloured and bold, never the small grey note.
    assert.deepEqual(
      await page.eval(`(() => { const s = getComputedStyle(document.getElementById('code-keep')); const fg = getComputedStyle(document.body).color; return [Number(s.fontWeight) >= 700, s.color === fg]; })()`),
      [true, true]
    );
    assert.ok(await visible(page, 'waiting'));
    assert.equal(await text(page, 'people'), 'In so far: Eleni, Nikos, Petros');
    assert.ok(!(await visible(page, 'join')));
    // The code is shown once and kept nowhere.
    assert.equal(await page.eval(`JSON.stringify(localStorage).includes('4821') || location.href.includes('4821') || document.title.includes('4821')`), false);
    assert.deepEqual(page.errors, []);
  });
});

test('a name already in the draw says so and keeps the form filled', async () => {
  await withPage(URL_, stub({ santa_page: draw(), santa_join: { ok: false, reason: 'name_taken' } }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    await type(page, 'join-name', 'Eleni');
    await type(page, 'join-wish-1', 'Socks');
    await page.click('#join-submit');
    assert.ok(await waitFor(() => visible(page, 'join-note')));
    assert.equal(await text(page, 'join-note'), 'Someone already has that name. Add a letter.');
    assert.ok(await visible(page, 'join'));
    assert.equal(await page.eval(`document.getElementById('join-name').value`), 'Eleni');
    assert.equal(await page.eval(`document.getElementById('join-wish-1').value`), 'Socks');
    assert.equal(await stored(page), null);
  });
});

// Someone who joined in another browser gets back in, rather than joining
// again under a second name and putting a duplicate person in the draw.
test('name taken leaves the way back in right under the words', async () => {
  await withPage(URL_, stub({ santa_page: draw(), santa_join: { ok: false, reason: 'name_taken' } }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    assert.ok(await visible(page, 'have-code'));
    await type(page, 'join-name', 'Eleni');
    await page.click('#join-submit');
    assert.ok(await waitFor(() => visible(page, 'join-note')));
    assert.ok(await visible(page, 'have-code'));
    assert.equal(await text(page, 'have-code'), 'Already joined? Open with your code');
    // Next in the page after the words: nothing stands between them.
    assert.equal(await page.eval(`document.getElementById('join-note').nextElementSibling.contains(document.getElementById('have-code'))`), true);
  });
});

test('Already joined? swaps the join form for the code form, and back', async () => {
  await withPage(URL_, stub({ santa_page: draw() }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    await type(page, 'join-name', 'Petros');
    await page.click('#have-code');
    assert.equal(await state(page), 'returning');
    assert.ok(await visible(page, 'recover'));
    assert.ok(!(await visible(page, 'join')));
    assert.ok(!(await visible(page, 'recover-intro')), 'not the "not recognised" sentence');
    assert.ok(!(await visible(page, 'changed')));
    assert.equal(await page.eval(`document.getElementById('recover-name').value`), 'Petros');
    assert.equal(await text(page, 'no-code'), 'Not joined yet? Add yourself');
    assert.equal(await text(page, 'people'), 'In so far: Eleni, Nikos');
    await page.click('#no-code');
    assert.equal(await state(page), 'join');
    assert.ok(await visible(page, 'join'));
    assert.ok(!(await visible(page, 'recover')));
    assert.ok(await visible(page, 'have-code'));
    assert.deepEqual((await calls(page)).map((c) => c.fn), ['santa_page']);
    assert.deepEqual(page.errors, []);
  });
});

// The í wears a Santa hat on this page only, in place of its accent, and has a
// gift beside it once a match shows. Both are pictures over the í's own box.
const HAT_LOOK = "(() => { const fi = document.querySelector('#santa .fi'); const accent = fi.querySelector('svg > rect[transform]'); const img = (pseudo) => getComputedStyle(fi, pseudo).backgroundImage; return { drawn: !!fi.querySelector('svg'), accentHidden: !!accent && getComputedStyle(accent).display === 'none', hat: img('::after').includes('data:image/svg+xml'), gift: img('::before').includes('data:image/svg+xml') }; })()";
test('the í wears a hat on every state, and gets a gift only with a match', async () => {
  const look = (page) => page.eval(HAT_LOOK);
  await withPage(URL_, stub({ santa_page: draw() }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    assert.ok(await waitFor(async () => (await look(page)).drawn));
    assert.deepEqual(await look(page), { drawn: true, accentHidden: true, hat: true, gift: false });
    assert.deepEqual(page.errors, []);
  });
  const matched = { santa_page: draw({ state: 'drawn', can_join: false, me: me({ match: MATCH }) }) };
  await withPage(URL_, stub(matched, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(async () => (await state(page)) === 'match'));
    assert.ok(await waitFor(async () => (await look(page)).drawn));
    assert.deepEqual(await look(page), { drawn: true, accentHidden: true, hat: true, gift: true });
    assert.deepEqual(page.errors, []);
  });
});

test('the code form lists the names in the draw, and a tap fills the name', async () => {
  const table = {
    santa_page: [draw({ state: 'drawn', can_join: false, people: ['Eleni', 'Nikos', 'Petros'] }), draw({ state: 'drawn', can_join: false, me: me({ match: MATCH }) })],
    santa_open: { ok: true },
  };
  await withPage(URL_, stub(table), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'recover')));
    assert.ok(await visible(page, 'recover-names'));
    const chips = () => page.eval(`[...document.querySelectorAll('#recover-names .name-chip')].map((c) => c.textContent + ':' + c.getAttribute('aria-pressed'))`);
    assert.deepEqual(await chips(), ['Eleni:false', 'Nikos:false', 'Petros:false']);
    await page.eval(`document.querySelectorAll('#recover-names .name-chip')[2].click()`);
    assert.equal(await page.eval(`document.getElementById('recover-name').value`), 'Petros');
    assert.equal(await page.eval('document.activeElement.id'), 'recover-code');
    assert.deepEqual(await chips(), ['Eleni:false', 'Nikos:false', 'Petros:true']);
    // Typing a name the other way marks the same chip, whatever its capitals.
    await type(page, 'recover-name', ' nikos ');
    assert.deepEqual(await chips(), ['Eleni:false', 'Nikos:true', 'Petros:false']);
    await page.eval(`document.querySelectorAll('#recover-names .name-chip')[2].click()`);
    await type(page, 'recover-code', '4821');
    await page.click('#recover-submit');
    assert.ok(await waitFor(async () => (await state(page)) === 'match'));
    const open = (await calls(page)).find((c) => c.fn === 'santa_open');
    assert.deepEqual([open.args.p_name, open.args.p_code], ['Petros', '4821']);
    assert.deepEqual(page.errors, []);
  });
});

test('a draw with nobody in it shows no names to tap, and the join form never shows them', async () => {
  await withPage(URL_, stub({ santa_page: draw({ people: [] }) }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    assert.ok(!(await visible(page, 'recover-names')));
    await page.click('#have-code');
    assert.ok(await visible(page, 'recover'));
    assert.ok(!(await visible(page, 'recover-names')));
    assert.deepEqual(page.errors, []);
  });
});

test('a right code before the draw keeps the new key and shows the waiting state, with no code', async () => {
  const table = {
    santa_page: [draw(), draw({ me: me() })],
    santa_open: { ok: true },
  };
  await withPage(URL_, stub(table), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    await page.click('#have-code');
    await type(page, 'recover-name', 'Petros');
    await type(page, 'recover-code', '4821');
    await page.click('#recover-submit');
    assert.ok(await waitFor(async () => (await state(page)) === 'waiting'));
    const all = await calls(page);
    const open = all.find((c) => c.fn === 'santa_open');
    assert.deepEqual([open.args.p_token, open.args.p_name, open.args.p_code], [TOKEN, 'Petros', '4821']);
    assert.match(open.args.p_key, HEX64);
    assert.equal(all.at(-1).fn, 'santa_page');
    assert.equal(all.at(-1).args.p_key, open.args.p_key);
    assert.equal(await stored(page), open.args.p_key);
    assert.equal(await text(page, 'in-heading'), "You're in, Petros");
    assert.ok(await visible(page, 'waiting'));
    assert.ok(!(await visible(page, 'code-card')), 'no new code');
    assert.ok(await visible(page, 'own'));
    assert.equal(await page.eval(`document.getElementById('own-wish-1').value`), 'A good book');
    assert.ok(!(await visible(page, 'join')));
    assert.ok(!(await visible(page, 'recover')));
    assert.deepEqual(page.errors, []);
  });
});

test('the line about a changed code reads Greek in Greek', async () => {
  await withPage(`${URL_}&lang=el`, stub({ santa_page: draw({ state: 'drawn', can_join: false }) }, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'changed')));
    assert.equal(await text(page, 'changed'), 'Αν το είχατε ανοίξει πριν, ο διοργανωτής ίσως άλλαξε τον κωδικό σας.');
  });
});

test('the way back in reads Greek in Greek', async () => {
  await withPage(`${URL_}&lang=el`, stub({ santa_page: draw() }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    assert.equal(await text(page, 'have-code'), 'Έχετε ήδη μπει; Ανοίξτε με τον κωδικό σας');
    await page.click('#have-code');
    assert.equal(await text(page, 'no-code'), 'Δεν έχετε μπει ακόμα; Προσθέστε το όνομά σας');
  });
});

test('a full or closed draw, and a lost connection, say so and keep the form', async () => {
  for (const [answer, words] of [
    [{ ok: false, reason: 'full' }, 'This Secret Santa is not taking new people right now.'],
    [{ ok: false, reason: 'busy' }, 'This Secret Santa is not taking new people right now.'],
    [{ ok: false, reason: 'closed' }, 'This Secret Santa is not taking new people right now.'],
    ['fail', 'That did not work. Check your connection and try again.'],
  ]) {
    await withPage(URL_, stub({ santa_page: draw(), santa_join: answer }), async (page) => {
      assert.ok(await waitFor(() => visible(page, 'join')));
      await type(page, 'join-name', 'Petros');
      await page.click('#join-submit');
      assert.ok(await waitFor(() => visible(page, 'join-note')));
      assert.equal(await text(page, 'join-note'), words);
      assert.equal(await page.eval(`document.getElementById('join-name').value`), 'Petros');
      assert.equal(await page.eval(`document.getElementById('join-submit').disabled`), false);
      assert.equal(await stored(page), null);
    });
  }
});

// A join the server took whose answer never arrived: the retry would send a
// new key, meet the name as taken, and put the same person in twice.
test('a join retried after a lost answer sends the same key', async () => {
  const table = { santa_page: draw(), santa_join: 'fail' };
  await withPage(URL_, stub(table), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    await type(page, 'join-name', 'Petros');
    await page.click('#join-submit');
    assert.ok(await waitFor(() => visible(page, 'join-note')));
    assert.equal(await text(page, 'join-note'), 'That did not work. Check your connection and try again.');
    await page.click('#join-submit');
    assert.ok(await waitFor(async () => (await calls(page)).filter((c) => c.fn === 'santa_join').length === 2));
    const joins = (await calls(page)).filter((c) => c.fn === 'santa_join');
    assert.match(joins[0].args.p_key, HEX64);
    assert.equal(joins[1].args.p_key, joins[0].args.p_key);
    // The page asked, with that key, whether the join had landed after all.
    const asks = (await calls(page)).filter((c) => c.fn === 'santa_page');
    assert.ok(asks.slice(1).every((c) => c.args.p_key === joins[0].args.p_key), JSON.stringify(asks.map((c) => c.args.p_key)));
    assert.equal(await stored(page), null);
  });
});

test('a join that landed though its answer was lost shows the waiting state, saying the code could not be shown', async () => {
  for (const answer of ['fail', { ok: false, reason: 'bad_input' }]) {
    const table = { santa_page: [draw(), draw({ people: ['Eleni', 'Nikos', 'Petros'], me: me({ wishes: [] }) })], santa_join: answer };
    await withPage(URL_, stub(table), async (page) => {
      assert.ok(await waitFor(() => visible(page, 'join')));
      await type(page, 'join-name', 'Petros');
      await page.click('#join-submit');
      assert.ok(await waitFor(async () => (await state(page)) === 'waiting'), JSON.stringify(answer));
      const join = (await calls(page)).find((c) => c.fn === 'santa_join');
      const ask = (await calls(page)).filter((c) => c.fn === 'santa_page').at(-1);
      assert.equal(ask.args.p_key, join.args.p_key);
      assert.equal(await stored(page), join.args.p_key);
      assert.equal(await text(page, 'in-heading'), "You're in, Petros");
      assert.ok(!(await visible(page, 'code-card')));
      assert.ok(await visible(page, 'code-lost'));
      assert.equal(await text(page, 'code-lost'),
        "You're in. We could not show your code: ask the organizer for a new one before you change phone or browser.");
      assert.ok(!(await visible(page, 'join')));
      assert.ok(!(await visible(page, 'join-note')));
      assert.deepEqual(page.errors, []);
    });
  }
  const table = { santa_page: [draw(), draw({ me: me() })], santa_join: 'fail' };
  await withPage(`${URL_}&lang=el`, stub(table), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    await type(page, 'join-name', 'Petros');
    await page.click('#join-submit');
    assert.ok(await waitFor(() => visible(page, 'code-lost')));
    assert.equal(await text(page, 'code-lost'),
      'Μπήκατε. Δεν μπορέσαμε να δείξουμε τον κωδικό σας: ζητήστε νέο από τον διοργανωτή πριν αλλάξετε κινητό ή browser.');
  });
});

test('a join refused as bad input says the name or wish was not accepted, not the connection', async () => {
  const table = { santa_page: draw(), santa_join: { ok: false, reason: 'bad_input' } };
  await withPage(URL_, stub(table), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    await type(page, 'join-name', 'Petros');
    await page.click('#join-submit');
    assert.ok(await waitFor(() => visible(page, 'join-note')));
    assert.equal(await text(page, 'join-note'), 'That name or gift preference was not accepted. Try plain letters.');
    assert.ok(await visible(page, 'join'));
    assert.equal(await page.eval(`document.getElementById('join-submit').disabled`), false);
    assert.equal(await stored(page), null);
    assert.ok(!(await visible(page, 'code-lost')));
  });
  await withPage(`${URL_}&lang=el`, stub(table), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    await type(page, 'join-name', 'Petros');
    await page.click('#join-submit');
    assert.ok(await waitFor(() => visible(page, 'join-note')));
    assert.equal(await text(page, 'join-note'), 'Αυτό το όνομα ή η προτίμηση δώρου δεν έγινε δεκτό. Δοκιμάστε με απλά γράμματα.');
  });
});

test('a join that comes too late shows the drawn draw, never the join form', async () => {
  const table = { santa_page: [draw(), draw({ state: 'drawn', can_join: false })], santa_join: { ok: false, reason: 'drawn' } };
  await withPage(URL_, stub(table), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    await type(page, 'join-name', 'Petros');
    await page.click('#join-submit');
    assert.ok(await waitFor(() => visible(page, 'recover')));
    assert.equal(await text(page, 'too-late'), 'The names are already drawn. Ask the organizer.');
    assert.ok(!(await visible(page, 'join')));
  });
});

test('an open draw that takes nobody new says so, and still lets someone who joined in with their code', async () => {
  const table = { santa_page: [draw({ can_join: false }), draw({ can_join: false, me: me() })], santa_open: { ok: true } };
  await withPage(URL_, stub(table), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'closed')));
    assert.equal(await text(page, 'closed'), 'This Secret Santa is not taking new people right now.');
    assert.ok(!(await visible(page, 'join')));
    assert.ok(await visible(page, 'closed-code'));
    assert.equal(await text(page, 'closed-have-code'), 'Already joined? Open with your code');
    await page.click('#closed-have-code');
    assert.equal(await state(page), 'returning');
    assert.ok(await visible(page, 'recover'));
    assert.ok(!(await visible(page, 'closed-code')));
    // No way to the join form: the draw takes nobody new.
    assert.ok(!(await visible(page, 'back-line')));
    await type(page, 'recover-name', 'Petros');
    await type(page, 'recover-code', '4821');
    await page.click('#recover-submit');
    assert.ok(await waitFor(async () => (await state(page)) === 'waiting'));
    assert.deepEqual(page.errors, []);
  });
  await withPage(`${URL_}&lang=el`, stub({ santa_page: draw({ can_join: false }) }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'closed-code')));
    assert.equal(await text(page, 'closed-have-code'), 'Έχετε ήδη μπει; Ανοίξτε με τον κωδικό σας');
  });
});

test('before the draw, a browser that joined waits and can change its wishes', async () => {
  const table = { santa_page: draw({ people: ['Eleni', 'Nikos', 'Petros'], me: me() }), santa_set_wishes: { ok: true } };
  await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'waiting')));
    assert.equal(await text(page, 'in-heading'), "You're in, Petros");
    assert.equal(await text(page, 'waiting'), 'The names are not drawn yet. Open this same link again when the organizer says they are.');
    assert.ok(!(await visible(page, 'code-card')));
    assert.ok(!(await visible(page, 'join')));
    assert.equal((await calls(page))[0].args.p_key, KEY);
    assert.equal(await page.eval(`document.getElementById('own-wish-1').value`), 'A good book');
    await type(page, 'own-wish-1', 'Tea');
    await page.click('#own-add');
    await type(page, 'own-wish-2', 'Gloves');
    await page.click('#own-save');
    assert.ok(await waitFor(async () => (await calls(page)).some((c) => c.fn === 'santa_set_wishes')));
    const save = (await calls(page)).find((c) => c.fn === 'santa_set_wishes');
    assert.deepEqual(save.args, { p_token: TOKEN, p_key: KEY, p_wishes: ['Tea', 'Gloves'] });
    assert.ok(await waitFor(() => page.eval(`document.getElementById('own-save').disabled`)));
    assert.deepEqual(page.errors, []);
  });
});

test('a wishes save that fails says so', async () => {
  const table = { santa_page: draw({ me: me() }), santa_set_wishes: 'fail' };
  await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'own')));
    await type(page, 'own-wish-1', 'Tea');
    await page.click('#own-save');
    assert.ok(await waitFor(() => visible(page, 'own-note')));
    assert.equal(await text(page, 'own-note'), 'That did not work. Check your connection and try again.');
    assert.equal(await page.eval(`document.getElementById('own-save').disabled`), false);
  });
});

test('after the draw a known browser sees its match and the wishes, never the join form', async () => {
  const table = { santa_page: draw({ state: 'drawn', can_join: false, me: me({ match: MATCH }) }) };
  await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'match')));
    assert.equal(await text(page, 'match-line'), 'Petros, you are buying a gift for');
    assert.equal(await text(page, 'match-name'), 'Maria');
    assert.equal(await text(page, 'match-wishes-label'), 'Maria · gift preferences');
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('#match-wishes li')].map((li) => li.textContent)`), MATCH.wishes);
    assert.ok(!(await visible(page, 'join')));
    assert.ok(!(await visible(page, 'recover')));
    assert.ok(!(await visible(page, 'waiting')));
    // Keep it in Mazí is for a phone; this is a computer.
    assert.equal(await page.eval(`document.getElementById('keep').hidden`), true);
    assert.equal(await page.eval(`document.getElementById('match').contains(document.getElementById('keep'))`), true);
    // Nothing but the key is kept, and the match goes nowhere else.
    assert.deepEqual(await page.eval(`Object.keys(localStorage).filter((k) => k !== 'mazi-theme')`), [`santa:${TOKEN}`]);
    assert.equal(await page.eval(`location.href.includes('Maria') || document.title.includes('Maria')`), false);
    assert.deepEqual(page.errors, []);
  });
});

test('a match with no wishes shows no wishes list', async () => {
  const table = { santa_page: draw({ state: 'drawn', can_join: false, me: me({ match: { name: 'Maria', wishes: [] } }) }) };
  await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'match')));
    assert.ok(!(await visible(page, 'match-wishes-label')));
  });
});

// The server refuses new wishes after the exchange date, so the page stops offering them.
test('past the exchange date the wishes editor is gone, before and after the draw', async () => {
  for (const page_ of [draw({ exchange_date: day(-1), me: me() }),
    draw({ state: 'drawn', can_join: false, exchange_date: day(-1), me: me({ match: MATCH }) })]) {
    await withPage(URL_, stub({ santa_page: page_ }, { stored: KEY }), async (page) => {
      assert.ok(await waitFor(async () => ['waiting', 'match'].includes(await state(page))));
      assert.ok(!(await visible(page, 'own')), page_.state);
      assert.deepEqual(page.errors, []);
    });
  }
  // On the exchange day itself it still shows, by the page's own clock.
  await withPage(URL_, stub({ santa_page: draw({ exchange_date: day(0), me: me() }) }, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'own')));
  });
});

test('the page reads the exchange date against its own clock', async () => {
  const christmas = draw({ state: 'drawn', can_join: false, exchange_date: '2026-12-25', me: me({ match: MATCH }) });
  await withPage(URL_, stub({ santa_page: christmas }, { stored: KEY, now: '2026-12-25' }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'match')));
    assert.ok(await visible(page, 'own'), 'on the day');
    assert.equal(await page.eval('new Date().getDate()'), 25);
  });
  await withPage(URL_, stub({ santa_page: christmas }, { stored: KEY, now: '2026-12-26' }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'match')));
    assert.ok(!(await visible(page, 'own')), 'the day after');
    assert.equal(await text(page, 'match-name'), 'Maria');
    assert.deepEqual(page.errors, []);
  });
});

test('after the draw a browser nobody knows gets the name and code form', async () => {
  const table = {
    santa_page: [draw({ state: 'drawn', can_join: false }), draw({ state: 'drawn', can_join: false, me: me({ match: MATCH }) })],
    santa_open: { ok: true },
  };
  await withPage(URL_, stub(table), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'recover')));
    assert.equal(await text(page, 'recover-intro'), 'This phone is not recognised. Enter your name and code to see your match.');
    assert.equal(await text(page, 'lost'), 'Lost your code? Ask the organizer for a new one.');
    assert.ok(!(await visible(page, 'join')));
    assert.ok(!(await visible(page, 'changed')));
    await type(page, 'recover-name', 'Petros');
    await type(page, 'recover-code', '4821');
    await page.click('#recover-submit');
    assert.ok(await waitFor(() => visible(page, 'match')));
    const all = await calls(page);
    const open = all.find((c) => c.fn === 'santa_open');
    assert.equal(open.args.p_token, TOKEN);
    assert.equal(open.args.p_name, 'Petros');
    assert.equal(open.args.p_code, '4821');
    assert.match(open.args.p_key, HEX64);
    assert.equal(all.at(-1).fn, 'santa_page');
    assert.equal(all.at(-1).args.p_key, open.args.p_key);
    assert.equal(await stored(page), open.args.p_key);
    assert.equal(await text(page, 'match-name'), 'Maria');
    assert.ok(!(await visible(page, 'recover')));
    assert.deepEqual(page.errors, []);
  });
});

test('a wrong code says how many tries are left, and keeps no key', async () => {
  const table = { santa_page: draw({ state: 'drawn', can_join: false }), santa_open: { ok: false, reason: 'wrong', left: 2 } };
  await withPage(URL_, stub(table), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'recover')));
    await type(page, 'recover-name', 'Petros');
    await type(page, 'recover-code', '1111');
    await page.click('#recover-submit');
    assert.ok(await waitFor(() => visible(page, 'recover-note')));
    assert.equal(await text(page, 'recover-note'), 'That is not the right code. 2 tries left.');
    assert.equal(await stored(page), null);
    assert.equal(await page.eval(`document.getElementById('recover-name').value`), 'Petros');
  });
});

test('a code of the wrong shape is wrong, with no count', async () => {
  const table = { santa_page: draw({ state: 'drawn', can_join: false }), santa_open: { ok: false, reason: 'bad_input' } };
  await withPage(URL_, stub(table), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'recover')));
    await type(page, 'recover-name', 'Petros');
    await type(page, 'recover-code', '12');
    await page.click('#recover-submit');
    assert.ok(await waitFor(() => visible(page, 'recover-note')));
    assert.equal(await text(page, 'recover-note'), 'That is not the right code.');
  });
});

test('too many wrong codes shows the locked words', async () => {
  const table = { santa_page: draw({ state: 'drawn', can_join: false }), santa_open: { ok: false, reason: 'locked', left: 0 } };
  await withPage(URL_, stub(table), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'recover')));
    await type(page, 'recover-name', 'Petros');
    await type(page, 'recover-code', '1111');
    await page.click('#recover-submit');
    assert.ok(await waitFor(() => visible(page, 'recover-note')));
    assert.equal(await text(page, 'recover-note'), 'Too many wrong codes. Ask the organizer for a new one.');
  });
});

test('a stored key the server no longer knows gets the code form, with a line about a new code', async () => {
  for (const state of ['drawn', 'open']) {
    const table = { santa_page: draw({ state, can_join: state === 'open' }), santa_open: { ok: false, reason: 'wrong', left: 4 } };
    await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
      assert.ok(await waitFor(() => visible(page, 'recover')), state);
      assert.ok(await visible(page, 'changed'), state);
      assert.equal(await text(page, 'changed'), 'If you opened this before, the organizer may have changed your code.');
      assert.ok(!(await visible(page, 'join')), state);
      // While the draw takes people, the way to the join form is offered too.
      assert.equal(await visible(page, 'back-line'), state === 'open', state);
      // The old key stays until a new one is accepted.
      await type(page, 'recover-name', 'Petros');
      await type(page, 'recover-code', '1111');
      await page.click('#recover-submit');
      assert.ok(await waitFor(() => visible(page, 'recover-note')), state);
      assert.equal(await stored(page), KEY, state);
    });
  }
  // An open draw that takes nobody new offers only the code.
  await withPage(URL_, stub({ santa_page: draw({ can_join: false }) }, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'recover')));
    assert.ok(!(await visible(page, 'back-line')));
  });
});

// The organizer removed this person (a mistyped name has no rename), so their
// code is gone with them: they join again from the same browser.
test('a removed person joins again from the same browser, and the new key replaces the old one', async () => {
  const table = { santa_page: draw(), santa_join: { ok: true, code: '7310' } };
  await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'recover')));
    assert.equal(await text(page, 'no-code'), 'Not joined yet? Add yourself');
    await page.click('#no-code');
    assert.equal(await state(page), 'join');
    assert.ok(await visible(page, 'join'));
    assert.ok(!(await visible(page, 'recover')));
    await type(page, 'join-name', 'Petros');
    await page.click('#join-submit');
    assert.ok(await waitFor(() => visible(page, 'code-card')));
    const join = (await calls(page)).find((c) => c.fn === 'santa_join');
    assert.match(join.args.p_key, HEX64);
    assert.notEqual(join.args.p_key, KEY);
    assert.equal(await stored(page), join.args.p_key);
    assert.equal(await text(page, 'code'), '7310');
    assert.equal(await text(page, 'in-heading'), "You're in, Petros");
    assert.deepEqual(page.errors, []);
  });
  // And back to the code form from there.
  await withPage(URL_, stub({ santa_page: draw() }, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'recover')));
    await page.click('#no-code');
    await page.click('#have-code');
    assert.equal(await state(page), 'recover');
    assert.ok(await visible(page, 'changed'));
    assert.ok(await visible(page, 'back-line'));
  });
});

test('a code reset by the organizer is said once', async () => {
  const table = { santa_page: draw({ state: 'drawn', can_join: false, me: me({ reset: true, match: MATCH }) }) };
  await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'match')));
    assert.ok(await visible(page, 'reset'));
    assert.equal(await text(page, 'reset'), 'Your code was reset by the organizer.');
  });
  await withPage(URL_, stub({ santa_page: draw({ state: 'drawn', can_join: false, me: me({ match: MATCH }) }) }, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'match')));
    assert.ok(!(await visible(page, 'reset')));
  });
});

test('names and wishes from people are shown as text, never as markup', async () => {
  const evil = '<img src=x onerror=alert(1)>';
  const greek = 'Ελένη & "Co"';
  const table = {
    santa_page: draw({
      state: 'drawn', can_join: false, name: evil, budget: greek, people: [evil, greek], exchange_date: CHRISTMAS_2099,
      me: me({ name: evil, wishes: [evil, greek], match: { name: greek, wishes: [evil, greek] } }),
    }),
  };
  await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'match')));
    assert.equal(await text(page, 'heading'), evil);
    assert.equal(await text(page, 'facts'), `Up to ${greek} · exchange Fri 25 Dec`);
    assert.equal(await text(page, 'match-line'), `${evil}, you are buying a gift for`);
    assert.equal(await text(page, 'match-name'), greek);
    assert.equal(await text(page, 'match-wishes-label'), `${greek} · gift preferences`);
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('#match-wishes li')].map((li) => li.textContent)`), [evil, greek]);
    assert.equal(await page.eval(`document.getElementById('own-wish-1').value`), evil);
    assert.equal(await page.eval(`document.getElementById('own-wish-2').value`), greek);
    // The only images are the page's own: the brand and the store badges.
    assert.deepEqual(await page.eval(`[...document.images].filter((i) => !i.getAttribute('src').startsWith('/assets/')).length`), 0);
    assert.equal(await page.eval(`document.querySelectorAll('main img:not(.badge img)').length`), 0);
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(await page.eval('window.__alerts'), []);
    assert.deepEqual(page.errors, []);
  });
  await withPage(URL_, stub({ santa_page: draw({ name: evil, people: [evil, greek] }) }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    assert.equal(await text(page, 'people'), `In so far: ${evil}, ${greek}`);
    assert.equal(await page.eval(`[...document.images].filter((i) => !i.getAttribute('src').startsWith('/assets/')).length`), 0);
  });
});

test('a draw with no budget shows only the date', async () => {
  await withPage(URL_, stub({ santa_page: draw({ budget: '', exchange_date: '2099-01-05' }) }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    assert.equal(await text(page, 'facts'), 'Exchange Mon 5 Jan');
  });
});

test('?lang=el, and a phone set to Greek, read the page in Greek', async () => {
  await withPage('/santa?lang=el', stub({}), async (page) => {
    assert.equal(await page.eval('document.documentElement.lang'), 'el');
    assert.equal(await text(page, 'heading'), 'Αυτό το Secret Santa έχει τελειώσει.');
  });
  await withPage('/santa', stub({}, { greek: true }), async (page) => {
    assert.equal(await page.eval('document.documentElement.lang'), 'el');
    assert.equal(await text(page, 'heading'), 'Αυτό το Secret Santa έχει τελειώσει.');
    assert.equal(await text(page, 'made'), 'Οργανώθηκε με το Mazí, τον οικογενειακό οργανωτή');
  });
  await withPage('/santa?lang=en', stub({}, { greek: true }), async (page) => {
    assert.equal(await page.eval('document.documentElement.lang'), 'en');
    assert.equal(await text(page, 'heading'), 'This Secret Santa has ended.');
  });
  await withPage(`${URL_}&lang=el`, stub({ santa_page: draw({ exchange_date: CHRISTMAS_2099 }) }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    assert.equal(await text(page, 'facts'), 'Έως €20 · ανταλλαγή Παρ 25 Δεκ');
    assert.equal(await text(page, 'join-submit'), 'Μπαίνω');
    assert.equal(await text(page, 'join-name-label'), 'Το όνομά σας');
    assert.equal(await text(page, 'people'), 'Μέχρι τώρα μπήκαν: Eleni, Nikos');
    assert.deepEqual(page.errors, []);
  });
  const joined = { santa_page: draw(), santa_join: { ok: true, code: '4821' } };
  await withPage(`${URL_}&lang=el`, stub(joined), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    await type(page, 'join-name', 'Petros');
    await page.click('#join-submit');
    assert.ok(await waitFor(() => visible(page, 'code-card')));
    assert.equal(await text(page, 'code-keep'), 'Κρατήστε τον, αρκεί ένα στιγμιότυπο. Με αυτόν βλέπετε ποιος σας έτυχε από κάθε κινητό ή browser.');
  });
  const table = { santa_page: draw({ state: 'drawn', can_join: false, me: me({ match: MATCH }) }) };
  await withPage(`${URL_}&lang=el`, stub(table, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'match')));
    assert.equal(await text(page, 'match-line'), 'Petros, παίρνετε δώρο για');
    assert.equal(await text(page, 'match-wishes-label'), 'Maria · προτιμήσεις δώρου');
  });
  const wrong = { santa_page: draw({ state: 'drawn', can_join: false }), santa_open: { ok: false, reason: 'wrong', left: 3 } };
  await withPage(`${URL_}&lang=el`, stub(wrong), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'recover')));
    assert.equal(await text(page, 'recover-intro'), 'Αυτό το κινητό δεν αναγνωρίζεται. Γράψτε το όνομα και τον κωδικό σας για να δείτε ποιος σας έτυχε.');
    assert.equal(await text(page, 'recover-submit'), 'Άνοιγμα');
    await type(page, 'recover-name', 'Petros');
    await type(page, 'recover-code', '1111');
    await page.click('#recover-submit');
    assert.ok(await waitFor(() => visible(page, 'recover-note')));
    assert.equal(await text(page, 'recover-note'), 'Ο κωδικός δεν είναι σωστός. Απομένουν 3 προσπάθειες.');
  });
});

test('a page that cannot reach the server says so and tries again', async () => {
  await withPage(URL_, stub({ santa_page: ['fail', draw()] }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'failed')));
    assert.equal(await text(page, 'failed-text'), 'That did not work. Check your connection and try again.');
    assert.ok(!(await visible(page, 'join')));
    await page.click('#retry');
    assert.ok(await waitFor(() => visible(page, 'join')));
    assert.ok(!(await visible(page, 'failed')));
  });
});

test('a private tab whose storage throws still joins and keeps its key for the visit', async () => {
  const table = { santa_page: draw(), santa_join: { ok: true, code: '0042' }, santa_set_wishes: { ok: true } };
  await withPage(URL_, stub(table, { blocked: true }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    await type(page, 'join-name', 'Petros');
    await page.click('#join-submit');
    assert.ok(await waitFor(() => visible(page, 'code-card')));
    assert.equal(await text(page, 'code'), '0042');
    await type(page, 'own-wish-1', 'Tea');
    await page.click('#own-save');
    assert.ok(await waitFor(async () => (await calls(page)).some((c) => c.fn === 'santa_set_wishes')));
    const all = await calls(page);
    assert.equal(all.find((c) => c.fn === 'santa_set_wishes').args.p_key, all.find((c) => c.fn === 'santa_join').args.p_key);
    assert.deepEqual(page.errors, []);
  });
});

test('both store buttons carry the Secret Santa campaign', async () => {
  await withPage('/santa', stub({}), async (page) => {
    assert.match(await page.eval(`document.getElementById('play').getAttribute('href')`), /utm_campaign%3Dsite_santa$/);
    assert.match(await page.eval(`document.getElementById('apple').getAttribute('href')`), /[?&]ct=site_santa&/);
    assert.equal(await text(page, 'made'), 'Organized with Mazí, the family organizer');
  });
  const html = readFile('santa.html');
  assert.ok(html.includes('utm_campaign%3Dsite_santa"'));
  assert.ok(html.includes('ct=site_santa&amp;'));
});

// ---------- Keep it in Mazí ----------

// Unlike KEY in every part, so finding one is never finding the other.
const CODE = 'fedcba98765432100f1e2d3c4b5a6978';
const PLAY = 'https://play.google.com/store/apps/details?id=com.mazi.family&referrer=utm_source%3Dsite%26utm_medium%3Dlink%26utm_campaign%3Dsite_santa';
const drawn = (over = {}) => draw({ state: 'drawn', can_join: false, me: me({ match: MATCH }), ...over });
const keepWords = {
  ask: 'Have Mazí on this phone?',
  button: 'Keep it in Mazí',
  note: 'Your match stays in the app, and Mazí offers to add the exchange to your calendar. Needs the latest Mazí.',
};
// Asserts the code is nowhere but in the link the page asked to open.
async function codeKeptNowhere(page) {
  assert.equal(await page.eval(`(() => {
    const code = ${JSON.stringify(CODE)};
    const attrs = [...document.querySelectorAll('*')].some((e) => [...e.attributes].some((a) => a.value.includes(code)));
    return JSON.stringify(localStorage).includes(code) || JSON.stringify(sessionStorage).includes(code)
      || location.href.includes(code) || document.title.includes(code)
      || document.documentElement.textContent.includes(code) || attrs;
  })()`), false);
}

test('Keep it in Mazí shows under the match on a phone, never on a computer or before the match', async () => {
  for (const userAgent of [ANDROID, IPHONE]) {
    await withPage(URL_, stub({ santa_page: drawn() }, { stored: KEY }), async (page) => {
      assert.ok(await waitFor(() => visible(page, 'match')));
      assert.ok(await visible(page, 'keep'), userAgent);
      assert.equal(await page.eval(`document.getElementById('match').contains(document.getElementById('keep'))`), true);
      assert.equal(await text(page, 'keep-ask'), keepWords.ask);
      assert.equal(await text(page, 'keep-go'), keepWords.button);
      assert.equal(await text(page, 'keep-note'), keepWords.note);
      assert.ok(!(await visible(page, 'keep-failed')));
      // Showing it asks nothing: the code is made only on a tap.
      assert.deepEqual((await calls(page)).map((c) => c.fn), ['santa_page']);
      assert.deepEqual(page.errors, []);
    }, { userAgent });
    // Before the draw there is no match to keep.
    await withPage(URL_, stub({ santa_page: draw({ me: me() }) }, { stored: KEY }), async (page) => {
      assert.ok(await waitFor(() => visible(page, 'waiting')));
      assert.ok(!(await visible(page, 'keep')), userAgent);
    }, { userAgent });
    // Nor while the page loads, nor for a browser the draw does not know.
    await withPage(URL_, stub({ santa_page: 'fail' }), async (page) => {
      assert.ok(await waitFor(() => visible(page, 'failed')));
      assert.ok(!(await visible(page, 'keep')), userAgent);
    }, { userAgent });
    await withPage(URL_, stub({ santa_page: draw({ state: 'drawn', can_join: false }) }), async (page) => {
      assert.ok(await waitFor(() => visible(page, 'recover')));
      assert.ok(!(await visible(page, 'keep')), userAgent);
    }, { userAgent });
  }
  await withPage(URL_, stub({ santa_page: drawn() }, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'match')));
    assert.ok(!(await visible(page, 'keep')));
  });
});

test('on Android a tap asks for a one time code and opens Mazí through an intent, with Play behind it', async () => {
  const table = { santa_page: drawn(), santa_handoff: { ok: true, code: CODE } };
  await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
    const went = navigations(page);
    assert.ok(await waitFor(() => visible(page, 'keep')));
    await page.click('#keep-go');
    assert.ok(await waitFor(async () => went.length > 0));
    const handoff = (await calls(page)).filter((c) => c.fn === 'santa_handoff');
    assert.equal(handoff.length, 1);
    assert.equal(handoff[0].method, 'POST');
    assert.deepEqual(handoff[0].args, { p_token: TOKEN, p_key: KEY });
    assert.deepEqual(went, [
      `intent://santa-keep?c=${CODE}#Intent;scheme=mazi;package=com.mazi.family;S.browser_fallback_url=${encodeURIComponent(PLAY)};end`,
    ]);
    await codeKeptNowhere(page);
    assert.ok(!(await visible(page, 'keep-failed')));
    // Back from the app, the button asks for a new code: a spent one is never reused.
    assert.ok(await waitFor(async () => !(await page.eval(`document.getElementById('keep-go').disabled`)), 6000));
  }, { userAgent: ANDROID });
});

test('on an iPhone a tap opens mazi://santa-keep with the code', async () => {
  const table = { santa_page: drawn(), santa_handoff: { ok: true, code: CODE } };
  await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
    const went = navigations(page);
    assert.ok(await waitFor(() => visible(page, 'keep')));
    await page.click('#keep-go');
    assert.ok(await waitFor(async () => went.length > 0));
    assert.deepEqual(went, [`mazi://santa-keep?c=${CODE}`]);
    assert.deepEqual((await calls(page)).find((c) => c.fn === 'santa_handoff').args, { p_token: TOKEN, p_key: KEY });
    await codeKeptNowhere(page);
  }, { userAgent: IPHONE });
});

test('a handoff refused, failed or malformed says so and goes nowhere', async () => {
  for (const answer of [{ ok: false }, 'fail', { ok: true }, { ok: true, code: 'abc' }, { ok: true, code: `${CODE};end` }]) {
    const table = { santa_page: drawn(), santa_handoff: answer };
    await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
      const went = navigations(page);
      assert.ok(await waitFor(() => visible(page, 'keep')));
      await page.click('#keep-go');
      assert.ok(await waitFor(() => visible(page, 'keep-failed')), JSON.stringify(answer));
      assert.equal(await text(page, 'keep-failed'), 'That did not work. Check your connection and try again.');
      assert.equal(await page.eval(`document.getElementById('keep-go').disabled`), false);
      await new Promise((r) => setTimeout(r, 300));
      assert.deepEqual(went, [], JSON.stringify(answer));
      assert.ok(await visible(page, 'match'));
      assert.deepEqual(page.errors, []);
    }, { userAgent: ANDROID });
  }
});

test('the button waits for its answer, so two taps ask once', async () => {
  const table = { santa_page: drawn(), santa_handoff: { ok: true, code: CODE } };
  await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
    const went = navigations(page);
    assert.ok(await waitFor(() => visible(page, 'keep')));
    await page.eval(`(() => { const b = document.getElementById('keep-go'); b.click(); b.click(); return b.disabled; })()`);
    assert.ok(await waitFor(async () => went.length > 0));
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await calls(page)).filter((c) => c.fn === 'santa_handoff').length, 1);
    assert.equal(went.length, 1);
  }, { userAgent: IPHONE });
});

test('Keep it in Mazí reads Greek in Greek', async () => {
  const table = { santa_page: drawn(), santa_handoff: { ok: false } };
  await withPage(`${URL_}&lang=el`, stub(table, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'keep')));
    assert.equal(await text(page, 'keep-ask'), 'Έχετε το Mazí σε αυτό το κινητό;');
    assert.equal(await text(page, 'keep-go'), 'Κρατήστε το στο Mazí');
    assert.equal(await text(page, 'keep-note'), 'Το άτομο που σας έτυχε μένει στην εφαρμογή και το Mazí προτείνει να μπει η ανταλλαγή στο ημερολόγιό σας. Χρειάζεται την πιο πρόσφατη έκδοση του Mazí.');
    await page.click('#keep-go');
    assert.ok(await waitFor(() => visible(page, 'keep-failed')));
    assert.equal(await text(page, 'keep-failed'), 'Κάτι δεν πήγε καλά. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.');
  }, { userAgent: ANDROID });
});

test('the page builds no markup from strings', () => {
  const script = readFile('santa.html').match(/<script>\s*\(function \(\) \{[\s\S]*?<\/script>/)[0];
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|console\./);
  assert.doesNotMatch(readFile('santa.html'), /—/);
});
