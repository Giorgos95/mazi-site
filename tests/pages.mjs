// Every page of the new site, for the checks that run over all of them.
// Each task appends the pages it builds: { path, file, kind, pose?, prop? }.
export const PAGES = [
  { path: '/privacy', file: 'privacy.html', kind: 'legal' },
  { path: '/terms', file: 'terms.html', kind: 'legal' },
  { path: '/delete-account', file: 'delete-account.html', kind: 'legal' },
  { path: '/shopping-list', file: 'shopping-list.html', kind: 'feature', pose: 'push', prop: 'trolley' },
  { path: '/chores', file: 'chores.html', kind: 'feature', pose: 'strain', prop: 'tower' },
  { path: '/meal-planner', file: 'meal-planner.html', kind: 'feature', pose: 'stir', prop: 'pot' },
  { path: '/family-calendar', file: 'family-calendar.html', kind: 'feature', pose: 'awake', prop: 'thoughts' },
  { path: '/faq', file: 'faq.html', kind: 'faq', pose: 'surprised' },
  { path: '/cozi-alternative', file: 'cozi-alternative.html', kind: 'compare', pose: 'cheeky' },
  { path: '/join', file: 'join.html', kind: 'join', pose: 'wave' },
  { path: '/tiktok', file: 'tiktok.html', kind: 'tiktok', pose: 'wave' },
  { path: '/nope/deeper', file: '404.html', kind: '404', pose: 'dizzy' },
  { path: '/', file: 'index.html', kind: 'home' },
];

// The inline script at the top of every page's <head>. It picks day, or
// night if the visitor chose it with the switch, before anything is drawn,
// so a page never flashes the wrong colours, and marks the page as scripted
// so the switch and the rise-ins can show. The system's dark setting plays
// no part: every page opens in day until the visitor picks night.
export const BOOT = `<script>(function(d){var t;try{t=localStorage.getItem('mazi-theme')}catch(e){}d.dataset.theme=t==='night'?'night':'day';d.classList.add('js')})(document.documentElement)</script>`;

// A visitor who picked night on an earlier visit: the page reads 'night' as
// the stored choice. Only this tab sees it, so nothing needs clearing after.
export const PICKED_NIGHT = `(() => { const get = Storage.prototype.getItem; Storage.prototype.getItem = function (key) { return key === 'mazi-theme' ? 'night' : get.call(this, key); }; })()`;
