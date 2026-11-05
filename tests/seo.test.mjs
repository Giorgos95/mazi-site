// What search engines and AI search read: each page's head, its structured
// data, the sitemap, robots.txt, llms.txt and the links between pages. All
// from the files on disk, so it runs without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile as read } from './baseline.mjs';
import { PAGES } from './pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://meetmazi.com';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1));
  return ENTITIES[e.toLowerCase()] ?? m;
});
// The words a reader sees in a piece of HTML.
const text = (html) => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

const head = (html) => html.match(/<head>[\s\S]*?<\/head>/)[0];
const meta = (html, attr, name) => {
  const tag = head(html).match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)">`));
  return tag ? decode(tag[1]) : undefined;
};
const canonical = (html) => head(html).match(/<link rel="canonical" href="([^"]*)">/)?.[1];
const noindex = (html) => /<meta name="robots" content="[^"]*noindex/.test(head(html));
const jsonld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

// The pages meant for search: everything but /join, /tiktok and the 404 page.
const INDEXABLE = PAGES.filter(({ file, kind }) => kind !== '404' && !noindex(read(file)));
const urlOf = (p) => SITE + p;

test('the pages meant for search are the ones expected', () => {
  assert.deepEqual(INDEXABLE.map((p) => p.path).sort(),
    ['/', '/chores', '/cozi-alternative', '/delete-account', '/family-calendar', '/faq', '/meal-planner', '/privacy',
      '/shopping-list', '/terms']);
  for (const file of ['join.html', 'tiktok.html']) assert.ok(noindex(read(file)), `${file} should stay out of search`);
});

for (const { path: p, file } of INDEXABLE) {
  const html = read(file);

  test(`${p}: canonical, description and sharing tags`, () => {
    assert.equal(canonical(html), urlOf(p));
    const description = meta(html, 'name', 'description');
    assert.ok(description, 'no meta description');
    // Google cuts a snippet at about 155-160 characters, and Bing Webmaster
    // Tools called the homepage's 151 too long (2026-11-05), so 150 is the most.
    assert.ok(description.length >= 70 && description.length <= 150, `description is ${description.length} characters`);
    for (const k of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name', 'og:image:alt']) {
      assert.ok(meta(html, 'property', k), `no ${k}`);
    }
    assert.equal(meta(html, 'property', 'og:url'), urlOf(p));
    assert.match(meta(html, 'property', 'og:image'), /^https:\/\/meetmazi\.com\//);
    assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image');
    assert.match(head(html), /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/);
  });

  test(`${p}: one h1, and the page says it is in English`, () => {
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
    assert.match(html, /<html lang="en">/);
  });

  test(`${p}: every image has an alt`, () => {
    for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) assert.match(tag, /\balt="/, tag);
  });

  // FAQ markup must say what the page says (Google's rule for FAQPage), so
  // an answer changed on the page cannot drift from the one in the markup.
  test(`${p}: every question in the markup is on the page, word for word`, () => {
    const onPage = new Map([...html.matchAll(/<section class="qa">\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)]
      .map((m) => [text(m[1]), text(m[2])]));
    const questions = jsonld(html).flatMap((d) => d['@graph'] ?? [d]).filter((n) => n['@type'] === 'FAQPage')
      .flatMap((n) => n.mainEntity);
    for (const q of questions) {
      assert.ok(onPage.has(q.name), `"${q.name}" is not a question on the page`);
      assert.equal(q.acceptedAnswer.text, onPage.get(q.name), q.name);
    }
  });
}

test('structured data parses, and every @id it points at is defined', () => {
  const defined = new Map();
  const refs = [];
  const walk = (node, file) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, file));
    if (!node || typeof node !== 'object') return;
    const keys = Object.keys(node);
    if (keys.length === 1 && keys[0] === '@id') refs.push([node['@id'], file]);
    else if (node['@id']) {
      assert.ok(!defined.has(node['@id']), `${node['@id']} is defined twice (${defined.get(node['@id'])} and ${file})`);
      defined.set(node['@id'], file);
    }
    for (const v of Object.values(node)) walk(v, file);
  };
  for (const { file } of PAGES) for (const doc of jsonld(read(file))) walk(doc, file);
  for (const [id, file] of refs) assert.ok(defined.has(id), `${file} points at ${id}, which no page defines`);
  // The homepage holds the organisation, the site and the app every page points at.
  for (const id of ['#organization', '#website', '#app']) assert.equal(defined.get(SITE + '/' + id), 'index.html', id);
});

test('breadcrumbs lead to real pages', () => {
  for (const { file } of PAGES) {
    for (const node of jsonld(read(file)).flatMap((d) => d['@graph'] ?? [d])) {
      if (node['@type'] !== 'BreadcrumbList') continue;
      const items = node.itemListElement.map((i) => i.item);
      assert.equal(items[0], SITE + '/', file);
      for (const item of items) assert.ok(INDEXABLE.some((p) => urlOf(p.path) === item), `${file}: ${item}`);
      assert.deepEqual(node.itemListElement.map((i) => i.position), items.map((_, i) => i + 1), file);
    }
  }
});

test('the sitemap lists exactly the pages meant for search', () => {
  const xml = read('sitemap.xml');
  const entries = [...xml.matchAll(/<url>\s*<loc>([^<]*)<\/loc>\s*<lastmod>([^<]*)<\/lastmod>\s*<\/url>/g)];
  assert.equal(entries.length, [...xml.matchAll(/<url>/g)].length, 'every <url> has a <loc> and a <lastmod>');
  assert.deepEqual(entries.map((e) => e[1]).sort(), INDEXABLE.map((p) => urlOf(p.path)).sort());
  const today = new Date().toISOString().slice(0, 10);
  for (const [, loc, lastmod] of entries) {
    assert.match(lastmod, /^\d{4}-\d{2}-\d{2}$/, loc);
    assert.ok(lastmod <= today, `${loc} is dated in the future`);
  }
});

test('robots.txt lets every crawler in and names the sitemap', () => {
  const robots = read('robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.doesNotMatch(robots, /^Disallow: \/\s*$/m);
  assert.match(robots, /^Sitemap: https:\/\/meetmazi\.com\/sitemap\.xml$/m);
});

// Where an address on the site leads: a page, a file, a redirect, or nowhere.
const redirects = new Map(read('_redirects').split('\n').map((l) => l.trim().split(/\s+/))
  .filter(([from, , status]) => from && !from.startsWith('#') && status === '301').map(([from, to]) => [from, to]));
function exists(address) {
  const p = decodeURI(address.split(/[?#]/)[0]);
  if (p === '/') return true;
  if (redirects.has(p)) return exists(redirects.get(p));
  return [p, p + '.html'].some((f) => fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile());
}

test('every link and image on the site leads somewhere', () => {
  for (const { file } of PAGES) {
    const html = read(file);
    for (const [, attr, value] of html.matchAll(/\b(href|src|srcset)="([^"]*)"/g)) {
      const addresses = attr === 'srcset' ? value.split(',').map((s) => s.trim().split(/\s+/)[0]) : [value];
      for (const a of addresses) {
        if (a.startsWith('/') && !a.startsWith('//')) assert.ok(exists(a), `${file}: ${a}`);
        if (a.startsWith(SITE)) assert.ok(exists(a.slice(SITE.length) || '/'), `${file}: ${a}`);
      }
    }
  }
});

// What the Cozi page says about Cozi is true on the day it was read, so the
// page says which day, links where each fact came from, and the date it gives
// readers, the date in its markup and the sitemap's all move together.
test('the Cozi page dates what it says about Cozi and names its sources', () => {
  const html = read('cozi-alternative.html');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
    'November', 'December'];
  const [, day, month, year] = text(html.match(/<p class="updated">([\s\S]*?)<\/p>/)[1]).match(/read on (\d{1,2}) (\w+) (\d{4})/);
  const read_ = `${year}-${String(months.indexOf(month) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
  const page = jsonld(html)[0]['@graph'].find((n) => n['@id'] === SITE + '/cozi-alternative#page');
  assert.equal(page.dateModified, read_);
  assert.match(read('sitemap.xml'), new RegExp(`<loc>${SITE}/cozi-alternative</loc>\\s*<lastmod>${read_}</lastmod>`));
  for (const source of ['https://www.cozi.com/compare-plans/', 'https://www.cozi.com/faq/',
    'https://www.cozi.com/using-cozi-with-other-calendars/']) {
    assert.ok(html.includes(`href="${source}"`), source);
  }
});

test('the root icons browsers ask for are there', () => {
  for (const f of ['favicon.ico', 'apple-touch-icon.png']) assert.ok(fs.statSync(path.join(ROOT, f)).size > 0, f);
});

test('llms.txt links only to pages meant for search, and names every one of them', () => {
  const llms = read('llms.txt');
  const links = [...llms.matchAll(/\]\((https:\/\/meetmazi\.com[^)]*)\)/g)].map((m) => m[1]);
  for (const link of links) assert.ok(INDEXABLE.some((p) => urlOf(p.path) === link), link);
  for (const { path: p } of INDEXABLE) assert.ok(links.includes(urlOf(p)), `llms.txt does not link ${p}`);
});
