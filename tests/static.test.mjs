// Checks the page files on disk against the rules every page must keep,
// and against the same page where this branch left main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseline, mainBlocks, hrefs, readFile as read } from './baseline.mjs';
import { PAGES, BOOT } from './pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STYLESHEET = '<link rel="stylesheet" href="/assets/site-1.css">';

// Text the redesign dropped on purpose (see the spec): the homepage's
// self-ticking list card and its "At home in light and dark" section.
// The SEO work of 2026-11-05 rewrote these: the hero says what Mazí is, and
// the pages describe app 1.2.3 (offline Shopping, the 9:00 Your day summary,
// thanks on finished tasks, the Mazi spelling in the stores).
const REMOVED = {
  'index.html': ['At home in light and dark.', 'This week', 'Bread, feta, kitchen roll', 'Take out the recycling',
    'Wednesday: chicken thighs', 'Dentist, Friday 16:00',
    '🏠 for the whole household',
    'One shared space for what to buy, who is doing what, what is for dinner, and what is happening this week. Everyone in the household sees the same lists, updated the moment something changes.',
    'A shared shopping list, organised by category and by shop. Tick items off as you go and watch the cart fill up. When a name is not enough, add a photo of the exact brand your partner actually meant.',
    'Assign a task to someone, or leave it unclaimed for whoever gets there first. Give it a date, add a time to get a reminder right then, or make a chore repeat every day, week or month. Each morning brings one quiet digest of what is due today.'],
  'shopping-list.html': [
    'The list groups itself into Produce, Bakery, Meat & Fish, Dairy, Pantry, Household, Frozen and Other. Mazí learns where your household files things: put oat milk under Dairy once, and next time it goes there by itself, on everyone\'s phone.',
    'No. Adding and ticking items needs an internet connection, which is what keeps everyone\'s list the same.'],
  'chores.html': [
    'Each morning at 9:00, a digest lists the tasks due today that are yours or anyone\'s, and leaves out everyone else\'s. Give a task a time and a reminder arrives right then, with a Done button. When someone gives you a task, you hear about it.'],
  'family-calendar.html': [
    'An event reminds the person it is for, or everyone when it is for everyone: an hour before it starts, or at 9:00 on the day for an all-day event. When someone adds an event, the rest of the household hears about it.'],
  'faq.html': [
    'A morning digest at 9:00 of the tasks due today that are yours or anyone\'s, a reminder at the time you give a task, a reminder an hour before an event that is for you or for everyone (at 9:00 on the day for an all-day event), and a notification when someone assigns you a task or adds an event. One switch in Settings turns them all on or off.',
    'Mazí (μαζί) is Greek for together. The app is in English and Greek: it follows your phone\'s language, and you can switch it in Settings.'],
};

// Every attribute value that names a URL; srcset holds several.
function urls(html) {
  const found = [];
  for (const m of html.matchAll(/\b(src|href|srcset)\s*=\s*"([^"]*)"/gi)) {
    if (m[1].toLowerCase() === 'srcset') found.push(...m[2].split(',').map((s) => s.trim().split(/\s+/)[0]));
    else found.push(m[2]);
  }
  return found;
}

// A page added since main has no earlier version to compare with.
const inMain = (file) => { try { baseline(file); return true; } catch { return false; } };

// The heads were compared with main's while the redesign was built; since the
// SEO work of 2026-11-05 they are checked against rules instead, in seo.test.mjs.
for (const { file } of PAGES) {
  const html = read(file);
  const compared = inMain(file) ? test : test.skip;

  test(`${file}: has the boot script once, before the stylesheet`, () => {
    const at = html.indexOf(BOOT);
    assert.ok(at >= 0, 'the boot script is missing');
    assert.equal(html.indexOf(BOOT, at + 1), -1, 'the boot script appears twice');
    const sheet = html.indexOf(STYLESHEET);
    assert.ok(sheet >= 0, 'site-1.css is not linked');
    assert.ok(at < sheet, 'the boot script comes after the stylesheet');
  });

  test(`${file}: uses no old stylesheet`, () => {
    assert.doesNotMatch(html, /article\.css|feature\.css/);
  });

  compared(`${file}: text is preserved`, () => {
    const now = new Set(mainBlocks(html));
    const removed = new Set(REMOVED[file] ?? []);
    const lost = mainBlocks(baseline(file)).filter((block) => !now.has(block) && !removed.has(block));
    assert.deepEqual(lost, []);
  });

  compared(`${file}: links are preserved`, () => {
    const now = new Set(hrefs(html));
    // The header's "Get the app" goes to the homepage's #get on pages without one.
    const ownGet = /\bid="get"/.test(html);
    const lost = hrefs(baseline(file)).filter((h) => !now.has(h) && !(h === '#get' && !ownGet && now.has('/#get')));
    assert.deepEqual(lost, []);
  });

  // The header menu lists the parts of Mazí in the homepage's order (/join has no menu).
  test(`${file}: the menu reads Shopping, Tasks, Calendar, Meals, FAQ`, () => {
    const nav = html.match(/<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/);
    if (file === 'join.html') { assert.equal(nav, null); return; }
    assert.ok(nav, 'no header menu');
    assert.deepEqual([...nav[1].matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => `${m[2]} ${m[1]}`),
      ['Shopping /shopping-list', 'Tasks /chores', 'Calendar /family-calendar', 'Meals /meal-planner', 'FAQ /faq']);
  });

  // The footer lists the parts of Mazí in the same order as the menu.
  test(`${file}: the footer reads shopping, chores, calendar, meals`, () => {
    const footer = html.match(/<footer>[\s\S]*?<\/footer>/)?.[0] ?? '';
    const order = [...footer.matchAll(/href="\/(shopping-list|chores|family-calendar|meal-planner)"/g)].map((m) => m[1]);
    assert.deepEqual(order, ['shopping-list', 'chores', 'family-calendar', 'meal-planner']);
  });

  test(`${file}: no free text`, () => {
    assert.doesNotMatch(html, /<input|<textarea|contenteditable/i);
  });

  test(`${file}: assets are absolute`, () => {
    // "assets/x" or "./assets/x" breaks on the 404 page, which answers at any depth.
    const relative = urls(html).filter((u) => /^(\.{0,2}\/)*assets\//.test(u) && !u.startsWith('/'));
    assert.deepEqual(relative, []);
  });

  test(`${file}: store links use the official badges`, () => {
    for (const [tag, href, inner] of html.matchAll(/<a\b[^>]*?\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      if (!/play\.google\.com|apps\.apple\.com/.test(href)) continue;
      // A plain text link inside an answer ("on the App Store") is fine; a button-like one is not.
      if (!/\bclass=/.test(tag) && !/<img/i.test(inner)) continue;
      assert.match(inner, /google-play-badge\.png|app-store-badge\.svg/, href);
    }
  });

  test(`${file}: nothing loads from another site`, () => {
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc="http/i);
    for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
      const rel = tag.match(/\brel="([^"]*)"/i)?.[1].toLowerCase().split(/\s+/) ?? [];
      const href = tag.match(/\bhref="([^"]*)"/i)?.[1] ?? '';
      if (rel.some((r) => ['stylesheet', 'preload', 'modulepreload'].includes(r))) {
        assert.doesNotMatch(href, /^(https?:)?\/\//i, tag);
      }
    }
  });
}

const css = () => read('assets/site-1.css').replace(/\/\*[\s\S]*?\*\//g, '');
const declarations = (block) => block.split(';').map((d) => d.trim().replace(/\s*:\s*/, ': ')).filter(Boolean);

// Every page opens in day, whatever the visitor's system is set to; night
// comes only from the switch (his choice, 2026-11-05). So nothing on the
// site may look at the system's dark setting, and the browser's bar is cream.
test('nothing follows the system dark setting', () => {
  const files = [...fs.readdirSync(ROOT).filter((n) => n.endsWith('.html')),
    ...fs.readdirSync(path.join(ROOT, 'assets')).filter((n) => /\.(css|js)$/.test(n)).map((n) => `assets/${n}`)];
  for (const f of files) assert.doesNotMatch(read(f), /prefers-color-scheme/, f);
  for (const { file } of PAGES) {
    assert.deepEqual([...read(file).matchAll(/<meta name="theme-color"[^>]*>/g)].map((m) => m[0]),
      ['<meta name="theme-color" content="#FFF7EC">'], file);
  }
  assert.equal([...css().matchAll(/:root\[data-theme="night"\]\s*\{([^}]*)\}/g)].length, 1, 'one :root[data-theme="night"] block');
});

test('site-1.css: the colours are the agreed ones', () => {
  const tokens = (block) => Object.fromEntries(declarations(block)
    .filter((d) => d.startsWith('--')).map((d) => d.split(': ')).map(([k, v]) => [k, v.toLowerCase()]));
  const day = tokens(css().match(/(?:^|\})\s*:root\s*\{([^}]*)\}/)[1]);
  const night = tokens(css().match(/:root\[data-theme="night"\]\s*\{([^}]*)\}/)[1]);
  const agreed = {
    day: { '--bg': '#fff7ec', '--fg': '#1f2d3a', '--muted': '#56636f', '--card': '#fff', '--blob': '#12b3a6',
      '--line': '#1f2d3a', '--soft': '#eef8f6', '--hi': '#ffe9a8', '--accent': '#0d8478', '--tint1': '#e3f5f1',
      '--tint2': '#fff1c9', '--tint3': '#fde2e4', '--tint4': '#e9e4fb' },
    night: { '--bg': '#141e33', '--fg': '#f3eedf', '--muted': '#aeb8c8', '--card': '#1f2b45', '--blob': '#0b7b72',
      '--line': '#070c18', '--soft': '#26375a', '--hi': '#2e2a55', '--accent': '#3fd3c3', '--tint1': '#17364a',
      '--tint2': '#3a3350', '--tint3': '#3e2c45', '--tint4': '#2b2f57', '--accent-text': '#3fd3c3' },
  };
  for (const [k, v] of Object.entries(agreed.day)) assert.equal(day[k], v, `day ${k}`);
  for (const [k, v] of Object.entries(agreed.night)) assert.equal(night[k], v, `night ${k}`);
  assert.ok(day['--accent-text'] && day['--accent-text'] !== '#0d8478', 'a darker day --accent-text');
  assert.ok(day['--shadow'], 'a --shadow token');
});

test('old stylesheets are gone', () => {
  for (const f of ['assets/article.css', 'assets/feature.css']) assert.equal(fs.existsSync(path.join(ROOT, f)), false, f);
  for (const f of fs.readdirSync(ROOT).filter((n) => n.endsWith('.html'))) {
    const html = read(f);
    assert.ok(!/article\.css|feature\.css/.test(html), `${f} still mentions an old stylesheet`);
  }
});

test('every published page is tested', () => {
  const onDisk = fs.readdirSync(ROOT).filter((n) => n.endsWith('.html')).sort();
  assert.deepEqual(onDisk, PAGES.map((p) => p.file).sort());
});

test('page titles are unique and under 70 characters', () => {
  const seen = new Map();
  for (const f of fs.readdirSync(ROOT).filter((n) => n.endsWith('.html'))) {
    const m = read(f).match(/<title>([^<]*)<\/title>/);
    assert.ok(m, `${f} has no title`);
    const title = m[1].trim();
    assert.ok(title.length < 70, `${f} title is ${title.length} characters`);
    assert.ok(!seen.has(title), `${f} repeats the title of ${seen.get(title)}`);
    seen.set(title, f);
  }
});
