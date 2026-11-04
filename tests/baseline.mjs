// Reads pages as plain text, to compare the new site with the old one.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });

// Git on Windows (core.autocrlf) checks files out with CRLF line endings,
// while git show gives LF. Both sides are read with LF, so a comparison is
// about the content, not the line endings.
const lf = (text) => text.replace(/\r\n/g, '\n');

// The file as it was where this branch left main, so the redesign can't drift from it unnoticed.
export function baseline(file) {
  return lf(git('show', `${git('merge-base', 'HEAD', 'main').trim()}:${file}`));
}

// The file as it is now in the working tree (a path relative to the repo, or absolute).
export function readFile(file) {
  return lf(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1));
  return ENTITIES[e.toLowerCase()] ?? m;
});

// Attributes of one tag, by lower-case name.
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[2] ?? m[3];
  return out;
}

// Head pieces are kept raw (not decoded), so a byte-for-byte comparison means what it says.
export function headParts(html) {
  const head = html.match(/<head[\s>][\s\S]*?<\/head>/i)?.[0] ?? html;
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  let description, canonical;
  const og = {};
  for (const [tag] of head.matchAll(/<(?:meta|link)\b[^>]*>/gi)) {
    const a = attrs(tag);
    const isMeta = /^<meta/i.test(tag);
    if (isMeta && a.name === 'description') description = a.content;
    if (!isMeta && a.rel === 'canonical') canonical = a.href;
    if (isMeta && a.property?.startsWith('og:')) og[a.property] = a.content;
  }
  const jsonld = [...head.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  return { title, description, canonical, og, jsonld };
}

// The text of every heading, paragraph and list item inside <main>, in page
// order. A paragraph inside a list item shows up twice: on its own and as part of the item.
export function mainBlocks(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? '';
  const clean = main.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const found = [];
  const open = [];
  for (const m of clean.matchAll(/<(\/?)(h[1-4]|p|li)\b[^>]*>/gi)) {
    const name = m[2].toLowerCase();
    if (!m[1]) { open.push({ name, from: m.index + m[0].length }); continue; }
    const i = open.findLastIndex((o) => o.name === name);
    if (i < 0) continue;
    const [{ from }] = open.splice(i, 1);
    found.push([from, clean.slice(from, m.index)]);
  }
  return found.sort((a, b) => a[0] - b[0])
    .map(([, inner]) => decode(inner.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function hrefs(html) {
  const body = html.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? '';
  return [...body.matchAll(/<[a-z][^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => decode(m[1] ?? m[2]));
}
