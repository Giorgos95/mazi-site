// The homepage's own moving parts: the í waving beside the Today screen, the
// family chat landing in its places in Mazí, and the family spelling Mazí at
// the end. site-1.js does the rest (the switch, the rise-ins, and the í in
// each feature row). Each part is one function that does nothing when its
// section is missing.
//
// Like the stylesheet, the name carries a number: a change that must reach
// every visitor at once goes in a new file, home-2.js.

import { Buddy, iSvg, letterSvg, dressLetter, startLooking, TEAL } from './mascot-1.js';

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
    // Only the switch itself wakes it, not Back taking up a choice made on another page.
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

// ---------- The problem: the family chat, and each thing in its place ----------

// Someone types for 650 ms, the message lands, 450 ms pass, and the next
// one starts typing. Once all nine are in, nobody has picked anything up,
// so the chat buzzes every 1.7 s while it is on screen.
const TYPING_MS = 650;
const GAP_MS = 450;
const BUZZ_MS = 1700;
// The sort: each message's copy flies to its row in 850 ms, the first after
// 250 ms and each next one 140 ms after the one before.
const FLY_MS = 850;
const FIRST_MS = 250;
const STAGGER_MS = 140;
const CONFETTI = ['#12B3A6', '#FFD43B', '#FF6B81', '#4C6EF5', '#F59F00', '#B197FC'];

// Asked each time, so a change of the setting applies at once.
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// Paper bits bursting from a point on the screen, each removed as it lands.
// Decoration only: screen readers skip it, and reduced motion never sees it.
function confetti(x, y, n) {
  for (let k = 0; k < n; k++) {
    const bit = document.createElement('i');
    bit.className = 'confetti';
    bit.setAttribute('aria-hidden', 'true');
    Object.assign(bit.style, { left: x + 'px', top: y + 'px', background: CONFETTI[k % CONFETTI.length] });
    document.body.append(bit);
    const angle = Math.random() * Math.PI * 2;
    const reach = 40 + Math.random() * 70;
    const dx = (Math.cos(angle) * reach).toFixed(0);
    const dy = (Math.sin(angle) * reach + 40).toFixed(0);
    const burst = bit.animate([
      { transform: 'translate(-50%, -50%)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${(Math.random() * 540).toFixed(0)}deg) scale(.6)`, opacity: 0 },
    ], { duration: 750 + Math.random() * 400, easing: 'cubic-bezier(.2, .8, .3, 1)' });
    burst.onfinish = burst.oncancel = () => bit.remove();
  }
}

// The chat and the panel are both in the HTML. This empties the panel, plays
// the chat in once it is 30% on screen, and on the button sends a copy of
// each message flying to its row. Pressed again, it goes back to the chat.
// Mazí does not read a chat: the words around it say "in Mazí, each one has
// its place", and the í only watches.
export function setupSorter() {
  const box = document.getElementById('problem')?.querySelector('.sorter');
  if (!box) return;
  const chat = box.querySelector('.chat');
  const list = document.getElementById('chat-body');
  const messages = [...list.querySelectorAll('.dmsg')];
  // Each message's row, by the message's number.
  const rows = new Map([...box.querySelectorAll('.row')].map((row) => [row.dataset.from, row]));
  const sections = [...box.querySelectorAll('.mz-sec')];
  const typing = document.getElementById('typing');
  const quiet = document.getElementById('quiet');
  const unread = document.getElementById('unread');
  const button = document.getElementById('sort-btn');
  const iEl = document.getElementById('sort-i');
  const buddy = new Buddy(iEl, 'sad', iEl.querySelector('.say'));

  // Where things stand: the next message to play, the unread count, the
  // chat's timer, whether the panel is showing, whether a sort is in the
  // air (busy guards against a second press), and whether the chat has been
  // seen and is on screen now.
  const sorter = { next: 0, unread: 0, timer: 0, sorted: false, busy: false, seen: false, inView: false };

  const setUnread = (n) => { sorter.unread = n; unread.textContent = String(n); };
  const bump = () => { setUnread(sorter.unread + 1); hop(unread); };
  // The newest message stays in sight, as in any chat.
  const pin = () => { list.scrollTop = list.scrollHeight; };
  const shake = () => { chat.classList.remove('shake'); void chat.offsetWidth; chat.classList.add('shake'); };
  const count = () => {
    for (const sec of sections) {
      const n = sec.querySelectorAll('.row.in').length;
      sec.querySelector('.n').textContent = String(n);
      sec.classList.toggle('empty', n === 0);
    }
  };
  // The arrows are left out of the button's name for screen readers.
  const label = (sorted) => {
    button.innerHTML = sorted ? '<span aria-hidden="true">↺</span> Back to the chat' : 'Show me in Mazí <span aria-hidden="true">→</span>';
  };

  function tick() {
    if (sorter.sorted) return;
    const m = messages[sorter.next];
    if (!m) {
      if (sorter.inView) { bump(); shake(); }
      sorter.timer = setTimeout(tick, BUZZ_MS);
      return;
    }
    typing.querySelector('b').textContent = m.querySelector('.who').textContent;
    typing.classList.add('on');
    sorter.timer = setTimeout(() => {
      typing.classList.remove('on');
      m.classList.add('on', 'new');
      sorter.next++;
      bump();
      pin();
      sorter.timer = setTimeout(tick, GAP_MS);
    }, TYPING_MS);
  }

  // The chat from its first message. Under reduced motion all nine are
  // simply there.
  function play() {
    clearTimeout(sorter.timer);
    for (const m of messages) m.classList.remove('on', 'new', 'gone');
    sorter.next = 0;
    setUnread(0);
    if (!still()) return tick();
    for (const m of messages) m.classList.add('on');
    sorter.next = messages.length;
    setUnread(messages.length);
    pin();
  }

  // One message's copy flies from the chat to its row; the row appears as
  // it lands.
  function fly(m, row, n, area) {
    const from = m.getBoundingClientRect();
    // One scrolled up out of the chat sets off from the chat's top edge.
    const top = Math.max(from.top, area.top);
    const to = row.getBoundingClientRect();
    const copy = m.cloneNode(true);
    copy.classList.remove('on', 'new');
    copy.classList.add('flying');
    copy.setAttribute('aria-hidden', 'true');
    Object.assign(copy.style, { left: from.left + 'px', top: top + 'px', width: from.width + 'px' });
    document.body.append(copy);
    m.classList.add('gone');
    const dx = to.left - from.left;
    const dy = to.top - top;
    const flight = copy.animate([
      { transform: 'none' },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 110}px) rotate(${n % 2 ? 12 : -12}deg) scale(1.08)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.92)`, opacity: 0.1 },
    ], { duration: FLY_MS, delay: FIRST_MS + n * STAGGER_MS, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'forwards' });
    return new Promise((landed) => {
      flight.onfinish = flight.oncancel = () => {
        copy.remove();
        row.classList.add('in', 'pop');
        count();
        landed();
      };
    });
  }

  // Sorted: the panel full, the chat quiet, the í pleased.
  function settle() {
    for (const m of messages) m.classList.remove('on', 'new', 'gone');
    for (const row of rows.values()) row.classList.add('in');
    quiet.hidden = false;
    setUnread(0);
    count();
    label(true);
    buddy.base = 'idle';
    buddy.act('joy', 2400, "that's better 😌");
    if (!still()) {
      const r = iEl.getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top + 30, 24);
    }
    sorter.busy = false;
    button.removeAttribute('aria-disabled');
  }

  async function sort() {
    clearTimeout(sorter.timer);
    sorter.sorted = true;
    // Pressed before the chat came into view: no "help…" after this.
    sorter.seen = true;
    typing.classList.remove('on');
    chat.classList.remove('shake');
    button.classList.remove('pulse');
    // Whatever was still to come arrives at once.
    for (const m of messages) m.classList.add('on');
    pin();
    if (still()) return settle();
    sorter.busy = true;
    button.setAttribute('aria-disabled', 'true');
    buddy.base = 'strain';
    buddy.set('strain');
    buddy.say('watch this', 1500);
    await nextFrame();
    const area = list.getBoundingClientRect();
    await Promise.all(messages.map((m, n) => fly(m, rows.get(m.dataset.i), n, area)));
    settle();
  }

  function reset() {
    sorter.sorted = false;
    for (const row of rows.values()) {
      row.classList.remove('in', 'pop', 'done');
      // Calendar rows have no tick: an event is never "done".
      row.querySelector('.tk')?.setAttribute('aria-pressed', 'false');
    }
    quiet.hidden = true;
    count();
    label(false);
    button.classList.add('pulse');
    buddy.base = 'sad';
    buddy.act('sad', 1500, 'oh no, not again');
    play();
  }

  box.classList.add('live');
  setUnread(0);
  count();
  if (still()) play();

  // Once 30% of the chat is on screen: the í asks for help and the chat
  // starts. The chat, not the whole sorter: stacked, the sorter is over
  // 1100px tall, and 30% of it never fits on a landscape phone (320px). The
  // chat is under 460px, so 30% of it fits on any screen.
  new IntersectionObserver(([entry]) => {
    sorter.inView = entry.isIntersecting;
    if (sorter.seen || entry.intersectionRatio < 0.3) return;
    sorter.seen = true;
    buddy.say('help…', 1600);
    if (!still()) play();
  }, { threshold: [0, 0.3] }).observe(chat);

  button.addEventListener('click', () => {
    if (sorter.busy) return;
    if (sorter.sorted) reset();
    else sort();
  });
  iEl.addEventListener('click', () => {
    if (sorter.busy) return;
    if (sorter.sorted) buddy.act('cheeky', 1500, 'much better.');
    else buddy.act('sad', 1500, 'press the button 🥺');
  });
  // The ticks in the panel (shopping and tasks; calendar events have none).
  box.addEventListener('click', (e) => {
    const tk = e.target.closest('.tk');
    if (!tk) return;
    const done = tk.closest('.row').classList.toggle('done');
    tk.setAttribute('aria-pressed', String(done));
    if (done && !still()) {
      const r = tk.getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top + r.height / 2, 10);
    }
  });

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

// The í and the letters are drawn on different scales, so its trainers would
// not land on the letters' line by themselves. Measure both pairs as drawn and
// move the í (by transform, so nothing else in the row moves) until they do.
function standInLine(row, i) {
  const letterShoe = row.querySelector('.cl .legs ellipse[stroke]');
  const iShoe = i.querySelector(`ellipse[fill="${TEAL}"]`);
  const svg = i.querySelector('svg');
  if (!letterShoe || !iShoe || !svg) return;
  const middle = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
  const dy = middle(letterShoe) - middle(iShoe);
  if (Number.isFinite(dy)) svg.style.transform = `translateY(${dy.toFixed(1)}px)`;
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
      standInLine(row, i);
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

// ---------- Everyone knows what's theirs: pick a person, see their week ----------

// What each letter says when picked.
const FAMILY_LINES = { Maria: 'parents’ evening, don’t let me forget', George: 'bins are mine today', Sofia: 'football on saturday!!' };

export function setupFamily() {
  const section = document.getElementById('fam');
  if (!section) return;
  const tabs = [...section.querySelectorAll('.who-tabs button')];
  const members = [...section.querySelectorAll('.member')];
  const items = [...section.querySelectorAll('.wk')];
  const title = document.getElementById('week-title');
  let picked = 'Everyone';

  function pick(who) {
    picked = who;
    const one = who !== 'Everyone';
    for (const b of tabs) b.setAttribute('aria-pressed', String(b.dataset.who === who));
    // Everyone's own items stay lit whoever is picked.
    for (const w of items) w.classList.toggle('off', one && w.dataset.who !== who && w.dataset.who !== 'Everyone');
    for (const m of members) {
      m.classList.toggle('dim', one && m.dataset.who !== who);
      m.setAttribute('aria-pressed', String(m.dataset.who === who));
    }
    title.textContent = one ? who + '’s week' : 'This week, everyone';
    // Only the one picked speaks: anyone else's line goes at once (and back
    // to everyone, the last one's goes too).
    for (const el of members) {
      if (el.dataset.who === who) continue;
      const say = el.querySelector('.say');
      clearTimeout(say._timer);
      say.classList.remove('show');
    }
    const m = members.find((el) => el.dataset.who === who);
    if (!m) return;
    hop(m.querySelector('.ch'));
    const say = m.querySelector('.say');
    say.textContent = FAMILY_LINES[who];
    say.classList.add('show');
    clearTimeout(say._timer);
    say._timer = setTimeout(() => say.classList.remove('show'), 1800);
  }

  for (const b of tabs) b.addEventListener('click', () => pick(b.dataset.who));
  // The picked letter again goes back to everyone.
  for (const m of members) m.addEventListener('click', () => pick(picked === m.dataset.who ? 'Everyone' : m.dataset.who));

  fontsReady().then(() => {
    for (const ch of section.querySelectorAll('.member .ch')) {
      ch.innerHTML = letterSvg(ch.dataset.letter);
      dressLetter(ch, ch.dataset.colour);
    }
    startLooking();
  });
}

setupHero();
setupSorter();
setupCta();
setupFamily();
