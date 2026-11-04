// Every page of the new site, for the checks that run over all of them.
// Each task appends the pages it builds: { path, file, kind, pose?, prop? }.
export const PAGES = [
  { path: '/privacy', file: 'privacy.html', kind: 'legal' },
  { path: '/terms', file: 'terms.html', kind: 'legal' },
  { path: '/delete-account', file: 'delete-account.html', kind: 'legal' },
];

// The inline script at the top of every page's <head>. It picks day or night
// before anything is drawn, so a page never flashes the wrong colours, and
// marks the page as scripted so the switch and the rise-ins can show.
export const BOOT = `<script>(function(d){var t;try{t=localStorage.getItem('mazi-theme')}catch(e){}if(t!=='day'&&t!=='night')t=matchMedia('(prefers-color-scheme: dark)').matches?'night':'day';d.dataset.theme=t;d.classList.add('js')})(document.documentElement)</script>`;
