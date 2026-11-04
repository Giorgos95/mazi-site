// The homepage's own moving parts: the í waving beside the Today screen, and
// the family spelling Mazí at the end. site-1.js does the rest (the switch,
// the rise-ins, and the í in each feature row). Each part is one function
// that does nothing when its section is missing.
//
// Like the stylesheet, the name carries a number: a change that must reach
// every visitor at once goes in a new file, home-2.js.

import { Buddy, iSvg, letterSvg, dressLetter, startLooking } from './mascot-1.js';

// What the hero í does when tapped, in turn.
const HERO_REACTIONS = [['joy', 'hi! 👋'], ['cheeky', 'hehe'], ['phone', 'checking the list…'], ['surprised', 'oh! you again']];
const STARS = 26;

// Restarts a hop on something that may be hopping already.
function hop(el) {
  el.classList.remove('hop');
  void el.offsetWidth;
  el.classList.add('hop');
}

// ---------- Hero ----------

export function setupHero() {
  const hero = document.getElementById('hero');
  const el = hero?.querySelector('.hero-i');
  if (!el) return;

  // It waves even when the page opens at night: a dark phone should not be
  // greeted by a sleeping mascot. It only goes to bed when the visitor flips
  // the switch.
  const buddy = new Buddy(el, 'wave', el.querySelector('.say'));

  let turn = 0;
  el.addEventListener('click', () => {
    const [pose, text] = HERO_REACTIONS[turn++ % HERO_REACTIONS.length];
    buddy.act(pose, 1600, text);
  });
  hero.querySelector('.badges')?.addEventListener('mouseenter', () => buddy.act('joy', 1400, 'yes! that one!'));
  // A hop takes over from the idle hop; dropping the class afterwards lets
  // the idle hop come back.
  el.addEventListener('animationend', (e) => {
    if (e.target === el && e.animationName === 'hop') el.classList.remove('hop');
  });

  document.addEventListener('mazi:theme', ({ detail }) => {
    // The system turning dark by itself (at sunset) wakes nobody.
    if (!detail.byUser) return;
    if (detail.theme === 'night') {
      buddy.base = 'sleepy';
      clearTimeout(buddy.timer);
      buddy.set('sleepy');
      buddy.say('is it bedtime already?', 2200);
    } else {
      buddy.base = 'wave';
      buddy.act('joy', 1600, 'good morning! ☀️');
    }
  });

  // The night sky over the blob; the stylesheet shows it only at night.
  const sky = hero.querySelector('.stars');
  for (let i = 0; sky && i < STARS; i++) {
    const star = document.createElement('i');
    star.className = 'star';
    star.style.left = (Math.random() * 96).toFixed(1) + '%';
    star.style.top = (Math.random() * 40).toFixed(1) + '%';
    star.style.animationDelay = (-Math.random() * 3).toFixed(2) + 's';
    sky.append(star);
  }

  startLooking();
}

// ---------- Closing: Mazí, spelled by the family ----------

// The letters are measured, so they wait for Fredoka. If it fails to load
// they are measured in the fallback font instead.
function fontsReady() {
  if (!document.fonts?.load) return Promise.resolve();
  return document.fonts.load('600 150px Fredoka').catch(() => {}).then(() => document.fonts.ready);
}

// Trims a letter's drawing to the letter itself, 10 either side, so the
// four stand close together whatever their widths.
function cropToGlyph(box) {
  const svg = box.querySelector('svg');
  let bb;
  try { bb = svg.querySelector('text').getBBox(); } catch { return; }
  if (!bb.width) return;
  svg.setAttribute('viewBox', `${bb.x - 10} 0 ${bb.width + 20} 190`);
  // The eyes are now in the middle of the drawing, for the pointer tracking.
  box.dataset.ex = '0.5';
}

export function setupCta() {
  const section = document.getElementById('get');
  const row = section?.querySelector('.cta-row');
  if (!row) return;

  // All four are drawn at once, into the space the stylesheet keeps for them,
  // so nothing slides sideways as each one arrives.
  fontsReady().then(() => {
    for (const box of row.querySelectorAll('.cl')) {
      box.innerHTML = letterSvg(box.dataset.letter);
      dressLetter(box, box.dataset.colour);
      cropToGlyph(box);
    }
    const i = row.querySelector('.ci');
    if (i) {
      i.innerHTML = iSvg('wave');
      // Just the í, accent and trainers included, so it stands as tall as the M.
      i.querySelector('svg').setAttribute('viewBox', '58 0 116 240');
      i.dataset.ex = '0.45';
    }
    startLooking();
  });

  // They hop in turn, left to right, when the section comes 60% into view
  // (not again on the way out) or a store badge is pointed at.
  const cheer = () => [...row.children].forEach((el, n) => setTimeout(() => hop(el), n * 110));
  section.querySelector('.badges')?.addEventListener('mouseenter', cheer);
  new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.59)) cheer();
  }, { threshold: 0.6 }).observe(section);
}

setupHero();
setupCta();
