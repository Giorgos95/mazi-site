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
  { path: '/join', file: 'join.html', kind: 'join', pose: 'wave' },
  { path: '/tiktok', file: 'tiktok.html', kind: 'tiktok', pose: 'wave' },
  { path: '/nope/deeper', file: '404.html', kind: '404', pose: 'dizzy' },
];

// The inline script at the top of every page's <head>. It picks day or night
// before anything is drawn, so a page never flashes the wrong colours, and
// marks the page as scripted so the switch and the rise-ins can show.
export const BOOT = `<script>(function(d){var t;try{t=localStorage.getItem('mazi-theme')}catch(e){}if(t!=='day'&&t!=='night')t=matchMedia('(prefers-color-scheme: dark)').matches?'night':'day';d.dataset.theme=t;d.classList.add('js')})(document.documentElement)</script>`;
