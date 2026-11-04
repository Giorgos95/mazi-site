// Checks the page files on disk against the rules every page must keep,
// and against the same page where this branch left main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseline, headParts, mainBlocks, hrefs, readFile as read } from './baseline.mjs';
import { PAGES, BOOT } from './pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STYLESHEET = '<link rel="stylesheet" href="/assets/site-1.css">';

// Text the redesign dropped on purpose (see the spec): the homepage's
// self-ticking list card and its "At home in light and dark" section.
const REMOVED = {
  'index.html': ['At home in light and dark.', 'This week', 'Bread, feta, kitchen roll', 'Take out the recycling',
    'Wednesday: chicken thighs', 'Dentist, Friday 16:00'],
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

for (const { file } of PAGES) {
  const html = read(file);

  test(`${file}: head is unchanged`, () => {
    assert.deepEqual(headParts(html), headParts(baseline(file)));
  });

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

  test(`${file}: text is preserved`, () => {
    const now = new Set(mainBlocks(html));
    const removed = new Set(REMOVED[file] ?? []);
    const lost = mainBlocks(baseline(file)).filter((block) => !now.has(block) && !removed.has(block));
    assert.deepEqual(lost, []);
  });

  test(`${file}: links are preserved`, () => {
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

// The night colours are written twice: for the switch, and for visitors
// without JavaScript whose system is dark. CSS cannot share one block
// without a build step, so this keeps the two copies the same.
const css = () => read('assets/site-1.css').replace(/\/\*[\s\S]*?\*\//g, '');
const declarations = (block) => block.split(';').map((d) => d.trim().replace(/\s*:\s*/, ': ')).filter(Boolean);

test('site-1.css: the two night blocks match', () => {
  const switched = [...css().matchAll(/:root\[data-theme="night"\]\s*\{([^}]*)\}/g)];
  const system = [...css().matchAll(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme\]\)\s*\{([^}]*)\}/g)];
  assert.equal(switched.length, 1, 'one :root[data-theme="night"] block');
  assert.equal(system.length, 1, 'one no-JS dark block');
  assert.deepEqual(declarations(system[0][1]), declarations(switched[0][1]));
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
