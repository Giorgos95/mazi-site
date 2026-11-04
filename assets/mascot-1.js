// The í, the letter family and the props they carry, drawn the way the
// TikToks draw them (the geometry is mazi-promo/src/mascot/figure.ts). Every
// page that has a mascot draws it through this file, so a pose or a face
// changes in one place.
//
// Like the stylesheet, the name carries a number: a change that must reach
// every visitor at once goes in a new file, mascot-2.js.

// ---------- Constants ----------

export const INK = '#1F2D3A';
export const TEAL = '#12B3A6';
export const CHEEK = '#FF8FA3';
const TEAR = '#74C0FC';

// The family, as the app shows it.
export const MEMBER_COLOURS = { George: '#3B5BDB', Maria: '#E64980', Sofia: '#E8590C' };

export const POSE_NAMES = ['idle', 'wave', 'joy', 'cheeky', 'surprised', 'sleepy', 'phone', 'strain', 'sad', 'push', 'stir', 'awake', 'dizzy'];

// What the í says, in turn, when someone taps it.
export const DEFAULT_REACTIONS = [['joy', 'hi! 👋'], ['cheeky', 'hehe'], ['surprised', 'oh! you again']];

// ---------- Drawing the í ----------

// An arm is a shoulder, a bend and a hand; dot is whether the hand is drawn.
const A = (s, b, h, dot = true) => ({ s, b, h, dot });
const DL = A([87, 144], [80, 156], [80, 170]);
const DR = A([133, 144], [140, 156], [140, 170]);
const POSES = {
  idle: { face: 'smile', l: DL, r: DR },
  wave: { face: 'smile', l: DL, r: A([133, 140], [151, 126], [155, 104]), wave: true },
  joy: { face: 'joy', l: A([87, 138], [70, 126], [64, 104]), r: A([133, 138], [150, 126], [156, 104]) },
  cheeky: { face: 'cheeky', l: A([87, 138], [50, 154], [87, 170], false), r: A([133, 138], [170, 154], [133, 170], false) },
  surprised: { face: 'surprised', l: A([87, 140], [60, 132], [58, 108]), r: A([133, 140], [160, 132], [162, 108]) },
  sleepy: { face: 'sleepy', l: DL, r: DR },
  phone: { face: 'down', l: A([87, 146], [88, 158], [96, 162], false), r: A([133, 146], [132, 158], [124, 162], false), phone: true },
  strain: { face: 'strain', l: A([87, 140], [56, 90], [67, 22]), r: A([133, 140], [164, 90], [153, 22]) },
  sad: { face: 'sad', l: A([87, 142], [78, 158], [76, 176]), r: A([133, 142], [142, 158], [144, 176]) },
  push: { face: 'joy', l: A([87, 150], [120, 166], [150, 170]), r: A([133, 150], [160, 160], [186, 168]) },
  stir: { face: 'smile', l: DL, r: A([133, 146], [168, 150], [190, 170]) },
  awake: { face: 'awake', l: A([87, 142], [78, 156], [96, 152]), r: A([133, 142], [142, 156], [124, 152]) },
  dizzy: { face: 'dizzy', l: A([87, 142], [62, 152], [52, 134]), r: A([133, 142], [158, 152], [168, 134]) },
};

const ln = (d, w = 3.5) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const so = (d, f = INK) => `<path d="${d}" fill="${f}"/>`;
const cheeks = `<ellipse cx="94" cy="120" rx="5.5" ry="3.5" fill="${CHEEK}" opacity=".75"/><ellipse cx="126" cy="120" rx="5.5" ry="3.5" fill="${CHEEK}" opacity=".75"/>`;
// Open eyes sit in two groups: .look moves them toward the pointer and .blink
// squashes them now and then (the stylesheet animates it).
const eyes = (y, ry, gdx, gy) => `<g class="look"><g class="blink"><ellipse cx="101" cy="${y}" rx="5.5" ry="${ry}" fill="${INK}"/><ellipse cx="119" cy="${y}" rx="5.5" ry="${ry}" fill="${INK}"/><circle cx="${101 + gdx}" cy="${gy}" r="2.1" fill="#fff"/><circle cx="${119 + gdx}" cy="${gy}" r="2.1" fill="#fff"/></g></g>`;
const drop = (d) => `<path d="${d}" fill="${TEAR}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;

const FACES = {
  smile: () => eyes(106, 7.5, 2, 103) + cheeks + so('M102 119 H118 Q118 130 110 130 Q102 130 102 119 Z'),
  // The happy eyes are closed arcs, but they sit in .look too, so even a í
  // that is pushing a trolley still leans its face toward the pointer.
  joy: () => `<g class="look">${ln('M95 108 Q101 100 107 108 M113 108 Q119 100 125 108', 4)}</g>` + cheeks + so('M101 118 H119 Q119 131 110 131 Q101 131 101 118 Z') + so('M104.5 126.5 Q110 122.5 115.5 126.5 Q113 130 110 130 Q107 130 104.5 126.5 Z', '#FF6B81'),
  cheeky: () => `<g class="look"><g class="blink">${so('M94 108 H108 A7 7 0 0 1 94 108 Z')}${so('M112 108 H126 A7 7 0 0 1 112 108 Z')}</g></g>` + ln('M93 100 L108 101 M112 97 Q119 90 127 95') + cheeks + ln('M103 126 Q112 130 119 121'),
  surprised: () => ln('M94 94 Q100 89 106 93 M114 93 Q120 89 126 94') + eyes(106, 8.5, 2, 102.5) + cheeks + `<ellipse cx="110" cy="125" rx="4.5" ry="5.5" fill="${INK}"/>`,
  sleepy: () => ln('M95 107 H106 M114 107 H125', 4) + cheeks + ln('M106 122 Q110 125 114 122'),
  down: () => eyes(108, 7, 1, 111.5) + cheeks + ln('M105 123 Q110 127 115 123'),
  strain: () => ln('M95 101 L104 106 L95 111 M125 101 L116 106 L125 111') + cheeks + `<ellipse cx="110" cy="125" rx="5" ry="4.5" fill="${INK}"/>` + drop('M141 82 Q146.5 91 141 96 Q135.5 91 141 82 Z'),
  sad: () => ln('M94 99 L105 95 M115 95 L126 99') + eyes(109, 7, 1.5, 112) + cheeks + ln('M103 127 Q110 121 117 127') + drop('M128 113 Q132.5 120.5 128 124 Q123.5 120.5 128 113 Z'),
  awake: () => `<g class="look"><g class="blink"><ellipse cx="101" cy="107" rx="6.5" ry="8" fill="${INK}"/><ellipse cx="119" cy="107" rx="6.5" ry="8" fill="${INK}"/><circle cx="103" cy="104" r="2.4" fill="#fff"/><circle cx="121" cy="104" r="2.4" fill="#fff"/></g></g><path d="M95 118.5 Q101 121.5 107 118.5 M113 118.5 Q119 121.5 125 118.5" fill="none" stroke="${INK}" stroke-width="2.5" opacity=".45" stroke-linecap="round"/>` + ln('M105 127 H115'),
  // Ring eyes with the pupils off-centre, and a wobbly mouth.
  dizzy: () => `<circle cx="101" cy="107" r="5.5" fill="none" stroke="${INK}" stroke-width="3"/><circle cx="119" cy="107" r="5.5" fill="none" stroke="${INK}" stroke-width="3"/><circle cx="102.5" cy="108.5" r="1.8" fill="${INK}"/><circle cx="117.5" cy="105.5" r="1.8" fill="${INK}"/>` + cheeks + ln('M103 125 Q106.5 121.5 110 125 Q113.5 128.5 117 125'),
};

const armSvg = (a, cls) => `<g class="${cls}"><path d="M${a.s} Q${a.b} ${a.h}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>${a.dot ? `<circle cx="${a.h[0]}" cy="${a.h[1]}" r="6" fill="${INK}"/>` : ''}</g>`;
const legs = `<path d="M100 198 L98 216 M120 198 L122 216" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><ellipse cx="94" cy="221" rx="12" ry="6.5" fill="${TEAL}" stroke="${INK}" stroke-width="3.5"/><ellipse cx="126" cy="221" rx="12" ry="6.5" fill="${TEAL}" stroke="${INK}" stroke-width="3.5"/>`;

export function iSvg(pose) {
  if (!Object.hasOwn(POSES, pose)) throw new Error('unknown pose: ' + pose);
  const p = POSES[pose];
  const arms = armSvg(p.l, 'arm-l') + armSvg(p.r, p.wave ? 'arm-wave' : 'arm-r');
  const phone = p.phone ? `<rect x="94" y="136" width="32" height="50" rx="7" fill="${TEAL}" stroke="${INK}" stroke-width="4.5"/><circle cx="102" cy="145" r="3" fill="${INK}"/>` : '';
  const sparkles = p.face === 'joy' ? `<path d="M70 70 L79 77 M64 87 L75 88 M150 74 L142 80 M156 90 L145 91" fill="none" stroke="${TEAL}" stroke-width="4" stroke-linecap="round"/>` : '';
  // With a phone the arms are drawn over it, holding it; otherwise behind the body.
  return `<svg viewBox="0 0 220 240" aria-hidden="true"><ellipse cx="110" cy="230" rx="60" ry="6" fill="#000" opacity=".1"/>${legs}${sparkles}${p.phone ? '' : arms}<rect x="112" y="30" width="18" height="46" rx="9" fill="#fff" stroke="${INK}" stroke-width="5" transform="rotate(35 121 53)"/><rect x="86" y="72" width="48" height="130" rx="24" fill="#fff" stroke="${INK}" stroke-width="5"/>${FACES[p.face]()}${p.phone ? phone + arms : ''}</svg>`;
}

// ---------- The letters ----------

// A letter in Fredoka, with empty groups for the legs and face that
// dressLetter fills in once it knows where the letter ended up.
export const letterSvg = (ch) => `<svg viewBox="0 0 140 190" aria-hidden="true"><g class="legs"></g><text x="70" y="150" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif" font-weight="600" font-size="150" fill="#fff" stroke="${INK}" stroke-width="9" stroke-linejoin="round" paint-order="stroke">${ch}</text><g class="lface"></g></svg>`;

// Gives a letter legs and a face, measured from the letter as drawn, so it
// works the same in Fredoka and in the fallback font. If the browser can't
// measure the text (or there is nothing to measure) the letter stays as it is.
export function dressLetter(box, colour) {
  const svg = box.querySelector('svg');
  const text = svg?.querySelector('text');
  if (!text) return;
  let bb;
  try { bb = text.getBBox(); } catch { return; }
  if (!bb.width) return;
  const cx = bb.x + bb.width / 2;
  const bottom = Math.min(bb.y + bb.height, 156);
  const ey = bb.y + bb.height * 0.4;
  const lx = Math.min(bb.width * 0.24, 20);
  svg.querySelector('.legs').innerHTML = `<ellipse cx="${cx}" cy="${bottom + 24}" rx="44" ry="5" fill="#000" opacity=".1"/><path d="M${cx - lx} ${bottom - 3} L${cx - lx - 1} ${bottom + 12} M${cx + lx} ${bottom - 3} L${cx + lx + 1} ${bottom + 12}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><ellipse cx="${cx - lx - 5}" cy="${bottom + 16}" rx="11" ry="6" fill="${colour}" stroke="${INK}" stroke-width="3.5"/><ellipse cx="${cx + lx + 5}" cy="${bottom + 16}" rx="11" ry="6" fill="${colour}" stroke="${INK}" stroke-width="3.5"/>`;
  svg.querySelector('.lface').innerHTML = `<g class="look"><g class="blink" style="transform-origin:${cx}px ${ey}px; animation-delay:${(-Math.random() * 4).toFixed(2)}s"><ellipse cx="${cx - 9}" cy="${ey}" rx="4.6" ry="6" fill="${INK}"/><ellipse cx="${cx + 9}" cy="${ey}" rx="4.6" ry="6" fill="${INK}"/><circle cx="${cx - 7.4}" cy="${ey - 2.4}" r="1.8" fill="#fff"/><circle cx="${cx + 10.6}" cy="${ey - 2.4}" r="1.8" fill="#fff"/></g></g><ellipse cx="${cx - 17}" cy="${ey + 11}" rx="5" ry="3.2" fill="${CHEEK}" opacity=".75"/><ellipse cx="${cx + 17}" cy="${ey + 11}" rx="5" ry="3.2" fill="${CHEEK}" opacity=".75"/><path d="M${cx - 5} ${ey + 11} Q${cx} ${ey + 16} ${cx + 5} ${ey + 11}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  // Where the eyes are, for the pointer tracking below.
  box.dataset.ex = (cx / 140).toFixed(3);
  box.dataset.ey = (ey / 190).toFixed(3);
  box.dataset.max = '2.6';
}

// ---------- Props ----------

const PROPS = {
  trolley: `<svg class="prop" style="left: 168px; bottom: 26px; width: 96px;" viewBox="-14 -10 84 76" aria-hidden="true"><g stroke="${INK}" stroke-width="3.5" fill="none" stroke-linejoin="round" stroke-linecap="round"><path d="M-10 0 H6 L14 44 H58 L66 12 H10" fill="#fff"/><circle cx="22" cy="56" r="6" fill="${INK}"/><circle cx="52" cy="56" r="6" fill="${INK}"/><rect x="18" y="-4" width="12" height="18" rx="3" fill="#FFD43B"/><rect x="34" y="0" width="14" height="14" rx="3" fill="#74C0FC"/><rect x="50" y="-2" width="10" height="16" rx="3" fill="${CHEEK}"/></g></svg>`,
  tower: `<svg class="prop tower" style="left: 58px; bottom: 196px; width: 118px;" viewBox="0 0 118 96" aria-hidden="true"><g stroke="${INK}" stroke-width="3" stroke-linejoin="round"><rect x="6" y="62" width="106" height="30" rx="9" fill="#fff"/><rect x="14" y="32" width="92" height="30" rx="9" fill="#fff"/><rect x="2" y="2" width="100" height="30" rx="9" fill="#fff"/></g><g font-family="Fredoka, system-ui, sans-serif" font-weight="600" font-size="11" fill="${INK}"><text x="16" y="82">🗑 bins</text><text x="24" y="52">🐕 feed the dog</text><text x="12" y="22">🧹 hoover</text></g></svg>`,
  pot: `<svg class="prop" style="left: 176px; bottom: 26px; width: 92px;" viewBox="0 -40 92 110" aria-hidden="true"><path class="steam" d="M30 -4 q-7 -9 0 -18 q7 -9 0 -18" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path class="steam" style="animation-delay:-1.2s" d="M56 -4 q-7 -9 0 -18 q7 -9 0 -18" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><g stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"><rect x="4" y="4" width="84" height="12" rx="6" fill="#F28C6B"/><path d="M10 16 H82 V52 Q82 66 68 66 H24 Q10 66 10 52 Z" fill="#F28C6B"/><rect x="38" y="-4" width="16" height="8" rx="4" fill="${INK}"/></g></svg>`,
  thoughts: `<div class="thought" aria-hidden="true" style="left: 22px; top: 178px;">⚽</div><div class="thought" aria-hidden="true" style="left: 96px; top: 138px; animation-delay: -1s;">🦷</div><div class="thought" aria-hidden="true" style="left: 172px; top: 180px; animation-delay: -2s;">🎂</div>`,
};

export function propHtml(name) {
  if (!Object.hasOwn(PROPS, name)) throw new Error('unknown prop: ' + name);
  return PROPS[name];
}

// ---------- Buddy: an í that can change pose and speak ----------

const hop = (el) => { el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); };

export class Buddy {
  constructor(el, base, bubble = null) {
    this.el = el;
    this.base = base;
    this.bubble = bubble;
    this.pose = base;
    this.timer = 0;
    this.set(base);
  }

  set(pose) {
    const svg = iSvg(pose); // throws on an unknown pose, before anything is removed
    this.pose = pose;
    this.el.dataset.pose = pose;
    this.el.querySelector('svg')?.remove();
    this.el.insertAdjacentHTML('beforeend', svg);
    // Keep the bubble last, so it paints over the í.
    if (this.bubble && this.bubble.parentNode === this.el) this.el.append(this.bubble);
    queueLook();
  }

  // Strikes a pose with a hop (and a few words), then goes back to the base.
  act(pose, ms = 1600, text) {
    clearTimeout(this.timer);
    this.set(pose);
    hop(this.el);
    if (text) this.say(text, ms);
    this.timer = setTimeout(() => this.set(this.base), ms);
  }

  say(text, ms = 1800) {
    const b = this.bubble;
    if (!b) return;
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(b._timer);
    b._timer = setTimeout(() => b.classList.remove('show'), ms);
  }
}

// ---------- Eyes that follow the pointer ----------

let px = null;
let py = null;
let frame = 0;
let looking = false;

function trackLooks() {
  frame = 0;
  if (px === null) return;
  for (const el of document.querySelectorAll('[data-looker]')) {
    const g = el.querySelector('.look');
    if (!g) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || !r.width) continue;
    const ex = r.left + r.width * (+el.dataset.ex || 0.5);
    const ey = r.top + r.height * (+el.dataset.ey || 0.44);
    const dx = px - ex;
    const dy = py - ey;
    const d = Math.hypot(dx, dy) || 1;
    // Full reach once the pointer is 160px away; nearer, the eyes ease back to the middle.
    const m = Math.min(1, d / 160) * (+el.dataset.max || 3.2);
    g.setAttribute('transform', `translate(${((dx / d) * m).toFixed(2)} ${((dy / d) * m).toFixed(2)})`);
  }
}

// One update per frame, however many events arrive.
function queueLook() {
  if (!frame) frame = requestAnimationFrame(trackLooks);
}

export function startLooking() {
  if (looking) return;
  looking = true;
  addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; queueLook(); }, { passive: true });
  // Scrolling moves the í under a still pointer.
  addEventListener('scroll', queueLook, { passive: true });
}

// ---------- Drawing every í on a page ----------

export function drawAll(root = document) {
  const buddies = [];
  for (const el of root.querySelectorAll('[data-i-pose]')) {
    const bubble = document.createElement('span');
    bubble.className = 'say';
    bubble.setAttribute('aria-hidden', 'true');
    el.append(bubble);
    const buddy = new Buddy(el, el.dataset.iPose, bubble);
    if (el.dataset.prop) el.parentElement?.insertAdjacentHTML('beforeend', propHtml(el.dataset.prop));
    let n = 0;
    el.addEventListener('click', () => {
      const [pose, text] = DEFAULT_REACTIONS[n++ % DEFAULT_REACTIONS.length];
      buddy.act(pose, 1600, text);
    });
    buddies.push(buddy);
  }
  startLooking();
  return buddies;
}
