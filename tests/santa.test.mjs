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

const draw = (over = {}) => ({
  state: 'open', name: 'Family Secret Santa', budget: '€20', exchange_date: '2026-12-25',
  can_join: true, people: ['Eleni', 'Nikos'], me: null, ...over,
});
const me = (over = {}) => ({ name: 'Petros', wishes: ['A good book'], reset: false, match: null, ...over });
const MATCH = { name: 'Maria', wishes: ['A warm scarf', 'Hand cream'] };

// Replaces fetch with a stub that answers each function from `table`. A list
// answers its entries in turn and then keeps answering the last; 'fail' is a
// network failure. `stored` puts a key in localStorage for the draw first,
// `blocked` makes localStorage throw, as some private tabs do.
function stub(table, { stored = null, blocked = false, greek = false } = {}) {
  return `(() => {
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

async function withPage(url, initScript, fn) {
  const page = await browser.newPage({ initScript });
  try {
    await page.goto(server.origin + url);
    return await fn(page);
  } finally {
    await page.close();
  }
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
  await withPage(URL_, stub({ santa_page: draw() }), async (page) => {
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

test('an open draw that takes nobody new says so', async () => {
  await withPage(URL_, stub({ santa_page: draw({ can_join: false }) }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'closed')));
    assert.equal(await text(page, 'closed'), 'This Secret Santa is not taking new people right now.');
    assert.ok(!(await visible(page, 'join')));
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
    assert.equal(await text(page, 'match-wishes-label'), 'Maria · wishes');
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('#match-wishes li')].map((li) => li.textContent)`), MATCH.wishes);
    assert.ok(!(await visible(page, 'join')));
    assert.ok(!(await visible(page, 'recover')));
    assert.ok(!(await visible(page, 'waiting')));
    // Left for Keep it in Mazí, which comes later.
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
      // The old key stays until a new one is accepted.
      await type(page, 'recover-name', 'Petros');
      await type(page, 'recover-code', '1111');
      await page.click('#recover-submit');
      assert.ok(await waitFor(() => visible(page, 'recover-note')), state);
      assert.equal(await stored(page), KEY, state);
    });
  }
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
      state: 'drawn', can_join: false, name: evil, budget: greek, people: [evil, greek],
      me: me({ name: evil, wishes: [evil, greek], match: { name: greek, wishes: [evil, greek] } }),
    }),
  };
  await withPage(URL_, stub(table, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'match')));
    assert.equal(await text(page, 'heading'), evil);
    assert.equal(await text(page, 'facts'), `Up to ${greek} · exchange Fri 25 Dec`);
    assert.equal(await text(page, 'match-line'), `${evil}, you are buying a gift for`);
    assert.equal(await text(page, 'match-name'), greek);
    assert.equal(await text(page, 'match-wishes-label'), `${greek} · wishes`);
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
  await withPage(URL_, stub({ santa_page: draw({ budget: '', exchange_date: '2027-01-05' }) }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    assert.equal(await text(page, 'facts'), 'Exchange Tue 5 Jan');
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
  await withPage(`${URL_}&lang=el`, stub({ santa_page: draw() }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'join')));
    assert.equal(await text(page, 'facts'), 'Έως €20 · ανταλλαγή Παρ 25 Δεκ');
    assert.equal(await text(page, 'join-submit'), 'Μπαίνω');
    assert.equal(await text(page, 'join-name-label'), 'Το όνομά σας');
    assert.equal(await text(page, 'people'), 'Μέχρι τώρα: Eleni, Nikos');
    assert.deepEqual(page.errors, []);
  });
  const table = { santa_page: draw({ state: 'drawn', can_join: false, me: me({ match: MATCH }) }) };
  await withPage(`${URL_}&lang=el`, stub(table, { stored: KEY }), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'match')));
    assert.equal(await text(page, 'match-line'), 'Petros, παίρνετε δώρο για');
    assert.equal(await text(page, 'match-wishes-label'), 'Maria · επιθυμίες');
  });
  const wrong = { santa_page: draw({ state: 'drawn', can_join: false }), santa_open: { ok: false, reason: 'wrong', left: 3 } };
  await withPage(`${URL_}&lang=el`, stub(wrong), async (page) => {
    assert.ok(await waitFor(() => visible(page, 'recover')));
    assert.equal(await text(page, 'recover-intro'), 'Αυτό το κινητό δεν αναγνωρίζεται. Γράψτε το όνομα και τον κωδικό σας για να δείτε το όνομα.');
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

test('the page builds no markup from strings', () => {
  const script = readFile('santa.html').match(/<script>\s*\(function \(\) \{[\s\S]*?<\/script>/)[0];
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|console\./);
  assert.doesNotMatch(readFile('santa.html'), /—/);
});
